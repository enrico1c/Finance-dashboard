/* ══════════════════════════════════════════════════════════════════
   FINTERM — gleif.js  (Phase 1 · Identity Infrastructure)
   GLEIF — Global Legal Entity Identifier Foundation
   ──────────────────────────────────────────────────────────────────
   What it does:
     • Looks up the LEI record for the current company using the
       GLEIF REST API (no API key, CC0 data).
     • Resolves via: FIGI-supplied ISIN → GLEIF  OR  company name
       fuzzy search  OR  ticker-based keyword search.
     • Stores the full LEI record in window._currentLEI.
     • Injects a "Global Identity (GLEIF)" section into #fund-des
       showing: LEI code, full legal name, jurisdiction, registered
       address, entity status, and entity category.
     • Injects a "Corporate Structure" section into #own-mgmt
       showing the direct parent and ultimate parent chain from
       GLEIF relationship data (where reported).

   Access:   No API key  ·  CC0 license
   Endpoint: https://api.gleif.org/api/v1/
   Update:   Up to 10 times per day
   Cache:    24 h per ticker (entity identity changes rarely)

   Dependency: fires after openfigi.js emits "finterm:figi-ready"
               event (ISIN is used for precise lookup).
               Falls back to name search if FIGI/ISIN not available.
   ══════════════════════════════════════════════════════════════════ */

(function () {
"use strict";

/* ── Constants ──────────────────────────────────────────────────── */
const GLEIF_API      = "https://api.gleif.org/api/v1";
const GLEIF_TTL      = 24 * 60 * 60 * 1000;  // 24 h
const _GLEIF_SESSION_KEY = "gleif_call_count";

/* ── In-memory cache: ticker → LEI result ───────────────────────── */
const _GL_CACHE = {};

/* ── Global state ───────────────────────────────────────────────── */
window._currentLEI = null;

/* ── Helpers ────────────────────────────────────────────────────── */
function _esc(s) {
  return String(s ?? "").replace(/[<>&"]/g, c =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
}
function _inc() {
  const n = parseInt(sessionStorage.getItem(_GLEIF_SESSION_KEY) || "0") + 1;
  sessionStorage.setItem(_GLEIF_SESSION_KEY, n);
  if (typeof renderTopbarBadges === "function") renderTopbarBadges();
  return n;
}
const _CACHE_MISS = Symbol("miss");
function _cacheGet(k) {
  const e = _GL_CACHE[k];
  if (!e || Date.now() - e.ts >= GLEIF_TTL) return _CACHE_MISS;
  return e.data; // may legitimately be null (entity not found, cached)
}
function _cacheSet(k, d) { _GL_CACHE[k] = { data: d, ts: Date.now() }; }

/* ── Generic GLEIF REST fetch ───────────────────────────────────── */
async function _gleifFetch(path) {
  try {
    const res = await fetch(`${GLEIF_API}${path}`, {
      headers: { "Accept": "application/vnd.api+json" },
      signal:  AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _inc();
    return await res.json();
  } catch (e) {
    console.warn("[GLEIF]", path, e.message);
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════════
   LOOKUP STRATEGIES (tried in order)
   ══════════════════════════════════════════════════════════════════ */

/** Strategy A: ISIN → LEI (most precise) */
async function _lookupByISIN(isin) {
  if (!isin) return null;
  const data = await _gleifFetch(`/lei-records?filter[isin]=${encodeURIComponent(isin)}&page[size]=1`);
  return data?.data?.[0] || null;
}

/** Strategy B: Company name fuzzy search */
async function _lookupByName(name) {
  if (!name || name.length < 3) return null;
  /* Use first 30 chars to keep query tight */
  const q = encodeURIComponent(name.slice(0, 30).trim());
  const data = await _gleifFetch(`/lei-records?filter[entity.legalName]=${q}&page[size]=5`);
  const results = data?.data || [];
  /* Prefer an ACTIVE entity */
  return results.find(r => r.attributes?.entity?.status === "ACTIVE") || results[0] || null;
}

/** Strategy C: Ticker-derived name search (fallback) */
async function _lookupByTicker(sym) {
  /* Try exact name from avGetLive if available */
  const liveData = (typeof avGetLive === "function") ? avGetLive(sym) : null;
  const companyName = liveData?.overview?.name || null;
  if (companyName) return _lookupByName(companyName);

  /* Try Nasdaq directory */
  const dirEntry = (typeof nasdaqDirLookup === "function") ? nasdaqDirLookup(sym) : null;
  if (dirEntry?.name) return _lookupByName(dirEntry.name);

  return null;
}

/* ── Fetch parent chain via GLEIF relationships endpoints ─────────── */
async function _fetchRelationships(lei) {
  if (!lei) return { directParent: null, ultimateParent: null };
  try {
    /* GLEIF v1 relationship endpoints return a JSON:API document.
       The relationship data contains the parent LEI under
       data.relationships.lei-records.data[0].id, but a simpler path
       is to use the convenience filter on lei-records itself:
       /lei-records?filter[entity.registeredAs]=<lei> won't work —
       correct approach is direct-parent-relationship endpoint which
       returns a list of LEI records for the parent.
       Endpoint: GET /lei-records/{lei}/direct-parent-relationship → {data: [...]}
       Falls back gracefully to null if parent not reported. */
    const dpRel = await _gleifFetch(
      `/lei-records?filter[directChildLei]=${encodeURIComponent(lei)}&page[size]=1`
    );
    const dp = dpRel?.data?.[0] || null;

    let up = null;
    if (dp) {
      /* Ultimate parent: entity that has no further parent */
      const upRel = await _gleifFetch(
        `/lei-records?filter[ultimateChildLei]=${encodeURIComponent(lei)}&page[size]=1`
      );
      up = upRel?.data?.[0] || null;
    }

    return { directParent: dp, ultimateParent: up };
  } catch {
    return { directParent: null, ultimateParent: null };
  }
}

/* ══════════════════════════════════════════════════════════════════
   NORMALIZE — extract useful fields from raw GLEIF record
   ══════════════════════════════════════════════════════════════════ */
function _normalize(raw) {
  if (!raw) return null;
  const a  = raw.attributes || {};
  const e  = a.entity       || {};
  const ra = e.registeredAddress || {};
  const hq = e.headquartersAddress || {};
  const reg = e.registration || {};

  return {
    lei:            raw.id                      || a.lei || null,
    legalName:      e.legalName?.name           || null,
    status:         e.status                    || null,
    category:       e.category                  || null,
    jurisdiction:   e.jurisdiction              || null,
    legalForm:      e.legalForm?.id             || null,
    regAddress: {
      street:  (ra.addressLines || []).join(", ") || null,
      city:    ra.city          || null,
      region:  ra.region        || null,
      postal:  ra.postalCode    || null,
      country: ra.country       || null,
    },
    hqAddress: {
      street:  (hq.addressLines || []).join(", ") || null,
      city:    hq.city          || null,
      region:  hq.region        || null,
      postal:  hq.postalCode    || null,
      country: hq.country       || null,
    },
    initialRegistration: reg.initialRegistrationDate  || null,
    lastUpdate:          reg.lastUpdateDate           || null,
    nextRenewal:         reg.nextRenewalDate          || null,
    managingLOU:         a.managingLou                || null,
    gleifUrl: raw.id
      ? `https://search.gleif.org/#/record/${raw.id}`
      : null,
  };
}

function _normalizeParent(raw) {
  if (!raw) return null;
  const a = raw.attributes || {};
  const e = a.entity       || {};
  return {
    lei:       raw.id || a.lei || null,
    legalName: e.legalName?.name || null,
    status:    e.status          || null,
    jurisdiction: e.jurisdiction || null,
  };
}

/* ══════════════════════════════════════════════════════════════════
   PUBLIC API
   ══════════════════════════════════════════════════════════════════ */

/**
 * gleifGetLei(ticker)
 *   Returns normalized LEI object or null.
 *   Caches for 24 h.
 */
window.gleifGetLei = async function gleifGetLei(ticker) {
  const sym      = (ticker || "").replace(/.*:/, "").toUpperCase();
  const cacheKey = `gleif_${sym}`;
  const cached   = _cacheGet(cacheKey);
  if (cached !== _CACHE_MISS) return cached;

  /* Strategy A — use ISIN from current FIGI if available */
  let record = null;
  const figiData = window._currentFIGI;
  if (figiData?.isin) {
    record = await _lookupByISIN(figiData.isin);
  }

  /* Strategy B/C — name or ticker search */
  if (!record) record = await _lookupByTicker(sym);

  const result = _normalize(record);
  _cacheSet(cacheKey, result);
  return result;
};

/**
 * gleifGetParentChain(lei)
 *   Returns { directParent, ultimateParent } — both normalized or null.
 */
window.gleifGetParentChain = async function gleifGetParentChain(lei) {
  if (!lei) return { directParent: null, ultimateParent: null };
  const { directParent, ultimateParent } = await _fetchRelationships(lei);
  return {
    directParent:  _normalizeParent(directParent),
    ultimateParent: _normalizeParent(ultimateParent),
  };
};

/* ══════════════════════════════════════════════════════════════════
   RENDER — #fund-des "Global Identity" block
   ══════════════════════════════════════════════════════════════════ */
function _renderDesBlock(lei) {
  const des = document.getElementById("fund-des");
  if (!des) return;
  des.querySelector(".gleif-identity-block")?.remove();
  if (!lei) return;

  const addr = lei.hqAddress?.city
    ? [
        lei.hqAddress.city,
        lei.hqAddress.region,
        lei.hqAddress.country,
      ].filter(Boolean).join(", ")
    : [
        lei.regAddress.city,
        lei.regAddress.region,
        lei.regAddress.country,
      ].filter(Boolean).join(", ");

  const statusColor = lei.status === "ACTIVE"   ? "#3fb950"
                    : lei.status === "INACTIVE"  ? "#f85149"
                    : "#d29922";

  const block = document.createElement("div");
  block.className = "gleif-identity-block";
  block.innerHTML = `
    <div class="section-head gleif-head">
      Global Identity
      <span class="gleif-src-badge">GLEIF · CC0</span>
    </div>
    <div class="gleif-id-grid">
      ${lei.legalName ? `
        <div class="gleif-id-row">
          <span class="gleif-id-label">Legal Name</span>
          <span class="gleif-id-value">${_esc(lei.legalName)}</span>
        </div>` : ""}
      <div class="gleif-id-row">
        <span class="gleif-id-label">LEI</span>
        <span class="gleif-id-value">
          <code class="gleif-lei-code">${_esc(lei.lei || "—")}</code>
          ${lei.lei ? `<button class="gleif-copy-btn" onclick="navigator.clipboard.writeText('${_esc(lei.lei)}')" title="Copy LEI">⎘</button>` : ""}
        </span>
      </div>
      ${lei.jurisdiction ? `
        <div class="gleif-id-row">
          <span class="gleif-id-label">Jurisdiction</span>
          <span class="gleif-id-value">${_esc(lei.jurisdiction)}</span>
        </div>` : ""}
      ${lei.category ? `
        <div class="gleif-id-row">
          <span class="gleif-id-label">Entity Category</span>
          <span class="gleif-id-value">${_esc(lei.category)}</span>
        </div>` : ""}
      ${addr ? `
        <div class="gleif-id-row">
          <span class="gleif-id-label">HQ / Address</span>
          <span class="gleif-id-value">${_esc(addr)}</span>
        </div>` : ""}
      ${lei.status ? `
        <div class="gleif-id-row">
          <span class="gleif-id-label">Entity Status</span>
          <span class="gleif-id-value" style="color:${statusColor};font-weight:600">
            ${_esc(lei.status)}
          </span>
        </div>` : ""}
      ${lei.initialRegistration ? `
        <div class="gleif-id-row">
          <span class="gleif-id-label">LEI Registered</span>
          <span class="gleif-id-value">${_esc(lei.initialRegistration.slice(0, 10))}</span>
        </div>` : ""}
    </div>
    ${lei.gleifUrl ? `
      <div class="gleif-links">
        <a href="${_esc(lei.gleifUrl)}" target="_blank" rel="noopener" class="gleif-ext-link">
          ↗ GLEIF record
        </a>
        <a href="https://search.gleif.org/" target="_blank" rel="noopener" class="gleif-ext-link">
          ↗ Search GLEIF
        </a>
      </div>` : ""}`;

  /* Append to DES — after any OpenFIGI identifiers block */
  const figiBlock = des.querySelector(".of-identifiers-block");
  if (figiBlock) figiBlock.insertAdjacentElement("afterend", block);
  else des.appendChild(block);
}

/* ══════════════════════════════════════════════════════════════════
   RENDER — #own-mgmt "Corporate Structure" section
   ══════════════════════════════════════════════════════════════════ */
function _renderMgmtStructure(chain) {
  const mgmt = document.getElementById("own-mgmt");
  if (!mgmt) return;
  mgmt.querySelector(".gleif-structure-block")?.remove();

  if (!chain.directParent && !chain.ultimateParent) return;

  const block = document.createElement("div");
  block.className = "gleif-structure-block";

  const _parentCard = (label, p, icon) => {
    if (!p || !p.legalName) return "";
    const statusCls = p.status === "ACTIVE" ? "pos" : "neg";
    return `
      <div class="gleif-parent-card">
        <div class="gleif-parent-icon">${icon}</div>
        <div class="gleif-parent-body">
          <div class="gleif-parent-label">${_esc(label)}</div>
          <div class="gleif-parent-name">${_esc(p.legalName)}</div>
          <div class="gleif-parent-meta">
            ${p.jurisdiction ? `<span>${_esc(p.jurisdiction)}</span>` : ""}
            ${p.status ? `<span class="${statusCls}">${_esc(p.status)}</span>` : ""}
            ${p.lei ? `<code class="gleif-lei-code gleif-lei-sm">${_esc(p.lei)}</code>` : ""}
          </div>
        </div>
        ${p.lei ? `
          <a href="https://search.gleif.org/#/record/${_esc(p.lei)}"
             target="_blank" rel="noopener" class="gleif-ext-link">↗</a>` : ""}
      </div>`;
  };

  block.innerHTML = `
    <div class="section-head gleif-head">
      Corporate Structure
      <span class="gleif-src-badge">GLEIF · CC0</span>
    </div>
    <div class="gleif-chain">
      ${_parentCard("Direct Parent", chain.directParent, "🏢")}
      ${chain.ultimateParent && chain.ultimateParent.lei !== chain.directParent?.lei
        ? _parentCard("Ultimate Parent", chain.ultimateParent, "🌐")
        : ""}
    </div>
    <div class="av-note" style="margin-top:6px;font-size:9px">
      Ownership relationships as reported to GLEIF. Coverage varies by entity.
      <a href="https://www.gleif.org/en/lei-data/gleif-api" target="_blank" rel="noopener"
         style="color:var(--accent)">GLEIF API ↗</a>
    </div>`;

  /* Append after existing mgmt content */
  mgmt.appendChild(block);
}

/* ══════════════════════════════════════════════════════════════════
   MAIN ENTRY
   ══════════════════════════════════════════════════════════════════ */
window.gleifLoadForTicker = async function gleifLoadForTicker(ticker) {
  if (!ticker) return;
  window._currentLEI = null;

  /* Wait for FIGI to be available (adds ISIN for better lookup) */
  await new Promise(r => setTimeout(r, 1600));

  const lei = await gleifGetLei(ticker);
  window._currentLEI = lei;

  /* Render DES identity block */
  _renderDesBlock(lei);

  /* Fetch and render parent chain (parallel with DES render) */
  if (lei?.lei) {
    gleifGetParentChain(lei.lei).then(chain => _renderMgmtStructure(chain));
  }

  /* Notify other modules */
  window.dispatchEvent(new CustomEvent("finterm:lei-ready", {
    detail: { ticker, lei },
  }));
};

/* ══════════════════════════════════════════════════════════════════
   HOOK — fires after openfigi delivers FIGI (and ISIN)
   Also hooks changeTicker directly for redundancy.
   ══════════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {

  /* Primary trigger: listen for FIGI-ready event from openfigi.js */
  window.addEventListener("finterm:figi-ready", e => {
    const t = e.detail?.ticker;
    if (t) gleifLoadForTicker(t);
  });

  /* Fallback: patch changeTicker in case openfigi.js is not loaded */
  const _origCT = typeof changeTicker === "function" ? changeTicker : null;
  if (_origCT) {
    window.changeTicker = function () {
      _origCT.apply(this, arguments);
      /* Only fire if openfigi.js hasn't already scheduled this via event */
      const raw = document.getElementById("tickerInput")?.value.trim();
      if (raw && typeof openfigiLoadForTicker !== "function") {
        setTimeout(() => gleifLoadForTicker(raw), 1800);
      }
    };
  }

  /* Register in KNOWN_PROVIDERS */
  if (Array.isArray(window.KNOWN_PROVIDERS)) {
    if (!window.KNOWN_PROVIDERS.find(p => p.id === "gleif")) {
      window.KNOWN_PROVIDERS.push({
        id:         "gleif",
        name:       "GLEIF — Legal Entity Identifiers",
        badge:      "LEI",
        group:      "Identity & Reference",
        desc:       "Global LEI reference data: legal name, registered address, jurisdiction, entity status, parent/child relationships. CC0 license. Shown in Fundamentals → DES (Global Identity) and Ownership → MGMT (Corporate Structure).",
        limit:      "Unlimited (no API key required)",
        docsUrl:    "https://www.gleif.org/en/lei-data/gleif-api",
        sessionKey: SESSION_KEY,
        limitWarn:  null,
        limitMax:   null,
      });
    }
    if (typeof renderTopbarBadges === "function") renderTopbarBadges();
  }

  /* Initial load */
  setTimeout(() => {
    const t = typeof currentTicker !== "undefined" ? currentTicker : "AAPL";
    /* Only run if openfigi.js hasn't already triggered via figi-ready event */
    if (!window._currentFIGI) gleifLoadForTicker(t);
  }, 3000);
});

})();
