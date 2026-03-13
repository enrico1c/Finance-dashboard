/* ══════════════════════════════════════════════════════════════════
   sbcache.js  —  FINTERM Universal Persistent Cache  v1.0
   ──────────────────────────────────────────────────────────────────
   Strategia: ogni chiamata API viene intercettata PRIMA che arrivi
   alla rete. Se esiste un risultato valido in Supabase (non scaduto),
   viene restituito direttamente — zero call sprecate.

   Tabella Supabase: ft_cache
     cache_key   TEXT PK   — hash deterministico di provider+endpoint+params
     provider    TEXT      — 'fmp'|'fh'|'av'|'fred'|'oer'|'tech'|'fmp_ratios'|...
     symbol      TEXT      — ticker (normalizzato UPPER, senza exchange prefix)
     endpoint    TEXT      — path API abbreviato (es. '/v3/profile')
     data        JSONB     — payload completo
     fetched_at  BIGINT    — unix seconds del fetch
     ttl_secs    INT       — secondi di validità
     expires_at  BIGINT    — fetched_at + ttl_secs (per query veloci)
     hit_count   INT       — quante volte è stato letto dalla cache
     call_saved  INT       — 1 per ogni hit (per statistiche)

   TTL per categoria (in secondi):
     Ratios/Fundamentals FMP   →  6h     (cambiano poco)
     Quote/Prezzi live         →  5min   (freschi ma non real-time)
     News                      →  15min
     Candles daily (Finnhub)   →  30min
     Candles intraday          →  5min
     FRED macro                →  24h    (dati mensili/trimestrali)
     OER forex rates           →  1h
     Technical indicators      →  30min
     Analyst estimates         →  12h
     Insider/Form4             →  6h
     Earnings calendar         →  4h
   ══════════════════════════════════════════════════════════════════ */

/* ── TTL map (seconds) ──────────────────────────────────────────── */
const SBC_TTL = {
  // FMP
  'fmp:profile':          6  * 3600,
  'fmp:ratios':           6  * 3600,
  'fmp:income':           6  * 3600,
  'fmp:balance':          6  * 3600,
  'fmp:cashflow':         6  * 3600,
  'fmp:estimates':        12 * 3600,
  'fmp:analysts':         12 * 3600,
  'fmp:insiders':         6  * 3600,
  'fmp:institutional':    12 * 3600,
  'fmp:dividends':        24 * 3600,
  'fmp:splits':           24 * 3600,
  'fmp:earnings':         4  * 3600,
  'fmp:segmentation':     12 * 3600,
  'fmp:transcripts':      24 * 3600,
  'fmp:form4':            6  * 3600,
  'fmp:quote':            5  * 60,
  'fmp:peers':            24 * 3600,
  'fmp:screener':         30 * 60,
  'fmp:actives':          5  * 60,
  'fmp:gainers':          5  * 60,
  'fmp:losers':           5  * 60,
  // Finnhub
  'fh:quote':             5  * 60,
  'fh:profile':           24 * 3600,
  'fh:candles:D':         30 * 60,
  'fh:candles:W':         2  * 3600,
  'fh:candles:M':         6  * 3600,
  'fh:candles:60':        5  * 60,
  'fh:candles:15':        3  * 60,
  'fh:candles:5':         2  * 60,
  'fh:candles:1':         60,
  'fh:news':              15 * 60,
  'fh:peers':             24 * 3600,
  'fh:analysts':          12 * 3600,
  'fh:earnings':          4  * 3600,
  'fh:insiders':          6  * 3600,
  'fh:econ':              4  * 3600,
  // Alpha Vantage
  'av:quote':             5  * 60,
  'av:overview':          12 * 3600,
  'av:income':            6  * 3600,
  'av:balance':           6  * 3600,
  'av:cashflow':          6  * 3600,
  'av:earnings':          6  * 3600,
  'av:news':              15 * 60,
  'av:daily':             30 * 60,
  'av:indicator':         30 * 60,
  // FRED
  'fred:series':          24 * 3600,
  'fred:yield':           4  * 3600,
  // OER
  'oer:rates':            60 * 60,
  'oer:history':          6  * 3600,
  // Generic
  'default':              30 * 60,
};

function sbcTTL(provider, endpoint) {
  const key = `${provider}:${endpoint}`;
  if (SBC_TTL[key]) return SBC_TTL[key];
  // Prefix match
  const prefix = Object.keys(SBC_TTL).find(k => key.startsWith(k));
  return prefix ? SBC_TTL[prefix] : SBC_TTL['default'];
}

/* ── Cache key hash ─────────────────────────────────────────────── */
function sbcKey(provider, endpoint, symbol, params) {
  const str = `${provider}|${endpoint}|${(symbol||'').toUpperCase()}|${JSON.stringify(params||{})}`;
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < Math.min(str.length, 512); i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${provider}_${h.toString(36)}`;
}

/* ── In-memory L1 cache (hot layer, survives page state changes) ── */
const _sbcMem = new Map();   // cacheKey → { data, expires_at }
const _sbcPendingWrites = []; // queue for batched Supabase writes
let   _sbcWriteTimer = null;
let   _sbcReady = false;
let   _sbcStats = { hits: 0, misses: 0, writes: 0, callsSaved: 0 };

/* ── Status indicator in config panel ──────────────────────────── */
function sbcUpdateStatus() {
  const el = document.getElementById('sbc-status');
  if (!el) return;
  const { hits, misses, callsSaved } = _sbcStats;
  const total = hits + misses;
  const pct   = total ? Math.round(hits / total * 100) : 0;
  el.innerHTML = `
    <span class="sbc-stat sbc-hits">✓ ${hits} hits</span>
    <span class="sbc-stat sbc-misses">✗ ${misses} miss</span>
    <span class="sbc-stat sbc-saved">💾 ${callsSaved} API calls saved</span>
    <span class="sbc-stat sbc-pct" style="color:${pct>60?'#3fb950':pct>30?'#d29922':'#f85149'}">${pct}% cache rate</span>`;
}

/* ══════════════════════════════════════════════════════════════════
   TABLE BOOTSTRAP — create ft_cache if not exists
   ══════════════════════════════════════════════════════════════════ */
let _sbcInitPromise = null;

async function sbcInit() {
  if (_sbcInitPromise) return _sbcInitPromise;
  _sbcInitPromise = (async () => {
    try {
      // Quick test read
      const res = await fetch(
        `${SB_URL}/rest/v1/ft_cache?select=cache_key&limit=1`,
        { headers: SB_HDR, signal: AbortSignal.timeout(6000) }
      );
      if (res.ok) { _sbcReady = true; return true; }

      // Table missing — try SQL RPC to create it
      const sql = `
        CREATE TABLE IF NOT EXISTS public.ft_cache (
          cache_key   TEXT PRIMARY KEY,
          provider    TEXT NOT NULL DEFAULT '',
          symbol      TEXT,
          endpoint    TEXT NOT NULL DEFAULT '',
          data        JSONB,
          fetched_at  BIGINT NOT NULL DEFAULT 0,
          ttl_secs    INT    NOT NULL DEFAULT 1800,
          expires_at  BIGINT NOT NULL DEFAULT 0,
          hit_count   INT    NOT NULL DEFAULT 0,
          call_saved  INT    NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS ft_cache_sym     ON public.ft_cache(symbol, provider);
        CREATE INDEX IF NOT EXISTS ft_cache_exp     ON public.ft_cache(expires_at);
        CREATE INDEX IF NOT EXISTS ft_cache_prov    ON public.ft_cache(provider);
      `;
      const r2 = await fetch(`${SB_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST', headers: SB_HDR,
        body: JSON.stringify({ sql }),
        signal: AbortSignal.timeout(10000),
      });
      _sbcReady = r2.ok;
      if (_sbcReady) console.log('[SBC] ft_cache table created.');
      else console.warn('[SBC] Could not create ft_cache. Create it manually in Supabase dashboard.');
      return _sbcReady;
    } catch (e) {
      console.warn('[SBC] init failed:', e.message);
      _sbcReady = false;
      return false;
    }
  })();
  return _sbcInitPromise;
}

/* ══════════════════════════════════════════════════════════════════
   READ — check cache (memory L1 first, then Supabase L2)
   Returns: { data } if cache hit, null if miss/expired
   ══════════════════════════════════════════════════════════════════ */
async function sbcGet(provider, endpoint, symbol, params) {
  const key     = sbcKey(provider, endpoint, symbol, params);
  const nowSec  = Math.floor(Date.now() / 1000);

  // L1 memory check (instant)
  const mem = _sbcMem.get(key);
  if (mem && mem.expires_at > nowSec) {
    _sbcStats.hits++;
    _sbcStats.callsSaved++;
    sbcUpdateStatus();
    return mem.data;
  }

  // L2 Supabase check
  if (!_sbcReady) return null;
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/ft_cache?cache_key=eq.${encodeURIComponent(key)}&select=data,expires_at,hit_count`,
      { headers: SB_HDR, signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows?.length) { _sbcStats.misses++; sbcUpdateStatus(); return null; }

    const row = rows[0];
    if (row.expires_at <= nowSec) {
      // Stale — delete async, return null to trigger fresh fetch
      fetch(`${SB_URL}/rest/v1/ft_cache?cache_key=eq.${encodeURIComponent(key)}`,
        { method: 'DELETE', headers: { ...SB_HDR, 'Prefer': 'return=minimal' } }).catch(() => {});
      _sbcStats.misses++;
      sbcUpdateStatus();
      return null;
    }

    // Cache hit — promote to L1 and increment hit_count async
    const data = row.data;
    _sbcMem.set(key, { data, expires_at: row.expires_at });
    _sbcStats.hits++;
    _sbcStats.callsSaved++;
    sbcUpdateStatus();

    // Increment hit_count in background (non-blocking)
    fetch(`${SB_URL}/rest/v1/ft_cache?cache_key=eq.${encodeURIComponent(key)}`, {
      method: 'PATCH',
      headers: { ...SB_HDR, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ hit_count: (row.hit_count || 0) + 1 }),
    }).catch(() => {});

    return data;
  } catch (e) {
    _sbcStats.misses++;
    sbcUpdateStatus();
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════════
   WRITE — save to L1 immediately, queue Supabase write (batched)
   ══════════════════════════════════════════════════════════════════ */
function sbcSet(provider, endpoint, symbol, params, data) {
  if (data == null) return;
  const key     = sbcKey(provider, endpoint, symbol, params);
  const ttl     = sbcTTL(provider, endpoint);
  const nowSec  = Math.floor(Date.now() / 1000);
  const expires = nowSec + ttl;

  // Write to L1 immediately
  _sbcMem.set(key, { data, expires_at: expires });

  // Queue Supabase write
  _sbcPendingWrites.push({
    cache_key:  key,
    provider:   provider.slice(0, 20),
    symbol:     symbol ? symbol.toUpperCase().slice(0, 12) : null,
    endpoint:   endpoint.slice(0, 80),
    data:       data,
    fetched_at: nowSec,
    ttl_secs:   ttl,
    expires_at: expires,
    hit_count:  0,
    call_saved: 0,
  });

  _sbcStats.writes++;

  // Debounce batch write (2s after last queued item)
  clearTimeout(_sbcWriteTimer);
  _sbcWriteTimer = setTimeout(() => sbcFlush(), 2000);
}

/* ── Flush queued writes to Supabase in one batch ───────────────── */
async function sbcFlush() {
  if (!_sbcReady || !_sbcPendingWrites.length) return;
  const batch = _sbcPendingWrites.splice(0, 100);  // max 100 per flush
  try {
    await fetch(`${SB_URL}/rest/v1/ft_cache`, {
      method: 'POST',
      headers: { ...SB_HDR, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    console.warn('[SBC] flush failed:', e.message);
    // Re-queue failed items (max once)
    _sbcPendingWrites.unshift(...batch.slice(0, 20));
  }
}

/* ══════════════════════════════════════════════════════════════════
   INVALIDATE — force-expire cache for a symbol or provider
   ══════════════════════════════════════════════════════════════════ */
async function sbcInvalidate(symbol, provider) {
  const sym = symbol?.toUpperCase();
  // Clear L1
  for (const [k, v] of _sbcMem) {
    if (sym && k.includes(sym)) _sbcMem.delete(k);
    else if (provider && k.startsWith(provider)) _sbcMem.delete(k);
  }
  if (!_sbcReady) return;
  // Clear L2
  let q = `${SB_URL}/rest/v1/ft_cache`;
  if (sym)      q += `?symbol=eq.${encodeURIComponent(sym)}`;
  else if (provider) q += `?provider=eq.${encodeURIComponent(provider)}`;
  else return;
  try {
    await fetch(q, { method: 'DELETE', headers: { ...SB_HDR, 'Prefer': 'return=minimal' } });
    console.log(`[SBC] Invalidated cache for ${sym || provider}`);
  } catch (e) { console.warn('[SBC] invalidate failed:', e.message); }
}

/* ══════════════════════════════════════════════════════════════════
   PRUNE — delete expired rows (runs once per session)
   ══════════════════════════════════════════════════════════════════ */
async function sbcPrune() {
  if (!_sbcReady) return;
  const nowSec = Math.floor(Date.now() / 1000);
  try {
    await fetch(
      `${SB_URL}/rest/v1/ft_cache?expires_at=lt.${nowSec}`,
      { method: 'DELETE', headers: { ...SB_HDR, 'Prefer': 'return=minimal' } }
    );
  } catch (e) { console.warn('[SBC] prune failed:', e.message); }
}

/* ══════════════════════════════════════════════════════════════════
   INTERCEPT LAYER — wraps all core fetch functions
   Called ONCE after DOMContentLoaded (after all other scripts load)
   ══════════════════════════════════════════════════════════════════ */
function sbcInstallInterceptors() {

  /* ── Helper: wrap an async function with cache ── */
  function wrap(orig, provider, endpointFn, symbolFn, paramsFn) {
    return async function(...args) {
      const endpoint = endpointFn(...args);
      const symbol   = symbolFn ? symbolFn(...args) : null;
      const params   = paramsFn ? paramsFn(...args) : null;

      // 1. Try cache
      await sbcInit();
      const cached = await sbcGet(provider, endpoint, symbol, params);
      if (cached !== null) return cached;

      // 2. Call original
      const result = await orig.apply(this, args);

      // 3. Save if valid
      if (result !== null && result !== undefined) {
        sbcSet(provider, endpoint, symbol, params, result);
      }
      return result;
    };
  }

  /* ── FMP fmpFetch(path, symbol, params) ── */
  if (typeof fmpFetch === 'function') {
    window._sbcOrig_fmpFetch = fmpFetch;
    window.fmpFetch = wrap(
      fmpFetch,
      'fmp',
      (path) => path.split('/').filter(Boolean).slice(0, 3).join('/'),
      (_, symbol) => symbol || null,
      (_, __, params) => params
    );
  }

  /* ── Finnhub fhFetch(path, params) ── */
  if (typeof fhFetch === 'function') {
    window._sbcOrig_fhFetch = fhFetch;
    window.fhFetch = wrap(
      fhFetch,
      'fh',
      (path) => path,
      (_, params) => params?.symbol || params?.s || null,
      (_, params) => params
    );
  }

  /* ── Alpha Vantage avFetch(params) ── */
  if (typeof avFetch === 'function') {
    window._sbcOrig_avFetch = avFetch;
    window.avFetch = wrap(
      avFetch,
      'av',
      (params) => (params?.function || 'unknown').toLowerCase(),
      (params) => params?.symbol || null,
      (params) => {
        // Exclude apikey from cache key
        const { apikey, ...rest } = params || {};
        return rest;
      }
    );
  }

  /* ── FRED fredFetch(series, params) ── */
  if (typeof fredFetch === 'function') {
    window._sbcOrig_fredFetch = fredFetch;
    window.fredFetch = wrap(
      fredFetch,
      'fred',
      (series) => series,
      () => null,
      (_, params) => params
    );
  }

  /* ── OER oerFetch(path, cacheKey) ── */
  if (typeof oerFetch === 'function') {
    window._sbcOrig_oerFetch = oerFetch;
    window.oerFetch = wrap(
      oerFetch,
      'oer',
      (path) => path,
      () => null,
      () => null
    );
  }

  /* ── Technical techFetchCandles(sym, resolution, bars) ── */
  if (typeof techFetchCandles === 'function') {
    window._sbcOrig_techFetchCandles = techFetchCandles;
    window.techFetchCandles = wrap(
      techFetchCandles,
      'fh',
      (_, resolution = 'D') => `candles:${resolution}`,
      (sym) => sym,
      (_, resolution, bars) => ({ resolution, bars })
    );
  }

  console.log('[SBC] Interceptors installed on: fmpFetch, fhFetch, avFetch, fredFetch, oerFetch, techFetchCandles');
}

/* ══════════════════════════════════════════════════════════════════
   CACHE MANAGER UI — shown in ⚙ Settings panel
   ══════════════════════════════════════════════════════════════════ */
function sbcRenderStats() {
  const el = document.getElementById('sbc-manager');
  if (!el) return;

  const { hits, misses, writes, callsSaved } = _sbcStats;
  const total = hits + misses;
  const pct   = total ? Math.round(hits / total * 100) : 0;

  el.innerHTML = `
    <div class="sbc-header">
      <span class="sbc-title">API Cache (Supabase)</span>
      <span class="sbc-status-dot ${_sbcReady?'sbc-online':'sbc-offline'}">${_sbcReady?'● Online':'○ Offline'}</span>
    </div>
    <div class="sbc-stats-grid">
      <div class="sbc-stat-box">
        <span class="sbc-stat-val" style="color:#3fb950">${hits}</span>
        <span class="sbc-stat-lbl">Cache Hits</span>
      </div>
      <div class="sbc-stat-box">
        <span class="sbc-stat-val" style="color:#d29922">${misses}</span>
        <span class="sbc-stat-lbl">API Calls</span>
      </div>
      <div class="sbc-stat-box">
        <span class="sbc-stat-val" style="color:#58a6ff">${callsSaved}</span>
        <span class="sbc-stat-lbl">Calls Saved</span>
      </div>
      <div class="sbc-stat-box">
        <span class="sbc-stat-val" style="color:${pct>60?'#3fb950':pct>30?'#d29922':'#f85149'}">${pct}%</span>
        <span class="sbc-stat-lbl">Hit Rate</span>
      </div>
    </div>
    <div class="sbc-ttl-table">
      <div class="sbc-ttl-title">TTL Configuration</div>
      ${[
        ['FMP Ratios/Profile','6h'], ['FMP Quote','5min'], ['FMP News','15min'],
        ['Finnhub Quote','5min'], ['Finnhub Candles D','30min'], ['Finnhub Candles intra','2-5min'],
        ['Alpha Vantage Indicators','30min'], ['FRED Macro','24h'], ['OER Forex','1h'],
      ].map(([lbl,ttl]) => `<div class="sbc-ttl-row"><span>${lbl}</span><span class="sbc-ttl-val">${ttl}</span></div>`).join('')}
    </div>
    <div class="sbc-actions">
      <button class="sbc-btn" onclick="sbcInvalidateUI()">🗑 Clear All Cache</button>
      <button class="sbc-btn" onclick="sbcPrune().then(()=>sbcRenderStats())">✂ Prune Expired</button>
      <button class="sbc-btn" onclick="sbcFlush().then(()=>sbcRenderStats())">💾 Flush Queue</button>
      <button class="sbc-btn" onclick="sbcLoadStats()">📊 Load Stats</button>
    </div>
    <div id="sbc-extra-stats" class="sbc-extra"></div>`;
}

async function sbcInvalidateUI() {
  if (!confirm('Clear all cached API data from Supabase? This will force fresh API calls.')) return;
  _sbcMem.clear();
  if (_sbcReady) {
    try {
      await fetch(`${SB_URL}/rest/v1/ft_cache`, {
        method: 'DELETE',
        headers: { ...SB_HDR, 'Prefer': 'return=minimal' },
      });
      console.log('[SBC] All cache cleared.');
    } catch (e) { console.warn('[SBC] clear failed:', e.message); }
  }
  _sbcStats = { hits: 0, misses: 0, writes: 0, callsSaved: 0 };
  sbcRenderStats();
}

async function sbcLoadStats() {
  const el = document.getElementById('sbc-extra-stats');
  if (!el || !_sbcReady) return;
  el.textContent = 'Loading…';
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/ft_cache?select=provider,symbol,endpoint,fetched_at,expires_at,hit_count&order=hit_count.desc&limit=20`,
      { headers: SB_HDR }
    );
    const rows = await res.json();
    const now  = Math.floor(Date.now() / 1000);
    el.innerHTML = `
      <div class="sbc-ttl-title" style="margin-top:10px">Top Cached Entries (by hit count)</div>
      <table class="sbc-table">
        <thead><tr><th>Provider</th><th>Symbol</th><th>Endpoint</th><th>Hits</th><th>Expires</th></tr></thead>
        <tbody>
          ${(rows||[]).map(r => {
            const rem = r.expires_at - now;
            const exp = rem > 0 ? `${Math.floor(rem/60)}m` : 'EXPIRED';
            return `<tr>
              <td>${escapeHtml(r.provider||'')}</td>
              <td>${escapeHtml(r.symbol||'—')}</td>
              <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(r.endpoint||'')}</td>
              <td>${r.hit_count||0}</td>
              <td style="color:${rem>0?'#3fb950':'#f85149'}">${exp}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  } catch (e) { el.textContent = 'Could not load stats: ' + e.message; }
}

/* ══════════════════════════════════════════════════════════════════
   INIT — runs after all scripts are loaded
   ══════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Init DB connection
  sbcInit().then(ok => {
    if (ok) console.log('[SBC] Supabase cache ready.');
  });

  // Install interceptors on all fetch functions
  // (slight delay to ensure all modules are loaded)
  setTimeout(() => {
    sbcInstallInterceptors();
    // Prune old entries once per session
    setTimeout(() => sbcPrune().catch(() => {}), 15000);
    // Flush any queued writes every 30s
    setInterval(() => sbcFlush().catch(() => {}), 30000);
  }, 500);
});

/* ── Public API ─────────────────────────────────────────────────── */
window.sbcGet           = sbcGet;
window.sbcSet           = sbcSet;
window.sbcInvalidate    = sbcInvalidate;
window.sbcFlush         = sbcFlush;
window.sbcPrune         = sbcPrune;
window.sbcRenderStats   = sbcRenderStats;
window.sbcLoadStats     = sbcLoadStats;
window.sbcInvalidateUI  = sbcInvalidateUI;
window._sbcStats        = _sbcStats;
