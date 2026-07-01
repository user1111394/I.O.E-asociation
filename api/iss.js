// api/iss.js — ISS Position Proxy
export default async function handler(req, res) {
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
