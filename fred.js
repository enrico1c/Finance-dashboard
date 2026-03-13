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
  { id:'T10YIE',   label:'10Y Breakeven',    note:'10-yr inflation expectation'  },
  { id:'BAMLH0A0HYM2', label:'HY OAS Spread', note:'High-yield credit risk'     },
];

async function fredLoadYieldCurve() {
  const el = document.getElementById('macro-yield');
  if (!el) return;
  if (!getFredKey()) { el.innerHTML = fredNoKey(); return; }
  el.innerHTML = fredSpinner();
  try {
    const results = await Promise.allSettled(
      FRED_YIELD_SERIES.map(s => fredLatest(s.id).then(v => ({ ...s, value: v ? parseFloat(v.value) : null, date: v?.date })))
    );
    const points = results.map((r,i) => r.status === 'fulfilled' ? r.value : { ...FRED_YIELD_SERIES[i], value: null });
    const valid  = points.filter(p => p.value !== null);

    /* SVG yield curve chart */
    const maxY  = Math.max(...valid.map(p => p.value), 6);
    const minY  = Math.min(...valid.map(p => p.value), 0);
    const range = maxY - minY || 1;
    const W = 320, H = 120, PL = 36, PR = 10, PT = 8, PB = 28;
    const cw = W - PL - PR, ch = H - PT - PB;
    const xStep = valid.length > 1 ? cw / (valid.length - 1) : cw;
    const toX = i => PL + i * xStep;
    const toY = v => PT + ch - ((v - minY) / range) * ch;

    const pathD = valid.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.value).toFixed(1)}`).join(' ');
    const areaD = pathD + ` L${toX(valid.length-1).toFixed(1)},${(PT+ch).toFixed(1)} L${PL},${(PT+ch).toFixed(1)} Z`;

    const yTicks = [minY, (minY+maxY)/2, maxY].map(v => ({
      y: toY(v), label: v.toFixed(2) + '%'
    }));
    const inverted = valid.length >= 2 && valid[0].value > valid[valid.length - 1].value;

    let html = `
    <div class="fred-section-head">🏦 US Treasury Yield Curve
      <span class="fred-badge ${inverted ? 'fred-badge-warn' : 'fred-badge-ok'}">
        ${inverted ? '⚠ INVERTED' : '✓ NORMAL'}
      </span>
      <span class="fred-date">${valid[0]?.date || ''}</span>
    </div>
    <svg viewBox="0 0 ${W} ${H}" class="fred-yield-svg" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="yieldGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${inverted ? '#ff4d4d' : 'var(--accent)'}" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="${inverted ? '#ff4d4d' : 'var(--accent)'}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${yTicks.map(t => `
        <line x1="${PL}" y1="${t.y.toFixed(1)}" x2="${W-PR}" y2="${t.y.toFixed(1)}" stroke="var(--border)" stroke-width="0.5"/>
        <text x="${PL-4}" y="${(t.y+3).toFixed(1)}" text-anchor="end" font-size="7" fill="var(--text-dim)">${t.label}</text>
      `).join('')}
      <path d="${areaD}" fill="url(#yieldGrad)"/>
      <path d="${pathD}" fill="none" stroke="${inverted ? '#ff4d4d' : 'var(--accent)'}" stroke-width="1.5"/>
      ${valid.map((p, i) => `
        <circle cx="${toX(i).toFixed(1)}" cy="${toY(p.value).toFixed(1)}" r="2.5"
          fill="${inverted ? '#ff4d4d' : 'var(--accent)'}"/>
        <text x="${toX(i).toFixed(1)}" y="${(PT+ch+PB-4).toFixed(1)}"
          text-anchor="middle" font-size="7" fill="var(--text-dim)">${p.label}</text>
      `).join('')}
    </svg>`;

    /* Yield table */
    html += `<div class="fred-yield-grid">`;
    for (const p of valid) {
      html += `<div class="fred-yield-cell">
        <span class="fred-y-label">${fredEsc(p.label)}</span>
        <span class="fred-y-val">${p.value !== null ? p.value.toFixed(2)+'%' : '—'}</span>
      </div>`;
    }
    html += `</div>`;

    /* Spreads */
    const spreadResults = await Promise.allSettled(
      FRED_SPREAD_SERIES.map(s => fredLatest(s.id).then(v => ({ ...s, value: v ? parseFloat(v.value) : null, date: v?.date })))
    );
    html += `<div class="fred-section-head" style="margin-top:12px">📊 Key Spreads & Breakevens</div>`;
    html += `<div class="fred-spread-list">`;
    for (const r of spreadResults) {
      if (r.status !== 'fulfilled') continue;
      const p = r.value;
      const cls = p.id === 'T10Y2Y' || p.id === 'T10Y3M'
        ? (p.value < 0 ? 'fred-neg' : 'fred-pos')
        : (p.value !== null && p.value > 3 ? 'fred-warn' : 'fred-ok');
      html += `<div class="fred-spread-row">
        <span class="fred-spread-label">${fredEsc(p.label)}</span>
        <span class="fred-spread-note">${fredEsc(p.note)}</span>
        <span class="fred-spread-val ${cls}">${p.value !== null ? p.value.toFixed(2)+'%' : '—'}</span>
      </div>`;
    }
    html += `</div>`;
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = e.message === 'NO_KEY' ? fredNoKey() : fredError(e.message);
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
  if (!getFredKey()) { el.innerHTML = fredNoKey(); return; }
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
  // Refresh every 30 min
  setInterval(() => {
    if (!getFredKey()) return;
    _fredCache.clear();
    fredLoadYieldCurve();
    fredLoadMacroIndicators();
  }, 30 * 60 * 1000);
});
