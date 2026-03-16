/* ══════════════════════════════════════════════════════════════════
   FINTERM — finra.js  (Phase 3 · Market Structure)
   FINRA Daily Short Sale Volume  +  FINRA Equity Short Interest
   ──────────────────────────────────────────────────────────────────
   3.1  FINRA DAILY SHORT SALE VOLUME  (no key, posted by 6pm ET)
        Source: RegSHO Consolidated FINRA Short Sale Volume files
        URL:    https://cdn.finra.org/equity/regsho/daily/
                CNMSshvol{YYYYMMDD}.txt
        Format: pipe-delimited
                Symbol|Date|ShortVolume|ShortExemptVolume|TotalVolume|Market
        Signal: short sale ratio = ShortVolume / TotalVolume
                Interpreted as daily trading pressure, NOT cumulative
                short interest. Distinct from Finnhub short interest.

   3.2  FINRA EQUITY SHORT INTEREST  (no key, twice-monthly)
        Source: FINRA programmatic short interest endpoint
        URL:    https://services.finra.org/apps/services/securities/
                equities/short/interest/finra?symbol={SYM}&
                startDate={D}&endDate={D}
        Format: JSON array [{symbolCode, settlementDate,
                shortInterest, totalBorrowedShares, ...}]
        Published: twice per month on FINRA settlement date cycles.
                   Authoritative source; Finnhub data is derived
                   from FINRA and may lag by one cycle.

   ARCHITECTURE
     Both sections are appended NON-DESTRUCTIVELY to #fund-short
     below the existing Finnhub content.
     finra.js patches window.fhLoadShortInterest so FINRA data
     loads automatically whenever the SHORT tab is opened —
     no index.html changes needed.

     Sentinel divs prevent duplicate injection on re-renders:
       .finra-ssv-section   (short sale volume)
       .finra-si-section    (short interest)

   Access:   No API key required for either endpoint
   Cache:    Short sale volume: 4 h (daily file, posted once)
             Short interest:   12 h (twice-monthly, stable)
   ══════════════════════════════════════════════════════════════════ */

(function () {
"use strict";

/* ── Constants ──────────────────────────────────────────────────── */
const PROXY         = "https://api.allorigins.win/raw?url=";
const FINRA_CDN     = "https://cdn.finra.org/equity/regsho/daily/";
const FINRA_SI_BASE = "https://services.finra.org/apps/services/securities/equities/short/interest/finra";
const SSV_TTL       = 4  * 60 * 60 * 1000;   // 4 h
const SI_TTL        = 12 * 60 * 60 * 1000;   // 12 h
const SESSION_KEY   = "finra_call_count";

/* ── In-memory cache ────────────────────────────────────────────── */
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
function _fmt(n, d = 0) {
  if (n == null || isNaN(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Number(n).toFixed(d);
}
function _pctFmt(n) {
  if (n == null || isNaN(n)) return "—";
  return (n * 100).toFixed(2) + "%";
}
function _inc() {
  const n = parseInt(sessionStorage.getItem(SESSION_KEY) || "0") + 1;
  sessionStorage.setItem(SESSION_KEY, n);
  if (typeof renderTopbarBadges === "function") renderTopbarBadges();
  return n;
}

/* ── Build list of recent trading dates (skip weekends) ─────────── */
function _recentTradingDates(maxDays = 5) {
  const dates = [];
  const d     = new Date();
  let   tries = 0;
  while (dates.length < maxDays && tries < 14) {
    tries++;
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      const y  = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      const dy = String(d.getDate()).padStart(2, "0");
      dates.push(`${y}${mo}${dy}`);
    }
    d.setDate(d.getDate() - 1);
  }
  return dates;
}

/* ══════════════════════════════════════════════════════════════════
   3.1  FINRA DAILY SHORT SALE VOLUME
   ══════════════════════════════════════════════════════════════════ */

/**
 * Fetch and parse the FINRA RegSHO consolidated short sale volume
 * file for a given YYYYMMDD date string.
 * Returns parsed array of records, or null on failure.
 */
async function _fetchSSVFile(dateStr) {
  const cacheKey = `finra_ssv_${dateStr}`;
  const cached   = _cacheGet(cacheKey, SSV_TTL);
  if (cached !== null) return cached;

  const url      = `${FINRA_CDN}CNMSshvol${dateStr}.txt`;
  const proxied  = PROXY + encodeURIComponent(url);

  try {
    const res  = await fetch(proxied, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.length < 100) return null;

    /* Parse pipe-delimited: Symbol|Date|ShortVolume|ShortExemptVolume|TotalVolume|Market */
    const lines  = text.trim().split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return null;

    /* First line may be a header or data — detect */
    const isHeader = lines[0].toLowerCase().includes("symbol") || lines[0].toLowerCase().includes("date");
    const dataLines = isHeader ? lines.slice(1) : lines;
    /* Last line is sometimes a totals/footer row */
    const filtered = dataLines.filter(l => !l.startsWith("Date") && !l.startsWith("0|"));

    const records = [];
    for (const line of filtered) {
      const parts = line.split("|");
      if (parts.length < 5) continue;
      records.push({
        symbol:      (parts[0] || "").trim().toUpperCase(),
        date:        (parts[1] || dateStr).trim(),
        shortVol:    parseInt(parts[2]) || 0,
        exemptVol:   parseInt(parts[3]) || 0,
        totalVol:    parseInt(parts[4]) || 0,
        market:      (parts[5] || "").trim(),
      });
    }

    _cacheSet(cacheKey, records);
    _inc();
    return records;
  } catch (e) {
    console.warn("[FINRA SSV] fetch failed for", dateStr, e.message);
    return null;
  }
}

/**
 * Get short sale volume records for a specific symbol across
 * the most recent available trading days.
 * Returns array of {date, shortVol, totalVol, ratio, exemptVol}
 * sorted newest-first.
 */
async function finraGetSSV(sym) {
  const cacheKey = `finra_ssv_sym_${sym}`;
  const cached   = _cacheGet(cacheKey, SSV_TTL);
  if (cached !== null) return cached;

  const dates   = _recentTradingDates(5);
  const results = [];

  for (const dateStr of dates) {
    const records = await _fetchSSVFile(dateStr);
    if (!records) continue;

    const match = records.find(r => r.symbol === sym);
    if (match) {
      results.push({
        date:      match.date || dateStr,
        shortVol:  match.shortVol,
        exemptVol: match.exemptVol,
        totalVol:  match.totalVol,
        ratio:     match.totalVol > 0 ? match.shortVol / match.totalVol : null,
        market:    match.market,
      });
    }

    /* Stop after finding 5 days with data */
    if (results.length >= 5) break;
  }

  /* Sort newest-first */
  results.sort((a, b) => (b.date > a.date ? 1 : -1));
  _cacheSet(cacheKey, results);
  return results;
}

/* ══════════════════════════════════════════════════════════════════
   3.2  FINRA EQUITY SHORT INTEREST  (authoritative twice-monthly)
   ══════════════════════════════════════════════════════════════════ */

/**
 * Fetch FINRA's official equity short interest for a symbol.
 * Falls back to a 6-month lookback window if current period empty.
 */
async function finraGetShortInterest(sym) {
  const cacheKey = `finra_si_${sym}`;
  const cached   = _cacheGet(cacheKey, SI_TTL);
  if (cached !== null) return cached;

  /* Build a 6-month date range */
  const endDate   = new Date();
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - 6);
  const fmt = d => d.toISOString().slice(0, 10);

  const url = `${FINRA_SI_BASE}?symbol=${encodeURIComponent(sym)}`
            + `&startDate=${fmt(startDate)}&endDate=${fmt(endDate)}`;

  try {
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal:  AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    _inc();

    /* Normalise field names — FINRA returns camelCase but shape varies */
    const records = (Array.isArray(json) ? json : json?.results || json?.data || [])
      .map(r => ({
        settlementDate:    r.settlementDate     || r.SettlementDate     || r.date             || "",
        shortInterest:     parseInt(r.shortInterest    || r.ShortInterest    || r.shortInt         || 0),
        avgDailyShareVol:  parseInt(r.avgDailyShareVol || r.AvgDailyShareVol || r.averageDailyVol  || 0),
        daysToCover:       parseFloat(r.daysToCover    || r.DaysToCover      || 0) || null,
        revolvingCredit:   r.revolvingCredit    || null,
        shortInterestFlag: r.shortInterestFlag  || "",
      }))
      .filter(r => r.shortInterest > 0)
      .sort((a, b) => (b.settlementDate > a.settlementDate ? 1 : -1));

    _cacheSet(cacheKey, records);
    return records;
  } catch (e) {
    console.warn("[FINRA SI] fetch failed for", sym, e.message);
    /* Cache empty array to avoid hammering the endpoint */
    _cacheSet(cacheKey, []);
    return [];
  }
}

/* ══════════════════════════════════════════════════════════════════
   RENDER — 3.1 Short Sale Volume section
   Appended to #fund-short with sentinel .finra-ssv-section
   ══════════════════════════════════════════════════════════════════ */
function _renderSSVSection(sym, records) {
  const el = document.getElementById("fund-short");
  if (!el) return;
  el.querySelector(".finra-ssv-section")?.remove();

  const section = document.createElement("div");
  section.className = "finra-ssv-section";

  if (!records?.length) {
    section.innerHTML = `
      <div class="section-head finra-section-head" style="margin-top:10px">
        FINRA Daily Short Sale Volume
        <span class="finra-src-badge">FINRA RegSHO · No key</span>
      </div>
      <div class="no-data finra-no-data">
        // No RegSHO short sale volume data found for <strong>${_esc(sym)}</strong>
        for the last 5 trading days. Data is US-listed equities only.
        <br><a href="https://www.finra.org/finra-data/browse-catalog/short-sale-volume-data/daily-short-sale-volume-files"
               target="_blank" rel="noopener" style="color:var(--accent)">
          FINRA Short Sale Volume Files ↗</a>
      </div>`;
    el.appendChild(section);
    return;
  }

  const latest   = records[0];
  const prev     = records[1];
  const ratio    = latest.ratio;
  const prevRatio = prev?.ratio ?? null;
  const ratioChg  = (ratio != null && prevRatio != null) ? ratio - prevRatio : null;

  /* Ratio colour coding:
     > 55%  → elevated short-side pressure (amber)
     > 65%  → high short-side pressure (red)
     < 35%  → below-average short pressure (green) */
  const ratioColor = ratio == null ? "var(--text-muted)"
    : ratio > 0.65 ? "#f85149"
    : ratio > 0.55 ? "#d29922"
    : ratio < 0.35 ? "#3fb950"
    : "var(--text)";

  /* 5-day sparkline of ratio */
  const ratioVals = records.map(r => r.ratio ?? 0).reverse();
  let spark = "";
  if (ratioVals.length >= 2) {
    const mn  = Math.min(...ratioVals) * 0.98;
    const mx  = Math.max(...ratioVals) * 1.02;
    const rng = mx - mn || 0.01;
    const pts = ratioVals.map((v, i) =>
      `${(i / (ratioVals.length - 1)) * 100},${18 - ((v - mn) / rng) * 16}`
    ).join(" ");
    spark = `<svg viewBox="0 0 100 20" class="finra-spark">
      <polyline points="${pts}" fill="none" stroke="${ratioColor}"
                stroke-width="2" stroke-linejoin="round"/>
    </svg>`;
  }

  /* History rows */
  const rows = records.map(r => {
    const rc = r.ratio;
    const rcColor = rc == null ? "" : rc > 0.65 ? "neg" : rc > 0.55 ? "warn" : rc < 0.35 ? "pos" : "";
    return `<tr>
      <td>${_esc(r.date)}</td>
      <td>${_fmt(r.shortVol)}</td>
      <td>${_fmt(r.totalVol)}</td>
      <td class="${rcColor}">${rc != null ? _pctFmt(rc) : "—"}</td>
      <td>${_fmt(r.exemptVol)}</td>
      <td>${_esc(r.market || "—")}</td>
    </tr>`;
  }).join("");

  section.innerHTML = `
    <div class="section-head finra-section-head" style="margin-top:10px">
      FINRA Daily Short Sale Volume
      <span class="finra-src-badge">FINRA RegSHO · No key</span>
    </div>
    <div class="finra-ssv-note">
      Daily short VOLUME (transactions) ≠ short INTEREST (open positions).
      A high ratio means short-sellers dominated trading that day —
      not necessarily that total short interest is rising.
    </div>

    <div class="finra-kpi-row">
      <div class="finra-kpi">
        <span class="finra-kpi-lbl">Short Sale Ratio</span>
        <span class="finra-kpi-val" style="color:${ratioColor}">
          ${ratio != null ? _pctFmt(ratio) : "—"}
        </span>
        ${ratioChg != null ? `<span class="finra-kpi-sub ${ratioChg > 0 ? "neg" : "pos"}">
          ${ratioChg > 0 ? "▲" : "▼"} ${_pctFmt(Math.abs(ratioChg))} vs prev day
        </span>` : ""}
      </div>
      <div class="finra-kpi">
        <span class="finra-kpi-lbl">Short Volume</span>
        <span class="finra-kpi-val">${_fmt(latest.shortVol)}</span>
        <span class="finra-kpi-sub">${_esc(latest.date)}</span>
      </div>
      <div class="finra-kpi">
        <span class="finra-kpi-lbl">Total Volume</span>
        <span class="finra-kpi-val">${_fmt(latest.totalVol)}</span>
        <span class="finra-kpi-sub">All markets consolidated</span>
      </div>
      <div class="finra-kpi finra-kpi-spark">
        <span class="finra-kpi-lbl">5-Day Ratio Trend</span>
        ${spark || '<span class="finra-kpi-sub">—</span>'}
      </div>
    </div>

    <div class="fin-table-wrap" style="margin-top:6px">
      <table class="fin-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Short Vol</th>
            <th>Total Vol</th>
            <th>Ratio</th>
            <th>Exempt Vol</th>
            <th>Market</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="finra-footer">
      Source: FINRA RegSHO Consolidated Short Sale Volume ·
      <a href="https://www.finra.org/finra-data/browse-catalog/short-sale-volume-data/daily-short-sale-volume-files"
         target="_blank" rel="noopener" class="finra-link">FINRA Data Portal ↗</a>
      · No API key required · Posted by 6pm ET
    </div>`;

  el.appendChild(section);
}

/* ══════════════════════════════════════════════════════════════════
   RENDER — 3.2 FINRA Equity Short Interest section
   Injected ABOVE Finnhub content as the authoritative primary source.
   Uses a sentinel .finra-si-section; replaces the Finnhub
   "● Short Interest · Finnhub" badge with a source comparison row.
   ══════════════════════════════════════════════════════════════════ */
function _renderSISection(sym, records) {
  const el = document.getElementById("fund-short");
  if (!el) return;
  el.querySelector(".finra-si-section")?.remove();

  const section = document.createElement("div");
  section.className = "finra-si-section";

  if (!records?.length) {
    section.innerHTML = `
      <div class="av-live-badge finra-primary-badge">
        ● FINRA Official Short Interest · ${_esc(sym)}
        <span class="finra-src-badge">FINRA · Twice-Monthly · No key</span>
      </div>
      <div class="finra-si-unavail">
        FINRA short interest not available for <strong>${_esc(sym)}</strong>.
        Common for non-US or OTC securities.
        Finnhub data (below) may still provide short interest for this symbol.
      </div>`;
    /* Prepend above Finnhub content */
    el.insertAdjacentElement("afterbegin", section);
    return;
  }

  const latest   = records[0];
  const prev     = records[1];
  const si       = latest.shortInterest;
  const prevSI   = prev?.shortInterest ?? null;
  const siChg    = (si && prevSI) ? si - prevSI : null;
  const siChgPct = (si && prevSI) ? (si - prevSI) / prevSI : null;
  const dtc      = latest.daysToCover || (latest.avgDailyShareVol > 0 ? si / latest.avgDailyShareVol : null);

  const siColor  = siChgPct == null ? "var(--text)"
    : siChgPct >  0.10 ? "#f85149"
    : siChgPct < -0.10 ? "#3fb950"
    : "var(--text)";

  /* Trend sparkline */
  const siVals = records.slice(0, 12).reverse().map(r => r.shortInterest || 0).filter(Boolean);
  let spark = "";
  if (siVals.length >= 3) {
    const mn  = Math.min(...siVals);
    const mx  = Math.max(...siVals);
    const rng = mx - mn || 1;
    const pts = siVals.map((v, i) =>
      `${(i / (siVals.length - 1)) * 120},${20 - ((v - mn) / rng) * 18}`
    ).join(" ");
    const lineColor = (siChgPct ?? 0) <= 0 ? "#3fb950" : "#f85149";
    spark = `<svg viewBox="0 0 120 22" class="si-spark">
      <polyline points="${pts}" fill="none" stroke="${lineColor}"
                stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`;
  }

  /* History rows — up to 12 settlement periods */
  const rows = records.slice(0, 12).map((r, i) => {
    const chg = i < records.length - 1
      ? r.shortInterest - records[i + 1].shortInterest : null;
    const chgCls = chg == null ? "" : chg > 0 ? "neg" : "pos";
    return `<tr>
      <td>${_esc(r.settlementDate)}</td>
      <td style="font-weight:600">${_fmt(r.shortInterest)}</td>
      <td class="${chgCls}">${chg != null ? (chg > 0 ? "▲ +" : "▼ ") + _fmt(Math.abs(chg)) : "—"}</td>
      <td>${r.daysToCover != null ? r.daysToCover.toFixed(2) : "—"}</td>
      <td>${_fmt(r.avgDailyShareVol)}</td>
    </tr>`;
  }).join("");

  section.innerHTML = `
    <div class="av-live-badge finra-primary-badge">
      ● FINRA Official Short Interest · ${_esc(sym)}
      <span class="finra-src-badge">FINRA · Twice-Monthly · No key</span>
    </div>
    <div class="finra-authoritative-note">
      Authoritative FINRA settlement-date short interest —
      the primary source from which broker-reported data (Finnhub, Bloomberg) is derived.
      Updated twice per month on FINRA settlement date cycles.
    </div>

    <div class="si-kpi-grid">
      <div class="si-kpi">
        <span class="si-kpi-lbl">Short Interest</span>
        <span class="si-kpi-val" style="color:${siColor}">${_fmt(si)}</span>
        ${siChgPct != null ? `<span class="si-kpi-chg ${siChgPct > 0 ? "neg" : "pos"}">
          ${siChgPct > 0 ? "▲ +" : "▼ "}${(Math.abs(siChgPct) * 100).toFixed(1)}% vs prior
        </span>` : ""}
      </div>
      <div class="si-kpi">
        <span class="si-kpi-lbl">Change (shares)</span>
        <span class="si-kpi-val ${siChg != null ? (siChg > 0 ? "neg" : "pos") : ""}">
          ${siChg != null ? (siChg > 0 ? "+" : "") + _fmt(siChg) : "—"}
        </span>
        ${prev ? `<span class="si-kpi-chg">vs ${_esc(prev.settlementDate)}</span>` : ""}
      </div>
      <div class="si-kpi">
        <span class="si-kpi-lbl">Days to Cover</span>
        <span class="si-kpi-val ${dtc != null && dtc > 5 ? "neg" : dtc != null && dtc < 2 ? "pos" : ""}">
          ${dtc != null ? dtc.toFixed(2) : "—"}
        </span>
        <span class="si-kpi-chg">Avg Daily Vol ${_fmt(latest.avgDailyShareVol)}</span>
      </div>
      <div class="si-kpi">
        <span class="si-kpi-lbl">Settlement Date</span>
        <span class="si-kpi-val" style="font-size:13px">${_esc(latest.settlementDate)}</span>
        <span class="si-kpi-chg">FINRA settlement cycle</span>
      </div>
    </div>

    <div class="si-spark-wrap">
      <span class="si-spark-lbl">Short Interest Trend (FINRA)</span>
      ${spark || '<span class="si-spark-na">Not enough history</span>'}
    </div>

    <div class="section-head" style="margin-top:8px">
      FINRA Settlement-Date History
    </div>
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead>
          <tr>
            <th>Settlement Date</th>
            <th>Short Interest</th>
            <th>Change</th>
            <th>Days to Cover</th>
            <th>Avg Daily Vol</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="finra-footer">
      Source: FINRA Equity Short Interest ·
      <a href="https://www.finra.org/filing-reporting/regulatory-filing-systems/short-interest"
         target="_blank" rel="noopener" class="finra-link">FINRA Short Interest Program ↗</a>
      · No API key required
    </div>
    <div class="finra-divider"></div>`;

  /* Prepend above Finnhub content */
  el.insertAdjacentElement("afterbegin", section);
}

/* ══════════════════════════════════════════════════════════════════
   PUBLIC API — main entry point called externally and by patch
   ══════════════════════════════════════════════════════════════════ */
window.finraLoadForSym = async function finraLoadForSym(sym) {
  if (!sym) return;
  sym = sym.replace(/.*:/, "").toUpperCase();

  /* Run both fetches in parallel — neither blocks the other */
  const [ssvRecords, siRecords] = await Promise.allSettled([
    finraGetSSV(sym),
    finraGetShortInterest(sym),
  ]);

  /* Render FINRA SI first (prepended = appears at top of panel) */
  _renderSISection(sym, siRecords.status === "fulfilled" ? siRecords.value : []);

  /* Render FINRA SSV second (appended = appears at bottom) */
  _renderSSVSection(sym, ssvRecords.status === "fulfilled" ? ssvRecords.value : []);
};

/* ══════════════════════════════════════════════════════════════════
   PATCH — extend fhLoadShortInterest to also trigger FINRA data
   Runs after the existing Finnhub render completes.
   Uses a post-render setTimeout so FINRA doesn't race Finnhub.
   ══════════════════════════════════════════════════════════════════ */
function _patchShortInterest() {
  if (window._finraPatched) return;
  if (typeof fhLoadShortInterest !== "function") return;
  window._finraPatched = true;

  const _orig = fhLoadShortInterest;
  window.fhLoadShortInterest = async function fhLoadShortInterest(sym) {
    /* Run Finnhub first */
    await _orig.call(this, sym);
    /* Then enrich with FINRA data (non-blocking, fires after Finnhub renders) */
    setTimeout(() => finraLoadForSym(sym), 200);
  };
}

/* ══════════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {

  /* Patch as soon as finterm-extras.js has loaded fhLoadShortInterest */
  _patchShortInterest();
  /* Secondary attempt in case finterm-extras.js loads after us */
  setTimeout(_patchShortInterest, 800);

  /* Register in KNOWN_PROVIDERS */
  if (Array.isArray(window.KNOWN_PROVIDERS)) {
    if (!window.KNOWN_PROVIDERS.find(p => p.id === "finra")) {
      window.KNOWN_PROVIDERS.push({
        id:         "finra",
        name:       "FINRA Market Data",
        badge:      "FNR",
        group:      "Market Data",
        desc:       "FINRA Daily Short Sale Volume (RegSHO consolidated, posted by 6pm ET) and FINRA Equity Short Interest (authoritative twice-monthly settlement data). Both appended to Fundamentals → SHORT tab. No API key required.",
        limit:      "Unlimited (no API key required)",
        docsUrl:    "https://www.finra.org/finra-data/browse-catalog/short-sale-volume-data",
        sessionKey: SESSION_KEY,
        limitWarn:  null,
        limitMax:   null,
      });
    }
    if (typeof renderTopbarBadges === "function") renderTopbarBadges();
  }

  /* If SHORT tab is already open on page load, enrich immediately */
  setTimeout(() => {
    const shortEl = document.getElementById("fund-short");
    if (shortEl?.innerHTML?.includes("Finnhub")) {
      const sym = (typeof currentTicker !== "undefined")
        ? currentTicker.replace(/.*:/, "").toUpperCase()
        : "AAPL";
      finraLoadForSym(sym);
    }
  }, 1500);
});

})();
