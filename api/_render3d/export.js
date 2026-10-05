// ══════════════════════════════════════════════════════════════════
// EXPORT — Mengubah framebuffer (dari rasterizer.js: Uint8ClampedArray RGBA datar) jadi PNG,
// memakai `pureimage` (https://github.com/joshmarinacci/node-pureimage) — dipilih KHUSUS karena
// 100% pure JavaScript (pakai pngjs & jpeg-js di baliknya), TANPA native binding/kompilasi C++.
// Ini penting karena `node-canvas` (alternatif paling umum) punya native dependency yang terbukti
// bermasalah di Vercel serverless (build gagal / ukuran function membengkak, lihat riset sebelumnya).
//
// CATATAN JUJUR: modul ini ditulis berdasarkan dokumentasi pureimage v0.4.x yang terbaca saat
// pengembangan, TAPI belum bisa diuji dengan library asli di lingkungan ini (sandbox tidak punya
// akses npm registry). Fungsi framebufferToPureimageBitmap() diuji penuh secara terisolasi
// (konversi data piksel manual, tanpa pureimage), tapi pemanggilan API pureimage yang sebenarnya
// (pureimage.make, img.getContext, pureimage.encodePNGToStream) HARUS divalidasi ulang saat
// pertama kali dijalankan di server sungguhan — ada kemungkinan kecil nama method API berbeda
// dari versi yang didokumentasikan di sini.
// ══════════════════════════════════════════════════════════════════

// Mengubah framebuffer RGBA datar (format rasterizer.js) jadi struktur bitmap generik
// { width, height, getPixelRGBA(x,y) -> {r,g,b,a} }. Fungsi ini TIDAK bergantung pada pureimage
// sama sekali, jadi bisa diuji penuh tanpa library eksternal apapun.
function framebufferToBitmapData(framebuffer) {
  const { width, height, color } = framebuffer;
  return {
    width,
    height,
    getPixelRGBA(x, y) {
      if (x < 0 || x >= width || y < 0 || y >= height) {
        throw new RangeError(`getPixelRGBA: koordinat (${x},${y}) di luar jangkauan framebuffer ${width}x${height}`);
      }
      const idx = (y * width + x) * 4;
      return { r: color[idx], g: color[idx + 1], b: color[idx + 2], a: color[idx + 3] };
    },
  };
}

// Menulis bitmapData (dari framebufferToBitmapData) ke objek image pureimage, piksel demi piksel.
// Dipisah dari pemanggilan pureimage.make()/encodePNGToStream() supaya logika "piksel mana diisi
// warna apa" testable tanpa pureimage asli — cukup kirim objek tiruan yang punya method setPixelRGBA.
function writeBitmapToImage(bitmapData, imageTarget) {
  const ctx = imageTarget.getContext('2d');
  for (let y = 0; y < bitmapData.height; y++) {
    for (let x = 0; x < bitmapData.width; x++) {
      const { r, g, b, a } = bitmapData.getPixelRGBA(x, y);
      // API pureimage Context2D: setPixelRGBA_i menerima komponen 0-255 terpisah (lebih cepat
      // daripada setPixelRGBA yang menerima 1 angka 32-bit gabungan, berdasar dokumentasi pureimage).
      ctx.setPixelRGBA_i(x, y, r, g, b, a);
    }
  }
  return imageTarget;
}

// Fungsi utama: render framebuffer -> PNG, dikembalikan sebagai Buffer base64-ready.
// Memakai pureimage asli (di-require secara lazy di dalam fungsi, supaya modul ini tetap bisa
// di-import dan diuji sebagian tanpa pureimage ter-install, misal untuk unit test komponen lain).
async function framebufferToPngBuffer(framebuffer) {
  // Namespace import (bukan default import) dipakai di sini karena pureimage adalah package
  // CommonJS lama — polanya lebih konsisten lintas versi Node.js saat di-import dari modul ESM.
  // CATATAN: ini BELUM divalidasi dengan pureimage asli (lihat catatan jujur di atas file ini).
  const pureimage = await import('pureimage');
  const { PassThrough } = await import('node:stream');

  const img = pureimage.make(framebuffer.width, framebuffer.height);
  const bitmapData = framebufferToBitmapData(framebuffer);
  writeBitmapToImage(bitmapData, img);

  // pureimage.encodePNGToStream menulis ke writable stream; kita tampung ke buffer di memory
  // (bukan ke file disk) karena di Vercel serverless filesystem bersifat read-only/ephemeral,
  // jadi hasil PNG harus langsung dikirim sebagai response, bukan disimpan dulu ke file.
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = new PassThrough();
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    pureimage.encodePNGToStream(img, stream).catch(reject);
  });
}

// Helper: langsung hasilkan base64 data URI siap pakai di <img src="...">
async function framebufferToPngDataUri(framebuffer) {
  const buffer = await framebufferToPngBuffer(framebuffer);
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

export { framebufferToBitmapData, writeBitmapToImage, framebufferToPngBuffer, framebufferToPngDataUri };
