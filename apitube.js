/* ══════════════════════════════════════════════════════════════════
   FINTERM — apitube.js
   APITube integration layer
   • News: api.apitube.io/v1/news/everything
   • Auth: X-API-Key header  (or ?api_key= param for CORS fallback)
   • Feeds: CN tab (financial news) · BI tab (video/YouTube)
   ══════════════════════════════════════════════════════════════════ */

const APITUBE_BASE = "https://api.apitube.io/v1";
const APITUBE_SESSION_KEY = "apitube_call_count";

/* ── Key ────────────────────────────────────────────────────────── */
function getApitubeKey() {
  return (window._KEYS && window._KEYS["apitube"])
    || localStorage.getItem("finterm_key_apitube")
    || "";
}

function apitubeCallCount() {
  return parseInt(sessionStorage.getItem(APITUBE_SESSION_KEY) || "0");
}
function apitubeBumpCount() {
  const n = apitubeCallCount() + 1;
  sessionStorage.setItem(APITUBE_SESSION_KEY, n);
  return n;
}

/* ── Core fetch (header-based auth) ─────────────────────────────── */
async function apitubeFetch(path, params = {}) {
  const key = getApitubeKey();
  if (!key) return null;

  const url = new URL(`${APITUBE_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  // APITube accepts key as header OR query param
  url.searchParams.set("api_key", key);

  const cacheKey = `apitube_${url.toString()}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch(_) {}
  }

  apitubeBumpCount();
  try {
    const r = await fetch(url.toString(), {
      headers: { "X-API-Key": key, "Accept": "application/json" }
    });
    if (!r.ok) return null;
    const data = await r.json();
    sessionStorage.setItem(cacheKey, JSON.stringify(data));
    return data;
  } catch(_) { return null; }
}

/* ══════════════════════════════════════════════════════════════════
   DATA FETCHERS
   ══════════════════════════════════════════════════════════════════ */

/* ── Financial News (text articles) ─────────────────────────────── */
async function apitubeGetNews(ticker, limit = 20) {
  const bare = ticker.replace(/.*:/,"").toUpperCase();
  const data = await apitubeFetch("/news/everything", {
    title:          bare,
    "language.code":"en",
    categories:     "business,finance,markets",
    per_page:       Math.min(limit, 50),
    sort_by:        "published_at",
    sort_direction: "desc",
  });
  if (!data || !data.results) return null;
  return data.results.map(a => ({
    title:       a.title,
    url:         a.url,
    source:      a.source?.name || a.source?.domain || "—",
    publishedAt: a.published_at,
    summary:     a.summary || a.description || "",
    sentiment:   null, // APITube doesn't return sentiment score per-article on free tier
    image:       a.image?.url || null,
    category:    a.category?.name || "",
    isVideo:     false,
  }));
}

/* ── YouTube / Video News ────────────────────────────────────────── */
async function apitubeGetVideos(ticker, limit = 15) {
  const bare = ticker.replace(/.*:/,"").toUpperCase();
  const data = await apitubeFetch("/news/everything", {
    title:          bare,
    "language.code":"en",
    // Filter to video/YouTube sources
    "source.categories": "video",
    per_page:       Math.min(limit, 30),
    sort_by:        "published_at",
    sort_direction: "desc",
  });
  // Fallback: get general news including video items
  const fallback = await apitubeFetch("/news/everything", {
    title:          `${bare} stock earnings`,
    "language.code":"en",
    per_page:       Math.min(limit, 30),
    sort_by:        "published_at",
    sort_direction: "desc",
  });
  const results = data?.results || fallback?.results || [];
  return results.slice(0, limit).map(a => ({
    title:       a.title,
    url:         a.url,
    source:      a.source?.name || a.source?.domain || "—",
    publishedAt: a.published_at,
    summary:     a.summary || a.description || "",
    image:       a.image?.url || null,
    isVideo:     a.source?.domain?.includes("youtube") ||
                 a.source?.domain?.includes("video") ||
                 a.url?.includes("youtube") || false,
  }));
}

/* ── Topic-based news (for News Hub topic search) ────────────────── */
async function apitubeGetTopicNews(topic, limit = 25) {
  const data = await apitubeFetch("/news/everything", {
    title:          topic,
    "language.code":"en",
    per_page:       Math.min(limit, 50),
    sort_by:        "published_at",
    sort_direction: "desc",
  });
  if (!data || !data.results) return null;
  return data.results.map(a => ({
    title:       a.title,
    url:         a.url,
    source:      a.source?.name || a.source?.domain || "—",
    publishedAt: a.published_at,
    summary:     a.summary || a.description || "",
    image:       a.image?.url || null,
    isVideo:     a.url?.includes("youtube") || false,
  }));
}

/* ══════════════════════════════════════════════════════════════════
   RENDER FUNCTIONS
   ══════════════════════════════════════════════════════════════════ */

function aptEsc(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function aptDateFmt(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString("en-GB", {day:"2-digit",month:"short",year:"numeric"}); }
  catch(_) { return iso.slice(0,10); }
}

/* ── CN tab: Financial News ──────────────────────────────────────── */
function apitubeRenderNews(sym, articles) {
  const cn = document.getElementById("news-cn");
  if (!cn || !articles?.length) return;

  cn.innerHTML = `
    <div class="av-live-badge">● LIVE — APITube News  <span class="av-ts">${articles.length} articles</span></div>
    <div class="news-list">
      ${articles.map(a => `
        <div class="news-item">
          ${a.image ? `<div class="news-img-wrap"><img src="${aptEsc(a.image)}" alt="" loading="lazy" onerror="this.parentElement.remove()" /></div>` : ""}
          <a href="${aptEsc(a.url)}" target="_blank" rel="noopener noreferrer">${aptEsc(a.title)}</a>
          <div class="news-meta">
            ${aptEsc(a.source)}
            &nbsp;·&nbsp; ${aptDateFmt(a.publishedAt)}
            ${a.category ? `&nbsp;·&nbsp; <em>${aptEsc(a.category)}</em>` : ""}
          </div>
          ${a.summary ? `<div class="news-summary">${aptEsc(a.summary.slice(0,200))}…</div>` : ""}
        </div>`).join("")}
    </div>`;
}

/* ── BI tab: Video & YouTube ─────────────────────────────────────── */
function apitubeRenderVideos(sym, articles) {
  const bi = document.getElementById("news-bi");
  if (!bi || !articles?.length) return;

  const ytSearch = `https://www.youtube.com/results?search_query=${encodeURIComponent(sym+" stock analysis")}`;

  bi.innerHTML = `
    <div class="av-live-badge">● LIVE — APITube Video/Media  <span class="av-ts">${articles.length} results</span></div>
    <div class="bi-yt-shortcut">
      <a href="${ytSearch}" target="_blank" rel="noopener noreferrer" class="bi-yt-btn">
        ▶ YouTube: ${aptEsc(sym)} stock analysis ↗
      </a>
    </div>
    <div class="news-list">
      ${articles.map(a => `
        <div class="news-item ${a.isVideo ? "news-item-video" : ""}">
          ${a.isVideo ? '<span class="news-video-badge">▶ VIDEO</span>' : ""}
          ${a.image ? `<div class="news-img-wrap"><img src="${aptEsc(a.image)}" alt="" loading="lazy" onerror="this.parentElement.remove()" /></div>` : ""}
          <a href="${aptEsc(a.url)}" target="_blank" rel="noopener noreferrer">${aptEsc(a.title)}</a>
          <div class="news-meta">
            ${aptEsc(a.source)} &nbsp;·&nbsp; ${aptDateFmt(a.publishedAt)}
          </div>
          ${a.summary ? `<div class="news-summary">${aptEsc(a.summary.slice(0,200))}…</div>` : ""}
        </div>`).join("")}
    </div>`;
}

/* ── Topic news (called from searchTopicNews override) ───────────── */
function apitubeRenderTopicNews(topic, articles) {
  const cn = document.getElementById("news-cn");
  if (!cn || !articles?.length) return;
  cn.innerHTML = `
    <div class="av-live-badge">● LIVE — APITube · Topic: ${aptEsc(topic)}</div>
    <div class="news-list">
      ${articles.map(a => `
        <div class="news-item">
          ${a.image ? `<div class="news-img-wrap"><img src="${aptEsc(a.image)}" alt="" loading="lazy" onerror="this.parentElement.remove()" /></div>` : ""}
          <a href="${aptEsc(a.url)}" target="_blank" rel="noopener noreferrer">${aptEsc(a.title)}</a>
          <div class="news-meta">${aptEsc(a.source)} &nbsp;·&nbsp; ${aptDateFmt(a.publishedAt)}</div>
          ${a.summary ? `<div class="news-summary">${aptEsc(a.summary.slice(0,200))}…</div>` : ""}
        </div>`).join("")}
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════
   HIGH-LEVEL LOADER
   ══════════════════════════════════════════════════════════════════ */
const apitubeLiveCache = {};

async function apitubeLoadAll(rawTicker) {
  if (!getApitubeKey()) return;
  const bare = rawTicker.replace(/.*:/,"").toUpperCase();
  showApiToast(`↻ APITube: loading news for ${bare}…`, "info");

  const [news, videos] = await Promise.all([
    apitubeGetNews(bare, 20),
    apitubeGetVideos(bare, 15),
  ]);

  apitubeLiveCache[bare] = { news, videos };

  if (news)   apitubeRenderNews(bare, news);
  if (videos) apitubeRenderVideos(bare, videos);

  const loaded = [news, videos].filter(Boolean).length;
  showApiToast(`✓ APITube: ${bare} news + video (${loaded}/2)`, "ok");
}

/* Override searchTopicNews to also call APITube if key is set */
(function patchSearchTopicNews() {
  const _orig = window.searchTopicNews;
  window.searchTopicNews = async function() {
    if (typeof _orig === "function") _orig();
    const q = document.getElementById("topicInput")?.value.trim();
    if (!q || !getApitubeKey()) return;
    const articles = await apitubeGetTopicNews(q, 25);
    if (articles?.length) apitubeRenderTopicNews(q, articles);
  };
})();
