// api/ban.js — Ban / Unban device management (admin only, butuh valid token)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const DB_URL = process.env.FIREBASE_DB_URL;
  if (!DB_URL) return res.status(500).json({ error: 'FIREBASE_DB_URL tidak ditemukan' });

  const { action, token, deviceId, name, reason } = req.body;
  if (!token) return res.status(403).json({ error: 'Token diperlukan' });

  // Validasi token dulu
  try {
    const tr = await fetch(`${DB_URL}/admin_tokens/${token}.json`);
    const td = await tr.json();
    if (!td || Date.now() > td.expiresAt) {
      return res.status(403).json({ error: 'Token tidak valid atau kadaluarsa' });
    }
  } catch (e) {
    return res.status(500).json({ error: 'Gagal validasi token' });
  }

  // ── BAN ──
  if (action === 'ban') {
    if (!deviceId) return res.status(400).json({ error: 'deviceId diperlukan' });
    try {
      await fetch(`${DB_URL}/bans/${deviceId}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || 'Unknown',
          reason: reason || 'Pelanggaran aturan komunitas',
          bannedAt: Date.now(),
        }),
      });
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── UNBAN ──
  if (action === 'unban') {
    if (!deviceId) return res.status(400).json({ error: 'deviceId diperlukan' });
    try {
      await fetch(`${DB_URL}/bans/${deviceId}.json`, { method: 'DELETE' });
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── LIST BANS ──
  if (action === 'list') {
    try {
      const r = await fetch(`${DB_URL}/bans.json`);
      const d = await r.json();
      const list = d ? Object.entries(d).map(([id, v]) => ({ deviceId: id, ...v })) : [];
      return res.status(200).json({ bans: list });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Action tidak valid' });
}
