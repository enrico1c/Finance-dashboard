/* ══════════════════════════════════════════════════════════════════
   FINTERM — Terminal View · terminal.js

   Alternate dense, table-first workspace mode. Toggled from the
   "Terminal View" button in the top bar. Renders entirely from the
   SAME global state/data the dashboard panels already populate
   (currentTicker, currentWatchlistStocks, sectorDB, avLiveCache,
   whAlerts, window._wmConflicts, window._vixLive, window._tvDataCache)
   — no new fetch calls are introduced. Missing fields are shown as
   "N/A"; columns with no backing data anywhere in the app are omitted.
   ══════════════════════════════════════════════════════════════════ */

let terminalViewActive  = false;
let _tvRefreshTimer     = null;

/* ── Safe localStorage wrapper (mirrors config.js getKey/setKey try/catch) ── */
const _TV_MODE_KEY = 'finterm_terminal_view';
const _tvHasStorage = (() => {
  try {
    const k = '__finterm_tv_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch (e) { return false; }
})();
function _tvLoadMode() {
  if (!_tvHasStorage) return false;
  try { return localStorage.getItem(_TV_MODE_KEY) === '1'; }
  catch (e) { return false; }
}
function _tvSaveMode(active) {
  if (!_tvHasStorage) return;
  try { localStorage.setItem(_TV_MODE_KEY, active ? '1' : '0'); }
  catch (e) { /* localStorage unavailable — fall back silently to in-memory state */ }
}

/* ── Toggle ───────────────────────────────────────────────────────── */
function toggleTerminalView() {
  terminalViewActive = !terminalViewActive;
  _tvApplyMode();
  _tvSaveMode(terminalViewActive);
  if (terminalViewActive) {
    renderTerminalView();
    _tvStartRefresh();
  } else {
    _tvStopRefresh();
  }
}
function _tvApplyMode() {
  const shell = document.querySelector('.app-shell');
  const view  = document.getElementById('terminalView');
  const btn   = document.getElementById('terminalViewToggle');
  if (shell) shell.classList.toggle('terminal-active', terminalViewActive);
  if (view)  view.classList.toggle('hidden', !terminalViewActive);
  if (btn)   btn.classList.toggle('active', terminalViewActive);
}
function _tvStartRefresh() {
  _tvStopRefresh();
  /* Re-render from already-cached state — no new fetches — so late-arriving
     async data (quotes, VIX, news, ownership) shows up without user action. */
  _tvRefreshTimer = setInterval(() => { if (terminalViewActive) renderTerminalView(); }, 15000);
}
function _tvStopRefresh() {
  if (_tvRefreshTimer) { clearInterval(_tvRefreshTimer); _tvRefreshTimer = null; }
}

/* ── Restore persisted mode on load ───────────────────────────────── */
window.addEventListener('load', () => {
  terminalViewActive = _tvLoadMode();
  _tvApplyMode();
  if (terminalViewActive) {
    renderTerminalView();
    _tvStartRefresh();
  }
});

/* ══════════════════════════════════════════════════════════════════
   FREE-FLOATING LAYOUT — independent parallel of the dashboard's
   panelLayout / initDrag / initResize / bringToFront (script.js
   ~1663-1905). Operates on disjoint DOM (#terminalView .tv-window
   vs #dashboardCanvas .panel) and disjoint state — the two systems
   never interact, so this carries zero regression risk to the
   14 existing dashboard panels.
   ══════════════════════════════════════════════════════════════════ */
const _TV_LAYOUT_KEY = 'finterm_tv_layout';
let tvLayout = {};
function _tvLoadLayout() {
  if (!_tvHasStorage) return {};
  try {
    const raw = localStorage.getItem(_TV_LAYOUT_KEY);
    return raw ? (JSON.parse(raw) || {}) : {};
  } catch (e) { return {}; }
}
function _tvSaveLayout() {
  if (!_tvHasStorage) return;
  try { localStorage.setItem(_TV_LAYOUT_KEY, JSON.stringify(tvLayout)); }
  catch (e) { /* localStorage unavailable — fall back silently to in-memory state */ }
}
tvLayout = _tvLoadLayout();

function _tvSlug(title) {
  return String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '') || 'win';
}

/* Generic 3-column grid fill — terminal windows are generated dynamically
   (count/identity vary with data), so unlike computeDefaultLayout's bespoke
   per-panel percentages, this just lays out whatever ids are present.
   Existing/persisted positions (tvLayout[id]) are preserved untouched. */
function computeDefaultTvLayout(winIds) {
  const root = document.getElementById('terminalView');
  const W = (root && root.clientWidth) || window.innerWidth;
  const G = 10, cols = 3;
  const colW = Math.round((W - G * (cols + 1)) / cols);
  const rowH = 360;
  winIds.forEach((id, i) => {
    if (tvLayout[id]) return;
    const col = i % cols, row = Math.floor(i / cols);
    tvLayout[id] = { x: G + col * (colW + G), y: G + row * (rowH + G), w: colW, h: rowH };
  });
}

function applyTvWindowPosition(id) {
  const el = document.querySelector(`.tv-window[data-tv-window="${id}"]`);
  if (!el) return;
  let l = tvLayout[id];
  if (!l) {
    const root = document.getElementById('terminalView');
    const rw = (root && root.clientWidth)  || window.innerWidth;
    const rh = (root && root.clientHeight) || window.innerHeight;
    const w = Math.min(640, Math.round(rw * 0.40));
    const h = Math.min(480, Math.round(rh * 0.55));
    l = { x: Math.round((rw - w) / 2), y: Math.round((rh - h) / 2), w, h };
    tvLayout[id] = l;
  }
  Object.assign(el.style, { left: l.x + 'px', top: l.y + 'px', width: l.w + 'px', height: l.h + 'px' });
}

const TV_SNAP = 8, TV_MIN_W = 240, TV_MIN_H = 120;
let tvDragState = null, tvResizeState = null, tvZCounter = 10;
function tvBringToFront(win) { win.style.zIndex = ++tvZCounter; }

function tvInitDrag(win) {
  const head = win.querySelector('.tv-window-header');
  if (!head) return;
  head.addEventListener('mousedown', e => {
    if (e.target.closest('.tv-window-tab,button,input,select,textarea')) return;
    e.preventDefault();
    document.body.style.userSelect = 'none';
    const root = document.getElementById('terminalView');
    const r = win.getBoundingClientRect(), c = root.getBoundingClientRect();
    tvDragState = { win, startMouseX: e.clientX, startMouseY: e.clientY,
      startX: r.left - c.left, startY: r.top - c.top };
    win.classList.add('tv-dragging');
    tvBringToFront(win);
  });
}
document.addEventListener('mousemove', e => {
  if (!tvDragState) return;
  const root = document.getElementById('terminalView');
  if (!root) return;
  const c = root.getBoundingClientRect();
  const ww = tvDragState.win.offsetWidth, wh = tvDragState.win.offsetHeight;
  let x = tvDragState.startX + (e.clientX - tvDragState.startMouseX);
  let y = tvDragState.startY + (e.clientY - tvDragState.startMouseY);
  x = Math.round(x / TV_SNAP) * TV_SNAP;
  y = Math.round(y / TV_SNAP) * TV_SNAP;
  x = Math.max(-ww + 60, Math.min(x, c.width - 60));
  y = Math.max(0, y);
  tvDragState.win.style.left = x + 'px';
  tvDragState.win.style.top  = y + 'px';
  const id = tvDragState.win.dataset.tvWindow;
  if (tvLayout[id]) { tvLayout[id].x = x; tvLayout[id].y = y; }
});
document.addEventListener('mouseup', () => {
  document.body.style.userSelect = '';
  if (!tvDragState) return;
  tvDragState.win.classList.remove('tv-dragging');
  _tvSaveLayout();
  tvDragState = null;
});

function tvInitResize(win) {
  win.querySelectorAll('.tv-resize-handle').forEach(h => {
    h.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      document.body.style.userSelect = 'none';
      const root = document.getElementById('terminalView');
      const r = win.getBoundingClientRect(), c = root.getBoundingClientRect();
      tvResizeState = { win, dir: h.dataset.dir, mouseX: e.clientX, mouseY: e.clientY,
        startX: r.left - c.left, startY: r.top - c.top, startW: r.width, startH: r.height };
      win.classList.add('tv-resizing');
      tvBringToFront(win);
    });
  });
}
document.addEventListener('mousemove', e => {
  if (!tvResizeState) return;
  e.preventDefault();
  const s = tvResizeState;
  const dx = e.clientX - s.mouseX, dy = e.clientY - s.mouseY;
  let x = s.startX, y = s.startY, w = s.startW, h = s.startH;

  if (s.dir.includes('e')) w = Math.max(TV_MIN_W, s.startW + dx);
  if (s.dir.includes('w')) { w = Math.max(TV_MIN_W, s.startW - dx); x = s.startX + s.startW - w; }
  if (s.dir.includes('s')) h = Math.max(TV_MIN_H, s.startH + dy);
  if (s.dir.includes('n')) { h = Math.max(TV_MIN_H, s.startH - dy); y = s.startY + s.startH - h; }

  w = Math.round(w / TV_SNAP) * TV_SNAP;
  h = Math.round(h / TV_SNAP) * TV_SNAP;
  x = Math.round(x / TV_SNAP) * TV_SNAP;
  y = Math.max(0, Math.round(y / TV_SNAP) * TV_SNAP);

  Object.assign(s.win.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });

  const id = s.win.dataset.tvWindow;
  const tt = document.getElementById('tv-tooltip-' + id);
  if (tt) tt.textContent = w + '×' + h;
  if (tvLayout[id]) Object.assign(tvLayout[id], { x, y, w, h });
});
document.addEventListener('mouseup', () => {
  document.body.style.userSelect = '';
  if (!tvResizeState) return;
  tvResizeState.win.classList.remove('tv-resizing');
  _tvSaveLayout();
  tvResizeState = null;
});

/* Re-render on breakpoint crossing so the free-layout ⇄ stacked-grid
   switch (toggled in renderTerminalView via .tv-free-layout) takes effect. */
let _tvResizeDebounce = null;
window.addEventListener('resize', () => {
  if (!terminalViewActive) return;
  clearTimeout(_tvResizeDebounce);
  _tvResizeDebounce = setTimeout(() => renderTerminalView(), 200);
});

/* ══════════════════════════════════════════════════════════════════
   INTERNAL TAB NAVIGATION — Geo-Risk WARS/RESOURCES/ROUTES,
   Ownership HDS/MGMT/PSC-BO, News NEWS/INTEL, Fundamentals' 5 tabs,
   Analysts' OVERVIEW/MODEL 1/2/3 — mirrors the dashboard's internal
   panel tabs. Switching triggers a full renderTerminalView() —
   consistent with the existing wholesale-innerHTML-replacement
   architecture (table rendering is synchronous string concat, so the
   cost of a full re-render is imperceptible).
   ══════════════════════════════════════════════════════════════════ */
const _tvActiveTab = {};
function _tvGetActiveTab(winId, defaultKey) {
  return _tvActiveTab[winId] || defaultKey;
}
function tvSwitchTab(winId, tabKey) {
  _tvActiveTab[winId] = tabKey;
  if (terminalViewActive) renderTerminalView();
}
window.tvSwitchTab = tvSwitchTab;

/* Maps each Terminal View window id to the dashboard's `.panel-toggle
   [data-panel]` id that shows/hides its normal-dashboard counterpart —
   lets the top bar / modules tray govern Terminal View visibility too.
   Several TV windows derive from the same dashboard panel (e.g. the
   watchlist feeds Market Monitor, Quote Matrix and Sector Matrix; the
   Analysts panel hosts both the UARS tabs and the Comparables view).
   'notes' has no Terminal View equivalent, so it maps nothing. */
const _TV_PANEL_MAP = {
  priceChart: 'chart', technicalIndicators: 'chart',
  marketMonitor: 'watchlist', quoteMatrix: 'watchlist', sectorMatrix: 'watchlist',
  news: 'news', macroMonitor: 'macro', charts: 'macro', geoRisk: 'geopolitical',
  alertsBlotter: 'webhooks', alertFeed: 'alert', supplyChain: 'supply',
  ownership: 'ownership', fundamentals: 'fundamentals',
  analysts: 'analysts', comparables: 'analysts',
  portfolio: 'portfolio', screener: 'screener',
};
function _tvPanelVisible(winId) {
  const panelId = _TV_PANEL_MAP[winId];
  if (!panelId) return true;
  const cb = document.querySelector(`.panel-toggle[data-panel="${panelId}"]`);
  return !cb || cb.checked;
}

/* ══════════════════════════════════════════════════════════════════
   PRICE CHART WINDOW — mounts the existing lightweight-charts widget
   (lwchart.js mcInit/mcLoad, in its own 'tvMain' slot alongside the
   dashboard's 'main'/'forex' instances) into Terminal View.
   The widget binds live chart engines + a websocket/poll loop to its
   DOM node, so — unlike the string-concat table windows — it cannot
   be torn down and rebuilt every 15s. renderTerminalView() detaches
   this window's element before replacing root.innerHTML and splices
   it back into the freshly-rendered placeholder afterward, preserving
   the live instance untouched across refreshes.
   ══════════════════════════════════════════════════════════════════ */
let _tvChartInited = false;
let _tvChartSym = '';

/* ══════════════════════════════════════════════════════════════════
   REUSABLE BUILDING BLOCKS — TerminalWindow / TerminalTable
   ══════════════════════════════════════════════════════════════════ */

/** Bordered terminal-style panel frame: thin header bar, uppercase title,
 *  optional tabs/right-side actions, dense scrollable body. */
function tvWindow(title, opts) {
  opts = opts || {};
  const span    = opts.span || 4;
  const spanCls = span !== 4 ? ` tv-span-${span}` : '';
  const id = opts.id || _tvSlug(title);
  const tabsHtml = (opts.tabs && opts.tabs.length)
    ? `<div class="tv-window-tabs">${opts.tabs.map(t =>
        `<span class="tv-window-tab${t.active ? ' active' : ''}" data-tv-tab="${escapeHtml(t.key || '')}" onclick="tvSwitchTab('${id}','${t.key}')">${escapeHtml(t.label)}</span>`).join('')}</div>`
    : '';
  const actionsHtml = opts.actions ? `<span class="tv-window-actions">${escapeHtml(opts.actions)}</span>` : '';
  return `<div class="tv-window${spanCls}" data-tv-window="${id}" id="tv-window-${id}">
    <div class="tv-window-header">
      <div class="tv-drag-grip"><span></span><span></span><span></span><span></span><span></span><span></span></div>
      <span class="tv-window-title">${escapeHtml(title)}</span>
      ${tabsHtml}
      ${actionsHtml}
    </div>
    <div class="tv-window-body${opts.tall ? ' tv-tall' : ''}">${opts.bodyHtml || ''}</div>
    <div class="tv-resize-handle" data-dir="n"></div><div class="tv-resize-handle" data-dir="s"></div>
    <div class="tv-resize-handle" data-dir="w"></div><div class="tv-resize-handle" data-dir="e"></div>
    <div class="tv-resize-handle" data-dir="nw"></div><div class="tv-resize-handle" data-dir="ne"></div>
    <div class="tv-resize-handle" data-dir="sw"></div><div class="tv-resize-handle" data-dir="se"></div>
    <div class="tv-size-tooltip" id="tv-tooltip-${id}"></div>
  </div>`;
}

/** Dense data table: right-aligned numeric columns, left-aligned text,
 *  sticky header, hover rows, "N/A" for missing values.
 *  columns: [{ key, label, align: 'num'|'text', render?(value, row) }] */
function tvTable(columns, rows) {
  if (!rows || !rows.length) {
    return `<div class="tv-window-empty">// No data available — open the corresponding dashboard panel to load it.</div>`;
  }
  const thead = columns.map(c =>
    `<th class="${c.align === 'num' ? 'tv-num' : 'tv-text'}">${escapeHtml(c.label)}</th>`
  ).join('');
  const tbody = rows.map(row => {
    const cells = columns.map(c => {
      const raw = row[c.key];
      let html = c.render ? c.render(raw, row) : null;
      if (html === null || html === undefined) {
        html = (raw === null || raw === undefined || raw === '')
          ? '<span class="tv-empty">N/A</span>'
          : escapeHtml(String(raw));
      }
      return `<td class="${c.align === 'num' ? 'tv-num' : 'tv-text'}">${html}</td>`;
    }).join('');
    return `<tr class="tv-row">${cells}</tr>`;
  }).join('');
  return `<div class="tv-table-wrap"><table class="tv-table"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`;
}

/* ── Small shared formatters / tag builders ───────────────────────── */
function _tvNum(n, dec) {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return null;
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: dec ?? 2, maximumFractionDigits: dec ?? 2 });
}
function _tvPct(n) {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return null;
  const v = Number(n);
  const cls = v > 0 ? 'tv-pos' : v < 0 ? 'tv-neg' : 'tv-neutral';
  return `<span class="${cls}">${v > 0 ? '+' : ''}${v.toFixed(2)}%</span>`;
}
function _tvTag(label, kind) {
  if (label === null || label === undefined || label === '') return null;
  const cls = { pos: 'tv-tag-pos', neg: 'tv-tag-neg', warn: 'tv-tag-warn', neutral: 'tv-tag-neutral' }[kind] || 'tv-tag-neutral';
  return `<span class="tv-tag ${cls}">${escapeHtml(String(label))}</span>`;
}
function _tvTime(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString('en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}
function _tvTicker(sym) {
  if (!sym) return null;
  return `<span class="tv-ticker">${escapeHtml(String(sym).replace(/.*:/, ''))}</span>`;
}

/* ══════════════════════════════════════════════════════════════════
   PER-MODULE MAPPERS — reuse the exact same data the dashboard uses
   ══════════════════════════════════════════════════════════════════ */

/* MarketMonitorTable — same data as renderWatchlistRows() (script.js) */
function tvMarketOverview() {
  const stocks = (typeof currentWatchlistStocks !== 'undefined' && currentWatchlistStocks) || [];
  const scores = (typeof _wlComputeScores === 'function') ? _wlComputeScores(stocks) : new Map();
  const rows = stocks.map(s => ({
    ticker: s.ticker,
    name:   s.name,
    price:  s.price,
    change: s.change,
    mktCap: s.mktCap,
    pe:     s.pe,
    sector: s.sector,
    score:  scores.get(String(s.ticker)),
  }));
  const columns = [
    { key: 'ticker', label: 'Ticker',  render: v => _tvTicker(v) },
    { key: 'name',   label: 'Name' },
    { key: 'price',  label: 'Last',    align: 'num', render: v => v != null ? '$' + _tvNum(v) : null },
    { key: 'change', label: 'Chg %',   align: 'num', render: v => _tvPct(v) },
    { key: 'mktCap', label: 'Mkt Cap', align: 'num' },
    { key: 'pe',     label: 'P/E',     align: 'num', render: v => v != null ? Number(v).toFixed(1) : null },
    { key: 'sector', label: 'Sector' },
    { key: 'score',  label: 'Signal',  align: 'num', render: v => v != null ? _tvTag(Number(v).toFixed(1), v >= 7 ? 'pos' : v >= 4.5 ? 'warn' : 'neg') : null },
  ];
  return tvTable(columns, rows);
}

/* QuoteMatrix — same avLiveCache[sym].quote / .overview that feeds Chart/Fundamentals */
function tvQuoteMatrix(sym) {
  const cache = (typeof avLiveCache !== 'undefined' && avLiveCache[sym]) || {};
  const q = cache.quote || {};
  const ov = cache.overview || {};
  const week52 = (ov.week52Low != null && ov.week52High != null)
    ? `${_tvNum(ov.week52Low)} – ${_tvNum(ov.week52High)}` : null;
  const rows = [
    { metric: 'Last Price', value: q.price,  fmt: 'price' },
    { metric: 'Change %',   value: q.changePct != null ? parseFloat(q.changePct) : q.change, fmt: 'pct' },
    { metric: 'Open',       value: q.open,   fmt: 'price' },
    { metric: 'High',       value: q.high,   fmt: 'price' },
    { metric: 'Low',        value: q.low,    fmt: 'price' },
    { metric: 'Volume',     value: q.volume, fmt: 'int' },
    { metric: 'Market Cap', value: ov.mktCap,fmt: 'cap' },
    { metric: 'P/E',        value: ov.pe,    fmt: 'dec1' },
    { metric: 'Beta',       value: ov.beta,  fmt: 'dec2' },
    { metric: '52-Week Range', value: week52, fmt: 'raw' },
  ];
  return tvTable(_tvMetricColumns(), rows);
}

/* TechnicalIndicatorsTable — same RSI fn + overview MAs that feed the Chart panel */
function tvTechnicalIndicators(sym) {
  const cache = (typeof avLiveCache !== 'undefined' && avLiveCache[sym]) || {};
  const ov = cache.overview || {};
  const rsi = (typeof techGetRsi === 'function') ? techGetRsi(sym) : (cache.rsi ?? null);
  /* Signal thresholds mirror the existing RSI classification in script.js (~line 2259) */
  let signal = null;
  if (rsi != null) {
    signal = rsi < 30 ? 'Strong Buy' : rsi < 45 ? 'Buy' : rsi > 70 ? 'Strong Sell' : rsi > 55 ? 'Sell' : 'Neutral';
  }
  const rows = [
    { metric: 'RSI (14)',   value: rsi,        fmt: 'dec1' },
    { metric: 'MA 50D',     value: ov.ma50,    fmt: 'price' },
    { metric: 'MA 200D',    value: ov.ma200,   fmt: 'price' },
    { metric: '52W High',   value: ov.week52High, fmt: 'price' },
    { metric: '52W Low',    value: ov.week52Low,  fmt: 'price' },
    { metric: 'Beta',       value: ov.beta,    fmt: 'dec2' },
    { metric: 'Signal',     value: signal,     fmt: 'signal' },
  ];
  return tvTable(_tvMetricColumns(), rows);
}

function _tvMetricColumns() {
  return [
    { key: 'metric', label: 'Metric' },
    { key: 'value',  label: 'Value', align: 'num', render: (v, row) => _tvFormatMetric(v, row.fmt) },
  ];
}
function _tvFormatMetric(value, kind) {
  if (value === null || value === undefined || value === '' || (typeof value === 'number' && Number.isNaN(value))) return null;
  switch (kind) {
    case 'price':  return '$' + _tvNum(value);
    case 'pct':    return _tvPct(value);
    case 'pctRaw': return Number(value).toFixed(2) + '%';
    case 'int':    return Number(value).toLocaleString('en-US');
    case 'cap':    return (typeof fmtB === 'function') ? fmtB(value) : ('$' + _tvNum(value, 0));
    case 'dec1':   return Number(value).toFixed(1);
    case 'dec2':   return Number(value).toFixed(2);
    case 'signal': return _tvTag(value, /buy/i.test(value) ? 'pos' : /sell/i.test(value) ? 'neg' : 'neutral');
    default:       return escapeHtml(String(value));
  }
}

/* SectorMatrix — derived by grouping the same sectorDB used by the Watchlist
   (a simple average of the real per-stock % changes — not invented data) */
function tvSectorMatrix() {
  const db = (typeof sectorDB !== 'undefined' && sectorDB) || {};
  const rows = Object.values(db).map(grp => {
    const stocks = grp.stocks || [];
    if (!stocks.length) return null;
    const avgChange = stocks.reduce((sum, s) => sum + (Number(s.change) || 0), 0) / stocks.length;
    const top = [...stocks].sort((a, b) => (Number(b.change) || -Infinity) - (Number(a.change) || -Infinity))[0];
    return { sector: grp.label, topTicker: top && top.ticker, change: avgChange, count: stocks.length };
  }).filter(Boolean);
  const columns = [
    { key: 'sector',    label: 'Sector' },
    { key: 'topTicker', label: 'Top Ticker', render: v => _tvTicker(v) },
    { key: 'change',    label: 'Avg Chg %',  align: 'num', render: v => _tvPct(v) },
    { key: 'count',     label: 'Names',      align: 'num' },
  ];
  return tvTable(columns, rows);
}

/* IntelligenceBlotter — same article objects rendered by renderNewsFeed/niCard,
   exposed via the window._tvDataCache.news stash added in script.js */
function tvIntelligenceBlotter() {
  const cached = (window._tvDataCache && window._tvDataCache.news) || {};
  const articles = cached.articles || [];
  const rows = articles.slice(0, 30).map(a => ({
    time: _tvTime(a.datetime),
    source: a.source,
    headline: a.headline,
    category: a.category,
    assets: cached.sym,
    sentiment: a.sentiment,
  }));
  const columns = [
    { key: 'time',      label: 'Time' },
    { key: 'source',    label: 'Source' },
    { key: 'headline',  label: 'Headline', render: v => v
        ? `<span title="${escapeHtml(String(v))}">${escapeHtml(String(v).length > 88 ? String(v).slice(0, 85) + '…' : v)}</span>` : null },
    { key: 'category',  label: 'Category', render: v => _tvTag(v, 'neutral') },
    { key: 'assets',    label: 'Assets',   render: v => _tvTicker(v) },
    { key: 'sentiment', label: 'Sentiment',render: v => v ? _tvTag(v, /bull/i.test(v) ? 'pos' : /bear/i.test(v) ? 'neg' : 'neutral') : null },
  ];
  return tvTable(columns, rows);
}

/* ══════════════════════════════════════════════════════════════════
   CHART GALLERY — shared SVG generators + the tvCharts() mapper that
   reproduces every distinct visualization from Macro Intel's tabs
   natively in terminal styling. Each helper draws straight from the
   underlying numeric series stashed in window._tvDataCache (cache-
   stash pattern, no new fetches) — charts are redrawn with these
   shared primitives rather than reusing the source widgets' SVG HTML,
   so the whole gallery shares one visual language (currentColor +
   tv-pos/tv-neg semantics, matching the rest of the Terminal View).
   ══════════════════════════════════════════════════════════════════ */

/** Line + optional area-fill sparkline from a flat numeric series.
 *  opts.cls picks a semantic color class (defaults to first→last
 *  direction); opts.color overrides with an explicit hex/CSS color. */
function _tvSparkSVG(values, opts) {
  opts = opts || {};
  const vals = (values || []).map(Number).filter(v => !Number.isNaN(v));
  if (vals.length < 2) return '';
  const w = opts.w || 180, h = opts.h || 38;
  const min = Math.min(...vals), max = Math.max(...vals), rng = (max - min) || 1;
  const stepX = w / (vals.length - 1);
  const toY = v => (h - 3 - ((v - min) / rng) * (h - 6)).toFixed(1);
  const pts = vals.map((v, i) => `${(i * stepX).toFixed(1)},${toY(v)}`);
  const cls = opts.color ? '' : (opts.cls || (vals[vals.length - 1] >= vals[0] ? 'tv-pos' : 'tv-neg'));
  const style = opts.color ? ` style="color:${escapeHtml(String(opts.color))}"` : '';
  const area = opts.area === false ? '' :
    `<polygon points="0,${h} ${pts.join(' ')} ${w},${h}" fill="currentColor" opacity="0.10"/>`;
  return `<svg class="tv-spark${cls ? ' ' + cls : ''}"${style} viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${area}<polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
}

/** Semicircle gauge: pct is a 0-100 fill amount; valueText (any label,
 *  e.g. the raw index value) is drawn at the arc's center. */
function _tvGaugeSVG(pct, opts) {
  opts = opts || {};
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  const cls = opts.cls || (v >= 60 ? 'tv-pos' : v <= 40 ? 'tv-neg' : 'tv-warn');
  const r = 40, cx = 50, cy = 48, arc = Math.PI * r;
  return `<svg class="tv-gauge ${cls}" viewBox="0 0 100 56">
    <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="var(--border-bright)" stroke-width="7" stroke-linecap="round"/>
    <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(v / 100 * arc).toFixed(1)} ${arc.toFixed(1)}"/>
    <text x="50" y="44" text-anchor="middle" class="tv-gauge-value">${escapeHtml(String(opts.valueText ?? Math.round(v)))}</text>
  </svg>`;
}

/** Treasury yield curve: filled area + line across maturities, mirroring
 *  _fredRenderYieldCurve's {label, value} series, redrawn in tv- styling. */
function _tvYieldCurveSVG(yields) {
  const ys = (yields || []).filter(y => y && typeof y.value === 'number');
  if (ys.length < 2) return '';
  const w = 320, h = 90, pl = 30, pr = 8, pt = 10, pb = 16;
  const cw = w - pl - pr, ch = h - pt - pb;
  const vals = ys.map(y => y.value);
  const min = Math.min(...vals), max = Math.max(...vals), rng = (max - min) || 0.5;
  const toX = i => (pl + i / (ys.length - 1) * cw).toFixed(1);
  const toY = v => (pt + ch - (v - min) / rng * ch).toFixed(1);
  const pts = ys.map((y, i) => `${toX(i)},${toY(y.value)}`);
  const inverted = vals[0] > vals[vals.length - 1];
  const cls = inverted ? 'tv-neg' : 'tv-pos';
  return `<svg class="tv-yieldcurve ${cls}" viewBox="0 0 ${w} ${h}">
    <polygon points="${toX(0)},${pt + ch} ${pts.join(' ')} ${toX(ys.length - 1)},${pt + ch}" fill="currentColor" opacity="0.10"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
    ${ys.map((y, i) => i % Math.ceil(ys.length / 6) === 0
      ? `<text x="${toX(i)}" y="${h - 4}" class="tv-chart-axis" text-anchor="middle">${escapeHtml(String(y.label))}</text>` : '').join('')}
    <text x="${pl - 3}" y="${toY(max)}" class="tv-chart-axis" text-anchor="end" dominant-baseline="central">${max.toFixed(2)}</text>
    <text x="${pl - 3}" y="${toY(min)}" class="tv-chart-axis" text-anchor="end" dominant-baseline="central">${min.toFixed(2)}</text>
  </svg>${inverted ? '<span class="tv-tag tv-tag-neg">⚠ INVERTED</span>' : ''}`;
}

/** Horizontal bar ranking — rows: [{label, value, display}], bars scale
 *  to [opts.min, opts.max] (defaults to the data's own range); opts.mid
 *  sets the pos/neg color threshold (e.g. 0 for growth %, 50 for prob%). */
function _tvBarRanking(rows, opts) {
  opts = opts || {};
  const items = (rows || []).filter(r => r && r.value != null);
  if (!items.length) return '';
  const vals = items.map(r => Number(r.value));
  const min = opts.min ?? Math.min(0, ...vals);
  const max = opts.max ?? Math.max(...vals);
  const rng = (max - min) || 1;
  const mid = opts.mid ?? 0;
  return `<div class="tv-bar-ranking">${items.map(r => {
    const pct = Math.max(0, Math.min(100, (Number(r.value) - min) / rng * 100));
    const cls = Number(r.value) >= mid ? 'tv-pos' : 'tv-neg';
    return `<div class="tv-bar-row">
      <span class="tv-bar-label" title="${escapeHtml(String(r.label))}">${escapeHtml(String(r.label))}</span>
      <span class="tv-bar-track"><span class="tv-bar-fill ${cls}" style="width:${pct.toFixed(1)}%"></span></span>
      <span class="tv-bar-value ${cls}">${escapeHtml(String(r.display ?? r.value))}</span>
    </div>`;
  }).join('')}</div>`;
}

/** Compact OHLC bar chart (high-low stem + open/close ticks) —
 *  candles: [{t,o,h,l,c}], oldest→newest, last 40 shown. */
function _tvCandleSVG(candles) {
  const cs = (candles || []).filter(c => c && c.h != null && c.l != null).slice(-40);
  if (cs.length < 2) return '';
  const w = 320, h = 100, pt = 6, pb = 6, ch = h - pt - pb;
  const hi = Math.max(...cs.map(c => c.h)), lo = Math.min(...cs.map(c => c.l)), rng = (hi - lo) || 1;
  const toY = v => (pt + ch - (v - lo) / rng * ch).toFixed(1);
  const stepX = w / cs.length;
  return `<svg class="tv-candles" viewBox="0 0 ${w} ${h}">${cs.map((c, i) => {
    const x = (i + 0.5) * stepX, tick = stepX * 0.3;
    const cls = c.c >= c.o ? 'tv-pos' : 'tv-neg';
    return `<g class="${cls}">
      <line x1="${x.toFixed(1)}" y1="${toY(c.h)}" x2="${x.toFixed(1)}" y2="${toY(c.l)}" stroke="currentColor" stroke-width="1"/>
      <line x1="${(x - tick).toFixed(1)}" y1="${toY(c.o)}" x2="${x.toFixed(1)}" y2="${toY(c.o)}" stroke="currentColor" stroke-width="1.6"/>
      <line x1="${x.toFixed(1)}" y1="${toY(c.c)}" x2="${(x + tick).toFixed(1)}" y2="${toY(c.c)}" stroke="currentColor" stroke-width="1.6"/>
    </g>`;
  }).join('')}</svg>`;
}

/** Bordered card wrapping a single chart with a label/meta header —
 *  the gallery's atomic unit; returns '' when the chart body is empty
 *  so callers can .filter(Boolean) cards with insufficient data. */
function _tvChartCard(label, meta, chartHtml, variant) {
  if (!chartHtml) return '';
  return `<div class="tv-chart-card${variant ? ` tv-chart-card-${variant}` : ''}">
    <div class="tv-chart-card-head">
      <span class="tv-chart-card-label" title="${escapeHtml(String(label))}">${escapeHtml(String(label))}</span>
      ${meta != null ? `<span class="tv-chart-card-meta">${meta}</span>` : ''}
    </div>
    <div class="tv-chart-card-body">${chartHtml}</div>
  </div>`;
}

/* Charts — exhaustive gallery reproducing every distinct chart/graph
   that appears across Macro Intel's tabs (signals, yield curve, FRED
   indicators, commodities, bonds, crypto, predictions, global growth,
   leading indicators, energy, agriculture), assembled purely from the
   window._tvDataCache stashes added alongside each source's render
   function — populates lazily as each Macro Intel tab is opened once. */
function tvCharts() {
  const c = window._tvDataCache || {};
  const sections = [];

  if (c.macroSignals?.length) {
    sections.push({ title: 'Macro Signals', cards: c.macroSignals.slice(0, 12).map(s =>
      _tvChartCard(s.label, s.chgPct != null ? _tvPct(s.chgPct) : null,
        _tvSparkSVG(s.vals, { area: false }))) });
  }

  if (c.yieldCurve?.yields?.length) {
    sections.push({ title: 'Yield Curve', cards: [
      _tvChartCard(`Treasury Yield Curve${c.yieldCurve.date ? ' · ' + c.yieldCurve.date : ''}`,
        c.yieldCurve.src ? escapeHtml(String(c.yieldCurve.src)) : null,
        _tvYieldCurveSVG(c.yieldCurve.yields), 'wide') ] });
  }

  if (c.fredEconSparklines?.some(Boolean)) {
    sections.push({ title: 'Economic Indicators', cards: c.fredEconSparklines.filter(Boolean).map(s =>
      _tvChartCard(s.label, null, _tvSparkSVG(s.vals, { area: false }))) });
  }

  if (c.commoditySparklines?.length) {
    sections.push({ title: 'Commodities', cards: c.commoditySparklines.map(s =>
      _tvChartCard(s.label, null, _tvSparkSVG(s.vals, { area: false }))) });
  }

  if (c.bondSparklines?.length) {
    sections.push({ title: 'Bond Spreads', cards: c.bondSparklines.map(s =>
      _tvChartCard(s.label, null, _tvSparkSVG(s.vals, s.color ? { color: s.color, area: false } : { area: false }))) });
  }

  if (c.crypto?.coins?.length || c.crypto?.fearGreed?.current) {
    sections.push({ title: 'Crypto', cards: [
      ...(c.crypto.coins || []).slice(0, 8).map(coin => _tvChartCard(
        (coin.symbol || '').toUpperCase(),
        coin.price_change_percentage_24h != null ? _tvPct(coin.price_change_percentage_24h) : null,
        _tvSparkSVG(coin.sparkline_in_7d?.price, { area: false }))),
      ...(c.crypto.fearGreed?.current ? [_tvChartCard('Fear & Greed Index',
        c.crypto.fearGreed.current.value_classification ? escapeHtml(String(c.crypto.fearGreed.current.value_classification)) : null,
        _tvGaugeSVG(c.crypto.fearGreed.current.value, { valueText: c.crypto.fearGreed.current.value }))] : []),
    ] });
  }

  if (c.btcCandles?.length) {
    sections.push({ title: 'Crypto OHLC', cards: [
      _tvChartCard('BTC/USDT · Daily', `${c.btcCandles.length}d`, _tvCandleSVG(c.btcCandles), 'wide') ] });
  }

  if (c.predictions?.length) {
    sections.push({ title: 'Prediction Markets', cards: [
      _tvChartCard('Implied Probability', `${c.predictions.length} markets`,
        _tvBarRanking(c.predictions.slice(0, 12).map(m => ({
          label: (m.question || '').length > 64 ? m.question.slice(0, 61) + '…' : m.question,
          value: m.prob, display: m.prob != null ? `${m.prob}%` : 'N/A',
        })), { min: 0, max: 100, mid: 50 }), 'wide') ] });
  }

  if (c.gdpRanking?.length) {
    sections.push({ title: 'Global Growth', cards: [
      _tvChartCard('GDP Growth % — World Bank · IMF', `${c.gdpRanking.length} economies`,
        _tvBarRanking(c.gdpRanking.map(r => ({
          label: r.name, value: r.gdp_growth,
          display: r.gdp_growth != null ? `${r.gdp_growth >= 0 ? '+' : ''}${r.gdp_growth.toFixed(1)}%` : 'N/A',
        })), { mid: 0 }), 'wide') ] });
  }

  if (c.cliGauges?.length) {
    sections.push({ title: 'Leading Indicators (CLI)', cards: c.cliGauges.slice(0, 12).map(item =>
      _tvChartCard(item.name || item.code || '',
        typeof item.value === 'number' ? item.value.toFixed(2) : null,
        _tvGaugeSVG(Math.max(0, Math.min(100, (item.value - 97) / 6 * 100)),
          { valueText: typeof item.value === 'number' ? item.value.toFixed(1) : '—',
            cls: item.value >= 100 ? 'tv-pos' : 'tv-neg' }))) });
  }

  if (c.energySparklines?.cards?.length || c.energySparklines?.gasStorage) {
    const e = c.energySparklines;
    sections.push({ title: 'Energy', cards: [
      ...(e.cards || []).map(s => _tvChartCard(s.label, null,
        _tvSparkSVG(s.vals, s.color ? { color: s.color, area: false } : { area: false }))),
      ...(e.gasStorage ? [_tvChartCard(e.gasStorage.label, null, _tvSparkSVG(e.gasStorage.vals, { area: false }))] : []),
    ] });
  }

  if (c.agriSparkline?.vals?.length) {
    sections.push({ title: 'Agriculture', cards: [
      _tvChartCard(c.agriSparkline.label, null, _tvSparkSVG(c.agriSparkline.vals, { area: false })) ] });
  }

  const built = sections.map(sec => ({ ...sec, cards: sec.cards.filter(Boolean) })).filter(sec => sec.cards.length);
  if (!built.length) {
    return `<div class="tv-window-empty">// No chart data cached yet — open the corresponding Macro Intel tabs (Signals, Yield, Econ, Commodities, Bonds, Crypto, Predictions, Global, PMI, Energy, Agri…) to populate the gallery.</div>`;
  }
  return built.map(sec => `<div class="tv-chart-section">
    <div class="tv-chart-section-title">${escapeHtml(sec.title)}</div>
    <div class="tv-chart-grid">${sec.cards.join('')}</div>
  </div>`).join('');
}

/* MacroMonitorTable — live VIX cache + Damodaran ERP constant, extended with
   FRED macro indicators & credit spreads via the window._tvDataCache.fredMacro
   / .fredSpreads stashes added in fred.js (module-scoped caches made reusable,
   no re-fetch — same series the Macro-Intel panel already loaded). */
function tvMacroMonitor() {
  const rows = [];
  const vix = window._vixLive;
  rows.push({
    category: 'Market Risk',
    indicator: 'VIX — CBOE Volatility Index',
    current: vix ? vix.current : null,
    previous: (vix && vix.current != null && vix.change != null) ? (vix.current - vix.change) : null,
    change: vix ? (vix.changePct ?? vix.change) : null,
    status: vix && vix.current != null ? (vix.current >= 30 ? 'ELEVATED' : vix.current >= 20 ? 'WATCH' : 'NORMAL') : null,
  });
  const erp = window.DAMODARAN_ERP;
  rows.push({
    category: 'Valuation',
    indicator: 'Implied Equity Risk Premium (Damodaran, NYU Stern)',
    current: erp != null ? erp : null,
    previous: null,
    change: null,
    status: erp != null ? 'REFERENCE' : null,
  });
  (window._tvDataCache?.fredMacro || []).forEach(p => {
    const chg = (p.latest != null && p.prev != null) ? (p.latest - p.prev) : null;
    const pct = (p.prev && chg != null) ? (chg / Math.abs(p.prev) * 100) : null;
    rows.push({
      category: 'Macro (FRED)',
      indicator: `${p.label}${p.unit ? ` (${p.unit})` : ''}`,
      current: p.latest, previous: p.prev, change: pct, status: null,
    });
  });
  (window._tvDataCache?.fredSpreads || []).forEach(p => {
    const level = p.label === 'IG OAS' ? (p.value < 100 ? 'TIGHT' : 'WIDE')
                : p.label === 'HY OAS' ? (p.value < 400 ? 'TIGHT' : 'WIDE')
                : null;
    rows.push({
      category: 'Credit Spread',
      indicator: `${p.label} — ${p.note}`,
      current: p.value, previous: null, change: null, status: level,
    });
  });
  const columns = [
    { key: 'category',  label: 'Category' },
    { key: 'indicator', label: 'Indicator' },
    { key: 'current',   label: 'Current',  align: 'num', render: v => v != null ? Number(v).toFixed(2) : null },
    { key: 'previous',  label: 'Previous', align: 'num', render: v => v != null ? Number(v).toFixed(2) : null },
    { key: 'change',    label: 'Chg',      align: 'num', render: v => _tvPct(v) },
    { key: 'status',    label: 'Status',   render: v => v ? _tvTag(v, (v === 'ELEVATED' || v === 'WIDE') ? 'neg' : v === 'WATCH' ? 'warn' : (v === 'NORMAL' || v === 'TIGHT') ? 'pos' : 'neutral') : null },
  ];
  return tvTable(columns, rows);
}

/* RiskMatrix — same conflict/event objects worldmonitor.js already caches in
   window._wmConflicts (populated when the Geo·Risk "Wars" tab loads) */
function tvRiskMatrix() {
  const items = window._wmConflicts || [];
  const rows = items.slice(0, 25).map(c => {
    const resources = c.resources || c.commodities || [];
    const assets = resources.map(r => r.name || r.commodity).filter(Boolean).slice(0, 4).join(', ');
    return {
      region: c.region || c.location,
      event: c.name || c.title,
      riskLevel: (c.intensity || c.riskLevel || c.severity || '').toUpperCase() || null,
      assets: assets || null,
      status: c.phase,
      updated: c.since,
    };
  });
  const columns = [
    { key: 'region',    label: 'Region' },
    { key: 'event',     label: 'Event' },
    { key: 'riskLevel', label: 'Risk Level', render: v => v ? _tvTag(v, (v === 'CRITICAL' || v === 'HIGH') ? 'neg' : v === 'MEDIUM' ? 'warn' : 'pos') : null },
    { key: 'assets',    label: 'Affected Assets' },
    { key: 'status',    label: 'Status' },
    { key: 'updated',   label: 'Since' },
  ];
  return tvTable(columns, rows);
}

const _GEO_RISK_RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
function _tvRiskRank(level) { return _GEO_RISK_RANK[String(level || '').toUpperCase()] || 0; }

/* GeoResources — reproduces wmGeoResources()'s flatten/dedupe-by-name logic
   (worldmonitor.js ~3437) client-side from the same window._wmConflicts
   array — same data, no new fetch, no stash needed. */
function tvGeoResources() {
  const items = window._wmConflicts || [];
  const allRes = {};
  items.forEach(c => {
    (c.resources || c.commodities || []).forEach(r => {
      const name = r.name || r.commodity || '';
      if (!name) return;
      const risk  = (r.risk || r.riskLevel || 'LOW').toUpperCase();
      const cName = c.name || c.title || '';
      if (!allRes[name] || _tvRiskRank(risk) > _tvRiskRank(allRes[name].risk)) {
        allRes[name] = { name, risk, conflicts: [cName] };
      } else {
        allRes[name].conflicts.push(cName);
      }
    });
  });
  const rows = Object.values(allRes)
    .sort((a, b) => _tvRiskRank(b.risk) - _tvRiskRank(a.risk))
    .slice(0, 20)
    .map(r => ({ commodity: r.name, risk: r.risk, conflicts: r.conflicts.filter(Boolean).slice(0, 3).join(', ') || null }));
  const columns = [
    { key: 'commodity', label: 'Commodity' },
    { key: 'risk',      label: 'Risk', render: v => v ? _tvTag(v, (v === 'CRITICAL' || v === 'HIGH') ? 'neg' : v === 'MEDIUM' ? 'warn' : 'pos') : null },
    { key: 'conflicts', label: 'Driving Conflicts' },
  ];
  return tvTable(columns, rows);
}

/* GeoRoutes — same chokepoint objects rendered by wmGeoRoutes(),
   exposed via the window._wmChokepoints stash added in worldmonitor.js */
function tvGeoRoutes() {
  const items = window._wmChokepoints || [];
  const rows = items.slice(0, 20).map(c => ({
    name: c.name,
    region: c.region || c.location,
    risk: (c.riskLevel || c.risk_level || c.status || '').toUpperCase() || null,
    disruption: c.disruption_pct ?? c.disruptionPct ?? c.throughputReduction ?? null,
    delay: c.avgDelayDays ?? c.delay_days ?? null,
    traffic: c.dailyVessels ?? c.vessel_count ?? null,
    commodities: (c.affectedCommodities || []).slice(0, 4).join(', ') || null,
  }));
  const columns = [
    { key: 'name',        label: 'Chokepoint' },
    { key: 'region',      label: 'Region' },
    { key: 'risk',        label: 'Risk', render: v => v ? _tvTag(v, (v === 'CRITICAL' || v === 'HIGH') ? 'neg' : v === 'MEDIUM' ? 'warn' : 'pos') : null },
    { key: 'disruption',  label: 'Disruption %', align: 'num', render: v => v != null ? Number(v).toFixed(0) + '%' : null },
    { key: 'delay',       label: 'Delay (d)',    align: 'num', render: v => v != null ? '+' + Number(v).toFixed(0) : null },
    { key: 'traffic',     label: 'Vessels/Day',  align: 'num', render: v => v != null ? Number(v).toLocaleString('en-US') : null },
    { key: 'commodities', label: 'Affected Commodities' },
  ];
  return tvTable(columns, rows);
}

/* AlertsBlotter — the exact same whAlerts array whRenderAlerts() reads (script.js) */
function tvAlertsBlotter() {
  const alerts = (typeof whAlerts !== 'undefined' && whAlerts) || [];
  const rows = alerts.map(a => {
    const status = a.triggered ? 'TRIGGERED' : (a.active ? 'ACTIVE' : 'PAUSED');
    return {
      asset: a.ticker,
      type: (typeof whCondLabel === 'function') ? whCondLabel(a.condition) : a.condition,
      value: a.value,
      interval: a.interval,
      note: a.note,
      status,
    };
  });
  const columns = [
    { key: 'asset',    label: 'Asset',    render: v => _tvTicker(v) },
    { key: 'type',     label: 'Trigger Type' },
    { key: 'value',    label: 'Threshold', align: 'num' },
    { key: 'interval', label: 'Interval' },
    { key: 'note',     label: 'Note' },
    { key: 'status',   label: 'Status', render: v => _tvTag(v, v === 'TRIGGERED' ? 'neg' : v === 'ACTIVE' ? 'pos' : 'neutral') },
  ];
  return tvTable(columns, rows);
}

/* OwnershipTable — the exact insider/institutional arrays fhRenderOwnership()
   already receives, exposed via the window._tvDataCache.ownership stash
   added in finnhub.js (no re-fetch — same data, just made reusable) */
function tvOwnershipTable() {
  const cached = (window._tvDataCache && window._tvDataCache.ownership) || {};
  const rows = [];
  (cached.insiders || []).slice(0, 15).forEach(t => {
    const isBuy = ['P', 'A'].includes(t.transactionCode);
    const isSell = ['S', 'D', 'F'].includes(t.transactionCode);
    rows.push({
      holder: t.name, type: 'Insider',
      position: t.share, change: t.change, pct: null,
      filingDate: t.transactionDate, source: 'Finnhub',
      signal: isBuy ? 'Buy/Grant' : isSell ? 'Sale' : (t.transactionCode || null),
      signalKind: isBuy ? 'pos' : isSell ? 'neg' : 'neutral',
    });
  });
  (cached.institutional || []).slice(0, 15).forEach(o => {
    rows.push({
      holder: o.name, type: 'Institutional',
      position: o.shares, change: o.change, pct: o.pct,
      filingDate: o.reportDate, source: 'Finnhub',
      signal: o.change > 0 ? 'Increasing' : o.change < 0 ? 'Decreasing' : (o.change === 0 ? 'Unchanged' : null),
      signalKind: o.change > 0 ? 'pos' : o.change < 0 ? 'neg' : 'neutral',
    });
  });
  const columns = [
    { key: 'holder',     label: 'Holder' },
    { key: 'type',       label: 'Type', render: v => _tvTag(v, 'neutral') },
    { key: 'position',   label: 'Position',  align: 'num', render: v => v != null ? Number(v).toLocaleString('en-US') : null },
    { key: 'change',     label: 'Change',    align: 'num', render: v => v != null ? ((v > 0 ? '+' : '') + Number(v).toLocaleString('en-US')) : null },
    { key: 'pct',        label: '% Ownership', align: 'num', render: v => v != null ? Number(v).toFixed(2) + '%' : null },
    { key: 'filingDate', label: 'Filing Date' },
    { key: 'source',     label: 'Source' },
    { key: 'signal',     label: 'Signal', render: (v, row) => v ? _tvTag(v, row.signalKind) : null },
  ];
  return tvTable(columns, rows);
}

/* OwnershipMgmt — mirrors the #own-mgmt MGMT tab's primary source chain:
   FMP executives (fmpGetLive(sym).mgmt — name/role/age/pay) when available,
   else the Finnhub profile fallback fhRenderMgmt() shows (already global
   via fhGetLive — no stash needed for either source). */
function tvOwnershipMgmt(sym) {
  const fmpLive = (typeof fmpGetLive === 'function') ? fmpGetLive(sym) : null;
  const mgmt = fmpLive?.mgmt;
  if (Array.isArray(mgmt) && mgmt.length) {
    const rows = mgmt.slice(0, 15).map(m => ({ name: m.name, role: m.role, age: m.age, pay: m.pay }));
    const columns = [
      { key: 'name', label: 'Executive' },
      { key: 'role', label: 'Title' },
      { key: 'age',  label: 'Age', align: 'num', render: v => (v != null && v !== '—') ? v : null },
      { key: 'pay',  label: 'Compensation', align: 'num' },
    ];
    return tvTable(columns, rows);
  }
  const profile = (typeof fhGetLive === 'function') ? fhGetLive(sym)?.profile : null;
  const rows = [
    { metric: 'Company',            value: profile?.name,     fmt: 'raw' },
    { metric: 'Exchange',           value: profile?.exchange, fmt: 'raw' },
    { metric: 'Country',            value: profile?.country,  fmt: 'raw' },
    { metric: 'Sector / Industry',  value: profile?.sector,   fmt: 'raw' },
    { metric: 'Market Cap',         value: profile?.mktCap,   fmt: 'cap' },
    { metric: 'IPO Date',           value: profile?.ipo,      fmt: 'raw' },
    { metric: 'Shares Outstanding', value: profile?.shareOut, fmt: 'int' },
  ];
  return tvTable(_tvMetricColumns(), rows);
}

const _CH_NATURE_LABELS = {
  'ownership-of-shares-25-to-50-percent': '25–50% shares',
  'ownership-of-shares-50-to-75-percent': '50–75% shares',
  'ownership-of-shares-75-to-100-percent': '75–100% shares',
  'voting-rights-25-to-50-percent': '25–50% votes',
  'voting-rights-50-to-75-percent': '50–75% votes',
  'voting-rights-75-to-100-percent': '75–100% votes',
  'right-to-appoint-and-remove-directors': 'Appoint directors',
  'significant-influence-or-control': 'Significant control',
};
/* OwnershipPSC — same Persons-with-Significant-Control records
   _renderPSCSection() draws, exposed via the window._tvDataCache.companiesHouse stash */
function tvOwnershipPSC() {
  const cached = (window._tvDataCache && window._tvDataCache.companiesHouse) || {};
  const items = cached.pscItems || [];
  const rows = items.slice(0, 15).map(p => {
    const kind = p.kind || '';
    const dob = p.date_of_birth ? `${p.date_of_birth.year}-${String(p.date_of_birth.month).padStart(2, '0')}` : null;
    return {
      name: p.name || p.company_name,
      type: kind.includes('corporate') ? 'Corporate Entity' : 'Individual',
      nature: (p.natures_of_control || []).map(n => _CH_NATURE_LABELS[n] || n.replace(/-/g, ' ')).slice(0, 2).join(', ') || null,
      nationality: p.nationality || p.country_of_residence,
      notified: p.notified_on,
      dob,
    };
  });
  const columns = [
    { key: 'name',        label: 'Person / Entity' },
    { key: 'type',        label: 'Type', render: v => v ? _tvTag(v, 'neutral') : null },
    { key: 'nature',      label: 'Nature of Control' },
    { key: 'nationality', label: 'Nationality' },
    { key: 'notified',    label: 'Notified' },
    { key: 'dob',         label: 'DoB (Y-M)' },
  ];
  return tvTable(columns, rows);
}

/* GDELT seendate format is YYYYMMDDTHHMMSSZ; Federal Register uses ISO dates */
function _tvDateSafe(raw) {
  if (!raw) return null;
  const m = String(raw).match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? String(raw).slice(0, 10) : d.toISOString().slice(0, 10);
}

/* NewsIntel — merges GDELT policy/disruption articles + Federal Register
   notices, the same feeds intelLoadAll() renders into #intel-tab-*,
   exposed via the window._tvDataCache.intel stash added in intel.js */
function tvNewsIntel() {
  const cached = (window._tvDataCache && window._tvDataCache.intel) || {};
  const rows = [];
  (cached.policyArticles || []).slice(0, 10).forEach(a => rows.push({
    source: 'GDELT Policy', headline: a.title, origin: a.domain || a.sourcecountry,
    date: _tvDateSafe(a.seendate || a.publishdate), type: null,
  }));
  (cached.dispArticles || []).slice(0, 10).forEach(a => rows.push({
    source: 'GDELT Disruption', headline: a.title, origin: a.domain,
    date: _tvDateSafe(a.seendate || a.publishdate), type: null,
  }));
  (cached.fedDocs || []).slice(0, 10).forEach(d => rows.push({
    source: 'Federal Register', headline: d.title, origin: d.document_number,
    date: _tvDateSafe(d.publication_date), type: d.type,
  }));
  rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const columns = [
    { key: 'date',     label: 'Date' },
    { key: 'source',   label: 'Source', render: v => _tvTag(v, 'neutral') },
    { key: 'headline', label: 'Headline', render: v => v
        ? `<span title="${escapeHtml(String(v))}">${escapeHtml(String(v).length > 80 ? String(v).slice(0, 77) + '…' : v)}</span>` : null },
    { key: 'origin',   label: 'Origin / Doc #' },
    { key: 'type',     label: 'Type', render: v => v ? _tvTag(v, v === 'RULE' ? 'neg' : v === 'PRULE' ? 'warn' : 'neutral') : null },
  ];
  return tvTable(columns, rows);
}

/* ══════════════════════════════════════════════════════════════════
   FUNDAMENTALS — entirely new window, 5 internal tabs. Every source
   here is already globally reachable (avLiveCache / fhGetLive /
   fmpGetLive / window._treasuryYields / window.DAMODARAN_ERP) except
   segmentation (stash #5) and SEC filings (stash #6).
   ══════════════════════════════════════════════════════════════════ */

/* OVERVIEW — same ratio set the Fundamentals panel's overview tab shows */
function tvFundOverview(sym) {
  const fhLive  = (typeof fhGetLive  === 'function') ? fhGetLive(sym)  : null;
  const fmpLive = (typeof fmpGetLive === 'function') ? fmpGetLive(sym) : null;
  const ratios  = fmpLive?.ratios;
  const profile = fhLive?.profile;
  const cache   = (typeof avLiveCache !== 'undefined' && avLiveCache[sym]) || {};
  const ov = cache.overview || {};
  const rows = [
    { metric: 'Sector / Industry', value: profile?.sector,         fmt: 'raw' },
    { metric: 'P/E',               value: ratios?.pe ?? ov.pe,     fmt: 'dec1' },
    { metric: 'P/B',               value: ratios?.pb,              fmt: 'dec2' },
    { metric: 'EV/EBITDA',         value: ratios?.evEbitda,        fmt: 'dec1' },
    { metric: 'ROE',               value: ratios?.roe,             fmt: 'pctRaw' },
    { metric: 'Gross Margin',      value: ratios?.grossMgn,        fmt: 'pctRaw' },
    { metric: 'Dividend Yield',    value: ratios?.divYield,        fmt: 'pctRaw' },
    { metric: 'Debt / Equity',     value: ratios?.debtEq,          fmt: 'dec2' },
    { metric: 'Beta',              value: ov.beta,                 fmt: 'dec2' },
  ];
  return tvTable(_tvMetricColumns(), rows);
}

/* FINANCIALS — same avLiveCache[sym].income annual series avRenderFA() shows */
function tvFundFinancials(sym) {
  const income = (typeof avLiveCache !== 'undefined' && avLiveCache[sym]?.income) || [];
  const moneyFmt = v => (v ? ((typeof fmtB === 'function') ? fmtB(v) : '$' + _tvNum(v, 0)) : null);
  const rows = income.slice(0, 5).map(r => ({
    year: r.year, revenue: r.revenue, grossProfit: r.grossProfit, ebit: r.ebit, netIncome: r.netIncome,
  }));
  const columns = [
    { key: 'year',        label: 'FY' },
    { key: 'revenue',     label: 'Revenue',      align: 'num', render: moneyFmt },
    { key: 'grossProfit', label: 'Gross Profit', align: 'num', render: moneyFmt },
    { key: 'ebit',        label: 'EBIT',         align: 'num', render: moneyFmt },
    { key: 'netIncome',   label: 'Net Income',   align: 'num', render: moneyFmt },
  ];
  return tvTable(columns, rows);
}

/* EARNINGS — same avLiveCache[sym].earnings.quarterly avRenderEarnings() shows,
   falling back to fhGetLive(sym).earnings exactly as script.js does (~line 583) */
function tvFundEarnings(sym) {
  const avQ = (typeof avLiveCache !== 'undefined' && avLiveCache[sym]?.earnings?.quarterly) || [];
  const fhE = ((typeof fhGetLive === 'function') ? fhGetLive(sym)?.earnings : null) || [];
  const rows = avQ.length
    ? avQ.slice(0, 8).map(q => ({ period: q.quarter, est: q.epsEst, actual: q.epsActual, surprise: q.surprisePct, reportDate: q.reportDate }))
    : fhE.slice(0, 8).map(e => ({ period: e.period, est: e.epsEst, actual: e.epsActual, surprise: e.surprisePct, reportDate: e.period }));
  const columns = [
    { key: 'period',     label: 'Period' },
    { key: 'est',        label: 'EPS Est',    align: 'num', render: v => v != null ? Number(v).toFixed(2) : null },
    { key: 'actual',     label: 'EPS Actual', align: 'num', render: v => v != null ? Number(v).toFixed(2) : null },
    { key: 'surprise',   label: 'Surprise %', align: 'num', render: v => _tvPct(v) },
    { key: 'reportDate', label: 'Report Date' },
  ];
  return tvTable(columns, rows);
}

/* Picks the largest segment from an FMP revenue-segmentation record array
   (shape: [{ "<date>": { "<segment>": value, ... } }, ...] — same shape
   fmpRenderSegmentation's renderSegBlock() decodes) */
function _tvTopSegment(records) {
  if (!Array.isArray(records) || !records.length) return null;
  const latest = records[0];
  const date = Object.keys(latest || {})[0];
  const segs = latest && latest[date];
  if (!segs || typeof segs !== 'object') return null;
  const entries = Object.entries(segs).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a);
  if (!entries.length) return null;
  const total = entries.reduce((s, [, v]) => s + (v || 0), 0);
  const [name, val] = entries[0];
  return { name, pct: total > 0 ? (val / total * 100) : null };
}

/* VALUATION — same WACC inputs script.js's WACC computation block uses
   (window._treasuryYields['10Y'], window.DAMODARAN_ERP, fmpGetLive(sym).waccInputs
   — confirmed live shapes at script.js ~735-764), plus segmentation (stash #5) */
function tvFundValuation(sym) {
  const fmpLive = (typeof fmpGetLive === 'function') ? fmpGetLive(sym) : null;
  const waccInputs = fmpLive?.waccInputs;
  const ratios = fmpLive?.ratios;
  const ty  = (typeof window._treasuryYields !== 'undefined') ? window._treasuryYields : {};
  const seg = (window._tvDataCache && window._tvDataCache.segmentation) || {};
  const topProd = _tvTopSegment(seg.product);
  const topGeo  = _tvTopSegment(seg.geo);
  const rows = [
    { metric: 'Risk-Free Rate (10Y UST)',        value: ty['10Y'],              fmt: 'pctRaw' },
    { metric: 'Equity Risk Premium (Damodaran)', value: window.DAMODARAN_ERP,   fmt: 'pctRaw' },
    { metric: 'Pre-Tax Cost of Debt',            value: waccInputs?.kdPct,      fmt: 'pctRaw' },
    { metric: 'Effective Tax Rate',              value: waccInputs?.taxRatePct, fmt: 'pctRaw' },
    { metric: 'Debt / Equity',                   value: ratios?.debtEq,         fmt: 'dec2' },
    { metric: 'Top Revenue Segment',    value: topProd ? `${topProd.name} (${topProd.pct.toFixed(0)}%)` : null, fmt: 'raw' },
    { metric: 'Top Geographic Segment', value: topGeo  ? `${topGeo.name} (${topGeo.pct.toFixed(0)}%)`  : null, fmt: 'raw' },
  ];
  return tvTable(_tvMetricColumns(), rows);
}

/* FILINGS — same annual/quarterly/material SEC filings fmpRenderFilings() lists,
   exposed via the window._tvDataCache.filings stash added in fmp.js */
function tvFundFilings(sym) {
  const cached = (window._tvDataCache && window._tvDataCache.filings) || {};
  const rows = [...(cached.annuals || []), ...(cached.quarters || []), ...(cached.material || [])]
    .map(f => ({ form: f.form, entity: f.entity, filed: f.filed, period: f.period }))
    .sort((a, b) => String(b.filed || '').localeCompare(String(a.filed || '')))
    .slice(0, 15);
  const columns = [
    { key: 'form',   label: 'Form',   render: v => v ? _tvTag(v, 'neutral') : null },
    { key: 'entity', label: 'Entity' },
    { key: 'filed',  label: 'Filed' },
    { key: 'period', label: 'Period' },
  ];
  return tvTable(columns, rows);
}

/* ══════════════════════════════════════════════════════════════════
   ANALYSTS — entirely new window mirroring the UARS shell's actual
   tabs (OVERVIEW / MODEL 1 / MODEL 2 / MODEL 3 — uars-widget.js
   ~127-131), sourced via the window._tvDataCache.uars stash (#4)
   ══════════════════════════════════════════════════════════════════ */
function tvAnalystsOverview(sym) {
  const cached = (window._tvDataCache && window._tvDataCache.uars) || {};
  const r = cached.result || {};
  const rows = [
    { metric: 'Consensus Score',  value: r.consensus,              fmt: 'dec1' },
    { metric: 'Rating',           value: r.rating?.label,          fmt: 'signal' },
    { metric: 'Recommendation',   value: r.rating?.recommendation, fmt: 'signal' },
    { metric: 'Confidence',       value: r.confidence,             fmt: 'raw' },
    { metric: 'Macro Regime',     value: r.regime,                 fmt: 'raw' },
    { metric: 'Model 1 Score',    value: r.m1,                     fmt: 'dec1' },
    { metric: 'Model 2 Score',    value: r.m2,                     fmt: 'dec1' },
    { metric: 'Model 3 Score',    value: r.m3CAS,                  fmt: 'dec1' },
  ];
  return tvTable(_tvMetricColumns(), rows);
}
/* MODEL 1/2/3 — mirrors _renderModel1/_renderModel2/_renderModel3's actual
   formulas (uars-widget.js ~683-880): Model 1 = UScore (Q-multiplier ×
   contribution, final = m1), Model 2 = UARS (regime Λ-multiplier from the
   globally-exposed window.UARS.REGIME_MULT, final = m2), Model 3 = CAS
   (AS → penalty waterfall P_liq·P_tail·P_dq·P_struct → CAS). All fields
   come straight from the stashed result object — nothing fabricated. */
function tvAnalystsModel(modelKey) {
  const cached = (window._tvDataCache && window._tvDataCache.uars) || {};
  const r = cached.result || {};

  if (modelKey === 'model3') {
    const pen = r.penalties || {};
    const rows = [
      { metric: 'Aggregate Score (AS)',           value: r.m3AS,     fmt: 'dec1' },
      { metric: 'P_liq — Liquidity',               value: pen.liq,    fmt: 'dec2' },
      { metric: 'P_tail — Tail Risk',              value: pen.tail,   fmt: 'dec2' },
      { metric: 'P_dq — Data Quality',             value: pen.dq,     fmt: 'dec2' },
      { metric: 'P_struct — Structural',           value: pen.struct, fmt: 'dec2' },
      { metric: 'Composite Adjusted Score (CAS)',  value: r.m3CAS,    fmt: 'dec1' },
    ];
    return tvTable(_tvMetricColumns(), rows);
  }

  const useQ = modelKey === 'model1';
  const REGIME_MULT = (window.UARS && window.UARS.REGIME_MULT) || {};
  const regimeMults = REGIME_MULT[r.regime] || {};
  const adjW = r.adjWeights || {};
  const dims = Object.values(r.dimDetails || {});
  const rows = dims.map(d => {
    const adj  = adjW[d.id] ?? null;
    const mult = useQ ? (r.qualityMults?.[d.id] ?? 1.0) : (regimeMults[d.id] ?? 1.0);
    return {
      dimension: d.label,
      score: d.score,
      baseWeight: d.baseWeight != null ? d.baseWeight * 100 : null,
      adjWeight: adj != null ? adj * 100 : null,
      mult,
      contribution: (adj != null && d.score != null) ? adj * d.score * mult : null,
    };
  });
  const columns = [
    { key: 'dimension',    label: 'Dimension' },
    { key: 'score',        label: 'Score',     align: 'num', render: v => v != null ? Math.round(v) : null },
    { key: 'baseWeight',   label: 'Base Wt %', align: 'num', render: v => v != null ? v.toFixed(0) + '%' : null },
    { key: 'adjWeight',    label: 'Adj Wt %',  align: 'num', render: v => v != null ? v.toFixed(0) + '%' : null },
    { key: 'mult',         label: useQ ? 'Q Mult' : 'Λ Mult', align: 'num', render: v => v != null ? v.toFixed(2) : null },
    { key: 'contribution', label: 'Contrib',   align: 'num', render: v => v != null ? v.toFixed(1) : null },
  ];
  return tvTable(columns, rows);
}

/* COMPARABLES — entirely new window, peer table mirroring fhRenderComparables()
   (current ticker + up to 10 peers sorted by mkt-cap proximity — same
   fhGetLive(sym).peerData/.peerRatios/.profile/.quote, already global) */
function tvComparables(sym) {
  const fh = (typeof fhGetLive === 'function') ? fhGetLive(sym) : null;
  const peerData   = fh?.peerData   || [];
  const peerRatios = fh?.peerRatios || {};
  const mainProfile = fh?.profile || {};
  const mainQuote   = fh?.quote   || {};
  const mainMktCap  = mainProfile.mktCap || null;
  const sorted = [...peerData]
    .sort((a, b) => mainMktCap ? Math.abs((a.mktCap || 0) - mainMktCap) - Math.abs((b.mktCap || 0) - mainMktCap) : 0)
    .slice(0, 10);
  const fmpMain = (typeof fmpGetLive === 'function') ? fmpGetLive(sym)?.ratios : null;
  const rows = [
    { ticker: sym, name: mainProfile.name || sym, mktCap: mainMktCap, sector: mainProfile.sector,
      price: mainQuote.price, change: mainQuote.changePct ?? mainQuote.change, ratios: fmpMain },
    ...sorted.map(p => ({ ticker: p.ticker, name: p.name, mktCap: p.mktCap, sector: p.sector,
      price: p.price, change: p.change, ratios: peerRatios[String(p.ticker || '').toUpperCase()] || null })),
  ];
  const columns = [
    { key: 'ticker',   label: 'Ticker',  render: v => _tvTicker(v) },
    { key: 'name',     label: 'Company' },
    { key: 'mktCap',   label: 'Mkt Cap', align: 'num', render: v => v != null ? ((typeof fmtB === 'function') ? fmtB(v) : ('$' + _tvNum(v, 0))) : null },
    { key: 'sector',   label: 'Sector' },
    { key: 'price',    label: 'Price',   align: 'num', render: v => v != null ? '$' + _tvNum(v) : null },
    { key: 'change',   label: 'Chg %',   align: 'num', render: v => _tvPct(v) },
    { key: 'pe',       label: 'P/E',     align: 'num', render: (_, row) => row.ratios?.pe != null ? Number(row.ratios.pe).toFixed(1) : null },
    { key: 'pb',       label: 'P/B',     align: 'num', render: (_, row) => row.ratios?.pb != null ? Number(row.ratios.pb).toFixed(2) : null },
    { key: 'roe',      label: 'ROE',     align: 'num', render: (_, row) => row.ratios?.roe != null ? Number(row.ratios.roe).toFixed(1) + '%' : null },
    { key: 'divYield', label: 'Div Yld', align: 'num', render: (_, row) => row.ratios?.divYield != null ? Number(row.ratios.divYield).toFixed(2) + '%' : null },
  ];
  return tvTable(columns, rows);
}

/* ── Alert Feed — Congress / NOAA / EONET (parity for the "Alert Feed" panel) */
function tvAlertCongress() {
  const cached = (window._tvDataCache && window._tvDataCache.congress) || null;
  const trades = (cached && cached.dash && cached.dash.recentTrades) || [];
  const rows = trades.slice(0, 30).map(t => ({
    date: _tvDateSafe(t.tradeDate), ticker: t.ticker, company: t.companyName,
    member: t.memberName, chamber: t.memberChamber,
    type: t.tradeType, amount: t.amount && t.amount.label,
  }));
  const columns = [
    { key: 'date',    label: 'Date' },
    { key: 'ticker',  label: 'Ticker', render: v => _tvTicker(v) },
    { key: 'company', label: 'Company' },
    { key: 'member',  label: 'Member' },
    { key: 'chamber', label: 'Chamber' },
    { key: 'type',    label: 'Type', render: v => _tvTag(v, /purchase/i.test(v||'') ? 'pos' : /sale/i.test(v||'') ? 'neg' : 'neutral') },
    { key: 'amount',  label: 'Amount' },
  ];
  return tvTable(columns, rows);
}

function tvAlertNoaa() {
  const features = (window._tvDataCache && window._tvDataCache.noaa) || [];
  const rows = features.slice(0, 30).map(f => {
    const p = f.properties || {};
    return { severity: p.severity, event: p.event, area: p.areaDesc, urgency: p.urgency, sent: _tvTime(p.sent) };
  });
  const columns = [
    { key: 'severity', label: 'Severity', render: v => v ? _tvTag(v, /extreme|severe/i.test(v) ? 'neg' : /moderate/i.test(v) ? 'warn' : 'neutral') : null },
    { key: 'event',    label: 'Event' },
    { key: 'area',     label: 'Area' },
    { key: 'urgency',  label: 'Urgency' },
    { key: 'sent',     label: 'Sent' },
  ];
  return tvTable(columns, rows);
}

const _TV_EONET_TYPES = { EQ:'Earthquake', TC:'Tropical Cyclone', FL:'Flood', VO:'Volcano', WF:'Wildfire', DR:'Drought', LS:'Landslide', OTHER:'Event' };

function _tvEonetCountry(list) {
  const c = Array.isArray(list) ? list[0] : null;
  if (!c) return null;
  return typeof c === 'object' ? (c.countryname || c.iso3 || null) : c;
}

function tvAlertEonet() {
  const features = (window._tvDataCache && window._tvDataCache.eonet) || [];
  const rows = features.slice(0, 30).map(f => {
    const p = f.properties || {};
    return {
      type: _TV_EONET_TYPES[p.eventtype] || p.eventtype || 'Event',
      event: p.name, alert: p.alertlevel || p.severity,
      country: _tvEonetCountry(p.affectedcountries),
      date: _tvDateSafe(p.fromdate),
    };
  });
  const columns = [
    { key: 'type',    label: 'Type' },
    { key: 'event',   label: 'Event' },
    { key: 'alert',   label: 'Alert', render: v => v ? _tvTag(v, /red|severe|extreme/i.test(v) ? 'neg' : /orange|moderate/i.test(v) ? 'warn' : 'neutral') : null },
    { key: 'country', label: 'Country' },
    { key: 'date',    label: 'Date' },
  ];
  return tvTable(columns, rows);
}

/* ── Supply Chain — Shipping / Minerals (Chokepoints reuses tvGeoRoutes) */
function tvSupplyShipping() {
  const routes = (window._tvDataCache && window._tvDataCache.shippingRates) || [];
  const rows = routes.map(r => ({ route: r.route, rate: r.rate, unit: r.unit, note: r.note }));
  const columns = [
    { key: 'route', label: 'Route' },
    { key: 'rate',  label: 'Rate', align: 'num', render: v => v != null ? '$' + _tvNum(v, 0) : null },
    { key: 'unit',  label: 'Unit' },
    { key: 'note',  label: 'Note' },
  ];
  return tvTable(columns, rows);
}

function tvSupplyMinerals() {
  const cached = (window._tvDataCache && window._tvDataCache.minerals) || null;
  const minerals = (cached && cached.minerals) || [];
  const sorted = [...minerals].sort((a, b) => (b.importReliance || 0) - (a.importReliance || 0));
  const rows = sorted.slice(0, 30).map(m => ({
    name: m.name, sym: m.symbol,
    reliance: m.importReliance,
    producers: Array.isArray(m.primaryProducers) ? m.primaryProducers.slice(0, 3).join(', ') : (m.primaryProducers || null),
    source: m._live ? 'LIVE' : 'STATIC',
  }));
  const columns = [
    { key: 'name',      label: 'Mineral' },
    { key: 'sym',       label: 'Sym' },
    { key: 'reliance',  label: 'US Import Reliance', align: 'num', render: v => v != null ? Number(v).toFixed(0) + '%' : null },
    { key: 'producers', label: 'Top Producers' },
    { key: 'source',    label: 'Source', render: v => _tvTag(v, v === 'LIVE' ? 'pos' : 'neutral') },
  ];
  return tvTable(columns, rows);
}

/* ── Portfolio P&L — summary metrics + positions table (parity for "Portfolio P&L") */
function tvPortfolio() {
  const cached = (window._tvDataCache && window._tvDataCache.portfolio) || null;
  let html = '';
  if (cached) {
    const summaryRows = [
      { metric: 'Portfolio Value', value: cached.totalVal,    fmt: 'cap' },
      { metric: 'Total Cost Basis', value: cached.totalCost,  fmt: 'cap' },
      { metric: 'Total P&L',       value: cached.totalPnl,    fmt: 'cap' },
      { metric: 'Total P&L %',     value: cached.totalPnlPct, fmt: 'pct' },
      { metric: 'Sharpe',          value: cached.sharpe,      fmt: 'dec2' },
      { metric: 'Sortino',         value: cached.sortino,     fmt: 'dec2' },
      { metric: 'Max Drawdown',    value: cached.maxDD,       fmt: 'pct' },
      { metric: 'Annualized Vol',  value: cached.annVol,      fmt: 'pctRaw' },
    ];
    html += tvTable(_tvMetricColumns(), summaryRows);
  }
  const positions = (cached && cached.positions) || [];
  const rows = positions.map(p => ({
    ticker: p.sym || p.ticker, shares: p.shares, avgCost: p.costBasis, price: p.price,
    value: p.curVal, pnl: p.pnl, pnlPct: p.pnlPct,
  }));
  const columns = [
    { key: 'ticker',  label: 'Ticker', render: v => _tvTicker(v) },
    { key: 'shares',  label: 'Shares', align: 'num' },
    { key: 'avgCost', label: 'Avg Cost', align: 'num', render: v => v != null ? '$' + _tvNum(v) : null },
    { key: 'price',   label: 'Price', align: 'num', render: v => v != null ? '$' + _tvNum(v) : null },
    { key: 'value',   label: 'Value', align: 'num', render: v => v != null ? '$' + _tvNum(v, 0) : null },
    { key: 'pnl',     label: 'P&L', align: 'num', render: v => v != null ? _tvTag((v >= 0 ? '+' : '') + '$' + _tvNum(v, 0), v >= 0 ? 'pos' : 'neg') : null },
    { key: 'pnlPct',  label: 'P&L %', align: 'num', render: v => v != null ? _tvPct(v * 100) : null },
  ];
  return html + tvTable(columns, rows);
}

/* ── Stock Screener (mirrors screenerRenderResults columns) */
function tvScreenerResults() {
  const results = (window._tvDataCache && window._tvDataCache.screener) || [];
  const rows = results.slice(0, 30).map(r => ({
    ticker: r.symbol, name: r.name, sector: r.sector, price: r.price, mktCap: r.marketCap,
    pe: r.pe, roe: r.roe, netMargin: r.netMargin, debtEq: r.debtEq, divYield: r.dividendYield,
    fScore: r._piotroski, score: r._score,
  }));
  const columns = [
    { key: 'ticker',    label: 'Ticker', render: v => _tvTicker(v) },
    { key: 'name',      label: 'Company' },
    { key: 'sector',    label: 'Sector' },
    { key: 'price',     label: 'Price', align: 'num', render: v => v != null ? '$' + _tvNum(v) : null },
    { key: 'mktCap',    label: 'Mkt Cap', align: 'num', render: v => v != null ? ((typeof fmtB === 'function') ? fmtB(v) : ('$' + _tvNum(v, 0))) : null },
    { key: 'pe',        label: 'P/E', align: 'num', render: v => v != null ? Number(v).toFixed(1) : null },
    { key: 'roe',       label: 'ROE', align: 'num', render: v => v != null ? _tvPct(v) : null },
    { key: 'netMargin', label: 'Net Mgn', align: 'num', render: v => v != null ? _tvPct(v) : null },
    { key: 'debtEq',    label: 'D/E', align: 'num', render: v => v != null ? Number(v).toFixed(2) : null },
    { key: 'divYield',  label: 'Div %', align: 'num', render: v => v != null ? _tvPct(v) : null },
    { key: 'fScore',    label: 'F-Score', align: 'num', render: v => v != null ? v + '/9' : null },
    { key: 'score',     label: 'Score', align: 'num' },
  ];
  return tvTable(columns, rows);
}

/* ── Webhook Log — extends Alerts Blotter with the LOG tab (whLog is cross-script reachable) */
function tvWebhookLog() {
  const log = (typeof whLog !== 'undefined' && whLog) || [];
  const rows = log.slice(0, 25).map(e => ({
    time: _tvTime(e.time), ticker: e.ticker, condition: e.condition, value: e.value,
    status: e.status,
  }));
  const columns = [
    { key: 'time',      label: 'Time' },
    { key: 'ticker',    label: 'Asset', render: v => _tvTicker(v) },
    { key: 'condition', label: 'Trigger' },
    { key: 'value',     label: 'Value', align: 'num' },
    { key: 'status',    label: 'Status', render: v => _tvTag(String(v), /^(2|ok|sent|test)/i.test(String(v||'')) ? 'pos' : 'neg') },
  ];
  return tvTable(columns, rows);
}

/* ══════════════════════════════════════════════════════════════════
   GEO-RISK — 8 additional tabs for full parity with panel-geopolitical
   (INTEL/SIGNALS/QUAKES/GPS JAM/MIL·OPS/FEMA/TERROR/CYBER), each reading
   the window._tvDataCache.<key> stash added to its source render fn.
   ══════════════════════════════════════════════════════════════════ */
function tvGeoIntel() {
  const cached = (window._tvDataCache && window._tvDataCache.geoIntel) || {};
  const rows = [];
  (cached.hotspots || []).slice(0, 12).forEach(h => rows.push({
    source: 'Instability Index', item: `${h.flag || ''} ${h.iso2 || ''}`.trim() || null,
    detail: h.score != null ? `Risk score ${h.score}` : null, date: null,
  }));
  (cached.headlines || []).slice(0, 10).forEach(h => rows.push({
    source: 'Bloomberg', item: h.title, detail: h.link ? 'Headline' : null,
    date: _tvDateSafe(h.pubDate),
  }));
  const columns = [
    { key: 'source', label: 'Source', render: v => v ? _tvTag(v, 'neutral') : null },
    { key: 'item',   label: 'Item / Headline' },
    { key: 'detail', label: 'Detail' },
    { key: 'date',   label: 'Date' },
  ];
  return tvTable(columns, rows);
}

function tvGeoSignals() {
  const signals = (window._tvDataCache && window._tvDataCache.geoSignals) || [];
  const rows = signals.slice(0, 25).map(s => ({
    date: _tvDateSafe(s.pubDate), severity: (s.sev || '').toUpperCase() || null,
    category: s.cat, headline: s.title,
  }));
  const columns = [
    { key: 'date',     label: 'Date' },
    { key: 'severity', label: 'Severity', render: v => v ? _tvTag(v, /high|critical/i.test(v) ? 'neg' : /med/i.test(v) ? 'warn' : 'pos') : null },
    { key: 'category', label: 'Category', render: v => v ? _tvTag(v, 'neutral') : null },
    { key: 'headline', label: 'Headline', render: v => v
        ? `<span title="${escapeHtml(String(v))}">${escapeHtml(String(v).length > 80 ? String(v).slice(0, 77) + '…' : v)}</span>` : null },
  ];
  return tvTable(columns, rows);
}

function tvGeoQuakes() {
  const quakes = (window._tvDataCache && window._tvDataCache.quakes) || [];
  const rows = quakes.map(q => ({ mag: q.mag, place: q.place, depth: q.depth, time: _tvTime(q.time) }));
  const columns = [
    { key: 'mag',   label: 'Mag', align: 'num', render: v => v != null ? _tvTag(Number(v).toFixed(1), Number(v) >= 6 ? 'neg' : Number(v) >= 5 ? 'warn' : 'neutral') : null },
    { key: 'place', label: 'Location' },
    { key: 'depth', label: 'Depth (km)', align: 'num', render: v => v != null ? Number(v).toFixed(1) : null },
    { key: 'time',  label: 'Time' },
  ];
  return tvTable(columns, rows);
}

function tvGeoGpsJam() {
  const zones = (window._tvDataCache && window._tvDataCache.gpsJam) || [];
  const rows = zones.map(z => ({
    severity: (z.severity || '').toUpperCase() || null, region: z.region, description: z.description,
  }));
  const columns = [
    { key: 'severity',    label: 'Severity', render: v => v ? _tvTag(v, v === 'HIGH' ? 'neg' : v === 'MEDIUM' ? 'warn' : 'pos') : null },
    { key: 'region',      label: 'Region' },
    { key: 'description', label: 'Description' },
  ];
  return tvTable(columns, rows);
}

function tvGeoMilOps() {
  const cached = (window._tvDataCache && window._tvDataCache.milOps) || {};
  const groups = cached.groups || {};
  const rows = [];
  Object.entries(groups).forEach(([type, flights]) => {
    (flights || []).slice(0, 12).forEach(a => rows.push({
      type, callsign: (a.flight || a.r || '').trim() || null, desc: a.desc || a.t || null,
      altitude: typeof a.alt_baro === 'number' ? a.alt_baro : null,
      speed: a.gs != null ? Math.round(a.gs) : null,
    }));
  });
  const columns = [
    { key: 'type',     label: 'Class', render: v => v ? _tvTag(v, 'neutral') : null },
    { key: 'callsign', label: 'Callsign' },
    { key: 'desc',     label: 'Aircraft' },
    { key: 'altitude', label: 'Alt (ft)', align: 'num', render: v => v != null ? _tvNum(v, 0) : null },
    { key: 'speed',    label: 'Spd (kts)', align: 'num', render: v => v != null ? _tvNum(v, 0) : null },
  ];
  return tvTable(columns, rows);
}

/* FEMA tab in the dashboard merges OpenFEMA US declarations + GDACS global
   disasters into one view (see geo-fema-content / geo-gdacs-content) — same here */
function tvGeoFema() {
  const recs  = (window._tvDataCache && window._tvDataCache.fema)  || [];
  const gdacs = (window._tvDataCache && window._tvDataCache.gdacs) || [];
  const rows = [];
  recs.slice(0, 20).forEach(r => rows.push({
    source: 'OpenFEMA', date: _tvDateSafe(r.declarationDate), region: r.state,
    type: r.disasterType, event: r.declarationTitle, alert: null,
  }));
  gdacs.slice(0, 20).forEach(g => rows.push({
    source: 'GDACS', date: _tvDateSafe(g.pubDate), region: g.country,
    type: g.eventType, event: g.title, alert: g.alertLevel,
  }));
  rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const columns = [
    { key: 'source', label: 'Source', render: v => _tvTag(v, 'neutral') },
    { key: 'date',   label: 'Date' },
    { key: 'region', label: 'Region / State' },
    { key: 'type',   label: 'Type' },
    { key: 'event',  label: 'Event', render: v => v
        ? `<span title="${escapeHtml(String(v))}">${escapeHtml(String(v).length > 60 ? String(v).slice(0, 57) + '…' : v)}</span>` : null },
    { key: 'alert',  label: 'Alert', render: v => v ? _tvTag(v, /red/i.test(v) ? 'neg' : /orange/i.test(v) ? 'warn' : 'pos') : null },
  ];
  return tvTable(columns, rows);
}

function tvGeoTerror() {
  const articles = (window._tvDataCache && window._tvDataCache.terror) || [];
  const rows = articles.slice(0, 25).map(a => ({
    date: _tvDateSafe(a.seendate), category: a.cat, country: a.sourcecountry,
    headline: a.title, source: a.domain,
  }));
  const columns = [
    { key: 'date',     label: 'Date' },
    { key: 'category', label: 'Category', render: v => v ? _tvTag(v, v === 'TERROR' ? 'neg' : 'neutral') : null },
    { key: 'country',  label: 'Country' },
    { key: 'headline', label: 'Headline', render: v => v
        ? `<span title="${escapeHtml(String(v))}">${escapeHtml(String(v).length > 80 ? String(v).slice(0, 77) + '…' : v)}</span>` : null },
    { key: 'source',   label: 'Source Domain' },
  ];
  return tvTable(columns, rows);
}

function tvGeoCyber() {
  const cached = (window._tvDataCache && window._tvDataCache.cyber) || {};
  const vulns = cached.vulns || [];
  const articles = cached.cyberArticles || [];
  const rows = [];
  [...vulns].sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || '')).slice(0, 18).forEach(v => rows.push({
    type: 'KEV', date: _tvDateSafe(v.dateAdded), item: `${v.vendorProject || ''} ${v.product || ''}`.trim() || v.cveID,
    detail: v.vulnerabilityName, ransomware: v.knownRansomwareCampaignUse === 'Known' ? 'YES' : null,
  }));
  articles.slice(0, 12).forEach(a => rows.push({
    type: 'NEWS', date: _tvDateSafe(a.seendate), item: a.domain, detail: a.title, ransomware: null,
  }));
  const columns = [
    { key: 'type',       label: 'Type', render: v => _tvTag(v, v === 'KEV' ? 'warn' : 'neutral') },
    { key: 'date',       label: 'Date' },
    { key: 'item',       label: 'Vendor / Source' },
    { key: 'detail',     label: 'Detail', render: v => v
        ? `<span title="${escapeHtml(String(v))}">${escapeHtml(String(v).length > 70 ? String(v).slice(0, 67) + '…' : v)}</span>` : null },
    { key: 'ransomware', label: 'Ransomware', render: v => v ? _tvTag(v, 'neg') : null },
  ];
  return tvTable(columns, rows);
}

/* ══════════════════════════════════════════════════════════════════
   SUPPLY CHAIN — 5 additional tabs for parity with panel-supply
   (FLIGHTS/ENERGY/WEATHER/AGRI/COT)
   ══════════════════════════════════════════════════════════════════ */
function tvSupplyFlights() {
  const cached = (window._tvDataCache && window._tvDataCache.flights) || {};
  const rows = (cached.regionCounts || []).map(r => ({
    region: `${r.emoji || ''} ${r.name || ''}`.trim() || null, count: r.count,
  }));
  const columns = [
    { key: 'region', label: 'Region' },
    { key: 'count',  label: 'Sorties Tracked', align: 'num', render: v => v != null ? _tvNum(v, 0) : null },
  ];
  return tvTable(columns, rows);
}

function tvSupplyEnergy() {
  const cached = (window._tvDataCache && window._tvDataCache.energy) || {};
  const rows = (cached.priceCards || []).map(c => ({
    name: `${c.icon || ''} ${c.name || ''}`.trim() || null, price: c.val, unit: c.unit,
    chg: c.chg, source: c.src,
  }));
  const columns = [
    { key: 'name',   label: 'Benchmark' },
    { key: 'price',  label: 'Price' },
    { key: 'unit',   label: 'Unit' },
    { key: 'chg',    label: 'Chg', align: 'num', render: v => (v != null && v !== 0) ? _tvPct(v) : null },
    { key: 'source', label: 'Source', render: v => v ? _tvTag(v, 'neutral') : null },
  ];
  return tvTable(columns, rows);
}

function tvSupplyWeather() {
  const locs = (window._tvDataCache && window._tvDataCache.supplyWeather) || [];
  const rows = locs.map(l => {
    const c = l.current || {};
    return {
      location: `${l.emoji || ''} ${l.name || ''}`.trim() || null,
      temp: c.temperature_2m, precip: c.precipitation, wind: c.wind_speed_10m,
    };
  });
  const columns = [
    { key: 'location', label: 'Location' },
    { key: 'temp',     label: 'Temp (°C)',   align: 'num', render: v => v != null ? Number(v).toFixed(1) : null },
    { key: 'precip',   label: 'Precip (mm)', align: 'num', render: v => v != null ? Number(v).toFixed(1) : null },
    { key: 'wind',     label: 'Wind (km/h)', align: 'num', render: v => v != null ? Number(v).toFixed(1) : null },
  ];
  return tvTable(columns, rows);
}

function tvSupplyAgri() {
  const cached = (window._tvDataCache && window._tvDataCache.agri) || {};
  const rows = [];
  (cached.fao || []).forEach(d => rows.push({
    source: 'FAO FPI', name: d.name, value: typeof d.value === 'number' ? d.value.toFixed(1) : d.value,
    change: d.change ? parseFloat(String(d.change).replace(/[^0-9.\-]/g, '')) : null, date: d.date,
  }));
  (cached.wbAgri || []).forEach(c => rows.push({
    source: 'World Bank', name: c.name, value: c.latest != null ? Number(c.latest).toFixed(2) : null,
    change: (c.prev && c.latest) ? ((c.latest - c.prev) / c.prev * 100) : null, date: c.date,
  }));
  const columns = [
    { key: 'source', label: 'Source', render: v => _tvTag(v, 'neutral') },
    { key: 'name',   label: 'Indicator' },
    { key: 'value',  label: 'Value', align: 'num' },
    { key: 'change', label: 'Chg', align: 'num', render: v => v != null ? _tvPct(v) : null },
    { key: 'date',   label: 'Date' },
  ];
  return tvTable(columns, rows);
}

function tvSupplyCOT() {
  const cached = (window._tvDataCache && window._tvDataCache.cot) || {};
  const cotData = cached.cotData || {};
  const rows = Object.entries(cached.links || {}).map(([name, code]) => {
    const latest = cotData?.[code]?.[0];
    const net = latest ? latest.longAll - latest.shortAll : null;
    return { contract: name, net, openInterest: latest ? latest.openInterest : null, date: latest ? latest.date : null };
  });
  const columns = [
    { key: 'contract',     label: 'Contract' },
    { key: 'net',          label: 'Net Spec Position', align: 'num', render: v => v != null ? _tvTag((v > 0 ? '+' : '') + _tvNum(v, 0), v > 0 ? 'pos' : v < 0 ? 'neg' : 'neutral') : null },
    { key: 'openInterest', label: 'Open Interest', align: 'num', render: v => v != null ? _tvNum(v, 0) : null },
    { key: 'date',         label: 'Report Date' },
  ];
  return tvTable(columns, rows);
}

/* ══════════════════════════════════════════════════════════════════
   MACRO MONITOR — 6 additional tabs + a dedicated YIELD view, for
   full parity with panel-macro (SIGNALS/COMMODITIES/RISK/PREDICTIONS/
   YIELD/ECON CAL/CRYPTO/FLOWS). The existing flat tvMacroMonitor()
   becomes the SIGNALS tab unchanged.
   ══════════════════════════════════════════════════════════════════ */
function tvMacroYield() {
  const yields = window._treasuryYields || {};
  const order = ['1M','3M','6M','1Y','2Y','3Y','5Y','7Y','10Y','20Y','30Y'];
  const rows = order.filter(k => yields[k] != null).map(k => ({ tenor: k, value: yields[k], note: 'Treasury yield' }));
  (window._tvDataCache?.fredSpreads || []).forEach(p => rows.push({ tenor: p.label, value: p.value, note: p.note }));
  const columns = [
    { key: 'tenor', label: 'Tenor / Spread' },
    { key: 'value', label: 'Value (%)', align: 'num', render: v => v != null ? Number(v).toFixed(2) : null },
    { key: 'note',  label: 'Note' },
  ];
  return tvTable(columns, rows);
}

function tvMacroCommodities() {
  const grouped = (window._tvDataCache && window._tvDataCache.imfComm) || {};
  const catLabels = { index: 'Indices', energy: 'Energy', metals: 'Metals', agri: 'Agriculture', fertilizers: 'Fertilizers' };
  const rows = [];
  Object.entries(grouped).forEach(([cat, items]) => {
    (items || []).forEach(d => {
      const v = d.latest ?? d.value;
      const chg = (d.prev && v) ? ((v - d.prev) / d.prev * 100) : null;
      rows.push({ category: catLabels[cat] || cat, name: d.name, value: v, change: chg, unit: d.unit, date: d.date });
    });
  });
  const columns = [
    { key: 'category', label: 'Category', render: v => v ? _tvTag(v, 'neutral') : null },
    { key: 'name',     label: 'Commodity' },
    { key: 'value',    label: 'Value', align: 'num', render: v => v != null ? Number(v).toFixed(2) : null },
    { key: 'change',   label: 'Chg', align: 'num', render: v => v != null ? _tvPct(v) : null },
    { key: 'unit',     label: 'Unit' },
    { key: 'date',     label: 'Date' },
  ];
  return tvTable(columns, rows);
}

function tvMacroRiskTab() {
  const cached = (window._tvDataCache && window._tvDataCache.macroRisk) || {};
  const rows = [];
  (cached.fredData || []).forEach(f => {
    const chg = (f.value != null && f.prev != null) ? (f.value - f.prev) : null;
    rows.push({ category: 'Market Risk (FRED)', name: f.label, value: f.value, change: chg, note: f.unit });
  });
  (cached.countries || []).slice(0, 20).forEach(c => rows.push({
    category: 'Country Risk', name: `${c.flag || ''} ${c.name || ''}`.trim() || null,
    value: c.score, change: null, note: `${(c.tier || '').toUpperCase()}${c.note ? ' · ' + c.note : ''}`,
  }));
  const columns = [
    { key: 'category', label: 'Category', render: v => _tvTag(v, 'neutral') },
    { key: 'name',     label: 'Indicator / Country' },
    { key: 'value',    label: 'Value / Score', align: 'num', render: v => v != null ? Number(v).toFixed(2) : null },
    { key: 'change',   label: 'Chg', align: 'num', render: v => v != null ? Number(v).toFixed(2) : null },
    { key: 'note',     label: 'Unit / Tier · Note' },
  ];
  return tvTable(columns, rows);
}

function tvMacroPredictions() {
  const markets = (window._tvDataCache && window._tvDataCache.predictions) || [];
  const rows = markets.slice(0, 25).map(m => ({
    question: m.question, probability: m.prob, volume: m.volume, category: m.category, end: _tvDateSafe(m.endDate),
  }));
  const columns = [
    { key: 'question',    label: 'Market Question', render: v => v
        ? `<span title="${escapeHtml(String(v))}">${escapeHtml(String(v).length > 70 ? String(v).slice(0, 67) + '…' : v)}</span>` : null },
    { key: 'probability', label: 'Prob.', align: 'num', render: v => v != null ? Number(v).toFixed(0) + '%' : null },
    { key: 'volume',      label: 'Volume', align: 'num', render: v => v != null ? '$' + _tvNum(v, 0) : null },
    { key: 'category',    label: 'Category', render: v => v ? _tvTag(v, 'neutral') : null },
    { key: 'end',         label: 'Closes' },
  ];
  return tvTable(columns, rows);
}

function tvEconCalendar() {
  const events = (window._tvDataCache && window._tvDataCache.econCalendar) || [];
  const rows = events.slice(0, 40).map(ev => ({
    date: _tvTime(ev.date), country: ev.country, impact: ev.impact,
    title: ev.title || ev.name, actual: ev.actual, forecast: ev.forecast, previous: ev.previous,
  }));
  const columns = [
    { key: 'date',     label: 'Time' },
    { key: 'country',  label: 'Currency' },
    { key: 'impact',   label: 'Impact', render: v => v ? _tvTag(v, /high/i.test(v) ? 'neg' : /medium/i.test(v) ? 'warn' : 'neutral') : null },
    { key: 'title',    label: 'Event' },
    { key: 'actual',   label: 'Actual',   align: 'num' },
    { key: 'forecast', label: 'Forecast', align: 'num' },
    { key: 'previous', label: 'Previous', align: 'num' },
  ];
  return tvTable(columns, rows);
}

function tvMacroCrypto() {
  const cached = (window._tvDataCache && window._tvDataCache.crypto) || {};
  const rows = (cached.coins || []).slice(0, 20).map(c => ({
    rank: c.market_cap_rank, sym: (c.symbol || '').toUpperCase(), name: c.name,
    price: c.current_price, chg24h: c.price_change_percentage_24h, mktCap: c.market_cap,
  }));
  const columns = [
    { key: 'rank',   label: '#', align: 'num' },
    { key: 'sym',    label: 'Sym', render: v => _tvTicker(v) },
    { key: 'name',   label: 'Name' },
    { key: 'price',  label: 'Price', align: 'num', render: v => v != null ? '$' + _tvNum(v, v < 1 ? 4 : 2) : null },
    { key: 'chg24h', label: '24h %', align: 'num', render: v => v != null ? _tvPct(v) : null },
    { key: 'mktCap', label: 'Mkt Cap', align: 'num', render: v => v != null ? '$' + _tvNum(v, 0) : null },
  ];
  return tvTable(columns, rows);
}

function tvMacroEtfFlows() {
  const items = (window._tvDataCache && window._tvDataCache.etfFlows) || [];
  const rows = items.slice(0, 30).map(f => ({
    sym: f.sym, name: f.name, category: f.cat, price: f.price, chg: f.chgPct, volume: f.volume,
  }));
  const columns = [
    { key: 'sym',      label: 'Sym', render: v => _tvTicker(v) },
    { key: 'name',     label: 'Name' },
    { key: 'category', label: 'Category', render: v => v ? _tvTag(v, 'neutral') : null },
    { key: 'price',    label: 'Price', align: 'num', render: v => v != null ? '$' + Number(v).toFixed(2) : null },
    { key: 'chg',      label: 'Chg %', align: 'num', render: v => v != null ? _tvPct(v) : null },
    { key: 'volume',   label: 'Volume', align: 'num', render: v => v != null ? _tvNum(v, 0) : null },
  ];
  return tvTable(columns, rows);
}

/* ══════════════════════════════════════════════════════════════════
   ORCHESTRATOR — builds the workspace grid from the mappers above
   ══════════════════════════════════════════════════════════════════ */
/* Builds a tabs[]/body pair for a tabbed window from {key,label,body()} defs,
   reading/driving the active tab through _tvGetActiveTab/tvSwitchTab so the
   selection survives the 15s auto-refresh re-render. */
function _tvTabbed(winId, defaultKey, defs) {
  const active = _tvGetActiveTab(winId, defaultKey);
  const current = defs.find(d => d.key === active) || defs[0];
  return {
    tabs: defs.map(d => ({ key: d.key, label: d.label, active: d.key === active })),
    body: current.body(),
  };
}

function renderTerminalView() {
  const root = document.getElementById('terminalView');
  if (!root) return;

  const sym = String((typeof currentTicker !== 'undefined' && currentTicker) || '').replace(/.*:/, '').toUpperCase();
  const stamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  const watchCount = ((typeof currentWatchlistStocks !== 'undefined' && currentWatchlistStocks) || []).length;
  const alertCount = ((typeof whAlerts !== 'undefined' && whAlerts) || []).length;

  /* Detach the live chart window before the innerHTML rebuild wipes it —
     keeps its lightweight-charts instances/websocket alive in memory. */
  const _tvChartWin = document.getElementById('tv-window-priceChart');
  if (_tvChartWin) _tvChartWin.remove();
  const freeLayout = window.innerWidth >= 1024;

  const news = _tvTabbed('news', 'news', [
    { key: 'news',  label: 'NEWS',  body: () => tvIntelligenceBlotter() },
    { key: 'intel', label: 'INTEL', body: () => tvNewsIntel() },
  ]);
  const geoRisk = _tvTabbed('geoRisk', 'wars', [
    { key: 'wars',      label: 'WARS',      body: () => tvRiskMatrix() },
    { key: 'resources', label: 'RESOURCES', body: () => tvGeoResources() },
    { key: 'routes',    label: 'ROUTES',    body: () => tvGeoRoutes() },
    { key: 'intel',     label: 'INTEL',     body: () => tvGeoIntel() },
    { key: 'signals',   label: 'SIGNALS',   body: () => tvGeoSignals() },
    { key: 'quakes',    label: 'QUAKES',    body: () => tvGeoQuakes() },
    { key: 'gpsjam',    label: 'GPS JAM',   body: () => tvGeoGpsJam() },
    { key: 'milops',    label: 'MIL·OPS',   body: () => tvGeoMilOps() },
    { key: 'fema',      label: 'FEMA',      body: () => tvGeoFema() },
    { key: 'terror',    label: 'TERROR',    body: () => tvGeoTerror() },
    { key: 'cyber',     label: 'CYBER',     body: () => tvGeoCyber() },
  ]);
  const ownership = _tvTabbed('ownership', 'hds', [
    { key: 'hds',   label: 'HDS',    body: () => tvOwnershipTable() },
    { key: 'mgmt',  label: 'MGMT',   body: () => tvOwnershipMgmt(sym) },
    { key: 'pscbo', label: 'PSC-BO', body: () => tvOwnershipPSC() },
  ]);
  const fundamentals = _tvTabbed('fundamentals', 'overview', [
    { key: 'overview',   label: 'OVERVIEW',   body: () => tvFundOverview(sym) },
    { key: 'financials', label: 'FINANCIALS', body: () => tvFundFinancials(sym) },
    { key: 'earnings',   label: 'EARNINGS',   body: () => tvFundEarnings(sym) },
    { key: 'valuation',  label: 'VALUATION',  body: () => tvFundValuation(sym) },
    { key: 'filings',    label: 'FILINGS',    body: () => tvFundFilings(sym) },
  ]);
  const analysts = _tvTabbed('analysts', 'overview', [
    { key: 'overview', label: 'OVERVIEW', body: () => tvAnalystsOverview(sym) },
    { key: 'model1',   label: 'MODEL 1',  body: () => tvAnalystsModel('model1') },
    { key: 'model2',   label: 'MODEL 2',  body: () => tvAnalystsModel('model2') },
    { key: 'model3',   label: 'MODEL 3',  body: () => tvAnalystsModel('model3') },
  ]);
  const alertFeed = _tvTabbed('alertFeed', 'congress', [
    { key: 'congress', label: 'CONGRESS', body: () => tvAlertCongress() },
    { key: 'noaa',     label: 'NOAA',     body: () => tvAlertNoaa() },
    { key: 'eonet',    label: 'EONET',    body: () => tvAlertEonet() },
  ]);
  const supplyChain = _tvTabbed('supplyChain', 'choke', [
    { key: 'choke',    label: 'CHOKE',    body: () => tvGeoRoutes() },
    { key: 'shipping', label: 'SHIPPING', body: () => tvSupplyShipping() },
    { key: 'minerals', label: 'MINERALS', body: () => tvSupplyMinerals() },
    { key: 'flights',  label: 'FLIGHTS',  body: () => tvSupplyFlights() },
    { key: 'energy',   label: 'ENERGY',   body: () => tvSupplyEnergy() },
    { key: 'weather',  label: 'WEATHER',  body: () => tvSupplyWeather() },
    { key: 'agri',     label: 'AGRI',     body: () => tvSupplyAgri() },
    { key: 'cot',      label: 'COT',      body: () => tvSupplyCOT() },
  ]);
  const macroMonitor = _tvTabbed('macroMonitor', 'signals', [
    { key: 'signals',     label: 'SIGNALS',     body: () => tvMacroMonitor() },
    { key: 'commodities', label: 'COMMODITIES', body: () => tvMacroCommodities() },
    { key: 'risk',        label: 'RISK',        body: () => tvMacroRiskTab() },
    { key: 'predictions', label: 'PREDICTIONS', body: () => tvMacroPredictions() },
    { key: 'yield',       label: 'YIELD',       body: () => tvMacroYield() },
    { key: 'econcal',     label: 'ECON CAL',    body: () => tvEconCalendar() },
    { key: 'crypto',      label: 'CRYPTO',      body: () => tvMacroCrypto() },
    { key: 'flows',       label: 'FLOWS',       body: () => tvMacroEtfFlows() },
  ]);
  const alertsBlotter = _tvTabbed('alertsBlotter', 'alerts', [
    { key: 'alerts', label: 'ALERTS', body: () => tvAlertsBlotter() },
    { key: 'log',    label: 'LOG',    body: () => tvWebhookLog() },
  ]);

  /* Every window is paired with its id so the list can be filtered by
     _tvPanelVisible() — the top bar / modules tray's .panel-toggle
     checkboxes now govern which Terminal View windows render, exactly
     like they govern the normal dashboard's panels. */
  const windowDefs = [
    { id: 'priceChart',          html: tvWindow(`Price Chart — ${sym || 'N/A'}`,   { id: 'priceChart',          span: 8,  tall: true, bodyHtml: '<div id="tvPriceChart" class="tv-chart-mount"></div>' }) },
    { id: 'marketMonitor',       html: tvWindow('Market Monitor',                 { id: 'marketMonitor',       span: 8,  tall: true, actions: `${watchCount} instruments · ${stamp}`, bodyHtml: tvMarketOverview() }) },
    { id: 'quoteMatrix',         html: tvWindow(`Quote Matrix — ${sym || 'N/A'}`,            { id: 'quoteMatrix',         span: 4,  actions: `Last update ${stamp}`, bodyHtml: tvQuoteMatrix(sym) }) },
    { id: 'technicalIndicators', html: tvWindow(`Technical Indicators — ${sym || 'N/A'}`,    { id: 'technicalIndicators', span: 4,  actions: `Last update ${stamp}`, bodyHtml: tvTechnicalIndicators(sym) }) },
    { id: 'sectorMatrix',        html: tvWindow('Sector Matrix',                  { id: 'sectorMatrix',        span: 4,  bodyHtml: tvSectorMatrix() }) },
    { id: 'charts',              html: tvWindow('Charts',                         { id: 'charts',              span: 12, tall: true, actions: 'Macro Intel gallery', bodyHtml: tvCharts() }) },
    { id: 'news',                html: tvWindow('News',                           { id: 'news',                span: 4,  tall: true, actions: stamp, tabs: news.tabs, bodyHtml: news.body }) },
    { id: 'macroMonitor',        html: tvWindow('Macro Monitor',                  { id: 'macroMonitor',        span: 4,  tall: true, tabs: macroMonitor.tabs, bodyHtml: macroMonitor.body }) },
    { id: 'geoRisk',             html: tvWindow('Geo-Risk',                       { id: 'geoRisk',             span: 6,  tall: true, tabs: geoRisk.tabs, bodyHtml: geoRisk.body }) },
    { id: 'alertsBlotter',       html: tvWindow('Alerts Blotter',                 { id: 'alertsBlotter',       span: 6,  tall: true, actions: `${alertCount} configured`, tabs: alertsBlotter.tabs, bodyHtml: alertsBlotter.body }) },
    { id: 'alertFeed',           html: tvWindow('Alert Feed',                     { id: 'alertFeed',           span: 6,  tall: true, tabs: alertFeed.tabs, bodyHtml: alertFeed.body }) },
    { id: 'supplyChain',         html: tvWindow('Supply Chain',                   { id: 'supplyChain',         span: 6,  tall: true, tabs: supplyChain.tabs, bodyHtml: supplyChain.body }) },
    { id: 'ownership',           html: tvWindow('Ownership',                      { id: 'ownership',           span: 12, tabs: ownership.tabs, bodyHtml: ownership.body }) },
    { id: 'fundamentals',        html: tvWindow(`Fundamentals — ${sym || 'N/A'}`,  { id: 'fundamentals',        span: 8,  tall: true, tabs: fundamentals.tabs, bodyHtml: fundamentals.body }) },
    { id: 'analysts',            html: tvWindow(`Analysts — ${sym || 'N/A'}`,      { id: 'analysts',            span: 6,  tall: true, tabs: analysts.tabs, bodyHtml: analysts.body }) },
    { id: 'comparables',         html: tvWindow(`Comparables — ${sym || 'N/A'}`,   { id: 'comparables',         span: 12, bodyHtml: tvComparables(sym) }) },
    { id: 'portfolio',           html: tvWindow('Portfolio P&L',                  { id: 'portfolio',           span: 6,  tall: true, bodyHtml: tvPortfolio() }) },
    { id: 'screener',            html: tvWindow('Stock Screener',                 { id: 'screener',            span: 12, bodyHtml: tvScreenerResults() }) },
  ];

  const visibleDefs = windowDefs.filter(w => _tvPanelVisible(w.id));
  const winIds = visibleDefs.map(w => w.id);

  root.classList.toggle('tv-free-layout', freeLayout);
  if (freeLayout) computeDefaultTvLayout(winIds);

  root.innerHTML = visibleDefs.map(w => w.html).join('');

  /* Splice the live chart window back in (or initialise it on first render).
     If the Chart panel was toggled off, there's no placeholder to splice into —
     tear the detached instance down now rather than leaving its websocket/poll
     loop running in an orphaned node. */
  const _tvChartSlot = document.getElementById('tv-window-priceChart');
  if (!_tvChartSlot && _tvChartWin && _tvChartInited && typeof mcDestroy === 'function') {
    mcDestroy('tvMain');
    _tvChartInited = false;
    _tvChartSym = '';
  }
  if (_tvChartSlot) {
    if (_tvChartWin) {
      const chartTitleEl = _tvChartWin.querySelector('.tv-window-title');
      if (chartTitleEl) chartTitleEl.textContent = `Price Chart — ${sym || 'N/A'}`;
      /* Drop any free-floating left/top/width/height/z-index carried over from
         a wider viewport — fresh windows get no inline style in stacked mode,
         so the reattached node must match or it'll stay pinned at a fixed size. */
      if (!freeLayout) _tvChartWin.removeAttribute('style');
      _tvChartSlot.replaceWith(_tvChartWin);
    } else if (typeof mcInit === 'function') {
      mcInit(document.getElementById('tvPriceChart'), 'tvMain', () => mcLoad(sym, 'D', 'tvMain'));
      _tvChartInited = true;
      _tvChartSym = sym;
    }
  }
  if (_tvChartInited && sym && sym !== _tvChartSym) {
    _tvChartSym = sym;
    if (typeof mcLoad === 'function') mcLoad(sym, 'D', 'tvMain');
  }

  if (freeLayout) {
    winIds.forEach(id => {
      applyTvWindowPosition(id);
      const el = document.querySelector(`.tv-window[data-tv-window="${id}"]`);
      if (el) { tvInitDrag(el); tvInitResize(el); }
    });
  }
}
