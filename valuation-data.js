/* ══════════════════════════════════════════════════════════════════
   FINTERM — valuation-data.js
   Unified data aggregation layer for the valuation engine.
   ──────────────────────────────────────────────────────────────────
   Implements Step 10 of the integration plan.
   Calls all data source pipelines (existing + new from
   valuation-datasources.js) and assembles them into a single
   structured object: window._valuationData[ticker]

   This object is the single source of truth consumed by:
     → valuation-normalise.js  (normalization engine)
     → valuation-system-a.js   (UARS scoring engine A)
     → valuation-system-b.js   (Master equation engine B)
     → valuation-health.js     (Health score engine)
     → valuation-fairvalue.js  (Fair value engine)
     → valuation-technical.js  (Technical signal engine)
     → valuation-analyst.js    (Analyst consensus engine)
     → valuation-widget.js     (Widget renderer)
   ══════════════════════════════════════════════════════════════════ */

'use strict';

/* ── Module constants ────────────────────────────────────────────── */
const VD_SESSION_KEY = 'vd_call_count';
const VD_TTL         = 15 * 60 * 1000;    // 15 min — matches FMP cache

/* ── Global store ────────────────────────────────────────────────── */
window._valuationData = window._valuationData || {};

/* ── Call counter ────────────────────────────────────────────────── */
function vdCount() {
  return parseInt(sessionStorage.getItem(VD_SESSION_KEY) || '0');
}
function vdBump() {
  const n = vdCount() + 1;
  sessionStorage.setItem(VD_SESSION_KEY, n);
  return n;
}

/* ── Cache helpers ───────────────────────────────────────────────── */
function vdCacheGet(sym) {
  try {
    const raw = sessionStorage.getItem('vd_full_' + sym);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > VD_TTL) return null;
    return data;
  } catch (_) { return null; }
}

function vdCacheSet(sym, data) {
  try {
    sessionStorage.setItem('vd_full_' + sym, JSON.stringify({ ts: Date.now(), data }));
  } catch (_) { /* quota */ }
}

/* ══════════════════════════════════════════════════════════════════
   COVERAGE METADATA BUILDER
   Tracks which variables are present, missing, or stale.
   ══════════════════════════════════════════════════════════════════ */

/**
 * buildCoverageMetadata(data)
 * Counts populated vs null fields in the top-level valuation data object.
 * Returns a coverage summary used by System B quality multipliers Q.
 */
function buildCoverageMetadata(data) {
  let present = 0, missing = 0, total = 0;
  const missingFields = [];

  const check = (value, label) => {
    total++;
    if (value !== null && value !== undefined && !isNaN(value)) {
      present++;
    } else {
      missing++;
      missingFields.push(label);
    }
  };

  /* Fundamental variables */
  const f = data.fundamentals || {};
  check(f.peRatio,        'PE Ratio');
  check(f.evToEbitda,     'EV/EBITDA');
  check(f.pbRatio,        'P/B Ratio');
  check(f.fcfYield,       'FCF Yield');
  check(f.divYield,       'Dividend Yield');
  check(f.revenueGrowth,  'Revenue Growth');
  check(f.ebitdaGrowth,   'EBITDA Growth');
  check(f.epsGrowth,      'EPS Growth');
  check(f.roe,            'ROE');
  check(f.roic,           'ROIC');
  check(f.operatingMargin,'Operating Margin');
  check(f.netDebtEbitda,  'Net Debt/EBITDA');
  check(f.debtToEquity,   'Debt/Equity');
  check(f.interestCoverage,'Interest Coverage');

  /* Market variables */
  const m = data.market || {};
  check(m.currentPrice,   'Current Price');
  check(m.mom1M,          '1M Momentum');
  check(m.mom12M,         '12M Momentum');
  check(m.vol30D,         'Volatility 30D');
  check(m.beta,           'Beta');
  check(m.maxDrawdown12M, 'Max Drawdown 12M');
  check(m.avgDollarVol30D,'Avg Dollar Volume');

  /* Risk variables */
  const r = data.riskMetrics || {};
  check(r.sharpe12M,      'Sharpe Ratio');
  check(r.sortino12M,     'Sortino Ratio');
  check(r.var99_10D,      'VaR 99% 10D');

  /* Liquidity variables */
  const l = data.liquidityMetrics || {};
  check(l.amihud,         'Amihud Illiquidity');
  check(l.rollSpread,     'Roll Spread (Bid-Ask Proxy)');

  /* Credit variables */
  const cr = data.creditQuality || {};
  check(cr.numericScore,  'Credit Score');
  check(cr.oasProxy,      'OAS Proxy');

  /* Analyst data */
  const a = data.analystData || {};
  check(a.consensusScore, 'Analyst Consensus');
  check(a.meanTarget,     'Mean Price Target');

  /* Macro variables */
  const mac = data.macroSensitivity || {};
  check(mac.vix,          'VIX');
  check(mac.riskFreeRate, 'Risk-Free Rate');

  return {
    present,
    missing,
    total,
    coverageRatio:  total > 0 ? +(present / total).toFixed(3) : 0,
    missingFields,
    /* Used in System B Q multiplier */
    missingRate:    total > 0 ? +(missing / total).toFixed(3) : 0,
    stalenessDays:  0,   /* fresh — just fetched */
    outlierFlagRate: 0,  /* set by normalisation engine */
  };
}

/* ══════════════════════════════════════════════════════════════════
   FUNDAMENTAL DATA FETCH
   Sources: FMP (primary), Finnhub (supplement)
   ══════════════════════════════════════════════════════════════════ */
async function _fetchFundamentals(sym) {
  if (typeof fmpFetch !== 'function') return {};

  try {
    const [ratios, metrics, growth, income, balance] = await Promise.allSettled([
      fmpFetch(`/v3/ratios-ttm/${sym}`,                sym),
      fmpFetch(`/v3/key-metrics-ttm/${sym}`,           sym),
      fmpFetch(`/v3/income-statement-growth/${sym}`,   sym, { limit: '1', period: 'annual' }),
      fmpFetch(`/v3/income-statement/${sym}`,          sym, { limit: '1', period: 'annual' }),
      fmpFetch(`/v3/balance-sheet-statement/${sym}`,   sym, { limit: '1', period: 'annual' }),
    ]);

    const r  = ratios.status   === 'fulfilled' ? (ratios.value?.[0]   || {}) : {};
    const km = metrics.status  === 'fulfilled' ? (metrics.value?.[0]  || {}) : {};
    const gr = growth.status   === 'fulfilled' ? (growth.value?.[0]   || {}) : {};
    const inc= income.status   === 'fulfilled' ? (income.value?.[0]   || {}) : {};
    const bal= balance.status  === 'fulfilled' ? (balance.value?.[0]  || {}) : {};

    return {
      /* Valuation multiples */
      peRatio:         r.peRatioTTM              ?? km.peRatioTTM          ?? null,
      evToEbitda:      r.enterpriseValueMultipleTTM ?? km.evToEbitdaTTM    ?? null,
      pbRatio:         r.priceToBookRatioTTM     ?? km.pbRatioTTM          ?? null,
      psRatio:         r.priceToSalesRatioTTM    ?? km.psRatioTTM          ?? null,
      fcfYield:        km.freeCashFlowYieldTTM   ?? r.freeCashFlowYieldTTM ?? null,
      divYield:        r.dividendYieldTTM        ?? km.dividendYieldTTM    ?? null,
      payoutRatio:     r.payoutRatioTTM          ?? null,

      /* Growth */
      revenueGrowth:   gr.growthRevenue          ?? null,
      ebitdaGrowth:    gr.growthEBITDA           ?? null,
      epsGrowth:       gr.growthEPS              ?? null,
      netIncomeGrowth: gr.growthNetIncome        ?? null,

      /* Profitability */
      roe:             r.returnOnEquityTTM       ?? km.roeTTM             ?? null,
      roic:            r.returnOnCapitalEmployedTTM ?? km.roicTTM         ?? null,
      roa:             r.returnOnAssetsTTM       ?? km.roaTTM             ?? null,
      operatingMargin: r.operatingProfitMarginTTM?? km.operatingProfitMarginTTM ?? null,
      netMargin:       r.netProfitMarginTTM      ?? null,
      grossMargin:     r.grossProfitMarginTTM    ?? null,

      /* Balance sheet health */
      netDebtEbitda:   km.netDebtToEBITDATTM     ?? null,
      debtToEquity:    r.debtEquityRatioTTM      ?? km.debtToEquityTTM    ?? null,
      interestCoverage:r.interestCoverageTTM     ?? km.interestCoverageTTM?? null,
      currentRatio:    r.currentRatioTTM         ?? km.currentRatioTTM    ?? null,

      /* Raw income/balance for Altman Z */
      _totalAssets:    bal.totalAssets           ?? km.totalAssetsTTM     ?? null,
      _totalLiabs:     bal.totalLiabilities      ?? null,
      _retainedEarnings:bal.retainedEarnings     ?? null,
      _workingCapital: (bal.totalCurrentAssets   || 0) - (bal.totalCurrentLiabilities || 0) || null,
      _ebit:           inc.ebit                  ?? inc.operatingIncome   ?? null,
      _revenue:        inc.revenue               ?? null,
      _marketCap:      km.marketCapTTM           ?? null,
    };
  } catch (e) {
    console.warn('[VD] _fetchFundamentals error:', e.message);
    return {};
  }
}

/* ══════════════════════════════════════════════════════════════════
   MARKET DATA FETCH
   Sources: Finnhub (current price, beta), technical.js (computed)
   ══════════════════════════════════════════════════════════════════ */
async function _fetchMarketData(sym) {
  const out = {
    currentPrice:    null,
    mom1M:           null,
    mom12M:          null,
    vol30D:          null,
    beta:            null,
    maxDrawdown12M:  null,
    avgDollarVol30D: null,
    relReturn12M:    null,
  };

  /* ── Finnhub quote for current price ── */
  try {
    if (typeof getFinnhubKey === 'function' && getFinnhubKey()) {
      const qUrl = `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${getFinnhubKey()}`;
      const q    = await fetch(qUrl).then(r => r.json());
      if (q?.c) out.currentPrice = q.c;
    }
  } catch (_) { /* continue */ }

  /* ── Momentum and volatility from technical.js cache ── */
  try {
    const cacheKey = `tc:${sym}:D`;
    const raw      = sessionStorage.getItem(cacheKey);
    if (raw) {
      const { d: candles } = JSON.parse(raw) || {};
      if (candles?.c?.length > 20) {
        const closes = candles.c;
        const n      = closes.length;
        const last   = closes[n - 1];

        /* 1M momentum: last 21 bars */
        if (n >= 22) {
          out.mom1M = (last - closes[n - 22]) / closes[n - 22];
        }
        /* 12M momentum: last 252 bars */
        if (n >= 253) {
          out.mom12M = (last - closes[n - 253]) / closes[n - 253];
        }
        /* 30D volatility: std of daily log returns over 30 bars */
        if (n >= 31) {
          const rets = [];
          for (let i = n - 30; i < n; i++) {
            rets.push(Math.log(closes[i] / closes[i - 1]));
          }
          const mean    = rets.reduce((a, b) => a + b, 0) / rets.length;
          const variance= rets.reduce((a, r) => a + Math.pow(r - mean, 2), 0) / rets.length;
          out.vol30D    = Math.sqrt(variance * 252);  /* annualised */
        }
        /* Max drawdown over 252 bars */
        const slice = closes.slice(Math.max(0, n - 252));
        let peak    = slice[0], maxDD = 0;
        for (const c of slice) {
          if (c > peak) peak = c;
          const dd = (peak - c) / peak;
          if (dd > maxDD) maxDD = dd;
        }
        out.maxDrawdown12M = -maxDD;  /* negative = loss */

        /* Avg dollar volume (needs volume) */
        if (candles.v?.length === n) {
          const vSlice = candles.v.slice(Math.max(0, n - 30));
          const cSlice = closes.slice(Math.max(0, n - 30));
          const dvols  = vSlice.map((v, i) => v * cSlice[i]);
          out.avgDollarVol30D = dvols.reduce((a, b) => a + b, 0) / dvols.length;
        }
      }
    }
  } catch (_) { /* continue */ }

  /* ── Beta from Finnhub /stock/metric ── */
  try {
    if (typeof getFinnhubKey === 'function' && getFinnhubKey()) {
      const mUrl  = `https://finnhub.io/api/v1/stock/metric?symbol=${sym}&metric=all&token=${getFinnhubKey()}`;
      const meta  = await fetch(mUrl).then(r => r.json());
      if (meta?.metric?.beta) out.beta = meta.metric.beta;
      /* Also extract 52W return */
      if (meta?.metric?.['52WeekPriceReturnDaily']) {
        out.relReturn12M = meta.metric['52WeekPriceReturnDaily'] / 100;
      }
    }
  } catch (_) { /* continue */ }

  return out;
}

/* ══════════════════════════════════════════════════════════════════
   RISK METRICS FETCH
   Sources: Computed from price series (Sharpe, Sortino, VaR)
   ══════════════════════════════════════════════════════════════════ */
function _computeRiskMetrics(sym) {
  const out = {
    sharpe12M:      null,
    sortino12M:     null,
    downsideVol12M: null,
    var99_10D:      null,
    es975_10D:      null,
    corrToBench:    null,
  };

  try {
    const raw = sessionStorage.getItem(`tc:${sym}:D`);
    if (!raw) return out;
    const { d: candles } = JSON.parse(raw) || {};
    if (!candles?.c?.length) return out;

    const closes = candles.c;
    const n      = closes.length;
    if (n < 30) return out;

    /* Daily log returns over 252 days */
    const slice   = closes.slice(Math.max(0, n - 253));
    const rets    = [];
    for (let i = 1; i < slice.length; i++) {
      rets.push(Math.log(slice[i] / slice[i - 1]));
    }

    /* Annualised return and vol */
    const mean    = rets.reduce((a, b) => a + b, 0) / rets.length;
    const annRet  = mean * 252;
    const variance= rets.reduce((a, r) => a + Math.pow(r - mean, 2), 0) / rets.length;
    const annVol  = Math.sqrt(variance * 252);

    /* Risk-free rate daily */
    const rfAnnual = (window._treasuryYields?.['10Y'] || 4.3) / 100;
    const rfDaily  = rfAnnual / 252;

    /* Sharpe ratio (annualised) */
    if (annVol > 0) {
      out.sharpe12M = (annRet - rfAnnual) / annVol;
    }

    /* Sortino ratio — uses downside deviation below 0 */
    const negRets      = rets.filter(r => r < rfDaily);
    const downVar      = negRets.length > 0
      ? negRets.reduce((a, r) => a + Math.pow(r - rfDaily, 2), 0) / rets.length
      : 0;
    const downsideVol  = Math.sqrt(downVar * 252);
    out.downsideVol12M = downsideVol;
    if (downsideVol > 0) {
      out.sortino12M = (annRet - rfAnnual) / downsideVol;
    }

    /* VaR 99% 10-day (historical simulation, scaled) */
    const sorted1D = [...rets].sort((a, b) => a - b);
    const varIdx   = Math.floor(0.01 * sorted1D.length);
    const var1D    = sorted1D[varIdx] || sorted1D[0];
    out.var99_10D  = var1D * Math.sqrt(10);  /* square-root-of-time scaling */

    /* ES 97.5%: average of worst 2.5% returns */
    const esIdx   = Math.floor(0.025 * sorted1D.length);
    const esTail  = sorted1D.slice(0, Math.max(1, esIdx));
    out.es975_10D = (esTail.reduce((a, b) => a + b, 0) / esTail.length) * Math.sqrt(10);

  } catch (_) { /* continue */ }

  return out;
}

/* ══════════════════════════════════════════════════════════════════
   MACRO SENSITIVITY FETCH
   Sources: FRED (VIX, yield curve, CPI)
   ══════════════════════════════════════════════════════════════════ */
async function _fetchMacroData() {
  const out = {
    vix:           null,
    yieldCurve10Y2Y:null,
    cpiLatest:      null,
    fedFunds:       null,
    riskFreeRate:   null,
    hyOAS:          null,
    igOAS:          null,
  };

  /* Try FRED for macro context */
  try {
    if (typeof fredGetCreditSpreads === 'function') {
      const spreads = await fredGetCreditSpreads();
      if (spreads) {
        out.riskFreeRate = spreads.riskFreeRate;
        out.hyOAS        = spreads.hyOAS;
        out.igOAS        = spreads.igOAS;
      }
    }
  } catch (_) { /* continue */ }

  /* VIX from sessionStorage (fred may have already cached it) */
  try {
    const vixCache = sessionStorage.getItem('VIXCLS' + JSON.stringify({ limit: '5' }));
    if (!vixCache) {
      /* Try cached treasury yields */
      if (window._treasuryYields?.['10Y']) {
        out.riskFreeRate = out.riskFreeRate ?? window._treasuryYields['10Y'];
      }
    } else {
      const vixData = JSON.parse(vixCache);
      if (vixData?.data?.[0]?.value) {
        out.vix = parseFloat(vixData.data[0].value);
      }
    }
  } catch (_) { /* continue */ }

  /* 10Y-2Y spread from treasury yields */
  if (window._treasuryYields) {
    const y10 = window._treasuryYields['10Y'];
    const y2  = window._treasuryYields['2Y'];
    if (y10 != null && y2 != null) {
      out.yieldCurve10Y2Y = y10 - y2;
    }
    out.riskFreeRate = out.riskFreeRate ?? y10;
  }

  return out;
}

/* ══════════════════════════════════════════════════════════════════
   ANALYST DATA FETCH
   Sources: Finnhub + FMP
   ══════════════════════════════════════════════════════════════════ */
async function _fetchAnalystData(sym) {
  const out = {
    consensusScore: null,
    buyPct:         null,
    holdPct:        null,
    sellPct:        null,
    meanTarget:     null,
    highTarget:     null,
    lowTarget:      null,
    numAnalysts:    null,
    lastUpdated:    null,
  };

  /* FMP analyst recommendations */
  try {
    if (typeof fmpFetch === 'function') {
      const recs = await fmpFetch(`/v3/analyst-stock-recommendations/${sym}`, sym);
      if (recs?.length) {
        const recent = recs.slice(0, 30);
        let buy = 0, hold = 0, sell = 0;
        recent.forEach(r => {
          buy  += (r.analystRatingsbuy  || 0) + (r.analystRatingsStrongBuy  || 0);
          hold += (r.analystRatingsHold || 0);
          sell += (r.analystRatingsSell || 0) + (r.analystRatingsStrongSell || 0);
        });
        const total = buy + hold + sell;
        if (total > 0) {
          out.buyPct         = buy  / total;
          out.holdPct        = hold / total;
          out.sellPct        = sell / total;
          out.numAnalysts    = total;
          /* Weighted consensus: Buy=5, Hold=3, Sell=1 → normalise to 1-5 */
          out.consensusScore = ((buy * 5 + hold * 3 + sell * 1) / total);
          out.lastUpdated    = recs[0]?.date || null;
        }
      }

      /* FMP price targets */
      const targets = await fmpFetch(`/v4/price-target-consensus`, sym, { symbol: sym });
      if (targets?.[0]) {
        out.meanTarget = targets[0].targetConsensus || targets[0].targetMean || null;
        out.highTarget = targets[0].targetHigh      || null;
        out.lowTarget  = targets[0].targetLow       || null;
      }
    }
  } catch (_) { /* continue */ }

  /* Supplement with Finnhub price targets */
  try {
    if (typeof getFinnhubKey === 'function' && getFinnhubKey() && !out.meanTarget) {
      const ptUrl = `https://finnhub.io/api/v1/stock/price-target?symbol=${sym}&token=${getFinnhubKey()}`;
      const pt    = await fetch(ptUrl).then(r => r.json());
      if (pt?.targetMean) {
        out.meanTarget  = pt.targetMean;
        out.highTarget  = pt.targetHigh ?? null;
        out.lowTarget   = pt.targetLow  ?? null;
        out.numAnalysts = out.numAnalysts ?? (pt.lastUpdated ? 1 : null);
      }
    }
  } catch (_) { /* continue */ }

  return out;
}

/* ══════════════════════════════════════════════════════════════════
   MAIN AGGREGATOR — assembleValuationData(ticker)
   ══════════════════════════════════════════════════════════════════ */

/**
 * assembleValuationData(ticker)
 * Master function that calls all pipelines in parallel and assembles
 * the complete _valuationData object for the given ticker.
 *
 * This is the Step 10 implementation: it combines all existing
 * terminal sources with the new sources from valuation-datasources.js.
 *
 * @param {string} ticker  — can be bare (AAPL) or prefixed (MIL:ENI)
 * @returns {Promise<ValuationDataObject>}
 */
window.assembleValuationData = async function assembleValuationData(ticker) {
  if (!ticker) return null;
  const sym        = ticker.replace(/.*:/, '').toUpperCase();
  const assetClass = typeof detectAssetClass === 'function'
    ? detectAssetClass(ticker) : 'equity';

  /* L1 session cache */
  const cached = vdCacheGet(sym);
  if (cached) {
    window._valuationData[sym] = cached;
    return cached;
  }

  vdBump();
  if (typeof showApiToast === 'function') {
    showApiToast(`↻ Valuation: loading data for ${sym}…`, 'info');
  }

  /* ── PHASE A: Run all data fetches in parallel ── */
  const fetches = [
    /* 0 */ _fetchFundamentals(sym),
    /* 1 */ _fetchMarketData(sym),
    /* 2 */ _fetchMacroData(),
    /* 3 */ _fetchAnalystData(sym),

    /* NEW SOURCES from valuation-datasources.js */
    /* 4 */ typeof getSyntheticCreditScore === 'function'
              ? getSyntheticCreditScore(sym)
              : Promise.resolve(null),
    /* 5 */ Promise.resolve(
              typeof getRollSpreadEstimate === 'function'
                ? getRollSpreadEstimate(sym)
                : null
            ),
    /* 6 */ (assetClass === 'etf')
              ? (typeof getETFStructuralMetrics === 'function'
                  ? getETFStructuralMetrics(sym) : Promise.resolve(null))
              : Promise.resolve(null),
    /* 7 */ (assetClass === 'crypto')
              ? Promise.allSettled([
                  typeof getDefiLlamaTVL      === 'function' ? getDefiLlamaTVL(sym)        : Promise.resolve(null),
                  typeof getBitcoinOnChain    === 'function' && sym === 'BTC'
                    ? getBitcoinOnChain()     : Promise.resolve(null),
                  typeof getCoinGeckoSupplyData === 'function' ? getCoinGeckoSupplyData(sym) : Promise.resolve(null),
                ])
              : Promise.resolve(null),
    /* 8 */ (assetClass === 'equity' || assetClass === 'reit')
              ? (typeof getPeerGroup === 'function'
                  ? getPeerGroup(sym) : Promise.resolve(null))
              : Promise.resolve(null),
  ];

  const results = await Promise.allSettled(fetches);

  const _get = (i) => results[i].status === 'fulfilled' ? results[i].value : null;

  const fundamentals  = _get(0) || {};
  const market        = _get(1) || {};
  const macro         = _get(2) || {};
  const analystRaw    = _get(3) || {};
  const creditRaw     = _get(4);
  const rollRaw       = _get(5);
  const etfStruct     = _get(6);
  const cryptoResults = _get(7);
  const peerRaw       = _get(8);

  /* Unpack crypto results */
  let cryptoTVL    = null, cryptoBTC = null, cryptoSupply = null;
  if (Array.isArray(cryptoResults)) {
    cryptoTVL    = cryptoResults[0].status === 'fulfilled' ? cryptoResults[0].value : null;
    cryptoBTC    = cryptoResults[1].status === 'fulfilled' ? cryptoResults[1].value : null;
    cryptoSupply = cryptoResults[2].status === 'fulfilled' ? cryptoResults[2].value : null;
  }

  /* ── PHASE B: Risk metrics (computed from price cache — synchronous) ── */
  const riskMetrics = _computeRiskMetrics(sym);

  /* ── PHASE C: Liquidity metrics ── */
  const liquidityMetrics = {
    avgDollarVol30D: market.avgDollarVol30D ?? null,
    rollSpread:      rollRaw?.rollSpread    ?? null,
    spreadBps:       rollRaw?.spreadBps    ?? null,
    liquidityScore:  rollRaw?.liquidityScore ?? null,
    /* Amihud illiquidity: |return| / dollar volume — computed inline */
    amihud: (() => {
      const vol30D = market.vol30D;
      const dvol   = market.avgDollarVol30D;
      if (!vol30D || !dvol || dvol === 0) return null;
      /* Approximate: daily vol / daily dollar volume × 10^6 */
      return +(Math.abs(vol30D / Math.sqrt(252)) / (dvol / 1e6)).toFixed(6);
    })(),
  };

  /* ── PHASE D: Credit quality block ── */
  const creditQuality = creditRaw ? {
    altmanZ:      creditRaw.altmanZ,
    creditTier:   creditRaw.creditTier,
    tierLabel:    creditRaw.tierLabel,
    numericScore: creditRaw.numericScore,
    oasProxy:     creditRaw.oasProxy,
    cdsProxy:     creditRaw.cdsProxy,
    confidence:   creditRaw.confidence,
    riskFreeRate: creditRaw.riskFreeRate,
    spreadEnvironment: creditRaw.spreadEnvironment,
  } : {
    altmanZ:      null,
    creditTier:   'unknown',
    tierLabel:    'N/A',
    numericScore: null,
    oasProxy:     null,
    cdsProxy:     null,
    confidence:   'low',
    riskFreeRate: macro.riskFreeRate ?? 4.3,
    spreadEnvironment: null,
  };

  /* ── PHASE E: Structural block (ETF or general) ── */
  const structural = etfStruct ? {
    isETF:           true,
    trackingError:   etfStruct.trackingError,
    trackingDiff:    etfStruct.trackingDiff,
    expenseRatio:    etfStruct.expenseRatio,
    trackingErrorBps:etfStruct.trackingErrorBps,
    expenseRatioBps: etfStruct.expenseRatioBps,
    structuralScore: etfStruct.structuralScore,
    dataSource:      etfStruct.dataSource,
    benchmarkUsed:   etfStruct.benchmarkUsed,
  } : {
    isETF:           false,
    trackingError:   null,
    trackingDiff:    null,
    expenseRatio:    null,
    structuralScore: null,
  };

  /* ── PHASE F: Crypto on-chain block ── */
  const cryptoOnChain = assetClass === 'crypto' ? {
    tvlUSD:           cryptoTVL?.tvlUSD            ?? null,
    tvlGrowth30D:     cryptoTVL?.tvlGrowth30D      ?? null,
    tvlRank:          cryptoTVL?.rank              ?? null,
    tvlDataAvailable: cryptoTVL?.dataAvailable     ?? false,

    hashRateTrend:    cryptoBTC?.hashRateTrend     ?? null,
    activeAddrGrowth: cryptoBTC?.activeAddrGrowth30D ?? null,
    txCountGrowth:    cryptoBTC?.txCountGrowth30D  ?? null,
    securityScore:    cryptoBTC?.securityScore     ?? null,
    adoptionScore:    cryptoBTC?.adoptionScore     ?? null,

    supplyInflation:  cryptoSupply?.inflationRate  ?? null,
    dilutionScore:    cryptoSupply?.dilutionScore  ?? null,
    supplyUtil:       cryptoSupply?.supplyUtilisation ?? null,
    circulatingSupply:cryptoSupply?.circulatingSupply ?? null,
  } : null;

  /* ── PHASE G: Peer / Relative Attractiveness block ── */
  const peerRelativeAttractiveness = peerRaw ? {
    raScore:         peerRaw.raScore,
    peerCount:       peerRaw.peerCount,
    peers:           peerRaw.peers,
    peerMedians:     peerRaw.peerMedians,
    percentileScores:peerRaw.percentileScores,
    targetMetrics:   peerRaw.targetMetrics,
  } : {
    raScore:         50,    /* neutral default when peers unavailable */
    peerCount:       0,
    peers:           [],
    peerMedians:     {},
    percentileScores:{},
    targetMetrics:   {},
  };

  /* ── PHASE H: Assemble complete object ── */
  const valuationData = {
    /* Identity */
    ticker:       sym,
    assetClass,
    timestamp:    new Date().toISOString(),

    /* Core data blocks */
    fundamentals,
    market,
    riskMetrics,
    liquidityMetrics,
    macroSensitivity: macro,
    analystData:      analystRaw,
    creditQuality,
    structural,
    cryptoOnChain,
    peerRelativeAttractiveness,

    /* Convenience flags */
    hasCreditData:    creditRaw !== null,
    hasETFData:       etfStruct !== null,
    hasCryptoData:    assetClass === 'crypto',
    hasPeerData:      peerRaw !== null,
  };

  /* ── PHASE I: Build coverage metadata ── */
  valuationData.coverage = buildCoverageMetadata(valuationData);

  /* ── PHASE J: Store and return ── */
  vdCacheSet(sym, valuationData);
  window._valuationData[sym] = valuationData;

  const coveragePct = Math.round(valuationData.coverage.coverageRatio * 100);
  if (typeof showApiToast === 'function') {
    showApiToast(
      `✓ Valuation data: ${sym} — ${coveragePct}% coverage `
      + `(${valuationData.coverage.present}/${valuationData.coverage.total} variables)`,
      coveragePct >= 70 ? 'ok' : 'warn'
    );
  }

  return valuationData;
};

/* ══════════════════════════════════════════════════════════════════
   CONVENIENCE GETTER
   Returns cached data synchronously — used by widget renderer
   when data was already loaded.
   ══════════════════════════════════════════════════════════════════ */
window.getValuationData = function getValuationData(ticker) {
  const sym = ticker?.replace(/.*:/, '').toUpperCase();
  return sym ? (window._valuationData[sym] || null) : null;
};

/* ══════════════════════════════════════════════════════════════════
   AUTO-HOOK into changeTicker
   Triggers data assembly whenever the terminal ticker changes.
   Uses the same hook pattern as openfigi.js and smartsearch.js.
   ══════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  /* Patch changeTicker if available */
  const _origCT = typeof changeTicker === 'function' ? changeTicker : null;
  if (_origCT && !_origCT._vd_patched) {
    window.changeTicker = function () {
      _origCT.apply(this, arguments);
      const raw = document.getElementById('tickerInput')?.value?.trim();
      if (raw) {
        /* Small delay — let other modules initialise first */
        setTimeout(() => assembleValuationData(raw), 800);
      }
    };
    window.changeTicker._vd_patched = true;
  }

  /* Pre-load for initial ticker */
  setTimeout(() => {
    const t = typeof currentTicker !== 'undefined' ? currentTicker : 'AAPL';
    if (t) assembleValuationData(t);
  }, 3000);
});

console.info('[VD] valuation-data.js loaded — unified data aggregator ready.');
