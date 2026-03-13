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
  const data = await gdFetch("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=60", "eonet_events");
  if (!data?.events) { el.innerHTML = `<div class="no-data">// NASA EONET unavailable.</div>`; return; }

  const catColor = id => ({
    wildfires:     "#e55",
    volcanoes:     "#f90",
    severeStorms:  "#fc6",
    floods:        "#4a9eff",
    seaLakeIce:    "#8cf",
    drought:       "#c90",
    earthquakes:   "#a86",
    landslides:    "#b75",
    temperatureExtremes: "#f6a",
    waterColor:    "#4cf",
    dustHaze:      "#cc8",
  })[id] || "#888";

  const events = data.events;
  const byCategory = {};
  events.forEach(e => {
    const cat = e.categories?.[0]?.id || "other";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(e);
  });

  let html = `<div class="av-live-badge">● NASA EONET · Active Natural Events · Live</div>`;
  html += `<div class="eonet-stats">`;
  Object.entries(byCategory).sort(([,a],[,b]) => b.length-a.length).forEach(([cat, evts]) => {
    const label = cat.replace(/([A-Z])/g," $1").replace(/^./,s=>s.toUpperCase());
    html += `<span class="eonet-cat-pill" style="border-color:${catColor(cat)};color:${catColor(cat)}">${label}: <strong>${evts.length}</strong></span>`;
  });
  html += `</div><div class="eonet-list">`;

  events.slice(0, 25).forEach(e => {
    const cat   = e.categories?.[0]?.id || "other";
    const geo   = e.geometry?.[0];
    const coord = geo?.coordinates ? `${geo.coordinates[1].toFixed(1)}°N ${geo.coordinates[0].toFixed(1)}°E` : "";
    const date  = geo?.date ? geo.date.slice(0,10) : e.geometry?.[e.geometry.length-1]?.date?.slice(0,10) || "";
    html += `<div class="eonet-row">
      <span class="eonet-dot" style="background:${catColor(cat)}"></span>
      <div class="eonet-info">
        <span class="eonet-title">${e.title}</span>
        <span class="eonet-meta">${coord} · ${date}</span>
      </div>
      ${e.sources?.[0]?.url ? `<a href="${e.sources[0].url}" target="_blank" rel="noopener" class="usgs-link">↗</a>` : ""}
    </div>`;
  });
  html += `</div>`;
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
   INIT & AUTO-REFRESH
   ══════════════════════════════════════════════════════════════════ */
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
