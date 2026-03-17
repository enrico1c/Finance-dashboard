/* ══════════════════════════════════════════════════════════════════
   FINTERM — uars-integration.js
   Phase 4: Integration & Wiring
   ──────────────────────────────────────────────────────────────────
   This is the SINGLE file that completes Phase 4.
   It does NOT replace any existing file — it is added as the LAST
   script tag before </body> and handles everything in one place.

   What it does:
     4.1  Defines/exposes fhGetLive() — the missing global getter
          that script.js and finterm-extras.js call but finnhub.js
          never formally exports.

     4.2  Exposes window.uarsLoadForTicker as the verified entry point
          with a safe guard so it only fires once uars-widget.js is ready.

     4.3  Patches changeTicker() — one canonical patch at the end of
          the chain so UARS always fires after all other loaders.
          Designed to be idempotent (checks _uars_patched flag).

     4.4  Patches renderScorecard() — prevents the old scorecard from
          writing to a div that no longer exists.

     4.5  Asset class detection bridge — exposes detectAssetClass()
          as a safe global fallback if valuation-datasources.js has
          not yet defined it.

     4.6  fhGetLive / sector helper — exposes the Finnhub profile
          sector string needed by uars-peer-builder.js.

     4.7  sw.js update message — sends SKIP_WAITING to the service
          worker so the new UARS files are picked up immediately
          without the user needing to reload twice.

     4.8  Auto-init — wires everything on DOMContentLoaded and
          triggers the first UARS load for the initial ticker.

   Load order (add LAST, after uars-widget.js):
     ...existing scripts...
     valuation-datasources.js
     valuation-data.js
     valuation-missing-sources.js   ← new file from Phase 0
     uars_engine.js                 ← new file
     uars-source-connector.js       ← Phase 1
     uars-peer-builder.js           ← Phase 2
     uars-widget.js                 ← Phase 3
     uars-widget.css                ← Phase 3 (in <head>)
     uars-integration.js            ← this file (Phase 4)
   ══════════════════════════════════════════════════════════════════ */

'use strict';

/* ══════════════════════════════════════════════════════════════════
   4.1 — fhGetLive() — Finnhub live cache getter
   ──────────────────────────────────────────────────────────────────
   finnhub.js defines `fhLiveCache` and populates it inside
   `finnhubLoadAll()` but never exports a getter function.
   script.js, finterm-extras.js, and uars-widget.js all call
   `fhGetLive(sym)` — define it here once, globally.
══════════════════════════════════════════════════════════════════ */
if (typeof window.fhGetLive !== 'function') {
  window.fhGetLive = function fhGetLive(sym) {
    if (!sym) return null;
    const key = sym.replace(/.*:/, '').toUpperCase();
    /* fhLiveCache is declared in finnhub.js as a const in module scope.
       Access it through the module's own reference if available,
       otherwise fall back to scanning window for the cache object. */
    if (typeof fhLiveCache !== 'undefined') {
      return fhLiveCache[key] || null;
    }
    /* Secondary fallback: finnhub.js sometimes stores under window._fhLive */
    if (window._fhLive) return window._fhLive[key] || null;
    return null;
  };
}


/* ══════════════════════════════════════════════════════════════════
   4.2 — Safe entry-point guard
   ──────────────────────────────────────────────────────────────────
   uars-widget.js defines window.uarsLoadForTicker on DOMContentLoaded.
   If something calls it before the widget is ready, queue the call
   and replay it once the widget is live.
══════════════════════════════════════════════════════════════════ */
const _uarsQueue = [];
let   _uarsWidgetReady = false;

/* Called by uars-widget.js DOMContentLoaded listener when it's done */
window._uarsSignalReady = function _uarsSignalReady() {
  _uarsWidgetReady = true;
  /* Flush any queued calls */
  while (_uarsQueue.length) {
    const ticker = _uarsQueue.shift();
    if (ticker && typeof window.uarsLoadForTicker === 'function') {
      window.uarsLoadForTicker(ticker).catch(() => {});
    }
  }
};

/* Safe wrapper — the widget calls this version everywhere */
window.uarsSafeLoad = function uarsSafeLoad(ticker) {
  if (!ticker) return;
  if (_uarsWidgetReady && typeof window.uarsLoadForTicker === 'function') {
    window.uarsLoadForTicker(ticker).catch(() => {});
  } else {
    /* Queue — will fire when widget signals ready */
    _uarsQueue.push(ticker);
  }
};


/* ══════════════════════════════════════════════════════════════════
   4.3 — Canonical changeTicker() patch
   ──────────────────────────────────────────────────────────────────
   Multiple files patch changeTicker() (finnhub.js line 914,
   valuation-data.js, openfigi.js, valuation-missing-sources.js,
   uars-widget.js). This file applies the FINAL patch at the end of
   the chain. It checks for the _uars_patched sentinel so it is
   idempotent even if index.html loads this script twice.
══════════════════════════════════════════════════════════════════ */
function _applyChangeTickerPatch() {
  /* Guard: only patch once */
  if (window.changeTicker?._uars_integration_patched) return;

  const _prev = typeof window.changeTicker === 'function'
    ? window.changeTicker
    : null;

  window.changeTicker = function changeTicker_uars() {
    /* Call previous chain */
    if (_prev) _prev.apply(this, arguments);

    /* Determine ticker from argument or input field */
    const raw = (typeof arguments[0] === 'string' && arguments[0])
      || document.getElementById('tickerInput')?.value?.trim()
      || (typeof window.currentTicker !== 'undefined' ? window.currentTicker : null);

    if (!raw) return;

    /* Fire UARS load after a short delay so all other loaders start first */
    setTimeout(() => uarsSafeLoad(raw), 1200);
  };

  window.changeTicker._uars_integration_patched = true;
}


/* ══════════════════════════════════════════════════════════════════
   4.4 — renderScorecard() safe override
   ──────────────────────────────────────────────────────────────────
   The original renderScorecard() in script.js writes to
   #analysts-score. uars-widget.js removed that div.
   This ensures zero JS errors from the changeTicker call at
   script.js line 1654 that invokes renderScorecard(ticker).
══════════════════════════════════════════════════════════════════ */
function _patchRenderScorecard() {
  /* Only override if it hasn't already been overridden by uars-widget.js */
  const existing = window.renderScorecard;
  if (existing && existing._uars_overridden) return;

  window.renderScorecard = function renderScorecard_uars(ticker) {
    /* Delegate to UARS safe loader */
    if (ticker) uarsSafeLoad(ticker);
  };
  window.renderScorecard._uars_overridden = true;
}


/* ══════════════════════════════════════════════════════════════════
   4.5 — Asset class detection bridge
   ──────────────────────────────────────────────────────────────────
   valuation-datasources.js defines detectAssetClass() but may not
   have loaded yet when uars-source-connector.js first calls it.
   Expose a safe global that delegates to the real function once
   available, otherwise uses a minimal heuristic.
══════════════════════════════════════════════════════════════════ */
if (typeof window.detectAssetClass !== 'function') {
  window.detectAssetClass = function detectAssetClass_bridge(ticker) {
    /* If valuation-datasources.js has loaded by now, use the real one */
    if (typeof window._detectAssetClassReal === 'function') {
      return window._detectAssetClassReal(ticker);
    }

    /* Minimal heuristic fallback */
    if (!ticker) return 'equity';
    const raw = ticker.toUpperCase();
    const sym = raw.replace(/.*:/, '');

    const CRYPTO_SET = new Set([
      'BTC','ETH','BNB','SOL','XRP','ADA','AVAX','DOGE','DOT','LINK',
      'MATIC','UNI','AAVE','CRV','MKR','COMP','LDO','ARB','OP',
    ]);
    const ETF_SET = new Set([
      'SPY','QQQ','IVV','VOO','VTI','AGG','BND','TLT','LQD','HYG',
      'GLD','SLV','USO','XLF','XLE','XLK','XLV','ARKK',
    ]);
    const REIT_SET = new Set([
      'O','NNN','VICI','AMT','CCI','EQIX','PLD','PSA','EXR','AVB',
    ]);

    if (CRYPTO_SET.has(sym))               return 'crypto';
    if (ETF_SET.has(sym))                  return 'etf';
    if (REIT_SET.has(sym))                 return 'reit';
    if (/^[A-Z]{6}$/.test(sym))           return 'fx';
    if (raw.startsWith('FX:'))             return 'fx';
    if (raw.startsWith('CRYPTO:'))         return 'crypto';
    if (raw.startsWith('BOND:'))           return 'bond';

    return 'equity';
  };
}

/* Once valuation-datasources.js loads, store the real function */
(function _bridgeWatchdog() {
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    /* valuation-datasources.js exposes detectAssetClass via window */
    if (typeof detectAssetClass === 'function' &&
        detectAssetClass !== window.detectAssetClass) {
      window._detectAssetClassReal = detectAssetClass;
    }
    if (attempts > 20) clearInterval(interval);
  }, 500);
})();


/* ══════════════════════════════════════════════════════════════════
   4.6 — Sector helper for uars-peer-builder.js
   ──────────────────────────────────────────────────────────────────
   uars-peer-builder.js calls _getSectorFromCache() internally, but
   exposes a window-level helper here for convenience and robustness.
══════════════════════════════════════════════════════════════════ */

/**
 * window.uarsGetSector(sym)
 * Returns the sector string for a ticker from the best available source.
 * Tries (in order): fhLiveCache profile, _valuationData, sessionStorage.
 *
 * @param {string} sym  bare ticker e.g. 'AAPL'
 * @returns {string|null}
 */
window.uarsGetSector = function uarsGetSector(sym) {
  if (!sym) return null;
  const key = sym.replace(/.*:/, '').toUpperCase();

  /* 1. Finnhub live cache — most accurate */
  const fhLive = typeof window.fhGetLive === 'function' ? window.fhGetLive(key) : null;
  if (fhLive?.profile?.sector)          return fhLive.profile.sector;
  if (fhLive?.profile?.finnhubIndustry) return fhLive.profile.finnhubIndustry;

  /* 2. valuation-data.js assembled object */
  const vd = window._valuationData?.[key];
  if (vd?.sector) return vd.sector;

  /* 3. sessionStorage Finnhub profile cache */
  try {
    const fhKey = (typeof getFinnhubKey === 'function') ? getFinnhubKey() : '';
    if (fhKey) {
      const cacheKey = `fh_https://finnhub.io/api/v1/stock/profile2?symbol=${key}&token=${fhKey}`;
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        const data = JSON.parse(raw);
        if (data?.finnhubIndustry) return data.finnhubIndustry;
      }
    }
  } catch (_) { /* continue */ }

  /* 4. FMP live cache */
  const fmpLive = typeof fmpGetLive === 'function' ? fmpGetLive(key) : null;
  if (fmpLive?.profile?.sector) return fmpLive.profile.sector;

  return null;
};


/* ══════════════════════════════════════════════════════════════════
   4.7 — Service Worker update
   ──────────────────────────────────────────────────────────────────
   Tell the service worker to skip waiting so the new UARS JS files
   are activated immediately (avoids stale-cache on first load).
══════════════════════════════════════════════════════════════════ */
function _swSkipWaiting() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then(reg => {
    if (reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }).catch(() => { /* sw not registered yet — no-op */ });
}


/* ══════════════════════════════════════════════════════════════════
   4.8 — AUTO-INIT
   DOMContentLoaded: apply all patches and trigger first load.
══════════════════════════════════════════════════════════════════ */
function _uarsIntegrationInit() {

  /* 1. Apply changeTicker patch (idempotent) */
  _applyChangeTickerPatch();

  /* 2. Apply renderScorecard override */
  _patchRenderScorecard();

  /* 3. Signal service worker */
  _swSkipWaiting();

  /* 4. Wait for uars-widget.js to signal ready, then trigger first load.
        uars-widget.js calls window._uarsSignalReady() at the end of its
        DOMContentLoaded listener. If it has already fired (unlikely but
        possible in deferred-load scenarios), call directly. */
  const _triggerFirstLoad = () => {
    const ticker = typeof window.currentTicker !== 'undefined'
      ? window.currentTicker
      : document.getElementById('tickerInput')?.value?.trim()
      || 'AAPL';
    uarsSafeLoad(ticker);
  };

  /* Monkey-patch _uarsSignalReady so we can hook into it */
  const _origSignal = window._uarsSignalReady;
  window._uarsSignalReady = function () {
    if (typeof _origSignal === 'function') _origSignal();
    _triggerFirstLoad();
  };

  /* Safety net: if widget never signals (e.g. load error), fire anyway */
  setTimeout(() => {
    if (!_uarsWidgetReady) {
      _uarsWidgetReady = true;   /* force-unblock queue */
      while (_uarsQueue.length) {
        const t = _uarsQueue.shift();
        if (t && typeof window.uarsLoadForTicker === 'function') {
          window.uarsLoadForTicker(t).catch(() => {});
        }
      }
      _triggerFirstLoad();
    }
  }, 6000);   /* 6s safety net */

  console.info('[UARS Integration] Phase 4 wired — changeTicker patched, fhGetLive exposed.');
}

/* ── Run on DOM ready ─────────────────────────────────────────────── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _uarsIntegrationInit);
} else {
  /* DOM already parsed (deferred scripts) */
  setTimeout(_uarsIntegrationInit, 0);
}
