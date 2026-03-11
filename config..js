/* ══════════════════════════════════════════════════════════════════
   FINTERM — config.js  (v3 — bulletproof, zero external deps)
   ══════════════════════════════════════════════════════════════════ */

/* ── Local escapeHtml (config.js loads before script.js) ──────── */
function cfgEsc(s) {
  return String(s ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

/* ── Provider registry ──────────────────────────────────────────── */
const KNOWN_PROVIDERS = [
  { id:"av",  name:"Alpha Vantage",           badge:"AV",
    desc:"Quote · Fundamentals · Earnings · Income / Balance / Cash Flow · News + Sentiment",
    limit:"25 req/day (free)", docsUrl:"https://www.alphavantage.co/support/#api-key",
    sessionKey:"av_call_count", limitWarn:20, limitMax:25 },
  { id:"fmp", name:"Financial Modeling Prep", badge:"FMP",
    desc:"Analyst Ratings · Targets · Estimates · Holders · Insiders · Management · Events · Ratios",
    limit:"250 req/day (free)", docsUrl:"https://financialmodelingprep.com/developer/docs/",
    sessionKey:"fmp_call_count", limitWarn:200, limitMax:250 },
];

/* ── Runtime key store ──────────────────────────────────────────── */
window._KEYS = {};
const lsId   = id => `finterm_key_${id}`;
const getKey = id => window._KEYS[id] || localStorage.getItem(lsId(id)) || "";
const setKey = (id, v) => { localStorage.setItem(lsId(id), v); window._KEYS[id] = v; };
const delKey = id => { localStorage.removeItem(lsId(id)); delete window._KEYS[id]; };
const mask   = v  => v.length > 8 ? v.slice(0,4)+"••••••"+v.slice(-4) : "••••••••";

/* Backwards-compat shims for api.js / fmp.js */
function getAvKey()  { return getKey("av");  }
function getFmpKey() { return getKey("fmp"); }

function loadAllKeys() {
  allProviders().forEach(p => {
    const v = localStorage.getItem(lsId(p.id));
    if (v) window._KEYS[p.id] = v;
  });
}

/* ── Custom providers ───────────────────────────────────────────── */
const LS_CUSTOM = "finterm_custom_providers";
function getCustom() { try { return JSON.parse(localStorage.getItem(LS_CUSTOM)||"[]"); } catch { return []; } }
function saveCustom(list) { localStorage.setItem(LS_CUSTOM, JSON.stringify(list)); }
function allProviders() { return [...KNOWN_PROVIDERS, ...getCustom()]; }

/* ══════════════════════════════════════════════════════════════════
   TOPBAR BADGES
   ══════════════════════════════════════════════════════════════════ */
function renderTopbarBadges() {
  const btn = document.querySelector(".api-config-btn");
  if (!btn) return;
  document.querySelectorAll(".api-dyn-badge").forEach(el => el.remove());

  allProviders().forEach(p => {
    const key = getKey(p.id);
    const n   = parseInt(sessionStorage.getItem(p.sessionKey||"")||"0");
    const cls = !key ? "api-unconfigured"
              : (p.limitMax && n >= p.limitMax)   ? "api-limit"
              : (p.limitWarn && n >= p.limitWarn) ? "api-warn"
              : "api-ok";
    const el  = document.createElement("div");
    el.className = `api-status api-dyn-badge ${cls}`;
    el.title     = key ? `${p.name}: ${n}${p.limitMax?"/"+p.limitMax:""} calls` : `${p.name}: not configured`;
    el.style.cursor = "pointer";
    el.innerHTML = `<span class="api-dot"></span><span>${cfgEsc(p.badge)}</span>`
                 + (key ? `<span>${n}${p.limitMax?"/"+p.limitMax:""}</span>` : "");
    el.addEventListener("click", () => openApiConfig(p.id));
    btn.insertAdjacentElement("beforebegin", el);
  });
}

/* Shims called by api.js / fmp.js */
function updateApiStatus() { renderTopbarBadges(); }
function updateFmpStatus() { renderTopbarBadges(); }
function refreshBadges()   { renderTopbarBadges(); }

/* ══════════════════════════════════════════════════════════════════
   MODAL — open/close via style.display (no CSS class needed)
   ══════════════════════════════════════════════════════════════════ */
let _focusId = null;

function openApiConfig(focusId) {
  _focusId = focusId || null;
  const overlay = document.getElementById("apiConfigOverlay");
  if (!overlay) { console.error("FINTERM: #apiConfigOverlay not found"); return; }

  /* Force visible — bypasses any CSS specificity issues */
  overlay.style.display        = "flex";
  overlay.style.opacity        = "1";
  overlay.style.pointerEvents  = "all";

  renderProviderList();
  renderCustomSaved();
  renderSessionStats();
  switchApiTab("providers");

  if (focusId) {
    setTimeout(() => {
      document.getElementById(`pblock-${focusId}`)?.scrollIntoView({ behavior:"smooth", block:"center" });
      document.getElementById(`kinput-${focusId}`)?.focus();
    }, 80);
  }
}

function closeApiConfig() {
  const overlay = document.getElementById("apiConfigOverlay");
  if (!overlay) return;
  overlay.style.opacity = "0";
  setTimeout(() => { overlay.style.display = "none"; }, 200);
}

function switchApiTab(tabId) {
  document.querySelectorAll(".api-tab")
    .forEach(b => b.classList.toggle("active", b.dataset.tab === tabId));
  document.querySelectorAll(".api-tab-pane")
    .forEach(p => p.classList.toggle("active", p.id === `apiTab-${tabId}`));
  if (tabId === "session") renderSessionStats();
  if (tabId === "custom")  renderCustomSaved();
}

/* ══════════════════════════════════════════════════════════════════
   PROVIDERS TAB
   ══════════════════════════════════════════════════════════════════ */
function renderProviderList() {
  const box = document.getElementById("apiProviderList");
  if (!box) return;

  box.innerHTML = allProviders().map((p, i, arr) => {
    const val  = getKey(p.id);
    const n    = parseInt(sessionStorage.getItem(p.sessionKey||"")||"0");
    const bCls = !val ? "badge-unset" : (p.limitMax && n >= p.limitMax) ? "badge-limit" : "badge-set";
    const bLbl = !val ? "NOT SET"     : (p.limitMax && n >= p.limitMax) ? "LIMIT"       : mask(val);

    return `
    <div class="api-key-block${_focusId===p.id?" api-key-block-focus":""}" id="pblock-${cfgEsc(p.id)}">
      <div class="api-key-provider">
        <div class="api-key-provider-left">
          <span class="api-badge-pill">${cfgEsc(p.badge)}</span>
          <div>
            <div class="api-key-name">${cfgEsc(p.name)}</div>
            <div class="api-key-limit">${cfgEsc(p.limit||"")}</div>
          </div>
        </div>
        <span class="api-key-badge ${bCls}">${cfgEsc(bLbl)}</span>
      </div>
      ${p.desc ? `<div class="api-key-desc">${cfgEsc(p.desc)}${p.docsUrl
        ? ` · <a href="${cfgEsc(p.docsUrl)}" target="_blank" rel="noopener">Get free key →</a>` : ""}</div>` : ""}
      <div class="api-key-input-row">
        <input type="password" id="kinput-${cfgEsc(p.id)}" class="api-key-field"
               placeholder="Paste API key here…" value="${cfgEsc(val)}"
               autocomplete="off" spellcheck="false"
               oninput="livePreviewKey('${cfgEsc(p.id)}')" />
        <button class="api-key-eye" title="Show/hide"
                onclick="toggleKeyVis('kinput-${cfgEsc(p.id)}',this)">👁</button>
        <button class="api-key-save"  onclick="saveKey('${cfgEsc(p.id)}')">Save</button>
        <button class="api-key-clear" onclick="clearKey('${cfgEsc(p.id)}')">Clear</button>
      </div>
      <div class="api-key-status" id="kstatus-${cfgEsc(p.id)}"></div>
      ${val && p.sessionKey ? `<div class="api-key-usage">
        Session calls: <strong>${n}</strong>${p.limitMax?" / "+p.limitMax:""}
        ${n>0?`<button class="api-reset-count-btn" onclick="resetCount('${cfgEsc(p.sessionKey)}','${cfgEsc(p.id)}')">Reset</button>`:""}
      </div>`:""}
      ${p.custom?`<button class="api-custom-del-btn" style="margin-top:6px"
          onclick="removeCustom('${cfgEsc(p.id)}')">✕ Remove</button>`:""}
    </div>
    ${i<arr.length-1?'<div class="api-modal-divider"></div>':""}`;
  }).join("");
}

/* ══════════════════════════════════════════════════════════════════
   KEY ACTIONS
   ══════════════════════════════════════════════════════════════════ */
function saveKey(id) {
  const input = document.getElementById(`kinput-${id}`);
  if (!input) return;
  const val = input.value.trim();
  if (!val)        { setStatus(id,"⚠ Key is empty.","warn"); return; }
  if (val.length<8){ setStatus(id,"⚠ Key seems too short.","warn"); return; }
  setKey(id, val);
  setStatus(id, `✓ Saved — ${mask(val)}`, "ok");
  renderProviderList();
  renderTopbarBadges();
}

function clearKey(id) {
  delKey(id);
  const inp = document.getElementById(`kinput-${id}`);
  if (inp) inp.value = "";
  setStatus(id,"Key cleared.","info");
  renderTopbarBadges();
}

function livePreviewKey(id) {
  const inp   = document.getElementById(`kinput-${id}`);
  const badge = document.querySelector(`#pblock-${id} .api-key-badge`);
  if (!inp||!badge) return;
  const v = inp.value.trim();
  badge.textContent = v ? mask(v) : "NOT SET";
  badge.className   = "api-key-badge "+(v?"badge-set":"badge-unset");
}

function toggleKeyVis(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  inp.type        = inp.type==="password" ? "text" : "password";
  btn.textContent = inp.type==="password" ? "👁" : "🙈";
}

function setStatus(id, msg, type) {
  const el = document.getElementById(`kstatus-${id}`);
  if (!el) return;
  el.textContent = msg;
  el.className   = `api-key-status status-${type}`;
  setTimeout(()=>{ el.textContent=""; el.className="api-key-status"; }, 4000);
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

  if (!name){ setCustomStatus("⚠ Name required.","warn"); return; }
  if (!id)  { setCustomStatus("⚠ Short ID required.","warn"); return; }
  if (id.length>6){ setCustomStatus("⚠ ID must be ≤ 6 chars.","warn"); return; }
  if (allProviders().some(p=>p.id===id)){ setCustomStatus(`⚠ ID "${id}" already exists.`,"warn"); return; }

  const p = { id, name, badge:id.toUpperCase().slice(0,5),
    desc:desc||"", limit:"Varies", docsUrl:url||"",
    sessionKey:`${id}_call_count`, custom:true };
  const list = getCustom(); list.push(p); saveCustom(list);
  if (key && key.length>=8) setKey(id, key);

  ["customName","customId","customKey","customDesc","customUrl"]
    .forEach(fid=>{ const el=document.getElementById(fid); if(el) el.value=""; });

  setCustomStatus(`✓ "${name}" added. Access via window._KEYS["${id}"]`,"ok");
  renderCustomSaved();
  renderTopbarBadges();
}

function removeCustom(id) {
  saveCustom(getCustom().filter(p=>p.id!==id));
  delKey(id);
  renderCustomSaved();
  renderProviderList();
  renderTopbarBadges();
}

function renderCustomSaved() {
  const box = document.getElementById("customSavedList");
  if (!box) return;
  const list = getCustom();
  if (!list.length) { box.innerHTML=`<div class="api-custom-empty">No custom providers yet.</div>`; return; }
  box.innerHTML = list.map(p => {
    const val = getKey(p.id);
    return `<div class="api-custom-saved-row">
      <span class="api-badge-pill" style="font-size:9px">${cfgEsc(p.badge)}</span>
      <div class="api-custom-saved-info">
        <strong>${cfgEsc(p.name)}</strong>
        <span>${val?mask(val):"no key saved"}</span>
      </div>
      <button class="api-custom-edit-btn" onclick="openApiConfig('${cfgEsc(p.id)}')">Edit</button>
      <button class="api-custom-del-btn"  onclick="removeCustom('${cfgEsc(p.id)}')">✕</button>
    </div>`;
  }).join("");
}

function setCustomStatus(msg, type) {
  const el = document.getElementById("customStatus");
  if (!el) return;
  el.textContent = msg; el.className = `api-key-status status-${type}`;
  setTimeout(()=>{ el.textContent=""; el.className="api-key-status"; }, 5000);
}

/* ══════════════════════════════════════════════════════════════════
   SESSION STATS TAB
   ══════════════════════════════════════════════════════════════════ */
function renderSessionStats() {
  const box = document.getElementById("apiSessionStats");
  if (!box) return;
  const cacheN = Object.keys(sessionStorage)
    .filter(k=>allProviders().some(p=>k.startsWith(p.id+"_")||k.startsWith("av_")||k.startsWith("fmp_"))).length;
  box.innerHTML = allProviders().map(p => {
    const key = getKey(p.id);
    const n   = parseInt(sessionStorage.getItem(p.sessionKey||"")||"0");
    const cls = !key?"stat-unset": n>(p.limitWarn||Infinity)?"stat-warn":"stat-ok";
    return `<div class="api-stat-row">
      <span><span class="api-badge-pill" style="font-size:8px;padding:1px 5px">${cfgEsc(p.badge)}</span> ${cfgEsc(p.name)}</span>
      <span class="${cls}">${key?`${n}${p.limitMax?" / "+p.limitMax:""}` : "no key"}</span>
    </div>`;
  }).join("")
  + `<div class="api-stat-row" style="border-top:1px solid var(--border);margin-top:6px;padding-top:8px">
      <span>Cache entries</span><span>${cacheN}</span>
    </div>`;
}

function resetCount(sessionKey, id) {
  sessionStorage.removeItem(sessionKey);
  renderSessionStats(); renderProviderList(); renderTopbarBadges();
}

function clearAllCache() {
  allProviders().forEach(p=>{ if(p.sessionKey) sessionStorage.removeItem(p.sessionKey); });
  Object.keys(sessionStorage)
    .filter(k=>k.startsWith("av_")||k.startsWith("fmp_")||getCustom().some(p=>k.startsWith(p.id+"_")))
    .forEach(k=>sessionStorage.removeItem(k));
  renderSessionStats(); renderTopbarBadges();
  if (typeof showApiToast==="function") showApiToast("✓ Session cache cleared.","ok");
}

/* ══════════════════════════════════════════════════════════════════
   APPLY & RELOAD
   ══════════════════════════════════════════════════════════════════ */
function applyAndReload() {
  allProviders().forEach(p => {
    const inp = document.getElementById(`kinput-${p.id}`);
    if (!inp) return;
    const val = inp.value.trim();
    if (val && val.length>=8) setKey(p.id, val);
  });
  closeApiConfig();
  renderTopbarBadges();
  const ticker = (typeof currentTicker!=="undefined") ? currentTicker : null;
  if (ticker) {
    if (typeof avLoadAll==="function")  avLoadAll(ticker);
    if (typeof fmpLoadAll==="function") fmpLoadAll(ticker);
  }
  if (typeof showApiToast==="function") showApiToast("✓ Keys applied — reloading live data…","ok");
}

/* ══════════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════════ */
(function init() {
  loadAllKeys();

  function afterDom() {
    /* Wire tab buttons */
    document.querySelectorAll(".api-tab").forEach(btn => {
      btn.addEventListener("click", () => switchApiTab(btn.dataset.tab));
    });

    /* Overlay backdrop click closes */
    const overlay = document.getElementById("apiConfigOverlay");
    if (overlay) {
      /* Start hidden */
      overlay.style.display     = "none";
      overlay.style.opacity     = "0";
      overlay.style.transition  = "opacity 0.2s";
      overlay.addEventListener("click", e => { if (e.target===overlay) closeApiConfig(); });
    }

    /* Escape closes */
    document.addEventListener("keydown", e => { if (e.key==="Escape") closeApiConfig(); });

    renderTopbarBadges();

    /* First-run toast */
    if (!allProviders().some(p=>!!getKey(p.id))) {
      setTimeout(()=>{
        if (typeof showApiToast==="function")
          showApiToast("⚙ No API keys — click the ⚙ API button to configure.","info");
      }, 1400);
    }
  }

  if (document.readyState==="loading")
    document.addEventListener("DOMContentLoaded", afterDom);
  else
    afterDom();
})();
