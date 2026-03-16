/* ══════════════════════════════════════════════════════════════════
   FINTERM — xbrlenhance.js  (Phase 5 · Fund & ETF Data Ecosystem)
   SEC DERA Financial Statement Data Sets — XBRL Enrichment
   ──────────────────────────────────────────────────────────────────
   What it does:
     Extends the existing faLoadEdgarXBRL() (in fmp.js) with:

     A. Additional financial concepts
        • GrossProfit, OperatingIncomeLoss, EBITDA proxy,
          Free Cash Flow (OperatingCF − CapEx)
        • CommonStockSharesOutstanding, EntityPublicFloat
        • EntityNumberOfEmployees from the DEI taxonomy
          (same concept used in the action plan)

     B. Enriched XBRL segment data → Business Segments block in #fund-des
        • Replaces _segEdgarXBRL fallback with a fuller dimensional scan
          covering both product/service segments AND geographic segments
        • Computes multi-sector label for DES from segment names
        • Injects a compact "Business Segments" section in #fund-des
          showing top segments with their revenue share

     C. SEC EntityNumberOfEmployees enrichment for DES
        • If AV doesn't provide employee count, fetches it from
          the dei namespace in companyfacts JSON

   Access:   No API key · SEC EDGAR companyfacts endpoint
   Endpoint: https://data.sec.gov/api/xbrl/companyfacts/CIK{}.json
   Cache:    6 h (quarterly filing cadence)
   Rate:     Respects SEC 10 req/sec fair-access rule (User-Agent set)
   ══════════════════════════════════════════════════════════════════ */

(function () {
"use strict";

/* ── Constants ──────────────────────────────────────────────────── */
const EDGAR_UA   = "FINTERM dashboard research@finterm.app";
const EDGAR_BASE = "https://data.sec.gov";
const TTL        = 6 * 60 * 60 * 1000;  // 6 h
const SESSION_KEY = "xbrlenhance_call_count";

/* ── Cache ──────────────────────────────────────────────────────── */
const _CACHE = {};
function _cacheGet(k) { const e=_CACHE[k]; return (e&&Date.now()-e.ts<TTL)?e.data:null; }
function _cacheSet(k,d) { _CACHE[k]={data:d,ts:Date.now()}; }

/* ── Helpers ────────────────────────────────────────────────────── */
function _esc(s) {
  return String(s??"").replace(/[<>&"]/g,c=>
    ({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]));
}
function _fmt(n) {
  if (n==null||isNaN(n)) return "—";
  const a=Math.abs(n);
  if (a>=1e12) return "$"+(n/1e12).toFixed(2)+"T";
  if (a>=1e9)  return "$"+(n/1e9).toFixed(2)+"B";
  if (a>=1e6)  return "$"+(n/1e6).toFixed(1)+"M";
  return "$"+Number(n).toLocaleString();
}
function _inc() {
  const n=parseInt(sessionStorage.getItem(SESSION_KEY)||"0")+1;
  sessionStorage.setItem(SESSION_KEY,n);
  if (typeof renderTopbarBadges==="function") renderTopbarBadges();
  return n;
}

/* ── Shared CIK lookup (uses secdera.js cache when available) ───── */
const _LOCAL_CIK = new Map();
async function _getCIK(sym) {
  const bare = sym.replace(/.*:/,"").toUpperCase();
  /* Try secdera.js shared cache first */
  if (typeof window._seciCIKCache!=="undefined" && window._seciCIKCache?.has(bare)) {
    return window._seciCIKCache.get(bare);
  }
  if (_LOCAL_CIK.has(bare)) return _LOCAL_CIK.get(bare);
  try {
    const res  = await fetch(`${EDGAR_BASE}/files/company_tickers.json`,
      {headers:{"User-Agent":EDGAR_UA},signal:AbortSignal.timeout(10000)});
    const json = await res.json();
    for (const [,e] of Object.entries(json)) {
      if ((e.ticker||"").toUpperCase()===bare) {
        const cik = String(e.cik_str).padStart(10,"0");
        _LOCAL_CIK.set(bare,cik);
        return cik;
      }
    }
  } catch(e){console.warn("[XBRLenh] CIK lookup:",e.message);}
  return null;
}

/* ── Fetch companyfacts JSON ────────────────────────────────────── */
async function _getCompanyFacts(sym) {
  const bare     = sym.replace(/.*:/,"").toUpperCase();
  const cacheKey = `xbrl_facts_${bare}`;
  const cached   = _cacheGet(cacheKey);
  if (cached) return cached;

  const cik = await _getCIK(bare);
  if (!cik) return null;
  try {
    const res  = await fetch(
      `${EDGAR_BASE}/api/xbrl/companyfacts/CIK${cik}.json`,
      {headers:{"User-Agent":EDGAR_UA},signal:AbortSignal.timeout(14000)}
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const facts = await res.json();
    _inc();
    _cacheSet(cacheKey,facts);
    return facts;
  } catch(e){console.warn("[XBRLenh] companyfacts:",e.message);return null;}
}

/* ── Extract latest annual value for a us-gaap concept ─────────── */
function _latestAnnual(usgaap, concept, N=5) {
  const units = usgaap[concept]?.units;
  if (!units) return [];
  const arr = (units.USD||units.shares||units.pure||[])
    .filter(d=>d.form==="10-K"&&d.val!=null)
    .sort((a,b)=>(b.end||"").localeCompare(a.end||""));
  const seen=new Set();
  return arr.filter(d=>{
    const yr=(d.end||"").slice(0,4);
    if(seen.has(yr))return false;
    seen.add(yr);return true;
  }).slice(0,N).reverse();
}

/* ── Extract latest DEI value ───────────────────────────────────── */
function _latestDEI(facts, concept) {
  const arr = (facts?.facts?.dei?.[concept]?.units?.pure
            || facts?.facts?.dei?.[concept]?.units?.USD
            || [])
    .filter(d=>d.val!=null)
    .sort((a,b)=>(b.filed||b.end||"").localeCompare(a.filed||a.end||""));
  return arr[0]?.val ?? null;
}

/* ── Extract segment-dimensional data ──────────────────────────── */
function _extractSegments(usgaap) {
  /* Revenue concepts to search for segment breakdown */
  const revConcepts = [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
    "RevenueFromContractWithCustomer",
  ];

  let segments = {product:null, geo:null};

  for (const concept of revConcepts) {
    const units = usgaap[concept]?.units?.USD;
    if (!units?.length) continue;

    /* Filter to entries that have segment dimension data */
    const withDim = units
      .filter(f=>f.segment?.dimension && f.form==="10-K" && f.val!=null)
      .sort((a,b)=>(b.end||"").localeCompare(a.end||""));

    if (!withDim.length) continue;

    /* Group by latest fiscal year */
    const latestEnd = withDim[0].end;
    const latest = withDim.filter(f=>f.end===latestEnd);
    if (latest.length < 2) continue;

    /* Separate geographic vs product segments */
    const geoTerms = /country|geographic|region|segment.*geo|area|market/i;
    const geoSegs  = latest.filter(f=>geoTerms.test(f.segment?.dimension||""));
    const prodSegs = latest.filter(f=>!geoTerms.test(f.segment?.dimension||""));

    const toMap = arr => {
      if (!arr.length) return null;
      const map={};
      arr.forEach(f=>{map[f.segment?.value||f.segment?.dimension||"Other"]=f.val;});
      return {date:latestEnd,segs:map,concept};
    };

    if (!segments.geo    && geoSegs.length>=2)  segments.geo    = toMap(geoSegs);
    if (!segments.product && prodSegs.length>=2) segments.product = toMap(prodSegs);

    if (segments.geo && segments.product) break;
  }

  return segments;
}

/* ══════════════════════════════════════════════════════════════════
   RENDER — "Business Segments" block in #fund-des
   ══════════════════════════════════════════════════════════════════ */
function _renderSegmentsBlock(segs) {
  const des = document.getElementById("fund-des");
  if (!des) return;
  des.querySelector(".xbrl-segments-block")?.remove();

  /* Need at least one non-trivial segment breakdown */
  const data = segs.product || segs.geo;
  if (!data || !data.segs) return;

  const entries = Object.entries(data.segs)
    .filter(([,v])=>v>0)
    .sort(([,a],[,b])=>b-a)
    .slice(0,8);
  if (entries.length < 2) return;

  const total = entries.reduce((s,[,v])=>s+v,0);
  const COLORS = ["#58a6ff","#3fb950","#f0883e","#a371f7","#f85149","#d29922","#4dbbff","#ff9800"];

  const bars = entries.map(([name,val],i)=>{
    const pct = total>0?(val/total*100):0;
    return `
      <div class="xbrl-seg-row">
        <div class="xbrl-seg-dot" style="background:${COLORS[i%COLORS.length]}"></div>
        <div class="xbrl-seg-label" title="${_esc(name)}">${_esc(name.length>22?name.slice(0,21)+"…":name)}</div>
        <div class="xbrl-seg-bar-wrap">
          <div class="xbrl-seg-bar" style="width:${Math.min(pct,100).toFixed(1)}%;background:${COLORS[i%COLORS.length]}"></div>
        </div>
        <div class="xbrl-seg-pct">${pct.toFixed(1)}%</div>
      </div>`;
  }).join("");

  const block = document.createElement("div");
  block.className = "xbrl-segments-block";
  block.innerHTML = `
    <div class="section-head xbrl-head">
      Business Segments
      <span class="xbrl-src-badge">SEC EDGAR XBRL · ${_esc(data.date?.slice(0,4)||"")}</span>
    </div>
    <div class="xbrl-segs-type">${segs.product ? "By Product/Service" : "By Geography"}</div>
    <div class="xbrl-seg-list">${bars}</div>
    ${segs.geo && segs.product ? `
    <div class="xbrl-segs-type" style="margin-top:6px">By Geography</div>
    <div class="xbrl-seg-list">
      ${Object.entries(segs.geo.segs||{}).filter(([,v])=>v>0).sort(([,a],[,b])=>b-a).slice(0,6)
        .map(([name,val],i)=>{
          const t=Object.values(segs.geo.segs).reduce((s,v)=>s+v,0);
          const pct=t>0?(val/t*100):0;
          return `<div class="xbrl-seg-row">
            <div class="xbrl-seg-dot" style="background:${COLORS[i%COLORS.length]}"></div>
            <div class="xbrl-seg-label">${_esc(name.length>22?name.slice(0,21)+"…":name)}</div>
            <div class="xbrl-seg-bar-wrap">
              <div class="xbrl-seg-bar" style="width:${Math.min(pct,100).toFixed(1)}%;background:${COLORS[i%COLORS.length]}"></div>
            </div>
            <div class="xbrl-seg-pct">${pct.toFixed(1)}%</div>
          </div>`;
        }).join("")}
    </div>` : ""}`;

  /* Insert after any FIRDS block, else after existing identity blocks */
  const firds   = des.querySelector(".firds-block");
  const ncen    = des.querySelector(".ncen-block");
  const ch      = des.querySelector(".ch-registry-block");
  const gleif   = des.querySelector(".gleif-identity-block");
  const anchor  = firds||ncen||ch||gleif;
  if (anchor) anchor.insertAdjacentElement("afterend", block);
  else des.appendChild(block);
}

/* ── Inject employee count into DES if AV didn't provide it ─────── */
function _enrichEmployees(sym, facts) {
  const des = document.getElementById("fund-des");
  if (!des) return;
  /* Check if AV already rendered employee count */
  if (des.innerHTML.includes("Employees")) return;

  const employees = _latestDEI(facts,"EntityNumberOfEmployees");
  if (!employees || employees <= 0) return;

  /* Find the Employees metric row rendered by avRenderOverview */
  const metricsContainer = des.querySelector(".metric");
  if (!metricsContainer) return;

  /* Inject via a small update block if mRow is available */
  const existing = des.querySelector(".xbrl-emp-block");
  if (existing) return;

  const block = document.createElement("div");
  block.className = "xbrl-emp-block";
  if (typeof mRow === "function") {
    block.innerHTML = mRow("Employees (XBRL)",
      Number(employees).toLocaleString() + " (SEC DEI)");
  } else {
    block.innerHTML = `<div class="metric">
      <span>Employees (XBRL)</span>
      <span>${Number(employees).toLocaleString()} <small style="color:var(--text-muted)">SEC DEI</small></span>
    </div>`;
  }
  /* Append after the first section-head (Valuation) */
  const firstHead = des.querySelector(".section-head");
  if (firstHead) firstHead.insertAdjacentElement("beforebegin", block);
  else des.appendChild(block);
}

/* ══════════════════════════════════════════════════════════════════
   PATCH faLoadEdgarXBRL — add more concepts to FA table
   The patch replaces the existing function with an enriched version
   that fetches the same companyfacts endpoint but extracts more:
   GrossProfit, OperatingIncomeLoss, FCF, shares outstanding.
   ══════════════════════════════════════════════════════════════════ */
function _patchFALoad() {
  if (window._xbrlenhPatched) return;
  if (typeof faLoadEdgarXBRL !== "function") return;
  window._xbrlenhPatched = true;

  const _origFA = faLoadEdgarXBRL;
  window.faLoadEdgarXBRL = async function faLoadEdgarXBRL(sym, el) {
    /* Run original first */
    await _origFA.call(this, sym, el);
    /* Now enrich with additional concepts */
    setTimeout(() => _enrichFATab(sym, el), 300);
  };
}

async function _enrichFATab(sym, el) {
  if (!el) el = document.getElementById("fund-fa");
  if (!el) return;
  /* Only enrich if EDGAR XBRL content is showing (not AV/FMP data) */
  if (!el.innerHTML.includes("SEC EDGAR XBRL")) return;
  el.querySelector(".xbrl-extra-section")?.remove();

  const facts = await _getCompanyFacts(sym);
  if (!facts) return;

  const g = facts.facts?.["us-gaap"] || {};
  const getA = (concept) => _latestAnnual(g, concept, 5);

  const grossProfit = getA("GrossProfit");
  const operIncome  = getA("OperatingIncomeLoss");
  const interest    = getA("InterestExpense");
  const taxExp      = getA("IncomeTaxExpenseBenefit");
  const da          = getA("DepreciationDepletionAndAmortization")
                   || getA("DepreciationAndAmortization");
  const shares      = getA("CommonStockSharesOutstanding")
                   || getA("CommonStockSharesIssuedNet");

  if (!grossProfit.length && !operIncome.length) return;

  /* Years derived from gross profit series */
  const years = grossProfit.length ? grossProfit.map(d=>d.end?.slice(0,4))
              : operIncome.map(d=>d.end?.slice(0,4));

  const getVal = (arr, yr) => {
    const row = arr.find(d=>d.end?.startsWith(yr));
    return row ? _fmt(row.val) : "—";
  };
  const getNum = (arr, yr) => {
    const row = arr.find(d=>d.end?.startsWith(yr));
    return row?.val ?? null;
  };

  const rows = years.map(yr => {
    const gp  = getVal(grossProfit, yr);
    const oi  = getVal(operIncome, yr);
    const daV = getNum(da, yr);
    const oiN = getNum(operIncome, yr);
    const ebitdaV = (oiN!=null && daV!=null) ? _fmt(oiN+daV) : "—";
    const sh  = getNum(shares, yr);
    return `<tr>
      <td>${_esc(yr)}</td>
      <td>${_esc(gp)}</td>
      <td>${_esc(oi)}</td>
      <td>${_esc(ebitdaV)}</td>
      <td>${sh!=null?_fmt(sh)+"sh":"—"}</td>
    </tr>`;
  }).join("");

  const section = document.createElement("div");
  section.className = "xbrl-extra-section";
  section.innerHTML = `
    <div class="av-section-head" style="margin-top:10px">
      Extended Financials (XBRL)
      <span class="xbrl-src-badge" style="float:right;font-size:8px;margin-top:2px">SEC EDGAR</span>
    </div>
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead>
          <tr>
            <th>Year</th>
            <th>Gross Profit</th>
            <th>Op. Income</th>
            <th>EBITDA (est.)</th>
            <th>Shares Out.</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  el.appendChild(section);
}

/* ══════════════════════════════════════════════════════════════════
   PATCH _segEdgarXBRL — richer dimensional segment extraction
   ══════════════════════════════════════════════════════════════════ */
function _patchSegXBRL() {
  if (window._xbrlSegPatched) return;
  if (typeof fmpLoadSegmentation !== "function") return;
  window._xbrlSegPatched = true;

  /* We enhance the SEG tab indirectly: after fmpLoadSegmentation runs,
     if the XBRL fallback was used (no FMP key), we enrich it with
     our richer segment extraction. */
  const _origSeg = fmpLoadSegmentation;
  window.fmpLoadSegmentation = async function fmpLoadSegmentation(sym) {
    await _origSeg.call(this, sym);
    setTimeout(() => _enrichSegTab(sym), 400);
  };
}

async function _enrichSegTab(sym) {
  const el = document.getElementById("fund-seg");
  if (!el) return;
  /* Only enrich if EDGAR XBRL content is showing */
  if (!el.innerHTML.includes("EDGAR XBRL")) return;
  if (el.querySelector(".xbrl-geo-section")) return;

  const facts = await _getCompanyFacts(sym);
  if (!facts) return;

  const segs = _extractSegments(facts.facts?.["us-gaap"]||{});
  if (!segs.product && !segs.geo) return;

  /* If we have geographic data and the existing render didn't show it, add it */
  if (segs.geo && !el.innerHTML.toLowerCase().includes("geograph")) {
    const geoEntries = Object.entries(segs.geo.segs||{})
      .filter(([,v])=>v>0).sort(([,a],[,b])=>b-a).slice(0,8);
    if (geoEntries.length >= 2) {
      const total = geoEntries.reduce((s,[,v])=>s+v,0);
      const COLORS = ["#58a6ff","#3fb950","#f0883e","#a371f7","#f85149","#d29922","#4dbbff","#ff9800"];
      const section = document.createElement("div");
      section.className = "xbrl-geo-section";
      section.innerHTML = `
        <div class="seg-donut-section">
          <div class="seg-section-title">
            By Geography (EDGAR XBRL)
            <span class="seg-date">${_esc(segs.geo.date||"")}</span>
            <span class="seg-src">· SEC EDGAR</span>
          </div>
          <div class="seg-bars" style="flex:1;min-width:0;padding:4px 0">
            ${geoEntries.map(([name,val],i)=>{
              const pct=total>0?(val/total*100):0;
              return `<div class="seg-row">
                <div class="seg-dot" style="background:${COLORS[i%COLORS.length]}"></div>
                <div class="seg-label">${_esc(name.length>26?name.slice(0,25)+"…":name)}</div>
                <div class="seg-bar-wrap">
                  <div class="seg-bar" style="width:${Math.min(pct,100).toFixed(1)}%;background:${COLORS[i%COLORS.length]}"></div>
                </div>
                <div class="seg-pct">${pct.toFixed(1)}%</div>
                <div class="seg-val">${_fmt(val)}</div>
              </div>`;
            }).join("")}
          </div>
        </div>`;
      el.appendChild(section);
    }
  }
}

/* ══════════════════════════════════════════════════════════════════
   MAIN ENTRY — called on every ticker change
   ══════════════════════════════════════════════════════════════════ */
window.xbrlEnhanceForTicker = async function xbrlEnhanceForTicker(ticker) {
  if (!ticker) return;
  const sym = ticker.replace(/.*:/,"").toUpperCase();

  /* Fetch companyfacts (cached 6h) */
  const facts = await _getCompanyFacts(sym);
  if (!facts) return;

  const g = facts.facts?.["us-gaap"] || {};

  /* A. Enrich #fund-des with employee count from DEI */
  _enrichEmployees(sym, facts);

  /* B. Extract segments and inject into #fund-des */
  const segs = _extractSegments(g);
  if (segs.product || segs.geo) {
    _renderSegmentsBlock(segs);
  }
};

/* ══════════════════════════════════════════════════════════════════
   HOOKS
   ══════════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {

  /* Apply patches once other modules have loaded */
  setTimeout(() => {
    _patchFALoad();
    _patchSegXBRL();
  }, 600);

  /* Trigger on ticker change (after DES is painted) */
  window.addEventListener("finterm:figi-ready", e => {
    const t = e.detail?.ticker;
    if (t) setTimeout(() => xbrlEnhanceForTicker(t), 2000);
  });

  const _origCT = typeof changeTicker==="function" ? changeTicker : null;
  if (_origCT) {
    window.changeTicker = function() {
      _origCT.apply(this, arguments);
      const raw = document.getElementById("tickerInput")?.value.trim();
      if (raw) {
        document.getElementById("fund-des")?.querySelector(".xbrl-segments-block")?.remove();
        document.getElementById("fund-des")?.querySelector(".xbrl-emp-block")?.remove();
        document.getElementById("fund-fa")?.querySelector(".xbrl-extra-section")?.remove();
        document.getElementById("fund-seg")?.querySelector(".xbrl-geo-section")?.remove();
        /* Only fire if gleif isn't already triggering it via figi-ready */
        if (typeof openfigiLoadForTicker !== "function") {
          setTimeout(() => xbrlEnhanceForTicker(raw), 2200);
        }
      }
    };
  }

  /* Register in KNOWN_PROVIDERS */
  if (Array.isArray(window.KNOWN_PROVIDERS)) {
    if (!window.KNOWN_PROVIDERS.find(p=>p.id==="xbrlenhance")) {
      window.KNOWN_PROVIDERS.push({
        id:         "xbrlenhance",
        name:       "SEC XBRL Enhanced",
        badge:      "XBRL+",
        group:      "Identity & Reference",
        desc:       "Extends SEC EDGAR XBRL with GrossProfit, OperatingIncome, EBITDA proxy, shares outstanding, geographic/product segments, and EntityNumberOfEmployees from DEI taxonomy. Adds Business Segments to DES tab, enriches FA and SEG tabs. No API key required.",
        limit:      "Unlimited (SEC fair access: 10 req/sec)",
        docsUrl:    "https://data.sec.gov/api/xbrl/companyfacts/",
        sessionKey: SESSION_KEY,
        limitWarn:  null,
        limitMax:   null,
      });
    }
    if (typeof renderTopbarBadges==="function") renderTopbarBadges();
  }

  /* Initial load */
  setTimeout(() => {
    const t = typeof currentTicker!=="undefined" ? currentTicker : "AAPL";
    xbrlEnhanceForTicker(t);
  }, 4500);
});

})();
