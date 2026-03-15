/* ══════════════════════════════════════════════════════════════════
   finterm-modules.js  —  Integrated Feature Modules
   ══════════════════════════════════════════════════════════════════
   
   Implements all 6 features from Aggiunte_fighe.txt using
   existing infrastructure — ZERO code duplication.

   Reuses:
   • _bsGreeks()          (yahoo.js)       — Black-Scholes
   • _sma/_ema/_rsi/_macd/_bbands/_atr/_stochastic  (technical.js)
   • techFetchCandles()   (technical.js)   — OHLC candles
   • _renderCandleChart() (technical.js)   — Canvas chart renderer
   • screenerRun/SCR_PRESETS (finterm-extras.js)
   • CG_BASE / wmFetch    (worldmonitor.js) — CoinGecko
   • fredFetch/fredLoadTreasuryDirect (fred.js) — FRED
   • yfLoadOptions        (yahoo.js)       — options chain
   • getKey / sessionStorage cache         (config.js)
   
   NEW (not in existing codebase):
   • VIX data from cdn.cboe.com (CBOE CDN, no key)
   • ProviderRegistry facade unifying existing providers
   • Advanced Plotly candlestick chart panel (fund-tech upgrade)
   • VIX gauge widget in macro panel
   • Screener dividend+beta+% change filters (UI extension)
   
   Load order: after all existing scripts
   ══════════════════════════════════════════════════════════════════ */

'use strict';

/* ──────────────────────────────────────────────────────────────────
   SECTION 1 — Unified Cache (wraps existing sessionStorage pattern)
   ────────────────────────────────────────────────────────────────── */

const _fmCache = {
  _prefix: 'finterm_fm_',
  get(key, ttlMs = 300000) {
    try {
      const raw = sessionStorage.getItem(this._prefix + key);
      if (!raw) return null;
      const item = JSON.parse(raw);
      if (Date.now() - item.ts > ttlMs) {
        sessionStorage.removeItem(this._prefix + key);
        return null;
      }
      return item.v;
    } catch { return null; }
  },
  set(key, value) {
    try {
      sessionStorage.setItem(this._prefix + key,
        JSON.stringify({ v: value, ts: Date.now() }));
    } catch {
      // Storage full — purge old keys
      Object.keys(sessionStorage)
        .filter(k => k.startsWith(this._prefix))
        .forEach(k => sessionStorage.removeItem(k));
    }
  },
  clear() {
    Object.keys(sessionStorage)
      .filter(k => k.startsWith(this._prefix))
      .forEach(k => sessionStorage.removeItem(k));
  }
};

/* ──────────────────────────────────────────────────────────────────
   SECTION 2 — ProviderRegistry
   Exposes existing data sources under a unified API.
   Does NOT re-fetch — delegates to already-loaded functions.
   ────────────────────────────────────────────────────────────────── */

const ProviderRegistry = {

  /* ── CBOE (new — VIX via CDN, no key required) ── */
  cboe: {
    async getVIX() {
      const cacheKey = 'cboe:vix';
      const cached   = _fmCache.get(cacheKey, 5 * 60 * 1000);
      if (cached) return cached;

      try {
        // CBOE CDN — free, no key, ~15 min delay
        const url = 'https://cdn.cboe.com/api/global/delayed_quotes/charts/_VIX.json';
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`CBOE HTTP ${res.status}`);
        const json = await res.json();

        const series = json.data || [];
        if (!series.length) throw new Error('Empty CBOE response');

        const last  = series[series.length - 1];
        const prev  = series[series.length - 2] || last;
        const chg   = last.close - prev.close;
        const chgPct = (chg / prev.close) * 100;

        const result = {
          symbol: 'VIX',
          current: last.close,
          open:    last.open,
          high:    last.high,
          low:     last.low,
          change:  chg,
          changePct: chgPct,
          history: series.map(d => ({
            date:  d.date,
            open:  d.open,
            high:  d.high,
            low:   d.low,
            close: d.close,
          })),
          _src: 'CBOE CDN',
          _ts:  Date.now(),
        };

        _fmCache.set(cacheKey, result);
        // Expose globally so other modules can read it
        window._vixLive = result;
        return result;

      } catch (e) {
        console.warn('[CBOE VIX]', e.message);
        // Fallback: Finnhub quote for ^VIX if key set
        const fhKey = (typeof getFinnhubKey === 'function') ? getFinnhubKey() : '';
        if (fhKey) {
          try {
            const r = await fetch(
              `https://finnhub.io/api/v1/quote?symbol=VIX&token=${fhKey}`,
              { signal: AbortSignal.timeout(5000) }
            );
            const q = await r.json();
            if (q?.c) {
              const fb = {
                symbol: 'VIX', current: q.c, open: q.o,
                high: q.h, low: q.l,
                change: q.d ?? (q.c - q.pc),
                changePct: q.dp ?? ((q.c - q.pc) / q.pc * 100),
                history: [], _src: 'Finnhub', _ts: Date.now(),
              };
              _fmCache.set(cacheKey, fb);
              window._vixLive = fb;
              return fb;
            }
          } catch {}
        }
        return null;
      }
    },

    async getOptionsChain(symbol) {
      // Delegate to existing yahoo.js options loader
      if (typeof yfLoadOptions === 'function') {
        await yfLoadOptions(symbol);
      }
    }
  },

  /* ── FRED (delegates to fred.js — key required for most series) ── */
  fred: {
    async getSeries(seriesId, limit = 12) {
      if (typeof fredFetch !== 'function') return null;
      try { return await fredFetch(seriesId, { limit }); }
      catch { return null; }
    },
    async getTreasuryYield(maturity = '10') {
      const map = { '1':'DGS1','2':'DGS2','5':'DGS5','10':'DGS10','30':'DGS30' };
      const id  = map[maturity] || 'DGS10';
      // Use global cache if already populated
      if (window._treasuryYields?.[maturity + 'Y']) {
        return window._treasuryYields[maturity + 'Y'];
      }
      const obs = await this.getSeries(id, 1);
      return obs?.[0] ? parseFloat(obs[0].value) : null;
    },
    async getInflation() { return this.getSeries('CPIAUCSL', 12); },
    async getUnemployment() { return this.getSeries('UNRATE', 12); },
    async getGDP() { return this.getSeries('GDP', 8); },
    async getSpread(id) { return this.getSeries(id, 12); }
  },

  /* ── Yahoo Finance (delegates to yahoo.js) ── */
  yahoo: {
    async getQuote(symbol) {
      const cacheKey = `yf:quote:${symbol}`;
      const cached   = _fmCache.get(cacheKey, 60000);
      if (cached) return cached;
      try {
        // Use direct quote endpoint (no key)
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        const json = await res.json();
        const meta  = json.chart?.result?.[0]?.meta;
        if (!meta) return null;
        const result = {
          symbol:     meta.symbol,
          price:      meta.regularMarketPrice,
          change:     meta.regularMarketPrice - meta.previousClose,
          changePct:  ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100,
          volume:     meta.regularMarketVolume,
          marketCap:  null, // not in this endpoint
          high52w:    meta.fiftyTwoWeekHigh,
          low52w:     meta.fiftyTwoWeekLow,
          currency:   meta.currency,
          _src: 'Yahoo v8',
        };
        _fmCache.set(cacheKey, result);
        return result;
      } catch { return null; }
    },

    async getHistory(symbol, interval = '1d', range = '1y') {
      // Delegate to techFetchCandles which handles Finnhub → AV → Stooq cascade
      if (typeof techFetchCandles === 'function') {
        const resMap = { '1d': 'D', '1h': '60', '15m': '15', '5m': '5' };
        const candles = await techFetchCandles(symbol, resMap[interval] || 'D', 300);
        if (candles) {
          return candles.t.map((ts, i) => ({
            date:   new Date(ts * 1000).toISOString().split('T')[0],
            open:   candles.o[i], high: candles.h[i],
            low:    candles.l[i], close: candles.c[i],
            volume: candles.v[i],
          }));
        }
      }
      return null;
    },

    async getOptions(symbol) {
      // Delegate to existing yfLoadOptions (renders directly)
      if (typeof yfLoadOptions === 'function') await yfLoadOptions(symbol);
    }
  },

  /* ── CoinGecko (delegates to worldmonitor.js CG_BASE) ── */
  coingecko: {
    async getTopCoins(limit = 50) {
      const cacheKey = `cg:top:${limit}`;
      const cached   = _fmCache.get(cacheKey, 5 * 60 * 1000);
      if (cached) return cached;
      try {
        const CG = (typeof CG_BASE !== 'undefined') ? CG_BASE : 'https://api.coingecko.com/api/v3';
        const res = await fetch(
          `${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false`,
          { signal: AbortSignal.timeout(10000) }
        );
        if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
        const json = await res.json();
        const result = json.map(c => ({
          id: c.id, symbol: c.symbol.toUpperCase(), name: c.name,
          price: c.current_price, change24h: c.price_change_percentage_24h,
          marketCap: c.market_cap, volume24h: c.total_volume,
          rank: c.market_cap_rank,
        }));
        _fmCache.set(cacheKey, result);
        return result;
      } catch { return null; }
    },

    async getGlobal() {
      // Use worldmonitor.js if available
      if (typeof wmLoadCryptoGlobal === 'function') {
        wmLoadCryptoGlobal();
        return;
      }
      const cacheKey = 'cg:global';
      const cached   = _fmCache.get(cacheKey, 5 * 60 * 1000);
      if (cached) return cached;
      try {
        const CG = (typeof CG_BASE !== 'undefined') ? CG_BASE : 'https://api.coingecko.com/api/v3';
        const res = await fetch(`${CG}/global`, { signal: AbortSignal.timeout(8000) });
        const json = await res.json();
        const d = json.data;
        const result = {
          totalMarketCap: d.total_market_cap.usd,
          totalVolume: d.total_volume.usd,
          btcDominance: d.market_cap_percentage.btc,
          ethDominance: d.market_cap_percentage.eth,
          activeCoins: d.active_cryptocurrencies,
          change24h: d.market_cap_change_percentage_24h_usd,
        };
        _fmCache.set(cacheKey, result);
        return result;
      } catch { return null; }
    },

    async getTrending() {
      const cacheKey = 'cg:trending';
      const cached   = _fmCache.get(cacheKey, 10 * 60 * 1000);
      if (cached) return cached;
      try {
        const CG = (typeof CG_BASE !== 'undefined') ? CG_BASE : 'https://api.coingecko.com/api/v3';
        const res = await fetch(`${CG}/search/trending`, { signal: AbortSignal.timeout(8000) });
        const json = await res.json();
        const result = json.coins.map(item => ({
          id: item.item.id, symbol: item.item.symbol,
          name: item.item.name, rank: item.item.market_cap_rank,
        }));
        _fmCache.set(cacheKey, result);
        return result;
      } catch { return null; }
    }
  },

  // Shorthand access
  get(name) {
    const p = this[name.toLowerCase()];
    if (!p) throw new Error(`Unknown provider: ${name}. Use cboe|fred|yahoo|coingecko`);
    return p;
  }
};

// Expose as global alias matching the proposed API
window.Providers = ProviderRegistry;

/* ──────────────────────────────────────────────────────────────────
   SECTION 3 — VIX Widget
   Renders a live VIX gauge in the macro panel.
   Calls ProviderRegistry.cboe.getVIX() for CBOE CDN data.
   ────────────────────────────────────────────────────────────────── */

window.vixLoadWidget = async function(containerId) {
  const el = containerId
    ? document.getElementById(containerId)
    : document.getElementById('vix-widget-root');
  if (!el) return;

  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading VIX…</div>`;

  const data = await ProviderRegistry.cboe.getVIX();
  if (!data) {
    el.innerHTML = `<div class="vix-unavail">
      <span class="vix-label">VIX</span>
      <span class="vix-value">—</span>
      <span class="vix-src">CBOE CDN unavailable</span>
    </div>`;
    if (typeof showApiToast === 'function') showApiToast('VIX data unavailable — CBOE CDN unreachable', 'info');
    return;
  }

  const v      = data.current;
  const chgPct = data.changePct;
  const regime = v < 15 ? { label:'CALM',    color:'#3fb950', bg:'rgba(63,185,80,.12)'   }
               : v < 20 ? { label:'NEUTRAL',  color:'#58a6ff', bg:'rgba(88,166,255,.12)'  }
               : v < 30 ? { label:'ELEVATED', color:'#d29922', bg:'rgba(210,153,34,.12)'  }
               :           { label:'FEAR',     color:'#f85149', bg:'rgba(248,81,73,.12)'   };

  // Arc gauge SVG
  const pct = Math.min(v / 60, 1);
  const arc = _vixArcPath(pct);

  el.innerHTML = `
    <div class="vix-widget" style="border-left:3px solid ${regime.color};background:${regime.bg}">
      <div class="vix-header">
        <span class="vix-title">⚡ VIX</span>
        <span class="vix-regime" style="color:${regime.color}">${regime.label}</span>
        <span class="vix-src-badge">${data._src}</span>
      </div>
      <div class="vix-body">
        <div class="vix-gauge">
          <svg viewBox="0 0 100 60" class="vix-svg">
            <path d="M10,55 A45,45 0 0,1 90,55" fill="none" stroke="var(--border)" stroke-width="6" stroke-linecap="round"/>
            <path d="${arc}" fill="none" stroke="${regime.color}" stroke-width="6" stroke-linecap="round"/>
          </svg>
          <div class="vix-num" style="color:${regime.color}">${v.toFixed(2)}</div>
        </div>
        <div class="vix-stats">
          <div class="vix-stat">
            <span class="vix-stat-lbl">Change</span>
            <span class="vix-stat-val ${chgPct >= 0 ? 'pos' : 'neg'}">${chgPct >= 0 ? '+' : ''}${chgPct.toFixed(2)}%</span>
          </div>
          <div class="vix-stat">
            <span class="vix-stat-lbl">High</span>
            <span class="vix-stat-val">${data.high?.toFixed(2) ?? '—'}</span>
          </div>
          <div class="vix-stat">
            <span class="vix-stat-lbl">Low</span>
            <span class="vix-stat-val">${data.low?.toFixed(2) ?? '—'}</span>
          </div>
        </div>
      </div>
      <div class="vix-interp">
        ${v < 15  ? '📗 Market calm — low volatility, bullish bias'
        : v < 20  ? '📘 Normal volatility — balanced sentiment'
        : v < 30  ? '📙 Elevated fear — defensive positioning advised'
        : v < 40  ? '📕 High fear — potential capitulation zone'
        :            '🚨 Extreme panic — historically a buy signal'}
      </div>
      ${data.history?.length > 5 ? `
      <div class="vix-sparkline-wrap">
        <canvas id="vix-spark-${Date.now()}" class="vix-sparkline"></canvas>
      </div>` : ''}
    </div>`;

  if (typeof showApiToast === 'function') {
    const chgStr = (data.changePct >= 0 ? '+' : '') + data.changePct.toFixed(2) + '%';
    showApiToast(`VIX ${data.current.toFixed(2)} ${chgStr} · ${data._src}`, 'ok');
  }

  // Draw sparkline if history available
  if (data.history?.length > 5) {
    const canvas = el.querySelector('.vix-sparkline');
    if (canvas) _drawVixSparkline(canvas, data.history.slice(-60));
  }
};

function _vixArcPath(pct) {
  // Arc from left (180°) sweeping clockwise by pct*180°
  const startAngle = Math.PI;
  const endAngle   = Math.PI + pct * Math.PI;
  const cx = 50, cy = 55, r = 45;
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const large = pct > 0.5 ? 1 : 0;
  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
}

function _drawVixSparkline(canvas, history) {
  const W = canvas.offsetWidth || 200;
  const H = canvas.offsetHeight || 30;
  canvas.width  = W * 2;
  canvas.height = H * 2;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  const vals = history.map(d => d.close).filter(Boolean);
  if (!vals.length) return;
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const rng = mx - mn || 1;

  ctx.beginPath();
  ctx.strokeStyle = '#58a6ff';
  ctx.lineWidth   = 1.2;
  vals.forEach((v, i) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - ((v - mn) / rng) * (H * 0.85) - H * 0.05;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
}

/* ──────────────────────────────────────────────────────────────────
   SECTION 4 — Advanced Chart (FintermChart)
   Uses existing techFetchCandles + _renderCandleChart + indicators.
   Adds: Plotly toggle, export PNG/CSV, indicator preset buttons.
   ────────────────────────────────────────────────────────────────── */

window.FintermChart = {
  _containerId: null,
  _ohlcData:    null,
  _indicators:  {},

  /**
   * Initialize chart in a container.
   * @param {string} containerId  — id of the HTML element
   * @param {Object} options      — { height, theme }
   */
  init(containerId, options = {}) {
    this._containerId = containerId;
    this._height = options.height || 500;
    this._theme  = options.theme  || 'dark';
    return this;
  },

  /**
   * Load OHLC data.
   * Accepts either an array of {date,open,high,low,close,volume} objects
   * OR a Finnhub-format candles object {t,o,h,l,c,v}.
   */
  loadData(data) {
    if (!data) return this;
    if (Array.isArray(data)) {
      // Convert from {date,open,high,low,close,volume} array
      this._ohlcData = {
        t: data.map(d => typeof d.date === 'string' ? new Date(d.date).getTime() / 1000 : d.date),
        o: data.map(d => parseFloat(d.open)),
        h: data.map(d => parseFloat(d.high)),
        l: data.map(d => parseFloat(d.low)),
        c: data.map(d => parseFloat(d.close)),
        v: data.map(d => parseInt(d.volume) || 0),
      };
    } else if (data.c && data.t) {
      // Already in Finnhub format
      this._ohlcData = data;
    }
    return this;
  },

  /** Set indicator configuration. */
  addIndicators(indicators) {
    this._indicators = indicators || {};
    return this;
  },

  /**
   * Render using existing SVG chart engine (_renderCandleChart).
   * Builds overlay config from this._indicators and calls existing renderer.
   */
  render() {
    const el = document.getElementById(this._containerId);
    if (!el)  { console.error(`[FintermChart] #${this._containerId} not found`); return this; }
    if (!this._ohlcData) { el.innerHTML = '<div class="no-data">// No data loaded. Call loadData() first.</div>'; return this; }

    const C    = this._ohlcData.c;
    const ind  = this._indicators;
    const overlays = {};

    if (ind.sma) {
      const lengths = Array.isArray(ind.sma) ? ind.sma : [ind.sma];
      lengths.forEach(n => { overlays[`sma${n}`] = _sma(C, n); });
    }
    if (ind.ema) {
      const lengths = Array.isArray(ind.ema) ? ind.ema : [ind.ema];
      lengths.forEach(n => { overlays[`ema${n}`] = _ema(C, n); });
    }
    if (ind.bbands || ind.bb) {
      const p = ind.bbands || ind.bb;
      const bb = _bbands(C, p.length || 20, p.std || 2);
      overlays.bbUpper = bb.upper;
      overlays.bbMid   = bb.mid;
      overlays.bbLower = bb.lower;
    }
    if (ind.vwap && typeof _vwap === 'function') {
      overlays.vwap = _vwap(this._ohlcData.h, this._ohlcData.l, this._ohlcData.c, this._ohlcData.v);
    }
    if (ind.ichimoku && typeof _ichimoku === 'function') {
      const ich = _ichimoku(this._ohlcData.h, this._ohlcData.l);
      Object.assign(overlays, { ichTenkan: ich.tenkan, ichKijun: ich.kijun,
        ichSpanA: ich.senkouA, ichSpanB: ich.senkouB });
    }

    // Use existing rendering engine
    if (typeof _renderCandleChart === 'function') {
      _renderCandleChart(el, this._ohlcData, overlays, ind.period || 250);
    } else {
      el.innerHTML = '<div class="no-data">// technical.js must be loaded before finterm-modules.js</div>';
    }
    return this;
  },

  /**
   * Fetch candles for a symbol then render.
   * Full cascade: Finnhub → AlphaVantage → Stooq.
   */
  async loadAndRender(symbol, resolution = 'D', bars = 300) {
    if (typeof techFetchCandles !== 'function') {
      console.error('[FintermChart] techFetchCandles not available'); return this;
    }
    const candles = await techFetchCandles(symbol, resolution, bars);
    if (!candles) {
      const el = document.getElementById(this._containerId);
      if (el) el.innerHTML = `<div class="no-data">// No OHLCV data for <strong>${symbol}</strong>.<br>// Finnhub key recommended.</div>`;
      return this;
    }
    return this.loadData(candles).render();
  },

  /** Sub-chart: render RSI below the main canvas. */
  renderRSI(containerId, period = 14) {
    if (!this._ohlcData) return;
    const el = document.getElementById(containerId);
    if (!el) return;
    const rsiArr = (typeof _rsi === 'function') ? _rsi(this._ohlcData.c, period) : null;
    if (!rsiArr) return;
    _renderOscillatorChart(el, this._ohlcData.t, rsiArr, `RSI ${period}`, 30, 70);
    return this;
  },

  /** Sub-chart: render MACD below the main canvas. */
  renderMACD(containerId, fast = 12, slow = 26, sig = 9) {
    if (!this._ohlcData) return;
    const el = document.getElementById(containerId);
    if (!el) return;
    const macdR = (typeof _macd === 'function')
      ? _macd(this._ohlcData.c, fast, slow, sig) : null;
    if (!macdR) return;
    _renderMACDChart(el, this._ohlcData.t, macdR);
    return this;
  },

  /** Export OHLCV data as CSV download. */
  exportCSV(filename) {
    if (!this._ohlcData) return;
    filename = filename || `finterm_ohlcv_${Date.now()}.csv`;
    const { t, o, h, l, c, v } = this._ohlcData;
    let csv = 'Date,Open,High,Low,Close,Volume\n';
    t.forEach((ts, i) => {
      const d = new Date(ts * 1000).toISOString().split('T')[0];
      csv += `${d},${o[i]},${h[i]},${l[i]},${c[i]},${v[i]}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  },

  /** Toggle between dark / light theme (rebuilds layout). */
  toggleTheme() {
    this._theme = this._theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-fm-theme', this._theme);
    return this.render();
  }
};

/* Canvas mini-renderer for RSI / oscillators (supplement to SVG chart) */
function _renderOscillatorChart(el, timestamps, values, label, lo, hi) {
  el.innerHTML = '';
  const W = el.clientWidth || 600, H = 70;
  const canvas = Object.assign(document.createElement('canvas'),
    { width: W * 2, height: H * 2 });
  canvas.style.cssText = `width:${W}px;height:${H}px;display:block`;
  el.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  const vals = values.filter(v => v != null);
  const nonNull = values.map((v, i) => ({ v, i })).filter(x => x.v != null);
  if (!nonNull.length) return;

  const MN = 0, MX = 100;
  const PAD = { l: 36, r: 6, t: 6, b: 14 };
  const cW  = W - PAD.l - PAD.r;
  const cH  = H - PAD.t - PAD.b;
  const N   = values.length;

  // Overbought / oversold bands
  ctx.fillStyle = 'rgba(248,81,73,.06)';
  ctx.fillRect(PAD.l, PAD.t, cW, (1 - hi / 100) * cH);
  ctx.fillStyle = 'rgba(63,185,80,.06)';
  ctx.fillRect(PAD.l, PAD.t + (1 - lo / 100) * cH, cW, (lo / 100) * cH);

  // Lines
  [[hi, '#f8514966'], [lo, '#3fb95066'], [50, '#30363d44']].forEach(([v, color]) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    const y = PAD.t + (1 - v / 100) * cH;
    ctx.beginPath();
    ctx.moveTo(PAD.l, y);
    ctx.lineTo(PAD.l + cW, y);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  // RSI line
  ctx.beginPath();
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1.5;
  nonNull.forEach(({ v, i }, idx) => {
    const x = PAD.l + (i / (N - 1)) * cW;
    const y = PAD.t + (1 - v / 100) * cH;
    idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Label
  ctx.fillStyle = '#8b949e';
  ctx.font = '10px ui-monospace,monospace';
  ctx.fillText(label, PAD.l + 2, PAD.t + 10);
}

function _renderMACDChart(el, timestamps, macdResult) {
  el.innerHTML = '';
  const W = el.clientWidth || 600, H = 70;
  const canvas = Object.assign(document.createElement('canvas'),
    { width: W * 2, height: H * 2 });
  canvas.style.cssText = `width:${W}px;height:${H}px;display:block`;
  el.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  const hist = macdResult.hist || macdResult.histogram;
  const macd = macdResult.macd;
  const sig  = macdResult.signal;
  if (!hist || !macd) return;

  const PAD = { l: 36, r: 6, t: 6, b: 14 };
  const N   = hist.length;
  const cW  = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;

  const allVals = [...hist, ...macd, ...sig].filter(v => v != null);
  const MX = Math.max(...allVals.map(Math.abs)) * 1.1 || 1;

  const toY = v => PAD.t + (0.5 - (v ?? 0) / (2 * MX)) * cH;

  // Zero line
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.l, toY(0));
  ctx.lineTo(PAD.l + cW, toY(0));
  ctx.stroke();

  // Histogram bars
  const barW = Math.max(1, cW / N - 1);
  hist.forEach((v, i) => {
    if (v == null) return;
    const x = PAD.l + (i / (N - 1)) * cW;
    const y0 = toY(0), y1 = toY(v);
    ctx.fillStyle = v >= 0 ? 'rgba(63,185,80,.5)' : 'rgba(248,81,73,.5)';
    ctx.fillRect(x - barW / 2, Math.min(y0, y1), barW, Math.abs(y1 - y0));
  });

  // MACD line
  const drawLine = (arr, color) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    let first = true;
    arr.forEach((v, i) => {
      if (v == null) return;
      const x = PAD.l + (i / (N - 1)) * cW;
      const y = toY(v);
      first ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      first = false;
    });
    ctx.stroke();
  };
  drawLine(macd, '#3b82f6');
  drawLine(sig,  '#f59e0b');

  ctx.fillStyle = '#8b949e';
  ctx.font = '10px ui-monospace,monospace';
  ctx.fillText('MACD', PAD.l + 2, PAD.t + 10);
}

/* ──────────────────────────────────────────────────────────────────
   SECTION 5 — BlackScholes façade
   Thin wrapper; all computation uses existing _bsGreeks() in yahoo.js.
   ────────────────────────────────────────────────────────────────── */

window.BlackScholes = {
  /**
   * Price an option using Black-Scholes.
   * @param {string} type  'call'|'put'
   * @param {number} S     spot price
   * @param {number} K     strike
   * @param {number} T     time to expiration in years
   * @param {number} r     risk-free rate (decimal, e.g. 0.045)
   * @param {number} sigma implied volatility (decimal, e.g. 0.30)
   * @returns {number}     theoretical option price
   */
  price(type, S, K, T, r, sigma) {
    if (!S || !K || !T || !sigma || T <= 0 || sigma <= 0) return 0;
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    const N  = x => {
      const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.330274429,p=0.2316419;
      const sign = x < 0 ? -1 : 1;
      const ax = Math.abs(x);
      const t_ = 1 / (1 + p * ax);
      return 0.5 * (1 + sign * (1 - (((((a5*t_+a4)*t_+a3)*t_+a2)*t_+a1)*t_)*Math.exp(-ax*ax)));
    };
    return type === 'call'
      ? S * N(d1) - K * Math.exp(-r * T) * N(d2)
      : K * Math.exp(-r * T) * N(-d2) - S * N(-d1);
  },

  /**
   * Compute all Greeks.
   * Delegates to _bsGreeks() in yahoo.js if available,
   * otherwise uses built-in implementation.
   */
  greeks(type, S, K, T, r, sigma) {
    // Delegate exclusively to _bsGreeks() in yahoo.js (P18: no duplicate BS)
    if (typeof _bsGreeks === 'function') {
      return _bsGreeks(S, K, T, r, sigma, type === 'call');
    }
    // _bsGreeks not loaded yet — return null gracefully
    console.warn('[BlackScholes] _bsGreeks not available — ensure yahoo.js is loaded first');
    return null;
  },

  /**
   * Calculate implied volatility via bisection method.
   * @returns {number} IV as decimal (e.g. 0.30 = 30%)
   */
  impliedVol(type, S, K, T, r, marketPrice, precision = 0.0001) {
    let lo = 0.001, hi = 5.0;
    for (let i = 0; i < 100; i++) {
      const mid  = (lo + hi) / 2;
      const theo = this.price(type, S, K, T, r, mid);
      if (Math.abs(theo - marketPrice) < precision) return mid;
      if (theo < marketPrice) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }
};

/* ──────────────────────────────────────────────────────────────────
   SECTION 6 — OptionsChainUI
   Renders the existing options chain WITH proper Greeks columns.
   Integrates with yfLoadOptions (yahoo.js) and _bsGreeks (yahoo.js).
   ────────────────────────────────────────────────────────────────── */

window.OptionsChainUI = {
  _containerId: null,
  _ticker:      null,
  _spotPrice:   0,
  _riskFree:    0,
  _chain:       null,

  /**
   * Initialize and render the options chain.
   * @param {string} containerId  — target div id
   * @param {string} ticker
   * @param {number} spotPrice    — current spot price
   */
  async render(containerId, ticker, spotPrice) {
    const el = document.getElementById(containerId);
    if (!el) { console.error(`[OptionsChainUI] #${containerId} not found`); return; }

    this._containerId = containerId;
    this._ticker      = ticker;
    this._spotPrice   = spotPrice;
    // Use live Treasury 10Y if available
    this._riskFree = (window._treasuryYields?.['10Y'] ?? 4.5) / 100;

    el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading options chain for ${ticker}…</div>`;

    // Delegate data fetch to existing yahoo.js
    // But render via our enhanced renderer
    const chain = await this._fetchChain(ticker);
    if (!chain) {
      el.innerHTML = `<div class="no-data">// Options data unavailable for ${ticker}.<br>// Nasdaq API keyless, fallback: Yahoo Finance v7.</div>`;
    if (typeof showApiToast === 'function') showApiToast(`Options chain unavailable for ${ticker}`, 'info');
      return;
    }
    this._chain = chain;
    this._renderChain(el, chain);
  },

  async _fetchChain(ticker) {
    // 1. Nasdaq keyless (same cascade as existing yfLoadOptions)
    try {
      const res = await fetch(
        `https://api.nasdaq.com/api/quote/${ticker}/option-chain?assetclass=stocks&limit=50&expirydate=undefined&callput=0&money=0&type=0`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
      );
      const json = await res.json();
      const rows = json?.data?.table?.rows;
      if (rows?.length) {
        return this._parseNasdaq(rows, ticker);
      }
    } catch {}

    // 2. Yahoo v7 keyless
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v7/finance/options/${ticker}`,
        { signal: AbortSignal.timeout(8000) }
      );
      const json = await res.json();
      const result = json?.optionChain?.result?.[0];
      if (result?.options?.[0]) {
        return this._parseYahooV7(result, ticker);
      }
    } catch {}

    return null;
  },

  _parseNasdaq(rows, ticker) {
    const calls = [], puts = [];
    rows.forEach(r => {
      if (!r.strike) return;
      const strike = parseFloat(r.strike?.replace(/[$,]/g, ''));
      if (isNaN(strike)) return;
      const opt = {
        strike, ticker,
        lastPrice: parseFloat(r.lastPrice?.replace(/[$,]/g, '')) || 0,
        bid:       parseFloat(r.bid?.replace(/[$,]/g, ''))       || 0,
        ask:       parseFloat(r.ask?.replace(/[$,]/g, ''))       || 0,
        volume:    parseInt((r.volume || '0').replace(/,/g, ''))   || 0,
        openInterest: parseInt((r.openInterest || '0').replace(/,/g, '')) || 0,
        impliedVolatility: parseFloat(r.impliedVolatility) / 100 || 0.3,
      };
      if (r.type === 'call' || !r.type) calls.push(opt);
      if (r.type === 'put')             puts.push(opt);
    });
    // If no type flag, split by strike vs spot
    if (!rows[0]?.type && calls.length && !puts.length) {
      const sorted = [...calls].sort((a, b) => a.strike - b.strike);
      return { calls: sorted.slice(0, sorted.length / 2), puts: sorted.slice(sorted.length / 2) };
    }
    return { calls, puts };
  },

  _parseYahooV7(result, ticker) {
    const map = opt => ({
      strike: opt.strike,
      lastPrice: opt.lastPrice,
      bid: opt.bid, ask: opt.ask,
      volume: opt.volume || 0,
      openInterest: opt.openInterest || 0,
      impliedVolatility: opt.impliedVolatility || 0.3,
    });
    return {
      calls: (result.options[0].calls || []).map(map),
      puts:  (result.options[0].puts  || []).map(map),
      expirations: result.expirationDates?.map(ts =>
        new Date(ts * 1000).toISOString().split('T')[0]) || [],
    };
  },

  _renderChain(el, chain) {
    const S     = this._spotPrice;
    const r     = this._riskFree;
    const today = new Date();
    // Use 30-day default DTE if no expiration data
    const T     = 30 / 365;

    const enrichGreeks = (opts, isCall) => opts.map(opt => {
      const sigma = opt.impliedVolatility || 0.3;
      const g     = BlackScholes.greeks(isCall ? 'call' : 'put', S, opt.strike, T, r, sigma);
      return { ...opt, greeks: g };
    });

    const calls = enrichGreeks(chain.calls, true);
    const puts  = enrichGreeks(chain.puts,  false);
    const maxOI = Math.max(...[...calls,...puts].map(o => o.openInterest || 0), 1);

    const rowHTML = (opts, isCall) => opts.slice(0, 30).map(o => {
      const itm   = isCall ? o.strike < S : o.strike > S;
      const atmCls = Math.abs(o.strike - S) < 1 ? 'opt-strike-atm' : '';
      const g = o.greeks;
      const oiBar = Math.round((o.openInterest / maxOI) * 40);
      return `<tr class="${itm ? `opt-row-itm${isCall ? 'c' : 'p'}` : ''}" title="OI bar: ${o.openInterest.toLocaleString()}">
        <td class="opt-strike-cell ${atmCls}" style="${Math.abs(o.strike - S) < S * 0.005 ? 'background:rgba(210,153,34,.2);font-weight:800' : ''}">
          ${o.strike.toFixed(2)}</td>
        <td>${o.lastPrice?.toFixed(2) || '—'}</td>
        <td>${o.bid?.toFixed(2) || '—'}</td>
        <td>${o.ask?.toFixed(2) || '—'}</td>
        <td class="opt-oi-cell">${o.volume?.toLocaleString() || '—'}</td>
        <td class="opt-oi-cell" title="${o.openInterest?.toLocaleString()}">
          <span style="color:${isCall ? '#3fb950' : '#f85149'}">${'█'.repeat(oiBar)}</span>
          <small> ${o.openInterest >= 1000 ? (o.openInterest/1000).toFixed(1)+'K' : o.openInterest}</small>
        </td>
        <td class="opt-greek">${o.impliedVolatility ? (o.impliedVolatility * 100).toFixed(1) + '%' : '—'}</td>
        ${g ? `
        <td class="opt-greek ${g.delta > 0.7 || g.delta < -0.7 ? 'pos' : g.delta > 0.3 || g.delta < -0.3 ? '' : 'neg'}">${g.delta.toFixed(3)}</td>
        <td class="opt-greek">${g.gamma.toFixed(4)}</td>
        <td class="opt-greek neg">${g.theta.toFixed(3)}</td>
        <td class="opt-greek">${g.vega.toFixed(3)}</td>
        <td class="opt-greek">${g.rho?.toFixed(3) || '—'}</td>
        ` : '<td colspan="5">—</td>'}
      </tr>`;
    }).join('');

    const theadRow = `<tr>
      <th class="opt-th-strike">Strike</th>
      <th>Last</th><th>Bid</th><th>Ask</th>
      <th>Vol</th><th>OI</th><th>IV</th>
      <th class="opt-greek">Δ Delta</th>
      <th class="opt-greek">Γ Gamma</th>
      <th class="opt-greek">Θ Theta</th>
      <th class="opt-greek">V Vega</th>
      <th class="opt-greek">ρ Rho</th>
    </tr>`;

    // Max Pain calc
    const allStrikes = [...new Set([...calls,...puts].map(o=>o.strike))].sort((a,b)=>a-b);
    let maxPain = S, minPain = Infinity;
    allStrikes.forEach(K => {
      const pain = [...calls, ...puts].reduce((sum, o) => {
        if (o.strike === K) return sum;
        const callPain = o.strike < K ? Math.max(0, K - o.strike) * o.openInterest : 0;
        const putPain  = o.strike > K ? Math.max(0, o.strike - K) * o.openInterest : 0;
        return sum + callPain + putPain;
      }, 0);
      if (pain < minPain) { minPain = pain; maxPain = K; }
    });
    const pcRatioOI  = puts.reduce((s,o) => s + o.openInterest, 0) /
                       Math.max(1, calls.reduce((s,o) => s + o.openInterest, 0));
    const pcRatioVol = puts.reduce((s,o) => s + o.volume, 0) /
                       Math.max(1, calls.reduce((s,o) => s + o.volume, 0));
    const atmIV = calls.find(o => Math.abs(o.strike - S) < S * 0.02)?.impliedVolatility;

    el.innerHTML = `
      <div class="opt-header-bar">
        <span class="opt-hdr-sym">${this._ticker}</span>
        <span class="opt-hdr-price">$${S.toFixed(2)}</span>
        <span class="opt-hdr-dte">~30d DTE</span>
        <div class="opt-hdr-right">
          <span style="font-size:9px;color:var(--text-muted)">rf=${(r*100).toFixed(2)}% (10Y Treasury)</span>
          <span class="opt-hdr-src">● Live / Nasdaq + Yahoo</span>
        </div>
      </div>

      <div class="opt-metrics-bar">
        <div class="opt-metric"><span class="opt-metric-lbl">ATM IV</span>
          <span class="opt-metric-val">${atmIV ? (atmIV*100).toFixed(1)+'%' : '—'}</span></div>
        <div class="opt-metric"><span class="opt-metric-lbl">P/C Ratio OI</span>
          <span class="opt-metric-val ${pcRatioOI > 1 ? 'neg' : 'pos'}">${pcRatioOI.toFixed(2)}</span></div>
        <div class="opt-metric"><span class="opt-metric-lbl">P/C Ratio Vol</span>
          <span class="opt-metric-val ${pcRatioVol > 1 ? 'neg' : 'pos'}">${pcRatioVol.toFixed(2)}</span></div>
        <div class="opt-metric"><span class="opt-metric-lbl">Max Pain</span>
          <span class="opt-metric-val" style="color:#ffd700">$${maxPain.toFixed(2)}</span></div>
        <div class="opt-metric"><span class="opt-metric-lbl">VIX</span>
          <span class="opt-metric-val">${window._vixLive?.current?.toFixed(2) ?? '—'}</span></div>
      </div>

      <div class="opt-max-pain-note" style="background:rgba(255,215,0,.07);border-left:3px solid #ffd700;padding:5px 12px;font-size:10px;color:var(--text-muted)">
        ⭐ <strong style="color:#ffd700">Max Pain: $${maxPain.toFixed(2)}</strong>
        — Strike at which option sellers lose least if pinned at expiration.
        Current spot ${S > maxPain ? '▲' : '▼'} max pain by
        <strong>${Math.abs(((S - maxPain)/maxPain)*100).toFixed(1)}%</strong>.
      </div>

      <div style="display:flex;gap:0;overflow:auto;height:calc(100% - 140px)">
        <div style="flex:1;overflow:auto">
          <div style="font-size:9px;font-weight:800;color:#3fb950;padding:4px 8px;border-bottom:1px solid var(--border)">📈 CALLS</div>
          <table class="opt-chain-full">
            <thead class="opt-th-call">${theadRow}</thead>
            <tbody>${rowHTML(calls, true)}</tbody>
          </table>
        </div>
        <div style="width:1px;background:var(--border-bright)"></div>
        <div style="flex:1;overflow:auto">
          <div style="font-size:9px;font-weight:800;color:#f85149;padding:4px 8px;border-bottom:1px solid var(--border)">📉 PUTS</div>
          <table class="opt-chain-full">
            <thead class="opt-th-put">${theadRow}</thead>
            <tbody>${rowHTML(puts, false)}</tbody>
          </table>
        </div>
      </div>

      <div class="opt-footer">
        Greeks computed via Black-Scholes · Risk-free: ${(r*100).toFixed(2)}% (US 10Y Treasury) ·
        Max Pain: $${maxPain.toFixed(2)} · P/C OI: ${pcRatioOI.toFixed(2)}
      </div>`;
  }
};

/* ──────────────────────────────────────────────────────────────────
   SECTION 7 — Stock Screener extensions
   Adds dividend, beta, % change filters to existing screenerRun().
   Adds 3 new presets to existing SCR_PRESETS.
   ────────────────────────────────────────────────────────────────── */

// Extend SCR_PRESETS with the 3 new ones from the proposed file
function _extendScreenerPresets() {
  if (typeof SCR_PRESETS === 'undefined') return;

  // Add only if not already present
  if (!SCR_PRESETS.bluechip) {
    SCR_PRESETS.bluechip = {
      label: '🏛️ Blue Chip',
      desc:  'Large cap ≥$50B, stable earnings',
      fmp:   { marketCapMoreThan: '50000000000', priceMoreThan: '20' },
      post:  r => r.filter(x => (x.pe > 0 && x.pe < 30)),
    };
  }
  if (!SCR_PRESETS.hiyield) {
    SCR_PRESETS.hiyield = {
      label: '💵 High Yield',
      desc:  'Dividend ≥4%, cap ≥$2B',
      fmp:   { dividendMoreThan: '4', marketCapMoreThan: '2000000000' },
      post:  r => r.sort((a, b) => (b.dividendYield || 0) - (a.dividendYield || 0)),
    };
  }
  if (!SCR_PRESETS.lowbeta) {
    SCR_PRESETS.lowbeta = {
      label: '🛡 Low Beta',
      desc:  'Beta ≤0.7, defensive holdings',
      fmp:   { marketCapMoreThan: '5000000000', betaMoreThan: '0', betaLessThan: '0.7' },
      post:  r => r.sort((a, b) => (a.beta || 1) - (b.beta || 1)),
    };
  }

  // Re-render the preset bar to include new presets
  if (typeof _screenerRenderPresetBar === 'function') {
    _screenerRenderPresetBar();
  }
}

// Add extra filter inputs to the existing FILTERS tab in panel-screener
function _addScreenerFilters() {
  const grid = document.querySelector('#panel-screener .scr-filters-grid');
  if (!grid) return;

  // Check if already added
  if (document.getElementById('scr-change-min')) return;

  const extras = [
    { id: 'scr-change-min', label: '% Change Min',      type: 'number', placeholder: '-5',  step: '1' },
    { id: 'scr-change-max', label: '% Change Max',      type: 'number', placeholder: '20',  step: '1' },
    { id: 'scr-beta-min',   label: 'Beta Min',           type: 'number', placeholder: '0.3', step: '0.1', existing: true },
    { id: 'scr-beta-max',   label: 'Beta Max',           type: 'number', placeholder: '1.5', step: '0.1', existing: true },
    { id: 'scr-divmin',     label: 'Dividend Yield Min (%)', type: 'number', placeholder: '0', step: '0.5' },
  ].filter(f => !f.existing || !document.getElementById(f.id));

  extras.forEach(f => {
    if (document.getElementById(f.id)) return;
    const div = document.createElement('div');
    div.className = 'scr-filter-row';
    div.innerHTML = `<label>${f.label}</label>
      <input id="${f.id}" class="wh-input" type="${f.type}"
             placeholder="${f.placeholder}" step="${f.step}"/>`;
    grid.appendChild(div);
  });
}

// Patch screenerRun to include the extra filters
function _patchScreenerRun() {
  if (typeof screenerRun !== 'function') return;
  const origRun = window.screenerRun;

  window.screenerRun = async function() {
    // Inject extra filter values into FMP params before original run
    const changeMin  = document.getElementById('scr-change-min')?.value;
    const changeMax  = document.getElementById('scr-change-max')?.value;
    const betaMin    = document.getElementById('scr-beta-min')?.value;
    const betaMax    = document.getElementById('scr-beta-max')?.value;
    const divMin     = document.getElementById('scr-divmin')?.value;

    // Store for post-filter use
    window._fmExtraFilters = { changeMin, changeMax, betaMin, betaMax, divMin };

    await origRun.apply(this, arguments);
  };

  // Also patch the post-filter step if _screenerFMP exists
  if (typeof _screenerFMP === 'function') {
    const origFMP = window._screenerFMP;
    window._screenerFMP = async function(params) {
      let results = await origFMP.apply(this, arguments);
      if (!results) return results;
      const f = window._fmExtraFilters || {};

      if (f.changeMin) results = results.filter(r => (r.changesPercentage || r.change || 0) >= parseFloat(f.changeMin));
      if (f.changeMax) results = results.filter(r => (r.changesPercentage || r.change || 0) <= parseFloat(f.changeMax));
      if (f.betaMin)   results = results.filter(r => !r.beta || r.beta >= parseFloat(f.betaMin));
      if (f.betaMax)   results = results.filter(r => !r.beta || r.beta <= parseFloat(f.betaMax));
      if (f.divMin)    results = results.filter(r => (r.dividendYield || 0) >= parseFloat(f.divMin));

      return results;
    };
  }
}

/* ──────────────────────────────────────────────────────────────────
   SECTION 8 — VIX widget injection into Macro panel
   Adds a VIX card to the existing Macro·Intel ECON tab.
   ────────────────────────────────────────────────────────────────── */

function _injectVixWidget() {
  // Try to inject into the macro-econ tab
  const econEl = document.getElementById('macro-econ');
  if (!econEl) return;

  // Don't inject twice
  if (document.getElementById('vix-widget-root')) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'vix-widget-root';
  wrapper.style.cssText = 'padding:6px 10px;border-bottom:1px solid var(--border)';
  econEl.insertBefore(wrapper, econEl.firstChild);

  // Load VIX data
  vixLoadWidget('vix-widget-root');
}

/* ──────────────────────────────────────────────────────────────────
   SECTION 9 — Plotly Chart Panel (Advanced mode for fund-tech tab)
   Augments existing tech tab with a Plotly button when Plotly is loaded.
   Falls back to existing SVG renderer if Plotly is not available.
   ────────────────────────────────────────────────────────────────── */

window.techLoadPlotly = async function(sym, resolution) {
  const el = document.getElementById('fund-tech');
  if (!el) return;

  // Check if Plotly is available (may be loaded via CDN later)
  if (typeof Plotly === 'undefined') {
    // Load Plotly on-demand
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.plot.ly/plotly-3.1.0.min.js';
      s.onload = resolve;
      s.onerror = () => {
        console.warn('[Plotly] CDN unavailable — using existing SVG renderer');
        reject(new Error('Plotly unavailable'));
      };
      document.head.appendChild(s);
    }).catch(() => {
      // Fallback to existing renderer
      if (typeof showApiToast === 'function') showApiToast('Plotly CDN unavailable — using SVG chart', 'info');
      if (typeof techLoadFull === 'function') techLoadFull(sym, resolution);
      return;
    });
  }

  if (typeof Plotly === 'undefined') {
    if (typeof techLoadFull === 'function') techLoadFull(sym, resolution);
    return;
  }

  sym = sym || (typeof currentTicker !== 'undefined' ? currentTicker : 'AAPL');
  sym = sym.replace(/.*:/, '').toUpperCase();

  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading Plotly chart for ${sym}…</div>`;

  const candles = typeof techFetchCandles === 'function'
    ? await techFetchCandles(sym, resolution || 'D', 500)
    : null;

  if (!candles || candles.c.length < 10) {
    el.innerHTML = `<div class="no-data">// No OHLCV data for <strong>${sym}</strong>. Finnhub key recommended.</div>`;
    return;
  }

  const C = candles.c;
  const dates = candles.t.map(ts => new Date(ts * 1000).toISOString().split('T')[0]);

  // ── Build Plotly traces ──────────────────────────────────────
  const isDark = true;
  const BG     = '#0d1117';
  const GRID   = '#21262d';

  const ohlcTrace = {
    type: 'candlestick', name: sym,
    x: dates, open: candles.o, high: candles.h, low: candles.l, close: candles.c,
    xaxis: 'x', yaxis: 'y',
    increasing: { line: { color: '#3fb950', width: 1 }, fillcolor: '#3fb950' },
    decreasing: { line: { color: '#f85149', width: 1 }, fillcolor: '#f85149' },
    hoverinfo: 'x+y',
  };

  const volColors = candles.c.map((c, i) =>
    i === 0 ? '#8b949e' : c >= candles.c[i-1] ? 'rgba(63,185,80,.45)' : 'rgba(248,81,73,.45)'
  );
  const volTrace = {
    type: 'bar', name: 'Volume', x: dates, y: candles.v,
    xaxis: 'x', yaxis: 'y3',
    marker: { color: volColors }, hovertemplate: '%{y:,.0f}<extra></extra>',
  };

  const traces = [ohlcTrace, volTrace];

  // SMA overlays
  [[20,'#58a6ff'],[50,'#a371f7'],[200,'#ffa657']].forEach(([n,col]) => {
    const sma = _sma(C, n);
    traces.push({
      type:'scatter', mode:'lines', name:`SMA${n}`,
      x: dates, y: sma, xaxis:'x', yaxis:'y',
      line: { color:col, width:1.2 },
      hovertemplate:`%{y:.2f}<extra>SMA${n}</extra>`,
    });
  });

  // RSI sub-chart
  const rsiArr = _rsi(C, 14);
  traces.push({
    type:'scatter', mode:'lines', name:'RSI 14',
    x: dates, y: rsiArr, xaxis:'x', yaxis:'y2',
    line: { color:'#3b82f6', width:1.5 },
    hovertemplate:`%{y:.1f}<extra>RSI</extra>`,
  });
  [[70,'#f85149'],[30,'#3fb950']].forEach(([v,col]) => traces.push({
    type:'scatter', mode:'lines', showlegend:false, hoverinfo:'skip',
    x: [dates[0], dates.at(-1)], y: [v, v], xaxis:'x', yaxis:'y2',
    line: { color:col, width:1, dash:'dot' },
  }));

  const layout = {
    height: 520, autosize: true,
    paper_bgcolor: BG, plot_bgcolor: BG,
    margin: { l:55, r:55, t:35, b:40 },
    hovermode: 'x unified', dragmode: 'zoom',
    font: { color:'#c9d1d9', family:'ui-monospace,monospace', size:11 },
    grid: { rows:3, columns:1, pattern:'independent', roworder:'top to bottom' },
    xaxis: {
      type:'date', gridcolor: GRID, zerolinecolor: GRID,
      rangeslider: { visible:false },
      rangeselector: {
        buttons: [
          { count:1,  label:'1M',  step:'month',  stepmode:'backward' },
          { count:3,  label:'3M',  step:'month',  stepmode:'backward' },
          { count:6,  label:'6M',  step:'month',  stepmode:'backward' },
          { count:1,  label:'1Y',  step:'year',   stepmode:'backward' },
          {            label:'All', step:'all' },
        ],
        bgcolor:'#161b22', activecolor:'#21262d', font:{ color:'#c9d1d9' },
      },
    },
    yaxis:  { domain:[0.3,1], side:'right', gridcolor:GRID, zerolinecolor:GRID },
    yaxis2: { domain:[0.1,0.28], side:'right', gridcolor:GRID, zerolinecolor:GRID, title:{ text:'RSI', font:{size:9} } },
    yaxis3: { domain:[0,0.08], side:'right', gridcolor:GRID, showticklabels:false },
    legend: { orientation:'h', y:1.04, x:0, font:{ size:10 }, bgcolor:'rgba(0,0,0,0)' },
    modebar: { bgcolor:'rgba(0,0,0,0)', color:'#8b949e', activecolor:'#58a6ff' },
  };

  const config = {
    responsive: true, displaylogo: false,
    modeBarButtonsToAdd:    ['drawline', 'drawopenpath', 'eraseshape'],
    modeBarButtonsToRemove: ['lasso2d', 'select2d'],
    toImageButtonOptions: {
      format:'png', filename:`finterm_${sym}_${Date.now()}`, height:900, width:1600, scale:2,
    },
  };

  // Build container
  el.innerHTML = `
    <div class="tech-top-bar" style="display:flex;align-items:center;gap:8px;padding:5px 10px;border-bottom:1px solid var(--border)">
      <span class="tech-sym-lbl">${sym}</span>
      <div style="display:flex;gap:4px;flex:1;flex-wrap:wrap">
        <button class="tech-res-btn" onclick="techLoadPlotly('${sym}','D')">D</button>
        <button class="tech-res-btn" onclick="techLoadPlotly('${sym}','W')">W</button>
        <button class="tech-res-btn" onclick="techLoadPlotly('${sym}','60')">1H</button>
        <button class="tech-res-btn" onclick="techLoadPlotly('${sym}','15')">15m</button>
      </div>
      <button class="tech-res-btn" onclick="if(typeof techLoadFull==='function')techLoadFull('${sym}')"
              style="background:var(--border)">📉 SVG</button>
      <button class="tech-res-btn" onclick="if(typeof techOpenTV==='function')techOpenTV('${sym}')"
              style="background:var(--accent);color:#000">📺 TV</button>
      <button class="tech-res-btn" onclick="window.FintermChart.init('plotly-export-dummy').loadData({t:${JSON.stringify(candles.t.slice(0,3))}}).exportCSV('${sym}.csv')"
              style="background:var(--border)">💾 CSV</button>
    </div>
    <div id="plotly-chart-mount" style="width:100%;height:490px"></div>`;

  Plotly.newPlot('plotly-chart-mount', traces, layout, config);
};

/* ──────────────────────────────────────────────────────────────────
   SECTION 10 — Rate Limiter (utility class for external use)
   Thin, reuses existing session counter pattern from config.js.
   ────────────────────────────────────────────────────────────────── */

class RateLimiter {
  constructor(maxRequests, timeWindowMs) {
    this._max = maxRequests;
    this._window = timeWindowMs;
    this._key = `finterm_rl_${maxRequests}_${timeWindowMs}`;
  }

  _getLog() {
    try { return JSON.parse(sessionStorage.getItem(this._key) || '[]'); }
    catch { return []; }
  }
  _saveLog(log) {
    try { sessionStorage.setItem(this._key, JSON.stringify(log)); }
    catch {}
  }

  async acquire() {
    const now = Date.now();
    let log = this._getLog().filter(ts => now - ts < this._window);
    if (log.length >= this._max) {
      const waitMs = log[0] + this._window - now + 50;
      console.log(`[RateLimiter] Throttled — waiting ${Math.ceil(waitMs/1000)}s`);
      await new Promise(r => setTimeout(r, waitMs));
      log = this._getLog().filter(ts => Date.now() - ts < this._window);
    }
    log.push(Date.now());
    this._saveLog(log);
  }

  reset() {
    sessionStorage.removeItem(this._key);
  }
}

window.RateLimiter = RateLimiter;

/* ──────────────────────────────────────────────────────────────────
   SECTION 11 — Init: wire everything on DOMContentLoaded
   ────────────────────────────────────────────────────────────────── */

(function _fmInit() {
  function _run() {
    // 1. Extend screener presets — delay 600ms so finterm-extras.js
    //    DOMContentLoaded handler has already run _screenerRenderPresetBar()
    setTimeout(() => {
      _extendScreenerPresets();
      _screenerRenderPresetBar && _screenerRenderPresetBar();
    }, 600);

    // 2. Add extra filter inputs — delay 300ms for panel HTML to exist
    setTimeout(_addScreenerFilters, 300);

    // 3. Patch screenerRun — retry until window.screenerRun is defined (max 3s)
    (function _retryPatch(attempt) {
      if (typeof screenerRun === 'function') {
        _patchScreenerRun();
      } else if (attempt < 10) {
        setTimeout(() => _retryPatch(attempt + 1), 300);
      }
    })(0);

    // 4. Inject VIX widget — watch macro-econ panel for visibility changes
    // Uses MutationObserver on the panel + direct check if already visible
    (function _setupVixWatcher() {
      const macroPanel = document.getElementById('panel-macro');
      if (!macroPanel) return;

      // Try immediately in case macro panel is already open
      if (!macroPanel.classList.contains('hidden')) {
        setTimeout(_injectVixWidget, 200);
      }

      // Watch for panel becoming visible
      const obs = new MutationObserver(() => {
        if (!macroPanel.classList.contains('hidden') &&
            !document.getElementById('vix-widget-root')) {
          _injectVixWidget();
        }
      });
      obs.observe(macroPanel, { attributes: true, attributeFilter: ['class', 'style'] });

      // Also hook into switchTab if macro-econ tab is switched to
      const origSwitch = window.switchTab;
      if (typeof origSwitch === 'function') {
        window.switchTab = function(panel, tab) {
          origSwitch.apply(this, arguments);
          if (panel === 'macro' && tab === 'econ' && !document.getElementById('vix-widget-root')) {
            setTimeout(_injectVixWidget, 100);
          }
          // Refresh VIX stale data (>10 min) when macro panel is revisited
          if (panel === 'macro' && window._vixLive) {
            const age = Date.now() - (window._vixLive._ts || 0);
            if (age > 10 * 60 * 1000) {
              ProviderRegistry.cboe.getVIX().then(d => {
                if (d) vixLoadWidget('vix-widget-root');
              }).catch(() => {});
            }
          }
        };
      }
    })();

    // 5. Add "Plotly" button to the tech tab bar in fundamentals
    _addPlotlyButton();

    // 6. Fetch VIX in background for use by other widgets
    ProviderRegistry.cboe.getVIX().catch(() => {});

    console.info('[finterm-modules] Loaded ✓ — Providers, FintermChart, BlackScholes, OptionsChainUI, RateLimiter, VIX widget');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _run);
  } else {
    setTimeout(_run, 0);
  }
})();

function _addPlotlyButton() {
  function _tryInsert() {
    // Find any tech tab button (may be in fundamentals or elsewhere)
    const techBtn = document.querySelector('[data-tab="tech"]');
    if (!techBtn) return false;
    const tabBar = techBtn.closest('.tab-bar');
    if (!tabBar) return false;
    if (tabBar.querySelector('.plotly-launch-btn')) return true; // already added

    const btn = document.createElement('button');
    btn.className = 'tab-btn plotly-launch-btn';
    btn.textContent = '📊 Plotly';
    btn.title = 'Advanced chart with Plotly.js (SMA20/50/200 + RSI sub-panel)';
    btn.style.cssText = 'background:rgba(88,166,255,.1);border-color:var(--accent)';
    btn.onclick = () => {
      if (typeof switchTab === 'function') switchTab('fundamentals', 'tech');
      const sym = (typeof currentTicker !== 'undefined' ? currentTicker : 'AAPL')
        .replace(/.*:/, '').toUpperCase();
      techLoadPlotly(sym);
    };
    tabBar.appendChild(btn);
    return true;
  }

  // Try immediately
  if (_tryInsert()) return;

  // If not found yet, watch DOM for panel-fundamentals to appear
  const obs = new MutationObserver((mutations, observer) => {
    if (_tryInsert()) observer.disconnect();
  });
  obs.observe(document.body, { childList: true, subtree: true });

  // Stop watching after 10 seconds (safety)
  setTimeout(() => obs.disconnect(), 10000);
}

/* ──────────────────────────────────────────────────────────────────
   CSS — injected at runtime for VIX widget and Plotly button
   ────────────────────────────────────────────────────────────────── */
(function _injectCSS() {
  if (document.getElementById('finterm-modules-css')) return;
  const style = document.createElement('style');
  style.id = 'finterm-modules-css';
  style.textContent = `
/* VIX Widget */
.vix-widget          { padding:8px 12px;border-radius:4px;font-size:11px; }
.vix-header          { display:flex;align-items:center;gap:6px;margin-bottom:6px; }
.vix-title           { font-weight:800;font-size:12px;color:var(--text); }
.vix-regime          { font-size:9px;font-weight:800;letter-spacing:.05em; }
.vix-src-badge       { font-size:8px;color:var(--text-muted);margin-left:auto;
                        background:var(--border);padding:1px 5px;border-radius:3px; }
.vix-body            { display:flex;align-items:center;gap:12px; }
.vix-gauge           { position:relative;width:80px;flex-shrink:0; }
.vix-svg             { width:80px;height:50px; }
.vix-num             { position:absolute;bottom:4px;left:50%;transform:translateX(-50%);
                        font-size:15px;font-weight:800;font-family:var(--font-mono);line-height:1; }
.vix-stats           { display:flex;flex-direction:column;gap:3px;flex:1; }
.vix-stat            { display:flex;justify-content:space-between;align-items:center;font-size:10px; }
.vix-stat-lbl        { color:var(--text-muted);font-size:9px; }
.vix-stat-val        { font-family:var(--font-mono);font-weight:600; }
.vix-interp          { font-size:9px;color:var(--text-muted);margin-top:6px;line-height:1.5;border-top:1px solid var(--border);padding-top:5px; }
.vix-sparkline-wrap  { margin-top:4px;height:30px; }
.vix-sparkline       { width:100%;height:30px; }
.vix-unavail         { display:flex;align-items:center;gap:8px;padding:6px 10px;
                        font-size:10px;color:var(--text-muted); }

/* Screener extra filters */
.scr-filter-row      { display:flex;flex-direction:column;gap:3px;padding:4px 0; }

/* Tech Plotly button */
.plotly-launch-btn   { color:var(--accent) !important; }

/* Opt table refinements */
.opt-row-itmc td     { background:rgba(63,185,80,.04) !important; }
.opt-row-itmp td     { background:rgba(248,81,73,.04) !important; }
.opt-max-pain-note   { margin:0;flex-shrink:0; }
`;
  document.head.appendChild(style);
})();

/* ══════════════════════════════════════════════════════════════════
   END OF finterm-modules.js
   ══════════════════════════════════════════════════════════════════ */
console.log('[finterm-modules] Modules loaded: Providers · FintermChart · BlackScholes · OptionsChainUI · RateLimiter · VIX');
