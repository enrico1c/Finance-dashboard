/* ══════════════════════════════════════════════════════════════════
   FINTERM — massive.js
   Massive (massive.io) alternative data integration
   • Macro indicators · Institutional flow · Economic data
   • Feeds: fund-ee (EE tab) · quote-mon (MON tab) · news-bi (BI)
   • NOTE: Massive.io's REST API structure varies by plan.
     This file implements a clean adapter that works with their
     standard /v1 endpoints. Configure your endpoint prefix in
     the sidebar if your org uses a custom domain.
   ══════════════════════════════════════════════════════════════════ */

const MASSIVE_BASE = "https://api.massive.io/v1";
const MASSIVE_SESSION_KEY = "massive_call_count";

/* ── Key ────────────────────────────────────────────────────────── */
function getMassiveKey() {
  return (window._KEYS && window._KEYS["massive"])
    || localStorage.getItem("finterm_key_massive")
    || "";
}

function massiveCallCount() {
  return parseInt(sessionStorage.getItem(MASSIVE_SESSION_KEY) || "0");
}
function massiveBumpCount() {
  const n = massiveCallCount() + 1;
  sessionStorage.setItem(MASSIVE_SESSION_KEY, n);
  return n;
}

/* ── Core fetch ─────────────────────────────────────────────────── */
async function massiveFetch(path, params = {}, method = "GET") {
  const key = getMassiveKey();
  if (!key) return null;

  const url = new URL(`${MASSIVE_BASE}${path}`);
  if (method === "GET") {
    Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  }

  const cacheKey = `massive_${url.toString()}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch(_) {}
  }

  massiveBumpCount();
  try {
    const opts = {
      method,
      headers: {
        "Authorization": `Bearer ${key}`,
        "x-api-key":     key,
        "Accept":        "application/json",
        "Content-Type":  "application/json",
      },
    };
    if (method === "POST") opts.body = JSON.stringify(params);

    const r = await fetch(url.toString(), opts);
    if (!r.ok) {
      // Surface auth errors clearly
      if (r.status === 401 || r.status === 403) {
        showApiToast("⚠ Massive: API key invalid or insufficient permissions", "warn");
      }
      return null;
    }
    const data = await r.json();
    sessionStorage.setItem(cacheKey, JSON.stringify(data));
    return data;
  } catch(_) { return null; }
}

/* ══════════════════════════════════════════════════════════════════
   DATA FETCHERS
   ══════════════════════════════════════════════════════════════════ */

/* ── Macro / Economic Indicators ─────────────────────────────────── */
async function massiveGetMacro(country = "US") {
  const data = await massiveFetch(`/macro/indicators`, { country, limit: 20 });
  if (!data) return null;
  const items = Array.isArray(data) ? data : (data.data || data.results || []);
  return items.map(i => ({
    name:      i.name || i.indicator || i.label || "—",
    value:     i.value ?? i.latest_value ?? null,
    change:    i.change ?? i.change_pct ?? null,
    unit:      i.unit || i.unit_of_measure || "",
    period:    i.period || i.date || i.reference_period || "",
    frequency: i.frequency || "",
    country:   i.country || country,
  }));
}

/* ── Institutional Flow (sector / asset class flows) ────────────── */
async function massiveGetFlow(ticker) {
  const bare = ticker.replace(/.*:/,"").toUpperCase();
  const data = await massiveFetch(`/institutional/flow`, { symbol: bare, limit: 30 });
  if (!data) return null;
  const items = Array.isArray(data) ? data : (data.data || data.results || []);
  return items.slice(0,20).map(f => ({
    date:        f.date || f.period || "",
    institution: f.institution || f.firm || f.name || "—",
    action:      f.action || f.transaction_type || f.type || "—",
    shares:      parseInt(f.shares || f.quantity || 0),
    value:       parseFloat(f.value || f.total_value || 0),
    pct:         parseFloat(f.pct_change || f.change_pct || 0),
  }));
}

/* ── Alternative Sentiment Data ─────────────────────────────────── */
async function massiveGetSentiment(ticker) {
  const bare = ticker.replace(/.*:/,"").toUpperCase();
  const data = await massiveFetch(`/sentiment/ticker`, { symbol: bare, window: "7d" });
  if (!data) return null;
  return {
    ticker: bare,
    score:  parseFloat(data.score || data.sentiment_score || data.value || 0),
    label:  data.label || data.sentiment || (data.score > 0 ? "Bullish" : data.score < 0 ? "Bearish" : "Neutral"),
    volume: parseInt(data.volume || data.mention_count || 0),
    trend:  data.trend || data.direction || "—",
    sources: data.sources || [],
    updated: data.updated_at || data.date || "",
  };
}

/* ── Economic Calendar / Events ─────────────────────────────────── */
async function massiveGetEconomicCalendar(country = "US", days = 14) {
  const from = new Date().toISOString().slice(0,10);
  const to   = new Date(Date.now() + days*24*3600*1000).toISOString().slice(0,10);
  const data = await massiveFetch(`/macro/calendar`, { country, from, to });
  if (!data) return null;
  const items = Array.isArray(data) ? data : (data.data || data.events || data.results || []);
  return items.slice(0,15).map(e => ({
    date:     e.date || e.event_date || "",
    name:     e.name || e.event || e.indicator || "—",
    actual:   e.actual ?? e.actual_value ?? null,
    forecast: e.forecast ?? e.expected ?? null,
    previous: e.previous ?? e.prev ?? null,
    impact:   e.impact || e.importance || "medium",
    country:  e.country || country,
  }));
}

/* ══════════════════════════════════════════════════════════════════
   RENDER FUNCTIONS
   ══════════════════════════════════════════════════════════════════ */

function msvEsc(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function msvFmt(n, d=2) {
  if (n == null || isNaN(n)) return "—";
  return Number(n).toLocaleString("en-US", {minimumFractionDigits:d, maximumFractionDigits:d});
}
function msvFmtB(n) {
  if (!n) return "—";
  const a = Math.abs(n);
  if (a >= 1e12) return (n/1e12).toFixed(2)+"T";
  if (a >= 1e9)  return (n/1e9).toFixed(2)+"B";
  if (a >= 1e6)  return (n/1e6).toFixed(2)+"M";
  return n.toLocaleString();
}

/* ── EE tab: Economic Exposition (macro + flow + sentiment) ─────── */
function massiveRenderEE(sym, macro, flow, sentiment, calendar) {
  const ee = document.getElementById("fund-ee");
  if (!ee) return;

  // Sentiment block
  const sentHtml = sentiment ? `
    <div class="section-head">Alt Sentiment — ${msvEsc(sym)}</div>
    <div class="metric-row">
      <span class="metric-label">Score</span>
      <span class="metric-value ${sentiment.score > 0.1 ? "pos" : sentiment.score < -0.1 ? "neg" : ""}">
        ${msvFmt(sentiment.score)} — ${msvEsc(sentiment.label)}
      </span>
    </div>
    <div class="metric-row"><span class="metric-label">Mentions (7d)</span><span class="metric-value">${Number(sentiment.volume).toLocaleString()}</span></div>
    <div class="metric-row"><span class="metric-label">Trend</span><span class="metric-value">${msvEsc(sentiment.trend)}</span></div>
    ${sentiment.updated ? `<div class="av-note">Updated: ${msvEsc(sentiment.updated.slice(0,10))}</div>` : ""}
  ` : "";

  // Institutional flow block
  const flowHtml = (flow && flow.length) ? `
    <div class="section-head">Institutional Flow</div>
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th>Date</th><th>Institution</th><th>Action</th><th>Value</th></tr></thead>
      <tbody>
        ${flow.map(f => {
          const cls = f.action?.toLowerCase().includes("buy") || f.action?.toLowerCase().includes("add") ? "pos"
                    : f.action?.toLowerCase().includes("sell") || f.action?.toLowerCase().includes("reduc") ? "neg" : "";
          return `<tr>
            <td>${msvEsc(f.date?.slice(0,10))}</td>
            <td>${msvEsc(f.institution)}</td>
            <td class="${cls}">${msvEsc(f.action)}</td>
            <td>${msvFmtB(f.value)}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table></div>
  ` : "";

  // Macro indicators block
  const macroHtml = (macro && macro.length) ? `
    <div class="section-head">Macro Indicators (${msvEsc(macro[0]?.country || "US")})</div>
    ${macro.map(m => `
      <div class="metric-row">
        <span class="metric-label">${msvEsc(m.name)}${m.period ? ` <em style="opacity:.6">(${msvEsc(m.period)})</em>` : ""}</span>
        <span class="metric-value ${parseFloat(m.change) > 0 ? "pos" : parseFloat(m.change) < 0 ? "neg" : ""}">
          ${m.value != null ? msvFmt(m.value)+(m.unit?" "+msvEsc(m.unit):"") : "—"}
          ${m.change != null ? `<span style="font-size:9px;opacity:.7"> (${parseFloat(m.change)>0?"+":""}${msvFmt(m.change)}%)</span>` : ""}
        </span>
      </div>`).join("")}
  ` : "";

  // Economic calendar block
  const calHtml = (calendar && calendar.length) ? `
    <div class="section-head">Eco Calendar (next 14 days)</div>
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th>Date</th><th>Event</th><th>Forecast</th><th>Previous</th><th>Impact</th></tr></thead>
      <tbody>
        ${calendar.map(e => {
          const impCls = e.impact?.toLowerCase() === "high" ? "neg"
                       : e.impact?.toLowerCase() === "low" ? "neutral" : "";
          return `<tr>
            <td>${msvEsc(e.date?.slice(0,10))}</td>
            <td>${msvEsc(e.name)}</td>
            <td>${e.forecast != null ? msvFmt(e.forecast) : "—"}</td>
            <td>${e.previous != null ? msvFmt(e.previous) : "—"}</td>
            <td class="${impCls}">${msvEsc(e.impact || "—")}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table></div>
  ` : "";

  const empty = !sentHtml && !flowHtml && !macroHtml && !calHtml;

  ee.innerHTML = `
    <div class="av-live-badge">● LIVE — Massive (Alternative Data)</div>
    ${sentHtml}
    ${flowHtml}
    ${macroHtml}
    ${calHtml}
    ${empty ? `<div class="no-data">// Massive key configured but no data returned.<br>// Check your plan covers institutional flow & macro endpoints.</div>` : ""}
    <div class="av-note">// Massive.io: Alternative data · Macro · Institutional flow<br>// Data availability depends on your subscription plan.</div>`;
}

/* ── MON tab: augment with macro context ─────────────────────────── */
function massiveRenderMON(sym, sentiment, macro) {
  const mon = document.getElementById("quote-mon");
  if (!mon) return;
  // Append to existing content rather than replace
  const existing = mon.innerHTML;
  const macroSnippet = (macro || []).slice(0, 5).map(m =>
    `<div class="metric-row">
      <span class="metric-label">${msvEsc(m.name)}</span>
      <span class="metric-value">${m.value != null ? msvFmt(m.value)+(m.unit?" "+msvEsc(m.unit):"") : "—"}</span>
    </div>`
  ).join("");

  const sentSnippet = sentiment ? `
    <div class="metric-row">
      <span class="metric-label">Alt Sentiment</span>
      <span class="metric-value ${sentiment.score > 0.1 ? "pos" : sentiment.score < -0.1 ? "neg" : ""}">
        ${msvEsc(sentiment.label)} (${msvFmt(sentiment.score)})
      </span>
    </div>` : "";

  if (macroSnippet || sentSnippet) {
    mon.innerHTML = existing +
      `<div class="section-head" style="margin-top:10px">Macro Context — Massive</div>` +
      sentSnippet + macroSnippet;
  }
}

/* ══════════════════════════════════════════════════════════════════
   HIGH-LEVEL LOADER
   ══════════════════════════════════════════════════════════════════ */
const massiveLiveCache = {};

async function massiveLoadAll(rawTicker) {
  if (!getMassiveKey()) return;
  const bare = rawTicker.replace(/.*:/,"").toUpperCase();
  showApiToast(`↻ Massive: loading alternative data for ${bare}…`, "info");

  const [macro, flow, sentiment, calendar] = await Promise.all([
    massiveGetMacro("US"),
    massiveGetFlow(bare),
    massiveGetSentiment(bare),
    massiveGetEconomicCalendar("US", 14),
  ]);

  massiveLiveCache[bare] = { macro, flow, sentiment, calendar };

  massiveRenderEE(bare, macro, flow, sentiment, calendar);
  if (sentiment || macro) massiveRenderMON(bare, sentiment, macro);

  const loaded = [macro, flow, sentiment, calendar].filter(Boolean).length;
  showApiToast(`✓ Massive: ${bare} alt data (${loaded}/4)`, "ok");
}
