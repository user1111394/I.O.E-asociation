/* ═══════════════════════════════════════════════
   I.O.E HUB — SUPERADMIN / redeem.js
   Kode redeem (buat, daftar, nonaktifkan)
   Dimuat otomatis oleh js/nav.js (lazy-load) saat panel admin pertama kali dibuka.
   Script klasik (bukan ES module): fungsi & variabel tetap global, jadi onclick="..." di HTML tetap jalan.
═══════════════════════════════════════════════ */

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
