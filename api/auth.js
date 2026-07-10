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

// Terima akses admin dalam 2 bentuk: master key mentah (dipakai admin-ioe-secure.html lama)
// ATAU session token superadmin hasil login di super-admin.html (dipakai nav.js panel baru).
async function verifyAdminAccess(adminToken) {
  if (!adminToken) return false;
  const ADMIN_KEY = process.env.ADMIN_MASTER_KEY;
  if (ADMIN_KEY && adminToken === ADMIN_KEY) return true;
  try {
    const session = await kvGet(`superadmin:${adminToken}`);
    return !!(session && session.active);
  } catch (e) {
    return false;
  }
}

// Filter dasar pola-pola umum SQL injection / karakter berbahaya pada input teks.
// Kita tidak pakai SQL database (Upstash Redis key-value), tapi filter ini tetap
// jadi lapisan proteksi terhadap payload berbahaya yang mungkin nyasar ke input manapun.
const SQLI_PATTERN = /(\bunion\b|\bselect\b|\binsert\b|\bdelete\b|\bdrop\b|\bupdate\b|--|;|\/\*|\*\/|'|")/i;
function containsSqlInjection(value) {
  if (typeof value !== 'string') return false;
  return SQLI_PATTERN.test(value);
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

  // Filter semua field string di body request — tolak kalau ada pola SQL injection
  for (const key in req.body) {
    if (containsSqlInjection(req.body[key])) {
      return res.status(400).json({ error: 'Input mengandung karakter yang tidak diizinkan' });
    }
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
        banned: !!account.banned, banReason: account.banReason || null,
      });
    } catch (e) {
      return res.status(200).json({ valid: false });
    }
  }

  // ══════════════════════════════════════
  // BAN-MEMBER — Admin set status banned pada akun (via memberId atau username)
  // ══════════════════════════════════════
  if (action === 'ban-member') {
    const { memberId, username, reason, adminToken } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) {
      return res.status(403).json({ error: 'Akses admin tidak valid' });
    }

    if (!memberId && !username) {
      return res.status(400).json({ error: 'memberId atau username wajib diisi' });
    }

    try {
      let targetId = memberId;
      if (!targetId && username) {
        const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
        targetId = await kvGet(`username:${cleanUsername}`);
        if (!targetId) return res.status(404).json({ error: 'Username tidak ditemukan' });
      }

      const account = await kvGet(`account:${targetId}`);
      if (!account) return res.status(404).json({ error: 'Akun tidak ditemukan' });

      account.banned = true;
      account.banReason = reason || 'Pelanggaran aturan komunitas I.O.E';
      account.bannedAt = Date.now();

      const saved = await kvSet(`account:${targetId}`, account);
      if (!saved) return res.status(500).json({ error: 'Gagal menyimpan status ban' });

      return res.status(200).json({
        success: true, memberId: targetId, nama: account.nama, banReason: account.banReason,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // UNBAN-MEMBER — Admin cabut status banned
  // ══════════════════════════════════════
  if (action === 'unban-member') {
    const { memberId, username, adminToken } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) {
      return res.status(403).json({ error: 'Akses admin tidak valid' });
    }

    if (!memberId && !username) {
      return res.status(400).json({ error: 'memberId atau username wajib diisi' });
    }

    try {
      let targetId = memberId;
      if (!targetId && username) {
        const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
        targetId = await kvGet(`username:${cleanUsername}`);
        if (!targetId) return res.status(404).json({ error: 'Username tidak ditemukan' });
      }

      const account = await kvGet(`account:${targetId}`);
      if (!account) return res.status(404).json({ error: 'Akun tidak ditemukan' });

      account.banned = false;
      account.banReason = null;
      account.unbannedAt = Date.now();

      const saved = await kvSet(`account:${targetId}`, account);
      if (!saved) return res.status(500).json({ error: 'Gagal menyimpan status unban' });

      return res.status(200).json({ success: true, memberId: targetId, nama: account.nama });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // CHECK-BAN — Cek status ban akun (dipanggil ioe-auth.js pas load halaman)
  // ══════════════════════════════════════
  if (action === 'check-ban') {
    const { memberId } = req.body;
    if (!memberId) return res.status(200).json({ banned: false });

    try {
      const account = await kvGet(`account:${memberId}`);
      if (!account) return res.status(200).json({ banned: false });

      return res.status(200).json({
        banned: !!account.banned,
        reason: account.banReason || null,
        bannedAt: account.bannedAt || null,
      });
    } catch (e) {
      return res.status(200).json({ banned: false });
    }
  }

  // ══════════════════════════════════════
  // VERIFY-SUPERADMIN — Verify master-key untuk login superadmin (rate limit: 5x/minggu)
  // ══════════════════════════════════════
  if (action === 'verify-superadmin') {
    const { masterKey } = req.body;

    if (!masterKey) {
      return res.status(400).json({ error: 'Master key wajib diisi' });
    }

    const ADMIN_MASTER_KEY = process.env.ADMIN_MASTER_KEY;
    if (!ADMIN_MASTER_KEY) {
      return res.status(500).json({ error: 'Master key tidak terkonfigurasi' });
    }

    // Cek master key langsung (format validation sudah dicakup global SQLi filter di atas)
    const isValid = masterKey === ADMIN_MASTER_KEY;

    // Rate limit di backend juga (double-check): track di Redis
    // Key: `superadmin:attempts:{IP}` — store count + timestamp
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const ipClean = ip.split(',')[0].trim(); // ambil IP pertama kalau ada proxy
    const attemptKey = `superadmin:attempts:${ipClean}`;
    const RATE_LIMIT_MAX = 5;
    const RATE_LIMIT_WINDOW = 7 * 24 * 60 * 60; // 1 minggu (detik)

    try {
      const attemptData = await kvGet(attemptKey);
      let attempts = attemptData ? JSON.parse(attemptData) : { count: 0, timestamp: Math.floor(Date.now() / 1000) };

      // Reset kalau lewat window
      if (Math.floor(Date.now() / 1000) - attempts.timestamp > RATE_LIMIT_WINDOW) {
        attempts = { count: 0, timestamp: Math.floor(Date.now() / 1000) };
      }

      // Cek kalau sudah lock
      if (attempts.locked && Math.floor(Date.now() / 1000) - attempts.lockedAt < 86400) { // 24 jam
        return res.status(429).json({ error: 'Terlalu banyak percobaan login. Coba lagi dalam 24 jam.' });
      }

      // Reset lock kalau sudah 24 jam
      if (attempts.locked && Math.floor(Date.now() / 1000) - attempts.lockedAt >= 86400) {
        attempts.locked = false;
        attempts.count = 0;
      }

      // Kalau login gagal, increment count
      if (!isValid) {
        attempts.count += 1;
        if (attempts.count >= RATE_LIMIT_MAX) {
          attempts.locked = true;
          attempts.lockedAt = Math.floor(Date.now() / 1000);
        }
        await kvSet(attemptKey, JSON.stringify(attempts));
        return res.status(401).json({ error: 'Master key salah' });
      }

      // Login berhasil — reset attempts, generate token session permanent
      await kvSet(attemptKey, JSON.stringify({ count: 0, timestamp: Math.floor(Date.now() / 1000) }));

      const superadminToken = 'ioe_superadmin_' + crypto.randomBytes(32).toString('hex');
      await kvSet(`superadmin:${superadminToken}`, { createdAt: Date.now(), active: true });

      return res.status(200).json({
        success: true,
        token: superadminToken,
        loginAt: Date.now(),
      });
    } catch (e) {
      // Kalau Redis gagal, jangan block login tapi log warningnya
      console.warn('Rate limit check failed:', e.message);
      if (!isValid) {
        return res.status(401).json({ error: 'Master key salah' });
      }
      const fallbackToken = 'ioe_superadmin_' + crypto.randomBytes(32).toString('hex');
      return res.status(200).json({ success: true, token: fallbackToken, loginAt: Date.now() });
    }
  }

  // ══════════════════════════════════════
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
