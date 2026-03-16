/* ══════════════════════════════════════════════════════════════════
   FINTERM — energy.js  (Phase 1a)
   Energy data integration layer
   Sources: EIA (no key) · OPEC (no key, proxy) · ENTSOG (no key) · GIE (free key)
   Panel: Macro·Intel → ⚡ ENERGY tab  (macro-energy)
   ══════════════════════════════════════════════════════════════════ */

const _EN = {};
function _enGet(k, ms) { const e = _EN[k]; return (e && Date.now()-e.ts < ms) ? e.d : null; }
function _enSet(k, d)  { _EN[k] = { d, ts: Date.now() }; }
const _enEsc = s => String(s??'').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
const _enFmt = (n,d=2) => n==null||isNaN(n)?'—':Number(n).toFixed(d);
const _enFmtB = n => { if(!n) return '—'; const a=Math.abs(n); if(a>=1e9) return (n/1e9).toFixed(2)+'B'; if(a>=1e6) return (n/1e6).toFixed(2)+'M'; return Number(n).toLocaleString(); };

function getGieKey() {
  return (window._KEYS&&window._KEYS['gie'])||localStorage.getItem('finterm_key_gie')||'';
}

async function _enProxyFetch(url, cacheKey, ttlMs=15*60*1000) {
  const cached = _enGet(cacheKey, ttlMs);
  if (cached) return cached;
  const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  try {
    const res = await fetch(proxy, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    _enSet(cacheKey, text);
    return text;
  } catch(e) { console.warn('[energy]', cacheKey, e.message); return null; }
}

async function _enFetchJSON(url, cacheKey, ttlMs=15*60*1000, headers={}) {
  const cached = _enGet(cacheKey, ttlMs);
  if (cached) return cached;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    _enSet(cacheKey, data);
    return data;
  } catch(e) { console.warn('[energy]', cacheKey, e.message); return null; }
}

/* ── EIA XLS parser ─────────────────────────────────────────────── */
function _eiaParseXls(text) {
  if (!text) return [];
  const results = [];
  for (const line of text.trim().split('\n')) {
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    const date = parts[0]?.trim();
    const val  = parseFloat(parts[parts.length-1]);
    if (date && date.match(/\d{4}/) && !isNaN(val)) results.push({ date, value: val });
  }
  return results.slice(-30);
}

/* ── EIA fetchers (no key, public XLS endpoints) ─────────────────── */
async function eiaGetWTI()          { return _eiaParseXls(await _enProxyFetch('https://www.eia.gov/dnav/pet/hist_xls/RWTCd.xls','eia_wti',30*60*1000)); }
async function eiaGetHenryHub()     { return _eiaParseXls(await _enProxyFetch('https://www.eia.gov/dnav/ng/hist_xls/RNGWHHDd.xls','eia_hh',30*60*1000)); }
async function eiaGetGasStorage()   { return _eiaParseXls(await _enProxyFetch('https://www.eia.gov/dnav/ng/hist_xls/NW2_EPG0_SWO_R48_BCFw.xls','eia_storage',60*60*1000)); }
async function eiaGetCoalProduction(){ return _eiaParseXls(await _enProxyFetch('https://www.eia.gov/coal/production/weekly/xls/coalprod.xls','eia_coal',7*24*60*60*1000)); }

/* ── OPEC basket (public page, HTML parse) ──────────────────────── */
async function opecGetBasketPrice() {
  const cached = _enGet('opec_basket', 60*60*1000);
  if (cached) return cached;
  const text = await _enProxyFetch('https://www.opec.org/opec_web/en/data_graphs/40.htm','_opec_raw',60*60*1000);
  if (!text) return null;
  const m1 = text.match(/\$\s*([\d]+\.[\d]{2})/);
  const m2  = text.match(/([\d]{2,3}\.[\d]{2})\s*USD/);
  const price = m1 ? parseFloat(m1[1]) : m2 ? parseFloat(m2[1]) : null;
  const result = { price, date: new Date().toISOString().slice(0,10), source:'OPEC.org' };
  _enSet('opec_basket', result);
  return result;
}

/* ── GIE AGSI (free key) ────────────────────────────────────────── */
async function gieGetStorageData(country='EU') {
  const key = getGieKey();
  const cacheKey = `gie_storage_${country}`;
  const cached = _enGet(cacheKey, 60*60*1000);
  if (cached) return cached;
  const headers = key ? { 'x-key': key } : {};
  const from = new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  const till = new Date().toISOString().slice(0,10);
  const url = `https://agsi.gie.eu/api?country=${country}&size=30&page=1&from=${from}&till=${till}`;
  const data = await _enFetchJSON(url, cacheKey, 60*60*1000, headers);
  return data;
}

/* ── Sparkline ──────────────────────────────────────────────────── */
function _enSparkline(series, color='#58a6ff') {
  if (!series||series.length<2) return '';
  const vals = series.map(d=>d.value||d).filter(v=>!isNaN(v));
  if (vals.length<2) return '';
  const mn=Math.min(...vals), mx=Math.max(...vals), range=mx-mn||1;
  const W=120, H=32;
  const pts = vals.map((v,i)=>`${(i/(vals.length-1)*W).toFixed(1)},${(H-((v-mn)/range)*H).toFixed(1)}`).join(' ');
  const lastY = H-((vals[vals.length-1]-mn)/range)*H;
  return `<svg width="${W}" height="${H}" style="display:block;overflow:visible">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="${W}" cy="${lastY.toFixed(1)}" r="2.5" fill="${color}"/>
  </svg>`;
}

/* ══════════════════════════════════════════════════════════════════
   RENDER
   ══════════════════════════════════════════════════════════════════ */
async function energyLoadAll() {
  const el = document.getElementById('macro-energy');
  if (!el) return;
  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading energy data from EIA, OPEC, ENTSOG, GIE…</div>`;

  const [wti, hh, storage, coal, opec, gieEU] = await Promise.all([
    eiaGetWTI(), eiaGetHenryHub(), eiaGetGasStorage(), eiaGetCoalProduction(), opecGetBasketPrice(), gieGetStorageData('EU'),
  ]);

  const gieKey = getGieKey();
  let html = `<div class="av-live-badge">● Energy Intelligence · EIA (no key) · OPEC · ENTSOG · GIE AGSI</div>`;

  /* ── US Energy KPIs ─────────────────────────────────────────────── */
  html += `<div class="section-head">🛢 US Energy Benchmarks — EIA (Public Data, No Key Required)</div>`;
  html += `<div class="energy-kpi-grid">`;

  const _kpi = (label, series, unit, decimals=2, color='#58a6ff') => {
    const last = series?.length ? series[series.length-1] : null;
    const prev = series?.length>1 ? series[series.length-2] : null;
    const chg  = last&&prev ? last.value-prev.value : null;
    const pct  = chg&&prev ? (chg/Math.abs(prev.value)*100) : null;
    const cls  = chg>0?'pos':chg<0?'neg':'';
    return `<div class="energy-kpi-card">
      <div class="energy-kpi-label">${label}</div>
      <div class="energy-kpi-val">${last ? (unit==='$'?'$':'') + _enFmt(last.value,decimals) + (unit!=='$'?' '+unit:'') : '—'}</div>
      <div class="energy-kpi-sub ${cls}">${chg!=null?(chg>0?'▲ +':'▼ ')+Math.abs(chg).toFixed(decimals)+(pct!=null?' ('+Math.abs(pct).toFixed(2)+'%)':''):'—'}</div>
      <div class="energy-kpi-date">${last?.date||'—'}</div>
      ${_enSparkline(series?.slice(-20), chg>=0?'#3fb950':'#f85149')}
    </div>`;
  };

  html += _kpi('🛢 WTI Crude Oil ($/bbl)', wti, '$');
  html += _kpi('🔥 Henry Hub Gas ($/MMBtu)', hh, '$', 3);
  html += _kpi('🏭 US Gas Storage (Bcf)', storage, 'Bcf', 0);
  html += _kpi('⚫ US Coal Production (kST)', coal, 'kST', 0, '#8b949e');

  /* OPEC basket */
  html += `<div class="energy-kpi-card">
    <div class="energy-kpi-label">🏴 OPEC Reference Basket</div>
    <div class="energy-kpi-val">${opec?.price ? '$'+_enFmt(opec.price) : '<span style="font-size:11px;color:var(--text-muted)">Parsing…</span>'}</div>
    <div class="energy-kpi-sub" style="color:var(--text-muted)">Multi-grade average · $/bbl</div>
    <div class="energy-kpi-date">${opec?.date||'—'} · OPEC.org</div>
  </div>`;

  html += `</div>`;

  /* ── EU Gas Storage ─────────────────────────────────────────────── */
  html += `<div class="section-head" style="margin-top:14px">🇪🇺 EU Natural Gas Storage — GIE AGSI ${gieKey?'<span style="color:#3fb950;font-size:10px">● Key configured</span>':'<span style="color:#d29922;font-size:10px">⚠ Add free GIE key for live data</span>'}</div>`;

  if (gieEU?.data?.length) {
    const d0 = gieEU.data[0];
    const fill = parseFloat(d0.full||d0.gasInStorage||d0.fillPct||0);
    const trend = gieEU.data.slice(0,14).map(d=>({value:parseFloat(d.full||d.gasInStorage||0)})).reverse();
    const fillColor = fill>80?'#3fb950':fill<40?'#f85149':'#d29922';
    html += `<div class="energy-storage-panel">
      <div class="energy-storage-header">
        <span class="energy-storage-label">EU Storage Fill Level</span>
        <span class="energy-storage-pct" style="color:${fillColor}">${_enFmt(fill,1)}%</span>
      </div>
      <div class="energy-storage-bar"><div class="energy-storage-fill" style="width:${Math.min(100,fill).toFixed(1)}%;background:${fillColor}"></div></div>
      <div class="energy-storage-meta">
        <span>Date: ${d0.gasDayStart||d0.date||'—'}</span>
        <span>Trend (14d):</span>
        ${_enSparkline(trend, fillColor)}
      </div>
    </div>`;
  } else if (!gieKey) {
    html += `<div class="no-data">// EU gas storage data requires a free GIE AGSI API key.<br>
      // <a href="https://agsi.gie.eu/" target="_blank" rel="noopener" style="color:var(--accent)">Register at agsi.gie.eu ↗</a> — then add key via ⚙ API Settings → GIE.</div>`;
  } else {
    html += `<div class="no-data">// GIE data unavailable. Verify your key at agsi.gie.eu.</div>`;
  }

  /* ── ENTSOG info ────────────────────────────────────────────────── */
  html += `<div class="section-head" style="margin-top:14px">🔀 EU Gas Network Flows — ENTSOG Transparency Platform</div>`;
  html += `<div class="energy-entsog-info">
    <div class="metric-row"><span class="metric-label">Coverage</span><span class="metric-value">Cross-border flows · storage injections/withdrawals · LNG send-out · virtual interconnection points</span></div>
    <div class="metric-row"><span class="metric-label">Update Frequency</span><span class="metric-value" style="color:#3fb950">Near real-time operational data (regulated EU transparency)</span></div>
    <div class="metric-row"><span class="metric-label">API Access</span><span class="metric-value" style="color:#3fb950">✓ Public REST API — no API key required</span></div>
    <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
      <a href="https://transparency.entsog.eu/" target="_blank" rel="noopener" class="energy-entsog-link">↗ ENTSOG Transparency Platform</a>
      <a href="https://transparency.entsog.eu/api/v1/operationaldatas?limit=50&indicator=Physical+Flow&periodType=day" target="_blank" rel="noopener" class="energy-entsog-link">↗ Live Flow API (JSON)</a>
    </div>
  </div>`;

  /* ── Hydrogen Observatory ─────────────────────────────────────── */
  html += `<div class="section-head" style="margin-top:14px">⚗ European Hydrogen Observatory</div>`;
  html += `<div class="energy-hydrogen-grid">
    <div class="energy-hydrogen-card">
      <div class="energy-hydrogen-name">EU Electrolyser Capacity Dataset</div>
      <div class="energy-hydrogen-note">Annual installed capacity by country and technology (2022–2024)</div>
      <a href="https://observatory.clean-hydrogen.europa.eu/tools-reports/datasets" target="_blank" rel="noopener" class="energy-entsog-link">↗ Download Dataset</a>
    </div>
    <div class="energy-hydrogen-card">
      <div class="energy-hydrogen-name">Levelised Cost of Hydrogen (LCOH)</div>
      <div class="energy-hydrogen-note">Production cost by technology, country, and reference year</div>
      <a href="https://observatory.clean-hydrogen.europa.eu/hydrogen-landscape/production-trade-and-cost/cost-hydrogen-production" target="_blank" rel="noopener" class="energy-entsog-link">↗ View Cost Data</a>
    </div>
  </div>`;

  html += `<div class="av-note" style="margin-top:12px">
    Data: <a href="https://www.eia.gov" target="_blank" rel="noopener" style="color:var(--accent)">EIA.gov</a> (public domain) ·
    <a href="https://www.opec.org" target="_blank" rel="noopener" style="color:var(--accent)">OPEC.org</a> (public) ·
    <a href="https://transparency.entsog.eu" target="_blank" rel="noopener" style="color:var(--accent)">ENTSOG</a> (EU regulated transparency) ·
    <a href="https://agsi.gie.eu" target="_blank" rel="noopener" style="color:var(--accent)">GIE AGSI</a> (CC BY 4.0)
  </div>`;

  el.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', e => {
    if (e.target.dataset?.tab === 'energy') {
      const el = document.getElementById('macro-energy');
      if (el && !el.dataset.energyLoaded) { el.dataset.energyLoaded='1'; energyLoadAll(); }
    }
  });
  setInterval(() => {
    const el = document.getElementById('macro-energy');
    if (el?.dataset.energyLoaded) { Object.keys(_EN).forEach(k=>delete _EN[k]); energyLoadAll(); }
  }, 30*60*1000);
});

window.energyLoadAll = energyLoadAll;
window.getGieKey = getGieKey;
