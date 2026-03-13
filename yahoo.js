/* ══════════════════════════════════════════════════════════════════
   yahoo.js  →  FREE DATA LAYER  (no API key required for most features)
   Replaces Yahoo Finance RapidAPI with:
     • FMP   — peers, actives/gainers/losers, comparison quotes, ratios
     • Alpha Vantage — price history sparkline
     • GNews public — supplemental news (100 req/day, no key)
     • All panel injections: News, Analysts, Comparables RV+COMP,
       Watchlist enrichment, Valuation enrichment, Trending, WACC
   ══════════════════════════════════════════════════════════════════ */

const _FDL_CACHE = {};
function _fdlCacheGet(key, ttlMs) {
  const e = _FDL_CACHE[key];
  return (e && Date.now() - e.ts < ttlMs) ? e.data : null;
}
function _fdlCacheSet(key, data) { _FDL_CACHE[key] = { data, ts: Date.now() }; }

function _fdlEsc(s) {
  return typeof escapeHtml === "function"
    ? escapeHtml(String(s ?? ""))
    : String(s ?? "").replace(/[<>&"]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]));
}
function _fdlFmt(n, dec = 2) {
  if (n == null || isNaN(n)) return "—";
  if (Math.abs(n) >= 1e12) return (n/1e12).toFixed(1)+"T";
  if (Math.abs(n) >= 1e9)  return (n/1e9).toFixed(1)+"B";
  if (Math.abs(n) >= 1e6)  return (n/1e6).toFixed(1)+"M";
  if (Math.abs(n) >= 1e3)  return (n/1e3).toFixed(1)+"K";
  return Number(n).toFixed(dec);
}
function _fdlClr(n) { return n > 0 ? "pos" : n < 0 ? "neg" : ""; }

/* ══════════════════════════════════════════════════════════════════
   PEERS & COMPARABLES RV TAB — FMP /v4/stock_peers (free w/ key)
   ══════════════════════════════════════════════════════════════════ */
async function _fmpGetPeers(sym) {
  const cached = _fdlCacheGet("peers:"+sym, 30*60*1000);
  if (cached) return cached;
  const key = (typeof getFmpKey === "function") ? getFmpKey() : "";
  if (!key) return null;
  try {
    const res  = await fetch("https://financialmodelingprep.com/api/v4/stock_peers?symbol="+sym+"&apikey="+key);
    const json = await res.json();
    const peers = json?.[0]?.peersList ?? [];
    _fdlCacheSet("peers:"+sym, peers);
    return peers;
  } catch { return null; }
}

async function _fmpBatchQuote(symbols) {
  if (!symbols?.length) return {};
  const k = symbols.join(",");
  const cached = _fdlCacheGet("bq:"+k, 2*60*1000);
  if (cached) return cached;
  const key = (typeof getFmpKey === "function") ? getFmpKey() : "";
  if (!key) return {};
  try {
    const res = await fetch("https://financialmodelingprep.com/api/v3/quote/"+k+"?apikey="+key);
    const arr = await res.json();
    const map = {};
    (arr||[]).forEach(q => { if (q.symbol) map[q.symbol.toUpperCase()] = q; });
    _fdlCacheSet("bq:"+k, map);
    return map;
  } catch { return {}; }
}

window.yfLoadPeers = async function(sym) {
  const rv = document.getElementById("comp-rv");
  if (!rv) return;
  const peers  = await _fmpGetPeers(sym);
  if (!peers?.length) return;
  const allSym = [sym, ...peers.slice(0,11)];
  const quotes = await _fmpBatchQuote(allSym);
  const existing = rv.querySelector(".fdl-peers-block");
  const block = document.createElement("div");
  block.className = "fdl-peers-block";
  block.style.cssText = "margin-top:10px;border-top:0.5px solid var(--border,#2a2f3a);padding-top:10px";
  block.innerHTML = "<div class='section-head' style='margin-bottom:6px'>Sector Peers — FMP</div>"
    + "<div style='display:flex;flex-wrap:wrap;gap:5px'>"
    + allSym.map(s => {
        const q   = quotes[s.toUpperCase()];
        const chg = q?.changesPercentage ?? 0;
        const clr = chg >= 0 ? "#3fb950" : "#f85149";
        const bdr = s===sym ? "var(--link,#58a6ff)" : "var(--border,#2a2f3a)";
        return "<div onclick=\"if(typeof changeTicker==='function')changeTicker('"+_fdlEsc(s)+"')\""
          +" style='display:flex;flex-direction:column;gap:2px;min-width:86px;background:var(--panel-bg,#0d1117);"
          +"border:0.5px solid "+bdr+";border-radius:5px;padding:6px 10px;cursor:pointer'"
          +" onmouseover=\"this.style.background='rgba(255,255,255,.05)'\" onmouseout=\"this.style.background='var(--panel-bg,#0d1117)'\">"
          +"<span style='font-size:12px;font-weight:700;color:"+(s===sym?"var(--fg,#e6edf3)":"var(--link,#58a6ff)")+"'>"+_fdlEsc(s)+"</span>"
          +"<span style='font-size:10px;color:var(--muted,#6e7681)'>"+_fdlEsc((q?.name||"").slice(0,18))+"</span>"
          +"<span style='font-size:12px;font-weight:600;color:var(--fg,#e6edf3)'>"+(q?.price!=null?"$"+q.price.toFixed(2):"—")+"</span>"
          +"<span style='font-size:11px;font-weight:600;color:"+clr+"'>"+(chg>=0?"+":"")+chg.toFixed(2)+"%</span>"
          +"</div>";
      }).join("")
    + "</div>";
  if (existing) rv.replaceChild(block, existing); else rv.appendChild(block);
};

/* ══════════════════════════════════════════════════════════════════
   COMP TAB — multi-column comparison table via FMP batch quote
   ══════════════════════════════════════════════════════════════════ */
window.yfLoadComparison = async function(sym) {
  const comp = document.getElementById("comp-comp");
  if (!comp) return;
  comp.innerHTML = "<div class='av-loading'><span class='av-spinner'></span>Loading peer comparison…</div>";
  const peers  = await _fmpGetPeers(sym);
  const allSym = [sym, ...(peers||[]).slice(0,9)];
  const quotes = await _fmpBatchQuote(allSym);
  if (!Object.keys(quotes).length) {
    comp.innerHTML = "<div class='no-data'>// Add FMP key in ⚙ Settings to enable peer comparison.</div>"; return;
  }
  const FIELDS = [
    ["Price",    q => q.price!=null?"$"+q.price.toFixed(2):"—"],
    ["Day Chg%", q => { const v=q.changesPercentage; return v!=null?(v>=0?"+":"")+v.toFixed(2)+"%":"—"; }],
    ["52W High", q => q.yearHigh!=null?"$"+q.yearHigh.toFixed(2):"—"],
    ["52W Low",  q => q.yearLow!=null?"$"+q.yearLow.toFixed(2):"—"],
    ["Mkt Cap",  q => q.marketCap!=null?_fdlFmt(q.marketCap):"—"],
    ["P/E",      q => q.pe!=null?q.pe.toFixed(1):"—"],
    ["EPS",      q => q.eps!=null?"$"+q.eps.toFixed(2):"—"],
    ["Volume",   q => q.volume!=null?_fdlFmt(q.volume,0):"—"],
  ];
  const valid = allSym.map(s=>({s,q:quotes[s.toUpperCase()]||null}));
  comp.innerHTML = "<div class='av-live-badge'>● FMP · "+valid.length+" peers</div>"
    +"<div style='overflow-x:auto'><table class='yf-fin-table'><thead><tr>"
    +"<th style='text-align:left'>Metric</th>"
    +valid.map(({s})=>"<th style='color:"+(s===sym?"var(--link,#58a6ff)":"inherit")+";white-space:nowrap'>"+_fdlEsc(s)+"</th>").join("")
    +"</tr></thead><tbody>"
    +FIELDS.map(([label,fn])=>
      "<tr><td class='yf-fin-label'>"+_fdlEsc(label)+"</td>"
      +valid.map(({s,q})=>{
        if(!q) return "<td>—</td>";
        const v=fn(q), isC=label==="Day Chg%";
        const cls=isC?(v.startsWith("+")||v==="—"?"":v.startsWith("-")?"neg":"pos"):"";
        return "<td class='"+cls+"' style='"+(s===sym?"font-weight:700":"")+"'>"+v+"</td>";
      }).join("")+"</tr>"
    ).join("")
    +"</tbody></table></div>";
};

/* ══════════════════════════════════════════════════════════════════
   TRENDING — FMP actives/gainers/losers
   ══════════════════════════════════════════════════════════════════ */
window.yfLoadTrending = async function() {
  const el = document.getElementById("yf-trending");
  if (!el) return;
  el.innerHTML = "<div class='av-loading'><span class='av-spinner'></span>Loading market movers…</div>";
  const key = (typeof getFmpKey === "function") ? getFmpKey() : "";
  if (!key) { el.innerHTML = "<div class='no-data'>// Add FMP key in ⚙ Settings to load market movers.</div>"; return; }
  const cached = _fdlCacheGet("trending", 5*60*1000);
  let data = cached;
  if (!data) {
    try {
      const [act,gain,lose] = await Promise.all([
        fetch("https://financialmodelingprep.com/api/v3/actives?apikey="+key).then(r=>r.json()),
        fetch("https://financialmodelingprep.com/api/v3/gainers?apikey="+key).then(r=>r.json()),
        fetch("https://financialmodelingprep.com/api/v3/losers?apikey="+key).then(r=>r.json()),
      ]);
      data = {actives:act||[],gainers:gain||[],losers:lose||[]};
      _fdlCacheSet("trending", data);
    } catch { el.innerHTML = "<div class='no-data'>// Could not load market movers.</div>"; return; }
  }
  const sec = (title,items,fixedClr) => "<div class='section-head' style='margin:10px 0 5px'>"+_fdlEsc(title)+"</div>"
    +items.slice(0,8).map(t=>{
      const chg=parseFloat(t.changesPercentage??t.change??0);
      const clr=fixedClr||(chg>=0?"pos":"neg");
      return "<div class='yf-trend-row' onclick=\"if(typeof changeTicker==='function')changeTicker('"+_fdlEsc(t.ticker||t.symbol)+"')\">"
        +"<span class='yf-trend-sym'>"+_fdlEsc(t.ticker||t.symbol)+"</span>"
        +"<span class='yf-trend-name'>"+_fdlEsc((t.companyName||t.name||"").slice(0,26))+"</span>"
        +"<span class='yf-trend-price'>"+(t.price!=null?"$"+parseFloat(t.price).toFixed(2):"—")+"</span>"
        +"<span class='yf-trend-chg "+clr+"'>"+(chg>=0?"+":"")+chg.toFixed(2)+"%</span>"
        +"</div>";
    }).join("");
  el.innerHTML = "<div class='av-live-badge'>● FMP · Market Movers</div>"
    +sec("🔥 Most Active",data.actives,"")
    +sec("📈 Top Gainers",data.gainers,"pos")
    +sec("📉 Top Losers", data.losers, "neg");
};

/* ══════════════════════════════════════════════════════════════════
   ANALYST SUMMARY append (ANR tab) — FMP recommendations aggregate
   ══════════════════════════════════════════════════════════════════ */
window.yfLoadAnalystSummary = async function(sym) {
  const anr = document.getElementById("analysts-anr");
  if (!anr || anr.querySelector(".fdl-cons-block")) return;
  const key = (typeof getFmpKey === "function") ? getFmpKey() : "";
  if (!key) return;
  const cached = _fdlCacheGet("anr-cons:"+sym, 30*60*1000);
  let data = cached;
  if (!data) {
    try {
      const res = await fetch("https://financialmodelingprep.com/api/v3/analyst-stock-recommendations/"+sym+"?limit=4&apikey="+key);
      data = await res.json();
      _fdlCacheSet("anr-cons:"+sym, data);
    } catch { return; }
  }
  if (!data?.length) return;
  const agg={strongBuy:0,buy:0,hold:0,sell:0,strongSell:0};
  data.forEach(r=>{
    agg.strongBuy  += r.analystRatingsStrongBuy  ??0;
    agg.buy        += r.analystRatingsBuy        ??0;
    agg.hold       += r.analystRatingsHold       ??0;
    agg.sell       += r.analystRatingsSell       ??0;
    agg.strongSell += r.analystRatingsStrongSell ??0;
  });
  const total = Object.values(agg).reduce((a,b)=>a+b,0);
  if (!total) return;
  const bullPct = Math.round((agg.strongBuy+agg.buy)/total*100);
  const bearPct = Math.round((agg.sell+agg.strongSell)/total*100);
  const COLORS  = {strongBuy:"#3fb950",buy:"#58a6ff",hold:"#d29922",sell:"#f0883e",strongSell:"#f85149"};
  const block = document.createElement("div");
  block.className = "fdl-cons-block";
  block.style.cssText = "margin-top:10px;padding:8px 0 4px;border-top:0.5px solid var(--border,#2a2f3a)";
  block.innerHTML = "<div class='section-head' style='margin-bottom:6px'>Consensus (4 periods) — FMP</div>"
    +"<div style='display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px'>"
    +Object.entries(agg).filter(([,v])=>v>0).map(([k,v])=>{
      const c=COLORS[k];
      return "<div style='display:flex;flex-direction:column;align-items:center;background:"+c+"18;border:0.5px solid "+c+";border-radius:5px;padding:4px 10px'>"
        +"<span style='font-size:16px;font-weight:700;color:"+c+"'>"+v+"</span>"
        +"<span style='font-size:9px;color:var(--muted,#6e7681);text-transform:uppercase;letter-spacing:.04em'>"+k.replace(/([A-Z])/g," $1").trim()+"</span>"
        +"</div>";
    }).join("")+"</div>"
    +"<div style='font-size:11px;color:var(--muted,#6e7681)'>"+bullPct+"% bullish · "+bearPct+"% bearish · "+total+" analyst votes</div>";
  anr.appendChild(block);
};

/* ══════════════════════════════════════════════════════════════════
   NEWS supplement — GNews (100/day no key) appended to feed
   ══════════════════════════════════════════════════════════════════ */
window.yfLoadNews = async function(sym) {
  const cached = _fdlCacheGet("gnews:"+sym, 10*60*1000);
  let articles = cached;
  if (!articles) {
    try {
      const res  = await fetch("https://gnews.io/api/v4/search?q="+encodeURIComponent(sym+" stock")+"&lang=en&max=10&apikey=free");
      const json = await res.json();
      articles = (json?.articles||[]).map(a=>({
        title:   a.title||"",
        url:     a.url||"#",
        source:  a.source?.name||"GNews",
        summary: a.description||"",
        time:    a.publishedAt?new Date(a.publishedAt).toLocaleDateString("en-US",{month:"short",day:"numeric"}):"",
      }));
      _fdlCacheSet("gnews:"+sym, articles);
    } catch { return; } // silently skip — not critical
  }
  if (articles?.length && typeof renderNewsFeed === "function") renderNewsFeed(sym, articles, "gnews");
};

/* ══════════════════════════════════════════════════════════════════
   VALUATION ENRICHMENT — FMP ratios-ttm fallback if cache empty
   ══════════════════════════════════════════════════════════════════ */
window.yfEnrichValuation = async function(sym) {
  const fmpLive = (typeof fmpGetLive === "function") ? fmpGetLive(sym) : null;
  const fhLive  = (typeof fhGetLive  === "function") ? fhGetLive(sym)  : null;
  const avCache = (typeof avLiveCache !== "undefined") ? avLiveCache[sym] : null;
  const price   = fhLive?.quote?.price || avCache?.quote?.price || null;

  let ratios = fmpLive?.ratios || null;
  if (!ratios) {
    const key = (typeof getFmpKey === "function") ? getFmpKey() : "";
    if (key) {
      try {
        const res  = await fetch("https://financialmodelingprep.com/api/v3/ratios-ttm/"+sym+"?apikey="+key);
        const json = await res.json();
        const r    = json?.[0];
        if (r) ratios = {
          pe:r.peRatioTTM, pb:r.priceToBookRatioTTM, peg:r.pegRatioTTM,
          divYield:r.dividendYieldTTM!=null?r.dividendYieldTTM*100:null,
          evEbitda:r.enterpriseValueMultipleTTM,
          fcfYield:r.freeCashFlowYieldTTM!=null?r.freeCashFlowYieldTTM*100:null,
        };
      } catch {}
    }
  }
  if (!ratios) return;
  window.yfValData = window.yfValData||{};
  window.yfValData[sym] = {
    ticker:sym, name:fhLive?.profile?.name||sym, price,
    pe:ratios.pe, pb:ratios.pb, peg:ratios.peg,
    divYield:ratios.divYield, evEbitda:ratios.evEbitda, fcfYield:ratios.fcfYield,
    epsGrowth:fmpLive?.estimates?.[0]?.epsGrowth??15,
  };
  if (typeof currentValTicker!=="undefined"
      && currentValTicker?.replace(/.*:/,"").toUpperCase()===sym
      && typeof renderValuation==="function") renderValuation(currentValTicker);
};

/* ══════════════════════════════════════════════════════════════════
   WATCHLIST ENRICHMENT — delegate to FMP batch (already optimal)
   ══════════════════════════════════════════════════════════════════ */
window.yfEnrichWatchlist = async function() {
  if (typeof fmpRefreshWatchlistPrices === "function") fmpRefreshWatchlistPrices();
};

/* ══════════════════════════════════════════════════════════════════
   YF·HIST TAB — Alpha Vantage weekly adjusted
   ══════════════════════════════════════════════════════════════════ */
window.yfLoadHistory = async function(sym) {
  const el = document.getElementById("yf-history");
  if (!el) return;
  el.innerHTML = "<div class='av-loading'><span class='av-spinner'></span>Loading price history…</div>";
  const key = (typeof getAvKey === "function") ? getAvKey() : "";
  if (!key) { el.innerHTML = "<div class='no-data'>// Add Alpha Vantage key for price history.</div>"; return; }
  const cached = _fdlCacheGet("hist:"+sym, 30*60*1000);
  let bars = cached;
  if (!bars) {
    try {
      const res  = await fetch("https://www.alphavantage.co/query?function=TIME_SERIES_WEEKLY_ADJUSTED&symbol="+sym+"&apikey="+key);
      const json = await res.json();
      const ts   = json["Weekly Adjusted Time Series"]||{};
      bars = Object.entries(ts)
        .map(([date,v])=>({date,close:parseFloat(v["5. adjusted close"])}))
        .filter(b=>!isNaN(b.close))
        .sort((a,b)=>a.date.localeCompare(b.date))
        .slice(-52);
      _fdlCacheSet("hist:"+sym, bars);
    } catch { el.innerHTML = "<div class='no-data'>// Could not load history.</div>"; return; }
  }
  if (!bars?.length) { el.innerHTML = "<div class='no-data'>No history data.</div>"; return; }
  const prices=bars.map(b=>b.close), hi=Math.max(...prices), lo=Math.min(...prices);
  const norm=v=>34-((v-lo)/(hi-lo||1))*34;
  const pts=prices.map((v,i)=>`${(i/(prices.length-1))*300},${norm(v)}`).join(" ");
  const ret=((prices[prices.length-1]-prices[0])/prices[0])*100;
  const lc=ret>=0?"#3fb950":"#f85149";
  el.innerHTML = "<div class='yf-hist-header'>"
    +"<span class='yf-hist-sym'>"+_fdlEsc(sym)+"</span>"
    +"<span class='yf-hist-period'>52W weekly · Alpha Vantage</span>"
    +"<span class='yf-hist-ret "+_fdlClr(ret)+"'>"+(ret>=0?"+":"")+ret.toFixed(2)+"%</span>"
    +"</div>"
    +"<svg viewBox='0 0 300 40' preserveAspectRatio='none' class='yf-hist-chart'>"
    +"<polyline points='"+pts+"' fill='none' stroke='"+lc+"' stroke-width='1.5' stroke-linejoin='round'/>"
    +"</svg>"
    +"<div class='yf-hist-range'>Low: <strong>$"+lo.toFixed(2)+"</strong> · High: <strong>$"+hi.toFixed(2)+"</strong>"
    +" · "+_fdlEsc(bars[0]?.date||"")+" → "+_fdlEsc(bars[bars.length-1]?.date||"")+"</div>";
};

/* ══════════════════════════════════════════════════════════════════
   YF·FIN TAB — quote hero + FMP live ratios
   ══════════════════════════════════════════════════════════════════ */
window.yfLoadFinancials = async function(sym) {
  const el = document.getElementById("yf-financials");
  if (!el) return;
  const fhL  = (typeof fhGetLive  === "function") ? fhGetLive(sym)  : null;
  const avC  = (typeof avLiveCache !== "undefined") ? avLiveCache[sym] : null;
  const fmpL = (typeof fmpGetLive === "function") ? fmpGetLive(sym) : null;
  const q    = fhL?.quote || avC?.quote || null;
  const pr   = fhL?.profile || null;
  const chg  = q?.changePercent ?? q?.changePct ?? 0;
  el.innerHTML = q||pr ? `
    <div class="yf-quote-hero">
      <div class="yf-quote-name">${_fdlEsc(pr?.name||sym)}</div>
      <div class="yf-quote-price">${q?.price!=null?"$"+q.price.toFixed(2):"—"}</div>
      <div class="yf-quote-chg ${_fdlClr(chg)}">${chg>=0?"+":""}${chg.toFixed(2)}%</div>
      <div class="yf-quote-exch">${_fdlEsc(pr?.exchange||"")} · ${_fdlEsc(pr?.currency||"USD")}</div>
    </div>` : "<div class='av-loading'><span class='av-spinner'></span>Loading…</div>";

  const r = fmpL?.ratios;
  if (r) {
    const kpi=(l,v)=>v!=null?`<div class="yf-kpi"><span class="yf-kpi-lbl">${_fdlEsc(l)}</span><span class="yf-kpi-val">${_fdlEsc(String(v))}</span></div>`:"";
    el.innerHTML += `<div class="section-head" style="margin-top:10px">Live Ratios (TTM) — FMP</div>
      <div class="yf-kpi-grid">
        ${kpi("P/E",r.pe?.toFixed(1))}${kpi("P/B",r.pb?.toFixed(2))}${kpi("P/S",r.ps?.toFixed(2))}
        ${kpi("EV/EBITDA",r.evEbitda?.toFixed(1))}${kpi("PEG",r.peg?.toFixed(2))}
        ${kpi("FCF Yield",r.fcfYield?.toFixed(2)+"%")}${kpi("Div Yield",r.divYield?.toFixed(2)+"%")}
        ${kpi("ROE",r.roe?.toFixed(1)+"%")}${kpi("ROA",r.roa?.toFixed(1)+"%")}
        ${kpi("Gross Mgn",r.grossMgn?.toFixed(1)+"%")}${kpi("Net Mgn",r.netMgn?.toFixed(1)+"%")}
        ${kpi("D/E",r.debtEq?.toFixed(2))}
      </div>`;
  } else {
    const key=(typeof getFmpKey==="function")?getFmpKey():"";
    if (key) {
      try {
        const res=await fetch("https://financialmodelingprep.com/api/v3/ratios-ttm/"+sym+"?apikey="+key);
        const rt=(await res.json())?.[0];
        if (rt) el.innerHTML+=`<div class="section-head" style="margin-top:10px">Live Ratios (TTM) — FMP</div>
          <div class="yf-kpi-grid">
            ${[["P/E",rt.peRatioTTM?.toFixed(1)],["P/B",rt.priceToBookRatioTTM?.toFixed(2)],
               ["EV/EBITDA",rt.enterpriseValueMultipleTTM?.toFixed(1)],
               ["ROE",(rt.returnOnEquityTTM*100)?.toFixed(1)+"%"],
               ["Net Mgn",(rt.netProfitMarginTTM*100)?.toFixed(1)+"%"],
               ["D/E",rt.debtEquityRatioTTM?.toFixed(2)]]
              .filter(([,v])=>v&&v!=="undefined%"&&v!=="NaN%")
              .map(([l,v])=>`<div class="yf-kpi"><span class="yf-kpi-lbl">${_fdlEsc(l)}</span><span class="yf-kpi-val">${_fdlEsc(v)}</span></div>`)
              .join("")}
          </div>`;
      } catch {}
    } else {
      el.innerHTML += "<div class='av-note' style='margin-top:8px'>// Add FMP + Finnhub/AV keys for live data.</div>";
    }
  }
};

/* OPTIONS tab — no free API available */
window.yfLoadOptions = async function(sym) {
  const el = document.getElementById("yf-options");
  if (!el) return;
  el.innerHTML = `<div class="no-data" style="line-height:1.9">
    // Options chain requires a paid data feed.<br>
    // Free resources:<br>
    // <a href="https://finance.yahoo.com/quote/${_fdlEsc(sym)}/options/" target="_blank" class="geo-wm-link">Yahoo Finance ↗</a>
    &nbsp;·&nbsp; <a href="https://www.barchart.com/stocks/quotes/${_fdlEsc(sym)}/options" target="_blank" class="geo-wm-link">Barchart ↗</a>
  </div>`;
};

/* HOLDERS tab — redirect to Ownership panel */
window.yfLoadHolders = async function(sym) {
  const el = document.getElementById("yf-holders");
  if (!el) return;
  el.innerHTML = "<div class='av-note'>// Institutional & insider holders are in the <strong>Ownership</strong> panel (HDS tab).<br>// Powered by FMP + Finnhub — no extra key needed.</div>";
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
  ]).catch(e=>console.warn("[FDL]",e));
  const af = document.querySelector("#panel-fundamentals .tab-btn.active")?.dataset.tab;
  if (af==="yf-fin")  yfLoadFinancials(s);
  if (af==="yf-opt")  yfLoadOptions(s);
  if (af==="yf-hld")  yfLoadHolders(s);
  if (af==="yf-hist") yfLoadHistory(s);
  const ac = document.querySelector("#panel-comparables .tab-btn.active")?.dataset.tab;
  if (ac==="rv")   yfLoadPeers(s);
  if (ac==="comp") yfLoadComparison(s);
};

document.addEventListener("DOMContentLoaded", ()=>{
  setTimeout(()=>{ if(typeof getFmpKey==="function"&&getFmpKey()) yfLoadTrending(); }, 1000);
  setInterval(()=>{ if(typeof getFmpKey==="function"&&getFmpKey()) yfLoadTrending(); }, 5*60*1000);
});
