/* ══════════════════════════════════════════════════════════════════
   yahoo.js  —  HYBRID DATA LAYER
   Strategy: Yahoo Finance (RapidAPI) when key configured,
             automatic fallback to FMP / Alpha Vantage / GNews
             when key missing or request fails.

   Panels wired:
     • Quote hero       → Yahoo quote  |  Finnhub + AV
     • YF·FIN tab       → Yahoo IS     |  FMP ratios-ttm
     • OPTIONS tab      → Yahoo chain  |  external links
     • YF·HLD tab       → Yahoo inst.  |  FMP ownership redirect
     • YF·HIST tab      → Yahoo hist   |  AV weekly adjusted
     • News feed        → Yahoo news   |  GNews (no key)
     • Analysts ANR     → Yahoo cons.  |  FMP recommendations
     • Comparables RV   → Yahoo peers  |  FMP stock_peers
     • COMP tab         → Yahoo multi  |  FMP batch quote
     • Trending         → Yahoo trend  |  FMP actives/gainers/losers
     • Valuation        → Yahoo quote  |  FMP ratios-ttm
     • Watchlist        → Yahoo batch  |  FMP batch (delegate)
   ══════════════════════════════════════════════════════════════════ */

/* ── Cache ────────────────────────────────────────────────────────── */
const _YH_CACHE = {};
const _YH_TTL = {
  quote:2*60, financials:3600, options:5*60, holders:3600,
  history:30*60, trending:5*60, news:10*60, peers:30*60,
  "analyst-rec":30*60, bq:2*60, fallback:30*60
};
function _yhCacheGet(key) {
  const e = _YH_CACHE[key];
  if (!e) return null;
  const cat = key.split(":")[0];
  return (Date.now() - e.ts < (_YH_TTL[cat]||300)*1000) ? e.data : null;
}
function _yhCacheSet(key, data) { _YH_CACHE[key] = { data, ts:Date.now() }; }

/* ── Key helpers ──────────────────────────────────────────────────── */
function yfGetKey()  { return (typeof getKey==="function" ? getKey("yahoo"):"") || ""; }
function _fmpKey()   { return (typeof getFmpKey==="function" ? getFmpKey():"") || ""; }
function _avKey()    { return (typeof getAvKey==="function"  ? getAvKey():"")  || ""; }

/* ── Shared utils ─────────────────────────────────────────────────── */
function _yhEsc(s) {
  return typeof escapeHtml==="function"
    ? escapeHtml(String(s??""))
    : String(s??"").replace(/[<>&"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]));
}
function _yhFmt(n, dec=2) {
  if (n==null||isNaN(n)) return "—";
  if (Math.abs(n)>=1e12) return (n/1e12).toFixed(1)+"T";
  if (Math.abs(n)>=1e9)  return (n/1e9).toFixed(1)+"B";
  if (Math.abs(n)>=1e6)  return (n/1e6).toFixed(1)+"M";
  if (Math.abs(n)>=1e3)  return (n/1e3).toFixed(1)+"K";
  return Number(n).toFixed(dec);
}
function _yhPct(n)  { return n==null?"—":(n*100).toFixed(2)+"%"; }
function _yhClr(n)  { return n>0?"pos":n<0?"neg":""; }
function _yhKpi(label,value) {
  if (value==null||value==="—"||value==="undefined%"||value==="NaN%") return "";
  return `<div class="yf-kpi"><span class="yf-kpi-lbl">${_yhEsc(label)}</span><span class="yf-kpi-val">${_yhEsc(String(value))}</span></div>`;
}

/* ── Yahoo RapidAPI fetch ─────────────────────────────────────────── */
async function _yhFetch(path, cacheKey) {
  const cached = _yhCacheGet(cacheKey);
  if (cached) return cached;
  const key = yfGetKey();
  if (!key) return null;
  try {
    const res = await fetch(`https://yahoo-finance15.p.rapidapi.com/api/v1/${path}`, {
      headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": "yahoo-finance15.p.rapidapi.com" }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    _yhCacheSet(cacheKey, json);
    return json;
  } catch(e) { console.warn("[Yahoo]", e.message); return null; }
}

/* ── FMP helpers ──────────────────────────────────────────────────── */
async function _fmpFetch(path, cacheKey) {
  const cached = _yhCacheGet("fallback:"+cacheKey);
  if (cached) return cached;
  const key = _fmpKey(); if (!key) return null;
  try {
    const res  = await fetch(`https://financialmodelingprep.com/api${path}?apikey=${key}`);
    const json = await res.json();
    _yhCacheSet("fallback:"+cacheKey, json);
    return json;
  } catch { return null; }
}
async function _fmpPeers(sym) {
  const d = await _fmpFetch(`/v4/stock_peers?symbol=${sym}`, `peers:${sym}`);
  return d?.[0]?.peersList ?? [];
}
async function _fmpBatch(syms) {
  if (!syms?.length) return {};
  const d = await _fmpFetch(`/v3/quote/${syms.join(",")}`, `bq:${syms.join(",")}`);
  const map = {};
  (d||[]).forEach(q=>{ if(q.symbol) map[q.symbol.toUpperCase()]=q; });
  return map;
}

/* ══════════════════════════════════════════════════════════════════
   1. QUOTE + YF·FIN TAB
   ══════════════════════════════════════════════════════════════════ */
window.yfLoadFinancials = async function(sym) {
  const el = document.getElementById("yf-financials");
  if (!el) return;
  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading financials…</div>`;

  /* ── Try Yahoo ── */
  const yhQ = await _yhFetch(`markets/stock/quotes?ticker=${sym}`, `quote:${sym}`);
  const q   = yhQ?.body?.[0] ?? null;

  if (q) {
    const chg = q.regularMarketChangePercent ?? 0;
    el.innerHTML = `
      <div class="av-live-badge">● LIVE — Yahoo Finance</div>
      <div class="yf-quote-hero">
        <div class="yf-quote-name">${_yhEsc(q.shortName||q.longName||sym)}</div>
        <div class="yf-quote-price">${q.regularMarketPrice!=null?"$"+q.regularMarketPrice.toFixed(2):"—"}</div>
        <div class="yf-quote-chg ${_yhClr(chg)}">${chg>=0?"+":""}${chg.toFixed(2)}%</div>
        <div class="yf-quote-exch">${_yhEsc(q.fullExchangeName||"")} · ${_yhEsc(q.currency||"")}</div>
      </div>
      <div class="section-head" style="margin-top:10px">Key Stats — Yahoo Finance</div>
      <div class="yf-kpi-grid">
        ${_yhKpi("Open",         q.regularMarketOpen!=null?"$"+q.regularMarketOpen.toFixed(2):null)}
        ${_yhKpi("Prev Close",   q.regularMarketPreviousClose!=null?"$"+q.regularMarketPreviousClose.toFixed(2):null)}
        ${_yhKpi("Day Range",    q.regularMarketDayLow!=null?`$${q.regularMarketDayLow.toFixed(2)} – $${q.regularMarketDayHigh.toFixed(2)}`:null)}
        ${_yhKpi("52W Range",    q.fiftyTwoWeekLow!=null?`$${q.fiftyTwoWeekLow.toFixed(2)} – $${q.fiftyTwoWeekHigh.toFixed(2)}`:null)}
        ${_yhKpi("Volume",       _yhFmt(q.regularMarketVolume,0))}
        ${_yhKpi("Avg Vol",      _yhFmt(q.averageDailyVolume3Month,0))}
        ${_yhKpi("Mkt Cap",      _yhFmt(q.marketCap))}
        ${_yhKpi("P/E (TTM)",    q.trailingPE!=null?q.trailingPE.toFixed(1):null)}
        ${_yhKpi("EPS (TTM)",    q.epsTrailingTwelveMonths!=null?"$"+q.epsTrailingTwelveMonths.toFixed(2):null)}
        ${_yhKpi("Div Yield",    q.dividendYield!=null?_yhPct(q.dividendYield):null)}
        ${_yhKpi("Beta",         q.beta!=null?q.beta.toFixed(2):null)}
        ${_yhKpi("Analyst",      q.averageAnalystRating||null)}
      </div>`;

    /* Also try Yahoo income statement */
    const yhFin = await _yhFetch(`stock/income-statement?symbol=${sym}&period=annual`, `financials:${sym}`);
    const rows  = yhFin?.body?.slice(0,4);
    if (rows?.length) {
      const years = rows.map(r=>(r.endDate||"").slice(0,4));
      const METRICS = [
        ["Total Revenue",   r=>_yhFmt(r.totalRevenue)],
        ["Gross Profit",    r=>_yhFmt(r.grossProfit)],
        ["Operating Income",r=>_yhFmt(r.operatingIncome)],
        ["Net Income",      r=>_yhFmt(r.netIncome)],
        ["EPS (diluted)",   r=>r.dilutedEPS!=null?"$"+r.dilutedEPS.toFixed(2):"—"],
        ["R&D",             r=>_yhFmt(r.researchDevelopment)],
      ];
      el.innerHTML += `
        <div class="section-head" style="margin-top:10px">Income Statement — Yahoo Finance</div>
        <div class="yf-fin-table-wrap">
          <table class="yf-fin-table">
            <thead><tr><th>Metric</th>${years.map(y=>`<th>${_yhEsc(y)}</th>`).join("")}</tr></thead>
            <tbody>${METRICS.map(([label,fn])=>`
              <tr><td class="yf-fin-label">${_yhEsc(label)}</td>${rows.map(r=>`<td>${fn(r)}</td>`).join("")}</tr>
            `).join("")}</tbody>
          </table>
        </div>`;
    }
    return;
  }

  /* ── Fallback: FMP ratios + Finnhub/AV quote ── */
  const fhL  = (typeof fhGetLive==="function")  ? fhGetLive(sym)  : null;
  const avC  = (typeof avLiveCache!=="undefined")? avLiveCache[sym]: null;
  const fmpL = (typeof fmpGetLive==="function")  ? fmpGetLive(sym) : null;
  const fhQ  = fhL?.quote || avC?.quote || null;
  const pr   = fhL?.profile || null;

  if (fhQ||pr) {
    const chg = fhQ?.changePercent ?? fhQ?.changePct ?? 0;
    el.innerHTML = `
      <div class="av-live-badge">● Finnhub / AV fallback</div>
      <div class="yf-quote-hero">
        <div class="yf-quote-name">${_yhEsc(pr?.name||sym)}</div>
        <div class="yf-quote-price">${fhQ?.price!=null?"$"+fhQ.price.toFixed(2):"—"}</div>
        <div class="yf-quote-chg ${_yhClr(chg)}">${chg>=0?"+":""}${chg.toFixed(2)}%</div>
        <div class="yf-quote-exch">${_yhEsc(pr?.exchange||"")} · ${_yhEsc(pr?.currency||"USD")}</div>
      </div>`;
  } else {
    el.innerHTML = "";
  }

  const r = fmpL?.ratios;
  if (r) {
    el.innerHTML += `<div class="section-head" style="margin-top:10px">Live Ratios (TTM) — FMP</div>
      <div class="yf-kpi-grid">
        ${_yhKpi("P/E",r.pe?.toFixed(1))}${_yhKpi("P/B",r.pb?.toFixed(2))}
        ${_yhKpi("P/S",r.ps?.toFixed(2))}${_yhKpi("EV/EBITDA",r.evEbitda?.toFixed(1))}
        ${_yhKpi("PEG",r.peg?.toFixed(2))}${_yhKpi("FCF Yield",r.fcfYield?.toFixed(2)+"%")}
        ${_yhKpi("Div Yield",r.divYield?.toFixed(2)+"%")}${_yhKpi("ROE",r.roe?.toFixed(1)+"%")}
        ${_yhKpi("Net Mgn",r.netMgn?.toFixed(1)+"%")}${_yhKpi("D/E",r.debtEq?.toFixed(2))}
      </div>`;
  } else {
    const rt = (await _fmpFetch(`/v3/ratios-ttm/${sym}`, `rtm:${sym}`))?.[0];
    if (rt) {
      el.innerHTML += `<div class="section-head" style="margin-top:10px">Live Ratios (TTM) — FMP</div>
        <div class="yf-kpi-grid">
          ${_yhKpi("P/E",rt.peRatioTTM?.toFixed(1))}
          ${_yhKpi("P/B",rt.priceToBookRatioTTM?.toFixed(2))}
          ${_yhKpi("EV/EBITDA",rt.enterpriseValueMultipleTTM?.toFixed(1))}
          ${_yhKpi("ROE",(rt.returnOnEquityTTM*100)?.toFixed(1)+"%")}
          ${_yhKpi("Net Mgn",(rt.netProfitMarginTTM*100)?.toFixed(1)+"%")}
          ${_yhKpi("D/E",rt.debtEquityRatioTTM?.toFixed(2))}
        </div>`;
    } else {
      el.innerHTML += `<div class="av-note" style="margin-top:8px">// Add Yahoo Finance key for full data · Add FMP for ratios.</div>`;
    }
  }
};

/* ══════════════════════════════════════════════════════════════════
   2. OPTIONS CHAIN
   ══════════════════════════════════════════════════════════════════ */
window.yfLoadOptions = async function(sym) {
  const el = document.getElementById("yf-options");
  if (!el) return;
  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading options chain…</div>`;

  const data = await _yhFetch(`stock/option-chain?symbol=${sym}`, `options:${sym}`);
  if (!data?.body) {
    el.innerHTML = `<div class="no-data" style="line-height:1.9">
      // Options chain requires Yahoo Finance key.<br>
      // Free resources:<br>
      // <a href="https://finance.yahoo.com/quote/${_yhEsc(sym)}/options/" target="_blank" class="geo-wm-link">Yahoo Finance ↗</a>
      &nbsp;·&nbsp; <a href="https://www.barchart.com/stocks/quotes/${_yhEsc(sym)}/options" target="_blank" class="geo-wm-link">Barchart ↗</a>
    </div>`;
    return;
  }

  const { options, expirationDates } = data.body;
  if (!options?.length) { el.innerHTML = `<div class="no-data">No options found.</div>`; return; }
  const chain    = options[0];
  const expLabel = expirationDates?.[0]
    ? new Date(expirationDates[0]*1000).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})
    : "—";

  window._yhChain = chain;
  window._yhOptView = "calls";

  const renderContracts = (contracts, type) => {
    if (!contracts?.length) return `<div class="yf-opts-empty">No ${type} data.</div>`;
    return `<table class="yf-opts-table">
      <thead><tr><th>Strike</th><th>Last</th><th>Bid</th><th>Ask</th><th>Vol</th><th>OI</th><th>IV</th></tr></thead>
      <tbody>${[...contracts].sort((a,b)=>(a.strike??0)-(b.strike??0)).map(c=>`
        <tr class="${c.inTheMoney?(type==="calls"?"yf-itm":""):(type==="puts"?"yf-itm":"")}">
          <td class="yf-strike">$${c.strike?.toFixed(2)??"—"}</td>
          <td>${c.lastPrice?.toFixed(2)??"—"}</td>
          <td>${c.bid?.toFixed(2)??"—"}</td>
          <td>${c.ask?.toFixed(2)??"—"}</td>
          <td>${_yhFmt(c.volume,0)}</td>
          <td>${_yhFmt(c.openInterest,0)}</td>
          <td>${c.impliedVolatility!=null?(c.impliedVolatility*100).toFixed(1)+"%":"—"}</td>
        </tr>`).join("")}
      </tbody></table>`;
  };

  el.innerHTML = `
    <div class="yf-opts-header">
      <span class="yf-opts-sym">${_yhEsc(sym)}</span>
      <span class="yf-opts-exp">Expiry: <strong>${_yhEsc(expLabel)}</strong></span>
      <div class="yf-opts-toggle">
        <button class="yf-opts-btn active" onclick="yfShowOpts('calls')">CALLS</button>
        <button class="yf-opts-btn"        onclick="yfShowOpts('puts')">PUTS</button>
      </div>
    </div>
    <div id="yf-opts-body" class="yf-opts-body">${renderContracts(chain.calls,"calls")}</div>`;

  window.yfShowOpts = function(type) {
    window._yhOptView = type;
    el.querySelectorAll(".yf-opts-btn").forEach(b=>b.classList.toggle("active",b.textContent.toLowerCase()===type));
    const body = document.getElementById("yf-opts-body");
    if (body) body.innerHTML = renderContracts(type==="calls"?window._yhChain.calls:window._yhChain.puts, type);
  };
};

/* ══════════════════════════════════════════════════════════════════
   3. INSTITUTIONAL HOLDERS
   ══════════════════════════════════════════════════════════════════ */
window.yfLoadHolders = async function(sym) {
  const el = document.getElementById("yf-holders");
  if (!el) return;
  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading holders…</div>`;

  const data = await _yhFetch(`stock/institutional-holder?symbol=${sym}`, `holders:${sym}`);
  if (data?.body?.length) {
    const holders = data.body.slice(0,20);
    el.innerHTML = `
      <div class="av-live-badge">● LIVE — Yahoo Finance</div>
      <div class="yf-holders-title">Top Institutional Holders</div>
      <table class="yf-hold-table">
        <thead><tr><th>Holder</th><th>Shares</th><th>Value</th><th>% Out</th><th>Date</th></tr></thead>
        <tbody>${holders.map(h=>`<tr>
          <td class="yf-hold-name">${_yhEsc(h.organization||h.holder||"—")}</td>
          <td>${_yhFmt(h.shares,0)}</td>
          <td>${_yhFmt(h.value)}</td>
          <td>${h.pctHeld!=null?_yhPct(h.pctHeld):"—"}</td>
          <td style="white-space:nowrap">${_yhEsc((h.reportDate||h.latestDate||"").slice(0,10))}</td>
        </tr>`).join("")}</tbody>
      </table>`;
    return;
  }
  /* Fallback */
  el.innerHTML = `<div class="av-note">// Yahoo Finance key required for institutional holders.<br>// Insider &amp; institutional data available in the <strong>Ownership</strong> panel (HDS tab) via FMP + Finnhub.</div>`;
};

/* ══════════════════════════════════════════════════════════════════
   4. PRICE HISTORY (YF·HIST tab)
   ══════════════════════════════════════════════════════════════════ */
window.yfLoadHistory = async function(sym) {
  const el = document.getElementById("yf-history");
  if (!el) return;
  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading price history…</div>`;

  /* ── Try Yahoo ── */
  const data = await _yhFetch(`stock/history?symbol=${sym}&period=1y&interval=1wk`, `history:${sym}:1y`);
  let bars = null;
  if (data?.body) {
    bars = Object.values(data.body).filter(b=>b.close!=null)
      .sort((a,b)=>(a.date||0)-(b.date||0)).slice(-52);
  }

  /* ── Fallback: AV weekly adjusted ── */
  if (!bars?.length) {
    const avKey = _avKey();
    if (avKey) {
      const cached = _yhCacheGet(`avhist:${sym}`);
      let avBars = cached;
      if (!avBars) {
        try {
          const res  = await fetch(`https://www.alphavantage.co/query?function=TIME_SERIES_WEEKLY_ADJUSTED&symbol=${sym}&apikey=${avKey}`);
          const json = await res.json();
          const ts   = json["Weekly Adjusted Time Series"]||{};
          avBars = Object.entries(ts)
            .map(([date,v])=>({date, close:parseFloat(v["5. adjusted close"])}))
            .filter(b=>!isNaN(b.close))
            .sort((a,b)=>a.date.localeCompare(b.date))
            .slice(-52);
          _yhCacheSet(`avhist:${sym}`, avBars);
        } catch {}
      }
      if (avBars?.length) bars = avBars;
    }
  }

  if (!bars?.length) {
    el.innerHTML = `<div class="no-data">// Add Yahoo Finance or Alpha Vantage key for price history.</div>`;
    return;
  }

  const prices = bars.map(b=>b.close), hi=Math.max(...prices), lo=Math.min(...prices);
  const norm   = v=>34-((v-lo)/(hi-lo||1))*34;
  const pts    = prices.map((v,i)=>`${(i/(prices.length-1))*300},${norm(v)}`).join(" ");
  const ret    = ((prices[prices.length-1]-prices[0])/prices[0])*100;
  const lc     = ret>=0?"#3fb950":"#f85149";
  const src    = data?.body ? "Yahoo Finance" : "Alpha Vantage";

  el.innerHTML = `
    <div class="yf-hist-header">
      <span class="yf-hist-sym">${_yhEsc(sym)}</span>
      <span class="yf-hist-period">52W weekly · ${src}</span>
      <span class="yf-hist-ret ${_yhClr(ret)}">${ret>=0?"+":""}${ret.toFixed(2)}%</span>
    </div>
    <svg viewBox="0 0 300 40" preserveAspectRatio="none" class="yf-hist-chart">
      <polyline points="${pts}" fill="none" stroke="${lc}" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>
    <div class="yf-hist-range">Low: <strong>$${lo.toFixed(2)}</strong> · High: <strong>$${hi.toFixed(2)}</strong></div>`;
};

/* ══════════════════════════════════════════════════════════════════
   5. NEWS supplement
   ══════════════════════════════════════════════════════════════════ */
window.yfLoadNews = async function(sym) {
  /* ── Try Yahoo news ── */
  const data = await _yhFetch(`news/list?symbol=${sym}&type=ALL`, `news:${sym}`);
  if (data?.body?.length) {
    const articles = data.body.slice(0,20).map(a=>({
      title:   a.title||"",
      url:     a.link||a.url||"#",
      source:  a.publisher||"Yahoo Finance",
      summary: a.description||"",
      time:    a.providerPublishTime
        ? new Date(a.providerPublishTime*1000).toLocaleDateString("en-US",{month:"short",day:"numeric"}) : "",
    }));
    if (typeof renderNewsFeed==="function") renderNewsFeed(sym, articles, "yahoo");
    return;
  }
  /* ── Fallback: GNews (100 req/day, no key) ── */
  try {
    const cached = _yhCacheGet(`gnews:${sym}`);
    let arts = cached;
    if (!arts) {
      const res  = await fetch(`https://gnews.io/api/v4/search?q=${encodeURIComponent(sym+" stock")}&lang=en&max=10&apikey=free`);
      const json = await res.json();
      arts = (json?.articles||[]).map(a=>({
        title:a.title||"", url:a.url||"#", source:a.source?.name||"GNews",
        summary:a.description||"",
        time:a.publishedAt?new Date(a.publishedAt).toLocaleDateString("en-US",{month:"short",day:"numeric"}):"",
      }));
      _yhCacheSet(`gnews:${sym}`, arts);
    }
    if (arts?.length && typeof renderNewsFeed==="function") renderNewsFeed(sym, arts, "gnews");
  } catch {}
};

/* ══════════════════════════════════════════════════════════════════
   6. ANALYST CONSENSUS (ANR tab append)
   ══════════════════════════════════════════════════════════════════ */
window.yfLoadAnalystSummary = async function(sym) {
  const anr = document.getElementById("analysts-anr");
  if (!anr || anr.querySelector(".yf-analyst-block")) return;

  /* ── Try Yahoo ── */
  const data = await _yhFetch(`stock/recommendation?symbol=${sym}`, `analyst-rec:${sym}`);
  if (data?.body?.length) {
    const recs = data.body.slice(0,8);
    const row  = recs[0];
    const total= (row?.strongBuy||0)+(row?.buy||0)+(row?.hold||0)+(row?.sell||0)+(row?.strongSell||0);
    const bullPct = total>0 ? Math.round(((row?.strongBuy||0)+(row?.buy||0))/total*100) : null;
    const COLORS = {strongBuy:"#3fb950",buy:"#58a6ff",hold:"#d29922",sell:"#f0883e",strongSell:"#f85149"};
    const block = document.createElement("div");
    block.className = "yf-analyst-block";
    block.style.cssText = "margin-top:10px;border-top:0.5px solid var(--border,#2a2f3a);padding-top:10px";
    block.innerHTML = `<div class="section-head" style="margin-bottom:6px">Consensus — Yahoo Finance</div>`
      +`<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px">`
      +Object.entries({strongBuy:row?.strongBuy||0,buy:row?.buy||0,hold:row?.hold||0,sell:row?.sell||0,strongSell:row?.strongSell||0})
        .filter(([,v])=>v>0).map(([k,v])=>{const c=COLORS[k];
          return `<div style="display:flex;flex-direction:column;align-items:center;background:${c}18;border:0.5px solid ${c};border-radius:5px;padding:4px 10px">
            <span style="font-size:16px;font-weight:700;color:${c}">${v}</span>
            <span style="font-size:9px;color:var(--muted,#6e7681);text-transform:uppercase">${k.replace(/([A-Z])/g," $1").trim()}</span>
          </div>`;}).join("")+`</div>`
      +(bullPct!=null?`<div style="font-size:11px;color:var(--muted,#6e7681)">${bullPct}% bullish · ${total} analysts · ${_yhEsc(row?.period||"")}</div>`:"")
      +`<div style="margin-top:8px">`+recs.map(r=>`
        <div style="display:flex;gap:8px;font-size:11px;padding:3px 0;border-bottom:0.5px solid rgba(255,255,255,.04)">
          <span style="color:var(--muted,#6e7681);min-width:65px">${_yhEsc(r.period||"—")}</span>
          <span style="color:#3fb950">${r.strongBuy} SBuy</span>
          <span style="color:#58a6ff">${r.buy} Buy</span>
          <span style="color:#d29922">${r.hold} Hold</span>
          <span style="color:#f0883e">${r.sell} Sell</span>
          <span style="color:#f85149">${r.strongSell} SSell</span>
        </div>`).join("")+`</div>`;
    anr.appendChild(block);
    return;
  }

  /* ── Fallback: FMP aggregate ── */
  if (anr.querySelector(".fdl-cons-block")) return;
  const fmpRecs = await _fmpFetch(`/v3/analyst-stock-recommendations/${sym}?limit=4`, `anr:${sym}`);
  if (!fmpRecs?.length) return;
  const agg={strongBuy:0,buy:0,hold:0,sell:0,strongSell:0};
  fmpRecs.forEach(r=>{
    agg.strongBuy +=r.analystRatingsStrongBuy??0; agg.buy+=r.analystRatingsBuy??0;
    agg.hold+=r.analystRatingsHold??0; agg.sell+=r.analystRatingsSell??0;
    agg.strongSell+=r.analystRatingsStrongSell??0;
  });
  const total2=Object.values(agg).reduce((a,b)=>a+b,0);
  if (!total2) return;
  const bull=Math.round((agg.strongBuy+agg.buy)/total2*100);
  const COLORS={strongBuy:"#3fb950",buy:"#58a6ff",hold:"#d29922",sell:"#f0883e",strongSell:"#f85149"};
  const block2=document.createElement("div");
  block2.className="fdl-cons-block";
  block2.style.cssText="margin-top:10px;padding:8px 0 4px;border-top:0.5px solid var(--border,#2a2f3a)";
  block2.innerHTML=`<div class="section-head" style="margin-bottom:6px">Consensus (4 periods) — FMP</div>`
    +`<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px">`
    +Object.entries(agg).filter(([,v])=>v>0).map(([k,v])=>{const c=COLORS[k];
      return `<div style="display:flex;flex-direction:column;align-items:center;background:${c}18;border:0.5px solid ${c};border-radius:5px;padding:4px 10px">
        <span style="font-size:16px;font-weight:700;color:${c}">${v}</span>
        <span style="font-size:9px;color:var(--muted,#6e7681);text-transform:uppercase">${k.replace(/([A-Z])/g," $1").trim()}</span>
      </div>`;}).join("")+`</div>`
    +`<div style="font-size:11px;color:var(--muted,#6e7681)">${bull}% bullish · ${total2} votes</div>`;
  anr.appendChild(block2);
};

/* ══════════════════════════════════════════════════════════════════
   7. PEERS (RV tab)
   ══════════════════════════════════════════════════════════════════ */
window.yfLoadPeers = async function(sym) {
  const rv = document.getElementById("comp-rv");
  if (!rv) return;

  /* ── Try Yahoo similar stocks ── */
  const data = await _yhFetch(`stock/similar-stocks?symbol=${sym}`, `peers:${sym}`);
  let peerList = data?.body?.map(p=>p.symbol).filter(Boolean) ?? null;

  /* ── Fallback: FMP stock_peers ── */
  if (!peerList?.length) peerList = await _fmpPeers(sym);
  if (!peerList?.length) return;

  const allSym = [sym, ...peerList.slice(0,11)];

  /* Quotes: try Yahoo batch, else FMP batch */
  let quotes = {};
  if (yfGetKey()) {
    const yhBatch = await _yhFetch(`markets/stock/quotes?ticker=${allSym.join(",")}`, `bq-yh:${allSym.join(",")}`);
    (yhBatch?.body||[]).forEach(q=>{ if(q.symbol) quotes[q.symbol.toUpperCase()]=q; });
  }
  if (!Object.keys(quotes).length) quotes = await _fmpBatch(allSym);

  const src = yfGetKey() ? "Yahoo Finance" : "FMP";
  const existing = rv.querySelector(".yf-peers-block,.fdl-peers-block");
  const block = document.createElement("div");
  block.className = "yf-peers-block";
  block.style.cssText = "margin-top:10px;border-top:0.5px solid var(--border,#2a2f3a);padding-top:10px";
  block.innerHTML = `<div class="section-head" style="margin-bottom:6px">Similar Stocks — ${src}</div>`
    +`<div style="display:flex;flex-wrap:wrap;gap:5px">`
    +allSym.map(s=>{
      const q   = quotes[s.toUpperCase()];
      const chg = q?.regularMarketChangePercent ?? q?.changesPercentage ?? 0;
      const pr  = q?.regularMarketPrice ?? q?.price ?? null;
      const clr = chg>=0?"#3fb950":"#f85149";
      const bdr = s===sym?"var(--link,#58a6ff)":"var(--border,#2a2f3a)";
      return `<div onclick="if(typeof changeTicker==='function')changeTicker('${_yhEsc(s)}')"
               style="display:flex;flex-direction:column;gap:2px;min-width:86px;background:var(--panel-bg,#0d1117);
                      border:0.5px solid ${bdr};border-radius:5px;padding:6px 10px;cursor:pointer"
               onmouseover="this.style.background='rgba(255,255,255,.05)'" onmouseout="this.style.background='var(--panel-bg,#0d1117)'">
        <span style="font-size:12px;font-weight:700;color:${s===sym?"var(--fg,#e6edf3)":"var(--link,#58a6ff)"}">${_yhEsc(s)}</span>
        <span style="font-size:10px;color:var(--muted,#6e7681)">${_yhEsc((q?.shortName||q?.name||"").slice(0,18))}</span>
        <span style="font-size:12px;font-weight:600;color:var(--fg,#e6edf3)">${pr!=null?"$"+pr.toFixed(2):"—"}</span>
        <span style="font-size:11px;font-weight:600;color:${clr}">${chg>=0?"+":""}${chg.toFixed(2)}%</span>
      </div>`;
    }).join("")+`</div>`;
  if (existing) rv.replaceChild(block, existing); else rv.appendChild(block);
};

/* ══════════════════════════════════════════════════════════════════
   8. COMP TAB — multi-column comparison
   ══════════════════════════════════════════════════════════════════ */
window.yfLoadComparison = async function(sym) {
  const comp = document.getElementById("comp-comp");
  if (!comp) return;
  comp.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading comparison…</div>`;

  let peerList = null;
  const yhPeers = await _yhFetch(`stock/similar-stocks?symbol=${sym}`, `peers:${sym}`);
  if (yhPeers?.body?.length) peerList = yhPeers.body.map(p=>p.symbol).filter(Boolean);
  if (!peerList?.length) peerList = await _fmpPeers(sym);

  const allSym = [sym, ...(peerList||[]).slice(0,9)];

  /* Fetch quotes */
  let quotes = {};
  if (yfGetKey()) {
    const d = await _yhFetch(`markets/stock/quotes?ticker=${allSym.join(",")}`, `bq-yh:${allSym.join(",")}`);
    (d?.body||[]).forEach(q=>{ if(q.symbol) quotes[q.symbol.toUpperCase()]=q; });
  }
  if (!Object.keys(quotes).length) quotes = await _fmpBatch(allSym);

  if (!Object.keys(quotes).length) {
    comp.innerHTML = `<div class="no-data">// Add FMP or Yahoo Finance key for peer comparison.</div>`; return;
  }

  const src = yfGetKey() ? "Yahoo Finance" : "FMP";
  const isYh = yfGetKey();

  const FIELDS = [
    ["Price",    q=>{ const v=isYh?q.regularMarketPrice:q.price; return v!=null?"$"+v.toFixed(2):"—"; }],
    ["Day Chg%", q=>{ const v=isYh?q.regularMarketChangePercent:q.changesPercentage; return v!=null?(v>=0?"+":"")+v.toFixed(2)+"%":"—"; }],
    ["52W High", q=>{ const v=isYh?q.fiftyTwoWeekHigh:q.yearHigh; return v!=null?"$"+v.toFixed(2):"—"; }],
    ["52W Low",  q=>{ const v=isYh?q.fiftyTwoWeekLow:q.yearLow; return v!=null?"$"+v.toFixed(2):"—"; }],
    ["Mkt Cap",  q=>{ const v=isYh?q.marketCap:q.marketCap; return v!=null?_yhFmt(v):"—"; }],
    ["P/E",      q=>{ const v=isYh?q.trailingPE:q.pe; return v!=null?v.toFixed(1):"—"; }],
    ["Beta",     q=>{ const v=q.beta; return v!=null?v.toFixed(2):"—"; }],
    ["Volume",   q=>{ const v=isYh?q.regularMarketVolume:q.volume; return v!=null?_yhFmt(v,0):"—"; }],
  ];

  const valid = allSym.map(s=>({s, q:quotes[s.toUpperCase()]||null}));
  comp.innerHTML = `<div class="av-live-badge">● ${src} · ${valid.length} peers</div>`
    +`<div style="overflow-x:auto"><table class="yf-fin-table"><thead><tr>`
    +`<th style="text-align:left">Metric</th>`
    +valid.map(({s})=>`<th style="color:${s===sym?"var(--link,#58a6ff)":"inherit"};white-space:nowrap">${_yhEsc(s)}</th>`).join("")
    +`</tr></thead><tbody>`
    +FIELDS.map(([label,fn])=>`<tr><td class="yf-fin-label">${_yhEsc(label)}</td>`
      +valid.map(({s,q})=>{
        if(!q) return "<td>—</td>";
        const v=fn(q), isC=label==="Day Chg%";
        const cls=isC?(v.startsWith("+")||v==="—"?"":v.startsWith("-")?"neg":"pos"):"";
        return `<td class="${cls}" style="${s===sym?"font-weight:700":""}">${v}</td>`;
      }).join("")+`</tr>`).join("")
    +`</tbody></table></div>`;
};

/* ══════════════════════════════════════════════════════════════════
   9. TRENDING — Yahoo | FMP fallback
   ══════════════════════════════════════════════════════════════════ */
window.yfLoadTrending = async function() {
  const el = document.getElementById("yf-trending");
  if (!el) return;
  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading market movers…</div>`;

  /* ── Try Yahoo trending ── */
  const yhData = await _yhFetch("markets/trending", "trending:global");
  if (yhData?.body?.length) {
    const items = yhData.body.slice(0,25);
    el.innerHTML = `<div class="av-live-badge">● LIVE — Yahoo Finance · Trending</div>`
      +`<div class="yf-trend-grid">`
      +items.map(t=>{
        const chg=t.regularMarketChangePercent??0, clr=_yhClr(chg);
        return `<div class="yf-trend-row" onclick="if(typeof changeTicker==='function')changeTicker('${_yhEsc(t.symbol)}')">
          <span class="yf-trend-sym">${_yhEsc(t.symbol)}</span>
          <span class="yf-trend-name">${_yhEsc((t.shortName||t.longName||"").slice(0,26))}</span>
          <span class="yf-trend-price">${t.regularMarketPrice!=null?"$"+t.regularMarketPrice.toFixed(2):"—"}</span>
          <span class="yf-trend-chg ${clr}">${chg>=0?"+":""}${chg.toFixed(2)}%</span>
        </div>`;
      }).join("")+`</div>`;
    return;
  }

  /* ── Fallback: FMP actives/gainers/losers ── */
  if (!_fmpKey()) { el.innerHTML = `<div class="no-data">// Add Yahoo Finance or FMP key to load market movers.</div>`; return; }
  const fmpCached = _yhCacheGet("fmp-movers");
  let mData = fmpCached;
  if (!mData) {
    try {
      const [act,gain,lose] = await Promise.all([
        fetch(`https://financialmodelingprep.com/api/v3/actives?apikey=${_fmpKey()}`).then(r=>r.json()),
        fetch(`https://financialmodelingprep.com/api/v3/gainers?apikey=${_fmpKey()}`).then(r=>r.json()),
        fetch(`https://financialmodelingprep.com/api/v3/losers?apikey=${_fmpKey()}`).then(r=>r.json()),
      ]);
      mData={actives:act||[],gainers:gain||[],losers:lose||[]};
      _yhCacheSet("fmp-movers", mData);
    } catch { el.innerHTML=`<div class="no-data">// Could not load market movers.</div>`; return; }
  }
  const sec=(title,items,fixCls)=>`<div class="section-head" style="margin:10px 0 5px">${_yhEsc(title)}</div>`
    +items.slice(0,8).map(t=>{
      const chg=parseFloat(t.changesPercentage??t.change??0);
      const cls=fixCls||(chg>=0?"pos":"neg");
      return `<div class="yf-trend-row" onclick="if(typeof changeTicker==='function')changeTicker('${_yhEsc(t.ticker||t.symbol)}')">
        <span class="yf-trend-sym">${_yhEsc(t.ticker||t.symbol)}</span>
        <span class="yf-trend-name">${_yhEsc((t.companyName||t.name||"").slice(0,26))}</span>
        <span class="yf-trend-price">${t.price!=null?"$"+parseFloat(t.price).toFixed(2):"—"}</span>
        <span class="yf-trend-chg ${cls}">${chg>=0?"+":""}${chg.toFixed(2)}%</span>
      </div>`;
    }).join("");
  el.innerHTML = `<div class="av-live-badge">● FMP · Market Movers (Yahoo fallback)</div>`
    +sec("🔥 Most Active",mData.actives,"")+sec("📈 Top Gainers",mData.gainers,"pos")+sec("📉 Top Losers",mData.losers,"neg");
};

/* ══════════════════════════════════════════════════════════════════
   10. VALUATION ENRICHMENT
   ══════════════════════════════════════════════════════════════════ */
window.yfEnrichValuation = async function(sym) {
  const fmpL = (typeof fmpGetLive==="function") ? fmpGetLive(sym) : null;
  const fhL  = (typeof fhGetLive==="function")  ? fhGetLive(sym)  : null;
  const avC  = (typeof avLiveCache!=="undefined")? avLiveCache[sym]: null;
  const price = fhL?.quote?.price || avC?.quote?.price || null;

  /* Yahoo quote for price/PE if no live data */
  let pe=null, pb=null, peg=null, divY=null, beta=null;
  const yhQ = await _yhFetch(`markets/stock/quotes?ticker=${sym}`, `quote:${sym}`);
  const yq  = yhQ?.body?.[0];
  if (yq) { pe=yq.trailingPE; pb=yq.priceToBook; peg=yq.trailingPegRatio; divY=yq.dividendYield!=null?yq.dividendYield*100:null; beta=yq.beta; }

  let ratios = fmpL?.ratios;
  if (!ratios) {
    const rt = (await _fmpFetch(`/v3/ratios-ttm/${sym}`, `rtm:${sym}`))?.[0];
    if (rt) ratios={
      pe:rt.peRatioTTM, pb:rt.priceToBookRatioTTM, peg:rt.pegRatioTTM,
      divYield:rt.dividendYieldTTM!=null?rt.dividendYieldTTM*100:null,
      evEbitda:rt.enterpriseValueMultipleTTM,
      fcfYield:rt.freeCashFlowYieldTTM!=null?rt.freeCashFlowYieldTTM*100:null,
    };
  }

  window.yfValData = window.yfValData||{};
  window.yfValData[sym] = {
    ticker:sym, name:yq?.shortName||fhL?.profile?.name||sym,
    price: yq?.regularMarketPrice||price,
    pe:    ratios?.pe    ?? pe,
    pb:    ratios?.pb    ?? pb,
    peg:   ratios?.peg   ?? peg,
    divYield: ratios?.divYield ?? divY,
    evEbitda: ratios?.evEbitda ?? null,
    fcfYield: ratios?.fcfYield ?? null,
    beta:  beta,
    epsGrowth: fmpL?.estimates?.[0]?.epsGrowth ?? 15,
  };
  if (typeof currentValTicker!=="undefined"
    && currentValTicker?.replace(/.*:/,"").toUpperCase()===sym
    && typeof renderValuation==="function") renderValuation(currentValTicker);
};

/* 11. WATCHLIST — delegate to FMP batch */
window.yfEnrichWatchlist = async function() {
  if (typeof fmpRefreshWatchlistPrices==="function") fmpRefreshWatchlistPrices();
};

/* ══════════════════════════════════════════════════════════════════
   MAIN ORCHESTRATOR
   ══════════════════════════════════════════════════════════════════ */
window.yfLoadAll = async function(sym) {
  if (!sym) return;
  const s = sym.replace(/.*:/,"").toUpperCase();
  Promise.all([
    yfLoadNews(s),
    yfLoadAnalystSummary(s),
    yfLoadPeers(s),
    yfEnrichValuation(s),
  ]).catch(e=>console.warn("[Yahoo/FDL]",e));
  const af = document.querySelector("#panel-fundamentals .tab-btn.active")?.dataset.tab;
  if (af==="yf-fin")  yfLoadFinancials(s);
  if (af==="yf-opt")  yfLoadOptions(s);
  if (af==="yf-hld")  yfLoadHolders(s);
  if (af==="yf-hist") yfLoadHistory(s);
  const ac = document.querySelector("#panel-comparables .tab-btn.active")?.dataset.tab;
  if (ac==="rv")   yfLoadPeers(s);
  if (ac==="comp") yfLoadComparison(s);
};

/* Startup: trending auto-load */
document.addEventListener("DOMContentLoaded", ()=>{
  setTimeout(()=>yfLoadTrending(), 1200);
  setInterval(()=>yfLoadTrending(), 5*60*1000);
});
