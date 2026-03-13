/* ══════════════════════════════════════════════════════════════════
   FINTERM — api.js
   Alpha Vantage integration layer
   • Cache: sessionStorage (resets on tab close, saves API calls)
   • Rate guard: tracks calls this session, warns at 20/25
   • Endpoints: QUOTE, OVERVIEW, EARNINGS, NEWS, INCOME, BALANCE, CASHFLOW
   ══════════════════════════════════════════════════════════════════ */

/* ── ⚙️  Keys are managed via the ⚙ API button in the UI ────────── */
/* Use the modal to paste your Alpha Vantage key — stored in localStorage. */

// Runtime key: config.js stores under finterm_key_av (via lsId = id => `finterm_key_${id}`)
function getAvKey() {
  return (window._KEYS && window._KEYS["av"])
    || localStorage.getItem("finterm_key_av")
    || localStorage.getItem("finterm_av_key")   // legacy fallback
    || "";
}

const AV_BASE   = "https://www.alphavantage.co/query";
const CACHE_TTL = 15 * 60 * 1000;   // 15 minutes per symbol
const SESSION_KEY = "av_call_count";

/* ══════════════════════════════════════════════════════════════════
   RATE LIMIT TRACKER
   ══════════════════════════════════════════════════════════════════ */
function avCallCount() {
  return parseInt(sessionStorage.getItem(SESSION_KEY) || "0");
}
function avIncrementCount() {
  const n = avCallCount() + 1;
  sessionStorage.setItem(SESSION_KEY, n);
  // Delegate badge refresh to config.js (which manages all dynamic badges)
  if (typeof renderTopbarBadges === "function") renderTopbarBadges();
  return n;
}
function updateApiStatus() {
  if (typeof renderTopbarBadges === "function") renderTopbarBadges();
}

/* ══════════════════════════════════════════════════════════════════
   CACHE HELPERS  (sessionStorage, keyed by function+symbol)
   ══════════════════════════════════════════════════════════════════ */
function cacheKey(fn, symbol) { return `av_${fn}_${symbol.toUpperCase()}`; }

function cacheGet(fn, symbol) {
  try {
    const raw = sessionStorage.getItem(cacheKey(fn, symbol));
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { sessionStorage.removeItem(cacheKey(fn, symbol)); return null; }
    return data;
  } catch { return null; }
}

function cacheSet(fn, symbol, data) {
  try { sessionStorage.setItem(cacheKey(fn, symbol), JSON.stringify({ ts: Date.now(), data })); }
  catch { /* storage full — ignore */ }
}

/* ══════════════════════════════════════════════════════════════════
   CORE FETCH  (with cache + rate guard)
   ══════════════════════════════════════════════════════════════════ */
async function avFetch(params) {
  const fn     = params.function;
  const symbol = params.symbol || params.tickers || "GLOBAL";
  const cached = cacheGet(fn, symbol);
  if (cached) return cached;

  if (avCallCount() >= 25) {
    showApiToast("⚠️ Daily limit reached (25/25). Showing cached or static data.", "warn");
    return null;
  }

  const url = AV_BASE + "?" + new URLSearchParams({ ...params, apikey: getAvKey() });
  try {
    avIncrementCount();
    const res  = await fetch(url);
    const data = await res.json();

    // AV returns "Information" key when rate-limited or key invalid
    if (data["Information"] || data["Note"]) {
      const msg = data["Information"] || data["Note"];
      showApiToast("⚠️ " + msg.slice(0, 90), "warn");
      return null;
    }
    if (data["Error Message"]) {
      showApiToast("✕ Invalid symbol or endpoint.", "error");
      return null;
    }

    cacheSet(fn, symbol, data);
    return data;
  } catch (e) {
    showApiToast("✕ Network error: " + e.message, "error");
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════════
   TOAST NOTIFICATIONS
   ══════════════════════════════════════════════════════════════════ */
let toastTimer = null;
function showApiToast(msg, type = "info") {
  let toast = document.getElementById("apiToast");
  if (!toast) return;
  toast.textContent = msg;
  toast.className   = `api-toast api-toast-${type} visible`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 4000);
}

/* ══════════════════════════════════════════════════════════════════
   ENDPOINT WRAPPERS
   ══════════════════════════════════════════════════════════════════ */

/* ── QUOTE  (real-time price, volume, open/high/low/close) ───── */
async function avGetQuote(symbol) {
  setLoading("quote-qr", true);
  setLoading("quote-mon", true);
  const data = await avFetch({ function: "GLOBAL_QUOTE", symbol });
  setLoading("quote-qr", false);
  setLoading("quote-mon", false);
  if (!data) return null;
  const q = data["Global Quote"];
  if (!q || !q["05. price"]) return null;
  return {
    symbol:    q["01. symbol"],
    open:      parseFloat(q["02. open"]),
    high:      parseFloat(q["03. high"]),
    low:       parseFloat(q["04. low"]),
    price:     parseFloat(q["05. price"]),
    volume:    parseInt(q["06. volume"]),
    prevClose: parseFloat(q["08. previous close"]),
    change:    parseFloat(q["09. change"]),
    changePct: q["10. change percent"],
    latestDay: q["07. latest trading day"],
  };
}

/* ── COMPANY OVERVIEW  (fundamentals: P/E, EPS, dividends…) ─── */
async function avGetOverview(symbol) {
  setLoading("fund-des", true);
  const data = await avFetch({ function: "OVERVIEW", symbol });
  setLoading("fund-des", false);
  if (!data || !data.Symbol) return null;
  return {
    symbol:       data.Symbol,
    name:         data.Name,
    description:  data.Description,
    exchange:     data.Exchange,
    currency:     data.Currency,
    country:      data.Country,
    sector:       data.Sector,
    industry:     data.Industry,
    address:      data.Address,
    employees:    parseInt(data.FullTimeEmployees || 0),
    mktCap:       parseInt(data.MarketCapitalization || 0),
    pe:           parseFloat(data.PERatio) || null,
    forwardPe:    parseFloat(data.ForwardPE) || null,
    peg:          parseFloat(data.PEGRatio) || null,
    pb:           parseFloat(data.PriceToBookRatio) || null,
    ps:           parseFloat(data.PriceToSalesRatioTTM) || null,
    eps:          parseFloat(data.EPS) || null,
    divPerShare:  parseFloat(data.DividendPerShare) || null,
    divYield:     parseFloat(data.DividendYield) || null,
    roe:          parseFloat(data.ReturnOnEquityTTM) || null,
    roa:          parseFloat(data.ReturnOnAssetsTTM) || null,
    revTTM:       parseInt(data.RevenueTTM) || null,
    grossProfit:  parseInt(data.GrossProfitTTM) || null,
    ebitda:       parseInt(data.EBITDA) || null,
    operMgn:      parseFloat(data.OperatingMarginTTM) || null,
    profitMgn:    parseFloat(data.ProfitMargin) || null,
    beta:         parseFloat(data.Beta) || null,
    week52High:   parseFloat(data["52WeekHigh"]) || null,
    week52Low:    parseFloat(data["52WeekLow"]) || null,
    ma50:         parseFloat(data["50DayMovingAverage"]) || null,
    ma200:        parseFloat(data["200DayMovingAverage"]) || null,
    sharesOut:    parseInt(data.SharesOutstanding) || null,
    float:        parseInt(data.SharesFloat) || null,
    bookValue:    parseFloat(data.BookValue) || null,
    evRevenue:    parseFloat(data.EVToRevenue) || null,
    evEbitda:     parseFloat(data.EVToEBITDA) || null,
    fiscalYearEnd:data.FiscalYearEnd,
    latestQuarter:data.LatestQuarter,
    analystTarget:parseFloat(data.AnalystTargetPrice) || null,
  };
}

/* ── EARNINGS  (quarterly EPS actual vs estimate) ──────────────── */
async function avGetEarnings(symbol) {
  setLoading("fund-ern", true);
  setLoading("fund-ee", true);
  const data = await avFetch({ function: "EARNINGS", symbol });
  setLoading("fund-ern", false);
  setLoading("fund-ee", false);
  if (!data) return null;
  return {
    // Take up to 16 quarters — most recent first (AV returns newest first)
    quarterly: (data.quarterlyEarnings || []).slice(0, 16).map(q => ({
      quarter:       q.fiscalDateEnding,
      reportDate:    q.reportedDate,
      epsEst:        parseFloat(q.estimatedEPS) || null,
      epsActual:     parseFloat(q.reportedEPS)  || null,
      surprise:      parseFloat(q.surprise)     || null,
      surprisePct:   parseFloat(q.surprisePercentage) || null,
    })),
    annual: (data.annualEarnings || []).slice(0, 8).map(a => ({
      year:      a.fiscalDateEnding.slice(0,4),
      epsActual: parseFloat(a.reportedEPS) || null,
    })),
  };
}

/* ── INCOME STATEMENT ─────────────────────────────────────────── */
async function avGetIncome(symbol) {
  setLoading("fund-fa", true);
  const data = await avFetch({ function: "INCOME_STATEMENT", symbol });
  if (!data) { setLoading("fund-fa", false); return null; }
  return (data.annualReports || []).slice(0, 5).map(r => ({
    year:        r.fiscalDateEnding.slice(0,4),
    revenue:     parseInt(r.totalRevenue) || 0,
    grossProfit: parseInt(r.grossProfit) || 0,
    ebit:        parseInt(r.ebit) || 0,
    netIncome:   parseInt(r.netIncome) || 0,
    eps:         null, // not in income statement, use EARNINGS endpoint
  }));
}

/* ── BALANCE SHEET ────────────────────────────────────────────── */
async function avGetBalance(symbol) {
  const data = await avFetch({ function: "BALANCE_SHEET", symbol });
  if (!data) return null;
  return (data.annualReports || []).slice(0, 3).map(r => ({
    year:        r.fiscalDateEnding.slice(0,4),
    totalAssets: parseInt(r.totalAssets) || 0,
    totalLiab:   parseInt(r.totalLiabilities) || 0,
    equity:      parseInt(r.totalShareholderEquity) || 0,
    cash:        parseInt(r.cashAndCashEquivalentsAtCarryingValue) || 0,
    debt:        parseInt(r.longTermDebt) || 0,
  }));
}

/* ── CASH FLOW ────────────────────────────────────────────────── */
async function avGetCashFlow(symbol) {
  const data = await avFetch({ function: "CASH_FLOW", symbol });
  if (!data) { setLoading("fund-fa", false); return null; }
  setLoading("fund-fa", false);
  return (data.annualReports || []).slice(0, 3).map(r => ({
    year:        r.fiscalDateEnding.slice(0,4),
    operatingCF: parseInt(r.operatingCashflow) || 0,
    capex:       parseInt(r.capitalExpenditures) || 0,
    freeCF:      (parseInt(r.operatingCashflow)||0) - Math.abs(parseInt(r.capitalExpenditures)||0),
    dividends:   parseInt(r.dividendPayout) || 0,
  }));
}

/* ── NEWS & SENTIMENT ─────────────────────────────────────────── */
async function avGetNews(symbol, limit = 20) {
  setLoading("news-cn", true);
  const data = await avFetch({
    function: "NEWS_SENTIMENT",
    tickers:  symbol,
    limit,
    sort:     "LATEST",
  });
  setLoading("news-cn", false);
  if (!data || !data.feed) return null;
  return data.feed.slice(0, limit).map(a => ({
    title:     a.title,
    url:       a.url,
    source:    a.source,
    publishedAt: a.time_published,
    summary:   a.summary,
    sentiment: a.overall_sentiment_label,
    sentScore: parseFloat(a.overall_sentiment_score) || 0,
    banner:    a.banner_image,
  }));
}

/* ══════════════════════════════════════════════════════════════════
   LOADING SPINNERS
   ══════════════════════════════════════════════════════════════════ */
function setLoading(elId, on) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (on) {
    el.dataset.prevContent = el.innerHTML;
    el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Fetching live data…</div>`;
  } else {
    // Only remove spinner if still showing one (don't overwrite real renders)
    if (el.querySelector(".av-spinner") && el.dataset.prevContent !== undefined) {
      el.innerHTML = el.dataset.prevContent;
    }
  }
}

/* ══════════════════════════════════════════════════════════════════
   HIGH-LEVEL LOADERS  (called from script.js)
   Each merges live AV data into the static DB fallback.
   ══════════════════════════════════════════════════════════════════ */

async function avLoadAll(ticker) {
  const sym = ticker.replace(/.*:/, "").toUpperCase();

  // Guard: require a configured AV key — but still fire FMP if available
  if (!getAvKey()) {
    showApiToast("⚙ Alpha Vantage key not set — click ⚙ API to configure.", "warn");
    if (typeof refreshBadges === "function") refreshBadges();
    // Still try secondary providers even without AV
    if (typeof fmpLoadAll   === "function" && getFmpKey())     fmpLoadAll(sym);
    if (typeof eodhdLoadAll  === "function") eodhdLoadAll(sym);
    if (typeof apitubeLoadAll === "function") apitubeLoadAll(sym);
    if (typeof massiveLoadAll === "function") massiveLoadAll(sym);
    return;
  }

  showApiToast(`↻ Loading live data for ${sym}…`, "info");

  // Fire all AV requests in parallel
  const [quote, overview, earnings, income, balance, cashflow, news] = await Promise.all([
    avGetQuote(sym),
    avGetOverview(sym),
    avGetEarnings(sym),
    avGetIncome(sym),
    avGetBalance(sym),
    avGetCashFlow(sym),
    avGetNews(sym),
  ]);

  // Merge into live cache object
  const live = { sym, quote, overview, earnings, income, balance, cashflow, news };
  avLiveCache[sym] = live;

  // Trigger AV UI updates
  if (quote)    avRenderQuote(sym, quote);
  if (overview) avRenderOverview(sym, overview, quote);
  if (earnings) avRenderEarnings(sym, earnings);
  if (income || balance || cashflow) avRenderFA(sym, income, balance, cashflow);
  if (news)     avRenderNews(sym, news);
  if (overview) avRenderWACC(sym, overview);

  const loaded = [quote,overview,earnings,income,balance,cashflow,news].filter(Boolean).length;
  showApiToast(`✓ ${sym}: AV ${loaded}/7${getFmpKey() ? " · loading FMP…" : ""}`, "ok");
  updateApiStatus();

  // Fire FMP in parallel (non-blocking)
  if (typeof fmpLoadAll === "function" && getFmpKey()) {
    fmpLoadAll(sym).then(() => {
      showApiToast(`✓ ${sym}: all data loaded (AV + FMP)`, "ok");
    });
  }

  // Fire additional providers in parallel
  if (typeof eodhdLoadAll  === "function") eodhdLoadAll(sym);
  if (typeof apitubeLoadAll === "function") apitubeLoadAll(sym);
  if (typeof massiveLoadAll === "function") massiveLoadAll(sym);
}

// In-memory store of live data per ticker
const avLiveCache = {};
function avGetLive(sym) { return avLiveCache[sym.toUpperCase()] || null; }

/* ══════════════════════════════════════════════════════════════════
   RENDER: QUOTE  (overwrites static renderQuote)
   ══════════════════════════════════════════════════════════════════ */
function avRenderQuote(sym, q) {
  const chg    = q.change >= 0 ? "+" : "";
  const chgCls = q.change >= 0 ? "pos" : "neg";
  const pct    = q.changePct.replace("%","");

  const qr = document.getElementById("quote-qr");
  if (qr) qr.innerHTML = `
    <div class="av-live-badge">● LIVE  <span class="av-ts">${q.latestDay}</span></div>
    <div class="quote-grid">
      ${mRow("Last",      `$${fmt(q.price)}`, chgCls)}
      ${mRow("Change",    `${chg}$${fmt(Math.abs(q.change))}  (${chg}${parseFloat(pct).toFixed(2)}%)`, chgCls)}
      ${mRow("Open",      "$"+fmt(q.open))}
      ${mRow("High",      "$"+fmt(q.high),"metric-up")}
      ${mRow("Low",       "$"+fmt(q.low),"metric-down")}
      ${mRow("Prev Close","$"+fmt(q.prevClose))}
      ${mRow("Volume",    Number(q.volume).toLocaleString())}
    </div>
    <div class="av-note">// Real-time bid/ask requires premium AV plan.<br>// Time & Sales data via TradingView chart.</div>`;

  const mon = document.getElementById("quote-mon");
  if (mon) mon.innerHTML = `
    <div class="av-live-badge">● LIVE  <span class="av-ts">${q.latestDay}</span></div>
    ${mRow("Last Price", "$"+fmt(q.price), chgCls)}
    ${mRow("Day Change", `${chg}${parseFloat(pct).toFixed(2)}%`, chgCls)}
    ${mRow("Day High",   "$"+fmt(q.high), "metric-up")}
    ${mRow("Day Low",    "$"+fmt(q.low),  "metric-down")}
    <div class="av-note">// Real-time multi-exchange bid/ask requires<br>// Alpha Vantage Premium or a Websocket feed.</div>`;
}

/* ══════════════════════════════════════════════════════════════════
   RENDER: OVERVIEW → DES + WACC inputs
   ══════════════════════════════════════════════════════════════════ */
function avRenderOverview(sym, ov, quote) {
  const des = document.getElementById("fund-des");
  if (!des) return;

  const price = quote?.price || null;
  const upside = (ov.analystTarget && price)
    ? ((ov.analystTarget / price - 1) * 100).toFixed(1) + "%"
    : "—";

  des.innerHTML = `
    <div class="av-live-badge">● LIVE  <span class="av-ts">${ov.latestQuarter || ""}</span></div>
    ${mRow("Company",       ov.name)}
    ${mRow("Sector",        ov.sector)}
    ${mRow("Industry",      ov.industry)}
    ${mRow("Exchange",      ov.exchange + " · " + ov.currency)}
    ${mRow("Country",       ov.country)}
    ${mRow("Employees",     ov.employees ? Number(ov.employees).toLocaleString() : "—")}
    ${mRow("Address",       ov.address || "—")}
    ${mRow("Fiscal Yr End", ov.fiscalYearEnd || "—")}
    <div class="section-head">Valuation</div>
    ${mRow("Mkt Cap",       fmtB(ov.mktCap))}
    ${mRow("P/E (TTM)",     ov.pe ?? "—")}
    ${mRow("Forward P/E",   ov.forwardPe ?? "—")}
    ${mRow("PEG Ratio",     ov.peg ?? "—")}
    ${mRow("P/B Ratio",     ov.pb ?? "—")}
    ${mRow("P/S (TTM)",     ov.ps ?? "—")}
    ${mRow("EV/Revenue",    ov.evRevenue ?? "—")}
    ${mRow("EV/EBITDA",     ov.evEbitda ?? "—")}
    ${mRow("Beta",          ov.beta ?? "—")}
    <div class="section-head">Per Share</div>
    ${mRow("EPS",           ov.eps != null ? "$"+fmt(ov.eps) : "—")}
    ${mRow("Book Value",    ov.bookValue != null ? "$"+fmt(ov.bookValue) : "—")}
    ${mRow("Div Per Share", ov.divPerShare != null ? "$"+fmt(ov.divPerShare) : "—")}
    ${mRow("Div Yield",     ov.divYield != null ? (ov.divYield*100).toFixed(2)+"%" : "—")}
    <div class="section-head">Margins & Returns</div>
    ${mRow("Revenue (TTM)", fmtB(ov.revTTM))}
    ${mRow("Gross Profit",  fmtB(ov.grossProfit))}
    ${mRow("EBITDA",        fmtB(ov.ebitda))}
    ${mRow("Op. Margin",    ov.operMgn != null ? (ov.operMgn*100).toFixed(1)+"%" : "—")}
    ${mRow("Profit Margin", ov.profitMgn != null ? (ov.profitMgn*100).toFixed(1)+"%" : "—")}
    ${mRow("ROE",           ov.roe != null ? (ov.roe*100).toFixed(1)+"%" : "—")}
    ${mRow("ROA",           ov.roa != null ? (ov.roa*100).toFixed(1)+"%" : "—")}
    <div class="section-head">Price Targets & Technicals</div>
    ${mRow("Analyst Target", ov.analystTarget != null ? "$"+fmt(ov.analystTarget) : "—")}
    ${mRow("Upside to Target", upside)}
    ${mRow("52W High",      ov.week52High != null ? "$"+fmt(ov.week52High) : "—")}
    ${mRow("52W Low",       ov.week52Low  != null ? "$"+fmt(ov.week52Low)  : "—")}
    ${mRow("MA 50",         ov.ma50  != null ? "$"+fmt(ov.ma50)  : "—")}
    ${mRow("MA 200",        ov.ma200 != null ? "$"+fmt(ov.ma200) : "—")}
    <div class="desc-block">${escapeHtml(ov.description || "")}</div>`;
}

/* ══════════════════════════════════════════════════════════════════
   RENDER: EARNINGS  (ERN + EE tabs)
   ══════════════════════════════════════════════════════════════════ */
function avRenderEarnings(sym, earn) {
  const ern = document.getElementById("fund-ern");
  if (ern && earn.quarterly.length) {
    const rows = earn.quarterly.map(q => {
      const sc  = (q.surprisePct ?? 0) >= 0 ? "pos" : "neg";
      const sp  = q.surprisePct != null ? (q.surprisePct >= 0 ? "+" : "") + q.surprisePct.toFixed(2) + "%" : "—";
      const sur = q.surprise   != null ? (q.surprise   >= 0 ? "+" : "") + "$" + fmt(Math.abs(q.surprise)) : "—";
      return `<tr>
        <td>${q.quarter}</td>
        <td>${q.reportDate || "—"}</td>
        <td>${q.epsEst   != null ? "$"+fmt(q.epsEst)    : "—"}</td>
        <td>${q.epsActual!= null ? "$"+fmt(q.epsActual) : "—"}</td>
        <td class="${sc}">${sur}</td>
        <td class="${sc}">${sp}</td>
      </tr>`;
    }).join("");
    ern.innerHTML = `
      <div class="av-live-badge">● LIVE</div>
      ${sHead("Quarterly EPS — Actual vs Estimate")}
      <div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>Quarter</th><th>Report Date</th><th>EPS Est.</th><th>EPS Act.</th><th>Surprise $</th><th>Surprise %</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  }

  // EE tab — show annual actuals as a forward-looking reference
  const ee = document.getElementById("fund-ee");
  if (ee && earn.annual.length) {
    const rows = earn.annual.map(a =>
      `<tr><td>${a.year}</td><td colspan="4" style="text-align:center;color:var(--text-muted)">Historical</td><td>$${a.epsActual != null ? fmt(a.epsActual) : "—"}</td></tr>`
    ).join("");
    ee.innerHTML = `
      <div class="av-live-badge">● LIVE</div>
      <div class="av-note" style="margin-bottom:8px">// Forward analyst estimates require a premium data provider.<br>// Showing annual EPS history from Alpha Vantage.</div>
      ${sHead("Annual EPS (Historical)")}
      <div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>Year</th><th>EPS Low</th><th>EPS Mean</th><th>EPS High</th><th>Rev Mean</th><th>EPS Actual</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  }
}

/* ══════════════════════════════════════════════════════════════════
   RENDER: FINANCIAL STATEMENTS  (FA tab)
   ══════════════════════════════════════════════════════════════════ */
function avRenderFA(sym, income, balance, cashflow) {
  const fa = document.getElementById("fund-fa");
  if (!fa) return;

  let html = `<div class="av-live-badge">● LIVE</div>`;

  if (income?.length) {
    const rows = income.map(r => `<tr>
      <td>${r.year}</td>
      <td>${fmtB(r.revenue)}</td>
      <td>${fmtB(r.grossProfit)}</td>
      <td>${fmtB(r.ebit)}</td>
      <td>${fmtB(r.netIncome)}</td>
      <td>—</td>
    </tr>`).join("");
    html += `${sHead("Income Statement (USD)")}
      <div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>Year</th><th>Revenue</th><th>Gross Profit</th><th>EBIT</th><th>Net Income</th><th>EPS</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  }

  if (balance?.length) {
    const rows = balance.map(r => `<tr>
      <td>${r.year}</td>
      <td>${fmtB(r.totalAssets)}</td>
      <td>${fmtB(r.totalLiab)}</td>
      <td>${fmtB(r.equity)}</td>
      <td>${fmtB(r.cash)}</td>
      <td>${fmtB(r.debt)}</td>
    </tr>`).join("");
    html += `${sHead("Balance Sheet (USD)")}
      <div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>Year</th><th>Total Assets</th><th>Total Liab.</th><th>Equity</th><th>Cash</th><th>Debt</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  }

  if (cashflow?.length) {
    const rows = cashflow.map(r => `<tr>
      <td>${r.year}</td>
      <td>${fmtB(r.operatingCF)}</td>
      <td>${fmtB(r.capex)}</td>
      <td>${fmtB(r.freeCF)}</td>
      <td>${fmtB(r.dividends)}</td>
    </tr>`).join("");
    html += `${sHead("Cash Flow (USD)")}
      <div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>Year</th><th>Operating CF</th><th>CapEx</th><th>Free CF</th><th>Dividends</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  }

  fa.innerHTML = html;
}

/* ══════════════════════════════════════════════════════════════════
   RENDER: NEWS  (delegates to renderNewsFeed in script.js)
   ══════════════════════════════════════════════════════════════════ */
function avRenderNews(sym, articles) {
  if (!articles?.length) return;
  // Normalise AV article shape to match niCard expectations
  const normalised = articles.map(a => ({
    headline:    a.title,
    source:      a.source,
    datetime:    a.publishedAt,   // AV format "20250312T143000"
    sentiment:   a.sentiment,
    category:    null,
    summary:     a.summary,
    url:         a.url,
    image:       a.banner,
  }));
  if (typeof renderNewsFeed === "function") {
    renderNewsFeed(sym, normalised, "av");
  }
}

/* ══════════════════════════════════════════════════════════════════
   RENDER: WACC  (uses live overview data)
   ══════════════════════════════════════════════════════════════════ */
function avRenderWACC(sym, ov) {
  const wc = document.getElementById("fund-wacc");
  if (!wc) return;

  // Estimate WACC components from available data
  const beta        = ov.beta || 1.0;
  const riskFree    = 4.2;   // US 10Y approx
  const erp         = 5.8;
  const ke          = riskFree + beta * erp;
  const kd          = 4.5;   // assumed cost of debt
  const taxRate     = 21;    // US corporate
  const mktCap      = ov.mktCap || 0;
  const totalDebt   = 0;     // AV doesn't expose directly in OVERVIEW
  const totalVal    = mktCap + totalDebt;
  const eW          = totalVal > 0 ? ((mktCap / totalVal) * 100).toFixed(1) : 100;
  const dW          = (100 - parseFloat(eW)).toFixed(1);
  const wacc        = ((parseFloat(eW)/100 * ke) + (parseFloat(dW)/100 * kd * (1 - taxRate/100))).toFixed(2);
  const tg          = 3.0;
  const fcfEst      = ov.ebitda ? ov.ebitda * 0.6 : null;
  const iv          = fcfEst ? fmtB(fcfEst * (1 + tg/100) / (wacc/100 - tg/100)) : "—";

  wc.innerHTML = `
    <div class="av-live-badge">● LIVE data · Estimated WACC</div>
    ${sHead("WACC Calculation")}
    ${mRow("Risk-Free Rate (Rf)",   riskFree+"%")}
    ${mRow("Equity Risk Premium",   erp+"%")}
    ${mRow("Beta (Levered)",        beta)}
    ${mRow("Cost of Equity (Ke)",   ke.toFixed(2)+"%")}
    ${mRow("Pre-Tax Cost of Debt",  kd+"%")}
    ${mRow("Tax Rate (assumed)",    taxRate+"%")}
    ${mRow("Equity Weight",         eW+"%")}
    ${mRow("Debt Weight",           dW+"%")}
    <div class="metric wacc-result"><span>→ WACC</span><span>${wacc}%</span></div>
    ${sHead("DCF Sensitivity")}
    ${mRow("Terminal Growth Rate",  tg+"%")}
    ${mRow("EBITDA (TTM)",          fmtB(ov.ebitda))}
    ${mRow("Implied Intrinsic Value", iv)}
    <div class="av-note" style="margin-top:8px">// Debt weight uses market cap only (full balance sheet<br>// requires BALANCE_SHEET endpoint — loaded in FA tab).</div>`;
}

/* ══════════════════════════════════════════════════════════════════
   TECHNICAL INDICATORS  (Alpha Vantage — RSI · MACD · BBANDS · ATR · OBV)
   Tab: Fundamentals → TECH
   ══════════════════════════════════════════════════════════════════ */

const TECH_CACHE    = {};
const TECH_CACHE_MS = 30 * 60 * 1000; // 30 min

function techCacheGet(sym, fn) {
  const k = `${sym}_${fn}`;
  const c = TECH_CACHE[k];
  return (c && Date.now() - c.ts < TECH_CACHE_MS) ? c.data : null;
}
function techCacheSet(sym, fn, data) {
  TECH_CACHE[`${sym}_${fn}`] = { data, ts: Date.now() };
}

async function avGetIndicator(sym, fn, extra = {}) {
  const cached = techCacheGet(sym, fn);
  if (cached) return cached;
  if (!getAvKey()) return null;
  if (avCallCount() >= 25) return null;
  const params = { function: fn, symbol: sym, apikey: getAvKey(), datatype: "json", ...extra };
  const url = AV_BASE + "?" + new URLSearchParams(params);
  try {
    avIncrementCount();
    const res  = await fetch(url);
    const data = await res.json();
    if (data["Information"] || data["Note"] || data["Error Message"]) return null;
    techCacheSet(sym, fn, data);
    return data;
  } catch(e) { return null; }
}

/* Sparkline SVG helper (inline, 80×32px) */
function techSparkline(values, color = "#4a9eff", label = "") {
  if (!values || values.length < 2) return "";
  const mn = Math.min(...values), mx = Math.max(...values);
  const range = mx - mn || 1;
  const W = 80, H = 28;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - mn) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last = values[values.length - 1];
  const lastY = H - ((last - mn) / range) * H;
  return `<svg width="${W}" height="${H}" style="display:block">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="${W}" cy="${lastY.toFixed(1)}" r="2.5" fill="${color}"/>
  </svg>`;
}

/* Parse AV indicator time series → last N values (newest first from AV, so reverse) */
function techParse(data, seriesKey, valueKey, limit = 30) {
  if (!data) return [];
  const series = data[seriesKey];
  if (!series) return [];
  return Object.entries(series)
    .sort(([a], [b]) => a < b ? -1 : 1)   // sort ascending by date
    .slice(-limit)
    .map(([date, vals]) => ({ date, value: parseFloat(vals[valueKey]) }));
}

/* RSI → signal text */
function rsiSignal(v) {
  if (v >= 70) return { text: "Overbought", cls: "tech-sig-sell" };
  if (v <= 30) return { text: "Oversold",   cls: "tech-sig-buy"  };
  return { text: "Neutral", cls: "tech-sig-neutral" };
}

/* Render the TECH tab */
async function avLoadTech(sym) {
  const el = document.getElementById("fund-tech");
  if (!el) return;
  if (!getAvKey()) {
    el.innerHTML = `<div class="no-data">// Alpha Vantage key required for technical indicators. Set it in ⚙ API Settings.</div>`;
    return;
  }
  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading indicators for ${sym}…</div>`;

  // Fetch all in parallel — each costs 1 AV call (total: 5 calls)
  const [rsiData, macdData, bbandsData, atrData, obvData, smaData] = await Promise.all([
    avGetIndicator(sym, "RSI",    { interval: "daily", time_period: 14,  series_type: "close" }),
    avGetIndicator(sym, "MACD",   { interval: "daily", series_type: "close", fastperiod: 12, slowperiod: 26, signalperiod: 9 }),
    avGetIndicator(sym, "BBANDS", { interval: "daily", time_period: 20,  series_type: "close", nbdevup: 2, nbdevdn: 2 }),
    avGetIndicator(sym, "ATR",    { interval: "daily", time_period: 14 }),
    avGetIndicator(sym, "OBV",    { interval: "daily" }),
    avGetIndicator(sym, "SMA",    { interval: "daily", time_period: 50,  series_type: "close" }),
  ]);

  // ── RSI
  const rsiSeries  = techParse(rsiData,    "Technical Analysis: RSI",    "RSI",         30);
  const rsiLast    = rsiSeries.length ? rsiSeries[rsiSeries.length - 1].value : null;
  const rsiSig     = rsiLast !== null ? rsiSignal(rsiLast) : null;
  const rsiVals    = rsiSeries.map(d => d.value);

  // ── MACD
  const macdSeries = techParse(macdData,   "Technical Analysis: MACD",   "MACD",        30);
  const macdSig    = techParse(macdData,   "Technical Analysis: MACD",   "MACD_Signal", 30);
  const macdHist   = techParse(macdData,   "Technical Analysis: MACD",   "MACD_Hist",   30);
  const macdLast   = macdSeries.length ? macdSeries[macdSeries.length - 1].value : null;
  const macdSigLast = macdSig.length  ? macdSig[macdSig.length - 1].value : null;
  const macdHistLast = macdHist.length ? macdHist[macdHist.length - 1].value : null;

  // ── Bollinger Bands
  const bbUp   = techParse(bbandsData, "Technical Analysis: BBANDS", "Real Upper Band", 30);
  const bbMid  = techParse(bbandsData, "Technical Analysis: BBANDS", "Real Middle Band", 30);
  const bbLow  = techParse(bbandsData, "Technical Analysis: BBANDS", "Real Lower Band", 30);
  const bbW    = bbUp.length ? ((bbUp[bbUp.length-1].value - bbLow[bbLow.length-1].value) / (bbMid[bbMid.length-1].value || 1) * 100).toFixed(2) : null;

  // ── ATR
  const atrSeries = techParse(atrData, "Technical Analysis: ATR", "ATR", 30);
  const atrLast   = atrSeries.length ? atrSeries[atrSeries.length - 1].value : null;

  // ── OBV
  const obvSeries = techParse(obvData, "Technical Analysis: OBV", "OBV", 30);
  const obvLast   = obvSeries.length ? obvSeries[obvSeries.length - 1].value : null;
  const obvPrev   = obvSeries.length >= 2 ? obvSeries[obvSeries.length - 2].value : null;
  const obvTrend  = (obvLast !== null && obvPrev !== null) ? (obvLast > obvPrev ? "↑ Accumulation" : "↓ Distribution") : "—";
  const obvTrendCls = (obvLast !== null && obvPrev !== null) ? (obvLast > obvPrev ? "tech-sig-buy" : "tech-sig-sell") : "";

  // ── SMA 50
  const smaSeries = techParse(smaData, "Technical Analysis: SMA", "SMA", 5);
  const smaLast   = smaSeries.length ? smaSeries[smaSeries.length - 1].value : null;

  const fmt2 = v => v !== null ? parseFloat(v).toFixed(2) : "—";
  const fmtM = v => v !== null ? (Math.abs(v) >= 1e9 ? (v/1e9).toFixed(2)+"B" : Math.abs(v) >= 1e6 ? (v/1e6).toFixed(1)+"M" : v.toFixed(0)) : "—";

  el.innerHTML = `
  <div class="av-live-badge">● Technical Indicators · ${sym} · Daily</div>

  <div class="tech-grid">

    <!-- RSI -->
    <div class="tech-card">
      <div class="tech-card-hd">RSI (14)</div>
      <div class="tech-card-val ${rsiSig ? rsiSig.cls : ''}">${fmt2(rsiLast)}</div>
      <div class="tech-card-sig">${rsiSig ? rsiSig.text : '—'}</div>
      ${techSparkline(rsiVals, rsiLast >= 70 ? "#e55" : rsiLast <= 30 ? "#4a9" : "#4a9eff")}
      <div class="tech-card-note">Overbought &gt;70 · Oversold &lt;30</div>
    </div>

    <!-- MACD -->
    <div class="tech-card">
      <div class="tech-card-hd">MACD (12,26,9)</div>
      <div class="tech-card-val ${macdLast !== null ? (macdLast > macdSigLast ? 'tech-sig-buy' : 'tech-sig-sell') : ''}">${fmt2(macdLast)}</div>
      <div class="tech-card-sig">${macdLast !== null ? (macdLast > macdSigLast ? "Bullish crossover" : "Bearish crossover") : "—"}</div>
      ${techSparkline(macdHist.map(d => d.value), macdHistLast >= 0 ? "#4a9" : "#e55")}
      <div class="tech-card-note">Signal: ${fmt2(macdSigLast)} · Hist: ${fmt2(macdHistLast)}</div>
    </div>

    <!-- Bollinger Bands -->
    <div class="tech-card">
      <div class="tech-card-hd">Bollinger Bands (20,2)</div>
      <div class="tech-card-val">${bbW !== null ? bbW+"%" : "—"}</div>
      <div class="tech-card-sig">Band width</div>
      ${techSparkline(bbMid.map(d => d.value), "#8b6")}
      <div class="tech-card-note">Upper: ${fmt2(bbUp.length ? bbUp[bbUp.length-1].value : null)} · Lower: ${fmt2(bbLow.length ? bbLow[bbLow.length-1].value : null)}</div>
    </div>

    <!-- ATR -->
    <div class="tech-card">
      <div class="tech-card-hd">ATR (14)</div>
      <div class="tech-card-val">${fmt2(atrLast)}</div>
      <div class="tech-card-sig">Avg True Range</div>
      ${techSparkline(atrSeries.map(d => d.value), "#f90")}
      <div class="tech-card-note">Volatility proxy · higher = wider swings</div>
    </div>

    <!-- OBV -->
    <div class="tech-card">
      <div class="tech-card-hd">OBV</div>
      <div class="tech-card-val">${fmtM(obvLast)}</div>
      <div class="tech-card-sig ${obvTrendCls}">${obvTrend}</div>
      ${techSparkline(obvSeries.map(d => d.value), "#7c9")}
      <div class="tech-card-note">On-Balance Volume</div>
    </div>

    <!-- SMA 50 -->
    <div class="tech-card">
      <div class="tech-card-hd">SMA (50)</div>
      <div class="tech-card-val">${fmt2(smaLast)}</div>
      <div class="tech-card-sig">50-day moving avg</div>
      ${techSparkline(smaSeries.map(d => d.value), "#a8f")}
      <div class="tech-card-note">Support/resistance reference</div>
    </div>

  </div>`;
}
