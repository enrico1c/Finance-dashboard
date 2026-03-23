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

  const items = [
    { name: 'Red Sea / Bab el-Mandeb', emoji: '🚢', region: 'Yemen — Houthi zone', risk: 'critical',
      tradePct: '12', note: 'Houthi missile/drone attacks forcing ships to reroute via Cape of Good Hope (+10 days)',
      affectedCommodities: ['Container shipping','Oil','LNG','Grain'] },
    { name: 'Strait of Hormuz', emoji: '🛢️', region: 'Persian Gulf — Iran/Oman', risk: 'high',
      tradePct: '21', note: 'Iran threats amid Middle East tensions; ~21% of global oil trade transits daily',
      affectedCommodities: ['Oil','LNG','Petrochemicals'] },
    { name: 'Suez Canal', emoji: '⚓', region: 'Egypt', risk: 'high',
      tradePct: '30', note: 'Traffic down ~40% from 2023 peak due to Red Sea rerouting via Cape',
      affectedCommodities: ['Container shipping','Oil','Grain'] },
    { name: 'Taiwan Strait', emoji: '🏝️', region: 'Taiwan/China', risk: 'medium',
      tradePct: '48', note: 'PLA exercises and cross-strait tensions; critical semiconductor supply chain',
      affectedCommodities: ['Semiconductors','Electronics','Container shipping'] },
    { name: 'Strait of Malacca', emoji: '🌊', region: 'Singapore/Malaysia/Indonesia', risk: 'medium',
      tradePct: '40', note: '~40% of global trade; piracy risk manageable; key China supply route',
      affectedCommodities: ['Oil','LNG','Electronics','Container shipping'] },
    { name: 'Panama Canal', emoji: '🏗️', region: 'Panama', risk: 'medium',
      tradePct: '5', note: 'Drought reduced capacity 2023-24; levels recovering; US tariff pressure on operations',
      affectedCommodities: ['Container shipping','LNG','Grain'] },
    { name: 'Turkish Straits (Bosphorus)', emoji: '🌉', region: 'Turkey', risk: 'low',
      tradePct: '3', note: 'Black Sea grain & Russian oil flows; Turkey leveraging geopolitical position',
      affectedCommodities: ['Grain','Oil','Steel'] },
    { name: 'Danish Straits', emoji: '🏔️', region: 'Denmark/Sweden', risk: 'low',
      tradePct: '2', note: 'Baltic Sea access; Nord Stream aftermath affects regional energy flows',
      affectedCommodities: ['Oil','LNG','Iron ore'] },
  ];

  el.innerHTML = wmLiveBar('Strategic Chokepoints & Shipping Lanes', `${items.length} monitored`) +
    items.map(c => {
      const col = wmSeverityColor(c.risk);
      return `<div class="wm-choke-card" style="border-left:3px solid ${col.border}">
        <div class="wm-choke-header">
          <span class="wm-choke-icon">${c.emoji}</span>
          <div class="wm-choke-info">
            <span class="wm-choke-name">${wmEsc(c.name)}</span>
            <span class="wm-choke-region">${wmEsc(c.region)}</span>
          </div>
          ${wmBadge(c.risk.toUpperCase(), c.risk)}
        </div>
        <div class="wm-choke-stats">
          ${c.tradePct ? `<span class="wm-stat-chip">📦 ${c.tradePct}% global trade</span>` : ''}
        </div>
        ${c.note ? `<div class="wm-choke-note">${wmEsc(c.note)}</div>` : ''}
        ${c.affectedCommodities?.length ? `<div class="wm-choke-commodities">${c.affectedCommodities.map(x => `<span class="wm-comm-chip">${wmEsc(x)}</span>`).join('')}</div>` : ''}
      </div>`;
    }).join('');
}

/* SHIP tab */
async function wmSupplyShipping() {
  const el = document.getElementById('supply-ship');
  if (!el) return;

  const routes = [
    { route: 'Shanghai → Los Angeles',    rate: 3850, unit: '/FEU', note: 'Elevated; US tariff front-loading demand' },
    { route: 'Shanghai → Rotterdam',      rate: 4200, unit: '/FEU', note: 'Red Sea rerouting adds ~10 days via Cape' },
    { route: 'Rotterdam → New York',      rate: 2100, unit: '/FEU', note: 'Relatively stable; strong import demand' },
    { route: 'Shanghai → Dubai',          rate: 1650, unit: '/FEU', note: 'Elevated on Gulf backlog from Red Sea diversion' },
    { route: 'Hong Kong → Los Angeles',   rate: 3600, unit: '/FEU', note: 'Tariff-driven front-loading pressure' },
    { route: 'Singapore → Rotterdam',     rate: 3950, unit: '/FEU', note: 'Cape of Good Hope routing adds cost' },
    { route: 'Busan → Los Angeles',       rate: 3700, unit: '/FEU', note: 'Transpacific strength from Korean exporters' },
    { route: 'Santos → Hamburg',          rate: 1800, unit: '/FEU', note: 'South America trade lane, stable' },
  ];

  el.innerHTML = wmLiveBar('Global Shipping Rates', 'Indicative spot rates · Drewry/Freightos reference') +
    `<div style="padding:4px 10px 6px;font-size:11px;color:var(--text-muted)">
      Reference spot rates in USD per 40ft container (FEU). Actual rates vary by carrier and booking terms.
    </div>` +
    `<div class="wm-ship-grid">` +
    routes.map(r => `<div class="wm-ship-card">
      <div class="wm-ship-route">${wmEsc(r.route)}</div>
      <div class="wm-ship-val">$${Number(r.rate).toLocaleString()}</div>
      <div class="wm-ship-meta">${wmEsc(r.unit)}</div>
      ${r.note ? `<div class="wm-ship-note">${wmEsc(r.note)}</div>` : ''}
    </div>`).join('') + `</div>`;
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

function wmAlertLoad(filter = 'all') {
  // Alert feed now shows @DeItaone Twitter timeline — rendered in index.html
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

/* ══════════════════════════════════════════════════════════════════
   MACRO SIGNALS  — FRED (primary, 12 indicators) + Stooq free fallback
   ══════════════════════════════════════════════════════════════════ */
async function wmMacroSignals() {
  const el = document.getElementById('macro-signals');
  if (!el) return;
  el.innerHTML = wmSpinner('Fetching macro signals…');

  const FRED_SIGNALS = [
    { id:'FEDFUNDS',     label:'Fed Funds Rate',      unit:'%',    group:'Monetary Policy', yoy:false,
      desc:'FOMC target rate — central bank policy stance & borrowing cost benchmark',
      sig:(v,p)=> v>p?{t:'TIGHTENING',c:'wm-dn',i:'🔺'}:v<p?{t:'EASING',c:'wm-up',i:'🔻'}:{t:'ON HOLD',c:'wm-flat',i:'→'} },
    { id:'DGS10',        label:'10Y Treasury',        unit:'%',    group:'Rates',           yoy:false,
      desc:'10-year yield — risk-free rate benchmark & equity valuation discount rate',
      sig:(v,p)=> v>p?{t:'RISING',c:'wm-dn',i:'▲'}:v<p?{t:'FALLING',c:'wm-up',i:'▼'}:{t:'STABLE',c:'wm-flat',i:'→'} },
    { id:'T10Y2Y',       label:'10Y−2Y Spread',       unit:'%',    group:'Rates',           yoy:false,
      desc:'Yield curve slope — inversion historically precedes recession by 12–18 months',
      sig:(v)=> v<0?{t:'INVERTED ⚠',c:'wm-dn',i:'⚠'}:v<0.5?{t:'FLAT',c:'wm-warn',i:'▬'}:{t:'NORMAL',c:'wm-up',i:'✓'} },
    { id:'T10YIE',       label:'Breakeven Inflation', unit:'%',    group:'Inflation',       yoy:false,
      desc:'TIPS-implied 10Y inflation expectations — what bond market forecasts for CPI',
      sig:(v)=> v>3?{t:'HIGH EXPECTED',c:'wm-dn',i:'🔥'}:v>2.2?{t:'ABOVE 2% TARGET',c:'wm-warn',i:'⚠'}:{t:'ANCHORED',c:'wm-up',i:'✓'} },
    { id:'CPIAUCSL',     label:'CPI YoY',             unit:'%',    group:'Inflation',       yoy:true,
      desc:'Consumer Price Index year-over-year — headline inflation measurement',
      sig:(v)=> v>4?{t:'HIGH INFLATION',c:'wm-dn',i:'🔥'}:v>2.5?{t:'ELEVATED',c:'wm-warn',i:'⚠'}:{t:'NEAR TARGET',c:'wm-up',i:'✓'} },
    { id:'UNRATE',       label:'Unemployment',        unit:'%',    group:'Labor Market',    yoy:false,
      desc:'U.S. unemployment rate — lagging indicator of overall economic health',
      sig:(v,p)=> v>p+0.3?{t:'DETERIORATING',c:'wm-dn',i:'📈'}:v<4.5?{t:'STRONG',c:'wm-up',i:'💪'}:{t:'STABLE',c:'wm-flat',i:'→'} },
    { id:'ICSA',         label:'Initial Claims',      unit:'K/wk', group:'Labor Market',    yoy:false, scale:0.001,
      desc:'Weekly initial jobless claims — leading indicator of labor market direction',
      sig:(v,p)=> v>p*1.2?{t:'RISING FAST',c:'wm-dn',i:'📈'}:v>p*1.05?{t:'RISING',c:'wm-warn',i:'▲'}:v<p*0.9?{t:'FALLING',c:'wm-up',i:'📉'}:{t:'STABLE',c:'wm-flat',i:'→'} },
    { id:'VIXCLS',       label:'VIX',                 unit:'pts',  group:'Market Risk',     yoy:false,
      desc:'CBOE Volatility Index — market fear gauge. >30 = high stress, <15 = complacency',
      sig:(v)=> v>30?{t:'HIGH FEAR',c:'wm-dn',i:'😱'}:v>20?{t:'ELEVATED',c:'wm-warn',i:'⚠'}:v<15?{t:'COMPLACENT',c:'wm-warn',i:'😴'}:{t:'NORMAL',c:'wm-up',i:'😊'} },
    { id:'DCOILWTICO',   label:'WTI Crude Oil',       unit:'$/bbl',group:'Market Risk',     yoy:false,
      desc:'West Texas Intermediate crude — energy cost driver & inflation input',
      sig:(v,p)=> v>p*1.1?{t:'SURGING',c:'wm-dn',i:'🔺'}:v<p*0.9?{t:'FALLING',c:'wm-up',i:'🔻'}:{t:'STABLE',c:'wm-flat',i:'→'} },
    { id:'UMCSENT',      label:'Consumer Sentiment',  unit:'idx',  group:'Sentiment',       yoy:false,
      desc:'U. Michigan Consumer Sentiment — household confidence & spending outlook',
      sig:(v,p)=> v>80?{t:'CONFIDENT',c:'wm-up',i:'😊'}:v<60?{t:'PESSIMISTIC',c:'wm-dn',i:'😟'}:v>p?{t:'IMPROVING',c:'wm-up',i:'↑'}:{t:'DECLINING',c:'wm-dn',i:'↓'} },
    { id:'BAMLH0A0HYM2', label:'HY OAS Spread',       unit:'bps',  group:'Credit',          yoy:false,
      desc:'High-yield credit option-adjusted spread — risk appetite & default risk proxy',
      sig:(v)=> v>600?{t:'CREDIT STRESS',c:'wm-dn',i:'⚠'}:v>450?{t:'ELEVATED',c:'wm-warn',i:'▲'}:v<300?{t:'VERY TIGHT',c:'wm-warn',i:'⬇'}:{t:'NORMAL',c:'wm-up',i:'✓'} },
    { id:'M2SL',         label:'M2 Money Supply YoY', unit:'%',    group:'Liquidity',       yoy:true,
      desc:'M2 monetary aggregate growth — systemic liquidity & monetary condition proxy',
      sig:(v)=> v>10?{t:'EXPANDING',c:'wm-up',i:'💧'}:v<-2?{t:'CONTRACTING',c:'wm-dn',i:'🔥'}:{t:'MODERATE',c:'wm-flat',i:'→'} },
  ];

  const fmtNum = (v, unit) => {
    if (unit === '%')     return v.toFixed(2) + '%';
    if (unit === 'K/wk') return v.toFixed(0) + 'K';
    if (unit === '$/bbl') return '$' + v.toFixed(2);
    if (unit === 'bps')  return Math.round(v) + ' bps';
    if (v >= 100)        return Math.round(v).toLocaleString();
    return v.toFixed(2);
  };

  const spark = (vals, pos) => {
    if (!vals || vals.length < 2) return '';
    const rev = [...vals].reverse();
    const mn = Math.min(...rev), mx = Math.max(...rev), rng = mx - mn || 1;
    const w = 60, h = 18;
    const pts = rev.map((v,i) => `${(i/(rev.length-1)*w).toFixed(1)},${(h-(v-mn)/rng*(h-2)-1).toFixed(1)}`).join(' ');
    const col = pos ? '#3fb950' : '#f85149';
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  };

  const fredKey = (window._KEYS && window._KEYS['fred']) || localStorage.getItem('finterm_key_fred') || '';

  if (!fredKey) {
    // Free fallback: alternative.me Fear & Greed + CoinGecko global market stats
    try {
      const [fngRes, cgRes] = await Promise.allSettled([
        fetch('https://api.alternative.me/fng/?limit=8', { signal: AbortSignal.timeout(8000) }),
        fetch('https://api.coingecko.com/api/v3/global',  { signal: AbortSignal.timeout(8000) }),
      ]);

      const signals = [];

      if (fngRes.status === 'fulfilled' && fngRes.value.ok) {
        const fng = await fngRes.value.json();
        const cur = fng.data?.[0], prev = fng.data?.[1];
        if (cur) {
          const v = parseInt(cur.value), p = prev ? parseInt(prev.value) : v;
          const sig = v <= 25 ? {t:'EXTREME FEAR',c:'wm-dn',i:'😱'}
                    : v <= 45 ? {t:'FEAR',c:'wm-warn',i:'😟'}
                    : v >= 75 ? {t:'EXTREME GREED',c:'wm-warn',i:'🤑'}
                    : v >= 55 ? {t:'GREED',c:'wm-up',i:'😄'}
                    : {t:'NEUTRAL',c:'wm-flat',i:'😊'};
          const vals = (fng.data || []).slice(0, 8).map(d => parseInt(d.value)).reverse();
          signals.push({ group:'Market Sentiment', label:'Crypto Fear & Greed', unit:'/100',
            desc:'Market sentiment gauge — Extreme Fear (<25) = capitulation, Extreme Greed (>75) = reversal risk',
            cur: v, chgPct: p > 0 ? ((v - p) / p * 100) : 0, date: cur.value_classification || '', sig, vals });
        }
      }

      if (cgRes.status === 'fulfilled' && cgRes.value.ok) {
        const cg = await cgRes.value.json();
        const d  = cg.data;
        if (d) {
          const btcDom = d.market_cap_percentage?.btc;
          const chg24h = d.market_cap_change_percentage_24h_usd;
          const actCoins = d.active_cryptocurrencies;

          if (btcDom != null) signals.push({
            group:'Crypto Markets', label:'BTC Dominance', unit:'%',
            desc:'Bitcoin market share — high dominance (>60%) = risk-off / altcoin weakness',
            cur: btcDom, chgPct: 0, date:'live',
            sig: btcDom > 60 ? {t:'HIGH (risk-off)',c:'wm-warn',i:'₿⚠'}
               : btcDom > 50 ? {t:'ELEVATED',c:'wm-flat',i:'₿'}
               : {t:'LOW (alt season)',c:'wm-up',i:'🔀'},
            vals: [],
          });

          if (chg24h != null) signals.push({
            group:'Crypto Markets', label:'Total Mkt Cap 24h Δ', unit:'%',
            desc:'24-hour change in total crypto market capitalisation — directional momentum',
            cur: chg24h, chgPct: chg24h, date:'live',
            sig: chg24h > 5  ? {t:'STRONG RALLY',c:'wm-up',i:'🚀'}
               : chg24h > 0  ? {t:'RISING',c:'wm-up',i:'▲'}
               : chg24h < -5 ? {t:'SHARP DROP',c:'wm-dn',i:'📉'}
               : {t:'FALLING',c:'wm-dn',i:'▼'},
            vals: [],
          });

          if (actCoins != null) signals.push({
            group:'Crypto Markets', label:'Active Cryptocurrencies', unit:'',
            desc:'Number of active listed coins — proxy for market breadth and liquidity',
            cur: actCoins, chgPct: 0, date:'live',
            sig: {t:'TRACKED',c:'wm-flat',i:'📊'},
            vals: [],
          });
        }
      }

      const fmtN = (v, unit) => {
        if (unit === '%') return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
        if (unit === '/100') return Math.round(v) + '/100';
        if (v >= 1000) return Math.round(v).toLocaleString();
        return v.toFixed(2);
      };

      let html = wmLiveBar('Macro Market Signals', 'alternative.me · CoinGecko · live data') +
        `<div style="padding:6px 10px 8px;margin-bottom:8px;background:rgba(255,165,0,.08);border:1px solid rgba(255,165,0,.2);border-radius:4px;font-size:11px;color:#ffa500">
          🔑 <a href="#" onclick="openApiConfig('fred');return false" style="color:var(--accent)">Add your free FRED key</a>
          for the full 12-indicator dashboard: CPI, Unemployment, Yield Curve, Consumer Sentiment, HY Spreads, M2 and more.
        </div>`;

      const groups = {};
      for (const s of signals) {
        if (!groups[s.group]) groups[s.group] = [];
        groups[s.group].push(s);
      }

      for (const [grp, items] of Object.entries(groups)) {
        html += `<div class="wm-sig-group">${grp}</div>`;
        for (const s of items) {
          const pos = s.chgPct >= 0;
          html += `<div class="wm-macro-row wm-sig-row">
            <div class="wm-sig-icon">${s.sig.i}</div>
            <div class="wm-sig-info">
              <div class="wm-macro-label">${wmEsc(s.label)}</div>
              <div class="wm-sig-desc">${wmEsc(s.desc)}</div>
            </div>
            <div class="wm-sig-vals">
              <div class="wm-macro-val">${wmEsc(fmtN(s.cur, s.unit))}</div>
              ${s.chgPct !== 0 ? `<div class="${pos?'wm-up':'wm-dn'} wm-sig-chg">${pos?'+':''}${s.chgPct.toFixed(2)}%</div>` : ''}
              ${s.date ? `<div class="wm-sig-chg" style="color:var(--text-muted)">${wmEsc(s.date)}</div>` : ''}
              <div class="wm-sig-spark">${spark(s.vals, pos)}</div>
            </div>
            <div class="wm-sig-badge ${s.sig.c}">${s.sig.t}</div>
          </div>`;
        }
      }

      if (!signals.length) html += wmEmpty('No signal data available');
      el.innerHTML = html;
    } catch(e) {
      el.innerHTML = wmError('Macro signals unavailable: ' + e.message);
    }
    return;
  }

  // Full FRED dashboard
  try {
    const fetches = await Promise.allSettled(FRED_SIGNALS.map(async s => {
      const limit = s.yoy ? 16 : 6;
      const obs = await fredFetch(s.id, { limit });
      return { ...s, obs };
    }));

    const groups = {};
    for (const r of fetches) {
      if (r.status !== 'fulfilled') continue;
      const { obs, yoy, scale=1, group, sig, label, unit, desc } = r.value;
      if (!obs?.length) continue;
      let vals = obs.map(o => parseFloat(o.value) * scale).filter(v => !isNaN(v));
      let cur = vals[0], prev = vals[1] ?? cur;
      if (yoy && vals.length >= 13) {
        const toYoy = i => ((vals[i] - vals[i+12]) / Math.abs(vals[i+12])) * 100;
        vals = vals.slice(0, 13).map((_,i) => i+12 < vals.length ? toYoy(i) : null).filter(v => v !== null);
        cur = vals[0]; prev = vals[1] ?? cur;
      }
      const signal  = sig(cur, prev);
      const chgAbs  = cur - prev;
      const chgPct  = prev !== 0 ? (chgAbs / Math.abs(prev)) * 100 : 0;
      const fmtCur  = fmtNum(cur, unit);
      const fmtChg  = `${chgAbs >= 0 ? '+' : ''}${unit === 'bps' ? Math.round(chgAbs) : chgAbs.toFixed(2)} ${unit}`;
      if (!groups[group]) groups[group] = [];
      groups[group].push({ label, desc, unit, fmtCur, fmtChg, chgAbs, signal, vals: vals.slice(0,8), date: obs[0].date });
    }

    const all  = Object.values(groups).flat();
    const nBull = all.filter(s => s.signal.c === 'wm-up').length;
    const nBear = all.filter(s => s.signal.c === 'wm-dn').length;
    const nWarn = all.filter(s => s.signal.c === 'wm-warn').length;
    let html = wmLiveBar('Macro Economic Signals — FRED live data', `${all.length} indicators`);
    html += `<div class="wm-sig-summary">
      <span class="wm-up">▲ ${nBull} Bullish</span>
      <span class="wm-warn">⚠ ${nWarn} Caution</span>
      <span class="wm-dn">▼ ${nBear} Bearish</span>
      <span class="wm-flat">→ ${all.length - nBull - nBear - nWarn} Neutral</span>
    </div>`;

    for (const [grp, items] of Object.entries(groups)) {
      html += `<div class="wm-sig-group">${grp}</div>`;
      for (const s of items) {
        const pos = s.chgAbs >= 0;
        html += `<div class="wm-macro-row wm-sig-row">
          <div class="wm-sig-icon">${s.signal.i}</div>
          <div class="wm-sig-info">
            <div class="wm-macro-label">${wmEsc(s.label)}</div>
            <div class="wm-sig-desc">${wmEsc(s.desc)}</div>
          </div>
          <div class="wm-sig-vals">
            <div class="wm-macro-val">${wmEsc(s.fmtCur)}</div>
            <div class="${pos?'wm-up':'wm-dn'} wm-sig-chg">${wmEsc(s.fmtChg)}</div>
            <div class="wm-sig-spark">${spark(s.vals, pos)}</div>
          </div>
          <div class="wm-sig-badge ${s.signal.c}">${s.signal.t}</div>
          <div class="wm-sig-date">${wmEsc(s.date)}</div>
        </div>`;
      }
    }
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = wmError('Macro signals error: ' + e.message);
  }
}

/* ══════════════════════════════════════════════════════════════════
   MACRO COMMODITIES  — 16 markets via Stooq (free, no API key)
   Groups: Energy · Metals · Grains · Softs
   ══════════════════════════════════════════════════════════════════ */
async function wmMacroCommodities() {
  const el = document.getElementById('macro-comm');
  if (!el) return;
  el.innerHTML = wmSpinner('Fetching commodity prices…');

  const COMMS = [
    // Energy
    { sym:'cl.f',  label:'WTI Crude',     unit:'$/bbl',   group:'⚡ Energy',    emoji:'🛢️' },
    { sym:'ng.f',  label:'Natural Gas',   unit:'$/mmbtu', group:'⚡ Energy',    emoji:'🔥' },
    { sym:'ho.f',  label:'Heating Oil',   unit:'$/gal',   group:'⚡ Energy',    emoji:'⛽' },
    { sym:'rb.f',  label:'RBOB Gasoline', unit:'$/gal',   group:'⚡ Energy',    emoji:'⛽' },
    // Metals
    { sym:'gc.f',  label:'Gold',          unit:'$/oz',    group:'🔩 Metals',    emoji:'🥇' },
    { sym:'si.f',  label:'Silver',        unit:'$/oz',    group:'🔩 Metals',    emoji:'🥈' },
    { sym:'hg.f',  label:'Copper',        unit:'$/lb',    group:'🔩 Metals',    emoji:'🔶' },
    { sym:'pl.f',  label:'Platinum',      unit:'$/oz',    group:'🔩 Metals',    emoji:'⬜' },
    { sym:'pa.f',  label:'Palladium',     unit:'$/oz',    group:'🔩 Metals',    emoji:'🔲' },
    // Grains
    { sym:'w.f',   label:'Wheat',         unit:'¢/bu',    group:'🌾 Grains',    emoji:'🌾' },
    { sym:'c.f',   label:'Corn',          unit:'¢/bu',    group:'🌾 Grains',    emoji:'🌽' },
    { sym:'s.f',   label:'Soybeans',      unit:'¢/bu',    group:'🌾 Grains',    emoji:'🫘' },
    // Softs
    { sym:'kc.f',  label:'Coffee',        unit:'¢/lb',    group:'☕ Softs',     emoji:'☕' },
    { sym:'sb.f',  label:'Sugar',         unit:'¢/lb',    group:'☕ Softs',     emoji:'🍬' },
    { sym:'ct.f',  label:'Cotton',        unit:'¢/lb',    group:'☕ Softs',     emoji:'🌿' },
    { sym:'cc.f',  label:'Cocoa',         unit:'$/mt',    group:'☕ Softs',     emoji:'🍫' },
  ];

  const fmtPrice = (v, unit) => {
    if (unit.startsWith('¢')) return v.toFixed(2) + '¢';
    return '$' + v.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
  };

  const results = await Promise.allSettled(COMMS.map(async s => {
    const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://stooq.com/q/d/l/?s=${s.sym}&i=d`)}`;
    const res   = await fetch(proxy, { signal: AbortSignal.timeout(10000) });
    const text  = await res.text();
    const lines = text.trim().split('\n').filter(l => l && !l.startsWith('Date'));
    if (lines.length < 2) throw new Error('no data');
    const last  = lines[lines.length-1].split(',');
    const prev  = lines[lines.length-2].split(',');
    const cur = +last[4], prv = +prev[4];
    if (!cur || !prv) throw new Error('zero price');
    const chgPct = ((cur - prv) / prv) * 100;
    const chgAbs = cur - prv;
    return { ...s, cur, prv, chgPct, chgAbs, date: last[0] };
  }));

  const groups = {};
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const s = r.value;
    if (!groups[s.group]) groups[s.group] = [];
    groups[s.group].push(s);
  }

  const total = Object.values(groups).flat().length;
  const rising = Object.values(groups).flat().filter(s => s.chgPct > 0).length;
  const falling = total - rising;
  let html = wmLiveBar('Commodity Prices — Stooq live data', `${total} markets · ${rising} ▲ rising · ${falling} ▼ falling`);

  for (const [grp, items] of Object.entries(groups)) {
    html += `<div class="wm-sig-group">${grp}</div><div class="wm-comm-grid">`;
    for (const s of items) {
      const pos = s.chgPct >= 0;
      const pctStr = `${pos?'▲':'▼'} ${Math.abs(s.chgPct).toFixed(2)}%`;
      html += `<div class="wm-comm-card ${pos?'wm-comm-pos':'wm-comm-neg'}">
        <div class="wm-comm-emoji">${s.emoji}</div>
        <div class="wm-comm-name">${wmEsc(s.label)}</div>
        <div class="wm-comm-price">${wmEsc(fmtPrice(s.cur, s.unit))}</div>
        <div class="${pos?'wm-up':'wm-dn'} wm-comm-chg">${pctStr}</div>
        <div class="wm-comm-unit">${wmEsc(s.unit)}</div>
        <div class="wm-comm-date">${wmEsc(s.date)}</div>
      </div>`;
    }
    html += '</div>';
  }

  el.innerHTML = html || wmEmpty('No commodity data returned from Stooq');
}

/* ══════════════════════════════════════════════════════════════════
   MACRO RISK  — World Bank Political Stability & Absence of Violence
   Indicator: PV.EST  Range: -2.5 (unstable) to +2.5 (stable)
   Converted to instability index 0-100 (0 = stable, 100 = unstable)
   ══════════════════════════════════════════════════════════════════ */
async function wmMacroRisk() {
  const el = document.getElementById('macro-risk');
  if (!el) return;
  el.innerHTML = wmSpinner('Fetching country risk scores…');

  // ISO-3 codes for broad country coverage
  const COUNTRIES = 'US;CN;RU;DE;GB;FR;JP;IN;BR;ZA;NG;EG;TR;SA;IR;UA;IL;PK;VE;MM;LY;SY;AF;ET;AZ;BY;KZ;MX;SD;SO;CD;DZ;IQ;YE;LB;CU;KP';
  const ISO3_TO_2 = {
    USA:'US',CHN:'CN',RUS:'RU',DEU:'DE',GBR:'GB',FRA:'FR',JPN:'JP',IND:'IN',BRA:'BR',ZAF:'ZA',
    NGA:'NG',EGY:'EG',TUR:'TR',SAU:'SA',IRN:'IR',UKR:'UA',ISR:'IL',PAK:'PK',VEN:'VE',MMR:'MM',
    LBY:'LY',SYR:'SY',AFG:'AF',ETH:'ET',AZE:'AZ',BLR:'BY',KAZ:'KZ',MEX:'MX',SDN:'SD',SOM:'SO',
    COD:'CD',DZA:'DZ',IRQ:'IQ',YEM:'YE',LBN:'LB',CUB:'CU',PRK:'KP',
  };
  const FLAGS = {
    US:'🇺🇸',CN:'🇨🇳',RU:'🇷🇺',DE:'🇩🇪',GB:'🇬🇧',FR:'🇫🇷',JP:'🇯🇵',IN:'🇮🇳',BR:'🇧🇷',ZA:'🇿🇦',
    NG:'🇳🇬',EG:'🇪🇬',TR:'🇹🇷',SA:'🇸🇦',IR:'🇮🇷',UA:'🇺🇦',IL:'🇮🇱',PK:'🇵🇰',VE:'🇻🇪',MM:'🇲🇲',
    LY:'🇱🇾',SY:'🇸🇾',AF:'🇦🇫',ET:'🇪🇹',AZ:'🇦🇿',BY:'🇧🇾',KZ:'🇰🇿',MX:'🇲🇽',SD:'🇸🇩',SO:'🇸🇴',
    CD:'🇨🇩',DZ:'🇩🇿',IQ:'🇮🇶',YE:'🇾🇪',LB:'🇱🇧',CU:'🇨🇺',KP:'🇰🇵',
  };

  try {
    const url  = `https://api.worldbank.org/v2/country/${COUNTRIES}/indicator/PV.EST?format=json&mrv=1&per_page=60`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`World Bank API ${res.status}`);
    const json = await res.json();
    const raw  = Array.isArray(json[1]) ? json[1] : [];

    const scores = raw
      .filter(d => d.value !== null && d.countryiso3code)
      .map(d => {
        const iso2 = ISO3_TO_2[d.countryiso3code] || d.countryiso3code.slice(0,2);
        const wb   = parseFloat(d.value); // -2.5 to +2.5
        return {
          code:        d.countryiso3code,
          iso2,
          country:     d.country?.value || d.countryiso3code,
          wbScore:     wb,
          instability: Math.min(100, Math.max(0, ((-wb + 2.5) / 5) * 100)),
          year:        d.date,
          flag:        FLAGS[iso2] || '🌍',
        };
      })
      .sort((a,b) => b.instability - a.instability);

    if (!scores.length) { el.innerHTML = wmEmpty('No World Bank data available'); return; }

    const yr = scores[0]?.year || '';
    let html = wmLiveBar('Country Political Stability Risk — World Bank WGI', `${scores.length} countries · data year ${yr}`);
    html += `<div style="padding:4px 10px 10px;font-size:11px;color:var(--muted)">
      World Bank Political Stability & Absence of Violence/Terrorism (PV.EST).
      Bar = instability index 0–100 (0 = very stable · 100 = very unstable). Score in parentheses = original WB value (−2.5 to +2.5).
    </div>`;

    const TIERS = [
      { label:'🔴 Critical Risk (75–100)', min:75, max:101 },
      { label:'🟠 High Risk (50–74)',       min:50, max:75  },
      { label:'🟡 Moderate Risk (25–49)',   min:25, max:50  },
      { label:'🟢 Low Risk (0–24)',          min:0,  max:25  },
    ];

    for (const tier of TIERS) {
      const items = scores.filter(s => s.instability >= tier.min && s.instability < tier.max);
      if (!items.length) continue;
      html += `<div class="wm-sig-group">${tier.label} — ${items.length} countries</div>`;
      for (const s of items) {
        const pct = Math.round(s.instability);
        const col = pct >= 75 ? '#ff4757' : pct >= 50 ? '#ffa500' : pct >= 25 ? '#e0c040' : '#00d4a0';
        const sign = s.wbScore >= 0 ? '+' : '';
        html += `<div class="wm-risk-row">
          <span class="wm-risk-flag">${s.flag}</span>
          <span class="wm-risk-country">${wmEsc(s.country)}</span>
          <div class="wm-risk-bar-wrap">
            <div class="wm-risk-bar" style="width:${pct}%;background:${col}"></div>
          </div>
          <span class="wm-risk-score" style="color:${col}">${pct}</span>
          <span class="wm-risk-raw">(${sign}${s.wbScore.toFixed(2)})</span>
        </div>`;
      }
    }

    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = wmError('Country risk data unavailable: ' + e.message);
  }
}

/* ══════════════════════════════════════════════════════════════════
   MACRO PREDICTIONS  — Polymarket Gamma API (free, no key)
   Fallback: Metaculus community forecasts
   ══════════════════════════════════════════════════════════════════ */
async function wmMacroPredictions() {
  const el = document.getElementById('macro-pred');
  if (!el) return;
  el.innerHTML = wmSpinner('Fetching prediction markets…');

  let markets = [], source = 'Polymarket';
  try {
    const res = await fetch('https://api.manifold.markets/v0/markets?limit=40', {
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error(`Manifold ${res.status}`);
    const raw = await res.json();

    const markets = raw
      .filter(m => m.question && !m.isResolved)
      .map(m => ({
        question: m.question,
        prob:     m.probability != null ? Math.round(m.probability * 100) : null,
        volume:   m.volume || null,
        endDate:  m.closeTime ? new Date(m.closeTime).toISOString() : null,
        category: m.groupSlugs?.[0]?.replace(/-/g,' ') || 'General',
        url:      m.url || null,
      }))
      .sort((a,b) => (b.volume||0) - (a.volume||0));

    if (!markets.length) { el.innerHTML = wmEmpty('No prediction market data'); return; }

    const cats = [...new Set(markets.map(m => m.category).filter(Boolean))].slice(0, 8);
    let html = wmLiveBar('Prediction Markets — Manifold Markets', `${markets.length} open questions`);

    html += `<div class="wm-pred-cats">
      <span class="wm-pred-cat-chip wm-pred-active" onclick="wmPredFilter(this,'')">All</span>
      ${cats.map(c => `<span class="wm-pred-cat-chip" onclick="wmPredFilter(this,'${wmEsc(c)}')">${wmEsc(c)}</span>`).join('')}
    </div>`;

    html += `<div id="wm-pred-list">`;
    for (const m of markets.slice(0, 30)) {
      const pct   = m.prob;
      const level = pct != null ? (pct >= 70 ? 'critical' : pct >= 50 ? 'high' : pct >= 30 ? 'medium' : 'low') : 'low';
      const col   = wmSeverityColor(level);
      const volStr = m.volume >= 1e3 ? 'M$'+(m.volume/1e3).toFixed(0)+'K' : m.volume ? 'M$'+Math.round(m.volume) : null;
      const endStr = m.endDate ? new Date(m.endDate).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'2-digit'}) : null;
      html += `<div class="wm-pred-row" data-cat="${wmEsc(m.category||'')}">
        <div class="wm-pred-q">${wmEsc(m.question)}</div>
        <div class="wm-pred-meta">
          ${m.category ? `<span class="wm-pred-cat">${wmEsc(m.category)}</span>` : ''}
          ${volStr ? `<span>💰 ${volStr}</span>` : ''}
          ${endStr ? `<span>📅 ${endStr}</span>` : ''}
          ${m.url  ? `<a href="${wmEsc(m.url)}" target="_blank" rel="noopener" style="color:var(--accent);font-size:11px">↗ open</a>` : ''}
        </div>
        ${pct != null ? `<div class="wm-pred-prob">
          <div class="wm-pred-bar-bg"><div class="wm-pred-bar-fill" style="width:${pct}%;background:${col.text}"></div></div>
          <span class="wm-pred-pct" style="color:${col.text}">${pct}% YES</span>
        </div>` : '<div class="wm-pred-prob"><span style="color:var(--text-muted);font-size:11px">Binary market</span></div>'}
      </div>`;
    }
    html += '</div>';
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = wmError('Prediction markets unavailable: ' + e.message);
  }
  html += '</div>';
  el.innerHTML = html;
}

function wmPredFilter(chip, cat) {
  document.querySelectorAll('.wm-pred-cat-chip').forEach(c => c.classList.remove('wm-pred-active'));
  if (chip) chip.classList.add('wm-pred-active');
  document.querySelectorAll('#wm-pred-list .wm-pred-row').forEach(r => {
    r.style.display = (!cat || r.dataset.cat === cat) ? '' : 'none';
  });
}

function wmPredFilter(chip, cat) {
  document.querySelectorAll('.wm-pred-cat-chip').forEach(c => c.classList.remove('wm-pred-active'));
  if (chip) chip.classList.add('wm-pred-active');
  document.querySelectorAll('#wm-pred-list .wm-pred-row').forEach(r => {
    r.style.display = (!cat || r.dataset.cat === cat) ? '' : 'none';
  });
}

/* ─────────────────────────────────────────────────────────────────
   ENHANCED GEO·RISK TABS
   New tabs: INTEL · SIGNALS · QUAKES
   ───────────────────────────────────────────────────────────────── */

/* INTEL tab: World Bank risk scores + Bloomberg news */
async function wmGeoIntel() {
  const el = document.getElementById('geo-intel');
  if (!el) return;
  el.innerHTML = wmSpinner('Fetching intelligence data…');
  try {
    const ISO3_TO_2 = {
      USA:'US',CHN:'CN',RUS:'RU',DEU:'DE',GBR:'GB',FRA:'FR',JPN:'JP',IND:'IN',BRA:'BR',ZAF:'ZA',
      NGA:'NG',EGY:'EG',TUR:'TR',SAU:'SA',IRN:'IR',UKR:'UA',ISR:'IL',PAK:'PK',VEN:'VE',MMR:'MM',
      LBY:'LY',SYR:'SY',AFG:'AF',ETH:'ET',AZE:'AZ',BLR:'BY',KAZ:'KZ',MEX:'MX',SDN:'SD',SOM:'SO',
      COD:'CD',DZA:'DZ',IRQ:'IQ',YEM:'YE',LBN:'LB',CUB:'CU',PRK:'KP',
    };
    const FLAGS = {
      US:'🇺🇸',CN:'🇨🇳',RU:'🇷🇺',DE:'🇩🇪',GB:'🇬🇧',FR:'🇫🇷',JP:'🇯🇵',IN:'🇮🇳',BR:'🇧🇷',ZA:'🇿🇦',
      NG:'🇳🇬',EG:'🇪🇬',TR:'🇹🇷',SA:'🇸🇦',IR:'🇮🇷',UA:'🇺🇦',IL:'🇮🇱',PK:'🇵🇰',VE:'🇻🇪',MM:'🇲🇲',
      LY:'🇱🇾',SY:'🇸🇾',AF:'🇦🇫',ET:'🇪🇹',AZ:'🇦🇿',BY:'🇧🇾',KZ:'🇰🇿',MX:'🇲🇽',SD:'🇸🇩',SO:'🇸🇴',
      CD:'🇨🇩',DZ:'🇩🇿',IQ:'🇮🇶',YE:'🇾🇪',LB:'🇱🇧',CU:'🇨🇺',KP:'🇰🇵',
    };
    const COUNTRIES = 'US;CN;RU;DE;GB;FR;JP;IN;BR;ZA;NG;EG;TR;SA;IR;UA;IL;PK;VE;MM;LY;SY;AF;ET;AZ;BY;KZ;MX;SD;SO;CD;DZ;IQ;YE;LB;CU;KP';
    const proxy = 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://feeds.bloomberg.com/markets/news.rss');

    const [wbRes, rssRes] = await Promise.allSettled([
      fetch(`https://api.worldbank.org/v2/country/${COUNTRIES}/indicator/PV.EST?format=json&mrv=1&per_page=60`, { signal: AbortSignal.timeout(12000) }),
      fetch(proxy, { signal: AbortSignal.timeout(10000) }),
    ]);

    let html = wmLiveBar('Theater Intel — World Bank Stability + Bloomberg', 'Live data');

    // World Bank instability heatmap
    if (wbRes.status === 'fulfilled' && wbRes.value.ok) {
      const wbJson = await wbRes.value.json();
      const raw = Array.isArray(wbJson[1]) ? wbJson[1] : [];
      const scores = raw
        .filter(d => d.value !== null && d.countryiso3code)
        .map(d => {
          const iso2 = ISO3_TO_2[d.countryiso3code] || d.countryiso3code.slice(0,2);
          const wb = parseFloat(d.value);
          return { iso2, country: d.country?.value || d.countryiso3code,
            instability: Math.min(100, Math.max(0, ((-wb + 2.5) / 5) * 100)),
            flag: FLAGS[iso2] || '🌍' };
        })
        .sort((a,b) => b.instability - a.instability)
        .slice(0, 15);

      if (scores.length) {
        html += `<div class="wm-section-head">🌡 Instability Index — Top Risk Countries</div>`;
        html += `<div class="wm-risk-heatmap">` +
          scores.map(s => {
            const pct = Math.round(s.instability);
            const level = pct >= 75 ? 'critical' : pct >= 50 ? 'high' : pct >= 30 ? 'medium' : 'low';
            const col = wmSeverityColor(level);
            return `<div class="wm-heat-cell" style="background:${col.bg};border-color:${col.border}">
              <span class="wm-heat-country">${s.flag} ${wmEsc(s.iso2)}</span>
              <span class="wm-heat-score" style="color:${col.text}">${pct}</span>
            </div>`;
          }).join('') + `</div>`;
      }
    }

    // Bloomberg headlines
    if (rssRes.status === 'fulfilled' && rssRes.value.ok) {
      const rssText = await rssRes.value.text();
      const doc = new DOMParser().parseFromString(rssText, 'text/xml');
      const items = [...doc.querySelectorAll('item')].slice(0, 10);
      if (items.length) {
        html += `<div class="wm-section-head">📰 Bloomberg — Latest Intelligence</div>`;
        html += items.map(item => {
          const title   = item.querySelector('title')?.textContent || '';
          const link    = item.querySelector('link')?.textContent || '';
          const pubDate = item.querySelector('pubDate')?.textContent || '';
          const ts      = pubDate ? wmRelTime(new Date(pubDate).getTime()) : '';
          return `<div class="wm-intel-row" style="border-left:3px solid var(--border)">
            <div class="wm-intel-title">${link ? `<a href="${wmEsc(link)}" target="_blank" rel="noopener" style="color:var(--text)">${wmEsc(title)}</a>` : wmEsc(title)}</div>
            ${ts ? `<div class="wm-intel-meta"><span>${ts}</span></div>` : ''}
          </div>`;
        }).join('');
      }
    }

    if (!html.includes('wm-section-head')) html += wmEmpty('No intelligence data available');
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = wmError(e.message);
  }

}

/* SIGNALS tab: Bloomberg RSS financial headlines */
async function wmGeoSignals() {
  const el = document.getElementById('geo-signals');
  if (!el) return;
  el.innerHTML = wmSpinner('Fetching intelligence signals…');
  try {
    const proxy = 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://feeds.bloomberg.com/markets/news.rss');
    const res = await fetch(proxy, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`Bloomberg RSS ${res.status}`);
    const text = await res.text();
    const doc  = new DOMParser().parseFromString(text, 'text/xml');
    const items = [...doc.querySelectorAll('item')].slice(0, 25);
    if (!items.length) { el.innerHTML = wmError('No signal data available'); return; }

    const GEO_HIGH = ['war','missile','attack','coup','default','sanction','crisis','collapse'];
    const GEO_MED  = ['iran','russia','china','taiwan','ukraine','opec','fed','rate','inflation','tariff','military'];

    const signals = items.map(item => {
      const title   = item.querySelector('title')?.textContent || '';
      const link    = item.querySelector('link')?.textContent || '';
      const pubDate = item.querySelector('pubDate')?.textContent || '';
      const desc    = item.querySelector('description')?.textContent?.replace(/<[^>]+>/g,'') || '';
      const lower   = title.toLowerCase();
      const sev     = GEO_HIGH.some(k => lower.includes(k)) ? 'high'
                    : GEO_MED.some(k => lower.includes(k))  ? 'medium' : 'low';
      const cat     = GEO_MED.find(k => lower.includes(k)) || 'markets';
      return { title, link, pubDate, desc, sev, cat };
    });

    const ts = signals[0]?.pubDate ? wmRelTime(new Date(signals[0].pubDate).getTime()) : '';
    el.innerHTML = wmLiveBar('Intelligence Signals — Bloomberg Markets', ts) +
      signals.map(s => {
        const col  = wmSeverityColor(s.sev);
        const time = s.pubDate ? wmRelTime(new Date(s.pubDate).getTime()) : '';
        return `<div class="wm-signal-row" style="border-left:3px solid ${col.border}">
          <div class="wm-signal-header">
            ${wmBadge(s.sev.toUpperCase(), s.sev)}
            <span class="wm-signal-cat">${wmEsc(s.cat)}</span>
            ${time ? `<span class="wm-signal-time">${time}</span>` : ''}
          </div>
          <div class="wm-signal-title">${s.link
            ? `<a href="${wmEsc(s.link)}" target="_blank" rel="noopener" style="color:var(--text)">${wmEsc(s.title)}</a>`
            : wmEsc(s.title)}</div>
          ${s.desc ? `<div class="wm-signal-body">${wmEsc(s.desc.slice(0,180))}${s.desc.length > 180 ? '…' : ''}</div>` : ''}
        </div>`;
      }).join('');
  } catch(e) {
    el.innerHTML = wmError('Signals unavailable: ' + e.message);
  }
}

/* QUAKES tab: earthquakes + natural events */
async function wmGeoQuakes() {
  const el = document.getElementById('geo-quakes');
  if (!el) return;
  el.innerHTML = wmSpinner('Fetching seismic data…');
  try {
    const res = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson', {
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error(`USGS ${res.status}`);
    const json = await res.json();
    const features = json.features || [];

    const quakes = features
      .map(f => ({
        mag:   f.properties.mag,
        place: f.properties.place,
        time:  f.properties.time,
        depth: f.geometry?.coordinates?.[2],
        url:   f.properties.url,
      }))
      .sort((a,b) => b.mag - a.mag)
      .slice(0, 20);

    let html = wmLiveBar('Seismic Activity — USGS M4.5+ past 7 days', `${features.length} events`);
    html += `<div class="wm-section-head">🏔 Significant Earthquakes (M4.5+, sorted by magnitude)</div>`;
    html += quakes.map(q => {
      const sev = q.mag >= 7 ? 'critical' : q.mag >= 5.5 ? 'high' : 'medium';
      const col = wmSeverityColor(sev);
      const ts  = wmRelTime(q.time);
      return `<div class="wm-quake-row" style="border-left:3px solid ${col.border}">
        <span class="wm-quake-mag" style="color:${col.text}">M${q.mag.toFixed(1)}</span>
        <div class="wm-quake-info">
          <div class="wm-quake-place">${q.url
            ? `<a href="${wmEsc(q.url)}" target="_blank" rel="noopener" style="color:var(--text)">${wmEsc(q.place || 'Unknown')}</a>`
            : wmEsc(q.place || 'Unknown')}</div>
          <div class="wm-quake-meta">
            ${q.depth != null ? `<span>Depth ${q.depth.toFixed(0)}km</span>` : ''}
            ${ts ? `<span>${ts}</span>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');

    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = wmError('Seismic data unavailable: ' + e.message);
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
    // Fetch live aircraft counts from OpenSky Network
    const res = await fetch('https://opensky-network.org/api/states/all', {
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw new Error(`OpenSky ${res.status}`);
    const json = await res.json();
    const states = json.states || [];

    const REGIONS = [
      { name: 'North Atlantic (EU→US)',   lat: [35,60],  lon: [-60, 10], emoji: '🌊' },
      { name: 'Transpacific (Asia→US)',    lat: [15,55],  lon: [120,180], emoji: '🌏' },
      { name: 'Middle East / Gulf',        lat: [15,32],  lon: [ 40, 60], emoji: '🕌' },
      { name: 'Southeast Asia Hub',        lat: [-5,25],  lon: [ 95,140], emoji: '🏝' },
      { name: 'Europe (Core)',             lat: [43,58],  lon: [ -5, 25], emoji: '🇪🇺' },
      { name: 'North America (Domestic)', lat: [24,50],  lon: [-125,-70], emoji: '🗽' },
    ];

    const regionCounts = REGIONS.map(r => ({
      ...r,
      count: states.filter(s => {
        const lat = s[6], lon = s[5];
        return lat != null && lon != null && !s[8] &&
          lat >= r.lat[0] && lat <= r.lat[1] &&
          lon >= r.lon[0] && lon <= r.lon[1];
      }).length,
    }));

    const total = states.filter(s => !s[8]).length;
    el.innerHTML = wmLiveBar('Air Traffic — OpenSky Network Live', `${total.toLocaleString()} aircraft airborne`) +
      `<div class="wm-flight-grid">` +
      regionCounts.map(r => `<div class="wm-flight-card">
        <div class="wm-flight-code">${r.emoji}</div>
        <div class="wm-flight-name">${wmEsc(r.name)}</div>
        <div class="wm-flight-delay">${r.count.toLocaleString()} aircraft</div>
      </div>`).join('') + `</div>` +
      `<div style="padding:4px 8px;font-size:10px;color:var(--text-muted)">
        Live ADS-B data · ${new Date().toUTCString().slice(0,25)} UTC
      </div>`;
  } catch(e) {
    el.innerHTML = wmError('Flight data unavailable: ' + e.message);
  }
}

/* Energy data — reference prices */
async function wmSupplyEnergy() {
  const el = document.getElementById('supply-energy');
  if (!el) return;
  el.innerHTML = wmLiveBar('Energy Market Reference Prices', '2025 market ranges') +
    `<div class="wm-energy-grid">
      <div class="wm-energy-card"><div class="wm-energy-label">🛢 WTI Crude</div><div class="wm-energy-val">~$68–72</div><div class="wm-energy-unit">$/bbl · 2025</div></div>
      <div class="wm-energy-card"><div class="wm-energy-label">🪨 Brent Crude</div><div class="wm-energy-val">~$71–75</div><div class="wm-energy-unit">$/bbl · 2025</div></div>
      <div class="wm-energy-card"><div class="wm-energy-label">🔥 Henry Hub Gas</div><div class="wm-energy-val">~$3.5–4.2</div><div class="wm-energy-unit">$/mmbtu · 2025</div></div>
      <div class="wm-energy-card"><div class="wm-energy-label">⚡ TTF Gas (EU)</div><div class="wm-energy-val">~€35–45</div><div class="wm-energy-unit">€/MWh · 2025</div></div>
    </div>
    <div style="padding:6px 10px;font-size:11px;color:var(--text-muted)">
      📌 Add your <a href="#" onclick="openApiConfig('eia');return false" style="color:var(--accent)">EIA API key</a>
      for live weekly petroleum data. Reference prices are approximate 2025 trading ranges.
    </div>`;
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
/* ── Render the intel feed ──────────────────────────────────────── */
/* ── Load & refresh intel data ──────────────────────────────────── */
/* ── Toast notification ─────────────────────────────────────────── */
/* ── Intel panel filter ─────────────────────────────────────────── */
/* ── Intel panel init ───────────────────────────────────────────── */
/* ══════════════════════════════════════════════════════════════════
   RESOURCE LINK — click on any resource/chokepoint/mineral
   Opens a side drawer with news + sector watchlist
   ══════════════════════════════════════════════════════════════════ */

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
          !e.target.closest('[onclick*="wmResourceLink"],[class*="wm-ic-"],[class*="wm-choke"],[class*="wm-min-"],[class*="wm-signal-"],[class*="wm-alert-"]'))
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
      sub: risk.driver||risk.cause||'', col:c });
  }
  signals.forEach(s => {
    const c = wmSeverityColor(s.severity||'medium');
    items.push({ icon:'🧠', title: s.title||s.headline||'Signal',
      sub: (s.body||s.description||'').slice(0,80), col:c });
  });
  geoEvents.slice(0,1).forEach(e => {
    const c = wmSeverityColor(e.severity||'medium');
    items.push({ icon:'✊', title: e.title||e.description||'Event', sub: e.location||'', col:c });
  });
  wmBanner(items, 'news', `wm-banner-news-${sym}`);
}

function wmInjectQuoteEnrichment(sym, topic, risk, chokes, signals) {
  const items = [];
  if (risk && (risk.score||0) >= 40) {
    const c = wmScoreColor(risk.score||0);
    items.push({ icon:'🌡', title:`${risk.country||''} Country Risk: ${Math.round(risk.score||0)}/100`,
      sub: risk.driver||'Political/economic risk indicator', col:c });
  }
  chokes.forEach(ch => {
    const c = wmSeverityColor(ch.riskLevel||ch.risk||'medium');
    items.push({ icon:'🌊', title:`Chokepoint: ${ch.name||''}`,
      sub:`${(ch.affectedCommodities||[]).join(', ')}`, col:c,
      action:`switchTab('supply','choke');showPanel('supply')` });
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
      sub:(s.recommendation||s.body||'').slice(0,90), col:c });
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
      col:c });
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
    items.push({ icon:'🧠', title:s.title||'', sub:(s.body||'').slice(0,80), col:c });
  });
  chokes.forEach(ch => {
    const c = wmSeverityColor(ch.riskLevel||ch.risk||'medium');
    items.push({ icon:'⛓', title:`Supply constraint: ${ch.name||''}`,
      sub:`Affects sector peers in: ${(ch.affectedCommodities||[]).join(', ')}`, col:c,
      action:`switchTab('supply','choke');showPanel('supply')` });
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
      sub:`${topic} — ${risk.driver||'Regional instability'}`, col:c });
  }
  signals.slice(0,2).forEach(s => {
    const c = wmSeverityColor(s.severity||'medium');
    items.push({ icon:'🧠', title:s.title||'', sub:(s.body||'').slice(0,80), col:c });
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
      sub:`${risk.country||''} instability index ${pct}/100 — affects DCF discount rate & peer multiples`, col:c });
  }
  chokes.forEach(ch => {
    const c = wmSeverityColor(ch.riskLevel||ch.risk||'medium');
    items.push({ icon:'⛓', title:`Supply chain disruption: ${ch.name||''}`,
      sub:'May compress margins and affect forward revenue estimates.', col:c,
      action:`switchTab('supply','choke');showPanel('supply')` });
  });
  geoEvents.slice(0,1).forEach(e => {
    items.push({ icon:'⚠', title:e.title||e.description||'Geopolitical event',
      sub:'Consider in terminal value and scenario analysis.', col:wmSeverityColor(e.severity||'medium') });
  });
  cyber.forEach(c => {
    items.push({ icon:'💻', title:`Cyber exposure: ${c.title||c.sector||''}`,
      sub:'Factor in operational risk and potential liability.', col:wmSeverityColor(c.severity||'medium') });
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
function wmGeoGpsJam() {
  const el = document.getElementById('geo-gpsjam');
  if (!el) return;

  // OSINT-curated active GPS/GNSS jamming zones (updated 2025)
  const zones = [
    { severity:'critical', region:'Eastern Ukraine / Donbas',          description:'Heavy military GPS jamming, active conflict zone' },
    { severity:'critical', region:'Israel / Gaza / Lebanon',            description:'IDF + Hezbollah GPS spoofing/jamming operations active' },
    { severity:'high',     region:'Baltic States (Estonia/Latvia/Lithuania)', description:'Russian GPS jamming affecting civilian aviation routes' },
    { severity:'high',     region:'Finland / Lapland (Russian border)', description:'GPS disruption reported by Finnish aviation authority' },
    { severity:'high',     region:'Black Sea / Romania / Moldova',      description:'GPS spoofing incidents reported by maritime & aviation' },
    { severity:'high',     region:'Syria / Northern Iraq',              description:'Persistent GPS interference from multiple actors' },
    { severity:'medium',   region:'Red Sea / Gulf of Aden',            description:'Houthi drone/missile ops causing GPS spoofing reports' },
    { severity:'medium',   region:'Taiwan Strait',                      description:'PLA exercises cause periodic GPS disruption' },
    { severity:'medium',   region:'Kaliningrad region',                 description:'Russian military installations causing GNSS interference' },
    { severity:'medium',   region:'Iran / Strait of Hormuz',           description:'Reported GPS spoofing incidents affecting shipping' },
    { severity:'low',      region:'North Korea / S. Korea border',     description:'Periodic DPRK GPS jamming events' },
    { severity:'low',      region:'Western China (Xinjiang)',           description:'GPS signal anomalies in restricted areas' },
  ];

  let html = wmLiveBar('GPS Jamming Zones — OSINT Curated', `${zones.length} active zones`) +
    `<div style="padding:4px 10px 8px;font-size:11px;color:var(--text-muted)">
      Active GPS/GNSS jamming & spoofing zones based on open-source intelligence. Sources: aviation authorities, maritime AIS anomalies, OSINT researchers.
    </div><div class="wm-gps-list">`;

  for (const item of zones) {
    const color = item.severity === 'critical' ? '#ff2222' : item.severity === 'high' ? '#ff6600' : item.severity === 'medium' ? '#ffaa00' : 'var(--text-muted)';
    html += `<div class="wm-gps-row">
      <span class="wm-gps-sev" style="color:${color};text-transform:uppercase;font-weight:700;min-width:72px">${wmEsc(item.severity)}</span>
      <span class="wm-gps-region">${wmEsc(item.region)}</span>
      <span class="wm-gps-desc">${wmEsc(item.description)}</span>
    </div>`;
  }
  html += '</div>';
  el.innerHTML = html;
}

/* ── Military Operations  → Geo·Risk MILOPS tab (OpenSky live) ── */
async function wmGeoMilOps() {
  const el = document.getElementById('geo-milops');
  if (!el) return;
  el.innerHTML = wmSpinner('Loading military flight data…');
  try {
    const res = await fetch('https://opensky-network.org/api/states/all', {
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw new Error(`OpenSky ${res.status}`);
    const json = await res.json();
    const states = json.states || [];

    // Filter for known military callsign prefixes
    const MIL_PREFIXES = ['RCH','REACH','DUKE','KNIFE','IRON','VAPOR','SPAR','JAKE','SAM','VENUS','GRIM','FURY','BOXER','HAVOC','VIPER','JEDI','CHAOS','DOOM','STORM','SHELL','MODAL'];

    const milFlights = states
      .filter(s => {
        const cs = (s[1] || '').trim().toUpperCase();
        return cs.length > 3 && MIL_PREFIXES.some(p => cs.startsWith(p));
      })
      .slice(0, 40)
      .map(s => ({
        callsign: (s[1] || '').trim(),
        country:  s[2] || 'Unknown',
        altitude: s[7] ? Math.round(s[7] * 3.281) : null,
        speed:    s[9] ? Math.round(s[9] * 1.944) : null,
        onGround: s[8],
      }))
      .filter(f => !f.onGround);

    if (!milFlights.length) {
      el.innerHTML = wmLiveBar('Military Flight Activity — OpenSky Network') +
        wmEmpty('No military callsigns detected in current ADS-B feed');
      return;
    }

    const groups = {};
    for (const f of milFlights) {
      const prefix = MIL_PREFIXES.find(p => f.callsign.startsWith(p)) || 'Other';
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push(f);
    }

    let html = wmLiveBar('Military Flight Activity — OpenSky Network', `${milFlights.length} sorties detected`);
    html += '<div class="wm-milops-list">';
    for (const [type, flights] of Object.entries(groups)) {
      html += `<div class="wm-milops-type-head">${wmEsc(type)} <span style="color:var(--text-muted);font-weight:400">(${flights.length})</span></div>`;
      for (const f of flights) {
        html += `<div class="wm-milops-row">
          <span class="wm-milops-cs">${wmEsc(f.callsign)}</span>
          <span class="wm-milops-region">${wmEsc(f.country)}${f.altitude ? ` · ${f.altitude.toLocaleString()}ft` : ''}</span>
          ${f.speed ? `<span class="wm-milops-note">${f.speed}kts</span>` : ''}
        </div>`;
      }
    }
    html += '</div>';
    html += `<div style="padding:4px 8px;font-size:10px;color:var(--text-muted)">
      Source: OpenSky Network live ADS-B. Shows aircraft using known military callsign prefixes.
    </div>`;
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = wmError('Military flight data unavailable: ' + e.message);
  }
}

/* ── OREF Alerts (Israel sirens)  → Intel·Feed OREF tab ────────── */
/* ── Telegram Breaking Feed  → Intel·Feed TELEGRAM tab ─────────── */
/* ══════════════════════════════════════════════════════════════════
   ETF FLOWS  — Major ETF performance & flow proxy
   Primary: FMP batch quote (needs key)
   Fallback: Stooq individual quotes (free, no key)
   ══════════════════════════════════════════════════════════════════ */
async function wmMacroEtfFlows() {
  const el = document.getElementById('macro-flows');
  if (!el) return;
  el.innerHTML = wmSpinner('Loading ETF performance data…');

  const ETF_LIST = [
    // Broad market
    { sym:'SPY',  name:'S&P 500',              cat:'🏛 Broad Market' },
    { sym:'QQQ',  name:'Nasdaq-100',           cat:'🏛 Broad Market' },
    { sym:'IWM',  name:'Russell 2000',         cat:'🏛 Broad Market' },
    { sym:'DIA',  name:'Dow Jones 30',         cat:'🏛 Broad Market' },
    { sym:'VTI',  name:'Total US Market',      cat:'🏛 Broad Market' },
    // Sectors
    { sym:'XLK',  name:'Technology',           cat:'📊 Sector' },
    { sym:'XLF',  name:'Financials',           cat:'📊 Sector' },
    { sym:'XLV',  name:'Health Care',          cat:'📊 Sector' },
    { sym:'XLC',  name:'Comm. Services',       cat:'📊 Sector' },
    { sym:'XLY',  name:'Consumer Discr.',      cat:'📊 Sector' },
    { sym:'XLP',  name:'Consumer Staples',     cat:'📊 Sector' },
    { sym:'XLI',  name:'Industrials',          cat:'📊 Sector' },
    { sym:'XLE',  name:'Energy',               cat:'📊 Sector' },
    { sym:'XLU',  name:'Utilities',            cat:'📊 Sector' },
    { sym:'XLRE', name:'Real Estate',          cat:'📊 Sector' },
    { sym:'XLB',  name:'Materials',            cat:'📊 Sector' },
    // Fixed income
    { sym:'TLT',  name:'20Y+ Treasury',        cat:'🏦 Fixed Income' },
    { sym:'HYG',  name:'High Yield Corp.',     cat:'🏦 Fixed Income' },
    { sym:'LQD',  name:'Invest. Grade Corp.',  cat:'🏦 Fixed Income' },
    { sym:'EMB',  name:'EM Sovereign USD',     cat:'🏦 Fixed Income' },
    { sym:'SHY',  name:'1-3Y Treasury',        cat:'🏦 Fixed Income' },
    { sym:'TIP',  name:'TIPS (Infl. Protect)', cat:'🏦 Fixed Income' },
    // Commodities & alternatives
    { sym:'GLD',  name:'Gold ETF',             cat:'🔶 Alternatives' },
    { sym:'SLV',  name:'Silver ETF',           cat:'🔶 Alternatives' },
    { sym:'USO',  name:'US Oil ETF',           cat:'🔶 Alternatives' },
    { sym:'VNQ',  name:'US REITs',             cat:'🔶 Alternatives' },
    { sym:'BITO', name:'Bitcoin ETF',          cat:'🔶 Alternatives' },
    // International
    { sym:'EFA',  name:'Intl Developed Mkt',   cat:'🌍 International' },
    { sym:'EEM',  name:'Emerging Markets',     cat:'🌍 International' },
    { sym:'VGK',  name:'Europe ETF',           cat:'🌍 International' },
    { sym:'FXI',  name:'China Large Cap',      cat:'🌍 International' },
    { sym:'EWJ',  name:'Japan ETF',            cat:'🌍 International' },
  ];

  const meta = Object.fromEntries(ETF_LIST.map(e => [e.sym, e]));
  let items  = [];
  const fmpKey = (window._KEYS?.fmp) || localStorage.getItem('finterm_key_fmp') || '';

  if (fmpKey) {
    try {
      const syms = ETF_LIST.map(e => e.sym).join(',');
      const res  = await fetch(`https://financialmodelingprep.com/api/v3/quote/${syms}?apikey=${fmpKey}`, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`FMP ${res.status}`);
      const data = await res.json();
      items = data
        .filter(q => q.changesPercentage != null)
        .map(q => ({
          sym:     q.symbol,
          name:    meta[q.symbol]?.name || q.name || q.symbol,
          cat:     meta[q.symbol]?.cat  || 'Other',
          price:   q.price,
          chgPct:  q.changesPercentage,
          chgAbs:  q.change,
          volume:  q.volume,
          avgVol:  q.avgVolume,
          mktCap:  q.marketCap,
        }));
    } catch {}
  }

  // Free Stooq fallback
  if (!items.length) {
    const STOOQ_LIST = ETF_LIST.slice(0, 20); // limit for free tier
    const results = await Promise.allSettled(STOOQ_LIST.map(async e => {
      const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://stooq.com/q/d/l/?s=${e.sym.toLowerCase()}.us&i=d`)}`;
      const res   = await fetch(proxy, { signal: AbortSignal.timeout(10000) });
      const text  = await res.text();
      const lines = text.trim().split('\n').filter(l => l && !l.startsWith('Date'));
      if (lines.length < 2) throw new Error('no data');
      const last = lines[lines.length-1].split(','), prev = lines[lines.length-2].split(',');
      const price = +last[4], prv = +prev[4];
      return { ...e, price, chgPct: ((price-prv)/prv)*100, chgAbs: price-prv, volume: +last[5]||0 };
    }));
    items = results.filter(r => r.status==='fulfilled').map(r => r.value);
  }

  if (!items.length) { el.innerHTML = wmEmpty('No ETF data available. Add FMP API key for full ETF flow data.'); return; }

  // Sort each category by chgPct desc
  const catOrder = ['🏛 Broad Market','📊 Sector','🏦 Fixed Income','🔶 Alternatives','🌍 International'];
  const bycat = {};
  for (const f of items) {
    if (!bycat[f.cat]) bycat[f.cat] = [];
    bycat[f.cat].push(f);
  }
  for (const c of Object.keys(bycat)) bycat[c].sort((a,b) => b.chgPct - a.chgPct);

  // Summary
  const rising  = items.filter(f => f.chgPct > 0).length;
  const falling = items.filter(f => f.chgPct < 0).length;
  const spy     = items.find(f => f.sym === 'SPY');
  const tlt     = items.find(f => f.sym === 'TLT');
  const gld     = items.find(f => f.sym === 'GLD');
  const riskOn  = spy?.chgPct > 0;

  let html = wmLiveBar('Major ETF Performance — Flow Proxy', `${items.length} ETFs · ${rising} ▲ inflow · ${falling} ▼ outflow`);
  if (spy || tlt || gld) {
    html += `<div class="wm-sig-summary">
      ${spy ? `<span class="${spy.chgPct>=0?'wm-up':'wm-dn'}">SPY ${spy.chgPct>=0?'▲':'▼'}${Math.abs(spy.chgPct).toFixed(2)}%</span>` : ''}
      ${tlt ? `<span class="${tlt.chgPct>=0?'wm-up':'wm-dn'}">TLT ${tlt.chgPct>=0?'▲':'▼'}${Math.abs(tlt.chgPct).toFixed(2)}%</span>` : ''}
      ${gld ? `<span class="${gld.chgPct>=0?'wm-up':'wm-dn'}">GLD ${gld.chgPct>=0?'▲':'▼'}${Math.abs(gld.chgPct).toFixed(2)}%</span>` : ''}
      <span style="color:var(--muted)">${riskOn ? '⚡ Risk-On regime' : '🛡 Risk-Off regime'}</span>
    </div>`;
  }

  for (const cat of catOrder) {
    const catItems = bycat[cat];
    if (!catItems?.length) continue;
    html += `<div class="wm-sig-group">${cat}</div><div class="wm-flows-list">`;
    for (const f of catItems) {
      const pos    = f.chgPct >= 0;
      const volFmt = f.volume >= 1e9 ? (f.volume/1e9).toFixed(1)+'B' :
                     f.volume >= 1e6 ? (f.volume/1e6).toFixed(0)+'M' :
                     f.volume >= 1e3 ? (f.volume/1e3).toFixed(0)+'K' : null;
      const rvol   = (f.avgVol > 0) ? (f.volume / f.avgVol).toFixed(1) : null;
      html += `<div class="wm-flows-row">
        <span class="wm-flows-ticker" onclick="if(typeof loadTicker==='function')loadTicker('${wmEsc(f.sym)}')" style="cursor:pointer">${wmEsc(f.sym)}</span>
        <span class="wm-flows-name">${wmEsc(f.name)}</span>
        <span class="wm-flows-flow ${pos?'wm-pos':'wm-neg'}">${pos?'▲':'▼'} ${Math.abs(f.chgPct).toFixed(2)}%</span>
        ${f.price  ? `<span class="wm-flows-price">$${f.price >= 100 ? f.price.toFixed(2) : f.price.toFixed(2)}</span>` : ''}
        ${volFmt   ? `<span class="wm-flows-vol">Vol: ${volFmt}${rvol ? ` <span style="color:var(--muted)">(${rvol}×avg)</span>` : ''}</span>` : ''}
      </div>`;
    }
    html += '</div>';
  }
  el.innerHTML = html;
}

/* ══════════════════════════════════════════════════════════════════
   SECTOR PERFORMANCE  — Multi-timeframe heat map
   Primary:  Alpha Vantage SECTOR (needs AV key) — 8 timeframes
   Fallback: FMP sectors-performance (needs FMP key) — 1D
   Last:     Stooq sector ETF quotes (free, no key)
   ══════════════════════════════════════════════════════════════════ */
async function wmMacroSectors() {
  const el = document.getElementById('macro-sectors');
  if (!el) return;
  el.innerHTML = wmSpinner('Loading sector performance…');

  const SECTOR_ETF = {
    'Information Technology':'XLK','Technology':'XLK',
    'Health Care':'XLV','Healthcare':'XLV',
    'Financials':'XLF','Financial Services':'XLF',
    'Communication Services':'XLC','Comm. Services':'XLC',
    'Consumer Discretionary':'XLY','Consumer Disc.':'XLY',
    'Consumer Staples':'XLP',
    'Industrials':'XLI',
    'Energy':'XLE',
    'Utilities':'XLU',
    'Real Estate':'XLRE',
    'Materials':'XLB',
  };

  let sectors = [], source = '', hasMulti = false;
  const avKey  = (window._KEYS?.av)  || localStorage.getItem('finterm_key_av')  || '';
  const fmpKey = (window._KEYS?.fmp) || localStorage.getItem('finterm_key_fmp') || '';

  // ── Alpha Vantage SECTOR (all timeframes) ──────────────────────
  if (avKey && !sectors.length) {
    try {
      const res  = await fetch(`https://www.alphavantage.co/query?function=SECTOR&apikey=${avKey}`, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`AV ${res.status}`);
      const data = await res.json();
      if (data['Note'] || data['Information']) throw new Error('AV rate limit');
      const pct  = s => parseFloat((s||'0%').replace('%',''));
      const rt   = data['Rank A: Real-Time Performance']            || {};
      const d1   = data['Rank B: 1 Day Performance']               || {};
      const d5   = data['Rank C: 5 Day Performance']               || {};
      const m1   = data['Rank D: 1 Month Performance']             || {};
      const m3   = data['Rank E: 3 Month Performance']             || {};
      const ytd  = data['Rank F: Year-to-Date (YTD) Performance']  || {};
      const y1   = data['Rank G: 1 Year Performance']              || {};
      const y3   = data['Rank H: 3 Year Performance']              || {};
      sectors = Object.keys(rt).map(k => ({
        name:      k,
        change1d:  pct(d1[k]  || rt[k]),
        change5d:  pct(d5[k]),
        change1m:  pct(m1[k]),
        change3m:  pct(m3[k]),
        changeYTD: pct(ytd[k]),
        change1y:  pct(y1[k]),
        change3y:  pct(y3[k]),
        etf: SECTOR_ETF[k] || '',
      }));
      source = 'Alpha Vantage'; hasMulti = true;
    } catch {}
  }

  // ── FMP sectors-performance (1D only) ─────────────────────────
  if (fmpKey && !sectors.length) {
    try {
      const res  = await fetch(`https://financialmodelingprep.com/api/v3/stock/sectors-performance?apikey=${fmpKey}`, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`FMP ${res.status}`);
      const data = await res.json();
      const arr  = data.sectorPerformance || (Array.isArray(data) ? data : []);
      sectors = arr.map(s => ({
        name:      s.sector,
        change1d:  parseFloat((s.changesPercentage||'0').replace('%','')),
        etf: SECTOR_ETF[s.sector] || '',
      }));
      source = 'FMP'; hasMulti = false;
    } catch {}
  }

  // ── Free Stooq fallback (sector ETF prices) ───────────────────
  if (!sectors.length) {
    const STOOQ_SECTS = [
      {sym:'xlk.us', name:'Information Technology', etf:'XLK'},
      {sym:'xlf.us', name:'Financials',             etf:'XLF'},
      {sym:'xlv.us', name:'Health Care',            etf:'XLV'},
      {sym:'xlc.us', name:'Comm. Services',         etf:'XLC'},
      {sym:'xly.us', name:'Consumer Discretionary', etf:'XLY'},
      {sym:'xlp.us', name:'Consumer Staples',       etf:'XLP'},
      {sym:'xli.us', name:'Industrials',            etf:'XLI'},
      {sym:'xle.us', name:'Energy',                 etf:'XLE'},
      {sym:'xlu.us', name:'Utilities',              etf:'XLU'},
      {sym:'xlre.us',name:'Real Estate',            etf:'XLRE'},
      {sym:'xlb.us', name:'Materials',              etf:'XLB'},
    ];
    const results = await Promise.allSettled(STOOQ_SECTS.map(async s => {
      const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://stooq.com/q/d/l/?s=${s.sym}&i=d`)}`;
      const res   = await fetch(proxy, { signal: AbortSignal.timeout(10000) });
      const text  = await res.text();
      const lines = text.trim().split('\n').filter(l => l && !l.startsWith('Date'));
      if (lines.length < 2) throw new Error('no data');
      const last = lines[lines.length-1].split(','), prev = lines[lines.length-2].split(',');
      return { ...s, change1d: ((+last[4] - +prev[4]) / +prev[4]) * 100 };
    }));
    sectors = results.filter(r => r.status==='fulfilled').map(r => r.value);
    source = 'Stooq (free)'; hasMulti = false;
  }

  if (!sectors.length) {
    el.innerHTML = wmEmpty('No sector data. Add Alpha Vantage or FMP key for sector performance.');
    return;
  }

  const sorted  = [...sectors].sort((a,b) => b.change1d - a.change1d);
  const maxAbs  = Math.max(...sorted.map(s => Math.abs(s.change1d)), 1);
  const nUp     = sorted.filter(s => s.change1d > 0).length;
  const nDn     = sorted.filter(s => s.change1d < 0).length;
  let html = wmLiveBar('US Sector Performance', `${sorted.length} sectors · ${nUp} ▲ up · ${nDn} ▼ down · ${source}`);

  // Heatmap
  html += '<div class="wm-sector-heatmap">';
  for (const s of sorted) {
    const chg  = s.change1d;
    const pos  = chg >= 0;
    const inten = 0.15 + (Math.abs(chg) / maxAbs) * 0.85;
    const bg   = pos ? `rgba(76,175,80,${inten.toFixed(2)})` : `rgba(244,67,54,${inten.toFixed(2)})`;
    html += `<div class="wm-sector-cell" style="background:${bg}" title="${wmEsc(s.name)}: ${pos?'+':''}${chg.toFixed(2)}%"
        ${s.etf ? `onclick="if(typeof loadTicker==='function')loadTicker('${wmEsc(s.etf)}')" style="cursor:pointer"` : ''}>
      <div class="wm-sector-name">${wmEsc(s.name)}</div>
      <div class="wm-sector-chg ${pos?'wm-pos':'wm-neg'}">${pos?'+':''}${chg.toFixed(2)}%</div>
      ${s.etf ? `<div class="wm-sector-etf">${wmEsc(s.etf)}</div>` : ''}
    </div>`;
  }
  html += '</div>';

  // Detailed table
  const f = v => v == null ? '<span style="color:var(--muted)">—</span>' :
    `<span class="${v>=0?'wm-pos':'wm-neg'}">${v>=0?'+':''}${v.toFixed(2)}%</span>`;
  html += `<table class="wm-sector-table"><thead><tr>
    <th>Sector</th><th>ETF</th><th>1D</th>
    ${hasMulti ? '<th>5D</th><th>1M</th><th>3M</th><th>YTD</th><th>1Y</th>' : ''}
  </tr></thead><tbody>`;
  for (const s of sorted) {
    html += `<tr>
      <td>${wmEsc(s.name)}</td>
      <td>${s.etf ? `<span class="wm-flows-ticker" onclick="if(typeof loadTicker==='function')loadTicker('${wmEsc(s.etf)}')" style="cursor:pointer">${wmEsc(s.etf)}</span>` : '—'}</td>
      <td>${f(s.change1d)}</td>
      ${hasMulti ? `<td>${f(s.change5d)}</td><td>${f(s.change1m)}</td><td>${f(s.change3m)}</td><td>${f(s.changeYTD)}</td><td>${f(s.change1y)}</td>` : ''}
    </tr>`;
  }
  html += '</tbody></table>';
  el.innerHTML = html;
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
   GEO·RISK LIVE DATA — ROUTES / WARS / RESOURCES
   These three functions replace the static inline arrays in index.html
   (renderGeoRoutes / renderGeoWars / renderGeoResources) with live
   WorldMonitor bootstrap data, falling back gracefully to the static
   versions when WM data is unavailable.
   ══════════════════════════════════════════════════════════════════ */

/* ── ROUTES tab: live chokepoints (reuses 'chokepoints' bootstrap key) ── */
async function wmGeoRoutes() {
  const el = document.getElementById('georisk-routes-content');
  if (!el) return;
  el.innerHTML = wmSpinner('Loading chokepoint data…');
  try {
    // 'chokepoints' key is already fetched by wmSupplyChokepoints() for the
    // Supply panel — if that ran first this is an instant WM_CACHE hit.
    const d     = await wmBootstrap(['chokepoints']);
    const items = d.chokepoints?.chokepoints || d.chokepoints?.data || d.chokepoints || [];

    if (!Array.isArray(items) || !items.length) {
      // Fall back to static renderGeoRoutes()
      if (typeof renderGeoRoutes === 'function') renderGeoRoutes();
      return;
    }

    el.innerHTML = wmLiveBar('Strategic chokepoints & trade route disruption', `${items.length} monitored`) +
      items.map(c => {
        const risk       = c.riskLevel || c.risk_level || c.status || 'unknown';
        const col        = wmSeverityColor(risk);
        const disruption = c.disruption_pct ?? c.disruptionPct ?? c.throughputReduction ?? null;
        const delay      = c.avgDelayDays ?? c.delay_days ?? null;
        const traffic    = c.dailyVessels || c.vessel_count || null;
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
            ${delay      != null ? `<span class="wm-stat-chip">⏱ +${delay}d delay</span>` : ''}
            ${traffic    != null ? `<span class="wm-stat-chip">🚢 ${traffic} vessels/day</span>` : ''}
            ${c.tradePct           ? `<span class="wm-stat-chip">📦 ${c.tradePct}% global trade</span>` : ''}
          </div>
          ${c.note || c.description
            ? `<div class="wm-choke-note">${wmEsc(c.note || c.description)}</div>` : ''}
          ${c.affectedCommodities?.length
            ? `<div class="wm-choke-commodities">${c.affectedCommodities.map(x => `<span class="wm-comm-chip">${wmEsc(x)}</span>`).join('')}</div>` : ''}
          ${c.conflicts?.length
            ? `<div class="wm-choke-note" style="font-size:9px;opacity:.65">Conflicts: ${c.conflicts.map(wmEsc).join(', ')}</div>` : ''}
        </div>`;
      }).join('');
  } catch(e) {
    console.warn('[WM] wmGeoRoutes error:', e.message);
    if (typeof renderGeoRoutes === 'function') renderGeoRoutes();
  }
}
window.wmGeoRoutes = wmGeoRoutes;

/* ── Shared risk-level sorter (mirrors inline riskLevel() in index.html) ── */
function _wmRiskLevel(r) { return {CRITICAL:4,HIGH:3,MEDIUM:2,LOW:1}[String(r).toUpperCase()] || 0; }

/* ── WARS tab: live active conflicts ─────────────────────────────────── */
async function wmGeoWars() {
  const el = document.getElementById('georisk-wars-content');
  if (!el) return;
  el.innerHTML = wmSpinner('Loading conflict data…');
  try {
    const d     = await wmBootstrap(['conflicts']);
    const items = d.conflicts?.conflicts || d.conflicts?.data || d.conflicts || [];

    if (!Array.isArray(items) || !items.length) {
      if (typeof renderGeoWars === 'function') renderGeoWars();
      return;
    }

    // Cache for RESOURCES tab to reuse without a second fetch
    window._wmConflicts = items;

    const RISK_COLOR_WM = {
      CRITICAL: { bg:'rgba(255,71,87,.15)', border:'rgba(255,71,87,.4)', text:'#ff4757' },
      HIGH:     { bg:'rgba(255,165,0,.12)',  border:'rgba(255,165,0,.35)',  text:'#ffa500' },
      MEDIUM:   { bg:'rgba(26,107,255,.12)', border:'rgba(26,107,255,.3)',  text:'#3d8bff' },
      LOW:      { bg:'rgba(0,212,160,.1)',   border:'rgba(0,212,160,.25)',  text:'#00d4a0' },
    };

    el.innerHTML = wmLiveBar('Live conflict data — WorldMonitor.app', `${items.length} active conflicts`) +
      items.map(c => {
        const intensity  = (c.intensity || c.riskLevel || c.severity || 'MEDIUM').toUpperCase();
        const rc         = RISK_COLOR_WM[intensity] || RISK_COLOR_WM.LOW;
        const resources  = c.resources || c.commodities || [];
        const critCount  = resources.filter(r => (r.risk||r.riskLevel||'').toUpperCase() === 'CRITICAL').length;
        const highCount  = resources.filter(r => (r.risk||r.riskLevel||'').toUpperCase() === 'HIGH').length;
        const icolor     = rc.text;
        const flag       = c.flag || c.emoji || '';
        const flag2      = c.flag2 || c.flag_b || '';

        return `<div class="geo-conflict-card" onclick="this.classList.toggle('geo-expanded')">
          <div class="geo-conflict-header">
            <div class="geo-conflict-left">
              <span class="geo-intensity-dot" style="background:${icolor};box-shadow:0 0 6px ${icolor}"></span>
              <div>
                <div class="geo-conflict-name">${wmEsc(flag)} ${wmEsc(flag2)} ${wmEsc(c.name || c.title || '')}</div>
                <div class="geo-conflict-meta">${wmEsc(c.region || c.location || '')}
                  ${c.since ? ` &nbsp;·&nbsp; Since ${wmEsc(c.since)}` : ''}
                  ${c.phase ? ` &nbsp;·&nbsp; ${wmEsc(c.phase)}` : ''}
                </div>
              </div>
            </div>
            <div class="geo-conflict-right">
              <span class="geo-badge geo-badge-intensity" style="color:${icolor};border-color:${icolor}40;background:${icolor}15">${intensity}</span>
              ${critCount > 0 ? `<span class="geo-badge geo-badge-crit">${critCount} CRITICAL</span>` : ''}
              ${highCount > 0 ? `<span class="geo-badge geo-badge-high">${highCount} HIGH</span>` : ''}
            </div>
          </div>
          <div class="geo-conflict-summary">${wmEsc(c.summary || c.description || '')}</div>
          <div class="geo-conflict-stats">
            ${c.casualties ? `<span>💀 ${wmEsc(c.casualties)}</span>` : ''}
            ${c.displaced  ? `<span>🏚 ${wmEsc(c.displaced)} displaced</span>` : ''}
            ${c.wm_url     ? `<a href="${wmEsc(c.wm_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="geo-wm-link-small">WorldMonitor ↗</a>` : ''}
          </div>
          ${resources.length ? `<div class="geo-resources-mini">
            ${resources.slice(0,4).map(r => {
              const rRisk = (r.risk || r.riskLevel || 'LOW').toUpperCase();
              const rrc   = RISK_COLOR_WM[rRisk] || RISK_COLOR_WM.LOW;
              return `<span class="geo-res-chip" style="background:${rrc.bg};border-color:${rrc.border};color:${rrc.text}">${wmEsc(r.icon||r.emoji||'⛏')} ${wmEsc(r.name||r.commodity||'')}</span>`;
            }).join('')}
            ${resources.length > 4 ? `<span class="geo-res-chip-more">+${resources.length-4} more</span>` : ''}
          </div>` : ''}
        </div>`;
      }).join('');
  } catch(e) {
    console.warn('[WM] wmGeoWars error:', e.message);
    if (typeof renderGeoWars === 'function') renderGeoWars();
  }
}
window.wmGeoWars = wmGeoWars;

/* ── RESOURCES tab: live commodity risk aggregated across conflicts ─── */
async function wmGeoResources() {
  const el = document.getElementById('georisk-resources-content');
  if (!el) return;
  el.innerHTML = wmSpinner('Loading resource risk data…');
  try {
    // Prefer already-cached conflicts from wmGeoWars(); otherwise fetch
    let items = window._wmConflicts;
    if (!Array.isArray(items) || !items.length) {
      const d = await wmBootstrap(['conflicts']);
      items   = d.conflicts?.conflicts || d.conflicts?.data || d.conflicts || [];
      if (Array.isArray(items) && items.length) window._wmConflicts = items;
    }

    if (!Array.isArray(items) || !items.length) {
      if (typeof renderGeoResources === 'function') renderGeoResources();
      return;
    }

    const RISK_COLOR_WM = {
      CRITICAL: { bg:'rgba(255,71,87,.15)', border:'rgba(255,71,87,.4)', text:'#ff4757' },
      HIGH:     { bg:'rgba(255,165,0,.12)',  border:'rgba(255,165,0,.35)',  text:'#ffa500' },
      MEDIUM:   { bg:'rgba(26,107,255,.12)', border:'rgba(26,107,255,.3)',  text:'#3d8bff' },
      LOW:      { bg:'rgba(0,212,160,.1)',   border:'rgba(0,212,160,.25)',  text:'#00d4a0' },
    };

    // Flatten all resources across conflicts, deduplicate by name (keep highest risk)
    const allRes = {};
    items.forEach(c => {
      const resources = c.resources || c.commodities || [];
      resources.forEach(r => {
        const name    = r.name || r.commodity || '';
        const rRisk   = (r.risk || r.riskLevel || 'LOW').toUpperCase();
        const cName   = c.name || c.title || '';
        const cFlag   = c.flag || c.emoji || '';
        if (!allRes[name] || _wmRiskLevel(rRisk) > _wmRiskLevel(allRes[name].risk)) {
          allRes[name] = { ...r, risk: rRisk, conflicts: [cName], conflictFlags: [cFlag] };
        } else if (allRes[name]) {
          allRes[name].conflicts.push(cName);
          allRes[name].conflictFlags.push(cFlag);
        }
      });
    });

    const sorted = Object.values(allRes).sort((a,b) => _wmRiskLevel(b.risk) - _wmRiskLevel(a.risk));

    if (!sorted.length) {
      if (typeof renderGeoResources === 'function') renderGeoResources();
      return;
    }

    el.innerHTML = wmLiveBar('Supply chain disruption risk by commodity') +
      `<div class="geo-section-head">Critical Commodities at Risk</div>` +
      sorted.map(r => {
        const rc = RISK_COLOR_WM[r.risk] || RISK_COLOR_WM.LOW;
        return `<div class="geo-resource-row" style="border-left:3px solid ${rc.border}">
          <div class="geo-resource-top">
            <span class="geo-resource-icon">${wmEsc(r.icon || r.emoji || '⛏')}</span>
            <div class="geo-resource-info">
              <span class="geo-resource-name">${wmEsc(r.name || r.commodity || '')}</span>
              <span class="geo-resource-conflicts">${r.conflictFlags.join(' ')} ${r.conflicts.map(wmEsc).join(', ')}</span>
            </div>
            <span class="geo-risk-badge" style="color:${rc.text};background:${rc.bg};border-color:${rc.border}">${r.risk}</span>
          </div>
          <div class="geo-resource-note">${wmEsc(r.note || r.description || '')}</div>
        </div>`;
      }).join('');
  } catch(e) {
    console.warn('[WM] wmGeoResources error:', e.message);
    if (typeof renderGeoResources === 'function') renderGeoResources();
  }
}
window.wmGeoResources = wmGeoResources;

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
    // Frankfurter rates in Forex panel
    frankfurterLoadRates();

    // Refresh schedule
    setInterval(() => {
      wmMacroEtfFlows();
      wmMacroSectors();
      wmMacroCrypto();
      wmGeoGpsJam();
      wmGeoMilOps();
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
