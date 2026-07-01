// api/findmember.js — Cari device ID berdasarkan nama (dari riwayat presence/messages)
export default async function handler(req, res) {
  const { name, token } = req.query;
  if (!name) return res.status(400).json({ error: 'Nama diperlukan' });

  const DB_URL = process.env.FIREBASE_DB_URL;
  if (!DB_URL) return res.status(500).json({ error: 'FIREBASE_DB_URL tidak ditemukan' });

  // Validasi token admin
  if (!token) return res.status(403).json({ error: 'Token diperlukan' });
  try {
    const tr = await fetch(`${DB_URL}/admin_tokens/${token}.json`);
    const td = await tr.json();
    if (!td || Date.now() > td.expiresAt) {
      return res.status(403).json({ error: 'Token tidak valid atau kadaluarsa' });
    }
  } catch (e) {
    return res.status(500).json({ error: 'Gagal validasi token' });
  }

  try {
    // Cari di name_devices mapping (dibuat saat user join chat)
    const r = await fetch(`${DB_URL}/name_devices.json`);
    const d = await r.json();
    if (!d) return res.status(200).json({ results: [] });

    const lowerName = name.toLowerCase();
    const results = Object.entries(d)
      .filter(([key, v]) => v.name && v.name.toLowerCase().includes(lowerName))
      .map(([key, v]) => ({ deviceId: v.deviceId, name: v.name, lastSeen: v.lastSeen }));

    return res.status(200).json({ results });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
