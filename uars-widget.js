/* ══════════════════════════════════════════════════════════════════
   FINTERM — uars-widget.js
   Phase 3: Widget Replacement
   ──────────────────────────────────────────────────────────────────
   Replaces the entire "Analysts & Valuation" panel with 4 tabs:
     Tab 1 — OVERVIEW  : Consensus + KPIs + dimension chart + verdict
     Tab 2 — MODEL 1   : UScore formula + variable table + Q details
     Tab 3 — MODEL 2   : UARS formula + interactive regime selector
     Tab 4 — MODEL 3   : CAS formula + penalty cards + waterfall

   Entry point:
     window.uarsLoadForTicker(ticker)
       Called on every changeTicker(). Fire-and-forget.

   Dependencies (must be loaded before this file):
     uars_engine.js
     valuation-data.js
     valuation-missing-sources.js
     valuation-datasources.js
     uars-source-connector.js
     uars-peer-builder.js
   ══════════════════════════════════════════════════════════════════ */

'use strict';

/* ── State ───────────────────────────────────────────────────────── */
let _uarsCurrentTicker = null;
let _uarsLastResult    = null;   /* last engine.score() result */
let _uarsActiveTab     = 'overview';

/* ── Helpers ─────────────────────────────────────────────────────── */
function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function _f(n, d = 2) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function _fPct(n, d = 1) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return sign + _f(n, d) + '%';
}

/** Score → CSS colour class */
function _scoreClass(score) {
  if (score >= 90) return 'uars-c-exceptional';
  if (score >= 80) return 'uars-c-veryattractive';
  if (score >= 70) return 'uars-c-attractive';
  if (score >= 60) return 'uars-c-neutral';
  if (score >= 50) return 'uars-c-weak';
  return 'uars-c-unattractive';
}

/** Score → bar fill colour */
function _scoreColor(score) {
  if (score >= 80) return '#3fb950';
  if (score >= 70) return '#4a9eff';
  if (score >= 60) return '#d29922';
  if (score >= 50) return '#f0883e';
  return '#f85149';
}

/** Penalty value → class */
function _penaltyClass(p) {
  if (p >= 0.98) return 'full';
  if (p >= 0.85) return 'warn';
  return 'low';
}

/** Confidence tier → badge class */
function _confClass(tier) {
  if (tier === 'HIGH')   return 'uars-conf-high';
  if (tier === 'MEDIUM') return 'uars-conf-medium';
  return 'uars-conf-low';
}

/** Raw value → human-readable with unit */
function _rawFmt(varId, rawValue) {
  if (rawValue === null || rawValue === undefined) return '—';
  const v = parseFloat(rawValue);
  if (isNaN(v)) return '—';

  /* Add units based on variable category */
  if (varId.includes('_GROWTH_') || varId.includes('_YIELD_') ||
      varId.includes('_MARGIN_') || varId.includes('_ROE_') ||
      varId.includes('_ROIC_') || varId.includes('_VOL_') ||
      varId.includes('MKT_MOM_') || varId.includes('_RETURN_') ||
      varId.includes('_DOWNSIDE_') || varId.includes('FACTOR_')) {
    return _f(v, 1) + '%';
  }
  if (varId.includes('_BPS')) return _f(v, 0) + ' bps';
  if (varId.includes('_DOLLAR_VOL_')) return _fmtB(v);
  return _f(v, 2);
}

function _fmtB(n) {
  if (!n || isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e12) return '$' + (n/1e12).toFixed(1) + 'T';
  if (a >= 1e9)  return '$' + (n/1e9).toFixed(1)  + 'B';
  if (a >= 1e6)  return '$' + (n/1e6).toFixed(1)  + 'M';
  return '$' + n.toLocaleString();
}


/* ══════════════════════════════════════════════════════════════════
   WIDGET SHELL
   Injects the 4-tab structure into #panel-analysts
══════════════════════════════════════════════════════════════════ */

function _injectWidgetShell() {
  const panel = document.getElementById('panel-analysts');
  if (!panel) return;

  /* ── Target the static mount point in index.html ──────────────────
     index.html uses #uars-widget-mount as the placeholder div (no
     .tab-bar / .tab-pane exist here). Clear it and inject the full
     4-tab shell directly. If the shell was already injected (e.g.
     a second DOMContentLoaded call), bail early.                   */
  const mount = document.getElementById('uars-widget-mount');
  if (!mount) return;
  if (mount.querySelector('.uars-tab-bar')) return; // already injected

  mount.style.cssText = 'flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0;';
  mount.innerHTML = `
    <div class="uars-tab-bar">
      <button class="uars-tab-btn active" data-utab="overview" onclick="uarsSwitchTab('overview')">OVERVIEW</button>
      <button class="uars-tab-btn"        data-utab="model1"   onclick="uarsSwitchTab('model1')">MODEL 1</button>
      <button class="uars-tab-btn"        data-utab="model2"   onclick="uarsSwitchTab('model2')">MODEL 2</button>
      <button class="uars-tab-btn"        data-utab="model3"   onclick="uarsSwitchTab('model3')">MODEL 3</button>
    </div>
    <div style="flex:1;overflow:hidden;display:flex;flex-direction:column;">
      <div id="uars-pane-overview" class="uars-pane active">
        <div class="uars-loading"><div class="uars-spinner"></div><span>Loading UARS…</span></div>
      </div>
      <div id="uars-pane-model1"  class="uars-pane"></div>
      <div id="uars-pane-model2"  class="uars-pane"></div>
      <div id="uars-pane-model3"  class="uars-pane"></div>
    </div>`;
}

/** Public: switch UARS tab */
window.uarsSwitchTab = function uarsSwitchTab(tabId) {
  _uarsActiveTab = tabId;
  const mount = document.getElementById('uars-widget-mount');
  if (!mount) return;

  mount.querySelectorAll('.uars-tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.utab === tabId)
  );
  ['overview','model1','model2','model3'].forEach(id => {
    const pane = document.getElementById(`uars-pane-${id}`);
    if (pane) pane.classList.toggle('active', id === tabId);
  });

  /* If switching to a model tab and we have a result, render it */
  if (_uarsLastResult && tabId !== 'overview') {
    _renderModelTab(tabId, _uarsLastResult);
  }
};


/* ══════════════════════════════════════════════════════════════════
   MAIN ENTRY POINT
   uarsLoadForTicker(ticker)
   Called by changeTicker patch. Non-blocking.
══════════════════════════════════════════════════════════════════ */

window.uarsLoadForTicker = async function uarsLoadForTicker(ticker) {
  if (!ticker) return;
  const sym = ticker.replace(/.*:/, '').toUpperCase();
  _uarsCurrentTicker = ticker;

  const engine = window.uarsEngine;
  if (!engine) {
    /* Engine not yet initialised — retry once it's available (up to 3s) */
    let waited = 0;
    const interval = setInterval(() => {
      waited += 100;
      if (window.uarsEngine) {
        clearInterval(interval);
        if (_uarsCurrentTicker === ticker) {
          window.uarsLoadForTicker(ticker);
        }
      } else if (waited >= 3000) {
        clearInterval(interval);
        console.warn('[UARS Widget] Engine not ready after 3s — ensure uars-source-connector.js is loaded.');
        _showError(sym, 'Engine failed to initialise.');
      }
    }, 100);
    return;
  }

  /* Show loading state */
  _showLoading(sym);

  /* ── Step 1: Ensure valuation data is assembled ── */
  if (typeof assembleValuationData === 'function') {
    await assembleValuationData(ticker).catch(() => {});
  }
  if (typeof enrichValuationData === 'function') {
    enrichValuationData(ticker).catch(() => {});   /* non-blocking */
  }

  /* ── Step 2: Detect asset class + sync regime ── */
  const assetClass  = typeof uarsDetectAssetClass === 'function'
    ? uarsDetectAssetClass(ticker) : 'equities';
  const regime      = typeof uarsSyncRegime === 'function'
    ? uarsSyncRegime() : 'expansion';

  /* ── Step 3: Build peer groups (fire-and-forget with onReady callback) ── */
  let RA = 50;
  if (typeof uarsBuildPeerGroups === 'function') {
    uarsBuildPeerGroups(ticker, {
      assetClass,
      onReady: async (computedRA) => {
        /* Re-score with live peers and re-render */
        if (_uarsCurrentTicker !== ticker) return;
        try {
          engine.clearCache();
          const reResult = await _score(ticker, assetClass, computedRA);
          if (reResult && _uarsCurrentTicker === ticker) {
            _uarsLastResult = reResult;
            _renderAll(reResult, sym);
          }
        } catch (_) { /* silent */ }
      },
    }).catch(() => {});
  }

  /* ── Step 4: Build raw data + penalties ── */
  const rawData  = typeof uarsBuildRawData === 'function'
    ? await uarsBuildRawData(ticker).catch(() => ({})) : {};
  const penalties = typeof uarsBuildPenalties === 'function'
    ? uarsBuildPenalties(ticker) : { liq:1, tail:1, dq:1, struct:1 };
  const qualityMults = typeof uarsBuildQualityMults === 'function'
    ? uarsBuildQualityMults(ticker, assetClass, rawData) : {};

  /* ── Step 5: Score ── */
  const result = await _score(ticker, assetClass, RA, rawData, penalties, qualityMults);
  if (!result) {
    _showError(sym, 'Scoring failed — check API keys.');
    return;
  }

  /* Guard: ticker may have changed while we were awaiting */
  if (_uarsCurrentTicker !== ticker) return;

  _uarsLastResult = result;
  _renderAll(result, sym);
};

/** Internal: run the full engine.score() pipeline */
async function _score(ticker, assetClass, RA = 50, rawData, penalties, qualityMults) {
  const engine = window.uarsEngine;
  if (!engine) return null;
  try {
    return await engine.score(ticker, assetClass, {
      rawData,
      penalties,
      qualityMults,
      RA,
      alpha: assetClass === 'crypto' ? 0.80 : assetClass === 'corpBonds' ? 0.60 : 0.70,
      useCache: false,
    });
  } catch (e) {
    console.warn('[UARS Widget] engine.score() error:', e.message);
    return null;
  }
}


/* ══════════════════════════════════════════════════════════════════
   RENDER ALL TABS
══════════════════════════════════════════════════════════════════ */

function _renderAll(result, sym) {
  _renderOverview(result, sym);
  /* Model tabs render on demand when tab is clicked (or already active) */
  if (_uarsActiveTab !== 'overview') {
    _renderModelTab(_uarsActiveTab, result);
  }
}


/* ══════════════════════════════════════════════════════════════════
   TAB 1 — OVERVIEW
══════════════════════════════════════════════════════════════════ */

function _renderOverview(result, sym) {
  const el = document.getElementById('uars-pane-overview');
  if (!el) return;

  const consensus  = result.consensus;
  const rating     = result.rating;
  const conf       = result.confidence;
  const regime     = result.regime;
  const dimDetails = result.dimDetails || {};
  const adjW       = result.adjWeights || {};
  const vd         = window._valuationData?.[sym] || {};
  const f          = vd.fundamentals || {};
  const m          = vd.market       || {};
  const r          = vd.riskMetrics  || {};
  const macro      = vd.macroSensitivity || {};

  /* ── Section A: Consensus ── */
  const barColor  = _scoreColor(consensus);
  const scoreClass= _scoreClass(consensus);

  const consensusHtml = `
    <div class="uars-consensus-block">
      <div class="uars-consensus-header">
        <span class="uars-consensus-score ${scoreClass}">${Math.round(consensus)}</span>
        <div>
          <div class="uars-consensus-label ${scoreClass}">${_esc(rating.label)}</div>
          <div class="uars-consensus-rec">${_esc(rating.recommendation)}</div>
        </div>
        <span class="uars-regime-tag">${_esc(regime)}</span>
      </div>
      <div class="uars-consensus-bar-track">
        <div class="uars-consensus-bar-fill" style="width:${consensus}%;background:${barColor}"></div>
      </div>
      <div class="uars-consensus-scale">
        <span>0 Unattractive</span><span>50 Neutral</span><span>100 Exceptional</span>
      </div>
      <div class="uars-confidence-row">
        <span class="uars-confidence-badge ${_confClass(conf)}">${_esc(conf)}</span>
        <span>confidence · band ${_esc(rating.band)}</span>
      </div>
    </div>`;

  /* ── Section B: Three model badges ── */
  const models = [
    { id:'M1', label:'Model 1', score: result.m1,   desc:'Quality-weighted UScore blended with peer rank (RA)' },
    { id:'M2', label:'Model 2', score: result.m2,   desc:'UARS regime-adjusted weighted dimension score' },
    { id:'M3', label:'Model 3', score: result.m3CAS,desc:'Composite with liquidity, tail-risk & data-quality penalties' },
  ];

  const badgesHtml = `
    <div class="uars-model-badges">
      ${models.map(mod => {
        const c = _scoreColor(mod.score);
        return `
          <div class="uars-model-badge" onclick="uarsSwitchTab('${mod.id === 'M1' ? 'model1' : mod.id === 'M2' ? 'model2' : 'model3'}');_renderModelTab(_uarsActiveTab,_uarsLastResult)" style="cursor:pointer">
            <div class="uars-model-badge-name">${_esc(mod.label)}</div>
            <div class="uars-model-badge-score ${_scoreClass(mod.score)}">${Math.round(mod.score)}</div>
            <div class="uars-model-badge-bar">
              <div class="uars-model-badge-bar-fill" style="width:${mod.score}%;background:${c}"></div>
            </div>
            <div class="uars-model-badge-desc">${_esc(mod.desc)}</div>
          </div>`;
      }).join('')}
    </div>`;

  /* ── Section C: Key Investor Metrics ── */
  const rawData  = result.rawData || {};
  const fmpLive  = typeof fmpGetLive === 'function' ? fmpGetLive(sym) : null;
  const fhLive   = typeof fhGetLive  === 'function' ? fhGetLive(sym)  : null;
  const ratios   = fmpLive?.ratios || {};
  const quote    = fhLive?.quote   || {};
  const profile  = fhLive?.profile || {};

  const _tile = (label, value, cls = '') => `
    <div class="uars-kpi-tile ${cls}">
      <div class="uars-kpi-label">${_esc(label)}</div>
      <div class="uars-kpi-value">${_esc(value)}</div>
    </div>`;

  const _v = (val, d = 2) => (val !== null && val !== undefined && !isNaN(val)) ? _f(val, d) : '—';
  const _pctV = (val, d = 1) => (val !== null && val !== undefined && !isNaN(val)) ? _f(val * (Math.abs(val) <= 1 ? 100 : 1), d) + '%' : '—';
  const _xV   = (val, d = 2) => (val !== null && val !== undefined && !isNaN(val)) ? _f(val, d) + 'x' : '—';

  /* Colour helpers for KPI tiles */
  const _numCls = (val, goodPositive = true) => {
    if (val === null || val === undefined || isNaN(val)) return '';
    return (goodPositive ? val >= 0 : val <= 0) ? 'pos' : 'neg';
  };

  const pe      = ratios.pe      ?? f.peRatio     ?? null;
  const pb      = ratios.pb      ?? f.pbRatio     ?? null;
  const evEb    = ratios.evEbitda?? f.evToEbitda  ?? null;
  const roe     = ratios.roe     ?? (f.roe   !== null ? (Math.abs(f.roe   ?? 0) > 1 ? f.roe   : (f.roe   ?? 0) * 100) : null);
  const opMgn   = ratios.operMgn ?? (f.operatingMargin !== null ? (Math.abs(f.operatingMargin ?? 0) > 1 ? f.operatingMargin : (f.operatingMargin ?? 0) * 100) : null);
  const fcfY    = ratios.fcfYield?? (f.fcfYield !== null ? (Math.abs(f.fcfYield ?? 0) > 1 ? f.fcfYield : (f.fcfYield ?? 0) * 100) : null);
  const divY    = ratios.divYield?? (f.divYield !== null ? (Math.abs(f.divYield ?? 0) > 1 ? f.divYield : (f.divYield ?? 0) * 100) : null);
  const revGr   = f.revenueGrowth   !== null ? (Math.abs(f.revenueGrowth ?? 0) > 1 ? f.revenueGrowth   : (f.revenueGrowth   ?? 0) * 100) : null;
  const epsGr   = f.epsGrowth       !== null ? (Math.abs(f.epsGrowth     ?? 0) > 1 ? f.epsGrowth       : (f.epsGrowth       ?? 0) * 100) : null;
  const de      = ratios.debtEq  ?? f.debtToEquity  ?? null;
  const ic      = f.interestCoverage ?? null;
  const beta    = m.beta         ?? null;
  const mom1M   = m.mom1M        !== null ? (Math.abs(m.mom1M ?? 0) > 1 ? m.mom1M  : (m.mom1M  ?? 0) * 100) : null;
  const mom12M  = m.mom12M       !== null ? (Math.abs(m.mom12M?? 0) > 1 ? m.mom12M : (m.mom12M ?? 0) * 100) : null;
  const sharpe  = r.sharpe12M    ?? null;
  const vol30D  = m.vol30D       !== null ? (Math.abs(m.vol30D ?? 0) > 1 ? m.vol30D : (m.vol30D ?? 0) * 100) : null;
  const maxDD   = m.maxDrawdown12M !== null ? (Math.abs(m.maxDrawdown12M ?? 0) > 1 ? m.maxDrawdown12M : (m.maxDrawdown12M ?? 0) * 100) : null;
  const vixVal  = window._vixLive?.current ?? null;
  const yc10Y2Y = window._treasuryYields
    ? ((window._treasuryYields['10Y'] || 0) - (window._treasuryYields['2Y'] || 0))
    : null;
  const creditScore = vd.creditQuality?.numericScore ?? null;

  const kpiHtml = `
    <div class="uars-section-head">Key Metrics</div>
    <div class="uars-kpi-grid">
      ${_tile('P/E Ratio',     pe    !== null ? _f(pe, 1)+'x'    : '—')}
      ${_tile('EV/EBITDA',     evEb  !== null ? _f(evEb, 1)+'x'  : '—')}
      ${_tile('P/B Ratio',     pb    !== null ? _f(pb, 2)+'x'    : '—')}
      ${_tile('Rev Growth',    revGr !== null ? (revGr >= 0 ? '+' : '') + _f(revGr, 1) + '%' : '—', _numCls(revGr))}
      ${_tile('EPS Growth',    epsGr !== null ? (epsGr >= 0 ? '+' : '') + _f(epsGr, 1) + '%' : '—', _numCls(epsGr))}
      ${_tile('Op Margin',     opMgn !== null ? _f(opMgn, 1) + '%' : '—', _numCls(opMgn))}
      ${_tile('ROE',           roe   !== null ? _f(roe, 1) + '%'  : '—', _numCls(roe))}
      ${_tile('FCF Yield',     fcfY  !== null ? _f(fcfY, 2) + '%' : '—', _numCls(fcfY))}
      ${_tile('Div Yield',     divY  !== null ? _f(divY, 2) + '%' : '—')}
      ${_tile('Beta 250D',     beta  !== null ? _f(beta, 2)       : '—', beta !== null ? (beta > 1.5 ? 'warn' : beta > 0 ? '' : 'pos') : '')}
      ${_tile('1M Return',     mom1M !== null ? (mom1M >= 0 ? '+' : '') + _f(mom1M, 1) + '%' : '—', _numCls(mom1M))}
      ${_tile('12M Return',    mom12M!== null ? (mom12M >= 0 ? '+' : '') + _f(mom12M, 1) + '%' : '—', _numCls(mom12M))}
      ${_tile('Sharpe 12M',    sharpe!== null ? _f(sharpe, 2)     : '—', _numCls(sharpe))}
      ${_tile('Vol 30D',       vol30D!== null ? _f(vol30D, 1) + '%': '—', vol30D !== null ? (vol30D > 50 ? 'neg' : vol30D > 30 ? 'warn' : '') : '')}
      ${_tile('Max DD 12M',    maxDD !== null ? _f(maxDD, 1) + '%' : '—', _numCls(maxDD, false))}
      ${_tile('Debt/Equity',   de    !== null ? _f(de, 2) + 'x'  : '—', de !== null ? (de > 3 ? 'neg' : de > 1 ? 'warn' : 'pos') : '')}
      ${_tile('Int Coverage',  ic    !== null ? _f(ic, 1) + 'x'  : '—', ic !== null ? (ic > 5 ? 'pos' : ic > 2 ? 'warn' : 'neg') : '')}
      ${_tile('Credit Score',  creditScore !== null ? Math.round(creditScore) + '/100' : '—')}
      ${_tile('VIX',           vixVal   !== null ? _f(vixVal, 1)     : '—', vixVal !== null ? (vixVal > 30 ? 'neg' : vixVal > 20 ? 'warn' : 'pos') : '')}
      ${_tile('10Y-2Y Spread', yc10Y2Y  !== null ? (yc10Y2Y >= 0 ? '+' : '') + _f(yc10Y2Y, 2) + '%' : '—', yc10Y2Y !== null ? (yc10Y2Y < 0 ? 'neg' : 'pos') : '')}
    </div>`;

  /* ── Section D: Dimension bar chart ── */
  const dims = Object.values(dimDetails);
  const dimChartHtml = dims.length ? `
    <div class="uars-section-head">Dimension Scores</div>
    <div class="uars-dim-chart">
      ${dims.map(d => {
        const score = Math.round(d.score);
        const adj   = d.adjWeight || 0;
        const base  = d.baseWeight || 0;
        const changed = Math.abs(adj - base) > 0.005;
        const color = _scoreColor(score);
        return `
          <div class="uars-dim-row">
            <div class="uars-dim-label" title="${_esc(d.label)}">${_esc(d.label)}</div>
            <div class="uars-dim-bar-track">
              <div class="uars-dim-bar-fill" style="width:${score}%;background:${color}"></div>
            </div>
            <div class="uars-dim-score ${_scoreClass(score)}">${score}</div>
            <div class="uars-dim-weight ${changed ? 'uars-weight-changed' : 'uars-weight-same'}">
              ${Math.round(adj * 100)}%
            </div>
          </div>`;
      }).join('')}
    </div>` : '';

  /* ── Section E: Verdict bullets ── */
  const sortedDims  = [...dims].sort((a, b) => b.score - a.score);
  const strongest   = sortedDims[0];
  const weakest     = sortedDims[sortedDims.length - 1];
  const regimeStr   = result.regime || 'Expansion';

  /* Find dimensions that shifted most vs baseline */
  const biggestShift = dims
    .filter(d => d.adjWeight && d.baseWeight)
    .sort((a, b) => Math.abs(b.adjWeight - b.baseWeight) - Math.abs(a.adjWeight - a.baseWeight))[0];

  const verdictHtml = `
    <div class="uars-section-head">Verdict</div>
    <div class="uars-verdict">
      <div class="uars-verdict-item">
        <span class="uars-verdict-icon">✅</span>
        <span><strong>Strongest:</strong> ${_esc(strongest?.label || '—')} scored ${Math.round(strongest?.score || 0)}/100 — ${_verdictText(strongest?.label, strongest?.score)}</span>
      </div>
      <div class="uars-verdict-item">
        <span class="uars-verdict-icon">⚠️</span>
        <span><strong>Watch:</strong> ${_esc(weakest?.label || '—')} scored ${Math.round(weakest?.score || 0)}/100 — ${_verdictText(weakest?.label, weakest?.score)}</span>
      </div>
      <div class="uars-verdict-item">
        <span class="uars-verdict-icon">📊</span>
        <span><strong>Regime (${_esc(regimeStr)}):</strong> ${biggestShift
          ? `${_esc(biggestShift.label)} weight shifted from ${Math.round(biggestShift.baseWeight*100)}% → ${Math.round(biggestShift.adjWeight*100)}%`
          : 'No significant weight adjustments in current regime.'}</span>
      </div>
    </div>`;

  el.innerHTML = consensusHtml + badgesHtml + kpiHtml + dimChartHtml + verdictHtml;
}

/** Generate a plain-language insight for a dimension */
function _verdictText(dimLabel, score) {
  if (!dimLabel || score === undefined) return '—';
  const s = Math.round(score);
  const map = {
    'Valuation':     s >= 70 ? 'attractively priced vs peers'   : s >= 50 ? 'fairly valued'           : 'appears expensive vs peers',
    'Growth':        s >= 70 ? 'strong earnings momentum'        : s >= 50 ? 'moderate growth'          : 'growth is slowing or negative',
    'Profitability': s >= 70 ? 'high-quality earnings power'     : s >= 50 ? 'acceptable margins'        : 'margins under pressure',
    'Quality':       s >= 70 ? 'solid balance sheet strength'    : s >= 50 ? 'moderate leverage'         : 'elevated debt or coverage risk',
    'Momentum':      s >= 70 ? 'positive price trend'            : s >= 50 ? 'mixed price signals'        : 'negative price momentum',
    'Risk':          s >= 70 ? 'low volatility risk-adjusted'    : s >= 50 ? 'moderate risk profile'      : 'high volatility or drawdown',
    'Liquidity':     s >= 70 ? 'highly liquid'                   : s >= 50 ? 'adequate trading depth'     : 'thin trading volume',
    'Macro':         s >= 70 ? 'well-aligned to current regime'  : s >= 50 ? 'neutral macro sensitivity'  : 'exposed to current macro headwinds',
    'Credit':        s >= 70 ? 'strong credit quality'           : s >= 50 ? 'investment-grade proxy'     : 'elevated default risk',
  };
  return map[dimLabel] || (s >= 70 ? 'above average' : s >= 50 ? 'near average' : 'below average');
}


/* ══════════════════════════════════════════════════════════════════
   TABS 2 / 3 / 4 — MODEL DETAIL
══════════════════════════════════════════════════════════════════ */

function _renderModelTab(tabId, result) {
  if (tabId === 'model1') _renderModel1(result);
  else if (tabId === 'model2') _renderModel2(result);
  else if (tabId === 'model3') _renderModel3(result);
}

/* ── Shared: dimension table ──────────────────────────────────────── */
function _dimTable(result, opts = {}) {
  const { showQ = false, showLambda = false, showPenalties = false } = opts;
  const dimDetails = result.dimDetails || {};
  const adjW       = result.adjWeights || {};
  const rawData    = result.rawData    || {};
  const normalized = result.normalized || {};
  const regime     = result.regime;
  const REGIME_MULT = window.UARS?.REGIME_MULT || {};
  const regimeMults = REGIME_MULT[regime] || {};

  /* Extra header columns */
  const extraTh = showQ
    ? '<th title="Data quality multiplier Q [0–1]">Q Mult</th><th>Contribution</th>'
    : showLambda
    ? '<th title="Regime Λ multiplier from REGIME_MULT">Λ Mult</th><th>Contribution</th>'
    : '<th>Contribution</th>';

  const rows = Object.values(dimDetails).map(d => {
    const base  = d.baseWeight || 0;
    const adj   = adjW[d.id]   || 0;
    const score = d.score      || 0;
    const q     = showQ ? (result.qualityMults?.[d.id] ?? 1.0) : 1.0;
    const lam   = regimeMults[d.id] || 1.0;
    const contrib = showQ
      ? (adj * score * q).toFixed(1)
      : (adj * score).toFixed(1);

    const weightChanged = Math.abs(adj - base) > 0.005;

    /* Variable detail rows */
    const varRows = d.vars.map(vObj => {
      const raw  = rawData[vObj.id]    ?? null;
      const norm = normalized[vObj.id] ?? null;
      const meta = window.UARS?.VAR_META?.[vObj.id] || {};
      return `
        <tr class="uars-var-row" id="vrow-${d.id}">
          <td colspan="2" class="uars-var-id">${_esc(vObj.id)}</td>
          <td class="uars-var-raw">${_esc(_rawFmt(vObj.id, raw))}</td>
          <td class="uars-var-norm">
            <div class="uars-score-cell">
              <div class="uars-score-mini-bar"><div class="uars-score-mini-fill" style="width:${norm ?? 50}%;background:${_scoreColor(norm ?? 50)}"></div></div>
              <span class="${_scoreClass(norm ?? 50)}">${norm !== null ? Math.round(norm) : '—'}</span>
            </div>
          </td>
          <td><span class="uars-op-badge">${_esc(meta.op || '—')}</span></td>
          <td colspan="3">dir: ${_esc(meta.dir || '—')}</td>
        </tr>`;
    }).join('');

    const extraTd = showQ
      ? `<td>${_f(q, 2)}</td><td class="${_scoreClass(parseFloat(contrib))}">${contrib}</td>`
      : showLambda
      ? `<td>${_f(lam, 2)}</td><td class="${_scoreClass(parseFloat(contrib))}">${contrib}</td>`
      : `<td class="${_scoreClass(parseFloat(contrib))}">${contrib}</td>`;

    return `
      <tr>
        <td class="uars-td-dim">
          <button class="uars-expand-btn" onclick="uarsToggleVars('${_esc(d.id)}')" title="Show variables">▶</button>
          ${_esc(d.label)}
        </td>
        <td class="uars-td-vars">${d.vars.map(v => v.id.replace(/^(FUND_|MKT_|RISK_|CRED_|MACRO_|FACTOR_|SPEC_)/,'')).join(', ')}</td>
        <td colspan="3">—</td>
        <td>
          <div class="uars-score-cell">
            <div class="uars-score-mini-bar"><div class="uars-score-mini-fill" style="width:${score}%;background:${_scoreColor(score)}"></div></div>
            <span class="uars-score-num ${_scoreClass(score)}">${Math.round(score)}</span>
          </div>
        </td>
        <td class="${weightChanged ? 'uars-weight-changed' : 'uars-weight-same'}">${Math.round(base*100)}%</td>
        <td class="${weightChanged ? 'uars-weight-changed' : 'uars-weight-same'}">${Math.round(adj*100)}%</td>
        ${extraTd}
      </tr>
      <tbody class="uars-var-rows" id="vrows-${_esc(d.id)}">${varRows}</tbody>`;
  }).join('');

  return `
    <div class="uars-dim-table-wrap">
      <table class="uars-dim-table">
        <thead>
          <tr>
            <th>Dimension</th>
            <th>Variables</th>
            <th colspan="3">— (expand for var detail)</th>
            <th>Dim Score</th>
            <th>Base W</th>
            <th>Adj W</th>
            ${extraTh}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr class="uars-total-row">
            <td colspan="5"><strong>TOTAL</strong></td>
            <td>—</td>
            <td>100%</td>
            <td>100%</td>
            <td colspan="2"><strong>${_f(opts.finalScore ?? result.consensus, 1)}</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>`;
}

/** Toggle variable detail rows for a dimension */
window.uarsToggleVars = function uarsToggleVars(dimId) {
  const tbody = document.getElementById(`vrows-${dimId}`);
  if (!tbody) return;
  const expanded = tbody.classList.toggle('expanded');
  /* Update button icon */
  const btn = document.querySelector(`button[onclick="uarsToggleVars('${dimId}')"]`);
  if (btn) btn.textContent = expanded ? '▼' : '▶';
};

/* ── TAB 2 — MODEL 1 ──────────────────────────────────────────────── */
function _renderModel1(result) {
  const el = document.getElementById('uars-pane-model1');
  if (!el || !result) return;

  const m1    = result.m1;
  const RA    = result.rawData?.RA ?? 50;
  const alpha = 0.70;
  const rating = window.UARS?.scoreToRating?.(m1) || result.rating;

  const dqWarnings = Object.entries(result.qualityMults || {})
    .filter(([, q]) => q < 0.9)
    .map(([dim, q]) => `${dim}: Q=${_f(q,2)}`);

  el.innerHTML = `
    <div class="uars-formula-block">
      FinalScore = α · UScore + (1−α) · RA
      <div class="uars-formula-desc">
        α=${alpha} · UScore = Σ W<sub>d,c,r</sub> · S<sub>d</sub> · Q<sub>d</sub>
        &nbsp;|&nbsp; RA = peer percentile rank
      </div>
    </div>
    <div class="uars-model-score-header">
      <div class="uars-msh-score ${_scoreClass(m1)}">${Math.round(m1)}</div>
      <div>
        <div class="uars-msh-label ${_scoreClass(m1)}">${_esc(rating.label)}</div>
        <div class="uars-msh-rec">${_esc(rating.recommendation)}</div>
      </div>
      <div style="margin-left:auto;font-size:10px;color:var(--color-text-muted)">
        UScore × ${alpha} + RA(${Math.round(RA)}) × ${1-alpha}
      </div>
    </div>
    ${dqWarnings.length ? `
      <div class="uars-dq-row">
        <span class="uars-dq-item">⚠ Low quality dims:</span>
        ${dqWarnings.map(w => `<span class="uars-dq-item uars-dq-warn">${_esc(w)}</span>`).join('')}
      </div>` : ''}
    ${_dimTable(result, { showQ: true, finalScore: m1 })}
    <div class="uars-dq-row" style="margin-top:6px">
      <div class="uars-dq-item">Relative Attractiveness (RA): <span class="uars-dq-val">${Math.round(RA)}/100</span></div>
      <div class="uars-dq-item">α blend: <span class="uars-dq-val">${alpha}</span></div>
      <div class="uars-dq-item">Coverage: <span class="uars-dq-val">${Math.round((window._valuationData?.[result.ticker]?.coverage?.coverageRatio ?? 0) * 100)}%</span></div>
    </div>`;
}

/* ── TAB 3 — MODEL 2 ──────────────────────────────────────────────── */
function _renderModel2(result) {
  const el = document.getElementById('uars-pane-model2');
  if (!el || !result) return;

  const m2    = result.m2;
  const rating = window.UARS?.scoreToRating?.(m2) || result.rating;
  const VALID_REGIMES = ['expansion','inflation','latecycle','crisis','creditstress'];

  const regimeBtns = VALID_REGIMES.map(r => `
    <button class="uars-regime-btn ${r === result.regime ? 'active' : ''}"
            onclick="uarsRescore2('${r}')">
      ${_esc(r)}
    </button>`).join('');

  el.innerHTML = `
    <div class="uars-formula-block">
      UARS = Σ<sub>i</sub> w<sub>i</sub>(regime) · D<sub>i</sub>
      <div class="uars-formula-desc">
        w<sub>i</sub>(r) = W<sub>base,i</sub> × Λ<sub>i,r</sub> / Σ(W<sub>base</sub> × Λ) &nbsp;|&nbsp; Regime: <strong>${_esc(result.regime)}</strong>
      </div>
    </div>
    <div class="uars-section-head" style="margin-bottom:5px">Interactive Regime</div>
    <div class="uars-regime-selector">${regimeBtns}</div>
    <div class="uars-model-score-header" id="uars-m2-header">
      <div class="uars-msh-score ${_scoreClass(m2)}" id="uars-m2-score">${Math.round(m2)}</div>
      <div>
        <div class="uars-msh-label ${_scoreClass(m2)}" id="uars-m2-label">${_esc(rating.label)}</div>
        <div class="uars-msh-rec" id="uars-m2-rec">${_esc(rating.recommendation)}</div>
      </div>
      <div style="margin-left:auto;font-size:9px;color:var(--color-text-muted)">Click a regime to see weight shifts</div>
    </div>
    <div id="uars-m2-table">
      ${_dimTable(result, { showLambda: true, finalScore: m2 })}
    </div>`;
}

/** Re-score Model 2 with a new regime (client-side, no API call) */
window.uarsRescore2 = function uarsRescore2(newRegime) {
  if (!_uarsLastResult || !window.UARS) return;

  /* Update button states */
  document.querySelectorAll('.uars-regime-btn').forEach(b =>
    b.classList.toggle('active', b.textContent.trim() === newRegime)
  );

  /* Re-run model2() client-side */
  const { dimScores, baseWeights } = _uarsLastResult;
  const m2New = window.UARS.applyRegime
    ? (() => {
        const adjW = window.UARS.applyRegime(baseWeights, newRegime);
        let total = 0;
        for (const [k, s] of Object.entries(dimScores)) total += (adjW[k] || 0) * s;
        return Math.min(100, Math.max(0, total));
      })()
    : _uarsLastResult.m2;

  const rating = window.UARS.scoreToRating?.(m2New) || _uarsLastResult.rating;

  /* Update score header */
  const scoreEl = document.getElementById('uars-m2-score');
  const labelEl = document.getElementById('uars-m2-label');
  const recEl   = document.getElementById('uars-m2-rec');
  if (scoreEl) { scoreEl.textContent = Math.round(m2New); scoreEl.className = `uars-msh-score ${_scoreClass(m2New)}`; }
  if (labelEl) { labelEl.textContent = rating.label; labelEl.className = `uars-msh-label ${_scoreClass(m2New)}`; }
  if (recEl)   recEl.textContent = rating.recommendation;

  /* Re-build a fake result object with new regime for table re-render */
  const fakeResult = { ..._uarsLastResult, regime: newRegime, m2: m2New };
  const tableEl = document.getElementById('uars-m2-table');
  if (tableEl) tableEl.innerHTML = _dimTable(fakeResult, { showLambda: true, finalScore: m2New });
};

/* ── TAB 4 — MODEL 3 ──────────────────────────────────────────────── */
function _renderModel3(result) {
  const el = document.getElementById('uars-pane-model3');
  if (!el || !result) return;

  const AS    = result.m3AS;
  const CAS   = result.m3CAS;
  const pen   = result.penalties || { liq:1, tail:1, dq:1, struct:1 };
  const rating = window.UARS?.scoreToRating?.(CAS) || result.rating;
  const vd    = window._valuationData?.[result.ticker] || {};

  /* Penalty source descriptions */
  const liqDesc = (() => {
    const a = vd.liquidityMetrics?.amihud;
    return a !== null && a !== undefined
      ? `Amihud = ${_f(a, 6)} · avg$vol = ${_fmtB(vd.market?.avgDollarVol30D)}`
      : 'Amihud illiquidity ratio not available';
  })();
  const tailDesc = (() => {
    const v = vd.riskMetrics;
    if (!v) return 'Risk metrics not available';
    const va = v.var99_10D !== null ? Math.abs((Math.abs(v.var99_10D) > 1 ? v.var99_10D : v.var99_10D * 100)) : null;
    const es = v.es975_10D !== null ? Math.abs((Math.abs(v.es975_10D) > 1 ? v.es975_10D : v.es975_10D * 100)) : null;
    return `VaR 99% 10D: ${va !== null ? _f(va,1)+'%' : '—'} · ES 97.5%: ${es !== null ? _f(es,1)+'%' : '—'}`;
  })();
  const dqDesc = (() => {
    const cov = vd.coverage;
    if (!cov) return 'Coverage data not available';
    return `${cov.present}/${cov.total} vars present · missing: ${cov.missingFields?.slice(0,3).join(', ') || 'none'}`;
  })();
  const structDesc = (() => {
    const s = vd.structural;
    if (!s) return 'Plain equity — no structural penalty';
    if (s.isETF) return `ETF · tracking error: ${s.trackingError !== null ? _f(s.trackingError*100,2)+'%' : '—'}`;
    return 'Plain equity (P_struct = 1.0)';
  })();

  /* Waterfall */
  const wfSteps = [
    { label: 'AS', value: AS, cls: '' },
    { label: '×P_liq',   value: pen.liq,    cls: pen.liq   < 0.99 ? 'uars-wf-penalty' : '' },
    { label: '×P_tail',  value: pen.tail,   cls: pen.tail  < 0.99 ? 'uars-wf-penalty' : '' },
    { label: '×P_dq',    value: pen.dq,     cls: pen.dq    < 0.99 ? 'uars-wf-penalty' : '' },
    { label: '×P_struct',value: pen.struct, cls: pen.struct< 0.99 ? 'uars-wf-penalty' : '' },
    { label: '= CAS',    value: CAS, cls: 'uars-wf-final' },
  ];

  el.innerHTML = `
    <div class="uars-formula-block">
      CAS = AS · P_liq · P_tail · P_dq · P_struct
      <div class="uars-formula-desc">
        AS = Σ w<sub>k</sub>(c,r) · D<sub>k</sub> &nbsp;|&nbsp; Each P ∈ [0.6, 1.0]
      </div>
    </div>
    <div class="uars-model-score-header">
      <div style="display:flex;flex-direction:column;gap:2px">
        <div style="font-size:9px;color:var(--color-text-muted)">AS</div>
        <div style="font-size:20px;font-weight:800;font-variant-numeric:tabular-nums">${Math.round(AS)}</div>
      </div>
      <div style="font-size:16px;color:var(--color-text-muted);margin:auto 4px">→</div>
      <div class="uars-msh-score ${_scoreClass(CAS)}">${Math.round(CAS)}</div>
      <div>
        <div class="uars-msh-label ${_scoreClass(CAS)}">${_esc(rating.label)}</div>
        <div class="uars-msh-rec">${_esc(rating.recommendation)}</div>
      </div>
    </div>

    <div class="uars-section-head">Penalty Multipliers</div>
    <div class="uars-penalty-grid">
      ${[
        { name:'P_liq — Liquidity',    val: pen.liq,    desc: liqDesc },
        { name:'P_tail — Tail Risk',   val: pen.tail,   desc: tailDesc },
        { name:'P_dq — Data Quality',  val: pen.dq,     desc: dqDesc },
        { name:'P_struct — Structural',val: pen.struct, desc: structDesc },
      ].map(p => `
        <div class="uars-penalty-card">
          <div class="uars-penalty-name">${_esc(p.name)}</div>
          <div class="uars-penalty-value ${_penaltyClass(p.val)}">${_f(p.val, 4)}</div>
          <div class="uars-penalty-source">${_esc(p.desc)}</div>
        </div>`).join('')}
    </div>

    <div class="uars-section-head">Score Waterfall</div>
    <div class="uars-waterfall">
      ${wfSteps.map((s, i) => `
        ${i > 0 ? '<span class="uars-wf-arrow">→</span>' : ''}
        <div class="uars-wf-step">
          <div class="uars-wf-label">${_esc(s.label)}</div>
          <div class="uars-wf-value ${s.cls}">${
            s.label.startsWith('×') || s.label.startsWith('=')
              ? _f(s.value, s.label.startsWith('=') ? 1 : 4)
              : Math.round(s.value)
          }</div>
        </div>`).join('')}
    </div>

    ${_dimTable(result, { finalScore: CAS })}`;
}


/* ══════════════════════════════════════════════════════════════════
   UTILITY: LOADING / ERROR STATES
══════════════════════════════════════════════════════════════════ */

function _showLoading(sym) {
  const el = document.getElementById('uars-pane-overview');
  if (el) el.innerHTML = `
    <div class="uars-loading">
      <div class="uars-spinner"></div>
      <span>Loading UARS scores for ${_esc(sym)}…</span>
    </div>`;
}

function _showError(sym, msg) {
  const el = document.getElementById('uars-pane-overview');
  if (el) el.innerHTML = `
    <div class="uars-no-data">
      // ${_esc(msg)}<br>
      // Ticker: <strong>${_esc(sym)}</strong><br>
      // Check that FMP + Finnhub keys are configured.
    </div>`;
}


/* ══════════════════════════════════════════════════════════════════
   INIT & CHANGERTICKER PATCH
══════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  /* ── Inject widget shell into #uars-widget-mount ── */
  _injectWidgetShell();


  /* ── Override renderScorecard to be a no-op ──
     The original renderScorecard() wrote to #analysts-score which no
     longer exists. Replacing it prevents any JS errors from the
     existing changeTicker call in script.js.                       */
  window.renderScorecard = function (ticker) {
    /* No-op — UARS widget handles this panel now */
    if (ticker && ticker !== _uarsCurrentTicker) {
      uarsLoadForTicker(ticker);
    }
  };

  /* ── Signal ready to uars-integration.js queue ──────────────────
     This flushes any calls that arrived before DOMContentLoaded
     (e.g. from uars-integration.js safety net or changeTicker).
     Must be called AFTER _injectWidgetShell() so the pane DOM
     exists when uarsLoadForTicker() runs.                         */
  if (typeof window._uarsSignalReady === 'function') {
    window._uarsSignalReady();
  } else {
    /* Integration script not loaded yet — auto-load directly */
    const t = typeof currentTicker !== 'undefined' ? currentTicker : 'AAPL';
    if (t) uarsLoadForTicker(t);
  }


  console.info('[UARS Widget] Loaded — #uars-widget-mount replaced with 4-tab UARS widget.');
});
