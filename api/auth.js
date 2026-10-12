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

// ── Pojok Baca: penyimpanan multi-cerita ──
// Struktur di Redis (hemat command & aman dari batas ukuran request Upstash 1 MB):
//   pojokbaca:index         -> [{ id, title, coverUrl, synopsis, chapterCount, updatedAt }]  (metadata ringan, buat rak)
//   pojokbaca:story:{id}    -> { id, title, coverUrl, synopsis, chapters:[{title,content}], updatedAt }  (1 cerita utuh)
//   pojokbaca:access        -> [memberId, ...]  (tidak berubah)
//   pojokbaca:novel         -> KEY LAMA (1 novel). Dimigrasi otomatis jadi cerita id "legacy"; tidak dihapus.
const POJOK_INDEX_KEY = 'pojokbaca:index';
const POJOK_MAX_STORIES = 100;
const POJOK_MAX_STORY_BYTES = 900000; // di bawah batas 1 MB request Upstash
const pojokStoryKey = (id) => `pojokbaca:story:${id}`;
const isValidStoryId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(id);
const isCloudinaryUrl = (u) => typeof u === 'string' && /^https:\/\/res\.cloudinary\.com\//.test(u);

function toIndexEntry(story) {
  return {
    id: story.id,
    title: story.title,
    coverUrl: story.coverUrl || null,
    synopsis: story.synopsis || '',
    chapterCount: Array.isArray(story.chapters) ? story.chapters.length : 0,
    updatedAt: story.updatedAt || Date.now(),
  };
}

// Baca daftar cerita. Kalau index belum ada tapi novel lama ada, migrasikan (id tetap "legacy"
// supaya aman kalau dua request pertama datang bersamaan — hasilnya identik, tidak jadi dobel).
async function getPojokIndex() {
  const idx = await kvGet(POJOK_INDEX_KEY);
  if (Array.isArray(idx)) return idx;

  const legacy = await kvGet('pojokbaca:novel');
  if (!legacy || typeof legacy !== 'object' || !Array.isArray(legacy.chapters)) return [];

  const story = {
    id: 'legacy',
    title: typeof legacy.title === 'string' && legacy.title ? legacy.title : 'Tanpa judul',
    coverUrl: isCloudinaryUrl(legacy.coverUrl) ? legacy.coverUrl : null,
    synopsis: '',
    chapters: legacy.chapters,
    updatedAt: legacy.updatedAt || Date.now(),
  };
  if (!(await kvSet(pojokStoryKey('legacy'), story))) throw new Error('Gagal memigrasi novel lama');
  const index = [toIndexEntry(story)];
  if (!(await kvSet(POJOK_INDEX_KEY, index))) throw new Error('Gagal memigrasi daftar cerita');
  return index;
}

// Verifikasi pembaca: session cocok + ada di daftar izin. Return null kalau lolos,
// atau [status, pesan] kalau ditolak. Selalu dicek server-side (bukan percaya hasil cek client).
async function verifyPojokReader(memberId, sessionToken) {
  if (!memberId || !sessionToken) return [401, 'Belum login'];
  const acc = await kvGet(`account:${memberId}`);
  if (!acc || acc.currentSession !== sessionToken) return [401, 'Sesi tidak valid, silakan login ulang'];
  const accessList = await kvGet('pojokbaca:access');
  if (!Array.isArray(accessList) || !accessList.includes(memberId)) {
    return [403, 'Kamu belum memiliki izin untuk membaca Pojok Baca'];
  }
  return null;
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

  // ══════════════════════════════════════
  // POJOK BACA — Halaman baca novel privat, hanya untuk member yang namanya
  // sudah ditambahkan ke daftar izin oleh superadmin. Mendukung BANYAK cerita:
  // "pojokbaca:access" (array memberId), "pojokbaca:index" (metadata rak) dan
  // "pojokbaca:story:{id}" (isi 1 cerita) — lihat helper di atas handler.
  // ══════════════════════════════════════

  // CHECK-POJOKBACA-ACCESS — dipanggil pojokbaca.html setelah member login,
  // untuk memutuskan tampilkan novel atau halaman "Belum Punya Izin".
  if (action === 'check-pojokbaca-access') {
    const { memberId } = req.body;
    if (!memberId) return res.status(400).json({ error: 'memberId wajib diisi' });
    try {
      const accessList = await kvGet('pojokbaca:access');
      const allowed = Array.isArray(accessList) && accessList.includes(memberId);
      return res.status(200).json({ allowed });
    } catch (e) {
      // Fail-closed: kalau gagal baca daftar izin, anggap TIDAK diizinkan.
      // Ini konten privat (karya pribadi), jadi salah ke arah "terlalu ketat"
      // jauh lebih aman daripada salah ke arah "kebocoran ke orang yang belum diizinkan".
      return res.status(200).json({ allowed: false });
    }
  }

  // ADD-POJOKBACA-ACCESS — superadmin menambahkan satu memberId ke daftar izin.
  if (action === 'add-pojokbaca-access') {
    const { adminToken, memberId } = req.body;
    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });
    if (!memberId) return res.status(400).json({ error: 'memberId wajib diisi' });

    try {
      // Verifikasi memberId ini benar akun yang ada, supaya daftar izin tidak
      // ketambahan ID asal-asalan/typo yang tidak pernah bisa dipakai siapa pun.
      const acc = await kvGet(`account:${memberId}`);
      if (!acc) return res.status(404).json({ error: 'Akun dengan memberId tersebut tidak ditemukan' });

      const accessList = await kvGet('pojokbaca:access');
      const list = Array.isArray(accessList) ? accessList : [];
      if (list.includes(memberId)) {
        return res.status(200).json({ success: true, alreadyExists: true, total: list.length });
      }
      list.push(memberId);
      const saved = await kvSet('pojokbaca:access', list);
      if (!saved) return res.status(500).json({ error: 'Gagal menyimpan daftar izin' });
      return res.status(200).json({ success: true, total: list.length });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // REMOVE-POJOKBACA-ACCESS — superadmin mencabut izin satu memberId.
  if (action === 'remove-pojokbaca-access') {
    const { adminToken, memberId } = req.body;
    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });
    if (!memberId) return res.status(400).json({ error: 'memberId wajib diisi' });

    try {
      const accessList = await kvGet('pojokbaca:access');
      const list = Array.isArray(accessList) ? accessList : [];
      const filtered = list.filter(id => id !== memberId);
      const saved = await kvSet('pojokbaca:access', filtered);
      if (!saved) return res.status(500).json({ error: 'Gagal menyimpan daftar izin' });
      return res.status(200).json({ success: true, total: filtered.length });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // LIST-POJOKBACA-ACCESS — superadmin melihat daftar member yang sudah diizinkan,
  // lengkap dengan nama & username (bukan cuma memberId mentah) supaya gampang dibaca di panel.
  if (action === 'list-pojokbaca-access') {
    const { adminToken } = req.body;
    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });

    try {
      const accessList = await kvGet('pojokbaca:access');
      const list = Array.isArray(accessList) ? accessList : [];
      const members = await Promise.all(list.map(async (memberId) => {
        const acc = await kvGet(`account:${memberId}`);
        return acc
          ? { memberId, username: acc.username, nama: acc.nama }
          : { memberId, username: null, nama: '(akun tidak ditemukan/sudah dihapus)' };
      }));
      return res.status(200).json({ success: true, members });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── ADMIN: daftar cerita (metadata) ──
  if (action === 'list-stories-admin') {
    const { adminToken } = req.body;
    if (!(await verifyAdminAccess(adminToken))) return res.status(403).json({ error: 'Akses admin tidak valid' });
    try {
      return res.status(200).json({ success: true, stories: await getPojokIndex() });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── ADMIN: ambil 1 cerita utuh untuk diisi ke form edit ──
  if (action === 'get-story-admin') {
    const { adminToken, storyId } = req.body;
    if (!(await verifyAdminAccess(adminToken))) return res.status(403).json({ error: 'Akses admin tidak valid' });
    if (!isValidStoryId(storyId)) return res.status(400).json({ error: 'storyId tidak valid' });
    try {
      await getPojokIndex(); // memastikan migrasi novel lama sudah jalan
      const story = await kvGet(pojokStoryKey(storyId));
      if (!story) return res.status(404).json({ error: 'Cerita tidak ditemukan' });
      return res.status(200).json({ success: true, story });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── ADMIN: buat cerita baru (tanpa storyId) atau perbarui yang ada (dengan storyId) ──
  // coverUrl berasal dari upload Cloudinary langsung dari browser, jadi di sini cuma menyimpan URL-nya;
  // harus https://res.cloudinary.com/... supaya aman dipasang sebagai <img src> di pojokbaca.html.
  if (action === 'save-story') {
    const { adminToken, storyId, title, synopsis, coverUrl, chapters } = req.body;
    if (!(await verifyAdminAccess(adminToken))) return res.status(403).json({ error: 'Akses admin tidak valid' });

    if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'title wajib diisi (judul cerita)' });
    if (title.length > 120) return res.status(400).json({ error: 'Judul maksimal 120 karakter' });
    if (synopsis !== undefined && synopsis !== null && typeof synopsis !== 'string') {
      return res.status(400).json({ error: 'synopsis harus berupa teks' });
    }
    if (typeof synopsis === 'string' && synopsis.length > 2000) {
      return res.status(400).json({ error: 'Sinopsis maksimal 2000 karakter' });
    }
    if (coverUrl !== undefined && coverUrl !== null && !isCloudinaryUrl(coverUrl)) {
      return res.status(400).json({ error: 'coverUrl harus URL Cloudinary yang valid (https://res.cloudinary.com/...)' });
    }
    if (!Array.isArray(chapters) || chapters.length === 0) {
      return res.status(400).json({ error: 'chapters wajib diisi, berupa array tidak kosong' });
    }
    if (chapters.length > 500) return res.status(400).json({ error: 'Maksimal 500 bab per cerita' });
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      if (!ch || typeof ch.title !== 'string' || typeof ch.content !== 'string') {
        return res.status(400).json({ error: `chapters[${i}] harus punya title & content (string)` });
      }
      if (ch.title.length > 200) return res.status(400).json({ error: `chapters[${i}].title maksimal 200 karakter` });
    }
    if (storyId !== undefined && storyId !== null && !isValidStoryId(storyId)) {
      return res.status(400).json({ error: 'storyId tidak valid' });
    }

    try {
      const index = await getPojokIndex();
      const isUpdate = !!storyId;
      if (isUpdate && !index.some(e => e.id === storyId)) {
        return res.status(404).json({ error: 'Cerita yang mau diperbarui tidak ditemukan' });
      }
      if (!isUpdate && index.length >= POJOK_MAX_STORIES) {
        return res.status(400).json({ error: `Maksimal ${POJOK_MAX_STORIES} cerita` });
      }

      const story = {
        id: isUpdate ? storyId : 's_' + crypto.randomBytes(6).toString('hex'),
        title: title.trim(),
        coverUrl: coverUrl || null,
        synopsis: (synopsis || '').trim(),
        chapters: chapters.map(ch => ({ title: ch.title, content: ch.content })),
        updatedAt: Date.now(),
      };
      if (JSON.stringify(story).length > POJOK_MAX_STORY_BYTES) {
        return res.status(400).json({ error: 'Cerita terlalu besar (maks ±900 KB teks). Kurangi isi bab atau pecah jadi cerita lain.' });
      }

      // Simpan isi cerita DULU, baru index — kalau index gagal, tidak ada entri rak yang menunjuk ke cerita kosong.
      if (!(await kvSet(pojokStoryKey(story.id), story))) return res.status(500).json({ error: 'Gagal menyimpan cerita' });
      const entry = toIndexEntry(story);
      const newIndex = isUpdate ? index.map(e => (e.id === story.id ? entry : e)) : [...index, entry];
      if (!(await kvSet(POJOK_INDEX_KEY, newIndex))) return res.status(500).json({ error: 'Gagal memperbarui daftar cerita' });

      return res.status(200).json({ success: true, storyId: story.id, chapterCount: story.chapters.length, created: !isUpdate });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── ADMIN: hapus cerita ──
  if (action === 'delete-story') {
    const { adminToken, storyId } = req.body;
    if (!(await verifyAdminAccess(adminToken))) return res.status(403).json({ error: 'Akses admin tidak valid' });
    if (!isValidStoryId(storyId)) return res.status(400).json({ error: 'storyId tidak valid' });
    try {
      const index = await getPojokIndex();
      if (!index.some(e => e.id === storyId)) return res.status(404).json({ error: 'Cerita tidak ditemukan' });
      const newIndex = index.filter(e => e.id !== storyId);
      // Index dulu (supaya langsung hilang dari rak), baru hapus isinya.
      if (!(await kvSet(POJOK_INDEX_KEY, newIndex))) return res.status(500).json({ error: 'Gagal memperbarui daftar cerita' });
      await kvDel(pojokStoryKey(storyId));
      return res.status(200).json({ success: true, total: newIndex.length });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── MEMBER: rak cerita (metadata saja: cover, judul, sinopsis, jumlah bab) ──
  if (action === 'get-shelf') {
    const { memberId, sessionToken } = req.body;
    try {
      const denied = await verifyPojokReader(memberId, sessionToken);
      if (denied) return res.status(denied[0]).json({ error: denied[1] });
      return res.status(200).json({ success: true, stories: await getPojokIndex() });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── MEMBER: satu cerita utuh (judul bab + isi). Izin & sesi dicek ulang di server. ──
  if (action === 'get-story') {
    const { memberId, sessionToken, storyId } = req.body;
    if (!isValidStoryId(storyId)) return res.status(400).json({ error: 'storyId tidak valid' });
    try {
      const denied = await verifyPojokReader(memberId, sessionToken);
      if (denied) return res.status(denied[0]).json({ error: denied[1] });
      const index = await getPojokIndex();
      if (!index.some(e => e.id === storyId)) return res.status(404).json({ error: 'Cerita tidak ditemukan' });
      const story = await kvGet(pojokStoryKey(storyId));
      if (!story) return res.status(404).json({ error: 'Cerita tidak ditemukan' });
      return res.status(200).json({ success: true, story });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Action tidak dikenali' });
}
