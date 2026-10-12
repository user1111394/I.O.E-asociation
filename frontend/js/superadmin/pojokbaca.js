/* ═══════════════════════════════════════════════
   I.O.E HUB — SUPERADMIN / pojokbaca.js
   Tab Pojok Baca: daftar izin + banyak cerita (cover, judul, sinopsis, bab)
   Dimuat otomatis oleh js/nav.js (lazy-load) saat panel admin pertama kali dibuka.
   Script klasik (bukan ES module): fungsi & variabel tetap global, jadi onclick="..." di HTML tetap jalan.
═══════════════════════════════════════════════ */

// ═══ POJOK BACA (daftar izin + novel, numpang endpoint api/auth.js yang sudah ada,
// supaya tidak perlu menambah file API baru — folder api/ sudah pas di limit 12) ═══

async function saLoadPojokbacaAccessList() {
  const container = document.getElementById('sa-pojokbaca-access-list');
  const token = saGetAdminToken();
  if (!token || !container) return;

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list-pojokbaca-access', adminToken: token }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal memuat daftar izin');

    if (!data.members || data.members.length === 0) {
      container.innerHTML = '<p style="color:#718096; font-size:12px; text-align:center; padding:20px;">Belum ada member yang diizinkan.</p>';
      return;
    }

    container.innerHTML = data.members.map(m => `
      <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:10px 12px;">
        <div>
          <div style="font-size:13px; font-weight:600; color:#fff;">${saEscHtml(m.nama || m.username || '(tanpa nama)')}</div>
          <div style="font-size:11px; color:#718096;">@${saEscHtml(m.username || '-')}</div>
        </div>
        <button onclick="saRemovePojokbacaAccess('${saEscHtml(m.memberId)}')" style="padding:6px 12px; background:rgba(255,107,107,0.15); border:1px solid rgba(255,107,107,0.3); border-radius:6px; color:#ff6b6b; font-size:11px; font-weight:600; cursor:pointer;">Cabut</button>
      </div>
    `).join('');
  } catch (err) {
    console.error('Gagal memuat daftar izin Pojok Baca:', err);
    container.innerHTML = `<p style="color:#ff6b6b; font-size:12px; text-align:center; padding:20px;">${saEscHtml(err.message)}</p>`;
  }
}

async function saAddPojokbacaAccess() {
  const usernameInput = document.getElementById('sa-pojokbaca-username');
  const statusEl = document.getElementById('sa-pojokbaca-add-status');
  const btn = document.getElementById('sa-pojokbaca-add-btn');
  const username = usernameInput.value.trim();

  if (!username) {
    statusEl.textContent = '⚠️ Isi username dulu.';
    statusEl.style.color = '#ff6b6b';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Mencari...';
  statusEl.textContent = 'Mencari akun...';
  statusEl.style.color = '#718096';

  try {
    const adminToken = saGetAdminToken();

    // Cari memberId dari username dulu (endpoint pencarian member yang sudah ada)
    const searchRes = await fetch('/api/member-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'search', adminToken, query: username }),
    });
    const searchData = await searchRes.json();
    if (!searchRes.ok) throw new Error(searchData.error || 'Gagal mencari member');

    const found = (searchData.members || []).find(m => m.username?.toLowerCase() === username.toLowerCase());
    if (!found) throw new Error(`Member dengan username "${username}" tidak ditemukan`);

    statusEl.textContent = 'Menyimpan izin...';
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add-pojokbaca-access', adminToken, memberId: found.memberId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menambahkan izin');

    statusEl.textContent = data.alreadyExists ? 'ℹ️ Member ini sudah ada di daftar.' : '✅ Izin berhasil diberikan!';
    statusEl.style.color = data.alreadyExists ? '#ffb400' : '#00e5c0';
    usernameInput.value = '';
    saLoadPojokbacaAccessList();
  } catch (err) {
    console.error('Gagal menambah izin Pojok Baca:', err);
    statusEl.textContent = `❌ ${err.message}`;
    statusEl.style.color = '#ff6b6b';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Izinkan';
  }
}

async function saRemovePojokbacaAccess(memberId) {
  if (!confirm('Cabut izin baca member ini?')) return;
  const adminToken = saGetAdminToken();
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove-pojokbaca-access', adminToken, memberId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mencabut izin');
    saLoadPojokbacaAccessList();
  } catch (err) {
    console.error('Gagal mencabut izin Pojok Baca:', err);
    alert('Gagal mencabut izin: ' + err.message);
  }
}

// ── Multi-cerita ──
// State form: id cerita yang sedang diedit (null = cerita baru) + URL cover hasil upload Cloudinary.
let _pojokbacaEditingId = null;
let _pojokbacaCoverUrl = null;

async function saPojokbacaApi(body) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, adminToken: saGetAdminToken() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Permintaan gagal');
  return data;
}

function saPojokbacaCoverPreviewHtml(url) {
  return url
    ? `<img src="${saEscHtml(url)}" style="width:80px; height:120px; object-fit:cover; border-radius:6px; border:1px solid rgba(255,255,255,0.1);">`
    : '';
}

async function saLoadPojokbacaStories() {
  const listEl = document.getElementById('sa-pojokbaca-story-list');
  if (!listEl || !saGetAdminToken()) return;
  try {
    const data = await saPojokbacaApi({ action: 'list-stories-admin' });
    const stories = data.stories || [];
    if (!stories.length) {
      listEl.innerHTML = '<p style="color:#718096; font-size:12px; text-align:center; padding:20px;">Belum ada cerita. Tekan "+ Cerita Baru".</p>';
      return;
    }
    listEl.innerHTML = stories.map(st => {
      const thumb = st.coverUrl
        ? `<img src="${saEscHtml(st.coverUrl)}" style="width:40px; height:60px; object-fit:cover; border-radius:5px; flex-shrink:0;">`
        : `<div style="width:40px; height:60px; border-radius:5px; flex-shrink:0; background:rgba(123,197,255,0.12); display:flex; align-items:center; justify-content:center;">📖</div>`;
      const id = saEscHtml(st.id);
      return `
        <div style="display:flex; align-items:center; gap:10px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:8px;">
          ${thumb}
          <div style="flex:1; min-width:0;">
            <div style="font-size:13px; font-weight:600; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${saEscHtml(st.title)}</div>
            <div style="font-size:11px; color:#718096;">${st.chapterCount} bab${st.synopsis ? '' : ' · belum ada sinopsis'}</div>
          </div>
          <button onclick="saEditPojokbacaStory('${id}')" style="padding:6px 10px; background:rgba(123,197,255,0.12); border:1px solid rgba(123,197,255,0.3); border-radius:6px; color:#7bc5ff; font-size:11px; font-weight:600; cursor:pointer;">Edit</button>
          <button onclick="saDeletePojokbacaStory('${id}')" style="padding:6px 10px; background:rgba(255,107,107,0.15); border:1px solid rgba(255,107,107,0.3); border-radius:6px; color:#ff6b6b; font-size:11px; font-weight:600; cursor:pointer;">Hapus</button>
        </div>`;
    }).join('');
  } catch (err) {
    console.error('Gagal memuat daftar cerita:', err);
    listEl.innerHTML = `<p style="color:#ff6b6b; font-size:12px; text-align:center; padding:20px;">${saEscHtml(err.message)}</p>`;
  }
}

function saOpenPojokbacaForm(titleText) {
  document.getElementById('sa-pojokbaca-form-title').textContent = titleText;
  document.getElementById('sa-pojokbaca-save-status').textContent = '';
  const form = document.getElementById('sa-pojokbaca-form');
  form.style.display = 'block';
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function saResetPojokbacaForm() {
  _pojokbacaEditingId = null;
  _pojokbacaCoverUrl = null;
  document.getElementById('sa-pojokbaca-title').value = '';
  document.getElementById('sa-pojokbaca-synopsis').value = '';
  document.getElementById('sa-pojokbaca-cover-input').value = '';
  document.getElementById('sa-pojokbaca-cover-preview').innerHTML = '';
  document.getElementById('sa-pojokbaca-chapter-list').innerHTML = '';
}

function saNewPojokbacaStory() {
  saResetPojokbacaForm();
  saAddPojokbacaChapterRow();
  saOpenPojokbacaForm('Cerita baru');
}

function saCancelPojokbacaStory() {
  saResetPojokbacaForm();
  document.getElementById('sa-pojokbaca-form').style.display = 'none';
}

async function saEditPojokbacaStory(storyId) {
  try {
    const data = await saPojokbacaApi({ action: 'get-story-admin', storyId });
    const st = data.story;
    saResetPojokbacaForm();
    _pojokbacaEditingId = st.id;
    _pojokbacaCoverUrl = st.coverUrl || null;
    document.getElementById('sa-pojokbaca-title').value = st.title || '';
    document.getElementById('sa-pojokbaca-synopsis').value = st.synopsis || '';
    document.getElementById('sa-pojokbaca-cover-preview').innerHTML = saPojokbacaCoverPreviewHtml(_pojokbacaCoverUrl);
    (st.chapters || []).forEach(ch => saAddPojokbacaChapterRow(ch.title, ch.content));
    saOpenPojokbacaForm('Edit: ' + (st.title || ''));
  } catch (err) {
    console.error('Gagal memuat cerita untuk diedit:', err);
    alert('Gagal memuat cerita: ' + err.message);
  }
}

async function saDeletePojokbacaStory(storyId) {
  if (!confirm('Hapus cerita ini beserta semua babnya? Tindakan ini tidak bisa dibatalkan.')) return;
  try {
    await saPojokbacaApi({ action: 'delete-story', storyId });
    if (_pojokbacaEditingId === storyId) saCancelPojokbacaStory();
    saLoadPojokbacaStories();
  } catch (err) {
    console.error('Gagal menghapus cerita:', err);
    alert('Gagal menghapus cerita: ' + err.message);
  }
}

function saAddPojokbacaChapterRow(title = '', content = '') {
  const listEl = document.getElementById('sa-pojokbaca-chapter-list');
  const rowId = 'pbch-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
  const row = document.createElement('div');
  row.id = rowId;
  row.style.cssText = 'background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:10px;';
  row.innerHTML = `
    <div style="display:flex; gap:8px; margin-bottom:8px;">
      <input class="pbch-title" type="text" maxlength="200" placeholder="Judul bab" value="${saEscHtml(title)}" style="flex:1; padding:8px 10px; background:rgba(255,255,255,0.05); border:1px solid rgba(123,197,255,0.25); border-radius:6px; color:#fff; font-size:12px; box-sizing:border-box;">
      <button type="button" onclick="document.getElementById('${rowId}').remove()" style="padding:8px 10px; background:rgba(255,107,107,0.15); border:1px solid rgba(255,107,107,0.3); border-radius:6px; color:#ff6b6b; font-size:11px; cursor:pointer;">✕</button>
    </div>
    <textarea class="pbch-content" placeholder="Isi bab..." rows="5" style="width:100%; padding:8px 10px; background:rgba(255,255,255,0.05); border:1px solid rgba(123,197,255,0.25); border-radius:6px; color:#fff; font-size:12px; box-sizing:border-box; resize:vertical; font-family:inherit;">${saEscHtml(content)}</textarea>
  `;
  listEl.appendChild(row);
}

// Upload cover LANGSUNG ke Cloudinary dari browser (pola sama seperti galeri broadcast),
// supaya tidak kena limit body Vercel dan tidak perlu endpoint API baru.
document.addEventListener('change', async (e) => {
  if (e.target?.id !== 'sa-pojokbaca-cover-input') return;
  const file = e.target.files && e.target.files[0];
  const previewEl = document.getElementById('sa-pojokbaca-cover-preview');
  if (!file) return;

  previewEl.innerHTML = '<span style="font-size:11px; color:#718096;">Mengupload cover...</span>';
  try {
    const cloudForm = new FormData();
    cloudForm.append('file', file);
    cloudForm.append('upload_preset', 'broadcast_gallery_unsigned');
    const cloudRes = await fetch('https://api.cloudinary.com/v1_1/mclectmg/auto/upload', {
      method: 'POST',
      body: cloudForm,
    });
    const cloudData = await cloudRes.json();
    if (!cloudRes.ok) throw new Error(cloudData.error?.message || 'Upload cover gagal');

    _pojokbacaCoverUrl = cloudData.secure_url;
    previewEl.innerHTML = saPojokbacaCoverPreviewHtml(_pojokbacaCoverUrl);
  } catch (err) {
    console.error('Gagal upload cover cerita:', err);
    previewEl.innerHTML = `<span style="font-size:11px; color:#ff6b6b;">❌ ${saEscHtml(err.message)}</span>`;
  }
});

async function saSaveStory() {
  const title = document.getElementById('sa-pojokbaca-title').value.trim();
  const synopsis = document.getElementById('sa-pojokbaca-synopsis').value.trim();
  const statusEl = document.getElementById('sa-pojokbaca-save-status');
  const btn = document.getElementById('sa-pojokbaca-save-btn');

  if (!title) {
    statusEl.textContent = '⚠️ Judul cerita wajib diisi.';
    statusEl.style.color = '#ff6b6b';
    return;
  }

  const chapterRows = document.querySelectorAll('#sa-pojokbaca-chapter-list > div');
  const chapters = Array.from(chapterRows).map(row => ({
    title: row.querySelector('.pbch-title').value.trim(),
    content: row.querySelector('.pbch-content').value.trim(),
  })).filter(ch => ch.title && ch.content); // baris kosong (judul/isi belum diisi) dilewati, bukan error

  if (chapters.length === 0) {
    statusEl.textContent = '⚠️ Minimal 1 bab (judul & isi keduanya wajib terisi).';
    statusEl.style.color = '#ff6b6b';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Menyimpan...';
  statusEl.textContent = 'Menyimpan cerita...';
  statusEl.style.color = '#718096';

  try {
    const data = await saPojokbacaApi({
      action: 'save-story',
      storyId: _pojokbacaEditingId || undefined,
      title, synopsis, coverUrl: _pojokbacaCoverUrl, chapters,
    });
    _pojokbacaEditingId = data.storyId; // setelah cerita baru tersimpan, simpan berikutnya = update, bukan bikin dobel
    document.getElementById('sa-pojokbaca-form-title').textContent = 'Edit: ' + title;
    statusEl.textContent = `✅ ${data.created ? 'Cerita dibuat' : 'Cerita diperbarui'} (${data.chapterCount} bab)!`;
    statusEl.style.color = '#00e5c0';
    saLoadPojokbacaStories();
  } catch (err) {
    console.error('Gagal menyimpan cerita:', err);
    statusEl.textContent = `❌ ${err.message}`;
    statusEl.style.color = '#ff6b6b';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan Cerita';
  }
}
