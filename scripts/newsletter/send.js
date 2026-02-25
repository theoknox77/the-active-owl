#!/usr/bin/env node
/**
 * The Active Owl — Weekly Newsletter Generator & Sender
 * Runs every Friday morning via cron.
 * Generates email HTML, sends via Buttondown, saves as static blog page.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ─── Config ────────────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '../../');
const DATA_DIR = path.join(ROOT, 'data/cities');
const PUBLIC_NEWSLETTERS = path.join(ROOT, 'public/newsletters');
const BUTTONDOWN_API_KEY = '3de2c2d1-616d-43ce-b4ae-220127751a9e';
const SITE_URL = 'https://theactiveowl.com';

// ─── Inspirational Intros (rotates weekly by week number) ──────────────────
const INTROS = [
  {
    headline: "Life is short. Make this weekend count.",
    body: "We only get so many weekends. So many chances to say yes to the thing we've been putting off — the concert, the waterfront brunch, the bar we keep meaning to try. South Florida hands you an invitation every week. This is yours."
  },
  {
    headline: "The good stuff is happening right now.",
    body: "Most people scroll right past the life they want. Not you. You're here, which means you're actually going to show up — for the music, the people, the moment that turns an ordinary night into a story you'll still be telling next year."
  },
  {
    headline: "Be where your feet are.",
    body: "There's nowhere else like South Florida on a Friday night. The air is warm, the music is live, and the city is putting on a show whether you come or not. Might as well be there. Here's what's worth your time this week."
  },
  {
    headline: "Go live it.",
    body: "Gratitude isn't just what you feel — it's what you do with the time you've been given. And right now, South Florida is giving you a whole lot of options. We found the best ones. All you have to do is show up."
  },
  {
    headline: "This week is already full of things worth doing.",
    body: "The concerts, the sunsets over the Intracoastal, the happy hours that turn into midnight conversations — none of it happens from the couch. Here's your weekly reminder that real life is out there, and it's better than you think."
  },
  {
    headline: "You live in one of the best places on earth. Act like it.",
    body: "Palm Beach, Broward, the whole South Florida corridor — this is a place people fly across the country to visit. You get to be here every weekend. Here's what's happening worth celebrating this week."
  },
  {
    headline: "Every week is a gift. Open this one.",
    body: "There's live music tonight, cold drinks waiting, and people out there looking for exactly the kind of night you've been thinking about. The only thing standing between you and a great weekend is deciding to have one."
  }
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function getDayName(date) {
  return ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][date.getDay()];
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function formatDateRange(friday, sunday) {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  if (friday.getMonth() === sunday.getMonth()) {
    return `${months[friday.getMonth()]} ${friday.getDate()}–${sunday.getDate()}, ${friday.getFullYear()}`;
  }
  return `${months[friday.getMonth()]} ${friday.getDate()} – ${months[sunday.getMonth()]} ${sunday.getDate()}, ${friday.getFullYear()}`;
}

function formatTime(time24) {
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}${m > 0 ? ':' + String(m).padStart(2,'0') : ''} ${ampm}`;
}

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function httpPost(hostname, path, data, headers) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const options = {
      hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers }
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: raw }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Load Data ─────────────────────────────────────────────────────────────

function loadCities() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cities.json'), 'utf8'));
}

function loadCityData(cityId) {
  const cityDir = path.join(DATA_DIR, cityId);
  const venuesFile = path.join(cityDir, 'venues.json');
  const eventsFile = path.join(cityDir, 'events.json');
  if (!fs.existsSync(venuesFile) || !fs.existsSync(eventsFile)) return null;
  const venues = JSON.parse(fs.readFileSync(venuesFile, 'utf8'));
  const events = JSON.parse(fs.readFileSync(eventsFile, 'utf8'));
  const venueMap = {};
  venues.forEach(v => venueMap[v.id] = v);
  return { venues, events, venueMap };
}

// ─── Pick Weekend Events ────────────────────────────────────────────────────

function getWeekendPicks(cities, cityDataMap, weekendDays) {
  const picks = [];
  const usedCities = new Set();
  const usedCategories = new Set();

  // Priority categories for newsletter
  const priorityCategories = ['live-music', 'brunch', 'jazz', 'happy-hour', 'trivia'];

  for (const cat of priorityCategories) {
    for (const city of cities) {
      if (!cityDataMap[city.id]) continue;
      const { events, venueMap } = cityDataMap[city.id];

      const match = events.find(evt => {
        if (!evt.recurring) return false;
        if (!weekendDays.includes(evt.recurring.day)) return false;
        if (evt.category !== cat) return false;
        // Don't double-up same city unless we have lots of options
        if (usedCities.has(city.id) && picks.length < cities.length) return false;
        return true;
      });

      if (match) {
        const venue = venueMap[match.venueId];
        if (!venue) continue;
        picks.push({ event: match, venue, city });
        usedCities.add(city.id);
        usedCategories.add(cat);
        if (picks.length >= 7) break;
      }
    }
    if (picks.length >= 7) break;
  }

  // Fill remaining slots with anything from uncovered cities
  if (picks.length < 5) {
    for (const city of cities) {
      if (usedCities.has(city.id)) continue;
      if (!cityDataMap[city.id]) continue;
      const { events, venueMap } = cityDataMap[city.id];
      const match = events.find(evt => evt.recurring && weekendDays.includes(evt.recurring.day));
      if (match) {
        const venue = venueMap[match.venueId];
        if (venue) {
          picks.push({ event: match, venue, city });
          usedCities.add(city.id);
        }
      }
    }
  }

  return picks.slice(0, 6);
}

// ─── HTML Generation ───────────────────────────────────────────────────────

function generateEmailHTML(intro, picks, dateRange, weekNum, slug) {
  const pickRows = picks.map(({ event, venue, city }) => {
    const day = capitalizeFirst(event.recurring.day);
    const time = formatTime(event.recurring.time);
    const cover = event.cover === 'Free' ? '🆓 Free' : `Cover: ${event.cover}`;
    const cityUrl = `${SITE_URL}/#/?city=${city.id}`;
    return `
    <tr>
      <td style="padding: 20px 0; border-bottom: 1px solid #f0ece4;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #f4813a; font-weight: 700; margin-bottom: 4px;">${city.name}</div>
        <div style="font-size: 20px; font-weight: 700; color: #1a1a1a; margin-bottom: 4px;">${event.name}</div>
        <div style="font-size: 14px; color: #666; margin-bottom: 6px;">📍 ${venue.name} &nbsp;·&nbsp; ${day}s at ${time} &nbsp;·&nbsp; ${cover}</div>
        <div style="font-size: 15px; color: #444; line-height: 1.5; margin-bottom: 8px;">${event.description}</div>
        <a href="${cityUrl}" style="font-size: 13px; color: #f4813a; font-weight: 600; text-decoration: none;">See more in ${city.shortName} →</a>
      </td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>The Active Owl — ${dateRange}</title>
</head>
<body style="margin:0;padding:0;background:#faf8f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f4;">
    <tr><td align="center" style="padding: 40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.08);">
        
        <!-- Header -->
        <tr><td style="background: linear-gradient(135deg, #1a4a2e 0%, #2d7a4f 100%); padding: 40px 40px 32px; text-align: center;">
          <div style="font-size: 28px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">🦉 The Active Owl</div>
          <div style="font-size: 13px; color: rgba(255,255,255,0.7); margin-top: 6px; letter-spacing: 1px; text-transform: uppercase;">South Florida's Weekly Event Guide</div>
          <div style="font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 8px;">${dateRange}</div>
        </td></tr>

        <!-- Inspirational Intro -->
        <tr><td style="padding: 40px 40px 32px; background: #fff9f0; border-bottom: 2px solid #f0ece4;">
          <div style="font-size: 26px; font-weight: 800; color: #1a1a1a; line-height: 1.2; margin-bottom: 16px;">${intro.headline}</div>
          <div style="font-size: 16px; color: #555; line-height: 1.7;">${intro.body}</div>
        </td></tr>

        <!-- This Weekend Section Header -->
        <tr><td style="padding: 32px 40px 0;">
          <div style="font-size: 13px; text-transform: uppercase; letter-spacing: 2px; color: #f4813a; font-weight: 700; margin-bottom: 4px;">This Weekend</div>
          <div style="font-size: 22px; font-weight: 800; color: #1a1a1a;">Top Picks Across South Florida</div>
        </td></tr>

        <!-- Event Picks -->
        <tr><td style="padding: 16px 40px 8px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${pickRows}
          </table>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding: 32px 40px; text-align: center;">
          <div style="font-size: 16px; color: #555; margin-bottom: 20px;">See everything happening in your city this weekend.</div>
          <a href="${SITE_URL}" style="display:inline-block;background:#f4813a;color:#ffffff;font-weight:700;font-size:16px;padding:16px 36px;border-radius:50px;text-decoration:none;letter-spacing:0.3px;">Explore theactiveowl.com →</a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding: 24px 40px; background:#f5f5f5; border-top: 1px solid #e8e8e8; text-align: center;">
          <div style="font-size: 12px; color: #999; line-height: 1.6;">
            You're receiving this because you subscribed at theactiveowl.com.<br>
            <a href="{{ unsubscribe_url }}" style="color: #999; text-decoration: underline;">Unsubscribe</a>
            &nbsp;·&nbsp;
            <a href="${SITE_URL}/newsletters/${slug}.html" style="color: #999; text-decoration: underline;">View in browser</a>
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function generateBlogHTML(intro, picks, dateRange, weekNum, slug) {
  const pickCards = picks.map(({ event, venue, city }) => {
    const day = capitalizeFirst(event.recurring.day);
    const time = formatTime(event.recurring.time);
    const cover = event.cover === 'Free' ? 'Free' : `Cover: ${event.cover}`;
    const cityUrl = `${SITE_URL}/#/?city=${city.id}`;
    return `
    <div style="border: 1px solid #e8e4dc; border-radius: 12px; padding: 24px; margin-bottom: 20px; background: #fff;">
      <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #f4813a; font-weight: 700; margin-bottom: 6px;">${city.name}</div>
      <h3 style="margin: 0 0 8px; font-size: 20px; color: #1a1a1a;">${event.name}</h3>
      <div style="font-size: 14px; color: #888; margin-bottom: 10px;">📍 ${venue.name} &nbsp;·&nbsp; ${day}s at ${time} &nbsp;·&nbsp; ${cover}</div>
      <p style="margin: 0 0 12px; color: #555; line-height: 1.6;">${event.description}</p>
      <a href="${cityUrl}" style="color: #f4813a; font-weight: 600; text-decoration: none; font-size: 14px;">See more in ${city.shortName} →</a>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>South Florida Weekend Guide: ${dateRange} | The Active Owl</title>
  <meta name="description" content="${intro.headline} The Active Owl's weekly South Florida event guide for ${dateRange}.">
  <meta property="og:title" content="South Florida Weekend Guide: ${dateRange}">
  <meta property="og:description" content="${intro.headline}">
  <meta property="og:url" content="${SITE_URL}/newsletters/${slug}.html">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-DK9DWSHRVR"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-DK9DWSHRVR');</script>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #faf8f4; color: #333; }
    .nav { background: #1a4a2e; padding: 16px 24px; display: flex; align-items: center; gap: 12px; }
    .nav a { color: #fff; text-decoration: none; font-weight: 700; font-size: 18px; }
    .nav .back { font-size: 13px; color: rgba(255,255,255,0.7); font-weight: 400; }
    .hero { background: linear-gradient(135deg, #1a4a2e 0%, #2d7a4f 100%); padding: 60px 24px 48px; text-align: center; }
    .hero .label { font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: rgba(255,255,255,0.6); margin-bottom: 12px; }
    .hero h1 { margin: 0 0 12px; font-size: 32px; color: #fff; font-weight: 800; line-height: 1.2; }
    .hero .date { font-size: 14px; color: rgba(255,255,255,0.6); }
    .intro-section { max-width: 680px; margin: 0 auto; padding: 48px 24px 32px; }
    .intro-section .headline { font-size: 28px; font-weight: 800; color: #1a1a1a; margin-bottom: 16px; line-height: 1.3; }
    .intro-section .body { font-size: 17px; color: #555; line-height: 1.7; }
    .picks-section { max-width: 680px; margin: 0 auto; padding: 0 24px 48px; }
    .picks-section h2 { font-size: 22px; font-weight: 800; color: #1a1a1a; margin-bottom: 24px; padding-top: 32px; border-top: 2px solid #f0ece4; }
    .cta-box { background: #1a4a2e; border-radius: 16px; padding: 40px 32px; text-align: center; max-width: 680px; margin: 0 auto 48px; }
    .cta-box p { color: rgba(255,255,255,0.8); font-size: 16px; margin: 0 0 20px; }
    .cta-box a { display: inline-block; background: #f4813a; color: #fff; font-weight: 700; font-size: 16px; padding: 16px 36px; border-radius: 50px; text-decoration: none; }
    .footer { text-align: center; padding: 32px 24px; font-size: 13px; color: #999; }
    .footer a { color: #999; }
    .archive-link { text-align: center; padding: 0 24px 32px; }
    .archive-link a { color: #f4813a; font-weight: 600; text-decoration: none; font-size: 14px; }
  </style>
</head>
<body>
  <nav class="nav">
    <a href="${SITE_URL}">🦉 The Active Owl</a>
    <span class="back">/ <a href="${SITE_URL}/newsletters/" style="color:rgba(255,255,255,0.7);text-decoration:none;">Newsletter Archive</a></span>
  </nav>

  <div class="hero">
    <div class="label">Weekly Edition</div>
    <h1>South Florida Weekend Guide</h1>
    <div class="date">${dateRange}</div>
  </div>

  <div class="intro-section">
    <div class="headline">${intro.headline}</div>
    <div class="body">${intro.body}</div>
  </div>

  <div class="picks-section">
    <h2>This Weekend's Top Picks</h2>
    ${pickCards}
  </div>

  <div style="max-width:680px;margin:0 auto;padding:0 24px;">
    <div class="cta-box">
      <p>Your full guide to what's happening across South Florida — every day, every city.</p>
      <a href="${SITE_URL}">Explore The Active Owl →</a>
    </div>
  </div>

  <div class="archive-link">
    <a href="${SITE_URL}/newsletters/">← Browse past newsletters</a>
  </div>

  <footer class="footer">
    <p>The Active Owl — South Florida's Activity Guide<br>
    <a href="${SITE_URL}">theactiveowl.com</a></p>
  </footer>
</body>
</html>`;
}

// ─── Newsletter Archive Index ───────────────────────────────────────────────

function updateArchiveIndex(newsletters) {
  const items = newsletters.sort((a,b) => b.date - a.date).map(n =>
    `<li><a href="${n.slug}.html">${n.title}</a> <span class="date">${n.dateStr}</span></li>`
  ).join('\n    ');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Newsletter Archive | The Active Owl</title>
  <meta name="description" content="Weekly South Florida event guides from The Active Owl.">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #faf8f4; margin: 0; padding: 0; }
    .nav { background: #1a4a2e; padding: 16px 24px; }
    .nav a { color: #fff; text-decoration: none; font-weight: 700; font-size: 18px; }
    .content { max-width: 680px; margin: 0 auto; padding: 48px 24px; }
    h1 { font-size: 32px; font-weight: 800; color: #1a1a1a; margin-bottom: 8px; }
    .subtitle { color: #888; margin-bottom: 40px; font-size: 16px; }
    ul { list-style: none; padding: 0; margin: 0; }
    li { padding: 16px 0; border-bottom: 1px solid #e8e4dc; display: flex; justify-content: space-between; align-items: center; }
    li a { font-weight: 600; color: #1a1a1a; text-decoration: none; font-size: 16px; }
    li a:hover { color: #f4813a; }
    .date { font-size: 13px; color: #aaa; }
  </style>
</head>
<body>
  <nav class="nav"><a href="/">🦉 The Active Owl</a></nav>
  <div class="content">
    <h1>Newsletter Archive</h1>
    <p class="subtitle">Every weekly South Florida guide, in one place.</p>
    <ul>
    ${items}
    </ul>
  </div>
</body>
</html>`;

  fs.writeFileSync(path.join(PUBLIC_NEWSLETTERS, 'index.html'), html);
  console.log('Updated newsletter archive index.');
}

// ─── Buttondown Send ────────────────────────────────────────────────────────

async function sendViaButtondown(subject, emailHTML) {
  const result = await httpPost('api.buttondown.email', '/v1/emails', {
    subject,
    body: emailHTML,
    status: 'sent'
  }, {
    Authorization: `Token ${BUTTONDOWN_API_KEY}`
  });
  return result;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('The Active Owl Newsletter — starting generation...\n');

  // Determine this Friday and Sunday
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 5=Fri
  const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
  const friday = new Date(today);
  friday.setDate(today.getDate() + (dayOfWeek === 5 ? 0 : daysUntilFriday));
  const saturday = new Date(friday); saturday.setDate(friday.getDate() + 1);
  const sunday = new Date(friday); sunday.setDate(friday.getDate() + 2);
  const weekendDays = ['friday','saturday','sunday'];

  const dateRange = formatDateRange(friday, sunday);
  const weekNum = getWeekNumber(friday);
  const year = friday.getFullYear();
  const slug = `week-${year}-${String(weekNum).padStart(2,'0')}`;
  const intro = INTROS[weekNum % INTROS.length];

  console.log(`Week: ${weekNum} | Dates: ${dateRange} | Slug: ${slug}`);

  // Load all city data
  const cities = loadCities().filter(c => c.active);
  const cityDataMap = {};
  for (const city of cities) {
    cityDataMap[city.id] = loadCityData(city.id);
  }

  // Pick weekend events
  const picks = getWeekendPicks(cities, cityDataMap, weekendDays);
  console.log(`Selected ${picks.length} event picks:`);
  picks.forEach(p => console.log(`  - [${p.city.name}] ${p.event.name} @ ${p.venue.name}`));

  // Generate HTML
  const emailHTML = generateEmailHTML(intro, picks, dateRange, weekNum, slug);
  const blogHTML = generateBlogHTML(intro, picks, dateRange, weekNum, slug);

  // Save blog page
  const blogPath = path.join(PUBLIC_NEWSLETTERS, `${slug}.html`);
  fs.writeFileSync(blogPath, blogHTML);
  console.log(`\nBlog page saved: ${blogPath}`);

  // Update archive index
  const allNewsletters = fs.readdirSync(PUBLIC_NEWSLETTERS)
    .filter(f => f.match(/^week-\d{4}-\d{2}\.html$/))
    .map(f => {
      const [, yr, wk] = f.match(/^week-(\d{4})-(\d{2})\.html$/);
      return {
        slug: f.replace('.html',''),
        title: `South Florida Weekend Guide — Week ${parseInt(wk)}, ${yr}`,
        dateStr: `Week ${parseInt(wk)}, ${yr}`,
        date: parseInt(yr) * 100 + parseInt(wk)
      };
    });
  updateArchiveIndex(allNewsletters);

  // Send via Buttondown
  const subject = `This Weekend in South Florida 🌴 ${dateRange}`;
  console.log(`\nSending email: "${subject}"`);
  const result = await sendViaButtondown(subject, emailHTML);
  console.log(`Buttondown response: ${result.status}`);
  if (result.status >= 200 && result.status < 300) {
    console.log('Email sent successfully.');
  } else {
    console.error('Send failed:', result.body);
    process.exit(1);
  }

  console.log('\nDone. Newsletter sent and blog page live.');
}

main().catch(err => {
  console.error('Newsletter error:', err);
  process.exit(1);
});
