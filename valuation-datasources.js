/* ══════════════════════════════════════════════════════════════════
   FINTERM — valuation-datasources.js
   Master integration module for all new valuation data sources.
   ──────────────────────────────────────────────────────────────────
   Provides:
     Pipeline 1 — Synthetic Credit Scoring   (FRED BAML + FMP Altman Z)
     Pipeline 2 — Roll Bid-Ask Spread Proxy  (computed from OHLCV)
     Pipeline 3 — ETF Structural Metrics     (computed + FMP + allorigins)
     Pipeline 4 — DefiLlama TVL              (api.llama.fi — no key)
     Pipeline 5 — Blockchain.info On-Chain   (BTC only — no key)
     Pipeline 6 — CoinGecko Supply Data      (api.coingecko.com — no key)
     Pipeline 7 — Peer Group / Rel. Attract. (Finnhub + FMP — existing keys)
   ──────────────────────────────────────────────────────────────────
   All pipelines follow the same pattern as existing terminal modules:
     getKey() → bumpCount() → cacheGet/Set() → coreFetch() → fetchers
   ══════════════════════════════════════════════════════════════════ */

'use strict';

/* ── Module constants ────────────────────────────────────────────── */
const VDS_SESSION_KEY  = 'vds_call_count';
const VDS_TTL_1H       = 60 * 60 * 1000;
const VDS_TTL_24H      = 24 * 60 * 60 * 1000;
const VDS_TTL_6H       = 6  * 60 * 60 * 1000;

/* ── Global stores (consumed by valuation engine) ────────────────── */
window._creditData    = window._creditData    || {};
window._peerData      = window._peerData      || {};
window._cryptoOnChain = window._cryptoOnChain || {};

/* ── Call counter (shared across all VDS pipelines) ─────────────── */
function vdsCallCount() {
  return parseInt(sessionStorage.getItem(VDS_SESSION_KEY) || '0');
}
function vdsBumpCount() {
  const n = vdsCallCount() + 1;
  sessionStorage.setItem(VDS_SESSION_KEY, n);
  if (typeof renderTopbarBadges === 'function') renderTopbarBadges();
  return n;
}

/* ── Unified cache helpers ───────────────────────────────────────── */
function vdsCacheGet(key, ttl) {
  try {
    const raw = sessionStorage.getItem('vds_' + key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > ttl) return null;
    return data;
  } catch (_) { return null; }
}

function vdsCacheSet(key, data) {
  try {
    sessionStorage.setItem('vds_' + key, JSON.stringify({ ts: Date.now(), data }));
  } catch (_) { /* quota exceeded — skip */ }
}

/* ── Generic no-auth fetch with timeout ─────────────────────────── */
async function vdsFetch(url, opts = {}) {
  vdsBumpCount();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout || 10000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: opts.headers || {},
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return opts.text ? await res.text() : await res.json();
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error('TIMEOUT');
    throw e;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   PIPELINE 1 — SYNTHETIC CREDIT SCORING
   Uses: FMP fundamentals + FRED BAML spreads
   Computes: Altman Z-Score → credit tier → numeric score 0–100
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Altman Z-Score (public company model):
 *   Z = 1.2·X1 + 1.4·X2 + 3.3·X3 + 0.6·X4 + 1.0·X5
 *   X1 = Working Capital / Total Assets
 *   X2 = Retained Earnings / Total Assets
 *   X3 = EBIT / Total Assets
 *   X4 = Market Cap / Total Liabilities
 *   X5 = Revenue / Total Assets
 *
 * Z > 2.99   → Safe zone   → Investment Grade proxy
 * 1.81–2.99  → Grey zone   → BBB–BB boundary
 * Z < 1.81   → Distress    → Below investment grade
 */
function _computeAltmanZ(f) {
  const { totalAssets, totalLiabilities, retainedEarnings,
          workingCapital, ebit, revenue, marketCap } = f;

  if (!totalAssets || totalAssets === 0) return null;

  const X1 = (workingCapital  || 0) / totalAssets;
  const X2 = (retainedEarnings|| 0) / totalAssets;
  const X3 = (ebit            || 0) / totalAssets;
  const X4 = (marketCap       || 0) / Math.max(totalLiabilities || 1, 1);
  const X5 = (revenue         || 0) / totalAssets;

  return 1.2 * X1 + 1.4 * X2 + 3.3 * X3 + 0.6 * X4 + 1.0 * X5;
}

/**
 * Map Altman Z to credit tier and numeric score
 * Supplemented by FRED OAS spreads to place the asset on the
 * investment grade → high yield spread spectrum.
 */
function _altmanZToCredit(z, igOAS, hyOAS, bbbOAS) {
  /* ── Tier classification from Z-score ── */
  let tier, tierLabel, baseScore;

  if      (z === null)    { tier = 'unknown';    tierLabel = 'N/A';        baseScore = 50; }
  else if (z >= 3.5)      { tier = 'aa';         tierLabel = 'AA';         baseScore = 87; }
  else if (z >= 2.99)     { tier = 'a';          tierLabel = 'A';          baseScore = 75; }
  else if (z >= 2.60)     { tier = 'bbb_plus';   tierLabel = 'BBB+';       baseScore = 65; }
  else if (z >= 2.20)     { tier = 'bbb';        tierLabel = 'BBB';        baseScore = 58; }
  else if (z >= 1.81)     { tier = 'bbb_minus';  tierLabel = 'BBB−';       baseScore = 52; }
  else if (z >= 1.50)     { tier = 'bb';         tierLabel = 'BB';         baseScore = 44; }
  else if (z >= 1.20)     { tier = 'b';          tierLabel = 'B';          baseScore = 33; }
  else                    { tier = 'ccc';        tierLabel = 'CCC';        baseScore = 18; }

  /* ── Adjust score using live spread environment ── */
  /* Tighter spreads → environment is benign → slight uplift to score */
  let spreadAdjustment = 0;
  if (igOAS !== null && hyOAS !== null) {
    /* Normalise: typical IG OAS 80–200bps, HY 300–800bps */
    const igNorm = Math.max(0, Math.min(1, (igOAS - 50)  / 250));   // 0=tight, 1=wide
    const hyNorm = Math.max(0, Math.min(1, (hyOAS - 200) / 800));
    const spreadStress = 0.5 * igNorm + 0.5 * hyNorm;  // 0=calm, 1=stressed

    /* In calm environment IG assets get slight uplift, HY assets get slight cut */
    if (tier === 'aa' || tier === 'a' || tier === 'bbb_plus') {
      spreadAdjustment = Math.round((1 - spreadStress) * 5);   // up to +5
    } else if (tier === 'bb' || tier === 'b' || tier === 'ccc') {
      spreadAdjustment = Math.round(-spreadStress * 8);         // up to −8
    }
  }

  const finalScore = Math.max(0, Math.min(100, baseScore + spreadAdjustment));

  /* ── CDS proxy: uses HY/IG OAS as bounds ── */
  let cdsProxy = null;
  if (hyOAS !== null && igOAS !== null) {
    /* Linear interpolation between IG and HY OAS based on Z-score */
    const t = z !== null ? Math.max(0, Math.min(1, (2.99 - z) / (2.99 - 1.0))) : 0.5;
    cdsProxy = Math.round(igOAS + t * (hyOAS - igOAS));
  }

  return {
    altmanZ:      z !== null ? +z.toFixed(3) : null,
    creditTier:   tier,
    tierLabel,
    numericScore: finalScore,
    oasProxy:     bbbOAS ?? igOAS ?? null,
    cdsProxy,
    confidence:   z !== null ? (Math.abs(z - 2.0) > 0.8 ? 'high' : 'medium') : 'low',
  };
}

/**
 * getSyntheticCreditScore(ticker)
 * Fetches FMP key metrics + FRED spreads, computes Altman Z,
 * returns a credit quality object for valuation engines.
 *
 * @param {string} ticker
 * @returns {Promise<CreditResult | null>}
 */
window.getSyntheticCreditScore = async function getSyntheticCreditScore(ticker) {
  if (!ticker) return null;
  const sym = ticker.replace(/.*:/, '').toUpperCase();

  /* L1 cache */
  const cached = vdsCacheGet('credit_' + sym, VDS_TTL_6H);
  if (cached) {
    window._creditData[sym] = cached;
    return cached;
  }

  try {
    /* Parallel: FMP fundamentals + FRED spreads */
    const [spreads, keyMetrics, incomeData, balanceData] = await Promise.allSettled([
      typeof fredGetCreditSpreads === 'function'
        ? fredGetCreditSpreads()
        : Promise.resolve(null),
      typeof fmpFetch === 'function'
        ? fmpFetch(`/v3/key-metrics-ttm/${sym}`, sym)
        : Promise.resolve(null),
      typeof fmpFetch === 'function'
        ? fmpFetch(`/v3/income-statement/${sym}`, sym, { limit: '1', period: 'annual' })
        : Promise.resolve(null),
      typeof fmpFetch === 'function'
        ? fmpFetch(`/v3/balance-sheet-statement/${sym}`, sym, { limit: '1', period: 'annual' })
        : Promise.resolve(null),
    ]);

    const sp  = spreads.status      === 'fulfilled' ? spreads.value      : null;
    const km  = keyMetrics.status   === 'fulfilled' ? (keyMetrics.value?.[0] || null) : null;
    const inc = incomeData.status   === 'fulfilled' ? (incomeData.value?.[0] || null) : null;
    const bal = balanceData.status  === 'fulfilled' ? (balanceData.value?.[0] || null) : null;

    /* Build fundamentals object for Altman Z */
    const fundamentals = {
      totalAssets:       bal?.totalAssets        || km?.totalAssetsTTM        || null,
      totalLiabilities:  bal?.totalLiabilities   || null,
      retainedEarnings:  bal?.retainedEarnings   || null,
      workingCapital:    (bal?.totalCurrentAssets || 0) - (bal?.totalCurrentLiabilities || 0) || null,
      ebit:              inc?.ebit               || inc?.operatingIncome       || null,
      revenue:           inc?.revenue            || km?.revenuePerShareTTM     || null,
      marketCap:         km?.marketCapTTM        || null,
    };

    const z = _computeAltmanZ(fundamentals);
    const credit = _altmanZToCredit(
      z,
      sp?.igOAS        ?? null,
      sp?.hyOAS        ?? null,
      sp?.bbbOAS       ?? null,
    );

    const result = {
      ...credit,
      riskFreeRate:  sp?.riskFreeRate ?? window._treasuryYields?.['10Y'] ?? 4.3,
      fundamentals,
      spreadEnvironment: sp ? {
        igOAS:  sp.igOAS,
        hyOAS:  sp.hyOAS,
        bbbOAS: sp.bbbOAS,
      } : null,
      timestamp: new Date().toISOString().slice(0, 10),
    };

    vdsCacheSet('credit_' + sym, result);
    window._creditData[sym] = result;
    return result;

  } catch (e) {
    console.warn('[VDS] getSyntheticCreditScore error:', e.message);
    return null;
  }
};

/* ═══════════════════════════════════════════════════════════════════
   PIPELINE 2 — ROLL BID-ASK SPREAD ESTIMATOR
   Uses existing OHLCV from eodhd.js / yahoo.js sessionStorage cache
   Roll estimator: BA = 2 · √(max(0, −Cov(r_t, r_{t−1})))
   ═══════════════════════════════════════════════════════════════════ */

/**
 * _getPriceSeriesFromCache(sym)
 * Reads an array of closing prices from sessionStorage.
 * Tries eodhd cache keys first, then yahoo, then technical.js cache.
 */
function _getPriceSeriesFromCache(sym) {
  const candidates = [
    `eodhd_hist_${sym}`,
    `eodhd_${sym}_D`,
    `tc:${sym}:D`,                  // technical.js internal key
    `yahoo_hist_${sym}`,
  ];

  for (const key of candidates) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);

      /* EODHD format: { data: [{close, date}, ...] } */
      if (parsed?.data && Array.isArray(parsed.data)) {
        const closes = parsed.data
          .map(d => d.close || d.adjClose || d.adjusted_close)
          .filter(v => v != null && !isNaN(v))
          .slice(-60);
        if (closes.length >= 10) return closes;
      }

      /* Technical.js format: { d: { c: [...], t: [...] } } */
      if (parsed?.d?.c) {
        const closes = parsed.d.c.slice(-60);
        if (closes.length >= 10) return closes;
      }

      /* Raw array of numbers */
      if (Array.isArray(parsed) && typeof parsed[0] === 'number') {
        return parsed.slice(-60);
      }
    } catch (_) { continue; }
  }
  return null;
}

/**
 * getRollSpreadEstimate(ticker)
 * Computes the Roll bid-ask spread estimator from cached price series.
 * Returns a liquidity object consumed by the valuation engines.
 *
 * @param {string} ticker
 * @returns {{ rollSpread: number, spreadBps: number, liquidityScore: number, dataPoints: number } | null}
 */
window.getRollSpreadEstimate = function getRollSpreadEstimate(ticker) {
  const sym = ticker.replace(/.*:/, '').toUpperCase();

  const cached = vdsCacheGet('roll_' + sym, VDS_TTL_1H);
  if (cached) return cached;

  const closes = _getPriceSeriesFromCache(sym);
  if (!closes || closes.length < 10) return null;

  /* Compute log returns */
  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > 0 && closes[i - 1] > 0) {
      returns.push(Math.log(closes[i] / closes[i - 1]));
    }
  }
  if (returns.length < 8) return null;

  /* Compute serial covariance: Cov(r_t, r_{t-1}) */
  const n  = returns.length - 1;
  let cov  = 0;
  for (let i = 0; i < n; i++) {
    cov += returns[i + 1] * returns[i];
  }
  cov /= n;

  /* Roll estimator: 2·√(max(0, -cov)) */
  const rollSpread = 2 * Math.sqrt(Math.max(0, -cov));

  /* Convert to basis points using latest price */
  const lastPrice  = closes[closes.length - 1];
  const spreadBps  = lastPrice > 0 ? Math.round(rollSpread / lastPrice * 10000) : null;

  /* Normalise to a liquidity score: lower spread = higher score */
  /* Typical equity daily Roll spread: 0.0001–0.002 (1–20 bps) */
  /* Score: 100 at 0 bps, 50 at 10 bps, 0 at 50+ bps */
  const liquidityScore = spreadBps !== null
    ? Math.max(0, Math.round(100 - spreadBps * 2))
    : 50;

  const result = {
    rollSpread:    +rollSpread.toFixed(6),
    spreadBps:     spreadBps ?? 0,
    liquidityScore,
    dataPoints:    returns.length,
    lastPrice,
  };

  vdsCacheSet('roll_' + sym, result);
  return result;
};

/* ═══════════════════════════════════════════════════════════════════
   PIPELINE 3 — ETF STRUCTURAL METRICS
   Primary:   Computed tracking error from EODHD price returns
   Secondary: FMP /etf-info for expense ratio
   Tertiary:  ETF.com via api.allorigins.win proxy
   ═══════════════════════════════════════════════════════════════════ */

/** Known ETF benchmark mappings (symbol → benchmark symbol) */
const ETF_BENCHMARK_MAP = {
  /* US broad market */
  'SPY': 'SPX', 'IVV': 'SPX', 'VOO': 'SPX', 'VTI': 'VTI_IDX',
  'QQQ': 'NDX', 'QQQM': 'NDX',
  /* Sectors */
  'XLF': 'S5FINL', 'XLE': 'S5ENRS', 'XLK': 'S5INFT', 'XLV': 'S5HLTH',
  /* International */
  'EFA': 'MXEA',   'EEM': 'MXEF',   'VEA': 'MXEA',   'VWO': 'MXEF',
  /* Bonds */
  'AGG': 'LBUSTRUU', 'BND': 'LBUSTRUU', 'TLT': 'IDC_US30',
  'HYG': 'IBOXHY',   'JNK': 'IBOXHY',   'LQD': 'IBOXIG',
};

/**
 * _computeTrackingError(etfCloses, benchCloses)
 * Annualised std dev of daily return differences.
 * Returns tracking error as a decimal (e.g., 0.003 = 30bps/year)
 */
function _computeTrackingError(etfCloses, benchCloses) {
  const len = Math.min(etfCloses.length, benchCloses.length);
  if (len < 20) return null;

  const diffs = [];
  for (let i = 1; i < len; i++) {
    const re = Math.log(etfCloses[i]  / etfCloses[i - 1]);
    const rb = Math.log(benchCloses[i]/ benchCloses[i - 1]);
    diffs.push(re - rb);
  }

  const mean   = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const variance = diffs.reduce((a, d) => a + Math.pow(d - mean, 2), 0) / (diffs.length - 1);
  return Math.sqrt(variance * 252);   // annualise assuming 252 trading days
}

/**
 * getETFStructuralMetrics(ticker)
 * Returns ETF tracking error + expense ratio + structural score.
 *
 * @param {string} ticker
 * @returns {Promise<ETFStructural | null>}
 */
window.getETFStructuralMetrics = async function getETFStructuralMetrics(ticker) {
  const sym = ticker.replace(/.*:/, '').toUpperCase();

  const cached = vdsCacheGet('etf_struct_' + sym, VDS_TTL_24H);
  if (cached) return cached;

  let trackingError  = null;
  let trackingDiff   = null;
  let expenseRatio   = null;
  let dataSource     = 'none';

  /* ── A: Attempt FMP /etf-info (expense ratio + benchmark name) ── */
  try {
    if (typeof fmpFetch === 'function') {
      const etfInfo = await fmpFetch(`/v3/etf-info`, sym, { symbol: sym });
      if (etfInfo && etfInfo[0]) {
        expenseRatio  = etfInfo[0].expenseRatio   ?? null;
        dataSource    = 'fmp';
      }
    }
  } catch (_) { /* continue */ }

  /* ── B: Compute tracking error from cached price returns ── */
  const benchSym = ETF_BENCHMARK_MAP[sym] || null;
  if (benchSym) {
    const etfPrices   = _getPriceSeriesFromCache(sym);
    const benchPrices = _getPriceSeriesFromCache(benchSym);

    if (etfPrices && benchPrices) {
      trackingError = _computeTrackingError(etfPrices, benchPrices);
      if (trackingError !== null) {
        /* Tracking difference: simple mean of daily return diffs × 252 */
        const len    = Math.min(etfPrices.length, benchPrices.length) - 1;
        let sumDiff  = 0;
        for (let i = 1; i <= len; i++) {
          sumDiff += Math.log(etfPrices[i] / etfPrices[i-1])
                   - Math.log(benchPrices[i]/ benchPrices[i-1]);
        }
        trackingDiff = sumDiff;  /* negative = underperformed benchmark */
        dataSource   = 'computed';
      }
    }
  }

  /* ── C: Fallback — ETF.com via allorigins proxy ── */
  if (trackingError === null || expenseRatio === null) {
    try {
      const etfUrl   = `https://www.etf.com/${sym}`;
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(etfUrl)}`;
      const resp     = await vdsFetch(proxyUrl, { timeout: 8000 });
      const html     = resp?.contents || '';

      /* Parse tracking difference from ETF.com page */
      const tdMatch = html.match(/Tracking Difference[^0-9\-]*([−\-]?\d+\.\d+)%/i);
      if (tdMatch) {
        trackingDiff  = parseFloat(tdMatch[1].replace('−', '-')) / 100;
        dataSource    = trackingError === null ? 'etfcom' : dataSource;
      }

      /* Parse expense ratio */
      const erMatch = html.match(/Expense Ratio[^0-9]*(\d+\.\d+)%/i);
      if (erMatch && expenseRatio === null) {
        expenseRatio = parseFloat(erMatch[1]) / 100;
      }
    } catch (_) { /* proxy unavailable */ }
  }

  /* ── Compute structural score ── */
  /* Lower tracking error + lower expense = higher score */
  let structuralScore = 75;  /* default for unknown */
  if (trackingError !== null) {
    /* TE in annual terms: 0% → 100 pts, 1% → 80 pts, 3% → 60 pts, 5%+ → 40 pts */
    const teScore = Math.max(40, 100 - trackingError * 2000);
    structuralScore = Math.round(teScore);
  }
  if (expenseRatio !== null) {
    /* ER penalty: 0.03% = –0 pts, 0.5% = –5 pts, 1%+ = –15 pts */
    structuralScore = Math.max(20, structuralScore - Math.round(expenseRatio * 1500));
  }

  const result = {
    trackingError:   trackingError !== null ? +trackingError.toFixed(5) : null,
    trackingDiff:    trackingDiff  !== null ? +trackingDiff.toFixed(5)  : null,
    expenseRatio:    expenseRatio  !== null ? +expenseRatio.toFixed(5)  : null,
    trackingErrorBps: trackingError !== null ? Math.round(trackingError * 10000) : null,
    expenseRatioBps:  expenseRatio  !== null ? Math.round(expenseRatio  * 10000) : null,
    structuralScore,
    dataSource,
    benchmarkUsed: benchSym,
  };

  vdsCacheSet('etf_struct_' + sym, result);
  return result;
};

/* ═══════════════════════════════════════════════════════════════════
   PIPELINE 4 — DEFILLAMA TVL  (api.llama.fi — no auth)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Symbol → DefiLlama slug mapping (top 50 DeFi protocols)
 * Key = ticker/symbol (uppercase), Value = DefiLlama protocol slug
 */
const DEFILLAMA_SLUG_MAP = {
  'UNI':   'uniswap',      'AAVE':  'aave',         'CRV':   'curve-dex',
  'MKR':   'makerdao',     'COMP':  'compound-finance', 'SNX': 'synthetix',
  'BAL':   'balancer',     'YFI':   'yearn-finance', 'SUSHI': 'sushiswap',
  'LDO':   'lido',         'RPL':   'rocket-pool',   'FXS':   'frax',
  'CVX':   'convex-finance','PENDLE':'pendle',        'GMX':   'gmx',
  'ARB':   'arbitrum',     'OP':    'optimism',       'MATIC': 'polygon',
  'AVAX':  'avalanche',    'FTM':   'fantom',         'NEAR':  'near',
  'SOL':   'solana',       'ADA':   'aave',           'DOT':   'polkadot',
  'ATOM':  'cosmos',       'LINK':  'chainlink',      'GRT':   'the-graph',
  'INJ':   'injective',    'TIA':   'celestia',       'JUP':   'jupiter',
  'JTO':   'jito',         'WIF':   'dogwifhat',      'PYTH':  'pyth-network',
  'ENA':   'ethena',       'EIGEN': 'eigenlayer',     'USUAL': 'usual',
  'ONDO':  'ondo-finance', 'STRK':  'starknet',       'BLUR':  'blur',
  'DYDX':  'dydx',         '1INCH': '1inch-network',  'ZRX':   '0x',
  'PERP':  'perpetual-protocol', 'ALPHA':'alpha-finance',
  'BNT':   'bancor',       'KNC':   'kyber-network',  'RUNE':  'thorchain',
  'OSMO':  'osmosis',      'CAKE':  'pancakeswap',    'JOE':   'trader-joe',
};

/**
 * getDefiLlamaTVL(symbol)
 * Fetches TVL and 30D growth for a DeFi protocol.
 * Returns null gracefully for non-DeFi assets.
 *
 * @param {string} symbol  — e.g. 'UNI', 'AAVE'
 * @returns {Promise<DefiTVL | null>}
 */
window.getDefiLlamaTVL = async function getDefiLlamaTVL(symbol) {
  const sym  = symbol.replace(/.*:/, '').toUpperCase();
  const slug = DEFILLAMA_SLUG_MAP[sym];

  if (!slug) return { dataAvailable: false, symbol: sym };

  const cacheKey = 'tvl_' + sym;
  const cached   = vdsCacheGet(cacheKey, VDS_TTL_1H);
  if (cached) return cached;

  try {
    /* Fetch protocol summary */
    const protocol = await vdsFetch(`https://api.llama.fi/protocol/${slug}`, { timeout: 8000 });
    if (!protocol || !protocol.tvl) return { dataAvailable: false, symbol: sym };

    const currentTVL = protocol.currentChainTvls
      ? Object.values(protocol.currentChainTvls).reduce((a, b) => a + b, 0)
      : (Array.isArray(protocol.tvl) ? protocol.tvl[protocol.tvl.length - 1]?.totalLiquidityUSD : null);

    /* 30D TVL growth from historical array */
    let tvlGrowth30D = null;
    if (Array.isArray(protocol.tvl) && protocol.tvl.length >= 30) {
      const now30  = protocol.tvl[protocol.tvl.length - 1]?.totalLiquidityUSD;
      const ago30  = protocol.tvl[protocol.tvl.length - 31]?.totalLiquidityUSD;
      if (now30 && ago30 && ago30 > 0) {
        tvlGrowth30D = (now30 - ago30) / ago30;
      }
    }

    /* Protocol rank by TVL from full list */
    let rank = null;
    try {
      const allProtos = await vdsFetch('https://api.llama.fi/protocols', { timeout: 6000 });
      if (Array.isArray(allProtos)) {
        const sorted = allProtos.slice().sort((a, b) => (b.tvl || 0) - (a.tvl || 0));
        rank = sorted.findIndex(p => p.slug === slug) + 1 || null;
      }
    } catch (_) { /* rank optional */ }

    const result = {
      dataAvailable: true,
      symbol:        sym,
      protocolSlug:  slug,
      tvlUSD:        currentTVL ? Math.round(currentTVL) : null,
      tvlGrowth30D:  tvlGrowth30D !== null ? +tvlGrowth30D.toFixed(4) : null,
      rank,
      category:      protocol.category || null,
      chains:        protocol.chains   || [],
    };

    vdsCacheSet(cacheKey, result);
    return result;

  } catch (e) {
    console.warn(`[VDS] getDefiLlamaTVL(${sym}):`, e.message);
    return { dataAvailable: false, symbol: sym };
  }
};

/* ═══════════════════════════════════════════════════════════════════
   PIPELINE 5 — BLOCKCHAIN.INFO ON-CHAIN (BTC only, no auth)
   Metrics: Hash Rate · Active Addresses · Transaction Count
   ═══════════════════════════════════════════════════════════════════ */

/** blockchain.info chart endpoint builder */
function _bchart(metric, timespan = '30days') {
  return `https://blockchain.info/charts/${metric}?format=json&cors=true&timespan=${timespan}&sampled=true`;
}

/**
 * _btcTrend(values)
 * Computes linear trend (slope as fractional change over the period)
 * and 30D growth from first to last value.
 */
function _btcTrend(values) {
  if (!values || values.length < 2) return { trend: null, growth30D: null };
  const first = values[0];
  const last  = values[values.length - 1];
  if (!first || first === 0) return { trend: null, growth30D: null };
  return {
    trend:    +((last - first) / first).toFixed(4),
    growth30D:+((last - first) / first).toFixed(4),
    latest:   last,
    first,
  };
}

/**
 * getBitcoinOnChain()
 * Fetches three blockchain.info metrics for Bitcoin.
 * Only applies to BTC — returns null for all other assets.
 *
 * @returns {Promise<BTCOnChain | null>}
 */
window.getBitcoinOnChain = async function getBitcoinOnChain() {
  const cached = vdsCacheGet('btc_onchain', VDS_TTL_24H);
  if (cached) {
    window._cryptoOnChain['BTC'] = { ...window._cryptoOnChain['BTC'], ...cached };
    return cached;
  }

  try {
    const [hashRes, addrRes, txRes] = await Promise.allSettled([
      vdsFetch(_bchart('hash-rate',           '30days'), { timeout: 10000 }),
      vdsFetch(_bchart('n-unique-addresses',   '30days'), { timeout: 10000 }),
      vdsFetch(_bchart('n-transactions',       '30days'), { timeout: 10000 }),
    ]);

    /* Extract value arrays from blockchain.info response */
    const _vals = res => {
      if (res.status !== 'fulfilled' || !res.value?.values) return null;
      return res.value.values.map(v => v.y).filter(v => v != null && v > 0);
    };

    const hashVals = _vals(hashRes);
    const addrVals = _vals(addrRes);
    const txVals   = _vals(txRes);

    const hashInfo = _btcTrend(hashVals);
    const addrInfo = _btcTrend(addrVals);
    const txInfo   = _btcTrend(txVals);

    /* Security score: hash rate trend → higher is better */
    /* Positive trend = network growing = more secure */
    const securityScore = hashInfo.trend !== null
      ? Math.min(100, Math.max(0, Math.round(50 + hashInfo.trend * 200)))
      : 50;

    /* Adoption score: active address growth */
    const adoptionScore = addrInfo.trend !== null
      ? Math.min(100, Math.max(0, Math.round(50 + addrInfo.trend * 300)))
      : 50;

    const result = {
      /* Hash rate */
      latestHashRate:     hashInfo.latest    ?? null,
      hashRateTrend:      hashInfo.trend     ?? null,
      hashRateGrowth30D:  hashInfo.growth30D ?? null,
      securityScore,

      /* Active addresses */
      latestActiveAddr:     addrInfo.latest    ?? null,
      activeAddrGrowth30D:  addrInfo.growth30D ?? null,
      adoptionScore,

      /* Transaction count */
      latestTxCount:     txInfo.latest    ?? null,
      txCountGrowth30D:  txInfo.growth30D ?? null,

      timestamp: new Date().toISOString().slice(0, 10),
    };

    vdsCacheSet('btc_onchain', result);
    window._cryptoOnChain['BTC'] = { ...window._cryptoOnChain['BTC'], ...result };
    return result;

  } catch (e) {
    console.warn('[VDS] getBitcoinOnChain error:', e.message);
    return null;
  }
};

/* ═══════════════════════════════════════════════════════════════════
   PIPELINE 6 — COINGECKO SUPPLY DATA (no auth — free tier)
   ═══════════════════════════════════════════════════════════════════ */

/** Top crypto symbol → CoinGecko ID mapping */
const COINGECKO_ID_MAP = {
  'BTC':   'bitcoin',       'ETH':   'ethereum',      'BNB':   'binancecoin',
  'SOL':   'solana',        'XRP':   'ripple',         'USDC':  'usd-coin',
  'ADA':   'cardano',       'AVAX':  'avalanche-2',    'DOGE':  'dogecoin',
  'DOT':   'polkadot',      'LINK':  'chainlink',      'MATIC': 'matic-network',
  'UNI':   'uniswap',       'LTC':   'litecoin',       'BCH':   'bitcoin-cash',
  'ATOM':  'cosmos',        'XLM':   'stellar',        'ALGO':  'algorand',
  'NEAR':  'near',          'ICP':   'internet-computer', 'FIL': 'filecoin',
  'VET':   'vechain',       'AAVE':  'aave',           'GRT':   'the-graph',
  'SNX':   'havven',        'MKR':   'maker',          'COMP':  'compound-governance-token',
  'CRV':   'curve-dao-token','YFI':  'yearn-finance',  'SUSHI': 'sushi',
  'ARB':   'arbitrum',      'OP':    'optimism',       'LDO':   'lido-dao',
  'IMX':   'immutable-x',   'APT':   'aptos',          'SUI':   'sui',
  'SEI':   'sei-network',   'TIA':   'celestia',       'INJ':   'injective-protocol',
  'PYTH':  'pyth-network',  'JTO':   'jito-governance-token',
  'WIF':   'dogwifcoin',    'BONK':  'bonk',           'PEPE':  'pepe',
  'ENA':   'ethena',        'ONDO':  'ondo-finance',   'USUAL': 'usual',
  'STRK':  'starknet',      'BLUR':  'blur',           'JUP':   'jupiter-exchange-solana',
  'DYDX':  'dydx',          'GMX':   'gmx',            'PENDLE':'pendle',
};

/**
 * getCoinGeckoSupplyData(symbol)
 * Fetches circulating supply, total supply, and price change data
 * from CoinGecko to compute supply inflation rate and dilution score.
 *
 * @param {string} symbol  — e.g. 'BTC', 'ETH'
 * @returns {Promise<CryptoSupply | null>}
 */
window.getCoinGeckoSupplyData = async function getCoinGeckoSupplyData(symbol) {
  const sym = symbol.replace(/.*:/, '').toUpperCase();
  const coinId = COINGECKO_ID_MAP[sym];
  if (!coinId) return { dataAvailable: false, symbol: sym };

  const cacheKey = 'supply_' + sym;
  const cached   = vdsCacheGet(cacheKey, VDS_TTL_6H);
  if (cached) {
    window._cryptoOnChain[sym] = { ...window._cryptoOnChain[sym], ...cached };
    return cached;
  }

  try {
    const url  = `https://api.coingecko.com/api/v3/coins/${coinId}`
               + `?localization=false&tickers=false&market_data=true`
               + `&community_data=false&developer_data=false&sparkline=false`;

    const data = await vdsFetch(url, { timeout: 10000 });
    if (!data?.market_data) return { dataAvailable: false, symbol: sym };

    const md = data.market_data;

    const circulating = md.circulating_supply      || null;
    const total       = md.total_supply            || null;
    const maxSupply   = md.max_supply              || null;

    /* Supply utilisation: how much of total supply is in circulation */
    const supplyUtil  = (circulating && total && total > 0)
      ? +(circulating / total).toFixed(4) : null;

    /* Inflation rate proxy: 30D circulating supply change % */
    const inflationRate = md.circulating_supply_change_percentage_30d != null
      ? +(md.circulating_supply_change_percentage_30d / 100).toFixed(6)
      : null;

    /* Dilution score: lower inflation = higher score (better for holders) */
    /* 0% inflation → 100, 5% → 50, 10%+ → 0 */
    const inflAnnual = inflationRate !== null ? inflationRate * 12 : null;  /* rough annualise */
    const dilutionScore = inflAnnual !== null
      ? Math.max(0, Math.round(100 - inflAnnual * 1000))
      : 60;  /* default neutral */

    const result = {
      dataAvailable:    true,
      symbol:           sym,
      coinGeckoId:      coinId,
      circulatingSupply: circulating,
      totalSupply:       total,
      maxSupply,
      supplyUtilisation: supplyUtil,
      inflationRate,
      inflationRateAnnualised: inflAnnual !== null ? +inflAnnual.toFixed(6) : null,
      dilutionScore,
      priceChange30D:   md.price_change_percentage_30d_in_currency?.usd ?? null,
      priceChange7D:    md.price_change_percentage_7d_in_currency?.usd  ?? null,
      ath:              md.ath?.usd             ?? null,
      athChangePercent: md.ath_change_percentage?.usd ?? null,
    };

    vdsCacheSet(cacheKey, result);
    window._cryptoOnChain[sym] = { ...window._cryptoOnChain[sym], ...result };
    return result;

  } catch (e) {
    console.warn(`[VDS] getCoinGeckoSupplyData(${sym}):`, e.message);
    return { dataAvailable: false, symbol: sym };
  }
};

/* ═══════════════════════════════════════════════════════════════════
   PIPELINE 7 — PEER GROUP & RELATIVE ATTRACTIVENESS
   Uses: Finnhub /stock/peers + FMP /key-metrics-ttm for peer set
   ═══════════════════════════════════════════════════════════════════ */

/** Variables used to build the RA score (valuation + growth + profitability) */
const RA_VARIABLES = [
  { key: 'peRatioTTM',          higherIsBetter: false, weight: 0.20 },
  { key: 'evToEbitdaTTM',       higherIsBetter: false, weight: 0.15 },
  { key: 'priceToBookRatioTTM', higherIsBetter: false, weight: 0.10 },
  { key: 'freeCashFlowYieldTTM',higherIsBetter: true,  weight: 0.15 },
  { key: 'revenueGrowthTTM',    higherIsBetter: true,  weight: 0.15 },
  { key: 'roeTTM',              higherIsBetter: true,  weight: 0.15 },
  { key: 'operatingProfitMarginTTM', higherIsBetter: true, weight: 0.10 },
];

/**
 * _percentileScore(value, peerValues, higherIsBetter)
 * Returns a 0–100 score representing where value falls in the peer distribution.
 */
function _percentileScore(value, peerValues, higherIsBetter) {
  if (value == null || !peerValues.length) return 50;
  const valid = peerValues.filter(v => v != null && isFinite(v)).sort((a, b) => a - b);
  if (!valid.length) return 50;
  const rank  = valid.filter(v => v < value).length;
  const score = Math.round((rank / valid.length) * 100);
  return higherIsBetter ? score : 100 - score;
}

/**
 * getPeerGroup(ticker)
 * Fetches peer tickers from Finnhub, loads key metrics for each,
 * computes peer-relative percentile scores and overall RA score.
 *
 * @param {string} ticker
 * @returns {Promise<PeerGroup | null>}
 */
window.getPeerGroup = async function getPeerGroup(ticker) {
  const sym = ticker.replace(/.*:/, '').toUpperCase();

  const cached = vdsCacheGet('peers_' + sym, VDS_TTL_24H);
  if (cached) {
    window._peerData[sym] = cached;
    return cached;
  }

  try {
    /* Step 1: fetch peer tickers from Finnhub */
    const finnhubKey = (typeof getFinnhubKey === 'function') ? getFinnhubKey() : '';
    if (!finnhubKey) return null;

    const peersData = await vdsFetch(
      `https://finnhub.io/api/v1/stock/peers?symbol=${sym}&token=${finnhubKey}`,
      { timeout: 8000 }
    );

    /* Finnhub returns an array of arrays; flatten and filter */
    let peers = [];
    if (Array.isArray(peersData)) {
      /* Can be flat array or array-of-arrays depending on API version */
      const flat = peersData.flat ? peersData.flat() : [].concat(...peersData);
      peers = flat
        .filter(p => typeof p === 'string' && p !== sym && !p.includes(':'))
        .slice(0, 10);
    }

    if (!peers.length) return null;

    /* Step 2: fetch key metrics for target + all peers */
    const allSyms    = [sym, ...peers];
    const metricsMap = {};

    if (typeof fmpFetch === 'function') {
      const results = await Promise.allSettled(
        allSyms.map(s =>
          fmpFetch(`/v3/key-metrics-ttm/${s}`, s)
            .then(d => ({ sym: s, metrics: d?.[0] || null }))
        )
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.metrics) {
          metricsMap[r.value.sym] = r.value.metrics;
        }
      }
    }

    if (!metricsMap[sym]) return null;  /* need at least the target metrics */

    /* Step 3: compute peer medians and percentile scores */
    const targetMetrics = metricsMap[sym];
    const peerMetrics   = peers.map(p => metricsMap[p]).filter(Boolean);

    const peerMedians = {};
    const percentileScores = {};

    for (const v of RA_VARIABLES) {
      const peerVals    = peerMetrics.map(m => m[v.key]).filter(x => x != null && isFinite(x));
      const targetVal   = targetMetrics[v.key] ?? null;

      /* Median for reference */
      if (peerVals.length) {
        const sorted        = [...peerVals].sort((a, b) => a - b);
        const mid           = Math.floor(sorted.length / 2);
        peerMedians[v.key]  = sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];
      }

      /* Percentile score for the target vs peers */
      percentileScores[v.key] = _percentileScore(targetVal, peerVals, v.higherIsBetter);
    }

    /* Step 4: compute weighted RA score */
    let raScore = 0, totalWeight = 0;
    for (const v of RA_VARIABLES) {
      if (percentileScores[v.key] != null) {
        raScore      += percentileScores[v.key] * v.weight;
        totalWeight  += v.weight;
      }
    }
    raScore = totalWeight > 0 ? Math.round(raScore / totalWeight) : 50;

    const result = {
      symbol:            sym,
      peers,
      peerCount:         peerMetrics.length,
      peerMedians,
      percentileScores,
      raScore,
      targetMetrics: {
        pe:        targetMetrics.peRatioTTM            ?? null,
        evEbitda:  targetMetrics.evToEbitdaTTM         ?? null,
        fcfYield:  targetMetrics.freeCashFlowYieldTTM  ?? null,
        revGrowth: targetMetrics.revenueGrowthTTM      ?? null,
        roe:       targetMetrics.roeTTM                ?? null,
        margin:    targetMetrics.operatingProfitMarginTTM ?? null,
      },
    };

    vdsCacheSet('peers_' + sym, result);
    window._peerData[sym] = result;
    return result;

  } catch (e) {
    console.warn('[VDS] getPeerGroup error:', e.message);
    return null;
  }
};

/* ═══════════════════════════════════════════════════════════════════
   CONFIG REGISTRATION
   Registers this module in KNOWN_PROVIDERS so the sidebar shows
   the new zero-key sources correctly.
   ═══════════════════════════════════════════════════════════════════ */
(function _vdsRegisterProviders() {
  if (!Array.isArray(window.KNOWN_PROVIDERS)) return;

  const newProviders = [
    {
      id:         'defillama',
      name:       'DefiLlama — DeFi TVL',
      badge:      'DFL',
      group:      'Crypto & On-Chain',
      desc:       'Total Value Locked for 3,000+ DeFi protocols across all chains. ' +
                  'Supplies TVL and 30D TVL growth for System B Crypto model. ' +
                  'No API key required — open data.',
      limit:      'Unlimited (no key)',
      docsUrl:    'https://defillama.com/docs/api',
      sessionKey: VDS_SESSION_KEY,
      limitWarn:  null,
      limitMax:   null,
    },
    {
      id:         'blockchain_info',
      name:       'Blockchain.info — BTC On-Chain',
      badge:      'BCH',
      group:      'Crypto & On-Chain',
      desc:       'Bitcoin network metrics: Hash Rate · Active Addresses · TX Count. ' +
                  'Supplies security and adoption scores for BTC valuation. ' +
                  'No API key required — open data.',
      limit:      'Unlimited (no key)',
      docsUrl:    'https://www.blockchain.com/explorer/api',
      sessionKey: VDS_SESSION_KEY,
      limitWarn:  null,
      limitMax:   null,
    },
  ];

  for (const p of newProviders) {
    if (!window.KNOWN_PROVIDERS.find(existing => existing.id === p.id)) {
      window.KNOWN_PROVIDERS.push(p);
    }
  }

  if (typeof renderTopbarBadges === 'function') renderTopbarBadges();
})();

/* ═══════════════════════════════════════════════════════════════════
   ASSET CLASS DETECTION HELPER
   Used by valuation-data.js to route the correct pipelines.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * detectAssetClass(ticker)
 * Returns a best-guess asset class string for routing.
 * Priority: explicit exchange prefix → symbol pattern matching → 'equity' default
 *
 * @param {string} ticker
 * @returns {'equity'|'etf'|'crypto'|'bond'|'commodity'|'fx'|'reit'|'unknown'}
 */
window.detectAssetClass = function detectAssetClass(ticker) {
  if (!ticker) return 'unknown';
  const raw = ticker.toUpperCase();
  const sym = raw.replace(/.*:/, '');

  /* Crypto: known symbols in CoinGecko map */
  if (COINGECKO_ID_MAP[sym]) return 'crypto';

  /* ETF: check against known ETF list or mfprospectus flag */
  const knownETFs = new Set([
    'SPY','IVV','VOO','VTI','QQQ','QQQM','AGG','BND','TLT','LQD','HYG',
    'JNK','EFA','EEM','VEA','VWO','GLD','SLV','USO','DBO','IAU',
    'XLF','XLE','XLK','XLV','XLP','XLY','XLI','XLB','XLU','XLRE',
    'ARKK','ARKG','ARKW','ARKF','ARKQ','ARKX',
    'VNQ','VNQI','REM','REZ',   // REITs via ETF wrapper
  ]);
  if (knownETFs.has(sym)) return 'etf';

  /* REIT: common REIT tickers */
  const knownREITs = new Set([
    'O','NNN','VICI','LADR','STAG','IIPR','CCI','AMT','EQIX','PLD',
    'PSA','EXR','AVB','EQR','UDR','ESS','SPG','MAC','NRZ','AGNC','NLY',
  ]);
  if (knownREITs.has(sym)) return 'reit';

  /* Bond ETFs / actual bonds: ends in specific patterns */
  if (/^\d{4,}$/.test(sym)) return 'bond';   /* CUSIP-like */

  /* FX: 6-char forex pair */
  if (/^[A-Z]{6}$/.test(sym) || raw.includes('FX:')) return 'fx';

  /* Exchange prefix hints */
  if (raw.startsWith('FX:') || raw.startsWith('FOREX:')) return 'fx';
  if (raw.startsWith('CRYPTO:'))                           return 'crypto';
  if (raw.startsWith('BOND:'))                             return 'bond';

  return 'equity';  /* default */
};

console.info('[VDS] valuation-datasources.js loaded — 7 pipelines ready.');
