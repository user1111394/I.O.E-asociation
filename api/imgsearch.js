// api/imgsearch.js — Google Custom Search Image Proxy
// Butuh: GOOGLE_CSE_KEY dan GOOGLE_CSE_ID di Vercel env vars
// Setup: https://programmablesearchengine.google.com (aktifkan Image Search + Search the entire web)

export default async function handler(req, res) {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Query diperlukan' });

  const KEY = process.env.GOOGLE_CSE_KEY;
  const CX  = process.env.GOOGLE_CSE_ID;

  if (!KEY || !CX) {
    return res.status(500).json({
      error: 'GOOGLE_CSE_KEY atau GOOGLE_CSE_ID tidak ditemukan di environment variables',
      hint: 'Set di Vercel Dashboard → Settings → Environment Variables'
    });
  }

  try {
    const url = `https://www.googleapis.com/customsearch/v1?` +
      `key=${KEY}&cx=${CX}&q=${encodeURIComponent(q)}&searchType=image&num=9&safe=active` +
      `&imgSize=medium&imgType=photo`;

    const r = await fetch(url);
    if (!r.ok) {
      const err = await r.json();
      return res.status(r.status).json({ error: err.error?.message || 'Google API error' });
    }
    const d = await r.json();
    return res.status(200).json({ items: d.items || [] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
