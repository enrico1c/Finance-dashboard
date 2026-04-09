/* ══════════════════════════════════════════════════════════════════
   FINTERM — companieshouse.js  (Phase 2 · Registry & Ownership)
   Companies House Public Data API  +  Open Ownership BODS
   ──────────────────────────────────────────────────────────────────
   2.1  COMPANIES HOUSE  (free API key required)
        Endpoint: https://api.company-information.service.gov.uk/
        Rate:     600 req / 5 min
        Triggers: ticker has LSE: prefix  OR  GLEIF identifies entity
                  as UK-registered  OR  user forces via CH button
        Populates:
          • #fund-des      → "UK Registry" block (number, status,
                             registered office, incorporation date,
                             SIC codes, accounts due)
          • #own-mgmt      → "UK Directors" section
          • #own-hds       → "PSC" tab pane (Persons with Significant
                             Control — UK beneficial ownership)

   2.2  OPEN OWNERSHIP BODS  (no API key, ODC-By attribution)
        Source:   https://bods-data.openownership.org/
        Triggers: any ticker; fetches available country datasets
                  then filters for the current company by name/number
        Populates:
          • #own-hds → "Beneficial Ownership (BODS)" section inside
                       the PSC tab pane

   ARCHITECTURE
     Both modules inject into the Ownership panel non-destructively.
     The PSC tab is added dynamically the first time a UK entity is
     detected; it persists until the next ticker change.
     BODS section is appended below the PSC content if data is found.
   ══════════════════════════════════════════════════════════════════ */

(function () {
"use strict";

/* ── Constants ──────────────────────────────────────────────────── */
const CH_BASE        = "https://api.company-information.service.gov.uk";
const CH_SESSION_KEY = "ch_call_count";
const CH_TTL         = 6 * 60 * 60 * 1000;   // 6 h
const BODS_BASE      = "https://bods-data.openownership.org";
const BODS_TTL       = 24 * 60 * 60 * 1000;  // 24 h

/* UK exchange prefixes that trigger Companies House lookup */
const UK_EXCHANGES = new Set(["LSE", "AIM", "AQSE", "NEX"]);

/* ── In-memory cache ────────────────────────────────────────────── */
const _CH_CACHE = {};
function _chCacheGet(k) {
  const e = _CH_CACHE[k];
  return (e && Date.now() - e.ts < CH_TTL) ? e.data : null;
}
function _chCacheSet(k, d) { _CH_CACHE[k] = { data: d, ts: Date.now() }; }

/* ── Helpers ────────────────────────────────────────────────────── */
function _esc(s) {
  return String(s ?? "").replace(/[<>&"]/g, c =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
}
function _chGetKey() {
  return (window._KEYS?.companieshouse)
      || localStorage.getItem("finterm_key_companieshouse")
      || "";
}
function _chInc() {
  const n = parseInt(sessionStorage.getItem(CH_SESSION_KEY) || "0") + 1;
  sessionStorage.setItem(CH_SESSION_KEY, n);
  if (typeof renderTopbarBadges === "function") renderTopbarBadges();
  return n;
}

/* ── Detect if ticker is UK-listed ─────────────────────────────── */
function _isUKTicker(ticker) {
  if (!ticker) return false;
  const raw = ticker.trim().toUpperCase();
  /* Exchange prefix present */
  if (raw.includes(":")) {
    const exch = raw.split(":")[0];
    return UK_EXCHANGES.has(exch);
  }
  /* GLEIF identified as UK */
  const lei = window._currentLEI;
  if (lei?.jurisdiction?.startsWith("GB")) return true;
  /* exchangeDB lookup */
  if (typeof exchangeDB !== "undefined") {
    const sym = raw.replace(/.*:/, "");
    return exchangeDB[sym] === "LSE";
  }
  return false;
}

/* ══════════════════════════════════════════════════════════════════
   COMPANIES HOUSE — FETCH LAYER
   All fetches go through a single helper that injects the API key
   as Basic Auth (CH uses key as username, empty password).
   ══════════════════════════════════════════════════════════════════ */
async function _chFetch(path) {
  const key = _chGetKey();
  if (!key) return null;
  const cacheKey = `ch_${path}`;
  const cached   = _chCacheGet(cacheKey);
  if (cached !== null) return cached;

  const auth = btoa(key + ":");
  try {
    const res = await fetch(`${CH_BASE}${path}`, {
      headers: {
        "Authorization": `Basic ${auth}`,
        "Accept":        "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 429) {
      console.warn("[CH] Rate limited (600 req/5 min). Retry shortly.");
      return null;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    _chCacheSet(cacheKey, data);
    _chInc();
    return data;
  } catch (e) {
    console.warn("[CH] fetch failed:", path, e.message);
    return null;
  }
}

/* ── 1. Search for company by name or ticker ────────────────────── */
async function _chSearch(query) {
  if (!query || query.length < 2) return null;
  const q = encodeURIComponent(query.slice(0, 50));
  const data = await _chFetch(`/search/companies?q=${q}&items_per_page=5`);
  return data?.items || null;
}

/* ── 2. Fetch full company profile ──────────────────────────────── */
async function _chGetProfile(companyNumber) {
  return _chFetch(`/company/${companyNumber}`);
}

/* ── 3. Fetch officers (directors) ─────────────────────────────── */
async function _chGetOfficers(companyNumber) {
  const data = await _chFetch(
    `/company/${companyNumber}/officers?items_per_page=20`
  );
  return data?.items || null;
}

/* ── 4. Fetch PSC (Persons with Significant Control) ───────────── */
async function _chGetPSC(companyNumber) {
  const data = await _chFetch(
    `/company/${companyNumber}/persons-with-significant-control`
  );
  return data?.items || null;
}

/* ── Resolve company: try ticker-derived name, then GLEIF name ─── */
async function _chResolveCompany(ticker) {
  const sym  = ticker.replace(/.*:/, "").toUpperCase();
  let items  = null;

  /* Try full company name from AV live data */
  const avName = (typeof avGetLive === "function")
    ? avGetLive(sym)?.overview?.name : null;
  if (avName) items = await _chSearch(avName);

  /* Try GLEIF legal name */
  if (!items?.length && window._currentLEI?.legalName) {
    items = await _chSearch(window._currentLEI.legalName);
  }

  /* Try Nasdaq dir name */
  if (!items?.length && typeof nasdaqDirLookup === "function") {
    const dir = nasdaqDirLookup(sym);
    if (dir?.name) items = await _chSearch(dir.name);
  }

  /* Try bare ticker symbol as last resort */
  if (!items?.length) items = await _chSearch(sym);

  if (!items?.length) return null;

  /* Pick the best match: prefer active, incorporated company */
  return items.find(c => c.company_status === "active")
      || items.find(c => c.company_type !== "llp")
      || items[0];
}

/* ══════════════════════════════════════════════════════════════════
   RENDER — #fund-des "UK Registry" block
   ══════════════════════════════════════════════════════════════════ */
function _renderDesBlock(profile) {
  const des = document.getElementById("fund-des");
  if (!des) return;
  des.querySelector(".ch-registry-block")?.remove();
  if (!profile) return;

  const addr = [
    profile.registered_office_address?.address_line_1,
    profile.registered_office_address?.address_line_2,
    profile.registered_office_address?.locality,
    profile.registered_office_address?.postal_code,
  ].filter(Boolean).join(", ");

  const sics = (profile.sic_codes || [])
    .slice(0, 3).map(c => `<span class="ch-sic-chip">${_esc(c)}</span>`).join("");

  const statusColor = profile.company_status === "active"   ? "#3fb950"
                    : profile.company_status === "dissolved" ? "#f85149"
                    : "#d29922";

  const block = document.createElement("div");
  block.className = "ch-registry-block";
  block.innerHTML = `
    <div class="section-head ch-head">
      UK Registry
      <span class="ch-src-badge">Companies House</span>
    </div>
    <div class="ch-grid">
      <div class="ch-row">
        <span class="ch-label">Company Number</span>
        <span class="ch-value">
          <code class="ch-num-code">${_esc(profile.company_number || "—")}</code>
          <a href="https://find-and-update.company-information.service.gov.uk/company/${_esc(profile.company_number)}"
             target="_blank" rel="noopener" class="ch-ext-link" title="View on Companies House">↗</a>
        </span>
      </div>
      <div class="ch-row">
        <span class="ch-label">Status</span>
        <span class="ch-value" style="color:${statusColor};font-weight:600">
          ${_esc((profile.company_status || "").replace(/-/g, " ").toUpperCase())}
        </span>
      </div>
      ${profile.type ? `
      <div class="ch-row">
        <span class="ch-label">Type</span>
        <span class="ch-value">${_esc(profile.type.replace(/-/g, " "))}</span>
      </div>` : ""}
      ${profile.date_of_creation ? `
      <div class="ch-row">
        <span class="ch-label">Incorporated</span>
        <span class="ch-value">${_esc(profile.date_of_creation)}</span>
      </div>` : ""}
      ${profile.jurisdiction ? `
      <div class="ch-row">
        <span class="ch-label">Jurisdiction</span>
        <span class="ch-value">${_esc(profile.jurisdiction.replace(/-/g, " "))}</span>
      </div>` : ""}
      ${addr ? `
      <div class="ch-row">
        <span class="ch-label">Registered Office</span>
        <span class="ch-value">${_esc(addr)}</span>
      </div>` : ""}
      ${sics ? `
      <div class="ch-row">
        <span class="ch-label">SIC Codes</span>
        <span class="ch-value ch-sics">${sics}</span>
      </div>` : ""}
      ${profile.accounts?.next_due ? `
      <div class="ch-row">
        <span class="ch-label">Accounts Due</span>
        <span class="ch-value">${_esc(profile.accounts.next_due)}</span>
      </div>` : ""}
    </div>`;

  /* Insert after any existing identity blocks from Phase 1 */
  const gleifBlock = des.querySelector(".gleif-identity-block");
  const figiBlock  = des.querySelector(".of-identifiers-block");
  const anchor     = gleifBlock || figiBlock;
  if (anchor) anchor.insertAdjacentElement("afterend", block);
  else des.appendChild(block);
}

/* ══════════════════════════════════════════════════════════════════
   RENDER — #own-mgmt "UK Directors" section
   ══════════════════════════════════════════════════════════════════ */
function _renderMgmtDirectors(officers) {
  const mgmt = document.getElementById("own-mgmt");
  if (!mgmt) return;
  mgmt.querySelector(".ch-directors-block")?.remove();
  if (!officers?.length) return;

  /* Filter to active directors and secretaries only */
  const active = officers.filter(o =>
    !o.resigned_on && ["director","corporate-director","secretary"].includes(o.officer_role)
  );
  if (!active.length) return;

  const block = document.createElement("div");
  block.className = "ch-directors-block";

  const cards = active.map(o => {
    const initials = (o.name || "?").split(",")[0]
      .split(" ").filter(Boolean)
      .map(w => w[0]).join("").slice(0, 2).toUpperCase();
    const name     = (o.name || "").replace(/,([^,]*)$/, " —$1").trim();
    const role     = (o.officer_role || "").replace(/-/g, " ");
    const since    = o.appointed_on || "";
    const nationality = o.nationality || "";
    return `
      <div class="mgmt-card ch-director-card">
        <div class="mgmt-avatar ch-avatar">${_esc(initials)}</div>
        <div class="mgmt-info">
          <div class="mgmt-name">${_esc(name)}</div>
          <div class="mgmt-role">${_esc(role)}</div>
          <div class="mgmt-meta">
            ${since   ? `Since ${_esc(since)}` : ""}
            ${nationality ? ` · ${_esc(nationality)}` : ""}
          </div>
        </div>
      </div>`;
  }).join("");

  block.innerHTML = `
    <div class="section-head ch-head" style="margin-top:12px">
      UK Directors
      <span class="ch-src-badge">Companies House · Live</span>
    </div>
    ${cards}
    <div class="av-note" style="margin-top:6px;font-size:9px">
      Active directors only · Source: Companies House Public Data API
    </div>`;

  mgmt.appendChild(block);
}

/* ══════════════════════════════════════════════════════════════════
   RENDER — PSC TAB in #panel-ownership (injected dynamically)
   Contains: Companies House PSC + BODS beneficial ownership
   ══════════════════════════════════════════════════════════════════ */
function _ensurePSCTab() {
  const panel  = document.getElementById("panel-ownership");
  if (!panel) return;

  /* Add tab button if not already there */
  if (!panel.querySelector('[data-tab="psc"]')) {
    const tabBar = panel.querySelector(".tab-bar");
    if (tabBar) {
      const btn = document.createElement("button");
      btn.className   = "tab-btn";
      btn.dataset.tab = "psc";
      btn.textContent = "PSC / BO";
      btn.onclick = () => {
        if (typeof switchTab === "function") switchTab("ownership", "psc");
      };
      tabBar.appendChild(btn);
    }
  }

  /* Add pane if not already there */
  if (!document.getElementById("own-psc")) {
    const pane = document.createElement("div");
    pane.id        = "own-psc";
    pane.className = "tab-pane panel-content";
    pane.dataset.tab = "psc";
    /* Insert before resize handles */
    const firstHandle = panel.querySelector(".resize-handle");
    if (firstHandle) panel.insertBefore(pane, firstHandle);
    else panel.appendChild(pane);
  }
}

function _renderPSCSection(companyNumber, pscItems) {
  _ensurePSCTab();
  const pane = document.getElementById("own-psc");
  if (!pane) return;

  /* Clear only the PSC sub-section, not the whole pane (BODS may follow) */
  pane.querySelector(".ch-psc-section")?.remove();

  const section = document.createElement("div");
  section.className = "ch-psc-section";

  if (!pscItems?.length) {
    section.innerHTML = `
      <div class="av-live-badge">● PSC · Companies House</div>
      <div class="no-data">// No Persons with Significant Control on record
        for this company number.</div>
      <div class="av-note">
        UK companies must disclose PSC data at
        <a href="https://find-and-update.company-information.service.gov.uk/company/${_esc(companyNumber)}/persons-with-significant-control"
           target="_blank" rel="noopener" style="color:var(--accent)">
          Companies House ↗</a>
      </div>`;
    pane.insertAdjacentElement("afterbegin", section);
    return;
  }

  const natureLabels = {
    "ownership-of-shares-25-to-50-percent":        "25–50% shares",
    "ownership-of-shares-50-to-75-percent":        "50–75% shares",
    "ownership-of-shares-75-to-100-percent":       "75–100% shares",
    "voting-rights-25-to-50-percent":              "25–50% votes",
    "voting-rights-50-to-75-percent":              "50–75% votes",
    "voting-rights-75-to-100-percent":             "75–100% votes",
    "right-to-appoint-and-remove-directors":       "Appoint directors",
    "significant-influence-or-control":            "Significant control",
    "ownership-of-shares-25-to-50-percent-as-trust": "25–50% via trust",
    "ownership-of-shares-50-to-75-percent-as-trust": "50–75% via trust",
  };

  const cards = pscItems.map(p => {
    const name    = p.name || p.company_name || "—";
    const kind    = p.kind || "";
    const isCorpo = kind.includes("corporate");
    const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    const natures = (p.natures_of_control || [])
      .map(n => `<span class="ch-psc-nature">${_esc(natureLabels[n] || n.replace(/-/g, " "))}</span>`)
      .join("");
    const notifiedDate = p.notified_on || "";
    const nationality  = p.nationality || p.country_of_residence || "";
    const dob = p.date_of_birth
      ? `${p.date_of_birth.year}-${String(p.date_of_birth.month).padStart(2,"0")}`
      : null;
    return `
      <div class="ch-psc-card">
        <div class="ch-psc-avatar ${isCorpo ? "ch-psc-corp" : ""}">${isCorpo ? "🏢" : _esc(initials)}</div>
        <div class="ch-psc-body">
          <div class="ch-psc-name">${_esc(name)}</div>
          <div class="ch-psc-meta">
            ${nationality ? `<span>${_esc(nationality)}</span>` : ""}
            ${dob  ? `<span>b. ${_esc(dob)}</span>`  : ""}
            ${notifiedDate ? `<span>Notified: ${_esc(notifiedDate)}</span>` : ""}
            ${isCorpo ? `<span class="ch-psc-kind-tag">Corporate PSC</span>` : ""}
          </div>
          <div class="ch-psc-natures">${natures}</div>
        </div>
      </div>`;
  }).join("");

  section.innerHTML = `
    <div class="av-live-badge">● Persons with Significant Control · Companies House · Live</div>
    <div class="av-note" style="margin-bottom:6px">
      UK law requires disclosure of anyone holding &gt;25% shares, votes, or other significant control.
      <a href="https://find-and-update.company-information.service.gov.uk/company/${_esc(companyNumber)}/persons-with-significant-control"
         target="_blank" rel="noopener" style="color:var(--accent)">View on CH ↗</a>
    </div>
    <div class="ch-psc-list">${cards}</div>`;

  pane.insertAdjacentElement("afterbegin", section);
}

/* ══════════════════════════════════════════════════════════════════
   2.2  OPEN OWNERSHIP BODS
   Strategy: fetch the BODS dataset index, pick UK/relevant datasets,
   fetch the BODS JSON, filter by company number or name, render.
   This is a best-effort enrichment — BODS coverage is jurisdiction-
   dependent and the register service was discontinued in 2024, but
   per-jurisdiction datasets remain downloadable.
   ══════════════════════════════════════════════════════════════════ */

/* Available BODS dataset URLs (from openownership.org portal) */
const BODS_DATASETS = {
  "GB": {
    label: "United Kingdom (PSC Register)",
    /* UK PSC data republished as BODS from Companies House */
    url:  "https://bods-data.openownership.org/datasets/gb-psc-snapshot.json",
    note: "UK Persons with Significant Control — Open Ownership BODS format",
  },
  "UA": {
    label: "Ukraine",
    url:  "https://bods-data.openownership.org/datasets/ukraine-edr.json",
    note: "Ukraine State Register of Legal Entities",
  },
  "SK": {
    label: "Slovakia",
    url:  "https://bods-data.openownership.org/datasets/slovakia-rpvs.json",
    note: "Slovakia Register of Public Sector Partners",
  },
};

const _BODS_CACHE = {};
async function _bodsFetch(url) {
  const cached = _BODS_CACHE[url];
  if (cached && Date.now() - cached.ts < BODS_TTL) return cached.data;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    _BODS_CACHE[url] = { data, ts: Date.now() };
    return data;
  } catch (e) {
    console.warn("[BODS] fetch failed:", url, e.message);
    return null;
  }
}

/* Determine which BODS dataset is relevant for this entity */
function _bodsPickDataset(companyNumber, leiRecord) {
  const jurisdiction = leiRecord?.jurisdiction || "";
  if (jurisdiction.startsWith("GB") || companyNumber) return BODS_DATASETS["GB"];
  if (jurisdiction.startsWith("UA")) return BODS_DATASETS["UA"];
  if (jurisdiction.startsWith("SK")) return BODS_DATASETS["SK"];
  return null;
}

/* Search BODS records for this entity */
function _bodsSearch(records, companyNumber, companyName) {
  if (!Array.isArray(records)) return [];
  const numNorm  = (companyNumber || "").replace(/\W/g, "").toLowerCase();
  const nameNorm = (companyName   || "").toLowerCase().slice(0, 30);

  return records.filter(r => {
    /* Match by company registration number */
    const regId = (r.statementID || r.entityStatement?.identifiers?.[0]?.id || "")
      .replace(/\W/g, "").toLowerCase();
    if (numNorm && regId.includes(numNorm)) return true;
    /* Match by name */
    const rName = (r.entityStatement?.name || r.subject?.describedByEntityStatement || "")
      .toLowerCase();
    if (nameNorm.length > 4 && rName.includes(nameNorm.slice(0, 20))) return true;
    return false;
  }).slice(0, 20);
}

function _renderBODSSection(dataset, records, companyName) {
  _ensurePSCTab();
  const pane = document.getElementById("own-psc");
  if (!pane) return;
  pane.querySelector(".bods-section")?.remove();

  if (!records?.length) return;

  const section = document.createElement("div");
  section.className = "bods-section";

  const ownerCards = records.map(r => {
    /* BODS ownership statement shape */
    const owner    = r.interestedParty || r.beneficialOwner || {};
    const ownerName = owner.name || owner.describedByPersonStatement || "Unknown";
    const interests = r.interests || [];
    const interestStr = interests.map(i =>
      [i.type, i.share?.exact != null ? `${i.share.exact}%` : i.share?.minimum != null ? `≥${i.share.minimum}%` : ""]
      .filter(Boolean).join(" ")
    ).join("; ") || "Ownership interest";
    const startDate = r.startDate || "";
    return `
      <div class="bods-owner-card">
        <div class="bods-owner-name">${_esc(ownerName)}</div>
        <div class="bods-owner-interest">${_esc(interestStr)}</div>
        ${startDate ? `<div class="bods-owner-date">Since ${_esc(startDate)}</div>` : ""}
      </div>`;
  }).join("");

  section.innerHTML = `
    <div class="section-head bods-head" style="margin-top:12px">
      Beneficial Ownership (BODS)
      <span class="bods-src-badge">Open Ownership · ODC-By</span>
    </div>
    <div class="av-note" style="margin-bottom:6px">
      ${_esc(dataset.note)} ·
      <a href="https://bods-data.openownership.org/" target="_blank" rel="noopener"
         style="color:var(--accent)">bods-data.openownership.org ↗</a> ·
      Attribution: Open Ownership under ODC Attribution License.
    </div>
    <div class="bods-owner-list">${ownerCards}</div>`;

  pane.appendChild(section);
}

/* ══════════════════════════════════════════════════════════════════
   MAIN ENTRY POINT
   ══════════════════════════════════════════════════════════════════ */
window.chLoadForTicker = async function chLoadForTicker(ticker) {
  if (!ticker) return;

  const sym     = ticker.replace(/.*:/, "").toUpperCase();
  const isUK    = _isUKTicker(ticker);
  const hasKey  = !!_chGetKey();

  /* Only run if:
       a) it's a UK ticker (certain) — always try CH
       b) GLEIF identified a UK entity — try CH
       c) A CH key is set — can try to search for any entity
     For non-UK entities without key, show informational setup banner. */
  if (!isUK && !hasKey) {
    const pane = document.getElementById("own-psc");
    if (pane && !pane.innerHTML.trim()) {
      pane.innerHTML = `
        <div class="ch-setup-banner">
          <div class="ch-setup-icon">🏛</div>
          <div class="ch-setup-body">
            <div class="ch-setup-title">PSC / Beneficial Ownership Data</div>
            <div class="ch-setup-desc">
              <strong>PSC (Persons with Significant Control)</strong> data is published by the
              UK Companies House registry for UK-registered entities (LSE, AIM, AQSE tickers).<br><br>
              <strong>For any company</strong>, add a free Companies House API key to search the
              UK registry and cross-reference beneficial ownership via Open Ownership BODS.
            </div>
            <div class="ch-setup-actions">
              <button class="ch-setup-btn" onclick="openApiConfig('companieshouse')">
                ⚙ Configure Companies House Key
              </button>
              <a href="https://developer.company-information.service.gov.uk/"
                 target="_blank" rel="noopener" class="ch-setup-link">
                Get free key ↗
              </a>
            </div>
            <div class="av-note" style="margin-top:10px">
              For UK tickers (LSE:, AIM:), PSC data loads automatically with or without a key.
            </div>
          </div>
        </div>`;
    }
    return;
  }

  /* Small delay: let gleif.js run first so _currentLEI is populated */
  await new Promise(r => setTimeout(r, 2000));

  /* Without a key, inject a setup prompt in own-psc */
  if (!hasKey) {
    _ensurePSCTab();
    const pane = document.getElementById("own-psc");
    if (pane && !pane.innerHTML.trim()) {
      pane.innerHTML = `
        <div class="ch-setup-banner">
          <div class="ch-setup-icon">🏛</div>
          <div class="ch-setup-body">
            <div class="ch-setup-title">Companies House — UK Corporate Registry</div>
            <div class="ch-setup-desc">
              Unlock UK directors, PSC beneficial ownership, incorporation details,
              and registered office. Free API key from Companies House.
            </div>
            <div class="ch-setup-actions">
              <button class="ch-setup-btn" onclick="openApiConfig('companieshouse')">
                ⚙ Configure Companies House Key
              </button>
              <a href="https://developer.company-information.service.gov.uk/"
                 target="_blank" rel="noopener" class="ch-setup-link">
                Get free key ↗
              </a>
            </div>
          </div>
        </div>`;
    }
    return;
  }

  /* Step 1: resolve company number */
  const match = await _chResolveCompany(ticker);
  if (!match) {
    /* Only show "not found" if we actually expected to find it */
    if (isUK) {
      _ensurePSCTab();
      const pane = document.getElementById("own-psc");
      if (pane) pane.innerHTML = `
        <div class="av-live-badge">● Companies House · ${_esc(sym)}</div>
        <div class="no-data">// Company not found in UK registry.
          Not all UK-listed companies are registered in England/Wales.
          <br><a href="https://find-and-update.company-information.service.gov.uk/"
                 target="_blank" rel="noopener" style="color:var(--accent)">
            Search Companies House ↗</a></div>`;
    }
    return;
  }

  const companyNumber = match.company_number;

  /* Step 2: fetch profile, officers, PSC in parallel */
  const [profile, officers, pscItems] = await Promise.all([
    _chGetProfile(companyNumber),
    _chGetOfficers(companyNumber),
    _chGetPSC(companyNumber),
  ]);

  /* Step 3: render */
  if (profile) _renderDesBlock(profile);
  if (officers) _renderMgmtDirectors(officers);
  _ensurePSCTab();
  _renderPSCSection(companyNumber, pscItems);

  /* Step 4: BODS enrichment (best-effort, non-blocking) */
  const bodsDataset = _bodsPickDataset(companyNumber, window._currentLEI);
  if (bodsDataset) {
    /* Fetch is large — do it async after PSC renders */
    setTimeout(async () => {
      try {
        const raw = await _bodsFetch(bodsDataset.url);
        if (raw) {
          const companyName = profile?.company_name || match.title || "";
          const bodsRecords = _bodsSearch(raw, companyNumber, companyName);
          if (bodsRecords.length) {
            _renderBODSSection(bodsDataset, bodsRecords, companyName);
          }
        }
      } catch (e) {
        console.warn("[BODS] enrichment failed:", e.message);
      }
    }, 500);
  }

  /* Emit event so other modules can react */
  window.dispatchEvent(new CustomEvent("finterm:ch-ready", {
    detail: { ticker, companyNumber, profile },
  }));
};

/* ── Expose a manual trigger for non-UK tickers when key is set ── */
window.chSearchAndLoad = async function chSearchAndLoad(query) {
  if (!query || !_chGetKey()) return;
  const items = await _chSearch(query);
  if (!items?.length) return null;
  return items;
};

/* ══════════════════════════════════════════════════════════════════
   HOOK — patch changeTicker; also listen for lei-ready
   ══════════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {

  /* Primary: listen for lei-ready (GLEIF tells us jurisdiction) */
  window.addEventListener("finterm:lei-ready", e => {
    const t = e.detail?.ticker;
    if (t) chLoadForTicker(t);
  });

  /* Fallback: direct changeTicker patch */
  const _origCT = typeof changeTicker === "function" ? changeTicker : null;
  if (_origCT) {
    window.changeTicker = function () {
      _origCT.apply(this, arguments);
      const raw = document.getElementById("tickerInput")?.value.trim();
      if (raw) {
        /* Clean up previous PSC tab pane content */
        const pscPane = document.getElementById("own-psc");
        if (pscPane) pscPane.innerHTML = "";
        /* Only run direct if gleif.js is not loaded (won't emit lei-ready) */
        if (typeof gleifLoadForTicker !== "function") {
          setTimeout(() => chLoadForTicker(raw), 2200);
        }
      }
    };
  }

  /* Register in KNOWN_PROVIDERS */
  if (Array.isArray(window.KNOWN_PROVIDERS)) {
    if (!window.KNOWN_PROVIDERS.find(p => p.id === "companieshouse")) {
      window.KNOWN_PROVIDERS.push({
        id:         "companieshouse",
        name:       "Companies House",
        badge:      "CH",
        group:      "Identity & Reference",
        desc:       "UK official company registry: profile, directors, Persons with Significant Control (beneficial ownership), SIC codes, incorporation date, registered office. Triggers automatically for LSE-listed tickers. Free API key required.",
        limit:      "600 req / 5 min (free)",
        docsUrl:    "https://developer.company-information.service.gov.uk/",
        sessionKey: CH_SESSION_KEY,
        limitWarn:  500,
        limitMax:   600,
      });
    }
    if (typeof renderTopbarBadges === "function") renderTopbarBadges();
  }

  /* saveKey auto-reload */
  const _origSave = typeof saveKey === "function" ? saveKey : null;
  if (_origSave) {
    window.saveKey = function (id) {
      _origSave.apply(this, arguments);
      if (id === "companieshouse") {
        const t = typeof currentTicker !== "undefined" ? currentTicker : null;
        if (t) setTimeout(() => chLoadForTicker(t), 400);
      }
    };
  }

  /* Initial load */
  setTimeout(() => {
    const t = typeof currentTicker !== "undefined" ? currentTicker : "AAPL";
    /* Only auto-run on initial load if UK ticker or key already set */
    if (_isUKTicker(t) || _chGetKey()) chLoadForTicker(t);
  }, 3500);
});

})();
