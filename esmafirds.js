/* ══════════════════════════════════════════════════════════════════
   FINTERM — esmafirds.js  (Phase 4 · Reference Data)
   ESMA FIRDS — EU Financial Instrument Reference Data System
   ──────────────────────────────────────────────────────────────────
   What it does:
     Fetches official EU instrument reference data for EU-listed
     securities from the ESMA FIRDS Solr search endpoint.
     No API key required — open EU regulatory data.

   Trigger:
     Fires when currentTicker has an EU exchange prefix:
     MIL, XETRA, EPA (Euronext Paris), EURONEXT, AMS, BME,
     VIE, STO, OSL, HEL, WSE, BUD, PRG, ATH, IST, or when
     GLEIF identifies a non-UK European jurisdiction,
     or when an ISIN from EODHD starts with a EU country code.

   ISIN resolution cascade:
     1. eodhdLiveCache[sym].fund.isin  (best — EODHD provides ISIN)
     2. window._currentLEI mapped identifiers (GLEIF)
     3. FIRDS keyword search by company name (fallback)

   Populates:
     #fund-des → "EU Instrument Reference (FIRDS)" block showing:
       ISIN, CFI code, instrument full name, trading venue (MIC),
       instrument classification, admission-to-trading date,
       notional currency, and links to ESMA registers.

   Access:   No API key · EU open regulatory data
   Endpoint: https://registers.esma.europa.eu/publication/
             searchRegister?core=esma_registers_firds_db
   Cache:    24 h (instrument reference data is stable)
   ══════════════════════════════════════════════════════════════════ */

(function () {
"use strict";

/* ── Constants ──────────────────────────────────────────────────── */
const FIRDS_SEARCH = "https://registers.esma.europa.eu/publication/searchRegister";
const FIRDS_TTL    = 24 * 60 * 60 * 1000;  // 24 h
const SESSION_KEY  = "esmafirds_call_count";

/* EU exchange prefixes that trigger FIRDS lookup */
const EU_EXCHANGES = new Set([
  "MIL", "XETRA", "EPA", "EURONEXT", "AMS", "BME",
  "VIE", "STO", "OSL", "HEL", "WSE", "BUD", "PRG",
  "ATH", "IST", "LIS", "CPH",
]);

/* EU ISIN country prefixes (ISO 3166-1 alpha-2) */
const EU_ISIN_PREFIXES = new Set([
  "AT","BE","BG","CY","CZ","DE","DK","EE","ES","FI",
  "FR","GR","HR","HU","IE","IT","LT","LU","LV","MT",
  "NL","PL","PT","RO","SE","SI","SK","NO","IS","LI",
]);

/* ── Cache ──────────────────────────────────────────────────────── */
const _CACHE = {};
function _cacheGet(k) {
  const e = _CACHE[k];
  return (e && Date.now() - e.ts < FIRDS_TTL) ? e.data : null;
}
function _cacheSet(k, d) { _CACHE[k] = { data: d, ts: Date.now() }; }

/* ── Helpers ────────────────────────────────────────────────────── */
function _esc(s) {
  return String(s ?? "").replace(/[<>&"]/g, c =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
}
function _inc() {
  const n = parseInt(sessionStorage.getItem(SESSION_KEY) || "0") + 1;
  sessionStorage.setItem(SESSION_KEY, n);
  if (typeof renderTopbarBadges === "function") renderTopbarBadges();
  return n;
}

/* ── Detect EU ticker ───────────────────────────────────────────── */
function _isEUTicker(ticker) {
  if (!ticker) return false;
  const raw  = ticker.trim().toUpperCase();
  const exch = raw.includes(":") ? raw.split(":")[0] : null;
  if (exch && EU_EXCHANGES.has(exch)) return true;

  /* GLEIF jurisdiction — non-UK European */
  const lei = window._currentLEI;
  if (lei?.jurisdiction) {
    const j = lei.jurisdiction.toUpperCase();
    /* EU country codes (2-letter) excluding GB */
    if (j.length === 2 && j !== "GB" && EU_ISIN_PREFIXES.has(j)) return true;
  }

  /* EODHD ISIN starts with EU country code */
  const sym = raw.replace(/.*:/, "");
  if (typeof eodhdLiveCache !== "undefined" && eodhdLiveCache[sym]?.fund?.isin) {
    const isin = eodhdLiveCache[sym].fund.isin;
    if (EU_ISIN_PREFIXES.has(isin.slice(0, 2))) return true;
  }

  /* exchangeDB lookup */
  if (typeof exchangeDB !== "undefined") {
    const e2 = exchangeDB[sym];
    if (e2 && EU_EXCHANGES.has(e2)) return true;
  }

  return false;
}

/* ── Get best available ISIN ────────────────────────────────────── */
function _resolveISIN(sym) {
  /* 1. EODHD live cache */
  if (typeof eodhdLiveCache !== "undefined") {
    const ed = eodhdLiveCache[sym.replace(/.*:/, "").toUpperCase()];
    if (ed?.fund?.isin && ed.fund.isin.length >= 12) return ed.fund.isin;
  }
  /* 2. GLEIF mapped identifiers (gleif.js stores in window._currentLEI) */
  const lei = window._currentLEI;
  if (lei?.mappedIsin) return lei.mappedIsin;
  return null;
}

/* ── Get company name for fallback search ───────────────────────── */
function _resolveCompanyName(sym) {
  const bare = sym.replace(/.*:/, "").toUpperCase();
  if (typeof avGetLive === "function") {
    const av = avGetLive(bare);
    if (av?.overview?.name) return av.overview.name;
  }
  if (typeof eodhdLiveCache !== "undefined" && eodhdLiveCache[bare]?.fund?.name) {
    return eodhdLiveCache[bare].fund.name;
  }
  if (window._currentLEI?.legalName) return window._currentLEI.legalName;
  if (typeof nasdaqDirLookup === "function") {
    return nasdaqDirLookup(bare)?.name || null;
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════
   FIRDS SEARCH — returns array of instrument records
   ══════════════════════════════════════════════════════════════════ */
async function _firdsSearch(query, isISIN = false) {
  const cacheKey = `firds_${query}`;
  const cached   = _cacheGet(cacheKey);
  if (cached !== null) return cached;

  const params = new URLSearchParams({
    core:   "esma_registers_firds_db",
    rows:   "5",
    wt:     "json",
    start:  "0",
  });

  if (isISIN) {
    /* Exact ISIN match */
    params.set("q", `isin:${query}`);
  } else {
    /* Full-text name search — escape special chars */
    const safe = query.replace(/[+\-&|!(){}\[\]^"~*?:\\/]/g, " ").trim().slice(0, 50);
    params.set("q", `cf_instumentfullname:"${safe}" OR cf_instumentfullname:${safe.split(" ")[0]}`);
    params.set("fq", ""); /* no filter */
  }

  const url = `${FIRDS_SEARCH}?${params}`;

  try {
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal:  AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    _inc();
    const docs = json?.response?.docs || [];
    _cacheSet(cacheKey, docs);
    return docs;
  } catch (e) {
    console.warn("[FIRDS]", e.message);
    _cacheSet(cacheKey, []);
    return [];
  }
}

/* ── Normalise FIRDS Solr doc into usable fields ─────────────────── */
function _normalise(doc) {
  if (!doc) return null;
  return {
    isin:         doc.isin                      || null,
    cfi:          doc.cfi                       || null,
    fullName:     doc.cf_instumentfullname      || doc.instfullname || null,
    shortName:    doc.cf_instrshrtname          || null,
    mic:          doc.trdngvn_mic               || doc.tradingVenueMic || null,
    currency:     doc.ntlccy                    || doc.notionalCurrency || null,
    admitDate:    doc.admissntrdng              || doc.admissionToTradingDate || null,
    instrType:    doc.cf_instrclssfctn          || null,
    underlying:   doc.undrlyinstrm              || null,
    issuerLei:    doc.issr_lei                  || null,
    issuerName:   doc.issr_nm                   || null,
    terminDate:   doc.termintn_dt               || null,
    rawMic:       doc.trdngvn_mic               || null,
  };
}

/* CFI code → human readable category */
const CFI_CATEGORIES = {
  E: "Equity",
  D: "Debt",
  C: "Collective Investment Scheme",
  R: "Rights",
  O: "Options",
  F: "Futures",
  S: "Swaps",
  H: "Non-Listed / Complex",
  I: "Indices",
  M: "Others",
};
function _cfiLabel(cfi) {
  if (!cfi) return null;
  return CFI_CATEGORIES[cfi[0]] || cfi[0];
}

/* ══════════════════════════════════════════════════════════════════
   RENDER — #fund-des "EU Instrument Reference (FIRDS)" block
   ══════════════════════════════════════════════════════════════════ */
function _renderDesBlock(rec) {
  const des = document.getElementById("fund-des");
  if (!des) return;
  des.querySelector(".firds-block")?.remove();
  if (!rec) return;

  const block = document.createElement("div");
  block.className = "firds-block";

  const rows = [
    ["ISIN",            rec.isin],
    ["Full Name",       rec.fullName],
    ["Short Name",      rec.shortName],
    ["CFI Code",        rec.cfi ? `${rec.cfi}${rec.cfi[0] ? ` — ${_cfiLabel(rec.cfi)}` : ""}` : null],
    ["Instrument Type", rec.instrType],
    ["Trading Venue",   rec.mic],
    ["Notional Ccy",    rec.currency],
    ["Admitted",        rec.admitDate ? rec.admitDate.slice(0, 10) : null],
    ["Issuer",          rec.issuerName],
    ["Issuer LEI",      rec.issuerLei],
    ["Terminated",      rec.terminDate ? rec.terminDate.slice(0, 10) : null],
  ].filter(([, v]) => v);

  block.innerHTML = `
    <div class="section-head firds-head">
      EU Instrument Reference (FIRDS)
      <span class="firds-src-badge">ESMA · No key</span>
    </div>
    <div class="firds-grid">
      ${rows.map(([lbl, val]) => `
        <div class="firds-row">
          <span class="firds-label">${_esc(lbl)}</span>
          <span class="firds-value ${lbl === "ISIN" ? "firds-isin" : ""}">${_esc(String(val))}</span>
        </div>`).join("")}
    </div>
    <div class="firds-links">
      ${rec.isin
        ? `<a href="https://registers.esma.europa.eu/publication/searchRegister?core=esma_registers_firds_db&q=isin:${_esc(rec.isin)}"
               target="_blank" rel="noopener" class="firds-link">↗ FIRDS record</a>`
        : ""}
      <a href="https://www.esma.europa.eu/databases-library/registers-and-data/registers/financial-instruments-reference-data"
         target="_blank" rel="noopener" class="firds-link">↗ ESMA FIRDS</a>
    </div>`;

  /* Insert after ch-registry-block if present, else after gleif, else append */
  const chBlock    = des.querySelector(".ch-registry-block");
  const gleifBlock = des.querySelector(".gleif-identity-block");
  const figiBlock  = des.querySelector(".of-identifiers-block");
  const anchor     = chBlock || gleifBlock || figiBlock;
  if (anchor) anchor.insertAdjacentElement("afterend", block);
  else des.appendChild(block);
}

/* ══════════════════════════════════════════════════════════════════
   MAIN ENTRY
   ══════════════════════════════════════════════════════════════════ */
window.firdsLoadForTicker = async function firdsLoadForTicker(ticker) {
  if (!ticker) return;

  /* Small delay — let eodhd and gleif populate first */
  await new Promise(r => setTimeout(r, 1800));

  if (!_isEUTicker(ticker)) return;

  const sym  = ticker.replace(/.*:/, "").toUpperCase();
  let   docs = [];

  /* Strategy A: ISIN lookup (most precise) */
  const isin = _resolveISIN(sym);
  if (isin) {
    docs = await _firdsSearch(isin, true);
  }

  /* Strategy B: name search fallback */
  if (!docs.length) {
    const name = _resolveCompanyName(sym);
    if (name) docs = await _firdsSearch(name, false);
  }

  if (!docs.length) {
    console.info("[FIRDS] No records found for", ticker);
    return;
  }

  /* Pick best record: prefer active (no termination date), equity first */
  const active = docs.filter(d => !d.termintn_dt);
  const best   = active.find(d => d.cfi?.startsWith("E"))
               || active[0]
               || docs[0];

  const rec = _normalise(best);
  _renderDesBlock(rec);

  /* Emit event so other modules can use ISIN */
  window.dispatchEvent(new CustomEvent("finterm:firds-ready", {
    detail: { ticker, isin: rec?.isin, firds: rec },
  }));
};

/* ══════════════════════════════════════════════════════════════════
   HOOKS
   ══════════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {

  /* Trigger after GLEIF resolves (has LEI + jurisdiction) */
  window.addEventListener("finterm:lei-ready", e => {
    const t = e.detail?.ticker;
    if (t) firdsLoadForTicker(t);
  });

  /* Fallback: direct changeTicker patch */
  const _origCT = typeof changeTicker === "function" ? changeTicker : null;
  if (_origCT) {
    window.changeTicker = function () {
      _origCT.apply(this, arguments);
      const raw = document.getElementById("tickerInput")?.value.trim();
      if (raw && typeof gleifLoadForTicker !== "function") {
        setTimeout(() => firdsLoadForTicker(raw), 2200);
      }
    };
  }

  /* Register in KNOWN_PROVIDERS */
  if (Array.isArray(window.KNOWN_PROVIDERS)) {
    if (!window.KNOWN_PROVIDERS.find(p => p.id === "esmafirds")) {
      window.KNOWN_PROVIDERS.push({
        id:         "esmafirds",
        name:       "ESMA FIRDS",
        badge:      "FIRDS",
        group:      "Identity & Reference",
        desc:       "EU Financial Instrument Reference Data System — ISIN, CFI code, trading venue (MIC), admission-to-trading date, issuer LEI. Triggers automatically for EU-listed tickers (MIL, XETRA, EPA, AMS, BME, etc.). No API key required.",
        limit:      "Unlimited (no API key required)",
        docsUrl:    "https://www.esma.europa.eu/databases-library/registers-and-data/registers/financial-instruments-reference-data",
        sessionKey: SESSION_KEY,
        limitWarn:  null,
        limitMax:   null,
      });
    }
    if (typeof renderTopbarBadges === "function") renderTopbarBadges();
  }

  /* Initial load */
  setTimeout(() => {
    const t = typeof currentTicker !== "undefined" ? currentTicker : null;
    if (t && _isEUTicker(t)) firdsLoadForTicker(t);
  }, 4000);
});

})();
