// api/event-upload.js
// Endpoint KHUSUS untuk generate token upload Vercel Blob (fitur Event di superadmin panel).
// SENGAJA dipisah dari assign-room.js — jangan digabung lagi, karena percobaan
// menggabungkannya sebelumnya sempat membuat assign-room.js (fitur krusial chat) crash total.
//
// Cara kerja: file asli TIDAK lewat server ini. Server ini cuma mengeluarkan token
// sementara, lalu browser mengirim file langsung ke Vercel Blob memakai token itu.

import { handleUpload } from '@vercel/blob/client';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // req.body dari Vercel (Node.js runtime, bukan Edge) sudah otomatis ter-parse jadi object
    // selama bodyParser tidak dimatikan (kita tidak mematikannya di sini).
    const body = req.body;

    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        return {
          allowedContentTypes: undefined, // izinkan semua tipe file (fleksibel sesuai kebutuhan)
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // Tidak perlu aksi tambahan di sini — metadata event (judul, deskripsi, expired)
        // tetap disimpan terpisah ke Firebase oleh kode di superadmin panel (nav.js).
        console.log('Event file upload selesai:', blob.url);
      },
    });

    return res.status(200).json(jsonResponse);
  } catch (err) {
    console.error('event-upload error:', err);
    return res.status(400).json({ error: err.message || 'Gagal membuat token upload' });
  }
}
