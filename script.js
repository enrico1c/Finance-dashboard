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
  // ── US NASDAQ ─────────────────────────────────────────────
  AAPL:"NASDAQ",MSFT:"NASDAQ",GOOGL:"NASDAQ",GOOG:"NASDAQ",AMZN:"NASDAQ",
  META:"NASDAQ",NVDA:"NASDAQ",TSLA:"NASDAQ",NFLX:"NASDAQ",AMD:"NASDAQ",
  INTC:"NASDAQ",QCOM:"NASDAQ",PYPL:"NASDAQ",ADBE:"NASDAQ",CSCO:"NASDAQ",
  SBUX:"NASDAQ",COST:"NASDAQ",AVGO:"NASDAQ",TXN:"NASDAQ",AMAT:"NASDAQ",
  MU:"NASDAQ",LRCX:"NASDAQ",KLAC:"NASDAQ",MRVL:"NASDAQ",ASML:"NASDAQ",
  ORCL:"NASDAQ",PLTR:"NASDAQ",ANET:"NASDAQ",ARM:"NASDAQ",SMCI:"NASDAQ",
  MRNA:"NASDAQ",ISRG:"NASDAQ",
  // ── US NYSE ────────────────────────────────────────────────
  JPM:"NYSE",BAC:"NYSE",GS:"NYSE",MS:"NYSE",WMT:"NYSE",V:"NYSE",
  MA:"NYSE",XOM:"NYSE",CVX:"NYSE",KO:"NYSE",DIS:"NYSE",PFE:"NYSE",
  JNJ:"NYSE",PG:"NYSE",HD:"NYSE",UNH:"NYSE",MRK:"NYSE",IBM:"NYSE",
  GE:"NYSE",BA:"NYSE",CAT:"NYSE",AXP:"NYSE",CRM:"NYSE",NKE:"NYSE",
  T:"NYSE",VZ:"NYSE",C:"NYSE",WFC:"NYSE",F:"NYSE",GM:"NYSE",
  LLY:"NYSE",COP:"NYSE",NEE:"NYSE",SLB:"NYSE",
  BABA:"NYSE",NIO:"NYSE",TCEHY:"OTC",BIDU:"NASDAQ",PDD:"NASDAQ",
  // ── US ETF ─────────────────────────────────────────────────
  SPY:"AMEX",QQQ:"NASDAQ",IWM:"AMEX",GLD:"NYSE",TLT:"NASDAQ",
  // ── CRYPTO ─────────────────────────────────────────────────
  BTC:"BITSTAMP",ETH:"BITSTAMP",
  // ── ITALIA (Borsa Milano) ──────────────────────────────────
  ENI:"MIL",ENEL:"MIL",ISP:"MIL",UCG:"MIL",TIT:"MIL",
  RACE:"MIL",STM:"MIL",MB:"MIL",BPER:"MIL",SRG:"MIL",
  A2A:"MIL",AZM:"MIL",BMPS:"MIL",CPR:"MIL",LDO:"MIL",
  // ── GERMANIA (XETRA) ──────────────────────────────────────
  SAP:"XETRA",BMW:"XETRA",MBG:"XETRA",SIE:"XETRA",BAYN:"XETRA",
  ADS:"XETRA",ALV:"XETRA",DTE:"XETRA",DBK:"XETRA",VOW3:"XETRA",
  // ── FRANCIA (Euronext Paris) ──────────────────────────────
  MC:"EURONEXT",OR:"EURONEXT",BNP:"EURONEXT",AIR:"EURONEXT",
  TTE:"EURONEXT",RI:"EURONEXT",CS:"EURONEXT",KER:"EURONEXT",
  // ── UK (London Stock Exchange) ────────────────────────────
  SHEL:"LSE",BP:"LSE",HSBA:"LSE",AZN:"LSE",ULVR:"LSE",
  GSK:"LSE",RIO:"LSE",LLOY:"LSE",BARC:"LSE",
  // ── SPAGNA ────────────────────────────────────────────────
  BBVA:"BME",ITX:"BME",IBE:"BME",REP:"BME",
};

function resolveSymbol(raw) {
  const s = raw.trim().toUpperCase();
  // Already has exchange prefix (e.g. MIL:ENI, NASDAQ:AAPL) → use as-is
  if (s.includes(":")) return s;
  // Known ticker → prepend the correct exchange
  if (exchangeDB[s]) return exchangeDB[s] + ":" + s;
  // Unknown ticker → pass bare to TradingView; it will auto-resolve
  // across all global markets via its own symbol search
  return s;
}

function getExchangeLabel(raw) {
  const s = raw.trim().toUpperCase();
  if (s.includes(":")) return s.split(":")[0];
  return exchangeDB[s] || "AUTO";
}

function updateExchangeHint() {
  const h = document.getElementById("exchangeHint");
  if (!h) return;
  const raw = document.getElementById("tickerInput")?.value || "";
  const lbl = getExchangeLabel(raw);
  h.textContent = lbl;
  h.style.opacity = lbl === "AUTO" ? "0.5" : "1";
  h.title = lbl === "AUTO"
    ? "Exchange sconosciuto — TradingView auto-rileva.\nTip: usa il formato EXCHANGE:TICKER (es. MIL:ENI, XETRA:SAP, LSE:BP)"
    : "Exchange: " + lbl;
}

function mapForexPairToSymbol(p) { return "FX:" + p.replace("/","").toUpperCase().trim(); }

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
  const sym = ticker.replace(/.*:/,"").toUpperCase();
  const tvSym = resolveSymbol(ticker); // TradingView format e.g. "NASDAQ:AAPL"

  /* DES — inject TradingView Financials widget */
  const des=document.getElementById("fund-des");
  if(des){
    des.innerHTML = `
      <div class="tv-fundamental-wrap" id="tv-fund-${sym}"></div>
      <div class="tv-fundamental-fallback" id="tv-fund-fallback-${sym}">
        ${d ? `
          ${mRow("Company",   d.name)}
          ${mRow("Sector",    d.sector)}
          ${mRow("Industry",  d.industry)}
          ${mRow("Exchange",  d.exchange)}
          ${mRow("Mkt Cap",   fmtB(d.mktCap))}
          ${mRow("P/E",       d.pe)}
          ${mRow("Beta",      d.beta)}
          <div class="desc-block">${escapeHtml(d.description)}</div>
        ` : noData(ticker)}
      </div>`;
    // Inject TradingView Fundamental Data widget (script-based embed)
    try {
      const container = document.getElementById(`tv-fund-${sym}`);
      if(container) {
        container.innerHTML = "";
        const script = document.createElement("script");
        script.type  = "text/javascript";
        script.src   = "https://s3.tradingview.com/external-embedding/embed-widget-financials.js";
        script.async = true;
        script.innerHTML = JSON.stringify({
          "symbol":     tvSym,
          "colorTheme": "dark",
          "isTransparent": true,
          "largeChartUrl": "",
          "displayMode": "regular",
          "width":  "100%",
          "height": 490,
          "locale": "en"
        });
        container.appendChild(script);
        // Hide fallback once widget renders
        setTimeout(() => {
          const fb = document.getElementById(`tv-fund-fallback-${sym}`);
          if(fb && container.querySelector("iframe")) fb.style.display = "none";
        }, 3000);
      }
    } catch(e) { /* fallback stays visible */ }
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
   RENDER: NEWS  — flat live feed, no tabs
   Priority: Finnhub → EODHD → APITube → AV
   news-feed = visible container; news-cn/evts/brc/bi = hidden legacy
   ══════════════════════════════════════════════════════════════════ */
function renderNews(ticker){
  const sym = ticker.replace(/.*:/,"").toUpperCase();
  // Show loading state in the visible feed container
  const feed = document.getElementById("news-feed");
  if(feed) feed.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Fetching live news for ${escapeHtml(sym)}…</div>`;
  // APIs (finnhub fhRenderNews, avRenderNews, eodhd) write to news-cn (hidden).
  // A MutationObserver below mirrors content into news-feed.
  // Also: timeout fallback if no API key is configured.
  setTimeout(() => {
    const f = document.getElementById("news-feed");
    if(f && f.querySelector(".av-spinner")){
      f.innerHTML = `<div class="no-data">// No news API key configured.<br>// Add a Finnhub or Alpha Vantage key via ⚙ API.</div>`;
    }
  }, 7000);
}

/* Mirror news-cn → news-feed whenever content arrives from any API */
(function initNewsMirror(){
  function mirror(){
    const src  = document.getElementById("news-cn");
    const dest = document.getElementById("news-feed");
    if(!src || !dest) return;
    if(src.innerHTML && !src.querySelector(".av-spinner")){
      dest.innerHTML = src.innerHTML;
    }
  }
  // Poll every 400ms for 30s after page load (APIs write async)
  let polls = 0;
  const iv = setInterval(()=>{
    mirror();
    if(++polls > 75) clearInterval(iv);
  }, 400);
  // Also observe mutations on news-cn
  const obs = new MutationObserver(mirror);
  function attachObs(){
    const src = document.getElementById("news-cn");
    if(src) obs.observe(src, { childList:true, subtree:true, characterData:true });
  }
  if(document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", attachObs);
  else attachObs();
}());

/* ══════════════════════════════════════════════════════════════════
   RENDER: QUOTE  (QR / MON)
   Loading state only — filled by avRenderQuote (api.js) and
   fhRenderQuote (finnhub.js). Static fallback removed.
   ══════════════════════════════════════════════════════════════════ */
function renderQuote(ticker){
  const sym = ticker.replace(/.*:/,"").toUpperCase();
  const qr  = document.getElementById("quote-qr");
  const mon = document.getElementById("quote-mon");
  if(qr)  qr.innerHTML  = `<div class="av-loading"><span class="av-spinner"></span>Loading live quote for ${escapeHtml(sym)}…</div>`;
  if(mon) mon.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading market data…</div>`;
  // Actual data filled by:
  // • avRenderQuote()  in api.js   (Alpha Vantage)
  // • fhRenderQuote()  in finnhub.js (Finnhub — fastest, fires in parallel)
  // Fallback timeout
  setTimeout(()=>{
    const q = document.getElementById("quote-qr");
    if(q && q.querySelector(".av-spinner"))
      q.innerHTML = `<div class="no-data">// No quote API key.<br>// Add Finnhub or Alpha Vantage key via ⚙ API.</div>`;
  }, 8000);
}


/* ══════════════════════════════════════════════════════════════════
   RENDER: ANALYSTS  (ANR / BRC)
   Live data: Finnhub → FMP → AV (priority cascade)
   ══════════════════════════════════════════════════════════════════ */
function renderAnalysts(ticker){
  const sym = ticker.replace(/.*:/,"").toUpperCase();
  const anr  = document.getElementById("analysts-anr");
  const abrc = document.getElementById("analysts-brc");
  if(anr)  anr.innerHTML  = `<div class="av-loading"><span class="av-spinner"></span>Fetching live analyst data…</div>`;
  if(abrc) abrc.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Fetching upgrades/downgrades…</div>`;
  // Actual rendering done by finnhubLoadAll → fhRenderAnalysts / fhRenderBRC
  // and by fmpLoadAll → fmpRenderAnalysts (fallback)
}

/* ══════════════════════════════════════════════════════════════════
   RENDER: OWNERSHIP  (HDS / MGMT)
   Live data: Finnhub insiders + institutional + FMP mgmt
   ══════════════════════════════════════════════════════════════════ */
function renderOwnership(ticker){
  const hds = document.getElementById("own-hds");
  const mg  = document.getElementById("own-mgmt");
  if(hds) hds.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Fetching insider & institutional data…</div>`;
  if(mg)  mg.innerHTML  = `<div class="av-loading"><span class="av-spinner"></span>Fetching management data…</div>`;
  // Filled by finnhubLoadAll → fhRenderOwnership + fhRenderMgmt
  // and fmpLoadAll → fmpRenderOwnership + fmpRenderMgmt (additional detail)
}

/* ══════════════════════════════════════════════════════════════════
   RENDER: COMPARABLES  (RV / COMP)
   Live: Finnhub peers — 10 companies, same sector, sorted by mktcap proximity
   ══════════════════════════════════════════════════════════════════ */
function renderComparables(ticker){
  const rv   = document.getElementById("comp-rv");
  const comp = document.getElementById("comp-comp");
  if(rv)   rv.innerHTML   = `<div class="av-loading"><span class="av-spinner"></span>Fetching sector peers (10 closest by mkt cap)…</div>`;
  if(comp) comp.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Fetching comparative returns…</div>`;
  // Filled by finnhubLoadAll → fhRenderComparables
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
   SECTOR WATCHLIST DATA
   ══════════════════════════════════════════════════════════════════ */
const sectorDB = {
  ai: {
    label:"Artificial Intelligence",
    stocks:[
      {ticker:"NVDA", name:"NVIDIA Corp.",        price:875.40, change:+3.21, mktCap:"$2.15T", pe:58.2, pb:28.4, evEbitda:41.2, fcfYield:2.1, peg:1.2, divYield:0.04, epsGrowth:84, sector:"Semiconductors", desc:"GPUs for AI training & inference"},
      {ticker:"MSFT", name:"Microsoft Corp.",      price:415.20, change:+0.84, mktCap:"$3.09T", pe:35.1, pb:13.1, evEbitda:24.8, fcfYield:2.8, peg:1.8, divYield:0.71, epsGrowth:19, sector:"Cloud/AI",        desc:"Azure AI, Copilot, OpenAI stake"},
      {ticker:"GOOGL",name:"Alphabet Inc.",        price:175.80, change:-0.42, mktCap:"$2.14T", pe:24.8, pb:7.2,  evEbitda:16.2, fcfYield:4.1, peg:1.1, divYield:0.48, epsGrowth:23, sector:"Cloud/AI",        desc:"Gemini, Google Cloud, DeepMind"},
      {ticker:"META", name:"Meta Platforms",       price:574.60, change:+1.93, mktCap:"$1.45T", pe:28.3, pb:9.1,  evEbitda:19.4, fcfYield:3.5, peg:0.9, divYield:0.36, epsGrowth:31, sector:"Social/AI",       desc:"Llama, Ray-Ban AI, AI Ads"},
      {ticker:"AMZN", name:"Amazon.com Inc.",      price:198.30, change:+0.67, mktCap:"$2.09T", pe:44.6, pb:10.4, evEbitda:18.9, fcfYield:2.2, peg:1.6, divYield:0.0,  epsGrowth:28, sector:"Cloud/AI",        desc:"AWS Bedrock, Alexa AI"},
      {ticker:"ORCL", name:"Oracle Corp.",         price:142.50, change:-1.12, mktCap:"$392B",  pe:32.4, pb:99.9, evEbitda:22.1, fcfYield:3.1, peg:1.4, divYield:1.12, epsGrowth:23, sector:"Cloud/AI",        desc:"OCI AI infrastructure"},
      {ticker:"PLTR", name:"Palantir Technologies",price:24.80,  change:+5.42, mktCap:"$53B",   pe:168,  pb:14.2, evEbitda:88.0, fcfYield:0.9, peg:4.1, divYield:0.0,  epsGrowth:41, sector:"AI Software",     desc:"AIP, Foundry, Government AI"},
      {ticker:"ANET", name:"Arista Networks",      price:318.40, change:+2.14, mktCap:"$100B",  pe:48.2, pb:18.9, evEbitda:34.2, fcfYield:2.4, peg:1.9, divYield:0.0,  epsGrowth:25, sector:"AI Networking",   desc:"AI data center networking"},
      {ticker:"ARM",  name:"Arm Holdings",         price:128.60, change:+4.31, mktCap:"$133B",  pe:112,  pb:22.4, evEbitda:65.0, fcfYield:0.7, peg:3.2, divYield:0.0,  epsGrowth:35, sector:"Semiconductors",  desc:"CPU IP for AI edge devices"},
      {ticker:"SMCI", name:"Super Micro Computer", price:58.20,  change:-2.84, mktCap:"$34B",   pe:16.8, pb:3.1,  evEbitda:9.4,  fcfYield:5.8, peg:0.6, divYield:0.0,  epsGrowth:28, sector:"AI Hardware",     desc:"AI server platforms"},
    ]
  },
  energy: {
    label:"Energy",
    stocks:[
      {ticker:"XOM",  name:"Exxon Mobil",          price:112.40, change:+0.42, mktCap:"$448B",  pe:14.2, pb:1.9, evEbitda:7.1, fcfYield:6.2, peg:1.8, divYield:3.42, epsGrowth:8,  sector:"Oil & Gas",   desc:"Integrated supermajor"},
      {ticker:"CVX",  name:"Chevron Corp.",         price:152.80, change:-0.18, mktCap:"$278B",  pe:13.8, pb:1.7, evEbitda:6.8, fcfYield:6.8, peg:2.1, divYield:4.21, epsGrowth:7,  sector:"Oil & Gas",   desc:"Global energy operations"},
      {ticker:"COP",  name:"ConocoPhillips",        price:114.30, change:+1.24, mktCap:"$138B",  pe:12.4, pb:2.4, evEbitda:6.1, fcfYield:7.4, peg:1.3, divYield:2.18, epsGrowth:9,  sector:"E&P",         desc:"Independent E&P leader"},
      {ticker:"NEE",  name:"NextEra Energy",        price:72.40,  change:+0.89, mktCap:"$148B",  pe:22.1, pb:3.1, evEbitda:14.2,fcfYield:2.1, peg:1.8, divYield:2.94, epsGrowth:12, sector:"Renewables",  desc:"World's largest wind/solar"},
      {ticker:"SLB",  name:"SLB (Schlumberger)",    price:44.20,  change:-0.32, mktCap:"$63B",   pe:14.8, pb:2.8, evEbitda:7.8, fcfYield:5.4, peg:1.4, divYield:2.71, epsGrowth:11, sector:"Oilfield Svcs","desc":"Oilfield services leader"},
    ]
  },
  banks: {
    label:"Banking & Finance",
    stocks:[
      {ticker:"JPM",  name:"JPMorgan Chase",        price:215.40, change:+0.54, mktCap:"$622B",  pe:12.4, pb:2.1, evEbitda:8.2,  fcfYield:8.1, peg:1.4, divYield:2.21, epsGrowth:9,  sector:"Banks",     desc:"Largest US bank by assets"},
      {ticker:"BAC",  name:"Bank of America",       price:38.20,  change:-0.21, mktCap:"$301B",  pe:12.8, pb:1.2, evEbitda:7.4,  fcfYield:7.4, peg:1.6, divYield:2.51, epsGrowth:8,  sector:"Banks",     desc:"Consumer & investment bank"},
      {ticker:"GS",   name:"Goldman Sachs",         price:484.60, change:+1.42, mktCap:"$162B",  pe:14.2, pb:1.5, evEbitda:9.1,  fcfYield:6.8, peg:1.3, divYield:2.48, epsGrowth:11, sector:"Inv. Banking","desc":"Elite investment bank"},
      {ticker:"V",    name:"Visa Inc.",             price:282.40, change:+0.38, mktCap:"$584B",  pe:30.2, pb:15.4,evEbitda:22.4, fcfYield:3.2, peg:1.8, divYield:0.74, epsGrowth:17, sector:"Payments",  desc:"Global payments network"},
      {ticker:"MA",   name:"Mastercard Inc.",       price:472.80, change:+0.64, mktCap:"$434B",  pe:34.8, pb:56.2,evEbitda:25.4, fcfYield:2.8, peg:1.9, divYield:0.56, epsGrowth:18, sector:"Payments",  desc:"Global payments network"},
    ]
  },
  china: {
    label:"China / EM Tech",
    stocks:[
      {ticker:"BABA", name:"Alibaba Group",         price:82.40,  change:+2.14, mktCap:"$189B",  pe:10.2, pb:1.4, evEbitda:8.1,  fcfYield:9.2, peg:0.7, divYield:1.12, epsGrowth:15, sector:"E-Commerce", desc:"China e-commerce & cloud"},
      {ticker:"TCEHY",name:"Tencent Holdings",      price:48.20,  change:+1.84, mktCap:"$466B",  pe:18.4, pb:3.8, evEbitda:14.2, fcfYield:4.8, peg:1.1, divYield:0.84, epsGrowth:17, sector:"Internet",   desc:"Gaming, WeChat, fintech"},
      {ticker:"PDD",  name:"PDD Holdings",          price:128.40, change:+3.24, mktCap:"$176B",  pe:12.8, pb:4.8, evEbitda:9.4,  fcfYield:7.4, peg:0.5, divYield:0.0,  epsGrowth:26, sector:"E-Commerce", desc:"Temu, Pinduoduo"},
      {ticker:"NIO",  name:"NIO Inc.",              price:4.82,   change:-1.84, mktCap:"$9.4B",  pe:null, pb:1.2, evEbitda:null, fcfYield:-8.4,peg:null,divYield:0.0,  epsGrowth:-22,sector:"EV",          desc:"Chinese premium EV maker"},
      {ticker:"BIDU", name:"Baidu Inc.",            price:84.20,  change:+1.12, mktCap:"$29B",   pe:9.8,  pb:0.8, evEbitda:5.4,  fcfYield:11.2,peg:0.6, divYield:0.0,  epsGrowth:16, sector:"AI/Search",  desc:"China AI, autonomous driving"},
    ]
  },
  healthcare: {
    label:"Healthcare & Biotech",
    stocks:[
      {ticker:"JNJ",  name:"Johnson & Johnson",     price:158.40, change:+0.24, mktCap:"$382B",  pe:14.8, pb:4.2, evEbitda:11.4, fcfYield:5.8, peg:2.1, divYield:3.24, epsGrowth:7,  sector:"Pharma",     desc:"Diversified healthcare giant"},
      {ticker:"LLY",  name:"Eli Lilly & Co.",       price:812.40, change:+2.84, mktCap:"$771B",  pe:58.4, pb:48.2,evEbitda:42.4, fcfYield:1.4, peg:1.2, divYield:0.68, epsGrowth:49, sector:"Pharma",     desc:"GLP-1 weight loss drugs"},
      {ticker:"PFE",  name:"Pfizer Inc.",           price:28.40,  change:-0.84, mktCap:"$161B",  pe:24.2, pb:1.8, evEbitda:9.4,  fcfYield:4.8, peg:3.4, divYield:6.12, epsGrowth:7,  sector:"Pharma",     desc:"Post-COVID portfolio reset"},
      {ticker:"MRNA", name:"Moderna Inc.",          price:68.40,  change:-2.14, mktCap:"$27B",   pe:null, pb:2.1, evEbitda:null, fcfYield:-4.2,peg:null,divYield:0.0,  epsGrowth:-42,sector:"Biotech",     desc:"mRNA vaccines & oncology"},
      {ticker:"ISRG", name:"Intuitive Surgical",    price:524.80, change:+1.24, mktCap:"$183B",  pe:64.8, pb:14.2,evEbitda:44.2, fcfYield:1.8, peg:2.4, divYield:0.0,  epsGrowth:27, sector:"Med Devices", desc:"Robotic surgery leader"},
    ]
  },
  italy: {
    label:"Italian Market (MIL)",
    stocks:[
      {ticker:"MIL:ENI",   name:"Eni SpA",          price:14.82,  change:+0.42, mktCap:"€48B",   pe:7.4,  pb:0.9, evEbitda:4.2,  fcfYield:11.2,peg:1.1, divYield:6.84, epsGrowth:7,  sector:"Oil & Gas",   desc:"Italian energy supermajor"},
      {ticker:"MIL:UCG",   name:"UniCredit SpA",    price:38.42,  change:+1.84, mktCap:"€48B",   pe:6.8,  pb:0.9, evEbitda:null, fcfYield:null,peg:0.7, divYield:4.12, epsGrowth:10, sector:"Banks",       desc:"Pan-European retail bank"},
      {ticker:"MIL:ENEL",  name:"Enel SpA",         price:6.84,   change:-0.28, mktCap:"€68B",   pe:11.4, pb:1.4, evEbitda:6.8,  fcfYield:5.2, peg:1.8, divYield:6.24, epsGrowth:6,  sector:"Utilities",   desc:"European utilities leader"},
      {ticker:"MIL:TIT",   name:"Telecom Italia",   price:0.28,   change:-1.42, mktCap:"€5.4B",  pe:null, pb:0.4, evEbitda:4.2,  fcfYield:-2.4,peg:null,divYield:0.0,  epsGrowth:-15,sector:"Telecom",      desc:"Italian telecoms turnaround"},
      {ticker:"MIL:RACE",  name:"Ferrari NV",       price:418.40, change:+0.84, mktCap:"€76B",   pe:52.4, pb:28.4,evEbitda:32.4, fcfYield:1.8, peg:2.4, divYield:0.68, epsGrowth:22, sector:"Luxury Auto",  desc:"Prancing horse — ultra-luxury"},
    ]
  },
};

// Keyword → sector mapping
const topicToSector = {
  ai:"ai", "artificial intelligence":"ai", ml:"ai", llm:"ai", chatgpt:"ai",
  energy:"energy", oil:"energy", gas:"energy", renewables:"energy", solar:"energy",
  bank:"banks", banks:"banks", finance:"banks", financial:"banks",
  china:"china", chinese:"china", alibaba:"china", tencent:"china",
  health:"healthcare", healthcare:"healthcare", pharma:"healthcare", biotech:"healthcare",
  italy:"italy", italian:"italy", milan:"italy", mib:"italy",
};

let currentWatchlistStocks = [];
let currentWatchlistSort   = "name";
let currentValTicker       = null;

/* ── Watchlist renderer ─────────────────────────────────────────── */
// Maps a topic keyword to a seed ticker for Finnhub peer search
const topicSeedTicker = {
  ai:"NVDA", "artificial intelligence":"NVDA", llm:"MSFT", chatgpt:"MSFT",
  energy:"XOM", oil:"XOM", gas:"CVX", renewables:"NEE", solar:"ENPH", lng:"LNG",
  bank:"JPM", banks:"JPM", finance:"GS", financial:"BAC",
  china:"BABA", chinese:"BABA", alibaba:"BABA", tencent:"TCEHY",
  health:"JNJ", healthcare:"JNJ", pharma:"LLY", biotech:"MRNA",
  italy:"ENI", italian:"ENI", milan:"ENI",
  tech:"AAPL", technology:"MSFT", semiconductor:"NVDA", chip:"NVDA",
  auto:"TSLA", car:"TSLA", ev:"TSLA", electric:"TSLA",
  retail:"AMZN", ecommerce:"AMZN", consumer:"AMZN",
  defense:"LMT", aerospace:"BA", military:"RTX",
  crypto:"COIN", bitcoin:"MSTR", blockchain:"COIN",
  "real estate":"AMT", reit:"SPG", realestate:"PLD",
  media:"DIS", streaming:"NFLX", entertainment:"DIS",
  telecom:"T", telecoms:"VZ",
  // Mining, metals, commodities
  mining:"RIO", metals:"FCX", gold:"NEM", silver:"WPM", copper:"FCX",
  coal:"BTU", thermal:"BTU", coking:"ARCH", "met coal":"ARCH",
  iron:"RIO", steel:"NUE", aluminum:"AA", lithium:"ALB",
  commodity:"BHP", commodities:"BHP", resources:"RIO", bhp:"BHP",
  // Food / staples
  food:"MCD", beverage:"KO", staples:"PG", agriculture:"ADM",
  insurance:"BRK-B", reinsurance:"MKL",
  // Additional sectors
  luxury:"MC.PA", fashion:"KER.PA", watches:"CFR.SW",
  shipping:"ZIM", logistics:"UPS", transport:"FDX",
  gaming:"MSFT", semiconductor:"TSM", foundry:"TSM",
};

async function loadWatchlist(topic) {
  const key    = (topic||"").toLowerCase().trim();
  const lbl    = document.getElementById("watchlistLabel");
  const box    = document.getElementById("watchlistBox");
  const cnt    = document.getElementById("wlCount");

  if (lbl) lbl.textContent = `Sector: ${topic}`;
  if (box) box.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Searching sector stocks for "${escapeHtml(topic)}"…</div>`;

  // Find seed ticker — first try exact/substring match, then partial word match
  let seedTicker = null;
  let seedKey = Object.keys(topicSeedTicker).find(k => key === k || key.includes(k) || k.includes(key));
  if (seedKey) seedTicker = topicSeedTicker[seedKey];

  // If Finnhub available: try peer search on seed, OR directly on the topic as a ticker symbol
  if (typeof finnhubSectorSearch === "function" && getFinnhubKey()) {
    // If topic itself looks like a ticker (1-5 uppercase chars) try it directly
    const asTickerSym = topic.replace(/.*:/,"").toUpperCase();
    const tryDirect = !seedTicker || asTickerSym.length <= 5;

    const searchSym = seedTicker || asTickerSym;
    try {
      const stocks = await finnhubSectorSearch(searchSym);
      if (stocks && stocks.length) {
        stocks.sort((a,b) => (b.mktCap||0) - (a.mktCap||0));
        currentWatchlistStocks = stocks.map(s => ({
          ...s,
          mktCap: s.mktCap ? fmtB(s.mktCap) : "—",
          pe: s.pe || null,
        }));
        if (lbl) lbl.textContent = `${stocks[0]?.sector || topic} · ${stocks.length} stocks`;
        if (cnt) cnt.textContent = `${stocks.length} stocks`;
        renderWatchlistRows();
        if (typeof fmpRefreshWatchlistPrices === "function") fmpRefreshWatchlistPrices();
        return;
      }
    } catch(e) { console.warn("Finnhub sector search failed:", e); }
  }

  // Fallback: static sectorDB
  const sector = Object.keys(topicToSector).find(k => key.includes(k) || k.includes(key));
  const data   = sector ? sectorDB[topicToSector[sector]] : null;
  if (!data) {
    if (box) box.innerHTML = `<div class="no-data">// No data for "<strong>${escapeHtml(topic)}</strong>".<br>// Add a Finnhub key for live sector search.<br>// Try: AI, Energy, Banks, Healthcare, Coal, Mining, Italy, China…</div>`;
    return;
  }
  const parseMktCap = v => {
    const s = String(v||"").replace(/[$€£,\s]/g,"");
    const n = parseFloat(s);
    if(isNaN(n)) return 0;
    if(s.endsWith("T")||s.toUpperCase().endsWith("T")) return n*1e12;
    if(s.endsWith("B")||s.toUpperCase().endsWith("B")) return n*1e9;
    if(s.endsWith("M")||s.toUpperCase().endsWith("M")) return n*1e6;
    return n;
  };
  const staticStocks = [...data.stocks].sort((a,b) => parseMktCap(b.mktCap) - parseMktCap(a.mktCap));
  if (lbl) lbl.textContent = `Sector: ${data.label}`;
  currentWatchlistStocks = staticStocks;
  if (cnt) cnt.textContent = `${staticStocks.length} stocks`;
  renderWatchlistRows();
  if (typeof fmpRefreshWatchlistPrices === "function") fmpRefreshWatchlistPrices();
}

function sortWatchlist(by) {
  currentWatchlistSort = by;
  document.querySelectorAll(".wl-sort-btn").forEach(b =>
    b.classList.toggle("active", b.textContent.toLowerCase() === by ||
      (by==="mktcap" && b.textContent==="Mkt Cap") ||
      (by==="change" && b.textContent==="Chg%")));
  renderWatchlistRows();
}

function renderWatchlistRows() {
  const box = document.getElementById("watchlistBox");
  if (!box || !currentWatchlistStocks.length) return;

  const sorted = [...currentWatchlistStocks].sort((a, b) => {
    if (currentWatchlistSort === "name")    return a.name.localeCompare(b.name);
    if (currentWatchlistSort === "price")   return b.price - a.price;
    if (currentWatchlistSort === "change")  return b.change - a.change;
    if (currentWatchlistSort === "mktcap")  return 0; // keep order
    return 0;
  });

  box.innerHTML = `
    <div class="wl-header-row">
      <span>Stock</span><span>Price</span><span>Chg%</span><span>Mkt Cap</span><span>P/E</span><span>Chart</span>
    </div>
    ${sorted.map(s => {
      const chg    = s.change != null ? Number(s.change) : 0;
      const chgCls = chg >= 0 ? "wl-pos" : "wl-neg";
      const chgStr = (chg >= 0 ? "+" : "") + chg.toFixed(2) + "%";
      const peStr  = s.pe != null ? Number(s.pe).toFixed(1) : "—";
      const priceStr = s.price != null ? "$"+fmt(Number(s.price)) : "—";
      const mcapStr = s.mktCap != null ? String(s.mktCap) : "—";
      return `<div class="wl-row" onclick="openValuation('${escapeHtml(s.ticker)}')">
        <div class="wl-stock-info">
          <span class="wl-ticker">${escapeHtml(String(s.ticker||"").replace(/.*:/,""))}</span>
          <span class="wl-name">${escapeHtml(String(s.name||""))}</span>
          <span class="wl-sector-tag">${escapeHtml(String(s.sector||""))}</span>
        </div>
        <span class="wl-price">${priceStr}</span>
        <span class="wl-chg ${chgCls}">${chgStr}</span>
        <span class="wl-mcap">${escapeHtml(mcapStr)}</span>
        <span class="wl-pe">${peStr}</span>
        <button class="wl-chart-btn" title="Load in main chart" onclick="event.stopPropagation(); loadTickerFromWatchlist('${escapeHtml(s.ticker)}')">▶</button>
      </div>`;
    }).join("")}`;
}

/* ══════════════════════════════════════════════════════════════════
   VALUATION ANALYZER
   ══════════════════════════════════════════════════════════════════ */
function openValuation(ticker) {
  currentValTicker = ticker;
  showPanel("valuation");
  const cb = document.querySelector('.panel-toggle[data-panel="valuation"]');
  if (cb) cb.checked = true;
  renderValuation(ticker);
}

function loadTickerFromWatchlist(ticker) {
  // Resolve to proper exchange prefix
  const sym = resolveSymbol(ticker);
  // Update the ticker input in topbar
  const input = document.getElementById("tickerInput");
  if (input) input.value = ticker.replace(/.*:/,"");
  currentTicker = ticker;
  updateExchangeHint();
  // Load the chart
  loadChart(sym);
  // Fetch live data
  if(typeof avLoadAll === "function") avLoadAll(ticker);
  // Flash the chart panel to draw attention
  const chartPanel = document.getElementById("panel-chart");
  if (chartPanel) {
    showPanel("chart");
    const cb = document.querySelector('.panel-toggle[data-panel="chart"]');
    if (cb) cb.checked = true;
    chartPanel.classList.add("chart-flash");
    setTimeout(() => chartPanel.classList.remove("chart-flash"), 800);
    bringToFront(chartPanel);
  }
}

function renderValuation(ticker) {
  if (!ticker) return;
  const box = document.getElementById("valuationBox");
  const lbl = document.getElementById("valuationLabel");
  if (!box) return;

  // Find in all sector DBs
  let stock = null;
  for (const key in sectorDB) {
    stock = sectorDB[key].stocks.find(s => s.ticker === ticker || s.ticker.endsWith(":"+ticker));
    if (stock) break;
  }
  // Fallback to main DB
  if (!stock) {
    const d = getTickerData(ticker);
    if (d) {
      stock = {ticker, name:d.name, price:d.price, pe:d.pe, pb:d.pbv,
        evEbitda:d.evEbitda, fcfYield:d.divYield*2, peg:d.pe/20,
        divYield:d.divYield, epsGrowth:18, desc:d.description.slice(0,80)};
    }
  }

  if (!stock) {
    box.innerHTML = `<div class="no-data">// No valuation data for <strong>${escapeHtml(ticker)}</strong>.</div>`;
    return;
  }

  if (lbl) lbl.textContent = `${stock.ticker} — ${stock.name}`;

  const method = document.getElementById("valMethodSelect")?.value || "all";

  // ── Scoring engine ──
  // Each metric returns { score: -1 | 0 | 1, label, value, note }
  const scores = [];

  // 1. P/E vs sector average (~20 as neutral)
  if (stock.pe != null) {
    const sectorAvgPE = 20;
    const sc = stock.pe < sectorAvgPE * 0.8 ? 1 : stock.pe > sectorAvgPE * 1.4 ? -1 : 0;
    scores.push({group:"multiples", metric:"P/E Ratio", value:stock.pe.toFixed(1),
      benchmark:`Sector avg ~${sectorAvgPE}`, score:sc,
      note: sc===1 ? "Trading below sector average — potentially cheap" :
            sc===-1 ? "Premium multiple — priced for high growth" : "In line with sector average"});
  }

  // 2. P/B
  if (stock.pb != null) {
    const sc = stock.pb < 1 ? 1 : stock.pb > 10 ? -1 : 0;
    scores.push({group:"multiples", metric:"P/B Ratio", value:stock.pb.toFixed(1),
      benchmark:"Underval. < 1 · Fair 1–10 · Overval. > 10", score:sc,
      note: sc===1 ? "P/B < 1: market prices stock below book value" :
            sc===-1 ? "High premium to book — justify with ROE" : "Moderate book premium"});
  }

  // 3. EV/EBITDA
  if (stock.evEbitda != null) {
    const sc = stock.evEbitda < 8 ? 1 : stock.evEbitda > 25 ? -1 : 0;
    scores.push({group:"multiples", metric:"EV/EBITDA", value:stock.evEbitda.toFixed(1),
      benchmark:"Cheap < 8 · Fair 8–25 · Expensive > 25", score:sc,
      note: sc===1 ? "Cheap enterprise value relative to earnings" :
            sc===-1 ? "Expensive vs. EBITDA, debt included" : "Fair EV/EBITDA range"});
  }

  // 4. FCF Yield
  if (stock.fcfYield != null) {
    const sc = stock.fcfYield > 6 ? 1 : stock.fcfYield < 1 ? -1 : 0;
    scores.push({group:"cashflow", metric:"FCF Yield", value:stock.fcfYield.toFixed(1)+"%",
      benchmark:"High > 6% · Low < 1%", score:sc,
      note: sc===1 ? "High free cash flow relative to market cap" :
            sc===-1 ? "Low/negative FCF — growth stage or inefficient" : "Adequate cash generation"});
  }

  // 5. Dividend Yield
  if (stock.divYield != null && stock.divYield > 0) {
    const sc = stock.divYield > 4 ? 1 : stock.divYield === 0 ? 0 : 0;
    scores.push({group:"cashflow", metric:"Dividend Yield", value:stock.divYield.toFixed(2)+"%",
      benchmark:"High yield > 4% may signal undervaluation", score:sc,
      note: stock.divYield > 4 ? "High yield — verify dividend sustainability" :
            "Moderate or no dividend"});
  }

  // 6. PEG Ratio
  if (stock.peg != null) {
    const sc = stock.peg < 1 ? 1 : stock.peg > 2 ? -1 : 0;
    scores.push({group:"growth", metric:"PEG Ratio", value:stock.peg.toFixed(2),
      benchmark:"Underval. < 1 · Fair 1–2 · Overval. > 2", score:sc,
      note: sc===1 ? "PEG < 1: undervalued relative to earnings growth" :
            sc===-1 ? "PEG > 2: growth priced in or overvalued" : "Fairly valued on PEG basis"});
  }

  // 7. EPS Growth rate
  if (stock.epsGrowth != null) {
    const sc = stock.epsGrowth > 20 ? 1 : stock.epsGrowth < 0 ? -1 : 0;
    scores.push({group:"growth", metric:"EPS Growth (YoY)", value:(stock.epsGrowth>0?"+":"")+stock.epsGrowth+"%",
      benchmark:"Strong > 20% · Negative < 0", score:sc,
      note: sc===1 ? "High earnings growth — supports premium valuation" :
            sc===-1 ? "Earnings declining — fundamental concern" : "Moderate growth trajectory"});
  }

  // 8. DCF estimate (simplified: FCF * growth / WACC)
  if (stock.fcfYield != null && stock.epsGrowth != null && stock.pe != null) {
    const wacc = 9; // assumed
    const termGrowth = 3;
    const growthRate = Math.min(Math.max(stock.epsGrowth, 0), 40) / 100;
    const fcfPerShare = (stock.price * (stock.fcfYield / 100));
    const intrinsic = fcfPerShare * (1 + growthRate) / (wacc/100 - termGrowth/100);
    const upside = ((intrinsic / stock.price) - 1) * 100;
    const sc = upside > 15 ? 1 : upside < -15 ? -1 : 0;
    scores.push({group:"dcf", metric:"DCF Intrinsic Value", value:"$"+fmt(intrinsic),
      benchmark:`Current price $${fmt(stock.price)}`, score:sc,
      note: `Implied upside/downside: ${upside>=0?"+":""}${upside.toFixed(1)}% (WACC ${wacc}%, TGR ${termGrowth}%)`});
  }

  // ── Verdict ──
  const filtered = method === "all" ? scores : scores.filter(s => s.group === method);
  const total    = filtered.reduce((a, s) => a + s.score, 0);
  const maxScore = filtered.length;
  const pct      = maxScore > 0 ? total / maxScore : 0;

  let verdict, verdictClass, verdictIcon;
  if (pct >= 0.4)       { verdict="UNDERVALUED";  verdictClass="verdict-under"; verdictIcon="▼"; }
  else if (pct <= -0.4) { verdict="OVERVALUED";   verdictClass="verdict-over";  verdictIcon="▲"; }
  else                  { verdict="FAIRLY VALUED"; verdictClass="verdict-fair";  verdictIcon="◆"; }

  const bullCount = filtered.filter(s=>s.score===1).length;
  const bearCount = filtered.filter(s=>s.score===-1).length;
  const neutCount = filtered.filter(s=>s.score===0).length;

  const scoreLabel = s => s===1 ? "CHEAP" : s===-1 ? "RICH" : "FAIR";
  const scoreCls   = s => s===1 ? "val-cheap" : s===-1 ? "val-rich" : "val-fair";

  box.innerHTML = `
    <!-- Header -->
    <div class="val-stock-header">
      <div class="val-stock-name">
        <span class="val-ticker">${escapeHtml(stock.ticker.replace(/.*:/,""))}</span>
        <span class="val-full-name">${escapeHtml(stock.name)}</span>
      </div>
      <div class="val-price-block">
        <span class="val-current-price">$${fmt(stock.price)}</span>
        <span class="val-sector">${escapeHtml(stock.sector||"")}</span>
        <button class="val-chart-link-btn" title="Load in main chart" onclick="loadTickerFromWatchlist('${escapeHtml(stock.ticker)}')">▶ View Chart</button>
      </div>
    </div>

    <!-- Verdict -->
    <div class="verdict-block ${verdictClass}">
      <div class="verdict-icon">${verdictIcon}</div>
      <div class="verdict-text">${verdict}</div>
      <div class="verdict-sub">${bullCount} cheap · ${neutCount} fair · ${bearCount} rich · ${filtered.length} signals</div>
    </div>

    <!-- Gauge bar -->
    <div class="val-gauge">
      <div class="gauge-track">
        <div class="gauge-fill" style="width:${Math.round((pct+1)/2*100)}%; background:${pct>=0.4?'var(--accent-green)':pct<=-0.4?'var(--accent-red)':'var(--accent-yellow)'}"></div>
        <div class="gauge-center-line"></div>
      </div>
      <div class="gauge-labels"><span>Undervalued</span><span>Fair Value</span><span>Overvalued</span></div>
    </div>

    <!-- Metrics table -->
    <div class="val-metrics">
      ${filtered.map(s => `
        <div class="val-metric-row ${scoreCls(s.score)}">
          <div class="val-metric-left">
            <span class="val-metric-name">${escapeHtml(s.metric)}</span>
            <span class="val-metric-note">${escapeHtml(s.note)}</span>
            <span class="val-benchmark">${escapeHtml(s.benchmark)}</span>
          </div>
          <div class="val-metric-right">
            <span class="val-metric-value">${escapeHtml(s.value)}</span>
            <span class="val-signal">${scoreLabel(s.score)}</span>
          </div>
        </div>`).join("")}
    </div>

    <div class="val-disclaimer">* Simplified model with simulated data. Not investment advice.</div>
  `;
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
  // Watchlist + Valuation: placed at bottom-left, side by side
  const wlW=Math.round(W*0.28), valW=Math.round(W*0.36);
  panelLayout.watchlist    ={x:0,      y:cH+G, w:wlW,  h:bH};
  panelLayout.valuation    ={x:wlW+G,  y:cH+G, w:valW, h:bH};
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
  if(lbl) lbl.textContent=pair;
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
  // Strip exchange prefix for API calls (e.g. "MIL:ENI" → "ENI")
  const sym = raw.replace(/.*:/,"").toUpperCase();
  // Fire all data providers — avLoadAll orchestrates AV + FMP + EODHD + APITube + Massive
  if(typeof avLoadAll       === "function") avLoadAll(sym);
  if(typeof finnhubLoadAll  === "function") finnhubLoadAll(sym);
}

async function searchTopicNews(){
  const q=document.getElementById("topicInput")?.value.trim();
  if(!q) return;
  switchTab("news","cn");
  const lbl=document.getElementById("newsModeLabel");
  if(lbl) lbl.textContent=`Topic · ${q}`;
  // Show loading state in news
  const cn=document.getElementById("news-cn");
  if(cn) cn.innerHTML=`<div class="av-loading"><span class="av-spinner"></span>Searching news for "${escapeHtml(q)}"…</div>`;
  // Load sector watchlist (async-safe, non-blocking)
  loadWatchlist(q).catch(e => console.warn("loadWatchlist error:", e));
  // Fire APITube topic news if available
  if(typeof apitubeSearchTopic === "function") {
    apitubeSearchTopic(q).catch(()=>{});
  }
  // Fallback: if cn still shows loader after 6s, clear it
  setTimeout(() => {
    const el = document.getElementById("news-cn");
    if(el && el.querySelector(".av-spinner")) {
      el.innerHTML = `<div class="no-data">// No API news returned.<br>// Configure Finnhub or APITube key in ⚙ API for live news.</div>`;
    }
  }, 6000);
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
    // Fetch live data on startup — strip exchange prefix for API calls
    const initSym = currentTicker.replace(/.*:/,"").toUpperCase();
    if(typeof avLoadAll      === "function") avLoadAll(initSym);
    if(typeof finnhubLoadAll === "function") finnhubLoadAll(initSym);
    if(typeof updateApiStatus  === "function") updateApiStatus();
    if(typeof updateFmpStatus  === "function") updateFmpStatus();
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
