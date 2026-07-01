// api/checkban.js — Cek status ban sebuah device
export default async function handler(req, res) {
  const { deviceId } = req.query;
  if (!deviceId) return res.status(400).json({ banned: false });

  const DB_URL = process.env.FIREBASE_DB_URL;
  if (!DB_URL) return res.status(200).json({ banned: false });

  try {
    const r = await fetch(`${DB_URL}/bans/${deviceId}.json`);
    const d = await r.json();
    if (!d) return res.status(200).json({ banned: false });
    return res.status(200).json({
      banned: true,
      reason: d.reason || 'Pelanggaran aturan komunitas',
      bannedAt: d.bannedAt || null,
    });
  } catch (e) {
    return res.status(200).json({ banned: false }); // fail-open
  }
}
