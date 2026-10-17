// api/cron-cleanup.js — Gabungan Cron Cleanup (hapus pesan lama) + NASA APOD
// Proxy + ISS Position Proxy.
// Digabung supaya membebaskan 1 slot Serverless Function di Vercel
// (limit 12 di plan Hobby), dipakai untuk fitur baru (tycoon.js).
//
// Cara pakai:
//   - Cron terjadwal (Vercel Cron, lihat vercel.json)   → tidak perlu query,
//     akan otomatis masuk ke jalur cleanup karena ada header Authorization.
//   - /api/cron-cleanup?type=apod   → NASA APOD (dulunya /api/nasa)
//   - /api/cron-cleanup?type=iss    → Posisi ISS (dulunya /api/nasa?type=iss)
//
// PENTING untuk frontend: semua pemanggilan lama ke "/api/nasa" dan
// "/api/nasa?type=iss" HARUS diganti ke "/api/cron-cleanup?type=apod" dan
// "/api/cron-cleanup?type=iss" di semua file HTML/JS yang memanggilnya.

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  const type = req.query?.type;

  /* ==========================
     ISS POSITION — /api/cron-cleanup?type=iss
     ========================== */
  if (type === 'iss') {
    try {
      const r = await fetch('https://api.wheretheiss.at/v1/satellites/25544');
      if (!r.ok) throw new Error('wheretheiss.at status ' + r.status);
      const d = await r.json();
      if (typeof d.latitude !== 'number' || typeof d.longitude !== 'number') throw new Error('Data ISS tidak valid');
      res.setHeader('Cache-Control', 's-maxage=5'); // cache hanya untuk jawaban yang berhasil
      return res.status(200).json({
        lat: d.latitude,
        lng: d.longitude,
        alt: d.altitude,
        vel: d.velocity,
      });
    } catch (e) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(502).json({ error: e.message });
    }
  }

  /* ==========================
     NASA APOD — /api/cron-cleanup?type=apod
     ========================== */
  if (type === 'apod') {
    const key = process.env.NASA_API_KEY || 'DEMO_KEY';
    try {
      // thumbs=true: untuk APOD berupa video, NASA menyertakan thumbnail_url (dipakai frontend sebagai poster)
      const r = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(key)}&thumbs=true`);
      const d = await r.json();
      // Jangan teruskan error NASA (mis. batas DEMO_KEY habis) sebagai "200 OK" — frontend akan mengira itu data APOD
      if (!r.ok || !d || d.error || !d.title) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(r.ok ? 502 : r.status).json({ error: (d && (d.error && d.error.message || d.msg)) || 'NASA APOD error ' + r.status });
      }
      res.setHeader('Cache-Control', 's-maxage=3600'); // Cache 1 jam, hanya untuk jawaban yang berhasil
      return res.status(200).json(d);
    } catch (e) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(500).json({ error: e.message });
    }
  }

  /* ==========================
     CRON CLEANUP (default) — dipanggil terjadwal oleh Vercel Cron,
     hapus pesan chat yang lebih tua dari 3 hari.
     ========================== */
  const authHeader = req.headers['authorization'];
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const DB_URL = process.env.FIREBASE_DB_URL;
  if (!DB_URL) return res.status(500).json({ error: 'FIREBASE_DB_URL tidak ditemukan' });

  const cutoff = Date.now() - THREE_DAYS_MS;

  try {
    const r = await fetch(`${DB_URL}/messages.json`);
    const data = await r.json();

    if (!data) return res.status(200).json({ deleted: 0, message: 'Tidak ada pesan' });

    const entries = Object.entries(data);
    const toDelete = entries.filter(([key, msg]) => {
      const ts = msg.ts;
      return typeof ts === 'number' && ts < cutoff;
    });

    if (toDelete.length === 0) {
      return res.status(200).json({ deleted: 0, total: entries.length, message: 'Tidak ada pesan yang perlu dihapus' });
    }

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
