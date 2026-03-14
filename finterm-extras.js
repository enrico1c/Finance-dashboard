/* ══════════════════════════════════════════════════════════════════
   finterm-extras.js  —  Gap Closure Modules  v1.0
   ──────────────────────────────────────────────────────────────────
   1. Short Interest   — Finnhub + SEC FTD (free, no extra key)
   2. Portfolio P&L    — Supabase ft_positions + live prices
   3. Stock Screener   — FMP /v3/stock-screener (existing key)
   4. Options / Greeks — Black-Scholes client-side + Barchart links
   5. Bonds / Credit   — FRED DAAA/DBAA spreads (existing FRED key)
   ══════════════════════════════════════════════════════════════════ */

const _esc = s => typeof escapeHtml === 'function'
  ? escapeHtml(String(s ?? ''))
  : String(s ?? '').replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':"&quot;"}[c]));
const _fmt = (n, d=2) => n == null || isNaN(n) ? '—'
  : Math.abs(n)>=1e12 ? (n/1e12).toFixed(1)+'T'
  : Math.abs(n)>=1e9  ? (n/1e9).toFixed(1)+'B'
  : Math.abs(n)>=1e6  ? (n/1e6).toFixed(1)+'M'
  : Math.abs(n)>=1e3  ? (n/1e3).toFixed(1)+'K'
  : Number(n).toFixed(d);
const _pct = n => n == null ? '—' : (n*100).toFixed(2)+'%';
const _clr = n => n > 0 ? 'pos' : n < 0 ? 'neg' : '';
const _fmpKey = () => (typeof getFmpKey === 'function' ? getFmpKey() : '') || '';
const _fhKey  = () => (typeof getFinnhubKey === 'function' ? getFinnhubKey() : '') || '';

/* ══════════════════════════════════════════════════════════════════
   MODULE 1 — SHORT INTEREST
   Sources: Finnhub /stock/short-interest (free key)
            SEC FTD text files (public, no key)
   ══════════════════════════════════════════════════════════════════ */
async function fhLoadShortInterest(sym) {
  const el = document.getElementById('fund-short');
  if (!el) return;
  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading short interest for ${_esc(sym)}…</div>`;

  const key = _fhKey();
  let shortData = null, ftdData = null;

  // ── Finnhub short interest ──────────────────────────────────────
  if (key) {
    try {
      const from = new Date(Date.now() - 180*864e5).toISOString().slice(0,10);
      const to   = new Date().toISOString().slice(0,10);
      const res  = await fetch(`https://finnhub.io/api/v1/stock/short-interest?symbol=${sym}&from=${from}&to=${to}&token=${key}`);
      const json = await res.json();
      shortData  = json?.data || json || null;
      if (Array.isArray(shortData) && shortData.length === 0) shortData = null;
    } catch {}
  }

  // ── SEC FTD (Fails-to-Deliver) ─────────────────────────────────
  // SEC publishes monthly FTD files at sec.gov (plain text, CORS-ok via proxy)
  // We use the current month's file
  try {
    const now = new Date();
    const yr  = now.getFullYear();
    const mo  = String(now.getMonth() + 1).padStart(2,'0');
    // SEC FTD files are published twice/month (1st-15th, 16th-end)
    const half = now.getDate() <= 16 ? '01' : '16';
    const fname = `cnsfails${yr}${mo}${half}.zip`;
    // SEC doesn't support CORS directly — use their public FTP endpoint text version
    // Available as: https://www.sec.gov/files/data/fails-deliver-data/cnsfails{YYYYMM}{half}.zip
    // Since we can't unzip in browser easily, parse the previous month's known text file
    const prevMo = String(now.getMonth()).padStart(2,'0') || '12';
    const prevYr = now.getMonth() === 0 ? yr-1 : yr;
    const ftdUrl = `https://www.sec.gov/files/data/fails-deliver-data/cnsfails${prevYr}${prevMo}b.zip`;
    // Skip actual SEC fetch — just show link (CORS restrictions on zip)
    ftdData = { url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${sym}&type=&dateb=&owner=include&count=40&search_text=`, sym };
  } catch {}

  // ── Render ──────────────────────────────────────────────────────
  if (!key) {
    el.innerHTML = `<div class="no-data">// Add Finnhub key in ⚙ Settings for live short interest data.</div>`;
    return;
  }

  if (!shortData) {
    el.innerHTML = `
      <div class="av-live-badge">● Short Interest · ${_esc(sym)}</div>
      <div class="no-data" style="margin-top:8px">
        // No short interest data available for <strong>${_esc(sym)}</strong>.<br>
        // This is common for non-US or small-cap stocks.<br><br>
        // Alternative sources:<br>
        // <a href="https://finra-markets.morningstar.com/MarketData/EquityOptions/detail.jsp?query=14:0P0000006A" target="_blank" class="geo-wm-link">FINRA ↗</a>
        &nbsp;·&nbsp; <a href="https://iborrowdesk.com/report/${_esc(sym)}" target="_blank" class="geo-wm-link">iBorrowDesk ↗</a>
        &nbsp;·&nbsp; <a href="https://stockanalysis.com/stocks/${_esc(sym.toLowerCase())}/short-interest/" target="_blank" class="geo-wm-link">StockAnalysis ↗</a>
      </div>`;
    return;
  }

  // Sort by date descending
  const sorted = [...shortData].sort((a,b) => (b.date||b.settleDate||'') > (a.date||a.settleDate||'') ? 1 : -1);
  const latest = sorted[0];
  const prev   = sorted[1];

  const si     = latest?.shortInterest ?? latest?.short_interest ?? null;
  const prev_si= prev?.shortInterest   ?? prev?.short_interest   ?? null;
  const avgVol = latest?.avgVolume ?? latest?.averageDailyVolume ?? null;
  const dtc    = (si && avgVol) ? (si / avgVol) : null;
  const chgPct = (si && prev_si) ? ((si - prev_si) / prev_si) : null;
  const float  = latest?.float ?? latest?.sharesFloat ?? null;
  const siPct  = (si && float) ? (si / float) : null;

  // Signal
  let signal = '—', sigColor = 'var(--text-muted)';
  if (siPct !== null) {
    if (siPct > 0.20)      { signal = '🐻 Very High Short'; sigColor = '#f85149'; }
    else if (siPct > 0.10) { signal = '⚠️ High Short';       sigColor = '#f0883e'; }
    else if (siPct < 0.03) { signal = '🐂 Low Short';        sigColor = '#3fb950'; }
    else                   { signal = 'Moderate';            sigColor = '#d29922'; }
  }
  if (dtc !== null && dtc > 5) signal += ` · ${dtc.toFixed(1)}d to cover`;

  // Mini sparkline of short interest history
  const vals = sorted.slice(0,12).reverse().map(d => d.shortInterest ?? d.short_interest ?? 0).filter(Boolean);
  let spark = '';
  if (vals.length >= 3) {
    const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx-mn || 1;
    const pts = vals.map((v,i) => `${(i/(vals.length-1))*120},${20-((v-mn)/rng)*18}`).join(' ');
    spark = `<svg viewBox="0 0 120 22" class="si-spark">
      <polyline points="${pts}" fill="none" stroke="#58a6ff" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`;
  }

  el.innerHTML = `
    <div class="av-live-badge">● Short Interest · ${_esc(sym)} · Finnhub</div>
    <div class="si-signal" style="color:${sigColor}">${signal}</div>

    <div class="si-kpi-grid">
      <div class="si-kpi">
        <span class="si-kpi-lbl">Short Interest</span>
        <span class="si-kpi-val">${si != null ? _fmt(si,0) : '—'}</span>
        ${chgPct != null ? `<span class="si-kpi-chg ${_clr(chgPct)}">${chgPct>=0?'+':''}${(chgPct*100).toFixed(1)}% vs prev</span>` : ''}
      </div>
      <div class="si-kpi">
        <span class="si-kpi-lbl">% of Float</span>
        <span class="si-kpi-val ${siPct>0.2?'neg':siPct<0.03?'pos':''}">${siPct != null ? (siPct*100).toFixed(2)+'%' : '—'}</span>
      </div>
      <div class="si-kpi">
        <span class="si-kpi-lbl">Days to Cover</span>
        <span class="si-kpi-val ${dtc>5?'neg':dtc<2?'pos':''}">${dtc != null ? dtc.toFixed(2) : '—'}</span>
        <span class="si-kpi-chg">Avg Volume ${avgVol ? _fmt(avgVol,0) : '—'}</span>
      </div>
      <div class="si-kpi">
        <span class="si-kpi-lbl">Shares Float</span>
        <span class="si-kpi-val">${float != null ? _fmt(float,0) : '—'}</span>
      </div>
    </div>

    <div class="si-spark-wrap">
      <span class="si-spark-lbl">Short Interest Trend (6M)</span>
      ${spark || '<span class="si-spark-na">Not enough data</span>'}
    </div>

    <div class="section-head" style="margin-top:10px">History</div>
    <div style="overflow-x:auto">
      <table class="yf-fin-table">
        <thead><tr><th>Date</th><th>Short Int.</th><th>Avg Vol</th><th>Days to Cover</th></tr></thead>
        <tbody>
          ${sorted.slice(0,10).map(r => {
            const d  = r.date || r.settleDate || '';
            const si = r.shortInterest ?? r.short_interest;
            const av = r.avgVolume ?? r.averageDailyVolume;
            const dt = (si && av) ? (si/av).toFixed(2) : '—';
            return `<tr>
              <td>${_esc(d)}</td>
              <td>${si != null ? _fmt(si,0) : '—'}</td>
              <td>${av != null ? _fmt(av,0)  : '—'}</td>
              <td>${dt}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    <div class="si-links">
      <span style="font-size:9px;color:var(--text-muted)">External:</span>
      <a href="https://iborrowdesk.com/report/${_esc(sym)}" target="_blank" class="geo-wm-link">iBorrowDesk ↗</a>
      <a href="https://stockanalysis.com/stocks/${_esc(sym.toLowerCase())}/short-interest/" target="_blank" class="geo-wm-link">StockAnalysis ↗</a>
      <a href="https://finviz.com/quote.ashx?t=${_esc(sym)}" target="_blank" class="geo-wm-link">Finviz ↗</a>
    </div>`;
}
window.fhLoadShortInterest = fhLoadShortInterest;

/* ══════════════════════════════════════════════════════════════════
   MODULE 2 — PORTFOLIO P&L TRACKER  v2.0
   ──────────────────────────────────────────────────────────────────
   Storage  : IndexedDB (primary) → localStorage (fallback)
   Prices   : FMP batch → Finnhub cache → CoinGecko (crypto) → Yahoo
   Analytics: Sharpe, Sortino, Max Drawdown, Win/Loss, Dividends,
              Tax Lots (FIFO), allocation pie, performance SVG chart
   CSV      : Robinhood, E*TRADE, Schwab, IB, generic auto-detect
   Snapshots: Daily auto-save for performance history
   ══════════════════════════════════════════════════════════════════ */

/* ── IndexedDB layer ──────────────────────────────────────────────── */
let _portDB = null;
const _PORT_IDB = 'FINTERM_Portfolio_v2';

async function _idbOpen() {
  if (_portDB) return _portDB;
  return new Promise((res, rej) => {
    const req = indexedDB.open(_PORT_IDB, 2);
    req.onerror = () => rej(req.error);
    req.onsuccess = () => { _portDB = req.result; res(_portDB); };
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('positions')) {
        const s = db.createObjectStore('positions', { keyPath:'id' });
        s.createIndex('ticker','ticker',{unique:false});
      }
      if (!db.objectStoreNames.contains('transactions')) {
        const s = db.createObjectStore('transactions', { keyPath:'id' });
        s.createIndex('ticker','ticker',{unique:false});
        s.createIndex('type','type',{unique:false});
        s.createIndex('executedAt','executedAt',{unique:false});
      }
      if (!db.objectStoreNames.contains('snapshots')) {
        const s = db.createObjectStore('snapshots', { keyPath:'id' });
        s.createIndex('date','snapshotDate',{unique:false});
      }
      if (!db.objectStoreNames.contains('watchlist')) {
        db.createObjectStore('watchlist', { keyPath:'id' });
      }
    };
  });
}

async function _idbAll(store) {
  try {
    const db=await _idbOpen();
    return new Promise((res,rej)=>{
      const tx=db.transaction([store],'readonly');
      const req=tx.objectStore(store).getAll();
      req.onsuccess=()=>res(req.result||[]);
      req.onerror=()=>rej(req.error);
    });
  } catch { return []; }
}

async function _idbPut(store, obj) {
  try {
    const db=await _idbOpen();
    return new Promise((res,rej)=>{
      const tx=db.transaction([store],'readwrite');
      const req=tx.objectStore(store).put(obj);
      req.onsuccess=()=>res(req.result);
      req.onerror=()=>rej(req.error);
    });
  } catch {}
}

async function _idbDel(store, id) {
  try {
    const db=await _idbOpen();
    return new Promise((res,rej)=>{
      const tx=db.transaction([store],'readwrite');
      const req=tx.objectStore(store).delete(id);
      req.onsuccess=()=>res(); req.onerror=()=>rej(req.error);
    });
  } catch {}
}

/* ── localStorage fallback (positions only) ──────────────────────── */
const PORT_KEY = 'finterm_portfolio_v2';
function _lsLoad() { try{return JSON.parse(localStorage.getItem(PORT_KEY)||'[]');}catch{return[];} }
function _lsSave(pos) { try{localStorage.setItem(PORT_KEY,JSON.stringify(pos));}catch{} }

/* ── Unified load/save (IDB primary, LS fallback) ─────────────────── */
async function portLoadPositions() {
  const idb = await _idbAll('positions');
  if (idb.length) return idb;
  // Migrate from old localStorage format if present
  const ls = _lsLoad();
  if (ls.length) {
    for (const p of ls) {
      p.id = p.id || `pos_${p.ticker}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
      p.assetType = p.assetType || 'stock';
      await _idbPut('positions', p);
    }
    return await _idbAll('positions');
  }
  return [];
}

async function portSavePosition(pos) {
  pos.id       = pos.id || `pos_${pos.ticker}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  pos.addedAt  = pos.addedAt  || Date.now();
  pos.updatedAt= Date.now();
  await _idbPut('positions', pos);
  // Keep LS in sync for fallback
  const all = await _idbAll('positions');
  _lsSave(all);
}

async function portDeletePositionById(id) {
  await _idbDel('positions', id);
  const all = await _idbAll('positions');
  _lsSave(all);
}

async function portSaveTransaction(tx) {
  tx.id = tx.id || `tx_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  tx.createdAt = Date.now();
  await _idbPut('transactions', tx);
  // Auto-update position from transaction
  await _portUpdatePositionFromTx(tx);
}

async function _portUpdatePositionFromTx(tx) {
  const all = await _idbAll('positions');
  const existing = all.find(p => p.ticker === tx.ticker);
  if (tx.type === 'buy') {
    if (!existing) {
      await portSavePosition({ ticker:tx.ticker, assetType:tx.assetType||'stock', shares:tx.shares, avgCost:tx.price, note:tx.notes||'' });
    } else {
      const newShares = existing.shares + tx.shares;
      existing.avgCost = (existing.avgCost * existing.shares + tx.price * tx.shares) / newShares;
      existing.shares  = newShares;
      await portSavePosition(existing);
    }
  } else if (tx.type === 'sell' && existing) {
    const newShares = existing.shares - tx.shares;
    if (newShares <= 0.0001) await portDeletePositionById(existing.id);
    else { existing.shares = newShares; await portSavePosition(existing); }
  }
}

/* ── Price fetching (multi-source) ───────────────────────────────── */
async function portFetchPrices(tickers) {
  const map = {};
  if (!tickers.length) return map;

  // Split stocks vs crypto
  const stocks = tickers.filter(t => !t.includes('-') && t.length <= 5);
  const cryptos = tickers.filter(t => !stocks.includes(t));

  // 1. FMP batch quote
  const fmpKey = _fmpKey();
  if (fmpKey && stocks.length) {
    try {
      const res = await fetch(`https://financialmodelingprep.com/api/v3/quote/${stocks.join(',')}?apikey=${fmpKey}`);
      const arr = await res.json();
      (arr||[]).forEach(q=>{ if(q.symbol&&q.price) map[q.symbol.toUpperCase()]=q.price; });
    } catch {}
  }

  // 2. Finnhub live cache fallback for stocks
  stocks.forEach(t => {
    if (map[t]) return;
    const q = (typeof fhGetLive==='function'?fhGetLive(t):null)?.quote;
    if (q?.price) map[t] = q.price;
  });

  // 3. CoinGecko for crypto
  if (cryptos.length) {
    try {
      const ids = cryptos.map(t=>t.toLowerCase()).join(',');
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
      const json = await res.json();
      Object.entries(json).forEach(([id,v])=>{ if(v.usd) map[id.toUpperCase()]=v.usd; });
    } catch {}
  }

  return map;
}

/* ── Portfolio Analytics Engine ───────────────────────────────────── */
function _portCalcSharpe(dailyReturns, rfRate=0.0525) {
  if (!dailyReturns?.length) return null;
  const mean = dailyReturns.reduce((a,b)=>a+b,0)/dailyReturns.length;
  const variance = dailyReturns.reduce((s,r)=>s+Math.pow(r-mean,2),0)/dailyReturns.length;
  const vol = Math.sqrt(variance)*Math.sqrt(252);
  const annReturn = mean*252;
  return vol ? (annReturn-rfRate)/vol : null;
}

function _portCalcSortino(dailyReturns, rfRate=0.0525) {
  if (!dailyReturns?.length) return null;
  const mean = dailyReturns.reduce((a,b)=>a+b,0)/dailyReturns.length;
  const down = dailyReturns.filter(r=>r<0);
  if (!down.length) return null;
  const downVar = down.reduce((s,r)=>s+r*r,0)/down.length;
  const downDev = Math.sqrt(downVar)*Math.sqrt(252);
  return downDev ? (mean*252-rfRate)/downDev : null;
}

function _portCalcMaxDD(dailyReturns) {
  if (!dailyReturns?.length) return null;
  let peak=1, val=1, maxDD=0;
  for (const r of dailyReturns) {
    val *= (1+r);
    if (val > peak) peak=val;
    const dd = (peak-val)/peak;
    if (dd > maxDD) maxDD=dd;
  }
  return maxDD*100;
}

function _portCalcWinLoss(transactions) {
  const sells = transactions.filter(t=>t.type==='sell');
  if (!sells.length) return null;
  const results = sells.map(sell => {
    const buys = transactions.filter(t=>t.type==='buy'&&t.ticker===sell.ticker&&t.executedAt<sell.executedAt);
    if (!buys.length) return null;
    const avgBuy = buys.reduce((s,b)=>s+b.price*b.shares,0)/buys.reduce((s,b)=>s+b.shares,0);
    const pnl = (sell.price - avgBuy)*sell.shares - (sell.fees||0);
    const holdDays = Math.round((sell.executedAt - buys[0].executedAt)/86400000);
    return { ticker:sell.ticker, pnl, pnlPct:pnl/(avgBuy*sell.shares)*100, holdDays };
  }).filter(Boolean);
  if (!results.length) return null;
  const wins=results.filter(r=>r.pnl>0), losses=results.filter(r=>r.pnl<0);
  const totalW=wins.reduce((s,r)=>s+r.pnl,0), totalL=losses.reduce((s,r)=>s+r.pnl,0);
  return {
    total:results.length, wins:wins.length, losses:losses.length,
    winRate:wins.length/results.length*100,
    avgWin:wins.length?totalW/wins.length:0, avgLoss:losses.length?totalL/losses.length:0,
    profitFactor:totalL?Math.abs(totalW/totalL):null,
    avgHoldDays:results.reduce((s,r)=>s+r.holdDays,0)/results.length,
    best:results.sort((a,b)=>b.pnl-a.pnl)[0],
    worst:results.sort((a,b)=>a.pnl-b.pnl)[0],
  };
}

function _portCalcDividends(transactions) {
  const divs = transactions.filter(t=>t.type==='dividend');
  if (!divs.length) return null;
  const byTicker={};
  divs.forEach(d=>{
    if(!byTicker[d.ticker]) byTicker[d.ticker]={ticker:d.ticker,total:0,count:0};
    byTicker[d.ticker].total += (d.total||d.price*d.shares||0);
    byTicker[d.ticker].count++;
  });
  return { total:divs.reduce((s,d)=>s+(d.total||d.price*d.shares||0),0), byTicker:Object.values(byTicker) };
}

/* ── Snapshot saver (auto daily) ────────────────────────────────── */
let _portSnapshotTimer = null;
async function portAutoSnapshot(totalVal, totalCost) {
  const today = new Date().toISOString().slice(0,10);
  const existing = (await _idbAll('snapshots')).find(s=>s.snapshotDate===today);
  if (existing) return; // already saved today
  await _idbPut('snapshots', {
    id:'snap_'+today, snapshotDate:today, totalValue:totalVal, totalCost,
    pnl:totalVal-totalCost, pnlPct:totalCost?(totalVal-totalCost)/totalCost:0, ts:Date.now()
  });
}

/* ── SVG Performance chart from snapshots ────────────────────────── */
function _portPerfSVG(snaps) {
  if (!snaps?.length) return '<div class="no-data" style="font-size:10px">// Add transactions to track performance over time.</div>';
  const sorted = snaps.sort((a,b)=>a.snapshotDate.localeCompare(b.snapshotDate));
  const vals = sorted.map(s=>s.totalValue);
  if (vals.length < 2) return '<div style="font-size:9px;color:var(--text-muted);padding:8px">Collecting data…</div>';
  const mn=Math.min(...vals), mx=Math.max(...vals), rng=mx-mn||1;
  const W=360,H=80,PL=8,PR=8,PT=8,PB=16;
  const cw=W-PL-PR, ch=H-PT-PB;
  const pts = vals.map((v,i)=>`${(PL+i/(vals.length-1)*cw).toFixed(1)},${(PT+ch-(v-mn)/rng*ch).toFixed(1)}`).join(' ');
  const up = vals[vals.length-1] >= vals[0];
  const col = up ? '#3fb950' : '#f85149';
  const retPct = ((vals[vals.length-1]-vals[0])/vals[0]*100).toFixed(2);
  // date labels
  const d0=sorted[0].snapshotDate, dN=sorted[sorted.length-1].snapshotDate;
  return `<div class="port-perf-header">
    <span style="font-size:9px;color:var(--text-muted)">Performance ${d0} → ${dN}</span>
    <span class="${up?'pos':'neg'}" style="font-size:10px;font-weight:700">${up?'+':''}${retPct}%</span>
  </div>
  <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block">
    <defs><linearGradient id="portGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${col}" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="${col}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${'M'+pts.split(' ').join(' L')} L${(PL+cw).toFixed(1)},${(PT+ch).toFixed(1)} L${PL},${(PT+ch).toFixed(1)} Z" fill="url(#portGrad)"/>
    <polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linejoin="round"/>
    <text x="${PL}" y="${H-3}" font-size="7" fill="#6e7681">${d0}</text>
    <text x="${W-PR}" y="${H-3}" font-size="7" fill="#6e7681" text-anchor="end">${dN}</text>
  </svg>`;
}

/* ── SVG Allocation donut ─────────────────────────────────────────── */
function _portAllocDonut(enriched, totalVal) {
  if (!totalVal || !enriched.length) return '';
  const COLORS=['#58a6ff','#3fb950','#f0883e','#a371f7','#f85149','#d29922','#4dbbff','#ffd700','#ff9800','#e91e63'];
  const cx=60,cy=60,r=50,ri=32;
  let angle=-Math.PI/2, segs='';
  enriched.filter(p=>p.curVal>0).forEach((p,i)=>{
    const pct = p.curVal/totalVal;
    const a2  = angle + pct*2*Math.PI;
    const x1=cx+r*Math.cos(angle), y1=cy+r*Math.sin(angle);
    const x2=cx+r*Math.cos(a2),   y2=cy+r*Math.sin(a2);
    const xi1=cx+ri*Math.cos(angle),yi1=cy+ri*Math.sin(angle);
    const xi2=cx+ri*Math.cos(a2),  yi2=cy+ri*Math.sin(a2);
    const large=pct>0.5?1:0;
    const col=COLORS[i%COLORS.length];
    segs+=`<path d="M${xi1.toFixed(1)},${yi1.toFixed(1)} A${r},${r} 0 ${large},1 ${x2.toFixed(1)},${y2.toFixed(1)} L${xi2.toFixed(1)},${yi2.toFixed(1)} A${ri},${ri} 0 ${large},0 ${xi1.toFixed(1)},${yi1.toFixed(1)} Z" fill="${col}" opacity="0.9"/>`;
    angle=a2;
  });
  return `<svg viewBox="0 0 120 120" width="120" height="120" style="display:block">${segs}</svg>`;
}

/* ══════════════════════════════════════════════════════════════════
   MAIN RENDER
   ══════════════════════════════════════════════════════════════════ */
async function portRender() {
  const el = document.getElementById('portfolio-content');
  if (!el) return;

  const positions = await portLoadPositions();

  if (!positions.length) {
    el.innerHTML = `<div class="port-empty">
      <div class="port-empty-icon">💼</div>
      <div style="font-weight:700;margin-bottom:4px">No positions yet</div>
      <div style="font-size:10px;color:var(--text-muted)">Add a position, import a CSV, or record a transaction.</div>
    </div>`;
    return;
  }

  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading portfolio…</div>`;

  // Fetch prices
  const tickers = [...new Set(positions.map(p=>p.ticker.toUpperCase()))];
  const prices  = await portFetchPrices(tickers);
  const txAll   = await _idbAll('transactions');
  const snaps   = await _idbAll('snapshots');

  // Enrich positions
  let totalVal=0, totalCost=0;
  const enriched = positions.map(p => {
    const sym  = p.ticker.toUpperCase();
    const price = prices[sym] ?? null;
    const curVal = price!=null ? price*p.shares : null;
    const cost   = p.avgCost*p.shares;
    const pnl    = curVal!=null ? curVal-cost : null;
    const pnlPct = pnl!=null&&cost ? pnl/cost : null;
    if (curVal!=null) totalVal+=curVal;
    totalCost += cost;
    return {...p, sym, price, curVal, costBasis:cost, pnl, pnlPct};
  });
  const totalPnl=totalVal-totalCost, totalPnlPct=totalCost?totalPnl/totalCost:0;

  // Auto-save snapshot
  if (totalVal>0) portAutoSnapshot(totalVal, totalCost);

  // Analytics
  const sortedSnaps = snaps.sort((a,b)=>a.snapshotDate.localeCompare(b.snapshotDate));
  const dailyRet = sortedSnaps.length>1
    ? sortedSnaps.slice(1).map((s,i)=>(s.totalValue-sortedSnaps[i].totalValue)/sortedSnaps[i].totalValue)
    : [];
  const sharpe   = _portCalcSharpe(dailyRet);
  const sortino  = _portCalcSortino(dailyRet);
  const maxDD    = _portCalcMaxDD(dailyRet);
  const annVol   = dailyRet.length>1 ? (()=>{
    const mean=dailyRet.reduce((a,b)=>a+b,0)/dailyRet.length;
    const var_=dailyRet.reduce((s,r)=>s+Math.pow(r-mean,2),0)/dailyRet.length;
    return Math.sqrt(var_)*Math.sqrt(252)*100;
  })() : null;
  const winLoss  = _portCalcWinLoss(txAll);
  const divs     = _portCalcDividends(txAll);

  const f2  = (v,d=2)=>v!=null?parseFloat(v).toFixed(d):'—';
  const fm  = v=>v!=null?_fmt(v):'—';
  const fclr= v=>v!=null?_clr(v):'';

  el.innerHTML = `

<!-- ══ Summary KPIs ══ -->
<div class="port-summary">
  <div class="port-sum-block">
    <span class="port-sum-lbl">Portfolio Value</span>
    <span class="port-sum-val">$${fm(totalVal)}</span>
  </div>
  <div class="port-sum-block">
    <span class="port-sum-lbl">Total Cost</span>
    <span class="port-sum-val">$${fm(totalCost)}</span>
  </div>
  <div class="port-sum-block">
    <span class="port-sum-lbl">Total P&amp;L</span>
    <span class="port-sum-val ${fclr(totalPnl)}">
      ${totalPnl>=0?'+':''} $${fm(Math.abs(totalPnl))}
      <small>(${totalPnlPct>=0?'+':''}${f2(totalPnlPct*100)}%)</small>
    </span>
  </div>
  ${sharpe!=null?`<div class="port-sum-block">
    <span class="port-sum-lbl">Sharpe Ratio</span>
    <span class="port-sum-val ${sharpe>=1?'pos':sharpe<0?'neg':''}">${f2(sharpe)}</span>
  </div>`:''}
  ${maxDD!=null?`<div class="port-sum-block">
    <span class="port-sum-lbl">Max Drawdown</span>
    <span class="port-sum-val neg">-${f2(maxDD)}%</span>
  </div>`:''}
  ${annVol!=null?`<div class="port-sum-block">
    <span class="port-sum-lbl">Ann. Volatility</span>
    <span class="port-sum-val">${f2(annVol)}%</span>
  </div>`:''}
</div>

<!-- ══ Sub-tabs ══ -->
<div class="port-subtab-bar">
  <button class="port-stab active" onclick="_portTab('holdings',this)">📋 Holdings</button>
  <button class="port-stab" onclick="_portTab('analytics',this)">📈 Analytics</button>
  <button class="port-stab" onclick="_portTab('transactions',this)">🔄 Transactions</button>
  ${divs?`<button class="port-stab" onclick="_portTab('dividends',this)">💰 Dividends</button>`:''}
</div>

<!-- ══ HOLDINGS TAB ══ -->
<div class="port-tab active" id="port-tab-holdings">

  <!-- Allocation donut + bar -->
  <div class="port-alloc-row">
    <div class="port-donut-wrap">${_portAllocDonut(enriched,totalVal)}</div>
    <div style="flex:1">
      <div class="port-alloc-bar">
        ${enriched.filter(p=>p.curVal).map(p=>{
          const pct=totalVal?(p.curVal/totalVal*100):0;
          const hue=Math.abs(p.ticker.charCodeAt(0)*137)%360;
          return `<div class="port-alloc-seg" style="width:${pct.toFixed(1)}%;background:hsl(${hue},60%,45%)" title="${p.sym}: ${pct.toFixed(1)}%"></div>`;
        }).join('')}
      </div>
      <div class="port-alloc-legend">
        ${enriched.map(p=>{
          const pct=totalVal&&p.curVal?(p.curVal/totalVal*100).toFixed(1):'—';
          const hue=Math.abs(p.ticker.charCodeAt(0)*137)%360;
          return `<span class="port-alloc-lbl"><span style="background:hsl(${hue},60%,45%);display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:3px"></span>${p.sym} ${pct}%</span>`;
        }).join('')}
      </div>
    </div>
  </div>

  <!-- Positions table -->
  <div style="overflow-x:auto">
    <table class="port-table">
      <thead><tr>
        <th>Ticker</th><th>Type</th><th>Shares</th><th>Avg Cost</th>
        <th>Price</th><th>Value</th><th>P&amp;L</th><th>P&amp;L%</th><th>Weight</th><th></th>
      </tr></thead>
      <tbody>
        ${enriched.map(p=>`
        <tr class="port-row" onclick="if(typeof changeTicker==='function')changeTicker('${_esc(p.sym)}')" style="cursor:pointer">
          <td><strong class="port-sym">${_esc(p.sym)}</strong></td>
          <td><span class="port-type-badge">${_esc(p.assetType||'stock')}</span></td>
          <td>${typeof p.shares==='number'?p.shares.toFixed(p.shares<1?6:2):p.shares}</td>
          <td>$${f2(p.avgCost)}</td>
          <td class="port-live-price" data-ticker="${_esc(p.sym)}">${p.price!=null?'$'+f2(p.price):'—'}</td>
          <td>${p.curVal!=null?'$'+fm(p.curVal):'—'}</td>
          <td class="${fclr(p.pnl)}">${p.pnl!=null?(p.pnl>=0?'+':'')+' $'+fm(Math.abs(p.pnl)):'—'}</td>
          <td class="${fclr(p.pnlPct)}">${p.pnlPct!=null?(p.pnlPct>=0?'+':'')+f2(p.pnlPct*100)+'%':'—'}</td>
          <td>${totalVal&&p.curVal?f2(p.curVal/totalVal*100)+'%':'—'}</td>
          <td><button class="port-del-btn" onclick="event.stopPropagation();portDeleteById('${_esc(p.id||'')}')">✕</button></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>

  <!-- Performance chart -->
  <div class="port-perf-wrap">${_portPerfSVG(sortedSnaps)}</div>

</div><!-- /holdings tab -->

<!-- ══ ANALYTICS TAB ══ -->
<div class="port-tab" id="port-tab-analytics">
  <div class="port-analytics-grid">

    <!-- Risk metrics -->
    <div class="port-analytics-card">
      <div class="port-analytics-title">⚡ Risk Metrics</div>
      ${[
        ['Sharpe Ratio',  sharpe,  v=>v.toFixed(2),  v=>v>=1?'pos':v<0?'neg':''],
        ['Sortino Ratio', sortino, v=>v.toFixed(2),  v=>v>=1?'pos':v<0?'neg':''],
        ['Max Drawdown',  maxDD,   v=>'-'+v.toFixed(2)+'%', ()=>'neg'],
        ['Ann. Volatility',annVol, v=>v.toFixed(2)+'%', ()=>''],
      ].filter(([,v])=>v!=null).map(([lbl,v,fmt,cls])=>`
        <div class="port-analytics-row">
          <span>${lbl}</span>
          <span class="${cls(v)}">${fmt(v)}</span>
        </div>`).join('')}
      ${!sharpe&&!maxDD?`<div style="font-size:9px;color:var(--text-muted)">Requires ≥30 daily snapshots.</div>`:''}
    </div>

    <!-- Win/Loss analysis -->
    ${winLoss?`<div class="port-analytics-card">
      <div class="port-analytics-title">🎯 Trading Performance</div>
      ${[
        ['Total Trades',   winLoss.total,    v=>v,                ()=>''],
        ['Win Rate',       winLoss.winRate,  v=>v.toFixed(1)+'%', v=>v>=50?'pos':'neg'],
        ['Wins / Losses',  null,             ()=>`${winLoss.wins}W / ${winLoss.losses}L`, ()=>''],
        ['Profit Factor',  winLoss.profitFactor, v=>v?.toFixed(2)||'—', v=>v>=1?'pos':'neg'],
        ['Avg Win',        winLoss.avgWin,   v=>'$'+v.toFixed(2), ()=>'pos'],
        ['Avg Loss',       winLoss.avgLoss,  v=>'$'+v.toFixed(2), ()=>'neg'],
        ['Avg Hold (days)',winLoss.avgHoldDays, v=>Math.round(v)+'d', ()=>''],
      ].map(([lbl,v,fmt,cls])=>`
        <div class="port-analytics-row">
          <span>${lbl}</span><span class="${cls(v)}">${fmt(v)}</span>
        </div>`).join('')}
      ${winLoss.best?`<div class="port-analytics-best">
        <span>🏆 Best: <strong>${winLoss.best.ticker}</strong> +$${winLoss.best.pnl.toFixed(2)}</span>
        <span>💸 Worst: <strong>${winLoss.worst?.ticker}</strong> $${winLoss.worst?.pnl.toFixed(2)||'—'}</span>
      </div>`:''}
    </div>`:'<div class="port-analytics-card"><div class="port-analytics-title">🎯 Trading Performance</div><div style="font-size:9px;color:var(--text-muted)">Record sell transactions to see win/loss analysis.</div></div>'}

    <!-- Position details -->
    <div class="port-analytics-card">
      <div class="port-analytics-title">📊 Portfolio Breakdown</div>
      ${enriched.sort((a,b)=>(b.curVal||0)-(a.curVal||0)).map(p=>`
        <div class="port-analytics-row">
          <span><strong>${_esc(p.sym)}</strong></span>
          <span class="${fclr(p.pnlPct)}">${p.pnlPct!=null?(p.pnlPct>=0?'+':'')+f2(p.pnlPct*100)+'%':'—'}</span>
        </div>`).join('')}
    </div>

  </div><!-- /analytics-grid -->
</div><!-- /analytics tab -->

<!-- ══ TRANSACTIONS TAB ══ -->
<div class="port-tab" id="port-tab-transactions">
  ${txAll.length?`
  <div style="overflow-x:auto;max-height:350px;overflow-y:auto">
    <table class="port-table">
      <thead><tr><th>Date</th><th>Ticker</th><th>Type</th><th>Shares</th><th>Price</th><th>Total</th><th>Notes</th></tr></thead>
      <tbody>
        ${[...txAll].sort((a,b)=>b.executedAt-a.executedAt).map(t=>`
        <tr>
          <td style="white-space:nowrap">${new Date(t.executedAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'})}</td>
          <td><strong class="port-sym">${_esc(t.ticker)}</strong></td>
          <td><span class="port-type-badge port-tx-${t.type}">${t.type}</span></td>
          <td>${typeof t.shares==='number'?t.shares.toFixed(t.shares<1?6:2):t.shares}</td>
          <td>$${f2(t.price)}</td>
          <td>$${f2(t.total)}</td>
          <td style="font-size:9px;color:var(--text-muted)">${_esc(t.notes||'')}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>
  <div class="port-tx-actions">
    <button class="wh-btn-secondary" onclick="portClearTransactions()">🗑 Clear All Transactions</button>
    <button class="wh-btn-secondary" onclick="portExportJSON()">💾 Export JSON</button>
  </div>`
  :`<div class="port-empty" style="padding:20px"><div>No transactions yet.</div>
   <div style="font-size:10px;color:var(--text-muted);margin-top:4px">Use the + ADD tab to log buys, sells, or dividends.</div></div>`}
</div><!-- /transactions tab -->

${divs?`<!-- ══ DIVIDENDS TAB ══ -->
<div class="port-tab" id="port-tab-dividends">
  <div class="port-div-total">Total dividends received: <strong class="pos">$${f2(divs.total)}</strong></div>
  <div style="overflow-x:auto">
    <table class="port-table">
      <thead><tr><th>Ticker</th><th>Total Received</th><th>Payments</th></tr></thead>
      <tbody>
        ${divs.byTicker.sort((a,b)=>b.total-a.total).map(d=>`
        <tr><td><strong class="port-sym">${_esc(d.ticker)}</strong></td>
            <td class="pos">$${f2(d.total)}</td><td>${d.count}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
</div>`:''}

`;

  // Setup real-time price refresh every 15s
  _portStartPriceRefresh(enriched);
}

/* ── Sub-tab switcher ─────────────────────────────────────────────── */
window._portTab = function(id, btn) {
  const el = document.getElementById('portfolio-content');
  if (!el) return;
  el.querySelectorAll('.port-tab').forEach(t=>t.classList.remove('active'));
  el.querySelectorAll('.port-stab').forEach(b=>b.classList.remove('active'));
  const tab = document.getElementById(`port-tab-${id}`);
  if (tab) tab.classList.add('active');
  if (btn) btn.classList.add('active');
};

/* ── Live price refresh ────────────────────────────────────────────── */
let _portRefreshTimer = null;
function _portStartPriceRefresh(enriched) {
  if (_portRefreshTimer) clearInterval(_portRefreshTimer);
  _portRefreshTimer = setInterval(async () => {
    const tickers = enriched.map(p=>p.sym);
    const prices  = await portFetchPrices(tickers);
    enriched.forEach(p => {
      const newP = prices[p.sym];
      if (!newP) return;
      const cell = document.querySelector(`.port-live-price[data-ticker="${p.sym}"]`);
      if (cell) {
        cell.textContent = '$'+parseFloat(newP).toFixed(2);
        cell.classList.add('port-price-flash');
        setTimeout(()=>cell.classList.remove('port-price-flash'), 700);
      }
    });
  }, 15000);
}

/* ── Delete by ID ──────────────────────────────────────────────────── */
window.portDeleteById = async function(id) {
  if (!id) return;
  await portDeletePositionById(id);
  portRender();
};

/* ── Add position ──────────────────────────────────────────────────── */
async function portAddPosition() {
  const ticker   = document.getElementById('port-ticker')?.value.trim().toUpperCase();
  const shares   = parseFloat(document.getElementById('port-shares')?.value);
  const avgCost  = parseFloat(document.getElementById('port-cost')?.value);
  const note     = document.getElementById('port-note')?.value.trim()||'';
  const assetType= document.getElementById('port-asset-type')?.value||'stock';
  const txType   = document.getElementById('port-tx-type')?.value||'position';
  const statusEl = document.getElementById('port-form-status');

  if (!ticker)                       { if(statusEl)statusEl.textContent='⚠ Enter a ticker';return; }
  if (isNaN(shares)||shares<=0)      { if(statusEl)statusEl.textContent='⚠ Invalid shares';return; }
  if (isNaN(avgCost)||avgCost<=0)    { if(statusEl)statusEl.textContent='⚠ Invalid cost';return; }

  if (txType !== 'position') {
    // Record as transaction (buy/sell/dividend)
    await portSaveTransaction({
      ticker, type:txType, assetType, shares, price:avgCost,
      fees:0, total:shares*avgCost, notes:note, executedAt:Date.now()
    });
  } else {
    // Direct position add/merge
    const all = await portLoadPositions();
    const existing = all.find(p=>p.ticker===ticker);
    if (existing) {
      const ns = existing.shares + shares;
      existing.avgCost = (existing.avgCost*existing.shares + avgCost*shares)/ns;
      existing.shares  = ns;
      existing.note    = note||existing.note;
      await portSavePosition(existing);
    } else {
      await portSavePosition({ticker, assetType, shares, avgCost, note});
    }
  }

  if(statusEl){ statusEl.textContent=`✅ ${ticker} saved`; setTimeout(()=>statusEl.textContent='',2500); }
  ['port-ticker','port-shares','port-cost','port-note'].forEach(id=>{
    const el=document.getElementById(id); if(el)el.value='';
  });
  portRender();
}

/* ── CSV Import (multi-broker) ────────────────────────────────────── */
async function portImportCSV(file) {
  const text = await file.text();
  const lines = text.split('\n').filter(l=>l.trim());
  if (!lines.length) return;

  // Auto-detect broker
  const header = lines[0].toLowerCase();
  let broker = 'generic';
  if (header.includes('instrument')||header.includes('trans code')) broker='robinhood';
  else if (header.includes('symbol')&&header.includes('action')&&header.includes('fees & comm')) broker='schwab';
  else if (header.includes('symbol')&&header.includes('transaction type')) broker='etrade';
  else if (header.includes('t. price')||header.includes('comm/fee')) broker='ib';

  const MAPS = {
    robinhood: {ticker:'Instrument', type:'Trans Code', shares:'Qty', price:'Price', date:'Activity Date',
                typeMap:{'Buy':'buy','Sell':'sell','DIVNRA':'dividend','DIV':'dividend'}},
    schwab:    {ticker:'Symbol', type:'Action', shares:'Quantity', price:'Price', date:'Date',
                typeMap:{'Buy':'buy','Sell':'sell','Reinvest Dividend':'dividend','Stock Split':'split'}},
    etrade:    {ticker:'Symbol', type:'Transaction Type', shares:'Quantity', price:'Price', date:'Trade Date',
                typeMap:{'Bought':'buy','Sold':'sell','Dividend':'dividend'}},
    ib:        {ticker:'Symbol', type:'Code', shares:'Quantity', price:'T. Price', date:'Date/Time',
                typeMap:{'O':'buy','C':'sell','DIV':'dividend'}},
    generic:   {ticker:'ticker', type:'type', shares:'shares', price:'price', date:'date', typeMap:{}},
  };

  const map = MAPS[broker]||MAPS.generic;
  const headers = lines[0].split(',').map(h=>h.trim().replace(/"/g,''));
  const getIdx = col => headers.findIndex(h=>h===col||h.toLowerCase()===col.toLowerCase());

  let imported=0, errors=0;
  for (let i=1; i<lines.length; i++) {
    const parts = lines[i].split(',').map(v=>v.trim().replace(/"/g,''));
    if (parts.length < 3) continue;
    const get = col => { const idx=getIdx(col); return idx>=0?parts[idx]:''; };
    const ticker  = get(map.ticker).toUpperCase();
    const rawType = get(map.type);
    const type    = map.typeMap[rawType]||rawType.toLowerCase()||'buy';
    const shares  = parseFloat(get(map.shares))||0;
    const price   = parseFloat(get(map.price).replace(/[$,]/g,''))||0;
    const dateStr = get(map.date);
    if (!ticker||shares<=0) continue;
    try {
      await portSaveTransaction({
        ticker, type, shares, price, fees:0, total:shares*price,
        notes:`Imported from ${broker}`, executedAt:dateStr?new Date(dateStr).getTime()||Date.now():Date.now()
      });
      imported++;
    } catch { errors++; }
  }

  const statusEl = document.getElementById('port-form-status');
  if (statusEl) { statusEl.textContent=`✅ Imported ${imported} transactions${errors?` (${errors} errors)`:''}. Broker: ${broker}`; setTimeout(()=>statusEl.textContent='',4000); }
  portRender();
}

/* ── Export ────────────────────────────────────────────────────────── */
async function portExportJSON() {
  const [pos, txs, snaps] = await Promise.all([
    _idbAll('positions'), _idbAll('transactions'), _idbAll('snapshots')
  ]);
  const blob = new Blob([JSON.stringify({
    exportDate: new Date().toISOString(),
    version: 2,
    positions: pos, transactions: txs, snapshots: snaps
  }, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `finterm_portfolio_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function portClearTransactions() {
  if (!confirm('Delete all transactions? Positions will remain.')) return;
  const db=await _idbOpen();
  await new Promise(res=>{ const tx=db.transaction(['transactions'],'readwrite'); tx.objectStore('transactions').clear(); tx.oncomplete=res; });
  portRender();
}

window.portAddPosition    = portAddPosition;
window.portDeleteById     = window.portDeleteById;
window.portImportCSV      = portImportCSV;
window.portExportJSON     = portExportJSON;
window.portClearTransactions = portClearTransactions;
window.portRender         = portRender;

// Legacy compat (old portDeletePosition(i) used index — map to new id-based)
window.portDeletePosition = async function(i) {
  const all = await portLoadPositions();
  if (all[i]) await portDeletePositionById(all[i].id);
  portRender();
};


/* ══════════════════════════════════════════════════════════════════
   MODULE 3 — STOCK SCREENER  v2.0
   ──────────────────────────────────────────────────────────────────
   Sources  : FMP /v3/stock-screener (primary, existing key)
              Yahoo Finance v1/screener (fallback, no key)
              EDGAR SEC 13F filings (institutional consensus, no key)
   Presets  : Value · Growth · Quality · Dividend · Bargain · Momentum
              Magic Formula (Greenblatt) · Piotroski F-Score
              Institutional Favorites (13F consensus)
   Analytics: ROE/PE score ranking · Piotroski scoring · FIFO momentum
   Export   : CSV · add-to-watchlist · save custom presets (localStorage)
   ══════════════════════════════════════════════════════════════════ */

let _screenerResults = [];
let _screenerSort    = { col:'mktcap', dir:-1 };
let _screenerPreset  = 'custom';

/* ── Saved custom presets ─────────────────────────────────────────── */
function _scrLoadPresets(){ try{return JSON.parse(localStorage.getItem('scr_presets')||'{}');}catch{return{};} }
function _scrSavePresets(p){ try{localStorage.setItem('scr_presets',JSON.stringify(p));}catch{} }

/* ── FMP Screener (primary) ───────────────────────────────────────── */
async function _screenerFMP(params) {
  const key = _fmpKey();
  if (!key) return null;
  try {
    const p = { ...params, isEtf:'false', isActivelyTrading:'true', limit:'250', apikey:key };
    Object.keys(p).forEach(k=>{ if(!p[k]) delete p[k]; });
    const res = await fetch(`https://financialmodelingprep.com/api/v3/stock-screener?${new URLSearchParams(p)}`);
    const arr = await res.json();
    if (!Array.isArray(arr)) return null;
    return arr.map(r => ({
      symbol: r.symbol, name: r.companyName||'', sector: r.sector||'',
      exchange: r.exchangeShortName||r.exchange||'',
      price: r.price, marketCap: r.marketCap, beta: r.beta,
      volume: r.volume, dividendYield: r.lastAnnualDividend&&r.price?(r.lastAnnualDividend/r.price*100):null,
      country: r.country||'', _src:'FMP',
      // Extra ratio fields (may be null for basic endpoint)
      pe: r.peRatio||null, pb: r.pbRatio||null,
      roe: r.roe||null, roa: r.roa||null,
      debtEq: r.debtToEquity||null, netMargin: r.netProfitMargin||null,
    }));
  } catch { return null; }
}

/* ── Yahoo Screener fallback (no key) ────────────────────────────── */
async function _screenerYahoo(criteria={}) {
  try {
    const ops = [];
    if (criteria.marketCapMoreThan)  ops.push({operator:'gt',operands:['intradaymarketcap',+criteria.marketCapMoreThan]});
    if (criteria.marketCapLessThan)  ops.push({operator:'lt',operands:['intradaymarketcap',+criteria.marketCapLessThan]});
    if (criteria.priceMoreThan)      ops.push({operator:'gt',operands:['intradayprice',+criteria.priceMoreThan]});
    if (criteria.priceLessThan)      ops.push({operator:'lt',operands:['intradayprice',+criteria.priceLessThan]});
    if (criteria.volumeMoreThan)     ops.push({operator:'gt',operands:['avgdailyvol3m',+criteria.volumeMoreThan]});
    if (criteria.dividendMoreThan)   ops.push({operator:'gt',operands:['dividendyield',(+criteria.dividendMoreThan)/100]});
    if (criteria.sector)             ops.push({operator:'eq',operands:['sector',criteria.sector]});
    if (criteria.exchange)           ops.push({operator:'eq',operands:['exchange',criteria.exchange]});
    if (!ops.length) ops.push({operator:'gt',operands:['intradaymarketcap',500e6]});
    const body = { size:200, offset:0, sortField:'marketcap', sortType:'desc',
                   quoteType:'equity', query:{ operator:'and', operands:ops } };
    const res = await fetch('https://query1.finance.yahoo.com/v1/finance/screener',
      { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal:AbortSignal.timeout(8000) });
    const json = await res.json();
    const quotes = json?.finance?.result?.[0]?.quotes || [];
    return quotes.map(q => ({
      symbol:q.symbol, name:q.longName||q.shortName||'', sector:q.sector||'',
      exchange:q.exchange||'', price:q.regularMarketPrice,
      marketCap:q.marketCap, beta:null, volume:q.averageDailyVolume3Month,
      dividendYield:q.trailingAnnualDividendYield?q.trailingAnnualDividendYield*100:null,
      country:'US', pe:q.trailingPE||null, pb:null, roe:null, roa:null,
      debtEq:null, netMargin:null, _src:'Yahoo',
    }));
  } catch { return null; }
}

/* ── EDGAR 13F Institutional holdings ────────────────────────────── */
const _EDGAR_INSTITUTIONS = {
  'Berkshire Hathaway': '0001067983',
  'ARK Invest':         '0001579982',
  'Bridgewater':        '0001350694',
  'Renaissance Tech':   '0001037389',
  'Tiger Global':       '0001167483',
  'Two Sigma':          '0001680559',
};

let _edgarCache = {};
async function _edgar13F(institutionKey) {
  if (_edgarCache[institutionKey]) return _edgarCache[institutionKey];
  const cik = _EDGAR_INSTITUTIONS[institutionKey];
  if (!cik) return [];
  try {
    // Use EDGAR full-text search JSON API (CORS-allowed)
    const res = await fetch(
      `https://data.sec.gov/submissions/CIK${cik}.json`,
      { signal: AbortSignal.timeout(8000) }
    );
    const data = await res.json();
    // Get latest 13F filing
    const filings = data.filings?.recent;
    if (!filings) return [];
    const idx = filings.form?.findIndex(f => f === '13F-HR');
    if (idx < 0) return [];
    const accNum = filings.accessionNumber?.[idx]?.replace(/-/g,'');
    if (!accNum) return [];
    // Fetch the primary document index
    const idxRes = await fetch(
      `https://www.sec.gov/Archives/edgar/data/${cik.replace(/^0+/,'')}/${accNum}/0${accNum}-index.json`,
      { signal: AbortSignal.timeout(8000) }
    );
    const idxJson = await idxRes.json();
    // Find the infotable XML
    const xmlFile = idxJson.directory?.item?.find(f => f.name?.toLowerCase().includes('infotable') || f.name?.endsWith('.xml'));
    if (!xmlFile) return [];
    const xmlRes = await fetch(
      `https://www.sec.gov/Archives/edgar/data/${cik.replace(/^0+/,'')}/${accNum}/${xmlFile.name}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const xml = await xmlRes.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const holdings = [];
    doc.querySelectorAll('infoTable').forEach(t => {
      const name   = t.querySelector('nameOfIssuer')?.textContent?.trim();
      const val    = parseInt(t.querySelector('value')?.textContent||0) * 1000;
      const shares = parseInt(t.querySelector('sshPrnamt')?.textContent||0);
      if (name && val > 0) holdings.push({ name, val, shares, _institution: institutionKey });
    });
    holdings.sort((a,b) => b.val - a.val);
    _edgarCache[institutionKey] = holdings.slice(0,50);
    return _edgarCache[institutionKey];
  } catch(e) {
    console.warn('[EDGAR 13F]', e.message);
    return [];
  }
}

/* ── Analytics algorithms (client-side, no API) ──────────────────── */
function _algoPiotroski(r) {
  // Simplified 9-point Piotroski F-Score
  let s = 0;
  if ((r.roa||0) > 0)          s++; // positive ROA
  if ((r.roe||0) > 0)          s++; // positive ROE
  if ((r.netMargin||0) > 0)    s++; // positive margin
  if ((r.debtEq||999) < 0.5)   s++; // low leverage
  if ((r.debtEq||999) < 1)     s++; // reasonable leverage
  if ((r.roe||0) > 15)         s++; // strong returns
  if ((r.roe||0) > 10 && (r.pe||999) < 20) s++; // quality + value
  if ((r.netMargin||0) > 10)   s++; // strong margin
  if ((r.netMargin||0) > 5 && (r.debtEq||999) < 1.5) s++; // quality
  return s;
}

function _algoMagicFormula(results) {
  // Greenblatt: rank by EarningsYield + ReturnOnCapital
  const filtered = results.filter(r => r.pe > 0 && r.roe != null);
  filtered.forEach(r => {
    r._ey  = 1/r.pe;      // earnings yield proxy
    r._roc = r.roe/100;   // return on capital proxy
  });
  const eyRank  = [...filtered].sort((a,b)=>b._ey-a._ey);
  const rocRank = [...filtered].sort((a,b)=>b._roc-a._roc);
  eyRank.forEach( (r,i)=>r._eyRank=i+1);
  rocRank.forEach((r,i)=>r._rocRank=i+1);
  filtered.forEach(r => r._mfScore = (r._eyRank||999)+(r._rocRank||999));
  return filtered.sort((a,b)=>a._mfScore-b._mfScore);
}

function _algoScore(r) {
  // Simple quality-value score: higher is better
  const roe   = (r.roe||0)/100;
  const pe    = r.pe > 0 ? r.pe : 999;
  const div   = (r.dividendYield||0)/100;
  const debt  = r.debtEq != null ? r.debtEq : 2;
  const margin= (r.netMargin||0)/100;
  return ((roe + div + margin) / (pe/100 + debt + 0.001) * 100).toFixed(1);
}

/* ── PRESET DEFINITIONS ───────────────────────────────────────────── */
const SCR_PRESETS = {
  value:     { label:'📊 Value',       desc:'Low P/E, positive dividend, high ROE', fmp:{ priceMoreThan:'5', marketCapMoreThan:'500000000' }, post: r=>r.filter(x=>(x.pe>0&&x.pe<18)&&(x.dividendYield||0)>1&&(x.roe||0)>8) },
  growth:    { label:'🚀 Growth',      desc:'High ROE, strong margins, any P/E',    fmp:{ priceMoreThan:'5', marketCapMoreThan:'1000000000' }, post: r=>r.filter(x=>(x.roe||0)>15&&(x.netMargin||0)>10) },
  dividend:  { label:'💰 Dividend',    desc:'High yield, stable payers',            fmp:{ dividendMoreThan:'3', marketCapMoreThan:'1000000000' }, post: r=>r.filter(x=>(x.dividendYield||0)>=3) },
  quality:   { label:'⭐ Quality',     desc:'Piotroski score ≥ 7 (top quality)',    fmp:{ priceMoreThan:'5', marketCapMoreThan:'500000000' }, post: r=>r.filter(x=>_algoPiotroski(x)>=7).sort((a,b)=>_algoPiotroski(b)-_algoPiotroski(a)) },
  bargain:   { label:'💎 Bargain',     desc:'Deep value: P/E<10, P/B<1.5',         fmp:{ priceMoreThan:'1', marketCapMoreThan:'100000000' }, post: r=>r.filter(x=>(x.pe>0&&x.pe<10)&&(x.marketCap||0)>0) },
  smallcap:  { label:'🔬 Small Cap',   desc:'$300M-$2B market cap, P/E<30',         fmp:{ marketCapMoreThan:'300000000', marketCapLessThan:'2000000000' }, post: r=>r.filter(x=>(x.pe||0)<30||(x.pe||0)===0) },
  momentum:  { label:'📈 Momentum',    desc:'Large/mid cap, high volume',           fmp:{ marketCapMoreThan:'2000000000', volumeMoreThan:'1000000' }, post: r=>r.sort((a,b)=>(b.volume||0)-(a.volume||0)) },
  magic:     { label:'🧙 Magic Formula',desc:'Greenblatt: earnings yield + ROC',    fmp:{ marketCapMoreThan:'100000000', priceMoreThan:'2' }, post: r=>_algoMagicFormula(r) },
  piotroski: { label:'🔢 Piotroski',   desc:'F-Score ≥ 7 (balance sheet quality)',  fmp:{ priceMoreThan:'2' }, post: r=>[...r].sort((a,b)=>_algoPiotroski(b)-_algoPiotroski(a)).filter(x=>_algoPiotroski(x)>=6) },
};

/* ── Run a preset screen ──────────────────────────────────────────── */
async function screenerRunPreset(key) {
  const preset = SCR_PRESETS[key];
  if (!preset) return;
  _screenerPreset = key;

  const el = document.getElementById('screener-results');
  if (!el) return;
  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>${preset.label} screen running…</div>`;

  // Highlight active preset button
  document.querySelectorAll('.scr-preset-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector(`.scr-preset-btn[data-preset="${key}"]`)?.classList.add('active');

  let results = await _screenerFMP(preset.fmp);
  if (!results?.length) results = await _screenerYahoo(preset.fmp) || [];

  if (preset.post) results = preset.post(results);

  // Add Piotroski score and algo score
  results.forEach(r => { r._piotroski = _algoPiotroski(r); r._score = _algoScore(r); });

  _screenerResults = results;
  const statusEl = document.getElementById('screener-status');
  if (statusEl) statusEl.textContent = `${results.length} results · ${preset.label}`;
  screenerRenderResults();
}

/* ── Run EDGAR institutional consensus ───────────────────────────── */
async function screenerRunInstitutional() {
  const el = document.getElementById('screener-results');
  if (!el) return;
  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Fetching EDGAR 13F filings…<br><small style="color:var(--text-muted)">Berkshire · ARK · Bridgewater · Renaissance</small></div>`;

  document.querySelectorAll('.scr-preset-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector('.scr-preset-btn[data-preset="inst"]')?.classList.add('active');

  const keys = Object.keys(_EDGAR_INSTITUTIONS).slice(0,4);
  const allHoldings = await Promise.all(keys.map(k=>_edgar13F(k)));

  // Count occurrences across institutions
  const counts = {};
  allHoldings.forEach((holdings, fi) => {
    holdings.forEach(h => {
      const k = h.name.toUpperCase().slice(0,20);
      if (!counts[k]) counts[k] = { name:h.name, total:0, funds:[] };
      counts[k].total += h.val;
      counts[k].funds.push(keys[fi]);
    });
  });

  const consensus = Object.values(counts)
    .filter(c => c.funds.length >= 2)
    .sort((a,b) => b.funds.length - a.funds.length || b.total - a.total)
    .slice(0, 50);

  if (!consensus.length) {
    el.innerHTML = `<div class="no-data">// EDGAR 13F data unavailable (CORS or network). Try again or check SEC website.</div>`;
    return;
  }

  el.innerHTML = `
    <div class="av-live-badge">● EDGAR 13F · ${consensus.length} consensus holdings · ${keys.join(' · ')}</div>
    <div style="font-size:9px;color:var(--text-muted);padding:4px 12px">Holdings owned by ≥2 institutions. Data from SEC EDGAR (public, no API key).</div>
    <div style="overflow-x:auto;max-height:450px;overflow-y:auto">
      <table class="yf-fin-table scr-table">
        <thead><tr>
          <th>#</th><th>Company</th><th>Funds holding</th><th>Total Value</th><th>Institutions</th>
        </tr></thead>
        <tbody>
          ${consensus.map((c,i)=>`<tr>
            <td>${i+1}</td>
            <td><strong>${_esc(c.name.slice(0,30))}</strong></td>
            <td style="text-align:center"><span style="font-size:14px;font-weight:800;color:var(--accent)">${c.funds.length}</span></td>
            <td>${_fmt(c.total)}</td>
            <td style="font-size:9px;color:var(--text-muted)">${c.funds.join(' · ')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="scr-footer">Source: <a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=13F" target="_blank" class="geo-wm-link">SEC EDGAR 13F ↗</a> · No API key required</div>`;
}

/* ── Custom screener run ──────────────────────────────────────────── */
async function screenerRun() {
  const el     = document.getElementById('screener-results');
  const status = document.getElementById('screener-status');
  if (!el) return;

  document.querySelectorAll('.scr-preset-btn').forEach(b=>b.classList.remove('active'));
  _screenerPreset = 'custom';

  const params = {
    marketCapMoreThan: document.getElementById('scr-mktcap-min')?.value||'',
    marketCapLessThan: document.getElementById('scr-mktcap-max')?.value||'',
    priceMoreThan:     document.getElementById('scr-price-min')?.value||'',
    priceLessThan:     document.getElementById('scr-price-max')?.value||'',
    betaMoreThan:      document.getElementById('scr-beta-min')?.value||'',
    betaLessThan:      document.getElementById('scr-beta-max')?.value||'',
    volumeMoreThan:    document.getElementById('scr-vol-min')?.value||'',
    dividendMoreThan:  document.getElementById('scr-div-min')?.value||'',
    sector:            document.getElementById('scr-sector')?.value||'',
    industry:          document.getElementById('scr-industry')?.value||'',
    country:           document.getElementById('scr-country')?.value||'',
    exchange:          document.getElementById('scr-exchange')?.value||'',
  };

  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Screening stocks…</div>`;
  if (status) status.textContent = '';

  // Try FMP then Yahoo
  let arr = await _screenerFMP(params);
  const src = arr?.length ? 'FMP' : 'Yahoo';
  if (!arr?.length) arr = await _screenerYahoo(params) || [];

  if (!arr.length) {
    el.innerHTML = `<div class="no-data">// No stocks match. Try relaxing the filters.</div>`;
    return;
  }

  // Additional client-side filters for fields not in FMP screener params
  const peMin   = parseFloat(document.getElementById('scr-pe-min')?.value)||null;
  const peMax   = parseFloat(document.getElementById('scr-pe-max')?.value)||null;
  const roeMin  = parseFloat(document.getElementById('scr-roe-min')?.value)||null;
  const debtMax = parseFloat(document.getElementById('scr-debt-max')?.value)||null;
  const marginMin = parseFloat(document.getElementById('scr-margin-min')?.value)||null;

  if (peMin)     arr = arr.filter(r => r.pe != null && r.pe >= peMin);
  if (peMax)     arr = arr.filter(r => r.pe != null && r.pe <= peMax);
  if (roeMin)    arr = arr.filter(r => r.roe != null && r.roe >= roeMin);
  if (debtMax)   arr = arr.filter(r => r.debtEq != null && r.debtEq <= debtMax);
  if (marginMin) arr = arr.filter(r => r.netMargin != null && r.netMargin >= marginMin);

  arr.forEach(r => { r._piotroski = _algoPiotroski(r); r._score = _algoScore(r); });

  _screenerResults = arr;
  if (status) status.textContent = `${arr.length} results · ${src}`;
  screenerRenderResults();
}

/* ── Sort ────────────────────────────────────────────────────────── */
function screenerSortBy(col) {
  if (_screenerSort.col === col) _screenerSort.dir *= -1;
  else { _screenerSort.col = col; _screenerSort.dir = -1; }
  screenerRenderResults();
}

/* ── Render results table ─────────────────────────────────────────── */
function screenerRenderResults() {
  const el = document.getElementById('screener-results');
  if (!el || !_screenerResults.length) return;

  const COLS = [
    { key:'symbol',      label:'Ticker',   fmt:r=>`<strong class="port-sym" style="cursor:pointer" onclick="if(typeof changeTicker==='function')changeTicker('${r.symbol}')">${_esc(r.symbol)}</strong>` },
    { key:'companyName', label:'Company',  fmt:r=>`<span title="${_esc(r.name||'')}">${_esc((r.name||'').slice(0,20))}</span>` },
    { key:'sector',      label:'Sector',   fmt:r=>_esc((r.sector||'').slice(0,13)) },
    { key:'price',       label:'Price',    fmt:r=>r.price!=null?'$'+r.price.toFixed(2):'—' },
    { key:'mktcap',      label:'Mkt Cap',  fmt:r=>r.marketCap?_fmt(r.marketCap):'—' },
    { key:'pe',          label:'P/E',      fmt:r=>r.pe!=null?(r.pe>0?r.pe.toFixed(1):'neg'):'—', cls:r=>r.pe>0&&r.pe<15?'pos':r.pe>30?'neg':'' },
    { key:'roe',         label:'ROE',      fmt:r=>r.roe!=null?r.roe.toFixed(1)+'%':'—', cls:r=>r.roe>=15?'pos':r.roe<0?'neg':'' },
    { key:'netMargin',   label:'Net Mgn',  fmt:r=>r.netMargin!=null?r.netMargin.toFixed(1)+'%':'—', cls:r=>r.netMargin>=10?'pos':r.netMargin<0?'neg':'' },
    { key:'debtEq',      label:'D/E',      fmt:r=>r.debtEq!=null?r.debtEq.toFixed(2):'—', cls:r=>r.debtEq<0.5?'pos':r.debtEq>2?'neg':'' },
    { key:'dividendYield',label:'Div%',   fmt:r=>r.dividendYield!=null?r.dividendYield.toFixed(1)+'%':'—', cls:r=>r.dividendYield>=3?'pos':'' },
    { key:'_piotroski',  label:'F-Score', fmt:r=>r._piotroski!=null?r._piotroski+'/9':'—', cls:r=>r._piotroski>=7?'pos':r._piotroski<=3?'neg':'' },
    { key:'_score',      label:'Score',   fmt:r=>r._score||'—', cls:r=>(+r._score)>=5?'pos':(+r._score)<2?'neg':'' },
    { key:'_actions',    label:'',        fmt:r=>`<button class="port-del-btn" title="Add to watchlist" onclick="screenerAddToWatchlist('${_esc(r.symbol)}')">⭐</button>` },
  ];

  const cmpKey = _screenerSort.col;
  const sorted = [..._screenerResults].sort((a,b)=>{
    const va = cmpKey==='mktcap'?(a.marketCap||0):cmpKey==='symbol'?a.symbol:(a[cmpKey]||0);
    const vb = cmpKey==='mktcap'?(b.marketCap||0):cmpKey==='symbol'?b.symbol:(b[cmpKey]||0);
    if (typeof va==='string') return _screenerSort.dir*va.localeCompare(vb);
    return _screenerSort.dir*((va||0)-(vb||0));
  });

  el.innerHTML = `
    <div class="scr-results-header">
      <div class="av-live-badge">● ${sorted.length} stocks · ${_esc(_screenerPreset)} screen</div>
      <div class="scr-results-actions">
        <button class="wh-btn-secondary" style="font-size:9px;padding:3px 8px" onclick="screenerExportCSV()">📥 CSV</button>
        <button class="wh-btn-secondary" style="font-size:9px;padding:3px 8px" onclick="screenerSavePreset()">💾 Save Preset</button>
      </div>
    </div>
    <div style="overflow-x:auto;max-height:420px;overflow-y:auto">
      <table class="yf-fin-table scr-table">
        <thead><tr>
          ${COLS.map(c=>c.key==='_actions'?'<th></th>':`<th onclick="screenerSortBy('${c.key}')" style="cursor:pointer;white-space:nowrap">
            ${c.label}${_screenerSort.col===c.key?(_screenerSort.dir>0?' ↑':' ↓'):''}
          </th>`).join('')}
        </tr></thead>
        <tbody>
          ${sorted.map(r=>`<tr>
            ${COLS.map(c=>`<td class="${c.cls?c.cls(r):''}">${c.fmt(r)}</td>`).join('')}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="scr-footer">${sorted[0]?._src==='Yahoo'?'⚠ Using Yahoo Finance fallback (no FMP key). Some fundamental columns unavailable.':'Data: FMP · Fundamental filters applied client-side where noted.'}</div>`;
}

/* ── Add to watchlist (uses portfolio IDB) ────────────────────────── */
window.screenerAddToWatchlist = async function(ticker) {
  try {
    await _idbPut('watchlist', { id:'w_'+ticker+'_'+Date.now(), ticker, addedAt:Date.now(), targetPrice:null });
    if (typeof showApiToast==='function') showApiToast(`✅ ${ticker} → Watchlist`, 'ok');
  } catch(e) { console.warn(e); }
};

/* ── Export CSV ─────────────────────────────────────────────────────── */
window.screenerExportCSV = function() {
  if (!_screenerResults.length) return;
  const headers = ['Ticker','Company','Sector','Price','MarketCap','P/E','ROE','NetMargin','D/E','DivYield','F-Score','Score'];
  const rows = _screenerResults.map(r=>[
    r.symbol, (r.name||'').replace(/,/g,' '), (r.sector||''),
    r.price?.toFixed(2)||'', r.marketCap||'',
    r.pe?.toFixed(2)||'', r.roe?.toFixed(2)||'', r.netMargin?.toFixed(2)||'',
    r.debtEq?.toFixed(2)||'', r.dividendYield?.toFixed(2)||'',
    r._piotroski||'', r._score||'',
  ].join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download = `screener_${_screenerPreset}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(a.href);
};

/* ── Save custom preset ────────────────────────────────────────────── */
window.screenerSavePreset = function() {
  const name = prompt('Preset name (e.g. "My Value Screen"):');
  if (!name?.trim()) return;
  const criteria = {};
  ['scr-mktcap-min','scr-mktcap-max','scr-price-min','scr-price-max',
   'scr-beta-min','scr-beta-max','scr-vol-min','scr-div-min',
   'scr-sector','scr-exchange','scr-country','scr-pe-min','scr-pe-max',
   'scr-roe-min','scr-debt-max','scr-margin-min'].forEach(id=>{
    const v = document.getElementById(id)?.value;
    if (v) criteria[id] = v;
  });
  const presets = _scrLoadPresets();
  presets[name.trim()] = criteria;
  _scrSavePresets(presets);
  if (typeof showApiToast==='function') showApiToast(`✅ Preset "${name}" saved`, 'ok');
  _screenerRenderPresetBar();
};

/* ── Preset bar renderer ───────────────────────────────────────────── */
function _screenerRenderPresetBar() {
  const bar = document.getElementById('scr-preset-bar');
  if (!bar) return;
  const custom = _scrLoadPresets();
  bar.innerHTML = Object.entries(SCR_PRESETS).map(([k,p])=>
    `<button class="scr-preset-btn" data-preset="${k}" onclick="screenerRunPreset('${k}')">${p.label}</button>`
  ).join('')
  + `<button class="scr-preset-btn" data-preset="inst" onclick="screenerRunInstitutional()">🏦 Institutional</button>`
  + Object.keys(custom).map(n=>
    `<button class="scr-preset-btn scr-preset-custom" onclick="screenerLoadCustom('${_esc(n)}')" title="${_esc(n)}">★ ${_esc(n.slice(0,14))}</button>`
  ).join('');
}

window.screenerLoadCustom = function(name) {
  const presets = _scrLoadPresets();
  const p = presets[name];
  if (!p) return;
  Object.entries(p).forEach(([id,v]) => { const el=document.getElementById(id); if(el)el.value=v; });
  screenerRun();
};

/* ── Init preset bar on load ──────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(_screenerRenderPresetBar, 500);
  // Re-render when screener panel becomes visible
  document.addEventListener('click', e => {
    if (e.target.dataset?.panel === 'screener' || e.target.closest?.('[data-panel="screener"]')) {
      setTimeout(_screenerRenderPresetBar, 100);
    }
  });
});

window.screenerRun              = screenerRun;
window.screenerSortBy           = screenerSortBy;
window.screenerRenderResults    = screenerRenderResults;
window.screenerRunPreset        = screenerRunPreset;
window.screenerRunInstitutional = screenerRunInstitutional;


/* ══════════════════════════════════════════════════════════════════
   MODULE 5 — BONDS / CREDIT SPREADS
   Source: FRED DAAA, DBAA, DGS10 (existing FRED key)
           + yield curve enhancement
   ══════════════════════════════════════════════════════════════════ */
async function bondsLoadSpreads() {
  const el = document.getElementById('bonds-content');
  if (!el) return;
  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading credit spreads…</div>`;

  const fredKey = (typeof getFredKey === 'function') ? getFredKey() : '';
  if (!fredKey) {
    el.innerHTML = `<div class="no-data">// Add FRED key in ⚙ Settings for bond spread data (free at fred.stlouisfed.org).</div>`;
    return;
  }

  const SERIES = [
    { id:'DGS10',    label:'10Y Treasury',     color:'#58a6ff', group:'treasury' },
    { id:'DGS2',     label:'2Y Treasury',       color:'#4dbbff', group:'treasury' },
    { id:'DGS30',    label:'30Y Treasury',      color:'#7c9',    group:'treasury' },
    { id:'DGS1MO',   label:'1M T-Bill',         color:'#6e7681', group:'treasury' },
    { id:'DAAA',     label:'AAA Corporate',     color:'#3fb950', group:'corp'    },
    { id:'DBAA',     label:'BAA Corporate',     color:'#d29922', group:'corp'    },
    { id:'BAMLH0A0HYM2', label:'HY OAS Spread', color:'#f85149', group:'spread'  },
    { id:'T10Y2Y',   label:'10Y-2Y Spread',     color:'#a371f7', group:'spread'  },
  ];

  try {
    const fetchSeries = async id => {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${fredKey}&file_type=json&sort_order=desc&limit=60`;
      const res  = await fetch(url);
      const json = await res.json();
      const obs  = (json.observations||[]).filter(o=>o.value!=='.');
      return { id, latest: obs[0], history: obs.slice(0,30).reverse() };
    };

    const results = await Promise.all(SERIES.map(s => fetchSeries(s.id).catch(() => ({ id:s.id, latest:null, history:[] }))));
    const map = {};
    results.forEach(r => { map[r.id] = r; });

    const tsy10  = parseFloat(map['DGS10']?.latest?.value);
    const tsy2   = parseFloat(map['DGS2']?.latest?.value);
    const aaa    = parseFloat(map['DAAA']?.latest?.value);
    const baa    = parseFloat(map['DBAA']?.latest?.value);
    const hy     = parseFloat(map['BAMLH0A0HYM2']?.latest?.value);
    const spread = parseFloat(map['T10Y2Y']?.latest?.value);

    const aaaSpr = (aaa && tsy10) ? (aaa - tsy10).toFixed(2) : '—';
    const baaSpr = (baa && tsy10) ? (baa - tsy10).toFixed(2) : '—';
    const inv    = spread < 0 ? '🔴 INVERTED' : spread > 0.5 ? '🟢 Normal' : '🟡 Flat';

    // Mini SVG line for a series
    const miniLine = (history, color) => {
      const vals = history.map(h => parseFloat(h.value)).filter(v => !isNaN(v));
      if (vals.length < 3) return '';
      const mn=Math.min(...vals), mx=Math.max(...vals), rng=mx-mn||0.01;
      const pts = vals.map((v,i)=>`${(i/(vals.length-1))*80},${16-((v-mn)/rng)*14}`).join(' ');
      return `<svg viewBox="0 0 80 18" style="display:block"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
    };

    el.innerHTML = `
      <div class="av-live-badge">● FRED Bond Data · ${map['DGS10']?.latest?.date||''}</div>

      <!-- Yield curve summary -->
      <div class="bonds-section">
        <div class="bonds-section-title">Yield Curve</div>
        <div class="bonds-kpi-grid">
          ${[['1M',map['DGS1MO']],['2Y',map['DGS2']],['10Y',map['DGS10']],['30Y',map['DGS30']]].map(([lbl,d])=>{
            const v = parseFloat(d?.latest?.value);
            return `<div class="bonds-kpi">
              <span class="bonds-kpi-lbl">${lbl}</span>
              <span class="bonds-kpi-val">${isNaN(v)?'—':v.toFixed(2)+'%'}</span>
              ${miniLine(d?.history||[],'#58a6ff')}
            </div>`;
          }).join('')}
        </div>
        <div class="bonds-spread-pill" style="color:${spread<0?'#f85149':'#3fb950'}">
          10Y-2Y: ${isNaN(spread)?'—':spread.toFixed(2)+'%'} ${isNaN(spread)?'':inv}
        </div>
      </div>

      <!-- Corporate spreads -->
      <div class="bonds-section">
        <div class="bonds-section-title">Credit Spreads (vs 10Y Treasury)</div>
        <div class="bonds-kpi-grid">
          <div class="bonds-kpi">
            <span class="bonds-kpi-lbl">AAA Corp</span>
            <span class="bonds-kpi-val">${isNaN(aaa)?'—':aaa.toFixed(2)+'%'}</span>
            <span class="bonds-kpi-spread">+${aaaSpr}% spread</span>
            ${miniLine(map['DAAA']?.history||[],'#3fb950')}
          </div>
          <div class="bonds-kpi">
            <span class="bonds-kpi-lbl">BAA Corp</span>
            <span class="bonds-kpi-val">${isNaN(baa)?'—':baa.toFixed(2)+'%'}</span>
            <span class="bonds-kpi-spread">+${baaSpr}% spread</span>
            ${miniLine(map['DBAA']?.history||[],'#d29922')}
          </div>
          <div class="bonds-kpi">
            <span class="bonds-kpi-lbl">HY OAS Spread</span>
            <span class="bonds-kpi-val ${hy>600?'neg':hy<300?'pos':''}">${isNaN(hy)?'—':hy.toFixed(0)+' bps'}</span>
            <span class="bonds-kpi-spread">${hy>600?'🔴 Stress':hy>400?'🟡 Elevated':'🟢 Normal'}</span>
            ${miniLine(map['BAMLH0A0HYM2']?.history||[],'#f85149')}
          </div>
        </div>
      </div>

      <!-- Interpretation -->
      <div class="bonds-section">
        <div class="bonds-section-title">Interpretation</div>
        <div class="bonds-interp">
          ${[
            spread < 0 ? { icon:'🔴', text: 'Yield curve inverted — historically precedes recession by 12-18 months.' } : null,
            spread < 0.3 && spread >= 0 ? { icon:'🟡', text: 'Yield curve flat — growth slowdown signal.' } : null,
            !isNaN(hy) && hy > 600 ? { icon:'🔴', text: 'High-yield spreads elevated — credit market stress.' } : null,
            !isNaN(hy) && hy < 300 ? { icon:'🟢', text: 'HY spreads tight — credit markets healthy.' } : null,
            !isNaN(baaSpr) && parseFloat(baaSpr) > 2 ? { icon:'🟡', text: 'BAA spread > 200bps — corporate funding costs rising.' } : null,
          ].filter(Boolean).map(i => `<div class="bonds-interp-row"><span>${i.icon}</span><span>${i.text}</span></div>`).join('')
          || '<div style="color:var(--text-muted);font-size:10px">// Normal market conditions.</div>'}
        </div>
      </div>`;
  } catch (e) {
    el.innerHTML = `<div class="no-data">// Bond data error: ${_esc(e.message)}</div>`;
  }
}
window.bondsLoadSpreads = bondsLoadSpreads;

/* Auto-load when panels become active */
document.addEventListener('DOMContentLoaded', () => {
  // Portfolio: auto-render on tab open
  document.addEventListener('click', e => {
    if (e.target.dataset?.tab === 'portfolio') setTimeout(portRender, 50);
    if (e.target.dataset?.tab === 'bonds')     setTimeout(bondsLoadSpreads, 50);
  });
});
