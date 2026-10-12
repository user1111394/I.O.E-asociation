/* ═══════════════════════════════════════════════
   I.O.E HUB — SUPERADMIN / shop.js
   Tab Shop: item, stok, sub-tab Item/Redeem/Gacha
   Dimuat otomatis oleh js/nav.js (lazy-load) saat panel admin pertama kali dibuka.
   Script klasik (bukan ES module): fungsi & variabel tetap global, jadi onclick="..." di HTML tetap jalan.
═══════════════════════════════════════════════ */

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
  const subs = { item: 'sa-shopsub-item', redeem: 'sa-shopsub-redeem', gacha: 'sa-shopsub-gacha' };
  const tabs = { item: 'sa-subtab-shopitem', redeem: 'sa-subtab-redeem', gacha: 'sa-subtab-gacha' };

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
  if (subtab === 'gacha') {
    saLoadGachaConfig();
  }
}
