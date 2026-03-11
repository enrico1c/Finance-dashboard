/* ─── State ─────────────────────────────────────────────────────── */
let currentTicker        = "AAPL";
let currentNewsMode      = "ticker";
let currentForexPair     = "EUR/USD";
let currentForexInterval = "60";

/* ─── Utils ─────────────────────────────────────────────────────── */
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

/* ══════════════════════════════════════════════════════════════════
   EXCHANGE RESOLUTION
   Supports:
     • Plain ticker      "AAPL"     → looks up DB → "NASDAQ:AAPL"
     • Prefixed ticker   "NYSE:IBM" → passed as-is
     • Common globals    "MIL:ENI", "LSE:BP", "ETR:BMW", "TYO:7203"
   ══════════════════════════════════════════════════════════════════ */
const exchangeDB = {
  // NASDAQ
  AAPL:"NASDAQ",MSFT:"NASDAQ",GOOGL:"NASDAQ",GOOG:"NASDAQ",AMZN:"NASDAQ",
  META:"NASDAQ",NVDA:"NASDAQ",TSLA:"NASDAQ",NFLX:"NASDAQ",AMD:"NASDAQ",
  INTC:"NASDAQ",QCOM:"NASDAQ",PYPL:"NASDAQ",ADBE:"NASDAQ",CSCO:"NASDAQ",
  SBUX:"NASDAQ",COST:"NASDAQ",AVGO:"NASDAQ",TXN:"NASDAQ",AMAT:"NASDAQ",
  MU:"NASDAQ",LRCX:"NASDAQ",KLAC:"NASDAQ",MRVL:"NASDAQ",ASML:"NASDAQ",
  // NYSE
  JPM:"NYSE",BAC:"NYSE",GS:"NYSE",MS:"NYSE",WMT:"NYSE",V:"NYSE",
  MA:"NYSE",BRK:"NYSE",XOM:"NYSE",CVX:"NYSE",KO:"NYSE",DIS:"NYSE",
  PFE:"NYSE",JNJ:"NYSE",PG:"NYSE",HD:"NYSE",UNH:"NYSE",MRK:"NYSE",
  IBM:"NYSE",GE:"NYSE",BA:"NYSE",CAT:"NYSE",MMM:"NYSE",AXP:"NYSE",
  CRM:"NYSE",NKE:"NYSE",T:"NYSE",VZ:"NYSE",C:"NYSE",WFC:"NYSE",
  F:"NYSE",GM:"NYSE",
  // No prefix needed (TradingView auto-resolves these)
  SPY:"AMEX",QQQ:"NASDAQ",IWM:"AMEX",GLD:"NYSE",SLV:"NYSE",
  BTC:"BITSTAMP",ETH:"BITSTAMP",
};

function resolveSymbol(raw) {
  const input = raw.trim().toUpperCase();
  // Already has exchange prefix (e.g. "NYSE:IBM", "MIL:ENI", "LSE:BP")
  if (input.includes(":")) return input;
  // Look up our DB
  const exch = exchangeDB[input];
  if (exch) return `${exch}:${input}`;
  // Fallback: try NASDAQ first (TradingView will suggest corrections)
  return `NASDAQ:${input}`;
}

function getExchangeLabel(raw) {
  const input = raw.trim().toUpperCase();
  if (input.includes(":")) return input.split(":")[0];
  return exchangeDB[input] || "AUTO";
}

function updateExchangeHint() {
  const hint = document.getElementById("exchangeHint");
  if (!hint) return;
  const val = document.getElementById("tickerInput")?.value || "";
  hint.textContent = getExchangeLabel(val);
}

function mapForexPairToSymbol(pair) {
  return "FX:" + pair.replace("/","").toUpperCase().trim();
}

/* ══════════════════════════════════════════════════════════════════
   LAYOUT — DEFAULT POSITIONS
   Called once on load to place panels in a sensible default grid.
   After that, positions are stored in panelLayout and updated by
   the drag/resize engine.
   ══════════════════════════════════════════════════════════════════ */

/* Each entry: { x, y, w, h } — all in pixels, set relative to canvas */
const panelLayout = {};

function computeDefaultLayout() {
  const canvas = document.getElementById("dashboardCanvas");
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  const GAP = 8;

  const chartW  = Math.round(W * 0.55);
  const chartH  = Math.round(H * 0.60);
  const col2W   = W - chartW - GAP;
  const bottomH = H - chartH - GAP;
  const colW3   = Math.round((W - GAP * 2) / 3);

  panelLayout["chart"]        = { x: 0,             y: 0,          w: chartW,  h: chartH };
  panelLayout["fundamentals"] = { x: chartW + GAP,  y: 0,          w: col2W,   h: Math.round(chartH * 0.55) };
  panelLayout["news"]         = { x: chartW + GAP,  y: Math.round(chartH * 0.55) + GAP, w: col2W, h: chartH - Math.round(chartH * 0.55) - GAP };
  panelLayout["comparables"]  = { x: 0,             y: chartH + GAP, w: colW3,  h: bottomH };
  panelLayout["notes"]        = { x: colW3 + GAP,   y: chartH + GAP, w: colW3,  h: bottomH };
  panelLayout["forex"]        = { x: colW3 * 2 + GAP * 2, y: chartH + GAP, w: colW3, h: bottomH };
}

function applyPanelPosition(panelId) {
  const el = document.getElementById(`panel-${panelId}`);
  if (!el) return;
  const l = panelLayout[panelId];
  if (!l) return;
  el.style.left   = l.x + "px";
  el.style.top    = l.y + "px";
  el.style.width  = l.w + "px";
  el.style.height = l.h + "px";
}

function initLayout() {
  computeDefaultLayout();
  Object.keys(panelLayout).forEach(applyPanelPosition);
}

/* ══════════════════════════════════════════════════════════════════
   DRAG ENGINE
   ══════════════════════════════════════════════════════════════════ */
const SNAP = 8; // snap-to-grid in pixels

let dragState = null;

function initDrag(panel) {
  const head = panel.querySelector(".panel-head");
  if (!head) return;

  head.addEventListener("mousedown", e => {
    // Don't drag when clicking buttons / inputs inside header
    if (e.target.closest("button,input,select,textarea")) return;
    e.preventDefault();

    const canvas = document.getElementById("dashboardCanvas");
    const rect   = panel.getBoundingClientRect();
    const cRect  = canvas.getBoundingClientRect();

    dragState = {
      panel,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startPanelX: rect.left - cRect.left,
      startPanelY: rect.top  - cRect.top,
    };

    panel.classList.add("dragging");
    bringToFront(panel);
    document.getElementById("snapOverlay")?.classList.add("visible");

    // Raise z-index during drag
    panel.style.zIndex = 1000;
  });
}

document.addEventListener("mousemove", e => {
  if (!dragState) return;

  const canvas = document.getElementById("dashboardCanvas");
  const cRect  = canvas.getBoundingClientRect();

  let x = dragState.startPanelX + (e.clientX - dragState.startMouseX);
  let y = dragState.startPanelY + (e.clientY - dragState.startMouseY);

  // Snap to grid
  x = Math.round(x / SNAP) * SNAP;
  y = Math.round(y / SNAP) * SNAP;

  // Clamp inside canvas
  const maxX = cRect.width  - dragState.panel.offsetWidth;
  const maxY = cRect.height - dragState.panel.offsetHeight;
  x = Math.max(0, Math.min(x, maxX));
  y = Math.max(0, Math.min(y, maxY));

  dragState.panel.style.left = x + "px";
  dragState.panel.style.top  = y + "px";

  // Update layout record
  const panelId = dragState.panel.dataset.panel;
  if (panelLayout[panelId]) { panelLayout[panelId].x = x; panelLayout[panelId].y = y; }
});

document.addEventListener("mouseup", () => {
  if (!dragState) return;
  dragState.panel.classList.remove("dragging");
  dragState.panel.style.zIndex = "";
  document.getElementById("snapOverlay")?.classList.remove("visible");
  dragState = null;
});

/* ══════════════════════════════════════════════════════════════════
   RESIZE ENGINE
   ══════════════════════════════════════════════════════════════════ */
const MIN_W = 180;
const MIN_H = 90;

let resizeState = null;

function initResize(panel) {
  const handles = panel.querySelectorAll(".resize-handle");
  handles.forEach(handle => {
    handle.addEventListener("mousedown", e => {
      e.preventDefault();
      e.stopPropagation();

      const canvas = document.getElementById("dashboardCanvas");
      const rect   = panel.getBoundingClientRect();
      const cRect  = canvas.getBoundingClientRect();

      resizeState = {
        panel,
        dir:    handle.dataset.dir,
        mouseX: e.clientX,
        mouseY: e.clientY,
        startX: rect.left - cRect.left,
        startY: rect.top  - cRect.top,
        startW: rect.width,
        startH: rect.height,
      };

      panel.classList.add("resizing");
      bringToFront(panel);
    });
  });
}

document.addEventListener("mousemove", e => {
  if (!resizeState) return;

  const s   = resizeState;
  const dx  = e.clientX - s.mouseX;
  const dy  = e.clientY - s.mouseY;
  const dir = s.dir;

  let x = s.startX, y = s.startY, w = s.startW, h = s.startH;

  if (dir.includes("e")) w = Math.max(MIN_W, s.startW + dx);
  if (dir.includes("s")) h = Math.max(MIN_H, s.startH + dy);
  if (dir.includes("w")) { w = Math.max(MIN_W, s.startW - dx); x = s.startX + s.startW - w; }
  if (dir.includes("n")) { h = Math.max(MIN_H, s.startH - dy); y = s.startY + s.startH - h; }

  // Snap
  w = Math.round(w / SNAP) * SNAP;
  h = Math.round(h / SNAP) * SNAP;
  x = Math.round(x / SNAP) * SNAP;
  y = Math.round(y / SNAP) * SNAP;

  // Clamp position
  const canvas = document.getElementById("dashboardCanvas");
  x = Math.max(0, x);
  y = Math.max(0, y);

  s.panel.style.left   = x + "px";
  s.panel.style.top    = y + "px";
  s.panel.style.width  = w + "px";
  s.panel.style.height = h + "px";

  // Show size tooltip
  const panelId = s.panel.dataset.panel;
  const tooltip = document.getElementById(`tooltip-${panelId}`);
  if (tooltip) tooltip.textContent = `${w} × ${h}`;

  // Update layout record
  if (panelLayout[panelId]) Object.assign(panelLayout[panelId], { x, y, w, h });
});

document.addEventListener("mouseup", () => {
  if (!resizeState) return;
  resizeState.panel.classList.remove("resizing");

  // Reload charts if a chart panel was resized (TradingView needs a re-init)
  const panelId = resizeState.panel.dataset.panel;
  if (panelId === "chart") {
    setTimeout(() => loadChart(resolveSymbol(currentTicker)), 120);
  }
  if (panelId === "forex") {
    setTimeout(() => loadForexChart(), 120);
  }

  resizeState = null;
});

/* ─── Z-index management ─────────────────────────────────────────── */
let zCounter = 10;
function bringToFront(panel) {
  zCounter++;
  panel.style.zIndex = zCounter;
}

/* ══════════════════════════════════════════════════════════════════
   TRADINGVIEW CHARTS
   ══════════════════════════════════════════════════════════════════ */
function loadChart(symbol) {
  const el = document.getElementById("priceChart");
  if (!el) return;
  el.innerHTML = "";
  new TradingView.widget({
    autosize:            true,
    symbol:              symbol,
    interval:            "D",
    timezone:            "Europe/Rome",
    theme:               "dark",
    style:               "1",
    locale:              "it",
    toolbar_bg:          "#0d1117",
    enable_publishing:   false,
    allow_symbol_change: true,   // user can change from inside the widget too
    hide_top_toolbar:    false,
    save_image:          false,
    container_id:        "priceChart",
  });
}

function loadForexChart(pair, interval) {
  pair     = pair     ?? currentForexPair;
  interval = interval ?? currentForexInterval;
  currentForexPair     = pair;
  currentForexInterval = interval;

  const el = document.getElementById("forexChart");
  if (!el) return;
  el.innerHTML = "";

  new TradingView.widget({
    autosize:            true,
    symbol:              mapForexPairToSymbol(pair),
    interval:            interval,
    timezone:            "Europe/Rome",
    theme:               "dark",
    style:               "1",
    locale:              "it",
    toolbar_bg:          "#0d1117",
    enable_publishing:   false,
    allow_symbol_change: true,
    container_id:        "forexChart",
  });

  const lbl = document.getElementById("forexLabel");
  if (lbl) lbl.textContent = `Pair: ${pair}`;

  const sum = document.getElementById("forexSummary");
  if (sum) sum.innerHTML = `
    <div class="metric"><span>Pair</span><span>${escapeHtml(pair)}</span></div>
    <div class="metric"><span>Interval</span><span>${escapeHtml(formatInterval(interval))}</span></div>
    <div class="metric"><span>Status</span><span style="color:var(--accent-green)">Active</span></div>
  `;

  // update active button
  document.querySelectorAll(".fx-tf-btn").forEach(b => {
    b.classList.toggle("active", b.textContent.trim() === formatInterval(interval));
  });
}

function formatInterval(iv) {
  return { "1":"1m","5":"5m","15":"15m","60":"1H","240":"4H","D":"1D","W":"1W" }[iv] ?? iv;
}

function changeForexPair() {
  const v = document.getElementById("forexPairInput")?.value.trim().toUpperCase();
  if (v) loadForexChart(v, currentForexInterval);
}

function setForexInterval(iv) { loadForexChart(currentForexPair, iv); }

/* ══════════════════════════════════════════════════════════════════
   FUNDAMENTALS
   ══════════════════════════════════════════════════════════════════ */
const fundamentalsDB = {
  AAPL:  { name:"Apple Inc.",          sector:"Technology",     mktCap:"$2.87T", pe:"29.4", eps:"6.42",  div:"0.96", roe:"164%", beta:"1.24", ytd:"+23.1%" },
  MSFT:  { name:"Microsoft Corp.",     sector:"Technology",     mktCap:"$3.12T", pe:"35.1", eps:"11.45", div:"3.00", roe:"38%",  beta:"0.90", ytd:"+18.4%" },
  NVDA:  { name:"NVIDIA Corp.",        sector:"Semiconductors", mktCap:"$2.61T", pe:"58.2", eps:"1.69",  div:"0.16", roe:"115%", beta:"1.66", ytd:"+87.3%" },
  GOOGL: { name:"Alphabet Inc.",       sector:"Technology",     mktCap:"$2.14T", pe:"24.8", eps:"7.65",  div:"—",    roe:"28%",  beta:"1.05", ytd:"+14.2%" },
  AMZN:  { name:"Amazon.com Inc.",     sector:"E-Commerce",     mktCap:"$1.97T", pe:"44.6", eps:"4.25",  div:"—",    roe:"20%",  beta:"1.15", ytd:"+21.7%" },
  META:  { name:"Meta Platforms",      sector:"Social Media",   mktCap:"$1.35T", pe:"28.3", eps:"19.90", div:"2.00", roe:"34%",  beta:"1.22", ytd:"+31.5%" },
  TSLA:  { name:"Tesla Inc.",          sector:"Automotive",     mktCap:"$843B",  pe:"71.2", eps:"3.11",  div:"—",    roe:"19%",  beta:"2.30", ytd:"-14.2%" },
  JPM:   { name:"JPMorgan Chase",      sector:"Financials",     mktCap:"$557B",  pe:"12.4", eps:"18.22", div:"4.60", roe:"18%",  beta:"1.13", ytd:"+9.8%"  },
  V:     { name:"Visa Inc.",           sector:"Financials",     mktCap:"$532B",  pe:"30.2", eps:"9.92",  div:"2.08", roe:"44%",  beta:"0.95", ytd:"+11.2%" },
  AMD:   { name:"Advanced Micro Dev.", sector:"Semiconductors", mktCap:"$255B",  pe:"49.1", eps:"3.41",  div:"—",    roe:"6%",   beta:"1.72", ytd:"-8.4%"  },
};

function loadFundamentals(ticker) {
  const box = document.getElementById("financials");
  if (!box) return;
  const d = fundamentalsDB[ticker.toUpperCase()];
  if (d) {
    const cls = d.ytd.startsWith("+") ? "metric-up" : d.ytd.startsWith("-") ? "metric-down" : "";
    box.innerHTML = `
      <div class="metric"><span>Company</span><span>${escapeHtml(d.name)}</span></div>
      <div class="metric"><span>Sector</span><span>${escapeHtml(d.sector)}</span></div>
      <div class="metric"><span>Mkt Cap</span><span>${escapeHtml(d.mktCap)}</span></div>
      <div class="metric"><span>P/E</span><span>${escapeHtml(d.pe)}</span></div>
      <div class="metric"><span>EPS TTM</span><span>${escapeHtml(d.eps)}</span></div>
      <div class="metric"><span>Dividend</span><span>${escapeHtml(d.div)}</span></div>
      <div class="metric"><span>ROE</span><span>${escapeHtml(d.roe)}</span></div>
      <div class="metric"><span>Beta</span><span>${escapeHtml(d.beta)}</span></div>
      <div class="metric ${cls}"><span>YTD</span><span>${escapeHtml(d.ytd)}</span></div>
    `;
  } else {
    const sym = resolveSymbol(ticker);
    box.innerHTML = `
      <div class="metric"><span>Symbol</span><span>${escapeHtml(sym)}</span></div>
      <div class="metric"><span>Status</span><span style="color:var(--text-muted)">No local data</span></div>
      <div style="margin-top:10px;font-size:11px;color:var(--text-muted);font-family:var(--font-mono);line-height:1.8">
        // Chart is live via TradingView.<br>
        // Use format NYSE:IBM, MIL:ENI<br>
        // or LSE:BP for non-US tickers.
      </div>
    `;
  }
}

/* ══════════════════════════════════════════════════════════════════
   NEWS
   ══════════════════════════════════════════════════════════════════ */
function buildSearchLinks(query, mode) {
  const lbl = mode === "ticker" ? "Ticker" : "Topic";
  return [
    { source:"Google News",    url:`https://news.google.com/search?q=${encodeURIComponent(query)}`,                   summary:`${lbl} search via Google News` },
    { source:"Ground News",    url:`https://ground.news/search?query=${encodeURIComponent(query)}`,                   summary:"Bias-aware aggregator" },
    { source:"Reuters",        url:`https://www.reuters.com/site-search/?query=${encodeURIComponent(query)}`,          summary:"Reuters global newswire" },
    { source:"CNBC",           url:`https://www.cnbc.com/search/?query=${encodeURIComponent(query)}`,                  summary:"US financial news & markets" },
    { source:"Financial Times",url:`https://www.ft.com/search?q=${encodeURIComponent(query)}`,                        summary:"Premium global business news" },
    { source:"The Economist",  url:`https://www.economist.com/search?q=${encodeURIComponent(query)}`,                 summary:"In-depth economic analysis" },
    { source:"Bloomberg",      url:`https://www.bloomberg.com/search?query=${encodeURIComponent(query)}`,              summary:"Finance & markets intelligence" },
    { source:"MarketWatch",    url:`https://www.marketwatch.com/search?q=${encodeURIComponent(query)}&ts=0&tab=All`, summary:"Stock market news & analysis" },
    { source:"Seeking Alpha",  url:`https://seekingalpha.com/search?q=${encodeURIComponent(query)}`,                  summary:"Investment research & opinions" },
    { source:"NYT",            url:`https://www.nytimes.com/search?query=${encodeURIComponent(query)}`,                summary:"US and international reporting" },
  ].map(i => ({ ...i, title:`${i.source}  →  ${query}` }));
}

function renderNews(items) {
  const box = document.getElementById("newsBox");
  if (!box) return;
  box.innerHTML = `<div class="news-list">${items.map(i => `
    <div class="news-item">
      <a href="${i.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(i.title)}</a>
      <div class="news-meta">${escapeHtml(i.source)}</div>
      <div class="news-summary">${escapeHtml(i.summary)}</div>
    </div>`).join("")}</div>`;
}

function loadTickerNews(ticker) {
  currentNewsMode = "ticker";
  const lbl = document.getElementById("newsModeLabel");
  if (lbl) lbl.textContent = `Ticker · ${ticker}`;
  renderNews(buildSearchLinks(ticker, "ticker"));
}

function searchTopicNews() {
  const q = document.getElementById("topicInput")?.value.trim();
  if (!q) return;
  currentNewsMode = "topic";
  const lbl = document.getElementById("newsModeLabel");
  if (lbl) lbl.textContent = `Topic · ${q}`;
  renderNews(buildSearchLinks(q, "topic"));
  loadComparables(currentTicker);
}

/* ══════════════════════════════════════════════════════════════════
   COMPARABLES
   ══════════════════════════════════════════════════════════════════ */
const peersDB = {
  AAPL:["MSFT","GOOGL","META","AMZN","DELL"],
  NVDA:["AMD","INTC","QCOM","AVGO","TSM"],
  TSLA:["F","GM","RIVN","NIO","BMW"],
  JPM:["BAC","GS","MS","WFC","C"],
  META:["GOOGL","SNAP","PINS","NFLX"],
};

function loadComparables(ticker) {
  const box = document.getElementById("peers");
  if (!box) return;
  const peers = peersDB[ticker.toUpperCase()] || [];
  box.innerHTML = `
    <div class="metric"><span>Main Ticker</span><span>${escapeHtml(resolveSymbol(ticker))}</span></div>
    <div class="metric"><span>Sector Peers</span><span style="color:var(--accent);font-size:11px">${peers.length ? peers.join(" · ") : "N/A"}</span></div>
    <div class="metric"><span>News Mode</span><span>${escapeHtml(currentNewsMode)}</span></div>
  `;
}

/* ══════════════════════════════════════════════════════════════════
   TICKER CHANGE
   ══════════════════════════════════════════════════════════════════ */
function changeTicker() {
  const raw = document.getElementById("tickerInput")?.value.trim();
  if (!raw) return;
  currentTicker = raw;
  const sym = resolveSymbol(raw);
  updateExchangeHint();
  loadChart(sym);
  loadFundamentals(raw);
  loadTickerNews(raw);
  loadComparables(raw);
}

/* ══════════════════════════════════════════════════════════════════
   PANEL VISIBILITY
   ══════════════════════════════════════════════════════════════════ */
function hidePanel(panelId) {
  const el = document.getElementById(`panel-${panelId}`);
  if (el) el.classList.add("hidden");
  // uncheck the toggle
  const cb = document.querySelector(`.panel-toggle[data-panel="${panelId}"]`);
  if (cb) cb.checked = false;
}

function showPanel(panelId) {
  const el = document.getElementById(`panel-${panelId}`);
  if (!el) return;
  el.classList.remove("hidden");
  applyPanelPosition(panelId);
  bringToFront(el);

  // reload chart content if needed
  if (panelId === "chart")  setTimeout(() => loadChart(resolveSymbol(currentTicker)), 80);
  if (panelId === "forex")  setTimeout(() => loadForexChart(), 80);
}

function setupChecklist() {
  document.querySelectorAll(".panel-toggle").forEach(cb => {
    cb.addEventListener("change", function () {
      this.checked ? showPanel(this.dataset.panel) : hidePanel(this.dataset.panel);
    });
  });
}

/* ══════════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
   ══════════════════════════════════════════════════════════════════ */
function setupKeyboard() {
  document.getElementById("tickerInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") changeTicker();
  });
  document.getElementById("topicInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") searchTopicNews();
  });
  document.getElementById("forexPairInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") changeForexPair();
  });
}

/* ══════════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════════ */
window.addEventListener("load", () => {
  // Attach drag & resize to every panel
  document.querySelectorAll(".panel").forEach(panel => {
    initDrag(panel);
    initResize(panel);
    bringToFront(panel);
  });

  setupChecklist();
  setupKeyboard();
  updateExchangeHint();

  // Layout must be computed after DOM is painted
  requestAnimationFrame(() => {
    initLayout();

    loadChart(resolveSymbol(currentTicker));
    loadForexChart();
    loadFundamentals(currentTicker);
    loadTickerNews(currentTicker);
    loadComparables(currentTicker);
  });
});

/* Re-layout on window resize (recalculate default if needed) */
window.addEventListener("resize", () => {
  // Just keep panels inside bounds
  document.querySelectorAll(".panel:not(.hidden)").forEach(panel => {
    const canvas = document.getElementById("dashboardCanvas");
    const maxX = canvas.clientWidth  - panel.offsetWidth;
    const maxY = canvas.clientHeight - panel.offsetHeight;
    let x = parseInt(panel.style.left) || 0;
    let y = parseInt(panel.style.top)  || 0;
    x = Math.max(0, Math.min(x, maxX));
    y = Math.max(0, Math.min(y, maxY));
    panel.style.left = x + "px";
    panel.style.top  = y + "px";
  });
});
