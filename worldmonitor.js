/* ══════════════════════════════════════════════════════════════════
   FINTERM — worldmonitor.js
   WorldMonitor.app live data integration
   Panels: SUPPLY · ALERT · MACRO + enhanced Geo·Risk tabs
   Bootstrap endpoint: https://worldmonitor.app/api/bootstrap
   All data from Upstash Redis cache — no auth required from browser
   ══════════════════════════════════════════════════════════════════ */

const WM_BASE = 'https://worldmonitor.app';
const WM_KEY  = (() => {
  try { return localStorage.getItem('finterm_key_wm') || ''; } catch { return ''; }
})();

/* ── Bootstrap cache TTLs ────────────────────────────────────────── */
const WM_CACHE   = new Map(); // key → { data, ts }
const WM_TTL_MS  = { fast: 60_000, slow: 300_000 };

/* ── Fetch bootstrap data (batch) ───────────────────────────────── */
async function wmBootstrap(keys) {
  const needed   = keys.filter(k => {
    const c = WM_CACHE.get(k);
    return !c || Date.now() - c.ts > WM_TTL_MS.fast;
  });

  if (needed.length > 0) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (WM_KEY) headers['X-WorldMonitor-Key'] = WM_KEY;
      const url = `${WM_BASE}/api/bootstrap?keys=${needed.join(',')}`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const { data } = await res.json();
        for (const [k, v] of Object.entries(data || {})) {
          WM_CACHE.set(k, { data: v, ts: Date.now() });
        }
      }
    } catch (e) {
      console.warn('[WM] bootstrap fetch failed:', e.message);
    }
  }

  const result = {};
  for (const k of keys) {
    const c = WM_CACHE.get(k);
    if (c) result[k] = c.data;
  }
  return result;
}

/* ── Generic REST fetch ─────────────────────────────────────────── */
async function wmFetch(path, params = {}) {
  const url = new URL(`${WM_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers = {};
  if (WM_KEY) headers['X-WorldMonitor-Key'] = WM_KEY;
  const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`WM ${path} → ${res.status}`);
  return res.json();
}

/* ─────────────────────────────────────────────────────────────────
   SHARED UTILITIES
   ───────────────────────────────────────────────────────────────── */
function wmEsc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wmRelTime(ts) {
  if (!ts) return '';
  const d = Date.now() - (ts > 1e12 ? ts : ts * 1000);
  if (d < 60000)  return `${Math.round(d/1000)}s ago`;
  if (d < 3600000) return `${Math.round(d/60000)}m ago`;
  if (d < 86400000) return `${Math.round(d/3600000)}h ago`;
  return `${Math.round(d/86400000)}d ago`;
}

function wmSeverityColor(level) {
  const lc = String(level || '').toLowerCase();
  if (['critical','extreme','high'].includes(lc)) return { text:'#ff4757', bg:'rgba(255,71,87,.12)', border:'rgba(255,71,87,.35)' };
  if (['elevated','medium','moderate'].includes(lc)) return { text:'#ffa500', bg:'rgba(255,165,0,.12)', border:'rgba(255,165,0,.3)' };
  if (['low','minor','minimal'].includes(lc)) return { text:'#00d4a0', bg:'rgba(0,212,160,.1)', border:'rgba(0,212,160,.25)' };
  return { text:'#7a9bb5', bg:'rgba(122,155,181,.1)', border:'rgba(122,155,181,.25)' };
}

function wmBadge(label, level) {
  const c = wmSeverityColor(level);
  return `<span class="wm-badge" style="color:${c.text};background:${c.bg};border-color:${c.border}">${wmEsc(label)}</span>`;
}

function wmSpinner(msg = 'Loading…') {
  return `<div class="wm-loading"><div class="wm-spin"></div><span>${msg}</span></div>`;
}

function wmError(msg) {
  return `<div class="wm-empty">⚠ ${wmEsc(msg)}</div>`;
}

function wmEmpty(msg) {
  return `<div class="wm-empty">— ${wmEsc(msg)}</div>`;
}

function wmLiveBar(text, sub = '') {
  return `<div class="wm-live-bar"><span class="wm-live-dot"></span><span>${wmEsc(text)}</span>${sub ? `<span class="wm-live-sub">${sub}</span>` : ''}</div>`;
}

/* ─────────────────────────────────────────────────────────────────
   PANEL: SUPPLY CHAIN INTELLIGENCE
   Bootstrap keys: chokepoints, shippingRates, minerals, macroSignals
   ───────────────────────────────────────────────────────────────── */

function wmSupplyInit() {
  const panel = document.getElementById('panel-supply');
  if (!panel) return;
  if (typeof initDrag   === 'function') initDrag(panel);
  if (typeof initResize === 'function') initResize(panel);
  if (typeof bringToFront === 'function') bringToFront(panel);
  wmSupplyLoad();
}

async function wmSupplyLoad() {
  // Trigger each tab to load on first view
  wmSupplyChokepoints();
  wmSupplyShipping();
  wmSupplyMinerals();
}

/* CHOKE tab */
async function wmSupplyChokepoints() {
  const el = document.getElementById('supply-choke');
  if (!el) return;
  el.innerHTML = wmSpinner('Fetching chokepoints…');
  try {
    const d = await wmBootstrap(['chokepoints']);
    const items = d.chokepoints?.chokepoints || d.chokepoints?.data || d.chokepoints || [];
    if (!Array.isArray(items) || !items.length) {
      el.innerHTML = wmError('No chokepoint data available');
      return;
    }
    el.innerHTML = wmLiveBar('Strategic chokepoints & shipping lanes', `${items.length} monitored`) +
      items.map(c => {
        const risk = c.riskLevel || c.risk_level || c.status || 'unknown';
        const col = wmSeverityColor(risk);
        const disruption = c.disruption_pct ?? c.disruptionPct ?? c.throughputReduction ?? null;
        const delay = c.avgDelayDays ?? c.delay_days ?? null;
        const traffic = c.dailyVessels || c.vessel_count || null;
        return `<div class="wm-choke-card" style="border-left:3px solid ${col.border}">
          <div class="wm-choke-header">
            <span class="wm-choke-icon">${wmEsc(c.emoji || c.icon || '🌊')}</span>
            <div class="wm-choke-info">
              <span class="wm-choke-name">${wmEsc(c.name)}</span>
              <span class="wm-choke-region">${wmEsc(c.region || c.location || '')}</span>
            </div>
            ${wmBadge(risk.toUpperCase(), risk)}
          </div>
          <div class="wm-choke-stats">
            ${disruption != null ? `<span class="wm-stat-chip">📉 ${disruption}% disruption</span>` : ''}
            ${delay != null ? `<span class="wm-stat-chip">⏱ +${delay}d delay</span>` : ''}
            ${traffic != null ? `<span class="wm-stat-chip">🚢 ${traffic} vessels/day</span>` : ''}
            ${c.tradePct ? `<span class="wm-stat-chip">📦 ${c.tradePct}% global trade</span>` : ''}
          </div>
          ${c.note || c.description ? `<div class="wm-choke-note">${wmEsc(c.note || c.description)}</div>` : ''}
          ${c.affectedCommodities?.length ? `<div class="wm-choke-commodities">${c.affectedCommodities.map(x => `<span class="wm-comm-chip">${wmEsc(x)}</span>`).join('')}</div>` : ''}
        </div>`;
      }).join('');
  } catch(e) {
    el.innerHTML = wmError(e.message);
  }
}

/* SHIP tab */
async function wmSupplyShipping() {
  const el = document.getElementById('supply-ship');
  if (!el) return;
  el.innerHTML = wmSpinner('Fetching shipping rates…');
  try {
    const d = await wmBootstrap(['shippingRates']);
    const rates = d.shippingRates?.rates || d.shippingRates?.data || d.shippingRates || [];
    const arr = Array.isArray(rates) ? rates : Object.entries(rates).map(([k,v]) => ({ route: k, ...v }));
    if (!arr.length) { el.innerHTML = wmError('No shipping data available'); return; }

    const ts = d.shippingRates?.updatedAt || d.shippingRates?.timestamp;
    el.innerHTML = wmLiveBar('Global shipping rates', ts ? wmRelTime(ts) : '') +
      `<div class="wm-ship-grid">` +
      arr.map(r => {
        const val   = r.rate ?? r.value ?? r.price ?? 0;
        const prev  = r.prevRate ?? r.previousRate ?? r.prev ?? null;
        const chg   = prev ? ((val - prev) / prev * 100).toFixed(1) : null;
        const trend = chg == null ? '' : chg > 0 ? `<span class="wm-up">▲ ${chg}%</span>` : chg < 0 ? `<span class="wm-dn">▼ ${Math.abs(chg)}%</span>` : `<span class="wm-flat">— 0%</span>`;
        return `<div class="wm-ship-card">
          <div class="wm-ship-route">${wmEsc(r.route || r.name || r.corridor || '')}</div>
          <div class="wm-ship-val">$${Number(val).toLocaleString()}</div>
          <div class="wm-ship-meta">${wmEsc(r.unit || '/FEU')} ${trend}</div>
          ${r.note ? `<div class="wm-ship-note">${wmEsc(r.note)}</div>` : ''}
        </div>`;
      }).join('') + `</div>`;
  } catch(e) {
    el.innerHTML = wmError(e.message);
  }
}

/* MINERALS tab */
async function wmSupplyMinerals() {
  const el = document.getElementById('supply-minerals');
  if (!el) return;
  el.innerHTML = wmSpinner('Fetching critical minerals…');
  try {
    const d = await wmBootstrap(['minerals']);
    const items = d.minerals?.minerals || d.minerals?.data || d.minerals || [];
    const arr = Array.isArray(items) ? items : Object.values(items);
    if (!arr.length) { el.innerHTML = wmError('No minerals data available'); return; }

    el.innerHTML = wmLiveBar('Critical minerals — extraction & supply risk') +
      arr.map(m => {
        const risk = m.supplyRisk || m.risk || m.riskLevel || 'unknown';
        const col  = wmSeverityColor(risk);
        const topProducers = m.topProducers || m.producers || [];
        return `<div class="wm-min-row" style="border-left:3px solid ${col.border}">
          <div class="wm-min-header">
            <span class="wm-min-icon">${wmEsc(m.emoji || m.icon || '⛏️')}</span>
            <div class="wm-min-info">
              <span class="wm-min-name">${wmEsc(m.name || m.mineral || '')}</span>
              <span class="wm-min-use">${wmEsc(m.primaryUse || m.uses?.[0] || m.application || '')}</span>
            </div>
            ${wmBadge(risk.toUpperCase(), risk)}
          </div>
          ${topProducers.length ? `<div class="wm-min-producers">
            ${topProducers.map(p => {
              const conc = typeof p === 'object' ? `${wmEsc(p.country||p.name)} ${p.pct ? p.pct+'%' : ''}` : wmEsc(p);
              return `<span class="wm-prod-chip">${conc}</span>`;
            }).join('')}
          </div>` : ''}
          ${m.conflictExposure || m.conflict ? `<div class="wm-min-conflict">⚠ ${wmEsc(m.conflictExposure || m.conflict)}</div>` : ''}
        </div>`;
      }).join('');
  } catch(e) {
    el.innerHTML = wmError(e.message);
  }
}

/* ─────────────────────────────────────────────────────────────────
   PANEL: GLOBAL ALERT FEED
   Bootstrap keys: weatherAlerts, earthquakes, unrestEvents, 
                   wildfires, flightDelays, naturalEvents
   ───────────────────────────────────────────────────────────────── */

function wmAlertInit() {
  const panel = document.getElementById('panel-alert');
  if (!panel) return;
  if (typeof initDrag   === 'function') initDrag(panel);
  if (typeof initResize === 'function') initResize(panel);
  if (typeof bringToFront === 'function') bringToFront(panel);
  wmAlertLoad('all');
}

async function wmAlertLoad(filter = 'all') {
  // Update active filter button
  document.querySelectorAll('#panel-alert .wm-filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === filter);
  });

  const el = document.getElementById('alert-feed');
  if (!el) return;
  el.innerHTML = wmSpinner('Loading global alerts…');

  try {
    const keys = ['weatherAlerts','earthquakes','unrestEvents','wildfires','naturalEvents'];
    const d = await wmBootstrap(keys);

    const events = [];

    // Weather Alerts
    const wxAlerts = d.weatherAlerts?.alerts || d.weatherAlerts?.data || d.weatherAlerts || [];
    (Array.isArray(wxAlerts) ? wxAlerts : []).forEach(a => {
      events.push({
        type:'weather', icon:'🌪', category: a.event || a.type || 'Weather Alert',
        title: a.headline || a.title || a.event || 'Weather Alert',
        severity: a.severity || a.level || 'moderate',
        location: a.area || a.regions?.join(', ') || a.country || '',
        ts: a.timestamp || a.onset || a.effective || a.sent,
        note: a.description || a.instruction || '',
      });
    });

    // Earthquakes
    const quakes = d.earthquakes?.earthquakes || d.earthquakes?.data || d.earthquakes?.features || d.earthquakes || [];
    (Array.isArray(quakes) ? quakes : []).slice(0, 20).forEach(q => {
      const mag  = q.magnitude || q.mag || q.properties?.mag;
      const place = q.place || q.location || q.properties?.place || '';
      const sev  = mag >= 7 ? 'critical' : mag >= 5.5 ? 'high' : mag >= 4 ? 'medium' : 'low';
      events.push({
        type:'quake', icon:'🏔', category:'Earthquake',
        title: `M${Number(mag).toFixed(1)} — ${place}`,
        severity: sev,
        location: place,
        ts: q.time || q.timestamp || q.properties?.time,
        note: q.depth != null ? `Depth: ${q.depth}km` : '',
        extra: mag,
      });
    });

    // Unrest
    const unrest = d.unrestEvents?.events || d.unrestEvents?.data || d.unrestEvents || [];
    (Array.isArray(unrest) ? unrest : []).slice(0, 15).forEach(u => {
      events.push({
        type:'unrest', icon:'✊', category: u.type || u.eventType || 'Unrest',
        title: u.title || u.headline || u.description || 'Social unrest event',
        severity: u.severity || u.level || 'medium',
        location: u.country || u.location || u.region || '',
        ts: u.timestamp || u.date || u.eventDate,
        note: u.note || u.source || '',
      });
    });

    // Wildfires
    const fires = d.wildfires?.fires || d.wildfires?.data || d.wildfires || [];
    (Array.isArray(fires) ? fires : []).slice(0, 10).forEach(f => {
      const area = f.area_ha || f.areaHa || f.area;
      events.push({
        type:'fire', icon:'🔥', category:'Wildfire',
        title: f.name || f.title || f.location || 'Active wildfire',
        severity: f.containment === 0 ? 'critical' : f.containment < 30 ? 'high' : 'medium',
        location: f.country || f.region || f.state || '',
        ts: f.updated || f.timestamp || f.detected,
        note: area ? `${Number(area).toLocaleString()} ha burned` : '',
      });
    });

    // Natural Events
    const natural = d.naturalEvents?.events || d.naturalEvents?.data || d.naturalEvents || [];
    (Array.isArray(natural) ? natural : []).slice(0, 10).forEach(n => {
      events.push({
        type:'natural', icon:'🌊', category: n.type || n.category || 'Natural Event',
        title: n.title || n.description || 'Natural event',
        severity: n.severity || n.level || 'medium',
        location: n.country || n.region || n.location || '',
        ts: n.timestamp || n.date,
        note: n.note || '',
      });
    });

    // Filter
    const filtered = filter === 'all' ? events :
      events.filter(e => e.type === filter);

    // Sort by severity then recency
    const sevOrder = { critical: 4, high: 3, medium: 2, elevated: 3, moderate: 2, low: 1 };
    filtered.sort((a, b) => {
      const sd = (sevOrder[b.severity?.toLowerCase()] || 1) - (sevOrder[a.severity?.toLowerCase()] || 1);
      if (sd !== 0) return sd;
      return (b.ts || 0) - (a.ts || 0);
    });

    if (!filtered.length) {
      el.innerHTML = wmEmpty('No events in this category');
      return;
    }

    el.innerHTML = filtered.map(ev => {
      const col = wmSeverityColor(ev.severity);
      const time = wmRelTime(ev.ts);
      return `<div class="wm-alert-row" style="border-left:3px solid ${col.border}">
        <div class="wm-alert-header">
          <span class="wm-alert-icon">${ev.icon}</span>
          <div class="wm-alert-body">
            <div class="wm-alert-title">${wmEsc(ev.title)}</div>
            <div class="wm-alert-meta">
              ${ev.location ? `<span>📍 ${wmEsc(ev.location)}</span>` : ''}
              ${time ? `<span>${time}</span>` : ''}
              <span class="wm-alert-cat">${wmEsc(ev.category)}</span>
            </div>
            ${ev.note ? `<div class="wm-alert-note">${wmEsc(ev.note)}</div>` : ''}
          </div>
          ${wmBadge(ev.severity.toUpperCase(), ev.severity)}
        </div>
      </div>`;
    }).join('');

  } catch(e) {
    el.innerHTML = wmError(e.message);
  }
}

/* ─────────────────────────────────────────────────────────────────
   PANEL: MACRO INTELLIGENCE
   Bootstrap keys: macroSignals, commodityQuotes, predictions,
                   sectors, riskScores
   ───────────────────────────────────────────────────────────────── */

function wmMacroInit() {
  const panel = document.getElementById('panel-macro');
  if (!panel) return;
  if (typeof initDrag   === 'function') initDrag(panel);
  if (typeof initResize === 'function') initResize(panel);
  if (typeof bringToFront === 'function') bringToFront(panel);
  wmMacroSignals();
  wmMacroCommodities();
  wmMacroRisk();
  wmMacroPredictions();
}

/* MACRO SIGNALS */
async function wmMacroSignals() {
  const el = document.getElementById('macro-signals');
  if (!el) return;
  el.innerHTML = wmSpinner('Fetching macro signals…');
  try {
    const d = await wmBootstrap(['macroSignals']);
    const signals = d.macroSignals?.signals || d.macroSignals?.data || d.macroSignals || [];
    const arr = Array.isArray(signals) ? signals : Object.entries(signals).map(([k,v]) => ({ name: k, ...v }));
    if (!arr.length) { el.innerHTML = wmError('No macro signals available'); return; }

    el.innerHTML = wmLiveBar('Macro signals — economic intelligence') +
      arr.slice(0, 20).map(s => {
        const chg = s.change ?? s.delta ?? s.percentChange;
        const isPos = chg > 0;
        const trendCls = chg == null ? 'wm-flat' : isPos ? 'wm-up' : 'wm-dn';
        const arrow = chg == null ? '' : isPos ? '▲' : '▼';
        return `<div class="wm-macro-row">
          <div class="wm-macro-label">${wmEsc(s.name || s.indicator || s.key || '')}</div>
          <div class="wm-macro-val">${wmEsc(s.value != null ? String(s.value) : '—')}</div>
          ${chg != null ? `<div class="${trendCls} wm-macro-chg">${arrow} ${Math.abs(chg).toFixed(2)}%</div>` : '<div class="wm-flat">—</div>'}
          ${s.signal ? `<div class="wm-macro-sig">${wmEsc(s.signal)}</div>` : ''}
        </div>`;
      }).join('');
  } catch(e) {
    el.innerHTML = wmError(e.message);
  }
}

/* COMMODITIES from WM */
async function wmMacroCommodities() {
  const el = document.getElementById('macro-comm');
  if (!el) return;
  el.innerHTML = wmSpinner('Fetching commodities…');
  try {
    const d = await wmBootstrap(['commodityQuotes']);
    const quotes = d.commodityQuotes?.quotes || d.commodityQuotes?.data || d.commodityQuotes || [];
    const arr = Array.isArray(quotes) ? quotes : Object.values(quotes);
    if (!arr.length) { el.innerHTML = wmError('No commodity data available'); return; }

    const ts = d.commodityQuotes?.updatedAt || d.commodityQuotes?.timestamp;
    el.innerHTML = wmLiveBar('Commodity prices', ts ? wmRelTime(ts) : '') +
      `<div class="wm-comm-grid">` +
      arr.slice(0, 24).map(q => {
        const price = q.price ?? q.value ?? q.last ?? q.close;
        const chg   = q.changePercent ?? q.change_pct ?? q.pctChange ?? q.change;
        const isPos = chg >= 0;
        return `<div class="wm-comm-card">
          <div class="wm-comm-name">${wmEsc(q.name || q.symbol || q.ticker || '')}</div>
          <div class="wm-comm-price">${price != null ? '$' + Number(price).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) : '—'}</div>
          ${chg != null ? `<div class="${isPos ? 'wm-up' : 'wm-dn'}">${isPos ? '▲' : '▼'} ${Math.abs(chg).toFixed(2)}%</div>` : ''}
          ${q.unit ? `<div class="wm-comm-unit">${wmEsc(q.unit)}</div>` : ''}
        </div>`;
      }).join('') + `</div>`;
  } catch(e) {
    el.innerHTML = wmError(e.message);
  }
}

/* RISK SCORES */
async function wmMacroRisk() {
  const el = document.getElementById('macro-risk');
  if (!el) return;
  el.innerHTML = wmSpinner('Fetching risk scores…');
  try {
    const d = await wmBootstrap(['riskScores']);
    const raw    = d.riskScores?.scores || d.riskScores?.data || d.riskScores || {};
    const scores = Array.isArray(raw) ? raw :
      Object.entries(raw).map(([k,v]) => typeof v === 'object' ? { country: k, ...v } : { country: k, score: v });

    if (!scores.length) { el.innerHTML = wmError('No risk scores available'); return; }

    scores.sort((a,b) => (b.score ?? b.value ?? 0) - (a.score ?? a.value ?? 0));

    el.innerHTML = wmLiveBar('Country instability index — risk scores') +
      scores.slice(0, 25).map(s => {
        const score = s.score ?? s.value ?? s.cii ?? 0;
        const pct   = Math.min(100, Math.max(0, score));
        const level = pct >= 75 ? 'critical' : pct >= 50 ? 'high' : pct >= 30 ? 'medium' : 'low';
        const col   = wmSeverityColor(level);
        return `<div class="wm-risk-row">
          <span class="wm-risk-country">${wmEsc(s.country || s.code || s.name || '')}</span>
          <div class="wm-risk-bar-wrap">
            <div class="wm-risk-bar" style="width:${pct}%;background:${col.text}"></div>
          </div>
          <span class="wm-risk-score" style="color:${col.text}">${Math.round(pct)}</span>
        </div>`;
      }).join('');
  } catch(e) {
    el.innerHTML = wmError(e.message);
  }
}

/* PREDICTION MARKETS */
async function wmMacroPredictions() {
  const el = document.getElementById('macro-pred');
  if (!el) return;
  el.innerHTML = wmSpinner('Fetching prediction markets…');
  try {
    const d = await wmBootstrap(['predictions']);
    const preds = d.predictions?.predictions || d.predictions?.markets || d.predictions?.data || d.predictions || [];
    const arr = Array.isArray(preds) ? preds : Object.values(preds);
    if (!arr.length) { el.innerHTML = wmError('No prediction market data'); return; }

    const ts = d.predictions?.updatedAt || d.predictions?.timestamp;
    el.innerHTML = wmLiveBar('Prediction markets (Polymarket)', ts ? wmRelTime(ts) : '') +
      arr.slice(0, 15).map(p => {
        const prob  = p.probability ?? p.yes ?? p.yesPrice ?? p.outcome_probability;
        const pct   = prob != null ? (prob <= 1 ? Math.round(prob * 100) : Math.round(prob)) : null;
        const title = p.question || p.title || p.market || '';
        const cat   = p.category || p.type || '';
        const level = pct != null ? (pct >= 70 ? 'critical' : pct >= 40 ? 'high' : 'medium') : 'low';
        const col   = wmSeverityColor(level);
        return `<div class="wm-pred-row">
          <div class="wm-pred-q">${wmEsc(title)}</div>
          <div class="wm-pred-meta">
            ${cat ? `<span class="wm-pred-cat">${wmEsc(cat)}</span>` : ''}
            ${p.volume ? `<span>Vol $${Number(p.volume).toLocaleString()}</span>` : ''}
            ${p.endDate ? `<span>Ends ${wmEsc(new Date(p.endDate).toLocaleDateString('en-GB', {day:'numeric',month:'short'}))}</span>` : ''}
          </div>
          ${pct != null ? `<div class="wm-pred-prob">
            <div class="wm-pred-bar-bg">
              <div class="wm-pred-bar-fill" style="width:${pct}%;background:${col.text}"></div>
            </div>
            <span class="wm-pred-pct" style="color:${col.text}">${pct}%</span>
          </div>` : ''}
        </div>`;
      }).join('');
  } catch(e) {
    el.innerHTML = wmError(e.message);
  }
}

/* ─────────────────────────────────────────────────────────────────
   ENHANCED GEO·RISK TABS
   New tabs: INTEL · SIGNALS · QUAKES
   ───────────────────────────────────────────────────────────────── */

/* INTEL tab: theater posture + risk scores */
async function wmGeoIntel() {
  const el = document.getElementById('geo-intel');
  if (!el) return;
  el.innerHTML = wmSpinner('Fetching theater posture…');
  try {
    const d = await wmBootstrap(['theaterPosture', 'riskScores', 'iranEvents']);
    const theaters  = d.theaterPosture?.theaters || d.theaterPosture?.data || d.theaterPosture || [];
    const riskRaw   = d.riskScores?.scores || d.riskScores?.data || d.riskScores || {};
    const riskArr   = Array.isArray(riskRaw) ? riskRaw :
      Object.entries(riskRaw).map(([k,v]) => typeof v === 'object' ? { country: k, ...v } : { country: k, score: v });
    const iranEvents = d.iranEvents?.events || d.iranEvents?.data || d.iranEvents || [];

    let html = wmLiveBar('Theater posture & intelligence', 'WorldMonitor live feed');

    // Theater posture
    if (Array.isArray(theaters) && theaters.length) {
      html += `<div class="wm-section-head">⚔ Military Theater Posture</div>`;
      html += theaters.map(t => {
        const level = t.alertLevel || t.level || t.posture || 'unknown';
        const col   = wmSeverityColor(level);
        const assets = t.assets || t.forces || [];
        return `<div class="wm-theater-card" style="border-left:3px solid ${col.border}">
          <div class="wm-theater-header">
            <span class="wm-theater-name">${wmEsc(t.theater || t.name || t.region || '')}</span>
            ${wmBadge(level.toUpperCase(), level)}
          </div>
          ${t.summary || t.description ? `<div class="wm-theater-note">${wmEsc(t.summary || t.description)}</div>` : ''}
          ${assets.length ? `<div class="wm-theater-assets">${assets.slice(0,5).map(a => `<span class="wm-asset-chip">${wmEsc(typeof a === 'object' ? a.name || a.type : a)}</span>`).join('')}</div>` : ''}
        </div>`;
      }).join('');
    }

    // Iran events (high-priority intelligence)
    if (Array.isArray(iranEvents) && iranEvents.length) {
      html += `<div class="wm-section-head">🇮🇷 Iran Events (Intelligence)</div>`;
      html += iranEvents.slice(0, 8).map(ev => {
        const level = ev.severity || ev.level || ev.category || 'medium';
        const col   = wmSeverityColor(level);
        const ts    = wmRelTime(ev.timestamp || ev.date);
        return `<div class="wm-intel-row" style="border-left:3px solid ${col.border}">
          <div class="wm-intel-title">${wmEsc(ev.title || ev.description || ev.event || '')}</div>
          <div class="wm-intel-meta">
            ${ev.location ? `<span>📍 ${wmEsc(ev.location)}</span>` : ''}
            ${ts ? `<span>${ts}</span>` : ''}
            ${wmBadge(level.toUpperCase(), level)}
          </div>
        </div>`;
      }).join('');
    }

    // Risk scores heatmap (top 15 highest risk)
    if (riskArr.length) {
      riskArr.sort((a,b) => (b.score ?? 0) - (a.score ?? 0));
      html += `<div class="wm-section-head">🌡 Instability Index — Top Risk Countries</div>`;
      html += `<div class="wm-risk-heatmap">` +
        riskArr.slice(0, 15).map(s => {
          const pct   = Math.min(100, Math.max(0, s.score ?? 0));
          const level = pct >= 75 ? 'critical' : pct >= 50 ? 'high' : pct >= 30 ? 'medium' : 'low';
          const col   = wmSeverityColor(level);
          return `<div class="wm-heat-cell" style="background:${col.bg};border-color:${col.border}">
            <span class="wm-heat-country">${wmEsc(s.country || s.code || '')}</span>
            <span class="wm-heat-score" style="color:${col.text}">${Math.round(pct)}</span>
          </div>`;
        }).join('') + `</div>`;
    }

    if (html === wmLiveBar('Theater posture & intelligence', 'WorldMonitor live feed')) {
      html += wmEmpty('No intelligence data available');
    }

    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = wmError(e.message);
  }
}

/* SIGNALS tab: news insights */
async function wmGeoSignals() {
  const el = document.getElementById('geo-signals');
  if (!el) return;
  el.innerHTML = wmSpinner('Fetching intelligence signals…');
  try {
    const d = await wmBootstrap(['insights']);
    const insights = d.insights?.insights || d.insights?.data || d.insights?.items || d.insights || [];
    const arr = Array.isArray(insights) ? insights : Object.values(insights);
    if (!arr.length) { el.innerHTML = wmError('No signal data available'); return; }

    const ts = d.insights?.updatedAt || d.insights?.timestamp;
    el.innerHTML = wmLiveBar('Intelligence signals — news & market convergence', ts ? wmRelTime(ts) : '') +
      arr.slice(0, 20).map(s => {
        const sev = s.severity || s.importance || s.level || s.priority || 'medium';
        const col = wmSeverityColor(sev);
        const time = wmRelTime(s.timestamp || s.publishedAt || s.date);
        const ticker = s.ticker || s.symbol || s.asset;
        return `<div class="wm-signal-row" style="border-left:3px solid ${col.border}">
          <div class="wm-signal-header">
            ${wmBadge(sev.toUpperCase(), sev)}
            ${s.category ? `<span class="wm-signal-cat">${wmEsc(s.category)}</span>` : ''}
            ${time ? `<span class="wm-signal-time">${time}</span>` : ''}
            ${ticker ? `<span class="wm-signal-ticker" onclick="if(typeof loadTicker==='function')loadTicker('${wmEsc(ticker)}')">${wmEsc(ticker)}</span>` : ''}
          </div>
          <div class="wm-signal-title">${wmEsc(s.title || s.headline || s.summary || '')}</div>
          ${s.body || s.description ? `<div class="wm-signal-body">${wmEsc((s.body || s.description).slice(0, 180))}${(s.body || s.description).length > 180 ? '…' : ''}</div>` : ''}
          ${s.tags?.length ? `<div class="wm-signal-tags">${s.tags.slice(0,4).map(t=>`<span class="wm-tag">${wmEsc(t)}</span>`).join('')}</div>` : ''}
        </div>`;
      }).join('');
  } catch(e) {
    el.innerHTML = wmError(e.message);
  }
}

/* QUAKES tab: earthquakes + natural events */
async function wmGeoQuakes() {
  const el = document.getElementById('geo-quakes');
  if (!el) return;
  el.innerHTML = wmSpinner('Fetching seismic & natural events…');
  try {
    const d = await wmBootstrap(['earthquakes', 'naturalEvents']);
    const quakes  = d.earthquakes?.earthquakes || d.earthquakes?.features || d.earthquakes?.data || d.earthquakes || [];
    const natural = d.naturalEvents?.events || d.naturalEvents?.data || d.naturalEvents || [];

    let html = wmLiveBar('Seismic activity & natural hazards');

    // Significant quakes (M4+)
    const sigQuakes = (Array.isArray(quakes) ? quakes : [])
      .filter(q => (q.magnitude || q.mag || q.properties?.mag || 0) >= 4)
      .sort((a,b) => (b.magnitude || b.mag || b.properties?.mag || 0) - (a.magnitude || a.mag || a.properties?.mag || 0))
      .slice(0, 15);

    if (sigQuakes.length) {
      html += `<div class="wm-section-head">🏔 Significant Earthquakes (M4.0+)</div>`;
      html += sigQuakes.map(q => {
        const mag   = q.magnitude || q.mag || q.properties?.mag || 0;
        const place = q.place || q.location || q.properties?.place || 'Unknown';
        const depth = q.depth || q.properties?.dmin;
        const ts    = wmRelTime(q.time || q.timestamp || q.properties?.time);
        const sev   = mag >= 7 ? 'critical' : mag >= 5.5 ? 'high' : mag >= 4 ? 'medium' : 'low';
        const col   = wmSeverityColor(sev);
        return `<div class="wm-quake-row" style="border-left:3px solid ${col.border}">
          <span class="wm-quake-mag" style="color:${col.text}">M${Number(mag).toFixed(1)}</span>
          <div class="wm-quake-info">
            <div class="wm-quake-place">${wmEsc(place)}</div>
            <div class="wm-quake-meta">
              ${depth != null ? `<span>Depth ${Number(depth).toFixed(0)}km</span>` : ''}
              ${ts ? `<span>${ts}</span>` : ''}
            </div>
          </div>
        </div>`;
      }).join('');
    }

    // Natural events
    const natArr = (Array.isArray(natural) ? natural : []).slice(0, 10);
    if (natArr.length) {
      html += `<div class="wm-section-head">🌊 Natural Hazards</div>`;
      html += natArr.map(n => {
        const sev = n.severity || n.level || 'medium';
        const col = wmSeverityColor(sev);
        const ts  = wmRelTime(n.timestamp || n.date);
        return `<div class="wm-nat-row" style="border-left:3px solid ${col.border}">
          <div class="wm-nat-header">
            <span class="wm-nat-type">${wmEsc(n.type || n.category || 'Event')}</span>
            ${wmBadge(sev.toUpperCase(), sev)}
          </div>
          <div class="wm-nat-title">${wmEsc(n.title || n.description || '')}</div>
          <div class="wm-nat-meta">
            ${n.country || n.region ? `<span>📍 ${wmEsc(n.country || n.region)}</span>` : ''}
            ${ts ? `<span>${ts}</span>` : ''}
          </div>
        </div>`;
      }).join('');
    }

    if (!sigQuakes.length && !natArr.length) {
      html += wmEmpty('No significant seismic/natural events');
    }

    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = wmError(e.message);
  }
}

/* ─────────────────────────────────────────────────────────────────
   FLIGHT DELAYS panel (for supply chain alert system)
   ───────────────────────────────────────────────────────────────── */
async function wmSupplyFlights() {
  const el = document.getElementById('supply-flights');
  if (!el) return;
  el.innerHTML = wmSpinner('Fetching flight delay data…');
  try {
    const d = await wmBootstrap(['flightDelays']);
    const delays = d.flightDelays?.delays || d.flightDelays?.airports || d.flightDelays?.data || d.flightDelays || [];
    const arr = Array.isArray(delays) ? delays : Object.values(delays);
    if (!arr.length) { el.innerHTML = wmError('No flight delay data'); return; }

    el.innerHTML = wmLiveBar('Airport delays — supply chain air freight') +
      `<div class="wm-flight-grid">` +
      arr.slice(0, 20).map(a => {
        const sev = a.severity || a.level ||
          (a.avgDelay >= 60 ? 'high' : a.avgDelay >= 30 ? 'medium' : 'low');
        const col = wmSeverityColor(sev);
        return `<div class="wm-flight-card" style="border-color:${col.border}">
          <div class="wm-flight-code" style="color:${col.text}">${wmEsc(a.code || a.iata || a.airport || '')}</div>
          <div class="wm-flight-name">${wmEsc(a.name || a.city || '')}</div>
          ${a.avgDelay != null ? `<div class="wm-flight-delay">${a.avgDelay}m avg</div>` : ''}
          ${a.reason || a.cause ? `<div class="wm-flight-reason">${wmEsc(a.reason || a.cause)}</div>` : ''}
        </div>`;
      }).join('') + `</div>`;
  } catch(e) {
    el.innerHTML = wmError(e.message);
  }
}

/* EIA Energy data (petroleum proxy) */
async function wmSupplyEnergy() {
  const el = document.getElementById('supply-energy');
  if (!el) return;
  el.innerHTML = wmSpinner('Fetching energy data…');
  try {
    const res = await wmFetch('/api/eia/petroleum');
    const wti   = res.wti || res.WTI;
    const brent = res.brent || res.BRENT;
    const prod  = res.usProduction || res.production;
    const inv   = res.inventories || res.inventory;

    el.innerHTML = wmLiveBar('EIA Petroleum — crude & production') +
      `<div class="wm-energy-grid">
        ${wti ? `<div class="wm-energy-card"><div class="wm-energy-label">WTI Crude</div><div class="wm-energy-val">$${Number(wti.price || wti.value || wti).toFixed(2)}</div><div class="wm-energy-unit">$/bbl</div></div>` : ''}
        ${brent ? `<div class="wm-energy-card"><div class="wm-energy-label">Brent Crude</div><div class="wm-energy-val">$${Number(brent.price || brent.value || brent).toFixed(2)}</div><div class="wm-energy-unit">$/bbl</div></div>` : ''}
        ${prod ? `<div class="wm-energy-card"><div class="wm-energy-label">US Production</div><div class="wm-energy-val">${Number(prod.value || prod).toLocaleString()}</div><div class="wm-energy-unit">kb/d</div></div>` : ''}
        ${inv ? `<div class="wm-energy-card"><div class="wm-energy-label">US Inventories</div><div class="wm-energy-val">${Number(inv.value || inv).toLocaleString()}</div><div class="wm-energy-unit">Mbbl</div></div>` : ''}
      </div>`;
  } catch(e) {
    // EIA not available without key in some environments — show helpful message
    el.innerHTML = wmEmpty('EIA energy data unavailable (may require WM API key)');
  }
}

/* ─────────────────────────────────────────────────────────────────
   INIT — called from DOMContentLoaded
   ───────────────────────────────────────────────────────────────── */
function wmInitAll() {
  wmSupplyInit();
  wmAlertInit();
  wmMacroInit();

  // Inject new Geo·Risk tabs content
  wmGeoIntel();
  wmGeoSignals();
  wmGeoQuakes();

  // Supply panel tab: flights + energy (lazy — triggered on tab switch or init)
  wmSupplyFlights();
  wmSupplyEnergy();

  // Auto-refresh every 2 minutes
  setInterval(() => {
    WM_CACHE.clear(); // clear cache to force fresh data
    wmSupplyChokepoints();
    wmSupplyShipping();
    wmAlertLoad(document.querySelector('#panel-alert .wm-filter-btn.active')?.dataset.filter || 'all');
    wmMacroSignals();
    wmMacroCommodities();
    wmMacroRisk();
    wmMacroPredictions();
    wmGeoIntel();
    wmGeoSignals();
    wmGeoQuakes();
  }, 120_000);
}

document.addEventListener('DOMContentLoaded', wmInitAll);

/* ══════════════════════════════════════════════════════════════════
   INTEL FEED PANEL
   Breaking alerts: riskScores delta, insights, unrest, iran events,
   cyberThreats — styled like WorldMonitor Intelligence Findings
   ══════════════════════════════════════════════════════════════════ */

/* ── State ──────────────────────────────────────────────────────── */
let wmIntelAlerts       = [];       // master list, newest first
let wmIntelSeenIds      = new Set();
let wmIntelPopupEnabled = false;
let wmIntelBreaking     = true;
let wmIntelFilter       = 'all';

/* ── Map resource/event keyword → finterm topic ────────────────── */
const WM_RESOURCE_TOPIC = {
  // Energy
  'oil':'oil', 'crude':'oil', 'wti':'oil', 'brent':'oil',
  'lng':'lng', 'natural gas':'gas', 'gas':'gas',
  'petroleum':'oil', 'energy':'energy', 'pipeline':'energy',
  // Metals & mining
  'gold':'gold', 'silver':'silver', 'copper':'copper', 'iron':'iron',
  'steel':'steel', 'aluminum':'aluminum', 'lithium':'lithium',
  'cobalt':'mining', 'uranium':'mining', 'rare earths':'mining',
  'palladium':'metals', 'titanium':'metals', 'nickel':'metals',
  'tin':'metals', 'tungsten':'metals',
  // Agriculture
  'wheat':'agriculture', 'grain':'agriculture', 'corn':'agriculture',
  'soy':'agriculture', 'cotton':'agriculture', 'sesame':'agriculture',
  'fertilizer':'agriculture', 'potash':'agriculture',
  // Shipping & logistics
  'shipping':'shipping', 'container':'shipping', 'suez':'shipping',
  'hormuz':'oil', 'chokepoint':'shipping', 'red sea':'shipping',
  'taiwan strait':'semiconductor', 'black sea':'grain',
  // Tech & semiconductors
  'semiconductor':'semiconductor', 'chip':'semiconductor', 'tsmc':'semiconductor',
  'tech':'tech', 'technology':'tech',
  // Defense & conflict
  'defense':'defense', 'military':'defense', 'war':'defense',
  'conflict':'defense', 'sanctions':'defense',
  // Finance & macro
  'dollar':'finance', 'fed':'finance', 'inflation':'finance',
  'gdp':'finance', 'macro':'finance',
  // Countries → sectors
  'ukraine':'energy', 'russia':'energy', 'iran':'oil',
  'china':'tech', 'taiwan':'semiconductor',
  'iran instability':'oil', 'lebanon':'defense', 'iraq':'oil',
};

function wmResourceToTopic(label) {
  const lc = label.toLowerCase();
  for (const [kw, topic] of Object.entries(WM_RESOURCE_TOPIC)) {
    if (lc.includes(kw)) return topic;
  }
  return lc.split(/[\s/,]+/)[0]; // fallback: first word
}

/* ── Build alert objects from bootstrap data ───────────────────── */
function wmBuildIntelAlerts(d) {
  const now  = Date.now();
  const list = [];

  // 1. Insights (highest priority)
  const insights = d.insights?.insights || d.insights?.items || d.insights?.data || d.insights || [];
  (Array.isArray(insights) ? insights : []).forEach((s, i) => {
    const sev = s.severity || s.importance || s.level || s.priority || 'medium';
    const id  = `insight-${s.id || s.timestamp || i}`;
    list.push({
      id, type:'insight', icon:'🧠',
      severity: sev,
      title: s.title || s.headline || s.summary || 'Intelligence signal',
      subtitle: s.body || s.description || '',
      detail: s.recommendation || s.action || '',
      ts: s.timestamp || s.publishedAt || s.date || now,
      ticker: s.ticker || s.symbol || s.asset || null,
      tags:   s.tags || [],
      resource: s.title || '',
    });
  });

  // 2. Iran events (always high priority)
  const irans = d.iranEvents?.events || d.iranEvents?.data || d.iranEvents || [];
  (Array.isArray(irans) ? irans : []).forEach((e, i) => {
    const id = `iran-${e.id || e.timestamp || i}`;
    list.push({
      id, type:'iran', icon:'🇮🇷',
      severity: e.severity || e.level || 'high',
      title: e.title || e.description || e.event || 'Iran event',
      subtitle: e.location ? `📍 ${e.location}` : '',
      detail: e.note || '',
      ts: e.timestamp || e.date || now,
      ticker: null,
      resource: e.title || '',
    });
  });

  // 3. Unrest events
  const unrest = d.unrestEvents?.events || d.unrestEvents?.data || d.unrestEvents || [];
  (Array.isArray(unrest) ? unrest : []).slice(0, 8).forEach((u, i) => {
    const id = `unrest-${u.id || u.timestamp || i}`;
    list.push({
      id, type:'unrest', icon:'✊',
      severity: u.severity || u.level || 'medium',
      title: `"${u.country || u.location || u.topic || 'Unrest'}" Trending`,
      subtitle: u.description || u.title || '',
      detail: u.note || '',
      ts: u.timestamp || u.eventDate || now,
      ticker: null,
      resource: u.country || '',
    });
  });

  // 4. Risk score spikes (score > 60 = high, > 80 = critical)
  const riskRaw = d.riskScores?.scores || d.riskScores?.data || d.riskScores || {};
  const riskArr = Array.isArray(riskRaw) ? riskRaw :
    Object.entries(riskRaw).map(([k, v]) => typeof v === 'object' ? { country: k, ...v } : { country: k, score: v });
  riskArr.filter(r => (r.score ?? 0) >= 60).sort((a, b) => b.score - a.score).slice(0, 6).forEach((r, i) => {
    const id  = `risk-${r.country || i}`;
    const pct = Math.round(r.score ?? 0);
    const sev = pct >= 80 ? 'critical' : 'high';
    list.push({
      id, type:'risk', icon:'🌡',
      severity: sev,
      title: `${r.country || r.code || 'Country'} Instability ${sev === 'critical' ? 'Critical' : 'Rising'}`,
      subtitle: `Instability index ${pct}/100. ${r.driver || r.cause || r.note || ''}`,
      detail: r.summary || '',
      ts: r.updatedAt || now,
      ticker: null,
      resource: r.country || '',
    });
  });

  // 5. Weather alerts
  const wx = d.weatherAlerts?.alerts || d.weatherAlerts?.data || d.weatherAlerts || [];
  (Array.isArray(wx) ? wx : []).filter(a => {
    const sev = (a.severity || '').toLowerCase();
    return ['extreme','severe','high','critical'].includes(sev);
  }).slice(0, 5).forEach((a, i) => {
    const id = `wx-${a.id || a.timestamp || i}`;
    list.push({
      id, type:'weather', icon:'🌪',
      severity: a.severity || 'high',
      title: a.headline || a.event || a.title || 'Severe Weather Alert',
      subtitle: a.area || a.regions?.join(', ') || a.country || '',
      detail: a.instruction || a.description || '',
      ts: a.timestamp || a.onset || now,
      ticker: null,
      resource: a.event || 'weather',
    });
  });

  // 6. Cyber threats
  const cyber = d.cyberThreats?.threats || d.cyberThreats?.data || d.cyberThreats || [];
  (Array.isArray(cyber) ? cyber : []).slice(0, 4).forEach((c, i) => {
    const id = `cyber-${c.id || c.timestamp || i}`;
    list.push({
      id, type:'cyber', icon:'💻',
      severity: c.severity || c.level || 'medium',
      title: c.title || c.name || c.type || 'Cyber threat',
      subtitle: c.target || c.sector || c.description || '',
      detail: c.indicator || c.cve || '',
      ts: c.timestamp || c.detectedAt || now,
      ticker: null,
      resource: c.sector || 'cyber',
    });
  });

  // Sort: critical first, then by time
  const sevOrd = { critical: 4, extreme: 4, high: 3, elevated: 3, medium: 2, low: 1 };
  list.sort((a, b) => {
    const sd = (sevOrd[b.severity?.toLowerCase()] || 1) - (sevOrd[a.severity?.toLowerCase()] || 1);
    if (sd !== 0) return sd;
    const at = a.ts > 1e12 ? a.ts : a.ts * 1000;
    const bt = b.ts > 1e12 ? b.ts : b.ts * 1000;
    return bt - at;
  });

  return list;
}

/* ── Render the intel feed ──────────────────────────────────────── */
function wmRenderIntelFeed() {
  const el = document.getElementById('intel-feed-list');
  if (!el) return;

  const filtered = wmIntelFilter === 'all' ? wmIntelAlerts :
    wmIntelAlerts.filter(a => a.type === wmIntelFilter);

  if (!filtered.length) {
    el.innerHTML = `<div class="wm-intel-empty">No alerts in this category</div>`;
    return;
  }

  const critCount = wmIntelAlerts.filter(a =>
    ['critical','extreme'].includes(a.severity?.toLowerCase())).length;

  const badge = document.getElementById('intel-feed-badge');
  if (badge) {
    badge.textContent = critCount > 0 ? `${critCount} CRITICAL` : `${wmIntelAlerts.length} ALERTS`;
    badge.style.background = critCount > 0 ? '#ff4757' : '#ffa500';
  }

  el.innerHTML = filtered.map(alert => {
    const col  = wmSeverityColor(alert.severity);
    const time = wmRelTime(alert.ts);
    const sevLabel = (alert.severity || 'INFO').toUpperCase();
    const topic = wmResourceToTopic(alert.resource || alert.title || '');

    return `<div class="wm-intel-card" data-id="${wmEsc(alert.id)}"
        style="border-left:3px solid ${col.border}"
        onclick="wmIntelCardClick(event, ${JSON.stringify(alert).replace(/"/g, '&quot;')})">
      <div class="wm-ic-header">
        <span class="wm-ic-icon">${alert.icon}</span>
        <div class="wm-ic-title">${wmEsc(alert.title)}</div>
        <span class="wm-ic-badge" style="background:${col.bg};color:${col.text};border-color:${col.border}">${sevLabel}</span>
      </div>
      ${alert.subtitle ? `<div class="wm-ic-sub">${wmEsc(alert.subtitle)}</div>` : ''}
      ${alert.detail ? `<div class="wm-ic-detail">${wmEsc(alert.detail.slice(0, 120))}${alert.detail.length > 120 ? '…' : ''}</div>` : ''}
      <div class="wm-ic-footer">
        <span class="wm-ic-time">${time}</span>
        ${alert.ticker ? `<span class="wm-ic-ticker" onclick="event.stopPropagation();wmResourceLink('${wmEsc(alert.ticker)}','${wmEsc(topic)}')">${wmEsc(alert.ticker)}</span>` : ''}
        <span class="wm-ic-link" onclick="event.stopPropagation();wmResourceLink('${wmEsc(alert.resource || alert.title || '')}','${wmEsc(topic)}')">→ News &amp; Watchlist</span>
      </div>
    </div>`;
  }).join('');

  // Popup toast for new breaking alerts
  if (wmIntelBreaking && wmIntelPopupEnabled) {
    const newOnes = filtered.filter(a => !wmIntelSeenIds.has(a.id) &&
      ['critical','extreme','high'].includes(a.severity?.toLowerCase()));
    newOnes.forEach(a => {
      wmIntelSeenIds.add(a.id);
      wmIntelToast(a);
    });
  }
  filtered.forEach(a => wmIntelSeenIds.add(a.id));
}

/* ── Load & refresh intel data ──────────────────────────────────── */
async function wmIntelLoad() {
  const el = document.getElementById('intel-feed-list');
  if (el && !wmIntelAlerts.length) el.innerHTML = wmSpinner('Scanning intelligence feeds…');

  try {
    const keys = ['insights', 'iranEvents', 'unrestEvents', 'riskScores', 'weatherAlerts', 'cyberThreats'];
    const d = await wmBootstrap(keys);
    wmIntelAlerts = wmBuildIntelAlerts(d);
    wmRenderIntelFeed();
  } catch(e) {
    const el2 = document.getElementById('intel-feed-list');
    if (el2) el2.innerHTML = wmError(e.message);
  }
}

/* ── Toast notification ─────────────────────────────────────────── */
function wmIntelToast(alert) {
  const col = wmSeverityColor(alert.severity);
  const t = document.createElement('div');
  t.className = 'wm-toast';
  t.style.cssText = `border-left:3px solid ${col.border};`;
  t.innerHTML = `<div class="wm-toast-head">
    <span>${alert.icon}</span>
    <span class="wm-toast-sev" style="color:${col.text}">${(alert.severity||'').toUpperCase()}</span>
    <span class="wm-toast-close" onclick="this.parentElement.parentElement.remove()">✕</span>
  </div>
  <div class="wm-toast-title">${wmEsc(alert.title)}</div>`;
  document.body.appendChild(t);
  setTimeout(() => { t.classList.add('wm-toast-fade'); setTimeout(() => t.remove(), 500); }, 5000);
}

/* ── Intel panel filter ─────────────────────────────────────────── */
function wmIntelSetFilter(f) {
  wmIntelFilter = f;
  document.querySelectorAll('#panel-intel .wm-intel-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.type === f));
  wmRenderIntelFeed();
}

/* ── Intel panel init ───────────────────────────────────────────── */
function wmIntelInit() {
  const panel = document.getElementById('panel-intel');
  if (!panel) return;
  if (typeof initDrag   === 'function') initDrag(panel);
  if (typeof initResize === 'function') initResize(panel);
  if (typeof bringToFront === 'function') bringToFront(panel);
  wmIntelLoad();
  // Refresh every 90s
  setInterval(wmIntelLoad, 90_000);
}

/* ══════════════════════════════════════════════════════════════════
   RESOURCE LINK — click on any resource/chokepoint/mineral
   Opens a side drawer with news + sector watchlist
   ══════════════════════════════════════════════════════════════════ */

function wmIntelCardClick(event, alert) {
  // If click was on a specific button, handled by that button
  if (event.target.closest('.wm-ic-link, .wm-ic-ticker')) return;
  wmResourceLink(alert.resource || alert.title, wmResourceToTopic(alert.resource || alert.title));
}

function wmResourceLink(resourceLabel, topic) {
  // Open the resource drawer
  wmResourceDrawerOpen(resourceLabel, topic);
}

/* ── Resource Drawer ────────────────────────────────────────────── */
function wmResourceDrawerOpen(resourceLabel, topic) {
  let drawer = document.getElementById('wm-resource-drawer');
  if (!drawer) {
    drawer = document.createElement('div');
    drawer.id = 'wm-resource-drawer';
    drawer.innerHTML = `
      <div class="wm-drawer-header">
        <div class="wm-drawer-title-wrap">
          <span id="wm-drawer-icon">⚡</span>
          <span id="wm-drawer-title">Resource</span>
        </div>
        <div class="wm-drawer-actions">
          <button class="wm-drawer-act-btn" id="wm-drawer-news-btn" onclick="wmDrawerGoNews()">📰 Open in News</button>
          <button class="wm-drawer-act-btn" id="wm-drawer-wl-btn" onclick="wmDrawerGoWatchlist()">📊 Load Watchlist</button>
          <button class="wm-drawer-close" onclick="wmResourceDrawerClose()">✕</button>
        </div>
      </div>
      <div class="wm-drawer-tabs">
        <button class="wm-drawer-tab active" data-tab="news"  onclick="wmDrawerTab('news')">📰 News</button>
        <button class="wm-drawer-tab"        data-tab="stocks" onclick="wmDrawerTab('stocks')">📊 Stocks</button>
        <button class="wm-drawer-tab"        data-tab="context" onclick="wmDrawerTab('context')">🌐 Context</button>
      </div>
      <div class="wm-drawer-body" id="wm-drawer-news-pane"></div>
      <div class="wm-drawer-body hidden" id="wm-drawer-stocks-pane"></div>
      <div class="wm-drawer-body hidden" id="wm-drawer-context-pane"></div>
    `;
    document.body.appendChild(drawer);
    // Click outside to close
    document.addEventListener('click', (e) => {
      if (drawer && !drawer.contains(e.target) &&
          !e.target.closest('[onclick*="wmResourceLink"],[onclick*="wmIntelCard"],[class*="wm-ic-"],[class*="wm-choke"],[class*="wm-min-"],[class*="wm-signal-"],[class*="wm-alert-"]'))
        wmResourceDrawerClose();
    }, { capture: true });
  }

  // Store current resource/topic
  drawer.dataset.resource = resourceLabel;
  drawer.dataset.topic = topic;

  // Update header
  const icon = document.getElementById('wm-drawer-icon');
  const title = document.getElementById('wm-drawer-title');
  if (icon) icon.textContent = wmResourceIcon(resourceLabel);
  if (title) title.textContent = resourceLabel;

  // Show drawer
  drawer.classList.add('open');
  document.getElementById('wm-drawer-news-btn').dataset.topic = topic;
  document.getElementById('wm-drawer-wl-btn').dataset.topic = topic;

  // Load news tab immediately
  wmDrawerTab('news');
  wmDrawerLoadNews(resourceLabel, topic);
  wmDrawerLoadStocks(resourceLabel, topic);
  wmDrawerLoadContext(resourceLabel, topic);
}

function wmResourceDrawerClose() {
  const d = document.getElementById('wm-resource-drawer');
  if (d) d.classList.remove('open');
}

function wmDrawerTab(tab) {
  document.querySelectorAll('.wm-drawer-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('wm-drawer-news-pane').classList.toggle('hidden', tab !== 'news');
  document.getElementById('wm-drawer-stocks-pane').classList.toggle('hidden', tab !== 'stocks');
  document.getElementById('wm-drawer-context-pane').classList.toggle('hidden', tab !== 'context');
}

/* NEWS pane: fetch from WM insights filtered by resource keyword */
async function wmDrawerLoadNews(resourceLabel, topic) {
  const el = document.getElementById('wm-drawer-news-pane');
  if (!el) return;
  el.innerHTML = wmSpinner(`Fetching news for "${resourceLabel}"…`);

  try {
    const d = await wmBootstrap(['insights']);
    const all = d.insights?.insights || d.insights?.items || d.insights?.data || d.insights || [];
    const kw  = resourceLabel.toLowerCase();

    // Filter insights relevant to this resource
    const relevant = (Array.isArray(all) ? all : []).filter(a => {
      const txt = `${a.title||''} ${a.body||''} ${a.description||''} ${(a.tags||[]).join(' ')}`.toLowerCase();
      return txt.includes(kw) || txt.includes(topic.toLowerCase());
    });

    // Show matched insights first, then all insights as fallback
    const toShow = relevant.length ? relevant : (Array.isArray(all) ? all.slice(0, 10) : []);

    if (!toShow.length) {
      el.innerHTML = `<div class="wm-drawer-hint">
        No matching intelligence signals. 
        <a href="#" onclick="wmDrawerGoNews();return false;">Open news panel to search "${wmEsc(resourceLabel)}"</a>
      </div>`;
      return;
    }

    el.innerHTML = `<div class="wm-drawer-news-head">${relevant.length ? `${relevant.length} signals matching` : 'Latest signals'} — <em>${wmEsc(resourceLabel)}</em></div>` +
      toShow.slice(0, 12).map(s => {
        const sev = s.severity || s.importance || s.level || 'medium';
        const col = wmSeverityColor(sev);
        const ticker = s.ticker || s.symbol;
        return `<div class="wm-drawer-news-item" style="border-left:2px solid ${col.border}">
          <div class="wm-drawer-news-title">${wmEsc(s.title || s.headline || '')}</div>
          <div class="wm-drawer-news-meta">
            ${wmRelTime(s.timestamp || s.date) || ''}
            ${ticker ? `<span class="wm-ic-ticker" style="margin-left:6px;cursor:pointer"
              onclick="wmResourceDrawerClose();setTimeout(()=>{ if(typeof loadTickerFromWatchlist==='function')loadTickerFromWatchlist('${wmEsc(ticker)}');},100)">${wmEsc(ticker)}</span>` : ''}
            ${wmBadge(sev.toUpperCase(), sev)}
          </div>
          ${s.body || s.description ? `<div class="wm-drawer-news-body">${wmEsc((s.body||s.description).slice(0,160))}…</div>` : ''}
        </div>`;
      }).join('');
  } catch(e) {
    el.innerHTML = wmError(e.message);
  }
}

/* STOCKS pane: trigger sector watchlist in main panel */
async function wmDrawerLoadStocks(resourceLabel, topic) {
  const el = document.getElementById('wm-drawer-stocks-pane');
  if (!el) return;
  el.innerHTML = wmSpinner(`Loading sector stocks for "${topic}"…`);

  // Use FINTERM's own watchlist function to populate the watchlist panel
  const seedTickers = WM_TOPIC_TICKERS[topic] || WM_TOPIC_TICKERS[resourceLabel.toLowerCase()] || [];

  el.innerHTML = `<div class="wm-drawer-stocks-head">
    <span>Sector: <strong>${wmEsc(topic)}</strong></span>
    <button class="wm-drawer-act-btn" onclick="wmDrawerGoWatchlist()">→ Load in Watchlist panel</button>
  </div>` +
    (seedTickers.length ? seedTickers.map(t => `
    <div class="wm-drawer-stock-row" onclick="wmResourceDrawerClose();setTimeout(()=>{ if(typeof loadTickerFromWatchlist==='function')loadTickerFromWatchlist('${wmEsc(t)}');},100)">
      <span class="wm-drawer-stock-ticker">${wmEsc(t)}</span>
      <span class="wm-drawer-stock-hint">Load chart & data →</span>
    </div>`).join('')
    : `<div class="wm-drawer-hint">
        <a href="#" onclick="wmDrawerGoWatchlist();return false;">Load "${wmEsc(topic)}" in the Watchlist panel →</a>
       </div>`);
}

/* CONTEXT pane: supply chain + risk data for this resource */
async function wmDrawerLoadContext(resourceLabel, topic) {
  const el = document.getElementById('wm-drawer-context-pane');
  if (!el) return;
  el.innerHTML = wmSpinner('Loading supply chain context…');

  try {
    const d = await wmBootstrap(['chokepoints', 'minerals', 'riskScores', 'shippingRates']);
    const kw = resourceLabel.toLowerCase();
    let html = '';

    // Related chokepoints
    const chokes = d.chokepoints?.chokepoints || d.chokepoints?.data || d.chokepoints || [];
    const relChokes = (Array.isArray(chokes) ? chokes : []).filter(c =>
      (c.affectedCommodities||[]).some(x => x.toLowerCase().includes(kw)) ||
      (c.name||'').toLowerCase().includes(kw) ||
      (c.note||'').toLowerCase().includes(kw)
    );
    if (relChokes.length) {
      html += `<div class="wm-ctx-section">🌊 Related Chokepoints</div>` +
        relChokes.map(c => {
          const col = wmSeverityColor(c.riskLevel || c.risk || 'medium');
          return `<div class="wm-ctx-item" style="border-left:2px solid ${col.border}">
            <span class="wm-ctx-name">${wmEsc(c.name||'')}</span>
            ${wmBadge((c.riskLevel||c.risk||'').toUpperCase(), c.riskLevel||c.risk)}
            ${c.note ? `<div class="wm-ctx-note">${wmEsc(c.note.slice(0,120))}</div>` : ''}
          </div>`;
        }).join('');
    }

    // Related minerals
    const mins = d.minerals?.minerals || d.minerals?.data || d.minerals || [];
    const relMins = (Array.isArray(mins) ? mins : []).filter(m =>
      (m.name||m.mineral||'').toLowerCase().includes(kw) ||
      (m.primaryUse||'').toLowerCase().includes(kw)
    );
    if (relMins.length) {
      html += `<div class="wm-ctx-section">⛏️ Related Minerals</div>` +
        relMins.map(m => {
          const col = wmSeverityColor(m.supplyRisk || m.risk || 'medium');
          return `<div class="wm-ctx-item" style="border-left:2px solid ${col.border}">
            <span class="wm-ctx-name">${wmEsc(m.name || m.mineral || '')}</span>
            ${wmBadge((m.supplyRisk||m.risk||'').toUpperCase(), m.supplyRisk||m.risk)}
            ${m.conflictExposure ? `<div class="wm-ctx-note">⚠ ${wmEsc(m.conflictExposure)}</div>` : ''}
          </div>`;
        }).join('');
    }

    // Risk scores for related countries
    const riskRaw = d.riskScores?.scores || d.riskScores?.data || d.riskScores || {};
    const riskArr = Array.isArray(riskRaw) ? riskRaw :
      Object.entries(riskRaw).map(([k,v]) => typeof v==='object' ? {country:k,...v} : {country:k,score:v});
    const relRisk = riskArr.filter(r =>
      (r.country||r.code||'').toLowerCase().includes(kw) || kw.includes((r.country||r.code||'').toLowerCase())
    ).slice(0, 5);
    if (relRisk.length) {
      html += `<div class="wm-ctx-section">🌡 Country Risk</div>` +
        relRisk.map(r => {
          const pct = Math.round(r.score ?? 0);
          const sev = pct >= 75 ? 'critical' : pct >= 50 ? 'high' : pct >= 30 ? 'medium' : 'low';
          const col = wmSeverityColor(sev);
          return `<div class="wm-ctx-item wm-ctx-risk">
            <span class="wm-ctx-name">${wmEsc(r.country||r.code||'')}</span>
            <div class="wm-ctx-risk-bar"><div style="width:${pct}%;background:${col.text}"></div></div>
            <span style="color:${col.text};font-weight:700;font-family:monospace">${pct}</span>
          </div>`;
        }).join('');
    }

    if (!html) {
      html = `<div class="wm-drawer-hint">No specific supply chain data for "${wmEsc(resourceLabel)}".<br>
        Try searching a broader term.</div>`;
    }
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = wmError(e.message);
  }
}

/* ── Navigate to main panels ────────────────────────────────────── */
function wmDrawerGoNews() {
  const drawer = document.getElementById('wm-resource-drawer');
  const topic  = drawer?.dataset.topic || drawer?.dataset.resource || '';
  wmResourceDrawerClose();
  // Put topic in the topic input and trigger news search
  const ti = document.getElementById('topicInput');
  if (ti) { ti.value = topic; }
  if (typeof searchTopicNews === 'function') {
    setTimeout(() => searchTopicNews(), 100);
  } else {
    // fallback: trigger Enter on topicInput
    ti?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }
  if (typeof showPanel === 'function') showPanel('news');
}

function wmDrawerGoWatchlist() {
  const drawer = document.getElementById('wm-resource-drawer');
  const topic  = drawer?.dataset.topic || drawer?.dataset.resource || '';
  wmResourceDrawerClose();
  const ti = document.getElementById('topicInput');
  if (ti) { ti.value = topic; }
  if (typeof loadWatchlist === 'function') {
    setTimeout(() => loadWatchlist(topic), 100);
  }
  if (typeof showPanel === 'function') {
    showPanel('watchlist');
    showPanel('news');
  }
}

/* ── Resource icon helper ───────────────────────────────────────── */
function wmResourceIcon(label) {
  const lc = label.toLowerCase();
  if (lc.includes('oil') || lc.includes('crude') || lc.includes('petroleum')) return '🛢️';
  if (lc.includes('gas') || lc.includes('lng'))  return '⛽';
  if (lc.includes('gold'))  return '🥇';
  if (lc.includes('silver')) return '🪙';
  if (lc.includes('copper')) return '🔴';
  if (lc.includes('iron') || lc.includes('steel')) return '🔩';
  if (lc.includes('lithium') || lc.includes('cobalt') || lc.includes('rare')) return '🔋';
  if (lc.includes('chip') || lc.includes('semi')) return '🔬';
  if (lc.includes('wheat') || lc.includes('grain') || lc.includes('corn')) return '🌾';
  if (lc.includes('ship') || lc.includes('suez') || lc.includes('hormuz')) return '🚢';
  if (lc.includes('iran')) return '🇮🇷';
  if (lc.includes('ukraine') || lc.includes('russia')) return '⚔️';
  if (lc.includes('taiwan')) return '🇹🇼';
  if (lc.includes('weather') || lc.includes('storm')) return '🌪';
  if (lc.includes('quake') || lc.includes('seismic')) return '🏔';
  if (lc.includes('fire') || lc.includes('wildfire')) return '🔥';
  if (lc.includes('cyber')) return '💻';
  return '⚡';
}

/* ── Resource→tickers map (extends topicSeedTicker) ────────────── */
const WM_TOPIC_TICKERS = {
  oil:       ['XOM','CVX','COP','OXY','BP','SHEL'],
  energy:    ['XOM','CVX','LNG','NEE','ENPH','SLB'],
  gas:       ['LNG','CVX','XOM','RRC','EQT'],
  gold:      ['NEM','GOLD','AEM','AGI','WPM'],
  silver:    ['WPM','AG','HL','PAN'],
  copper:    ['FCX','SCCO','TECK','HBM'],
  iron:      ['RIO','BHP','VALE','MT'],
  steel:     ['NUE','STLD','X','CLF','MT'],
  aluminum:  ['AA','CENX','KALU','RIO'],
  lithium:   ['ALB','SQM','LTHM','PLL','LAC'],
  mining:    ['RIO','BHP','VALE','FCX','NEM','AA'],
  metals:    ['FCX','AA','NEM','RIO','BHP'],
  shipping:  ['ZIM','MATX','DAC','GSL','MPC'],
  semiconductor: ['NVDA','TSM','ASML','INTC','AMD','QCOM'],
  tech:      ['AAPL','MSFT','NVDA','GOOGL','META'],
  defense:   ['LMT','RTX','NOC','GD','BA'],
  agriculture: ['ADM','BG','MOS','NTR','CF'],
  uranium:   ['CCJ','NXE','DNN','URG'],
  coal:      ['BTU','ARCH','CEIX','AMR'],
  finance:   ['JPM','GS','BAC','MS','C'],
  macro:     ['SPY','TLT','GLD','DX-Y.NYB'],
  cyber:     ['CRWD','PANW','ZS','S','FTNT'],
};

/* ── Patch existing resource/chokepoint renders to add click ────── */
function wmAddResourceClicks() {
  // Geo·Risk RESOURCES tab rows
  document.querySelectorAll('.geo-resource-row').forEach(row => {
    const name = row.querySelector('.geo-resource-name')?.textContent || '';
    if (name && !row.dataset.wmLinked) {
      row.dataset.wmLinked = '1';
      row.style.cursor = 'pointer';
      row.addEventListener('click', (e) => {
        if (!e.target.closest('a')) {
          wmResourceLink(name, wmResourceToTopic(name));
        }
      });
    }
  });

  // Geo·Risk ROUTES tab cards
  document.querySelectorAll('.geo-route-card').forEach(card => {
    const name = card.querySelector('.geo-route-name')?.textContent || '';
    if (name && !card.dataset.wmLinked) {
      card.dataset.wmLinked = '1';
      card.style.cursor = 'pointer';
      card.addEventListener('click', (e) => {
        if (!e.target.closest('a')) wmResourceLink(name, wmResourceToTopic(name));
      });
    }
  });

  // Geo·Risk WARS tab resource chips
  document.querySelectorAll('.geo-res-chip').forEach(chip => {
    const name = chip.textContent.replace(/^[^\w]+/, '').trim();
    if (name && !chip.dataset.wmLinked) {
      chip.dataset.wmLinked = '1';
      chip.style.cursor = 'pointer';
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        wmResourceLink(name, wmResourceToTopic(name));
      });
    }
  });

  // Supply chain chokepoint cards
  document.querySelectorAll('.wm-choke-card').forEach(card => {
    if (!card.dataset.wmLinked) {
      const name = card.querySelector('.wm-choke-name')?.textContent || '';
      card.dataset.wmLinked = '1';
      card.style.cursor = 'pointer';
      card.addEventListener('click', (e) => {
        if (!e.target.closest('.wm-badge')) wmResourceLink(name, wmResourceToTopic(name));
      });
    }
  });

  // Mineral rows
  document.querySelectorAll('.wm-min-row').forEach(row => {
    if (!row.dataset.wmLinked) {
      const name = row.querySelector('.wm-min-name')?.textContent || '';
      row.dataset.wmLinked = '1';
      row.style.cursor = 'pointer';
      row.addEventListener('click', (e) => {
        if (!e.target.closest('.wm-badge')) wmResourceLink(name, wmResourceToTopic(name));
      });
    }
  });

  // Alert rows
  document.querySelectorAll('.wm-alert-row').forEach(row => {
    if (!row.dataset.wmLinked) {
      const title = row.querySelector('.wm-alert-title')?.textContent || '';
      const cat   = row.querySelector('.wm-alert-cat')?.textContent || '';
      row.dataset.wmLinked = '1';
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => wmResourceLink(title, wmResourceToTopic(cat || title)));
    }
  });
}

/* Run click patch after renders complete */
const _wmClickObserver = new MutationObserver(() => wmAddResourceClicks());
document.addEventListener('DOMContentLoaded', () => {
  _wmClickObserver.observe(document.body, { childList: true, subtree: true });
});

/* ── Extend wmInitAll ────────────────────────────────────────────── */
const _wmOrigInit = typeof wmInitAll === 'function' ? wmInitAll : null;
function wmInitAll() {
  if (_wmOrigInit) _wmOrigInit();
  wmIntelInit();
}

/* ══════════════════════════════════════════════════════════════════
   WM TICKER ENRICHMENT
   Connects WorldMonitor live data to all 7 main panels:
   News · Quote · Analysts · Ownership · Comparables · Watchlist · Valuation
   Called automatically whenever a ticker is loaded anywhere in FINTERM.
   ══════════════════════════════════════════════════════════════════ */

/* ── Ticker → geopolitical/supply context map ───────────────────── */
const WM_TICKER_CONTEXT = {
  /* Energy */
  XOM:  { topic:'oil',      country:'US',  risk:'medium', tags:['oil','energy','pipeline'] },
  CVX:  { topic:'oil',      country:'US',  risk:'medium', tags:['oil','lng','energy'] },
  COP:  { topic:'oil',      country:'US',  risk:'low',    tags:['oil','shale'] },
  BP:   { topic:'oil',      country:'GB',  risk:'medium', tags:['oil','energy','russia'] },
  SHEL: { topic:'oil',      country:'GB',  risk:'medium', tags:['lng','oil','energy'] },
  LNG:  { topic:'lng',      country:'US',  risk:'low',    tags:['lng','gas','shipping'] },
  SLB:  { topic:'oil',      country:'US',  risk:'medium', tags:['oil','oilfield','sanctions'] },
  /* Metals & Mining */
  FCX:  { topic:'copper',   country:'US',  risk:'medium', tags:['copper','mining','chile'] },
  NEM:  { topic:'gold',     country:'US',  risk:'low',    tags:['gold','mining'] },
  GOLD: { topic:'gold',     country:'CA',  risk:'low',    tags:['gold','mining'] },
  RIO:  { topic:'iron',     country:'GB',  risk:'medium', tags:['iron','mining','china'] },
  BHP:  { topic:'mining',   country:'AU',  risk:'medium', tags:['iron','copper','mining'] },
  VALE: { topic:'iron',     country:'BR',  risk:'high',   tags:['iron','mining','brazil'] },
  AA:   { topic:'aluminum', country:'US',  risk:'low',    tags:['aluminum','smelting'] },
  ALB:  { topic:'lithium',  country:'US',  risk:'medium', tags:['lithium','battery','chile'] },
  /* Semiconductors */
  NVDA: { topic:'semiconductor', country:'US', risk:'medium', tags:['chip','taiwan','ai','sanctions'] },
  TSM:  { topic:'semiconductor', country:'TW', risk:'high',   tags:['taiwan','chip','china','foundry'] },
  ASML: { topic:'semiconductor', country:'NL', risk:'medium', tags:['euv','chip','sanctions','china'] },
  INTC: { topic:'semiconductor', country:'US', risk:'low',    tags:['chip','foundry','us'] },
  AMD:  { topic:'semiconductor', country:'US', risk:'medium', tags:['chip','ai','china'] },
  QCOM: { topic:'semiconductor', country:'US', risk:'medium', tags:['chip','china','5g'] },
  /* Defense */
  LMT:  { topic:'defense',  country:'US',  risk:'low',    tags:['defense','military','ukraine','nato'] },
  RTX:  { topic:'defense',  country:'US',  risk:'low',    tags:['defense','missiles','ukraine'] },
  NOC:  { topic:'defense',  country:'US',  risk:'low',    tags:['defense','aerospace','military'] },
  GD:   { topic:'defense',  country:'US',  risk:'low',    tags:['defense','navy','armor'] },
  BA:   { topic:'aerospace', country:'US', risk:'medium', tags:['aerospace','defense','supply-chain'] },
  /* Shipping & Logistics */
  ZIM:  { topic:'shipping', country:'IL',  risk:'high',   tags:['shipping','red-sea','suez','israel'] },
  MATX: { topic:'shipping', country:'US',  risk:'low',    tags:['shipping','container'] },
  /* Energy grid / transition */
  NEE:  { topic:'energy',   country:'US',  risk:'low',    tags:['solar','wind','grid'] },
  ENPH: { topic:'energy',   country:'US',  risk:'low',    tags:['solar','battery','energy'] },
  /* Agri */
  ADM:  { topic:'agriculture', country:'US', risk:'medium', tags:['grain','ukraine','food','fertilizer'] },
  MOS:  { topic:'agriculture', country:'US', risk:'high',   tags:['potash','fertilizer','russia','ukraine'] },
  NTR:  { topic:'agriculture', country:'CA', risk:'medium', tags:['potash','fertilizer','sanctions'] },
  /* Finance / macro */
  JPM:  { topic:'finance',  country:'US',  risk:'low',    tags:['sanctions','russia','iran','macro'] },
  GS:   { topic:'finance',  country:'US',  risk:'low',    tags:['sanctions','macro','bonds'] },
  /* Cyber */
  CRWD: { topic:'cyber',    country:'US',  risk:'low',    tags:['cyber','threat','nation-state'] },
  PANW: { topic:'cyber',    country:'US',  risk:'low',    tags:['cyber','threat','firewall'] },
};

/* ── Risk score palette ─────────────────────────────────────────── */
function wmScoreColor(score) {
  if (score >= 75) return { text:'#ff4757', bg:'rgba(255,71,87,.1)',  border:'rgba(255,71,87,.3)' };
  if (score >= 50) return { text:'#ffa500', bg:'rgba(255,165,0,.08)', border:'rgba(255,165,0,.25)' };
  if (score >= 25) return { text:'#f7c948', bg:'rgba(247,201,72,.08)',border:'rgba(247,201,72,.2)' };
  return { text:'#00d4a0', bg:'rgba(0,212,160,.07)', border:'rgba(0,212,160,.2)' };
}

/* ── Main enrichment entry point ────────────────────────────────── */
async function wmEnrichTicker(ticker) {
  if (!ticker) return;
  const sym = ticker.replace(/.*:/,'').toUpperCase();
  const ctx = WM_TICKER_CONTEXT[sym] || null;
  const topic = ctx?.topic || wmResourceToTopic(sym);
  const tags  = ctx?.tags  || [sym.toLowerCase(), topic];

  try {
    /* Fetch relevant bootstrap keys in one batch */
    const keys = ['insights','riskScores','weatherAlerts','cyberThreats',
                  'iranEvents','unrestEvents','chokepoints'];
    const d = await wmBootstrap(keys);

    /* Build relevance filter */
    const isRelevant = (text='') => {
      const lc = text.toLowerCase();
      return tags.some(t => lc.includes(t)) || lc.includes(sym.toLowerCase());
    };

    /* ── Gather matching signals ───────────────────────────────── */
    const insights = (d.insights?.insights || d.insights?.items || d.insights?.data || d.insights || []);
    const matchedSignals = (Array.isArray(insights) ? insights : [])
      .filter(s => isRelevant(`${s.title||''} ${s.body||''} ${(s.tags||[]).join(' ')}`))
      .slice(0, 4);

    /* ── Country risk ──────────────────────────────────────────── */
    let countryRisk = null;
    if (ctx?.country) {
      const riskRaw = d.riskScores?.scores || d.riskScores?.data || d.riskScores || {};
      const riskArr = Array.isArray(riskRaw) ? riskRaw :
        Object.entries(riskRaw).map(([k,v]) => typeof v==='object' ? {country:k,...v} : {country:k,score:v});
      countryRisk = riskArr.find(r =>
        (r.country||r.code||'').toUpperCase() === ctx.country ||
        (r.country||'').toLowerCase().includes(ctx.country.toLowerCase())
      );
    }

    /* ── Active supply alerts matching this ticker ─────────────── */
    const chokes = (d.chokepoints?.chokepoints || d.chokepoints?.data || d.chokepoints || []);
    const matchedChokes = (Array.isArray(chokes) ? chokes : [])
      .filter(c => (c.affectedCommodities||[]).some(x => isRelevant(x)) || isRelevant(c.name||''))
      .slice(0, 2);

    /* ── Unrest / Iran events matching ─────────────────────────── */
    const iranEvts = (d.iranEvents?.events || d.iranEvents?.data || d.iranEvents || []);
    const unrestEvts = (d.unrestEvents?.events || d.unrestEvents?.data || d.unrestEvents || []);
    const geoPressures = [
      ...(Array.isArray(iranEvts) ? iranEvts : []),
      ...(Array.isArray(unrestEvts) ? unrestEvts : [])
    ].filter(e => isRelevant(`${e.title||''} ${e.description||''} ${e.location||''}`)).slice(0,3);

    /* ── Cyber threats matching ─────────────────────────────────── */
    const cyber = (d.cyberThreats?.threats || d.cyberThreats?.data || d.cyberThreats || []);
    const matchedCyber = (Array.isArray(cyber) ? cyber : [])
      .filter(c => isRelevant(`${c.title||''} ${c.target||''} ${c.sector||''}`))
      .slice(0,2);

    /* ── Render banners into each panel ─────────────────────────── */
    const hasData = matchedSignals.length || countryRisk || matchedChokes.length ||
                    geoPressures.length || matchedCyber.length;

    if (!hasData) return; // nothing to show for this ticker

    wmInjectNewsEnrichment(sym, topic, matchedSignals, countryRisk, geoPressures);
    wmInjectQuoteEnrichment(sym, topic, countryRisk, matchedChokes, matchedSignals);
    wmInjectAnalystsEnrichment(sym, topic, matchedSignals, geoPressures);
    wmInjectOwnershipEnrichment(sym, topic, countryRisk, geoPressures);
    wmInjectComparablesEnrichment(sym, topic, matchedSignals, matchedChokes);
    wmInjectWatchlistEnrichment(sym, topic, matchedSignals, countryRisk);
    wmInjectValuationEnrichment(sym, topic, countryRisk, matchedChokes, geoPressures, matchedCyber);

  } catch(e) {
    console.warn('[WM] enrichTicker error:', e.message);
  }
}

/* ── Shared banner builder ──────────────────────────────────────── */
function wmBanner(items, panelId, bannerId) {
  if (!items.length) return;
  const existing = document.getElementById(bannerId);
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = bannerId;
  banner.className = 'wm-enrich-banner';
  banner.innerHTML = `
    <div class="wm-enrich-head">
      <span class="wm-enrich-logo">🌐 WorldMonitor</span>
      <span class="wm-enrich-count">${items.length} geo signal${items.length>1?'s':''}</span>
      <button class="wm-enrich-close" onclick="document.getElementById('${bannerId}').remove()">✕</button>
    </div>
    <div class="wm-enrich-items">
      ${items.map(item => `
        <div class="wm-enrich-item" style="border-left:2px solid ${item.col?.border||'var(--border)'}">
          <span class="wm-enrich-icon">${item.icon||'⚡'}</span>
          <div class="wm-enrich-body">
            <div class="wm-enrich-title">${wmEsc(item.title)}</div>
            ${item.sub ? `<div class="wm-enrich-sub">${wmEsc(item.sub)}</div>` : ''}
          </div>
          ${item.action ? `<button class="wm-enrich-act" onclick="${item.action}">${item.actionLabel||'→'}</button>` : ''}
        </div>`).join('')}
    </div>`;

  /* Inject just before panel-content / news-feed / watchlistBox */
  const panel = document.getElementById(`panel-${panelId}`);
  if (!panel) return;
  const target = panel.querySelector('.panel-content, #news-feed, #watchlistBox');
  if (target) panel.insertBefore(banner, target);
  else panel.appendChild(banner);
}

/* ══ Per-panel injectors ══════════════════════════════════════════ */

function wmInjectNewsEnrichment(sym, topic, signals, risk, geoEvents) {
  const items = [];
  if (risk) {
    const c = wmScoreColor(risk.score||0);
    items.push({ icon:'🌡', title:`${risk.country||ctx?.country||''} risk: ${Math.round(risk.score||0)}/100`,
      sub: risk.driver||risk.cause||'', col:c,
      action:`wmIntelSetFilter('risk');showPanel('intel')`, actionLabel:'→ Risk Feed' });
  }
  signals.forEach(s => {
    const c = wmSeverityColor(s.severity||'medium');
    items.push({ icon:'🧠', title: s.title||s.headline||'Signal',
      sub: (s.body||s.description||'').slice(0,80), col:c,
      action:`wmIntelSetFilter('insight');showPanel('intel')`, actionLabel:'→ Intel' });
  });
  geoEvents.slice(0,1).forEach(e => {
    const c = wmSeverityColor(e.severity||'medium');
    items.push({ icon:'✊', title: e.title||e.description||'Event', sub: e.location||'', col:c,
      action:`wmIntelSetFilter('unrest');showPanel('intel')`, actionLabel:'→ Unrest' });
  });
  wmBanner(items, 'news', `wm-banner-news-${sym}`);
}

function wmInjectQuoteEnrichment(sym, topic, risk, chokes, signals) {
  const items = [];
  if (risk && (risk.score||0) >= 40) {
    const c = wmScoreColor(risk.score||0);
    items.push({ icon:'🌡', title:`${risk.country||''} Country Risk: ${Math.round(risk.score||0)}/100`,
      sub: risk.driver||'Political/economic risk indicator', col:c,
      action:`wmIntelSetFilter('risk');showPanel('intel')`, actionLabel:'→ Details' });
  }
  chokes.forEach(ch => {
    const c = wmSeverityColor(ch.riskLevel||ch.risk||'medium');
    items.push({ icon:'🌊', title:`Chokepoint: ${ch.name||''}`,
      sub:`${(ch.affectedCommodities||[]).join(', ')}`, col:c,
      action:`switchTab('supply','choke');showPanel('supply')`, actionLabel:'→ Supply' });
  });
  signals.slice(0,1).forEach(s => {
    const c = wmSeverityColor(s.severity||'medium');
    items.push({ icon:'🧠', title:s.title||'', sub:(s.body||'').slice(0,70), col:c });
  });
  wmBanner(items, 'quote', `wm-banner-quote-${sym}`);
}

function wmInjectAnalystsEnrichment(sym, topic, signals, geoEvents) {
  const items = [];
  signals.forEach(s => {
    const c = wmSeverityColor(s.severity||'medium');
    items.push({ icon:'🧠', title:s.title||'',
      sub:(s.recommendation||s.body||'').slice(0,90), col:c,
      action:`wmIntelSetFilter('insight');showPanel('intel')`, actionLabel:'→ Signal' });
  });
  geoEvents.forEach(e => {
    const c = wmSeverityColor(e.severity||'medium');
    items.push({ icon:'⚠', title:e.title||e.description||'Geo event',
      sub:e.location||'', col:c });
  });
  wmBanner(items, 'analysts', `wm-banner-analysts-${sym}`);
}

function wmInjectOwnershipEnrichment(sym, topic, risk, geoEvents) {
  const items = [];
  if (risk) {
    const c = wmScoreColor(risk.score||0);
    items.push({ icon:'🌍', title:`Domicile risk — ${risk.country||''}`,
      sub:`Country instability index: ${Math.round(risk.score||0)}/100. May affect insider activity & disclosure.`,
      col:c, action:`wmIntelSetFilter('risk');showPanel('intel')`, actionLabel:'→ Risk Feed' });
  }
  geoEvents.forEach(e => {
    items.push({ icon:'✊', title:e.title||e.description||'', sub:e.location||'',
      col:wmSeverityColor(e.severity||'medium') });
  });
  wmBanner(items, 'ownership', `wm-banner-own-${sym}`);
}

function wmInjectComparablesEnrichment(sym, topic, signals, chokes) {
  const items = [];
  signals.forEach(s => {
    const c = wmSeverityColor(s.severity||'medium');
    items.push({ icon:'🧠', title:s.title||'', sub:(s.body||'').slice(0,80), col:c,
      action:`wmIntelSetFilter('insight');showPanel('intel')`, actionLabel:'→ Feed' });
  });
  chokes.forEach(ch => {
    const c = wmSeverityColor(ch.riskLevel||ch.risk||'medium');
    items.push({ icon:'⛓', title:`Supply constraint: ${ch.name||''}`,
      sub:`Affects sector peers in: ${(ch.affectedCommodities||[]).join(', ')}`, col:c,
      action:`switchTab('supply','choke');showPanel('supply')`, actionLabel:'→ Supply' });
  });
  wmBanner(items, 'comparables', `wm-banner-comp-${sym}`);
}

function wmInjectWatchlistEnrichment(sym, topic, signals, risk) {
  /* Banner above the watchlist sort bar */
  const existing = document.getElementById(`wm-banner-wl-${sym}`);
  if (existing) existing.remove();

  const items = [];
  if (risk && (risk.score||0) >= 30) {
    const c = wmScoreColor(risk.score||0);
    items.push({ icon:'🌡', title:`Sector geo-risk: ${Math.round(risk.score||0)}/100`,
      sub:`${topic} — ${risk.driver||'Regional instability'}`, col:c,
      action:`wmIntelSetFilter('risk');showPanel('intel')`, actionLabel:'→ Risk' });
  }
  signals.slice(0,2).forEach(s => {
    const c = wmSeverityColor(s.severity||'medium');
    items.push({ icon:'🧠', title:s.title||'', sub:(s.body||'').slice(0,80), col:c,
      action:`wmIntelSetFilter('insight');showPanel('intel')`, actionLabel:'→ Intel' });
  });

  if (!items.length) return;

  const banner = document.createElement('div');
  banner.id = `wm-banner-wl-${sym}`;
  banner.className = 'wm-enrich-banner';
  banner.innerHTML = `
    <div class="wm-enrich-head">
      <span class="wm-enrich-logo">🌐 WorldMonitor · ${wmEsc(topic.toUpperCase())}</span>
      <span class="wm-enrich-count">${items.length} sector signal${items.length>1?'s':''}</span>
      <button class="wm-enrich-close" onclick="document.getElementById('wm-banner-wl-${wmEsc(sym)}').remove()">✕</button>
    </div>
    <div class="wm-enrich-items">
      ${items.map(item => `
        <div class="wm-enrich-item" style="border-left:2px solid ${item.col?.border||'var(--border)'}">
          <span class="wm-enrich-icon">${item.icon||'⚡'}</span>
          <div class="wm-enrich-body">
            <div class="wm-enrich-title">${wmEsc(item.title)}</div>
            ${item.sub ? `<div class="wm-enrich-sub">${wmEsc(item.sub)}</div>` : ''}
          </div>
          ${item.action ? `<button class="wm-enrich-act" onclick="${item.action}">${item.actionLabel||'→'}</button>` : ''}
        </div>`).join('')}
    </div>`;

  const sortbar = document.querySelector('#panel-watchlist .wl-sortbar');
  const watchlistPanel = document.getElementById('panel-watchlist');
  if (sortbar) watchlistPanel.insertBefore(banner, sortbar);
  else if (watchlistPanel) watchlistPanel.appendChild(banner);
}

function wmInjectValuationEnrichment(sym, topic, risk, chokes, geoEvents, cyber) {
  const items = [];
  if (risk) {
    const c = wmScoreColor(risk.score||0);
    const pct = Math.round(risk.score||0);
    const impact = pct >= 75 ? 'HIGH risk premium warranted' :
                   pct >= 50 ? 'Elevated risk premium likely' :
                   pct >= 25 ? 'Moderate geopolitical discount' : 'Low geo-risk';
    items.push({ icon:'🌡', title:`Geo-risk: ${impact}`,
      sub:`${risk.country||''} instability index ${pct}/100 — affects DCF discount rate & peer multiples`, col:c,
      action:`wmIntelSetFilter('risk');showPanel('intel')`, actionLabel:'→ Details' });
  }
  chokes.forEach(ch => {
    const c = wmSeverityColor(ch.riskLevel||ch.risk||'medium');
    items.push({ icon:'⛓', title:`Supply chain disruption: ${ch.name||''}`,
      sub:'May compress margins and affect forward revenue estimates.', col:c,
      action:`switchTab('supply','choke');showPanel('supply')`, actionLabel:'→ Supply' });
  });
  geoEvents.slice(0,1).forEach(e => {
    items.push({ icon:'⚠', title:e.title||e.description||'Geopolitical event',
      sub:'Consider in terminal value and scenario analysis.', col:wmSeverityColor(e.severity||'medium') });
  });
  cyber.forEach(c => {
    items.push({ icon:'💻', title:`Cyber exposure: ${c.title||c.sector||''}`,
      sub:'Factor in operational risk and potential liability.', col:wmSeverityColor(c.severity||'medium'),
      action:`wmIntelSetFilter('cyber');showPanel('intel')`, actionLabel:'→ Cyber' });
  });
  wmBanner(items, 'valuation', `wm-banner-val-${sym}`);
}

/* ══════════════════════════════════════════════════════════════════
   HOOK INTO FINTERM TICKER LOADING
   Patch loadTickerFromWatchlist and reloadAllPanels
   ══════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  /* Patch loadTickerFromWatchlist */
  if (typeof loadTickerFromWatchlist === 'function') {
    const _orig = loadTickerFromWatchlist;
    window.loadTickerFromWatchlist = function(ticker) {
      _orig(ticker);
      setTimeout(() => wmEnrichTicker(ticker), 1200);
    };
  }

  /* Patch reloadAllPanels */
  if (typeof reloadAllPanels === 'function') {
    const _origReload = reloadAllPanels;
    window.reloadAllPanels = function(ticker) {
      _origReload(ticker);
      setTimeout(() => wmEnrichTicker(ticker), 1500);
    };
  }

  /* Also enrich on initial ticker load (after page ready) */
  setTimeout(() => {
    const t = typeof currentTicker !== 'undefined' ? currentTicker : 'AAPL';
    wmEnrichTicker(t);
  }, 3000);
});

/* ══════════════════════════════════════════════════════════════════
   NEW ENDPOINTS — GPS JAM · MILITARY OPS · OREF · TELEGRAM
   ETF FLOWS · SECTORS
   ══════════════════════════════════════════════════════════════════ */

/* ── GPS Jamming  → Geo·Risk GPS tab ───────────────────────────── */
async function wmGeoGpsJam() {
  const el = document.getElementById('geo-gpsjam');
  if (!el) return;
  el.innerHTML = wmSpinner('Loading GPS jamming data…');
  try {
    const raw = await wmFetch('/api/gpsjam');
    const items = Array.isArray(raw) ? raw
      : (raw?.data ? (Array.isArray(raw.data) ? raw.data : Object.values(raw.data)) : []);

    if (!items.length) { el.innerHTML = wmEmpty('No GPS jamming events reported.'); return; }

    const sorted = [...items].sort((a,b) => {
      const levelOrder = { critical:0, high:1, medium:2, low:3 };
      const al = levelOrder[(a.severity||a.level||'low').toLowerCase()] ?? 3;
      const bl = levelOrder[(b.severity||b.level||'low').toLowerCase()] ?? 3;
      return al - bl;
    });

    let html = wmLiveBar('GPS Jamming Events', `${sorted.length} active zones`);
    html += '<div class="wm-gps-list">';
    for (const item of sorted.slice(0, 40)) {
      const sev   = (item.severity || item.level || 'unknown').toLowerCase();
      const color = sev === 'critical' ? '#ff2222' : sev === 'high' ? '#ff6600' : sev === 'medium' ? '#ffaa00' : 'var(--text-dim)';
      const region = wmEsc(item.region || item.area || item.location || item.country || '');
      const desc   = wmEsc(item.description || item.notes || item.type || '');
      const date   = wmEsc(item.date || item.timestamp || item.time || '');
      html += `<div class="wm-gps-row">
        <span class="wm-gps-sev" style="color:${color};text-transform:uppercase;font-weight:700;min-width:72px">${wmEsc(sev)}</span>
        <span class="wm-gps-region">${region}</span>
        ${desc  ? `<span class="wm-gps-desc">${desc}</span>` : ''}
        ${date  ? `<span class="wm-gps-date">${date}</span>` : ''}
      </div>`;
    }
    html += '</div>';
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = wmError('GPS jam data unavailable: ' + e.message);
  }
}

/* ── Military Operations  → Geo·Risk MILOPS tab ────────────────── */
async function wmGeoMilOps() {
  const el = document.getElementById('geo-milops');
  if (!el) return;
  el.innerHTML = wmSpinner('Loading military flight data…');
  try {
    const raw = await wmFetch('/api/military-flights');
    const items = Array.isArray(raw) ? raw
      : (raw?.flights || raw?.data || (typeof raw === 'object' ? Object.values(raw) : []));

    if (!items.length) { el.innerHTML = wmEmpty('No military flight activity detected.'); return; }

    // Group by region/type
    const byType = {};
    for (const f of items) {
      const type = f.type || f.category || f.aircraft_type || 'Unknown';
      if (!byType[type]) byType[type] = [];
      byType[type].push(f);
    }

    let html = wmLiveBar('Military Flight Activity', `${items.length} active sorties`);
    html += '<div class="wm-milops-list">';
    for (const [type, flights] of Object.entries(byType)) {
      html += `<div class="wm-milops-type-head">${wmEsc(type)} <span style="color:var(--text-dim);font-weight:400">(${flights.length})</span></div>`;
      for (const f of flights.slice(0,8)) {
        const callsign = wmEsc(f.callsign || f.id || f.icao || '');
        const region   = wmEsc(f.region   || f.area || f.country || f.origin || '');
        const alt      = f.altitude ? ` · ${f.altitude}ft` : '';
        const note     = wmEsc(f.note || f.description || '');
        html += `<div class="wm-milops-row">
          <span class="wm-milops-cs">${callsign}</span>
          <span class="wm-milops-region">${region}${alt}</span>
          ${note ? `<span class="wm-milops-note">${note}</span>` : ''}
        </div>`;
      }
    }
    html += '</div>';
    html += `<div style="padding:6px 8px;text-align:right">
      <a href="https://www.worldmonitor.app/?layers=military-flights" target="_blank" rel="noopener"
         style="color:var(--accent);font-size:11px">View on WorldMonitor ↗</a>
    </div>`;
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = wmError('Military ops data unavailable: ' + e.message);
  }
}

/* ── OREF Alerts (Israel sirens)  → Intel·Feed OREF tab ────────── */
async function wmIntelOref() {
  const el = document.getElementById('intel-oref');
  if (!el) return;
  el.innerHTML = wmSpinner('Loading OREF alerts…');
  try {
    const raw = await wmFetch('/api/oref-alerts');
    const items = Array.isArray(raw) ? raw
      : (raw?.alerts || raw?.data || raw?.events || []);

    if (!items.length) {
      el.innerHTML = `<div class="wm-oref-clear">
        <span style="font-size:32px">🟢</span>
        <div style="font-weight:600;margin-top:8px">No Active OREF Alerts</div>
        <div style="color:var(--text-dim);font-size:12px">Israel Home Front Command — all clear</div>
      </div>`;
      return;
    }

    let html = `<div style="background:#ff2222;color:#fff;padding:6px 10px;font-weight:700;font-size:12px;letter-spacing:.5px">
      🚨 ACTIVE OREF ALERTS — ${items.length} ZONE${items.length!==1?'S':''}
    </div>`;
    html += '<div class="wm-oref-list">';
    for (const a of items) {
      const zone     = wmEsc(a.city || a.zone || a.area || a.location || '');
      const threat   = wmEsc(a.threat || a.type || a.category || 'Rocket');
      const time     = wmEsc(a.time || a.timestamp || '');
      const instrHE  = wmEsc(a.instructions_he || '');
      const instrEN  = wmEsc(a.instructions_en || a.instructions || '');
      html += `<div class="wm-oref-row">
        <span class="wm-oref-icon">🚨</span>
        <div class="wm-oref-body">
          <div class="wm-oref-zone">${zone}</div>
          <div class="wm-oref-meta">${threat} ${time ? '· '+time : ''}</div>
          ${instrEN ? `<div class="wm-oref-instr">${instrEN}</div>` : ''}
        </div>
      </div>`;
    }
    html += '</div>';
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = wmError('OREF data unavailable: ' + e.message);
  }
}

/* ── Telegram Breaking Feed  → Intel·Feed TELEGRAM tab ─────────── */
async function wmIntelTelegram() {
  const el = document.getElementById('intel-telegram');
  if (!el) return;
  el.innerHTML = wmSpinner('Loading Telegram intelligence…');
  try {
    const raw = await wmFetch('/api/telegram-feed');
    const items = Array.isArray(raw) ? raw
      : (raw?.messages || raw?.posts || raw?.data || []);

    if (!items.length) { el.innerHTML = wmEmpty('No recent Telegram intel messages.'); return; }

    let html = wmLiveBar('Telegram Intelligence Feed', `${items.length} messages`);
    html += '<div class="wm-tg-list">';
    for (const msg of items.slice(0,30)) {
      const channel = wmEsc(msg.channel || msg.source || msg.from || '');
      const text    = wmEsc(msg.text || msg.message || msg.content || '');
      const ts      = wmEsc(msg.time || msg.timestamp || msg.date || '');
      const lang    = wmEsc(msg.lang || '');
      const tags    = Array.isArray(msg.tags) ? msg.tags : [];
      html += `<div class="wm-tg-row">
        <div class="wm-tg-head">
          <span class="wm-tg-channel">📡 ${channel || 'Intel Channel'}</span>
          ${lang ? `<span class="wm-tg-lang">${lang.toUpperCase()}</span>` : ''}
          <span class="wm-tg-ts">${ts}</span>
        </div>
        <div class="wm-tg-text">${text}</div>
        ${tags.length ? `<div class="wm-tg-tags">${tags.map(t=>`<span class="wm-intel-tag">${wmEsc(t)}</span>`).join('')}</div>` : ''}
      </div>`;
    }
    html += '</div>';
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = wmError('Telegram feed unavailable: ' + e.message);
  }
}

/* ── ETF Flows  → Macro·Intel FLOWS tab ────────────────────────── */
async function wmMacroEtfFlows() {
  const el = document.getElementById('macro-flows');
  if (!el) return;
  el.innerHTML = wmSpinner('Loading ETF flow data…');
  try {
    const d = await wmBootstrap(['etfFlows']);
    const raw = d.etfFlows?.data || d.etfFlows || [];
    const items = Array.isArray(raw) ? raw : Object.values(raw);

    if (!items.length) { el.innerHTML = wmEmpty('No ETF flow data available.'); return; }

    // Sort by absolute flow magnitude
    const sorted = [...items].sort((a,b) => {
      const af = Math.abs(parseFloat(a.flow || a.netFlow || a.amount || 0));
      const bf = Math.abs(parseFloat(b.flow || b.netFlow || b.amount || 0));
      return bf - af;
    });

    let html = wmLiveBar('ETF Institutional Flows', `${sorted.length} funds`);
    html += '<div class="wm-flows-list">';

    const fmtFlow = v => {
      const n = parseFloat(v || 0);
      const abs = Math.abs(n);
      const fmt = abs >= 1e9 ? (n/1e9).toFixed(2)+'B' : abs >= 1e6 ? (n/1e6).toFixed(1)+'M' : n.toFixed(0);
      return { fmt, pos: n >= 0 };
    };

    for (const f of sorted.slice(0,25)) {
      const name    = wmEsc(f.name   || f.ticker || f.fund || f.symbol || '');
      const ticker  = wmEsc(f.ticker || f.symbol || '');
      const { fmt, pos } = fmtFlow(f.flow || f.netFlow || f.amount);
      const sector  = wmEsc(f.sector || f.category || f.type || '');
      const period  = wmEsc(f.period || f.timeframe || '');
      html += `<div class="wm-flows-row">
        <span class="wm-flows-ticker" ${ticker ? `onclick="if(typeof loadTicker==='function')loadTicker('${ticker}')" style="cursor:pointer"` : ''}>${ticker || name}</span>
        <span class="wm-flows-name">${name !== ticker ? name : sector}</span>
        <span class="wm-flows-flow ${pos ? 'wm-pos' : 'wm-neg'}">${pos ? '▲ +' : '▼ '}$${fmt}</span>
        ${period ? `<span class="wm-flows-period">${period}</span>` : ''}
      </div>`;
    }
    html += '</div>';
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = wmError('ETF flow data unavailable: ' + e.message);
  }
}

/* ── Sector Performance  → Macro·Intel SECTORS tab ─────────────── */
async function wmMacroSectors() {
  const el = document.getElementById('macro-sectors');
  if (!el) return;
  el.innerHTML = wmSpinner('Loading sector data…');
  try {
    const d = await wmBootstrap(['sectors']);
    const raw = d.sectors?.data || d.sectors || [];
    const items = Array.isArray(raw) ? raw : Object.values(raw);

    if (!items.length) { el.innerHTML = wmEmpty('No sector data available.'); return; }

    // Sort by performance descending
    const sorted = [...items].sort((a,b) => {
      const ap = parseFloat(a.change || a.performance || a.change1d || a.changePercent || 0);
      const bp = parseFloat(b.change || b.performance || b.change1d || b.changePercent || 0);
      return bp - ap;
    });

    let html = wmLiveBar('Sector Performance', `${sorted.length} sectors`);

    // Heatmap bar
    const maxAbs = Math.max(...sorted.map(s => Math.abs(parseFloat(s.change || s.performance || 0))), 1);
    html += '<div class="wm-sector-heatmap">';
    for (const s of sorted) {
      const name = wmEsc(s.name || s.sector || s.label || '');
      const chg  = parseFloat(s.change || s.performance || s.change1d || 0);
      const pct  = (chg / maxAbs * 100).toFixed(1);
      const positive = chg >= 0;
      const color = positive
        ? `rgba(76,175,80,${0.2 + Math.abs(chg)/maxAbs * 0.8})`
        : `rgba(244,67,54,${0.2 + Math.abs(chg)/maxAbs * 0.8})`;
      const ticker = wmEsc(s.ticker || s.etf || '');
      html += `<div class="wm-sector-cell" style="background:${color}" 
          title="${name}: ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%"
          ${ticker ? `onclick="if(typeof loadTicker==='function')loadTicker('${ticker}')"` : ''}>
        <div class="wm-sector-name">${name}</div>
        <div class="wm-sector-chg ${positive ? 'wm-pos' : 'wm-neg'}">${positive?'+':''}${chg.toFixed(2)}%</div>
        ${ticker ? `<div class="wm-sector-etf">${ticker}</div>` : ''}
      </div>`;
    }
    html += '</div>';

    // Detailed list
    html += '<div class="wm-sector-list">';
    for (const s of sorted) {
      const name     = wmEsc(s.name || s.sector || '');
      const chg      = parseFloat(s.change || s.performance || 0);
      const volume   = s.volume ? wmEsc(String(s.volume)) : null;
      const mktCap   = s.marketCap ? wmEsc(String(s.marketCap)) : null;
      const leader   = wmEsc(s.topStock || s.leader || '');
      const positive = chg >= 0;
      html += `<div class="wm-sector-row">
        <span class="wm-sector-row-name">${name}</span>
        <span class="wm-sector-row-chg ${positive?'wm-pos':'wm-neg'}">${positive?'+':''}${chg.toFixed(2)}%</span>
        ${leader  ? `<span class="wm-sector-leader">${leader}</span>` : ''}
        ${volume  ? `<span class="wm-sector-vol">Vol: ${volume}</span>` : ''}
      </div>`;
    }
    html += '</div>';
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = wmError('Sector data unavailable: ' + e.message);
  }
}

/* ══════════════════════════════════════════════════════════════════
   CRYPTO INTELLIGENCE MODULE  — Full Stack  v2.0
   ──────────────────────────────────────────────────────────────────
   Sources (all free, zero API keys):
   • CoinGecko  /v3  — top 100 coins, global stats, trending, DeFi,
                        sparkline 7d, OHLC, social/dev metrics
   • Alternative.me  — Fear & Greed Index (30-day history)
   • DeFiLlama       — TVL by protocol and by chain, stablecoins
   • Blockchain.com  — BTC network stats (hashrate, difficulty, mempool)
   • CoinCap WS      — Real-time WebSocket price ticks (no key)
   • Binance public  — OHLC klines for BTC/ETH detail view
   ══════════════════════════════════════════════════════════════════ */

/* ── Shared cache ─────────────────────────────────────────────────── */
const CG_BASE   = 'https://api.coingecko.com/api/v3';
const CG_CACHE  = new Map();
const CG_TTL    = 3 * 60 * 1000;

async function cgFetch(path) {
  const cached = CG_CACHE.get(path);
  if (cached && Date.now() - cached.ts < CG_TTL) return cached.data;
  const res = await fetch(`${CG_BASE}${path}`, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const data = await res.json();
  CG_CACHE.set(path, { data, ts: Date.now() });
  return data;
}

/* ── Helpers ──────────────────────────────────────────────────────── */
const _cgFmt = v => v >= 1e12 ? '$'+(v/1e12).toFixed(2)+'T'
                  : v >= 1e9  ? '$'+(v/1e9).toFixed(1)+'B'
                  : v >= 1e6  ? '$'+(v/1e6).toFixed(0)+'M' : '—';

const _cgPrice = v => {
  if (!v && v !== 0) return '—';
  if (v >= 1000) return '$'+v.toLocaleString('en-US',{maximumFractionDigits:0});
  if (v >= 1)    return '$'+v.toFixed(2);
  if (v >= 0.01) return '$'+v.toFixed(4);
  return '$'+v.toFixed(8);
};

const _cgPct = v => v==null ? '—' : (v>=0?'+':'')+v.toFixed(2)+'%';
const _cgCl  = v => v==null ? '' : v>=0 ? 'wm-pos' : 'wm-neg';

/* Draw sparkline SVG from price array */
function _cgSparkSVG(prices, w=80, h=22) {
  if (!prices?.length) return '';
  const mn=Math.min(...prices), mx=Math.max(...prices), rng=mx-mn||1;
  const pts = prices.map((v,i)=>`${(i/(prices.length-1)*w).toFixed(1)},${(h-(v-mn)/rng*(h-2)-1).toFixed(1)}`).join(' ');
  const up   = prices[prices.length-1] >= prices[0];
  const col  = up ? '#3fb950' : '#f85149';
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block">
    <polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`;
}

/* ── A. Fear & Greed Index ────────────────────────────────────────── */
let _cgFearData = null;
async function _fetchFearGreed() {
  if (_cgFearData && Date.now()-_cgFearData._ts < 3600000) return _cgFearData;
  try {
    const res  = await fetch('https://api.alternative.me/fng/?limit=30', { signal: AbortSignal.timeout(6000) });
    const json = await res.json();
    const data = { current: json.data[0], history: json.data, _ts: Date.now() };
    _cgFearData = data;
    return data;
  } catch { return null; }
}

function _renderFearGauge(val) {
  const num  = parseInt(val) || 50;
  const lbl  = num<=24?'Extreme Fear':num<=49?'Fear':num<=74?'Greed':'Extreme Greed';
  const col  = num<=24?'#f85149':num<=49?'#f0883e':num<=74?'#3fb950':'#2ea84b';
  // Semicircle gauge via SVG arc
  const r=38, cx=50, cy=50;
  const startA = Math.PI, endA = startA + (num/100)*Math.PI;
  const x1=cx+r*Math.cos(startA), y1=cy+r*Math.sin(startA);
  const x2=cx+r*Math.cos(endA),   y2=cy+r*Math.sin(endA);
  const large = num >= 50 ? 1 : 0;
  return `<div class="cg-fear-wrap">
    <svg viewBox="0 0 100 55" width="120" height="66">
      <path d="M${cx-r},${cy} A${r},${r} 0 0,1 ${cx+r},${cy}" fill="none" stroke="#21262d" stroke-width="8"/>
      <path d="M${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2}" fill="none" stroke="${col}" stroke-width="8" stroke-linecap="round"/>
      <text x="${cx}" y="${cy-2}" text-anchor="middle" font-size="15" font-weight="800" fill="${col}">${num}</text>
      <text x="${cx}" y="${cy+10}" text-anchor="middle" font-size="6.5" fill="#8b949e">${lbl}</text>
    </svg>
  </div>`;
}

/* ── B. DeFi Llama ────────────────────────────────────────────────── */
let _defiCache = null;
async function _fetchDefiTVL() {
  if (_defiCache && Date.now()-_defiCache._ts < 5*60000) return _defiCache;
  try {
    const [protos, chains] = await Promise.allSettled([
      fetch('https://api.llama.fi/protocols', { signal: AbortSignal.timeout(8000) }).then(r=>r.json()),
      fetch('https://api.llama.fi/chains',    { signal: AbortSignal.timeout(8000) }).then(r=>r.json()),
    ]);
    const data = {
      protocols: protos.status==='fulfilled' ? protos.value.slice(0,30) : [],
      chains:    chains.status==='fulfilled' ? chains.value.slice(0,15) : [],
      _ts: Date.now(),
    };
    _defiCache = data;
    return data;
  } catch { return null; }
}

/* ── C. BTC Network Stats ─────────────────────────────────────────── */
let _btcStatsCache = null;
async function _fetchBTCStats() {
  if (_btcStatsCache && Date.now()-_btcStatsCache._ts < 10*60000) return _btcStatsCache;
  try {
    const res  = await fetch('https://blockchain.info/stats?format=json', { signal: AbortSignal.timeout(6000) });
    const data = await res.json();
    data._ts   = Date.now();
    _btcStatsCache = data;
    return data;
  } catch { return null; }
}

/* ── E. Binance WebSocket real-time (no key) ────────────────────── */
// wss://stream.binance.com:9443/ws/{symbol}@ticker
// Replaces polling for crypto — tick-by-tick, zero auth

let _bnWsMap = {};     // { 'btcusdt': WebSocket }
let _bnPrices = {};    // { 'btcusdt': 45123.20 }

function _bnWsConnect(binanceSymbol) {
  // binanceSymbol = lowercase pair e.g. 'btcusdt', 'ethusdt'
  const sym = binanceSymbol.toLowerCase();
  if (_bnWsMap[sym]?.readyState < 2) return; // already open/connecting

  try {
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${sym}@ticker`);
    _bnWsMap[sym] = ws;

    ws.onmessage = e => {
      try {
        const d = JSON.parse(e.data);
        // Binance 24hr ticker: { s: symbol, c: lastPrice, P: priceChangePct, v: volume, h: high, l: low, ... }
        const price = parseFloat(d.c);
        if (!price) return;
        _bnPrices[sym] = price;

        // Map to CoinGecko-style IDs for DOM patching
        const cgId = _bnSymToCgId(sym);
        if (cgId) {
          const el = document.querySelector(`.cg-live-price[data-id="${cgId}"]`);
          if (el) {
            const prev = parseFloat(el.dataset.prev || price);
            el.dataset.prev = price;
            el.textContent = _cgPrice(price);
            const cls = price > prev ? 'cg-price-flash' : price < prev ? 'cg-price-flash' : '';
            if (cls) { el.classList.add(cls); setTimeout(() => el.classList.remove(cls), 600); }
          }
        }

        // Also patch Finnhub WS live price cells by crypto ticker
        const ticker = sym.replace('usdt','').toUpperCase();
        const fhEl = document.querySelector(`.fh-ws-price[data-ticker="${ticker}"]`);
        if (fhEl) fhEl.textContent = _cgPrice(price);

        // Update Binance card status
        const statusEl = document.getElementById(`cg-bn-status-${sym}`);
        if (statusEl) { statusEl.textContent = '● live'; statusEl.style.color='#3fb950'; }

        // Flash the binance card
        const bnCard = document.getElementById(`cg-bn-${sym}`);
        if (bnCard) {
          const prev = parseFloat(bnCard.dataset.prev || price);
          bnCard.dataset.prev = price;
          if (price !== prev) {
            const flashCls = price > prev ? 'cg-price-flash' : 'cg-price-flash';
            bnCard.classList.add(flashCls);
            setTimeout(() => bnCard.classList.remove(flashCls), 500);
          }
        }

      } catch {}
    };

    ws.onclose = () => {
      delete _bnWsMap[sym];
      // Reconnect after 5s
      setTimeout(() => _bnWsConnect(sym), 5000);
    };
    ws.onerror = () => ws.close();
  } catch {}
}

function _bnSymToCgId(binanceSymbol) {
  const MAP = {
    'btcusdt': 'bitcoin', 'ethusdt': 'ethereum', 'bnbusdt': 'binancecoin',
    'solusdt': 'solana',  'xrpusdt': 'ripple',   'adausdt': 'cardano',
    'dogeusdt':'dogecoin','avaxusdt':'avalanche-2','maticusdt':'matic-network',
    'dotusdt': 'polkadot','linkusdt':'chainlink',  'uniusdt': 'uniswap',
    'ltcusdt': 'litecoin','etcusdt': 'ethereum-classic','xlmusdt':'stellar',
    'atomusdt':'cosmos',  'nearusdt':'near',        'ftmusdt': 'fantom',
  };
  return MAP[binanceSymbol.toLowerCase()] || null;
}

// Connect to top coins
const _BN_DEFAULT_PAIRS = [
  'btcusdt','ethusdt','bnbusdt','solusdt','xrpusdt',
  'adausdt','dogeusdt','avaxusdt','linkusdt','maticusdt',
  'dotusdt','uniusdt',
];

// User-configurable pairs — persisted in localStorage
function _bnLoadUserPairs() {
  try {
    const saved = localStorage.getItem('finterm_bn_pairs');
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
}
function _bnSaveUserPairs(pairs) {
  try { localStorage.setItem('finterm_bn_pairs', JSON.stringify(pairs)); } catch {}
}
function _bnGetActivePairs() {
  return _bnLoadUserPairs() || _BN_DEFAULT_PAIRS;
}

// Public API: add/remove pairs dynamically
window.bnAddPair = function(symbol) {
  const sym = symbol.toLowerCase().replace(/\s/g,'');
  if (!sym.endsWith('usdt')) { console.warn('[Binance] Only USDT pairs supported'); return; }
  const pairs = _bnGetActivePairs();
  if (!pairs.includes(sym)) {
    pairs.push(sym);
    _bnSaveUserPairs(pairs);
    _bnWsConnect(sym);
    console.log('[Binance] Added pair:', sym);
  }
};
window.bnRemovePair = function(symbol) {
  const sym = symbol.toLowerCase();
  const pairs = _bnGetActivePairs().filter(p => p !== sym);
  _bnSaveUserPairs(pairs);
  if (_bnWsMap[sym]) { try { _bnWsMap[sym].close(1000); } catch {} delete _bnWsMap[sym]; }
  console.log('[Binance] Removed pair:', sym);
};
window.bnGetPairs = function() { return _bnGetActivePairs(); };

function _bnWsConnectAll(pairs) {
  (_bnGetActivePairs()).forEach(sym => _bnWsConnect(sym));
}

function _bnWsDisconnectAll() {
  Object.values(_bnWsMap).forEach(ws => { try { ws.close(1000); } catch {} });
  _bnWsMap = {};
}

window._bnWsConnect    = _bnWsConnect;
window._bnWsConnectAll = _bnWsConnectAll;
window._bnPrices       = _bnPrices;


/* ── D. CoinCap WebSocket real-time ──────────────────────────────── */
let _ccWs     = null;
let _ccPrices = {}; // { bitcoin: 45123.2, ethereum: 3021.4, ... }

function _ccWsConnect(assetIds) {
  if (_ccWs && _ccWs.readyState < 2) return; // already open/connecting
  try {
    _ccWs = new WebSocket(`wss://ws.coincap.io/prices?assets=${assetIds.join(',')}`);
    _ccWs.onmessage = e => {
      const d = JSON.parse(e.data);
      Object.assign(_ccPrices, d);
      // Patch live price cells in the DOM
      Object.entries(d).forEach(([id, price]) => {
        const el = document.querySelector(`.cg-live-price[data-id="${id}"]`);
        if (el) {
          el.textContent = _cgPrice(parseFloat(price));
          el.classList.add('cg-price-flash');
          setTimeout(() => el.classList.remove('cg-price-flash'), 600);
        }
      });
    };
    _ccWs.onclose = () => setTimeout(() => _ccWsConnect(assetIds), 5000);
    _ccWs.onerror = () => _ccWs?.close();
  } catch {}
}

/* ── E. Binance OHLC for detail drawer ───────────────────────────── */
async function _fetchBinanceKlines(symbol='BTCUSDT', interval='1d', limit=60) {
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      { signal: AbortSignal.timeout(6000) }
    );
    const arr = await res.json();
    return arr.map(c => ({ t: c[0], o: +c[1], h: +c[2], l: +c[3], c: +c[4], v: +c[5] }));
  } catch { return null; }
}

/* ── MAIN RENDER ──────────────────────────────────────────────────── */
async function wmMacroCrypto() {
  const el = document.getElementById('macro-crypto');
  if (!el) return;
  el.innerHTML = wmSpinner('Loading crypto intelligence…');

  try {
    /* Parallel fetch all sources */
    const [markets, global, trending, fearGreed, defi, btcStats] = await Promise.allSettled([
      cgFetch('/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=true&price_change_percentage=1h%2C24h%2C7d%2C30d'),
      cgFetch('/global'),
      cgFetch('/search/trending'),
      _fetchFearGreed(),
      _fetchDefiTVL(),
      _fetchBTCStats(),
    ]);

    const coins   = markets.status==='fulfilled' ? markets.value : [];
    const gdata   = global.status==='fulfilled'  ? global.value?.data : null;
    const trend   = trending.status==='fulfilled' ? trending.value : null;
    const fg      = fearGreed.status==='fulfilled' ? fearGreed.value : null;
    const defiD   = defi.status==='fulfilled'    ? defi.value : null;
    const btc     = btcStats.status==='fulfilled' ? btcStats.value : null;

    /* ── Sub-tab bar ─────────────────────────────────────────────── */
    let html = `<div class="cg-subtab-bar">
      <button class="cg-stab active" onclick="_cgShowTab('overview',this)">📊 Overview</button>
      <button class="cg-stab" onclick="_cgShowTab('coins',this)">💰 Coins</button>
      <button class="cg-stab" onclick="_cgShowTab('defi',this)">🏦 DeFi</button>
      <button class="cg-stab" onclick="_cgShowTab('btcnet',this)">⛓ BTC Network</button>
      <button class="cg-stab" onclick="_cgShowTab('trending',this)">🔥 Trending</button>
      <button class="cg-stab" onclick="_cgShowTab('binance',this)">⚡ Live WS</button>
    </div>`;

    /* ── TAB 1: OVERVIEW ─────────────────────────────────────────── */
    html += `<div class="cg-tab active" id="cg-tab-overview">`;

    /* Global stats row */
    if (gdata) {
      const mc24  = gdata.market_cap_change_percentage_24h_usd;
      const btcDom= gdata.market_cap_percentage?.btc;
      const ethDom= gdata.market_cap_percentage?.eth;
      const altDom= 100 - (btcDom||0) - (ethDom||0);
      html += `<div class="cg-global-bar">
        <div class="cg-glob-cell"><span class="cg-glob-label">Total Mkt Cap</span><span class="cg-glob-val">${_cgFmt(gdata.total_market_cap?.usd)}</span><span class="cg-glob-sub ${_cgCl(mc24)}">${_cgPct(mc24)}</span></div>
        <div class="cg-glob-cell"><span class="cg-glob-label">24h Volume</span><span class="cg-glob-val">${_cgFmt(gdata.total_volume?.usd)}</span></div>
        <div class="cg-glob-cell"><span class="cg-glob-label">BTC Dom</span><span class="cg-glob-val" style="color:#f7931a">₿ ${btcDom?.toFixed(1)||'—'}%</span></div>
        <div class="cg-glob-cell"><span class="cg-glob-label">ETH Dom</span><span class="cg-glob-val" style="color:#627eea">Ξ ${ethDom?.toFixed(1)||'—'}%</span></div>
        <div class="cg-glob-cell"><span class="cg-glob-label">Alt Dom</span><span class="cg-glob-val" style="color:#a371f7">${altDom.toFixed(1)}%</span></div>
        <div class="cg-glob-cell"><span class="cg-glob-label">Active Coins</span><span class="cg-glob-val">${gdata.active_cryptocurrencies?.toLocaleString()||'—'}</span></div>
        <div class="cg-glob-cell"><span class="cg-glob-label">Markets</span><span class="cg-glob-val">${gdata.markets?.toLocaleString()||'—'}</span></div>
      </div>`;

      /* Dominance bar chart */
      html += `<div class="cg-dom-bar-wrap">
        <div class="cg-dom-bar">
          <div class="cg-dom-seg" style="width:${btcDom?.toFixed(1)||0}%;background:#f7931a" title="BTC ${btcDom?.toFixed(1)}%"></div>
          <div class="cg-dom-seg" style="width:${ethDom?.toFixed(1)||0}%;background:#627eea" title="ETH ${ethDom?.toFixed(1)}%"></div>
          <div class="cg-dom-seg" style="flex:1;background:#a371f777" title="Alts ${altDom.toFixed(1)}%"></div>
        </div>
        <div class="cg-dom-labels">
          <span style="color:#f7931a">₿ BTC ${btcDom?.toFixed(1)}%</span>
          <span style="color:#627eea">Ξ ETH ${ethDom?.toFixed(1)}%</span>
          <span style="color:#a371f7">Alts ${altDom.toFixed(1)}%</span>
        </div>
      </div>`;
    }

    /* Fear & Greed + top-6 coins grid */
    html += `<div class="cg-overview-grid">`;

    /* Fear & Greed gauge */
    if (fg) {
      const cur = fg.current;
      html += `<div class="cg-fg-card">
        <div class="cg-section-title">Fear &amp; Greed Index</div>
        ${_renderFearGauge(cur.value)}
        <div class="cg-fg-history">`;
      fg.history.slice(0,7).forEach(d => {
        const v=parseInt(d.value);
        const c=v<=24?'#f85149':v<=49?'#f0883e':v<=74?'#3fb950':'#2ea84b';
        const dt=new Date(parseInt(d.timestamp)*1000);
        const lbl=dt.toLocaleDateString('en',{month:'short',day:'numeric'});
        html += `<div class="cg-fg-hist-row">
          <span class="cg-fg-hist-date">${lbl}</span>
          <div class="cg-fg-hist-bar-wrap"><div class="cg-fg-hist-bar" style="width:${v}%;background:${c}"></div></div>
          <span class="cg-fg-hist-val" style="color:${c}">${v}</span>
        </div>`;
      });
      html += `</div></div>`;
    }

    /* Top-6 coins sparkline cards */
    const top6 = coins.slice(0,6);
    top6.forEach(c => {
      const chg24 = c.price_change_percentage_24h;
      const chg7  = c.price_change_percentage_7d_in_currency;
      const spark = c.sparkline_in_7d?.price;
      html += `<div class="cg-coin-card">
        <div class="cg-coin-card-header">
          <img src="${wmEsc(c.image||'')}" width="20" height="20" loading="lazy" onerror="this.style.display='none'"/>
          <span class="cg-coin-card-sym">${(c.symbol||'').toUpperCase()}</span>
          <span class="cg-coin-card-rank">#${c.market_cap_rank}</span>
        </div>
        <div class="cg-coin-card-price cg-live-price" data-id="${wmEsc(c.id||'')}">${_cgPrice(c.current_price)}</div>
        <div class="cg-coin-card-chg ${_cgCl(chg24)}">${_cgPct(chg24)} 24h</div>
        <div class="cg-coin-card-spark">${_cgSparkSVG(spark)}</div>
        <div class="cg-coin-card-mc">${_cgFmt(c.market_cap)}</div>
      </div>`;
    });
    html += `</div>`; // overview-grid

    html += `</div>`; // cg-tab-overview

    /* ── TAB 2: COINS TABLE (top 100 with sparklines) ───────────── */
    html += `<div class="cg-tab" id="cg-tab-coins">
      <div class="cg-coins-toolbar">
        <input class="cg-search-input" placeholder="🔍 Filter coins…" oninput="_cgFilterCoins(this.value)" id="cg-coin-search"/>
        <span class="cg-coins-count">${coins.length} coins</span>
      </div>
      <div style="overflow-x:auto">
        <table class="cg-coins-table" id="cg-coins-table">
          <thead><tr>
            <th>#</th><th>Coin</th><th>Price</th>
            <th>1h%</th><th>24h%</th><th>7d%</th><th>30d%</th>
            <th>Market Cap</th><th>Volume 24h</th>
            <th>Supply</th><th>ATH</th><th>7d Chart</th>
          </tr></thead>
          <tbody>`;

    coins.forEach(c => {
      const ch1  = c.price_change_percentage_1h_in_currency;
      const ch24 = c.price_change_percentage_24h;
      const ch7  = c.price_change_percentage_7d_in_currency;
      const ch30 = c.price_change_percentage_30d_in_currency;
      const spark= c.sparkline_in_7d?.price;
      const athPct = c.ath_change_percentage;
      html += `<tr class="cg-coin-row" data-name="${wmEsc((c.name||'').toLowerCase())} ${wmEsc((c.symbol||'').toLowerCase())}">
        <td class="cg-td-rank">${c.market_cap_rank}</td>
        <td class="cg-td-name">
          <img src="${wmEsc(c.image||'')}" width="16" height="16" loading="lazy" onerror="this.style.display='none'"/>
          <strong>${wmEsc((c.symbol||'').toUpperCase())}</strong>
          <span class="cg-coin-fullname">${wmEsc(c.name||'')}</span>
        </td>
        <td class="cg-td-price cg-live-price" data-id="${wmEsc(c.id||'')}">${_cgPrice(c.current_price)}</td>
        <td class="${_cgCl(ch1)}">${_cgPct(ch1)}</td>
        <td class="${_cgCl(ch24)}">${_cgPct(ch24)}</td>
        <td class="${_cgCl(ch7)}">${_cgPct(ch7)}</td>
        <td class="${_cgCl(ch30)}">${_cgPct(ch30)}</td>
        <td>${_cgFmt(c.market_cap)}</td>
        <td>${_cgFmt(c.total_volume)}</td>
        <td class="cg-td-supply" title="Circulating / Max">${c.circulating_supply ? (c.circulating_supply/1e6).toFixed(1)+'M' : '—'}${c.max_supply ? ' / '+(c.max_supply/1e6).toFixed(0)+'M' : ''}</td>
        <td class="${_cgCl(athPct)}" title="ATH: ${_cgPrice(c.ath)}">${athPct!=null?(athPct.toFixed(1)+'% from ATH'):'—'}</td>
        <td class="cg-td-spark">${_cgSparkSVG(spark,72,18)}</td>
      </tr>`;
    });

    html += `</tbody></table></div></div>`; // coins tab

    /* ── TAB 3: DeFi ─────────────────────────────────────────────── */
    html += `<div class="cg-tab" id="cg-tab-defi">`;
    if (defiD) {
      const totalTVL = defiD.protocols.reduce((s,p)=>s+(p.tvl||0),0);
      html += `<div class="cg-defi-header">
        <div class="cg-defi-stat"><span>Total DeFi TVL</span><strong>${_cgFmt(totalTVL)}</strong></div>
        <div class="cg-defi-stat"><span>Protocols tracked</span><strong>${defiD.protocols.length}</strong></div>
        <div class="cg-defi-stat"><span>Top chain (TVL)</span><strong>${defiD.chains[0]?.name||'—'}</strong></div>
      </div>`;

      /* TVL by chain bar chart */
      if (defiD.chains.length) {
        const maxTvl = defiD.chains[0].tvl||1;
        html += `<div class="cg-section-title">TVL by Chain (Top 15)</div><div class="cg-chain-bars">`;
        defiD.chains.slice(0,15).forEach(ch => {
          const pct = ((ch.tvl||0)/maxTvl*100).toFixed(1);
          html += `<div class="cg-chain-row">
            <span class="cg-chain-name">${wmEsc(ch.name||'')}</span>
            <div class="cg-chain-bar-wrap"><div class="cg-chain-bar" style="width:${pct}%"></div></div>
            <span class="cg-chain-tvl">${_cgFmt(ch.tvl)}</span>
          </div>`;
        });
        html += `</div>`;
      }

      /* Protocol cards */
      html += `<div class="cg-section-title" style="margin-top:10px">Top DeFi Protocols by TVL</div>
        <div class="cg-proto-grid">`;
      defiD.protocols.slice(0,20).forEach(p => {
        const chg1d = p.change_1d;
        const logo  = p.logo||'';
        html += `<div class="cg-proto-card">
          <div class="cg-proto-header">
            ${logo?`<img src="${wmEsc(logo)}" width="20" height="20" loading="lazy" onerror="this.style.display='none'"/>`:'' }
            <span class="cg-proto-name">${wmEsc(p.name||'')}</span>
            <span class="cg-proto-cat">${wmEsc(p.category||'')}</span>
          </div>
          <div class="cg-proto-tvl">${_cgFmt(p.tvl)}</div>
          <div class="${_cgCl(chg1d)}" style="font-size:10px">${_cgPct(chg1d)} 24h</div>
          <div class="cg-proto-chain" style="font-size:9px;color:var(--text-muted)">${wmEsc(p.chain||'Multi-chain')}</div>
        </div>`;
      });
      html += `</div>`;
    } else {
      html += `<div class="no-data">// DeFiLlama data unavailable.</div>`;
    }
    html += `</div>`; // defi tab

    /* ── TAB 4: BTC NETWORK ──────────────────────────────────────── */
    html += `<div class="cg-tab" id="cg-tab-btcnet">`;
    if (btc) {
      const hRate = (btc.hash_rate / 1e18).toFixed(2); // EH/s
      const diff  = (btc.difficulty / 1e12).toFixed(2); // T
      const blkTime = btc.minutes_between_blocks?.toFixed(1);
      const mined   = ((btc.totalbc||0)/1e8/1e6).toFixed(3); // BTC in millions
      const kpis = [
        ['Price (USD)',       '$'+btc.market_price_usd?.toLocaleString('en-US',{maximumFractionDigits:0}), '#f7931a'],
        ['Hash Rate',         hRate+' EH/s', '#58a6ff'],
        ['Difficulty',        diff+'T',      '#d29922'],
        ['Block Time',        blkTime+' min','#3fb950'],
        ['BTC Mined (total)', mined+'M BTC', '#a371f7'],
        ['Txns (24h)',        btc.n_tx?.toLocaleString()||'—', '#4dbbff'],
        ['Blocks (24h)',      btc.n_blocks_mined?.toString()||'—', '#3fb950'],
        ['Mempool (unconf.)', btc.n_btc_mined ? '—' : '—', '#d29922'],
      ];
      html += `<div class="av-live-badge" style="margin:8px 12px 4px">● Blockchain.com · Bitcoin Network Stats</div>
        <div class="cg-btc-kpi-grid">`;
      kpis.forEach(([lbl,val,col]) => {
        html += `<div class="cg-btc-kpi">
          <span class="cg-btc-kpi-lbl">${lbl}</span>
          <span class="cg-btc-kpi-val" style="color:${col}">${val}</span>
        </div>`;
      });
      html += `</div>`;

      /* Fetch mempool separately (lightweight single-endpoint) */
      fetch('https://blockchain.info/q/unconfirmedcount', { signal: AbortSignal.timeout(4000) })
        .then(r=>r.text()).then(txt => {
          const el2 = document.querySelector('.cg-btc-mempool-val');
          if (el2) el2.textContent = parseInt(txt).toLocaleString()+' txns';
        }).catch(()=>{});
      html = html.replace('\'—\', \'#d29922\'', '\'<span class="cg-btc-mempool-val">loading…</span>\', \'#d29922\'');

      /* Hash rate context */
      html += `<div class="cg-btc-note">
        Hash Rate at <strong>${hRate} EH/s</strong> means the network performs ${hRate} quintillion SHA-256 calculations per second — a measure of mining security.
        Higher hash rate = more secure network.
      </div>`;

      /* Binance BTC OHLC mini chart */
      html += `<div class="cg-section-title" style="margin-top:10px">BTC/USDT — 60d Daily Chart (Binance)</div>
        <div id="cg-btc-chart" class="cg-btc-chart-wrap"><div class="av-loading"><span class="av-spinner"></span></div></div>`;

      /* Load Binance chart async */
      _fetchBinanceKlines('BTCUSDT','1d',60).then(candles => {
        const wrap = document.getElementById('cg-btc-chart');
        if (!wrap || !candles?.length) return;
        const W=wrap.clientWidth||360, H=100, PL=4, PR=4, PT=6, PB=14;
        const cw=W-PL-PR, ch=H-PT-PB;
        const mn=Math.min(...candles.map(c=>c.l)), mx=Math.max(...candles.map(c=>c.h)), rng=mx-mn||1;
        const xOf = i => PL + (i/(candles.length-1))*cw;
        const yOf = v => PT + ch - (v-mn)/rng*ch;
        let bars='', line='';
        candles.forEach((c,i)=>{
          const x=xOf(i), bw=Math.max(1,cw/candles.length*0.7);
          const up=c.c>=c.o, col=up?'#3fb950':'#f85149';
          const yO=yOf(Math.max(c.o,c.c)), yC=yOf(Math.min(c.o,c.c));
          bars += `<rect x="${(x-bw/2).toFixed(1)}" y="${yO.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1,(yC-yO)).toFixed(1)}" fill="${col}"/>`;
          bars += `<line x1="${x.toFixed(1)}" y1="${yOf(c.h).toFixed(1)}" x2="${x.toFixed(1)}" y2="${yOf(c.l).toFixed(1)}" stroke="${col}" stroke-width="1"/>`;
          if (i===0) line = `M${x.toFixed(1)},${yOf(c.c).toFixed(1)}`;
          else line += ` L${x.toFixed(1)},${yOf(c.c).toFixed(1)}`;
        });
        // Date labels (first, mid, last)
        const dates = [0, Math.floor(candles.length/2), candles.length-1].map(i => {
          const d=new Date(candles[i].t);
          return `<text x="${xOf(i).toFixed(0)}" y="${H-2}" text-anchor="middle" fill="#6e7681" font-size="8">${d.toLocaleDateString('en',{month:'short',day:'numeric'})}</text>`;
        }).join('');
        wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block">${bars}${dates}</svg>`;
      });

    } else {
      html += `<div class="no-data">// Blockchain.com network data unavailable.</div>`;
    }
    html += `</div>`; // btcnet tab

    /* ── TAB 5: TRENDING ─────────────────────────────────────────── */
    html += `<div class="cg-tab" id="cg-tab-trending">`;
    if (trend?.coins?.length) {
      html += `<div class="cg-section-title">🔥 Trending Coins (CoinGecko, last 24h)</div>
        <div class="cg-trend-grid">`;
      trend.coins.forEach((item,i) => {
        const c = item.item;
        html += `<div class="cg-trend-card">
          <span class="cg-trend-rank">#${i+1}</span>
          <img src="${wmEsc(c.thumb||c.small||'')}" width="24" height="24" loading="lazy" onerror="this.style.display='none'"/>
          <div class="cg-trend-info">
            <span class="cg-trend-name">${wmEsc(c.name||'')}</span>
            <span class="cg-trend-sym">${wmEsc((c.symbol||'').toUpperCase())}</span>
          </div>
          <span class="cg-trend-mcr">${c.market_cap_rank ? '#'+c.market_cap_rank : '—'}</span>
        </div>`;
      });
      html += `</div>`;

      /* Trending NFTs */
      if (trend?.nfts?.length) {
        html += `<div class="cg-section-title" style="margin-top:12px">🖼 Trending NFTs</div>
          <div class="cg-trend-grid">`;
        trend.nfts.slice(0,6).forEach((n,i) => {
          html += `<div class="cg-trend-card">
            <span class="cg-trend-rank">#${i+1}</span>
            <img src="${wmEsc(n.thumb||'')}" width="24" height="24" loading="lazy" onerror="this.style.display='none'"/>
            <div class="cg-trend-info">
              <span class="cg-trend-name">${wmEsc(n.name||'')}</span>
              <span class="cg-trend-sym">${wmEsc((n.symbol||'').toUpperCase())}</span>
            </div>
          </div>`;
        });
        html += `</div>`;
      }
    } else {
      html += `<div class="no-data">// Trending data unavailable.</div>`;
    }
    html += `</div>`; // trending tab

  /* ── TAB 6: BINANCE LIVE WS ────────────────────────────────────── */
  const _bnPairsData = [
    { sym:'btcusdt',  label:'BTC/USDT', cgId:'bitcoin'     },
    { sym:'ethusdt',  label:'ETH/USDT', cgId:'ethereum'    },
    { sym:'bnbusdt',  label:'BNB/USDT', cgId:'binancecoin' },
    { sym:'solusdt',  label:'SOL/USDT', cgId:'solana'      },
    { sym:'xrpusdt',  label:'XRP/USDT', cgId:'ripple'      },
    { sym:'adausdt',  label:'ADA/USDT', cgId:'cardano'     },
    { sym:'dogeusdt', label:'DOGE/USDT',cgId:'dogecoin'    },
    { sym:'avaxusdt', label:'AVAX/USDT',cgId:'avalanche-2' },
    { sym:'dotusdt',  label:'DOT/USDT', cgId:'polkadot'    },
    { sym:'linkusdt', label:'LINK/USDT',cgId:'chainlink'   },
    { sym:'ltcusdt',  label:'LTC/USDT', cgId:'litecoin'    },
    { sym:'uniusdt',  label:'UNI/USDT', cgId:'uniswap'     },
  ];

  html += `<div class="cg-tab" id="cg-tab-binance">
    <div class="av-live-badge" style="margin:6px 8px 2px">⚡ Binance WebSocket · Tick-by-tick · No API key</div>
    <div style="font-size:9px;color:var(--text-muted);padding:2px 10px 8px">Real-time prices via wss://stream.binance.com — reconnects automatically.</div>
    <div class="cg-bn-grid">
      ${_bnPairsData.map(p=>`
      <div class="cg-bn-card" id="cg-bn-${p.sym}" data-prev="">
        <span class="cg-bn-label">${p.label}</span>
        <span class="cg-bn-price cg-live-price" data-id="${p.cgId}">—</span>
        <span class="cg-bn-status" id="cg-bn-status-${p.sym}" style="color:#6e7681">○ connecting</span>
      </div>`).join('')}
    </div>
    <div style="font-size:9px;color:var(--text-muted);padding:6px 10px;border-top:1px solid var(--border)">
      Source: <a href="https://www.binance.com" target="_blank" rel="noopener" class="geo-wm-link">Binance ↗</a> ·
      Spot market USDT pairs · Updates on every trade
    </div>
  </div>`;

    /* ── Footer & source credits ─────────────────────────────────── */
    html += `<div class="cg-footer">
      <a href="https://www.coingecko.com" target="_blank" rel="noopener" class="geo-wm-link">CoinGecko</a>
      · <a href="https://api.alternative.me" target="_blank" rel="noopener" class="geo-wm-link">Alternative.me</a>
      · <a href="https://defillama.com" target="_blank" rel="noopener" class="geo-wm-link">DeFiLlama</a>
      · <a href="https://blockchain.info" target="_blank" rel="noopener" class="geo-wm-link">Blockchain.com</a>
      · <a href="https://www.binance.com" target="_blank" rel="noopener" class="geo-wm-link">Binance</a>
      · No API keys required
    </div>`;

    el.innerHTML = html;

    /* Start CoinCap WebSocket for real-time top-10 prices */
    const wsIds = coins.slice(0,10).map(c=>c.id).filter(Boolean);
    if (wsIds.length) _ccWsConnect(wsIds);

    /* Also start Binance WebSocket for tick-by-tick updates (no key) */
    const bnPairs = coins.slice(0,7).map(c => {
      const sym = (c.symbol||'').toLowerCase();
      return sym && sym !== 'usdt' ? sym+'usdt' : null;
    }).filter(Boolean);
    _bnWsConnectAll(bnPairs.length ? bnPairs : undefined);

  } catch(e) {
    el.innerHTML = wmError('Crypto data unavailable: ' + e.message);
  }
}

/* ── Sub-tab switcher ─────────────────────────────────────────────── */
window._cgShowTab = function(id, btn) {
  const wrap = document.getElementById('macro-crypto');
  if (!wrap) return;
  wrap.querySelectorAll('.cg-tab').forEach(t => t.classList.remove('active'));
  wrap.querySelectorAll('.cg-stab').forEach(b => b.classList.remove('active'));
  const tab = document.getElementById(`cg-tab-${id}`);
  if (tab) tab.classList.add('active');
  if (btn) btn.classList.add('active');
};

/* ── Coin search filter ───────────────────────────────────────────── */
window._cgFilterCoins = function(q) {
  q = q.toLowerCase().trim();
  document.querySelectorAll('#cg-coins-table .cg-coin-row').forEach(row => {
    const name = row.dataset.name || '';
    row.style.display = (!q || name.includes(q)) ? '' : 'none';
  });
};


/* ══════════════════════════════════════════════════════════════════
   Frankfurter FX  → Forex panel header enrichment
   No API key required
   ══════════════════════════════════════════════════════════════════ */
const FKT_BASE  = 'https://api.frankfurter.dev/v1';
const FKT_CACHE = new Map();
const FKT_TTL   = 5 * 60 * 1000;

async function fktFetch(path) {
  const cached = FKT_CACHE.get(path);
  if (cached && Date.now() - cached.ts < FKT_TTL) return cached.data;
  const res = await fetch(`${FKT_BASE}${path}`);
  if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
  const data = await res.json();
  FKT_CACHE.set(path, { data, ts: Date.now() });
  return data;
}

async function frankfurterLoadRates() {
  const el = document.getElementById('frankfurter-rates');
  if (!el) return;
  try {
    const data = await fktFetch('/latest?base=USD');
    const rates = data?.rates || {};
    const majorPairs = ['EUR','GBP','JPY','CHF','CAD','AUD','NZD','CNY','HKD','SEK','NOK','DKK','SGD','MXN','BRL','INR','KRW','TRY','PLN','CZK','HUF'];
    let html = `<div class="fkt-rates-bar">`;
    for (const ccy of majorPairs) {
      if (!rates[ccy]) continue;
      const rate = rates[ccy];
      html += `<div class="fkt-rate-chip">
        <span class="fkt-ccy">USD/${ccy}</span>
        <span class="fkt-rate">${ccy === 'JPY' || ccy === 'KRW' ? rate.toFixed(2) : rate.toFixed(4)}</span>
      </div>`;
    }
    html += `</div>`;
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = `<div class="fkt-err">ECB rates unavailable</div>`;
  }
}

/* Historical rates for a pair (used by forex panel) */
async function frankfurterHistory(base, target, days = 90) {
  const el = document.getElementById('frankfurter-history');
  if (!el) return;
  try {
    const end   = new Date();
    const start = new Date(); start.setDate(start.getDate() - days);
    const fmt = d => d.toISOString().slice(0,10);
    const data = await fktFetch(`/${fmt(start)}..${fmt(end)}?base=${base}&symbols=${target}`);
    const rates = data?.rates || {};
    const dates = Object.keys(rates).sort();
    const vals  = dates.map(d => parseFloat(rates[d][target]));
    if (!vals.length) return;

    const W = 300, H = 60, PL = 8, PR = 8, PT = 4, PB = 4;
    const mn = Math.min(...vals), mx = Math.max(...vals), range = mx - mn || 0.001;
    const cw = W - PL - PR, ch = H - PT - PB;
    const toX = i => (PL + i / (vals.length - 1) * cw).toFixed(1);
    const toY = v => (PT + ch - (v - mn) / range * ch).toFixed(1);
    const d = vals.map((v,i) => `${i===0?'M':'L'}${toX(i)},${toY(v)}`).join(' ');
    const first = vals[0], last = vals[vals.length-1];
    const pct   = ((last - first) / first * 100).toFixed(2);
    const pos   = last >= first;

    el.innerHTML = `
      <div class="fkt-hist-label">${base}/${target} · ${days}d ${pos?'+':''}${pct}%
        <span style="color:${pos?'#4caf50':'#f44336'}">${pos?'▲':'▼'}</span>
      </div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:48px">
        <defs>
          <linearGradient id="fktGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${pos?'#4caf50':'#f44336'}" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="${pos?'#4caf50':'#f44336'}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path d="${d} L${toX(vals.length-1)},${PT+ch} L${PL},${PT+ch} Z" fill="url(#fktGrad)"/>
        <path d="${d}" fill="none" stroke="${pos?'#4caf50':'#f44336'}" stroke-width="1.5"/>
      </svg>
      <div class="fkt-hist-prices">
        <span>${first.toFixed(4)}</span>
        <span style="color:var(--accent);font-weight:600">${last.toFixed(4)}</span>
      </div>`;
  } catch(e) {
    el.innerHTML = ``;
  }
}

/* ══════════════════════════════════════════════════════════════════
   EXTEND wmInitAll with all new endpoints
   ══════════════════════════════════════════════════════════════════ */
(function extendWmInitAll() {
  // Wait for DOMContentLoaded so all panel elements exist
  document.addEventListener('DOMContentLoaded', () => {
    // ETF Flows + Sectors in Macro panel
    wmMacroEtfFlows();
    wmMacroSectors();
    // Crypto
    wmMacroCrypto();
    // Geo-Risk new tabs (lazy on first click — but pre-load on init)
    wmGeoGpsJam();
    wmGeoMilOps();
    // Intel Feed new tabs
    wmIntelOref();
    wmIntelTelegram();
    // Frankfurter rates in Forex panel
    frankfurterLoadRates();

    // Refresh schedule
    setInterval(() => {
      wmMacroEtfFlows();
      wmMacroSectors();
      wmMacroCrypto();
      wmGeoGpsJam();
      wmGeoMilOps();
      wmIntelOref();
      wmIntelTelegram();
      frankfurterLoadRates();
    }, 3 * 60 * 1000);  // 3 min for crypto + fast-moving data
  });
})();

/* ══════════════════════════════════════════════════════════════════
   GLOBAL EXPORTS — allow external modules to call worldmonitor.js
   functions by name (finterm-modules.js, script.js, etc.)
   ══════════════════════════════════════════════════════════════════ */
window.wmMacroCrypto      = wmMacroCrypto;        // Macro panel → Crypto tab
window.wmLoadCryptoGlobal = wmMacroCrypto;         // Alias for finterm-modules.js compat
window.wmFetch            = wmFetch;               // Shared fetch with CORS/timeout
window.wmBootstrap        = wmBootstrap;           // Full WorldMonitor bootstrap
window.wmSupplyInit       = wmSupplyInit;          // Supply chain panel init
window.wmSupplyLoad       = wmSupplyLoad;          // Supply chain tab loader

// CoinGecko panel helpers
if (typeof _cgShowTab === 'function')   window.cgShowTab   = _cgShowTab;
if (typeof _cgFilterCoins === 'function') window.cgFilterCoins = _cgFilterCoins;
