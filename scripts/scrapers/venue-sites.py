#!/usr/bin/env python3
"""
Venue Website Scraper for The Active Owl
Scrapes configured venue event pages and extracts event data.
Writes staged results to data/staging/venue-sites-{date}.json

No API key required. Reads venue targets from venue-targets.json.
"""

import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime
from html.parser import HTMLParser

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
APP_DIR      = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))
TARGETS_PATH = os.path.join(SCRIPT_DIR, 'venue-targets.json')
STAGING_DIR  = os.path.join(APP_DIR, 'data', 'staging')
os.makedirs(STAGING_DIR, exist_ok=True)

# ── Venue Targets ─────────────────────────────────────────────────────────────
# Loaded from venue-targets.json — add new venues there, not here.
try:
    with open(TARGETS_PATH) as f:
        TARGETS = json.load(f)
except FileNotFoundError:
    print(f'ERROR: venue-targets.json not found at {TARGETS_PATH}')
    sys.exit(1)

# ── HTML Text Extractor ───────────────────────────────────────────────────────
class TextExtractor(HTMLParser):
    """Strips HTML tags and returns clean text."""
    def __init__(self):
        super().__init__()
        self.chunks = []
        self._skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'nav', 'footer', 'header'):
            self._skip = True

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'nav', 'footer', 'header'):
            self._skip = False

    def handle_data(self, data):
        if not self._skip:
            stripped = data.strip()
            if stripped:
                self.chunks.append(stripped)

    def get_text(self):
        return '\n'.join(self.chunks)

def fetch_page(url, timeout=15):
    """Fetch a URL and return the HTML body as a string."""
    req = urllib.request.Request(
        url,
        headers={'User-Agent': 'Mozilla/5.0 (compatible; TheActiveOwlBot/1.0)'}
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            charset = 'utf-8'
            content_type = response.headers.get('Content-Type', '')
            if 'charset=' in content_type:
                charset = content_type.split('charset=')[-1].strip()
            return response.read().decode(charset, errors='replace')
    except urllib.error.HTTPError as e:
        print(f'  HTTP {e.code} fetching {url}')
    except urllib.error.URLError as e:
        print(f'  URL error fetching {url}: {e.reason}')
    except Exception as e:
        print(f'  Error fetching {url}: {e}')
    return None

# ── Date / Time Patterns ──────────────────────────────────────────────────────
MONTH_MAP = {
    'january':1,'february':2,'march':3,'april':4,'may':5,'june':6,
    'july':7,'august':8,'september':9,'october':10,'november':11,'december':12,
    'jan':1,'feb':2,'mar':3,'apr':4,'jun':6,'jul':7,'aug':8,
    'sep':9,'oct':10,'nov':11,'dec':12,
}

# Matches: "March 14", "Mar 14", "14 March", "03/14", "3/14/2026"
DATE_PATTERNS = [
    re.compile(r'(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)[,.\s]+(\d{1,2})(?:[,\s]+(\d{4}))?', re.IGNORECASE),
    re.compile(r'(\d{1,2})[/\-](\d{1,2})(?:[/\-](\d{2,4}))?'),
]

# Matches: "7:30 PM", "7PM", "19:30", "7:30pm"
TIME_PATTERN = re.compile(r'\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)\b')

# Ticket URL indicators
TICKET_PATTERNS = [
    re.compile(r'href=["\']([^"\']*(?:eventbrite|ticketmaster|tix\.com|etix|universe\.com|showclix|ticketweb)[^"\']*)["\']', re.IGNORECASE),
    re.compile(r'href=["\']([^"\']*(?:ticket|buy|register|rsvp)[^"\']*)["\']', re.IGNORECASE),
]

def extract_ticket_url(html, base_url):
    """Try to find a ticket purchase link in the HTML."""
    for pattern in TICKET_PATTERNS:
        match = pattern.search(html)
        if match:
            href = match.group(1)
            if href.startswith('http'):
                return href
            if href.startswith('/'):
                from urllib.parse import urlparse
                parsed = urlparse(base_url)
                return f'{parsed.scheme}://{parsed.netloc}{href}'
    return None

def parse_date_from_text(text):
    """Try to extract a date string (YYYY-MM-DD) from a text block."""
    now = datetime.now()
    year = now.year

    for m in DATE_PATTERNS[0].finditer(text):
        month_str = m.group(1).lower()
        day = int(m.group(2))
        yr  = int(m.group(3)) if m.group(3) else year
        if yr < 100:
            yr += 2000
        month = MONTH_MAP.get(month_str)
        if month:
            try:
                dt = datetime(yr, month, day)
                if dt >= datetime(now.year, now.month, now.day):
                    return dt.strftime('%Y-%m-%d')
            except ValueError:
                pass

    return None

def parse_time_from_text(text):
    """Try to extract a 24h time string (HH:MM) from a text block."""
    m = TIME_PATTERN.search(text)
    if m:
        h = int(m.group(1))
        mins = int(m.group(2)) if m.group(2) else 0
        ampm = m.group(3).lower()
        if ampm == 'pm' and h != 12:
            h += 12
        elif ampm == 'am' and h == 12:
            h = 0
        return f'{h:02d}:{mins:02d}'
    return None

def extract_events_from_text(text, target, html):
    """
    Generic event extractor. Splits text into chunks and looks for
    date + event name patterns near each other.
    """
    events = []
    lines = [l.strip() for l in text.split('\n') if l.strip()]

    i = 0
    while i < len(lines):
        line = lines[i]
        date_str = parse_date_from_text(line)
        if date_str:
            # Look ahead up to 5 lines for an event name and time
            window = lines[i:i+6]
            combined = ' '.join(window)
            time_str = parse_time_from_text(combined)

            # The "name" is usually on the line right after the date, or the date line itself
            name_line = ''
            for j in range(1, min(4, len(window))):
                if window[j] and not parse_date_from_text(window[j]) and len(window[j]) > 3:
                    name_line = window[j]
                    break

            if not name_line:
                name_line = line  # fallback: use the date line itself if it has text beyond the date

            # Clean name — strip the date portion
            name_clean = re.sub(r'(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)[,.\s]+\d{1,2}[,.\s]*(\d{4})?', '', name_line, flags=re.IGNORECASE).strip(' ,.-')
            name_clean = name_clean[:80].strip()

            if name_clean and len(name_clean) > 3:
                ticket_url = extract_ticket_url(html, target['url'])
                events.append({
                    'source':       'venue-site',
                    'sourceUrl':    target['url'],
                    'cityId':       target['cityId'],
                    'venueId':      target['venueId'],
                    'venueName':    target['venueName'],
                    'name':         name_clean,
                    'description':  f'{name_clean} at {target["venueName"]}.',
                    'category':     target.get('defaultCategory', 'live-music'),
                    'vibe':         target.get('defaultVibe', []),
                    'cover':        'Varies',
                    'ticketUrl':    ticket_url,
                    'oneTime':      { 'date': date_str, 'time': time_str or '20:00', 'duration': 120 },
                    'recurring':    None,
                    'timeOfDay':    ['night'],
                    'ageRestriction': None,
                    'needsReview':  True,
                })
        i += 1

    return events

def scrape_target(target):
    print(f'  Scraping: {target["venueName"]} ({target["url"]})')
    html = fetch_page(target['url'])
    if not html:
        return []

    extractor = TextExtractor()
    extractor.feed(html)
    text = extractor.get_text()

    events = extract_events_from_text(text, target, html)
    print(f'    Found {len(events)} potential events')
    return events

def main():
    print(f'Venue site scraper starting — {datetime.now().strftime("%Y-%m-%d %H:%M")}')
    all_events = []

    for target in TARGETS:
        events = scrape_target(target)
        all_events.extend(events)
        time.sleep(1)  # polite delay between requests

    out_path = os.path.join(STAGING_DIR, f'venue-sites-{datetime.now().strftime("%Y-%m-%d")}.json')
    with open(out_path, 'w') as f:
        json.dump(all_events, f, indent=2)

    print(f'Done. {len(all_events)} potential events written to {out_path}')
    print(f'NOTE: venue-site events are marked needsReview:true — run merge.py to review before publishing.')

if __name__ == '__main__':
    main()
