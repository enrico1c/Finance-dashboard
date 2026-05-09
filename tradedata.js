/* ══════════════════════════════════════════════════════════════════
   FINTERM — tradedata.js
   Global Trade Route Disruptions & Detour Cost Calculator
   Source: global-trade-monitor data (ported to vanilla JS)
   Panel: Supply·Chain → 🚨 ROUTES tab (#supply-traderoutes)
   ══════════════════════════════════════════════════════════════════ */

/* ── Escape helper ───────────────────────────────────────────────── */
const _tdEsc = s => String(s ?? '').replace(/[<>&"]/g, c =>
  ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

const _tdFmt = n => n == null ? 'N/A' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

/* ── Seed disruptions data ───────────────────────────────────────── */
const TD_DISRUPTIONS = [
  {
    id: 'red-sea-2024',
    title: 'Red Sea Houthi Attacks',
    type: 'security', severity: 'critical', status: 'ongoing',
    startDate: '2023-11-19',
    affectedRoutes: ['Red Sea / Gulf of Aden', 'Suez Canal Route'],
    description: 'Houthi rebel attacks on commercial shipping have disrupted Red Sea traffic, forcing vessels to reroute around Cape of Good Hope (+14 days, +$1M/voyage). Traffic through Suez Canal dropped ~42%.',
    monetaryImpact: { dailyBillion: 0.8, totalBillion: 142 },
    alternatives: ['Cape of Good Hope Route'],
    icon: '⚔️',
  },
  {
    id: 'hormuz-iran-2024',
    title: 'Iran-Israel Tensions / Hormuz Risk',
    type: 'security', severity: 'critical', status: 'ongoing',
    startDate: '2024-04-01',
    affectedRoutes: ['Strait of Hormuz'],
    description: 'Escalating Iran-Israel tensions raised risk premium on Hormuz transits. ~21M barrels/day of oil (20% of global supply) passes through. Tanker war risk insurance spiked.',
    monetaryImpact: { dailyBillion: 1.2, totalBillion: null },
    alternatives: ['Saudi Aramco East-West pipeline'],
    icon: '⚠️',
  },
  {
    id: 'ukraine-black-sea-2022',
    title: 'Black Sea Grain Corridor Disruption',
    type: 'conflict', severity: 'critical', status: 'ongoing',
    startDate: '2022-02-24',
    affectedRoutes: ['Turkish Straits / Bosphorus'],
    description: 'Russia-Ukraine war disrupted Black Sea grain exports. UN-brokered Grain Initiative collapsed July 2023. Ukraine exported 33M tonnes grain/year through this corridor.',
    monetaryImpact: { dailyBillion: 0.15, totalBillion: 55 },
    alternatives: ['Rail via Romania/Hungary', 'Danube River'],
    icon: '🌾',
  },
  {
    id: 'taiwan-strait-2024',
    title: 'Taiwan Strait Military Tensions',
    type: 'security', severity: 'high', status: 'ongoing',
    startDate: '2024-01-01',
    affectedRoutes: ['South China Sea', 'Trans-Pacific North'],
    description: '~$5.3T in trade transits the strait annually. PLA military exercises affect shipping insurance premiums. Contingency rerouting would add significant delays.',
    monetaryImpact: { dailyBillion: 0.1, totalBillion: null },
    alternatives: ['Lombok Strait', 'Eastern Pacific routes'],
    icon: '🛳️',
  },
  {
    id: 'malacca-piracy',
    title: 'Strait of Malacca Piracy Risk',
    type: 'security', severity: 'medium', status: 'ongoing',
    startDate: '2023-01-01',
    affectedRoutes: ['Strait of Malacca'],
    description: 'Piracy incidents average 50+/year. Insurance surcharges of 0.05%–0.1% of cargo value. ReCAAP ISC monitors incidents.',
    monetaryImpact: { dailyBillion: 0.05, totalBillion: null },
    alternatives: ['Lombok Strait', 'Sunda Strait'],
    icon: '🏴‍☠️',
  },
  {
    id: 'arctic-sanctions-2022',
    title: 'Northern Sea Route Sanctions Impact',
    type: 'conflict', severity: 'medium', status: 'ongoing',
    startDate: '2022-03-01',
    affectedRoutes: ['Arctic Northern Sea Route'],
    description: 'Western sanctions on Russia effectively closed the Arctic Northern Sea Route to most Western shipping. Traffic halved from 35M tonnes.',
    monetaryImpact: { dailyBillion: 0.01, totalBillion: 2 },
    alternatives: ['Suez Canal Route'],
    icon: '🧊',
  },
  {
    id: 'panama-drought-2023',
    title: 'Panama Canal Water Restrictions',
    type: 'environmental', severity: 'high', status: 'resolved',
    startDate: '2023-07-01',
    affectedRoutes: ['Panama Canal Route'],
    description: 'Severe drought cut daily transit slots by 36% (38→24). Wait times reached 21+ days. $700M in losses estimated.',
    monetaryImpact: { dailyBillion: 0.2, totalBillion: 18 },
    alternatives: ['Drake Passage', 'Cape Horn'],
    icon: '🏜️',
  },
  {
    id: 'baltimore-bridge-2024',
    title: 'Baltimore Francis Scott Key Bridge Collapse',
    type: 'infrastructure', severity: 'high', status: 'resolved',
    startDate: '2024-03-26',
    affectedRoutes: [],
    description: 'MV Dali struck the bridge. Port of Baltimore (9th largest US port) closed for weeks. $28M/day in delayed cargo.',
    monetaryImpact: { dailyBillion: 0.028, totalBillion: 0.8 },
    alternatives: ['Port of Norfolk', 'Port of Philadelphia'],
    icon: '🌉',
  },
  {
    id: 'suez-evergreen-2021',
    title: 'Ever Given Suez Canal Blockage',
    type: 'infrastructure', severity: 'critical', status: 'resolved',
    startDate: '2021-03-23',
    affectedRoutes: ['Suez Canal Route', 'Mediterranean Main'],
    description: '~369 ships delayed, $9.6B/day in trade halted for 6 days. Total economic impact ~$57B.',
    monetaryImpact: { dailyBillion: 9.6, totalBillion: 57 },
    alternatives: ['Cape of Good Hope Route'],
    icon: '🚢',
  },
  {
    id: 'yantian-covid-2021',
    title: 'Yantian Port COVID-19 Closures',
    type: 'health', severity: 'high', status: 'resolved',
    startDate: '2021-05-27',
    affectedRoutes: ['South China Sea', 'Trans-Pacific North'],
    description: '8th busiest port near-closed for 3 weeks. Created global container shortage and $3.8B supply chain disruption.',
    monetaryImpact: { dailyBillion: 0.18, totalBillion: 3.8 },
    alternatives: ['Nansha Port', 'Shanghai rerouting'],
    icon: '🦠',
  },
];

/* ── Detour cost calculator data ─────────────────────────────────── */
const TD_ROUTES = {
  'Suez Canal Route':             { primary: 21000, detour: 35000, detourName: 'Cape of Good Hope' },
  'Red Sea / Gulf of Aden':       { primary:  2000, detour: 16000, detourName: 'Cape of Good Hope' },
  'Panama Canal Route':           { primary:  1500, detour: 13000, detourName: 'Cape Horn' },
  'Strait of Malacca':            { primary:   900, detour:  3500, detourName: 'Lombok Strait' },
  'Strait of Hormuz':             { primary:   100, detour:  5000, detourName: 'Overland pipeline' },
  'Turkish Straits / Bosphorus':  { primary:    50, detour:  8000, detourName: 'Rail via Romania' },
  'English Channel':              { primary:   560, detour:  1800, detourName: 'North of Scotland' },
  'Arctic Northern Sea Route':    { primary: 14000, detour: 21000, detourName: 'Suez Canal Route' },
};

const TD_COMMODITIES = [
  { id: 'oil',         name: 'Crude Oil',       valuePerTon: 560  },
  { id: 'containers',  name: 'Container Cargo',  valuePerTon: 1200 },
  { id: 'grain',       name: 'Grain / Wheat',    valuePerTon: 220  },
  { id: 'lng',         name: 'LNG',              valuePerTon: 450  },
  { id: 'electronics', name: 'Electronics',      valuePerTon: 8000 },
  { id: 'coal',        name: 'Coal',             valuePerTon: 130  },
  { id: 'iron_ore',    name: 'Iron Ore',          valuePerTon: 110  },
  { id: 'chemicals',   name: 'Chemicals',        valuePerTon: 950  },
];

function _tdCalcDetour(routeKey, valuePerTon, volumeTonnes) {
  const rd = TD_ROUTES[routeKey];
  if (!rd) return null;
  const extraKm   = rd.detour - rd.primary;
  const extraDays = extraKm / 500; // ~500 km/day for large vessel
  const fuelM     = extraKm * 0.0015;
  const holdingM  = (volumeTonnes * valuePerTon / 1e6) * 0.0002 * extraDays;
  return {
    route: routeKey, detourName: rd.detourName,
    extraKm, extraDays: extraDays.toFixed(1),
    fuelM: fuelM.toFixed(2), holdingM: holdingM.toFixed(2),
    totalM: (fuelM + holdingM).toFixed(2),
  };
}

/* ── Severity config ─────────────────────────────────────────────── */
const TD_SEV = {
  critical: { label: '🔴 Critical', border: '#f85149', bg: 'rgba(248,81,73,0.08)', text: '#f85149' },
  high:     { label: '🟠 High',     border: '#f0883e', bg: 'rgba(240,136,62,0.08)', text: '#f0883e' },
  medium:   { label: '🟡 Medium',   border: '#d29922', bg: 'rgba(210,153,34,0.08)', text: '#d29922' },
  low:      { label: '🟢 Low',      border: '#3fb950', bg: 'rgba(63,185,80,0.08)',  text: '#3fb950' },
};

const TD_TYPE = {
  security:       '🛡 Security',
  conflict:       '⚔️ Conflict',
  environmental:  '🌍 Environmental',
  infrastructure: '🏗 Infrastructure',
  health:         '🦠 Health',
};

/* ── Main render ─────────────────────────────────────────────────── */
window.tradeRoutesLoad = async function() {
  const el = document.getElementById('supply-traderoutes');
  if (!el) return;
  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading trade route intelligence…</div>`;

  // Fetch live GDELT shipping disruptions (through FINTERM proxy)
  let liveEvents = [];
  try {
    const gdeltUrl = 'https://api.gdeltproject.org/api/v2/doc/doc?query=' +
      encodeURIComponent('shipping "port closure" blockade "trade route" "supply chain" disruption') +
      '&mode=artlist&maxrecords=15&format=json&timespan=14d&sourcelang=english';
    const res = await fetch(gdeltUrl, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const data = await res.json();
      liveEvents = data?.articles || [];
    }
  } catch {}

  const ongoing  = TD_DISRUPTIONS.filter(d => d.status === 'ongoing');
  const resolved = TD_DISRUPTIONS.filter(d => d.status === 'resolved');

  /* ── Total active impact ── */
  const totalDailyB = ongoing.reduce((s, d) => s + (d.monetaryImpact?.dailyBillion || 0), 0);

  let html = `<div class="av-live-badge">● Global Trade Route Intelligence · ${ongoing.length} active disruptions · $${totalDailyB.toFixed(1)}B/day impact</div>`;
  html += `<div style="overflow-y:auto;height:calc(100% - 32px);padding:6px">`;

  /* ── Active disruptions ── */
  html += `<div style="font-size:10px;font-weight:700;color:var(--text);padding:4px 0 4px;border-bottom:1px solid var(--border);margin-bottom:6px">🚨 Active Disruptions (${ongoing.length})</div>`;

  ongoing.forEach(d => {
    const sev = TD_SEV[d.severity] || TD_SEV.medium;
    const daily = d.monetaryImpact?.dailyBillion;
    const total = d.monetaryImpact?.totalBillion;
    html += `<div style="border:1px solid ${sev.border};border-left:3px solid ${sev.border};background:${sev.bg};border-radius:4px;padding:8px;margin-bottom:6px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span style="font-size:14px">${d.icon}</span>
        <strong style="font-size:11px;color:var(--text)">${_tdEsc(d.title)}</strong>
        <span style="margin-left:auto;font-size:9px;color:${sev.text};font-weight:700">${sev.label}</span>
      </div>
      <div style="font-size:9px;color:var(--text-muted);margin-bottom:4px">${_tdEsc(d.description)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;font-size:9px">
        <span style="color:var(--text-muted)">📍 ${_tdEsc(TD_TYPE[d.type] || d.type)}</span>
        ${d.affectedRoutes.length ? `<span style="color:#58a6ff">🛣 ${_tdEsc(d.affectedRoutes.join(' · '))}</span>` : ''}
        ${daily != null ? `<span style="color:#f85149;font-weight:600">💰 $${daily}B/day</span>` : ''}
        ${total != null ? `<span style="color:#f0883e">📊 $${total}B total</span>` : ''}
        ${d.alternatives.length ? `<span style="color:#3fb950">↪ Alt: ${_tdEsc(d.alternatives[0])}</span>` : ''}
      </div>
    </div>`;
  });

  /* ── Live GDELT feed ── */
  if (liveEvents.length) {
    html += `<div style="font-size:10px;font-weight:700;color:var(--text);padding:4px 0 4px;border-bottom:1px solid var(--border);margin-bottom:6px;margin-top:8px">📡 Live Shipping News — GDELT (14 days)</div>`;
    liveEvents.slice(0, 10).forEach(a => {
      const domain = a.domain || (() => { try { return new URL(a.url||'').hostname.replace('www.',''); } catch { return ''; } })();
      const date = a.seendate ? a.seendate.replace(/(\d{4})(\d{2})(\d{2}).*/,'$1-$2-$3') : '';
      html += `<div style="padding:5px 0;border-bottom:1px solid var(--border)">
        <a href="${_tdEsc(a.url||'#')}" target="_blank" rel="noopener" style="font-size:10px;color:var(--text);text-decoration:none">${_tdEsc(a.title||'')}</a>
        <div style="font-size:9px;color:var(--text-muted);margin-top:1px">${_tdEsc(domain)}${date ? ' · '+date : ''}</div>
      </div>`;
    });
  }

  /* ── Resolved (collapsed) ── */
  html += `<details style="margin-top:10px">
    <summary style="font-size:10px;font-weight:700;color:var(--text-muted);cursor:pointer;padding:4px 0;border-top:1px solid var(--border)">✅ Resolved events (${resolved.length})</summary>
    <div style="margin-top:6px">`;
  resolved.forEach(d => {
    html += `<div style="padding:6px;border:1px solid var(--border);border-radius:3px;margin-bottom:4px;opacity:.7">
      <div style="font-size:10px;font-weight:600;color:var(--text-muted)">${d.icon} ${_tdEsc(d.title)}</div>
      <div style="font-size:9px;color:var(--text-muted)">${_tdEsc(d.description.slice(0,100))}…</div>
      ${d.monetaryImpact?.totalBillion ? `<div style="font-size:9px;color:#3fb950">Total impact: $${d.monetaryImpact.totalBillion}B</div>` : ''}
    </div>`;
  });
  html += `</div></details>`;

  /* ── Detour cost calculator ── */
  html += `<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">
    <div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:6px">🧮 Detour Cost Calculator</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">
      <div>
        <div style="font-size:9px;color:var(--text-muted);margin-bottom:2px">Blocked Route</div>
        <select id="td-route-sel" style="width:100%;background:var(--bg-panel);border:1px solid var(--border);color:var(--text);font-size:9px;padding:3px;border-radius:3px">
          ${Object.keys(TD_ROUTES).map(r => `<option value="${_tdEsc(r)}">${_tdEsc(r)}</option>`).join('')}
        </select>
      </div>
      <div>
        <div style="font-size:9px;color:var(--text-muted);margin-bottom:2px">Commodity</div>
        <select id="td-comm-sel" style="width:100%;background:var(--bg-panel);border:1px solid var(--border);color:var(--text);font-size:9px;padding:3px;border-radius:3px">
          ${TD_COMMODITIES.map(c => `<option value="${c.valuePerTon}">${_tdEsc(c.name)} ($${c.valuePerTon}/t)</option>`).join('')}
        </select>
      </div>
    </div>
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
      <div style="flex:1">
        <div style="font-size:9px;color:var(--text-muted);margin-bottom:2px">Volume (tonnes)</div>
        <input id="td-vol-inp" type="number" value="50000" min="100" max="500000" step="1000"
          style="width:100%;background:var(--bg-panel);border:1px solid var(--border);color:var(--text);font-size:9px;padding:3px;border-radius:3px">
      </div>
      <div style="padding-top:12px">
        <button onclick="tradeCalcDetour()" style="background:#1f6feb;color:#fff;border:none;border-radius:3px;padding:5px 10px;font-size:9px;cursor:pointer">Calculate</button>
      </div>
    </div>
    <div id="td-calc-result"></div>
  </div>
  <div style="font-size:9px;color:var(--text-muted);margin-top:6px;padding-top:4px;border-top:1px solid var(--border)">
    Sources: Global Trade Monitor dataset · GDELT live feed · No API key required
  </div>`;

  html += `</div>`;
  el.innerHTML = html;
};

window.tradeCalcDetour = function() {
  const routeKey  = document.getElementById('td-route-sel')?.value;
  const valuePerT = parseFloat(document.getElementById('td-comm-sel')?.value || 560);
  const volume    = parseFloat(document.getElementById('td-vol-inp')?.value || 50000);
  const out       = document.getElementById('td-calc-result');
  if (!out) return;

  const r = _tdCalcDetour(routeKey, valuePerT, volume);
  if (!r) { out.innerHTML = `<div style="font-size:9px;color:var(--text-muted)">Select a route</div>`; return; }

  out.innerHTML = `<div style="background:var(--bg-panel);border:1px solid var(--border);border-radius:4px;padding:8px;font-size:9px">
    <div style="font-weight:700;color:var(--text);margin-bottom:5px">Reroute via ${_tdEsc(r.detourName)}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px">
      <span style="color:var(--text-muted)">Extra distance</span><span style="color:var(--text)">${Number(r.extraKm).toLocaleString()} km</span>
      <span style="color:var(--text-muted)">Extra transit</span><span style="color:var(--text)">${r.extraDays} days</span>
      <span style="color:var(--text-muted)">Fuel cost</span><span style="color:#d29922">$${r.fuelM}M</span>
      <span style="color:var(--text-muted)">Holding cost</span><span style="color:#d29922">$${r.holdingM}M</span>
      <span style="color:var(--text-muted);font-weight:600">Total cost</span><span style="color:#f85149;font-weight:700;font-size:11px">$${r.totalM}M</span>
    </div>
  </div>`;
};

// Re-render on auth-ready
window.addEventListener('finterm:auth-ready', () => {
  const el = document.getElementById('supply-traderoutes');
  if (el?.dataset.loaded) { el.dataset.loaded = ''; tradeRoutesLoad(); }
});
