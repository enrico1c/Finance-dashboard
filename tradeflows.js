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

  /* HS codes reference — configuration metadata, not financial data */
  html += `<div class="section-head">🏷 Critical Minerals HS Codes (UN Comtrade)</div>`;
  html += `<div class="fin-table-wrap"><table class="fin-table">
    <thead><tr><th>Mineral</th><th>HS Code</th><th>Top Exporters (live)</th><th>HHI Concentration</th></tr></thead>
    <tbody id="tf-hs-rows">`;
  for (const [id, hs] of Object.entries(HS_CODES)) {
    const meta = HS_META[id];
    html += `<tr id="tf-row-${id}">
      <td><span style="margin-right:4px">${meta?.icon||'📦'}</span><strong>${_tfEsc(meta?.label||id)}</strong></td>
      <td><code style="background:var(--bg-secondary);padding:1px 4px;border-radius:3px">${hs}</code></td>
      <td id="tf-exp-${id}" style="font-size:10px;color:var(--text-muted)">…loading</td>
      <td id="tf-hhi-${id}" style="font-size:10px;color:var(--text-muted)">…</td>
    </tr>`;
  }
  html += `</tbody></table></div>`;

  if (!key) {
    html += `<div class="av-note" style="margin-top:8px">
      ⚠ Add a free UN Comtrade API key to load live top-exporter data and HHI scores.
      <a href="https://comtradeplus.un.org/" target="_blank" rel="noopener" style="color:var(--accent)">Register at comtradeplus.un.org ↗</a>
      — then add via ⚙ API Settings → Comtrade.
    </div>`;
    /* Mark all cells as no-key */
    html = html.replace(/…loading/g, '— (no key)').replace(/…/g, '—');
  }

  html += `<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
    <a href="https://comtradeplus.un.org/TradeFlow" target="_blank" rel="noopener" class="energy-entsog-link">↗ UN Comtrade+ Trade Flows</a>
    <a href="https://ec.europa.eu/eurostat/web/international-trade-in-goods/data/database" target="_blank" rel="noopener" class="energy-entsog-link">↗ Eurostat Trade Database</a>
  </div>`;

  el.innerHTML = html;

  /* Live Comtrade fetch — populate top exporters + HHI per mineral */
  if (key) {
    const minerals = Object.keys(HS_CODES);
    /* Fetch sequentially to respect rate limits (500 calls/day) */
    for (const id of minerals) {
      const hs = HS_CODES[id];
      const expCell = el.querySelector(`#tf-exp-${id}`);
      const hhiCell = el.querySelector(`#tf-hhi-${id}`);
      if (!expCell) continue;
      try {
        const data = await comtradeFetch(hs, 'X', 2023, 15);
        const rows = data?.data || [];
        if (!rows.length) {
          expCell.textContent = '— (no data)';
          if (hhiCell) hhiCell.textContent = '—';
          continue;
        }
        /* Aggregate export value by reporter */
        const byReporter = {};
        let total = 0;
        for (const r of rows) {
          const name = r.reporterDesc || r.reporterCode || 'Unknown';
          const val  = r.fobvalue || r.primaryValue || r.cifvalue || 0;
          byReporter[name] = (byReporter[name] || 0) + val;
          total += val;
        }
        /* Sort by value descending */
        const sorted = Object.entries(byReporter).sort((a,b) => b[1]-a[1]);
        const topStr = sorted.slice(0,3)
          .map(([name, val]) => `${name} ${total ? (val/total*100).toFixed(0)+'%' : ''}`)
          .join(', ');
        expCell.textContent = topStr || '—';
        expCell.style.color = '';
        /* HHI */
        const shares = sorted.map(([,v]) => v);
        const hhi = _tfHHI(shares);
        if (hhiCell && hhi) {
          const risk = hhi >= 2500 ? 'Critical' : hhi >= 1500 ? 'Elevated' : 'Moderate';
          const col  = hhi >= 2500 ? '#f85149'  : hhi >= 1500 ? '#d29922'  : '#3fb950';
          hhiCell.innerHTML = `<span style="color:${col}">${hhi} — ${risk}</span>`;
        }
      } catch(e) {
        if (expCell) expCell.textContent = '— (error)';
      }
    }
  }
}

async function tradeflowsRenderTariffs() {
  const el = document.getElementById('supply-minerals-tariffs');
  if (!el) return;

  let html = `<div class="av-live-badge">● Tariffs & Trade Policy — WITS (World Integrated Trade Solution)</div>`;
  html += `<div class="av-note" style="margin-bottom:8px">World Bank WITS provides MFN and preferential tariff data by HS code. No API key required. Data: annual (latest available WTO binding schedules).</div>`;

  /* Live WITS MFN tariff data for strategic minerals — US (842) and EU (918) reporters */
  html += `<div class="section-head">📋 MFN Tariffs for Strategic Minerals — WITS Live</div>`;
  html += `<div class="av-note" style="margin-bottom:6px">MFN (Most-Favoured-Nation) tariffs from World Bank WITS. Data: latest available WTO binding schedules. US reporter code: 842, EU: 918.</div>`;

  /* HS6 codes to query — using 6-digit WITS codes */
  const WITS_MINERALS = [
    { label:'Rare Earth Compounds (HS 284610)', hs:'284610', reporter:'842', flag:'🇺🇸' },
    { label:'Rare Earth Compounds (HS 284610)', hs:'284610', reporter:'918', flag:'🇪🇺' },
    { label:'Lithium (HS 280519)',              hs:'280519', reporter:'842', flag:'🇺🇸' },
    { label:'Lithium (HS 280519)',              hs:'280519', reporter:'918', flag:'🇪🇺' },
    { label:'Cobalt Unwrought (HS 810520)',     hs:'810520', reporter:'842', flag:'🇺🇸' },
    { label:'Gallium (HS 811291)',              hs:'811291', reporter:'918', flag:'🇪🇺' },
    { label:'Natural Graphite (HS 250400)',     hs:'250400', reporter:'842', flag:'🇺🇸' },
    { label:'Nickel Unwrought (HS 750210)',     hs:'750210', reporter:'842', flag:'🇺🇸' },
    { label:'Copper Unwrought (HS 740311)',     hs:'740311', reporter:'842', flag:'🇺🇸' },
    { label:'Phosphate Rock (HS 251010)',       hs:'251010', reporter:'918', flag:'🇪🇺' },
  ];

  html += `<div class="fin-table-wrap"><table class="fin-table">
    <thead><tr><th>Mineral / HS Code</th><th>Market</th><th>MFN Avg Rate</th><th>Source</th></tr></thead>
    <tbody id="tf-tariff-rows">`;
  for (const m of WITS_MINERALS) {
    html += `<tr>
      <td><strong>${_tfEsc(m.label)}</strong></td>
      <td>${m.flag}</td>
      <td id="tf-tariff-${m.hs}-${m.reporter}" style="color:var(--text-muted)">Loading…</td>
      <td style="font-size:9px;color:var(--text-muted)">WITS MFN-WTAVG</td>
    </tr>`;
  }
  html += `</tbody></table></div>`;
  el.innerHTML = html + `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
    <a href="https://wits.worldbank.org/witsapiintro.aspx" target="_blank" rel="noopener" class="energy-entsog-link">↗ WITS API Documentation</a>
    <a href="https://wits.worldbank.org/tariff/trains/country/USA/indicator/MFN-WTAVG/partner/000/product/all" target="_blank" rel="noopener" class="energy-entsog-link">↗ US MFN Schedule</a>
  </div>`;

  /* Fetch live WITS tariff rates */
  for (const m of WITS_MINERALS) {
    const cell = el.querySelector(`#tf-tariff-${m.hs}-${m.reporter}`);
    if (!cell) continue;
    try {
      const data = await witsGetTariff(m.hs, m.reporter, 2022);
      /* WITS SDMX response: extract value from dataSets */
      const obs = data?.dataSets?.[0]?.observations;
      let rate = null;
      if (obs) {
        const lastKey = Object.keys(obs).sort().pop();
        rate = obs[lastKey]?.[0];
      }
      if (rate != null) {
        const cls  = rate === 0 ? 'pos' : rate > 5 ? 'neg' : 'warn';
        cell.innerHTML = `<span class="${cls}">${rate === 0 ? 'Free (0%)' : rate.toFixed(2) + '%'}</span>`;
      } else {
        cell.textContent = '— (no data)';
      }
    } catch {
      cell.textContent = '—';
    }
  }
  return; /* early return — HTML already set above */

  /* (fallback links block kept below — unreachable after live fetch path) */

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
