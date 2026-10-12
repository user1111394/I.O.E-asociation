/* ═══════════════════════════════════════════════
   I.O.E HUB — SUPERADMIN / tos.js
   Tab ToS: daftar & detail banding
   Dimuat otomatis oleh js/nav.js (lazy-load) saat panel admin pertama kali dibuka.
   Script klasik (bukan ES module): fungsi & variabel tetap global, jadi onclick="..." di HTML tetap jalan.
═══════════════════════════════════════════════ */

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
