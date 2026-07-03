// api/auth.js — Sistem Akun Resmi I.O.E
// Menangani: register (daftar akun baru), login (username+password)
// Password di-hash pakai SHA-256 + salt sebelum disimpan (tidak pernah simpan plaintext)

import crypto from 'crypto';

function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(password + salt).digest('hex');
}

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function generateSessionToken() {
  return 'ioesess_' + crypto.randomBytes(24).toString('hex');
}

function generateMemberId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // tanpa karakter ambigu (0,O,1,I)
  let code = '';
  for (let i = 0; i < 7; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return 'IOE-' + code;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const DB_URL = process.env.FIREBASE_DB_URL;
  if (!DB_URL) return res.status(500).json({ error: 'FIREBASE_DB_URL tidak ditemukan' });

  const { action } = req.body;

  // ══════════════════════════════════════
  // REGISTER — Daftar akun baru
  // ══════════════════════════════════════
  if (action === 'register') {
    const { username, password, nama, usia, kota, skills } = req.body;

    if (!username || !password || !nama) {
      return res.status(400).json({ error: 'Username, password, dan nama wajib diisi' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password minimal 6 karakter' });
    }
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (cleanUsername.length < 3) {
      return res.status(400).json({ error: 'Username minimal 3 karakter (huruf/angka/underscore)' });
    }

    try {
      // Cek apakah username sudah dipakai — tapi validasi juga bahwa account
      // yang ditunjuk itu benar-benar ada & valid (bukan entri sampah/corrupt)
      const checkRes = await fetch(`${DB_URL}/usernames/${cleanUsername}.json`);
      const existingId = await checkRes.json();

      if (existingId && typeof existingId === 'string') {
        const existingAccRes = await fetch(`${DB_URL}/accounts/${existingId}.json`);
        const existingAcc = await existingAccRes.json();
        if (existingAcc && existingAcc.passwordHash) {
          // Data valid & lengkap — username memang benar-benar sudah dipakai
          return res.status(409).json({ error: 'Username sudah dipakai, coba yang lain' });
        }
        // Kalau sampai sini: entri /usernames ada tapi account-nya kosong/rusak.
        // Ini data sampah dari percobaan register yang gagal di tengah jalan — bersihkan lalu lanjut daftar.
        await fetch(`${DB_URL}/usernames/${cleanUsername}.json`, { method: 'DELETE' });
      } else if (existingId) {
        // existingId ada tapi bukan string (misal object corrupt) — hapus juga
        await fetch(`${DB_URL}/usernames/${cleanUsername}.json`, { method: 'DELETE' });
      }

      // Generate member ID unik
      let memberId = generateMemberId();
      // Pastikan belum dipakai (walau sangat kecil kemungkinan collision)
      let attempts = 0;
      while (attempts < 5) {
        const idCheckRes = await fetch(`${DB_URL}/accounts/${memberId}.json`);
        const idExisting = await idCheckRes.json();
        if (!idExisting) break;
        memberId = generateMemberId();
        attempts++;
      }

      const salt = generateSalt();
      const passwordHash = hashPassword(password, salt);
      const sessionToken = generateSessionToken();

      const accountData = {
        memberId,
        username: cleanUsername,
        passwordHash,
        salt,
        nama,
        usia: usia || null,
        kota: kota || null,
        skills: skills || null,
        rank: 'Cadet',
        premium: false,
        createdAt: Date.now(),
        currentSession: sessionToken,
      };

      // Simpan akun DULU, baru mapping username -> memberId
      // (urutan ini penting: kalau accounts gagal simpan, usernames tidak akan
      // menunjuk ke data kosong seperti bug sebelumnya)
      const saveAccRes = await fetch(`${DB_URL}/accounts/${memberId}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accountData),
      });
      if (!saveAccRes.ok) {
        return res.status(500).json({ error: 'Gagal menyimpan data akun, coba lagi' });
      }

      const saveUserRes = await fetch(`${DB_URL}/usernames/${cleanUsername}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memberId),
      });
      if (!saveUserRes.ok) {
        // Rollback: hapus account yang sudah terlanjur dibuat supaya tidak jadi sampah
        await fetch(`${DB_URL}/accounts/${memberId}.json`, { method: 'DELETE' });
        return res.status(500).json({ error: 'Gagal menyimpan username, coba lagi' });
      }

      return res.status(200).json({
        success: true,
        memberId,
        username: cleanUsername,
        nama,
        rank: 'Cadet',
        sessionToken,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // LOGIN — Masuk pakai username + password
  // ══════════════════════════════════════
  if (action === 'login') {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username dan password wajib diisi' });
    }
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');

    try {
      const idRes = await fetch(`${DB_URL}/usernames/${cleanUsername}.json`);
      const memberId = await idRes.json();
      if (!memberId) {
        return res.status(401).json({ error: 'Username atau password salah' });
      }

      const accRes = await fetch(`${DB_URL}/accounts/${memberId}.json`);
      const account = await accRes.json();
      if (!account) {
        return res.status(401).json({ error: 'Username atau password salah' });
      }

      const hashCheck = hashPassword(password, account.salt);
      if (hashCheck !== account.passwordHash) {
        return res.status(401).json({ error: 'Username atau password salah' });
      }

      // Generate session token baru tiap login
      const sessionToken = generateSessionToken();
      await fetch(`${DB_URL}/accounts/${memberId}/currentSession.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionToken),
      });

      return res.status(200).json({
        success: true,
        memberId,
        username: account.username,
        nama: account.nama,
        rank: account.rank || 'Cadet',
        premium: !!account.premium,
        sessionToken,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // VERIFY SESSION — Cek apakah session token masih valid
  // ══════════════════════════════════════
  if (action === 'verify') {
    const { memberId, sessionToken } = req.body;
    if (!memberId || !sessionToken) {
      return res.status(400).json({ valid: false });
    }
    try {
      const accRes = await fetch(`${DB_URL}/accounts/${memberId}.json`);
      const account = await accRes.json();
      if (!account || account.currentSession !== sessionToken) {
        return res.status(200).json({ valid: false });
      }
      return res.status(200).json({
        valid: true,
        memberId,
        username: account.username,
        nama: account.nama,
        rank: account.rank || 'Cadet',
        premium: !!account.premium,
      });
    } catch (e) {
      return res.status(200).json({ valid: false });
    }
  }

  // ══════════════════════════════════════
  // CHECK-USERNAME — Debug: cek apakah username terdaftar (tanpa expose password)
  // ══════════════════════════════════════
  if (action === 'check-username') {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'username diperlukan' });
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    try {
      const idRes = await fetch(`${DB_URL}/usernames/${cleanUsername}.json`);
      const memberId = await idRes.json();
      if (!memberId) {
        return res.status(200).json({ exists: false, cleanUsername });
      }
      const accRes = await fetch(`${DB_URL}/accounts/${memberId}.json`);
      const account = await accRes.json();
      return res.status(200).json({
        exists: true,
        cleanUsername,
        memberId,
        nama: account?.nama || null,
        createdAt: account?.createdAt || null,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Action tidak dikenali' });
}
