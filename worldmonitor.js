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
