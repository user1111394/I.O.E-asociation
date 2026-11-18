// api/_shop/gallery.js — Galeri broadcast: tambah, daftar, hapus.
// Dipindah dari api/shop.js tanpa perubahan logika. Hanya named export.

import { generateItemId, kvGet, kvSet, verifyAdminAccess } from './shared.js';

export async function handleGallery(ctx, res) {
  const { req, action } = ctx;

  // ══════════════════════════════════════
  // ADD-BROADCAST-GALLERY-ITEM — Admin simpan referensi file musik/video
  // yang sudah di-upload ke Cloudinary (lewat event-upload.js) ke daftar
  // galeri, supaya bisa dipilih ulang saat kirim broadcast tanpa upload lagi.
  // ══════════════════════════════════════
  if (action === 'add-broadcast-gallery-item') {
    const { adminToken, type, nama, url, publicId } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });

    if (!['music', 'video'].includes(type)) {
      return res.status(400).json({ error: 'type harus music atau video' });
    }
    if (!nama || !url || !publicId) {
      return res.status(400).json({ error: 'nama, url, dan publicId wajib diisi' });
    }

    try {
      const files = await kvGet('broadcastgallery:list') || [];
      const newFile = {
        id: generateItemId(),
        type,
        nama: String(nama).slice(0, 150),
        url,
        publicId,
        uploadedAt: Date.now(),
      };
      files.push(newFile);
      const saved = await kvSet('broadcastgallery:list', files);
      if (!saved) return res.status(500).json({ error: 'Gagal menyimpan ke galeri' });

      return res.status(200).json({ success: true, file: newFile });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // LIST-BROADCAST-GALLERY — Admin lihat semua file musik/video di galeri
  // ══════════════════════════════════════
  if (action === 'list-broadcast-gallery') {
    const { adminToken } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });

    try {
      const files = await kvGet('broadcastgallery:list') || [];
      return res.status(200).json({ files });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // DELETE-BROADCAST-GALLERY-ITEM — Admin hapus file dari galeri, sekaligus
  // hapus file aslinya dari Cloudinary supaya tidak menumpuk (storage bersih)
  // ══════════════════════════════════════
  if (action === 'delete-broadcast-gallery-item') {
    const { adminToken, fileId } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });

    if (!fileId) return res.status(400).json({ error: 'fileId wajib diisi' });

    try {
      const files = await kvGet('broadcastgallery:list') || [];
      const file = files.find(f => f.id === fileId);
      if (!file) return res.status(404).json({ error: 'File tidak ditemukan di galeri' });

      // Hapus dulu dari Cloudinary — memanggil event-upload.js lewat fetch
      // internal, karena file ini disimpan sebagai resource_type 'video'
      // (baik musik maupun video WebM sama-sama masuk kategori itu di Cloudinary).
      try {
        const deployUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
        await fetch(`${deployUrl}/api/event-upload`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ publicId: file.publicId, resourceType: 'video' }),
        });
        // Tidak dianggap fatal kalau gagal — tetap lanjut hapus dari daftar
        // supaya galeri tidak "nyangkut" hanya karena satu bagian gagal.
      } catch (cloudErr) {
        console.error('Gagal menghapus file dari Cloudinary:', cloudErr);
      }

      const filtered = files.filter(f => f.id !== fileId);
      const saved = await kvSet('broadcastgallery:list', filtered);
      if (!saved) return res.status(500).json({ error: 'Gagal menghapus dari galeri' });

      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
}
