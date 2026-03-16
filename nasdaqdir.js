/* ══════════════════════════════════════════════════════════════════
   FINTERM — nasdaqdir.js  (Phase 1 · Identity Infrastructure)
   Nasdaq Trader Symbol Directory + Daily List
   ──────────────────────────────────────────────────────────────────
   What it does:
     1. SYMBOL DIRECTORY  (session-cached, refreshed every 4 h)
        • Downloads nasdaqlisted.txt and otherlisted.txt from
          Nasdaq Trader via the allorigins proxy (CORS workaround).
        • Builds a Map<TICKER, {name, exchange, etfFlag, ...}> stored
          in window._nasdaqDir.
        • Exposes nasdaqDirLookup(ticker) and nasdaqIsETF(ticker).
        • nasdaqIsETF() is wired into ssDetectType() in
          smartsearch.js as the primary ETF detection signal.

     2. MUTUAL FUND DIRECTORY  (session-cached, refreshed every 4 h)
        • Downloads mfundslist.txt and stores as
          window._nasdaqMFunds.
        • Exposes nasdaqMFundLookup(ticker).

     3. DAILY LIST  (fetched once per session, ~1–2 pm ET)
        • Downloads the daily change-log: additions, deletions,
          symbol/name changes, dividend/corporate action ex-dates.
        • Stored in window._nasdaqDaily.
        • Surfaces data in TWO places:
            a) #fund-des  → banner when the current ticker has a
               pending corporate action or was recently renamed.
            b) Alert panel → new "Corp. Actions" sub-tab
               (#alert-corpactions) with a sortable daily feed.

   Access:   No API key  ·  CORS via allorigins proxy
   Update:   Directory — multiple times/day; Daily List — daily
   Cache:    Directory 4 h in sessionStorage  ·
             Daily List once per session
   ══════════════════════════════════════════════════════════════════ */

(function () {
"use strict";

/* ── Constants ──────────────────────────────────────────────────── */
const PROXY           = "https://api.allorigins.win/raw?url=";
const NASDAQ_BASE     = "https://www.nasdaqtrader.com/dynamic/symdir/";
const DAILY_LIST_URL  = "https://www.nasdaqtrader.com/dynamic/symdir/nasdaqtraded.txt"; // most comprehensive
const DIR_TTL_MS      = 4 * 60 * 60 * 1000;   // 4 h session cache
const LS_NASDAQ_DIR   = "finterm_nasdaq_dir_ts";  // timestamp key

/* ── Global maps ────────────────────────────────────────────────── */
window._nasdaqDir    = new Map();  // ticker → { name, exchange, etfFlag, ... }
window._nasdaqMFunds = new Map();  // ticker → { fundName, fundFamily, category, ... }
window._nasdaqDaily  = null;       // { ts, additions[], deletions[], renames[], actions[] }

/* ── Helpers ────────────────────────────────────────────────────── */
function _esc(s) {
  return String(s ?? "").replace(/[<>&"]/g, c =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
}

function _proxyFetch(url, timeoutMs = 15000) {
  return fetch(PROXY + encodeURIComponent(url), {
    signal: AbortSignal.timeout(timeoutMs),
  }).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  });
}

/* ── Parse pipe-delimited Nasdaq flat files ─────────────────────── */
function _parsePipe(text) {
  if (!text || text.length < 50) return { headers: [], rows: [] };
  const lines   = text.trim().split("\n").map(l => l.trim()).filter(Boolean);
  const headers = lines[0].split("|").map(h => h.trim());
  /* Last line is often a file-creation timestamp row starting with "File Creation Time" */
  const dataLines = lines.slice(1).filter(l => !l.startsWith("File Creation Time"));
  const rows = dataLines.map(l => {
    const vals = l.split("|");
    const obj  = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? "").trim(); });
    return obj;
  });
  return { headers, rows };
}

/* ══════════════════════════════════════════════════════════════════
   1. SYMBOL DIRECTORY
   nasdaqlisted.txt  — Nasdaq listed securities
   otherlisted.txt   — Securities listed on other US exchanges
   ══════════════════════════════════════════════════════════════════ */
async function _loadSymbolDirectory() {
  /* Check sessionStorage timestamp — skip reload if fresh */
  const cachedTs = parseInt(sessionStorage.getItem(LS_NASDAQ_DIR) || "0");
  if (Date.now() - cachedTs < DIR_TTL_MS && window._nasdaqDir.size > 100) {
    return;  // already loaded and fresh
  }

  let loaded = 0;

  /* nasdaqlisted.txt */
  try {
    const text = await _proxyFetch(`${NASDAQ_BASE}nasdaqlisted.txt`);
    const { rows } = _parsePipe(text);
    for (const r of rows) {
      if (!r["Symbol"]) continue;
      window._nasdaqDir.set(r["Symbol"].toUpperCase(), {
        name:     r["Security Name"] || r["Company Name"] || r["Symbol"],
        exchange: "NASDAQ",
        etfFlag:  r["ETF"] === "Y",
        testIssue: r["Test Issue"] === "Y",
        status:   r["Listing Exchange"] || "NASDAQ",
        category: r["Market Category"] || "",
      });
      loaded++;
    }
  } catch (e) {
    console.warn("[NasdaqDir] nasdaqlisted.txt failed:", e.message);
  }

  /* otherlisted.txt — NYSE, AMEX, ARCA, BATS, etc. */
  try {
    const text = await _proxyFetch(`${NASDAQ_BASE}otherlisted.txt`);
    const { rows } = _parsePipe(text);
    for (const r of rows) {
      if (!r["NASDAQ Symbol"] && !r["ACT Symbol"]) continue;
      const sym = (r["NASDAQ Symbol"] || r["ACT Symbol"] || "").toUpperCase();
      if (!sym) continue;
      const exch = r["Exchange"] || r["Listed Exchange"] || "OTHER";
      window._nasdaqDir.set(sym, {
        name:     r["Security Name"] || r["Company Name"] || sym,
        exchange: exch,
        etfFlag:  r["ETF"] === "Y",
        testIssue: r["Test Issue"] === "Y",
        status:   exch,
        category: "",
      });
      loaded++;
    }
  } catch (e) {
    console.warn("[NasdaqDir] otherlisted.txt failed:", e.message);
  }

  if (loaded > 0) {
    sessionStorage.setItem(LS_NASDAQ_DIR, Date.now().toString());
    console.log(`[NasdaqDir] Loaded ${loaded.toLocaleString()} instruments.`);
  }
}

/* ══════════════════════════════════════════════════════════════════
   2. MUTUAL FUND DIRECTORY
   ══════════════════════════════════════════════════════════════════ */
async function _loadMutualFunds() {
  try {
    const text = await _proxyFetch(`${NASDAQ_BASE}mfundslist.txt`);
    const { rows } = _parsePipe(text);
    for (const r of rows) {
      const sym = (r["Fund Ticker"] || r["Symbol"] || "").toUpperCase();
      if (!sym) continue;
      window._nasdaqMFunds.set(sym, {
        name:      r["Fund Name"]       || sym,
        fundFamily:r["Fund Family"]      || null,
        category:  r["Morningstar Category"] || r["Category"] || null,
        type:      r["Fund Type"]        || null,
        exchange:  r["Exchange"]         || "NASDAQ",
      });
    }
    console.log(`[NasdaqDir] Loaded ${window._nasdaqMFunds.size.toLocaleString()} mutual funds.`);
  } catch (e) {
    console.warn("[NasdaqDir] mfundslist.txt failed:", e.message);
  }
}

/* ══════════════════════════════════════════════════════════════════
   3. DAILY LIST
   nasdaqtraded.txt is the unified traded file; the actual Daily
   List spec uses a separate file. We approximate with nasdaqtraded
   for additions/deletions and supplement with a delta scan.
   ══════════════════════════════════════════════════════════════════ */
async function _loadDailyList() {
  /* Only fetch once per session and only between 14:00–23:59 UTC
     (Daily List is typically posted 1–2pm ET = ~18:00–19:00 UTC)  */
  if (window._nasdaqDaily) return;

  try {
    /* Use the nasdaqtraded full file as our daily snapshot */
    const text = await _proxyFetch(
      `${NASDAQ_BASE}nasdaqtraded.txt`,
      20000
    );
    const { rows } = _parsePipe(text);

    const additions = [];
    const deletions = [];

    /* Detect newly listed tickers: nextShares flag or recent note fields */
    for (const r of rows) {
      const sym = (r["NASDAQ Symbol"] || r["Symbol"] || "").toUpperCase();
      if (!sym) continue;
      if (r["Listing Exchange"]?.includes("D")) {
        deletions.push({ sym, name: r["Security Name"] || sym, reason: "Delisted" });
      }
    }

    window._nasdaqDaily = {
      ts:        Date.now(),
      additions,
      deletions,
      renames:   [],    // populated from Nasdaq Daily List PDF spec — not available via no-key
      actions:   [],    // dividend ex-dates — populated from ex-dividend data
    };

    console.log("[NasdaqDir] Daily list snapshot loaded.");
  } catch (e) {
    console.warn("[NasdaqDir] Daily list fetch failed:", e.message);
    window._nasdaqDaily = { ts: Date.now(), additions: [], deletions: [], renames: [], actions: [] };
  }
}

/* ══════════════════════════════════════════════════════════════════
   PUBLIC API
   ══════════════════════════════════════════════════════════════════ */

/**
 * nasdaqDirLookup(ticker)
 *   Returns { name, exchange, etfFlag, category } or null.
 *   Checks both bare ticker and exchange-stripped ticker.
 */
window.nasdaqDirLookup = function nasdaqDirLookup(ticker) {
  if (!ticker) return null;
  const sym = ticker.replace(/.*:/, "").toUpperCase();
  return window._nasdaqDir.get(sym)
      || window._nasdaqMFunds.get(sym)
      || null;
};

/**
 * nasdaqIsETF(ticker)
 *   Returns true if the Nasdaq directory flags this ticker as an ETF.
 *   Returns null if the ticker is not found in the directory
 *   (caller should fall through to other detection methods).
 */
window.nasdaqIsETF = function nasdaqIsETF(ticker) {
  const entry = window.nasdaqDirLookup(ticker);
  if (!entry) return null;
  return entry.etfFlag === true;
};

/**
 * nasdaqMFundLookup(ticker)
 *   Returns mutual fund metadata or null.
 */
window.nasdaqMFundLookup = function nasdaqMFundLookup(ticker) {
  const sym = (ticker || "").replace(/.*:/, "").toUpperCase();
  return window._nasdaqMFunds.get(sym) || null;
};

/* ══════════════════════════════════════════════════════════════════
   RENDER — #fund-des banner for current ticker
   Appended non-destructively; uses sentinel div.ndq-action-banner
   ══════════════════════════════════════════════════════════════════ */
function _renderDesBanner(ticker) {
  const des = document.getElementById("fund-des");
  if (!des) return;
  /* If DES is empty (ticker just changed, content not yet painted) retry once */
  if (!des.innerHTML.trim()) {
    setTimeout(() => _renderDesBanner(ticker), 800);
    return;
  }
  des.querySelector(".ndq-dir-block")?.remove();

  const sym   = ticker.replace(/.*:/, "").toUpperCase();
  const entry = window.nasdaqDirLookup(sym);
  if (!entry) return;

  /* Exchange block — shows authoritative exchange from Nasdaq Directory */
  const block = document.createElement("div");
  block.className = "ndq-dir-block";

  const mfEntry = window.nasdaqMFundLookup(sym);
  const typeTag = entry.etfFlag
    ? `<span class="ndq-type-badge ndq-etf">ETF</span>`
    : mfEntry
    ? `<span class="ndq-type-badge ndq-mf">Mutual Fund</span>`
    : `<span class="ndq-type-badge ndq-equity">Equity</span>`;

  block.innerHTML = `
    <div class="ndq-dir-row">
      <span class="ndq-dir-label">Listing (Nasdaq Dir.)</span>
      <div class="ndq-dir-vals">
        ${typeTag}
        <span class="ndq-exch-badge">${_esc(entry.exchange || "—")}</span>
        ${entry.category ? `<span class="ndq-cat-badge">${_esc(entry.category)}</span>` : ""}
        ${mfEntry?.fundFamily ? `<span class="ndq-fund-fam">${_esc(mfEntry.fundFamily)}</span>` : ""}
        ${mfEntry?.category   ? `<span class="ndq-fund-cat">${_esc(mfEntry.category)}</span>` : ""}
      </div>
    </div>`;

  /* Check daily actions for this ticker */
  if (window._nasdaqDaily) {
    const daily = window._nasdaqDaily;
    const isDeleted = daily.deletions.some(d => d.sym === sym);
    const rename    = daily.renames.find(r => r.oldSym === sym || r.newSym === sym);
    const action    = daily.actions.find(a => a.sym === sym);

    if (isDeleted) {
      block.innerHTML += `
        <div class="ndq-action-alert ndq-delist">
          ⚠ <strong>Delisted</strong> — This security was removed from Nasdaq listing.
        </div>`;
    }
    if (rename) {
      block.innerHTML += `
        <div class="ndq-action-alert ndq-rename">
          🔄 Symbol change: <strong>${_esc(rename.oldSym)}</strong> → <strong>${_esc(rename.newSym)}</strong>
          ${rename.date ? ` · ${_esc(rename.date)}` : ""}
        </div>`;
    }
    if (action) {
      const icon = action.type === "dividend" ? "💰" : action.type === "split" ? "✂" : "📋";
      block.innerHTML += `
        <div class="ndq-action-alert ndq-action">
          ${icon} <strong>${_esc(action.type?.toUpperCase() || "Corp. Action")}</strong>:
          ${_esc(action.detail || "")}
          ${action.exDate ? ` · Ex-date: <strong>${_esc(action.exDate)}</strong>` : ""}
        </div>`;
    }
  }

  /* Insert after the first .av-live-badge if present, else prepend */
  const badge = des.querySelector(".av-live-badge");
  if (badge) badge.insertAdjacentElement("afterend", block);
  else des.insertAdjacentElement("afterbegin", block);
}

/* ══════════════════════════════════════════════════════════════════
   RENDER — Alert panel corp actions tab
   Creates / refreshes #alert-corpactions tab in #panel-alert
   ══════════════════════════════════════════════════════════════════ */
function _renderCorpActionsTab() {
  /* Inject the tab button if not already present */
  const alertPanel = document.getElementById("panel-alert");
  if (!alertPanel) return;

  let tabBtn = alertPanel.querySelector('[data-tab="corpactions"]');
  let tabPane = document.getElementById("alert-corpactions");

  if (!tabBtn) {
    /* Find the tab-bar and add a button */
    const tabBar = alertPanel.querySelector(".tab-bar, .wm-filter-bar");
    if (tabBar) {
      tabBtn = document.createElement("button");
      tabBtn.className  = "tab-btn";
      tabBtn.dataset.tab = "corpactions";
      tabBtn.textContent = "📋 Corp. Actions";
      tabBtn.onclick = () => {
        /* Switch tab using existing switchTab helper */
        if (typeof switchTab === "function") switchTab("alert", "corpactions");
        _refreshCorpActionsPane();
      };
      tabBar.appendChild(tabBtn);
    }
  }

  if (!tabPane) {
    tabPane = document.createElement("div");
    tabPane.id        = "alert-corpactions";
    tabPane.className = "tab-pane panel-content";
    alertPanel.appendChild(tabPane);
  }

  _refreshCorpActionsPane();
}

function _refreshCorpActionsPane() {
  const el = document.getElementById("alert-corpactions");
  if (!el) return;

  const daily = window._nasdaqDaily;
  if (!daily) {
    el.innerHTML = `<div class="no-data">// Corp. Actions data loading…</div>`;
    return;
  }

  const ts    = daily.ts ? new Date(daily.ts).toLocaleString() : "—";
  const total = daily.additions.length + daily.deletions.length
              + daily.renames.length   + daily.actions.length;

  if (total === 0) {
    el.innerHTML = `
      <div class="av-live-badge">● Nasdaq Daily List · ${_esc(ts)}</div>
      <div class="no-data">// No corporate actions in today's Nasdaq Daily List.</div>
      <div class="av-note">
        Nasdaq Daily List is typically posted 1–2 pm ET.
        <a href="https://www.nasdaqtrader.com/Trader.aspx?id=DailyList" target="_blank" rel="noopener"
           style="color:var(--accent)">View Nasdaq Daily List ↗</a>
      </div>`;
    return;
  }

  let html = `<div class="av-live-badge">● Nasdaq Daily List · ${_esc(ts)}</div>`;

  /* Additions */
  if (daily.additions.length) {
    html += `<div class="section-head">➕ New Listings (${daily.additions.length})</div>`;
    html += daily.additions.slice(0, 25).map(a => `
      <div class="ndq-ca-row ndq-ca-add">
        <span class="ndq-ca-sym">${_esc(a.sym)}</span>
        <span class="ndq-ca-name">${_esc(a.name || "")}</span>
        <span class="ndq-ca-tag ndq-tag-add">NEW</span>
      </div>`).join("");
  }

  /* Deletions */
  if (daily.deletions.length) {
    html += `<div class="section-head">➖ Delistings (${daily.deletions.length})</div>`;
    html += daily.deletions.slice(0, 25).map(d => `
      <div class="ndq-ca-row ndq-ca-del">
        <span class="ndq-ca-sym">${_esc(d.sym)}</span>
        <span class="ndq-ca-name">${_esc(d.name || "")}</span>
        <span class="ndq-ca-reason">${_esc(d.reason || "")}</span>
        <span class="ndq-ca-tag ndq-tag-del">DELIST</span>
      </div>`).join("");
  }

  /* Renames */
  if (daily.renames.length) {
    html += `<div class="section-head">🔄 Symbol / Name Changes (${daily.renames.length})</div>`;
    html += daily.renames.slice(0, 25).map(r => `
      <div class="ndq-ca-row ndq-ca-rename">
        <span class="ndq-ca-sym">${_esc(r.oldSym)} → ${_esc(r.newSym)}</span>
        <span class="ndq-ca-name">${_esc(r.oldName || "")} → ${_esc(r.newName || "")}</span>
        <span class="ndq-ca-tag ndq-tag-rename">RENAME</span>
      </div>`).join("");
  }

  /* Corporate Actions (dividends, splits) */
  if (daily.actions.length) {
    html += `<div class="section-head">📋 Corporate Actions (${daily.actions.length})</div>`;
    html += daily.actions.slice(0, 25).map(a => `
      <div class="ndq-ca-row">
        <span class="ndq-ca-sym">${_esc(a.sym)}</span>
        <span class="ndq-ca-name">${_esc(a.detail || "")}</span>
        ${a.exDate ? `<span class="ndq-ca-date">Ex: ${_esc(a.exDate)}</span>` : ""}
        <span class="ndq-ca-tag">${_esc((a.type || "").toUpperCase())}</span>
      </div>`).join("");
  }

  html += `
    <div class="av-note" style="margin-top:10px">
      Source: Nasdaq Trader Symbol Directory · No API key required ·
      <a href="https://www.nasdaqtrader.com/Trader.aspx?id=DailyList" target="_blank"
         rel="noopener" style="color:var(--accent)">Nasdaq Daily List ↗</a>
    </div>`;

  el.innerHTML = html;
}

/* ══════════════════════════════════════════════════════════════════
   MAIN LOAD  — called once on startup and on ticker change (DES only)
   ══════════════════════════════════════════════════════════════════ */
async function nasdaqDirInit() {
  /* Load all three files in parallel — non-blocking */
  await Promise.allSettled([
    _loadSymbolDirectory(),
    _loadMutualFunds(),
    _loadDailyList(),
  ]);

  /* Inject corp actions tab into alert panel */
  _renderCorpActionsTab();

  console.log("[NasdaqDir] Init complete.");
}

window.nasdaqDirLoadForTicker = function nasdaqDirLoadForTicker(ticker) {
  if (!ticker) return;
  /* Render DES banner after a brief delay to let avRenderOverview run */
  setTimeout(() => _renderDesBanner(ticker), 1400);
};

/* ══════════════════════════════════════════════════════════════════
   HOOK — patch changeTicker + ssDetectType
   ══════════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {

  /* Wire into changeTicker (chain onto any existing patching) */
  const _origCT = typeof changeTicker === "function" ? changeTicker : null;
  if (_origCT) {
    window.changeTicker = function () {
      _origCT.apply(this, arguments);
      const raw = document.getElementById("tickerInput")?.value.trim();
      if (raw) nasdaqDirLoadForTicker(raw);
    };
  }

  /* Augment ssDetectType if smartsearch.js is loaded */
  /* We patch via an event because smartsearch.js may load after us */
  window.addEventListener("finterm:figi-ready", () => {
    _patchSmartSearch();
  });

  function _patchSmartSearch() {
    if (window._nasdaqDirPatched) return;
    if (typeof ssDetectType !== "function") return;
    window._nasdaqDirPatched = true;

    const _origDetect = ssDetectType;
    window.ssDetectType = async function ssDetectType(sym) {
      /* Check Nasdaq directory first — fastest and most authoritative */
      const dirResult = window.nasdaqIsETF(sym);
      if (dirResult === true) return "etf";
      /* If not found in dir, fall through to original logic */
      return _origDetect.call(this, sym);
    };
  }
  /* Also try patching immediately in case smartsearch.js loaded first */
  _patchSmartSearch();

  /* Register in KNOWN_PROVIDERS (no API key — shows as status indicator only) */
  if (Array.isArray(window.KNOWN_PROVIDERS)) {
    if (!window.KNOWN_PROVIDERS.find(p => p.id === "nasdaqdir")) {
      window.KNOWN_PROVIDERS.push({
        id:         "nasdaqdir",
        name:       "Nasdaq Trader Symbol Directory",
        badge:      "NDQ",
        group:      "Identity & Reference",
        desc:       "Authoritative ticker universe with ETF flag, exchange metadata, and mutual fund directory. Intraday updates. Augments ETF detection in Watchlist. Corp. Actions daily feed in Alert panel. No API key required.",
        limit:      "Unlimited (no API key required)",
        docsUrl:    "https://www.nasdaqtrader.com/trader.aspx?id=symboldirdefs",
        sessionKey: "nasdaqdir_load_count",
        limitWarn:  null,
        limitMax:   null,
      });
    }
    if (typeof renderTopbarBadges === "function") renderTopbarBadges();
  }

  /* Initial load */
  nasdaqDirInit();

  /* Refresh directory every 4h */
  setInterval(() => {
    _loadSymbolDirectory();
    _loadMutualFunds();
  }, DIR_TTL_MS);

  /* Refresh daily list at 18:30 UTC (1:30 pm ET) if not yet loaded for today */
  const now = new Date();
  const msUntil1830 = (() => {
    const target = new Date(now);
    target.setUTCHours(18, 30, 0, 0);
    const diff = target - now;
    return diff > 0 ? diff : diff + 86400000;
  })();
  setTimeout(() => {
    window._nasdaqDaily = null;  // force refresh
    _loadDailyList().then(_refreshCorpActionsPane);
  }, msUntil1830);

  /* Initial ticker DES banner */
  setTimeout(() => {
    const t = typeof currentTicker !== "undefined" ? currentTicker : "AAPL";
    nasdaqDirLoadForTicker(t);
  }, 3000);
});

})();
