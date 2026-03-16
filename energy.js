/* ══════════════════════════════════════════════════════════════════
   FINTERM — energy.js  (Phase 1)
   Energy data integration layer
   ──────────────────────────────────────────────────────────────────
   Sources — ALL FREE:
   ┌─────────────────────────────────────────────────────────────┐
   │ EIA      eia.gov/dnav   — WTI, Henry Hub, coal XLS (no key)│
   │ OPEC     opec.org       — OPEC basket price (no key)        │
   │ ENTSOG   entsog.eu      — EU gas flows REST (no key)        │
   │ GIE AGSI agsi.gie.eu    — EU gas storage (free key opt.)    │
   └─────────────────────────────────────────────────────────────┘
   Populates: #macro-energy  (Macro Intel → ⚡ ENERGY tab)
   ══════════════════════════════════════════════════════════════════ */

/* ── Module-level cache ─────────────────────────────────────────── */
const _EN = {};
function _enGet(k, ms) { const e = _EN[k]; return (e && Date.now() - e.ts < ms) ? e.d : null; }
function _enSet(k, d)  { _EN[k] = { d, ts: Date.now() }; }

/* ── Helpers ────────────────────────────────────────────────────── */
const _enEsc = s => String(s ?? '').replace(/[<>&"]/g, c =>
  ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;' }[c]));
const _enFmt   = (n, d = 2) => (n == null || isNaN(n)) ? '—' : Number(n).toFixed(d);
const _enFmtK  = n => {
  if (n == null || isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return (n/1e9).toFixed(2)+'B';
  if (a >= 1e6) return (n/1e6).toFixed(2)+'M';
  if (a >= 1e3) return (n/1e3).toFixed(1)+'K';
  return Number(n).toFixed(0);
};
const _enChgCls = v => v > 0 ? 'en-pos' : v < 0 ? 'en-neg' : '';
const _enArrow  = v => v > 0 ? '▲' : v < 0 ? '▼' : '—';

/* CORS proxy — same pattern as technical.js */
const _EN_PROXY = 'https://api.allorigins.win/raw?url=';

async function _enFetch(url, key, ttl = 15 * 60 * 1000) {
  const c = _enGet(key, ttl);
  if (c) return c;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    _enSet(key, text);
    return text;
  } catch (e) { console.warn('[energy]', key, e.message); return null; }
}

async function _enFetchJson(url, key, ttl = 15 * 60 * 1000) {
  const c = _enGet(key, ttl);
  if (c) return c;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    _enSet(key, data);
    return data;
  } catch (e) { console.warn('[energy]', key, e.message); return null; }
}

/* ══════════════════════════════════════════════════════════════════
   EIA PRICE SERIES  (XLS bulk download, no key)
   ══════════════════════════════════════════════════════════════════ */
const EIA_SERIES = [
  { id:'wti',      label:'WTI Crude Oil',    unit:'$/bbl',    icon:'🛢',  color:'#f0883e',
    url:'https://www.eia.gov/dnav/pet/hist_xls/RWTCd.xls',
    note:'Cushing, OK spot' },
  { id:'henryhub', label:'Henry Hub Gas',    unit:'$/MMBtu',  icon:'🔥',  color:'#3fb950',
    url:'https://www.eia.gov/dnav/ng/hist_xls/RNGWHHDd.xls',
    note:'Louisiana spot' },
  { id:'heatoil',  label:'Heating Oil',      unit:'$/gal',    icon:'🏭',  color:'#d29922',
    url:'https://www.eia.gov/dnav/pet/hist_xls/EER_EPD2F_PF4_Y35NY_DPGd.xls',
    note:'NY Harbor No.2' },
  { id:'rbob',     label:'RBOB Gasoline',    unit:'$/gal',    icon:'⛽',  color:'#58a6ff',
    url:'https://www.eia.gov/dnav/pet/hist_xls/EER_EPMRR_PF4_Y35NY_DPGd.xls',
    note:'NY Harbor conventional' },
];

/* Parse EIA tab-separated XLS content */
function _parseEiaXls(raw) {
  if (!raw) return null;
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const rows  = [];
  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    const date = parts[0].trim();
    const val  = parseFloat(parts[parts.length - 1]);
    if (!isNaN(val) && val > 0 &&
        (date.match(/^\d{4}-\d{2}-\d{2}$/) || date.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/))) {
      rows.push({ date, value: val });
    }
  }
  if (!rows.length) return null;
  rows.sort((a, b) => a.date > b.date ? 1 : -1);

  const last  = rows[rows.length - 1];
  const prev  = rows.length >  1 ? rows[rows.length -  2] : null;
  const week  = rows.length >  5 ? rows[rows.length -  6] : null;
  const month = rows.length > 21 ? rows[rows.length - 22] : null;

  const pct = (a, b) => b ? (a - b) / Math.abs(b) * 100 : null;

  return {
    current:  last.value,
    date:     last.date,
    chg1d:    prev  ? last.value - prev.value  : null,
    chg1dPct: pct(last.value, prev?.value),
    chg1wPct: pct(last.value, week?.value),
    chg1mPct: pct(last.value, month?.value),
    history:  rows.slice(-30).map(r => r.value),
  };
}

async function _eiaFetchSeries(s) {
  const raw = await _enFetch(_EN_PROXY + encodeURIComponent(s.url), `eia_${s.id}`, 30 * 60 * 1000);
  return _parseEiaXls(raw);
}

/* EIA weekly natural gas storage */
async function _eiaGasStorage() {
  const url = _EN_PROXY + encodeURIComponent(
    'https://www.eia.gov/dnav/ng/hist_xls/NW2_EPG0_SWO_R48_BCFw.xls');
  const raw = await _enFetch(url, 'eia_gas_storage', 60 * 60 * 1000);
  if (!raw) return null;

  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const rows  = [];
  for (const line of lines) {
    const parts = line.split('\t');
    const date  = parts[0]?.trim();
    const val   = parseFloat(parts[parts.length - 1]);
    if (date && !isNaN(val) && val > 100) rows.push({ date, value: val });
  }
  if (!rows.length) return null;
  rows.sort((a, b) => a.date > b.date ? 1 : -1);

  const last = rows[rows.length - 1];
  const prev = rows.length >  1 ? rows[rows.length -  2] : null;
  const yr   = rows.length > 52 ? rows[rows.length - 53] : null;

  return {
    current:  last.value,
    date:     last.date,
    chgWeek:  prev ? last.value - prev.value : null,
    chgYear:  yr   ? last.value - yr.value   : null,
    unit:     'Bcf',
    history:  rows.slice(-20).map(r => r.value),
  };
}

/* ══════════════════════════════════════════════════════════════════
   OPEC BASKET  (HTML scrape via allorigins)
   ══════════════════════════════════════════════════════════════════ */
async function _opecBasket() {
  const html = await _enFetch(
    _EN_PROXY + encodeURIComponent('https://www.opec.org/opec_web/en/data_graphs/40.htm'),
    'opec_basket_html', 60 * 60 * 1000);
  if (!html) return null;

  /* The page contains a table with price rows like:
     <td ...>72.45</td>  and date cells.
     We collect all numeric tds and take the last plausible oil price. */
  const prices = (html.match(/<td[^>]*>\s*([\d]{2,3}\.[\d]{1,3})\s*<\/td>/g) || [])
    .map(td => parseFloat(td.replace(/<[^>]+>/g, '')))
    .filter(v => !isNaN(v) && v > 20 && v < 300);

  const dateMatch = html.match(
    /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
  const date = dateMatch ? `${dateMatch[1]} ${dateMatch[2]} ${dateMatch[3]}` : 'Latest';

  if (!prices.length) return null;
  return { price: prices[prices.length - 1], date, unit: '$/bbl' };
}

/* ══════════════════════════════════════════════════════════════════
   ENTSOG — European Gas Flows  (no key, public REST)
   ══════════════════════════════════════════════════════════════════ */
async function _entsogFlows() {
  const from = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const to   = new Date().toISOString().slice(0, 10);

  const url = `https://transparency.entsog.eu/api/v1/operationalData?` +
    `limit=200&indicator=Physical%20Flow&periodType=day` +
    `&from=${from}&to=${to}&timezone=CET&sort=periodFrom%20desc`;

  const data = await _enFetchJson(url, 'entsog_flows', 60 * 60 * 1000);
  if (!data?.operationalData?.length) return null;

  /* Aggregate by country pair */
  const agg = {};
  for (const r of data.operationalData) {
    const from_ = r.fromCountryLabel || r.pointLabel || '?';
    const to_   = r.toCountryLabel   || '?';
    const key   = `${from_} → ${to_}`;
    if (!agg[key]) agg[key] = { sum: 0, n: 0, unit: r.unit || 'kWh/d' };
    const v = parseFloat(r.value);
    if (!isNaN(v)) { agg[key].sum += v; agg[key].n++; }
  }

  return Object.entries(agg)
    .map(([route, d]) => ({ route, value: d.n ? d.sum / d.n : 0, unit: d.unit }))
    .filter(r => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);
}

/* ══════════════════════════════════════════════════════════════════
   GIE AGSI — EU Gas Storage  (free key optional)
   ══════════════════════════════════════════════════════════════════ */
function _getGieKey() {
  return (window._KEYS?.gie) || localStorage.getItem('finterm_key_gie') || '';
}

async function _gieStorage() {
  const key     = _getGieKey();
  const keyPart = key ? `&apikey=${key}` : '';
  const url     = `https://agsi.gie.eu/api?country=EU&size=12${keyPart}`;

  const data = await _enFetchJson(url, 'gie_eu_storage', 3 * 60 * 60 * 1000);
  if (!data?.data?.length) return null;

  return data.data.slice(0, 10).map(d => ({
    country:  d.name || d.country || '—',
    full:     parseFloat(d.full      ?? d.gasInStorage      ?? 0),
    capacity: parseFloat(d.workingGasVolume ?? d.capacity   ?? 0),
    pct:      parseFloat(d.full ?? 0),           // GIE reports % fill as 'full'
    inj:      parseFloat(d.injection  ?? 0),
    with:     parseFloat(d.withdrawal ?? 0),
    date:     d.gasDayStart || d.date || '',
  }));
}

/* ══════════════════════════════════════════════════════════════════
   SPARKLINE
   ══════════════════════════════════════════════════════════════════ */
function _enSparkline(values, color = '#58a6ff') {
  if (!values || values.length < 2) return '';
  const mn = Math.min(...values), mx = Math.max(...values), range = mx - mn || 1;
  const W = 80, H = 24;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - mn) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const lastY = H - ((values[values.length-1] - mn) / range) * H;
  return `<svg width="${W}" height="${H}" style="display:block;overflow:visible">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="${W}" cy="${lastY.toFixed(1)}" r="2.5" fill="${color}"/>
  </svg>`;
}

/* ══════════════════════════════════════════════════════════════════
   RENDER HELPERS
   ══════════════════════════════════════════════════════════════════ */
function _enLiveBar(text, sub = '') {
  return `<div class="en-live-bar">
    <span class="en-live-dot"></span>
    <span>${_enEsc(text)}</span>
    ${sub ? `<span class="en-live-sub">${_enEsc(sub)}</span>` : ''}
  </div>`;
}
function _enSectionHead(t) {
  return `<div class="en-section-head">${_enEsc(t)}</div>`;
}
function _enNoData(msg) {
  return `<div class="en-nodata">// ${_enEsc(msg)}</div>`;
}

function _renderPriceCard(s, data) {
  if (!data) return `<div class="en-price-card en-price-card-empty">
    <div class="en-pc-top"><span>${s.icon}</span><span class="en-pc-label">${_enEsc(s.label)}</span></div>
    <div class="en-pc-val en-muted">—</div>
    <div class="en-pc-note">Unavailable</div>
  </div>`;

  const d1Cls = _enChgCls(data.chg1dPct);
  return `<div class="en-price-card" style="border-top:2px solid ${s.color}">
    <div class="en-pc-top">
      <span class="en-pc-icon">${s.icon}</span>
      <span class="en-pc-label">${_enEsc(s.label)}</span>
      <span class="en-pc-unit">${_enEsc(s.unit)}</span>
    </div>
    <div class="en-pc-val" style="color:${s.color}">${_enFmt(data.current)}</div>
    <div class="en-pc-chg ${d1Cls}">
      ${_enArrow(data.chg1dPct)} ${data.chg1dPct != null ? Math.abs(data.chg1dPct).toFixed(2)+'%' : '—'}
      <span class="en-pc-abs">${data.chg1d != null ? (data.chg1d>=0?'+':'')+data.chg1d.toFixed(2) : ''}</span>
    </div>
    <div class="en-pc-spark">${_enSparkline(data.history, s.color)}</div>
    <div class="en-pc-meta">
      <span class="en-muted">${_enEsc(data.date)}</span>
      ${data.chg1wPct != null ? `<span class="${_enChgCls(data.chg1wPct)}">1W ${data.chg1wPct>=0?'+':''}${data.chg1wPct.toFixed(1)}%</span>` : ''}
      ${data.chg1mPct != null ? `<span class="${_enChgCls(data.chg1mPct)}">1M ${data.chg1mPct>=0?'+':''}${data.chg1mPct.toFixed(1)}%</span>` : ''}
    </div>
    <div class="en-pc-note en-muted">${_enEsc(s.note)}</div>
  </div>`;
}

/* ══════════════════════════════════════════════════════════════════
   MAIN RENDER
   ══════════════════════════════════════════════════════════════════ */
async function energyRender() {
  const el = document.getElementById('macro-energy');
  if (!el) return;
  el.innerHTML = `<div class="en-loading"><span class="av-spinner"></span> Loading energy data…</div>`;

  const [eiaCards, gasStorage, opec, entsog, gie] = await Promise.all([
    Promise.all(EIA_SERIES.map(s => _eiaFetchSeries(s).then(d => ({ s, d })))),
    _eiaGasStorage(),
    _opecBasket(),
    _entsogFlows(),
    _gieStorage(),
  ]);

  let html = '';

  /* ── US Benchmark Prices ─────────────────────────────────────── */
  html += _enLiveBar('US Energy Benchmarks', 'EIA · No API key · Daily updates');
  html += `<div class="en-price-grid">`;
  for (const { s, d } of eiaCards) html += _renderPriceCard(s, d);

  if (opec) {
    html += `<div class="en-price-card" style="border-top:2px solid #e05252">
      <div class="en-pc-top"><span class="en-pc-icon">🛢</span>
        <span class="en-pc-label">OPEC Basket</span>
        <span class="en-pc-unit">$/bbl</span></div>
      <div class="en-pc-val" style="color:#e05252">${_enFmt(opec.price)}</div>
      <div class="en-pc-chg en-muted">13-country reference basket</div>
      <div class="en-pc-meta"><span class="en-muted">${_enEsc(opec.date)}</span></div>
      <div class="en-pc-note en-muted">OPEC official reference price</div>
    </div>`;
  }
  html += `</div>`;

  /* ── US Gas Storage ──────────────────────────────────────────── */
  html += _enSectionHead('🇺🇸 US Natural Gas Storage — EIA Weekly (Lower 48)');
  if (gasStorage) {
    const wCls = _enChgCls(gasStorage.chgWeek);
    const yCls = _enChgCls(gasStorage.chgYear);
    html += `<div class="en-storage-strip">
      <div class="en-storage-kpi">
        <span class="en-storage-lbl">Working Gas</span>
        <span class="en-storage-val">${_enFmtK(gasStorage.current)} Bcf</span>
      </div>
      <div class="en-storage-kpi">
        <span class="en-storage-lbl">Week-on-Week</span>
        <span class="en-storage-val ${wCls}">
          ${_enArrow(gasStorage.chgWeek)} ${gasStorage.chgWeek != null ? Math.abs(gasStorage.chgWeek).toFixed(0)+' Bcf' : '—'}
        </span>
      </div>
      <div class="en-storage-kpi">
        <span class="en-storage-lbl">Year-on-Year</span>
        <span class="en-storage-val ${yCls}">
          ${_enArrow(gasStorage.chgYear)} ${gasStorage.chgYear != null ? (gasStorage.chgYear>=0?'+':'')+gasStorage.chgYear.toFixed(0)+' Bcf' : '—'}
        </span>
      </div>
      <div class="en-storage-date en-muted">As of ${_enEsc(gasStorage.date || '—')}</div>
    </div>
    <div class="en-storage-spark-wrap">
      ${_enSparkline(gasStorage.history, '#3fb950')}
      <span class="en-storage-spark-lbl en-muted">20-week storage trend (Bcf)</span>
    </div>`;
  } else {
    html += _enNoData('US gas storage data unavailable. EIA bulk endpoint may be updating.');
  }

  /* ── EU Gas Storage (GIE AGSI) ───────────────────────────────── */
  const gieKeyNote = _getGieKey() ? '' : ' · <a href="https://agsi.gie.eu/" target="_blank" rel="noopener" class="en-link">Add free key</a> for facility detail';
  html += _enSectionHead('🇪🇺 EU Gas Storage — GIE AGSI' + gieKeyNote);

  if (gie && gie.length) {
    html += `<div class="en-gie-wrap"><table class="en-gie-table">
      <thead><tr><th>Country</th><th>Fill</th><th>Volume</th><th>Injection</th><th>Date</th></tr></thead>
      <tbody>`;
    for (const row of gie) {
      const pct      = isNaN(row.pct) || row.pct === 0
        ? (row.capacity > 0 ? row.full / row.capacity * 100 : 0) : row.pct;
      const pctClamp = Math.min(100, Math.max(0, pct));
      const pctColor = pct >= 90 ? '#3fb950' : pct >= 70 ? '#d29922' : pct >= 40 ? '#f0883e' : '#f85149';
      const netFlow  = row.inj - row.with;
      html += `<tr>
        <td class="en-gie-country">${_enEsc(row.country)}</td>
        <td>
          <div class="en-gie-bar-wrap">
            <div class="en-gie-bar" style="width:${pctClamp.toFixed(1)}%;background:${pctColor}"></div>
          </div>
          <span style="color:${pctColor};font-size:10px;font-weight:600">${pct.toFixed(1)}%</span>
        </td>
        <td>${_enFmtK(row.full)} TWh</td>
        <td class="${_enChgCls(netFlow)}">${netFlow >= 0 ? '+' : ''}${_enFmt(netFlow, 1)}</td>
        <td class="en-muted">${_enEsc((row.date || '').slice(0, 10))}</td>
      </tr>`;
    }
    html += `</tbody></table></div>`;
  } else {
    html += _enNoData('EU storage data unavailable.' + (_getGieKey() ? ' GIE API may be updating.' : ' Register a free key at agsi.gie.eu for live data.'));
  }

  /* ── ENTSOG EU Gas Flows ─────────────────────────────────────── */
  html += _enSectionHead('🌐 European Gas Flows — ENTSOG Transparency · No API key');
  if (entsog && entsog.length) {
    const maxVal = entsog[0].value;
    html += `<div class="en-flows-list">`;
    for (const f of entsog) {
      const gwh    = (f.value / 1e6).toFixed(0); // kWh/d → GWh/d
      const barPct = maxVal > 0 ? (f.value / maxVal * 100) : 0;
      html += `<div class="en-flow-row">
        <span class="en-flow-route">${_enEsc(f.route)}</span>
        <div class="en-flow-bar-wrap">
          <div class="en-flow-bar" style="width:${barPct.toFixed(1)}%"></div>
        </div>
        <span class="en-flow-val">${_enEsc(gwh)} GWh/d</span>
      </div>`;
    }
    html += `</div>`;
  } else {
    html += _enNoData('ENTSOG operational data unavailable. The API may not return recent data for this date range.');
  }

  /* ── Footer ─────────────────────────────────────────────────── */
  html += `<div class="en-footer">
    <a href="https://www.eia.gov/opendata/" target="_blank" rel="noopener" class="en-link">EIA</a> ·
    <a href="https://www.opec.org" target="_blank" rel="noopener" class="en-link">OPEC</a> ·
    <a href="https://transparency.entsog.eu" target="_blank" rel="noopener" class="en-link">ENTSOG</a> ·
    <a href="https://agsi.gie.eu" target="_blank" rel="noopener" class="en-link">GIE AGSI</a>
    · All sources free · No mandatory API key
  </div>`;

  el.innerHTML = html;
}

/* ══════════════════════════════════════════════════════════════════
   PUBLIC API
   ══════════════════════════════════════════════════════════════════ */
window.energyLoadAll = function () { energyRender(); };

document.addEventListener('DOMContentLoaded', () => {
  let _enTimer = null;
  document.addEventListener('click', e => {
    if (e.target?.dataset?.tab === 'energy' && e.target.closest('#panel-macro')) {
      energyRender();
      clearInterval(_enTimer);
      _enTimer = setInterval(energyRender, 30 * 60 * 1000);
    }
  });
});
