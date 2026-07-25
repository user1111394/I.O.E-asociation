// api/event-upload.js
// Endpoint upload file event — pakai Cloudinary (signed upload dari server).
// Menggantikan versi Vercel Blob yang gagal karena limitasi Private Store + REST API.
//
// Kontrak request/response SAMA PERSIS dengan versi lama, jadi nav.js TIDAK PERLU DIUBAH:
//   Request body:  { fileName, fileDataBase64, contentType }
//   Response:      { url, pathname }
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

    // Cloudinary butuh full data URL, bukan base64 mentah
    const dataUrl = `data:${contentType || 'application/octet-stream'};base64,${fileDataBase64}`;

    // Buang ekstensi dari fileName buat dijadikan public_id (Cloudinary nambahin sendiri)
    const publicId = fileName.replace(/\.[^/.]+$/, '');

    // Tentukan resource_type: image untuk gambar, raw untuk file lain (PDF dll)
    const isImage = (contentType || '').startsWith('image/');

    const uploadResult = await cloudinary.uploader.upload(dataUrl, {
      folder: 'ioe-events',
      public_id: publicId,
      resource_type: isImage ? 'image' : 'raw',
      overwrite: true,
    });

    return res.status(200).json({
      url: uploadResult.secure_url,
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
