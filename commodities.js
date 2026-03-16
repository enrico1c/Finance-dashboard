/* ══════════════════════════════════════════════════════════════════
   FINTERM — commodities.js  (Phase 1)
   Global commodity benchmark price layer
   ──────────────────────────────────────────────────────────────────
   Sources — ALL FREE, NO API KEY:
   ┌─────────────────────────────────────────────────────────────┐
   │ World Bank  Pink Sheet XLSX  — monthly benchmark prices     │
   │             thedocs.worldbank.org  (metals/energy/ag/fert.) │
   │ IMF PCPS    datamapper API   — 68 commodity price indices   │
   │             imf.org/external/datamapper/api/v1              │
   └─────────────────────────────────────────────────────────────┘
   Populates: #macro-commodities  (Macro Intel → 🛢 COMMODITIES tab)
   ══════════════════════════════════════════════════════════════════ */

/* ── Cache ──────────────────────────────────────────────────────── */
const _CM = {};
function _cmGet(k, ms) { const e = _CM[k]; return (e && Date.now() - e.ts < ms) ? e.d : null; }
function _cmSet(k, d)  { _CM[k] = { d, ts: Date.now() }; }

/* ── Helpers ────────────────────────────────────────────────────── */
const _cmEsc = s => String(s ?? '').replace(/[<>&"]/g, c =>
  ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;' }[c]));
const _cmFmt   = (n, d = 2) => (n == null || isNaN(n)) ? '—' : Number(n).toFixed(d);
const _cmChgCls = v => v > 0 ? 'cm-pos' : v < 0 ? 'cm-neg' : '';
const _cmArrow  = v => v > 0 ? '▲' : v < 0 ? '▼' : '—';

const _CM_PROXY = 'https://api.allorigins.win/raw?url=';

async function _cmFetchText(url, key, ttl = 6 * 60 * 60 * 1000) {
  const c = _cmGet(key, ttl);
  if (c) return c;
  try {
    const res  = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    _cmSet(key, text);
    return text;
  } catch (e) { console.warn('[commodities]', key, e.message); return null; }
}

async function _cmFetchJson(url, key, ttl = 6 * 60 * 60 * 1000) {
  const c = _cmGet(key, ttl);
  if (c) return c;
  try {
    const res  = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    _cmSet(key, data);
    return data;
  } catch (e) { console.warn('[commodities]', key, e.message); return null; }
}

/* ══════════════════════════════════════════════════════════════════
   WORLD BANK PINK SHEET
   Monthly XLSX: CMO-Historical-Data-Monthly.xlsx
   We fetch via allorigins proxy and parse the CSV-like content.
   The Pink Sheet contains ~80 commodity series as tab/comma columns.
   ══════════════════════════════════════════════════════════════════ */

/* Stable World Bank Pink Sheet CSV endpoint (lighter than full XLSX) */
const WB_PINKSHEET_URL =
  'https://thedocs.worldbank.org/en/doc/5d903e848db1d1b83e0ec8f744e55570-0350012021/related/CMO-Historical-Data-Monthly.xlsx';

/* Fallback: World Bank Commodity Markets page data (JSON endpoint) */
const WB_API_URL = 'https://api.worldbank.org/v2/en/indicator/PCOALAUUSDM?downloadformat=csv&per_page=10';

/* ── Pink Sheet key commodity definitions ───────────────────────── */
/*  We map the known Pink Sheet column names to display labels.
    Since we parse CSV via allorigins, we look for these in headers.  */
const WB_COMMODITIES = [
  /* Energy */
  { id:'coal_aus',   label:'Coal (Australia)',  unit:'$/mt',    cat:'Energy',   icon:'⚫', color:'#8b949e' },
  { id:'coal_safrica',label:'Coal (S.Africa)',  unit:'$/mt',    cat:'Energy',   icon:'⚫', color:'#6e7681' },
  { id:'natgas_us',  label:'Natural Gas (US)',  unit:'$/MMBtu', cat:'Energy',   icon:'🔥', color:'#3fb950' },
  { id:'natgas_eu',  label:'Natural Gas (EU)',  unit:'$/MMBtu', cat:'Energy',   icon:'🔥', color:'#4a9eff' },
  { id:'lng_japan',  label:'LNG (Japan)',       unit:'$/MMBtu', cat:'Energy',   icon:'🚢', color:'#d29922' },
  /* Metals */
  { id:'gold',       label:'Gold',              unit:'$/troy oz',cat:'Metals',  icon:'🥇', color:'#ffd700' },
  { id:'silver',     label:'Silver',            unit:'$/troy oz',cat:'Metals',  icon:'🥈', color:'#c0c0c0' },
  { id:'copper',     label:'Copper',            unit:'$/mt',    cat:'Metals',   icon:'🔶', color:'#b87333' },
  { id:'aluminum',   label:'Aluminum',          unit:'$/mt',    cat:'Metals',   icon:'⬜', color:'#a8b2be' },
  { id:'nickel',     label:'Nickel',            unit:'$/mt',    cat:'Metals',   icon:'🔩', color:'#7ec8e3' },
  { id:'zinc',       label:'Zinc',              unit:'$/mt',    cat:'Metals',   icon:'🔷', color:'#7a9bb5' },
  { id:'iron_ore',   label:'Iron Ore',          unit:'$/dmt',   cat:'Metals',   icon:'🪨', color:'#8b6914' },
  /* Agriculture */
  { id:'wheat_us',   label:'Wheat (US HRW)',    unit:'$/mt',    cat:'Agriculture',icon:'🌾',color:'#daa520' },
  { id:'maize',      label:'Maize (Corn)',       unit:'$/mt',    cat:'Agriculture',icon:'🌽',color:'#ffd700' },
  { id:'soybeans',   label:'Soybeans',          unit:'$/mt',    cat:'Agriculture',icon:'🫘',color:'#8fbc8f' },
  { id:'palm_oil',   label:'Palm Oil',          unit:'$/mt',    cat:'Agriculture',icon:'🌴',color:'#228b22' },
  { id:'soybean_oil',label:'Soybean Oil',       unit:'$/mt',    cat:'Agriculture',icon:'🫙',color:'#6b8e23' },
  { id:'coffee',     label:'Coffee (Arabica)',   unit:'$/kg',    cat:'Agriculture',icon:'☕',color:'#6f4e37' },
  { id:'cocoa',      label:'Cocoa',             unit:'$/mt',    cat:'Agriculture',icon:'🍫',color:'#7b3f00' },
  { id:'sugar',      label:'Sugar (World)',      unit:'$/kg',    cat:'Agriculture',icon:'🍬',color:'#fff8dc' },
  { id:'cotton',     label:'Cotton',            unit:'$/kg',    cat:'Agriculture',icon:'☁️',color:'#f5f5f5' },
  /* Fertilizers */
  { id:'dap',        label:'DAP Fertilizer',    unit:'$/mt',    cat:'Fertilizers',icon:'🌱',color:'#90ee90' },
  { id:'urea',       label:'Urea',              unit:'$/mt',    cat:'Fertilizers',icon:'🧪',color:'#b0e0e6' },
  { id:'potassium',  label:'Potassium Chloride',unit:'$/mt',    cat:'Fertilizers',icon:'🧂',color:'#e6b0aa' },
];

/* ── Parse World Bank Pink Sheet CSV-like content ───────────────── */
/*  The XLSX converted to text via allorigins has comma/tab separated rows.
    We parse it dynamically: read header row, match column names.        */
function _parsePinkSheet(raw) {
  if (!raw || raw.length < 100) return null;

  // Try to extract lines
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 5);
  if (lines.length < 3) return null;

  // Find the header row (contains commodity names)
  let headerIdx = -1;
  let separator = ',';

  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const line = lines[i];
    if (line.toLowerCase().includes('coal') ||
        line.toLowerCase().includes('copper') ||
        line.toLowerCase().includes('gold')) {
      headerIdx = i;
      separator = line.includes('\t') ? '\t' : ',';
      break;
    }
  }

  if (headerIdx < 0) return null;

  const headers = lines[headerIdx].split(separator).map(h => h.trim().toLowerCase().replace(/"/g, ''));

  // Collect last 13 months of data rows (date + values)
  const dataRows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const parts = lines[i].split(separator).map(p => p.trim().replace(/"/g, ''));
    // First column should be a year/month like "2024M01" or "Jan-2024" or just a number
    if (parts[0] && parts.length > 3) {
      dataRows.push(parts);
    }
  }

  if (!dataRows.length) return null;

  // Extract values for each commodity
  const results = {};

  // Map commodity ids to possible header keywords
  const colMap = {
    coal_aus:    ['coal, australia', 'coal australia', 'coal_aus'],
    coal_safrica:['coal, south africa', 'coal south africa', 'coal safrica'],
    natgas_us:   ['natural gas, u.s.', 'natural gas us', 'henry hub'],
    natgas_eu:   ['natural gas, europe', 'natural gas europe', 'ttf'],
    lng_japan:   ['liquefied natural gas, japan', 'lng, japan', 'lng japan'],
    gold:        ['gold'],
    silver:      ['silver'],
    copper:      ['copper'],
    aluminum:    ['aluminum', 'aluminium'],
    nickel:      ['nickel'],
    zinc:        ['zinc'],
    iron_ore:    ['iron ore', 'iron_ore'],
    wheat_us:    ['wheat, us hrw', 'wheat us', 'wheat'],
    maize:       ['maize', 'corn'],
    soybeans:    ['soybeans', 'soybean'],
    palm_oil:    ['palm oil', 'palm_oil'],
    soybean_oil: ['soybean oil', 'soybean_oil'],
    coffee:      ['coffee, arabica', 'coffee arabica', 'coffee'],
    cocoa:       ['cocoa'],
    sugar:       ['sugar, world', 'sugar world', 'sugar'],
    cotton:      ['cotton, a index', 'cotton a', 'cotton'],
    dap:         ['dap', 'diammonium phosphate'],
    urea:        ['urea'],
    potassium:   ['potassium chloride', 'mop', 'potassium'],
  };

  for (const [id, keywords] of Object.entries(colMap)) {
    let colIdx = -1;
    for (const kw of keywords) {
      colIdx = headers.findIndex(h => h.includes(kw));
      if (colIdx >= 0) break;
    }
    if (colIdx < 0) continue;

    // Get last 2 valid data points for current + previous
    const vals = [];
    for (let i = dataRows.length - 1; i >= 0 && vals.length < 2; i--) {
      const v = parseFloat(dataRows[i][colIdx]);
      if (!isNaN(v) && v > 0) vals.push({ date: dataRows[i][0], value: v });
    }

    if (vals.length > 0) {
      const current = vals[0];
      const prev    = vals[1] || null;
      results[id] = {
        current:  current.value,
        date:     current.date,
        prev:     prev?.value ?? null,
        chgPct:   prev ? (current.value - prev.value) / Math.abs(prev.value) * 100 : null,
      };
    }
  }

  return Object.keys(results).length > 0 ? results : null;
}

async function _wbPinkSheet() {
  /* Try allorigins proxy on the monthly XLSX */
  const url = _CM_PROXY + encodeURIComponent(WB_PINKSHEET_URL);
  const raw = await _cmFetchText(url, 'wb_pinksheet', 12 * 60 * 60 * 1000);
  return _parsePinkSheet(raw);
}

/* ══════════════════════════════════════════════════════════════════
   IMF DataMapper PCPS
   Free JSON API, no key. Returns price indices for 68 commodities.
   We use it as primary source (more reliable than XLSX parsing)
   and complement with Pink Sheet for absolute prices.
   ══════════════════════════════════════════════════════════════════ */

/* IMF DataMapper commodity indicator codes */
const IMF_COMMODITIES = [
  { id:'PCOALAUUSDM',  label:'Coal (Australia)',   unit:'$/mt',     cat:'Energy',      icon:'⚫', color:'#8b949e' },
  { id:'PNGASUUSDM',   label:'Natural Gas (US)',   unit:'$/MMBtu',  cat:'Energy',      icon:'🔥', color:'#3fb950' },
  { id:'PNGASEUUSDM',  label:'Natural Gas (EU)',   unit:'$/MMBtu',  cat:'Energy',      icon:'🔥', color:'#4a9eff' },
  { id:'PGOLDUSDM',    label:'Gold',               unit:'$/troy oz',cat:'Metals',      icon:'🥇', color:'#ffd700' },
  { id:'PSILVERUSDM',  label:'Silver',             unit:'$/troy oz',cat:'Metals',      icon:'🥈', color:'#c0c0c0' },
  { id:'PCOPPUSDM',    label:'Copper',             unit:'$/mt',     cat:'Metals',      icon:'🔶', color:'#b87333' },
  { id:'PALUMINUSDM',  label:'Aluminum',           unit:'$/mt',     cat:'Metals',      icon:'⬜', color:'#a8b2be' },
  { id:'PNICKUSDM',    label:'Nickel',             unit:'$/mt',     cat:'Metals',      icon:'🔩', color:'#7ec8e3' },
  { id:'PZINCUSDM',    label:'Zinc',               unit:'$/mt',     cat:'Metals',      icon:'🔷', color:'#7a9bb5' },
  { id:'PIORECRUSDM',  label:'Iron Ore',           unit:'$/dmt',    cat:'Metals',      icon:'🪨', color:'#8b6914' },
  { id:'PWHEAUSDM',    label:'Wheat',              unit:'$/mt',     cat:'Agriculture', icon:'🌾', color:'#daa520' },
  { id:'PMAIZUSDM',    label:'Maize',              unit:'$/mt',     cat:'Agriculture', icon:'🌽', color:'#ffd700' },
  { id:'PSOYBUSDM',    label:'Soybeans',           unit:'$/mt',     cat:'Agriculture', icon:'🫘', color:'#8fbc8f' },
  { id:'PPALMUSDM',    label:'Palm Oil',           unit:'$/mt',     cat:'Agriculture', icon:'🌴', color:'#228b22' },
  { id:'PCOFFOTMUSDM', label:'Coffee (Arabica)',   unit:'$/kg',     cat:'Agriculture', icon:'☕', color:'#6f4e37' },
  { id:'PCOCOUSDM',    label:'Cocoa',              unit:'$/mt',     cat:'Agriculture', icon:'🍫', color:'#7b3f00' },
  { id:'PSUGARWUSDM',  label:'Sugar (World)',      unit:'$/kg',     cat:'Agriculture', icon:'🍬', color:'#daa520' },
  { id:'PCOTTINDUSDM', label:'Cotton',             unit:'$/kg',     cat:'Agriculture', icon:'☁️', color:'#8b949e' },
  { id:'PDAPUSDM',     label:'DAP Fertilizer',     unit:'$/mt',     cat:'Fertilizers', icon:'🌱', color:'#90ee90' },
  { id:'PUREUSDM',     label:'Urea',               unit:'$/mt',     cat:'Fertilizers', icon:'🧪', color:'#b0e0e6' },
  { id:'PPOTUSDM',     label:'Potassium Chloride', unit:'$/mt',     cat:'Fertilizers', icon:'🧂', color:'#e6b0aa' },
  { id:'PTIMBUSDM',    label:'Timber (Logs)',       unit:'$/m³',     cat:'Other',       icon:'🪵', color:'#8b4513' },
];

async function _imfPCPS(indicatorId) {
  /* IMF DataMapper API: returns a JSON object with values by year */
  const url = `https://www.imf.org/external/datamapper/api/v1/data/${indicatorId}`;
  const data = await _cmFetchJson(url, `imf_${indicatorId}`, 12 * 60 * 60 * 1000);
  if (!data?.values?.[indicatorId]) return null;

  const series = data.values[indicatorId];
  /* The API returns { "WORLD": { "2023": 123.4, "2024": 145.6, ... } }
     or { "USA": {...}, "WLD": {...} }  — we pick the most global key */
  const regionKey = Object.keys(series).find(k =>
    ['WLD','WORLD','ALL','W00'].includes(k.toUpperCase())
  ) || Object.keys(series)[0];

  if (!regionKey) return null;

  const yearly = series[regionKey];
  const years  = Object.keys(yearly).filter(y => yearly[y] != null).sort();
  if (!years.length) return null;

  const lastYear = years[years.length - 1];
  const prevYear = years.length > 1 ? years[years.length - 2] : null;
  const current  = parseFloat(yearly[lastYear]);
  const prev     = prevYear ? parseFloat(yearly[prevYear]) : null;

  return {
    current,
    prev,
    date:    lastYear,
    chgPct:  prev ? (current - prev) / Math.abs(prev) * 100 : null,
    history: years.slice(-5).map(y => parseFloat(yearly[y])).filter(v => !isNaN(v)),
  };
}

/* Batch fetch IMF series with concurrency limit */
async function _imfBatch(commodities) {
  const results = {};
  /* IMF DataMapper is lightweight — fetch in batches of 5 */
  const BATCH = 5;
  for (let i = 0; i < commodities.length; i += BATCH) {
    const slice = commodities.slice(i, i + BATCH);
    const fetched = await Promise.all(
      slice.map(c => _imfPCPS(c.id).then(d => ({ c, d })))
    );
    for (const { c, d } of fetched) results[c.id] = d;
  }
  return results;
}

/* ══════════════════════════════════════════════════════════════════
   SPARKLINE
   ══════════════════════════════════════════════════════════════════ */
function _cmSparkline(values, color = '#58a6ff') {
  if (!values || values.length < 2) return '';
  const mn = Math.min(...values), mx = Math.max(...values), range = mx - mn || 1;
  const W = 60, H = 20;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - mn) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const lastY = H - ((values[values.length-1] - mn) / range) * H;
  return `<svg width="${W}" height="${H}" style="display:block;overflow:visible">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="${W}" cy="${lastY.toFixed(1)}" r="2" fill="${color}"/>
  </svg>`;
}

/* ══════════════════════════════════════════════════════════════════
   RENDER HELPERS
   ══════════════════════════════════════════════════════════════════ */
function _cmLiveBar(t, s = '') {
  return `<div class="cm-live-bar">
    <span class="cm-live-dot"></span><span>${_cmEsc(t)}</span>
    ${s ? `<span class="cm-live-sub">${_cmEsc(s)}</span>` : ''}
  </div>`;
}
function _cmSectionHead(t) { return `<div class="cm-section-head">${_cmEsc(t)}</div>`; }
function _cmNoData(msg)    { return `<div class="cm-nodata">// ${_cmEsc(msg)}</div>`; }

function _cmCategoryIcon(cat) {
  return { Energy:'⚡', Metals:'⛏', Agriculture:'🌾', Fertilizers:'🌱', Other:'📦' }[cat] || '📦';
}

function _renderCommodityRow(c, data) {
  if (!data) return `<tr class="cm-row cm-row-empty">
    <td><span class="cm-icon">${c.icon}</span> ${_cmEsc(c.label)}</td>
    <td colspan="4" class="cm-muted">—</td>
  </tr>`;

  const chgCls = _cmChgCls(data.chgPct);
  return `<tr class="cm-row">
    <td>
      <div class="cm-label-cell">
        <span class="cm-icon">${c.icon}</span>
        <span class="cm-label">${_cmEsc(c.label)}</span>
      </div>
    </td>
    <td class="cm-val" style="color:${c.color}">${_cmFmt(data.current)}</td>
    <td class="cm-unit cm-muted">${_cmEsc(c.unit)}</td>
    <td class="cm-chg ${chgCls}">
      ${_cmArrow(data.chgPct)} ${data.chgPct != null ? Math.abs(data.chgPct).toFixed(1)+'%' : '—'}
    </td>
    <td class="cm-spark">${_cmSparkline(data.history, c.color)}</td>
    <td class="cm-date cm-muted">${_cmEsc(String(data.date))}</td>
  </tr>`;
}

/* ══════════════════════════════════════════════════════════════════
   MAIN RENDER
   ══════════════════════════════════════════════════════════════════ */
async function commoditiesRender() {
  const el = document.getElementById('macro-commodities');
  if (!el) return;
  el.innerHTML = `<div class="cm-loading"><span class="av-spinner"></span> Loading commodity data…</div>`;

  /* Fetch IMF PCPS for all commodities in parallel */
  const imfData = await _imfBatch(IMF_COMMODITIES);

  /* Group by category */
  const categories = {};
  for (const c of IMF_COMMODITIES) {
    if (!categories[c.cat]) categories[c.cat] = [];
    categories[c.cat].push(c);
  }

  /* Count how many series returned data */
  const loaded = Object.values(imfData).filter(Boolean).length;

  let html = '';
  html += _cmLiveBar(
    'Global Commodity Benchmarks',
    `IMF Primary Commodity Prices · No API key · Monthly · ${loaded}/${IMF_COMMODITIES.length} series loaded`
  );

  /* Summary KPI strip — show key commodities */
  const keyIds = ['PGOLDUSDM', 'PCOPPUSDM', 'PCOALAUUSDM', 'PNGASUUSDM', 'PWHEAUSDM', 'PPALMUSDM'];
  const kpiCommodities = IMF_COMMODITIES.filter(c => keyIds.includes(c.id));

  html += `<div class="cm-kpi-strip">`;
  for (const c of kpiCommodities) {
    const d = imfData[c.id];
    if (!d) continue;
    const cls = _cmChgCls(d.chgPct);
    html += `<div class="cm-kpi-card" style="border-top:2px solid ${c.color}">
      <div class="cm-kpi-icon">${c.icon}</div>
      <div class="cm-kpi-label">${_cmEsc(c.label)}</div>
      <div class="cm-kpi-val" style="color:${c.color}">${_cmFmt(d.current)}</div>
      <div class="cm-kpi-unit cm-muted">${_cmEsc(c.unit)}</div>
      <div class="cm-kpi-chg ${cls}">
        ${_cmArrow(d.chgPct)} ${d.chgPct != null ? Math.abs(d.chgPct).toFixed(1)+'%' : '—'}
        <span class="cm-kpi-yr cm-muted">YoY</span>
      </div>
    </div>`;
  }
  html += `</div>`;

  /* Full category tables */
  const catOrder = ['Energy', 'Metals', 'Agriculture', 'Fertilizers', 'Other'];
  for (const cat of catOrder) {
    const items = categories[cat];
    if (!items) continue;

    html += _cmSectionHead(`${_cmCategoryIcon(cat)} ${cat}`);
    html += `<div class="cm-table-wrap"><table class="cm-table">
      <thead><tr>
        <th>Commodity</th>
        <th>Price</th>
        <th>Unit</th>
        <th>YoY Chg</th>
        <th>Trend</th>
        <th>Year</th>
      </tr></thead>
      <tbody>`;

    for (const c of items) {
      html += _renderCommodityRow(c, imfData[c.id]);
    }
    html += `</tbody></table></div>`;
  }

  /* Data quality note */
  if (loaded === 0) {
    html += _cmNoData(
      'IMF DataMapper API did not return data. This can happen if the API is updating ' +
      'or if network restrictions block imf.org. Data is updated monthly, typically in ' +
      'the first week of each month.'
    );
  } else if (loaded < IMF_COMMODITIES.length / 2) {
    html += `<div class="cm-warn">
      ⚠ Only ${loaded}/${IMF_COMMODITIES.length} commodity series returned data.
      The IMF DataMapper API may be partially updating.
    </div>`;
  }

  /* IMF Frequency note */
  html += `<div class="cm-freq-note">
    📅 <strong>Update frequency:</strong> Monthly — IMF publishes updated figures
    on the Wednesday of the first full week of each month.
    Values shown are annual averages from the IMF Primary Commodity Price System (PCPS).
  </div>`;

  /* Footer */
  html += `<div class="cm-footer">
    <a href="https://www.imf.org/en/research/commodity-prices" target="_blank" rel="noopener" class="cm-link">IMF PCPS</a> ·
    <a href="https://www.worldbank.org/en/research/commodity-markets" target="_blank" rel="noopener" class="cm-link">World Bank Pink Sheet</a>
    · No API key required · Monthly benchmarks
  </div>`;

  el.innerHTML = html;
}

/* ══════════════════════════════════════════════════════════════════
   CSS — injected once
   ══════════════════════════════════════════════════════════════════ */
(function injectCommoditiesCSS() {
  if (document.getElementById('cm-css')) return;
  const style = document.createElement('style');
  style.id = 'cm-css';
  style.textContent = `
    /* ── Commodities tab ─────────────────────────────────────── */
    .cm-loading { display:flex;align-items:center;gap:8px;padding:20px 16px;color:var(--text-secondary,#8b949e);font-size:12px; }
    .cm-live-bar { display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--border,#30363d);font-size:10px;font-weight:600;color:var(--text-primary,#e6edf3); }
    .cm-live-dot { width:7px;height:7px;border-radius:50%;background:#3fb950;animation:pulse 2s infinite; }
    .cm-live-sub { color:var(--text-muted,#8b949e);font-weight:400; }
    .cm-section-head { font-size:10px;font-weight:700;letter-spacing:.08em;color:var(--text-secondary,#8b949e);padding:10px 14px 4px;text-transform:uppercase;border-bottom:1px solid var(--border,#30363d); }
    .cm-nodata { padding:12px 14px;color:var(--text-muted,#8b949e);font-size:11px;font-style:italic; }
    .cm-warn   { padding:8px 14px;color:#d29922;font-size:10px; }
    .cm-muted  { color:var(--text-muted,#8b949e); }
    .cm-pos    { color:#3fb950; }
    .cm-neg    { color:#f85149; }

    /* KPI strip */
    .cm-kpi-strip { display:flex;gap:8px;padding:10px 14px;flex-wrap:wrap;border-bottom:1px solid var(--border,#30363d); }
    .cm-kpi-card  { background:var(--bg-primary,#0d1117);border:0.5px solid var(--border,#30363d);border-radius:6px;padding:8px 10px;min-width:90px;flex:1; }
    .cm-kpi-icon  { font-size:14px;margin-bottom:3px; }
    .cm-kpi-label { font-size:9px;color:var(--text-muted,#8b949e);white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
    .cm-kpi-val   { font-size:14px;font-weight:700;font-family:monospace; }
    .cm-kpi-unit  { font-size:8px; }
    .cm-kpi-chg   { font-size:10px;font-weight:600;margin-top:2px; }
    .cm-kpi-yr    { font-size:8px;margin-left:2px; }

    /* Table */
    .cm-table-wrap { overflow-x:auto;padding:0 8px 8px; }
    .cm-table { width:100%;border-collapse:collapse;font-size:11px; }
    .cm-table thead th { padding:6px 8px;text-align:left;font-size:9px;font-weight:600;letter-spacing:.06em;color:var(--text-muted,#8b949e);border-bottom:1px solid var(--border,#30363d);white-space:nowrap; }
    .cm-table tbody .cm-row td { padding:5px 8px;border-bottom:0.5px solid var(--border,#30363d);vertical-align:middle; }
    .cm-row:hover td { background:rgba(88,166,255,.04); }
    .cm-label-cell { display:flex;align-items:center;gap:6px; }
    .cm-icon  { font-size:12px; }
    .cm-label { font-weight:500; }
    .cm-val   { font-family:monospace;font-weight:600;font-size:12px; }
    .cm-unit  { font-size:9px;white-space:nowrap; }
    .cm-chg   { font-weight:600;font-size:10px;white-space:nowrap; }
    .cm-spark { line-height:0; }
    .cm-date  { font-size:9px;white-space:nowrap; }

    /* Notes */
    .cm-freq-note { padding:10px 14px;font-size:10px;color:var(--text-muted,#8b949e);border-top:1px solid var(--border,#30363d);line-height:1.6; }
    .cm-footer    { padding:8px 14px;font-size:10px;color:var(--text-muted,#8b949e);border-top:1px solid var(--border,#30363d); }
    .cm-link      { color:var(--accent,#58a6ff);text-decoration:none; }
    .cm-link:hover{ text-decoration:underline; }

    /* ── Energy tab ──────────────────────────────────────────── */
    .en-loading { display:flex;align-items:center;gap:8px;padding:20px 16px;color:var(--text-secondary,#8b949e);font-size:12px; }
    .en-live-bar { display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--border,#30363d);font-size:10px;font-weight:600;color:var(--text-primary,#e6edf3); }
    .en-live-dot { width:7px;height:7px;border-radius:50%;background:#f0883e;animation:pulse 2s infinite; }
    .en-live-sub { color:var(--text-muted,#8b949e);font-weight:400;margin-left:4px; }
    .en-section-head { font-size:10px;font-weight:700;letter-spacing:.08em;color:var(--text-secondary,#8b949e);padding:10px 14px 4px;text-transform:uppercase;border-bottom:1px solid var(--border,#30363d); }
    .en-nodata { padding:10px 14px;color:var(--text-muted,#8b949e);font-size:11px;font-style:italic; }
    .en-muted  { color:var(--text-muted,#8b949e); }
    .en-pos    { color:#3fb950; }
    .en-neg    { color:#f85149; }
    .en-link   { color:var(--accent,#58a6ff);text-decoration:none; }
    .en-link:hover { text-decoration:underline; }

    /* Price cards */
    .en-price-grid { display:flex;flex-wrap:wrap;gap:8px;padding:10px 14px;border-bottom:1px solid var(--border,#30363d); }
    .en-price-card { background:var(--bg-primary,#0d1117);border:0.5px solid var(--border,#30363d);border-radius:6px;padding:10px 12px;min-width:120px;flex:1;display:flex;flex-direction:column;gap:4px; }
    .en-price-card-empty { opacity:.5; }
    .en-pc-top  { display:flex;align-items:center;gap:5px; }
    .en-pc-icon { font-size:13px; }
    .en-pc-label{ font-size:10px;font-weight:600;color:var(--text-secondary,#8b949e);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
    .en-pc-unit { font-size:8px;color:var(--text-muted,#8b949e); }
    .en-pc-val  { font-size:16px;font-weight:700;font-family:monospace; }
    .en-pc-chg  { font-size:11px;font-weight:600;display:flex;align-items:center;gap:4px; }
    .en-pc-abs  { font-size:9px;color:var(--text-muted,#8b949e); }
    .en-pc-spark{ line-height:0;margin:2px 0; }
    .en-pc-meta { display:flex;gap:8px;font-size:9px;flex-wrap:wrap; }
    .en-pc-note { font-size:9px;color:var(--text-muted,#8b949e); }

    /* Storage strip */
    .en-storage-strip { display:flex;gap:10px;padding:8px 14px;flex-wrap:wrap;align-items:center; }
    .en-storage-kpi   { display:flex;flex-direction:column;gap:2px;min-width:100px; }
    .en-storage-lbl   { font-size:9px;color:var(--text-muted,#8b949e); }
    .en-storage-val   { font-size:14px;font-weight:700;font-family:monospace; }
    .en-storage-date  { font-size:9px;padding-left:4px; }
    .en-storage-spark-wrap { display:flex;align-items:center;gap:8px;padding:0 14px 10px; }
    .en-storage-spark-lbl { font-size:9px;color:var(--text-muted,#8b949e); }

    /* GIE table */
    .en-gie-wrap { overflow-x:auto;padding:4px 8px 8px; }
    .en-gie-table { width:100%;border-collapse:collapse;font-size:11px; }
    .en-gie-table thead th { padding:5px 8px;text-align:left;font-size:9px;font-weight:600;letter-spacing:.06em;color:var(--text-muted,#8b949e);border-bottom:1px solid var(--border,#30363d); }
    .en-gie-table tbody td { padding:5px 8px;border-bottom:0.5px solid var(--border,#30363d);vertical-align:middle; }
    .en-gie-table tbody tr:hover td { background:rgba(88,166,255,.04); }
    .en-gie-country { font-weight:600; }
    .en-gie-bar-wrap { width:80px;height:5px;background:var(--border,#30363d);border-radius:3px;overflow:hidden;display:inline-block;vertical-align:middle;margin-right:6px; }
    .en-gie-bar { height:100%;border-radius:3px;transition:width .3s; }
    .en-key-hint { padding:6px 14px;font-size:10px;color:var(--text-muted,#8b949e); }

    /* ENTSOG flows */
    .en-flows-list { padding:8px 14px;display:flex;flex-direction:column;gap:4px; }
    .en-flow-row   { display:flex;align-items:center;gap:8px;font-size:11px; }
    .en-flow-route { min-width:180px;color:var(--text-secondary,#8b949e);white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
    .en-flow-bar-wrap { flex:1;height:4px;background:var(--border,#30363d);border-radius:2px;overflow:hidden; }
    .en-flow-bar  { height:100%;background:var(--accent,#58a6ff);border-radius:2px; }
    .en-flow-val  { font-size:10px;font-family:monospace;color:var(--text-secondary,#8b949e);white-space:nowrap;min-width:80px;text-align:right; }

    .en-footer { padding:8px 14px;font-size:10px;color:var(--text-muted,#8b949e);border-top:1px solid var(--border,#30363d); }
  `;
  document.head.appendChild(style);
})();

/* ══════════════════════════════════════════════════════════════════
   PUBLIC API
   ══════════════════════════════════════════════════════════════════ */
window.commoditiesLoadAll = function () { commoditiesRender(); };

document.addEventListener('DOMContentLoaded', () => {
  let _cmTimer = null;
  document.addEventListener('click', e => {
    if (e.target?.dataset?.tab === 'commodities' && e.target.closest('#panel-macro')) {
      commoditiesRender();
      clearInterval(_cmTimer);
      _cmTimer = setInterval(commoditiesRender, 60 * 60 * 1000); // refresh hourly
    }
  });
});
