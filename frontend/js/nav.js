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
      </div>

      <div id="sa-eventsub-acara">
        <div style="font-size:13px; font-weight:600; color:#cbd5e0; margin-bottom:10px;">Buat Event Baru</div>
        <input id="sa-event-title" type="text" placeholder="Judul event" style="width:100%; padding:10px 12px; margin-bottom:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">
        <textarea id="sa-event-desc" placeholder="Deskripsi event" rows="3" style="width:100%; padding:10px 12px; margin-bottom:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box; resize:vertical; font-family:inherit;"></textarea>
        <div style="display:flex; gap:8px; margin-bottom:8px;">
          <input id="sa-event-days" type="number" min="1" placeholder="Berapa hari tayang" style="flex:1; padding:10px 12px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">
        </div>
        <label style="display:block; font-size:11px; color:#718096; margin-bottom:6px;">Upload file challenge (harus .html — file ini akan dijalankan langsung di halaman event)</label>
        <input id="sa-event-files" type="file" accept=".html" style="width:100%; margin-bottom:10px; font-size:12px; color:#cbd5e0;">
        <div id="sa-event-upload-status" style="font-size:11px; color:#718096; margin-bottom:10px;"></div>
        <button onclick="saCreateEvent()" id="sa-event-submit-btn" style="width:100%; padding:11px; background:linear-gradient(90deg,#ff5aa0,#7b5cff); border:none; border-radius:8px; color:#fff; font-weight:700; font-size:13px; cursor:pointer;">Publikasikan Event</button>

        <div style="margin-top:18px; padding-top:14px; border-top:1px solid rgba(255,255,255,0.1);">
          <div style="font-size:13px; font-weight:600; color:#cbd5e0; margin-bottom:10px;">Event Aktif</div>
          <div id="sa-event-list" style="display:flex; flex-direction:column; gap:8px;">
            <p style="color:#718096; font-size:12px; text-align:center; padding:20px;">Memuat daftar event...</p>
          </div>
        </div>
      </div>

      <div id="sa-eventsub-koin" style="display:none;">
        <div style="font-size:13px; font-weight:600; color:#cbd5e0; margin-bottom:10px;">Kasih Koin Event ke Member</div>
        <select id="sa-coin-event-select" style="width:100%; padding:10px 12px; margin-bottom:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">
          <option value="">Pilih event...</option>
        </select>
        <input id="sa-coin-member-id" type="text" placeholder="Member ID (contoh: IOE-PCYCM7N)" style="width:100%; padding:10px 12px; margin-bottom:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">
        <input id="sa-coin-amount" type="number" min="1" placeholder="Jumlah koin" style="width:100%; padding:10px 12px; margin-bottom:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">
        <button onclick="saGrantEventCoin()" id="sa-coin-submit-btn" style="width:100%; padding:11px; background:linear-gradient(90deg,#ff5aa0,#7b5cff); border:none; border-radius:8px; color:#fff; font-weight:700; font-size:13px; cursor:pointer;">Kirim Koin</button>
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
        <p style="font-size:11px; color:#718096; margin-bottom:10px;">Pesan singkat muncul sebagai notifikasi sementara ke semua member yang sedang membuka halaman utama. Otomatis hilang, tidak tersimpan riwayat.</p>
        <input id="sa-broadcast-message" type="text" maxlength="150" placeholder="Ketik pesan broadcast..." style="width:100%; padding:10px 12px; margin-bottom:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">
        <button onclick="saSendBroadcast()" id="sa-broadcast-submit-btn" style="width:100%; padding:11px; background:linear-gradient(90deg,#ff5aa0,#7b5cff); border:none; border-radius:8px; color:#fff; font-weight:700; font-size:13px; cursor:pointer;">Kirim Broadcast</button>
        <div id="sa-broadcast-status" style="font-size:11px; color:#718096; margin-top:8px;"></div>
      </div>
    </div>

    <div id="sa-panel-stats" style="display:none;">
      <p style="color:#a0aec0; font-size:13px; line-height:1.6; text-align:center; padding:30px 10px;">
        📈 Tab Statistik Server sedang dalam pengembangan.<br>Akan menampilkan status performa & deteksi request spam.
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

  if (tab === 'tos') saLoadTosThreads();
  if (tab === 'event') saLoadEventList();
  if (tab === 'shop') saLoadShopList();
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

async function saCreateEvent() {
  const title = document.getElementById('sa-event-title').value.trim();
  const desc = document.getElementById('sa-event-desc').value.trim();
  const days = parseInt(document.getElementById('sa-event-days').value, 10);
  const filesInput = document.getElementById('sa-event-files');
  const statusEl = document.getElementById('sa-event-upload-status');
  const btn = document.getElementById('sa-event-submit-btn');

  const files = filesInput.files;

  if (!title || !days || days < 1) {
    statusEl.textContent = '⚠️ Judul dan jumlah hari wajib diisi.';
    statusEl.style.color = '#ff6b6b';
    return;
  }

  if (!files || files.length === 0) {
    statusEl.textContent = '⚠️ Upload 1 file challenge (.html) dulu.';
    statusEl.style.color = '#ff6b6b';
    return;
  }

  const file = files[0];
  if (!/\.html?$/i.test(file.name)) {
    statusEl.textContent = '⚠️ File harus berformat .html.';
    statusEl.style.color = '#ff6b6b';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Mengupload...';
  statusEl.style.color = '#718096';

  try {
    // Upload 1 file challenge (.html) lewat server kita (api/event-upload.js),
    // yang meneruskan ke Cloudinary (signed upload, aman karena API secret
    // disimpan di env var server, bukan di browser).
    const eventId = 'event_' + Date.now();

    // Helper: baca file jadi base64
    const readFileAsBase64 = (f) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]); // buang prefix "data:...;base64,"
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });

    statusEl.textContent = 'Upload file challenge...';
    const base64Data = await readFileAsBase64(file);
    const uploadRes = await fetch('/api/event-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: `${eventId}-${file.name}`,
        fileDataBase64: base64Data,
        contentType: 'text/html',
      }),
    });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) {
      throw new Error(uploadData.error || `HTTP ${uploadRes.status}`);
    }

    // Metadata event (judul, deskripsi, expired) tetap disimpan di Firebase — terpisah dari file-nya
    const { db } = await saGetEventFirebase();
    const { ref, set } = window._eventDbFns;

    const now = Date.now();
    const expiresAt = now + (days * 24 * 60 * 60 * 1000);

    await set(ref(db, `events/${eventId}`), {
      id: eventId,
      title, desc,
      challengeUrl: uploadData.url,
      challengeName: file.name,
      createdAt: now,
      expiresAt,
      days
    });

    statusEl.textContent = '✅ Event berhasil dipublikasikan!';
    statusEl.style.color = '#00e5c0';
    document.getElementById('sa-event-title').value = '';
    document.getElementById('sa-event-desc').value = '';
    document.getElementById('sa-event-days').value = '';
    filesInput.value = '';
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
      return `
        <div style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,90,160,0.2); border-radius:10px; padding:12px;">
          <div style="display:flex; justify-content:space-between; align-items:start; gap:8px;">
            <div style="font-size:13px; font-weight:600; color:#fff;">${ev.title}</div>
            <button onclick="saDeleteEvent('${ev.id}')" style="background:rgba(255,107,107,0.15); border:1px solid rgba(255,107,107,0.3); color:#ff6b6b; border-radius:6px; padding:4px 8px; font-size:10px; cursor:pointer; flex-shrink:0;">Hapus</button>
          </div>
          <div style="font-size:11px; color:#a0aec0; margin-top:4px;">${ev.desc || ''}</div>
          <div style="font-size:10px; color:#718096; margin-top:6px;">🎮 ${ev.challengeName || 'belum ada file'} · ⏳ ${daysLeft} hari lagi</div>
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
  if (!confirm('Hapus event ini sekarang?')) return;
  try {
    const { db } = await saGetEventFirebase();
    const { ref, remove } = window._eventDbFns;
    await remove(ref(db, `events/${eventId}`));
    saLoadEventList();
  } catch (err) {
    console.error('Gagal menghapus event:', err);
    alert('Gagal menghapus event.');
  }
}

// ═══ SUB-TAB SWITCHER: Acara / Koin / Broadcast (di dalam tab Event) ═══
function saSwitchEventSubtab(subtab) {
  const subs = { acara: 'sa-eventsub-acara', koin: 'sa-eventsub-koin', broadcast: 'sa-eventsub-broadcast' };
  const tabs = { acara: 'sa-subtab-acara', koin: 'sa-subtab-koin', broadcast: 'sa-subtab-broadcast' };

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

// Kirim koin event ke member tertentu — disimpan di Upstash Redis (bukan Firebase),
// konsisten dengan sistem koin global di shop.js. Key: eventcoin:{eventId}:{memberId}
async function saGrantEventCoin() {
  const eventId = document.getElementById('sa-coin-event-select').value;
  const memberId = document.getElementById('sa-coin-member-id').value.trim();
  const amount = parseInt(document.getElementById('sa-coin-amount').value, 10);
  const statusEl = document.getElementById('sa-coin-status');
  const btn = document.getElementById('sa-coin-submit-btn');

  if (!eventId) {
    statusEl.textContent = '⚠️ Pilih event dulu.';
    statusEl.style.color = '#ff6b6b';
    return;
  }
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

  btn.disabled = true;
  btn.textContent = 'Mengirim...';
  statusEl.style.color = '#718096';

  try {
    const adminToken = saGetAdminToken();
    const res = await fetch('/api/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'grant-event-coin', adminToken, eventId, memberId, amount }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengirim koin');

    statusEl.textContent = `✅ Berhasil kirim ${amount} koin. Saldo sekarang: ${data.coins}`;
    statusEl.style.color = '#00e5c0';
    document.getElementById('sa-coin-member-id').value = '';
    document.getElementById('sa-coin-amount').value = '';
  } catch (err) {
    console.error('Gagal kirim koin event:', err);
    statusEl.textContent = `❌ Gagal: ${err.message || err}`;
    statusEl.style.color = '#ff6b6b';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Kirim Koin';
  }
}

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

      return `
      <div style="display:flex; align-items:center; gap:10px; padding:10px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:8px;">
        <div style="width:36px; height:36px; border-radius:8px; overflow:hidden; background:rgba(255,255,255,0.06); display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0;">
          ${item.icon ? `<img src="${item.icon}" style="width:100%; height:100%; object-fit:cover;">` : '🎁'}
        </div>
        <div style="flex:1; min-width:0;">
          <div style="font-size:12px; color:#fff; font-weight:600;">${saEscHtml(item.nama)}</div>
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
