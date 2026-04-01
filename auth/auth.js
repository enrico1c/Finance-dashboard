/**
 * auth.js — FINTERM frontend authentication module.
 *
 * Handles:
 *   - Login overlay display and form submission
 *   - Session check on page load (auto-unlock if cookie still valid)
 *   - Logout
 *   - Session expiry detection (fires when proxy returns 401)
 *   - Communicates auth state to proxy-client.js via window._FINTERM_AUTHENTICATED
 *
 * LOAD ORDER in index.html:
 *   1. <script>window.FINTERM_BACKEND_URL = '...';</script>
 *   2. proxy-client.js          ← intercepts fetch
 *   3. auth/auth.js             ← this file (manages session + overlay)
 *   4. config.js, script.js, api.js, ... (rest of dashboard)
 *
 * Nothing sensitive is stored in localStorage or sessionStorage.
 * The session cookie is HTTP-only — this script never touches it directly.
 */

(function () {
  'use strict';

  const BACKEND_URL = (window.FINTERM_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

  // ── DOM refs (populated after DOMContentLoaded) ───────────────────────────────
  let overlay, form, passwordInput, submitBtn, errorMsg, logoutBtn, sessionIndicator;

  // ── Core auth functions ───────────────────────────────────────────────────────

  /**
   * Check the current session status with the backend.
   * Returns true if authenticated, false otherwise.
   */
  async function checkSession() {
    try {
      const res = await fetch(`${BACKEND_URL}/auth/status`, {
        credentials: 'include',
        // Use the original fetch — this endpoint is not a provider call
      });
      if (!res.ok) return false;
      const data = await res.json();
      return data.authenticated === true;
    } catch {
      return false;
    }
  }

  /**
   * Submit the login password to the backend.
   * Returns { ok: true } on success, { ok: false, error: string } on failure.
   */
  async function login(password) {
    try {
      const res = await fetch(`${BACKEND_URL}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok && data.authenticated) {
        return { ok: true };
      }
      return { ok: false, error: data.error || 'Login failed.' };
    } catch {
      return { ok: false, error: 'Cannot reach the backend. Check your connection.' };
    }
  }

  /**
   * Log out — clears the session cookie via the backend.
   */
  async function logout() {
    try {
      await fetch(`${BACKEND_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      // Even if the request fails, clear local auth state
    }
    setAuthenticated(false);
    showOverlay('Logged out. Enter your password to continue.');
  }

  // ── Auth state management ─────────────────────────────────────────────────────

  function setAuthenticated(isAuth) {
    window._FINTERM_AUTHENTICATED = isAuth;
    updateSessionIndicator(isAuth);
  }

  function unlockDashboard() {
    setAuthenticated(true);
    hideOverlay();
  }

  function lockDashboard(message) {
    setAuthenticated(false);
    showOverlay(message);
  }

  // ── Overlay UI ────────────────────────────────────────────────────────────────

  function showOverlay(message) {
    if (!overlay) return;
    overlay.classList.remove('finterm-hidden');
    overlay.setAttribute('aria-hidden', 'false');
    if (message && errorMsg) {
      errorMsg.textContent = message;
      errorMsg.classList.remove('finterm-hidden');
    }
    if (passwordInput) {
      passwordInput.value = '';
      passwordInput.focus();
    }
  }

  function hideOverlay() {
    if (!overlay) return;
    overlay.classList.add('finterm-hidden');
    overlay.setAttribute('aria-hidden', 'true');
  }

  function setLoading(isLoading) {
    if (!submitBtn || !passwordInput) return;
    submitBtn.disabled = isLoading;
    passwordInput.disabled = isLoading;
    submitBtn.textContent = isLoading ? 'Verifying…' : 'Unlock';
  }

  function showError(msg) {
    if (!errorMsg) return;
    errorMsg.textContent = msg;
    errorMsg.classList.remove('finterm-hidden');
    // Shake animation
    if (form) {
      form.classList.add('finterm-shake');
      setTimeout(() => form.classList.remove('finterm-shake'), 500);
    }
  }

  function clearError() {
    if (!errorMsg) return;
    errorMsg.textContent = '';
    errorMsg.classList.add('finterm-hidden');
  }

  function updateSessionIndicator(isAuth) {
    if (!sessionIndicator) return;
    if (isAuth) {
      sessionIndicator.textContent = '● Secure Session Active';
      sessionIndicator.className = 'finterm-session-indicator finterm-session-active';
    } else {
      sessionIndicator.textContent = '○ Not Authenticated';
      sessionIndicator.className = 'finterm-session-indicator finterm-session-inactive';
    }
  }

  // ── Form submission ───────────────────────────────────────────────────────────

  async function handleSubmit(e) {
    e.preventDefault();
    clearError();

    const password = passwordInput ? passwordInput.value : '';
    if (!password) {
      showError('Please enter your password.');
      return;
    }

    setLoading(true);
    const result = await login(password);
    setLoading(false);

    if (result.ok) {
      unlockDashboard();
    } else {
      showError(result.error || 'Invalid password.');
      if (passwordInput) passwordInput.value = '';
    }
  }

  // ── Session expiry listener ───────────────────────────────────────────────────
  // proxy-client.js fires this event when a 401 comes back from the backend

  window.addEventListener('finterm:session-expired', () => {
    lockDashboard('Your session has expired. Please log in again.');
  });

  // ── Logout button (injected into dashboard toolbar) ───────────────────────────

  function injectLogoutButton() {
    // Only inject if not already present
    if (document.getElementById('finterm-logout-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'finterm-logout-btn';
    btn.className = 'finterm-logout-btn';
    btn.textContent = 'Lock';
    btn.title = 'Lock dashboard (logout)';
    btn.addEventListener('click', logout);

    // Try to append to the dashboard header/toolbar
    // Adjust the selector to match your actual dashboard layout
    const toolbar = document.querySelector('.taskbar') ||
                    document.querySelector('.header') ||
                    document.querySelector('header') ||
                    document.body;
    toolbar.appendChild(btn);
    logoutBtn = btn;
  }

  // ── Session indicator ─────────────────────────────────────────────────────────

  function injectSessionIndicator() {
    if (document.getElementById('finterm-session-indicator')) return;
    const el = document.createElement('div');
    el.id = 'finterm-session-indicator';
    el.className = 'finterm-session-indicator finterm-session-inactive';
    el.textContent = '○ Not Authenticated';
    document.body.appendChild(el);
    sessionIndicator = el;
  }

  // ── Initialise ────────────────────────────────────────────────────────────────

  function initDOMRefs() {
    overlay        = document.getElementById('finterm-login-overlay');
    form           = document.getElementById('finterm-login-form');
    passwordInput  = document.getElementById('finterm-password');
    submitBtn      = document.getElementById('finterm-submit-btn');
    errorMsg       = document.getElementById('finterm-error-msg');
  }

  async function init() {
    initDOMRefs();
    injectSessionIndicator();

    if (!overlay) {
      console.error('[Auth] Login overlay element not found in DOM. Did you add login-overlay.html to index.html?');
      return;
    }

    // Wire up form
    if (form) form.addEventListener('submit', handleSubmit);

    // Allow Enter key on password field
    if (passwordInput) {
      passwordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') form && form.dispatchEvent(new Event('submit', { cancelable: true }));
      });
    }

    // Show overlay immediately while we check session
    showOverlay();

    // Check if existing session is still valid
    const isAuthenticated = await checkSession();

    if (isAuthenticated) {
      unlockDashboard();
      injectLogoutButton();
    } else {
      // Show fresh login prompt
      showOverlay();
    }

    // After successful login, inject logout button
    form && form.addEventListener('submit', async () => {
      // Small delay to allow unlockDashboard() to run first
      setTimeout(injectLogoutButton, 100);
    });
  }

  // Wait for DOM before initialising
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for debugging (no sensitive data exposed)
  window._FINTERM_AUTH = {
    logout,
    checkSession,
    isAuthenticated: () => window._FINTERM_AUTHENTICATED,
  };

})();
