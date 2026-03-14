/* ══════════════════════════════════════════════════════════════════
   FINTERM — config.js  (v4 — sidebar API panel)
   ══════════════════════════════════════════════════════════════════ */

function cfgEsc(s) {
  return String(s ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

const KNOWN_PROVIDERS = [
  { id:"av",  name:"Alpha Vantage",           badge:"AV",
    desc:"Quote · Fundamentals · Earnings · Income / Balance / Cash Flow · News + Sentiment",
    limit:"25 req/day (free)", docsUrl:"https://www.alphavantage.co/support/#api-key",
    sessionKey:"av_call_count", limitWarn:20, limitMax:25 },
  { id:"fmp", name:"Financial Modeling Prep", badge:"FMP",
    desc:"Analyst Ratings · Targets · Estimates · Holders · Insiders · Management · Events · Ratios",
    limit:"250 req/day (free)", docsUrl:"https://financialmodelingprep.com/developer/docs/",
    sessionKey:"fmp_call_count", limitWarn:200, limitMax:250 },
  { id:"finnhub", name:"Finnhub", badge:"FH",
    desc:"Quote · Analyst Consensus · Price Targets · Upgrades/Downgrades · Insider Transactions · Institutional Holders · Company News · Peers · Economic Calendar · WebSocket prezzi live",
    limit:"60 req/min (free)", docsUrl:"https://finnhub.io/docs/api",
    sessionKey:"fh_call_count", limitWarn:50, limitMax:60 },
  { id:"ninjas", name:"API Ninjas — Earnings Transcripts", badge:"NJA",
    desc:"Earnings Call Transcripts — testo integrale con speaker labels (CEO, CFO, Analyst) · ~10K req/mese free · Fallback automatico a FMP /earning_call_transcript · Usato dal tab TRANS in Fundamentals",
    limit:"~10,000 req/mese (free)", docsUrl:"https://api-ninjas.com/api/earningscalltranscript",
    sessionKey:"ninjas_call_count", limitWarn:9000, limitMax:10000 },
  { id:"openaq", name:"OpenAQ v3 — Air Quality", badge:"AQI",
    desc:"Qualità aria in tempo reale · PM2.5, PM10, NO2, O3, CO, SO2 da 30.000+ stazioni in 100+ paesi · Collegato automaticamente all'HQ dell'azienda caricata · Usato dal tab 💨 AIR in Geo·Risk",
    limit:"Generoso free tier — nessun limite fisso", docsUrl:"https://api.openaq.org/",
    sessionKey:"openaq_call_count", limitWarn:null, limitMax:null },
  { id:"fred", name:"FRED (St. Louis Fed)", badge:"FRD",
    desc:"840K+ economic series: Yield Curve (DGS1M–DGS30) · CPI · GDP · Unemployment · Fed Funds Rate · Inflation Breakeven · HY Spreads · Tassi BCE/BoE/BoJ",
    limit:"Unlimited (free)", docsUrl:"https://fred.stlouisfed.org/docs/api/fred/",
    sessionKey:"fred_call_count", limitWarn:null, limitMax:null },
  { id:"openexchange", name:"Open Exchange Rates", badge:"OER",
    desc:"200+ currency pairs · Forex rates live + historical · Currency converter · Exotic pairs (VND, NGN, KES, IDR…) · 1K req/month free",
    limit:"1,000 req/month (free)", docsUrl:"https://openexchangerates.org/account/app-ids",
    sessionKey:"oer_call_count", limitWarn:900, limitMax:1000 },
  { id:"yahoo", name:"Yahoo Finance (RapidAPI)", badge:"YHO",
    desc:"Options chain · Income statement · Institutional holders · Trending tickers · Analyst consensus · Peer comparison · 52W price history — Optional: all features fall back to FMP/AV when key is absent",
    limit:"500 req/month (free tier)", docsUrl:"https://rapidapi.com/search/yahoo+finance",
    sessionKey:"yf_call_count", limitWarn:450, limitMax:500 },
  { id:"eodhd", name:"EODHD", badge:"EOD",
    desc:"Quote live/EOD · Fondamentali globali (150K+ ticker) · News · Dividendi · Earnings Calendar · Screener · 70+ borse",
    limit:"20 req/day (free) — illimitato sui piani paid", docsUrl:"https://eodhd.com/financial-apis/quick-start-with-our-financial-data-apis",
    sessionKey:"eodhd_call_count", limitWarn:15, limitMax:20 },
  { id:"apitube", name:"APITube", badge:"APT",
    desc:"Financial News real-time · YouTube/Video news · Sentiment NLP · 500K+ fonti · Filtro ticker / settore / lingua",
    limit:"Varia per piano (free tier disponibile)", docsUrl:"https://apitube.io/en-it/blog/post/how-to-get-started-with-apitube-news-api-a-step-by-step-guide",
    sessionKey:"apitube_call_count", limitWarn:80, limitMax:100 },
  { id:"massive", name:"Massive", badge:"MSV",
    desc:"Alternative data · Macro indicators · Institutional flow · Economic calendar · Sentiment crowd",
    limit:"Varia per piano", docsUrl:"https://massive.io/",
    sessionKey:"massive_call_count", limitWarn:null, limitMax:null },
];

window._KEYS = {};
const lsId   = id => `finterm_key_${id}`;
const getKey = id => window._KEYS[id] || localStorage.getItem(lsId(id)) || "";
const setKey = (id, v) => { localStorage.setItem(lsId(id), v); window._KEYS[id] = v; };
const delKey = id => { localStorage.removeItem(lsId(id)); delete window._KEYS[id]; };
const mask   = v  => v.length > 8 ? v.slice(0,4)+"••••••"+v.slice(-4) : "••••••••";

function getAvKey()          { return getKey("av");           }
function getFmpKey()         { return getKey("fmp");          }
function getYahooKey()       { return getKey("yahoo");        }
function getNinjasKey()      { return getKey("ninjas");       }
function getOpenAQKey()      { return getKey("openaq");       }
function getFinnhubKey()     { return getKey("finnhub");      }
function getFredKey()        { return getKey("fred");         }
function getOpenExchangeKey(){ return getKey("openexchange"); }
function getEodhdKey()       { return getKey("eodhd");        }
function getApitubeKey()     { return getKey("apitube");      }
function getMassiveKey()     { return getKey("massive");      }

function loadAllKeys() {
  allProviders().forEach(p => {
    const v = localStorage.getItem(lsId(p.id));
    if (v) window._KEYS[p.id] = v;
  });
}

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

function updateApiStatus() { renderTopbarBadges(); }
function updateFmpStatus() { renderTopbarBadges(); }
function refreshBadges()   { renderTopbarBadges(); }

/* ══════════════════════════════════════════════════════════════════
   SIDEBAR
   ══════════════════════════════════════════════════════════════════ */
let _focusId = null;
let _sidebarOpen = false;

function openApiConfig(focusId) {
  _focusId = focusId || null;
  const sidebar = document.getElementById("apiSidebar");
  if (!sidebar) return;

  _sidebarOpen = true;
  sidebar.classList.add("open");
  document.querySelector(".api-config-btn")?.classList.add("active");

  renderProviderList();
  renderCustomSaved();
  renderSessionStats();
  switchApiTab("providers");

  if (focusId) {
    setTimeout(() => {
      document.getElementById(`pblock-${focusId}`)?.scrollIntoView({ behavior:"smooth", block:"center" });
      document.getElementById(`kinput-${focusId}`)?.focus();
    }, 200);
  }
}

function closeApiConfig() {
  _sidebarOpen = false;
  document.getElementById("apiSidebar")?.classList.remove("open");
  document.querySelector(".api-config-btn")?.classList.remove("active");
}

function toggleApiSidebar() {
  _sidebarOpen ? closeApiConfig() : openApiConfig();
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
        ? ` &middot; <a href="${cfgEsc(p.docsUrl)}" target="_blank" rel="noopener">Get free key &rarr;</a>` : ""}</div>` : ""}
      <div class="api-key-input-row">
        <input type="password" id="kinput-${cfgEsc(p.id)}" class="api-key-field"
               placeholder="Paste API key here…" value="${cfgEsc(val)}"
               autocomplete="off" spellcheck="false"
               oninput="livePreviewKey('${cfgEsc(p.id)}')" />
        <button class="api-key-eye" title="Show/hide"
                onclick="toggleKeyVis('kinput-${cfgEsc(p.id)}',this)">&#128065;</button>
        <button class="api-key-save"  onclick="saveKey('${cfgEsc(p.id)}')">Save</button>
        <button class="api-key-clear" onclick="clearKey('${cfgEsc(p.id)}')">Clear</button>
      </div>
      <div class="api-key-status" id="kstatus-${cfgEsc(p.id)}"></div>
      ${val && p.sessionKey ? `<div class="api-key-usage">
        Session calls: <strong>${n}</strong>${p.limitMax?" / "+p.limitMax:""}
        ${n>0?`<button class="api-reset-count-btn" onclick="resetCount('${cfgEsc(p.sessionKey)}','${cfgEsc(p.id)}')">Reset</button>`:""}
      </div>`:""}
      ${p.custom?`<button class="api-custom-del-btn" style="margin-top:6px"
          onclick="removeCustom('${cfgEsc(p.id)}')">&#10005; Remove</button>`:""}
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
  if (!val)        { setStatus(id,"&#9888; Key is empty.","warn"); return; }
  if (val.length<8){ setStatus(id,"&#9888; Key seems too short.","warn"); return; }
  setKey(id, val);
  setStatus(id, "&#10003; Saved &mdash; " + mask(val), "ok");
  renderProviderList();
  renderTopbarBadges();

  // Auto-reload live data immediately after saving a key
  const ticker = (typeof currentTicker !== "undefined") ? currentTicker.replace(/.*:/,"").toUpperCase() : null;
  if (!ticker) return;
  if (id === "av"  && typeof avLoadAll      === "function") setTimeout(() => avLoadAll(ticker), 200);
  if (id === "fmp"     && typeof fmpLoadAll      === "function") setTimeout(() => fmpLoadAll(ticker), 200);
  if (id === "finnhub" && typeof finnhubLoadAll  === "function") setTimeout(() => finnhubLoadAll(ticker), 200);
  if (id === "finnhub" && typeof fhWsReconnect   === "function") setTimeout(() => fhWsReconnect(), 500);
  if (id === "openaq"  && typeof openaqLoadCity   === "function") setTimeout(() => openaqLoadCity(), 500);
  if (id === "eodhd"   && typeof eodhdLoadAll   === "function") setTimeout(() => eodhdLoadAll(ticker), 200);
  if (id === "apitube" && typeof apitubeLoadAll  === "function") setTimeout(() => apitubeLoadAll(ticker), 200);
  if (id === "massive" && typeof massiveLoadAll  === "function") setTimeout(() => massiveLoadAll(ticker), 200);
  if (id === "fred"         && typeof fredInitAll       === "function") setTimeout(() => fredInitAll(), 200);
  if (id === "openexchange" && typeof oerLoadRates      === "function") setTimeout(() => { oerLoadRates(); oerLoadCurrencyList(); }, 200);
  if (id === "yahoo"        && typeof yfLoadTrending    === "function") setTimeout(() => yfLoadTrending(), 200);
  if (id === "ninjas" && typeof fmpLoadTranscript === "function") setTimeout(() => fmpLoadTranscript(ticker), 300);

  // Hide setup banners when key is configured
  const bannerMap = { ninjas: "trans-setup-banner", openaq: "airqual-setup-banner" };
  if (bannerMap[id]) {
    const b = document.getElementById(bannerMap[id]);
    if (b) b.style.display = "none";
  }
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
  btn.textContent = inp.type==="password" ? "\uD83D\uDC41" : "\uD83D\uDE48";
}

function setStatus(id, msg, type) {
  const el = document.getElementById(`kstatus-${id}`);
  if (!el) return;
  el.innerHTML = msg;
  el.className = `api-key-status status-${type}`;
  setTimeout(()=>{ el.innerHTML=""; el.className="api-key-status"; }, 4000);
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

  if (!name){ setCustomStatus("&#9888; Name required.","warn"); return; }
  if (!id)  { setCustomStatus("&#9888; Short ID required.","warn"); return; }
  if (id.length>6){ setCustomStatus("&#9888; ID must be 6 chars max.","warn"); return; }
  if (allProviders().some(p=>p.id===id)){ setCustomStatus(`&#9888; ID "${id}" already exists.`,"warn"); return; }

  const p = { id, name, badge:id.toUpperCase().slice(0,5),
    desc:desc||"", limit:"Varies", docsUrl:url||"",
    sessionKey:`${id}_call_count`, custom:true };
  const list = getCustom(); list.push(p); saveCustom(list);
  if (key && key.length>=8) setKey(id, key);

  ["customName","customId","customKey","customDesc","customUrl"]
    .forEach(fid=>{ const el=document.getElementById(fid); if(el) el.value=""; });

  setCustomStatus(`&#10003; "${name}" added. window._KEYS["${id}"]`,"ok");
  renderCustomSaved();
  renderProviderList();
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
      <button class="api-custom-del-btn"  onclick="removeCustom('${cfgEsc(p.id)}')">&#10005;</button>
    </div>`;
  }).join("");
}

function setCustomStatus(msg, type) {
  const el = document.getElementById("customStatus");
  if (!el) return;
  el.innerHTML = msg; el.className = `api-key-status status-${type}`;
  setTimeout(()=>{ el.innerHTML=""; el.className="api-key-status"; }, 5000);
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
  if (typeof showApiToast==="function") showApiToast("&#10003; Session cache cleared.","ok");
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
  const rawTicker = (typeof currentTicker!=="undefined") ? currentTicker : null;
  const sym = rawTicker ? rawTicker.replace(/.*:/,"").toUpperCase() : null;
  if (sym) {
    if (typeof avLoadAll==="function")  avLoadAll(sym);
    else if (typeof fmpLoadAll==="function") fmpLoadAll(sym);
    if (typeof finnhubLoadAll==="function") finnhubLoadAll(sym);
    if (typeof eodhdLoadAll  ==="function") eodhdLoadAll(sym);
    if (typeof apitubeLoadAll==="function") apitubeLoadAll(sym);
    if (typeof massiveLoadAll==="function") massiveLoadAll(sym);
  }
  if (typeof showApiToast==="function") showApiToast("&#10003; Keys applied &mdash; loading live data&hellip;","ok");
}

/* ══════════════════════════════════════════════════════════════════
   INJECT SIDEBAR
   ══════════════════════════════════════════════════════════════════ */
function injectSidebarHTML() {
  if (document.getElementById("apiSidebar")) return;

  const sidebar = document.createElement("div");
  sidebar.id = "apiSidebar";
  sidebar.className = "api-sidebar";
  sidebar.innerHTML = `
    <div class="api-sidebar-header">
      <div class="api-sidebar-title">
        <span>&#9881;</span>
        <span>API Keys</span>
      </div>
      <button class="api-sidebar-close" onclick="closeApiConfig()" title="Close">&#10005;</button>
    </div>

    <div class="api-tab-bar">
      <button class="api-tab active" data-tab="providers">Providers</button>
      <button class="api-tab" data-tab="custom">+ Custom</button>
      <button class="api-tab" data-tab="session">Session</button>
      <button class="api-tab" data-tab="cache" onclick="if(typeof sbcRenderStats===\'function\')sbcRenderStats()">💾 Cache</button>
    </div>

    <div class="api-sidebar-body">
      <div class="api-tab-pane active" id="apiTab-providers">
        <div id="apiProviderList"></div>
      </div>

      <div class="api-tab-pane" id="apiTab-custom">
        <div class="api-custom-intro">
          Register any API not listed above. The key is stored in <code>localStorage</code>
          and accessible via <code>window._KEYS["id"]</code>.
        </div>
        <div class="api-custom-form">
          <div class="api-custom-row">
            <label>Provider Name <span class="api-custom-hint">(e.g. Polygon.io)</span></label>
            <input type="text" id="customName" class="api-key-field" placeholder="My API Provider" />
          </div>
          <div class="api-custom-row">
            <label>Short ID <span class="api-custom-hint">(max 6 chars, e.g. plg)</span></label>
            <input type="text" id="customId" class="api-key-field" placeholder="plg" maxlength="6" />
          </div>
          <div class="api-custom-row">
            <label>API Key <span class="api-custom-hint">(optional)</span></label>
            <input type="password" id="customKey" class="api-key-field" placeholder="Paste key…" autocomplete="off" />
          </div>
          <div class="api-custom-row">
            <label>Description <span class="api-custom-hint">(optional)</span></label>
            <input type="text" id="customDesc" class="api-key-field" placeholder="What this API provides…" />
          </div>
          <div class="api-custom-row">
            <label>Docs URL <span class="api-custom-hint">(optional)</span></label>
            <input type="text" id="customUrl" class="api-key-field" placeholder="https://…" />
          </div>
          <button class="api-custom-add-btn" onclick="addCustomProvider()">+ Add Provider</button>
          <div class="api-key-status" id="customStatus"></div>
        </div>
        <div class="api-modal-divider" style="margin:16px 0 10px"></div>
        <div class="api-custom-saved-title">Saved Custom Providers</div>
        <div id="customSavedList"></div>
      </div>

      <div class="api-tab-pane" id="apiTab-session">
        <div class="api-session-stats" id="apiSessionStats"></div>
        <button class="api-clear-cache-btn" style="margin-top:12px" onclick="clearAllCache()">Clear Session Cache</button>
      </div>

      <div class="api-tab-pane" id="apiTab-cache">
        <div id="sbc-manager">
          <div class="sbc-header">
            <span class="sbc-title">API Cache (Supabase ft_cache)</span>
            <span id="sbc-status-dot" class="sbc-status-dot">● Connecting…</span>
          </div>
          <div id="sbc-status" class="sbc-status-bar">Loading stats…</div>
        </div>
      </div>
    </div>

    <div class="api-sidebar-footer">
      <div class="api-modal-note-inline">
        Keys saved to <code>localStorage</code> &mdash; persist across sessions.
      </div>
      <button class="api-modal-apply" onclick="applyAndReload()">Apply &amp; Reload</button>
    </div>
  `;

  document.body.appendChild(sidebar);

  sidebar.querySelectorAll(".api-tab").forEach(btn => {
    btn.addEventListener("click", () => switchApiTab(btn.dataset.tab));
  });
}

/* ══════════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════════ */
(function init() {
  loadAllKeys();

  function afterDom() {
    injectSidebarHTML();
    document.addEventListener("keydown", e => { if (e.key==="Escape") closeApiConfig(); });
    renderTopbarBadges();

    if (!allProviders().some(p=>!!getKey(p.id))) {
      setTimeout(()=>{
        if (typeof showApiToast==="function")
          showApiToast("&#9881; No API keys &mdash; click &#9881; API to configure.","info");
      }, 1400);
    }
  }

  if (document.readyState==="loading")
    document.addEventListener("DOMContentLoaded", afterDom);
  else
    afterDom();
})();
