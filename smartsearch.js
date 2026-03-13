/* ══════════════════════════════════════════════════════════════════
   FINTERM — smartsearch.js
   Intelligent routing for stocks, ETFs, and funds:

   STOCK  → detect all sectors the company operates in
            → load each sector into Watchlist automatically
   ETF/FUND → detect underlying sector exposures
            → load sectors into Watchlist
            → inject holdings list into Fundamentals (new HOLD tab)
            → click on any holding loads chart+news+quote+analysts+
              ownership+comparables (but NOT fundamentals)
   ══════════════════════════════════════════════════════════════════ */

/* ── State ──────────────────────────────────────────────────────── */
let ss_currentType   = null;   // 'stock' | 'etf' | 'fund' | null
let ss_currentSym    = null;
let ss_holdings      = [];     // [{ticker, name, weight, sector, shares}]
let ss_sectors       = [];     // ['AI', 'Semiconductor', ...]

/* ══════════════════════════════════════════════════════════════════
   COMPANY → SECTORS MAP
   Multi-sector companies: Apple → AI + Consumer + Semiconductor etc.
   ══════════════════════════════════════════════════════════════════ */
const SS_STOCK_SECTORS = {
  /* Mega-cap tech — multiple sectors */
  AAPL:  ['ai','semiconductor','consumer electronics','services'],
  MSFT:  ['ai','cloud','gaming','enterprise software'],
  GOOGL: ['ai','cloud','advertising','autonomous'],
  GOOG:  ['ai','cloud','advertising','autonomous'],
  META:  ['ai','social media','advertising','metaverse'],
  AMZN:  ['ai','cloud','retail','logistics'],
  NVDA:  ['ai','semiconductor','gaming','data center'],
  TSLA:  ['ev','energy','ai','autonomous'],
  /* Semiconductors */
  TSM:   ['semiconductor','foundry'],
  ASML:  ['semiconductor','equipment'],
  INTC:  ['semiconductor','foundry','pc'],
  AMD:   ['semiconductor','ai','gaming'],
  QCOM:  ['semiconductor','5g','mobile'],
  ARM:   ['semiconductor','mobile','iot'],
  AVGO:  ['semiconductor','networking'],
  MU:    ['semiconductor','memory'],
  /* Energy */
  XOM:   ['oil','lng','refining','chemicals'],
  CVX:   ['oil','lng','refining'],
  BP:    ['oil','renewables','lng'],
  SHEL:  ['oil','lng','renewables','chemicals'],
  COP:   ['oil','shale'],
  SLB:   ['oil','oilfield services'],
  HAL:   ['oil','oilfield services'],
  LNG:   ['lng','gas'],
  /* Metals & Mining */
  FCX:   ['copper','mining','gold'],
  NEM:   ['gold','mining'],
  GOLD:  ['gold','mining'],
  RIO:   ['iron','mining','aluminum','copper'],
  BHP:   ['iron','mining','copper','coal'],
  VALE:  ['iron','mining','nickel'],
  AA:    ['aluminum','mining'],
  ALB:   ['lithium','specialty chemicals'],
  FCX:   ['copper','mining'],
  /* Defense */
  LMT:   ['defense','aerospace','missiles'],
  RTX:   ['defense','aerospace','avionics'],
  NOC:   ['defense','aerospace','cyber'],
  GD:    ['defense','naval','armor'],
  BA:    ['aerospace','defense','commercial aviation'],
  HII:   ['defense','naval'],
  /* Finance */
  JPM:   ['banking','investment banking','fintech'],
  GS:    ['investment banking','asset management','markets'],
  BAC:   ['banking','consumer finance','investment banking'],
  MS:    ['investment banking','wealth management'],
  BLK:   ['asset management','etf','fintech'],
  /* Healthcare */
  JNJ:   ['pharma','medical devices','consumer health'],
  LLY:   ['pharma','diabetes','oncology'],
  PFE:   ['pharma','vaccines','oncology'],
  MRNA:  ['biotech','vaccines','oncology'],
  ABBV:  ['pharma','immunology','neuroscience'],
  /* Consumer */
  MCD:   ['fast food','franchise','real estate'],
  SBUX:  ['coffee','consumer','retail'],
  NKE:   ['footwear','apparel','retail'],
  AMZN:  ['retail','cloud','logistics','ai'],
  WMT:   ['retail','grocery','fintech'],
  /* Media & Entertainment */
  DIS:   ['streaming','theme parks','media','consumer'],
  NFLX:  ['streaming','content','ai'],
  SPOT:  ['streaming','music','podcasts'],
  /* Auto */
  TSLA:  ['ev','autonomous','energy storage','ai'],
  F:     ['auto','ev','commercial vehicles'],
  GM:    ['auto','ev','autonomous'],
  TM:    ['auto','hybrid','commercial vehicles'],
  /* Shipping */
  ZIM:   ['shipping','container','logistics'],
  MATX:  ['shipping','container'],
  UPS:   ['logistics','supply chain','e-commerce'],
  FDX:   ['logistics','freight','supply chain'],
  /* Cyber */
  CRWD:  ['cyber','endpoint security','ai'],
  PANW:  ['cyber','cloud security','ai'],
  ZS:    ['cyber','cloud security','networking'],
  FTNT:  ['cyber','firewall','networking'],
  /* Agriculture */
  ADM:   ['agriculture','grain','food processing'],
  BG:    ['agriculture','grain','oilseeds'],
  MOS:   ['agriculture','fertilizer','potash'],
  NTR:   ['agriculture','fertilizer','retail ag'],
  /* Real Estate */
  AMT:   ['real estate','telecom towers','data centers'],
  PLD:   ['real estate','logistics','warehousing'],
  SPG:   ['real estate','retail malls'],
};

/* ── Known ETFs & Funds with sector/holding data ───────────────── */
const SS_KNOWN_ETF_SECTORS = {
  /* Broad market */
  SPY:   ['technology','financials','healthcare','consumer','industrials','energy'],
  QQQ:   ['technology','ai','semiconductor','consumer','biotech'],
  IWM:   ['financials','industrials','healthcare','consumer','technology'],
  VTI:   ['technology','financials','healthcare','consumer','industrials'],
  VOO:   ['technology','financials','healthcare','consumer','industrials'],
  /* Sector ETFs */
  XLK:   ['technology','semiconductor','software'],
  XLE:   ['oil','energy','lng'],
  XLF:   ['banking','insurance','asset management'],
  XLV:   ['pharma','biotech','medical devices'],
  XLI:   ['industrials','aerospace','defense','transport'],
  XLB:   ['materials','mining','chemicals'],
  XLRE:  ['real estate','reits'],
  XLU:   ['utilities','energy grid'],
  XLP:   ['consumer staples','food','beverage'],
  XLY:   ['consumer discretionary','retail','auto','media'],
  /* Thematic */
  ARKK:  ['ai','biotech','fintech','ev','space'],
  ARKG:  ['biotech','genomics','healthcare ai'],
  ARKW:  ['ai','fintech','cloud','ev'],
  BOTZ:  ['robotics','ai','automation'],
  AIQ:   ['ai','machine learning','cloud'],
  SOXX:  ['semiconductor','equipment','foundry'],
  SMH:   ['semiconductor','equipment'],
  IGV:   ['software','cloud','saas'],
  CLOUD: ['cloud','saas','cybersecurity'],
  HACK:  ['cyber','cybersecurity','network security'],
  JETS:  ['airlines','aerospace','aviation'],
  ITB:   ['homebuilders','construction','real estate'],
  XHB:   ['homebuilders','home improvement','real estate'],
  GLD:   ['gold','precious metals'],
  SLV:   ['silver','precious metals'],
  GDXJ:  ['gold miners','silver miners','mining'],
  GDX:   ['gold miners','mining'],
  USO:   ['oil','crude','energy'],
  UNG:   ['natural gas','lng'],
  AMLP:  ['oil pipelines','mlp','energy'],
  /* International */
  EWJ:   ['japan','automotive','technology','financials'],
  EWT:   ['taiwan','semiconductor','technology'],
  FXI:   ['china','technology','consumer','financials'],
  EWZ:   ['brazil','iron','oil','financials'],
  /* Fixed income / multi-asset (minimal sector) */
  TLT:   ['bonds','treasuries','macro'],
  HYG:   ['high yield bonds','credit','macro'],
  LQD:   ['investment grade bonds','credit'],
};

/* ══════════════════════════════════════════════════════════════════
   DETECTION — is this a stock, ETF, or fund?
   ══════════════════════════════════════════════════════════════════ */
async function ssDetectType(sym) {
  /* 1. Check known ETF list first (instant) */
  if (SS_KNOWN_ETF_SECTORS[sym]) return 'etf';

  /* 2. Try Finnhub profile — check finnhubIndustry for ETF/Fund */
  if (typeof fhGetProfile === 'function' && getFinnhubKey()) {
    try {
      const p = await fhGetProfile(sym);
      if (p) {
        const ind = (p.sector || '').toLowerCase();
        if (ind.includes('etf') || ind.includes('exchange traded') ||
            ind.includes('fund')) return 'etf';
        return 'stock';
      }
    } catch(e) { /* fall through */ }
  }

  /* 3. FMP profile fallback */
  if (typeof fmpFetch === 'function' && getFmpKey()) {
    try {
      const data = await fmpFetch(`/v3/profile/${sym}`, sym);
      const p = Array.isArray(data) ? data[0] : data;
      if (p) {
        const t = (p.isEtf === true || p.isFund === true || p.isActivelyTrading === false);
        if (t) return 'etf';
        return 'stock';
      }
    } catch(e) { /* fall through */ }
  }

  /* 4. Heuristic: well-known 3-letter symbols tend to be ETFs */
  const etfPatterns = /^(SPY|QQQ|IWM|VT[I-Z]|XL[A-Z]|ARK[A-Z]|SMH|SOXX|GLD|SLV|GDX|USO|UNG|TLT|HYG|LQD|EW[A-Z]|FXI|EWZ)$/;
  if (etfPatterns.test(sym)) return 'etf';

  return 'stock';
}

/* ══════════════════════════════════════════════════════════════════
   STOCK FLOW — detect sectors, populate watchlist
   ══════════════════════════════════════════════════════════════════ */
async function ssHandleStock(sym) {
  /* 1. Get sectors from static map first */
  let sectors = SS_STOCK_SECTORS[sym] ? [...SS_STOCK_SECTORS[sym]] : [];

  /* 2. Enrich with live Finnhub profile if available */
  if (typeof fhGetProfile === 'function' && getFinnhubKey()) {
    try {
      const p = await fhGetProfile(sym);
      if (p?.sector) {
        const liveSector = p.sector.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
        if (liveSector && !sectors.includes(liveSector)) sectors.unshift(liveSector);
      }
    } catch(e) { /* ignore */ }
  }

  /* 3. If still empty, fallback to ticker-based guess */
  if (!sectors.length) sectors = ['technology'];

  ss_sectors = sectors;
  ssRenderSectorWatchlistBadges(sym, sectors, 'stock');

  /* 4. Load the primary sector into watchlist */
  if (sectors.length && typeof loadWatchlist === 'function') {
    loadWatchlist(sectors[0]);
  }

  /* 5. Show the "also active in" bar */
  if (sectors.length > 1) ssShowSectorBar(sym, sectors);
}

/* ══════════════════════════════════════════════════════════════════
   ETF/FUND FLOW — fetch holdings, detect sectors, render HOLD tab
   ══════════════════════════════════════════════════════════════════ */
async function ssHandleEtf(sym) {
  /* 1. Sectors from static map */
  let sectors = SS_KNOWN_ETF_SECTORS[sym] ? [...SS_KNOWN_ETF_SECTORS[sym]] : [];

  /* 2. Fetch holdings via FMP */
  let holdings = [];
  if (typeof fmpFetch === 'function' && getFmpKey()) {
    try {
      holdings = await ssFetchHoldings(sym);
    } catch(e) { console.warn('[SS] holdings fetch failed:', e.message); }
  }

  /* 3. Derive sectors from holdings if we don't have them */
  if (!sectors.length && holdings.length) {
    const seen = new Set();
    holdings.forEach(h => {
      const s = (h.sector || '').toLowerCase().replace(/[^a-z0-9 ]/g,'').trim();
      if (s && !seen.has(s)) { seen.add(s); sectors.push(s); }
    });
  }
  if (!sectors.length) sectors = ['diversified'];

  ss_sectors  = sectors;
  ss_holdings = holdings;

  /* 4. Populate sector watchlist */
  ssRenderSectorWatchlistBadges(sym, sectors, 'etf');
  if (sectors.length && typeof loadWatchlist === 'function') {
    loadWatchlist(sectors[0]);
  }

  /* 5. Inject HOLD tab into Fundamentals panel */
  ssInjectHoldingsTab(sym, holdings, sectors);

  /* 6. Show sector bar */
  if (sectors.length > 1) ssShowSectorBar(sym, sectors);
}

/* ── Fetch ETF holdings from FMP ────────────────────────────────── */
async function ssFetchHoldings(sym) {
  const raw = await fmpFetch(`/v3/etf-holder/${sym}`, sym);
  if (!Array.isArray(raw) || !raw.length) {
    /* Try mutual fund endpoint */
    const raw2 = await fmpFetch(`/v3/mutual-fund-holder/${sym}`, sym);
    if (!Array.isArray(raw2)) return [];
    return raw2.slice(0, 50).map(h => ({
      ticker:  h.asset || h.symbol || '',
      name:    h.name || h.companyName || '',
      weight:  parseFloat(h.weightPercentage || h.weight || 0),
      shares:  h.shares || h.sharesNumber || null,
      sector:  h.sector || '',
      change:  h.change || null,
    }));
  }
  return raw.slice(0, 50).map(h => ({
    ticker:  h.asset || h.symbol || '',
    name:    h.name || h.companyName || '',
    weight:  parseFloat(h.weightPercentage || h.weight || 0),
    shares:  h.shares || h.sharesNumber || null,
    sector:  h.sector || h.assetClass || '',
    change:  h.change || null,
  }));
}

/* ══════════════════════════════════════════════════════════════════
   SECTOR BAR — shown in Watchlist panel header
   "Also active in: [chip] [ai] [consumer] …"
   ══════════════════════════════════════════════════════════════════ */
function ssRenderSectorWatchlistBadges(sym, sectors, type) {
  const existing = document.getElementById('ss-sector-bar');
  if (existing) existing.remove();

  const bar = document.createElement('div');
  bar.id = 'ss-sector-bar';
  bar.className = 'ss-sector-bar';

  const label = type === 'etf' ? `${sym} — sector exposures:` : `${sym} operates in:`;
  bar.innerHTML = `
    <span class="ss-bar-label">${escapeHtml(label)}</span>
    <div class="ss-chips">
      ${sectors.map((s, i) => `
        <button class="ss-chip ${i === 0 ? 'active' : ''}"
                onclick="ssLoadSector('${escapeHtml(s)}', this)">
          ${escapeHtml(s)}
        </button>`).join('')}
    </div>`;

  /* Insert above watchlistBox */
  const sortbar = document.querySelector('#panel-watchlist .wl-sortbar');
  const panel   = document.getElementById('panel-watchlist');
  if (sortbar && panel) panel.insertBefore(bar, sortbar);
  else if (panel) panel.appendChild(bar);

  /* Show watchlist panel */
  if (typeof showPanel === 'function') showPanel('watchlist');
}

function ssLoadSector(sector, btn) {
  /* Update active chip */
  document.querySelectorAll('#ss-sector-bar .ss-chip').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (typeof loadWatchlist === 'function') loadWatchlist(sector);
}

function ssShowSectorBar(sym, sectors) {
  /* Also show a compact bar in the watchlist label area */
  const lbl = document.getElementById('watchlistLabel');
  if (lbl) lbl.textContent = `${sym} · ${sectors.length} sectors`;
}

/* ══════════════════════════════════════════════════════════════════
   HOLDINGS TAB — injected into Fundamentals panel
   ══════════════════════════════════════════════════════════════════ */
function ssInjectHoldingsTab(sym, holdings, sectors) {
  const tabBar  = document.querySelector('#panel-fundamentals .tab-bar');
  const fundPanel = document.getElementById('panel-fundamentals');
  if (!tabBar || !fundPanel) return;

  /* Remove existing HOLD tab if present */
  const existingBtn  = tabBar.querySelector('[data-tab="hold"]');
  const existingPane = document.getElementById('fund-hold');
  if (existingBtn)  existingBtn.remove();
  if (existingPane) existingPane.remove();

  /* Add HOLD tab button */
  const btn = document.createElement('button');
  btn.className    = 'tab-btn ss-hold-tab';
  btn.dataset.tab  = 'hold';
  btn.textContent  = `HOLD (${holdings.length})`;
  btn.onclick = () => switchTab('fundamentals', 'hold');
  tabBar.appendChild(btn);

  /* Build holdings pane */
  const pane = document.createElement('div');
  pane.className = 'tab-pane panel-content';
  pane.dataset.tab = 'hold';
  pane.id = 'fund-hold';

  if (!holdings.length) {
    pane.innerHTML = `<div class="ss-hold-empty">
      <p>Holdings data requires a Financial Modeling Prep (FMP) API key.</p>
      <p>Configure it via ⚙ API → FMP Key.</p>
    </div>`;
  } else {
    /* Sort by weight descending */
    const sorted = [...holdings].sort((a,b) => (b.weight||0) - (a.weight||0));

    /* Sector breakdown donut-like bar */
    const sectorTotals = {};
    sorted.forEach(h => {
      const s = h.sector || 'Other';
      sectorTotals[s] = (sectorTotals[s] || 0) + (h.weight || 0);
    });
    const sectorEntries = Object.entries(sectorTotals).sort((a,b) => b[1]-a[1]);
    const palette = ['#00d4a0','#1a6bff','#ffa500','#ff4757','#7bed9f','#70a1ff','#eccc68','#ff6b81','#a29bfe','#fd79a8'];

    const sectorBars = sectorEntries.map(([sec, pct], i) =>
      `<div class="ss-sec-bar-item" title="${escapeHtml(sec)}: ${pct.toFixed(1)}%">
        <div class="ss-sec-bar-fill" style="width:${Math.min(pct,100)}%;background:${palette[i%palette.length]}"></div>
        <span class="ss-sec-label">${escapeHtml(sec)}</span>
        <span class="ss-sec-pct">${pct.toFixed(1)}%</span>
       </div>`
    ).join('');

    const rows = sorted.map(h => {
      const w = (h.weight || 0).toFixed(2);
      const chgClass = h.change > 0 ? 'ss-pos' : h.change < 0 ? 'ss-neg' : '';
      const chgStr = h.change != null ? `${h.change > 0 ? '+' : ''}${Number(h.change).toFixed(2)}%` : '—';
      return `<tr class="ss-hold-row" onclick="ssHoldingClick('${escapeHtml(h.ticker)}')" title="Click to load ${escapeHtml(h.ticker)} in all panels">
        <td class="ss-hold-ticker">${escapeHtml(h.ticker||'—')}</td>
        <td class="ss-hold-name">${escapeHtml((h.name||'').slice(0,28))}</td>
        <td class="ss-hold-weight">${w}%</td>
        <td class="ss-hold-sector">${escapeHtml((h.sector||'').slice(0,18))}</td>
        <td class="${chgClass}">${chgStr}</td>
        <td><button class="ss-hold-btn" onclick="event.stopPropagation();ssHoldingClick('${escapeHtml(h.ticker)}')">▶ Load</button></td>
      </tr>`;
    }).join('');

    pane.innerHTML = `
      <div class="ss-hold-header">
        <span class="ss-hold-title">${escapeHtml(sym)} — ${holdings.length} holdings</span>
        <span class="ss-hold-hint">Click any row to load in Chart · News · Quote · Analysts · Ownership</span>
      </div>
      <div class="ss-sector-breakdown">
        <div class="ss-sec-head">Sector Breakdown</div>
        ${sectorBars}
      </div>
      <div class="ss-hold-table-wrap">
        <table class="ss-hold-table">
          <thead>
            <tr>
              <th>Ticker</th><th>Name</th><th>Weight</th><th>Sector</th><th>Chg%</th><th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  /* Insert pane before resize handles */
  const firstResizeHandle = fundPanel.querySelector('.resize-handle');
  if (firstResizeHandle) fundPanel.insertBefore(pane, firstResizeHandle);
  else fundPanel.appendChild(pane);

  /* Auto-switch to HOLD tab */
  switchTab('fundamentals', 'hold');
  if (typeof showPanel === 'function') showPanel('fundamentals');
}

/* ══════════════════════════════════════════════════════════════════
   HOLDING CLICK — load ticker in all panels EXCEPT fundamentals
   ══════════════════════════════════════════════════════════════════ */
function ssHoldingClick(ticker) {
  if (!ticker) return;
  const sym = ticker.replace(/.*:/,'').toUpperCase();

  /* Update topbar ticker input */
  const input = document.getElementById('tickerInput');
  if (input) input.value = sym;

  /* Update global currentTicker */
  if (typeof currentTicker !== 'undefined') window.currentTicker = ticker;
  if (typeof updateExchangeHint === 'function') updateExchangeHint();

  /* Load chart */
  if (typeof loadChart === 'function' && typeof resolveSymbol === 'function') {
    loadChart(resolveSymbol(ticker));
    /* Flash chart */
    const cp = document.getElementById('panel-chart');
    if (cp) {
      if (typeof showPanel === 'function') showPanel('chart');
      if (typeof bringToFront === 'function') bringToFront(cp);
      cp.classList.add('chart-flash');
      setTimeout(() => cp.classList.remove('chart-flash'), 800);
    }
  }

  /* News */
  if (typeof renderNews === 'function') {
    renderNews(ticker);
    if (typeof showPanel === 'function') showPanel('news');
  }

  /* Quote */
  if (typeof renderQuote === 'function') renderQuote(ticker);
  if (typeof showPanel === 'function') showPanel('quote');

  /* Analysts */
  if (typeof renderAnalysts === 'function') renderAnalysts(ticker);
  if (typeof showPanel === 'function') showPanel('analysts');

  /* Ownership */
  if (typeof renderOwnership === 'function') renderOwnership(ticker);
  if (typeof showPanel === 'function') showPanel('ownership');

  /* Comparables */
  if (typeof renderComparables === 'function') renderComparables(ticker);

  /* Valuation */
  if (typeof renderValuation === 'function') renderValuation(ticker);

  /* Fire API providers */
  if (typeof avLoadAll === 'function') avLoadAll(sym);
  if (typeof finnhubLoadAll === 'function') finnhubLoadAll(sym);

  /* WM enrichment */
  if (typeof wmEnrichTicker === 'function') {
    setTimeout(() => wmEnrichTicker(ticker), 1200);
  }

  /* ⚠ EXPLICITLY DO NOT call renderFundamentals — keep holdings pane intact */

  /* Visual feedback on the clicked row */
  document.querySelectorAll('.ss-hold-row').forEach(r => r.classList.remove('ss-hold-active'));
  const rows = document.querySelectorAll('.ss-hold-row');
  rows.forEach(r => {
    if (r.querySelector('.ss-hold-ticker')?.textContent === sym) {
      r.classList.add('ss-hold-active');
      setTimeout(() => r.classList.remove('ss-hold-active'), 2000);
    }
  });

  /* Toast notification */
  ssHoldingToast(sym);
}

function ssHoldingToast(sym) {
  const existing = document.getElementById('ss-toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.id = 'ss-toast';
  t.className = 'ss-toast';
  t.innerHTML = `<span>▶ Loading <strong>${escapeHtml(sym)}</strong> in Chart · News · Quote · Analysts · Ownership</span>`;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 2500);
}

/* ══════════════════════════════════════════════════════════════════
   MAIN ENTRY POINT — called by changeTicker hook
   ══════════════════════════════════════════════════════════════════ */
async function ssAnalyzeTicker(ticker) {
  const sym = ticker.replace(/.*:/,'').toUpperCase();
  if (!sym || sym === ss_currentSym) return;
  ss_currentSym = sym;

  /* Reset previous HOLD tab and sector bar */
  const prevHold = document.getElementById('fund-hold');
  if (prevHold) prevHold.remove();
  const prevBtn = document.querySelector('#panel-fundamentals .tab-btn[data-tab="hold"]');
  if (prevBtn) prevBtn.remove();
  const prevBar = document.getElementById('ss-sector-bar');
  if (prevBar) prevBar.remove();

  try {
    const type = await ssDetectType(sym);
    ss_currentType = type;

    if (type === 'etf' || type === 'fund') {
      await ssHandleEtf(sym);
    } else {
      await ssHandleStock(sym);
    }
  } catch(e) {
    console.warn('[SS] analyze error:', e.message);
  }
}

/* ══════════════════════════════════════════════════════════════════
   HOOK INTO changeTicker
   ══════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  /* Patch changeTicker */
  if (typeof changeTicker === 'function') {
    const _orig = changeTicker;
    window.changeTicker = function() {
      _orig();
      const raw = document.getElementById('tickerInput')?.value.trim();
      if (raw) setTimeout(() => ssAnalyzeTicker(raw), 800);
    };
  }

  /* Patch loadTickerFromWatchlist to NOT re-analyze (avoid loop) */
  /* It already sets the ticker — ssAnalyzeTicker would double-trigger */
  /* So we skip ssAnalyzeTicker from watchlist clicks (they're already a holding) */

  /* Run on initial ticker */
  setTimeout(() => {
    const t = typeof currentTicker !== 'undefined' ? currentTicker : 'AAPL';
    ssAnalyzeTicker(t);
  }, 2000);
});
