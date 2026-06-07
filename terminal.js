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
   REUSABLE BUILDING BLOCKS — TerminalWindow / TerminalTable
   ══════════════════════════════════════════════════════════════════ */

/** Bordered terminal-style panel frame: thin header bar, uppercase title,
 *  optional tabs/right-side actions, dense scrollable body. */
function tvWindow(title, opts) {
  opts = opts || {};
  const span    = opts.span || 4;
  const spanCls = span !== 4 ? ` tv-span-${span}` : '';
  const tabsHtml = (opts.tabs && opts.tabs.length)
    ? `<div class="tv-window-tabs">${opts.tabs.map(t =>
        `<span class="tv-window-tab${t.active ? ' active' : ''}">${escapeHtml(t.label)}</span>`).join('')}</div>`
    : '';
  const actionsHtml = opts.actions ? `<span class="tv-window-actions">${escapeHtml(opts.actions)}</span>` : '';
  return `<div class="tv-window${spanCls}">
    <div class="tv-window-header">
      <span class="tv-window-title">${escapeHtml(title)}</span>
      ${tabsHtml}
      ${actionsHtml}
    </div>
    <div class="tv-window-body${opts.tall ? ' tv-tall' : ''}">${opts.bodyHtml || ''}</div>
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

/* MacroMonitorTable — only real, globally-reachable macro figures already
   used elsewhere in the app (live VIX cache + Damodaran ERP constant).
   FRED series caches are module-scoped (not globally reachable) so those
   rows are intentionally omitted rather than shown as permanent N/A. */
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
  const columns = [
    { key: 'category',  label: 'Category' },
    { key: 'indicator', label: 'Indicator' },
    { key: 'current',   label: 'Current',  align: 'num', render: v => v != null ? Number(v).toFixed(2) : null },
    { key: 'previous',  label: 'Previous', align: 'num', render: v => v != null ? Number(v).toFixed(2) : null },
    { key: 'change',    label: 'Chg',      align: 'num', render: v => _tvPct(v) },
    { key: 'status',    label: 'Status',   render: v => v ? _tvTag(v, v === 'ELEVATED' ? 'neg' : v === 'WATCH' ? 'warn' : v === 'NORMAL' ? 'pos' : 'neutral') : null },
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

/* ══════════════════════════════════════════════════════════════════
   ORCHESTRATOR — builds the workspace grid from the mappers above
   ══════════════════════════════════════════════════════════════════ */
function renderTerminalView() {
  const root = document.getElementById('terminalView');
  if (!root) return;

  const sym = String((typeof currentTicker !== 'undefined' && currentTicker) || '').replace(/.*:/, '').toUpperCase();
  const stamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  const watchCount = ((typeof currentWatchlistStocks !== 'undefined' && currentWatchlistStocks) || []).length;
  const alertCount = ((typeof whAlerts !== 'undefined' && whAlerts) || []).length;

  root.innerHTML = [
    tvWindow('Market Monitor',                { span: 8, tall: true, actions: `${watchCount} instruments · ${stamp}`,        bodyHtml: tvMarketOverview() }),
    tvWindow(`Quote Matrix — ${sym || 'N/A'}`,            { span: 4, actions: `Last update ${stamp}`,                          bodyHtml: tvQuoteMatrix(sym) }),
    tvWindow(`Technical Indicators — ${sym || 'N/A'}`,    { span: 4, actions: `Last update ${stamp}`,                          bodyHtml: tvTechnicalIndicators(sym) }),
    tvWindow('Sector Matrix',                 { span: 4,             bodyHtml: tvSectorMatrix() }),
    tvWindow('Intelligence Blotter',          { span: 4, tall: true, actions: stamp,                                          bodyHtml: tvIntelligenceBlotter() }),
    tvWindow('Macro Monitor',                 { span: 4,             bodyHtml: tvMacroMonitor() }),
    tvWindow('Risk Matrix',                   { span: 6, tall: true, bodyHtml: tvRiskMatrix() }),
    tvWindow('Alerts Blotter',                { span: 6, tall: true, actions: `${alertCount} configured`,                     bodyHtml: tvAlertsBlotter() }),
    tvWindow('Ownership',                     { span: 12,            bodyHtml: tvOwnershipTable() }),
  ].join('');
}
