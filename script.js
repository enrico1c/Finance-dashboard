/* ══════════════════════════════════════════════════════════════════
   FINTERM — Finance Dashboard · script.js
   ══════════════════════════════════════════════════════════════════ */

let currentTicker        = "AAPL";
let currentForexPair     = "EUR/USD";
let currentForexInterval = "60";

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function fmt(n,dec=2){ return Number(n).toLocaleString("en-US",{minimumFractionDigits:dec,maximumFractionDigits:dec}); }
function fmtB(n){
  n=Number(n);
  if(n>=1e12) return "$"+(n/1e12).toFixed(2)+"T";
  if(n>=1e9)  return "$"+(n/1e9).toFixed(2)+"B";
  if(n>=1e6)  return "$"+(n/1e6).toFixed(2)+"M";
  return "$"+Math.abs(n).toFixed(0);
}

/* ── Exchange DB ─────────────────────────────────────────────────── */
const exchangeDB = {
  AAPL:"NASDAQ",MSFT:"NASDAQ",GOOGL:"NASDAQ",GOOG:"NASDAQ",AMZN:"NASDAQ",
  META:"NASDAQ",NVDA:"NASDAQ",TSLA:"NASDAQ",NFLX:"NASDAQ",AMD:"NASDAQ",
  INTC:"NASDAQ",QCOM:"NASDAQ",PYPL:"NASDAQ",ADBE:"NASDAQ",CSCO:"NASDAQ",
  SBUX:"NASDAQ",COST:"NASDAQ",AVGO:"NASDAQ",TXN:"NASDAQ",AMAT:"NASDAQ",
  MU:"NASDAQ",LRCX:"NASDAQ",KLAC:"NASDAQ",MRVL:"NASDAQ",ASML:"NASDAQ",
  JPM:"NYSE",BAC:"NYSE",GS:"NYSE",MS:"NYSE",WMT:"NYSE",V:"NYSE",
  MA:"NYSE",XOM:"NYSE",CVX:"NYSE",KO:"NYSE",DIS:"NYSE",PFE:"NYSE",
  JNJ:"NYSE",PG:"NYSE",HD:"NYSE",UNH:"NYSE",MRK:"NYSE",IBM:"NYSE",
  GE:"NYSE",BA:"NYSE",CAT:"NYSE",AXP:"NYSE",CRM:"NYSE",NKE:"NYSE",
  T:"NYSE",VZ:"NYSE",C:"NYSE",WFC:"NYSE",F:"NYSE",GM:"NYSE",
  SPY:"AMEX",QQQ:"NASDAQ",IWM:"AMEX",GLD:"NYSE",
  BTC:"BITSTAMP",ETH:"BITSTAMP",
};
function resolveSymbol(raw){
  const s=raw.trim().toUpperCase();
  if(s.includes(":")) return s;
  return (exchangeDB[s]||"NASDAQ")+":"+s;
}
function getExchangeLabel(raw){
  const s=raw.trim().toUpperCase();
  if(s.includes(":")) return s.split(":")[0];
  return exchangeDB[s]||"AUTO";
}
function updateExchangeHint(){
  const h=document.getElementById("exchangeHint");
  if(h) h.textContent=getExchangeLabel(document.getElementById("tickerInput")?.value||"");
}
function mapForexPairToSymbol(p){ return "FX:"+p.replace("/","").toUpperCase().trim(); }

/* ══════════════════════════════════════════════════════════════════
   MOCK DATA
   ══════════════════════════════════════════════════════════════════ */
const DB = {
  AAPL:{
    name:"Apple Inc.",sector:"Technology",industry:"Consumer Electronics",
    exchange:"NASDAQ",founded:"1976",employees:"164,000",hq:"Cupertino, CA",
    description:"Apple Inc. designs, manufactures and markets smartphones, personal computers, tablets, wearables and accessories worldwide. Products include iPhone, Mac, iPad, Apple Watch and AirPods, plus a growing Services segment (App Store, Apple Music, iCloud, Apple TV+, Apple Pay).",
    mktCap:2870000000000,pe:29.4,eps:6.42,div:0.96,divYield:0.44,
    roe:"164%",beta:1.24,ytd:"+23.1%",pbv:48.2,evEbitda:22.1,debtEq:1.73,
    week52High:260.10,week52Low:164.08,avgVol:"58.2M",float:"15.43B",
    price:260.83,bid:260.78,ask:260.89,spread:0.11,
    open:257.65,high:262.48,low:256.95,prevClose:259.88,
    volume:"30.59M",avgVolume30:"55.2M",
    exchanges:[
      {name:"NASDAQ",bid:260.78,ask:260.89,size:"2400×1800",last:260.83},
      {name:"NYSE",  bid:260.76,ask:260.91,size:"1200×900", last:260.82},
      {name:"BATS",  bid:260.77,ask:260.90,size:"800×600",  last:260.80},
      {name:"IEX",   bid:260.79,ask:260.88,size:"500×400",  last:260.84},
    ],
    trades:[
      {time:"15:59:58",price:260.83,size:1240,exch:"NASDAQ",dir:"up"},
      {time:"15:59:55",price:260.80,size:820, exch:"BATS",  dir:"dn"},
      {time:"15:59:52",price:260.85,size:3100,exch:"NYSE",  dir:"up"},
      {time:"15:59:50",price:260.79,size:550, exch:"IEX",   dir:"dn"},
      {time:"15:59:47",price:260.82,size:2200,exch:"NASDAQ",dir:"up"},
      {time:"15:59:44",price:260.77,size:400, exch:"BATS",  dir:"dn"},
      {time:"15:59:40",price:260.84,size:1800,exch:"NYSE",  dir:"up"},
      {time:"15:59:36",price:260.81,size:990, exch:"NASDAQ",dir:"dn"},
      {time:"15:59:30",price:260.76,size:3400,exch:"NASDAQ",dir:"dn"},
      {time:"15:59:25",price:260.78,size:670, exch:"IEX",   dir:"up"},
    ],
    income:[
      {year:2024,revenue:391035,grossProfit:180683,ebit:123216,netIncome:93736,eps:6.11},
      {year:2023,revenue:383285,grossProfit:169148,ebit:114301,netIncome:96995,eps:6.16},
      {year:2022,revenue:394328,grossProfit:170782,ebit:119437,netIncome:99803,eps:6.15},
      {year:2021,revenue:365817,grossProfit:152836,ebit:108949,netIncome:94680,eps:5.61},
      {year:2020,revenue:274515,grossProfit:104956,ebit:66288, netIncome:57411,eps:3.28},
    ],
    balance:[
      {year:2024,totalAssets:364840,totalLiab:308030,equity:56810,cash:65171,debt:101304},
      {year:2023,totalAssets:352583,totalLiab:290437,equity:62146,cash:61555,debt:111088},
      {year:2022,totalAssets:352755,totalLiab:302083,equity:50672,cash:48304,debt:120069},
    ],
    cashflow:[
      {year:2024,operatingCF:118254,capex:-9447, freeCF:108807,dividends:-15234},
      {year:2023,operatingCF:110543,capex:-10959,freeCF:99584, dividends:-14996},
      {year:2022,operatingCF:122151,capex:-10708,freeCF:111443,dividends:-14841},
    ],
    earnings:[
      {quarter:"Q4 2024",reportDate:"2024-10-31",epsEst:1.60,epsActual:1.64,surprise:"+2.5%",revEst:94.5,revActual:94.9,surpriseRev:"+0.4%"},
      {quarter:"Q3 2024",reportDate:"2024-08-01",epsEst:1.34,epsActual:1.40,surprise:"+4.5%",revEst:84.5,revActual:85.8,surpriseRev:"+1.5%"},
      {quarter:"Q2 2024",reportDate:"2024-05-02",epsEst:1.50,epsActual:1.53,surprise:"+2.0%",revEst:90.5,revActual:90.8,surpriseRev:"+0.3%"},
      {quarter:"Q1 2024",reportDate:"2024-02-01",epsEst:2.10,epsActual:2.18,surprise:"+3.8%",revEst:117.9,revActual:119.6,surpriseRev:"+1.4%"},
      {quarter:"Q4 2023",reportDate:"2023-11-02",epsEst:1.39,epsActual:1.46,surprise:"+5.0%",revEst:89.3,revActual:89.5,surpriseRev:"+0.2%"},
    ],
    estimates:[
      {period:"Q1 2025E",epsLow:1.62,epsMean:1.74,epsHigh:1.88,revMean:94.2, analysts:28},
      {period:"Q2 2025E",epsLow:1.38,epsMean:1.51,epsHigh:1.65,revMean:87.9, analysts:26},
      {period:"FY 2025E",epsLow:6.52,epsMean:7.00,epsHigh:7.48,revMean:411.3,analysts:31},
      {period:"FY 2026E",epsLow:7.10,epsMean:7.68,epsHigh:8.20,revMean:448.2,analysts:28},
    ],
    wacc:{costOfEquity:8.4,costOfDebt:3.2,taxRate:15.4,equityWeight:73.2,debtWeight:26.8,
      wacc:7.0,riskFreeRate:4.2,erp:5.8,beta:1.24,terminalGrowth:3.0,impliedIV:"$248–$312"},
    analysts:{
      buy:28,hold:8,sell:2,total:38,avgTarget:245.50,highTarget:300.00,lowTarget:185.00,
      ratings:[
        {firm:"Goldman Sachs",  rating:"Buy",  target:275,date:"2025-02-14",analyst:"Michael Ng"},
        {firm:"Morgan Stanley", rating:"Buy",  target:270,date:"2025-02-10",analyst:"Erik Woodring"},
        {firm:"JPMorgan",       rating:"Buy",  target:265,date:"2025-01-30",analyst:"Samik Chatterjee"},
        {firm:"Barclays",       rating:"Hold", target:230,date:"2025-02-05",analyst:"Tim Long"},
        {firm:"UBS",            rating:"Buy",  target:260,date:"2025-01-28",analyst:"David Vogt"},
        {firm:"Piper Sandler",  rating:"Hold", target:225,date:"2025-02-12",analyst:"Harsh Kumar"},
        {firm:"Wedbush",        rating:"Buy",  target:325,date:"2025-03-01",analyst:"Dan Ives"},
        {firm:"BofA",           rating:"Buy",  target:250,date:"2025-01-25",analyst:"Wamsi Mohan"},
      ]
    },
    research:[
      {firm:"Goldman Sachs",  date:"2025-03-01",title:"iPhone Supercycle Thesis Intact Heading Into 2025",    pages:28},
      {firm:"Morgan Stanley", date:"2025-02-20",title:"Services Momentum Drives Re-Rating; Upgrading to OW",  pages:34},
      {firm:"JPMorgan",       date:"2025-02-10",title:"AI Integration Could Add $30–50 to Intrinsic Value",   pages:22},
      {firm:"Barclays",       date:"2025-01-30",title:"Valuation Premium Hard to Justify at Current Levels",  pages:18},
      {firm:"Wedbush",        date:"2025-03-05",title:"Cook & Co. Positioned for $4T Market Cap by 2026",     pages:15},
    ],
    holdings:{
      institutional:[
        {name:"Vanguard Group",      pct:9.15,shares:"1.39B",change:"+0.3%",type:"Index"},
        {name:"BlackRock Inc.",      pct:6.89,shares:"1.05B",change:"-0.1%",type:"Index"},
        {name:"Berkshire Hathaway",  pct:5.73,shares:"872M", change:"0.0%", type:"Active"},
        {name:"State Street Corp.",  pct:3.84,shares:"584M", change:"+0.1%",type:"Index"},
        {name:"Fidelity Mgmt.",      pct:2.41,shares:"367M", change:"+0.4%",type:"Active"},
        {name:"Geode Capital Mgmt.", pct:1.92,shares:"292M", change:"+0.2%",type:"Index"},
        {name:"T. Rowe Price",       pct:1.45,shares:"221M", change:"-0.2%",type:"Active"},
      ],
      insiders:[
        {name:"Tim Cook (CEO)",         shares:"3.28M",value:"$855M",action:"Sell",change:"-245K",date:"2025-02-14"},
        {name:"Luca Maestri (CFO)",     shares:"892K", value:"$233M",action:"Sell",change:"-120K",date:"2025-01-30"},
        {name:"Jeff Williams (COO)",    shares:"1.12M",value:"$292M",action:"Hold",change:"0",    date:"—"},
        {name:"Deirdre O'Brien (SVP)",  shares:"445K", value:"$116M",action:"Buy", change:"+50K", date:"2025-03-01"},
        {name:"Arthur Levinson (Chair)",shares:"4.21M",value:"$1.1B",action:"Hold",change:"0",    date:"—"},
      ]
    },
    mgmt:[
      {name:"Tim Cook",        role:"Chief Executive Officer",   since:2011,pay:"$63.2M",age:64},
      {name:"Luca Maestri",    role:"Chief Financial Officer",   since:2014,pay:"$26.5M",age:61},
      {name:"Jeff Williams",   role:"Chief Operating Officer",   since:2010,pay:"$26.7M",age:61},
      {name:"Craig Federighi", role:"SVP Software Engineering",  since:2012,pay:"$26.5M",age:56},
      {name:"Eddy Cue",        role:"SVP Services",              since:2011,pay:"$26.5M",age:60},
      {name:"Katherine Adams", role:"SVP General Counsel",       since:2017,pay:"$25.1M",age:56},
      {name:"Deirdre O'Brien", role:"SVP Retail + People",       since:2019,pay:"$26.5M",age:57},
      {name:"Arthur Levinson", role:"Chairman of the Board",     since:2011,pay:"$4.2M", age:74},
    ],
    events:[
      {date:"2025-04-25",type:"Earnings",   title:"Q2 FY2025 Earnings Call",         note:"Conference call 2PM ET. Webcast available."},
      {date:"2025-05-08",type:"Dividend",   title:"Dividend Ex-Date $0.25/share",     note:"Record date May 12."},
      {date:"2025-05-15",type:"Dividend",   title:"Dividend Payment $0.25/share",     note:"Payment to shareholders of record."},
      {date:"2025-06-10",type:"Conference", title:"WWDC 2025 — Developer Conference", note:"Keynote expected to feature AI updates."},
      {date:"2025-07-25",type:"Earnings",   title:"Q3 FY2025 Earnings Call",         note:"Preliminary date, subject to change."},
      {date:"2025-02-26",type:"Shareholder",title:"Annual Shareholder Meeting",       note:"Virtual format. Proxy on IR site."},
    ],
    rv:[
      {ticker:"AAPL", name:"Apple",     mktCap:"$2.87T",pe:29.4,evEbitda:22.1,pbv:48.2,roe:"164%",divYield:"0.44%",ytd:"+23.1%"},
      {ticker:"MSFT", name:"Microsoft", mktCap:"$3.12T",pe:35.1,evEbitda:24.8,pbv:13.1,roe:"38%", divYield:"0.71%",ytd:"+18.4%"},
      {ticker:"GOOGL",name:"Alphabet",  mktCap:"$2.14T",pe:24.8,evEbitda:16.2,pbv:7.2, roe:"28%", divYield:"0.48%",ytd:"+14.2%"},
      {ticker:"META", name:"Meta",      mktCap:"$1.35T",pe:28.3,evEbitda:19.4,pbv:9.1, roe:"34%", divYield:"0.36%",ytd:"+31.5%"},
      {ticker:"AMZN", name:"Amazon",    mktCap:"$1.97T",pe:44.6,evEbitda:18.9,pbv:10.4,roe:"20%", divYield:"—",    ytd:"+21.7%"},
    ],
    comp:[
      {label:"1M", aapl:"+3.2%", spy:"+2.1%", qqq:"+3.8%"},
      {label:"3M", aapl:"+8.4%", spy:"+5.2%", qqq:"+7.1%"},
      {label:"6M", aapl:"+12.1%",spy:"+8.9%", qqq:"+14.2%"},
      {label:"YTD",aapl:"+23.1%",spy:"+12.4%",qqq:"+18.7%"},
      {label:"1Y", aapl:"+31.5%",spy:"+22.8%",qqq:"+28.4%"},
      {label:"3Y", aapl:"+48.2%",spy:"+31.4%",qqq:"+42.1%"},
      {label:"5Y", aapl:"+312%", spy:"+98%",  qqq:"+148%"},
    ],
  }
};

function getTickerData(ticker){ return DB[ticker.toUpperCase().replace(/.*:/,"")]||null; }

/* ══════════════════════════════════════════════════════════════════
   TAB SYSTEM
   ══════════════════════════════════════════════════════════════════ */
function switchTab(panelId, tabId){
  const p=document.getElementById(`panel-${panelId}`);
  if(!p) return;
  p.querySelectorAll(".tab-btn").forEach(b=>b.classList.toggle("active",b.dataset.tab===tabId));
  p.querySelectorAll(".tab-pane").forEach(x=>x.classList.toggle("active",x.dataset.tab===tabId));
}

/* ── Shared renderers ─── */
function mRow(label,value,cls=""){
  return `<div class="metric ${cls}"><span>${escapeHtml(String(label))}</span><span>${escapeHtml(String(value))}</span></div>`;
}
function sHead(t){ return `<div class="section-head">${escapeHtml(t)}</div>`; }
function noData(t){ return `<div class="no-data">// No local data for <strong>${escapeHtml(t)}</strong>.<br>Connect an API to populate live data.</div>`; }

/* ══════════════════════════════════════════════════════════════════
   RENDER: FUNDAMENTALS  (DES / FA / ERN / EE / WACC)
   ══════════════════════════════════════════════════════════════════ */
function renderFundamentals(ticker){
  const d=getTickerData(ticker);

  /* DES */
  const des=document.getElementById("fund-des");
  if(des){
    if(!d){ des.innerHTML=noData(ticker); return; }
    des.innerHTML=`
      ${mRow("Company",   d.name)}
      ${mRow("Sector",    d.sector)}
      ${mRow("Industry",  d.industry)}
      ${mRow("Exchange",  d.exchange)}
      ${mRow("Founded",   d.founded)}
      ${mRow("Employees", d.employees)}
      ${mRow("HQ",        d.hq)}
      ${mRow("Mkt Cap",   fmtB(d.mktCap))}
      ${mRow("P/E",       d.pe)}
      ${mRow("EV/EBITDA", d.evEbitda)}
      ${mRow("P/BV",      d.pbv)}
      ${mRow("Debt/Eq",   d.debtEq)}
      ${mRow("Beta",      d.beta)}
      ${mRow("52W High",  "$"+d.week52High)}
      ${mRow("52W Low",   "$"+d.week52Low)}
      ${mRow("Float",     d.float)}
      <div class="desc-block">${escapeHtml(d.description)}</div>`;
  }

  /* FA */
  const fa=document.getElementById("fund-fa");
  if(fa && d){
    const incR=d.income.map(r=>`<tr><td>${r.year}</td><td>${fmtB(r.revenue*1e6)}</td><td>${fmtB(r.grossProfit*1e6)}</td><td>${fmtB(r.ebit*1e6)}</td><td>${fmtB(r.netIncome*1e6)}</td><td>$${fmt(r.eps)}</td></tr>`).join("");
    const balR=d.balance.map(r=>`<tr><td>${r.year}</td><td>${fmtB(r.totalAssets*1e6)}</td><td>${fmtB(r.totalLiab*1e6)}</td><td>${fmtB(r.equity*1e6)}</td><td>${fmtB(r.cash*1e6)}</td><td>${fmtB(r.debt*1e6)}</td></tr>`).join("");
    const cfR=d.cashflow.map(r=>`<tr><td>${r.year}</td><td>${fmtB(r.operatingCF*1e6)}</td><td>${fmtB(r.capex*1e6)}</td><td>${fmtB(r.freeCF*1e6)}</td><td>${fmtB(r.dividends*1e6)}</td></tr>`).join("");
    fa.innerHTML=`
      ${sHead("Income Statement (USD)")}
      <div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Year</th><th>Revenue</th><th>Gross Profit</th><th>EBIT</th><th>Net Income</th><th>EPS</th></tr></thead><tbody>${incR}</tbody></table></div>
      ${sHead("Balance Sheet (USD)")}
      <div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Year</th><th>Total Assets</th><th>Total Liab.</th><th>Equity</th><th>Cash</th><th>Debt</th></tr></thead><tbody>${balR}</tbody></table></div>
      ${sHead("Cash Flow (USD)")}
      <div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Year</th><th>Operating CF</th><th>CapEx</th><th>Free CF</th><th>Dividends</th></tr></thead><tbody>${cfR}</tbody></table></div>`;
  }

  /* ERN */
  const ern=document.getElementById("fund-ern");
  if(ern && d){
    const rows=d.earnings.map(r=>`<tr>
      <td>${r.quarter}</td><td>${r.reportDate}</td>
      <td>$${fmt(r.epsEst)}</td><td>$${fmt(r.epsActual)}</td>
      <td class="${r.surprise.startsWith("+")?'pos':'neg'}">${r.surprise}</td>
      <td>$${fmt(r.revEst)}B</td><td>$${fmt(r.revActual)}B</td>
      <td class="${r.surpriseRev.startsWith("+")?'pos':'neg'}">${r.surpriseRev}</td>
    </tr>`).join("");
    ern.innerHTML=`${sHead("Earnings & Revenue Surprises")}<div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Quarter</th><th>Date</th><th>EPS Est.</th><th>EPS Act.</th><th>Surpr.</th><th>Rev Est.</th><th>Rev Act.</th><th>Surpr.</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  /* EE */
  const ee=document.getElementById("fund-ee");
  if(ee && d){
    const rows=d.estimates.map(r=>`<tr><td>${r.period}</td><td>$${fmt(r.epsLow)}</td><td class="accent"><strong>$${fmt(r.epsMean)}</strong></td><td>$${fmt(r.epsHigh)}</td><td>$${fmt(r.revMean)}B</td><td>${r.analysts}</td></tr>`).join("");
    ee.innerHTML=`${sHead("Analyst EPS & Revenue Estimates")}<div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Period</th><th>EPS Low</th><th>EPS Mean</th><th>EPS High</th><th>Rev Mean</th><th>Analysts</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  /* WACC */
  const wc=document.getElementById("fund-wacc");
  if(wc && d){
    const w=d.wacc;
    wc.innerHTML=`
      ${sHead("WACC Calculation")}
      ${mRow("Risk-Free Rate (Rf)",   w.riskFreeRate+"%")}
      ${mRow("Equity Risk Premium",   w.erp+"%")}
      ${mRow("Beta (Levered)",        w.beta)}
      ${mRow("Cost of Equity (Ke)",   w.costOfEquity+"%")}
      ${mRow("Pre-Tax Cost of Debt",  w.costOfDebt+"%")}
      ${mRow("Tax Rate",              w.taxRate+"%")}
      ${mRow("Equity Weight",         w.equityWeight+"%")}
      ${mRow("Debt Weight",           w.debtWeight+"%")}
      <div class="metric wacc-result"><span>→ WACC</span><span>${w.wacc}%</span></div>
      ${sHead("DCF Sensitivity")}
      ${mRow("Terminal Growth Rate",  w.terminalGrowth+"%")}
      ${mRow("Implied Intrinsic Value",w.impliedIV)}`;
  }
}

/* ══════════════════════════════════════════════════════════════════
   RENDER: NEWS  (CN / EVTS / BRC / BI)
   ══════════════════════════════════════════════════════════════════ */
function renderNews(ticker){
  const d=getTickerData(ticker);
  const q=ticker.replace(/.*:/,"");
  const sources=[
    {s:"Google News",    u:`https://news.google.com/search?q=${encodeURIComponent(q)}`},
    {s:"Bloomberg",      u:`https://www.bloomberg.com/search?query=${encodeURIComponent(q)}`},
    {s:"Reuters",        u:`https://www.reuters.com/site-search/?query=${encodeURIComponent(q)}`},
    {s:"Financial Times",u:`https://www.ft.com/search?q=${encodeURIComponent(q)}`},
    {s:"CNBC",           u:`https://www.cnbc.com/search/?query=${encodeURIComponent(q)}`},
    {s:"MarketWatch",    u:`https://www.marketwatch.com/search?q=${encodeURIComponent(q)}&ts=0&tab=All`},
    {s:"Seeking Alpha",  u:`https://seekingalpha.com/search?q=${encodeURIComponent(q)}`},
    {s:"Ground News",    u:`https://ground.news/search?query=${encodeURIComponent(q)}`},
  ];

  const cn=document.getElementById("news-cn");
  if(cn) cn.innerHTML=`<div class="news-list">${sources.map(i=>`<div class="news-item"><a href="${i.u}" target="_blank" rel="noopener noreferrer">${escapeHtml(i.s)} → ${escapeHtml(q)}</a><div class="news-meta">${escapeHtml(i.s)}</div></div>`).join("")}</div>`;

  const evts=document.getElementById("news-evts");
  if(evts){
    if(!d){ evts.innerHTML=noData(ticker); }
    else {
      const tc={Earnings:"var(--accent)",Dividend:"var(--accent-green)",Conference:"var(--accent-yellow)",Shareholder:"var(--accent-orange)"};
      evts.innerHTML=d.events.sort((a,b)=>a.date.localeCompare(b.date)).map(ev=>`
        <div class="event-item">
          <div class="event-date">${ev.date}</div>
          <div class="event-body">
            <span class="event-type" style="color:${tc[ev.type]||"var(--text-secondary)"}">${ev.type}</span>
            <div class="event-title">${escapeHtml(ev.title)}</div>
            <div class="event-note">${escapeHtml(ev.note)}</div>
          </div>
        </div>`).join("");
    }
  }

  const brc=document.getElementById("news-brc");
  if(brc){
    if(!d){ brc.innerHTML=noData(ticker); }
    else brc.innerHTML=d.research.map(r=>`
      <div class="research-item">
        <div class="research-header"><span class="research-firm">${escapeHtml(r.firm)}</span><span class="research-date">${r.date}</span></div>
        <div class="research-title">${escapeHtml(r.title)}</div>
        <div class="research-meta">${r.pages} pages · Full report access requires institutional subscription</div>
      </div>`).join("");
  }

  const bi=document.getElementById("news-bi");
  if(bi) bi.innerHTML=`
    <div class="bi-note">Bloomberg Intelligence provides independent analysis by sector specialists. Full access requires a Bloomberg Terminal subscription.</div>
    ${[
      {date:"2025-03-05",title:"Apple's AI Integration: A $100B Opportunity in Services",topic:"Technology Sector"},
      {date:"2025-02-18",title:"iPhone Unit Economics: Premium Pricing Holds Despite Macro Headwinds",topic:"Consumer Hardware"},
      {date:"2025-01-30",title:"India Market Expansion: Next Growth Frontier for Apple Ecosystem",topic:"Emerging Markets"},
    ].map(r=>`<div class="research-item"><div class="research-header"><span class="research-firm">Bloomberg Intelligence</span><span class="research-date">${r.date}</span></div><div class="research-title">${escapeHtml(r.title)}</div><div class="research-meta">BI Report · ${r.topic}</div></div>`).join("")}`;
}

/* ══════════════════════════════════════════════════════════════════
   RENDER: QUOTE  (QR / MON)
   ══════════════════════════════════════════════════════════════════ */
function renderQuote(ticker){
  const d=getTickerData(ticker);

  const qr=document.getElementById("quote-qr");
  if(qr){
    if(!d){ qr.innerHTML=noData(ticker); }
    else {
      const rows=d.trades.map(t=>`<tr class="${t.dir==="up"?"pos":"neg"}"><td>${t.time}</td><td>$${fmt(t.price)}</td><td>${Number(t.size).toLocaleString()}</td><td>${t.exch}</td></tr>`).join("");
      qr.innerHTML=`
        <div class="quote-grid">
          ${mRow("Last",      "$"+fmt(d.price))}
          ${mRow("Open",      "$"+fmt(d.open))}
          ${mRow("High",      "$"+fmt(d.high),"metric-up")}
          ${mRow("Low",       "$"+fmt(d.low),"metric-down")}
          ${mRow("Prev Close","$"+fmt(d.prevClose))}
          ${mRow("Volume",    d.volume)}
          ${mRow("Avg Vol 30d",d.avgVolume30)}
        </div>
        ${sHead("Time & Sales")}
        <div class="fin-table-wrap"><table class="fin-table ts-table"><thead><tr><th>Time</th><th>Price</th><th>Size</th><th>Exchange</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
  }

  const mon=document.getElementById("quote-mon");
  if(mon){
    if(!d){ mon.innerHTML=noData(ticker); }
    else {
      const rows=d.exchanges.map(e=>`<tr><td>${e.name}</td><td class="pos">$${fmt(e.bid)}</td><td class="neg">$${fmt(e.ask)}</td><td>${fmt(e.ask-e.bid,3)}</td><td>${e.size}</td><td>$${fmt(e.last)}</td></tr>`).join("");
      mon.innerHTML=`
        ${sHead("Best Bid / Ask")}
        ${mRow("Bid",    "$"+fmt(d.bid),"metric-up")}
        ${mRow("Ask",    "$"+fmt(d.ask),"metric-down")}
        ${mRow("Spread", "$"+fmt(d.spread,3))}
        ${sHead("Multi-Exchange Book")}
        <div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Exchange</th><th>Bid</th><th>Ask</th><th>Spread</th><th>Size (B×A)</th><th>Last</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
  }
}

/* ══════════════════════════════════════════════════════════════════
   RENDER: ANALYSTS  (ANR / BRC)
   ══════════════════════════════════════════════════════════════════ */
function renderAnalysts(ticker){
  const d=getTickerData(ticker);

  const anr=document.getElementById("analysts-anr");
  if(anr){
    if(!d){ anr.innerHTML=noData(ticker); }
    else {
      const a=d.analysts;
      const bp=Math.round(a.buy/a.total*100), hp=Math.round(a.hold/a.total*100), sp=100-bp-hp;
      const rows=a.ratings.map(r=>`<tr><td>${r.firm}</td><td>${r.analyst}</td><td class="${r.rating==="Buy"?"pos":r.rating==="Sell"?"neg":"neutral"}">${r.rating}</td><td>$${fmt(r.target)}</td><td>${r.date}</td></tr>`).join("");
      anr.innerHTML=`
        ${sHead("Consensus")}
        <div class="consensus-bar">
          <div class="cb-seg buy"  style="width:${bp}%">${a.buy} Buy</div>
          <div class="cb-seg hold" style="width:${hp}%">${a.hold} Hold</div>
          <div class="cb-seg sell" style="width:${sp}%">${a.sell} Sell</div>
        </div>
        ${mRow("Avg Target",   "$"+fmt(a.avgTarget))}
        ${mRow("High Target",  "$"+fmt(a.highTarget))}
        ${mRow("Low Target",   "$"+fmt(a.lowTarget))}
        ${mRow("Current Price","$"+fmt(d.price))}
        ${mRow("Upside to Avg",fmt((a.avgTarget/d.price-1)*100,1)+"%")}
        ${sHead("Individual Ratings")}
        <div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Firm</th><th>Analyst</th><th>Rating</th><th>Target</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
  }

  const abrc=document.getElementById("analysts-brc");
  if(abrc){
    if(!d){ abrc.innerHTML=noData(ticker); }
    else abrc.innerHTML=d.research.map(r=>`
      <div class="research-item">
        <div class="research-header"><span class="research-firm">${escapeHtml(r.firm)}</span><span class="research-date">${r.date}</span></div>
        <div class="research-title">${escapeHtml(r.title)}</div>
        <div class="research-meta">${r.pages} pages</div>
      </div>`).join("");
  }
}

/* ══════════════════════════════════════════════════════════════════
   RENDER: OWNERSHIP  (HDS / MGMT)
   ══════════════════════════════════════════════════════════════════ */
function renderOwnership(ticker){
  const d=getTickerData(ticker);

  const hds=document.getElementById("own-hds");
  if(hds){
    if(!d){ hds.innerHTML=noData(ticker); }
    else {
      const ir=d.holdings.institutional.map(h=>`<tr><td>${h.name}</td><td>${h.type}</td><td>${h.pct}%</td><td>${h.shares}</td><td class="${h.change.startsWith("+")?'pos':h.change.startsWith("-")?'neg':''}">${h.change}</td></tr>`).join("");
      const ins=d.holdings.insiders.map(i=>`<tr><td>${i.name}</td><td>${i.shares}</td><td>${i.value}</td><td class="${i.action==="Buy"?'pos':i.action==="Sell"?'neg':''}">${i.action}</td><td>${i.change}</td><td>${i.date}</td></tr>`).join("");
      hds.innerHTML=`
        ${sHead("Institutional Holders")}
        <div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Institution</th><th>Type</th><th>% Own</th><th>Shares</th><th>QoQ Chg</th></tr></thead><tbody>${ir}</tbody></table></div>
        ${sHead("Insider Transactions")}
        <div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Insider</th><th>Shares</th><th>Value</th><th>Action</th><th>Change</th><th>Date</th></tr></thead><tbody>${ins}</tbody></table></div>`;
    }
  }

  const mg=document.getElementById("own-mgmt");
  if(mg){
    if(!d){ mg.innerHTML=noData(ticker); }
    else mg.innerHTML=d.mgmt.map(m=>`
      <div class="mgmt-card">
        <div class="mgmt-avatar">${m.name.split(" ").map(w=>w[0]).join("").slice(0,2)}</div>
        <div class="mgmt-info">
          <div class="mgmt-name">${escapeHtml(m.name)}</div>
          <div class="mgmt-role">${escapeHtml(m.role)}</div>
          <div class="mgmt-meta">Since ${m.since} · Age ${m.age} · Pay: ${m.pay}</div>
        </div>
      </div>`).join("");
  }
}

/* ══════════════════════════════════════════════════════════════════
   RENDER: COMPARABLES  (RV / COMP)
   ══════════════════════════════════════════════════════════════════ */
function renderComparables(ticker){
  const d=getTickerData(ticker);

  const rv=document.getElementById("comp-rv");
  if(rv){
    if(!d){ rv.innerHTML=noData(ticker); }
    else {
      const rows=d.rv.map(r=>`<tr class="${r.ticker===ticker.toUpperCase()?"current-row":""}"><td><strong>${r.ticker}</strong></td><td>${r.name}</td><td>${r.mktCap}</td><td>${r.pe}</td><td>${r.evEbitda}</td><td>${r.pbv}</td><td>${r.roe}</td><td>${r.divYield}</td><td class="${r.ytd.startsWith("+")?'pos':'neg'}">${r.ytd}</td></tr>`).join("");
      rv.innerHTML=`${sHead("Peer Valuation Multiples")}<div class="fin-table-wrap"><table class="fin-table rv-table"><thead><tr><th>Ticker</th><th>Company</th><th>Mkt Cap</th><th>P/E</th><th>EV/EBITDA</th><th>P/BV</th><th>ROE</th><th>Div Yield</th><th>YTD</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
  }

  const comp=document.getElementById("comp-comp");
  if(comp){
    if(!d){ comp.innerHTML=noData(ticker); }
    else {
      const rows=d.comp.map(r=>`<tr><td>${r.label}</td><td class="${r.aapl.startsWith("+")?'pos':'neg'}">${r.aapl}</td><td class="${r.spy.startsWith("+")?'pos':'neg'}">${r.spy}</td><td class="${r.qqq.startsWith("+")?'pos':'neg'}">${r.qqq}</td></tr>`).join("");
      comp.innerHTML=`${sHead("Comparative Returns")}<div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Period</th><th>${ticker.toUpperCase()}</th><th>S&P 500</th><th>QQQ</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
  }
}

function reloadAllPanels(ticker){
  renderFundamentals(ticker);
  renderNews(ticker);
  renderQuote(ticker);
  renderAnalysts(ticker);
  renderOwnership(ticker);
  renderComparables(ticker);
}

/* ══════════════════════════════════════════════════════════════════
   LAYOUT
   ══════════════════════════════════════════════════════════════════ */
const panelLayout={};

function computeDefaultLayout(){
  const canvas=document.getElementById("dashboardCanvas");
  const W=canvas.clientWidth, H=canvas.clientHeight, G=8;
  const cW=Math.round(W*0.52), cH=Math.round(H*0.57), rW=W-cW-G;
  const bH=H-cH-G, col=Math.round((W-G*3)/4);

  panelLayout.chart        ={x:0,       y:0,     w:cW, h:cH};
  panelLayout.fundamentals ={x:cW+G,    y:0,     w:rW, h:Math.round(cH*0.55)};
  panelLayout.news         ={x:cW+G,    y:Math.round(cH*0.55)+G, w:rW, h:cH-Math.round(cH*0.55)-G};
  panelLayout.quote        ={x:0,       y:cH+G,  w:col,h:bH};
  panelLayout.analysts     ={x:col+G,   y:cH+G,  w:col,h:bH};
  panelLayout.ownership    ={x:(col+G)*2,y:cH+G, w:col,h:bH};
  panelLayout.comparables  ={x:(col+G)*3,y:cH+G, w:col,h:bH};
  panelLayout.notes        ={x:Math.round(W*0.25),y:Math.round(H*0.15),w:Math.round(W*0.3),h:Math.round(H*0.4)};
  panelLayout.forex        ={x:Math.round(W*0.15),y:Math.round(H*0.1), w:Math.round(W*0.45),h:Math.round(H*0.55)};
}

function applyPanelPosition(id){
  const el=document.getElementById(`panel-${id}`); if(!el) return;
  const l=panelLayout[id]; if(!l) return;
  Object.assign(el.style,{left:l.x+"px",top:l.y+"px",width:l.w+"px",height:l.h+"px"});
}
function initLayout(){ computeDefaultLayout(); Object.keys(panelLayout).forEach(applyPanelPosition); }

/* ══════════════════════════════════════════════════════════════════
   DRAG
   ══════════════════════════════════════════════════════════════════ */
const SNAP=8; let dragState=null;
function initDrag(panel){
  panel.querySelector(".panel-head")?.addEventListener("mousedown",e=>{
    if(e.target.closest("button,input,select,textarea,.tab-btn")) return;
    e.preventDefault();
    const canvas=document.getElementById("dashboardCanvas");
    const r=panel.getBoundingClientRect(), c=canvas.getBoundingClientRect();
    dragState={panel,startMouseX:e.clientX,startMouseY:e.clientY,startPanelX:r.left-c.left,startPanelY:r.top-c.top};
    panel.classList.add("dragging"); bringToFront(panel); panel.style.zIndex=1000;
    document.getElementById("snapOverlay")?.classList.add("visible");
  });
}
document.addEventListener("mousemove",e=>{
  if(!dragState) return;
  const c=document.getElementById("dashboardCanvas").getBoundingClientRect();
  let x=Math.round((dragState.startPanelX+e.clientX-dragState.startMouseX)/SNAP)*SNAP;
  let y=Math.round((dragState.startPanelY+e.clientY-dragState.startMouseY)/SNAP)*SNAP;
  x=Math.max(0,Math.min(x,c.width-dragState.panel.offsetWidth));
  y=Math.max(0,Math.min(y,c.height-dragState.panel.offsetHeight));
  dragState.panel.style.left=x+"px"; dragState.panel.style.top=y+"px";
  const pid=dragState.panel.dataset.panel;
  if(panelLayout[pid]){panelLayout[pid].x=x;panelLayout[pid].y=y;}
});
document.addEventListener("mouseup",()=>{
  if(!dragState) return;
  dragState.panel.classList.remove("dragging"); dragState.panel.style.zIndex="";
  document.getElementById("snapOverlay")?.classList.remove("visible"); dragState=null;
});

/* ══════════════════════════════════════════════════════════════════
   RESIZE
   ══════════════════════════════════════════════════════════════════ */
const MIN_W=200,MIN_H=100; let resizeState=null;
function initResize(panel){
  panel.querySelectorAll(".resize-handle").forEach(h=>{
    h.addEventListener("mousedown",e=>{
      e.preventDefault(); e.stopPropagation();
      const canvas=document.getElementById("dashboardCanvas");
      const r=panel.getBoundingClientRect(),c=canvas.getBoundingClientRect();
      resizeState={panel,dir:h.dataset.dir,mouseX:e.clientX,mouseY:e.clientY,
        startX:r.left-c.left,startY:r.top-c.top,startW:r.width,startH:r.height};
      panel.classList.add("resizing"); bringToFront(panel);
    });
  });
}
document.addEventListener("mousemove",e=>{
  if(!resizeState) return;
  const s=resizeState,dx=e.clientX-s.mouseX,dy=e.clientY-s.mouseY;
  let x=s.startX,y=s.startY,w=s.startW,h=s.startH;
  if(s.dir.includes("e"))w=Math.max(MIN_W,s.startW+dx);
  if(s.dir.includes("s"))h=Math.max(MIN_H,s.startH+dy);
  if(s.dir.includes("w")){w=Math.max(MIN_W,s.startW-dx);x=s.startX+s.startW-w;}
  if(s.dir.includes("n")){h=Math.max(MIN_H,s.startH-dy);y=s.startY+s.startH-h;}
  w=Math.round(w/SNAP)*SNAP;h=Math.round(h/SNAP)*SNAP;
  x=Math.max(0,Math.round(x/SNAP)*SNAP);y=Math.max(0,Math.round(y/SNAP)*SNAP);
  Object.assign(s.panel.style,{left:x+"px",top:y+"px",width:w+"px",height:h+"px"});
  const pid=s.panel.dataset.panel;
  const tt=document.getElementById(`tooltip-${pid}`);
  if(tt) tt.textContent=`${w}×${h}`;
  if(panelLayout[pid]) Object.assign(panelLayout[pid],{x,y,w,h});
});
document.addEventListener("mouseup",()=>{
  if(!resizeState) return;
  resizeState.panel.classList.remove("resizing");
  const pid=resizeState.panel.dataset.panel;
  if(pid==="chart") setTimeout(()=>loadChart(resolveSymbol(currentTicker)),120);
  if(pid==="forex") setTimeout(()=>loadForexChart(),120);
  resizeState=null;
});

let zCounter=10;
function bringToFront(panel){panel.style.zIndex=++zCounter;}

/* ══════════════════════════════════════════════════════════════════
   TRADINGVIEW
   ══════════════════════════════════════════════════════════════════ */
function loadChart(symbol){
  const el=document.getElementById("priceChart"); if(!el) return;
  el.innerHTML="";
  new TradingView.widget({autosize:true,symbol,interval:"D",timezone:"Europe/Rome",
    theme:"dark",style:"1",locale:"it",toolbar_bg:"#0d1117",
    enable_publishing:false,allow_symbol_change:true,save_image:false,container_id:"priceChart"});
}
function loadForexChart(pair,interval){
  pair=pair??currentForexPair; interval=interval??currentForexInterval;
  currentForexPair=pair; currentForexInterval=interval;
  const el=document.getElementById("forexChart"); if(!el) return;
  el.innerHTML="";
  new TradingView.widget({autosize:true,symbol:mapForexPairToSymbol(pair),interval,
    timezone:"Europe/Rome",theme:"dark",style:"1",locale:"it",toolbar_bg:"#0d1117",
    enable_publishing:false,allow_symbol_change:true,container_id:"forexChart"});
  const lbl=document.getElementById("forexLabel");
  if(lbl) lbl.textContent=`Pair: ${pair}`;
  const sum=document.getElementById("forexSummary");
  if(sum) sum.innerHTML=`${mRow("Pair",pair)}${mRow("Interval",formatInterval(interval))}`;
  document.querySelectorAll(".fx-tf-btn").forEach(b=>b.classList.toggle("active",b.textContent.trim()===formatInterval(interval)));
}
function formatInterval(iv){return{"1":"1m","5":"5m","15":"15m","60":"1H","240":"4H","D":"1D","W":"1W"}[iv]??iv;}
function changeForexPair(){const v=document.getElementById("forexPairInput")?.value.trim().toUpperCase();if(v)loadForexChart(v,currentForexInterval);}
function setForexInterval(iv){loadForexChart(currentForexPair,iv);}

/* ══════════════════════════════════════════════════════════════════
   TICKER CHANGE / TOPIC
   ══════════════════════════════════════════════════════════════════ */
function changeTicker(){
  const raw=document.getElementById("tickerInput")?.value.trim();
  if(!raw) return;
  currentTicker=raw;
  updateExchangeHint();
  loadChart(resolveSymbol(raw));
  reloadAllPanels(raw);
}

function searchTopicNews(){
  const q=document.getElementById("topicInput")?.value.trim();
  if(!q) return;
  const sources=[
    {s:"Google News",    u:`https://news.google.com/search?q=${encodeURIComponent(q)}`},
    {s:"Bloomberg",      u:`https://www.bloomberg.com/search?query=${encodeURIComponent(q)}`},
    {s:"Reuters",        u:`https://www.reuters.com/site-search/?query=${encodeURIComponent(q)}`},
    {s:"Financial Times",u:`https://www.ft.com/search?q=${encodeURIComponent(q)}`},
    {s:"The Economist",  u:`https://www.economist.com/search?q=${encodeURIComponent(q)}`},
    {s:"CNBC",           u:`https://www.cnbc.com/search/?query=${encodeURIComponent(q)}`},
    {s:"NYT",            u:`https://www.nytimes.com/search?query=${encodeURIComponent(q)}`},
    {s:"Ground News",    u:`https://ground.news/search?query=${encodeURIComponent(q)}`},
  ];
  const cn=document.getElementById("news-cn");
  if(cn) cn.innerHTML=`<div class="news-list">${sources.map(i=>`<div class="news-item"><a href="${i.u}" target="_blank" rel="noopener noreferrer">${escapeHtml(i.s)} → ${escapeHtml(q)}</a><div class="news-meta">${escapeHtml(i.s)}</div></div>`).join("")}</div>`;
  switchTab("news","cn");
  const lbl=document.getElementById("newsModeLabel");
  if(lbl) lbl.textContent=`Topic · ${q}`;
}

/* ══════════════════════════════════════════════════════════════════
   PANEL VISIBILITY / CHECKLIST / TOPBAR
   ══════════════════════════════════════════════════════════════════ */
function hidePanel(id){
  document.getElementById(`panel-${id}`)?.classList.add("hidden");
  const cb=document.querySelector(`.panel-toggle[data-panel="${id}"]`);
  if(cb) cb.checked=false;
}
function showPanel(id){
  const el=document.getElementById(`panel-${id}`); if(!el) return;
  el.classList.remove("hidden"); applyPanelPosition(id); bringToFront(el);
  if(id==="chart") setTimeout(()=>loadChart(resolveSymbol(currentTicker)),80);
  if(id==="forex") setTimeout(()=>loadForexChart(),80);
}
function setupChecklist(){
  document.querySelectorAll(".panel-toggle").forEach(cb=>{
    cb.addEventListener("change",function(){this.checked?showPanel(this.dataset.panel):hidePanel(this.dataset.panel);});
  });
}
function toggleTopbar(){
  const bar=document.getElementById("topbar"),btn=document.getElementById("topbarCollapseBtn");
  if(!bar) return;
  bar.classList.toggle("collapsed");
  btn.textContent=bar.classList.contains("collapsed")?"▼":"▲";
}

/* ══════════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════════ */
window.addEventListener("load",()=>{
  document.querySelectorAll(".panel").forEach(p=>{initDrag(p);initResize(p);bringToFront(p);});
  setupChecklist();
  document.getElementById("tickerInput")?.addEventListener("keydown",e=>{if(e.key==="Enter")changeTicker();});
  document.getElementById("topicInput")?.addEventListener("keydown",e=>{if(e.key==="Enter")searchTopicNews();});
  document.getElementById("forexPairInput")?.addEventListener("keydown",e=>{if(e.key==="Enter")changeForexPair();});
  updateExchangeHint();

  requestAnimationFrame(()=>{
    initLayout();
    loadChart(resolveSymbol(currentTicker));
    loadForexChart();
    reloadAllPanels(currentTicker);
  });
});

window.addEventListener("resize",()=>{
  document.querySelectorAll(".panel:not(.hidden)").forEach(panel=>{
    const canvas=document.getElementById("dashboardCanvas");
    let x=Math.max(0,Math.min(parseInt(panel.style.left)||0,canvas.clientWidth-panel.offsetWidth));
    let y=Math.max(0,Math.min(parseInt(panel.style.top)||0,canvas.clientHeight-panel.offsetHeight));
    panel.style.left=x+"px"; panel.style.top=y+"px";
  });
});
