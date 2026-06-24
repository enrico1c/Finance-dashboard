/* ══════════════════════════════════════════════════════════════════
   openexchange.js  — Open Exchange Rates integration
   Free tier: 1,000 req/month · 200+ currency pairs
   Key stored: finterm_key_openexchange
   ══════════════════════════════════════════════════════════════════ */
(function() {
"use strict";

const OER_BASE    = "https://openexchangerates.org/api";
const OER_CACHE   = {};
const OER_TTL     = 60 * 60 * 1000; // 1 hour (respect monthly limit)

function oerGetKey() {
  return (window._KEYS && window._KEYS["openexchange"])
    || localStorage.getItem("finterm_key_openexchange") || "";
}

function oerCacheGet(key) {
  const c = OER_CACHE[key];
  return (c && Date.now() - c.ts < OER_TTL) ? c.data : null;
}
function oerCacheSet(key, data) { OER_CACHE[key] = { data, ts: Date.now() }; }

async function oerFetch(path, cacheKey) {
  const cached = oerCacheGet(cacheKey);
  if (cached) return cached;
  const key = oerGetKey();
  if (!key) return null;
  try {
    const res  = await fetch(`${OER_BASE}${path}?app_id=${key}&show_alternative=false`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) { console.warn("[OER]", data.description); return null; }
    oerCacheSet(cacheKey, data);
    return data;
  } catch(e) { console.warn("[OER]", e.message); return null; }
}

/* ── Main render: Forex panel rate strip (OER replaces/supplements Frankfurter) */
window.oerLoadRates = async function() {
  const el = document.getElementById("oer-rates");
  if (!el || !oerGetKey()) return;
  const data = await oerFetch("/latest.json", "oer_latest");
  if (!data?.rates) return;

  const base  = data.base || "USD";
  const ts    = data.timestamp ? new Date(data.timestamp * 1000).toUTCString().slice(0,22) : "";
  const pairs = ["EUR","GBP","JPY","CHF","CAD","AUD","CNY","HKD","SGD","NOK","SEK","BRL","INR","MXN","ZAR","KRW","TRY","RUB","IDR","SAR"];

  let html = `<div class="av-live-badge">● Open Exchange Rates · Base: ${base} · ${ts}</div>`;
  html += `<div class="oer-strip">`;
  pairs.forEach(ccy => {
    const rate = data.rates[ccy];
    if (!rate) return;
    html += `<div class="oer-pair">
      <span class="oer-ccy">${ccy}</span>
      <span class="oer-rate">${rate < 10 ? rate.toFixed(4) : rate < 1000 ? rate.toFixed(2) : rate.toFixed(0)}</span>
    </div>`;
  });
  html += `</div>`;
  el.innerHTML = html;
};

/* ── Historical 30-day chart for a given pair */
window.oerLoadHistory = async function(fromCcy, toCcy, days = 30) {
  const el = document.getElementById("oer-history");
  if (!el || !oerGetKey()) return;

  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading ${fromCcy}/${toCcy} history…</div>`;

  // Build daily date array
  const dates = [];
  for (let i = days; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  // Fetch in batches (OER historical is 1 req/day)
  // Use /time-series.json if on paid plan, else sample 5 points from /historical/DATE.json
  const sampleDates = [dates[0], dates[Math.floor(days*0.25)], dates[Math.floor(days*0.5)], dates[Math.floor(days*0.75)], dates[dates.length-1]];
  const results = await Promise.all(
    sampleDates.map(date =>
      oerFetch(`/historical/${date}.json`, `oer_hist_${date}`)
        .then(d => ({ date, rate: d?.rates?.[toCcy] || null }))
    )
  );

  const valid = results.filter(r => r.rate !== null);
  if (!valid.length) {
    el.innerHTML = `<div class="no-data">// Historical data not available (check OER plan).</div>`;
    return;
  }

  // SVG sparkline
  const rates = valid.map(r => r.rate);
  const mn    = Math.min(...rates), mx = Math.max(...rates), range = mx - mn || 0.0001;
  const W = 300, H = 50;
  const pts = valid.map((r, i) => {
    const x = (i / (valid.length - 1)) * W;
    const y = H - ((r.rate - mn) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const latest = valid[valid.length - 1];
  const oldest = valid[0];
  const chg    = ((latest.rate - oldest.rate) / oldest.rate * 100).toFixed(2);
  const chgCls = parseFloat(chg) >= 0 ? "pos" : "neg";

  el.innerHTML = `
    <div class="oer-hist-header">
      <span class="oer-hist-pair">${fromCcy} / ${toCcy}</span>
      <span class="oer-hist-rate">${latest.rate < 10 ? latest.rate.toFixed(4) : latest.rate.toFixed(2)}</span>
      <span class="${chgCls}">${parseFloat(chg)>=0?"+":""}${chg}% (${days}d)</span>
    </div>
    <svg width="${W}" height="${H+10}" style="display:block;margin:6px 0">
      <polyline points="${pts}" fill="none" stroke="${parseFloat(chg)>=0?"#4a9":"#e55"}" stroke-width="2" stroke-linejoin="round"/>
    </svg>
    <div class="oer-hist-dates">
      <span>${oldest.date}</span><span>${latest.date}</span>
    </div>`;
};

/* ── Currency converter widget */
window.oerConvert = async function() {
  const fromEl  = document.getElementById("oer-from");
  const toEl    = document.getElementById("oer-to");
  const amtEl   = document.getElementById("oer-amount");
  const resEl   = document.getElementById("oer-result");
  if (!fromEl || !toEl || !amtEl || !resEl) return;

  const data = await oerFetch("/latest.json", "oer_latest");
  if (!data?.rates) { resEl.textContent = "—"; return; }

  const from = fromEl.value.toUpperCase();
  const to   = toEl.value.toUpperCase();
  const amt  = parseFloat(amtEl.value) || 1;

  // OER rates are always in USD as base
  const rateFrom = from === "USD" ? 1 : data.rates[from];
  const rateTo   = to   === "USD" ? 1 : data.rates[to];
  if (!rateFrom || !rateTo) { resEl.textContent = "N/A"; return; }

  const result = (amt / rateFrom) * rateTo;
  resEl.textContent = `${amt} ${from} = ${result < 10 ? result.toFixed(4) : result < 1000 ? result.toFixed(2) : result.toFixed(0)} ${to}`;
};

/* ── All currencies list for screener/reference */
window.oerLoadCurrencyList = async function() {
  const el = document.getElementById("oer-currency-list");
  if (!el || !oerGetKey()) return;
  const data = await oerFetch("/latest.json", "oer_latest");
  if (!data?.rates) return;

  const base = data.base || "USD";
  const entries = Object.entries(data.rates).sort(([a],[b]) => a.localeCompare(b));
  let html = `<div class="av-live-badge">● ${entries.length} Currencies · Base: ${base}</div>`;
  html += `<input id="oer-search" type="text" placeholder="Search currency (e.g. EUR, CNY…)" style="width:100%;margin:8px 0;padding:6px 10px;background:var(--color-background-secondary);border:0.5px solid var(--color-border-secondary);border-radius:6px;color:var(--color-text-primary);font-size:12px" oninput="oerFilterList(this.value)">`;
  html += `<div id="oer-list-body" class="oer-list">`;
  entries.forEach(([ccy, rate]) => {
    html += `<div class="oer-list-row" data-ccy="${ccy}">
      <span class="oer-ccy">${ccy}</span>
      <span class="oer-rate">${rate < 10 ? rate.toFixed(4) : rate < 1000 ? rate.toFixed(2) : rate.toFixed(0)}</span>
    </div>`;
  });
  html += `</div>`;
  el.innerHTML = html;
};

window.oerFilterList = function(q) {
  const rows = document.querySelectorAll("#oer-list-body .oer-list-row");
  const ql   = q.toLowerCase();
  rows.forEach(r => {
    r.style.display = r.dataset.ccy.toLowerCase().includes(ql) ? "" : "none";
  });
};

/* ── INIT ── */
document.addEventListener("DOMContentLoaded", () => {
  if (oerGetKey()) {
    oerLoadRates();
    setInterval(oerLoadRates, 60 * 60 * 1000); // refresh hourly (respect monthly budget)
  }
});

})();
