"""
Simulated digital agents for POC: website reachability and phone format validation.
No real-time browsing or emailing; simple HTTP HEAD/GET and regex validation.
"""
import re
import urllib.request
import urllib.error
from typing import Optional

# Common country code -> regex for local format (simplified; POC only)
# E.164 allows +1 (US/CA), +44 (UK), etc. We validate basic format.
PHONE_E164_PATTERN = re.compile(r"^\+?[1-9]\d{1,14}$")
# Loose fallback: digits, spaces, dashes, parens
PHONE_LOOSE_PATTERN = re.compile(r"^[\d\s\-\(\)\+\.]{10,20}$")


def verify_website(url: Optional[str]) -> Optional[bool]:
    """
    Ping the extracted website URL; return True if 200 OK, False if unreachable, None if no URL.
    Simulated agent: no headless browser, just HTTP request.
    """
    if not url or not str(url).strip():
        return None
    url = str(url).strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "ShieldProcure-POC/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return 200 <= resp.status < 400
    except (urllib.error.URLError, OSError, ValueError, Exception):
        return False


def verify_phone(phone: Optional[str], country_code: Optional[str] = None) -> Optional[bool]:
    """
    Check if phone number format is valid. For POC we use E.164-like or loose format.
    country_code optional (e.g. "US", "UK"); not used for validation in POC, just for future use.
    Returns True if format looks valid, False if invalid, None if no phone.
    """
    if not phone or not str(phone).strip():
        return None
    s = re.sub(r"[\s\-\.]", "", str(phone).strip())
    if PHONE_E164_PATTERN.match(s):
        return True
    if PHONE_LOOSE_PATTERN.match(str(phone).strip()):
        return True
    return False
