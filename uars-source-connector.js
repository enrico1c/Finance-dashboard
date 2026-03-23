/* ══════════════════════════════════════════════════════════════════
   FINTERM — uars-source-connector.js
   Phase 1: Source Connector
   ──────────────────────────────────────────────────────────────────
   Wires every terminal data source to the UARSEngine via
   engine.connectSource(). Maps all terminal field paths to
   the exact VAR_META variable IDs expected by uars_engine.js.

   Sources connected:
     1.1  finterm_core       — valuation-data.js + valuation-missing-sources.js
     1.2  finterm_commodity  — CME term structure + USDA/EIA inventory z-scores
     1.3  finterm_crypto     — blockchain.info + CoinGecko + DefiLlama
     1.4  finterm_etf        — valuation-datasources.js Pipeline 3
     1.5  Penalty connector  — amihud → P_liq; VaR/ES → P_tail; coverage → P_dq
     1.6  Regime connector   — detectMacroRegime() → engine.setRegime()

   Exports (window-global):
     window.uarsEngine          — singleton UARSEngine instance
     window.uarsConnectSources  — wires all sources to the engine
     window.uarsBuildRawData    — assembles rawData map for a ticker
     window.uarsBuildPenalties  — builds { liq, tail, dq, struct } object
     window.uarsSyncRegime      — detects regime and sets it on the engine
     window.uarsDetectAssetClass — maps detectAssetClass() → ASSET_CLASS_CONFIGS key

   Load order (after all existing scripts):
     uars_engine.js
     valuation-data.js
     valuation-missing-sources.js
     valuation-datasources.js
     ← this file ←
     uars-peer-builder.js
     uars-widget.js
   ══════════════════════════════════════════════════════════════════ */

'use strict';

/* ── Guard: wait for UARSEngine to be available ──────────────────── */
(function _uarsConnectorInit() {

  /* ══════════════════════════════════════════════════════════════════
     SINGLETON ENGINE INSTANCE
     All modules share one engine so the peer cache and score cache
     persist across calls within the same session.
  ══════════════════════════════════════════════════════════════════ */
  if (!window.UARS || !window.UARS.UARSEngine) {
    console.error('[UARS Connector] uars_engine.js must be loaded before this file.');
    return;
  }

  const engine = new window.UARS.UARSEngine();
  window.uarsEngine = engine;


  /* ══════════════════════════════════════════════════════════════════
     INTERNAL HELPERS
  ══════════════════════════════════════════════════════════════════ */

  /** Safe getter: returns null instead of undefined/NaN */
  function _g(obj, ...path) {
    let cur = obj;
    for (const key of path) {
      if (cur === null || cur === undefined) return null;
      cur = cur[key];
    }
    if (cur === undefined || (typeof cur === 'number' && isNaN(cur))) return null;
    return cur;
  }

  /** Convert a decimal fraction (0.18) to percentage (18.0).
      valuation-data.js stores growth/margin as raw decimals from FMP. */
  function _pct(v) {
    if (v === null || v === undefined || isNaN(v)) return null;
    /* Already looks like a percentage (>1 or < -1 in meaningful range) */
    if (Math.abs(v) > 1) return v;
    return v * 100;
  }

  /** Convert a percentage to raw fraction where UARS expects it in % form.
      uars_engine.js VAR_META comments say "% revenue growth YOY" so we
      keep values as plain percentages (e.g. 15.2 for 15.2%). */
  function _toPercent(v) {
    if (v === null || v === undefined || isNaN(v)) return null;
    /* If already looks like a whole-number percentage, keep it */
    if (Math.abs(v) > 1) return v;
    return v * 100;
  }

  /** Clamp to finite number or return null */
  function _finite(v) {
    if (v === null || v === undefined || !isFinite(v)) return null;
    return v;
  }


  /* ══════════════════════════════════════════════════════════════════
     1.1  SOURCE: finterm_core
          Maps window._valuationData[sym] fields → VAR_META IDs.
          Covers: Fundamental, Market, Risk, Credit, Macro, Factor.
  ══════════════════════════════════════════════════════════════════ */
  engine.connectSource('finterm_core', async function (ticker) {
    const sym = ticker.replace(/.*:/, '').toUpperCase();

    /* Ensure data is assembled before we read it.
       assembleValuationData is idempotent and cached. */
    if (typeof assembleValuationData === 'function') {
      await assembleValuationData(ticker);
    }
    /* Enrich with missing-sources betas/penalties if available */
    if (typeof enrichValuationData === 'function') {
      await enrichValuationData(ticker);
    }

    const vd = window._valuationData?.[sym];
    if (!vd) return {};

    const f  = vd.fundamentals        || {};
    const m  = vd.market              || {};
    const r  = vd.riskMetrics         || {};
    const l  = vd.liquidityMetrics    || {};
    const cr = vd.creditQuality       || {};
    const ma = vd.macroSensitivity    || {};
    const fb = vd.factorBetas         || {};

    /* ── FUNDAMENTAL VARIABLES ──────────────────────────────────── */
    const raw = {

      /* Growth */
      FUND_REV_GROWTH_YOY:       _finite(_toPercent(_g(f, 'revenueGrowth'))),
      FUND_EBITDA_GROWTH_YOY:    _finite(_toPercent(_g(f, 'ebitdaGrowth'))),
      FUND_EPS_GROWTH_YOY:       _finite(_toPercent(_g(f, 'epsGrowth'))),

      /* Profitability */
      FUND_ROE_TTM:              _finite(_toPercent(_g(f, 'roe'))),
      FUND_ROIC_TTM:             _finite(_toPercent(_g(f, 'roic'))),
      FUND_OPER_MARGIN_TTM:      _finite(_toPercent(_g(f, 'operatingMargin'))),

      /* Valuation */
      FUND_FCF_YIELD_TTM:        _finite(_toPercent(_g(f, 'fcfYield'))),
      FUND_DIV_YIELD_TTM:        _finite(_toPercent(_g(f, 'divYield'))),
      FUND_PAYOUT_RATIO_TTM:     _finite(_toPercent(_g(f, 'payoutRatio'))),

      /* Balance sheet / leverage */
      FUND_NET_DEBT_EBITDA_TTM:  _finite(_g(f, 'netDebtEbitda')),
      FUND_DEBT_TO_EQUITY_TTM:   _finite(_g(f, 'debtToEquity')),
      FUND_INT_COVERAGE_TTM:     _finite(_g(f, 'interestCoverage')),

      /* ── MARKET VARIABLES ──────────────────────────────────────── */

      /* Momentum — stored as raw fractions in valuation-data.js,
         convert to percentage for the engine (VAR_META comment: "% total return") */
      MKT_MOM_1M:                _finite(_toPercent(_g(m, 'mom1M'))),
      MKT_MOM_12M:               _finite(_toPercent(_g(m, 'mom12M'))),

      /* Volatility — stored as annualised decimal, convert to % */
      MKT_VOL_30D:               _finite(_toPercent(_g(m, 'vol30D'))),

      /* Beta — dimensionless */
      MKT_BETA_TO_BENCH_250D:    _finite(_g(m, 'beta')),

      /* Liquidity — dollar volume stays in dollars */
      MKT_AVG_DOLLAR_VOL_30D:    _finite(_g(m, 'avgDollarVol30D')),

      /* Drawdown — stored as negative decimal e.g. -0.23, convert to % (stays negative) */
      MKT_MAX_DRAWDOWN_12M:      _finite(_toPercent(_g(m, 'maxDrawdown12M'))),

      /* Relative return vs benchmark — decimal to % */
      MKT_REL_RETURN_12M:        _finite(_toPercent(_g(m, 'relReturn12M'))),

      /* ── RISK VARIABLES ────────────────────────────────────────── */

      RISK_SHARPE_12M:           _finite(_g(r, 'sharpe12M')),
      RISK_SORTINO_12M:          _finite(_g(r, 'sortino12M')),
      RISK_DOWNSIDE_VOL_12M:     _finite(_toPercent(_g(r, 'downsideVol12M'))),

      /* VaR / ES — stored as negative decimals, engine expects positive % loss
         (VAR_META: "% VaR 99% 10-day (positive = loss)")
         Negate and convert to percent. */
      RISK_VAR_99_10D:           (() => {
        const v = _g(r, 'var99_10D');
        if (v === null) return null;
        return _finite(Math.abs(_toPercent(v)));
      })(),
      RISK_ES_97_5_10D:          (() => {
        const v = _g(r, 'es975_10D');
        if (v === null) return null;
        return _finite(Math.abs(_toPercent(v)));
      })(),

      /* Correlation — stored as -1 to +1, keep as-is (dimensionless) */
      RISK_CORR_TO_BENCH_250D:   _finite(_g(ma, 'corrToBench')),

      /* ── CREDIT VARIABLES ──────────────────────────────────────── */

      /* Numeric credit score [0-100] — use engine's own creditToNumeric()
         if we have an agency rating string, otherwise use synthetic score */
      CRED_RATING_NOTCH_NUM: (() => {
        /* Prefer agency rating string → engine's own creditToNumeric() */
        const agencyStr = _g(cr, 'agencyRating') || _g(cr, 'tierLabel');
        if (agencyStr && typeof window.UARS?.creditToNumeric === 'function') {
          const n = window.UARS.creditToNumeric(agencyStr);
          if (n !== null && n > 0) return n;
        }
        /* Also try valuation-missing-sources.js notch converter */
        if (typeof creditRatingToNumeric === 'function') {
          const n2 = creditRatingToNumeric(agencyStr);
          if (n2 !== null) return n2;
        }
        /* Fall back to Altman-Z-derived synthetic numeric score */
        return _finite(_g(cr, 'numericScore'));
      })(),

      /* OAS proxy — stored in bps from FRED BAML spreads */
      CRED_SPREAD_OAS_BPS:        _finite(_g(cr, 'oasProxy')),

      /* Debt service capacity — derive from interest coverage (max 100) */
      CRED_DEBT_SERVICE_CAPACITY_SCORE: (() => {
        const ic = _g(f, 'interestCoverage');
        if (ic === null) return null;
        /* Scale: IC=1→10, IC=5→50, IC=10→75, IC=20→100 */
        return _finite(Math.min(100, Math.max(0, Math.round(ic * 5))));
      })(),

      /* ── MACRO / SENSITIVITY VARIABLES ────────────────────────── */

      MACRO_INFL_BETA_3Y:         _finite(_g(ma, 'inflBeta3Y')),
      MACRO_RATE_BETA_3Y:         _finite(_g(ma, 'rateBeta3Y')),
      MACRO_GDP_BETA_5Y:          _finite(_g(ma, 'gdpBeta5Y')),

      /* Recession vulnerability [0-100], engine dir=down so lower = better */
      MACRO_RECESSION_VULN_SCORE: _finite(_g(ma, 'recessionVulnScore')),

      /* Policy sensitivity — not computed yet, default null */
      MACRO_POLICY_SENS_SCORE:    null,

      /* ── FACTOR BETAS ────────────────────────────────────────── */

      FACTOR_VALUE_BETA:          _finite(_g(fb, 'value')),
      FACTOR_QUALITY_BETA:        _finite(_g(fb, 'quality')),
      FACTOR_MOMENTUM_BETA:       _finite(_g(fb, 'momentum')),
      FACTOR_LOWVOL_BETA:         _finite(_g(fb, 'lowVol')),
      FACTOR_SIZE_BETA:           _finite(_g(fb, 'size')),
      FACTOR_CARRY_BETA: (() => {
        /* FX carry score is 0-100 from getFXCarry(); normalise to beta-like [-1,+1] */
        const carryScore = _g(vd, 'fxMetrics', 'carry', 'carryScore');
        if (carryScore === null) return null;
        return _finite((carryScore - 50) / 50);
      })(),
      FACTOR_YIELD_BETA:           null,   /* not yet computed — engine will default to 50 */
      FACTOR_GROWTH_BETA:          _finite(_g(fb, 'value')),   /* reuse value tilt as closest proxy */
    };

    /* ── Strip null values — engine handles missing vars as 50 ─── */
    return Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== null));
  });


  /* ══════════════════════════════════════════════════════════════════
     1.2  SOURCE: finterm_commodity
          Maps valuation-missing-sources.js commodity outputs → VAR_META.
  ══════════════════════════════════════════════════════════════════ */
  engine.connectSource('finterm_commodity', async function (ticker) {
    const sym = ticker.replace(/.*:/, '').toUpperCase();
    const vd  = window._valuationData?.[sym];
    if (!vd) return {};

    /* Only run for commodity asset class */
    if (vd.assetClass !== 'commodity') return {};

    const cm = vd.commodityMetrics || {};
    const ts = cm.termStructure   || {};
    const st = cm.stocksToUse     || {};
    const ei = cm.eiaInventory    || {};
    const mo = cm.momentum        || {};

    const raw = {

      /* Term structure slope (backwardation positive = attractive) */
      SPEC_COMM_TERM_STRUCTURE_SLOPE: (() => {
        const slope = _finite(_g(ts, 'slope1M'));
        if (slope !== null) return slope;
        return null;
      })(),

      /* Roll yield 3M (positive = backwardation = positive carry) — as decimal */
      SPEC_COMM_ROLL_YIELD_3M: _finite(_g(ts, 'roll3M')),

      /* Inventory z-score — lower = scarce = bullish.
         Prefer USDA/EIA z-score; fall back to termStructureScore inverted. */
      SPEC_COMM_INVENTORY_Z: (() => {
        const z = _finite(_g(st, 'zScore')) ?? _finite(_g(ei, 'zScore'));
        return z;
      })(),

      /* Supply-demand balance score [0-100] — higher = tighter = more bullish.
         Derived from USDA inventoryScore (already 0-100, lower STU = scarce = higher score). */
      SPEC_COMM_SUPPLY_DEMAND_BAL_SCORE: (() => {
        const invScore = _finite(_g(st, 'inventoryScore')) ?? _finite(_g(ei, 'inventoryScore'));
        return invScore;
      })(),

      /* Open interest — use average dollar volume as proxy if OI not available */
      SPEC_FUT_OPEN_INTEREST: (() => {
        const oi = _finite(_g(vd, 'market', 'avgDollarVol30D'));
        return oi;
      })(),

      /* Commodity-specific momentum — from Stooq OHLCV */
      MKT_MOM_1M:  _finite(_toPercent(_g(mo, 'mom1M'))),
      MKT_MOM_12M: _finite(_toPercent(_g(mo, 'mom12M'))),
      MKT_VOL_30D: _finite(_toPercent(_g(mo, 'vol30D'))),
    };

    return Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== null));
  });


  /* ══════════════════════════════════════════════════════════════════
     1.3  SOURCE: finterm_crypto
          Maps blockchain.info + CoinGecko + DefiLlama → VAR_META.
  ══════════════════════════════════════════════════════════════════ */
  engine.connectSource('finterm_crypto', async function (ticker) {
    const sym = ticker.replace(/.*:/, '').toUpperCase();
    const vd  = window._valuationData?.[sym];
    if (!vd) return {};

    if (vd.assetClass !== 'crypto') return {};

    const oc = vd.cryptoOnChain || {};

    /* Also read from the global on-chain store that getCoinGeckoSupplyData
       and getBitcoinOnChain write to. */
    const cgStore = window._cryptoOnChain?.[sym] || {};

    const raw = {

      /* Adoption metrics — % growth values */
      SPEC_CRYPTO_ACTIVE_ADDR_GROWTH_30D: (() => {
        const v = _finite(_g(oc, 'activeAddrGrowth')) ?? _finite(_g(cgStore, 'activeAddrGrowth30D'));
        return v !== null ? _toPercent(v) : null;
      })(),

      SPEC_CRYPTO_TX_COUNT_GROWTH_30D: (() => {
        const v = _finite(_g(oc, 'txCountGrowth')) ?? _finite(_g(cgStore, 'txCountGrowth30D'));
        return v !== null ? _toPercent(v) : null;
      })(),

      /* Transfer volume — raw USD value (large number, normalised by Operator B) */
      SPEC_CRYPTO_TRANSFER_VOL_USD_30D: (() => {
        /* Try CoinGecko price × volume as 30D transfer vol proxy */
        const vol = _finite(_g(cgStore, 'priceChange30D'))
          ?? _finite(_g(vd, 'market', 'avgDollarVol30D'));
        return vol;
      })(),

      /* NVT ratio — lower is better (VAR_META dir: 'down').
         worldmonitor.js CoinGecko endpoint stores market_cap / tx_volume.
         Read from _cryptoOnChain store if available. */
      SPEC_CRYPTO_NVT_90D: (() => {
        /* Synthetic NVT: current price ratio proxy — if market cap / transfer vol available */
        const nvt = _finite(_g(cgStore, 'nvt90D'));
        if (nvt !== null) return nvt;
        /* Fallback: not available from current sources — engine defaults to 50 */
        return null;
      })(),

      /* Hash rate trend — as decimal growth rate over 90D */
      SPEC_CRYPTO_HASHRATE_TREND_90D: (() => {
        const ht = _finite(_g(oc, 'hashRateTrend'));
        return ht !== null ? _toPercent(ht) : null;
      })(),

      /* Supply inflation rate — annual % token issuance */
      SPEC_CRYPTO_SUPPLY_INFLATION_RATE: (() => {
        const infl = _finite(_g(oc, 'supplyInflation'));
        if (infl !== null) return _toPercent(infl);
        const inflAnnual = _finite(_g(cgStore, 'inflationRateAnnualised'));
        return inflAnnual !== null ? _toPercent(inflAnnual) : null;
      })(),

      /* Stablecoin depeg frequency — only relevant for stablecoins,
         not available from current sources; engine defaults to 50. */
      SPEC_CRYPTO_STABLECOIN_DEPEG_FREQ: null,

      /* Shared market vars (same source as equity but for crypto context) */
      MKT_MOM_1M:           _finite(_toPercent(_g(vd, 'market', 'mom1M'))),
      MKT_MOM_12M:          _finite(_toPercent(_g(vd, 'market', 'mom12M'))),
      MKT_VOL_30D:          _finite(_toPercent(_g(vd, 'market', 'vol30D'))),
      MKT_AVG_DOLLAR_VOL_30D: _finite(_g(vd, 'market', 'avgDollarVol30D')),
      RISK_ES_97_5_10D:     (() => {
        const v = _g(vd, 'riskMetrics', 'es975_10D');
        return v !== null ? _finite(Math.abs(_toPercent(v))) : null;
      })(),
    };

    return Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== null));
  });


  /* ══════════════════════════════════════════════════════════════════
     1.4  SOURCE: finterm_etf
          Maps valuation-datasources.js Pipeline 3 → VAR_META.
  ══════════════════════════════════════════════════════════════════ */
  engine.connectSource('finterm_etf', async function (ticker) {
    const sym = ticker.replace(/.*:/, '').toUpperCase();
    const vd  = window._valuationData?.[sym];
    if (!vd) return {};

    if (vd.assetClass !== 'etf') return {};

    const s = vd.structural || {};
    const m = vd.market     || {};

    const raw = {

      /* Tracking error — annualised decimal, engine VAR_META expects % */
      SPEC_ETF_TRACKING_ERROR_1Y: (() => {
        const te = _finite(_g(s, 'trackingError'));
        return te !== null ? _toPercent(te) : null;
      })(),

      /* Tracking difference — annualised decimal to % */
      SPEC_ETF_TRACKING_DIFF_1Y: (() => {
        const td = _finite(_g(s, 'trackingDiff'));
        return td !== null ? _toPercent(td) : null;
      })(),

      /* Expense ratio — decimal to % */
      SPEC_ETF_EXPENSE_RATIO: (() => {
        const er = _finite(_g(s, 'expenseRatio'));
        return er !== null ? _toPercent(er) : null;
      })(),

      /* AUM — use market cap from Finnhub profile as proxy.
         fhGetProfile() returns mktCap in USD. */
      SPEC_ETF_AUM: (() => {
        /* Try fmpLiveCache first, then Finnhub profile cache */
        const fmpLive = typeof fmpGetLive === 'function' ? fmpGetLive(sym) : null;
        /* No direct AUM from current sources — fall back to avgDollarVol as proxy */
        const dvol = _finite(_g(m, 'avgDollarVol30D'));
        return dvol;
      })(),

      /* Top-10 holdings concentration — not available from current sources.
         Default: 0.30 (neutral 30% concentration assumption). */
      SPEC_ETF_HOLDINGS_CONC_TOP10: 30.0,

      /* Shared market vars */
      MKT_MOM_1M:             _finite(_toPercent(_g(vd, 'market', 'mom1M'))),
      MKT_MOM_12M:            _finite(_toPercent(_g(vd, 'market', 'mom12M'))),
      MKT_AVG_DOLLAR_VOL_30D: _finite(_g(m, 'avgDollarVol30D')),
    };

    return Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== null));
  });


  /* ══════════════════════════════════════════════════════════════════
     1.5  PENALTY CONNECTOR
          Reads terminal risk/liquidity data and computes all four
          penalty multipliers using uars_engine.js helpers.
  ══════════════════════════════════════════════════════════════════ */

  /**
   * uarsBuildPenalties(ticker)
   * Returns { liq, tail, dq, struct } each ∈ [0.6, 1.0].
   * Uses window._valuationData[sym] as source of truth.
   *
   * @param {string} ticker
   * @returns {{ liq: number, tail: number, dq: number, struct: number }}
   */
  window.uarsBuildPenalties = function uarsBuildPenalties(ticker) {
    const sym = ticker.replace(/.*:/, '').toUpperCase();
    const vd  = window._valuationData?.[sym];

    /* Safe fallback — all penalties = 1.0 (no haircut) */
    if (!vd) return { liq: 1.0, tail: 1.0, dq: 1.0, struct: 1.0 };

    const l  = vd.liquidityMetrics || {};
    const r  = vd.riskMetrics      || {};
    const m  = vd.market           || {};
    const s  = vd.structural       || {};
    const cov = vd.coverage        || {};

    /* ── P_liq: from Amihud illiquidity ratio ── */
    /* engine.computePenaltyLiq(amihudRatio, amihudLo, amihudHi)
       Thresholds derived from empirical observation:
       - amihudLo = 0       (large-cap liquid: S&P 500 median ≈ 1e-8)
       - amihudHi = 1e-5    (small-cap illiquid threshold)
       valuation-data.js computes Amihud as |vol/sqrt(252)| / (dvol/1e6) */
    const amihud = _finite(_g(l, 'amihud')) ?? 0;
    const P_liq  = window.UARS.computePenaltyLiq(amihud, 0, 1e-5);

    /* ── P_tail: from VaR 99% 10D + ES 97.5% 10D + Max Drawdown ── */
    /* engine expects values as % positives (losses expressed as positives) */
    const var99 = (() => {
      const v = _g(r, 'var99_10D');
      return v !== null ? Math.abs(_toPercent(v) ?? 0) : 0;
    })();
    const es97  = (() => {
      const v = _g(r, 'es975_10D');
      return v !== null ? Math.abs(_toPercent(v) ?? 0) : 0;
    })();
    const maxDD = (() => {
      const v = _g(m, 'maxDrawdown12M');
      return v !== null ? Math.abs(_toPercent(v) ?? 0) : 0;
    })();
    /* Pass as negative drawdown (engine multiplies by 0.1 and adds to tail score) */
    const P_tail = window.UARS.computePenaltyTail(var99, es97, -maxDD);

    /* ── P_dq: from coverage metadata ── */
    /* valuation-data.js builds coverage.missingRate and coverage.stalenessDays.
       engine expects: missingPct [0,1], stalePct [0,1], lowCoveragePct [0,1] */
    const missingPct  = _finite(_g(cov, 'missingRate'))    ?? 0;
    const stalenessPct = (() => {
      /* stalenessDays is 0 for fresh data; scale: 0 days=0%, 30 days=50%, 90 days=100% */
      const days = _finite(_g(cov, 'stalenessDays')) ?? 0;
      return Math.min(1, days / 90);
    })();
    const lowCovPct   = _finite(_g(cov, 'outlierFlagRate')) ?? 0;
    const P_dq        = window.UARS.computePenaltyDQ(missingPct, stalenessPct, lowCovPct);

    /* ── P_struct: ETF tracking error or CFD provider risk ── */
    const isETF           = _g(s, 'isETF') === true;
    const trackingError   = _finite(_g(s, 'trackingError')) ?? 0;   /* raw decimal e.g. 0.003 */
    /* engine.computePenaltyStruct expects trackingError as decimal (0.003 = 30bps) */
    const P_struct        = window.UARS.computePenaltyStruct({
      isETF,
      trackingError,
      isCFD:          false,
      cfdProviderRisk: 0,
    });

    return {
      liq:    +P_liq.toFixed(4),
      tail:   +P_tail.toFixed(4),
      dq:     +P_dq.toFixed(4),
      struct: +P_struct.toFixed(4),
    };
  };


  /* ══════════════════════════════════════════════════════════════════
     1.6  REGIME CONNECTOR
          Maps detectMacroRegime() output → engine.setRegime().
  ══════════════════════════════════════════════════════════════════ */

  /**
   * REGIME VOCABULARY BRIDGE
   * detectMacroRegime() (valuation-missing-sources.js) → UARSEngine regime keys
   * Valid UARSEngine regimes: 'expansion' | 'inflation' | 'latecycle' | 'crisis' | 'creditstress'
   */
  const REGIME_MAP = {
    'expansion':      'expansion',
    'low_volatility': 'expansion',
    'high_inflation': 'inflation',
    'rising_rates':   'inflation',
    'disinflation':   'latecycle',
    'late_cycle':     'latecycle',
    'recession_risk': 'latecycle',
    'crisis':         'crisis',
    'high_volatility':'crisis',
    'credit_stress':  'creditstress',
    'neutral':        'expansion',
  };

  /**
   * uarsSyncRegime()
   * Detects current macro regime and applies it to the engine.
   * Invalidates score cache if regime changed.
   *
   * @returns {string}  the mapped UARSEngine regime key
   */
  window.uarsSyncRegime = function uarsSyncRegime() {
    if (typeof detectMacroRegime !== 'function') {
      engine.setRegime('expansion');
      return 'expansion';
    }

    const detected = detectMacroRegime();
    const rawId    = detected?.regime || 'neutral';
    const mapped   = REGIME_MAP[rawId] || 'expansion';

    /* Only update and clear cache if regime actually changed */
    if (engine.regime !== mapped) {
      try {
        engine.setRegime(mapped);
      } catch (_) {
        engine.regime = mapped;
        engine._scoreCache = {};
      }
    }

    return mapped;
  };


  /* ══════════════════════════════════════════════════════════════════
     ASSET CLASS MAPPER
     detectAssetClass() (valuation-datasources.js) → ASSET_CLASS_CONFIGS key
  ══════════════════════════════════════════════════════════════════ */

  /**
   * uarsDetectAssetClass(ticker)
   * Returns the ASSET_CLASS_CONFIGS key for the given ticker.
   *
   * @param {string} ticker
   * @returns {string}  key in UARS.ASSET_CLASS_CONFIGS
   */
  window.uarsDetectAssetClass = function uarsDetectAssetClass(ticker) {
    const raw = ticker.toUpperCase();
    const sym = raw.replace(/.*:/, '');

    /* If valuation-data.js has already classified this asset, use that */
    const vd  = window._valuationData?.[sym];
    const vdClass = vd?.assetClass;

    /* Map valuation-data.js class strings → ASSET_CLASS_CONFIGS keys */
    const CLASS_MAP = {
      equity:    'equities',
      reit:      'reits',
      etf:       'etfs',
      crypto:    'crypto',
      commodity: 'commodities',
      fx:        'fx',
    };

    if (vdClass && CLASS_MAP[vdClass]) return CLASS_MAP[vdClass];

    /* Try detectAssetClass() from valuation-datasources.js */
    if (typeof detectAssetClass === 'function') {
      const detected = detectAssetClass(ticker);
      if (CLASS_MAP[detected]) return CLASS_MAP[detected];
    }

    /* Bond disambiguation: use ticker prefix hints */
    if (raw.startsWith('BOND:') || raw.startsWith('GOV:')) return 'govBonds';
    if (raw.startsWith('CORP:')) return 'corpBonds';

    /* Default to equities */
    return 'equities';
  };


  /* ══════════════════════════════════════════════════════════════════
     MASTER RAW DATA ASSEMBLER
     Collects output from ALL connected sources for a given ticker.
     This is what the engine calls internally, but we expose it
     here so uars-widget.js can display raw values without re-fetching.
  ══════════════════════════════════════════════════════════════════ */

  /**
   * uarsBuildRawData(ticker)
   * Runs all connected sources and merges their output into one flat
   * { [VAR_ID]: rawValue } map.
   *
   * @param {string} ticker
   * @returns {Promise<Object>}  flat raw data map
   */
  window.uarsBuildRawData = async function uarsBuildRawData(ticker) {
    const sym = ticker.replace(/.*:/, '').toUpperCase();
    const sources = Object.entries(engine._sources);

    const results = await Promise.allSettled(
      sources.map(([, source]) => source.fetch(ticker))
    );

    const merged = {};
    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value && typeof result.value === 'object') {
        Object.assign(merged, result.value);
      } else if (result.status === 'rejected') {
        console.warn(`[UARS Connector] Source "${sources[i][0]}" failed for ${sym}:`, result.reason?.message);
      }
    });

    return merged;
  };


  /* ══════════════════════════════════════════════════════════════════
     QUALITY MULTIPLIER BUILDER
     Computes per-dimension Q_{d,a,t} multipliers for Model 1.
     Uses coverage metadata from valuation-data.js.
  ══════════════════════════════════════════════════════════════════ */

  /**
   * uarsBuildQualityMults(ticker, assetClass)
   * Returns { [dimId]: number [0,1] } quality multipliers per dimension.
   *
   * Strategy:
   *   - For each dimension in ASSET_CLASS_CONFIGS[assetClass].dims,
   *     compute the fraction of its variables that are missing/null in rawData.
   *   - Pass to computeDimQuality() from uars_engine.js.
   *
   * @param {string} ticker
   * @param {string} assetClass  — key in ASSET_CLASS_CONFIGS
   * @param {Object} rawData     — assembled raw data map
   * @returns {Object}  { [dimId]: Q }
   */
  window.uarsBuildQualityMults = function uarsBuildQualityMults(ticker, assetClass, rawData) {
    const config = window.UARS?.ASSET_CLASS_CONFIGS?.[assetClass];
    if (!config) return {};

    const mults = {};

    for (const dim of config.dims) {
      const varIds  = dim.vars;
      if (!varIds.length) {
        mults[dim.id] = 1.0;
        continue;
      }

      const missing = varIds.filter(id => rawData[id] === null || rawData[id] === undefined).length;
      const stale   = 0;     /* We don't track staleness per-variable at this layer */
      const outliers= 0;

      const missingRate = missing / varIds.length;

      mults[dim.id] = typeof window.UARS?.computeDimQuality === 'function'
        ? window.UARS.computeDimQuality(missingRate, stale, outliers)
        : Math.max(0, 1 - missingRate * 0.5);
    }

    return mults;
  };


  /* ══════════════════════════════════════════════════════════════════
     MAIN ENTRY POINT
     uarsConnectSources()
     Called once on init. After this, engine.score() is fully wired.
  ══════════════════════════════════════════════════════════════════ */

  /**
   * uarsConnectSources()
   * All connectSource() calls have already been made above when the
   * module loaded. This function exists as an explicit entry point
   * that uars-widget.js can call to confirm wiring is complete and
   * sync the initial regime.
   *
   * @returns {UARSEngine}  the wired engine instance
   */
  window.uarsConnectSources = function uarsConnectSources() {
    /* Sync regime from current market signals */
    uarsSyncRegime();

    console.info(
      '[UARS Connector] Sources wired:',
      engine.connectedSources().join(', '),
      '| Regime:', engine.regime
    );

    return engine;
  };


  /* ══════════════════════════════════════════════════════════════════
     AUTO-INIT on DOMContentLoaded
  ══════════════════════════════════════════════════════════════════ */
  function _init() {
    uarsConnectSources();

    /* Re-sync regime every 5 minutes (VIX / yield curve can change) */
    setInterval(uarsSyncRegime, 5 * 60 * 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    /* Already loaded — run after current call stack clears */
    setTimeout(_init, 0);
  }

  console.info('[UARS Connector] Module loaded — engine instance ready.');

})(); /* end IIFE */
