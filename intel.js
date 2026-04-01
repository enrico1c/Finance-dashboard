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

/* Mineral producer country monitoring list — used for live GDELT queries */
/* CONFLICT_RISK_DATA removed: now fetched live from GDELT per country */

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

  /* Kick off async live sanctions feed now that DOM is ready */
  intelLoadSanctionsImpact();
}

function intelRenderSanctionsHTML() {
  return `<div class="av-live-badge">● Sanctions Intelligence · OFAC SDN · UK Sanctions List · Federal Register · No API Key</div>
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

  <div class="section-head" style="margin-top:12px">📡 Live Sanctions & Export Control Notices — Federal Register</div>
  <div id="sanctions-live-impact"><div class="av-loading"><span class="av-spinner"></span>Loading live sanctions notices…</div></div>`;
}

async function intelLoadSanctionsImpact() {
  const el = document.getElementById('sanctions-live-impact');
  if (!el) return;
  try {
    const [sanctionsData, exportData, gdeltSanctions] = await Promise.all([
      fedRegGetCriticalMaterialsNotices(),
      fedRegGetExportControlNotices(),
      gdeltGetSupplyChainNews('sanctions minerals export ban supply chain critical', 'ArtList', 10),
    ]);

    let html = '';

    /* Federal Register — recent sanctions/export control notices */
    const fedDocs = [
      ...(sanctionsData?.results || []),
      ...(exportData?.results || []),
    ].sort((a,b) => new Date(b.publication_date) - new Date(a.publication_date)).slice(0, 8);

    if (fedDocs.length) {
      html += `<div class="news-list">`;
      for (const doc of fedDocs) {
        const type = doc.type === 'RULE' ? '📜 Final Rule' : doc.type === 'PRULE' ? '📋 Proposed Rule' : '📢 Notice';
        const agencies = (doc.agencies || []).map(a => a.name || a.raw_name || '').filter(Boolean).join(', ');
        html += `<div class="news-item">
          <a href="${_itEsc(doc.html_url||'#')}" target="_blank" rel="noopener noreferrer">${_itEsc(doc.title||'—')}</a>
          <div class="news-meta">
            ${type} &nbsp;·&nbsp; ${_itDate(doc.publication_date||'')}
            ${agencies ? `&nbsp;·&nbsp; ${_itEsc(agencies)}` : ''}
          </div>
          ${doc.abstract ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px">${_itEsc(doc.abstract.slice(0,180))}…</div>` : ''}
        </div>`;
      }
      html += `</div>`;
    } else {
      html += `<div class="no-data">// Federal Register data loading…</div>`;
    }

    /* GDELT sanctions news */
    const gdeltArts = gdeltSanctions?.articles || [];
    if (gdeltArts.length) {
      html += `<div class="section-head" style="margin-top:10px">📰 Live Sanctions News — GDELT</div><div class="news-list">`;
      for (const a of gdeltArts.slice(0, 5)) {
        const domain = a.domain || (() => { try { return new URL(a.url||'').hostname.replace('www.',''); } catch { return '—'; } })();
        html += `<div class="news-item">
          <a href="${_itEsc(a.url||'#')}" target="_blank" rel="noopener noreferrer">${_itEsc(a.title||'—')}</a>
          <div class="news-meta">${_itEsc(domain)} · ${_itDate(a.seendate||a.publishdate||'')}</div>
        </div>`;
      }
      html += `</div>`;
    }

    html += `<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
      <a href="https://www.federalregister.gov/" target="_blank" rel="noopener" class="energy-entsog-link">↗ Federal Register</a>
      <a href="https://ofac.treasury.gov/" target="_blank" rel="noopener" class="energy-entsog-link">↗ OFAC</a>
    </div>`;

    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = `<div class="no-data">// Sanctions feed error: ${_itEsc(e.message)}</div>`;
  }
}

/* ══════════════════════════════════════════════════════════════════
   RENDER — Geo panel CONFLICT RISK section (GDELT live)
   ══════════════════════════════════════════════════════════════════ */
async function intelRenderConflictRisk() {
  const el = document.getElementById('geo-conflict-risk');
  if (!el) return;

  el.innerHTML = '<div class="av-loading"><span class="av-spinner"></span>Loading live conflict intelligence from GDELT…</div>';

  try {
    const countries = Object.keys(MINERAL_PRODUCER_COUNTRIES);
    const countryQ  = countries.map(c => `"${c}"`).join(' OR ');
    const query     = `(${countryQ}) (conflict OR military OR sanctions OR "export ban" OR coup OR instability OR mining) sourcelang:english`;
    const data      = await gdeltGetSupplyChainNews(query, 'ArtList', 30);
    const articles  = data?.articles || [];

    let html = `<div class="av-live-badge">● GDELT Live · Critical Mineral Producer Countries · Conflict & Risk Events · Updates every 15 min</div>`;
    html += `<div class="av-note" style="margin-bottom:8px">Live news events from GDELT covering ${countries.length} critical mineral producer countries. GDELT monitors 100+ languages across 65,000+ sources worldwide.</div>`;

    if (!articles.length) {
      html += `<div class="no-data">// No recent events detected via GDELT. API updates every 15 minutes.<br>
        <a href="https://api.gdeltproject.org/" target="_blank" rel="noopener" style="color:var(--accent)">↗ GDELT Project</a></div>`;
      el.innerHTML = html;
      return;
    }

    /* Group articles by detected mineral producer country */
    const byCountry = {};
    for (const a of articles) {
      const text = ((a.title || '') + ' ' + (a.url || '')).toLowerCase();
      let matched = null;
      for (const country of countries) {
        if (text.includes(country.toLowerCase())) { matched = country; break; }
      }
      const key = matched || '_other';
      if (!byCountry[key]) byCountry[key] = [];
      byCountry[key].push(a);
    }

    /* Render matched countries */
    let hasCountry = false;
    for (const country of countries) {
      const arts = byCountry[country];
      if (!arts?.length) continue;
      hasCountry = true;
      const minerals = (MINERAL_PRODUCER_COUNTRIES[country] || [])
        .map(m => `<span class="min-badge min-badge-usgs">${_itEsc(m.replace(/_/g,' '))}</span>`).join('');
      html += `<div class="conflict-card" style="border-left:3px solid #f0883e;margin-bottom:6px">
        <div class="conflict-header">
          <span class="conflict-country">${_itEsc(country)}</span>
          <span style="margin-left:8px;font-size:10px;color:var(--text-muted)">${arts.length} live event${arts.length>1?'s':''} · GDELT</span>
        </div>
        <div class="conflict-minerals">${minerals}</div>`;
      for (const a of arts.slice(0, 2)) {
        const domain = a.domain || (() => { try { return new URL(a.url||'').hostname.replace('www.',''); } catch { return '—'; } })();
        html += `<div class="news-item" style="padding:3px 0;border-bottom:1px solid var(--border)">
          <a href="${_itEsc(a.url||'#')}" target="_blank" rel="noopener noreferrer" style="font-size:11px">${_itEsc(a.title||'—')}</a>
          <div class="news-meta">${_itEsc(domain)} · ${_itDate(a.seendate||a.publishdate||'')}</div>
        </div>`;
      }
      html += `</div>`;
    }

    /* Unmatched articles */
    const otherArts = byCountry['_other'] || [];
    if (otherArts.length) {
      html += `<div class="section-head" style="margin-top:8px">📡 Additional Supply Chain Events</div><div class="news-list">`;
      for (const a of otherArts.slice(0, 4)) {
        const domain = a.domain || (() => { try { return new URL(a.url||'').hostname.replace('www.',''); } catch { return '—'; } })();
        html += `<div class="news-item">
          <a href="${_itEsc(a.url||'#')}" target="_blank" rel="noopener noreferrer">${_itEsc(a.title||'—')}</a>
          <div class="news-meta">${_itEsc(domain)} · ${_itDate(a.seendate||a.publishdate||'')}</div>
        </div>`;
      }
      html += `</div>`;
    }

    if (!hasCountry && !otherArts.length) {
      html += `<div class="no-data">// GDELT returned results but no country matches found. Try again in 15 minutes.</div>`;
    }

    html += `<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
      <a href="https://api.gdeltproject.org/" target="_blank" rel="noopener" class="energy-entsog-link">↗ GDELT Project</a>
      <a href="https://ucdp.uu.se/downloads/" target="_blank" rel="noopener" class="energy-entsog-link">↗ UCDP Conflict Data</a>
      <a href="https://acleddata.com/" target="_blank" rel="noopener" class="energy-entsog-link">↗ ACLED Live Events</a>
    </div>`;

    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = `<div class="no-data">// Conflict intelligence error: ${_itEsc(e.message)}</div>`;
  }
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
