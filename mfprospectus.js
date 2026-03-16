/* ══════════════════════════════════════════════════════════════════
   FINTERM — mfprospectus.js  (Phase 5 · Fund & ETF Data Ecosystem)
   SEC DERA Mutual Fund Prospectus Risk/Return Summary
   ──────────────────────────────────────────────────────────────────
   What it does:
     For mutual fund tickers, fetches the latest prospectus filing
     (485BPOS or 485APOS) from SEC EDGAR and extracts XBRL-tagged
     risk/return fields from the rr: namespace:

       rr:NetExpenseRatio              — total annual fund operating expenses
       rr:ManagementFeesOverAssets     — management fee component
       rr:AcquiredFundFeesAndExpenses  — fund-of-funds pass-through costs
       rr:OtherExpensesOverAssets      — miscellaneous operating expenses
       rr:InvestmentObjectiveHeading   — fund investment objective narrative
       rr:StrategyNarrative            — principal investment strategies text
       rr:RiskNarrative                — principal risk factors text

     Also parses the DEI concepts present in prospectus filings:
       dei:EntityRegistrantName
       dei:DocumentEffectiveDate
       dei:SecurityExchangeName

   Populates:
     #fund-ee → "Fund Prospectus (SEC XBRL)" section injected below
                any existing FMP/AV estimates content.
                For pure mutual fund tickers with no analyst estimates,
                this becomes the primary EE tab content.

   Trigger:
     Fires for tickers identified as Mutual Funds:
       • ss_currentType === 'fund'
       • nasdaqMFundLookup(sym) returns data
       • FIGI securityType === 'Mutual Fund'
       • NOT an ETF (ETPs already handled by N-PORT in secdera.js)

   Access:   No API key · SEC EDGAR EFTS + Archives
   Rate:     Respects SEC 10 req/sec fair-access rule
   Cache:    12 h (prospectus text changes on amendments only)
   ══════════════════════════════════════════════════════════════════ */

(function () {
"use strict";

/* ── Constants ──────────────────────────────────────────────────── */
const EDGAR_UA   = "FINTERM dashboard research@finterm.app";
const EDGAR_BASE = "https://data.sec.gov";
const TTL        = 12 * 60 * 60 * 1000;  // 12 h
const SESSION_KEY = "mfprospectus_call_count";

/* Prospectus form types to search for, in priority order */
const PROSP_FORMS = ["485BPOS","485APOS","485B24E","485B24F","N-14","N-1A"];

/* ── Cache ──────────────────────────────────────────────────────── */
const _CACHE = {};
function _cacheGet(k) { const e=_CACHE[k]; return (e&&Date.now()-e.ts<TTL)?e.data:null; }
function _cacheSet(k,d) { _CACHE[k]={data:d,ts:Date.now()}; }

/* ── Helpers ────────────────────────────────────────────────────── */
function _esc(s) {
  return String(s??"").replace(/[<>&"]/g,c=>
    ({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]));
}
function _pct(v) {
  if (v==null||isNaN(v)) return "—";
  /* rr: expense ratios are stored as decimals (0.0075 = 0.75%) */
  const n = Math.abs(v);
  return (n < 1 ? (v*100).toFixed(2) : v.toFixed(2)) + "%";
}
function _inc() {
  const n=parseInt(sessionStorage.getItem(SESSION_KEY)||"0")+1;
  sessionStorage.setItem(SESSION_KEY,n);
  if (typeof renderTopbarBadges==="function") renderTopbarBadges();
  return n;
}
/* Truncate long prospectus narrative text cleanly */
function _truncate(text, maxChars=600) {
  if (!text||text.length<=maxChars) return text;
  const cut = text.slice(0,maxChars);
  return cut.slice(0, cut.lastIndexOf(" ")) + "…";
}
/* Strip common XBRL artifacts from narrative text */
function _cleanText(text) {
  if (!text) return null;
  return text
    .replace(/<[^>]+>/g," ")           // strip HTML tags
    .replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/&nbsp;/g," ").replace(/&#[0-9]+;/g,"")
    .replace(/\s{2,}/g," ")
    .trim();
}

/* ── Detect mutual fund (not ETF) ───────────────────────────────── */
function _isMutualFund(sym) {
  const bare = sym.replace(/.*:/,"").toUpperCase();

  /* Explicit mutual fund from nasdaqdir */
  if (typeof nasdaqMFundLookup==="function" && nasdaqMFundLookup(bare)) return true;

  /* smartsearch currentType */
  if (typeof ss_currentType!=="undefined" && ss_currentType==="fund") return true;

  /* FIGI type */
  const figi = window._currentFIGI;
  if (figi?.securityType==="Mutual Fund") return true;
  if (figi?.securityType==="ETP") return false; // ETF — handled by N-PORT

  /* Heuristic: Nasdaq dir is ETF → not MF */
  if (typeof nasdaqIsETF==="function" && nasdaqIsETF(bare)===true) return false;

  return false;
}

/* ══════════════════════════════════════════════════════════════════
   EDGAR — find and fetch prospectus filing
   ══════════════════════════════════════════════════════════════════ */

/* CIK resolution (shares approach with secdera.js) */
const _CIK_CACHE = new Map();
async function _getCIK(sym) {
  const bare = sym.replace(/.*:/,"").toUpperCase();
  if (_CIK_CACHE.has(bare)) return _CIK_CACHE.get(bare);
  try {
    const res  = await fetch(`${EDGAR_BASE}/files/company_tickers.json`,
      {headers:{"User-Agent":EDGAR_UA},signal:AbortSignal.timeout(10000)});
    const json = await res.json();
    for (const [,e] of Object.entries(json)) {
      if ((e.ticker||"").toUpperCase()===bare) {
        const cik=String(e.cik_str).padStart(10,"0");
        _CIK_CACHE.set(bare,cik);
        return cik;
      }
    }
  } catch(e){console.warn("[MFProsp] CIK:",e.message);}

  /* Fallback: EDGAR EFTS full-text search for prospectus */
  try {
    const url=`https://efts.sec.gov/hits.esf?q=%22${encodeURIComponent(bare)}%22&forms=485BPOS,N-1A&hits.hits.total=1`;
    const res=await fetch(url,{headers:{"User-Agent":EDGAR_UA},signal:AbortSignal.timeout(8000)});
    const json=await res.json();
    const cik=json?.hits?.hits?.[0]?._id?.split(":")[0];
    if (cik) {const p=cik.padStart(10,"0");_CIK_CACHE.set(bare,p);return p;}
  } catch{}
  return null;
}

/* Find latest prospectus in submissions JSON */
async function _findProspectus(cik) {
  try {
    const res  = await fetch(`${EDGAR_BASE}/submissions/CIK${cik}.json`,
      {headers:{"User-Agent":EDGAR_UA},signal:AbortSignal.timeout(10000)});
    const json = await res.json();
    const f    = json?.filings?.recent;
    if (!f) return null;
    const forms=f.form||[], accs=f.accessionNumber||[], dates=f.filingDate||[];

    for (const formType of PROSP_FORMS) {
      const idx = forms.findIndex(x=>x===formType);
      if (idx>=0) return {form:formType, accession:accs[idx], date:dates[idx], cik};
    }
  } catch(e){console.warn("[MFProsp] submissions:",e.message);}
  return null;
}

/* Fetch prospectus filing index and find primary XML */
async function _fetchProspectusXML(cik, accession) {
  if (!cik||!accession) return null;
  const acc = accession.replace(/-/g,"");
  const idxPath=`${EDGAR_BASE}/Archives/edgar/data/${parseInt(cik)}/${acc}/${acc}-index.json`;
  try {
    const res=await fetch(idxPath,{headers:{"User-Agent":EDGAR_UA},signal:AbortSignal.timeout(8000)});
    if (!res.ok) return null;
    const json=await res.json();
    const items=json?.directory?.item||[];
    /* Prefer the primary document (type="485BPOS" or "N-1A") */
    const xmlFile = items.find(f=>
        (f.type==="485BPOS"||f.type==="N-1A"||f.type==="485APOS") &&
        (f.name?.endsWith(".xml")||f.name?.endsWith(".htm"))
      ) || items.find(f=>f.name?.endsWith(".xml") && !f.name?.includes("def"))
        || items[0];
    if (!xmlFile) return null;
    const xmlPath=`${EDGAR_BASE}/Archives/edgar/data/${parseInt(cik)}/${acc}/${xmlFile.name}`;
    const xr=await fetch(xmlPath,{headers:{"User-Agent":EDGAR_UA},signal:AbortSignal.timeout(20000)});
    if (!xr.ok) return null;
    _inc();
    return xr.text();
  } catch(e){console.warn("[MFProsp] XML fetch:",e.message);return null;}
}

/* ══════════════════════════════════════════════════════════════════
   PARSE — extract rr: namespace data from prospectus XML/iXBRL
   ══════════════════════════════════════════════════════════════════ */
function _parseProspectus(xmlText) {
  if (!xmlText) return null;

  /* Try XML parser first (XBRL instance document) */
  let doc;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(xmlText,"text/xml");
    const parseErr = doc.querySelector("parsererror");
    if (parseErr) {
      doc = parser.parseFromString(xmlText,"text/html");
    }
  } catch { return null; }

  /* Helper: get text content of first matching tag (with/without namespace) */
  const getText = (tag) => {
    /* Try with rr: prefix, then without, then with namespace wildcard */
    const node = doc.querySelector(`rr\\:${tag}`)
               || doc.querySelector(tag)
               || doc.getElementsByTagNameNS("*",tag)[0]
               || doc.getElementsByTagName(`rr:${tag}`)[0];
    return _cleanText(node?.textContent) || null;
  };

  /* Helper: get numeric value from expense ratio concepts */
  const getNum = (tag) => {
    const text = getText(tag);
    if (!text) return null;
    const n = parseFloat(text.replace(/[%,]/g,""));
    return isNaN(n) ? null : n;
  };

  /* Expense data */
  const netExpenseRatio  = getNum("NetExpenseRatio")
                        || getNum("ExpensesOverAssets")
                        || getNum("TotalAnnualFundOperatingExpenses");
  const managementFee    = getNum("ManagementFeesOverAssets")
                        || getNum("ManagementFees");
  const otherExpenses    = getNum("OtherExpensesOverAssets");
  const acquiredFundFees = getNum("AcquiredFundFeesAndExpensesOverAssets")
                        || getNum("AcquiredFundFeesAndExpenses");

  /* Narrative text */
  const objective   = _truncate(getText("ObjectiveHeading")
                    || getText("InvestmentObjectiveHeading")
                    || getText("InvestmentObjective"), 400);
  const strategy    = _truncate(getText("StrategyNarrative")
                    || getText("PrincipalInvestmentStrategies")
                    || getText("InvestmentStrategy"), 800);
  const risks       = _truncate(getText("RiskNarrative")
                    || getText("PrincipalRisks")
                    || getText("RiskFactors"), 600);
  const performance = _truncate(getText("PerformanceNarrative")
                    || getText("BarChartNarrative"), 300);

  /* DEI fields */
  const fundName    = getText("EntityRegistrantName")
                   || getText("FundName")
                   || getText("Series");
  const effectDate  = getText("DocumentEffectiveDate")
                   || getText("DocumentPeriodEndDate");
  const exchName    = getText("SecurityExchangeName");

  if (!netExpenseRatio && !strategy && !objective) return null;

  return {
    netExpenseRatio,
    managementFee,
    otherExpenses,
    acquiredFundFees,
    objective,
    strategy,
    risks,
    performance,
    fundName,
    effectDate,
    exchName,
  };
}

/* ══════════════════════════════════════════════════════════════════
   RENDER — #fund-ee "Fund Prospectus (SEC XBRL)" section
   ══════════════════════════════════════════════════════════════════ */
function _renderProspectusSection(sym, data, filingInfo) {
  const ee = document.getElementById("fund-ee");
  if (!ee) return;
  ee.querySelector(".mf-prospectus-section")?.remove();

  const section = document.createElement("div");
  section.className = "mf-prospectus-section";

  /* Expense ratio colour: >1% amber, >2% red, <0.5% green */
  const expColor = data.netExpenseRatio == null ? "var(--text)"
    : data.netExpenseRatio > 2   ? "#f85149"
    : data.netExpenseRatio > 1   ? "#d29922"
    : data.netExpenseRatio < 0.3 ? "#3fb950"
    : "var(--text)";

  const feeRows = [
    ["Net Expense Ratio",   data.netExpenseRatio, true],
    ["Management Fee",      data.managementFee,   false],
    ["Other Expenses",      data.otherExpenses,   false],
    ["Acquired Fund Fees",  data.acquiredFundFees,false],
  ].filter(([,v])=>v!=null);

  const feeTable = feeRows.length ? `
    <div class="mf-fee-grid">
      ${feeRows.map(([label,val,primary])=>`
        <div class="mf-fee-row${primary?" mf-fee-primary":""}">
          <span class="mf-fee-label">${_esc(label)}</span>
          <span class="mf-fee-val" style="${primary?`color:${expColor};font-weight:700`:""}">
            ${_pct(val)}
          </span>
        </div>`).join("")}
    </div>` : "";

  const narratives = [
    ["Investment Objective", data.objective, "mf-objective"],
    ["Principal Strategies", data.strategy,  "mf-strategy"],
    ["Principal Risks",      data.risks,     "mf-risks"],
    ["Performance",          data.performance,"mf-perf"],
  ].filter(([,v])=>v);

  const narrativeHTML = narratives.map(([title,text,cls])=>`
    <div class="mf-narrative-block ${_esc(cls)}">
      <div class="mf-narrative-title">${_esc(title)}</div>
      <div class="mf-narrative-text">${_esc(text)}</div>
    </div>`).join("");

  section.innerHTML = `
    <div class="av-live-badge mf-prosp-badge">
      ● Fund Prospectus · ${_esc(data.fundName||sym)}
      <span class="mf-src-badge">SEC EDGAR ${_esc(filingInfo?.form||"485BPOS")} · No key</span>
    </div>

    ${filingInfo?.date ? `
    <div class="mf-meta-row">
      <span>Filing: ${_esc(filingInfo.date)}</span>
      ${data.effectDate ? `<span>Effective: ${_esc(data.effectDate)}</span>` : ""}
      ${data.exchName   ? `<span>Exchange: ${_esc(data.exchName)}</span>`  : ""}
    </div>` : ""}

    ${feeTable ? `
    <div class="section-head" style="margin-top:8px">
      Annual Fund Operating Expenses
    </div>
    ${feeTable}
    <div class="mf-fee-note">
      Expense ratios as reported in prospectus filing.
      Lower is generally better for long-term investors.
    </div>` : ""}

    ${narrativeHTML}

    <div class="mf-prosp-footer">
      Source: SEC EDGAR ${_esc(filingInfo?.form||"485BPOS")} prospectus filing ·
      <a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=485BPOS&dateb=&owner=include&count=10"
         target="_blank" rel="noopener" class="mf-prosp-link">SEC EDGAR ↗</a>
      · No API key required
    </div>`;

  /* Prepend if EE tab is empty, else append */
  const existing = ee.querySelector(".av-live-badge");
  if (existing) {
    ee.appendChild(section);
  } else {
    ee.innerHTML = "";
    ee.appendChild(section);
  }
}

/* ══════════════════════════════════════════════════════════════════
   MAIN ENTRY
   ══════════════════════════════════════════════════════════════════ */
window.mfProspectusLoadForTicker = async function mfProspectusLoadForTicker(ticker) {
  if (!ticker) return;
  const sym = ticker.replace(/.*:/,"").toUpperCase();

  /* Only run for mutual funds */
  if (!_isMutualFund(sym)) return;

  const cacheKey = `mfprosp_${sym}`;
  const cached   = _cacheGet(cacheKey);
  if (cached) {
    if (cached.data) _renderProspectusSection(sym, cached.data, cached.filing);
    return;
  }

  const cik = await _getCIK(sym);
  if (!cik) return;

  const filing = await _findProspectus(cik);
  if (!filing) {
    _cacheSet(cacheKey, {data:null, filing:null});
    return;
  }

  const xml  = await _fetchProspectusXML(cik, filing.accession);
  const data = _parseProspectus(xml);

  _cacheSet(cacheKey, {data, filing});
  if (data) _renderProspectusSection(sym, data, filing);
};

/* ══════════════════════════════════════════════════════════════════
   HOOKS
   ══════════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {

  /* Trigger when smartsearch identifies a fund and EE tab is relevant */
  window.addEventListener("finterm:figi-ready", e => {
    const t = e.detail?.ticker;
    if (t) setTimeout(() => mfProspectusLoadForTicker(t), 3500);
  });

  /* Also hook the EE tab button click so it loads on-demand */
  const _patchEETab = () => {
    const eeBtn = document.querySelector('[data-tab="ee"]');
    if (!eeBtn || eeBtn.dataset.mfPatched) return;
    eeBtn.dataset.mfPatched = "1";
    const _origClick = eeBtn.onclick;
    eeBtn.onclick = function(e) {
      if (_origClick) _origClick.call(this,e);
      const sym = (typeof currentTicker!=="undefined")
        ? currentTicker.replace(/.*:/,"").toUpperCase() : null;
      if (sym) setTimeout(() => mfProspectusLoadForTicker(sym), 200);
    };
  };
  setTimeout(_patchEETab, 1000);

  /* Clean up on ticker change */
  const _origCT = typeof changeTicker==="function" ? changeTicker : null;
  if (_origCT) {
    window.changeTicker = function() {
      _origCT.apply(this, arguments);
      document.getElementById("fund-ee")?.querySelector(".mf-prospectus-section")?.remove();
    };
  }

  /* Register in KNOWN_PROVIDERS */
  if (Array.isArray(window.KNOWN_PROVIDERS)) {
    if (!window.KNOWN_PROVIDERS.find(p=>p.id==="mfprospectus")) {
      window.KNOWN_PROVIDERS.push({
        id:         "mfprospectus",
        name:       "SEC MF Prospectus",
        badge:      "PROSP",
        group:      "Identity & Reference",
        desc:       "SEC EDGAR mutual fund prospectus (485BPOS/N-1A): expense ratio, management fee, investment objective, principal strategies, and risk factors from XBRL-tagged rr: namespace. Auto-triggers for mutual fund tickers. No API key required.",
        limit:      "Unlimited (SEC fair access: 10 req/sec)",
        docsUrl:    "https://www.sec.gov/data-research/sec-markets-data/mutual-fund-prospectus-risk-return-summary-data-sets",
        sessionKey: SESSION_KEY,
        limitWarn:  null,
        limitMax:   null,
      });
    }
    if (typeof renderTopbarBadges==="function") renderTopbarBadges();
  }
});

})();
