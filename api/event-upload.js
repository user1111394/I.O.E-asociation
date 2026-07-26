// api/event-upload.js
// Endpoint upload file CHALLENGE event (1 file .html per event) — pakai Cloudinary
// (signed upload dari server, API secret aman di env var, tidak pernah ke browser).
//
// Kontrak request/response SAMA PERSIS dengan versi lama, jadi kode lain yang
// sudah manggil endpoint ini TIDAK PERLU DIUBAH:
//   Request body:  { fileName, fileDataBase64, contentType }
//   Response:      { url, pathname }
//
// File .html di-upload sebagai resource_type "raw" dengan public_id yang
// MENYERTAKAN ekstensi .html, supaya Cloudinary mengembalikan URL yang berakhiran
// .html dan browser me-render-nya sebagai halaman (bukan trigger download),
// sehingga bisa langsung dipakai di <iframe src="..."> pada event.html.
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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    return res.status(500).json({ error: 'Env var Cloudinary belum lengkap di Vercel' });
  }

  try {
    const { fileName, fileDataBase64, contentType } = req.body || {};

    if (!fileName || !fileDataBase64) {
      return res.status(400).json({ error: 'fileName dan fileDataBase64 wajib diisi' });
    }

    if (!/\.html?$/i.test(fileName)) {
      return res.status(400).json({ error: 'File challenge harus berformat .html' });
    }

    // Cloudinary butuh full data URL, bukan base64 mentah
    const dataUrl = `data:${contentType || 'text/html'};base64,${fileDataBase64}`;

    // public_id MENYERTAKAN ekstensi .html supaya URL akhirnya juga .html
    // (Cloudinary "raw" resource_type tidak otomatis menambahkan ekstensi sendiri
    // seperti pada resource_type "image", jadi kita set eksplisit di sini).
    const publicId = fileName;

    const uploadResult = await cloudinary.uploader.upload(dataUrl, {
      folder: 'ioe-events',
      public_id: publicId,
      resource_type: 'raw',
      overwrite: true,
      use_filename: false,
      unique_filename: false,
      // Tanpa ini, Cloudinary mengirim header Content-Disposition: attachment
      // untuk resource_type "raw", yang memaksa browser mendownload file
      // alih-alih merender-nya inline di dalam <iframe>.
      flags: 'attachment:false',
    });

    // Jaring pengaman kedua: paksa URL delivery pakai flag fl_attachment:false
    // supaya walau upload flag di atas tidak berlaku, browser tetap render inline.
    let finalUrl = uploadResult.secure_url;
    if (finalUrl.includes('/raw/upload/')) {
      finalUrl = finalUrl.replace('/raw/upload/', '/raw/upload/fl_attachment:false/');
    }

    return res.status(200).json({
      url: finalUrl,
      pathname: uploadResult.public_id,
    });
  } catch (err) {
    console.error('event-upload (Cloudinary) error:', err);
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
