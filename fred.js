/* ══════════════════════════════════════════════════════════════════
   FINTERM — fred.js
   St. Louis Federal Reserve FRED API integration
   Key: stored as finterm_key_fred
   Base: https://api.stlouisfed.org/fred
   Endpoints used:
     • /series/observations  → latest value for a series
     • /release/dates        → release calendar (unused — via Finnhub instead)
   Panels fed:
     • Macro·Intel → YIELD  tab  (yield curve + spreads)
     • Macro·Intel → ECON   tab  (FEDFUNDS, CPI, GDP, UNRATE, T10YIE, BAMLH)
   ══════════════════════════════════════════════════════════════════ */

const FRED_BASE        = 'https://api.stlouisfed.org/fred';
const FRED_CACHE_TTL   = 30 * 60 * 1000;   // 30 min — FRED updates slowly
const FRED_SESSION_KEY = 'fred_call_count';
const _fredCache       = new Map();

/* ── Key helper ─────────────────────────────────────────────────── */
function getFredKey() {
  return (window._KEYS && window._KEYS['fred'])
    || localStorage.getItem('finterm_key_fred')
    || '';
}
function fredCount() { return parseInt(sessionStorage.getItem(FRED_SESSION_KEY) || '0'); }
function fredBump()  {
  const n = fredCount() + 1;
  sessionStorage.setItem(FRED_SESSION_KEY, n);
  if (typeof renderTopbarBadges === 'function') renderTopbarBadges();
  return n;
}

/* ── Generic fetch + cache ──────────────────────────────────────── */
async function fredFetch(series, params = {}) {
  const key = getFredKey();
  if (!key) throw new Error('NO_KEY');
  const cacheKey = series + JSON.stringify(params);
  const cached = _fredCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < FRED_CACHE_TTL) return cached.data;
  fredBump();
  const url = new URL(`${FRED_BASE}/series/observations`);
  url.searchParams.set('series_id', series);
  url.searchParams.set('api_key', key);
  url.searchParams.set('file_type', 'json');
  url.searchParams.set('sort_order', 'desc');
  url.searchParams.set('limit', params.limit || '12');
  if (params.frequency) url.searchParams.set('frequency', params.frequency);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`FRED HTTP ${res.status}`);
  const json = await res.json();
  const data = (json.observations || []).filter(o => o.value !== '.');
  _fredCache.set(cacheKey, { data, ts: Date.now() });
  return data;
}

/* Latest valid value for a series */
async function fredLatest(series) {
  const obs = await fredFetch(series, { limit: 5 });
  return obs[0] || null;
}

/* ── Shared UI helpers ──────────────────────────────────────────── */
function fredEsc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function fredSpinner() {
  return '<div class="av-loading"><span class="av-spinner"></span>Loading FRED data…</div>';
}
function fredNoKey() {
  return `<div class="no-data">// FRED key not configured.<br>
    // <a href="#" onclick="openApiConfig('fred');return false" style="color:var(--accent)">
    Add your free FRED key →</a></div>`;
}
function fredError(msg) {
  return `<div class="no-data">// FRED error: ${fredEsc(msg)}</div>`;
}

/* ══════════════════════════════════════════════════════════════════
   YIELD CURVE  — Macro·Intel YIELD tab
   Series: 1M 3M 6M 1Y 2Y 5Y 7Y 10Y 20Y 30Y
   ══════════════════════════════════════════════════════════════════ */
const FRED_YIELD_SERIES = [
  { id:'DGS1MO',  label:'1M'  },
  { id:'DGS3MO',  label:'3M'  },
  { id:'DGS6MO',  label:'6M'  },
  { id:'DGS1',    label:'1Y'  },
  { id:'DGS2',    label:'2Y'  },
  { id:'DGS5',    label:'5Y'  },
  { id:'DGS7',    label:'7Y'  },
  { id:'DGS10',   label:'10Y' },
  { id:'DGS20',   label:'20Y' },
  { id:'DGS30',   label:'30Y' },
];
const FRED_SPREAD_SERIES = [
  { id:'T10Y2Y',   label:'10Y−2Y Spread',   note:'Inversion signals recession' },
  { id:'T10Y3M',   label:'10Y−3M Spread',   note:'Classic recession predictor'  },
  { id:'T5YIE',    label:'5Y Breakeven',     note:'5-yr inflation expectation'   },
  { id:'T10YIE',        label:'10Y Breakeven',   note:'10-yr inflation expectation'   },
  { id:'BAMLH0A0HYM2',  label:'HY OAS Spread',  note:'High-yield credit risk (BAMLH)'  },
  { id:'BAMLC0A0CM',    label:'IG OAS Spread',   note:'Investment grade credit risk'   },
  { id:'BAMLC0A4CBBB',  label:'BBB OAS Spread',  note:'BBB-rated credit spread'        },
  { id:'BAMLH0A1HYBB',  label:'BB OAS Spread',   note:'BB-rated (top HY) spread'       },
];

/* ── Shared yield curve renderer ────────────────────────────────── */
function _fredRenderYieldCurve(el, yields, date, src) {
  const W=360, H=100, PL=36, PR=10, PT=12, PB=20;
  const cw=W-PL-PR, ch=H-PT-PB;
  const vals = yields.map(y=>y.value);
  const mn=Math.min(...vals), mx=Math.max(...vals), rng=mx-mn||0.5;
  const toX = i => (PL + i/(yields.length-1)*cw).toFixed(1);
  const toY = v => (PT + ch - (v-mn)/rng*ch).toFixed(1);
  const pts  = yields.map((y,i)=>`${toX(i)},${toY(y.value)}`).join(' ');
  const isInverted = vals[0] > vals[vals.length-1];
  const col = isInverted ? '#f85149' : '#3fb950';

  let svgHtml = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block">
    <defs><linearGradient id="ycGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${col}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${col}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${'M'+pts.split(' ').join(' L')} L${toX(yields.length-1)},${PT+ch} L${PL},${PT+ch} Z" fill="url(#ycGrad)"/>
    <polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linejoin="round"/>`;
  // X labels (every 3rd)
  yields.forEach((y,i)=>{ if(i%3===0) svgHtml += `<text x="${toX(i)}" y="${H-4}" font-size="7" fill="#6e7681" text-anchor="middle">${y.label}</text>`; });
  // Y labels min/max
  svgHtml += `<text x="${PL-3}" y="${toY(mx)}" font-size="7" fill="#6e7681" text-anchor="end" dominant-baseline="central">${mx.toFixed(2)}</text>`;
  svgHtml += `<text x="${PL-3}" y="${toY(mn)}" font-size="7" fill="#6e7681" text-anchor="end" dominant-baseline="central">${mn.toFixed(2)}</text>`;
  svgHtml += `</svg>`;

  // KPI row
  const two = yields.find(y=>y.label==='2Y')?.value;
  const ten = yields.find(y=>y.label==='10Y')?.value;
  const spread = (two!=null&&ten!=null) ? (ten-two).toFixed(2) : null;
  const spreadCls = spread!=null && parseFloat(spread)<0 ? 'neg' : 'pos';

  el.innerHTML = `<div class="av-live-badge">● Treasury Yield Curve · ${date} · <span style="color:var(--accent)">${src}</span>${isInverted?'<span style="color:#f85149;margin-left:6px">⚠ INVERTED</span>':''}</div>
    <div class="fred-yield-kpis">
      ${[{l:'3M',v:yields.find(y=>y.label==='3M')?.value},{l:'2Y',v:two},{l:'5Y',v:yields.find(y=>y.label==='5Y')?.value},{l:'10Y',v:ten},{l:'30Y',v:yields.find(y=>y.label==='30Y')?.value}]
        .filter(k=>k.v!=null).map(k=>`<div class="fred-yc-kpi"><span class="fred-yc-lbl">${k.l}</span><span class="fred-yc-val">${k.v.toFixed(2)}%</span></div>`).join('')}
      ${spread!=null?`<div class="fred-yc-kpi"><span class="fred-yc-lbl">10Y−2Y</span><span class="fred-yc-val ${spreadCls}">${parseFloat(spread)>=0?'+':''}${spread}%</span></div>`:''}
    </div>
    <div style="padding:6px 10px 8px">${svgHtml}</div>`;
  // Return the container so credit spreads can be appended after
  return el;
}

async function fredLoadYieldCurve() {
  const el = document.getElementById('macro-yield');
  if (!el) return;
  el.innerHTML = fredSpinner();

  // ── 1. US Treasury Direct (no key needed) ────────────────────
  const treasuryData = await fredLoadTreasuryDirect();
  const hasYields = Array.isArray(treasuryData?.yields) && treasuryData.yields.length > 0;
  if (hasYields) {
    _fredRenderYieldCurve(el, treasuryData.yields, treasuryData.date, treasuryData.src);
  }

  // ── 2. FRED credit spreads (BAMLC0A0CM, BAMLH0A0HYM2, T10YIE) ─
  if (!getFredKey()) {
    if (!hasYields) el.innerHTML = fredNoKey();
    return;
  }

  try {
    const SPREAD_SERIES = [
      { id:'BAMLC0A0CM',    label:'IG OAS',     note:'Investment Grade spread vs Treasury', col:'#58a6ff' },
      { id:'BAMLH0A0HYM2',  label:'HY OAS',     note:'High-Yield spread vs Treasury',       col:'#f85149' },
      { id:'BAMLC0A4CBBB',  label:'BBB OAS',    note:'BBB-rated spread',                    col:'#d29922' },
      { id:'T10YIE',        label:'10Y Breakeven',note:'Inflation expectation 10Y',          col:'#3fb950' },
    ];

    const results = await Promise.allSettled(
      SPREAD_SERIES.map(s => fredLatest(s.id).then(v => ({ ...s, value: v ? parseFloat(v.value) : null, date: v?.date })))
    );

    let credHtml = `<div class="fred-section-head" style="margin-top:10px">📊 Credit Spreads &amp; Inflation Breakeven</div>
      <div class="fred-cs-grid">`;
    for (const r of results) {
      if (r.status !== 'fulfilled' || r.value.value == null) continue;
      const p = r.value;
      const level = p.label==='IG OAS' ? (p.value<100?'tight':'wide') : p.label==='HY OAS' ? (p.value<400?'tight':'wide') : '';
      credHtml += `<div class="fred-cs-card" title="${fredEsc(p.note)}">
        <div class="fred-cs-label">${fredEsc(p.label)}</div>
        <div class="fred-cs-val" style="color:${p.col}">${p.value.toFixed(0)}<span style="font-size:9px;margin-left:2px">bps</span></div>
        ${level?`<div class="fred-cs-note ${level==='tight'?'pos':'neg'}">${level.toUpperCase()}</div>`:''}
        <div class="fred-cs-date">${p.date||''}</div>
      </div>`;
    }
    credHtml += `</div>`;

    // Append to yield curve section
    const section = el.querySelector('.fred-yield-kpis')?.closest('div[data-fred-yc]') || el;
    el.innerHTML += credHtml;

  } catch(e) {
    el.innerHTML += fredError(e.message);
  }
}


/* ══════════════════════════════════════════════════════════════════
   MACRO INDICATORS  — Macro·Intel ECON tab
   FEDFUNDS, CPIAUCSL, GDP, UNRATE, T10YIE, BAMLH0A0HYM2
   ══════════════════════════════════════════════════════════════════ */
const FRED_MACRO_SERIES = [
  { id:'FEDFUNDS',     label:'Fed Funds Rate',     unit:'%',    icon:'🏦', desc:'Effective Federal Funds Rate' },
  { id:'CPIAUCSL',     label:'CPI (All Items)',     unit:'idx',  icon:'🛒', desc:'Consumer Price Index, Urban, All Items' },
  { id:'CPILFESL',     label:'Core CPI',            unit:'idx',  icon:'📦', desc:'CPI ex Food & Energy' },
  { id:'GDP',          label:'GDP',                 unit:'$B',   icon:'📈', desc:'Nominal GDP, quarterly SAAR' },
  { id:'GDPC1',        label:'Real GDP',             unit:'$B',   icon:'📊', desc:'Real GDP (2017 dollars)' },
  { id:'UNRATE',       label:'Unemployment',        unit:'%',    icon:'👷', desc:'Civilian Unemployment Rate' },
  { id:'ICSA',         label:'Initial Jobless Claims', unit:'K', icon:'📋', desc:'Weekly initial claims (thousands)' },
  { id:'PCEPI',        label:'PCE Inflation',       unit:'idx',  icon:'💰', desc:'PCE Price Index (Fed preferred)' },
  { id:'M2SL',         label:'M2 Money Supply',     unit:'$B',   icon:'💵', desc:'M2 broad money supply' },
  { id:'UMCSENT',      label:'Consumer Sentiment',  unit:'idx',  icon:'😊', desc:'Univ. of Michigan Consumer Sentiment' },
];

async function fredLoadMacroIndicators() {
  const el = document.getElementById('macro-econ');
  if (!el) return;
  if (!getFredKey()) {
    // Show World Bank global macro data as free fallback
    if (typeof macroLoadEconFallback === 'function') {
      macroLoadEconFallback(el);
    } else {
      el.innerHTML = fredNoKey();
    }
    return;
  }
  el.innerHTML = fredSpinner();
  try {
    const results = await Promise.allSettled(
      FRED_MACRO_SERIES.map(s =>
        fredFetch(s.id, { limit: 3 }).then(obs => ({
          ...s,
          latest: obs[0] ? parseFloat(obs[0].value) : null,
          prev:   obs[1] ? parseFloat(obs[1].value) : null,
          date:   obs[0]?.date,
        }))
      )
    );

    let html = `<div class="fred-section-head">🏛 FRED Macro Indicators</div>
    <div class="fred-macro-grid">`;
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const p = r.value;
      const chg  = (p.latest !== null && p.prev !== null) ? p.latest - p.prev : null;
      const pct  = (p.prev && chg !== null) ? (chg / Math.abs(p.prev) * 100) : null;
      const up   = chg !== null && chg >= 0;
      const arrow = chg === null ? '' : (up ? '▲' : '▼');
      const cls   = chg === null ? '' : (up ? 'fred-pos' : 'fred-neg');
      let dispVal = '—';
      if (p.latest !== null) {
        if (p.unit === '%') dispVal = p.latest.toFixed(2) + '%';
        else if (p.unit === '$B') dispVal = (p.latest >= 1000 ? (p.latest/1000).toFixed(1)+'T' : p.latest.toFixed(0)+'B');
        else if (p.unit === 'K') dispVal = p.latest.toFixed(0) + 'K';
        else dispVal = p.latest.toFixed(1);
      }
      html += `<div class="fred-macro-card" title="${fredEsc(p.desc)}">
        <div class="fred-mc-icon">${p.icon}</div>
        <div class="fred-mc-body">
          <div class="fred-mc-label">${fredEsc(p.label)}</div>
          <div class="fred-mc-val">${fredEsc(dispVal)}</div>
          ${chg !== null ? `<div class="fred-mc-chg ${cls}">${arrow} ${Math.abs(pct ?? chg).toFixed(2)}${pct !== null ? '%' : ''}</div>` : ''}
          <div class="fred-mc-date">${p.date || ''}</div>
        </div>
      </div>`;
    }
    html += `</div>`;

    /* Mini sparklines for key series */
    html += `<div class="fred-section-head" style="margin-top:14px">📉 FEDFUNDS · UNRATE · CPI (12 observations)</div>`;
    html += await fredSparkRow(['FEDFUNDS','UNRATE','CPIAUCSL'], ['Fed Funds','Unemployment','CPI']);
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = e.message === 'NO_KEY' ? fredNoKey() : fredError(e.message);
  }
}

/* Mini spark row for 3 series side by side */
async function fredSparkRow(seriesIds, labels) {
  const results = await Promise.allSettled(
    seriesIds.map(id => fredFetch(id, { limit: 24 }))
  );
  let html = `<div class="fred-spark-row">`;
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    const obs = r.value.reverse(); // oldest→newest
    const vals = obs.map(o => parseFloat(o.value)).filter(v => !isNaN(v));
    if (!vals.length) return;
    const mx = Math.max(...vals), mn = Math.min(...vals), range = mx - mn || 1;
    const W = 100, H = 36;
    const xStep = W / (vals.length - 1 || 1);
    const toX = j => (j * xStep).toFixed(1);
    const toY = v => (H - ((v - mn) / range) * H).toFixed(1);
    const d = vals.map((v, j) => `${j === 0 ? 'M' : 'L'}${toX(j)},${toY(v)}`).join(' ');
    const last = vals[vals.length - 1];
    html += `<div class="fred-spark-cell">
      <div class="fred-spark-label">${fredEsc(labels[i])}</div>
      <svg viewBox="0 0 ${W} ${H}" class="fred-spark-svg">
        <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="1.2"/>
        <circle cx="${toX(vals.length-1)}" cy="${toY(last)}" r="2" fill="var(--accent)"/>
      </svg>
      <div class="fred-spark-val">${last.toFixed(2)}</div>
    </div>`;
  });
  html += `</div>`;
  return html;
}

/* ══════════════════════════════════════════════════════════════════
   INIT + REFRESH
   ══════════════════════════════════════════════════════════════════ */
function fredInitAll() {
  fredLoadYieldCurve();
  fredLoadMacroIndicators();
}

/* ── US Treasury Direct XML (no key, official daily data) ────────── */
async function fredLoadTreasuryDirect() {
  const el = document.getElementById('macro-yield');
  if (!el) return;
  try {
    const now   = new Date();
    const yyyymm= `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}`;
    const url   = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month=${yyyymm}`;
    const res   = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const text  = await res.text();
    const parser= new DOMParser();
    const xml   = parser.parseFromString(text, 'text/xml');
    const entries = xml.querySelectorAll('entry');
    if (!entries.length) return null;
    const last  = entries[entries.length-1];
    const getV  = tag => parseFloat(last.querySelector(tag)?.textContent || '0');
    const yieldPairs = [
      { label:'1M',  value: getV('d\\:BC_1MONTH,  BC_1MONTH')  },
      { label:'3M',  value: getV('d\\:BC_3MONTH,  BC_3MONTH')  },
      { label:'6M',  value: getV('d\\:BC_6MONTH,  BC_6MONTH')  },
      { label:'1Y',  value: getV('d\\:BC_1YEAR,   BC_1YEAR')   },
      { label:'2Y',  value: getV('d\\:BC_2YEAR,   BC_2YEAR')   },
      { label:'3Y',  value: getV('d\\:BC_3YEAR,   BC_3YEAR')   },
      { label:'5Y',  value: getV('d\\:BC_5YEAR,   BC_5YEAR')   },
      { label:'7Y',  value: getV('d\\:BC_7YEAR,   BC_7YEAR')   },
      { label:'10Y', value: getV('d\\:BC_10YEAR,  BC_10YEAR')  },
      { label:'20Y', value: getV('d\\:BC_20YEAR,  BC_20YEAR')  },
      { label:'30Y', value: getV('d\\:BC_30YEAR,  BC_30YEAR')  },
    ].filter(y => y.value > 0);

    const result = {
      date:   last.querySelector('d\\:NEW_DATE, NEW_DATE')?.textContent?.slice(0,10) || '',
      yields: yieldPairs,
      src:    'US Treasury Direct',
    };
    // Cache globally for WACC/other modules (object form for backward compat)
    window._treasuryYields = Object.fromEntries(yieldPairs.map(y => [y.label, y.value]));
    return result;
  } catch(e) {
    console.warn('[Treasury Direct]', e.message);
    return null;
  }
}
window.fredLoadTreasuryDirect = fredLoadTreasuryDirect;

/* Lazy-load when tab is first clicked */
function fredLazyYield() {
  const el = document.getElementById('macro-yield');
  if (el && !el.dataset.fredLoaded) {
    el.dataset.fredLoaded = '1';
    fredLoadYieldCurve();
  }
}
function fredLazyEcon() {
  const el = document.getElementById('macro-econ');
  if (el && !el.dataset.fredLoaded) {
    el.dataset.fredLoaded = '1';
    fredLoadMacroIndicators();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Only load if key already exists — otherwise wait for saveKey callback
  if (getFredKey()) fredInitAll();
  // Always fetch TreasuryDirect (no key required) to populate window._treasuryYields
  // for the WACC risk-free rate — runs silently in background
  setTimeout(() => {
    if (typeof fredLoadTreasuryDirect === 'function') {
      fredLoadTreasuryDirect().catch(() => {});
    }
  }, 3000); // 3s delay — after page fully settles, non-blocking
  // Refresh every 30 min
  setInterval(() => {
    if (!getFredKey()) return;
    _fredCache.clear();
    fredLoadYieldCurve();
    fredLoadMacroIndicators();
  }, 30 * 60 * 1000);
});
/* ══════════════════════════════════════════════════════════════════
   STEP 1 ADDITION — append this block to the end of fred.js
   Adds: fredGetCreditSpreads() for valuation engine credit pipeline
   Series fetched:
     BAMLC0A0CM      — Investment Grade OAS spread (bps)
     BAMLH0A0HYM2    — High Yield OAS spread (bps)
     BAMLC0A4CBBB    — BBB-rated OAS spread (bps)
     BAMLC0A1CAAAEY  — AAA effective yield (%)
     DGS10           — 10Y Treasury yield / risk-free rate (%)
   ══════════════════════════════════════════════════════════════════ */

/* ── Credit Spread Series definitions ──────────────────────────── */
const FRED_CREDIT_SERIES = [
  { id: 'BAMLC0A0CM',     label: 'IG OAS',      unit: 'bps',  tier: 'ig'  },
  { id: 'BAMLH0A0HYM2',   label: 'HY OAS',      unit: 'bps',  tier: 'hy'  },
  { id: 'BAMLC0A4CBBB',   label: 'BBB OAS',     unit: 'bps',  tier: 'bbb' },
  { id: 'BAMLC0A1CAAAEY', label: 'AAA Yield',   unit: '%',    tier: 'aaa' },
  { id: 'DGS10',          label: '10Y Yield',   unit: '%',    tier: 'rfr' },
];

/* ── In-memory credit cache (24h TTL — spreads are slow-moving) ── */
const _fredCreditCache = { data: null, ts: 0 };
const FRED_CREDIT_TTL  = 24 * 60 * 60 * 1000;   // 24 hours

/**
 * fredGetCreditSpreads()
 * Fetches all five FRED credit/yield series in parallel.
 * Returns a structured object consumed by valuation-datasources.js.
 *
 * @returns {Promise<{
 *   igOAS: number,        // IG OAS spread in bps
 *   hyOAS: number,        // HY OAS spread in bps
 *   bbbOAS: number,       // BBB OAS spread in bps
 *   aaaYield: number,     // AAA effective yield %
 *   riskFreeRate: number, // 10Y Treasury yield %
 *   timestamp: string,    // date of most recent observation
 *   raw: object           // keyed by series id for debugging
 * } | null>}
 */
window.fredGetCreditSpreads = async function fredGetCreditSpreads() {
  /* L1 memory cache */
  if (_fredCreditCache.data && Date.now() - _fredCreditCache.ts < FRED_CREDIT_TTL) {
    return _fredCreditCache.data;
  }

  if (!getFredKey()) {
    /* Graceful degradation — return null so callers can use proxies */
    console.warn('[FRED] No key — credit spreads unavailable. Using synthetic fallback.');
    return null;
  }

  try {
    const results = await Promise.allSettled(
      FRED_CREDIT_SERIES.map(s =>
        fredLatest(s.id).then(obs => ({
          id:    s.id,
          tier:  s.tier,
          label: s.label,
          unit:  s.unit,
          value: obs ? parseFloat(obs.value) : null,
          date:  obs?.date || null,
        }))
      )
    );

    const raw = {};
    let latestDate = '';
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      raw[r.value.id] = r.value;
      if (r.value.date > latestDate) latestDate = r.value.date;
    }

    const out = {
      igOAS:        raw['BAMLC0A0CM']?.value     ?? null,
      hyOAS:        raw['BAMLH0A0HYM2']?.value   ?? null,
      bbbOAS:       raw['BAMLC0A4CBBB']?.value   ?? null,
      aaaYield:     raw['BAMLC0A1CAAAEY']?.value ?? null,
      riskFreeRate: raw['DGS10']?.value           ?? null,
      timestamp:    latestDate,
      raw,
    };

    /* Store in global treasury yields for WACC reuse */
    if (out.riskFreeRate !== null) {
      window._treasuryYields = window._treasuryYields || {};
      window._treasuryYields['10Y'] = out.riskFreeRate;
    }

    /* Cache result */
    _fredCreditCache.data = out;
    _fredCreditCache.ts   = Date.now();

    /* Also persist to sessionStorage for cross-session reuse */
    try {
      sessionStorage.setItem('fred_credit_spreads', JSON.stringify({
        data: out, ts: Date.now()
      }));
    } catch (_) { /* quota */ }

    return out;

  } catch (e) {
    console.warn('[FRED] fredGetCreditSpreads error:', e.message);
    return null;
  }
};

/**
 * fredGetCreditSpreadsSync()
 * Synchronous read from sessionStorage cache — used by
 * valuation-datasources.js when it needs a non-async fallback.
 * Returns null if cache is cold.
 */
window.fredGetCreditSpreadsSync = function fredGetCreditSpreadsSync() {
  try {
    const raw = sessionStorage.getItem('fred_credit_spreads');
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > FRED_CREDIT_TTL) return null;
    return data;
  } catch (_) { return null; }
};
