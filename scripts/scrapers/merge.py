#!/usr/bin/env python3
"""
Merge Script for The Active Owl
Reads all staged event files from data/staging/ and merges new events
into the appropriate city events.json files.

Rules:
  - Eventbrite events: auto-merge (high confidence, have ticket links)
  - Google Places:     auto-merge venue field updates
  - Venue-site events: marked needsReview=true, require --force to merge

Usage:
  python merge.py              # merge all today's staged files (skip needsReview)
  python merge.py --all        # merge all staged files (skip needsReview)
  python merge.py --force      # merge including needsReview items
  python merge.py --dry-run    # preview only, no writes
"""

import json
import os
import sys
import glob
from datetime import datetime

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
APP_DIR     = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))
DATA_DIR    = os.path.join(APP_DIR, 'data', 'cities')
STAGING_DIR = os.path.join(APP_DIR, 'data', 'staging')

DRY_RUN  = '--dry-run' in sys.argv
FORCE    = '--force'   in sys.argv
ALL      = '--all'     in sys.argv

def load_json(path):
    with open(path) as f:
        return json.load(f)

def save_json(path, data):
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)

def event_exists(existing_events, new_event):
    """Check if an equivalent event already exists (by source ID or name+date)."""
    source_id = new_event.get('sourceId')
    if source_id:
        for e in existing_events:
            if e.get('sourceId') == source_id:
                return True

    # Fuzzy match: same venue, name, and date
    new_name = new_event.get('name', '').lower()
    new_venue = new_event.get('venueId', '')
    new_date = (new_event.get('oneTime') or {}).get('date', '')
    for e in existing_events:
        if (e.get('venueId', '') == new_venue and
            e.get('name', '').lower() == new_name and
            (e.get('oneTime') or {}).get('date', '') == new_date):
            return True
    return False

def next_event_id(city_id, existing_events):
    """Generate the next available event ID for a city."""
    prefix = city_id.split('-')[0][:4]
    prefix_map = {
        'delr': 'delray',
        'boca': 'boca',
        'boyn': 'boyn',
        'lake': 'lake',
        'west': 'wpb',
    }
    short = prefix_map.get(prefix, prefix)
    existing_ids = [e.get('id', '') for e in existing_events]
    nums = []
    for eid in existing_ids:
        parts = eid.split('-')
        if parts and parts[-1].isdigit():
            nums.append(int(parts[-1]))
    next_num = max(nums) + 1 if nums else 900
    return f'{city_id}-evt-{next_num}'

def merge_events(city_id, new_events, dry_run=False):
    events_path = os.path.join(DATA_DIR, city_id, 'events.json')
    if not os.path.exists(events_path):
        print(f'  [{city_id}] events.json not found — skipping')
        return 0

    existing = load_json(events_path)
    added = 0

    for evt in new_events:
        if event_exists(existing, evt):
            continue

        # Build a clean event record
        new_record = {
            'id':             next_event_id(city_id, existing),
            'venueId':        evt.get('venueId', ''),
            'name':           evt.get('name', ''),
            'category':       evt.get('category', 'live-music'),
            'vibe':           evt.get('vibe', []),
            'description':    evt.get('description', ''),
            'recurring':      evt.get('recurring', None),
            'oneTime':        evt.get('oneTime', None),
            'cover':          evt.get('cover', 'Varies'),
            'ageRestriction': evt.get('ageRestriction', None),
            'timeOfDay':      evt.get('timeOfDay', ['night']),
        }

        if evt.get('ticketUrl'):
            new_record['ticketUrl'] = evt['ticketUrl']
        if evt.get('sourceId'):
            new_record['sourceId'] = evt['sourceId']
        if evt.get('source'):
            new_record['source'] = evt['source']

        print(f'  + [{city_id}] {new_record["name"]} ({(new_record.get("oneTime") or {}).get("date", "recurring")})')

        if not dry_run:
            existing.append(new_record)
        added += 1

    if not dry_run and added > 0:
        save_json(events_path, existing)

    return added

def merge_venue_updates(city_id, updates, dry_run=False):
    """Apply Google Places venue enrichments to venues.json."""
    venues_path = os.path.join(DATA_DIR, city_id, 'venues.json')
    if not os.path.exists(venues_path):
        return 0

    venues = load_json(venues_path)
    updated = 0

    for upd in updates:
        venue_id = upd.get('venueId')
        v = next((x for x in venues if x['id'] == venue_id), None)
        if not v:
            continue

        changed = False
        for field in ('phone', 'website', 'hours', 'image', 'rating'):
            if field in upd and not v.get(field):
                print(f'  ~ [{city_id}] {v["name"]}: adding {field}')
                if not dry_run:
                    v[field] = upd[field]
                changed = True

        if changed:
            updated += 1

    if not dry_run and updated > 0:
        save_json(venues_path, venues)

    return updated

def main():
    print(f'Merge script starting — {datetime.now().strftime("%Y-%m-%d %H:%M")}')
    if DRY_RUN:
        print('DRY RUN — no files will be written')
    if FORCE:
        print('FORCE mode — including needsReview items')

    today = datetime.now().strftime('%Y-%m-%d')
    pattern = os.path.join(STAGING_DIR, f'*-{today}.json' if not ALL else '*.json')
    staged_files = glob.glob(pattern)

    if not staged_files:
        print(f'No staged files found matching: {pattern}')
        return

    total_events  = 0
    total_venues  = 0

    for fpath in staged_files:
        fname = os.path.basename(fpath)
        print(f'\nProcessing: {fname}')

        try:
            staged = load_json(fpath)
        except Exception as e:
            print(f'  Error reading {fname}: {e}')
            continue

        if not staged:
            print(f'  Empty — skipping')
            continue

        source = staged[0].get('source', 'unknown')

        if source == 'google-places':
            # Group by city and apply venue updates
            by_city = {}
            for upd in staged:
                cid = upd.get('cityId', '')
                by_city.setdefault(cid, []).append(upd)
            for city_id, updates in by_city.items():
                n = merge_venue_updates(city_id, updates, dry_run=DRY_RUN)
                total_venues += n
                print(f'  [{city_id}] {n} venue fields updated')

        else:
            # Event sources: eventbrite, venue-site
            by_city = {}
            for evt in staged:
                if evt.get('needsReview') and not FORCE:
                    continue
                cid = evt.get('cityId', '')
                by_city.setdefault(cid, []).append(evt)

            for city_id, events in by_city.items():
                n = merge_events(city_id, events, dry_run=DRY_RUN)
                total_events += n

    print(f'\nDone. {total_events} events added, {total_venues} venue fields updated.')
    if DRY_RUN:
        print('(dry run — nothing written)')

if __name__ == '__main__':
    main()
