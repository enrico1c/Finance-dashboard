/* ══════════════════════════════════════════════════════════════════
   FINTERM — congress.js
   US Congress Insider Trading Tracker
   Source: congress-trades dataset (static JSON, no API key needed)
   Panel: Alerts → 🏛 CONGRESS tab (#alert-congress)
   ══════════════════════════════════════════════════════════════════ */

const _cgEsc = s => String(s ?? '').replace(/[<>&"]/g, c =>
  ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

const _cgDate = d => {
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  const day = String(dt.getDate()).padStart(2, '0');
  const mon = String(dt.getMonth() + 1).padStart(2, '0');
  return `${day}/${mon}`;
};

const _cgParty = p => p === 'Democrat' ? '🔵' : p === 'Republican' ? '🔴' : '⚪';
const _cgType  = t => t?.startsWith('Purchase') ? { icon:'▲', col:'#3fb950' } : { icon:'▼', col:'#f85149' };

/* Severity config */
const CG_SEV = {
  critical: { label:'🔴 Critical', col:'#f85149' },
  high:     { label:'🟠 High',     col:'#f0883e' },
  medium:   { label:'🟡 Medium',   col:'#d29922' },
  low:      { label:'🟢 Low',      col:'#58a6ff' },
};

/* Cache */
let _cgData = null;
let _cgView = 'recent'; // 'recent' | 'flagged' | 'members'

async function _cgLoad() {
  if (_cgData) return _cgData;
  const [dash, flags, members] = await Promise.all([
    fetch('./data/congress/dashboard.json').then(r => r.json()),
    fetch('./data/congress/flags.json').then(r => r.json()),
    fetch('./data/congress/members.json').then(r => r.json()),
  ]);
  _cgData = { dash, flags, members };
  return _cgData;
}

window.congressLoad = async function() {
  const el = document.getElementById('alert-congress');
  if (!el) return;
  el.innerHTML = `<div class="av-loading"><span class="av-spinner"></span>Loading Congress trading data…</div>`;
  try {
    const { dash, flags, members } = await _cgLoad();
    congressRender(el, dash, flags, members, _cgView);
  } catch(e) {
    el.innerHTML = `<div class="no-data">// Failed to load Congress data: ${_cgEsc(e.message)}</div>`;
  }
};

window.congressSetView = function(view) {
  _cgView = view;
  const el = document.getElementById('alert-congress');
  if (!el || !_cgData) return;
  congressRender(el, _cgData.dash, _cgData.flags, _cgData.members, view);
};

function congressRender(el, dash, flags, members, view) {
  const lastUpd = dash.lastUpdated ? new Date(dash.lastUpdated).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'2-digit'}) : '';

  // Sort flags by severity then score
  const sevOrder = { critical:0, high:1, medium:2, low:3 };
  const flagsSorted = [...flags].sort((a,b) =>
    (sevOrder[a.severity]??9) - (sevOrder[b.severity]??9) || (b.overallScore||0) - (a.overallScore||0));

  let html = `<div class="av-live-badge">● US Congress Insider Trading Tracker · ${dash.totalTrades} trades · ${dash.totalFlaggedTrades} flagged · Updated ${lastUpd}</div>`;

  // ── Stats bar
  html += `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:6px;border-bottom:1px solid var(--border)">
    ${[
      ['👥 Members', dash.totalMembers],
      ['📊 Trades',  dash.totalTrades],
      ['🚩 Flagged', dash.totalFlaggedTrades],
      ['🏢 Companies', dash.totalCompanies],
    ].map(([l,v]) => `<div style="text-align:center;background:var(--bg-panel);border:1px solid var(--border);border-radius:3px;padding:4px">
      <div style="font-size:9px;color:var(--text-muted)">${l}</div>
      <div style="font-size:12px;font-weight:700;color:var(--text)">${v}</div>
    </div>`).join('')}
  </div>`;

  // ── Tab switcher
  const tabs = [['recent','📅 Recent'],['flagged','🚩 Flagged'],['members','👥 Members']];
  html += `<div style="display:flex;gap:2px;padding:4px 6px;border-bottom:1px solid var(--border)">`;
  tabs.forEach(([v,l]) => {
    const active = v === view;
    html += `<button onclick="congressSetView('${v}')" style="flex:1;padding:4px 6px;font-size:9px;border:1px solid ${active?'var(--accent)':'var(--border)'};background:${active?'rgba(31,111,235,0.15)':'var(--bg-panel)'};color:${active?'var(--accent)':'var(--text-muted)'};border-radius:3px;cursor:pointer">${l}</button>`;
  });
  html += `</div><div style="overflow-y:auto;height:calc(100% - 120px);padding:6px">`;

  if (view === 'recent') {
    // Recent trades
    const recent = dash.recentTrades || [];
    html += `<div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:6px">Most Recent Disclosed Trades</div>`;
    recent.forEach(t => {
      const tt = _cgType(t.tradeType);
      const party = _cgParty(t.memberParty);
      html += `<div style="padding:6px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:5px;margin-bottom:2px">
          <span style="color:${tt.col};font-weight:700;font-size:12px">${tt.icon}</span>
          <strong style="font-size:11px;color:var(--text)">${_cgEsc(t.ticker)}</strong>
          <span style="font-size:10px;color:var(--text-muted)">${_cgEsc(t.companyName)}</span>
          <span style="margin-left:auto;font-size:9px;color:var(--text-muted)">${_cgDate(t.tradeDate)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;font-size:9px;color:var(--text-muted)">
          <span>${party} ${_cgEsc(t.memberName)}</span>
          <span>·</span>
          <span>${_cgEsc(t.memberChamber)}</span>
          <span>·</span>
          <span style="color:${tt.col}">${_cgEsc(t.tradeType)}</span>
          <span>·</span>
          <span>${_cgEsc(t.amount?.label || '')}</span>
          ${t.disclosureDelay > 30 ? `<span style="color:#d29922;margin-left:auto">⚠ ${t.disclosureDelay}d late</span>` : ''}
        </div>
      </div>`;
    });

  } else if (view === 'flagged') {
    // Flagged trades (conflict of interest)
    html += `<div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:4px">Trades with Committee / Policy Area Conflicts</div>`;
    html += `<div style="font-size:9px;color:var(--text-muted);margin-bottom:8px">Flags indicate trades where the member serves on a committee that oversees the traded company's sector.</div>`;

    flagsSorted.slice(0, 40).forEach(f => {
      const sev = CG_SEV[f.severity] || CG_SEV.low;
      const tt  = _cgType(f.tradeType);
      const party = _cgParty(f.memberParty || '');
      html += `<div style="border-left:3px solid ${sev.col};background:rgba(0,0,0,0.2);border-radius:0 3px 3px 0;padding:6px 8px;margin-bottom:4px">
        <div style="display:flex;align-items:center;gap:5px;margin-bottom:2px">
          <span style="color:${tt.col};font-weight:700">${tt.icon}</span>
          <strong style="font-size:11px;color:var(--text)">${_cgEsc(f.ticker)}</strong>
          <span style="font-size:10px;color:var(--text-muted)">${_cgEsc(f.companyName)}</span>
          <span style="margin-left:auto;font-size:9px;font-weight:700;color:${sev.col}">${sev.label}</span>
        </div>
        <div style="font-size:9px;color:var(--text-muted);margin-bottom:3px">${party} ${_cgEsc(f.memberName)} · ${_cgEsc(f.tradeType)} · ${_cgEsc(f.amount?.label||'')} · ${_cgDate(f.tradeDate)}</div>
        <div style="font-size:9px;color:var(--text-muted);font-style:italic">${_cgEsc(f.summary||'')}</div>
        ${f.matchedCommittees?.length ? `<div style="font-size:8px;color:#58a6ff;margin-top:2px">📋 ${f.matchedCommittees.join(' · ')}</div>` : ''}
      </div>`;
    });

  } else if (view === 'members') {
    // Members + top traders
    const topTraders = dash.topTraders || [];
    html += `<div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:6px">Most Active Traders (by trade count)</div>`;
    topTraders.slice(0, 10).forEach((t, i) => {
      const party = _cgParty(t.party);
      const memberData = members.find(m => m.id === t.memberId);
      const flagCount = (window._cgFlagsByMember || {})[t.memberId] || 0;
      html += `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:9px;color:var(--text-muted);width:16px;text-align:right">#${i+1}</span>
        ${memberData?.photoUrl ? `<img src="${_cgEsc(memberData.photoUrl)}" style="width:24px;height:24px;border-radius:50%;object-fit:cover" onerror="this.style.display='none'">` : `<span style="font-size:18px">${party}</span>`}
        <div style="flex:1;min-width:0">
          <div style="font-size:10px;font-weight:600;color:var(--text)">${_cgEsc(t.memberName)}</div>
          <div style="font-size:9px;color:var(--text-muted)">${party} ${_cgEsc(t.party)} · ${_cgEsc(memberData?.chamber||'')} · ${_cgEsc(memberData?.state||'')}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;font-weight:700;color:var(--text)">${t.tradeCount}</div>
          <div style="font-size:8px;color:var(--text-muted)">trades</div>
        </div>
      </div>`;
    });

    html += `<div style="margin-top:10px;font-size:10px;font-weight:700;color:var(--text);margin-bottom:6px">All Tracked Members</div>`;
    members.forEach(m => {
      const memberFlags = flags.filter(f => f.memberId === m.id);
      const highFlags = memberFlags.filter(f => f.severity === 'high' || f.severity === 'critical').length;
      html += `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border)">
        ${m.photoUrl ? `<img src="${_cgEsc(m.photoUrl)}" style="width:22px;height:22px;border-radius:50%;object-fit:cover" onerror="this.style.display='none'">` : `<span style="font-size:16px">${_cgParty(m.party)}</span>`}
        <div style="flex:1">
          <div style="font-size:10px;font-weight:600;color:var(--text)">${_cgEsc(m.name)}</div>
          <div style="font-size:9px;color:var(--text-muted)">${_cgParty(m.party)} ${_cgEsc(m.party)} · ${_cgEsc(m.chamber)} · ${_cgEsc(m.state)}</div>
        </div>
        ${highFlags > 0 ? `<span style="font-size:8px;color:#f0883e">🚩 ${highFlags} high-risk</span>` : ''}
        <span style="font-size:9px;color:var(--text-muted)">${memberFlags.length} flags</span>
      </div>`;
    });
  }

  html += `</div><div style="font-size:9px;color:var(--text-muted);padding:4px 6px;border-top:1px solid var(--border)">
    Data: congress-trades · STOCK Act disclosures · FINTERM dataset
  </div>`;

  el.innerHTML = html;
}

/* Auto-refresh every 30 minutes while the tab is visible */
setInterval(() => {
  const el = document.getElementById('alert-congress');
  if (!el || el.offsetParent === null) return; // skip if panel hidden
  _cgData = null; // clear cache so next load re-fetches
  congressLoad();
}, 30 * 60 * 1000);
