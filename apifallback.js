/* ══════════════════════════════════════════════════════════════════
   FINTERM — apifallback.js
   Multi-provider API fallback orchestrator

   New providers:  Tiingo · Polygon · Marketstack · Stooq · Yahoo Direct
   Bridged:        Finnhub (finnhub.js) · Twelve Data (secdera.js)
                   SEC EDGAR (secdera.js)

   Fallback chains by data type:
     Quote:        Finnhub → Twelve Data → Polygon → Yahoo Direct → Stooq → Marketstack
     Fundamentals: Finnhub → Tiingo → Yahoo Direct → SEC EDGAR
     Financials:   Finnhub → Yahoo Direct → Tiingo → SEC EDGAR
     News:         Finnhub → Tiingo → Yahoo Direct
     Analysts:     Finnhub → Yahoo Direct → SEC EDGAR
     History:      Twelve Data → Polygon → Marketstack → Stooq
   ══════════════════════════════════════════════════════════════════ */

(function () {
"use strict";

/* ════════════════════════════════════════════════════════════════
   RATE LIMIT MANAGER
   Per-minute: in-memory sliding window (timestamps array).
   Per-day:    localStorage keyed by YYYY-MM-DD.
   Per-month:  localStorage keyed by YYYY-MM.
   ════════════════════════════════════════════════════════════════ */
const _RL = (() => {
  const _min = {};

  function _today()  { return new Date().toISOString().slice(0, 10); }
  function _month()  { return new Date().toISOString().slice(0, 7);  }
  function _lsGet(k) { return parseInt(localStorage.getItem(k) || "0"); }
  function _lsSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (_) {} }

  const LIMITS = {
    finnhub:      { perMin: 60,   perDay: null, perMonth: null  },
    twelvedata:   { perMin: null, perDay: 800,  perMonth: null  },
    tiingo:       { perMin: null, perDay: 500,  perMonth: null  },
    polygon:      { perMin: 5,    perDay: null, perMonth: null  },
    marketstack:  { perMin: null, perDay: null, perMonth: 1000  },
    yahoo_direct: { perMin: null, perDay: 1500, perMonth: null  },
    stooq:        { perMin: null, perDay: null, perMonth: null  },
    sec_edgar:    { perMin: 10,   perDay: null, perMonth: null  },
  };

  return {
    LIMITS,

    getMinuteUsed(id) {
      const cutoff = Date.now() - 60000;
      const arr = (_min[id] || []).filter(t => t > cutoff);
      _min[id] = arr;
      return arr.length;
    },

    getDayUsed(id)   { return _lsGet("fb_day_" + id + "_" + _today()); },
    getMonthUsed(id) { return _lsGet("fb_mo_"  + id + "_" + _month()); },

    canCall(id) {
      const lim = LIMITS[id];
      if (!lim) return true;
      if (lim.perMin   != null && this.getMinuteUsed(id) >= lim.perMin)   return false;
      if (lim.perDay   != null && this.getDayUsed(id)    >= lim.perDay)   return false;
      if (lim.perMonth != null && this.getMonthUsed(id)  >= lim.perMonth) return false;
      return true;
    },

    bump(id) {
      const lim = LIMITS[id];
      if (!lim) return;
      if (lim.perMin != null) {
        if (!_min[id]) _min[id] = [];
        _min[id].push(Date.now());
      }
      if (lim.perDay != null) {
        const k = "fb_day_" + id + "_" + _today();
        _lsSet(k, _lsGet(k) + 1);
      }
      if (lim.perMonth != null) {
        const k = "fb_mo_" + id + "_" + _month();
        _lsSet(k, _lsGet(k) + 1);
      }
    },

    status(id) {
      const lim = LIMITS[id] || {};
      return {
        ok:        this.canCall(id),
        minUsed:   lim.perMin   != null ? this.getMinuteUsed(id) : null,
        dayUsed:   lim.perDay   != null ? this.getDayUsed(id)    : null,
        monthUsed: lim.perMonth != null ? this.getMonthUsed(id)  : null,
        limits:    lim,
      };
    },
  };
})();


/* ════════════════════════════════════════════════════════════════
   IN-MEMORY CACHE
   ════════════════════════════════════════════════════════════════ */
const _CACHE = {};
const _TTL = {
  quote:        2  * 60 * 1000,
  news:         10 * 60 * 1000,
  fundamentals: 60 * 60 * 1000,
  financials:   60 * 60 * 1000,
  analysts:     30 * 60 * 1000,
};

function _cGet(type, key) {
  const e = _CACHE[type + ":" + key];
  if (!e) return null;
  return (Date.now() - e.ts < (_TTL[type] || 300000)) ? e.data : null;
}
function _cSet(type, key, data) {
  _CACHE[type + ":" + key] = { data, ts: Date.now() };
}


/* ════════════════════════════════════════════════════════════════
   KEY HELPER
   ════════════════════════════════════════════════════════════════ */
function _fbKey(id) {
  return (window._KEYS && window._KEYS[id]) ||
         localStorage.getItem("finterm_key_" + id) || "";
}


/* ════════════════════════════════════════════════════════════════
   CORE FETCH  (rate-limit guard + bump + 8s timeout)
   ════════════════════════════════════════════════════════════════ */
async function _fbFetch(providerId, url, opts) {
  opts = opts || {};
  if (!_RL.canCall(providerId)) {
    console.warn("[FB] " + providerId + " rate limit reached — skipping");
    return null;
  }
  _RL.bump(providerId);
  try {
    const r = await fetch(url, Object.assign({ signal: AbortSignal.timeout(8000) }, opts));
    if (!r.ok) {
      if (r.status === 429) console.warn("[FB] " + providerId + " HTTP 429");
      return null;
    }
    return await r.json();
  } catch (e) {
    console.warn("[FB/" + providerId + "]", e.message);
    return null;
  }
}


/* ════════════════════════════════════════════════════════════════
   TIINGO  (500 req/day · key required)
   https://api.tiingo.com/
   ════════════════════════════════════════════════════════════════ */
async function _tiingoFetch(path, params) {
  params = params || {};
  const key = _fbKey("tiingo");
  if (!key) return null;
  const url = new URL("https://api.tiingo.com" + path);
  url.searchParams.set("token", key);
  Object.entries(params).forEach(function(kv) { url.searchParams.set(kv[0], kv[1]); });
  return _fbFetch("tiingo", url.toString(), { headers: { "Content-Type": "application/json" } });
}

async function tiingoGetQuote(sym) {
  const d = await _tiingoFetch("/tiingo/daily/" + sym.toUpperCase() + "/prices", { resampleFreq: "daily" });
  if (!Array.isArray(d) || !d.length) return null;
  const q = d[0];
  return { price: q.close != null ? q.close : q.adjClose, open: q.open, high: q.high, low: q.low, volume: q.volume, date: q.date, _source: "tiingo" };
}

async function tiingoGetNews(sym) {
  const d = await _tiingoFetch("/tiingo/news", { tickers: sym.toUpperCase(), limit: "10" });
  if (!Array.isArray(d)) return null;
  return d.map(function(n) {
    return { title: n.title, summary: n.description, url: n.url, publishedAt: n.publishedDate, source: n.source, _source: "tiingo" };
  });
}

async function tiingoGetFundamentals(sym) {
  const d = await _tiingoFetch("/tiingo/fundamentals/" + sym.toUpperCase() + "/daily");
  if (!Array.isArray(d) || !d.length) return null;
  const r = d[0];
  return { marketCap: r.marketCap, peRatio: r.peRatio, pbRatio: r.pbRatio, dividendYield: r.dividendYield, eps: r.eps, _source: "tiingo" };
}


/* ════════════════════════════════════════════════════════════════
   POLYGON.IO  (5 req/min · key required)
   https://api.polygon.io/
   ════════════════════════════════════════════════════════════════ */
async function _polygonFetch(path, params) {
  params = params || {};
  const key = _fbKey("polygon");
  if (!key) return null;
  const url = new URL("https://api.polygon.io" + path);
  url.searchParams.set("apiKey", key);
  Object.entries(params).forEach(function(kv) { url.searchParams.set(kv[0], kv[1]); });
  return _fbFetch("polygon", url.toString());
}

async function polygonGetQuote(sym) {
  const d = await _polygonFetch("/v2/last/trade/" + sym.toUpperCase());
  if (!d || !d.results) return null;
  const r = d.results;
  return { price: r.p, size: r.s, timestamp: r.t, _source: "polygon" };
}

async function polygonGetAggregates(sym, from, to) {
  const d = await _polygonFetch("/v2/aggs/ticker/" + sym.toUpperCase() + "/range/1/day/" + from + "/" + to, {
    adjusted: "true", sort: "asc", limit: "120",
  });
  if (!d || !d.results) return null;
  return d.results.map(function(b) {
    return { date: new Date(b.t).toISOString().slice(0, 10), open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v, _source: "polygon" };
  });
}


/* ════════════════════════════════════════════════════════════════
   MARKETSTACK  (1000 req/month · key required)
   https://api.marketstack.com/v1/
   ════════════════════════════════════════════════════════════════ */
async function _marketstackFetch(path, params) {
  params = params || {};
  const key = _fbKey("marketstack");
  if (!key) return null;
  const url = new URL("https://api.marketstack.com/v1" + path);
  url.searchParams.set("access_key", key);
  Object.entries(params).forEach(function(kv) { url.searchParams.set(kv[0], kv[1]); });
  return _fbFetch("marketstack", url.toString());
}

async function marketstackGetEOD(sym) {
  const d = await _marketstackFetch("/eod/latest", { symbols: sym.toUpperCase(), limit: "1" });
  if (!d || !d.data || !d.data.length) return null;
  const r = d.data[0];
  return { price: r.close, open: r.open, high: r.high, low: r.low, volume: r.volume, date: r.date, _source: "marketstack" };
}

async function marketstackGetHistory(sym, dateFrom) {
  const d = await _marketstackFetch("/eod", { symbols: sym.toUpperCase(), date_from: dateFrom, limit: "100", sort: "DESC" });
  if (!d || !d.data) return null;
  return d.data.map(function(r) {
    return { date: r.date ? r.date.slice(0, 10) : null, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume, _source: "marketstack" };
  });
}


/* ════════════════════════════════════════════════════════════════
   TWELVE DATA  (800 req/day · key required)
   Expands coverage beyond secdera.js (dividends/splits only)
   ════════════════════════════════════════════════════════════════ */
async function _tdFetch(path, params) {
  params = params || {};
  const key = _fbKey("twelvedata");
  if (!key) return null;
  const url = new URL("https://api.twelvedata.com" + path);
  url.searchParams.set("apikey", key);
  Object.entries(params).forEach(function(kv) { url.searchParams.set(kv[0], kv[1]); });
  return _fbFetch("twelvedata", url.toString());
}

async function twelvedataGetQuote(sym) {
  const d = await _tdFetch("/price", { symbol: sym.toUpperCase() });
  if (!d || !d.price) return null;
  return { price: parseFloat(d.price), _source: "twelvedata" };
}

async function twelvedataGetEOD(sym) {
  const d = await _tdFetch("/eod", { symbol: sym.toUpperCase() });
  if (!d || !d.close) return null;
  return { price: parseFloat(d.close), open: parseFloat(d.open), high: parseFloat(d.high), low: parseFloat(d.low), volume: parseInt(d.volume || "0"), date: d.datetime, _source: "twelvedata" };
}

async function twelvedataGetTimeSeries(sym, interval, outputsize) {
  interval = interval || "1day";
  outputsize = outputsize || 90;
  const d = await _tdFetch("/time_series", { symbol: sym.toUpperCase(), interval: interval, outputsize: String(outputsize) });
  if (!d || !d.values) return null;
  return d.values.map(function(v) {
    return { date: v.datetime, open: parseFloat(v.open), high: parseFloat(v.high), low: parseFloat(v.low), close: parseFloat(v.close), volume: parseInt(v.volume || "0"), _source: "twelvedata" };
  });
}


/* ════════════════════════════════════════════════════════════════
   STOOQ  (no key · unlimited · CSV via CORS proxy)
   ════════════════════════════════════════════════════════════════ */
function _stooqSym(sym) {
  const s = sym.toUpperCase();
  if (s.indexOf(":") !== -1) {
    const parts = s.split(":");
    const ex = parts[0], tk = parts[1];
    const exMap = { MIL: "it", XETRA: "de", LSE: "uk", TSX: "ca" };
    return (tk + "." + (exMap[ex] || "us")).toLowerCase();
  }
  return (s + ".us").toLowerCase();
}

async function _stooqCsv(csvUrl) {
  if (!_RL.canCall("stooq")) return null;
  _RL.bump("stooq");
  const proxy = "https://api.allorigins.win/raw?url=" + encodeURIComponent(csvUrl);
  try {
    const r = await fetch(proxy, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const text = await r.text();
    if (!text || text.startsWith("No data") || text.indexOf("<html") !== -1) return null;
    return text;
  } catch (e) {
    console.warn("[FB/Stooq]", e.message);
    return null;
  }
}

async function stooqGetEOD(sym) {
  const text = await _stooqCsv("https://stooq.com/q/d/l/?s=" + _stooqSym(sym) + "&i=d");
  if (!text) return null;
  const lines = text.trim().split("\n");
  if (lines.length < 2) return null;
  const cols = lines[lines.length - 1].split(",");
  if (cols.length < 5) return null;
  return { date: cols[0], open: parseFloat(cols[1]), high: parseFloat(cols[2]), low: parseFloat(cols[3]), price: parseFloat(cols[4]), volume: parseInt(cols[5] || "0"), _source: "stooq" };
}

async function stooqGetHistory(sym, days) {
  days = days || 90;
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
  const text = await _stooqCsv("https://stooq.com/q/d/l/?s=" + _stooqSym(sym) + "&d1=" + from + "&i=d");
  if (!text) return null;
  return text.trim().split("\n").slice(1).filter(function(l) { return l.trim(); }).map(function(l) {
    const p = l.split(",");
    return { date: p[0], open: parseFloat(p[1]), high: parseFloat(p[2]), low: parseFloat(p[3]), close: parseFloat(p[4]), volume: parseInt(p[5] || "0"), _source: "stooq" };
  }).filter(function(r) { return !isNaN(r.close); });
}


/* ════════════════════════════════════════════════════════════════
   YAHOO FINANCE DIRECT  (unofficial · ~1500/day est. · no key)
   Note: CORS may block some endpoints in browser context.
   ════════════════════════════════════════════════════════════════ */
async function _ydFetch(path) {
  if (!_RL.canCall("yahoo_direct")) return null;
  _RL.bump("yahoo_direct");
  try {
    const r = await fetch("https://query1.finance.yahoo.com" + path, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    console.warn("[FB/YahooDirect]", e.message);
    return null;
  }
}

async function yahooDirectGetQuote(sym) {
  const d = await _ydFetch("/v8/finance/chart/" + sym.toUpperCase() + "?interval=1d&range=1d");
  if (!d || !d.chart || !d.chart.result || !d.chart.result[0]) return null;
  const meta = d.chart.result[0].meta;
  return { price: meta.regularMarketPrice, prevClose: meta.chartPreviousClose, currency: meta.currency, symbol: meta.symbol, _source: "yahoo_direct" };
}

async function yahooDirectGetSummary(sym) {
  const modules = "price,summaryDetail,defaultKeyStatistics,financialData";
  const d = await _ydFetch("/v10/finance/quoteSummary/" + sym.toUpperCase() + "?modules=" + modules);
  if (!d || !d.quoteSummary || !d.quoteSummary.result || !d.quoteSummary.result[0]) return null;
  return Object.assign({}, d.quoteSummary.result[0], { _source: "yahoo_direct" });
}

async function yahooDirectGetNews(sym) {
  const d = await _ydFetch("/v1/finance/search?q=" + sym.toUpperCase() + "&newsCount=10");
  if (!d || !d.news || !d.news.length) return null;
  return d.news.map(function(n) {
    return { title: n.title, url: n.link, publishedAt: new Date(n.providerPublishTime * 1000).toISOString(), source: n.publisher, _source: "yahoo_direct" };
  });
}


/* ════════════════════════════════════════════════════════════════
   SEC EDGAR BRIDGE  (no key · ~10 req/sec recommended)
   Delegates to secdera.js window.secGetCompanyFacts when available.
   ════════════════════════════════════════════════════════════════ */
async function secGetFundamentals(sym) {
  if (typeof window.secGetCompanyFacts === "function") {
    return window.secGetCompanyFacts(sym);
  }
  if (!_RL.canCall("sec_edgar")) return null;
  _RL.bump("sec_edgar");
  try {
    const tickers = await fetch(
      "https://www.sec.gov/files/company_tickers.json",
      { headers: { "User-Agent": "FINTERM dashboard research@finterm.app" }, signal: AbortSignal.timeout(8000) }
    ).then(function(r) { return r.json(); }).catch(function() { return null; });
    if (!tickers) return null;
    const entry = Object.values(tickers).find(function(c) { return c.ticker && c.ticker.toUpperCase() === sym.toUpperCase(); });
    if (!entry) return null;
    return { cik: String(entry.cik_str).padStart(10, "0"), name: entry.title, _source: "sec_edgar" };
  } catch { return null; }
}


/* ════════════════════════════════════════════════════════════════
   FINNHUB BRIDGE  (delegates to finnhub.js window functions)
   ════════════════════════════════════════════════════════════════ */
async function _fhBridge(fnName) {
  const args = Array.prototype.slice.call(arguments, 1);
  if (!_RL.canCall("finnhub")) return null;
  if (!_fbKey("finnhub")) return null;
  if (typeof window[fnName] !== "function") return null;
  _RL.bump("finnhub");
  try { return await window[fnName].apply(null, args); } catch { return null; }
}


/* ════════════════════════════════════════════════════════════════
   FALLBACK CHAINS
   ════════════════════════════════════════════════════════════════ */

/* Quote: Finnhub → Twelve Data → Polygon → Yahoo Direct → Stooq → Marketstack */
async function fbGetQuote(sym) {
  const cached = _cGet("quote", sym);
  if (cached) return cached;
  let r = null;

  r = await _fhBridge("fhGetQuote", sym);
  if (r) r._source = r._source || "finnhub";

  if (!r) r = await twelvedataGetEOD(sym);
  if (!r) r = await polygonGetQuote(sym);
  if (!r) r = await yahooDirectGetQuote(sym);
  if (!r) r = await stooqGetEOD(sym);
  if (!r) r = await marketstackGetEOD(sym);   // last — burns monthly quota

  if (r) _cSet("quote", sym, r);
  return r;
}

/* Fundamentals: Finnhub → Tiingo → Yahoo Direct → SEC EDGAR */
async function fbGetFundamentals(sym) {
  const cached = _cGet("fundamentals", sym);
  if (cached) return cached;
  let r = null;

  r = await _fhBridge("fhGetProfile", sym);
  if (!r) r = await tiingoGetFundamentals(sym);
  if (!r) {
    const s = await yahooDirectGetSummary(sym);
    if (s && s.price) {
      const p = s.price;
      r = { marketCap: p.marketCap && p.marketCap.raw, peRatio: p.trailingPE && p.trailingPE.raw, dividendYield: p.dividendYield && p.dividendYield.raw, name: p.longName, sector: p.sector, _source: "yahoo_direct" };
    }
  }
  if (!r) r = await secGetFundamentals(sym);

  if (r) _cSet("fundamentals", sym, r);
  return r;
}

/* Financials: Finnhub → Yahoo Direct → Tiingo → SEC EDGAR */
async function fbGetFinancials(sym, type) {
  type = type || "income";
  const cKey = type + ":" + sym;
  const cached = _cGet("financials", cKey);
  if (cached) return cached;
  let r = null;

  if (type === "metrics") r = await _fhBridge("fhGetBasicFinancials", sym);
  if (!r) {
    const s = await yahooDirectGetSummary(sym);
    if (s && s.financialData) r = Object.assign({}, s.financialData, { _source: "yahoo_direct" });
  }
  if (!r) r = await tiingoGetFundamentals(sym);
  if (!r) r = await secGetFundamentals(sym);

  if (r) _cSet("financials", cKey, r);
  return r;
}

/* News: Finnhub → Tiingo → Yahoo Direct */
async function fbGetNews(sym) {
  const cached = _cGet("news", sym);
  if (cached) return cached;
  let r = null;

  const fhNews = await _fhBridge("fhGetCompanyNews", sym);
  if (Array.isArray(fhNews) && fhNews.length) {
    r = fhNews.map(function(n) { return Object.assign({}, n, { _source: "finnhub" }); });
  }

  if (!r) r = await tiingoGetNews(sym);
  if (!r) r = await yahooDirectGetNews(sym);

  if (r) _cSet("news", sym, r);
  return r;
}

/* Analysts: Finnhub → Yahoo Direct → SEC EDGAR */
async function fbGetAnalysts(sym) {
  const cached = _cGet("analysts", sym);
  if (cached) return cached;
  let r = null;

  const fhRec = await _fhBridge("fhGetRecommendations", sym);
  const fhPT  = await _fhBridge("fhGetPriceTarget", sym);
  if (fhRec || fhPT) r = { recommendations: fhRec, priceTarget: fhPT, _source: "finnhub" };

  if (!r) {
    const s = await yahooDirectGetSummary(sym);
    if (s && s.financialData && s.financialData.recommendationKey) {
      const fd = s.financialData;
      r = { consensus: fd.recommendationKey, targetMean: fd.targetMeanPrice && fd.targetMeanPrice.raw, targetHigh: fd.targetHighPrice && fd.targetHighPrice.raw, targetLow: fd.targetLowPrice && fd.targetLowPrice.raw, numAnalysts: fd.numberOfAnalystOpinions && fd.numberOfAnalystOpinions.raw, _source: "yahoo_direct" };
    }
  }
  if (!r) r = await secGetFundamentals(sym);

  if (r) _cSet("analysts", sym, r);
  return r;
}

/* History: Twelve Data → Polygon → Marketstack → Stooq */
async function fbGetHistory(sym, days) {
  days = days || 90;
  const cKey = "history:" + sym + ":" + days;
  const cached = _cGet("financials", cKey);
  if (cached) return cached;
  let r = null;

  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const to   = new Date().toISOString().slice(0, 10);

  r = await twelvedataGetTimeSeries(sym, "1day", days);
  if (!r) r = await polygonGetAggregates(sym, from, to);
  if (!r) r = await marketstackGetHistory(sym, from);
  if (!r) r = await stooqGetHistory(sym, days);

  if (r) _cSet("financials", cKey, r);
  return r;
}


/* ════════════════════════════════════════════════════════════════
   STATUS / DIAGNOSTICS
   ════════════════════════════════════════════════════════════════ */
var _ALL_PROVIDERS = ["finnhub","twelvedata","tiingo","polygon","marketstack","yahoo_direct","stooq","sec_edgar"];

function fbStatus() {
  var out = {};
  _ALL_PROVIDERS.forEach(function(id) { out[id] = _RL.status(id); });
  return out;
}

function fbStatusHtml() {
  const s = fbStatus();
  const LABELS = { finnhub:"Finnhub", twelvedata:"Twelve Data", tiingo:"Tiingo", polygon:"Polygon", marketstack:"Marketstack", yahoo_direct:"Yahoo Direct", stooq:"Stooq", sec_edgar:"SEC EDGAR" };
  const rows = _ALL_PROVIDERS.map(function(id) {
    const info = s[id];
    const dot  = info.ok ? "🟢" : "🔴";
    const lim  = info.limits || {};
    const parts = [];
    if (lim.perMin   != null) parts.push(info.minUsed   + "/" + lim.perMin   + "/min");
    if (lim.perDay   != null) parts.push(info.dayUsed   + "/" + lim.perDay   + "/day");
    if (lim.perMonth != null) parts.push(info.monthUsed + "/" + lim.perMonth + "/mo");
    const used = parts.length ? parts.join(" · ") : "unlimited";
    return "<tr><td style=\"padding:2px 6px\">" + dot + "</td><td style=\"padding:2px 8px\"><b>" + (LABELS[id]||id) + "</b></td><td style=\"padding:2px 6px;color:#888;font-size:0.82em\">" + used + "</td></tr>";
  }).join("");
  return "<table style=\"border-collapse:collapse;font-family:monospace;font-size:0.88em\">" + rows + "</table>";
}


/* ════════════════════════════════════════════════════════════════
   PUBLIC API — window.FB
   ════════════════════════════════════════════════════════════════ */
window.FB = {
  /* Fallback chains */
  getQuote:        fbGetQuote,
  getFundamentals: fbGetFundamentals,
  getFinancials:   fbGetFinancials,
  getNews:         fbGetNews,
  getAnalysts:     fbGetAnalysts,
  getHistory:      fbGetHistory,

  /* Direct provider access */
  tiingo:      { getQuote: tiingoGetQuote,      getNews: tiingoGetNews,           getFundamentals: tiingoGetFundamentals },
  polygon:     { getQuote: polygonGetQuote,      getAggregates: polygonGetAggregates },
  marketstack: { getEOD:   marketstackGetEOD,   getHistory: marketstackGetHistory },
  twelvedata:  { getQuote: twelvedataGetQuote,   getEOD: twelvedataGetEOD,         getTimeSeries: twelvedataGetTimeSeries },
  stooq:       { getEOD:   stooqGetEOD,         getHistory: stooqGetHistory },
  yahoo:       { getQuote: yahooDirectGetQuote,  getSummary: yahooDirectGetSummary, getNews: yahooDirectGetNews },
  sec:         { getFundamentals: secGetFundamentals },

  /* Rate limit management */
  rl:         _RL,
  status:     fbStatus,
  statusHtml: fbStatusHtml,
};

console.log("[FB] apifallback.js loaded — window.FB ready (8 providers, 6 fallback chains)");

})();
