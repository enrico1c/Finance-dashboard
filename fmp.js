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
    const res  = await fetch(url, { signal: AbortSignal.timeout(7000) });
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

/* ── WACC Inputs — Pre-tax cost of debt & effective tax rate ────── */
async function fmpGetWACCInputs(symbol) {
  /* Fetches the most recent income statement + balance sheet to derive:
     • kdPct      = |interestExpense| / totalDebt * 100  (pre-tax cost of debt)
     • taxRatePct = incomeTaxExpense / incomeBeforeTax * 100  (effective tax rate)
     Both are stored in fmpLiveCache[sym].waccInputs for use in WACC renders.  */
  try {
    const key = getFmpKey();
    if (!key) return null;

    const [incData, balData] = await Promise.all([
      fetch(`${FMP_BASE}/v3/income-statement/${symbol}?limit=1&apikey=${key}`, {signal:AbortSignal.timeout(8000)}).then(r=>r.json()),
      fetch(`${FMP_BASE}/v3/balance-sheet-statement/${symbol}?limit=1&apikey=${key}`, {signal:AbortSignal.timeout(8000)}).then(r=>r.json()),
    ]);

    const inc = Array.isArray(incData) && incData.length ? incData[0] : null;
    const bal = Array.isArray(balData) && balData.length ? balData[0] : null;

    if (!inc || !bal) return null;

    // Pre-tax cost of debt: |interestExpense| / totalDebt
    // FMP reports interestExpense as negative (cash outflow) — use Math.abs
    let kdPct = null;
    const intExp   = Math.abs(parseFloat(inc.interestExpense || 0));
    const totalDebt= Math.abs(parseFloat(bal.totalDebt || 0));
    if (intExp > 0 && totalDebt > 1e6) {
      const raw = (intExp / totalDebt) * 100;
      // Sanity bounds: 1.5% – 25%; outside this range use fallback
      if (raw >= 1.5 && raw <= 25) kdPct = parseFloat(raw.toFixed(2));
    }

    // Effective tax rate: incomeTaxExpense / incomeBeforeTax
    let taxRatePct = null;
    const taxExp    = parseFloat(inc.incomeTaxExpense    || 0);
    const pretaxInc = parseFloat(inc.incomeBeforeTax     || 0);
    if (pretaxInc > 0 && taxExp >= 0) {
      const raw = (taxExp / pretaxInc) * 100;
      // Sanity bounds: 5% – 45%
      if (raw >= 5 && raw <= 45) taxRatePct = parseFloat(raw.toFixed(1));
    }

    return { kdPct, taxRatePct };
  } catch(e) {
    console.warn('[FMP] fmpGetWACCInputs error:', e.message);
    return null;
  }
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

  const [analystRaw, targets, estimates, insiders, institutional, mgmt, calendar, ratios, waccInputs] =
    await Promise.all([
      fmpGetAnalystRatings(sym),
      fmpGetPriceTargets(sym),
      fmpGetEarningsEstimates(sym),
      fmpGetInsiders(sym),
      fmpGetInstitutional(sym),
      fmpGetManagement(sym),
      fmpGetEarningsCalendar(sym),
      fmpGetRatios(sym),
      fmpGetWACCInputs(sym),
    ]);

  const live = { sym, analystRaw, targets, estimates, insiders, institutional, mgmt, calendar, ratios, waccInputs };
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

  // Update WACC tab with live beta + D/E from FMP ratios + live Kd + tax rate
  const wc = document.getElementById("fund-wacc");
  if (wc) {
    // Beta cascade: FMP ratios → Finnhub profile → AV overview → fallback 1.0
    const fhLiveFmp  = (typeof fhGetLive  === 'function') ? fhGetLive(sym)  : null;
    const avBetaFmp  = (typeof avLiveCache !== 'undefined') ? (avLiveCache[sym]?.overview?.beta ?? null) : null;
    const beta    = parseFloat(r?.beta || fhLiveFmp?.profile?.beta || avBetaFmp || 1.0);
    const betaSrcFmp = r?.beta ? 'FMP' : fhLiveFmp?.profile?.beta ? 'Finnhub' : avBetaFmp ? 'AV' : 'estimated';
    const debtEq  = parseFloat(r?.debtEq || 0.3);
    const _ty2    = (typeof window._treasuryYields !== 'undefined') ? window._treasuryYields : {};
    const rf      = _ty2['10Y'] ?? 4.5;
    const erp     = window.DAMODARAN_ERP ?? 4.60;
    const ke      = (rf + beta * erp).toFixed(2);

    // Use live Kd and tax rate from fmpGetWACCInputs if available in cache
    const waccInputs = fmpLiveCache[sym]?.waccInputs;
    const kd      = waccInputs?.kdPct      ?? 5.5;
    const tax     = waccInputs?.taxRatePct ?? 21;
    const kdSrc   = waccInputs?.kdPct      != null ? 'FMP' : 'est.';
    const taxSrc  = waccInputs?.taxRatePct != null ? 'FMP' : 'statutory';

    const eqW  = Math.max(20, Math.round(100/(1+debtEq)));
    const dW   = 100 - eqW;
    const wacc = (eqW/100*parseFloat(ke) + dW/100*kd*(1-tax/100)).toFixed(2);

    // Terminal growth: read user override from sessionStorage, else 2.5%
    const ssKey  = `wacc_termg_${sym}`;
    const termG  = parseFloat(sessionStorage.getItem(ssKey) ?? 2.5);
    const waccN  = parseFloat(wacc);
    const exitMult = (waccN > termG)
      ? ((1 + termG/100) / (waccN/100 - termG/100)).toFixed(1) + 'x'
      : 'N/A (termG ≥ WACC)';

    wc.dataset.loaded = "fmp";
    wc.innerHTML = `
      <div class="av-live-badge">● WACC · ${fmpEsc(sym)} · beta:${fmpEsc(betaSrcFmp)} · Kd:${fmpEsc(kdSrc)} · tax:${fmpEsc(taxSrc)}</div>
      <div class="section-head">WACC Inputs</div>
      ${mRow("Beta (levered)",         beta.toFixed(2) + ' <span style="font-size:9px;opacity:.6">('+fmpEsc(betaSrcFmp)+')</span>')}
      ${mRow("D/E Ratio",              debtEq.toFixed(2))}
      ${mRow("Risk-Free Rate (10Y)",   rf+"%")}
      ${mRow("Equity Risk Premium",    erp+'% <span style="font-size:9px;opacity:.6">(Damodaran Jan 2026)</span>')}
      ${mRow("Cost of Equity (Ke)",    ke+"%")}
      ${mRow("Pre-Tax Cost of Debt",   kd.toFixed(2)+'% <span style="font-size:9px;opacity:.6">('+fmpEsc(kdSrc)+')</span>')}
      ${mRow("Tax Rate",               tax.toFixed(1)+'% <span style="font-size:9px;opacity:.6">('+fmpEsc(taxSrc)+')</span>')}
      ${mRow("Equity Weight",          eqW+"%")}
      ${mRow("Debt Weight",            dW+"%")}
      <div class="metric wacc-result"><span>→ WACC</span><span>${wacc}%</span></div>
      <div class="section-head">DCF Sensitivity</div>
      <div class="metric">
        <span>Terminal Growth Rate</span>
        <span style="display:flex;align-items:center;gap:6px">
          <input id="wacc-termg-${fmpEsc(sym)}" type="number" value="${termG}" min="0" max="10" step="0.1"
            style="width:58px;background:var(--bg2,#161b22);border:1px solid var(--border,#30363d);color:var(--text,#e6edf3);border-radius:4px;padding:2px 5px;font-size:12px;font-family:monospace"
            onchange="(function(el){
              var s='${fmpEsc(sym)}';
              sessionStorage.setItem('wacc_termg_'+s, el.value);
              var wc2=document.getElementById('fund-wacc');
              if(wc2){wc2.dataset.loaded='';if(typeof renderFundamentals==='function')renderFundamentals(s);}
            })(this)" />
          <span style="font-size:10px;opacity:.6">%</span>
        </span>
      </div>
      ${mRow("Implied EV/EBITDA exit", exitMult)}
      ${r.roe    != null ? mRow("ROE",          r.roe.toFixed(1)+"%")    : ""}
      ${r.roa    != null ? mRow("ROA",          r.roa.toFixed(1)+"%")    : ""}
      ${r.netMgn != null ? mRow("Net Margin",   r.netMgn.toFixed(1)+"%") : ""}
      <div class="av-note">// Kd = interest expense / total debt (FMP). Tax = effective rate (FMP).<br>// ERP: Damodaran Jan 2026 · <a href="https://pages.stern.nyu.edu/~adamodar/" target="_blank" rel="noopener" style="color:var(--accent,#58a6ff)">stern.nyu.edu/adamodar ↗</a></div>`;
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

/* ══════════════════════════════════════════════════════════════════
   SHORT INTEREST  (Finnhub — endpoint /stock/short-interest)
   Called from Fundamentals → SHORT tab
   ══════════════════════════════════════════════════════════════════ */
async function fhLoadShortInterest(sym) {
  const el = document.getElementById("fund-short");
  if (!el) return;
  const key = (typeof getKey === "function") ? getKey("finnhub") : localStorage.getItem("finterm_key_finnhub") || "";
  if (!key) {
    el.innerHTML = `<div class="no-data">// Finnhub key required for short interest data.</div>`;
    return;
  }
  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading short interest…</div>`;
  try {
    const url = `https://finnhub.io/api/v1/stock/short-interest?symbol=${encodeURIComponent(sym)}&token=${key}`;
    const res  = await fetch(url);
    const data = await res.json();
    const recs = data.data || [];
    if (!recs.length) {
      el.innerHTML = `<div class="no-data">// No short interest data available for ${sym}.</div>`;
      return;
    }
    const latest = recs[0];
    const prev   = recs[1] || null;
    const chg    = (prev && latest.shortInterest && prev.shortInterest)
                   ? ((latest.shortInterest - prev.shortInterest) / prev.shortInterest * 100).toFixed(1)
                   : null;
    const chgCls = chg ? (parseFloat(chg) > 0 ? "neg" : "pos") : "";
    const fmt    = v => v ? Number(v).toLocaleString() : "—";
    const fmtPct = v => v ? parseFloat(v).toFixed(2)+"%" : "—";

    let html = `<div class="av-live-badge">● Short Interest · ${sym} · Finnhub</div>`;
    html += `<div class="short-summary">
      <div class="short-kpi">
        <span class="short-kpi-lbl">Short Interest</span>
        <span class="short-kpi-val">${fmt(latest.shortInterest)}</span>
      </div>
      <div class="short-kpi">
        <span class="short-kpi-lbl">% of Float</span>
        <span class="short-kpi-val">${fmtPct(latest.shortInterestRatio)}</span>
      </div>
      <div class="short-kpi">
        <span class="short-kpi-lbl">Days to Cover</span>
        <span class="short-kpi-val">${latest.daysToCover ? parseFloat(latest.daysToCover).toFixed(1) : "—"}</span>
      </div>
      <div class="short-kpi">
        <span class="short-kpi-lbl">Period Chg</span>
        <span class="short-kpi-val ${chgCls}">${chg !== null ? (parseFloat(chg) > 0 ? "+" : "")+chg+"%" : "—"}</span>
      </div>
    </div>`;

    html += `<table class="fmp-table" style="margin-top:10px">
      <thead><tr><th>Settlement Date</th><th>Short Shares</th><th>% Float</th><th>Days Cover</th></tr></thead>
      <tbody>`;
    recs.slice(0, 12).forEach(r => {
      html += `<tr>
        <td>${r.date || "—"}</td>
        <td>${fmt(r.shortInterest)}</td>
        <td>${fmtPct(r.shortInterestRatio)}</td>
        <td>${r.daysToCover ? parseFloat(r.daysToCover).toFixed(1) : "—"}</td>
      </tr>`;
    });
    html += `</tbody></table>
    <div class="av-note" style="margin-top:6px">// Short interest data from Finnhub. Bi-monthly FINRA settlement dates.</div>`;
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = `<div class="no-data">// Short interest error: ${e.message}</div>`;
  }
}

/* ══════════════════════════════════════════════════════════════════
   REVENUE SEGMENTATION  (FMP — product + geographic breakdown)
   Called from Fundamentals → SEG tab
   ══════════════════════════════════════════════════════════════════ */
/* ── SVG donut builder ───────────────────────────────────────────── */
function _segDonutSVG(entries, total, colors) {
  const cx=60, cy=60, r=50, ri=30;
  let angle=-Math.PI/2, paths='';
  entries.forEach(([,val],i)=>{
    const pct = total>0 ? val/total : 0;
    if (pct<=0) return;
    const a2   = angle + pct*2*Math.PI;
    const large = pct>0.5?1:0;
    const x1=cx+r*Math.cos(angle), y1=cy+r*Math.sin(angle);
    const x2=cx+r*Math.cos(a2),   y2=cy+r*Math.sin(a2);
    const xi1=cx+ri*Math.cos(angle),yi1=cy+ri*Math.sin(angle);
    const xi2=cx+ri*Math.cos(a2),  yi2=cy+ri*Math.sin(a2);
    const col=colors[i%colors.length];
    paths+=`<path d="M${xi1.toFixed(1)},${yi1.toFixed(1)} A${r},${r} 0 ${large},1 ${x2.toFixed(1)},${y2.toFixed(1)} L${xi2.toFixed(1)},${yi2.toFixed(1)} A${ri},${ri} 0 ${large},0 ${xi1.toFixed(1)},${yi1.toFixed(1)} Z" fill="${col}" stroke="var(--bg-panel)" stroke-width="1"/>`;
    angle=a2;
  });
  return `<svg viewBox="0 0 120 120" width="120" height="120" style="display:block;flex-shrink:0">${paths}</svg>`;
}

/* ── EDGAR XBRL fallback for revenue segmentation ────────────────── */
async function _segEdgarXBRL(sym) {
  try {
    // First get CIK from EDGAR company search
    const searchRes = await fetch(
      `https://efts.sec.gov/LATEST/search-index?q="${encodeURIComponent(sym)}"&forms=10-K&dateRange=custom&startdt=${new Date(Date.now()-400*86400000).toISOString().slice(0,10)}`,
      { headers:{'User-Agent':'FINTERM dashboard@finterm.io'}, signal:AbortSignal.timeout(8000) }
    );
    const searchData = await searchRes.json();
    const cik = searchData?.hits?.hits?.[0]?._source?.file_num?.replace(/\D/g,'')?.slice(0,10)
             || searchData?.hits?.hits?.[0]?._source?.entity_id;
    if (!cik) return null;

    const factsRes = await fetch(
      `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik.toString().padStart(10,'0')}.json`,
      { headers:{'User-Agent':'FINTERM dashboard@finterm.io'}, signal:AbortSignal.timeout(10000) }
    );
    const facts = await factsRes.json();
    // Try to find RevenueFromContractWithCustomer by segment
    const revFacts = facts?.facts?.['us-gaap']?.RevenueFromContractWithCustomerExcludingAssessedTax?.units?.USD
                  || facts?.facts?.['us-gaap']?.Revenues?.units?.USD;
    if (!revFacts?.length) return null;

    // Filter to latest annual period with segment dimension
    const withDim = revFacts.filter(f=>f.segment?.dimension && f.form==='10-K')
                             .sort((a,b)=>b.end.localeCompare(a.end));
    if (!withDim.length) return null;

    // Group by end date (latest fiscal year)
    const latestEnd = withDim[0].end;
    const segs = withDim.filter(f=>f.end===latestEnd);
    if (segs.length<2) return null;

    const segMap = {};
    segs.forEach(f=>{ segMap[f.segment?.value||f.segment?.dimension||'Other'] = f.val; });
    return { date: latestEnd, segs: segMap, src: 'SEC EDGAR XBRL' };
  } catch { return null; }
}

async function fmpLoadSegmentation(sym) {
  const el = document.getElementById("fund-seg");
  if (!el) return;
  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading revenue segmentation…</div>`;

  const key = (typeof getFmpKey==="function") ? getFmpKey() : "";
  const SEG_COLORS = ["#4a9eff","#3fb950","#f0883e","#a371f7","#f85149","#d29922","#4dbbff","#ffd700","#ff9800","#e91e63"];

  const renderSegBlock = (title, records, src) => {
    if (!records?.length) return '';
    const latest = records[0];
    const date   = Object.keys(latest)[0];
    const segs   = latest[date];
    if (!segs || typeof segs !== "object") return '';
    const entries = Object.entries(segs).filter(([,v])=>v>0).sort(([,a],[,b])=>b-a);
    if (!entries.length) return '';
    const total = entries.reduce((s,[,v])=>s+(v||0),0);
    const fmtV = v => Math.abs(v)>=1e9?(v/1e9).toFixed(1)+"B":Math.abs(v)>=1e6?(v/1e6).toFixed(0)+"M":v.toLocaleString();

    let s = `<div class="seg-donut-section">
      <div class="seg-section-title">${fmpEsc(title)} <span class="seg-date">${fmpEsc(date)}</span> <span class="seg-src">· ${fmpEsc(src||'FMP')}</span></div>
      <div class="seg-donut-row">
        ${_segDonutSVG(entries, total, SEG_COLORS)}
        <div class="seg-bars" style="flex:1;min-width:0">`;
    entries.forEach(([name, val], i) => {
      const pct = total>0?(val/total*100):0;
      s += `<div class="seg-row">
        <div class="seg-dot" style="background:${SEG_COLORS[i%SEG_COLORS.length]}"></div>
        <div class="seg-label" title="${fmpEsc(name)}">${fmpEsc(name.length>24?name.slice(0,23)+"…":name)}</div>
        <div class="seg-bar-wrap"><div class="seg-bar" style="width:${Math.min(pct,100).toFixed(1)}%;background:${SEG_COLORS[i%SEG_COLORS.length]}"></div></div>
        <div class="seg-pct">${pct.toFixed(1)}%</div>
        <div class="seg-val">${fmpEsc(fmtV(val))}</div>
      </div>`;
    });
    s += `</div></div></div>`;
    return s;
  };

  let html = '', src = '';

  // ── 1. FMP (primary) ─────────────────────────────────────────
  if (key) {
    try {
      const [prodRes, geoRes] = await Promise.all([
        fetch(`https://financialmodelingprep.com/api/v3/revenue-product-segmentation?symbol=${sym}&structure=flat&apikey=${key}`).then(r=>r.json()),
        fetch(`https://financialmodelingprep.com/api/v3/revenue-geographic-segmentation?symbol=${sym}&structure=flat&apikey=${key}`).then(r=>r.json()),
      ]);
      src = 'FMP';
      html += renderSegBlock("By Product / Segment", prodRes, src);
      html += renderSegBlock("By Geography", geoRes, src);
    } catch {}
  }

  // ── 2. SEC EDGAR XBRL fallback ────────────────────────────────
  if (!html) {
    const xbrl = await _segEdgarXBRL(sym);
    if (xbrl?.segs) {
      const fakeRecord = [{ [xbrl.date]: xbrl.segs }];
      src = xbrl.src;
      html += renderSegBlock("By Segment (EDGAR XBRL)", fakeRecord, src);
    }
  }

  if (!html) {
    html = `<div class="no-data">
      // Revenue segmentation unavailable.<br>
      // <a href="#" onclick="openApiConfig('fmp');return false" style="color:var(--accent)">Add FMP key</a> for product/geographic breakdown.
    </div>`;
  }

  el.innerHTML = `<div class="av-live-badge">● Revenue Segmentation · ${fmpEsc(sym)} · ${fmpEsc(src||'—')}</div>` + html;
}

/* ══════════════════════════════════════════════════════════════════
   EARNINGS TRANSCRIPT  — Punto 2 Gap Analysis
   ──────────────────────────────────────────────────────────────────
   Source stack (priority):
   1. API Ninjas /v1/earningscalltranscript  (key: ninjas)
      — Full text with speaker labels, ~10K req/mo free
   2. FMP /v4/earning_call_transcript        (key: fmp)
      — Full text, 250 req/day free
   3. SEC EDGAR 8-K EX-99 full-text search  (no key)
      — Exhibits only, not full transcript
   ══════════════════════════════════════════════════════════════════ */

/* Helper: fetch via API Ninjas */
async function _transcriptNinjas(sym, year, quarter) {
  const key = (typeof getNinjasKey==='function') ? getNinjasKey() : '';
  if (!key) return null;
  try {
    const params = new URLSearchParams({ ticker: sym });
    if (year)    params.set('year',    year);
    if (quarter) params.set('quarter', quarter);
    const res  = await fetch(`https://api.api-ninjas.com/v1/earningscalltranscript?${params}`, {
      headers: { 'X-Api-Key': key },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return null;
    const json = await res.json();
    // API Ninjas returns array or object
    const items = Array.isArray(json) ? json : (json ? [json] : []);
    return items.length ? items : null;
  } catch { return null; }
}

/* Helper: fetch full text via FMP */
async function _transcriptFMP(sym, quarter, year) {
  const key = (typeof getFmpKey==='function') ? getFmpKey() : '';
  if (!key) return null;
  try {
    const res  = await fetch(
      `https://financialmodelingprep.com/api/v3/earning_call_transcript/${sym}?quarter=${quarter}&year=${year}&apikey=${key}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const data = await res.json();
    return Array.isArray(data) && data.length ? data : null;
  } catch { return null; }
}

/* Helper: get list of available transcripts via FMP */
async function _transcriptListFMP(sym) {
  const key = (typeof getFmpKey==='function') ? getFmpKey() : '';
  if (!key) return [];
  try {
    const res  = await fetch(
      `https://financialmodelingprep.com/api/v4/earning_call_transcript?symbol=${sym}&apikey=${key}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

/* Helper: EDGAR 8-K search fallback */
async function _transcriptEdgar(sym) {
  try {
    const today = new Date().toISOString().slice(0,10);
    const from  = new Date(Date.now() - 365*86400000).toISOString().slice(0,10);
    const url   = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(sym)}%22+%22earnings+call%22&forms=8-K&dateRange=custom&startdt=${from}&enddt=${today}`;
    const res   = await fetch(url, {
      headers: { 'User-Agent': 'FINTERM dashboard@finterm.io' },
      signal: AbortSignal.timeout(8000)
    });
    const data  = await res.json();
    return data?.hits?.hits || [];
  } catch { return []; }
}

/* Render speaker-labeled transcript from API Ninjas format */
function _renderNinjasTranscript(item) {
  const lines = (item.transcript || item.content || '').split('\n').filter(l=>l.trim());
  let html = '';
  lines.forEach(line => {
    // Detect speaker labels: "John Smith (CEO):" or "ANALYST:"
    const speakerMatch = line.match(/^([A-Z][^:]{2,40}(?:\([^)]+\))?)\s*:/);
    if (speakerMatch) {
      const speaker = fmpEsc(speakerMatch[1]);
      const text    = fmpEsc(line.slice(speakerMatch[0].length).trim());
      const isMgmt  = /CEO|CFO|COO|President|Chairman|Chief|Officer|VP|Director/i.test(speaker);
      const cls     = isMgmt ? 'trans-speaker-mgmt' : 'trans-speaker-analyst';
      html += `<div class="trans-line">
        <span class="${cls}">${speaker}</span>
        <span class="trans-speech">${text}</span>
      </div>`;
    } else if (line.trim()) {
      html += `<div class="trans-line"><span class="trans-speech">${fmpEsc(line)}</span></div>`;
    }
  });
  return html || `<div class="trans-speech">${fmpEsc(item.transcript||item.content||'')}</div>`;
}

/* Main loader — shown in Fundamentals → TRANS tab */
async function fmpLoadTranscript(sym) {
  const el = document.getElementById('fund-trans');
  if (!el) return;

  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading transcripts for ${fmpEsc(sym)}…</div>`;

  const ninjasKey = (typeof getNinjasKey==='function') ? getNinjasKey() : '';
  const fmpKey    = (typeof getFmpKey==='function')    ? getFmpKey()    : '';

  // Show source badge
  const srcLabel = ninjasKey ? '● API Ninjas + FMP' : fmpKey ? '● FMP' : '● SEC EDGAR (limited)';
  const srcColor = ninjasKey ? '#3fb950' : fmpKey ? '#58a6ff' : '#d29922';

  // ── Get list of available transcripts ────────────────────────────
  let transcriptList = [];
  if (fmpKey) transcriptList = await _transcriptListFMP(sym);

  // Also add API Ninjas entry if available (always shows latest)
  if (ninjasKey) {
    const ninjasLatest = await _transcriptNinjas(sym);
    if (ninjasLatest?.length) {
      // Prepend Ninjas source as "latest" entry
      transcriptList = [{ quarter: '?', year: 'Latest', _ninjas: true, _data: ninjasLatest }, ...transcriptList];
    }
  }

  // EDGAR fallback if no keys
  if (!transcriptList.length) {
    const edgar = await _transcriptEdgar(sym);
    if (edgar.length) {
      el.innerHTML = `
        <div class="av-live-badge" style="color:${srcColor}">${srcLabel}</div>
        <div class="trans-no-key-note">
          ⚠ No Ninjas or FMP key configured — showing SEC EDGAR 8-K filings only (partial content).
          <br>Add an <a href="#" onclick="openApiConfig('ninjas');return false" style="color:var(--accent)">API Ninjas key</a> for full transcripts.
        </div>
        <div class="trans-list">
          ${edgar.slice(0,8).map(h=>{
            const d = h._source;
            return `<div class="trans-list-item">
              <span class="trans-label">${fmpEsc(d?.period_of_report||'8-K')}</span>
              <span class="trans-date">${fmpEsc(d?.file_date||'')}</span>
              <a href="https://www.sec.gov${fmpEsc(d?.file_path||'#')}" target="_blank" class="trans-load-btn">EDGAR ↗</a>
            </div>`;
          }).join('')}
        </div>`;
      return;
    }
    el.innerHTML = `<div class="no-data">
      // No transcripts available without API keys.<br>
      // <a href="#" onclick="openApiConfig('ninjas');return false" style="color:var(--accent)">Add API Ninjas key</a> (free, ~10K req/month) for full earnings call transcripts.
    </div>`;
    return;
  }

  // ── Render list ────────────────────────────────────────────────
  let html = `<div class="av-live-badge" style="color:${srcColor}">${srcLabel} · ${sym}</div>`;
  html += `<div class="trans-list">`;
  transcriptList.slice(0, 10).forEach((item, idx) => {
    const label = item._ninjas ? `Latest (API Ninjas)` : `Q${item.quarter} ${item.year}`;
    const dateStr = item.date ? item.date.slice(0,10) : '';
    const btnFn   = item._ninjas
      ? `fmpShowNinjasTranscript(${idx})`
      : `fmpFetchTranscriptText('${sym}',${item.quarter},${item.year})`;
    html += `<div class="trans-list-item">
      <span class="trans-label">${fmpEsc(label)}</span>
      <span class="trans-date">${fmpEsc(dateStr)}</span>
      <button class="trans-load-btn" onclick="${btnFn}">Load ↓</button>
    </div>`;
  });
  html += `</div>`;
  html += `<div id="trans-text-area" style="margin-top:10px"></div>`;

  // Store Ninjas data for inline access
  if (transcriptList[0]?._ninjas) {
    window._transNinjasData = transcriptList[0]._data;
  }

  el.innerHTML = html;
}

/* Show Ninjas transcript inline (pre-fetched) */
window.fmpShowNinjasTranscript = function(idx) {
  const area = document.getElementById('trans-text-area');
  if (!area || !window._transNinjasData) return;
  const item = window._transNinjasData[0];
  if (!item) return;

  area.innerHTML = `
    <div class="trans-header">
      <span class="trans-title">${fmpEsc(item.company_name || window.currentTicker || '')} Earnings Call</span>
      <span class="trans-meta">${fmpEsc(item.date || item.year || '')} · API Ninjas</span>
    </div>
    <div class="trans-body">${_renderNinjasTranscript(item)}</div>`;
};

/* Load FMP transcript text (called from list button) */
async function fmpFetchTranscriptText(sym, quarter, year) {
  const area = document.getElementById('trans-text-area');
  if (!area) return;
  area.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading Q${quarter} ${year} transcript…</div>`;

  // Try Ninjas first (has speaker labels), fall back to FMP
  let content = null, source = '';
  const ninjasKey = (typeof getNinjasKey==='function') ? getNinjasKey() : '';
  if (ninjasKey) {
    const data = await _transcriptNinjas(sym, year, quarter);
    if (data?.length) { content = data[0]; source = 'API Ninjas'; }
  }
  if (!content) {
    const data = await _transcriptFMP(sym, quarter, year);
    if (data?.length) { content = data[0]; source = 'FMP'; }
  }

  if (!content) {
    area.innerHTML = `<div class="no-data">// Transcript not available for Q${quarter} ${year}.</div>`;
    return;
  }

  const txt = content.content || content.transcript || '';
  area.innerHTML = `
    <div class="trans-header">
      <span class="trans-title">Q${quarter} ${year} Earnings Call · <span style="color:var(--accent);font-size:9px">${fmpEsc(source)}</span></span>
      <span class="trans-meta">${fmpEsc(content.date ? content.date.slice(0,10) : '')}</span>
    </div>
    <div class="trans-body">${source==='API Ninjas' ? _renderNinjasTranscript(content) : fmpEsc(txt).replace(/\n/g,'<br>')}</div>`;
}


/* ══════════════════════════════════════════════════════════════════
   IPO CALENDAR  — Punto 3 Gap Analysis
   ──────────────────────────────────────────────────────────────────
   Source stack:
   1. NASDAQ Public API  api.nasdaq.com/api/ipo/calendar  (NO KEY)
   2. Finnhub /calendar/ipo                              (existing key)
   3. FMP /v3/ipo_calendar                               (existing key)
   ══════════════════════════════════════════════════════════════════ */

async function fmpLoadIpoCalendar() {
  const el = document.getElementById('macro-ipo');
  if (!el) return;
  if (el.dataset.loaded === '1') return;
  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading IPO calendar…</div>`;

  // ── 1. NASDAQ Public API (no key) ────────────────────────────
  let ipos = [], src = '';
  try {
    const now   = new Date();
    const ym    = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const ymNext= new Date(now.getFullYear(), now.getMonth()+2, 1);
    const ym2   = `${ymNext.getFullYear()}-${String(ymNext.getMonth()+1).padStart(2,'0')}`;
    const [r1, r2] = await Promise.allSettled([
      fetch(`https://api.nasdaq.com/api/ipo/calendar?date=${ym}`,
        { headers:{'User-Agent':'Mozilla/5.0','Accept':'application/json'}, signal:AbortSignal.timeout(7000) }).then(r=>r.json()),
      fetch(`https://api.nasdaq.com/api/ipo/calendar?date=${ym2}`,
        { headers:{'User-Agent':'Mozilla/5.0','Accept':'application/json'}, signal:AbortSignal.timeout(7000) }).then(r=>r.json()),
    ]);
    const parse = res => {
      if (res.status !== 'fulfilled') return [];
      const d = res.value?.data;
      // NASDAQ response: { data: { upcoming: { upcomingTable: { rows: [...] } }, priced: {...}, filed: {...} } }
      const all = [];
      for (const section of ['upcoming','priced','filed']) {
        const rows = d?.[section]?.rows || d?.[section]?.upcomingTable?.rows || [];
        rows.forEach(r => all.push({ ...r, _section: section }));
      }
      return all;
    };
    ipos = [...parse(r1), ...parse(r2)];
    if (ipos.length) src = 'NASDAQ (no key)';
  } catch {}

  // ── 2. Finnhub fallback ───────────────────────────────────────
  if (!ipos.length) {
    const fhKey = (typeof getFinnhubKey==='function') ? getFinnhubKey() : '';
    if (fhKey) {
      try {
        const today = new Date().toISOString().slice(0,10);
        const plus90= new Date(Date.now()+90*86400000).toISOString().slice(0,10);
        const r = await fetch(`https://finnhub.io/api/v1/calendar/ipo?from=${today}&to=${plus90}&token=${fhKey}`,
          { signal: AbortSignal.timeout(7000) });
        const d = await r.json();
        ipos = (d.ipoCalendar || []).map(x => ({
          dealId: x.symbol, companyName: x.name, exchange: x.exchange,
          expectedPriceDate: x.date, priceLow: x.price?.split('-')?.[0]?.replace('$',''),
          priceHigh: x.price?.split('-')?.[1]?.replace('$',''),
          proposedSharePrice: x.price, sharesOffered: x.numberOfShares,
          _section: 'upcoming',
        }));
        if (ipos.length) src = 'Finnhub';
      } catch {}
    }
  }

  // ── 3. FMP fallback ───────────────────────────────────────────
  if (!ipos.length) {
    const key = (typeof getFmpKey==='function') ? getFmpKey() : '';
    if (key) {
      try {
        const today  = new Date().toISOString().slice(0,10);
        const future = new Date(Date.now()+90*86400000).toISOString().slice(0,10);
        const d = await fetch(`https://financialmodelingprep.com/api/v3/ipo_calendar?from=${today}&to=${future}&apikey=${key}`,
          { signal: AbortSignal.timeout(7000) }).then(r=>r.json());
        ipos = (d||[]).map(x => ({
          dealId: x.symbol, companyName: x.company||x.name, exchange: x.exchange,
          expectedPriceDate: x.date, priceLow: x.priceLow, priceHigh: x.priceHigh,
          proposedSharePrice: x.priceRange, sharesOffered: x.shares,
          _section: 'upcoming',
        }));
        if (ipos.length) src = 'FMP';
      } catch {}
    }
  }

  if (!ipos.length) {
    el.innerHTML = `<div class="no-data">// No IPO data available. NASDAQ, Finnhub, and FMP returned no results.</div>`;
    return;
  }

  // Sort by date
  ipos.sort((a,b) => (a.expectedPriceDate||'').localeCompare(b.expectedPriceDate||''));

  const sectionColor = { upcoming:'#58a6ff', priced:'#3fb950', filed:'#d29922', withdrawn:'#f85149' };

  let html = `<div class="av-live-badge">● IPO Calendar · ${ipos.length} IPOs · ${fmpEsc(src)}</div>`;
  html += `<div style="overflow-x:auto"><table class="fmp-table">
    <thead><tr>
      <th>Status</th><th>Date</th><th>Symbol</th><th>Company</th>
      <th>Exchange</th><th>Price Range</th><th>Shares</th>
    </tr></thead><tbody>`;

  ipos.forEach(ipo => {
    const sec    = ipo._section || 'upcoming';
    const col    = sectionColor[sec] || '#888';
    const pr     = ipo.proposedSharePrice || (ipo.priceLow && ipo.priceHigh ? `$${ipo.priceLow}–$${ipo.priceHigh}` : ipo.priceLow ? `$${ipo.priceLow}` : '—');
    const shares = ipo.sharesOffered ? (parseInt(ipo.sharesOffered)>=1e6
      ? (parseInt(ipo.sharesOffered)/1e6).toFixed(1)+'M'
      : parseInt(ipo.sharesOffered).toLocaleString()) : '—';
    const sym    = ipo.dealId||ipo.symbol||'—';
    html += `<tr>
      <td><span style="font-size:9px;font-weight:700;color:${col}">${fmpEsc(sec.toUpperCase())}</span></td>
      <td style="font-family:var(--font-mono)">${fmpEsc(ipo.expectedPriceDate||ipo.pricingDate||'—')}</td>
      <td><strong style="color:var(--accent);cursor:pointer" onclick="if(typeof changeTicker==='function')changeTicker('${fmpEsc(sym)}')">${fmpEsc(sym)}</strong></td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${fmpEsc(ipo.companyName||ipo.name||'')}">${fmpEsc((ipo.companyName||ipo.name||'').slice(0,30))}</td>
      <td>${fmpEsc(ipo.exchange||ipo.proposedExchange||'—')}</td>
      <td style="font-family:var(--font-mono)">${fmpEsc(pr)}</td>
      <td style="font-family:var(--font-mono)">${fmpEsc(shares)}</td>
    </tr>`;
  });
  html += `</tbody></table></div>`;
  el.dataset.loaded = '1';
  el.innerHTML = html;
}


/* ══════════════════════════════════════════════════════════════════
   FORM 4 INSIDER TRADING  (SEC EDGAR — no API key)
   Enhances Fundamentals → FILINGS tab with live Form 4 feed
   Also available as standalone: fmpLoadForm4(sym)
   ══════════════════════════════════════════════════════════════════ */
async function fmpLoadForm4(sym) {
  const el = document.getElementById("fund-form4");
  if (!el) return;
  if (el.dataset.loaded === "1") return;
  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading Form 4 insider trades…</div>`;
  try {
    // Use EDGAR full-text search for Form 4 filings for this issuer ticker
    const url = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(sym)}%22&dateRange=custom&startdt=${new Date(Date.now()-90*864e5).toISOString().slice(0,10)}&forms=4`;
    const res  = await fetch(url, { headers: { "User-Agent": "FINTERM research@finterm.io" } });
    const data = await res.json();
    const hits  = data.hits?.hits || [];

    if (!hits.length) {
      // Fallback: Finnhub insider transactions (if key set)
      const fhKey = localStorage.getItem("finterm_key_finnhub") || "";
      if (fhKey) {
        await fhLoadInsiderTransactions(sym);
        return;
      }
      el.innerHTML = `<div class="no-data">// No Form 4 filings found for ${sym} in last 90 days.</div>`;
      el.dataset.loaded = "1";
      return;
    }

    let html = `<div class="av-live-badge">● Form 4 Insider Filings · ${sym} · SEC EDGAR</div>`;
    html += `<table class="fmp-table">
      <thead><tr><th>Filed</th><th>Insider</th><th>Relationship</th><th>Transaction</th><th>Shares</th><th>Price</th></tr></thead>
      <tbody>`;

    hits.slice(0, 20).forEach(h => {
      const src  = h._source || {};
      const filed = src.file_date || src.period_of_report || "—";
      const name  = src.display_names?.[0]?.name || src.entity_name || "Unknown";
      const rel   = src.display_names?.[0]?.forms?.[0] || "—";
      // EDGAR raw filings — show link to full document
      const accNo = src.accession_no?.replace(/-/g,"") || "";
      const link  = accNo ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&filenum=${accNo}&type=4&dateb=&owner=include&count=1` : "#";
      html += `<tr>
        <td>${filed}</td>
        <td>${name.length > 22 ? name.slice(0,21)+"…" : name}</td>
        <td>${rel}</td>
        <td><a href="${link}" target="_blank" rel="noopener" class="sec-link">View →</a></td>
        <td>—</td><td>—</td>
      </tr>`;
    });
    html += `</tbody></table>
    <div class="av-note" style="margin-top:6px">// Form 4 data from SEC EDGAR EFTS. Click View for transaction detail.</div>`;
    el.innerHTML = html;
    el.dataset.loaded = "1";
  } catch(e) {
    // Fallback to Finnhub if EDGAR fails
    const fhKey = localStorage.getItem("finterm_key_finnhub") || "";
    if (fhKey) { await fhLoadInsiderTransactions(sym); return; }
    el.innerHTML = `<div class="no-data">// Form 4 error: ${e.message}</div>`;
  }
}

/* Finnhub fallback for insider transactions */
async function fhLoadInsiderTransactions(sym) {
  const el  = document.getElementById("fund-form4");
  const key = localStorage.getItem("finterm_key_finnhub") || "";
  if (!el || !key) return;
  try {
    const data = await fetch(`https://finnhub.io/api/v1/stock/insider-transactions?symbol=${sym}&token=${key}`).then(r=>r.json());
    const txns = data.data || [];
    if (!txns.length) {
      el.innerHTML = `<div class="no-data">// No insider transactions found for ${sym}.</div>`;
      el.dataset.loaded = "1";
      return;
    }
    let html = `<div class="av-live-badge">● Insider Transactions · ${sym} · Finnhub</div>`;
    html += `<table class="fmp-table">
      <thead><tr><th>Date</th><th>Insider</th><th>Title</th><th>Type</th><th>Shares</th><th>Price</th><th>Value</th></tr></thead>
      <tbody>`;
    txns.slice(0, 20).forEach(t => {
      const isBuy = t.transactionCode === "P" || (t.share > 0 && t.transactionCode !== "S");
      const cls   = isBuy ? "pos" : "neg";
      const type  = t.transactionCode === "P" ? "Buy" : t.transactionCode === "S" ? "Sale" : t.transactionCode || "—";
      const val   = t.share && t.price ? (t.share * t.price) : null;
      const fmtV  = val ? (Math.abs(val) >= 1e6 ? "$"+(val/1e6).toFixed(2)+"M" : "$"+val.toFixed(0)) : "—";
      html += `<tr>
        <td>${t.transactionDate || t.filingDate || "—"}</td>
        <td>${(t.name||"—").length > 18 ? t.name.slice(0,17)+"…" : t.name||"—"}</td>
        <td>${(t.position||"—").length > 14 ? t.position.slice(0,13)+"…" : t.position||"—"}</td>
        <td class="${cls}"><strong>${type}</strong></td>
        <td>${t.share ? Number(t.share).toLocaleString() : "—"}</td>
        <td>${t.price ? "$"+parseFloat(t.price).toFixed(2) : "—"}</td>
        <td>${fmtV}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
    el.innerHTML = html;
    el.dataset.loaded = "1";
  } catch(e) {
    el.innerHTML = `<div class="no-data">// Insider transactions error: ${e.message}</div>`;
  }
}

/* ══════════════════════════════════════════════════════════════════
   FA TAB — Live Financial Statements
   ──────────────────────────────────────────────────────────────────
   Sources:
   1. FMP /income-statement + /balance-sheet-statement + /cash-flow-statement
   2. SEC EDGAR XBRL /companyfacts/{CIK}.json  (no key fallback)
   Called from: tab click, or changeTicker when FA tab active
   ══════════════════════════════════════════════════════════════════ */

async function fmpLoadFATab(sym) {
  const el = document.getElementById('fund-fa');
  if (!el) return;
  if (el.dataset.faSym === sym && el.dataset.loaded === '1') return;

  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading financials for ${fmpEsc(sym)}…</div>`;
  el.dataset.faSym  = sym;
  el.dataset.loaded = '0';

  const key   = (typeof getFmpKey==='function') ? getFmpKey() : '';
  const fmtB  = v => { if(v==null||isNaN(v)) return '—'; const a=Math.abs(v); return (v<0?'(':'')+( a>=1e12?'$'+(a/1e12).toFixed(2)+'T' : a>=1e9?'$'+(a/1e9).toFixed(1)+'B' : a>=1e6?'$'+(a/1e6).toFixed(0)+'M' : '$'+a.toLocaleString())+(v<0?')':''); };
  const fmtPct= v => v==null?'—':(v*100).toFixed(1)+'%';
  const posClr= v => v==null?'':v>=0?'wm-pos':'wm-neg';
  const sHead = t => `<div class="fa-section-head">${t}</div>`;

  let html = '', src = '';

  // ── 1. FMP (primary) ─────────────────────────────────────────────
  if (key) {
    try {
      const [inc, bal, cf] = await Promise.all([
        fetch(`https://financialmodelingprep.com/api/v3/income-statement/${sym}?limit=5&apikey=${key}`, {signal:AbortSignal.timeout(8000)}).then(r=>r.json()),
        fetch(`https://financialmodelingprep.com/api/v3/balance-sheet-statement/${sym}?limit=5&apikey=${key}`, {signal:AbortSignal.timeout(8000)}).then(r=>r.json()),
        fetch(`https://financialmodelingprep.com/api/v3/cash-flow-statement/${sym}?limit=5&apikey=${key}`, {signal:AbortSignal.timeout(8000)}).then(r=>r.json()),
      ]);

      if (Array.isArray(inc) && inc.length) {
        src = 'FMP';
        // Income statement
        const years = inc.map(r=>r.calendarYear||r.date?.slice(0,4)||'');
        html += sHead('📊 Income Statement (USD)');
        html += `<div class="fa-table-wrap"><table class="fa-table"><thead><tr>
          <th>Year</th><th>Revenue</th><th>Gross Profit</th><th>Gross Margin</th>
          <th>EBITDA</th><th>EBIT</th><th>Net Income</th><th>EPS</th><th>Net Margin</th>
        </tr></thead><tbody>${inc.map(r=>`<tr>
          <td class="fa-year">${fmpEsc(r.calendarYear||r.date?.slice(0,4)||'')}</td>
          <td>${fmtB(r.revenue)}</td>
          <td>${fmtB(r.grossProfit)}</td>
          <td class="${posClr(r.grossProfitRatio)}">${fmtPct(r.grossProfitRatio)}</td>
          <td>${fmtB(r.ebitda)}</td>
          <td>${fmtB(r.operatingIncome)}</td>
          <td class="${posClr(r.netIncome)}">${fmtB(r.netIncome)}</td>
          <td>$${r.eps!=null?r.eps.toFixed(2):'—'}</td>
          <td class="${posClr(r.netIncomeRatio)}">${fmtPct(r.netIncomeRatio)}</td>
        </tr>`).join('')}</tbody></table></div>`;

        // Balance sheet
        if (Array.isArray(bal) && bal.length) {
          html += sHead('🏦 Balance Sheet (USD)');
          html += `<div class="fa-table-wrap"><table class="fa-table"><thead><tr>
            <th>Year</th><th>Total Assets</th><th>Total Liabilities</th>
            <th>Equity</th><th>Cash</th><th>Total Debt</th><th>D/E Ratio</th>
          </tr></thead><tbody>${bal.map(r=>`<tr>
            <td class="fa-year">${fmpEsc(r.calendarYear||r.date?.slice(0,4)||'')}</td>
            <td>${fmtB(r.totalAssets)}</td>
            <td>${fmtB(r.totalLiabilities)}</td>
            <td class="${posClr(r.totalStockholdersEquity)}">${fmtB(r.totalStockholdersEquity)}</td>
            <td>${fmtB(r.cashAndCashEquivalents)}</td>
            <td>${fmtB(r.totalDebt)}</td>
            <td class="${r.totalDebt&&r.totalStockholdersEquity?posClr(-r.totalDebt/r.totalStockholdersEquity):''}">
              ${r.totalDebt&&r.totalStockholdersEquity?(r.totalDebt/r.totalStockholdersEquity).toFixed(2):'—'}
            </td>
          </tr>`).join('')}</tbody></table></div>`;
        }

        // Cash flow
        if (Array.isArray(cf) && cf.length) {
          html += sHead('💵 Cash Flow (USD)');
          html += `<div class="fa-table-wrap"><table class="fa-table"><thead><tr>
            <th>Year</th><th>Operating CF</th><th>CapEx</th><th>Free CF</th>
            <th>Dividends</th><th>Share Buybacks</th><th>FCF Margin</th>
          </tr></thead><tbody>${cf.map((r,i)=>`<tr>
            <td class="fa-year">${fmpEsc(r.calendarYear||r.date?.slice(0,4)||'')}</td>
            <td class="${posClr(r.operatingCashFlow)}">${fmtB(r.operatingCashFlow)}</td>
            <td>${fmtB(r.capitalExpenditure)}</td>
            <td class="${posClr(r.freeCashFlow)}">${fmtB(r.freeCashFlow)}</td>
            <td>${fmtB(r.dividendsPaid)}</td>
            <td>${fmtB(r.commonStockRepurchased)}</td>
            <td class="${inc[i]?.revenue&&r.freeCashFlow?posClr(r.freeCashFlow/inc[i].revenue):''}">
              ${inc[i]?.revenue&&r.freeCashFlow!=null?fmtPct(r.freeCashFlow/inc[i].revenue):'—'}
            </td>
          </tr>`).join('')}</tbody></table></div>`;
        }

        html += `<div class="fa-source-note">Source: FMP (Financial Modeling Prep)</div>`;
      }
    } catch(e) { console.warn('[FA FMP]', e.message); }
  }

  // ── 2. SEC EDGAR XBRL fallback (no key) ──────────────────────────
  if (!html) {
    try {
      const cik = await secGetCik(sym);
      if (cik) {
        const xbrlRes = await fetch(
          `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10,'0')}.json`,
          { headers:{'User-Agent':'FINTERM dashboard@finterm.io','Accept':'application/json'}, signal:AbortSignal.timeout(10000) }
        );
        const xbrl = await xbrlRes.json();
        src = 'SEC EDGAR XBRL';

        // Extract key concepts
        const getXbrl = (concept, tag='us-gaap') => {
          const units = xbrl.facts?.[tag]?.[concept]?.units;
          if (!units) return [];
          const usd = units.USD || units.shares || Object.values(units)[0] || [];
          return usd.filter(e=>e.form==='10-K'&&e.val!=null).sort((a,b)=>b.end?.localeCompare(a.end)||0).slice(0,5);
        };

        const revenues   = getXbrl('RevenueFromContractWithCustomerExcludingAssessedTax') || getXbrl('Revenues') || getXbrl('SalesRevenueNet');
        const netIncomes = getXbrl('NetIncomeLoss');
        const assets     = getXbrl('Assets');
        const equity     = getXbrl('StockholdersEquity');
        const opCF       = getXbrl('NetCashProvidedByUsedInOperatingActivities');

        if (revenues.length || netIncomes.length) {
          html += sHead('📊 Key Financials from SEC EDGAR XBRL');
          html += `<div class="fa-table-wrap"><table class="fa-table"><thead><tr>
            <th>Period</th><th>Revenue</th><th>Net Income</th><th>Total Assets</th><th>Equity</th><th>Operating CF</th>
          </tr></thead><tbody>`;

          const periods = [...new Set([
            ...revenues.map(r=>r.end?.slice(0,4)),
            ...netIncomes.map(r=>r.end?.slice(0,4)),
          ])].filter(Boolean).sort().reverse().slice(0,5);

          periods.forEach(yr => {
            const rev = revenues.find(r=>r.end?.startsWith(yr));
            const ni  = netIncomes.find(r=>r.end?.startsWith(yr));
            const ast = assets.find(r=>r.end?.startsWith(yr));
            const eq  = equity.find(r=>r.end?.startsWith(yr));
            const ocf = opCF.find(r=>r.end?.startsWith(yr));
            html += `<tr>
              <td class="fa-year">${fmpEsc(yr)}</td>
              <td>${fmtB(rev?.val)}</td>
              <td class="${posClr(ni?.val)}">${fmtB(ni?.val)}</td>
              <td>${fmtB(ast?.val)}</td>
              <td class="${posClr(eq?.val)}">${fmtB(eq?.val)}</td>
              <td class="${posClr(ocf?.val)}">${fmtB(ocf?.val)}</td>
            </tr>`;
          });

          html += `</tbody></table></div>`;
          html += `<div class="fa-source-note">Source: SEC EDGAR XBRL (no API key) · <a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${fmpEsc(String(cik))}&type=10-K" target="_blank" class="geo-wm-link">10-K Filings ↗</a></div>`;
        } else {
          html = `<div class="no-data">// SEC EDGAR XBRL data not found for ${fmpEsc(sym)}.</div>`;
        }
      }
    } catch(e) {
      console.warn('[FA EDGAR XBRL]', e.message);
    }
  }

  // ── No data ───────────────────────────────────────────────────────
  if (!html) {
    html = `<div class="no-data" style="line-height:1.9">
      // Financial statements not available for <strong>${fmpEsc(sym)}</strong>.<br>
      // <a href="#" onclick="openApiConfig('fmp');return false" style="color:var(--accent)">Add FMP key</a> for full income/balance/cashflow statements.<br>
      // <a href="https://www.sec.gov/cgi-bin/browse-edgar?company=${fmpEsc(sym)}&action=getcompany&type=10-K" target="_blank" class="geo-wm-link">SEC EDGAR 10-K ↗</a>
    </div>`;
  }

  el.innerHTML = html;
  el.dataset.loaded = '1';
}

window.fmpLoadFATab = fmpLoadFATab;

/* ══════════════════════════════════════════════════════════════════
   FA TAB — SEC EDGAR XBRL fallback (no API key)
   ──────────────────────────────────────────────────────────────────
   data.sec.gov/api/xbrl/companyfacts/CIK{10d}.json
   Extracts: Revenue, NetIncome, Assets, Liabilities, Equity,
             OperatingCashFlow, CapEx, EPS  — last 5 annual filings
   ══════════════════════════════════════════════════════════════════ */

/* Enrich existing FA tab with XBRL key ratios (called when AV data present) */
async function faEnrichWithXBRL(sym, el) {
  if (!sym || !el) return;
  const ratios = await _xbrlGetRatios(sym);
  if (!ratios) return;
  const existing = el.querySelector('.xbrl-enrichment');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.className = 'xbrl-enrichment';
  div.innerHTML = `<div class="av-live-badge" style="margin-top:8px">📊 Key Ratios · SEC EDGAR XBRL (no key)</div>
    <div class="xbrl-kpi-row">
      ${ratios.map(r=>`<div class="xbrl-kpi">
        <span class="xbrl-kpi-label">${fmpEsc(r.label)}</span>
        <span class="xbrl-kpi-val">${fmpEsc(r.value)}</span>
        <span class="xbrl-kpi-date">${fmpEsc(r.date||'')}</span>
      </div>`).join('')}
    </div>`;
  el.appendChild(div);
}

/* Load entire FA tab from EDGAR XBRL when no AV key */
async function faLoadEdgarXBRL(sym, el) {
  if (!sym || !el) return;
  try {
    // Step 1: get CIK from SEC EDGAR ticker lookup
    const tickerRes = await fetch(
      `https://data.sec.gov/submissions/CIK${String(0).padStart(10,'0')}.json`,
      { signal: AbortSignal.timeout(5000) }
    );
    // Actually use the ticker-to-CIK lookup endpoint
    const mapRes = await fetch(
      'https://data.sec.gov/files/company_tickers.json',
      { headers: { 'User-Agent': 'FINTERM research@finterm.io' },
        signal: AbortSignal.timeout(8000) }
    );
    const mapJson = await mapRes.json();

    // Find CIK for ticker
    let cik = null;
    for (const [, entry] of Object.entries(mapJson)) {
      if ((entry.ticker || '').toUpperCase() === sym.toUpperCase()) {
        cik = entry.cik_str;
        break;
      }
    }

    if (!cik) {
      el.innerHTML = `<div class="no-data">// Ticker "${fmpEsc(sym)}" not found in SEC EDGAR.
        <br>// Add <a href="#" onclick="openApiConfig('av');return false" style="color:var(--accent)">Alpha Vantage</a>
        or <a href="#" onclick="openApiConfig('fmp');return false" style="color:var(--accent)">FMP key</a> for full financial statements.</div>`;
      return;
    }

    // Step 2: Fetch companyfacts JSON
    const factsRes = await fetch(
      `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10,'0')}.json`,
      { headers: { 'User-Agent': 'FINTERM research@finterm.io' },
        signal: AbortSignal.timeout(12000) }
    );
    const facts = await factsRes.json();
    const usgaap = facts.facts?.['us-gaap'] || {};

    // Helper: get last N annual values for a concept
    const getAnnual = (concept, N=5) => {
      const data = usgaap[concept]?.units?.USD || usgaap[concept]?.units?.shares || [];
      const annual = data
        .filter(d => d.form === '10-K' && d.val != null)
        .sort((a,b) => (b.end||b.filed||'').localeCompare(a.end||a.filed||''));
      // Deduplicate by year
      const seen = new Set();
      return annual.filter(d => {
        const yr = (d.end||'').slice(0,4);
        if (seen.has(yr)) return false;
        seen.add(yr); return true;
      }).slice(0,N).reverse();
    };

    const fmt3 = v => {
      const n = typeof v === 'number' ? v : parseFloat(v);
      if (isNaN(n)) return '—';
      if (Math.abs(n) >= 1e12) return (n/1e12).toFixed(2)+'T';
      if (Math.abs(n) >= 1e9)  return (n/1e9).toFixed(2)+'B';
      if (Math.abs(n) >= 1e6)  return (n/1e6).toFixed(1)+'M';
      return n.toLocaleString();
    };

    // Extract key financial series
    const revenue  = getAnnual('Revenues') || getAnnual('RevenueFromContractWithCustomerExcludingAssessedTax');
    const netInc   = getAnnual('NetIncomeLoss');
    const assets   = getAnnual('Assets');
    const liab     = getAnnual('Liabilities');
    const equity   = getAnnual('StockholdersEquity') || getAnnual('StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest');
    const opCF     = getAnnual('NetCashProvidedByUsedInOperatingActivities');
    const capex    = getAnnual('PaymentsToAcquirePropertyPlantAndEquipment');
    const eps      = getAnnual('EarningsPerShareDiluted');

    if (!revenue.length && !netInc.length) {
      el.innerHTML = `<div class="no-data">// EDGAR XBRL data not available for ${fmpEsc(sym)}.
        <br>// Add <a href="#" onclick="openApiConfig('fmp');return false" style="color:var(--accent)">FMP key</a> for full financial statements.</div>`;
      return;
    }

    const years = [...new Set([
      ...revenue.map(d=>d.end?.slice(0,4)),
      ...netInc.map(d=>d.end?.slice(0,4)),
    ].filter(Boolean))].sort();

    const getVal = (arr, yr) => {
      const row = arr.find(d => d.end?.startsWith(yr));
      return row ? fmt3(row.val) : '—';
    };

    // Render tables
    const incRows = years.map(yr => `<tr>
      <td>${yr}</td>
      <td>${getVal(revenue,yr)}</td>
      <td>—</td>
      <td>—</td>
      <td>${getVal(netInc,yr)}</td>
      <td>${getVal(eps,yr)}</td>
    </tr>`).join('');

    const balRows = years.map(yr => `<tr>
      <td>${yr}</td>
      <td>${getVal(assets,yr)}</td>
      <td>${getVal(liab,yr)}</td>
      <td>${getVal(equity,yr)}</td>
      <td>—</td><td>—</td>
    </tr>`).join('');

    const cfRows = years.map(yr => `<tr>
      <td>${yr}</td>
      <td>${getVal(opCF,yr)}</td>
      <td>${getVal(capex,yr)}</td>
      <td>—</td><td>—</td>
    </tr>`).join('');

    const sHead = t => `<div class="av-section-head" style="margin-top:10px">${t}</div>`;

    el.innerHTML = `
      <div class="av-live-badge">● SEC EDGAR XBRL · ${fmpEsc(sym)} · No API key</div>
      ${sHead('Income Statement')}
      <div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>Year</th><th>Revenue</th><th>Gross Profit</th><th>EBIT</th><th>Net Income</th><th>EPS</th></tr></thead>
        <tbody>${incRows}</tbody>
      </table></div>
      ${sHead('Balance Sheet')}
      <div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>Year</th><th>Total Assets</th><th>Total Liab.</th><th>Equity</th><th>Cash</th><th>Debt</th></tr></thead>
        <tbody>${balRows}</tbody>
      </table></div>
      ${sHead('Cash Flow')}
      <div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>Year</th><th>Operating CF</th><th>CapEx</th><th>Free CF</th><th>Dividends</th></tr></thead>
        <tbody>${cfRows}</tbody>
      </table></div>
      <div style="font-size:9px;color:var(--text-muted);padding:5px 0">
        Source: <a href="https://data.sec.gov" target="_blank" class="geo-wm-link">SEC EDGAR XBRL ↗</a> · 10-K filings only · No API key required
      </div>`;

  } catch(e) {
    el.innerHTML = `<div class="no-data">// EDGAR XBRL error: ${fmpEsc(e.message)}
      <br>// Add <a href="#" onclick="openApiConfig('av');return false" style="color:var(--accent)">Alpha Vantage</a>
      or <a href="#" onclick="openApiConfig('fmp');return false" style="color:var(--accent)">FMP key</a> for financial statements.</div>`;
  }
}

/* Helper: get key ratios from XBRL for enrichment */
async function _xbrlGetRatios(sym) {
  try {
    const mapRes = await fetch('https://data.sec.gov/files/company_tickers.json', {
      headers:{'User-Agent':'FINTERM research@finterm.io'}, signal:AbortSignal.timeout(6000)
    });
    const map = await mapRes.json();
    let cik = null;
    for(const [,e] of Object.entries(map)) {
      if((e.ticker||'').toUpperCase()===sym.toUpperCase()){cik=e.cik_str;break;}
    }
    if(!cik) return null;

    const factsRes = await fetch(
      `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10,'0')}.json`,
      {headers:{'User-Agent':'FINTERM research@finterm.io'},signal:AbortSignal.timeout(10000)}
    );
    const facts = await factsRes.json();
    const g = facts.facts?.['us-gaap']||{};

    const latestAnnual = (concept) => {
      const arr = (g[concept]?.units?.USD||g[concept]?.units?.shares||[])
        .filter(d=>d.form==='10-K'&&d.val!=null)
        .sort((a,b)=>(b.end||'').localeCompare(a.end||''));
      return arr[0]||null;
    };

    const fmt3 = v => {
      if(v==null)return'—';
      if(Math.abs(v)>=1e12)return(v/1e12).toFixed(2)+'T';
      if(Math.abs(v)>=1e9) return(v/1e9).toFixed(2)+'B';
      if(Math.abs(v)>=1e6) return(v/1e6).toFixed(1)+'M';
      return v.toLocaleString();
    };

    const ratioList = [
      {label:'Revenue',   concept:'Revenues'},
      {label:'Net Income',concept:'NetIncomeLoss'},
      {label:'EPS Diluted',concept:'EarningsPerShareDiluted'},
      {label:'Total Assets',concept:'Assets'},
      {label:'Equity',    concept:'StockholdersEquity'},
      {label:'Op. CF',    concept:'NetCashProvidedByUsedInOperatingActivities'},
    ];

    return ratioList.map(r => {
      const row = latestAnnual(r.concept)||latestAnnual(r.concept+'ExcludingAssessedTax');
      return { label:r.label, value:row?fmt3(row.val):'—', date:row?.end?.slice(0,7)||'' };
    });
  } catch { return null; }
}

window.faLoadEdgarXBRL  = faLoadEdgarXBRL;
window.faEnrichWithXBRL = faEnrichWithXBRL;
