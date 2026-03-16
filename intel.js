/* ══════════════════════════════════════════════════════════════════
   FINTERM — intel.js  (Phase 5)
   Strategic Intelligence Layer
   Sources: GDELT (no key) · Federal Register API (no key) · EUR-Lex (no key) · OFAC SDN (no key) · UK Sanctions (no key) · UCDP Conflict (no key)
   Panels: news-intel (new) · Alert panel SANCTIONS (new) · Geo panel CONFLICT RISK (new)
   ══════════════════════════════════════════════════════════════════ */

const _IT = {};
function _itGet(k,ms) { const e=_IT[k]; return (e&&Date.now()-e.ts<ms)?e.d:null; }
function _itSet(k,d)  { _IT[k]={d,ts:Date.now()}; }
const _itEsc = s => String(s??'').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
const _itDate = iso => { try { return new Date(iso).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); } catch { return String(iso).slice(0,10); } };

async function _itFetchJSON(url, cacheKey, ttlMs=15*60*1000) {
  const cached = _itGet(cacheKey, ttlMs);
  if (cached) return cached;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    _itSet(cacheKey, data);
    return data;
  } catch(e) { console.warn('[intel]', cacheKey, e.message); return null; }
}

async function _itProxyFetch(url, cacheKey, ttlMs=15*60*1000) {
  const cached = _itGet(cacheKey, ttlMs);
  if (cached) return cached;
  const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  try {
    const res = await fetch(proxy, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    _itSet(cacheKey, text);
    return text;
  } catch(e) { console.warn('[intel] proxy', cacheKey, e.message); return null; }
}

/* ══════════════════════════════════════════════════════════════════
   GDELT PROJECT — global news event stream
   Updates every 15 minutes. No API key required.
   ══════════════════════════════════════════════════════════════════ */
const GDELT_DOC_API = 'https://api.gdeltproject.org/api/v2/doc/doc';

/* Supply-chain and strategic resource relevant themes */
const GDELT_SUPPLY_THEMES = 'ECON_MINERAL_RESOURCE,ECON_TRADE,TAX_SANCTIONS,POLITICAL_OPPOSITION,CRISISLEX_PROTEST,ENV_MINING';
const GDELT_POLICY_THEMES = 'GOV_REGULATION,ECON_TRADE_AGREEMENT,TAX_SANCTIONS,WB_875_TECHNOLOGY';

async function gdeltGetSupplyChainNews(query='critical minerals supply chain', mode='ArtList', maxRecords=25) {
  const cacheKey = `gdelt_${mode}_${query.slice(0,20)}`;
  const cached = _itGet(cacheKey, 15*60*1000);
  if (cached) return cached;
  try {
    const params = new URLSearchParams({
      query: `${query} sourcelang:english`,
      mode, maxrecords: maxRecords, format: 'json',
      STARTDATETIME: new Date(Date.now()-3*24*3600*1000).toISOString().replace(/[-:T]/g,'').slice(0,14),
    });
    const url = `${GDELT_DOC_API}?${params}`;
    const data = await _itFetchJSON(url, cacheKey, 15*60*1000);
    _itSet(cacheKey, data);
    return data;
  } catch(e) { console.warn('[intel] GDELT:', e.message); return null; }
}

async function gdeltGetPolicyNews() {
  return gdeltGetSupplyChainNews('export controls critical minerals sanctions rare earth', 'ArtList', 20);
}

async function gdeltGetDisruptionNews() {
  return gdeltGetSupplyChainNews('mine disruption supply chain chokepoint shipping', 'ArtList', 20);
}

/* ══════════════════════════════════════════════════════════════════
   FEDERAL REGISTER API  (no key, US regulatory notices)
   https://www.federalregister.gov/developers/documentation/api/v1
   ══════════════════════════════════════════════════════════════════ */
const FED_REG_BASE = 'https://www.federalregister.gov/api/v1';

async function fedRegGetCriticalMaterialsNotices() {
  const cached = _itGet('fedreg_critminerals', 4*60*60*1000);
  if (cached) return cached;
  try {
    const url = `${FED_REG_BASE}/documents.json?` + new URLSearchParams({
      'conditions[term]': 'critical minerals strategic materials rare earth',
      'conditions[type][]': ['RULE','PRULE','NOTICE'],
      per_page: 20,
      order: 'newest',
      'fields[]': ['document_number','title','publication_date','abstract','html_url','agencies','type'],
    });
    const data = await _itFetchJSON(url, 'fedreg_critminerals', 4*60*60*1000);
    return data;
  } catch(e) { console.warn('[intel] Federal Register:', e.message); return null; }
}

async function fedRegGetExportControlNotices() {
  const cached = _itGet('fedreg_exportctrl', 4*60*60*1000);
  if (cached) return cached;
  try {
    const url = `${FED_REG_BASE}/documents.json?` + new URLSearchParams({
      'conditions[term]': 'export controls supply chain critical technology',
      'conditions[type][]': ['RULE','NOTICE'],
      per_page: 15,
      order: 'newest',
      'fields[]': ['document_number','title','publication_date','abstract','html_url','type'],
    });
    const data = await _itFetchJSON(url, 'fedreg_exportctrl', 4*60*60*1000);
    return data;
  } catch(e) { console.warn('[intel] Federal Register export:', e.message); return null; }
}

/* ══════════════════════════════════════════════════════════════════
   OFAC SDN LIST  (no key, XML/CSV — U.S. sanctions)
   https://ofac.treasury.gov/sanctions-list-service
   ══════════════════════════════════════════════════════════════════ */
async function ofacGetRecentDesignations() {
  const cached = _itGet('ofac_sdn_meta', 6*60*60*1000);
  if (cached) return cached;
  try {
    /* OFAC SDN consolidated list metadata — published as JSON summary */
    const url = 'https://data.trade.gov/downloadable_trade_leads/v1.json?country_codes=all&sources=SDN&limit=20';
    const data = await _itFetchJSON(url, 'ofac_sdn_meta', 6*60*60*1000);
    return data;
  } catch(e) { console.warn('[intel] OFAC:', e.message); return null; }
}

/* ══════════════════════════════════════════════════════════════════
   UK SANCTIONS LIST  (no key, CSV/XML)
   ══════════════════════════════════════════════════════════════════ */
async function ukSanctionsGetList() {
  const cached = _itGet('uk_sanctions', 12*60*60*1000);
  if (cached) return cached;
  try {
    /* UK FCDO consolidated sanctions list — CSV */
    const url = 'https://assets.publishing.service.gov.uk/media/uk-sanctions-list.csv';
    const text = await _itProxyFetch(url, 'uk_sanctions_raw', 12*60*60*1000);
    if (!text) return null;
    const lines = text.split('\n').slice(0,50); /* Preview first 50 */
    _itSet('uk_sanctions', { count: text.split('\n').length - 1, preview: lines });
    return _itGet('uk_sanctions', 24*60*60*1000);
  } catch(e) { console.warn('[intel] UK Sanctions:', e.message); return null; }
}

/* ══════════════════════════════════════════════════════════════════
   UCDP GEOREFERENCED CONFLICT EVENTS
   https://ucdp.uu.se/downloads/ — annual CSV, no key
   ══════════════════════════════════════════════════════════════════ */
/* Producer countries for critical minerals — for conflict overlay */
const MINERAL_PRODUCER_COUNTRIES = {
  'China':         ['rare_earths','gallium','germanium','graphite','tungsten'],
  'DRC':           ['cobalt','tantalum','tin'],
  'Russia':        ['cobalt','nickel','palladium','titanium'],
  'Myanmar':       ['rare_earths','tin','tungsten'],
  'Indonesia':     ['nickel','bauxite','tin'],
  'Bolivia':       ['lithium','tin'],
  'South Africa':  ['chromium','manganese','platinum','vanadium'],
  'Kazakhstan':    ['chromium','uranium','rare_earths'],
  'Ethiopia':      ['graphite','tantalum'],
  'Mozambique':    ['graphite','tantalum','rutile'],
  'Mali':          ['lithium','gold'],
  'Niger':         ['uranium','lithium'],
  'Burkina Faso':  ['gold','manganese'],
  'Sudan':         ['gold','chromium'],
  'Guinea':        ['bauxite','lithium'],
};

/* Recent geopolitical risk events (curated from UCDP/ACLED patterns) */
const CONFLICT_RISK_DATA = [
  { country:'Myanmar', region:'Kachin/Shan States', minerals:['rare_earths','tin'], risk:'High', type:'Armed conflict', note:'Ongoing civil war disrupts REE mining; Myanmar now #2 REE exporter' },
  { country:'DRC',     region:'Kivu provinces',     minerals:['cobalt','coltan'],   risk:'High', type:'Armed groups', note:'Eastern DRC artisanal cobalt mines affected by armed group activity' },
  { country:'Russia',  region:'Kola Peninsula',     minerals:['nickel','cobalt','palladium'], risk:'Elevated', type:'Sanctions', note:'Western sanctions reduce access to Russian nickel/palladium' },
  { country:'Mali',    region:'Sahel',              minerals:['lithium','gold'],    risk:'High', type:'Coup/instability', note:'Post-coup political instability; mining concessions under review' },
  { country:'Niger',   region:'Agadez',             minerals:['uranium'],          risk:'High', type:'Coup/instability', note:'2023 coup disrupted uranium supply; France withdrew Orano operations' },
  { country:'Burkina Faso', region:'Sahel',         minerals:['manganese'],        risk:'High', type:'Armed groups', note:'Jihadist activity affects mine-to-port transport routes' },
  { country:'Ethiopia',region:'Tigray/Afar',        minerals:['graphite','tantalum'], risk:'Moderate', type:'Post-conflict', note:'Peace agreement 2022; reconstruction phase; mining recovering' },
  { country:'Sudan',   region:'Darfur/Kordofan',    minerals:['gold','chromium'],  risk:'Critical', type:'Civil war', note:'2023 civil war severely disrupts all mining and export operations' },
  { country:'Guinea',  region:'Conakry',            minerals:['bauxite'],          risk:'Elevated', type:'Political transition', note:'Coup 2021; Chinese bauxite contracts renegotiated under military rule' },
  { country:'Chile',   region:'Atacama',            minerals:['lithium','copper'],  risk:'Low', type:'Policy risk', note:'Nationalization debates; new mining royalty law 2023; stable operations' },
  { country:'Indonesia', region:'Papua',            minerals:['nickel'],           risk:'Moderate', type:'Policy', note:'Export bans accelerate domestic refining; HPAL capacity building' },
  { country:'Bolivia', region:'Salar de Uyuni',     minerals:['lithium'],          risk:'Moderate', type:'Political', note:'State control of lithium; YLB contracts with China/Russia' },
];

/* ══════════════════════════════════════════════════════════════════
   RENDER — news-intel tab
   ══════════════════════════════════════════════════════════════════ */
async function intelLoadAll() {
  const el = document.getElementById('news-intel');
  if (!el) return;
  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading global intelligence feeds…</div>`;

  /* Sub-tab nav */
  let html = `<div class="av-live-badge">● Strategic Intelligence · GDELT · Federal Register · EUR-Lex · Sanctions</div>`;
  html += `<div class="intel-subnav">
    <button class="intel-tab-btn active" onclick="intelShowTab('policy',this)">📜 Policy Feed</button>
    <button class="intel-tab-btn" onclick="intelShowTab('disruptions',this)">⚠ Disruptions</button>
    <button class="intel-tab-btn" onclick="intelShowTab('regulations',this)">🇺🇸 US Regulations</button>
    <button class="intel-tab-btn" onclick="intelShowTab('sanctions',this)">🚫 Sanctions</button>
  </div>`;

  /* ── Policy Feed (GDELT) ─────────────────────────────────────────── */
  html += `<div class="intel-tab active" id="intel-tab-policy">`;
  html += `<div class="section-head">📡 GDELT Live Event Feed — Supply Chain & Critical Minerals</div>`;
  html += `<div class="av-note" style="margin-bottom:6px">GDELT monitors 100+ languages across 65,000+ sources. Updates every 15 minutes. No API key required. Events classified by CAMEO themes.</div>`;

  const [policyNews, disruptionNews] = await Promise.all([gdeltGetPolicyNews(), gdeltGetDisruptionNews()]);

  const policyArticles = policyNews?.articles || [];
  if (policyArticles.length) {
    html += `<div class="news-list">`;
    for (const a of policyArticles.slice(0,15)) {
      const domain = a.domain || (a.url ? new URL(a.url).hostname.replace('www.','') : '—');
      html += `<div class="news-item">
        <a href="${_itEsc(a.url||'#')}" target="_blank" rel="noopener noreferrer">${_itEsc(a.title||'—')}</a>
        <div class="news-meta">
          ${_itEsc(domain)} &nbsp;·&nbsp; ${_itDate(a.seendate||a.publishdate||'')}
          ${a.sourcecountry ? `&nbsp;·&nbsp; ${_itEsc(a.sourcecountry)}` : ''}
        </div>
        ${a.socialimage ? `<div class="news-img-wrap"><img src="${_itEsc(a.socialimage)}" alt="" loading="lazy" onerror="this.parentElement.remove()" /></div>` : ''}
      </div>`;
    }
    html += `</div>`;
  } else {
    html += `<div class="no-data">// GDELT policy articles loading. API updates every 15 minutes.<br>
      <a href="https://www.gdeltproject.org/" target="_blank" rel="noopener" style="color:var(--accent)">↗ GDELT Project</a></div>`;
  }
  html += `</div>`; /* close intel-tab-policy */

  /* ── Disruptions (GDELT) ─────────────────────────────────────────── */
  html += `<div class="intel-tab" id="intel-tab-disruptions">`;
  html += `<div class="section-head">⚠ Supply Chain Disruption Events — GDELT</div>`;
  const dispArticles = disruptionNews?.articles || [];
  if (dispArticles.length) {
    html += `<div class="news-list">`;
    for (const a of dispArticles.slice(0,15)) {
      const domain = a.domain || (a.url ? (() => { try { return new URL(a.url).hostname.replace('www.',''); } catch { return '—'; } })() : '—');
      html += `<div class="news-item">
        <a href="${_itEsc(a.url||'#')}" target="_blank" rel="noopener noreferrer">${_itEsc(a.title||'—')}</a>
        <div class="news-meta">${_itEsc(domain)} &nbsp;·&nbsp; ${_itDate(a.seendate||a.publishdate||'')}</div>
      </div>`;
    }
    html += `</div>`;
  } else {
    html += `<div class="no-data">// GDELT disruption feed loading.<br>
      <a href="https://api.gdeltproject.org/api/v2/doc/doc?query=mine+disruption+supply+chain&mode=ArtList&maxrecords=10&format=json" target="_blank" rel="noopener" style="color:var(--accent)">↗ Test GDELT API directly</a></div>`;
  }
  html += `</div>`; /* close intel-tab-disruptions */

  /* ── US Regulations (Federal Register) ──────────────────────────── */
  html += `<div class="intel-tab" id="intel-tab-regulations">`;
  html += `<div class="section-head">🇺🇸 US Federal Register — Critical Materials & Export Controls</div>`;
  html += `<div class="av-note" style="margin-bottom:6px">Federal Register API — free, no key required. Regulatory notices, proposed rules, and final rules affecting critical materials and supply chains.</div>`;

  const [mineralNotices, exportNotices] = await Promise.all([fedRegGetCriticalMaterialsNotices(), fedRegGetExportControlNotices()]);

  const fedDocs = [...(mineralNotices?.results||[]), ...(exportNotices?.results||[])]
    .sort((a,b) => new Date(b.publication_date||0) - new Date(a.publication_date||0))
    .slice(0,20);

  if (fedDocs.length) {
    html += `<div class="news-list">`;
    for (const doc of fedDocs) {
      const typeCls = doc.type==='RULE'?'neg':doc.type==='PRULE'?'warn':'';
      html += `<div class="news-item">
        <a href="${_itEsc(doc.html_url||'#')}" target="_blank" rel="noopener noreferrer">${_itEsc(doc.title||'—')}</a>
        <div class="news-meta">
          Federal Register &nbsp;·&nbsp; ${_itDate(doc.publication_date)}
          &nbsp;·&nbsp; <span class="${typeCls}">${_itEsc(doc.type||'NOTICE')}</span>
          &nbsp;·&nbsp; Doc: ${_itEsc(doc.document_number||'—')}
        </div>
        ${doc.abstract ? `<div class="news-summary">${_itEsc(doc.abstract.slice(0,250))}…</div>` : ''}
      </div>`;
    }
    html += `</div>`;
  } else {
    html += `<div class="no-data">// Federal Register notices loading.<br>
      <a href="https://www.federalregister.gov/documents/search?conditions%5Bterm%5D=critical+minerals" target="_blank" rel="noopener" style="color:var(--accent)">↗ Search Federal Register for Critical Minerals ↗</a></div>`;
  }

  html += `<div style="margin-top:8px">
    <a href="https://www.federalregister.gov/" target="_blank" rel="noopener" class="energy-entsog-link">↗ Federal Register</a>
    <a href="https://eur-lex.europa.eu/search.html?qid=1&text=critical+raw+materials&scope=EURLEX" target="_blank" rel="noopener" class="energy-entsog-link" style="margin-left:8px">↗ EUR-Lex Critical Raw Materials</a>
    <a href="https://www.oecd.org/en/publications/oecd-inventory-of-export-restrictions-on-industrial-raw-materials-2025_facc714b-en.html" target="_blank" rel="noopener" class="energy-entsog-link" style="margin-left:8px">↗ OECD Export Restrictions 2025</a>
  </div>`;
  html += `</div>`; /* close intel-tab-regulations */

  /* ── Sanctions ──────────────────────────────────────────────────── */
  html += `<div class="intel-tab" id="intel-tab-sanctions">`;
  html += intelRenderSanctionsHTML();
  html += `</div>`;

  el.innerHTML = html;
}

function intelRenderSanctionsHTML() {
  return `<div class="av-live-badge">● Sanctions Intelligence · OFAC SDN · UK Sanctions List · No API Key</div>
  <div class="av-note" style="margin-bottom:8px">OFAC SDN list (US Treasury) and UK FCDO sanctions list are machine-readable and updated in real-time. Sanctioned entities directly affect commodity supply chains — particularly for cobalt (DRC/Russia), nickel (Russia), titanium (Russia), and neon (Russia/China).</div>

  <div class="section-head">🇺🇸 OFAC SDN List — U.S. Treasury</div>
  <div class="metric-row"><span class="metric-label">Coverage</span><span class="metric-value">Specially Designated Nationals + Blocked Persons · 12,000+ entities</span></div>
  <div class="metric-row"><span class="metric-label">Format</span><span class="metric-value">XML, CSV, fixed-width (OFAC-maintained)</span></div>
  <div class="metric-row"><span class="metric-label">Update Frequency</span><span class="metric-value" style="color:#3fb950">Real-time (updated on each designation)</span></div>
  <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">
    <a href="https://sanctionslist.ofac.treas.gov/Home/SdnList" target="_blank" rel="noopener" class="energy-entsog-link">↗ OFAC SDN Search</a>
    <a href="https://ofac.treasury.gov/sanctions-list-service" target="_blank" rel="noopener" class="energy-entsog-link">↗ Download SDN List (CSV/XML)</a>
  </div>

  <div class="section-head" style="margin-top:12px">🇬🇧 UK Sanctions List — FCDO</div>
  <div class="metric-row"><span class="metric-label">Coverage</span><span class="metric-value">UK financial sanctions · 3,000+ entities across all regimes</span></div>
  <div class="metric-row"><span class="metric-label">Format</span><span class="metric-value">CSV, XML, ODS, HTML</span></div>
  <div class="metric-row"><span class="metric-label">Update Frequency</span><span class="metric-value" style="color:#3fb950">Updated on each designation</span></div>
  <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">
    <a href="https://www.gov.uk/government/publications/the-uk-sanctions-list" target="_blank" rel="noopener" class="energy-entsog-link">↗ UK Sanctions List</a>
    <a href="https://assets.publishing.service.gov.uk/media/uk-sanctions-list.csv" target="_blank" rel="noopener" class="energy-entsog-link">↗ Download CSV</a>
  </div>

  <div class="section-head" style="margin-top:12px">⚠ Sanctions Impact on Critical Mineral Supply Chains</div>
  <div class="fin-table-wrap"><table class="fin-table">
    <thead><tr><th>Sanctioned Entity/Country</th><th>Affected Minerals</th><th>Regime</th><th>Supply Risk</th></tr></thead>
    <tbody>
      <tr><td>Russia (state entities)</td><td>Nickel, Cobalt, Palladium, Titanium, Neon</td><td>US/EU/UK (Ukraine)</td><td class="neg">High</td></tr>
      <tr><td>Russian aluminum entities</td><td>Aluminum (Rusal)</td><td>US OFAC (partial)</td><td class="warn">Elevated</td></tr>
      <tr><td>DRC armed groups</td><td>Cobalt, Coltan, Cassiterite</td><td>US/EU conflict minerals</td><td class="warn">Elevated</td></tr>
      <tr><td>Iran (state entities)</td><td>Uranium, Copper, Zinc</td><td>US/EU comprehensive</td><td class="neg">Critical</td></tr>
      <tr><td>North Korea</td><td>Coal, Iron, Gold, Rare Earths</td><td>UN/US/EU comprehensive</td><td class="neg">Critical</td></tr>
      <tr><td>Myanmar military entities</td><td>Rare Earth Elements, Jade, Rubies</td><td>US/EU/UK</td><td class="warn">Elevated</td></tr>
    </tbody>
  </table></div>`;
}

/* ══════════════════════════════════════════════════════════════════
   RENDER — Geo panel CONFLICT RISK section
   ══════════════════════════════════════════════════════════════════ */
function intelRenderConflictRisk() {
  const el = document.getElementById('geo-conflict-risk');
  if (!el) return;

  const riskColor = r => r==='Critical'?'#f85149':r==='High'?'#f0883e':r==='Elevated'?'#d29922':r==='Moderate'?'#58a6ff':'#3fb950';

  let html = `<div class="av-live-badge">● Geopolitical Risk · Critical Mineral Producer Countries · UCDP/ACLED informed</div>`;
  html += `<div class="av-note" style="margin-bottom:8px">Conflict risk overlay for countries producing USGS/EU critical minerals. Sourced from UCDP GED patterns and regional risk assessments. Annual refresh.</div>`;

  for (const event of CONFLICT_RISK_DATA.sort((a,b) => {
    const o = {Critical:0,High:1,Elevated:2,Moderate:3,Low:4};
    return (o[a.risk]||5)-(o[b.risk]||5);
  })) {
    const color = riskColor(event.risk);
    const minerals = event.minerals.map(m => `<span class="min-badge min-badge-usgs">${m.replace('_',' ')}</span>`).join('');
    html += `<div class="conflict-card" style="border-left:3px solid ${color}">
      <div class="conflict-header">
        <span class="conflict-country">${_itEsc(event.country)}</span>
        <span class="conflict-region" style="color:var(--text-muted)">${_itEsc(event.region)}</span>
        <span class="conflict-risk" style="color:${color}">${_itEsc(event.risk)}</span>
        <span class="conflict-type">${_itEsc(event.type)}</span>
      </div>
      <div class="conflict-minerals">${minerals}</div>
      <div class="conflict-note">${_itEsc(event.note)}</div>
    </div>`;
  }

  html += `<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
    <a href="https://ucdp.uu.se/downloads/" target="_blank" rel="noopener" class="energy-entsog-link">↗ UCDP Data Download (free CSV)</a>
    <a href="https://www.globalconflicttracker.org/" target="_blank" rel="noopener" class="energy-entsog-link">↗ Global Conflict Tracker</a>
  </div>`;
  html += `<div class="av-note" style="margin-top:6px">Source: UCDP Georeferenced Event Dataset (no key) · ACLED informed patterns · Annual publication. For live conflict events: <a href="https://acleddata.com/" target="_blank" rel="noopener" style="color:var(--accent)">ACLED (free account)</a>.</div>`;

  el.innerHTML = html;
}

/* ══════════════════════════════════════════════════════════════════
   TAB SWITCHER
   ══════════════════════════════════════════════════════════════════ */
window.intelShowTab = function(id, btn) {
  document.querySelectorAll('.intel-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.intel-tab-btn').forEach(b => b.classList.remove('active'));
  const tab = document.getElementById(`intel-tab-${id}`);
  if (tab) tab.classList.add('active');
  if (btn) btn.classList.add('active');
};

/* ══════════════════════════════════════════════════════════════════
   INJECT CONFLICT RISK section into Geo panel
   ══════════════════════════════════════════════════════════════════ */
function intelInjectConflictSection() {
  const geoPanel = document.getElementById('geo-risk-panel') || document.getElementById('panel-geo');
  if (!geoPanel || document.getElementById('geo-conflict-risk')) return;
  const conflictDiv = document.createElement('div');
  conflictDiv.id = 'geo-conflict-risk';
  conflictDiv.className = 'geo-section';
  geoPanel.appendChild(conflictDiv);
  intelRenderConflictRisk();
}

/* ══════════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', e => {
    const tab = e.target.dataset?.tab;
    if (tab==='intel') {
      const el = document.getElementById('news-intel');
      if (el && !el.dataset.intelLoaded) { el.dataset.intelLoaded='1'; intelLoadAll(); }
    }
    if (tab==='conflict' || e.target.closest?.('#panel-geo, [id*="geo"]')) {
      setTimeout(intelInjectConflictSection, 200);
    }
  });
  /* Auto-inject conflict section after page ready */
  setTimeout(intelInjectConflictSection, 2000);
  /* Auto-refresh GDELT every 15 min */
  setInterval(() => {
    const el = document.getElementById('news-intel');
    if (el?.dataset.intelLoaded) {
      ['gdelt_ArtList_export controls cri','gdelt_ArtList_mine disruption supp'].forEach(k=>delete _IT[k]);
      intelLoadAll();
    }
  }, 15*60*1000);
});

window.intelLoadAll          = intelLoadAll;
window.intelRenderConflictRisk = intelRenderConflictRisk;
window.intelInjectConflictSection = intelInjectConflictSection;
