/* ══════════════════════════════════════════════════════════════════
   FINTERM — secdera.js  (Phase 4 · Reference Data)
   SEC DERA — N-PORT Fund Holdings  +  N-CEN Fund Metadata
   +  Twelve Data Corporate Actions Fallback
   ──────────────────────────────────────────────────────────────────
   4.3  SEC FORM N-PORT  (no key — EDGAR public)
        Source: SEC EDGAR submissions JSON → latest N-PORT filing
                → XML holdings extraction via SEC Archives
        Trigger: ticker detected as ETF or Mutual Fund
        Populates:
          #fund-hold → "Regulatory Holdings (SEC N-PORT)" section
                       appended below existing FMP holdings table.
                       Shows: top-25 holdings, value, percentage,
                       CUSIP/ISIN, asset category, filing date.

   4.4  SEC FORM N-CEN  (no key — EDGAR public)
        Source: SEC EDGAR submissions JSON → latest N-CEN filing
        Trigger: ticker detected as ETF or Fund
        Populates:
          #fund-des → "ETF/Fund Metadata (N-CEN)" block showing
                      total net assets (AUM proxy), series name,
                      fund type, fiscal year end, exchange, filing date.

   4.5  TWELVE DATA  (free key — "internal non-display" restriction noted)
        Use: supplementary fallback for dividends and splits
             when FMP returns no data in #fund-div.
        Free tier: 800 API calls/day, "internal non-display" terms.
        Populates:
          #fund-div → appended "Twelve Data" section as tertiary
                      source (FMP → EODHD → Twelve Data).

   ARCHITECTURE
     Both N-PORT and N-CEN use the same CIK resolution:
       1. SEC company_tickers.json lookup (same as fmp.js)
       2. EDGAR submissions JSON → scan filings for N-PORT/N-CEN
       3. Fetch latest filing XML from SEC Archives
     All three sub-modules share one file for code efficiency
     since they all depend on EDGAR and are all ETF/fund-only.
   ══════════════════════════════════════════════════════════════════ */

(function () {
"use strict";

/* ── Constants ──────────────────────────────────────────────────── */
const EDGAR_UA      = "FINTERM dashboard research@finterm.app";
const EDGAR_BASE    = "https://data.sec.gov";
const DERA_TTL      = 6 * 60 * 60 * 1000;   // 6 h — quarterly filings
const TD_BASE       = "https://api.twelvedata.com";
const TD_SESSION    = "twelvedata_call_count";
const TD_TTL        = 24 * 60 * 60 * 1000;  // 24 h

/* ── Cache ──────────────────────────────────────────────────────── */
const _CACHE = {};
function _cacheGet(k, ttl) {
  const e = _CACHE[k];
  return (e && Date.now() - e.ts < ttl) ? e.data : null;
}
function _cacheSet(k, d) { _CACHE[k] = { data: d, ts: Date.now() }; }

/* ── Helpers ────────────────────────────────────────────────────── */
function _esc(s) {
  return String(s ?? "").replace(/[<>&"]/g, c =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
}
function _fmt(n, d = 2) {
  if (n == null || isNaN(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
  if (a >= 1e9)  return "$" + (n / 1e9).toFixed(2)  + "B";
  if (a >= 1e6)  return "$" + (n / 1e6).toFixed(2)  + "M";
  if (a >= 1e3)  return "$" + (n / 1e3).toFixed(1)  + "K";
  return "$" + Number(n).toFixed(d);
}
function _tdGetKey() {
  return (window._KEYS?.twelvedata)
      || localStorage.getItem("finterm_key_twelvedata")
      || "";
}
function _tdInc() {
  const n = parseInt(sessionStorage.getItem(TD_SESSION) || "0") + 1;
  sessionStorage.setItem(TD_SESSION, n);
  if (typeof renderTopbarBadges === "function") renderTopbarBadges();
  return n;
}

/* ── Detect if ticker is an ETF / fund ──────────────────────────── */
function _isETFOrFund(sym) {
  /* nasdaqdir flag */
  if (typeof nasdaqIsETF === "function") {
    const flag = nasdaqIsETF(sym);
    if (flag === true) return true;
  }
  /* smartsearch type */
  if (typeof ss_currentType !== "undefined") {
    if (ss_currentType === "etf" || ss_currentType === "fund") return true;
  }
  /* FIGI security type */
  const figi = window._currentFIGI;
  if (figi?.securityType === "ETP" || figi?.securityType === "Mutual Fund") return true;
  return false;
}

/* ══════════════════════════════════════════════════════════════════
   CIK RESOLUTION  (shared by N-PORT and N-CEN)
   Re-implements the same lookup used in fmp.js / faLoadEdgarXBRL
   without depending on fmp.js being loaded.
   ══════════════════════════════════════════════════════════════════ */
const _CIK_CACHE = new Map();

async function _getCIK(sym) {
  const bare = sym.replace(/.*:/, "").toUpperCase();
  if (_CIK_CACHE.has(bare)) return _CIK_CACHE.get(bare);

  /* Use SEC company_tickers.json (same as fmp.js) */
  try {
    const res  = await fetch(`${EDGAR_BASE}/files/company_tickers.json`, {
      headers: { "User-Agent": EDGAR_UA },
      signal:  AbortSignal.timeout(10000),
    });
    const json = await res.json();
    for (const [, entry] of Object.entries(json)) {
      if ((entry.ticker || "").toUpperCase() === bare) {
        const cik = String(entry.cik_str).padStart(10, "0");
        _CIK_CACHE.set(bare, cik);
        return cik;
      }
    }
  } catch (e) {
    console.warn("[SECDERA] CIK lookup failed:", e.message);
  }

  /* Fallback: EDGAR full-text search */
  try {
    const url  = `https://efts.sec.gov/hits.esf?q=%22${encodeURIComponent(bare)}%22&forms=N-PORT&hits.hits.total=1`;
    const res  = await fetch(url, { headers: { "User-Agent": EDGAR_UA }, signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    const hit  = json?.hits?.hits?.[0];
    const cik  = hit?._id?.split(":")[0];
    if (cik) {
      const padded = cik.padStart(10, "0");
      _CIK_CACHE.set(bare, padded);
      return padded;
    }
  } catch {}

  return null;
}

/* ── Get submissions JSON → find latest filing of a form type ───── */
async function _getLatestFiling(cik, formType) {
  const cacheKey = `dera_sub_${cik}_${formType}`;
  const cached   = _cacheGet(cacheKey, DERA_TTL);
  if (cached !== null) return cached;

  try {
    const res  = await fetch(`${EDGAR_BASE}/submissions/CIK${cik}.json`, {
      headers: { "User-Agent": EDGAR_UA },
      signal:  AbortSignal.timeout(10000),
    });
    const json = await res.json();

    /* submissions.filings.recent has parallel arrays */
    const filings = json?.filings?.recent;
    if (!filings) return null;

    const forms      = filings.form        || [];
    const accessions = filings.accessionNumber || [];
    const dates      = filings.filingDate  || [];

    /* Find the most recent matching form */
    for (let i = 0; i < forms.length; i++) {
      if (forms[i] === formType) {
        const result = {
          accession: accessions[i]?.replace(/-/g, "") || null,
          date:      dates[i] || null,
          cik,
        };
        _cacheSet(cacheKey, result);
        return result;
      }
    }
    _cacheSet(cacheKey, null);
    return null;
  } catch (e) {
    console.warn("[SECDERA] submissions fetch failed:", cik, e.message);
    return null;
  }
}

/* ── Fetch filing index → find primary XML document ─────────────── */
async function _getFilingXML(cik, accession, preferredXmlType) {
  if (!cik || !accession) return null;
  const acc  = accession.replace(/-/g, "");
  const path = `${EDGAR_BASE}/Archives/edgar/data/${parseInt(cik)}/${acc}/${acc}-index.json`;

  try {
    const res  = await fetch(path, {
      headers: { "User-Agent": EDGAR_UA },
      signal:  AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const files = json?.directory?.item || [];

    /* Find the primary XML / primary document for this form */
    const xmlFile = files.find(f =>
      (f.type === preferredXmlType || f.name?.endsWith(".xml"))
      && !f.name?.toLowerCase().includes("def")
    ) || files.find(f => f.name?.endsWith(".xml"))
      || null;

    if (!xmlFile) return null;

    const xmlPath = `${EDGAR_BASE}/Archives/edgar/data/${parseInt(cik)}/${acc}/${xmlFile.name}`;
    const xmlRes  = await fetch(xmlPath, {
      headers: { "User-Agent": EDGAR_UA },
      signal:  AbortSignal.timeout(15000),
    });
    if (!xmlRes.ok) return null;
    return xmlRes.text();
  } catch (e) {
    console.warn("[SECDERA] XML fetch failed:", e.message);
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════════
   4.3  N-PORT — PARSE HOLDINGS FROM XML
   ══════════════════════════════════════════════════════════════════ */

/**
 * Parse N-PORT XML into a holdings array.
 * N-PORT XML schema: invstOrSec elements under invstOrSecs.
 * Key fields per holding:
 *   name, lei, cusip, isin, balance, curCd,
 *   valUSD, pctVal, payoffProfile, assetCat, issuerCat
 */
function _parseNPORTxml(xmlText) {
  if (!xmlText) return [];
  try {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(xmlText, "text/xml");

    /* N-PORT uses namespaced elements — query both with and without ns */
    const getText = (el, tag) => {
      let node = el.getElementsByTagName(tag)[0]
               || el.getElementsByTagNameNS("*", tag)[0];
      return node?.textContent?.trim() || null;
    };

    /* Total fund net assets (from genInfo) */
    const genInfo = doc.getElementsByTagName("genInfo")[0]
                 || doc.getElementsByTagNameNS("*", "genInfo")[0];
    const totalAssets = parseFloat(getText(genInfo, "netAssets") || "0") || null;

    /* Holdings */
    const holdings = [];
    const invstEls = doc.getElementsByTagName("invstOrSec");
    const secEls   = invstEls.length > 0 ? invstEls
                   : doc.getElementsByTagNameNS("*", "invstOrSec");

    for (const sec of Array.from(secEls).slice(0, 50)) {
      const name      = getText(sec, "name");
      const lei       = getText(sec, "lei");
      const cusip     = getText(sec, "cusip");
      const isin      = getText(sec, "isin");
      const valUSD    = parseFloat(getText(sec, "valUSD") || "0") || null;
      const pctVal    = parseFloat(getText(sec, "pctVal") || "0") || null;
      const assetCat  = getText(sec, "assetCat");
      const curCd     = getText(sec, "curCd");

      if (!name && !cusip && !isin) continue;
      holdings.push({ name, lei, cusip, isin, valUSD, pctVal, assetCat, curCd });
    }

    /* Sort by pctVal descending */
    holdings.sort((a, b) => (b.pctVal || 0) - (a.pctVal || 0));
    return { holdings, totalAssets };
  } catch (e) {
    console.warn("[SECDERA] N-PORT XML parse error:", e.message);
    return { holdings: [], totalAssets: null };
  }
}

/* ── Render N-PORT section into #fund-hold ──────────────────────── */
function _renderNPORTSection(sym, parsed, filingDate) {
  const holdPane = document.getElementById("fund-hold");
  if (!holdPane) return;
  holdPane.querySelector(".nport-section")?.remove();

  const { holdings, totalAssets } = parsed;
  if (!holdings?.length) return;

  const section = document.createElement("div");
  section.className = "nport-section";

  const rows = holdings.slice(0, 25).map(h => {
    const pct = h.pctVal != null ? h.pctVal.toFixed(2) + "%" : "—";
    const val = h.valUSD != null ? _fmt(h.valUSD, 0) : "—";
    const id  = h.isin || h.cusip || h.lei || "—";
    const cat = h.assetCat || h.curCd || "—";
    return `<tr>
      <td class="nport-name" title="${_esc(h.name || "")}">${_esc((h.name || "—").slice(0, 30))}</td>
      <td class="nport-id">${_esc(id)}</td>
      <td class="nport-pct">${_esc(pct)}</td>
      <td class="nport-val">${_esc(val)}</td>
      <td class="nport-cat">${_esc(cat)}</td>
    </tr>`;
  }).join("");

  section.innerHTML = `
    <div class="section-head nport-head" style="margin-top:14px">
      Regulatory Holdings (SEC N-PORT)
      <span class="nport-src-badge">SEC EDGAR · No key</span>
    </div>
    <div class="nport-meta">
      Filed: ${_esc(filingDate || "—")}
      ${totalAssets ? ` · Total Net Assets: ${_fmt(totalAssets, 0)}` : ""}
      · Showing top ${Math.min(holdings.length, 25)} of ${holdings.length} holdings
    </div>
    <div class="fin-table-wrap nport-table-wrap">
      <table class="fin-table nport-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>ISIN / CUSIP</th>
            <th>% Port.</th>
            <th>Value (USD)</th>
            <th>Asset Cat.</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="nport-footer">
      Source: SEC Form N-PORT · EDGAR public filing ·
      <a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=N-PORT&dateb=&owner=include&count=40"
         target="_blank" rel="noopener" class="nport-link">SEC EDGAR N-PORT ↗</a>
    </div>`;

  holdPane.appendChild(section);
}

/* ── Main N-PORT entry ──────────────────────────────────────────── */
async function nportLoadForTicker(ticker) {
  const sym  = ticker.replace(/.*:/, "").toUpperCase();
  if (!_isETFOrFund(sym)) return;

  const cacheKey = `nport_${sym}`;
  const cached   = _cacheGet(cacheKey, DERA_TTL);

  let result;
  if (cached !== null) {
    result = cached;
  } else {
    const cik = await _getCIK(sym);
    if (!cik) return;

    const filing = await _getLatestFiling(cik, "N-PORT");
    if (!filing) return;

    const xml    = await _getFilingXML(cik, filing.accession, "primary_doc");
    const parsed = _parseNPORTxml(xml);
    result       = { parsed, date: filing.date };
    _cacheSet(cacheKey, result);
  }

  if (result?.parsed?.holdings?.length) {
    _renderNPORTSection(sym, result.parsed, result.date);
  }
}

/* ══════════════════════════════════════════════════════════════════
   4.4  N-CEN — FUND CENSUS METADATA
   ══════════════════════════════════════════════════════════════════ */

/**
 * Parse N-CEN XML for key fund metadata fields.
 * N-CEN covers: fund type, fiscal year end, exchange, AUM.
 */
function _parseNCENxml(xmlText) {
  if (!xmlText) return null;
  try {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(xmlText, "text/xml");
    const getText = (tag) => {
      const node = doc.getElementsByTagName(tag)[0]
                || doc.getElementsByTagNameNS("*", tag)[0];
      return node?.textContent?.trim() || null;
    };

    return {
      seriesName:     getText("seriesName")     || getText("registrantName") || null,
      fundType:       getText("fundType")        || getText("cik")            || null,
      fiscalYearEnd:  getText("fiscYrEnd")       || getText("fiscalYearEnd")  || null,
      exchangeMIC:    getText("exchgCd")         || getText("exchangeCode")   || null,
      netAssets:      parseFloat(getText("netAssets") || "0") || null,
      numSeries:      getText("numSeries")       || null,
      isEtf:          getText("isEtf") === "Y"   || null,
      lei:            getText("lei")             || null,
    };
  } catch (e) {
    console.warn("[SECDERA] N-CEN parse error:", e.message);
    return null;
  }
}

/* ── Render N-CEN block in #fund-des ─────────────────────────────── */
function _renderNCENBlock(sym, meta, filingDate) {
  const des = document.getElementById("fund-des");
  if (!des || !meta) return;
  des.querySelector(".ncen-block")?.remove();

  const block = document.createElement("div");
  block.className = "ncen-block";

  const rows = [
    ["Series Name",    meta.seriesName],
    ["Fund Type",      meta.fundType],
    ["Is ETF",         meta.isEtf ? "Yes" : null],
    ["Exchange (MIC)", meta.exchangeMIC],
    ["Fiscal Year End",meta.fiscalYearEnd],
    ["Total Net Assets", meta.netAssets ? _fmt(meta.netAssets, 0) : null],
    ["# Series",       meta.numSeries],
    ["LEI (fund)",     meta.lei],
    ["Filed",          filingDate],
  ].filter(([, v]) => v);

  block.innerHTML = `
    <div class="section-head ncen-head">
      ETF / Fund Metadata (N-CEN)
      <span class="ncen-src-badge">SEC EDGAR · No key</span>
    </div>
    <div class="ncen-grid">
      ${rows.map(([lbl, val]) => `
        <div class="ncen-row">
          <span class="ncen-label">${_esc(lbl)}</span>
          <span class="ncen-value">${_esc(String(val))}</span>
        </div>`).join("")}
    </div>
    <div class="ncen-links">
      <a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=N-CEN&dateb=&owner=include&count=10"
         target="_blank" rel="noopener" class="ncen-link">↗ SEC N-CEN filings</a>
    </div>`;

  /* Insert near the bottom of DES, after existing identity blocks */
  const existing = des.querySelector(".firds-block") || des.querySelector(".ch-registry-block")
                 || des.querySelector(".gleif-identity-block") || des.querySelector(".of-identifiers-block");
  if (existing) existing.insertAdjacentElement("afterend", block);
  else des.appendChild(block);
}

/* ── Main N-CEN entry ───────────────────────────────────────────── */
async function ncenLoadForTicker(ticker) {
  const sym = ticker.replace(/.*:/, "").toUpperCase();
  if (!_isETFOrFund(sym)) return;

  const cacheKey = `ncen_${sym}`;
  const cached   = _cacheGet(cacheKey, DERA_TTL);

  let result;
  if (cached !== null) {
    result = cached;
  } else {
    const cik = await _getCIK(sym);
    if (!cik) return;

    const filing = await _getLatestFiling(cik, "N-CEN");
    if (!filing) return;

    const xml  = await _getFilingXML(cik, filing.accession, "primary_doc");
    const meta = _parseNCENxml(xml);
    result     = { meta, date: filing.date };
    _cacheSet(cacheKey, result);
  }

  if (result?.meta) {
    _renderNCENBlock(sym, result.meta, result.date);
  }
}

/* ══════════════════════════════════════════════════════════════════
   4.5  TWELVE DATA — Dividends + Splits fallback for #fund-div
   ══════════════════════════════════════════════════════════════════ */

async function _tdFetch(endpoint, params) {
  const key = _tdGetKey();
  if (!key) return null;

  const cacheKey = `td_${endpoint}_${JSON.stringify(params)}`;
  const cached   = _cacheGet(cacheKey, TD_TTL);
  if (cached !== null) return cached;

  const url = new URL(`${TD_BASE}/${endpoint}`);
  Object.entries({ ...params, apikey: key }).forEach(([k, v]) => url.searchParams.set(k, v));

  try {
    const res  = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.status === "error") throw new Error(json.message);
    _tdInc();
    _cacheSet(cacheKey, json);
    return json;
  } catch (e) {
    console.warn("[TwelveData]", endpoint, e.message);
    return null;
  }
}

async function tdEnrichDividends(sym) {
  const el = document.getElementById("fund-div");
  if (!el || !_tdGetKey()) return;
  /* Only run if FMP returned no data */
  if (el.innerHTML.includes("av-live-badge") || el.innerHTML.includes("div-summary-bar")) return;

  const [divData, splitData] = await Promise.allSettled([
    _tdFetch("dividends", { symbol: sym, outputsize: 30, format: "JSON" }),
    _tdFetch("splits",    { symbol: sym, outputsize: 20, format: "JSON" }),
  ]);

  const divs   = divData.status === "fulfilled"   ? divData.value?.dividends   || [] : [];
  const splits = splitData.status === "fulfilled" ? splitData.value?.splits     || [] : [];

  if (!divs.length && !splits.length) return;

  const el2 = document.getElementById("fund-div");
  if (!el2) return;
  el2.querySelector(".td-fallback-section")?.remove();

  const section = document.createElement("div");
  section.className = "td-fallback-section";

  let html = `
    <div class="av-live-badge td-fallback-badge">
      ● Dividends & Splits · Twelve Data (fallback)
      <span class="td-note-badge">Internal non-display terms</span>
    </div>`;

  if (divs.length) {
    html += `<div class="section-head" style="margin-top:8px">Dividends (Twelve Data)</div>
      <div class="fin-table-wrap">
        <table class="fin-table">
          <thead><tr><th>Ex-Date</th><th>Amount</th></tr></thead>
          <tbody>
            ${divs.slice(0, 20).map(d => `<tr>
              <td>${_esc(d.ex_date || d.date || "—")}</td>
              <td style="color:var(--accent);font-weight:600">
                ${d.amount != null ? "$" + parseFloat(d.amount).toFixed(4) : "—"}
              </td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }

  if (splits.length) {
    html += `<div class="section-head" style="margin-top:10px">Splits (Twelve Data)</div>
      <div class="fin-table-wrap">
        <table class="fin-table">
          <thead><tr><th>Date</th><th>Ratio</th></tr></thead>
          <tbody>
            ${splits.slice(0, 10).map(s => `<tr>
              <td>${_esc(s.date || "—")}</td>
              <td style="color:var(--accent);font-weight:600">
                ${_esc(s.to_factor ? `${s.to_factor}:${s.from_factor || 1}` : s.ratio || "—")}
              </td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }

  section.innerHTML = html;
  el2.appendChild(section);
}

/* ══════════════════════════════════════════════════════════════════
   HOOKS — trigger on ETF/fund ticker change
   ══════════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {

  /* Listen for FIGI-ready: by then ss_currentType may be populated */
  window.addEventListener("finterm:figi-ready", async e => {
    const t = e.detail?.ticker;
    if (!t) return;
    /* Wait for smartsearch.js to run ssAnalyzeTicker */
    await new Promise(r => setTimeout(r, 2500));
    const sym = t.replace(/.*:/, "").toUpperCase();
    if (!_isETFOrFund(sym)) return;
    /* Run N-PORT and N-CEN in parallel; wait before N-PORT since fund-hold may not exist yet */
    setTimeout(() => nportLoadForTicker(t), 3000);
    setTimeout(() => ncenLoadForTicker(t),  1500);
  });

  /* Twelve Data fallback: fires after DIV tab content settles */
  window.addEventListener("finterm:figi-ready", e => {
    const t = e.detail?.ticker;
    if (t) {
      setTimeout(() => {
        const sym = t.replace(/.*:/, "").toUpperCase();
        tdEnrichDividends(sym);
      }, 4000);
    }
  });

  /* Patch changeTicker for cleanup */
  const _origCT = typeof changeTicker === "function" ? changeTicker : null;
  if (_origCT) {
    window.changeTicker = function () {
      _origCT.apply(this, arguments);
      /* Clean stale DERA sections on ticker change */
      document.getElementById("fund-hold")?.querySelector(".nport-section")?.remove();
      document.getElementById("fund-des")?.querySelector(".ncen-block")?.remove();
      document.getElementById("fund-div")?.querySelector(".td-fallback-section")?.remove();
    };
  }

  /* Register KNOWN_PROVIDERS entries */
  if (Array.isArray(window.KNOWN_PROVIDERS)) {
    if (!window.KNOWN_PROVIDERS.find(p => p.id === "secdera")) {
      window.KNOWN_PROVIDERS.push({
        id:         "secdera",
        name:       "SEC DERA (N-PORT / N-CEN)",
        badge:      "DERA",
        group:      "Identity & Reference",
        desc:       "SEC regulatory fund data: N-PORT monthly portfolio holdings (top-25 securities with value and %) and N-CEN annual fund census (AUM, fund type, exchange, fiscal year end). Auto-triggers for ETF/fund tickers. No API key required.",
        limit:      "Unlimited (no API key required — SEC fair access: 10 req/sec)",
        docsUrl:    "https://www.sec.gov/data-research/sec-markets-data/form-n-port-data-sets",
        sessionKey: "secdera_call_count",
        limitWarn:  null,
        limitMax:   null,
      });
    }
    if (!window.KNOWN_PROVIDERS.find(p => p.id === "twelvedata")) {
      window.KNOWN_PROVIDERS.push({
        id:         "twelvedata",
        name:       "Twelve Data",
        badge:      "12D",
        group:      "Market Data",
        desc:       "Dividends and splits fallback source for Fundamentals → DIV tab when FMP returns no data. Free tier: 800 calls/day. ⚠ Free tier is for internal non-display use only — review licensing before public deployment.",
        limit:      "800 calls/day (free) · Internal non-display",
        docsUrl:    "https://twelvedata.com/pricing",
        sessionKey: TD_SESSION,
        limitWarn:  700,
        limitMax:   800,
      });
    }
    if (typeof renderTopbarBadges === "function") renderTopbarBadges();
  }

  /* saveKey triggers */
  const _origSave = typeof saveKey === "function" ? saveKey : null;
  if (_origSave) {
    window.saveKey = function (id) {
      _origSave.apply(this, arguments);
      if (id === "twelvedata") {
        const sym = (typeof currentTicker !== "undefined")
          ? currentTicker.replace(/.*:/, "").toUpperCase() : null;
        if (sym) setTimeout(() => tdEnrichDividends(sym), 400);
      }
    };
  }
});

/* ── Public exports ─────────────────────────────────────────────── */
window.nportLoadForTicker = nportLoadForTicker;
window.ncenLoadForTicker  = ncenLoadForTicker;
window.tdEnrichDividends  = tdEnrichDividends;

})();
