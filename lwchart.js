/* lwchart.js — FINTERM Market Chart
 * Adapts github.com/enrico1c/market-chart into embeddable dashboard panels.
 * Supports multiple independent instances (main chart, second chart, forex chart).
 *
 * Public API:
 *   mcInit(containerEl, slot, onReady)  — inject chart HTML + init LWC into container
 *   mcLoad(sym, iv, slot)               — load symbol (strips exchange prefix, maps TV intervals)
 *   mcDestroy(slot)                     — stop live feeds, wipe container
 *   window._mcFn(btn, fn, arg)          — HTML onclick= router to correct instance
 */
(function () {
  'use strict';

  /* ── Config ──────────────────────────────────────────────────────── */
  var LAG = 10, TTL = 5 * 60 * 1000;
  var EF = 20, ES = 50, RP = 14, BBP = 20, BBM = 2, MF = 12, MS = 26, SIG = 9;
  var SAR_STEP = 0.02, SAR_MAX = 0.2;
  var HIST = { '1m': 2880, '5m': 1440, '15m': 960, '30m': 720, '1h': 500, '4h': 500, '1d': 500, '1w': 200 };
  var IVms = { '1m': 60e3, '5m': 300e3, '15m': 900e3, '30m': 1800e3, '1h': 3600e3, '4h': 14400e3, '1d': 86400e3, '1w': 604800e3 };
  var IVBN = { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w' };
  var IVBY = { '1m': '1', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '4h': '240', '1d': 'D', '1w': 'W' };
  var IVKR = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440, '1w': 10080 };
  var IVYH = { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '60m', '4h': '60m', '1d': '1d', '1w': '1wk' };
  var YHRNG = { '1m': '7d', '5m': '60d', '15m': '60d', '30m': '60d', '1h': '730d', '4h': '365d', '1d': 'max', '1w': 'max' };
  var KRMAP = {
    'BTCUSDT': 'XBTUSD', 'BTCUSD': 'XBTUSD', 'ETHUSDT': 'ETHUSD', 'SOLUSDT': 'SOLUSD',
    'ADAUSDT': 'ADAUSD', 'XRPUSDT': 'XRPUSD', 'DOTUSDT': 'DOTUSD', 'LINKUSDT': 'LINKUSD',
    'LTCUSDT': 'LTCUSD', 'DOGEUSDT': 'XDGUSD', 'MATICUSDT': 'MATICUSD', 'AVAXUSDT': 'AVAXUSD',
    'ATOMUSDT': 'ATOMUSD', 'UNIUSDT': 'UNIUSD', 'ALGOUSDT': 'ALGOUSD', 'XLMUSDT': 'XLMUSD',
    'NEARUSDT': 'NEARUSD', 'FILUSDT': 'FILUSD', 'AAVEUSDT': 'AAVEUSD', 'TRXUSDT': 'TRXUSD',
    'SANDUSDT': 'SANDUSD', 'MANAUSDT': 'MANAUSD', 'VETUSDT': 'VETUSD', 'RUNEUSDT': 'RUNEUSD',
    'CHZUSDT': 'CHZUSD'
  };
  var CORS = ['https://corsproxy.io/?', 'https://api.allorigins.win/raw?url='];
  var LOCAL_BACKEND = 'http://localhost:3001';
  var LOCAL_RELAY   = 'ws://localhost:8080';
  /* TradingView interval → market-chart interval */
  var TV_IV = {
    'D': '1d', 'W': '1w', '1D': '1d', '1W': '1w',
    '1': '1m', '3': '5m', '5': '5m', '15': '15m',
    '30': '30m', '60': '1h', '120': '1h', '240': '4h'
  };

  /* ── CSS (injected once) ─────────────────────────────────────────── */
  function injectCSS() {
    if (document.getElementById('lwc-style')) return;
    var s = document.createElement('style');
    s.id = 'lwc-style';
    s.textContent = [
      '.lwc-wrap{display:flex;flex-direction:column;height:100%;width:100%;background:#131722;',
      'color:#d1d4dc;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden;position:relative;}',
      '.lwc-wrap *{box-sizing:border-box;}',
      /* Single compact toolbar */
      '.lwc-tb{background:#1e222d;border-bottom:1px solid #2a2e39;display:flex;align-items:center;',
      'gap:3px;padding:2px 8px;flex-shrink:0;flex-wrap:wrap;min-height:0;}',
      '.lwc-sep{width:1px;height:12px;background:#363a45;flex-shrink:0;margin:0 1px;}',
      '.lwc-wrap select{background:#2a2e39;border:1px solid #363a45;color:#d1d4dc;',
      'padding:2px 4px;border-radius:3px;font-size:11px;outline:none;cursor:pointer;}',
      '.lwc-tog{background:transparent;border:1px solid #2a2e39;color:#787b86;padding:0px 4px;',
      'border-radius:3px;font-size:10px;cursor:pointer;line-height:18px;transition:all .1s;}',
      '.lwc-tog:hover{color:#d1d4dc;}',
      '.lwc-tog.on{background:#1a2744;border-color:#2962ff;color:#7eadff;}',
      '.lwc-tog.tp{border-color:#2a2e39;color:#d1d4dc;}.lwc-tog.tp.on{border-color:#f9a825;color:#f9a825;}',
      '.lwc-tog.tl{border-color:#2a2e39;color:#d1d4dc;}.lwc-tog.tl.on{border-color:#26a69a;color:#26a69a;}',
      '.lwc-sp{flex:1;}',  /* spacer to push price to right */
      '.lwc-pd{font-size:12px;font-weight:700;white-space:nowrap;}.lwc-cd{font-size:10px;white-space:nowrap;}',
      '.lwc-up{color:#26a69a;}.lwc-dn{color:#ef5350;}',
      '.lwc-area{display:flex;flex-direction:column;flex:1;min-height:0;}',
      '.lwc-cp{position:relative;min-height:0;}',
      '.lwc-cp>div:first-child{width:100%;height:100%;}',
      '.lwc-cp+.lwc-cp{border-top:1px solid #2a2e39;}',
      '.lwc-plbl{position:absolute;top:3px;left:8px;font-size:9px;color:#4c5058;pointer-events:none;z-index:10;display:flex;gap:4px;align-items:center;}',
      '.lwc-pval{position:absolute;top:3px;left:8px;font-size:9px;pointer-events:none;z-index:10;padding-left:80px;}',
      '.lwc-ohlc{position:absolute;top:4px;left:8px;font-size:10px;color:#d1d4dc;pointer-events:none;z-index:10;',
      'background:rgba(19,23,34,.85);padding:1px 6px;border-radius:3px;display:none;white-space:nowrap;}',
      '.lwc-ptog{background:#2a2e39;border:none;color:#787b86;font-size:9px;padding:1px 5px;border-radius:2px;cursor:pointer;}',
      '.lwc-ptog.on{color:#7b61ff;}',
      '.lwc-stats{position:absolute;top:28px;right:10px;background:#1e222d;border:1px solid #2a2e39;',
      'border-radius:6px;padding:8px 12px;font-size:11px;z-index:50;min-width:150px;display:none;color:#d1d4dc;}',
      '.lwc-stats table{width:100%;border-collapse:collapse;}',
      '.lwc-stats td{padding:2px 3px;}.lwc-stats td:first-child{color:#787b86;}',
      '.lwc-svc{position:absolute;bottom:4px;right:10px;background:#1e222d;border:1px solid #363a45;',
      'border-radius:6px;padding:10px 12px;font-size:11px;z-index:200;min-width:260px;display:none;}',
      '.lwc-svc label{color:#787b86;display:block;margin-bottom:3px;}',
      '.lwc-svc .sr{display:flex;align-items:center;gap:6px;margin-bottom:6px;}',
      '.lwc-svc input[type=text]{background:#2a2e39;border:1px solid #363a45;color:#d1d4dc;',
      'padding:2px 6px;border-radius:3px;font-size:11px;width:160px;outline:none;}',
      '.lwc-svc .lwc-btn{background:#2962ff;border:none;color:#fff;padding:2px 8px;border-radius:3px;font-size:11px;cursor:pointer;}',
      '.lwc-toast{position:absolute;top:30px;right:10px;background:#1e222d;border:1px solid #f9a825;',
      'color:#f9a825;padding:5px 10px;border-radius:4px;font-size:10px;display:none;z-index:300;}',
      '.lwc-hint{position:absolute;bottom:4px;left:50%;transform:translateX(-50%);background:#1e222d;',
      'border:1px solid #363a45;color:#d1d4dc;font-size:10px;padding:3px 10px;border-radius:3px;',
      'z-index:100;display:none;pointer-events:none;}',
      '.lwc-ok{color:#26a69a;}.lwc-err{color:#ef5350;}.lwc-warn{color:#f57c00;}.lwc-cache{color:#7c4dff;}'
    ].join('');
    document.head.appendChild(s);
  }

  /* ── HTML template ───────────────────────────────────────────────── */
  function getHTML(p) {
    /* Use data-fn / data-arg — bound via addEventListener in bindButtons() */
    function b(cls, id, fn, arg, label) {
      var d = arg !== undefined ? ' data-fn="' + fn + '" data-arg="' + arg + '"' : ' data-fn="' + fn + '"';
      return '<button class="' + cls + '" id="' + p + id + '"' + d + '>' + label + '</button>';
    }
    return [
      '<div class="lwc-wrap" id="' + p + 'wrap">',
      '<div class="lwc-tb">',
      '<select id="' + p + 'iv">',
      '<option value="1m">1m</option><option value="5m">5m</option>',
      '<option value="15m">15m</option><option value="30m">30m</option>',
      '<option value="1h" selected>1h</option><option value="4h">4h</option>',
      '<option value="1d">1d</option><option value="1w">1w</option>',
      '</select>',
      '<div class="lwc-sep"></div>',
      b('lwc-tog on','tEma20','ind','ema20','E20'),
      b('lwc-tog on','tEma50','ind','ema50','E50'),
      b('lwc-tog','tBb','ind','bb','BB'),
      b('lwc-tog','tVwap','ind','vwap','VWAP'),
      b('lwc-tog','tPsar','ind','psar','PSAR'),
      b('lwc-tog','tVolma','ind','volma','VMA'),
      b('lwc-tog','tIchi','ind','ichi','Ichi'),
      b('lwc-tog','tPivots','ind','pivots','Pvt'),
      '<div class="lwc-sep"></div>',
      b('lwc-tog tp on','tCd','type','candle','Cd'),
      b('lwc-tog tp','tHA','type','ha','HA'),
      b('lwc-tog tp','tLn','type','line','Ln'),
      b('lwc-tog tp','tAr','type','area','Ar'),
      '<div class="lwc-sep"></div>',
      b('lwc-tog on','tRsi','ind','rsi','RSI'),
      b('lwc-tog on','tMacd','ind','macd','MACD'),
      '<div class="lwc-sep"></div>',
      b('lwc-tog tl on','dCur','tool','cursor','✥'),
      b('lwc-tog tl','dHL','tool','hline','—'),
      b('lwc-tog tl','dTr','tool','trend','↗'),
      b('lwc-tog tl','dFib','tool','fib','Fib'),
      b('lwc-tog tl','dAlt','tool','alert','🔔'),
      '<button class="lwc-tog tl" data-fn="clearAll" style="color:#ef5350;border-color:transparent">✕</button>',
      '<div class="lwc-sep"></div>',
      b('lwc-tog tp','tLog','log',undefined,'Log'),
      '<button class="lwc-tog" data-fn="svc" title="Relay settings" style="font-size:9px">⚙</button>',
      '<span class="lwc-sp"></span>',
      '<span class="lwc-pd" id="' + p + 'pd">&mdash;</span>',
      '<span class="lwc-cd" id="' + p + 'cd"></span>',
      '</div>',
      '<div class="lwc-area">',
      '<div class="lwc-cp" id="' + p + 'pMain" style="flex:55">',
      '<div id="' + p + 'cMain"></div>',
      '<div class="lwc-ohlc" id="' + p + 'ohlc"></div>',
      '</div>',
      '<div class="lwc-cp" id="' + p + 'pRsi" style="flex:20">',
      '<div id="' + p + 'cRsi"></div>',
      '<div class="lwc-plbl">',
      b('lwc-ptog on','pm_rsi','pmode','rsi','RSI 14'),
      b('lwc-ptog','pm_stoch','pmode','stoch','Stoch'),
      b('lwc-ptog','pm_obv','pmode','obv','OBV'),
      b('lwc-ptog','pm_atr','pmode','atr','ATR'),
      '</div>',
      '<div class="lwc-pval" id="' + p + 'rsiVal">&mdash;</div>',
      '</div>',
      '<div class="lwc-cp" id="' + p + 'pMacd" style="flex:25">',
      '<div id="' + p + 'cMacd"></div>',
      '<div class="lwc-plbl">MACD 12,26,9</div>',
      '<div class="lwc-pval" id="' + p + 'macdVal"></div>',
      '</div>',
      '</div>',
      '<div class="lwc-stats" id="' + p + 'stats"><table id="' + p + 'stbl"></table></div>',
      '<div class="lwc-svc" id="' + p + 'svc">',
      '<label>Relay token (RELAY_SECRET)</label>',
      '<div class="sr">',
      '<input type="text" id="' + p + 'relTok" placeholder="paste RELAY_SECRET" />',
      '<button class="lwc-btn" ' + t('saveToken') + '>Save</button>',
      '</div>',
      '<div style="font-size:10px;color:#4c5058;margin-top:4px">',
      'Live: <span id="' + p + 'sLive" style="color:#787b86">&mdash;</span>',
      '</div>',
      '</div>',
      '<div class="lwc-toast" id="' + p + 'toast"></div>',
      '<div class="lwc-hint" id="' + p + 'hint"></div>',
      '</div>'
    ].join('');
  }

  /* ── Math functions ──────────────────────────────────────────────── */
  var fmt = function (n) { return n >= 1000 ? n.toFixed(2) : n >= 1 ? n.toFixed(4) : n.toFixed(6); };
  function emaC(a, p) { if (a.length < p) return []; var k = 2 / (p + 1), s = 0, i; for (i = 0; i < p; i++) s += a[i].close; var v = s / p, o = [{ time: a[p - 1].time, value: v }]; for (i = p; i < a.length; i++) { v = a[i].close * k + v * (1 - k); o.push({ time: a[i].time, value: v }); } return o; }
  function emaV(a, p) { if (a.length < p) return []; var k = 2 / (p + 1), s = 0, i; for (i = 0; i < p; i++) s += a[i].value; var v = s / p, o = [{ time: a[p - 1].time, value: v }]; for (i = p; i < a.length; i++) { v = a[i].value * k + v * (1 - k); o.push({ time: a[i].time, value: v }); } return o; }
  function calcRSI(c, p) { if (c.length <= p) return []; var ag = 0, al = 0, i; for (i = 1; i <= p; i++) { var d = c[i].close - c[i - 1].close; if (d > 0) ag += d; else al -= d; } ag /= p; al /= p; function r(a, b) { return b === 0 ? 100 : 100 - 100 / (1 + a / b); } var o = [{ time: c[p].time, value: r(ag, al) }]; for (i = p + 1; i < c.length; i++) { var d = c[i].close - c[i - 1].close; ag = (ag * (p - 1) + Math.max(d, 0)) / p; al = (al * (p - 1) + Math.max(-d, 0)) / p; o.push({ time: c[i].time, value: r(ag, al) }); } return o; }
  function calcStoch(c) { var rsi = calcRSI(c, 14), sP = 14, kP = 3, dP = 3, k = []; for (var i = sP - 1; i < rsi.length; i++) { var sl = rsi.slice(i - sP + 1, i + 1), mn = Math.min.apply(null, sl.map(function (x) { return x.value; })), mx = Math.max.apply(null, sl.map(function (x) { return x.value; })); k.push({ time: rsi[i].time, value: mx === mn ? 50 : (rsi[i].value - mn) / (mx - mn) * 100 }); } var ks = []; for (var i = kP - 1; i < k.length; i++) { var s = 0; for (var j = i - kP + 1; j <= i; j++) s += k[j].value; ks.push({ time: k[i].time, value: s / kP }); } var ds = []; for (var i = dP - 1; i < ks.length; i++) { var s = 0; for (var j = i - dP + 1; j <= i; j++) s += ks[j].value; ds.push({ time: ks[i].time, value: s / dP }); } return { k: ks, d: ds }; }
  function calcBB(c, p, m) { var u = [], md = [], l = []; for (var i = p - 1; i < c.length; i++) { var sl = c.slice(i - p + 1, i + 1), mn = sl.reduce(function (s, x) { return s + x.close; }, 0) / p, sd = Math.sqrt(sl.reduce(function (s, x) { return s + Math.pow(x.close - mn, 2); }, 0) / p), t = c[i].time; u.push({ time: t, value: mn + m * sd }); md.push({ time: t, value: mn }); l.push({ time: t, value: mn - m * sd }); } return { u: u, m: md, l: l }; }
  function calcMACD(c, fa, sl, sig) { var e12 = emaC(c, fa), e26 = emaC(c, sl); if (!e26.length) return null; var off = sl - fa, ml = []; for (var i = 0; i < e26.length; i++) ml.push({ time: e26[i].time, value: e12[off + i].value - e26[i].value }); var sg = emaV(ml, sig); if (!sg.length) return null; var so = sig - 1, hist = []; for (var i = so; i < ml.length; i++) hist.push({ time: ml[i].time, value: ml[i].value - sg[i - so].value, color: ml[i].value >= sg[i - so].value ? 'rgba(38,166,154,.7)' : 'rgba(239,83,80,.7)' }); return { ml: ml, sg: sg, hist: hist }; }
  function calcVWAP(c) { var cpv = 0, cv = 0, o = [], pd = null; c.forEach(function (x) { var d = new Date(x.time * 1000), ds = d.getUTCFullYear() + '-' + d.getUTCMonth() + '-' + d.getUTCDate(); if (ds !== pd) { cpv = 0; cv = 0; pd = ds; } var tp = (x.high + x.low + x.close) / 3; cpv += tp * x.volume; cv += x.volume; if (cv > 0) o.push({ time: x.time, value: cpv / cv }); }); return o; }
  function calcPSAR(c, step, max) { if (c.length < 3) return { data: [], bull: [] }; var data = [], bull = [], iB = true, af = step, ep = c[0].high, psar = c[0].low; for (var i = 1; i < c.length; i++) { psar = psar + af * (ep - psar); if (iB) { psar = Math.min(psar, c[i - 1].low, i > 1 ? c[i - 2].low : c[i - 1].low); if (c[i].low < psar) { iB = false; psar = ep; ep = c[i].low; af = step; } else if (c[i].high > ep) { ep = c[i].high; af = Math.min(af + step, max); } } else { psar = Math.max(psar, c[i - 1].high, i > 1 ? c[i - 2].high : c[i - 1].high); if (c[i].high > psar) { iB = true; psar = ep; ep = c[i].high; af = step; } else if (c[i].low < ep) { ep = c[i].low; af = Math.min(af + step, max); } } data.push({ time: c[i].time, value: psar }); bull.push(iB); } return { data: data, bull: bull }; }
  function calcVolMA(c, p) { var o = []; for (var i = p - 1; i < c.length; i++) { var s = 0; for (var j = i - p + 1; j <= i; j++) s += c[j].volume; o.push({ time: c[i].time, value: s / p }); } return o; }
  function calcATR(c, p) { if (c.length <= p) return []; var tr = []; for (var i = 1; i < c.length; i++) tr.push(Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close))); var s = 0; for (var i = 0; i < p; i++) s += tr[i]; var atr = s / p, o = [{ time: c[p].time, value: atr }]; for (var i = p; i < tr.length; i++) { atr = (atr * (p - 1) + tr[i]) / p; o.push({ time: c[i + 1].time, value: atr }); } return o; }
  function calcOBV(c) { var obv = 0, o = []; for (var i = 1; i < c.length; i++) { if (c[i].close > c[i - 1].close) obv += c[i].volume; else if (c[i].close < c[i - 1].close) obv -= c[i].volume; o.push({ time: c[i].time, value: obv }); } return o; }
  function calcIchimoku(c) { function hl(arr, from, len) { var hi = -Infinity, lo = Infinity; for (var i = from; i < from + len && i < arr.length; i++) { if (arr[i].high > hi) hi = arr[i].high; if (arr[i].low < lo) lo = arr[i].low; } return (hi + lo) / 2; } var tk = [], kj = [], sA = [], sB = []; for (var i = 51; i < c.length; i++) { var tt = c[i].time, tkV = hl(c, i - 8, 9), kjV = hl(c, i - 25, 26); tk.push({ time: tt, value: tkV }); kj.push({ time: tt, value: kjV }); sA.push({ time: tt, value: (tkV + kjV) / 2 }); sB.push({ time: tt, value: hl(c, i - 51, 52) }); } return { tk: tk, kj: kj, sA: sA, sB: sB }; }
  function calcPivots(c) { var dm = {}; c.forEach(function (x) { var d = Math.floor(x.time / 86400) * 86400; if (!dm[d]) dm[d] = { h: -Infinity, l: Infinity, cl: 0 }; dm[d].h = Math.max(dm[d].h, x.high); dm[d].l = Math.min(dm[d].l, x.low); dm[d].cl = x.close; }); var days = Object.keys(dm).map(Number).sort(); var pByDay = {}; for (var i = 1; i < days.length; i++) { var pr = dm[days[i - 1]], pv = (pr.h + pr.l + pr.cl) / 3; pByDay[days[i]] = { p: pv, r1: 2 * pv - pr.l, s1: 2 * pv - pr.h, r2: pv + (pr.h - pr.l), s2: pv - (pr.h - pr.l) }; } var pO = [], r1O = [], s1O = [], r2O = [], s2O = []; c.forEach(function (x) { var d = Math.floor(x.time / 86400) * 86400, pvd = pByDay[d]; if (!pvd) return; pO.push({ time: x.time, value: pvd.p }); r1O.push({ time: x.time, value: pvd.r1 }); s1O.push({ time: x.time, value: pvd.s1 }); r2O.push({ time: x.time, value: pvd.r2 }); s2O.push({ time: x.time, value: pvd.s2 }); }); return { p: pO, r1: r1O, s1: s1O, r2: r2O, s2: s2O }; }
  function toHA(c) { var o = [], po = c[0].open, pc = c[0].close; c.forEach(function (x) { var hc = (x.open + x.high + x.low + x.close) / 4, ho = (po + pc) / 2, hh = Math.max(x.high, ho, hc), hl = Math.min(x.low, ho, hc); o.push({ time: x.time, open: ho, high: hh, low: hl, close: hc, volume: x.volume }); po = ho; pc = hc; }); return o; }

  /* ── Cache ───────────────────────────────────────────────────────── */
  function sc(s, iv, d) { try { localStorage.setItem('lwc_' + s + '_' + iv, JSON.stringify({ ts: Date.now(), d: d })); } catch (e) { } }
  function lc(s, iv) { try { var o = JSON.parse(localStorage.getItem('lwc_' + s + '_' + iv)); return o && Date.now() - o.ts < TTL ? o.d : null; } catch (e) { return null; } }

  /* ── Fetch helpers ───────────────────────────────────────────────── */
  function isCrypto(r) { var s = r.toUpperCase().replace(/[\s/\-_]/g, ''); if (/^(EURUSD|GBPUSD|USDJPY|AUDUSD|USDCHF|NZDUSD|USDCAD)/.test(s)) return false; return /^[A-Z0-9]+(USDT|USDC|BUSD|BTC|ETH|BNB)$/.test(s); }
  function normBN(r) { return r.toUpperCase().replace(/[\s/\-_]/g, ''); }
  async function pFetch(u) {
    // Try direct fetch first — proxy-client.js will route through finterm-backend if configured
    try { var d = await fetch(u, { signal: AbortSignal.timeout(8000) }); if (d.ok) return d; } catch (e) { }
    var last;
    for (var i = 0; i < CORS.length; i++) { try { var r = await fetch(CORS[i] + encodeURIComponent(u), { signal: AbortSignal.timeout(8000) }); if (r.ok) return r; last = new Error(r.status); } catch (e) { last = e; } }
    throw last || new Error('pFetch failed');
  }
  async function retry(fn, n) { var d = 400; for (var i = 0; i <= n; i++) { try { return await fn(); } catch (e) { if (i === n) throw e; await new Promise(function (r) { setTimeout(r, d); }); d = Math.min(d * 2, 8000); } } }
  function mkv(a) { var m = new Map(); a.forEach(function (c) { m.set(c.time, c); }); return Array.from(m.values()).sort(function (a, b) { return a.time - b.time; }); }
  async function bnB(s, iv, st, en) { var r = await fetch('https://api.binance.com/api/v3/klines?symbol=' + s + '&interval=' + iv + '&startTime=' + st + '&endTime=' + en + '&limit=1000'); if (!r.ok) throw new Error('BN' + r.status); return (await r.json()).map(function (k) { return { time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }; }); }
  async function bnH(s, iv, sMs, eMs) { var all = [], e = eMs; while (e > sMs) { var b = await retry(function () { return bnB(s, IVBN[iv] || '1h', sMs, e); }, 2); if (!b.length) break; all = b.concat(all); if (b.length < 1000) break; e = b[0].time * 1000 - 1; } return mkv(all); }
  async function byB(s, iv, st, en) { var r = await fetch('https://api.bybit.com/v5/market/kline?category=spot&symbol=' + s + '&interval=' + (IVBY[iv] || '60') + '&start=' + st + '&end=' + en + '&limit=1000'); if (!r.ok) throw new Error('BY' + r.status); var j = await r.json(); if (j.retCode !== 0) throw new Error('BY:' + j.retMsg); return j.result.list.map(function (k) { return { time: Math.floor(+k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }; }).reverse(); }
  async function byH(s, iv, sMs, eMs) { var all = [], e = eMs; while (e > sMs) { var b = await retry(function () { return byB(s, iv, sMs, e); }, 2); if (!b.length) break; all = b.concat(all); if (b.length < 1000) break; e = b[0].time * 1000 - 1; } return mkv(all); }
  async function krG(s, iv, since) { var pair = KRMAP[s]; if (!pair) throw new Error('no KR map'); var r = await retry(function () { return fetch('https://api.kraken.com/0/public/OHLC?pair=' + pair + '&interval=' + (IVKR[iv] || 60) + '&since=' + since); }, 2); if (!r.ok) throw new Error('KR' + r.status); var j = await r.json(); if (j.error && j.error.length) throw new Error(j.error[0]); var key = Object.keys(j.result).find(function (k) { return k !== 'last'; }); return (j.result[key] || []).map(function (k) { return { time: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[6] }; }); }
  async function cH(s, iv, sMs, eMs) { try { return { data: await bnH(s, iv, sMs, eMs), src: 'Binance REST' }; } catch (e) { try { return { data: await byH(s, iv, sMs, eMs), src: 'Bybit REST' }; } catch (e2) { throw new Error(e.message); } } }
  async function cG(s, iv, cSec, now) { try { return { data: await krG(s, iv, cSec), src: 'Kraken REST' }; } catch (e) { } try { return { data: await byB(s, iv, cSec * 1000, now), src: 'Bybit gap' }; } catch (e) { } try { return { data: await bnB(s, IVBN[iv] || '1h', cSec * 1000, now), src: 'Binance gap' }; } catch (e) { } return { data: [], src: 'gap failed' }; }
  function pYH(j, si, cu) { var res = j && j.chart && j.chart.result && j.chart.result[0]; if (!res) throw new Error('YH empty'); var ts = res.timestamp, q = res.indicators.quote[0], o = []; for (var i = 0; i < ts.length; i++) { if (q.close[i] == null || q.open[i] == null) continue; if (cu != null && ts[i] > cu) continue; if (si != null && ts[i] <= si) continue; o.push({ time: ts[i], open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] || 0 }); } return o; }
  function a4h(c) { var S = 14400, m = new Map(); c.forEach(function (x) { var b = Math.floor(x.time / S) * S; if (!m.has(b)) m.set(b, { time: b, open: x.open, high: x.high, low: x.low, close: x.close, volume: x.volume }); else { var v = m.get(b); if (x.high > v.high) v.high = x.high; if (x.low < v.low) v.low = x.low; v.close = x.close; v.volume += x.volume; } }); return Array.from(m.values()).sort(function (a, b) { return a.time - b.time; }); }
  async function yH(s, iv, cu) { var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(s) + '?interval=' + (IVYH[iv] || '60m') + '&range=' + (YHRNG[iv] || '60d') + '&includePrePost=false'; var r = await retry(function () { return pFetch(url); }, 2); var c = pYH(await r.json(), null, cu); return iv === '4h' ? a4h(c) : c; }
  async function yR(s, iv, cu) { var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(s) + '?interval=' + (IVYH[iv] || '60m') + '&range=1d&includePrePost=false'; var r = await retry(function () { return pFetch(url); }, 2); var c = pYH(await r.json(), cu, null); return iv === '4h' ? a4h(c) : c; }
  async function fetchLocal(sym, iv, bars) { var url = LOCAL_BACKEND + '/ohlcv?symbol=' + encodeURIComponent(sym) + '&interval=' + iv + '&bars=' + bars; var r = await fetch(url, { signal: AbortSignal.timeout(12000) }); if (!r.ok) throw new Error('Local ' + r.status); var data = await r.json(); if (data.error) throw new Error(data.error); return { data: data, src: 'finterm-backend (' + (r.headers.get('X-Source') || 'local') + ')' }; }
  function merge(a, b) { var m = new Map(); a.forEach(function (c) { m.set(c.time, c); }); b.forEach(function (c) { m.set(c.time, c); }); return Array.from(m.values()).sort(function (a, b) { return a.time - b.time; }); }

  /* ── Instance factory ────────────────────────────────────────────── */
  function createInstance(p) {
    var MC, RC, XC, CS, VS, E20S, E50S, BU, BM, BL, VWS, PSAR_S, VOLS;
    var tkS, kjS, sAS, sBs, pvS, r1S, s1S, r2S, s2S;
    var RSIS, SKS, SDS, OBVS, ATRS, MHIST, ML, MSG_S, LS;
    var relayWS = null, wsConn = null, pollT = null;
    var chartType = 'candle', activeTool = 'cursor', panelMode = 'rsi', logMode = false;
    var indOn = { ema20: true, ema50: true, bb: false, vwap: false, psar: false, volma: false, ichi: false, pivots: false, rsi: true, macd: true };
    var drawnObj = [], alertList = [], rawC = [];
    var drawState = { phase: 0, p1: null, tmpLine: null };
    var lE20 = null, lE50 = null, lE12 = null, lE26 = null, lMEMA = null;
    var lAG = null, lAL = null, lPrev = null, lHAo = null, lHAc = null;
    var rCandle = null, rIvSec = 3600;
    var svc = { backend: false };
    var relayToken = localStorage.getItem('lwc_relayToken') || '';
    var currentSym = 'AAPL'; /* tracks symbol since there is no input field in the toolbar */

    function g(id) { return document.getElementById(p + id); }
    function setS(id, h) { var el = g(id); if (el) el.innerHTML = h; }
    function toast(msg) { var t = g('toast'); if (!t) return; t.textContent = msg; t.style.display = 'block'; setTimeout(function () { t.style.display = 'none'; }, 4000); }
    function hint(msg) { var el = g('hint'); if (el) { el.textContent = msg; el.style.display = msg ? 'block' : 'none'; } }

    function initCharts() {
      LS = LightweightCharts.LineStyle;
      var base = { autoSize: true, layout: { background: { color: '#131722' }, textColor: '#d1d4dc' }, grid: { vertLines: { color: '#1e222d' }, horzLines: { color: '#1e222d' } }, crosshair: { mode: LightweightCharts.CrosshairMode.Normal }, rightPriceScale: { borderColor: '#2a2e39' }, timeScale: { borderColor: '#2a2e39', timeVisible: true, secondsVisible: false } };
      function mkC(id, extra) { var el = g(id); var c = LightweightCharts.createChart(el, Object.assign({}, base, extra || {})); return c; }
      MC = mkC('cMain', { rightPriceScale: { scaleMargins: { top: .05, bottom: .25 } } });
      CS = MC.addCandlestickSeries({ upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350' });
      VS = MC.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
      VS.priceScale().applyOptions({ scaleMargins: { top: .78, bottom: 0 } });
      VOLS = MC.addLineSeries({ color: 'rgba(249,168,37,.6)', lineWidth: 1, priceScaleId: 'vol', priceLineVisible: false, lastValueVisible: false, visible: false });
      E20S = MC.addLineSeries({ color: '#b2b5be', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      E50S = MC.addLineSeries({ color: '#f9a825', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      BU = MC.addLineSeries({ color: 'rgba(41,98,255,.5)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, visible: false });
      BM = MC.addLineSeries({ color: 'rgba(41,98,255,.25)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, visible: false });
      BL = MC.addLineSeries({ color: 'rgba(41,98,255,.5)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, visible: false });
      VWS = MC.addLineSeries({ color: '#ff6d00', lineWidth: 1, priceLineVisible: false, lastValueVisible: true, visible: false });
      PSAR_S = MC.addLineSeries({ color: 'rgba(0,0,0,0)', lineWidth: 0, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, visible: false });
      tkS = MC.addLineSeries({ color: '#2962ff', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, visible: false });
      kjS = MC.addLineSeries({ color: '#ef5350', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, visible: false });
      sAS = MC.addLineSeries({ color: 'rgba(38,166,154,.5)', lineWidth: 1, lineStyle: LS.Dashed, priceLineVisible: false, lastValueVisible: false, visible: false });
      sBs = MC.addLineSeries({ color: 'rgba(239,83,80,.5)', lineWidth: 1, lineStyle: LS.Dashed, priceLineVisible: false, lastValueVisible: false, visible: false });
      pvS = MC.addLineSeries({ color: 'rgba(255,255,255,.5)', lineWidth: 1, lineStyle: LS.Dotted, priceLineVisible: false, lastValueVisible: false, visible: false });
      r1S = MC.addLineSeries({ color: 'rgba(239,83,80,.6)', lineWidth: 1, lineStyle: LS.Dotted, priceLineVisible: false, lastValueVisible: false, visible: false });
      s1S = MC.addLineSeries({ color: 'rgba(38,166,154,.6)', lineWidth: 1, lineStyle: LS.Dotted, priceLineVisible: false, lastValueVisible: false, visible: false });
      r2S = MC.addLineSeries({ color: 'rgba(239,83,80,.4)', lineWidth: 1, lineStyle: LS.SparseDotted, priceLineVisible: false, lastValueVisible: false, visible: false });
      s2S = MC.addLineSeries({ color: 'rgba(38,166,154,.4)', lineWidth: 1, lineStyle: LS.SparseDotted, priceLineVisible: false, lastValueVisible: false, visible: false });
      RC = mkC('cRsi', { timeScale: { visible: false } });
      function osc() { return { priceLineVisible: false, lastValueVisible: true, autoscaleInfoProvider: function () { return { priceRange: { minValue: 0, maxValue: 100 } }; } }; }
      RSIS = RC.addLineSeries(Object.assign({ color: '#7b61ff', lineWidth: 1 }, osc()));
      RSIS.createPriceLine({ price: 70, color: '#ef5350', lineWidth: 1, lineStyle: LS.Dashed, title: '' });
      RSIS.createPriceLine({ price: 30, color: '#26a69a', lineWidth: 1, lineStyle: LS.Dashed, title: '' });
      RSIS.createPriceLine({ price: 50, color: '#4c5058', lineWidth: 1, lineStyle: LS.Dotted, title: '' });
      SKS = RC.addLineSeries(Object.assign({ color: '#2962ff', lineWidth: 1, visible: false }, osc()));
      SDS = RC.addLineSeries(Object.assign({ color: '#ef5350', lineWidth: 1, visible: false }, osc()));
      SKS.createPriceLine({ price: 80, color: '#ef5350', lineWidth: 1, lineStyle: LS.Dashed, title: '' });
      SKS.createPriceLine({ price: 20, color: '#26a69a', lineWidth: 1, lineStyle: LS.Dashed, title: '' });
      OBVS = RC.addLineSeries({ color: '#26a69a', lineWidth: 1, priceLineVisible: false, lastValueVisible: true, visible: false });
      ATRS = RC.addLineSeries({ color: '#f57c00', lineWidth: 1, priceLineVisible: false, lastValueVisible: true, visible: false });
      XC = mkC('cMacd', { timeScale: { visible: false } });
      MHIST = XC.addHistogramSeries({ priceFormat: { minMove: .00001 }, priceLineVisible: false, lastValueVisible: false });
      ML = XC.addLineSeries({ color: '#2962ff', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      MSG_S = XC.addLineSeries({ color: '#ef5350', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      var sy = false;
      [MC, RC, XC].forEach(function (src) { src.timeScale().subscribeVisibleLogicalRangeChange(function (r) { if (sy || !r) return; sy = true; [MC, RC, XC].forEach(function (c) { if (c !== src) c.timeScale().setVisibleLogicalRange(r); }); sy = false; }); });
      MC.subscribeCrosshairMove(function (param) {
        var ov = g('ohlc'); if (!ov) return;
        if (!param.time) { ov.style.display = 'none'; return; }
        var c = param.seriesData.get(CS); if (!c) { ov.style.display = 'none'; return; }
        var cl = c.close >= c.open ? 'lwc-up' : 'lwc-dn';
        var e20 = param.seriesData.get(E20S), e50 = param.seriesData.get(E50S), vw = param.seriesData.get(VWS);
        ov.style.display = 'block';
        ov.innerHTML = 'O<span class="' + cl + '"> ' + fmt(c.open) + '</span>  H<span class="' + cl + '"> ' + fmt(c.high) + '</span>  L<span class="' + cl + '"> ' + fmt(c.low) + '</span>  C<span class="' + cl + '"> ' + fmt(c.close) + '</span>' + (e20 && indOn.ema20 ? '  <span style="color:#b2b5be">E20:' + fmt(e20.value) + '</span>' : '') + (e50 && indOn.ema50 ? '  <span style="color:#f9a825">E50:' + fmt(e50.value) + '</span>' : '') + (vw && indOn.vwap ? '  <span style="color:#ff6d00">VWAP:' + fmt(vw.value) + '</span>' : '');
      });
      RC.subscribeCrosshairMove(function (param) {
        if (!param.time) return; var el = g('rsiVal'); if (!el) return;
        if (panelMode === 'rsi') { var r = param.seriesData.get(RSIS); if (r) { var v = r.value; el.style.color = v > 70 ? '#ef5350' : v < 30 ? '#26a69a' : '#7b61ff'; el.textContent = v.toFixed(1); } }
        else if (panelMode === 'stoch') { var k = param.seriesData.get(SKS); if (k) { el.style.color = k.value > 80 ? '#ef5350' : k.value < 20 ? '#26a69a' : '#2962ff'; el.textContent = 'K:' + k.value.toFixed(1); } }
        else if (panelMode === 'obv') { var ob = param.seriesData.get(OBVS); if (ob) el.textContent = ob.value.toLocaleString(undefined, { maximumFractionDigits: 0 }); }
        else if (panelMode === 'atr') { var at = param.seriesData.get(ATRS); if (at) { el.style.color = '#f57c00'; el.textContent = 'ATR:' + fmt(at.value); } }
      });
      XC.subscribeCrosshairMove(function (param) { if (!param.time) return; var m = param.seriesData.get(ML), sg = param.seriesData.get(MSG_S); var el = g('macdVal'); if (el && m && sg) el.innerHTML = '<span style="color:#2962ff">' + m.value.toFixed(5) + '</span>  <span style="color:#ef5350">' + sg.value.toFixed(5) + '</span>'; });
      var cMainEl = g('cMain');
      cMainEl.addEventListener('click', onChartClick);
      cMainEl.addEventListener('contextmenu', function (e) { e.preventDefault(); undoLast(); });
      /* interval change triggers reload */
      var ivEl2 = g('iv');
      if (ivEl2) ivEl2.addEventListener('change', function () { runLoad(); });
    }

    function bindButtons() {
      /* Attach all toolbar button listeners via data-fn / data-arg — no onclick attrs needed */
      var dispatch = {
        ind: togInd, type: setType, tool: setTool, pmode: setPMode,
        log: toggleLog, svc: toggleSvc, saveToken: saveToken, clearAll: clearAll
      };
      var wrap = document.getElementById(p + 'wrap');
      if (!wrap) return;
      wrap.querySelectorAll('[data-fn]').forEach(function (el) {
        el.addEventListener('click', function () {
          var fn = el.getAttribute('data-fn');
          var arg = el.getAttribute('data-arg');
          var handler = dispatch[fn];
          if (typeof handler === 'function') {
            try { handler(arg !== null ? arg : undefined); } catch (e) { console.warn('[LWC btn]', fn, e.message); }
          }
        });
      });
    }

    function onChartClick(e) {
      if (activeTool === 'cursor') return;
      var rect = g('cMain').getBoundingClientRect();
      var price = CS.coordinateToPrice(e.clientY - rect.top);
      var time = MC.timeScale().coordinateToTime(e.clientX - rect.left);
      if (price == null || time == null) return;
      var pt = { time: +time, price: price };
      if (activeTool === 'hline') { var pl = CS.createPriceLine({ price: price, color: '#2962ff', lineWidth: 1, lineStyle: LS.Dashed, axisLabelVisible: true, title: fmt(price) }); drawnObj.push({ type: 'hline', pl: pl }); }
      else if (activeTool === 'alert') { Notification.requestPermission(); var pl = CS.createPriceLine({ price: price, color: '#f9a825', lineWidth: 1, lineStyle: LS.Dashed, axisLabelVisible: true, title: '⚡' + fmt(price) }); drawnObj.push({ type: 'hline', pl: pl }); alertList.push({ price: price, triggered: false }); }
      else if (activeTool === 'trend' || activeTool === 'fib') {
        if (drawState.phase === 0) { drawState.p1 = pt; drawState.phase = 1; drawState.tmpLine = MC.addLineSeries({ color: 'rgba(255,255,255,.3)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false }); hint(activeTool === 'trend' ? 'Click 2nd point' : 'Click 2nd Fib point'); }
        else { var p1 = drawState.p1, p2 = pt; drawState.phase = 0; if (drawState.tmpLine) { try { MC.removeSeries(drawState.tmpLine); } catch (x) { } drawState.tmpLine = null; } if (activeTool === 'trend') drawTL(p1, p2); else drawFib(p1, p2); hint(''); }
      }
    }
    function drawTL(p1, p2) { if (!rawC.length) return; var slope = (p2.price - p1.price) / (p2.time - p1.time), tmin = Math.min(p1.time, p2.time), data = rawC.filter(function (c) { return c.time >= tmin; }).map(function (c) { return { time: c.time, value: p1.price + slope * (c.time - p1.time) }; }); if (!data.length) return; var s = MC.addLineSeries({ color: '#ffffff', lineWidth: 1, priceLineVisible: false, lastValueVisible: false }); s.setData(data); drawnObj.push({ type: 'series', s: s }); }
    function drawFib(p1, p2) { var hi = Math.max(p1.price, p2.price), lo = Math.min(p1.price, p2.price), rng = hi - lo; var lvs = [[0, '#ef5350'], [.236, '#f57c00'], [.382, '#f9a825'], [.5, '#d1d4dc'], [.618, '#26a69a'], [.786, '#2962ff'], [1, '#ef5350']]; var lines = lvs.map(function (lv) { return CS.createPriceLine({ price: hi - rng * lv[0], color: lv[1], lineWidth: 1, lineStyle: LS.Dashed, axisLabelVisible: true, title: (lv[0] * 100).toFixed(1) + '%' }); }); drawnObj.push({ type: 'fib', lines: lines }); }
    function undoLast() { if (!drawnObj.length) return; var o = drawnObj.pop(); if (o.type === 'hline') try { CS.removePriceLine(o.pl); } catch (e) { } if (o.type === 'series') try { MC.removeSeries(o.s); } catch (e) { } if (o.type === 'fib') o.lines.forEach(function (l) { try { CS.removePriceLine(l); } catch (e) { } }); }

    var IND_BTNS = { ema20: 'tEma20', ema50: 'tEma50', bb: 'tBb', vwap: 'tVwap', psar: 'tPsar', volma: 'tVolma', ichi: 'tIchi', pivots: 'tPivots', rsi: 'tRsi', macd: 'tMacd' };
    function togInd(n) {
      if (!MC) return; /* chart not yet initialised */
      indOn[n] = !indOn[n];
      var btn = g(IND_BTNS[n]); if (btn) btn.classList.toggle('on', indOn[n]);
      if (n === 'ema20') E20S.applyOptions({ visible: indOn.ema20 });
      if (n === 'ema50') E50S.applyOptions({ visible: indOn.ema50 });
      if (n === 'bb') { BU.applyOptions({ visible: indOn.bb }); BM.applyOptions({ visible: indOn.bb }); BL.applyOptions({ visible: indOn.bb }); }
      if (n === 'vwap') VWS.applyOptions({ visible: indOn.vwap });
      if (n === 'psar') PSAR_S.applyOptions({ visible: indOn.psar });
      if (n === 'volma') VOLS.applyOptions({ visible: indOn.volma });
      if (n === 'ichi') [tkS, kjS, sAS, sBs].forEach(function (s) { s.applyOptions({ visible: indOn.ichi }); });
      if (n === 'pivots') [pvS, r1S, s1S, r2S, s2S].forEach(function (s) { s.applyOptions({ visible: indOn.pivots }); });
      if (n === 'rsi') { var el = g('pRsi'); if (el) el.style.display = indOn.rsi ? '' : 'none'; }
      if (n === 'macd') { var el = g('pMacd'); if (el) el.style.display = indOn.macd ? '' : 'none'; }
    }
    var TYPE_BTNS = { candle: 'tCd', ha: 'tHA', line: 'tLn', area: 'tAr', bar: 'tBr' };
    function setType(t) { chartType = t; Object.keys(TYPE_BTNS).forEach(function (k) { var b = g(TYPE_BTNS[k]); if (b) b.classList.toggle('on', k === t); }); if (rawC.length) renderCandles(rawC); }
    var TOOL_BTNS = { cursor: 'dCur', hline: 'dHL', trend: 'dTr', fib: 'dFib', alert: 'dAlt' };
    function setTool(t) { activeTool = t; drawState.phase = 0; Object.keys(TOOL_BTNS).forEach(function (k) { var b = g(TOOL_BTNS[k]); if (b) b.classList.toggle('on', k === t); }); var cm = g('cMain'); if (cm) cm.style.cursor = t !== 'cursor' ? 'crosshair' : 'default'; hint(t === 'hline' ? 'Click for H-line' : t === 'trend' ? 'Click 1st trend point' : t === 'fib' ? 'Click Fib high/low' : t === 'alert' ? 'Click for price alert' : ''); }
    function setPMode(m) { panelMode = m; ['rsi', 'stoch', 'obv', 'atr'].forEach(function (x) { var b = g('pm_' + x); if (b) b.classList.toggle('on', x === m); }); RSIS.applyOptions({ visible: m === 'rsi' }); SKS.applyOptions({ visible: m === 'stoch' }); SDS.applyOptions({ visible: m === 'stoch' }); OBVS.applyOptions({ visible: m === 'obv' }); ATRS.applyOptions({ visible: m === 'atr' }); }
    function toggleLog() { logMode = !logMode; var b = g('tLog'); if (b) b.classList.toggle('on', logMode); MC.priceScale('right').applyOptions({ mode: logMode ? LightweightCharts.PriceScaleMode.Logarithmic : LightweightCharts.PriceScaleMode.Normal }); }
    function exportPNG() { try { var cv = MC.takeScreenshot(), a = document.createElement('a'); a.download = (currentSym || 'chart') + '.png'; a.href = cv.toDataURL('image/png'); a.click(); } catch (e) { } }
    function exportCSV() { if (!rawC.length) return; var rows = ['datetime,open,high,low,close,volume']; rawC.forEach(function (c) { rows.push(new Date(c.time * 1000).toISOString() + ',' + [c.open, c.high, c.low, c.close, c.volume].join(',')); }); var b = new Blob([rows.join('\n')], { type: 'text/csv' }), u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = (currentSym || 'data') + '.csv'; a.click(); URL.revokeObjectURL(u); }
    function showStats() { var sp = g('stats'); if (!sp) return; if (sp.style.display === 'block') { sp.style.display = 'none'; return; } if (!rawC.length) return; var hi = Math.max.apply(null, rawC.map(function (c) { return c.high; })), lo = Math.min.apply(null, rawC.map(function (c) { return c.low; })), first = rawC[0], last = rawC[rawC.length - 1], chg = (last.close - first.open) / first.open * 100, vol = rawC.reduce(function (s, c) { return s + c.volume; }, 0); var rows = [['Bars', rawC.length], ['High', fmt(hi)], ['Low', fmt(lo)], ['Open', fmt(first.open)], ['Close', fmt(last.close)], ['Change', (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%'], ['Volume', vol.toLocaleString(undefined, { maximumFractionDigits: 0 })]]; var tbl = g('stbl'); if (tbl) tbl.innerHTML = rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td style="text-align:right;color:#d1d4dc">' + r[1] + '</td></tr>'; }).join(''); sp.style.display = 'block'; }
    function toggleSvc() { var sp = g('svc'); if (sp) { sp.style.display = sp.style.display === 'block' ? 'none' : 'block'; var ti = g('relTok'); if (ti) ti.value = relayToken; } }
    function saveToken() { var ti = g('relTok'); if (!ti) return; relayToken = ti.value.trim(); localStorage.setItem('lwc_relayToken', relayToken); toast('Relay token saved'); }
    function clearAll() { drawnObj.forEach(function (o) { if (o.type === 'hline') try { CS.removePriceLine(o.pl); } catch (e) { } if (o.type === 'series') try { MC.removeSeries(o.s); } catch (e) { } if (o.type === 'fib') o.lines.forEach(function (l) { try { CS.removePriceLine(l); } catch (e) { } }); }); drawnObj = []; alertList = []; drawState.phase = 0; if (drawState.tmpLine) { try { MC.removeSeries(drawState.tmpLine); } catch (x) { } drawState.tmpLine = null; } hint(''); }

    function renderCandles(candles) {
      if (!candles || !candles.length) { setS('s1', '<span class="lwc-err">No data returned — check symbol or try again</span>'); return; }
      rawC = candles;
      var dsp = chartType === 'ha' ? toHA(candles) : candles;
      CS.applyOptions({ visible: true, upColor: '#26a69a', downColor: '#ef5350', borderVisible: chartType === 'bar', wickVisible: chartType !== 'line' && chartType !== 'area', wickUpColor: '#26a69a', wickDownColor: '#ef5350' });
      CS.setData(dsp.map(function (c) { return { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }; }));
      VS.setData(candles.map(function (c) { return { time: c.time, value: c.volume, color: c.close >= c.open ? 'rgba(38,166,154,.5)' : 'rgba(239,83,80,.5)' }; }));
      E20S.setData(emaC(candles, EF)); E50S.setData(emaC(candles, ES));
      var bb = calcBB(candles, BBP, BBM); BU.setData(bb.u); BM.setData(bb.m); BL.setData(bb.l);
      VWS.setData(calcVWAP(candles)); VOLS.setData(calcVolMA(candles, 20));
      var psar = calcPSAR(candles, SAR_STEP, SAR_MAX); PSAR_S.setData(psar.data);
      var ivEl = g('iv');
      if (indOn.psar) { CS.setMarkers(psar.data.map(function (pt, i) { return { time: pt.time, position: psar.bull[i] ? 'belowBar' : 'aboveBar', color: psar.bull[i] ? '#26a69a' : '#ef5350', shape: 'circle', size: 1 }; })); }
      else if (ivEl && ['1m', '5m', '15m', '30m', '1h'].includes(ivEl.value)) { var sm = []; candles.forEach(function (c) { var d = new Date(c.time * 1000), h = d.getUTCHours(), mn = d.getUTCMinutes(), w = d.getUTCDay(); if (w === 0 || w === 6) return; if (h === 13 && mn === 30) sm.push({ time: c.time, position: 'belowBar', color: '#26a69a', shape: 'arrowUp', size: 1, text: 'Open' }); if (h === 20 && mn === 0) sm.push({ time: c.time, position: 'aboveBar', color: '#ef5350', shape: 'arrowDown', size: 1, text: 'Close' }); }); CS.setMarkers(sm); }
      else { CS.setMarkers([]); }
      var ich = calcIchimoku(candles); tkS.setData(ich.tk); kjS.setData(ich.kj); sAS.setData(ich.sA); sBs.setData(ich.sB);
      var pv = calcPivots(candles); pvS.setData(pv.p); r1S.setData(pv.r1); s1S.setData(pv.s1); r2S.setData(pv.r2); s2S.setData(pv.s2);
      var rsiData = calcRSI(candles, RP); RSIS.setData(rsiData);
      var stoch = calcStoch(candles); SKS.setData(stoch.k); SDS.setData(stoch.d);
      OBVS.setData(calcOBV(candles)); ATRS.setData(calcATR(candles, RP));
      RSIS.applyOptions({ visible: panelMode === 'rsi' }); SKS.applyOptions({ visible: panelMode === 'stoch' }); SDS.applyOptions({ visible: panelMode === 'stoch' }); OBVS.applyOptions({ visible: panelMode === 'obv' }); ATRS.applyOptions({ visible: panelMode === 'atr' });
      var macd = calcMACD(candles, MF, MS, SIG); if (macd) { MHIST.setData(macd.hist); ML.setData(macd.ml); MSG_S.setData(macd.sg); }
      var e20 = emaC(candles, EF), e50 = emaC(candles, ES), e12 = emaC(candles, MF), e26 = emaC(candles, MS);
      lE20 = e20.length ? e20[e20.length - 1].value : null; lE50 = e50.length ? e50[e50.length - 1].value : null;
      lE12 = e12.length ? e12[e12.length - 1].value : null; lE26 = e26.length ? e26[e26.length - 1].value : null;
      if (macd && macd.sg.length) lMEMA = macd.sg[macd.sg.length - 1].value;
      if (rsiData.length) { var n = Math.min(RP * 2, candles.length - 1), ag = 0, al = 0; for (var i = candles.length - n; i < candles.length; i++) { var dd = candles[i].close - candles[i - 1].close; ag += Math.max(dd, 0); al += Math.max(-dd, 0); } lAG = ag / n; lAL = al / n; lPrev = candles[candles.length - 1].close; }
      if (candles.length > 1) { lHAo = (candles[candles.length - 2].open + candles[candles.length - 2].close) / 2; lHAc = (candles[candles.length - 1].open + candles[candles.length - 1].high + candles[candles.length - 1].low + candles[candles.length - 1].close) / 4; }
      if (rsiData.length) { var lr = rsiData[rsiData.length - 1].value, rv = g('rsiVal'); if (rv) { rv.style.color = lr > 70 ? '#ef5350' : lr < 30 ? '#26a69a' : '#7b61ff'; rv.textContent = lr.toFixed(1); } }
      MC.timeScale().fitContent();
      var pd = g('pd'), cd = g('cd'), last = candles[candles.length - 1], first = candles[0];
      if (pd) pd.innerHTML = '<span class="' + (last.close >= last.open ? 'lwc-up' : 'lwc-dn') + '">' + fmt(last.close) + '</span>';
      if (cd) { var chg = (last.close - first.open) / first.open * 100; cd.innerHTML = '<span class="' + (chg >= 0 ? 'lwc-up' : 'lwc-dn') + '">' + (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%</span>'; }
      var st = g('sTime'); if (st) st.textContent = 'Loaded ' + new Date().toLocaleTimeString();
    }

    function liveUp(c) {
      var dc = c;
      if (chartType === 'ha' && lHAo !== null) { var hc = (c.open + c.high + c.low + c.close) / 4, ho = (lHAo + lHAc) / 2; dc = { time: c.time, open: ho, high: Math.max(c.high, ho, hc), low: Math.min(c.low, ho, hc), close: hc, volume: c.volume }; lHAo = ho; lHAc = hc; }
      CS.update({ time: dc.time, open: dc.open, high: dc.high, low: dc.low, close: dc.close });
      if (c.volume != null) VS.update({ time: c.time, value: c.volume, color: c.close >= c.open ? 'rgba(38,166,154,.5)' : 'rgba(239,83,80,.5)' });
      var k20 = 2 / (EF + 1), k50 = 2 / (ES + 1), k12 = 2 / (MF + 1), k26 = 2 / (MS + 1), k9 = 2 / (SIG + 1);
      if (lE20 !== null) { lE20 = c.close * k20 + lE20 * (1 - k20); E20S.update({ time: c.time, value: lE20 }); }
      if (lE50 !== null) { lE50 = c.close * k50 + lE50 * (1 - k50); E50S.update({ time: c.time, value: lE50 }); }
      if (lE12 !== null && lE26 !== null) { lE12 = c.close * k12 + lE12 * (1 - k12); lE26 = c.close * k26 + lE26 * (1 - k26); var nm = lE12 - lE26; ML.update({ time: c.time, value: nm }); if (lMEMA !== null) { lMEMA = nm * k9 + lMEMA * (1 - k9); MSG_S.update({ time: c.time, value: lMEMA }); MHIST.update({ time: c.time, value: nm - lMEMA, color: nm >= lMEMA ? 'rgba(38,166,154,.7)' : 'rgba(239,83,80,.7)' }); } }
      if (lPrev !== null && lAG !== null) { var d = c.close - lPrev; lAG = (lAG * (RP - 1) + Math.max(d, 0)) / RP; lAL = (lAL * (RP - 1) + Math.max(-d, 0)) / RP; var rv2 = lAL === 0 ? 100 : 100 - 100 / (1 + lAG / lAL); RSIS.update({ time: c.time, value: rv2 }); var el = g('rsiVal'); if (el) { el.style.color = rv2 > 70 ? '#ef5350' : rv2 < 30 ? '#26a69a' : '#7b61ff'; el.textContent = rv2.toFixed(1); } }
      lPrev = c.close;
      alertList.forEach(function (a) { if (a.triggered) return; if (Math.abs(c.close - a.price) / a.price < .001) { a.triggered = true; toast('⚡ Alert: ' + fmt(a.price)); if (Notification.permission === 'granted') new Notification('Price Alert', { body: fmt(c.close) + ' crossed ' + fmt(a.price) }); } });
      var pd = g('pd'); if (pd) pd.innerHTML = '<span class="' + (c.close >= c.open ? 'lwc-up' : 'lwc-dn') + '">' + fmt(c.close) + '</span>';
      var st = g('sTime'); if (st) st.textContent = 'Updated ' + new Date().toLocaleTimeString();
    }

    function onRelayTick(msg) { if (!msg.price) return; var now = Math.floor(Date.now() / 1000), bucket = Math.floor(now / rIvSec) * rIvSec; if (!rCandle || rCandle.time !== bucket) { if (rCandle) liveUp(rCandle); rCandle = { time: bucket, open: msg.price, high: msg.price, low: msg.price, close: msg.price, volume: msg.volume || 0 }; } else { rCandle.high = Math.max(rCandle.high, msg.price); rCandle.low = Math.min(rCandle.low, msg.price); rCandle.close = msg.price; rCandle.volume += (msg.volume || 0); liveUp(rCandle); } }
    function connectRelay(ticker) {
      if (relayWS) { try { relayWS.close(); } catch (e) { } relayWS = null; }
      var relayUrl = localStorage.getItem('finterm_relay_url') || LOCAL_RELAY;
      var tok = relayToken || localStorage.getItem('finterm_relay_token') || '';
      if (!tok) { setS('sLive', '<span class="lwc-warn">relay: no token (⚙)</span>'); return; }
      try { relayWS = new WebSocket(relayUrl + '?token=' + encodeURIComponent(tok)); relayWS.onopen = function () { relayWS.send(JSON.stringify({ action: 'subscribe', ticker: ticker })); setS('sLive', '<span class="lwc-ok">relay ● live</span>'); }; relayWS.onmessage = function (e) { var msg = JSON.parse(e.data); if (msg.type === 'tick') onRelayTick(msg); }; relayWS.onclose = function () { setS('sLive', '<span class="lwc-warn">relay reconnecting…</span>'); setTimeout(function () { connectRelay(ticker); }, 5000); }; relayWS.onerror = function () { relayWS.close(); }; } catch (e) { setS('sLive', '<span class="lwc-err">relay err</span>'); }
    }
    function connWS(s, iv) { stopLive(); wsConn = new WebSocket('wss://stream.binance.com:9443/ws/' + s.toLowerCase() + '@kline_' + (IVBN[iv] || '1h')); wsConn.onopen = function () { setS('sLive', '<span class="lwc-ok">Binance WS ●</span>'); }; wsConn.onmessage = function (e) { var k = JSON.parse(e.data).k; liveUp({ time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v }); }; wsConn.onclose = function () { setS('sLive', '<span class="lwc-warn">WS reconnecting…</span>'); setTimeout(function () { connWS(s, iv); }, 3000); }; wsConn.onerror = function () { wsConn.close(); }; }
    function startPoll(s, iv) { stopLive(); function poll() { pFetch('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(s) + '?interval=' + (IVYH[iv] || '60m') + '&range=1d&includePrePost=false').then(function (r) { return r.json(); }).then(function (j) { var res = j && j.chart && j.chart.result && j.chart.result[0]; if (!res) return; var ts = res.timestamp, q = res.indicators.quote[0]; if (!ts || !ts.length) return; var i = ts.length - 1; while (i >= 0 && q.close[i] == null) i--; if (i < 0) return; liveUp({ time: ts[i], open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] || 0 }); setS('sLive', '<span class="lwc-ok">Yahoo poll ✓</span>'); }).catch(function (e) { setS('sLive', '<span class="lwc-err">' + e.message + '</span>'); }); } poll(); pollT = setInterval(poll, 30000); setS('sLive', '<span class="lwc-warn">Yahoo poll 30s</span>'); }
    function stopLive() { if (wsConn) { try { wsConn.close(); } catch (e) { } wsConn = null; } if (relayWS) { try { relayWS.send(JSON.stringify({ action: 'unsubscribe', ticker: 'ALL' })); } catch (e) { } try { relayWS.close(); } catch (e) { } relayWS = null; } if (pollT) { clearInterval(pollT); pollT = null; } lE20 = lE50 = lE12 = lE26 = lMEMA = lAG = lAL = lPrev = lHAo = lHAc = rCandle = null; }

    async function detectSvc() { try { var r = await fetch(LOCAL_BACKEND + '/health', { signal: AbortSignal.timeout(1500) }); svc.backend = r.ok; } catch (e) { svc.backend = false; } var bd = g('beDot'); if (bd) bd.innerHTML = '<span class="' + (svc.backend ? 'lwc-ok' : '') + '">' + (svc.backend ? '✓ ' : '') + 'finterm-backend</span>'; }

    async function runLoad() {
      var ivEl = g('iv'); if (!ivEl) return;
      var raw = currentSym.trim().toUpperCase().replace(/.*:/, '');
      var iv = ivEl.value; if (!raw) return;
      rIvSec = (IVms[iv] || 3600e3) / 1000; stopLive();
      setS('s1', 'loading…'); setS('s2', 'loading…'); setS('sLive', '—');
      var pd = g('pd'), cd = g('cd'), rv = g('rsiVal'), mv = g('macdVal'), st2 = g('stats');
      if (pd) pd.textContent = '—'; if (cd) cd.textContent = ''; if (rv) rv.textContent = '—'; if (mv) mv.textContent = ''; if (st2) st2.style.display = 'none';
      var nb = HIST[iv] || 500, now = Date.now(), cMs = now - LAG * 60 * 1000, cSec = Math.floor(cMs / 1000), sMs = cMs - nb * (IVms[iv] || 3600e3);
      var hist = [], gap = [];
      if (isCrypto(raw)) {
        var sym = normBN(raw); currentSym = sym;
        var cached = lc(sym, iv); if (cached) { renderCandles(cached); setS('s1', '<span class="lwc-cache">● cache (' + cached.length + ')</span>'); setS('s2', '<span class="lwc-cache">cache</span>'); connWS(sym, iv); return; }
        try { var r1 = await cH(sym, iv, sMs, cMs); hist = r1.data; setS('s1', '<span class="lwc-ok">' + r1.src + ' (' + hist.length + ')</span>'); } catch (e) { setS('s1', '<span class="lwc-err">' + e.message + '</span>'); }
        var r2 = await cG(sym, iv, cSec, now); gap = r2.data;
        setS('s2', '<span class="' + (r2.src.includes('failed') ? 'lwc-err' : 'lwc-ok') + '">' + r2.src + ' (' + gap.length + ')</span>');
        var mg = merge(hist, gap); if (mg.length) sc(sym, iv, mg); renderCandles(mg); connWS(sym, iv);
      } else {
        var cached2 = lc(raw, iv); if (cached2) { renderCandles(cached2); setS('s1', '<span class="lwc-cache">● cache (' + cached2.length + ')</span>'); setS('s2', '<span class="lwc-cache">cache</span>'); if (relayToken) connectRelay(raw); else startPoll(raw, iv); return; }
        if (svc.backend) { try { var loc = await fetchLocal(raw, iv, nb); hist = loc.data; setS('s1', '<span class="lwc-ok">' + loc.src + ' (' + hist.length + ' bars)</span>'); } catch (e) { setS('s1', '<span class="lwc-warn">backend err</span>'); } }
        if (!hist.length) { try { hist = await yH(raw, iv, cSec); setS('s1', '<span class="lwc-ok">Yahoo (' + hist.length + ')</span>'); } catch (e) { setS('s1', '<span class="lwc-err">Yahoo: ' + e.message + '</span>'); } }
        try { gap = await yR(raw, iv, cSec); setS('s2', '<span class="lwc-ok">Yahoo gap (' + gap.length + ')</span>'); } catch (e) { setS('s2', '<span class="lwc-err">gap: ' + e.message + '</span>'); }
        var mg2 = merge(hist, gap); if (mg2.length) sc(raw, iv, mg2); renderCandles(mg2);
        if (relayToken) connectRelay(raw); else startPoll(raw, iv);
      }
    }

    return {
      init: function (onReady) {
        requestAnimationFrame(function () {
          initCharts();
          bindButtons();
          detectSvc();
          if (onReady) onReady();
        });
      },
      load: function (sym, iv) {
        if (sym) currentSym = sym.replace(/.*:/, '').toUpperCase();
        var ivEl = g('iv');
        if (iv && ivEl) {
          var mapped = TV_IV[iv] || iv;
          if (['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'].includes(mapped)) ivEl.value = mapped;
        }
        runLoad();
      },
      destroy: function () { stopLive(); },
      ind: togInd, type: setType, tool: setTool, pmode: setPMode,
      log: toggleLog, png: exportPNG, csv: exportCSV, stats: showStats,
      svc: toggleSvc, saveToken: saveToken, clearAll: clearAll
    };
  }

  /* ── Registry ────────────────────────────────────────────────────── */
  var _reg = {};
  var _cnt = 0;
  window._lwcReg = _reg; /* exposed for direct onclick calls */

  window.mcInit = function (container, slot, onReady) {
    if (typeof container === 'string') container = document.querySelector(container);
    if (!container) return;
    slot = slot || 'main';
    if (_reg[slot]) _reg[slot].destroy();
    injectCSS();
    var p = 'lwc' + (++_cnt) + '_';
    container.innerHTML = getHTML(p);
    container.style.overflow = 'hidden';
    var inst = createInstance(p);
    _reg[slot] = inst;
    inst.init(onReady);
  };

  window.mcLoad = function (sym, iv, slot) {
    var inst = _reg[slot || 'main'];
    if (inst) inst.load(sym, iv);
  };

  window.mcDestroy = function (slot) {
    var inst = _reg[slot || 'main'];
    if (inst) { inst.destroy(); delete _reg[slot || 'main']; }
  };

})();
