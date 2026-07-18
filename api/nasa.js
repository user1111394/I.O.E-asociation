// api/nasa.js — Gabungan NASA APOD Proxy + ISS Position Proxy
// Digabung jadi 1 file supaya membebaskan 1 slot Serverless Function di Vercel (limit 12 di plan Hobby).
// Cara pakai: /api/nasa (default = APOD, seperti sebelumnya), /api/nasa?type=iss (posisi ISS)

export default async function handler(req, res) {
  const type = req.query?.type;

  /* ==========================
     ISS POSITION — /api/nasa?type=iss
     ========================== */
  if (type === 'iss') {
    res.setHeader('Cache-Control', 's-maxage=5');
    try {
      const r = await fetch('https://api.wheretheiss.at/v1/satellites/25544');
      const d = await r.json();
      return res.status(200).json({
        lat: d.latitude,
        lng: d.longitude,
        alt: d.altitude,
        vel: d.velocity,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  /* ==========================
     NASA APOD (default) — /api/nasa
     ========================== */
  res.setHeader('Cache-Control', 's-maxage=3600'); // Cache 1 jam
  const key = process.env.NASA_API_KEY || 'DEMO_KEY';
  try {
    const r = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${key}`);
    const d = await r.json();
    return res.status(200).json(d);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
