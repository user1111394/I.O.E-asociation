// api/event-upload.js
// Satu file, EMPAT mode — supaya tidak menambah jumlah serverless function
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
//   DELETE /api/event-upload  { publicId, resourceType }
//     -> hapus file dari Cloudinary secara permanen. Dipanggil superadmin
//        saat menghapus event, supaya file challenge yang menumpuk di
//        Cloudinary storage ikut terhapus (sebelumnya hanya metadata di
//        Firebase yang terhapus, file aslinya tertinggal selamanya).
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
  // ── Mode delete: DELETE /api/event-upload { publicId, resourceType } ──
  if (req.method === 'DELETE') {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return res.status(500).json({ error: 'Env var Cloudinary belum lengkap di Vercel' });
    }

    try {
      const { publicId, resourceType } = req.body || {};

      if (!publicId) {
        return res.status(400).json({ error: 'publicId wajib diisi' });
      }

      // resourceType default 'raw' (dipakai file .html challenge event).
      // Kirim 'image' untuk foto profil/icon item, atau 'video' untuk
      // file musik & video WebM galeri broadcast (Cloudinary menyimpan
      // audio di bawah resource_type 'video' juga, bukan kategori terpisah).
      let finalResourceType = 'raw';
      if (resourceType === 'image') finalResourceType = 'image';
      if (resourceType === 'video') finalResourceType = 'video';

      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: finalResourceType,
      });

      // Cloudinary balikin result: 'ok' kalau berhasil, 'not found' kalau
      // file memang sudah tidak ada — dua-duanya dianggap sukses di sini,
      // supaya penghapusan event tetap lanjut walau filenya sudah hilang duluan.
      if (result.result !== 'ok' && result.result !== 'not found') {
        return res.status(500).json({ error: `Gagal menghapus file: ${result.result}` });
      }

      return res.status(200).json({ success: true, result: result.result });
    } catch (err) {
      console.error('event-upload (delete) error:', err);
      return res.status(500).json({ error: err.message || 'Gagal menghapus file' });
    }
  }

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

    // Catatan: mode 'broadcast-music' dan 'broadcast-video' yang dulu ada di
    // sini sudah DIHAPUS. File musik/video galeri broadcast sekarang upload
    // LANGSUNG dari browser ke Cloudinary (unsigned preset
    // "broadcast_gallery_unsigned"), skip server Vercel sepenuhnya — supaya
    // tidak kena limit hard 4.5MB body request Vercel Hobby. Endpoint ini
    // hanya menerima metadata hasil upload tersebut lewat api/shop.js
    // (action: add-broadcast-gallery-item), bukan file-nya.

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

// Naikkan body size limit karena base64 lebih besar ~33% dari file asli.
// Dinaikkan ke 20mb (dari 10mb) untuk mengakomodasi file musik/video galeri
// broadcast yang lebih besar dari foto profil/icon item biasa.
module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};
