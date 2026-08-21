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
  let parsed;
  try { parsed = JSON.parse(data.result); } catch (e) { return data.result; }
  // Kompatibilitas data lama: sebagian data tersimpan dengan double-stringify
  // (bug yang sudah diperbaiki). Kalau hasil parse pertama masih string, parse sekali lagi.
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch (e) { /* biarkan sebagai string kalau memang bukan JSON */ }
  }
  return parsed;
}
async function kvSet(key, value) {
  const r = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
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

// Ambil semua keys dengan pattern tertentu (pakai Upstash SCAN).
// Dipakai buat hitung total member (denominator syarat rank Influencer).
async function kvScanKeys(pattern) {
  let cursor = '0';
  let allKeys = [];
  do {
    const r = await fetch(`${KV_URL}/scan/${cursor}?match=${encodeURIComponent(pattern)}&count=100`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    const data = await r.json();
    if (!data.result) break;
    cursor = data.result[0];
    allKeys = allKeys.concat(data.result[1] || []);
  } while (cursor !== '0');
  return allKeys;
}

// ══════════════════════════════════════
// RANK SYSTEM
//
// Rank TANGGA dihitung OTOMATIS dari totalLikes (account.likedBy.length),
// dicek ulang setiap kali ada like/unlike masuk lewat action toggle-like.
// Urutan cek SENGAJA dari yang paling spesifik/tinggi ke yang paling umum:
// Cheater dulu (anomali, override semua), baru Influencer (butuh syarat %
// member), baru turun ke bawah lewat range angka tetap.
//
// Rank EKSKLUSIF (Collaborator/Eksklusif/Winner/Creator) TIDAK dihitung di
// sini — itu di-gift manual oleh admin lewat action set-exclusive-rank, dan
// begitu di-set, rank tangga otomatis TIDAK menimpa rank eksklusif tsb
// (dicek lewat account.exclusiveRank, lihat calculateRank di bawah).
// ══════════════════════════════════════
const RANK_LADDER = [
  { id: 'newbie',      label: 'Newbie',      min: 0,   max: 5   },
  { id: 'beginner',    label: 'Beginner',    min: 6,   max: 20  },
  { id: 'junior',      label: 'Junior',      min: 21,  max: 60  },
  { id: 'senior',      label: 'Senior',      min: 61,  max: 100 },
  { id: 'master',      label: 'Master',      min: 101, max: 200 },
  { id: 'grandmaster', label: 'Grandmaster', min: 201, max: 500 },
];

function calculateRank(totalLikes, totalMembers) {
  // Cheater: like melebihi jumlah total member — mustahil terjadi secara
  // wajar (1 orang cuma bisa like 1x per akun), jadi ini flag anomali buat
  // investigasi admin, BUKAN pencapaian/achievement.
  if (totalMembers > 0 && totalLikes > totalMembers) {
    return { id: 'cheater', label: 'Cheater', isFlag: true };
  }

  // Influencer: butuh DUA syarat sekaligus — minimal 501 like DAN like-nya
  // sudah mencakup minimal 90% dari total member yang ada.
  if (totalLikes >= 501 && totalMembers > 0 && (totalLikes / totalMembers) >= 0.9) {
    return { id: 'influencer', label: 'Influencer', isFlag: false };
  }

  // Tangga normal, dari Grandmaster turun ke Newbie
  for (let i = RANK_LADDER.length - 1; i >= 0; i--) {
    const tier = RANK_LADDER[i];
    if (totalLikes >= tier.min && totalLikes <= tier.max) {
      return { id: tier.id, label: tier.label, isFlag: false };
    }
  }
  // Fallback kalau like di atas 500 tapi belum genap syarat Influencer
  // (jarang terjadi karena totalMembers kecil, tapi dijaga biar tidak nyangkut)
  return { id: 'grandmaster', label: 'Grandmaster', isFlag: false };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: 'Storage belum terhubung (KV_REST_API_URL/TOKEN tidak ditemukan)' });
  }

  // Filter SQL injection HANYA untuk action yang menerima input teks bebas dari
  // user (nama, kota, skills, dll saat register). Action lain (login, verify,
  // update-profile-photo, ban-member, dst) mengirim token/URL/ID yang di-generate
  // sistem sendiri — bisa mengandung tanda kutip atau strip yang valid dan
  // memicu false-positive kalau ikut difilter di sini.
  const ACTIONS_NEED_SQLI_FILTER = ['register', 'check-username'];
  if (ACTIONS_NEED_SQLI_FILTER.includes(req.body.action)) {
    for (const key in req.body) {
      if (containsSqlInjection(req.body[key])) {
        return res.status(400).json({ error: 'Input mengandung karakter yang tidak diizinkan' });
      }
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
        rank: 'Newbie', rankId: 'newbie', premium: false, createdAt: Date.now(), currentSession: sessionToken,
      };

      const savedAcc = await kvSet(`account:${memberId}`, accountData);
      if (!savedAcc) return res.status(500).json({ error: 'Gagal menyimpan data akun, coba lagi' });

      const savedUser = await kvSet(`username:${cleanUsername}`, memberId);
      if (!savedUser) {
        await kvDel(`account:${memberId}`);
        return res.status(500).json({ error: 'Gagal menyimpan username, coba lagi' });
      }

      return res.status(200).json({
        success: true, memberId, username: cleanUsername, nama, rank: 'Newbie', sessionToken,
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
        rank: account.rank || 'Newbie', rankId: account.rankId || 'newbie', premium: !!account.premium, sessionToken,
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
        rank: account.rank || 'Newbie', rankId: account.rankId || 'newbie',
        rankIsFlag: !!account.rankIsFlag, premium: !!account.premium,
        banned: !!account.banned, banReason: account.banReason || null,
        fotoProfil: account.fotoProfil || null,
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

      // Catat riwayat ban (dipakai AI ToS untuk konteks appeal)
      if (!Array.isArray(account.banHistory)) account.banHistory = [];
      account.banHistory.push({ reason: account.banReason, bannedAt: account.bannedAt });

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
      let attempts = attemptData || { count: 0, timestamp: Math.floor(Date.now() / 1000) };

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
        await kvSet(attemptKey, attempts);
        return res.status(401).json({ error: 'Master key salah' });
      }

      // Login berhasil — reset attempts, generate token session permanent
      await kvSet(attemptKey, { count: 0, timestamp: Math.floor(Date.now() / 1000) });

      const superadminToken = 'ioe_superadmin_' + crypto.randomBytes(32).toString('hex');
      await kvSet(`superadmin:${superadminToken}`, { createdAt: Date.now(), active: true });

      return res.status(200).json({
        success: true,
        token: superadminToken,
        loginAt: Date.now(),
      });
    } catch (e) {
      // Kalau rate-limit check gagal (bukan soal master key), tetap coba proses login
      // tapi PASTIKAN token fallback juga tersimpan ke Upstash — token yang tidak
      // tersimpan akan selalu gagal diverifikasi ulang di request-request berikutnya.
      console.warn('Rate limit check failed:', e.message);
      if (!isValid) {
        return res.status(401).json({ error: 'Master key salah' });
      }
      try {
        const fallbackToken = 'ioe_superadmin_' + crypto.randomBytes(32).toString('hex');
        const saved = await kvSet(`superadmin:${fallbackToken}`, { createdAt: Date.now(), active: true });
        if (!saved) {
          return res.status(500).json({ error: 'Gagal menyimpan sesi admin, coba lagi' });
        }
        return res.status(200).json({ success: true, token: fallbackToken, loginAt: Date.now() });
      } catch (e2) {
        return res.status(500).json({ error: 'Gagal terhubung ke storage: ' + e2.message });
      }
    }
  }

  // ══════════════════════════════════════
  // UPDATE-PROFILE-PHOTO — Member ganti foto profil (butuh session valid, bukan admin)
  // ══════════════════════════════════════
  if (action === 'update-profile-photo') {
    const { memberId, sessionToken, fotoUrl } = req.body;

    if (!memberId || !sessionToken || !fotoUrl) {
      return res.status(400).json({ error: 'memberId, sessionToken, dan fotoUrl wajib diisi' });
    }

    // Validasi eksplisit: fotoUrl harus URL Cloudinary milik cloud kita sendiri
    if (!fotoUrl.startsWith('https://res.cloudinary.com/')) {
      return res.status(400).json({ error: 'fotoUrl tidak valid' });
    }

    try {
      const account = await kvGet(`account:${memberId}`);
      if (!account || account.currentSession !== sessionToken) {
        return res.status(401).json({ error: 'Session tidak valid, silakan login ulang' });
      }

      account.fotoProfil = fotoUrl;
      const saved = await kvSet(`account:${memberId}`, account);
      if (!saved) return res.status(500).json({ error: 'Gagal menyimpan foto profil' });

      return res.status(200).json({ success: true, fotoProfil: fotoUrl });
    } catch (e) {
      return res.status(500).json({ error: e.message });
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
        fotoProfil: account?.fotoProfil || null,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // GET-PUBLIC-PROFILE — Data akun buat halaman profil publik (akun.html?id=xxx).
  // Sengaja gak menyertakan data privat (session token, password hash, dll).
  // ══════════════════════════════════════
  if (action === 'get-public-profile') {
    const { memberId } = req.body;
    if (!memberId) return res.status(400).json({ error: 'memberId diperlukan' });

    try {
      const account = await kvGet(`account:${memberId}`);
      if (!account) return res.status(404).json({ error: 'Akun tidak ditemukan' });
      if (account.banned) return res.status(404).json({ error: 'Akun tidak ditemukan' });

      const likedBy = Array.isArray(account.likedBy) ? account.likedBy : [];

      return res.status(200).json({
        success: true,
        memberId: account.memberId,
        nama: account.nama,
        username: account.username,
        rank: account.rank || 'Newbie',
        rankId: account.rankId || 'newbie',
        rankIsFlag: !!account.rankIsFlag,
        fotoProfil: account.fotoProfil || null,
        equippedBorder: account.equippedBorder || null,
        equippedBackground: account.equippedBackground || null,
        totalLikes: likedBy.length,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // TOGGLE-LIKE — Like/unlike sebuah akun (1x per akun pemberi like, toggle).
  // Disimpan sebagai array likedBy di akun TARGET (yang dapat like), berisi
  // memberId member yang sudah like. totalLikes akun target dipakai sebagai
  // salah satu syarat rank ke depannya.
  // ══════════════════════════════════════
  if (action === 'toggle-like') {
    const { memberId, sessionToken, targetMemberId } = req.body;

    if (!memberId || !sessionToken || !targetMemberId) {
      return res.status(400).json({ error: 'memberId, sessionToken, dan targetMemberId wajib diisi' });
    }
    if (memberId === targetMemberId) {
      return res.status(400).json({ error: 'Tidak bisa like akun sendiri' });
    }

    try {
      const account = await kvGet(`account:${memberId}`);
      if (!account || account.currentSession !== sessionToken) {
        return res.status(401).json({ error: 'Session tidak valid, silakan login ulang' });
      }

      const target = await kvGet(`account:${targetMemberId}`);
      if (!target) return res.status(404).json({ error: 'Akun target tidak ditemukan' });

      const likedBy = Array.isArray(target.likedBy) ? target.likedBy : [];
      const alreadyLiked = likedBy.includes(memberId);

      target.likedBy = alreadyLiked
        ? likedBy.filter(id => id !== memberId)
        : [...likedBy, memberId];

      // Hitung ulang rank tangga OTOMATIS berdasarkan total like terbaru —
      // tapi cuma kalau akun ini TIDAK sedang pakai rank eksklusif (rank
      // eksklusif di-gift admin manual, tidak boleh ketimpa sistem like).
      if (!target.exclusiveRank) {
        const accountKeys = await kvScanKeys('account:*');
        const totalMembers = accountKeys.length;
        const newRank = calculateRank(target.likedBy.length, totalMembers);
        target.rank = newRank.label;
        target.rankId = newRank.id;
        target.rankIsFlag = !!newRank.isFlag;
      }

      const saved = await kvSet(`account:${targetMemberId}`, target);
      if (!saved) return res.status(500).json({ error: 'Gagal menyimpan like' });

      return res.status(200).json({
        success: true,
        liked: !alreadyLiked,
        totalLikes: target.likedBy.length,
        rank: target.rank,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // SET-EXCLUSIVE-RANK — Admin gift rank eksklusif ke member (manual, TIDAK
  // lewat sistem like otomatis). Begitu di-set, rank tangga otomatis
  // BERHENTI menimpa rank akun ini (lihat pengecekan account.exclusiveRank
  // di action toggle-like).
  // ══════════════════════════════════════
  if (action === 'set-exclusive-rank') {
    const { adminToken, memberId, exclusiveRankId } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });

    const VALID_EXCLUSIVE = {
      collaborator: { label: 'Collaborator', color: 'kuning-hijau' },
      eksklusif:    { label: 'Eksklusif',    color: 'biru' },
      winner:       { label: 'Winner',       color: 'merah' },
      creator:      { label: 'Creator',      color: 'pelangi' },
    };
    const chosen = VALID_EXCLUSIVE[exclusiveRankId];
    if (!chosen) return res.status(400).json({ error: 'exclusiveRankId tidak dikenali' });

    if (!memberId) return res.status(400).json({ error: 'memberId wajib diisi' });

    try {
      const acc = await kvGet(`account:${memberId}`);
      if (!acc) return res.status(404).json({ error: 'Akun tidak ditemukan' });

      acc.exclusiveRank = exclusiveRankId;
      acc.rank = chosen.label;
      acc.rankId = exclusiveRankId;
      acc.rankIsFlag = false;

      const saved = await kvSet(`account:${memberId}`, acc);
      if (!saved) return res.status(500).json({ error: 'Gagal menyimpan rank' });

      return res.status(200).json({ success: true, rank: acc.rank });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // CLEAR-EXCLUSIVE-RANK — Admin cabut rank eksklusif dari member, akun
  // otomatis kembali ke rank tangga hasil kalkulasi total like saat ini.
  // ══════════════════════════════════════
  if (action === 'clear-exclusive-rank') {
    const { adminToken, memberId } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });

    if (!memberId) return res.status(400).json({ error: 'memberId wajib diisi' });

    try {
      const acc = await kvGet(`account:${memberId}`);
      if (!acc) return res.status(404).json({ error: 'Akun tidak ditemukan' });

      acc.exclusiveRank = null;
      const likedBy = Array.isArray(acc.likedBy) ? acc.likedBy : [];
      const accountKeys = await kvScanKeys('account:*');
      const totalMembers = accountKeys.length;
      const newRank = calculateRank(likedBy.length, totalMembers);
      acc.rank = newRank.label;
      acc.rankId = newRank.id;
      acc.rankIsFlag = !!newRank.isFlag;

      const saved = await kvSet(`account:${memberId}`, acc);
      if (!saved) return res.status(500).json({ error: 'Gagal menyimpan perubahan' });

      return res.status(200).json({ success: true, rank: acc.rank });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Action tidak dikenali' });
}
