/* ═══════════════════════════════════════════════
   I.O.E HUB — SUPERADMIN / event-review.js
   Review quest pending (like-video screenshot / tautan TikTok)
   Dimuat otomatis oleh js/nav.js (lazy-load) saat panel admin pertama kali dibuka.
   Script klasik (bukan ES module): fungsi & variabel tetap global, jadi onclick="..." di HTML tetap jalan.
═══════════════════════════════════════════════ */

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
