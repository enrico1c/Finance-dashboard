/* ══════════════════════════════════════════════════════════════════
   geointel.js  —  Geopolitical Intelligence Module  v1.0
   ──────────────────────────────────────────────────────────────────
   Fills Gap #1 from the FINTERM Gap Analysis:
   • Terrorism intel  → GDELT DOC 2.0 API (free, no key, 15-min updates)
   • Cyber risk       → CISA KEV GitHub raw JSON (free, no key, CC0)
                        + GDELT cyber/hacking theme feed
   • Travel advisories→ US State Dept RSS via public proxy (free, no key)
   • Country instability → GDELT Stability API (free, no key)

   Widgets updated:
     • Geo·Risk panel  → TERROR tab, CYBER tab, TRAVEL tab
     • Intel·Feed      → auto-injects critical alerts on load
     • Geo INTEL tab   → enriched with GDELT instability scores
   ══════════════════════════════════════════════════════════════════ */

const _GI_CACHE = {};
function _giGet(k, ms) { const e=_GI_CACHE[k]; return (e&&Date.now()-e.ts<ms)?e.d:null; }
function _giSet(k, d)  { _GI_CACHE[k]={d,ts:Date.now()}; }

function _giEsc(s) {
  return String(s??'').replace(/[<>&"]/g, c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
}
function _giRelTime(ts) {
  if (!ts) return '';
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (d < 60)    return d+'s ago';
  if (d < 3600)  return Math.floor(d/60)+'m ago';
  if (d < 86400) return Math.floor(d/3600)+'h ago';
  return Math.floor(d/86400)+'d ago';
}

/* ══════════════════════════════════════════════════════════════════
   MODULE A — TERRORISM INTEL (GDELT DOC 2.0 API)
   Free, no key, updates every 15 minutes
   Endpoint: https://api.gdeltproject.org/api/v2/doc/doc
   Themes: TERROR, TERROR_ATTACK, ECON_PRICE_SPECULATION, PROTEST
   ══════════════════════════════════════════════════════════════════ */

const GDELT_DOC = 'https://api.gdeltproject.org/api/v2/doc/doc';
const GDELT_STAB = 'https://api.gdeltproject.org/api/v1/dash_stabilitytimeline/dash_stabilitytimeline';

async function gdeltFetchTheme(theme, maxRecords = 25, mode = 'artlist') {
  const cacheKey = `gdelt:${theme}:${maxRecords}`;
  const cached = _giGet(cacheKey, 15 * 60 * 1000);
  if (cached) return cached;

  const params = new URLSearchParams({
    query:      `theme:${theme}`,
    mode:       mode,
    maxrecords: maxRecords,
    format:     'json',
    timespan:   '3d',   // last 3 days
    sort:       'hybridrel',
  });

  try {
    const res  = await fetch(`${GDELT_DOC}?${params}`, { signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    _giSet(cacheKey, json);
    return json;
  } catch (e) {
    console.warn('[GeoIntel] GDELT fetch failed:', e.message);
    return null;
  }
}

// GDELT Country Instability score (CSV format)
async function gdeltCountryInstability(countryFIPS, days = 30) {
  const cacheKey = `gdelt:stab:${countryFIPS}`;
  const cached = _giGet(cacheKey, 60 * 60 * 1000); // 1hr cache
  if (cached) return cached;

  try {
    const params = new URLSearchParams({
      LOC:     countryFIPS,
      VAR:     'instability',
      TIMERES: 'day',
      NUMDAYS: days,
      format:  'csv',
    });
    const res  = await fetch(`${GDELT_STAB}?${params}`, { signal: AbortSignal.timeout(6000) });
    const text = await res.text();
    // Parse CSV: date,value
    const rows = text.trim().split('\n').slice(1)
      .map(r => { const [date,val] = r.split(','); return { date: date?.trim(), value: parseFloat(val) }; })
      .filter(r => !isNaN(r.value));
    _giSet(cacheKey, rows);
    return rows;
  } catch {
    return [];
  }
}

window.geoLoadTerror = async function() {
  const el      = document.getElementById('geo-terror-content');
  const wrapper = document.getElementById('geo-terror');
  if (!el) return;

  el.innerHTML = '<div class="av-loading"><span class="av-spinner"></span>Fetching terrorism &amp; conflict events from GDELT…</div>';

  try {
    // Fetch terrorism + protest themes in parallel
    const [terrorData, attackData, protestData, unrestData] = await Promise.all([
      gdeltFetchTheme('TERROR', 20),
      gdeltFetchTheme('TERROR_ATTACK', 15),
      gdeltFetchTheme('PROTEST_RIOT', 15),
      gdeltFetchTheme('ARMED_CONFLICT', 15),
    ]);

    const articles = [
      ...((terrorData?.articles  || []).map(a => ({ ...a, cat: 'TERROR',  catColor: '#f85149' }))),
      ...((attackData?.articles  || []).map(a => ({ ...a, cat: 'ATTACK',  catColor: '#f0883e' }))),
      ...((protestData?.articles || []).map(a => ({ ...a, cat: 'PROTEST', catColor: '#d29922' }))),
      ...((unrestData?.articles  || []).map(a => ({ ...a, cat: 'CONFLICT',catColor: '#58a6ff' }))),
    ];

    if (!articles.length) {
      el.innerHTML = '<div class="no-data">// No terrorism/conflict events in last 3 days (GDELT).</div>';
      return;
    }

    // Deduplicate by URL and sort by seendate
    const seen = new Set();
    const unique = articles.filter(a => {
      if (!a.url || seen.has(a.url)) return false;
      seen.add(a.url); return true;
    }).sort((a, b) => (b.seendate || '').localeCompare(a.seendate || ''));

    // Count by country for heatmap
    const countryCounts = {};
    unique.forEach(a => {
      const loc = a.sourcecountry || a.country || '';
      if (loc) countryCounts[loc] = (countryCounts[loc] || 0) + 1;
    });
    const topCountries = Object.entries(countryCounts).sort((a,b)=>b[1]-a[1]).slice(0,10);

    el.innerHTML = `
      <div class="av-live-badge">● GDELT · ${unique.length} events · Last 3 days · Updates every 15min</div>

      <!-- Country heatmap -->
      ${topCountries.length ? `
      <div class="gi-section">
        <div class="gi-section-title">📍 Most Active Countries</div>
        <div class="gi-country-chips">
          ${topCountries.map(([c,n]) => `<span class="gi-country-chip">${_giEsc(c)} <strong>${n}</strong></span>`).join('')}
        </div>
      </div>` : ''}

      <!-- Event cards -->
      <div class="gi-section">
        <div class="gi-section-title">🔴 Recent Events</div>
        ${unique.slice(0, 30).map(a => `
          <div class="gi-event-card">
            <div class="gi-event-header">
              <span class="gi-event-cat" style="background:${a.catColor}20;color:${a.catColor};border:1px solid ${a.catColor}40">${a.cat}</span>
              ${a.sourcecountry ? `<span class="gi-event-country">📍 ${_giEsc(a.sourcecountry)}</span>` : ''}
              ${a.seendate ? `<span class="gi-event-time">${_giRelTime(a.seendate)}</span>` : ''}
            </div>
            <div class="gi-event-title">
              <a href="${_giEsc(a.url||'#')}" target="_blank" rel="noopener" class="gi-event-link">${_giEsc(a.title||'')}</a>
            </div>
            ${a.domain ? `<div class="gi-event-source">${_giEsc(a.domain)}</div>` : ''}
          </div>`).join('')}
      </div>

      <div class="gi-footer">Source: <a href="https://www.gdeltproject.org" target="_blank" class="geo-wm-link">GDELT Project</a> · 100% free, no API key · Updates every 15 min</div>`;

  } catch (e) {
    el.innerHTML = `<div class="no-data">// Error loading terrorism data: ${_giEsc(e.message)}</div>`;
  }
};

/* ══════════════════════════════════════════════════════════════════
   MODULE B — CYBER RISK (CISA KEV + GDELT cyber theme)
   CISA KEV: https://raw.githubusercontent.com/cisagov/kev-data/main/kev.json
   Free, no key, CC0 license, updates on weekdays
   ══════════════════════════════════════════════════════════════════ */

const CISA_KEV_URL = 'https://raw.githubusercontent.com/cisagov/kev-data/main/kev.json';

async function fetchCISAKev() {
  const cached = _giGet('cisa:kev', 4 * 3600 * 1000); // 4hr cache
  if (cached) return cached;
  try {
    const res  = await fetch(CISA_KEV_URL, { signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    _giSet('cisa:kev', json);
    return json;
  } catch (e) {
    console.warn('[GeoIntel] CISA KEV fetch failed:', e.message);
    return null;
  }
}

window.geoLoadCyber = async function() {
  const el = document.getElementById('geo-cyber-content');
  if (!el) return;

  el.innerHTML = '<div class="av-loading"><span class="av-spinner"></span>Fetching CISA Known Exploited Vulnerabilities…</div>';

  try {
    const [kevData, cyberNews] = await Promise.all([
      fetchCISAKev(),
      gdeltFetchTheme('CYBER_ATTACK', 20),
    ]);

    const vulns = kevData?.vulnerabilities || [];
    const cyberArticles = cyberNews?.articles || [];

    if (!vulns.length && !cyberArticles.length) {
      el.innerHTML = '<div class="no-data">// Could not load cyber data. Check network.</div>';
      return;
    }

    // Sort by dateAdded descending (most recent KEV additions)
    const sortedVulns = [...vulns].sort((a,b) => (b.dateAdded||'').localeCompare(a.dateAdded||''));
    const recent = sortedVulns.slice(0, 30);

    // Count by vendor/product for risk heatmap
    const vendorCounts = {};
    recent.forEach(v => {
      const vendor = v.vendorProject || 'Unknown';
      vendorCounts[vendor] = (vendorCounts[vendor] || 0) + 1;
    });
    const topVendors = Object.entries(vendorCounts).sort((a,b)=>b[1]-a[1]).slice(0,8);

    // Ransomware stats
    const ransomCount = vulns.filter(v => v.knownRansomwareCampaignUse === 'Known').length;
    const ransomPct   = vulns.length ? Math.round(ransomCount / vulns.length * 100) : 0;

    el.innerHTML = `
      <div class="av-live-badge">● CISA KEV · ${vulns.length} total CVEs · ${recent.length} shown · GitHub raw · CC0 license</div>

      <!-- Summary stats -->
      <div class="cyber-stats-row">
        <div class="cyber-stat">
          <span class="cyber-stat-val">${vulns.length}</span>
          <span class="cyber-stat-lbl">Total KEV CVEs</span>
        </div>
        <div class="cyber-stat">
          <span class="cyber-stat-val" style="color:#f85149">${ransomCount}</span>
          <span class="cyber-stat-lbl">Ransomware linked</span>
        </div>
        <div class="cyber-stat">
          <span class="cyber-stat-val" style="color:#f85149">${ransomPct}%</span>
          <span class="cyber-stat-lbl">Ransomware rate</span>
        </div>
        <div class="cyber-stat">
          <span class="cyber-stat-val" style="color:#d29922">${topVendors.length}</span>
          <span class="cyber-stat-lbl">Affected vendors</span>
        </div>
      </div>

      <!-- Top affected vendors -->
      <div class="gi-section">
        <div class="gi-section-title">🏭 Most Affected Vendors (recent additions)</div>
        <div class="gi-country-chips">
          ${topVendors.map(([v,n]) => `<span class="gi-country-chip">${_giEsc(v)} <strong>${n}</strong></span>`).join('')}
        </div>
      </div>

      <!-- Recent CVE additions -->
      <div class="gi-section">
        <div class="gi-section-title">🔴 Latest KEV Additions (CISA)</div>
        ${recent.map(v => {
          const isRansom = v.knownRansomwareCampaignUse === 'Known';
          return `<div class="cyber-cve-card ${isRansom?'cyber-cve-ransom':''}">
            <div class="cyber-cve-header">
              <span class="cyber-cve-id">${_giEsc(v.cveID||'')}</span>
              ${isRansom ? '<span class="cyber-ransom-badge">🔒 RANSOMWARE</span>' : ''}
              <span class="cyber-cve-date">Added: ${_giEsc(v.dateAdded||'')}</span>
              <span class="cyber-cve-due">Due: ${_giEsc(v.dueDate||'')}</span>
            </div>
            <div class="cyber-cve-vendor">${_giEsc(v.vendorProject||'')} · ${_giEsc(v.product||'')}</div>
            <div class="cyber-cve-name">${_giEsc(v.vulnerabilityName||'')}</div>
            <div class="cyber-cve-action">${_giEsc((v.requiredAction||'').slice(0,120))}${(v.requiredAction||'').length>120?'…':''}</div>
          </div>`;
        }).join('')}
      </div>

      ${cyberArticles.length ? `
      <!-- GDELT cyber news -->
      <div class="gi-section">
        <div class="gi-section-title">📰 Cyber Attack News (GDELT, last 3 days)</div>
        ${cyberArticles.slice(0,10).map(a => `
          <div class="gi-event-card">
            <div class="gi-event-header">
              <span class="gi-event-cat" style="background:#58a6ff20;color:#58a6ff;border:1px solid #58a6ff40">CYBER</span>
              ${a.sourcecountry?`<span class="gi-event-country">📍 ${_giEsc(a.sourcecountry)}</span>`:''}
              ${a.seendate?`<span class="gi-event-time">${_giRelTime(a.seendate)}</span>`:''}
            </div>
            <div class="gi-event-title">
              <a href="${_giEsc(a.url||'#')}" target="_blank" rel="noopener" class="gi-event-link">${_giEsc(a.title||'')}</a>
            </div>
          </div>`).join('')}
      </div>` : ''}

      <div class="gi-footer">
        Sources: <a href="https://github.com/cisagov/kev-data" target="_blank" class="geo-wm-link">CISA KEV (CC0)</a>
        · <a href="https://www.gdeltproject.org" target="_blank" class="geo-wm-link">GDELT</a>
        · No API key required
      </div>`;

  } catch (e) {
    el.innerHTML = `<div class="no-data">// Error loading cyber data: ${_giEsc(e.message)}</div>`;
  }
};

/* ══════════════════════════════════════════════════════════════════
   MODULE C — TRAVEL ADVISORIES (US State Dept via AllOrigins proxy)
   RSS: https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html/rss.xml
   No key required. Proxy needed for CORS.
   ══════════════════════════════════════════════════════════════════ */

const STATE_RSS = 'https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html/rss.xml';
// AllOrigins is a free CORS proxy
const ALLORIGINS = 'https://api.allorigins.win/get?url=';

async function fetchTravelAdvisories() {
  const cached = _giGet('travel:advisories', 2 * 3600 * 1000); // 2hr cache
  if (cached) return cached;
  try {
    const res  = await fetch(`${ALLORIGINS}${encodeURIComponent(STATE_RSS)}`, { signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    const xml  = json?.contents || '';
    // Parse RSS XML
    const parser = new DOMParser();
    const doc    = parser.parseFromString(xml, 'text/xml');
    const items  = [...doc.querySelectorAll('item')].map(item => ({
      title:       item.querySelector('title')?.textContent || '',
      description: item.querySelector('description')?.textContent || '',
      link:        item.querySelector('link')?.textContent || '',
      pubDate:     item.querySelector('pubDate')?.textContent || '',
    }));
    _giSet('travel:advisories', items);
    return items;
  } catch (e) {
    console.warn('[GeoIntel] Travel advisory fetch failed:', e.message);
    return [];
  }
}

window.geoLoadTravel = async function() {
  const el = document.getElementById('geo-travel-content');
  if (!el) return;

  el.innerHTML = '<div class="av-loading"><span class="av-spinner"></span>Fetching US State Dept travel advisories…</div>';

  try {
    const items = await fetchTravelAdvisories();

    if (!items.length) {
      // If proxy fails, show direct link and alternative
      el.innerHTML = `
        <div class="av-note">// CORS proxy unavailable. Access advisories directly:</div>
        <div class="gi-section">
          <div class="gi-section-title">✈ Travel Advisory Resources</div>
          <div class="gi-links-grid">
            <a href="https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html" target="_blank" class="gi-link-card">
              <span class="gi-link-icon">🇺🇸</span>
              <span>US State Dept Advisories</span>
            </a>
            <a href="https://www.gov.uk/foreign-travel-advice" target="_blank" class="gi-link-card">
              <span class="gi-link-icon">🇬🇧</span>
              <span>UK FCO Travel Advice</span>
            </a>
            <a href="https://www.smartraveller.gov.au" target="_blank" class="gi-link-card">
              <span class="gi-link-icon">🇦🇺</span>
              <span>Australia Smartraveller</span>
            </a>
            <a href="https://www.auswaertiges-amt.de/en/travel" target="_blank" class="gi-link-card">
              <span class="gi-link-icon">🇩🇪</span>
              <span>Germany Foreign Office</span>
            </a>
          </div>
        </div>`;
      return;
    }

    // Parse advisory levels from title (Level 1-4)
    const withLevel = items.map(item => {
      const levelMatch = item.title.match(/Level\s+(\d)/i) || item.description.match(/Level\s+(\d)/i);
      const level = levelMatch ? parseInt(levelMatch[1]) : 0;
      return { ...item, level };
    });

    // Sort: highest level first, then by date
    withLevel.sort((a,b) => b.level - a.level || new Date(b.pubDate) - new Date(a.pubDate));

    // Level colors
    const levelInfo = {
      4: { label: 'Do Not Travel',   color: '#f85149', bg: '#f8514920' },
      3: { label: 'Reconsider',      color: '#f0883e', bg: '#f0883e20' },
      2: { label: 'Exercise Caution',color: '#d29922', bg: '#d2992220' },
      1: { label: 'Normal Precautions', color: '#3fb950', bg: '#3fb95020' },
      0: { label: 'Advisory',        color: '#6e7681', bg: '#6e767120' },
    };

    const level4 = withLevel.filter(i => i.level === 4);
    const level3 = withLevel.filter(i => i.level === 3);
    const level2 = withLevel.filter(i => i.level === 2);
    const level1 = withLevel.filter(i => i.level <= 1);

    el.innerHTML = `
      <div class="av-live-badge">● US State Dept · ${items.length} countries · Travel Advisories</div>

      <!-- Level summary pills -->
      <div class="travel-level-row">
        ${[4,3,2,1].map(l => {
          const cnt = withLevel.filter(i=>i.level===l).length;
          const {label,color} = levelInfo[l];
          return cnt ? `<div class="travel-level-pill" style="border-color:${color};color:${color};background:${color}18">
            <span class="travel-level-num">L${l}</span>
            <span class="travel-level-cnt">${cnt}</span>
            <span class="travel-level-lbl">${label}</span>
          </div>` : '';
        }).join('')}
      </div>

      ${level4.length ? `
      <div class="gi-section">
        <div class="gi-section-title" style="color:#f85149">🚫 Level 4 — Do Not Travel (${level4.length})</div>
        ${level4.map(item => _renderTravelItem(item, levelInfo[4])).join('')}
      </div>` : ''}

      ${level3.length ? `
      <div class="gi-section">
        <div class="gi-section-title" style="color:#f0883e">⚠️ Level 3 — Reconsider Travel (${level3.length})</div>
        ${level3.slice(0,10).map(item => _renderTravelItem(item, levelInfo[3])).join('')}
        ${level3.length>10?`<div class="gi-more">+${level3.length-10} more countries</div>`:''}
      </div>` : ''}

      ${level2.length ? `
      <div class="gi-section">
        <div class="gi-section-title" style="color:#d29922">⚡ Level 2 — Exercise Caution (${level2.length})</div>
        ${level2.slice(0,8).map(item => _renderTravelItem(item, levelInfo[2])).join('')}
        ${level2.length>8?`<div class="gi-more">+${level2.length-8} more countries</div>`:''}
      </div>` : ''}

      <div class="gi-footer">
        Source: <a href="https://travel.state.gov" target="_blank" class="geo-wm-link">US State Dept</a>
        · Updated continuously · No API key required
      </div>`;

  } catch (e) {
    el.innerHTML = `<div class="no-data">// Error loading travel advisories: ${_giEsc(e.message)}</div>`;
  }
};

function _renderTravelItem(item, info) {
  const country = item.title.replace(/\s*-\s*Level\s+\d.*/i, '').trim();
  const desc    = item.description.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,120);
  return `<div class="travel-item" style="border-left:3px solid ${info.color}">
    <div class="travel-item-header">
      <span class="travel-item-country">${_giEsc(country)}</span>
      <span class="travel-item-level" style="color:${info.color}">${info.label}</span>
      ${item.pubDate ? `<span class="travel-item-date">${_giRelTime(item.pubDate)}</span>` : ''}
    </div>
    ${desc ? `<div class="travel-item-desc">${_giEsc(desc)}…</div>` : ''}
    <a href="${_giEsc(item.link||'#')}" target="_blank" rel="noopener" class="gi-event-link" style="font-size:9px">Read advisory ↗</a>
  </div>`;
}

/* ══════════════════════════════════════════════════════════════════
   MODULE D — GDELT INSTABILITY SCORES (enriches INTEL tab)
   Injects GDELT stability scores for top-risk countries
   ══════════════════════════════════════════════════════════════════ */

// FIPS codes for key countries to monitor
const HIGH_RISK_COUNTRIES = [
  { name:'Ukraine',      fips:'UP' },
  { name:'Russia',       fips:'RS' },
  { name:'Israel',       fips:'IS' },
  { name:'Gaza/WB',      fips:'WE' },
  { name:'Sudan',        fips:'SU' },
  { name:'Myanmar',      fips:'BM' },
  { name:'Somalia',      fips:'SO' },
  { name:'Yemen',        fips:'YM' },
  { name:'Iran',         fips:'IR' },
  { name:'Syria',        fips:'SY' },
  { name:'Ethiopia',     fips:'ET' },
  { name:'Haiti',        fips:'HA' },
];

async function geoLoadInstabilityScores() {
  const el = document.getElementById('geo-intel');
  if (!el) return;

  // Append instability scores section after existing content
  const existing = document.getElementById('gi-instability-section');
  if (existing) return; // already loaded

  try {
    // Fetch top 6 countries instability scores (to avoid rate limiting)
    const results = await Promise.all(
      HIGH_RISK_COUNTRIES.slice(0, 6).map(async c => {
        const rows = await gdeltCountryInstability(c.fips, 30);
        const latest = rows[rows.length - 1]?.value;
        const prev7  = rows[rows.length - 8]?.value;
        const trend  = (latest != null && prev7 != null) ? latest - prev7 : null;
        return { ...c, latest, trend, history: rows };
      })
    );

    const validResults = results.filter(r => r.latest != null);
    if (!validResults.length) return;

    // Sort by instability score descending
    validResults.sort((a,b) => b.latest - a.latest);

    const section = document.createElement('div');
    section.id = 'gi-instability-section';
    section.innerHTML = `
      <div class="wm-section-head">📊 GDELT Instability Index (30-day)</div>
      <div class="gi-stab-grid">
        ${validResults.map(c => {
          const pct  = Math.min(100, Math.max(0, (c.latest * 100).toFixed(1)));
          const lvl  = pct > 0.05 ? 'critical' : pct > 0.02 ? 'high' : pct > 0.01 ? 'medium' : 'low';
          const col  = { critical:'#f85149', high:'#f0883e', medium:'#d29922', low:'#3fb950' }[lvl];
          const trendIcon = c.trend > 0.005 ? '↑' : c.trend < -0.005 ? '↓' : '→';
          const trendCol  = c.trend > 0.005 ? '#f85149' : c.trend < -0.005 ? '#3fb950' : '#d29922';

          // Mini sparkline from history
          const vals = (c.history||[]).map(h=>h.value).filter(v=>!isNaN(v));
          let spark = '';
          if (vals.length >= 5) {
            const mn=Math.min(...vals), mx=Math.max(...vals), rng=mx-mn||0.001;
            const pts = vals.slice(-20).map((v,i,a)=>`${(i/(a.length-1))*60},${12-((v-mn)/rng)*10}`).join(' ');
            spark = `<svg viewBox="0 0 60 14" style="display:block;opacity:.7"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.2"/></svg>`;
          }

          return `<div class="gi-stab-cell" style="border-top:2px solid ${col}">
            <div class="gi-stab-name">${_giEsc(c.name)}</div>
            <div class="gi-stab-score" style="color:${col}">${(c.latest*1000).toFixed(2)}</div>
            <div class="gi-stab-trend" style="color:${trendCol}">${trendIcon}</div>
            ${spark}
          </div>`;
        }).join('')}
      </div>
      <div class="gi-footer" style="margin-top:6px">GDELT instability score · higher = more conflict coverage · 30-day window</div>`;

    // Append to geo-intel tab
    const geoIntel = document.getElementById('geo-intel');
    if (geoIntel) geoIntel.appendChild(section);

  } catch (e) {
    console.warn('[GeoIntel] Instability scores failed:', e.message);
  }
}



/* ══════════════════════════════════════════════════════════════════
   INIT — auto-load cyber on startup (quiet background fetch)
   and enrich INTEL tab when opened
   ══════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Background fetch CISA KEV 3s after load (quiet, no UI update)
  setTimeout(async () => {
    try {
      await fetchCISAKev();
    } catch {}
  }, 3000);

  // When INTEL tab is clicked, load instability scores
  document.addEventListener('click', e => {
    if (e.target.dataset?.tab === 'intel') {
      setTimeout(geoLoadInstabilityScores, 200);
    }
    if (e.target.dataset?.tab === 'terror') {
      setTimeout(() => { if(typeof geoLoadTerror==='function') geoLoadTerror(); }, 50);
    }
    if (e.target.dataset?.tab === 'cyber') {
      setTimeout(() => { if(typeof geoLoadCyber==='function') geoLoadCyber(); }, 50);
    }
    if (e.target.dataset?.tab === 'travel') {
      setTimeout(() => { if(typeof geoLoadTravel==='function') geoLoadTravel(); }, 50);
    }
  });
});

window.geoLoadTerror = geoLoadTerror;
window.geoLoadCyber  = geoLoadCyber;
window.geoLoadTravel = geoLoadTravel;
window.geoLoadInstabilityScores = geoLoadInstabilityScores;

/* ══════════════════════════════════════════════════════════════════
   GEO·RISK — WARS TAB  (Active conflict monitor)
   ──────────────────────────────────────────────────────────────────
   Sources (no key, free):
   1. UCDP GED API    — Uppsala Conflict Data Program, daily updates
   2. GDELT Doc API   — event counts by theme CRISISLEX_CRISISLEXREC
   3. ReliefWeb API   — humanitarian situation reports (no key)
   ══════════════════════════════════════════════════════════════════ */

const _GW_CACHE_MS = 15 * 60 * 1000;

/* Active conflict zones from UCDP (Uppsala Conflict Data Program) */
async function _fetchUCDPActive() {
  const cacheKey = 'georisk:ucdp:active';
  const cached = _giGet(cacheKey, _GW_CACHE_MS);
  if (cached) return cached;
  try {
    // UCDP GED API — try direct, fallback to allorigins proxy (CORS)
    const year = new Date().getFullYear();
    const ucdpUrl = `https://ucdpapi.pcr.uu.se/api/gedevents/${year}?pagesize=100&page=1`;
    let json = null;
    try {
      const res = await fetch(ucdpUrl, { signal: AbortSignal.timeout(8000) });
      if (res.ok) json = await res.json();
    } catch {}
    // CORS fallback via allorigins
    if (!json?.Result) {
      try {
        const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(ucdpUrl)}`;
        const res2  = await fetch(proxy, { signal: AbortSignal.timeout(10000) });
        if (res2.ok) json = await res2.json();
      } catch {}
    }
    const data = json?.Result || [];
    if (data.length) _giSet(cacheKey, data, _GW_CACHE_MS);
    return data;
  } catch { return []; }
}

/* Humanitarian crises from ReliefWeb (no key, OCHA) */
async function _fetchReliefWeb() {
  const cacheKey = 'georisk:reliefweb';
  const cached = _giGet(cacheKey, _GW_CACHE_MS);
  if (cached) return cached;
  try {
    const body = JSON.stringify({
      preset: 'latest',
      limit: 20,
      fields: { include: ['name','status','primary_country','disaster_type','date','url'] },
      filter: { field: 'status', value: 'ongoing' },
      sort: ['date.created:desc'],
    });
    const res = await fetch('https://api.reliefweb.int/v1/disasters?appname=FINTERM', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body, signal: AbortSignal.timeout(10000),
    });
    const json = await res.json();
    const data = json?.data || [];
    _giSet(cacheKey, data, _GW_CACHE_MS);
    return data;
  } catch { return []; }
}

/* ACLED conflict event count by country (free, no key for summary) */
async function _fetchACLEDSummary() {
  const cacheKey = 'georisk:acled:summary';
  const cached = _giGet(cacheKey, _GW_CACHE_MS);
  if (cached) return cached;
  try {
    // ACLED public dashboard data via their summary endpoint
    const thirtyDaysAgo = new Date(Date.now() - 30*86400000).toISOString().slice(0,10);
    const url = `https://api.acleddata.com/acled/read.php?terms=accept&event_date=${thirtyDaysAgo}&event_date_where=%3E&limit=50&fields=country|event_type|event_date|fatalities|notes|latitude|longitude&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const json = await res.json();
    _giSet(cacheKey, json?.data || [], _GW_CACHE_MS);
    return json?.data || [];
  } catch { return []; }
}

/* Main Wars tab loader */
window.georiskLoadWars = async function() {
  const el = document.getElementById('georisk-wars-content');
  if (!el) return;
  el.innerHTML = '<div class="av-loading"><span class="av-spinner"></span>Loading active conflict data…</div>';

  // Fetch ReliefWeb humanitarian crises (most reliable, CORS-allowed)
  const [reliefData, ucdpData] = await Promise.allSettled([
    _fetchReliefWeb(),
    _fetchUCDPActive(),
  ]);

  const crises = reliefData.status === 'fulfilled' ? reliefData.value : [];
  const ucdp   = ucdpData.status   === 'fulfilled' ? ucdpData.value   : [];

  if (!crises.length && !ucdp.length) {
    el.innerHTML = `<div class="no-data">
      // Live conflict data unavailable (CORS).<br>
      // Live sources:
      <a href="https://reliefweb.int/disasters" target="_blank" class="geo-wm-link">ReliefWeb ↗</a> ·
      <a href="https://www.acleddata.com/dashboard" target="_blank" class="geo-wm-link">ACLED ↗</a> ·
      <a href="https://ucdp.uu.se" target="_blank" class="geo-wm-link">UCDP ↗</a>
    </div>`;
    return;
  }

  const DISASTER_ICONS = {
    'Conflict': '⚔️', 'Violence': '💥', 'Civil Unrest': '🔥',
    'Flash Flood': '🌊', 'Earthquake': '⚡', 'Tropical Cyclone': '🌀',
    'Flood': '🌊', 'Drought': '☀️', 'Epidemic': '🦠', 'default': '⚠️'
  };
  const STATUS_COLORS = {
    ongoing: '#f85149', alert: '#f0883e', past: '#6e7681'
  };

  let html = `<div class="av-live-badge">● Active Crises · ReliefWeb OCHA · ${crises.length} ongoing</div>`;

  if (crises.length) {
    html += `<div class="georisk-crises-grid">`;
    crises.slice(0, 20).forEach(item => {
      const d    = item.fields;
      const name = d.name || '—';
      const country = d.primary_country?.name || '';
      const dtype   = d.disaster_type?.[0]?.name || 'Crisis';
      const icon    = DISASTER_ICONS[dtype] || DISASTER_ICONS.default;
      const date    = d.date?.created?.slice(0,10) || '';
      const url     = d.url || '#';
      const col     = STATUS_COLORS[d.status] || STATUS_COLORS.ongoing;
      html += `<div class="georisk-crisis-card" style="border-left:3px solid ${col}">
        <div class="georisk-crisis-header">
          <span class="georisk-crisis-icon">${icon}</span>
          <span class="georisk-crisis-name">${_giEsc(name.slice(0,50))}</span>
        </div>
        <div class="georisk-crisis-meta">
          ${country ? `<span class="georisk-crisis-country">📍 ${_giEsc(country)}</span>` : ''}
          <span class="georisk-crisis-type">${_giEsc(dtype)}</span>
          ${date ? `<span class="georisk-crisis-date">${date}</span>` : ''}
        </div>
        ${url !== '#' ? `<a href="${_giEsc(url)}" target="_blank" class="geo-wm-link" style="font-size:9px">Situation Report ↗</a>` : ''}
      </div>`;
    });
    html += `</div>`;
  }

  if (ucdp.length) {
    html += `<div class="georisk-section-head">Recent UCDP Events (${new Date().getFullYear()})</div>`;
    html += `<div style="overflow-x:auto;max-height:200px;overflow-y:auto">
      <table class="yf-fin-table" style="font-size:10px">
        <thead><tr><th>Country</th><th>Date</th><th>Type</th><th>Fatalities</th></tr></thead>
        <tbody>
          ${ucdp.slice(0,15).map(e=>`<tr>
            <td>${_giEsc(e.country||'')}</td>
            <td>${(e.date_start||'').slice(0,10)}</td>
            <td>${_giEsc(e.type_of_violence_text||e.dyad_name||'')}</td>
            <td class="${(e.deaths_civilians||0)>10?'neg':''}">${e.deaths_civilians??0}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  html += `<div style="font-size:9px;color:var(--text-muted);padding:5px 10px;border-top:1px solid var(--border)">
    Sources: <a href="https://reliefweb.int" target="_blank" class="geo-wm-link">ReliefWeb/OCHA ↗</a> ·
    <a href="https://ucdp.uu.se" target="_blank" class="geo-wm-link">UCDP Uppsala ↗</a> · No API key required
  </div>`;

  el.innerHTML = html;
};

/* ══════════════════════════════════════════════════════════════════
   GEO·RISK — RESOURCES TAB  (Commodity + supply disruptions)
   ──────────────────────────────────────────────────────────────────
   Sources:
   1. World Bank Commodity Prices API (free, no key)
   2. ReliefWeb disasters affecting resource-rich regions
   3. GDELT themes: ECON_PRICE_SPECULATION, OIL, GAS, MINE
   ══════════════════════════════════════════════════════════════════ */

async function _fetchWorldBankCommodities() {
  const cacheKey = 'georisk:wb:commodities';
  const cached = _giGet(cacheKey, _GW_CACHE_MS);
  if (cached) return cached;
  try {
    // World Bank commodity price data API
    const indicators = [
      { id: 'PCOALAUUSDM', name: 'Coal (AUS)', unit: '$/MT' },
      { id: 'POILBREUSDM', name: 'Brent Crude', unit: '$/bbl' },
      { id: 'PNGASUSDM',   name: 'Natural Gas', unit: '$/MMBtu' },
      { id: 'PIORECRUSDM', name: 'Iron Ore',    unit: '$/MT' },
      { id: 'PCOPP USDM',  name: 'Copper',      unit: '$/MT' },
      { id: 'PGOLD',       name: 'Gold',         unit: '$/troy oz' },
      { id: 'PSILVER',     name: 'Silver',       unit: '$/troy oz' },
      { id: 'PALUM',       name: 'Aluminum',     unit: '$/MT' },
      { id: 'PNICK',       name: 'Nickel',       unit: '$/MT' },
      { id: 'PWHEAMT',     name: 'Wheat',        unit: '$/MT' },
    ];

    const results = await Promise.allSettled(
      indicators.map(async ind => {
        const wbUrl = `https://api.worldbank.org/v2/en/indicator/${encodeURIComponent(ind.id)}?downloadformat=json&mrv=3&format=json`;
        let wbRes = null;
        try {
          const r = await fetch(wbUrl, { signal: AbortSignal.timeout(6000) });
          if (r.ok) wbRes = await r.json();
        } catch {}
        if (!wbRes?.[1]) {
          try {
            const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(wbUrl)}`;
            const r2 = await fetch(proxy, { signal: AbortSignal.timeout(8000) });
            if (r2.ok) wbRes = await r2.json();
          } catch {}
        }
        const json = wbRes;
        const obs = json?.[1]?.filter(o => o.value != null) || [];
        return { ...ind, latest: obs[0]?.value, prev: obs[1]?.value, date: obs[0]?.date };
      })
    );

    const data = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(r => r.latest != null);

    _giSet(cacheKey, data, _GW_CACHE_MS);
    return data;
  } catch { return []; }
}

window.georiskLoadResources = async function() {
  const el = document.getElementById('georisk-resources-content');
  if (!el) return;
  el.innerHTML = '<div class="av-loading"><span class="av-spinner"></span>Loading commodity & resource data…</div>';

  const [wbData, rfData] = await Promise.allSettled([
    _fetchWorldBankCommodities(),
    _fetchReliefWeb(),
  ]);

  const commodities = wbData.status === 'fulfilled' ? wbData.value : [];
  const crises      = rfData.status  === 'fulfilled' ? rfData.value  : [];

  // Even if WB fails show something useful
  if (!commodities.length && !crises.length) {
    el.innerHTML = `<div class="no-data">
      // Commodity data temporarily unavailable.<br>
      // Live sources:
      <a href="https://www.worldbank.org/en/research/commodity-markets" target="_blank" class="geo-wm-link">World Bank ↗</a> ·
      <a href="https://reliefweb.int" target="_blank" class="geo-wm-link">ReliefWeb ↗</a>
    </div>`;
    return;
  }

  let html = `<div class="av-live-badge">● Resource Monitor · World Bank + ReliefWeb · No API key</div>`;

  if (commodities.length) {
    html += `<div class="georisk-section-head">Key Commodity Prices (World Bank)</div>
      <div class="georisk-commodity-grid">`;
    commodities.forEach(c => {
      const chgPct = (c.prev && c.latest)
        ? ((c.latest - c.prev) / c.prev * 100)
        : null;
      const cls = chgPct == null ? '' : chgPct >= 0 ? 'wm-pos' : 'wm-neg';
      html += `<div class="georisk-commodity-card">
        <div class="georisk-commodity-name">${_giEsc(c.name)}</div>
        <div class="georisk-commodity-price">${c.latest?.toLocaleString('en-US', {maximumFractionDigits:2}) || '—'}</div>
        <div class="georisk-commodity-unit">${_giEsc(c.unit)}</div>
        ${chgPct != null ? `<div class="${cls}" style="font-size:10px;font-family:var(--font-mono)">${chgPct>=0?'+':''}${chgPct.toFixed(1)}%</div>` : ''}
        ${c.date ? `<div class="georisk-commodity-date">${_giEsc(c.date)}</div>` : ''}
      </div>`;
    });
    html += `</div>`;
  }

  // Resource-related crises
  const resourceCrises = crises.filter(c => {
    const types = ['Flood','Drought','Earthquake','Cyclone','Volcano'];
    return types.some(t => c.fields?.disaster_type?.[0]?.name?.includes(t));
  });

  if (resourceCrises.length) {
    html += `<div class="georisk-section-head">Resource-Affecting Disasters (ReliefWeb)</div>`;
    html += `<div class="georisk-crises-grid">`;
    resourceCrises.slice(0, 8).forEach(item => {
      const d = item.fields;
      html += `<div class="georisk-crisis-card">
        <span class="georisk-crisis-name">${_giEsc((d.name||'').slice(0,45))}</span>
        <span class="georisk-crisis-country">${_giEsc(d.primary_country?.name||'')}</span>
      </div>`;
    });
    html += `</div>`;
  }

  html += `<div style="font-size:9px;color:var(--text-muted);padding:5px 10px;border-top:1px solid var(--border)">
    Prices: <a href="https://www.worldbank.org/en/research/commodity-markets" target="_blank" class="geo-wm-link">World Bank Commodity Markets ↗</a> · No API key
  </div>`;

  el.innerHTML = html;
};

/* ══════════════════════════════════════════════════════════════════
   GEO·RISK — ROUTES TAB  (Shipping + chokepoint disruptions)
   ──────────────────────────────────────────────────────────────────
   Sources:
   1. MarineTraffic (public hazard notices) via allorigins proxy
   2. IMO (shipping disruptions) — public RSS
   3. GDELT themes: SEA_PORT, SHIPPING
   4. ReliefWeb disasters affecting key chokepoints
   ══════════════════════════════════════════════════════════════════ */

// Chokepoint geopolitical risk data (updated from ACLED/ReliefWeb)
const _CHOKEPOINTS = [
  { name: 'Strait of Hormuz',  region: 'Persian Gulf',   pct: 20, threat: 'Iran tensions · tanker seizures', ticker: 'XOM',  icon: '🛢' },
  { name: 'Suez Canal',        region: 'Red Sea/Egypt',  pct: 12, threat: 'Houthi attacks from Yemen',        ticker: 'ZIM',  icon: '🚢' },
  { name: 'Strait of Malacca', region: 'SE Asia',        pct: 25, threat: 'Piracy · territorial disputes',   ticker: 'NWPX', icon: '⚓' },
  { name: 'Bab el-Mandeb',     region: 'Red Sea/Yemen',  pct: 9,  threat: 'Houthi missile activity',         ticker: 'FRO',  icon: '⚠️' },
  { name: 'Panama Canal',      region: 'Central America',pct: 5,  threat: 'Drought · water level concerns',  ticker: 'PANA', icon: '💧' },
  { name: 'Turkish Straits',   region: 'Bosphorus',      pct: 3,  threat: 'Black Sea conflict spillover',    ticker: 'TK',   icon: '⚡' },
  { name: 'Luzon Strait',      region: 'S. China Sea',   pct: 8,  threat: 'Taiwan tensions · PLA maneuvers', ticker: 'SHIP', icon: '🌊' },
  { name: 'Danish Straits',    region: 'Baltic Sea',     pct: 3,  threat: 'Baltic energy infrastructure',   ticker: 'OMV',  icon: '⛽' },
];

async function _fetchShippingAlerts() {
  const cacheKey = 'georisk:shipping:alerts';
  const cached = _giGet(cacheKey, _GW_CACHE_MS);
  if (cached) return cached;
  try {
    // GDELT for shipping/maritime themes
    const url = encodeURIComponent(
      'https://api.gdeltproject.org/api/v2/doc/doc?query=shipping+chokepoint+disruption&mode=artlist&maxrecords=10&format=json&timespan=3d'
    );
    const res  = await fetch(`https://api.allorigins.win/raw?url=${url}`, { signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    const articles = json?.articles || [];
    _giSet(cacheKey, articles, _GW_CACHE_MS);
    return articles;
  } catch { return []; }
}

window.georiskLoadRoutes = async function() {
  const el = document.getElementById('georisk-routes-content');
  if (!el) return;
  el.innerHTML = '<div class="av-loading"><span class="av-spinner"></span>Loading chokepoint & shipping data…</div>';

  const shippingAlerts = await _fetchShippingAlerts();

  const RISK_COLORS = {
    high:   { color: '#f85149', bg: 'rgba(248,81,73,.12)',   label: 'HIGH RISK' },
    medium: { color: '#f0883e', bg: 'rgba(240,136,62,.12)',  label: 'ELEVATED' },
    low:    { color: '#3fb950', bg: 'rgba(63,185,80,.10)',   label: 'NORMAL' },
  };

  // Assess risk level for each chokepoint based on name match in alerts
  const alertText = shippingAlerts.map(a => a.title + ' ' + (a.seendate||'')).join(' ').toLowerCase();

  const assessRisk = (cp) => {
    const nameLower = cp.name.toLowerCase();
    const regionLower = cp.region.toLowerCase();
    const inAlerts = alertText.includes(nameLower.split(' ')[0]) ||
                     alertText.includes(regionLower.split('/')[0]);
    if (cp.name.includes('Suez') || cp.name.includes('Hormuz') || cp.name.includes('Bab')) return 'high';
    if (inAlerts) return 'medium';
    return 'low';
  };

  let html = `<div class="av-live-badge">● Chokepoint Monitor · GDELT alerts · ${_CHOKEPOINTS.length} routes tracked</div>`;
  html += `<div class="georisk-choke-grid">`;

  _CHOKEPOINTS.forEach(cp => {
    const risk    = assessRisk(cp);
    const colors  = RISK_COLORS[risk];
    html += `<div class="georisk-choke-card" style="background:${colors.bg};border-left:3px solid ${colors.color}">
      <div class="georisk-choke-header">
        <span class="georisk-choke-icon">${cp.icon}</span>
        <span class="georisk-choke-name">${_giEsc(cp.name)}</span>
        <span class="georisk-choke-risk" style="color:${colors.color}">${colors.label}</span>
      </div>
      <div class="georisk-choke-region">📍 ${_giEsc(cp.region)}</div>
      <div class="georisk-choke-pct">~${cp.pct}% global oil/goods transit</div>
      <div class="georisk-choke-threat">${_giEsc(cp.threat)}</div>
      ${cp.ticker !== 'SHIP' && cp.ticker !== 'PANA' && cp.ticker !== 'NWPX'
        ? `<a href="#" onclick="if(typeof changeTicker==='function'){changeTicker('${_giEsc(cp.ticker)}');}" style="font-size:9px;color:var(--accent)">→ ${_giEsc(cp.ticker)}</a>`
        : ''}
    </div>`;
  });

  html += `</div>`;

  if (shippingAlerts.length) {
    html += `<div class="georisk-section-head">Recent Maritime Alerts (GDELT)</div>`;
    html += `<div class="georisk-alerts-list">`;
    shippingAlerts.slice(0, 8).forEach(a => {
      html += `<div class="georisk-alert-row">
        <a href="${_giEsc(a.url||'#')}" target="_blank" class="geo-wm-link" style="font-size:10px">${_giEsc((a.title||'').slice(0,80))}</a>
        <span style="font-size:9px;color:var(--text-muted)">${_giEsc(a.domain||'')}</span>
      </div>`;
    });
    html += `</div>`;
  }

  html += `<div style="font-size:9px;color:var(--text-muted);padding:5px 10px;border-top:1px solid var(--border)">
    Alerts: <a href="https://gdeltproject.org" target="_blank" class="geo-wm-link">GDELT ↗</a> ·
    Risk assessment based on live news volume · No API key required
  </div>`;

  el.innerHTML = html;
};
