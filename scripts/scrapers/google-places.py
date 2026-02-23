#!/usr/bin/env python3
"""
Google Places Scraper for The Active Owl
Enriches existing venue data with accurate hours, photos, website, and phone
from the Google Places API. Writes updates to data/staging/google-places-{date}.json

Requires: GOOGLE_PLACES_API_KEY in scripts/scrapers/config.json
API docs: https://developers.google.com/maps/documentation/places/web-service
"""

import json
import os
import sys
import requests
from datetime import datetime

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
APP_DIR     = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))
CONFIG_PATH = os.path.join(SCRIPT_DIR, 'config.json')
DATA_DIR    = os.path.join(APP_DIR, 'data', 'cities')
STAGING_DIR = os.path.join(APP_DIR, 'data', 'staging')
os.makedirs(STAGING_DIR, exist_ok=True)

# ── Config ────────────────────────────────────────────────────────────────────
try:
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    API_KEY = config.get('google_places_key', '')
except FileNotFoundError:
    print('ERROR: config.json not found. Copy config.example.json and add your API keys.')
    sys.exit(1)

if not API_KEY:
    print('ERROR: google_places_key missing from config.json')
    sys.exit(1)

DAYS_ORDER = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
DAY_MAP = {
    0: 'monday', 1: 'tuesday', 2: 'wednesday', 3: 'thursday',
    4: 'friday',  5: 'saturday', 6: 'sunday'
}

def parse_hours(periods):
    """Convert Google Places opening_hours.periods into our hours dict format."""
    if not periods:
        return None
    hours = {}
    for period in periods:
        open_info  = period.get('open', {})
        close_info = period.get('close', {})
        day_num = open_info.get('day')
        if day_num is None:
            continue
        day_name = DAY_MAP.get(day_num)
        if not day_name:
            continue
        open_time  = open_info.get('time', '0000')
        close_time = close_info.get('time', '0000') if close_info else '0000'
        def fmt(t):
            h = int(t[:2])
            m = t[2:]
            ampm = 'AM' if h < 12 else 'PM'
            h12  = h % 12 or 12
            return f'{h12}:{m} {ampm}'
        hours[day_name] = f'{fmt(open_time)} - {fmt(close_time)}'
    return hours

def find_place(venue_name, venue_address):
    """Use Find Place to get a place_id."""
    url = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json'
    params = {
        'input':      f'{venue_name} {venue_address}',
        'inputtype':  'textquery',
        'fields':     'place_id,name,formatted_address',
        'key':        API_KEY,
    }
    try:
        res = requests.get(url, params=params, timeout=10)
        res.raise_for_status()
        candidates = res.json().get('candidates', [])
        if candidates:
            return candidates[0].get('place_id')
    except Exception as e:
        print(f'  Find Place failed for {venue_name}: {e}')
    return None

def get_place_details(place_id):
    """Get full details for a place_id."""
    url = 'https://maps.googleapis.com/maps/api/place/details/json'
    params = {
        'place_id': place_id,
        'fields':   'name,formatted_phone_number,website,opening_hours,photos,rating',
        'key':      API_KEY,
    }
    try:
        res = requests.get(url, params=params, timeout=10)
        res.raise_for_status()
        return res.json().get('result', {})
    except Exception as e:
        print(f'  Place Details failed for {place_id}: {e}')
    return {}

def get_photo_url(photo_reference, max_width=800):
    """Build a Google Places photo URL."""
    return (
        f'https://maps.googleapis.com/maps/api/place/photo'
        f'?maxwidth={max_width}&photoreference={photo_reference}&key={API_KEY}'
    )

def enrich_city(city_id):
    venues_path = os.path.join(DATA_DIR, city_id, 'venues.json')
    if not os.path.exists(venues_path):
        print(f'  [{city_id}] No venues.json found — skipping')
        return []

    with open(venues_path) as f:
        venues = json.load(f)

    updates = []
    for v in venues:
        print(f'  [{city_id}] Looking up: {v["name"]}')
        place_id = find_place(v['name'], v.get('address', ''))
        if not place_id:
            print(f'    No match found — skipping')
            continue

        details = get_place_details(place_id)
        if not details:
            continue

        update = {
            'source':  'google-places',
            'cityId':  city_id,
            'venueId': v['id'],
            'name':    v['name'],
        }

        # Phone
        phone = details.get('formatted_phone_number')
        if phone:
            update['phone'] = phone

        # Website
        website = details.get('website')
        if website:
            update['website'] = website

        # Hours
        opening_hours = details.get('opening_hours', {})
        periods = opening_hours.get('periods', [])
        if periods:
            parsed_hours = parse_hours(periods)
            if parsed_hours:
                update['hours'] = parsed_hours

        # Rating
        rating = details.get('rating')
        if rating:
            update['rating'] = rating

        # Photo (first one only)
        photos = details.get('photos', [])
        if photos:
            ref = photos[0].get('photo_reference')
            if ref:
                update['image'] = get_photo_url(ref)

        updates.append(update)
        print(f'    Enriched successfully')

    return updates

def main():
    print(f'Google Places scraper starting — {datetime.now().strftime("%Y-%m-%d %H:%M")}')

    city_ids = [
        'delray-beach', 'boca-raton', 'boynton-beach',
        'lake-worth-beach', 'west-palm-beach'
    ]

    all_updates = []
    for city_id in city_ids:
        all_updates.extend(enrich_city(city_id))

    out_path = os.path.join(STAGING_DIR, f'google-places-{datetime.now().strftime("%Y-%m-%d")}.json')
    with open(out_path, 'w') as f:
        json.dump(all_updates, f, indent=2)

    print(f'Done. {len(all_updates)} venue updates written to {out_path}')

if __name__ == '__main__':
    main()
