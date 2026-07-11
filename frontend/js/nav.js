/* ═══════════════════════════════════════════════
   I.O.E HUB — SHARED NAVIGATION JS
═══════════════════════════════════════════════ */

const IOE_PAGES = [
  { href:'index.html',       icon:'🏠', label:'Beranda',       section:null },
  { href:'cosmos.html',      icon:'🌌', label:'Cosmos AI',      section:'Edukasi' },
  { href:'education.html',   icon:'🔭', label:'Education Hub',  section:'Edukasi' },
  { href:'astromodels.html', icon:'🪐', label:'3D Explorer',    section:'Edukasi' },
  { href:'tools.html',       icon:'🔧', label:'Space Tools',    section:'Edukasi' },
  { href:'login.html',       icon:'🔐', label:'Login',          section:'Member' },
  { href:'seleksi.html',     icon:'📋', label:'Pendaftaran',    section:'Member' },
  { href:'boardingpass.html',icon:'🎫', label:'Boarding Pass',  section:'Member' },
  { href:'chat.html',        icon:'💬', label:'Chat Publik',    section:'Komunitas' },
];

function buildNav(currentPage) {
  const nav = document.getElementById('ioe-nav');
  if (!nav) return;

  const current = IOE_PAGES.find(p => p.href === currentPage);
  const pageTitle = current ? current.label : 'I.O.E';

  nav.innerHTML = `
    <a href="index.html" class="nav-brand">
      <img src="assets/logo.png" alt="I.O.E" class="nav-logo-img" onerror="this.style.display='none'">
      <span class="nav-logo-text">I.O.E</span>
    </a>
    <div class="nav-right">
      <span class="nav-page-title">${pageTitle !== 'Beranda' ? pageTitle : ''}</span>
      <button class="hamburger-btn" onclick="openDrawer()" aria-label="Menu">
        <span></span><span></span><span></span>
      </button>
    </div>
  `;

  buildDrawer(currentPage);
}

function buildDrawer(currentPage) {
  const existing = document.getElementById('ioe-drawer');
  if (existing) existing.remove();
  const existingOverlay = document.getElementById('ioe-overlay');
  if (existingOverlay) existingOverlay.remove();

  // Group pages by section
  const sections = {};
  IOE_PAGES.forEach(p => {
    const sec = p.section || '__top__';
    if (!sections[sec]) sections[sec] = [];
    sections[sec].push(p);
  });

  let drawerHTML = `
    <div class="drawer-header">
      <span class="drawer-brand">I.O.E HUB</span>
      <button class="drawer-close" onclick="closeDrawer()">✕</button>
    </div>
    <nav class="drawer-nav">
  `;

  // Superadmin Control — cuma muncul kalau ada session superadmin aktif di localStorage
  let isSuperadmin = false;
  try {
    const sess = localStorage.getItem('ioe_superadmin_session');
    if (sess) {
      const parsed = JSON.parse(sess);
      isSuperadmin = !!parsed.token;
    }
  } catch (e) {}

  if (isSuperadmin) {
    drawerHTML += `
      <a href="javascript:void(0)" class="drawer-item" onclick="closeDrawer(); openSuperadminPanel();" style="color:#00e5c0;">
        <span class="d-icon">⚙️</span>Superadmin Control
      </a>
      <div class="drawer-divider"></div>
    `;
  }

  // Top level first
  if (sections['__top__']) {
    sections['__top__'].forEach(p => {
      const active = p.href === currentPage ? 'active' : '';
      drawerHTML += `
        <a href="${p.href}" class="drawer-item ${active}">
          <span class="d-icon">${p.icon}</span>${p.label}
        </a>`;
    });
  }

  // Sections
  const sectionOrder = ['Edukasi','Member','Komunitas'];
  sectionOrder.forEach(sec => {
    if (!sections[sec]) return;
    drawerHTML += `
      <div class="drawer-divider"></div>
      <div class="drawer-section-label">${sec}</div>
    `;
    sections[sec].forEach(p => {
      const active = p.href === currentPage ? 'active' : '';
      drawerHTML += `
        <a href="${p.href}" class="drawer-item ${active}">
          <span class="d-icon">${p.icon}</span>${p.label}
        </a>`;
    });
  });

  drawerHTML += `</nav>
    <div style="padding:16px 20px; border-top:1px solid rgba(255,255,255,0.06);">
      <div style="font-family:'Orbitron',sans-serif;font-size:0.6rem;color:rgba(255,255,255,0.25);letter-spacing:0.1em;text-align:center;">
        I.O.E HUB v2.0 · INTERNATIONAL ORGANIZATION OF EDUCATION
      </div>
    </div>
  `;

  const overlay = document.createElement('div');
  overlay.className = 'drawer-overlay';
  overlay.id = 'ioe-overlay';
  overlay.onclick = closeDrawer;

  const drawer = document.createElement('div');
  drawer.className = 'side-drawer';
  drawer.id = 'ioe-drawer';
  drawer.innerHTML = drawerHTML;

  document.body.appendChild(overlay);
  document.body.appendChild(drawer);
}

function openDrawer() {
  document.getElementById('ioe-drawer')?.classList.add('open');
  document.getElementById('ioe-overlay')?.classList.add('open');
}

function closeDrawer() {
  document.getElementById('ioe-drawer')?.classList.remove('open');
  document.getElementById('ioe-overlay')?.classList.remove('open');
}

// Close drawer on ESC
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeDrawer();
});

// ═══ SUPERADMIN PANEL (popup) ═══
function openSuperadminPanel() {
  if (document.getElementById('ioe-superadmin-overlay')) return; // sudah terbuka

  const overlay = document.createElement('div');
  overlay.id = 'ioe-superadmin-overlay';
  overlay.style.cssText = `
    position: fixed; top:0; left:0; right:0; bottom:0;
    background: rgba(0,0,0,0.75); z-index: 99999;
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
  `;
  overlay.onclick = (e) => { if (e.target === overlay) closeSuperadminPanel(); };

  const box = document.createElement('div');
  box.style.cssText = `
    background: linear-gradient(135deg, #1a1f3a 0%, #150f1e 100%);
    border: 1px solid rgba(123,92,255,0.3);
    border-radius: 16px; padding: 24px; max-width: 460px; width: 100%;
    max-height: 85vh; overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0,0,0,0.8); color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  box.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <h2 style="font-size:18px; color:#00e5c0;">⚙️ Superadmin Control</h2>
      <button onclick="closeSuperadminPanel()" style="background:rgba(255,255,255,0.1); border:none; color:#fff; width:32px; height:32px; border-radius:50%; cursor:pointer; font-size:16px; flex-shrink:0;">✕</button>
    </div>

    <div style="display:flex; gap:8px; margin-bottom:16px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:12px;">
      <button id="sa-tab-stats" onclick="saSwitchTab('stats')" style="flex:1; padding:10px; background:rgba(123,92,255,0.15); border:1px solid rgba(123,92,255,0.3); border-radius:8px; color:#cbd5e0; font-size:12px; font-weight:600; cursor:pointer;">📊 Statistik Server</button>
      <button id="sa-tab-member" onclick="saSwitchTab('member')" style="flex:1; padding:10px; background:rgba(0,229,197,0.15); border:1px solid rgba(0,229,197,0.4); border-radius:8px; color:#00e5c0; font-size:12px; font-weight:600; cursor:pointer;">👥 Info Member</button>
    </div>

    <div id="sa-panel-stats" style="display:none;">
      <p style="color:#a0aec0; font-size:13px; line-height:1.6; text-align:center; padding:30px 10px;">
        📈 Tab Statistik Server sedang dalam pengembangan.<br>Akan menampilkan status performa & deteksi request spam.
      </p>
    </div>

    <div id="sa-panel-member" style="display:block;">
      <div style="display:flex; gap:8px; margin-bottom:12px;">
        <input id="sa-search-input" type="text" placeholder="Cari nama, username, atau ID..." style="flex:1; padding:10px 12px; background:rgba(255,255,255,0.05); border:1px solid rgba(0,229,197,0.25); border-radius:8px; color:#fff; font-size:13px;">
        <button onclick="saSearchMembers()" style="padding:10px 16px; background:linear-gradient(90deg,#7b5cff,#00e5c0); border:none; border-radius:8px; color:#000; font-weight:700; font-size:13px; cursor:pointer;">Cari</button>
      </div>
      <div id="sa-member-count" style="font-size:11px; color:#718096; margin-bottom:10px;"></div>
      <div id="sa-member-list" style="display:flex; flex-direction:column; gap:8px;">
        <p style="color:#718096; font-size:12px; text-align:center; padding:20px;">Memuat data member...</p>
      </div>
    </div>

    <div style="margin-top:18px; padding-top:16px; border-top:1px solid rgba(255,255,255,0.1);">
      <div style="font-size:13px; font-weight:600; color:#cbd5e0; margin-bottom:10px;">🔑 Trial Admin Token</div>
      <p style="font-size:11px; color:#718096; margin-bottom:10px; line-height:1.5;">Token 1x pakai, berlaku 24 jam. Berikan ke calon admin trial untuk login di trial-admin.html.</p>
      <button onclick="saGenerateTrialToken()" id="sa-gen-token-btn" style="width:100%; padding:11px; background:linear-gradient(90deg,#7b5cff,#00e5c0); border:none; border-radius:8px; color:#000; font-weight:700; font-size:13px; cursor:pointer;">Generate Token Baru</button>
      <div id="sa-trial-token-result" style="margin-top:10px;"></div>
    </div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Otomatis load semua member begitu panel dibuka
  saLoadAllMembers();
}

function closeSuperadminPanel() {
  document.getElementById('ioe-superadmin-overlay')?.remove();
}

// Ambil admin token dari session superadmin yang tersimpan
function saGetAdminToken() {
  try {
    const sess = localStorage.getItem('ioe_superadmin_session');
    if (!sess) return null;
    return JSON.parse(sess).token;
  } catch (e) {
    return null;
  }
}

function saSwitchTab(tab) {
  const statsPanel = document.getElementById('sa-panel-stats');
  const memberPanel = document.getElementById('sa-panel-member');
  const tabStats = document.getElementById('sa-tab-stats');
  const tabMember = document.getElementById('sa-tab-member');
  if (!statsPanel || !memberPanel) return;

  if (tab === 'stats') {
    statsPanel.style.display = 'block';
    memberPanel.style.display = 'none';
    tabStats.style.background = 'rgba(0,229,197,0.15)';
    tabStats.style.borderColor = 'rgba(0,229,197,0.4)';
    tabStats.style.color = '#00e5c0';
    tabMember.style.background = 'rgba(123,92,255,0.15)';
    tabMember.style.borderColor = 'rgba(123,92,255,0.3)';
    tabMember.style.color = '#cbd5e0';
  } else {
    statsPanel.style.display = 'none';
    memberPanel.style.display = 'block';
    tabMember.style.background = 'rgba(0,229,197,0.15)';
    tabMember.style.borderColor = 'rgba(0,229,197,0.4)';
    tabMember.style.color = '#00e5c0';
    tabStats.style.background = 'rgba(123,92,255,0.15)';
    tabStats.style.borderColor = 'rgba(123,92,255,0.3)';
    tabStats.style.color = '#cbd5e0';
  }
}

function saRenderMemberList(members) {
  const listEl = document.getElementById('sa-member-list');
  const countEl = document.getElementById('sa-member-count');
  if (!listEl) return;

  countEl.textContent = `${members.length} member ditemukan`;

  if (members.length === 0) {
    listEl.innerHTML = '<p style="color:#718096; font-size:12px; text-align:center; padding:20px;">Tidak ada member ditemukan</p>';
    return;
  }

  listEl.innerHTML = members.map(m => {
    const statusColor = m.banned ? '#ff6b6b' : '#00e5c0';
    const statusText = m.banned ? 'Diblokir' : 'Aktif';
    const safeUsername = (m.username || '').replace(/'/g, "\\'");
    return `
      <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:12px;">
        <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:6px;">
          <div>
            <div style="font-size:14px; font-weight:600; color:#fff;">${saEscHtml(m.nama || '(tanpa nama)')}</div>
            <div style="font-size:11px; color:#a0aec0;">@${saEscHtml(m.username || '-')} · ${saEscHtml(m.memberId || '-')}</div>
          </div>
          <span style="font-size:10px; padding:3px 8px; border-radius:12px; background:${statusColor}22; color:${statusColor}; font-weight:600; flex-shrink:0;">${statusText}</span>
        </div>
        ${m.banned && m.banReason ? `<div style="font-size:11px; color:#ff9b9b; margin-bottom:8px;">Alasan: ${saEscHtml(m.banReason)}</div>` : ''}
        <div style="display:flex; gap:6px; margin-top:8px;">
          ${m.banned
            ? `<button onclick="saUnbanMember('${safeUsername}')" style="flex:1; padding:7px; background:rgba(0,229,197,0.15); border:1px solid rgba(0,229,197,0.4); border-radius:6px; color:#00e5c0; font-size:11px; font-weight:600; cursor:pointer;">✅ Unban</button>`
            : `<button onclick="saBanMember('${safeUsername}')" style="flex:1; padding:7px; background:rgba(255,107,107,0.15); border:1px solid rgba(255,107,107,0.4); border-radius:6px; color:#ff6b6b; font-size:11px; font-weight:600; cursor:pointer;">🚫 Ban</button>`
          }
        </div>
      </div>
    `;
  }).join('');
}

function saEscHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

async function saLoadAllMembers() {
  const token = saGetAdminToken();
  if (!token) return;

  try {
    const res = await fetch('/api/member-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list-all', adminToken: token }),
    });
    const data = await res.json();
    if (data.success) {
      saRenderMemberList(data.members);
    } else {
      document.getElementById('sa-member-list').innerHTML =
        `<p style="color:#ff6b6b; font-size:12px; text-align:center; padding:20px;">${saEscHtml(data.error || 'Gagal memuat data')}</p>`;
    }
  } catch (e) {
    document.getElementById('sa-member-list').innerHTML =
      '<p style="color:#ff6b6b; font-size:12px; text-align:center; padding:20px;">Gagal terhubung ke server</p>';
  }
}

async function saSearchMembers() {
  const token = saGetAdminToken();
  const query = document.getElementById('sa-search-input').value.trim();
  if (!token) return;

  if (!query) {
    saLoadAllMembers();
    return;
  }

  document.getElementById('sa-member-list').innerHTML =
    '<p style="color:#718096; font-size:12px; text-align:center; padding:20px;">Mencari...</p>';

  try {
    const res = await fetch('/api/member-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'search', adminToken: token, query }),
    });
    const data = await res.json();
    if (data.success) {
      saRenderMemberList(data.members);
    } else {
      document.getElementById('sa-member-list').innerHTML =
        `<p style="color:#ff6b6b; font-size:12px; text-align:center; padding:20px;">${saEscHtml(data.error || 'Gagal mencari')}</p>`;
    }
  } catch (e) {
    document.getElementById('sa-member-list').innerHTML =
      '<p style="color:#ff6b6b; font-size:12px; text-align:center; padding:20px;">Gagal terhubung ke server</p>';
  }
}

async function saBanMember(username) {
  const token = saGetAdminToken();
  if (!token) return;
  const reason = prompt(`Alasan ban untuk "${username}" (opsional):`, '');
  if (reason === null) return; // user cancel

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ban-member', username, reason, adminToken: token }),
    });
    const data = await res.json();
    if (data.success) {
      saLoadAllMembers();
    } else {
      alert('Gagal ban: ' + (data.error || 'Unknown error'));
    }
  } catch (e) {
    alert('Gagal terhubung ke server');
  }
}

async function saUnbanMember(username) {
  const token = saGetAdminToken();
  if (!token) return;
  if (!confirm(`Unban member "${username}"?`)) return;

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unban-member', username, adminToken: token }),
    });
    const data = await res.json();
    if (data.success) {
      saLoadAllMembers();
    } else {
      alert('Gagal unban: ' + (data.error || 'Unknown error'));
    }
  } catch (e) {
    alert('Gagal terhubung ke server');
  }
}

async function saGenerateTrialToken() {
  const token = saGetAdminToken();
  if (!token) return;

  const btn = document.getElementById('sa-gen-token-btn');
  const resultEl = document.getElementById('sa-trial-token-result');
  btn.disabled = true;
  btn.textContent = 'Memproses...';
  resultEl.innerHTML = '';

  try {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate-trial-token', superadminToken: token }),
    });
    const data = await res.json();

    if (data.success) {
      const expiresDate = new Date(data.expiresAt);
      const expiresStr = expiresDate.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
      resultEl.innerHTML = `
        <div style="background:rgba(0,229,197,0.08); border:1px solid rgba(0,229,197,0.3); border-radius:8px; padding:12px;">
          <div style="font-size:11px; color:#718096; margin-bottom:6px;">Token (1x pakai, berlaku sampai ${saEscHtml(expiresStr)}):</div>
          <div style="display:flex; gap:8px; align-items:center;">
            <code id="sa-token-text" style="flex:1; font-size:13px; color:#00e5c0; word-break:break-all; font-family:'Courier New',monospace;">${saEscHtml(data.token)}</code>
            <button onclick="saCopyTrialToken()" style="flex-shrink:0; padding:6px 10px; background:rgba(0,229,197,0.15); border:1px solid rgba(0,229,197,0.4); border-radius:6px; color:#00e5c0; font-size:11px; cursor:pointer;">📋</button>
          </div>
        </div>
      `;
    } else {
      resultEl.innerHTML = `<p style="color:#ff6b6b; font-size:12px;">${saEscHtml(data.error || 'Gagal generate token')}</p>`;
    }
  } catch (e) {
    resultEl.innerHTML = '<p style="color:#ff6b6b; font-size:12px;">Gagal terhubung ke server</p>';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate Token Baru';
  }
}

async function saCopyTrialToken() {
  const tokenText = document.getElementById('sa-token-text')?.textContent;
  if (!tokenText) return;
  try {
    await navigator.clipboard.writeText(tokenText);
  } catch (e) {
    // Fallback untuk browser yang tidak support clipboard API
    const textarea = document.createElement('textarea');
    textarea.value = tokenText;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

// Enter key di search box langsung trigger pencarian
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.activeElement?.id === 'sa-search-input') {
    saSearchMembers();
  }
});
