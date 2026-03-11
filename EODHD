/* ══════════════════════════════════════════════════════════════════
   FINTERM — eodhd.js
   EODHD Historical Data integration layer
   • Endpoints: Live Quote · Fundamentals · News · Earnings Calendar
                Dividends · Screener
   • Symbol format: TICKER.EXCHANGE  (e.g. AAPL.US, ENI.MI, SAP.XETRA)
   • Base URL: https://eodhd.com/api/
   • Auth: ?api_token=KEY&fmt=json
   ══════════════════════════════════════════════════════════════════ */

const EODHD_BASE = "https://eodhd.com/api";
const EODHD_SESSION_KEY = "eodhd_call_count";

/* ── Key helper ─────────────────────────────────────────────────── */
function getEodhdKey() {
  return (window._KEYS && window._KEYS["eodhd"])
    || localStorage.getItem("finterm_key_eodhd")
    || "";
}

/* ── Call counter ────────────────────────────────────────────────── */
function eodhdCallCount() {
  return parseInt(sessionStorage.getItem(EODHD_SESSION_KEY) || "0");
}
function eodhdBumpCount() {
  const n = eodhdCallCount() + 1;
  sessionStorage.setItem(EODHD_SESSION_KEY, n);
  return n;
}

/* ── Symbol resolver: converts FINTERM ticker → EODHD format ────── */
// MIL:ENI  → ENI.MI
// XETRA:SAP → SAP.XETRA
// NYSE:IBM  → IBM.NYSE
// AAPL      → AAPL.US  (default US)
const EODHD_EXCHANGE_MAP = {
  "MIL":    "MI",
  "XETRA":  "XETRA",
  "NYSE":   "NYSE",
  "NASDAQ": "NASDAQ",
  "LSE":    "LSE",
  "EPA":    "PA",
  "ETR":    "XETRA",
  "AMS":    "AS",
  "BIT":    "MI",
  "TSX":    "TO",
  "ASX":    "AX",
  "TSE":    "T",
  "KRX":    "KO",
  "HKG":    "HK",
  "SHA":    "SS",
  "SHE":    "SZ",
  "BSE":    "BO",
  "NSE":    "NS",
};

function toEodhdSymbol(raw) {
  const parts = raw.trim().toUpperCase().split(":");
  if (parts.length === 2) {
    const exch = EODHD_EXCHANGE_MAP[parts[0]] || parts[0];
    return `${parts[1]}.${exch}`;
  }
  return `${parts[0]}.US`;
}

/* ── Core fetch ─────────────────────────────────────────────────── */
async function eodhdFetch(path, params = {}) {
  const key = getEodhdKey();
  if (!key) return null;
  const url = new URL(`${EODHD_BASE}${path}`);
  url.searchParams.set("api_token", key);
  url.searchParams.set("fmt", "json");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const cacheKey = `eodhd_${url.toString()}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch(_) {}
  }

  eodhdBumpCount();
  try {
    const r = await fetch(url.toString());
    if (!r.ok) return null;
    const data = await r.json();
    sessionStorage.setItem(cacheKey, JSON.stringify(data));
    return data;
  } catch(_) { return null; }
}

/* ══════════════════════════════════════════════════════════════════
   DATA FETCHERS
   ══════════════════════════════════════════════════════════════════ */

/* ── Live / EOD Quote ───────────────────────────────────────────── */
async function eodhdGetQuote(sym) {
  const data = await eodhdFetch(`/real-time/${sym}`, { s: sym });
  if (!data || data.code === undefined) return null;
  return {
    symbol:    data.code,
    price:     parseFloat(data.close) || parseFloat(data.previousClose) || 0,
    open:      parseFloat(data.open)  || 0,
    high:      parseFloat(data.high)  || 0,
    low:       parseFloat(data.low)   || 0,
    prevClose: parseFloat(data.previousClose) || 0,
    change:    parseFloat(data.change) || 0,
    changePct: parseFloat(data.change_p) || 0,
    volume:    parseInt(data.volume) || 0,
    timestamp: data.timestamp,
  };
}

/* ── Fundamentals ───────────────────────────────────────────────── */
async function eodhdGetFundamentals(sym) {
  const data = await eodhdFetch(`/fundamentals/${sym}`);
  if (!data || !data.General) return null;
  const g  = data.General || {};
  const h  = data.Highlights || {};
  const v  = data.Valuation || {};
  const te = data.Technicals || {};
  const sh = data.SharesStats || {};
  const ep = data.Earnings?.Annual || {};
  const bs = data.Financials?.Balance_Sheet?.annual || {};
  const is = data.Financials?.Income_Statement?.annual || {};
  const cf = data.Financials?.Cash_Flow?.annual || {};

  // Latest annual financials
  const latestYear = Object.keys(is).sort().reverse()[0];
  const latestBS   = Object.keys(bs).sort().reverse()[0];
  const latestCF   = Object.keys(cf).sort().reverse()[0];
  const isL  = is[latestYear]  || {};
  const bsL  = bs[latestBS]    || {};
  const cfL  = cf[latestCF]    || {};

  return {
    name:           g.Name,
    exchange:       g.Exchange,
    currency:       g.CurrencyCode,
    sector:         g.Sector,
    industry:       g.Industry,
    country:        g.CountryName,
    employees:      g.FullTimeEmployees,
    description:    g.Description,
    isin:           g.ISIN,
    ipoDate:        g.IPODate,
    fiscalYearEnd:  g.FiscalYearEnd,
    // highlights
    mktCap:         parseFloat(h.MarketCapitalization) || null,
    ebitda:         parseFloat(h.EBITDA) || null,
    pe:             parseFloat(h.PERatio) || null,
    eps:            parseFloat(h.EarningsShare) || null,
    bookValue:      parseFloat(h.BookValue) || null,
    divPerShare:    parseFloat(h.DividendShare) || null,
    divYield:       parseFloat(h.DividendYield) || null,
    profitMgn:      parseFloat(h.ProfitMargin) || null,
    operMgn:        parseFloat(h.OperatingMarginTTM) || null,
    roe:            parseFloat(h.ReturnOnEquityTTM) || null,
    roa:            parseFloat(h.ReturnOnAssetsTTM) || null,
    revTTM:         parseFloat(h.RevenueTTM) || null,
    revPerShare:    parseFloat(h.RevenuePerShareTTM) || null,
    grossProfit:    parseFloat(h.GrossProfitTTM) || null,
    analystTarget:  parseFloat(h.AnalystTargetPrice) || null,
    // valuation
    forwardPe:      parseFloat(v.ForwardPE) || null,
    peg:            parseFloat(v.PEGRatio) || null,
    ps:             parseFloat(v.PriceSalesTTM) || null,
    pb:             parseFloat(v.PriceBookMRQ) || null,
    evRevenue:      parseFloat(v.EnterpriseValueRevenue) || null,
    evEbitda:       parseFloat(v.EnterpriseValueEbitda) || null,
    // technicals
    beta:           parseFloat(te.Beta) || null,
    wk52High:       parseFloat(te["52WeekHigh"]) || null,
    wk52Low:        parseFloat(te["52WeekLow"]) || null,
    ma50:           parseFloat(te["50DayMA"]) || null,
    ma200:          parseFloat(te["200DayMA"]) || null,
    // shares
    sharesFloat:    parseFloat(sh.SharesFloat) || null,
    sharesOut:      parseFloat(sh.SharesOutstanding) || null,
    shortRatio:     parseFloat(sh.ShortRatio) || null,
    // latest income
    revenue:        parseFloat(isL.totalRevenue) || null,
    netIncome:      parseFloat(isL.netIncome) || null,
    grossProfitAnn: parseFloat(isL.grossProfit) || null,
    ebitAnn:        parseFloat(isL.ebit) || null,
    // latest balance
    totalAssets:    parseFloat(bsL.totalAssets) || null,
    totalLiab:      parseFloat(bsL.totalLiab) || null,
    equity:         parseFloat(bsL.totalStockholderEquity) || null,
    cash:           parseFloat(bsL.cash) || null,
    debt:           parseFloat(bsL.longTermDebt) || null,
    // latest cashflow
    operatingCF:    parseFloat(cfL.totalCashFromOperatingActivities) || null,
    capex:          parseFloat(cfL.capitalExpenditures) || null,
    freeCF:         (parseFloat(cfL.totalCashFromOperatingActivities) || 0) -
                    Math.abs(parseFloat(cfL.capitalExpenditures) || 0),
    // earnings history
    earningsAnnual: Object.values(ep).slice(0,5).map(e => ({
      year: e.date?.slice(0,4),
      epsActual: parseFloat(e.epsActual) || null,
    })),
  };
}

/* ── News ────────────────────────────────────────────────────────── */
async function eodhdGetNews(sym, limit = 20) {
  const data = await eodhdFetch(`/news`, { s: sym, limit, offset: 0 });
  if (!data || !Array.isArray(data)) return null;
  return data.slice(0, limit).map(a => ({
    title:       a.title,
    url:         a.url,
    source:      a.link ? new URL(a.link).hostname.replace("www.","") : "—",
    publishedAt: a.date,
    summary:     a.content?.slice(0,250) || "",
    sentiment:   a.sentiment?.polarity > 0.1 ? "Bullish"
               : a.sentiment?.polarity < -0.1 ? "Bearish" : "Neutral",
    sentScore:   parseFloat(a.sentiment?.polarity) || 0,
  }));
}

/* ── Earnings Calendar ───────────────────────────────────────────── */
async function eodhdGetEarningsCalendar(sym) {
  const from = new Date().toISOString().slice(0,10);
  const to   = new Date(Date.now() + 365*24*3600*1000).toISOString().slice(0,10);
  const data = await eodhdFetch(`/calendar/earnings`, { symbols: sym, from, to });
  if (!data || !data.earnings) return [];
  return (data.earnings || []).slice(0,6).map(e => ({
    date:    e.report_date || e.date || "—",
    type:    "Earnings",
    title:   `${sym} Earnings`,
    note:    `EPS Est: ${e.estimate != null ? "$"+parseFloat(e.estimate).toFixed(2) : "—"}`,
  }));
}

/* ── Dividends ───────────────────────────────────────────────────── */
async function eodhdGetDividends(sym) {
  const from = new Date(Date.now() - 3*365*24*3600*1000).toISOString().slice(0,10);
  const data = await eodhdFetch(`/div/${sym}`, { from });
  if (!data || !Array.isArray(data)) return null;
  return data.slice(-8).reverse().map(d => ({
    date:    d.date,
    amount:  parseFloat(d.value) || 0,
    currency: d.currency || "USD",
  }));
}

/* ── Screener (bulk quote for watchlist) ─────────────────────────── */
async function eodhdGetBulkQuote(tickers) {
  // tickers = array of FINTERM raw strings, e.g. ["AAPL","MIL:ENI"]
  const syms = tickers.map(toEodhdSymbol);
  const exchange = "US"; // bulk endpoint works per-exchange; use US as default
  const usTickers = syms.filter(s => s.endsWith(".US")).map(s => s.replace(".US",""));
  if (!usTickers.length) return null;
  const data = await eodhdFetch(`/eod-bulk-last-day/${exchange}`, {
    symbols: usTickers.join(","),
    filter: "extended",
  });
  if (!data || !Array.isArray(data)) return null;
  const map = {};
  data.forEach(q => {
    map[q.code] = {
      price:     parseFloat(q.adjusted_close || q.close) || null,
      change:    parseFloat(q.change) || null,
      changePct: parseFloat(q.change_p) || null,
      volume:    parseInt(q.volume) || null,
      mktCap:    parseFloat(q.market_capitalization) || null,
    };
  });
  return map;
}

/* ══════════════════════════════════════════════════════════════════
   RENDER FUNCTIONS
   ══════════════════════════════════════════════════════════════════ */

function eodEsc(s) { return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function eodFmt(n, d=2) { if (n == null || isNaN(n)) return "—"; return Number(n).toLocaleString("en-US", {minimumFractionDigits:d, maximumFractionDigits:d}); }
function eodFmtB(n) { if (!n) return "—"; const a=Math.abs(n); if(a>=1e12)return(n/1e12).toFixed(2)+"T"; if(a>=1e9)return(n/1e9).toFixed(2)+"B"; if(a>=1e6)return(n/1e6).toFixed(2)+"M"; return n.toLocaleString(); }
function eodRow(label, val, cls="") { return `<div class="metric-row ${cls}"><span class="metric-label">${eodEsc(label)}</span><span class="metric-value">${val ?? "—"}</span></div>`; }
function eodSec(title) { return `<div class="section-head">${eodEsc(title)}</div>`; }

/* ── Quote panel (QR tab) ────────────────────────────────────────── */
function eodhdRenderQuote(sym, q) {
  const qr = document.getElementById("quote-qr");
  if (!qr || !q) return;
  const sgn = q.change >= 0 ? "+" : "";
  const cls = q.change >= 0 ? "pos" : "neg";
  qr.innerHTML = `
    <div class="av-live-badge">● EOD  <span class="av-ts">${q.timestamp ? new Date(q.timestamp*1000).toLocaleDateString() : ""}</span></div>
    <div class="quote-grid">
      ${eodRow("Last",       "$"+eodFmt(q.price), cls)}
      ${eodRow("Change",     `${sgn}$${eodFmt(Math.abs(q.change))} (${sgn}${eodFmt(q.changePct)}%)`, cls)}
      ${eodRow("Open",       "$"+eodFmt(q.open))}
      ${eodRow("High",       "$"+eodFmt(q.high), "metric-up")}
      ${eodRow("Low",        "$"+eodFmt(q.low),  "metric-down")}
      ${eodRow("Prev Close", "$"+eodFmt(q.prevClose))}
      ${eodRow("Volume",     Number(q.volume).toLocaleString())}
    </div>
    <div class="av-note">// Source: EODHD real-time quote (15-min delay on free plan)</div>`;
}

/* ── Fundamentals: DES tab ───────────────────────────────────────── */
function eodhdRenderDES(sym, f, q) {
  const des = document.getElementById("fund-des");
  if (!des || !f) return;
  const price = q?.price || null;
  const upside = (f.analystTarget && price)
    ? ((f.analystTarget/price - 1)*100).toFixed(1)+"%" : "—";
  des.innerHTML = `
    <div class="av-live-badge">● LIVE — EODHD</div>
    ${eodRow("Company",      eodEsc(f.name))}
    ${eodRow("ISIN",         eodEsc(f.isin || "—"))}
    ${eodRow("Exchange",     eodEsc((f.exchange||"")+" · "+(f.currency||"")))}
    ${eodRow("Sector",       eodEsc(f.sector))}
    ${eodRow("Industry",     eodEsc(f.industry))}
    ${eodRow("Country",      eodEsc(f.country))}
    ${eodRow("Employees",    f.employees ? Number(f.employees).toLocaleString() : "—")}
    ${eodRow("IPO Date",     eodEsc(f.ipoDate || "—"))}
    ${eodRow("Fiscal Yr End",eodEsc(f.fiscalYearEnd || "—"))}
    ${eodSec("Valuation")}
    ${eodRow("Mkt Cap",      eodFmtB(f.mktCap))}
    ${eodRow("P/E (TTM)",    eodFmt(f.pe,2))}
    ${eodRow("Forward P/E",  eodFmt(f.forwardPe,2))}
    ${eodRow("PEG",          eodFmt(f.peg,2))}
    ${eodRow("P/B",          eodFmt(f.pb,2))}
    ${eodRow("P/S (TTM)",    eodFmt(f.ps,2))}
    ${eodRow("EV/Revenue",   eodFmt(f.evRevenue,2))}
    ${eodRow("EV/EBITDA",    eodFmt(f.evEbitda,2))}
    ${eodRow("Beta",         eodFmt(f.beta,2))}
    ${eodSec("Per Share")}
    ${eodRow("EPS",          f.eps    != null ? "$"+eodFmt(f.eps)    : "—")}
    ${eodRow("Book Value",   f.bookValue != null ? "$"+eodFmt(f.bookValue) : "—")}
    ${eodRow("Div Per Share",f.divPerShare != null ? "$"+eodFmt(f.divPerShare) : "—")}
    ${eodRow("Div Yield",    f.divYield != null ? eodFmt(f.divYield*100,2)+"%" : "—")}
    ${eodRow("Analyst Target","$"+eodFmt(f.analystTarget))}
    ${eodRow("Upside to Target", upside, f.analystTarget && price ? (f.analystTarget > price ? "metric-up":"metric-down") : "")}
    ${eodSec("Margins & Returns")}
    ${eodRow("Revenue (TTM)", eodFmtB(f.revTTM))}
    ${eodRow("Gross Profit",  eodFmtB(f.grossProfit))}
    ${eodRow("EBITDA",        eodFmtB(f.ebitda))}
    ${eodRow("Op. Margin",    f.operMgn != null ? eodFmt(f.operMgn*100,1)+"%" : "—")}
    ${eodRow("Profit Margin", f.profitMgn != null ? eodFmt(f.profitMgn*100,1)+"%" : "—")}
    ${eodRow("ROE",           f.roe != null ? eodFmt(f.roe*100,1)+"%" : "—")}
    ${eodRow("ROA",           f.roa != null ? eodFmt(f.roa*100,1)+"%" : "—")}
    ${eodSec("Technicals")}
    ${eodRow("52W High",      "$"+eodFmt(f.wk52High))}
    ${eodRow("52W Low",       "$"+eodFmt(f.wk52Low))}
    ${eodRow("MA 50",         "$"+eodFmt(f.ma50))}
    ${eodRow("MA 200",        "$"+eodFmt(f.ma200))}
    ${eodRow("Short Ratio",   eodFmt(f.shortRatio,2))}
    ${f.description ? `<div class="section-head">Description</div><div class="av-note" style="white-space:normal;line-height:1.6">${eodEsc(f.description.slice(0,600))}${f.description.length>600?"…":""}</div>` : ""}`;
}

/* ── Fundamentals: FA tab ────────────────────────────────────────── */
function eodhdRenderFA(sym, f) {
  const fa = document.getElementById("fund-fa");
  if (!fa || !f) return;
  fa.innerHTML = `
    <div class="av-live-badge">● LIVE — EODHD Financials</div>
    ${eodSec("Latest Annual Income")}
    ${eodRow("Revenue",     eodFmtB(f.revenue))}
    ${eodRow("Gross Profit",eodFmtB(f.grossProfitAnn))}
    ${eodRow("EBIT",        eodFmtB(f.ebitAnn))}
    ${eodRow("Net Income",  eodFmtB(f.netIncome))}
    ${eodSec("Latest Balance Sheet")}
    ${eodRow("Total Assets",eodFmtB(f.totalAssets))}
    ${eodRow("Total Liab",  eodFmtB(f.totalLiab))}
    ${eodRow("Equity",      eodFmtB(f.equity))}
    ${eodRow("Cash",        eodFmtB(f.cash))}
    ${eodRow("LT Debt",     eodFmtB(f.debt))}
    ${eodSec("Latest Cash Flow")}
    ${eodRow("Operating CF",eodFmtB(f.operatingCF))}
    ${eodRow("CapEx",       eodFmtB(f.capex))}
    ${eodRow("Free CF",     eodFmtB(f.freeCF))}
    ${eodSec("Shares")}
    ${eodRow("Shares Out",  f.sharesOut ? Number(f.sharesOut).toLocaleString() : "—")}
    ${eodRow("Float",       f.sharesFloat ? Number(f.sharesFloat).toLocaleString() : "—")}`;
}

/* ── News tab (CN) ───────────────────────────────────────────────── */
function eodhdRenderNews(sym, articles) {
  const cn = document.getElementById("news-cn");
  if (!cn || !articles?.length) return;
  const sentClass = s => s === "Bullish" ? "pos" : s === "Bearish" ? "neg" : "neutral";
  cn.innerHTML = `
    <div class="av-live-badge">● LIVE — EODHD News  <span class="av-ts">${articles.length} articles</span></div>
    <div class="news-list">
      ${articles.map(a => `
        <div class="news-item">
          <a href="${eodEsc(a.url)}" target="_blank" rel="noopener noreferrer">${eodEsc(a.title)}</a>
          <div class="news-meta">
            ${eodEsc(a.source)}
            &nbsp;·&nbsp; ${a.publishedAt ? a.publishedAt.slice(0,10) : ""}
            ${a.sentiment !== "Neutral" ? `&nbsp;<span class="${sentClass(a.sentiment)}">${eodEsc(a.sentiment)}</span>` : ""}
          </div>
          ${a.summary ? `<div class="news-summary">${eodEsc(a.summary)}…</div>` : ""}
        </div>`).join("")}
    </div>`;
}

/* ── Events tab (EVTS) — earnings calendar + dividends ──────────── */
function eodhdRenderEvents(sym, calendar, dividends) {
  const evts = document.getElementById("news-evts");
  if (!evts) return;
  const calRows = (calendar || []).map(e => `
    <div class="news-item">
      <div class="metric-row">
        <span class="metric-label">📅 ${eodEsc(e.date)}</span>
        <span class="metric-value">${eodEsc(e.type)}</span>
      </div>
      <div class="news-meta">${eodEsc(e.note)}</div>
    </div>`).join("") || '<div class="no-data">// No upcoming earnings found</div>';

  const divRows = (dividends || []).map(d => `
    <div class="metric-row">
      <span class="metric-label">${eodEsc(d.date)}</span>
      <span class="metric-value">$${eodFmt(d.amount)}</span>
    </div>`).join("") || '<div class="no-data">// No dividends found</div>';

  evts.innerHTML = `
    <div class="av-live-badge">● LIVE — EODHD Calendar</div>
    <div class="section-head">Upcoming Earnings</div>
    ${calRows}
    <div class="section-head" style="margin-top:12px">Recent Dividends</div>
    ${divRows}`;
}

/* ══════════════════════════════════════════════════════════════════
   HIGH-LEVEL LOADER
   ══════════════════════════════════════════════════════════════════ */
const eodhdLiveCache = {};

async function eodhdLoadAll(rawTicker) {
  if (!getEodhdKey()) return;

  const sym = toEodhdSymbol(rawTicker);
  const bare = rawTicker.replace(/.*:/,"").toUpperCase();

  showApiToast(`↻ EODHD: loading ${sym}…`, "info");

  const [quote, fund, news, calendar, dividends] = await Promise.all([
    eodhdGetQuote(sym),
    eodhdGetFundamentals(sym),
    eodhdGetNews(sym, 25),
    eodhdGetEarningsCalendar(sym),
    eodhdGetDividends(sym),
  ]);

  eodhdLiveCache[bare] = { sym, quote, fund, news, calendar, dividends };

  if (quote)    eodhdRenderQuote(bare, quote);
  if (fund)     eodhdRenderDES(bare, fund, quote);
  if (fund)     eodhdRenderFA(bare, fund);
  if (news)     eodhdRenderNews(bare, news);
  if (calendar || dividends) eodhdRenderEvents(bare, calendar, dividends);

  const loaded = [quote, fund, news, calendar, dividends].filter(Boolean).length;
  showApiToast(`✓ EODHD: ${sym} ${loaded}/5 datasets loaded`, "ok");
}
