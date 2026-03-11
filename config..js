/* ══════════════════════════════════════════════════════════════════
   FINTERM — config.js
   API key management via localStorage
   Keys are stored ONLY in the user's browser, never transmitted
   except directly to AV / FMP endpoints.
   ══════════════════════════════════════════════════════════════════ */

const LS_AV_KEY  = "finterm_av_key";
const LS_FMP_KEY = "finterm_fmp_key";

/* ── Read keys from localStorage ────────────────────────────────── */
function getStoredAvKey()  { return localStorage.getItem(LS_AV_KEY)  || ""; }
function getStoredFmpKey() { return localStorage.getItem(LS_FMP_KEY) || ""; }

/* ── Inject stored keys into api.js / fmp.js variables ─────────── */
function applyStoredKeys() {
  const av  = getStoredAvKey();
  const fmp = getStoredFmpKey();
  if (av  && typeof AV_KEY  !== "undefined") {
    // Reassign the module-level constant via a workaround
    window._AV_KEY  = av;
  }
  if (fmp && typeof FMP_KEY !== "undefined") {
    window._FMP_KEY = fmp;
  }
  refreshBadges();
}

/* ── Modal open / close ─────────────────────────────────────────── */
function openApiConfig() {
  const overlay = document.getElementById("apiConfigOverlay");
  if (!overlay) return;

  // Pre-fill inputs with masked stored values
  const avIn  = document.getElementById("avKeyInput");
  const fmpIn = document.getElementById("fmpKeyInput");
  if (avIn)  avIn.value  = getStoredAvKey();
  if (fmpIn) fmpIn.value = getStoredFmpKey();

  // Update preview badges
  previewApiKey("av");
  previewApiKey("fmp");

  // Session stats
  refreshModalStats();

  overlay.classList.add("visible");
}

function closeApiConfig(e) {
  if (e && e.target !== document.getElementById("apiConfigOverlay")) return;
  document.getElementById("apiConfigOverlay")?.classList.remove("visible");
}

/* ── Save a key ─────────────────────────────────────────────────── */
function saveApiKey(provider) {
  const inputId = provider === "av" ? "avKeyInput" : "fmpKeyInput";
  const lsKey   = provider === "av" ? LS_AV_KEY   : LS_FMP_KEY;
  const input   = document.getElementById(inputId);
  if (!input) return;

  const val = input.value.trim();
  if (!val) { showKeyStatus(provider, "⚠ Key is empty — not saved.", "warn"); return; }
  if (val.length < 10) { showKeyStatus(provider, "⚠ Key seems too short.", "warn"); return; }

  localStorage.setItem(lsKey, val);
  applyStoredKeys();
  showKeyStatus(provider, "✓ Key saved to localStorage.", "ok");
  refreshBadges();
  refreshModalStats();
}

/* ── Clear a key ────────────────────────────────────────────────── */
function clearApiKey(provider) {
  const lsKey   = provider === "av" ? LS_AV_KEY   : LS_FMP_KEY;
  const inputId = provider === "av" ? "avKeyInput" : "fmpKeyInput";
  localStorage.removeItem(lsKey);
  const input = document.getElementById(inputId);
  if (input) input.value = "";
  applyStoredKeys();
  showKeyStatus(provider, "Key cleared.", "info");
  refreshBadges();
}

/* ── Show/hide key input ────────────────────────────────────────── */
function toggleKeyVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === "password") {
    input.type = "text";
    btn.textContent = "🙈";
  } else {
    input.type = "password";
    btn.textContent = "👁";
  }
}

/* ── Preview badge while typing ─────────────────────────────────── */
function previewApiKey(provider) {
  const inputId  = provider === "av" ? "avKeyInput"  : "fmpKeyInput";
  const badgeId  = provider === "av" ? "avBadge"     : "fmpBadge";
  const input    = document.getElementById(inputId);
  const badge    = document.getElementById(badgeId);
  if (!input || !badge) return;

  const val = input.value.trim();
  if (!val) {
    badge.textContent = "NOT SET";
    badge.className   = "api-key-badge badge-unset";
  } else {
    const masked = val.slice(0, 4) + "••••••" + val.slice(-4);
    badge.textContent = masked;
    badge.className   = "api-key-badge badge-set";
  }
}

/* ── Status line under input ────────────────────────────────────── */
function showKeyStatus(provider, msg, type) {
  const id  = provider === "av" ? "avKeyStatus" : "fmpKeyStatus";
  const el  = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className   = `api-key-status status-${type}`;
  setTimeout(() => { el.textContent = ""; }, 4000);
}

/* ── Refresh topbar badges ──────────────────────────────────────── */
function refreshBadges() {
  const avKey  = getStoredAvKey();
  const fmpKey = getStoredFmpKey();

  const avEl  = document.getElementById("apiStatus");
  const fmpEl = document.getElementById("fmpStatus");

  if (avEl) {
    if (!avKey) {
      avEl.className = "api-status api-unconfigured";
      avEl.title     = "Alpha Vantage key not set — click to configure";
    } else {
      const n = parseInt(sessionStorage.getItem("av_call_count") || "0");
      avEl.className = "api-status " + (n >= 25 ? "api-limit" : n >= 20 ? "api-warn" : "api-ok");
      avEl.title     = `Alpha Vantage: ${n}/25 daily calls · click to configure`;
    }
  }

  if (fmpEl) {
    if (!fmpKey) {
      fmpEl.className = "api-status api-unconfigured";
      fmpEl.title     = "FMP key not set — click to configure";
    } else {
      const n = parseInt(sessionStorage.getItem("fmp_call_count") || "0");
      fmpEl.className = "api-status " + (n >= 280 ? "api-limit" : n >= 230 ? "api-warn" : "api-ok");
      fmpEl.title     = `FMP: ${n} calls this session · click to configure`;
    }
  }
}

/* ── Modal stats ────────────────────────────────────────────────── */
function refreshModalStats() {
  const avN  = sessionStorage.getItem("av_call_count")  || "0";
  const fmpN = sessionStorage.getItem("fmp_call_count") || "0";
  const cacheCount = Object.keys(sessionStorage).filter(k => k.startsWith("av_") || k.startsWith("fmp_")).length;

  const avEl    = document.getElementById("modalAvCount");
  const fmpEl   = document.getElementById("modalFmpCount");
  const cacheEl = document.getElementById("modalCacheCount");
  if (avEl)    avEl.textContent    = `${avN} / 25`;
  if (fmpEl)   fmpEl.textContent   = `${fmpN}`;
  if (cacheEl) cacheEl.textContent = `${cacheCount} entries`;
}

/* ── Clear session cache ─────────────────────────────────────────── */
function clearAllCache() {
  const keys = Object.keys(sessionStorage).filter(k => k.startsWith("av_") || k.startsWith("fmp_"));
  keys.forEach(k => sessionStorage.removeItem(k));
  sessionStorage.removeItem("av_call_count");
  sessionStorage.removeItem("fmp_call_count");
  refreshModalStats();
  if (typeof updateApiStatus  === "function") updateApiStatus();
  if (typeof updateFmpStatus  === "function") updateFmpStatus();
  showApiToast("✓ Session cache cleared. Next load will fetch fresh data.", "ok");
}

/* ── Apply & reload ─────────────────────────────────────────────── */
function applyAndReload() {
  // Save both fields if they have values
  const avIn  = document.getElementById("avKeyInput")?.value.trim();
  const fmpIn = document.getElementById("fmpKeyInput")?.value.trim();
  if (avIn  && avIn.length  >= 10) { localStorage.setItem(LS_AV_KEY,  avIn);  }
  if (fmpIn && fmpIn.length >= 10) { localStorage.setItem(LS_FMP_KEY, fmpIn); }

  applyStoredKeys();
  document.getElementById("apiConfigOverlay")?.classList.remove("visible");

  if (typeof currentTicker !== "undefined" && currentTicker) {
    if (typeof avLoadAll  === "function") avLoadAll(currentTicker);
    if (typeof fmpLoadAll === "function") fmpLoadAll(currentTicker);
  }
  showApiToast("✓ Keys applied. Reloading live data…", "ok");
}

/* ══════════════════════════════════════════════════════════════════
   PATCH api.js / fmp.js to use localStorage keys at runtime
   Called once after all scripts load.
   The trick: override the avFetch / fmpFetch URL builders to read
   window._AV_KEY / window._FMP_KEY which we set from localStorage.
   ══════════════════════════════════════════════════════════════════ */
function patchApiKeys() {
  const av  = getStoredAvKey();
  const fmp = getStoredFmpKey();
  if (av)  window._AV_KEY  = av;
  if (fmp) window._FMP_KEY = fmp;
}

/* ── Init on page load ───────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  patchApiKeys();
  refreshBadges();

  // Show first-run prompt if no keys configured
  const hasAv  = !!getStoredAvKey();
  const hasFmp = !!getStoredFmpKey();
  if (!hasAv && !hasFmp) {
    setTimeout(() => {
      showApiToast("⚙ No API keys found — click AV or FMP badge to configure.", "info");
    }, 1200);
  }
});
