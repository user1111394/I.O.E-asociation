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
  { href:'akun.html',        icon:'👤', label:'Akun Saya',      section:'Member' },
  { href:'search-member.html',icon:'🔍', label:'Cari Member',   section:'Member' },
  { href:'chat.html',        icon:'💬', label:'Chat Publik',    section:'Komunitas' },
  { href:'event.html',       icon:'🎉', label:'Event',          section:'Komunitas' },
  { href:'shop.html',        icon:'🛒', label:'Shop',           section:'Komunitas' },
  { href:'backpack.html',    icon:'🎒', label:'Backpack',       section:'Komunitas' },
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
      <button id="ioe-email-icon-btn" onclick="openEmailTagModal()" disabled style="display:none; background: rgba(0,229,197,0.15); border: 2px solid rgba(0,229,197,0.5); border-radius: 50%; width: 40px; height: 40px; font-size: 18px; cursor: pointer; align-items:center; justify-content:center; margin-right: 8px; animation: ioeEmailPulse 1.5s infinite;" aria-label="Dapatkan tag I.O.E">📧</button>
      <button class="hamburger-btn" onclick="openDrawer()" aria-label="Menu">
        <span></span><span></span><span></span>
      </button>
    </div>
  `;

  buildDrawer(currentPage);
  checkEmailTagIcon();
}

// ── Icon amplop navbar: cek apakah user perlu diarahkan buat verifikasi tag
// I.O.E. Logic sama seperti versi lama (email.html?mode=icon), diporting ke
// sini supaya jadi elemen native (bukan iframe kecil yang rawan rusak).
async function checkEmailTagIcon() {
  const btn = document.getElementById('ioe-email-icon-btn');
  if (!btn) return;

  let session = null;
  try {
    const sess = localStorage.getItem('ioe_account_session');
    session = sess ? JSON.parse(sess) : null;
  } catch (e) {}

  if (!session || !session.memberId) {
    btn.style.display = 'none';
    btn.disabled = true;
    return;
  }

  try {
    const res = await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get-tag', memberId: session.memberId }),
    });
    const data = await res.json();
    if (data.tag) {
      // Sudah punya tag, sembunyikan icon
      btn.style.display = 'none';
      btn.disabled = true;
    } else {
      btn.style.display = 'flex';
      btn.disabled = false;
    }
  } catch (e) {
    // Kalau gagal cek, biarkan icon tersembunyi (aman, tidak block apapun)
  }
}

// ── Popup form verifikasi tag I.O.E — dibuka lewat iframe fullscreen ──
function openEmailTagModal() {
  if (document.getElementById('ioe-email-modal-overlay')) return; // sudah terbuka

  const overlay = document.createElement('div');
  overlay.id = 'ioe-email-modal-overlay';
  overlay.style.cssText = 'position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,0.75); display:flex; align-items:center; justify-content:center;';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', 'Tutup');
  closeBtn.style.cssText = 'position:absolute; top:16px; right:16px; z-index:10001; width:36px; height:36px; border-radius:50%; border:none; background:rgba(255,255,255,0.15); color:#fff; font-size:18px; cursor:pointer;';
  closeBtn.onclick = closeEmailTagModal;

  const iframe = document.createElement('iframe');
  iframe.src = 'email.html';
  iframe.id = 'ioe-email-modal-iframe';
  iframe.style.cssText = 'width:100%; height:100%; max-width:480px; max-height:90vh; border:none; border-radius:16px;';

  overlay.appendChild(closeBtn);
  overlay.appendChild(iframe);
  document.body.appendChild(overlay);

  // Klik area gelap di luar iframe untuk menutup
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeEmailTagModal();
  });
}

function closeEmailTagModal() {
  const overlay = document.getElementById('ioe-email-modal-overlay');
  if (overlay) overlay.remove();
  // Setelah modal ditutup, cek ulang status tag (kalau user baru saja
  // berhasil verifikasi, icon amplop harus otomatis hilang dari navbar)
  checkEmailTagIcon();
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

  // Trial Admin Panel — cuma muncul kalau ada session trial admin aktif & belum kedaluwarsa
  let isTrialAdmin = false;
  try {
    const sess = localStorage.getItem('ioe_trial_admin_session');
    if (sess) {
      const parsed = JSON.parse(sess);
      isTrialAdmin = !!parsed.sessionToken && parsed.expiresAt > Date.now();
      if (!isTrialAdmin) localStorage.removeItem('ioe_trial_admin_session'); // bersihkan sesi kedaluwarsa
    }
  } catch (e) {}

  if (isTrialAdmin) {
    drawerHTML += `
      <a href="javascript:void(0)" class="drawer-item" onclick="closeDrawer(); openTrialAdminPanel();" style="color:#7b5cff;">
        <span class="d-icon">📊</span>Trial Admin Panel
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

    <div style="display:flex; gap:6px; margin-bottom:16px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:12px; flex-wrap:wrap;">
      <button id="sa-tab-stats" onclick="saSwitchTab('stats')" style="flex:1; padding:9px 4px; background:rgba(123,92,255,0.15); border:1px solid rgba(123,92,255,0.3); border-radius:8px; color:#cbd5e0; font-size:11px; font-weight:600; cursor:pointer;">📊 Statistik</button>
      <button id="sa-tab-member" onclick="saSwitchTab('member')" style="flex:1; padding:9px 4px; background:rgba(0,229,197,0.15); border:1px solid rgba(0,229,197,0.4); border-radius:8px; color:#00e5c0; font-size:11px; font-weight:600; cursor:pointer;">👥 Member</button>
      <button id="sa-tab-tos" onclick="saSwitchTab('tos')" style="flex:1; padding:9px 4px; background:rgba(255,180,0,0.1); border:1px solid rgba(255,180,0,0.25); border-radius:8px; color:#cbd5e0; font-size:11px; font-weight:600; cursor:pointer;">💬 ToS</button>
      <button id="sa-tab-event" onclick="saSwitchTab('event')" style="flex:1; padding:9px 4px; background:rgba(255,90,160,0.1); border:1px solid rgba(255,90,160,0.25); border-radius:8px; color:#cbd5e0; font-size:11px; font-weight:600; cursor:pointer;">🎉 Event</button>
      <button id="sa-tab-shop" onclick="saSwitchTab('shop')" style="flex:1; padding:9px 4px; background:rgba(255,210,63,0.1); border:1px solid rgba(255,210,63,0.25); border-radius:8px; color:#cbd5e0; font-size:11px; font-weight:600; cursor:pointer;">🛒 Shop</button>
    </div>

    <div id="sa-panel-event" style="display:none;">
      <div style="display:flex; gap:6px; margin-bottom:14px;">
        <button id="sa-subtab-acara" onclick="saSwitchEventSubtab('acara')" style="flex:1; padding:7px 4px; background:rgba(255,90,160,0.15); border:1px solid rgba(255,90,160,0.4); border-radius:8px; color:#ff5aa0; font-size:11px; font-weight:600; cursor:pointer;">🎉 Acara</button>
        <button id="sa-subtab-koin" onclick="saSwitchEventSubtab('koin')" style="flex:1; padding:7px 4px; background:rgba(255,90,160,0.1); border:1px solid rgba(255,90,160,0.25); border-radius:8px; color:#cbd5e0; font-size:11px; font-weight:600; cursor:pointer;">🪙 Koin</button>
        <button id="sa-subtab-broadcast" onclick="saSwitchEventSubtab('broadcast')" style="flex:1; padding:7px 4px; background:rgba(255,90,160,0.1); border:1px solid rgba(255,90,160,0.25); border-radius:8px; color:#cbd5e0; font-size:11px; font-weight:600; cursor:pointer;">📢 Broadcast</button>
        <button id="sa-subtab-galeri" onclick="saSwitchEventSubtab('galeri')" style="flex:1; padding:7px 4px; background:rgba(255,90,160,0.1); border:1px solid rgba(255,90,160,0.25); border-radius:8px; color:#cbd5e0; font-size:11px; font-weight:600; cursor:pointer;">🎬 Galeri</button>
        <button id="sa-subtab-review" onclick="saSwitchEventSubtab('review')" style="flex:1; padding:7px 4px; background:rgba(255,90,160,0.1); border:1px solid rgba(255,90,160,0.25); border-radius:8px; color:#cbd5e0; font-size:11px; font-weight:600; cursor:pointer;">🔍 Review</button>
      </div>

      <div id="sa-eventsub-acara">
        <div style="font-size:13px; font-weight:600; color:#cbd5e0; margin-bottom:10px;">Buat Event Baru</div>

        <input id="sa-event-title" type="text" placeholder="Judul event" style="width:100%; padding:10px 12px; margin-bottom:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">
        <textarea id="sa-event-desc" placeholder="Deskripsi event" rows="2" style="width:100%; padding:10px 12px; margin-bottom:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box; resize:vertical; font-family:inherit;"></textarea>
        <input id="sa-event-days" type="number" min="1" placeholder="Berapa hari tayang" style="width:100%; padding:10px 12px; margin-bottom:14px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">

        <label style="display:block; font-size:11px; color:#718096; margin-bottom:6px;">🪙 Nama koin khusus event ini (misal "Koin Grand Opening")</label>
        <input id="sa-event-coin-name" type="text" placeholder="Nama koin event" style="width:100%; padding:10px 12px; margin-bottom:14px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">

        <label style="display:block; font-size:11px; color:#718096; margin-bottom:6px;">🔗 Link I.O.E Hub untuk quest "Ajak Teman" (isi kalau ada quest tipe itu)</label>
        <input id="sa-event-invite-link" type="text" placeholder="https://ioe-asociation.vercel.app" style="width:100%; padding:10px 12px; margin-bottom:14px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">

        <label style="display:block; font-size:11px; color:#718096; margin-bottom:6px;">🌌 Upload Background (full layar, dari tim desain)</label>
        <input id="sa-event-bg-input" type="file" accept="image/*" style="width:100%; margin-bottom:14px; font-size:12px; color:#cbd5e0;">

        <label style="display:block; font-size:11px; color:#718096; margin-bottom:6px;">🖼️ Upload Border/Bingkai (PNG transparan, dari tim desain)</label>
        <input id="sa-event-borderimg-input" type="file" accept="image/png" style="width:100%; margin-bottom:14px; font-size:12px; color:#cbd5e0;">

        <label style="display:block; font-size:11px; color:#718096; margin-bottom:6px;">🎨 Upload Isi Tengah Border (warna/gambar/pattern, mengisi lubang bingkai)</label>
        <input id="sa-event-questbg-input" type="file" accept="image/*" style="width:100%; margin-bottom:14px; font-size:12px; color:#cbd5e0;">

        <div id="sa-event-upload-status" style="font-size:11px; color:#718096; margin-bottom:10px;"></div>

        <div style="margin-top:6px; padding-top:14px; border-top:1px solid rgba(255,255,255,0.1);">
          <div style="font-size:13px; font-weight:600; color:#cbd5e0; margin-bottom:10px;">Daftar Quest</div>
          <div id="sa-quest-list" style="display:flex; flex-direction:column; gap:8px; margin-bottom:10px;"></div>
          <button type="button" onclick="saAddQuestRow()" style="width:100%; padding:9px; background:rgba(0,229,197,0.12); border:1px solid rgba(0,229,197,0.3); color:#00e5c0; border-radius:8px; font-weight:600; font-size:12px; cursor:pointer;">+ Tambah Quest</button>
        </div>

        <button onclick="saCreateEvent()" id="sa-event-submit-btn" style="width:100%; padding:11px; margin-top:16px; background:linear-gradient(90deg,#ff5aa0,#7b5cff); border:none; border-radius:8px; color:#fff; font-weight:700; font-size:13px; cursor:pointer;">Publikasikan Event</button>

        <div style="margin-top:18px; padding-top:14px; border-top:1px solid rgba(255,255,255,0.1);">
          <div style="font-size:13px; font-weight:600; color:#cbd5e0; margin-bottom:10px;">Event Aktif</div>
          <div id="sa-event-list" style="display:flex; flex-direction:column; gap:8px;">
            <p style="color:#718096; font-size:12px; text-align:center; padding:20px;">Memuat daftar event...</p>
          </div>
        </div>
      </div>

      <div id="sa-eventsub-koin" style="display:none;">
        <div style="font-size:13px; font-weight:600; color:#cbd5e0; margin-bottom:10px;">Kasih Koin ke Member</div>

        <label style="display:block; font-size:11px; color:#718096; margin-bottom:6px;">Jenis Koin</label>
        <select id="sa-coin-type-select" onchange="saToggleCoinTypeFields()" style="width:100%; padding:10px 12px; margin-bottom:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">
          <option value="event">Koin Event</option>
          <option value="ore">Ore Coin (Ore Tycoon)</option>
        </select>

        <div id="sa-coin-event-field">
          <select id="sa-coin-event-select" style="width:100%; padding:10px 12px; margin-bottom:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">
            <option value="">Pilih event...</option>
          </select>
        </div>

        <input id="sa-coin-member-id" type="text" placeholder="Member ID (contoh: IOE-PCYCM7N)" style="width:100%; padding:10px 12px; margin-bottom:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">
        <input id="sa-coin-amount" type="number" min="1" placeholder="Jumlah koin" style="width:100%; padding:10px 12px; margin-bottom:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">
        <button onclick="saGrantCoin()" id="sa-coin-submit-btn" style="width:100%; padding:11px; background:linear-gradient(90deg,#ff5aa0,#7b5cff); border:none; border-radius:8px; color:#fff; font-weight:700; font-size:13px; cursor:pointer;">Kirim Koin</button>
        <div id="sa-coin-status" style="font-size:11px; color:#718096; margin-top:8px;"></div>

        <div style="margin-top:18px; padding-top:14px; border-top:1px solid rgba(255,255,255,0.1);">
          <div style="font-size:13px; font-weight:600; color:#cbd5e0; margin-bottom:10px;">Cek Saldo Koin Member</div>
          <div style="display:flex; gap:8px;">
            <input id="sa-coin-check-member" type="text" placeholder="Member ID" style="flex:1; padding:10px 12px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">
            <button onclick="saCheckEventCoin()" style="padding:10px 14px; background:rgba(255,90,160,0.15); border:1px solid rgba(255,90,160,0.3); color:#ff5aa0; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer;">Cek</button>
          </div>
          <div id="sa-coin-check-result" style="font-size:12px; color:#cbd5e0; margin-top:10px;"></div>
        </div>
      </div>

      <div id="sa-eventsub-broadcast" style="display:none;">
        <div style="font-size:13px; font-weight:600; color:#cbd5e0; margin-bottom:10px;">Broadcast ke Halaman Utama</div>
        <p style="font-size:11px; color:#718096; margin-bottom:10px;">Pesan singkat + efek musik & video (opsional) muncul sebagai overlay sementara ke semua member yang sedang membuka halaman utama. Otomatis hilang, tidak tersimpan riwayat.</p>
        <input id="sa-broadcast-message" type="text" maxlength="150" placeholder="Ketik pesan broadcast..." style="width:100%; padding:10px 12px; margin-bottom:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">
        <label style="display:block; font-size:11px; color:#718096; margin-bottom:6px;">🎵 Musik (opsional, dari galeri)</label>
        <select id="sa-broadcast-music-select" style="width:100%; padding:10px 12px; margin-bottom:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">
          <option value="">— Tanpa musik —</option>
        </select>
        <label style="display:block; font-size:11px; color:#718096; margin-bottom:6px;">🎬 Video overlay (opsional, dari galeri)</label>
        <select id="sa-broadcast-video-select" style="width:100%; padding:10px 12px; margin-bottom:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">
          <option value="">— Tanpa video —</option>
        </select>
        <button onclick="saSendBroadcast()" id="sa-broadcast-submit-btn" style="width:100%; padding:11px; background:linear-gradient(90deg,#ff5aa0,#7b5cff); border:none; border-radius:8px; color:#fff; font-weight:700; font-size:13px; cursor:pointer;">Kirim Broadcast</button>
        <div id="sa-broadcast-status" style="font-size:11px; color:#718096; margin-top:8px;"></div>
      </div>

      <div id="sa-eventsub-galeri" style="display:none;">
        <div style="font-size:13px; font-weight:600; color:#cbd5e0; margin-bottom:10px;">Upload ke Galeri</div>
        <p style="font-size:11px; color:#718096; margin-bottom:10px;">File tersimpan permanen — upload sekali, pakai berkali-kali untuk broadcast. Hapus dari sini kalau sudah tidak dipakai, supaya tidak menumpuk di storage.</p>

        <label style="display:block; font-size:11px; color:#718096; margin-bottom:6px;">🎵 Upload musik (mp3, wav, dll)</label>
        <input id="sa-gallery-music-input" type="file" accept="audio/*" style="width:100%; margin-bottom:6px; font-size:12px; color:#cbd5e0;">
        <button onclick="saUploadGalleryFile('music')" id="sa-gallery-music-btn" style="width:100%; padding:9px; margin-bottom:14px; background:rgba(255,90,160,0.15); border:1px solid rgba(255,90,160,0.3); color:#ff5aa0; border-radius:8px; font-weight:600; font-size:12px; cursor:pointer;">Upload Musik</button>

        <label style="display:block; font-size:11px; color:#718096; margin-bottom:6px;">🎬 Upload video (WebM transparan disarankan)</label>
        <input id="sa-gallery-video-input" type="file" accept="video/*" style="width:100%; margin-bottom:6px; font-size:12px; color:#cbd5e0;">
        <button onclick="saUploadGalleryFile('video')" id="sa-gallery-video-btn" style="width:100%; padding:9px; margin-bottom:10px; background:rgba(255,90,160,0.15); border:1px solid rgba(255,90,160,0.3); color:#ff5aa0; border-radius:8px; font-weight:600; font-size:12px; cursor:pointer;">Upload Video</button>

        <div id="sa-gallery-upload-status" style="font-size:11px; color:#718096; margin-bottom:10px;"></div>

        <div style="margin-top:10px; padding-top:14px; border-top:1px solid rgba(255,255,255,0.1);">
          <div style="font-size:13px; font-weight:600; color:#cbd5e0; margin-bottom:10px;">File di Galeri</div>
          <div id="sa-gallery-list" style="display:flex; flex-direction:column; gap:8px;">
            <p style="color:#718096; font-size:12px; text-align:center; padding:20px;">Memuat galeri...</p>
          </div>
        </div>
      </div>

      <div id="sa-eventsub-review" style="display:none;">
        <div style="font-size:13px; font-weight:600; color:#cbd5e0; margin-bottom:10px;">Klaim Quest Menunggu Tinjauan</div>
        <p style="font-size:11px; color:#718096; margin-bottom:10px;">Quest "Like Video" (screenshot) dan link TikTok pendek yang tidak bisa dicek otomatis muncul di sini. Cek buktinya, lalu Setujui atau Tolak.</p>

        <select id="sa-review-event-select" onchange="saLoadPendingQuests()" style="width:100%; padding:10px 12px; margin-bottom:14px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">
          <option value="">Pilih event...</option>
        </select>

        <div id="sa-review-list" style="display:flex; flex-direction:column; gap:8px;">
          <p style="color:#718096; font-size:12px; text-align:center; padding:20px;">Pilih event dulu untuk lihat antrian review.</p>
        </div>
      </div>
    </div>

    <div id="sa-panel-stats" style="display:none;">
      <div id="sa-stats-cards" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
        <p style="grid-column:1/-1; color:#718096; font-size:12px; text-align:center; padding:20px;">Memuat statistik...</p>
      </div>

      <div style="border-top:1px solid rgba(255,255,255,0.08); margin:16px 0; padding-top:16px;">
        <h4 style="font-size:13px; color:#fff; margin-bottom:4px;">🧹 Bersihkan Chat Publik</h4>
        <p style="font-size:11px; color:#718096; margin-bottom:10px;">Menghapus SELURUH riwayat pesan di room tertentu. Tidak bisa dibatalkan.</p>
        <div style="display:flex; gap:8px; margin-bottom:8px;">
          <select id="sa-chat-room-select" style="flex:1; padding:9px 10px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.25); border-radius:8px; color:#fff; font-size:12px;">
            <option value="1">Room 1</option>
            <option value="2">Room 2</option>
            <option value="3">Room 3</option>
            <option value="4">Room 4</option>
            <option value="5">Room 5</option>
            <option value="6">Room 6</option>
            <option value="7">Room 7</option>
            <option value="8">Room 8</option>
          </select>
          <button onclick="saClearPublicChat()" style="padding:9px 16px; background:rgba(255,90,160,0.15); border:1px solid rgba(255,90,160,0.4); border-radius:8px; color:#ff5aa0; font-size:12px; font-weight:600; cursor:pointer; white-space:nowrap;">Hapus Riwayat</button>
        </div>
        <p id="sa-chat-clear-status" style="font-size:11px; margin-top:4px;"></p>
      </div>

      <p style="color:#718096; font-size:11px; line-height:1.6; text-align:center; padding:10px;">
        📈 Grafik & riwayat aktivitas server menyusul di update berikutnya.
      </p>
    </div>

    <div id="sa-panel-shop" style="display:none;">
      <div style="display:flex; gap:6px; margin-bottom:14px;">
        <button id="sa-subtab-shopitem" onclick="saSwitchShopSubtab('item')" style="flex:1; padding:7px 4px; background:rgba(255,210,63,0.15); border:1px solid rgba(255,210,63,0.4); border-radius:8px; color:#ffd23f; font-size:11px; font-weight:600; cursor:pointer;">📦 Item</button>
        <button id="sa-subtab-redeem" onclick="saSwitchShopSubtab('redeem')" style="flex:1; padding:7px 4px; background:rgba(255,210,63,0.1); border:1px solid rgba(255,210,63,0.25); border-radius:8px; color:#cbd5e0; font-size:11px; font-weight:600; cursor:pointer;">🎁 Redeem</button>
      </div>

      <div id="sa-shopsub-item">
        <div style="font-size:13px; font-weight:600; color:#cbd5e0; margin-bottom:10px;">Tambah Item Shop</div>
        <input id="sa-shop-nama" type="text" placeholder="Nama item" style="width:100%; padding:10px 12px; margin-bottom:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,210,63,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">
        <div style="display:flex; gap:8px; margin-bottom:8px;">
          <input id="sa-shop-harga" type="number" min="0" placeholder="Harga (koin)" style="flex:1; padding:10px 12px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,210,63,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">
        </div>
        <label style="display:block; font-size:11px; color:#718096; margin-bottom:6px;">Kategori item</label>
        <select id="sa-shop-kategori" style="width:100%; padding:10px 12px; margin-bottom:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,210,63,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">
          <option value="save">💾 Save (Koleksi biasa)</option>
          <option value="func-border">🖼️ Func — Border Akun</option>
          <option value="func-background">🎨 Func — Background Akun</option>
        </select>
        <label style="display:block; font-size:11px; color:#718096; margin-bottom:6px;">Jenis koin</label>
        <select id="sa-shop-koin-type" onchange="saToggleShopEventSelect()" style="width:100%; padding:10px 12px; margin-bottom:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,210,63,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">
          <option value="global">🪙 Koin Global</option>
          <option value="event">🎉 Koin Event</option>
        </select>
        <select id="sa-shop-event-select" style="width:100%; padding:10px 12px; margin-bottom:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,210,63,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box; display:none;">
          <option value="">Pilih event...</option>
        </select>
        <label style="display:block; font-size:11px; color:#718096; margin-bottom:6px;">Stok item</label>
        <select id="sa-shop-stok-type" onchange="saToggleShopStokJumlah()" style="width:100%; padding:10px 12px; margin-bottom:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,210,63,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">
          <option value="unlimited">♾️ Unlimited</option>
          <option value="daily">🔄 Global — Harian (restock otomatis tiap hari)</option>
          <option value="onetime">🔒 Global — Sekali (habis = habis, restock manual)</option>
          <option value="peraccount">👤 Limit per Akun (max Nx beli/member, tidak reset)</option>
        </select>
        <input id="sa-shop-stok-jumlah" type="number" min="1" placeholder="Jumlah stok" style="width:100%; padding:10px 12px; margin-bottom:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,210,63,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box; display:none;">
        <textarea id="sa-shop-deskripsi" placeholder="Deskripsi item (muncul saat diklik member)" rows="3" style="width:100%; padding:10px 12px; margin-bottom:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,210,63,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box; resize:vertical; font-family:inherit;"></textarea>
        <label style="display:block; font-size:11px; color:#718096; margin-bottom:6px;">Icon item (gambar, opsional)</label>
        <input id="sa-shop-icon" type="file" accept="image/*" style="width:100%; margin-bottom:10px; font-size:12px; color:#cbd5e0;">
        <div id="sa-shop-upload-status" style="font-size:11px; color:#718096; margin-bottom:10px;"></div>
        <button onclick="saCreateShopItem()" id="sa-shop-submit-btn" style="width:100%; padding:11px; background:linear-gradient(90deg,#ffd23f,#ff5aa0); border:none; border-radius:8px; color:#1a1a1a; font-weight:700; font-size:13px; cursor:pointer;">Tambah Item</button>

        <div style="margin-top:18px; padding-top:14px; border-top:1px solid rgba(255,255,255,0.1);">
          <div style="font-size:13px; font-weight:600; color:#cbd5e0; margin-bottom:10px;">Item Aktif</div>
          <div id="sa-shop-list" style="display:flex; flex-direction:column; gap:8px;">
            <p style="color:#718096; font-size:12px; text-align:center; padding:20px;">Memuat daftar item...</p>
          </div>
        </div>
      </div>

      <div id="sa-shopsub-redeem" style="display:none;">
        <div style="font-size:13px; font-weight:600; color:#cbd5e0; margin-bottom:10px;">Buat Kode Redeem</div>
        <p style="font-size:11px; color:#718096; margin-bottom:10px;">Isi minimal 1 jenis reward. Kode digenerate otomatis, tiap akun cuma bisa klaim 1x.</p>

        <input id="sa-redeem-koin-global" type="number" min="0" placeholder="Reward koin global (opsional)" style="width:100%; padding:10px 12px; margin-bottom:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,210,63,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">

        <input id="sa-redeem-koin-event" type="number" min="0" placeholder="Reward koin event (opsional)" style="width:100%; padding:10px 12px; margin-bottom:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,210,63,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">
        <select id="sa-redeem-event-select" style="width:100%; padding:10px 12px; margin-bottom:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,210,63,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">
          <option value="">— Pilih event (kalau isi koin event) —</option>
        </select>

        <select id="sa-redeem-item-select" style="width:100%; padding:10px 12px; margin-bottom:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,210,63,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">
          <option value="">— Reward item (opsional) —</option>
        </select>

        <button onclick="saCreateRedeemCode()" id="sa-redeem-submit-btn" style="width:100%; padding:11px; background:linear-gradient(90deg,#ffd23f,#ff5aa0); border:none; border-radius:8px; color:#1a1a1a; font-weight:700; font-size:13px; cursor:pointer;">Buat Kode</button>
        <div id="sa-redeem-status" style="font-size:11px; color:#718096; margin-top:8px;"></div>

        <div style="margin-top:18px; padding-top:14px; border-top:1px solid rgba(255,255,255,0.1);">
          <div style="font-size:13px; font-weight:600; color:#cbd5e0; margin-bottom:10px;">Kode Redeem</div>
          <div id="sa-redeem-list" style="display:flex; flex-direction:column; gap:8px;">
            <p style="color:#718096; font-size:12px; text-align:center; padding:20px;">Memuat daftar kode...</p>
          </div>
        </div>
      </div>
    </div>

    <div id="sa-panel-tos" style="display:none;">
      <div id="sa-tos-list" style="display:flex; flex-direction:column; gap:8px;">
        <p style="color:#718096; font-size:12px; text-align:center; padding:20px;">Memuat pesan ToS...</p>
      </div>
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

async function saLoadStats() {
  const container = document.getElementById('sa-stats-cards');
  const token = saGetAdminToken();
  if (!token || !container) return;

  try {
    const res = await fetch('/api/member-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stats', adminToken: token }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Gagal memuat statistik');

    const cards = [
      { label: 'Total Member', value: data.totalMembers, color: '#00e5c0' },
      { label: 'Member Aktif', value: data.totalActive, color: '#00c2ff' },
      { label: 'Diblokir', value: data.totalBanned, color: '#ff6b6b' },
    ];

    container.innerHTML = cards.map(c => `
      <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:16px 10px; text-align:center;">
        <div style="font-size:24px; font-weight:800; color:${c.color};">${c.value.toLocaleString('id-ID')}</div>
        <div style="font-size:11px; color:#a0aec0; margin-top:4px;">${c.label}</div>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = `<p style="grid-column:1/-1; color:#ff6b6b; font-size:12px; text-align:center; padding:20px;">${saEscHtml(e.message)}</p>`;
  }
}

function saSwitchTab(tab) {
  const panels = { stats: 'sa-panel-stats', member: 'sa-panel-member', tos: 'sa-panel-tos', event: 'sa-panel-event', shop: 'sa-panel-shop' };
  const tabs = { stats: 'sa-tab-stats', member: 'sa-tab-member', tos: 'sa-tab-tos', event: 'sa-tab-event', shop: 'sa-tab-shop' };
  const activeColors = {
    stats: { bg: 'rgba(123,92,255,0.15)', border: 'rgba(123,92,255,0.4)', color: '#7b5cff' },
    member: { bg: 'rgba(0,229,197,0.15)', border: 'rgba(0,229,197,0.4)', color: '#00e5c0' },
    tos: { bg: 'rgba(255,180,0,0.15)', border: 'rgba(255,180,0,0.4)', color: '#ffb400' },
    event: { bg: 'rgba(255,90,160,0.15)', border: 'rgba(255,90,160,0.4)', color: '#ff5aa0' },
    shop: { bg: 'rgba(255,210,63,0.15)', border: 'rgba(255,210,63,0.4)', color: '#ffd23f' },
  };
  const inactiveStyle = { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)', color: '#cbd5e0' };

  Object.keys(panels).forEach(key => {
    const panelEl = document.getElementById(panels[key]);
    const tabEl = document.getElementById(tabs[key]);
    if (!panelEl || !tabEl) return;

    if (key === tab) {
      panelEl.style.display = 'block';
      tabEl.style.background = activeColors[key].bg;
      tabEl.style.borderColor = activeColors[key].border;
      tabEl.style.color = activeColors[key].color;
    } else {
      panelEl.style.display = 'none';
      tabEl.style.background = inactiveStyle.bg;
      tabEl.style.borderColor = inactiveStyle.border;
      tabEl.style.color = inactiveStyle.color;
    }
  });

  if (tab === 'stats') saLoadStats();
  if (tab === 'tos') saLoadTosThreads();
  if (tab === 'event') saLoadEventList();
  if (tab === 'shop') saLoadShopList();
}

// ═══ CHAT PUBLIK (Firebase terpisah dari Event — project cosmos-68cbf) ═══
// Dipakai khusus untuk aksi maintenance admin (hapus riwayat chat publik).
const CHAT_FIREBASE_CONFIG = {
  apiKey:            "AIzaSyA6-_YMSxAWnF1u_Z6k6DCOoEmb3Z82oJM",
  authDomain:        "cosmos-68cbf.firebaseapp.com",
  databaseURL:       "https://cosmos-68cbf-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "cosmos-68cbf",
  storageBucket:     "cosmos-68cbf.firebasestorage.app",
};

let _chatApp = null, _chatDb = null;

async function saGetChatFirebase() {
  if (_chatApp) return { app: _chatApp, db: _chatDb };
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
  const { getDatabase } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');

  _chatApp = initializeApp(CHAT_FIREBASE_CONFIG, 'chatApp');
  _chatDb = getDatabase(_chatApp);
  return { app: _chatApp, db: _chatDb };
}

async function saClearPublicChat() {
  const roomId = document.getElementById('sa-chat-room-select')?.value;
  const statusEl = document.getElementById('sa-chat-clear-status');
  if (!roomId) return;

  if (!confirm(`Hapus SELURUH riwayat pesan di Room ${roomId}? Aksi ini tidak bisa dibatalkan.`)) return;

  if (statusEl) { statusEl.textContent = 'Menghapus...'; statusEl.style.color = '#ffd23f'; }

  try {
    const { db } = await saGetChatFirebase();
    const { ref, remove } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
    await remove(ref(db, `rooms/${roomId}/messages`));

    if (statusEl) { statusEl.textContent = `✅ Riwayat Room ${roomId} berhasil dihapus.`; statusEl.style.color = '#00e5c0'; }
  } catch (e) {
    if (statusEl) { statusEl.textContent = `⚠️ Gagal menghapus: ${e.message}`; statusEl.style.color = '#ff6b6b'; }
  }
}

// ═══ EVENT SYSTEM (Firebase terpisah — isi config di bawah) ═══
// GANTI config ini dengan project Firebase BARU yang khusus buat data Event,
// supaya terpisah dari Firebase chat (cosmos-68cbf).
// Catatan: cuma perlu Realtime Database di sini — file event disimpan di Vercel Blob,
// bukan Firebase Storage, jadi tidak perlu Storage aktif di project baru ini.
const EVENT_FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCvIFCwWaH7r8i-8AeqTK2jE5YjMcBhJsg",
  authDomain:        "storage-event-a5d18.firebaseapp.com",
  databaseURL:       "https://storage-event-a5d18-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "storage-event-a5d18",
  messagingSenderId: "432915436521",
  appId:             "1:432915436521:web:384ff16175eb45e46c3178"
};

let _eventApp = null, _eventDb = null;

async function saGetEventFirebase() {
  if (_eventApp) return { app: _eventApp, db: _eventDb };
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
  const { getDatabase, ref, get, set, remove } =
    await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');

  _eventApp = initializeApp(EVENT_FIREBASE_CONFIG, 'eventApp');
  _eventDb = getDatabase(_eventApp);

  window._eventDbFns = { ref, get, set, remove };

  return { app: _eventApp, db: _eventDb };
}

// ── Quest builder: state sementara untuk quest yang lagi dibangun di form ──
let saQuestDraft = [];

// Definisi 6 tipe quest yang tersedia di form. `fields` menentukan input
// tambahan apa yang perlu tampil untuk tipe tersebut (di luar judul & reward
// koin yang selalu ada untuk semua tipe).
//   - 'visit'         -> kunjungi profile, field: targetLink (link profile)
//   - 'submit-link'   -> salin tautan video, field: sourceLink (video sumber
//                        dari admin, dipakai buat cocokkan video ID)
//   - 'like-video'    -> like video + screenshot, field: targetLink (video
//                        yang harus di-like), member wajib upload bukti
//   - 'make-video'    -> buat video, field: none (langsung arahkan ke TikTok)
//   - 'invite-friend' -> ajak teman, field: none (pakai inviteLink event)
//   - 'login-streak'  -> field: streakDays (berapa hari berturut-turut)
const SA_QUEST_TYPES = {
  'visit':         { label: 'Kunjungi Profile',       fields: ['targetLink'] },
  'submit-link':   { label: 'Salin Tautan Video',     fields: ['sourceLink'] },
  'like-video':    { label: 'Like Video (screenshot)',fields: ['targetLink'] },
  'make-video':    { label: 'Buat Video (ke TikTok)', fields: [] },
  'invite-friend': { label: 'Ajak Teman',             fields: [] },
  'login-streak':  { label: 'Login Berturut-turut',   fields: ['streakDays'] },
};

function saAddQuestRow() {
  const id = 'q_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  saQuestDraft.push({ id, type: 'visit', title: '', rewardCoin: 10, targetLink: '', sourceLink: '', streakDays: 3, unlockDay: 1 });
  saRenderQuestList();
}

function saRemoveQuestRow(id) {
  saQuestDraft = saQuestDraft.filter(q => q.id !== id);
  saRenderQuestList();
}

function saUpdateQuestField(id, field, value) {
  const q = saQuestDraft.find(q => q.id === id);
  if (q) q[field] = value;
}

// Ganti tipe quest DAN render ulang baris itu — supaya field dinamis
// (targetLink/sourceLink/streakDays) langsung muncul/hilang sesuai tipe
// yang baru dipilih, tanpa perlu render ulang seluruh daftar quest.
function saUpdateQuestType(id, value) {
  saUpdateQuestField(id, 'type', value);
  saRenderQuestList();
}

// Render field tambahan sesuai tipe quest yang dipilih. Dipisah dari
// saRenderQuestList supaya gampang nambah tipe baru nanti tanpa
// mengacak-acak template utama.
function saRenderQuestExtraFields(q) {
  const def = SA_QUEST_TYPES[q.type] || SA_QUEST_TYPES['visit'];
  const inputStyle = 'width:100%; padding:8px; margin-bottom:6px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.2); border-radius:6px; color:#fff; font-size:12px; box-sizing:border-box;';

  return def.fields.map(field => {
    if (field === 'targetLink') {
      const placeholder = q.type === 'like-video' ? 'Link video yang harus di-like (TikTok)' : 'Link profile yang harus dikunjungi';
      return `<input type="text" placeholder="${placeholder}" value="${q.targetLink || ''}" oninput="saUpdateQuestField('${q.id}','targetLink',this.value)" style="${inputStyle}">`;
    }
    if (field === 'sourceLink') {
      return `<input type="text" placeholder="Link video sumber (TikTok, dari akun I.O.E)" value="${q.sourceLink || ''}" oninput="saUpdateQuestField('${q.id}','sourceLink',this.value)" style="${inputStyle}">
        <p style="font-size:10px; color:#718096; margin:-2px 0 6px 2px;">Member wajib kirim link ke video PERSIS ini (dicek dari video ID). Link pendek (vt.tiktok.com) otomatis masuk antrian Review manual.</p>`;
    }
    if (field === 'streakDays') {
      return `<input type="number" min="1" placeholder="Jumlah hari berturut-turut" value="${q.streakDays || 3}" oninput="saUpdateQuestField('${q.id}','streakDays',parseInt(this.value,10)||1)" style="${inputStyle}">`;
    }
    return '';
  }).join('');
}

function saRenderQuestList() {
  const listEl = document.getElementById('sa-quest-list');
  if (!listEl) return;

  if (saQuestDraft.length === 0) {
    listEl.innerHTML = '<p style="color:#718096; font-size:11px; text-align:center; padding:10px;">Belum ada quest. Klik "+ Tambah Quest" di bawah.</p>';
    return;
  }

  listEl.innerHTML = saQuestDraft.map((q, idx) => `
    <div style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,90,160,0.2); border-radius:8px; padding:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span style="font-size:11px; color:#a0aec0; font-weight:600;">Quest ${idx + 1}</span>
        <button type="button" onclick="saRemoveQuestRow('${q.id}')" style="background:rgba(255,107,107,0.15); border:1px solid rgba(255,107,107,0.3); color:#ff6b6b; border-radius:6px; padding:3px 7px; font-size:10px; cursor:pointer;">Hapus</button>
      </div>
      <select onchange="saUpdateQuestType('${q.id}',this.value)" style="width:100%; padding:8px; margin-bottom:6px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.2); border-radius:6px; color:#fff; font-size:12px; box-sizing:border-box;">
        ${Object.entries(SA_QUEST_TYPES).map(([key, def]) => `<option value="${key}" ${q.type === key ? 'selected' : ''}>${def.label}</option>`).join('')}
      </select>
      <input type="text" placeholder="Judul quest (misal: Kunjungi Profile)" value="${q.title}" oninput="saUpdateQuestField('${q.id}','title',this.value)" style="width:100%; padding:8px; margin-bottom:6px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.2); border-radius:6px; color:#fff; font-size:12px; box-sizing:border-box;">
      ${saRenderQuestExtraFields(q)}
      <input type="number" min="1" placeholder="Reward koin" value="${q.rewardCoin}" oninput="saUpdateQuestField('${q.id}','rewardCoin',parseInt(this.value,10)||0)" style="width:100%; padding:8px; margin-bottom:6px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.2); border-radius:6px; color:#fff; font-size:12px; box-sizing:border-box;">
      <input type="number" min="1" placeholder="Buka di hari ke- (1 = langsung bisa)" value="${q.unlockDay || 1}" oninput="saUpdateQuestField('${q.id}','unlockDay',parseInt(this.value,10)||1)" style="width:100%; padding:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.2); border-radius:6px; color:#fff; font-size:12px; box-sizing:border-box;">
      <p style="font-size:10px; color:#718096; margin:4px 0 0 2px;">Quest terkunci sampai hari ke-N sejak event dipublikasikan (hari ke-1 = hari event diterbitkan).</p>
    </div>
  `).join('');
}

// Upload 1 gambar langsung ke Cloudinary (unsigned), skip limit body Vercel.
// Pakai upload preset "event_poster_unsigned" (folder event-posters) — beda
// dari "broadcast_gallery_unsigned" yang dipakai fitur Broadcast, supaya
// aset event tidak campur folder dengan galeri broadcast di Cloudinary.
async function saUploadEventImage(file) {
  const cloudForm = new FormData();
  cloudForm.append('file', file);
  cloudForm.append('upload_preset', 'event_poster_unsigned');

  const cloudRes = await fetch('https://api.cloudinary.com/v1_1/mclectmg/auto/upload', {
    method: 'POST',
    body: cloudForm,
  });
  const cloudData = await cloudRes.json();
  if (!cloudRes.ok) {
    throw new Error(cloudData.error?.message || 'Upload gambar ke Cloudinary gagal');
  }
  return cloudData.secure_url;
}

async function saCreateEvent() {
  const title = document.getElementById('sa-event-title').value.trim();
  const desc = document.getElementById('sa-event-desc').value.trim();
  const days = parseInt(document.getElementById('sa-event-days').value, 10);
  const coinName = document.getElementById('sa-event-coin-name').value.trim();
  const bgInput = document.getElementById('sa-event-bg-input');
  const borderImgInput = document.getElementById('sa-event-borderimg-input');
  const questBgInput = document.getElementById('sa-event-questbg-input');
  const statusEl = document.getElementById('sa-event-upload-status');
  const btn = document.getElementById('sa-event-submit-btn');

  if (!title || !days || days < 1) {
    statusEl.textContent = '⚠️ Judul dan jumlah hari wajib diisi.';
    statusEl.style.color = '#ff6b6b';
    return;
  }
  if (!coinName) {
    statusEl.textContent = '⚠️ Nama koin event wajib diisi.';
    statusEl.style.color = '#ff6b6b';
    return;
  }
  const bgFile = bgInput.files && bgInput.files[0];
  const borderImgFile = borderImgInput.files && borderImgInput.files[0];
  const questBgFile = questBgInput.files && questBgInput.files[0];
  if (!bgFile || !borderImgFile || !questBgFile) {
    statusEl.textContent = '⚠️ Upload Background, Border, dan Isi Tengah Border — ketiganya wajib.';
    statusEl.style.color = '#ff6b6b';
    return;
  }
  if (saQuestDraft.length === 0) {
    statusEl.textContent = '⚠️ Tambahkan minimal 1 quest.';
    statusEl.style.color = '#ff6b6b';
    return;
  }
  const inviteLink = document.getElementById('sa-event-invite-link').value.trim();
  for (const q of saQuestDraft) {
    if (!q.title || !q.rewardCoin || q.rewardCoin < 1) {
      statusEl.textContent = '⚠️ Semua quest wajib punya judul dan reward koin > 0.';
      statusEl.style.color = '#ff6b6b';
      return;
    }
    const def = SA_QUEST_TYPES[q.type];
    if (def && def.fields.includes('targetLink') && !q.targetLink?.trim()) {
      statusEl.textContent = `⚠️ Quest "${q.title}" (${def.label}) wajib diisi link tujuan.`;
      statusEl.style.color = '#ff6b6b';
      return;
    }
    if (def && def.fields.includes('sourceLink') && !q.sourceLink?.trim()) {
      statusEl.textContent = `⚠️ Quest "${q.title}" (${def.label}) wajib diisi link video sumber.`;
      statusEl.style.color = '#ff6b6b';
      return;
    }
    if (q.type === 'invite-friend' && !inviteLink) {
      statusEl.textContent = '⚠️ Ada quest "Ajak Teman" — isi dulu Link I.O.E Hub di atas.';
      statusEl.style.color = '#ff6b6b';
      return;
    }
  }

  btn.disabled = true;
  btn.textContent = 'Mengupload...';
  statusEl.style.color = '#718096';

  try {
    const eventId = 'event_' + Date.now();

    statusEl.textContent = 'Upload background...';
    const backgroundUrl = await saUploadEventImage(bgFile);

    statusEl.textContent = 'Upload border/bingkai...';
    const borderShapeUrl = await saUploadEventImage(borderImgFile);

    statusEl.textContent = 'Upload isi tengah border...';
    const questBgUrl = await saUploadEventImage(questBgFile);

    // Susun quest jadi object (bukan array) supaya gampang di-lookup per ID
    // saat member klaim reward nanti.
    const questsObj = {};
    saQuestDraft.forEach(q => {
      const questData = {
        id: q.id,
        type: q.type,
        title: q.title,
        rewardCoin: q.rewardCoin,
        targetLink: q.targetLink || '',
        sourceLink: q.sourceLink || '',
        unlockDay: q.unlockDay || 1,
      };
      // Firebase Realtime Database menolak nilai `undefined` di dalam object
      // yang disimpan (error "value argument contains undefined in
      // property"). streakDays cuma relevan untuk tipe login-streak, jadi
      // field ini hanya ditambahkan kalau memang dipakai — bukan diisi
      // undefined untuk tipe lain.
      if (q.type === 'login-streak') {
        questData.streakDays = q.streakDays || 1;
      }
      questsObj[q.id] = questData;
    });

    const { db } = await saGetEventFirebase();
    const { ref, set } = window._eventDbFns;

    const now = Date.now();
    const expiresAt = now + (days * 24 * 60 * 60 * 1000);

    statusEl.textContent = 'Menyimpan event...';
    await set(ref(db, `events/${eventId}`), {
      id: eventId,
      title, desc,
      backgroundUrl,
      borderShapeUrl,
      questBgUrl,
      coinName,
      inviteLink,
      quests: questsObj,
      createdAt: now,
      expiresAt,
      days
    });

    statusEl.textContent = '✅ Event berhasil dipublikasikan!';
    statusEl.style.color = '#00e5c0';
    document.getElementById('sa-event-title').value = '';
    document.getElementById('sa-event-desc').value = '';
    document.getElementById('sa-event-days').value = '';
    document.getElementById('sa-event-coin-name').value = '';
    document.getElementById('sa-event-invite-link').value = '';
    bgInput.value = '';
    borderImgInput.value = '';
    questBgInput.value = '';
    saQuestDraft = [];
    saRenderQuestList();
    saLoadEventList();
  } catch (err) {
    console.error('Gagal membuat event:', err);
    const detail = (err && err.message) ? err.message : String(err);
    statusEl.textContent = `❌ Gagal: ${detail}`;
    statusEl.style.color = '#ff6b6b';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Publikasikan Event';
  }
}

async function saLoadEventList() {
  const listEl = document.getElementById('sa-event-list');
  if (!listEl) return;

  try {
    const { db } = await saGetEventFirebase();
    const { ref, get, remove } = window._eventDbFns;

    const snap = await get(ref(db, 'events'));
    const data = snap.val();

    if (!data) {
      listEl.innerHTML = '<p style="color:#718096; font-size:12px; text-align:center; padding:20px;">Belum ada event aktif</p>';
      return;
    }

    const now = Date.now();
    const events = Object.values(data);

    // Lazy delete: hapus event yang sudah lewat expiresAt
    for (const ev of events) {
      if (ev.expiresAt && ev.expiresAt < now) {
        await remove(ref(db, `events/${ev.id}`));
      }
    }

    const activeEvents = events.filter(ev => !ev.expiresAt || ev.expiresAt >= now);

    if (activeEvents.length === 0) {
      listEl.innerHTML = '<p style="color:#718096; font-size:12px; text-align:center; padding:20px;">Belum ada event aktif</p>';
      return;
    }

    listEl.innerHTML = activeEvents.map(ev => {
      const daysLeft = Math.max(0, Math.ceil((ev.expiresAt - now) / (24 * 60 * 60 * 1000)));
      const questCount = ev.quests ? Object.keys(ev.quests).length : 0;
      return `
        <div style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,90,160,0.2); border-radius:10px; padding:12px;">
          <div style="display:flex; justify-content:space-between; align-items:start; gap:8px;">
            <div style="font-size:13px; font-weight:600; color:#fff;">${ev.title}</div>
            <button onclick="saDeleteEvent('${ev.id}')" style="background:rgba(255,107,107,0.15); border:1px solid rgba(255,107,107,0.3); color:#ff6b6b; border-radius:6px; padding:4px 8px; font-size:10px; cursor:pointer; flex-shrink:0;">Hapus</button>
          </div>
          <div style="font-size:11px; color:#a0aec0; margin-top:4px;">${ev.desc || ''}</div>
          <div style="font-size:10px; color:#718096; margin-top:6px;">🎯 ${questCount} quest · 🪙 ${ev.coinName || 'koin'} · ⏳ ${daysLeft} hari lagi</div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Gagal memuat daftar event:', err);
    const detail = (err && err.message) ? err.message : String(err);
    listEl.innerHTML = `<p style="color:#ff6b6b; font-size:12px; text-align:center; padding:20px;">Gagal memuat event: ${detail}</p>`;
  }
}

async function saDeleteEvent(eventId) {
  if (!confirm('Hapus event ini sekarang? File challenge yang sudah di-upload juga akan dihapus permanen dari storage.')) return;
  try {
    const { db } = await saGetEventFirebase();
    const { ref, remove, get } = window._eventDbFns;

    // Ambil dulu data event untuk tahu file mana yang perlu dihapus dari
    // Cloudinary. Kalau tidak ketemu pathname-nya (misal event lama yang
    // dibuat sebelum fix ini ada), lewati penghapusan file & lanjut hapus
    // datanya saja — supaya tombol hapus tetap berfungsi untuk event lama.
    const snap = await get(ref(db, `events/${eventId}`));
    const eventData = snap.val();

    if (eventData && eventData.challengePathname) {
      try {
        const delRes = await fetch('/api/event-upload', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ publicId: eventData.challengePathname, resourceType: 'raw' }),
        });
        if (!delRes.ok) {
          const delData = await delRes.json().catch(() => ({}));
          console.error('Gagal menghapus file Cloudinary:', delData.error || delRes.status);
          // Tetap lanjut hapus data event walau file Cloudinary gagal dihapus —
          // supaya event tidak "nyangkut" di daftar hanya karena satu bagian gagal.
        }
      } catch (fileErr) {
        console.error('Error saat menghapus file Cloudinary:', fileErr);
      }
    }

    await remove(ref(db, `events/${eventId}`));
    saLoadEventList();
  } catch (err) {
    console.error('Gagal menghapus event:', err);
    alert('Gagal menghapus event.');
  }
}

// ═══ SUB-TAB SWITCHER: Acara / Koin / Broadcast / Galeri (di dalam tab Event) ═══
function saSwitchEventSubtab(subtab) {
  const subs = { acara: 'sa-eventsub-acara', koin: 'sa-eventsub-koin', broadcast: 'sa-eventsub-broadcast', galeri: 'sa-eventsub-galeri', review: 'sa-eventsub-review' };
  const tabs = { acara: 'sa-subtab-acara', koin: 'sa-subtab-koin', broadcast: 'sa-subtab-broadcast', galeri: 'sa-subtab-galeri', review: 'sa-subtab-review' };

  Object.entries(subs).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = key === subtab ? 'block' : 'none';
  });
  Object.entries(tabs).forEach(([key, id]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    if (key === subtab) {
      btn.style.background = 'rgba(255,90,160,0.15)';
      btn.style.border = '1px solid rgba(255,90,160,0.4)';
      btn.style.color = '#ff5aa0';
    } else {
      btn.style.background = 'rgba(255,90,160,0.1)';
      btn.style.border = '1px solid rgba(255,90,160,0.25)';
      btn.style.color = '#cbd5e0';
    }
  });

  if (subtab === 'koin') saPopulateCoinEventDropdown();
  if (subtab === 'broadcast') saPopulateBroadcastGalleryDropdowns();
  if (subtab === 'galeri') saLoadBroadcastGallery();
  if (subtab === 'review') saPopulateReviewEventDropdown();
}

// Isi dropdown pilihan event dari data event yang sama (Firebase storage-event-a5d18)
async function saPopulateCoinEventDropdown() {
  const selectEl = document.getElementById('sa-coin-event-select');
  if (!selectEl) return;

  try {
    const { db } = await saGetEventFirebase();
    const { ref, get } = window._eventDbFns;
    const snap = await get(ref(db, 'events'));
    const data = snap.val();

    selectEl.innerHTML = '<option value="">Pilih event...</option>';
    if (!data) return;

    const now = Date.now();
    const activeEvents = Object.values(data).filter(ev => !ev.expiresAt || ev.expiresAt >= now);

    activeEvents.forEach(ev => {
      const opt = document.createElement('option');
      opt.value = ev.id;
      opt.textContent = ev.title;
      selectEl.appendChild(opt);
    });
  } catch (err) {
    console.error('Gagal memuat daftar event untuk dropdown koin:', err);
  }
}

// ═══ Review quest pending (like-video screenshot / TikTok short-link) ═══

async function saPopulateReviewEventDropdown() {
  const selectEl = document.getElementById('sa-review-event-select');
  if (!selectEl) return;

  try {
    const { db } = await saGetEventFirebase();
    const { ref, get } = window._eventDbFns;
    const snap = await get(ref(db, 'events'));
    const data = snap.val();

    selectEl.innerHTML = '<option value="">Pilih event...</option>';
    if (!data) return;

    Object.values(data).forEach(ev => {
      const opt = document.createElement('option');
      opt.value = ev.id;
      opt.textContent = ev.title;
      selectEl.appendChild(opt);
    });
  } catch (err) {
    console.error('Gagal memuat daftar event untuk dropdown review:', err);
  }
}

// Cache judul quest per event, supaya kartu review bisa menampilkan judul
// quest yang dibaca, bukan cuma questId mentah dari Redis.
let saReviewQuestMetaCache = {};

async function saLoadEventQuestMeta(eventId) {
  if (saReviewQuestMetaCache[eventId]) return saReviewQuestMetaCache[eventId];
  const { db } = await saGetEventFirebase();
  const { ref, get } = window._eventDbFns;
  const snap = await get(ref(db, `events/${eventId}/quests`));
  const meta = snap.val() || {};
  saReviewQuestMetaCache[eventId] = meta;
  return meta;
}

async function saLoadPendingQuests() {
  const eventId = document.getElementById('sa-review-event-select').value;
  const listEl = document.getElementById('sa-review-list');
  if (!eventId) {
    listEl.innerHTML = '<p style="color:#718096; font-size:12px; text-align:center; padding:20px;">Pilih event dulu untuk lihat antrian review.</p>';
    return;
  }

  listEl.innerHTML = '<p style="color:#718096; font-size:12px; text-align:center; padding:20px;">Memuat antrian review...</p>';

  try {
    const adminToken = saGetAdminToken();
    const res = await fetch('/api/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list-pending-quests', adminToken, eventId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal memuat antrian review');

    const pending = data.pending || [];
    if (pending.length === 0) {
      listEl.innerHTML = '<p style="color:#718096; font-size:12px; text-align:center; padding:20px;">Tidak ada klaim yang menunggu review 🎉</p>';
      return;
    }

    const questMeta = await saLoadEventQuestMeta(eventId);

    listEl.innerHTML = pending.map(item => {
      const quest = questMeta[item.questId] || {};
      const proof = item.submittedLink
        ? `<div style="font-size:11px; color:#00c2ff; word-break:break-all; margin:6px 0;">🔗 ${item.submittedLink}</div>`
        : '';
      const screenshot = item.proofImageUrl
        ? `<img src="${item.proofImageUrl}" style="width:100%; max-height:220px; object-fit:contain; border-radius:8px; margin:6px 0; background:#000;">`
        : '';
      return `
        <div style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,90,160,0.2); border-radius:10px; padding:12px;">
          <div style="font-size:12px; font-weight:600; color:#fff;">${quest.title || item.questId}</div>
          <div style="font-size:10px; color:#718096; margin-top:2px;">Member: ${item.memberId}</div>
          ${proof}
          ${screenshot}
          <div style="display:flex; gap:8px; margin-top:8px;">
            <button onclick="saReviewDecision('${eventId}','${item.questId}','${item.memberId}','approve')" style="flex:1; padding:8px; background:rgba(0,229,197,0.15); border:1px solid rgba(0,229,197,0.4); color:#00e5c0; border-radius:6px; font-weight:600; font-size:11px; cursor:pointer;">✅ Setujui</button>
            <button onclick="saReviewDecision('${eventId}','${item.questId}','${item.memberId}','reject')" style="flex:1; padding:8px; background:rgba(255,107,107,0.15); border:1px solid rgba(255,107,107,0.4); color:#ff6b6b; border-radius:6px; font-weight:600; font-size:11px; cursor:pointer;">❌ Tolak</button>
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    console.error('Gagal memuat antrian review:', err);
    listEl.innerHTML = `<p style="color:#ff6b6b; font-size:12px; text-align:center; padding:20px;">Gagal memuat: ${err.message || err}</p>`;
  }
}

async function saReviewDecision(eventId, questId, memberId, decision) {
  try {
    const adminToken = saGetAdminToken();
    const action = decision === 'approve' ? 'approve-pending-quest' : 'reject-pending-quest';

    // rewardCoin cuma dibutuhkan saat approve, diambil dari cache meta quest
    // yang sudah dimuat saat saLoadPendingQuests() — shop.js sendiri tidak
    // tahu rewardCoin karena data quest disimpan di Firebase, bukan Redis.
    const questMeta = saReviewQuestMetaCache[eventId] || {};
    const rewardCoin = questMeta[questId] ? questMeta[questId].rewardCoin : 0;

    const res = await fetch('/api/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, adminToken, eventId, questId, memberId, rewardCoin }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal memproses review');
    saLoadPendingQuests();
  } catch (err) {
    console.error('Gagal memproses review:', err);
    alert(`Gagal: ${err.message || err}`);
  }
}

// Kirim koin event ke member tertentu — disimpan di Upstash Redis (bukan Firebase),
// konsisten dengan sistem koin global di shop.js. Key: eventcoin:{eventId}:{memberId}
// Toggle tampilan field event: cuma perlu dipilih kalau jenis koinnya
// "Koin Event" — Ore Coin tidak terikat event manapun (ekosistem
// terpisah, lihat catatan "Ore Coin economy" di shop.js/tycoon.js).
function saToggleCoinTypeFields() {
  const type = document.getElementById('sa-coin-type-select').value;
  document.getElementById('sa-coin-event-field').style.display = type === 'event' ? 'block' : 'none';
}
window.saToggleCoinTypeFields = saToggleCoinTypeFields;

// Kirim koin ke member tertentu — bercabang jadi 2 endpoint berbeda
// tergantung jenis koin yang dipilih:
//   - 'event' -> /api/shop, action 'grant-event-coin' (key Redis:
//     eventcoin:{eventId}:{memberId}, terikat 1 event tertentu)
//   - 'ore'   -> /api/tycoon, action 'grant-ore-coin' (key Redis:
//     orecoins:{memberId}, ekosistem GLOBAL milik Ore Tycoon, TIDAK
//     terikat event manapun — makanya field event disembunyikan untuk
//     pilihan ini)
async function saGrantCoin() {
  const coinType = document.getElementById('sa-coin-type-select').value;
  const memberId = document.getElementById('sa-coin-member-id').value.trim();
  const amount = parseInt(document.getElementById('sa-coin-amount').value, 10);
  const statusEl = document.getElementById('sa-coin-status');
  const btn = document.getElementById('sa-coin-submit-btn');

  if (!memberId) {
    statusEl.textContent = '⚠️ Member ID wajib diisi.';
    statusEl.style.color = '#ff6b6b';
    return;
  }
  if (isNaN(amount) || amount < 1) {
    statusEl.textContent = '⚠️ Jumlah koin harus angka lebih dari 0.';
    statusEl.style.color = '#ff6b6b';
    return;
  }

  let eventId = null;
  if (coinType === 'event') {
    eventId = document.getElementById('sa-coin-event-select').value;
    if (!eventId) {
      statusEl.textContent = '⚠️ Pilih event dulu.';
      statusEl.style.color = '#ff6b6b';
      return;
    }
  }

  btn.disabled = true;
  btn.textContent = 'Mengirim...';
  statusEl.style.color = '#718096';

  try {
    const adminToken = saGetAdminToken();
    const endpoint = coinType === 'ore' ? '/api/tycoon' : '/api/shop';
    const action = coinType === 'ore' ? 'grant-ore-coin' : 'grant-event-coin';
    const body = coinType === 'ore'
      ? { action, adminToken, memberId, amount }
      : { action, adminToken, eventId, memberId, amount };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengirim koin');

    const balanceLabel = coinType === 'ore' ? 'Ore Coin' : 'koin event';
    statusEl.textContent = `✅ Berhasil kirim ${amount} ${balanceLabel}. Saldo sekarang: ${data.coins ?? data.oreCoins}`;
    statusEl.style.color = '#00e5c0';
    document.getElementById('sa-coin-member-id').value = '';
    document.getElementById('sa-coin-amount').value = '';
  } catch (err) {
    console.error('Gagal kirim koin:', err);
    statusEl.textContent = `❌ Gagal: ${err.message || err}`;
    statusEl.style.color = '#ff6b6b';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Kirim Koin';
  }
}
window.saGrantCoin = saGrantCoin;

async function saCheckEventCoin() {
  const eventId = document.getElementById('sa-coin-event-select').value;
  const memberId = document.getElementById('sa-coin-check-member').value.trim();
  const resultEl = document.getElementById('sa-coin-check-result');

  if (!eventId) {
    resultEl.textContent = '⚠️ Pilih event dulu di atas.';
    resultEl.style.color = '#ff6b6b';
    return;
  }
  if (!memberId) {
    resultEl.textContent = '⚠️ Isi Member ID dulu.';
    resultEl.style.color = '#ff6b6b';
    return;
  }

  resultEl.textContent = 'Mengecek...';
  resultEl.style.color = '#718096';

  try {
    const adminToken = saGetAdminToken();
    const res = await fetch('/api/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check-event-coin', adminToken, eventId, memberId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengecek saldo');

    resultEl.textContent = `🪙 Saldo koin event: ${data.coins}`;
    resultEl.style.color = '#cbd5e0';
  } catch (err) {
    console.error('Gagal cek koin event:', err);
    resultEl.textContent = `❌ Gagal: ${err.message || err}`;
    resultEl.style.color = '#ff6b6b';
  }
}

// Kirim broadcast toast ke semua member yang sedang membuka index.html.
// Numpang di Firebase Event (storage-event-a5d18) yang sudah terhubung,
// path terpisah 'broadcast/latest' — bukan bagian dari data event manapun.
// Non-permanen: index.html cuma dengar (listen) 1 node ini, timpa isinya
// setiap kali broadcast baru dikirim, tidak pernah menyimpan riwayat.
async function saSendBroadcast() {
  const message = document.getElementById('sa-broadcast-message').value.trim();
  const musicUrl = document.getElementById('sa-broadcast-music-select').value;
  const videoUrl = document.getElementById('sa-broadcast-video-select').value;
  const statusEl = document.getElementById('sa-broadcast-status');
  const btn = document.getElementById('sa-broadcast-submit-btn');

  if (!message) {
    statusEl.textContent = '⚠️ Ketik pesan dulu.';
    statusEl.style.color = '#ff6b6b';
    return;
  }

  // Ambil username asli dari session akun biasa (bukan token superadmin) —
  // broadcast harus tampil pakai username asli, tanpa badge admin apapun.
  const session = (typeof getIoeSession === 'function') ? getIoeSession() : null;
  if (!session || !session.username) {
    statusEl.textContent = '⚠️ Kamu harus login dengan akun biasa (bukan cuma master key) untuk mengirim broadcast, supaya ada username yang bisa ditampilkan.';
    statusEl.style.color = '#ff6b6b';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Mengirim...';
  statusEl.style.color = '#718096';

  try {
    const { db } = await saGetEventFirebase();
    const { ref, set } = window._eventDbFns;

    await set(ref(db, 'broadcast/latest'), {
      username: session.username,
      message: message.slice(0, 150),
      musicUrl: musicUrl || null,
      videoUrl: videoUrl || null,
      timestamp: Date.now(),
    });

    statusEl.textContent = '✅ Broadcast terkirim!';
    statusEl.style.color = '#00e5c0';
    document.getElementById('sa-broadcast-message').value = '';
  } catch (err) {
    console.error('Gagal mengirim broadcast:', err);
    statusEl.textContent = `❌ Gagal: ${err.message || err}`;
    statusEl.style.color = '#ff6b6b';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Kirim Broadcast';
  }
}

// ═══ GALERI BROADCAST (musik & video untuk Admin Abuse) ═══
// Daftar file galeri disimpan di Redis lewat api/shop.js (numpang endpoint
// yang sudah ada, key 'broadcastgallery:list'), supaya tidak perlu menambah
// file API baru (folder api/ sudah pas di limit 12 function Vercel Hobby).

async function saUploadGalleryFile(type) {
  const inputId = type === 'music' ? 'sa-gallery-music-input' : 'sa-gallery-video-input';
  const btnId = type === 'music' ? 'sa-gallery-music-btn' : 'sa-gallery-video-btn';
  const input = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  const statusEl = document.getElementById('sa-gallery-upload-status');

  const file = input.files && input.files[0];
  if (!file) {
    statusEl.textContent = '⚠️ Pilih file dulu.';
    statusEl.style.color = '#ff6b6b';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Mengupload...';
  statusEl.textContent = 'Mengupload langsung ke Cloudinary...';
  statusEl.style.color = '#718096';

  try {
    // Upload LANGSUNG dari browser ke Cloudinary, skip server Vercel sama
    // sekali — supaya tidak kena limit hard 4.5MB body request Vercel Hobby
    // yang sebelumnya bikin file musik/video besar gagal upload.
    // Pakai unsigned upload preset "broadcast_gallery_unsigned" (folder
    // broadcast-gallery), jadi tidak butuh API key/secret di sisi client.
    const cloudForm = new FormData();
    cloudForm.append('file', file);
    cloudForm.append('upload_preset', 'broadcast_gallery_unsigned');

    const cloudRes = await fetch('https://api.cloudinary.com/v1_1/mclectmg/auto/upload', {
      method: 'POST',
      body: cloudForm,
    });
    const cloudData = await cloudRes.json();
    if (!cloudRes.ok) {
      throw new Error(cloudData.error?.message || 'Upload ke Cloudinary gagal');
    }

    // Setelah file sukses diupload, kirim METADATA saja (bukan file) ke
    // server kita untuk disimpan ke daftar galeri — body ini kecil (~1KB),
    // jauh di bawah limit Vercel, tidak peduli seberapa besar file aslinya.
    const adminToken = saGetAdminToken();
    const saveRes = await fetch('/api/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add-broadcast-gallery-item',
        adminToken,
        type,
        nama: file.name,
        url: cloudData.secure_url,
        publicId: cloudData.public_id,
      }),
    });
    const saveData = await saveRes.json();
    if (!saveRes.ok) throw new Error(saveData.error || 'Gagal menyimpan ke galeri');

    statusEl.textContent = '✅ File berhasil ditambahkan ke galeri!';
    statusEl.style.color = '#00e5c0';
    input.value = '';
    saLoadBroadcastGallery();
  } catch (err) {
    console.error('Gagal upload file galeri:', err);
    statusEl.textContent = `❌ Gagal: ${err.message || err}`;
    statusEl.style.color = '#ff6b6b';
  } finally {
    btn.disabled = false;
    btn.textContent = type === 'music' ? 'Upload Musik' : 'Upload Video';
  }
}

async function saLoadBroadcastGallery() {
  const listEl = document.getElementById('sa-gallery-list');
  if (!listEl) return;

  try {
    const adminToken = saGetAdminToken();
    const res = await fetch('/api/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list-broadcast-gallery', adminToken }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal memuat galeri');

    const files = data.files || [];
    if (files.length === 0) {
      listEl.innerHTML = '<p style="color:#718096; font-size:12px; text-align:center; padding:20px;">Galeri masih kosong.</p>';
      return;
    }

    listEl.innerHTML = files.map(f => `
      <div style="display:flex; align-items:center; gap:10px; padding:10px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:8px;">
        <div style="font-size:18px; flex-shrink:0;">${f.type === 'music' ? '🎵' : '🎬'}</div>
        <div style="flex:1; min-width:0;">
          <div style="font-size:12px; color:#fff; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${saEscHtml(f.nama)}</div>
          <div style="font-size:10px; color:#718096;">${f.type === 'music' ? 'Musik' : 'Video'}</div>
        </div>
        <button onclick="saDeleteGalleryFile('${f.id}')" style="background:rgba(255,90,160,0.15); border:1px solid rgba(255,90,160,0.3); color:#ff5aa0; border-radius:6px; padding:6px 10px; font-size:11px; cursor:pointer; flex-shrink:0;">Hapus</button>
      </div>
    `).join('');
  } catch (err) {
    console.error('Gagal memuat galeri broadcast:', err);
    listEl.innerHTML = '<p style="color:#ff6b6b; font-size:12px; text-align:center; padding:20px;">⚠️ Gagal memuat galeri.</p>';
  }
}

async function saDeleteGalleryFile(fileId) {
  if (!confirm('Hapus file ini dari galeri? File di Cloudinary juga akan terhapus permanen.')) return;
  try {
    const adminToken = saGetAdminToken();
    const res = await fetch('/api/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete-broadcast-gallery-item', adminToken, fileId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menghapus file');
    saLoadBroadcastGallery();
  } catch (err) {
    console.error('Gagal menghapus file galeri:', err);
    alert('Gagal menghapus file: ' + (err.message || err));
  }
}

// Isi dropdown musik & video di form Broadcast dari daftar galeri
async function saPopulateBroadcastGalleryDropdowns() {
  const musicSelect = document.getElementById('sa-broadcast-music-select');
  const videoSelect = document.getElementById('sa-broadcast-video-select');
  if (!musicSelect || !videoSelect) return;

  try {
    const adminToken = saGetAdminToken();
    const res = await fetch('/api/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list-broadcast-gallery', adminToken }),
    });
    const data = await res.json();
    const files = data.files || [];

    musicSelect.innerHTML = '<option value="">— Tanpa musik —</option>';
    videoSelect.innerHTML = '<option value="">— Tanpa video —</option>';

    files.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.url;
      opt.textContent = f.nama;
      if (f.type === 'music') musicSelect.appendChild(opt);
      else videoSelect.appendChild(opt.cloneNode(true));
    });
  } catch (err) {
    console.error('Gagal memuat galeri untuk dropdown broadcast:', err);
  }
}

// ═══ SHOP SYSTEM — Panel Superadmin ═══

function saToggleShopEventSelect() {
  const koinType = document.getElementById('sa-shop-koin-type').value;
  const eventSelect = document.getElementById('sa-shop-event-select');
  eventSelect.style.display = koinType === 'event' ? 'block' : 'none';
  if (koinType === 'event') saPopulateShopEventDropdown();
}

function saToggleShopStokJumlah() {
  const stokType = document.getElementById('sa-shop-stok-type').value;
  const jumlahInput = document.getElementById('sa-shop-stok-jumlah');
  jumlahInput.style.display = stokType === 'unlimited' ? 'none' : 'block';
}

// Isi dropdown event untuk pilihan item bertipe koin event (reuse data event yang sama)
async function saPopulateShopEventDropdown() {
  const selectEl = document.getElementById('sa-shop-event-select');
  if (!selectEl) return;

  try {
    const { db } = await saGetEventFirebase();
    const { ref, get } = window._eventDbFns;
    const snap = await get(ref(db, 'events'));
    const data = snap.val();

    selectEl.innerHTML = '<option value="">Pilih event...</option>';
    if (!data) return;

    const now = Date.now();
    const activeEvents = Object.values(data).filter(ev => !ev.expiresAt || ev.expiresAt >= now);
    activeEvents.forEach(ev => {
      const opt = document.createElement('option');
      opt.value = ev.id;
      opt.textContent = ev.title;
      selectEl.appendChild(opt);
    });
  } catch (err) {
    console.error('Gagal memuat daftar event untuk dropdown shop:', err);
  }
}

async function saCreateShopItem() {
  const nama = document.getElementById('sa-shop-nama').value.trim();
  const harga = parseInt(document.getElementById('sa-shop-harga').value, 10);
  const kategori = document.getElementById('sa-shop-kategori').value;
  const koinType = document.getElementById('sa-shop-koin-type').value;
  const eventId = document.getElementById('sa-shop-event-select').value;
  const stokType = document.getElementById('sa-shop-stok-type').value;
  const stokJumlah = parseInt(document.getElementById('sa-shop-stok-jumlah').value, 10);
  const deskripsi = document.getElementById('sa-shop-deskripsi').value.trim();
  const iconInput = document.getElementById('sa-shop-icon');
  const statusEl = document.getElementById('sa-shop-upload-status');
  const btn = document.getElementById('sa-shop-submit-btn');

  if (!nama || isNaN(harga) || harga < 0) {
    statusEl.textContent = '⚠️ Nama dan harga (angka) wajib diisi.';
    statusEl.style.color = '#ff6b6b';
    return;
  }
  if (koinType === 'event' && !eventId) {
    statusEl.textContent = '⚠️ Pilih event dulu untuk item bertipe koin event.';
    statusEl.style.color = '#ff6b6b';
    return;
  }
  if (stokType !== 'unlimited' && (isNaN(stokJumlah) || stokJumlah < 1)) {
    statusEl.textContent = '⚠️ Isi jumlah stok (angka lebih dari 0) untuk tipe yang dipilih.';
    statusEl.style.color = '#ff6b6b';
    return;
  }
  if ((kategori === 'func-border' || kategori === 'func-background') && !(iconInput.files && iconInput.files[0])) {
    statusEl.textContent = '⚠️ Item Func wajib punya gambar — gambar ini yang dipakai sebagai border/background akun.';
    statusEl.style.color = '#ff6b6b';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Menyimpan...';
  statusEl.style.color = '#718096';

  try {
    let iconUrl = null;

    // Icon opsional — kalau ada file dipilih, upload dulu ke Cloudinary
    // lewat endpoint event-upload.js (mode profile-photo, folder gambar umum)
    if (iconInput.files && iconInput.files[0]) {
      const file = iconInput.files[0];
      statusEl.textContent = 'Upload icon...';

      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const uploadRes = await fetch('/api/event-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadType: 'profile-photo',
          fileName: `shopitem-${Date.now()}.${file.name.split('.').pop()}`,
          fileDataBase64: base64,
          contentType: file.type,
        }),
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || 'Upload icon gagal');
      iconUrl = uploadData.url;
    }

    statusEl.textContent = 'Menyimpan item...';
    const adminToken = saGetAdminToken();
    const res = await fetch('/api/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add-item',
        adminToken,
        nama, harga, deskripsi,
        icon: iconUrl,
        kategori,
        koinType,
        eventId: koinType === 'event' ? eventId : undefined,
        stokType,
        stokJumlah: stokType !== 'unlimited' ? stokJumlah : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menyimpan item');

    statusEl.textContent = '✅ Item berhasil ditambahkan!';
    statusEl.style.color = '#00e5c0';
    document.getElementById('sa-shop-nama').value = '';
    document.getElementById('sa-shop-harga').value = '';
    document.getElementById('sa-shop-deskripsi').value = '';
    document.getElementById('sa-shop-kategori').value = 'save';
    document.getElementById('sa-shop-koin-type').value = 'global';
    document.getElementById('sa-shop-event-select').style.display = 'none';
    document.getElementById('sa-shop-stok-type').value = 'unlimited';
    document.getElementById('sa-shop-stok-jumlah').value = '';
    document.getElementById('sa-shop-stok-jumlah').style.display = 'none';
    iconInput.value = '';
    saLoadShopList();
  } catch (err) {
    console.error('Gagal membuat item shop:', err);
    statusEl.textContent = `❌ Gagal: ${err.message || err}`;
    statusEl.style.color = '#ff6b6b';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Tambah Item';
  }
}

async function saLoadShopList() {
  const listEl = document.getElementById('sa-shop-list');
  if (!listEl) return;

  try {
    const res = await fetch('/api/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list-items' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal memuat item');

    const items = data.items || [];
    if (items.length === 0) {
      listEl.innerHTML = '<p style="color:#718096; font-size:12px; text-align:center; padding:20px;">Belum ada item.</p>';
      return;
    }

    listEl.innerHTML = items.map(item => {
      let stokInfo = '';
      if (item.stokType === 'daily') {
        stokInfo = `<span style="color:#00c2ff;"> · 🔄 ${item.stokSisa}/${item.stokJumlah} (harian)</span>`;
      } else if (item.stokType === 'onetime') {
        stokInfo = `<span style="color:${item.stokSisa <= 0 ? '#ff5aa0' : '#00c2ff'};"> · 🔒 ${item.stokSisa}/${item.stokJumlah}</span>`;
      } else if (item.stokType === 'peraccount') {
        stokInfo = `<span style="color:#7b5cff;"> · 👤 max ${item.stokJumlah}x/akun</span>`;
      }
      const restockBtn = item.stokType === 'onetime'
        ? `<button onclick="saRestockItem('${item.id}')" style="background:rgba(0,194,255,0.15); border:1px solid rgba(0,194,255,0.3); color:#00c2ff; border-radius:6px; padding:6px 10px; font-size:11px; cursor:pointer; flex-shrink:0;">Restock</button>`
        : '';

      const kategoriBadge = item.kategori === 'func-border'
        ? '<span style="font-size:9px; padding:1px 6px; border-radius:8px; background:rgba(0,229,192,0.15); color:#00e5c0; margin-left:4px;">Border</span>'
        : item.kategori === 'func-background'
        ? '<span style="font-size:9px; padding:1px 6px; border-radius:8px; background:rgba(0,229,192,0.15); color:#00e5c0; margin-left:4px;">Background</span>'
        : '';

      return `
      <div style="display:flex; align-items:center; gap:10px; padding:10px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:8px;">
        <div style="width:36px; height:36px; border-radius:8px; overflow:hidden; background:rgba(255,255,255,0.06); display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0;">
          ${item.icon ? `<img src="${item.icon}" style="width:100%; height:100%; object-fit:cover;">` : '🎁'}
        </div>
        <div style="flex:1; min-width:0;">
          <div style="font-size:12px; color:#fff; font-weight:600;">${saEscHtml(item.nama)}${kategoriBadge}</div>
          <div style="font-size:11px; color:#ffd23f;">${item.koinType === 'event' ? '🎉' : '🪙'} ${item.harga}${item.koinType === 'event' ? ' <span style="color:#ff5aa0;">(event)</span>' : ''}${stokInfo}</div>
        </div>
        ${restockBtn}
        <button onclick="saDeleteShopItem('${item.id}')" style="background:rgba(255,90,160,0.15); border:1px solid rgba(255,90,160,0.3); color:#ff5aa0; border-radius:6px; padding:6px 10px; font-size:11px; cursor:pointer; flex-shrink:0;">Hapus</button>
      </div>
    `;
    }).join('');
  } catch (err) {
    console.error('Gagal memuat daftar item shop:', err);
    listEl.innerHTML = '<p style="color:#ff6b6b; font-size:12px; text-align:center; padding:20px;">⚠️ Gagal memuat item.</p>';
  }
}

async function saDeleteShopItem(itemId) {
  if (!confirm('Hapus item ini dari shop?')) return;
  try {
    const adminToken = saGetAdminToken();
    const res = await fetch('/api/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove-item', adminToken, itemId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menghapus item');
    saLoadShopList();
  } catch (err) {
    console.error('Gagal menghapus item shop:', err);
    alert('Gagal menghapus item.');
  }
}

async function saRestockItem(itemId) {
  const tambahan = prompt('Tambah berapa stok?');
  if (!tambahan) return;
  const tambahanNum = parseInt(tambahan, 10);
  if (isNaN(tambahanNum) || tambahanNum < 1) {
    alert('Masukkan angka lebih dari 0.');
    return;
  }

  try {
    const adminToken = saGetAdminToken();
    const res = await fetch('/api/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restock-item', adminToken, itemId, tambahan: tambahanNum }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal restock item');
    saLoadShopList();
  } catch (err) {
    console.error('Gagal restock item:', err);
    alert('Gagal restock item: ' + (err.message || err));
  }
}

// ═══ SUB-TAB SWITCHER: Item vs Redeem (di dalam tab Shop) ═══
function saSwitchShopSubtab(subtab) {
  const subs = { item: 'sa-shopsub-item', redeem: 'sa-shopsub-redeem' };
  const tabs = { item: 'sa-subtab-shopitem', redeem: 'sa-subtab-redeem' };

  Object.entries(subs).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = key === subtab ? 'block' : 'none';
  });
  Object.entries(tabs).forEach(([key, id]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    if (key === subtab) {
      btn.style.background = 'rgba(255,210,63,0.15)';
      btn.style.border = '1px solid rgba(255,210,63,0.4)';
      btn.style.color = '#ffd23f';
    } else {
      btn.style.background = 'rgba(255,210,63,0.1)';
      btn.style.border = '1px solid rgba(255,210,63,0.25)';
      btn.style.color = '#cbd5e0';
    }
  });

  if (subtab === 'redeem') {
    saPopulateRedeemDropdowns();
    saLoadRedeemList();
  }
}

// Isi dropdown event & item untuk form buat kode redeem
async function saPopulateRedeemDropdowns() {
  const eventSelect = document.getElementById('sa-redeem-event-select');
  const itemSelect = document.getElementById('sa-redeem-item-select');

  try {
    const { db } = await saGetEventFirebase();
    const { ref, get } = window._eventDbFns;
    const snap = await get(ref(db, 'events'));
    const data = snap.val();

    eventSelect.innerHTML = '<option value="">— Pilih event (kalau isi koin event) —</option>';
    if (data) {
      const now = Date.now();
      Object.values(data).filter(ev => !ev.expiresAt || ev.expiresAt >= now).forEach(ev => {
        const opt = document.createElement('option');
        opt.value = ev.id;
        opt.textContent = ev.title;
        eventSelect.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('Gagal memuat event untuk dropdown redeem:', err);
  }

  try {
    const res = await fetch('/api/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list-items' }),
    });
    const data = await res.json();
    itemSelect.innerHTML = '<option value="">— Reward item (opsional) —</option>';
    (data.items || []).forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = item.nama;
      itemSelect.appendChild(opt);
    });
  } catch (err) {
    console.error('Gagal memuat item untuk dropdown redeem:', err);
  }
}

async function saCreateRedeemCode() {
  const koinGlobal = parseInt(document.getElementById('sa-redeem-koin-global').value, 10) || 0;
  const koinEvent = parseInt(document.getElementById('sa-redeem-koin-event').value, 10) || 0;
  const eventId = document.getElementById('sa-redeem-event-select').value;
  const itemId = document.getElementById('sa-redeem-item-select').value;
  const statusEl = document.getElementById('sa-redeem-status');
  const btn = document.getElementById('sa-redeem-submit-btn');

  if (koinGlobal <= 0 && koinEvent <= 0 && !itemId) {
    statusEl.textContent = '⚠️ Isi minimal 1 jenis reward.';
    statusEl.style.color = '#ff6b6b';
    return;
  }
  if (koinEvent > 0 && !eventId) {
    statusEl.textContent = '⚠️ Pilih event dulu untuk reward koin event.';
    statusEl.style.color = '#ff6b6b';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Membuat...';
  statusEl.style.color = '#718096';

  try {
    const adminToken = saGetAdminToken();
    const res = await fetch('/api/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create-redeem-code',
        adminToken,
        rewardKoinGlobal: koinGlobal,
        rewardKoinEvent: koinEvent,
        rewardEventId: koinEvent > 0 ? eventId : undefined,
        rewardItemId: itemId || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal membuat kode');

    statusEl.textContent = `✅ Kode dibuat: ${data.redeem.code}`;
    statusEl.style.color = '#00e5c0';
    document.getElementById('sa-redeem-koin-global').value = '';
    document.getElementById('sa-redeem-koin-event').value = '';
    document.getElementById('sa-redeem-event-select').value = '';
    document.getElementById('sa-redeem-item-select').value = '';
    saLoadRedeemList();
  } catch (err) {
    console.error('Gagal membuat kode redeem:', err);
    statusEl.textContent = `❌ Gagal: ${err.message || err}`;
    statusEl.style.color = '#ff6b6b';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Buat Kode';
  }
}

async function saLoadRedeemList() {
  const listEl = document.getElementById('sa-redeem-list');
  if (!listEl) return;

  try {
    const adminToken = saGetAdminToken();
    const res = await fetch('/api/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list-redeem-codes', adminToken }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal memuat kode');

    const codes = data.codes || [];
    if (codes.length === 0) {
      listEl.innerHTML = '<p style="color:#718096; font-size:12px; text-align:center; padding:20px;">Belum ada kode redeem.</p>';
      return;
    }

    listEl.innerHTML = codes.reverse().map(r => {
      const rewardParts = [];
      if (r.rewardKoinGlobal > 0) rewardParts.push(`🪙${r.rewardKoinGlobal}`);
      if (r.rewardKoinEvent > 0) rewardParts.push(`🎉${r.rewardKoinEvent}`);
      if (r.rewardItemId) rewardParts.push('🎁item');
      const rewardText = rewardParts.join(' + ') || '—';

      return `
      <div style="display:flex; align-items:center; gap:10px; padding:10px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:8px; ${!r.active ? 'opacity:0.5;' : ''}">
        <div style="flex:1; min-width:0;">
          <div style="font-size:12px; color:#fff; font-weight:700; font-family:monospace;">${saEscHtml(r.code)}</div>
          <div style="font-size:11px; color:#ffd23f;">${rewardText}${!r.active ? ' <span style="color:#ff5aa0;">(nonaktif)</span>' : ''}</div>
        </div>
        ${r.active ? `<button onclick="saDeleteRedeemCode('${r.code}')" style="background:rgba(255,90,160,0.15); border:1px solid rgba(255,90,160,0.3); color:#ff5aa0; border-radius:6px; padding:6px 10px; font-size:11px; cursor:pointer; flex-shrink:0;">Nonaktifkan</button>` : ''}
      </div>
    `;
    }).join('');
  } catch (err) {
    console.error('Gagal memuat daftar kode redeem:', err);
    listEl.innerHTML = '<p style="color:#ff6b6b; font-size:12px; text-align:center; padding:20px;">⚠️ Gagal memuat kode.</p>';
  }
}

async function saDeleteRedeemCode(code) {
  if (!confirm(`Nonaktifkan kode ${code}? Kode ini tidak akan bisa dipakai lagi.`)) return;
  try {
    const adminToken = saGetAdminToken();
    const res = await fetch('/api/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete-redeem-code', adminToken, code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menonaktifkan kode');
    saLoadRedeemList();
  } catch (err) {
    console.error('Gagal menonaktifkan kode redeem:', err);
    alert('Gagal menonaktifkan kode: ' + (err.message || err));
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
    const safeMemberId = (m.memberId || '').replace(/'/g, "\\'");

    const rankColors = {
      newbie: '#a0aec0', beginner: '#00c2ff', junior: '#00e5c0', senior: '#7b5cff',
      master: '#ff8f5a', grandmaster: '#ffd23f', influencer: '#ff5aa0', cheater: '#ff3b3b',
      collaborator: '#ffd23f', eksklusif: '#00c2ff', winner: '#ff3b3b', creator: '#ff5aa0',
    };
    const rankColor = rankColors[m.rankId] || '#a0aec0';
    const rankBadge = `<span style="font-size:10px; padding:2px 8px; border-radius:10px; background:${rankColor}22; color:${rankColor}; font-weight:600;">${saEscHtml(m.rank || 'Newbie')}</span>`;

    const rankBtn = m.exclusiveRank
      ? `<button onclick="saClearExclusiveRank('${safeMemberId}','${saEscHtml(m.nama || m.username)}')" style="flex:1; padding:7px; background:rgba(255,90,160,0.15); border:1px solid rgba(255,90,160,0.4); border-radius:6px; color:#ff5aa0; font-size:11px; font-weight:600; cursor:pointer;">🎖️ Cabut Rank</button>`
      : `<button onclick="saOpenGiftRank('${safeMemberId}','${saEscHtml(m.nama || m.username)}')" style="flex:1; padding:7px; background:rgba(255,210,63,0.15); border:1px solid rgba(255,210,63,0.4); border-radius:6px; color:#ffd23f; font-size:11px; font-weight:600; cursor:pointer;">🎖️ Gift Rank</button>`;

    return `
      <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:12px;">
        <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:6px;">
          <div>
            <div style="font-size:14px; font-weight:600; color:#fff;">${saEscHtml(m.nama || '(tanpa nama)')}</div>
            <div style="font-size:11px; color:#a0aec0;">@${saEscHtml(m.username || '-')} · ${saEscHtml(m.memberId || '-')}</div>
            <div style="margin-top:4px;">${rankBadge}</div>
          </div>
          <span style="font-size:10px; padding:3px 8px; border-radius:12px; background:${statusColor}22; color:${statusColor}; font-weight:600; flex-shrink:0;">${statusText}</span>
        </div>
        ${m.banned && m.banReason ? `<div style="font-size:11px; color:#ff9b9b; margin-bottom:8px;">Alasan: ${saEscHtml(m.banReason)}</div>` : ''}
        <div style="display:flex; gap:6px; margin-top:8px;">
          ${m.banned
            ? `<button onclick="saUnbanMember('${safeUsername}')" style="flex:1; padding:7px; background:rgba(0,229,197,0.15); border:1px solid rgba(0,229,197,0.4); border-radius:6px; color:#00e5c0; font-size:11px; font-weight:600; cursor:pointer;">✅ Unban</button>`
            : `<button onclick="saBanMember('${safeUsername}')" style="flex:1; padding:7px; background:rgba(255,107,107,0.15); border:1px solid rgba(255,107,107,0.4); border-radius:6px; color:#ff6b6b; font-size:11px; font-weight:600; cursor:pointer;">🚫 Ban</button>`
          }
          ${rankBtn}
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

async function saOpenGiftRank(memberId, displayName) {
  const options = [
    '1 = Collaborator (kuning-hijau, kolaborasi dengan I.O.E)',
    '2 = Eksklusif (biru, top-up rutin)',
    '3 = Winner (merah, menang challenge admin)',
    '4 = Creator (pelangi, pemilik website)',
  ].join('\n');
  const choice = prompt(`Gift rank eksklusif untuk "${displayName}":\n\n${options}\n\nMasukkan angka 1-4:`, '');
  if (choice === null) return; // cancel

  const map = { '1': 'collaborator', '2': 'eksklusif', '3': 'winner', '4': 'creator' };
  const exclusiveRankId = map[choice.trim()];
  if (!exclusiveRankId) {
    alert('Pilihan tidak valid. Masukkan angka 1-4.');
    return;
  }

  const token = saGetAdminToken();
  if (!token) return;

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set-exclusive-rank', adminToken: token, memberId, exclusiveRankId }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Gagal memberikan rank');
    saLoadAllMembers();
  } catch (e) {
    alert('Gagal memberikan rank: ' + e.message);
  }
}

async function saClearExclusiveRank(memberId, displayName) {
  if (!confirm(`Cabut rank eksklusif dari "${displayName}"? Rank akan kembali dihitung otomatis dari total like.`)) return;

  const token = saGetAdminToken();
  if (!token) return;

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear-exclusive-rank', adminToken: token, memberId }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Gagal mencabut rank');
    saLoadAllMembers();
  } catch (e) {
    alert('Gagal mencabut rank: ' + e.message);
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

// ═══ TRIAL ADMIN PANEL (popup, read-only, cuma statistik) ═══
function openTrialAdminPanel() {
  if (document.getElementById('ioe-trial-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'ioe-trial-overlay';
  overlay.style.cssText = `
    position: fixed; top:0; left:0; right:0; bottom:0;
    background: rgba(0,0,0,0.75); z-index: 99999;
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
  `;
  overlay.onclick = (e) => { if (e.target === overlay) closeTrialAdminPanel(); };

  const box = document.createElement('div');
  box.style.cssText = `
    background: linear-gradient(135deg, #1a1f3a 0%, #150f1e 100%);
    border: 1px solid rgba(123,92,255,0.3);
    border-radius: 16px; padding: 24px; max-width: 420px; width: 100%;
    max-height: 85vh; overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0,0,0,0.8); color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  box.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <h2 style="font-size:17px; color:#7b5cff;">📊 Trial Admin Panel</h2>
      <button onclick="closeTrialAdminPanel()" style="background:rgba(255,255,255,0.1); border:none; color:#fff; width:32px; height:32px; border-radius:50%; cursor:pointer; font-size:16px; flex-shrink:0;">✕</button>
    </div>
    <p style="font-size:11px; color:#718096; margin-bottom:16px;">Akses baca-saja — statistik I.O.E Hub</p>
    <div id="ta-stats-content">
      <p style="color:#718096; font-size:12px; text-align:center; padding:20px;">Memuat statistik...</p>
    </div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  taLoadStats();
}

function closeTrialAdminPanel() {
  document.getElementById('ioe-trial-overlay')?.remove();
}

function taGetSessionToken() {
  try {
    const sess = localStorage.getItem('ioe_trial_admin_session');
    if (!sess) return null;
    const parsed = JSON.parse(sess);
    if (parsed.expiresAt <= Date.now()) {
      localStorage.removeItem('ioe_trial_admin_session');
      return null;
    }
    return parsed.sessionToken;
  } catch (e) {
    return null;
  }
}

async function taLoadStats() {
  const token = taGetSessionToken();
  const contentEl = document.getElementById('ta-stats-content');
  if (!token) {
    contentEl.innerHTML = '<p style="color:#ff6b6b; font-size:12px; text-align:center; padding:20px;">Sesi tidak valid atau sudah kedaluwarsa</p>';
    return;
  }

  try {
    // Verifikasi sesi trial dulu
    const verifyRes = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify-trial-session', sessionToken: token }),
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.valid) {
      contentEl.innerHTML = '<p style="color:#ff6b6b; font-size:12px; text-align:center; padding:20px;">Sesi sudah kedaluwarsa. Silakan login ulang.</p>';
      localStorage.removeItem('ioe_trial_admin_session');
      return;
    }

    // Ambil statistik — pakai session token trial sebagai adminToken
    // (member-list.js sekarang perlu terima trial session juga, lihat catatan di bawah)
    const statsRes = await fetch('/api/member-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stats', adminToken: token }),
    });
    const statsData = await statsRes.json();

    if (statsData.success) {
      contentEl.innerHTML = `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div style="background:rgba(123,92,255,0.1); border:1px solid rgba(123,92,255,0.25); border-radius:10px; padding:14px; text-align:center;">
            <div style="font-size:24px; font-weight:700; color:#7b5cff;">${statsData.totalMembers}</div>
            <div style="font-size:11px; color:#a0aec0; margin-top:4px;">Total Member</div>
          </div>
          <div style="background:rgba(0,229,197,0.1); border:1px solid rgba(0,229,197,0.25); border-radius:10px; padding:14px; text-align:center;">
            <div style="font-size:24px; font-weight:700; color:#00e5c0;">${statsData.totalActive}</div>
            <div style="font-size:11px; color:#a0aec0; margin-top:4px;">Member Aktif</div>
          </div>
          <div style="background:rgba(255,107,107,0.1); border:1px solid rgba(255,107,107,0.25); border-radius:10px; padding:14px; text-align:center; grid-column: span 2;">
            <div style="font-size:24px; font-weight:700; color:#ff6b6b;">${statsData.totalBanned}</div>
            <div style="font-size:11px; color:#a0aec0; margin-top:4px;">Member Diblokir</div>
          </div>
        </div>
      `;
    } else {
      contentEl.innerHTML = `<p style="color:#ff6b6b; font-size:12px; text-align:center; padding:20px;">${statsData.error || 'Gagal memuat statistik'}</p>`;
    }
  } catch (e) {
    contentEl.innerHTML = '<p style="color:#ff6b6b; font-size:12px; text-align:center; padding:20px;">Gagal terhubung ke server</p>';
  }
}

async function saLoadTosThreads() {
  const token = saGetAdminToken();
  const listEl = document.getElementById('sa-tos-list');
  if (!token) return;

  try {
    const res = await fetch('/api/tos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list-threads', adminToken: token }),
    });
    const data = await res.json();

    if (!data.success) {
      listEl.innerHTML = `<p style="color:#ff6b6b; font-size:12px; text-align:center; padding:20px;">${saEscHtml(data.error || 'Gagal memuat')}</p>`;
      return;
    }
    if (data.threads.length === 0) {
      listEl.innerHTML = '<p style="color:#718096; font-size:12px; text-align:center; padding:20px;">Belum ada pesan ToS masuk</p>';
      return;
    }

    listEl.innerHTML = data.threads.map(t => {
      const escalatedBadge = t.escalated ? '<span style="font-size:9px; padding:2px 6px; border-radius:10px; background:#ff640022; color:#ff6400; font-weight:600; margin-left:6px;">BANDING</span>' : '';
      const date = t.lastMessageAt ? new Date(t.lastMessageAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '';
      const safeMemberId = t.memberId.replace(/'/g, "\\'");
      return `
        <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:12px; cursor:pointer;" onclick="saOpenTosThread('${safeMemberId}')">
          <div style="display:flex; justify-content:space-between; align-items:start;">
            <div>
              <div style="font-size:13px; font-weight:600; color:#fff;">${saEscHtml(t.nama)}${escalatedBadge}</div>
              <div style="font-size:11px; color:#a0aec0;">@${saEscHtml(t.username)} · ${t.messageCount} pesan</div>
            </div>
          </div>
          <div style="font-size:12px; color:#cbd5e0; margin-top:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${saEscHtml(t.lastMessage)}</div>
          <div style="font-size:10px; color:#718096; margin-top:4px;">${date}</div>
        </div>
      `;
    }).join('');
  } catch (e) {
    listEl.innerHTML = '<p style="color:#ff6b6b; font-size:12px; text-align:center; padding:20px;">Gagal terhubung ke server</p>';
  }
}

async function saOpenTosThread(memberId) {
  const token = saGetAdminToken();
  if (!token) return;

  try {
    const res = await fetch('/api/tos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get-thread', memberId, adminToken: token }),
    });
    const data = await res.json();
    if (!data.success) { alert('Gagal memuat percakapan'); return; }

    const senderLabel = { member: 'Member', ai: 'AI', admin: 'Superadmin', system: 'Sistem' };
    const historyText = data.thread.map(m => `[${senderLabel[m.sender] || m.sender}] ${m.text}`).join('\n\n');

    const reply = prompt(`Riwayat percakapan:\n\n${historyText}\n\n— — —\nKetik balasan sebagai Superadmin (kosongkan untuk batal):`, '');
    if (!reply || !reply.trim()) return;

    const sendRes = await fetch('/api/tos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'admin-reply', memberId, text: reply.trim(), adminToken: token }),
    });
    const sendData = await sendRes.json();
    if (sendData.success) {
      alert('Balasan terkirim');
      saLoadTosThreads();
    } else {
      alert('Gagal mengirim balasan: ' + (sendData.error || 'Unknown error'));
    }
  } catch (e) {
    alert('Gagal terhubung ke server');
  }
}

// Enter key di search box langsung trigger pencarian
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.activeElement?.id === 'sa-search-input') {
    saSearchMembers();
  }
});
