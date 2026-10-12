/* ═══════════════════════════════════════════════
   I.O.E HUB — SUPERADMIN / event.js
   Tab Event: quest builder, buat/daftar/hapus event, sub-tab Acara/Koin/Broadcast/Galeri/Review
   Dimuat otomatis oleh js/nav.js (lazy-load) saat panel admin pertama kali dibuka.
   Script klasik (bukan ES module): fungsi & variabel tetap global, jadi onclick="..." di HTML tetap jalan.
═══════════════════════════════════════════════ */

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
