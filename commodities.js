/* ══════════════════════════════════════════════════════════════════
   FINTERM — commodities.js  (Phase 1b)
   World Bank Pink Sheet + IMF PCPS integration
   Sources: World Bank XLSX (no key) · IMF PCPS portal (no key)
   Panel: Macro·Intel → 📦 COMMODITIES tab  (macro-commodities)
   ══════════════════════════════════════════════════════════════════ */

const _CM = {};
function _cmGet(k,ms) { const e=_CM[k]; return (e&&Date.now()-e.ts<ms)?e.d:null; }
function _cmSet(k,d)  { _CM[k]={d,ts:Date.now()}; }
const _cmEsc = s => String(s??'').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
const _cmFmt = (n,d=2) => n==null||isNaN(n)?'—':Number(n).toFixed(d);

/* ══════════════════════════════════════════════════════════════════
   WORLD BANK PINK SHEET
   Monthly commodity prices — direct XLSX download (no key)
   Proxy via allorigins for CORS bypass
   ══════════════════════════════════════════════════════════════════ */
const WB_PINK_SHEET_URL = 'https://thedocs.worldbank.org/en/doc/5d903e848db1d1b83e0ec8f744e55570-0350012021/related/CMO-Historical-Data-Monthly.xlsx';
const WB_COMMODITY_GROUPS = [
  { id:'energy',       label:'⚡ Energy',       color:'#f0883e', items:['Crude oil, Brent','Natural gas, US','Coal, Australian'] },
  { id:'metals',       label:'⚒ Metals',        color:'#58a6ff', items:['Copper','Gold','Silver','Aluminum','Iron ore'] },
  { id:'agriculture',  label:'🌾 Agriculture',   color:'#3fb950', items:['Wheat, US HRW','Maize','Soybean oil','Palm oil','Coffee, Arabica'] },
  { id:'fertilizers',  label:'🧪 Fertilizers',   color:'#d29922', items:['Phosphate rock','DAP','Urea'] },
];

/* Fetch World Bank PCPS commodity data via their DataBank JSON API (free, no key) */
async function wbGetCommodityData() {
  const cached = _cmGet('wb_commodities', 6*60*60*1000);
  if (cached) return cached;
  try {
    /* World Bank DataBank API — commodity price data */
    const url = 'https://api.worldbank.org/v2/en/indicator/PCOMM.ENERGY.IDX?format=json&per_page=5&mrv=12';
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`WB HTTP ${res.status}`);
    const json = await res.json();
    _cmSet('wb_commodities', json);
    return json;
  } catch(e) { console.warn('[commodities] WB:', e.message); return null; }
}

/* Fetch IMF PCPS data (no key, DataMapper API) */
async function imfGetPCPS() {
  const cached = _cmGet('imf_pcps', 6*60*60*1000);
  if (cached) return cached;
  try {
    /* IMF Primary Commodity Price System via DataMapper */
    const url = 'https://www.imf.org/external/datamapper/api/v1/data/PALLFNF/';
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`IMF HTTP ${res.status}`);
    const json = await res.json();
    _cmSet('imf_pcps', json);
    return json;
  } catch(e) { console.warn('[commodities] IMF PCPS:', e.message); return null; }
}

/* Fetch IMF commodity price table (alternative endpoint) */
async function imfGetPriceTable() {
  const cached = _cmGet('imf_price_table', 6*60*60*1000);
  if (cached) return cached;
  try {
    /* Multiple IMF commodity indicators */
    const indicators = ['POILAPSP','PNGASUS','PCOALAU','PCOPP','PGOLD','PSILVER','PALUM','PWHEAT','PMAIZMT','PSOYB','PCOFFOTM'];
    const results = {};
    await Promise.all(indicators.map(async ind => {
      try {
        const url = `https://www.imf.org/external/datamapper/api/v1/data/${ind}/?periods=12`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return;
        const json = await res.json();
        /* Extract latest value from IMF DataMapper response */
        const data = json?.values?.[ind]?.W00;
        if (data) {
          const years = Object.keys(data).sort().reverse();
          results[ind] = { value: data[years[0]], period: years[0], series: years.slice(0,12).reverse().map(y=>({year:y, value:data[y]})) };
        }
      } catch {}
    }));
    _cmSet('imf_price_table', results);
    return results;
  } catch(e) { console.warn('[commodities] IMF price table:', e.message); return null; }
}

/* Commodity metadata: IMF indicator → display info */
const IMF_COMMODITY_META = {
  POILAPSP: { label:'Crude Oil (avg)',       unit:'$/bbl',   group:'energy',      icon:'🛢' },
  PNGASUS:  { label:'Natural Gas (US)',       unit:'$/MMBtu', group:'energy',      icon:'🔥' },
  PCOALAU:  { label:'Coal (Australia)',       unit:'$/mt',    group:'energy',      icon:'⚫' },
  PCOPP:    { label:'Copper',                 unit:'$/mt',    group:'metals',      icon:'🔶' },
  PGOLD:    { label:'Gold',                   unit:'$/troy oz',group:'metals',     icon:'🥇' },
  PSILVER:  { label:'Silver',                 unit:'¢/troy oz',group:'metals',     icon:'🥈' },
  PALUM:    { label:'Aluminum',               unit:'$/mt',    group:'metals',      icon:'⚙' },
  PWHEAT:   { label:'Wheat (US HRW)',          unit:'$/mt',    group:'agriculture', icon:'🌾' },
  PMAIZMT:  { label:'Maize (corn)',            unit:'$/mt',    group:'agriculture', icon:'🌽' },
  PSOYB:    { label:'Soybeans',               unit:'$/mt',    group:'agriculture', icon:'🫘' },
  PCOFFOTM: { label:'Coffee (Arabica)',        unit:'¢/kg',    group:'agriculture', icon:'☕' },
};

const GROUP_META = {
  energy:      { label:'⚡ Energy',      color:'#f0883e' },
  metals:      { label:'⚒ Metals',       color:'#58a6ff' },
  agriculture: { label:'🌾 Agriculture',  color:'#3fb950' },
  fertilizers: { label:'🧪 Fertilizers',  color:'#d29922' },
};

/* ── Sparkline helper ───────────────────────────────────────────── */
function _cmSparkline(series, color='#58a6ff') {
  if (!series||series.length<2) return '';
  const vals = series.map(d=>parseFloat(d.value)).filter(v=>!isNaN(v));
  if (vals.length<2) return '';
  const mn=Math.min(...vals), mx=Math.max(...vals), range=mx-mn||1;
  const W=80, H=24;
  const pts = vals.map((v,i)=>`${(i/(vals.length-1)*W).toFixed(1)},${(H-((v-mn)/range)*H).toFixed(1)}`).join(' ');
  return `<svg width="${W}" height="${H}" style="display:block"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}

/* ══════════════════════════════════════════════════════════════════
   RENDER
   ══════════════════════════════════════════════════════════════════ */
async function commoditiesLoadAll() {
  const el = document.getElementById('macro-commodities');
  if (!el) return;
  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading commodity benchmarks from World Bank & IMF…</div>`;

  const [, imfPrices] = await Promise.all([wbGetCommodityData(), imfGetPriceTable()]);

  let html = `<div class="av-live-badge">● Commodity Benchmarks · World Bank Pink Sheet · IMF PCPS · Monthly data</div>`;
  html += `<div class="av-note" style="margin-bottom:8px">Sources: IMF Primary Commodity Price System (68 commodities) · World Bank Pink Sheet (monthly benchmarks) · No API key required.</div>`;

  /* Group commodities */
  const grouped = { energy:[], metals:[], agriculture:[], fertilizers:[] };
  if (imfPrices) {
    for (const [ind, meta] of Object.entries(IMF_COMMODITY_META)) {
      const data = imfPrices[ind];
      if (data && grouped[meta.group]) grouped[meta.group].push({ ...meta, ind, ...data });
    }
  }

  /* Render each group */
  for (const [groupId, items] of Object.entries(grouped)) {
    const gm = GROUP_META[groupId];
    html += `<div class="section-head" style="margin-top:12px;border-left:3px solid ${gm.color};padding-left:8px">${gm.label}</div>`;
    if (!items.length) {
      html += `<div class="no-data" style="font-size:11px">// ${gm.label} data loading — IMF PCPS monthly updates on first week of each month.</div>`;
      continue;
    }
    html += `<div class="commodity-price-grid">`;
    for (const item of items) {
      const latest = parseFloat(item.value);
      const series = item.series || [];
      const prev   = series.length>1 ? parseFloat(series[series.length-2]?.value) : null;
      const chg    = !isNaN(latest)&&prev ? latest-prev : null;
      const pct    = chg&&prev ? (chg/Math.abs(prev)*100) : null;
      const cls    = chg>0?'pos':chg<0?'neg':'';
      html += `<div class="commodity-price-card">
        <div class="commodity-price-icon">${item.icon||'📊'}</div>
        <div class="commodity-price-body">
          <div class="commodity-price-label">${_cmEsc(item.label)}</div>
          <div class="commodity-price-val">${!isNaN(latest)?_cmFmt(latest):'-'} <span class="commodity-price-unit">${_cmEsc(item.unit||'')}</span></div>
          <div class="commodity-price-chg ${cls}">${chg!=null?(chg>0?'▲ +':'▼ ')+Math.abs(chg).toFixed(2)+(pct!=null?' ('+Math.abs(pct).toFixed(1)+'%)':''):'—'}</div>
          <div class="commodity-price-period">${_cmEsc(item.period||'')}</div>
        </div>
        <div class="commodity-price-spark">${_cmSparkline(series, chg>=0?gm.color:'#f85149')}</div>
      </div>`;
    }
    html += `</div>`;
  }

  /* World Bank Pink Sheet reference */
  html += `<div class="section-head" style="margin-top:14px">📋 World Bank Pink Sheet — Monthly Downloads</div>`;
  html += `<div class="commodity-wb-panel">
    <div class="metric-row"><span class="metric-label">Coverage</span><span class="metric-value">Energy · Metals · Agriculture · Fertilizers · Precious Metals · Timber (monthly benchmark prices)</span></div>
    <div class="metric-row"><span class="metric-label">History</span><span class="metric-value">Decades of historical data — monthly and annual series</span></div>
    <div class="metric-row"><span class="metric-label">Format</span><span class="metric-value">XLSX downloadable · CC BY 4.0 with attribution</span></div>
    <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
      <a href="https://www.worldbank.org/en/research/commodity-markets" target="_blank" rel="noopener" class="energy-entsog-link">↗ World Bank Commodity Markets</a>
      <a href="https://thedocs.worldbank.org/en/doc/5d903e848db1d1b83e0ec8f744e55570-0350012021/related/CMO-Historical-Data-Monthly.xlsx" target="_blank" rel="noopener" class="energy-entsog-link">↗ Download Monthly XLSX</a>
      <a href="https://www.imf.org/en/research/commodity-prices" target="_blank" rel="noopener" class="energy-entsog-link">↗ IMF Primary Commodity Prices</a>
    </div>
  </div>`;

  html += `<div class="av-note" style="margin-top:12px">
    Data: <a href="https://www.imf.org/en/research/commodity-prices" target="_blank" rel="noopener" style="color:var(--accent)">IMF PCPS</a> (monthly, first week) ·
    <a href="https://www.worldbank.org/en/research/commodity-markets" target="_blank" rel="noopener" style="color:var(--accent)">World Bank Pink Sheet</a> (monthly) ·
    Not real-time exchange data · Monthly benchmark averages
  </div>`;

  el.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', e => {
    if (e.target.dataset?.tab === 'commodities') {
      const el = document.getElementById('macro-commodities');
      if (el && !el.dataset.cmLoaded) { el.dataset.cmLoaded='1'; commoditiesLoadAll(); }
    }
  });
});

window.commoditiesLoadAll = commoditiesLoadAll;
