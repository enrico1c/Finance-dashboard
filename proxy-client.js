/**
 * proxy-client.js — Transparent fetch interceptor for FINTERM.
 *
 * LOAD THIS SCRIPT FIRST — before config.js and all API modules.
 *
 * What it does:
 *   - Intercepts window.fetch() calls destined for known finance API providers
 *   - Strips any API key params/headers the existing modules try to send
 *   - Redirects the call to the FINTERM backend proxy (/api/proxy)
 *   - Attaches session credentials automatically (cookie)
 *   - Passes all other fetch calls through untouched
 *
 * Why this approach:
 *   - Zero changes needed in the 40+ existing API modules
 *   - The dashboard code keeps working exactly as written
 *   - API keys are never present in the browser — the backend injects them
 *
 * Configuration:
 *   Set window.FINTERM_BACKEND_URL before this script loads (in index.html):
 *     <script>window.FINTERM_BACKEND_URL = 'https://your-backend.onrender.com';</script>
 */

(function () {
  'use strict';

  // ── Configuration ─────────────────────────────────────────────────────────────

  // Backend URL — set in index.html before this script loads.
  // Falls back to localhost for local development.
  const BACKEND_URL = (window.FINTERM_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

  // ── Provider intercept map ────────────────────────────────────────────────────
  // Maps external API hostnames to their provider ID in the backend registry.
  // Also lists the query param name used for the API key (so we can strip it).
  const PROVIDER_MAP = {
    'www.alphavantage.co':                       { id: 'av',             keyParam: 'apikey' },
    'alphavantage.co':                           { id: 'av',             keyParam: 'apikey' },
    'finnhub.io':                                { id: 'finnhub',        keyParam: 'token' },
    'api.finnhub.io':                            { id: 'finnhub',        keyParam: 'token' },
    'financialmodelingprep.com':                 { id: 'fmp',            keyParam: 'apikey' },
    'eodhd.com':                                 { id: 'eodhd',          keyParam: 'api_token' },
    'api.twelvedata.com':                        { id: 'twelvedata',     keyParam: 'apikey' },
    'api.tiingo.com':                            { id: 'tiingo',         keyParam: null },  // uses header
    'api.polygon.io':                            { id: 'polygon',        keyParam: 'apiKey' },
    'api.marketstack.com':                       { id: 'marketstack',    keyParam: 'access_key' },
    'yahoo-finance15.p.rapidapi.com':            { id: 'yahoo',          keyParam: null },  // uses header
    'stooq.com':                                 { id: 'stooq',          keyParam: null },
    'api.apitube.io':                            { id: 'apitube',        keyParam: 'api_key' },
    'api.api-ninjas.com':                        { id: 'ninjas',         keyParam: null },  // uses header
    'api.stlouisfed.org':                        { id: 'fred',           keyParam: 'api_key' },
    'api.eia.gov':                               { id: 'eia',            keyParam: 'api_key' },
    'api.bls.gov':                               { id: 'bls',            keyParam: 'registrationkey' },
    'openexchangerates.org':                     { id: 'openexchange',   keyParam: 'app_id' },
    'api.openfigi.com':                          { id: 'openfigi',       keyParam: null },  // uses header
    'api.company-information.service.gov.uk':    { id: 'companieshouse', keyParam: null },  // uses basic auth
    'api.openaq.org':                            { id: 'openaq',         keyParam: null },  // uses header
    'comtradeapi.un.org':                        { id: 'comtrade',       keyParam: 'subscription-key' },
    'agsi.gie.eu':                               { id: 'gie',            keyParam: null },  // uses header
    'api.gleif.org':                             { id: 'gleif',          keyParam: null },
    'api.llama.fi':                              { id: 'defillama',      keyParam: null },
    'blockchain.info':                           { id: 'blockchain_info', keyParam: null },
    'earthquake.usgs.gov':                       { id: 'usgs',           keyParam: null },
    'www.gdacs.org':                             { id: 'gdacs',          keyParam: null },
    'api.weather.gov':                           { id: 'noaa',           keyParam: null },
  };

  // These query param names are always stripped (key param aliases across providers)
  const KEY_PARAM_NAMES = new Set([
    'apikey', 'api_key', 'token', 'api_token', 'access_key',
    'apiKey', 'registrationkey', 'subscription-key', 'app_id', 'key',
  ]);

  // These headers are stripped (prevent key leakage via custom headers)
  const KEY_HEADER_NAMES_LOWER = new Set([
    'x-finnhub-token', 'authorization', 'x-rapidapi-key', 'x-api-key',
    'x-openfigi-apikey', 'x-key', 'apikey',
  ]);

  // ── Auth state ────────────────────────────────────────────────────────────────

  // Tracks whether the session is currently authenticated.
  // Set by auth.js after login / status check.
  window._FINTERM_AUTHENTICATED = false;

  // ── Fetch interceptor ─────────────────────────────────────────────────────────

  const _originalFetch = window.fetch.bind(window);

  window.fetch = async function interceptedFetch(input, init = {}) {
    // Resolve URL string from Request object or string
    const urlString = input instanceof Request ? input.url : String(input);

    let parsed;
    try {
      parsed = new URL(urlString);
    } catch {
      // Not a valid absolute URL — pass through (relative paths, blob:, etc.)
      return _originalFetch(input, init);
    }

    const provider = PROVIDER_MAP[parsed.hostname];

    // Not a known provider — pass through unchanged
    if (!provider) {
      return _originalFetch(input, init);
    }

    // ── Not authenticated — fail fast with a clear error ───────────────────────
    if (!window._FINTERM_AUTHENTICATED) {
      // Return a synthetic 401 response so API modules get a clean error
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── Build proxy URL ────────────────────────────────────────────────────────
    const proxyParams = new URLSearchParams();
    proxyParams.set('provider', provider.id);
    proxyParams.set('path', parsed.pathname);

    // Forward all query params except the API key param
    for (const [k, v] of parsed.searchParams.entries()) {
      const isKeyParam = KEY_PARAM_NAMES.has(k) || k === provider.keyParam;
      if (!isKeyParam) {
        proxyParams.set(k, v);
      }
    }

    const proxyUrl = `${BACKEND_URL}/api/proxy?${proxyParams.toString()}`;

    // ── Build proxy request options ────────────────────────────────────────────
    const proxyInit = {
      method: (init.method || (input instanceof Request ? input.method : 'GET')),
      credentials: 'include',  // send the session cookie cross-origin
    };

    // Forward body for POST/PUT requests
    if (init.body) {
      proxyInit.body = init.body;
    }

    // Forward safe headers, strip key headers
    const mergedHeaders = new Headers(init.headers || {});
    if (input instanceof Request) {
      input.headers.forEach((v, k) => mergedHeaders.set(k, v));
    }
    const safeHeaders = new Headers();
    mergedHeaders.forEach((value, name) => {
      if (!KEY_HEADER_NAMES_LOWER.has(name.toLowerCase())) {
        safeHeaders.set(name, value);
      }
    });
    proxyInit.headers = safeHeaders;

    try {
      const response = await _originalFetch(proxyUrl, proxyInit);

      // If the proxy returns 401, the session has expired — trigger re-login
      if (response.status === 401) {
        window._FINTERM_AUTHENTICATED = false;
        window.dispatchEvent(new CustomEvent('finterm:session-expired'));
        return response;
      }

      return response;
    } catch (err) {
      // Network error reaching backend — surface as a meaningful response
      console.error('[ProxyClient] Backend unreachable:', err.message);
      return new Response(
        JSON.stringify({ error: 'Backend unreachable. Check your connection or backend deployment.' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }
  };

  // ── XMLHttpRequest intercept (for any modules using XHR instead of fetch) ────

  const _originalXHROpen = XMLHttpRequest.prototype.open;
  const _originalXHRSend = XMLHttpRequest.prototype.send;
  const _originalXHRSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._finterm_url = url;
    this._finterm_method = method;
    this._finterm_headers = {};

    let parsed;
    try { parsed = new URL(url, window.location.href); } catch { parsed = null; }

    if (parsed && PROVIDER_MAP[parsed.hostname]) {
      const provider = PROVIDER_MAP[parsed.hostname];
      const proxyParams = new URLSearchParams();
      proxyParams.set('provider', provider.id);
      proxyParams.set('path', parsed.pathname);
      for (const [k, v] of parsed.searchParams.entries()) {
        const isKeyParam = KEY_PARAM_NAMES.has(k) || k === provider.keyParam;
        if (!isKeyParam) proxyParams.set(k, v);
      }
      this._finterm_proxied = true;
      this._finterm_proxy_url = `${BACKEND_URL}/api/proxy?${proxyParams.toString()}`;
      _originalXHROpen.call(this, method, this._finterm_proxy_url, ...rest);
      this.withCredentials = true;
    } else {
      this._finterm_proxied = false;
      _originalXHROpen.call(this, method, url, ...rest);
    }
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (this._finterm_proxied && KEY_HEADER_NAMES_LOWER.has(name.toLowerCase())) {
      // Suppress key headers on proxied requests
      return;
    }
    _originalXHRSetHeader.call(this, name, value);
  };

  console.log(`[ProxyClient] Fetch interceptor active. Backend: ${BACKEND_URL}`);
  console.log(`[ProxyClient] ${Object.keys(PROVIDER_MAP).length} provider domains intercepted.`);

})();
