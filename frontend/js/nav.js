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
  { href:'pojokbaca.html',   icon:'📖', label:'Pojok Baca',     section:'Komunitas' },
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

// ═══ LOADER PANEL ADMIN (lazy-load) ═══
// Kode panel superadmin dipecah ke js/superadmin/*.js dan BARU diunduh saat
// openSuperadminPanel() / openTrialAdminPanel() pertama kali dipanggil, jadi member
// biasa tidak ikut mengunduh ±130 KB kode admin di setiap halaman.
// Urutan di IOE_SA_MODULES = urutan asli di nav.js lama. Naikkan IOE_ADMIN_VER
// setiap kali isi modul diubah supaya cache browser tidak memakai versi lama.
const IOE_ADMIN_VER = '2';
const IOE_SA_MODULES = ['panel', 'firebase', 'event', 'event-review', 'event-coin', 'broadcast', 'shop', 'gacha', 'redeem', 'member', 'pojokbaca', 'trial', 'tos'];
const IOE_ADMIN_BASE = (document.currentScript && document.currentScript.src)
  ? new URL('superadmin/', document.currentScript.src).href
  : 'js/superadmin/';
let _ioeAdminLoading = null;

function ioeLoadAdminModules() {
  if (_ioeAdminLoading) return _ioeAdminLoading;
  _ioeAdminLoading = Promise.all(IOE_SA_MODULES.map(name => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${IOE_ADMIN_BASE}${name}.js?v=${IOE_ADMIN_VER}`;
    s.async = false; // eksekusi tetap berurutan walau diunduh paralel
    s.onload = resolve;
    s.onerror = () => reject(new Error('Gagal memuat ' + name + '.js'));
    document.head.appendChild(s);
  }))).catch(err => {
    _ioeAdminLoading = null; // izinkan coba lagi setelah gagal
    throw err;
  });
  return _ioeAdminLoading;
}

// Stub: modul asli (di js/superadmin/panel.js & trial.js) menimpa fungsi bernama sama ini
// setelah dimuat. Properti _isStub dipakai untuk mendeteksi kalau penimpaan gagal.
async function _ioeOpenAdmin(name) {
  try {
    await ioeLoadAdminModules();
  } catch (err) {
    console.error('Panel admin gagal dimuat:', err);
    alert('Gagal memuat panel admin. Cek koneksi lalu coba lagi.');
    return;
  }
  const fn = window[name];
  if (typeof fn !== 'function' || fn._isStub) {
    alert('Panel admin gagal dimuat (fungsi ' + name + ' tidak ditemukan).');
    return;
  }
  return fn();
}
function openSuperadminPanel() { return _ioeOpenAdmin('openSuperadminPanel'); }
openSuperadminPanel._isStub = true;
function openTrialAdminPanel() { return _ioeOpenAdmin('openTrialAdminPanel'); }
openTrialAdminPanel._isStub = true;
