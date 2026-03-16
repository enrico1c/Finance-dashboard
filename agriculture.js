/* ══════════════════════════════════════════════════════════════════
   FINTERM — agriculture.js  (Phase 3a)
   Agricultural & Food Commodity Data
   Sources: EU Agri-food API (no key) · FAOSTAT bulk (no key)
   Panel: Macro·Intel → 🌾 AGRI tab  (macro-agri)
   ══════════════════════════════════════════════════════════════════ */

const _AG = {};
function _agGet(k,ms) { const e=_AG[k]; return (e&&Date.now()-e.ts<ms)?e.d:null; }
function _agSet(k,d)  { _AG[k]={d,ts:Date.now()}; }
const _agEsc = s => String(s??'').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
const _agFmt = (n,d=2) => n==null||isNaN(n)?'—':Number(n).toFixed(d);

/* ══════════════════════════════════════════════════════════════════
   EU AGRI-FOOD DATA PORTAL API  (no key, public JSON)
   https://agridata.ec.europa.eu/extensions/DataPortal/API_Documentation.html
   ══════════════════════════════════════════════════════════════════ */
const EU_AGRI_BASE = 'https://agridata.ec.europa.eu/api';

async function euAgriFetch(endpoint, params={}, cacheKey, ttlMs=4*60*60*1000) {
  const cached = _agGet(cacheKey, ttlMs);
  if (cached) return cached;
  try {
    const url = new URL(`${EU_AGRI_BASE}${endpoint}`);
    Object.entries(params).forEach(([k,v]) => url.searchParams.set(k,v));
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`EU Agri HTTP ${res.status}`);
    const data = await res.json();
    _agSet(cacheKey, data);
    return data;
  } catch(e) { console.warn('[agriculture] EU Agri:', cacheKey, e.message); return null; }
}

/* Oilseeds prices — weekly, crude sunflower oil, palm oil, etc. */
async function euAgriGetOilseeds() {
  return euAgriFetch('/v1/oilseeds', { limit:50, offset:0 }, 'eu_oilseeds', 4*60*60*1000);
}

/* Fertilizer prices — monthly N/P/K aggregates */
async function euAgriGetFertilizers() {
  return euAgriFetch('/v1/fertiliser', { limit:30, offset:0 }, 'eu_fertilizers', 6*60*60*1000);
}

/* Cereals market data */
async function euAgriGetCereals() {
  return euAgriFetch('/v1/cereals', { limit:30 }, 'eu_cereals', 4*60*60*1000);
}

/* Agricultural trade flows (EU Comext — note: 2-month typical lag) */
async function euAgriGetTradeOverview() {
  return euAgriFetch('/v1/trade', { limit:20 }, 'eu_agri_trade', 24*60*60*1000);
}

/* ══════════════════════════════════════════════════════════════════
   IMF SUNFLOWER OIL PRICE (PCPS — PSUNOUSDM series)
   ══════════════════════════════════════════════════════════════════ */
async function imfGetSunflowerOil() {
  const cached = _agGet('imf_sunflower', 6*60*60*1000);
  if (cached) return cached;
  try {
    const url = 'https://www.imf.org/external/datamapper/api/v1/data/PSUNO/W00/?periods=12';
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`IMF HTTP ${res.status}`);
    const json = await res.json();
    const data = json?.values?.PSUNO?.W00 || {};
    const series = Object.entries(data).sort().map(([p,v])=>({period:p, value:parseFloat(v)}));
    _agSet('imf_sunflower', series);
    return series;
  } catch(e) { console.warn('[agriculture] IMF sunflower:', e.message); return null; }
}

/* IMF Food Price Index components (PMAIZMT, PWHEAT, PSOYB) */
async function imfGetFoodPrices() {
  const cached = _agGet('imf_food_prices', 6*60*60*1000);
  if (cached) return cached;
  try {
    const indicators = ['PMAIZMT','PWHEAT','PSOYB','PRICENPQ','PCOFFOTM','PCOCOA','PSUGARUSA'];
    const results = {};
    await Promise.all(indicators.map(async ind => {
      try {
        const url = `https://www.imf.org/external/datamapper/api/v1/data/${ind}/W00/?periods=6`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return;
        const json = await res.json();
        const data = json?.values?.[ind]?.W00 || {};
        const sorted = Object.entries(data).sort().reverse();
        if (sorted.length) results[ind] = { value: parseFloat(sorted[0][1]), period: sorted[0][0], prev: sorted[1] ? parseFloat(sorted[1][1]) : null };
      } catch {}
    }));
    _agSet('imf_food_prices', results);
    return results;
  } catch(e) { console.warn('[agriculture] IMF food:', e.message); return null; }
}

/* Food price metadata */
const FOOD_PRICE_META = {
  PMAIZMT:   { label:'Maize (Corn)',       unit:'$/mt',   icon:'🌽' },
  PWHEAT:    { label:'Wheat (US HRW)',     unit:'$/mt',   icon:'🌾' },
  PSOYB:     { label:'Soybeans',           unit:'$/mt',   icon:'🫘' },
  PRICENPQ:  { label:'Rice (Thailand)',    unit:'$/mt',   icon:'🍚' },
  PCOFFOTM:  { label:'Coffee (Arabica)',   unit:'¢/kg',   icon:'☕' },
  PCOCOA:    { label:'Cocoa',             unit:'$/mt',   icon:'🍫' },
  PSUGARUSA: { label:'Sugar (US)',         unit:'¢/lb',   icon:'🍬' },
};

/* ══════════════════════════════════════════════════════════════════
   FAOSTAT DATASET INDEX (no key, bulk downloads)
   ══════════════════════════════════════════════════════════════════ */
async function faostatGetDatasetIndex() {
  const cached = _agGet('faostat_index', 24*60*60*1000);
  if (cached) return cached;
  try {
    const url = 'https://fenixservices.fao.org/faostat/static/bulkdownloads/datasets_E.json';
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`FAOSTAT HTTP ${res.status}`);
    const json = await res.json();
    _agSet('faostat_index', json);
    return json;
  } catch(e) { console.warn('[agriculture] FAOSTAT index:', e.message); return null; }
}

/* ── Sparkline ──────────────────────────────────────────────────── */
function _agSparkline(series, color='#3fb950') {
  if (!series||series.length<2) return '';
  const vals = series.map(d=>typeof d==='number'?d:parseFloat(d.value||d.v||0)).filter(v=>!isNaN(v));
  if (vals.length<2) return '';
  const mn=Math.min(...vals), mx=Math.max(...vals), range=mx-mn||1;
  const W=80, H=24;
  const pts = vals.map((v,i)=>`${(i/(vals.length-1)*W).toFixed(1)},${(H-((v-mn)/range)*H).toFixed(1)}`).join(' ');
  return `<svg width="${W}" height="${H}" style="display:block"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}

/* ══════════════════════════════════════════════════════════════════
   RENDER
   ══════════════════════════════════════════════════════════════════ */
async function agricultureLoadAll() {
  const el = document.getElementById('macro-agri');
  if (!el) return;
  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading agricultural data from EU Agri-food API & IMF PCPS…</div>`;

  const [oilseeds, fertilizers, sunflower, foodPrices, faoIndex] = await Promise.all([
    euAgriGetOilseeds(), euAgriGetFertilizers(), imfGetSunflowerOil(), imfGetFoodPrices(), faostatGetDatasetIndex(),
  ]);

  let html = `<div class="av-live-badge">● Agricultural Intelligence · EU Agri-food API · IMF PCPS · FAOSTAT</div>`;
  html += `<div class="av-note" style="margin-bottom:8px">EU Agri-food Data Portal: weekly oilseed/fertilizer prices for EU markets. IMF PCPS: monthly global commodity benchmarks. FAOSTAT: annual production/trade. No API key required for any source.</div>`;

  /* ── Global Food Prices (IMF PCPS) ──────────────────────────────── */
  html += `<div class="section-head">🌍 Global Food & Agriculture Prices — IMF Primary Commodity Prices</div>`;
  if (foodPrices && Object.keys(foodPrices).length) {
    html += `<div class="commodity-price-grid">`;
    for (const [ind, meta] of Object.entries(FOOD_PRICE_META)) {
      const d = foodPrices[ind];
      if (!d) continue;
      const chg = d.prev ? d.value - d.prev : null;
      const pct = chg && d.prev ? (chg/Math.abs(d.prev)*100) : null;
      const cls = chg>0?'pos':chg<0?'neg':'';
      html += `<div class="commodity-price-card">
        <div class="commodity-price-icon">${meta.icon}</div>
        <div class="commodity-price-body">
          <div class="commodity-price-label">${_agEsc(meta.label)}</div>
          <div class="commodity-price-val">${_agFmt(d.value)} <span class="commodity-price-unit">${_agEsc(meta.unit)}</span></div>
          <div class="commodity-price-chg ${cls}">${chg!=null?(chg>0?'▲ +':'▼ ')+Math.abs(chg).toFixed(2)+(pct!=null?' ('+Math.abs(pct).toFixed(1)+'%)':''):'—'}</div>
          <div class="commodity-price-period">${_agEsc(d.period||'')} · IMF monthly</div>
        </div>
      </div>`;
    }
    html += `</div>`;
  } else {
    html += `<div class="no-data">// IMF PCPS food price data loading — updates on first week of each month.</div>`;
  }

  /* ── Sunflower Oil (IMF) ─────────────────────────────────────────── */
  if (sunflower?.length) {
    const last = sunflower[sunflower.length-1];
    const prev = sunflower.length>1 ? sunflower[sunflower.length-2] : null;
    const chg  = prev ? last.value-prev.value : null;
    const pct  = chg&&prev ? (chg/Math.abs(prev.value)*100) : null;
    html += `<div class="section-head" style="margin-top:12px">🌻 Sunflower Oil Price — IMF PCPS (PSUNO)</div>`;
    html += `<div class="energy-kpi-grid">
      <div class="energy-kpi-card">
        <div class="energy-kpi-label">🌻 Sunflower Oil</div>
        <div class="energy-kpi-val">$${_agFmt(last.value)}/mt</div>
        <div class="energy-kpi-sub ${chg>0?'pos':chg<0?'neg':''}">${chg!=null?(chg>0?'▲ +':'▼ ')+Math.abs(chg).toFixed(2)+(pct!=null?' ('+Math.abs(pct).toFixed(1)+'%)':''):'—'}</div>
        <div class="energy-kpi-date">${_agEsc(last.period||'—')} · IMF monthly</div>
        ${_agSparkline(sunflower.slice(-12).map(d=>d.value), chg>=0?'#3fb950':'#f85149')}
      </div>
    </div>`;
  }

  /* ── EU Oilseeds (EU Agri-food API) ─────────────────────────────── */
  html += `<div class="section-head" style="margin-top:14px">🇪🇺 EU Oilseeds & Vegetable Oils — EU Agri-food Data Portal</div>`;
  if (oilseeds?.data?.length || oilseeds?.value?.length || Array.isArray(oilseeds)) {
    const items = oilseeds?.data || oilseeds?.value || (Array.isArray(oilseeds) ? oilseeds : []);
    if (items.length) {
      html += `<div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Product</th><th>Price</th><th>Unit</th><th>Period</th><th>Market</th></tr></thead><tbody>`;
      for (const item of items.slice(0,15)) {
        const price = item.price||item.value||item.Price||item.Value||item.annualValue;
        const product = item.product||item.Product||item.label||item.description||'—';
        const unit = item.unit||item.Unit||item.priceUnit||'€/t';
        const period = item.period||item.Period||item.refPeriod||item.date||'—';
        const market = item.market||item.Market||item.country||item.memberState||'EU';
        html += `<tr>
          <td>${_agEsc(product)}</td>
          <td>${price!=null?_agFmt(parseFloat(price)):'—'}</td>
          <td>${_agEsc(unit)}</td>
          <td>${_agEsc(String(period).slice(0,10))}</td>
          <td>${_agEsc(market)}</td>
        </tr>`;
      }
      html += `</tbody></table></div>`;
      html += `<div class="av-note">EU Agri-food Portal: weekly prices. Note: EU Comext-sourced trade data has a typical 2-month publication lag.</div>`;
    } else {
      html += `<div class="no-data">// EU oilseed data received but no items parsed. Check EU Agri-food API response format.</div>`;
    }
  } else {
    html += `<div class="no-data">// EU Agri-food API returned no data. The portal uses a JSON API at agridata.ec.europa.eu.</div>
    <div style="margin-top:6px"><a href="https://agridata.ec.europa.eu/extensions/DataPortal/oilseeds-protein-crops.html" target="_blank" rel="noopener" class="energy-entsog-link">↗ EU Oilseeds Dashboard</a></div>`;
  }

  /* ── EU Fertilizers ─────────────────────────────────────────────── */
  html += `<div class="section-head" style="margin-top:14px">🧪 EU Fertilizer Prices — EU Agri-food API</div>`;
  if (fertilizers?.data?.length || fertilizers?.value?.length || Array.isArray(fertilizers)) {
    const items = fertilizers?.data || fertilizers?.value || (Array.isArray(fertilizers) ? fertilizers : []);
    if (items.length) {
      html += `<div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Fertilizer</th><th>Price</th><th>Unit</th><th>Period</th></tr></thead><tbody>`;
      for (const item of items.slice(0,10)) {
        const name  = item.fertiliser||item.product||item.label||item.description||'—';
        const price = item.price||item.value||item.Value||item.annualValue;
        const unit  = item.unit||item.priceUnit||'€/100kg';
        const period = item.period||item.date||'—';
        html += `<tr><td>${_agEsc(name)}</td><td>${price!=null?_agFmt(parseFloat(price)):'—'}</td><td>${_agEsc(unit)}</td><td>${_agEsc(String(period).slice(0,10))}</td></tr>`;
      }
      html += `</tbody></table></div>`;
    } else {
      html += `<div class="no-data">// EU fertilizer data received. <a href="https://agridata.ec.europa.eu/extensions/API_Documentation/fertiliser.html" target="_blank" rel="noopener" style="color:var(--accent)">View API docs ↗</a></div>`;
    }
  } else {
    html += `<div class="no-data">// EU fertilizer API returned no data. <a href="https://agridata.ec.europa.eu/extensions/API_Documentation/fertiliser.html" target="_blank" rel="noopener" style="color:var(--accent)">EU Fertilizer API docs ↗</a></div>`;
  }

  /* ── FAOSTAT reference ──────────────────────────────────────────── */
  html += `<div class="section-head" style="margin-top:14px">🌿 FAOSTAT — Global Agriculture & Forestry Production/Trade</div>`;
  const faoDatasets = faoIndex ? Object.values(faoIndex).filter(d => d.DatasetCode && ['QCL','TM','FO','TCL'].includes(d.DatasetCode)).slice(0,6) : [];
  if (faoDatasets.length) {
    html += `<div class="commodity-price-grid">`;
    for (const ds of faoDatasets) {
      html += `<div class="commodity-price-card" style="flex-direction:column;align-items:flex-start">
        <div class="commodity-price-label">${_agEsc(ds.DatasetName||ds.DatasetCode||'—')}</div>
        <div class="commodity-price-period">Updated: ${_agEsc(ds.DateUpdate||'—')}</div>
        <a href="https://www.fao.org/faostat/en/#data/${_agEsc(ds.DatasetCode)}" target="_blank" rel="noopener" class="energy-entsog-link" style="margin-top:4px">↗ View Dataset</a>
      </div>`;
    }
    html += `</div>`;
  } else {
    html += `<div class="commodity-price-grid">
      <div class="commodity-price-card" style="flex-direction:column;align-items:flex-start">
        <div class="commodity-price-label">🌾 Crops & Livestock Products</div><div class="commodity-price-period">Annual, 200+ countries</div>
        <a href="https://www.fao.org/faostat/en/#data/QCL" target="_blank" rel="noopener" class="energy-entsog-link" style="margin-top:4px">↗ QCL Dataset</a>
      </div>
      <div class="commodity-price-card" style="flex-direction:column;align-items:flex-start">
        <div class="commodity-price-label">🪵 Forestry Production & Trade</div><div class="commodity-price-period">Annual since 1961</div>
        <a href="https://www.fao.org/faostat/en/#data/FO" target="_blank" rel="noopener" class="energy-entsog-link" style="margin-top:4px">↗ FO Dataset</a>
      </div>
      <div class="commodity-price-card" style="flex-direction:column;align-items:flex-start">
        <div class="commodity-price-label">🌍 Trade Matrix (all commodities)</div><div class="commodity-price-period">Monthly/Annual bilateral flows</div>
        <a href="https://www.fao.org/faostat/en/#data/TM" target="_blank" rel="noopener" class="energy-entsog-link" style="margin-top:4px">↗ TM Dataset</a>
      </div>
    </div>`;
  }

  html += `<div class="av-note" style="margin-top:12px">
    Sources: <a href="https://agridata.ec.europa.eu" target="_blank" rel="noopener" style="color:var(--accent)">EU Agri-food Data Portal</a> (no key) ·
    <a href="https://www.imf.org/en/research/commodity-prices" target="_blank" rel="noopener" style="color:var(--accent)">IMF PCPS</a> (monthly) ·
    <a href="https://www.fao.org/faostat" target="_blank" rel="noopener" style="color:var(--accent)">FAOSTAT</a> (annual, CC BY 4.0) ·
    EU data: weekly prices with ~2 month Comext lag for trade
  </div>`;

  el.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', e => {
    if (e.target.dataset?.tab === 'agri') {
      const el = document.getElementById('macro-agri');
      if (el && !el.dataset.agriLoaded) { el.dataset.agriLoaded='1'; agricultureLoadAll(); }
    }
  });
});

window.agricultureLoadAll = agricultureLoadAll;
