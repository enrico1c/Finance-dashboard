/* ══════════════════════════════════════════════════════════════════
   FINTERM — lwchart.js
   Lightweight Charts engine — replaces TradingView.widget
   Library: unpkg.com/lightweight-charts@4.2.0 (loaded in index.html)
   Phase 1: historical OHLCV via techFetchCandles (Finnhub → AV → Stooq)
   Phase 2: intraday via Alpaca (added in technical.js)
   Phase 3: real-time ticks via ws-relay (lwcWsSubscribe)
   ══════════════════════════════════════════════════════════════════ */

/* ── State ───────────────────────────────────────────────────────── */
const _lwc = {
  main:   { chart: null, cand: null, vol: null, sym: null, res: '1D', wsUnsub: null, el: null },
  second: { chart: null, cand: null, vol: null, sym: null, res: '1h', wsUnsub: null, el: null },
  forex:  { chart: null, cand: null, vol: null, sym: null, res: '1D', wsUnsub: null, el: null },
};

/* Relay URL — set this when the ws-relay service is deployed.
   Falls back to localStorage item 'finterm_relay_url'. */
window.LWC_RELAY_URL = window.LWC_RELAY_URL
  || localStorage.getItem('finterm_relay_url')
  || '';

/* ── Helpers ─────────────────────────────────────────────────────── */
const _lwcEsc = s => String(s ?? '').replace(/[<>&"]/g, c =>
  ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;' }[c]));

function _lwcSlot(slot) {
  return _lwc[slot] || _lwc.main;
}

/* Map techFetchCandles { t[], o[], h[], l[], c[], v[] } → LWC format */
function _lwcMapCandles(data, res) {
  if (!data?.t?.length) return [];
  const isIntraday = ['1m','5m','15m','1h','4h'].includes(res);
  return data.t.map((ts, i) => ({
    time:  isIntraday ? ts : new Date(ts * 1000).toISOString().slice(0,10),
    open:  data.o[i],
    high:  data.h[i],
    low:   data.l[i],
    close: data.c[i],
  })).filter(c => c.open != null && c.close != null);
}

function _lwcMapVolume(data, res) {
  if (!data?.t?.length) return [];
  const isIntraday = ['1m','5m','15m','1h','4h'].includes(res);
  return data.t.map((ts, i) => ({
    time:  isIntraday ? ts : new Date(ts * 1000).toISOString().slice(0,10),
    value: data.v?.[i] ?? 0,
    color: (data.c[i] >= data.o[i]) ? 'rgba(63,185,80,0.35)' : 'rgba(248,81,73,0.35)',
  })).filter(v => v.value != null);
}

/* Snap unix_ms to resolution bucket start (unix_seconds) */
function _lwcBucketTime(tsMs, res) {
  const buckets = { '1m':60,'5m':300,'15m':900,'1h':3600,'4h':14400,'1D':86400,'1W':604800 };
  const bucket  = (buckets[res] || 86400) * 1000;
  return Math.floor(tsMs / bucket) * bucket / 1000;
}

/* Map resolution string to Finnhub/AV format for techFetchCandles fallback */
function _lwcToFhRes(res) {
  return { '1m':'1','5m':'5','15m':'15','1h':'60','4h':'240','1D':'D','1W':'W' }[res] || 'D';
}

/* ── LWC chart options ───────────────────────────────────────────── */
function _lwcChartOpts() {
  return {
    layout: {
      background: { color: '#0d1117' },
      textColor:  '#8b949e',
    },
    grid: {
      vertLines: { color: '#21262d' },
      horzLines: { color: '#21262d' },
    },
    crosshair: { mode: 1 }, // LightweightCharts.CrosshairMode.Normal
    rightPriceScale: { borderColor: '#30363d' },
    timeScale: {
      borderColor:     '#30363d',
      timeVisible:     true,
      secondsVisible:  false,
    },
    autoSize: true,
  };
}

function _lwcCandleOpts() {
  return {
    upColor:        '#3fb950',
    downColor:      '#f85149',
    borderVisible:  false,
    wickUpColor:    '#3fb950',
    wickDownColor:  '#f85149',
  };
}

/* ── Resolution toolbar ──────────────────────────────────────────── */
const _LWC_RESOLUTIONS = ['1m','5m','15m','1h','4h','1D','1W'];

function _lwcInjectToolbar(el, slot) {
  const existing = el.querySelector('.lwc-toolbar');
  if (existing) existing.remove();
  const bar = document.createElement('div');
  bar.className = 'lwc-toolbar';
  bar.style.cssText = [
    'display:flex','align-items:center','gap:3px','padding:4px 6px',
    'background:#0d1117','border-bottom:1px solid #21262d',
    'flex-shrink:0','font-size:10px','flex-wrap:wrap',
  ].join(';');

  _LWC_RESOLUTIONS.forEach(r => {
    const btn = document.createElement('button');
    btn.textContent = r;
    btn.dataset.res = r;
    btn.style.cssText = [
      'padding:2px 7px','border-radius:3px','cursor:pointer','font-size:10px',
      'background:#161b22','border:1px solid #30363d','color:#8b949e',
      'font-family:var(--font-mono,monospace)',
    ].join(';');
    btn.onclick = () => lwcSetResolution(r, slot);
    bar.appendChild(btn);
  });

  /* Live price badge placeholder */
  const badge = document.createElement('span');
  badge.className = 'lwc-price-badge';
  badge.style.cssText = 'margin-left:auto;font-size:11px;font-weight:700;font-family:var(--font-mono,monospace);color:#8b949e';
  bar.appendChild(badge);

  el.style.display  = 'flex';
  el.style.flexDirection = 'column';
  el.insertBefore(bar, el.firstChild);
  return bar;
}

function _lwcHighlightResBtn(el, activeRes) {
  el.querySelectorAll('.lwc-toolbar button[data-res]').forEach(btn => {
    const active = btn.dataset.res === activeRes;
    btn.style.background   = active ? 'rgba(31,111,235,0.15)' : '#161b22';
    btn.style.borderColor  = active ? 'var(--accent,#1f6feb)' : '#30363d';
    btn.style.color        = active ? 'var(--accent,#58a6ff)' : '#8b949e';
  });
}

/* ── Tooltip (crosshair) ─────────────────────────────────────────── */
function _lwcInitTooltip(chart, el, slot) {
  const tip = document.createElement('div');
  tip.id = `lwc-tooltip-${slot}`;
  tip.style.cssText = [
    'position:absolute','pointer-events:none','display:none','z-index:99',
    'background:#161b22','border:1px solid #30363d','border-radius:4px',
    'padding:5px 8px','font-size:10px','color:#c9d1d9','white-space:nowrap',
    'font-family:var(--font-mono,monospace)',
  ].join(';');
  el.style.position = 'relative';
  el.appendChild(tip);

  chart.subscribeCrosshairMove(param => {
    if (!param.time || !param.point) { tip.style.display = 'none'; return; }
    const s = _lwcSlot(slot);
    if (!s.cand) return;
    const ohlc = param.seriesData.get(s.cand);
    if (!ohlc) { tip.style.display = 'none'; return; }
    const chg  = ohlc.open ? ((ohlc.close - ohlc.open) / ohlc.open * 100) : 0;
    const col  = chg >= 0 ? '#3fb950' : '#f85149';
    tip.innerHTML = [
      `<span style="color:#8b949e">${typeof param.time === 'string' ? param.time : new Date(param.time * 1000).toLocaleDateString()}</span>`,
      `&nbsp;O <b>${ohlc.open?.toFixed(2)}</b>`,
      `H <b>${ohlc.high?.toFixed(2)}</b>`,
      `L <b>${ohlc.low?.toFixed(2)}</b>`,
      `C <b style="color:${col}">${ohlc.close?.toFixed(2)}</b>`,
      `<span style="color:${col}">(${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%)</span>`,
    ].join(' ');
    const rect = el.getBoundingClientRect();
    let x = param.point.x + 12;
    let y = param.point.y - 20;
    if (x + 260 > el.clientWidth) x = param.point.x - 270;
    if (y < 0) y = 4;
    tip.style.left    = x + 'px';
    tip.style.top     = y + 'px';
    tip.style.display = 'block';
  });
}

/* ── Core API ────────────────────────────────────────────────────── */

/**
 * Create (or recreate) the LWC chart inside `container`.
 * @param {HTMLElement|string} container
 * @param {string} sym
 * @param {'main'|'second'|'forex'} slot
 */
function lwcInit(container, sym, slot = 'main') {
  if (!window.LightweightCharts) {
    console.error('[lwchart] LightweightCharts not loaded — check CDN script tag');
    return;
  }
  const el = typeof container === 'string'
    ? document.querySelector(container) || document.getElementById(container)
    : container;
  if (!el) return;

  /* Destroy any existing chart in this slot */
  lwcDestroy(slot);

  const s = _lwcSlot(slot);
  s.el  = el;
  s.sym = sym;

  /* Inject toolbar above the chart area */
  const bar = _lwcInjectToolbar(el, slot);
  _lwcHighlightResBtn(el, s.res);

  /* Chart container wrapper (fills remaining height) */
  let chartEl = el.querySelector('.lwc-chart-inner');
  if (!chartEl) {
    chartEl = document.createElement('div');
    chartEl.className = 'lwc-chart-inner';
    chartEl.style.cssText = 'flex:1;min-height:0;position:relative;overflow:hidden';
    el.appendChild(chartEl);
  }

  s.chart = LightweightCharts.createChart(chartEl, _lwcChartOpts());
  s.cand  = s.chart.addCandlestickSeries(_lwcCandleOpts());
  s.vol   = s.chart.addHistogramSeries({
    priceFormat: { type: 'volume' },
    priceScaleId: 'vol',
    scaleMargins: { top: 0.8, bottom: 0 },
  });

  _lwcInitTooltip(s.chart, chartEl, slot);

  /* Autosize via ResizeObserver */
  if (window.ResizeObserver) {
    s._resizeObs = new ResizeObserver(() => s.chart?.applyOptions({ autoSize: true }));
    s._resizeObs.observe(chartEl);
  }
}

/**
 * Fetch OHLCV and render the chart series.
 * @param {string} sym
 * @param {string} res  '1m'|'5m'|'15m'|'1h'|'4h'|'1D'|'1W'
 * @param {'main'|'second'|'forex'} slot
 */
async function lwcLoad(sym, res, slot = 'main') {
  const s = _lwcSlot(slot);
  if (!s.chart) return;
  res = res || s.res || '1D';
  s.res = res;
  s.sym = sym;

  /* Highlight active resolution button */
  if (s.el) _lwcHighlightResBtn(s.el, res);

  /* Show loading state in price badge */
  const badge = s.el?.querySelector('.lwc-price-badge');
  if (badge) badge.textContent = sym + ' · loading…';

  /* Fetch OHLCV — Phase 1 uses techFetchCandles only */
  let data = null;
  const fhRes = _lwcToFhRes(res);

  /* Phase 2 intraday: try Alpaca first if keys are set */
  if (['1m','5m','15m','1h','4h'].includes(res) && typeof _techIntradayAlpaca === 'function') {
    const alpacaTf = { '1m':'1Min','5m':'5Min','15m':'15Min','1h':'1Hour','4h':'4Hour' }[res];
    data = await _techIntradayAlpaca(sym, alpacaTf, 300);
  }

  /* MT5 fallback for intraday or forex */
  if (!data && typeof _techIntradayMT5 === 'function') {
    data = await _techIntradayMT5(sym, res, 300).catch(() => null);
  }

  /* Standard techFetchCandles waterfall (Finnhub → AV → Stooq) */
  if (!data && typeof techFetchCandles === 'function') {
    data = await techFetchCandles(sym, fhRes, 300).catch(() => null);
  }

  if (!data?.t?.length) {
    if (badge) badge.textContent = sym + ' · no data';
    s.cand?.setData([]);
    s.vol?.setData([]);
    return;
  }

  const candles = _lwcMapCandles(data, res);
  const volumes = _lwcMapVolume(data, res);

  s.cand.setData(candles);
  s.vol.setData(volumes);
  s.chart.timeScale().fitContent();

  /* Update badge with latest close */
  if (badge && candles.length) {
    const last = candles[candles.length - 1];
    const prev = candles.length > 1 ? candles[candles.length - 2] : null;
    const chg  = prev ? ((last.close - prev.close) / prev.close * 100) : 0;
    const col  = chg >= 0 ? '#3fb950' : '#f85149';
    badge.innerHTML = `<span style="color:#c9d1d9">${_lwcEsc(sym)}</span>&nbsp;<span style="font-weight:700;color:#c9d1d9">${last.close.toFixed(2)}</span>&nbsp;<span style="color:${col}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</span>`;
  }

  /* Wire WS relay (Phase 3 — no-op in Phase 1) */
  if (typeof s.wsUnsub === 'function') s.wsUnsub();
  s.wsUnsub = lwcWsSubscribe(sym, 'relay', slot);
}

/**
 * Resolution button handler.
 * @param {string} res
 * @param {'main'|'second'|'forex'} slot
 */
function lwcSetResolution(res, slot = 'main') {
  const s = _lwcSlot(slot);
  if (s.sym) lwcLoad(s.sym, res, slot);
}

/**
 * Apply a real-time tick to the active candle (used by Phase 3 relay).
 * @param {{ sym:string, price:number, volume:number, timestamp:number }} tick  timestamp in ms
 * @param {'main'|'second'|'forex'} slot
 */
function lwcApplyTick(tick, slot = 'main') {
  const s = _lwcSlot(slot);
  if (!s.cand || !s.sym) return;
  if (tick.sym && tick.sym.toUpperCase() !== s.sym.toUpperCase()) return;

  const bucketTs = _lwcBucketTime(tick.timestamp, s.res);
  const price    = tick.price;

  try {
    s.cand.update({ time: bucketTs, close: price, open: price, high: price, low: price });
    if (s.vol && tick.volume != null) {
      s.vol.update({ time: bucketTs, value: tick.volume, color: 'rgba(63,185,80,0.35)' });
    }
  } catch (_) {
    /* LWC throws if tick.time < last bar time — silently ignore stale ticks */
  }

  /* Update price badge */
  const badge = s.el?.querySelector('.lwc-price-badge');
  if (badge) {
    const col = '#58a6ff';
    badge.innerHTML = `<span style="color:#c9d1d9">${_lwcEsc(s.sym)}</span>&nbsp;<span style="font-weight:700;color:${col}">${price.toFixed(2)}</span>&nbsp;<span style="color:#8b949e;font-size:9px">● live</span>`;
  }
}

/**
 * Connect to the ws-relay and subscribe to real-time ticks.
 * Phase 1: stub (returns no-op). Phase 3: replaced with full impl.
 * @param {string} sym
 * @param {'relay'|'mt5'} source
 * @param {'main'|'second'|'forex'} slot
 * @returns {function} unsub — call to unsubscribe and close WS
 */
function lwcWsSubscribe(sym, source = 'relay', slot = 'main') {
  const relayUrl = window.LWC_RELAY_URL;

  /* Phase 1 — relay not yet deployed */
  if (!relayUrl && source === 'relay') return () => {};

  const wsUrl = source === 'mt5'
    ? 'ws://localhost:8765/ws'
    : `${relayUrl}?token=${encodeURIComponent(localStorage.getItem('finterm_relay_token') || '')}`;

  let ws, closed = false;

  function connect() {
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) { return; }

    ws.onopen = () => {
      if (closed) { ws.close(); return; }
      const msg = source === 'mt5'
        ? JSON.stringify({ action: 'subscribe', symbol: sym })
        : JSON.stringify({ action: 'subscribe', ticker: sym });
      ws.send(msg);
    };

    ws.onmessage = ({ data }) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'tick' || (msg.symbol && msg.last != null)) {
          lwcApplyTick({
            sym:       msg.ticker || msg.symbol || sym,
            price:     msg.price  || msg.last,
            volume:    msg.volume || 0,
            timestamp: msg.timestamp || msg.time_ms || Date.now(),
          }, slot);
        }
      } catch (_) {}
    };

    ws.onclose = () => {
      if (!closed) setTimeout(connect, 5000); // auto-reconnect
    };
  }

  connect();

  return function unsub() {
    closed = true;
    if (ws && ws.readyState <= 1) {
      const msg = source === 'mt5'
        ? JSON.stringify({ action: 'unsubscribe', symbol: sym })
        : JSON.stringify({ action: 'unsubscribe', ticker: sym });
      try { ws.send(msg); } catch (_) {}
      ws.close();
    }
  };
}

/**
 * Destroy chart in a slot, clean up resources.
 * @param {'main'|'second'|'forex'|'all'} slot
 */
function lwcDestroy(slot = 'main') {
  const slots = slot === 'all' ? ['main','second','forex'] : [slot];
  slots.forEach(k => {
    const s = _lwc[k];
    if (!s) return;
    if (typeof s.wsUnsub === 'function') { s.wsUnsub(); s.wsUnsub = null; }
    if (s._resizeObs) { s._resizeObs.disconnect(); s._resizeObs = null; }
    if (s.chart) { try { s.chart.remove(); } catch (_) {} s.chart = null; }
    s.cand = null; s.vol = null; s.sym = null;
    /* Clean up DOM injected by lwcInit */
    if (s.el) {
      const toolbar = s.el.querySelector('.lwc-toolbar');
      if (toolbar) toolbar.remove();
      const inner = s.el.querySelector('.lwc-chart-inner');
      if (inner) inner.innerHTML = '';
    }
    s.el = null;
  });
}

/* ── Global exports ──────────────────────────────────────────────── */
window.lwcInit           = lwcInit;
window.lwcLoad           = lwcLoad;
window.lwcDestroy        = lwcDestroy;
window.lwcSetResolution  = lwcSetResolution;
window.lwcApplyTick      = lwcApplyTick;
window.lwcWsSubscribe    = lwcWsSubscribe;
window._lwcState         = _lwc;
