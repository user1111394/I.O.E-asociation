// api/cron-cleanup.js — Hapus pesan chat yang lebih tua dari 3 hari
// Dijadwalkan otomatis oleh Vercel Cron (lihat vercel.json)

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  // Vercel Cron mengirim header khusus untuk verifikasi (opsional tapi disarankan)
  const authHeader = req.headers['authorization'];
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const DB_URL = process.env.FIREBASE_DB_URL;
  if (!DB_URL) return res.status(500).json({ error: 'FIREBASE_DB_URL tidak ditemukan' });

  const cutoff = Date.now() - THREE_DAYS_MS;

  try {
    // Ambil semua pesan
    const r = await fetch(`${DB_URL}/messages.json`);
    const data = await r.json();

    if (!data) return res.status(200).json({ deleted: 0, message: 'Tidak ada pesan' });

    const entries = Object.entries(data);
    const toDelete = entries.filter(([key, msg]) => {
      const ts = msg.ts;
      // ts bisa berupa number (server timestamp resolved) atau objek placeholder
      return typeof ts === 'number' && ts < cutoff;
    });

    if (toDelete.length === 0) {
      return res.status(200).json({ deleted: 0, total: entries.length, message: 'Tidak ada pesan yang perlu dihapus' });
    }

    // Hapus satu per satu (Firebase REST tidak punya batch delete sederhana via fetch biasa,
    // jadi pakai multi-path update dengan PATCH = null per key)
    const updatePayload = {};
    toDelete.forEach(([key]) => { updatePayload[key] = null; });

    const patchRes = await fetch(`${DB_URL}/messages.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload),
    });

    if (!patchRes.ok) throw new Error('Gagal hapus pesan: ' + patchRes.status);

    return res.status(200).json({
      deleted: toDelete.length,
      total: entries.length,
      cutoffDate: new Date(cutoff).toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
