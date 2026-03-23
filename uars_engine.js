// ============================================================
//  UARS ENGINE — Universal Asset Rating System
//  v2.0 | Models 1 / 2 / 3
//
//  USAGE:
//    const engine = new UARSEngine();
//    engine.setRegime('crisis');
//    engine.connectSource('bloomberg', myBloombergFetchFn);
//    const result = await engine.score('AAPL', 'equities');
//    console.log(result.consensus, result.rating.label);
// ============================================================


// ============================================================
//  1. MATH / STATISTICS
// ============================================================

function normalCDF(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  return z >= 0 ? 1 - p : p;
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function medianAbsDev(arr) {
  const med = median(arr);
  return median(arr.map(v => Math.abs(v - med)));
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function percentile(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(p * s.length)];
}

function winsorize(arr, pLow = 0.01, pHigh = 0.99) {
  const lo = percentile(arr, pLow);
  const hi = percentile(arr, pHigh);
  return arr.map(v => clamp(v, lo, hi));
}


// ============================================================
//  2. NORMALIZATION OPERATORS  →  all output [0, 100]
// ============================================================

const Norm = {

  /**
   * OPERATOR A — Robust Z-score → Normal CDF
   *
   * Use for:  most fundamental + market variables
   *
   * @param {number[]} peerValues   // DATA: all peer-group raw values for same variable
   * @param {number}   assetValue   // DATA: this asset's raw value
   * @param {boolean}  invert       // true when lower = better  (e.g. leverage, vol)
   * @param {number}   zMax         // clip bound, default 3
   * @param {number}   winsorPct    // winsorize peers at this pct, default 0.01 (p1/p99)
   *                                //   use 0.05 for noisy series (crypto, spreads)
   */
  A(peerValues, assetValue, invert = false, zMax = 3, winsorPct = 0.01) {
    const rawPeers  = invert ? peerValues.map(v => -v) : [...peerValues];
    const xStar     = invert ? -assetValue : assetValue;
    const peers     = winsorize(rawPeers, winsorPct, 1 - winsorPct);
    const med       = median(peers);
    const mad       = medianAbsDev(peers);
    const z         = mad === 0 ? 0 : (xStar - med) / (1.4826 * mad);
    return 100 * normalCDF(clamp(z, -zMax, zMax));
  },

  /**
   * OPERATOR B — Empirical Percentile Rank
   *
   * Use for:  non-Gaussian distributions — credit spreads, drawdowns,
   *           crypto on-chain metrics, illiquidity ratios
   *
   * @param {number[]} peerValues   // DATA: peer-group values, same variable
   * @param {number}   assetValue   // DATA: this asset's raw value
   * @param {boolean}  invert
   */
  B(peerValues, assetValue, invert = false) {
    const peers = invert ? peerValues.map(v => -v) : [...peerValues];
    const xStar = invert ? -assetValue : assetValue;
    const rank  = peers.filter(v => v < xStar).length + 0.5;
    return 100 * rank / peers.length;
  },

  /**
   * OPERATOR C — Min-Max (only when stable natural bounds exist)
   *
   * Use for:  occupancy rates (0–100%), credit numeric (0–100),
   *           WAM/WAL days, payout ratios
   *
   * @param {number}  assetValue
   * @param {number}  naturalMin    // DATA: known lower bound
   * @param {number}  naturalMax    // DATA: known upper bound
   * @param {boolean} invert
   */
  C(assetValue, naturalMin, naturalMax, invert = false) {
    const xStar = invert ? -assetValue : assetValue;
    const lo    = invert ? -naturalMax : naturalMin;
    const hi    = invert ? -naturalMin : naturalMax;
    if (hi === lo) return 50;
    return clamp(100 * (xStar - lo) / (hi - lo), 0, 100);
  },

  /**
   * OPERATOR D — Benchmark-Relative  →  then Operator A or B
   *
   * Use for:  relative momentum, alpha, bond spread vs curve
   *
   * @param {number}   assetValue       // DATA: asset raw value
   * @param {number}   benchmarkValue   // DATA: benchmark raw value (same variable)
   * @param {number[]} peerExcess       // DATA: pre-computed excess values for peers
   * @param {'A'|'B'}  operator
   */
  D(assetValue, benchmarkValue, peerExcess, operator = 'A') {
    const excess = assetValue - benchmarkValue;
    return operator === 'A'
      ? Norm.A(peerExcess, excess)
      : Norm.B(peerExcess, excess);
  },

};


// ============================================================
//  3. CREDIT RATING → NUMERIC  [0, 100]
// ============================================================

/**
 * DATA SOURCE:  S&P / Moody's / Fitch rating feed
 * Variable ID:  CRED_RATING_NOTCH_NUM  (computed/derived)
 */

const CREDIT_TABLE = [
  // { sp, moodys, numeric }  — rank = index + 1
  { sp: 'AAA',  moodys: 'Aaa',  numeric: 100 },
  { sp: 'AA+',  moodys: 'Aa1',  numeric: 95  },
  { sp: 'AA',   moodys: 'Aa2',  numeric: 90  },
  { sp: 'AA-',  moodys: 'Aa3',  numeric: 85  },
  { sp: 'A+',   moodys: 'A1',   numeric: 80  },
  { sp: 'A',    moodys: 'A2',   numeric: 75  },
  { sp: 'A-',   moodys: 'A3',   numeric: 70  },
  { sp: 'BBB+', moodys: 'Baa1', numeric: 65  },
  { sp: 'BBB',  moodys: 'Baa2', numeric: 60  },
  { sp: 'BBB-', moodys: 'Baa3', numeric: 55  }, // ← IG cutoff (rank 10)
  { sp: 'BB+',  moodys: 'Ba1',  numeric: 50  },
  { sp: 'BB',   moodys: 'Ba2',  numeric: 45  },
  { sp: 'BB-',  moodys: 'Ba3',  numeric: 40  },
  { sp: 'B+',   moodys: 'B1',   numeric: 35  },
  { sp: 'B',    moodys: 'B2',   numeric: 30  },
  { sp: 'B-',   moodys: 'B3',   numeric: 25  },
  { sp: 'CCC+', moodys: 'Caa1', numeric: 20  },
  { sp: 'CCC',  moodys: 'Caa2', numeric: 15  },
  { sp: 'CCC-', moodys: 'Caa3', numeric: 10  },
  { sp: 'D',    moodys: 'C',    numeric: 0   },
];

const IG_CUTOFF_RANK = 10; // BBB- is rank 10

/**
 * @param {string} rating   e.g. 'BBB+', 'Aa2', 'B-'
 * @param {number} lambda   HY convex penalty steepness (default 0.5)
 * @returns {number}        score [0, 100]
 */
function creditToNumeric(rating, lambda = 0.5) {
  const N   = CREDIT_TABLE.length;
  const idx = CREDIT_TABLE.findIndex(r => r.sp === rating || r.moodys === rating);
  if (idx === -1) return 0;
  const rank        = idx + 1;
  const scoreLinear = 100 * (N - rank) / (N - 1);
  const penalty     = lambda * Math.pow(Math.max(0, rank - IG_CUTOFF_RANK), 2);
  return clamp(scoreLinear - penalty, 0, 100);
}


// ============================================================
//  4. REGIME WEIGHT MULTIPLIERS
// ============================================================

/**
 * DATA SOURCE:  macro regime classification
 *   — yield curve slope (2Y10Y spread)        → Bloomberg / Fed H.15
 *   — PMI composite                            → Markit / S&P Global
 *   — VIX level                                → CBOE
 *   — HY spread                                → ICE BofA / Bloomberg
 *   — CPI YOY                                  → BLS / Eurostat
 *
 * Λ values > 1.0 → dimension gets more weight in this regime
 * Λ values < 1.0 → dimension gets less weight
 * Weights are renormalized to sum = 1 after multiplication
 */
const REGIME_MULT = {
  //            val    growth  quality  momentum  risk   liquidity  credit  macro
  expansion:  { val:0.85, growth:1.20, quality:0.90, momentum:1.20, risk:0.80, liquidity:0.85, credit:0.80, macro:1.00 },
  inflation:  { val:1.20, growth:0.80, quality:1.10, momentum:1.00, risk:1.15, liquidity:1.00, credit:1.00, macro:1.20 },
  latecycle:  { val:1.10, growth:0.90, quality:1.25, momentum:0.80, risk:1.10, liquidity:1.05, credit:1.05, macro:1.05 },
  crisis:     { val:1.10, growth:0.70, quality:1.20, momentum:0.75, risk:1.40, liquidity:1.30, credit:1.20, macro:1.15 },
  creditstress:{ val:1.10, growth:0.70, quality:1.20, momentum:0.70, risk:1.35, liquidity:1.30, credit:1.50, macro:1.15 },
};

/**
 * Apply regime multipliers and renormalize so Σw = 1
 * @param {{ [dimId: string]: number }} baseWeights
 * @param {string} regime
 * @returns {{ [dimId: string]: number }}
 */
function applyRegime(baseWeights, regime) {
  const mult = REGIME_MULT[regime] || REGIME_MULT.expansion;
  const adj  = {};
  let   sum  = 0;
  for (const [k, w] of Object.entries(baseWeights)) {
    adj[k] = w * (mult[k] || 1.0);
    sum   += adj[k];
  }
  for (const k of Object.keys(adj)) adj[k] /= sum;
  return adj;
}


// ============================================================
//  5. VARIABLE METADATA
//     dir:    'up'   → higher raw value = better
//             'down' → lower raw value  = better
//     op:     'A' | 'B' | 'C'
//     bounds: [min, max]  — required for Operator C only
//
//  Connect each variable ID to your data source:
//  see VARIABLE_SOURCES map below
// ============================================================

const VAR_META = {

  // ── Fundamental  →  Bloomberg BLP / Compustat / Refinitiv Eikon / FactSet
  FUND_REV_GROWTH_YOY:           { dir: 'up',   op: 'A' },  // % revenue growth YOY
  FUND_EBITDA_GROWTH_YOY:        { dir: 'up',   op: 'A' },  // % EBITDA growth YOY
  FUND_EPS_GROWTH_YOY:           { dir: 'up',   op: 'A' },  // % EPS growth YOY
  FUND_ROE_TTM:                  { dir: 'up',   op: 'A' },  // % return on equity TTM
  FUND_ROIC_TTM:                 { dir: 'up',   op: 'A' },  // % ROIC TTM
  FUND_OPER_MARGIN_TTM:          { dir: 'up',   op: 'A' },  // % operating margin TTM
  FUND_FCF_YIELD_TTM:            { dir: 'up',   op: 'A' },  // % FCF / market cap TTM
  FUND_DIV_YIELD_TTM:            { dir: 'up',   op: 'A' },  // % dividend yield TTM
  FUND_PAYOUT_RATIO_TTM:         { dir: 'up',   op: 'A' },  // % payout ratio TTM
  FUND_NET_DEBT_EBITDA_TTM:      { dir: 'down', op: 'A' },  // x net debt / EBITDA
  FUND_DEBT_TO_EQUITY_TTM:       { dir: 'down', op: 'A' },  // x debt / equity
  FUND_INT_COVERAGE_TTM:         { dir: 'up',   op: 'A' },  // x EBIT / interest

  // ── Market  →  Bloomberg price feed / Refinitiv TRTH / exchange APIs
  MKT_MOM_1M:                    { dir: 'up',   op: 'A' },  // % total return 1M
  MKT_MOM_12M:                   { dir: 'up',   op: 'A' },  // % total return 12M (ex last month)
  MKT_VOL_30D:                   { dir: 'down', op: 'A' },  // % annualized realized vol 30D
  MKT_BETA_TO_BENCH_250D:        { dir: 'up',   op: 'A' },  // OLS beta to benchmark 250D
  MKT_AVG_DOLLAR_VOL_30D:        { dir: 'up',   op: 'A' },  // $ avg daily dollar volume 30D
  MKT_MAX_DRAWDOWN_12M:          { dir: 'up',   op: 'B' },  // % max drawdown 12M (already negative)
  MKT_REL_RETURN_12M:            { dir: 'up',   op: 'A' },  // % return vs benchmark 12M

  // ── Risk  →  Barra / Axioma / computed from price feed
  RISK_SHARPE_12M:               { dir: 'up',   op: 'A' },  // Sharpe ratio 12M
  RISK_SORTINO_12M:              { dir: 'up',   op: 'A' },  // Sortino ratio 12M
  RISK_DOWNSIDE_VOL_12M:         { dir: 'down', op: 'A' },  // % downside semi-deviation 12M
  RISK_VAR_99_10D:               { dir: 'down', op: 'B' },  // % VaR 99% 10-day (positive = loss)
  RISK_ES_97_5_10D:              { dir: 'down', op: 'B' },  // % Expected Shortfall 97.5% 10-day
  RISK_CORR_TO_BENCH_250D:       { dir: 'down', op: 'A' },  // correlation to benchmark 250D

  // ── Credit  →  Markit CDS / Bloomberg BVAL / ICE BofA
  CRED_RATING_NOTCH_NUM:         { dir: 'up',   op: 'C', bounds: [0, 100] },  // numeric from creditToNumeric()
  CRED_SPREAD_OAS_BPS:           { dir: 'up',   op: 'B' },  // bps OAS — higher carry = better
  CRED_SPREAD_DURATION:          { dir: 'down', op: 'A' },  // years spread duration
  CRED_CDS_5Y_BPS:               { dir: 'down', op: 'B' },  // bps 5Y CDS spread
  CRED_REFIN_RISK_INDEX:         { dir: 'down', op: 'A' },  // [0–1] refinancing risk index
  CRED_DEBT_SERVICE_CAPACITY_SCORE: { dir: 'up', op: 'A' }, // [0–100] DSCR composite

  // ── Macro  →  IMF / BEA / Eurostat / Fed H.15 / ECB SDW
  MACRO_INFL_BETA_3Y:            { dir: 'up',   op: 'A' },  // 3Y beta of returns to CPI
  MACRO_RATE_BETA_3Y:            { dir: 'up',   op: 'A' },  // 3Y beta of returns to 10Y yield
  MACRO_GDP_BETA_5Y:             { dir: 'up',   op: 'A' },  // 5Y beta of returns to GDP growth
  MACRO_RECESSION_VULN_SCORE:    { dir: 'down', op: 'A' },  // [0–100] recession vulnerability
  MACRO_POLICY_SENS_SCORE:       { dir: 'up',   op: 'A' },  // [0–100] policy sensitivity

  // ── Factor  →  MSCI Barra / Axioma / FactSet Multi-Factor Model
  FACTOR_VALUE_BETA:             { dir: 'up',   op: 'A' },  // value factor loading
  FACTOR_QUALITY_BETA:           { dir: 'up',   op: 'A' },  // quality factor loading
  FACTOR_MOMENTUM_BETA:          { dir: 'up',   op: 'A' },  // momentum factor loading
  FACTOR_LOWVOL_BETA:            { dir: 'up',   op: 'A' },  // low-vol factor loading
  FACTOR_SIZE_BETA:              { dir: 'up',   op: 'A' },  // size factor loading
  FACTOR_CARRY_BETA:             { dir: 'up',   op: 'A' },  // carry factor loading
  FACTOR_YIELD_BETA:             { dir: 'up',   op: 'A' },  // yield factor loading
  FACTOR_GROWTH_BETA:            { dir: 'up',   op: 'A' },  // growth factor loading

  // ── Asset-Specific: Crypto  →  Glassnode / Coin Metrics / on-chain APIs
  SPEC_CRYPTO_ACTIVE_ADDR_GROWTH_30D: { dir: 'up',   op: 'B' },  // % active address growth 30D
  SPEC_CRYPTO_TX_COUNT_GROWTH_30D:    { dir: 'up',   op: 'B' },  // % transaction count growth 30D
  SPEC_CRYPTO_TRANSFER_VOL_USD_30D:   { dir: 'up',   op: 'B' },  // $ on-chain transfer volume 30D
  SPEC_CRYPTO_NVT_90D:                { dir: 'down', op: 'B' },  // NVT ratio 90D (network val / tx vol)
  SPEC_CRYPTO_HASHRATE_TREND_90D:     { dir: 'up',   op: 'B' },  // % hash rate trend 90D (PoW) or validator growth (PoS)
  SPEC_CRYPTO_SUPPLY_INFLATION_RATE:  { dir: 'down', op: 'A' },  // % annual token supply inflation
  SPEC_CRYPTO_STABLECOIN_DEPEG_FREQ:  { dir: 'down', op: 'B' },  // # depeg events (stablecoins only)

  // ── Asset-Specific: Commodities  →  EIA / USDA / LME / CME / ICE
  SPEC_COMM_INVENTORY_Z:              { dir: 'down', op: 'A' },  // z-score vs seasonal avg (low = bullish)
  SPEC_COMM_TERM_STRUCTURE_SLOPE:     { dir: 'up',   op: 'A' },  // slope of futures curve (backwardation positive)
  SPEC_COMM_ROLL_YIELD_3M:            { dir: 'up',   op: 'A' },  // % 3M roll yield from curve
  SPEC_COMM_SUPPLY_DEMAND_BAL_SCORE:  { dir: 'up',   op: 'A' },  // [0–100] supply-demand balance score
  SPEC_FUT_OPEN_INTEREST:             { dir: 'up',   op: 'A' },  // contracts open interest

  // ── Asset-Specific: REITs  →  NAREIT / CoStar / company SEC filings
  SPEC_REIT_FFO_GROWTH_YOY:           { dir: 'up',   op: 'A' },  // % FFO growth YOY
  SPEC_REIT_OCCUPANCY_RATE:           { dir: 'up',   op: 'C', bounds: [50, 100] }, // % occupancy
  SPEC_REIT_LEASE_TERM_WALT:          { dir: 'up',   op: 'A' },  // years weighted avg lease term
  SPEC_REIT_PROPERTY_DIVERS_SCORE:    { dir: 'up',   op: 'A' },  // [0–100] property diversification

  // ── Asset-Specific: Money Market  →  SEC N-MFP filing / fund factsheet
  SPEC_MM_WAM_DAYS:                   { dir: 'down', op: 'C', bounds: [0, 120] },  // days WAM
  SPEC_MM_WAL_DAYS:                   { dir: 'down', op: 'C', bounds: [0, 180] },  // days WAL
  SPEC_MM_WEEKLY_LIQUID_ASSETS_PCT:   { dir: 'up',   op: 'C', bounds: [0, 100] },  // % weekly liquid assets

  // ── Asset-Specific: Derivatives  →  Bloomberg OVME / exchange data
  SPEC_OPT_IV_30D:                    { dir: 'down', op: 'A' },  // % implied vol 30D ATM
  SPEC_OPT_VEGA:                      { dir: 'up',   op: 'A' },  // vega sensitivity
  SPEC_OPT_THETA:                     { dir: 'down', op: 'A' },  // theta (negative = time decay cost)
  SPEC_CFD_PROVIDER_RISK_SCORE:       { dir: 'down', op: 'A' },  // [0–1] provider risk score

  // ── ETF  →  Bloomberg ETF analytics / issuer factsheet / ETF.com
  SPEC_ETF_TRACKING_ERROR_1Y:         { dir: 'down', op: 'A' },  // % annualized tracking error 1Y
  SPEC_ETF_TRACKING_DIFF_1Y:          { dir: 'down', op: 'A' },  // % tracking difference 1Y
  SPEC_ETF_EXPENSE_RATIO:             { dir: 'down', op: 'A' },  // % total expense ratio
  SPEC_ETF_HOLDINGS_CONC_TOP10:       { dir: 'down', op: 'A' },  // % top-10 holdings concentration
  SPEC_ETF_AUM:                       { dir: 'up',   op: 'A' },  // $ assets under management
};


// ============================================================
//  6. ASSET CLASS CONFIGURATIONS
//     Each dimension:
//       id       → maps to REGIME_MULT key
//       label    → display string
//       weight   → baseline weight (sums to 1.0 per class)
//       vars     → variable IDs contributing to this dimension
//
//  penalties  →  Model 3 multiplicative haircuts
//       liq    →  derived from MKT_AVG_DOLLAR_VOL_30D, Amihud ratio
//       tail   →  derived from RISK_VAR_99_10D, RISK_ES_97_5_10D, MKT_MAX_DRAWDOWN_12M
//       dq     →  derived from data pipeline: missing %, staleness %, low coverage %
//       struct →  asset-specific: ETF tracking error, CFD provider risk, etc.
// ============================================================

const ASSET_CLASS_CONFIGS = {

  equities: {
    label: 'EQUITY',
    dims: [
      { id: 'val',       label: 'Valuation',     weight: 0.18, vars: ['FUND_FCF_YIELD_TTM', 'FUND_DIV_YIELD_TTM', 'FACTOR_VALUE_BETA'] },
      { id: 'growth',    label: 'Growth',        weight: 0.12, vars: ['FUND_REV_GROWTH_YOY', 'FUND_EPS_GROWTH_YOY', 'FUND_EBITDA_GROWTH_YOY'] },
      { id: 'quality',   label: 'Profitability', weight: 0.14, vars: ['FUND_ROE_TTM', 'FUND_ROIC_TTM', 'FUND_OPER_MARGIN_TTM'] },
      { id: 'momentum',  label: 'Quality',       weight: 0.12, vars: ['FUND_NET_DEBT_EBITDA_TTM', 'FUND_INT_COVERAGE_TTM', 'FACTOR_QUALITY_BETA'] },
      { id: 'risk',      label: 'Momentum',      weight: 0.14, vars: ['MKT_MOM_12M', 'MKT_MOM_1M', 'MKT_REL_RETURN_12M'] },
      { id: 'liquidity', label: 'Risk',          weight: 0.16, vars: ['RISK_SHARPE_12M', 'RISK_DOWNSIDE_VOL_12M', 'MKT_MAX_DRAWDOWN_12M'] },
      { id: 'credit',    label: 'Liquidity',     weight: 0.07, vars: ['MKT_AVG_DOLLAR_VOL_30D', 'RISK_CORR_TO_BENCH_250D'] },
      { id: 'macro',     label: 'Macro',         weight: 0.07, vars: ['MACRO_GDP_BETA_5Y', 'MACRO_RECESSION_VULN_SCORE', 'MACRO_POLICY_SENS_SCORE'] },
    ],
    // penalties → connect to your liquidity/risk/data-quality pipeline
    // P_liq:   set < 1 for low-volume / illiquid stocks
    // P_tail:  set < 1 for high VaR / severe drawdown stocks
    // P_dq:    set < 1 when fundamental data is missing / stale
    // P_struct: 1.0 for plain equities
    penalties: { liq: 1.0, tail: 1.0, dq: 1.0, struct: 1.0 },
  },

  govBonds: {
    label: 'GOV BOND',
    dims: [
      { id: 'val',       label: 'Yield',         weight: 0.25, vars: ['CRED_SPREAD_OAS_BPS'] },
      { id: 'risk',      label: 'Duration',      weight: 0.25, vars: ['MACRO_RATE_BETA_3Y'] },
      { id: 'quality',   label: 'Convexity',     weight: 0.15, vars: [] },
      { id: 'liquidity', label: 'Liquidity',     weight: 0.20, vars: ['MKT_AVG_DOLLAR_VOL_30D'] },
      { id: 'macro',     label: 'Macro',         weight: 0.15, vars: ['MACRO_INFL_BETA_3Y', 'MACRO_RATE_BETA_3Y'] },
    ],
    penalties: { liq: 1.0, tail: 1.0, dq: 1.0, struct: 1.0 },
  },

  corpBonds: {
    label: 'CORP BOND',
    dims: [
      { id: 'val',       label: 'Yield / OAS',   weight: 0.20, vars: ['CRED_SPREAD_OAS_BPS'] },
      { id: 'credit',    label: 'Credit Rtg',    weight: 0.20, vars: ['CRED_RATING_NOTCH_NUM', 'CRED_CDS_5Y_BPS'] },
      { id: 'quality',   label: 'Spread',        weight: 0.15, vars: ['CRED_SPREAD_OAS_BPS', 'CRED_SPREAD_DURATION'] },
      { id: 'growth',    label: 'Spread Dur',    weight: 0.10, vars: ['CRED_SPREAD_DURATION'] },
      { id: 'risk',      label: 'Rate Duration', weight: 0.12, vars: ['MACRO_RATE_BETA_3Y'] },
      { id: 'liquidity', label: 'Liquidity',     weight: 0.10, vars: ['MKT_AVG_DOLLAR_VOL_30D'] },
      { id: 'macro',     label: 'Macro',         weight: 0.13, vars: ['MACRO_INFL_BETA_3Y', 'MACRO_RECESSION_VULN_SCORE'] },
    ],
    penalties: { liq: 1.0, tail: 1.0, dq: 1.0, struct: 1.0 },
  },

  fx: {
    label: 'FX',
    dims: [
      { id: 'val',       label: 'Carry',         weight: 0.25, vars: ['FACTOR_CARRY_BETA'] },
      { id: 'momentum',  label: 'Momentum',      weight: 0.20, vars: ['MKT_MOM_12M', 'MKT_MOM_1M'] },
      { id: 'growth',    label: 'Valuation',     weight: 0.15, vars: ['FACTOR_VALUE_BETA'] },
      { id: 'risk',      label: 'Risk',          weight: 0.20, vars: ['MKT_VOL_30D', 'MKT_MAX_DRAWDOWN_12M'] },
      { id: 'liquidity', label: 'Liquidity',     weight: 0.10, vars: ['MKT_AVG_DOLLAR_VOL_30D'] },
      { id: 'macro',     label: 'Macro',         weight: 0.10, vars: ['MACRO_RATE_BETA_3Y', 'MACRO_INFL_BETA_3Y'] },
    ],
    penalties: { liq: 1.0, tail: 1.0, dq: 1.0, struct: 1.0 },
  },

  commodities: {
    label: 'COMMODITY',
    dims: [
      { id: 'val',       label: 'Term Struct',   weight: 0.20, vars: ['SPEC_COMM_TERM_STRUCTURE_SLOPE', 'SPEC_COMM_ROLL_YIELD_3M'] },
      { id: 'growth',    label: 'Inventories',   weight: 0.15, vars: ['SPEC_COMM_INVENTORY_Z'] },
      { id: 'quality',   label: 'Sup-Dem Bal',   weight: 0.15, vars: ['SPEC_COMM_SUPPLY_DEMAND_BAL_SCORE'] },
      { id: 'momentum',  label: 'Momentum',      weight: 0.15, vars: ['MKT_MOM_12M', 'MKT_MOM_1M'] },
      { id: 'risk',      label: 'Risk',          weight: 0.15, vars: ['MKT_VOL_30D', 'MKT_MAX_DRAWDOWN_12M'] },
      { id: 'macro',     label: 'Macro',         weight: 0.15, vars: ['MACRO_GDP_BETA_5Y', 'MACRO_INFL_BETA_3Y'] },
      { id: 'liquidity', label: 'Liquidity',     weight: 0.05, vars: ['SPEC_FUT_OPEN_INTEREST', 'MKT_AVG_DOLLAR_VOL_30D'] },
    ],
    penalties: { liq: 1.0, tail: 1.0, dq: 1.0, struct: 1.0 },
  },

  crypto: {
    label: 'CRYPTO',
    dims: [
      { id: 'growth',    label: 'Adoption',      weight: 0.25, vars: ['SPEC_CRYPTO_ACTIVE_ADDR_GROWTH_30D', 'SPEC_CRYPTO_TX_COUNT_GROWTH_30D'] },
      { id: 'quality',   label: 'Net Quality',   weight: 0.20, vars: ['SPEC_CRYPTO_NVT_90D', 'SPEC_CRYPTO_TRANSFER_VOL_USD_30D'] },
      { id: 'val',       label: 'Tokenomics',    weight: 0.15, vars: ['SPEC_CRYPTO_SUPPLY_INFLATION_RATE', 'SPEC_CRYPTO_HASHRATE_TREND_90D'] },
      { id: 'momentum',  label: 'Momentum',      weight: 0.10, vars: ['MKT_MOM_1M', 'MKT_MOM_12M'] },
      { id: 'risk',      label: 'Risk',          weight: 0.15, vars: ['RISK_ES_97_5_10D', 'MKT_VOL_30D'] },
      { id: 'liquidity', label: 'Liquidity',     weight: 0.10, vars: ['MKT_AVG_DOLLAR_VOL_30D'] },
      { id: 'macro',     label: 'Macro',         weight: 0.05, vars: ['MACRO_RECESSION_VULN_SCORE'] },
    ],
    penalties: { liq: 1.0, tail: 1.0, dq: 1.0, struct: 1.0 },
  },

  reits: {
    label: 'REIT',
    dims: [
      { id: 'val',       label: 'Valuation',     weight: 0.15, vars: ['FUND_FCF_YIELD_TTM', 'FUND_DIV_YIELD_TTM'] },
      { id: 'growth',    label: 'FFO Growth',    weight: 0.15, vars: ['SPEC_REIT_FFO_GROWTH_YOY'] },
      { id: 'quality',   label: 'Occupancy',     weight: 0.15, vars: ['SPEC_REIT_OCCUPANCY_RATE', 'SPEC_REIT_LEASE_TERM_WALT'] },
      { id: 'credit',    label: 'Leverage',      weight: 0.12, vars: ['FUND_NET_DEBT_EBITDA_TTM', 'FUND_DEBT_TO_EQUITY_TTM'] },
      { id: 'momentum',  label: 'Momentum',      weight: 0.13, vars: ['MKT_MOM_12M'] },
      { id: 'risk',      label: 'Risk',          weight: 0.12, vars: ['RISK_SHARPE_12M', 'RISK_DOWNSIDE_VOL_12M'] },
      { id: 'liquidity', label: 'Liquidity',     weight: 0.10, vars: ['MKT_AVG_DOLLAR_VOL_30D'] },
      { id: 'macro',     label: 'Macro',         weight: 0.08, vars: ['MACRO_RATE_BETA_3Y'] },
    ],
    penalties: { liq: 1.0, tail: 1.0, dq: 1.0, struct: 1.0 },
  },

  etfs: {
    label: 'ETF',
    dims: [
      // NOTE: 'growth' dim holds the look-through score
      // Pass Score_lookthrough as SPEC_ETF_LOOKTHROUGH_SCORE in your raw data
      // Compute it by running scoreAsset() on the underlying holdings first
      { id: 'growth',    label: 'Look-through',  weight: 0.50, vars: [] },
      { id: 'quality',   label: 'Track Error',   weight: 0.15, vars: ['SPEC_ETF_TRACKING_ERROR_1Y', 'SPEC_ETF_TRACKING_DIFF_1Y'] },
      { id: 'val',       label: 'Cost',          weight: 0.15, vars: ['SPEC_ETF_EXPENSE_RATIO'] },
      { id: 'liquidity', label: 'Liquidity',     weight: 0.12, vars: ['MKT_AVG_DOLLAR_VOL_30D', 'SPEC_ETF_AUM'] },
      { id: 'risk',      label: 'Structural',    weight: 0.08, vars: ['SPEC_ETF_HOLDINGS_CONC_TOP10'] },
    ],
    // P_struct → connect to SPEC_ETF_TRACKING_ERROR_1Y: P_struct = clamp(1 - trackingError*10, 0.6, 1.0)
    penalties: { liq: 1.0, tail: 1.0, dq: 1.0, struct: 1.0 },
  },

  moneyMarket: {
    label: 'MONEY MKT',
    dims: [
      { id: 'val',       label: 'Yield',         weight: 0.30, vars: ['FACTOR_YIELD_BETA'] },
      { id: 'credit',    label: 'Credit Qual',   weight: 0.30, vars: ['CRED_RATING_NOTCH_NUM'] },
      { id: 'liquidity', label: 'Liquidity',     weight: 0.25, vars: ['SPEC_MM_WEEKLY_LIQUID_ASSETS_PCT'] },
      { id: 'risk',      label: 'Risk',          weight: 0.08, vars: ['RISK_VAR_99_10D'] },
      { id: 'quality',   label: 'Structural',    weight: 0.07, vars: ['SPEC_MM_WAM_DAYS', 'SPEC_MM_WAL_DAYS'] },
    ],
    penalties: { liq: 1.0, tail: 1.0, dq: 1.0, struct: 1.0 },
  },

  indices: {
    label: 'INDEX',
    dims: [
      { id: 'risk',      label: 'Risk Profile',  weight: 0.20, vars: ['RISK_SHARPE_12M', 'RISK_DOWNSIDE_VOL_12M'] },
      { id: 'momentum',  label: 'Trend',         weight: 0.20, vars: ['MKT_MOM_12M', 'MKT_MOM_1M'] },
      { id: 'val',       label: 'Factor Des.',   weight: 0.25, vars: ['FACTOR_VALUE_BETA', 'FACTOR_MOMENTUM_BETA', 'FACTOR_QUALITY_BETA', 'FACTOR_LOWVOL_BETA'] },
      { id: 'quality',   label: 'Diversif.',     weight: 0.15, vars: ['RISK_CORR_TO_BENCH_250D'] },
      { id: 'liquidity', label: 'Liquidity',     weight: 0.10, vars: ['MKT_AVG_DOLLAR_VOL_30D'] },
      { id: 'macro',     label: 'Macro',         weight: 0.10, vars: ['MACRO_GDP_BETA_5Y', 'MACRO_INFL_BETA_3Y'] },
    ],
    penalties: { liq: 1.0, tail: 1.0, dq: 1.0, struct: 1.0 },
  },

};


// ============================================================
//  7. PENALTY HELPERS
// ============================================================

/**
 * Compute P_liq from raw liquidity data
 *
 * @param {number} amihudRatio       // DATA: |daily_return| / dollar_volume  (Bloomberg / price feed)
 * @param {number} amihudThresholdLo // liquid threshold (below → P_liq = 1.0)
 * @param {number} amihudThresholdHi // illiquid threshold (above → P_liq = 0.6)
 * @returns {number}  [0.6, 1.0]
 */
function computePenaltyLiq(amihudRatio, amihudThresholdLo = 0, amihudThresholdHi = 1e-6) {
  const t  = amihudThresholdHi === amihudThresholdLo ? 0 :
             (amihudRatio - amihudThresholdLo) / (amihudThresholdHi - amihudThresholdLo);
  return clamp(1.0 - 0.4 * t, 0.6, 1.0);
}

/**
 * Compute P_tail from risk variables
 *
 * @param {number} var99_10d         // DATA: RISK_VAR_99_10D  (% loss, positive)
 * @param {number} es97_5_10d        // DATA: RISK_ES_97_5_10D (% loss, positive)
 * @param {number} maxDrawdown12m    // DATA: MKT_MAX_DRAWDOWN_12M (%, negative)
 * @param {number} varThreshold      // VaR level above which penalty begins (e.g. 5%)
 * @param {number} varExtreme        // VaR level where penalty is max (e.g. 20%)
 * @returns {number}  [0.6, 1.0]
 */
function computePenaltyTail(var99_10d, es97_5_10d, maxDrawdown12m, varThreshold = 5, varExtreme = 20) {
  const tailScore = (var99_10d + es97_5_10d) / 2 + Math.abs(maxDrawdown12m) * 0.1;
  const t         = clamp((tailScore - varThreshold) / (varExtreme - varThreshold), 0, 1);
  return clamp(1.0 - 0.4 * t, 0.6, 1.0);
}

/**
 * Compute P_dq (data quality) from pipeline metadata
 *
 * @param {number} missingPct      // DATA: fraction of variables missing [0,1]  — from your data pipeline
 * @param {number} stalePct        // DATA: fraction of variables stale [0,1]    — from your data pipeline
 * @param {number} lowCoveragePct  // DATA: fraction with low coverage [0,1]     — from your data pipeline
 * @returns {number}  [0.6, 1.0]
 */
function computePenaltyDQ(missingPct = 0, stalePct = 0, lowCoveragePct = 0) {
  return clamp(1 - (missingPct * 0.4 + stalePct * 0.3 + lowCoveragePct * 0.3), 0.6, 1.0);
}

/**
 * Compute P_struct (structural)
 *
 * @param {object} opts
 *   opts.isETF           → use tracking error
 *   opts.trackingError   // DATA: SPEC_ETF_TRACKING_ERROR_1Y
 *   opts.isCFD           → use provider risk
 *   opts.cfdProviderRisk // DATA: SPEC_CFD_PROVIDER_RISK_SCORE [0,1]
 * @returns {number}  [0.6, 1.0]
 */
function computePenaltyStruct({ isETF = false, trackingError = 0, isCFD = false, cfdProviderRisk = 0 } = {}) {
  if (isETF) return clamp(1 - trackingError * 10, 0.6, 1.0);
  if (isCFD) return clamp(1 - cfdProviderRisk * 0.4, 0.6, 1.0);
  return 1.0;
}

/**
 * Compute per-dimension quality multiplier Q_{d,a,t}  (Models 1 / 2)
 * Q = 1 − λ1·MissingRate − λ2·StalenessPenalty − λ3·OutlierPenalty
 *
 * @param {number} missingRate       // DATA: fraction of this dimension's variables missing
 * @param {number} stalenessPenalty  // DATA: fraction of this dimension's variables stale
 * @param {number} outlierPenalty    // DATA: fraction flagged as outliers
 * @returns {number}  [0, 1]
 */
function computeDimQuality(missingRate = 0, stalenessPenalty = 0, outlierPenalty = 0,
                           lambda1 = 0.5, lambda2 = 0.3, lambda3 = 0.2) {
  return clamp(1 - lambda1 * missingRate - lambda2 * stalenessPenalty - lambda3 * outlierPenalty, 0, 1);
}


// ============================================================
//  8. SCORING MODELS
// ============================================================

/**
 * MODEL 1 — UScore  (full quality-weighted, peer-relative blend)
 *
 * UScore = Σ_d  W_{d,c,r} · S_d · Q_d
 * FinalScore = α · UScore  +  (1−α) · RA
 *
 * @param {{ [dimId]: number }} dimScores       normalized [0,100]
 * @param {{ [dimId]: number }} baseWeights
 * @param {{ [dimId]: number }} qualityMults    Q per dimension [0,1]
 * @param {string}              regime
 * @param {number}              RA              relative attractiveness vs peer [0,100]
 *                                              DATA: percentile rank of asset in peer group
 * @param {number}              alpha           blending coeff (equities 0.70, bonds 0.60, crypto 0.80)
 * @returns {number}  [0, 100]
 */
function model1(dimScores, baseWeights, qualityMults, regime, RA = 50, alpha = 0.70) {
  const adjW  = applyRegime(baseWeights, regime);
  let   wsum  = 0;
  let   total = 0;
  for (const [k, s] of Object.entries(dimScores)) {
    const w = adjW[k] || 0;
    const q = qualityMults[k] ?? 1.0;
    total += w * s * q;
    wsum  += w;
  }
  const uScore = wsum > 0 ? total / wsum : 50;
  return clamp(alpha * uScore + (1 - alpha) * RA, 0, 100);
}

/**
 * MODEL 2 — UARS  (semi-dynamic, no quality multiplier)
 *
 * UARS = Σ_i  w_i(r) · D_i
 *
 * @param {{ [dimId]: number }} dimScores
 * @param {{ [dimId]: number }} baseWeights
 * @param {string}              regime
 * @returns {number}  [0, 100]
 */
function model2(dimScores, baseWeights, regime) {
  const adjW  = applyRegime(baseWeights, regime);
  let   total = 0;
  for (const [k, s] of Object.entries(dimScores)) {
    total += (adjW[k] || 0) * s;
  }
  return clamp(total, 0, 100);
}

/**
 * MODEL 3 — CAS  (composite with multiplicative penalties)
 *
 * AS  = Σ_k  w_k(c,r) · D_k
 * CAS = AS · P_liq · P_tail · P_dq · P_struct
 *
 * @param {{ [dimId]: number }} dimScores
 * @param {{ [dimId]: number }} baseWeights
 * @param {string}              regime
 * @param {{ liq, tail, dq, struct }} penalties   each [0.6, 1.0]
 *        liq    → computePenaltyLiq()    — from Amihud illiquidity ratio
 *        tail   → computePenaltyTail()   — from RISK_VAR_99_10D / RISK_ES_97_5_10D
 *        dq     → computePenaltyDQ()     — from data pipeline metadata
 *        struct → computePenaltyStruct() — ETF tracking error, CFD provider risk
 * @returns {{ AS: number, CAS: number }}
 */
function model3(dimScores, baseWeights, regime, penalties = {}) {
  const adjW                            = applyRegime(baseWeights, regime);
  const { liq = 1, tail = 1, dq = 1, struct = 1 } = penalties;
  let   total = 0;
  for (const [k, s] of Object.entries(dimScores)) {
    total += (adjW[k] || 0) * s;
  }
  const AS  = clamp(total, 0, 100);
  const CAS = clamp(AS * liq * tail * dq * struct, 0, 100);
  return { AS, CAS };
}


// ============================================================
//  9. RATING CLASSIFICATION
// ============================================================

/**
 * @param {number} score  [0, 100]
 * @returns {{ label: string, recommendation: string, band: string }}
 */
function scoreToRating(score) {
  if (score >= 90) return { label: 'EXCEPTIONAL',    recommendation: 'OVERWEIGHT — TACTICAL',   band: '90-100' };
  if (score >= 80) return { label: 'VERY ATTRACTIVE',recommendation: 'PREFERRED HOLDING',        band: '80-89'  };
  if (score >= 70) return { label: 'ATTRACTIVE',     recommendation: 'CORE HOLDING CANDIDATE',  band: '70-79'  };
  if (score >= 60) return { label: 'NEUTRAL',        recommendation: 'MARKET-WEIGHT',            band: '60-69'  };
  if (score >= 50) return { label: 'WEAK',           recommendation: 'UNDERWEIGHT / HOLD',       band: '50-59'  };
  return                   { label: 'UNATTRACTIVE',  recommendation: 'EXCLUSION / SHORT',         band: '0-49'   };
}

/**
 * Confidence tier from avg data quality
 * @param {number} avgDQ  [0,1]  average Q multiplier across all dimensions
 */
function confidenceTier(avgDQ) {
  if (avgDQ >= 0.90) return 'HIGH';
  if (avgDQ >= 0.75) return 'MEDIUM';
  return 'LOW';
}

/**
 * EWMA weight smoothing — prevents rating jitter (Model 2 / Sobol)
 * Apply when Sobol total sensitivity S_Ti > threshold for any dimension
 *
 * @param {number} wNew
 * @param {number} wPrev  // stored from previous scoring run
 * @param {number} alpha  // 0 = full smoothing, 1 = no smoothing. default 0.3
 */
function ewmaSmooth(wNew, wPrev, alpha = 0.3) {
  return alpha * wNew + (1 - alpha) * wPrev;
}


// ============================================================
//  10. MAIN ENGINE CLASS
// ============================================================

class UARSEngine {

  constructor() {
    this.regime       = 'expansion';     // default macro regime
    this._sources     = {};              // id → { fetch: async (ticker) → rawData }
    this._peerCache   = {};              // varId → number[]   (peer group raw values)
    this._scoreCache  = {};              // ticker → result
  }

  // ── Regime ──────────────────────────────────────────────────

  /**
   * Set active macro regime
   * Valid: 'expansion' | 'inflation' | 'latecycle' | 'crisis' | 'creditstress'
   */
  setRegime(regime) {
    if (!REGIME_MULT[regime]) throw new Error(`Unknown regime: ${regime}. Valid: ${Object.keys(REGIME_MULT).join(', ')}`);
    this.regime      = regime;
    this._scoreCache = {};   // invalidate cache on regime change
  }

  // ── Data Sources ─────────────────────────────────────────────

  /**
   * Register a data source
   *
   * @param {string}   id         unique key e.g. 'bloomberg'
   * @param {Function} fetchFn    async (ticker: string) => { [VARIABLE_ID]: number }
   *
   * CONNECT YOUR SOURCE:
   *
   *   engine.connectSource('bloomberg', async (ticker) => {
   *     const raw = await blpApi.fetch(ticker, ['EPS_GROWTH', 'RETURN_COM_EQY', ...]);
   *     return {
   *       FUND_EPS_GROWTH_YOY:  raw['IS_EPS_GROWTH'],       // map BLP field → UARS var ID
   *       FUND_ROE_TTM:         raw['RETURN_COM_EQY'],
   *       MKT_MOM_12M:          raw['TOT_RETURN_12M'],
   *       ...
   *     };
   *   });
   *
   *   engine.connectSource('glassnode', async (ticker) => {
   *     const onchain = await glassnodeApi.get(ticker);
   *     return {
   *       SPEC_CRYPTO_ACTIVE_ADDR_GROWTH_30D: onchain.active_addresses_30d_change,
   *       SPEC_CRYPTO_NVT_90D:                onchain.nvt_signal_90d,
   *       ...
   *     };
   *   });
   */
  connectSource(id, fetchFn) {
    this._sources[id] = { fetch: fetchFn };
  }

  disconnectSource(id) {
    delete this._sources[id];
  }

  connectedSources() {
    return Object.keys(this._sources);
  }

  // ── Peer Group ───────────────────────────────────────────────

  /**
   * Provide the peer group for a variable (required for Operators A and B)
   *
   * In production: call this once per variable per rebalance with all
   * peer asset values. The engine uses it when normalizing each asset.
   *
   * @param {string}   varId       e.g. 'FUND_ROE_TTM'
   * @param {number[]} peerValues  raw values for all peers in the universe
   *
   * EXAMPLE:
   *   const peers = await yourDB.query('SELECT roe_ttm FROM equities WHERE date = today');
   *   engine.setPeerGroup('FUND_ROE_TTM', peers.map(r => r.roe_ttm));
   */
  setPeerGroup(varId, peerValues) {
    this._peerCache[varId] = peerValues;
  }

  setPeerGroups(map) {
    // map = { [varId]: number[] }
    Object.assign(this._peerCache, map);
  }

  _getPeers(varId) {
    return this._peerCache[varId] || [];
  }

  // ── Normalization ────────────────────────────────────────────

  /**
   * Normalize a single raw variable value to [0, 100]
   * Peers must have been set via setPeerGroup() first
   */
  normalizeVar(varId, rawValue) {
    const meta = VAR_META[varId];
    if (!meta) return 50;  // unknown variable → neutral
    const invert = meta.dir === 'down';

    if (meta.op === 'C') {
      const [lo, hi] = meta.bounds;
      return Norm.C(rawValue, lo, hi, invert);
    }

    const peers = this._getPeers(varId);
    if (peers.length < 5) return 50;  // not enough peers → neutral

    const winsorPct = ['SPEC_CRYPTO', 'CRED_SPREAD', 'MKT_VOL'].some(p => varId.startsWith(p)) ? 0.05 : 0.01;

    if (meta.op === 'B') return Norm.B(peers, rawValue, invert);
    return Norm.A(peers, rawValue, invert, 3, winsorPct);
  }

  /**
   * Normalize a full map of raw variable values
   * @param {{ [varId]: number }} rawData
   * @returns {{ [varId]: number }}  normalized [0–100]
   */
  normalizeAll(rawData) {
    const out = {};
    for (const [varId, raw] of Object.entries(rawData)) {
      out[varId] = this.normalizeVar(varId, raw);
    }
    return out;
  }

  // ── Dimension Score ──────────────────────────────────────────

  /**
   * D_k = Σ_{j∈k} v_{k,j} · S_{k,j}   with equal weights by default
   */
  _dimensionScore(varIds, normalizedScores, varWeights = {}) {
    if (varIds.length === 0) return 50;
    let total = 0, wsum = 0;
    const eq = 1 / varIds.length;
    for (const id of varIds) {
      const s = normalizedScores[id] ?? 50;
      const w = varWeights[id] ?? eq;
      total  += w * s;
      wsum   += w;
    }
    return wsum > 0 ? total / wsum : 50;
  }

  // ── Main Score ───────────────────────────────────────────────

  /**
   * FULL PIPELINE: fetch → normalize → dimension scores → M1 / M2 / M3 → output
   *
   * @param {string}  ticker      asset identifier passed to your fetch functions
   * @param {string}  assetClass  key in ASSET_CLASS_CONFIGS
   * @param {object}  opts
   *   opts.penalties         override asset class default penalties
   *                          { liq, tail, dq, struct } each [0.6, 1.0]
   *                          → use computePenaltyLiq/Tail/DQ/Struct() to compute these
   *   opts.qualityMults      { [dimId]: number [0,1] }  per-dim data quality
   *                          → use computeDimQuality() to compute these
   *   opts.RA                relative attractiveness [0,100] (peer percentile rank)
   *                          → DATA: cross-sectional rank in your peer universe
   *   opts.alpha             Model 1 blending coeff (default 0.70)
   *   opts.useCache          use cached result if available (default true)
   *   opts.rawData           pass raw data directly (skip fetch, e.g. for backtests)
   *
   * @returns {Promise<ScoringResult>}
   */
  async score(ticker, assetClass, opts = {}) {
    const cacheKey = `${ticker}::${assetClass}::${this.regime}`;
    if (opts.useCache !== false && this._scoreCache[cacheKey]) {
      return this._scoreCache[cacheKey];
    }

    const config = ASSET_CLASS_CONFIGS[assetClass];
    if (!config) throw new Error(`Unknown asset class: ${assetClass}`);

    // ── Step 1: Fetch raw data from all connected sources
    let rawData = opts.rawData || {};
    if (!opts.rawData) {
      for (const src of Object.values(this._sources)) {
        try {
          const data = await src.fetch(ticker);
          Object.assign(rawData, data);
        } catch (e) {
          // source failed — continue with other sources, missing vars → score 50
        }
      }
    }

    // ── Step 2: Normalize each variable to [0, 100]
    const normalized = this.normalizeAll(rawData);

    // ── Step 3: Dimension scores
    const dimScores  = {};
    const baseWeights = {};
    const dimDetails  = {};

    for (const dim of config.dims) {
      const score        = this._dimensionScore(dim.vars, normalized);
      dimScores[dim.id]  = score;
      baseWeights[dim.id] = dim.weight;
      dimDetails[dim.id]  = {
        label:      dim.label,
        score,
        baseWeight: dim.weight,
        adjWeight:  null,  // filled after regime calc
        vars: dim.vars.map(v => ({
          id:         v,
          raw:        rawData[v],         // ← raw value from your data source
          normalized: normalized[v] ?? 50,
          meta:       VAR_META[v] || null,
        })),
      };
    }

    // Fill adjWeights for reporting
    const adjW = applyRegime(baseWeights, this.regime);
    for (const [k, d] of Object.entries(dimDetails)) d.adjWeight = adjW[k] || 0;

    // ── Step 4: Penalties
    const penalties = { ...config.penalties, ...(opts.penalties || {}) };

    // ── Step 5: Quality multipliers
    const qualityMults = opts.qualityMults || {};

    // ── Step 6: Apply three models
    const m1Score = model1(dimScores, baseWeights, qualityMults, this.regime, opts.RA ?? 50, opts.alpha ?? 0.70);
    const m2Score = model2(dimScores, baseWeights, this.regime);
    const { AS, CAS } = model3(dimScores, baseWeights, this.regime, penalties);

    // ── Step 7: Consensus (average of three models)
    const consensus = (m1Score + m2Score + CAS) / 3;

    // ── Step 8: Rating
    const rating     = scoreToRating(consensus);
    const avgDQ      = Object.values(qualityMults).length > 0
      ? Object.values(qualityMults).reduce((a, b) => a + b, 0) / Object.values(qualityMults).length
      : 1.0;
    const confidence = confidenceTier(avgDQ);

    const result = {
      ticker,
      assetClass,
      assetClassLabel: config.label,
      regime:          this.regime,

      // ── Scores
      m1:       m1Score,       // Model 1 final score
      m2:       m2Score,       // Model 2 UARS
      m3AS:     AS,            // Model 3 base asset score
      m3CAS:    CAS,           // Model 3 composite (after penalties)
      consensus,               // average of M1, M2, M3 CAS

      // ── Classification
      rating,
      confidence,

      // ── Breakdown
      dimScores,               // { [dimId]: number }
      dimDetails,              // { [dimId]: { label, score, adjWeight, vars[] } }
      baseWeights,
      adjWeights:  adjW,
      penalties,
      qualityMults,

      // ── Raw data passthrough (for display in your terminal)
      rawData,
      normalized,
    };

    this._scoreCache[cacheKey] = result;
    return result;
  }

  /**
   * Score multiple assets
   * @param {Array<{ ticker: string, assetClass: string, opts?: object }>} assets
   * @returns {Promise<ScoringResult[]>}
   */
  async scoreMany(assets) {
    return Promise.all(assets.map(a => this.score(a.ticker, a.assetClass, a.opts || {})));
  }

  /**
   * Score an asset with raw data already normalized (skip normalization step)
   * Use for backtesting / unit tests
   *
   * @param {string}  ticker
   * @param {string}  assetClass
   * @param {{ [varId]: number }} normalizedScores  already in [0,100]
   * @param {object}  opts
   */
  scoreFromNormalized(ticker, assetClass, normalizedScores, opts = {}) {
    const config = ASSET_CLASS_CONFIGS[assetClass];
    if (!config) throw new Error(`Unknown asset class: ${assetClass}`);

    const dimScores   = {};
    const baseWeights = {};
    for (const dim of config.dims) {
      dimScores[dim.id]   = this._dimensionScore(dim.vars, normalizedScores);
      baseWeights[dim.id] = dim.weight;
    }
    const penalties    = { ...config.penalties, ...(opts.penalties || {}) };
    const qualityMults = opts.qualityMults || {};

    const m1Score      = model1(dimScores, baseWeights, qualityMults, this.regime, opts.RA ?? 50, opts.alpha ?? 0.70);
    const m2Score      = model2(dimScores, baseWeights, this.regime);
    const { AS, CAS }  = model3(dimScores, baseWeights, this.regime, penalties);
    const consensus    = (m1Score + m2Score + CAS) / 3;

    return { ticker, assetClass, regime: this.regime, m1: m1Score, m2: m2Score, m3AS: AS, m3CAS: CAS, consensus, rating: scoreToRating(consensus), dimScores, baseWeights };
  }

  // ── Utilities ────────────────────────────────────────────────

  clearCache() { this._scoreCache = {}; }

  getAssetClassConfig(assetClass) { return ASSET_CLASS_CONFIGS[assetClass]; }

  listAssetClasses() { return Object.keys(ASSET_CLASS_CONFIGS); }

  listVariables(assetClass) {
    const cfg = ASSET_CLASS_CONFIGS[assetClass];
    if (!cfg) return [];
    return [...new Set(cfg.dims.flatMap(d => d.vars))];
  }

  creditToNumeric(rating, lambda = 0.5) {
    return creditToNumeric(rating, lambda);
  }

  computePenalties({ amihudRatio, amihudLo, amihudHi, var99, es97, maxDD, missingPct, stalePct, lowCovPct, isETF, trackingError, isCFD, cfdRisk } = {}) {
    return {
      liq:    computePenaltyLiq(amihudRatio ?? 0, amihudLo ?? 0, amihudHi ?? 1e-6),
      tail:   computePenaltyTail(var99 ?? 0, es97 ?? 0, maxDD ?? 0),
      dq:     computePenaltyDQ(missingPct ?? 0, stalePct ?? 0, lowCovPct ?? 0),
      struct: computePenaltyStruct({ isETF, trackingError, isCFD, cfdProviderRisk: cfdRisk }),
    };
  }

  computeDimQuality(missingRate, staleness, outliers) {
    return computeDimQuality(missingRate, staleness, outliers);
  }
}


// ============================================================
//  11. EXPORTS
//      For terminal widget integration:
//        - CommonJS:  const { UARSEngine } = require('./uars_engine');
//        - ESM:       import { UARSEngine } from './uars_engine.js';
//        - Browser:   window.UARSEngine (auto-exposed below)
// ============================================================

const UARS = {
  // Main class
  UARSEngine,

  // Exposed helpers (useful for custom terminal display logic)
  scoreToRating,
  confidenceTier,
  creditToNumeric,
  computePenaltyLiq,
  computePenaltyTail,
  computePenaltyDQ,
  computePenaltyStruct,
  computeDimQuality,
  ewmaSmooth,
  applyRegime,

  // Metadata (useful for building variable inspection panels)
  VAR_META,
  ASSET_CLASS_CONFIGS,
  REGIME_MULT,
  CREDIT_TABLE,

  // Normalization operators (if you need to call them directly)
  Norm,
};

// CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UARS;
}

// ESM
// export { UARSEngine, scoreToRating, VAR_META, ASSET_CLASS_CONFIGS, ... };

// Browser global
if (typeof window !== 'undefined') {
  window.UARS = UARS;
}
