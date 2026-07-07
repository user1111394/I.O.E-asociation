/* ═══════════════════════════════════════════════
   I.O.E HUB — SHARED AUTH HELPER
   Menyimpan & memverifikasi sesi login akun member
═══════════════════════════════════════════════ */

const IOE_SESSION_KEY = 'ioe_account_session';

function saveIoeSession(data) {
  const session = {
    memberId: data.memberId,
    username: data.username,
    nama: data.nama,
    rank: data.rank || 'Cadet',
    premium: !!data.premium,
    sessionToken: data.sessionToken,
  };
  localStorage.setItem(IOE_SESSION_KEY, JSON.stringify(session));
  return session;
}

function getIoeSession() {
  try {
    const raw = localStorage.getItem(IOE_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function clearIoeSession() {
  localStorage.removeItem(IOE_SESSION_KEY);
}

// Verifikasi session ke server — pastikan token masih valid (belum logout dari device lain, dll)
// Juga cek status ban: kalau akun di-ban, otomatis redirect ke ban.html
async function verifyIoeSession() {
  const session = getIoeSession();
  if (!session) return null;
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'verify',
        memberId: session.memberId,
        sessionToken: session.sessionToken,
      }),
    });
    const data = await res.json();
    if (!data.valid) {
      clearIoeSession();
      return null;
    }

    // Cek status ban — kalau banned, redirect ke halaman ban (kecuali sudah di sana)
    if (data.banned) {
      const alreadyOnBanPage = window.location.pathname.endsWith('ban.html');
      if (!alreadyOnBanPage) {
        sessionStorage.setItem('ioe_ban_reason', data.banReason || 'Pelanggaran aturan komunitas I.O.E');
        window.location.href = 'ban.html';
        return 'BANNED'; // marker khusus, bukan null, supaya requireIoeLogin tidak ikut redirect ke login.html
      }
    }

    // Update data lokal kalau ada perubahan (misal rank naik)
    return saveIoeSession({ ...session, ...data });
  } catch (e) {
    // Kalau gagal verifikasi (network error), tetap izinkan pakai data lokal
    // supaya user tidak ke-logout paksa hanya karena koneksi bermasalah sesaat
    return session;
  }
}

// Panggil ini di halaman yang WAJIB login (misal boarding pass, chat)
// Akan redirect ke login.html kalau belum login
async function requireIoeLogin() {
  const session = await verifyIoeSession();
  if (session === 'BANNED') return null; // redirect ke ban.html sudah ditangani, jangan redirect lagi
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}
