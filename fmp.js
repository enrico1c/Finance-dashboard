/* ══════════════════════════════════════════════════════════════════
   FINTERM — fmp.js
   Financial Modeling Prep integration layer
   Covers: ANR, EE, HDS, MGMT, EVTS, Ratios, Watchlist prices
   Auth: ?apikey=KEY  (appended to every request)
   ══════════════════════════════════════════════════════════════════ */

/* ── ⚙️  Keys are managed via the ⚙ API button in the UI ────────── */
/* Use the modal to paste your FMP key — stored in localStorage.     */

// Runtime key: config.js stores under finterm_key_fmp (via lsId = id => `finterm_key_${id}`)
function getFmpKey() {
  return (window._KEYS && window._KEYS["fmp"])
    || localStorage.getItem("finterm_key_fmp")
    || localStorage.getItem("finterm_fmp_key")   // legacy fallback
    || "";
}

const FMP_BASE    = "https://financialmodelingprep.com/api";
const FMP_CACHE_TTL = 15 * 60 * 1000;  // 15 min
const FMP_SESSION_KEY = "fmp_call_count";

/* ══════════════════════════════════════════════════════════════════
   RATE TRACKER
   ══════════════════════════════════════════════════════════════════ */
function fmpCallCount()  { return parseInt(sessionStorage.getItem(FMP_SESSION_KEY) || "0"); }
function fmpIncrement()  {
  const n = fmpCallCount() + 1;
  sessionStorage.setItem(FMP_SESSION_KEY, n);
  if (typeof renderTopbarBadges === "function") renderTopbarBadges();
  return n;
}
function updateFmpStatus() {
  if (typeof renderTopbarBadges === "function") renderTopbarBadges();
}

/* ══════════════════════════════════════════════════════════════════
   CACHE
   ══════════════════════════════════════════════════════════════════ */
function fmpCacheKey(endpoint, symbol) { return `fmp_${endpoint}_${(symbol||"").toUpperCase()}`; }

function fmpCacheGet(endpoint, symbol) {
  try {
    const raw = sessionStorage.getItem(fmpCacheKey(endpoint, symbol));
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > FMP_CACHE_TTL) { sessionStorage.removeItem(fmpCacheKey(endpoint, symbol)); return null; }
    return data;
  } catch { return null; }
}

function fmpCacheSet(endpoint, symbol, data) {
  try { sessionStorage.setItem(fmpCacheKey(endpoint, symbol), JSON.stringify({ ts: Date.now(), data })); }
  catch { /* quota exceeded */ }
}

/* ══════════════════════════════════════════════════════════════════
   CORE FETCH
   ══════════════════════════════════════════════════════════════════ */
async function fmpFetch(path, symbol, params = {}) {
  const endpoint = path + (symbol ? "_" + symbol : "");
  const cached   = fmpCacheGet(endpoint, symbol || "");
  if (cached !== null) return cached;

  const qs  = new URLSearchParams({ ...params, apikey: getFmpKey() }).toString();
  const url = `${FMP_BASE}${path}?${qs}`;

  try {
    fmpIncrement();
    const res  = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data && data["Error Message"]) {
      showApiToast("FMP: " + data["Error Message"].slice(0, 80), "error");
      return null;
    }
    // FMP returns empty array for unknown symbols
    if (Array.isArray(data) && data.length === 0) return [];

    fmpCacheSet(endpoint, symbol || "", data);
    return data;
  } catch (e) {
    showApiToast("FMP error: " + e.message, "error");
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════════
   ENDPOINT WRAPPERS
   ══════════════════════════════════════════════════════════════════ */

/* ── Analyst Ratings + Price Targets ───────────────────────────── */
async function fmpGetAnalystRatings(symbol) {
  const data = await fmpFetch(`/v3/analyst-stock-recommendations/${symbol}`, symbol);
  if (!data || !data.length) return null;
  // Aggregate last 90 days
  const recent = data.slice(0, 30);
  let buy = 0, hold = 0, sell = 0;
  recent.forEach(r => {
    const rating = (r.analystRatingsStrongBuy + r.analystRatingsBuy);
    buy  += r.analystRatingsStrongBuy + r.analystRatingsBuy;
    hold += r.analystRatingsHold;
    sell += r.analystRatingsStrongSell + r.analystRatingsSell;
  });
  return { buy, hold, sell, total: buy + hold + sell, latestDate: recent[0]?.date };
}

async function fmpGetPriceTargets(symbol) {
  const data = await fmpFetch(`/v4/price-target`, symbol, { symbol });
  if (!data || !data.length) return null;
  const targets = data.slice(0, 12).map(t => ({
    firm:       t.analystCompany,
    analyst:    t.analystName || "—",
    target:     parseFloat(t.priceTarget) || null,
    date:       t.publishedDate?.slice(0, 10) || "—",
    action:     t.newsTitle || "—",
    rating:     t.newsTitle?.toLowerCase().includes("buy")   ? "Buy"  :
                t.newsTitle?.toLowerCase().includes("sell")  ? "Sell" :
                t.newsTitle?.toLowerCase().includes("hold")  ? "Hold" :
                t.newsTitle?.toLowerCase().includes("neutral")? "Hold": "—",
  }));
  const prices = targets.map(t => t.target).filter(Boolean);
  return {
    ratings: targets,
    avgTarget:  prices.length ? prices.reduce((a,b)=>a+b,0)/prices.length : null,
    highTarget: prices.length ? Math.max(...prices) : null,
    lowTarget:  prices.length ? Math.min(...prices) : null,
  };
}

/* ── Earnings Estimates (Forward EPS + Revenue) ────────────────── */
async function fmpGetEarningsEstimates(symbol) {
  const data = await fmpFetch(`/v3/analyst-estimates/${symbol}`, symbol, { period: "quarterly", limit: 6 });
  if (!data || !data.length) return null;
  return data.slice(0, 6).map(e => ({
    period:    e.date?.slice(0, 7) + "E",
    epsLow:    parseFloat(e.estimatedEpsAvg)  || null,
    epsMean:   parseFloat(e.estimatedEpsAvg)  || null,
    epsHigh:   parseFloat(e.estimatedEpsHigh) || null,
    revMean:   parseFloat(e.estimatedRevenueAvg) / 1e9 || null,
    analysts:  e.numberAnalystEstimatedRevenue || "—",
  }));
}

/* ── Insider Transactions ───────────────────────────────────────── */
async function fmpGetInsiders(symbol) {
  const data = await fmpFetch(`/v4/insider-trading`, symbol, { symbol, limit: 20 });
  if (!data || !data.length) return null;
  return data.slice(0, 15).map(t => ({
    name:    t.reportingName || "—",
    title:   t.typeOfOwner   || "—",
    shares:  t.securitiesTransacted ? Number(t.securitiesTransacted).toLocaleString() : "—",
    value:   t.price && t.securitiesTransacted ? fmtB(t.price * t.securitiesTransacted) : "—",
    action:  t.transactionType?.includes("P-Purchase") ? "Buy"
           : t.transactionType?.includes("S-Sale")     ? "Sell" : t.transactionType || "—",
    change:  t.securitiesTransacted ? (t.transactionType?.includes("P") ? "+" : "-")
             + Number(Math.abs(t.securitiesTransacted)).toLocaleString() : "—",
    date:    t.transactionDate?.slice(0, 10) || "—",
  }));
}

/* ── Institutional Holders ─────────────────────────────────────── */
async function fmpGetInstitutional(symbol) {
  const data = await fmpFetch(`/v3/institutional-holder/${symbol}`, symbol);
  if (!data || !data.length) return null;
  const total = data.reduce((s, h) => s + (h.shares || 0), 0);
  return data.slice(0, 12).map(h => ({
    name:    h.holder     || "—",
    shares:  h.shares     ? (h.shares >= 1e9 ? (h.shares/1e9).toFixed(2)+"B" : (h.shares/1e6).toFixed(0)+"M") : "—",
    pct:     total > 0    ? ((h.shares / total) * 100).toFixed(2) : "—",
    change:  h.change     ? (h.change > 0 ? "+" : "") + (h.change >= 1e6 ? (h.change/1e6).toFixed(1)+"M" : h.change.toLocaleString()) : "0",
    type:    "Institutional",
  }));
}

/* ── Management / Executives ────────────────────────────────────── */
async function fmpGetManagement(symbol) {
  const data = await fmpFetch(`/v3/key-executives/${symbol}`, symbol);
  if (!data || !data.length) return null;
  return data.slice(0, 10).map(e => ({
    name:  e.name  || "—",
    role:  e.title || "—",
    pay:   e.pay   ? "$" + Number(e.pay).toLocaleString() : "—",
    since: e.yearBorn ? new Date().getFullYear() - (e.yearBorn + 25) + "~" : "—",
    age:   e.yearBorn ? new Date().getFullYear() - e.yearBorn : "—",
  }));
}

/* ── Earnings Calendar / Events ─────────────────────────────────── */
async function fmpGetEarningsCalendar(symbol) {
  // Future earnings dates for this symbol
  const from = new Date().toISOString().slice(0,10);
  const to   = new Date(Date.now() + 365*24*3600*1000).toISOString().slice(0,10);
  const data = await fmpFetch(`/v3/earning_calendar`, symbol, { symbol, from, to });
  if (!data) return [];
  return (Array.isArray(data) ? data : []).slice(0, 4).map(e => ({
    date:  e.date   || "—",
    type:  "Earnings",
    title: `${symbol} Earnings — ${e.date?.slice(0,7) || ""}`,
    note:  `EPS Est: ${e.epsEstimated != null ? "$"+fmt(e.epsEstimated) : "—"} · Rev Est: ${e.revenueEstimated ? fmtB(e.revenueEstimated) : "—"}`,
  }));
}

/* ── Financial Ratios (live P/E, EV/EBITDA, etc.) ──────────────── */
async function fmpGetRatios(symbol) {
  const data = await fmpFetch(`/v3/ratios-ttm/${symbol}`, symbol);
  if (!data || !data.length) return null;
  const r = data[0];
  return {
    pe:        parseFloat(r.priceEarningsRatioTTM)       || null,
    pb:        parseFloat(r.priceToBookRatioTTM)         || null,
    ps:        parseFloat(r.priceToSalesRatioTTM)        || null,
    evEbitda:  parseFloat(r.enterpriseValueMultipleTTM)  || null,
    fcfYield:  parseFloat(r.freeCashFlowYieldTTM)        ? parseFloat(r.freeCashFlowYieldTTM) * 100 : null,
    divYield:  parseFloat(r.dividendYieldTTM)            ? parseFloat(r.dividendYieldTTM) * 100 : null,
    roe:       parseFloat(r.returnOnEquityTTM)           ? parseFloat(r.returnOnEquityTTM) * 100 : null,
    roa:       parseFloat(r.returnOnAssetsTTM)           ? parseFloat(r.returnOnAssetsTTM) * 100 : null,
    peg:       parseFloat(r.priceEarningsToGrowthRatioTTM) || null,
    debtEq:    parseFloat(r.debtEquityRatioTTM)          || null,
    currentR:  parseFloat(r.currentRatioTTM)             || null,
    grossMgn:  parseFloat(r.grossProfitMarginTTM)        ? parseFloat(r.grossProfitMarginTTM)*100 : null,
    operMgn:   parseFloat(r.operatingProfitMarginTTM)    ? parseFloat(r.operatingProfitMarginTTM)*100 : null,
    netMgn:    parseFloat(r.netProfitMarginTTM)          ? parseFloat(r.netProfitMarginTTM)*100 : null,
  };
}

/* ── Batch Quote (for Watchlist live prices) ────────────────────── */
async function fmpGetBatchQuote(tickers) {
  if (!tickers.length) return null;
  const syms = tickers.join(",");
  const data = await fmpFetch(`/v3/quote/${syms}`, syms);
  if (!data || !data.length) return null;
  const map = {};
  data.forEach(q => {
    map[q.symbol] = {
      price:     parseFloat(q.price) || null,
      change:    parseFloat(q.change) || null,
      changePct: parseFloat(q.changesPercentage) || null,
      volume:    q.volume || null,
      mktCap:    q.marketCap || null,
      pe:        parseFloat(q.pe) || null,
    };
  });
  return map;
}

/* ══════════════════════════════════════════════════════════════════
   HIGH-LEVEL LOADER  (called from api.js orchestrator)
   ══════════════════════════════════════════════════════════════════ */
async function fmpLoadAll(ticker) {
  const sym = ticker.replace(/.*:/, "").toUpperCase();

  // Guard: require a configured key
  if (!getFmpKey()) {
    showApiToast("⚙ FMP key not set — click the FMP badge to configure.", "warn");
    return;
  }

  const [analystRaw, targets, estimates, insiders, institutional, mgmt, calendar, ratios] =
    await Promise.all([
      fmpGetAnalystRatings(sym),
      fmpGetPriceTargets(sym),
      fmpGetEarningsEstimates(sym),
      fmpGetInsiders(sym),
      fmpGetInstitutional(sym),
      fmpGetManagement(sym),
      fmpGetEarningsCalendar(sym),
      fmpGetRatios(sym),
    ]);

  const live = { sym, analystRaw, targets, estimates, insiders, institutional, mgmt, calendar, ratios };
  fmpLiveCache[sym] = live;

  // Render each panel
  if (targets || analystRaw) fmpRenderAnalysts(sym, analystRaw, targets);
  if (estimates)             fmpRenderEstimates(sym, estimates);
  if (insiders || institutional) fmpRenderOwnership(sym, insiders, institutional);
  if (mgmt)                  fmpRenderMgmt(sym, mgmt);
  if (calendar)              fmpRenderCalendar(sym, calendar);
  if (ratios)                fmpRenderRatios(sym, ratios);

  updateFmpStatus();
}

const fmpLiveCache = {};
function fmpGetLive(sym) { return fmpLiveCache[sym.toUpperCase()] || null; }

/* ══════════════════════════════════════════════════════════════════
   RENDER FUNCTIONS
   ══════════════════════════════════════════════════════════════════ */

/* ── ANR — Analyst ratings + price targets ─────────────────────── */
function fmpRenderAnalysts(sym, analystRaw, targets) {
  const anr = document.getElementById("analysts-anr");
  if (!anr) return;

  const buy  = analystRaw?.buy  || 0;
  const hold = analystRaw?.hold || 0;
  const sell = analystRaw?.sell || 0;
  const tot  = buy + hold + sell || 1;
  const bp   = Math.round(buy/tot*100);
  const hp   = Math.round(hold/tot*100);
  const sp   = 100 - bp - hp;

  // Price target from AV (if loaded) or FMP
  const avOv       = avGetLive ? avGetLive(sym)?.overview : null;
  const avTarget   = avOv?.analystTarget;
  const fmpAvg     = targets?.avgTarget;
  const avgTarget  = fmpAvg || avTarget;

  // Get live price
  const avQuote    = avGetLive ? avGetLive(sym)?.quote : null;
  const price      = avQuote?.price || null;

  const ratingRows = (targets?.ratings || []).map(r => {
    const col = r.rating === "Buy" ? "pos" : r.rating === "Sell" ? "neg" : "neutral";
    const upside = (r.target && price) ? ((r.target/price - 1)*100).toFixed(1)+"%" : "—";
    return `<tr>
      <td>${escapeHtml(r.firm)}</td>
      <td>${escapeHtml(r.analyst)}</td>
      <td class="${col}">${escapeHtml(r.rating)}</td>
      <td>$${r.target ? fmt(r.target) : "—"}</td>
      <td class="${r.target && price ? (r.target > price ? "pos":"neg") : ""}">${upside}</td>
      <td>${escapeHtml(r.date)}</td>
    </tr>`;
  }).join("");

  anr.innerHTML = `
    <div class="av-live-badge">● LIVE — FMP  <span class="av-ts">${analystRaw?.latestDate || ""}</span></div>
    ${sHead("Consensus")}
    <div class="consensus-bar">
      <div class="cb-seg buy"  style="width:${bp}%">${buy} Buy</div>
      <div class="cb-seg hold" style="width:${hp}%">${hold} Hold</div>
      <div class="cb-seg sell" style="width:${sp}%">${sell} Sell</div>
    </div>
    ${mRow("Total Analysts",  tot)}
    ${mRow("Avg Target",      avgTarget  != null ? "$"+fmt(avgTarget)       : "—")}
    ${mRow("High Target",     targets?.highTarget != null ? "$"+fmt(targets.highTarget) : "—")}
    ${mRow("Low Target",      targets?.lowTarget  != null ? "$"+fmt(targets.lowTarget)  : "—")}
    ${price ? mRow("Current Price", "$"+fmt(price)) : ""}
    ${avgTarget && price ? mRow("Upside to Avg", fmt((avgTarget/price-1)*100,1)+"%", avgTarget > price ? "metric-up" : "metric-down") : ""}
    ${ratingRows ? `${sHead("Individual Ratings")}
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th>Firm</th><th>Analyst</th><th>Rating</th><th>Target</th><th>Upside</th><th>Date</th></tr></thead>
      <tbody>${ratingRows}</tbody>
    </table></div>` : ""}`;
}

/* ── EE — Forward estimates ─────────────────────────────────────── */
function fmpRenderEstimates(sym, estimates) {
  const ee = document.getElementById("fund-ee");
  if (!ee || !estimates.length) return;

  const rows = estimates.map(e => `<tr>
    <td>${escapeHtml(e.period)}</td>
    <td>${e.epsLow  != null ? "$"+fmt(e.epsLow)  : "—"}</td>
    <td class="accent"><strong>${e.epsMean != null ? "$"+fmt(e.epsMean) : "—"}</strong></td>
    <td>${e.epsHigh != null ? "$"+fmt(e.epsHigh) : "—"}</td>
    <td>${e.revMean != null ? "$"+fmt(e.revMean)+"B" : "—"}</td>
    <td>${e.analysts}</td>
  </tr>`).join("");

  ee.innerHTML = `
    <div class="av-live-badge">● LIVE — FMP</div>
    ${sHead("Analyst EPS & Revenue Estimates (Forward)")}
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th>Period</th><th>EPS Low</th><th>EPS Mean</th><th>EPS High</th><th>Rev Mean</th><th>Analysts</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

/* ── HDS — Institutional + Insider ─────────────────────────────── */
function fmpRenderOwnership(sym, insiders, institutional) {
  const hds = document.getElementById("own-hds");
  if (!hds) return;

  let html = `<div class="av-live-badge">● LIVE — FMP</div>`;

  if (institutional?.length) {
    const rows = institutional.map(h => {
      const chgN = typeof h.change === "string" ? parseFloat(h.change.replace(/[^0-9.-]/g,"")) : h.change;
      const chgCls = chgN > 0 ? "pos" : chgN < 0 ? "neg" : "";
      return `<tr>
        <td>${escapeHtml(h.name)}</td>
        <td>${h.type}</td>
        <td>${h.pct}%</td>
        <td>${h.shares}</td>
        <td class="${chgCls}">${h.change}</td>
      </tr>`;
    }).join("");
    html += `${sHead("Institutional Holders")}
      <div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>Institution</th><th>Type</th><th>% Own</th><th>Shares</th><th>Change</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  }

  if (insiders?.length) {
    const rows = insiders.map(i => `<tr>
      <td>${escapeHtml(i.name)}</td>
      <td>${escapeHtml(i.title)}</td>
      <td>${i.shares}</td>
      <td>${i.value}</td>
      <td class="${i.action==="Buy"?"pos":i.action==="Sell"?"neg":""}">${i.action}</td>
      <td>${i.change}</td>
      <td>${i.date}</td>
    </tr>`).join("");
    html += `${sHead("Insider Transactions")}
      <div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>Name</th><th>Title</th><th>Shares</th><th>Value</th><th>Action</th><th>Change</th><th>Date</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  }

  hds.innerHTML = html || `<div class="no-data">// No ownership data for ${escapeHtml(sym)}.</div>`;
}

/* ── MGMT — Executives ──────────────────────────────────────────── */
function fmpRenderMgmt(sym, mgmt) {
  const box = document.getElementById("own-mgmt");
  if (!box || !mgmt.length) return;
  box.innerHTML = `
    <div class="av-live-badge">● LIVE — FMP</div>
    ${mgmt.map(m => `
    <div class="mgmt-card">
      <div class="mgmt-avatar">${m.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}</div>
      <div class="mgmt-info">
        <div class="mgmt-name">${escapeHtml(m.name)}</div>
        <div class="mgmt-role">${escapeHtml(m.role)}</div>
        <div class="mgmt-meta">Age ${m.age !== "—" ? m.age : "—"} &nbsp;·&nbsp; Pay: ${m.pay}</div>
      </div>
    </div>`).join("")}`;
}

/* ── EVTS — Earnings calendar ───────────────────────────────────── */
function fmpRenderCalendar(sym, calendar) {
  const evts = document.getElementById("news-evts");
  if (!evts) return;

  // Merge with any static events already shown
  const existing = evts.innerHTML.includes("av-live-badge") ? [] : [];

  const typeColor = { Earnings:"var(--accent)", Dividend:"var(--accent-green)", Conference:"var(--accent-yellow)" };
  const rows = calendar.map(ev => `
    <div class="event-item">
      <div class="event-date">${ev.date}</div>
      <div class="event-body">
        <span class="event-type" style="color:${typeColor[ev.type]||"var(--text-secondary)"}">${ev.type}</span>
        <div class="event-title">${escapeHtml(ev.title)}</div>
        <div class="event-note">${escapeHtml(ev.note)}</div>
      </div>
    </div>`).join("");

  evts.innerHTML = `
    <div class="av-live-badge">● LIVE — FMP</div>
    ${rows || `<div class="no-data">// No upcoming events found for ${escapeHtml(sym)}.</div>`}`;
}

/* ── Ratios — update DES fundamentals section ───────────────────── */
function fmpRenderRatios(sym, r) {
  // Inject a live ratios block into the DES tab if overview already rendered
  const des = document.getElementById("fund-des");
  if (!des) return;

  // Don't overwrite — append a ratios block at the top if AV already rendered
  const existingRatios = des.querySelector(".fmp-ratios-block");
  const block = document.createElement("div");
  block.className = "fmp-ratios-block";
  block.innerHTML = `
    <div class="section-head" style="margin-top:4px">Live Ratios — FMP <span class="av-ts" style="font-size:9px;margin-left:4px">TTM</span></div>
    ${r.pe       != null ? mRow("P/E (TTM)",    fmt(r.pe,1))          : ""}
    ${r.pb       != null ? mRow("P/B (TTM)",    fmt(r.pb,2))          : ""}
    ${r.ps       != null ? mRow("P/S (TTM)",    fmt(r.ps,2))          : ""}
    ${r.evEbitda != null ? mRow("EV/EBITDA",    fmt(r.evEbitda,1))    : ""}
    ${r.peg      != null ? mRow("PEG Ratio",    fmt(r.peg,2))         : ""}
    ${r.fcfYield != null ? mRow("FCF Yield",    fmt(r.fcfYield,2)+"%"): ""}
    ${r.divYield != null ? mRow("Div Yield",    fmt(r.divYield,2)+"%"): ""}
    ${r.roe      != null ? mRow("ROE",          fmt(r.roe,1)+"%")     : ""}
    ${r.roa      != null ? mRow("ROA",          fmt(r.roa,1)+"%")     : ""}
    ${r.grossMgn != null ? mRow("Gross Margin", fmt(r.grossMgn,1)+"%"): ""}
    ${r.operMgn  != null ? mRow("Op. Margin",   fmt(r.operMgn,1)+"%") : ""}
    ${r.netMgn   != null ? mRow("Net Margin",   fmt(r.netMgn,1)+"%")  : ""}
    ${r.debtEq   != null ? mRow("Debt/Equity",  fmt(r.debtEq,2))      : ""}
    ${r.currentR != null ? mRow("Current Ratio",fmt(r.currentR,2))    : ""}`;

  if (existingRatios) {
    des.replaceChild(block, existingRatios);
  } else {
    // Prepend after live badge if present
    const badge = des.querySelector(".av-live-badge");
    if (badge) badge.insertAdjacentElement("afterend", block);
    else des.insertAdjacentElement("afterbegin", block);
  }

  // Also update valuation analyzer if the same ticker is loaded
  const currentValSym = (typeof currentValTicker !== "undefined" && currentValTicker)
    ? currentValTicker.replace(/.*:/,"").toUpperCase() : null;
  if (currentValSym === sym && typeof renderValuation === "function") {
    renderValuation(currentValTicker);
  }
}

/* ══════════════════════════════════════════════════════════════════
   WATCHLIST LIVE PRICES
   Updates sector watchlist rows with real prices from FMP batch quote
   ══════════════════════════════════════════════════════════════════ */
async function fmpRefreshWatchlistPrices() {
  if (!currentWatchlistStocks || !currentWatchlistStocks.length) return;
  const tickers = currentWatchlistStocks.map(s => s.ticker.replace(/.*:/,"")).join(",");
  const quotes  = await fmpGetBatchQuote(tickers.split(","));
  if (!quotes) return;

  // Merge live prices into watchlist data
  let updated = false;
  currentWatchlistStocks.forEach(s => {
    const sym = s.ticker.replace(/.*:/,"").toUpperCase();
    const q   = quotes[sym];
    if (q) {
      if (q.price     != null) s.price  = q.price;
      if (q.changePct != null) s.change = q.changePct;
      if (q.mktCap    != null) s.mktCap = fmtB(q.mktCap);
      if (q.pe        != null) s.pe     = q.pe;
      updated = true;
    }
  });

  if (updated) {
    renderWatchlistRows();
    showApiToast(`✓ Watchlist: live prices updated (FMP)`, "ok");
  }
}

/* ══════════════════════════════════════════════════════════════════
   DIVIDENDS  → Fundamentals DIV tab
   GET /v3/historical-price-full/stock_dividend/{TICKER}
   ══════════════════════════════════════════════════════════════════ */
async function fmpLoadDividends(sym) {
  const el = document.getElementById('fund-div');
  if (!el) return;
  const key = getFmpKey();
  if (!key) {
    el.innerHTML = `<div class="no-data">// FMP key required for dividend data.<br>
      <a href="#" onclick="openApiConfig('fmp');return false" style="color:var(--accent)">Add key →</a></div>`;
    return;
  }
  el.innerHTML = '<div class="av-loading"><span class="av-spinner"></span>Loading dividends…</div>';
  try {
    fmpIncrement();
    const [divRes, splRes] = await Promise.allSettled([
      fmpFetch(`/v3/historical-price-full/stock_dividend/${encodeURIComponent(sym)}`),
      fmpFetch(`/v3/historical-price-full/stock_split/${encodeURIComponent(sym)}`),
    ]);

    const divData  = divRes.status  === 'fulfilled' ? (divRes.value?.historical  || []) : [];
    const splitData = splRes.status === 'fulfilled' ? (splRes.value?.historical  || []) : [];

    let html = '';

    /* ── Summary strip ─────────────────────────────────────────── */
    if (divData.length) {
      const lastDiv   = divData[0];
      const ttm = divData.slice(0,4).reduce((s,d) => s + (d.dividend || 0), 0);
      const freq = divData.length >= 2
        ? (() => {
            const d1 = new Date(divData[0].date), d2 = new Date(divData[1].date);
            const days = Math.round(Math.abs(d1 - d2) / 86400000);
            if (days <= 40)  return 'Monthly';
            if (days <= 100) return 'Quarterly';
            if (days <= 200) return 'Semi-Annual';
            return 'Annual';
          })() : '—';
      html += `<div class="div-summary-bar">
        <div class="div-sum-cell"><span class="div-sum-label">Last Dividend</span><span class="div-sum-val">$${(lastDiv.dividend||0).toFixed(4)}</span></div>
        <div class="div-sum-cell"><span class="div-sum-label">Ex-Date</span><span class="div-sum-val">${lastDiv.date||'—'}</span></div>
        <div class="div-sum-cell"><span class="div-sum-label">Pay Date</span><span class="div-sum-val">${lastDiv.paymentDate||'—'}</span></div>
        <div class="div-sum-cell"><span class="div-sum-label">TTM Total</span><span class="div-sum-val" style="color:var(--accent)">$${ttm.toFixed(4)}</span></div>
        <div class="div-sum-cell"><span class="div-sum-label">Frequency</span><span class="div-sum-val">${freq}</span></div>
      </div>`;

      /* Dividend history table */
      html += `<div class="section-head">Dividend History (last ${Math.min(divData.length,24)})</div>`;
      html += `<div class="div-table-wrap"><table class="div-table">
        <thead><tr><th>Ex-Date</th><th>Record</th><th>Pay Date</th><th>Amount</th><th>Decl. Date</th></tr></thead><tbody>`;
      for (const d of divData.slice(0,24)) {
        html += `<tr>
          <td>${d.date||'—'}</td>
          <td>${d.recordDate||'—'}</td>
          <td>${d.paymentDate||'—'}</td>
          <td style="color:var(--accent);font-weight:600">$${(d.dividend||0).toFixed(4)}</td>
          <td>${d.declarationDate||'—'}</td>
        </tr>`;
      }
      html += `</tbody></table></div>`;
    } else {
      html += `<div class="no-data">// No dividend history found for ${sym}.</div>`;
    }

    /* ── Stock Splits ──────────────────────────────────────────── */
    html += `<div class="section-head" style="margin-top:14px">✂ Stock Splits</div>`;
    if (splitData.length) {
      html += `<div class="div-table-wrap"><table class="div-table">
        <thead><tr><th>Date</th><th>Numerator</th><th>Denominator</th><th>Ratio</th></tr></thead><tbody>`;
      for (const s of splitData.slice(0,20)) {
        const ratio = s.numerator && s.denominator ? `${s.numerator}:${s.denominator}` : '—';
        html += `<tr>
          <td>${s.date||'—'}</td>
          <td>${s.numerator||'—'}</td>
          <td>${s.denominator||'—'}</td>
          <td style="color:var(--accent);font-weight:600">${ratio}</td>
        </tr>`;
      }
      html += `</tbody></table></div>`;
    } else {
      html += `<div class="no-data">// No split history found for ${sym}.</div>`;
    }

    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = `<div class="no-data">// Dividend data error: ${e.message}</div>`;
  }
}

/* ══════════════════════════════════════════════════════════════════
   SEC FILINGS  → Fundamentals FILINGS tab
   Uses SEC EDGAR (no key) + optional FMP supplement
   Primary: https://data.sec.gov/submissions/CIK{CIK}.json
   Search:  https://efts.sec.gov/hits.esf?q=TICKER&forms=8-K,10-K,10-Q
   ══════════════════════════════════════════════════════════════════ */
const SEC_CIK_CACHE = new Map();

async function secGetCik(ticker) {
  if (SEC_CIK_CACHE.has(ticker)) return SEC_CIK_CACHE.get(ticker);
  // EDGAR full-text search to find CIK
  const url = `https://efts.sec.gov/hits.esf?q=%22${encodeURIComponent(ticker)}%22&dateRange=custom&startdt=2023-01-01&forms=10-K&hits.hits._source=period_of_report,entity_name,file_date,period_of_report&hits.hits.total=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'FINTERM dashboard/1.0' } });
  if (!res.ok) return null;
  const data = await res.json();
  const hit = data?.hits?.hits?.[0];
  if (!hit) return null;
  const cik = hit._id?.split(':')[0];
  if (cik) SEC_CIK_CACHE.set(ticker, cik.padStart(10,'0'));
  return cik ? cik.padStart(10,'0') : null;
}

async function secFetchFilings(ticker, forms = ['8-K','10-K','10-Q','DEF 14A']) {
  // Use EDGAR full-text search — returns recent filings without needing CIK
  const formParam = forms.join(',');
  const url = `https://efts.sec.gov/hits.esf?q=%22${encodeURIComponent(ticker)}%22&forms=${encodeURIComponent(formParam)}&dateRange=custom&startdt=2023-01-01`;
  const res = await fetch(url, { headers: { 'User-Agent': 'FINTERM/1.0 research@finterm.app' } });
  if (!res.ok) throw new Error(`SEC HTTP ${res.status}`);
  const data = await res.json();
  return (data?.hits?.hits || []).map(h => {
    const s = h._source || {};
    return {
      form:        s.form_type  || s.period_of_report || '—',
      entity:      s.entity_name|| '',
      filed:       s.file_date  || '',
      period:      s.period_of_report || '',
      accession:   (h._id || '').replace(/:/g,'-'),
      url:         h._id ? `https://www.sec.gov/Archives/edgar/${h._id.replace(/:/g,'/')}` : '',
    };
  });
}

async function fmpLoadSecFilings(sym) {
  const el = document.getElementById('fund-filings');
  if (!el) return;
  el.innerHTML = '<div class="av-loading"><span class="av-spinner"></span>Loading SEC filings…</div>';
  try {
    // Parallel: EDGAR full-text search for different form types
    const [kRes, qRes, eightRes, proxy4Res] = await Promise.allSettled([
      secFetchFilings(sym, ['10-K']),
      secFetchFilings(sym, ['10-Q']),
      secFetchFilings(sym, ['8-K']),
      secFetchFilings(sym, ['DEF 14A','SC 13G','13F-HR']),
    ]);

    const annuals   = kRes.status    === 'fulfilled' ? kRes.value    : [];
    const quarters  = qRes.status    === 'fulfilled' ? qRes.value    : [];
    const material  = eightRes.status === 'fulfilled' ? eightRes.value : [];
    const ownership = proxy4Res.status === 'fulfilled' ? proxy4Res.value : [];

    // Deduplicate & sort by date
    const dedup = arr => {
      const seen = new Set();
      return arr.filter(f => { const k = f.form+f.filed; return seen.has(k) ? false : (seen.add(k), true); })
        .sort((a,b) => b.filed.localeCompare(a.filed));
    };

    let html = `<div class="sec-header">
      <span class="sec-badge">SEC EDGAR</span>
      <span class="sec-note">No API key required · EDGAR public data</span>
    </div>`;

    const renderFilings = (label, arr, limit = 10) => {
      if (!arr.length) return `<div class="section-head">${label}</div><div class="no-data">// No recent filings found.</div>`;
      const items = dedup(arr).slice(0,limit);
      let s = `<div class="section-head">${label} (${items.length})</div><div class="sec-filing-list">`;
      for (const f of items) {
        const href = f.accession
          ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=&CIK=${encodeURIComponent(sym)}&type=${encodeURIComponent(f.form)}&dateb=&owner=include&count=20`
          : '#';
        s += `<div class="sec-filing-row">
          <span class="sec-form-badge sec-form-${(f.form||'').replace(/[ /]/g,'-').toLowerCase()}">${f.form}</span>
          <span class="sec-entity">${f.entity || sym}</span>
          <span class="sec-filed">${f.filed}</span>
          <span class="sec-period">${f.period ? 'Period: '+f.period : ''}</span>
          <a class="sec-link" href="${href}" target="_blank" rel="noopener">EDGAR ↗</a>
        </div>`;
      }
      s += `</div>`;
      return s;
    };

    html += renderFilings('📋 Annual Reports (10-K)', annuals);
    html += renderFilings('📊 Quarterly Reports (10-Q)', quarters);
    html += renderFilings('⚡ Material Events (8-K)', material, 15);
    html += renderFilings('🏛 Ownership & Proxy', ownership);

    // Direct EDGAR link
    html += `<div style="padding:8px 0 4px;text-align:center">
      <a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(sym)}&type=&dateb=&owner=include&count=40" 
         target="_blank" rel="noopener" class="sec-all-link">View all ${sym} filings on EDGAR ↗</a>
    </div>`;

    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = `<div class="no-data">// SEC EDGAR error: ${e.message}</div>`;
  }
}
