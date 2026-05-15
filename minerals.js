/* ══════════════════════════════════════════════════════════════════
   FINTERM — minerals.js  (Phase 2)
   Critical Minerals & Strategic Resources
   Sources: USGS MCS CSV (no key) · EU RMIS (static) · OECD Export Restrictions (no key) · Kimberley Process (no key)
   Panel: Supply Chain → supply-minerals  (extended with MINERALS, POLICY, GEMSTONES sections)
   ══════════════════════════════════════════════════════════════════ */

const _MIN = {};
function _minGet(k,ms) { const e=_MIN[k]; return (e&&Date.now()-e.ts<ms)?e.d:null; }
function _minSet(k,d)  { _MIN[k]={d,ts:Date.now()}; }
const _minEsc = s => String(s??'').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
const _minFmt = (n,d=1) => n==null||isNaN(n)?'—':Number(n).toFixed(d);

/* ══════════════════════════════════════════════════════════════════
   USGS MINERAL COMMODITY SUMMARIES — CSV data releases (no key)
   USGS Science Data Catalog
   ══════════════════════════════════════════════════════════════════ */

/* Priority minerals for the platform */
const USGS_PRIORITY_MINERALS = [
  { id:'rare_earths',  name:'Rare Earth Elements', symbol:'REE',  icon:'⚗',  usSection:'Rare Earths',   criticalFlags:['EU_SRM','USGS','NATO','DOE'] },
  { id:'lithium',      name:'Lithium',             symbol:'Li',   icon:'🔋',  usSection:'Lithium',       criticalFlags:['EU_CRM','USGS','NATO','DOE'] },
  { id:'cobalt',       name:'Cobalt',              symbol:'Co',   icon:'🔵',  usSection:'Cobalt',        criticalFlags:['EU_SRM','USGS','NATO','DOE'] },
  { id:'tungsten',     name:'Tungsten',            symbol:'W',    icon:'🔩',  usSection:'Tungsten',      criticalFlags:['EU_CRM','USGS','NATO'] },
  { id:'gallium',      name:'Gallium',             symbol:'Ga',   icon:'💡',  usSection:'Gallium',       criticalFlags:['EU_SRM','USGS','NATO'] },
  { id:'germanium',    name:'Germanium',           symbol:'Ge',   icon:'💻',  usSection:'Germanium',     criticalFlags:['EU_SRM','USGS','NATO'] },
  { id:'graphite',     name:'Graphite',            symbol:'C',    icon:'✏',   usSection:'Graphite',      criticalFlags:['EU_SRM','USGS','NATO','DOE'] },
  { id:'nickel',       name:'Nickel',              symbol:'Ni',   icon:'🪙',  usSection:'Nickel',        criticalFlags:['EU_CRM','USGS','DOE'] },
  { id:'copper',       name:'Copper',              symbol:'Cu',   icon:'🔶',  usSection:'Copper',        criticalFlags:['USGS','DOE'] },
  { id:'phosphate',    name:'Phosphate Rock',      symbol:'PO₄', icon:'🌱',  usSection:'Phosphate Rock',criticalFlags:['EU_CRM','USGS'] },
  { id:'manganese',    name:'Manganese',           symbol:'Mn',   icon:'🔮',  usSection:'Manganese',     criticalFlags:['EU_SRM','USGS','NATO','DOE'] },
  { id:'vanadium',     name:'Vanadium',            symbol:'V',    icon:'⚡',  usSection:'Vanadium',      criticalFlags:['EU_CRM','USGS'] },
  { id:'titanium',     name:'Titanium',            symbol:'Ti',   icon:'✈',   usSection:'Titanium',      criticalFlags:['EU_CRM','USGS','NATO'] },
  { id:'chromium',     name:'Chromium',            symbol:'Cr',   icon:'🔬',  usSection:'Chromium',      criticalFlags:['EU_CRM','USGS'] },
  { id:'indium',       name:'Indium',              symbol:'In',   icon:'📱',  usSection:'Indium',        criticalFlags:['EU_CRM','USGS'] },
  { id:'tellurium',    name:'Tellurium',           symbol:'Te',   icon:'☀',   usSection:'Tellurium',     criticalFlags:['EU_CRM','USGS'] },
];

/* USGS MCS 2025/2026 key statistics — sourced from USGS publications (annual, public domain) */
/* Format: { production_us_kt, production_world_kt, reserves_world_kt, import_reliance_pct, top_producers, price_unit, price } */
const USGS_MCS_DATA = {
  rare_earths:  { prod_us:43, prod_world:390, reserves:89000, import_reliance:4, top_producers:['China 70%','Myanmar 14%','Australia 7%'], price_unit:'$/kg REO', price_range:'2–200 (varies by element)', note:'China dominates separation and processing despite US mine production' },
  lithium:      { prod_us:null, prod_world:240000, reserves:28000000, import_reliance:null, top_producers:['Australia 46%','Chile 30%','China 15%'], price_unit:'$/t LCE', price_range:'~10,000–15,000', note:'Battery-grade lithium demand driven by EV transition' },
  cobalt:       { prod_us:null, prod_world:220000, reserves:8300000, import_reliance:76, top_producers:['DRC 73%','Russia 4%','Australia 4%'], price_unit:'$/lb', price_range:'~12–15', note:'High import reliance; DRC concentration is key supply risk' },
  tungsten:     { prod_us:null, prod_world:90000, reserves:4000000, import_reliance:54, top_producers:['China 84%','Vietnam 5%','Russia 2%'], price_unit:'$/mtu APT', price_range:'~$230–280', note:'US Tungsten Price Index rose 65% Q4 2025 on defense procurement' },
  gallium:      { prod_us:null, prod_world:550, reserves:null, import_reliance:100, top_producers:['China 98%','Russia 1%','Ukraine 1%'], price_unit:'$/kg', price_range:'~500–700', note:'China export controls (2023) caused immediate supply disruptions' },
  germanium:    { prod_us:null, prod_world:130, reserves:null, import_reliance:100, top_producers:['China 75%','Russia 7%','Canada 5%'], price_unit:'$/kg', price_range:'~1,100–1,400', note:'Semiconductor and fiber optic applications; byproduct of zinc smelting' },
  graphite:     { prod_us:null, prod_world:1300000, reserves:320000000, import_reliance:100, top_producers:['China 79%','Mozambique 7%','Ethiopia 3%'], price_unit:'$/t', price_range:'~500–1,000', note:'Battery-grade natural graphite; processing dominated by China' },
  nickel:       { prod_us:null, prod_world:3300000, reserves:95000000, import_reliance:42, top_producers:['Indonesia 48%','Philippines 11%','Russia 8%'], price_unit:'$/t', price_range:'~13,000–15,000', note:'Class I vs Class II split matters for EV batteries' },
  copper:       { prod_us:1100, prod_world:22000, reserves:890000000, import_reliance:37, top_producers:['Chile 27%','Peru 10%','DRC 10%'], price_unit:'$/t', price_range:'~8,000–10,000', note:'Energy transition demand driver; critical for electrification' },
  phosphate:    { prod_us:16600, prod_world:230000, reserves:71000000, import_reliance:null, top_producers:['Morocco 70%res','China 40%prod','Morocco 16%prod'], price_unit:'$/t', price_range:'~65–90', note:'Morocco holds ~70% of world reserves; food security implications' },
  manganese:    { prod_us:null, prod_world:20000, reserves:1500000000, import_reliance:100, top_producers:['South Africa 36%','Gabon 21%','Australia 18%'], price_unit:'$/dry mt', price_range:'~4–6', note:'Battery-grade manganese (LMFP) demand growing with EV adoption' },
  vanadium:     { prod_us:null, prod_world:100000, reserves:63000000, import_reliance:100, top_producers:['China 68%','Russia 19%','South Africa 8%'], price_unit:'$/lb V2O5', price_range:'~5–8', note:'Vanadium redox batteries emerging for grid-scale storage' },
  titanium:     { prod_us:null, prod_world:10200, reserves:900000000, import_reliance:63, top_producers:['China 42%','Japan 17%','Russia 12%'], price_unit:'$/kg sponge', price_range:'~10–15', note:'Aerospace and defense applications; aerospace-grade sponge supply concentrated' },
  chromium:     { prod_us:null, prod_world:41000, reserves:570000000, import_reliance:72, top_producers:['South Africa 47%','Kazakhstan 18%','India 15%'], price_unit:'$/t ore', price_range:'~200–280', note:'Stainless steel feedstock; also strategic for hard alloys and defense' },
  indium:       { prod_us:null, prod_world:900, reserves:null, import_reliance:100, top_producers:['China 58%','South Korea 14%','Japan 10%'], price_unit:'$/kg', price_range:'~150–200', note:'ITO for touchscreens/displays; byproduct of zinc refining' },
  tellurium:    { prod_us:null, prod_world:500, reserves:null, import_reliance:null, top_producers:['China 68%','Sweden 8%','Japan 7%'], price_unit:'$/kg', price_range:'~60–80', note:'CdTe solar panels; byproduct of copper refining' },
};

/* ══════════════════════════════════════════════════════════════════
   EU RMIS CRITICALITY CLASSIFICATIONS (static lookup — review cycle: 2027)
   Source: EU Critical Raw Materials Act (CRMA) 2024 · ec.europa.eu/growth/tools-databases/rmis
   Last updated: 2023/2024. Next EU CRM review: 2027.
   ══════════════════════════════════════════════════════════════════ */
const EU_CRITICALITY = {
  rare_earths: { eu_crm: true,  eu_srm: true,  nato: true,  doe: true,  note:'Rare earths for magnets classified as EU Strategic Raw Material' },
  lithium:     { eu_crm: true,  eu_srm: true,  nato: true,  doe: true,  note:'Battery-grade lithium is EU SRM under CRMA 2024' },
  cobalt:      { eu_crm: true,  eu_srm: true,  nato: true,  doe: true,  note:'Highest import reliance; DRC concentration raises supply risk score' },
  tungsten:    { eu_crm: true,  eu_srm: false, nato: true,  doe: false, note:'EU CRM; important for defense and machining industries' },
  gallium:     { eu_crm: false, eu_srm: true,  nato: true,  doe: false, note:'EU SRM; China controls ~98% of production' },
  germanium:   { eu_crm: false, eu_srm: true,  nato: true,  doe: false, note:'EU SRM; critical for semiconductors and fiber optics' },
  graphite:    { eu_crm: false, eu_srm: true,  nato: true,  doe: true,  note:'EU SRM; battery-grade natural graphite for EV anodes' },
  nickel:      { eu_crm: true,  eu_srm: false, nato: false, doe: true,  note:'EU CRM; battery-grade nickel for NMC cathodes' },
  copper:      { eu_crm: false, eu_srm: false, nato: false, doe: true,  note:'DOE critical; electrification demand driver' },
  phosphate:   { eu_crm: true,  eu_srm: false, nato: false, doe: false, note:'EU CRM; food security dependency on Morocco' },
  manganese:   { eu_crm: false, eu_srm: true,  nato: true,  doe: true,  note:'EU SRM; manganese in LMFP batteries' },
  vanadium:    { eu_crm: true,  eu_srm: false, nato: false, doe: false, note:'EU CRM; grid storage applications growing' },
  titanium:    { eu_crm: true,  eu_srm: false, nato: true,  doe: false, note:'EU CRM; aerospace and defense sponge supply' },
  chromium:    { eu_crm: true,  eu_srm: false, nato: false, doe: false, note:'EU CRM; stainless steel critical feedstock' },
  indium:      { eu_crm: true,  eu_srm: false, nato: false, doe: false, note:'EU CRM; ITO for displays; byproduct supply risks' },
  tellurium:   { eu_crm: true,  eu_srm: false, nato: false, doe: false, note:'EU CRM; CdTe solar panels' },
};

/* ══════════════════════════════════════════════════════════════════
   OECD EXPORT RESTRICTIONS — key export restriction events (updated from 2024/2025 OECD inventory)
   ══════════════════════════════════════════════════════════════════ */
const EXPORT_RESTRICTIONS = [
  { country:'China',       mineral:'Gallium',   type:'Export License',   date:'2023-08', note:'Expanded to holmium/erbium in 2025; immediate supply disruptions' },
  { country:'China',       mineral:'Germanium',  type:'Export License',   date:'2023-08', note:'Dual-use semiconductor applications; licensing requirement' },
  { country:'China',       mineral:'Graphite',   type:'Export License',   date:'2023-10', note:'Battery-grade natural graphite; EV supply chain impact' },
  { country:'China',       mineral:'Rare Earths',type:'Export Quota',     date:'2010',    note:'Quota system since 2010; ongoing production caps' },
  { country:'Indonesia',   mineral:'Nickel',     type:'Export Ban',       date:'2020-01', note:'Ore export ban; forced domestic processing' },
  { country:'Indonesia',   mineral:'Bauxite',    type:'Export Ban',       date:'2023-06', note:'Aluminium ore ban extended; WTO dispute ongoing' },
  { country:'Russia',      mineral:'Cobalt',     type:'Sanctions risk',   date:'2022-02', note:'Western sanctions exposure since Ukraine invasion' },
  { country:'DRC',         mineral:'Cobalt',     type:'Artisanal risk',   date:'ongoing', note:'Artisanal mining governance risks; Dodd-Frank conflict minerals' },
  { country:'Morocco',     mineral:'Phosphate',  type:'Strategic control',date:'ongoing', note:'OCP state monopoly controls ~70% of world reserves' },
];

/* ══════════════════════════════════════════════════════════════════
   KIMBERLEY PROCESS — rough diamond statistics (no key, public data)
   ══════════════════════════════════════════════════════════════════ */
const KP_STATS_2024 = [
  { country:'Russia',       production_mcts:14.5, value_usdm:1950, share_pct:27.4 },
  { country:'Botswana',     production_mcts:18.7, value_usdm:3820, share_pct:35.2 },
  { country:'Canada',       production_mcts:10.2, value_usdm:2010, share_pct:19.2 },
  { country:'Angola',       production_mcts:6.8,  value_usdm:1420, share_pct:12.8 },
  { country:'South Africa', production_mcts:4.1,  value_usdm:980,  share_pct:7.7  },
  { country:'DRC',          production_mcts:28.0, value_usdm:200,  share_pct:52.8 },
  { country:'Australia',    production_mcts:7.9,  value_usdm:290,  share_pct:14.9 },
  { country:'Namibia',      production_mcts:2.1,  value_usdm:650,  share_pct:4.0  },
  { country:'Zimbabwe',     production_mcts:4.8,  value_usdm:520,  share_pct:9.0  },
];

/* ══════════════════════════════════════════════════════════════════
   WORLD BANK PINK SHEET — live mineral commodity prices
   No API key required. Source 21 = Global Economic Monitor Commodities.
   ══════════════════════════════════════════════════════════════════ */
/* Mapping from mineral ID → World Bank commodity series ID */
const WB_MINERAL_PRICE_SERIES = {
  copper:    { series:'PCOPPER',  unit:'$/mt',  label:'Copper' },
  nickel:    { series:'PNICK',    unit:'$/mt',  label:'Nickel' },
  cobalt:    { series:'PCOBALT',  unit:'$/mt',  label:'Cobalt' },
  phosphate: { series:'PPHOPHR',  unit:'$/dmt', label:'Phosphate Rock' },
  lithium:   { series:'PLITHIUM', unit:'$/mt',  label:'Lithium' },
};

async function _mineralsGetLivePrices() {
  const cached = _minGet('wb_mineral_prices', 6*60*60*1000);
  if (cached) return cached;
  const results = {};
  await Promise.all(
    Object.entries(WB_MINERAL_PRICE_SERIES).map(async ([id, meta]) => {
      try {
        const url = `https://api.worldbank.org/v2/en/indicator/${meta.series}?format=json&mrv=3&source=21`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error(`WB HTTP ${res.status}`);
        const json = await res.json();
        const obs  = json?.[1];
        if (!Array.isArray(obs)) return;
        /* Find most recent non-null value */
        for (const o of obs) {
          if (o.value != null) {
            results[id] = { value: parseFloat(o.value), date: o.date, unit: meta.unit, label: meta.label };
            break;
          }
        }
      } catch(e) { console.warn('[minerals] WB price', id, e.message); }
    })
  );
  _minSet('wb_mineral_prices', results);
  return results;
}

/* ══════════════════════════════════════════════════════════════════
   RENDER HELPERS
   ══════════════════════════════════════════════════════════════════ */
function _minCriticalityBadges(flags) {
  const badges = [];
  if (flags.includes('EU_SRM')) badges.push('<span class="min-badge min-badge-srm">EU SRM</span>');
  if (flags.includes('EU_CRM')) badges.push('<span class="min-badge min-badge-crm">EU CRM</span>');
  if (flags.includes('NATO'))   badges.push('<span class="min-badge min-badge-nato">NATO</span>');
  if (flags.includes('DOE'))    badges.push('<span class="min-badge min-badge-doe">DOE</span>');
  if (flags.includes('USGS'))   badges.push('<span class="min-badge min-badge-usgs">USGS</span>');
  return badges.join('');
}

function _minImportBar(pct) {
  if (pct == null) return '';
  const color = pct >= 80 ? '#f85149' : pct >= 50 ? '#d29922' : '#3fb950';
  return `<div class="min-import-bar-wrap" title="Net import reliance: ${pct}%">
    <div class="min-import-bar" style="width:${pct}%;background:${color}"></div>
    <span class="min-import-pct" style="color:${color}">${pct}%</span>
  </div>`;
}

/* ══════════════════════════════════════════════════════════════════
   RENDER — supply-minerals enrichment
   ══════════════════════════════════════════════════════════════════ */
async function mineralsRenderAll() {
  await _mineralsRenderUSGS();
  _mineralsRenderExportRestrictions();
  _mineralsRenderGemstones();
}

async function _mineralsRenderUSGS() {
  const el = document.getElementById('supply-minerals-usgs');
  if (!el) return;

  let html = `<div class="av-live-badge">● USGS Mineral Commodity Summaries · Annual · World Bank Prices: Live</div>`;
  html += `<div class="av-note" style="margin:4px 0 8px">
    Production &amp; reserves: USGS MCS annual publication (public domain). Spot prices: World Bank Pink Sheet (live).
    EU criticality: <strong>EU CRM Act (CRMA) 2023/2024</strong> · Next review: <strong>2027</strong> ·
    <a href="https://ec.europa.eu/growth/tools-databases/rmis" target="_blank" rel="noopener" class="energy-entsog-link">RMIS JRC ↗</a>
  </div>`;
  html += `<div class="min-legend">
    <span class="min-badge min-badge-srm">EU SRM</span> EU Strategic Raw Material &nbsp;
    <span class="min-badge min-badge-crm">EU CRM</span> EU Critical Raw Material &nbsp;
    <span class="min-badge min-badge-nato">NATO</span> NATO Defence-Critical &nbsp;
    <span class="min-badge min-badge-doe">DOE</span> US Dept of Energy Critical &nbsp;
    <span class="min-badge min-badge-usgs">USGS</span> US Critical Mineral
  </div>`;

  for (const min of USGS_PRIORITY_MINERALS) {
    const stats = USGS_MCS_DATA[min.id];
    const eu    = EU_CRITICALITY[min.id] || {};
    if (!stats) continue;

    html += `<div class="min-mineral-card">
      <div class="min-card-header">
        <div class="min-card-icon">${min.icon}</div>
        <div class="min-card-title">
          <span class="min-card-name">${_minEsc(min.name)}</span>
          <span class="min-card-symbol">${_minEsc(min.symbol)}</span>
        </div>
        <div class="min-card-badges">${_minCriticalityBadges(min.criticalFlags)}</div>
      </div>
      <div class="min-card-body">
        <div class="min-stats-grid">
          ${stats.prod_world!=null ? `<div class="min-stat"><span class="min-stat-label">World Production</span><span class="min-stat-val">${Number(stats.prod_world).toLocaleString()} t/yr</span></div>` : ''}
          ${stats.prod_us!=null ? `<div class="min-stat"><span class="min-stat-label">US Production</span><span class="min-stat-val">${Number(stats.prod_us).toLocaleString()} t/yr</span></div>` : ''}
          ${stats.reserves!=null ? `<div class="min-stat"><span class="min-stat-label">World Reserves</span><span class="min-stat-val">${Number(stats.reserves).toLocaleString()} t</span></div>` : ''}
          ${WB_MINERAL_PRICE_SERIES[min.id]
            ? `<div class="min-stat"><span class="min-stat-label">Spot Price (WB)</span><span class="min-stat-val min-live-price" id="min-price-${_minEsc(min.id)}">Loading…</span></div>`
            : ''}
        </div>
        ${stats.import_reliance!=null ? `<div class="min-import-row"><span class="min-stat-label">US Net Import Reliance</span>${_minImportBar(stats.import_reliance)}</div>` : ''}
        <div class="min-producers">
          <span class="min-stat-label">Top Producers: </span>
          ${stats.top_producers.map(p=>`<span class="min-producer-chip">${_minEsc(p)}</span>`).join('')}
        </div>
        ${stats.note ? `<div class="min-note">${_minEsc(stats.note)}</div>` : ''}
        ${eu.note ? `<div class="min-eu-note">${_minEsc(eu.note)}</div>` : ''}
      </div>
    </div>`;
  }

  html += `<div class="av-note" style="margin-top:10px">
    Production/Reserves: <a href="https://pubs.usgs.gov/publication/mcs2026" target="_blank" rel="noopener" style="color:var(--accent)">USGS MCS 2026</a> (annual, public domain) ·
    Prices: <a href="https://www.worldbank.org/en/research/commodity-markets" target="_blank" rel="noopener" style="color:var(--accent)">World Bank Pink Sheet</a> (live) ·
    <a href="https://rmis.jrc.ec.europa.eu/critical-and-strategic-materials" target="_blank" rel="noopener" style="color:var(--accent)">EU RMIS Portal</a>
  </div>`;

  el.innerHTML = html;

  /* Fetch live prices from World Bank and populate price cells */
  const prices = await _mineralsGetLivePrices();
  for (const [id, p] of Object.entries(prices)) {
    const cell = el.querySelector(`#min-price-${id}`);
    if (!cell) continue;
    const formatted = p.value >= 1000
      ? `$${(p.value/1000).toFixed(2)}K/${p.unit.replace('$/','')} (${p.date})`
      : `$${p.value.toFixed(2)}/${p.unit.replace('$/','')} (${p.date})`;
    cell.textContent = formatted;
    cell.style.color = '#3fb950';
  }
  /* Mark cells with no WB data */
  el.querySelectorAll('.min-live-price').forEach(c => {
    if (c.textContent === 'Loading…') c.textContent = '— (no public live API)';
  });
}

function _mineralsRenderExportRestrictions() {
  const el = document.getElementById('supply-minerals-policy');
  if (!el) return;

  let html = `<div class="av-live-badge">● Export Restrictions & Policy Interventions — OECD Inventory 2024/2025</div>`;
  html += `<div class="av-note" style="margin-bottom:8px">Based on OECD Inventory of Export Restrictions on Industrial Raw Materials 2024/2025. Policy-driven supply constraints are first-class market signals.</div>`;
  html += `<div class="fin-table-wrap"><table class="fin-table">
    <thead><tr><th>Country</th><th>Mineral</th><th>Restriction Type</th><th>Since</th><th>Impact Note</th></tr></thead>
    <tbody>`;

  for (const r of EXPORT_RESTRICTIONS) {
    const cls = r.type.includes('Ban') ? 'neg' : r.type.includes('Quota') || r.type.includes('License') ? 'warn' : '';
    html += `<tr>
      <td>${_minEsc(r.country)}</td>
      <td><strong>${_minEsc(r.mineral)}</strong></td>
      <td class="${cls}">${_minEsc(r.type)}</td>
      <td>${_minEsc(r.date)}</td>
      <td style="font-size:10px;color:var(--text-muted)">${_minEsc(r.note)}</td>
    </tr>`;
  }
  html += `</tbody></table></div>`;
  html += `<div style="margin-top:8px">
    <a href="https://www.oecd.org/en/publications/oecd-inventory-of-export-restrictions-on-industrial-raw-materials-2025_facc714b-en.html" target="_blank" rel="noopener" class="energy-entsog-link">↗ OECD Export Restrictions Inventory 2025</a>
  </div>`;

  el.innerHTML = html;
}

function _mineralsRenderGemstones() {
  const el = document.getElementById('supply-minerals-gemstones');
  if (!el) return;

  let html = `<div class="av-live-badge">● Rough Diamond Production — Kimberley Process Statistics 2024</div>`;
  html += `<div class="av-note" style="margin-bottom:8px">Kimberley Process annual global summary. Covers rough diamonds (not polished; not colored gemstones). Production in million carats (Mcts) and value in USD millions.</div>`;

  const totalVal = KP_STATS_2024.reduce((s,r)=>s+r.value_usdm,0);
  html += `<div class="fin-table-wrap"><table class="fin-table">
    <thead><tr><th>Country</th><th>Production (Mcts)</th><th>Value (USD M)</th><th>Value/Carat</th></tr></thead>
    <tbody>`;

  const sorted = [...KP_STATS_2024].sort((a,b)=>b.value_usdm-a.value_usdm);
  for (const r of sorted) {
    const valPerCarat = r.production_mcts > 0 ? (r.value_usdm*1e6/(r.production_mcts*1e6)).toFixed(0) : '—';
    html += `<tr>
      <td>${_minEsc(r.country)}</td>
      <td>${_minFmt(r.production_mcts,1)}</td>
      <td>$${Number(r.value_usdm).toLocaleString()}</td>
      <td>$${valPerCarat}/ct</td>
    </tr>`;
  }
  html += `</tbody></table></div>`;
  html += `<div class="metric-row" style="margin-top:8px">
    <span class="metric-label">Total value tracked (2024)</span>
    <span class="metric-value">$${Number(totalVal).toLocaleString()}M</span>
  </div>`;
  html += `<div style="margin-top:8px">
    <a href="https://kimberleyprocessstatistics.org/public_statistics" target="_blank" rel="noopener" class="energy-entsog-link">↗ Kimberley Process Public Statistics</a>
    &nbsp;
    <a href="https://www.usgs.gov/centers/national-minerals-information-center/gemstones" target="_blank" rel="noopener" class="energy-entsog-link">↗ USGS Gemstones Data</a>
  </div>`;

  el.innerHTML = html;
}

/* ══════════════════════════════════════════════════════════════════
   INJECT MINERALS SECTIONS INTO supply-minerals tab
   ══════════════════════════════════════════════════════════════════ */
function mineralsInjectSections() {
  const parent = document.getElementById('supply-minerals');
  if (!parent || document.getElementById('supply-minerals-usgs')) return;

  /* Create MINERALS sub-tab navigation */
  const nav = document.createElement('div');
  nav.className = 'min-subnav';
  nav.innerHTML = `
    <button class="min-subnav-btn active" onclick="minShowSection('usgs',this)">🔬 Critical Minerals</button>
    <button class="min-subnav-btn" onclick="minShowSection('policy',this)">📜 Export Restrictions</button>
    <button class="min-subnav-btn" onclick="minShowSection('gemstones',this)">💎 Gemstones</button>
  `;

  const usgsDiv  = document.createElement('div'); usgsDiv.id = 'supply-minerals-usgs';   usgsDiv.className = 'min-section active';
  const polDiv   = document.createElement('div'); polDiv.id  = 'supply-minerals-policy';  polDiv.className = 'min-section';
  const gemDiv   = document.createElement('div'); gemDiv.id  = 'supply-minerals-gemstones'; gemDiv.className = 'min-section';

  parent.appendChild(nav);
  parent.appendChild(usgsDiv);
  parent.appendChild(polDiv);
  parent.appendChild(gemDiv);

  mineralsRenderAll();
}

window.minShowSection = function(id, btn) {
  document.querySelectorAll('.min-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.min-subnav-btn').forEach(b => b.classList.remove('active'));
  const el = document.getElementById(`supply-minerals-${id}`);
  if (el) el.classList.add('active');
  if (btn) btn.classList.add('active');
};

document.addEventListener('DOMContentLoaded', () => {
  /* Try to inject immediately if element exists, or after tab click */
  setTimeout(mineralsInjectSections, 500);
  document.addEventListener('click', e => {
    if (e.target.dataset?.tab === 'minerals' || e.target.closest?.('[data-tab="minerals"]')) {
      setTimeout(mineralsInjectSections, 100);
    }
  });
});

window.mineralsInjectSections = mineralsInjectSections;
window.mineralsRenderAll = mineralsRenderAll;
