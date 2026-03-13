/* ══════════════════════════════════════════════════════════════════
   FINTERM — supabase.js
   Persistent storage for WM intelligence + news articles.
   Strategy: max compression, deduplication, TTL pruning.
   ══════════════════════════════════════════════════════════════════

   SCHEMA (all in one public schema, RLS disabled for anon):

   table: ft_events
     id          text  PK   (sha1-like hash of content)
     type        text        category: news|intel|quake|unrest|weather|iran|risk|cyber|supply
     ticker      text        nullable — linked asset
     topic       text        nullable — topic/sector
     ts          bigint      unix seconds
     sev         text        critical|high|medium|low
     title       text
     body        text        nullable — compressed summary max 280 chars
     url         text        nullable
     src         text        nullable — source name
     country     text        nullable
     saved_at    bigint      unix seconds — for TTL pruning

   Indexes: (type, ts DESC), (ticker, ts DESC), (sev, ts DESC)
   TTL: 30 days for news, 90 days for intel/risk
   Max rows kept: 5000 total (pruned on write)
   ══════════════════════════════════════════════════════════════════ */

const SB_URL  = 'https://zvvsdxzdywagtsgndbqd.supabase.co';
const SB_KEY  = 'sb_publishable_lIKXA5g0XrRqkW4FNgyS6Q_Znizu4m4';
const SB_HDR  = { 'Content-Type':'application/json', 'apikey': SB_KEY, 'Authorization':`Bearer ${SB_KEY}` };
const SB_TABLE = 'ft_events';

/* ── In-memory read cache (avoid redundant GETs) ────────────────── */
const _sbCache = new Map(); // cacheKey → { data, ts }
const _sbCacheTTL = 45_000; // 45s

/* ── Tiny hash for dedup IDs ────────────────────────────────────── */
function sbHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < Math.min(str.length, 256); i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/* ── Compress body text: max 280 chars, strip HTML ─────────────── */
function sbCompress(text) {
  if (!text) return null;
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280) || null;
}

/* ── Generic REST call ──────────────────────────────────────────── */
async function sbFetch(path, method = 'GET', body = null, extraHeaders = {}) {
  const opts = {
    method,
    headers: { ...SB_HDR, ...extraHeaders },
    signal: AbortSignal.timeout(8000),
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, opts);
  if (!res.ok) {
    const err = await res.text().catch(() => res.status);
    throw new Error(`SB ${method} ${path} → ${res.status}: ${err}`);
  }
  if (method === 'GET') return res.json();
  return res.text();
}

/* ══════════════════════════════════════════════════════════════════
   SCHEMA BOOTSTRAP — create table if not exists via RPC
   (Supabase auto-creates table on first upsert if using service key;
    with publishable key we use a pre-created table)
   ══════════════════════════════════════════════════════════════════ */
let _sbReady = false;
let _sbInitPromise = null;

async function sbEnsureTable() {
  // Try a lightweight SELECT to verify table exists
  try {
    await sbFetch(`${SB_TABLE}?select=id&limit=1`, 'GET', null, { 'Prefer': 'count=none' });
    _sbReady = true;
  } catch(e) {
    console.warn('[SB] Table check failed — will attempt to create via SQL RPC:', e.message);
    // Try creating the table via Supabase SQL RPC
    try {
      await sbFetch('rpc/exec_sql', 'POST', {
        sql: `
          CREATE TABLE IF NOT EXISTS public.ft_events (
            id        TEXT PRIMARY KEY,
            type      TEXT NOT NULL,
            ticker    TEXT,
            topic     TEXT,
            ts        BIGINT NOT NULL DEFAULT 0,
            sev       TEXT NOT NULL DEFAULT 'low',
            title     TEXT NOT NULL DEFAULT '',
            body      TEXT,
            url       TEXT,
            src       TEXT,
            country   TEXT,
            saved_at  BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
          );
          CREATE INDEX IF NOT EXISTS ft_events_type_ts  ON public.ft_events(type, ts DESC);
          CREATE INDEX IF NOT EXISTS ft_events_ticker   ON public.ft_events(ticker, ts DESC);
          CREATE INDEX IF NOT EXISTS ft_events_sev_ts   ON public.ft_events(sev, ts DESC);
        `
      });
      _sbReady = true;
      console.log('[SB] Table created.');
    } catch(e2) {
      console.warn('[SB] Cannot auto-create table. Create ft_events manually in Supabase dashboard.', e2.message);
      _sbReady = false;
    }
  }
  return _sbReady;
}

function sbInit() {
  if (_sbInitPromise) return _sbInitPromise;
  _sbInitPromise = sbEnsureTable();
  return _sbInitPromise;
}

/* ══════════════════════════════════════════════════════════════════
   WRITE — upsert batch of events (deduplicated by content hash)
   ══════════════════════════════════════════════════════════════════ */
async function sbSave(events) {
  if (!events || !events.length) return;
  await sbInit();
  if (!_sbReady) return;

  const now = Math.floor(Date.now() / 1000);
  const rows = events.map(e => {
    const idStr = `${e.type||''}|${e.title||''}|${e.ts||0}|${e.ticker||''}`;
    return {
      id:       sbHash(idStr),
      type:     (e.type   || 'intel').slice(0, 20),
      ticker:   e.ticker  ? e.ticker.slice(0, 10) : null,
      topic:    e.topic   ? e.topic.slice(0, 30)  : null,
      ts:       Math.floor((e.ts > 1e12 ? e.ts / 1000 : e.ts) || now),
      sev:      (e.sev || e.severity || 'low').toLowerCase().slice(0, 10),
      title:    (e.title  || '').slice(0, 200),
      body:     sbCompress(e.body || e.summary || e.description || e.detail),
      url:      e.url     ? e.url.slice(0, 300) : null,
      src:      e.src     ? e.src.slice(0, 60)  : null,
      country:  e.country ? e.country.slice(0, 4) : null,
      saved_at: now,
    };
  });

  // Upsert in batches of 50 to avoid request size limits
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    try {
      await sbFetch(`${SB_TABLE}`, 'POST', batch, {
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      });
    } catch(e) {
      console.warn('[SB] upsert batch failed:', e.message);
    }
  }
}

/* ══════════════════════════════════════════════════════════════════
   READ — fetch events from Supabase with optional filters
   ══════════════════════════════════════════════════════════════════ */
async function sbLoad({ type, ticker, sev, limit = 50, since = 0 } = {}) {
  await sbInit();
  if (!_sbReady) return [];

  const cacheKey = `${type}|${ticker}|${sev}|${limit}|${since}`;
  const cached   = _sbCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < _sbCacheTTL) return cached.data;

  let q = `${SB_TABLE}?select=id,type,ticker,topic,ts,sev,title,body,url,src,country&order=ts.desc&limit=${limit}`;
  if (type)   q += `&type=eq.${encodeURIComponent(type)}`;
  if (ticker) q += `&ticker=eq.${encodeURIComponent(ticker.replace(/.*:/,'').toUpperCase())}`;
  if (sev)    q += `&sev=eq.${encodeURIComponent(sev)}`;
  if (since)  q += `&ts=gte.${Math.floor(since)}`;

  try {
    const data = await sbFetch(q, 'GET', null, { 'Prefer': 'count=none' });
    _sbCache.set(cacheKey, { data, ts: Date.now() });
    return Array.isArray(data) ? data : [];
  } catch(e) {
    console.warn('[SB] load failed:', e.message);
    return [];
  }
}

/* ══════════════════════════════════════════════════════════════════
   PRUNE — delete rows older than TTL to keep storage minimal
   Runs once per session on init
   ══════════════════════════════════════════════════════════════════ */
async function sbPrune() {
  if (!_sbReady) return;
  const now = Math.floor(Date.now() / 1000);
  const cutNews  = now - 30 * 86400;   // 30 days for news
  const cutIntel = now - 90 * 86400;   // 90 days for intel/risk

  try {
    // Delete old news
    await sbFetch(
      `${SB_TABLE}?type=eq.news&ts=lt.${cutNews}`,
      'DELETE', null, { 'Prefer': 'return=minimal' }
    );
    // Delete old non-news intel
    await sbFetch(
      `${SB_TABLE}?type=neq.news&ts=lt.${cutIntel}`,
      'DELETE', null, { 'Prefer': 'return=minimal' }
    );
    console.log('[SB] Pruning complete.');
  } catch(e) {
    console.warn('[SB] prune failed:', e.message);
  }
}

/* ══════════════════════════════════════════════════════════════════
   CONVERTERS — normalize different data shapes → sbSave format
   ══════════════════════════════════════════════════════════════════ */

/* News articles (from Finnhub / AV / EODHD) */
function sbArticlesToEvents(articles, ticker) {
  return (articles || []).map(a => ({
    type:    'news',
    ticker:  (ticker || a.ticker || '').replace(/.*:/,'').toUpperCase() || null,
    topic:   a.category || null,
    ts:      a.datetime || a.publishedAt || a.date || 0,
    sev:     a.sentiment ? (
               ['Bullish','Somewhat-Bullish'].includes(a.sentiment) ? 'low' :
               ['Bearish','Somewhat-Bearish'].includes(a.sentiment) ? 'medium' : 'low'
             ) : 'low',
    title:   a.headline || a.title || '',
    body:    a.summary || a.description || '',
    url:     a.url || null,
    src:     a.source || null,
    country: null,
  }));
}

/* WM Intel alerts (from wmBuildIntelAlerts output) */
function sbIntelToEvents(alerts) {
  return (alerts || []).map(a => ({
    type:    a.type || 'intel',
    ticker:  a.ticker || null,
    topic:   a.resource || null,
    ts:      a.ts || 0,
    sev:     a.severity || 'low',
    title:   a.title || '',
    body:    [a.subtitle, a.detail].filter(Boolean).join(' — '),
    url:     null,
    src:     'WorldMonitor',
    country: null,
  }));
}

/* WM bootstrap raw data — normalize all categories */
function sbWmBootstrapToEvents(d) {
  const now = Math.floor(Date.now() / 1000);
  const rows = [];

  // Insights
  const insights = d.insights?.insights || d.insights?.items || d.insights?.data || d.insights || [];
  (Array.isArray(insights) ? insights : []).forEach(s => {
    rows.push({ type:'intel', ticker: s.ticker||s.symbol||null, topic: null,
      ts: s.timestamp||s.date||now, sev: s.severity||s.importance||'medium',
      title: s.title||s.headline||'', body: s.body||s.description||'',
      src:'WM/insights', country: null });
  });

  // Iran events
  const iran = d.iranEvents?.events || d.iranEvents?.data || d.iranEvents || [];
  (Array.isArray(iran) ? iran : []).forEach(e => {
    rows.push({ type:'iran', ticker:null, topic: e.location||null,
      ts: e.timestamp||e.date||now, sev: e.severity||e.level||'high',
      title: e.title||e.description||'Iran event', body: e.note||'',
      src:'WM/iran', country:'IR' });
  });

  // Unrest
  const unrest = d.unrestEvents?.events || d.unrestEvents?.data || d.unrestEvents || [];
  (Array.isArray(unrest) ? unrest : []).forEach(u => {
    rows.push({ type:'unrest', ticker:null, topic: u.country||null,
      ts: u.timestamp||u.eventDate||now, sev: u.severity||'medium',
      title: u.title||u.description||'Unrest', body: u.note||'',
      src:'WM/unrest', country: (u.country||'').slice(0,4)||null });
  });

  // Weather alerts
  const wx = d.weatherAlerts?.alerts || d.weatherAlerts?.data || d.weatherAlerts || [];
  (Array.isArray(wx) ? wx : []).forEach(a => {
    rows.push({ type:'weather', ticker:null, topic: a.event||null,
      ts: a.timestamp||a.onset||now, sev: a.severity||'medium',
      title: a.headline||a.event||'Weather alert', body: a.description||a.instruction||'',
      src:'WM/weather', country: (a.country||'').slice(0,4)||null });
  });

  // Earthquakes
  const quakes = d.earthquakes?.earthquakes || d.earthquakes?.features || d.earthquakes?.data || d.earthquakes || [];
  (Array.isArray(quakes) ? quakes : []).filter(q => (q.magnitude||q.mag||0) >= 4).forEach(q => {
    rows.push({ type:'quake', ticker:null, topic: null,
      ts: q.time||q.timestamp||now,
      sev: (q.magnitude||q.mag||0) >= 7 ? 'critical' : (q.magnitude||q.mag||0) >= 5.5 ? 'high' : 'medium',
      title: `M${(q.magnitude||q.mag||0).toFixed(1)} — ${q.place||q.location||''}`,
      body: `Depth: ${q.depth||'?'}km`, src:'WM/seismology', country:null });
  });

  // Cyber threats
  const cyber = d.cyberThreats?.threats || d.cyberThreats?.data || d.cyberThreats || [];
  (Array.isArray(cyber) ? cyber : []).forEach(c => {
    rows.push({ type:'cyber', ticker:null, topic: c.sector||null,
      ts: c.timestamp||c.detectedAt||now, sev: c.severity||c.level||'medium',
      title: c.title||c.name||'Cyber threat', body: c.description||c.indicator||'',
      src:'WM/cyber', country:null });
  });

  // Risk scores (only store high/critical countries)
  const riskRaw = d.riskScores?.scores || d.riskScores?.data || d.riskScores || {};
  const riskArr = Array.isArray(riskRaw) ? riskRaw :
    Object.entries(riskRaw).map(([k,v]) => typeof v==='object' ? {country:k,...v} : {country:k,score:v});
  riskArr.filter(r => (r.score||0) >= 50).forEach(r => {
    rows.push({ type:'risk', ticker:null, topic: null,
      ts: r.updatedAt||now, sev: (r.score||0) >= 75 ? 'critical' : 'high',
      title: `${r.country||r.code||''} Risk: ${Math.round(r.score||0)}/100`,
      body: r.driver||r.cause||r.summary||'',
      src:'WM/risk', country: (r.code||r.country||'').slice(0,4)||null });
  });

  // Natural events
  const natural = d.naturalEvents?.events || d.naturalEvents?.data || d.naturalEvents || [];
  (Array.isArray(natural) ? natural : []).forEach(n => {
    rows.push({ type:'natural', ticker:null, topic: n.type||null,
      ts: n.timestamp||n.date||now, sev: n.severity||'medium',
      title: n.title||n.type||'Natural event', body: n.description||'',
      src:'WM/natural', country: null });
  });

  return rows;
}

/* ══════════════════════════════════════════════════════════════════
   AUTO-SAVE HOOKS
   Intercept existing render/load functions to persist data silently
   ══════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  /* 1. Intercept renderNewsFeed — save articles as they arrive */
  if (typeof renderNewsFeed === 'function') {
    const _origRNF = renderNewsFeed;
    window.renderNewsFeed = function(sym, articles, provider) {
      _origRNF(sym, articles, provider);
      if (articles && articles.length) {
        sbSave(sbArticlesToEvents(articles, sym)).catch(() => {});
      }
    };
  }

  /* 2. Intercept wmIntelLoad — save intel alerts when WM refreshes */
  if (typeof wmIntelLoad === 'function') {
    const _origWIL = wmIntelLoad;
    window.wmIntelLoad = async function() {
      await _origWIL();
      if (wmIntelAlerts && wmIntelAlerts.length) {
        sbSave(sbIntelToEvents(wmIntelAlerts)).catch(() => {});
      }
    };
  }

  /* 3. Intercept wmBootstrap — save raw WM data after each fetch */
  const _origBootstrap = wmBootstrap;
  window.wmBootstrap = async function(keys) {
    const d = await _origBootstrap(keys);
    // Only persist if we got fresh data
    const evts = sbWmBootstrapToEvents(d);
    if (evts.length) sbSave(evts).catch(() => {});
    return d;
  };

  /* 4. Run prune once per session (after 10s delay) */
  setTimeout(() => sbPrune().catch(() => {}), 10_000);

  console.log('[SB] Supabase persistence layer ready →', SB_URL);
});

/* ══════════════════════════════════════════════════════════════════
   PUBLIC READ API — used by UI components to load saved history
   ══════════════════════════════════════════════════════════════════ */

/* Load saved news for a ticker (with fallback UI injection) */
async function sbLoadNewsForTicker(ticker) {
  const sym = (ticker || '').replace(/.*:/, '').toUpperCase();
  const rows = await sbLoad({ type: 'news', ticker: sym, limit: 30 });
  if (!rows.length) return;

  const feed = document.getElementById('news-feed');
  if (!feed) return;

  // Don't overwrite live data — only inject if feed is empty/loading
  if (feed.querySelector('.av-spinner') || feed.innerHTML.trim() === '') {
    const cards = rows.map(r => `
      <div class="news-item sb-cached">
        <div class="ni-row">
          <div class="ni-left">
            <div class="ni-headline">${escapeHtml(r.title||'')}</div>
            <div class="ni-meta">
              <span class="ni-source">${escapeHtml(r.src||'')}</span>
              <span class="ni-dot">·</span>
              <span class="ni-time">${sbRelTime(r.ts)}</span>
              <span class="ni-cat" style="background:rgba(0,212,160,.1);color:var(--accent)">📦 Cached</span>
            </div>
          </div>
        </div>
        ${r.body ? `<div class="ni-drawer" style="display:block"><p class="ni-summary">${escapeHtml(r.body)}</p>${r.url ? `<a href="${escapeHtml(r.url)}" target="_blank" rel="noopener" class="ni-link">Read full article ↗</a>` : ''}</div>` : ''}
      </div>`).join('');

    feed.innerHTML = `
      <div class="sb-cache-bar">
        <span>📦 Showing ${rows.length} cached articles for <strong>${escapeHtml(sym)}</strong></span>
        <span class="sb-cache-note">Live data loads when API key is set</span>
      </div>
      <div class="news-list">${cards}</div>`;
  }
}

/* Load saved intel alerts (for Intel Feed panel on startup) */
async function sbLoadIntelHistory(filter = 'all', limit = 40) {
  const typeMap = {
    insight:'intel', risk:'risk', iran:'iran',
    unrest:'unrest', weather:'weather', cyber:'cyber',
    quake:'quake', natural:'natural'
  };
  const type = (filter === 'all') ? null : (typeMap[filter] || filter);
  const rows = await sbLoad({ type, limit });
  return rows;
}

/* Inject saved intel into Intel Feed if it loads empty */
async function sbInjectSavedIntel() {
  const el = document.getElementById('intel-feed-list');
  if (!el) return;
  // Wait briefly to see if live data arrives first
  await new Promise(r => setTimeout(r, 3000));
  if (el.querySelector('.wm-spin') || el.innerHTML.trim() === '' || !wmIntelAlerts.length) {
    const rows = await sbLoadIntelHistory('all', 50);
    if (!rows.length) return;

    const badge = document.getElementById('intel-feed-badge');
    const critCount = rows.filter(r => ['critical','extreme'].includes(r.sev)).length;
    if (badge) {
      badge.textContent = critCount > 0 ? `${critCount} CRITICAL` : `${rows.length} CACHED`;
      badge.style.background = critCount > 0 ? '#ff4757' : '#555';
    }

    el.innerHTML = `<div class="sb-cache-bar" style="margin:0">
        <span>📦 ${rows.length} saved alerts — loading live data…</span>
      </div>` +
      rows.map(r => {
        const col = wmSeverityColor(r.sev || 'medium');
        const iconMap = { intel:'🧠', risk:'🌡', iran:'🇮🇷', unrest:'✊', weather:'🌪',
                          cyber:'💻', quake:'🏔', natural:'🌿', news:'📰' };
        return `<div class="wm-intel-card" style="border-left:3px solid ${col.border}">
          <div class="wm-ic-header">
            <span class="wm-ic-icon">${iconMap[r.type]||'⚡'}</span>
            <div class="wm-ic-title">${escapeHtml(r.title||'')}</div>
            <span class="wm-ic-badge" style="background:${col.bg};color:${col.text};border-color:${col.border}">${(r.sev||'').toUpperCase()}</span>
          </div>
          ${r.body ? `<div class="wm-ic-sub">${escapeHtml(r.body.slice(0,120))}</div>` : ''}
          <div class="wm-ic-footer">
            <span class="wm-ic-time">${sbRelTime(r.ts)} · ${escapeHtml(r.src||'')}</span>
            <span class="sb-cache-tag">📦</span>
          </div>
        </div>`;
      }).join('');
  }
}

function sbRelTime(ts) {
  if (!ts) return '';
  const sec = ts > 1e12 ? Math.floor(ts/1000) : ts;
  const d = Math.floor(Date.now()/1000) - sec;
  if (d < 60)    return `${d}s ago`;
  if (d < 3600)  return `${Math.floor(d/60)}m ago`;
  if (d < 86400) return `${Math.floor(d/3600)}h ago`;
  return `${Math.floor(d/86400)}d ago`;
}

/* ── Run saved intel injection on page load ─────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Inject cached intel into feed on startup
  sbInjectSavedIntel().catch(() => {});

  // Also intercept renderNews to load cached articles
  if (typeof renderNews === 'function') {
    const _origRN = renderNews;
    window.renderNews = function(ticker) {
      _origRN(ticker);
      // Load saved news 500ms after render starts (won't overwrite live data)
      setTimeout(() => sbLoadNewsForTicker(ticker).catch(() => {}), 500);
    };
  }
});
