// api/nasa.js — NASA APOD Proxy
export default async function handler(req, res) {
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
