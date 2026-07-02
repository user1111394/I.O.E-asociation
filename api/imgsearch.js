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
    const d = await r.json();

    if (!r.ok) {
      const reason = d.error?.message || 'Unknown error';
      const status = d.error?.status || r.status;
      let hint = '';
      if (status === 429 || /quota/i.test(reason)) {
        hint = 'Kuota harian Google Custom Search (100 request/hari gratis) sudah habis. Reset otomatis besok.';
      } else if (status === 403 || /API key/i.test(reason)) {
        hint = 'API key tidak valid, atau Custom Search API belum diaktifkan di Google Cloud Console.';
      } else if (/invalid argument|cx/i.test(reason)) {
        hint = 'GOOGLE_CSE_ID kemungkinan salah. Cek lagi di programmablesearchengine.google.com.';
      }
      return res.status(status).json({ error: reason, hint, googleStatus: status });
    }

    return res.status(200).json({ items: d.items || [] });
  } catch (e) {
    return res.status(500).json({ error: e.message, hint: 'Gagal terhubung ke Google API. Cek koneksi server.' });
  }
}
