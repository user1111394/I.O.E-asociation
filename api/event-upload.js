// api/event-upload.js
// Endpoint upload file event — TIDAK pakai package @vercel/blob sama sekali.
// Alasan: percobaan pakai package @vercel/blob berkali-kali gagal karena
// package itu tidak pernah berhasil ke-install di server ("Cannot find module"),
// walau sudah didaftarkan di package.json dan vercel.json sudah dicoba diubah-ubah.
// Solusi ini pakai fetch() bawaan Node.js untuk PUT file langsung ke REST API
// Vercel Blob — tidak butuh instalasi package apapun, jadi tidak bisa gagal
// karena masalah dependency lagi.
//
// Cara kerja: browser kirim file sebagai base64 lewat JSON body ke endpoint ini.
// Endpoint ini decode base64 lalu PUT ke Vercel Blob pakai BLOB_READ_WRITE_TOKEN.

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!BLOB_TOKEN) {
    return res.status(500).json({ error: 'BLOB_READ_WRITE_TOKEN tidak ditemukan di environment variable' });
  }

  try {
    const { fileName, fileDataBase64, contentType } = req.body || {};

    if (!fileName || !fileDataBase64) {
      return res.status(400).json({ error: 'fileName dan fileDataBase64 wajib diisi' });
    }

    // Decode base64 jadi buffer biner
    const buffer = Buffer.from(fileDataBase64, 'base64');

    // Path unik supaya tidak bentrok nama file
    const uniquePath = `events/${Date.now()}-${fileName}`;

    const uploadRes = await fetch(
      `https://blob.vercel-storage.com/${encodeURIComponent(uniquePath)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${BLOB_TOKEN}`,
          'x-api-version': '7',
          'x-content-type': contentType || 'application/octet-stream',
          'x-access': 'private',
        },
        body: buffer,
      }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error('Vercel Blob REST upload gagal:', uploadRes.status, errText);
      return res.status(uploadRes.status).json({ error: `Upload gagal: ${errText}` });
    }

    const uploadData = await uploadRes.json();

    return res.status(200).json({ url: uploadData.url, pathname: uniquePath });
  } catch (err) {
    console.error('event-upload error:', err);
    return res.status(500).json({ error: err.message || 'Gagal upload file' });
  }
}
