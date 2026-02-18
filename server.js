const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const PORT = 3001;
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');

function loadJSON(file) { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')); }
function loadCityJSON(city, file) {
  const fp = path.join(DATA_DIR, 'cities', city, file);
  if (!fs.existsSync(fp)) return null;
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}
function saveJSON(file, data) { fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2)); }

const MIME_TYPES = {
  '.html':'text/html', '.css':'text/css', '.js':'application/javascript', '.json':'application/json',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif',
  '.svg':'image/svg+xml', '.ico':'image/x-icon', '.webp':'image/webp'
};

const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

function getDayOfWeek(dateStr) {
  if (!dateStr || dateStr === 'today') return DAYS[new Date().getDay()];
  return DAYS[new Date(dateStr + 'T12:00:00').getDay()];
}
function getDateStr(dateStr) {
  if (!dateStr || dateStr === 'today') return new Date().toISOString().split('T')[0];
  return dateStr;
}

function getEventsForDay(events, dayName, dateStr) {
  return events.filter(evt => {
    if (evt.recurring && evt.recurring.day === dayName) return true;
    if (evt.recurring && evt.recurring.day === 'daily') return true;
    if (evt.oneTime && evt.oneTime.date === dateStr) return true;
    return false;
  });
}

function filterByMode(items, mode) {
  if (!mode) return items;
  return items.filter(item => !item.timeOfDay || item.timeOfDay.includes(mode));
}

function getWeekEvents(events, mode) {
  const today = new Date();
  const result = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today); d.setDate(d.getDate() + i);
    const dayName = DAYS[d.getDay()];
    const dateStr = d.toISOString().split('T')[0];
    let dayEvents = getEventsForDay(events, dayName, dateStr);
    dayEvents = filterByMode(dayEvents, mode);
    result.push({ day: dayName, date: dateStr, isToday: i === 0, events: dayEvents });
  }
  return result;
}

function sendJSON(res, data, status) {
  res.writeHead(status || 200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
  });
}

function isCity(segment) { return fs.existsSync(path.join(DATA_DIR, 'cities', segment)); }

const handler = async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const query = parsed.query;

  if (pathname.startsWith('/api/')) {
    const parts = pathname.split('/').filter(Boolean);

    if (req.method === 'OPTIONS') {
      res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
      return res.end();
    }

    if (pathname === '/api/cities' && req.method === 'GET') return sendJSON(res, loadJSON('cities.json'));

    let city = 'delray-beach';
    let routeParts = parts.slice(1);
    if (routeParts.length > 0 && isCity(routeParts[0])) { city = routeParts[0]; routeParts = routeParts.slice(1); }

    const venues = loadCityJSON(city, 'venues.json');
    const events = loadCityJSON(city, 'events.json');
    if (!venues || !events) return sendJSON(res, { error: 'City not found or has no data' }, 404);

    const routePath = '/' + routeParts.join('/');
    const mode = query.mode || null;

    // GET /events
    if (routePath === '/events' && req.method === 'GET') {
      if (query.date === 'week') return sendJSON(res, getWeekEvents(events, mode));

      const dayName = getDayOfWeek(query.date);
      const dateStr = getDateStr(query.date);
      let filtered = getEventsForDay(events, dayName, dateStr);
      filtered = filterByMode(filtered, mode);
      if (query.category) filtered = filtered.filter(e => e.category === query.category);

      filtered = filtered.map(e => ({ ...e, venue: venues.find(v => v.id === e.venueId) || null }));
      filtered.sort((a, b) => {
        const tA = (a.recurring && a.recurring.time) || (a.oneTime && a.oneTime.time) || '00:00';
        const tB = (b.recurring && b.recurring.time) || (b.oneTime && b.oneTime.time) || '00:00';
        return tA.localeCompare(tB);
      });
      return sendJSON(res, filtered);
    }

    // GET /venues
    if (routePath === '/venues' && req.method === 'GET') return sendJSON(res, venues);

    // GET /venues/:id
    const venueMatch = routePath.match(/^\/venues\/([^/]+)$/);
    if (venueMatch && req.method === 'GET') {
      const venue = venues.find(v => v.id === venueMatch[1]);
      if (!venue) return sendJSON(res, { error: 'Not found' }, 404);
      const venueEvents = events.filter(e => e.venueId === venue.id);
      return sendJSON(res, { ...venue, events: venueEvents });
    }

    // GET /categories
    if (routePath === '/categories' && req.method === 'GET') {
      let filtered = filterByMode(events, mode);
      const cats = {};
      filtered.forEach(e => { cats[e.category] = (cats[e.category] || 0) + 1; });
      return sendJSON(res, Object.entries(cats).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count));
    }

    // GET /search
    if (routePath === '/search' && req.method === 'GET') {
      const q = (query.q || '').toLowerCase();
      if (!q) return sendJSON(res, { events: [], venues: [] });
      let matchedVenues = venues.filter(v => v.name.toLowerCase().includes(q) || v.categories.some(c => c.includes(q)) || (v.amenities||[]).some(a => a.includes(q)) || (v.vibes||[]).some(vi => vi.includes(q)));
      if (mode) matchedVenues = matchedVenues.filter(v => !v.timeOfDay || v.timeOfDay.includes(mode));
      let matchedEvents = events.filter(e => e.name.toLowerCase().includes(q) || e.category.includes(q) || e.description.toLowerCase().includes(q));
      matchedEvents = filterByMode(matchedEvents, mode);
      matchedEvents = matchedEvents.map(e => ({ ...e, venue: venues.find(v => v.id === e.venueId) || null }));
      return sendJSON(res, { events: matchedEvents, venues: matchedVenues });
    }

    // POST /discover
    if (routePath === '/discover' && req.method === 'POST') {
      try {
        const body = await parseBody(req);
        const { categories, vibes, when, amenities, q, mode: bodyMode } = body;
        const discoverMode = bodyMode || mode;

        let targetDays = [];
        const today = new Date();
        if (!when || when === 'today') {
          targetDays = [{ dayName: DAYS[today.getDay()], dateStr: today.toISOString().split('T')[0] }];
        } else if (when === 'tomorrow') {
          const tmrw = new Date(today); tmrw.setDate(tmrw.getDate() + 1);
          targetDays = [{ dayName: DAYS[tmrw.getDay()], dateStr: tmrw.toISOString().split('T')[0] }];
        } else if (when === 'weekend') {
          for (let i = 0; i < 7; i++) { const d = new Date(today); d.setDate(d.getDate() + i); const dayIdx = d.getDay(); if (dayIdx === 5 || dayIdx === 6) targetDays.push({ dayName: DAYS[dayIdx], dateStr: d.toISOString().split('T')[0] }); }
          if (targetDays.length === 0) for (let i = 1; i <= 7; i++) { const d = new Date(today); d.setDate(d.getDate() + i); const dayIdx = d.getDay(); if (dayIdx === 5 || dayIdx === 6) targetDays.push({ dayName: DAYS[dayIdx], dateStr: d.toISOString().split('T')[0] }); }
        } else if (when === 'week') {
          for (let i = 0; i < 7; i++) { const d = new Date(today); d.setDate(d.getDate() + i); targetDays.push({ dayName: DAYS[d.getDay()], dateStr: d.toISOString().split('T')[0] }); }
        }

        let filtered = [];
        for (const td of targetDays) {
          const dayEvts = getEventsForDay(events, td.dayName, td.dateStr);
          dayEvts.forEach(e => { if (!filtered.find(f => f.id === e.id)) filtered.push({ ...e, matchDay: td.dayName, matchDate: td.dateStr }); });
        }

        filtered = filterByMode(filtered, discoverMode);
        if (categories && categories.length > 0) filtered = filtered.filter(e => categories.includes(e.category));
        if (vibes && vibes.length > 0) filtered = filtered.filter(e => e.vibe && e.vibe.some(v => vibes.includes(v)));
        if (amenities && amenities.length > 0) filtered = filtered.filter(e => { const venue = venues.find(v => v.id === e.venueId); return venue && venue.amenities && venue.amenities.some(a => amenities.includes(a)); });
        if (q) { const ql = q.toLowerCase(); filtered = filtered.filter(e => e.name.toLowerCase().includes(ql) || e.description.toLowerCase().includes(ql) || e.category.includes(ql)); }

        filtered = filtered.map(e => ({ ...e, venue: venues.find(v => v.id === e.venueId) || null }));
        filtered.sort((a, b) => {
          const tA = (a.recurring && a.recurring.time) || (a.oneTime && a.oneTime.time) || '00:00';
          const tB = (b.recurring && b.recurring.time) || (b.oneTime && b.oneTime.time) || '00:00';
          return tA.localeCompare(tB);
        });
        return sendJSON(res, { events: filtered, total: filtered.length });
      } catch(e) { return sendJSON(res, { error: 'Invalid request' }, 400); }
    }

    // POST /track
    if (pathname === '/api/track' && req.method === 'POST') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*' }); res.end();
      try {
        const body = await parseBody(req);
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        const hashedIp = crypto.createHash('sha256').update(ip + 'themove-salt').digest('hex').slice(0, 16);
        const entry = { ts: Date.now(), event: body.event || 'unknown', page: body.page || '', venue: body.venue || '', city: body.city || '', meta: body.meta || {}, ip: hashedIp, ua: req.headers['user-agent'] || '', ref: req.headers['referer'] || '' };
        const analyticsFile = path.join(DATA_DIR, 'analytics.json');
        try { if (fs.existsSync(analyticsFile) && fs.statSync(analyticsFile).size > 5 * 1024 * 1024) { const d = new Date(); fs.renameSync(analyticsFile, path.join(DATA_DIR, `analytics-${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}.json`)); } } catch(e) {}
        try { fs.appendFileSync(analyticsFile, JSON.stringify(entry) + '\n'); } catch(e) {}
      } catch(e) {}
      return;
    }

    // GET /health
    if (pathname === '/api/health' && req.method === 'GET') {
      let venueCount = 0, eventCount = 0, cityCount = 0;
      try {
        const citiesData = loadJSON('cities.json'); cityCount = citiesData.length;
        for (const c of citiesData) { const v = loadCityJSON(c.id, 'venues.json'); const e = loadCityJSON(c.id, 'events.json'); if (v) venueCount += v.length; if (e) eventCount += e.length; }
      } catch(e) {}
      return sendJSON(res, { status: 'ok', uptime: process.uptime(), timestamp: Date.now(), venues: venueCount, events: eventCount, cities: cityCount });
    }

    // GET /analytics
    if (pathname === '/api/analytics' && req.method === 'GET') {
      try {
        const analyticsFile = path.join(DATA_DIR, 'analytics.json');
        const summaryFile = path.join(DATA_DIR, 'analytics-summary.json');
        try { if (fs.existsSync(summaryFile)) { const cached = JSON.parse(fs.readFileSync(summaryFile, 'utf8')); if (cached._ts && Date.now() - cached._ts < 5 * 60 * 1000) return sendJSON(res, cached); } } catch(e) {}

        const analyticsEvents = [];
        if (fs.existsSync(analyticsFile)) { fs.readFileSync(analyticsFile, 'utf8').split('\n').filter(Boolean).forEach(line => { try { analyticsEvents.push(JSON.parse(line)); } catch(e) {} }); }

        const now = Date.now(); const todayStart = new Date(); todayStart.setHours(0,0,0,0); const ts0 = todayStart.getTime();
        function inRange(ts, days) { return days === 0 ? ts >= ts0 : ts >= now - days * 86400000; }
        function isMobile(ua) { return /mobile|android|iphone|ipad|ipod/i.test(ua); }

        const ranges = { today: 0, '7d': 7, '30d': 30, all: Infinity };
        const pageviews = {}, visitors = {};
        for (const [k, d] of Object.entries(ranges)) {
          const f = d === Infinity ? analyticsEvents : analyticsEvents.filter(e => inRange(e.ts, d));
          pageviews[k] = f.filter(e => e.event === 'pageview').length;
          visitors[k] = new Set(f.map(e => e.ip)).size;
        }

        const venueClicks = {}, eventClicks = {}, features = { favorite: 0, share: 0, surprise_me: 0, mode_switch: 0, filter_use: 0, city_switch: 0 };
        const referrers = {}, deviceCounts = { mobile: 0, desktop: 0 }, cityCounts = {}, hourly = new Array(24).fill(0);
        for (const e of analyticsEvents) {
          if (e.event === 'venue_click' && e.venue) venueClicks[e.venue] = (venueClicks[e.venue] || 0) + 1;
          if (e.event === 'event_click' && e.meta?.eventName) eventClicks[e.meta.eventName] = (eventClicks[e.meta.eventName] || 0) + 1;
          if (features.hasOwnProperty(e.event)) features[e.event]++;
          if (e.ref) { try { const h = new URL(e.ref).hostname; if (h) referrers[h] = (referrers[h] || 0) + 1; } catch(x) {} }
          if (isMobile(e.ua)) deviceCounts.mobile++; else deviceCounts.desktop++;
          if (e.city) cityCounts[e.city] = (cityCounts[e.city] || 0) + 1;
          hourly[new Date(e.ts).getHours()]++;
        }

        const topN = (obj, n=10) => Object.entries(obj).sort((a,b) => b[1]-a[1]).slice(0,n).map(([k,v]) => ({name:k,count:v}));
        const summary = { _ts: now, totalEvents: analyticsEvents.length, pageviews, visitors, topVenues: topN(venueClicks), topEvents: topN(eventClicks), features, topReferrers: topN(referrers), devices: deviceCounts, cities: topN(cityCounts), hourly };
        try { fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2)); } catch(e) {}
        return sendJSON(res, summary);
      } catch(e) { return sendJSON(res, { error: 'Analytics error: ' + e.message }, 500); }
    }

    // POST /submit
    if (pathname === '/api/submit' && req.method === 'POST') {
      try {
        const body = await parseBody(req);
        const submissionsPath = path.join(DATA_DIR, 'submissions.json');
        let submissions = [];
        if (fs.existsSync(submissionsPath)) submissions = JSON.parse(fs.readFileSync(submissionsPath, 'utf8'));
        body.id = 'sub-' + Date.now(); body.submittedAt = new Date().toISOString();
        submissions.push(body); saveJSON('submissions.json', submissions);
        return sendJSON(res, { success: true, id: body.id }, 201);
      } catch(e) { return sendJSON(res, { error: 'Invalid request' }, 400); }
    }

    return sendJSON(res, { error: 'Not found' }, 404);
  }

  // Static files
  let filePath = pathname === '/' ? '/index.html' : pathname === '/analytics' ? '/analytics.html' : pathname;
  filePath = path.join(PUBLIC_DIR, filePath);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, html) => {
        if (err2) { res.writeHead(500); return res.end('Server error'); }
        res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType }); res.end(data);
  });
};

const server = http.createServer(handler);

// Vercel serverless export
if (process.env.VERCEL) {
  module.exports = handler;
} else {
  server.listen(PORT, () => { console.log(`The Active Owl is live at http://localhost:${PORT}`); });
}
