/* ══════════════════════════════════════════════════════════════════
   FINTERM Service Worker — PWA Cache Strategy
   ──────────────────────────────────────────────────────────────────
   Strategy:
   • App Shell (HTML/CSS/JS):   Cache-First  (fast load, update background)
   • API responses:             Network-First with cache fallback (fresh data)
   • Static assets:             Stale-While-Revalidate
   ══════════════════════════════════════════════════════════════════ */

const CACHE_VERSION  = 'finterm-v15-2026';
const STATIC_CACHE   = `${CACHE_VERSION}-static`;
const API_CACHE      = `${CACHE_VERSION}-api`;

/* App shell — files to pre-cache on install */
const APP_SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/finnhub.js',
  '/fmp.js',
  '/fred.js',
  '/technical.js',
  '/worldmonitor.js',
  '/geodata.js',
  '/finterm-extras.js',
  '/config.js',
  '/yahoo.js',
  '/geointel.js',
  '/finterm-modules.js',
  '/commodities.js',
  '/api.js',
  '/sbcache.js',
  '/energy.js',
  '/commodities.js',
  '/minerals.js',
  '/agriculture.js',
  '/tradeflows.js',
  '/positioning.js',
  '/intel.js',
  /* Phase 1 — Identity Infrastructure */
  '/openfigi.js',
  '/nasdaqdir.js',
  '/gleif.js',
  /* Phase 2 — Registry & Ownership */
  '/companieshouse.js',
  /* Phase 3 — Market Structure */
  '/finra.js',
  /* Phase 4 — Reference Data & Instrument Lifecycle */
  '/esmafirds.js',
  '/secdera.js',
  /* Phase 5 — Fund & ETF Data Ecosystem */
  '/xbrlenhance.js',
  '/mfprospectus.js',
  '/valuation-datasources.js',
  '/valuation-data.js',
  '/fred_credit_addition.js',
  /* UARS Engine — Universal Asset Rating System */
  '/valuation-missing-sources.js',
  '/uars_engine.js',
  '/uars-source-connector.js',
  '/uars-peer-builder.js',
  '/uars-widget.js',
  '/uars-widget.css',
  '/uars-integration.js',
];

/* API hosts to cache with network-first strategy */
const API_HOSTS = [
  'api.stlouisfed.org',
  'api.coingecko.com',
  'api.llama.fi',
  'earthquake.usgs.gov',
  'efts.sec.gov',
  'data.sec.gov',
  'api.nasdaq.com',
  'api.alternative.me',
  'blockchain.info',
  'api.allorigins.win',
  'air-quality-api.open-meteo.com',
  'api.waqi.info',
  'www.eia.gov',
  'agsi.gie.eu',
  'transparency.entsog.eu',
  'agridata.ec.europa.eu',
  'fenixservices.fao.org',
  'comtradeapi.un.org',
  'api.bls.gov',
  'api.gdeltproject.org',
  'www.federalregister.gov',
  /* Phase 1 — Identity Infrastructure */
  'api.openfigi.com',
  'api.gleif.org',
  'www.nasdaqtrader.com',
  /* Phase 2 — Registry & Ownership */
  'api.company-information.service.gov.uk',
  'bods-data.openownership.org',
  /* Phase 3 — Market Structure */
  'cdn.finra.org',
  'services.finra.org',
  /* Phase 4 — Reference Data & Instrument Lifecycle */
  'registers.esma.europa.eu',
  'api.twelvedata.com',
];

/* ── Install: pre-cache app shell ────────────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return cache.addAll(APP_SHELL.map(url => new Request(url, { cache: 'reload' })))
        .catch(err => console.warn('[SW] Pre-cache partial failure:', err));
    }).then(() => self.skipWaiting())
  );
});

/* ── Activate: clean old caches ──────────────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k.startsWith('finterm-') && k !== STATIC_CACHE && k !== API_CACHE)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch: routing logic ─────────────────────────────────────────── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  /* Skip non-GET, chrome-extension, WebSockets */
  if (event.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return;

  /* Supabase — never cache (user data) */
  if (url.hostname.includes('supabase')) return;

  /* API hosts — Network First, fallback to cache */
  if (API_HOSTS.some(h => url.hostname.includes(h))) {
    event.respondWith(networkFirstWithCache(event.request, API_CACHE, 10 * 60 * 1000));
    return;
  }

  /* App shell (same origin .js, .css, .html) — Cache First */
  if (url.origin === self.location.origin &&
      (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html') || url.pathname === '/')) {
    event.respondWith(cacheFirstWithRevalidate(event.request, STATIC_CACHE));
    return;
  }

  /* Everything else — Stale-While-Revalidate */
  event.respondWith(staleWhileRevalidate(event.request, STATIC_CACHE));
});

/* ── Strategy implementations ────────────────────────────────────── */

async function networkFirstWithCache(request, cacheName, maxAge) {
  try {
    const res = await fetch(request.clone(), { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const cache = await caches.open(cacheName);
      // Add timestamp header for age check
      const headers = new Headers(res.headers);
      headers.set('sw-cached-at', Date.now().toString());
      const body = await res.arrayBuffer();
      const stamped = new Response(body, { status: res.status, headers });
      cache.put(request, stamped.clone());
      return new Response(body, { status: res.status, headers: res.headers });
    }
    throw new Error(`HTTP ${res.status}`);
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      const age = Date.now() - parseInt(cached.headers.get('sw-cached-at') || '0');
      if (age < maxAge) return cached;
    }
    return cached || new Response('{"error":"offline"}', {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function cacheFirstWithRevalidate(request, cacheName) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request.clone()).then(res => {
    if (res.ok) caches.open(cacheName).then(c => c.put(request, res.clone()));
    return res;
  }).catch(() => null);
  return cached || fetchPromise;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache   = await caches.open(cacheName);
  const cached  = await cache.match(request);
  const fetching = fetch(request.clone()).then(res => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  return cached || fetching;
}

/* ── Background sync for API cache refresh ───────────────────────── */
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_API_CACHE') {
    caches.delete(API_CACHE).then(() =>
      event.ports[0]?.postMessage({ ok: true })
    );
  }
});
