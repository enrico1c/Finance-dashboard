/* ══════════════════════════════════════════════════════════════════
   FINTERM — positioning.js  (Phase 4)
   Market Positioning & Macro Enrichment
   Sources: CFTC COT CSV (no key) · BLS API v1 (no key)
   Panels: macro-positioning (new) · macro-econ (BLS enrichment)
   ══════════════════════════════════════════════════════════════════ */

const _POS = {};
function _posGet(k,ms) { const e=_POS[k]; return (e&&Date.now()-e.ts<ms)?e.d:null; }
function _posSet(k,d)  { _POS[k]={d,ts:Date.now()}; }
const _posEsc = s => String(s??'').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
const _posFmt = (n,d=2) => n==null||isNaN(n)?'—':Number(n).toFixed(d);
const _posFmtK = n => { if(!n&&n!==0) return '—'; const a=Math.abs(n); if(a>=1000) return (n/1000).toFixed(1)+'K'; return n.toString(); };

/* ══════════════════════════════════════════════════════════════════
   CFTC COMMITMENTS OF TRADERS  (no key, weekly CSV)
   https://www.cftc.gov/MarketReports/CommitmentsofTraders
   ══════════════════════════════════════════════════════════════════ */

/* COT file URLs — CFTC publishes weekly */
const CFTC_BASE = 'https://www.cftc.gov/files/dea/cotarchives/2025/futures';

/* Market names to match in CFTC data — long form report */
const COT_MARKETS = [
  { id:'crude_oil',     cftcCode:'067651', name:'Crude Oil, Light Sweet (NYMEX)', icon:'🛢', group:'energy' },
  { id:'nat_gas',       cftcCode:'023651', name:'Natural Gas (NYMEX)', icon:'🔥', group:'energy' },
  { id:'gold',          cftcCode:'088691', name:'Gold (COMEX)', icon:'🥇', group:'metals' },
  { id:'silver',        cftcCode:'084691', name:'Silver (COMEX)', icon:'🥈', group:'metals' },
  { id:'copper',        cftcCode:'085692', name:'Copper (COMEX)', icon:'🔶', group:'metals' },
  { id:'wheat',         cftcCode:'001602', name:'Wheat, SRW (CBOT)', icon:'🌾', group:'agriculture' },
  { id:'corn',          cftcCode:'002602', name:'Corn (CBOT)', icon:'🌽', group:'agriculture' },
  { id:'soybeans',      cftcCode:'005602', name:'Soybeans (CBOT)', icon:'🫘', group:'agriculture' },
  { id:'coffee',        cftcCode:'083731', name:'Coffee C (ICE-US)', icon:'☕', group:'agriculture' },
  { id:'sugar',         cftcCode:'080732', name:'Sugar No. 11 (ICE-US)', icon:'🍬', group:'agriculture' },
  { id:'sp500',         cftcCode:'13874+', name:'E-Mini S&P 500 (CME)', icon:'📈', group:'equity' },
  { id:'treasury_10y',  cftcCode:'020601', name:'10-Yr T-Note (CBOT)', icon:'📋', group:'rates' },
];

/* Fetch and parse CFTC COT long-form CSV via allorigins proxy */
async function cftcGetLatestCOT() {
  const cached = _posGet('cftc_cot', 24*60*60*1000);
  if (cached) return cached;
  try {
    /* CFTC provides annual CSV files with all futures positions */
    const year = new Date().getFullYear();
    const url = `https://www.cftc.gov/sites/default/files/files/dea/cotarchives/${year}/futures/deafut${String(year).slice(-2)}c.txt`;
    const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxy, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`CFTC HTTP ${res.status}`);
    const text = await res.text();
    const parsed = _parseCOTcsv(text);
    _posSet('cftc_cot', parsed);
    return parsed;
  } catch(e) {
    console.warn('[positioning] CFTC COT:', e.message);
    /* Try previous year */
    try {
      const year = new Date().getFullYear() - 1;
      const url = `https://www.cftc.gov/sites/default/files/files/dea/cotarchives/${year}/futures/deafut${String(year).slice(-2)}c.txt`;
      const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxy, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return null;
      const text = await res.text();
      const parsed = _parseCOTcsv(text);
      _posSet('cftc_cot', parsed);
      return parsed;
    } catch { return null; }
  }
}

function _parseCOTcsv(text) {
  if (!text||text.length<100) return {};
  const lines = text.split('\n').filter(l=>l.trim());
  if (lines.length < 2) return {};
  const header = lines[0].split(',').map(h=>h.trim().replace(/"/g,''));
  const records = {};
  /* Parse only the last few weeks (most recent records first in CFTC format) */
  const dataLines = lines.slice(1).slice(0, 500);
  for (const line of dataLines) {
    const vals = line.split(',').map(v=>v.trim().replace(/"/g,''));
    if (vals.length < 10) continue;
    const record = {};
    header.forEach((h,i) => { record[h] = vals[i]; });
    const cftcCode = (record['CFTC_Contract_Market_Code']||record['Market_and_Exchange_Names']||'').trim();
    const name = (record['Market_and_Exchange_Names']||record['Market Name']||'').trim();
    if (!records[cftcCode]) records[cftcCode] = [];
    records[cftcCode].push({
      date:         record['Report_Date_as_YYYY-MM-DD']||record['Date']||record['As_of_Date_In_Form_YYMMDD'],
      name,
      longAll:      parseInt(record['NonComm_Positions_Long_All']||record['Noncommercial Long']||0),
      shortAll:     parseInt(record['NonComm_Positions_Short_All']||record['Noncommercial Short']||0),
      spreadAll:    parseInt(record['NonComm_Positions_Spread_All']||0),
      longComm:     parseInt(record['Comm_Positions_Long_All']||0),
      shortComm:    parseInt(record['Comm_Positions_Short_All']||0),
      openInterest: parseInt(record['Open_Interest_All']||record['Open Interest']||0),
    });
  }
  return records;
}

/* ══════════════════════════════════════════════════════════════════
   BLS API v1  (no key required, basic access)
   Producer Price Index for commodity-linked industries
   ══════════════════════════════════════════════════════════════════ */
const BLS_BASE = 'https://api.bls.gov/publicAPI/v1';

/* Key PPI and CPI series for commodities */
const BLS_SERIES = [
  { id:'WPU0561',    label:'PPI: Crude Petroleum',        icon:'🛢', unit:'Index' },
  { id:'WPU0571',    label:'PPI: Natural Gas',            icon:'🔥', unit:'Index' },
  { id:'WPU1021',    label:'PPI: Iron & Steel',           icon:'⚙',  unit:'Index' },
  { id:'WPU1023',    label:'PPI: Aluminum',               icon:'🔩', unit:'Index' },
  { id:'WPU1024',    label:'PPI: Copper & Copper Products',icon:'🔶',unit:'Index' },
  { id:'WPU012',     label:'PPI: Agricultural Products',  icon:'🌾', unit:'Index' },
  { id:'CUUR0000SAF1',label:'CPI: Food at home',          icon:'🛒', unit:'Index' },
  { id:'CUUR0000SACE', label:'CPI: Energy',               icon:'⚡', unit:'Index' },
];

async function blsGetSeries(seriesId) {
  const cached = _posGet(`bls_${seriesId}`, 4*60*60*1000);
  if (cached) return cached;
  try {
    const url = `${BLS_BASE}/timeseries/data/${seriesId}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`BLS HTTP ${res.status}`);
    const json = await res.json();
    if (json.status !== 'REQUEST_SUCCEEDED') return null;
    const obs = json.Results?.series?.[0]?.data || [];
    const sorted = obs.sort((a,b) => {
      const da = new Date(a.year+'-'+String(a.period).replace('M','')+'-01');
      const db = new Date(b.year+'-'+String(b.period).replace('M','')+'-01');
      return da-db;
    });
    _posSet(`bls_${seriesId}`, sorted);
    return sorted;
  } catch(e) { console.warn('[positioning] BLS:', seriesId, e.message); return null; }
}

/* ── Sparkline helper ─────────────────────────────────────────────── */
function _posSparkline(vals, color='#58a6ff') {
  const v = vals.filter(x=>!isNaN(x));
  if (v.length<2) return '';
  const mn=Math.min(...v), mx=Math.max(...v), range=mx-mn||1;
  const W=80, H=24;
  const pts = v.map((x,i)=>`${(i/(v.length-1)*W).toFixed(1)},${(H-((x-mn)/range)*H).toFixed(1)}`).join(' ');
  return `<svg width="${W}" height="${H}" style="display:block"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}

/* ── COT net position bar ─────────────────────────────────────────── */
function _cotNetBar(longPos, shortPos) {
  if (!longPos&&!shortPos) return '';
  const net = longPos - shortPos;
  const total = longPos + shortPos || 1;
  const longPct = (longPos/total*100).toFixed(1);
  const shortPct = (shortPos/total*100).toFixed(1);
  const netCls = net>0?'pos':'neg';
  return `<div class="cot-bar-wrap">
    <div class="cot-bar">
      <div class="cot-bar-long"  style="width:${longPct}%;background:#3fb950"></div>
      <div class="cot-bar-short" style="width:${shortPct}%;background:#f85149;margin-left:auto"></div>
    </div>
    <div class="cot-bar-labels">
      <span style="color:#3fb950">L: ${_posFmtK(longPos)}</span>
      <span class="${netCls}">Net: ${net>0?'+':''}${_posFmtK(net)}</span>
      <span style="color:#f85149">S: ${_posFmtK(shortPos)}</span>
    </div>
  </div>`;
}

/* ══════════════════════════════════════════════════════════════════
   RENDER — macro-positioning tab
   ══════════════════════════════════════════════════════════════════ */
async function positioningLoadAll() {
  const el = document.getElementById('macro-positioning');
  if (!el) return;
  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading CFTC Commitments of Traders & BLS PPI data…</div>`;

  const [cotData] = await Promise.all([cftcGetLatestCOT()]);

  let html = `<div class="av-live-badge">● Market Positioning · CFTC COT (weekly) · No API key required</div>`;

  /* ── CFTC COT ──────────────────────────────────────────────────── */
  html += `<div class="section-head">📊 CFTC Commitments of Traders — Non-Commercial (Speculative) Positioning</div>`;
  html += `<div class="av-note" style="margin-bottom:8px">Non-commercial (speculative/managed money) net positioning in commodity and financial futures. Extreme net long = bullish crowding; extreme net short = bearish crowding. Weekly publication. Source: CFTC.gov (public domain).</div>`;

  if (cotData && Object.keys(cotData).length > 0) {
    /* Group by category */
    const groups = { energy:[], metals:[], agriculture:[], rates:[], equity:[] };
    for (const market of COT_MARKETS) {
      /* Try to find by CFTC code or name */
      let data = cotData[market.cftcCode];
      if (!data) {
        /* Try partial name match */
        const entry = Object.entries(cotData).find(([,rows]) => rows?.[0]?.name?.toLowerCase().includes(market.name.split('(')[0].trim().toLowerCase().slice(0,8)));
        if (entry) data = entry[1];
      }
      if (data?.length) {
        const latest = data[0];
        const prev   = data[1];
        const net    = latest.longAll - latest.shortAll;
        const netPrev = prev ? prev.longAll - prev.shortAll : null;
        const chg    = netPrev != null ? net - netPrev : null;
        groups[market.group]?.push({ ...market, latest, net, chg });
      }
    }

    for (const [group, items] of Object.entries(groups)) {
      if (!items.length) continue;
      const groupLabel = {energy:'⚡ Energy', metals:'⚒ Metals', agriculture:'🌾 Agriculture', rates:'📋 Rates', equity:'📈 Equity'}[group];
      html += `<div class="section-head" style="margin-top:10px;font-size:11px">${groupLabel}</div>`;
      html += `<div class="cot-grid">`;
      for (const item of items) {
        const netCls = item.net>0?'pos':'neg';
        const sentiment = item.net>0?'Bullish':'Bearish';
        const sentIntensity = Math.abs(item.net) > 100000 ? 'Extreme' : Math.abs(item.net) > 50000 ? 'Strong' : 'Moderate';
        html += `<div class="cot-card">
          <div class="cot-card-header">
            <span class="cot-icon">${item.icon}</span>
            <span class="cot-name">${_posEsc(item.name)}</span>
          </div>
          <div class="cot-net ${netCls}">${item.net>0?'+':''}${_posFmtK(item.net)} contracts</div>
          <div class="cot-sentiment ${netCls}">${sentIntensity} ${sentiment}</div>
          ${item.chg!=null?`<div class="cot-chg ${item.chg>0?'pos':'neg'}">vs prior week: ${item.chg>0?'+':''}${_posFmtK(item.chg)}</div>`:''}
          ${_cotNetBar(item.latest.longAll, item.latest.shortAll)}
          <div class="cot-oi">Open Interest: ${_posFmtK(item.latest.openInterest)}</div>
          <div class="cot-date" style="font-size:9px;color:var(--text-muted)">${_posEsc(item.latest.date||'')}</div>
        </div>`;
      }
      html += `</div>`;
    }
  } else {
    /* COT data unavailable — show static reference data */
    html += `<div class="no-data">// CFTC COT data temporarily unavailable (CORS or download issue).<br>
      // The CFTC publishes weekly files at cftc.gov — no API key required.<br>
      <a href="https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm" target="_blank" rel="noopener" style="color:var(--accent)">↗ Access CFTC COT Reports Directly</a>
    </div>`;
    /* Show market reference anyway */
    html += `<div class="section-head" style="margin-top:12px">📋 Tracked COT Markets</div>`;
    html += `<div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th>Icon</th><th>Market</th><th>Exchange</th><th>Group</th></tr></thead><tbody>`;
    for (const m of COT_MARKETS) {
      html += `<tr><td>${m.icon}</td><td>${_posEsc(m.name.split('(')[0].trim())}</td><td>${_posEsc(m.name.match(/\(([^)]+)\)/)?.[1]||'—')}</td><td>${_posEsc(m.group)}</td></tr>`;
    }
    html += `</tbody></table></div>`;
  }

  html += `<div style="margin-top:8px">
    <a href="https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm" target="_blank" rel="noopener" class="energy-entsog-link">↗ CFTC COT Reports</a>
    <a href="https://www.cftc.gov/MarketReports/CommitmentsofTraders/HistoricalCompressed/index.htm" target="_blank" rel="noopener" class="energy-entsog-link" style="margin-left:8px">↗ Historical COT Data</a>
  </div>`;

  el.innerHTML = html;

  /* Now load BLS enrichment */
  blsEnrichEconTab();
}

/* ══════════════════════════════════════════════════════════════════
   BLS ENRICHMENT — appended to macro-econ tab
   ══════════════════════════════════════════════════════════════════ */
async function blsEnrichEconTab() {
  const el = document.getElementById('macro-econ');
  if (!el || document.getElementById('bls-ppi-section')) return;

  try {
    const results = await Promise.allSettled(BLS_SERIES.map(s => blsGetSeries(s.id)));
    const section = document.createElement('div');
    section.id = 'bls-ppi-section';

    let html = `<div class="section-head" style="margin-top:14px">📦 BLS Producer & Consumer Price Indices — Commodity-Linked</div>`;
    html += `<div class="av-note" style="margin-bottom:6px">BLS API v1 (no key required). PPI tracks prices received by producers — leading indicator for CPI. Monthly.</div>`;
    html += `<div class="commodity-price-grid">`;

    BLS_SERIES.forEach((s,i) => {
      const r = results[i];
      if (r.status !== 'fulfilled' || !r.value?.length) return;
      const obs = r.value;
      const last = obs[obs.length-1];
      const prev = obs.length>1 ? obs[obs.length-2] : null;
      const val  = parseFloat(last?.value);
      const pval = prev ? parseFloat(prev.value) : null;
      const chg  = pval ? val-pval : null;
      const pct  = chg&&pval ? (chg/Math.abs(pval)*100) : null;
      const cls  = chg>0?'pos':chg<0?'neg':'';
      const period = last?.year && last?.period ? `${last.year}-${last.period}` : '—';
      html += `<div class="commodity-price-card">
        <div class="commodity-price-icon">${s.icon}</div>
        <div class="commodity-price-body">
          <div class="commodity-price-label">${_posEsc(s.label)}</div>
          <div class="commodity-price-val">${!isNaN(val)?_posFmt(val,1):'—'}</div>
          <div class="commodity-price-chg ${cls}">${chg!=null?(chg>0?'▲ +':'▼ ')+Math.abs(chg).toFixed(2)+(pct!=null?' ('+Math.abs(pct).toFixed(1)+'%)':''):'—'}</div>
          <div class="commodity-price-period">${_posEsc(period)} · BLS</div>
        </div>
        <div class="commodity-price-spark">${_posSparkline(obs.slice(-12).map(d=>parseFloat(d.value)), chg>=0?'#3fb950':'#f85149')}</div>
      </div>`;
    });
    html += `</div>`;
    html += `<div class="av-note" style="margin-top:4px">Source: <a href="https://www.bls.gov/ppi/" target="_blank" rel="noopener" style="color:var(--accent)">Bureau of Labor Statistics PPI</a> · No API key required (v1)</div>`;

    section.innerHTML = html;
    el.appendChild(section);
  } catch(e) { console.warn('[positioning] BLS enrich:', e.message); }
}

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', e => {
    const tab = e.target.dataset?.tab;
    if (tab==='positioning') {
      const el = document.getElementById('macro-positioning');
      if (el && !el.dataset.posLoaded) { el.dataset.posLoaded='1'; positioningLoadAll(); }
    }
    if (tab==='econ') setTimeout(blsEnrichEconTab, 800);
  });
  /* Also try to enrich after FRED loads */
  setTimeout(blsEnrichEconTab, 3000);
});

window.positioningLoadAll = positioningLoadAll;
window.blsEnrichEconTab   = blsEnrichEconTab;
