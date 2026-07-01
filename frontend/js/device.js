/* ═══════════════════════════════════════════════
   I.O.E HUB — DEVICE FINGERPRINT & BAN SYSTEM
   Menghasilkan device ID unik per browser untuk:
   - Anti duplikat username
   - Enforcement ban total (device-based, bukan nama)
═══════════════════════════════════════════════ */

/**
 * Generate fingerprint sederhana berbasis karakteristik browser.
 * Bukan 100% unik secara cryptographic, tapi cukup kuat untuk
 * mencegah user yang sama login ulang dengan nama berbeda
 * di browser/device yang sama.
 */
async function getDeviceId() {
  // Cek cache dulu (biar konsisten antar kunjungan)
  let cached = localStorage.getItem('ioe_device_id');
  if (cached) return cached;

  const parts = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || 'na',
    navigator.platform || 'na',
  ];

  // Canvas fingerprint tambahan (lebih unik antar device)
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('IOE-FP-' + parts.join('|'), 2, 2);
    parts.push(canvas.toDataURL());
  } catch(e) {}

  const raw = parts.join('###');
  const hash = await sha256(raw);
  const deviceId = 'dev_' + hash.slice(0, 24);

  localStorage.setItem('ioe_device_id', deviceId);
  return deviceId;
}

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Cek apakah device ini sedang di-ban.
 * Return: { banned: bool, reason: string, until: number|null }
 */
async function checkBanStatus() {
  try {
    const deviceId = await getDeviceId();
    const res = await fetch('/api/checkban?deviceId=' + encodeURIComponent(deviceId));
    if (!res.ok) return { banned: false };
    return await res.json();
  } catch(e) {
    return { banned: false }; // fail-open biar gak block user kalau API down
  }
}

/**
 * Tampilkan layar "Anda diblokir" full screen.
 */
function showBanScreen(reason) {
  document.body.innerHTML = `
    <div style="
      position:fixed;inset:0;z-index:99999;
      background:#04040a;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      padding:32px;text-align:center;font-family:'Inter',sans-serif;
    ">
      <div style="font-size:3.5rem;margin-bottom:20px;">🚫</div>
      <div style="font-family:'Space Grotesk',sans-serif;font-size:1.3rem;font-weight:700;color:#fff;margin-bottom:10px;">
        Akses Diblokir
      </div>
      <div style="font-size:0.9rem;color:rgba(255,255,255,0.5);max-width:340px;line-height:1.6;margin-bottom:8px;">
        Perangkat ini telah diblokir dari I.O.E Hub oleh administrator.
      </div>
      ${reason ? `<div style="font-size:0.8rem;color:rgba(255,100,100,0.7);max-width:340px;line-height:1.5;margin-top:10px;padding:10px 14px;background:rgba(255,60,110,0.08);border:1px solid rgba(255,60,110,0.2);border-radius:10px;">Alasan: ${reason}</div>` : ''}
      <div style="font-size:0.7rem;color:rgba(255,255,255,0.2);margin-top:24px;">I.O.E HUB · SECURITY SYSTEM</div>
    </div>
  `;
}

/**
 * Jalankan ban check di awal load halaman.
 * Panggil ini di setiap halaman yang ingin diproteksi.
 */
async function enforceBanCheck() {
  const status = await checkBanStatus();
  if (status.banned) {
    showBanScreen(status.reason);
    return true;
  }
  return false;
}
