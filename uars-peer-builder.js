/* ══════════════════════════════════════════════════════════════════
   FINTERM — uars-peer-builder.js
   Phase 2: Peer Group Builder
   ──────────────────────────────────────────────────────────────────
   Builds peer-group raw-value arrays for every VAR_META variable
   and registers them with the engine via engine.setPeerGroups().

   This is required for Operators A and B — without peer arrays,
   normalizeVar() returns 50 (neutral) for every variable.

   Strategy:
     2.1  Equity peers   — Finnhub /stock/peers → FMP /key-metrics-ttm
     2.2  Cross-asset    — FMP /stock-screener by sector/exchange
     2.3  Market peers   — technical.js cache for shared market vars
     2.4  RA score       — percentile rank of target in peer universe
     2.5  Fallback       — synthetic peer distribution from historical
                          quantiles when live peers unavailable

   Exports (window-global):
     window.uarsBuildPeerGroups(ticker, opts)
       — master entry point called by uars-widget.js
       — fires & forgets so the widget can render immediately,
         then re-renders when peers are ready

     window.uarsPeerCache
       — session-level cache: { [cacheKey]: { data, ts } }

   Load order: after uars-source-connector.js
   ══════════════════════════════════════════════════════════════════ */

'use strict';

/* ── Session cache ───────────────────────────────────────────────── */
window.uarsPeerCache = window.uarsPeerCache || {};

const _PEER_TTL_MS  = 6 * 60 * 60 * 1000;   /* 6 hours — peers are slow-moving */
const _PEER_MIN     = 5;                      /* engine minimum peer count for A/B ops */
const _PEER_TARGET  = 20;                     /* desired peer universe size */
const _PEER_RATE_MS = 350;                    /* delay between FMP calls (rate-limit) */

/* ── Helpers ─────────────────────────────────────────────────────── */
function _peerCacheGet(key) {
  const e = window.uarsPeerCache[key];
  if (!e) return null;
  if (Date.now() - e.ts > _PEER_TTL_MS) { delete window.uarsPeerCache[key]; return null; }
  return e.data;
}
function _peerCacheSet(key, data) {
  window.uarsPeerCache[key] = { data, ts: Date.now() };
}

/** Safe finite number extractor */
function _fin(v) {
  if (v === null || v === undefined || !isFinite(parseFloat(v))) return null;
  return parseFloat(v);
}

/** Convert decimal fraction → percentage (same logic as connector) */
function _pct(v) {
  if (v === null) return null;
  if (Math.abs(v) > 1) return v;
  return v * 100;
}

/** Sleep ms */
const _sleep = ms => new Promise(r => setTimeout(r, ms));


/* ══════════════════════════════════════════════════════════════════
   2.1 — EQUITY PEER TICKERS
   Source A: Finnhub /stock/peers (most accurate — same sector/size)
   Source B: FMP /stock-screener by sector (wider universe)
   Source C: valuation-datasources.js getPeerGroup() cache
══════════════════════════════════════════════════════════════════ */

/**
 * _fetchPeerTickers(sym)
 * Returns array of peer ticker strings (bare, uppercase).
 * Tries Finnhub first, falls back to FMP screener.
 *
 * @param {string} sym  bare ticker e.g. 'AAPL'
 * @param {string} sector  sector string from Finnhub profile
 * @returns {Promise<string[]>}
 */
async function _fetchPeerTickers(sym, sector) {
  const cacheKey = `peer_tickers_${sym}`;
  const cached   = _peerCacheGet(cacheKey);
  if (cached) return cached;

  let peers = [];

  /* ── A: Check if valuation-datasources.js already has peers ── */
  const vdPeers = window._peerData?.[sym]?.peers;
  if (Array.isArray(vdPeers) && vdPeers.length >= 3) {
    peers = vdPeers.filter(p => p !== sym).slice(0, _PEER_TARGET);
    if (peers.length >= _PEER_MIN) {
      _peerCacheSet(cacheKey, peers);
      return peers;
    }
  }

  /* ── B: Finnhub /stock/peers ── */
  const fhKey = (typeof getFinnhubKey === 'function') ? getFinnhubKey() : '';
  if (fhKey && peers.length < _PEER_MIN) {
    try {
      const url  = `https://finnhub.io/api/v1/stock/peers?symbol=${sym}&token=${fhKey}`;
      const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      const flat = Array.isArray(data) ? data.flat() : [];
      const fhPeers = flat.filter(p => typeof p === 'string' && p !== sym && !p.includes(':'));
      peers = [...new Set([...peers, ...fhPeers])].slice(0, _PEER_TARGET);
    } catch (_) { /* continue */ }
  }

  /* ── C: FMP /stock-screener by sector ── */
  const fmpKey = (typeof getFmpKey === 'function') ? getFmpKey() : '';
  if (fmpKey && peers.length < _PEER_TARGET && sector) {
    try {
      const params = new URLSearchParams({
        sector:  sector,
        exchange: 'NASDAQ,NYSE',
        limit:    String(_PEER_TARGET + 10),
        apikey:   fmpKey,
      });
      const url  = `https://financialmodelingprep.com/api/v3/stock-screener?${params}`;
      const res  = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const data = await res.json();
      if (Array.isArray(data)) {
        const screenerPeers = data
          .map(r => (r.symbol || '').toUpperCase())
          .filter(p => p && p !== sym && !p.includes(':'));
        peers = [...new Set([...peers, ...screenerPeers])].slice(0, _PEER_TARGET);
      }
    } catch (_) { /* continue */ }
  }

  /* ── D: Synthetic fallback list per sector ── */
  if (peers.length < _PEER_MIN) {
    peers = [...new Set([...peers, ..._syntheticPeers(sym, sector)])].slice(0, _PEER_TARGET);
  }

  _peerCacheSet(cacheKey, peers);
  return peers;
}


/* ══════════════════════════════════════════════════════════════════
   2.2 — PEER KEY METRICS (FMP /key-metrics-ttm)
   Fetches the full metric object for each peer ticker.
   Rate-limited: one call per _PEER_RATE_MS.
══════════════════════════════════════════════════════════════════ */

/**
 * _fetchPeerMetrics(peerSymbols)
 * Returns { [sym]: metricsObject } for all peers with valid data.
 *
 * @param {string[]} peerSymbols
 * @returns {Promise<Object>}
 */
async function _fetchPeerMetrics(peerSymbols) {
  const fmpKey = (typeof getFmpKey === 'function') ? getFmpKey() : '';
  if (!fmpKey || !peerSymbols.length) return {};

  const metricsMap = {};
  const toFetch    = peerSymbols.slice(0, _PEER_TARGET);

  for (const peer of toFetch) {
    const cacheKey = `peer_metrics_${peer}`;
    const cached   = _peerCacheGet(cacheKey);
    if (cached) {
      metricsMap[peer] = cached;
      continue;
    }

    /* Check if valuation-data.js already assembled this peer's data */
    const vd = window._valuationData?.[peer];
    if (vd?.fundamentals && Object.keys(vd.fundamentals).length > 3) {
      const m = _metricsFromVD(vd);
      _peerCacheSet(cacheKey, m);
      metricsMap[peer] = m;
      continue;
    }

    /* Fetch from FMP */
    try {
      const url  = `https://financialmodelingprep.com/api/v3/key-metrics-ttm/${peer}?apikey=${fmpKey}`;
      const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      if (Array.isArray(data) && data[0]) {
        const m = data[0];
        _peerCacheSet(cacheKey, m);
        metricsMap[peer] = m;
      }
    } catch (_) { /* peer unavailable */ }

    /* Rate-limit: small delay between calls */
    await _sleep(_PEER_RATE_MS);
  }

  return metricsMap;
}

/**
 * _metricsFromVD(vd)
 * Converts a valuation-data object to FMP key-metrics-ttm shape
 * so we can build peer arrays from already-assembled data.
 */
function _metricsFromVD(vd) {
  const f = vd.fundamentals || {};
  const m = vd.market       || {};
  const r = vd.riskMetrics  || {};
  const l = vd.liquidityMetrics || {};

  return {
    /* FMP field names used by RA_VARIABLES in valuation-datasources.js */
    peRatioTTM:                  _fin(f.peRatio),
    evToEbitdaTTM:               _fin(f.evToEbitda),
    priceToBookRatioTTM:         _fin(f.pbRatio),
    freeCashFlowYieldTTM:        _fin(f.fcfYield),
    revenueGrowthTTM:            _fin(f.revenueGrowth),
    roeTTM:                      _fin(f.roe),
    operatingProfitMarginTTM:    _fin(f.operatingMargin),
    roicTTM:                     _fin(f.roic),
    dividendYieldTTM:            _fin(f.divYield),
    debtToEquityTTM:             _fin(f.debtToEquity),
    netDebtToEBITDATTM:          _fin(f.netDebtEbitda),
    interestCoverageTTM:         _fin(f.interestCoverage),
    marketCapTTM:                null,

    /* Additional fields for building full VAR_META peer arrays */
    _revenueGrowth:    _fin(f.revenueGrowth),
    _ebitdaGrowth:     _fin(f.ebitdaGrowth),
    _epsGrowth:        _fin(f.epsGrowth),
    _mom1M:            _fin(m.mom1M),
    _mom12M:           _fin(m.mom12M),
    _vol30D:           _fin(m.vol30D),
    _beta:             _fin(m.beta),
    _avgDolVol:        _fin(m.avgDollarVol30D),
    _maxDD:            _fin(m.maxDrawdown12M),
    _sharpe:           _fin(r.sharpe12M),
    _sortino:          _fin(r.sortino12M),
    _downVol:          _fin(r.downsideVol12M),
    _var99:            _fin(r.var99_10D),
    _es975:            _fin(r.es975_10D),
    _amihud:           _fin(l.amihud),
    _corrBench:        null,
  };
}


/* ══════════════════════════════════════════════════════════════════
   2.3 — MARKET VARIABLE PEERS
   Market variables (momentum, vol, beta, etc.) are computed from
   technical.js candle cache for each peer. We load candles for all
   peers in parallel via Stooq (no key) to build peer distributions.
══════════════════════════════════════════════════════════════════ */

/**
 * _buildMarketPeerArrays(peerSymbols)
 * Returns { [VAR_ID]: number[] } for all market-based variables.
 * Uses technical.js cache where available; loads via Stooq otherwise.
 *
 * @param {string[]} peerSymbols
 * @returns {Promise<Object>}
 */
async function _buildMarketPeerArrays(peerSymbols) {
  const arrays = {
    MKT_MOM_1M:            [],
    MKT_MOM_12M:           [],
    MKT_VOL_30D:           [],
    MKT_BETA_TO_BENCH_250D:[],
    MKT_AVG_DOLLAR_VOL_30D:[],
    MKT_MAX_DRAWDOWN_12M:  [],
    MKT_REL_RETURN_12M:    [],
    RISK_SHARPE_12M:        [],
    RISK_SORTINO_12M:       [],
    RISK_DOWNSIDE_VOL_12M:  [],
    RISK_VAR_99_10D:        [],
    RISK_ES_97_5_10D:       [],
  };

  for (const peer of peerSymbols) {
    /* A: Try valuation-data.js assembled data (fastest, already in memory) */
    const vd = window._valuationData?.[peer];
    if (vd) {
      const m = vd.market       || {};
      const r = vd.riskMetrics  || {};
      const _push = (arr, v) => { if (v !== null && v !== undefined && isFinite(v)) arr.push(v); };

      _push(arrays.MKT_MOM_1M,             _pct(_fin(m.mom1M)));
      _push(arrays.MKT_MOM_12M,            _pct(_fin(m.mom12M)));
      _push(arrays.MKT_VOL_30D,            _pct(_fin(m.vol30D)));
      _push(arrays.MKT_BETA_TO_BENCH_250D, _fin(m.beta));
      _push(arrays.MKT_AVG_DOLLAR_VOL_30D, _fin(m.avgDollarVol30D));
      _push(arrays.MKT_MAX_DRAWDOWN_12M,   _pct(_fin(m.maxDrawdown12M)));
      _push(arrays.MKT_REL_RETURN_12M,     _pct(_fin(m.relReturn12M)));
      _push(arrays.RISK_SHARPE_12M,         _fin(r.sharpe12M));
      _push(arrays.RISK_SORTINO_12M,        _fin(r.sortino12M));
      _push(arrays.RISK_DOWNSIDE_VOL_12M,   _pct(_fin(r.downsideVol12M)));
      _push(arrays.RISK_VAR_99_10D, (() => {
        const v = _fin(r.var99_10D);
        return v !== null ? Math.abs(_pct(v)) : null;
      })());
      _push(arrays.RISK_ES_97_5_10D, (() => {
        const v = _fin(r.es975_10D);
        return v !== null ? Math.abs(_pct(v)) : null;
      })());
      continue;
    }

    /* B: Try technical.js session cache */
    try {
      const raw = sessionStorage.getItem(`tc:${peer}:D`);
      if (raw) {
        const parsed = JSON.parse(raw);
        const closes = parsed?.d?.c || parsed?.c;
        const vols   = parsed?.d?.v || parsed?.v;
        if (closes && closes.length >= 30) {
          const n    = closes.length;
          const last = closes[n-1];

          const mom1M  = n >= 22  ? _pct((last - closes[n-22])  / closes[n-22])  : null;
          const mom12M = n >= 252 ? _pct((last - closes[n-252]) / closes[n-252]) : null;

          /* Annualised vol from 30 daily log returns */
          let vol30D = null;
          if (n >= 31) {
            const rets = [];
            for (let i = n-30; i < n; i++) {
              if (closes[i] > 0 && closes[i-1] > 0)
                rets.push(Math.log(closes[i] / closes[i-1]));
            }
            if (rets.length >= 20) {
              const mean = rets.reduce((a,b) => a+b, 0) / rets.length;
              const var_ = rets.reduce((a,r) => a + (r-mean)**2, 0) / rets.length;
              vol30D = _pct(Math.sqrt(var_ * 252));
            }
          }

          /* Max drawdown 252 bars */
          const slice = closes.slice(Math.max(0, n-252));
          let peak = slice[0], maxDD = 0;
          for (const c of slice) {
            if (c > peak) peak = c;
            const dd = (peak - c) / peak;
            if (dd > maxDD) maxDD = dd;
          }

          const _push = (arr, v) => { if (v !== null && isFinite(v)) arr.push(v); };
          _push(arrays.MKT_MOM_1M,           mom1M);
          _push(arrays.MKT_MOM_12M,          mom12M);
          _push(arrays.MKT_VOL_30D,          vol30D);
          _push(arrays.MKT_MAX_DRAWDOWN_12M, _pct(-maxDD));

          /* Avg dollar vol */
          if (vols && vols.length === n) {
            const dvSlice = vols.slice(Math.max(0,n-30));
            const cSlice  = closes.slice(Math.max(0,n-30));
            const dvols   = dvSlice.map((v,i) => v * cSlice[i]);
            _push(arrays.MKT_AVG_DOLLAR_VOL_30D, dvols.reduce((a,b) => a+b, 0) / dvols.length);
          }
        }
      }
    } catch (_) { /* continue */ }
  }

  return arrays;
}


/* ══════════════════════════════════════════════════════════════════
   PEER ARRAY BUILDER
   Takes raw FMP metrics objects + market arrays and builds the full
   { [VAR_ID]: number[] } map that engine.setPeerGroups() expects.
══════════════════════════════════════════════════════════════════ */

/**
 * _buildPeerArraysFromMetrics(metricsMap)
 * Converts the map of { [peerSym]: fmpMetrics } into
 * { [VAR_ID]: number[] } peer value arrays.
 *
 * @param {Object} metricsMap  — { [sym]: { peRatioTTM, roeTTM, ... } }
 * @returns {Object}  { [VAR_ID]: number[] }
 */
function _buildPeerArraysFromMetrics(metricsMap) {
  const arrays = {};

  /* Helper: collect a numeric value from a metrics object */
  const _collect = (varId, extractFn) => {
    if (!arrays[varId]) arrays[varId] = [];
    for (const m of Object.values(metricsMap)) {
      const v = extractFn(m);
      if (v !== null && isFinite(v)) arrays[varId].push(v);
    }
  };

  /* ── FUNDAMENTAL ───────────────────────────────────────────── */
  _collect('FUND_REV_GROWTH_YOY',      m => _pct(_fin(m._revenueGrowth ?? m.revenueGrowthTTM)));
  _collect('FUND_EBITDA_GROWTH_YOY',   m => _pct(_fin(m._ebitdaGrowth)));
  _collect('FUND_EPS_GROWTH_YOY',      m => _pct(_fin(m._epsGrowth)));
  _collect('FUND_ROE_TTM',             m => _pct(_fin(m.roeTTM)));
  _collect('FUND_ROIC_TTM',            m => _pct(_fin(m.roicTTM)));
  _collect('FUND_OPER_MARGIN_TTM',     m => _pct(_fin(m.operatingProfitMarginTTM)));
  _collect('FUND_FCF_YIELD_TTM',       m => _pct(_fin(m.freeCashFlowYieldTTM)));
  _collect('FUND_DIV_YIELD_TTM',       m => _pct(_fin(m.dividendYieldTTM)));
  _collect('FUND_NET_DEBT_EBITDA_TTM', m => _fin(m.netDebtToEBITDATTM));
  _collect('FUND_DEBT_TO_EQUITY_TTM',  m => _fin(m.debtToEquityTTM));
  _collect('FUND_INT_COVERAGE_TTM',    m => _fin(m.interestCoverageTTM));
  _collect('FUND_PAYOUT_RATIO_TTM',    m => _pct(_fin(m.payoutRatioTTM)));

  /* ── MARKET (from _buildMarketPeerArrays — merged in caller) ── */
  /* (These are handled separately because they come from candle data) */

  /* ── CREDIT ─────────────────────────────────────────────────── */
  _collect('CRED_SPREAD_OAS_BPS', m => _fin(m._oasProxy));
  _collect('CRED_DEBT_SERVICE_CAPACITY_SCORE', m => {
    const ic = _fin(m.interestCoverageTTM);
    return ic !== null ? Math.min(100, Math.max(0, ic * 5)) : null;
  });

  return arrays;
}


/* ══════════════════════════════════════════════════════════════════
   2.4 — RELATIVE ATTRACTIVENESS (RA) SCORE
   Percentile rank of target asset within the peer universe,
   computed from the overall valuation-datasources.js raScore or
   re-computed from the UARS consensus score of peers.
══════════════════════════════════════════════════════════════════ */

/**
 * _computeRA(targetSym, peerSymbols)
 * Returns a 0–100 relative attractiveness score.
 *
 * Priority:
 *   1. Use valuation-datasources.js raScore if already computed
 *   2. Compare this asset's consensus vs peer consensus scores
 *   3. Fall back to 50 (neutral)
 *
 * @param {string}   targetSym
 * @param {string[]} peerSymbols
 * @returns {number}  0–100
 */
function _computeRA(targetSym, peerSymbols) {
  /* Priority 1: use existing RA from valuation-datasources.js */
  const vd = window._valuationData?.[targetSym];
  const existingRA = vd?.peerRelativeAttractiveness?.raScore;
  if (existingRA !== null && existingRA !== undefined && existingRA !== 50) {
    return existingRA;
  }

  /* Priority 2: compare UARS consensus scores */
  const targetResult = window.uarsEngine?._scoreCache;
  if (!targetResult) return 50;

  /* Find target consensus from cache */
  const targetKey = Object.keys(targetResult).find(k => k.startsWith(targetSym + '::'));
  if (!targetKey) return 50;
  const targetConsensus = targetResult[targetKey]?.consensus;
  if (targetConsensus === undefined) return 50;

  /* Collect peer consensus scores */
  const peerScores = [];
  for (const peer of peerSymbols) {
    const peerKey = Object.keys(targetResult).find(k => k.startsWith(peer + '::'));
    if (peerKey && targetResult[peerKey]?.consensus !== undefined) {
      peerScores.push(targetResult[peerKey].consensus);
    }
  }

  if (peerScores.length < _PEER_MIN) return 50;

  /* Percentile rank */
  const belowCount = peerScores.filter(s => s < targetConsensus).length;
  return Math.round((belowCount / peerScores.length) * 100);
}


/* ══════════════════════════════════════════════════════════════════
   2.5 — SYNTHETIC FALLBACK PEER DISTRIBUTION
   When live peers are unavailable, we generate a synthetic
   peer distribution from historical market quantiles.
   This ensures Operators A/B always have ≥ 5 data points.
══════════════════════════════════════════════════════════════════ */

/**
 * _syntheticPeerArrays(assetClass)
 * Returns { [VAR_ID]: number[] } with 20 synthetic peer values
 * representing realistic market quantile distributions for each
 * variable. These are derived from long-run empirical observations.
 *
 * Only used when live peer count < _PEER_MIN.
 *
 * @param {string} assetClass  — 'equities'|'reits'|'crypto'|'fx'|'commodities'
 * @returns {Object}
 */
function _syntheticPeerArrays(assetClass) {
  /* 20 quantile points (p5 → p95) for each variable by asset class.
     Values represent realistic distributions for large-cap US equities
     unless overridden for the specific asset class.
     Source: long-run cross-sectional statistics (academic + practitioner). */

  const EQ = {
    /* Fundamental — % values */
    FUND_REV_GROWTH_YOY:      [-15,-8,-3,0,2,4,6,8,11,15,18,22,27,33,40,52,70,95,140,200],
    FUND_EBITDA_GROWTH_YOY:   [-25,-12,-5,0,3,5,8,11,14,18,22,28,35,43,53,68,90,130,190,280],
    FUND_EPS_GROWTH_YOY:      [-40,-20,-8,0,3,6,9,13,17,22,27,33,40,50,62,78,100,145,210,320],
    FUND_ROE_TTM:             [-20,-8,-2,3,6,9,12,15,18,22,26,31,37,44,53,63,76,93,115,145],
    FUND_ROIC_TTM:            [-10,-3,1,4,7,9,12,14,17,20,23,27,32,37,44,52,62,75,92,120],
    FUND_OPER_MARGIN_TTM:     [-25,-10,-2,3,6,9,12,15,18,22,26,30,34,39,45,52,60,70,82,98],
    FUND_FCF_YIELD_TTM:       [-8,-3,-1,0,1,2,3,4,5,6,7,8,9,11,13,16,19,23,28,35],
    FUND_DIV_YIELD_TTM:       [0,0,0,0,0,0.3,0.6,1.0,1.4,1.9,2.4,2.9,3.5,4.1,4.9,5.8,6.8,8.1,9.8,13],
    FUND_PAYOUT_RATIO_TTM:    [0,0,0,5,10,18,27,35,43,50,57,63,69,75,80,85,90,95,100,100],
    FUND_NET_DEBT_EBITDA_TTM: [-3,-2,-1.5,-1,-0.5,0,0.3,0.6,1.0,1.5,2.0,2.5,3.0,3.7,4.5,5.5,6.8,8.5,11,15],
    FUND_DEBT_TO_EQUITY_TTM:  [0,0.05,0.1,0.15,0.2,0.3,0.4,0.5,0.65,0.8,1.0,1.2,1.5,1.9,2.4,3.0,3.8,5.0,7.0,12],
    FUND_INT_COVERAGE_TTM:    [-5,-1,0.5,1.5,2.5,3.5,4.5,5.5,7,9,11,14,18,22,28,35,45,60,85,150],

    /* Market — % values */
    MKT_MOM_1M:               [-25,-16,-10,-6,-3,-1,0,1,2,4,6,8,11,14,18,22,28,35,45,60],
    MKT_MOM_12M:              [-55,-38,-25,-15,-7,-2,2,5,9,14,19,25,32,40,50,62,77,96,122,165],
    MKT_VOL_30D:              [8,11,13,15,17,19,21,23,25,28,31,34,38,43,49,56,64,75,90,120],
    MKT_BETA_TO_BENCH_250D:   [0.1,0.3,0.45,0.55,0.65,0.72,0.80,0.87,0.94,1.01,1.08,1.15,1.23,1.32,1.42,1.53,1.65,1.80,2.00,2.5],
    MKT_AVG_DOLLAR_VOL_30D:   [2e5,5e5,1e6,2e6,4e6,8e6,1.5e7,2.5e7,4e7,7e7,1e8,1.5e8,2.5e8,4e8,6e8,1e9,1.8e9,3e9,6e9,2e10],
    MKT_MAX_DRAWDOWN_12M:     [-75,-55,-40,-30,-22,-16,-11,-7,-4.5,-2.5,-1,-0.5,-0.2,0,0,0,0,0,0,0],
    MKT_REL_RETURN_12M:       [-45,-28,-18,-10,-5,-2,0,2,4,7,10,14,18,23,29,37,47,60,78,110],

    /* Risk */
    RISK_SHARPE_12M:           [-2.5,-1.5,-0.9,-0.5,-0.2,0,0.1,0.2,0.35,0.5,0.65,0.8,1.0,1.2,1.5,1.8,2.2,2.7,3.5,5.0],
    RISK_SORTINO_12M:          [-3.5,-2.0,-1.2,-0.7,-0.3,0,0.1,0.3,0.5,0.7,0.9,1.1,1.4,1.7,2.1,2.6,3.2,4.0,5.0,7.5],
    RISK_DOWNSIDE_VOL_12M:     [3,5,7,9,11,13,15,17,19,22,25,28,32,37,43,50,58,68,82,110],
    RISK_VAR_99_10D:           [1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,7,8,9,11,13,16,20,26,40],
    RISK_ES_97_5_10D:          [1.5,2.2,3,3.8,4.5,5.2,6,6.8,7.5,8.5,9.5,11,12.5,14,16,19,23,28,35,55],

    /* Credit */
    CRED_RATING_NOTCH_NUM:     [0,5,10,15,20,25,30,40,50,55,60,65,70,75,80,85,90,95,100,100],
    CRED_SPREAD_OAS_BPS:       [30,50,70,90,110,135,160,190,220,260,310,370,440,530,640,780,950,1200,1600,2500],
    CRED_DEBT_SERVICE_CAPACITY_SCORE: [5,10,15,20,25,30,38,48,58,65,72,78,83,87,90,93,96,98,100,100],

    /* Macro */
    MACRO_INFL_BETA_3Y:        [-2,-1.2,-0.7,-0.3,0,0.2,0.4,0.6,0.8,1.0,1.2,1.5,1.8,2.2,2.7,3.3,4.0,5.0,6.5,9],
    MACRO_RATE_BETA_3Y:        [-6,-4,-2.5,-1.5,-0.8,-0.3,0,0.3,0.6,1.0,1.4,1.8,2.3,2.9,3.6,4.5,5.5,7,9,13],
    MACRO_GDP_BETA_5Y:         [-3,-1.5,-0.5,0,0.3,0.6,0.9,1.2,1.5,1.8,2.1,2.5,3.0,3.6,4.3,5.2,6.3,7.8,10,14],
    MACRO_RECESSION_VULN_SCORE:[5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100],

    /* Factor betas */
    FACTOR_VALUE_BETA:         [-2,-1.2,-0.7,-0.3,0,0.1,0.3,0.5,0.7,0.9,1.1,1.3,1.6,1.9,2.3,2.7,3.2,3.8,4.6,6],
    FACTOR_QUALITY_BETA:       [-1.5,-0.8,-0.4,-0.1,0.1,0.3,0.5,0.7,0.9,1.1,1.3,1.5,1.7,2.0,2.4,2.8,3.3,4.0,5.0,7],
    FACTOR_MOMENTUM_BETA:      [-2.5,-1.5,-0.8,-0.3,0,0.2,0.4,0.7,0.9,1.2,1.5,1.8,2.2,2.6,3.1,3.7,4.5,5.5,7,10],
    FACTOR_LOWVOL_BETA:        [-3,-2,-1.2,-0.6,-0.2,0,0.2,0.4,0.6,0.8,1.0,1.2,1.5,1.8,2.1,2.5,3.0,3.7,4.6,6.5],
    FACTOR_SIZE_BETA:          [-2,-1,-0.5,-0.2,0,0.1,0.3,0.5,0.7,0.9,1.1,1.3,1.6,1.9,2.3,2.8,3.4,4.2,5.3,7.5],
    FACTOR_CARRY_BETA:         [-1,-0.7,-0.5,-0.3,-0.1,0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1,1,1,1,1],
    RISK_CORR_TO_BENCH_250D:   [-0.5,-0.3,-0.1,0.1,0.2,0.3,0.4,0.5,0.55,0.6,0.65,0.7,0.75,0.8,0.83,0.87,0.9,0.93,0.96,0.99],
  };

  /* Asset-class overrides (crypto, commodities) */
  if (assetClass === 'crypto') {
    return {
      ...EQ,
      SPEC_CRYPTO_ACTIVE_ADDR_GROWTH_30D: [-30,-15,-5,0,2,5,8,12,17,22,28,35,44,55,68,85,108,140,185,260],
      SPEC_CRYPTO_TX_COUNT_GROWTH_30D:    [-35,-18,-7,0,3,6,10,14,19,25,32,40,50,63,78,98,125,165,220,320],
      SPEC_CRYPTO_TRANSFER_VOL_USD_30D:   [1e6,5e6,2e7,6e7,1.5e8,3e8,6e8,1.2e9,2e9,3.5e9,5.5e9,8e9,1.2e10,1.8e10,2.5e10,4e10,6e10,9e10,1.5e11,3e11],
      SPEC_CRYPTO_NVT_90D:                [5,10,15,20,28,38,50,65,85,110,140,180,230,290,370,470,600,770,1000,1400],
      SPEC_CRYPTO_HASHRATE_TREND_90D:     [-40,-20,-8,-2,0,3,6,10,14,19,25,32,40,50,62,77,96,122,155,200],
      SPEC_CRYPTO_SUPPLY_INFLATION_RATE:  [0,0.5,1,1.5,2,3,4,5,6,7,8,10,12,15,18,22,28,35,45,60],
    };
  }

  if (assetClass === 'commodities') {
    return {
      ...EQ,
      SPEC_COMM_TERM_STRUCTURE_SLOPE:    [-0.05,-0.03,-0.02,-0.01,0,0.005,0.01,0.015,0.02,0.025,0.03,0.035,0.04,0.05,0.06,0.07,0.085,0.10,0.13,0.18],
      SPEC_COMM_ROLL_YIELD_3M:           [-0.08,-0.05,-0.03,-0.015,-0.005,0,0.005,0.01,0.015,0.02,0.025,0.03,0.04,0.05,0.06,0.075,0.09,0.11,0.14,0.20],
      SPEC_COMM_INVENTORY_Z:             [-2.5,-1.8,-1.3,-0.9,-0.6,-0.3,0,0.3,0.6,0.9,1.2,1.5,1.8,2.1,2.5,2.9,3.3,3.8,4.4,5.5],
      SPEC_COMM_SUPPLY_DEMAND_BAL_SCORE: [5,12,18,24,30,36,42,48,52,56,60,65,70,74,78,82,86,90,94,98],
    };
  }

  if (assetClass === 'fx') {
    return {
      ...EQ,
      FACTOR_CARRY_BETA: [-1,-0.8,-0.6,-0.4,-0.25,-0.1,0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.85,0.9,0.95,1,1],
      MKT_VOL_30D:       [3,4,5,6,7,8,9,10,11,12,14,16,18,20,23,26,30,35,42,55],
    };
  }

  return EQ;
}

/** Synthetic peer ticker list per sector (used when Finnhub returns nothing) */
function _syntheticPeers(sym, sector) {
  const SECTOR_PEERS = {
    'Technology':            ['MSFT','AAPL','GOOGL','META','NVDA','AVGO','AMD','ORCL','CRM','ADBE','INTC','QCOM','TXN','NOW','INTU'],
    'Healthcare':            ['JNJ','UNH','PFE','ABT','TMO','MRK','ABBV','DHR','BMY','AMGN','GILD','VRTX','REGN','BSX','MDT'],
    'Financial Services':    ['JPM','BAC','WFC','GS','MS','C','BLK','AXP','SPGI','ICE','CME','BK','STT','SCHW','TFC'],
    'Consumer Cyclical':     ['AMZN','TSLA','HD','MCD','NKE','SBUX','LOW','TGT','BKNG','CMG','GM','F','TJX','ROST','DHI'],
    'Consumer Defensive':    ['WMT','PG','KO','PEP','COST','PM','MO','CL','GIS','KHC','K','SYY','CAG','KMB','CHD'],
    'Industrials':           ['HON','GE','CAT','RTX','LMT','DE','UNP','UPS','FDX','EMR','ETN','ITW','PH','ROK','TT'],
    'Energy':                ['XOM','CVX','COP','SLB','EOG','PXD','OXY','MPC','PSX','VLO','HAL','DVN','BKR','FANG','APA'],
    'Basic Materials':       ['LIN','APD','SHW','FCX','NEM','NUE','CF','MOS','ALB','CE','DD','EMN','HUN','OLN','RPM'],
    'Communication Services':['GOOGL','META','NFLX','DIS','CMCSA','TMUS','VZ','T','CHTR','ATVI','EA','TTWO','SNAP','PINS','MTCH'],
    'Utilities':             ['NEE','DUK','SO','D','AEP','EXC','SRE','XEL','ES','WEC','PEG','ETR','FE','EIX','PPL'],
    'Real Estate':           ['AMT','PLD','CCI','EQIX','PSA','O','SPG','WELL','DLR','VTR','EXR','INVH','AVB','EQR','WY'],
  };

  const found = SECTOR_PEERS[sector];
  if (found) return found.filter(p => p !== sym);
  /* Default: large-cap diversified */
  return ['AAPL','MSFT','GOOGL','AMZN','NVDA','TSLA','META','BRK.B','UNH','XOM']
    .filter(p => p !== sym);
}


/* ══════════════════════════════════════════════════════════════════
   MASTER ENTRY POINT
   uarsBuildPeerGroups(ticker, opts)
   Called by uars-widget.js immediately before engine.score().
   Registers all peer arrays with the engine.
   Returns the RA score for Model 1.
══════════════════════════════════════════════════════════════════ */

/**
 * uarsBuildPeerGroups(ticker, opts)
 * Master function. Runs all peer-building pipelines, registers
 * arrays with engine.setPeerGroups(), then re-triggers any
 * registered onReady callback so the widget can re-render.
 *
 * @param {string} ticker
 * @param {object} opts
 *   opts.onReady    — callback fired when peers are registered
 *   opts.sector     — sector string (from Finnhub profile)
 *   opts.assetClass — ASSET_CLASS_CONFIGS key
 *   opts.force      — bypass cache
 * @returns {Promise<{ RA: number, peerCount: number, source: string }>}
 */
window.uarsBuildPeerGroups = async function uarsBuildPeerGroups(ticker, opts = {}) {
  const sym         = ticker.replace(/.*:/, '').toUpperCase();
  const assetClass  = opts.assetClass || window.uarsDetectAssetClass?.(ticker) || 'equities';
  const sector      = opts.sector
    || window._valuationData?.[sym]?.sector
    || _getSectorFromCache(sym);

  const cacheKey    = `peer_groups_${sym}_${assetClass}`;

  /* Return from cache if fresh and not forced */
  if (!opts.force) {
    const cached = _peerCacheGet(cacheKey);
    if (cached) {
      /* Re-register in case engine was reset */
      if (window.uarsEngine && typeof window.uarsEngine.setPeerGroups === 'function') {
        window.uarsEngine.setPeerGroups(cached.arrays);
      }
      if (typeof opts.onReady === 'function') opts.onReady(cached.RA);
      return { RA: cached.RA, peerCount: cached.peerCount, source: cached.source };
    }
  }

  const engine = window.uarsEngine;
  if (!engine) {
    console.warn('[UARS Peers] Engine not available yet.');
    return { RA: 50, peerCount: 0, source: 'none' };
  }

  let source = 'synthetic';

  /* ── STEP 1: Synthetic baseline (instant, always available) ── */
  const synthetic = _syntheticPeerArrays(assetClass);
  engine.setPeerGroups(synthetic);

  /* ── STEP 2: Live peer tickers ── */
  const peerTickers = await _fetchPeerTickers(sym, sector);
  let   peerCount   = peerTickers.length;

  /* ── STEP 3: Market variable arrays (from technical.js cache) ── */
  let marketArrays = {};
  if (peerCount > 0) {
    marketArrays = await _buildMarketPeerArrays(peerTickers);
    source = 'live';
  }

  /* ── STEP 4: Fundamental variable arrays (from FMP) ── */
  let fundamentalArrays = {};
  if (peerCount > 0) {
    const metricsMap = await _fetchPeerMetrics(peerTickers);
    fundamentalArrays = _buildPeerArraysFromMetrics(metricsMap);
    peerCount = Object.keys(metricsMap).length;
  }

  /* ── STEP 5: Merge live arrays with synthetic where live has ≥ 5 ── */
  const finalArrays = { ...synthetic };

  const allArrays = { ...fundamentalArrays, ...marketArrays };
  for (const [varId, arr] of Object.entries(allArrays)) {
    const clean = arr.filter(v => v !== null && isFinite(v));
    if (clean.length >= _PEER_MIN) {
      finalArrays[varId] = clean;
    }
    /* If clean < _PEER_MIN, keep the synthetic fallback for that variable */
  }

  /* ── STEP 6: Register all peer arrays with the engine ── */
  engine.setPeerGroups(finalArrays);

  /* ── STEP 7: Compute RA score ── */
  const RA = _computeRA(sym, peerTickers);

  /* ── STEP 8: Cache result ── */
  const result = { arrays: finalArrays, RA, peerCount, source };
  _peerCacheSet(cacheKey, result);

  /* ── STEP 9: Fire onReady callback ── */
  if (typeof opts.onReady === 'function') {
    opts.onReady(RA);
  }

  console.info(
    `[UARS Peers] ${sym}: ${peerCount} live peers, RA=${RA}, ` +
    `${Object.keys(finalArrays).length} var arrays registered.`
  );

  return { RA, peerCount, source };
};


/* ── Internal: get sector from Finnhub profile cache ─────────────── */
function _getSectorFromCache(sym) {
  /* Finnhub profile is stored in sessionStorage by finnhub.js */
  try {
    const fhKey = (typeof getFinnhubKey === 'function') ? getFinnhubKey() : '';
    if (!fhKey) return null;
    const cacheKey = `fh_https://finnhub.io/api/v1/stock/profile2?symbol=${sym}&token=${fhKey}`;
    const raw = sessionStorage.getItem(cacheKey);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data?.finnhubIndustry || null;
  } catch (_) { return null; }
}


/* ══════════════════════════════════════════════════════════════════
   AUTO-INIT
   Register in config sidebar and log on DOM ready.
══════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  /* Register in KNOWN_PROVIDERS for sidebar visibility */
  if (Array.isArray(window.KNOWN_PROVIDERS)) {
    if (!window.KNOWN_PROVIDERS.find(p => p.id === 'uars_peers')) {
      window.KNOWN_PROVIDERS.push({
        id:         'uars_peers',
        name:       'UARS Peer Builder',
        badge:      'PG',
        group:      'Market Data',
        desc:       'Builds peer-group distributions for UARS engine normalisation. ' +
                    'Uses Finnhub peers + FMP screener + synthetic quantile fallbacks.',
        limit:      'Shares FMP + Finnhub quota',
        docsUrl:    '',
        sessionKey: 'fmp_call_count',
        limitWarn:  null,
        limitMax:   null,
      });
    }
  }

  console.info('[UARS Peer Builder] Module loaded — uarsBuildPeerGroups() ready.');
});
