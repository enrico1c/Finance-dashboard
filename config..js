/* ══════════════════════════════════════════════════════════════════
   FINTERM — config.js  (v2 — extensible API key manager)
   ══════════════════════════════════════════════════════════════════
   Architecture:
   • KNOWN_PROVIDERS  — built-in registry (AV, FMP, + easily extendable)
   • Custom providers — user-defined, saved in localStorage as JSON
   • All keys in localStorage under "finterm_key_{id}"
   • window._KEYS[id] — runtime key map read by api.js / fmp.js
   ══════════════════════════════════════════════════════════════════ */

/* ── Built-in provider registry ─────────────────────────────────── */
const KNOWN_PROVIDERS = [
  {
    id:          "av",
    name:        "Alpha Vantage",
    badge:       "AV",
    desc:        "Quote · Fundamentals · Earnings · Income / Balance / Cash Flow · News + Sentiment",
    limit:       "25 calls / day (free)",
    docsUrl:     "https://www.alphavantage.co/support/#api-key",
    docsLabel:   "Get free key →",
    statusEl:    "apiStatus",
    countEl:     "apiCallCount",
    sessionKey:  "av_call_count",
    limitWarn:   20,
    limitMax:    25,
    showCount:   true,
  },
  {
    id:          "fmp",
    name:        "Financial Modeling Prep",
    badge:       "FMP",
    desc:        "Analyst Ratings · Price Targets · Forward Estimates · Holders · Insiders · Management · Events · Ratios · Watchlist Prices",
    limit:       "250 calls / day (free)",
    docsUrl:     "https://financialmodelingprep.com/developer/docs/",
    docsLabel:   "Get free key →",
    statusEl:    "fmpStatus",
    countEl:     "fmpCallCount",
    sessionKey:  "fmp_call_count",
    limitWarn:   200,
    limitMax:    250,
    showCount:   true,
  },
  // ── Add more known providers here in future ─────────────────────
  // {
  //   id: "ft", name: "Financial Times", badge: "FT",
  //   desc: "News · Market data", limit: "Varies",
  //   docsUrl: "https://developer.ft.com", docsLabel: "FT Developer →",
  //   statusEl: "ftStatus", countEl: "ftCallCount",
  //   sessionKey: "ft_call_count", limitWarn: 900, limitMax: 1000,
  // },
];

/* ── Runtime key map (read by api.js, fmp.js, future integrations) ─ */
window._KEYS = {};

/* ── Helpers ─────────────────────────────────────────────────────── */
const lsKey  = id  => `finterm_key_${id}`;
const getKey = id  => window._KEYS[id] || localStorage.getItem(lsKey(id)) || "";
const setKey = (id, val) => { localStorage.setItem(lsKey(id), val); window._KEYS[id] = val; };
const delKey = id  => { localStorage.removeItem(lsKey(id)); delete window._KEYS[id]; };
const maskKey = val => val.length > 8 ? val.slice(0,4) + "••••••" + val.slice(-4) : "••••••••";

/* Backwards-compat shims for api.js / fmp.js */
function getAvKey()  { return getKey("av");  }
function getFmpKey() { return getKey("fmp"); }

/* ══════════════════════════════════════════════════════════════════
   LOAD ALL KEYS FROM localStorage → window._KEYS
   ══════════════════════════════════════════════════════════════════ */
function loadAllKeys() {
  /* Known providers */
  KNOWN_PROVIDERS.forEach(p => {
    const v = localStorage.getItem(lsKey(p.id));
    if (v) window._KEYS[p.id] = v;
  });
  /* Custom providers */
  getCustomProviders().forEach(p => {
    const v = localStorage.getItem(lsKey(p.id));
    if (v) window._KEYS[p.id] = v;
  });
}

/* ══════════════════════════════════════════════════════════════════
   TOPBAR STATUS BADGES
   Dynamically creates one badge per configured provider
   ══════════════════════════════════════════════════════════════════ */
function renderTopbarBadges() {
  // Find insertion point — before the ⚙ API button
  const btn = document.querySelector(".api-config-btn");
  if (!btn) return;

  // Remove old dynamic badges
  document.querySelectorAll(".api-status-dynamic").forEach(el => el.remove());

  const allProviders = [...KNOWN_PROVIDERS, ...getCustomProviders()];
  allProviders.forEach(p => {
    const existing = document.getElementById(`badge-${p.id}`);
    if (existing) existing.remove();

    const key    = getKey(p.id);
    const n      = parseInt(sessionStorage.getItem(p.sessionKey || "") || "0");
    const status = !key ? "api-unconfigured"
                 : (p.limitMax && n >= p.limitMax)  ? "api-limit"
                 : (p.limitWarn && n >= p.limitWarn) ? "api-warn"
                 : "api-ok";

    const badge = document.createElement("div");
    badge.id        = `badge-${p.id}`;
    badge.className = `api-status api-status-dynamic ${status}`;
    badge.title     = key
      ? `${p.name}: ${n}${p.limitMax ? "/"+p.limitMax : ""} calls · click to configure`
      : `${p.name}: key not set — click to configure`;
    badge.onclick   = () => openApiConfig(p.id);
    badge.innerHTML = `
      <span class="api-dot"></span>
      <span>${escapeHtml(p.badge)}</span>
      ${p.showCount && key ? `<span>${n}${p.limitMax ? "/"+p.limitMax : ""}</span>` : ""}`;

    btn.insertAdjacentElement("beforebegin", badge);
  });
}

/* ══════════════════════════════════════════════════════════════════
   MODAL OPEN / CLOSE / TABS
   ══════════════════════════════════════════════════════════════════ */
let _focusProviderId = null;

function openApiConfig(focusId) {
  _focusProviderId = focusId || null;
  renderProviderList();
  renderCustomSaved();
  renderSessionStats();
  document.getElementById("apiConfigOverlay").classList.add("visible");

  // Auto-switch to providers tab and scroll to focused provider
  switchApiTab("providers", document.querySelector('.api-tab[onclick*="providers"]'));
  if (focusId) {
    setTimeout(() => {
      const el = document.getElementById(`provider-block-${focusId}`);
      if (el) el.scrollIntoView({ behavior:"smooth", block:"center" });
      const input = document.getElementById(`key-input-${focusId}`);
      if (input) input.focus();
    }, 120);
  }
}

function closeApiConfig() {
  document.getElementById("apiConfigOverlay").classList.remove("visible");
}

// Close on overlay click (not modal click)
document.addEventListener("click", e => {
  const overlay = document.getElementById("apiConfigOverlay");
  if (e.target === overlay) closeApiConfig();
});

// Close on Escape
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeApiConfig();
});

function switchApiTab(tabId, btn) {
  document.querySelectorAll(".api-tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".api-tab-pane").forEach(p => p.classList.remove("active"));
  if (btn) btn.classList.add("active");
  document.getElementById(`apiTab-${tabId}`)?.classList.add("active");
  if (tabId === "session") renderSessionStats();
  if (tabId === "custom")  renderCustomSaved();
}

/* ══════════════════════════════════════════════════════════════════
   PROVIDER LIST RENDERER  (Providers tab)
   ══════════════════════════════════════════════════════════════════ */
function renderProviderList() {
  const container = document.getElementById("apiProviderList");
  if (!container) return;

  const allProviders = [...KNOWN_PROVIDERS, ...getCustomProviders()];

  container.innerHTML = allProviders.map(p => {
    const val    = getKey(p.id);
    const masked = val ? maskKey(val) : "";
    const hasKey = !!val;
    const n      = parseInt(sessionStorage.getItem(p.sessionKey || "") || "0");
    const status = !hasKey ? "badge-unset"
                 : (p.limitMax && n >= p.limitMax) ? "badge-limit"
                 : "badge-set";
    const statusLabel = !hasKey ? "NOT SET"
                      : (p.limitMax && n >= p.limitMax) ? "LIMIT REACHED"
                      : masked;

    return `
    <div class="api-key-block ${_focusProviderId === p.id ? "api-key-block-focus" : ""}"
         id="provider-block-${escapeHtml(p.id)}">
      <div class="api-key-provider">
        <div class="api-key-provider-left">
          <span class="api-key-badge-icon">${escapeHtml(p.badge)}</span>
          <div>
            <div class="api-key-name">${escapeHtml(p.name)}</div>
            <div class="api-key-limit">${escapeHtml(p.limit || "")}</div>
          </div>
        </div>
        <span class="api-key-badge ${status}">${statusLabel}</span>
      </div>

      ${p.desc ? `<div class="api-key-desc">${escapeHtml(p.desc)}${
        p.docsUrl ? ` · <a href="${escapeHtml(p.docsUrl)}" target="_blank" rel="noopener">${escapeHtml(p.docsLabel||"Docs →")}</a>` : ""
      }</div>` : ""}

      <div class="api-key-input-row">
        <input type="password"
               id="key-input-${escapeHtml(p.id)}"
               class="api-key-field"
               placeholder="Paste API key here…"
               value="${escapeHtml(val)}"
               autocomplete="off" spellcheck="false"
               oninput="livePreviewKey('${escapeHtml(p.id)}')" />
        <button class="api-key-eye"
                onclick="toggleKeyVisibility('key-input-${escapeHtml(p.id)}', this)"
                title="Show / hide">👁</button>
        <button class="api-key-save"
                onclick="saveProviderKey('${escapeHtml(p.id)}')">Save</button>
        <button class="api-key-clear"
                onclick="clearProviderKey('${escapeHtml(p.id)}')">Clear</button>
      </div>
      <div class="api-key-status" id="key-status-${escapeHtml(p.id)}"></div>

      ${p.sessionKey ? `
      <div class="api-key-usage">
        Calls this session: <strong>${n}</strong>${p.limitMax ? " / " + p.limitMax : ""}
        ${n > 0 ? `<button class="api-reset-count-btn" onclick="resetCallCount('${escapeHtml(p.sessionKey)}', '${escapeHtml(p.id)}')">Reset counter</button>` : ""}
      </div>` : ""}
    </div>
    ${p !== allProviders[allProviders.length-1] ? '<div class="api-modal-divider"></div>' : ""}`;
  }).join("");
}

/* ══════════════════════════════════════════════════════════════════
   SAVE / CLEAR / PREVIEW
   ══════════════════════════════════════════════════════════════════ */
function saveProviderKey(id) {
  const input = document.getElementById(`key-input-${id}`);
  if (!input) return;
  const val = input.value.trim();
  if (!val)        { showProviderStatus(id, "⚠ Key is empty.", "warn"); return; }
  if (val.length < 8) { showProviderStatus(id, "⚠ Key seems too short (< 8 chars).", "warn"); return; }
  setKey(id, val);
  showProviderStatus(id, `✓ Saved (${maskKey(val)})`, "ok");
  renderProviderList();
  renderTopbarBadges();
}

function clearProviderKey(id) {
  delKey(id);
  const input = document.getElementById(`key-input-${id}`);
  if (input) input.value = "";
  showProviderStatus(id, "Key cleared.", "info");
  renderProviderList();
  renderTopbarBadges();
}

function livePreviewKey(id) {
  const input  = document.getElementById(`key-input-${id}`);
  const badge  = document.querySelector(`#provider-block-${id} .api-key-badge`);
  if (!input || !badge) return;
  const val = input.value.trim();
  badge.textContent = val ? maskKey(val) : "NOT SET";
  badge.className   = "api-key-badge " + (val ? "badge-set" : "badge-unset");
}

function showProviderStatus(id, msg, type) {
  const el = document.getElementById(`key-status-${id}`);
  if (!el) return;
  el.textContent = msg;
  el.className   = `api-key-status status-${type}`;
  setTimeout(() => { el.textContent = ""; el.className = "api-key-status"; }, 4000);
}

function toggleKeyVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.type   = input.type === "password" ? "text" : "password";
  btn.textContent = input.type === "password" ? "👁" : "🙈";
}

/* ══════════════════════════════════════════════════════════════════
   CUSTOM PROVIDERS
   ══════════════════════════════════════════════════════════════════ */
const LS_CUSTOM = "finterm_custom_providers";

function getCustomProviders() {
  try { return JSON.parse(localStorage.getItem(LS_CUSTOM) || "[]"); }
  catch { return []; }
}
function saveCustomProviders(list) {
  localStorage.setItem(LS_CUSTOM, JSON.stringify(list));
}

function addCustomProvider() {
  const name = document.getElementById("customProviderName")?.value.trim();
  const id   = document.getElementById("customProviderId")?.value.trim().toLowerCase().replace(/\s+/g,"_");
  const key  = document.getElementById("customProviderKey")?.value.trim();
  const desc = document.getElementById("customProviderDesc")?.value.trim();
  const url  = document.getElementById("customProviderUrl")?.value.trim();

  const status = id => showCustomStatus;
  if (!name || !id) { showCustomStatus("⚠ Name and short ID are required.", "warn"); return; }
  if (id.length > 6) { showCustomStatus("⚠ Short ID must be ≤ 6 characters.", "warn"); return; }

  // Check for duplicates
  const allIds = [...KNOWN_PROVIDERS.map(p=>p.id), ...getCustomProviders().map(p=>p.id)];
  if (allIds.includes(id)) { showCustomStatus(`⚠ ID "${id}" already exists.`, "warn"); return; }

  const newProvider = {
    id, name, badge: id.toUpperCase().slice(0,5),
    desc: desc || "",
    limit: "Varies",
    docsUrl: url || "", docsLabel: "Docs →",
    sessionKey: `${id}_call_count`,
    showCount: false,
    custom: true,
  };

  const list = getCustomProviders();
  list.push(newProvider);
  saveCustomProviders(list);

  if (key && key.length >= 8) setKey(id, key);

  // Clear form
  ["customProviderName","customProviderId","customProviderKey",
   "customProviderDesc","customProviderUrl"].forEach(fId => {
    const el = document.getElementById(fId);
    if (el) el.value = "";
  });

  showCustomStatus(`✓ Provider "${name}" added.`, "ok");
  renderCustomSaved();
  renderTopbarBadges();
}

function removeCustomProvider(id) {
  const list = getCustomProviders().filter(p => p.id !== id);
  saveCustomProviders(list);
  delKey(id);
  renderCustomSaved();
  renderTopbarBadges();
}

function renderCustomSaved() {
  const box = document.getElementById("customProviderSaved");
  if (!box) return;
  const list = getCustomProviders();
  if (!list.length) {
    box.innerHTML = `<div class="api-custom-empty">No custom providers yet.<br>Add one above to store any API key you need.</div>`;
    return;
  }
  box.innerHTML = list.map(p => {
    const val = getKey(p.id);
    return `<div class="api-custom-saved-row">
      <span class="api-key-badge-icon">${escapeHtml(p.badge)}</span>
      <div class="api-custom-saved-info">
        <strong>${escapeHtml(p.name)}</strong>
        <span>${val ? maskKey(val) : "no key saved"}</span>
      </div>
      <button class="api-custom-edit-btn" onclick="openApiConfig('${escapeHtml(p.id)}'); switchApiTab('providers', document.querySelector('.api-tab'))">Edit</button>
      <button class="api-custom-del-btn"  onclick="removeCustomProvider('${escapeHtml(p.id)}')">✕</button>
    </div>`;
  }).join("");
}

function showCustomStatus(msg, type) {
  const el = document.getElementById("customProviderStatus");
  if (!el) return;
  el.textContent = msg;
  el.className   = `api-key-status status-${type}`;
  setTimeout(() => { el.textContent = ""; el.className = "api-key-status"; }, 4000);
}

/* ══════════════════════════════════════════════════════════════════
   SESSION STATS TAB
   ══════════════════════════════════════════════════════════════════ */
function renderSessionStats() {
  const box = document.getElementById("apiSessionStats");
  if (!box) return;

  const allProviders = [...KNOWN_PROVIDERS, ...getCustomProviders()];
  const cacheEntries = Object.keys(sessionStorage)
    .filter(k => allProviders.some(p => k.startsWith(p.id+"_") || k.startsWith("av_") || k.startsWith("fmp_")));

  box.innerHTML = `
    <div class="api-session-stats">
      ${allProviders.map(p => {
        const key = getKey(p.id);
        const n   = parseInt(sessionStorage.getItem(p.sessionKey || "") || "0");
        return `<div class="api-stat-row">
          <span><span class="api-key-badge-icon" style="font-size:9px;margin-right:4px">${escapeHtml(p.badge)}</span>${escapeHtml(p.name)}</span>
          <span class="${!key ? "stat-unset" : n > (p.limitWarn||Infinity) ? "stat-warn" : "stat-ok"}">
            ${key ? `${n}${p.limitMax ? " / "+p.limitMax : ""}` : "no key"}
          </span>
        </div>`;
      }).join("")}
      <div class="api-stat-row" style="border-top:1px solid var(--border);margin-top:6px;padding-top:8px">
        <span>Cache entries</span>
        <span>${cacheEntries.length}</span>
      </div>
    </div>`;
}

function resetCallCount(sessionKey, providerId) {
  sessionStorage.removeItem(sessionKey);
  renderSessionStats();
  renderTopbarBadges();
  if (providerId) renderProviderList();
}

/* ══════════════════════════════════════════════════════════════════
   CLEAR CACHE
   ══════════════════════════════════════════════════════════════════ */
function clearAllCache() {
  const keys = Object.keys(sessionStorage).filter(k =>
    k.startsWith("av_") || k.startsWith("fmp_") ||
    getCustomProviders().some(p => k.startsWith(p.id+"_"))
  );
  keys.forEach(k => sessionStorage.removeItem(k));
  // Reset call counts
  [...KNOWN_PROVIDERS, ...getCustomProviders()].forEach(p => {
    if (p.sessionKey) sessionStorage.removeItem(p.sessionKey);
  });
  renderSessionStats();
  renderTopbarBadges();
  if (typeof updateApiStatus  === "function") updateApiStatus();
  if (typeof updateFmpStatus  === "function") updateFmpStatus();
  if (typeof showApiToast     === "function") showApiToast("✓ Session cache cleared.", "ok");
}

/* ══════════════════════════════════════════════════════════════════
   APPLY & RELOAD
   ══════════════════════════════════════════════════════════════════ */
function applyAndReload() {
  // Save any unsaved inputs from the provider list
  const allProviders = [...KNOWN_PROVIDERS, ...getCustomProviders()];
  allProviders.forEach(p => {
    const input = document.getElementById(`key-input-${p.id}`);
    if (!input) return;
    const val = input.value.trim();
    if (val && val.length >= 8) setKey(p.id, val);
  });

  closeApiConfig();
  renderTopbarBadges();

  if (typeof currentTicker !== "undefined" && currentTicker) {
    if (typeof avLoadAll  === "function") avLoadAll(currentTicker);
    if (typeof fmpLoadAll === "function") fmpLoadAll(currentTicker);
  }
  if (typeof showApiToast === "function") showApiToast("✓ Keys applied — reloading live data…", "ok");
}

/* ══════════════════════════════════════════════════════════════════
   LEGACY SHIMS  (keep api.js / fmp.js working unchanged)
   ══════════════════════════════════════════════════════════════════ */
function updateApiStatus() {
  const n  = parseInt(sessionStorage.getItem("av_call_count") || "0");
  const el = document.getElementById("apiStatus");
  const lb = document.getElementById("apiCallCount");
  if (lb) lb.textContent = `${n}/25`;
  if (el) el.className = "api-status " + (n>=25?"api-limit":n>=20?"api-warn":"api-ok");
  renderTopbarBadges();
}
function updateFmpStatus() {
  const n  = parseInt(sessionStorage.getItem("fmp_call_count") || "0");
  const el = document.getElementById("fmpStatus");
  const lb = document.getElementById("fmpCallCount");
  if (lb) lb.textContent = `${n}`;
  if (el) el.className = "api-status " + (n>=250?"api-limit":n>=200?"api-warn":"api-ok");
  renderTopbarBadges();
}

/* ══════════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  loadAllKeys();
  renderTopbarBadges();

  const hasAny = [...KNOWN_PROVIDERS, ...getCustomProviders()].some(p => !!getKey(p.id));
  if (!hasAny) {
    setTimeout(() => {
      if (typeof showApiToast === "function")
        showApiToast("⚙ No API keys — click ⚙ API to configure Alpha Vantage & FMP.", "info");
    }, 1400);
  }
});
