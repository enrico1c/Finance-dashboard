
function sbRelTime(ts) {
  if (!ts) return '';
  const sec = ts > 1e12 ? Math.floor(ts/1000) : ts;
  const d = Math.floor(Date.now()/1000) - sec;
  if (d < 60)    return `${d}s ago`;
  if (d < 3600)  return `${Math.floor(d/60)}m ago`;
  if (d < 86400) return `${Math.floor(d/3600)}h ago`;
  return `${Math.floor(d/86400)}d ago`;
}

/* ── Run saved intel injection on page load ─────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Inject cached intel into feed on startup
  sbInjectSavedIntel().catch(() => {});

  // Also intercept renderNews to load cached articles
  if (typeof renderNews === 'function') {
    const _origRN = renderNews;
    window.renderNews = function(ticker) {
      _origRN(ticker);
      // Load saved news 500ms after render starts (won't overwrite live data)
      setTimeout(() => sbLoadNewsForTicker(ticker).catch(() => {}), 500);
    };
  }
});
