/* ══════════════════════════════════════════════════════════════════
   FINTERM — openfigi.js  (Phase 1 · Identity Infrastructure)
   OpenFIGI Identifier Normalization
   ──────────────────────────────────────────────────────────────────
   What it does:
     • Maps ticker / ISIN / CUSIP → FIGI (Financial Instrument
       Global Identifier) on every ticker change.
     • Stores FIGI metadata in window._currentFIGI for use by
       gleif.js, nasdaqdir.js, and any future module.
     • Injects an "Identifiers" block at the bottom of #fund-des
       showing: FIGI, shareClassFIGI, compositeFIGI, exchange MIC,
       security type, and market sector.

   Access:   No API key (lower rate limit) or free key (higher limit)
   Endpoint: https://api.openfigi.com/v3/mapping
   Rate:     no-key 25 req/min · free-key 250 req/min
   Cache:    24 h per ticker (FIGIs are stable; only change on
             corporate actions)
   ══════════════════════════════════════════════════════════════════ */

(function () {
"use strict";

/* ── Constants ──────────────────────────────────────────────────── */
const OF_BASE        = "https://api.openfigi.com/v3/mapping";
const OF_SESSION_KEY = "openfigi_call_count";
const OF_TTL         = 24 * 60 * 60 * 1000; // 24 h

/* ── In-memory cache: ticker → FIGI result ──────────────────────── */
const _OF_CACHE = {};

/* ── Global state — accessible by other modules ─────────────────── */
window._currentFIGI = null;  // populated on every ticker change

/* ── Helpers ────────────────────────────────────────────────────── */
function _ofGetKey() {
  return (window._KEYS && window._KEYS["openfigi"])
      || localStorage.getItem("finterm_key_openfigi")
      || "";
}

function _ofInc() {
  const n = parseInt(sessionStorage.getItem(OF_SESSION_KEY) || "0") + 1;
  sessionStorage.setItem(OF_SESSION_KEY, n);
  if (typeof renderTopbarBadges === "function") renderTopbarBadges();
  return n;
}

function _ofEsc(s) {
  return String(s ?? "").replace(/[<>&"]/g, c =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
}

/* ── Check session cache ────────────────────────────────────────── */
function _ofCacheGet(key) {
  const e = _OF_CACHE[key];
  return (e && Date.now() - e.ts < OF_TTL) ? e.data : null;
}
function _ofCacheSet(key, data) { _OF_CACHE[key] = { data, ts: Date.now() }; }

/* ══════════════════════════════════════════════════════════════════
   CORE FETCH — POST to /v3/mapping
   Tries up to 3 jobs in priority order:
     1. TICKER + exchangeCode (most precise)
     2. TICKER only (exchange agnostic)
     3. ISIN if available from window._currentFIGI context
   ══════════════════════════════════════════════════════════════════ */
async function _ofFetch(jobs) {
  const key  = _ofGetKey();
  const hdrs = {
    "Content-Type": "application/json",
    ...(key ? { "X-OPENFIGI-APIKEY": key } : {}),
  };
  try {
    const res = await fetch(OF_BASE, {
      method:  "POST",
      headers: hdrs,
      body:    JSON.stringify(jobs),
      signal:  AbortSignal.timeout(8000),
    });
    if (res.status === 429) {
      console.warn("[OpenFIGI] Rate-limited. Add free API key in ⚙ Settings for higher limits.");
      return null;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _ofInc();
    return await res.json();
  } catch (e) {
    console.warn("[OpenFIGI] fetch failed:", e.message);
    return null;
  }
}

/* ── Resolve exchange code → FIGI exchange code ─────────────────── */
const EXCHANGE_TO_MIC = {
  NASDAQ: "US", NYSE: "US", AMEX: "US", BATS: "US",
  MIL: "IT", XETRA: "GR", EPA: "FP", AMS: "NA",
  LSE: "LN", BM: "SM", VIE: "AV", STO: "SS",
  TSX: "CN", HKG: "HK", TYO: "JT", KRX: "KS",
  ASX: "AU", BSE: "IB", NSE: "IB", SGX: "SP",
  BITSTAMP: null,  // crypto — skip exchange filter
};

/* ══════════════════════════════════════════════════════════════════
   PUBLIC API
   ══════════════════════════════════════════════════════════════════ */

/**
 * figiGetForTicker(ticker)
 *   ticker can be bare (AAPL) or exchange-prefixed (MIL:ENI)
 *   Returns a FIGI result object or null.
 *   Result shape:
 *   {
 *     figi, compositeFigi, shareClassFigi,
 *     name, ticker, exchCode, marketSector,
 *     securityType, securityType2, securityDescription
 *   }
 */
window.figiGetForTicker = async function figiGetForTicker(ticker) {
  if (!ticker) return null;

  const raw  = ticker.trim().toUpperCase();
  const sym  = raw.replace(/.*:/, "");
  const exch = raw.includes(":") ? raw.split(":")[0] : null;
  const cacheKey = `figi_${raw}`;

  /* L1 memory cache */
  const cached = _ofCacheGet(cacheKey);
  if (cached) return cached;

  /* Build mapping jobs — most-specific first */
  const jobs = [];
  if (exch && EXCHANGE_TO_MIC[exch] !== null) {
    jobs.push({ idType: "TICKER", idValue: sym, exchCode: EXCHANGE_TO_MIC[exch] || exch });
  }
  jobs.push({ idType: "TICKER", idValue: sym });

  const raw_resp = await _ofFetch(jobs);
  if (!raw_resp) return null;

  /* Walk results: take first data entry that has a FIGI */
  let best = null;
  for (const resp of raw_resp) {
    if (resp.error) continue;
    const d = resp.data;
    if (!Array.isArray(d) || !d.length) continue;
    /* Prefer an entry that matches the exchange or has securityType not 'Index' */
    const preferred = d.find(r =>
      r.figi && r.marketSector !== "Index" && r.securityType !== "ETP"
    ) || d.find(r => r.figi) || null;
    if (preferred) { best = preferred; break; }
  }

  if (!best || !best.figi) return null;

  const result = {
    figi:                best.figi                || null,
    compositeFigi:       best.compositeFigi        || null,
    shareClassFigi:      best.shareClassFigi       || null,
    name:                best.name                 || null,
    ticker:              best.ticker               || sym,
    exchCode:            best.exchCode             || null,
    marketSector:        best.marketSector         || null,
    securityType:        best.securityType         || null,
    securityType2:       best.securityType2        || null,
    securityDescription: best.securityDescription  || null,
  };

  _ofCacheSet(cacheKey, result);
  return result;
};

/* ══════════════════════════════════════════════════════════════════
   RENDER — Identifiers block injected into #fund-des
   Appended non-destructively after avRenderOverview populates DES.
   Uses a sentinel div.of-identifiers-block to avoid duplicates.
   ══════════════════════════════════════════════════════════════════ */
function _ofRenderBlock(sym, data) {
  const des = document.getElementById("fund-des");
  if (!des) return;

  /* Remove previous block if it exists */
  des.querySelector(".of-identifiers-block")?.remove();

  if (!data) return;  /* no FIGI found — block stays absent */

  const block = document.createElement("div");
  block.className = "of-identifiers-block";

  const rows = [
    ["FIGI",             data.figi],
    ["Composite FIGI",   data.compositeFigi],
    ["Share-Class FIGI", data.shareClassFigi],
    ["Security Type",    [data.securityType, data.securityType2].filter(Boolean).join(" · ") || null],
    ["Market Sector",    data.marketSector],
    ["Exch Code (FIGI)", data.exchCode],
    ["Description",      data.securityDescription],
  ].filter(([, v]) => v);

  block.innerHTML = `
    <div class="section-head of-id-head">
      Identifiers <span class="of-id-src">OpenFIGI</span>
    </div>
    <div class="of-id-grid">
      ${rows.map(([lbl, val]) => `
        <div class="of-id-row">
          <span class="of-id-label">${_ofEsc(lbl)}</span>
          <span class="of-id-value">${_ofEsc(String(val))}</span>
        </div>`).join("")}
    </div>
    <div class="of-id-links">
      <a href="https://www.openfigi.com/search#!?query=${_ofEsc(sym)}"
         target="_blank" rel="noopener" class="of-id-link">↗ Search OpenFIGI</a>
      ${data.figi ? `<a href="https://www.openfigi.com/id/${_ofEsc(data.figi)}"
         target="_blank" rel="noopener" class="of-id-link">↗ FIGI detail</a>` : ""}
    </div>`;

  /* Append to DES — after everything else */
  des.appendChild(block);
}

/* ══════════════════════════════════════════════════════════════════
   MAIN ENTRY — called on every ticker change
   ══════════════════════════════════════════════════════════════════ */
window.openfigiLoadForTicker = async function openfigiLoadForTicker(ticker) {
  if (!ticker) return;
  window._currentFIGI = null;

  /* Small delay — let avRenderOverview paint DES first */
  await new Promise(r => setTimeout(r, 1200));

  const data = await figiGetForTicker(ticker);
  window._currentFIGI = data;

  /* Inject identifiers block */
  _ofRenderBlock(ticker.replace(/.*:/, "").toUpperCase(), data);

  /* Notify other modules (GLEIF, Nasdaq Dir) */
  window.dispatchEvent(new CustomEvent("finterm:figi-ready", { detail: { ticker, figi: data } }));
};

/* ══════════════════════════════════════════════════════════════════
   HOOK — patch changeTicker (same pattern as smartsearch.js)
   ══════════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  const _origCT = typeof changeTicker === "function" ? changeTicker : null;
  if (_origCT) {
    window.changeTicker = function () {
      _origCT.apply(this, arguments);
      const raw = document.getElementById("tickerInput")?.value.trim();
      if (raw) openfigiLoadForTicker(raw);
    };
  }

  /* Register in KNOWN_PROVIDERS if config.js is loaded */
  if (Array.isArray(window.KNOWN_PROVIDERS)) {
    if (!window.KNOWN_PROVIDERS.find(p => p.id === "openfigi")) {
      window.KNOWN_PROVIDERS.push({
        id:         "openfigi",
        name:       "OpenFIGI (Bloomberg)",
        badge:      "FIGI",
        group:      "Identity & Reference",
        desc:       "FIGI identifier mapping — links ticker/ISIN/CUSIP to a stable Financial Instrument Global Identifier. Shown in Fundamentals → DES Identifiers block. Used by GLEIF and Nasdaq Directory modules for cross-source linking.",
        limit:      "25 req/min (no key) · 250 req/min (free key)",
        docsUrl:    "https://www.openfigi.com/api",
        sessionKey: OF_SESSION_KEY,
        limitWarn:  null,
        limitMax:   null,
      });
    }
    if (typeof renderTopbarBadges === "function") renderTopbarBadges();
  }

  /* Auto-trigger saveKey reload */
  const _origSave = typeof saveKey === "function" ? saveKey : null;
  if (_origSave) {
    window.saveKey = function (id) {
      _origSave.apply(this, arguments);
      if (id === "openfigi") {
        const t = typeof currentTicker !== "undefined" ? currentTicker : null;
        if (t) setTimeout(() => openfigiLoadForTicker(t), 300);
      }
    };
  }

  /* Run on initial ticker */
  setTimeout(() => {
    const t = typeof currentTicker !== "undefined" ? currentTicker : "AAPL";
    openfigiLoadForTicker(t);
  }, 2500);
});

})();
