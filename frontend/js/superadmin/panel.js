/* ═══════════════════════════════════════════════
   I.O.E HUB — SUPERADMIN / panel.js
   Kerangka panel superadmin: buka/tutup popup, token admin, tab Statistik, pindah tab, escape HTML
   Dimuat otomatis oleh js/nav.js (lazy-load) saat panel admin pertama kali dibuka.
   Script klasik (bukan ES module): fungsi & variabel tetap global, jadi onclick="..." di HTML tetap jalan.
═══════════════════════════════════════════════ */

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
      <button id="sa-tab-pojokbaca" onclick="saSwitchTab('pojokbaca')" style="flex:1; padding:9px 4px; background:rgba(123,197,255,0.1); border:1px solid rgba(123,197,255,0.25); border-radius:8px; color:#cbd5e0; font-size:11px; font-weight:600; cursor:pointer;">📖 Pojok Baca</button>
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
          <option value="seed">Seed Coin (Wild Harvest / Garden)</option>
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
        <button id="sa-subtab-gacha" onclick="saSwitchShopSubtab('gacha')" style="flex:1; padding:7px 4px; background:rgba(255,210,63,0.1); border:1px solid rgba(255,210,63,0.25); border-radius:8px; color:#cbd5e0; font-size:11px; font-weight:600; cursor:pointer;">🎰 Gacha</button>
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

      <div id="sa-shopsub-gacha" style="display:none;">
        <div style="font-size:13px; font-weight:600; color:#cbd5e0; margin-bottom:10px;">⚙️ Atur Gacha Spin Wheel</div>
        <p style="font-size:11px; color:#718096; margin-bottom:12px; line-height:1.5;">Atur daftar hadiah, nominal, dan persentase peluang tiap slot. Total persentase semua slot HARUS 100%. Simpan akan mengganti seluruh config sekaligus.</p>

        <label style="display:block; font-size:11px; color:#718096; margin-bottom:6px;">Biaya sekali spin (Koin Global)</label>
        <input id="sa-gacha-spincost" type="number" min="0" placeholder="Contoh: 50" style="width:100%; padding:10px 12px; margin-bottom:14px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,210,63,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">

        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="font-size:12px; font-weight:600; color:#cbd5e0;">Daftar Slot Hadiah</div>
          <div id="sa-gacha-total-pct" style="font-size:11px; font-weight:700;">Total: 0%</div>
        </div>
        <div id="sa-gacha-slot-list" style="display:flex; flex-direction:column; gap:10px; margin-bottom:10px;"></div>
        <button type="button" onclick="saAddGachaSlotRow()" style="width:100%; padding:9px; background:rgba(255,210,63,0.12); border:1px solid rgba(255,210,63,0.3); color:#ffd23f; border-radius:8px; font-weight:600; font-size:12px; cursor:pointer; margin-bottom:12px;">+ Tambah Slot</button>

        <button onclick="saSaveGachaConfig()" id="sa-gacha-save-btn" style="width:100%; padding:11px; background:linear-gradient(90deg,#ffd23f,#ff5aa0); border:none; border-radius:8px; color:#1a1a1a; font-weight:700; font-size:13px; cursor:pointer;">Simpan Config Gacha</button>
        <div id="sa-gacha-status" style="font-size:11px; color:#718096; margin-top:8px;"></div>
      </div>
    </div>

    <div id="sa-panel-pojokbaca" style="display:none;">
      <div style="font-size:13px; font-weight:600; color:#cbd5e0; margin-bottom:10px;">👤 Daftar Izin Baca</div>
      <p style="font-size:11px; color:#718096; margin-bottom:10px; line-height:1.5;">Hanya member yang memberId-nya ada di daftar ini yang bisa membuka Pojok Baca. Cari pakai username member.</p>
      <div style="display:flex; gap:8px; margin-bottom:8px;">
        <input id="sa-pojokbaca-username" type="text" placeholder="Username member" style="flex:1; padding:10px 12px; background:rgba(255,255,255,0.05); border:1px solid rgba(123,197,255,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">
        <button onclick="saAddPojokbacaAccess()" id="sa-pojokbaca-add-btn" style="padding:10px 16px; background:linear-gradient(90deg,#7bc5ff,#7b5cff); border:none; border-radius:8px; color:#0a0a0a; font-weight:700; font-size:13px; cursor:pointer; white-space:nowrap;">Izinkan</button>
      </div>
      <div id="sa-pojokbaca-add-status" style="font-size:11px; color:#718096; margin-bottom:14px;"></div>

      <div id="sa-pojokbaca-access-list" style="display:flex; flex-direction:column; gap:8px; margin-bottom:20px;">
        <p style="color:#718096; font-size:12px; text-align:center; padding:20px;">Memuat daftar izin...</p>
      </div>

      <div style="padding-top:14px; border-top:1px solid rgba(255,255,255,0.1);">
        <div style="font-size:13px; font-weight:600; color:#cbd5e0; margin-bottom:10px;">📖 Novel</div>

        <label style="display:block; font-size:11px; color:#718096; margin-bottom:6px;">Cover novel</label>
        <input id="sa-pojokbaca-cover-input" type="file" accept="image/*" style="width:100%; margin-bottom:8px; font-size:12px; color:#cbd5e0;">
        <div id="sa-pojokbaca-cover-preview" style="margin-bottom:10px;"></div>

        <input id="sa-pojokbaca-title" type="text" placeholder="Judul novel" style="width:100%; padding:10px 12px; margin-bottom:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(123,197,255,0.25); border-radius:8px; color:#fff; font-size:13px; box-sizing:border-box;">

        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="font-size:12px; font-weight:600; color:#cbd5e0;">Daftar Bab</div>
        </div>
        <div id="sa-pojokbaca-chapter-list" style="display:flex; flex-direction:column; gap:10px; margin-bottom:10px;"></div>
        <button type="button" onclick="saAddPojokbacaChapterRow()" style="width:100%; padding:9px; background:rgba(123,197,255,0.12); border:1px solid rgba(123,197,255,0.3); color:#7bc5ff; border-radius:8px; font-weight:600; font-size:12px; cursor:pointer; margin-bottom:12px;">+ Tambah Bab</button>

        <button onclick="saSaveNovel()" id="sa-pojokbaca-save-btn" style="width:100%; padding:11px; background:linear-gradient(90deg,#7bc5ff,#7b5cff); border:none; border-radius:8px; color:#0a0a0a; font-weight:700; font-size:13px; cursor:pointer;">Simpan Novel</button>
        <div id="sa-pojokbaca-save-status" style="font-size:11px; color:#718096; margin-top:8px;"></div>
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
  const panels = { stats: 'sa-panel-stats', member: 'sa-panel-member', tos: 'sa-panel-tos', event: 'sa-panel-event', shop: 'sa-panel-shop', pojokbaca: 'sa-panel-pojokbaca' };
  const tabs = { stats: 'sa-tab-stats', member: 'sa-tab-member', tos: 'sa-tab-tos', event: 'sa-tab-event', shop: 'sa-tab-shop', pojokbaca: 'sa-tab-pojokbaca' };
  const activeColors = {
    stats: { bg: 'rgba(123,92,255,0.15)', border: 'rgba(123,92,255,0.4)', color: '#7b5cff' },
    member: { bg: 'rgba(0,229,197,0.15)', border: 'rgba(0,229,197,0.4)', color: '#00e5c0' },
    tos: { bg: 'rgba(255,180,0,0.15)', border: 'rgba(255,180,0,0.4)', color: '#ffb400' },
    event: { bg: 'rgba(255,90,160,0.15)', border: 'rgba(255,90,160,0.4)', color: '#ff5aa0' },
    shop: { bg: 'rgba(255,210,63,0.15)', border: 'rgba(255,210,63,0.4)', color: '#ffd23f' },
    pojokbaca: { bg: 'rgba(123,197,255,0.15)', border: 'rgba(123,197,255,0.4)', color: '#7bc5ff' },
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
  if (tab === 'pojokbaca') { saLoadPojokbacaAccessList(); saLoadPojokbacaNovel(); }
}


function saEscHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
