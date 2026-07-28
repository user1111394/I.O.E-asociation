// api/event-upload.js
// Satu file, TIGA mode — supaya tidak menambah jumlah serverless function
// (Vercel Hobby plan dibatasi 12 functions, folder api/ ini sudah pas 12).
//
//   POST /api/event-upload  { uploadType:'event', fileName, fileDataBase64, contentType }
//     -> upload file challenge (.html) ke Cloudinary, folder ioe-events/
//
//   POST /api/event-upload  { uploadType:'profile-photo', fileName, fileDataBase64, contentType }
//     -> upload foto profil member ke Cloudinary, folder ioe-profile/
//        (uploadType tidak diisi = default 'event', supaya nav.js lama tetap jalan tanpa diubah)
//
//   GET  /api/event-upload?view=<url> -> proxy file .html dari Cloudinary,
//                                        dikirim ulang dengan Content-Type
//                                        yang benar supaya browser me-render-nya
//                                        (bukan men-download), untuk dipakai
//                                        di <iframe> pada event.html.
//
// Kenapa proxy GET ini perlu: Cloudinary TIDAK mendukung menyajikan file HTML
// sebagai halaman yang bisa dirender browser lewat resource_type "raw" — selalu
// dikirim dengan header yang memicu download. (Dikonfirmasi dari dokumentasi
// & forum support Cloudinary sendiri.) Jadi kita proxy manual di sini.
//
// Kontrak upload event (POST, uploadType default/'event') SAMA PERSIS dengan
// versi sebelumnya — nav.js bagian event TIDAK PERLU DIUBAH.
//
// Env var yang wajib ada di Vercel:
//   CLOUDINARY_CLOUD_NAME
//   CLOUDINARY_API_KEY
//   CLOUDINARY_API_SECRET

const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports = async function handler(req, res) {
  // ── Mode proxy-view: GET /api/event-upload?view=<encoded cloudinary url> ──
  if (req.method === 'GET') {
    const viewUrl = req.query.view;

    if (!viewUrl) {
      return res.status(400).send('Parameter "view" wajib diisi');
    }

    // Whitelist: hanya izinkan proxy ke Cloudinary cloud kita sendiri
    const allowedPrefix = 'https://res.cloudinary.com/mclectmg/';
    if (!viewUrl.startsWith(allowedPrefix)) {
      return res.status(403).send('URL tidak diizinkan');
    }

    try {
      const upstream = await fetch(viewUrl);

      if (!upstream.ok) {
        return res.status(upstream.status).send('Gagal mengambil file challenge');
      }

      const html = await upstream.text();

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Cache-Control', 'public, max-age=300');

      return res.status(200).send(html);
    } catch (err) {
      console.error('event-upload (proxy-view) error:', err);
      return res.status(500).send('Gagal memuat challenge');
    }
  }

  // ── Mode upload: POST /api/event-upload ──
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    return res.status(500).json({ error: 'Env var Cloudinary belum lengkap di Vercel' });
  }

  try {
    const { uploadType, fileName, fileDataBase64, contentType } = req.body || {};

    if (!fileName || !fileDataBase64) {
      return res.status(400).json({ error: 'fileName dan fileDataBase64 wajib diisi' });
    }

    // ── Mode: foto profil member ──
    if (uploadType === 'profile-photo') {
      if (!/^image\//i.test(contentType || '')) {
        return res.status(400).json({ error: 'File foto profil harus berupa gambar' });
      }

      const dataUrl = `data:${contentType};base64,${fileDataBase64}`;

      const uploadResult = await cloudinary.uploader.upload(dataUrl, {
        folder: 'ioe-profile',
        public_id: fileName.replace(/\.[^/.]+$/, ''),
        resource_type: 'image',
        overwrite: true,
        use_filename: false,
        unique_filename: false,
        // Batasi ukuran biar hemat storage & loading cepat di kartu profil
        transformation: [{ width: 500, height: 500, crop: 'limit' }],
      });

      return res.status(200).json({
        url: uploadResult.secure_url,
        pathname: uploadResult.public_id,
      });
    }

    // ── Mode: file challenge event (default, kontrak lama tidak berubah) ──
    if (!/\.html?$/i.test(fileName)) {
      return res.status(400).json({ error: 'File challenge harus berformat .html' });
    }

    const dataUrl = `data:${contentType || 'text/html'};base64,${fileDataBase64}`;
    const publicId = fileName;

    const uploadResult = await cloudinary.uploader.upload(dataUrl, {
      folder: 'ioe-events',
      public_id: publicId,
      resource_type: 'raw',
      overwrite: true,
      use_filename: false,
      unique_filename: false,
    });

    return res.status(200).json({
      url: uploadResult.secure_url,
      pathname: uploadResult.public_id,
    });
  } catch (err) {
    console.error('event-upload (upload) error:', err);
    return res.status(500).json({ error: err.message || 'Gagal upload file' });
  }
};

// Naikkan body size limit karena base64 lebih besar ~33% dari file asli
module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};
