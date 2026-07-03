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
      // Cek apakah username sudah dipakai
      const checkRes = await fetch(`${DB_URL}/usernames/${cleanUsername}.json`);
      const existing = await checkRes.json();
      if (existing) {
        return res.status(409).json({ error: 'Username sudah dipakai, coba yang lain' });
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

      // Simpan akun + mapping username -> memberId
      await fetch(`${DB_URL}/accounts/${memberId}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accountData),
      });
      await fetch(`${DB_URL}/usernames/${cleanUsername}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memberId),
      });

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

  return res.status(400).json({ error: 'Action tidak dikenali' });
}
