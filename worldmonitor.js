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
