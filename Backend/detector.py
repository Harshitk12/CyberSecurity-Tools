# detector.py
import re
from urllib.parse import urlparse

# List of commonly abused URL shortening services
SHORT_DOMAINS = ['bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'url.cn', 'is.gd']

def analyze(url: str) -> list[str]:
    """
    Analyzes a given URL against a set of common phishing heuristics.
    Returns a list of identified security issues.
    """
    # Quick check for minimum validity
    if not url.startswith(('http://', 'https://')):
        return ["URL does not start with http:// or https:// (Malformed URL)"]
        
    p = urlparse(url)
    issues = []
    host = p.netloc.lower()
    
    # Heuristic 1: Check for lack of encryption
    if p.scheme != 'https':
        issues.append("No HTTPS (not encrypted, vulnerable to snooping)")
        
    # Heuristic 2: Check for direct numeric IP address usage (common in local or malicious testing)
    # The host might contain a port, so we split it first.
    host_part = host.split(':')[0]
    # Regex to match four octets
    if re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$', host_part):
        issues.append("Numeric IP used as host (hides true origin/domain)")
        
    # Heuristic 3: Check for very long path segments (used to obscure the true domain in phishing)
    if len(p.path) > 60:
        issues.append("Very long path/query (may hide details or be part of a malicious payload)")
        
    # Heuristic 4: Check for URL shorteners
    for s in SHORT_DOMAINS:
        if host.endswith(s):
            issues.append(f"URL shortener ({s}) used (true destination is hidden)")
            break
            
    # Heuristic 5: Check for Punycode (IDN homograph attacks)
    if 'xn--' in host:
        issues.append("Punycode/IDN found (possible homograph attack to spoof domain)")
        
    # Heuristic 6: Check for the '@' symbol in the URL (obfuscation)
    if "@" in url:
        issues.append("'@' found in URL (obfuscation attempt to confuse browser/user)")
        
    return issues

if __name__ == "__main__":
    # Comprehensive test cases to demonstrate all heuristics
    test_urls = [
        "https://www.google.com/search?q=safe",  # Expected: [] (Secure)
        "http://192.168.1.1/admin",              # Expected: No HTTPS, IP used
        "https://bit.ly/malicious-link",         # Expected: URL shortener
        "https://www.apple.com/a/b/c/d/" + "x"*70, # Expected: Very long path
        "https://www.google.com@login.com",      # Expected: @ found (obfuscation)
        "http://xn--80ahb2acj.xn--p1ai/",        # Expected: No HTTPS, Punycode
        "ftp://secure.data.com/file.zip"         # Expected: Malformed URL (scheme is not http/https)
    ]
    
    print("--- Running Heuristic Tests ---")
    for url in test_urls:
        issues = analyze(url)
        print(f"\nURL: {url}")
        if issues:
            print(f"STATUS: SUSPICIOUS ({len(issues)} issues)")
            for i in issues:
                print(f"  - {i}")
        else:
            print("STATUS: SECURE (No issues detected)")