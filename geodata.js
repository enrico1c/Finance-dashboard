/* ══════════════════════════════════════════════════════════════════
   geodata.js  — Free public data sources, no API key required
   Sources: USGS Earthquakes · Open-Meteo · NOAA/NWS · NASA EONET · OpenFEMA
   ══════════════════════════════════════════════════════════════════ */
(function() {
"use strict";

/* ── Cache ─────────────────────────────────────────────────────── */
const GD_CACHE    = {};
const GD_CACHE_MS = { quakes: 5*60e3, meteo: 15*60e3, noaa: 5*60e3, eonet: 10*60e3, fema: 30*60e3 };
function gdCacheGet(key) {
  const c = GD_CACHE[key];
  const ttl = GD_CACHE_MS[key.split("_")[0]] || 10*60e3;
  return (c && Date.now() - c.ts < ttl) ? c.data : null;
}
function gdCacheSet(key, data) { GD_CACHE[key] = { data, ts: Date.now() }; }

async function gdFetch(url, cacheKey, opts = {}) {
  const cached = gdCacheGet(cacheKey);
  if (cached) return cached;
  try {
    const res  = await fetch(url, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = url.endsWith(".xml") || res.headers.get("content-type")?.includes("xml")
                 ? await res.text()
                 : await res.json();
    gdCacheSet(cacheKey, data);
    return data;
  } catch(e) { console.warn(`[geodata] ${cacheKey}:`, e.message); return null; }
}

/* ══════════════════════════════════════════════════════════════════
   1. USGS EARTHQUAKES  — authoritative real-time seismic data
   ══════════════════════════════════════════════════════════════════ */
window.usgsLoadQuakes = async function(minMag = 4.5, limit = 60) {
  const el = document.getElementById("geo-quakes-usgs") || document.getElementById("geo-quakes");
  if (!el) return;
  const url  = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=${minMag}&limit=${limit}&orderby=time`;
  const data = await gdFetch(url, "quakes_usgs");
  if (!data) { el.innerHTML += `<div class="no-data">// USGS unavailable.</div>`; return; }

  const features = data.features || [];
  const magColor = m => m >= 7 ? "#e55" : m >= 6 ? "#f90" : m >= 5 ? "#fc6" : "#8b8";
  const alertBadge = a => a ? `<span class="usgs-alert usgs-alert-${a}">${a.toUpperCase()}</span>` : "";

  let html = `<div class="av-live-badge">● USGS Earthquakes · M${minMag}+ · Real-time</div>`;
  html += `<div class="usgs-stats">
    <span>Last 24h M4.5+: <strong>${features.filter(f=>Date.now()-f.properties.time<864e5).length}</strong></span>
    <span>M6+: <strong>${features.filter(f=>f.properties.mag>=6).length}</strong></span>
    <span>Tsunami alerts: <strong>${features.filter(f=>f.properties.tsunami===1).length}</strong></span>
  </div>`;

  html += `<div class="usgs-list">`;
  features.slice(0, 30).forEach(f => {
    const p    = f.properties;
    const mag  = p.mag ? p.mag.toFixed(1) : "?";
    const loc  = p.place || "Unknown location";
    const time = new Date(p.time).toUTCString().replace(" GMT","Z").slice(5,22);
    const depth = f.geometry?.coordinates?.[2];
    const depthStr = depth !== undefined ? `${depth.toFixed(0)} km deep` : "";
    const tsunami = p.tsunami === 1 ? `<span class="usgs-tsunami">🌊 TSUNAMI</span>` : "";
    html += `<div class="usgs-row">
      <span class="usgs-mag" style="background:${magColor(p.mag)}">M${mag}</span>
      <div class="usgs-info">
        <span class="usgs-loc">${loc}</span>
        <span class="usgs-meta">${time} · ${depthStr} ${tsunami} ${alertBadge(p.alert)}</span>
      </div>
      ${p.url ? `<a href="${p.url}" target="_blank" rel="noopener" class="usgs-link">↗</a>` : ""}
    </div>`;
  });
  html += `</div>`;
  el.innerHTML = html;
};

/* ══════════════════════════════════════════════════════════════════
   2. OPEN-METEO  — weather by lat/lon, no key required
   ══════════════════════════════════════════════════════════════════ */

/* Presets for key commodity regions */
const METEO_LOCATIONS = [
  { name:"Iowa (Corn Belt, USA)",        lat:41.5, lon:-93.6,  emoji:"🌽" },
  { name:"Gulf of Mexico (Oil)",          lat:26.0, lon:-90.0,  emoji:"⛽" },
  { name:"Midwest Wheat Belt",            lat:38.5, lon:-98.0,  emoji:"🌾" },
  { name:"Amazon (Soy/Deforestation)",    lat:-5.0, lon:-60.0,  emoji:"🌿" },
  { name:"Black Sea (Ukraine Grain)",     lat:46.5, lon:32.0,   emoji:"🌾" },
  { name:"Saudi Arabia (Oil)",            lat:24.0, lon:45.0,   emoji:"🛢" },
  { name:"Jakarta (Palm Oil/Indonesia)",  lat:-6.2, lon:106.8,  emoji:"🌴" },
  { name:"Northern Europe (Wind power)", lat:57.0, lon:8.0,    emoji:"💨" },
];

window.meteoLoadSupplyWeather = async function() {
  const el = document.getElementById("supply-weather");
  if (!el) return;
  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading weather for key commodity regions…</div>`;

  const fetches = METEO_LOCATIONS.map(loc =>
    gdFetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,precipitation,wind_speed_10m,weather_code&timezone=auto`,
      `meteo_${loc.lat}_${loc.lon}`
    ).then(d => ({ loc, d }))
  );
  const results = await Promise.all(fetches);

  const wmoDesc = code => {
    if (code <= 1) return "Clear";
    if (code <= 3) return "Partly cloudy";
    if (code <= 9) return "Foggy";
    if (code <= 19) return "Drizzle";
    if (code <= 29) return "Rain";
    if (code <= 39) return "Snow";
    if (code <= 49) return "Fog";
    if (code <= 59) return "Drizzle";
    if (code <= 69) return "Heavy rain";
    if (code <= 79) return "Snow";
    if (code <= 84) return "Rain showers";
    if (code <= 94) return "Thunderstorm";
    return "Severe storm";
  };
  const wmoEmoji = code => {
    if (code <= 1) return "☀️"; if (code <= 3) return "⛅";
    if (code <= 29) return "🌧"; if (code <= 49) return "🌫";
    if (code <= 69) return "🌧"; if (code <= 79) return "❄️";
    if (code <= 84) return "🌦"; return "⛈";
  };

  let html = `<div class="av-live-badge">● Open-Meteo · Key Commodity Regions · Live</div>`;
  html += `<div class="meteo-grid">`;
  results.forEach(({ loc, d }) => {
    if (!d?.current) {
      html += `<div class="meteo-card meteo-error"><div class="meteo-name">${loc.emoji} ${loc.name}</div><div class="no-data">—</div></div>`;
      return;
    }
    const c    = d.current;
    const temp = c.temperature_2m !== undefined ? c.temperature_2m.toFixed(1) + "°C" : "—";
    const prec = c.precipitation   !== undefined ? c.precipitation.toFixed(1) + " mm" : "—";
    const wind = c.wind_speed_10m  !== undefined ? c.wind_speed_10m.toFixed(0) + " km/h" : "—";
    const code = c.weather_code || 0;
    const extreme = code >= 80 || c.wind_speed_10m > 60 || c.precipitation > 10;
    html += `<div class="meteo-card ${extreme ? 'meteo-extreme' : ''}">
      <div class="meteo-name">${loc.emoji} ${loc.name}</div>
      <div class="meteo-icon">${wmoEmoji(code)}</div>
      <div class="meteo-cond">${wmoDesc(code)}</div>
      <div class="meteo-vals">
        <span title="Temperature">🌡 ${temp}</span>
        <span title="Precipitation">💧 ${prec}</span>
        <span title="Wind">💨 ${wind}</span>
      </div>
      ${extreme ? `<div class="meteo-warn">⚠ Extreme conditions</div>` : ""}
    </div>`;
  });
  html += `</div>`;
  el.innerHTML = html;
};

/* Air Quality for a single location (used by Alert Feed) */
window.meteoLoadAirQuality = async function(lat, lon, locationName) {
  const el = document.getElementById("alert-airquality");
  if (!el) return;
  const url  = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone,dust&timezone=auto`;
  const data = await gdFetch(url, `airq_${lat}_${lon}`);
  if (!data?.current) { el.innerHTML = `<div class="no-data">// Air quality data unavailable.</div>`; return; }
  const c = data.current;
  const aqiLevel = v => v < 10 ? ["Good","#4a9"] : v < 25 ? ["Moderate","#fc6"] : v < 50 ? ["Unhealthy","#f90"] : ["Hazardous","#e55"];
  const [lvl, clr] = aqiLevel(c.pm2_5 || 0);
  el.innerHTML = `<div class="av-live-badge">● Air Quality · ${locationName}</div>
    <div class="aq-summary" style="color:${clr}">● ${lvl}</div>
    <div class="aq-grid">
      <div class="aq-row"><span>PM2.5</span><span>${c.pm2_5?.toFixed(1)||"—"} μg/m³</span></div>
      <div class="aq-row"><span>PM10</span><span>${c.pm10?.toFixed(1)||"—"} μg/m³</span></div>
      <div class="aq-row"><span>NO₂</span><span>${c.nitrogen_dioxide?.toFixed(1)||"—"} μg/m³</span></div>
      <div class="aq-row"><span>O₃</span><span>${c.ozone?.toFixed(1)||"—"} μg/m³</span></div>
      <div class="aq-row"><span>CO</span><span>${c.carbon_monoxide?.toFixed(1)||"—"} ppb</span></div>
      <div class="aq-row"><span>Dust</span><span>${c.dust?.toFixed(1)||"—"} μg/m³</span></div>
    </div>`;
};

/* ══════════════════════════════════════════════════════════════════
   3. NOAA / NWS ACTIVE ALERTS  (USA, no key)
   ══════════════════════════════════════════════════════════════════ */
window.noaaLoadAlerts = async function() {
  const el = document.getElementById("alert-noaa");
  if (!el) return;
  const url  = "https://api.weather.gov/alerts/active?status=actual&message_type=alert,update&urgency=Immediate,Expected&severity=Extreme,Severe,Moderate";
  const data = await gdFetch(url, "noaa_alerts", { headers: { "User-Agent": "FINTERM/1.0 (research@finterm.io)", "Accept": "application/geo+json" } });
  if (!data?.features) { el.innerHTML = `<div class="no-data">// NOAA alerts unavailable.</div>`; return; }

  const features = data.features || [];
  const sevColor = s => ({ Extreme: "#e55", Severe: "#f90", Moderate: "#fc6", Minor: "#8b8" })[s] || "#888";

  let html = `<div class="av-live-badge">● NOAA / NWS Active Alerts · USA · Live</div>`;
  if (!features.length) { html += `<div class="av-note">No active severe weather alerts in the USA.</div>`; el.innerHTML = html; return; }

  html += `<div class="noaa-count">${features.length} active alert${features.length>1?"s":""}</div>`;
  features.slice(0, 20).forEach(f => {
    const p    = f.properties;
    const sev  = p.severity || "Unknown";
    const sent = p.sent ? new Date(p.sent).toUTCString().slice(5,22) : "";
    const area = (p.areaDesc || "").slice(0, 80);
    html += `<div class="noaa-alert-row">
      <span class="noaa-sev" style="background:${sevColor(sev)}">${sev}</span>
      <div class="noaa-info">
        <span class="noaa-event">${p.event || "—"}</span>
        <span class="noaa-area">${area}</span>
        <span class="noaa-meta">${sent} · ${p.urgency||""}</span>
      </div>
    </div>`;
  });
  el.innerHTML = html;
};

/* ══════════════════════════════════════════════════════════════════
   4. NASA EONET  — wildfires, volcanoes, storms, floods
   ══════════════════════════════════════════════════════════════════ */
window.eonetLoadEvents = async function() {
  const el = document.getElementById("alert-eonet");
  if (!el) return;

  el.innerHTML = "<div class=\"av-live-badge\">&#9679; GDACS &middot; Natural Disasters &middot; Loading&hellip;</div>";

  /* ── GDACS JSON API (Global Disaster Alert & Coordination System) ── */
  const today = new Date().toISOString().slice(0, 10);
  const from  = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const gdacsUrl = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"
    + "?fromDate=" + from + "&toDate=" + today
    + "&alertlevel=Green;Orange;Red&eventtype=EQ;TC;FL;VO;WF&limit=50";

  let geojson = null;
  try {
    const r = await fetch(gdacsUrl, { signal: AbortSignal.timeout(12000) });
    if (r.ok) geojson = await r.json();
  } catch(e) { console.warn("[GDACS]", e.message); }

  /* ── Fallback: GDACS RSS via proxy ── */
  if (!geojson || !geojson.features || !geojson.features.length) {
    try {
      const rssProxy = "https://api.allorigins.win/raw?url=" + encodeURIComponent("https://www.gdacs.org/xml/rss.xml");
      const rr = await fetch(rssProxy, { signal: AbortSignal.timeout(12000) });
      if (rr.ok) {
        const text = await rr.text();
        const xml  = new DOMParser().parseFromString(text, "text/xml");
        const items = Array.from(xml.querySelectorAll("item"));
        if (items.length) {
          const ns = "https://www.gdacs.org/";
          geojson = {
            _rss: true,
            features: items.map(function(it) {
              const get = function(tag) { return (it.querySelector(tag) || {}).textContent || ""; };
              const getNS = function(tag) {
                const el = it.getElementsByTagNameNS("*", tag)[0] || it.querySelector(tag);
                return el ? el.textContent : "";
              };
              const lat = parseFloat(getNS("lat") || getNS("point") || "0");
              const lon = parseFloat(getNS("long") || "0");
              return { _rss: true,
                properties: {
                  name:       get("title"),
                  eventtype:  getNS("eventtype") || "OTHER",
                  alertlevel: getNS("alertlevel") || "Green",
                  severity:   getNS("severity") || "",
                  fromdate:   get("pubDate"),
                  affectedcountries: getNS("country") ? [getNS("country")] : [],
                  url:        get("link"),
                },
                geometry: { coordinates: [lon, lat] }
              };
            })
          };
        }
      }
    } catch(e) { console.warn("[GDACS RSS]", e.message); }
  }

  /* ── Last resort: NASA EONET (may be down) ── */
  if (!geojson || !geojson.features || !geojson.features.length) {
    try {
      const eoproxy = "https://api.allorigins.win/raw?url=" + encodeURIComponent("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=60");
      const er = await fetch(eoproxy, { signal: AbortSignal.timeout(10000) });
      if (er.ok) {
        const eodata = await er.json();
        if (eodata && eodata.events && eodata.events.length) {
          geojson = {
            _eonet: true,
            features: eodata.events.map(function(e) {
              const geo = e.geometry && e.geometry[0];
              return { _eonet: true,
                properties: {
                  name:       e.title,
                  eventtype:  (e.categories && e.categories[0] && e.categories[0].id) || "other",
                  alertlevel: "Green",
                  severity:   "",
                  fromdate:   geo ? geo.date : "",
                  affectedcountries: [],
                  url:        e.sources && e.sources[0] ? e.sources[0].url : "",
                },
                geometry: { coordinates: geo ? geo.coordinates : [0, 0] }
              };
            })
          };
        }
      }
    } catch(e) { console.warn("[EONET]", e.message); }
  }

  if (!geojson || !geojson.features || !geojson.features.length) {
    el.innerHTML = "<div class=\"no-data\">// Natural disaster feed unavailable.<br>"
      + "<button onclick=\"eonetLoadEvents()\" style=\"margin-top:8px;padding:3px 8px;border-radius:4px;border:1px solid #30363d;background:#161b22;color:#8b949e;cursor:pointer;font-size:11px\">&#8635; Retry</button></div>";
    return;
  }

  const typeLabel = { EQ:"Earthquake", TC:"Tropical Cyclone", FL:"Flood", VO:"Volcano", WF:"Wildfire", DR:"Drought", LS:"Landslide", OTHER:"Event" };
  const typeColor = { EQ:"#a86", TC:"#fc6", FL:"#4a9eff", VO:"#f90", WF:"#e55", DR:"#c90", LS:"#b75", OTHER:"#888" };
  const alertColor = { Red:"#e55", Orange:"#f90", Green:"#4caf50" };

  const features = geojson.features;
  const byType = {};
  features.forEach(function(f) {
    const t = (f.properties.eventtype || "OTHER").toUpperCase();
    if (!byType[t]) byType[t] = [];
    byType[t].push(f);
  });

  const src = geojson._eonet ? "NASA EONET" : geojson._rss ? "GDACS RSS" : "GDACS";
  let html = "<div class=\"av-live-badge\">&#9679; " + src + " &middot; Active Natural Events &middot; Live</div>";
  html += "<div class=\"eonet-stats\">";
  Object.entries(byType).sort(function(a,b){ return b[1].length - a[1].length; }).forEach(function(kv) {
    const t = kv[0], evts = kv[1];
    const label = typeLabel[t] || t;
    const color = typeColor[t] || "#888";
    html += "<span class=\"eonet-cat-pill\" style=\"border-color:" + color + ";color:" + color + "\">" + label + ": <strong>" + evts.length + "</strong></span>";
  });
  html += "</div><div class=\"eonet-list\">";

  features.slice(0, 30).forEach(function(f) {
    const p    = f.properties;
    const t    = (p.eventtype || "OTHER").toUpperCase();
    const dot  = typeColor[t] || "#888";
    const alrt = alertColor[p.alertlevel] || "#888";
    const coords = f.geometry && f.geometry.coordinates;
    const coord  = (coords && coords[1] && coords[0])
      ? (parseFloat(coords[1]).toFixed(1) + "\u00b0N " + parseFloat(coords[0]).toFixed(1) + "\u00b0E")
      : "";
    const dateStr = p.fromdate ? String(p.fromdate).slice(0, 10) : "";
    const countries = Array.isArray(p.affectedcountries)
      ? p.affectedcountries.map(function(c){ return typeof c === "object" ? (c.countryname || c.iso3 || "") : c; }).filter(Boolean).join(", ")
      : (p.affectedcountries || "");
    const sev = p.severity ? String(p.severity).slice(0, 20) : "";
    const linkUrl = p.url || "";

    html += "<div class=\"eonet-row\">"
          + "<span class=\"eonet-dot\" style=\"background:" + dot + "\"></span>"
          + "<div class=\"eonet-info\">"
          + "<span class=\"eonet-title\">" + (p.name || "") + "</span>"
          + "<span class=\"eonet-meta\">"
          + (sev ? sev + " &middot; " : "")
          + (countries ? countries + " &middot; " : "")
          + (coord ? coord + " &middot; " : "")
          + dateStr
          + " <span style=\"color:" + alrt + ";font-size:10px;font-weight:600\">" + (p.alertlevel || "") + "</span>"
          + "</span></div>"
          + (linkUrl ? "<a href=\"" + linkUrl + "\" target=\"_blank\" rel=\"noopener\" class=\"usgs-link\">\u2197</a>" : "")
          + "</div>";
  });

  html += "</div>";
  el.innerHTML = html;
};

/* ══════════════════════════════════════════════════════════════════
   5. OPENFEMA  — US disaster declarations
   ══════════════════════════════════════════════════════════════════ */
window.femaLoadDisasters = async function() {
  const el = document.getElementById("geo-fema");
  if (!el) return;
  if (el.dataset.loaded === "1") return;
  const url  = "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$orderby=declarationDate desc&$top=30&$format=json";
  const data = await gdFetch(url, "fema_disasters");
  if (!data?.DisasterDeclarationsSummaries) { el.innerHTML = `<div class="no-data">// OpenFEMA unavailable.</div>`; return; }

  const recs     = data.DisasterDeclarationsSummaries;
  const typeIcon = t => ({ DR:"🌪",EM:"⚡",FM:"🔥",FS:"🌊" })[t] || "⚠";

  let html = `<div class="av-live-badge">● OpenFEMA · US Disaster Declarations · Live</div>`;
  html += `<table class="fmp-table">
    <thead><tr><th>Date</th><th>State</th><th>Type</th><th>Disaster</th><th>Programs</th></tr></thead>
    <tbody>`;
  recs.forEach(r => {
    const programs = [r.ihProgramDeclared?"IH":null, r.iaProgramDeclared?"IA":null, r.paProgramDeclared?"PA":null, r.hmProgramDeclared?"HM":null].filter(Boolean).join(" ");
    html += `<tr>
      <td>${r.declarationDate?.slice(0,10)||"—"}</td>
      <td><strong>${r.state||"—"}</strong></td>
      <td>${typeIcon(r.disasterType)} ${r.disasterType||"—"}</td>
      <td>${(r.declarationTitle||"—").length>30 ? r.declarationTitle.slice(0,29)+"…" : r.declarationTitle||"—"}</td>
      <td>${programs||"—"}</td>
    </tr>`;
  });
  html += `</tbody></table>
  <div class="av-note" style="margin-top:6px">// IH=Individuals & Households · IA=Individual Assistance · PA=Public Assistance · HM=Hazard Mitigation</div>`;
  el.dataset.loaded = "1";
  el.innerHTML = html;
};


/* ══════════════════════════════════════════════════════════════════
   PUNTO 5 — AIR QUALITY  (OpenAQ v3 + WAQI demo + Open-Meteo)
   Sources:
   1. OpenAQ v3  api.openaq.org/v3/locations  (free key — X-API-Key)
   2. WAQI       api.waqi.info/feed/{city}/?token=demo  (no key)
   3. Open-Meteo air-quality-api (no key, already in geodata)
   Widget target: Geo·Risk → AIR tab
   ══════════════════════════════════════════════════════════════════ */

const _AQI_COLORS = [
  { max:50,  label:'Good',        color:'#3fb950', bg:'rgba(63,185,80,.15)' },
  { max:100, label:'Moderate',    color:'#d29922', bg:'rgba(210,153,34,.15)' },
  { max:150, label:'Unhealthy (Sensitive)', color:'#f0883e', bg:'rgba(240,136,62,.15)' },
  { max:200, label:'Unhealthy',   color:'#f85149', bg:'rgba(248,81,73,.15)' },
  { max:300, label:'Very Unhealthy', color:'#a371f7', bg:'rgba(163,113,247,.15)' },
  { max:500, label:'Hazardous',   color:'#d62728', bg:'rgba(214,39,40,.15)' },
];
function _aqiCategory(v) { return _AQI_COLORS.find(c => v <= c.max) || _AQI_COLORS[_AQI_COLORS.length-1]; }

window.openaqLoadCity = async function(lat, lon, cityName) {
  const el = document.getElementById('geo-air');
  if (!el) return;
  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading air quality…</div>`;

  // Try to get lat/lon from company HQ ticker if not provided
  if (!lat || !lon) {
    lat = 41.8781; lon = -87.6298; cityName = cityName || 'Default location';
  }

  let aqData = null, src = '';

  // ── 1. OpenAQ v3 (key in config) ─────────────────────────────
  const aqKey = (typeof getOpenAQKey === 'function') ? getOpenAQKey() : '';
  if (aqKey) {
    try {
      const res = await fetch(
        `https://api.openaq.org/v3/locations?coordinates=${lat},${lon}&radius=25000&limit=5&order_by=lastUpdated&sort_order=desc`,
        { headers: { 'X-API-Key': aqKey, 'Accept': 'application/json' }, signal: AbortSignal.timeout(8000) }
      );
      const json = await res.json();
      const stations = json?.results || [];
      if (stations.length) {
        // Get latest measurements from first station
        const stId = stations[0].id;
        const mRes = await fetch(
          `https://api.openaq.org/v3/locations/${stId}/latest`,
          { headers: { 'X-API-Key': aqKey }, signal: AbortSignal.timeout(7000) }
        );
        const mJson = await mRes.json();
        aqData = { station: stations[0].name, measurements: mJson?.results || [], stations };
        src = 'OpenAQ v3';
      }
    } catch(e) { console.warn('[OpenAQ]', e.message); }
  }

  // ── 2. WAQI demo token (no key, global coverage) ─────────────
  if (!aqData) {
    try {
      const res = await fetch(
        `https://api.waqi.info/feed/geo:${lat};${lon}/?token=demo`,
        { signal: AbortSignal.timeout(7000) }
      );
      const json = await res.json();
      if (json?.status === 'ok' && json.data) {
        const d = json.data;
        aqData = {
          station: d.city?.name || cityName || 'Nearest station',
          aqi: d.aqi,
          measurements: Object.entries(d.iaqi || {}).map(([k,v]) => ({
            parameter: k, value: v.v, unit: k === 'aqi' ? 'AQI' : 'µg/m³',
          })),
          _waqi: d,
        };
        src = 'WAQI';
      }
    } catch {}
  }

  // ── 3. Open-Meteo fallback ────────────────────────────────────
  if (!aqData) {
    try {
      const res = await fetch(
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone,european_aqi&timezone=auto`,
        { signal: AbortSignal.timeout(7000) }
      );
      const json = await res.json();
      const c = json?.current;
      if (c) {
        aqData = {
          station: cityName || `${lat.toFixed(2)},${lon.toFixed(2)}`,
          aqi: c.european_aqi,
          measurements: [
            { parameter:'pm2_5', value: c.pm2_5, unit:'µg/m³' },
            { parameter:'pm10',  value: c.pm10,  unit:'µg/m³' },
            { parameter:'no2',   value: c.nitrogen_dioxide, unit:'µg/m³' },
            { parameter:'o3',    value: c.ozone,  unit:'µg/m³' },
            { parameter:'co',    value: c.carbon_monoxide, unit:'µg/m³' },
          ].filter(m => m.value != null),
        };
        src = 'Open-Meteo';
      }
    } catch {}
  }

  if (!aqData) {
    el.innerHTML = `<div class="no-data">
      // Air quality data unavailable for this location.<br>
      ${!aqKey ? `// <a href="#" onclick="openApiConfig('openaq');return false" style="color:var(--accent)">Add OpenAQ v3 key</a> (free) for full global coverage.` : ''}
    </div>`;
    return;
  }

  const mainAqi = aqData.aqi || aqData.measurements?.find(m => m.parameter === 'us-aqi' || m.parameter === 'aqi')?.value;
  const cat = mainAqi != null ? _aqiCategory(mainAqi) : null;

  let html = `<div class="av-live-badge">● Air Quality · ${gdEsc(aqData.station)} · ${gdEsc(src)}</div>`;

  // Main AQI gauge
  if (cat && mainAqi != null) {
    html += `<div class="aq-main-gauge" style="background:${cat.bg};border-left:3px solid ${cat.color};padding:10px 14px;margin:8px;border-radius:4px;display:flex;align-items:center;gap:14px">
      <div style="font-size:32px;font-weight:800;color:${cat.color};font-family:var(--font-mono)">${mainAqi}</div>
      <div>
        <div style="font-size:11px;font-weight:700;color:${cat.color}">${gdEsc(cat.label)}</div>
        <div style="font-size:9px;color:var(--text-muted)">AQI · ${new Date().toLocaleTimeString()}</div>
      </div>
    </div>`;
  }

  // Pollutant grid
  const PARAM_LABELS = { pm2_5:'PM2.5', pm10:'PM10', no2:'NO₂', o3:'O₃', co:'CO', so2:'SO₂', nh3:'NH₃', 'us-aqi':'US AQI', 'european_aqi':'EU AQI' };
  const PARAM_LIMITS = { pm2_5:25, pm10:50, no2:40, o3:100, co:4000, so2:20 };

  const pollutants = aqData.measurements.filter(m => m.parameter !== 'aqi' && m.parameter !== 'us-aqi' && m.value != null);
  if (pollutants.length) {
    html += `<div class="aq-grid">`;
    pollutants.slice(0,8).forEach(m => {
      const lbl   = PARAM_LABELS[m.parameter] || m.parameter.toUpperCase();
      const limit = PARAM_LIMITS[m.parameter];
      const pct   = limit ? Math.min(m.value / limit * 100, 100) : null;
      const bad   = limit && m.value > limit;
      html += `<div class="aq-cell">
        <div class="aq-cell-label">${gdEsc(lbl)}</div>
        <div class="aq-cell-val ${bad?'wm-neg':''}">${typeof m.value==='number'?m.value.toFixed(1):m.value} <span style="font-size:8px;color:var(--text-muted)">${gdEsc(m.unit||'')}</span></div>
        ${pct!=null?`<div class="aq-bar-wrap"><div class="aq-bar" style="width:${pct.toFixed(0)}%;background:${bad?'#f85149':'#3fb950'}"></div></div>`:''}
      </div>`;
    });
    html += `</div>`;
  }

  // No key nudge
  if (!aqKey && src !== 'OpenAQ v3') {
    html += `<div class="av-note" style="margin-top:6px">
      Add <a href="#" onclick="openApiConfig('openaq');return false" style="color:var(--accent)">OpenAQ v3 key</a> (free) for 30,000+ global stations with historical data.
    </div>`;
  }
  el.innerHTML = html;
};

/* Auto-expose gdEsc if not already defined at module scope */
function gdEsc(s) { return String(s??'').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c])); }


/* ══════════════════════════════════════════════════════════════════
   INIT & AUTO-REFRESH
   ══════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════
   PUNTO 5 — AIR QUALITY MODULE
   ──────────────────────────────────────────────────────────────────
   Sources (priority cascade):
   1. OpenAQ v3  api.openaq.org/v3  (free key, user has it)
      — 30,000+ stations, PM2.5/PM10/NO2/O3/CO/SO2, 100+ countries
      — Fetches nearest stations to company HQ lat/lon
   2. WAQI       api.waqi.info/feed/{city}/?token=demo
      — AQI real-time, 1000+ cities, token 'demo' works (~100/day)
   3. Open-Meteo air quality  (already in geodata.js)
      — PM2.5, PM10, ozone, CO from Copernicus forecast model
   Context: HQ coords read from FMP company profile or geocoded
   ══════════════════════════════════════════════════════════════════ */

const _AQ_CACHE  = {};
const _AQ_TTL_MS = 30 * 60 * 1000; // 30 min

/* ── AQI category helper ─────────────────────────────────────────── */
function _aqiCategory(aqi) {
  if (aqi == null) return { label:'Unknown', color:'#8b949e', bg:'rgba(139,148,158,.12)' };
  if (aqi <= 50)  return { label:'Good',           color:'#3fb950', bg:'rgba(63,185,80,.12)' };
  if (aqi <= 100) return { label:'Moderate',        color:'#d29922', bg:'rgba(210,153,34,.12)' };
  if (aqi <= 150) return { label:'Unhealthy (Sensitive)', color:'#f0883e', bg:'rgba(240,136,62,.12)' };
  if (aqi <= 200) return { label:'Unhealthy',       color:'#f85149', bg:'rgba(248,81,73,.12)' };
  if (aqi <= 300) return { label:'Very Unhealthy',  color:'#a371f7', bg:'rgba(163,113,247,.12)' };
  return               { label:'Hazardous',          color:'#8b0000', bg:'rgba(139,0,0,.15)' };
}

/* ── Gauge SVG for AQI value ────────────────────────────────────── */
function _aqiGaugeSVG(aqi) {
  const cat = _aqiCategory(aqi);
  const pct = aqi != null ? Math.min(1, aqi/300) : 0;
  const r=38, cx=50, cy=50;
  const startA = Math.PI;
  const endA   = startA + pct * Math.PI;
  const x1 = cx + r*Math.cos(startA), y1 = cy + r*Math.sin(startA);
  const x2 = cx + r*Math.cos(endA),   y2 = cy + r*Math.sin(endA);
  const large = pct >= 0.5 ? 1 : 0;
  return `<svg viewBox="0 0 100 55" width="110" height="60" style="display:block;margin:0 auto">
    <path d="M${cx-r},${cy} A${r},${r} 0 0,1 ${cx+r},${cy}" fill="none" stroke="#21262d" stroke-width="8"/>
    <path d="M${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2}" fill="none" stroke="${cat.color}" stroke-width="8" stroke-linecap="round"/>
    <text x="${cx}" y="${cy-4}" text-anchor="middle" font-size="17" font-weight="800" fill="${cat.color}" font-family="var(--font-mono,monospace)">${aqi!=null?aqi:'—'}</text>
    <text x="${cx}" y="${cy+9}" text-anchor="middle" font-size="7" fill="#8b949e">${cat.label}</text>
  </svg>`;
}

/* ── Pollutant bar ──────────────────────────────────────────────── */
function _aqPollutantBar(name, value, unit, max, color) {
  if (value == null) return '';
  const pct = Math.min(100, (value/max)*100).toFixed(1);
  return `<div class="aq-pol-row">
    <span class="aq-pol-name">${name}</span>
    <div class="aq-pol-bar-wrap">
      <div class="aq-pol-bar" style="width:${pct}%;background:${color}"></div>
    </div>
    <span class="aq-pol-val">${typeof value==='number'?value.toFixed(1):value} ${unit}</span>
  </div>`;
}

/* ── Source 1: OpenAQ v3 ─────────────────────────────────────────── */
async function _openaqFetch(lat, lon) {
  const key = (typeof getOpenAQKey==='function') ? getOpenAQKey() : '';
  if (!key) return null;

  const cacheKey = `openaq_${lat.toFixed(2)}_${lon.toFixed(2)}`;
  const cached = _AQ_CACHE[cacheKey];
  if (cached && Date.now() - cached.ts < _AQ_TTL_MS) return cached.data;

  try {
    // Find nearest stations
    const locRes = await fetch(
      `https://api.openaq.org/v3/locations?coordinates=${lat},${lon}&radius=25000&limit=5&order_by=distance`,
      { headers: { 'X-API-Key': key, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(9000) }
    );
    if (!locRes.ok) return null;
    const locData = await locRes.json();
    const stations = locData.results || [];
    if (!stations.length) return null;

    // Fetch latest measurements from nearest station
    const stationId = stations[0].id;
    const measRes = await fetch(
      `https://api.openaq.org/v3/locations/${stationId}/latest`,
      { headers: { 'X-API-Key': key, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(9000) }
    );
    if (!measRes.ok) return null;
    const measData = await measRes.json();

    const result = {
      station: stations[0].name || 'Station',
      city:    stations[0].locality || stations[0].country?.name || '',
      country: stations[0].country?.code || '',
      lat: stations[0].coordinates?.latitude,
      lon: stations[0].coordinates?.longitude,
      distance: stations[0].distance ? Math.round(stations[0].distance/1000) : null,
      updated: measData.results?.[0]?.datetime?.local || null,
      pollutants: {},
      _src: 'OpenAQ v3',
    };

    // Parse pollutant measurements
    (measData.results || []).forEach(m => {
      const param = m.parameter?.name || m.parameterId;
      result.pollutants[param] = {
        value: m.value,
        unit:  m.unit || 'µg/m³',
        lastUpdated: m.datetime?.local,
      };
    });

    _AQ_CACHE[cacheKey] = { data: result, ts: Date.now() };
    return result;
  } catch(e) {
    console.warn('[OpenAQ]', e.message);
    return null;
  }
}

/* ── Source 2: WAQI (token demo fallback) ───────────────────────── */
async function _waqiFetch(city) {
  const city_enc = encodeURIComponent(city);
  const cacheKey = `waqi_${city_enc}`;
  const cached = _AQ_CACHE[cacheKey];
  if (cached && Date.now() - cached.ts < _AQ_TTL_MS) return cached.data;

  try {
    const res  = await fetch(
      `https://api.waqi.info/feed/${city_enc}/?token=demo`,
      { signal: AbortSignal.timeout(8000) }
    );
    const json = await res.json();
    if (json.status !== 'ok') return null;

    const d = json.data;
    const result = {
      aqi:     d.aqi,
      station: d.city?.name || city,
      city,
      updated: d.time?.s || null,
      pollutants: {},
      _src: 'WAQI (demo)',
    };

    // WAQI iaqi field: { pm25: { v: 42.3 }, pm10: { v: 58 }, ... }
    const iaqi = d.iaqi || {};
    const paramMap = { pm25:'pm2.5', pm10:'pm10', no2:'no2', o3:'o3', co:'co', so2:'so2' };
    Object.entries(paramMap).forEach(([k, name]) => {
      if (iaqi[k]?.v != null) result.pollutants[name] = { value: iaqi[k].v, unit: 'µg/m³' };
    });

    _AQ_CACHE[cacheKey] = { data: result, ts: Date.now() };
    return result;
  } catch(e) {
    console.warn('[WAQI]', e.message);
    return null;
  }
}

/* ── Source 3: Open-Meteo (already in geodata.js — re-export) ───── */
async function _openmeteoAirFetch(lat, lon) {
  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone,dust&timezone=auto`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    const c    = json.current;
    if (!c) return null;
    return {
      station: 'Open-Meteo forecast',
      city:    '',
      updated: c.time || null,
      pollutants: {
        'pm2.5': { value: c.pm2_5,            unit: 'µg/m³' },
        'pm10':  { value: c.pm10,             unit: 'µg/m³' },
        'no2':   { value: c.nitrogen_dioxide,  unit: 'µg/m³' },
        'o3':    { value: c.ozone,             unit: 'µg/m³' },
        'co':    { value: c.carbon_monoxide,   unit: 'µg/m³' },
      },
      _src: 'Open-Meteo',
    };
  } catch { return null; }
}

/* ── Get HQ coordinates from company profile ─────────────────────── */
async function _getCompanyHQ(sym) {
  // Try FMP company profile first
  const fmpKey = (typeof getFmpKey === 'function') ? getFmpKey() : '';
  if (fmpKey && sym) {
    try {
      const res  = await fetch(
        `https://financialmodelingprep.com/api/v3/profile/${sym}?apikey=${fmpKey}`,
        { signal: AbortSignal.timeout(7000) }
      );
      const data = await res.json();
      const p    = data?.[0];
      if (p?.country) {
        // Return HQ info if profile has city/address
        return {
          city:    p.city || p.country,
          country: p.country,
          lat:     null, // FMP free doesn't always give lat/lon
          lon:     null,
          name:    p.companyName || sym,
          symbol:  sym,
        };
      }
    } catch {}
  }

  // Fallback: use ticker exchange to infer city
  const EXCHANGE_CITIES = {
    NASDAQ: { city:'New York', lat: 40.7128, lon:-74.0060 },
    NYSE:   { city:'New York', lat: 40.7128, lon:-74.0060 },
    LSE:    { city:'London',   lat: 51.5074, lon: -0.1278 },
    TSE:    { city:'Tokyo',    lat: 35.6762, lon:139.6503 },
    HKEX:   { city:'Hong Kong',lat: 22.3193, lon:114.1694 },
    SSE:    { city:'Shanghai', lat: 31.2304, lon:121.4737 },
    NSE:    { city:'Mumbai',   lat: 19.0760, lon: 72.8777 },
    BSE:    { city:'Mumbai',   lat: 19.0760, lon: 72.8777 },
    ASX:    { city:'Sydney',   lat:-33.8688, lon:151.2093 },
    FSE:    { city:'Frankfurt',lat: 50.1109, lon:  8.6821 },
  };

  // Default New York
  return { city:'New York', lat:40.7128, lon:-74.0060, country:'US', name:sym, symbol:sym };
}

/* ── Main loader — called from geo AIR tab ───────────────────────── */
window.openaqLoadCity = async function(sym) {
  const el = document.getElementById('geo-airqual-content');
  if (!el) return;

  // Get current ticker from dashboard
  const ticker = sym || (typeof window.currentTicker !== 'undefined'
    ? window.currentTicker.replace(/.*:/,'').toUpperCase()
    : 'AAPL');

  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Fetching air quality data…</div>`;

  const hq = await _getCompanyHQ(ticker);

  let aqData = null;

  // 1. OpenAQ v3 (if lat/lon available and key set)
  if (hq.lat && hq.lon && (typeof getOpenAQKey==='function' ? getOpenAQKey() : '')) {
    aqData = await _openaqFetch(hq.lat, hq.lon);
  }

  // 2. WAQI with city name
  if (!aqData) {
    aqData = await _waqiFetch(hq.city);
  }

  // 3. Open-Meteo with default coords (NYC if no lat/lon)
  if (!aqData && hq.lat && hq.lon) {
    aqData = await _openmeteoAirFetch(hq.lat, hq.lon);
  }
  if (!aqData) {
    aqData = await _openmeteoAirFetch(40.7128, -74.0060);
  }

  if (!aqData) {
    el.innerHTML = `<div class="no-data">
      // Air quality data unavailable.<br>
      // <a href="#" onclick="openApiConfig('openaq');return false" style="color:var(--accent)">Add OpenAQ v3 key</a> (free) for 30,000+ global stations.
    </div>`;
    return;
  }

  // ── Compute AQI from PM2.5 if not provided by source ────────────
  let aqi = aqData.aqi || null;
  if (!aqi && aqData.pollutants['pm2.5']?.value != null) {
    // US EPA simple PM2.5 to AQI conversion (breakpoints)
    const pm = aqData.pollutants['pm2.5'].value;
    const _toAQI = (c, cL, cH, iL, iH) => Math.round(((iH-iL)/(cH-cL))*(c-cL)+iL);
    if      (pm <= 12.0)  aqi = _toAQI(pm, 0,    12.0,  0,   50);
    else if (pm <= 35.4)  aqi = _toAQI(pm, 12.1, 35.4,  51,  100);
    else if (pm <= 55.4)  aqi = _toAQI(pm, 35.5, 55.4,  101, 150);
    else if (pm <= 150.4) aqi = _toAQI(pm, 55.5, 150.4, 151, 200);
    else if (pm <= 250.4) aqi = _toAQI(pm, 150.5,250.4, 201, 300);
    else                  aqi = _toAQI(pm, 250.5,500.4, 301, 500);
  }

  const cat = _aqiCategory(aqi);
  const pols = aqData.pollutants;
  const hasKey = typeof getOpenAQKey==='function' ? getOpenAQKey() : '';

  let html = `
    <div class="aq-header" style="background:${cat.bg};border-bottom:1px solid var(--border)">
      <div class="aq-location">
        <span class="aq-ticker">${ticker}</span>
        <span class="aq-city">${aqData.city || hq.city}${hq.country ? ', '+hq.country : ''}</span>
        ${aqData.distance!=null ? `<span class="aq-dist">${aqData.distance}km from center</span>` : ''}
      </div>
      <div class="aq-gauge">${_aqiGaugeSVG(aqi)}</div>
      <div class="aq-station-info">
        <span class="aq-station-name">${aqData.station || '—'}</span>
        ${aqData.updated ? `<span class="aq-updated">${new Date(aqData.updated).toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'})}</span>` : ''}
        <span class="aq-src-badge">${aqData._src}</span>
      </div>
    </div>

    <div class="aq-pollutants">
      <div class="aq-pol-title">Pollutant readings</div>
      ${_aqPollutantBar('PM 2.5', pols['pm2.5']?.value, 'µg/m³', 150, '#f85149')}
      ${_aqPollutantBar('PM 10',  pols['pm10']?.value,  'µg/m³', 250, '#f0883e')}
      ${_aqPollutantBar('NO₂',   pols['no2']?.value,   'µg/m³', 200, '#d29922')}
      ${_aqPollutantBar('O₃',    pols['o3']?.value,    'µg/m³', 180, '#3fb950')}
      ${_aqPollutantBar('CO',    pols['co']?.value,    'µg/m³', 10000,'#58a6ff')}
      ${_aqPollutantBar('SO₂',   pols['so2']?.value,   'µg/m³', 200, '#a371f7')}
    </div>

    ${!hasKey ? `<div class="aq-upgrade-note">
      Using WAQI demo token · limited to ~100 req/day ·
      <a href="#" onclick="openApiConfig('openaq');return false" style="color:var(--accent)">Add OpenAQ v3 key</a> for full global coverage.
    </div>` : ''}

    <div class="aq-footer">
      Source: <a href="https://openaq.org" target="_blank" class="geo-wm-link">OpenAQ ↗</a> ·
      <a href="https://waqi.info/city/${encodeURIComponent(hq.city)}" target="_blank" class="geo-wm-link">WAQI ↗</a> ·
      <a href="https://open-meteo.com" target="_blank" class="geo-wm-link">Open-Meteo ↗</a>
    </div>`;

  el.innerHTML = html;
};

document.addEventListener("DOMContentLoaded", () => {
  // Load USGS quakes immediately (replaces/supplements WM quakes)
  setTimeout(() => {
    if (document.getElementById("geo-quakes")) usgsLoadQuakes();
  }, 1200);

  // Load NASA EONET for Alert Feed
  setTimeout(() => {
    if (document.getElementById("alert-eonet")) eonetLoadEvents();
  }, 1800);

  // Auto-refresh
  setInterval(() => {
    if (document.getElementById("geo-quakes"))  usgsLoadQuakes();
    if (document.getElementById("alert-noaa"))  noaaLoadAlerts();
    if (document.getElementById("alert-eonet")) eonetLoadEvents();
  }, 5 * 60 * 1000); // every 5 min
});

})();
