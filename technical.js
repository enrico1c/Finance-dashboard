/* ══════════════════════════════════════════════════════════════════
   technical.js  —  Technical Indicators Module  v1.0
   ──────────────────────────────────────────────────────────────────
   Fonte dati: Finnhub /stock/candle (free, 60 req/min, chiave già
               presente nel progetto)
   Fallback:   Alpha Vantage TIME_SERIES_DAILY (già in api.js)

   Indicatori implementati (tutti client-side, zero librerie esterne):
     • Candlestick chart SVG interattivo con volume bars
     • SMA 20 / 50 / 200
     • EMA 12 / 26
     • RSI 14
     • MACD (12,26,9)
     • Bollinger Bands (20,2)
     • ATR 14
     • OBV
     • VWAP (intraday)
     • Livelli supporto / resistenza (pivot points)
     • Fibonacci retracement (52W high/low)
     • Segnale aggregato (Buy / Neutral / Sell score)
     • Pattern detector: golden cross, death cross, oversold bounce,
       BB squeeze, MACD crossover
   ══════════════════════════════════════════════════════════════════ */

/* ── Cache ──────────────────────────────────────────────────────── */
const _TC = {};
function _tcGet(k, ms) { const e = _TC[k]; return (e && Date.now()-e.ts<ms) ? e.d : null; }
function _tcSet(k, d)  { _TC[k] = { d, ts: Date.now() }; }

/* ── State ──────────────────────────────────────────────────────── */
let _techSym       = null;
let _techResolution = 'D';
let _techCandles   = null;   // { t[], o[], h[], l[], c[], v[] }
let _techPeriod    = 90;     // bars shown

/* ══════════════════════════════════════════════════════════════════
   FETCH — Finnhub candles (primary) → AV daily (fallback)
   ══════════════════════════════════════════════════════════════════ */
async function techFetchCandles(sym, resolution = 'D', bars = 300) {
  const cacheKey = `tc:${sym}:${resolution}`;
  const ttl = resolution === 'D' ? 15*60*1000 : 5*60*1000;
  const cached = _tcGet(cacheKey, ttl);
  if (cached) return cached;

  const key = (typeof getFinnhubKey === 'function') ? getFinnhubKey() : '';
  if (!key) return _techFallbackAV(sym);

  const now  = Math.floor(Date.now() / 1000);
  const days = resolution === 'D' ? bars * 1.5 : resolution === 'W' ? bars * 7 * 1.5 : bars * 400;
  const from = Math.floor(now - days * 86400);

  try {
    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${sym}&resolution=${resolution}&from=${from}&to=${now}&token=${key}`;
    const res  = await fetch(url);
    const json = await res.json();

    if (json.s !== 'ok' || !json.c?.length) return _techFallbackAV(sym);

    const candles = {
      t: json.t, o: json.o, h: json.h, l: json.l, c: json.c, v: json.v,
      sym, resolution,
    };
    _tcSet(cacheKey, candles);
    return candles;
  } catch {
    return _techFallbackAV(sym);
  }
}

async function _techFallbackAV(sym) {
  /* Use Alpha Vantage TIME_SERIES_DAILY as fallback */
  const key = (typeof getAvKey === 'function') ? getAvKey() : '';
  if (!key) return null;
  const cacheKey = `tc_av:${sym}`;
  const cached = _tcGet(cacheKey, 30*60*1000);
  if (cached) return cached;
  try {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${sym}&outputsize=full&apikey=${key}`;
    const res  = await fetch(url);
    const json = await res.json();
    const ts   = json['Time Series (Daily)'];
    if (!ts) return null;
    const entries = Object.entries(ts).sort(([a],[b]) => a < b ? -1 : 1).slice(-300);
    const candles = {
      t: entries.map(([d]) => Math.floor(new Date(d).getTime()/1000)),
      o: entries.map(([,v]) => parseFloat(v['1. open'])),
      h: entries.map(([,v]) => parseFloat(v['2. high'])),
      l: entries.map(([,v]) => parseFloat(v['3. low'])),
      c: entries.map(([,v]) => parseFloat(v['5. adjusted close'])),
      v: entries.map(([,v]) => parseFloat(v['6. volume'])),
      sym, resolution: 'D',
    };
    _tcSet(cacheKey, candles);
    return candles;
  } catch { return null; }
}

/* ══════════════════════════════════════════════════════════════════
   MATH — Pure JS indicator functions (no deps)
   ══════════════════════════════════════════════════════════════════ */
function _sma(arr, n) {
  const out = new Array(arr.length).fill(null);
  for (let i = n-1; i < arr.length; i++) {
    let s = 0; for (let j = i-n+1; j <= i; j++) s += arr[j];
    out[i] = s / n;
  }
  return out;
}

function _ema(arr, n) {
  const k = 2 / (n + 1);
  const out = new Array(arr.length).fill(null);
  // Find first valid SMA seed
  let seed = 0, seedI = n - 1;
  for (let i = 0; i < n; i++) seed += arr[i];
  out[seedI] = seed / n;
  for (let i = seedI + 1; i < arr.length; i++) {
    out[i] = arr[i] * k + out[i-1] * (1 - k);
  }
  return out;
}

function _rsi(closes, n = 14) {
  const out  = new Array(closes.length).fill(null);
  let avgG = 0, avgL = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i-1];
    if (d > 0) avgG += d; else avgL -= d;
  }
  avgG /= n; avgL /= n;
  out[n] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i-1];
    avgG = (avgG * (n-1) + Math.max(d, 0)) / n;
    avgL = (avgL * (n-1) + Math.max(-d, 0)) / n;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

function _macd(closes, fast = 12, slow = 26, sig = 9) {
  const eFast = _ema(closes, fast);
  const eSlow = _ema(closes, slow);
  const line  = closes.map((_, i) => (eFast[i] != null && eSlow[i] != null) ? eFast[i] - eSlow[i] : null);
  // Signal EMA of line (skip nulls)
  const firstValid = line.findIndex(v => v != null);
  const sigLine = new Array(closes.length).fill(null);
  const k = 2 / (sig + 1);
  if (firstValid + sig - 1 < closes.length) {
    let seed = 0;
    for (let i = firstValid; i < firstValid + sig; i++) seed += line[i];
    sigLine[firstValid + sig - 1] = seed / sig;
    for (let i = firstValid + sig; i < closes.length; i++) {
      sigLine[i] = line[i] * k + sigLine[i-1] * (1 - k);
    }
  }
  const hist = line.map((v, i) => (v != null && sigLine[i] != null) ? v - sigLine[i] : null);
  return { line, sigLine, hist };
}

function _bbands(closes, n = 20, mult = 2) {
  const mid   = _sma(closes, n);
  const upper = new Array(closes.length).fill(null);
  const lower = new Array(closes.length).fill(null);
  for (let i = n-1; i < closes.length; i++) {
    let variance = 0;
    for (let j = i-n+1; j <= i; j++) variance += (closes[j] - mid[i]) ** 2;
    const sd = Math.sqrt(variance / n);
    upper[i] = mid[i] + mult * sd;
    lower[i] = mid[i] - mult * sd;
  }
  return { upper, mid, lower };
}

function _atr(h, l, c, n = 14) {
  const tr  = [0];
  for (let i = 1; i < c.length; i++) {
    tr.push(Math.max(h[i]-l[i], Math.abs(h[i]-c[i-1]), Math.abs(l[i]-c[i-1])));
  }
  return _sma(tr, n);
}

function _obv(closes, volumes) {
  const out = [volumes[0]];
  for (let i = 1; i < closes.length; i++) {
    out.push(out[i-1] + (closes[i] > closes[i-1] ? volumes[i] : closes[i] < closes[i-1] ? -volumes[i] : 0));
  }
  return out;
}

function _vwap(o, h, l, c, v) {
  // Rolling VWAP for the last 20 bars
  const out = new Array(c.length).fill(null);
  const n = 20;
  for (let i = n-1; i < c.length; i++) {
    let sumPV = 0, sumV = 0;
    for (let j = i-n+1; j <= i; j++) {
      const tp = (h[j]+l[j]+c[j])/3;
      sumPV += tp * v[j]; sumV += v[j];
    }
    out[i] = sumV ? sumPV / sumV : null;
  }
  return out;
}
function _stochastic(h, l, c, kPeriod = 14, dPeriod = 3) {
  const kArr = new Array(c.length).fill(null);
  for (let i = kPeriod - 1; i < c.length; i++) {
    const hi = Math.max(...h.slice(i - kPeriod + 1, i + 1));
    const lo = Math.min(...l.slice(i - kPeriod + 1, i + 1));
    kArr[i] = (hi === lo) ? 50 : (c[i] - lo) / (hi - lo) * 100;
  }
  // %D = SMA(kPeriod=3) of %K
  const dArr = _sma(kArr.map(v => v ?? 0), dPeriod);
  // Restore nulls for early bars
  for (let i = 0; i < kPeriod - 1; i++) { kArr[i] = null; dArr[i] = null; }
  return { k: kArr, d: dArr };
}

function _williamsR(h, l, c, period = 14) {
  const out = new Array(c.length).fill(null);
  for (let i = period - 1; i < c.length; i++) {
    const hi = Math.max(...h.slice(i - period + 1, i + 1));
    const lo = Math.min(...l.slice(i - period + 1, i + 1));
    out[i] = (hi === lo) ? -50 : ((hi - c[i]) / (hi - lo)) * -100;
  }
  return out;
}

function _cci(h, l, c, period = 20) {
  const out = new Array(c.length).fill(null);
  for (let i = period - 1; i < c.length; i++) {
    const tp  = (h[i] + l[i] + c[i]) / 3;
    const slc = [];
    for (let j = i - period + 1; j <= i; j++) slc.push((h[j]+l[j]+c[j])/3);
    const mean = slc.reduce((a,b)=>a+b,0) / period;
    const md   = slc.reduce((a,b)=>a+Math.abs(b-mean),0) / period;
    out[i] = md === 0 ? 0 : (tp - mean) / (0.015 * md);
  }
  return out;
}

function _ema9(arr)  { return _ema(arr, 9);  }
function _ema21(arr) { return _ema(arr, 21); }
function _ema50(arr) { return _ema(arr, 50); }

function _rvol(volumes, period = 20) {
  // Relative Volume: today's vol / avg vol over period
  const avgVol = _sma(volumes, period);
  return volumes.map((v,i) => avgVol[i] ? v / avgVol[i] : null);
}

function _ichimoku(h, l, c) {
  const N = c.length;
  // Tenkan-sen (9), Kijun-sen (26), Senkou Span A, B, Chikou
  const hi = (a, p, i) => Math.max(...a.slice(Math.max(0, i-p+1), i+1));
  const lo = (a, p, i) => Math.min(...a.slice(Math.max(0, i-p+1), i+1));

  const tenkan = new Array(N).fill(null);
  const kijun  = new Array(N).fill(null);
  const senkouA= new Array(N + 26).fill(null);
  const senkouB= new Array(N + 52).fill(null);

  for (let i = 8; i < N; i++) {
    tenkan[i] = (hi(h,9,i) + lo(l,9,i)) / 2;
  }
  for (let i = 25; i < N; i++) {
    kijun[i] = (hi(h,26,i) + lo(l,26,i)) / 2;
    if (tenkan[i] != null) {
      // Senkou Span A = (Tenkan + Kijun)/2 shifted 26 forward
      senkouA[i + 26] = (tenkan[i] + kijun[i]) / 2;
    }
  }
  for (let i = 51; i < N; i++) {
    senkouB[i + 26] = (hi(h,52,i) + lo(l,52,i)) / 2;
  }
  // Chikou = close shifted 26 back (plot current close 26 periods ago)
  const chikou = new Array(N).fill(null);
  for (let i = 26; i < N; i++) chikou[i - 26] = c[i];

  return { tenkan, kijun, senkouA: senkouA.slice(0,N), senkouB: senkouB.slice(0,N), chikou };
}



function _pivots(h, l, c) {
  // Classic pivot points from last completed day
  const n = c.length - 2; // previous bar
  const P  = (h[n] + l[n] + c[n]) / 3;
  return {
    P,
    R1: 2*P - l[n],  S1: 2*P - h[n],
    R2: P + (h[n] - l[n]),  S2: P - (h[n] - l[n]),
    R3: h[n] + 2*(P - l[n]),  S3: l[n] - 2*(h[n] - P),
  };
}

function _fibonacci(highs, lows) {
  const hi = Math.max(...highs), lo = Math.min(...lows);
  const diff = hi - lo;
  return {
    hi, lo,
    r236: hi - diff * 0.236,
    r382: hi - diff * 0.382,
    r500: hi - diff * 0.500,
    r618: hi - diff * 0.618,
    r786: hi - diff * 0.786,
  };
}

/* ══════════════════════════════════════════════════════════════════
   SIGNAL AGGREGATOR — returns composite score & label
   ══════════════════════════════════════════════════════════════════ */
function _aggregateSignals(indicators, currentPrice) {
  const signals = [];

  const { rsi, macd, bb, sma20, sma50, sma200, ema12, ema26, atr } = indicators;

  if (rsi != null) {
    if (rsi < 30)      signals.push({ label:'RSI Oversold',  score: 1, color:'#3fb950' });
    else if (rsi > 70) signals.push({ label:'RSI Overbought',score:-1, color:'#f85149' });
    else               signals.push({ label:'RSI Neutral',   score: 0, color:'#d29922' });
  }

  if (macd.line != null && macd.sigLine != null) {
    const cross = macd.line > macd.sigLine;
    signals.push({ label: cross ? 'MACD Bullish' : 'MACD Bearish', score: cross ? 1 : -1, color: cross ? '#3fb950' : '#f85149' });
  }

  if (bb.upper != null && bb.lower != null && currentPrice != null) {
    if (currentPrice > bb.upper)      signals.push({ label:'BB Overbought', score:-1, color:'#f85149' });
    else if (currentPrice < bb.lower) signals.push({ label:'BB Oversold',   score: 1, color:'#3fb950' });
    else                              signals.push({ label:'BB In-Band',     score: 0, color:'#d29922' });
  }

  if (sma50 != null && sma200 != null) {
    if (sma50 > sma200)       signals.push({ label:'Golden Cross ✨', score: 1, color:'#3fb950' });
    else if (sma50 < sma200)  signals.push({ label:'Death Cross ☠',  score:-1, color:'#f85149' });
  }

  if (currentPrice != null && sma20 != null) {
    if (currentPrice > sma20) signals.push({ label:'Above SMA20',  score: 1, color:'#3fb950' });
    else                       signals.push({ label:'Below SMA20', score:-1, color:'#f85149' });
  }

  if (ema12 != null && ema26 != null) {
    const cross = ema12 > ema26;
    signals.push({ label: cross ? 'EMA Bullish' : 'EMA Bearish', score: cross ? 1 : -1, color: cross ? '#58a6ff' : '#f0883e' });
  }

  // Stochastic
  if (indicators.stochK != null) {
    if (indicators.stochK < 20)       signals.push({ label:'Stoch Oversold',   score: 1, color:'#3fb950' });
    else if (indicators.stochK > 80)  signals.push({ label:'Stoch Overbought', score:-1, color:'#f85149' });
    else                               signals.push({ label:'Stoch Neutral',    score: 0, color:'#d29922' });
  }

  // Williams %R
  if (indicators.willR != null) {
    if (indicators.willR < -80)       signals.push({ label:'W%R Oversold',   score: 1, color:'#3fb950' });
    else if (indicators.willR > -20)  signals.push({ label:'W%R Overbought', score:-1, color:'#f85149' });
  }

  // CCI
  if (indicators.cci != null) {
    if (indicators.cci < -100)        signals.push({ label:'CCI Oversold',   score: 1, color:'#3fb950' });
    else if (indicators.cci > 100)    signals.push({ label:'CCI Overbought', score:-1, color:'#f85149' });
  }

  // Ichimoku cloud
  if (indicators.cloudBull != null) {
    signals.push({ label: indicators.cloudBull ? 'Kumo Bullish ☁' : 'Kumo Bearish ☁', score: indicators.cloudBull ? 1 : -1, color: indicators.cloudBull ? '#3fb950' : '#f85149' });
  }
  // Price vs Tenkan/Kijun
  if (indicators.ichimoku?.tenkan != null && currentPrice != null) {
    signals.push({ label: currentPrice > indicators.ichimoku.tenkan ? 'Above Tenkan' : 'Below Tenkan', score: currentPrice > indicators.ichimoku.tenkan ? 1 : -1, color: currentPrice > indicators.ichimoku.tenkan ? '#58a6ff' : '#f0883e' });
  }

  const total   = signals.reduce((s,x) => s + x.score, 0);
  const max     = signals.length;
  const pct     = max ? total / max : 0;
  const verdict = pct > 0.25 ? 'BUY' : pct < -0.25 ? 'SELL' : 'NEUTRAL';
  const vColor  = verdict === 'BUY' ? '#3fb950' : verdict === 'SELL' ? '#f85149' : '#d29922';

  return { signals, total, max, pct, verdict, vColor };
}

/* ══════════════════════════════════════════════════════════════════
   CHART SVG — candlestick + volume + overlays (SMA, BB, VWAP)
   ══════════════════════════════════════════════════════════════════ */
function _renderCandleChart(el, candles, overlays, period) {
  const N    = Math.min(period, candles.c.length);
  const from = candles.c.length - N;
  const C    = { t: candles.t.slice(from), o: candles.o.slice(from), h: candles.h.slice(from), l: candles.l.slice(from), c: candles.c.slice(from), v: candles.v.slice(from) };

  const W = el.clientWidth || 800, H = 220, HVOL = 40, PAD = { t:10, r:8, b:20, l:52 };
  const cW   = Math.max(3, Math.floor((W - PAD.l - PAD.r) / N) - 1);
  const chartH = H - PAD.t - PAD.b - HVOL - 6;

  const hiPrice = Math.max(...C.h) * 1.002;
  const loPrice = Math.min(...C.l) * 0.998;
  const hiVol   = Math.max(...C.v);

  const xOf = i => PAD.l + i * (cW + 1) + cW / 2;
  const yOf = p => PAD.t + chartH - ((p - loPrice) / (hiPrice - loPrice)) * chartH;
  const yVol = v => H - PAD.b - (v / hiVol) * HVOL;

  // Y-axis ticks
  const TICKS = 5;
  let yAxis = '';
  for (let i = 0; i <= TICKS; i++) {
    const p = loPrice + (hiPrice - loPrice) * (i / TICKS);
    const y = yOf(p);
    yAxis += `<line x1="${PAD.l}" x2="${W-PAD.r}" y1="${y}" y2="${y}" stroke="var(--border)" stroke-width=".3" stroke-dasharray="3"/>`;
    yAxis += `<text x="${PAD.l-3}" y="${y+3.5}" text-anchor="end" fill="var(--text-muted)" font-size="8" font-family="monospace">${p.toFixed(2)}</text>`;
  }

  // X-axis date labels (every ~10 bars)
  let xAxis = '';
  const step = Math.max(1, Math.floor(N / 8));
  for (let i = 0; i < N; i += step) {
    const d = new Date(C.t[i] * 1000);
    const lbl = d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
    xAxis += `<text x="${xOf(i)}" y="${H - PAD.b + 10}" text-anchor="middle" fill="var(--text-muted)" font-size="7.5" font-family="monospace">${lbl}</text>`;
  }

  // Candles
  let candelStr = '';
  for (let i = 0; i < N; i++) {
    const x     = PAD.l + i * (cW + 1);
    const isUp  = C.c[i] >= C.o[i];
    const color = isUp ? '#3fb950' : '#f85149';
    const bodyT = yOf(Math.max(C.o[i], C.c[i]));
    const bodyH = Math.max(1, Math.abs(yOf(C.o[i]) - yOf(C.c[i])));
    const cx    = x + cW / 2;
    candelStr += `<rect x="${x}" y="${bodyT}" width="${cW}" height="${bodyH}" fill="${color}" opacity=".85"/>`;
    candelStr += `<line x1="${cx}" y1="${yOf(C.h[i])}" x2="${cx}" y2="${bodyT}" stroke="${color}" stroke-width="1"/>`;
    candelStr += `<line x1="${cx}" y1="${bodyT+bodyH}" x2="${cx}" y2="${yOf(C.l[i])}" stroke="${color}" stroke-width="1"/>`;
    // Volume bar
    const vH = H - PAD.b - yVol(C.v[i]);
    candelStr += `<rect x="${x}" y="${yVol(C.v[i])}" width="${cW}" height="${vH}" fill="${color}" opacity=".35"/>`;
  }

  // Overlay lines
  const _line = (arr, full, color, dashed = false) => {
    const pts = [];
    for (let i = 0; i < N; i++) {
      const gi = from + i;
      if (full[gi] == null) continue;
      pts.push(`${xOf(i)},${yOf(full[gi])}`);
    }
    if (!pts.length) return '';
    const dash = dashed ? 'stroke-dasharray="4 2"' : '';
    return `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.2" ${dash} opacity=".8"/>`;
  };

  let overlayStr = '';
  if (overlays.sma20)   overlayStr += _line(null, overlays.sma20,   '#58a6ff');
  if (overlays.sma50)   overlayStr += _line(null, overlays.sma50,   '#f0883e');
  if (overlays.sma200)  overlayStr += _line(null, overlays.sma200,  '#a371f7');
  if (overlays.ema9)    overlayStr += _line(null, overlays.ema9,    '#ffd700', true);
  if (overlays.ema21)   overlayStr += _line(null, overlays.ema21,   '#ff9800', true);
  if (overlays.ema12)   overlayStr += _line(null, overlays.ema12,   '#4dbbff', true);
  if (overlays.bbUpper) overlayStr += _line(null, overlays.bbUpper, '#8b9467', true);
  if (overlays.bbLower) overlayStr += _line(null, overlays.bbLower, '#8b9467', true);
  if (overlays.bbMid)   overlayStr += _line(null, overlays.bbMid,   '#8b9467');
  if (overlays.vwap)    overlayStr += _line(null, overlays.vwap,    '#d29922');
  // Ichimoku lines
  if (overlays.ichTenkan) overlayStr += _line(null, overlays.ichTenkan, '#d29922');
  if (overlays.ichKijun)  overlayStr += _line(null, overlays.ichKijun,  '#4dbbff');
  // Ichimoku cloud (shaded area between SpanA and SpanB)
  if (overlays.ichSpanA && overlays.ichSpanB) {
    const upperPts = [], lowerPts = [];
    for (let i = 0; i < N; i++) {
      const gi = from + i;
      const a = overlays.ichSpanA[gi], b = overlays.ichSpanB[gi];
      if (a == null || b == null) continue;
      const bull = a >= b;
      upperPts.push(`${xOf(i)},${yOf(Math.max(a,b))}`);
      lowerPts.push(`${xOf(i)},${yOf(Math.min(a,b))}`);
    }
    if (upperPts.length > 2) {
      const poly = [...upperPts, ...[...lowerPts].reverse()].join(' ');
      overlayStr += `<polygon points="${poly}" fill="rgba(88,166,255,0.08)" stroke="none"/>`;
    }
    overlayStr += _line(null, overlays.ichSpanA, '#3fb95060');
    overlayStr += _line(null, overlays.ichSpanB, '#f8514960');
  }

  // Legend
  const legend = [
    ['SMA20','#58a6ff'], ['SMA50','#f0883e'], ['SMA200','#a371f7'],
    ['BB','#8b9467'], ['VWAP','#d29922'],
    ['EMA9','#ffd700'], ['EMA21','#ff9800'], ['EMA12','#4dbbff'],
    ['Tenkan','#d29922'], ['Kijun','#4dbbff'],
  ];
  let legendStr = '';
  let lx = PAD.l;
  legend.forEach(([lbl, col]) => {
    legendStr += `<line x1="${lx}" x2="${lx+14}" y1="${PAD.t+7}" y2="${PAD.t+7}" stroke="${col}" stroke-width="1.5"/>`;
    legendStr += `<text x="${lx+17}" y="${PAD.t+11}" fill="${col}" font-size="8.5" font-family="monospace">${lbl}</text>`;
    lx += 52;
  });

  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;display:block" id="techChartSvg">
      ${yAxis}${xAxis}${candelStr}${overlayStr}${legendStr}
      <line x1="${PAD.l}" y1="${PAD.t}" x2="${PAD.l}" y2="${H-PAD.b}" stroke="var(--border)" stroke-width=".5"/>
      <line x1="${PAD.l}" y1="${H-PAD.b}" x2="${W-PAD.r}" y2="${H-PAD.b}" stroke="var(--border)" stroke-width=".5"/>
      <line x1="${PAD.l}" y1="${H-PAD.b-HVOL-4}" x2="${W-PAD.r}" y2="${H-PAD.b-HVOL-4}" stroke="var(--border)" stroke-width=".3" stroke-dasharray="2"/>
      <text x="${PAD.l-3}" y="${H-PAD.b-HVOL-1}" text-anchor="end" fill="var(--text-muted)" font-size="7.5" font-family="monospace">VOL</text>
    </svg>`;
}

/* ══════════════════════════════════════════════════════════════════
   MAIN RENDER — avLoadTech replacement / enhancement
   Called from TECH tab button in index.html
   ══════════════════════════════════════════════════════════════════ */
async function techLoadFull(sym, resolution) {
  const el = document.getElementById('fund-tech');
  if (!el) return;
  if (!sym) { sym = (currentTicker || 'AAPL').replace(/.*:/, '').toUpperCase(); }

  const res = resolution || _techResolution || 'D';
  _techSym = sym; _techResolution = res;

  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading technical data for ${escapeHtml(sym)}…</div>`;

  const candles = await techFetchCandles(sym, res, 300);
  if (!candles || candles.c.length < 30) {
    el.innerHTML = `<div class="no-data">// Could not load OHLCV data for <strong>${escapeHtml(sym)}</strong>.<br>
      // Add Finnhub key in ⚙ Settings (free — 60 req/min).<br>
      // Fallback: Alpha Vantage daily will be used if AV key is set.</div>`;
    return;
  }
  _techCandles = candles;

  const C = candles.c;
  const N = C.length;

  // ── Compute all indicators
  const sma20  = _sma(C, 20);
  const sma50  = _sma(C, 50);
  const sma200 = _sma(C, 200);
  const ema9   = _ema9(C);
  const ema12  = _ema(C, 12);
  const ema21  = _ema21(C);
  const ema26  = _ema(C, 26);
  const ema50  = _ema50(C);
  const rsiArr = _rsi(C, 14);
  const macdR  = _macd(C, 12, 26, 9);
  const bbR    = _bbands(C, 20, 2);
  const atrArr = _atr(candles.h, candles.l, candles.c, 14);
  const obvArr = _obv(C, candles.v);
  const vwapArr= _vwap(candles.o, candles.h, candles.l, candles.c, candles.v);
  const stochR = _stochastic(candles.h, candles.l, candles.c, 14, 3);
  const willR  = _williamsR(candles.h, candles.l, candles.c, 14);
  const cciArr = _cci(candles.h, candles.l, candles.c, 20);
  const rvolArr= _rvol(candles.v, 20);
  const ichR   = _ichimoku(candles.h, candles.l, candles.c);

  // Last values
  const last    = C[N-1];
  const rsiL    = rsiArr[N-1];
  const macdL   = { line: macdR.line[N-1], sigLine: macdR.sigLine[N-1], hist: macdR.hist[N-1] };
  const bbL     = { upper: bbR.upper[N-1], mid: bbR.mid[N-1], lower: bbR.lower[N-1] };
  const atrL    = atrArr[N-1];
  const obvL    = obvArr[N-1];
  const vwapL   = vwapArr[N-1];
  const sma20L  = sma20[N-1];
  const sma50L  = sma50[N-1];
  const sma200L = sma200[N-1];
  const ema9L   = ema9[N-1];
  const ema12L  = ema12[N-1];
  const ema21L  = ema21[N-1];
  const ema26L  = ema26[N-1];
  const ema50L  = ema50[N-1];
  const stochKL = stochR.k[N-1];
  const stochDL = stochR.d[N-1];
  const willRL  = willR[N-1];
  const cciL    = cciArr[N-1];
  const rvolL   = rvolArr[N-1];
  const ichL    = { tenkan: ichR.tenkan[N-1], kijun: ichR.kijun[N-1], senkouA: ichR.senkouA[N-1], senkouB: ichR.senkouB[N-1] };
  // Ichimoku cloud color: green if A>B (bullish), red if A<B (bearish)
  const cloudBull = (ichL.senkouA != null && ichL.senkouB != null) ? ichL.senkouA > ichL.senkouB : null;

  // ── Pivots & Fibonacci (last 52 bars ≈ 52 days)
  const pivots = _pivots(candles.h, candles.l, candles.c);
  const fibs   = _fibonacci(candles.h.slice(-52), candles.l.slice(-52));

  // ── Aggregate signal
  const aggr = _aggregateSignals({
    rsi: rsiL, macd: macdL, bb: bbL,
    sma20: sma20L, sma50: sma50L, sma200: sma200L,
    ema12: ema12L, ema26: ema26L, atr: atrL,
    stochK: stochKL, willR: willRL, cci: cciL, ichimoku: ichL, cloudBull,
  }, last);

  const f2  = v => v != null ? parseFloat(v).toFixed(2) : '—';
  const fM  = v => v != null ? (Math.abs(v)>=1e9?(v/1e9).toFixed(1)+'B':Math.abs(v)>=1e6?(v/1e6).toFixed(1)+'M':v.toFixed(0)) : '—';
  const pct = (a,b) => a&&b ? ((a-b)/b*100).toFixed(2)+'%' : '—';
  const clr = v => v > 0 ? 'pos' : v < 0 ? 'neg' : '';
  const rsiCl = rsiL>=70?'tech-sig-sell':rsiL<=30?'tech-sig-buy':'tech-sig-neutral';
  const rsiLbl= rsiL>=70?'Overbought':rsiL<=30?'Oversold':'Neutral';

  // BB bandwidth & %B
  const bbBand = bbL.upper&&bbL.lower&&bbL.mid ? ((bbL.upper-bbL.lower)/bbL.mid*100).toFixed(2) : null;
  const bbPctB = bbL.upper&&bbL.lower&&last ? ((last-bbL.lower)/(bbL.upper-bbL.lower)*100).toFixed(1) : null;

  // Pattern flags
  const patterns = [];
  if (sma50L && sma200L) {
    const sma50prev  = sma50[N-2], sma200prev = sma200[N-2];
    if (sma50prev < sma200prev && sma50L >= sma200L) patterns.push({ lbl:'🌟 Golden Cross', color:'#3fb950', desc:'SMA50 crossed above SMA200 — bullish long-term' });
    if (sma50prev > sma200prev && sma50L <= sma200L) patterns.push({ lbl:'☠ Death Cross',   color:'#f85149', desc:'SMA50 crossed below SMA200 — bearish long-term' });
  }
  if (rsiL <= 35 && macdR.hist[N-1] > macdR.hist[N-2]) patterns.push({ lbl:'📈 Oversold Bounce', color:'#3fb950', desc:'RSI oversold + MACD histogram rising' });
  if (bbBand && parseFloat(bbBand) < 5) patterns.push({ lbl:'🗜 BB Squeeze', color:'#d29922', desc:'Bollinger bands tight — breakout imminent' });
  if (macdR.hist[N-1] > 0 && macdR.hist[N-2] <= 0) patterns.push({ lbl:'⬆ MACD Crossover', color:'#58a6ff', desc:'MACD histogram turned positive — momentum shift' });
  if (macdR.hist[N-1] < 0 && macdR.hist[N-2] >= 0) patterns.push({ lbl:'⬇ MACD Crossunder', color:'#f0883e', desc:'MACD histogram turned negative — momentum fading' });

  // ── Change % for sparkline hint
  const chg1d = N > 1 ? ((C[N-1]-C[N-2])/C[N-2]*100) : 0;
  const chg5d = N > 5 ? ((C[N-1]-C[N-6])/C[N-6]*100) : null;
  const chg20d= N>20  ? ((C[N-1]-C[N-21])/C[N-21]*100) : null;

  el.innerHTML = `
<!-- ══ Resolution selector ══ -->
<div class="tech-topbar">
  <div class="tech-res-group">
    ${['D','W','M'].map(r=>`<button class="tech-res-btn ${r===res?'active':''}" onclick="techLoadFull('${escapeHtml(sym)}','${r}')">${r==='D'?'Daily':r==='W'?'Weekly':'Monthly'}</button>`).join('')}
  </div>
  <div class="tech-period-group">
    ${[30,60,90,180].map(p=>`<button class="tech-period-btn ${p===_techPeriod?'active':''}" onclick="_techPeriod=${p};techLoadFull('${escapeHtml(sym)}','${res}')">${p}b</button>`).join('')}
  </div>
  <div class="tech-sym-badge">
    <span class="tech-sym-lbl">${escapeHtml(sym)}</span>
    <span class="${clr(chg1d)}" style="font-size:10px;font-family:var(--font-mono)">${chg1d>=0?'+':''}${chg1d.toFixed(2)}%</span>
  </div>
  <div class="tech-overlay-toggles">
    <label class="tech-ov-toggle"><input type="checkbox" id="tov-sma" checked onchange="techRedraw()"> SMA</label>
    <label class="tech-ov-toggle"><input type="checkbox" id="tov-bb" onchange="techRedraw()"> BB</label>
    <label class="tech-ov-toggle"><input type="checkbox" id="tov-vwap" onchange="techRedraw()"> VWAP</label>
    <label class="tech-ov-toggle"><input type="checkbox" id="tov-ema" onchange="techRedraw()"> EMA</label>
    <label class="tech-ov-toggle"><input type="checkbox" id="tov-ich" onchange="techRedrawIchimoku()"> Ichimoku</label>
  </div>
  <button class="tech-res-btn" onclick="techOpenTV('${escapeHtml(sym)}')" style="margin-left:auto;background:var(--accent);color:#000">📺 TradingView</button>
</div>

<!-- ══ Main chart ══ -->
<div id="techChartWrap" class="tech-chart-wrap"></div>

<!-- ══ Aggregate signal ══ -->
<div class="tech-signal-bar">
  <div class="tech-signal-verdict" style="color:${aggr.vColor}">${aggr.verdict}</div>
  <div class="tech-signal-pills">
    ${aggr.signals.map(s=>`<span class="tech-sig-pill" style="border-color:${s.color};color:${s.color}">${s.label}</span>`).join('')}
  </div>
  <div class="tech-signal-score" style="color:${aggr.vColor}">${aggr.signals.filter(s=>s.score===1).length} Buy · ${aggr.signals.filter(s=>s.score===0).length} Neutral · ${aggr.signals.filter(s=>s.score===-1).length} Sell</div>
</div>

<!-- ══ Indicator grid ══ -->
<div class="tech-ind-grid">

  <!-- RSI -->
  <div class="tech-ind-card">
    <div class="tech-ind-title">RSI (14)</div>
    <div class="tech-ind-val ${rsiCl}">${f2(rsiL)}</div>
    <div class="tech-ind-sig ${rsiCl}">${rsiLbl}</div>
    <div class="tech-ind-note">Overbought >70 · Oversold <30</div>
  </div>

  <!-- MACD -->
  <div class="tech-ind-card">
    <div class="tech-ind-title">MACD (12,26,9)</div>
    <div class="tech-ind-val ${macdL.hist>0?'pos':'neg'}">${f2(macdL.line)}</div>
    <div class="tech-ind-sig ${macdL.hist>0?'tech-sig-buy':'tech-sig-sell'}">${macdL.line>macdL.sigLine?'Bullish':'Bearish'}</div>
    <div class="tech-ind-note">Signal ${f2(macdL.sigLine)} · Hist ${f2(macdL.hist)}</div>
  </div>

  <!-- Bollinger Bands -->
  <div class="tech-ind-card">
    <div class="tech-ind-title">Bollinger Bands (20,2)</div>
    <div class="tech-ind-val">${bbBand !== null ? bbBand+'%' : '—'}</div>
    <div class="tech-ind-sig">${bbPctB !== null ? '%B: '+bbPctB+'%' : 'Bandwidth'}</div>
    <div class="tech-ind-note">Upper ${f2(bbL.upper)} · Lower ${f2(bbL.lower)}</div>
  </div>

  <!-- ATR -->
  <div class="tech-ind-card">
    <div class="tech-ind-title">ATR (14)</div>
    <div class="tech-ind-val">${f2(atrL)}</div>
    <div class="tech-ind-sig">${atrL&&last ? (atrL/last*100).toFixed(2)+'% of price' : 'Avg True Range'}</div>
    <div class="tech-ind-note">Daily volatility proxy</div>
  </div>

  <!-- OBV -->
  <div class="tech-ind-card">
    <div class="tech-ind-title">OBV</div>
    <div class="tech-ind-val">${fM(obvL)}</div>
    <div class="tech-ind-sig ${obvArr[N-1]>obvArr[N-2]?'tech-sig-buy':'tech-sig-sell'}">${obvArr[N-1]>obvArr[N-2]?'↑ Accumulation':'↓ Distribution'}</div>
    <div class="tech-ind-note">On-Balance Volume</div>
  </div>

  <!-- VWAP -->
  <div class="tech-ind-card">
    <div class="tech-ind-title">VWAP (20)</div>
    <div class="tech-ind-val ${last>vwapL?'pos':'neg'}">${f2(vwapL)}</div>
    <div class="tech-ind-sig ${last>vwapL?'tech-sig-buy':'tech-sig-sell'}">${last>vwapL?'Price above VWAP':'Price below VWAP'}</div>
    <div class="tech-ind-note">Volume-Weighted Avg Price</div>
  </div>

  <!-- SMA 20/50/200 -->
  <div class="tech-ind-card">
    <div class="tech-ind-title">Moving Averages</div>
    <div class="tech-ind-note" style="margin-top:4px">
      <div class="tech-ma-row"><span>SMA 20</span><span style="color:#58a6ff">${f2(sma20L)}</span><span class="${last>sma20L?'pos':'neg'}">${pct(last,sma20L)}</span></div>
      <div class="tech-ma-row"><span>SMA 50</span><span style="color:#f0883e">${f2(sma50L)}</span><span class="${last>sma50L?'pos':'neg'}">${pct(last,sma50L)}</span></div>
      <div class="tech-ma-row"><span>SMA 200</span><span style="color:#a371f7">${f2(sma200L)}</span><span class="${last>sma200L?'pos':'neg'}">${pct(last,sma200L)}</span></div>
      <div class="tech-ma-row"><span>EMA 12</span><span style="color:#4dbbff">${f2(ema12L)}</span><span></span></div>
      <div class="tech-ma-row"><span>EMA 26</span><span style="color:#4dbbff">${f2(ema26L)}</span><span></span></div>
    </div>
  </div>

  <!-- Perf -->
  <div class="tech-ind-card">
    <div class="tech-ind-title">Performance</div>
    <div class="tech-ind-note" style="margin-top:4px">
      <div class="tech-ma-row"><span>1D</span><span class="${clr(chg1d)}">${chg1d>=0?'+':''}${chg1d.toFixed(2)}%</span><span></span></div>
      ${chg5d!=null?`<div class="tech-ma-row"><span>5D</span><span class="${clr(chg5d)}">${chg5d>=0?'+':''}${chg5d.toFixed(2)}%</span><span></span></div>`:''}
      ${chg20d!=null?`<div class="tech-ma-row"><span>20D</span><span class="${clr(chg20d)}">${chg20d>=0?'+':''}${chg20d.toFixed(2)}%</span><span></span></div>`:''}
      <div class="tech-ma-row"><span>52W Hi</span><span style="color:#3fb950">${f2(fibs.hi)}</span><span></span></div>
      <div class="tech-ma-row"><span>52W Lo</span><span style="color:#f85149">${f2(fibs.lo)}</span><span></span></div>
    </div>
  </div>

  <!-- Stochastic with visual gauge -->
  <div class="tech-ind-card">
    <div class="tech-ind-title">Stochastic (14,3)</div>
    <div class="tech-ind-val ${stochKL<20?'tech-sig-buy':stochKL>80?'tech-sig-sell':'tech-sig-neutral'}">${f2(stochKL)}</div>
    <div class="tech-ind-sig ${stochKL<20?'tech-sig-buy':stochKL>80?'tech-sig-sell':'tech-sig-neutral'}">${stochKL<20?'Oversold (<20)':stochKL>80?'Overbought (>80)':'Neutral'}</div>
    <!-- Stochastic gauge bar -->
    <div class="tech-gauge-wrap">
      <div class="tech-gauge-track">
        <div class="tech-gauge-zone-low"  style="width:20%"></div>
        <div class="tech-gauge-zone-mid"  style="width:60%"></div>
        <div class="tech-gauge-zone-high" style="width:20%"></div>
        <div class="tech-gauge-needle" style="left:${stochKL!=null?Math.min(98,Math.max(2,stochKL)):50}%"></div>
      </div>
      <div class="tech-gauge-labels"><span>0</span><span>20</span><span>80</span><span>100</span></div>
    </div>
    <div class="tech-ind-note">%D (signal): ${f2(stochDL)}</div>
  </div>

  <!-- Williams %R with gauge -->
  <div class="tech-ind-card">
    <div class="tech-ind-title">Williams %R (14)</div>
    <div class="tech-ind-val ${willRL>-20?'tech-sig-sell':willRL<-80?'tech-sig-buy':'tech-sig-neutral'}">${f2(willRL)}</div>
    <div class="tech-ind-sig ${willRL>-20?'tech-sig-sell':willRL<-80?'tech-sig-buy':'tech-sig-neutral'}">${willRL>-20?'Overbought (>-20)':willRL<-80?'Oversold (<-80)':'Neutral'}</div>
    <div class="tech-gauge-wrap">
      <div class="tech-gauge-track">
        <div class="tech-gauge-zone-high" style="width:20%"></div>
        <div class="tech-gauge-zone-mid"  style="width:60%"></div>
        <div class="tech-gauge-zone-low"  style="width:20%"></div>
        <div class="tech-gauge-needle" style="left:${willRL!=null?Math.min(98,Math.max(2,((willRL+100)))):'50'}%"></div>
      </div>
      <div class="tech-gauge-labels"><span>-100</span><span>-80</span><span>-20</span><span>0</span></div>
    </div>
    <div class="tech-ind-note">Range: -100 (oversold) to 0 (overbought)</div>
  </div>

  <!-- CCI -->
  <div class="tech-ind-card">
    <div class="tech-ind-title">CCI (20)</div>
    <div class="tech-ind-val ${cciL>100?'tech-sig-sell':cciL<-100?'tech-sig-buy':'tech-sig-neutral'}">${f2(cciL)}</div>
    <div class="tech-ind-sig ${cciL>100?'tech-sig-sell':cciL<-100?'tech-sig-buy':'tech-sig-neutral'}">${cciL>100?'Overbought (>100)':cciL<-100?'Oversold (<-100)':'Neutral'}</div>
    <div class="tech-ind-note">Commodity Channel Index · extremes ±100</div>
  </div>

  <!-- Relative Volume -->
  <div class="tech-ind-card">
    <div class="tech-ind-title">RVOL (20d avg)</div>
    <div class="tech-ind-val ${rvolL>2?'pos':rvolL<0.5?'neg':''}">${rvolL!=null?rvolL.toFixed(2)+'x':'—'}</div>
    <div class="tech-ind-sig ${rvolL>2?'tech-sig-buy':rvolL<0.5?'tech-sig-sell':'tech-sig-neutral'}">${rvolL>2?'High volume spike':rvolL<0.5?'Low volume warning':'Normal volume'}</div>
    <div class="tech-ind-note">>2x = unusual activity · <0.5x = low conviction</div>
  </div>

  <!-- Ichimoku Cloud -->
  <div class="tech-ind-card">
    <div class="tech-ind-title">Ichimoku Cloud</div>
    <div class="tech-ind-val ${cloudBull===true?'tech-sig-buy':cloudBull===false?'tech-sig-sell':'tech-sig-neutral'}">${cloudBull===true?'Bullish ☁':cloudBull===false?'Bearish ☁':'—'}</div>
    <div class="tech-ind-note" style="margin-top:4px">
      <div class="tech-ma-row"><span>Tenkan</span><span style="color:#d29922">${f2(ichL.tenkan)}</span><span class="${last>ichL.tenkan?'pos':'neg'}">${last&&ichL.tenkan?(last>ichL.tenkan?'▲':'▼'):''}</span></div>
      <div class="tech-ma-row"><span>Kijun</span><span style="color:#4dbbff">${f2(ichL.kijun)}</span><span class="${last>ichL.kijun?'pos':'neg'}">${last&&ichL.kijun?(last>ichL.kijun?'▲':'▼'):''}</span></div>
      <div class="tech-ma-row"><span>Span A</span><span style="color:#3fb95080">${f2(ichL.senkouA)}</span><span></span></div>
      <div class="tech-ma-row"><span>Span B</span><span style="color:#f8514980">${f2(ichL.senkouB)}</span><span></span></div>
    </div>
  </div>

  <!-- Extended EMA grid -->
  <div class="tech-ind-card">
    <div class="tech-ind-title">EMA Stack</div>
    <div class="tech-ind-note" style="margin-top:4px">
      <div class="tech-ma-row"><span>EMA 9</span><span style="color:#ffd700">${f2(ema9L)}</span><span class="${last>ema9L?'pos':'neg'}">${pct(last,ema9L)}</span></div>
      <div class="tech-ma-row"><span>EMA 21</span><span style="color:#ff9800">${f2(ema21L)}</span><span class="${last>ema21L?'pos':'neg'}">${pct(last,ema21L)}</span></div>
      <div class="tech-ma-row"><span>EMA 50</span><span style="color:#e91e63">${f2(ema50L)}</span><span class="${last>ema50L?'pos':'neg'}">${pct(last,ema50L)}</span></div>
    </div>
  </div>

  <!-- RSI Visual Gauge (enhanced) -->
  <div class="tech-ind-card tech-ind-card-wide">
    <div class="tech-ind-title">RSI Gauge (14)</div>
    <div class="rsi-gauge-visual">
      <div class="rsi-gauge-bar">
        <div class="rsi-zone-os" title="Oversold (<30)"></div>
        <div class="rsi-zone-neutral" title="Neutral 30-70"></div>
        <div class="rsi-zone-ob" title="Overbought (>70)"></div>
        <div class="rsi-gauge-pointer" style="left:${rsiL!=null?Math.min(97,Math.max(3,rsiL))+'%':'50%'}">
          <div class="rsi-gauge-val">${f2(rsiL)}</div>
        </div>
      </div>
      <div class="rsi-gauge-scale">
        <span>0</span><span>30</span><span>50</span><span>70</span><span>100</span>
      </div>
    </div>
    <div class="tech-ind-sig ${rsiCl}" style="text-align:center;margin-top:6px">${rsiLbl}</div>
  </div>

  <!-- Bollinger Band Position Bar -->
  <div class="tech-ind-card tech-ind-card-wide">
    <div class="tech-ind-title">Bollinger Band Position</div>
    <div class="bb-pos-wrap">
      <div class="bb-pos-bar">
        <div class="bb-pos-fill" style="left:0;width:100%"></div>
        <div class="bb-pos-marker" style="left:${bbPctB!=null?Math.min(97,Math.max(3,parseFloat(bbPctB)))+'%':'50%'}">
          <div class="bb-pos-price">$${f2(last)}</div>
        </div>
        <div class="bb-pos-label-upper">$${f2(bbL.upper)}</div>
        <div class="bb-pos-label-lower">$${f2(bbL.lower)}</div>
      </div>
      <div class="bb-pos-pctb">%B = ${bbPctB!=null?bbPctB+'%':'—'} · BW = ${bbBand!=null?bbBand+'%':'—'}</div>
      <div class="tech-ind-sig">${bbPctB!=null&&parseFloat(bbPctB)>100?'🔴 Above upper band':bbPctB!=null&&parseFloat(bbPctB)<0?'🟢 Below lower band':bbBand!=null&&parseFloat(bbBand)<4?'🟡 BB Squeeze — breakout imminent':'Price within bands'}</div>
    </div>
  </div>

</div>

<!-- ══ Pivot Points ══ -->
<div class="tech-section">
  <div class="tech-section-title">Pivot Points (Classic)</div>
  <div class="tech-pivot-grid">
    <div class="tech-pivot-cell tech-pivot-r"><span>R3</span><strong>${f2(pivots.R3)}</strong></div>
    <div class="tech-pivot-cell tech-pivot-r"><span>R2</span><strong>${f2(pivots.R2)}</strong></div>
    <div class="tech-pivot-cell tech-pivot-r"><span>R1</span><strong>${f2(pivots.R1)}</strong></div>
    <div class="tech-pivot-cell tech-pivot-p"><span>PP</span><strong>${f2(pivots.P)}</strong></div>
    <div class="tech-pivot-cell tech-pivot-s"><span>S1</span><strong>${f2(pivots.S1)}</strong></div>
    <div class="tech-pivot-cell tech-pivot-s"><span>S2</span><strong>${f2(pivots.S2)}</strong></div>
    <div class="tech-pivot-cell tech-pivot-s"><span>S3</span><strong>${f2(pivots.S3)}</strong></div>
    <div class="tech-pivot-cell" style="color:var(--text)"><span>Current</span><strong style="color:var(--accent)">${f2(last)}</strong></div>
  </div>
</div>

<!-- ══ Fibonacci ══ -->
<div class="tech-section">
  <div class="tech-section-title">Fibonacci Retracement (52W)</div>
  <div class="tech-fib-wrap">
    ${[['100%', fibs.hi, '#3fb950'], ['78.6%', fibs.r786, '#8b9467'], ['61.8%', fibs.r618, '#d29922'],
       ['50.0%', fibs.r500, '#58a6ff'], ['38.2%', fibs.r382, '#58a6ff'], ['23.6%', fibs.r236, '#d29922'],
       ['0%',   fibs.lo,  '#f85149']].map(([lbl, val, col]) => {
      const rel = (val - fibs.lo) / (fibs.hi - fibs.lo);
      const isCurrent = Math.abs(last - val) / val < 0.01;
      return `<div class="tech-fib-row ${isCurrent?'tech-fib-current':''}">
        <span class="tech-fib-lbl" style="color:${col}">${lbl}</span>
        <div class="tech-fib-bar-wrap"><div class="tech-fib-bar" style="width:${(rel*100).toFixed(1)}%;background:${col}"></div></div>
        <span class="tech-fib-val" style="color:${col}">${f2(val)}</span>
        ${isCurrent?'<span class="tech-fib-here">← price</span>':''}
      </div>`;
    }).join('')}
  </div>
</div>

<!-- ══ Patterns ══ -->
${patterns.length ? `
<div class="tech-section">
  <div class="tech-section-title">Detected Patterns</div>
  <div class="tech-patterns">
    ${patterns.map(p=>`<div class="tech-pattern-card" style="border-left-color:${p.color}">
      <span class="tech-pattern-lbl" style="color:${p.color}">${p.lbl}</span>
      <span class="tech-pattern-desc">${escapeHtml(p.desc)}</span>
    </div>`).join('')}
  </div>
</div>` : ''}

<div class="tech-footer">● Finnhub candles · indicators computed client-side · not investment advice</div>`;

  // Draw chart after DOM settles
  setTimeout(() => {
    const wrap = document.getElementById('techChartWrap');
    if (!wrap) return;
    const showSma = document.getElementById('tov-sma')?.checked !== false;
    const showBb  = document.getElementById('tov-bb')?.checked;
    const showVwap= document.getElementById('tov-vwap')?.checked;
    const showEma = document.getElementById('tov-ema')?.checked !== false;
    const showIch = document.getElementById('tov-ich')?.checked;
    const ov = {
      sma20:   showSma  ? sma20   : null,
      sma50:   showSma  ? sma50   : null,
      sma200:  showSma  ? sma200  : null,
      ema12:   showEma  ? ema12   : null,
      ema9:    showEma  ? ema9    : null,
      ema21:   showEma  ? ema21   : null,
      bbUpper: showBb   ? bbR.upper : null,
      bbLower: showBb   ? bbR.lower : null,
      bbMid:   showBb   ? bbR.mid   : null,
      vwap:    showVwap ? vwapArr   : null,
      ichTenkan: showIch ? ichR.tenkan : null,
      ichKijun:  showIch ? ichR.kijun  : null,
      ichSpanA:  showIch ? ichR.senkouA: null,
      ichSpanB:  showIch ? ichR.senkouB: null,
    };
    _renderCandleChart(wrap, candles, ov, _techPeriod);
    _techOverlays = { sma20, sma50, sma200, ema12, ema9, ema21, bbR, vwapArr, ichR };
  }, 60);
}

/* ── Redraw chart with current overlay checkboxes ──────────────── */
let _techOverlays = {};
function techRedraw() {
  const wrap = document.getElementById('techChartWrap');
  if (!wrap || !_techCandles) return;
  const showSma  = document.getElementById('tov-sma')?.checked !== false;
  const showBb   = document.getElementById('tov-bb')?.checked;
  const showVwap = document.getElementById('tov-vwap')?.checked;
  const showEma  = document.getElementById('tov-ema')?.checked !== false;
  const showIch  = document.getElementById('tov-ich')?.checked;
  const ov = {
    sma20:   showSma  ? _techOverlays.sma20    : null,
    sma50:   showSma  ? _techOverlays.sma50    : null,
    sma200:  showSma  ? _techOverlays.sma200   : null,
    ema9:    showEma  ? _techOverlays.ema9     : null,
    ema12:   showEma  ? _techOverlays.ema12    : null,
    ema21:   showEma  ? _techOverlays.ema21    : null,
    bbUpper: showBb   ? _techOverlays.bbR?.upper : null,
    bbLower: showBb   ? _techOverlays.bbR?.lower : null,
    bbMid:   showBb   ? _techOverlays.bbR?.mid   : null,
    vwap:    showVwap ? _techOverlays.vwapArr   : null,
    ichTenkan: showIch ? _techOverlays.ichR?.tenkan  : null,
    ichKijun:  showIch ? _techOverlays.ichR?.kijun   : null,
    ichSpanA:  showIch ? _techOverlays.ichR?.senkouA : null,
    ichSpanB:  showIch ? _techOverlays.ichR?.senkouB : null,
  };
  _renderCandleChart(wrap, _techCandles, ov, _techPeriod);
}

function techRedrawIchimoku() { techRedraw(); }

// Opens TradingView popup with pre-loaded studies
function techOpenTV(sym) {
  const tvSym = sym.includes(':') ? sym : 'NASDAQ:' + sym;
  const w = window.open('', '_blank', 'width=1100,height=700');
  w.document.write(`<!DOCTYPE html><html><head>
    <title>TradingView – ${sym}</title>
    <script src="https://s3.tradingview.com/tv.js"><\/script>
  </head><body style="margin:0;background:#0d1117">
    <div id="tv" style="height:100vh"></div>
    <script>
      new TradingView.widget({
        autosize:true, symbol:"${tvSym}", interval:"D",
        timezone:"Etc/UTC", theme:"dark", style:"1", locale:"en",
        toolbar_bg:"#0d1117", enable_publishing:false,
        allow_symbol_change:true, container_id:"tv",
        studies:["RSI@tv-basicstudies","MACD@tv-basicstudies",
                 "BB@tv-basicstudies","MASimple@tv-basicstudies",
                 "StochasticRSI@tv-basicstudies","ATR@tv-basicstudies",
                 "Volume@tv-basicstudies","IchimokuCloud@tv-basicstudies"],
        details:true
      });
    <\/script>
  </body></html>`);
  w.document.close();
}

/* ── Expose RSI to scorecard (for gauge) ───────────────────────── */
window.techGetRsi = function(sym) {
  const cacheKey = `tc:${sym}:D`;
  const cached = _tcGet(cacheKey, 15*60*1000);
  if (!cached || !cached.c?.length) return null;
  const rsiArr = _rsi(cached.c, 14);
  return rsiArr[rsiArr.length - 1];
};

/* ── Also override avLoadTech so TECH tab uses new module ───────── */
window.avLoadTech = function(sym) { techLoadFull(sym); };
