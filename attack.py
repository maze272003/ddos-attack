# Professional HTTP Load Testing Tool
# For legitimate performance testing purposes only
# Requires explicit permission before testing any system

import argparse
import concurrent.futures
import random
import sys
import time
import requests
from colorama import init, Fore, Style
from urllib.parse import urlparse

# Initialize colorama
init(autoreset=True)

# Global statistics
total_stats = {
    'success': 0,
    'failure': 0,
    'start_time': time.time(),
    'total_bytes': 0
}

def verify_target(url):
    """Verify the target is appropriate for testing."""
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        print(f"{Fore.RED}Error: Invalid URL format{Style.RESET_ALL}")
        sys.exit(1)
    
    # Add any additional verification logic here
    return True

def create_session():
    """Create a configured requests Session with varied headers."""
    session = requests.Session()
    
    # Rotating user agents
    user_agents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Safari/605.1.15',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36'
    ]
    
    session.headers.update({
        'User-Agent': random.choice(user_agents),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    })
    
    # Configure connection pooling
    adapter = requests.adapters.HTTPAdapter(
        pool_connections=100,
        pool_maxsize=100,
        max_retries=3
    )
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    
    return session

def send_request(session, url):
    """Send an HTTP request with error handling."""
    try:
        with session.get(url, timeout=15, stream=True) as response:
            content_length = int(response.headers.get('Content-Length', 0))
            return (response.status_code, content_length)
    except requests.exceptions.RequestException as e:
        return (None, 0)

def run_test_wave(url, num_requests, max_workers):
    """Execute a batch of requests and collect statistics."""
    stats = {
        'success': 0,
        'failure': 0,
        'bytes': 0
    }

    with create_session() as session:
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [executor.submit(send_request, session, url) for _ in range(num_requests)]
            
            for future in concurrent.futures.as_completed(futures):
                status, content_length = future.result()
                
                if status and 200 <= status < 300:
                    stats['success'] += 1
                    stats['bytes'] += content_length
                else:
                    stats['failure'] += 1

                # Update global statistics
                total_stats['success'] = stats['success']
                total_stats['failure'] = stats['failure']
                total_stats['total_bytes'] += content_length
                
                # Real-time display
                display_stats(stats, total_stats)

    return stats

def display_stats(wave_stats, total_stats):
    """Display statistics in a formatted way."""
    elapsed = time.time() - total_stats['start_time']
    req_rate = (total_stats['success'] + total_stats['failure']) / elapsed if elapsed > 0 else 0
    
    success_color = Fore.GREEN if wave_stats['success'] > 0 else Fore.WHITE
    fail_color = Fore.RED if wave_stats['failure'] > 0 else Fore.WHITE
    
    sys.stdout.write(
        f"\rWave: {success_color}{wave_stats['success']} OK{Style.RESET_ALL} | "
        f"{fail_color}{wave_stats['failure']} Fail{Style.RESET_ALL} | "
        f"Total: {Fore.CYAN}{total_stats['success'] + total_stats['failure']}{Style.RESET_ALL} | "
        f"Rate: {Fore.YELLOW}{req_rate:.1f} req/s{Style.RESET_ALL} | "
        f"Data: {Fore.MAGENTA}{total_stats['total_bytes'] / (1024*1024):.2f} MB{Style.RESET_ALL}"
    )
    sys.stdout.flush()

def print_summary(total_stats):
    """Print final summary statistics."""
    elapsed = time.time() - total_stats['start_time']
    print(f"\n\n{Fore.CYAN}=== Test Summary ==={Style.RESET_ALL}")
    print(f"Total time: {elapsed:.2f} seconds")
    print(f"Total requests: {total_stats['success'] + total_stats['failure']}")
    print(f"Successful requests: {Fore.GREEN}{total_stats['success']}{Style.RESET_ALL}")
    print(f"Failed requests: {Fore.RED}{total_stats['failure']}{Style.RESET_ALL}")
    print(f"Request rate: {Fore.YELLOW}{(total_stats['success'] + total_stats['failure']) / elapsed:.1f} req/s{Style.RESET_ALL}")
    print(f"Total data transferred: {Fore.MAGENTA}{total_stats['total_bytes'] / (1024*1024):.2f} MB{Style.RESET_ALL}")

def main():
    """Main program execution."""
    parser = argparse.ArgumentParser(
        description='Professional HTTP Load Testing Tool',
        epilog='WARNING: Only use on systems you own or have explicit permission to test.',
        formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument('url', help='Target URL to test')
    parser.add_argument('-r', '--requests', type=int, default=500,
                      help='Requests per wave (default: 500)')
    parser.add_argument('-w', '--workers', type=int, default=100,
                      help='Concurrent workers (default: 100)')
    parser.add_argument('-t', '--time', type=int, default=0,
                      help='Duration to run (seconds, 0=continuous)')
    
    args = parser.parse_args()
    
    if not verify_target(args.url):
        sys.exit(1)
    
    print(f"{Fore.CYAN}Target URL:{Style.RESET_ALL} {args.url}")
    print(f"{Fore.CYAN}Requests per Wave:{Style.RESET_ALL} {args.requests}")
    print(f"{Fore.CYAN}Concurrent Workers:{Style.RESET_ALL} {args.workers}")
    print(f"{Fore.CYAN}Test Duration:{Style.RESET_ALL} {'Continuous' if args.time == 0 else f'{args.time} seconds'}")
    print(f"\n{Fore.YELLOW}Press CTRL+C to stop the test.{Style.RESET_ALL}")
    time.sleep(2)
    
    try:
        start_time = time.time()
        wave_count = 0
        
        while True:
            wave_count += 1
            print(f"\n{Fore.BLUE}=== Wave {wave_count} ==={Style.RESET_ALL}")
            
            wave_stats = run_test_wave(args.url, args.requests, args.workers)
            
            if args.time > 0 and (time.time() - start_time) >= args.time:
                break
                
            time.sleep(1)  # Brief pause between waves
            
    except KeyboardInterrupt:
        print(f"\n\n{Fore.RED}🛑 Test stopped by user.{Style.RESET_ALL}")
    
    print_summary(total_stats)

if __name__ == "__main__":
    main()