#!/usr/bin/env node

// Advanced HTTP Load Testing Tool with Enhanced Success Rate
// For authorized testing only

import axios from 'axios';
import chalk from 'chalk';
import { Command } from 'commander';
import { URL } from 'url';
import https from 'https';
import http from 'http';

// Configuration
const DEFAULT_CONCURRENCY = 10;
const DEFAULT_TIMEOUT = 10000; // 10 seconds
const WARMUP_REQUESTS = 5;
const RETRY_ATTEMPTS = 2;
const STATS_INTERVAL = 2000; // Update stats every 2 seconds

// Global stats
const stats = {
    startTime: Date.now(),
    success: 0,
    failure: 0,
    bytes: 0,
    statusCodes: {},
    latency: { min: Infinity, max: 0, sum: 0 },
    lastUpdate: Date.now()
};

// Enhanced request with better error handling
async function sendEnhancedRequest(url, timeout) {
    const start = process.hrtime.bigint();
    let attempt = 0;
    let lastError = null;

    // Create a persistent agent for connection reuse
    const agent = new https.Agent({
        keepAlive: true,
        maxSockets: 50,
        rejectUnauthorized: false // For testing purposes only
    });

    while (attempt <= RETRY_ATTEMPTS) {
        attempt++;
        try {
            const response = await axios.get(url, {
                httpsAgent: agent,
                timeout: timeout,
                headers: getEnhancedHeaders(),
                validateStatus: () => true, // Capture all status codes
                decompress: true // Handle compressed responses
            });

            const end = process.hrtime.bigint();
            const latency = Number(end - start) / 1e6; // ms
            const contentLength = response.headers['content-length'] ||
                                        (response.data ? Buffer.byteLength(JSON.stringify(response.data)) : 0);

            return {
                status: response.status,
                bytes: contentLength,
                latency: latency,
                error: null
            };
        } catch (err) {
            lastError = err;
            if (attempt <= RETRY_ATTEMPTS) {
                await new Promise(r => setTimeout(r, 200 * attempt)); // Backoff
            }
        }
    }

    const end = process.hrtime.bigint();
    const latency = Number(end - start) / 1e6;

    return {
        status: null,
        bytes: 0,
        latency: latency,
        error: parseError(lastError)
    };
}

function parseError(err) {
    if (axios.isAxiosError(err)) {
        if (err.code === 'ECONNABORTED') return 'Timeout';
        if (err.code === 'ECONNREFUSED') return 'Connection Refused';
        if (err.code === 'ENOTFOUND') return 'DNS Lookup Failed';
        if (err.response) return `HTTP ${err.response.status}`;
        return `Network Error (${err.code})`;
    }
    return err.message || 'Unknown Error';
}

function getEnhancedHeaders() {
    return {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    };
}

async function warmup(targetUrl, timeout) {
    console.log(chalk.gray('\nRunning warmup requests...'));
    let successes = 0;
    
    for (let i = 0; i < WARMUP_REQUESTS; i++) {
        try {
            const result = await sendEnhancedRequest(targetUrl, timeout);
            if (result.status >= 200 && result.status < 300) {
                successes++;
            }
            process.stdout.write(`\rWarmup: ${i+1}/${WARMUP_REQUESTS} completed`);
        } catch (err) {
            console.error(chalk.red(`\nWarmup error: ${err.message}`));
        }
    }
    
    console.log(chalk.gray(`\nWarmup complete: ${successes}/${WARMUP_REQUESTS} successful`));
    return successes > 0;
}

async function runLoadTest(options) {
    const { url, rps, concurrency, timeout, duration } = options;
    let running = true;

    // Setup CTRL+C handler
    process.on('SIGINT', () => {
        console.log(chalk.yellow('\nStopping test...'));
        running = false;
    });

    // Stats display interval
    const statsInterval = setInterval(displayStats, STATS_INTERVAL);

    try {
        // Run warmup phase
        const warmupSuccess = await warmup(url, timeout);
        if (!warmupSuccess) {
            console.log(chalk.red('\nWarmup failed. Check target availability.'));
            return;
        }

        console.log(chalk.green('\nStarting load test...\n'));

        const startTime = Date.now();
        let lastBatchTime = startTime;

        while (running) {
            const now = Date.now();
            const elapsed = (now - startTime) / 1000;

            // Check duration limit
            if (duration > 0 && elapsed >= duration) {
                console.log(chalk.blue('\nTest duration reached'));
                break;
            }

            // Calculate target requests for this interval
            const targetRequests = Math.floor(elapsed * rps);
            const completedRequests = stats.success + stats.failure;
            const requestsToSend = Math.max(0, targetRequests - completedRequests);

            if (requestsToSend > 0) {
                const batchSize = Math.min(requestsToSend, concurrency);
                await sendBatch(url, batchSize, timeout);
            }

            // Throttle to maintain RPS
            const batchElapsed = now - lastBatchTime;
            const targetBatchTime = 1000; // Aim for 1 second batches
            if (batchElapsed < targetBatchTime) {
                await new Promise(r => setTimeout(r, targetBatchTime - batchElapsed));
            }
            lastBatchTime = Date.now();
        }
    } finally {
        clearInterval(statsInterval);
        printFinalStats();
    }
}

async function sendBatch(url, count, timeout) {
    const requests = [];
    for (let i = 0; i < count; i++) {
        requests.push(sendEnhancedRequest(url, timeout)
            .then(processResult)
            .catch(err => {
                console.error(chalk.red('Request error:'), err.message);
                return { status: null, bytes: 0, latency: 0, error: err.message };
            }));
    }
    return Promise.all(requests);
}

function processResult(result) {
    if (result.status >= 200 && result.status < 300) {
        stats.success++;
        stats.bytes += result.bytes;
        stats.latency.sum += result.latency;
        if (result.latency < stats.latency.min) stats.latency.min = result.latency;
        if (result.latency > stats.latency.max) stats.latency.max = result.latency;
    } else {
        stats.failure++;
        const statusKey = result.status || result.error;
        stats.statusCodes[statusKey] = (stats.statusCodes[statusKey] || 0) + 1;
    }
    return result;
}

function displayStats() {
    const elapsed = (Date.now() - stats.startTime) / 1000;
    const total = stats.success + stats.failure;
    const rate = total / elapsed;
    const avgLatency = stats.success > 0 ? (stats.latency.sum / stats.success).toFixed(2) : 0;

    process.stdout.write(
        `\r${chalk.green(`OK: ${stats.success}`)} | ` +
        `${chalk.red(`Fail: ${stats.failure}`)} | ` +
        `${chalk.cyan(`Rate: ${rate.toFixed(1)} req/s`)} | ` +
        `${chalk.yellow(`Latency: ${avgLatency}ms`)} | ` +
        `${chalk.magenta(`Data: ${formatBytes(stats.bytes)}`)}`
    );
}

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function printFinalStats() {
    const elapsed = (Date.now() - stats.startTime) / 1000;
    const total = stats.success + stats.failure;
    const successRate = total > 0 ? (stats.success / total * 100).toFixed(1) : 0;
    const avgRate = total / elapsed;
    const avgLatency = stats.success > 0 ? (stats.latency.sum / stats.success).toFixed(2) : 'N/A';

    console.log(`\n${chalk.bold.cyan('=== Test Summary ===')}`);
    console.log(`Duration: ${elapsed.toFixed(2)}s | Requests: ${total}`);
    console.log(`Success: ${chalk.green(stats.success)} (${successRate}%) | ` +
               `Failure: ${chalk.red(stats.failure)}`);
    console.log(`Request Rate: ${chalk.yellow(avgRate.toFixed(1))} req/s`);
    console.log(`Data Transferred: ${chalk.magenta(formatBytes(stats.bytes))}`);
    console.log(`Latency: avg ${chalk.blue(avgLatency)}ms | ` +
               `min ${chalk.blue(stats.latency.min !== Infinity ? stats.latency.min.toFixed(2) : 'N/A')}ms | ` +
               `max ${chalk.blue(stats.latency.max.toFixed(2))}ms`);

    if (Object.keys(stats.statusCodes).length > 0) {
        console.log(chalk.red('\nError Breakdown:'));
        for (const [code, count] of Object.entries(stats.statusCodes)) {
            console.log(`  ${chalk.red(code)}: ${count}`);
        }
    }
}

async function main() {
    const program = new Command();
    
    program
        .name('loadtest')
        .description('Enhanced HTTP load testing tool')
        .version('1.0.0')
        .argument('<url>', 'Target URL to test')
        .option('-r, --rps <number>', 'Target requests per second', parseFloat, 10)
        .option('-c, --concurrency <number>', 'Number of concurrent requests', parseInt, DEFAULT_CONCURRENCY)
        .option('-t, --timeout <ms>', 'Request timeout in milliseconds', parseInt, DEFAULT_TIMEOUT)
        .option('-d, --duration <seconds>', 'Test duration in seconds (0 for unlimited)', parseFloat, 0)
        .parse(process.argv);

    const opts = program.opts();
    const targetUrl = program.args[0];

    // Validate URL
    try {
        new URL(targetUrl);
    } catch (err) {
        console.error(chalk.red('❌ Invalid URL:'), err.message);
        process.exit(1);
    }

    // Display configuration
    console.log(chalk.bold('\n=== Test Configuration ==='));
    console.log(`Target URL: ${chalk.cyan(targetUrl)}`);
    console.log(`Duration: ${chalk.cyan(opts.duration > 0 ? `${opts.duration}s` : 'unlimited')}`);
    console.log(`Target RPS: ${chalk.cyan(opts.rps)}`);
    console.log(`Concurrency: ${chalk.cyan(opts.concurrency)}`);
    console.log(`Request Timeout: ${chalk.cyan(opts.timeout)}ms`);
    console.log(chalk.yellow('\nPress CTRL+C to stop the test.'));

    // Run the test
    try {
        await runLoadTest({
            url: targetUrl,
            rps: opts.rps,
            concurrency: opts.concurrency,
            timeout: opts.timeout,
            duration: opts.duration
        });
    } catch (err) {
        console.error(chalk.red('\nTest failed:'), err.message);
        process.exit(1);
    }
}

// Add this to package.json to avoid warning
// "type": "module"

main().catch(console.error);