#!/usr/bin/env python3
"""
Eventbrite Scraper for The Active Owl
Searches Eventbrite for events in each Active Owl city and writes
staged results to data/staging/eventbrite-{date}.json

Requires: EVENTBRITE_TOKEN in scripts/scrapers/config.json
API docs: https://www.eventbrite.com/platform/api
"""

import json
import os
import sys
import requests
from datetime import datetime, timezone

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
APP_DIR    = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))
CONFIG_PATH  = os.path.join(SCRIPT_DIR, 'config.json')
STAGING_DIR  = os.path.join(APP_DIR, 'data', 'staging')
os.makedirs(STAGING_DIR, exist_ok=True)

# ── Config ────────────────────────────────────────────────────────────────────
try:
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    TOKEN = config.get('eventbrite_token', '')
except FileNotFoundError:
    print('ERROR: config.json not found. Copy config.example.json and add your API keys.')
    sys.exit(1)

if not TOKEN:
    print('ERROR: eventbrite_token missing from config.json')
    sys.exit(1)

CITIES = [
    { 'id': 'delray-beach',    'name': 'Delray Beach',   'lat': 26.4615, 'lng': -80.0728 },
    { 'id': 'boca-raton',      'name': 'Boca Raton',     'lat': 26.3683, 'lng': -80.1289 },
    { 'id': 'boynton-beach',   'name': 'Boynton Beach',  'lat': 26.5254, 'lng': -80.0662 },
    { 'id': 'lake-worth-beach','name': 'Lake Worth Beach','lat': 26.6168, 'lng': -80.0557 },
    { 'id': 'west-palm-beach', 'name': 'West Palm Beach', 'lat': 26.7153, 'lng': -80.0534 },
]

# Eventbrite category IDs (most relevant to our use case)
# 103=Music, 105=Arts, 110=Food/Drink, 113=Community, 108=Sports/Fitness
CATEGORY_IDS = '103,105,110,113,108'

CATEGORY_MAP = {
    'music':        'live-music',
    'food & drink': 'food-specials',
    'arts':         'art-culture',
    'comedy':       'comedy',
    'sports':       'fitness',
    'community':    'art-culture',
    'film':         'art-culture',
    'health':       'fitness',
}

def eb_category_to_ours(eb_cat_name):
    name = (eb_cat_name or '').lower()
    for key, val in CATEGORY_MAP.items():
        if key in name:
            return val
    return 'art-culture'

def scrape_city(city):
    url = 'https://www.eventbriteapi.com/v3/events/search/'
    params = {
        'token':                TOKEN,
        'location.latitude':    city['lat'],
        'location.longitude':   city['lng'],
        'location.within':      '5mi',
        'categories':           CATEGORY_IDS,
        'expand':               'venue,category,ticket_availability',
        'sort_by':              'date',
        'page_size':            50,
    }
    try:
        res = requests.get(url, params=params, timeout=15)
        res.raise_for_status()
        data = res.json()
    except Exception as e:
        print(f'  [{city["name"]}] Request failed: {e}')
        return []

    events = []
    for eb in data.get('events', []):
        try:
            name        = eb.get('name', {}).get('text', '') or ''
            description = eb.get('description', {}).get('text', '') or ''
            start_utc   = eb.get('start', {}).get('utc', '')
            ticket_url  = eb.get('url', '')
            is_free     = eb.get('is_free', False)
            eb_venue    = eb.get('venue') or {}
            eb_cat      = eb.get('category') or {}

            venue_name    = eb_venue.get('name', '') or ''
            venue_address = eb_venue.get('address', {}).get('localized_address_display', '') or ''
            category      = eb_category_to_ours(eb_cat.get('name', ''))

            if not name or not start_utc:
                continue

            # Parse date/time
            dt = datetime.fromisoformat(start_utc.replace('Z', '+00:00'))
            # Convert to ET (UTC-5 standard, UTC-4 daylight — approximate with -5)
            from datetime import timedelta
            et_offset = timedelta(hours=-5)
            dt_et = dt + et_offset
            date_str = dt_et.strftime('%Y-%m-%d')
            time_str = dt_et.strftime('%H:%M')

            cover = 'Free' if is_free else 'Varies'

            events.append({
                'source':      'eventbrite',
                'sourceId':    eb.get('id', ''),
                'cityId':      city['id'],
                'name':        name,
                'description': description[:300] if description else f'{name} at {venue_name}',
                'venueName':   venue_name,
                'venueAddress':venue_address,
                'category':    category,
                'vibe':        [],
                'cover':       cover,
                'ticketUrl':   ticket_url,
                'oneTime':     { 'date': date_str, 'time': time_str, 'duration': 120 },
                'recurring':   None,
                'timeOfDay':   ['night'] if dt_et.hour >= 17 else ['day'],
                'ageRestriction': None,
            })
        except Exception as e:
            print(f'  [{city["name"]}] Error parsing event: {e}')
            continue

    print(f'  [{city["name"]}] Found {len(events)} events')
    return events

def main():
    print(f'Eventbrite scraper starting — {datetime.now().strftime("%Y-%m-%d %H:%M")}')
    all_events = []
    for city in CITIES:
        all_events.extend(scrape_city(city))

    out_path = os.path.join(STAGING_DIR, f'eventbrite-{datetime.now().strftime("%Y-%m-%d")}.json')
    with open(out_path, 'w') as f:
        json.dump(all_events, f, indent=2)

    print(f'Done. {len(all_events)} total events written to {out_path}')

if __name__ == '__main__':
    main()
