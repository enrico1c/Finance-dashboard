/* ══════════════════════════════════════════════════════════════════
   FINTERM — config.js  (self-contained, no external dependencies)
   Extensible API key manager via localStorage
   ══════════════════════════════════════════════════════════════════ */

/* ── Self-contained escapeHtml (config.js loads before script.js) ─ */
function cfgEsc(str) {
  return String(str ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

/* ── Built-in provider registry ─────────────────────────────────── */
const KNOWN_PROVIDERS = [
  {
    id:         "av",
    name:       "Alpha Vantage",
    badge:      "AV",
    desc:       "Quote · Fundamentals · Earnings · Income / Balance / Cash Flow · News + Sentiment",
    limit:      "25 calls / day (free)",
    docsUrl:    "https://www.alphavantage.co/support/#api-key",
    docsLabel:  "Get free key →",
    sessionKey: "av_call_count",
    limitWarn:  20,
    limitMax:   25,
  },
  {
    id:         "fmp",
    name:       "Financial Modeling Prep",
    badge:      "FMP",
    desc:       "Analyst Ratings · Price Targets · Forward Estimates · Institutional Holders · Insider Transactions · Management · Earnings Calendar · Live Ratios · Watchlist Prices",
    limit:      "250 calls / day (free)",
    docsUrl:    "https://financialmodelingprep.com/developer/docs/",
    docsLabel:  "Get free key →",
    sessionKey: "fmp_call_count",
    limitWarn:  200,
    limitMax:   250,
  },
];

/* ── Runtime key map — read by api.js & fmp.js ───────────────────── */
window._KEYS = {};

/* ── Key helpers ─────────────────────────────────────────────────── */
const lsKeyId  = id  => `finterm_key_${id}`;
const getKey   = id  => window._KEYS[id] || localStorage.getItem(lsKeyId(id)) || "";
const setKey   = (id, v) => { localStorage.setItem(lsKeyId(id), v); window._KEYS[id] = v; };
const delKey   = id  => { localStorage.removeItem(lsKeyId(id)); delete window._KEYS[id]; };
const maskKey  = v   => v.length > 8 ? v.slice(0,4) + "••••••" + v.slice(-4) : "••••••••";

/* Backwards-compat shims used by api.js / fmp.js */
function getAvKey()  { return getKey("av");  }
function getFmpKey() { return getKey("fmp"); }

/* ── Load all keys from localStorage → window._KEYS ─────────────── */
function loadAllKeys() {
  [...KNOWN_PROVIDERS, ...getCustomProviders()].forEach(p => {
    const v = localStorage.getItem(lsKeyId(p.id));
    if (v) window._KEYS[p.id] = v;
  });
}

/* ── Custom providers (user-defined) ─────────────────────────────── */
const LS_CUSTOM = "finterm_custom_providers";
function getCustomProviders() {
  try { return JSON.parse(localStorage.getItem(LS_CUSTOM) || "[]"); } catch { return []; }
}
function saveCustomProviders(list) { localStorage.setItem(LS_CUSTOM, JSON.stringify(list)); }

function allProviders() { return [...KNOWN_PROVIDERS, ...getCustomProviders()]; }

/* ══════════════════════════════════════════════════════════════════
   TOPBAR BADGES — one per configured provider, dynamic
   ══════════════════════════════════════════════════════════════════ */
function renderTopbarBadges() {
  const btn = document.querySelector(".api-config-btn");
  if (!btn) return;

  // Remove previously injected dynamic badges
  document.querySelectorAll(".api-dyn-badge").forEach(el => el.remove());

  allProviders().forEach(p => {
    const key    = getKey(p.id);
    const n      = parseInt(sessionStorage.getItem(p.sessionKey || "") || "0");
    const status = !key
      ? "api-unconfigured"
      : (p.limitMax && n >= p.limitMax)  ? "api-limit"
      : (p.limitWarn && n >= p.limitWarn)? "api-warn"
      : "api-ok";

    const el = document.createElement("div");
    el.className = `api-status api-dyn-badge ${status}`;
    el.title     = key
      ? `${p.name}: ${n}${p.limitMax ? "/"+p.limitMax : ""} calls · click to configure`
      : `${p.name}: key not set — click to configure`;
    el.onclick   = () => openApiConfig(p.id);
    el.innerHTML =
      `<span class="api-dot"></span>` +
      `<span>${cfgEsc(p.badge)}</span>` +
      (key ? `<span>${n}${p.limitMax ? "/"+p.limitMax : ""}</span>` : "");

    btn.insertAdjacentElement("beforebegin", el);
  });
}

/* ══════════════════════════════════════════════════════════════════
   MODAL OPEN / CLOSE / TABS
   ══════════════════════════════════════════════════════════════════ */
let _focusId = null;

function openApiConfig(focusId) {
  _focusId = focusId || null;
  const overlay = document.getElementById("apiConfigOverlay");
  if (!overlay) return;

  renderProviderList();
  renderCustomSaved();
  renderSessionStats();

  overlay.classList.add("visible");

  // Switch to providers tab, scroll to focused provider
  switchApiTab("providers");
  if (focusId) {
    setTimeout(() => {
      document.getElementById(`pblock-${focusId}`)?.scrollIntoView({ behavior:"smooth", block:"center" });
      document.getElementById(`kinput-${focusId}`)?.focus();
    }, 100);
  }
}

function closeApiConfig() {
  document.getElementById("apiConfigOverlay")?.classList.remove("visible");
}

function switchApiTab(tabId) {
  document.querySelectorAll(".api-tab").forEach(t =>
    t.classList.toggle("active", t.dataset.tab === tabId));
  document.querySelectorAll(".api-tab-pane").forEach(p =>
    p.classList.toggle("active", p.id === `apiTab-${tabId}`));
  if (tabId === "session") renderSessionStats();
  if (tabId === "custom")  renderCustomSaved();
}

/* ══════════════════════════════════════════════════════════════════
   PROVIDERS TAB RENDERER
   ══════════════════════════════════════════════════════════════════ */
function renderProviderList() {
  const box = document.getElementById("apiProviderList");
  if (!box) return;

  box.innerHTML = allProviders().map((p, i, arr) => {
    const val    = getKey(p.id);
    const hasKey = !!val;
    const n      = parseInt(sessionStorage.getItem(p.sessionKey || "") || "0");
    const badgeCls   = !hasKey ? "badge-unset" : (p.limitMax && n >= p.limitMax) ? "badge-limit" : "badge-set";
    const badgeLabel = !hasKey ? "NOT SET"     : (p.limitMax && n >= p.limitMax) ? "LIMIT"       : maskKey(val);

    return `
    <div class="api-key-block${_focusId === p.id ? " api-key-block-focus" : ""}" id="pblock-${cfgEsc(p.id)}">
      <div class="api-key-provider">
        <div class="api-key-provider-left">
          <span class="api-badge-pill">${cfgEsc(p.badge)}</span>
          <div>
            <div class="api-key-name">${cfgEsc(p.name)}</div>
            <div class="api-key-limit">${cfgEsc(p.limit || "")}</div>
          </div>
        </div>
        <span class="api-key-badge ${badgeCls}">${cfgEsc(badgeLabel)}</span>
      </div>

      ${p.desc ? `<div class="api-key-desc">${cfgEsc(p.desc)}${
        p.docsUrl ? ` &nbsp;·&nbsp; <a href="${cfgEsc(p.docsUrl)}" target="_blank" rel="noopener">${cfgEsc(p.docsLabel||"Docs →")}</a>` : ""
      }</div>` : ""}

      <div class="api-key-input-row">
        <input type="password"
               id="kinput-${cfgEsc(p.id)}"
               class="api-key-field"
               placeholder="Paste API key here…"
               value="${cfgEsc(val)}"
               autocomplete="off"
               spellcheck="false"
               oninput="livePreviewKey('${cfgEsc(p.id)}')" />
        <button class="api-key-eye"
                onclick="toggleKeyVis('kinput-${cfgEsc(p.id)}', this)"
                title="Show / hide">👁</button>
        <button class="api-key-save"
                onclick="saveProviderKey('${cfgEsc(p.id)}')">Save</button>
        <button class="api-key-clear"
                onclick="clearProviderKey('${cfgEsc(p.id)}')">Clear</button>
      </div>
      <div class="api-key-status" id="kstatus-${cfgEsc(p.id)}"></div>

      ${hasKey && p.sessionKey ? `
      <div class="api-key-usage">
        Calls this session: <strong>${n}</strong>${p.limitMax ? " / " + p.limitMax : ""}
        ${n > 0 ? `<button class="api-reset-count-btn" onclick="resetCount('${cfgEsc(p.sessionKey)}','${cfgEsc(p.id)}')">Reset</button>` : ""}
      </div>` : ""}

      ${p.custom ? `<button class="api-custom-del-btn" style="margin-top:6px" onclick="removeCustomProvider('${cfgEsc(p.id)}')">✕ Remove provider</button>` : ""}
    </div>
    ${i < arr.length-1 ? '<div class="api-modal-divider"></div>' : ""}`;
  }).join("");
}

/* ══════════════════════════════════════════════════════════════════
   KEY SAVE / CLEAR / PREVIEW
   ══════════════════════════════════════════════════════════════════ */
function saveProviderKey(id) {
  const input = document.getElementById(`kinput-${id}`);
  if (!input) return;
  const val = input.value.trim();
  if (!val)        { setStatus(id, "⚠ Key is empty.", "warn"); return; }
  if (val.length < 8) { setStatus(id, "⚠ Key seems too short (< 8 chars).", "warn"); return; }
  setKey(id, val);
  setStatus(id, `✓ Saved — ${maskKey(val)}`, "ok");
  renderProviderList();
  renderTopbarBadges();
}

function clearProviderKey(id) {
  delKey(id);
  const input = document.getElementById(`kinput-${id}`);
  if (input) input.value = "";
  setStatus(id, "Key cleared.", "info");
  renderTopbarBadges();
}

function livePreviewKey(id) {
  const input = document.getElementById(`kinput-${id}`);
  const badge = document.querySelector(`#pblock-${id} .api-key-badge`);
  if (!input || !badge) return;
  const val = input.value.trim();
  badge.textContent = val ? maskKey(val) : "NOT SET";
  badge.className   = "api-key-badge " + (val ? "badge-set" : "badge-unset");
}

function toggleKeyVis(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.type      = input.type === "password" ? "text" : "password";
  btn.textContent = input.type === "password" ? "👁" : "🙈";
}

function setStatus(id, msg, type) {
  const el = document.getElementById(`kstatus-${id}`);
  if (!el) return;
  el.textContent = msg;
  el.className   = `api-key-status status-${type}`;
  setTimeout(() => { el.textContent = ""; el.className = "api-key-status"; }, 4000);
}

/* ══════════════════════════════════════════════════════════════════
   CUSTOM PROVIDERS TAB
   ══════════════════════════════════════════════════════════════════ */
function addCustomProvider() {
  const name = document.getElementById("customName")?.value.trim();
  const id   = document.getElementById("customId")?.value.trim().toLowerCase().replace(/\W+/g,"_");
  const key  = document.getElementById("customKey")?.value.trim();
  const desc = document.getElementById("customDesc")?.value.trim();
  const url  = document.getElementById("customUrl")?.value.trim();

  if (!name) { setCustomStatus("⚠ Provider name is required.", "warn"); return; }
  if (!id)   { setCustomStatus("⚠ Short ID is required.", "warn"); return; }
  if (id.length > 6) { setCustomStatus("⚠ Short ID must be ≤ 6 chars.", "warn"); return; }

  const taken = allProviders().map(p => p.id);
  if (taken.includes(id)) { setCustomStatus(`⚠ ID "${id}" already exists.`, "warn"); return; }

  const p = {
    id, name,
    badge:      id.toUpperCase().slice(0, 5),
    desc:       desc || "",
    limit:      "Varies",
    docsUrl:    url  || "",
    docsLabel:  "Docs →",
    sessionKey: `${id}_call_count`,
    custom:     true,
  };

  const list = getCustomProviders();
  list.push(p);
  saveCustomProviders(list);
  if (key && key.length >= 8) setKey(id, key);

  // Clear form
  ["customName","customId","customKey","customDesc","customUrl"].forEach(fid => {
    const el = document.getElementById(fid);
    if (el) el.value = "";
  });

  setCustomStatus(`✓ "${name}" added — key stored. Access via window._KEYS["${id}"].`, "ok");
  renderCustomSaved();
  renderTopbarBadges();
}

function removeCustomProvider(id) {
  saveCustomProviders(getCustomProviders().filter(p => p.id !== id));
  delKey(id);
  renderCustomSaved();
  renderProviderList();
  renderTopbarBadges();
}

function renderCustomSaved() {
  const box = document.getElementById("customSavedList");
  if (!box) return;
  const list = getCustomProviders();
  if (!list.length) {
    box.innerHTML = `<div class="api-custom-empty">No custom providers yet.</div>`;
    return;
  }
  box.innerHTML = list.map(p => {
    const val = getKey(p.id);
    return `<div class="api-custom-saved-row">
      <span class="api-badge-pill" style="font-size:9px">${cfgEsc(p.badge)}</span>
      <div class="api-custom-saved-info">
        <strong>${cfgEsc(p.name)}</strong>
        <span>${val ? maskKey(val) : "no key saved"}</span>
      </div>
      <button class="api-custom-edit-btn"
              onclick="openApiConfig('${cfgEsc(p.id)}')">Edit</button>
      <button class="api-custom-del-btn"
              onclick="removeCustomProvider('${cfgEsc(p.id)}')">✕</button>
    </div>`;
  }).join("");
}

function setCustomStatus(msg, type) {
  const el = document.getElementById("customStatus");
  if (!el) return;
  el.textContent = msg;
  el.className   = `api-key-status status-${type}`;
  setTimeout(() => { el.textContent = ""; el.className = "api-key-status"; }, 5000);
}

/* ══════════════════════════════════════════════════════════════════
   SESSION STATS TAB
   ══════════════════════════════════════════════════════════════════ */
function renderSessionStats() {
  const box = document.getElementById("apiSessionStats");
  if (!box) return;
  box.innerHTML = allProviders().map(p => {
    const key = getKey(p.id);
    const n   = parseInt(sessionStorage.getItem(p.sessionKey || "") || "0");
    const cls = !key ? "stat-unset" : n > (p.limitWarn || Infinity) ? "stat-warn" : "stat-ok";
    return `<div class="api-stat-row">
      <span>
        <span class="api-badge-pill" style="font-size:8px;padding:1px 5px">${cfgEsc(p.badge)}</span>
        ${cfgEsc(p.name)}
      </span>
      <span class="${cls}">
        ${key ? `${n}${p.limitMax ? " / " + p.limitMax : ""}` : "no key"}
      </span>
    </div>`;
  }).join("") + `
    <div class="api-stat-row" style="border-top:1px solid var(--border);margin-top:6px;padding-top:8px">
      <span>Cache entries (sessionStorage)</span>
      <span>${Object.keys(sessionStorage).filter(k => allProviders().some(p => k.startsWith(p.id+"_") || k.startsWith("av_") || k.startsWith("fmp_"))).length}</span>
    </div>`;
}

function resetCount(sessionKey, id) {
  sessionStorage.removeItem(sessionKey);
  renderSessionStats();
  renderProviderList();
  renderTopbarBadges();
}

function clearAllCache() {
  allProviders().forEach(p => {
    if (p.sessionKey) sessionStorage.removeItem(p.sessionKey);
  });
  Object.keys(sessionStorage)
    .filter(k => k.startsWith("av_") || k.startsWith("fmp_") ||
      getCustomProviders().some(p => k.startsWith(p.id+"_")))
    .forEach(k => sessionStorage.removeItem(k));
  renderSessionStats();
  renderTopbarBadges();
  if (typeof showApiToast === "function") showApiToast("✓ Session cache cleared.", "ok");
}

/* ══════════════════════════════════════════════════════════════════
   APPLY & RELOAD
   ══════════════════════════════════════════════════════════════════ */
function applyAndReload() {
  // Save any unsaved inputs currently visible in the provider list
  allProviders().forEach(p => {
    const input = document.getElementById(`kinput-${p.id}`);
    if (!input) return;
    const val = input.value.trim();
    if (val && val.length >= 8) setKey(p.id, val);
  });
  closeApiConfig();
  renderTopbarBadges();
  const ticker = (typeof currentTicker !== "undefined") ? currentTicker : null;
  if (ticker) {
    if (typeof avLoadAll  === "function") avLoadAll(ticker);
    if (typeof fmpLoadAll === "function") fmpLoadAll(ticker);
  }
  if (typeof showApiToast === "function") showApiToast("✓ Keys applied — reloading live data…", "ok");
}

/* ══════════════════════════════════════════════════════════════════
   LEGACY SHIMS  (keep api.js / fmp.js call counter displays working)
   ══════════════════════════════════════════════════════════════════ */
function updateApiStatus() { renderTopbarBadges(); }
function updateFmpStatus() { renderTopbarBadges(); }
function refreshBadges()   { renderTopbarBadges(); }

/* ══════════════════════════════════════════════════════════════════
   INIT — runs as soon as config.js is parsed (before window.load)
   ══════════════════════════════════════════════════════════════════ */
(function init() {
  loadAllKeys();

  // Wait for DOM before touching the UI
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", afterDom);
  } else {
    afterDom();
  }

  function afterDom() {
    // Wire up tab buttons using data-tab attributes (cleaner than inline onclick)
    document.querySelectorAll(".api-tab").forEach(btn => {
      btn.addEventListener("click", () => switchApiTab(btn.dataset.tab));
    });

    // Overlay click-to-close
    const overlay = document.getElementById("apiConfigOverlay");
    if (overlay) overlay.addEventListener("click", e => { if (e.target === overlay) closeApiConfig(); });

    // Escape to close
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeApiConfig(); });

    renderTopbarBadges();

    // First-run toast if no keys set
    const hasAny = allProviders().some(p => !!getKey(p.id));
    if (!hasAny) {
      setTimeout(() => {
        if (typeof showApiToast === "function")
          showApiToast("⚙ No API keys — click the ⚙ API button to configure Alpha Vantage & FMP.", "info");
      }, 1400);
    }
  }
})();
