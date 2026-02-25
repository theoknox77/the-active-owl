#!/bin/bash
# Run all Active Owl scrapers then merge results
# Runs M/W/F via cron. Logs to ~/workspace/operation-barfly/app/logs/scraper.log

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
VENV="$APP_DIR/scripts/venv/bin/python3"
LOG_DIR="$APP_DIR/logs"
LOG="$LOG_DIR/scraper.log"

mkdir -p "$LOG_DIR"

echo "" >> "$LOG"
echo "===== Scraper run: $(date) =====" >> "$LOG"

# 1. Eventbrite
echo "[1/3] Eventbrite..." | tee -a "$LOG"
"$VENV" "$SCRIPT_DIR/eventbrite.py" >> "$LOG" 2>&1
echo "Done." | tee -a "$LOG"

# 2. Google Places
echo "[2/3] Google Places..." | tee -a "$LOG"
"$VENV" "$SCRIPT_DIR/google-places.py" >> "$LOG" 2>&1
echo "Done." | tee -a "$LOG"

# 3. Venue Sites
echo "[3/3] Venue Sites..." | tee -a "$LOG"
"$VENV" "$SCRIPT_DIR/venue-sites.py" >> "$LOG" 2>&1
echo "Done." | tee -a "$LOG"

# 4. Merge (auto-merge high-confidence sources; skip needsReview)
echo "[4/4] Merging..." | tee -a "$LOG"
"$VENV" "$SCRIPT_DIR/merge.py" >> "$LOG" 2>&1
echo "Merge done." | tee -a "$LOG"

# 5. Auto-commit and push any updated event data to GitHub (triggers Vercel deploy)
echo "[5/5] Checking for data changes..." | tee -a "$LOG"
cd "$APP_DIR"
CHANGED=$(git diff --name-only data/cities/ 2>/dev/null)
if [ -n "$CHANGED" ]; then
  echo "Changes detected:" | tee -a "$LOG"
  echo "$CHANGED" | tee -a "$LOG"
  git add data/cities/ >> "$LOG" 2>&1
  git commit -m "Auto-update: event data refresh $(date '+%Y-%m-%d %H:%M')" >> "$LOG" 2>&1
  git push >> "$LOG" 2>&1
  if [ $? -eq 0 ]; then
    echo "Pushed to GitHub — Vercel deploy triggered." | tee -a "$LOG"
  else
    echo "Push failed — check git credentials." | tee -a "$LOG"
  fi
else
  echo "No data changes. Nothing to push." | tee -a "$LOG"
fi

echo "===== Complete: $(date) =====" >> "$LOG"
