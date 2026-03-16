@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');

/* ─── CSS VARIABLES ──────────────────────────────────────────────── */
:root {
  --bg-base:       #080b0f;
  --bg-panel:      #0d1117;
  --bg-surface:    #111820;
  --bg-hover:      #161f2b;
  --bg-input:      #0a1018;

  --border:        #1e2d3d;
  --border-bright: #2a3f56;

  --accent:        #1a6bff;
  --accent-bright: #3d8bff;
  --accent-glow:   #1a6bff22;
  --accent-green:  #00d4a0;
  --accent-red:    #ff4757;

  --text-primary:  #e8f0fe;
  --text-secondary:#7a9bb5;
  --text-muted:    #3d5a72;

  --font-mono:     'IBM Plex Mono', monospace;
  --font-sans:     'IBM Plex Sans', sans-serif;

  --radius-sm:     4px;
  --radius-md:     6px;
  --radius-lg:     8px;
  --transition:    140ms ease;

  --handle-size:   8px;   /* resize handle hit area */
}

/* ─── RESET ──────────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  width: 100%; height: 100%;
  overflow: hidden;
  background: var(--bg-base);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
}

/* CRT scanlines */
body::before {
  content: '';
  position: fixed; inset: 0;
  background: repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.03) 2px,rgba(0,0,0,.03) 4px);
  pointer-events: none;
  z-index: 9998;
}

/* ─── SCROLLBAR ──────────────────────────────────────────────────── */
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-bright); border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: var(--accent); }

/* ─── APP SHELL ──────────────────────────────────────────────────── */
.app-shell {
  width: 100vw; height: 100vh;
  display: flex; flex-direction: column;
  padding: 8px; gap: 8px;
  overflow: hidden;
  background: radial-gradient(ellipse 80% 40% at 50% -10%,#0d2040,transparent 70%), var(--bg-base);
}

/* ─── TOPBAR ─────────────────────────────────────────────────────── */
/* ─── TOPBAR ─────────────────────────────────────────────────────────── */
.topbar {
  flex: 0 0 auto;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 0 14px;
  display: flex;
  flex-direction: column;
  position: relative;
  animation: slideDown .4s ease both;
  z-index: 100;
  overflow: visible;   /* allow tray dropdown to escape */
  transition: max-height .25s ease;
  max-height: 80px; /* expanded default */
}

.topbar.collapsed {
  max-height: 36px;
}
/* When collapsed, hide the second row but keep tray accessible */
.topbar.collapsed #topbarRow2 {
  display: none;
}

.topbar::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg,transparent,var(--accent),transparent);
  opacity: .6; pointer-events: none;
}

@keyframes slideDown {
  from { opacity:0; transform:translateY(-8px); }
  to   { opacity:1; transform:translateY(0); }
}

/* ── Rows ── */
.topbar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;           /* fixed height — no wrapping */
  flex-shrink: 0;
  overflow: hidden;
  width: 100%;
}

.topbar-row-1 {
  /* main row always visible */
}

.topbar-row-2 {
  border-top: 1px solid var(--border);
  min-height: 32px;
  height: auto;
  flex-wrap: wrap;
  gap: 4px 6px;
  padding: 4px 8px;
  align-items: center;
  transition: all .2s;
}

/* Compact (default): single scrollable row, no wrap */
.topbar-row-2.compact {
  flex-wrap: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  height: 32px;
  min-height: 32px;
  padding: 0 8px;
}
.topbar-row-2.compact::-webkit-scrollbar { display: none; }

/* Expanded: allow wrap onto multiple lines */
.topbar-row-2.expanded {
  flex-wrap: wrap;
  height: auto;
  min-height: 32px;
  padding: 6px 8px;
}

/* collapse leftovers */
.top-left  { display: contents; }
.top-right { display: contents; }

/* ── Collapse button ── */
.topbar-collapse-btn {
  margin-left: auto;
  flex-shrink: 0;
  width: 22px; height: 22px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  font-size: 9px; line-height: 1;
  cursor: pointer;
  transition: all var(--transition);
  display: flex; align-items: center; justify-content: center;
}
.topbar-collapse-btn:hover {
  border-color: var(--accent); color: var(--accent-bright);
  background: var(--accent-glow);
}
.topbar.collapsed .topbar-collapse-btn { transform: rotate(180deg); }

.brand { display:flex; flex-direction:column; flex-shrink:0; }

h1 {
  font-family: var(--font-mono);
  font-size: 15px; font-weight: 700;
  letter-spacing: .12em; text-transform: uppercase;
  color: var(--text-primary); white-space: nowrap;
}

.brand-sub {
  font-family: var(--font-mono);
  font-size: 9px; letter-spacing: .2em; text-transform: uppercase;
  color: var(--accent); margin-top: 1px;
}

.topbar-divider { width:1px; height:28px; background:var(--border); flex-shrink:0; }

/* live dot */
.live-dot {
  display:inline-flex; align-items:center; gap:5px;
  font-family:var(--font-mono); font-size:9px; letter-spacing:.1em;
  color:var(--accent-green); text-transform:uppercase; white-space:nowrap;
}
.live-dot::before {
  content:''; width:6px; height:6px; border-radius:50%;
  background:var(--accent-green); box-shadow:0 0 6px var(--accent-green);
  animation:pulse 1.8s ease infinite;
}
@keyframes pulse {
  0%,100%{opacity:1;transform:scale(1);}
  50%{opacity:.4;transform:scale(.7);}
}

/* search groups */
.search-row { display:flex; gap:6px; align-items:center; flex-wrap:nowrap; }

.search-group {
  display:flex; align-items:stretch;
  background:var(--bg-input); border:1px solid var(--border);
  border-radius:var(--radius-md); overflow:hidden;
  transition:border-color var(--transition);
}
.search-group:focus-within { border-color:var(--accent); box-shadow:0 0 0 2px var(--accent-glow); }

.search-label {
  font-family:var(--font-mono); font-size:9px; font-weight:600;
  letter-spacing:.1em; text-transform:uppercase;
  color:var(--accent); padding:0 8px;
  background:var(--accent-glow); border-right:1px solid var(--border);
  display:flex; align-items:center; white-space:nowrap;
}

.search-group input {
  background:transparent; border:none; outline:none;
  color:var(--text-primary); font-family:var(--font-mono);
  font-size:12px; font-weight:500;
  padding:7px 10px; width:160px; letter-spacing:.04em;
}
.search-group input::placeholder { color:var(--text-muted); font-weight:300; }

.search-group button {
  background:var(--accent); border:none; color:#fff;
  font-family:var(--font-mono); font-size:10px; font-weight:600;
  letter-spacing:.08em; text-transform:uppercase;
  padding:0 12px; cursor:pointer;
  transition:background var(--transition); white-space:nowrap;
}
.search-group button:hover { background:var(--accent-bright); }

/* exchange hint badge */
.exchange-hint {
  font-family:var(--font-mono); font-size:9px; font-weight:600;
  letter-spacing:.1em; text-transform:uppercase;
  color:var(--accent-green); padding:2px 7px;
  background:#00d4a011; border:1px solid #00d4a033;
  border-radius:3px; white-space:nowrap;
  transition:all var(--transition);
}

/* checklist */
.checklist-title {
  font-family:var(--font-mono); font-size:9px; font-weight:600;
  letter-spacing:.15em; text-transform:uppercase;
  color:var(--text-muted); white-space:nowrap; flex-shrink:0;
}
.checklist { display:flex; flex-wrap:wrap; gap:4px; align-items:center; }

.checklist label {
  display:flex; align-items:center; gap:5px;
  font-family:var(--font-mono); font-size:10px; font-weight:500;
  letter-spacing:.06em; text-transform:uppercase;
  color:var(--text-secondary);
  padding:4px 8px; border:1px solid var(--border);
  border-radius:var(--radius-sm); cursor:pointer;
  transition:all var(--transition); user-select:none; white-space:nowrap;
}
.checklist label:hover { border-color:var(--accent); color:var(--text-primary); background:var(--accent-glow); }

.checklist input[type="checkbox"] {
  appearance:none; width:10px; height:10px;
  border:1px solid var(--text-muted); border-radius:2px;
  background:transparent; cursor:pointer; flex-shrink:0;
  transition:all var(--transition); position:relative;
}
.checklist input[type="checkbox"]:checked { background:var(--accent); border-color:var(--accent); }
.checklist input[type="checkbox"]:checked::after {
  content:'✓'; position:absolute; top:-1px; left:1px;
  font-size:8px; color:white; font-weight:700;
}

/* ─── CANVAS ─────────────────────────────────────────────────────── */
/* Free-positioning canvas — panels are absolute children */
#dashboardCanvas {
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
  /* overflow-x clip keeps panels from causing horizontal scrollbar;
     overflow-y visible lets panels resize/drag below the fold */
  overflow: visible;
  /* Use clip on x via wrapper trick */
  clip-path: none;
}

/* ─── PANELS (absolute, free-position) ──────────────────────────── */
.panel {
  position: absolute;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  display: flex; flex-direction: column;
  overflow: hidden;
  min-width: 160px; min-height: 80px;
  transition: border-color var(--transition), box-shadow var(--transition);
  animation: fadeIn .3s ease both;
}

.panel:hover { border-color: var(--border-bright); }

.panel.dragging {
  border-color: var(--accent) !important;
  box-shadow: 0 8px 32px rgba(26,107,255,.25), 0 2px 8px rgba(0,0,0,.5);
  opacity: .95;
  cursor: grabbing !important;
}

.panel.resizing {
  border-color: var(--accent-green) !important;
  box-shadow: 0 0 0 1px var(--accent-green);
  user-select: none;
}

/* shimmer top edge */
.panel::before {
  content:''; position:absolute; top:0; left:0; right:0; height:1px;
  background:linear-gradient(90deg,transparent,var(--border-bright),transparent);
  pointer-events:none; z-index:1;
}

@keyframes fadeIn {
  from{opacity:0;transform:scale(.97);}
  to{opacity:1;transform:scale(1);}
}

.panel.hidden { display:none !important; }

/* ─── PANEL HEADER (drag zone) ───────────────────────────────────── */
.panel-head {
  flex: 0 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface);
  cursor: grab;
  user-select: none;
  position: relative;
  z-index: 2;
}

.panel-head:active { cursor: grabbing; }

/* drag grip dots */
.drag-grip {
  display: flex; align-items: center; gap: 2px;
  margin-right: 4px; opacity: .35;
  transition: opacity var(--transition);
}
.panel-head:hover .drag-grip { opacity: .7; }

.drag-grip span {
  display: block; width: 3px; height: 3px;
  border-radius: 50%; background: var(--text-secondary);
}

.panel-head h3 {
  font-family: var(--font-mono);
  font-size: 10px; font-weight: 600;
  letter-spacing: .14em; text-transform: uppercase;
  color: var(--text-secondary); white-space: nowrap;
  flex: 1;
}

.panel-title-row { display:flex; flex-direction:column; gap:2px; flex:1; }

.mode-label {
  font-family:var(--font-mono); font-size:9px;
  letter-spacing:.08em; color:var(--text-muted);
}

/* ─── PANEL ACTIONS ──────────────────────────────────────────────── */
.panel-actions {
  display: flex; gap: 4px; align-items: center;
  flex-wrap: nowrap; flex-shrink: 0;
}

/* generic icon button in header */
.icon-btn {
  width: 22px; height: 22px;
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: transparent; color: var(--text-secondary);
  font-size: 11px; line-height:1; cursor: pointer;
  transition: all var(--transition);
  display: flex; align-items: center; justify-content: center;
  padding: 0; flex-shrink: 0;
}
.icon-btn:hover {
  border-color: var(--accent); color: var(--accent-bright);
  background: var(--accent-glow);
}
.icon-btn.close:hover { border-color:var(--accent-red); color:var(--accent-red); background:#ff475711; }

.mini-input {
  background:var(--bg-input); border:1px solid var(--border);
  border-radius:var(--radius-sm); color:var(--text-primary);
  font-family:var(--font-mono); font-size:11px;
  padding:4px 8px; outline:none; width:90px;
  transition:border-color var(--transition); letter-spacing:.04em;
}
.mini-input:focus { border-color:var(--accent); }

/* ─── PANEL CONTENT ──────────────────────────────────────────────── */
.panel-content {
  flex: 1 1 auto; min-height: 0;
  overflow-y: auto; overflow-x: hidden;
  padding: 10px 12px;
}

.chart-content { padding: 0; overflow: hidden; }

/* ─── RESIZE HANDLES ─────────────────────────────────────────────── */
/* 8 handles: 4 corners + 4 edges */
.resize-handle {
  position: absolute;
  z-index: 10;
}

/* corners */
.resize-handle[data-dir="nw"] { top:0;   left:0;   width:12px; height:12px; cursor:nw-resize; }
.resize-handle[data-dir="ne"] { top:0;   right:0;  width:12px; height:12px; cursor:ne-resize; }
.resize-handle[data-dir="sw"] { bottom:0;left:0;   width:12px; height:12px; cursor:sw-resize; }
.resize-handle[data-dir="se"] { bottom:0;right:0;  width:12px; height:12px; cursor:se-resize; }

/* edges */
.resize-handle[data-dir="n"]  { top:0;    left:12px; right:12px; height:6px; cursor:n-resize; }
.resize-handle[data-dir="s"]  { bottom:0; left:12px; right:12px; height:6px; cursor:s-resize; }
.resize-handle[data-dir="w"]  { left:0;   top:12px; bottom:12px; width:6px;  cursor:w-resize; }
.resize-handle[data-dir="e"]  { right:0;  top:12px; bottom:12px; width:6px;  cursor:e-resize; }

/* corner visual indicator (small triangle) */
.resize-handle[data-dir="se"]::after {
  content:'';
  position:absolute; bottom:3px; right:3px;
  width:6px; height:6px;
  border-right:2px solid var(--text-muted);
  border-bottom:2px solid var(--text-muted);
  opacity:.35; border-radius:1px;
  transition:opacity var(--transition);
}
.panel:hover .resize-handle[data-dir="se"]::after { opacity:.7; }

/* ─── SIZE DISPLAY TOOLTIP (shows WxH while resizing) ───────────── */
.size-tooltip {
  position: absolute;
  top: 36px; left: 50%; transform: translateX(-50%);
  background: var(--accent); color: white;
  font-family: var(--font-mono); font-size: 10px; font-weight: 600;
  padding: 3px 8px; border-radius: 4px;
  pointer-events: none;
  opacity: 0; transition: opacity .15s;
  white-space: nowrap; z-index: 20;
}
.panel.resizing .size-tooltip { opacity: 1; }

/* ─── METRICS ────────────────────────────────────────────────────── */
.metric {
  display:flex; justify-content:space-between; align-items:baseline;
  gap:10px; padding:6px 0; border-bottom:1px solid var(--border);
}
.metric:last-child { border-bottom:none; }
.metric span:first-child {
  font-family:var(--font-mono); font-size:10px; font-weight:400;
  letter-spacing:.08em; text-transform:uppercase;
  color:var(--text-muted); white-space:nowrap;
}
.metric span:last-child {
  font-family:var(--font-mono); font-size:12px; font-weight:500;
  color:var(--text-primary); text-align:right; word-break:break-word;
}
.metric-up   span:last-child { color:var(--accent-green); }
.metric-down span:last-child { color:var(--accent-red); }

/* ─── NEWS ───────────────────────────────────────────────────────── */
/* ══════════════════════════════════════════════════════════════════
   NEWS CARDS — compact template, expand on click
   ══════════════════════════════════════════════════════════════════ */
.news-list { display:flex; flex-direction:column; gap:4px; }

/* ── Card shell ───────────────────────────────────────────────────── */
.news-item {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: border-color var(--transition), background var(--transition);
  cursor: pointer;
}
.news-item:hover          { border-color: var(--border-bright); background: var(--bg-hover); }
.news-item.ni-open        { border-color: var(--accent); }

/* ── Collapsed row (always visible) ──────────────────────────────── */
.ni-row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: start;
  gap: 6px;
  padding: 7px 10px;
}
.ni-left  { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.ni-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }

/* Headline */
.ni-headline {
  font-family: var(--font-sans);
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-primary);
  line-height: 1.35;
  /* clamp to 2 lines when collapsed */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ni-open .ni-headline {
  -webkit-line-clamp: unset;
  overflow: visible;
}

/* Meta row: source · date */
.ni-meta {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: .08em;
  color: var(--text-muted);
  white-space: nowrap;
}

/* Sentiment badge */
.ni-sent {
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: .08em;
  padding: 1px 6px;
  border-radius: 3px;
  border: 1px solid;
  white-space: nowrap;
}
.ni-sent-bull { color: var(--accent-green); border-color: rgba(0,200,100,.3); background: rgba(0,200,100,.08); }
.ni-sent-bear { color: #ff4757; border-color: rgba(255,71,87,.3); background: rgba(255,71,87,.08); }
.ni-sent-neut { color: var(--text-muted); border-color: var(--border); }

/* Expand chevron */
.ni-chevron {
  font-size: 9px;
  color: var(--text-muted);
  margin-top: 1px;
  transition: transform .2s;
  user-select: none;
}
.ni-open .ni-chevron { transform: rotate(180deg); color: var(--accent); }

/* ── Expanded drawer ──────────────────────────────────────────────── */
.ni-drawer {
  display: none;
  padding: 0 10px 10px;
  border-top: 1px solid var(--border);
  margin-top: 0;
}
.ni-open .ni-drawer { display: block; }

.ni-summary {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 8px 0 10px;
}
.ni-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .07em;
  color: var(--accent);
  text-decoration: none;
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  padding: 4px 10px;
  transition: all var(--transition);
}
.ni-link:hover { background: var(--accent-glow); color: var(--accent-bright); border-color: var(--accent-bright); }

/* Legacy selectors (eodhd/apitube still write these) */
.news-meta {
  margin-top:3px; font-family:var(--font-mono); font-size:9px;
  font-weight:600; letter-spacing:.1em; text-transform:uppercase;
  color:var(--accent);
}
.news-summary { margin-top:3px; font-size:11px; color:var(--text-muted); line-height:1.4; }

/* ── Thumbnail ────────────────────────────────────────────────────── */
.ni-thumb {
  width: 54px; height: 44px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--border);
  align-self: center;
}
.ni-thumb img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
/* when thumb present, ni-row needs flex not grid */
.ni-row.has-thumb {
  display: flex; align-items: center; gap: 8px;
}
.ni-row.has-thumb .ni-left { flex: 1; min-width: 0; }

/* ── Meta sub-elements ────────────────────────────────────────────── */
.ni-source { color: var(--accent); font-weight: 700; }
.ni-dot    { color: var(--text-muted); margin: 0 2px; }
.ni-time   { color: var(--text-muted); }
.ni-cat {
  display: inline-block;
  margin-left: 4px;
  font-family: var(--font-mono); font-size: 8px; font-weight: 700;
  letter-spacing: .06em; text-transform: uppercase;
  padding: 1px 5px; border-radius: 2px;
  color: var(--accent-yellow, #ffa500);
  border: 1px solid rgba(255,165,0,.25);
  background: rgba(255,165,0,.06);
}

/* ── Provider badge in feed header ───────────────────────────────── */
.ni-feed-badge { display: flex; align-items: center; gap: 6px; }
.ni-prov-tag {
  font-family: var(--font-mono); font-size: 8px; font-weight: 800;
  letter-spacing: .08em; padding: 1px 6px; border-radius: 3px; border: 1px solid;
}
.ni-badge-fh  { color: var(--accent); border-color: rgba(26,107,255,.4); background: rgba(26,107,255,.08); }
.ni-badge-av  { color: #ffa500; border-color: rgba(255,165,0,.4); background: rgba(255,165,0,.08); }
.ni-badge-eod { color: var(--accent-green); border-color: rgba(0,200,100,.3); background: rgba(0,200,100,.06); }

/* ── Source links (no-API-key shortcuts) ─────────────────────────── */
.ni-sources-wrap {
  margin-top: 8px;
  padding: 8px 10px;
  border-top: 1px solid var(--border);
}
.ni-sources-label {
  font-family: var(--font-mono); font-size: 9px; color: var(--text-muted);
  letter-spacing: .06em; margin-bottom: 6px;
}
.ni-sources-list {
  display: flex; flex-wrap: wrap; gap: 5px;
}
.ni-src-btn {
  font-family: var(--font-mono); font-size: 9px; font-weight: 700;
  letter-spacing: .05em;
  color: var(--text-secondary);
  text-decoration: none;
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  transition: all var(--transition);
  white-space: nowrap;
}
.ni-src-btn:hover {
  color: var(--accent-bright);
  border-color: var(--accent);
  background: var(--accent-glow);
}

/* ─── TEXTAREA ───────────────────────────────────────────────────── */
textarea {
  width:100%; height:100%; resize:none; border:none; outline:none;
  background:transparent; color:var(--text-primary);
  font-family:var(--font-mono); font-size:12px; font-weight:300;
  line-height:1.6; letter-spacing:.02em;
}
textarea::placeholder { color:var(--text-muted); }

/* ─── FOREX EXTRAS ───────────────────────────────────────────────── */
.forex-topbar {
  display:flex; gap:4px; padding:5px 10px;
  border-bottom:1px solid var(--border); background:var(--bg-surface);
  flex-shrink:0;
}
.fx-tf-btn {
  padding:3px 9px; border:1px solid var(--border); border-radius:var(--radius-sm);
  background:transparent; color:var(--text-secondary);
  font-family:var(--font-mono); font-size:10px; font-weight:600;
  letter-spacing:.06em; cursor:pointer; transition:all var(--transition);
}
.fx-tf-btn:hover,.fx-tf-btn.active { background:var(--accent); border-color:var(--accent); color:white; }

.forex-summary { padding:0 10px; border-bottom:1px solid var(--border); background:var(--bg-surface); flex-shrink:0; }
.forex-summary .metric { padding:4px 0; }

/* ─── SNAP GRID OVERLAY (shown while dragging) ───────────────────── */
#snapOverlay {
  position:absolute; inset:0; pointer-events:none;
  opacity:0; transition:opacity .2s; z-index:0;
  background-image:
    linear-gradient(var(--border) 1px, transparent 1px),
    linear-gradient(90deg, var(--border) 1px, transparent 1px);
  background-size: 40px 40px;
}
#snapOverlay.visible { opacity:1; }

/* ─── PANEL ANIMATIONS ───────────────────────────────────────────── */
.panel { animation-delay: calc(var(--i,0) * 45ms); }
#panel-chart        { --i:0; }
#panel-forex        { --i:1; }
#panel-fundamentals { --i:2; }
#panel-news         { --i:3; }
#panel-quote        { --i:4; }
#panel-analysts     { --i:5; }
#panel-ownership    { --i:6; }
#panel-comparables  { --i:7; }
#panel-notes        { --i:8; }

/* ══════════════════════════════════════════════════════════════════
   TAB SYSTEM
   ══════════════════════════════════════════════════════════════════ */
.tab-bar {
  display: flex;
  gap: 2px;
  padding: 5px 10px 0;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.tab-btn {
  font-family: var(--font-mono);
  font-size: 9px; font-weight: 700;
  letter-spacing: .12em; text-transform: uppercase;
  padding: 4px 10px 5px;
  background: transparent;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition);
}
.tab-btn:hover { color: var(--text-primary); background: var(--bg-hover); }
.tab-btn.active {
  background: var(--bg-panel);
  border-color: var(--border);
  color: var(--accent-bright);
  margin-bottom: -1px;
}

.tab-pane { display: none; }
.tab-pane.active {
  display: flex; flex-direction: column;
  flex: 1 1 auto; min-height: 0;
  overflow-y: auto; overflow-x: hidden;
}

/* Geo·Risk tab panes — direct scroll on the pane itself */
#geo-wars,
#geo-resources,
#geo-routes,
#geo-intel,
#geo-signals,
#geo-quakes {
  overflow-y: auto !important;
  overflow-x: hidden;
  flex: 1 1 auto;
  min-height: 0;
  padding: 10px 12px;
}

/* The inner content divs must NOT constrain height */
#georisk-wars-content,
#georisk-resources-content,
#georisk-routes-content {
  display: block;
  min-height: 0;
  height: auto;
}

/* ══════════════════════════════════════════════════════════════════
   FINANCIAL TABLES
   ══════════════════════════════════════════════════════════════════ */
.fin-table-wrap {
  overflow-x: auto;
  margin-bottom: 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.fin-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 11px;
  white-space: nowrap;
}

.fin-table thead tr {
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
}

.fin-table th {
  padding: 6px 10px;
  text-align: right;
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--text-muted);
  font-size: 9px;
}
.fin-table th:first-child { text-align: left; }

.fin-table td {
  padding: 5px 10px;
  text-align: right;
  border-bottom: 1px solid var(--border);
  color: var(--text-primary);
}
.fin-table td:first-child { text-align: left; color: var(--text-secondary); }
.fin-table tbody tr:last-child td { border-bottom: none; }
.fin-table tbody tr:hover { background: var(--bg-hover); }

.fin-table .pos { color: var(--accent-green); }
.fin-table .neg { color: var(--accent-red); }
.fin-table .accent { color: var(--accent-bright); }
.fin-table .neutral { color: var(--accent-yellow); }

.current-row { background: var(--accent-glow) !important; }
.current-row td { font-weight: 600; }

.ts-table td:nth-child(2) { font-weight: 600; }

/* ── Section headings ── */
.section-head {
  font-family: var(--font-mono);
  font-size: 9px; font-weight: 700;
  letter-spacing: .14em; text-transform: uppercase;
  color: var(--accent);
  padding: 10px 0 5px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 6px;
}
.section-head:first-child { padding-top: 2px; }

/* ── Description text ── */
.desc-block {
  margin-top: 12px;
  font-size: 12px;
  line-height: 1.65;
  color: var(--text-secondary);
  padding: 10px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

/* ── No data placeholder ── */
.no-data {
  font-family: var(--font-mono);
  font-size: 11px; line-height: 1.8;
  color: var(--text-muted);
  padding: 16px;
}
.no-data strong { color: var(--accent); }

/* ── WACC result highlight ── */
.wacc-result span:first-child { color: var(--accent-bright); font-weight: 700; }
.wacc-result span:last-child  { color: var(--accent-green);  font-size: 16px; font-weight: 700; }

/* ══════════════════════════════════════════════════════════════════
   CONSENSUS BAR (ANR)
   ══════════════════════════════════════════════════════════════════ */
.consensus-bar {
  display: flex;
  height: 28px;
  border-radius: var(--radius-md);
  overflow: hidden;
  margin-bottom: 10px;
  gap: 2px;
}
.cb-seg {
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-mono); font-size: 10px; font-weight: 700;
  letter-spacing: .06em; color: white; min-width: 30px;
  transition: all var(--transition);
}
.cb-seg.buy  { background: var(--accent-green); }
.cb-seg.hold { background: var(--accent-yellow); color: #000; }
.cb-seg.sell { background: var(--accent-red); }

/* ══════════════════════════════════════════════════════════════════
   EVENTS (EVTS)
   ══════════════════════════════════════════════════════════════════ */
.event-item {
  display: flex; gap: 10px; align-items: flex-start;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.event-item:last-child { border-bottom: none; }
.event-date {
  font-family: var(--font-mono); font-size: 10px; font-weight: 600;
  color: var(--text-muted); white-space: nowrap; flex-shrink: 0;
  padding-top: 2px; width: 80px;
}
.event-type {
  font-family: var(--font-mono); font-size: 9px; font-weight: 700;
  letter-spacing: .1em; text-transform: uppercase;
}
.event-title { font-size: 12px; font-weight: 500; color: var(--text-primary); margin-top: 2px; }
.event-note  { font-size: 11px; color: var(--text-muted); margin-top: 2px; line-height: 1.4; }

/* ══════════════════════════════════════════════════════════════════
   RESEARCH (BRC)
   ══════════════════════════════════════════════════════════════════ */
.research-item {
  padding: 10px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-left: 2px solid var(--accent);
  border-radius: var(--radius-md);
  margin-bottom: 7px;
  transition: all var(--transition);
}
.research-item:hover { border-left-color: var(--accent-bright); background: var(--bg-hover); }
.research-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 4px;
}
.research-firm {
  font-family: var(--font-mono); font-size: 9px; font-weight: 700;
  letter-spacing: .1em; text-transform: uppercase; color: var(--accent);
}
.research-date { font-family: var(--font-mono); font-size: 9px; color: var(--text-muted); }
.research-title { font-size: 12px; font-weight: 500; color: var(--text-primary); line-height: 1.35; }
.research-meta  { margin-top: 3px; font-size: 10px; color: var(--text-muted); }

.bi-note {
  font-size: 11px; color: var(--text-muted); line-height: 1.6;
  padding: 8px 10px; background: var(--bg-surface);
  border: 1px solid var(--border); border-radius: var(--radius-md);
  margin-bottom: 10px;
}

/* ══════════════════════════════════════════════════════════════════
   MGMT CARDS
   ══════════════════════════════════════════════════════════════════ */
.mgmt-card {
  display: flex; gap: 10px; align-items: center;
  padding: 8px 0; border-bottom: 1px solid var(--border);
}
.mgmt-card:last-child { border-bottom: none; }
.mgmt-avatar {
  width: 34px; height: 34px;
  background: var(--accent-glow);
  border: 1px solid var(--border-accent);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-mono); font-size: 11px; font-weight: 700;
  color: var(--accent-bright); flex-shrink: 0;
}
.mgmt-name { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.mgmt-role { font-size: 11px; color: var(--text-secondary); margin-top: 1px; }
.mgmt-meta { font-family: var(--font-mono); font-size: 9px; color: var(--text-muted); margin-top: 2px; }

/* ══════════════════════════════════════════════════════════════════
   QUOTE GRID
   ══════════════════════════════════════════════════════════════════ */
.quote-grid { margin-bottom: 8px; }


/* ══════════════════════════════════════════════════════════════════
   SECTOR WATCHLIST
   ══════════════════════════════════════════════════════════════════ */
.wl-sortbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.wl-sort-label {
  font-family: var(--font-mono);
  font-size: 9px; letter-spacing: .1em; text-transform: uppercase;
  color: var(--text-muted); margin-right: 4px;
}
.wl-sort-btn {
  font-family: var(--font-mono);
  font-size: 9px; font-weight: 700;
  letter-spacing: .08em; text-transform: uppercase;
  padding: 3px 8px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition);
}
.wl-sort-btn:hover { color: var(--text-primary); border-color: var(--accent); }
.wl-sort-btn.active { background: var(--accent-glow); color: var(--accent-bright); border-color: var(--accent); }
.wl-count {
  margin-left: auto;
  font-family: var(--font-mono); font-size: 9px;
  color: var(--text-muted); letter-spacing: .06em;
}

.wl-content { padding: 0 !important; }

.wl-header-row {
  display: grid;
  grid-template-columns: 1fr 68px 56px 62px 36px;
  padding: 5px 10px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  font-family: var(--font-mono);
  font-size: 9px; font-weight: 700;
  letter-spacing: .1em; text-transform: uppercase;
  color: var(--text-muted);
  flex-shrink: 0;
}
.wl-header-row span { text-align: right; }
.wl-header-row span:first-child { text-align: left; }

.wl-row {
  display: grid;
  grid-template-columns: 1fr 68px 56px 62px 36px;
  align-items: center;
  padding: 7px 10px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background var(--transition);
  gap: 0;
}
.wl-row:last-child { border-bottom: none; }
.wl-row:hover {
  background: var(--bg-hover);
}
.wl-row:hover .wl-ticker { color: var(--accent-bright); }

.wl-stock-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.wl-ticker {
  font-family: var(--font-mono); font-size: 12px; font-weight: 700;
  color: var(--accent); letter-spacing: .04em;
  transition: color var(--transition);
}
.wl-name {
  font-size: 11px; color: var(--text-secondary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.wl-sector-tag {
  font-family: var(--font-mono); font-size: 9px;
  color: var(--text-muted); letter-spacing: .06em;
}

.wl-price {
  font-family: var(--font-mono); font-size: 12px; font-weight: 600;
  color: var(--text-primary); text-align: right;
}
.wl-chg {
  font-family: var(--font-mono); font-size: 11px; font-weight: 600;
  text-align: right;
}
.wl-pos { color: var(--accent-green); }
.wl-neg { color: var(--accent-red); }
.wl-mcap {
  font-family: var(--font-mono); font-size: 10px;
  color: var(--text-muted); text-align: right;
}
.wl-pe {
  font-family: var(--font-mono); font-size: 10px;
  color: var(--text-secondary); text-align: right;
}

/* ══════════════════════════════════════════════════════════════════
   VALUATION ANALYZER
   ══════════════════════════════════════════════════════════════════ */
.val-method-select {
  font-family: var(--font-mono);
  font-size: 10px; font-weight: 600; letter-spacing: .06em;
  background: var(--bg-surface); color: var(--text-primary);
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  padding: 3px 6px; cursor: pointer; outline: none;
  transition: border-color var(--transition);
}
.val-method-select:hover, .val-method-select:focus { border-color: var(--accent); }

/* Stock header */
.val-stock-header {
  display: flex; justify-content: space-between; align-items: flex-start;
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.val-ticker {
  font-family: var(--font-mono); font-size: 18px; font-weight: 800;
  color: var(--accent-bright); letter-spacing: .05em;
  line-height: 1;
}
.val-full-name {
  display: block;
  font-size: 11px; color: var(--text-secondary); margin-top: 3px;
}
.val-price-block { text-align: right; }
.val-current-price {
  display: block;
  font-family: var(--font-mono); font-size: 20px; font-weight: 800;
  color: var(--text-primary); line-height: 1;
}
.val-sector {
  display: block;
  font-family: var(--font-mono); font-size: 9px; letter-spacing: .1em;
  text-transform: uppercase; color: var(--text-muted); margin-top: 4px;
}

/* Verdict block */
.verdict-block {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px;
  margin: 0;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.verdict-under { background: rgba(0, 212, 160, 0.08); border-left: 3px solid var(--accent-green); }
.verdict-over  { background: rgba(255, 71,  87, 0.08); border-left: 3px solid var(--accent-red); }
.verdict-fair  { background: rgba(255,196,  0, 0.06); border-left: 3px solid var(--accent-yellow); }
.verdict-icon {
  font-size: 24px; font-weight: 900; line-height: 1;
  flex-shrink: 0;
}
.verdict-under .verdict-icon { color: var(--accent-green); }
.verdict-over  .verdict-icon { color: var(--accent-red); }
.verdict-fair  .verdict-icon { color: var(--accent-yellow); }
.verdict-text {
  font-family: var(--font-mono); font-size: 16px; font-weight: 800;
  letter-spacing: .12em; text-transform: uppercase;
}
.verdict-under .verdict-text { color: var(--accent-green); }
.verdict-over  .verdict-text { color: var(--accent-red); }
.verdict-fair  .verdict-text { color: var(--accent-yellow); }
.verdict-sub {
  font-family: var(--font-mono); font-size: 9px;
  color: var(--text-muted); margin-top: 3px; letter-spacing: .06em;
}

/* Gauge bar */
.val-gauge {
  padding: 10px 14px 6px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
}
.gauge-track {
  position: relative;
  height: 8px; border-radius: 4px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  overflow: visible;
}
.gauge-fill {
  height: 100%; border-radius: 4px;
  transition: width .6s cubic-bezier(.4,0,.2,1), background .4s;
  position: relative;
}
.gauge-center-line {
  position: absolute;
  left: 50%; top: -3px;
  width: 2px; height: 14px;
  background: var(--border-accent);
  transform: translateX(-50%);
}
.gauge-labels {
  display: flex; justify-content: space-between;
  margin-top: 4px;
  font-family: var(--font-mono); font-size: 8px;
  letter-spacing: .08em; text-transform: uppercase;
  color: var(--text-muted);
}

/* Metric rows */
.val-metrics {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 6px 0;
}
.val-metric-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  border-left: 3px solid transparent;
  transition: background var(--transition);
}
.val-metric-row:last-child { border-bottom: none; }
.val-metric-row:hover { background: var(--bg-hover); }

.val-cheap { border-left-color: var(--accent-green); }
.val-rich  { border-left-color: var(--accent-red); }
.val-fair  { border-left-color: var(--border); }

.val-metric-left { flex: 1; min-width: 0; }
.val-metric-name {
  font-family: var(--font-mono); font-size: 11px; font-weight: 700;
  color: var(--text-primary); letter-spacing: .04em;
  display: block;
}
.val-metric-note {
  font-size: 11px; color: var(--text-secondary);
  line-height: 1.4; display: block; margin-top: 2px;
}
.val-benchmark {
  font-family: var(--font-mono); font-size: 9px;
  color: var(--text-muted); display: block; margin-top: 3px;
}
.val-metric-right {
  display: flex; flex-direction: column; align-items: flex-end;
  gap: 4px; flex-shrink: 0; padding-left: 10px;
}
.val-metric-value {
  font-family: var(--font-mono); font-size: 14px; font-weight: 700;
  color: var(--text-primary);
}
.val-signal {
  font-family: var(--font-mono); font-size: 9px; font-weight: 800;
  letter-spacing: .12em; text-transform: uppercase;
  padding: 2px 6px; border-radius: 3px;
}
.val-cheap .val-signal { background: rgba(0,212,160,.15); color: var(--accent-green); }
.val-rich  .val-signal { background: rgba(255,71,87,.15);  color: var(--accent-red); }
.val-fair  .val-signal { background: rgba(255,255,255,.05);color: var(--text-muted); }

.val-disclaimer {
  padding: 8px 14px;
  font-family: var(--font-mono); font-size: 9px;
  color: var(--text-muted); letter-spacing: .04em;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

/* Panel animation for new panels */
#panel-watchlist  { --i:9; }
#panel-valuation  { --i:10; }

/* ── Watchlist chart-link button ─────────────────────────────────── */
.wl-header-row { grid-template-columns: 1fr 68px 56px 62px 36px 28px; }
.wl-row        { grid-template-columns: 1fr 68px 56px 62px 36px 28px; }

.wl-chart-btn {
  display: flex; align-items: center; justify-content: center;
  width: 22px; height: 22px;
  background: var(--accent-glow);
  border: 1px solid var(--border-accent);
  border-radius: var(--radius-sm);
  color: var(--accent);
  font-size: 9px; cursor: pointer;
  transition: all var(--transition);
  flex-shrink: 0;
  justify-self: center;
}
.wl-chart-btn:hover {
  background: var(--accent);
  color: var(--bg-base);
  border-color: var(--accent-bright);
  transform: scale(1.15);
}

/* ── Valuation "View Chart" button ───────────────────────────────── */
.val-chart-link-btn {
  display: inline-flex; align-items: center; gap: 4px;
  margin-top: 6px;
  padding: 4px 10px;
  background: var(--accent-glow);
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 9px; font-weight: 700;
  letter-spacing: .1em; text-transform: uppercase;
  color: var(--accent-bright);
  cursor: pointer;
  transition: all var(--transition);
}
.val-chart-link-btn:hover {
  background: var(--accent);
  color: var(--bg-base);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(26,107,255,.35);
}

/* ── Chart flash animation (on load from watchlist) ──────────────── */
@keyframes chartFlash {
  0%   { box-shadow: 0 0 0 0 rgba(26,107,255,0); }
  30%  { box-shadow: 0 0 0 4px rgba(26,107,255,.6), inset 0 0 20px rgba(26,107,255,.12); }
  100% { box-shadow: 0 0 0 0 rgba(26,107,255,0); }
}
.chart-flash {
  animation: chartFlash .8s ease-out forwards !important;
}

/* ── Compact Forex header ────────────────────────────────────────── */
.panel-head-forex {
  gap: 6px;
}
.forex-tf-inline {
  display: flex;
  gap: 2px;
  align-items: center;
  flex-shrink: 0;
}
/* reuse fx-tf-btn but slightly smaller in inline context */
.forex-tf-inline .fx-tf-btn {
  padding: 2px 6px;
  font-size: 9px;
}
.forex-pair-badge {
  font-family: var(--font-mono);
  font-size: 10px; font-weight: 700;
  letter-spacing: .06em;
  color: var(--accent-bright);
  background: var(--accent-glow);
  border: 1px solid var(--border-accent);
  border-radius: var(--radius-sm);
  padding: 2px 7px;
  white-space: nowrap;
}
.forex-mini {
  width: 72px !important;
}

/* ══════════════════════════════════════════════════════════════════
   ALPHA VANTAGE UI — Status badge, toast, live badges, spinner
   ══════════════════════════════════════════════════════════════════ */

/* ── API status badge (topbar) ───────────────────────────────────── */
.api-status {
  display: flex; align-items: center; gap: 4px;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  font-family: var(--font-mono);
  font-size: 9px; font-weight: 700;
  letter-spacing: .08em;
  cursor: default; white-space: nowrap;
  transition: all var(--transition);
  flex-shrink: 0;
}
.api-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.api-ok   { color: var(--accent-green); border-color: rgba(0,212,160,.3); background: rgba(0,212,160,.07); }
.api-ok   .api-dot { background: var(--accent-green); box-shadow: 0 0 5px var(--accent-green); animation: pulse 2s infinite; }
.api-warn { color: var(--accent-yellow); border-color: rgba(255,196,0,.3); background: rgba(255,196,0,.07); }
.api-warn .api-dot { background: var(--accent-yellow); }
.api-limit{ color: var(--accent-red); border-color: rgba(255,71,87,.3); background: rgba(255,71,87,.07); }
.api-limit .api-dot { background: var(--accent-red); }

@keyframes pulse {
  0%,100% { opacity:1; } 50% { opacity:.4; }
}

/* ── Toast notification ──────────────────────────────────────────── */
.api-toast {
  position: fixed;
  bottom: 20px; right: 20px;
  z-index: 9999;
  font-family: var(--font-mono);
  font-size: 11px; font-weight: 500;
  padding: 9px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-surface);
  color: var(--text-primary);
  max-width: 380px;
  opacity: 0;
  transform: translateY(8px);
  transition: opacity .25s, transform .25s;
  pointer-events: none;
  backdrop-filter: blur(8px);
}
.api-toast.visible { opacity: 1; transform: translateY(0); }
.api-toast-ok    { border-left: 3px solid var(--accent-green);  color: var(--accent-green); }
.api-toast-warn  { border-left: 3px solid var(--accent-yellow); color: var(--accent-yellow); }
.api-toast-error { border-left: 3px solid var(--accent-red);    color: var(--accent-red); }
.api-toast-info  { border-left: 3px solid var(--accent);        color: var(--accent-bright); }

/* ── Live data badge (inside panels) ────────────────────────────── */
.av-live-badge {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-mono);
  font-size: 9px; font-weight: 700;
  letter-spacing: .1em; text-transform: uppercase;
  color: var(--accent-green);
  padding: 4px 0 8px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 6px;
  width: 100%;
}
.av-ts {
  font-weight: 400; color: var(--text-muted); letter-spacing: 0;
}

/* ── Loading spinner ─────────────────────────────────────────────── */
.av-loading {
  display: flex; align-items: center; gap: 10px;
  padding: 16px;
  font-family: var(--font-mono); font-size: 11px;
  color: var(--text-muted);
}
.av-spinner {
  width: 14px; height: 14px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin .7s linear infinite;
  flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Inline note (grey code comment style) ───────────────────────── */
.av-note {
  font-family: var(--font-mono); font-size: 10px;
  color: var(--text-muted); line-height: 1.7;
  padding: 8px 10px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  margin-top: 8px;
}

/* ── Real news items (with sentiment) ───────────────────────────── */
.av-news-item .news-meta-row {
  display: flex; align-items: center; gap: 8px; margin-top: 3px; flex-wrap: wrap;
}
.news-dt {
  font-family: var(--font-mono); font-size: 9px; color: var(--text-muted);
}
.news-sentiment {
  font-family: var(--font-mono); font-size: 9px; font-weight: 700;
  letter-spacing: .06em; text-transform: uppercase;
}

/* ══════════════════════════════════════════════════════════════════
   API CONFIG MODAL
   ══════════════════════════════════════════════════════════════════ */

/* ── ⚙ button in topbar ─────────────────────────────────────────── */
.api-config-btn {
  font-family: var(--font-mono);
  font-size: 9px; font-weight: 700;
  letter-spacing: .1em; text-transform: uppercase;
  padding: 4px 9px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition);
  flex-shrink: 0;
}
.api-config-btn:hover {
  border-color: var(--accent);
  color: var(--accent-bright);
  background: var(--accent-glow);
}

/* ── Unconfigured badge state ────────────────────────────────────── */
.api-unconfigured {
  color: var(--text-muted);
  border-color: var(--border);
  background: var(--bg-surface);
  cursor: pointer;
}
.api-unconfigured .api-dot {
  background: var(--text-muted);
  animation: none;
}
.api-status { cursor: pointer; }

/* ── API Sidebar ─────────────────────────────────────────────────── */
.api-sidebar {
  position: fixed;
  top: 0; right: 0; bottom: 0;
  width: 380px;
  max-width: 95vw;
  z-index: 10000;
  background: var(--bg-panel);
  border-left: 1px solid var(--border-bright);
  box-shadow: -8px 0 40px rgba(0,0,0,.6), -1px 0 0 rgba(26,107,255,.15);
  display: flex; flex-direction: column;
  transform: translateX(100%);
  transition: transform .28s cubic-bezier(.4,0,.2,1);
  overflow: hidden;
}
.api-sidebar.open { transform: translateX(0); }

/* shimmer left edge */
.api-sidebar::before {
  content: '';
  position: absolute; top: 0; left: 0; bottom: 0; width: 1px;
  background: linear-gradient(180deg, transparent, var(--accent), transparent);
  opacity: .5; pointer-events: none; z-index: 1;
}

/* ── Sidebar header ──────────────────────────────────────────────── */
.api-sidebar-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--bg-surface);
}
.api-sidebar-title {
  display: flex; align-items: center; gap: 8px;
  font-family: var(--font-mono); font-size: 13px; font-weight: 800;
  letter-spacing: .06em; color: var(--text-primary);
}
.api-sidebar-close {
  background: none; border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer; color: var(--text-muted);
  font-size: 12px; padding: 4px 8px;
  transition: all .15s; line-height: 1;
}
.api-sidebar-close:hover { color: var(--accent-red); border-color: var(--accent-red); background: rgba(255,71,87,.1); }

/* ── Sidebar body ────────────────────────────────────────────────── */
.api-sidebar-body {
  flex: 1 1 auto; display: flex; flex-direction: column; overflow: hidden;
}

/* ── Sidebar footer ──────────────────────────────────────────────── */
.api-sidebar-footer {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--bg-surface);
}

/* ── API config btn active state ─────────────────────────────────── */
.api-config-btn.active {
  background: var(--accent-glow) !important;
  border-color: var(--accent) !important;
  color: var(--accent-bright) !important;
}

/* ── Tab bar ─────────────────────────────────────────────────────── */
.api-tab-bar {
  display: flex; gap: 2px;
  padding: 8px 14px 0;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--bg-surface);
}
.api-tab {
  font-family: var(--font-mono); font-size: 10px; font-weight: 700;
  letter-spacing: .07em; text-transform: uppercase;
  padding: 5px 12px 7px;
  background: none; border: none; border-bottom: 2px solid transparent;
  color: var(--text-muted); cursor: pointer;
  transition: all .15s; margin-bottom: -1px;
}
.api-tab:hover  { color: var(--text-primary); }
.api-tab.active { color: var(--accent-bright); border-bottom-color: var(--accent); }

/* ── Tab panes ───────────────────────────────────────────────────── */
.api-tab-pane {
  display: none; overflow-y: auto; flex: 1 1 auto;
  padding: 14px 18px;
}
.api-tab-pane.active { display: block; }

/* ── Provider key block ──────────────────────────────────────────── */
.api-key-block { margin-bottom: 2px; }
.api-key-block-focus { animation: blockPulse .6s ease-out; }
@keyframes blockPulse {
  0%   { background: rgba(26,107,255,.12); }
  100% { background: transparent; }
}

.api-key-provider {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 5px;
}
.api-key-provider-left {
  display: flex; align-items: center; gap: 10px;
}
.api-key-badge-icon {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 36px; height: 22px; padding: 0 6px;
  background: var(--accent-glow);
  border: 1px solid var(--border-accent);
  border-radius: 4px;
  font-family: var(--font-mono); font-size: 10px; font-weight: 800;
  color: var(--accent-bright); letter-spacing: .06em;
  flex-shrink: 0;
}
.api-key-name {
  font-family: var(--font-mono); font-size: 12px; font-weight: 700;
  color: var(--text-primary);
}
.api-key-limit {
  font-family: var(--font-mono); font-size: 9px;
  color: var(--text-muted); letter-spacing: .05em; margin-top: 1px;
}
.api-key-badge {
  font-family: var(--font-mono); font-size: 10px; font-weight: 700;
  letter-spacing: .06em; padding: 3px 8px;
  border-radius: 4px; border: 1px solid transparent; white-space: nowrap;
}
.badge-set   { color: var(--accent-green); background: rgba(0,212,160,.1); border-color: rgba(0,212,160,.25); }
.badge-unset { color: var(--text-muted);   background: var(--bg-surface);  border-color: var(--border); }
.badge-limit { color: var(--accent-red);   background: rgba(255,71,87,.1); border-color: rgba(255,71,87,.25); }

.api-key-desc {
  font-size: 11px; color: var(--text-secondary);
  line-height: 1.5; margin-bottom: 8px;
}
.api-key-desc a { color: var(--accent); text-decoration: none; }
.api-key-desc a:hover { color: var(--accent-bright); text-decoration: underline; }

/* ── Key input row ───────────────────────────────────────────────── */
.api-key-input-row {
  display: flex; gap: 5px; align-items: center; width: 100%;
}
.api-key-field {
  flex: 1; min-width: 0;
  background: var(--bg-base); color: var(--text-primary);
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  font-family: var(--font-mono); font-size: 11px;
  padding: 7px 10px;
  outline: none; transition: border-color .15s;
}
.api-key-field:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-glow); }
.api-key-field::placeholder { color: var(--text-muted); }

.api-key-eye, .api-key-save, .api-key-clear {
  font-family: var(--font-mono); font-size: 10px; font-weight: 700;
  padding: 6px 10px; border-radius: var(--radius-sm);
  cursor: pointer; white-space: nowrap; flex-shrink: 0;
  transition: all .15s;
}
.api-key-eye   { background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-muted); }
.api-key-eye:hover { color: var(--text-primary); }
.api-key-save  { background: var(--accent-glow); border: 1px solid var(--accent); color: var(--accent-bright); }
.api-key-save:hover { background: var(--accent); color: var(--bg-base); }
.api-key-clear { background: transparent; border: 1px solid var(--border); color: var(--text-muted); }
.api-key-clear:hover { border-color: var(--accent-red); color: var(--accent-red); }

/* ── Status line ─────────────────────────────────────────────────── */
.api-key-status { font-family: var(--font-mono); font-size: 10px; min-height: 16px; margin-top: 4px; }
.status-ok    { color: var(--accent-green); }
.status-warn  { color: var(--accent-yellow); }
.status-error { color: var(--accent-red); }
.status-info  { color: var(--text-muted); }

/* ── Usage bar ───────────────────────────────────────────────────── */
.api-key-usage {
  font-family: var(--font-mono); font-size: 9px; color: var(--text-muted);
  margin-top: 5px; display: flex; align-items: center; gap: 8px;
}
.api-reset-count-btn {
  background: none; border: 1px solid var(--border); border-radius: 3px;
  font-family: var(--font-mono); font-size: 9px; color: var(--text-muted);
  padding: 1px 6px; cursor: pointer;
}
.api-reset-count-btn:hover { color: var(--accent); border-color: var(--accent); }

/* ── Divider ─────────────────────────────────────────────────────── */
.api-modal-divider { height: 1px; background: var(--border); margin: 12px 0; }

/* ── Custom provider form ────────────────────────────────────────── */
.api-custom-form { display: flex; flex-direction: column; gap: 10px; }
.api-custom-row  { display: flex; flex-direction: column; gap: 4px; }
.api-custom-row label {
  font-family: var(--font-mono); font-size: 9px; font-weight: 700;
  letter-spacing: .08em; text-transform: uppercase; color: var(--text-muted);
}
.api-custom-hint { font-weight: 400; text-transform: none; color: var(--text-muted); }
.api-custom-add-btn {
  align-self: flex-start;
  background: var(--accent-glow); border: 1px solid var(--accent);
  border-radius: var(--radius-sm); color: var(--accent-bright);
  font-family: var(--font-mono); font-size: 10px; font-weight: 700;
  padding: 6px 14px; cursor: pointer; letter-spacing: .06em;
  transition: all .15s;
}
.api-custom-add-btn:hover { background: var(--accent); color: var(--bg-base); }
.api-custom-saved-title {
  font-family: var(--font-mono); font-size: 9px; font-weight: 700;
  letter-spacing: .1em; text-transform: uppercase; color: var(--text-muted);
  margin-bottom: 8px;
}
.api-custom-empty {
  font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);
  line-height: 1.6; padding: 10px 0;
}
.api-custom-saved-row {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 0; border-bottom: 1px solid var(--border);
}
.api-custom-saved-row:last-child { border-bottom: none; }
.api-custom-saved-info { flex: 1; min-width: 0; }
.api-custom-saved-info strong { font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: var(--text-primary); display: block; }
.api-custom-saved-info span   { font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); }
.api-custom-edit-btn, .api-custom-del-btn {
  font-family: var(--font-mono); font-size: 9px; font-weight: 700;
  padding: 3px 8px; border-radius: 3px; cursor: pointer; flex-shrink: 0;
}
.api-custom-edit-btn { background: var(--accent-glow); border: 1px solid var(--accent); color: var(--accent); }
.api-custom-del-btn  { background: transparent; border: 1px solid var(--border); color: var(--text-muted); }
.api-custom-del-btn:hover { border-color: var(--accent-red); color: var(--accent-red); }

/* ── Session stats ───────────────────────────────────────────────── */
.api-session-stats { display: flex; flex-direction: column; gap: 4px; }
.api-stat-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 8px;
  background: var(--bg-surface); border-radius: var(--radius-sm);
  font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary);
}
.stat-ok   { color: var(--accent-green); font-weight: 700; }
.stat-warn { color: var(--accent-yellow); font-weight: 700; }
.stat-unset{ color: var(--text-muted); }
.api-clear-cache-btn {
  margin-top: 4px;
  background: transparent; border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text-muted);
  font-family: var(--font-mono); font-size: 10px; font-weight: 700;
  padding: 5px 12px; cursor: pointer; transition: all .15s;
}
.api-clear-cache-btn:hover { border-color: var(--accent-red); color: var(--accent-red); }

/* ── Footer ──────────────────────────────────────────────────────── */
.api-modal-footer {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--bg-surface);
}
.api-modal-note-inline {
  flex: 1; font-family: var(--font-mono); font-size: 9px;
  color: var(--text-muted); line-height: 1.5;
}
.api-modal-note-inline code { color: var(--accent); background: var(--accent-glow); padding: 1px 4px; border-radius: 3px; }
.api-modal-apply {
  background: var(--accent); border: none; border-radius: var(--radius-sm);
  color: var(--bg-base); font-family: var(--font-mono);
  font-size: 10px; font-weight: 800; letter-spacing: .06em;
  padding: 7px 16px; cursor: pointer; white-space: nowrap;
  transition: all .15s; flex-shrink: 0;
}
.api-modal-apply:hover { background: var(--accent-bright); box-shadow: 0 4px 14px rgba(26,107,255,.4); }
.api-modal-cancel {
  background: transparent; border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text-muted);
  font-family: var(--font-mono); font-size: 10px; font-weight: 700;
  padding: 7px 12px; cursor: pointer; flex-shrink: 0;
  transition: all .15s;
}
.api-modal-cancel:hover { color: var(--text-primary); border-color: var(--text-secondary); }

/* ── API badge pill (replaces api-key-badge-icon) ────────────────── */
.api-badge-pill {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 32px; padding: 2px 6px;
  background: var(--accent-glow);
  border: 1px solid var(--border-accent);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono); font-size: 10px; font-weight: 800;
  letter-spacing: .08em; color: var(--accent-bright);
  flex-shrink: 0;
}

/* ── Custom provider form intro text ─────────────────────────────── */
.api-custom-intro {
  font-size: 11px; color: var(--text-secondary);
  line-height: 1.6; margin-bottom: 12px;
  padding: 8px 10px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.api-custom-intro code {
  font-family: var(--font-mono); font-size: 10px;
  color: var(--accent-bright);
  background: rgba(26,107,255,.12);
  padding: 1px 4px; border-radius: 3px;
}

/* ══════════════════════════════════════════════════════════════════
   GEORISK WIDGET — Wars, Resources & Supply Chain
   ══════════════════════════════════════════════════════════════════ */

/* ── External link button in panel header ───────────────────────── */
.georisk-ext-btn {
  display: inline-flex; align-items: center; gap: 5px;
  font-family: var(--font-mono); font-size: 9px; font-weight: 700;
  letter-spacing: .07em; text-transform: uppercase;
  color: var(--accent-bright); text-decoration: none;
  background: var(--accent-glow); border: 1px solid var(--accent);
  border-radius: var(--radius-sm); padding: 4px 9px;
  transition: all var(--transition); white-space: nowrap; flex-shrink: 0;
}
.georisk-ext-btn:hover {
  background: var(--accent); color: var(--bg-base);
  box-shadow: 0 0 12px var(--accent-glow);
}

/* ── Live bar ────────────────────────────────────────────────────── */
.geo-live-bar {
  display: flex; align-items: center; gap: 8px;
  font-family: var(--font-mono); font-size: 9px; letter-spacing: .07em;
  color: var(--text-muted); margin-bottom: 10px;
  padding: 5px 8px;
  background: var(--bg-surface); border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}
.geo-live-dot {
  width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
  background: var(--accent-green); box-shadow: 0 0 6px var(--accent-green);
  animation: pulse 2s ease infinite;
}
.geo-wm-link {
  margin-left: auto; color: var(--accent); text-decoration: none;
  font-weight: 700; font-size: 9px; letter-spacing: .05em;
  transition: color var(--transition);
}
.geo-wm-link:hover { color: var(--accent-bright); text-decoration: underline; }
.geo-wm-link-small {
  margin-left: auto; color: var(--accent); text-decoration: none;
  font-family: var(--font-mono); font-size: 9px;
}
.geo-wm-link-small:hover { color: var(--accent-bright); text-decoration: underline; }

/* ── Section head ────────────────────────────────────────────────── */
.geo-section-head {
  font-family: var(--font-mono); font-size: 9px; font-weight: 700;
  letter-spacing: .12em; text-transform: uppercase;
  color: var(--text-muted); margin: 4px 0 8px;
  padding-bottom: 4px; border-bottom: 1px solid var(--border);
}

/* ── Conflict card ───────────────────────────────────────────────── */
.geo-conflict-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: border-color var(--transition), background var(--transition);
}
.geo-conflict-card:hover { border-color: var(--border-bright); background: var(--bg-hover); }

.geo-conflict-header {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;
  margin-bottom: 6px;
}
.geo-conflict-left { display: flex; align-items: flex-start; gap: 8px; flex: 1; min-width: 0; }

.geo-intensity-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 4px;
}
.geo-conflict-name {
  font-family: var(--font-mono); font-size: 11px; font-weight: 700;
  color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.geo-conflict-meta {
  font-family: var(--font-mono); font-size: 9px; color: var(--text-muted);
  letter-spacing: .04em; margin-top: 2px; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}

.geo-conflict-right { display: flex; align-items: center; gap: 4px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }

.geo-badge {
  font-family: var(--font-mono); font-size: 8px; font-weight: 800;
  letter-spacing: .07em; padding: 2px 6px;
  border-radius: 3px; border: 1px solid; white-space: nowrap;
}
.geo-badge-intensity { }
.geo-badge-crit { color: #ff4757; background: rgba(255,71,87,.12); border-color: rgba(255,71,87,.3); }
.geo-badge-high { color: #ffa500; background: rgba(255,165,0,.1); border-color: rgba(255,165,0,.3); }

.geo-conflict-summary {
  font-size: 11px; color: var(--text-secondary); line-height: 1.55;
  margin-bottom: 8px;
}
.geo-conflict-stats {
  display: flex; align-items: center; gap: 12px;
  font-family: var(--font-mono); font-size: 9px; color: var(--text-muted);
  margin-bottom: 8px;
}

/* ── Resource chips on conflict card ─────────────────────────────── */
.geo-resources-mini {
  display: flex; flex-wrap: wrap; gap: 4px;
}
.geo-res-chip {
  font-family: var(--font-mono); font-size: 9px; font-weight: 600;
  padding: 2px 7px; border-radius: 3px; border: 1px solid;
  letter-spacing: .04em; white-space: nowrap;
}
.geo-res-chip-more {
  font-family: var(--font-mono); font-size: 9px; color: var(--text-muted);
  padding: 2px 6px; background: var(--bg-surface);
  border: 1px solid var(--border); border-radius: 3px;
}

/* ── Resource rows ───────────────────────────────────────────────── */
.geo-resource-row {
  padding: 8px 10px;
  margin-bottom: 4px;
  background: var(--bg-surface);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  border-left-width: 3px;
  transition: background var(--transition);
}
.geo-resource-row:hover { background: var(--bg-hover); }

.geo-resource-top {
  display: flex; align-items: center; gap: 8px; margin-bottom: 4px;
}
.geo-resource-icon { font-size: 14px; flex-shrink: 0; }
.geo-resource-info { flex: 1; min-width: 0; }
.geo-resource-name {
  font-family: var(--font-mono); font-size: 11px; font-weight: 700;
  color: var(--text-primary); display: block;
}
.geo-resource-conflicts {
  font-family: var(--font-mono); font-size: 9px; color: var(--text-muted);
  display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.geo-resource-note {
  font-size: 10px; color: var(--text-secondary); line-height: 1.5;
}
.geo-risk-badge {
  font-family: var(--font-mono); font-size: 8px; font-weight: 800;
  letter-spacing: .07em; padding: 2px 7px;
  border-radius: 3px; border: 1px solid; white-space: nowrap; flex-shrink: 0;
}

/* ── Route cards ─────────────────────────────────────────────────── */
.geo-route-card {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 10px 12px;
  margin-bottom: 6px;
  transition: border-color var(--transition);
}
.geo-route-card:hover { border-color: var(--border-bright); }

.geo-route-header {
  display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
}
.geo-route-icon { font-size: 16px; flex-shrink: 0; }
.geo-route-name {
  font-family: var(--font-mono); font-size: 11px; font-weight: 700;
  color: var(--text-primary); flex: 1;
}
.geo-route-note {
  font-size: 11px; color: var(--text-secondary); line-height: 1.55; margin-bottom: 8px;
}
.geo-route-meta {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  flex-wrap: wrap;
}
.geo-route-affected { display: flex; flex-wrap: wrap; gap: 3px; }
.geo-affected-chip {
  font-family: var(--font-mono); font-size: 9px; color: var(--text-secondary);
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: 3px; padding: 1px 6px;
}
.geo-route-conflicts {
  font-family: var(--font-mono); font-size: 9px; color: var(--text-muted);
  font-style: italic;
}

/* ══════════════════════════════════════════════════════════════════
   NEW PROVIDERS — EODHD · APITube · Massive
   ══════════════════════════════════════════════════════════════════ */

/* ── News image thumbnail ────────────────────────────────────────── */
.news-img-wrap {
  width: 100%; margin-bottom: 6px; border-radius: var(--radius-sm); overflow: hidden;
  max-height: 120px;
}
.news-img-wrap img {
  width: 100%; height: 120px; object-fit: cover;
  display: block; border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}

/* ── News summary text ───────────────────────────────────────────── */
.news-summary {
  font-size: 10px; color: var(--text-muted); line-height: 1.5;
  margin-top: 3px;
}

/* ── Video badge on news item ────────────────────────────────────── */
.news-video-badge {
  display: inline-block;
  font-family: var(--font-mono); font-size: 8px; font-weight: 800;
  letter-spacing: .08em; padding: 2px 6px;
  background: rgba(255,0,0,.12); border: 1px solid rgba(255,0,0,.3);
  color: #ff4444; border-radius: 3px; margin-bottom: 4px;
}
.news-item-video { border-left: 2px solid rgba(255,0,0,.3); }

/* ── YouTube shortcut button in BI tab ───────────────────────────── */
.bi-yt-shortcut { margin-bottom: 10px; }
.bi-yt-btn {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-mono); font-size: 10px; font-weight: 700;
  color: #ff4444; text-decoration: none;
  background: rgba(255,0,0,.08); border: 1px solid rgba(255,0,0,.25);
  border-radius: var(--radius-sm); padding: 6px 12px;
  transition: all var(--transition);
}
.bi-yt-btn:hover {
  background: rgba(255,0,0,.18); border-color: rgba(255,0,0,.5);
  box-shadow: 0 0 10px rgba(255,0,0,.15);
}

/* ── Massive: eco calendar impact colors ─────────────────────────── */
.fin-table td.pos  { color: var(--accent-green); }
.fin-table td.neg  { color: #ff4757; }
.fin-table td.neutral { color: var(--text-muted); }

/* ── EODHD quote source note ─────────────────────────────────────── */
.av-note {
  font-family: var(--font-mono); font-size: 9px; color: var(--text-muted);
  margin-top: 8px; line-height: 1.6; white-space: pre-line;
}

/* ══════════════════════════════════════════════════════════════════
   PATCH 7 — Inline News Widget + TradingView Fundamentals
   ══════════════════════════════════════════════════════════════════ */

/* ── News item — new inline style ───────────────────────────────── */
.news-headline {
  font-size: 12px; font-weight: 600; color: var(--text-primary);
  line-height: 1.4; margin-bottom: 4px;
}
.news-actions { margin-top: 5px; }
.news-read-more {
  font-family: var(--font-mono); font-size: 9px; letter-spacing: .05em;
  color: var(--accent); text-decoration: none;
}
.news-read-more:hover { color: var(--accent-bright); text-decoration: underline; }

/* ── TradingView fundamentals embed ─────────────────────────────── */
.tv-fundamental-wrap {
  width: 100%; min-height: 420px;
  border-radius: var(--radius-sm); overflow: hidden;
}
.tv-fundamental-fallback { }

/* ── Finnhub analyst trend bars ──────────────────────────────────── */
.fh-trend-wrap { display: flex; flex-direction: column; gap: 4px; margin: 6px 0 10px; }
.fh-trend-row  { display: flex; align-items: center; gap: 6px; }
.fh-trend-label { font-family:var(--font-mono); font-size:9px; color:var(--text-muted); min-width:52px; }
.fh-trend-bar  { flex:1; height:10px; border-radius:3px; overflow:hidden; display:flex; background:var(--bg-input); }
.fh-tb-buy   { background: var(--accent-green); }
.fh-tb-hold  { background: var(--accent-yellow, #ffa500); opacity:.7; }
.fh-tb-sell  { background: #ff4757; }
.fh-trend-total { font-family:var(--font-mono); font-size:9px; color:var(--text-muted); min-width:24px; text-align:right; }

/* ══════════════════════════════════════════════════════════════════
   WORLDMONITOR INTEGRATION — shared components + 3 new panels
   ══════════════════════════════════════════════════════════════════ */

/* ── Shared utilities ────────────────────────────────────────────── */
.wm-loading {
  display: flex; align-items: center; gap: 8px;
  padding: 20px; color: var(--text-muted); font-size: 11px;
}
.wm-spin {
  width: 14px; height: 14px; border: 2px solid var(--border);
  border-top-color: var(--accent); border-radius: 50%;
  animation: wmSpin .7s linear infinite; flex-shrink: 0;
}
@keyframes wmSpin { to { transform: rotate(360deg); } }

.wm-empty {
  padding: 16px; color: var(--text-muted); font-size: 11px;
  font-family: var(--font-mono);
}

.wm-badge {
  display: inline-block; padding: 1px 6px; border-radius: 3px;
  font-size: 9px; font-weight: 700; border: 1px solid;
  letter-spacing: .5px; white-space: nowrap; flex-shrink: 0;
}

.wm-live-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; background: var(--bg-input);
  border-bottom: 1px solid var(--border);
  font-size: 10px; color: var(--text-muted);
  position: sticky; top: 0; z-index: 2;
}
.wm-live-dot {
  width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
  background: var(--accent); animation: wmPulse 2s ease-in-out infinite;
}
@keyframes wmPulse {
  0%,100% { opacity: 1; } 50% { opacity: .35; }
}
.wm-live-sub { margin-left: auto; font-size: 9px; color: var(--text-dim, #555); }

.wm-section-head {
  padding: 8px 10px 4px;
  font-size: 9px; font-weight: 700; letter-spacing: 1px;
  color: var(--text-muted); text-transform: uppercase;
  border-top: 1px solid var(--border); margin-top: 4px;
}
.wm-section-head:first-of-type { border-top: none; margin-top: 0; }

.wm-up   { color: #00d4a0; }
.wm-dn   { color: #ff4757; }
.wm-flat { color: var(--text-muted); }

/* ── Filter bar (Alert Feed) ─────────────────────────────────────── */
.wm-filter-bar {
  display: flex; gap: 2px; padding: 4px 6px;
  background: var(--bg-panel); border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.wm-filter-btn {
  padding: 3px 8px; font-size: 9px; font-weight: 700; letter-spacing: .5px;
  background: transparent; border: 1px solid var(--border);
  color: var(--text-muted); border-radius: 3px; cursor: pointer;
  transition: all .15s;
}
.wm-filter-btn:hover { color: var(--text); border-color: var(--accent); }
.wm-filter-btn.active {
  background: var(--accent); color: #000;
  border-color: var(--accent);
}

/* ── CHOKEPOINTS ─────────────────────────────────────────────────── */
.wm-choke-card {
  padding: 8px 10px; border-bottom: 1px solid var(--border);
  transition: background .12s;
}
.wm-choke-card:hover { background: var(--bg-hover, rgba(255,255,255,.03)); }
.wm-choke-header {
  display: flex; align-items: flex-start; gap: 8px; margin-bottom: 4px;
}
.wm-choke-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
.wm-choke-info { flex: 1; min-width: 0; }
.wm-choke-name {
  font-size: 12px; font-weight: 700; color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.wm-choke-region { font-size: 10px; color: var(--text-muted); margin-top: 1px; }
.wm-choke-stats {
  display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0;
}
.wm-stat-chip {
  font-size: 9px; padding: 1px 6px; border-radius: 2px;
  background: var(--bg-input); border: 1px solid var(--border);
  color: var(--text-muted);
}
.wm-choke-note {
  font-size: 10px; color: var(--text-muted); line-height: 1.4;
  margin-top: 3px;
}
.wm-choke-commodities { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; }
.wm-comm-chip {
  font-size: 9px; padding: 1px 5px; border-radius: 2px;
  background: rgba(26,107,255,.1); border: 1px solid rgba(26,107,255,.25);
  color: #3d8bff;
}

/* ── SHIPPING RATES ──────────────────────────────────────────────── */
.wm-ship-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(140px,1fr));
  gap: 1px; background: var(--border); padding: 0;
}
.wm-ship-card {
  background: var(--bg-panel); padding: 10px;
  display: flex; flex-direction: column; gap: 2px;
}
.wm-ship-route {
  font-size: 10px; color: var(--text-muted); font-weight: 600;
  line-height: 1.3;
}
.wm-ship-val {
  font-size: 16px; font-weight: 700; color: var(--text);
  font-family: var(--font-mono);
}
.wm-ship-meta { font-size: 10px; color: var(--text-muted); }
.wm-ship-note { font-size: 9px; color: var(--text-dim, #555); margin-top: 3px; }

/* ── MINERALS ────────────────────────────────────────────────────── */
.wm-min-row {
  padding: 7px 10px; border-bottom: 1px solid var(--border);
}
.wm-min-header {
  display: flex; align-items: flex-start; gap: 7px; margin-bottom: 4px;
}
.wm-min-icon { font-size: 15px; flex-shrink: 0; }
.wm-min-info { flex: 1; min-width: 0; }
.wm-min-name {
  font-size: 12px; font-weight: 700; color: var(--text);
  display: block;
}
.wm-min-use { font-size: 10px; color: var(--text-muted); display: block; }
.wm-min-producers { display: flex; flex-wrap: wrap; gap: 3px; margin: 3px 0; }
.wm-prod-chip {
  font-size: 9px; padding: 1px 5px; border-radius: 2px;
  background: var(--bg-input); border: 1px solid var(--border);
  color: var(--text-muted);
}
.wm-min-conflict {
  font-size: 10px; color: #ffa500; margin-top: 3px;
}

/* ── FLIGHT DELAYS ───────────────────────────────────────────────── */
.wm-flight-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(100px,1fr));
  gap: 1px; background: var(--border);
}
.wm-flight-card {
  background: var(--bg-panel); padding: 8px;
  border-bottom: 2px solid transparent;
}
.wm-flight-code {
  font-size: 14px; font-weight: 800; font-family: var(--font-mono);
}
.wm-flight-name { font-size: 9px; color: var(--text-muted); margin-top: 1px; }
.wm-flight-delay {
  font-size: 11px; font-weight: 700; color: #ffa500; margin-top: 3px;
}
.wm-flight-reason { font-size: 9px; color: var(--text-dim, #555); margin-top: 2px; }

/* ── ENERGY ──────────────────────────────────────────────────────── */
.wm-energy-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(120px,1fr));
  gap: 1px; background: var(--border); padding: 0;
}
.wm-energy-card {
  background: var(--bg-panel); padding: 12px; display: flex;
  flex-direction: column; gap: 3px;
}
.wm-energy-label { font-size: 10px; color: var(--text-muted); font-weight: 600; }
.wm-energy-val {
  font-size: 18px; font-weight: 700; color: var(--accent);
  font-family: var(--font-mono);
}
.wm-energy-unit { font-size: 9px; color: var(--text-dim, #555); }

/* ── ALERT FEED ──────────────────────────────────────────────────── */
.wm-alert-row {
  padding: 7px 10px; border-bottom: 1px solid var(--border);
  transition: background .12s;
}
.wm-alert-row:hover { background: var(--bg-hover, rgba(255,255,255,.03)); }
.wm-alert-header {
  display: flex; align-items: flex-start; gap: 7px;
}
.wm-alert-icon { font-size: 16px; flex-shrink: 0; }
.wm-alert-body { flex: 1; min-width: 0; }
.wm-alert-title {
  font-size: 11px; font-weight: 600; color: var(--text);
  line-height: 1.3; margin-bottom: 3px;
}
.wm-alert-meta {
  display: flex; flex-wrap: wrap; gap: 6px;
  font-size: 9px; color: var(--text-muted);
}
.wm-alert-cat {
  padding: 0 4px; background: var(--bg-input);
  border: 1px solid var(--border); border-radius: 2px;
}
.wm-alert-note {
  font-size: 10px; color: var(--text-muted); margin-top: 4px;
  line-height: 1.4;
}

/* ── MACRO SIGNALS ───────────────────────────────────────────────── */
.wm-macro-row {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  align-items: center; gap: 8px;
  padding: 5px 10px; border-bottom: 1px solid var(--border);
  font-size: 11px;
}
.wm-macro-label { color: var(--text); font-weight: 500; }
.wm-macro-val {
  font-family: var(--font-mono); font-size: 11px; color: var(--text);
  text-align: right;
}
.wm-macro-chg { font-family: var(--font-mono); font-size: 10px; min-width: 56px; text-align: right; }
.wm-macro-sig {
  font-size: 9px; padding: 1px 5px; border-radius: 2px;
  background: var(--bg-input); border: 1px solid var(--border);
  color: var(--text-muted);
}

/* ── COMMODITY GRID ──────────────────────────────────────────────── */
.wm-comm-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(110px,1fr));
  gap: 1px; background: var(--border);
}
.wm-comm-card {
  background: var(--bg-panel); padding: 9px;
  display: flex; flex-direction: column; gap: 2px;
}
.wm-comm-name { font-size: 10px; color: var(--text-muted); font-weight: 600; }
.wm-comm-price {
  font-size: 14px; font-weight: 700; color: var(--text);
  font-family: var(--font-mono);
}
.wm-comm-unit { font-size: 9px; color: var(--text-dim, #555); }

/* ── RISK SCORES ─────────────────────────────────────────────────── */
.wm-risk-row {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 10px; border-bottom: 1px solid var(--border);
}
.wm-risk-country {
  font-size: 11px; font-weight: 600; color: var(--text);
  min-width: 32px; font-family: var(--font-mono);
}
.wm-risk-bar-wrap {
  flex: 1; height: 6px; background: var(--bg-input);
  border-radius: 3px; overflow: hidden;
}
.wm-risk-bar { height: 100%; border-radius: 3px; transition: width .4s; }
.wm-risk-score {
  font-family: var(--font-mono); font-size: 11px; font-weight: 700;
  min-width: 28px; text-align: right;
}

/* ── RISK HEATMAP ────────────────────────────────────────────────── */
.wm-risk-heatmap {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(72px,1fr));
  gap: 2px; padding: 6px 8px;
}
.wm-heat-cell {
  display: flex; flex-direction: column; align-items: center;
  padding: 6px 4px; border-radius: 4px; border: 1px solid;
  gap: 2px;
}
.wm-heat-country {
  font-size: 9px; font-weight: 700; font-family: var(--font-mono);
  color: var(--text);
}
.wm-heat-score { font-size: 14px; font-weight: 800; font-family: var(--font-mono); }

/* ── PREDICTION MARKETS ──────────────────────────────────────────── */
.wm-pred-row {
  padding: 8px 10px; border-bottom: 1px solid var(--border);
}
.wm-pred-q {
  font-size: 11px; color: var(--text); font-weight: 500;
  line-height: 1.4; margin-bottom: 4px;
}
.wm-pred-meta {
  display: flex; flex-wrap: wrap; gap: 6px;
  font-size: 9px; color: var(--text-muted); margin-bottom: 5px;
}
.wm-pred-cat {
  padding: 0 4px; background: var(--bg-input);
  border: 1px solid var(--border); border-radius: 2px;
}
.wm-pred-prob { display: flex; align-items: center; gap: 7px; }
.wm-pred-bar-bg {
  flex: 1; height: 6px; background: var(--bg-input);
  border-radius: 3px; overflow: hidden;
}
.wm-pred-bar-fill { height: 100%; border-radius: 3px; transition: width .4s; }
.wm-pred-pct {
  font-family: var(--font-mono); font-size: 12px; font-weight: 800;
  min-width: 36px; text-align: right;
}

/* ── THEATER POSTURE (INTEL tab) ─────────────────────────────────── */
.wm-theater-card {
  padding: 8px 10px; border-bottom: 1px solid var(--border);
}
.wm-theater-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; margin-bottom: 4px;
}
.wm-theater-name { font-size: 12px; font-weight: 700; color: var(--text); }
.wm-theater-note { font-size: 10px; color: var(--text-muted); line-height: 1.4; }
.wm-theater-assets { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 5px; }
.wm-asset-chip {
  font-size: 9px; padding: 1px 5px; border-radius: 2px;
  background: rgba(255,71,87,.1); border: 1px solid rgba(255,71,87,.25);
  color: #ff4757;
}

/* ── IRAN EVENTS / INTEL ROWS ────────────────────────────────────── */
.wm-intel-row {
  padding: 6px 10px; border-bottom: 1px solid var(--border);
}
.wm-intel-title {
  font-size: 11px; font-weight: 600; color: var(--text);
  margin-bottom: 3px; line-height: 1.3;
}
.wm-intel-meta {
  display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
  font-size: 9px; color: var(--text-muted);
}

/* ── SIGNALS TAB ─────────────────────────────────────────────────── */
.wm-signal-row {
  padding: 7px 10px; border-bottom: 1px solid var(--border);
}
.wm-signal-header {
  display: flex; align-items: center; flex-wrap: wrap;
  gap: 5px; margin-bottom: 4px;
}
.wm-signal-cat {
  font-size: 9px; color: var(--text-muted); padding: 1px 5px;
  background: var(--bg-input); border: 1px solid var(--border); border-radius: 2px;
}
.wm-signal-time { font-size: 9px; color: var(--text-dim, #555); margin-left: auto; }
.wm-signal-ticker {
  font-size: 10px; font-weight: 700; font-family: var(--font-mono);
  color: var(--accent); padding: 0 5px; border-radius: 2px;
  background: rgba(0,212,160,.1); border: 1px solid rgba(0,212,160,.25);
  cursor: pointer;
}
.wm-signal-ticker:hover { background: rgba(0,212,160,.2); }
.wm-signal-title {
  font-size: 11px; font-weight: 600; color: var(--text);
  line-height: 1.4; margin-bottom: 3px;
}
.wm-signal-body {
  font-size: 10px; color: var(--text-muted); line-height: 1.4;
}
.wm-signal-tags { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; }
.wm-tag {
  font-size: 9px; padding: 1px 5px; border-radius: 2px;
  background: var(--bg-input); border: 1px solid var(--border);
  color: var(--text-muted);
}

/* ── EARTHQUAKES / NATURAL ───────────────────────────────────────── */
.wm-quake-row {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 6px 10px; border-bottom: 1px solid var(--border);
}
.wm-quake-mag {
  font-size: 15px; font-weight: 800; font-family: var(--font-mono);
  min-width: 42px; flex-shrink: 0;
}
.wm-quake-place {
  font-size: 11px; font-weight: 600; color: var(--text);
}
.wm-quake-meta {
  display: flex; gap: 8px; font-size: 9px; color: var(--text-muted);
  margin-top: 2px;
}

.wm-nat-row {
  padding: 6px 10px; border-bottom: 1px solid var(--border);
}
.wm-nat-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: 6px; margin-bottom: 3px;
}
.wm-nat-type {
  font-size: 10px; font-weight: 700; color: var(--text);
  text-transform: uppercase; letter-spacing: .5px;
}
.wm-nat-title { font-size: 11px; color: var(--text); margin-bottom: 3px; }
.wm-nat-meta { display: flex; gap: 8px; font-size: 9px; color: var(--text-muted); }

/* ══════════════════════════════════════════════════════════════════
   INTEL FEED PANEL
   ══════════════════════════════════════════════════════════════════ */

/* ── Panel header badge ─────────────────────────────────────────── */
.intel-badge {
  display: inline-block; padding: 2px 8px; border-radius: 3px;
  font-size: 10px; font-weight: 800; letter-spacing: .5px;
  background: #ff4757; color: #fff; margin-left: 8px;
  flex-shrink: 0;
}

/* ── Toggle switches ────────────────────────────────────────────── */
.wm-toggle-wrap {
  display: flex; align-items: center; gap: 5px;
  font-size: 10px; color: var(--text-muted); cursor: pointer;
  user-select: none;
}
.wm-toggle {
  width: 28px; height: 15px; border-radius: 8px;
  background: var(--bg-input); border: 1px solid var(--border);
  position: relative; transition: background .2s; flex-shrink: 0;
}
.wm-toggle::after {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 9px; height: 9px; border-radius: 50%;
  background: var(--text-muted); transition: left .2s, background .2s;
}
.wm-toggle.on {
  background: var(--accent); border-color: var(--accent);
}
.wm-toggle.on::after { left: 15px; background: #000; }

/* ── Filter tabs ────────────────────────────────────────────────── */
.wm-intel-tabs {
  display: flex; gap: 2px; padding: 4px 6px;
  background: var(--bg-panel); border-bottom: 1px solid var(--border);
  flex-wrap: wrap; overflow-x: auto;
}
.wm-intel-tab {
  padding: 3px 8px; font-size: 9px; font-weight: 700; letter-spacing: .4px;
  background: transparent; border: 1px solid var(--border);
  color: var(--text-muted); border-radius: 3px; cursor: pointer;
  white-space: nowrap; transition: all .15s;
}
.wm-intel-tab:hover { color: var(--text); border-color: var(--accent); }
.wm-intel-tab.active { background: var(--accent); color: #000; border-color: var(--accent); }

/* ── Intel alert cards ──────────────────────────────────────────── */
.wm-intel-card {
  padding: 9px 10px; border-bottom: 1px solid var(--border);
  cursor: pointer; transition: background .12s;
}
.wm-intel-card:hover { background: rgba(255,255,255,.03); }

.wm-ic-header {
  display: flex; align-items: flex-start; gap: 7px; margin-bottom: 4px;
}
.wm-ic-icon { font-size: 15px; flex-shrink: 0; margin-top: 1px; }
.wm-ic-title {
  flex: 1; font-size: 12px; font-weight: 700; color: var(--text);
  line-height: 1.3;
}
.wm-ic-badge {
  display: inline-block; padding: 2px 6px; border-radius: 3px;
  font-size: 9px; font-weight: 800; border: 1px solid;
  letter-spacing: .5px; white-space: nowrap; flex-shrink: 0;
}
.wm-ic-sub {
  font-size: 10px; color: var(--text-muted);
  line-height: 1.4; margin-bottom: 3px; padding-left: 22px;
}
.wm-ic-detail {
  font-size: 10px; color: #6b7a8d;
  font-style: italic; line-height: 1.4; padding-left: 22px;
  margin-bottom: 3px;
}
.wm-ic-footer {
  display: flex; align-items: center; gap: 8px;
  padding-left: 22px; margin-top: 4px;
}
.wm-ic-time { font-size: 9px; color: var(--text-dim, #555); }
.wm-ic-ticker {
  font-size: 10px; font-weight: 700; font-family: var(--font-mono);
  color: var(--accent); padding: 0 5px; border-radius: 2px;
  background: rgba(0,212,160,.1); border: 1px solid rgba(0,212,160,.25);
  cursor: pointer;
}
.wm-ic-ticker:hover { background: rgba(0,212,160,.22); }
.wm-ic-link {
  font-size: 10px; color: var(--accent); cursor: pointer;
  margin-left: auto; opacity: .7; transition: opacity .15s;
  white-space: nowrap;
}
.wm-ic-link:hover { opacity: 1; text-decoration: underline; }

.wm-intel-empty {
  padding: 20px; text-align: center;
  font-size: 11px; color: var(--text-muted);
}

/* ── Toast notifications ────────────────────────────────────────── */
.wm-toast {
  position: fixed; bottom: 16px; right: 16px; z-index: 9999;
  width: 280px; background: var(--bg-panel);
  border: 1px solid var(--border); border-radius: 6px;
  padding: 10px 12px; box-shadow: 0 4px 20px rgba(0,0,0,.5);
  animation: wmToastIn .25s ease;
}
@keyframes wmToastIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.wm-toast-fade { opacity: 0; transition: opacity .5s; }
.wm-toast-head {
  display: flex; align-items: center; gap: 6px;
  margin-bottom: 5px;
}
.wm-toast-sev { font-size: 10px; font-weight: 800; }
.wm-toast-close {
  margin-left: auto; cursor: pointer; color: var(--text-muted);
  font-size: 11px;
}
.wm-toast-title { font-size: 11px; color: var(--text); font-weight: 600; }

/* ══════════════════════════════════════════════════════════════════
   RESOURCE DRAWER
   ══════════════════════════════════════════════════════════════════ */
#wm-resource-drawer {
  position: fixed; top: 0; right: -420px; width: 400px; height: 100vh;
  background: var(--bg-panel); border-left: 1px solid var(--border);
  z-index: 8000; display: flex; flex-direction: column;
  transition: right .25s cubic-bezier(.4,0,.2,1);
  box-shadow: -4px 0 24px rgba(0,0,0,.5);
}
#wm-resource-drawer.open { right: 0; }

.wm-drawer-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; border-bottom: 1px solid var(--border);
  background: var(--bg-input); gap: 8px; flex-shrink: 0;
}
.wm-drawer-title-wrap {
  display: flex; align-items: center; gap: 7px; min-width: 0;
}
#wm-drawer-icon { font-size: 18px; flex-shrink: 0; }
#wm-drawer-title {
  font-size: 13px; font-weight: 700; color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.wm-drawer-actions {
  display: flex; align-items: center; gap: 5px; flex-shrink: 0;
}
.wm-drawer-act-btn {
  padding: 4px 8px; font-size: 10px; font-weight: 600;
  background: transparent; border: 1px solid var(--accent);
  color: var(--accent); border-radius: 3px; cursor: pointer;
  white-space: nowrap; transition: all .15s;
}
.wm-drawer-act-btn:hover { background: var(--accent); color: #000; }
.wm-drawer-close {
  background: transparent; border: none; color: var(--text-muted);
  font-size: 14px; cursor: pointer; padding: 2px 6px;
}
.wm-drawer-close:hover { color: var(--text); }

.wm-drawer-tabs {
  display: flex; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.wm-drawer-tab {
  flex: 1; padding: 7px 4px; font-size: 10px; font-weight: 700;
  background: transparent; border: none;
  color: var(--text-muted); cursor: pointer; transition: all .15s;
  border-bottom: 2px solid transparent;
}
.wm-drawer-tab:hover { color: var(--text); }
.wm-drawer-tab.active {
  color: var(--accent); border-bottom-color: var(--accent);
}

.wm-drawer-body {
  flex: 1; overflow-y: auto; padding: 0;
}
.wm-drawer-body.hidden { display: none; }

/* Drawer news pane */
.wm-drawer-news-head {
  padding: 7px 10px; font-size: 10px; color: var(--text-muted);
  background: var(--bg-input); border-bottom: 1px solid var(--border);
}
.wm-drawer-news-item {
  padding: 8px 10px; border-bottom: 1px solid var(--border);
  transition: background .12s;
}
.wm-drawer-news-item:hover { background: rgba(255,255,255,.03); }
.wm-drawer-news-title {
  font-size: 11px; font-weight: 600; color: var(--text);
  line-height: 1.4; margin-bottom: 4px;
}
.wm-drawer-news-meta {
  display: flex; align-items: center; gap: 6px;
  font-size: 9px; color: var(--text-muted);
}
.wm-drawer-news-body {
  font-size: 10px; color: var(--text-muted); margin-top: 4px;
  line-height: 1.4;
}

/* Drawer stocks pane */
.wm-drawer-stocks-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 10px; border-bottom: 1px solid var(--border);
  font-size: 11px; color: var(--text);
  background: var(--bg-input);
}
.wm-drawer-stock-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-bottom: 1px solid var(--border);
  cursor: pointer; transition: background .12s;
}
.wm-drawer-stock-row:hover { background: rgba(255,255,255,.04); }
.wm-drawer-stock-ticker {
  font-size: 14px; font-weight: 800; font-family: var(--font-mono);
  color: var(--accent);
}
.wm-drawer-stock-hint { font-size: 10px; color: var(--text-muted); }

.wm-drawer-hint {
  padding: 14px 12px; font-size: 11px; color: var(--text-muted);
  line-height: 1.6;
}
.wm-drawer-hint a { color: var(--accent); }

/* Drawer context pane */
.wm-ctx-section {
  padding: 7px 10px 3px; font-size: 9px; font-weight: 700;
  letter-spacing: 1px; color: var(--text-muted);
  text-transform: uppercase; border-top: 1px solid var(--border);
  margin-top: 2px;
}
.wm-ctx-item {
  padding: 7px 10px; border-bottom: 1px solid var(--border);
  display: flex; align-items: flex-start; flex-wrap: wrap;
  gap: 5px;
}
.wm-ctx-name { font-size: 12px; font-weight: 700; color: var(--text); flex: 1; }
.wm-ctx-note { width: 100%; font-size: 10px; color: var(--text-muted); margin-top: 2px; }
.wm-ctx-risk {
  display: flex; align-items: center; gap: 8px;
}
.wm-ctx-risk-bar {
  flex: 1; height: 5px; background: var(--bg-input); border-radius: 3px; overflow: hidden;
}
.wm-ctx-risk-bar > div { height: 100%; border-radius: 3px; }

/* Clickable resource visual feedback */
.geo-resource-row:hover,
.geo-route-card:hover,
.wm-choke-card:hover,
.wm-min-row:hover,
.wm-alert-row:hover {
  outline: 1px solid rgba(0,212,160,.3);
}

/* ══════════════════════════════════════════════════════════════════
   GEO·RISK SCROLL FIX + CROSS-PANEL CONNECTION BAR
   ══════════════════════════════════════════════════════════════════ */

/* Ensure the geo panel itself has a flex column that fills height */
#panel-geopolitical {
  display: flex;
  flex-direction: column;
}

/* panel-head + tab-bar are fixed height, tab-pane fills the rest */
#panel-geopolitical .panel-head,
#panel-geopolitical .tab-bar {
  flex-shrink: 0;
}

/* The geo tab panes get direct scroll — override panel-content padding */
#geo-wars,
#geo-resources,
#geo-routes,
#geo-intel,
#geo-signals,
#geo-quakes {
  padding: 0;          /* padding moved inside content divs */
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: none;       /* hidden by default (tab-pane rule) */
}

/* When active — restore flex column but keep scroll */
#geo-wars.active,
#geo-resources.active,
#geo-routes.active,
#geo-intel.active,
#geo-signals.active,
#geo-quakes.active {
  display: flex;
  flex-direction: column;
}

/* Inner content wrappers: no fixed height, grow freely */
#georisk-wars-content,
#georisk-resources-content,
#georisk-routes-content {
  flex: none;
  padding: 10px 12px;
}

/* ── Cross-panel connection bar ─────────────────────────────────── */
.geo-cross-bar {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 8px;
  background: rgba(0, 212, 160, 0.05);
  border-bottom: 1px solid rgba(0, 212, 160, 0.18);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.geo-cross-label {
  font-size: 9px;
  color: var(--text-muted);
  letter-spacing: .03em;
  flex: 1;
  min-width: 100px;
}

.geo-cross-btn {
  padding: 3px 8px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .3px;
  background: transparent;
  border: 1px solid rgba(0, 212, 160, 0.35);
  color: var(--accent);
  border-radius: 3px;
  cursor: pointer;
  white-space: nowrap;
  transition: all .15s;
}
.geo-cross-btn:hover {
  background: rgba(0, 212, 160, 0.12);
  border-color: var(--accent);
}

/* Resource rows / chips cursor feedback (already have hover outline) */
#georisk-wars-content     .geo-res-chip    { cursor: pointer; }
#georisk-resources-content .geo-resource-row { cursor: pointer; }
#georisk-routes-content   .geo-route-card  { cursor: pointer; }

/* ══════════════════════════════════════════════════════════════════
   MODULE TRAY — expand/collapse panel selector
   ══════════════════════════════════════════════════════════════════ */

/* ── Compact row: ⊞ button ─────────────────────────────────────── */
.modules-expand-btn {
  margin-left: 6px;
  flex-shrink: 0;
  width: 24px; height: 24px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  font-size: 14px; line-height: 1;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all .15s;
}
.modules-expand-btn:hover,
.modules-expand-btn.active {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-glow, rgba(0,212,160,.07));
}

/* ── Tray dropdown ──────────────────────────────────────────────── */
.modules-tray {
  position: absolute;
  top: 100%;   /* flush below the header */
  left: 0; right: 0;
  z-index: 7000;
  max-height: 0;
  overflow: hidden;
  transition: max-height .28s cubic-bezier(.4,0,.2,1),
              opacity     .22s ease,
              box-shadow  .22s ease;
  opacity: 0;
  pointer-events: none;
}
.modules-tray.open {
  max-height: 420px;
  opacity: 1;
  pointer-events: auto;
  box-shadow: 0 8px 32px rgba(0,0,0,.55);
}

.modules-tray-inner {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-top: none;
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  overflow-y: auto;
  max-height: 420px;
}

/* ── Tray header ────────────────────────────────────────────────── */
.modules-tray-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-input);
  font-size: 10px; color: var(--text-muted);
  font-family: var(--font-mono); letter-spacing: .06em;
  position: sticky; top: 0; z-index: 1;
  flex-shrink: 0;
}
.modules-tray-actions {
  display: flex; gap: 5px;
}
.modules-tray-btn {
  padding: 3px 9px; font-size: 9px; font-weight: 700; letter-spacing: .3px;
  background: transparent; border: 1px solid var(--border);
  color: var(--text-muted); border-radius: 3px; cursor: pointer;
  transition: all .15s;
}
.modules-tray-btn:hover {
  border-color: var(--accent); color: var(--accent);
  background: var(--accent-glow, rgba(0,212,160,.07));
}
.modules-tray-close {
  border-color: rgba(255,71,87,.3); color: #ff4757;
}
.modules-tray-close:hover {
  background: rgba(255,71,87,.1); border-color: #ff4757;
}

/* ── Tray grid ──────────────────────────────────────────────────── */
.modules-tray-grid {
  display: flex; flex-wrap: wrap;
  gap: 5px; padding: 10px 14px 14px;
  align-items: flex-start;
}

.modules-tray-section {
  width: 100%;
  font-size: 8px; font-weight: 700; letter-spacing: .12em;
  text-transform: uppercase; color: var(--text-muted);
  padding: 6px 0 2px;
  border-top: 1px solid var(--border);
  font-family: var(--font-mono);
  flex-shrink: 0;
}
.modules-tray-section:first-child {
  border-top: none; padding-top: 0;
}

/* ── Each module item card ──────────────────────────────────────── */
.modules-tray-item {
  display: flex; flex-direction: column; align-items: center;
  gap: 5px; padding: 9px 10px;
  min-width: 68px;
  background: var(--bg-surface, var(--bg-input));
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all .15s;
  user-select: none;
  position: relative;
}
.modules-tray-item:hover {
  border-color: var(--accent);
  background: var(--accent-glow, rgba(0,212,160,.07));
}
.modules-tray-item:has(input:checked) {
  border-color: var(--accent);
  background: rgba(0,212,160,.1);
}

.modules-tray-item input[type="checkbox"] {
  position: absolute; top: 5px; left: 5px;
  appearance: none; width: 9px; height: 9px;
  border: 1px solid var(--text-muted); border-radius: 2px;
  background: transparent; cursor: pointer;
  transition: all .15s;
}
.modules-tray-item input[type="checkbox"]:checked {
  background: var(--accent); border-color: var(--accent);
}
.modules-tray-item input[type="checkbox"]:checked::after {
  content: '✓'; position: absolute; top: -1px; left: 0px;
  font-size: 7px; color: #000; font-weight: 700;
}

.mti-icon { font-size: 18px; line-height: 1; }
.mti-label {
  font-size: 9px; font-weight: 700; letter-spacing: .04em;
  text-transform: uppercase; color: var(--text-secondary);
  font-family: var(--font-mono); text-align: center;
  white-space: nowrap;
}
.modules-tray-item:has(input:checked) .mti-label {
  color: var(--accent);
}

/* ══════════════════════════════════════════════════════════════════
   MODULE ROW EXPAND/COLLAPSE BUTTON
   ══════════════════════════════════════════════════════════════════ */

/* Dedicated expand button for the modules row */
.modules-row-toggle {
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  gap: 4px;
  margin-left: 4px;
  padding: 3px 8px;
  height: 22px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  font-size: 10px; font-weight: 700;
  font-family: var(--font-mono);
  letter-spacing: .04em;
  cursor: pointer;
  white-space: nowrap;
  transition: all .15s;
  position: sticky;
  right: 0;
}
.modules-row-toggle:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-glow, rgba(0,212,160,.07));
}
.modules-row-toggle.expanded {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(0,212,160,.08);
}
.modules-row-toggle .mrt-icon {
  font-size: 12px;
  transition: transform .2s;
}
.modules-row-toggle.expanded .mrt-icon {
  transform: rotate(45deg);
}

/* When expanded, checklist wraps cleanly */
.topbar-row-2.expanded .checklist {
  flex-wrap: wrap;
  overflow: visible;
}

/* Keep checklist horizontally scrollable when compact */
.topbar-row-2.compact .checklist {
  flex-wrap: nowrap;
  overflow: visible;
  flex: 1 1 0;
  min-width: 0;
}

/* Smooth height transition on the row */
#topbarRow2 {
  transition: height .22s cubic-bezier(.4,0,.2,1),
              padding .22s ease,
              background .15s ease;
}

/* Subtle highlight when expanded */
#topbarRow2.expanded {
  background: rgba(0,212,160,.025);
}

/* ══════════════════════════════════════════════════════════════════
   MODULES SIDE TAB — floating expand/collapse button
   ══════════════════════════════════════════════════════════════════ */

/* The topbar is relative so the tab can anchor to it */
.topbar { position: relative; }

/* The floating tab — sticks to the right edge just below the modules bar */
.modules-side-tab {
  position: absolute;
  right: 0;
  /* Sits just below topbar-row-1 (≈40px), vertically centred on row-2 (32px) */
  top: calc(40px + 6px);   /* row1 height + half (32-20)/2 */
  width: 20px;
  height: 20px;
  border: 1px solid var(--border);
  border-right: none;
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-muted);
  font-size: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  transition: background .15s, border-color .15s, color .15s, top .2s;
}

.modules-side-tab:hover {
  background: var(--accent-glow, rgba(0,212,160,.1));
  border-color: var(--accent);
  color: var(--accent);
}

/* When expanded: row-2 is taller so the tab moves down */
.modules-side-tab.expanded {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(0,212,160,.08);
}

.mst-arrow {
  display: block;
  line-height: 1;
  transition: transform .2s;
}

/* Ensure topbar-row-2 doesn't overlap the side tab */
.topbar-row-2 {
  padding-right: 24px !important;
}

/* ══════════════════════════════════════════════════════════════════
   WM ENRICHMENT BANNERS
   Appear at the top of News · Quote · Analysts · Ownership ·
   Comparables · Watchlist · Valuation panels
   ══════════════════════════════════════════════════════════════════ */

.wm-enrich-banner {
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
  background: rgba(0, 212, 160, 0.04);
  animation: wmBannerIn .25s ease;
}
@keyframes wmBannerIn {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}

.wm-enrich-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border-bottom: 1px solid rgba(0,212,160,.15);
}
.wm-enrich-logo {
  font-size: 10px;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: .03em;
  font-family: var(--font-mono);
}
.wm-enrich-count {
  font-size: 9px;
  color: var(--text-muted);
  margin-left: 2px;
}
.wm-enrich-close {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}
.wm-enrich-close:hover { color: var(--text); }

.wm-enrich-items {
  display: flex;
  flex-direction: column;
}

.wm-enrich-item {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  transition: background .12s;
}
.wm-enrich-item:last-child { border-bottom: none; }
.wm-enrich-item:hover { background: rgba(255,255,255,.025); }

.wm-enrich-icon {
  font-size: 14px;
  flex-shrink: 0;
  margin-top: 1px;
}
.wm-enrich-body {
  flex: 1;
  min-width: 0;
}
.wm-enrich-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.35;
  margin-bottom: 2px;
}
.wm-enrich-sub {
  font-size: 10px;
  color: var(--text-muted);
  line-height: 1.4;
}
.wm-enrich-act {
  flex-shrink: 0;
  padding: 3px 7px;
  font-size: 9px;
  font-weight: 700;
  background: transparent;
  border: 1px solid rgba(0,212,160,.35);
  color: var(--accent);
  border-radius: 3px;
  cursor: pointer;
  white-space: nowrap;
  align-self: center;
  transition: all .15s;
}
.wm-enrich-act:hover {
  background: rgba(0,212,160,.12);
  border-color: var(--accent);
}

/* ══════════════════════════════════════════════════════════════════
   SUPABASE CACHE INDICATORS
   ══════════════════════════════════════════════════════════════════ */
.sb-cache-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px;
  padding: 5px 10px;
  background: rgba(0,212,160,.05);
  border-bottom: 1px solid rgba(0,212,160,.15);
  font-size: 10px;
  color: var(--text-muted);
  flex-shrink: 0;
}
.sb-cache-bar strong { color: var(--text); }
.sb-cache-note {
  font-size: 9px;
  opacity: .7;
}
.sb-cache-tag {
  font-size: 10px;
  margin-left: auto;
  opacity: .6;
}
.sb-cached {
  opacity: .88;
  border-left: 2px solid rgba(0,212,160,.25) !important;
}

/* ══════════════════════════════════════════════════════════════════
   SMARTSEARCH — sector chips + holdings tab
   ══════════════════════════════════════════════════════════════════ */

/* ── Sector bar (in Watchlist panel) ───────────────────────────── */
.ss-sector-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  background: rgba(26,107,255,.04);
  flex-shrink: 0;
}
.ss-bar-label {
  font-size: 9px;
  font-weight: 700;
  color: var(--text-muted);
  letter-spacing: .05em;
  text-transform: uppercase;
  white-space: nowrap;
  flex-shrink: 0;
}
.ss-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}
.ss-chip {
  padding: 3px 8px;
  font-size: 9px;
  font-weight: 700;
  font-family: var(--font-mono);
  letter-spacing: .04em;
  text-transform: uppercase;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 3px;
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
  transition: all .15s;
}
.ss-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.ss-chip.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #000;
}

/* ── Holdings tab button ───────────────────────────────────────── */
.ss-hold-tab {
  color: #ffa500 !important;
  border-bottom-color: transparent;
}
.ss-hold-tab.active {
  color: #ffa500 !important;
  border-bottom-color: #ffa500 !important;
}

/* ── Holdings pane ─────────────────────────────────────────────── */
.ss-hold-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-input);
  flex-shrink: 0;
}
.ss-hold-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text);
}
.ss-hold-hint {
  font-size: 9px;
  color: var(--text-muted);
  font-style: italic;
}

/* Sector breakdown bars */
.ss-sector-breakdown {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.ss-sec-head {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 5px;
}
.ss-sec-bar-item {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
  height: 16px;
}
.ss-sec-bar-fill {
  height: 6px;
  border-radius: 3px;
  min-width: 2px;
  transition: width .4s;
}
.ss-sec-label {
  font-size: 9px;
  color: var(--text-muted);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ss-sec-pct {
  font-size: 9px;
  font-family: var(--font-mono);
  color: var(--text);
  min-width: 32px;
  text-align: right;
}

/* Holdings table */
.ss-hold-table-wrap {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}
.ss-hold-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.ss-hold-table thead th {
  position: sticky;
  top: 0;
  background: var(--bg-input);
  padding: 5px 8px;
  text-align: left;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
  z-index: 1;
}
.ss-hold-row {
  cursor: pointer;
  transition: background .1s;
  border-bottom: 1px solid var(--border);
}
.ss-hold-row:hover { background: rgba(255,255,255,.04); }
.ss-hold-row.ss-hold-active {
  background: rgba(0,212,160,.08);
  outline: 1px solid rgba(0,212,160,.3);
}
.ss-hold-row td {
  padding: 6px 8px;
  vertical-align: middle;
}
.ss-hold-ticker {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 800;
  color: var(--accent);
}
.ss-hold-name {
  color: var(--text);
  font-size: 11px;
  max-width: 140px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ss-hold-weight {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  color: var(--text);
}
.ss-hold-sector {
  font-size: 10px;
  color: var(--text-muted);
}
.ss-pos { color: #00d4a0; font-family: var(--font-mono); font-size: 10px; }
.ss-neg { color: #ff4757; font-family: var(--font-mono); font-size: 10px; }

.ss-hold-btn {
  padding: 2px 7px;
  font-size: 9px;
  font-weight: 700;
  background: transparent;
  border: 1px solid rgba(0,212,160,.3);
  color: var(--accent);
  border-radius: 3px;
  cursor: pointer;
  white-space: nowrap;
  transition: all .15s;
}
.ss-hold-btn:hover {
  background: rgba(0,212,160,.1);
  border-color: var(--accent);
}

.ss-hold-empty {
  padding: 20px;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.7;
}

/* ── Holding click toast ───────────────────────────────────────── */
.ss-toast {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-panel);
  border: 1px solid var(--accent);
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 11px;
  color: var(--text);
  z-index: 9999;
  box-shadow: 0 4px 20px rgba(0,0,0,.5);
  transition: opacity .4s;
  white-space: nowrap;
}
.ss-toast strong { color: var(--accent); }

/* ══════════════════════════════════════════════════════════════════
   NEW SOURCES — FRED · Finnhub Econ Calendar · FMP DIV/FILINGS
   CoinGecko · Frankfurter · WM GPS/MilOps/OREF/Telegram/ETF/Sectors
   ══════════════════════════════════════════════════════════════════ */

/* ── FRED Yield Curve ────────────────────────────────────────────── */
.fred-section-head {
  font-size: 11px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase;
  color: var(--accent); padding: 8px 10px 4px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 8px;
}
.fred-badge { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 3px; }
.fred-badge-ok   { background: rgba(76,175,80,.25); color: #4caf50; }
.fred-badge-warn { background: rgba(255,77,77,.25);  color: #ff4d4d; }
.fred-date { font-size: 10px; color: var(--text-dim); font-weight: 400; margin-left: auto; }
.fred-yield-svg  { width: 100%; height: auto; display: block; padding: 4px 8px; }
.fred-yield-grid {
  display: flex; flex-wrap: wrap; gap: 4px; padding: 8px;
}
.fred-yield-cell {
  display: flex; flex-direction: column; align-items: center;
  background: var(--bg-row); border: 1px solid var(--border);
  border-radius: 4px; padding: 4px 8px; min-width: 44px;
}
.fred-y-label { font-size: 9px; color: var(--text-dim); text-transform: uppercase; }
.fred-y-val   { font-size: 12px; font-weight: 700; color: var(--text); }

.fred-spread-list { padding: 4px 8px; }
.fred-spread-row  {
  display: grid; grid-template-columns: 120px 1fr 60px;
  align-items: center; gap: 8px;
  padding: 5px 0; border-bottom: 1px solid var(--border);
}
.fred-spread-label { font-size: 11px; font-weight: 600; color: var(--text); }
.fred-spread-note  { font-size: 10px; color: var(--text-dim); }
.fred-spread-val   { font-size: 12px; font-weight: 700; text-align: right; }
.fred-pos  { color: #4caf50; }
.fred-neg  { color: #f44336; }
.fred-ok   { color: var(--accent); }
.fred-warn { color: #ffaa00; }

/* FRED Macro cards */
.fred-macro-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 6px; padding: 8px;
}
.fred-macro-card {
  background: var(--bg-row); border: 1px solid var(--border); border-radius: 6px;
  padding: 8px; display: flex; align-items: flex-start; gap: 6px; cursor: default;
  transition: border-color .2s;
}
.fred-macro-card:hover { border-color: var(--accent); }
.fred-mc-icon   { font-size: 20px; flex-shrink: 0; }
.fred-mc-body   { min-width: 0; }
.fred-mc-label  { font-size: 9px; color: var(--text-dim); text-transform: uppercase; letter-spacing: .3px; }
.fred-mc-val    { font-size: 16px; font-weight: 700; color: var(--text); }
.fred-mc-chg    { font-size: 10px; font-weight: 600; }
.fred-mc-date   { font-size: 9px; color: var(--text-dim); }

/* Sparklines */
.fred-spark-row  { display: flex; gap: 12px; padding: 6px 10px; }
.fred-spark-cell { flex: 1; }
.fred-spark-label { font-size: 9px; color: var(--text-dim); text-transform: uppercase; }
.fred-spark-svg  { width: 100%; height: 36px; display: block; }
.fred-spark-val  { font-size: 11px; font-weight: 700; color: var(--accent); }

/* ── Finnhub Economic Calendar ───────────────────────────────────── */
.fh-econ-date-head {
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px;
  color: var(--accent); padding: 5px 10px 2px; background: var(--bg-row);
  border-bottom: 1px solid var(--border);
}
.fh-econ-row {
  display: grid;
  grid-template-columns: 18px 32px 1fr 64px 64px 64px;
  align-items: center; gap: 6px;
  padding: 4px 10px; border-bottom: 1px solid var(--border);
  font-size: 11px; color: var(--text);
}
.fh-econ-row:hover { background: var(--bg-row); }
.fh-econ-impact  { font-size: 10px; }
.fh-econ-country { font-size: 10px; color: var(--text-dim); font-weight: 600; }
.fh-econ-event   { font-size: 11px; }
.fh-econ-actual  { font-size: 11px; text-align: right; }
.fh-econ-est, .fh-econ-prev { font-size: 10px; color: var(--text-dim); text-align: right; }

/* ── FMP Dividends ───────────────────────────────────────────────── */
.div-summary-bar {
  display: flex; flex-wrap: wrap; gap: 6px; padding: 8px;
  border-bottom: 1px solid var(--border);
}
.div-sum-cell {
  flex: 1; min-width: 90px; background: var(--bg-row);
  border: 1px solid var(--border); border-radius: 4px; padding: 6px 8px;
}
.div-sum-label { font-size: 9px; color: var(--text-dim); text-transform: uppercase; display: block; }
.div-sum-val   { font-size: 13px; font-weight: 700; color: var(--text); }

.div-table-wrap { overflow-x: auto; padding: 0 8px 8px; }
.div-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.div-table th {
  text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .5px;
  color: var(--text-dim); padding: 4px 6px; border-bottom: 1px solid var(--border);
}
.div-table td { padding: 4px 6px; border-bottom: 1px solid var(--border); color: var(--text); }
.div-table tr:hover td { background: var(--bg-row); }

/* ── SEC EDGAR Filings ───────────────────────────────────────────── */
.sec-header {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; border-bottom: 1px solid var(--border); background: var(--bg-row);
}
.sec-badge {
  font-size: 9px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase;
  background: rgba(68,136,255,.2); color: var(--accent); padding: 2px 6px; border-radius: 3px;
}
.sec-note { font-size: 10px; color: var(--text-dim); }
.sec-filing-list  { padding: 0 8px 4px; }
.sec-filing-row {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 0; border-bottom: 1px solid var(--border); flex-wrap: wrap;
}
.sec-form-badge {
  font-size: 9px; font-weight: 700; padding: 2px 5px; border-radius: 3px;
  background: var(--bg-row); color: var(--accent); border: 1px solid var(--accent); white-space: nowrap;
}
.sec-entity { font-size: 11px; flex: 1; min-width: 80px; }
.sec-filed  { font-size: 10px; color: var(--text-dim); white-space: nowrap; }
.sec-period { font-size: 10px; color: var(--text-dim); }
.sec-link   { font-size: 10px; color: var(--accent); text-decoration: none; white-space: nowrap; }
.sec-link:hover { text-decoration: underline; }
.sec-all-link {
  font-size: 11px; color: var(--accent); text-decoration: none;
  padding: 4px 12px; border: 1px solid var(--accent); border-radius: 4px;
}
.sec-all-link:hover { background: rgba(68,136,255,.1); }

/* ── CoinGecko Crypto ────────────────────────────────────────────── */
.cg-global-bar {
  display: flex; flex-wrap: wrap; gap: 4px; padding: 8px;
  border-bottom: 1px solid var(--border); background: var(--bg-row);
}
.cg-glob-cell { flex: 1; min-width: 80px; text-align: center; }
.cg-glob-label { font-size: 9px; color: var(--text-dim); text-transform: uppercase; display: block; }
.cg-glob-val   { font-size: 12px; font-weight: 700; }

.cg-coin-list { overflow: auto; }
.cg-coin-row {
  display: grid;
  grid-template-columns: 24px 20px 100px 40px 80px 60px 60px 70px 1fr;
  align-items: center; gap: 4px;
  padding: 4px 8px; border-bottom: 1px solid var(--border);
  font-size: 11px; transition: background .1s;
}
.cg-coin-row:hover { background: var(--bg-row); }
.cg-coin-rank  { color: var(--text-dim); font-size: 9px; text-align: right; }
.cg-coin-img   { width: 18px; height: 18px; border-radius: 50%; }
.cg-coin-name  { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cg-coin-sym   { color: var(--text-dim); font-size: 9px; }
.cg-coin-price { font-weight: 700; text-align: right; }
.cg-coin-chg, .cg-coin-chg7 { font-size: 10px; text-align: right; }
.cg-coin-mc    { font-size: 10px; color: var(--text-dim); text-align: right; }
.cg-bar-wrap   { height: 4px; background: var(--border); border-radius: 2px; }
.cg-vol-bar    { height: 100%; background: var(--accent); border-radius: 2px; opacity: .6; }

/* ── Frankfurter FX ──────────────────────────────────────────────── */
.fkt-rates-strip {
  display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 8px;
  border-top: 1px solid var(--border); background: var(--bg-row); min-height: 28px;
}
.fkt-rate-chip {
  display: flex; gap: 4px; align-items: center;
  background: var(--bg-panel); border: 1px solid var(--border);
  border-radius: 3px; padding: 2px 6px; font-size: 10px;
}
.fkt-ccy  { color: var(--text-dim); font-size: 9px; text-transform: uppercase; }
.fkt-rate { font-weight: 700; color: var(--text); }
.fkt-history-strip { padding: 0 8px 6px; border-top: 1px solid var(--border); }
.fkt-hist-label {
  font-size: 10px; color: var(--text-dim); padding: 4px 0 2px; display: flex; align-items: center; gap: 6px;
}
.fkt-hist-prices {
  display: flex; justify-content: space-between; font-size: 10px; color: var(--text-dim); padding-top: 2px;
}
.fkt-err { font-size: 10px; color: var(--text-dim); padding: 6px; }

/* ── WM GPS Jamming ─────────────────────────────────────────────── */
.wm-gps-list { overflow: auto; }
.wm-gps-row {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px;
  padding: 5px 10px; border-bottom: 1px solid var(--border); font-size: 11px;
}
.wm-gps-row:hover { background: var(--bg-row); }
.wm-gps-sev    { font-size: 10px; }
.wm-gps-region { font-weight: 600; }
.wm-gps-desc   { color: var(--text-dim); font-size: 10px; flex: 1; }
.wm-gps-date   { font-size: 9px; color: var(--text-dim); margin-left: auto; }

/* ── WM Military Ops ────────────────────────────────────────────── */
.wm-milops-list { overflow: auto; }
.wm-milops-type-head {
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px;
  color: var(--accent); padding: 5px 10px 2px; background: var(--bg-row);
  border-bottom: 1px solid var(--border);
}
.wm-milops-row {
  display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
  padding: 4px 10px; border-bottom: 1px solid var(--border); font-size: 11px;
}
.wm-milops-row:hover { background: var(--bg-row); }
.wm-milops-cs     { font-weight: 700; min-width: 80px; color: var(--accent); }
.wm-milops-region { color: var(--text-dim); }
.wm-milops-note   { font-size: 10px; color: var(--text-dim); }

/* ── WM OREF Alerts ─────────────────────────────────────────────── */
.wm-oref-clear {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 140px; color: var(--text);
}
.wm-oref-list { overflow: auto; }
.wm-oref-row  {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 8px 10px; border-bottom: 1px solid var(--border);
  animation: wm-oref-flash .5s ease 3;
}
@keyframes wm-oref-flash {
  0%,100% { background: transparent; }
  50%      { background: rgba(255,34,34,.15); }
}
.wm-oref-icon { font-size: 18px; flex-shrink: 0; }
.wm-oref-zone  { font-size: 13px; font-weight: 700; color: #ff4d4d; }
.wm-oref-meta  { font-size: 10px; color: var(--text-dim); }
.wm-oref-instr { font-size: 10px; color: var(--text); margin-top: 2px; }

/* ── WM Telegram Feed ───────────────────────────────────────────── */
.wm-tg-list { overflow: auto; }
.wm-tg-row  {
  padding: 8px 10px; border-bottom: 1px solid var(--border);
  transition: background .15s;
}
.wm-tg-row:hover { background: var(--bg-row); }
.wm-tg-head    { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
.wm-tg-channel { font-size: 10px; font-weight: 700; color: var(--accent); }
.wm-tg-lang    { font-size: 9px; background: var(--bg-row); padding: 1px 4px; border-radius: 2px; color: var(--text-dim); }
.wm-tg-ts      { font-size: 9px; color: var(--text-dim); margin-left: auto; }
.wm-tg-text    { font-size: 11px; color: var(--text); line-height: 1.4; }
.wm-tg-tags    { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; }

/* ── WM ETF Flows ───────────────────────────────────────────────── */
.wm-flows-list { overflow: auto; }
.wm-flows-row  {
  display: grid; grid-template-columns: 60px 1fr 80px 50px;
  align-items: center; gap: 8px;
  padding: 5px 10px; border-bottom: 1px solid var(--border); font-size: 11px;
}
.wm-flows-row:hover { background: var(--bg-row); }
.wm-flows-ticker { font-weight: 700; color: var(--accent); }
.wm-flows-name   { color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wm-flows-flow   { font-weight: 700; text-align: right; }
.wm-flows-period { font-size: 9px; color: var(--text-dim); text-align: right; }

/* ── WM Sector Heatmap ──────────────────────────────────────────── */
.wm-sector-heatmap {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 3px; padding: 8px;
}
.wm-sector-cell {
  border-radius: 4px; padding: 6px 8px; cursor: pointer;
  transition: opacity .2s, transform .2s; text-align: center;
}
.wm-sector-cell:hover { opacity: .85; transform: scale(1.03); }
.wm-sector-name { font-size: 9px; color: #fff; font-weight: 600; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; }
.wm-sector-chg  { font-size: 13px; font-weight: 800; color: #fff; }
.wm-sector-etf  { font-size: 8px; color: rgba(255,255,255,.7); }

.wm-sector-list { padding: 0 8px 8px; }
.wm-sector-row  {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 0; border-bottom: 1px solid var(--border); font-size: 11px;
}
.wm-sector-row-name { flex: 1; font-weight: 600; }
.wm-sector-row-chg  { font-weight: 700; min-width: 56px; text-align: right; }
.wm-sector-leader   { font-size: 10px; color: var(--accent); }
.wm-sector-vol      { font-size: 9px; color: var(--text-dim); }

/* shared pos/neg */
.wm-pos { color: #4caf50; }
.wm-neg { color: #f44336; }

/* ══════════════════════════════════════════════════════════════════
   TECHNICAL INDICATORS  (fund-tech tab)
   ══════════════════════════════════════════════════════════════════ */
.tech-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 8px;
  padding: 8px 0;
}
.tech-card {
  background: var(--panel-bg, #0d1117);
  border: 0.5px solid var(--border, #2a2f3a);
  border-radius: 6px;
  padding: 10px 12px;
}
.tech-card-hd {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .06em;
  color: var(--muted, #6e7681);
  text-transform: uppercase;
  margin-bottom: 4px;
}
.tech-card-val {
  font-size: 20px;
  font-weight: 600;
  color: var(--fg, #e6edf3);
  line-height: 1.1;
  margin-bottom: 2px;
}
.tech-card-sig {
  font-size: 11px;
  color: var(--muted, #6e7681);
  margin-bottom: 6px;
}
.tech-card-note {
  font-size: 10px;
  color: var(--muted, #6e7681);
  margin-top: 5px;
  line-height: 1.4;
}
.tech-sig-buy     { color: #3fb950 !important; }
.tech-sig-sell    { color: #f85149 !important; }
.tech-sig-neutral { color: #d29922 !important; }

/* ══════════════════════════════════════════════════════════════════
   SHORT INTEREST
   ══════════════════════════════════════════════════════════════════ */
.short-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 6px;
  margin: 8px 0 12px;
}
.short-kpi {
  background: var(--panel-bg, #0d1117);
  border: 0.5px solid var(--border, #2a2f3a);
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.short-kpi-lbl {
  font-size: 10px;
  color: var(--muted, #6e7681);
  text-transform: uppercase;
  letter-spacing: .04em;
}
.short-kpi-val {
  font-size: 18px;
  font-weight: 600;
  color: var(--fg, #e6edf3);
}

/* ══════════════════════════════════════════════════════════════════
   REVENUE SEGMENTATION
   ══════════════════════════════════════════════════════════════════ */
.seg-section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted, #6e7681);
  text-transform: uppercase;
  letter-spacing: .05em;
  margin: 10px 0 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.seg-date {
  font-weight: 400;
  font-size: 10px;
  color: var(--muted, #6e7681);
  text-transform: none;
  letter-spacing: 0;
}
.seg-bars { display: flex; flex-direction: column; gap: 5px; }
.seg-row {
  display: grid;
  grid-template-columns: 140px 1fr 42px 52px;
  gap: 6px;
  align-items: center;
  font-size: 11px;
}
.seg-label {
  color: var(--fg, #e6edf3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.seg-bar-wrap {
  background: rgba(255,255,255,.06);
  border-radius: 3px;
  height: 6px;
  overflow: hidden;
}
.seg-bar { height: 6px; border-radius: 3px; transition: width .5s ease; }
.seg-pct { color: var(--muted, #6e7681); text-align: right; font-size: 10px; }
.seg-val { color: var(--fg, #e6edf3); text-align: right; }

/* ══════════════════════════════════════════════════════════════════
   EARNINGS TRANSCRIPTS
   ══════════════════════════════════════════════════════════════════ */
.trans-list { display: flex; flex-direction: column; gap: 4px; margin: 8px 0; }
.trans-list-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  background: var(--panel-bg, #0d1117);
  border: 0.5px solid var(--border, #2a2f3a);
  border-radius: 5px;
  font-size: 12px;
}
.trans-label { font-weight: 600; color: var(--fg, #e6edf3); min-width: 55px; }
.trans-date  { color: var(--muted, #6e7681); flex: 1; }
.trans-load-btn {
  background: transparent;
  border: 0.5px solid var(--border, #2a2f3a);
  color: var(--link, #58a6ff);
  border-radius: 4px;
  padding: 3px 10px;
  font-size: 11px;
  cursor: pointer;
  transition: background .15s;
}
.trans-load-btn:hover { background: rgba(88,166,255,.1); }
.trans-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 8px;
}
.trans-title { font-weight: 600; font-size: 13px; color: var(--fg, #e6edf3); }
.trans-meta  { font-size: 11px; color: var(--muted, #6e7681); }
.trans-body  {
  font-size: 11px;
  line-height: 1.6;
  color: var(--fg, #e6edf3);
  max-height: 420px;
  overflow-y: auto;
  padding: 8px 10px;
  background: var(--panel-bg, #0d1117);
  border: 0.5px solid var(--border, #2a2f3a);
  border-radius: 5px;
}

/* ══════════════════════════════════════════════════════════════════
   USGS EARTHQUAKES
   ══════════════════════════════════════════════════════════════════ */
.usgs-stats {
  display: flex;
  gap: 14px;
  font-size: 11px;
  color: var(--muted, #6e7681);
  margin: 6px 0 8px;
  flex-wrap: wrap;
}
.usgs-stats strong { color: var(--fg, #e6edf3); }
.usgs-list { display: flex; flex-direction: column; gap: 4px; }
.usgs-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 5px;
  background: var(--panel-bg, #0d1117);
  border: 0.5px solid var(--border, #2a2f3a);
}
.usgs-mag {
  min-width: 38px;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 5px;
  border-radius: 4px;
  color: #fff;
  flex-shrink: 0;
}
.usgs-info  { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.usgs-loc   { font-size: 12px; color: var(--fg, #e6edf3); line-height: 1.3; }
.usgs-meta  { font-size: 10px; color: var(--muted, #6e7681); }
.usgs-link  { font-size: 11px; color: var(--link, #58a6ff); text-decoration: none; flex-shrink: 0; }
.usgs-link:hover { text-decoration: underline; }
.usgs-tsunami { color: #4a9eff; font-size: 10px; font-weight: 600; }
.usgs-alert {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  text-transform: uppercase;
}
.usgs-alert-green  { background: #1a4a1a; color: #3fb950; }
.usgs-alert-yellow { background: #4a3a00; color: #d29922; }
.usgs-alert-orange { background: #4a2a00; color: #f0883e; }
.usgs-alert-red    { background: #4a0f0f; color: #f85149; }

/* ══════════════════════════════════════════════════════════════════
   OPEN-METEO SUPPLY WEATHER
   ══════════════════════════════════════════════════════════════════ */
.meteo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
  padding: 8px 0;
}
.meteo-card {
  background: var(--panel-bg, #0d1117);
  border: 0.5px solid var(--border, #2a2f3a);
  border-radius: 6px;
  padding: 10px 12px;
}
.meteo-card.meteo-extreme {
  border-color: #f85149;
  background: rgba(248,81,73,.06);
}
.meteo-name  { font-size: 10px; font-weight: 600; color: var(--muted, #6e7681); margin-bottom: 4px; text-transform: uppercase; letter-spacing: .04em; }
.meteo-icon  { font-size: 22px; line-height: 1; margin: 4px 0; }
.meteo-cond  { font-size: 12px; color: var(--fg, #e6edf3); margin-bottom: 6px; }
.meteo-vals  { display: flex; flex-direction: column; gap: 2px; }
.meteo-vals span { font-size: 11px; color: var(--muted, #6e7681); }
.meteo-warn  { font-size: 10px; color: #f85149; font-weight: 600; margin-top: 5px; }
.meteo-error { opacity: .5; }

/* ══════════════════════════════════════════════════════════════════
   NOAA ALERTS
   ══════════════════════════════════════════════════════════════════ */
.noaa-count {
  font-size: 11px;
  color: var(--muted, #6e7681);
  margin: 6px 0 8px;
}
.noaa-alert-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 5px;
  background: var(--panel-bg, #0d1117);
  border: 0.5px solid var(--border, #2a2f3a);
  margin-bottom: 4px;
}
.noaa-sev {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
  color: #000;
  flex-shrink: 0;
  white-space: nowrap;
}
.noaa-info  { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.noaa-event { font-size: 12px; font-weight: 600; color: var(--fg, #e6edf3); }
.noaa-area  { font-size: 11px; color: var(--muted, #6e7681); }
.noaa-meta  { font-size: 10px; color: var(--muted, #6e7681); }

/* ══════════════════════════════════════════════════════════════════
   NASA EONET
   ══════════════════════════════════════════════════════════════════ */
.eonet-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 6px 0 10px;
}
.eonet-cat-pill {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  border: 0.5px solid;
  background: transparent;
}
.eonet-cat-pill strong { font-size: 11px; }
.eonet-list { display: flex; flex-direction: column; gap: 4px; }
.eonet-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 5px;
  background: var(--panel-bg, #0d1117);
  border: 0.5px solid var(--border, #2a2f3a);
}
.eonet-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 4px;
}
.eonet-info  { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.eonet-title { font-size: 12px; color: var(--fg, #e6edf3); }
.eonet-meta  { font-size: 10px; color: var(--muted, #6e7681); }

/* ══════════════════════════════════════════════════════════════════
   OPEN EXCHANGE RATES
   ══════════════════════════════════════════════════════════════════ */
.oer-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0;
}
.oer-pair {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--panel-bg, #0d1117);
  border: 0.5px solid var(--border, #2a2f3a);
  border-radius: 5px;
  padding: 5px 10px;
  min-width: 62px;
}
.oer-ccy  { font-size: 10px; font-weight: 600; color: var(--muted, #6e7681); letter-spacing: .04em; }
.oer-rate { font-size: 12px; font-weight: 600; color: var(--fg, #e6edf3); }

.oer-hist-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}
.oer-hist-pair { font-size: 13px; font-weight: 600; color: var(--fg, #e6edf3); }
.oer-hist-rate { font-size: 18px; font-weight: 600; color: var(--fg, #e6edf3); }
.oer-hist-dates {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--muted, #6e7681);
}
.oer-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 340px;
  overflow-y: auto;
}
.oer-list-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}
.oer-list-row:hover { background: rgba(255,255,255,.04); }

/* ══════════════════════════════════════════════════════════════════
   AIR QUALITY
   ══════════════════════════════════════════════════════════════════ */
.aq-summary {
  font-size: 14px;
  font-weight: 600;
  margin: 6px 0 8px;
}
.aq-grid { display: flex; flex-direction: column; gap: 4px; }
.aq-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  padding: 4px 0;
  border-bottom: 0.5px solid var(--border, #2a2f3a);
}
.aq-row:last-child { border-bottom: none; }
.aq-row span:first-child { color: var(--muted, #6e7681); }
.aq-row span:last-child  { color: var(--fg, #e6edf3); font-weight: 500; }

/* ══════════════════════════════════════════════════════════════════
   SEC LINK (insider filings)
   ══════════════════════════════════════════════════════════════════ */
.sec-link {
  font-size: 11px;
  color: var(--link, #58a6ff);
  text-decoration: none;
}
.sec-link:hover { text-decoration: underline; }

/* Insider transactions positive/negative already covered by .pos/.neg */


/* ══════════════════════════════════════════════════════════════════
   FEMA — OpenFEMA Disaster Declarations
   ══════════════════════════════════════════════════════════════════ */
.fema-header {
  font-size: 11px;
  color: var(--muted, #6e7681);
  margin-bottom: 8px;
}
.fema-list { display: flex; flex-direction: column; gap: 5px; }
.fema-row {
  background: rgba(255,255,255,.03);
  border: 1px solid var(--border, #2a2f3a);
  border-radius: 4px;
  padding: 7px 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.fema-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--fg, #e6edf3);
  line-height: 1.3;
}
.fema-meta {
  font-size: 11px;
  color: var(--muted, #6e7681);
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.fema-state {
  font-size: 11px;
  font-weight: 700;
  color: #f0a500;
  letter-spacing: .5px;
}
.fema-programs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 2px;
}
.fema-prog-badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(88,166,255,.12);
  color: var(--link, #58a6ff);
  font-weight: 600;
  letter-spacing: .3px;
}

/* ══════════════════════════════════════════════════════════════════
   IPO CALENDAR — Macro Intel panel
   ══════════════════════════════════════════════════════════════════ */
.ipo-header {
  font-size: 11px;
  color: var(--muted, #6e7681);
  margin-bottom: 8px;
}
.ipo-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.ipo-table th {
  text-align: left;
  color: var(--muted, #6e7681);
  font-weight: 600;
  padding: 3px 6px 5px;
  border-bottom: 1px solid var(--border, #2a2f3a);
  font-size: 10px;
  letter-spacing: .5px;
  text-transform: uppercase;
}
.ipo-table td {
  padding: 5px 6px;
  border-bottom: 0.5px solid rgba(255,255,255,.05);
  color: var(--fg, #e6edf3);
  vertical-align: top;
}
.ipo-table tr:last-child td { border-bottom: none; }
.ipo-table tr:hover td { background: rgba(255,255,255,.03); }
.ipo-sym {
  font-weight: 700;
  color: var(--link, #58a6ff);
  font-size: 12px;
}
.ipo-company {
  font-size: 11px;
  color: var(--fg, #e6edf3);
  max-width: 140px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ipo-date { color: var(--muted, #6e7681); font-size: 11px; }
.ipo-exch { color: #f0a500; font-size: 10px; font-weight: 600; }
.ipo-price { color: #3fb950; font-size: 11px; }
.ipo-shares { color: var(--muted, #6e7681); font-size: 10px; }

/* ══════════════════════════════════════════════════════════════════
   OER CURRENCY CONVERTER
   ══════════════════════════════════════════════════════════════════ */
.oer-converter {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  margin: 8px 0;
  background: rgba(255,255,255,.03);
  border: 1px solid var(--border, #2a2f3a);
  border-radius: 5px;
  padding: 8px 10px;
}
.oer-convert-input {
  background: rgba(255,255,255,.06);
  border: 1px solid var(--border, #2a2f3a);
  color: var(--fg, #e6edf3);
  font-size: 12px;
  padding: 4px 7px;
  border-radius: 4px;
  width: 70px;
}
.oer-convert-select {
  background: rgba(255,255,255,.06);
  border: 1px solid var(--border, #2a2f3a);
  color: var(--fg, #e6edf3);
  font-size: 12px;
  padding: 4px 7px;
  border-radius: 4px;
}
.oer-convert-btn {
  background: var(--link, #58a6ff);
  color: #000;
  border: none;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  cursor: pointer;
}
.oer-convert-btn:hover { opacity: .85; }
.oer-convert-result {
  font-size: 13px;
  font-weight: 700;
  color: #3fb950;
  margin-left: 4px;
}

/* ══════════════════════════════════════════════════════════════════
   ALERT FEED — WM filter bar (hidden when NOAA/EONET tab active)
   ══════════════════════════════════════════════════════════════════ */
#alert-wm-filters { transition: max-height .2s ease, opacity .2s ease; }
#alert-wm-filters.hidden {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
}

/* Tab pane inside alert feed panel */
#panel-alert .tab-pane { display: none; }
#panel-alert .tab-pane.active { display: block; }

/* ══════════════════════════════════════════════════════════════════
   NOAA Active Alerts  (extended — more detail rows)
   ══════════════════════════════════════════════════════════════════ */
.noaa-alert-desc {
  font-size: 11px;
  color: var(--muted, #6e7681);
  margin-top: 3px;
  line-height: 1.4;
  max-height: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.noaa-sev-extreme  { background: rgba(210,42,42,.22); border-color: rgba(210,42,42,.5); }
.noaa-sev-severe   { background: rgba(224,120,0,.18); border-color: rgba(224,120,0,.45); }
.noaa-sev-moderate { background: rgba(240,165,0,.14); border-color: rgba(240,165,0,.4); }

/* ══════════════════════════════════════════════════════════════════
   METEO / SUPPLY WEATHER — extended
   ══════════════════════════════════════════════════════════════════ */
.meteo-wind { font-size: 10px; color: var(--muted, #6e7681); margin-top: 2px; }
.meteo-precip { font-size: 10px; color: #58a6ff; }
.meteo-aqi { font-size: 10px; color: #f0a500; }

/* ══════════════════════════════════════════════════════════════════
   FORM 4 — Insider trading (SEC EDGAR / Finnhub fallback)
   ══════════════════════════════════════════════════════════════════ */
.form4-header { font-size: 11px; color: var(--muted, #6e7681); margin-bottom: 8px; }
.form4-list { display: flex; flex-direction: column; gap: 5px; }
.form4-row {
  background: rgba(255,255,255,.03);
  border: 1px solid var(--border, #2a2f3a);
  border-radius: 4px;
  padding: 7px 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.form4-row:hover { background: rgba(255,255,255,.055); }
.form4-name { font-size: 12px; font-weight: 600; color: var(--fg, #e6edf3); }
.form4-meta { font-size: 11px; color: var(--muted, #6e7681); display: flex; gap: 10px; flex-wrap: wrap; }
.form4-buy  { color: #3fb950; font-weight: 700; }
.form4-sell { color: #f85149; font-weight: 700; }
.form4-value { color: var(--fg, #e6edf3); font-size: 12px; font-weight: 500; }

/* ══════════════════════════════════════════════════════════════════
   EARNINGS TRANSCRIPTS — extended styles
   ══════════════════════════════════════════════════════════════════ */
.trans-body {
  font-size: 11px;
  color: var(--fg, #e6edf3);
  line-height: 1.6;
  margin-top: 8px;
  white-space: pre-wrap;
  max-height: 420px;
  overflow-y: auto;
  padding: 8px;
  background: rgba(255,255,255,.025);
  border-radius: 4px;
  border: 1px solid var(--border, #2a2f3a);
}
.trans-body::-webkit-scrollbar { width: 4px; }
.trans-body::-webkit-scrollbar-track { background: transparent; }
.trans-body::-webkit-scrollbar-thumb { background: var(--border, #2a2f3a); border-radius: 2px; }

/* ══════════════════════════════════════════════════════════════════
   TECHNICAL INDICATORS — sparklines & signals (extended)
   ══════════════════════════════════════════════════════════════════ */
.tech-card-chart { margin: 4px 0 2px; display: block; }
.tech-sig-warning { background: rgba(240,165,0,.15); color: #f0a500; }

/* ══════════════════════════════════════════════════════════════════
   REVENUE SEGMENTATION — extended bar detail
   ══════════════════════════════════════════════════════════════════ */
.seg-geo-label { font-size: 10px; color: #58a6ff; font-weight: 600; letter-spacing: .3px; }
.seg-prod-label { font-size: 10px; color: #3fb950; font-weight: 600; letter-spacing: .3px; }
.seg-bar.geo { background: linear-gradient(90deg, #58a6ff44, #58a6ff88); }
.seg-bar.prod { background: linear-gradient(90deg, #3fb95044, #3fb95088); }

/* ══════════════════════════════════════════════════════════════════
   YAHOO FINANCE COMPONENTS
   ══════════════════════════════════════════════════════════════════ */
.yf-no-key {
  padding: 16px;
  color: var(--muted, #6e7681);
  font-size: 12px;
  border: 0.5px solid var(--border, #2a2f3a);
  border-radius: 6px;
  background: var(--panel-bg, #0d1117);
  margin: 8px 0;
}
.yf-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--muted, #6e7681);
  padding: 12px 0;
}

/* Quote hero */
.yf-quote-hero {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 0 12px;
  border-bottom: 0.5px solid var(--border, #2a2f3a);
  margin-bottom: 10px;
}
.yf-quote-name  { font-size: 11px; color: var(--muted, #6e7681); }
.yf-quote-price { font-size: 28px; font-weight: 700; color: var(--fg, #e6edf3); line-height: 1.1; }
.yf-quote-chg   { font-size: 13px; font-weight: 600; }
.yf-quote-exch  { font-size: 10px; color: var(--muted, #6e7681); margin-top: 2px; }

/* KPI grid */
.yf-kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 6px;
}
.yf-kpi {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--panel-bg, #0d1117);
  border: 0.5px solid var(--border, #2a2f3a);
  border-radius: 5px;
  padding: 6px 9px;
}
.yf-kpi-lbl { font-size: 10px; color: var(--muted, #6e7681); text-transform: uppercase; letter-spacing: .04em; }
.yf-kpi-val { font-size: 13px; font-weight: 600; color: var(--fg, #e6edf3); }

/* Financials table */
.yf-fin-table-wrap {
  overflow-x: auto;
  margin-top: 8px;
}
.yf-fin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.yf-fin-table th {
  background: rgba(255,255,255,.04);
  color: var(--muted, #6e7681);
  font-weight: 600;
  padding: 5px 8px;
  text-align: right;
  white-space: nowrap;
  border-bottom: 0.5px solid var(--border, #2a2f3a);
}
.yf-fin-table th:first-child { text-align: left; }
.yf-fin-table td {
  padding: 5px 8px;
  border-bottom: 0.5px solid rgba(255,255,255,.05);
  text-align: right;
  color: var(--fg, #e6edf3);
}
.yf-fin-table tr:hover td { background: rgba(255,255,255,.03); }
.yf-fin-label { text-align: left !important; color: var(--muted, #6e7681) !important; font-size: 11px; }

/* Options chain */
.yf-opts-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.yf-opts-sym  { font-size: 14px; font-weight: 700; color: var(--fg, #e6edf3); }
.yf-opts-exp  { font-size: 11px; color: var(--muted, #6e7681); }
.yf-opts-toggle { display: flex; gap: 4px; margin-left: auto; }
.yf-opts-btn {
  background: transparent;
  border: 0.5px solid var(--border, #2a2f3a);
  color: var(--muted, #6e7681);
  border-radius: 4px;
  padding: 4px 12px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background .15s, color .15s;
}
.yf-opts-btn.active,
.yf-opts-btn:hover {
  background: rgba(88,166,255,.12);
  color: var(--link, #58a6ff);
  border-color: var(--link, #58a6ff);
}
.yf-opts-body { overflow-x: auto; }
.yf-opts-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  white-space: nowrap;
}
.yf-opts-table th {
  background: rgba(255,255,255,.04);
  color: var(--muted, #6e7681);
  padding: 4px 7px;
  text-align: right;
  border-bottom: 0.5px solid var(--border, #2a2f3a);
  font-size: 10px;
}
.yf-opts-table td { padding: 4px 7px; text-align: right; border-bottom: 0.5px solid rgba(255,255,255,.04); color: var(--fg, #e6edf3); }
.yf-opts-table tr.yf-itm td { background: rgba(63,185,80,.06); }
.yf-strike { font-weight: 700 !important; }
.yf-opts-empty { font-size: 12px; color: var(--muted, #6e7681); padding: 12px 0; }

/* Holders */
.yf-holders-title { font-size: 11px; font-weight: 600; color: var(--muted, #6e7681); text-transform: uppercase; letter-spacing: .04em; margin: 8px 0 6px; }
.yf-hold-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.yf-hold-table th { background: rgba(255,255,255,.04); color: var(--muted, #6e7681); padding: 4px 8px; text-align: right; border-bottom: 0.5px solid var(--border, #2a2f3a); font-size: 10px; }
.yf-hold-table th:first-child { text-align: left; }
.yf-hold-table td { padding: 4px 8px; border-bottom: 0.5px solid rgba(255,255,255,.04); text-align: right; color: var(--fg, #e6edf3); }
.yf-hold-table tr:hover td { background: rgba(255,255,255,.03); }
.yf-hold-name { text-align: left !important; font-size: 11px; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Trending */
.yf-trend-grid { display: flex; flex-direction: column; gap: 3px; }
.yf-trend-row {
  display: grid;
  grid-template-columns: 55px 1fr 60px 55px;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 4px;
  cursor: pointer;
  align-items: center;
  transition: background .12s;
  border: 0.5px solid transparent;
}
.yf-trend-row:hover { background: rgba(255,255,255,.04); border-color: var(--border, #2a2f3a); }
.yf-trend-sym   { font-size: 12px; font-weight: 700; color: var(--link, #58a6ff); }
.yf-trend-name  { font-size: 11px; color: var(--muted, #6e7681); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.yf-trend-price { font-size: 12px; color: var(--fg, #e6edf3); text-align: right; font-weight: 600; }
.yf-trend-chg   { font-size: 11px; text-align: right; font-weight: 600; }

/* History */
.yf-hist-header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
.yf-hist-sym    { font-size: 14px; font-weight: 700; color: var(--fg, #e6edf3); }
.yf-hist-period { font-size: 11px; color: var(--muted, #6e7681); }
.yf-hist-ret    { font-size: 13px; font-weight: 600; margin-left: auto; }
.yf-hist-chart  { width: 100%; height: 50px; display: block; margin: 4px 0; }
.yf-hist-range  { font-size: 11px; color: var(--muted, #6e7681); }


/* ══════════════════════════════════════════════════════════════════
   TASK 1 — Intel Feed tab click fix (z-index over resize handles)
   ══════════════════════════════════════════════════════════════════ */
.wm-intel-tabs {
  position: relative;
  z-index: 12; /* above resize-handle z-index:10 */
}

/* ══════════════════════════════════════════════════════════════════
   TASK 2 — Dual Chart
   ══════════════════════════════════════════════════════════════════ */
.chart-split-wrap {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
.chart-split-wrap.single .chart-half { width: 100%; }
.chart-split-wrap.dual   .chart-half { width: 50%; border-right: 1px solid var(--border); }
.chart-split-wrap.dual   .chart-half:last-child { border-right: none; }
.chart-half { height: 100%; flex: 1 1 auto; }

/* ══════════════════════════════════════════════════════════════════
   TASK 4 — Scorecard
   ══════════════════════════════════════════════════════════════════ */
.sc-card {
  padding: 0 4px;
  font-size: 12px;
}
.sc-header {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px;
  padding: 10px 8px 8px; border-bottom: 1px solid var(--border);
}
.sc-sym  { font-family: var(--font-mono); font-size: 16px; font-weight: 800; color: var(--text); }
.sc-name { font-size: 11px; color: var(--text-muted); flex: 1; min-width: 80px; }
.sc-price { font-size: 15px; font-weight: 700; color: var(--accent); margin-left: auto; }
.sc-exchange { font-size: 9px; color: var(--text-muted); letter-spacing: .04em; }

.sc-section { padding: 10px 8px 8px; }
.sc-section-border { border-bottom: 1px solid var(--border); }
.sc-section-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.sc-section-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); }
.sc-section-badge { font-size: 11px; font-weight: 700; }

.sc-bar-wrap { margin: 4px 0 6px; }
.sc-bar-track { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
.sc-bar-fill  { height: 100%; border-radius: 3px; transition: width .4s ease; }
.sc-bar-labels { display: flex; justify-content: space-between; font-size: 8px; color: var(--text-muted); margin-top: 2px; }

.sc-kpi-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
.sc-kpi { font-size: 10px; color: var(--text-muted); }
.sc-kpi b { color: var(--text); }

.sc-fv-row { display: flex; justify-content: space-between; align-items: center; padding: 3px 0; border-bottom: 1px solid var(--border-faint, rgba(255,255,255,.04)); }
.sc-fv-label { font-size: 10px; color: var(--text-muted); }
.sc-fv-val   { font-size: 11px; font-weight: 600; color: var(--text); font-family: var(--font-mono); }

.sc-gauge-wrap { display: flex; justify-content: center; padding: 4px 0; }
.sc-gauge-svg  { width: 90px; height: 50px; }

.sc-consensus-pills { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 6px; }
.sc-pill        { font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 10px; }
.sc-pill-buy    { background: #3fb95020; border: 1px solid #3fb950; color: #3fb950; }
.sc-pill-hold   { background: #d2992220; border: 1px solid #d29922; color: #d29922; }
.sc-pill-sell   { background: #f8514920; border: 1px solid #f85149; color: #f85149; }

.sc-members-row { display: flex; gap: 8px; }
.sc-nodata { font-size: 10px; color: var(--text-muted); font-style: italic; padding: 4px 0; }
.sc-protip  { font-size: 10px; color: var(--text-muted); line-height: 1.6; }

/* ══════════════════════════════════════════════════════════════════
   TASK 5 — Comparables single view
   ══════════════════════════════════════════════════════════════════ */
.comp-main-content { padding: 0; overflow-y: auto; }
.comp-peers-header { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px 6px; border-bottom: 1px solid var(--border); }
.comp-peers-title  { font-size: 11px; font-weight: 700; color: var(--text); }
.comp-peers-hint   { font-size: 9px; color: var(--text-muted); }

.comp-peer-row {
  display: grid;
  grid-template-columns: 22px 1fr auto 60px 14px;
  gap: 6px; align-items: center;
  padding: 8px 12px; border-bottom: 1px solid var(--border);
  cursor: pointer; transition: background .12s;
}
.comp-peer-row:hover, .comp-peer-row.comp-peer-open { background: rgba(255,255,255,.04); }
.comp-peer-current { border-left: 3px solid var(--accent); padding-left: 9px; }

.comp-peer-rank  { font-size: 9px; color: var(--text-muted); font-family: var(--font-mono); }
.comp-peer-info  { display: flex; flex-direction: column; gap: 1px; overflow: hidden; }
.comp-peer-sym   { font-size: 12px; font-weight: 700; color: var(--accent); }
.comp-peer-name  { font-size: 9px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.comp-peer-nums  { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
.comp-peer-price { font-size: 11px; font-weight: 600; color: var(--text); font-family: var(--font-mono); }
.comp-peer-chg   { font-size: 10px; font-weight: 600; font-family: var(--font-mono); }
.comp-peer-mktcap { font-size: 10px; color: var(--text-muted); font-family: var(--font-mono); text-align: right; }
.comp-peer-expand-icon { font-size: 9px; color: var(--text-muted); transition: transform .15s; }
.comp-peer-open .comp-peer-expand-icon { transform: rotate(90deg); }

.comp-peer-detail { background: var(--bg-panel); border-bottom: 1px solid var(--border); }
.comp-peer-detail.hidden { display: none; }
.comp-detail-inner { padding: 10px 14px 12px; }
.comp-detail-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
.comp-detail-sym  { font-size: 13px; font-weight: 800; color: var(--accent); margin-right: 6px; }
.comp-detail-name { font-size: 10px; color: var(--text-muted); }
.comp-detail-load-btn { font-size: 10px; padding: 3px 8px; background: var(--accent); color: #000; border: none; border-radius: 3px; cursor: pointer; font-weight: 700; }
.comp-detail-desc { font-size: 10px; color: var(--text-muted); line-height: 1.5; margin-bottom: 8px; }
.comp-detail-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px 8px; margin-bottom: 6px; }
.comp-detail-kpi  { display: flex; flex-direction: column; gap: 1px; }
.comp-detail-kpi span { font-size: 9px; color: var(--text-muted); text-transform: uppercase; }
.comp-detail-kpi strong { font-size: 11px; color: var(--text); }
.comp-detail-links { font-size: 9px; color: var(--text-muted); }

/* ══════════════════════════════════════════════════════════════════
   TASK 6 — Webhooks panel
   ══════════════════════════════════════════════════════════════════ */
.wh-form { padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.wh-field-row { display: flex; flex-direction: column; gap: 3px; }
.wh-label  { font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted); font-weight: 700; }
.wh-input  { background: var(--bg-input, #161b22); border: 1px solid var(--border); color: var(--text); font-size: 11px; padding: 5px 8px; border-radius: 3px; font-family: var(--font-mono); }
.wh-input:focus { outline: none; border-color: var(--accent); }
.wh-select { background: var(--bg-input, #161b22); border: 1px solid var(--border); color: var(--text); font-size: 11px; padding: 5px 8px; border-radius: 3px; }
.wh-textarea { background: var(--bg-input, #161b22); border: 1px solid var(--border); color: var(--text); font-size: 10px; padding: 5px 8px; border-radius: 3px; font-family: var(--font-mono); resize: vertical; }
.wh-url-input { font-size: 10px; }
.wh-btn-row { display: flex; gap: 8px; }
.wh-btn-primary   { flex: 1; background: var(--accent); color: #000; border: none; border-radius: 3px; font-size: 11px; font-weight: 700; padding: 7px; cursor: pointer; }
.wh-btn-secondary { flex: 1; background: transparent; border: 1px solid var(--border); color: var(--text); border-radius: 3px; font-size: 11px; padding: 7px; cursor: pointer; }
.wh-btn-secondary:hover { border-color: var(--accent); }
.wh-status     { font-size: 10px; padding: 3px 0; min-height: 16px; }
.wh-status-ok  { color: #3fb950; }
.wh-status-err { color: #f85149; }

.wh-alert-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--border); gap: 8px; }
.wh-alert-active  { border-left: 3px solid #3fb950; }
.wh-alert-paused  { border-left: 3px solid var(--border); opacity: .6; }
.wh-alert-main { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; flex: 1; }
.wh-alert-sym     { font-size: 12px; font-weight: 700; color: var(--accent); font-family: var(--font-mono); }
.wh-alert-cond    { font-size: 11px; color: var(--text); }
.wh-alert-interval{ font-size: 9px; color: var(--text-muted); background: var(--border); padding: 1px 5px; border-radius: 2px; }
.wh-alert-note    { font-size: 9px; color: var(--text-muted); font-style: italic; }
.wh-alert-actions { display: flex; gap: 4px; }
.wh-act-btn        { background: transparent; border: 1px solid var(--border); color: var(--text-muted); font-size: 11px; padding: 3px 7px; border-radius: 3px; cursor: pointer; }
.wh-act-btn:hover  { border-color: var(--accent); color: var(--text); }
.wh-act-delete:hover { border-color: #f85149; color: #f85149; }

.wh-log-row { display: grid; grid-template-columns: 60px 50px 1fr auto; gap: 6px; padding: 5px 12px; border-bottom: 1px solid var(--border); font-size: 10px; }
.wh-log-time   { color: var(--text-muted); font-family: var(--font-mono); }
.wh-log-sym    { color: var(--accent); font-weight: 700; }
.wh-log-cond   { color: var(--text); }
.wh-log-status { font-weight: 700; }

/* ══════════════════════════════════════════════════════════════════
   TASK 7 — Left layout sidebar
   ══════════════════════════════════════════════════════════════════ */
.layout-sidebar {
  position: fixed;
  left: 0; top: 0; bottom: 0;
  width: 160px;
  background: var(--bg-sidebar, #0d1117);
  border-right: 1px solid var(--border);
  z-index: 500;
  display: flex;
  flex-direction: column;
  transition: transform .2s ease, width .2s ease;
  box-shadow: 2px 0 12px rgba(0,0,0,.4);
}
.layout-sidebar.collapsed {
  transform: translateX(-160px);
}
.layout-sidebar-toggle {
  position: absolute;
  right: -28px; top: 50%;
  transform: translateY(-50%);
  width: 28px; height: 48px;
  background: var(--bg-sidebar, #0d1117);
  border: 1px solid var(--border);
  border-left: none;
  border-radius: 0 4px 4px 0;
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  z-index: 501;
}
.layout-sidebar-toggle:hover { color: var(--text); background: var(--accent-dim, rgba(88,166,255,.12)); }

.lsb-inner {
  overflow-y: auto;
  flex: 1;
  padding: 8px 0 16px;
  padding-top: calc(var(--topbar-h, 90px) + 8px);
}
.lsb-section-title {
  font-size: 8px; text-transform: uppercase; letter-spacing: .1em;
  color: var(--text-muted); padding: 8px 12px 4px; font-weight: 700;
}
.lsb-preset-btn {
  display: flex; align-items: center; gap: 7px;
  width: 100%; padding: 7px 12px;
  background: transparent; border: none; color: var(--text-muted);
  font-size: 11px; cursor: pointer; text-align: left;
  border-left: 3px solid transparent;
  transition: all .12s;
}
.lsb-preset-btn:hover       { color: var(--text); background: rgba(255,255,255,.04); border-left-color: var(--accent); }
.lsb-preset-active          { color: var(--accent) !important; border-left-color: var(--accent) !important; background: rgba(88,166,255,.08) !important; }
.lsb-preset-icon { font-size: 13px; }

.lsb-divider { height: 1px; background: var(--border); margin: 6px 10px; }

.lsb-panel-list { display: flex; flex-direction: column; gap: 1px; padding: 0 4px; }
.lsb-panel-item {
  display: flex; align-items: center; gap: 7px;
  padding: 5px 8px; border-radius: 3px;
  cursor: pointer; font-size: 10px; color: var(--text-muted);
  transition: background .1s;
}
.lsb-panel-item:hover  { background: rgba(255,255,255,.04); color: var(--text); }
.lsb-panel-cb   { accent-color: var(--accent); cursor: pointer; }
.lsb-panel-icon { font-size: 12px; }
.lsb-panel-label{ flex: 1; }

.lsb-action-btn {
  display: flex; align-items: center; gap: 6px;
  width: 100%; padding: 6px 12px;
  background: transparent; border: none; color: var(--text-muted);
  font-size: 10px; cursor: pointer; text-align: left; transition: all .12s;
}
.lsb-action-btn:hover { color: var(--text); background: rgba(255,255,255,.04); }

/* Push dashboardCanvas right when sidebar is open */
.app-shell { display: flex; flex-direction: column; }
#dashboardCanvas { transition: padding-left .2s ease; }
body.sidebar-open #dashboardCanvas { padding-left: 160px; }


/* ══════════════════════════════════════════════════════════════════
   TECHNICAL INDICATORS MODULE  (technical.js)
   ══════════════════════════════════════════════════════════════════ */

/* Topbar */
.tech-topbar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  padding: 7px 10px 6px; border-bottom: 1px solid var(--border);
  background: var(--bg-panel);
  position: sticky; top: 0; z-index: 4;
}
.tech-res-group, .tech-period-group { display: flex; gap: 2px; }
.tech-res-btn, .tech-period-btn {
  padding: 3px 8px; font-size: 10px; font-weight: 700; border-radius: 3px;
  background: transparent; border: 1px solid var(--border); color: var(--text-muted);
  cursor: pointer; transition: all .12s; font-family: var(--font-mono);
}
.tech-res-btn.active, .tech-period-btn.active {
  background: var(--accent); color: #000; border-color: var(--accent);
}
.tech-res-btn:hover, .tech-period-btn:hover { border-color: var(--accent); color: var(--text); }
.tech-sym-badge { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.tech-sym-lbl   { font-size: 12px; font-weight: 800; color: var(--text); font-family: var(--font-mono); }
.tech-overlay-toggles { display: flex; gap: 8px; }
.tech-ov-toggle { font-size: 9px; color: var(--text-muted); display: flex; align-items: center; gap: 3px; cursor: pointer; }
.tech-ov-toggle input { accent-color: var(--accent); cursor: pointer; }

/* Chart */
.tech-chart-wrap {
  padding: 0; margin: 0;
  background: var(--bg, #0d1117);
  border-bottom: 1px solid var(--border);
  min-height: 220px;
}

/* Aggregate signal bar */
.tech-signal-bar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  padding: 8px 12px; border-bottom: 1px solid var(--border);
  background: rgba(255,255,255,.02);
}
.tech-signal-verdict {
  font-size: 15px; font-weight: 800; letter-spacing: .08em; font-family: var(--font-mono);
  min-width: 70px;
}
.tech-signal-pills { display: flex; flex-wrap: wrap; gap: 4px; flex: 1; }
.tech-sig-pill {
  font-size: 9px; padding: 2px 6px; border-radius: 10px;
  border: 1px solid; font-weight: 600; white-space: nowrap;
}
.tech-signal-score { font-size: 10px; color: var(--text-muted); margin-left: auto; font-family: var(--font-mono); }

/* Indicator grid */
.tech-ind-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 1px;
  background: var(--border);
  border-bottom: 1px solid var(--border);
}
.tech-ind-card {
  background: var(--bg-panel); padding: 9px 10px;
}
.tech-ind-title { font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted); margin-bottom: 4px; font-weight: 700; }
.tech-ind-val   { font-size: 17px; font-weight: 700; color: var(--text); font-family: var(--font-mono); line-height: 1.2; }
.tech-ind-sig   { font-size: 10px; font-weight: 600; margin-top: 2px; }
.tech-ind-note  { font-size: 9px; color: var(--text-muted); margin-top: 3px; line-height: 1.4; }
.tech-sig-buy   { color: #3fb950; }
.tech-sig-sell  { color: #f85149; }
.tech-sig-neutral{ color: #d29922; }

/* MA rows inside card */
.tech-ma-row {
  display: grid; grid-template-columns: 50px 1fr 60px; gap: 4px;
  font-size: 10px; padding: 2px 0; border-bottom: 1px solid var(--border);
  font-family: var(--font-mono);
}
.tech-ma-row:last-child { border-bottom: none; }
.tech-ma-row > span:first-child { color: var(--text-muted); }
.tech-ma-row > span:last-child  { text-align: right; }

/* Sections (pivots, fib, patterns) */
.tech-section { padding: 10px 12px; border-bottom: 1px solid var(--border); }
.tech-section-title {
  font-size: 9px; text-transform: uppercase; letter-spacing: .08em;
  color: var(--text-muted); font-weight: 700; margin-bottom: 8px;
}

/* Pivot grid */
.tech-pivot-grid {
  display: flex; flex-wrap: wrap; gap: 4px;
}
.tech-pivot-cell {
  display: flex; flex-direction: column; align-items: center;
  padding: 4px 10px; border-radius: 4px; min-width: 60px; text-align: center;
  font-family: var(--font-mono);
}
.tech-pivot-cell span  { font-size: 8px; text-transform: uppercase; color: var(--text-muted); letter-spacing: .06em; }
.tech-pivot-cell strong{ font-size: 11px; font-weight: 700; }
.tech-pivot-r { background: rgba(63,185,80,.12); border: 1px solid rgba(63,185,80,.3); color: #3fb950; }
.tech-pivot-p { background: rgba(88,166,255,.12); border: 1px solid rgba(88,166,255,.3); color: #58a6ff; }
.tech-pivot-s { background: rgba(248,81,73,.12);  border: 1px solid rgba(248,81,73,.3);  color: #f85149; }

/* Fibonacci */
.tech-fib-wrap { display: flex; flex-direction: column; gap: 4px; }
.tech-fib-row {
  display: grid; grid-template-columns: 40px 1fr 64px auto;
  align-items: center; gap: 8px; font-size: 10px;
}
.tech-fib-current { background: rgba(88,166,255,.08); border-radius: 3px; padding: 0 4px; }
.tech-fib-lbl  { font-weight: 700; font-family: var(--font-mono); }
.tech-fib-bar-wrap { height: 5px; background: var(--border); border-radius: 2px; overflow: hidden; }
.tech-fib-bar  { height: 100%; border-radius: 2px; opacity: .7; transition: width .3s ease; }
.tech-fib-val  { font-family: var(--font-mono); font-size: 10px; text-align: right; }
.tech-fib-here { font-size: 8px; color: var(--accent); font-weight: 700; white-space: nowrap; }

/* Pattern cards */
.tech-patterns { display: flex; flex-direction: column; gap: 5px; }
.tech-pattern-card {
  display: flex; flex-direction: column; gap: 2px;
  padding: 6px 10px; border-radius: 4px;
  background: rgba(255,255,255,.03);
  border-left: 3px solid;
}
.tech-pattern-lbl  { font-size: 11px; font-weight: 700; }
.tech-pattern-desc { font-size: 9px; color: var(--text-muted); }

.tech-footer { font-size: 8px; color: var(--text-muted); padding: 6px 12px; text-align: center; }

/* ══════════════════════════════════════════════════════════════════
   SBCACHE — API Cache Manager UI
   ══════════════════════════════════════════════════════════════════ */
.sbc-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 0 8px; margin-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
.sbc-title  { font-size: 11px; font-weight: 700; color: var(--text); }
.sbc-status-dot { font-size: 10px; font-weight: 600; }
.sbc-online  { color: #3fb950; }
.sbc-offline { color: #f85149; }

.sbc-status-bar {
  font-size: 10px; color: var(--text-muted); padding: 4px 0 8px;
  display: flex; flex-wrap: wrap; gap: 8px;
}
.sbc-stat      { white-space: nowrap; }
.sbc-hits      { color: #3fb950; }
.sbc-misses    { color: #d29922; }
.sbc-saved     { color: #58a6ff; }
.sbc-pct       { font-weight: 700; }

.sbc-stats-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;
  margin-bottom: 12px;
}
.sbc-stat-box {
  display: flex; flex-direction: column; align-items: center;
  padding: 8px 4px; background: var(--bg-input, #161b22);
  border: 1px solid var(--border); border-radius: 4px; text-align: center;
}
.sbc-stat-val { font-size: 18px; font-weight: 800; font-family: var(--font-mono); line-height: 1.1; }
.sbc-stat-lbl { font-size: 8px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; margin-top: 2px; }

.sbc-ttl-table { margin-bottom: 10px; }
.sbc-ttl-title { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted); font-weight: 700; margin-bottom: 5px; }
.sbc-ttl-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 3px 0; border-bottom: 1px solid var(--border); font-size: 10px;
}
.sbc-ttl-val { color: var(--accent); font-family: var(--font-mono); font-size: 10px; }

.sbc-actions { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
.sbc-btn {
  font-size: 10px; padding: 5px 9px;
  background: var(--bg-input, #161b22); border: 1px solid var(--border);
  color: var(--text-muted); border-radius: 3px; cursor: pointer;
  transition: all .12s;
}
.sbc-btn:hover { border-color: var(--accent); color: var(--text); }

.sbc-extra { font-size: 10px; }
.sbc-table {
  width: 100%; border-collapse: collapse; font-size: 9px; font-family: var(--font-mono);
  margin-top: 4px;
}
.sbc-table th { color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; padding: 3px 4px; text-align: left; border-bottom: 1px solid var(--border); }
.sbc-table td { padding: 3px 4px; border-bottom: 1px solid var(--border); color: var(--text); }
.sbc-table tr:hover td { background: rgba(255,255,255,.03); }

/* ── Ensure resize handles always on top and cover full hit area ── */
.resize-handle {
  position: absolute;
  z-index: 12 !important;  /* above content, tabs, overlays */
  /* Expand hit area slightly beyond visual edge */
}
.resize-handle[data-dir="s"]  { height: 10px !important; bottom: -2px !important; }
.resize-handle[data-dir="n"]  { height: 10px !important; top: -2px !important;    }
.resize-handle[data-dir="w"]  { width:  10px !important; left: -2px !important;   }
.resize-handle[data-dir="e"]  { width:  10px !important; right: -2px !important;  }
.resize-handle[data-dir="sw"] { bottom: -2px !important; left:  -2px !important;  }
.resize-handle[data-dir="se"] { bottom: -2px !important; right: -2px !important;  }
.resize-handle[data-dir="nw"] { top:    -2px !important; left:  -2px !important;  }
.resize-handle[data-dir="ne"] { top:    -2px !important; right: -2px !important;  }

/* ── During resize/drag: disable pointer events on all content ─── */
body.panel-resizing *:not(.panel.resizing):not(.panel.resizing .resize-handle),
body.panel-dragging *:not(.panel.dragging):not(.panel.dragging .panel-head) {
  pointer-events: none !important;
}
body.panel-resizing .panel.resizing { pointer-events: auto !important; }
body.panel-dragging .panel.dragging { pointer-events: auto !important; }

/* ── Prevent iframe/TradingView from stealing mouse events during drag ── */
.panel.dragging iframe, .panel.resizing iframe,
body.panel-dragging iframe, body.panel-resizing iframe {
  pointer-events: none !important;
}

/* ══════════════════════════════════════════════════════════════════
   SHORT INTEREST
   ══════════════════════════════════════════════════════════════════ */
.si-signal   { font-size:14px; font-weight:700; padding:8px 12px 4px; }
.si-kpi-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(120px,1fr)); gap:1px; background:var(--border); border:1px solid var(--border); margin:8px 0; }
.si-kpi      { background:var(--bg-panel); padding:8px 10px; display:flex; flex-direction:column; gap:2px; }
.si-kpi-lbl  { font-size:9px; text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted); font-weight:700; }
.si-kpi-val  { font-size:17px; font-weight:700; color:var(--text); font-family:var(--font-mono); }
.si-kpi-chg  { font-size:9px; color:var(--text-muted); }
.si-spark-wrap{ padding:6px 12px; display:flex; align-items:center; gap:10px; border-top:1px solid var(--border); }
.si-spark-lbl { font-size:9px; color:var(--text-muted); white-space:nowrap; }
.si-spark     { flex:1; }
.si-spark-na  { font-size:9px; color:var(--text-muted); }
.si-links     { display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:8px 12px; border-top:1px solid var(--border); font-size:9px; }

/* ══════════════════════════════════════════════════════════════════
   PORTFOLIO
   ══════════════════════════════════════════════════════════════════ */
.port-empty       { display:flex; flex-direction:column; align-items:center; justify-content:center; height:120px; gap:6px; color:var(--text-muted); }
.port-empty-icon  { font-size:28px; }
.port-summary     { display:grid; grid-template-columns:repeat(4,1fr); gap:1px; background:var(--border); border-bottom:1px solid var(--border); }
.port-sum-block   { background:var(--bg-panel); padding:8px 10px; display:flex; flex-direction:column; gap:2px; }
.port-sum-lbl     { font-size:9px; text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted); font-weight:700; }
.port-sum-val     { font-size:14px; font-weight:700; font-family:var(--font-mono); }
.port-alloc-bar   { display:flex; height:6px; border-radius:3px; overflow:hidden; margin:8px 12px 4px; gap:1px; }
.port-alloc-seg   { height:100%; min-width:2px; border-radius:2px; transition:width .3s; }
.port-alloc-legend{ display:flex; flex-wrap:wrap; gap:8px; padding:0 12px 6px; font-size:9px; color:var(--text-muted); }
.port-alloc-lbl   { white-space:nowrap; }
.port-table       { width:100%; border-collapse:collapse; font-size:11px; }
.port-table th    { padding:5px 8px; text-align:left; color:var(--text-muted); font-size:9px; text-transform:uppercase; letter-spacing:.05em; border-bottom:1px solid var(--border); white-space:nowrap; }
.port-table td    { padding:6px 8px; border-bottom:1px solid var(--border); font-family:var(--font-mono); }
.port-table tr:hover td { background:rgba(255,255,255,.03); }
.port-sym         { color:var(--accent); font-size:12px; font-weight:700; }
.port-del-btn     { background:transparent; border:none; color:var(--text-muted); cursor:pointer; font-size:11px; padding:2px 4px; }
.port-del-btn:hover { color:#f85149; }

/* ══════════════════════════════════════════════════════════════════
   SCREENER
   ══════════════════════════════════════════════════════════════════ */
.scr-filters-grid   { display:grid; grid-template-columns:1fr 1fr; gap:8px; padding:10px 12px; }
.scr-filter-row     { display:flex; flex-direction:column; gap:3px; }
.scr-filter-row label{ font-size:9px; text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted); font-weight:700; }
.scr-table          { font-size:10px; }
.scr-table th       { cursor:pointer; }
.scr-table th:hover { color:var(--accent); }

/* ══════════════════════════════════════════════════════════════════
   OPTIONS / GREEKS
   ══════════════════════════════════════════════════════════════════ */
.opt-section       { padding:10px 12px; border-bottom:1px solid var(--border); }
.opt-section-title { font-size:9px; text-transform:uppercase; letter-spacing:.08em; color:var(--text-muted); font-weight:700; margin-bottom:8px; }
.bs-calc-grid      { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
.bs-field          { display:flex; flex-direction:column; gap:3px; }
.bs-field label    { font-size:9px; color:var(--text-muted); font-weight:700; text-transform:uppercase; }
.bs-input          { background:var(--bg-input,#161b22); border:1px solid var(--border); color:var(--text); font-size:11px; padding:5px 8px; border-radius:3px; font-family:var(--font-mono); width:100%; }
.bs-field-btn      { justify-content:flex-end; }
.bs-results        { margin-top:10px; background:var(--bg-input,#161b22); border:1px solid var(--border); border-radius:4px; overflow:hidden; }
.bs-res-header     { display:grid; grid-template-columns:1fr 1fr 1fr; padding:5px 10px; font-size:10px; font-weight:700; background:rgba(255,255,255,.04); border-bottom:1px solid var(--border); }
.bs-res-row        { display:grid; grid-template-columns:1fr 1fr 1fr; padding:4px 10px; font-size:11px; font-family:var(--font-mono); border-bottom:1px solid var(--border); }
.bs-res-row:last-of-type { border-bottom:none; }
.bs-res-lbl        { color:var(--text-muted); font-size:10px; }
.bs-res-call       { color:#3fb950; }
.bs-res-put        { color:#f85149; }
.bs-res-note       { font-size:9px; color:var(--text-muted); padding:5px 10px; }
.opt-chain-table   { font-size:9px; }
.opt-chain-table th, .opt-chain-table td { padding:3px 5px; }

/* ══════════════════════════════════════════════════════════════════
   BONDS / CREDIT
   ══════════════════════════════════════════════════════════════════ */
.bonds-section       { padding:10px 12px; border-bottom:1px solid var(--border); }
.bonds-section-title { font-size:9px; text-transform:uppercase; letter-spacing:.08em; color:var(--text-muted); font-weight:700; margin-bottom:8px; }
.bonds-kpi-grid      { display:grid; grid-template-columns:repeat(auto-fill,minmax(110px,1fr)); gap:8px; }
.bonds-kpi           { display:flex; flex-direction:column; gap:2px; padding:6px 8px; background:var(--bg-input,#161b22); border:1px solid var(--border); border-radius:4px; }
.bonds-kpi-lbl       { font-size:9px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; font-weight:700; }
.bonds-kpi-val       { font-size:15px; font-weight:700; font-family:var(--font-mono); color:var(--text); }
.bonds-kpi-spread    { font-size:9px; color:var(--text-muted); }
.bonds-spread-pill   { display:inline-block; margin-top:8px; padding:4px 10px; background:rgba(255,255,255,.05); border:1px solid var(--border); border-radius:10px; font-size:11px; font-weight:700; font-family:var(--font-mono); }
.bonds-interp        { display:flex; flex-direction:column; gap:5px; }
.bonds-interp-row    { display:flex; gap:8px; font-size:10px; color:var(--text-muted); line-height:1.4; align-items:flex-start; }

/* ══════════════════════════════════════════════════════════════════
   GEOINTEL MODULE — Terror / Cyber / Travel
   ══════════════════════════════════════════════════════════════════ */

/* Shared section layout */
.gi-section      { padding: 8px 12px; border-bottom: 1px solid var(--border); }
.gi-section-title{ font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted); font-weight: 700; margin-bottom: 7px; }
.gi-footer       { font-size: 9px; color: var(--text-muted); padding: 6px 12px; }
.gi-event-link   { color: var(--accent); text-decoration: none; }
.gi-event-link:hover { text-decoration: underline; }
.gi-more         { font-size: 9px; color: var(--text-muted); padding: 4px 0; text-align: center; }
.gi-links-grid   { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.gi-link-card    { display: flex; align-items: center; gap: 8px; padding: 8px; border: 1px solid var(--border); border-radius: 4px; color: var(--text); text-decoration: none; font-size: 11px; transition: all .12s; }
.gi-link-card:hover { border-color: var(--accent); background: rgba(88,166,255,.06); }
.gi-link-icon    { font-size: 16px; }

/* Country chips (heatmap) */
.gi-country-chips{ display: flex; flex-wrap: wrap; gap: 5px; }
.gi-country-chip { font-size: 10px; padding: 3px 8px; background: var(--bg-input,#161b22); border: 1px solid var(--border); border-radius: 10px; color: var(--text-muted); font-family: var(--font-mono); }
.gi-country-chip strong { color: var(--accent); }

/* Terror event cards */
.gi-event-card   { padding: 7px 0; border-bottom: 1px solid var(--border); }
.gi-event-card:last-child { border-bottom: none; }
.gi-event-header { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 3px; }
.gi-event-cat    { font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 3px; letter-spacing: .04em; }
.gi-event-country{ font-size: 9px; color: var(--text-muted); }
.gi-event-time   { font-size: 9px; color: var(--text-muted); margin-left: auto; }
.gi-event-title  { font-size: 11px; color: var(--text); line-height: 1.4; }
.gi-event-source { font-size: 9px; color: var(--text-muted); margin-top: 2px; }

/* Cyber CVE cards */
.cyber-stats-row { display: grid; grid-template-columns: repeat(4,1fr); gap: 1px; background: var(--border); border-bottom: 1px solid var(--border); }
.cyber-stat      { background: var(--bg-panel); padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; }
.cyber-stat-val  { font-size: 18px; font-weight: 800; font-family: var(--font-mono); color: var(--text); }
.cyber-stat-lbl  { font-size: 9px; color: var(--text-muted); text-transform: uppercase; }

.cyber-cve-card  { padding: 8px 0; border-bottom: 1px solid var(--border); }
.cyber-cve-card:last-child { border-bottom: none; }
.cyber-cve-ransom{ background: rgba(248,81,73,.04); }
.cyber-cve-header{ display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 3px; }
.cyber-cve-id    { font-size: 11px; font-weight: 800; color: var(--accent); font-family: var(--font-mono); }
.cyber-ransom-badge { font-size: 9px; font-weight: 700; padding: 1px 6px; background: rgba(248,81,73,.15); color: #f85149; border: 1px solid rgba(248,81,73,.3); border-radius: 3px; }
.cyber-cve-date  { font-size: 9px; color: var(--text-muted); }
.cyber-cve-due   { font-size: 9px; color: #d29922; font-weight: 600; }
.cyber-cve-vendor{ font-size: 10px; font-weight: 700; color: var(--text); margin-bottom: 2px; }
.cyber-cve-name  { font-size: 10px; color: var(--text-muted); margin-bottom: 2px; }
.cyber-cve-action{ font-size: 9px; color: var(--text-muted); line-height: 1.4; }

/* Travel advisory */
.travel-level-row{ display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--border); }
.travel-level-pill{ display: flex; align-items: center; gap: 5px; padding: 4px 10px; border: 1px solid; border-radius: 10px; font-size: 10px; font-weight: 700; }
.travel-level-num { font-size: 12px; font-weight: 800; font-family: var(--font-mono); }
.travel-level-cnt { font-size: 14px; font-weight: 800; font-family: var(--font-mono); }
.travel-level-lbl { font-size: 9px; opacity: .8; }
.travel-item      { padding: 7px 12px; border-bottom: 1px solid var(--border); }
.travel-item-header{ display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 3px; }
.travel-item-country{ font-size: 12px; font-weight: 700; color: var(--text); }
.travel-item-level{ font-size: 10px; font-weight: 600; }
.travel-item-date { font-size: 9px; color: var(--text-muted); margin-left: auto; }
.travel-item-desc { font-size: 10px; color: var(--text-muted); line-height: 1.4; margin-bottom: 3px; }

/* GDELT Instability scores in INTEL tab */
.gi-stab-grid    { display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 6px; padding: 6px 12px 10px; }
.gi-stab-cell    { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 4px; background: var(--bg-input,#161b22); border-radius: 4px; text-align: center; }
.gi-stab-name    { font-size: 9px; color: var(--text-muted); }
.gi-stab-score   { font-size: 14px; font-weight: 800; font-family: var(--font-mono); }
.gi-stab-trend   { font-size: 11px; font-weight: 700; }

/* ══════════════════════════════════════════════════════════════════
   MACROGLOBAL MODULE — Global Macro / PMI / Central Banks
   ══════════════════════════════════════════════════════════════════ */

/* Shared section */
.mg-section       { padding: 10px 12px; border-bottom: 1px solid var(--border); }
.mg-section-title { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted); font-weight: 700; margin-bottom: 8px; }
.mg-footer        { font-size: 9px; color: var(--text-muted); padding: 6px 12px; }

/* Global overview KPIs */
.mg-overview-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 1px; background: var(--border); border-bottom: 1px solid var(--border); }
.mg-overview-kpi  { background: var(--bg-panel); padding: 9px 10px; display: flex; flex-direction: column; gap: 2px; }
.mg-ov-lbl        { font-size: 9px; text-transform: uppercase; color: var(--text-muted); letter-spacing: .05em; font-weight: 700; }
.mg-ov-val        { font-size: 18px; font-weight: 800; font-family: var(--font-mono); color: var(--text); }

/* Country table */
.mg-table         { width: 100%; border-collapse: collapse; font-size: 10px; }
.mg-table th      { padding: 5px 8px; text-align: center; color: var(--text-muted); font-size: 8px; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid var(--border); white-space: nowrap; font-weight: 700; }
.mg-table th:first-child { text-align: left; }
.mg-table td      { padding: 5px 8px; border-bottom: 1px solid var(--border); text-align: center; font-family: var(--font-mono); font-size: 10px; }
.mg-table td:first-child { text-align: left; }
.mg-table td small{ font-size: 8px; color: var(--text-muted); display: block; }
.mg-table tr:hover td { background: rgba(255,255,255,.03); }
.mg-country-cell  { display: flex; align-items: center; gap: 5px; font-family: var(--font); font-size: 11px; font-weight: 600; }
.mg-flag          { font-size: 14px; }

/* GDP bar chart */
.mg-bar-chart     { display: flex; flex-direction: column; gap: 4px; }
.mg-bar-row       { display: grid; grid-template-columns: 110px 1fr 50px; gap: 8px; align-items: center; font-size: 10px; }
.mg-bar-label     { color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 10px; }
.mg-bar-track     { height: 8px; background: var(--bg-input,#161b22); border-radius: 4px; overflow: hidden; }
.mg-bar-fill      { height: 100%; border-radius: 4px; transition: width .4s ease; }
.mg-bar-val       { font-family: var(--font-mono); font-size: 10px; font-weight: 700; text-align: right; }

/* CLI / PMI */
.mg-cli-summary   { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--border); }
.mg-cli-group     { padding: 5px 10px; border: 1px solid; border-radius: 4px; font-size: 10px; }
.mg-cli-group-label{ font-weight: 700; margin-bottom: 3px; }
.mg-cli-group-countries { display: flex; flex-wrap: wrap; gap: 4px; font-size: 9px; color: var(--text-muted); }

.mg-cli-grid      { display: grid; grid-template-columns: repeat(auto-fill,minmax(100px,1fr)); gap: 6px; padding: 10px 12px; }
.mg-cli-card      { background: var(--bg-input,#161b22); padding: 8px; border-radius: 4px; display: flex; flex-direction: column; gap: 2px; }
.mg-cli-name      { font-size: 10px; color: var(--text-muted); }
.mg-cli-val       { font-size: 16px; font-weight: 800; font-family: var(--font-mono); }
.mg-cli-signal    { font-size: 9px; font-weight: 700; }
.mg-cli-trend     { font-size: 9px; font-family: var(--font-mono); }
.mg-cli-bar-track { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; position: relative; margin: 3px 0; }
.mg-cli-bar-fill  { height: 100%; border-radius: 2px; }
.mg-cli-bar-center{ position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: var(--text-muted); opacity: .4; }
.mg-cli-period    { font-size: 8px; color: var(--text-muted); }

/* Central Banks */
.cb-rates-grid    { display: grid; grid-template-columns: repeat(auto-fill,minmax(120px,1fr)); gap: 6px; padding: 10px 12px; border-bottom: 1px solid var(--border); }
.cb-rate-card     { padding: 8px; background: var(--bg-input,#161b22); border-radius: 4px; display: flex; flex-direction: column; gap: 2px; }
.cb-rate-bank     { font-size: 10px; font-weight: 700; color: var(--text); }
.cb-rate-country  { font-size: 9px; color: var(--text-muted); }
.cb-rate-val      { font-size: 20px; font-weight: 800; font-family: var(--font-mono); }
.cb-rate-ccy      { font-size: 8px; color: var(--text-muted); }
.cb-rate-next     { font-size: 9px; color: var(--text-muted); margin-top: 3px; line-height: 1.4; }

.cb-links-row     { display: flex; flex-wrap: wrap; gap: 6px; }
.cb-link-btn      { font-size: 9px; padding: 4px 8px; background: var(--bg-input,#161b22); border: 1px solid var(--border); border-radius: 3px; color: var(--accent); text-decoration: none; transition: all .12s; }
.cb-link-btn:hover{ border-color: var(--accent); background: rgba(88,166,255,.06); }

.cb-calendar      { display: flex; flex-direction: column; gap: 2px; }
.cb-event-row     { display: grid; grid-template-columns: 20px 80px 40px 1fr 40px; gap: 6px; align-items: center; padding: 4px 0; border-bottom: 1px solid var(--border); font-size: 10px; }
.cb-event-row:last-child { border-bottom: none; }
.cb-event-near    { background: rgba(255,255,255,.03); border-radius: 3px; padding: 4px 6px; }
.cb-event-past    { opacity: .6; }
.cb-event-flag    { font-size: 12px; }
.cb-event-date    { font-family: var(--font-mono); color: var(--text-muted); font-size: 9px; }
.cb-event-bank    { font-weight: 700; font-size: 9px; }
.cb-event-type    { color: var(--text-muted); font-size: 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cb-event-days    { font-family: var(--font-mono); font-weight: 700; text-align: right; font-size: 9px; }

/* Econ tab enrichment strip */
.mg-econ-strip    { display: flex; flex-wrap: wrap; gap: 6px; }
.mg-econ-chip     { display: flex; align-items: center; gap: 5px; padding: 4px 8px; background: var(--bg-input,#161b22); border: 1px solid var(--border); border-radius: 4px; font-size: 9px; font-family: var(--font-mono); }
.mg-econ-flag     { font-size: 12px; }
.mg-econ-gdp      { font-weight: 700; }
.mg-econ-cpi      { color: var(--text-muted); }

/* ══════════════════════════════════════════════════════════════════
   TECHNICAL INDICATORS UPGRADE — Gauges, BB Position, RSI Visual
   ══════════════════════════════════════════════════════════════════ */

/* Wide cards span 2 columns */
.tech-ind-card-wide {
  grid-column: span 2;
}

/* Generic gauge bar (Stochastic, Williams %R) */
.tech-gauge-wrap   { margin: 6px 0 2px; }
.tech-gauge-track  { position: relative; height: 10px; border-radius: 5px; overflow: visible; display: flex; }
.tech-gauge-zone-low  { background: #3fb950; border-radius: 5px 0 0 5px; }
.tech-gauge-zone-mid  { background: #d29922; }
.tech-gauge-zone-high { background: #f85149; border-radius: 0 5px 5px 0; }
.tech-gauge-needle {
  position: absolute; top: -3px;
  width: 3px; height: 16px;
  background: #fff;
  border-radius: 2px;
  box-shadow: 0 0 4px rgba(0,0,0,.5);
  transform: translateX(-50%);
  transition: left .3s ease;
}
.tech-gauge-labels {
  display: flex; justify-content: space-between;
  font-size: 8px; color: var(--text-muted); margin-top: 3px;
  font-family: var(--font-mono);
}

/* RSI Gauge Visual */
.rsi-gauge-visual  { padding: 4px 0; }
.rsi-gauge-bar {
  position: relative; height: 18px; border-radius: 9px; overflow: visible;
  background: linear-gradient(to right, #3fb950 0%, #3fb950 30%, #d29922 30%, #d29922 70%, #f85149 70%, #f85149 100%);
}
.rsi-gauge-pointer {
  position: absolute; top: -4px;
  transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center;
  transition: left .3s ease;
}
.rsi-gauge-val {
  background: var(--bg-panel);
  border: 2px solid var(--accent);
  border-radius: 4px;
  font-size: 11px; font-weight: 800;
  font-family: var(--font-mono);
  padding: 1px 5px;
  white-space: nowrap;
  color: var(--text);
  margin-top: 20px;
}
.rsi-gauge-scale {
  display: flex; justify-content: space-between;
  font-size: 8px; color: var(--text-muted);
  margin-top: 2px; font-family: var(--font-mono);
}

/* BB Position Bar */
.bb-pos-wrap  { padding: 4px 0; }
.bb-pos-bar {
  position: relative; height: 12px; border-radius: 6px;
  background: linear-gradient(to right, #3fb950, #d29922, #f85149);
  margin: 4px 0;
}
.bb-pos-marker {
  position: absolute; top: -6px;
  transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center;
}
.bb-pos-price {
  background: var(--bg-panel);
  border: 1.5px solid var(--accent);
  border-radius: 3px;
  font-size: 10px; font-weight: 700;
  font-family: var(--font-mono);
  padding: 1px 4px;
  color: var(--accent);
  margin-top: 16px;
  white-space: nowrap;
}
.bb-pos-label-upper {
  position: absolute; right: 0; top: -14px;
  font-size: 8px; color: var(--text-muted); font-family: var(--font-mono);
}
.bb-pos-label-lower {
  position: absolute; left: 0; top: -14px;
  font-size: 8px; color: var(--text-muted); font-family: var(--font-mono);
}
.bb-pos-pctb { font-size: 9px; color: var(--text-muted); margin-top: 18px; font-family: var(--font-mono); }

/* ══════════════════════════════════════════════════════════════════
   OPTIONS CHAIN FULL UI
   ══════════════════════════════════════════════════════════════════ */

/* Header bar */
.opt-header-bar {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 7px 12px; background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
  position: sticky; top: 0; z-index: 4;
}
.opt-hdr-sym   { font-family: var(--font-mono); font-size: 14px; font-weight: 800; color: var(--text); }
.opt-hdr-price { font-size: 14px; font-weight: 700; color: var(--accent); font-family: var(--font-mono); }
.opt-hdr-dte   { font-size: 10px; color: var(--text-muted); background: var(--border); padding: 2px 6px; border-radius: 3px; }
.opt-hdr-src   { font-size: 9px; color: #3fb950; margin-left: auto; }
.opt-hdr-right { display: flex; align-items: center; gap: 6px; }
.opt-exp-sel   { background: var(--bg-input,#161b22); border: 1px solid var(--border); color: var(--text); font-size: 10px; padding: 3px 6px; border-radius: 3px; font-family: var(--font-mono); }

/* Metrics bar */
.opt-metrics-bar { display: flex; flex-wrap: wrap; gap: 1px; background: var(--border); border-bottom: 1px solid var(--border); }
.opt-metric      { background: var(--bg-panel); padding: 5px 10px; display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 80px; }
.opt-metric-lbl  { font-size: 8px; text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted); font-weight: 700; }
.opt-metric-val  { font-size: 11px; font-weight: 700; font-family: var(--font-mono); color: var(--text); }

/* OI Heatmap */
.opt-oi-section  { padding: 8px 12px; border-bottom: 1px solid var(--border); background: rgba(255,255,255,.01); }
.opt-oi-title    { font-size: 9px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); font-weight: 700; margin-bottom: 6px; }
.opt-oi-bars     { display: flex; align-items: flex-end; gap: 2px; height: 60px; overflow-x: auto; padding-bottom: 2px; }
.opt-oi-col      { display: flex; flex-direction: column; align-items: center; min-width: 28px; flex: 0 0 28px; }
.opt-oi-bar-wrap { display: flex; gap: 1px; align-items: flex-end; height: 48px; width: 100%; }
.opt-oi-call-bar { background: #3fb95066; width: 48%; border-radius: 2px 2px 0 0; transition: height .3s; }
.opt-oi-put-bar  { background: #f8514966; width: 48%; border-radius: 2px 2px 0 0; transition: height .3s; }
.opt-oi-strike   { font-size: 7.5px; color: var(--text-muted); font-family: var(--font-mono); margin-top: 2px; }
.opt-oi-badge    { font-size: 7px; font-weight: 800; color: #d29922; }
.opt-oi-mp-badge { color: #ffd700; }
.opt-oi-atm .opt-oi-call-bar { background: #d2992266; }
.opt-oi-atm .opt-oi-put-bar  { background: #d2992266; }
.opt-oi-maxpain .opt-oi-call-bar, .opt-oi-maxpain .opt-oi-put-bar { border: 1px solid #ffd700; }
.opt-oi-legend   { display: flex; gap: 12px; font-size: 9px; color: var(--text-muted); margin-top: 4px; }

/* Chain table */
.opt-chain-full  { width: 100%; border-collapse: collapse; font-size: 10px; font-family: var(--font-mono); white-space: nowrap; }
.opt-chain-full th { padding: 4px 6px; border-bottom: 1px solid var(--border); font-size: 9px; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted); background: var(--bg-panel); position: sticky; top: 0; }
.opt-chain-full td { padding: 3px 6px; border-bottom: 1px solid var(--border); }
.opt-chain-full tr:hover td { background: rgba(255,255,255,.03); }
.opt-th-call     { background: rgba(63,185,80,.12)!important; color: #3fb950!important; text-align: center; }
.opt-th-put      { background: rgba(248,81,73,.12)!important; color: #f85149!important; text-align: center; }
.opt-th-strike   { background: rgba(88,166,255,.12)!important; color: var(--accent)!important; text-align: center; }
.opt-strike-cell { font-weight: 800; color: var(--text); text-align: center; background: rgba(88,166,255,.06); }
.opt-strike-atm  { background: rgba(210,153,34,.2)!important; color: #d29922!important; }
.opt-strike-mp   { background: rgba(255,215,0,.12)!important; outline: 1px solid #ffd700; }
.opt-row-atm td  { background: rgba(210,153,34,.06); }
.opt-row-mp td   { background: rgba(255,215,0,.05); }
.opt-row-itmc td { background: rgba(63,185,80,.03); }
.opt-row-itmp td { background: rgba(248,81,73,.03); }
.opt-greek       { color: var(--text-muted)!important; font-size: 9.5px; }
.opt-oi-cell     { color: var(--text-muted); font-size: 9.5px; }

/* Max Pain box */
.opt-maxpain-box { padding: 8px 12px; border-left: 3px solid #ffd700; background: rgba(255,215,0,.05); margin: 0; }
.opt-maxpain-title { font-size: 11px; font-weight: 700; color: #ffd700; margin-bottom: 3px; }
.opt-maxpain-desc  { font-size: 10px; color: var(--text-muted); line-height: 1.5; }

/* BS Calculator collapsible */
.opt-calc-details > summary {
  font-size: 10px; color: var(--accent); cursor: pointer; padding: 6px 12px;
  border-top: 1px solid var(--border); list-style: none; font-weight: 700;
  user-select: none;
}
.opt-calc-details > summary::-webkit-details-marker { display: none; }
.opt-calc-details[open] > summary { border-bottom: 1px solid var(--border); }
.opt-calc-body   { padding: 10px 12px; }

/* Footer */
.opt-footer { font-size: 9px; color: var(--text-muted); padding: 6px 12px; border-top: 1px solid var(--border); }

/* ══════════════════════════════════════════════════════════════════
   CRYPTO MODULE v2 — Full Intelligence Dashboard
   ══════════════════════════════════════════════════════════════════ */

/* Sub-tab bar */
.cg-subtab-bar  { display:flex; gap:2px; padding:6px 8px; background:var(--bg-panel); border-bottom:1px solid var(--border); flex-wrap:wrap; }
.cg-stab        { background:transparent; border:1px solid var(--border); color:var(--text-muted); font-size:10px; font-weight:600; padding:3px 9px; border-radius:4px; cursor:pointer; transition:all .12s; white-space:nowrap; }
.cg-stab:hover  { border-color:var(--accent); color:var(--accent); }
.cg-stab.active { background:var(--accent); border-color:var(--accent); color:#000; }

/* Tab panes */
.cg-tab         { display:none; }
.cg-tab.active  { display:block; }

/* ── Global stats bar ── */
.cg-global-bar  { display:grid; grid-template-columns:repeat(auto-fill,minmax(110px,1fr)); gap:1px; background:var(--border); border-bottom:1px solid var(--border); }
.cg-glob-cell   { background:var(--bg-panel); padding:7px 10px; display:flex; flex-direction:column; gap:1px; }
.cg-glob-label  { font-size:8px; text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); font-weight:700; }
.cg-glob-val    { font-size:13px; font-weight:800; color:var(--text); font-family:var(--font-mono); }
.cg-glob-sub    { font-size:9px; font-family:var(--font-mono); }

/* ── Dominance bar ── */
.cg-dom-bar-wrap{ padding:6px 12px 4px; border-bottom:1px solid var(--border); }
.cg-dom-bar     { display:flex; height:8px; border-radius:4px; overflow:hidden; gap:1px; }
.cg-dom-seg     { height:100%; border-radius:2px; transition:width .4s; }
.cg-dom-labels  { display:flex; gap:12px; font-size:9px; margin-top:4px; font-family:var(--font-mono); }

/* ── Overview grid ── */
.cg-overview-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:6px; padding:8px; }

/* ── Fear & Greed card ── */
.cg-fg-card     { background:var(--bg-input,#161b22); border:1px solid var(--border); border-radius:6px; padding:8px; grid-column:span 2; }
.cg-fg-card .cg-section-title { font-size:9px; text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); font-weight:700; margin-bottom:6px; }
.cg-fear-wrap   { display:flex; justify-content:center; }
.cg-fg-history  { display:flex; flex-direction:column; gap:3px; margin-top:4px; }
.cg-fg-hist-row { display:grid; grid-template-columns:52px 1fr 28px; gap:4px; align-items:center; }
.cg-fg-hist-date{ font-size:8px; color:var(--text-muted); font-family:var(--font-mono); }
.cg-fg-hist-bar-wrap{ height:5px; background:var(--border); border-radius:2px; overflow:hidden; }
.cg-fg-hist-bar { height:100%; border-radius:2px; }
.cg-fg-hist-val { font-size:9px; font-weight:700; font-family:var(--font-mono); text-align:right; }

/* ── Coin cards (overview) ── */
.cg-coin-card   { background:var(--bg-input,#161b22); border:1px solid var(--border); border-radius:6px; padding:8px; display:flex; flex-direction:column; gap:3px; cursor:pointer; transition:border-color .12s; }
.cg-coin-card:hover { border-color:var(--accent); }
.cg-coin-card-header{ display:flex; align-items:center; gap:5px; }
.cg-coin-card-sym { font-size:11px; font-weight:800; color:var(--text); }
.cg-coin-card-rank{ font-size:8px; color:var(--text-muted); margin-left:auto; }
.cg-coin-card-price{ font-size:13px; font-weight:700; color:var(--text); font-family:var(--font-mono); }
.cg-coin-card-chg { font-size:9px; font-family:var(--font-mono); }
.cg-coin-card-spark{ height:22px; margin:2px 0; }
.cg-coin-card-mc{ font-size:9px; color:var(--text-muted); }

/* Real-time price flash */
.cg-price-flash { animation:cgFlash .6s ease; }
@keyframes cgFlash { 0%,100%{background:transparent} 30%{background:rgba(88,166,255,.25)} }

/* ── Coins table ── */
.cg-coins-toolbar{ display:flex; align-items:center; gap:8px; padding:6px 10px; border-bottom:1px solid var(--border); }
.cg-search-input { background:var(--bg-input,#161b22); border:1px solid var(--border); color:var(--text); font-size:11px; padding:4px 8px; border-radius:4px; flex:1; max-width:220px; }
.cg-coins-count  { font-size:9px; color:var(--text-muted); }
.cg-coins-table  { width:100%; border-collapse:collapse; font-size:10px; white-space:nowrap; }
.cg-coins-table th { padding:4px 6px; border-bottom:1px solid var(--border); font-size:8px; text-transform:uppercase; letter-spacing:.04em; color:var(--text-muted); background:var(--bg-panel); position:sticky; top:0; z-index:3; }
.cg-coins-table td { padding:3px 6px; border-bottom:1px solid var(--border); font-family:var(--font-mono); }
.cg-coins-table tr:hover td { background:rgba(255,255,255,.025); }
.cg-td-name     { display:flex; align-items:center; gap:5px; min-width:130px; font-family:var(--font-sans,sans-serif); }
.cg-coin-fullname{ color:var(--text-muted); font-size:9px; overflow:hidden; text-overflow:ellipsis; max-width:80px; }
.cg-td-rank     { color:var(--text-muted); min-width:26px; }
.cg-td-price    { color:var(--text); font-weight:700; }
.cg-td-supply   { font-size:9px; color:var(--text-muted); }
.cg-td-spark    { min-width:74px; }

/* ── DeFi tab ── */
.cg-defi-header { display:grid; grid-template-columns:repeat(3,1fr); gap:1px; background:var(--border); border-bottom:1px solid var(--border); }
.cg-defi-stat   { background:var(--bg-panel); padding:8px 12px; display:flex; flex-direction:column; gap:2px; }
.cg-defi-stat span { font-size:9px; color:var(--text-muted); text-transform:uppercase; }
.cg-defi-stat strong { font-size:14px; font-family:var(--font-mono); color:var(--text); }
.cg-section-title{ font-size:9px; text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); font-weight:700; padding:6px 12px 3px; }
.cg-chain-bars  { padding:0 12px 8px; display:flex; flex-direction:column; gap:4px; }
.cg-chain-row   { display:grid; grid-template-columns:80px 1fr 60px; gap:6px; align-items:center; }
.cg-chain-name  { font-size:10px; color:var(--text); font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.cg-chain-bar-wrap{ height:6px; background:var(--border); border-radius:3px; overflow:hidden; }
.cg-chain-bar   { height:100%; background:var(--accent); border-radius:3px; transition:width .4s; }
.cg-chain-tvl   { font-size:10px; font-family:var(--font-mono); color:var(--text-muted); text-align:right; }
.cg-proto-grid  { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:6px; padding:4px 12px 8px; }
.cg-proto-card  { background:var(--bg-input,#161b22); border:1px solid var(--border); border-radius:5px; padding:8px; }
.cg-proto-header{ display:flex; align-items:center; gap:5px; margin-bottom:5px; overflow:hidden; }
.cg-proto-name  { font-size:11px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.cg-proto-cat   { font-size:8px; color:var(--text-muted); display:block; }
.cg-proto-tvl   { font-size:13px; font-weight:800; color:var(--accent); font-family:var(--font-mono); }
.cg-proto-chain { margin-top:2px; }

/* ── BTC Network tab ── */
.cg-btc-kpi-grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:1px; background:var(--border); border-bottom:1px solid var(--border); }
.cg-btc-kpi     { background:var(--bg-panel); padding:8px 12px; display:flex; flex-direction:column; gap:3px; }
.cg-btc-kpi-lbl { font-size:9px; text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted); font-weight:700; }
.cg-btc-kpi-val { font-size:15px; font-weight:800; font-family:var(--font-mono); }
.cg-btc-note    { font-size:10px; color:var(--text-muted); padding:8px 12px; line-height:1.5; border-bottom:1px solid var(--border); }
.cg-btc-chart-wrap { padding:6px 12px 10px; min-height:80px; }

/* ── Trending tab ── */
.cg-trend-grid  { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:6px; padding:6px 12px; }
.cg-trend-card  { display:flex; align-items:center; gap:8px; padding:7px 10px; background:var(--bg-input,#161b22); border:1px solid var(--border); border-radius:5px; }
.cg-trend-rank  { font-size:11px; font-weight:800; color:var(--text-muted); font-family:var(--font-mono); min-width:22px; }
.cg-trend-info  { display:flex; flex-direction:column; gap:1px; flex:1; overflow:hidden; }
.cg-trend-name  { font-size:11px; font-weight:600; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.cg-trend-sym   { font-size:9px; color:var(--text-muted); }
.cg-trend-mcr   { font-size:9px; color:var(--text-muted); font-family:var(--font-mono); }

/* ── Footer ── */
.cg-footer      { font-size:9px; color:var(--text-muted); padding:6px 12px; border-top:1px solid var(--border); display:flex; flex-wrap:wrap; gap:4px; align-items:center; }

/* ══════════════════════════════════════════════════════════════════
   PORTFOLIO MODULE v2 — Full Analytics Dashboard
   ══════════════════════════════════════════════════════════════════ */

/* Sub-tab bar */
.port-subtab-bar { display:flex; gap:2px; padding:5px 8px; background:var(--bg-panel); border-bottom:1px solid var(--border); flex-wrap:wrap; }
.port-stab       { background:transparent; border:1px solid var(--border); color:var(--text-muted); font-size:10px; font-weight:600; padding:3px 9px; border-radius:4px; cursor:pointer; transition:all .12s; }
.port-stab:hover { border-color:var(--accent); color:var(--accent); }
.port-stab.active{ background:var(--accent); border-color:var(--accent); color:#000; }

/* Tab panes */
.port-tab        { display:none; }
.port-tab.active { display:block; }

/* Allocation donut + bar row */
.port-alloc-row  { display:flex; align-items:center; gap:10px; padding:8px 12px; border-bottom:1px solid var(--border); }
.port-donut-wrap { flex-shrink:0; }

/* Holdings table */
.port-row:hover td { background:rgba(255,255,255,.025); }
.port-type-badge { font-size:8px; font-weight:700; text-transform:uppercase; padding:1px 5px; border-radius:3px; background:var(--border); color:var(--text-muted); letter-spacing:.04em; }
.port-tx-buy     { background:rgba(63,185,80,.15); color:#3fb950; }
.port-tx-sell    { background:rgba(248,81,73,.15); color:#f85149; }
.port-tx-dividend{ background:rgba(88,166,255,.15); color:#58a6ff; }
.port-tx-split   { background:rgba(210,153,34,.15); color:#d29922; }

/* Live price flash */
.port-price-flash { animation:portFlash .7s ease; }
@keyframes portFlash { 0%,100%{background:transparent} 40%{background:rgba(63,185,80,.2)} }

/* Performance chart */
.port-perf-wrap  { padding:6px 10px 8px; border-top:1px solid var(--border); }
.port-perf-header{ display:flex; justify-content:space-between; align-items:center; font-size:9px; color:var(--text-muted); margin-bottom:3px; }

/* Analytics grid */
.port-analytics-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:8px; padding:10px; }
.port-analytics-card  { background:var(--bg-input,#161b22); border:1px solid var(--border); border-radius:6px; padding:10px; }
.port-analytics-title { font-size:9px; text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); font-weight:700; margin-bottom:8px; }
.port-analytics-row   { display:flex; justify-content:space-between; padding:3px 0; font-size:10px; border-bottom:1px solid var(--border); }
.port-analytics-row:last-child { border:none; }
.port-analytics-best  { display:flex; flex-direction:column; gap:3px; margin-top:6px; font-size:9px; color:var(--text-muted); border-top:1px solid var(--border); padding-top:6px; }

/* Dividend tab */
.port-div-total  { padding:8px 12px; font-size:11px; border-bottom:1px solid var(--border); }

/* Transaction actions */
.port-tx-actions { display:flex; gap:8px; padding:8px 10px; border-top:1px solid var(--border); }

/* ══════════════════════════════════════════════════════════════════
   SCREENER MODULE v2 — Preset bar + Advanced results
   ══════════════════════════════════════════════════════════════════ */

.scr-preset-bar {
  display: flex; flex-wrap: wrap; gap: 3px;
  padding: 6px 8px; background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
}
.scr-preset-btn {
  flex: 0 0 auto;
  background: var(--bg-input,#161b22); border: 1px solid var(--border);
  color: var(--text-muted); font-size: 10px; font-weight: 600;
  padding: 3px 8px; border-radius: 4px; cursor: pointer;
  transition: all .12s; white-space: nowrap;
}
.scr-preset-btn:hover { border-color: var(--accent); color: var(--accent); }
.scr-preset-btn.active { background: var(--accent); border-color: var(--accent); color: #000; }
.scr-preset-custom { border-color: #d29922; color: #d29922; }
.scr-preset-custom:hover, .scr-preset-custom.active { background: #d29922; color: #000; }

.scr-results-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 5px 10px; border-bottom: 1px solid var(--border);
}
.scr-results-actions { display: flex; gap: 6px; }

.scr-table td { padding: 3px 5px; font-size: 10px; font-family: var(--font-mono); }
.scr-table th { font-size: 8px; white-space: nowrap; }

.scr-footer {
  font-size: 9px; color: var(--text-muted);
  padding: 5px 10px; border-top: 1px solid var(--border);
}

/* ══════════════════════════════════════════════════════════════════
   PUNTO 1 — Finnhub WebSocket flash animations
   ══════════════════════════════════════════════════════════════════ */
@keyframes fhFlashUp { 0%,100%{background:transparent} 30%{background:rgba(63,185,80,.22)} }
@keyframes fhFlashDn { 0%,100%{background:transparent} 30%{background:rgba(248,81,73,.22)} }
.fh-ws-flash-up { animation: fhFlashUp .8s ease; }
.fh-ws-flash-dn { animation: fhFlashDn .8s ease; }
/* Live price cells in watchlist */
.fh-ws-price { font-family: var(--font-mono); font-weight: 700; transition: color .2s; }

/* ══════════════════════════════════════════════════════════════════
   PUNTO 2 — Earnings Transcript UI
   ══════════════════════════════════════════════════════════════════ */
.trans-list          { display:flex; flex-direction:column; gap:3px; padding:8px 0; }
.trans-list-item     { display:grid; grid-template-columns:80px 1fr auto; gap:8px; align-items:center; padding:5px 10px; border:1px solid var(--border); border-radius:4px; background:var(--bg-input,#161b22); }
.trans-label         { font-size:11px; font-weight:700; color:var(--text); font-family:var(--font-mono); }
.trans-date          { font-size:9px; color:var(--text-muted); }
.trans-load-btn      { font-size:9px; font-weight:700; padding:2px 8px; background:var(--accent); color:#000; border:none; border-radius:3px; cursor:pointer; white-space:nowrap; }
.trans-load-btn:hover{ opacity:.85; }
.trans-header        { display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-bottom:1px solid var(--border); background:var(--bg-panel); position:sticky; top:0; z-index:2; }
.trans-title         { font-size:12px; font-weight:700; color:var(--text); }
.trans-meta          { font-size:9px; color:var(--text-muted); font-family:var(--font-mono); }
.trans-body          { padding:10px 12px; max-height:500px; overflow-y:auto; font-size:11px; line-height:1.7; color:var(--text); }
.trans-line          { display:flex; gap:8px; margin-bottom:6px; align-items:flex-start; }
.trans-speaker-mgmt  { flex-shrink:0; min-width:130px; font-weight:700; color:#58a6ff; font-size:10px; padding-top:1px; }
.trans-speaker-analyst{ flex-shrink:0; min-width:130px; font-weight:600; color:#d29922; font-size:10px; padding-top:1px; }
.trans-speech        { color:var(--text); line-height:1.6; }
.trans-no-key-note   { font-size:10px; color:var(--text-muted); padding:8px 12px; border-left:2px solid #d29922; margin:8px; line-height:1.6; }

/* ══════════════════════════════════════════════════════════════════
   PUNTO 5 — Air Quality Module styles
   ══════════════════════════════════════════════════════════════════ */
.aq-header          { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:10px; padding:10px 14px; }
.aq-location        { display:flex; flex-direction:column; gap:2px; }
.aq-ticker          { font-size:14px; font-weight:800; color:var(--text); font-family:var(--font-mono); }
.aq-city            { font-size:11px; color:var(--text-muted); }
.aq-dist            { font-size:9px; color:var(--text-muted); }
.aq-gauge           { flex-shrink:0; }
.aq-station-info    { display:flex; flex-direction:column; align-items:flex-end; gap:3px; }
.aq-station-name    { font-size:9px; color:var(--text-muted); text-align:right; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.aq-updated         { font-size:9px; color:var(--text-muted); font-family:var(--font-mono); }
.aq-src-badge       { font-size:8px; font-weight:700; padding:1px 5px; background:var(--border); border-radius:3px; color:var(--text-muted); }
.aq-pollutants      { padding:8px 14px; }
.aq-pol-title       { font-size:9px; text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); font-weight:700; margin-bottom:6px; }
.aq-pol-row         { display:grid; grid-template-columns:50px 1fr 70px; gap:6px; align-items:center; margin-bottom:5px; }
.aq-pol-name        { font-size:10px; color:var(--text-muted); font-weight:600; }
.aq-pol-bar-wrap    { height:5px; background:var(--border); border-radius:3px; overflow:hidden; }
.aq-pol-bar         { height:100%; border-radius:3px; transition:width .4s; }
.aq-pol-val         { font-size:10px; font-family:var(--font-mono); color:var(--text); text-align:right; }
.aq-upgrade-note    { font-size:9px; color:var(--text-muted); padding:5px 14px; border-top:1px solid var(--border); line-height:1.5; }
.aq-footer          { font-size:9px; color:var(--text-muted); padding:5px 14px 8px; border-top:1px solid var(--border); }

/* ══════════════════════════════════════════════════════════════════
   P10 — GDACS Global Disaster Alert System
   ══════════════════════════════════════════════════════════════════ */
.gdacs-header      { padding:6px 10px; border-bottom:1px solid var(--border); }
.gdacs-summary     { display:flex; gap:6px; margin-top:4px; flex-wrap:wrap; }
.gdacs-pill        { font-size:9px; font-weight:700; padding:2px 8px; border-radius:10px; }
.gdacs-list        { display:flex; flex-direction:column; gap:4px; padding:6px 8px; max-height:520px; overflow-y:auto; }
.gdacs-event       { padding:7px 10px; border-radius:4px; }
.gdacs-event-header{ display:flex; align-items:center; gap:6px; margin-bottom:3px; }
.gdacs-icon        { font-size:14px; flex-shrink:0; }
.gdacs-title       { font-size:11px; font-weight:600; color:var(--text); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.gdacs-level       { font-size:9px; font-weight:700; flex-shrink:0; }
.gdacs-meta        { font-size:9px; color:var(--text-muted); margin-bottom:2px; }
.gdacs-country     { font-weight:600; }
.gdacs-severity    { color:var(--text-muted); }
.gdacs-date        { color:var(--text-muted); }
.gdacs-desc        { font-size:10px; color:var(--text-muted); line-height:1.5; margin-bottom:3px; }
.gdacs-link        { font-size:9px; }
.gdacs-footer      { font-size:9px; color:var(--text-muted); padding:5px 10px; border-top:1px solid var(--border); }

/* ══════════════════════════════════════════════════════════════════
   P11 — NASDAQ Screener no-key (uses existing scr-* classes)
   ══════════════════════════════════════════════════════════════════ */
/* No new CSS needed — reuses scr-* from existing screener styles */

/* ══════════════════════════════════════════════════════════════════
   P13 — Binance WebSocket Live WS tab
   ══════════════════════════════════════════════════════════════════ */
.cg-bn-grid        { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:4px; padding:6px 8px; }
.cg-bn-card        { background:var(--bg-input,#161b22); border:1px solid var(--border); border-radius:5px; padding:8px 10px; display:flex; flex-direction:column; gap:3px; transition:border-color .2s; }
.cg-bn-card:hover  { border-color:var(--accent); }
.cg-bn-label       { font-size:10px; font-weight:700; color:var(--text-muted); }
.cg-bn-price       { font-size:15px; font-weight:800; color:var(--text); font-family:var(--font-mono); }
.cg-bn-status      { font-size:9px; font-family:var(--font-mono); }

/* ══════════════════════════════════════════════════════════════════
   Black-Scholes Greeks columns in Options table
   ══════════════════════════════════════════════════════════════════ */
.yf-opts-table th, .yf-opts-table td { font-size:9.5px; padding:3px 5px; white-space:nowrap; }
.yf-opts-table th { font-size:8px; letter-spacing:.03em; }

/* ══════════════════════════════════════════════════════════════════
   SEC FTD section in Short Interest tab
   ══════════════════════════════════════════════════════════════════ */
.si-ftd-section   { margin-top:10px; padding:8px 12px; border-top:1px solid var(--border); }
.si-ftd-title     { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted); margin-bottom:6px; }
.si-ftd-row       { display:grid; grid-template-columns:80px 1fr; gap:6px; align-items:center; padding:3px 0; border-bottom:1px solid var(--border); font-size:10px; }
.si-ftd-date      { font-family:var(--font-mono); font-size:9px; color:var(--text-muted); }
.si-ftd-link      { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* ══════════════════════════════════════════════════════════════════
   PWA install banner (subtle)
   ══════════════════════════════════════════════════════════════════ */
.pwa-install-btn  { font-size:9px; padding:3px 8px; background:transparent; border:1px solid var(--border); color:var(--text-muted); border-radius:3px; cursor:pointer; transition:.12s; }
.pwa-install-btn:hover { border-color:var(--accent); color:var(--accent); }

/* ══════════════════════════════════════════════════════════════════
   FA Tab — EDGAR XBRL enrichment + Stooq source badge
   ══════════════════════════════════════════════════════════════════ */
.xbrl-enrichment    { margin-top:8px; border-top:1px solid var(--border); padding-top:8px; }
.xbrl-kpi-row       { display:grid; grid-template-columns:repeat(auto-fill,minmax(110px,1fr)); gap:4px; padding:6px 0; }
.xbrl-kpi           { background:var(--bg-input,#161b22); border:1px solid var(--border); border-radius:4px; padding:6px 8px; display:flex; flex-direction:column; gap:2px; }
.xbrl-kpi-label     { font-size:8px; text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted); font-weight:700; }
.xbrl-kpi-val       { font-size:13px; font-weight:800; font-family:var(--font-mono); color:var(--text); }
.xbrl-kpi-date      { font-size:8px; color:var(--text-muted); font-family:var(--font-mono); }

/* ══════════════════════════════════════════════════════════════════
   PWA install prompt (future use)
   ══════════════════════════════════════════════════════════════════ */
.pwa-install-banner { display:none; position:fixed; bottom:16px; right:16px; background:var(--bg-panel); border:1px solid var(--border); border-radius:8px; padding:10px 14px; font-size:11px; z-index:9999; box-shadow:0 4px 16px rgba(0,0,0,.4); gap:10px; align-items:center; }
.pwa-install-banner.visible { display:flex; }

/* ══════════════════════════════════════════════════════════════════
   Geo·Risk — Wars / Resources / Routes tabs
   ══════════════════════════════════════════════════════════════════ */
.georisk-crises-grid    { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:5px; padding:6px 10px; }
.georisk-crisis-card    { padding:7px 9px; border-radius:4px; background:var(--bg-input,#161b22); border:1px solid var(--border); }
.georisk-crisis-header  { display:flex; align-items:center; gap:6px; margin-bottom:3px; }
.georisk-crisis-icon    { font-size:14px; flex-shrink:0; }
.georisk-crisis-name    { font-size:10px; font-weight:700; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.georisk-crisis-meta    { display:flex; gap:6px; font-size:9px; color:var(--text-muted); flex-wrap:wrap; }
.georisk-crisis-country { font-weight:600; }
.georisk-crisis-type    { color:var(--text-muted); }
.georisk-crisis-date    { font-family:var(--font-mono); }
.georisk-section-head   { font-size:9px; text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); font-weight:700; padding:6px 10px 3px; border-top:1px solid var(--border); margin-top:4px; }

.georisk-commodity-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(120px,1fr)); gap:4px; padding:6px 10px; }
.georisk-commodity-card { background:var(--bg-input,#161b22); border:1px solid var(--border); border-radius:4px; padding:7px 8px; display:flex; flex-direction:column; gap:2px; }
.georisk-commodity-name { font-size:9px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.04em; }
.georisk-commodity-price{ font-size:14px; font-weight:800; color:var(--text); font-family:var(--font-mono); }
.georisk-commodity-unit { font-size:8px; color:var(--text-muted); }
.georisk-commodity-date { font-size:8px; color:var(--text-muted); font-family:var(--font-mono); }

.georisk-choke-grid     { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:5px; padding:6px 10px; }
.georisk-choke-card     { padding:8px 10px; border-radius:4px; background:var(--bg-input,#161b22); border:1px solid var(--border); }
.georisk-choke-header   { display:flex; align-items:center; gap:6px; margin-bottom:4px; }
.georisk-choke-icon     { font-size:14px; flex-shrink:0; }
.georisk-choke-name     { font-size:11px; font-weight:700; color:var(--text); flex:1; }
.georisk-choke-risk     { font-size:8px; font-weight:800; letter-spacing:.04em; }
.georisk-choke-region   { font-size:9px; color:var(--text-muted); margin-bottom:2px; }
.georisk-choke-pct      { font-size:9px; color:var(--accent); font-family:var(--font-mono); }
.georisk-choke-threat   { font-size:9px; color:var(--text-muted); margin-top:2px; line-height:1.4; }
.georisk-alert-row      { display:flex; justify-content:space-between; align-items:center; padding:4px 10px; border-bottom:1px solid var(--border); gap:8px; }
.georisk-alerts-list    { max-height:150px; overflow-y:auto; }

/* ══════════════════════════════════════════════════════════════════
   API Quick-Setup Banners  (TRANS tab / AIR tab)
   ══════════════════════════════════════════════════════════════════ */
.api-quicksetup-banner {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin: 10px;
  padding: 12px 14px;
  background: linear-gradient(135deg, rgba(88,166,255,.08) 0%, rgba(88,166,255,.04) 100%);
  border: 1px solid rgba(88,166,255,.25);
  border-left: 3px solid var(--accent, #58a6ff);
  border-radius: 6px;
  position: relative;
}

.api-qs-icon {
  font-size: 22px;
  flex-shrink: 0;
  margin-top: 2px;
  filter: drop-shadow(0 0 4px rgba(88,166,255,.3));
}

.api-qs-body {
  flex: 1;
  min-width: 0;
}

.api-qs-title {
  font-size: 12px;
  font-weight: 800;
  color: var(--text, #e6edf3);
  margin-bottom: 4px;
  letter-spacing: .01em;
}

.api-qs-desc {
  font-size: 10px;
  color: var(--text-muted, #8b949e);
  line-height: 1.5;
  margin-bottom: 9px;
}

.api-qs-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.api-qs-btn-primary {
  padding: 5px 12px;
  background: var(--accent, #58a6ff);
  color: #0d1117;
  border: none;
  border-radius: 5px;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity .15s, transform .1s;
  white-space: nowrap;
}
.api-qs-btn-primary:hover { opacity: .85; transform: translateY(-1px); }

.api-qs-btn-link {
  font-size: 10px;
  color: var(--accent, #58a6ff);
  text-decoration: none;
  white-space: nowrap;
}
.api-qs-btn-link:hover { text-decoration: underline; }

.api-qs-dismiss {
  position: absolute;
  top: 6px;
  right: 8px;
  background: none;
  border: none;
  color: var(--text-muted, #8b949e);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 4px;
  line-height: 1;
  border-radius: 3px;
  opacity: .7;
}
.api-qs-dismiss:hover { opacity: 1; background: var(--border, #30363d); }

/* ══════════════════════════════════════════════════════════════════
   API STATUS BUTTON (topbar)
   ══════════════════════════════════════════════════════════════════ */
.api-status-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 11px; height: 26px;
  font-size: 11px; font-weight: 600; font-family: inherit; letter-spacing: .03em;
  color: var(--text-secondary, #8b949e);
  background: var(--bg-secondary, #161b22);
  border: 0.5px solid var(--border, #30363d);
  border-radius: 5px; cursor: pointer; white-space: nowrap;
  transition: color .15s, border-color .15s, background .15s;
}
.api-status-btn:hover { color: var(--accent, #58a6ff); border-color: var(--accent, #58a6ff); background: rgba(88,166,255,.07); }
.api-status-btn.active { color: var(--accent, #58a6ff); border-color: var(--accent, #58a6ff); background: rgba(88,166,255,.13); }

/* ══════════════════════════════════════════════════════════════════
   API STATUS LEFT SIDEBAR
   ══════════════════════════════════════════════════════════════════ */
.api-status-sidebar {
  position: fixed; top: 0; left: 0; width: 290px; height: 100vh;
  background: var(--bg-secondary, #161b22);
  border-right: 1px solid var(--border, #30363d);
  z-index: 3100; display: flex; flex-direction: column;
  transform: translateX(-100%);
  transition: transform .22s cubic-bezier(.4,0,.2,1);
  box-shadow: 6px 0 28px rgba(0,0,0,.5);
}
.api-status-sidebar.open { transform: translateX(0); }

.aps-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 13px 14px 9px; border-bottom: 1px solid var(--border, #30363d); flex-shrink: 0;
}
.aps-title { font-size: 13px; font-weight: 700; color: var(--text-primary, #e6edf3); letter-spacing: .04em; }
.aps-close-btn {
  background: none; border: none; color: var(--text-muted, #8b949e);
  font-size: 14px; cursor: pointer; padding: 2px 6px; border-radius: 4px; line-height: 1;
}
.aps-close-btn:hover { background: var(--border, #30363d); color: var(--text-primary, #e6edf3); }
.aps-subhead {
  font-size: 10px; color: var(--text-muted, #8b949e);
  padding: 5px 14px 7px; border-bottom: 1px solid var(--border, #30363d); flex-shrink: 0;
}

.aps-list { flex: 1; overflow-y: auto; padding: 6px 8px 8px; }
.aps-list::-webkit-scrollbar { width: 4px; }
.aps-list::-webkit-scrollbar-thumb { background: var(--border, #30363d); border-radius: 2px; }

.aps-group-label {
  font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
  color: var(--text-muted, #8b949e);
  padding: 10px 4px 4px; border-bottom: 1px solid var(--border, #30363d); margin-bottom: 4px;
}
.aps-group-label:first-child { padding-top: 4px; }

.aps-row {
  background: var(--bg-primary, #0d1117); border: 0.5px solid var(--border, #30363d);
  border-radius: 6px; padding: 7px 9px 6px; cursor: pointer; margin-bottom: 3px;
  transition: border-color .15s, background .15s;
}
.aps-row:hover { border-color: var(--accent, #58a6ff); background: rgba(88,166,255,.05); }

.aps-row-top { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.aps-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.aps-badge {
  font-size: 9px; font-weight: 700; font-family: monospace;
  padding: 1px 5px; border-radius: 3px;
  background: var(--bg-secondary, #161b22); border: 0.5px solid var(--border, #30363d);
  color: var(--text-secondary, #8b949e); letter-spacing: .05em; flex-shrink: 0;
}
.aps-name { font-size: 11px; font-weight: 600; color: var(--text-primary, #e6edf3); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.aps-status-lbl { font-size: 9px; font-weight: 700; letter-spacing: .04em; flex-shrink: 0; }
.aps-reset-btn {
  background: none; border: 0.5px solid var(--border, #30363d);
  color: var(--text-muted, #8b949e); font-size: 11px; cursor: pointer;
  padding: 0 5px; border-radius: 3px; flex-shrink: 0; line-height: 1.5;
}
.aps-reset-btn:hover { color: var(--accent, #58a6ff); border-color: var(--accent, #58a6ff); }

.aps-row-bottom { display: flex; align-items: center; gap: 7px; }
.aps-bar-wrap { flex: 1; height: 4px; background: var(--border, #30363d); border-radius: 2px; overflow: hidden; }
.aps-bar-fill { height: 100%; border-radius: 2px; transition: width .3s ease; min-width: 2px; }
.aps-count { font-size: 10px; font-family: monospace; color: var(--text-secondary, #8b949e); white-space: nowrap; flex-shrink: 0; }
.aps-unlimited { font-size: 10px; color: #3fb950; font-style: italic; }
.aps-nokey { font-size: 10px; color: var(--text-muted, #8b949e); font-style: italic; }
.aps-limit-note { font-size: 9px; color: var(--text-muted, #6e7681); margin-top: 3px; font-style: italic; }

.aps-footer {
  padding: 9px 12px; border-top: 1px solid var(--border, #30363d);
  font-size: 10px; color: var(--text-muted, #8b949e);
  display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-shrink: 0;
}
.aps-clear-btn {
  font-size: 10px; padding: 3px 8px; background: none;
  border: 0.5px solid var(--border, #30363d); color: var(--text-muted, #8b949e);
  border-radius: 4px; cursor: pointer; font-family: inherit; white-space: nowrap;
}
.aps-clear-btn:hover { color: #f85149; border-color: #f85149; }

/* Group heading inside ⚙ API Keys sidebar */
.api-group-heading {
  font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
  color: var(--text-muted, #8b949e);
  padding: 12px 4px 6px; border-bottom: 1px solid var(--border, #30363d); margin-bottom: 6px;
}
.api-group-heading:first-child { padding-top: 4px; }

/* ══════════════════════════════════════════════════════════════════
   API STATUS BUTTON (topbar)
   ══════════════════════════════════════════════════════════════════ */
.api-status-btn {
  display:inline-flex;align-items:center;gap:5px;padding:4px 11px;height:26px;
  font-size:11px;font-weight:600;font-family:inherit;letter-spacing:.03em;
  color:var(--text-secondary,#8b949e);background:var(--bg-secondary,#161b22);
  border:0.5px solid var(--border,#30363d);border-radius:5px;cursor:pointer;white-space:nowrap;
  transition:color .15s,border-color .15s,background .15s;
}
.api-status-btn:hover{color:var(--accent,#58a6ff);border-color:var(--accent,#58a6ff);background:rgba(88,166,255,.07)}
.api-status-btn.active{color:var(--accent,#58a6ff);border-color:var(--accent,#58a6ff);background:rgba(88,166,255,.13)}

/* ══════════════════════════════════════════════════════════════════
   API STATUS LEFT SIDEBAR
   ══════════════════════════════════════════════════════════════════ */
.api-status-sidebar{position:fixed;top:0;left:0;width:290px;height:100vh;
  background:var(--bg-secondary,#161b22);border-right:1px solid var(--border,#30363d);
  z-index:3100;display:flex;flex-direction:column;
  transform:translateX(-100%);transition:transform .22s cubic-bezier(.4,0,.2,1);
  box-shadow:6px 0 28px rgba(0,0,0,.5)}
.api-status-sidebar.open{transform:translateX(0)}
.aps-header{display:flex;align-items:center;justify-content:space-between;
  padding:13px 14px 9px;border-bottom:1px solid var(--border,#30363d);flex-shrink:0}
.aps-title{font-size:13px;font-weight:700;color:var(--text-primary,#e6edf3);letter-spacing:.04em}
.aps-close-btn{background:none;border:none;color:var(--text-muted,#8b949e);font-size:14px;
  cursor:pointer;padding:2px 6px;border-radius:4px;line-height:1}
.aps-close-btn:hover{background:var(--border,#30363d);color:var(--text-primary,#e6edf3)}
.aps-subhead{font-size:10px;color:var(--text-muted,#8b949e);padding:5px 14px 7px;
  border-bottom:1px solid var(--border,#30363d);flex-shrink:0}
.aps-list{flex:1;overflow-y:auto;padding:6px 8px 8px}
.aps-list::-webkit-scrollbar{width:4px}
.aps-list::-webkit-scrollbar-thumb{background:var(--border,#30363d);border-radius:2px}
.aps-group-label{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
  color:var(--text-muted,#8b949e);padding:10px 4px 4px;
  border-bottom:1px solid var(--border,#30363d);margin-bottom:4px}
.aps-group-label:first-child{padding-top:4px}
.aps-row{background:var(--bg-primary,#0d1117);border:0.5px solid var(--border,#30363d);
  border-radius:6px;padding:7px 9px 6px;cursor:pointer;margin-bottom:3px;
  transition:border-color .15s,background .15s}
.aps-row:hover{border-color:var(--accent,#58a6ff);background:rgba(88,166,255,.05)}
.aps-row-top{display:flex;align-items:center;gap:6px;margin-bottom:4px}
.aps-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.aps-badge{font-size:9px;font-weight:700;font-family:monospace;padding:1px 5px;border-radius:3px;
  background:var(--bg-secondary,#161b22);border:0.5px solid var(--border,#30363d);
  color:var(--text-secondary,#8b949e);letter-spacing:.05em;flex-shrink:0}
.aps-name{font-size:11px;font-weight:600;color:var(--text-primary,#e6edf3);flex:1;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.aps-status-lbl{font-size:9px;font-weight:700;letter-spacing:.04em;flex-shrink:0}
.aps-reset-btn{background:none;border:0.5px solid var(--border,#30363d);
  color:var(--text-muted,#8b949e);font-size:11px;cursor:pointer;padding:0 5px;
  border-radius:3px;flex-shrink:0;line-height:1.5}
.aps-reset-btn:hover{color:var(--accent,#58a6ff);border-color:var(--accent,#58a6ff)}
.aps-row-bottom{display:flex;align-items:center;gap:7px}
.aps-bar-wrap{flex:1;height:4px;background:var(--border,#30363d);border-radius:2px;overflow:hidden}
.aps-bar-fill{height:100%;border-radius:2px;transition:width .3s ease;min-width:2px}
.aps-count{font-size:10px;font-family:monospace;color:var(--text-secondary,#8b949e);white-space:nowrap;flex-shrink:0}
.aps-unlimited{font-size:10px;color:#3fb950;font-style:italic}
.aps-nokey{font-size:10px;color:var(--text-muted,#8b949e);font-style:italic}
.aps-limit-note{font-size:9px;color:var(--text-muted,#6e7681);margin-top:3px;font-style:italic}
.aps-footer{padding:9px 12px;border-top:1px solid var(--border,#30363d);font-size:10px;
  color:var(--text-muted,#8b949e);display:flex;align-items:center;justify-content:space-between;gap:8px;flex-shrink:0}
.aps-clear-btn{font-size:10px;padding:3px 8px;background:none;
  border:0.5px solid var(--border,#30363d);color:var(--text-muted,#8b949e);
  border-radius:4px;cursor:pointer;font-family:inherit;white-space:nowrap}
.aps-clear-btn:hover{color:#f85149;border-color:#f85149}
.api-group-heading{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
  color:var(--text-muted,#8b949e);padding:12px 4px 6px;
  border-bottom:1px solid var(--border,#30363d);margin-bottom:6px}
.api-group-heading:first-child{padding-top:4px}

/* ══════════════════════════════════════════════════════════════════
   ENERGY MODULE  (energy.js → #macro-energy, #supply-energy)
   ══════════════════════════════════════════════════════════════════ */
.en-loading{display:flex;align-items:center;gap:8px;padding:20px 14px;color:var(--text-muted,#8b949e);font-size:12px}
.en-live-bar{display:flex;align-items:center;gap:7px;padding:7px 12px;
  background:rgba(63,185,80,.07);border-bottom:1px solid rgba(63,185,80,.2);
  font-size:10px;font-weight:600;letter-spacing:.04em;color:#3fb950;flex-shrink:0}
.en-live-dot{width:7px;height:7px;border-radius:50%;background:#3fb950;animation:pulse 2s infinite}
.en-live-sub{color:var(--text-muted,#8b949e);font-weight:400}
.en-section-head{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
  color:var(--text-muted,#8b949e);padding:10px 12px 5px;border-bottom:1px solid var(--border,#30363d)}
.en-nodata{padding:10px 12px;font-size:11px;color:var(--text-muted,#8b949e);font-style:italic}
.en-price-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));
  gap:6px;padding:8px 10px}
.en-price-card{background:var(--bg-primary,#0d1117);border:0.5px solid var(--border,#30363d);
  border-radius:8px;padding:10px 10px 8px;display:flex;flex-direction:column;gap:3px}
.en-price-card-empty{opacity:.5}
.en-pc-top{display:flex;align-items:center;gap:5px;margin-bottom:2px}
.en-pc-icon{font-size:14px}
.en-pc-label{font-size:10px;font-weight:700;color:var(--text-primary,#e6edf3);flex:1}
.en-pc-unit{font-size:8px;color:var(--text-muted,#8b949e)}
.en-pc-val{font-size:20px;font-weight:700;font-family:monospace;line-height:1}
.en-pc-chg{font-size:10px;font-weight:600;display:flex;align-items:center;gap:4px}
.en-pc-abs{font-size:9px;opacity:.7}
.en-pc-spark{margin:4px 0}
.en-pc-meta{display:flex;flex-wrap:wrap;gap:4px;font-size:9px}
.en-pc-note{font-size:9px;font-style:italic}
.en-pos{color:#3fb950} .en-neg{color:#f85149} .en-muted{color:var(--text-muted,#8b949e)}
.en-storage-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:8px 12px}
.en-storage-kpi{display:flex;flex-direction:column;gap:2px;
  background:var(--bg-primary,#0d1117);border:0.5px solid var(--border,#30363d);
  border-radius:6px;padding:8px 10px}
.en-storage-lbl{font-size:9px;color:var(--text-muted,#8b949e);font-weight:600;letter-spacing:.04em}
.en-storage-val{font-size:14px;font-weight:700;font-family:monospace}
.en-storage-date{font-size:9px;color:var(--text-muted,#8b949e);padding:4px 12px}
.en-storage-spark-wrap{padding:4px 12px 8px;display:flex;align-items:center;gap:8px}
.en-storage-spark-lbl{font-size:9px;color:var(--text-muted,#8b949e)}
.en-gie-wrap{padding:6px 10px;overflow-x:auto}
.en-gie-table{width:100%;border-collapse:collapse;font-size:11px}
.en-gie-table th{font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
  color:var(--text-muted,#8b949e);padding:5px 6px;text-align:left;
  border-bottom:1px solid var(--border,#30363d)}
.en-gie-table td{padding:5px 6px;border-bottom:1px solid rgba(48,54,61,.5);vertical-align:middle}
.en-gie-country{font-weight:600;color:var(--text-primary,#e6edf3)}
.en-gie-bar-wrap{background:var(--border,#30363d);border-radius:2px;height:4px;width:60px;display:inline-block;vertical-align:middle;margin-right:4px}
.en-gie-bar{height:100%;border-radius:2px;transition:width .3s}
.en-flows-list{padding:6px 12px;display:flex;flex-direction:column;gap:4px}
.en-flow-row{display:flex;align-items:center;gap:6px}
.en-flow-route{font-size:10px;color:var(--text-secondary,#8b949e);width:160px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.en-flow-bar-wrap{flex:1;background:var(--border,#30363d);border-radius:2px;height:5px;overflow:hidden}
.en-flow-bar{height:100%;background:var(--accent,#58a6ff);border-radius:2px}
.en-flow-val{font-size:10px;font-family:monospace;color:var(--text-secondary,#8b949e);width:70px;text-align:right;flex-shrink:0}
.en-link{color:var(--accent,#58a6ff);text-decoration:none;font-size:10px}
.en-link:hover{text-decoration:underline}
.en-footer{padding:10px 12px;font-size:10px;color:var(--text-muted,#8b949e);
  border-top:1px solid var(--border,#30363d);display:flex;flex-wrap:wrap;gap:4px}

/* ══════════════════════════════════════════════════════════════════
   COMMODITIES MODULE  (commodities.js → #macro-commodities)
   ══════════════════════════════════════════════════════════════════ */
.cm-live-bar{display:flex;align-items:center;gap:7px;padding:7px 12px;
  background:rgba(88,166,255,.07);border-bottom:1px solid rgba(88,166,255,.2);
  font-size:10px;font-weight:600;letter-spacing:.04em;color:var(--accent,#58a6ff);flex-shrink:0}
.cm-section{padding:8px 12px 4px;font-size:10px;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;color:var(--text-muted,#8b949e);border-bottom:1px solid var(--border,#30363d)}
.cm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:5px;padding:6px 10px}
.cm-card{background:var(--bg-primary,#0d1117);border:0.5px solid var(--border,#30363d);
  border-radius:7px;padding:8px 9px;cursor:default}
.cm-card-top{display:flex;align-items:center;gap:5px;margin-bottom:3px}
.cm-icon{font-size:13px}
.cm-label{font-size:10px;font-weight:700;color:var(--text-primary,#e6edf3);flex:1;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cm-unit{font-size:8px;color:var(--text-muted,#8b949e)}
.cm-val{font-size:17px;font-weight:700;font-family:monospace;line-height:1.1}
.cm-chg{font-size:10px;font-weight:600}
.cm-date{font-size:9px;color:var(--text-muted,#8b949e)}
.cm-pos{color:#3fb950} .cm-neg{color:#f85149} .cm-muted{color:var(--text-muted,#8b949e)}
.cm-footer{padding:8px 12px;font-size:10px;color:var(--text-muted,#8b949e);
  border-top:1px solid var(--border,#30363d)}

/* ══════════════════════════════════════════════════════════════════
   MINERALS MODULE  (minerals.js → #supply-minerals)
   ══════════════════════════════════════════════════════════════════ */
.min-live-bar{display:flex;align-items:center;gap:7px;padding:7px 12px;
  background:rgba(210,153,34,.08);border-bottom:1px solid rgba(210,153,34,.25);
  font-size:10px;font-weight:600;color:#d29922;flex-shrink:0}
.min-section{padding:8px 12px 4px;font-size:10px;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;color:var(--text-muted,#8b949e);border-bottom:1px solid var(--border,#30363d)}
.min-card{background:var(--bg-primary,#0d1117);border:0.5px solid var(--border,#30363d);
  border-radius:8px;padding:10px 11px;margin:4px 10px}
.min-card-head{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.min-icon{font-size:16px}
.min-name{font-size:13px;font-weight:700;color:var(--text-primary,#e6edf3);flex:1}
.min-symbol{font-size:10px;font-family:monospace;color:var(--text-muted,#8b949e)}
.min-badges{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:6px}
.min-badge{font-size:8px;font-weight:700;padding:1px 5px;border-radius:3px;letter-spacing:.04em}
.min-badge-srm{background:rgba(248,81,73,.15);color:#f85149;border:0.5px solid rgba(248,81,73,.3)}
.min-badge-crm{background:rgba(210,153,34,.15);color:#d29922;border:0.5px solid rgba(210,153,34,.3)}
.min-badge-nato{background:rgba(88,166,255,.12);color:#58a6ff;border:0.5px solid rgba(88,166,255,.25)}
.min-badge-doe{background:rgba(63,185,80,.12);color:#3fb950;border:0.5px solid rgba(63,185,80,.25)}
.min-stats{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;margin-bottom:6px}
.min-stat{display:flex;flex-direction:column;gap:1px}
.min-stat-lbl{font-size:9px;color:var(--text-muted,#8b949e);font-weight:600}
.min-stat-val{font-size:11px;font-weight:600;color:var(--text-primary,#e6edf3)}
.min-producers{font-size:9px;color:var(--text-secondary,#8b949e);margin-bottom:4px}
.min-note{font-size:9px;color:var(--text-muted,#8b949e);font-style:italic;
  border-top:1px solid var(--border,#30363d);padding-top:4px;margin-top:4px}
.min-import-bar{height:5px;border-radius:2px;margin:3px 0}
.min-footer{padding:8px 12px;font-size:10px;color:var(--text-muted,#8b949e);
  border-top:1px solid var(--border,#30363d)}

/* ══════════════════════════════════════════════════════════════════
   POSITIONING MODULE  (positioning.js → #macro-positioning)
   ══════════════════════════════════════════════════════════════════ */
.pos-live-bar{display:flex;align-items:center;gap:7px;padding:7px 12px;
  background:rgba(163,113,247,.08);border-bottom:1px solid rgba(163,113,247,.25);
  font-size:10px;font-weight:600;color:#a371f7;flex-shrink:0}
.pos-grid{display:flex;flex-direction:column;gap:4px;padding:6px 10px}
.pos-row{background:var(--bg-primary,#0d1117);border:0.5px solid var(--border,#30363d);
  border-radius:6px;padding:8px 10px}
.pos-row-top{display:flex;align-items:center;gap:8px;margin-bottom:4px}
.pos-name{font-size:11px;font-weight:700;color:var(--text-primary,#e6edf3);flex:1}
.pos-date{font-size:9px;color:var(--text-muted,#8b949e)}
.pos-net{font-size:12px;font-weight:700;font-family:monospace}
.pos-bar-wrap{position:relative;height:8px;background:var(--border,#30363d);border-radius:4px;overflow:hidden}
.pos-bar-long{position:absolute;left:50%;height:100%;border-radius:0 4px 4px 0;background:#3fb950}
.pos-bar-short{position:absolute;right:50%;height:100%;border-radius:4px 0 0 4px;background:#f85149}
.pos-labels{display:flex;justify-content:space-between;font-size:9px;color:var(--text-muted,#8b949e);margin-top:2px}
.pos-signal{font-size:9px;font-weight:700;letter-spacing:.04em}
.pos-bull{color:#3fb950} .pos-bear{color:#f85149} .pos-neutral{color:var(--text-muted,#8b949e)}

/* ══════════════════════════════════════════════════════════════════
   AGRICULTURE MODULE  (agriculture.js → #macro-agri)
   ══════════════════════════════════════════════════════════════════ */
.ag-live-bar{display:flex;align-items:center;gap:7px;padding:7px 12px;
  background:rgba(63,185,80,.07);border-bottom:1px solid rgba(63,185,80,.2);
  font-size:10px;font-weight:600;color:#3fb950;flex-shrink:0}
.ag-section{padding:8px 12px 4px;font-size:10px;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;color:var(--text-muted,#8b949e);border-bottom:1px solid var(--border,#30363d)}
.ag-price-list{display:flex;flex-direction:column;gap:3px;padding:6px 10px}
.ag-price-row{display:flex;align-items:center;gap:8px;padding:5px 8px;
  background:var(--bg-primary,#0d1117);border:0.5px solid var(--border,#30363d);border-radius:5px}
.ag-icon{font-size:13px;flex-shrink:0}
.ag-label{font-size:11px;font-weight:600;color:var(--text-primary,#e6edf3);flex:1}
.ag-unit{font-size:9px;color:var(--text-muted,#8b949e)}
.ag-val{font-size:12px;font-weight:700;font-family:monospace}
.ag-chg{font-size:10px;font-weight:600}
.ag-pos{color:#3fb950} .ag-neg{color:#f85149} .ag-muted{color:var(--text-muted,#8b949e)}
.ag-footer{padding:8px 12px;font-size:10px;color:var(--text-muted,#8b949e);
  border-top:1px solid var(--border,#30363d)}

/* ══════════════════════════════════════════════════════════════════
   INTEL MODULE  (intel.js → #news-intel)
   ══════════════════════════════════════════════════════════════════ */
.intel-live-bar{display:flex;align-items:center;gap:7px;padding:7px 12px;
  background:rgba(248,81,73,.07);border-bottom:1px solid rgba(248,81,73,.2);
  font-size:10px;font-weight:600;color:#f85149;flex-shrink:0}
.intel-section{padding:8px 12px 4px;font-size:10px;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;color:var(--text-muted,#8b949e);border-bottom:1px solid var(--border,#30363d)}
.intel-event{background:var(--bg-primary,#0d1117);border:0.5px solid var(--border,#30363d);
  border-radius:6px;padding:9px 11px;margin:4px 10px;cursor:pointer;transition:border-color .15s}
.intel-event:hover{border-color:var(--accent,#58a6ff)}
.intel-event-top{display:flex;align-items:flex-start;gap:8px;margin-bottom:4px}
.intel-event-type{font-size:9px;font-weight:700;letter-spacing:.05em;padding:1px 6px;
  border-radius:3px;flex-shrink:0;text-transform:uppercase}
.intel-event-title{font-size:11px;font-weight:600;color:var(--text-primary,#e6edf3);flex:1;line-height:1.4}
.intel-event-date{font-size:9px;color:var(--text-muted,#8b949e);flex-shrink:0}
.intel-event-body{font-size:10px;color:var(--text-secondary,#8b949e);line-height:1.5;
  border-top:1px solid var(--border,#30363d);padding-top:5px;margin-top:4px}
.intel-event-link{font-size:10px;color:var(--accent,#58a6ff);text-decoration:none;display:inline-block;margin-top:4px}
.intel-event-link:hover{text-decoration:underline}
.intel-type-policy{background:rgba(248,81,73,.12);color:#f85149;border:0.5px solid rgba(248,81,73,.3)}
.intel-type-export{background:rgba(210,153,34,.12);color:#d29922;border:0.5px solid rgba(210,153,34,.3)}
.intel-type-event{background:rgba(88,166,255,.12);color:#58a6ff;border:0.5px solid rgba(88,166,255,.25)}
.intel-type-default{background:rgba(48,54,61,.5);color:var(--text-muted,#8b949e);border:0.5px solid var(--border,#30363d)}
.intel-nodata{padding:14px 12px;font-size:11px;color:var(--text-muted,#8b949e);font-style:italic}
.intel-footer{padding:8px 12px;font-size:10px;color:var(--text-muted,#8b949e);
  border-top:1px solid var(--border,#30363d)}

/* ══════════════════════════════════════════════════════════════════
   NEWS SUB-TABS  (news panel with ticker/intel tabs)
   ══════════════════════════════════════════════════════════════════ */
.news-subpane{display:block}
.news-subpane[style*="display:none"]{display:none !important}
#news-tab-bar{padding:0 8px;background:var(--bg-secondary,#161b22)}
#news-tab-bar .tab-btn{font-size:10px;padding:5px 10px}

/* ══════════════════════════════════════════════════════════════════
   PROVIDER badge label  (news feed header — ni-badge-apitube)
   ══════════════════════════════════════════════════════════════════ */
.ni-badge-apitube{background:rgba(163,113,247,.15);color:#a371f7;border:1px solid rgba(163,113,247,.3)}
/* ══════════════════════════════════════════════════════════════════
   phase1_styles.css — CSS additions for Phase 1 Identity modules
   Append this to the end of style.css
   Covers: openfigi.js · nasdaqdir.js · gleif.js
   ══════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────────
   SHARED — Identity & Reference section head badge
   ───────────────────────────────────────────────────────────────── */
.gleif-head,
.of-id-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.gleif-src-badge,
.of-id-src {
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--color-text-muted, #6e7681);
  background: var(--color-background-secondary, #161b22);
  border: 0.5px solid var(--color-border-secondary, #30363d);
  border-radius: 3px;
  padding: 1px 5px;
  margin-left: auto;
}

/* ─────────────────────────────────────────────────────────────────
   OPENFIGI — Identifiers block in #fund-des
   ───────────────────────────────────────────────────────────────── */
.of-identifiers-block {
  margin: 10px 0 6px;
  padding: 10px 12px;
  background: var(--color-background-secondary, #161b22);
  border: 0.5px solid var(--color-border-secondary, #30363d);
  border-left: 2px solid #58a6ff;
  border-radius: 0 6px 6px 0;
}

.of-id-grid {
  display: grid;
  gap: 4px;
  margin: 6px 0;
}

.of-id-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-height: 20px;
}

.of-id-label {
  font-size: 10px;
  color: var(--color-text-muted, #6e7681);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  min-width: 110px;
  flex-shrink: 0;
}

.of-id-value {
  font-size: 11px;
  color: var(--color-text-primary, #e6edf3);
  font-variant-numeric: tabular-nums;
  word-break: break-all;
  display: flex;
  align-items: center;
  gap: 6px;
}

.of-id-links {
  display: flex;
  gap: 10px;
  margin-top: 6px;
  flex-wrap: wrap;
}

.of-id-link {
  font-size: 10px;
  color: var(--color-accent, #58a6ff);
  text-decoration: none;
}
.of-id-link:hover { text-decoration: underline; }

/* ─────────────────────────────────────────────────────────────────
   NASDAQ DIRECTORY — DES listing block
   ───────────────────────────────────────────────────────────────── */
.ndq-dir-block {
  margin: 8px 0 6px;
  padding: 8px 12px;
  background: var(--color-background-secondary, #161b22);
  border: 0.5px solid var(--color-border-secondary, #30363d);
  border-left: 2px solid #3fb950;
  border-radius: 0 6px 6px 0;
}

.ndq-dir-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ndq-dir-label {
  font-size: 9px;
  color: var(--color-text-muted, #6e7681);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  flex-shrink: 0;
}

.ndq-dir-vals {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}

.ndq-type-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
  letter-spacing: 0.4px;
}
.ndq-etf    { background: rgba(88,166,255,0.15); color: #58a6ff; border: 0.5px solid rgba(88,166,255,0.35); }
.ndq-mf     { background: rgba(162,94,247,0.15); color: #a371f7; border: 0.5px solid rgba(162,94,247,0.35); }
.ndq-equity { background: rgba(63,185,80,0.12);  color: #3fb950; border: 0.5px solid rgba(63,185,80,0.3);  }

.ndq-exch-badge {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-secondary, #8b949e);
  background: var(--color-border, #21262d);
  border-radius: 3px;
  padding: 1px 5px;
}

.ndq-cat-badge,
.ndq-fund-fam,
.ndq-fund-cat {
  font-size: 9px;
  color: var(--color-text-muted, #6e7681);
  background: rgba(110,118,129,0.1);
  border: 0.5px solid var(--color-border-secondary, #30363d);
  border-radius: 3px;
  padding: 1px 5px;
}

/* Action / corp-action banners inside DES */
.ndq-action-alert {
  margin-top: 6px;
  padding: 5px 8px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.4;
}
.ndq-delist  { background: rgba(248,81,73,0.1);   border: 0.5px solid rgba(248,81,73,0.3);   color: #f85149; }
.ndq-rename  { background: rgba(210,153,34,0.1);  border: 0.5px solid rgba(210,153,34,0.3);  color: #d29922; }
.ndq-action  { background: rgba(63,185,80,0.08);  border: 0.5px solid rgba(63,185,80,0.25);  color: #3fb950; }

/* ─────────────────────────────────────────────────────────────────
   NASDAQ CORP ACTIONS TAB in Alert panel
   ───────────────────────────────────────────────────────────────── */
.ndq-ca-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 0.5px solid var(--color-border, #21262d);
  flex-wrap: wrap;
}
.ndq-ca-row:last-child { border-bottom: none; }

.ndq-ca-add  { border-left: 2px solid #3fb950; }
.ndq-ca-del  { border-left: 2px solid #f85149; }
.ndq-ca-rename { border-left: 2px solid #d29922; }

.ndq-ca-sym {
  font-size: 12px;
  font-weight: 700;
  font-family: var(--font-mono, monospace);
  color: var(--color-accent, #58a6ff);
  min-width: 60px;
  flex-shrink: 0;
}

.ndq-ca-name {
  font-size: 11px;
  color: var(--color-text-secondary, #8b949e);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ndq-ca-date {
  font-size: 10px;
  color: var(--color-text-muted, #6e7681);
  font-variant-numeric: tabular-nums;
}

.ndq-ca-reason {
  font-size: 10px;
  color: var(--color-text-muted, #6e7681);
  font-style: italic;
}

.ndq-ca-tag {
  font-size: 8px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  letter-spacing: 0.4px;
  flex-shrink: 0;
}
.ndq-tag-add    { background: rgba(63,185,80,0.15);  color: #3fb950; border: 0.5px solid rgba(63,185,80,0.3);  }
.ndq-tag-del    { background: rgba(248,81,73,0.12);  color: #f85149; border: 0.5px solid rgba(248,81,73,0.3);  }
.ndq-tag-rename { background: rgba(210,153,34,0.12); color: #d29922; border: 0.5px solid rgba(210,153,34,0.3); }

/* ─────────────────────────────────────────────────────────────────
   GLEIF — Global Identity block in #fund-des
   ───────────────────────────────────────────────────────────────── */
.gleif-identity-block {
  margin: 10px 0 6px;
  padding: 10px 12px;
  background: var(--color-background-secondary, #161b22);
  border: 0.5px solid var(--color-border-secondary, #30363d);
  border-left: 2px solid #a371f7;
  border-radius: 0 6px 6px 0;
}

.gleif-id-grid {
  display: grid;
  gap: 4px;
  margin: 6px 0;
}

.gleif-id-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-height: 20px;
}

.gleif-id-label {
  font-size: 10px;
  color: var(--color-text-muted, #6e7681);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  min-width: 110px;
  flex-shrink: 0;
}

.gleif-id-value {
  font-size: 11px;
  color: var(--color-text-primary, #e6edf3);
  word-break: break-all;
  display: flex;
  align-items: center;
  gap: 6px;
}

.gleif-lei-code {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: #a371f7;
  background: rgba(162,94,247,0.1);
  border: 0.5px solid rgba(162,94,247,0.25);
  border-radius: 3px;
  padding: 1px 5px;
  letter-spacing: 0.5px;
}
.gleif-lei-sm { font-size: 9px; padding: 0 4px; }

.gleif-copy-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text-muted, #6e7681);
  font-size: 11px;
  padding: 0 2px;
  line-height: 1;
  transition: color 0.15s;
}
.gleif-copy-btn:hover { color: var(--color-accent, #58a6ff); }

.gleif-links {
  display: flex;
  gap: 10px;
  margin-top: 6px;
  flex-wrap: wrap;
}

.gleif-ext-link {
  font-size: 10px;
  color: var(--color-accent, #58a6ff);
  text-decoration: none;
}
.gleif-ext-link:hover { text-decoration: underline; }

/* ─────────────────────────────────────────────────────────────────
   GLEIF — Corporate Structure block in #own-mgmt
   ───────────────────────────────────────────────────────────────── */
.gleif-structure-block {
  margin-top: 14px;
  padding: 10px 12px;
  background: var(--color-background-secondary, #161b22);
  border: 0.5px solid var(--color-border-secondary, #30363d);
  border-left: 2px solid #a371f7;
  border-radius: 0 6px 6px 0;
}

.gleif-chain {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 8px 0;
}

.gleif-parent-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  background: var(--color-background, #0d1117);
  border: 0.5px solid var(--color-border, #21262d);
  border-radius: 6px;
  transition: border-color 0.15s;
}
.gleif-parent-card:hover { border-color: rgba(162,94,247,0.4); }

.gleif-parent-icon {
  font-size: 18px;
  line-height: 1;
  margin-top: 2px;
  flex-shrink: 0;
}

.gleif-parent-body {
  flex: 1;
  min-width: 0;
}

.gleif-parent-label {
  font-size: 9px;
  color: var(--color-text-muted, #6e7681);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-bottom: 2px;
}

.gleif-parent-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-primary, #e6edf3);
  word-break: break-word;
}

.gleif-parent-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  flex-wrap: wrap;
  font-size: 10px;
  color: var(--color-text-muted, #6e7681);
}
