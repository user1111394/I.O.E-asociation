// api/auth.js — Sistem Akun Resmi I.O.E
// Menangani: register (daftar akun baru), login (username+password)
// Password di-hash pakai SHA-256 + salt sebelum disimpan (tidak pernah simpan plaintext)
// Storage: Upstash Redis (REST API) — bukan Firebase

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
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 7; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return 'IOE-' + code;
}

// ── Upstash Redis REST helper ──
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvGet(key) {
  const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const data = await r.json();
  if (data.result === null || data.result === undefined) return null;
  try { return JSON.parse(data.result); } catch (e) { return data.result; }
}
async function kvSet(key, value) {
  const r = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(value)),
  });
  return r.ok;
}
async function kvDel(key) {
  const r = await fetch(`${KV_URL}/del/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  return r.ok;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: 'Storage belum terhubung (KV_REST_API_URL/TOKEN tidak ditemukan)' });
  }

  const { action } = req.body;

  // ══════════════════════════════════════
  // REGISTER
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
      const existingId = await kvGet(`username:${cleanUsername}`);
      if (existingId) {
        const existingAcc = await kvGet(`account:${existingId}`);
        if (existingAcc && existingAcc.passwordHash) {
          return res.status(409).json({ error: 'Username sudah dipakai, coba yang lain' });
        }
        // Data sampah dari percobaan sebelumnya — bersihkan
        await kvDel(`username:${cleanUsername}`);
      }

      let memberId = generateMemberId();
      let attempts = 0;
      while (attempts < 5) {
        const idExisting = await kvGet(`account:${memberId}`);
        if (!idExisting) break;
        memberId = generateMemberId();
        attempts++;
      }

      const salt = generateSalt();
      const passwordHash = hashPassword(password, salt);
      const sessionToken = generateSessionToken();

      const accountData = {
        memberId, username: cleanUsername, passwordHash, salt, nama,
        usia: usia || null, kota: kota || null, skills: skills || null,
        rank: 'Cadet', premium: false, createdAt: Date.now(), currentSession: sessionToken,
      };

      const savedAcc = await kvSet(`account:${memberId}`, accountData);
      if (!savedAcc) return res.status(500).json({ error: 'Gagal menyimpan data akun, coba lagi' });

      const savedUser = await kvSet(`username:${cleanUsername}`, memberId);
      if (!savedUser) {
        await kvDel(`account:${memberId}`);
        return res.status(500).json({ error: 'Gagal menyimpan username, coba lagi' });
      }

      return res.status(200).json({
        success: true, memberId, username: cleanUsername, nama, rank: 'Cadet', sessionToken,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // LOGIN
  // ══════════════════════════════════════
  if (action === 'login') {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username dan password wajib diisi' });
    }
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');

    try {
      const memberId = await kvGet(`username:${cleanUsername}`);
      if (!memberId) return res.status(401).json({ error: 'Username atau password salah' });

      const account = await kvGet(`account:${memberId}`);
      if (!account) return res.status(401).json({ error: 'Username atau password salah' });

      const hashCheck = hashPassword(password, account.salt);
      if (hashCheck !== account.passwordHash) {
        return res.status(401).json({ error: 'Username atau password salah' });
      }

      const sessionToken = generateSessionToken();
      account.currentSession = sessionToken;
      await kvSet(`account:${memberId}`, account);

      return res.status(200).json({
        success: true, memberId, username: account.username, nama: account.nama,
        rank: account.rank || 'Cadet', premium: !!account.premium, sessionToken,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // VERIFY SESSION
  // ══════════════════════════════════════
  if (action === 'verify') {
    const { memberId, sessionToken } = req.body;
    if (!memberId || !sessionToken) return res.status(200).json({ valid: false });
    try {
      const account = await kvGet(`account:${memberId}`);
      if (!account || account.currentSession !== sessionToken) {
        return res.status(200).json({ valid: false });
      }
      return res.status(200).json({
        valid: true, memberId, username: account.username, nama: account.nama,
        rank: account.rank || 'Cadet', premium: !!account.premium,
      });
    } catch (e) {
      return res.status(200).json({ valid: false });
    }
  }

  // ══════════════════════════════════════
  // CHECK-USERNAME (debug)
  // ══════════════════════════════════════
  if (action === 'check-username') {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'username diperlukan' });
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    try {
      const memberId = await kvGet(`username:${cleanUsername}`);
      if (!memberId) return res.status(200).json({ exists: false, cleanUsername });
      const account = await kvGet(`account:${memberId}`);
      return res.status(200).json({
        exists: true, cleanUsername, memberId,
        nama: account?.nama || null, createdAt: account?.createdAt || null,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Action tidak dikenali' });
}
