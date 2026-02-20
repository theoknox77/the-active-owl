const API = '';
const DAYS_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const DAY_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'yoga', label: 'Yoga' },
  { id: 'beach-sports', label: 'Beach Sports' },
  { id: 'water-sports', label: 'Water Sports' },
  { id: 'fitness', label: 'Fitness' },
  { id: 'hiking', label: 'Hiking' },
  { id: 'markets', label: 'Markets' },
  { id: 'brunch', label: 'Brunch' },
  { id: 'art-culture', label: 'Art & Culture' },
  { id: 'parks', label: 'Parks' },
  { id: 'fishing', label: 'Fishing' }
];

const NIGHT_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'live-music', label: 'Live Music' },
  { id: 'trivia', label: 'Trivia' },
  { id: 'happy-hour', label: 'Happy Hour' },
  { id: 'dj', label: 'DJ' },
  { id: 'karaoke', label: 'Karaoke' },
  { id: 'pool-darts', label: 'Pool/Darts' },
  { id: 'comedy', label: 'Comedy' },
  { id: 'open-mic', label: 'Open Mic' },
  { id: 'watch-party', label: 'Watch Party' },
  { id: 'food-specials', label: 'Food Specials' }
];

function getCategories() {
  return currentMode === 'day' ? DAY_CATEGORIES : NIGHT_CATEGORIES;
}

const VIBES = [
  { id: 'chill', label: 'Chill' },
  { id: 'active', label: 'Active' },
  { id: 'social', label: 'Social' },
  { id: 'romantic', label: 'Romantic' },
  { id: 'solo-friendly', label: 'Solo Friendly' },
  { id: 'group-friendly', label: 'Group Friendly' },
  { id: 'family-friendly', label: 'Family Friendly' },
  { id: 'adventurous', label: 'Adventurous' },
  { id: 'rowdy', label: 'Rowdy' }
];

const AMENITIES = [
  { id: 'outdoor-seating', label: 'Outdoor Seating' },
  { id: 'parking', label: 'Parking' },
  { id: 'full-bar', label: 'Full Bar' },
  { id: 'craft-beer', label: 'Craft Beer' },
  { id: 'waterfront', label: 'Waterfront' },
  { id: 'live-stage', label: 'Live Stage' },
  { id: 'pool-table', label: 'Pool Table' },
  { id: 'late-night-kitchen', label: 'Late Night Kitchen' },
  { id: 'pet-friendly', label: 'Pet Friendly' },
  { id: 'free-admission', label: 'Free Admission' }
];

const WHEN_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'weekend', label: 'This Weekend' },
  { id: 'week', label: 'This Week' }
];

// ============================
// MODE SYSTEM
// ============================
let currentMode = 'day';

function detectMode() {
  const saved = sessionStorage.getItem('themove-mode');
  if (saved) return saved;
  const hour = new Date().getHours();
  return hour >= 18 || hour < 6 ? 'night' : 'day';
}

function applyMode(mode) {
  currentMode = mode;
  document.documentElement.setAttribute('data-mode', mode);
  document.querySelectorAll('.mode-btn, .mode-pill').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  // Update theme-color meta
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = mode === 'night' ? '#0D001A' : '#FFF8F0';
  // Update nav/footer/main labels
  const navLabel = document.getElementById('nav-venues-label');
  if (navLabel) navLabel.textContent = mode === 'night' ? 'Venues' : 'Spots';
  const mainLabel = document.getElementById('main-venues-label');
  if (mainLabel) mainLabel.textContent = mode === 'night' ? 'Venues' : 'Spots';
  const footerLabel = document.getElementById('footer-venues-label');
  if (footerLabel) footerLabel.textContent = mode === 'night' ? 'All Venues' : 'All Spots';
}

window.setMode = function(mode) {
  track('mode_switch', { mode });
  sessionStorage.setItem('themove-mode', mode);
  applyMode(mode);
  currentCategory = 'all';
  route();
};

// Init mode
applyMode(detectMode());

// ============================
// ANALYTICS
// ============================
function track(event, data) {
  // Existing internal tracking
  const payload = JSON.stringify({
    event, page: window.location.hash || '#/',
    venue: (data && data.venue) || '', city: currentCity || 'delray-beach', meta: data || {}
  });
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/track', new Blob([payload], { type: 'application/json' }));
  } else {
    fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload }).catch(() => {});
  }
  
  // Google Analytics 4 tracking
  if (typeof gtag !== 'undefined') {
    const eventData = data || {};
    
    switch(event) {
      case 'venue_click':
        trackVenueClick(eventData.venue || '', currentCity, eventData.category || '');
        break;
      case 'city_switch':
        trackCityFilter(eventData.city || currentCity);
        break;
      case 'mode_switch':
        trackModeToggle(eventData.mode || currentMode);
        break;
      case 'favorite':
        const action = getFavorites().includes(eventData.venue) ? 'remove' : 'add';
        trackFavoriteAction(action, eventData.venue || '');
        break;
      case 'filter_use':
        if (eventData.search) {
          trackSearchQuery(eventData.search);
        }
        break;
      case 'surprise_me':
        gtag('event', 'surprise_me_click', {
          event_category: 'ui_interaction',
          event_label: 'surprise_button',
          custom_parameter_1: currentCity,
          custom_parameter_2: currentMode,
          value: 1
        });
        break;
      case 'share':
        gtag('event', 'share', {
          event_category: 'social_engagement',
          event_label: eventData.venue || 'unknown',
          method: 'native_share',
          content_type: 'venue',
          value: 1
        });
        break;
      case 'pageview':
        gtag('event', 'page_view', {
          page_title: document.title,
          page_location: window.location.href,
          custom_parameter_1: currentCity,
          custom_parameter_2: currentMode,
          page_type: eventData.page || 'unknown'
        });
        break;
      default:
        gtag('event', event, {
          event_category: 'general',
          custom_parameter_1: currentCity,
          custom_parameter_2: currentMode,
          ...eventData
        });
    }
  }
}

// ============================
// FAVORITES
// ============================
function getFavorites() { try { return JSON.parse(localStorage.getItem('themove-favorites') || '[]'); } catch { return []; } }
function saveFavorites(favs) { localStorage.setItem('themove-favorites', JSON.stringify(favs)); updateFavBadge(); }
function isFavorited(venueId) { return getFavorites().includes(venueId); }

function toggleFavorite(venueId, e) {
  if (e) { e.stopPropagation(); e.preventDefault(); }
  track('favorite', { venue: venueId });
  const favs = getFavorites();
  const idx = favs.indexOf(venueId);
  if (idx >= 0) favs.splice(idx, 1); else favs.push(venueId);
  saveFavorites(favs);
  document.querySelectorAll(`.fav-btn[data-venue="${venueId}"]`).forEach(btn => {
    btn.innerHTML = favs.includes(venueId) ? '&#9829;' : '&#9825;';
    btn.classList.toggle('favorited', favs.includes(venueId));
    btn.classList.add('pop');
    setTimeout(() => btn.classList.remove('pop'), 300);
  });
  document.querySelectorAll(`.vd-action-btn[data-fav-venue="${venueId}"]`).forEach(btn => {
    const isFav = favs.includes(venueId);
    btn.innerHTML = (isFav ? '&#9829;' : '&#9825;') + ' ' + (isFav ? 'Favorited' : 'Favorite');
    btn.classList.toggle('favorited', isFav);
  });
}
window.toggleFavorite = toggleFavorite;

function updateFavBadge() {
  const count = getFavorites().length;
  const navBadge = document.getElementById('nav-fav-badge');
  const mainBadge = document.getElementById('main-fav-badge');
  
  // Update both badges (nav for desktop header, main for below search)
  if (navBadge) { navBadge.textContent = count; navBadge.style.display = count > 0 ? 'inline-flex' : 'none'; }
  if (mainBadge) { mainBadge.textContent = count; mainBadge.style.display = count > 0 ? 'inline-flex' : 'none'; }
}

// ============================
// TOAST
// ============================
function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  requestAnimationFrame(() => {
    el.classList.add('show');
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.classList.add('hidden'), 300); }, 2000);
  });
}

// ============================
// SHARE
// ============================
function shareItem(title, text, url, e) {
  if (e) { e.stopPropagation(); e.preventDefault(); }
  track('share', { venue: title });
  if (navigator.share) { navigator.share({ title, text, url }).catch(() => {}); }
  else { showShareMenu(title, text, url, e); }
}
window.shareItem = shareItem;

function showShareMenu(title, text, url, e) {
  // Remove existing menu
  document.querySelectorAll('.share-popup').forEach(el => el.remove());
  const popup = document.createElement('div');
  popup.className = 'share-popup';
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(text + ' ' + url);
  popup.innerHTML = `
    <div class="share-popup-title">Share</div>
    <a class="share-popup-item" href="https://twitter.com/intent/tweet?text=${encodedText}" target="_blank" onclick="event.stopPropagation()">
      <span class="share-popup-icon">&#120143;</span> Twitter / X
    </a>
    <a class="share-popup-item" href="https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}" target="_blank" onclick="event.stopPropagation()">
      <span class="share-popup-icon">f</span> Facebook
    </a>
    <a class="share-popup-item" href="sms:?body=${encodedText}" onclick="event.stopPropagation()">
      <span class="share-popup-icon">&#128172;</span> Text Message
    </a>
    <div class="share-popup-item" onclick="event.stopPropagation();navigator.clipboard.writeText('${url.replace(/'/g,"\\'")}').then(()=>{showToast('Link copied!');document.querySelectorAll('.share-popup').forEach(el=>el.remove())})">
      <span class="share-popup-icon">&#128279;</span> Copy Link
    </div>
  `;
  document.body.appendChild(popup);
  // Position near click
  if (e && e.target) {
    const rect = e.target.closest('button')?.getBoundingClientRect() || e.target.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.top = Math.min(rect.bottom + 8, window.innerHeight - 220) + 'px';
    popup.style.right = Math.max(8, window.innerWidth - rect.right) + 'px';
  }
  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function closeShare(ev) {
      if (!popup.contains(ev.target)) { popup.remove(); document.removeEventListener('click', closeShare); }
    });
  }, 10);
}

function shareIconSVG() {
  return '<svg viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>';
}

// ============================
// SURPRISE ME
// ============================
async function surpriseMe() {
  track('surprise_me');
  const btn = document.querySelector('.surprise-me-btn-sm') || document.querySelector('.surprise-me-btn');
  if (btn) { btn.innerHTML = '<span class="dice" style="animation:diceRoll 0.15s linear infinite">&#127922;</span> Finding a spot...'; btn.disabled = true; }
  try {
    const venues = await fetchJSON(`${cityApiBase()}/venues`);
    const modeVenues = venues.filter(v => v.timeOfDay && v.timeOfDay.includes(currentMode));
    const pool = modeVenues.length > 0 ? modeVenues : venues;
    const now = new Date();
    const openVenues = pool.filter(v => isVenueOpenNow(v, now));
    const pick = openVenues.length > 0 ? openVenues[Math.floor(Math.random() * openVenues.length)] : pool[Math.floor(Math.random() * pool.length)];
    await new Promise(r => setTimeout(r, 800));
    navigateTo(`#/${currentCity}/venue/${pick.id}`);
  } catch(err) { showToast('Something went wrong!'); }
}
window.surpriseMe = surpriseMe;

function isVenueOpenNow(venue, now) {
  const dayKeys = ['sun','mon','tue','wed','thu','fri','sat'];
  const dayKey = dayKeys[now.getDay()];
  const hours = venue.hours && venue.hours[dayKey];
  if (!hours || hours.toLowerCase() === 'closed') return false;
  const match = hours.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*-\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
  if (!match) return true;
  function parseTime(str) {
    str = str.trim().toLowerCase();
    const m = str.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
    if (!m) return 0;
    let h = parseInt(m[1]); const min = parseInt(m[2] || '0');
    if (m[3] === 'pm' && h !== 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
    return h * 60 + min;
  }
  const open = parseTime(match[1]); const close = parseTime(match[2]);
  const current = now.getHours() * 60 + now.getMinutes();
  if (close > open) return current >= open && current < close;
  return current >= open || current < close;
}

// ============================
// MOBILE MENU
// ============================
window.toggleMobileMenu = function() {
  const btn = document.getElementById('hamburger');
  const links = document.getElementById('nav-links');
  btn.classList.toggle('open');
  links.classList.toggle('open');
};

// ============================
// STATE
// ============================
let currentCategory = 'all';
let advancedOpen = false;
let advancedFilters = { categories: [], vibes: [], when: 'today', amenities: [] };
let currentCity = 'delray-beach';
let cities = [];

async function loadCities() {
  try { cities = await fetchJSON(`${API}/api/cities`); } catch(e) {
    cities = [{ id: 'delray-beach', name: 'Delray Beach', shortName: 'Delray', tagline: 'Your guide to what\'s happening in Delray Beach', active: true }];
  }
}

function getCurrentCityData() { return cities.find(c => c.id === currentCity) || cities[0] || { id: 'delray-beach', name: 'Delray Beach', shortName: 'Delray', tagline: '', active: true }; }
function cityApiBase() { return `${API}/api/${currentCity}`; }

// Nav scroll
window.addEventListener('scroll', function() {
  const nav = document.getElementById('nav');
  nav.classList.toggle('scrolled', window.scrollY > 10);
}, { passive: true });

// Utils
async function fetchJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return data;
  } catch(e) {
    console.error('fetchJSON error:', url, e);
    return [];
  }
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return m === 0 ? `${hour} ${ampm}` : `${hour}:${String(m).padStart(2,'0')} ${ampm}`;
}

function formatCategory(cat) { return cat.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); }
function formatVibe(v) { return v.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); }
function getTodayStr() { return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
function getEventTime(evt) { return (evt.recurring && evt.recurring.time) || (evt.oneTime && evt.oneTime.time) || ''; }

function getVenueInitials(name) {
  return name.split(/[\s]+/).filter(w => w.length > 0 && !['the','on','of','at','and','&','in'].includes(w.toLowerCase())).slice(0,2).map(w => w[0].toUpperCase()).join('');
}
function hashCode(str) { let hash = 0; for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; } return Math.abs(hash); }
function getPlaceholderGradient(id) {
  const palettes = [['#FF385C','#FF6B6B'],['#6C5CE7','#A29BFE'],['#00B894','#00CEC9'],['#00C2FF','#6C5CE7'],['#E84393','#FD79A8'],['#F39C12','#FDCB6E'],['#0891B2','#06B6D4'],['#10B981','#22C55E']];
  const h = hashCode(id); const pair = palettes[h % palettes.length];
  return `linear-gradient(${h % 360}deg, ${pair[0]} 0%, ${pair[1]} 100%)`;
}

function getCatColor(cat) {
  const colors = {
    'live-music': '#FF385C', 'trivia': '#6C5CE7', 'happy-hour': '#F59E0B', 'karaoke': '#FF6B6B',
    'watch-party': '#E17055', 'pool-darts': '#00CEC9', 'comedy': '#A29BFE', 'open-mic': '#FD79A8',
    'dj': '#E84393', 'food-specials': '#F39C12', 'yoga': '#06B6D4', 'beach-sports': '#0EA5E9',
    'water-sports': '#0284C7', 'fitness': '#10B981', 'hiking': '#059669', 'markets': '#D97706',
    'brunch': '#F97316', 'art-culture': '#8B5CF6', 'parks': '#22C55E', 'fishing': '#0D9488'
  };
  return colors[cat] || '#0891B2';
}

// ============================
// CITY SELECTOR
// ============================
function renderControlBar() {
  return `<div class="control-bar">
    ${renderCitySelector()}
    <div class="inline-mode-switcher">
      <button class="mode-pill ${currentMode==='day'?'active':''}" data-mode="day" onclick="setMode('day')">&#9728;&#65039; Day</button>
      <button class="mode-pill ${currentMode==='night'?'active':''}" data-mode="night" onclick="setMode('night')">&#127769; Night</button>
    </div>
    <button class="surprise-me-btn-sm" onclick="surpriseMe()"><span class="dice">&#127922;</span> Surprise Me</button>
  </div>`;
}

function renderCitySelector() {
  const cityData = getCurrentCityData();
  const activeCities = cities.filter(c => c.active);
  const inactiveCities = cities.filter(c => !c.active);
  return `<div class="city-selector">
    <div class="city-selector-current" onclick="toggleCityDropdown()">
      <span class="city-selector-icon">&#128205;</span>
      <span class="city-selector-name">${cityData.name}</span>
      <span class="city-selector-arrow">&#9662;</span>
    </div>
    <div class="city-dropdown" id="city-dropdown">
      ${activeCities.map(c => `<div class="city-dropdown-item ${c.id===currentCity?'active':''}" onclick="switchCity('${c.id}')">
        <span class="city-dropdown-name">${c.name}</span>
        ${c.id===currentCity?'<span class="city-dropdown-check">&#10003;</span>':''}
      </div>`).join('')}
      ${inactiveCities.length ? `<div class="city-dropdown-divider"></div><div class="city-dropdown-label">Coming Soon</div>
      ${inactiveCities.map(c => `<div class="city-dropdown-item disabled"><span class="city-dropdown-name">${c.name}</span><span class="city-coming-soon-badge">Soon</span></div>`).join('')}` : ''}
    </div>
  </div>`;
}

window.toggleCityDropdown = function() { document.getElementById('city-dropdown')?.classList.toggle('open'); };
window.switchCity = function(cityId) {
  const city = cities.find(c => c.id === cityId);
  if (!city || !city.active) return;
  track('city_switch', { city: cityId });
  currentCity = cityId; currentCategory = 'all';
  document.getElementById('city-dropdown')?.classList.remove('open');
  window.location.hash = `#/${currentCity}`;
};

document.addEventListener('click', function(e) {
  if (!e.target.closest('.city-selector')) document.getElementById('city-dropdown')?.classList.remove('open');
});

// ============================
// RENDER HELPERS
// ============================
function renderEventCard(evt) {
  const venueName = evt.venue ? evt.venue.name : '';
  const venueId = evt.venue ? evt.venue.id : evt.venueId;
  const time = formatTime(getEventTime(evt));
  const vibes = (evt.vibe || []).slice(0, 2);
  const isFree = evt.cover === 'Free';
  const barColor = getCatColor(evt.category);
  const shareUrl = `${window.location.origin}/#/${currentCity}/venue/${venueId}`;
  const shareText = `Check out ${evt.name} at ${venueName}!`;
  const favd = isFavorited(venueId);

  return `<div class="event-card" data-category="${evt.category}" onclick="navigateTo('#/${currentCity}/venue/${venueId}')">
    <div class="card-color-bar" style="background:${barColor}"></div>
    <div class="card-body">
      <div class="card-top-row">
        <div class="card-top-text">
          <div class="venue-name">${venueName}</div>
          <div class="event-name">${evt.name}</div>
        </div>
        <div class="card-actions">
          <button class="fav-btn ${favd?'favorited':''}" data-venue="${venueId}" onclick="toggleFavorite('${venueId}',event)" title="Favorite">${favd?'&#9829;':'&#9825;'}</button>
          <button class="share-btn" onclick="shareItem('${evt.name.replace(/'/g,"\\'")}','${shareText.replace(/'/g,"\\'")}','${shareUrl}',event)" title="Share">${shareIconSVG()}</button>
        </div>
      </div>
      <div class="event-meta">
        ${time?`<span class="event-time">${time}</span>`:''}
        <span class="tag tag-category" style="background:${barColor}18;color:${barColor};border:1px solid ${barColor}40">${formatCategory(evt.category)}</span>
        ${vibes.map(v => `<span class="tag tag-vibe">${formatVibe(v)}</span>`).join('')}
        ${isFree?'<span class="tag tag-free">Free</span>':''}
        ${evt.cover && !isFree && evt.cover !== 'Varies' ? `<span class="tag tag-cover">${evt.cover}</span>` : ''}
        ${evt.cover === 'Varies' ? '<span class="tag tag-cover">Cover Varies</span>' : ''}
      </div>
      <div class="event-desc">${evt.description}</div>
    </div>
  </div>`;
}

function getActiveFilterCount() { return advancedFilters.categories.length + advancedFilters.vibes.length + advancedFilters.amenities.length; }

function renderSearchBar() {
  const filterCount = getActiveFilterCount();
  const cats = getCategories().filter(c => c.id !== 'all');
  return `<div class="search-section">
    <div class="search-row">
      <div class="search-input-wrap">
        <span class="search-icon">&#128269;</span>
        <input type="text" class="search-input" placeholder="Search ${currentMode === 'day' ? 'activities, spots' : 'events, venues'}..." id="quick-search" oninput="handleQuickSearch(this.value)" onfocus="showSearchResults()">
      </div>
      <button class="filter-toggle ${advancedOpen?'active':''}" onclick="toggleAdvanced()" title="Filters">
        <span class="filter-icon">&#9776;</span> Filters
        <span class="filter-badge ${filterCount===0?'hidden':''}" id="filter-badge">${filterCount}</span>
      </button>
    </div>
    <div id="quick-results" class="quick-results hidden"></div>
    
    <!-- Navigation Links - moved from hamburger menu -->
    <div class="main-nav-links">
      <a href="#/" data-nav="today">Today</a>
      <a href="#/week" data-nav="week">This Week</a>
      <a href="#/venues" data-nav="venues" id="main-venues-label">${currentMode === 'night' ? 'Venues' : 'Spots'}</a>
      <a href="#/submit" data-nav="submit">Submit</a>
      <a href="#/favorites" data-nav="favorites" class="main-fav-link">&#9829; <span class="main-fav-badge" id="main-fav-badge" style="display:none">0</span></a>
    </div>
    
    <div id="advanced-panel" class="advanced-panel ${advancedOpen?'open':''}">
      <!-- Activities/Events moved to main filter area -->
      <div class="filter-group filter-activities">
        <div class="filter-label">${currentMode === 'day' ? 'Activities' : 'Events'}</div>
        <div class="filter-pills">${cats.map(c => `<button class="fpill ${advancedFilters.categories.includes(c.id)?'active':''}" onclick="toggleFilter('categories','${c.id}')">${c.label}</button>`).join('')}</div>
      </div>
      
      <div class="filter-group">
        <div class="filter-label">When?</div>
        <div class="filter-pills">${WHEN_OPTIONS.map(w => `<button class="fpill ${advancedFilters.when===w.id?'active':''}" onclick="setWhen('${w.id}')">${w.label}</button>`).join('')}</div>
      </div>
      
      <div class="filter-group">
        <div class="filter-label">Vibe?</div>
        <div class="filter-pills">${VIBES.map(v => `<button class="fpill ${advancedFilters.vibes.includes(v.id)?'active':''}" onclick="toggleFilter('vibes','${v.id}')">${v.label}</button>`).join('')}</div>
      </div>
      <div class="filter-actions">
        <button class="btn btn-sm" onclick="applyAdvanced()">Show Results</button>
        <button class="btn btn-sm btn-ghost" onclick="clearAdvanced()">Clear All</button>
        <span id="filter-count" class="filter-count"></span>
      </div>
    </div>
  </div>`;
}

// Search & filter
let searchTimeout = null;
window.handleQuickSearch = function(val) {
  clearTimeout(searchTimeout);
  if (!val.trim()) { document.getElementById('quick-results').classList.add('hidden'); return; }
  searchTimeout = setTimeout(async () => {
    track('filter_use', { search: val });
    const data = await fetchJSON(`${cityApiBase()}/search?q=${encodeURIComponent(val)}&mode=${currentMode}`);
    const container = document.getElementById('quick-results');
    if (!data.events.length && !data.venues.length) { container.innerHTML = '<div class="qr-empty">No results found</div>'; container.classList.remove('hidden'); return; }
    let html = '';
    if (data.venues.length) {
      html += `<div class="qr-section">${currentMode === 'night' ? 'Venues' : 'Spots'}</div>`;
      html += data.venues.slice(0,5).map(v => `<div class="qr-item" onclick="navigateTo('#/${currentCity}/venue/${v.id}')"><span class="qr-name">${v.name}</span><span class="qr-meta">${v.categories.slice(0,2).map(formatCategory).join(', ')}</span></div>`).join('');
    }
    if (data.events.length) {
      html += '<div class="qr-section">Events</div>';
      html += data.events.slice(0,8).map(e => `<div class="qr-item" onclick="navigateTo('#/${currentCity}/venue/${e.venueId}')"><span class="qr-name">${e.name}</span><span class="qr-meta">${e.venue?e.venue.name:''} &middot; ${formatCategory(e.category)}</span></div>`).join('');
    }
    container.innerHTML = html; container.classList.remove('hidden');
  }, 250);
};
window.showSearchResults = function() { const val = document.getElementById('quick-search')?.value; if (val && val.trim()) handleQuickSearch(val); };
window.toggleAdvanced = function() { advancedOpen = !advancedOpen; document.getElementById('advanced-panel')?.classList.toggle('open', advancedOpen); document.querySelector('.filter-toggle')?.classList.toggle('active', advancedOpen); };
window.setWhen = function(val) { advancedFilters.when = val; rerenderAdvanced(); };
window.toggleFilter = function(group, val) { const arr = advancedFilters[group]; const idx = arr.indexOf(val); if (idx >= 0) arr.splice(idx,1); else arr.push(val); rerenderAdvanced(); };

function rerenderAdvanced() {
  const panel = document.getElementById('advanced-panel');
  if (!panel) return;
  panel.querySelectorAll('.fpill').forEach(btn => {
    const onclick = btn.getAttribute('onclick');
    if (!onclick) return;
    const wm = onclick.match(/setWhen\('(.+?)'\)/);
    if (wm) { btn.classList.toggle('active', advancedFilters.when === wm[1]); return; }
    const tm = onclick.match(/toggleFilter\('(.+?)','(.+?)'\)/);
    if (tm) btn.classList.toggle('active', advancedFilters[tm[1]].includes(tm[2]));
  });
  const count = getActiveFilterCount();
  const el = document.getElementById('filter-count');
  if (el) el.textContent = count > 0 ? count + ' filter' + (count > 1 ? 's' : '') + ' active' : '';
  const badge = document.getElementById('filter-badge');
  if (badge) { badge.textContent = count; badge.classList.toggle('hidden', count === 0); }
}

window.applyAdvanced = async function() {
  track('filter_use', { filters: advancedFilters });
  const main = document.getElementById('main');
  try {
    const resp = await fetch(`${cityApiBase()}/discover`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ when: advancedFilters.when, categories: advancedFilters.categories.length ? advancedFilters.categories : undefined, vibes: advancedFilters.vibes.length ? advancedFilters.vibes : undefined, amenities: advancedFilters.amenities.length ? advancedFilters.amenities : undefined, mode: currentMode })
    });
    const data = await resp.json();
    const cityData = getCurrentCityData();
    let content = '';
    if (!data.events || data.events.length === 0) {
      content = `<div class="empty"><span class="empty-emoji">${currentMode === 'day' ? '&#9728;&#65039;' : '&#127769;'}</span><h3>No matches found</h3><p>Try removing some filters or <a href="#/${currentCity}/week">browse the full week</a></p></div>`;
    } else {
      content = `<div class="results-count">${data.total} result${data.total!==1?'s':''} found</div>` + data.events.map(renderEventCard).join('');
    }
    main.innerHTML = renderControlBar() + `<div class="hero"><h1>${currentMode === 'day' ? "What's happening" : "What's going on"} in <span class="city-name">${cityData.name}</span>?</h1><div class="tagline">${cityData.tagline}</div></div>` + renderSearchBar() + content;
  } catch(err) { showToast('Something went wrong'); }
};

window.clearAdvanced = function() { advancedFilters = { categories: [], vibes: [], when: 'today', amenities: [] }; rerenderAdvanced(); };

document.addEventListener('click', function(e) {
  const qr = document.getElementById('quick-results');
  const qs = document.getElementById('quick-search');
  if (qr && qs && !qr.contains(e.target) && e.target !== qs) qr.classList.add('hidden');
});

// ============================
// PAGES
// ============================
async function renderToday() {
  const cityData = getCurrentCityData();
  const url = currentCategory === 'all'
    ? `${cityApiBase()}/events?date=today&mode=${currentMode}`
    : `${cityApiBase()}/events?date=today&category=${currentCategory}&mode=${currentMode}`;
  const raw = await fetchJSON(url);
  const events = Array.isArray(raw) ? raw : [];

  const dayLabel = currentMode === 'day' ? 'today' : 'tonight';
  const emptyEmoji = currentMode === 'day' ? '&#9728;&#65039;' : '&#127769;';
  let content = '';
  if (events.length === 0) {
    content = `<div class="empty"><span class="empty-emoji">${emptyEmoji}</span><h3>Nothing ${currentCategory === 'all' ? 'happening' : 'in ' + formatCategory(currentCategory)} ${dayLabel}</h3><p>Check out <a href="#/${currentCity}/week">this week's lineup</a></p></div>`;
  } else {
    content = events.map(renderEventCard).join('');
  }

  const heroText = currentMode === 'day' ? `What's happening in <span class="city-name">${cityData.name}</span> today?` : `What's going on in <span class="city-name">${cityData.name}</span> tonight?`;

  const showGuide = !localStorage.getItem('tao-guide-seen');

  return `
    <div class="hero">
      <h1>${heroText}</h1>
      <div class="tagline">${cityData.tagline}</div>
      <div class="date-line">${getTodayStr()}</div>
    </div>
    ${showGuide ? `<div class="onboard-tips" id="welcome-guide">
      <p class="onboard-text">Pick your city, choose day or night, and we'll show you what's happening right now. Day mode is for beach days, yoga, brunch, and outdoor stuff. Night mode is for bars, live music, trivia, and going out. Can't decide? Hit Surprise Me and let us pick for you.</p>
      <button class="onboard-dismiss" onclick="document.getElementById('welcome-guide').remove();localStorage.setItem('tao-guide-seen','1')">Got it &#128076;</button>
    </div>` : ''}
    ${renderControlBar()}
    ${renderSearchBar()}
    <div id="events-list">${content}</div>`;
}

async function renderWeek() {
  const cityData = getCurrentCityData();
  const rawWeek = await fetchJSON(`${cityApiBase()}/events?date=week&mode=${currentMode}`);
  const data = Array.isArray(rawWeek) ? rawWeek : [];
  const venues = await fetchJSON(`${cityApiBase()}/venues`);

  let html = `${renderControlBar()}<div class="hero"><h1>This Week in <span class="city-name">${cityData.name}</span></h1><div class="tagline">${cityData.tagline}</div></div>`;

  for (const day of data) {
    if (day.events.length === 0) continue;
    const dayLabel = day.day.charAt(0).toUpperCase() + day.day.slice(1);
    const dateObj = new Date(day.date + 'T12:00:00');
    const dateLabel = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const eventsWithVenue = day.events.map(e => ({ ...e, venue: venues.find(v => v.id === e.venueId) || null }));
    eventsWithVenue.sort((a, b) => getEventTime(a).localeCompare(getEventTime(b)));

    html += `<div class="day-group"><div class="day-header ${day.isToday?'is-today':''}">${dayLabel} ${dateLabel} ${day.isToday?'<span class="today-badge">TODAY</span>':''}</div>${eventsWithVenue.map(renderEventCard).join('')}</div>`;
  }
  return html;
}

async function renderVenues() {
  const cityData = getCurrentCityData();
  const venues = await fetchJSON(`${cityApiBase()}/venues`);
  const modeVenues = venues.filter(v => !v.timeOfDay || v.timeOfDay.includes(currentMode));
  return `${renderControlBar()}
    <div class="hero"><h1>${currentMode === 'day' ? 'Spots' : 'Venues'} in <span class="city-name">${cityData.name}</span></h1><div class="tagline">${cityData.tagline}</div></div>
    <div class="search-bar-wrap"><span class="search-icon">&#128269;</span><input type="text" class="search-bar" placeholder="Search ${currentMode === 'night' ? 'venues' : 'spots'}..." oninput="filterVenues(this.value)" id="venue-search"></div>
    <div id="venues-list" class="venues-grid">${modeVenues.map(renderVenueCard).join('')}</div>`;
}

function renderVenueCard(v) {
  const initials = getVenueInitials(v.name);
  const gradient = getPlaceholderGradient(v.id);
  const hasImage = v.image && v.image !== null;
  const imageArea = hasImage ? `<div class="v-image" style="background-image:url('${v.image}')"></div>` : `<div class="v-image-placeholder" style="background: ${gradient}"><span>${initials}</span></div>`;
  const favd = isFavorited(v.id);
  const shareUrl = `${window.location.origin}/#/${currentCity}/venue/${v.id}`;
  return `<div class="venue-card" onclick="navigateTo('#/${currentCity}/venue/${v.id}')">
    ${imageArea}
    <div class="v-body">
      <div class="card-top-row">
        <div class="card-top-text"><div class="v-name">${v.name}</div><div class="v-address">${v.address}</div></div>
        <div class="card-actions">
          <button class="fav-btn ${favd?'favorited':''}" data-venue="${v.id}" onclick="toggleFavorite('${v.id}',event)" title="Favorite">${favd?'&#9829;':'&#9825;'}</button>
          <button class="share-btn" onclick="shareItem('${v.name.replace(/'/g,"\\'")}','Check out ${v.name.replace(/'/g,"\\'")} on The Active Owl!','${shareUrl}',event)" title="Share">${shareIconSVG()}</button>
        </div>
      </div>
      <div class="v-tags">
        ${v.categories.map(c => `<span class="tag tag-category" style="background:${getCatColor(c)}18;color:${getCatColor(c)}">${formatCategory(c)}</span>`).join('')}
        ${(v.vibes||[]).slice(0,2).map(vi => `<span class="tag tag-vibe">${formatVibe(vi)}</span>`).join('')}
      </div>
    </div>
  </div>`;
}

async function renderVenueDetail(id) {
  const data = await fetchJSON(`${cityApiBase()}/venues/${id}`);
  if (data.error) return '<div class="empty"><span class="empty-emoji">&#128533;</span><h3>Venue not found</h3></div>';

  const daysOrder = ['mon','tue','wed','thu','fri','sat','sun'];
  const daysFull = { mon:'Monday', tue:'Tuesday', wed:'Wednesday', thu:'Thursday', fri:'Friday', sat:'Saturday', sun:'Sunday' };

  const schedule = {};
  (data.events||[]).forEach(evt => { if (evt.recurring) { const d = evt.recurring.day; if (!schedule[d]) schedule[d]=[]; schedule[d].push(evt); } });

  let weeklyEventsHTML = '';
  const dayOrder = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const dayAbbrev = { monday:'MON', tuesday:'TUE', wednesday:'WED', thursday:'THU', friday:'FRI', saturday:'SAT', sunday:'SUN' };
  for (const day of dayOrder) {
    for (const evt of (schedule[day]||[])) {
      weeklyEventsHTML += `<div class="weekly-event"><div class="we-day">${dayAbbrev[day]}</div><div class="we-dot" style="background:${getCatColor(evt.category)}"></div><div class="we-info"><div class="we-name">${evt.name}</div><div class="we-time">${formatTime(evt.recurring.time)}</div></div></div>`;
    }
  }

  const infoItems = [];
  if (data.phone) infoItems.push(`<span class="vd-info-item"><a href="tel:${data.phone}">&#9742; ${data.phone}</a></span>`);
  if (data.website) infoItems.push(`<span class="vd-info-item"><a href="${data.website}" target="_blank">&#127760; Website</a></span>`);
  if (data.instagram) infoItems.push(`<span class="vd-info-item"><a href="https://instagram.com/${data.instagram.replace('@','')}" target="_blank">&#128247; ${data.instagram}</a></span>`);

  const rawToday = await fetchJSON(`${cityApiBase()}/events?date=today`);
  const todayEvents = Array.isArray(rawToday) ? rawToday : [];
  const venueToday = todayEvents.filter(e => e.venueId === data.id);

  return `<div class="venue-detail">
    <a href="#/${currentCity}/venues" class="back-link">&#8592; ${currentMode === 'night' ? 'All Venues' : 'All Spots'}</a>
    ${data.image ? `<div class="vd-hero-image" style="background-image:url('${data.image}')"></div>` : ''}
    <div class="vd-header">
      <div class="vd-name">${data.name}</div>
      <div class="vd-address">${data.address}</div>
      ${data.description ? `<div class="vd-description">${data.description}</div>` : ''}
      <div class="vd-info">${infoItems.join('')}</div>
      <div class="vd-tags">
        ${(data.vibes||[]).map(v => `<span class="tag tag-vibe">${formatVibe(v)}</span>`).join('')}
        ${(data.amenities||[]).map(a => `<span class="tag tag-category">${formatCategory(a)}</span>`).join('')}
      </div>
      <div class="vd-actions">
        <button class="vd-action-btn ${isFavorited(data.id)?'favorited':''}" data-fav-venue="${data.id}" onclick="toggleFavorite('${data.id}',event)">${isFavorited(data.id)?'&#9829; Favorited':'&#9825; Favorite'}</button>
        <button class="vd-action-btn" onclick="shareItem('${data.name.replace(/'/g,"\\'")}','Check out ${data.name.replace(/'/g,"\\'")} on The Active Owl!','${window.location.origin}/#/${currentCity}/venue/${data.id}',event)">&#8599; Share</button>
      </div>
    </div>
    ${data.hours ? `<div class="section-title">Hours</div><div class="schedule-grid">${daysOrder.map(d => `<div class="schedule-row"><div class="day-name">${daysFull[d]}</div><div class="hours">${data.hours[d]||'Closed'}</div></div>`).join('')}</div>` : ''}
    ${weeklyEventsHTML ? `<div class="section-title">Weekly Schedule</div>${weeklyEventsHTML}` : ''}
    ${venueToday.length > 0 ? `<div class="section-title">Happening Today</div>${venueToday.map(e => renderEventCard({...e, venue: data})).join('')}` : ''}
  </div>`;
}

async function renderFavorites() {
  const favIds = getFavorites();
  if (favIds.length === 0) {
    return `${renderControlBar()}<div class="hero"><h1>Your <span class="city-name">Favorites</span></h1></div>
    <div class="favorites-empty"><div class="fav-empty-icon">&#9825;</div><h3>No favorites yet</h3><p>Tap the heart on any spot to save it here.</p></div>`;
  }
  const venues = await fetchJSON(`${cityApiBase()}/venues`);
  const favVenues = venues.filter(v => favIds.includes(v.id));
  return `${renderControlBar()}<div class="hero"><h1>Your <span class="city-name">Favorites</span></h1><div class="tagline">${favVenues.length} saved spot${favVenues.length!==1?'s':''}</div></div>
  <div class="venues-grid">${favVenues.map(renderVenueCard).join('')}</div>`;
}

async function renderSubmit() {
  const cityData = getCurrentCityData();
  const cats = [...DAY_CATEGORIES, ...NIGHT_CATEGORIES].filter((c, i, a) => c.id !== 'all' && a.findIndex(x => x.id === c.id) === i);
  return `${renderControlBar()}<div class="hero"><h1>Submit a <span class="city-name">Spot</span></h1><div class="tagline">Know about something happening in ${cityData.name}? Let us know.</div></div>
  <form id="submit-form" onsubmit="handleSubmit(event)">
    <div class="form-group"><label>City</label><input type="text" name="city" value="${cityData.name}" readonly></div>
    <div class="form-group"><label>Venue Name</label><input type="text" name="venueName" required placeholder="e.g. Boston's on the Beach"></div>
    <div class="form-group"><label>Event Name</label><input type="text" name="eventName" required placeholder="e.g. Trivia Night"></div>
    <div class="form-group"><label>Date</label><input type="date" name="date" required></div>
    <div class="form-group"><label>Time</label><input type="time" name="time" required></div>
    <div class="form-group"><label>Category</label><select name="category" required>${cats.map(c => `<option value="${c.id}">${c.label}</option>`).join('')}</select></div>
    <div class="form-group"><label>Description</label><textarea name="description" placeholder="Tell us about it..."></textarea></div>
    <div class="form-group"><label>Your Contact (optional)</label><input type="text" name="contact" placeholder="Email or phone"></div>
    <button type="submit" class="btn">Submit</button>
    <div id="submit-result"></div>
  </form>`;
}

function renderComingSoon() {
  const cityData = getCurrentCityData();
  return `${renderControlBar()}<div class="coming-soon-page"><div class="coming-soon-icon">&#128640;</div><h1>${cityData.name}</h1><h2>Coming Soon</h2><p>We're scouting the best spots in ${cityData.name}. Stay tuned.</p><a href="#/delray-beach" class="btn" style="display:inline-block;margin-top:20px;">Explore Delray Beach</a></div>`;
}

// ============================
// ACTIONS
// ============================
window.filterCategory = function(cat) { currentCategory = cat; route(); };
window.navigateTo = function(hash) { window.location.hash = hash; };
window.filterVenues = async function(query) {
  const q = query.toLowerCase();
  const venues = await fetchJSON(`${cityApiBase()}/venues`);
  const filtered = venues.filter(v => (!v.timeOfDay || v.timeOfDay.includes(currentMode)) && (v.name.toLowerCase().includes(q) || v.address.toLowerCase().includes(q) || v.categories.some(c => c.includes(q)) || (v.vibes||[]).some(vi => vi.includes(q))));
  document.getElementById('venues-list').className = 'venues-grid';
  document.getElementById('venues-list').innerHTML = filtered.map(renderVenueCard).join('');
};
window.handleSubmit = async function(e) {
  e.preventDefault();
  const form = e.target;
  const data = { city: currentCity, venueName: form.venueName.value, eventName: form.eventName.value, date: form.date.value, time: form.time.value, category: form.category.value, description: form.description.value, contact: form.contact.value };
  try {
    const res = await fetch(`${API}/api/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const result = await res.json();
    if (result.success) { document.getElementById('submit-result').innerHTML = '<div class="success-msg">&#10003; Submitted! We\'ll review and add it soon.</div>'; form.reset(); }
  } catch(err) { document.getElementById('submit-result').innerHTML = '<div class="success-msg" style="color:#FF6B6B;border-color:rgba(255,107,107,0.3)">Something went wrong. Try again.</div>'; }
};

// ============================
// ROUTER
// ============================
function parseHash(hash) {
  hash = hash.replace(/^#\/?/, '');
  const parts = hash.split('/').filter(Boolean);
  if (parts.length === 0) return { city: currentCity, page: 'today' };
  const knownCity = cities.find(c => c.id === parts[0]);
  if (knownCity) {
    const city = parts[0]; const rest = parts.slice(1);
    if (rest.length === 0) return { city, page: 'today' };
    if (rest[0] === 'week') return { city, page: 'week' };
    if (rest[0] === 'venues') return { city, page: 'venues' };
    if (rest[0] === 'venue' && rest[1]) return { city, page: 'venue', id: rest[1] };
    if (rest[0] === 'submit') return { city, page: 'submit' };
    if (rest[0] === 'favorites') return { city, page: 'favorites' };
    return { city, page: 'today' };
  }
  if (parts[0] === 'week') return { city: currentCity, page: 'week' };
  if (parts[0] === 'venues') return { city: currentCity, page: 'venues' };
  if (parts[0] === 'venue' && parts[1]) return { city: currentCity, page: 'venue', id: parts[1] };
  if (parts[0] === 'submit') return { city: currentCity, page: 'submit' };
  if (parts[0] === 'favorites') return { city: currentCity, page: 'favorites' };
  return { city: currentCity, page: 'today' };
}

async function route() {
  const hash = window.location.hash || '#/';
  const main = document.getElementById('main');
  const parsed = parseHash(hash);
  currentCity = parsed.city;
  const cityData = getCurrentCityData();

  // Update nav
  document.querySelectorAll('.nav-links a').forEach(a => {
    a.classList.remove('active');
    if (parsed.page === 'today' && a.dataset.nav === 'today') a.classList.add('active');
    else if (parsed.page === 'week' && a.dataset.nav === 'week') a.classList.add('active');
    else if ((parsed.page === 'venue' || parsed.page === 'venues') && a.dataset.nav === 'venues') a.classList.add('active');
    else if (parsed.page === 'submit' && a.dataset.nav === 'submit') a.classList.add('active');
    else if (parsed.page === 'favorites' && a.dataset.nav === 'favorites') a.classList.add('active');
  });

  // Update nav link text based on mode
  const todayLink = document.querySelector('[data-nav="today"]');
  if (todayLink) todayLink.textContent = currentMode === 'day' ? 'Today' : 'Tonight';

  // Update nav hrefs
  document.querySelectorAll('.nav-links a').forEach(a => {
    const nav = a.dataset.nav;
    if (nav === 'today') a.href = `#/${currentCity}`;
    else if (nav === 'week') a.href = `#/${currentCity}/week`;
    else if (nav === 'venues') a.href = `#/${currentCity}/venues`;
    else if (nav === 'submit') a.href = `#/${currentCity}/submit`;
    else if (nav === 'favorites') a.href = `#/${currentCity}/favorites`;
  });

  const footerLoc = document.querySelector('.footer-location');
  if (footerLoc) footerLoc.textContent = cityData ? cityData.name + ', FL' : 'South Florida';

  // Close mobile menu on navigate
  document.getElementById('hamburger')?.classList.remove('open');
  document.getElementById('nav-links')?.classList.remove('open');

  main.innerHTML = '<div class="loading">Loading...</div>';
  main.style.animation = 'none'; main.offsetHeight; main.style.animation = '';

  if (cityData && !cityData.active) { main.innerHTML = renderComingSoon(); return; }

  try {
    if (parsed.page === 'today') main.innerHTML = await renderToday();
    else if (parsed.page === 'week') main.innerHTML = await renderWeek();
    else if (parsed.page === 'venues') main.innerHTML = await renderVenues();
    else if (parsed.page === 'venue') main.innerHTML = await renderVenueDetail(parsed.id);
    else if (parsed.page === 'submit') main.innerHTML = await renderSubmit();
    else if (parsed.page === 'favorites') main.innerHTML = await renderFavorites();
    else main.innerHTML = await renderToday();
  } catch(err) {
    main.innerHTML = '<div class="empty"><span class="empty-emoji">&#128533;</span><h3>Something went wrong</h3><p>' + err.message + '</p></div>';
  }
}

window.addEventListener('hashchange', () => {
  const parsed = parseHash(window.location.hash);
  track('pageview', { page: parsed.page, venue: parsed.id || '' });
  if (parsed.page === 'venue' && parsed.id) track('venue_click', { venue: parsed.id });
  if (parsed.page === 'today' || parsed.city !== currentCity) currentCategory = 'all';
  route();
});

// Init
(async function() {
  await loadCities();
  const parsed = parseHash(window.location.hash);
  currentCity = parsed.city;
  updateFavBadge();
  route();
})();
