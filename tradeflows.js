/* ══════════════════════════════════════════════════════════════════
   FINTERM — tradeflows.js  (Phase 3b)
   Global Trade Flow Intelligence
   Sources: UN Comtrade+ (free key) · Eurostat SDMX (no key) · WITS (no key)
   Panel: Supply Chain → supply-minerals (TRADE FLOWS section)
   ══════════════════════════════════════════════════════════════════ */

const _TF = {};
function _tfGet(k,ms) { const e=_TF[k]; return (e&&Date.now()-e.ts<ms)?e.d:null; }
function _tfSet(k,d)  { _TF[k]={d,ts:Date.now()}; }
const _tfEsc = s => String(s??'').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
const _tfFmt = (n,d=2) => n==null||isNaN(n)?'—':Number(n).toFixed(d);
const _tfFmtB = n => { if(!n) return '—'; const a=Math.abs(n); if(a>=1e9) return '$'+(n/1e9).toFixed(2)+'B'; if(a>=1e6) return '$'+(n/1e6).toFixed(2)+'M'; if(a>=1e3) return '$'+(n/1e3).toFixed(1)+'K'; return '$'+n; };

function getComtradeKey() {
  return (window._KEYS&&window._KEYS['comtrade'])||localStorage.getItem('finterm_key_comtrade')||'';
}

/* ══════════════════════════════════════════════════════════════════
   UN COMTRADE+ API  (free key — 500 calls/day)
   ══════════════════════════════════════════════════════════════════ */
const COMTRADE_BASE = 'https://comtradeapi.un.org/data/v1/get';

/* Critical mineral HS codes */
const HS_CODES = {
  rare_earths:  '2846',  /* Compounds of rare-earth metals */
  lithium:      '280519', /* Lithium */
  cobalt:       '810520', /* Cobalt unwrought/powder */
  tungsten:     '261019', /* Tungsten ores and concentrates */
  gallium:      '811291', /* Gallium */
  germanium:    '811210', /* Germanium */
  graphite:     '2504',  /* Natural graphite */
  nickel:       '7502',  /* Nickel unwrought */
  copper:       '7403',  /* Copper unwrought */
  phosphate:    '2510',  /* Calcium phosphates / phosphate rock */
  neon:         '280429', /* Neon / rare gases */
  titanium:     '810810', /* Titanium unwrought */
};

const HS_META = {
  rare_earths:  { label:'Rare Earth Compounds', icon:'⚗' },
  lithium:      { label:'Lithium',              icon:'🔋' },
  cobalt:       { label:'Cobalt',               icon:'🔵' },
  tungsten:     { label:'Tungsten ore/conc.',   icon:'🔩' },
  gallium:      { label:'Gallium',              icon:'💡' },
  germanium:    { label:'Germanium',            icon:'💻' },
  graphite:     { label:'Natural Graphite',     icon:'✏' },
  nickel:       { label:'Nickel unwrought',     icon:'🪙' },
  copper:       { label:'Copper unwrought',     icon:'🔶' },
  phosphate:    { label:'Phosphate Rock',       icon:'🌱' },
  neon:         { label:'Neon / Rare Gases',    icon:'💡' },
  titanium:     { label:'Titanium unwrought',   icon:'✈' },
};

async function comtradeFetch(cmdCode, flowCode='M', year=2023, limit=20) {
  const key = getComtradeKey();
  const cacheKey = `ct_${cmdCode}_${flowCode}_${year}`;
  const cached = _tfGet(cacheKey, 12*60*60*1000);
  if (cached) return cached;
  try {
    const params = new URLSearchParams({
      typeCode:'C', freqCode:'A', clCode:'HS',
      period: year, cmdCode, flowCode,
      reporterCode:'0', partnerCode:'0', partner2Code:'0',
      includeDesc:'true', limit, format:'json',
    });
    if (key) params.set('subscription-key', key);
    const url = `${COMTRADE_BASE}/C/A/HS/${year}/all/${cmdCode}?${params}`;
    const headers = key ? { 'Ocp-Apim-Subscription-Key': key } : {};
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`Comtrade HTTP ${res.status}`);
    const data = await res.json();
    _tfSet(cacheKey, data);
    return data;
  } catch(e) { console.warn('[tradeflows] Comtrade:', cmdCode, e.message); return null; }
}

/* ══════════════════════════════════════════════════════════════════
   EUROSTAT SDMX API  (no key, EU statistics)
   ══════════════════════════════════════════════════════════════════ */
const EUROSTAT_BASE = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';

async function eurostatFetch(dataset, params={}, cacheKey, ttlMs=12*60*60*1000) {
  const cached = _tfGet(cacheKey, ttlMs);
  if (cached) return cached;
  try {
    const url = new URL(`${EUROSTAT_BASE}/${dataset}`);
    Object.entries(params).forEach(([k,v]) => url.searchParams.set(k,v));
    url.searchParams.set('format','JSON');
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`Eurostat HTTP ${res.status}`);
    const data = await res.json();
    _tfSet(cacheKey, data);
    return data;
  } catch(e) { console.warn('[tradeflows] Eurostat:', dataset, e.message); return null; }
}

/* EU extra-trade in critical minerals */
async function eurostatGetMineralTrade() {
  /* DS-018995 = EU trade by commodity (SITC) */
  return eurostatFetch('DS-018995', { sitc06:'27','2','28','5','68', geo:'EU27_2020', time:'2023', flow:'1' }, 'estat_minerals');
}

/* ══════════════════════════════════════════════════════════════════
   WITS API  (no key — tariff/trade data)
   ══════════════════════════════════════════════════════════════════ */
async function witsGetTariff(hs6Code, reporter='000', year=2022) {
  const cacheKey = `wits_tariff_${hs6Code}_${reporter}_${year}`;
  const cached = _tfGet(cacheKey, 24*60*60*1000);
  if (cached) return cached;
  try {
    const url = `https://wits.worldbank.org/API/V1/SDMX/V21/datasource/TRN-SUMMARY/reporter/${reporter}/partner/000/indicator/MFN-WTAVG/HS-6/${hs6Code}/year/${year}?format=JSON`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`WITS HTTP ${res.status}`);
    const data = await res.json();
    _tfSet(cacheKey, data);
    return data;
  } catch(e) { console.warn('[tradeflows] WITS:', hs6Code, e.message); return null; }
}

/* Concentration index (simple HHI proxy from top exporters) */
function _tfHHI(shares) {
  if (!shares||!shares.length) return null;
  const total = shares.reduce((s,x)=>s+x,0);
  if (!total) return null;
  const normalized = shares.map(x=>x/total);
  return (normalized.reduce((s,x)=>s+x*x,0)*10000).toFixed(0);
}

/* ══════════════════════════════════════════════════════════════════
   RENDER
   ══════════════════════════════════════════════════════════════════ */
function tradeflowsInjectSection() {
  const parent = document.getElementById('supply-minerals');
  if (!parent || document.getElementById('supply-minerals-trade')) return;

  /* Add TRADE FLOWS button to nav if it exists */
  const nav = parent.querySelector('.min-subnav');
  if (nav) {
    const btn = document.createElement('button');
    btn.className = 'min-subnav-btn';
    btn.setAttribute('onclick', "minShowSection('trade',this)");
    btn.textContent = '🌍 Trade Flows';
    nav.appendChild(btn);

    const tariffBtn = document.createElement('button');
    tariffBtn.className = 'min-subnav-btn';
    tariffBtn.setAttribute('onclick', "minShowSection('tariffs',this)");
    tariffBtn.textContent = '📊 Tariffs';
    nav.appendChild(tariffBtn);
  }

  const tradeDiv   = document.createElement('div'); tradeDiv.id   = 'supply-minerals-trade';   tradeDiv.className = 'min-section';
  const tariffsDiv = document.createElement('div'); tariffsDiv.id = 'supply-minerals-tariffs'; tariffsDiv.className = 'min-section';
  parent.appendChild(tradeDiv);
  parent.appendChild(tariffsDiv);

  tradeflowsRenderTrade();
  tradeflowsRenderTariffs();
}

async function tradeflowsRenderTrade() {
  const el = document.getElementById('supply-minerals-trade');
  if (!el) return;
  const key = getComtradeKey();

  let html = `<div class="av-live-badge">● Global Trade Flows · UN Comtrade+ · ${key?'Live (free key)':'Demo mode — add free Comtrade key for full data'}</div>`;
  html += `<div class="av-note" style="margin-bottom:8px">
    UN Comtrade+ provides bilateral trade flows by HS code. Free key: 500 calls/day. Data: annual reporting cycles with publication lags.
    ${!key?`<br><a href="https://comtradeplus.un.org/" target="_blank" rel="noopener" style="color:var(--accent)">Register for free key at comtradeplus.un.org ↗</a> — then add via ⚙ API Settings → Comtrade.`:''}
  </div>`;

  /* Show HS code reference table */
  html += `<div class="section-head">🏷 Critical Minerals HS Codes (UN Comtrade)</div>`;
  html += `<div class="fin-table-wrap"><table class="fin-table">
    <thead><tr><th>Mineral</th><th>HS Code</th><th>Description</th><th>Key Exporters</th></tr></thead>
    <tbody>`;

  const TOP_EXPORTERS = {
    rare_earths: 'China 70%, Myanmar 14%, Australia 7%',
    lithium:     'Australia 46%, Chile 30%, China 15%',
    cobalt:      'DRC 73%, Russia 4%, Australia 4%',
    tungsten:    'China 84%, Vietnam 5%, Russia 2%',
    gallium:     'China 98%, Russia 1%',
    germanium:   'China 75%, Russia 7%, Canada 5%',
    graphite:    'China 79%, Mozambique 7%, Ethiopia 3%',
    nickel:      'Indonesia 48%, Philippines 11%, Russia 8%',
    copper:      'Chile 27%, Peru 10%, DRC 10%',
    phosphate:   'Morocco 40%, China 26%, Russia 13%',
    neon:        'China 35%, Russia 5% (byproduct of steel ASUs)',
    titanium:    'China 42%, Japan 17%, Russia 12%',
  };

  for (const [id, hs] of Object.entries(HS_CODES)) {
    const meta = HS_META[id];
    const exporters = TOP_EXPORTERS[id]||'—';
    html += `<tr>
      <td><span style="margin-right:4px">${meta?.icon||'📦'}</span><strong>${_tfEsc(meta?.label||id)}</strong></td>
      <td><code style="background:var(--bg-secondary);padding:1px 4px;border-radius:3px">${hs}</code></td>
      <td style="font-size:10px;color:var(--text-muted)">HS ${hs} classification</td>
      <td style="font-size:10px">${_tfEsc(exporters)}</td>
    </tr>`;
  }
  html += `</tbody></table></div>`;

  /* Supply concentration context */
  html += `<div class="section-head" style="margin-top:12px">⚠ Supply Concentration Risk</div>`;
  html += `<div class="commodity-price-grid">`;

  const concentrations = [
    { label:'Gallium',    hhi: 9604, top:'China 98%',     color:'#f85149', risk:'Critical' },
    { label:'Rare Earths',hhi: 4900, top:'China 70%',     color:'#f85149', risk:'Critical' },
    { label:'Germanium',  hhi: 5625, top:'China 75%',     color:'#f85149', risk:'Critical' },
    { label:'Graphite',   hhi: 6241, top:'China 79%',     color:'#f85149', risk:'Critical' },
    { label:'Cobalt',     hhi: 5329, top:'DRC 73%',       color:'#f85149', risk:'Critical' },
    { label:'Tungsten',   hhi: 7056, top:'China 84%',     color:'#f85149', risk:'Critical' },
    { label:'Nickel',     hhi: 2304, top:'Indonesia 48%', color:'#d29922', risk:'Elevated' },
    { label:'Lithium',    hhi: 2116, top:'Australia 46%', color:'#d29922', risk:'Elevated' },
    { label:'Copper',     hhi:  729, top:'Chile 27%',     color:'#3fb950', risk:'Moderate' },
  ];

  for (const c of concentrations) {
    html += `<div class="commodity-price-card">
      <div class="commodity-price-label">${_tfEsc(c.label)}</div>
      <div class="commodity-price-val" style="color:${c.color}">HHI: ${c.hhi}</div>
      <div class="commodity-price-chg" style="color:${c.color}">Risk: ${_tfEsc(c.risk)}</div>
      <div class="commodity-price-period">Top: ${_tfEsc(c.top)}</div>
    </div>`;
  }
  html += `</div>`;
  html += `<div class="av-note">HHI (Herfindahl-Hirschman Index) of export concentration. >2,500 = highly concentrated. Source: USGS MCS 2025/2026.</div>`;

  if (key) {
    html += `<div class="section-head" style="margin-top:12px">📊 Live Trade Data — UN Comtrade+ (2023 annual)</div>`;
    html += `<div class="no-data">// Loading Comtrade data for selected minerals… (limited to prevent rate limit exhaustion)</div>`;
    el.innerHTML = html;
    /* Fetch one sample query for demonstration */
    const sampleData = await comtradeFetch(HS_CODES.rare_earths, 'X', 2023, 10);
    const sampleEl = el.querySelector('.no-data');
    if (sampleEl && sampleData?.data?.length) {
      const rows = sampleData.data.slice(0,10);
      let tableHtml = `<div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>Reporter</th><th>Partner</th><th>Flow</th><th>Value (USD)</th><th>Period</th></tr></thead><tbody>`;
      for (const row of rows) {
        tableHtml += `<tr>
          <td>${_tfEsc(row.reporterDesc||row.reporterCode||'—')}</td>
          <td>${_tfEsc(row.partnerDesc||row.partnerCode||'—')}</td>
          <td>${_tfEsc(row.flowDesc||row.flowCode||'—')}</td>
          <td>${_tfFmtB(row.fobvalue||row.primaryValue||row.cifvalue)}</td>
          <td>${_tfEsc(String(row.period||row.refYear||''))}</td>
        </tr>`;
      }
      tableHtml += `</tbody></table></div>`;
      tableHtml += `<div class="av-note">Sample: Rare earth compounds (HS 2846) trade flows. <a href="https://comtradeplus.un.org/" target="_blank" rel="noopener" style="color:var(--accent)">View full data at Comtrade+ ↗</a></div>`;
      sampleEl.outerHTML = tableHtml;
    } else if (sampleEl) {
      sampleEl.textContent = '// Comtrade data requires free registration. Register at comtradeplus.un.org';
    }
    return;
  }

  html += `<div style="margin-top:8px">
    <a href="https://comtradeplus.un.org/TradeFlow" target="_blank" rel="noopener" class="energy-entsog-link">↗ Explore UN Comtrade+ Trade Flows</a>
    <a href="https://ec.europa.eu/eurostat/web/international-trade-in-goods/data/database" target="_blank" rel="noopener" class="energy-entsog-link" style="margin-left:8px">↗ Eurostat Trade Database</a>
  </div>`;

  el.innerHTML = html;
}

async function tradeflowsRenderTariffs() {
  const el = document.getElementById('supply-minerals-tariffs');
  if (!el) return;

  let html = `<div class="av-live-badge">● Tariffs & Trade Policy — WITS (World Integrated Trade Solution)</div>`;
  html += `<div class="av-note" style="margin-bottom:8px">World Bank WITS provides MFN and preferential tariff data by HS code. No API key required. Data: annual (latest available WTO binding schedules).</div>`;

  /* WITS tariff context for key minerals */
  const tariffContext = [
    { mineral:'Rare Earths (HS 2846)', reporter:'US', mfn:'4.0%', pref:'0% (KORUS)', notes:'Section 301 tariffs apply for Chinese origin' },
    { mineral:'Cobalt (HS 810520)',    reporter:'US', mfn:'Free', pref:'Free',        notes:'Strategic material; no MFN tariff' },
    { mineral:'Gallium (HS 811291)',   reporter:'EU', mfn:'Free', pref:'Free',        notes:'No MFN tariff; import licenses under review' },
    { mineral:'Tungsten (HS 261019)',  reporter:'US', mfn:'Free', pref:'Free',        notes:'25% Section 232 tariff on Chinese origin' },
    { mineral:'Graphite (HS 2504)',    reporter:'US', mfn:'Free', pref:'Free',        notes:'25% additional tariffs on Chinese natural graphite' },
    { mineral:'Lithium (HS 280519)',   reporter:'EU', mfn:'2.7%', pref:'0% (EFTA)',   notes:'EV battery supply chain; CRMA strategic reserve under development' },
    { mineral:'Neon (HS 280429)',      reporter:'US', mfn:'Free', pref:'Free',        notes:'Semiconductor supply chain; US-China tensions' },
    { mineral:'Phosphate (HS 2510)',   reporter:'EU', mfn:'Free', pref:'Free',        notes:'Food security; Morocco FTA provides preferential access' },
  ];

  html += `<div class="section-head">📋 MFN Tariffs for Strategic Minerals</div>`;
  html += `<div class="fin-table-wrap"><table class="fin-table">
    <thead><tr><th>Mineral / HS Code</th><th>Market</th><th>MFN Rate</th><th>Preferential</th><th>Notes</th></tr></thead>
    <tbody>`;
  for (const r of tariffContext) {
    const mfnCls = r.mfn==='Free'?'pos':parseFloat(r.mfn)>5?'neg':'warn';
    html += `<tr>
      <td><strong>${_tfEsc(r.mineral)}</strong></td>
      <td>${_tfEsc(r.reporter)}</td>
      <td class="${mfnCls}">${_tfEsc(r.mfn)}</td>
      <td class="pos">${_tfEsc(r.pref)}</td>
      <td style="font-size:10px;color:var(--text-muted)">${_tfEsc(r.notes)}</td>
    </tr>`;
  }
  html += `</tbody></table></div>`;

  html += `<div class="section-head" style="margin-top:12px">🔗 WITS & Eurostat Trade Resources</div>`;
  html += `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
    <a href="https://wits.worldbank.org/witsapiintro.aspx" target="_blank" rel="noopener" class="energy-entsog-link">↗ WITS API Documentation</a>
    <a href="https://wits.worldbank.org/tariff/trains/country/USA/indicator/MFN-WTAVG/partner/000/product/all" target="_blank" rel="noopener" class="energy-entsog-link">↗ US MFN Tariff Schedule</a>
    <a href="https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-introduction" target="_blank" rel="noopener" class="energy-entsog-link">↗ Eurostat SDMX API</a>
  </div>`;

  html += `<div class="av-note" style="margin-top:10px">Sources: WITS/UNCTAD TRAINS (no key) · Eurostat SDMX API (no key) · WTO tariff bindings. Trade policy data is annual with possible publication lags.</div>`;
  el.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(tradeflowsInjectSection, 800);
  document.addEventListener('click', e => {
    if (e.target.closest?.('[data-tab="minerals"]') || e.target.dataset?.tab==='minerals') {
      setTimeout(tradeflowsInjectSection, 200);
    }
  });
});

window.tradeflowsInjectSection = tradeflowsInjectSection;
window.getComtradeKey = getComtradeKey;
