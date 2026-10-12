/* ═══════════════════════════════════════════════
   I.O.E HUB — SUPERADMIN / member.js
   Tab Member: daftar/cari, ban/unban, gift rank, trial token
   Dimuat otomatis oleh js/nav.js (lazy-load) saat panel admin pertama kali dibuka.
   Script klasik (bukan ES module): fungsi & variabel tetap global, jadi onclick="..." di HTML tetap jalan.
═══════════════════════════════════════════════ */

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
    const safeMemberId = (m.memberId || '').replace(/'/g, "\\'");

    const rankColors = {
      newbie: '#a0aec0', beginner: '#00c2ff', junior: '#00e5c0', senior: '#7b5cff',
      master: '#ff8f5a', grandmaster: '#ffd23f', influencer: '#ff5aa0', cheater: '#ff3b3b',
      collaborator: '#ffd23f', eksklusif: '#00c2ff', winner: '#ff3b3b', creator: '#ff5aa0',
    };
    const rankColor = rankColors[m.rankId] || '#a0aec0';
    const rankBadge = `<span style="font-size:10px; padding:2px 8px; border-radius:10px; background:${rankColor}22; color:${rankColor}; font-weight:600;">${saEscHtml(m.rank || 'Newbie')}</span>`;

    const rankBtn = m.exclusiveRank
      ? `<button onclick="saClearExclusiveRank('${safeMemberId}','${saEscHtml(m.nama || m.username)}')" style="flex:1; padding:7px; background:rgba(255,90,160,0.15); border:1px solid rgba(255,90,160,0.4); border-radius:6px; color:#ff5aa0; font-size:11px; font-weight:600; cursor:pointer;">🎖️ Cabut Rank</button>`
      : `<button onclick="saOpenGiftRank('${safeMemberId}','${saEscHtml(m.nama || m.username)}')" style="flex:1; padding:7px; background:rgba(255,210,63,0.15); border:1px solid rgba(255,210,63,0.4); border-radius:6px; color:#ffd23f; font-size:11px; font-weight:600; cursor:pointer;">🎖️ Gift Rank</button>`;

    return `
      <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:12px;">
        <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:6px;">
          <div>
            <div style="font-size:14px; font-weight:600; color:#fff;">${saEscHtml(m.nama || '(tanpa nama)')}</div>
            <div style="font-size:11px; color:#a0aec0;">@${saEscHtml(m.username || '-')} · ${saEscHtml(m.memberId || '-')}</div>
            <div style="margin-top:4px;">${rankBadge}</div>
          </div>
          <span style="font-size:10px; padding:3px 8px; border-radius:12px; background:${statusColor}22; color:${statusColor}; font-weight:600; flex-shrink:0;">${statusText}</span>
        </div>
        ${m.banned && m.banReason ? `<div style="font-size:11px; color:#ff9b9b; margin-bottom:8px;">Alasan: ${saEscHtml(m.banReason)}</div>` : ''}
        <div style="display:flex; gap:6px; margin-top:8px;">
          ${m.banned
            ? `<button onclick="saUnbanMember('${safeUsername}')" style="flex:1; padding:7px; background:rgba(0,229,197,0.15); border:1px solid rgba(0,229,197,0.4); border-radius:6px; color:#00e5c0; font-size:11px; font-weight:600; cursor:pointer;">✅ Unban</button>`
            : `<button onclick="saBanMember('${safeUsername}')" style="flex:1; padding:7px; background:rgba(255,107,107,0.15); border:1px solid rgba(255,107,107,0.4); border-radius:6px; color:#ff6b6b; font-size:11px; font-weight:600; cursor:pointer;">🚫 Ban</button>`
          }
          ${rankBtn}
        </div>
      </div>
    `;
  }).join('');
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

async function saOpenGiftRank(memberId, displayName) {
  const options = [
    '1 = Collaborator (kuning-hijau, kolaborasi dengan I.O.E)',
    '2 = Eksklusif (biru, top-up rutin)',
    '3 = Winner (merah, menang challenge admin)',
    '4 = Creator (pelangi, pemilik website)',
  ].join('\n');
  const choice = prompt(`Gift rank eksklusif untuk "${displayName}":\n\n${options}\n\nMasukkan angka 1-4:`, '');
  if (choice === null) return; // cancel

  const map = { '1': 'collaborator', '2': 'eksklusif', '3': 'winner', '4': 'creator' };
  const exclusiveRankId = map[choice.trim()];
  if (!exclusiveRankId) {
    alert('Pilihan tidak valid. Masukkan angka 1-4.');
    return;
  }

  const token = saGetAdminToken();
  if (!token) return;

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set-exclusive-rank', adminToken: token, memberId, exclusiveRankId }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Gagal memberikan rank');
    saLoadAllMembers();
  } catch (e) {
    alert('Gagal memberikan rank: ' + e.message);
  }
}

async function saClearExclusiveRank(memberId, displayName) {
  if (!confirm(`Cabut rank eksklusif dari "${displayName}"? Rank akan kembali dihitung otomatis dari total like.`)) return;

  const token = saGetAdminToken();
  if (!token) return;

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear-exclusive-rank', adminToken: token, memberId }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Gagal mencabut rank');
    saLoadAllMembers();
  } catch (e) {
    alert('Gagal mencabut rank: ' + e.message);
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


// Enter key di search box langsung trigger pencarian
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.activeElement?.id === 'sa-search-input') {
    saSearchMembers();
  }
});
