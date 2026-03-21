/* ══════════════════════════════════════════════════════════════════
   FINTERM — finnhub.js
   Finnhub.io integration layer
   Free tier: 60 calls/min
   Endpoints used:
     • Company News            /news?category=general (no ticker filter on free)
     • Stock News              /company-news?symbol=X&from=&to=
     • Quote                   /quote?symbol=X
     • Company Profile         /stock/profile2?symbol=X
     • Recommendation Trends   /stock/recommendation?symbol=X
     • Price Target            /stock/price-target?symbol=X
     • Upgrade/Downgrade       /stock/upgrade-downgrade?symbol=X
     • Earnings                /stock/earnings?symbol=X
     • Insider Transactions    /stock/insider-transactions?symbol=X
     • Institutional Ownership /institutional/ownership?symbol=X&cusip=
     • Peers                   /stock/peers?symbol=X
     • Market Cap              via profile2
   ══════════════════════════════════════════════════════════════════ */

const FH_BASE = "https://finnhub.io/api/v1";
const FH_SESSION_KEY = "fh_call_count";

/* ── Key ─────────────────────────────────────────────────────────── */
function getFinnhubKey() {
  return (window._KEYS && window._KEYS["finnhub"])
    || localStorage.getItem("finterm_key_finnhub")
    || "";
}
function fhCount() { return parseInt(sessionStorage.getItem(FH_SESSION_KEY) || "0"); }
function fhBump()  { const n = fhCount()+1; sessionStorage.setItem(FH_SESSION_KEY,n); return n; }

/* ── Core fetch with token ───────────────────────────────────────── */
async function fhFetch(path, params = {}) {
  const key = getFinnhubKey();
  if (!key) return null;
  const url = new URL(`${FH_BASE}${path}`);
  url.searchParams.set("token", key);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));

  const cacheKey = `fh_${url.toString()}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) { try { return JSON.parse(cached); } catch(_) {} }

  fhBump();
  try {
    const r = await fetch(url.toString(), { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const data = await r.json();
    sessionStorage.setItem(cacheKey, JSON.stringify(data));
    return data;
  } catch(_) { return null; }
}

/* ── Date helpers ────────────────────────────────────────────────── */
function fhDateStr(daysAgo = 0) {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return d.toISOString().slice(0,10);
}

/* ══════════════════════════════════════════════════════════════════
   DATA FETCHERS
   ══════════════════════════════════════════════════════════════════ */

/* ── Quote ───────────────────────────────────────────────────────── */
async function fhGetQuote(sym) {
  const d = await fhFetch("/quote", { symbol: sym });
  if (!d || d.c == null) return null;
  return {
    price:    d.c,
    change:   d.d,
    changePct: d.dp,
    high:     d.h,
    low:      d.l,
    open:     d.o,
    prevClose: d.pc,
    timestamp: d.t,
  };
}

/* ── Company Profile ─────────────────────────────────────────────── */
async function fhGetProfile(sym) {
  const d = await fhFetch("/stock/profile2", { symbol: sym });
  if (!d || !d.name) return null;
  return {
    name:        d.name,
    ticker:      d.ticker,
    exchange:    d.exchange,
    currency:    d.currency,
    country:     d.country,
    sector:      d.finnhubIndustry,
    mktCap:      d.marketCapitalization ? d.marketCapitalization * 1e6 : null,
    shareOut:    d.shareOutstanding ? d.shareOutstanding * 1e6 : null,
    logo:        d.logo,
    weburl:      d.weburl,
    ipo:         d.ipo,
  };
}

/* ── Analyst Recommendations ─────────────────────────────────────── */
async function fhGetRecommendations(sym) {
  const data = await fhFetch("/stock/recommendation", { symbol: sym });
  if (!Array.isArray(data) || !data.length) return null;
  // Most recent period first
  const latest = data[0];
  const history = data.slice(0, 6).map(r => ({
    period:     r.period,
    strongBuy:  r.strongBuy,
    buy:        r.buy,
    hold:       r.hold,
    sell:       r.sell,
    strongSell: r.strongSell,
    total:      r.strongBuy + r.buy + r.hold + r.sell + r.strongSell,
  }));
  return {
    latest,
    history,
    buy:   (latest.strongBuy || 0) + (latest.buy || 0),
    hold:   latest.hold || 0,
    sell:  (latest.sell || 0) + (latest.strongSell || 0),
    total: (latest.strongBuy||0)+(latest.buy||0)+(latest.hold||0)+(latest.sell||0)+(latest.strongSell||0),
    period: latest.period,
  };
}

/* ── Price Target ────────────────────────────────────────────────── */
async function fhGetPriceTarget(sym) {
  const d = await fhFetch("/stock/price-target", { symbol: sym });
  if (!d || !d.targetMean) return null;
  return {
    avg:    d.targetMean,
    high:   d.targetHigh,
    low:    d.targetLow,
    median: d.targetMedian,
    count:  d.numberOfAnalysts,
    lastUpdated: d.lastUpdated,
  };
}

/* ── Upgrades / Downgrades ───────────────────────────────────────── */
async function fhGetUpgrades(sym) {
  const data = await fhFetch("/stock/upgrade-downgrade", { symbol: sym });
  if (!Array.isArray(data)) return null;
  return data.slice(0, 15).map(u => ({
    date:      u.gradeDate,
    firm:      u.company,
    fromGrade: u.fromGrade,
    toGrade:   u.toGrade,
    action:    u.action, // "up","down","main","init","reit"
  }));
}

/* ── Earnings (quarterly) ────────────────────────────────────────── */
async function fhGetEarnings(sym) {
  // No limit param — Finnhub returns all available quarters (typically 4-8)
  const data = await fhFetch("/stock/earnings", { symbol: sym });
  if (!Array.isArray(data) || !data.length) return null;
  // Finnhub returns most recent first
  return data.map(e => ({
    period:      e.period,
    epsEst:      e.estimate,
    epsActual:   e.actual,
    surprise:    e.surprise,
    surprisePct: e.surprisePercent,
  }));
}

/* ── Insider Transactions ────────────────────────────────────────── */
async function fhGetInsiders(sym) {
  const d = await fhFetch("/stock/insider-transactions", { symbol: sym });
  if (!d || !d.data) return null;
  return d.data.slice(0, 25).map(t => ({
    name:           t.name,
    share:          t.share,
    change:         t.change,
    transactionDate: t.transactionDate,
    transactionCode: t.transactionCode, // P=purchase, S=sale, A=grant
    transactionPrice: t.transactionPrice,
    value:          t.change && t.transactionPrice ? Math.abs(t.change * t.transactionPrice) : null,
  }));
}

/* ── Institutional Ownership ─────────────────────────────────────── */
async function fhGetInstitutional(sym) {
  const d = await fhFetch("/institutional/ownership", { symbol: sym, cusip: "" });
  if (!d || !d.ownership) return null;
  return d.ownership.slice(0, 15).map(o => ({
    name:         o.name,
    pct:          o.percent,
    shares:       o.share,
    change:       o.change,
    reportDate:   o.reportDate,
  }));
}

/* ── Company News ────────────────────────────────────────────────── */
async function fhGetNews(sym, days = 7) {
  const from = fhDateStr(days);
  const to   = fhDateStr(0);
  const data = await fhFetch("/company-news", { symbol: sym, from, to });
  if (!Array.isArray(data)) return null;
  return data.slice(0, 30).map(a => ({
    id:          a.id,
    headline:    a.headline,
    summary:     a.summary,
    url:         a.url,
    source:      a.source,
    datetime:    a.datetime, // unix timestamp
    image:       a.image,
    category:    a.category,
    sentiment:   null, // not provided by Finnhub free tier
  }));
}

/* ── Peers (same sector, similar size) ──────────────────────────── */
async function fhGetPeers(sym) {
  const data = await fhFetch("/stock/peers", { symbol: sym });
  if (!Array.isArray(data) || !data.length) return null;
  return data.filter(s => s !== sym).slice(0, 12);
}

/* ── Batch quotes for peer list ──────────────────────────────────── */
async function fhGetBatchProfiles(symbols) {
  // Finnhub has no batch endpoint — fire in parallel (respect rate limit)
  const results = await Promise.all(
    symbols.map(s => Promise.all([fhGetProfile(s), fhGetQuote(s)]))
  );
  return symbols.map((s, i) => {
    const [profile, quote] = results[i];
    if (!profile) return null;
    return {
      ticker:    s,
      name:      profile.name,
      mktCap:    profile.mktCap,
      sector:    profile.sector,
      currency:  profile.currency,
      price:     quote?.price,
      change:    quote?.changePct,
    };
  }).filter(Boolean);
}

/* ══════════════════════════════════════════════════════════════════
   RENDER HELPERS
   ══════════════════════════════════════════════════════════════════ */
function fhEsc(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fhFmt(n,d=2){ if(n==null||isNaN(n)) return '—'; return Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}); }
function fhFmtB(n){ if(!n)return'—'; const a=Math.abs(n); if(a>=1e12)return(n/1e12).toFixed(2)+'T'; if(a>=1e9)return(n/1e9).toFixed(2)+'B'; if(a>=1e6)return(n/1e6).toFixed(2)+'M'; return n.toLocaleString(); }
function fhRow(l,v,c=''){return `<div class="metric-row ${c}"><span class="metric-label">${fhEsc(l)}</span><span class="metric-value">${v??'—'}</span></div>`;}
function fhSec(t){return `<div class="section-head">${fhEsc(t)}</div>`;}
function fhUnixDate(ts){ try{return new Date(ts*1000).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});}catch(_){return '';} }

/* ── Render: Quote QR + MON tabs ─────────────────────────────────── */
function fhRenderQuote(sym, q, profile) {
  if (!q) return;
  const chg    = q.change != null ? q.change : 0;
  const chgPct = q.changePct != null ? q.changePct : 0;
  const chgCls = chg >= 0 ? "pos" : "neg";
  const sign   = chg >= 0 ? "+" : "";
  const ts     = q.timestamp ? new Date(q.timestamp*1000).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : "";

  const qr = document.getElementById("quote-qr");
  if (qr) qr.innerHTML = `
    <div class="av-live-badge">● LIVE — Finnhub  <span class="av-ts">${ts}</span></div>
    <div class="quote-grid">
      ${fhRow("Last",       `<span class="${chgCls} fh-ws-price" id="fh-quote-live-price" data-ticker="${fhEsc(sym)}" data-live="1">$${fhFmt(q.price)}</span>`)}
      ${fhRow("Change",     `<span class="${chgCls}">${sign}$${fhFmt(Math.abs(chg))} (${sign}${fhFmt(Math.abs(chgPct),2)}%)</span>`)}
      ${fhRow("Open",       "$"+fhFmt(q.open))}
      ${fhRow("High",       `<span class="metric-up">$${fhFmt(q.high)}</span>`)}
      ${fhRow("Low",        `<span class="metric-down">$${fhFmt(q.low)}</span>`)}
      ${fhRow("Prev Close", "$"+fhFmt(q.prevClose))}
      ${profile?.mktCap ? fhRow("Mkt Cap", fhFmtB(profile.mktCap)) : ""}
      ${profile?.shareOut ? fhRow("Shares Out.", Number(profile.shareOut*1e6).toLocaleString()) : ""}
    </div>
    <div class="av-note">// Bid/Ask requires premium data feed.<br>// Real-time tick data shown in TradingView chart.</div>`;

  const mon = document.getElementById("quote-mon");
  if (mon) mon.innerHTML = `
    <div class="av-live-badge">● LIVE — Finnhub</div>
    ${fhRow("Last Price",  `<span class="${chgCls}">$${fhFmt(q.price)}</span>`)}
    ${fhRow("Day Change",  `<span class="${chgCls}">${sign}${fhFmt(Math.abs(chgPct),2)}%</span>`)}
    ${fhRow("Day High",    `<span class="metric-up">$${fhFmt(q.high)}</span>`)}
    ${fhRow("Day Low",     `<span class="metric-down">$${fhFmt(q.low)}</span>`)}
    ${fhRow("Open",        "$"+fhFmt(q.open))}
    ${fhRow("Prev Close",  "$"+fhFmt(q.prevClose))}
    ${profile ? `
      ${fhSec("Company Info")}
      ${fhRow("Name",     fhEsc(profile.name||'—'))}
      ${fhRow("Exchange", fhEsc(profile.exchange||'—'))}
      ${fhRow("Sector",   fhEsc(profile.sector||'—'))}
      ${fhRow("Country",  fhEsc(profile.country||'—'))}
      ${fhRow("IPO",      fhEsc(profile.ipo||'—'))}
      ${profile.weburl ? `<div style="margin-top:6px"><a href="${fhEsc(profile.weburl)}" target="_blank" rel="noopener" class="geo-wm-link">Company website ↗</a></div>` : ""}
    ` : ""}`;
}


function fhRenderAnalysts(sym, recs, target, upgrades, price) {
  const anr = document.getElementById("analysts-anr");
  if (!anr) return;

  const buy  = recs?.buy  || 0;
  const hold = recs?.hold || 0;
  const sell = recs?.sell || 0;
  const tot  = recs?.total || buy+hold+sell || 1;
  const bp   = Math.round(buy/tot*100);
  const hp   = Math.round(hold/tot*100);
  const sp   = 100 - bp - hp;

  const upside = (target?.avg && price)
    ? ((target.avg/price - 1)*100).toFixed(1)+"%" : "—";
  const upsideCls = (target?.avg && price)
    ? (target.avg > price ? "metric-up" : "metric-down") : "";

  // Upgrades table
  const upgradeRows = (upgrades || []).map(u => {
    const actionLabel = { up:"↑ Upgrade", down:"↓ Downgrade", main:"→ Maintain", init:"★ Initiate", reit:"→ Reiterate" }[u.action] || u.action;
    const cls = u.action === "up" ? "pos" : u.action === "down" ? "neg" : "neutral";
    return `<tr>
      <td>${fhEsc(u.date)}</td>
      <td>${fhEsc(u.firm)}</td>
      <td class="${cls}">${fhEsc(actionLabel)}</td>
      <td>${fhEsc(u.fromGrade||'—')}</td>
      <td>${fhEsc(u.toGrade||'—')}</td>
    </tr>`;
  }).join("");

  // Recommendation trend chart (bar per period)
  const trendHtml = (recs?.history || []).map(r => {
    const t = r.total || 1;
    const bPct = Math.round(((r.strongBuy+r.buy)/t)*100);
    const hPct = Math.round((r.hold/t)*100);
    const sPct = 100 - bPct - hPct;
    return `<div class="fh-trend-row">
      <span class="fh-trend-label">${fhEsc(r.period?.slice(0,7)||'')}</span>
      <div class="fh-trend-bar">
        <div class="fh-tb-buy"  style="width:${bPct}%" title="Buy ${bPct}%"></div>
        <div class="fh-tb-hold" style="width:${hPct}%" title="Hold ${hPct}%"></div>
        <div class="fh-tb-sell" style="width:${sPct}%" title="Sell ${sPct}%"></div>
      </div>
      <span class="fh-trend-total">${r.total}</span>
    </div>`;
  }).join("");

  anr.innerHTML = `
    <div class="av-live-badge">● LIVE — Finnhub · ${fhEsc(recs?.period||'')} </div>
    ${fhSec("Consensus")}
    <div class="consensus-bar">
      <div class="cb-seg buy"  style="width:${bp}%">${buy} Buy</div>
      <div class="cb-seg hold" style="width:${hp}%">${hold} Hold</div>
      <div class="cb-seg sell" style="width:${sp}%">${sell} Sell</div>
    </div>
    ${fhRow("Total Analysts",  tot)}
    ${fhRow("Avg Target",      target?.avg  != null ? "$"+fhFmt(target.avg)  : "—")}
    ${fhRow("High Target",     target?.high != null ? "$"+fhFmt(target.high) : "—")}
    ${fhRow("Low Target",      target?.low  != null ? "$"+fhFmt(target.low)  : "—")}
    ${price ? fhRow("Current Price", "$"+fhFmt(price)) : ""}
    ${fhRow("Upside to Avg",   upside, upsideCls)}
    ${trendHtml ? fhSec("Trend (last 6 months)") + `<div class="fh-trend-wrap">${trendHtml}</div>` : ""}
    ${upgradeRows ? fhSec("Recent Upgrades / Downgrades") + `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th>Date</th><th>Firm</th><th>Action</th><th>From</th><th>To</th></tr></thead>
      <tbody>${upgradeRows}</tbody>
    </table></div>` : ""}`;
}

/* ── Render: Analyst BRC tab (research briefs from upgrades) ─────── */
function fhRenderBRC(sym, upgrades) {
  const brc = document.getElementById("analysts-brc");
  if (!brc || !upgrades?.length) return;
  brc.innerHTML = `
    <div class="av-live-badge">● LIVE — Finnhub Upgrades</div>
    ${upgrades.map(u => {
      const cls = u.action==="up"?"pos":u.action==="down"?"neg":"neutral";
      return `<div class="research-item">
        <div class="research-header">
          <span class="research-firm">${fhEsc(u.firm)}</span>
          <span class="research-date">${fhEsc(u.date)}</span>
        </div>
        <div class="research-title">
          <span class="${cls}">${fhEsc(u.action==="up"?"↑ Upgraded":u.action==="down"?"↓ Downgraded":"→ Maintained")}</span>
          ${u.fromGrade ? ` from <em>${fhEsc(u.fromGrade)}</em>` : ""}
          ${u.toGrade   ? ` to <strong>${fhEsc(u.toGrade)}</strong>` : ""}
        </div>
      </div>`;
    }).join("")}`;
}

/* ── Render: Ownership HDS tab ───────────────────────────────────── */
function fhRenderOwnership(sym, insiders, institutional) {
  const hds = document.getElementById("own-hds");
  if (!hds) return;

  // Insiders table
  const insRows = (insiders || []).map(t => {
    const isBuy = ["P","A"].includes(t.transactionCode);
    const isSell = ["S","D","F"].includes(t.transactionCode);
    const cls = isBuy ? "pos" : isSell ? "neg" : "";
    const action = isBuy ? "Buy/Grant" : isSell ? "Sale" : t.transactionCode;
    return `<tr>
      <td>${fhEsc(t.name||'—')}</td>
      <td class="${cls}">${fhEsc(action)}</td>
      <td>${t.share ? Number(t.share).toLocaleString() : "—"}</td>
      <td>${t.change ? (t.change > 0 ? "+" : "") + Number(t.change).toLocaleString() : "—"}</td>
      <td>${t.transactionPrice ? "$"+fhFmt(t.transactionPrice) : "—"}</td>
      <td>${t.value ? "$"+fhFmtB(t.value) : "—"}</td>
      <td>${fhEsc(t.transactionDate||'—')}</td>
    </tr>`;
  }).join("");

  // Institutional table
  const instRows = (institutional || []).map(o => {
    const chgCls = o.change > 0 ? "pos" : o.change < 0 ? "neg" : "";
    return `<tr>
      <td>${fhEsc(o.name||'—')}</td>
      <td>${o.pct != null ? fhFmt(o.pct,2)+"%" : "—"}</td>
      <td>${o.shares ? Number(o.shares).toLocaleString() : "—"}</td>
      <td class="${chgCls}">${o.change != null ? (o.change>0?"+":"")+Number(o.change).toLocaleString() : "—"}</td>
      <td>${fhEsc(o.reportDate||'—')}</td>
    </tr>`;
  }).join("");

  hds.innerHTML = `
    <div class="av-live-badge">● LIVE — Finnhub Insider & Institutional Data</div>
    ${fhSec("Insider Transactions (Recent)")}
    ${insRows
      ? `<div class="fin-table-wrap"><table class="fin-table">
          <thead><tr><th>Insider</th><th>Action</th><th>Shares Held</th><th>Change</th><th>Price</th><th>Value</th><th>Date</th></tr></thead>
          <tbody>${insRows}</tbody>
        </table></div>`
      : '<div class="no-data">// No insider data available</div>'}
    ${fhSec("Institutional Holders")}
    ${instRows
      ? `<div class="fin-table-wrap"><table class="fin-table">
          <thead><tr><th>Institution</th><th>% Own</th><th>Shares</th><th>QoQ Chg</th><th>Report Date</th></tr></thead>
          <tbody>${instRows}</tbody>
        </table></div>`
      : '<div class="no-data">// No institutional data available</div>'}`;
}

/* ── Render: Management MGMT tab ─────────────────────────────────── */
function fhRenderMgmt(sym, profile) {
  const mg = document.getElementById("own-mgmt");
  if (!mg || !profile) return;
  // Finnhub free tier doesn't provide executives list directly
  // Show profile info + link
  mg.innerHTML = `
    <div class="av-live-badge">● LIVE — Finnhub Profile</div>
    ${profile.logo ? `<div style="margin-bottom:10px"><img src="${fhEsc(profile.logo)}" alt="" style="height:32px;object-fit:contain;filter:brightness(1.2)"/></div>` : ""}
    ${fhRow("Company", fhEsc(profile.name))}
    ${fhRow("Exchange", fhEsc(profile.exchange))}
    ${fhRow("Country",  fhEsc(profile.country))}
    ${fhRow("Sector",   fhEsc(profile.sector))}
    ${fhRow("Mkt Cap",  fhFmtB(profile.mktCap))}
    ${fhRow("IPO Date", fhEsc(profile.ipo||'—'))}
    ${fhRow("Shares Outstanding", profile.shareOut ? Number(profile.shareOut).toLocaleString() : "—")}
    ${profile.weburl ? `<div style="margin-top:8px"><a href="${fhEsc(profile.weburl)}" target="_blank" rel="noopener" class="geo-wm-link">Company website ↗</a></div>` : ""}
    <div class="av-note">// Full executive list requires Finnhub Premium plan or FMP data.</div>`;
}

/* ── Render: Comparables RV tab ──────────────────────────────────── */
function fhRenderComparables(sym, peers, peerData, mainProfile, mainQuote, peerRatios) {
  const rv = document.getElementById("comp-rv");
  if (!rv) return;

  // peerRatios is an optional map: { TICKER: { pe, pb, evEbitda, roe, divYield } }
  // populated by finnhubLoadAll via Promise.allSettled(fmpGetRatios per peer)
  const ratiosMap = peerRatios || {};

  const mainMktCap = mainProfile?.mktCap || null;

  // Sort peers by market cap distance to main ticker
  const sorted = [...peerData].sort((a, b) => {
    if (!mainMktCap) return 0;
    return Math.abs((a.mktCap||0) - mainMktCap) - Math.abs((b.mktCap||0) - mainMktCap);
  }).slice(0, 10);

  // Main ticker ratios from fmpLiveCache if available
  const mainRatios = (typeof fmpGetLive === 'function') ? fmpGetLive(sym)?.ratios : null;

  // Include main ticker at top
  const allRows = [
    { ticker: sym, name: mainProfile?.name||sym, mktCap: mainMktCap,
      price: mainQuote?.price, change: mainQuote?.changePct, sector: mainProfile?.sector,
      isCurrent: true, ratios: mainRatios },
    ...sorted.map(p => ({ ...p, isCurrent: false, ratios: ratiosMap[p.ticker?.toUpperCase()] || null }))
  ];

  // Determine whether to show ratios columns (only if at least one peer has data)
  const hasRatios = allRows.some(r => r.ratios != null);

  const rows = allRows.map(r => {
    const ra = r.ratios;
    return `<tr class="${r.isCurrent ? "current-row" : ""}">
      <td><strong>${fhEsc(r.ticker)}</strong></td>
      <td>${fhEsc(r.name)}</td>
      <td>${fhFmtB(r.mktCap)}</td>
      <td>${fhEsc(r.sector||'—')}</td>
      <td>${r.price != null ? "$"+fhFmt(r.price) : "—"}</td>
      <td class="${(r.change||0) > 0 ? "pos" : (r.change||0) < 0 ? "neg" : ""}">${r.change != null ? (r.change>0?"+":"")+fhFmt(r.change,2)+"%" : "—"}</td>
      ${hasRatios ? `
      <td>${ra?.pe      != null ? fhFmt(ra.pe,1)         : "—"}</td>
      <td>${ra?.pb      != null ? fhFmt(ra.pb,2)         : "—"}</td>
      <td>${ra?.evEbitda!= null ? fhFmt(ra.evEbitda,1)   : "—"}</td>
      <td>${ra?.roe     != null ? fhFmt(ra.roe,1)+"%"    : "—"}</td>
      <td>${ra?.divYield!= null ? fhFmt(ra.divYield,2)+"%" : "—"}</td>
      ` : ''}
    </tr>`;
  }).join("");

  rv.innerHTML = `
    <div class="av-live-badge">● LIVE — Finnhub Peers${hasRatios ? ' + FMP Ratios' : ''} · ${fhEsc(mainProfile?.sector||'')} sector</div>
    <div class="fin-table-wrap"><table class="fin-table rv-table">
      <thead><tr>
        <th>Ticker</th><th>Company</th><th>Mkt Cap</th><th>Sector</th><th>Price</th><th>Day Chg%</th>
        ${hasRatios ? '<th>P/E</th><th>P/B</th><th>EV/EBITDA</th><th>ROE</th><th>Div Yield</th>' : ''}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div class="av-note">// Peers via Finnhub · Ratios via FMP (TTM) · Sorted by proximity to ${fhEsc(sym)} market cap.</div>`;
}

/* ── Render: Earnings ERN tab ────────────────────────────────────── */
function fhRenderEarnings(sym, earnings) {
  const ern = document.getElementById("fund-ern");
  if (!ern || !earnings?.length) return;
  const rows = earnings.map(e => {
    const sc  = (e.surprisePct ?? 0) >= 0 ? "pos" : "neg";
    const sp  = e.surprisePct != null ? (e.surprisePct >= 0 ? "+" : "") + Number(e.surprisePct).toFixed(2) + "%" : "—";
    const sur = e.surprise    != null ? (e.surprise    >= 0 ? "+" : "") + "$" + fhFmt(Math.abs(e.surprise)) : "—";
    const isEst = e.epsActual == null;
    return `<tr class="${isEst ? 'row-estimate' : ''}">
      <td>${fhEsc(e.period||'—')}</td>
      <td>${isEst ? '<em style="color:var(--text-muted)">Estimate</em>' : '—'}</td>
      <td>${e.epsEst    != null ? "$"+fhFmt(e.epsEst)    : "—"}</td>
      <td>${e.epsActual != null ? "$"+fhFmt(e.epsActual) : "—"}</td>
      <td class="${sc}">${sur}</td>
      <td class="${sc}">${sp}</td>
    </tr>`;
  }).join("");
  ern.innerHTML = `
    <div class="av-live-badge">● LIVE — Finnhub  <span class="av-ts">${earnings.length} quarters</span></div>
    ${fhSec("Quarterly EPS — Actual vs Estimate")}
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th>Quarter</th><th>Report Date</th><th>EPS Est.</th><th>EPS Act.</th><th>Surprise $</th><th>Surprise %</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div class="av-note">// Data via Finnhub. Most recent quarter shown first.</div>`;
}

/* ── Render: News CN tab ─────────────────────────────────────────── */
function fhRenderNews(sym, articles) {
  if (!articles?.length) return;
  if (typeof renderNewsFeed === "function") {
    renderNewsFeed(sym, articles, "fh");
  }
}

/* ══════════════════════════════════════════════════════════════════
   HIGH-LEVEL LOADER
   ══════════════════════════════════════════════════════════════════ */
const fhLiveCache = {};

async function finnhubLoadAll(rawTicker) {
  const key = getFinnhubKey();
  if (!key) return;
  const sym = rawTicker.replace(/.*:/,"").toUpperCase();

  showApiToast(`↻ Finnhub: loading ${sym}…`, "info");

  // Fire all requests in parallel
  const [recs, target, upgrades, earnings, insiders, institutional, news, peers, profile, quote] =
    await Promise.all([
      fhGetRecommendations(sym),
      fhGetPriceTarget(sym),
      fhGetUpgrades(sym),
      fhGetEarnings(sym),
      fhGetInsiders(sym),
      fhGetInstitutional(sym),
      fhGetNews(sym, 14),
      fhGetPeers(sym),
      fhGetProfile(sym),
      fhGetQuote(sym),
    ]);

  fhLiveCache[sym] = { recs, target, upgrades, earnings, insiders, institutional, news, peers, profile, quote };

  // Render quote (QR + MON)
  if (quote) fhRenderQuote(sym, quote, profile);

  // Render analysts
  if (recs || target || upgrades) {
    fhRenderAnalysts(sym, recs, target, upgrades, quote?.price);
    fhRenderBRC(sym, upgrades);
  }

  // Render earnings (ERN tab) — Finnhub overwrites AV data with freshest available
  if (earnings?.length) fhRenderEarnings(sym, earnings);

  // Render ownership
  if (insiders || institutional) fhRenderOwnership(sym, insiders, institutional);
  if (profile) fhRenderMgmt(sym, profile);

  // Render news
  if (news?.length) fhRenderNews(sym, news);

  // Render comparables — fetch peer profiles + FMP ratios per peer
  if (peers?.length) {
    showApiToast(`↻ Finnhub: loading ${peers.length} peer profiles…`, "info");
    const peerList = peers.slice(0, 10);
    const peerData = await fhGetBatchProfiles(peerList);

    // Fetch FMP ratios per peer in parallel — use Promise.allSettled so a
    // single failed call does not abort the entire render
    let peerRatios = {};
    if (typeof fmpGetRatios === 'function' && typeof getFmpKey === 'function' && getFmpKey()) {
      const ratiosResults = await Promise.allSettled(
        peerList.map(p => fmpGetRatios(p).then(r => ({ sym: p.toUpperCase(), ratios: r })))
      );
      ratiosResults.forEach(res => {
        if (res.status === 'fulfilled' && res.value?.ratios) {
          peerRatios[res.value.sym] = res.value.ratios;
        }
      });
    }

    fhRenderComparables(sym, sym, peerData, profile, quote, peerRatios);
    fhLiveCache[sym].peerData   = peerData;
    fhLiveCache[sym].peerRatios = peerRatios;
  }

  const loaded = [recs, target, upgrades, insiders, institutional, news, peers, profile, quote].filter(Boolean).length;
  showApiToast(`✓ Finnhub: ${sym} — ${loaded}/9 datasets loaded`, "ok");
}

/* ── Sector search via Finnhub peers (for watchlist) ────────────── */
async function finnhubSectorSearch(sym) {
  const peers = await fhGetPeers(sym);
  if (!peers?.length) return null;
  // Get profiles + quotes for all peers
  const all = [sym, ...peers.slice(0, 12)];
  const data = await Promise.all(
    all.map(async s => {
      const [p, q] = await Promise.all([fhGetProfile(s), fhGetQuote(s)]);
      if (!p) return null;
      return {
        ticker: s,
        name: p.name,
        mktCap: p.mktCap || 0,
        price: q?.price || 0,
        change: q?.changePct || 0,
        sector: p.sector,
        currency: p.currency,
        pe: null, pb: null, evEbitda: null, fcfYield: null,
        peg: null, divYield: null, epsGrowth: null,
        desc: p.sector || "",
      };
    })
  );
  return data.filter(Boolean);
}

/* ══════════════════════════════════════════════════════════════════
   ECONOMIC CALENDAR  → Macro·Intel ECON tab (secondary section)
   Endpoint: GET /calendar/economic
   Returns: events with impact H/M/L, actual/estimate/prev
   ══════════════════════════════════════════════════════════════════ */
const FH_ECON_CACHE = { data: null, ts: 0, TTL: 30 * 60 * 1000 };

async function fhFetchEconCalendar() {
  if (FH_ECON_CACHE.data && Date.now() - FH_ECON_CACHE.ts < FH_ECON_CACHE.TTL) {
    return FH_ECON_CACHE.data;
  }
  const from = fhDateStr(0);          // today
  const to   = fhDateStr(-14);        // +14 days forward (negative = future)
  // Finnhub date helper uses daysAgo — we need a forward date
  const d = new Date(); d.setDate(d.getDate() + 14);
  const toDate = d.toISOString().slice(0,10);
  const data = await fhFetch('/calendar/economic', { from, to: toDate });
  const events = (data?.economicCalendar || []);
  FH_ECON_CACHE.data = events;
  FH_ECON_CACHE.ts   = Date.now();
  return events;
}

async function fhRenderEconCalendar(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const key = getFinnhubKey();
  if (!key) {
    el.insertAdjacentHTML('beforeend',
      `<div class="fred-section-head" style="margin-top:14px">📅 Economic Calendar</div>
       <div class="no-data">// Finnhub key required.<br>
       <a href="#" onclick="openApiConfig('finnhub');return false" style="color:var(--accent)">Add key →</a></div>`);
    return;
  }
  el.insertAdjacentHTML('beforeend',
    `<div class="fred-section-head" style="margin-top:14px" id="econ-cal-head">📅 Economic Calendar <span class="av-spinner" style="display:inline-block;width:10px;height:10px"></span></div>
     <div id="econ-cal-body"></div>`);
  try {
    const events = await fhFetchEconCalendar();
    const now = Date.now();
    // Show next 14 days, high+medium impact, grouped by date
    const filtered = events
      .filter(e => e.impact === 'high' || e.impact === 'medium')
      .sort((a,b) => a.time > b.time ? 1 : -1);

    if (!filtered.length) {
      document.getElementById('econ-cal-body').innerHTML = '<div class="no-data">No high-impact events in next 14 days.</div>';
      document.getElementById('econ-cal-head').innerHTML = '📅 Economic Calendar';
      return;
    }

    // Group by date
    const byDate = {};
    for (const e of filtered) {
      const d = (e.time || '').slice(0,10);
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(e);
    }

    let html = '';
    const impactColor = { high:'#ff4d4d', medium:'#ffaa00', low:'var(--text-dim)' };
    const impactIcon  = { high:'🔴', medium:'🟡', low:'⚪' };

    for (const [date, evts] of Object.entries(byDate)) {
      const label = (() => {
        const d = new Date(date + 'T12:00:00Z');
        return d.toLocaleDateString('en-GB', { weekday:'short', day:'2-digit', month:'short' });
      })();
      html += `<div class="fh-econ-date-head">${label}</div>`;
      for (const e of evts) {
        const actual  = e.actual  != null ? `<b style="color:var(--accent)">${fhEsc(String(e.actual))}${e.unit||''}</b>` : '—';
        const est     = e.estimate != null ? `${fhEsc(String(e.estimate))}${e.unit||''}` : '—';
        const prev    = e.prev    != null ? `${fhEsc(String(e.prev))}${e.unit||''}`    : '—';
        const beat    = e.actual != null && e.estimate != null
          ? (parseFloat(e.actual) > parseFloat(e.estimate) ? '<span style="color:#4caf50">BEAT</span>'
            : parseFloat(e.actual) < parseFloat(e.estimate) ? '<span style="color:#ff4d4d">MISS</span>' : '')
          : '';
        html += `<div class="fh-econ-row">
          <span class="fh-econ-impact" title="${e.impact}" style="color:${impactColor[e.impact]||'inherit'}">${impactIcon[e.impact]||'⚪'}</span>
          <span class="fh-econ-country">${fhEsc(e.country||'')}</span>
          <span class="fh-econ-event">${fhEsc(e.event||'')} ${beat}</span>
          <span class="fh-econ-actual">${actual}</span>
          <span class="fh-econ-est">est ${est}</span>
          <span class="fh-econ-prev">prev ${prev}</span>
        </div>`;
      }
    }

    document.getElementById('econ-cal-body').innerHTML = html;
    document.getElementById('econ-cal-head').innerHTML = `📅 Economic Calendar · ${filtered.length} events`;
  } catch(err) {
    const b = document.getElementById('econ-cal-body');
    if (b) b.innerHTML = `<div class="no-data">// Calendar error: ${fhEsc(err.message)}</div>`;
    document.getElementById('econ-cal-head').innerHTML = '📅 Economic Calendar';
  }
}

/* ══════════════════════════════════════════════════════════════════
   FINNHUB WEBSOCKET SINGLETON  — Punto 1 Gap Analysis
   ──────────────────────────────────────────────────────────────────
   Real-time price push for:
   • Topbar ticker badge
   • Watchlist rows (.fh-ws-price[data-ticker])
   • Portfolio P&L cells (.port-live-price[data-ticker])
   • Quote hero price display (#quotePrice, #quoteChange)
   Pattern: one WS connection, N subscriptions, auto-reconnect 5s
   ══════════════════════════════════════════════════════════════════ */

const FH_WS_URL     = 'wss://ws.finnhub.io?token=';
const FH_WS_MAX_SUBS= 50;  // free tier limit

let _fhWs           = null;        // the WebSocket instance
let _fhWsReady      = false;       // true after 'connected' message
let _fhWsSubs       = new Set();   // currently subscribed symbols
let _fhWsLastPrices = {};          // { SYM: {p, t, v, c} } latest trade
let _fhWsConnAttempt= 0;
let _fhWsReconTimer = null;
let _fhWsEnabled    = false;       // set to true once key is available

/* ── Connect / reconnect ─────────────────────────────────────────── */
function fhWsConnect() {
  const key = getFinnhubKey();
  if (!key) { _fhWsEnabled = false; return; }
  if (_fhWs && _fhWs.readyState <= WebSocket.OPEN) return; // already open/connecting

  _fhWsEnabled = true;
  _fhWsConnAttempt++;
  try {
    _fhWs = new WebSocket(FH_WS_URL + key);

    _fhWs.onopen = () => {
      _fhWsReady = true;
      _fhWsConnAttempt = 0;
      console.info('[FH-WS] Connected');
      // Re-subscribe to all tracked symbols
      _fhWsSubs.forEach(sym => _fhWsSend({ type:'subscribe', symbol: sym }));
      // Update badge indicator
      _fhWsUpdateBadge('live');
    };

    _fhWs.onmessage = e => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'trade' && Array.isArray(msg.data)) {
          msg.data.forEach(trade => _fhWsHandleTrade(trade));
        }
      } catch {}
    };

    _fhWs.onclose = ev => {
      _fhWsReady = false;
      _fhWsUpdateBadge('disconnected');
      if (!ev.wasClean && _fhWsEnabled) {
        // Exponential backoff: 5s, 10s, 20s, max 30s
        const delay = Math.min(30000, 5000 * Math.pow(1.5, Math.min(_fhWsConnAttempt, 4)));
        _fhWsReconTimer = setTimeout(fhWsConnect, delay);
        console.info(`[FH-WS] Reconnecting in ${(delay/1000).toFixed(0)}s…`);
      }
    };

    _fhWs.onerror = () => { _fhWs?.close(); };

  } catch(e) {
    console.warn('[FH-WS] WebSocket error:', e.message);
  }
}

/* ── Disconnect cleanly ──────────────────────────────────────────── */
function fhWsDisconnect() {
  _fhWsEnabled = false;
  clearTimeout(_fhWsReconTimer);
  if (_fhWs) { _fhWs.close(1000, 'user disconnect'); _fhWs = null; }
  _fhWsReady = false;
  _fhWsSubs.clear();
  _fhWsUpdateBadge('off');
}

/* ── Reconnect (called after new key is saved) ───────────────────── */
window.fhWsReconnect = function() {
  fhWsDisconnect();
  setTimeout(fhWsConnect, 300);
};

/* ── Subscribe / unsubscribe a symbol ───────────────────────────── */
function fhWsSubscribe(sym) {
  if (!sym || _fhWsSubs.has(sym)) return;
  if (_fhWsSubs.size >= FH_WS_MAX_SUBS) {
    // Drop oldest subscription
    const oldest = _fhWsSubs.values().next().value;
    _fhWsUnsubscribe(oldest);
  }
  _fhWsSubs.add(sym);
  if (_fhWsReady) _fhWsSend({ type:'subscribe', symbol: sym });
}

function _fhWsUnsubscribe(sym) {
  _fhWsSubs.delete(sym);
  if (_fhWsReady) _fhWsSend({ type:'unsubscribe', symbol: sym });
}

function _fhWsSend(obj) {
  if (_fhWs?.readyState === WebSocket.OPEN) {
    try { _fhWs.send(JSON.stringify(obj)); } catch {}
  }
}

/* ── Handle incoming trade ───────────────────────────────────────── */
function _fhWsHandleTrade(trade) {
  // trade: { s: sym, p: price, t: timestamp_ms, v: volume, c: conditions[] }
  const sym = (trade.s || '').toUpperCase();
  if (!sym) return;

  const prev  = _fhWsLastPrices[sym]?.p;
  _fhWsLastPrices[sym] = trade;

  // Derive change direction
  const dir = prev != null ? (trade.p > prev ? 1 : trade.p < prev ? -1 : 0) : 0;

  // Dispatch DOM patches
  _fhWsPatchDOM(sym, trade.p, dir);

  // Also update the in-memory fhGetLive cache if it exists
  if (typeof _fhLive !== 'undefined' && _fhLive[sym]) {
    _fhLive[sym].quote = { ..._fhLive[sym].quote, price: trade.p };
  }
}

/* ── Patch all price DOM elements for a symbol ───────────────────── */
function _fhWsPatchDOM(sym, price, dir) {
  const fmt = p => {
    if (!p && p !== 0) return '—';
    return p >= 1000 ? '$' + p.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})
                     : p >= 1 ? '$' + p.toFixed(2)
                     : p >= 0.01 ? '$' + p.toFixed(4)
                     : '$' + p.toFixed(8);
  };
  const flashCls = dir > 0 ? 'fh-ws-flash-up' : dir < 0 ? 'fh-ws-flash-dn' : '';

  // Universal selector: any element with data-ticker attribute
  document.querySelectorAll(`[data-ticker="${sym}"]`).forEach(el => {
    // Portfolio live price cells
    if (el.classList.contains('port-live-price')) {
      el.textContent = fmt(price);
      if (flashCls) { el.classList.add(flashCls); setTimeout(() => el.classList.remove(flashCls), 800); }
    }
    // Crypto price cells
    if (el.classList.contains('cg-live-price')) {
      el.textContent = fmt(price);
    }
  });

  // Watchlist rows
  document.querySelectorAll(`.fh-ws-price[data-ticker="${sym}"]`).forEach(el => {
    el.textContent = fmt(price);
    if (flashCls) { el.classList.add(flashCls); setTimeout(() => el.classList.remove(flashCls), 800); }
  });

  // Quote hero — only if this is the currently loaded ticker
  const currentTicker = (typeof window.currentTicker !== 'undefined' ? window.currentTicker : '').replace(/.*:/,'').toUpperCase();
  if (sym === currentTicker) {
    // Live price in quote-qr panel (fhRenderQuote)
    const liveEl = document.getElementById('fh-quote-live-price');
    if (liveEl) {
      liveEl.textContent = '$' + (price >= 1000
        ? price.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
        : price >= 1 ? price.toFixed(2)
        : price >= 0.01 ? price.toFixed(4) : price.toFixed(8));
      if (flashCls) { liveEl.classList.add(flashCls); setTimeout(() => liveEl.classList.remove(flashCls), 800); }
    }
    // Topbar WS badge
    const badge = document.getElementById('fh-ws-live-badge');
    if (badge) badge.textContent = '$' + price.toFixed(2);
  }
}

/* ── WS status badge (tiny indicator near topbar) ────────────────── */
function _fhWsUpdateBadge(state) {
  let badge = document.getElementById('fh-ws-status');
  if (!badge) return;
  const map = { live:'● WS', disconnected:'○ WS', off:'' };
  const col = { live:'#3fb950', disconnected:'#f85149', off:'transparent' };
  badge.textContent = map[state] || '';
  badge.style.color = col[state] || 'var(--text-muted)';
}

/* ── Public API ──────────────────────────────────────────────────── */
window.fhWsConnect     = fhWsConnect;
window.fhWsDisconnect  = fhWsDisconnect;
window.fhWsSubscribe   = fhWsSubscribe;
window.fhWsLastPrices  = _fhWsLastPrices;

/* ── Auto-subscribe to current ticker on ticker change ───────────── */
(function() {
  const _origChange = window.changeTicker;
  if (typeof _origChange === 'function') {
    window.changeTicker = function() {
      _origChange.apply(this, arguments);
      const raw = document.getElementById('tickerInput')?.value?.trim()?.toUpperCase() || '';
      const sym = raw.replace(/.*:/,'');
      if (sym && _fhWsEnabled) fhWsSubscribe(sym);
    };
  }
})();

/* ── Init: connect when Finnhub key is present ───────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  if (getFinnhubKey()) {
    setTimeout(fhWsConnect, 1500); // slight delay so DOM is fully ready
  }
});
