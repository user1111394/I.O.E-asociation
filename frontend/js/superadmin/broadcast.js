/* ═══════════════════════════════════════════════
   I.O.E HUB — SUPERADMIN / broadcast.js
   Broadcast toast + galeri musik/video untuk broadcast
   Dimuat otomatis oleh js/nav.js (lazy-load) saat panel admin pertama kali dibuka.
   Script klasik (bukan ES module): fungsi & variabel tetap global, jadi onclick="..." di HTML tetap jalan.
═══════════════════════════════════════════════ */

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
