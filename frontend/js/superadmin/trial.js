/* ═══════════════════════════════════════════════
   I.O.E HUB — SUPERADMIN / trial.js
   Panel Trial Admin (read-only, statistik)
   Dimuat otomatis oleh js/nav.js (lazy-load) saat panel admin pertama kali dibuka.
   Script klasik (bukan ES module): fungsi & variabel tetap global, jadi onclick="..." di HTML tetap jalan.
═══════════════════════════════════════════════ */

// ═══ TRIAL ADMIN PANEL (popup, read-only, cuma statistik) ═══
function openTrialAdminPanel() {
  if (document.getElementById('ioe-trial-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'ioe-trial-overlay';
  overlay.style.cssText = `
    position: fixed; top:0; left:0; right:0; bottom:0;
    background: rgba(0,0,0,0.75); z-index: 99999;
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
  `;
  overlay.onclick = (e) => { if (e.target === overlay) closeTrialAdminPanel(); };

  const box = document.createElement('div');
  box.style.cssText = `
    background: linear-gradient(135deg, #1a1f3a 0%, #150f1e 100%);
    border: 1px solid rgba(123,92,255,0.3);
    border-radius: 16px; padding: 24px; max-width: 420px; width: 100%;
    max-height: 85vh; overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0,0,0,0.8); color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  box.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <h2 style="font-size:17px; color:#7b5cff;">📊 Trial Admin Panel</h2>
      <button onclick="closeTrialAdminPanel()" style="background:rgba(255,255,255,0.1); border:none; color:#fff; width:32px; height:32px; border-radius:50%; cursor:pointer; font-size:16px; flex-shrink:0;">✕</button>
    </div>
    <p style="font-size:11px; color:#718096; margin-bottom:16px;">Akses baca-saja — statistik I.O.E Hub</p>
    <div id="ta-stats-content">
      <p style="color:#718096; font-size:12px; text-align:center; padding:20px;">Memuat statistik...</p>
    </div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  taLoadStats();
}

function closeTrialAdminPanel() {
  document.getElementById('ioe-trial-overlay')?.remove();
}

function taGetSessionToken() {
  try {
    const sess = localStorage.getItem('ioe_trial_admin_session');
    if (!sess) return null;
    const parsed = JSON.parse(sess);
    if (parsed.expiresAt <= Date.now()) {
      localStorage.removeItem('ioe_trial_admin_session');
      return null;
    }
    return parsed.sessionToken;
  } catch (e) {
    return null;
  }
}

async function taLoadStats() {
  const token = taGetSessionToken();
  const contentEl = document.getElementById('ta-stats-content');
  if (!token) {
    contentEl.innerHTML = '<p style="color:#ff6b6b; font-size:12px; text-align:center; padding:20px;">Sesi tidak valid atau sudah kedaluwarsa</p>';
    return;
  }

  try {
    // Verifikasi sesi trial dulu
    const verifyRes = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify-trial-session', sessionToken: token }),
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.valid) {
      contentEl.innerHTML = '<p style="color:#ff6b6b; font-size:12px; text-align:center; padding:20px;">Sesi sudah kedaluwarsa. Silakan login ulang.</p>';
      localStorage.removeItem('ioe_trial_admin_session');
      return;
    }

    // Ambil statistik — pakai session token trial sebagai adminToken
    // (member-list.js sekarang perlu terima trial session juga, lihat catatan di bawah)
    const statsRes = await fetch('/api/member-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stats', adminToken: token }),
    });
    const statsData = await statsRes.json();

    if (statsData.success) {
      contentEl.innerHTML = `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div style="background:rgba(123,92,255,0.1); border:1px solid rgba(123,92,255,0.25); border-radius:10px; padding:14px; text-align:center;">
            <div style="font-size:24px; font-weight:700; color:#7b5cff;">${statsData.totalMembers}</div>
            <div style="font-size:11px; color:#a0aec0; margin-top:4px;">Total Member</div>
          </div>
          <div style="background:rgba(0,229,197,0.1); border:1px solid rgba(0,229,197,0.25); border-radius:10px; padding:14px; text-align:center;">
            <div style="font-size:24px; font-weight:700; color:#00e5c0;">${statsData.totalActive}</div>
            <div style="font-size:11px; color:#a0aec0; margin-top:4px;">Member Aktif</div>
          </div>
          <div style="background:rgba(255,107,107,0.1); border:1px solid rgba(255,107,107,0.25); border-radius:10px; padding:14px; text-align:center; grid-column: span 2;">
            <div style="font-size:24px; font-weight:700; color:#ff6b6b;">${statsData.totalBanned}</div>
            <div style="font-size:11px; color:#a0aec0; margin-top:4px;">Member Diblokir</div>
          </div>
        </div>
      `;
    } else {
      contentEl.innerHTML = `<p style="color:#ff6b6b; font-size:12px; text-align:center; padding:20px;">${statsData.error || 'Gagal memuat statistik'}</p>`;
    }
  } catch (e) {
    contentEl.innerHTML = '<p style="color:#ff6b6b; font-size:12px; text-align:center; padding:20px;">Gagal terhubung ke server</p>';
  }
}
