/* ══════════════════════════════════════════════════════════════════
   macroglobal.js  —  Global Macro Economics Module  v1.0
   ──────────────────────────────────────────────────────────────────
   Fills Gap #2 from the FINTERM Gap Analysis:
   Coverage 70% → target 90%+

   GAP: Solo dati USA (FRED), nessun GDP/CPI/PMI globale

   Sources — ALL FREE, NO API KEY:
   ┌─────────────────────────────────────────────────────────────┐
   │ World Bank API   api.worldbank.org/v2  — GDP,CPI,Unemploy. │
   │ IMF DataMapper   imf.org/external/datamapper — WEO forecasts│
   │ OECD API         stats.oecd.org/SDMX-JSON — CLI leading idx │
   │ Federal Reserve  federalreserve.gov — FOMC calendar (HTML)  │
   │ ECB              ecb.europa.eu/press/calendars — ECB dates   │
   │ AllOrigins proxy api.allorigins.win — CORS bypass for RSS    │
   └─────────────────────────────────────────────────────────────┘

   Panels populated:
   • Macro·Intel → 🌐 GLOBAL tab  (World Bank + IMF dashboard)
   • Macro·Intel → 📊 PMI tab     (OECD CLI as PMI proxy)
   • Macro·Intel → 🏦 BANKS tab   (Fed/ECB/BoE/BoJ/PBoC calendars)
   • Macro·Intel → ECON tab       (enriched with WB global data)
   ══════════════════════════════════════════════════════════════════ */

const _MG = {}; // module-level cache
function _mgGet(k, ms) { const e=_MG[k]; return (e&&Date.now()-e.ts<ms)?e.d:null; }
function _mgSet(k, d)  { _MG[k]={d,ts:Date.now()}; }
const _me = s => String(s??'').replace(/[<>&"]/g, c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
const _mf = (n,d=1) => n==null||isNaN(n) ? '—' : Number(n).toFixed(d);
const _mc = n => n>0?'pos':n<0?'neg':'';

/* ══════════════════════════════════════════════════════════════════
   WORLD BANK API  (free, no key, CORS OK)
   Base: https://api.worldbank.org/v2
   ══════════════════════════════════════════════════════════════════ */
const WB_BASE = 'https://api.worldbank.org/v2';

const WB_INDICATORS = {
  gdp_growth:   'NY.GDP.MKTP.KD.ZG',   // GDP growth (annual %)
  gdp_current:  'NY.GDP.MKTP.CD',       // GDP current USD
  cpi:          'FP.CPI.TOTL.ZG',       // CPI inflation (annual %)
  unemployment: 'SL.UEM.TOTL.ZS',       // Unemployment % labor force
  current_acct: 'BN.CAB.XOKA.GD.ZS',   // Current account % GDP
  debt_gdp:     'GC.DOD.TOTL.GD.ZS',   // Govt debt % GDP
  trade_gdp:    'NE.TRD.GNFS.ZS',       // Trade % GDP
  fdi_inflow:   'BX.KLT.DINV.WD.GD.ZS',// FDI inflows % GDP
};

// Key economies to track
const WB_COUNTRIES = [
  { code:'US', name:'🇺🇸 USA',        flag:'🇺🇸' },
  { code:'CN', name:'🇨🇳 China',      flag:'🇨🇳' },
  { code:'DE', name:'🇩🇪 Germany',    flag:'🇩🇪' },
  { code:'JP', name:'🇯🇵 Japan',      flag:'🇯🇵' },
  { code:'GB', name:'🇬🇧 UK',         flag:'🇬🇧' },
  { code:'FR', name:'🇫🇷 France',     flag:'🇫🇷' },
  { code:'IN', name:'🇮🇳 India',      flag:'🇮🇳' },
  { code:'BR', name:'🇧🇷 Brazil',     flag:'🇧🇷' },
  { code:'IT', name:'🇮🇹 Italy',      flag:'🇮🇹' },
  { code:'CA', name:'🇨🇦 Canada',     flag:'🇨🇦' },
  { code:'KR', name:'🇰🇷 S.Korea',    flag:'🇰🇷' },
  { code:'AU', name:'🇦🇺 Australia',  flag:'🇦🇺' },
];

async function wbFetch(indicatorCode, countryCodes, years=5) {
  const cacheKey = `wb:${indicatorCode}:${countryCodes.join(',')}`;
  const cached = _mgGet(cacheKey, 6*3600*1000); // 6hr TTL
  if (cached) return cached;

  const codes = countryCodes.join(';');
  const startYear = new Date().getFullYear() - years;
  const url = `${WB_BASE}/country/${codes}/indicator/${indicatorCode}?format=json&per_page=200&mrv=${years}&date=${startYear}:${new Date().getFullYear()}`;

  try {
    const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    const data = json?.[1] || [];
    _mgSet(cacheKey, data);
    return data;
  } catch (e) {
    console.warn('[MacroGlobal] WB fetch failed:', e.message);
    return [];
  }
}

// Parse WB data: return latest value per country
function wbLatest(data, countryCode) {
  const rows = data
    .filter(r => r.countryiso3code === countryCode || r.country?.id === countryCode)
    .filter(r => r.value != null)
    .sort((a,b) => parseInt(b.date) - parseInt(a.date));
  return rows[0] || null;
}

/* ══════════════════════════════════════════════════════════════════
   IMF DataMapper API  (free, no key, CORS OK)
   Base: https://www.imf.org/external/datamapper/api/v1
   ══════════════════════════════════════════════════════════════════ */
const IMF_BASE = 'https://www.imf.org/external/datamapper/api/v1';

const IMF_INDICATORS = {
  gdp_growth:   'NGDP_RPCH',   // Real GDP growth %
  inflation:    'PCPIPCH',     // CPI inflation %
  unemployment: 'LUR',         // Unemployment rate
  curr_acct:    'BCA_NGDPDZ',  // Current account % GDP
  govt_debt:    'GGXWDG_NGDP', // Govt gross debt % GDP
};

async function imfFetch(indicator, countryISOs) {
  const cacheKey = `imf:${indicator}:${countryISOs.join(',')}`;
  const cached = _mgGet(cacheKey, 12*3600*1000); // 12hr TTL (WEO published 2x/year)
  if (cached) return cached;

  try {
    const url = `${IMF_BASE}/data/${indicator}/${countryISOs.join('+')}`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    _mgSet(cacheKey, json);
    return json;
  } catch (e) {
    console.warn('[MacroGlobal] IMF fetch failed:', e.message);
    return null;
  }
}

// Get latest + next-year forecast from IMF data
function imfLatestAndForecast(imfData, countryCode) {
  if (!imfData?.values?.[Object.keys(imfData.values)[0]]) return null;
  const series = imfData.values[Object.keys(imfData.values)[0]];
  const countryData = series?.[countryCode];
  if (!countryData) return null;

  const currentYear = new Date().getFullYear();
  const years = Object.keys(countryData).map(Number).sort((a,b)=>b-a);

  // Find most recent actual (non-forecast) ± 2 years
  const actual   = years.find(y => y <= currentYear && countryData[y] != null);
  const forecast = years.find(y => y === currentYear+1 && countryData[y] != null)
                ?? years.find(y => y === currentYear && countryData[y] != null);

  return {
    value:    countryData[actual]    ?? null,
    forecast: countryData[forecast]  ?? null,
    year:     actual,
    fYear:    forecast,
  };
}

/* ══════════════════════════════════════════════════════════════════
   OECD Composite Leading Indicator (CLI)  —  PMI proxy, no key
   https://stats.oecd.org/SDMX-JSON/data/MEI_CLI/...
   CLI amplitude-adjusted (AA) above 100 = expansion
   ══════════════════════════════════════════════════════════════════ */
const OECD_CLI_BASE = 'https://stats.oecd.org/SDMX-JSON/data/MEI_CLI';

const OECD_COUNTRIES = ['USA','GBR','DEU','FRA','JPN','CHN','KOR','CAN','AUS','ITA','IND','BRA'];

async function oecdFetchCLI() {
  const cached = _mgGet('oecd:cli', 6*3600*1000);
  if (cached) return cached;
  try {
    const countries = OECD_COUNTRIES.join('+');
    const url = `${OECD_CLI_BASE}/${countries}.LOLITOAA.M/all?startTime=${new Date().getFullYear()-1}&format=jsondata`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const json = await res.json();
    _mgSet('oecd:cli', json);
    return json;
  } catch (e) {
    console.warn('[MacroGlobal] OECD CLI fetch failed:', e.message);
    return null;
  }
}

// Parse OECD SDMX-JSON — extract latest value per country
function oecdParseLatest(json) {
  if (!json?.dataSets?.[0]?.series) return {};
  const series   = json.dataSets[0].series;
  const dims     = json.structure?.dimensions?.series || [];
  const timeDims = json.structure?.dimensions?.observation || [];
  const countryDim = dims.find(d => d.id === 'LOCATION');

  const result = {};
  Object.entries(series).forEach(([key, val]) => {
    // Key format: "0:0:0" for dimension indices
    const parts      = key.split(':');
    const countryIdx = parts[0];
    const countryId  = countryDim?.values?.[parseInt(countryIdx)]?.id;
    if (!countryId) return;

    // Get observations (sorted by time index)
    const obs = val.observations;
    if (!obs) return;
    const timeKeys = Object.keys(obs).map(Number).sort((a,b)=>b-a);
    if (!timeKeys.length) return;

    const latestObs  = obs[timeKeys[0]]?.[0];
    const prevObs    = obs[timeKeys[1]]?.[0];

    // Get time period label
    const timePeriods = timeDims[0]?.values || [];
    const latestPeriod = timePeriods[timeKeys[0]]?.id || '';

    result[countryId] = {
      value:  latestObs,
      prev:   prevObs,
      period: latestPeriod,
      trend:  (latestObs != null && prevObs != null) ? latestObs - prevObs : null,
    };
  });
  return result;
}

/* ══════════════════════════════════════════════════════════════════
   CENTRAL BANK CALENDAR
   Sources: Fed (federalreserve.gov JSON), ECB (RSS via proxy),
            BoE (bankofengland.co.uk), BoJ, PBoC
   All free, no key
   ══════════════════════════════════════════════════════════════════ */
const FOMC_URL   = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';
const ECB_URL    = 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html';
const ALLORIGINS  = 'https://api.allorigins.win/get?url=';

// Hardcoded 2025-2026 FOMC dates (publicly known, stable)
const FOMC_DATES_2025_26 = [
  { date:'2025-01-28', type:'FOMC', decision:'Rate hold expected' },
  { date:'2025-03-19', type:'FOMC', decision:'SEP + Press conference' },
  { date:'2025-05-07', type:'FOMC', decision:'Rate decision' },
  { date:'2025-06-18', type:'FOMC', decision:'SEP + Press conference' },
  { date:'2025-07-30', type:'FOMC', decision:'Rate decision' },
  { date:'2025-09-17', type:'FOMC', decision:'SEP + Press conference' },
  { date:'2025-10-29', type:'FOMC', decision:'Rate decision' },
  { date:'2025-12-10', type:'FOMC', decision:'SEP + Press conference' },
  { date:'2026-01-28', type:'FOMC', decision:'Rate decision' },
  { date:'2026-03-18', type:'FOMC', decision:'SEP + Press conference' },
  { date:'2026-04-29', type:'FOMC', decision:'Rate decision' },
  { date:'2026-06-17', type:'FOMC', decision:'SEP + Press conference' },
];

const ECB_DATES_2025_26 = [
  { date:'2025-01-30', type:'ECB',  decision:'Governing Council' },
  { date:'2025-03-06', type:'ECB',  decision:'Governing Council + Press' },
  { date:'2025-04-17', type:'ECB',  decision:'Governing Council' },
  { date:'2025-06-05', type:'ECB',  decision:'Governing Council + Press' },
  { date:'2025-07-24', type:'ECB',  decision:'Governing Council' },
  { date:'2025-09-11', type:'ECB',  decision:'Governing Council + Press' },
  { date:'2025-10-30', type:'ECB',  decision:'Governing Council' },
  { date:'2025-12-18', type:'ECB',  decision:'Governing Council + Press' },
  { date:'2026-01-29', type:'ECB',  decision:'Governing Council' },
  { date:'2026-03-05', type:'ECB',  decision:'Governing Council + Press' },
  { date:'2026-04-30', type:'ECB',  decision:'Governing Council' },
];

const BOE_DATES_2025_26 = [
  { date:'2025-02-06', type:'BoE',  decision:'MPC Decision' },
  { date:'2025-03-20', type:'BoE',  decision:'MPC Decision' },
  { date:'2025-05-08', type:'BoE',  decision:'MPC + MPR' },
  { date:'2025-06-19', type:'BoE',  decision:'MPC Decision' },
  { date:'2025-08-07', type:'BoE',  decision:'MPC + MPR' },
  { date:'2025-09-18', type:'BoE',  decision:'MPC Decision' },
  { date:'2025-11-06', type:'BoE',  decision:'MPC + MPR' },
  { date:'2025-12-18', type:'BoE',  decision:'MPC Decision' },
  { date:'2026-02-05', type:'BoE',  decision:'MPC + MPR' },
  { date:'2026-03-19', type:'BoE',  decision:'MPC Decision' },
];

const BOJ_DATES_2025_26 = [
  { date:'2025-01-24', type:'BoJ',  decision:'MPM Decision' },
  { date:'2025-03-19', type:'BoJ',  decision:'MPM Decision' },
  { date:'2025-04-30', type:'BoJ',  decision:'Outlook Report' },
  { date:'2025-06-17', type:'BoJ',  decision:'MPM Decision' },
  { date:'2025-07-31', type:'BoJ',  decision:'Outlook Report' },
  { date:'2025-09-19', type:'BoJ',  decision:'MPM Decision' },
  { date:'2025-10-29', type:'BoJ',  decision:'Outlook Report' },
  { date:'2025-12-19', type:'BoJ',  decision:'MPM Decision' },
];

/* ══════════════════════════════════════════════════════════════════
   RENDER — 🌐 GLOBAL TAB
   World Bank multi-country dashboard
   ══════════════════════════════════════════════════════════════════ */
window.macroLoadGlobal = async function() {
  const el = document.getElementById('macro-global');
  if (!el) return;
  if (el.dataset.mgLoaded) return; // already loaded this session
  el.innerHTML = '<div class="av-loading"><span class="av-spinner"></span>Loading global macro data (World Bank + IMF)…</div>';

  try {
    const countryCodes = WB_COUNTRIES.map(c => c.code);
    const imfCodes     = ['USA','CHN','DEU','JPN','GBR','FRA','IND','BRA','ITA','CAN','KOR','AUS'];

    // Fetch in parallel
    const [wbGdp, wbCpi, wbUnemp, imfGrowth, imfInflation] = await Promise.all([
      wbFetch(WB_INDICATORS.gdp_growth,   countryCodes, 3),
      wbFetch(WB_INDICATORS.cpi,          countryCodes, 3),
      wbFetch(WB_INDICATORS.unemployment, countryCodes, 3),
      imfFetch(IMF_INDICATORS.gdp_growth, imfCodes).catch(()=>null),
      imfFetch(IMF_INDICATORS.inflation,  imfCodes).catch(()=>null),
    ]);

    // Build country matrix
    const rows = WB_COUNTRIES.map(country => {
      const gdpRow   = wbLatest(wbGdp,   country.code);
      const cpiRow   = wbLatest(wbCpi,   country.code);
      const unempRow = wbLatest(wbUnemp, country.code);

      // IMF WEO forecast uses ISO3
      const iso3Map = { US:'USA',CN:'CHN',DE:'DEU',JP:'JPN',GB:'GBR',FR:'FRA',IN:'IND',BR:'BRA',IT:'ITA',CA:'CAN',KR:'KOR',AU:'AUS' };
      const iso3 = iso3Map[country.code] || country.code;
      const imfG = imfGrowth ? imfLatestAndForecast(imfGrowth, iso3) : null;
      const imfI = imfInflation ? imfLatestAndForecast(imfInflation, iso3) : null;

      return {
        ...country,
        gdp_growth:   gdpRow?.value,
        gdp_year:     gdpRow?.date,
        cpi:          cpiRow?.value,
        unemp:        unempRow?.value,
        imf_growth:   imfG?.value,
        imf_forecast: imfG?.forecast,
        imf_infl:     imfI?.value,
        imf_infl_f:   imfI?.forecast,
      };
    });

    el.dataset.mgLoaded = '1';
    el.innerHTML = `
      <div class="av-live-badge">● World Bank · IMF WEO · ${new Date().getFullYear()} data · No API key required</div>

      <!-- Global overview KPIs -->
      <div class="mg-overview-grid">
        <div class="mg-overview-kpi">
          <span class="mg-ov-lbl">US GDP Growth</span>
          <span class="mg-ov-val ${_mc(rows.find(r=>r.code==='US')?.gdp_growth)}">${_mf(rows.find(r=>r.code==='US')?.gdp_growth)}%</span>
        </div>
        <div class="mg-overview-kpi">
          <span class="mg-ov-lbl">China GDP Growth</span>
          <span class="mg-ov-val ${_mc(rows.find(r=>r.code==='CN')?.gdp_growth)}">${_mf(rows.find(r=>r.code==='CN')?.gdp_growth)}%</span>
        </div>
        <div class="mg-overview-kpi">
          <span class="mg-ov-lbl">Eurozone (DE) CPI</span>
          <span class="mg-ov-val ${rows.find(r=>r.code==='DE')?.cpi>3?'neg':'pos'}">${_mf(rows.find(r=>r.code==='DE')?.cpi)}%</span>
        </div>
        <div class="mg-overview-kpi">
          <span class="mg-ov-lbl">US Unemployment</span>
          <span class="mg-ov-val">${_mf(rows.find(r=>r.code==='US')?.unemp)}%</span>
        </div>
      </div>

      <!-- Country comparison table -->
      <div class="mg-section">
        <div class="mg-section-title">🌍 G12 Macro Dashboard — World Bank + IMF WEO</div>
        <div style="overflow-x:auto">
          <table class="mg-table">
            <thead>
              <tr>
                <th>Country</th>
                <th>GDP Growth<br><small>WB actual</small></th>
                <th>IMF Forecast<br><small>next yr</small></th>
                <th>CPI Inflation<br><small>WB actual</small></th>
                <th>IMF Infl.<br><small>forecast</small></th>
                <th>Unemployment<br><small>WB actual</small></th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
              <tr>
                <td class="mg-country-cell"><span class="mg-flag">${r.flag}</span>${_me(r.name.replace(r.flag+' ',''))}</td>
                <td class="${_mc(r.gdp_growth)}">${r.gdp_growth!=null?_mf(r.gdp_growth)+'%':'—'}<small>${r.gdp_year?'('+r.gdp_year+')':''}</small></td>
                <td class="${_mc(r.imf_forecast)}">${r.imf_forecast!=null?_mf(r.imf_forecast)+'%':'—'}</td>
                <td class="${r.cpi>5?'neg':r.cpi<0?'neg':''}">${r.cpi!=null?_mf(r.cpi)+'%':'—'}</td>
                <td class="${r.imf_infl_f>4?'neg':''}">${r.imf_infl_f!=null?_mf(r.imf_infl_f)+'%':'—'}</td>
                <td>${r.unemp!=null?_mf(r.unemp)+'%':'—'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- GDP bar chart (visual ranking) -->
      <div class="mg-section">
        <div class="mg-section-title">📊 GDP Growth Ranking — Latest Available</div>
        <div class="mg-bar-chart">
          ${[...rows]
            .filter(r => r.gdp_growth != null)
            .sort((a,b) => b.gdp_growth - a.gdp_growth)
            .map(r => {
              const pct  = Math.max(0, Math.min(100, (r.gdp_growth + 5) / 15 * 100));
              const col  = r.gdp_growth >= 4 ? '#3fb950' : r.gdp_growth >= 1 ? '#58a6ff' : r.gdp_growth >= 0 ? '#d29922' : '#f85149';
              return `<div class="mg-bar-row">
                <span class="mg-bar-label">${r.flag} ${_me(r.name.replace(r.flag+' ',''))}</span>
                <div class="mg-bar-track">
                  <div class="mg-bar-fill" style="width:${pct.toFixed(1)}%;background:${col}"></div>
                </div>
                <span class="mg-bar-val ${_mc(r.gdp_growth)}">${_mf(r.gdp_growth)}%</span>
              </div>`;
            }).join('')}
        </div>
      </div>

      <div class="mg-footer">
        Sources: <a href="https://data.worldbank.org" target="_blank" class="geo-wm-link">World Bank</a>
        · <a href="https://www.imf.org/en/publications/weo" target="_blank" class="geo-wm-link">IMF WEO</a>
        · Free, no API key required
      </div>`;

  } catch (e) {
    el.innerHTML = `<div class="no-data">// Error loading global macro: ${_me(e.message)}</div>`;
  }
};

/* ══════════════════════════════════════════════════════════════════
   RENDER — 📊 PMI TAB
   OECD Composite Leading Indicator (CLI) — free PMI proxy
   Amplitude-adjusted: >100 expansion, <100 contraction
   ══════════════════════════════════════════════════════════════════ */
window.macroLoadPMI = async function() {
  const el = document.getElementById('macro-pmi');
  if (!el) return;
  if (el.dataset.mgLoaded) return;
  el.innerHTML = '<div class="av-loading"><span class="av-spinner"></span>Loading OECD leading indicators…</div>';

  try {
    const cliData = await oecdFetchCLI();
    const parsed  = cliData ? oecdParseLatest(cliData) : {};

    const countryMeta = {
      USA:{ name:'🇺🇸 USA',      }, GBR:{ name:'🇬🇧 UK',       },
      DEU:{ name:'🇩🇪 Germany',  }, FRA:{ name:'🇫🇷 France',    },
      JPN:{ name:'🇯🇵 Japan',    }, CHN:{ name:'🇨🇳 China',     },
      KOR:{ name:'🇰🇷 S.Korea',  }, CAN:{ name:'🇨🇦 Canada',    },
      AUS:{ name:'🇦🇺 Australia',}, ITA:{ name:'🇮🇹 Italy',     },
      IND:{ name:'🇮🇳 India',    }, BRA:{ name:'🇧🇷 Brazil',    },
    };

    const items = Object.entries(countryMeta).map(([code, meta]) => ({
      code, ...meta,
      ...(parsed[code] || {}),
    })).filter(i => i.value != null).sort((a,b) => b.value - a.value);

    el.dataset.mgLoaded = '1';

    const pmiSignal = v => {
      if (v == null) return { label:'—', color:'var(--text-muted)' };
      if (v >= 101)  return { label:'Expanding ↑', color:'#3fb950' };
      if (v >= 100)  return { label:'Recovery',    color:'#58a6ff' };
      if (v >= 99)   return { label:'Slowing ↓',   color:'#d29922' };
      return              { label:'Contracting',  color:'#f85149' };
    };

    el.innerHTML = `
      <div class="av-live-badge">● OECD CLI · Composite Leading Indicator (Amplitude-Adjusted) · Free, no key</div>
      <div class="av-note" style="margin:6px 12px 0">
        CLI above 100 signals economic expansion; below 100 signals contraction.
        Amplitude-adjusted version tracks turning points in economic cycles.
      </div>

      <!-- Signal summary cards -->
      <div class="mg-cli-summary">
        ${['Expanding ↑','Recovery','Slowing ↓','Contracting'].map(label => {
          const group = items.filter(i => pmiSignal(i.value).label === label);
          if (!group.length) return '';
          const col = pmiSignal(group[0].value).color;
          return `<div class="mg-cli-group" style="border-color:${col}20">
            <div class="mg-cli-group-label" style="color:${col}">${label}</div>
            <div class="mg-cli-group-countries">${group.map(i=>`<span>${i.name}</span>`).join('')}</div>
          </div>`;
        }).join('')}
      </div>

      <!-- CLI gauge cards -->
      <div class="mg-cli-grid">
        ${items.map(item => {
          const sig = pmiSignal(item.value);
          const pct = Math.max(0, Math.min(100, (item.value - 97) / 6 * 100));
          const trendStr = item.trend != null
            ? (item.trend > 0 ? `+${item.trend.toFixed(2)}` : item.trend.toFixed(2))
            : null;
          return `<div class="mg-cli-card" style="border-top:2px solid ${sig.color}">
            <div class="mg-cli-name">${_me(item.name)}</div>
            <div class="mg-cli-val" style="color:${sig.color}">${item.value!=null?item.value.toFixed(2):'—'}</div>
            <div class="mg-cli-signal" style="color:${sig.color}">${sig.label}</div>
            ${trendStr ? `<div class="mg-cli-trend" style="color:${item.trend>0?'#3fb950':'#f85149'}">${trendStr} mom</div>` : ''}
            <div class="mg-cli-bar-track">
              <div class="mg-cli-bar-fill" style="width:${pct.toFixed(1)}%;background:${sig.color}"></div>
              <div class="mg-cli-bar-center"></div>
            </div>
            ${item.period ? `<div class="mg-cli-period">${_me(item.period)}</div>` : ''}
          </div>`;
        }).join('')}
      </div>

      ${!items.length ? '<div class="no-data">// OECD CLI data unavailable. CORS may block this endpoint. <a href="https://stats.oecd.org/index.aspx?datasetcode=MEI_CLI" target="_blank" class="geo-wm-link">View on OECD ↗</a></div>' : ''}

      <div class="mg-footer">
        Source: <a href="https://stats.oecd.org/index.aspx?datasetcode=MEI_CLI" target="_blank" class="geo-wm-link">OECD MEI CLI</a>
        · Monthly · Amplitude-adjusted · Free, no API key
      </div>`;

  } catch (e) {
    el.innerHTML = `<div class="no-data">// PMI/CLI error: ${_me(e.message)}<br>Try <a href="https://stats.oecd.org" target="_blank" class="geo-wm-link">OECD Stats ↗</a></div>`;
  }
};

/* ══════════════════════════════════════════════════════════════════
   RENDER — 🏦 BANKS TAB
   Central bank meeting calendar + current rates
   Sources: FRED (existing key) for rates, hardcoded calendars
   ══════════════════════════════════════════════════════════════════ */
window.macroLoadCentralBanks = async function() {
  const el = document.getElementById('macro-cb');
  if (!el) return;
  el.innerHTML = '<div class="av-loading"><span class="av-spinner"></span>Loading central bank data…</div>';

  // Fetch ALL policy rates from FRED (FEDFUNDS, ECBDFR, BOERUKQ, IRLTLT01JPM156N, PBOC)
  // FRED series: ECBDFR = ECB Deposit Rate, BOERUKQ = BOE Rate, IRSTCI01JPM156N = BOJ
  let fedRate = null, sofr = null, ecbRate = null, boeRate = null, bojRate = null, pbocRate = null;
  const fredKey = (typeof getFredKey === 'function') ? getFredKey() : '';

  if (fredKey) {
    try {
      const fredFetch = id =>
        fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${fredKey}&file_type=json&sort_order=desc&limit=1`, {signal:AbortSignal.timeout(6000)})
          .then(r=>r.json()).then(j=>parseFloat(j.observations?.[0]?.value)||null).catch(()=>null);

      let pbocRate = null;
      [fedRate, sofr, ecbRate, boeRate, bojRate, pbocRate] = await Promise.all([
        fredFetch('FEDFUNDS'),
        fredFetch('SOFR'),
        fredFetch('ECBDFR'),          // ECB Deposit Facility Rate
        fredFetch('BOERUKQ'),         // Bank of England Base Rate
        fredFetch('IRSTCI01JPM156N'), // Bank of Japan policy rate proxy
        fredFetch('PBCFINSR'),        // PBoC 1-year LPR (loan prime rate)
      ]);
    } catch {}
  }

  // Try no-key fallback for ECB via ECB API (free, no auth)
  if (ecbRate == null) {
    try {
      const ecbRes = await fetch(
        'https://data-api.ecb.europa.eu/service/data/FM/B.U2.EUR.4F.KR.DFR.LEV?format=jsondata&lastNObservations=1',
        {signal:AbortSignal.timeout(6000)}
      );
      const ecbJson = await ecbRes.json();
      const obs = ecbJson?.dataSets?.[0]?.series?.['0:0:0:0:0:0:0']?.observations;
      if (obs) {
        const lastKey = Object.keys(obs).sort((a,b)=>+b-+a)[0];
        ecbRate = obs[lastKey]?.[0];
      }
    } catch {}
  }

  // Latest known rates as fallback (updated approx. to current policy)
  const RATES = [
    { bank:'Federal Reserve', country:'🇺🇸 USA',  rate: fedRate  ?? 4.33, currency:'USD', nextMeeting: nextMeeting(FOMC_DATES_2025_26), color:'#58a6ff', live: fedRate  != null },
    { bank:'ECB',             country:'🇪🇺 Euro',  rate: ecbRate  ?? 2.65, currency:'EUR', nextMeeting: nextMeeting(ECB_DATES_2025_26),  color:'#3fb950', live: ecbRate  != null },
    { bank:'Bank of England', country:'🇬🇧 UK',    rate: boeRate  ?? 4.50, currency:'GBP', nextMeeting: nextMeeting(BOE_DATES_2025_26),  color:'#d29922', live: boeRate  != null },
    { bank:'Bank of Japan',   country:'🇯🇵 Japan', rate: bojRate  ?? 0.50, currency:'JPY', nextMeeting: nextMeeting(BOJ_DATES_2025_26),  color:'#f0883e', live: bojRate  != null },
    { bank:'PBoC',            country:'🇨🇳 China', rate: pbocRate ?? 3.10, currency:'CNY', nextMeeting: null,                             color:'#a371f7', live: pbocRate != null },
  ];

  // Merge all calendar events, sort chronologically
  const allEvents = [
    ...FOMC_DATES_2025_26.map(e => ({ ...e, bank:'Fed', color:'#58a6ff', flag:'🇺🇸' })),
    ...ECB_DATES_2025_26.map(e  => ({ ...e, bank:'ECB', color:'#3fb950', flag:'🇪🇺' })),
    ...BOE_DATES_2025_26.map(e  => ({ ...e, bank:'BoE', color:'#d29922', flag:'🇬🇧' })),
    ...BOJ_DATES_2025_26.map(e  => ({ ...e, bank:'BoJ', color:'#f0883e', flag:'🇯🇵' })),
  ].sort((a,b) => a.date.localeCompare(b.date));

  const today      = new Date().toISOString().slice(0,10);
  const upcoming   = allEvents.filter(e => e.date >= today).slice(0, 20);
  const past3m     = allEvents.filter(e => {
    const d = new Date(e.date);
    return d < new Date() && d >= new Date(Date.now() - 90*864e5);
  }).slice(-8).reverse();

  el.innerHTML = `
    <div class="av-live-badge">● Central Bank Rates &amp; Calendar · ${fredKey?'FRED live rates · ':'Approximate rates · '}Free</div>

    <!-- Rate dashboard -->
    <div class="cb-rates-grid">
      ${RATES.map(r => {
        const daysToNext = r.nextMeeting
          ? Math.round((new Date(r.nextMeeting.date) - new Date()) / 864e5)
          : null;
        return `<div class="cb-rate-card" style="border-top:3px solid ${r.color}">
          <div class="cb-rate-bank">${_me(r.bank)}</div>
          <div class="cb-rate-country">${_me(r.country)}</div>
          <div class="cb-rate-val" style="color:${r.color}">${r.rate.toFixed(2)}%${r.live ? '<span style="font-size:8px;color:#3fb950;margin-left:3px">●</span>' : '<span style="font-size:8px;color:#6e7681;margin-left:3px" title="approximate">~</span>'}</div>
          <div class="cb-rate-ccy">${_me(r.currency)} Policy Rate</div>
          ${daysToNext != null ? `
          <div class="cb-rate-next">
            Next meeting in <strong>${daysToNext}d</strong><br>
            <small>${_me(r.nextMeeting.date)}</small>
          </div>` : ''}
        </div>`;
      }).join('')}
    </div>

    <!-- FOMC Minutes link -->
    <div class="mg-section">
      <div class="mg-section-title">📄 FOMC Minutes &amp; Statements</div>
      <div class="cb-links-row">
        <a href="https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm" target="_blank" class="cb-link-btn">📅 FOMC Calendar</a>
        <a href="https://www.federalreserve.gov/monetarypolicy/fomcminutes.htm"   target="_blank" class="cb-link-btn">📄 FOMC Minutes</a>
        <a href="https://www.ecb.europa.eu/press/accounts/html/index.en.html"     target="_blank" class="cb-link-btn">🏦 ECB Accounts</a>
        <a href="https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes" target="_blank" class="cb-link-btn">🇬🇧 BoE Minutes</a>
        <a href="https://www.boj.or.jp/en/mopo/mpmsche_mei/index.htm"            target="_blank" class="cb-link-btn">🇯🇵 BoJ Policy</a>
      </div>
    </div>

    <!-- Upcoming meetings -->
    <div class="mg-section">
      <div class="mg-section-title">📅 Upcoming Meetings</div>
      <div class="cb-calendar">
        ${upcoming.map(e => {
          const d      = new Date(e.date);
          const daysTo = Math.round((d - new Date()) / 864e5);
          const isNear = daysTo <= 14;
          return `<div class="cb-event-row ${isNear?'cb-event-near':''}">
            <span class="cb-event-flag">${e.flag}</span>
            <span class="cb-event-date">${e.date}</span>
            <span class="cb-event-bank" style="color:${e.color}">${_me(e.bank)}</span>
            <span class="cb-event-type">${_me(e.decision||e.type)}</span>
            <span class="cb-event-days ${daysTo<=7?'neg':daysTo<=30?'pos':''}">${daysTo}d</span>
          </div>`;
        }).join('')}
      </div>
    </div>

    ${past3m.length ? `
    <!-- Recent meetings -->
    <div class="mg-section">
      <div class="mg-section-title">📋 Recent Meetings (90 days)</div>
      <div class="cb-calendar cb-calendar-past">
        ${past3m.map(e => `
        <div class="cb-event-row cb-event-past">
          <span class="cb-event-flag">${e.flag}</span>
          <span class="cb-event-date">${e.date}</span>
          <span class="cb-event-bank" style="color:${e.color};opacity:.7">${_me(e.bank)}</span>
          <span class="cb-event-type">${_me(e.decision||e.type)}</span>
          <span class="cb-event-days" style="color:var(--text-muted)">past</span>
        </div>`).join('')}
      </div>
    </div>` : ''}

    <div class="mg-footer">
      Rates: ${fredKey?'FRED live':'Approximate (add FRED key for live rates)'}
      · Calendars: Official central bank published schedules
    </div>`;
};

function nextMeeting(dates) {
  const today = new Date().toISOString().slice(0,10);
  return dates.find(d => d.date >= today) || null;
}

/* ══════════════════════════════════════════════════════════════════
   ENRICH ECON TAB — append World Bank global snapshot to FRED data
   ══════════════════════════════════════════════════════════════════ */
async function macroEnrichEconTab() {
  const el = document.getElementById('macro-econ');
  if (!el || document.getElementById('mg-econ-enrichment')) return;

  try {
    const [wbGdp, wbCpi] = await Promise.all([
      wbFetch(WB_INDICATORS.gdp_growth, WB_COUNTRIES.map(c=>c.code), 2),
      wbFetch(WB_INDICATORS.cpi, WB_COUNTRIES.map(c=>c.code), 2),
    ]);

    const section = document.createElement('div');
    section.id = 'mg-econ-enrichment';
    section.innerHTML = `
      <div class="mg-section" style="margin-top:10px">
        <div class="mg-section-title">🌍 Global Context — World Bank (click GLOBAL tab for full dashboard)</div>
        <div class="mg-econ-strip">
          ${WB_COUNTRIES.slice(0,8).map(c => {
            const gdp = wbLatest(wbGdp, c.code);
            const cpi = wbLatest(wbCpi, c.code);
            return `<div class="mg-econ-chip">
              <span class="mg-econ-flag">${c.flag}</span>
              <span class="mg-econ-gdp ${_mc(gdp?.value)}">${gdp?.value!=null?_mf(gdp.value)+'%':'—'} GDP</span>
              <span class="mg-econ-cpi ${cpi?.value>4?'neg':''}">${cpi?.value!=null?_mf(cpi.value)+'%':'—'} CPI</span>
            </div>`;
          }).join('')}
        </div>
        <div style="text-align:center;margin-top:6px">
          <button class="wh-btn-secondary" onclick="switchTab('macro','global');if(typeof macroLoadGlobal==='function')macroLoadGlobal()" style="font-size:10px;padding:4px 12px">
            🌐 Open Full Global Dashboard →
          </button>
        </div>
      </div>`;

    el.appendChild(section);
  } catch {}
}

/* Auto-enrich ECON tab when it loads */
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', e => {
    const tab = e.target.dataset?.tab;
    if (tab === 'econ')   setTimeout(macroEnrichEconTab,  500);
    if (tab === 'global') setTimeout(()=>{ if(typeof macroLoadGlobal==='function')macroLoadGlobal(); }, 50);
    if (tab === 'pmi')    setTimeout(()=>{ if(typeof macroLoadPMI==='function')macroLoadPMI(); }, 50);
    if (tab === 'cb')     setTimeout(()=>{ if(typeof macroLoadCentralBanks==='function')macroLoadCentralBanks(); }, 50);
  });

  // Pre-load central banks calendar 5s after startup (lightweight, no external fetch needed)
  setTimeout(() => {
    const cbEl = document.getElementById('macro-cb');
    // Only pre-render if already in view — don't force load
  }, 5000);
});

window.macroLoadGlobal       = macroLoadGlobal;
window.macroLoadPMI          = macroLoadPMI;
window.macroLoadCentralBanks = macroLoadCentralBanks;
