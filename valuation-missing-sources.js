/* ══════════════════════════════════════════════════════════════════
   FINTERM — valuation-missing-sources.js
   Missing Variable Implementation Layer
   ──────────────────────────────────────────────────────────────────
   Implements all missing variables identified in the gap analysis.
   Plugs directly into valuation-data.js / valuation-datasources.js
   architecture — same cache patterns, same global stores.

   GROUPS IMPLEMENTED:
   ─────────────────────────────────────────────────────────────────
   GROUP 1 — Computed from existing terminal data (no new source)
     [G1-01]  RISK_CORR_TO_BENCH_250D     — Pearson correlation vs SPY
     [G1-02]  MACRO_INFL_BETA_3Y          — OLS regression on CPIAUCSL
     [G1-03]  MACRO_RATE_BETA_3Y          — OLS regression on DGS10
     [G1-04]  MACRO_GDP_BETA_5Y           — OLS regression on WB GDP
     [G1-05]  Amihud Illiquidity          — |ret|/dollar_volume (formal)
     [G1-06]  MACRO_RECESSION_VULN_SCORE  — Composite leverage+beta+sector
     [G1-07]  P_tail penalty multiplier   — From es975_10D
     [G1-08]  P_liq  penalty multiplier   — From Amihud + dollar volume
     [G1-09]  P_struct penalty multiplier — From D/E + ETF tracking error
     [G1-10]  Credit notch → numeric      — Doc-3 convex formula

   GROUP 2 — No-key external sources
     [G2-11]  CME settlements             — Term structure + roll yield
     [G2-12]  Stooq commodity OHLCV       — Daily commodity momentum
     [G2-13]  IMF DataMapper REER         — FX real effective rate
     [G2-14]  FX bid-ask Roll proxy       — From Stooq FX OHLCV
     [G2-15]  USDA WASDE stocks-to-use    — Grains inventory z-score
     [G2-16]  Kenneth French 5-factor CSV — Factor betas via OLS
     [G2-17]  Duration + Convexity        — From Treasury yield curve
     [G2-18]  Regime detection engine     — Rule-based: VIX+spread+curve
     [G2-19]  UARS normalisation pipeline — Operators A / B / C / D
     [G2-20]  Dimension score aggregator  — AS = Σ w_k · D_k + penalties

   GROUP 3 — Free-key sources (already registered in config.js)
     [G3-21]  FRED G10 short rates        — FX carry (interest differential)
     [G3-22]  BLS PPI commodity series    — Commodity price inflation
     [G3-23]  EIA petroleum/gas inventory — Energy inventory z-score
     [G3-24]  EODHD bond duration         — Modified duration per instrument

   Load order: after valuation-data.js, valuation-datasources.js, fred.js
   ══════════════════════════════════════════════════════════════════ */

'use strict';

/* ── Module constants ─────────────────────────────────────────────── */
const VMS_SESSION_KEY = 'vms_call_count';
const VMS_TTL_1H      = 60 * 60 * 1000;
const VMS_TTL_6H      = 6  * 60 * 60 * 1000;
const VMS_TTL_24H     = 24 * 60 * 60 * 1000;
const VMS_PROXY       = 'https://api.allorigins.win/raw?url=';

/* ── Call counter ─────────────────────────────────────────────────── */
function _vmsCount() { return parseInt(sessionStorage.getItem(VMS_SESSION_KEY) || '0'); }
function _vmsBump()  {
  const n = _vmsCount() + 1;
  sessionStorage.setItem(VMS_SESSION_KEY, n);
  if (typeof renderTopbarBadges === 'function') renderTopbarBadges();
  return n;
}

/* ── Unified cache helpers ────────────────────────────────────────── */
function _vmsCacheGet(key, ttl) {
  try {
    const raw = sessionStorage.getItem('vms_' + key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > ttl) return null;
    return data;
  } catch (_) { return null; }
}
function _vmsCacheSet(key, data) {
  try {
    sessionStorage.setItem('vms_' + key, JSON.stringify({ ts: Date.now(), data }));
  } catch (_) { /* quota */ }
}

/* ── Generic fetch with timeout ──────────────────────────────────── */
async function _vmsFetch(url, opts = {}) {
  _vmsBump();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout || 12000);
  try {
    const res = await fetch(url, {
      signal:  controller.signal,
      headers: opts.headers || {},
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return opts.text ? await res.text() : await res.json();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

/* ── Pure math helpers ────────────────────────────────────────────── */

/** OLS slope of y on x (both equal-length arrays) */
function _ols(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 6) return null;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    if (x[i] == null || y[i] == null || isNaN(x[i]) || isNaN(y[i])) continue;
    sx += x[i]; sy += y[i]; sxy += x[i] * y[i]; sxx += x[i] * x[i];
  }
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-12) return null;
  return (n * sxy - sx * sy) / denom;
}

/** Pearson correlation of two equal-length arrays */
function _pearson(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 6) return null;
  let sa = 0, sb = 0, sab = 0, sa2 = 0, sb2 = 0;
  for (let i = 0; i < n; i++) {
    if (a[i] == null || b[i] == null) continue;
    sa += a[i]; sb += b[i]; sab += a[i]*b[i]; sa2 += a[i]*a[i]; sb2 += b[i]*b[i];
  }
  const num  = n * sab - sa * sb;
  const den  = Math.sqrt((n * sa2 - sa * sa) * (n * sb2 - sb * sb));
  return den === 0 ? null : +(num / den).toFixed(4);
}

/** Normal CDF approximation (Abramowitz & Stegun) */
function _normCDF(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  return z >= 0 ? 1 - p : p;
}

/** Robust z-score → 0-100 percentile (Operator A) */
function _robustZ(x, median, mad) {
  if (mad === 0) return 50;
  const z = (x - median) / (1.4826 * mad);
  const zc = Math.max(-4, Math.min(4, z));
  return Math.round(_normCDF(zc) * 100);
}

/** Percentile rank of value in array → 0-100 (Operator B) */
function _percentileRank(val, arr) {
  if (!arr || !arr.length) return 50;
  const sorted = [...arr].filter(v => v != null && isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return 50;
  const rank = sorted.filter(v => v <= val).length;
  return Math.round(((rank - 0.5) / sorted.length) * 100);
}

/** Get closes array from technical.js session cache */
function _getCloses(sym, minBars = 20) {
  try {
    const raw = sessionStorage.getItem(`tc:${sym}:D`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    /* technical.js stores: { d: { c, t, o, h, l, v }, ts } */
    const closes = parsed?.d?.c || parsed?.c || null;
    if (!closes || closes.length < minBars) return null;
    return closes;
  } catch (_) { return null; }
}

/** Daily log-returns from closes array */
function _logReturns(closes) {
  const out = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > 0 && closes[i-1] > 0)
      out.push(Math.log(closes[i] / closes[i-1]));
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════
   GROUP 1 — COMPUTED FROM EXISTING TERMINAL DATA
   ══════════════════════════════════════════════════════════════════ */

/* ── [G1-01] RISK_CORR_TO_BENCH_250D ─────────────────────────────
   Pearson correlation of asset daily returns vs SPY over 250 bars.
   Uses technical.js cache for both the asset and SPY.
   If SPY is not cached, triggers a background Stooq fetch.         */

window.getCorrelationToBench = async function getCorrelationToBench(ticker, benchSym = 'SPY') {
  const sym = ticker.replace(/.*:/, '').toUpperCase();
  const cacheKey = `corr_${sym}_${benchSym}`;
  const cached = _vmsCacheGet(cacheKey, VMS_TTL_6H);
  if (cached !== null) return cached;

  let assetCloses = _getCloses(sym, 50);
  let benchCloses = _getCloses(benchSym, 50);

  /* If SPY not cached, fetch via Stooq (no key) */
  if (!benchCloses) {
    try {
      const stooqUrl  = `https://stooq.com/q/d/l/?s=spy.us&i=d`;
      const proxyUrl  = `${VMS_PROXY}${encodeURIComponent(stooqUrl)}`;
      const text      = await _vmsFetch(proxyUrl, { timeout: 10000, text: true });
      const lines     = text.trim().split('\n').slice(1);
      const spyCloses = lines
        .filter(l => l.trim())
        .map(l => parseFloat(l.split(',')[4]))
        .filter(v => !isNaN(v) && v > 0)
        .slice(-300);
      if (spyCloses.length >= 50) benchCloses = spyCloses;
    } catch (_) { /* continue with null */ }
  }

  if (!assetCloses || !benchCloses) return null;

  /* Align lengths to last 250 bars */
  const N = Math.min(assetCloses.length, benchCloses.length, 251);
  const aRet = _logReturns(assetCloses.slice(-N));
  const bRet = _logReturns(benchCloses.slice(-N));
  const len  = Math.min(aRet.length, bRet.length);

  const corr = _pearson(aRet.slice(-len), bRet.slice(-len));
  if (corr === null) return null;

  const result = { correlation: corr, bars: len, benchmark: benchSym };
  _vmsCacheSet(cacheKey, result);
  return result;
};

/* ── [G1-02] MACRO_INFL_BETA_3Y ──────────────────────────────────
   OLS β of monthly asset returns on monthly CPIAUCSL changes.
   FRED must be available (key required). Returns null gracefully.  */

window.getInflationBeta = async function getInflationBeta(ticker) {
  const sym = ticker.replace(/.*:/, '').toUpperCase();
  const cacheKey = `infl_beta_${sym}`;
  const cached   = _vmsCacheGet(cacheKey, VMS_TTL_24H);
  if (cached !== null) return cached;

  try {
    if (typeof fredFetch !== 'function') return null;
    /* Fetch 36 monthly CPI observations */
    const cpiObs = await fredFetch('CPIAUCSL', { limit: 37, frequency: 'm' });
    if (!cpiObs || cpiObs.length < 12) return null;

    const cpiValues  = cpiObs.map(o => parseFloat(o.value)).filter(v => !isNaN(v)).reverse();
    const cpiReturns = [];
    for (let i = 1; i < cpiValues.length; i++) {
      if (cpiValues[i-1] > 0)
        cpiReturns.push((cpiValues[i] - cpiValues[i-1]) / cpiValues[i-1]);
    }

    /* Monthly asset returns from daily candles */
    const closes = _getCloses(sym, 30);
    if (!closes) return null;

    /* Resample daily to monthly returns (approx 21 bars/month) */
    const monthlyRet = [];
    for (let i = 21; i < closes.length; i += 21) {
      if (closes[i-21] > 0)
        monthlyRet.push((closes[i] - closes[i-21]) / closes[i-21]);
    }

    const n     = Math.min(cpiReturns.length, monthlyRet.length);
    if (n < 6) return null;

    const beta  = _ols(cpiReturns.slice(-n), monthlyRet.slice(-n));
    if (beta === null) return null;

    const result = { inflBeta: +beta.toFixed(4), obs: n, series: 'CPIAUCSL' };
    _vmsCacheSet(cacheKey, result);
    return result;
  } catch (_) { return null; }
};

/* ── [G1-03] MACRO_RATE_BETA_3Y ──────────────────────────────────
   OLS β of monthly asset returns on monthly DGS10 changes.         */

window.getRateBeta = async function getRateBeta(ticker) {
  const sym = ticker.replace(/.*:/, '').toUpperCase();
  const cacheKey = `rate_beta_${sym}`;
  const cached   = _vmsCacheGet(cacheKey, VMS_TTL_24H);
  if (cached !== null) return cached;

  try {
    if (typeof fredFetch !== 'function') return null;
    const rateObs = await fredFetch('DGS10', { limit: 37, frequency: 'm' });
    if (!rateObs || rateObs.length < 12) return null;

    const rateValues  = rateObs.map(o => parseFloat(o.value)).filter(v => !isNaN(v)).reverse();
    const rateChanges = [];
    for (let i = 1; i < rateValues.length; i++) {
      rateChanges.push(rateValues[i] - rateValues[i-1]);   /* level change in % */
    }

    const closes = _getCloses(sym, 30);
    if (!closes) return null;

    const monthlyRet = [];
    for (let i = 21; i < closes.length; i += 21) {
      if (closes[i-21] > 0)
        monthlyRet.push((closes[i] - closes[i-21]) / closes[i-21]);
    }

    const n    = Math.min(rateChanges.length, monthlyRet.length);
    if (n < 6) return null;

    const beta = _ols(rateChanges.slice(-n), monthlyRet.slice(-n));
    if (beta === null) return null;

    const result = { rateBeta: +beta.toFixed(4), obs: n, series: 'DGS10' };
    _vmsCacheSet(cacheKey, result);
    return result;
  } catch (_) { return null; }
};

/* ── [G1-04] MACRO_GDP_BETA_5Y ───────────────────────────────────
   OLS β of asset annual returns on US GDP annual growth %.
   Uses macroglobal.js World Bank GDP series if available.           */

window.getGDPBeta = async function getGDPBeta(ticker) {
  const sym = ticker.replace(/.*:/, '').toUpperCase();
  const cacheKey = `gdp_beta_${sym}`;
  const cached   = _vmsCacheGet(cacheKey, VMS_TTL_24H);
  if (cached !== null) return cached;

  try {
    /* World Bank GDP growth (no key) */
    const gdpUrl = 'https://api.worldbank.org/v2/country/US/indicator/NY.GDP.MKTP.KD.ZG?format=json&mrv=6&per_page=10';
    const gdpRes = await _vmsFetch(gdpUrl, { timeout: 8000 });
    const gdpData = gdpRes?.[1]?.filter(d => d.value != null).sort((a,b) => a.date - b.date);
    if (!gdpData || gdpData.length < 4) return null;

    const gdpGrowth = gdpData.map(d => d.value / 100);   /* fractional */

    /* Annual asset returns from candles (approx 252 bars/year) */
    const closes = _getCloses(sym, 252);
    if (!closes) return null;

    const annualRet = [];
    for (let i = 252; i < closes.length; i += 252) {
      if (closes[i-252] > 0)
        annualRet.push((closes[i] - closes[i-252]) / closes[i-252]);
    }

    const n    = Math.min(gdpGrowth.length, annualRet.length);
    if (n < 3) return null;

    const beta = _ols(gdpGrowth.slice(-n), annualRet.slice(-n));
    if (beta === null) return null;

    const result = { gdpBeta: +beta.toFixed(4), obs: n, country: 'US' };
    _vmsCacheSet(cacheKey, result);
    return result;
  } catch (_) { return null; }
};

/* ── [G1-05] Formal Amihud Illiquidity ───────────────────────────
   Amihud = mean( |r_t| / DollarVolume_t ) × 10^6 over 30 days.    */

window.computeAmihud = function computeAmihud(sym) {
  try {
    const raw = sessionStorage.getItem(`tc:${sym.toUpperCase()}:D`);
    if (!raw) return null;
    const parsed   = JSON.parse(raw);
    const candles  = parsed?.d || parsed;
    const closes   = candles?.c;
    const volumes  = candles?.v;
    if (!closes || !volumes || closes.length < 21) return null;

    const n = Math.min(closes.length, volumes.length);
    const slice = 30;
    const start = Math.max(1, n - slice);

    let sum = 0, count = 0;
    for (let i = start; i < n; i++) {
      const ret  = Math.abs(Math.log(closes[i] / closes[i-1]));
      const dvol = closes[i] * volumes[i];
      if (dvol > 0) { sum += ret / dvol * 1e6; count++; }
    }
    if (count === 0) return null;
    return +(sum / count).toFixed(8);
  } catch (_) { return null; }
};

/* ── [G1-06] MACRO_RECESSION_VULN_SCORE ─────────────────────────
   Composite of: D/E leverage + interest coverage + beta + sector.
   All inputs already available in _valuationData.                  */

window.computeRecessionVulnScore = function computeRecessionVulnScore(vd) {
  if (!vd) return null;
  const f   = vd.fundamentals  || {};
  const m   = vd.market        || {};
  const sec = vd.sector        || 'Unknown';

  /* Sector cyclicality map (higher = more vulnerable) */
  const SECTOR_VULN = {
    'Technology':          0.7, 'Consumer Cyclical':    0.9,
    'Energy':              0.8, 'Basic Materials':      0.8,
    'Industrials':         0.7, 'Financial Services':   0.7,
    'Communication Services':0.5,'Real Estate':         0.6,
    'Healthcare':          0.3, 'Consumer Defensive':   0.2,
    'Utilities':           0.2, 'Unknown':              0.5,
  };
  const sectorVuln = SECTOR_VULN[sec] ?? 0.5;

  /* D/E leverage score: 0=safe, 1=distressed */
  const de = f.debtToEquity ?? 1.0;
  const deScore = Math.min(1, Math.max(0, (de - 0.5) / 4));

  /* Interest coverage: lower = more vulnerable */
  const ic = f.interestCoverage ?? 3;
  const icScore = Math.min(1, Math.max(0, 1 - (ic - 1) / 10));

  /* Beta score */
  const beta = m.beta ?? 1.0;
  const betaScore = Math.min(1, Math.max(0, (beta - 0.5) / 2));

  /* Composite (equal weights) */
  const raw = (deScore + icScore + betaScore + sectorVuln) / 4;
  return Math.round(raw * 100);  /* 0=safe, 100=extremely vulnerable */
};

/* ── [G1-07] Tail-Risk Penalty Multiplier P_tail ─────────────────
   P_tail = clip(1 − λ · max(0, |ES| / threshold − 1), 0.6, 1.0)
   threshold: daily ES −2% (conservative institutional benchmark)   */

window.computePenaltyTail = function computePenaltyTail(riskMetrics) {
  if (!riskMetrics) return 1.0;
  const es = riskMetrics.es975_10D;   /* negative, 10-day scaled */
  if (es === null || es === undefined) return 1.0;
  const absES = Math.abs(es);
  /* Threshold: ~6.3% 10-day ES (≈2%/day × √10) */
  const threshold = 0.063;
  const lambda    = 0.8;
  const penalty   = 1 - lambda * Math.max(0, absES / threshold - 1);
  return +Math.min(1.0, Math.max(0.6, penalty)).toFixed(4);
};

/* ── [G1-08] Liquidity Penalty Multiplier P_liq ──────────────────
   P_liq = clip(1 − λ · amihud_norm, 0.6, 1.0)
   amihud_norm = min(1, amihud / typical_illiquid)                   */

window.computePenaltyLiq = function computePenaltyLiq(liquidityMetrics) {
  if (!liquidityMetrics) return 1.0;
  const amihud = liquidityMetrics.amihud;
  if (amihud === null || amihud === undefined) return 1.0;
  /* Typical small-cap illiquid threshold ≈ 0.1 (Amihud units ×10^6) */
  const threshold = 0.1;
  const lambda    = 0.6;
  const norm      = Math.min(1, amihud / threshold);
  const penalty   = 1 - lambda * norm;
  return +Math.min(1.0, Math.max(0.6, penalty)).toFixed(4);
};

/* ── [G1-09] Structural Penalty Multiplier P_struct ─────────────
   Equities: penalise excessive leverage (D/E > 3)
   ETFs:     penalise high tracking error (>1.5%)                    */

window.computePenaltyStruct = function computePenaltyStruct(vd) {
  if (!vd) return 1.0;
  let penalty = 1.0;

  if (vd.structural?.isETF) {
    const te = vd.structural.trackingError;
    if (te !== null) {
      /* 0% TE → 1.0,  1.5% TE → 0.85,  3%+ TE → 0.6 */
      penalty = Math.min(1.0, Math.max(0.6, 1 - te * 13.3));
    }
  } else {
    const de = vd.fundamentals?.debtToEquity;
    if (de !== null && de !== undefined) {
      /* D/E 3 → 0.9,  D/E 5 → 0.7,  D/E 8+ → 0.6 */
      const excess = Math.max(0, de - 3);
      penalty = Math.min(1.0, Math.max(0.6, 1 - excess * 0.08));
    }
  }
  return +penalty.toFixed(4);
};

/* ── [G1-10] Credit Rating Notch → Numeric Score ────────────────
   Formula from Doc 3: linear + convex speculative-grade penalty.
   Supports S&P, Moody's, and Fitch notation.                        */

const NOTCH_LADDER = [
  'AAA','AA+','AA','AA-','A+','A','A-',
  'BBB+','BBB','BBB-',
  'BB+','BB','BB-','B+','B','B-',
  'CCC+','CCC','CCC-','CC','C','D'
];
const MOODY_TO_SP = {
  'Aaa':'AAA','Aa1':'AA+','Aa2':'AA','Aa3':'AA-',
  'A1':'A+','A2':'A','A3':'A-',
  'Baa1':'BBB+','Baa2':'BBB','Baa3':'BBB-',
  'Ba1':'BB+','Ba2':'BB','Ba3':'BB-',
  'B1':'B+','B2':'B','B3':'B-',
  'Caa1':'CCC+','Caa2':'CCC','Caa3':'CCC-',
  'Ca':'CC','C':'C','D':'D',
};

window.creditRatingToNumeric = function creditRatingToNumeric(ratingStr) {
  if (!ratingStr) return null;
  const r   = String(ratingStr).trim();
  const sp  = MOODY_TO_SP[r] || r.toUpperCase();
  const rank= NOTCH_LADDER.indexOf(sp) + 1;    /* 1 = AAA (best) */
  if (rank === 0) return null;

  const N          = NOTCH_LADDER.length;       /* 22 */
  const IG_CUT     = NOTCH_LADDER.indexOf('BB+') + 1;  /* rank 11 */
  const lambda     = 0.08;

  const scoreLinear = 100 * (N - rank) / (N - 1);
  const specPenalty = lambda * Math.pow(Math.max(0, rank - IG_CUT), 2);
  return Math.round(Math.min(100, Math.max(0, scoreLinear - specPenalty)));
};

/* ══════════════════════════════════════════════════════════════════
   GROUP 2 — NO-KEY EXTERNAL SOURCES
   ══════════════════════════════════════════════════════════════════ */

/* ── [G2-11 + G2-12] CME Settlements — Term Structure + Roll Yield
   Endpoint: CME settlement prices (free, no key, via allorigins)
   Covers: CL (crude), GC (gold), SI (silver), HG (copper),
           NG (natural gas), ZC (corn), ZW (wheat), ZS (soybeans)   */

const CME_PRODUCTS = {
  'CL': { name:'WTI Crude',    cat:'Energy'      },
  'NG': { name:'Nat Gas',      cat:'Energy'      },
  'GC': { name:'Gold',         cat:'Metals'      },
  'SI': { name:'Silver',       cat:'Metals'      },
  'HG': { name:'Copper',       cat:'Metals'      },
  'ZC': { name:'Corn',         cat:'Agriculture' },
  'ZW': { name:'Wheat',        cat:'Agriculture' },
  'ZS': { name:'Soybeans',     cat:'Agriculture' },
};

async function _cmeFetchSettlements(productCode) {
  const cacheKey = `cme_settle_${productCode}`;
  const cached   = _vmsCacheGet(cacheKey, VMS_TTL_6H);
  if (cached) return cached;

  try {
    const url      = `https://www.cmegroup.com/CmeWS/mvc/Settlements/futures/settlements/${productCode.toLowerCase()}/FUT`;
    const proxyUrl = `${VMS_PROXY}${encodeURIComponent(url)}`;
    const data     = await _vmsFetch(proxyUrl, { timeout: 12000 });

    /* CME returns { settlements: [{ month, open, high, low, last, settle, change, ... }] } */
    const rows = data?.settlements || data?.data || [];
    if (!rows.length) return null;

    /* Filter to numeric settlement prices, keep month label */
    const contracts = rows
      .map(r => ({
        month:   r.month || r.expirationMonth || '',
        settle:  parseFloat(r.settle || r.last || r.close || 0),
        open:    parseFloat(r.open   || 0),
        volume:  parseInt(r.volume   || 0),
      }))
      .filter(r => r.settle > 0)
      .slice(0, 8);   /* front 8 contracts */

    if (contracts.length < 2) return null;
    _vmsCacheSet(cacheKey, contracts);
    return contracts;
  } catch (_) { return null; }
}

/**
 * getCMETermStructure(productCode)
 * Returns term structure slope and roll yield for a commodity.
 *
 * @param {'CL'|'NG'|'GC'|'SI'|'HG'|'ZC'|'ZW'|'ZS'} productCode
 * @returns {Promise<TermStructure | null>}
 */
window.getCMETermStructure = async function getCMETermStructure(productCode) {
  const code = productCode.toUpperCase();
  const cacheKey = `term_struct_${code}`;
  const cached   = _vmsCacheGet(cacheKey, VMS_TTL_6H);
  if (cached) return cached;

  const contracts = await _cmeFetchSettlements(code);
  if (!contracts || contracts.length < 2) return null;

  const front = contracts[0].settle;
  const back1 = contracts[1].settle;
  const back3 = contracts[Math.min(3, contracts.length-1)].settle;

  /* Slope: (back1 - front) / front */
  const slope1 = (back1 - front) / front;

  /* Backwardation flag: front > back (positive carry) */
  const isBackwardation = front > back1;

  /* Roll yield (3-month): annualised */
  const roll3M = (front - back3) / front;                 /* positive = backwardation = positive carry */

  /* Term structure score 0-100:
     backwardation (roll > 0) → high score; contango (roll < 0) → low score */
  const tsScore = Math.round(Math.min(100, Math.max(0, 50 + roll3M * 500)));

  const result = {
    productCode:    code,
    productName:    CME_PRODUCTS[code]?.name || code,
    front,
    back1,
    back3,
    slope1M:        +slope1.toFixed(6),
    roll3M:         +roll3M.toFixed(6),
    roll3MAnnual:   +(roll3M * 4).toFixed(6),
    isBackwardation,
    termStructureScore: tsScore,
    contracts:      contracts.slice(0, 4),
    _src:           'CME Group (no key)',
  };

  _vmsCacheSet(cacheKey, result);
  return result;
};

/* ── [G2-12] Stooq Commodity OHLCV — Daily Momentum ──────────────
   Reuses the Stooq pattern already in technical.js (_techFallbackStooq)
   but extended to commodity futures tickers.                        */

const STOOQ_COMMODITY_MAP = {
  /* Futures tickers on Stooq */
  'CL': 'cl.f',   'NG': 'ng.f',   'GC': 'gc.f',
  'SI': 'si.f',   'HG': 'hg.f',   'ZC': 'zc.f',
  'ZW': 'zw.f',   'ZS': 'zs.f',   'BZ': 'bz.f',
  /* Stooq FX pairs */
  'EURUSD':'eurusd', 'GBPUSD':'gbpusd', 'USDJPY':'usdjpy',
  'USDCHF':'usdchf', 'AUDUSD':'audusd', 'USDCAD':'usdcad',
  'NZDUSD':'nzdusd', 'USDNOK':'usdnok', 'USDSEK':'usdsek',
};

/**
 * getStooqOHLCV(symbolOrCode)
 * Fetches daily OHLCV from Stooq for commodities and FX pairs.
 * Returns { closes, volumes, dates } or null.
 */
window.getStooqOHLCV = async function getStooqOHLCV(symbolOrCode) {
  const key    = symbolOrCode.toUpperCase().replace(/.*:/, '');
  const stooqS = STOOQ_COMMODITY_MAP[key] || key.toLowerCase();
  const cacheKey = `stooq_${stooqS}`;
  const cached   = _vmsCacheGet(cacheKey, VMS_TTL_1H);
  if (cached) return cached;

  try {
    const stooqUrl = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqS)}&i=d`;
    const proxyUrl = `${VMS_PROXY}${encodeURIComponent(stooqUrl)}`;
    const text     = await _vmsFetch(proxyUrl, { timeout: 10000, text: true });
    if (!text || text.includes('No data') || text.length < 50) return null;

    const lines  = text.trim().split('\n');
    const header = lines[0].toLowerCase();
    if (!header.includes('close')) return null;

    const rows = lines.slice(1)
      .filter(l => l.trim())
      .map(l => l.split(','))
      .filter(r => r.length >= 5 && /^\d{4}-\d{2}-\d{2}$/.test(r[0]))
      .sort((a, b) => a[0] < b[0] ? -1 : 1)
      .slice(-300);

    if (rows.length < 20) return null;

    const result = {
      dates:   rows.map(r => r[0]),
      opens:   rows.map(r => parseFloat(r[1])),
      highs:   rows.map(r => parseFloat(r[2])),
      lows:    rows.map(r => parseFloat(r[3])),
      closes:  rows.map(r => parseFloat(r[4])),
      volumes: rows.map(r => parseFloat(r[5] || 0)),
      symbol:  stooqS,
      _src:    'Stooq (no key)',
    };

    _vmsCacheSet(cacheKey, result);
    return result;
  } catch (_) { return null; }
};

/**
 * getCommodityMomentum(productCode)
 * Computes 1M and 12M momentum for a commodity from Stooq OHLCV.
 */
window.getCommodityMomentum = async function getCommodityMomentum(productCode) {
  const code = productCode.toUpperCase();
  const ohlcv = await getStooqOHLCV(code);
  if (!ohlcv || ohlcv.closes.length < 22) return null;

  const c = ohlcv.closes;
  const n = c.length;
  const last = c[n-1];

  const mom1M  = n >= 22  ? (last - c[n-22])  / c[n-22]  : null;
  const mom12M = n >= 252 ? (last - c[n-252]) / c[n-252] : null;

  /* Volatility 30D */
  let vol30D = null;
  if (n >= 31) {
    const rets = _logReturns(c.slice(-31));
    const mean = rets.reduce((a,b) => a+b, 0) / rets.length;
    const var_ = rets.reduce((a,r) => a + (r-mean)**2, 0) / rets.length;
    vol30D = Math.sqrt(var_ * 252);
  }

  return {
    productCode: code,
    mom1M:       mom1M  !== null ? +mom1M.toFixed(6)  : null,
    mom12M:      mom12M !== null ? +mom12M.toFixed(6) : null,
    vol30D:      vol30D !== null ? +vol30D.toFixed(6) : null,
    latestPrice: last,
    bars:        n,
    _src:        'Stooq (no key)',
  };
};

/* ── [G2-13] IMF DataMapper REER — FX Real Effective Rate ─────────
   Endpoint: imf.org/external/datamapper/api/v1/REER/{iso}
   Already used in macroglobal.js for WEO — same pattern.           */

const IMF_ISO_MAP = {
  'EUR':'EUR','GBP':'GBR','JPY':'JPN','CHF':'CHE','CAD':'CAN',
  'AUD':'AUS','NZD':'NZL','SEK':'SWE','NOK':'NOR','DKK':'DNK',
  'USD':'USA','CNY':'CHN','INR':'IND','BRL':'BRA','MXN':'MEX',
  'ZAR':'ZAF','TRY':'TUR','KRW':'KOR','SGD':'SGP','HKD':'HKG',
};

/**
 * getFXReer(currencyCode)
 * Fetches IMF Real Effective Exchange Rate index for a currency.
 * Returns latest value + 1Y change as a deviation signal.
 *
 * @param {string} currencyCode  — e.g. 'EUR', 'JPY'
 */
window.getFXReer = async function getFXReer(currencyCode) {
  const ccy     = currencyCode.toUpperCase().slice(0, 3);
  const isoCode = IMF_ISO_MAP[ccy];
  if (!isoCode) return null;

  const cacheKey = `reer_${ccy}`;
  const cached   = _vmsCacheGet(cacheKey, VMS_TTL_24H);
  if (cached) return cached;

  try {
    const url  = `https://www.imf.org/external/datamapper/api/v1/REER/${isoCode}`;
    const data = await _vmsFetch(url, { timeout: 10000 });
    const vals = data?.values?.REER?.[isoCode];
    if (!vals) return null;

    const years  = Object.keys(vals).sort();
    const latest = parseFloat(vals[years[years.length-1]]);
    const prev1Y = years.length >= 2 ? parseFloat(vals[years[years.length-2]]) : null;
    const prev5Y = years.length >= 6 ? parseFloat(vals[years[years.length-6]]) : null;

    /* REER deviation: 100 = neutral, >100 = overvalued, <100 = undervalued */
    const deviationFromParity = latest - 100;
    const change1Y = prev1Y ? latest - prev1Y : null;
    const change5Y = prev5Y ? latest - prev5Y : null;

    /* Valuation score: 50 = neutral; lower REER → higher score (undervalued) */
    const valScore = Math.round(Math.min(100, Math.max(0, 50 - deviationFromParity * 0.8)));

    const result = {
      currency:           ccy,
      reer:               +latest.toFixed(2),
      change1Y:           change1Y !== null ? +change1Y.toFixed(2) : null,
      change5Y:           change5Y !== null ? +change5Y.toFixed(2) : null,
      deviationFromParity:+deviationFromParity.toFixed(2),
      valuationScore:     valScore,    /* higher = more undervalued = more attractive */
      isOvervalued:       deviationFromParity > 5,
      isUndervalued:      deviationFromParity < -5,
      latestYear:         years[years.length-1],
      _src:               'IMF DataMapper (no key)',
    };

    _vmsCacheSet(cacheKey, result);
    return result;
  } catch (_) { return null; }
};

/* ── [G2-14] FX Bid-Ask Roll Spread Proxy ─────────────────────────
   Computed from Stooq FX OHLCV using Roll (1984) estimator.
   Same formula as Pipeline 2 in valuation-datasources.js.          */

window.getFXBidAskProxy = async function getFXBidAskProxy(fxPair) {
  const pair  = fxPair.toUpperCase().replace('/', '').slice(0, 6);
  const ohlcv = await getStooqOHLCV(pair);
  if (!ohlcv || ohlcv.closes.length < 10) return null;

  const rets = _logReturns(ohlcv.closes.slice(-60));
  if (rets.length < 8) return null;

  let cov = 0;
  for (let i = 0; i < rets.length - 1; i++) cov += rets[i+1] * rets[i];
  cov /= (rets.length - 1);

  const rollSpread = 2 * Math.sqrt(Math.max(0, -cov));
  const lastPrice  = ohlcv.closes[ohlcv.closes.length - 1];
  const spreadBps  = lastPrice > 0 ? Math.round(rollSpread / lastPrice * 10000) : null;

  return {
    fxPair,
    rollSpread:    +rollSpread.toFixed(6),
    spreadBps:     spreadBps ?? null,
    liquidityScore:spreadBps !== null ? Math.max(0, Math.round(100 - spreadBps * 2)) : 50,
    _src:          'Stooq Roll proxy (no key)',
  };
};

/* ── [G2-15] USDA WASDE Stocks-to-Use — Grains Inventory ─────────
   Source: USDA PSD online (no key, public CSV download)
   Covers: Corn, Wheat, Soybeans — global stocks-to-use ratio %     */

const USDA_PSD_COMMODITIES = {
  'ZC': { code:'0440000', name:'Corn'     },
  'ZW': { code:'0410000', name:'Wheat'    },
  'ZS': { code:'2222000', name:'Soybeans' },
};

window.getUSDAStocksToUse = async function getUSDAStocksToUse(productCode) {
  const code     = productCode.toUpperCase();
  const psd      = USDA_PSD_COMMODITIES[code];
  if (!psd) return null;

  const cacheKey = `usda_stu_${code}`;
  const cached   = _vmsCacheGet(cacheKey, VMS_TTL_24H);
  if (cached) return cached;

  try {
    /* USDA PSD online API — free, no key */
    const url  = `https://apps.fas.usda.gov/psdonline/app/index.html#/app/compositeViz`;
    /* Use the PSD API data endpoint directly */
    const apiUrl = `https://apps.fas.usda.gov/psdonline/app/api/psddata?`
                 + `commodityCode=${psd.code}&countryCode=00&marketYear=0`
                 + `&attributeId=176`;   /* 176 = Stocks-to-Use ratio */
    const proxyUrl = `${VMS_PROXY}${encodeURIComponent(apiUrl)}`;

    const data = await _vmsFetch(proxyUrl, { timeout: 12000 });
    const records = Array.isArray(data) ? data : (data?.data || []);
    if (!records.length) return null;

    /* Extract last 5 years of World stocks-to-use */
    const world = records
      .filter(r => r.CountryCode === '00' || r.countryCode === '00')
      .sort((a, b) => (b.MarketYear || b.marketYear || 0) - (a.MarketYear || a.marketYear || 0))
      .slice(0, 5);

    if (!world.length) return null;

    const latest = parseFloat(world[0].Value || world[0].value || 0);
    const hist   = world.map(r => parseFloat(r.Value || r.value || 0));
    const mean5Y = hist.reduce((a,b) => a+b, 0) / hist.length;

    /* Z-score relative to 5Y history */
    const diffs = hist.map(v => v - mean5Y);
    const stdDev= Math.sqrt(diffs.reduce((a,d) => a+d*d, 0) / diffs.length) || 1;
    const zScore = (latest - mean5Y) / stdDev;

    /* Inventory score: higher STU → less scarce → lower commodity score */
    const inventoryScore = Math.round(Math.min(100, Math.max(0, 50 - zScore * 20)));

    const result = {
      commodity:       psd.name,
      productCode:     code,
      stocksToUse:     +latest.toFixed(2),
      mean5Y:          +mean5Y.toFixed(2),
      zScore:          +zScore.toFixed(3),
      inventoryScore,   /* low = scarce = supportive of higher prices */
      history:         hist,
      _src:            'USDA PSD Online (no key)',
    };

    _vmsCacheSet(cacheKey, result);
    return result;
  } catch (_) { return null; }
};

/* ── [G2-16] Kenneth French 5-Factor CSV — Factor Betas ──────────
   Source: mba.tuck.dartmouth.edu (no key, daily CSV)
   Factors: Mkt-RF, SMB, HML, RMW, CMA
   Computes: OLS beta of asset returns on each factor.              */

window.getFactorBetas = async function getFactorBetas(ticker) {
  const sym      = ticker.replace(/.*:/, '').toUpperCase();
  const cacheKey = `factor_betas_${sym}`;
  const cached   = _vmsCacheGet(cacheKey, VMS_TTL_24H);
  if (cached) return cached;

  try {
    /* Kenneth French daily 5-factor data */
    const ffUrl    = 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Research_Data_5_Factors_2x3_daily_CSV.zip';
    /* Use allorigins proxy to bypass CORS — the zip contains a CSV */
    /* Note: allorigins returns the raw zip bytes; we attempt text decode */
    const proxyUrl = `${VMS_PROXY}${encodeURIComponent(ffUrl)}`;

    /* Alternative: use the txt version which some mirrors expose */
    const txtUrl   = 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Research_Data_5_Factors_2x3_daily_TXT.zip';
    const altProxy = `${VMS_PROXY}${encodeURIComponent(txtUrl)}`;

    let text = null;
    for (const pUrl of [proxyUrl, altProxy]) {
      try {
        text = await _vmsFetch(pUrl, { timeout: 15000, text: true });
        if (text && text.includes('Mkt-RF')) break;
        text = null;
      } catch (_) { text = null; }
    }

    if (!text) {
      /* Graceful fallback: return null (factor betas remain missing) */
      console.warn('[VMS] French factors: CSV not accessible via proxy. Factor betas unavailable.');
      return null;
    }

    /* Parse CSV: Date  Mkt-RF  SMB  HML  RMW  CMA  RF */
    const lines  = text.split('\n');
    const dataStart = lines.findIndex(l => /^\d{8}/.test(l.trim()));
    if (dataStart < 0) return null;

    const factors = { mktRF:[], smb:[], hml:[], rmw:[], cma:[], rf:[] };
    const ffDates = [];

    for (let i = dataStart; i < lines.length; i++) {
      const parts = lines[i].trim().split(/\s+/);
      if (parts.length < 6 || !/^\d{8}$/.test(parts[0])) continue;
      ffDates.push(parts[0]);
      factors.mktRF.push(parseFloat(parts[1]) / 100);
      factors.smb.push(  parseFloat(parts[2]) / 100);
      factors.hml.push(  parseFloat(parts[3]) / 100);
      factors.rmw.push(  parseFloat(parts[4]) / 100);
      factors.cma.push(  parseFloat(parts[5]) / 100);
      factors.rf.push(   parseFloat(parts[6]) / 100);
    }

    /* Get asset log returns from technical.js cache */
    const closes = _getCloses(sym, 50);
    if (!closes) return null;

    /* Align: use last N bars (approx 252 = 1 year) */
    const N         = Math.min(252, closes.length - 1, factors.mktRF.length);
    const assetRets = _logReturns(closes.slice(-(N+1)));
    const slice     = (arr) => arr.slice(-N);

    /* Excess returns = asset return − Rf */
    const excessRets = assetRets.slice(-N).map((r, i) => r - slice(factors.rf)[i]);

    const betas = {
      value:    _ols(slice(factors.hml),   excessRets),  /* Value (HML) */
      size:     _ols(slice(factors.smb),   excessRets),  /* Size  (SMB) */
      quality:  _ols(slice(factors.rmw),   excessRets),  /* Quality/Profitability (RMW) */
      momentum: null,                                     /* Carhart MOM not in FF5 */
      lowVol:   _ols(slice(factors.cma),   excessRets),  /* Investment/Low-invest (CMA) */
      market:   _ols(slice(factors.mktRF), excessRets),  /* Market beta */
    };

    const result = {
      ticker:  sym,
      obs:     N,
      betas:   {
        value:    betas.value   !== null ? +betas.value.toFixed(4)   : null,
        size:     betas.size    !== null ? +betas.size.toFixed(4)    : null,
        quality:  betas.quality !== null ? +betas.quality.toFixed(4) : null,
        lowVol:   betas.lowVol  !== null ? +betas.lowVol.toFixed(4)  : null,
        market:   betas.market  !== null ? +betas.market.toFixed(4)  : null,
        momentum: null,   /* requires Carhart MOM series — not in FF5 */
      },
      _src: 'Kenneth French Data Library (no key)',
    };

    _vmsCacheSet(cacheKey, result);
    return result;
  } catch (_) { return null; }
};

/* ── [G2-17] Duration & Convexity from Treasury Yield Curve ───────
   Uses window._treasuryYields (already populated by fred.js/Treasury Direct).
   For a generic bond given coupon, maturity, face value.           */

/**
 * computeBondDuration(couponRate, maturityYears, yieldRate, freq)
 * Macaulay + Modified duration + Convexity using standard bond math.
 *
 * @param {number} couponRate    — annual coupon rate as decimal (e.g. 0.04)
 * @param {number} maturityYears — years to maturity (e.g. 10)
 * @param {number} yieldRate     — YTM as decimal (e.g. 0.045)
 * @param {number} freq          — coupon payments per year (default 2 = semi-annual)
 * @returns {{ macaulayDuration, modifiedDuration, convexity, price }}
 */
window.computeBondDuration = function computeBondDuration(
  couponRate, maturityYears, yieldRate, freq = 2
) {
  if (!couponRate || !maturityYears || !yieldRate) return null;

  const c  = couponRate / freq;          /* coupon per period */
  const y  = yieldRate  / freq;          /* yield per period  */
  const n  = Math.round(maturityYears * freq);   /* total periods */
  const fv = 100;                         /* face value */

  /* Price (PV of cash flows) */
  let price      = 0;
  let durNum     = 0;   /* Macaulay numerator */
  let convexNum  = 0;   /* Convexity numerator */

  for (let t = 1; t <= n; t++) {
    const cf    = (t === n) ? c * fv + fv : c * fv;
    const df    = Math.pow(1 + y, -t);
    const pv    = cf * df;
    price      += pv;
    durNum     += (t / freq) * pv;          /* weight by time in years */
    convexNum  += (t * (t + 1)) / Math.pow(1 + y, t + 2) * cf / fv;
  }

  const macaulayDuration  = durNum / price;
  const modifiedDuration  = macaulayDuration / (1 + y);
  const convexity         = convexNum / (freq * freq);

  return {
    price:             +price.toFixed(4),
    macaulayDuration:  +macaulayDuration.toFixed(4),
    modifiedDuration:  +modifiedDuration.toFixed(4),
    convexity:         +convexity.toFixed(4),
    dv01:              +(modifiedDuration * price * 0.0001).toFixed(6),  /* $ per bp per 100 face */
  };
};

/**
 * getDurationFromYieldCurve(maturityYears)
 * For a par bond at the current Treasury yield for the given maturity.
 * Uses window._treasuryYields populated by fred.js.
 */
window.getDurationFromYieldCurve = function getDurationFromYieldCurve(maturityYears) {
  const yields = window._treasuryYields;
  if (!yields) return null;

  /* Find nearest maturity */
  const maturities = { 1:1, 2:2, 3:3, 5:5, 7:7, 10:10, 20:20, 30:30 };
  const keys = Object.keys(maturities).map(Number).sort((a,b) => a-b);
  const nearest = keys.reduce((prev, curr) =>
    Math.abs(curr - maturityYears) < Math.abs(prev - maturityYears) ? curr : prev
  );

  const yieldPct = yields[nearest + 'Y'] || yields['10Y'];
  if (!yieldPct) return null;

  const y = yieldPct / 100;
  return computeBondDuration(y, nearest, y, 2);   /* par bond: coupon = yield */
};

/* ── [G2-18] Macro Regime Detection Engine ────────────────────────
   Rule-based classifier using VIX, yield curve, HY spreads, CPI.
   All inputs already available in the terminal.
   Returns regime label + confidence + weight-shift direction.       */

const REGIME_RULES = [
  /* Each rule: { id, label, conditions, weights_shift } */
  {
    id: 'crisis',
    label: 'Crisis (Risk-Off)',
    test: (s) => s.vix > 30 && s.hyOAS > 600,
    confidence: (s) => Math.min(1, (s.vix - 30)/20 + (s.hyOAS - 600)/400),
    weights: { valuation:+1, growth:-1, quality:+1, momentum:-1, risk:+1, liquidity:+1, credit:+1, macro:+1 },
  },
  {
    id: 'credit_stress',
    label: 'Credit Stress',
    test: (s) => s.hyOAS > 500 && s.igOAS > 150,
    confidence: (s) => Math.min(1, (s.hyOAS - 500)/400),
    weights: { valuation:+1, growth:-1, quality:+1, momentum:-1, risk:+1, liquidity:+1, credit:+2, macro:+1 },
  },
  {
    id: 'high_inflation',
    label: 'High Inflation',
    test: (s) => s.cpi > 4,
    confidence: (s) => Math.min(1, (s.cpi - 4) / 4),
    weights: { valuation:+1, growth:-1, quality:+1, momentum:0, risk:+1, liquidity:0, credit:0, macro:+1 },
  },
  {
    id: 'rising_rates',
    label: 'Rising Rates',
    test: (s) => s.rateChange3M > 0.3,   /* 30bp move in 3M */
    confidence: (s) => Math.min(1, s.rateChange3M / 1.0),
    weights: { valuation:+1, growth:-1, quality:+1, momentum:0, risk:+1, liquidity:0, credit:0, macro:+1 },
  },
  {
    id: 'recession_risk',
    label: 'Recession Risk',
    test: (s) => s.yieldCurve10Y2Y < -0.2 && s.vix > 20,
    confidence: (s) => Math.min(1, (-s.yieldCurve10Y2Y - 0.2) / 1.0),
    weights: { valuation:+1, growth:-1, quality:+1, momentum:-1, risk:+1, liquidity:+1, credit:+1, macro:+1 },
  },
  {
    id: 'late_cycle',
    label: 'Late Cycle / Precarious',
    test: (s) => s.yieldCurve10Y2Y < 0.3 && s.yieldCurve10Y2Y >= -0.2 && s.vix < 25,
    confidence: (s) => 0.6,
    weights: { valuation:0, growth:-1, quality:+1, momentum:0, risk:+1, liquidity:0, credit:0, macro:0 },
  },
  {
    id: 'high_volatility',
    label: 'High Volatility',
    test: (s) => s.vix > 25 && s.vix <= 30,
    confidence: (s) => Math.min(1, (s.vix - 25) / 10),
    weights: { valuation:0, growth:-1, quality:+1, momentum:-1, risk:+2, liquidity:+1, credit:+1, macro:+1 },
  },
  {
    id: 'expansion',
    label: 'Expansion (Risk-On)',
    test: (s) => s.vix < 18 && s.yieldCurve10Y2Y > 0.5 && s.hyOAS < 350,
    confidence: (s) => Math.min(1, (18 - s.vix)/8 + (s.yieldCurve10Y2Y - 0.5)/2),
    weights: { valuation:-1, growth:+1, quality:0, momentum:+1, risk:-1, liquidity:-1, credit:-1, macro:0 },
  },
  {
    id: 'low_volatility',
    label: 'Low Volatility',
    test: (s) => s.vix < 14,
    confidence: (s) => Math.min(1, (14 - s.vix) / 6),
    weights: { valuation:-1, growth:+1, quality:0, momentum:+1, risk:-1, liquidity:-1, credit:-1, macro:0 },
  },
];

/**
 * detectMacroRegime()
 * Classifies the current macro regime from live terminal signals.
 * Returns primary regime + confidence + weight-shift directions.
 *
 * @returns {{ regime, label, confidence, weightShifts, signals }}
 */
window.detectMacroRegime = function detectMacroRegime() {
  const cacheKey = 'regime_current';
  const cached   = _vmsCacheGet(cacheKey, VMS_TTL_1H);
  if (cached) return cached;

  /* Gather signals from existing terminal globals */
  const signals = {
    vix:             window._vixLive?.current        ?? 20,
    hyOAS:           window._creditData?.macro?.hyOAS
                     ?? (window._valuationData &&
                         Object.values(window._valuationData)[0]
                           ?.macroSensitivity?.hyOAS) ?? 350,
    igOAS:           null,
    yieldCurve10Y2Y: window._treasuryYields
                     ? (window._treasuryYields['10Y'] || 0) - (window._treasuryYields['2Y'] || 0)
                     : 0.5,
    cpi:             4.0,        /* fallback; updated below from FRED cache */
    rateChange3M:    0,          /* rate change proxy */
  };

  /* Try to read CPI from FRED sessionStorage cache */
  try {
    const raw = sessionStorage.getItem('CPIAUCSL' + JSON.stringify({ limit: 5 }));
    if (raw) {
      const obs = JSON.parse(raw);
      if (obs?.data?.length >= 2) {
        const v0 = parseFloat(obs.data[0].value);
        const v1 = parseFloat(obs.data[1].value);
        if (!isNaN(v0) && !isNaN(v1) && v1 > 0) {
          signals.cpi = (v0 - v1) / v1 * 1200;   /* annualised MoM */
        }
      }
    }
  } catch (_) { /* use fallback */ }

  /* Rate change proxy from treasury yields */
  if (window._treasuryYields) {
    const y10 = window._treasuryYields['10Y'];
    signals.rateChange3M = y10 ? Math.max(0, y10 - 3.5) : 0;   /* rough: diff from neutral */
  }

  /* Evaluate all rules; pick highest-confidence match */
  let best = null;
  for (const rule of REGIME_RULES) {
    if (rule.test(signals)) {
      const conf = rule.confidence(signals);
      if (!best || conf > best.confidence) {
        best = {
          regime:       rule.id,
          label:        rule.label,
          confidence:   +conf.toFixed(3),
          weightShifts: rule.weights,
          signals,
        };
      }
    }
  }

  /* Default if no rule fires */
  if (!best) {
    best = {
      regime:       'neutral',
      label:        'Neutral / Unclear',
      confidence:   0.3,
      weightShifts: { valuation:0, growth:0, quality:0, momentum:0, risk:0, liquidity:0, credit:0, macro:0 },
      signals,
    };
  }

  _vmsCacheSet(cacheKey, best);
  window._currentRegime = best;
  return best;
};

/* ── [G2-19] UARS Normalisation Pipeline ─────────────────────────
   Implements Operators A, B, C, D from the framework (Doc 3).
   Used by the dimension score aggregator below.                     */

/**
 * normaliseMetrics(metricsObj, peerArray, operator)
 * Normalises a raw metric object against a peer distribution.
 *
 * @param {Object} metricsObj       — { key: rawValue, ... }
 * @param {Array}  peerArray        — array of peer raw values (same key)
 * @param {'A'|'B'|'C'|'D'} operator
 * @param {boolean} higherIsBetter  — directional alignment flag
 * @returns {Object} — { key: normalised 0-100, ... }
 */
window.normaliseMetric = function normaliseMetric(rawValue, peerValues, operator = 'B', higherIsBetter = true) {
  if (rawValue === null || rawValue === undefined || isNaN(rawValue)) return null;

  /* Direction alignment */
  const xStar = higherIsBetter ? rawValue : -rawValue;
  const peers  = (peerValues || [])
    .filter(v => v !== null && v !== undefined && isFinite(v))
    .map(v => higherIsBetter ? v : -v);

  if (operator === 'A') {
    /* Robust z-score → percentile */
    if (!peers.length) return 50;
    const sorted = [...peers].sort((a,b) => a-b);
    const med    = sorted[Math.floor(sorted.length / 2)];
    const diffs  = sorted.map(v => Math.abs(v - med));
    const mad    = diffs.sort((a,b) => a-b)[Math.floor(diffs.length / 2)] || 1;
    return _robustZ(xStar, med, mad);
  }

  if (operator === 'B') {
    /* Empirical percentile rank */
    if (!peers.length) return 50;
    return _percentileRank(xStar, peers);
  }

  if (operator === 'C') {
    /* Min-max with winsorisation */
    if (!peers.length) return 50;
    const sorted = [...peers].sort((a,b) => a-b);
    const p1  = sorted[Math.floor(sorted.length * 0.01)] ?? sorted[0];
    const p99 = sorted[Math.ceil(sorted.length  * 0.99)] ?? sorted[sorted.length-1];
    const range = p99 - p1;
    if (range === 0) return 50;
    return Math.round(Math.min(100, Math.max(0, (xStar - p1) / range * 100)));
  }

  if (operator === 'D') {
    /* Benchmark-relative: subtract benchmark, then apply Operator A */
    const benchVal = peers.length ? peers.reduce((a,b) => a+b, 0) / peers.length : 0;
    const relative = xStar - benchVal;
    const relPeers = peers.map(v => v - benchVal);
    return window.normaliseMetric(relative, relPeers, 'A', true);
  }

  return 50;
};

/* ── [G2-20] Dimension Score Aggregator — Full UARS ──────────────
   Implements: AS = Σ w_k(c,r) · D_k  with regime-adjusted weights
   and penalty multipliers P_liq · P_tail · P_dq · P_struct.        */

/* Baseline dimension weights per asset class (from Doc 2/3) */
const UARS_BASE_WEIGHTS = {
  equity: {
    valuation: 0.18, growth: 0.12, quality: 0.14, profitability: 0.12,
    momentum:  0.14, risk:   0.16, liquidity: 0.07, macro: 0.07,
  },
  bond: {
    yield: 0.20, credit: 0.20, spread: 0.15, spreadDuration: 0.10,
    rateRisk: 0.12, liquidity: 0.10, macro: 0.13,
  },
  fx: {
    carry: 0.25, momentum: 0.20, valuation: 0.15,
    risk:  0.20, liquidity: 0.10, macro: 0.10,
  },
  commodity: {
    termStructure: 0.20, inventory: 0.15, supplyDemand: 0.15,
    momentum: 0.15, risk: 0.15, macro: 0.15, liquidity: 0.05,
  },
  crypto: {
    adoption: 0.20, networkQuality: 0.15, tokenomics: 0.15,
    momentum: 0.15, risk: 0.15, liquidity: 0.10, macro: 0.10,
  },
};

/* Regime weight shift bands (±fraction of baseline) */
const REGIME_WEIGHT_ADJUSTMENTS = {
  expansion:      { growth: +0.04, momentum: +0.03, risk: -0.03, valuation: -0.02 },
  low_volatility: { growth: +0.03, momentum: +0.03, risk: -0.03, valuation: -0.02 },
  crisis:         { risk: +0.05, liquidity: +0.05, credit: +0.04, growth: -0.05, momentum: -0.04 },
  credit_stress:  { credit: +0.06, risk: +0.04, liquidity: +0.03, growth: -0.05, momentum: -0.04 },
  high_inflation: { valuation: +0.04, macro: +0.03, growth: -0.03 },
  rising_rates:   { risk: +0.03, macro: +0.02, growth: -0.03 },
  recession_risk: { risk: +0.04, liquidity: +0.03, quality: +0.03, growth: -0.05, momentum: -0.03 },
  late_cycle:     { quality: +0.03, risk: +0.02, growth: -0.02 },
  high_volatility:{ risk: +0.04, liquidity: +0.02, quality: +0.02, growth: -0.03, momentum: -0.03 },
  neutral:        {},
};

/**
 * computeUARSScore(dimensionScores, assetClass, regime)
 * Aggregates dimension scores using regime-adjusted weights.
 * Applies all four penalty multipliers.
 *
 * @param {Object} dimensionScores  — { valuation: 0-100, growth: 0-100, ... }
 * @param {string} assetClass       — 'equity'|'bond'|'fx'|'commodity'|'crypto'
 * @param {Object} regime           — output of detectMacroRegime()
 * @param {Object} penalties        — { P_liq, P_tail, P_dq, P_struct } each ∈ [0.6,1.0]
 * @returns {{ assetScore, cas, weights, breakdown }}
 */
window.computeUARSScore = function computeUARSScore(
  dimensionScores, assetClass = 'equity', regime = null, penalties = {}
) {
  const baseWeights  = UARS_BASE_WEIGHTS[assetClass] || UARS_BASE_WEIGHTS.equity;
  const regimeId     = regime?.regime || 'neutral';
  const adjustments  = REGIME_WEIGHT_ADJUSTMENTS[regimeId] || {};

  /* Apply regime adjustments (bounded: min 0.02, max stays reasonable) */
  const weights = {};
  let totalW = 0;
  for (const [dim, w] of Object.entries(baseWeights)) {
    const adj = adjustments[dim] || 0;
    weights[dim] = Math.max(0.02, w + adj);
    totalW += weights[dim];
  }
  /* Renormalise to sum = 1 */
  for (const dim of Object.keys(weights)) weights[dim] /= totalW;

  /* Compute weighted asset score */
  let numerator = 0, denominator = 0;
  const breakdown = {};
  for (const [dim, w] of Object.entries(weights)) {
    const score = dimensionScores[dim];
    if (score !== null && score !== undefined && !isNaN(score)) {
      numerator   += w * score;
      denominator += w;
      breakdown[dim] = { score, weight: +w.toFixed(4), contribution: +(w * score).toFixed(2) };
    }
  }

  const assetScore = denominator > 0 ? +(numerator / denominator).toFixed(2) : 50;

  /* Apply penalty multipliers */
  const P_liq    = penalties.P_liq    ?? 1.0;
  const P_tail   = penalties.P_tail   ?? 1.0;
  const P_dq     = penalties.P_dq     ?? 1.0;
  const P_struct = penalties.P_struct ?? 1.0;

  /* CAS = AS · P_liq · P_tail · P_dq · P_struct */
  const cas = +(assetScore * P_liq * P_tail * P_dq * P_struct).toFixed(2);

  /* Rating translation */
  const ratingScale = [
    [90, 'Exceptional'], [80, 'Very Attractive'], [70, 'Attractive'],
    [60, 'Neutral'],     [50, 'Weak'],            [0,  'Unattractive'],
  ];
  const rating = ratingScale.find(([threshold]) => cas >= threshold)?.[1] || 'Unattractive';

  return {
    assetScore,
    cas,
    rating,
    weights,
    breakdown,
    penalties:    { P_liq, P_tail, P_dq, P_struct },
    regime:       regime?.label || 'Unknown',
    regimeConf:   regime?.confidence || 0,
  };
};

/* ══════════════════════════════════════════════════════════════════
   GROUP 3 — FREE-KEY SOURCES (already registered in config.js)
   ══════════════════════════════════════════════════════════════════ */

/* ── [G3-21] FRED G10 Short Rates — FX Carry ──────────────────────
   Fetches short-rate series for G10 currencies from FRED.
   Interest differential = domestic rate − foreign rate = carry proxy. */

/* FRED series IDs for 3M interbank/policy rates */
const FRED_SHORT_RATES = {
  'USD': 'DGS3MO',                /* US 3M Treasury yield */
  'EUR': 'IR3TIB01EZM156N',       /* ECB 3M interbank     */
  'GBP': 'IR3TIB01GBM156N',       /* UK 3M interbank      */
  'JPY': 'IR3TIB01JPM156N',       /* Japan 3M interbank   */
  'CHF': 'IR3TIB01CHM156N',       /* Switzerland 3M       */
  'CAD': 'IR3TIB01CAM156N',       /* Canada 3M            */
  'AUD': 'IR3TIB01AUM156N',       /* Australia 3M         */
  'NZD': 'IR3TIB01NZM156N',       /* New Zealand 3M       */
  'SEK': 'IR3TIB01SEM156N',       /* Sweden 3M            */
  'NOK': 'IR3TIB01NOM156N',       /* Norway 3M            */
};

/**
 * getFXCarry(baseCcy, quoteCcy)
 * Returns the interest rate differential (base − quote) as carry signal.
 * Positive carry = long base currency is profitable.
 *
 * @param {string} baseCcy   — e.g. 'AUD'
 * @param {string} quoteCcy  — e.g. 'USD'
 */
window.getFXCarry = async function getFXCarry(baseCcy, quoteCcy = 'USD') {
  const base  = baseCcy.toUpperCase().slice(0, 3);
  const quote = quoteCcy.toUpperCase().slice(0, 3);
  const cacheKey = `fx_carry_${base}_${quote}`;
  const cached   = _vmsCacheGet(cacheKey, VMS_TTL_24H);
  if (cached) return cached;

  if (typeof fredFetch !== 'function') return null;

  const baseSeriesId  = FRED_SHORT_RATES[base];
  const quoteSeriesId = FRED_SHORT_RATES[quote];
  if (!baseSeriesId || !quoteSeriesId) return null;

  try {
    const [baseObs, quoteObs] = await Promise.allSettled([
      fredFetch(baseSeriesId,  { limit: 3, frequency: 'm' }),
      fredFetch(quoteSeriesId, { limit: 3, frequency: 'm' }),
    ]);

    const baseRate  = baseObs.status  === 'fulfilled' && baseObs.value?.length
      ? parseFloat(baseObs.value[0].value)  : null;
    const quoteRate = quoteObs.status === 'fulfilled' && quoteObs.value?.length
      ? parseFloat(quoteObs.value[0].value) : null;

    if (baseRate === null || quoteRate === null) return null;

    const differential = baseRate - quoteRate;   /* positive = carry long base */

    /* Carry score: differential +4% → 100, 0% → 50, −4% → 0 */
    const carryScore = Math.round(Math.min(100, Math.max(0, 50 + differential * 12.5)));

    const result = {
      baseCcy:      base,
      quoteCcy:     quote,
      baseRate:     +baseRate.toFixed(4),
      quoteRate:    +quoteRate.toFixed(4),
      differential: +differential.toFixed(4),
      carryScore,
      _src:         `FRED: ${baseSeriesId} − ${quoteSeriesId}`,
    };

    _vmsCacheSet(cacheKey, result);
    return result;
  } catch (_) { return null; }
};

/* ── [G3-22] BLS PPI Commodity Series ────────────────────────────
   Key commodity PPI series from Bureau of Labor Statistics.
   Provides: MoM and YoY price inflation for commodities.            */

const BLS_PPI_SERIES = {
  'CL':  'WPU0561',     /* Crude petroleum                */
  'NG':  'WPU0531',     /* Natural gas                    */
  'GC':  'WPU10210501', /* Gold                           */
  'SI':  'WPU10210502', /* Silver                         */
  'HG':  'WPU102104',   /* Copper                         */
  'ZC':  'WPU012101',   /* Corn                           */
  'ZW':  'WPU012201',   /* Wheat                          */
  'ZS':  'WPU012202',   /* Soybeans                       */
};

/**
 * getBLSCommodityPPI(productCode)
 * Fetches BLS PPI monthly series for a commodity.
 * Returns latest value + MoM + YoY inflation.
 *
 * @param {string} productCode  — e.g. 'CL', 'GC', 'ZC'
 */
window.getBLSCommodityPPI = async function getBLSCommodityPPI(productCode) {
  const code     = productCode.toUpperCase();
  const seriesId = BLS_PPI_SERIES[code];
  if (!seriesId) return null;

  const blsKey   = (typeof getBlsKey === 'function') ? getBlsKey() : '';
  if (!blsKey) return null;

  const cacheKey = `bls_ppi_${code}`;
  const cached   = _vmsCacheGet(cacheKey, VMS_TTL_24H);
  if (cached) return cached;

  try {
    const url  = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
    const body = JSON.stringify({
      seriesid: [seriesId],
      startyear: String(new Date().getFullYear() - 2),
      endyear:   String(new Date().getFullYear()),
      registrationkey: blsKey,
    });

    _vmsBump();
    const res  = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal:  AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = await res.json();

    const series = data?.Results?.series?.[0]?.data;
    if (!series || !series.length) return null;

    /* BLS returns newest first */
    const sorted = [...series].sort((a, b) =>
      b.year !== a.year ? b.year - a.year : b.period.localeCompare(a.period)
    );

    const latest = parseFloat(sorted[0].value);
    const prev1M = sorted.length >= 2  ? parseFloat(sorted[1].value)  : null;
    const prev12M= sorted.length >= 13 ? parseFloat(sorted[12].value) : null;

    const mom   = prev1M  && prev1M  > 0 ? (latest - prev1M)  / prev1M  : null;
    const yoy   = prev12M && prev12M > 0 ? (latest - prev12M) / prev12M : null;

    const result = {
      code,
      seriesId,
      latestIndex: +latest.toFixed(2),
      mom:         mom  !== null ? +mom.toFixed(6)  : null,
      yoy:         yoy  !== null ? +yoy.toFixed(6)  : null,
      period:      `${sorted[0].year}-${sorted[0].period}`,
      _src:        `BLS PPI: ${seriesId}`,
    };

    _vmsCacheSet(cacheKey, result);
    return result;
  } catch (_) { return null; }
};

/* ── [G3-23] EIA Petroleum & Gas Inventory — Z-Score ─────────────
   Extends the existing energy.js EIA integration.
   Adds: 5-year seasonal z-score for crude, distillate, nat-gas.    */

const EIA_INVENTORY_SERIES = {
  'crude':       'PET.WCRSTUS1.W',   /* Crude Oil Stocks (weekly, kb)      */
  'distillate':  'PET.WDISTUS1.W',   /* Distillate Fuel Stocks             */
  'gasoline':    'PET.WGTSTUS1.W',   /* Gasoline Stocks                    */
  'natgas':      'NG.NW2_EPG0_SWO_R48_BCF.W', /* Nat Gas Working Storage   */
};

/**
 * getEIAInventoryZScore(commodity)
 * Returns current stocks + 5Y seasonal average + z-score.
 *
 * @param {'crude'|'distillate'|'gasoline'|'natgas'} commodity
 */
window.getEIAInventoryZScore = async function getEIAInventoryZScore(commodity = 'crude') {
  const seriesId = EIA_INVENTORY_SERIES[commodity];
  if (!seriesId) return null;

  const eiaKey   = (typeof getEiaKey === 'function') ? getEiaKey() : '';
  if (!eiaKey) return null;

  const cacheKey = `eia_inv_${commodity}`;
  const cached   = _vmsCacheGet(cacheKey, VMS_TTL_24H);
  if (cached) return cached;

  try {
    /* Fetch 3 years of weekly data (≈156 weeks) for seasonal baseline */
    const url  = `https://api.eia.gov/v2/seriesid/${encodeURIComponent(seriesId)}`
               + `?api_key=${eiaKey}&out=json&num=260`;

    _vmsBump();
    const data = await fetch(url, { signal: AbortSignal.timeout(12000) }).then(r => r.json());

    const points = data?.response?.data || data?.series?.[0]?.data || [];
    if (!points.length) return null;

    /* Sort ascending by date */
    const sorted = [...points]
      .map(p => ({ date: p.period || p[0], value: parseFloat(p.value || p[1]) }))
      .filter(p => !isNaN(p.value) && p.value > 0)
      .sort((a, b) => a.date < b.date ? -1 : 1);

    if (sorted.length < 52) return null;

    const latestValue = sorted[sorted.length - 1].value;

    /* 5Y seasonal mean: average same week-of-year over prior 5 years */
    const latestDate  = sorted[sorted.length - 1].date;
    const weekOfYear  = Math.floor((new Date(latestDate) - new Date(latestDate.slice(0,4) + '-01-01')) / 604800000) + 1;

    const seasonal = sorted.filter(p => {
      const d = new Date(p.date);
      const woy = Math.floor((d - new Date(d.getFullYear() + '-01-01')) / 604800000) + 1;
      return Math.abs(woy - weekOfYear) <= 1;
    });

    const mean5Y = seasonal.length >= 3
      ? seasonal.reduce((a, p) => a + p.value, 0) / seasonal.length
      : latestValue;

    const vals5Y = seasonal.map(p => p.value);
    const diffs  = vals5Y.map(v => v - mean5Y);
    const stdDev = Math.sqrt(diffs.reduce((a,d) => a + d*d, 0) / (diffs.length || 1)) || 1;
    const zScore = (latestValue - mean5Y) / stdDev;

    /* Inventory score: high stocks → bearish for prices → low score */
    const inventoryScore = Math.round(Math.min(100, Math.max(0, 50 - zScore * 20)));

    const result = {
      commodity,
      latestValue:    +latestValue.toFixed(0),
      mean5Y:         +mean5Y.toFixed(0),
      zScore:         +zScore.toFixed(3),
      inventoryScore,
      latestDate,
      unit:           commodity === 'natgas' ? 'Bcf' : 'kb',
      _src:           `EIA: ${seriesId}`,
    };

    _vmsCacheSet(cacheKey, result);
    return result;
  } catch (_) { return null; }
};

/* ── [G3-24] EODHD Bond Duration — Modified Duration per instrument */

/**
 * getEODHDBondDuration(isinOrTicker)
 * Fetches bond fundamentals from EODHD including modified duration.
 * Returns duration, convexity, YTM.
 *
 * @param {string} isinOrTicker  — ISIN or EODHD bond ticker
 */
window.getEODHDBondDuration = async function getEODHDBondDuration(isinOrTicker) {
  const sym    = isinOrTicker.toUpperCase().replace(/.*:/, '');
  const eodKey = (typeof getEodhdKey === 'function') ? getEodhdKey() : '';
  if (!eodKey) return null;

  const cacheKey = `eodhd_bond_dur_${sym}`;
  const cached   = _vmsCacheGet(cacheKey, VMS_TTL_24H);
  if (cached) return cached;

  try {
    const url  = `https://eodhd.com/api/fundamentals/${sym}?api_token=${eodKey}&fmt=json`;
    _vmsBump();
    const data = await fetch(url, { signal: AbortSignal.timeout(10000) }).then(r => r.json());

    /* EODHD bond fundamentals schema */
    const bond = data?.Bond || data?.bond || {};
    const mod  = parseFloat(bond.modifiedDuration || bond.ModifiedDuration || 0);
    const mac  = parseFloat(bond.macaulayDuration  || bond.MacaulayDuration  || 0);
    const conv = parseFloat(bond.convexity         || bond.Convexity         || 0);
    const ytm  = parseFloat(bond.ytm               || bond.YTM               || 0);

    if (!mod && !mac) return null;

    const result = {
      ticker:             sym,
      modifiedDuration:   mod  || null,
      macaulayDuration:   mac  || null,
      convexity:          conv || null,
      ytm:                ytm  || null,
      dv01:               mod  ? +(mod * 0.0001).toFixed(6) : null,
      _src:               'EODHD bond fundamentals',
    };

    _vmsCacheSet(cacheKey, result);
    return result;
  } catch (_) { return null; }
};

/* ══════════════════════════════════════════════════════════════════
   MASTER INTEGRATION FUNCTION
   Extends assembleValuationData with all new sources.
   Call this after assembleValuationData() to enrich the object.
   ══════════════════════════════════════════════════════════════════ */

/**
 * enrichValuationData(ticker)
 * Runs all new pipelines and patches window._valuationData[sym].
 * Idempotent — safe to call multiple times.
 *
 * @param {string} ticker
 */
window.enrichValuationData = async function enrichValuationData(ticker) {
  if (!ticker) return;
  const sym = ticker.replace(/.*:/, '').toUpperCase();

  /* Wait for base assembly if not yet done */
  if (!window._valuationData?.[sym]) {
    if (typeof assembleValuationData === 'function') {
      await assembleValuationData(ticker);
    }
  }

  const vd = window._valuationData?.[sym];
  if (!vd) return;

  const assetClass = vd.assetClass || 'equity';

  /* ── Regime detection (always) ── */
  const regime = detectMacroRegime();
  vd.regime = regime;

  /* ── Penalty multipliers ── */
  vd.penalties = {
    P_liq:    computePenaltyLiq(vd.liquidityMetrics),
    P_tail:   computePenaltyTail(vd.riskMetrics),
    P_struct: computePenaltyStruct(vd),
    P_dq:     vd.coverage
              ? +(1 - 0.5 * vd.coverage.missingRate).toFixed(4)
              : 0.9,
  };

  /* ── Computed betas (all asset classes) ── */
  const [corrResult, inflResult, rateResult, gdpResult] = await Promise.allSettled([
    getCorrelationToBench(sym),
    getInflationBeta(sym),
    getRateBeta(sym),
    getGDPBeta(sym),
  ]);

  vd.macroSensitivity = vd.macroSensitivity || {};
  if (corrResult.status  === 'fulfilled' && corrResult.value)
    vd.macroSensitivity.corrToBench    = corrResult.value.correlation;
  if (inflResult.status  === 'fulfilled' && inflResult.value)
    vd.macroSensitivity.inflBeta3Y     = inflResult.value.inflBeta;
  if (rateResult.status  === 'fulfilled' && rateResult.value)
    vd.macroSensitivity.rateBeta3Y     = rateResult.value.rateBeta;
  if (gdpResult.status   === 'fulfilled' && gdpResult.value)
    vd.macroSensitivity.gdpBeta5Y      = gdpResult.value.gdpBeta;

  /* ── Formal Amihud ── */
  const amihud = computeAmihud(sym);
  if (amihud !== null) {
    vd.liquidityMetrics = vd.liquidityMetrics || {};
    vd.liquidityMetrics.amihud = amihud;
    /* Recompute P_liq with formal Amihud */
    vd.penalties.P_liq = computePenaltyLiq(vd.liquidityMetrics);
  }

  /* ── Recession vulnerability score ── */
  vd.macroSensitivity.recessionVulnScore = computeRecessionVulnScore(vd);

  /* ── Credit rating numeric score ── */
  if (vd.creditQuality) {
    const agencyRating = vd.creditQuality.agencyRating || vd.creditQuality.tierLabel;
    const numericFromNotch = creditRatingToNumeric(agencyRating);
    if (numericFromNotch !== null)
      vd.creditQuality.numericScoreFromNotch = numericFromNotch;
  }

  /* ── Factor betas (equity only) ── */
  if (assetClass === 'equity' || assetClass === 'etf' || assetClass === 'reit') {
    const factorResult = await getFactorBetas(sym).catch(() => null);
    if (factorResult) vd.factorBetas = factorResult.betas;
  }

  /* ── FX-specific enrichments ── */
  if (assetClass === 'fx') {
    const pair     = sym.slice(0, 6);
    const baseCcy  = pair.slice(0, 3);
    const quoteCcy = pair.slice(3, 6);

    const [reerResult, carryResult, baResult] = await Promise.allSettled([
      getFXReer(baseCcy),
      getFXCarry(baseCcy, quoteCcy),
      getFXBidAskProxy(pair),
    ]);

    vd.fxMetrics = {};
    if (reerResult.status  === 'fulfilled') vd.fxMetrics.reer   = reerResult.value;
    if (carryResult.status === 'fulfilled') vd.fxMetrics.carry  = carryResult.value;
    if (baResult.status    === 'fulfilled') vd.fxMetrics.bidAsk = baResult.value;
  }

  /* ── Commodity-specific enrichments ── */
  if (assetClass === 'commodity') {
    const cmeCodes = Object.keys(CME_PRODUCTS);
    const matchCode = cmeCodes.find(c =>
      sym === c || sym.includes(c) || STOOQ_COMMODITY_MAP[c] === sym.toLowerCase()
    );

    if (matchCode) {
      const [termResult, momResult, stuResult] = await Promise.allSettled([
        getCMETermStructure(matchCode),
        getCommodityMomentum(matchCode),
        getUSDAStocksToUse(matchCode),
      ]);

      vd.commodityMetrics = {};
      if (termResult.status === 'fulfilled') vd.commodityMetrics.termStructure = termResult.value;
      if (momResult.status  === 'fulfilled') vd.commodityMetrics.momentum      = momResult.value;
      if (stuResult.status  === 'fulfilled') vd.commodityMetrics.stocksToUse   = stuResult.value;

      /* EIA inventory enrichment */
      const eiaMap = { 'CL':'crude', 'NG':'natgas' };
      if (eiaMap[matchCode]) {
        const invResult = await getEIAInventoryZScore(eiaMap[matchCode]).catch(() => null);
        if (invResult) vd.commodityMetrics.eiaInventory = invResult;
      }
    }
  }

  /* ── Fixed Income enrichments ── */
  if (assetClass === 'bond') {
    /* Try EODHD for bond duration */
    const bondDur = await getEODHDBondDuration(sym).catch(() => null);
    if (bondDur) {
      vd.bondMetrics = vd.bondMetrics || {};
      Object.assign(vd.bondMetrics, bondDur);
    } else {
      /* Fall back to yield-curve duration estimate */
      const maturity = vd.bondMetrics?.maturityYears || 10;
      const dur = getDurationFromYieldCurve(maturity);
      if (dur) {
        vd.bondMetrics = vd.bondMetrics || {};
        Object.assign(vd.bondMetrics, dur);
      }
    }
  }

  /* ── Recompute UARS score with all enriched data ── */
  /* Build dimension scores map (partial — from available data) */
  const dimScores = _buildDimensionScores(vd, assetClass);
  const uarsResult = computeUARSScore(dimScores, assetClass, regime, vd.penalties);
  vd.uarsScore = uarsResult;

  /* Re-cache */
  try {
    sessionStorage.setItem('vd_full_' + sym,
      JSON.stringify({ ts: Date.now(), data: vd }));
  } catch (_) { /* quota */ }

  if (typeof showApiToast === 'function') {
    showApiToast(`✓ Enriched: ${sym} → CAS ${uarsResult.cas} (${uarsResult.rating})`, 'ok');
  }

  return vd;
};

/* ── Internal: build dimension scores from assembled valuation data ── */
function _buildDimensionScores(vd, assetClass) {
  const f  = vd.fundamentals       || {};
  const m  = vd.market             || {};
  const r  = vd.riskMetrics        || {};
  const l  = vd.liquidityMetrics   || {};
  const cr = vd.creditQuality      || {};
  const ma = vd.macroSensitivity   || {};
  const an = vd.analystData        || {};
  const pr = vd.peerRelativeAttractiveness || {};
  const cm = vd.commodityMetrics   || {};
  const fx = vd.fxMetrics          || {};

  /* Peer array for percentile normalisation (if available) */
  const peers = pr.percentileScores || {};

  const _norm = (v, hi = true) => {
    if (v === null || v === undefined || isNaN(v)) return null;
    /* Without a live peer set, use internal thresholds for 0-100 mapping */
    return null;   /* will fall through to raw score if peer data unavailable */
  };

  /* Use percentile scores from peer group if available, else raw mapped scores */
  const peerPE   = peers.peRatioTTM            ?? null;
  const peerFCF  = peers.freeCashFlowYieldTTM  ?? null;
  const peerROE  = peers.roeTTM                ?? null;
  const peerRev  = peers.revenueGrowthTTM      ?? null;

  /* Dimension score builders — each returns 0-100 or null */
  const valuation = _safeAvg([
    peerPE   !== null ? 100 - peerPE   : _mapScore(f.peRatio,         0, 40, true, 'reverse'),
    peerFCF  !== null ? peerFCF        : _mapScore(f.fcfYield,        -0.02, 0.08, true),
    _mapScore(f.pbRatio,         0, 4,    true, 'reverse'),
    _mapScore(f.divYield,        0, 0.06, true),
  ]);

  const growth = _safeAvg([
    peerRev  !== null ? peerRev        : _mapScore(f.revenueGrowth,   -0.1, 0.3,  true),
    _mapScore(f.ebitdaGrowth,  -0.1, 0.3,  true),
    _mapScore(f.epsGrowth,     -0.1, 0.3,  true),
  ]);

  const profitability = _safeAvg([
    peerROE  !== null ? peerROE        : _mapScore(f.roe,            -0.05, 0.3,  true),
    _mapScore(f.roic,              0, 0.25, true),
    _mapScore(f.operatingMargin,  -0.1, 0.35, true),
  ]);

  const quality = _safeAvg([
    _mapScore(f.interestCoverage,  1, 20,   true),
    _mapScore(f.netDebtEbitda,    -1, 6,    true, 'reverse'),
    _mapScore(f.currentRatio,      0.5, 4,  true),
  ]);

  const momentum = _safeAvg([
    _mapScore(m.mom1M,   -0.15, 0.15, true),
    _mapScore(m.mom12M,  -0.3,  0.5,  true),
  ]);

  const risk = _safeAvg([
    _mapScore(r.sharpe12M,      -1, 2,     true),
    _mapScore(r.sortino12M,     -1, 2,     true),
    _mapScore(m.vol30D,          0, 0.6,   true, 'reverse'),
    _mapScore(m.maxDrawdown12M, -0.5, 0,   true),
  ]);

  const liquidity = _safeAvg([
    _mapScore(l.liquidityScore,  0, 100, true),
    l.amihud !== null ? Math.max(0, 100 - l.amihud * 200) : null,
  ]);

  const credit = _safeAvg([
    cr.numericScore || null,
    cr.numericScoreFromNotch || null,
    _mapScore(cr.oasProxy, 0, 500, true, 'reverse'),   /* lower OAS = higher score */
  ]);

  const macro = _safeAvg([
    ma.vix !== null ? Math.max(0, 100 - ma.vix * 2.5) : null,   /* lower VIX = better */
    _mapScore(ma.yieldCurve10Y2Y, -2, 2, true),
    ma.recessionVulnScore !== null ? 100 - ma.recessionVulnScore : null,
  ]);

  /* Asset-class specific overrides */
  if (assetClass === 'commodity') {
    const ts = cm.termStructure?.termStructureScore   ?? null;
    const iv = cm.stocksToUse?.inventoryScore         ?? null;
    const mo = cm.momentum?.mom1M !== null
               ? _mapScore(cm.momentum?.mom1M, -0.15, 0.15, true) : null;
    return { termStructure: ts, inventory: iv, supplyDemand: iv, momentum: mo, risk, macro, liquidity };
  }

  if (assetClass === 'fx') {
    const carry   = fx.carry?.carryScore       ?? null;
    const reer    = fx.reer?.valuationScore    ?? null;
    const fxMom   = _safeAvg([_mapScore(m.mom1M,-0.05,0.05,true),_mapScore(m.mom12M,-0.1,0.1,true)]);
    const fxRisk  = _safeAvg([_mapScore(r.sharpe12M,-1,2,true), _mapScore(m.vol30D,0,0.2,true,'reverse')]);
    return { carry, valuation: reer, momentum: fxMom, risk: fxRisk, liquidity, macro };
  }

  return { valuation, growth, quality, profitability, momentum, risk, liquidity, credit, macro };
}

/** Map a raw value to 0-100 given expected min/max range */
function _mapScore(val, min, max, active = true, direction = 'normal') {
  if (!active || val === null || val === undefined || isNaN(val)) return null;
  const normalised = (val - min) / (max - min);
  const clamped    = Math.min(1, Math.max(0, normalised));
  const score      = direction === 'reverse' ? 1 - clamped : clamped;
  return Math.round(score * 100);
}

/** Average ignoring nulls */
function _safeAvg(arr) {
  const valid = arr.filter(v => v !== null && v !== undefined && !isNaN(v));
  if (!valid.length) return null;
  return Math.round(valid.reduce((a,b) => a+b, 0) / valid.length);
}

/* ══════════════════════════════════════════════════════════════════
   AUTO-HOOK: Extend the existing changeTicker patch
   ══════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  /* Hook into valuation-data.js assembleValuationData completion */
  const _origAssemble = typeof assembleValuationData === 'function'
    ? assembleValuationData : null;

  if (_origAssemble && !_origAssemble._vms_patched) {
    window.assembleValuationData = async function (ticker) {
      const result = await _origAssemble.call(this, ticker);
      /* Enrich in background — non-blocking */
      setTimeout(() => enrichValuationData(ticker).catch(() => {}), 500);
      return result;
    };
    window.assembleValuationData._vms_patched = true;
  }

  /* Register all new no-key providers in config sidebar */
  if (Array.isArray(window.KNOWN_PROVIDERS)) {
    const newProviders = [
      { id:'cme_group',       name:'CME Group — Settlements', badge:'CME', group:'Commodities & Supply Chain',
        desc:'Commodity futures settlement prices. Term structure + roll yield. No API key.', limit:'Unlimited (no key)',
        docsUrl:'https://www.cmegroup.com/CmeWS/mvc/Settlements/futures/', sessionKey:VMS_SESSION_KEY },
      { id:'stooq',           name:'Stooq — EOD OHLCV',       badge:'STQ', group:'Market Data',
        desc:'Free EOD OHLCV for commodities, FX, equities via CSV. No key. Used for daily momentum.', limit:'Unlimited (no key)',
        docsUrl:'https://stooq.com', sessionKey:VMS_SESSION_KEY },
      { id:'imf_reer',        name:'IMF DataMapper — REER',   badge:'IMF', group:'Macro & Economic',
        desc:'Real Effective Exchange Rate for 180+ currencies. FX valuation score. No key.', limit:'Unlimited (no key)',
        docsUrl:'https://www.imf.org/external/datamapper', sessionKey:VMS_SESSION_KEY },
      { id:'usda_psd',        name:'USDA PSD — Stocks-to-Use',badge:'USDA',group:'Commodities & Supply Chain',
        desc:'Global grain stocks-to-use ratios (corn, wheat, soybeans). Inventory z-score. No key.', limit:'Unlimited (no key)',
        docsUrl:'https://apps.fas.usda.gov/psdonline', sessionKey:VMS_SESSION_KEY },
      { id:'french_factors',  name:'Kenneth French — Factors',badge:'FF5', group:'Market Data',
        desc:'Fama-French 5-factor daily returns. Used to compute value/size/quality/lowvol factor betas via OLS. No key.', limit:'Unlimited (no key)',
        docsUrl:'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html', sessionKey:VMS_SESSION_KEY },
    ];
    for (const p of newProviders) {
      if (!window.KNOWN_PROVIDERS.find(e => e.id === p.id))
        window.KNOWN_PROVIDERS.push(p);
    }
    if (typeof renderTopbarBadges === 'function') renderTopbarBadges();
  }

  console.info('[VMS] valuation-missing-sources.js loaded — Groups 1/2/3 ready.');
});
