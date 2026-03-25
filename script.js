/* ══════════════════════════════════════════════════════════════════
   FINTERM — Finance Dashboard · script.js
   ══════════════════════════════════════════════════════════════════ */

let currentTicker        = "AAPL";
let currentForexPair     = "EUR/USD";
let currentForexInterval = "60";

/* ── Damodaran Equity Risk Premium ───────────────────────────────────
   Implied ERP from Aswath Damodaran (NYU Stern).
   Updated annually — source: pages.stern.nyu.edu/~adamodar/
   Last update: January 2026. Next update: January 2027.         */
window.DAMODARAN_ERP = 4.60; // 4.60% implied ERP, US market, Jan 2026

/* ── Country → Default Terminal Growth Rate ─────────────────────────
   Used as the initial termG suggestion in the WACC DCF block.
   Based on long-run nominal GDP growth expectations per region.  */
const COUNTRY_TERM_GROWTH = {
  US:2.5, GB:2.0, DE:1.8, FR:1.8, IT:1.5, ES:1.8, JP:1.0,
  CN:4.5, IN:5.5, BR:3.5, KR:2.5, AU:2.5, CA:2.3, CH:1.5,
  SG:2.5, HK:2.0, NL:1.8, SE:2.0, NO:2.0, DK:1.8,
};

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

/* ── News card toggle (shared by all news renderers) ─────────────── */
function niToggle(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("ni-open");
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

/* Refresh DB prices with live data — called once on init and on key setup */
async function refreshDBPrices() {
  const tickers = Object.keys(DB).join(',');
  if (!tickers) return;

  // Try FMP batch quote
  const fmpKey = (typeof getFmpKey === 'function') ? getFmpKey() : '';
  if (fmpKey) {
    try {
      const res  = await fetch(`https://financialmodelingprep.com/api/v3/quote/${tickers}?apikey=${fmpKey}`, {signal:AbortSignal.timeout(8000)});
      const data = await res.json();
      (Array.isArray(data) ? data : []).forEach(q => {
        const sym = q.symbol?.toUpperCase();
        if (DB[sym] && q.price) {
          DB[sym].price     = q.price;
          DB[sym].change    = q.changesPercentage;
          DB[sym].mktCap    = q.marketCap || DB[sym].mktCap;
          DB[sym].pe        = q.pe || DB[sym].pe;
          DB[sym].eps       = q.eps || DB[sym].eps;
          DB[sym].week52High= q.yearHigh || DB[sym].week52High;
          DB[sym].week52Low = q.yearLow  || DB[sym].week52Low;
          DB[sym].avgVol    = q.avgVolume ? (q.avgVolume/1e6).toFixed(1)+'M' : DB[sym].avgVol;
        }
      });
      console.info('[DB] Prices refreshed from FMP');
      return;
    } catch {}
  }

  // Fallback: Finnhub batch
  const fhKey = (typeof getFinnhubKey === 'function') ? getFinnhubKey() : '';
  if (fhKey) {
    await Promise.allSettled(Object.keys(DB).map(async sym => {
      try {
        const res  = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${fhKey}`, {signal:AbortSignal.timeout(5000)});
        const q    = await res.json();
        if (q?.c) {
          DB[sym].price  = q.c;
          DB[sym].high   = q.h;
          DB[sym].low    = q.l;
          DB[sym].open   = q.o;
          DB[sym].prevClose = q.pc;
        }
      } catch {}
    }));
    console.info('[DB] Prices refreshed from Finnhub');
  }
}

/* Also refresh sectorDB stock prices with live data */
async function refreshSectorDBPrices() {
  const allTickers = [];
  Object.values(sectorDB).forEach(sector => {
    sector.stocks.forEach(s => allTickers.push(s.ticker.replace(/.*:/,'')));
  });
  const unique = [...new Set(allTickers)];
  if (!unique.length) return;

  const fmpKey = (typeof getFmpKey === 'function') ? getFmpKey() : '';
  if (!fmpKey) {
    // Finnhub REST fallback: individual quotes (no key = free-tier 60/min)
    const fhKey = (typeof getFinnhubKey === 'function') ? getFinnhubKey() : '';
    if (fhKey) {
      // Stagger requests slightly to respect rate limit
      for (let i = 0; i < unique.length; i++) {
        const sym = unique[i];
        try {
          const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${fhKey}`, {signal:AbortSignal.timeout(4000)});
          const q   = await res.json();
          if (q?.c) {
            Object.values(sectorDB).forEach(sector => {
              const s = sector.stocks.find(st => st.ticker.replace(/.*:/,'').toUpperCase() === sym);
              if (s) {
                s.price  = q.c;
                s.change = q.dp ?? s.change; // dp = daily change %
              }
            });
          }
        } catch {}
        // Brief pause every 10 tickers to stay within 60/min limit
        if (i > 0 && i % 10 === 0) await new Promise(r => setTimeout(r, 1000));
      }
      console.info('[sectorDB] Prices refreshed from Finnhub (FMP key absent)');
    }
    return;
  }

  try {
    // Batch in chunks of 50
    for (let i = 0; i < unique.length; i += 50) {
      const chunk = unique.slice(i, i+50);
      // Use full quote for PE/PB/mktCap updates
      const res   = await fetch(`https://financialmodelingprep.com/api/v3/quote/${chunk.join(',')}?apikey=${fmpKey}`, {signal:AbortSignal.timeout(8000)});
      const data  = await res.json();
      (Array.isArray(data) ? data : []).forEach(q => {
        const sym = q.symbol?.toUpperCase();
        Object.values(sectorDB).forEach(sector => {
          const s = sector.stocks.find(st => st.ticker.replace(/.*:/,'').toUpperCase() === sym);
          if (s && q.price) {
            s.price    = q.price;
            s.change   = q.changesPercentage ?? s.change;
            if (q.pe        != null) s.pe       = q.pe;
            if (q.priceAvg50!= null) s.ma50     = q.priceAvg50;
            if (q.marketCap != null) s.mktCap   = q.marketCap >= 1e12
              ? (q.marketCap/1e12).toFixed(2)+'T'
              : (q.marketCap/1e9).toFixed(1)+'B';
            if (q.eps       != null) s.eps      = q.eps;
            if (q.sharesOutstanding != null) s.float = (q.sharesOutstanding/1e9).toFixed(2)+'B';
          }
        });
      });
    }
    console.info('[sectorDB] Prices refreshed from FMP');
  } catch {}
}

/* ══════════════════════════════════════════════════════════════════
   TAB SYSTEM
   ══════════════════════════════════════════════════════════════════ */
function switchTab(panelId, tabId){
  const p=document.getElementById(`panel-${panelId}`);
  if(!p) return;
  p.querySelectorAll(".tab-btn").forEach(b=>b.classList.toggle("active",b.dataset.tab===tabId));
  p.querySelectorAll(".tab-pane").forEach(x=>x.classList.toggle("active",x.dataset.tab===tabId));
  // Alert Feed: show WM sub-filter bar only on the WM tab
  if(panelId === "alert"){
    const wmFilters = document.getElementById("alert-wm-filters");
    if(wmFilters) wmFilters.classList.toggle("hidden", tabId !== "wm");
  }
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
function renderFundamentals(ticker) {
  const sym    = ticker.replace(/.*:/, '').toUpperCase();
  const tvSym  = resolveSymbol(ticker);

  /* ── DES — TradingView Fundamentals widget + live description ─── */
  const des = document.getElementById('fund-des');
  if (des) {
    des.innerHTML = `
      <div class="tv-fundamental-wrap" id="tv-fund-${escapeHtml(sym)}"></div>
      <div class="tv-fundamental-fallback" id="tv-fund-fallback-${escapeHtml(sym)}">
        <div class="av-loading"><span class="av-spinner"></span>Loading company profile…</div>
      </div>`;
    // Inject TradingView Financials widget
    try {
      const container = document.getElementById(`tv-fund-${sym}`);
      if (container) {
        const s = document.createElement('script');
        s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-financials.js';
        s.async = true;
        s.innerHTML = JSON.stringify({
          symbol: tvSym, colorTheme: 'dark', isTransparent: true,
          largeChartUrl: '', displayMode: 'regular', width: '100%', height: 550, locale: 'en'
        });
        container.appendChild(s);
        setTimeout(() => {
          const fb = document.getElementById(`tv-fund-fallback-${sym}`);
          if (fb && container.querySelector('iframe')) fb.style.display = 'none';
        }, 3000);
      }
    } catch (e) { /* fallback stays visible */ }

    // Also populate description from FMP / Finnhub profile
    const _fillDesc = () => {
      const fhLive  = (typeof fhGetLive  === 'function') ? fhGetLive(sym)  : null;
      const fmpLive = (typeof fmpGetLive === 'function') ? fmpGetLive(sym) : null;
      const profile = fhLive?.profile || fmpLive?.profile || null;
      const fb = document.getElementById(`tv-fund-fallback-${sym}`);
      if (!fb || !profile) return;
      const p = profile;
      fb.innerHTML = `
        <div class="av-live-badge">● Company Profile · ${escapeHtml(p.name || sym)}</div>
        ${mRow('Exchange',  escapeHtml(p.exchange  || p.exchangeShortName || '—'))}
        ${mRow('Sector',    escapeHtml(p.sector    || p.finnhubIndustry   || '—'))}
        ${mRow('Industry',  escapeHtml(p.industry  || p.subIndustry       || '—'))}
        ${mRow('Country',   escapeHtml(p.country   || '—'))}
        ${mRow('Currency',  escapeHtml(p.currency  || 'USD'))}
        ${mRow('Employees', (p.employees || p.fullTimeEmployees) ? Number(p.employees || p.fullTimeEmployees).toLocaleString() : '—')}
        ${mRow('Website',   p.weburl || p.website ? `<a href="${escapeHtml(p.weburl||p.website)}" target="_blank" class="geo-wm-link">${escapeHtml(p.weburl||p.website)}</a>` : '—')}
        ${p.description || p.longBusinessSummary ? `<div class="des-desc">${escapeHtml((p.description||p.longBusinessSummary).slice(0,600))}${(p.description||p.longBusinessSummary).length>600?'…':''}</div>` : ''}`;
    };
    setTimeout(_fillDesc, 800); // Wait for FH/FMP to load
  }

  /* ── FA — Financial Statements ──────────────────────────────────
     Priority:
       1. AV  avRenderFA()     (fires from avLoadAll automatically)
       2. FMP fmpLoadAll()     (fires from avLoadAll when FMP key set)
       3. SEC EDGAR XBRL      (fallback when no key, after 3.5s)       */
  const fa = document.getElementById('fund-fa');
  if (fa) {
    // Check if AV already populated it (avLoadAll fires async in parallel)
    const avData = (typeof avLiveCache !== 'undefined') ? avLiveCache[sym] : null;
    if (avData?.income?.length) {
      // AV data available — render immediately
      if (typeof avRenderFA === 'function') avRenderFA(sym, avData.income, avData.balance, avData.cashflow);
    } else {
      // Show loading, start 3.5s EDGAR fallback
      if (!fa.dataset.loaded) {
        fa.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading financials for ${escapeHtml(sym)}…</div>`;
      }
      setTimeout(() => {
        const faEl = document.getElementById('fund-fa');
        if (faEl && faEl.querySelector('.av-loading')) {
          // AV/FMP hasn't populated it — fall through to EDGAR XBRL
          if (typeof faLoadEdgarXBRL === 'function') faLoadEdgarXBRL(sym, faEl);
        }
      }, 3500);
    }
  }

  /* ── ERN — Earnings Surprises ───────────────────────────────────
     Sources:
       1. avLiveCache[sym].earnings  (populated by avLoadAll/avRenderEarnings)
       2. FMP /earnings-surprises    (fallback after 3s)
       3. "Add key" prompt           (no keys configured)              */
  const ern = document.getElementById('fund-ern');
  if (ern) {
    const _avCache = (typeof avLiveCache !== 'undefined') ? avLiveCache : {};
    if (_avCache[sym]?.earnings?.quarterly?.length) {
      // AV data already loaded — render immediately
      if (typeof avRenderEarnings === 'function') avRenderEarnings(sym, _avCache[sym].earnings);
    } else if (!ern.dataset.loaded) {
      ern.dataset.loaded = '1';
      ern.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading earnings history for ${escapeHtml(sym)}…</div>`;
      // FMP fallback after 3s if AV hasn't fired
      setTimeout(() => {
        const ernEl = document.getElementById('fund-ern');
        if (!ernEl || !ernEl.querySelector('.av-loading')) return; // already populated
        const fmpKey = (typeof getFmpKey === 'function') ? getFmpKey() : '';
        if (fmpKey) {
          fetch(`https://financialmodelingprep.com/api/v3/earnings-surprises/${sym}?apikey=${fmpKey}`,
            {signal:AbortSignal.timeout(8000)})
            .then(r=>r.json()).then(data => {
              if (!Array.isArray(data) || !data.length) throw new Error('empty');
              const rows = data.slice(0,12).map(q => {
                const surp    = q.actualEarningResult - q.estimatedEarning;
                const surpPct = q.estimatedEarning
                  ? (surp/Math.abs(q.estimatedEarning)*100).toFixed(1)+'%' : '—';
                const cls = surp >= 0 ? 'pos' : 'neg';
                return `<tr>
                  <td>${escapeHtml(q.date||'')}</td>
                  <td>$${fmt(q.estimatedEarning)}</td>
                  <td>$${fmt(q.actualEarningResult)}</td>
                  <td class="${cls}">${surp>=0?'+':''}${surpPct}</td>
                </tr>`;
              }).join('');
              ernEl.innerHTML = `<div class="av-live-badge">● Earnings Surprises · FMP · ${escapeHtml(sym)}</div>
                ${sHead('EPS Actual vs Estimate')}
                <div class="fin-table-wrap"><table class="fin-table">
                  <thead><tr><th>Date</th><th>EPS Est</th><th>EPS Act</th><th>Surprise</th></tr></thead>
                  <tbody>${rows}</tbody>
                </table></div>`;
            }).catch(() => {
              ernEl.innerHTML = `<div class="no-data">// No earnings data available. Add
                <a href="#" onclick="openApiConfig('av');return false" style="color:var(--accent)">Alpha Vantage</a> or
                <a href="#" onclick="openApiConfig('fmp');return false" style="color:var(--accent)">FMP</a> key.</div>`;
            });
        } else {
          ernEl.innerHTML = `<div class="no-data">// Add
            <a href="#" onclick="openApiConfig('av');return false" style="color:var(--accent)">Alpha Vantage</a> or
            <a href="#" onclick="openApiConfig('fmp');return false" style="color:var(--accent)">FMP</a>
            key to see earnings history for ${escapeHtml(sym)}.</div>`;
        }
      }, 3000);
    }
  }

  /* ── EE — Analyst Estimates ─────────────────────────────────────
     Sources:
       1. avLiveCache[sym].earnings.annual  (from avRenderEarnings)
       2. FMP /analyst-estimates            (forward consensus, fallback)
       3. "Add key" prompt                                             */
  const ee = document.getElementById('fund-ee');
  if (ee) {
    const _avCache = (typeof avLiveCache !== 'undefined') ? avLiveCache : {};
    if (_avCache[sym]?.earnings?.annual?.length) {
      // Reuse the AV earnings data already rendered into the EE tab
      if (typeof avRenderEarnings === 'function') avRenderEarnings(sym, _avCache[sym].earnings);
    } else if (!ee.dataset.loaded) {
      ee.dataset.loaded = '1';
      ee.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading analyst estimates for ${escapeHtml(sym)}…</div>`;
      setTimeout(() => {
        const eeEl = document.getElementById('fund-ee');
        if (!eeEl || !eeEl.querySelector('.av-loading')) return;
        const fmpKey = (typeof getFmpKey==='function') ? getFmpKey() : '';
        if (fmpKey) {
          fetch(`https://financialmodelingprep.com/api/v3/analyst-estimates/${sym}?limit=8&apikey=${fmpKey}`,
            {signal:AbortSignal.timeout(8000)})
            .then(r=>r.json()).then(data => {
              if (!Array.isArray(data)||!data.length) throw new Error('empty');
              const rows = data.slice(0,8).map(r=>`<tr>
                <td>${escapeHtml(r.date?.slice(0,7)||'')}</td>
                <td class="accent"><strong>$${fmt(r.estimatedEpsAvg)}</strong></td>
                <td>$${fmt(r.estimatedEpsLow)}</td>
                <td>$${fmt(r.estimatedEpsHigh)}</td>
                <td>${fmtB(r.estimatedRevenueAvg)}</td>
                <td>${r.numberAnalystEstimatedEps||'—'}</td>
              </tr>`).join('');
              eeEl.innerHTML = `<div class="av-live-badge">● Analyst Estimates · FMP · ${escapeHtml(sym)}</div>
                ${sHead('Forward EPS & Revenue Consensus')}
                <div class="fin-table-wrap"><table class="fin-table">
                  <thead><tr><th>Period</th><th>EPS Mean</th><th>EPS Low</th><th>EPS High</th><th>Rev Mean</th><th>Analysts</th></tr></thead>
                  <tbody>${rows}</tbody>
                </table></div>`;
            }).catch(()=>{
              eeEl.innerHTML = `<div class="no-data">// No analyst estimates available. Add
                <a href="#" onclick="openApiConfig('fmp');return false" style="color:var(--accent)">FMP</a> key.</div>`;
            });
        } else {
          eeEl.innerHTML = `<div class="no-data">// Add
            <a href="#" onclick="openApiConfig('av');return false" style="color:var(--accent)">Alpha Vantage</a> or
            <a href="#" onclick="openApiConfig('fmp');return false" style="color:var(--accent)">FMP</a>
            key for analyst estimates for ${escapeHtml(sym)}.</div>`;
        }
      }, 3000);
    }
  }

  /* ── WACC — Cost of Capital Calculator ─────────────────────────
     Sources:
       • Beta     : Finnhub profile2 → FMP ratios → fallback 1.0
       • Kd       : FMP income-statement interestExpense/totalDebt
       • Tax rate : FMP income-statement incomeTaxExpense/incomeBeforeTax
       • Rf       : FRED 10Y Treasury (window._treasuryYields) → 4.5%
       • ERP      : Damodaran implied ERP (window.DAMODARAN_ERP)
       • D/E      : FMP ratios.debtEq → fallback 0.3
       • termG    : country-mapped default, user-adjustable             */
  const wc = document.getElementById('fund-wacc');
  if (wc && !wc.dataset.loaded) {
    wc.dataset.loaded = '1';
    wc.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Computing WACC…</div>`;

    setTimeout(() => {
      const fhLive  = (typeof fhGetLive  === 'function') ? fhGetLive(sym)  : null;
      const fmpLive = (typeof fmpGetLive === 'function') ? fmpGetLive(sym) : null;
      // AV overview beta — works for non-US tickers where Finnhub free tier returns null
      const avBeta  = (typeof avLiveCache !== 'undefined') ? (avLiveCache[sym]?.overview?.beta ?? null) : null;

      const beta   = parseFloat(fhLive?.profile?.beta  || fmpLive?.ratios?.beta  || fmpLive?.profile?.beta || avBeta || 1.0);
      const debtEq = parseFloat(fmpLive?.ratios?.debtEq || 0.3);

      // Risk-free rate: live US 10Y from FRED/TreasuryDirect
      const _ty = (typeof window._treasuryYields !== 'undefined') ? window._treasuryYields : {};
      const rf   = _ty['10Y'] ?? 4.5;

      // ERP: Damodaran implied (updated annually — see top of script.js)
      const erp  = window.DAMODARAN_ERP ?? 4.60;

      // Pre-tax cost of debt: from live FMP WACC inputs if available
      const waccInputs = fmpLive?.waccInputs;
      const kd   = waccInputs?.kdPct  ?? 5.5;   // fallback 5.5% when no FMP key
      const tax  = waccInputs?.taxRatePct ?? 21; // fallback US statutory 21%
      const kdSrc = waccInputs?.kdPct  != null ? 'FMP' : 'est.';
      const taxSrc= waccInputs?.taxRatePct != null ? 'FMP' : 'statutory';

      const ke   = (rf + beta * erp).toFixed(2);
      const eqW  = Math.max(20, Math.round(100 / (1 + debtEq)));
      const debtW= 100 - eqW;
      const wacc = (eqW/100 * parseFloat(ke) + debtW/100 * kd * (1 - tax/100)).toFixed(2);

      // Terminal growth: country-mapped default; user can override via input
      const country = fhLive?.profile?.country || fmpLive?.profile?.country || 'US';
      const termGDefault = (COUNTRY_TERM_GROWTH[country] ?? 2.5);
      // Read user override from sessionStorage if set
      const ssKey = `wacc_termg_${sym}`;
      const termG = parseFloat(sessionStorage.getItem(ssKey) ?? termGDefault);

      // EV/EBITDA implied exit multiple from Gordon Growth Model
      const waccN = parseFloat(wacc);
      const exitMult = (waccN > termG)
        ? ((1 + termG/100) / (waccN/100 - termG/100)).toFixed(1) + 'x'
        : 'N/A (termG ≥ WACC)';

      const betaSrc = fhLive?.profile?.beta ? 'Finnhub' : fmpLive?.ratios?.beta ? 'FMP' : avBeta ? 'AV' : 'estimated';

      wc.innerHTML = `
        <div class="av-live-badge">● WACC · ${escapeHtml(sym)} · beta:${betaSrc} · Kd:${kdSrc} · tax:${taxSrc}</div>
        ${sHead('WACC Inputs')}
        ${mRow('Risk-Free Rate (10Y)',       rf + '%')}
        ${mRow('Equity Risk Premium',        erp + '% <span style="font-size:9px;opacity:.6">(Damodaran Jan 2026)</span>')}
        ${mRow('Beta (levered)',             beta.toFixed(2) + ' <span style="font-size:9px;opacity:.6">('+betaSrc+')</span>')}
        ${mRow('Cost of Equity (Ke)',        ke + '%')}
        ${mRow('Pre-Tax Cost of Debt (Kd)',  kd.toFixed(2) + '% <span style="font-size:9px;opacity:.6">('+kdSrc+')</span>')}
        ${mRow('Tax Rate',                   tax.toFixed(1) + '% <span style="font-size:9px;opacity:.6">('+taxSrc+')</span>')}
        ${mRow('D/E Ratio',                  debtEq.toFixed(2))}
        ${mRow('Equity Weight',              eqW + '%')}
        ${mRow('Debt Weight',                debtW + '%')}
        <div class="metric wacc-result"><span>→ WACC</span><span>${wacc}%</span></div>
        ${sHead('DCF Sensitivity')}
        <div class="metric">
          <span>Terminal Growth Rate</span>
          <span style="display:flex;align-items:center;gap:6px">
            <input id="wacc-termg-${escapeHtml(sym)}" type="number" value="${termG}" min="0" max="10" step="0.1"
              style="width:58px;background:var(--bg2,#161b22);border:1px solid var(--border,#30363d);color:var(--text,#e6edf3);border-radius:4px;padding:2px 5px;font-size:12px;font-family:monospace"
              onchange="(function(el){
                var s='${escapeHtml(sym)}';
                sessionStorage.setItem('wacc_termg_'+s, el.value);
                var wc2=document.getElementById('fund-wacc');
                if(wc2){wc2.dataset.loaded='';renderFundamentals(s);}
              })(this)" />
            <span style="font-size:10px;opacity:.6">%</span>
          </span>
        </div>
        ${mRow('Implied EV/EBITDA exit',    exitMult)}
        <div class="av-note">// Kd = interest expense / total debt (FMP). Tax = effective rate (FMP).<br>// ERP: Damodaran Jan 2026 · <a href="https://pages.stern.nyu.edu/~adamodar/" target="_blank" rel="noopener" style="color:var(--accent,#58a6ff)">stern.nyu.edu/adamodar ↗</a><br>// Adjust terminal growth rate above to update exit multiple.</div>`;
    }, 1500); // Wait for Finnhub/FMP data
  }
}


/* ══════════════════════════════════════════════════════════════════
   NEWS HELPERS  — shared by all API renderers
   ══════════════════════════════════════════════════════════════════ */

/* Relative time: "2h ago", "3d ago" */
function niRelTime(ts) {
  // ts = ISO string "20250312T1430..." OR unix seconds (number) OR "YYYY-MM-DD"
  let ms;
  if (typeof ts === "number") {
    ms = ts > 1e10 ? ts : ts * 1000; // unix ms vs unix s
  } else if (typeof ts === "string") {
    if (/^\d{8}T/.test(ts)) {
      // AV format: "20250312T143000"
      const s = ts.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2}).*/, "$1-$2-$3T$4:$5:00Z");
      ms = Date.parse(s);
    } else {
      ms = Date.parse(ts);
    }
  }
  if (!ms || isNaN(ms)) return "";
  const diff = Date.now() - ms;
  if (diff < 3600000)  return Math.floor(diff/60000)  + "m ago";
  if (diff < 86400000) return Math.floor(diff/3600000) + "h ago";
  if (diff < 604800000)return Math.floor(diff/86400000)+ "d ago";
  return new Date(ms).toLocaleDateString("en-GB",{day:"2-digit",month:"short"});
}

/* Build a single news card HTML */
function niCard(id, {headline, source, ts, sentiment, category, summary, url, image}) {
  const timeStr = niRelTime(ts);
  const sentCls = sentiment === "Bullish" || sentiment === "Somewhat-Bullish" ? "ni-sent-bull"
                : sentiment === "Bearish" || sentiment === "Somewhat-Bearish" ? "ni-sent-bear"
                : "";
  const sentLbl = sentiment ? sentiment.replace("Somewhat-","~") : "";

  const imgHtml = image
    ? `<div class="ni-thumb"><img src="${escapeHtml(image)}" alt="" loading="lazy" onerror="this.closest('.ni-thumb').remove()"/></div>`
    : "";
  const catHtml = category
    ? `<span class="ni-cat">${escapeHtml(category)}</span>`
    : "";
  const sentHtml = sentCls
    ? `<span class="ni-sent ${sentCls}">${escapeHtml(sentLbl)}</span>`
    : "";

  return `<div class="news-item" id="${id}" onclick="niToggle('${id}')">
    <div class="ni-row${image ? ' has-thumb' : ''}">
      ${imgHtml}
      <div class="ni-left">
        <div class="ni-headline">${escapeHtml(headline||"")}</div>
        <div class="ni-meta">
          <span class="ni-source">${escapeHtml(source||"")}</span>
          ${timeStr ? `<span class="ni-dot">·</span><span class="ni-time">${timeStr}</span>` : ""}
          ${catHtml}
        </div>
      </div>
      <div class="ni-right">
        ${sentHtml}
        <span class="ni-chevron">▼</span>
      </div>
    </div>
    <div class="ni-drawer">
      ${summary ? `<p class="ni-summary">${escapeHtml(summary.slice(0,400))}${summary.length>400?"…":""}</p>` : ""}
      <a href="${escapeHtml(url||"#")}" target="_blank" rel="noopener noreferrer"
         class="ni-link" onclick="event.stopPropagation()">Read full article ↗</a>
    </div>
  </div>`;
}

/* Quick-search links to sources that don't need an API key */
function niSourceLinks(sym) {
  const q = encodeURIComponent(sym);

  // Detect if ticker maps to a commodity / resource sector for extra links
  const isCommodity = /^(GC|SI|CL|NG|HG|PL|PA|ZC|ZS|ZW|KC|SB|CT|CC|LBS|UX|ALI|BTC)/i.test(sym)
    || /(?:gold|silver|copper|oil|gas|coal|wheat|corn|soy|coffee|sugar|lithium|cobalt|nickel|aluminum|zinc|iron|rare.?earth|mineral|commodity|resource)/i.test(sym);

  const sources = [
    { name:"Reuters",        url:`https://www.reuters.com/site-search/?query=${q}`,                 cat:'general' },
    { name:"Bloomberg",      url:`https://www.bloomberg.com/search?query=${q}`,                     cat:'general' },
    { name:"FT",             url:`https://www.ft.com/search?q=${q}`,                               cat:'general' },
    { name:"WSJ",            url:`https://www.wsj.com/search?query=${q}`,                           cat:'general' },
    { name:"CNBC",           url:`https://www.cnbc.com/search/?query=${q}`,                         cat:'general' },
    { name:"SeekingAlpha",   url:`https://seekingalpha.com/search#q=${q}&tab=news`,                 cat:'general' },
    { name:"MarketWatch",    url:`https://www.marketwatch.com/search?q=${q}&ts=0&tab=All%20News`,   cat:'general' },
    { name:"Yahoo Finance",  url:`https://finance.yahoo.com/quote/${q}/news/`,                      cat:'general' },
    { name:"Google News",    url:`https://news.google.com/search?q=${q}`,                           cat:'general' },
    { name:"The Economist",  url:`https://www.economist.com/search?q=${q}`,                         cat:'general' },
    // Commodity & resource-specific sources (always shown for relevant tickers, toggleable for others)
    { name:"Reuters Commodities", url:`https://www.reuters.com/markets/commodities/?q=${q}`,           cat:'commodity' },
    { name:"Bloomberg Commodities",url:`https://www.bloomberg.com/markets/commodities`,                cat:'commodity' },
    { name:"Mining.com",     url:`https://www.mining.com/?s=${q}`,                                  cat:'commodity' },
    { name:"Fastmarkets",    url:`https://www.fastmarkets.com/search/?q=${q}`,                      cat:'commodity' },
    { name:"Argus Media",    url:`https://www.argusmedia.com/en/search?q=${q}`,                     cat:'commodity' },
    { name:"Platts (OPIS)",  url:`https://www.spglobal.com/commodityinsights/en/market-insights/latest-news/commodities/${q}`, cat:'commodity' },
    { name:"Metal Bulletin", url:`https://www.metalbulletin.com/Article/Search?q=${q}`,             cat:'commodity' },
    { name:"World Bank Blogs",url:`https://blogs.worldbank.org/search?search_api_views_fulltext=${q}&filter_topic=All`, cat:'commodity' },
    { name:"USGS Minerals",  url:`https://pubs.usgs.gov/search/?q=${q}`,                            cat:'commodity' },
    { name:"EIA News",       url:`https://www.eia.gov/pressroom/releases/`,                         cat:'energy' },
    { name:"OPEC Newsroom",  url:`https://www.opec.org/opec_web/en/press_room/1893.htm`,            cat:'energy' },
    { name:"IEA News",       url:`https://www.iea.org/news`,                                        cat:'energy' },
    { name:"Rare Earth Exchanges",url:`https://rareearthexchanges.com`,                             cat:'commodity' },
    { name:"Supply Chain Dive",url:`https://www.supplychaindive.com/search/?q=${q}`,                cat:'supply' },
    { name:"GDELT Supply",   url:`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q+' commodity supply')}&mode=artlist&maxrecords=10&format=json&timespan=3d`, cat:'gdelt' },
  ];

  // Show general + commodity if commodity detected, else just general
  const shown  = isCommodity ? sources : sources.filter(s => s.cat === 'general');
  const hidden = isCommodity ? [] : sources.filter(s => s.cat !== 'general');

  const toggleId = `ni-more-${sym.replace(/[^a-z0-9]/gi,'')}`;

  return `<div class="ni-sources-wrap">
    <div class="ni-sources-label">// Search without API key${isCommodity ? ' · Commodity mode' : ''}</div>
    <div class="ni-sources-list">
      ${shown.filter(s=>s.cat!=='gdelt').map(s => `<a href="${s.url}" target="_blank" rel="noopener noreferrer" class="ni-src-btn${s.cat==='commodity'?' ni-src-comm':s.cat==='energy'?' ni-src-energy':s.cat==='supply'?' ni-src-supply':''}">${escapeHtml(s.name)}</a>`).join("")}
    </div>
    ${!isCommodity ? `<button onclick="document.getElementById('${toggleId}').style.display=document.getElementById('${toggleId}').style.display==='none'?'flex':'none'" class="ni-comm-toggle" style="font-size:9px;color:var(--accent);background:none;border:none;cursor:pointer;padding:2px 0">▶ Show commodity &amp; resource news sources</button>
    <div id="${toggleId}" style="display:none;flex-wrap:wrap;gap:3px;margin-top:4px">
      ${sources.filter(s=>s.cat!=='general'&&s.cat!=='gdelt').map(s=>`<a href="${s.url}" target="_blank" rel="noopener noreferrer" class="ni-src-btn ni-src-comm">${escapeHtml(s.name)}</a>`).join("")}
    </div>` : ''}
  </div>`;
}

/* Central render function — ALL API providers call this */
function renderNewsFeed(sym, articles, provider) {
  const feed = document.getElementById("news-feed");
  if (!feed) return;
  if (!articles || !articles.length) return;

  const PROVIDER_LABELS = {
    fh:       { cls:"ni-badge-fh",      lbl:"Finnhub"         },
    av:       { cls:"ni-badge-av",      lbl:"Alpha Vantage"   },
    eod:      { cls:"ni-badge-eod",     lbl:"EODHD"           },
    apitube:  { cls:"ni-badge-apitube", lbl:"APITube"         },
    finnhub:  { cls:"ni-badge-fh",      lbl:"Finnhub"         },
  };
  const provMeta = PROVIDER_LABELS[provider] || { cls:"ni-badge-eod", lbl: provider.toUpperCase() };
  const badgeCls = provMeta.cls;
  const badgeLbl = provMeta.lbl;

  const cards = articles.map((a, i) => niCard(`ni-${provider}-${i}`, {
    headline:  a.headline || a.title,
    source:    a.source,
    ts:        a.datetime || a.publishedAt || a.date,
    sentiment: a.sentiment,
    category:  a.category,
    summary:   a.summary,
    url:       a.url,
    image:     a.image || a.banner,
  })).join("");

  feed.innerHTML = `
    <div class="av-live-badge ni-feed-badge">
      ● LIVE <span class="ni-prov-tag ${badgeCls}">${badgeLbl}</span>
      <span class="av-ts">${articles.length} articles</span>
    </div>
    <div class="news-list">${cards}</div>
    ${niSourceLinks(sym)}`;

  // Also update hidden news-cn so legacy code doesn't break
  const cn = document.getElementById("news-cn");
  if (cn) cn.innerHTML = feed.innerHTML;
}

/* ══════════════════════════════════════════════════════════════════
   RENDER: NEWS — loading state + fallback sources
   ══════════════════════════════════════════════════════════════════ */
function renderNews(ticker){
  const sym = ticker.replace(/.*:/,"").toUpperCase();
  const feed = document.getElementById("news-feed");
  if (feed) feed.innerHTML =
    `<div class="av-loading"><span class="av-spinner"></span>Fetching live news for ${escapeHtml(sym)}…</div>
     ${niSourceLinks(sym)}`;

  // Fallback: if no API delivers news within 8s, show only source links
  setTimeout(()=>{
    const f = document.getElementById("news-feed");
    if (f && f.querySelector(".av-spinner")) {
      f.innerHTML =
        `<div class="no-data" style="margin-bottom:10px">// No news API key configured.<br>// Add Finnhub or Alpha Vantage via ⚙ API for live articles.</div>
         ${niSourceLinks(sym)}`;
    }
  }, 8000);
}

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

/* Auto-load geo-wars when geopolitical panel becomes visible */
function _autoLoadGeoPanel() {
  const warsEl = document.getElementById('georisk-wars-content');
  if (warsEl && !warsEl.dataset.loaded && typeof georiskLoadWars === 'function') {
    warsEl.dataset.loaded = '1';
    georiskLoadWars();
  }
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
        <span class="wl-price fh-ws-price" data-ticker="${escapeHtml(String(s.ticker||'').replace(/.*:/,'').toUpperCase())}">${priceStr}</span>
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
  showPanel("analysts");
  const cb = document.querySelector('.panel-toggle[data-panel="analysts"]');
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

  const sym = ticker.replace(/.*:/,"").toUpperCase();

  // 1. Try live FMP ratios (most accurate — from fmpLiveCache)
  let stock = null;
  const fmpLive = (typeof fmpGetLive === "function") ? fmpGetLive(sym) : null;
  if (fmpLive?.ratios) {
    const r = fmpLive.ratios;
    const q = (typeof fhGetLive === "function" ? fhGetLive(sym) : null)?.quote || null;
    const avQ = (typeof avLiveCache !== "undefined") ? avLiveCache[sym]?.quote : null;
    const price = q?.price || avQ?.price || null;
    stock = {
      ticker: sym,
      name: fmpLive.mgmt?.[0] ? ticker : sym,
      price,
      pe:       r.pe,
      pb:       r.pb,
      evEbitda: r.evEbitda,
      fcfYield: r.fcfYield,
      peg:      r.peg,
      divYield: r.divYield,
      epsGrowth: fmpLive.estimates?.[0]?.epsGrowth ?? 15,
    };
  }

  // 2. Try Yahoo live data (yfValData set by yfEnrichValuation)
  if (!stock && typeof window.yfValData !== "undefined" && window.yfValData[sym]) {
    stock = window.yfValData[sym];
  }

  // 3. Try sectorDB (stale prices — always trigger live refresh after)
  if (!stock) {
    for (const key in sectorDB) {
      stock = sectorDB[key].stocks.find(s => s.ticker === ticker || s.ticker.endsWith(":"+ticker));
      if (stock) break;
    }
    if (stock) {
      // Mark prices as stale and refresh with live data
      stock = { ...stock, _stalePrice: true };
      // Trigger async live price refresh — will re-render valuation when done
      setTimeout(async () => {
        const fmpKey = (typeof getFmpKey === 'function') ? getFmpKey() : '';
        if (fmpKey) {
          try {
            const res  = await fetch(`https://financialmodelingprep.com/api/v3/quote-short/${sym}?apikey=${fmpKey}`, {signal:AbortSignal.timeout(5000)});
            const data = await res.json();
            const q    = Array.isArray(data) ? data[0] : data;
            if (q?.price) {
              // Update sectorDB stock in place with live price
              for (const key in sectorDB) {
                const s = sectorDB[key].stocks.find(st => st.ticker === ticker || st.ticker.endsWith(":"+ticker));
                if (s) {
                  s.price  = q.price;
                  s.change = q.changesPercentage;
                  s.mktCap = q.marketCap ? (q.marketCap >= 1e12 ? (q.marketCap/1e12).toFixed(2)+"T" : (q.marketCap/1e9).toFixed(1)+"B") : s.mktCap;
                }
              }
              // Re-render valuation with fresh price
              if (typeof renderValuation === 'function') renderValuation(ticker);
            }
          } catch {}
        } else if (typeof fhGetLive === 'function') {
          const fhQ = fhGetLive(sym)?.quote;
          if (fhQ?.price) {
            for (const key in sectorDB) {
              const s = sectorDB[key].stocks.find(st => st.ticker === ticker || st.ticker.endsWith(":"+ticker));
              if (s) s.price = fhQ.price;
            }
            if (typeof renderValuation === 'function') renderValuation(ticker);
          }
        }
      }, 200);
    }
  }

  // 4. No live data available — show no-data prompt instead of stale mock
  // NOTE: DB.AAPL mock data intentionally removed here (was step 4).
  // Steps 1–3 cover FMP, Yahoo, and sectorDB; if all fail, the user needs a key.

  // 5. If Yahoo key active and no data yet, trigger async enrichment
  if (!stock && typeof yfEnrichValuation === "function") {
    yfEnrichValuation(sym);
    box.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading live valuation data for ${escapeHtml(sym)}…</div>`;
    return;
  }

  if (!stock) {
    box.innerHTML = `<div class="no-data">// No valuation data for <strong>${escapeHtml(ticker)}</strong>.<br>// Add FMP or Yahoo Finance key for live data.</div>`;
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
  const canvas = document.getElementById("dashboardCanvas");
  const W = canvas.clientWidth, H = canvas.clientHeight, G = 6;

  /* ── Screenshot-faithful layout ──────────────────────────────
     4 master columns (top row, no stacking):
       Chart ≈28%  |  News ≈21%  |  Macro ≈34%  |  Geo ≈17%
     Row heights:
       Top row ≈56%  (chart | news | macro | geo)
       Bot row ≈44%  (watchlist | analysts | comparables | ownership | alert | supply)
     Bottom row aligns to top columns:
       col1→watchlist, col2→analysts,
       col3 splits→comparables+ownership, col4 splits→alert+supply
  ──────────────────────────────────────────────────────────────── */

  const colA = Math.round(W * 0.28);   // Chart / Watchlist col
  const colB = Math.round(W * 0.21);   // News / Analysts col
  const colC = Math.round(W * 0.34);   // Macro col (splits into comparables+ownership)
  const colD = W - colA - colB - colC - G*3; // Geo col (splits into alert+supply)

  const rowT = Math.round(H * 0.56);   // Top row height
  const rowB = H - rowT - G;           // Bottom row height
  const botY = rowT + G;

  // ── TOP ROW (4 full-height columns, no stacking) ────────────
  panelLayout.chart        = {x: 0,                          y: 0, w: colA, h: rowT};
  panelLayout.news         = {x: colA+G,                     y: 0, w: colB, h: rowT};
  panelLayout.macro        = {x: colA+colB+G*2,              y: 0, w: colC, h: rowT};
  panelLayout.geopolitical = {x: colA+colB+colC+G*3,         y: 0, w: colD, h: rowT};

  // ── BOTTOM ROW (6 panels aligned to top columns) ────────────
  const cC1 = Math.round((colC - G) / 2);   // left half of macro col
  const cC2 = colC - cC1 - G;               // right half of macro col
  const cD1 = Math.round((colD - G) / 2);   // left half of geo col
  const cD2 = colD - cD1 - G;               // right half of geo col

  const xB2 = colA + G;
  const xB3 = colA + colB + G*2;
  const xB4 = xB3 + cC1 + G;
  const xB5 = colA + colB + colC + G*3;
  const xB6 = xB5 + cD1 + G;

  panelLayout.watchlist    = {x: 0,   y: botY, w: colA, h: rowB};
  panelLayout.analysts     = {x: xB2, y: botY, w: colB, h: rowB};
  panelLayout.comparables  = {x: xB3, y: botY, w: cC1,  h: rowB};
  panelLayout.ownership    = {x: xB4, y: botY, w: cC2,  h: rowB};
  panelLayout.alert        = {x: xB5, y: botY, w: cD1,  h: rowB};
  panelLayout.supply       = {x: xB6, y: botY, w: cD2,  h: rowB};

  // ── SECONDARY (hidden by default, floating when opened) ─────
  panelLayout.fundamentals = {x: Math.round(W*0.1),  y: Math.round(H*0.1), w: colB, h: rowT};
  panelLayout.webhooks     = {x: Math.round(W*0.35), y: Math.round(H*0.1), w: colB, h: rowT};
  panelLayout.intel        = {x: Math.round(W*0.2),  y: botY, w: Math.round(W*0.35), h: rowB};
  panelLayout.notes        = {x: Math.round(W*0.3),  y: Math.round(H*0.2), w: Math.round(W*0.28), h: Math.round(H*0.45)};
  panelLayout.portfolio    = {x: Math.round(W*0.1),  y: Math.round(H*0.05), w: Math.round(W*0.80), h: Math.round(H*0.88)};
  panelLayout.screener     = {x: Math.round(W*0.05), y: Math.round(H*0.04), w: Math.round(W*0.90), h: Math.round(H*0.90)};

}

function applyPanelPosition(id){
  const el=document.getElementById(`panel-${id}`); if(!el) return;
  let l=panelLayout[id];
  if(!l){
    // Fallback: center panel on canvas with reasonable default size
    const canvas=document.getElementById("dashboardCanvas");
    const cw=canvas?.clientWidth||window.innerWidth;
    const ch=canvas?.clientHeight||window.innerHeight;
    const w=Math.min(860, Math.round(cw*0.60));
    const h=Math.min(700, Math.round(ch*0.82));
    l={x:Math.round((cw-w)/2), y:Math.round((ch-h)/2), w, h};
    panelLayout[id]=l;
  }
  const minY=getTopbarGuard();
  const safeY=Math.max(minY, l.y);
  Object.assign(el.style,{left:l.x+"px",top:safeY+"px",width:l.w+"px",height:l.h+"px"});
}
function initLayout(){
  computeDefaultLayout();

  // 1. Apply ALL panel positions FIRST (while still hidden → no flash)
  Object.keys(panelLayout).forEach(applyPanelPosition);

  // 2. Then set visibility:
  //    Visible at startup: chart, news, macro, geopolitical (top row, 4 full-height cols)
  //                        watchlist, analysts, comparables, ownership, alert, supply (bottom row)
  //    Hidden by default: fundamentals, webhooks, intel, notes, portfolio, screener
  const startVisible = ["chart","news","macro","geopolitical",
    "watchlist","analysts","comparables","ownership","alert","supply"];
  const startHidden  = ["fundamentals","webhooks","intel","notes","portfolio","screener"];

  startVisible.forEach(id => {
    const el = document.getElementById("panel-"+id);
    if(!el) return;
    applyPanelPosition(id);            // re-apply in case canvas was 0 on first pass
    el.classList.remove("hidden");
    document.querySelectorAll(`.panel-toggle[data-panel="${id}"]`).forEach(cb => cb.checked = true);
  });
  startHidden.forEach(id => {
    const el = document.getElementById("panel-"+id);
    if(!el) return;
    el.classList.add("hidden");
    document.querySelectorAll(`.panel-toggle[data-panel="${id}"]`).forEach(cb => cb.checked = false);
  });
}

/* ══════════════════════════════════════════════════════════════════
   DRAG
   ══════════════════════════════════════════════════════════════════ */

/* Returns the minimum Y (in canvas-relative px) a panel may occupy.
   Reads the live topbar height so it works whether the bar is
   expanded, collapsed, or toggled at runtime.                        */
function getTopbarGuard() {
  const topbar = document.getElementById('topbar');
  const canvas  = document.getElementById('dashboardCanvas');
  if (!topbar || !canvas) return 0;
  const tRect = topbar.getBoundingClientRect();
  const cRect  = canvas.getBoundingClientRect();
  // How far the bottom of the topbar is below the top of the canvas.
  // Positive means the topbar overlaps into canvas space (shouldn't happen
  // in the flex layout), negative means it's fully above — both cases
  // clamp to 0 so we never push panels down unnecessarily.
  return Math.max(0, tRect.bottom - cRect.top + 4); // 4 px breathing room
}

const SNAP=8; let dragState=null;
function initDrag(panel){
  panel.querySelector(".panel-head")?.addEventListener("mousedown",e=>{
    if(e.target.closest("button,input,select,textarea,.tab-btn,.wm-intel-tab,.wm-filter-btn,.wm-toggle,.lsb-preset-btn")) return;
    e.preventDefault();
    document.body.style.userSelect = "none";
    const canvas=document.getElementById("dashboardCanvas");
    const r=panel.getBoundingClientRect(), c=canvas.getBoundingClientRect();
    dragState={panel,startMouseX:e.clientX,startMouseY:e.clientY,startPanelX:r.left-c.left,startPanelY:r.top-c.top};
    panel.classList.add("dragging"); bringToFront(panel); panel.style.zIndex=1000;
    document.body.classList.add("panel-dragging");
    document.getElementById("snapOverlay")?.classList.add("visible");
  });
}
document.addEventListener("mousemove",e=>{
  if(!dragState) return;
  const c=document.getElementById("dashboardCanvas").getBoundingClientRect();
  const minY=getTopbarGuard();
  const pw=dragState.panel.offsetWidth, ph=dragState.panel.offsetHeight;
  let x=dragState.startPanelX+(e.clientX-dragState.startMouseX);
  let y=dragState.startPanelY+(e.clientY-dragState.startMouseY);
  // Snap to grid
  x=Math.round(x/SNAP)*SNAP;
  y=Math.round(y/SNAP)*SNAP;
  // Clamp: left/right (keep at least 60px visible), top guard
  x=Math.max(-pw+60, Math.min(x, c.width-60));
  y=Math.max(minY, y);   // no bottom clamp — allow panels to extend below fold
  dragState.panel.style.left=x+"px"; dragState.panel.style.top=y+"px";
  const pid=dragState.panel.dataset.panel;
  if(panelLayout[pid]){panelLayout[pid].x=x;panelLayout[pid].y=y;}
});
document.addEventListener("mouseup",()=>{
  document.body.style.userSelect = "";
  if(!dragState) return;
  dragState.panel.classList.remove("dragging"); dragState.panel.style.zIndex="";
  document.getElementById("snapOverlay")?.classList.remove("visible");
  document.body.classList.remove("panel-dragging"); dragState=null;
});

/* ══════════════════════════════════════════════════════════════════
   RESIZE
   ══════════════════════════════════════════════════════════════════ */
const MIN_W=200,MIN_H=100; let resizeState=null;
function initResize(panel){
  panel.querySelectorAll(".resize-handle").forEach(h=>{
    h.addEventListener("mousedown",e=>{
      e.preventDefault(); e.stopPropagation();
      document.body.style.userSelect = "none";  // prevent text selection
      const canvas=document.getElementById("dashboardCanvas");
      const r=panel.getBoundingClientRect(), c=canvas.getBoundingClientRect();
      resizeState={panel,dir:h.dataset.dir,mouseX:e.clientX,mouseY:e.clientY,
        startX:r.left-c.left, startY:r.top-c.top, startW:r.width, startH:r.height};
      panel.classList.add("resizing"); bringToFront(panel);
      document.body.classList.add("panel-resizing");
    });
  });
}
document.addEventListener("mousemove",e=>{
  if(!resizeState) return;
  e.preventDefault();
  const s=resizeState;
  const dx=e.clientX-s.mouseX, dy=e.clientY-s.mouseY;
  const minY=getTopbarGuard();
  let x=s.startX, y=s.startY, w=s.startW, h=s.startH;

  // East / West (width)
  if(s.dir.includes("e")) w = Math.max(MIN_W, s.startW + dx);
  if(s.dir.includes("w")) { w = Math.max(MIN_W, s.startW - dx); x = s.startX + s.startW - w; }

  // South (grow downward — no canvas bottom clamp)
  if(s.dir.includes("s")) h = Math.max(MIN_H, s.startH + dy);

  // North (grow upward — anchor bottom, move top)
  if(s.dir.includes("n")) {
    const newH = Math.max(MIN_H, s.startH - dy);
    const newY = s.startY + s.startH - newH;
    // Clamp top to topbar guard
    if(newY >= minY) { h = newH; y = newY; }
    else             { y = minY; h = Math.max(MIN_H, s.startY + s.startH - minY); }
  }

  // Snap
  w = Math.round(w/SNAP)*SNAP;
  h = Math.round(h/SNAP)*SNAP;
  x = Math.max(-w+60, Math.round(x/SNAP)*SNAP);  // allow partial off-screen left
  y = Math.max(minY,  Math.round(y/SNAP)*SNAP);

  Object.assign(s.panel.style, {left:x+"px", top:y+"px", width:w+"px", height:h+"px"});

  const pid = s.panel.dataset.panel;
  const tt  = document.getElementById("tooltip-"+pid);
  if(tt) tt.textContent = w+"×"+h;
  if(panelLayout[pid]) Object.assign(panelLayout[pid], {x,y,w,h});
});
document.addEventListener("mouseup",()=>{
  document.body.style.userSelect = "";  // always restore
  if(!resizeState) return;
  resizeState.panel.classList.remove("resizing");
  document.body.classList.remove("panel-resizing");
  const pid=resizeState.panel.dataset.panel;
  if(pid==="chart") setTimeout(()=>loadChart(resolveSymbol(currentTicker)),120);
  resizeState=null;
});

let zCounter=10;
function bringToFront(panel){panel.style.zIndex=++zCounter;}

/* ══════════════════════════════════════════════════════════════════
   TRADINGVIEW
   ══════════════════════════════════════════════════════════════════ */
let _tvWidget = null;

/* Called whenever the TradingView chart changes its symbol (any source).
   Exposed on window so uars-integration.js postMessage bridge can reach it. */
window._onTvSymbolChange = function _onTvSymbolChange(newFull) {
  if (!newFull) return;
  const bare = newFull.replace(/.*:/, '').toUpperCase();
  if (bare === (currentTicker || '').replace(/.*:/, '').toUpperCase()) return;
  currentTicker = newFull;
  const inp = document.getElementById('tickerInput');
  if (inp) inp.value = newFull;
  reloadAllPanels(newFull);
  if (typeof avLoadAll      === 'function') avLoadAll(bare);
  if (typeof finnhubLoadAll === 'function') finnhubLoadAll(bare);
  /* Show + trigger UARS Analysts panel immediately */
  showPanel('analysts');
  if (typeof uarsSafeLoad   === 'function') uarsSafeLoad(newFull);
};

function loadChart(symbol){
  const el=document.getElementById("priceChart"); if(!el) return;
  el.innerHTML="";
  _tvWidget = new TradingView.widget({autosize:true,symbol,interval:"D",timezone:"Europe/Rome",
    theme:"dark",style:"1",locale:"it",toolbar_bg:"#0d1117",
    enable_publishing:false,allow_symbol_change:true,save_image:false,container_id:"priceChart"});

  /* Primary: use TradingView charting library API if available */
  try {
    if (typeof _tvWidget.onChartReady === 'function') {
      _tvWidget.onChartReady(function() {
        try {
          const chart = typeof _tvWidget.activeChart === 'function'
            ? _tvWidget.activeChart() : _tvWidget.chart();
          chart.onSymbolChanged().subscribe(null, function() {
            try { _onTvSymbolChange(chart.symbol()); } catch(_) {}
          });
        } catch(_) {}
      });
    }
  } catch(_) {}
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
  // Update Frankfurter ECB rates + 90-day history for this pair
  if(typeof frankfurterLoadRates === "function") frankfurterLoadRates();
  if(typeof frankfurterHistory   === "function") {
    const parts = pair.replace(/[^A-Z/]/g,"").split("/");
    if(parts.length===2) frankfurterHistory(parts[0], parts[1], 90);
  }
  // Open Exchange Rates — update rate strip and history on pair change
  if(typeof oerLoadRates   === "function") oerLoadRates();
  if(typeof oerLoadHistory === "function") {
    const oerParts = pair.replace(/[^A-Z/]/g,"").split("/");
    if(oerParts.length===2) oerLoadHistory(oerParts[0], oerParts[1], 30);
  }
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
  // Reset ALL Fundamentals tabs so they reload with the new ticker
  ["fund-fa","fund-ern","fund-ee","fund-wacc",
   "fund-div","fund-filings","fund-tech","fund-short","fund-seg","fund-trans","fund-form4",
   "yf-financials","yf-options","yf-holders","yf-history"].forEach(id => {
    const el = document.getElementById(id);
    if(el) { el.innerHTML = ""; el.dataset.loaded = ""; el.dataset.techSym = ""; }
  });
  // Also reset desc so it refills with new ticker's profile
  const desEl = document.getElementById("fund-des");
  if(desEl) { desEl.innerHTML = ""; }
  // If a lazy tab is currently active, load it immediately for the new ticker
  const activeFundTab = document.querySelector("#panel-fundamentals .tab-btn.active");
  const at = activeFundTab?.dataset.tab;
  if(at === "div"     && typeof fmpLoadDividends      === "function") fmpLoadDividends(sym);
  if(at === "filings" && typeof fmpLoadSecFilings     === "function") fmpLoadSecFilings(sym);
  if(at === "tech") {
    if(typeof techLoadFull === "function") techLoadFull(sym);
    else if(typeof avLoadTech === "function") avLoadTech(sym);
  }
  if(at === "short"   && typeof fhLoadShortInterest   === "function") fhLoadShortInterest(sym);
  if(at === "seg"     && typeof fmpLoadSegmentation   === "function") fmpLoadSegmentation(sym);
  if(at === "trans"   && typeof fmpLoadTranscript     === "function") fmpLoadTranscript(sym);
  if(at === "form4"   && typeof fmpLoadForm4          === "function") fmpLoadForm4(sym);
  if(at === "yf-fin"  && typeof yfLoadFinancials      === "function") yfLoadFinancials(sym);
  if(at === "yf-opt"  && typeof yfLoadOptions         === "function") yfLoadOptions(sym);
  if(at === "yf-hld"  && typeof yfLoadHolders         === "function") yfLoadHolders(sym);
  if(at === "yf-hist" && typeof yfLoadHistory         === "function") yfLoadHistory(sym);
  // DES / FA / ERN / EE / WACC — renderFundamentals handles them
  if(at === "des" || at === "fa" || at === "ern" || at === "ee" || at === "wacc") {
    renderFundamentals(sym);
  }
  // Always refresh Yahoo quote on ticker change if key is set
  if(typeof yfLoadAll === "function") yfLoadAll(sym);
  loadComparables(sym);
  renderScorecard(sym);
  // Enrich watchlist rows with Yahoo live prices
  if(typeof yfEnrichWatchlist === "function") setTimeout(() => yfEnrichWatchlist(), 1500);
  // Technical panel — load if visible, else mark stale
  if(typeof techLoadFull === "function") {
    const techEl = document.getElementById("fund-tech");
    if (techEl) { techEl.dataset.techSym = sym; techEl.dataset.loaded = ""; }
    const activeFund = document.querySelector("#panel-fundamentals .tab-btn.active");
    if (activeFund?.dataset.tab === "tech") techLoadFull(sym);
  }
  // Subscribe ticker to Finnhub WebSocket
  if(typeof fhWsSubscribe === "function") fhWsSubscribe(sym);
  // Update quote-qr price element for WS patches
  const qrPrice = document.querySelector("#quote-qr .wl-price, #quote-qr span[data-live]");
  if (qrPrice) qrPrice.dataset.ticker = sym;
  // Reset comparables comp tab
  const compComp = document.getElementById("comp-comp");
  if(compComp) { compComp.innerHTML = ""; compComp.dataset.loaded = ""; }
  const activeCompTab = document.querySelector("#panel-comparables .tab-btn.active");
  if(activeCompTab?.dataset.tab === "comp" && typeof yfLoadComparison === "function") yfLoadComparison(sym);
  if(activeCompTab?.dataset.tab === "rv"   && typeof yfLoadPeers      === "function") yfLoadPeers(sym);
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
/* Button on the chart panel — show Analysts & Evaluation and run UARS */
function openAnalysts(){
  showPanel('analysts');
  if (typeof uarsSafeLoad === 'function') uarsSafeLoad(currentTicker);
}
function showPanel(id){
  const el=document.getElementById(`panel-${id}`); if(!el) return;
  el.classList.remove("hidden"); applyPanelPosition(id); bringToFront(el);
  
  if(id==="geopolitical") setTimeout(_autoLoadGeoPanel, 300);
  if(id==="chart") setTimeout(()=>loadChart(resolveSymbol(currentTicker)),80);
  if(id==="forex") setTimeout(()=>loadForexChart(),80);
  
  if(id==="alert") {
    setTimeout(() => {
      const feed = document.getElementById('alert-feed');
      // Force Twitter to scan the specific 'alert-feed' div
      if (typeof twttr !== 'undefined' && twttr.widgets) {
        twttr.widgets.load(feed);
      } else {
        // If Twitter script isn't ready yet, try one more time in 1 second
        setTimeout(() => { if(window.twttr) twttr.widgets.load(feed); }, 1000);
      }
    }, 300);
  }
}
function setupChecklist(){
  document.querySelectorAll(".panel-toggle").forEach(cb=>{
    cb.addEventListener("change",function(){
      const panel = this.dataset.panel;
      // Sync all checkboxes with same data-panel (compact bar + tray)
      document.querySelectorAll(`.panel-toggle[data-panel="${panel}"]`)
        .forEach(el => { if(el !== this) el.checked = this.checked; });
      this.checked ? showPanel(panel) : hidePanel(panel);
    });
  });
}

/* ── Module tray expand/collapse ────────────────────────────────── */
let _modulesTrayOpen = false;

/* ── Module row expand / collapse ───────────────────────────────── */
let _modulesRowExpanded = false;

function toggleModulesRow() {
  _modulesRowExpanded = !_modulesRowExpanded;
  const row   = document.getElementById('topbarRow2');
  const tab   = document.getElementById('modulesSideTab');
  const arrow = document.getElementById('mstArrow');
  if (!row) return;

  if (_modulesRowExpanded) {
    row.classList.remove('compact');
    row.classList.add('expanded');
    if (tab)   tab.classList.add('expanded');
    if (arrow) arrow.textContent = '▲';
    if (tab)   tab.title = 'Collapse module bar';
  } else {
    row.classList.add('compact');
    row.classList.remove('expanded');
    if (tab)   tab.classList.remove('expanded');
    if (arrow) arrow.textContent = '▼';
    if (tab)   tab.title = 'Expand module bar';
  }
}

function toggleModulesTray() {
  _modulesTrayOpen = !_modulesTrayOpen;
  const tray = document.getElementById('modulesTray');
  const btn  = document.getElementById('modulesExpandBtn');
  if (!tray) return;
  tray.classList.toggle('open', _modulesTrayOpen);
  if (btn) {
    btn.textContent    = _modulesTrayOpen ? '⊟' : '⊞';
    btn.title          = _modulesTrayOpen ? 'Collapse module selector' : 'Expand module selector';
    btn.classList.toggle('active', _modulesTrayOpen);
  }
  // Close tray when clicking outside
  if (_modulesTrayOpen) {
    setTimeout(() => {
      document.addEventListener('click', _closeTrayOnOutside, { capture: true, once: true });
    }, 50);
  }
}
function _closeTrayOnOutside(e) {
  const tray = document.getElementById('modulesTray');
  const btn  = document.getElementById('modulesExpandBtn');
  if (tray && !tray.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
    _modulesTrayOpen = true; // will be toggled to false
    toggleModulesTray();
  } else if (_modulesTrayOpen) {
    // still open, re-attach
    document.addEventListener('click', _closeTrayOnOutside, { capture: true, once: true });
  }
}

function modulesSelectAll(on) {
  document.querySelectorAll('.panel-toggle').forEach(cb => {
    if (cb.checked !== on) {
      cb.checked = on;
      on ? showPanel(cb.dataset.panel) : hidePanel(cb.dataset.panel);
    }
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

  // Double rAF ensures dashboardCanvas has computed dimensions before layout
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    initLayout();
    initLayoutSidebar();
    whRenderAlerts();
    whStartPolling();
    loadChart(resolveSymbol(currentTicker));
    reloadAllPanels(currentTicker);
    // Fetch live data on startup — strip exchange prefix for API calls
    const initSym = currentTicker.replace(/.*:/,"").toUpperCase();
    if(typeof avLoadAll      === "function") avLoadAll(initSym);
    if(typeof finnhubLoadAll === "function") finnhubLoadAll(initSym);
    if(typeof updateApiStatus  === "function") updateApiStatus();
    if(typeof updateFmpStatus  === "function") updateFmpStatus();
  }));
});

window.addEventListener("resize",()=>{
  const canvas=document.getElementById("dashboardCanvas");
  const minY=getTopbarGuard();
  document.querySelectorAll(".panel:not(.hidden)").forEach(panel=>{
    let x=Math.max(0,Math.min(parseInt(panel.style.left)||0,canvas.clientWidth-panel.offsetWidth));
    let y=Math.max(minY,Math.min(parseInt(panel.style.top)||0,canvas.clientHeight-panel.offsetHeight));
    panel.style.left=x+"px"; panel.style.top=y+"px";
  });
});

/* ══════════════════════════════════════════════════════════════════
   TASK 1 — already fixed in CSS (wm-intel-tabs z-index)
   TASK 2 — DUAL CHART
   ══════════════════════════════════════════════════════════════════ */
let _chart2Active = false;
let _chart2Widget = null;

function toggleChart2() {
  const wrap = document.getElementById('chartSplit');
  const c2   = document.getElementById('priceChart2');
  const btn  = document.getElementById('chart2Btn');
  if (!wrap || !c2) return;
  _chart2Active = !_chart2Active;
  if (_chart2Active) {
    wrap.classList.replace('single','dual');
    c2.style.display = 'block';
    btn.textContent = '⊗ 1 Chart';
    // load second chart with same ticker
    const sym = resolveSymbol(currentTicker);
    _chart2Widget = new TradingView.widget({
      autosize: true, symbol: sym, interval: '60', timezone: 'Etc/UTC',
      theme: document.body.classList.contains('light') ? 'Light' : 'Dark',
      style: '1', locale: 'en', toolbar_bg: '#0d1117',
      hide_side_toolbar: true, allow_symbol_change: true,
      enable_publishing: false, container_id: 'priceChart2'
    });
  } else {
    wrap.classList.replace('dual','single');
    c2.style.display = 'none';
    btn.textContent = '⊕ 2nd';
    c2.innerHTML = '';
    _chart2Widget = null;
  }
}

/* ══════════════════════════════════════════════════════════════════
   TASK 4 — SCORECARD (Bloomberg-style)
   ══════════════════════════════════════════════════════════════════ */
function renderScorecard(ticker) {
  const el = document.getElementById('analysts-score');
  if (!el) return;
  const lbl = document.getElementById('analystsLabel');

  const sym = (ticker || currentTicker || 'AAPL').replace(/.*:/, '').toUpperCase();
  if (lbl) lbl.textContent = sym;

  const fmpLive = (typeof fmpGetLive === 'function') ? fmpGetLive(sym) : null;
  const fhLive  = (typeof fhGetLive  === 'function') ? fhGetLive(sym)  : null;
  const r       = fmpLive?.ratios || {};
  const q       = fhLive?.quote  || {};
  const pr      = fhLive?.profile || {};
  const analRaw = fmpLive?.analysts || [];
  const targets = fmpLive?.priceTargets || [];

  // ── Company health bar ──────────────────────────────────────────
  const healthScores = [];
  if (r.roe   != null) healthScores.push(r.roe   > 15 ? 2 : r.roe > 5 ? 1 : 0);
  if (r.netMgn!= null) healthScores.push(r.netMgn > 10 ? 2 : r.netMgn > 0 ? 1 : 0);
  if (r.debtEq!= null) healthScores.push(r.debtEq < 0.5 ? 2 : r.debtEq < 2 ? 1 : 0);
  if (r.currentRatio != null) healthScores.push(r.currentRatio > 1.5 ? 2 : r.currentRatio > 1 ? 1 : 0);
  const healthPct = healthScores.length ? Math.round(healthScores.reduce((a,b)=>a+b,0) / (healthScores.length * 2) * 100) : null;
  const healthLabel = healthPct == null ? '—' : healthPct >= 75 ? 'Excellent' : healthPct >= 50 ? 'Good' : healthPct >= 25 ? 'Fair' : 'Weak';
  const healthColor = healthPct == null ? 'var(--text-muted)' : healthPct >= 75 ? '#3fb950' : healthPct >= 50 ? '#58a6ff' : healthPct >= 25 ? '#d29922' : '#f85149';

  // ── Fair Value ──────────────────────────────────────────────────
  let fairPrice = null, upside = null;
  const price = q.price || null;
  const pt    = targets.length ? targets.reduce((s,t) => s + (t.priceTarget||0), 0) / targets.length : null;
  if (pt && price) { fairPrice = pt; upside = ((pt - price) / price) * 100; }

  const fairLabel = upside == null ? '—' : upside > 15 ? 'Undervalued' : upside < -15 ? 'Overvalued' : 'Fair';
  const fairColor = upside == null ? 'var(--text-muted)' : upside > 15 ? '#3fb950' : upside < -15 ? '#f85149' : '#58a6ff';

  // ── Technical signal (simplified from AV tech cache) ────────────
  let techSignal = '—', techColor = 'var(--text-muted)';
  const _techRsi = (typeof techGetRsi === 'function') ? techGetRsi(sym) : null;
  if (_techRsi != null || (typeof avLiveCache !== 'undefined' && avLiveCache[sym]?.rsi)) {
    const rsi = _techRsi ?? avLiveCache[sym]?.rsi;
    if (rsi < 30)      { techSignal = 'Strong Buy';  techColor = '#3fb950'; }
    else if (rsi < 45) { techSignal = 'Buy';         techColor = '#58a6ff'; }
    else if (rsi > 70) { techSignal = 'Strong Sell'; techColor = '#f85149'; }
    else if (rsi > 55) { techSignal = 'Sell';        techColor = '#f0883e'; }
    else               { techSignal = 'Neutral';     techColor = '#d29922'; }
  }

  // ── Analyst consensus from FMP ──────────────────────────────────
  let buyCount = 0, holdCount = 0, sellCount = 0;
  analRaw.slice(0, 4).forEach(a => {
    buyCount  += (a.analystRatingsStrongBuy || 0) + (a.analystRatingsBuy || 0);
    holdCount += (a.analystRatingsHold || 0);
    sellCount += (a.analystRatingsSell || 0) + (a.analystRatingsStrongSell || 0);
  });
  const totalAnalysts = buyCount + holdCount + sellCount;
  const consensusLabel = totalAnalysts === 0 ? '—' :
    buyCount > holdCount && buyCount > sellCount ? 'Strong Buy' :
    sellCount > buyCount && sellCount > holdCount ? 'Strong Sell' :
    buyCount > sellCount ? 'Buy' : 'Hold';
  const consensusColor = consensusLabel.includes('Buy') ? '#3fb950' : consensusLabel.includes('Sell') ? '#f85149' : '#d29922';
  const avgPT  = pt ? '$' + pt.toFixed(2) : '—';
  const upPct  = upside != null ? (upside >= 0 ? '+' : '') + upside.toFixed(2) + '%' : '—';
  const upClr  = upside != null ? (upside >= 0 ? '#3fb950' : '#f85149') : 'var(--text-muted)';

  el.innerHTML = `
    <div class="sc-card">
      <!-- Header -->
      <div class="sc-header">
        <div class="sc-sym">${escapeHtml(sym)}</div>
        <div class="sc-name">${escapeHtml(pr.name || sym)}</div>
        <div class="sc-price">${price != null ? '$' + price.toFixed(2) : '—'}</div>
        <div class="sc-exchange">${escapeHtml(pr.exchange || '')} · ${escapeHtml(pr.currency || 'USD')}</div>
      </div>

      <!-- Company Health -->
      <div class="sc-section sc-section-border">
        <div class="sc-section-top">
          <span class="sc-section-label">Company's Health</span>
          <span class="sc-section-badge" style="color:${healthColor}">${healthLabel}</span>
        </div>
        ${healthPct != null ? `
        <div class="sc-bar-wrap">
          <div class="sc-bar-track">
            <div class="sc-bar-fill" style="width:${healthPct}%;background:${healthColor}"></div>
          </div>
          <div class="sc-bar-labels"><span>Weak</span><span>Fair</span><span>Good</span><span>Excellent</span></div>
        </div>` : '<div class="sc-nodata">// Add FMP key for health data</div>'}
        ${healthScores.length ? `
        <div class="sc-kpi-row">
          ${r.roe   !=null?`<span class="sc-kpi">ROE <b>${r.roe.toFixed(1)}%</b></span>`:''}
          ${r.netMgn!=null?`<span class="sc-kpi">Net Mgn <b>${r.netMgn.toFixed(1)}%</b></span>`:''}
          ${r.debtEq!=null?`<span class="sc-kpi">D/E <b>${r.debtEq.toFixed(2)}</b></span>`:''}
        </div>` : ''}
      </div>

      <!-- Fair Value -->
      <div class="sc-section sc-section-border">
        <div class="sc-section-top">
          <span class="sc-section-label">Fair Value</span>
          <span class="sc-section-badge" style="color:${fairColor}">${fairLabel}</span>
        </div>
        <div class="sc-fv-row">
          <span class="sc-fv-label">Avg Price Target</span>
          <span class="sc-fv-val">${avgPT}</span>
        </div>
        <div class="sc-fv-row">
          <span class="sc-fv-label">Upside / Downside</span>
          <span class="sc-fv-val" style="color:${upClr}">${upPct}</span>
        </div>
        ${r.pe!=null?`<div class="sc-fv-row"><span class="sc-fv-label">P/E</span><span class="sc-fv-val">${r.pe.toFixed(1)}</span></div>`:''}
        ${r.pb!=null?`<div class="sc-fv-row"><span class="sc-fv-label">P/B</span><span class="sc-fv-val">${r.pb.toFixed(2)}</span></div>`:''}
        ${r.evEbitda!=null?`<div class="sc-fv-row"><span class="sc-fv-label">EV/EBITDA</span><span class="sc-fv-val">${r.evEbitda.toFixed(1)}</span></div>`:''}
      </div>

      <!-- Technical Analysis -->
      <div class="sc-section sc-section-border">
        <div class="sc-section-top">
          <span class="sc-section-label">Technical Analysis <a href="#" onclick="switchTab('fundamentals','tech');return false" style="font-size:9px;color:var(--link)">›</a></span>
          <span class="sc-section-badge" style="color:${techColor}">${techSignal}</span>
        </div>
        <div class="sc-gauge-wrap">
          <svg viewBox="0 0 100 55" class="sc-gauge-svg">
            <path d="M10,50 A40,40 0 0,1 90,50" fill="none" stroke="#f85149" stroke-width="6" stroke-dasharray="50 75"/>
            <path d="M10,50 A40,40 0 0,1 90,50" fill="none" stroke="#d29922" stroke-width="6" stroke-dasharray="25 75" stroke-dashoffset="-50"/>
            <path d="M10,50 A40,40 0 0,1 90,50" fill="none" stroke="#3fb950" stroke-width="6" stroke-dasharray="25 75" stroke-dashoffset="-75"/>
            <text x="50" y="48" text-anchor="middle" fill="${techColor}" font-size="9" font-weight="700">${escapeHtml(techSignal)}</text>
          </svg>
        </div>
      </div>

      <!-- Analyst Sentiment -->
      <div class="sc-section sc-section-border">
        <div class="sc-section-top">
          <span class="sc-section-label">Analysts Sentiment <a href="#" onclick="switchTab('analysts','anr');return false" style="font-size:9px;color:var(--link)">›</a></span>
          <span class="sc-section-badge" style="color:${consensusColor}">${consensusLabel}</span>
        </div>
        ${totalAnalysts > 0 ? `
        <div class="sc-fv-row"><span class="sc-fv-label">Price Target</span><span class="sc-fv-val">${avgPT}</span></div>
        <div class="sc-fv-row"><span class="sc-fv-label">Upside</span><span class="sc-fv-val" style="color:${upClr}">${upPct}</span></div>
        <div class="sc-consensus-pills">
          ${buyCount >0 ? `<span class="sc-pill sc-pill-buy">🐂 Buy ${buyCount}</span>` : ''}
          ${holdCount>0 ? `<span class="sc-pill sc-pill-hold">◆ Hold ${holdCount}</span>` : ''}
          ${sellCount>0 ? `<span class="sc-pill sc-pill-sell">🐻 Sell ${sellCount}</span>` : ''}
        </div>` : '<div class="sc-nodata">// Add FMP key for analyst data</div>'}
      </div>

      <!-- Pro Tips -->
      <div class="sc-section">
        <div class="sc-section-top">
          <span class="sc-section-label">ProTips</span>
          <a href="#" onclick="switchTab('analysts','val');renderValuation(currentTicker);return false" style="font-size:9px;color:var(--link)">All Tips ›</a>
        </div>
        <div class="sc-protip">
          ${r.roe!=null && r.roe > 15 ? '✅ High ROE — strong capital efficiency' :
            r.roe!=null && r.roe < 0  ? '⚠️ Negative ROE — watch profitability' : ''}
          ${r.netMgn!=null && r.netMgn > 20 ? '<br>✅ Wide net margin — pricing power' : ''}
          ${r.debtEq!=null && r.debtEq > 2  ? '<br>⚠️ High leverage — debt risk' : ''}
          ${upside != null && upside > 20 ? '<br>✅ Analysts see significant upside' : ''}
          ${upside != null && upside < -15 ? '<br>⚠️ Analysts see downside risk' : ''}
          ${!r.roe && !r.netMgn ? '// Add FMP key for ProTips' : ''}
        </div>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════
   TASK 5 — COMPARABLES single view (peer list + expandable detail)
   ══════════════════════════════════════════════════════════════════ */
let _compExpandedSym = null;

async function loadComparables(sym) {
  const el = document.getElementById('comp-main');
  if (!el) return;
  const lbl = document.getElementById('compLabel');
  if (lbl) lbl.textContent = sym;

  el.innerHTML = '<div class="av-loading"><span class="av-spinner"></span>Loading peers…</div>';

  // Get peers via FMP
  let peers = [];
  const key = (typeof getFmpKey === 'function') ? getFmpKey() : '';
  if (key) {
    try {
      const res  = await fetch(`https://financialmodelingprep.com/api/v4/stock_peers?symbol=${sym}&apikey=${key}`);
      const json = await res.json();
      peers = json?.[0]?.peersList ?? [];
    } catch {}
  }

  // Also check Finnhub peers
  if (!peers.length && typeof fhGetLive === 'function') {
    peers = fhGetLive(sym)?.peers || [];
  }

  const allSyms  = [sym, ...peers.slice(0, 9)];
  let quotes = {};
  if (key && allSyms.length) {
    try {
      const res = await fetch(`https://financialmodelingprep.com/api/v3/quote/${allSyms.join(',')}?apikey=${key}`);
      const arr = await res.json();
      (arr||[]).forEach(q => { if(q.symbol) quotes[q.symbol.toUpperCase()] = q; });
    } catch {}
  }

  el.innerHTML = `
    <div class="comp-peers-header">
      <span class="comp-peers-title">${escapeHtml(sym)} vs Sector Peers</span>
      <span class="comp-peers-hint">Click a row to expand details</span>
    </div>
    <div class="comp-peers-list" id="comp-peers-list">
      ${allSyms.map((s, i) => {
        const q   = quotes[s.toUpperCase()];
        const chg = q?.changesPercentage ?? null;
        const isCurrent = s === sym;
        return `<div class="comp-peer-row ${isCurrent?'comp-peer-current':''}"
                     onclick="compExpandPeer('${escapeHtml(s)}')"
                     data-sym="${escapeHtml(s)}">
          <div class="comp-peer-rank">${i + 1}</div>
          <div class="comp-peer-info">
            <span class="comp-peer-sym">${escapeHtml(s)}</span>
            <span class="comp-peer-name">${escapeHtml((q?.name||'').slice(0,22))}</span>
          </div>
          <div class="comp-peer-nums">
            <span class="comp-peer-price">${q?.price!=null?'$'+q.price.toFixed(2):'—'}</span>
            <span class="comp-peer-chg ${chg!=null?(chg>=0?'pos':'neg'):''}">${chg!=null?(chg>=0?'+':'')+chg.toFixed(2)+'%':'—'}</span>
          </div>
          <div class="comp-peer-mktcap">${q?.marketCap!=null?_compFmt(q.marketCap):'—'}</div>
          <div class="comp-peer-expand-icon">▶</div>
        </div>
        <div class="comp-peer-detail hidden" id="comp-detail-${escapeHtml(s)}"></div>`;
      }).join('')}
    </div>`;
}

function _compFmt(n) {
  if (n >= 1e12) return (n/1e12).toFixed(1)+'T';
  if (n >= 1e9)  return (n/1e9).toFixed(1)+'B';
  if (n >= 1e6)  return (n/1e6).toFixed(1)+'M';
  return n;
}

async function compExpandPeer(sym) {
  const detailEl = document.getElementById(`comp-detail-${sym}`);
  const rowEl    = document.querySelector(`.comp-peer-row[data-sym="${sym}"]`);
  if (!detailEl || !rowEl) return;

  const isOpen = !detailEl.classList.contains('hidden');
  // Close all
  document.querySelectorAll('.comp-peer-detail').forEach(d => d.classList.add('hidden'));
  document.querySelectorAll('.comp-peer-row').forEach(r => r.classList.remove('comp-peer-open'));
  document.querySelectorAll('.comp-peer-expand-icon').forEach(i => i.textContent = '▶');

  if (isOpen) return; // toggle close

  rowEl.classList.add('comp-peer-open');
  rowEl.querySelector('.comp-peer-expand-icon').textContent = '▼';
  detailEl.classList.remove('hidden');
  detailEl.innerHTML = '<div class="av-loading"><span class="av-spinner"></span>Loading…</div>';

  const key = (typeof getFmpKey === 'function') ? getFmpKey() : '';
  if (!key) {
    detailEl.innerHTML = '<div class="sc-nodata">// Add FMP key for peer detail.</div>';
    return;
  }

  try {
    const [profileRes, ratioRes] = await Promise.all([
      fetch(`https://financialmodelingprep.com/api/v3/profile/${sym}?apikey=${key}`),
      fetch(`https://financialmodelingprep.com/api/v3/ratios-ttm/${sym}?apikey=${key}`),
    ]);
    const profiles = await profileRes.json();
    const ratios   = await ratioRes.json();
    const p = profiles?.[0] || {};
    const r = ratios?.[0]   || {};

    const kpi = (l, v) => v != null ? `<div class="comp-detail-kpi"><span>${escapeHtml(l)}</span><strong>${escapeHtml(String(v))}</strong></div>` : '';

    detailEl.innerHTML = `
      <div class="comp-detail-inner">
        <div class="comp-detail-header">
          <div>
            <span class="comp-detail-sym">${escapeHtml(sym)}</span>
            <span class="comp-detail-name">${escapeHtml(p.companyName||'')}</span>
          </div>
          <button class="comp-detail-load-btn" onclick="event.stopPropagation();changeTicker('${escapeHtml(sym)}')">▶ Load Chart</button>
        </div>
        <div class="comp-detail-desc">${escapeHtml((p.description||'').slice(0,180))}${p.description?.length>180?'…':''}</div>
        <div class="comp-detail-kpis">
          ${kpi('Price',    p.price  !=null?'$'+p.price.toFixed(2):null)}
          ${kpi('Mkt Cap',  p.mktCap !=null?_compFmt(p.mktCap):null)}
          ${kpi('Sector',   p.sector||null)}
          ${kpi('Industry', p.industry||null)}
          ${kpi('P/E',      r.peRatioTTM?.toFixed(1))}
          ${kpi('P/B',      r.priceToBookRatioTTM?.toFixed(2))}
          ${kpi('EV/EBITDA',r.enterpriseValueMultipleTTM?.toFixed(1))}
          ${kpi('ROE',      r.returnOnEquityTTM!=null?((r.returnOnEquityTTM*100).toFixed(1)+'%'):null)}
          ${kpi('Net Mgn',  r.netProfitMarginTTM!=null?((r.netProfitMarginTTM*100).toFixed(1)+'%'):null)}
          ${kpi('D/E',      r.debtEquityRatioTTM?.toFixed(2))}
          ${kpi('Beta',     p.beta?.toFixed(2))}
          ${kpi('52W Range',p.range||null)}
        </div>
        <div class="comp-detail-links">
          <a href="${escapeHtml(p.website||'#')}" target="_blank" class="geo-wm-link">${escapeHtml(p.website||'—')}</a>
          · ${escapeHtml(p.exchangeShortName||'')} · ${escapeHtml(p.country||'')}
        </div>
      </div>`;
  } catch {
    detailEl.innerHTML = '<div class="sc-nodata">// Could not load peer details.</div>';
  }
}

/* ══════════════════════════════════════════════════════════════════
   TASK 6 — WEBHOOK / PRICE ALERTS
   ══════════════════════════════════════════════════════════════════ */
let whAlerts = JSON.parse(localStorage.getItem('finterm_wh_alerts') || '[]');
let whLog    = [];
let _whIntervalId = null;

function whSaveAlerts() {
  try { localStorage.setItem('finterm_wh_alerts', JSON.stringify(whAlerts)); } catch {}
}

function whRenderAlerts() {
  const el = document.getElementById('wh-alerts-list');
  if (!el) return;
  const badge = document.getElementById('webhook-active-badge');
  const active = whAlerts.filter(a => a.active).length;
  if (badge) badge.textContent = `${active} ACTIVE`;

  if (!whAlerts.length) {
    el.innerHTML = '<div class="no-data">// No alerts configured.<br>// Use the BUILDER tab to add one.</div>';
    return;
  }

  el.innerHTML = whAlerts.map((a, i) => `
    <div class="wh-alert-row ${a.active?'wh-alert-active':'wh-alert-paused'}">
      <div class="wh-alert-main">
        <span class="wh-alert-sym">${escapeHtml(a.ticker)}</span>
        <span class="wh-alert-cond">${escapeHtml(whCondLabel(a.condition))} ${escapeHtml(String(a.value))}</span>
        <span class="wh-alert-interval">${escapeHtml(a.interval)}</span>
        ${a.note ? `<span class="wh-alert-note">${escapeHtml(a.note)}</span>` : ''}
      </div>
      <div class="wh-alert-actions">
        <button class="wh-act-btn" title="${a.active?'Pause':'Resume'}" onclick="whToggleAlert(${i})">${a.active?'⏸':'▶'}</button>
        <button class="wh-act-btn" title="Edit" onclick="whEditAlert(${i})">✏</button>
        <button class="wh-act-btn wh-act-delete" title="Delete" onclick="whDeleteAlert(${i})">✕</button>
      </div>
    </div>`).join('');
}

function whCondLabel(c) {
  const MAP = {
    price_above:'Price >', price_below:'Price <',
    pct_change_up:'Chg% >', pct_change_down:'Chg% <',
    volume_spike:'Vol Spike ×',
    cross_above:'Crosses >', cross_below:'Crosses <',
    ohlcv_open_above:'Open >', ohlcv_high_above:'High >',
    ohlcv_low_below:'Low <', ohlcv_close_above:'Close >',
    ohlcv_volume_above:'Vol >',
  };
  return MAP[c] || c;
}

function whSaveAlert() {
  const status = document.getElementById('wh-form-status');
  const ticker    = document.getElementById('wh-ticker')?.value.trim().toUpperCase();
  const condition = document.getElementById('wh-condition')?.value;
  const value     = parseFloat(document.getElementById('wh-value')?.value);
  const interval  = document.getElementById('wh-interval')?.value;
  const url       = document.getElementById('wh-url')?.value.trim();
  const payload   = document.getElementById('wh-payload')?.value.trim();
  const note      = document.getElementById('wh-note')?.value.trim();

  if (!ticker)           { _whStatus('error', 'Ticker required'); return; }
  if (isNaN(value))      { _whStatus('error', 'Value must be a number'); return; }
  if (!condition)        { _whStatus('error', 'Select a condition'); return; }

  // Validate payload JSON if provided
  if (payload) {
    try { JSON.parse(payload); } catch { _whStatus('error', 'Payload is not valid JSON'); return; }
  }

  const alert = { id: Date.now(), ticker, condition, value, interval, url, payload, note, active: true, triggered: false };
  whAlerts.unshift(alert);
  whSaveAlerts();
  whRenderAlerts();
  _whStatus('ok', `✅ Alert saved for ${ticker}`);
  switchTab('webhooks', 'wh-alerts');
}

function _whStatus(type, msg) {
  const el = document.getElementById('wh-form-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'wh-status ' + (type === 'ok' ? 'wh-status-ok' : 'wh-status-err');
  setTimeout(() => { if (el) el.textContent = ''; }, 4000);
}

function whToggleAlert(i) {
  if (!whAlerts[i]) return;
  whAlerts[i].active = !whAlerts[i].active;
  whSaveAlerts(); whRenderAlerts();
}

function whDeleteAlert(i) {
  whAlerts.splice(i, 1);
  whSaveAlerts(); whRenderAlerts();
}

function whEditAlert(i) {
  const a = whAlerts[i];
  if (!a) return;
  document.getElementById('wh-ticker').value    = a.ticker;
  document.getElementById('wh-condition').value = a.condition;
  document.getElementById('wh-value').value     = a.value;
  document.getElementById('wh-interval').value  = a.interval;
  document.getElementById('wh-url').value       = a.url || '';
  document.getElementById('wh-payload').value   = a.payload || '';
  document.getElementById('wh-note').value      = a.note || '';
  whAlerts.splice(i, 1);
  whSaveAlerts();
  switchTab('webhooks', 'wh-builder');
}

function whAddAlert() {
  showPanel('webhooks');
  switchTab('webhooks', 'wh-builder');
  const key = (typeof getFmpKey === 'function') ? getFmpKey() : '';
  // Pre-fill ticker
  const t = document.getElementById('wh-ticker');
  if (t && currentTicker) t.value = currentTicker.replace(/.*:/, '');
}

async function whTestFire() {
  const url     = document.getElementById('wh-url')?.value.trim();
  const ticker  = document.getElementById('wh-ticker')?.value.trim() || 'TEST';
  const payload = document.getElementById('wh-payload')?.value.trim();

  if (!url) { _whStatus('error', 'Enter a webhook URL first'); return; }

  let body = payload || JSON.stringify({ ticker, event: 'test', message: `FINTERM test fire for ${ticker}`, timestamp: new Date().toISOString() });
  // Replace template vars
  body = body.replace(/\{\{ticker\}\}/g, ticker).replace(/\{\{price\}\}/g, '—').replace(/\{\{value\}\}/g, '—').replace(/\{\{time\}\}/g, new Date().toISOString());

  _whStatus('ok', '📤 Sending…');
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    _whStatus('ok', `✅ Sent! HTTP ${res.status}`);
    _whLog(ticker, 'test', '—', url, res.status);
  } catch (e) {
    _whStatus('error', `❌ Failed: ${e.message}`);
  }
}

function _whLog(ticker, condition, value, url, status) {
  const el = document.getElementById('wh-log-list');
  const entry = { time: new Date().toLocaleTimeString(), ticker, condition, value, url: url?.slice(0,40)+'…', status };
  whLog.unshift(entry);
  if (!el) return;
  if (el.querySelector('.no-data')) el.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'wh-log-row';
  row.innerHTML = `<span class="wh-log-time">${entry.time}</span><span class="wh-log-sym">${escapeHtml(ticker)}</span><span class="wh-log-cond">${escapeHtml(condition)} ${escapeHtml(String(value))}</span><span class="wh-log-status ${status===200||status==='test'?'wh-status-ok':'wh-status-err'}">${status}</span>`;
  el.prepend(row);
}

// Polling check every 60s for active alerts (uses FMP/Finnhub live cache)
function whStartPolling() {
  if (_whIntervalId) return;
  _whIntervalId = setInterval(async () => {
    const active = whAlerts.filter(a => a.active && !a.triggered);
    for (const a of active) {
      const sym = a.ticker.toUpperCase();
      const q   = (typeof fhGetLive === 'function' ? fhGetLive(sym) : null)?.quote;
      const p   = q?.price;
      if (p == null) continue;
      let fired = false;
      if (a.condition === 'price_above'      && p > a.value)         fired = true;
      if (a.condition === 'price_below'      && p < a.value)         fired = true;
      if (a.condition === 'pct_change_up'    && (q.changePercent||0) > a.value) fired = true;
      if (a.condition === 'pct_change_down'  && (q.changePercent||0) < -a.value) fired = true;
      if (a.condition === 'ohlcv_close_above'&& p > a.value)         fired = true;
      if (!fired) continue;
      a.triggered = true; whSaveAlerts();
      // Fire webhook
      if (a.url) {
        const body = (a.payload || JSON.stringify({ ticker: sym, condition: a.condition, value: a.value, price: p, time: new Date().toISOString() }))
          .replace(/\{\{ticker\}\}/g, sym).replace(/\{\{price\}\}/g, p).replace(/\{\{value\}\}/g, a.value).replace(/\{\{time\}\}/g, new Date().toISOString());
        try {
          const res = await fetch(a.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
          _whLog(sym, a.condition, a.value, a.url, res.status);
        } catch (e) { _whLog(sym, a.condition, a.value, a.url, 'ERR'); }
      }
      // Toast notification
    }
    whRenderAlerts();
  }, 60000);
}

/* ══════════════════════════════════════════════════════════════════
   TASK 7 — LEFT SIDEBAR LAYOUT MANAGER
   ══════════════════════════════════════════════════════════════════ */
const PANEL_META = {
  chart:         { label:'Chart',        icon:'📈' },
  fundamentals:  { label:'Fundamentals', icon:'📊' },
  news:          { label:'News',         icon:'📰' },
  analysts:      { label:'Analysts',     icon:'🔬' },
  ownership:     { label:'Ownership',    icon:'🏛'  },
  comparables:   { label:'Comparables',  icon:'⚖️'  },
  notes:         { label:'Notes',        icon:'📝' },
  watchlist:     { label:'Watchlist',    icon:'👁'  },
  geopolitical:  { label:'Geo·Risk',     icon:'🌍' },
  supply:        { label:'Supply·Chain', icon:'⛓'  },
  alert:         { label:'Alert·Feed',   icon:'⚡' },
  macro:         { label:'Macro·Intel',  icon:'📡' },
  webhooks:      { label:'Webhooks',     icon:'🔔' },
  portfolio:     { label:'Portfolio',    icon:'💼' },
  screener:      { label:'Screener',     icon:'🔍' },
};

function initLayoutSidebar() {
  const list = document.getElementById('lsbPanelList');
  if (!list) return;
  list.innerHTML = Object.entries(PANEL_META).map(([id, m]) => {
    const panel   = document.getElementById(`panel-${id}`);
    const visible = panel && !panel.classList.contains('hidden');
    return `<label class="lsb-panel-item">
      <input type="checkbox" class="lsb-panel-cb" data-panel="${id}" ${visible?'checked':''}
             onchange="lsbTogglePanel('${id}',this.checked)">
      <span class="lsb-panel-icon">${m.icon}</span>
      <span class="lsb-panel-label">${m.label}</span>
    </label>`;
  }).join('');
}

function lsbTogglePanel(id, on) {
  on ? showPanel(id) : hidePanel(id);
  // sync topbar checkboxes
  document.querySelectorAll(`.panel-toggle[data-panel="${id}"]`).forEach(cb => cb.checked = on);
}

function toggleLayoutSidebar() {
  const sb  = document.getElementById('layoutSidebar');
  const btn = document.getElementById('layoutSidebarToggle');
  if (!sb) return;
  sb.classList.toggle('collapsed');
  document.body.classList.toggle('sidebar-open', !sb.classList.contains('collapsed'));
  if (btn) btn.querySelector('.lsb-toggle-icon').textContent = sb.classList.contains('collapsed') ? '◧' : '◨';
}

const LAYOUT_PRESETS = {
  focus: {
    show: ['chart','fundamentals','news','analysts'],
    hide: ['ownership','comparables','notes','watchlist','geopolitical','supply','alert','macro','intel','webhooks'],
  },
  grid: {
    show: ['chart','fundamentals','news','analysts','ownership','comparables','watchlist','macro'],
    hide: ['notes','geopolitical','supply','alert','intel','webhooks'],
  },
  research: {
    show: ['fundamentals','analysts','comparables','ownership','watchlist','news'],
    hide: ['chart','notes','geopolitical','supply','alert','macro','intel','webhooks'],
  },
  monitor: {
    show: ['geopolitical','intel','macro','alert','supply','news'],
    hide: ['chart','fundamentals','analysts','ownership','comparables','notes','watchlist','webhooks'],
  },
  trading: {
    show: ['chart','watchlist','analysts','webhooks','news','fundamentals'],
    hide: ['ownership','comparables','notes','geopolitical','supply','alert','macro','intel'],
  },
};

function applyLayoutPreset(name) {
  const preset = LAYOUT_PRESETS[name];
  if (!preset) return;

  preset.show.forEach(id => { showPanel(id); document.querySelectorAll(`.panel-toggle[data-panel="${id}"],.lsb-panel-cb[data-panel="${id}"]`).forEach(c=>c.checked=true); });
  preset.hide.forEach(id => { hidePanel(id); document.querySelectorAll(`.panel-toggle[data-panel="${id}"],.lsb-panel-cb[data-panel="${id}"]`).forEach(c=>c.checked=false); });

  // Re-compute layout for visible panels
  setTimeout(() => { computeDefaultLayout(); Object.keys(panelLayout).forEach(applyPanelPosition); }, 50);
  // Highlight active preset button
  document.querySelectorAll('.lsb-preset-btn').forEach(b => b.classList.remove('lsb-preset-active'));
  document.querySelectorAll(`.lsb-preset-btn`).forEach(b => { if (b.textContent.toLowerCase().includes(name.slice(0,4))) b.classList.add('lsb-preset-active'); });
}

function tileAllPanels() {
  const canvas  = document.getElementById('dashboardCanvas');
  if (!canvas) return;
  const W = canvas.clientWidth, H = canvas.clientHeight, G = 6;
  const visible = [...document.querySelectorAll('.panel:not(.hidden)')];
  if (!visible.length) return;
  const cols = Math.ceil(Math.sqrt(visible.length));
  const rows = Math.ceil(visible.length / cols);
  const pw   = Math.floor((W - G * (cols + 1)) / cols);
  const ph   = Math.floor((H - G * (rows + 1)) / rows);
  const minY = getTopbarGuard();
  visible.forEach((p, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = G + col * (pw + G);
    const y = Math.max(minY, G + row * (ph + G));
    Object.assign(p.style, { left: x+'px', top: y+'px', width: pw+'px', height: ph+'px' });
    const id = p.dataset.panel;
    if (id && panelLayout[id]) Object.assign(panelLayout[id], { x, y: y - minY, w: pw, h: ph });
  });
}

function cascadePanels() {
  const minY  = getTopbarGuard();
  const visible = [...document.querySelectorAll('.panel:not(.hidden)')];
  visible.forEach((p, i) => {
    const x = 30 + i * 24, y = Math.max(minY, minY + i * 24);
    Object.assign(p.style, { left: x+'px', top: y+'px' });
    bringToFront(p);
  });
}

function resetLayout() {
  computeDefaultLayout(); Object.keys(panelLayout).forEach(applyPanelPosition);
}

function hideAllPanels() {
  document.querySelectorAll('.panel').forEach(p => hidePanel(p.dataset.panel));
  document.querySelectorAll('.panel-toggle,.lsb-panel-cb').forEach(cb => cb.checked = false);
}

// Keep sidebar panel checkboxes in sync when topbar toggles change
/* Refresh stale DB and sectorDB prices on load */
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    refreshDBPrices();
    refreshSectorDBPrices();
  }, 2000); // After API keys are loaded from localStorage
});

document.addEventListener('change', e => {
  if (e.target.classList.contains('panel-toggle')) {
    const id = e.target.dataset.panel;
    document.querySelectorAll(`.lsb-panel-cb[data-panel="${id}"]`).forEach(cb => cb.checked = e.target.checked);
  }
});
