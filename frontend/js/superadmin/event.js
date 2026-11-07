/* ═══════════════════════════════════════════════
   I.O.E HUB — SUPERADMIN / event.js
   Tab Event: quest builder, buat/daftar/hapus event, sub-tab Acara/Koin/Broadcast/Galeri/Review
   Dimuat otomatis oleh js/nav.js (lazy-load) saat panel admin pertama kali dibuka.
   Script klasik (bukan ES module): fungsi & variabel tetap global, jadi onclick="..." di HTML tetap jalan.
═══════════════════════════════════════════════ */

// ── Quest builder: state sementara untuk quest yang lagi dibangun di form ──
let saQuestDraft = [];
// Pilihan minigame di panel global (dipakai saat quest dicentang). Data tetap disimpan per quest (quest.minigameType).
let saMinigameChoice = 'none';

// Definisi 7 tipe quest yang tersedia di form. `fields` menentukan input
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
//   - 'minigame'      -> field: none; jenis minigame dipilih di panel "Pengaturan Minigame"
//                        (quest.minigameType). Hanya tipe ini yang boleh punya minigame.
const SA_QUEST_TYPES = {
  'visit':         { label: 'Kunjungi Profile',       fields: ['targetLink'] },
  'submit-link':   { label: 'Salin Tautan Video',     fields: ['sourceLink'] },
  'like-video':    { label: 'Like Video (screenshot)',fields: ['targetLink'] },
  'make-video':    { label: 'Buat Video (ke TikTok)', fields: [] },
  'invite-friend': { label: 'Ajak Teman',             fields: [] },
  'login-streak':  { label: 'Login Berturut-turut',   fields: ['streakDays'] },
  'minigame':      { label: '🎮 Main Minigame',        fields: [] },
};

function saAddQuestRow() {
  const id = 'q_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  saQuestDraft.push({ id, type: 'visit', title: '', rewardCoin: 10, targetLink: '', sourceLink: '', streakDays: 3, unlockDay: 1, minigameType: 'none', resetType: 'none' });
  saRenderQuestList();
}

function saRemoveQuestRow(id) {
  saQuestDraft = saQuestDraft.filter(q => q.id !== id);
  saRenderQuestList();
}

function saUpdateQuestField(id, field, value) {
  const q = saQuestDraft.find(q => q.id === id);
  if (q) q[field] = value;
  if (field === 'title') saRenderMinigamePanel(); // label centang di panel minigame ikut judul quest
}

// Ganti tipe quest DAN render ulang baris itu — supaya field dinamis
// (targetLink/sourceLink/streakDays) langsung muncul/hilang sesuai tipe
// yang baru dipilih, tanpa perlu render ulang seluruh daftar quest.
function saUpdateQuestType(id, value) {
  saUpdateQuestField(id, 'type', value);
  // Minigame hanya untuk tipe 'minigame'. Tipe lain dipaksa 'none'; quest yang baru jadi
  // 'minigame' langsung memakai pilihan di panel global (kalau sudah dipilih).
  saUpdateQuestField(id, 'minigameType', value === 'minigame' ? saMinigameChoice : 'none');
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
  saRenderMinigamePanel(); // daftar centang minigame mengikuti daftar quest

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
      ${q.type === 'minigame' ? '<p style="font-size:11px; color:#ffd166; margin:0 0 6px 2px;">🎮 Tipe minigame diatur di panel atas.</p>' : ''}
      <input type="number" min="1" placeholder="Reward koin" value="${q.rewardCoin}" oninput="saUpdateQuestField('${q.id}','rewardCoin',parseInt(this.value,10)||0)" style="width:100%; padding:8px; margin-bottom:6px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.2); border-radius:6px; color:#fff; font-size:12px; box-sizing:border-box;">
      <input type="number" min="1" placeholder="Buka di hari ke- (1 = langsung bisa)" value="${q.unlockDay || 1}" oninput="saUpdateQuestField('${q.id}','unlockDay',parseInt(this.value,10)||1)" style="width:100%; padding:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.2); border-radius:6px; color:#fff; font-size:12px; box-sizing:border-box;">
      <p style="font-size:10px; color:#718096; margin:4px 0 0 2px;">Quest terkunci sampai hari ke-N sejak event dipublikasikan (hari ke-1 = hari event diterbitkan).</p>
      <label style="display:block; margin-top:8px; font-size:11px; color:#cbd5e0;">🔁 Tipe reset</label>
      <select onchange="saUpdateQuestField('${q.id}','resetType',this.value)" style="width:100%; padding:8px; margin-bottom:6px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.2); border-radius:6px; color:#fff; font-size:12px; box-sizing:border-box;">
        <option value="none" ${(q.resetType || 'none') === 'none' ? 'selected' : ''}>Sekali klaim</option>
        <option value="daily" ${q.resetType === 'daily' ? 'selected' : ''}>Harian (bisa diklaim lagi 24 jam setelah klaim)</option>
        <option value="weekly" ${q.resetType === 'weekly' ? 'selected' : ''}>Mingguan (bisa diklaim lagi 7 hari setelah klaim)</option>
      </select>
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
    if (q.type === 'minigame' && (!q.minigameType || q.minigameType === 'none')) {
      statusEl.textContent = `⚠️ Quest "${q.title}" bertipe Main Minigame, tapi belum dicentang di panel Pengaturan Minigame.`;
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

  // Maskot (field baru). Elemen disuntik oleh saInjectEventExtraFields() di bawah.
  const mascotInput = document.getElementById('sa-event-mascot-input');
  const mascotFile = mascotInput && mascotInput.files && mascotInput.files[0];
  const mascotDialogue = ((document.getElementById('sa-event-mascot-dialogue') || {}).value || '').trim();

  const gachaErr = saValidateGachaPool();
  if (gachaErr) {
    statusEl.textContent = '⚠️ ' + gachaErr;
    statusEl.style.color = '#ff6b6b';
    return;
  }
  const gachaPoolClean = saCleanGachaPool();
  if (gachaPoolClean.length === 0 && saQuestDraft.some(q => q.minigameType === 'water-tree' || q.minigameType === 'newyear-firework') &&
      !confirm('Event punya fitur gacha (Siram Pohon / Kembang Api), tapi hadiah gacha masih kosong (kado/kembang api tidak bisa dibuka). Lanjutkan?')) return;

  btn.disabled = true;
  btn.textContent = 'Mengupload...';
  statusEl.style.color = '#718096';

  try {
    // ID draft acak (bukan cuma timestamp) supaya tidak mudah ditebak orang lain.
    const draftId = 'draft_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);

    statusEl.textContent = 'Upload background...';
    const backgroundUrl = await saUploadEventImage(bgFile);

    statusEl.textContent = 'Upload border/bingkai...';
    const borderShapeUrl = await saUploadEventImage(borderImgFile);

    statusEl.textContent = 'Upload isi tengah border...';
    const questBgUrl = await saUploadEventImage(questBgFile);

    let mascotUrl = '';
    if (mascotFile) {
      statusEl.textContent = 'Upload maskot...';
      mascotUrl = await saUploadEventImage(mascotFile);
    }

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
        minigameType: q.type === 'minigame' ? (q.minigameType || 'none') : 'none', // selain tipe 'minigame' selalu 'none'
        resetType: q.resetType || 'none',       // 'none' | 'daily' | 'weekly'
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

    // Disimpan sebagai DRAFT. createdAt/expiresAt sengaja TIDAK diisi di sini:
    // dihitung saat PUBLISH (dari event.html?preview=...), supaya "hari ke-1"
    // dan masa berlaku mulai dihitung dari saat event benar-benar terbit.
    const now = Date.now();

    statusEl.textContent = 'Menyimpan draft...';
    await set(ref(db, `draft_events/${draftId}`), {
      id: draftId,
      title, desc,
      backgroundUrl,
      borderShapeUrl,
      questBgUrl,
      mascotUrl,
      mascotDialogue,
      coinName,
      inviteLink,
      quests: questsObj,
      days,
      eventGachaPool: gachaPoolClean, // satu pool untuk semua gacha event (kado Natal, kembang api Tahun Baru); kosong -> tidak tersimpan
      draftCreatedAt: now
    });

    statusEl.innerHTML = '✅ Draft tersimpan. <a href="/event.html?preview=' + draftId + '" target="_blank" rel="noopener" style="color:#00e5c0; text-decoration:underline;">Buka Preview ↗</a>';
    statusEl.style.color = '#00e5c0';
    document.getElementById('sa-event-title').value = '';
    document.getElementById('sa-event-desc').value = '';
    document.getElementById('sa-event-days').value = '';
    document.getElementById('sa-event-coin-name').value = '';
    document.getElementById('sa-event-invite-link').value = '';
    bgInput.value = '';
    borderImgInput.value = '';
    questBgInput.value = '';
    if (mascotInput) mascotInput.value = '';
    const dlgEl = document.getElementById('sa-event-mascot-dialogue'); if (dlgEl) dlgEl.value = '';
    saMinigameChoice = 'none';
    saGachaPool = [];
    saRenderGachaList();
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
    btn.textContent = 'Simpan Draft & Preview';
  }
}

async function saLoadEventList() {
  const listEl = document.getElementById('sa-event-list');
  if (!listEl) return;
  saLoadDraftList(); // daftar draft (belum terbit) tampil di atas daftar event aktif

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


/* ═══════════════════════════════════════════════
   DRAFT & PREVIEW
   Event disimpan ke draft_events/{id}. Preview: /event.html?preview={id}.
   Di halaman preview ada tombol PUBLISH yang memindahkan draft ke events/.
═══════════════════════════════════════════════ */
function saDraftEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Menyuntik field maskot/minigame ke form event yang sudah ada (markup form ada di luar event.js),
// plus wadah daftar draft. Return true kalau form sudah ada & field sudah terpasang.
function saInjectEventExtraFields() {
  const btn = document.getElementById('sa-event-submit-btn');
  const questList = document.getElementById('sa-quest-list');
  if (!btn || !btn.parentNode || !questList || !questList.parentNode) return false;
  if (document.getElementById('sa-event-extra')) return true;

  const inputStyle = 'width:100%; padding:8px; margin-bottom:6px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.2); border-radius:6px; color:#fff; font-size:12px; box-sizing:border-box;';
  const wrap = document.createElement('div');
  wrap.id = 'sa-event-extra';
  wrap.style.cssText = 'margin:10px 0;';
  wrap.innerHTML = `
    <div style="font-size:12px; font-weight:600; color:#ffd166; margin-bottom:6px;">🧙 Maskot (opsional)</div>
    <label style="font-size:11px; color:#a0aec0;">Gambar maskot (PNG transparan)</label>
    <input type="file" id="sa-event-mascot-input" accept="image/*" style="${inputStyle}">
    <textarea id="sa-event-mascot-dialogue" maxlength="160" rows="2" placeholder="Dialog maskot (maks 160 huruf), misal: Halo! Selesaikan quest hari ini ya!" style="${inputStyle} resize:vertical;"></textarea>
    <div style="font-size:12px; font-weight:600; color:#ffd166; margin:12px 0 4px;">🎁 Hadiah Gacha Event (Kado/Kembang Api)</div>
    <p style="font-size:10px; color:#718096; margin:0 0 6px;">Satu daftar ini dipakai SEMUA gacha event: kado Natal (1 undian per bola terpasang) dan kembang api Tahun Baru (1 undian per kembang api). Hasil tampil langsung sebagai teks. Peluang = bobot ÷ total bobot (angka di kanan dihitung otomatis).</p>
    <div id="sa-gacha-list"></div>
    <button type="button" onclick="saAddGachaRow()" style="width:100%; padding:8px; margin-bottom:4px; border-radius:6px; background:rgba(255,209,102,0.12); border:1px dashed rgba(255,209,102,0.5); color:#ffd166; font-size:12px;">＋ Tambah Hadiah</button>
    <div id="sa-gacha-total" style="font-size:10px; color:#718096; margin-bottom:6px;"></div>
    `;
  btn.parentNode.insertBefore(wrap, btn);
  saRenderGachaList();
  btn.textContent = 'Simpan Draft & Preview';

  const listEl = document.getElementById('sa-event-list');
  if (listEl && listEl.parentNode && !document.getElementById('sa-draft-list')) {
    const drafts = document.createElement('div');
    drafts.id = 'sa-draft-list';
    drafts.style.cssText = 'margin-bottom:10px;';
    listEl.parentNode.insertBefore(drafts, listEl);
  }

  // Panel minigame GLOBAL: di atas daftar quest. Dropdown memilih jenis minigame, centang memilih
  // quest mana yang memakainya. Data tetap per quest (quest.minigameType) -> struktur Firebase tidak berubah.
  if (!document.getElementById('sa-minigame-panel')) {
    const panel = document.createElement('div');
    panel.id = 'sa-minigame-panel';
    panel.style.cssText = 'margin:0 0 10px; padding:10px; border:1px dashed rgba(255,209,102,0.45); border-radius:8px; background:rgba(255,209,102,0.05);';
    panel.innerHTML = `
      <div style="font-size:12px; font-weight:600; color:#ffd166; margin-bottom:6px;">🎮 Pengaturan Minigame</div>
      <label style="font-size:11px; color:#a0aec0;">Pilih Minigame</label>
      <select id="sa-global-minigame-type" onchange="saSetGlobalMinigame(this.value)" style="${inputStyle}">
        <option value="none">Tanpa minigame</option>
        <option value="tap-target">Tap Target (ketuk 10 sasaran dalam 10 detik)</option>
        <option value="water-tree">Siram Pohon Natal (🌱 -> 🎄)</option>
        <option value="newyear-firework">Kembang Api Tahun Baru (penanda tombol; quest tidak tampil)</option>
      </select>
      <div style="display:flex; align-items:center; justify-content:space-between; margin:4px 0;">
        <span style="font-size:11px; color:#cbd5e0;">Terapkan ke quest mana?</span>
        <span>
          <button type="button" onclick="saMinigameSelectAll(true)" style="font-size:10px; padding:3px 8px; border-radius:6px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2); color:#cbd5e0;">Semua</button>
          <button type="button" onclick="saMinigameSelectAll(false)" style="font-size:10px; padding:3px 8px; border-radius:6px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2); color:#cbd5e0;">Kosongkan</button>
        </span>
      </div>
      <div id="sa-global-minigame-quests"></div>`;
    questList.parentNode.insertBefore(panel, questList);
    saRenderMinigamePanel();
  }
  return true;
}

// Gambar ulang daftar centang (select tidak disentuh, jadi pilihannya tidak ter-reset).
// Hanya quest bertipe 'minigame' yang ditampilkan.
function saRenderMinigamePanel() {
  const box = document.getElementById('sa-global-minigame-quests');
  if (!box) return;
  const sel = document.getElementById('sa-global-minigame-type');
  if (sel) sel.value = saMinigameChoice;
  const mgQuests = saQuestDraft.map((q, i) => ({ q, i })).filter(x => x.q.type === 'minigame');
  if (mgQuests.length === 0) {
    box.innerHTML = '<p style="color:#718096; font-size:11px; margin:4px 0;">Belum ada quest tipe \'Main Minigame\'. Tambahkan dulu di bawah.</p>';
    return;
  }
  const off = saMinigameChoice === 'none';
  box.innerHTML = (off ? '<p style="color:#718096; font-size:10px; margin:0 0 4px;">Pilih minigame di atas dulu untuk mengaktifkan centang.</p>' : '') +
    mgQuests.map(({ q, i }) => {
      const on = !!q.minigameType && q.minigameType !== 'none';
      return `<label style="display:flex; align-items:center; gap:8px; padding:5px 0; font-size:12px; color:${off ? '#718096' : '#fff'};">
        <input type="checkbox" ${on ? 'checked' : ''} ${off ? 'disabled' : ''} onchange="saToggleQuestMinigame('${q.id}', this.checked)">
        <span>#${i + 1} ${saDraftEsc(q.title || '(tanpa judul)')}</span>
      </label>`;
    }).join('');
}

// Ganti jenis minigame: SEMUA quest bertipe 'minigame' langsung memakai pilihan ini (termasuk yang
// baru ditambahkan dan masih 'none'); "Tanpa minigame" mengosongkan semuanya.
// Centang per quest di panel tetap bisa dipakai untuk mengecualikan satu quest sampai dropdown diganti lagi.
function saSetGlobalMinigame(type) {
  saMinigameChoice = type || 'none';
  saQuestDraft.forEach(q => {
    if (q.type === 'minigame') {
      q.minigameType = saMinigameChoice;
    }
  });
  saRenderMinigamePanel();
}

function saToggleQuestMinigame(questId, checked) {
  const target = saQuestDraft.find(q => q.id === questId);
  if (!target || target.type !== 'minigame') return;
  if (saMinigameChoice === 'none') { saRenderMinigamePanel(); return; }
  saUpdateQuestField(questId, 'minigameType', checked ? saMinigameChoice : 'none'); // checkbox sudah berubah sendiri; tidak perlu gambar ulang
}

function saMinigameSelectAll(on) {
  if (saMinigameChoice === 'none') return;
  saQuestDraft.forEach(q => { if (q.type === 'minigame') q.minigameType = on ? saMinigameChoice : 'none'; });
  saRenderMinigamePanel();
}

async function saLoadDraftList() {
  const el = document.getElementById('sa-draft-list');
  if (!el) return;
  try {
    const { db } = await saGetEventFirebase();
    const { ref, get } = window._eventDbFns;
    const data = (await get(ref(db, 'draft_events'))).val();
    const drafts = data ? Object.values(data).sort((a, b) => (b.draftCreatedAt || 0) - (a.draftCreatedAt || 0)) : [];
    if (drafts.length === 0) { el.innerHTML = ''; return; }
    el.innerHTML = '<div style="font-size:12px; font-weight:600; color:#ffd166; margin:4px 0 8px;">📝 Draft (belum terbit)</div>' +
      drafts.map(d => {
        const qs = d.quests ? Object.values(d.quests) : [];
        const qc = qs.length;
        const mg = qs.filter(x => x.minigameType && x.minigameType !== 'none').length;
        const rc = qs.filter(x => x.resetType && x.resetType !== 'none').length;
        return `
        <div style="background:rgba(255,209,102,0.06); border:1px solid rgba(255,209,102,0.3); border-radius:10px; padding:12px; margin-bottom:8px;">
          <div style="font-size:13px; font-weight:600; color:#fff;">${saDraftEsc(d.title)}</div>
          <div style="font-size:10px; color:#718096; margin-top:4px;">🎯 ${qc} quest · 🪙 ${saDraftEsc(d.coinName || 'koin')} · ⏳ ${saDraftEsc(d.days)} hari${mg ? ' · 🎮 ' + mg : ''}${rc ? ' · 🔁 ' + rc : ''}</div>
          <div style="display:flex; gap:8px; margin-top:8px;">
            <a href="/event.html?preview=${encodeURIComponent(d.id)}" target="_blank" rel="noopener" style="flex:1; text-align:center; padding:8px; border-radius:6px; background:rgba(0,229,192,0.15); border:1px solid rgba(0,229,192,0.4); color:#00e5c0; font-size:12px; text-decoration:none;">Preview / Publish</a>
            <button onclick="saDeleteDraft('${saDraftEsc(d.id)}')" style="padding:8px 12px; border-radius:6px; background:rgba(255,107,107,0.15); border:1px solid rgba(255,107,107,0.3); color:#ff6b6b; font-size:12px;">Hapus</button>
          </div>
        </div>`;
      }).join('');
  } catch (err) {
    console.error('Gagal memuat draft:', err);
    el.innerHTML = `<p style="color:#ff6b6b; font-size:11px;">Gagal memuat draft: ${saDraftEsc(err && err.message ? err.message : err)}</p>`;
  }
}

async function saDeleteDraft(draftId) {
  if (!confirm('Hapus draft ini? (Gambar yang sudah diupload ke Cloudinary tidak ikut terhapus.)')) return;
  try {
    const { db } = await saGetEventFirebase();
    const { ref, remove } = window._eventDbFns;
    await remove(ref(db, `draft_events/${draftId}`));
    saLoadDraftList();
  } catch (err) {
    alert('Gagal menghapus draft: ' + (err && err.message ? err.message : err));
  }
}

/* ═══════════════════════════════════════════════
   HADIAH GACHA EVENT (KADO NATAL / KEMBANG API TAHUN BARU)
   Disimpan di event sebagai eventGachaPool (event lama: xmasGachaPool, tetap dibaca server): [{ type, value, weight }].
   type: 'eventcoin' | 'globalcoin' (value = jumlah koin) | 'item' (value = id/nama item).
   Server membaca pool ini langsung dari Firebase saat kado dibuka (bukan dari browser).
═══════════════════════════════════════════════ */
let saGachaPool = []; // { id, type, value, weight }
const SA_GACHA_TYPES = { eventcoin: 'Koin Event', globalcoin: 'Koin Global', item: 'Item' };

function saAddGachaRow() {
  saGachaPool.push({ id: 'g_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), type: 'eventcoin', value: '', weight: 10 });
  saRenderGachaList();
}

function saRemoveGachaRow(id) {
  saGachaPool = saGachaPool.filter(r => r.id !== id);
  saRenderGachaList();
}

function saUpdateGachaField(id, field, value) {
  const r = saGachaPool.find(r => r.id === id);
  if (!r) return;
  r[field] = field === 'weight' ? Number(value) : value;
  if (field === 'type') saRenderGachaList(); // placeholder ikut berubah
  else saUpdateGachaPercents();
}

function saUpdateGachaPercents() {
  const total = saGachaPool.reduce((a, r) => a + (r.weight > 0 ? r.weight : 0), 0);
  saGachaPool.forEach(r => {
    const el = document.getElementById('sa-gacha-pct-' + r.id);
    if (el) el.textContent = total > 0 && r.weight > 0 ? (r.weight / total * 100).toFixed(1) + '%' : '—';
  });
  const t = document.getElementById('sa-gacha-total');
  if (t) t.textContent = saGachaPool.length ? `Total bobot: ${total} · ${saGachaPool.length} hadiah` : 'Belum ada hadiah.';
}

function saRenderGachaList() {
  const box = document.getElementById('sa-gacha-list');
  if (!box) return;
  const f = 'padding:7px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,90,160,0.2); border-radius:6px; color:#fff; font-size:12px; box-sizing:border-box; min-width:0;';
  box.innerHTML = saGachaPool.map(r => `
    <div style="padding:8px; margin-bottom:6px; border:1px solid rgba(255,255,255,0.12); border-radius:8px;">
      <div style="display:flex; gap:6px; align-items:center;">
        <select onchange="saUpdateGachaField('${r.id}','type',this.value)" style="${f} flex:1;">
          ${Object.entries(SA_GACHA_TYPES).map(([k, label]) => `<option value="${k}" ${r.type === k ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        <button type="button" onclick="saRemoveGachaRow('${r.id}')" aria-label="Hapus hadiah" style="padding:7px 10px; border-radius:6px; background:rgba(255,107,107,0.15); border:1px solid rgba(255,107,107,0.3); color:#ff6b6b;">✕</button>
      </div>
      <div style="display:flex; gap:6px; align-items:center; margin-top:6px;">
        <input type="text" inputmode="${r.type === 'item' ? 'text' : 'numeric'}" value="${saDraftEsc(r.value)}"
          placeholder="${r.type === 'item' ? 'ID / nama item' : 'Jumlah koin, mis. 50'}"
          oninput="saUpdateGachaField('${r.id}','value',this.value)" style="${f} flex:2;">
        <input type="number" min="0" step="any" value="${saDraftEsc(r.weight)}" title="Bobot / peluang"
          oninput="saUpdateGachaField('${r.id}','weight',this.value)" style="${f} flex:1;">
        <span id="sa-gacha-pct-${r.id}" style="font-size:11px; color:#ffd166; min-width:44px; text-align:right;"></span>
      </div>
    </div>`).join('');
  saUpdateGachaPercents();
}

// Pesan galat (string) kalau ada baris tidak valid; '' kalau semua OK.
function saValidateGachaPool() {
  for (let i = 0; i < saGachaPool.length; i++) {
    const r = saGachaPool[i], n = i + 1, v = String(r.value == null ? '' : r.value).trim();
    if (r.type === 'item') {
      if (!v) return `Hadiah #${n}: isi ID/nama item.`;
      if (v.length > 40) return `Hadiah #${n}: nama item maksimal 40 huruf.`;
    } else if (!/^\d+$/.test(v) || parseInt(v, 10) < 1 || parseInt(v, 10) > 1000000) {
      return `Hadiah #${n}: jumlah koin harus bilangan bulat 1–1.000.000.`;
    }
    if (!(r.weight > 0) || r.weight > 1000000) return `Hadiah #${n}: bobot harus lebih dari 0.`;
  }
  return '';
}

function saCleanGachaPool() {
  return saGachaPool.map(r => ({
    type: r.type,
    value: r.type === 'item' ? String(r.value).trim() : parseInt(String(r.value).trim(), 10),
    weight: r.weight,
  }));
}

// Pasang field tambahan segera, atau tunggu sampai form-nya muncul di halaman.
if (!saInjectEventExtraFields()) {
  const saExtraObserver = new MutationObserver(() => {
    if (saInjectEventExtraFields()) { saExtraObserver.disconnect(); saLoadDraftList(); }
  });
  saExtraObserver.observe(document.body, { childList: true, subtree: true });
} else {
  saLoadDraftList();
}
