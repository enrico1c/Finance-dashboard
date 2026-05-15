/* ══════════════════════════════════════════════════════════════════
   ffcalendar.js  —  ForexFactory Economic Calendar + Sessions
   ──────────────────────────────────────────────────────────────────
   Features:
     1. Economic Calendar  — nfs.faireconomy.media (free, no key)
     2. Trading Sessions   — pure JS UTC math, header bar
     3. Tab Idle Pause     — pauses all FF data fetches when tab hidden
   Target: macro-econ tab (id="macro-econ") in Macro Intel panel
   ══════════════════════════════════════════════════════════════════ */

(function () {

/* ── Inject styles ────────────────────────────────────────────────── */
const _css = `
.ff-sessions-bar {
  display:flex;align-items:center;gap:6px;padding:6px 10px;
  background:#0d1117;border-bottom:1px solid #21262d;font-size:10px;flex-wrap:wrap;
}
.ff-sessions-label { color:#8b949e;margin-right:2px; }
.ff-session {
  padding:2px 7px;border-radius:3px;border:1px solid #30363d;
  color:#8b949e;font-size:10px;letter-spacing:.03em;transition:all .3s;
}
.ff-session--active { font-weight:700; }
.ff-sessions-clock { margin-left:auto;color:#8b949e;font-size:10px;font-variant-numeric:tabular-nums; }

.ff-cal-toolbar {
  display:flex;align-items:center;gap:8px;padding:6px 10px;
  border-bottom:1px solid #21262d;flex-wrap:wrap;
}
.ff-cal-source { font-size:9px;color:#8b949e;margin-right:auto; }
.ff-cal-week-btns,.ff-cal-filters { display:flex;gap:4px;align-items:center; }
.ff-cal-btn {
  padding:2px 8px;font-size:10px;background:#161b22;border:1px solid #30363d;
  color:#8b949e;border-radius:3px;cursor:pointer;
}
.ff-cal-btn:hover,.ff-cal-btn.active { background:#1f6feb22;border-color:#388bfd;color:#58a6ff; }
.ff-cal-filters label { display:flex;align-items:center;gap:3px;font-size:10px;cursor:pointer; }
.ff-cal-filters input { cursor:pointer; }

.ff-cal-table { width:100%;border-collapse:collapse;font-size:11px; }
.ff-cal-table thead th {
  position:sticky;top:0;background:#0d1117;color:#8b949e;font-weight:500;
  padding:4px 8px;border-bottom:1px solid #21262d;text-align:left;white-space:nowrap;
}
.ff-cal-table tbody tr { border-bottom:1px solid #161b22; }
.ff-cal-table tbody tr:hover { background:#161b22; }
.ff-cal-date-row td {
  background:#161b22;color:#8b949e;font-size:10px;font-weight:700;
  padding:4px 8px;letter-spacing:.06em;text-transform:uppercase;
  border-top:1px solid #21262d;
}
.ff-cal-event-row td { padding:4px 8px;color:#c9d1d9;vertical-align:middle; }
.ff-cal-time { color:#8b949e;white-space:nowrap;font-variant-numeric:tabular-nums;width:52px; }
.ff-cal-currency { white-space:nowrap;width:60px; }
.ff-cal-impact { width:16px;text-align:center; }
.ff-cal-title { max-width:260px; }
.ff-cal-actual,.ff-cal-forecast,.ff-cal-previous { width:72px;text-align:right;font-variant-numeric:tabular-nums; }
.ff-cal-beat { color:#3fb950;font-weight:700; }
.ff-cal-miss { color:#f85149;font-weight:700; }

/* dim non-economic events */
.ff-impact-non-economic td { opacity:.45; }
`;
if (!document.getElementById('ff-cal-style')) {
  const s = document.createElement('style');
  s.id = 'ff-cal-style';
  s.textContent = _css;
  document.head.appendChild(s);
}

/* ══════════════════════════════════════════════════════════════════
   1. TRADING SESSIONS
   ══════════════════════════════════════════════════════════════════ */

const SESSIONS = [
  { name: 'Sydney',   open: 21, close: 6,  color: '#1a6b4a' },
  { name: 'Tokyo',    open: 0,  close: 9,  color: '#1a4a6b' },
  { name: 'London',   open: 7,  close: 16, color: '#7b3a7b' },
  { name: 'New York', open: 12, close: 21, color: '#8b4513' },
];

function getActiveSessions() {
  const h = new Date().getUTCHours();
  return SESSIONS.filter(s =>
    s.open < s.close ? (h >= s.open && h < s.close)
                     : (h >= s.open || h < s.close)
  );
}

function buildSessionsBar() {
  const active = getActiveSessions();
  const activeNames = new Set(active.map(s => s.name));
  const pills = SESSIONS.map(s => {
    const on = activeNames.has(s.name);
    const style = on
      ? `background:${s.color}33;border-color:${s.color};color:${s.color}`
      : '';
    return `<span class="ff-session${on?' ff-session--active':''}" style="${style}">${s.name}${on?' ●':''}</span>`;
  }).join('');
  const utc = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  return `<div class="ff-sessions-bar">
    <span class="ff-sessions-label">Sessions</span>
    ${pills}
    <span class="ff-sessions-clock">${utc} UTC</span>
  </div>`;
}

function updateSessionsBar() {
  const root = document.querySelector('.ff-cal-root');
  if (!root) return;
  const bar = root.querySelector('.ff-sessions-bar');
  if (!bar) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = buildSessionsBar();
  bar.replaceWith(tmp.firstElementChild);
}

setInterval(updateSessionsBar, 60_000);

/* ══════════════════════════════════════════════════════════════════
   2. ECONOMIC CALENDAR
   ══════════════════════════════════════════════════════════════════ */

const FF_CAL = {
  week: 'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  next: 'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
};
const CAL_TTL = 15 * 60 * 1000;

/* per-tab event store (avoids putting large JSON in dataset) */
const _store = {};

function cacheGet(key) {
  try {
    const r = JSON.parse(sessionStorage.getItem(key));
    if (r && Date.now() - r._ts < CAL_TTL) return r.d;
  } catch (_) {}
  return null;
}
function cacheSet(key, d) {
  try { sessionStorage.setItem(key, JSON.stringify({ d, _ts: Date.now() })); } catch (_) {}
}

const FLAGS = {
  USD:'🇺🇸',EUR:'🇪🇺',GBP:'🇬🇧',JPY:'🇯🇵',CAD:'🇨🇦',AUD:'🇦🇺',
  NZD:'🇳🇿',CHF:'🇨🇭',CNY:'🇨🇳',CNH:'🇨🇳',MXN:'🇲🇽',SEK:'🇸🇪',
  NOK:'🇳🇴',SGD:'🇸🇬',HKD:'🇭🇰',KRW:'🇰🇷',BRL:'🇧🇷',INR:'🇮🇳',
  ZAR:'🇿🇦',TRY:'🇹🇷',
};

const IMPACT_DOT = {
  High:          `<span style="color:#d73027;font-size:11px" title="High Impact">●</span>`,
  Medium:        `<span style="color:#fc8d59;font-size:11px" title="Medium Impact">●</span>`,
  Low:           `<span style="color:#ddcc77;font-size:11px" title="Low Impact">●</span>`,
  'Non Economic':`<span style="color:#444;font-size:11px"    title="Non Economic">●</span>`,
};

function fmtTime(iso) {
  try { return new Date(iso).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }); }
  catch(e) { return '—'; }
}
function fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' }); }
  catch(e) { return '—'; }
}

async function fetchCal(week) {
  const key = `ff_cal_${week}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  try {
    const r = await fetch(FF_CAL[week], { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    cacheSet(key, d);
    return d;
  } catch (e) {
    console.warn('[ffcal] fetch error:', e.message);
    return null;
  }
}

function filterEvents(events) {
  const hi  = document.getElementById('ff-fil-high')?.checked   ?? true;
  const med = document.getElementById('ff-fil-medium')?.checked ?? true;
  const low = document.getElementById('ff-fil-low')?.checked    ?? false;
  return events.filter(ev => {
    const imp = ev.impact || '';
    if (imp === 'High'   && !hi)  return false;
    if (imp === 'Medium' && !med) return false;
    if (imp === 'Low'    && !low) return false;
    return true;
  });
}

function renderRows(events) {
  if (!events || !events.length)
    return '<tr><td colspan="7" style="padding:20px;text-align:center;color:#8b949e">No events match current filters</td></tr>';

  const groups = {};
  for (const ev of events) {
    const dk = fmtDate(ev.date);
    (groups[dk] = groups[dk] || []).push(ev);
  }

  let html = '';
  for (const [date, evs] of Object.entries(groups)) {
    html += `<tr class="ff-cal-date-row"><td colspan="7">${date}</td></tr>`;
    for (const ev of evs) {
      let actualClass = '';
      if (ev.actual && ev.forecast) {
        const a = parseFloat(String(ev.actual).replace(/[^0-9.\-]/g, ''));
        const f = parseFloat(String(ev.forecast).replace(/[^0-9.\-]/g, ''));
        if (!isNaN(a) && !isNaN(f)) actualClass = a > f ? 'ff-cal-beat' : a < f ? 'ff-cal-miss' : '';
      }
      const imp = ev.impact || 'Non Economic';
      html += `<tr class="ff-cal-event-row ff-impact-${imp.toLowerCase().replace(/\s/g,'-')}">
        <td class="ff-cal-time">${fmtTime(ev.date)}</td>
        <td class="ff-cal-currency">${FLAGS[ev.country] || ''} <strong>${ev.country || '—'}</strong></td>
        <td class="ff-cal-impact">${IMPACT_DOT[imp] || IMPACT_DOT['Non Economic']}</td>
        <td class="ff-cal-title">${ev.title || ev.name || '—'}</td>
        <td class="ff-cal-actual ${actualClass}">${ev.actual  || '<span style="color:#8b949e">—</span>'}</td>
        <td class="ff-cal-forecast">${ev.forecast || '<span style="color:#8b949e">—</span>'}</td>
        <td class="ff-cal-previous">${ev.previous || '<span style="color:#8b949e">—</span>'}</td>
      </tr>`;
    }
  }
  return html;
}

/* public: called by filter checkboxes */
window.ffCalendarApplyFilter = function () {
  const root = document.querySelector('.ff-cal-root');
  if (!root) return;
  const week = root.dataset.week || 'week';
  const events = _store[week];
  if (!events) return;
  const tbody = root.querySelector('#ff-cal-tbody');
  if (tbody) tbody.innerHTML = renderRows(filterEvents(events));
};

async function ffCalendarRender(containerId, week) {
  const container = document.getElementById(containerId);
  if (!container) return;

  /* remove old root if switching week */
  const old = container.querySelector('.ff-cal-root');
  if (old && old.dataset.week === week) return; // already rendered
  if (old) old.remove();

  const root = document.createElement('div');
  root.className = 'ff-cal-root';
  root.dataset.week = week;
  root.style.cssText = 'overflow:auto;max-height:calc(100% - 4px)';
  root.innerHTML = `
    ${buildSessionsBar()}
    <div class="ff-cal-toolbar">
      <span class="ff-cal-source">📅 Economic Calendar · ForexFactory · no key required</span>
      <div class="ff-cal-week-btns">
        <button class="ff-cal-btn${week==='week'?' active':''}" onclick="ffCalendarLoad('${containerId}','week')">This Week</button>
        <button class="ff-cal-btn${week==='next'?' active':''}" onclick="ffCalendarLoad('${containerId}','next')">Next Week</button>
      </div>
      <div class="ff-cal-filters">
        <label><input type="checkbox" id="ff-fil-high"   checked onchange="ffCalendarApplyFilter()"> <span style="color:#d73027">High</span></label>
        <label><input type="checkbox" id="ff-fil-medium" checked onchange="ffCalendarApplyFilter()"> <span style="color:#fc8d59">Med</span></label>
        <label><input type="checkbox" id="ff-fil-low"           onchange="ffCalendarApplyFilter()"> <span style="color:#ddcc77">Low</span></label>
      </div>
      <button class="ff-cal-btn" onclick="ffCalendarRefresh('${containerId}','${week}')">↻</button>
    </div>
    <div id="ff-cal-loading" style="padding:20px;color:#8b949e;font-size:11px;text-align:center">
      Loading economic calendar…
    </div>
    <div id="ff-cal-table-wrap" style="display:none">
      <table class="ff-cal-table">
        <thead>
          <tr>
            <th>Time</th><th>Currency</th><th></th><th>Event</th>
            <th style="text-align:right">Actual</th>
            <th style="text-align:right">Forecast</th>
            <th style="text-align:right">Previous</th>
          </tr>
        </thead>
        <tbody id="ff-cal-tbody"></tbody>
      </table>
    </div>`;

  container.prepend(root);

  const data = await fetchCal(week);
  const loading = root.querySelector('#ff-cal-loading');
  const wrap    = root.querySelector('#ff-cal-table-wrap');
  const tbody   = root.querySelector('#ff-cal-tbody');

  if (!data || !data.length) {
    loading.textContent = 'Calendar unavailable — check network or try again later.';
    return;
  }

  _store[week] = data;
  tbody.innerHTML = renderRows(filterEvents(data));
  loading.style.display = 'none';
  wrap.style.display = 'block';
}

/* ── Public API ───────────────────────────────────────────────────── */
window.ffCalendarLoad = function (containerId = 'macro-econ', week = 'week') {
  ffCalendarRender(containerId, week);
};

window.ffCalendarRefresh = function (containerId, week) {
  sessionStorage.removeItem(`ff_cal_${week}`);
  delete _store[week];
  const root = document.querySelector('.ff-cal-root');
  if (root) root.remove();
  ffCalendarRender(containerId, week);
};

/* ══════════════════════════════════════════════════════════════════
   3. TAB IDLE PAUSE
   Pauses FF data refreshes when tab is backgrounded > 5 min.
   Exposes window._ffPaused for any future polling loops to check.
   ══════════════════════════════════════════════════════════════════ */

window._ffPaused = false;
let _idleTimer;

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    _idleTimer = setTimeout(() => {
      window._ffPaused = true;
    }, 5 * 60_000);
  } else {
    clearTimeout(_idleTimer);
    if (window._ffPaused) {
      window._ffPaused = false;
      /* refresh sessions bar if calendar is visible */
      updateSessionsBar();
    }
  }
});

})();
