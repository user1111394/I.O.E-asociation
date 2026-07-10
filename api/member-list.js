// api/member-list.js — Cari & list akun resmi I.O.E (Upstash Redis)
// File terpisah dari auth.js, khusus dipakai oleh Superadmin Panel.

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
  // Kompatibilitas data lama yang sempat tersimpan dengan double-stringify
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch (e) { /* biarkan sebagai string */ }
  }
  return parsed;
}

// Ambil semua keys dengan pattern tertentu (pakai Upstash SCAN)
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: 'Storage belum terhubung' });
  }

  const { action, adminToken, query } = req.body;

  // Proteksi: adminToken di sini adalah session token superadmin (hasil login di super-admin.html),
  // BUKAN master key mentah. Verifikasi dengan cek keberadaannya di Upstash.
  if (!adminToken) {
    return res.status(403).json({ error: 'Akses admin tidak valid' });
  }
  try {
    const saSession = await kvGet(`superadmin:${adminToken}`);
    if (!saSession || !saSession.active) {
      return res.status(403).json({ error: 'Akses admin tidak valid' });
    }
  } catch (e) {
    return res.status(500).json({ error: 'Gagal verifikasi sesi admin' });
  }

  // ══════════════════════════════════════
  // LIST-ALL — Ambil semua member (dengan info dasar buat ditampilkan di panel)
  // ══════════════════════════════════════
  if (action === 'list-all') {
    try {
      const accountKeys = await kvScanKeys('account:*');
      const members = [];

      for (const key of accountKeys) {
        const acc = await kvGet(key);
        if (!acc) continue;
        members.push({
          memberId: acc.memberId,
          username: acc.username,
          nama: acc.nama,
          rank: acc.rank || 'Cadet',
          banned: !!acc.banned,
          banReason: acc.banReason || null,
          createdAt: acc.createdAt || null,
          lastOnline: acc.lastOnline || null,
        });
      }

      // Urutkan: terbaru daftar duluan
      members.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      return res.status(200).json({ success: true, total: members.length, members });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // SEARCH — Cari member berdasarkan nama atau username (partial match)
  // ══════════════════════════════════════
  if (action === 'search') {
    if (!query || query.trim().length < 1) {
      return res.status(400).json({ error: 'Kata kunci pencarian diperlukan' });
    }

    try {
      const accountKeys = await kvScanKeys('account:*');
      const lowerQuery = query.trim().toLowerCase();
      const results = [];

      for (const key of accountKeys) {
        const acc = await kvGet(key);
        if (!acc) continue;

        const namaMatch = acc.nama && acc.nama.toLowerCase().includes(lowerQuery);
        const usernameMatch = acc.username && acc.username.toLowerCase().includes(lowerQuery);
        const idMatch = acc.memberId && acc.memberId.toLowerCase().includes(lowerQuery);

        if (namaMatch || usernameMatch || idMatch) {
          results.push({
            memberId: acc.memberId,
            username: acc.username,
            nama: acc.nama,
            rank: acc.rank || 'Cadet',
            banned: !!acc.banned,
            banReason: acc.banReason || null,
            createdAt: acc.createdAt || null,
            lastOnline: acc.lastOnline || null,
          });
        }
      }

      return res.status(200).json({ success: true, total: results.length, members: results });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // STATS — Statistik dasar (total member, total banned)
  // ══════════════════════════════════════
  if (action === 'stats') {
    try {
      const accountKeys = await kvScanKeys('account:*');
      let totalMembers = 0;
      let totalBanned = 0;

      for (const key of accountKeys) {
        const acc = await kvGet(key);
        if (!acc) continue;
        totalMembers++;
        if (acc.banned) totalBanned++;
      }

      return res.status(200).json({
        success: true,
        totalMembers,
        totalBanned,
        totalActive: totalMembers - totalBanned,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Action tidak dikenali' });
}
