// ══════════════════════════════════════════════════════════════════
// EXPORT — Mengubah framebuffer (dari rasterizer.js: Uint8ClampedArray RGBA datar) jadi PNG,
// memakai `pngjs` (https://github.com/pngjs/pngjs) — 100% pure JavaScript, TANPA native binding.
// Dipilih menggantikan `pureimage` karena API-nya lebih sederhana: buffer RGBA langsung
// disalin ke `png.data`, lalu `PNG.sync.write()` menghasilkan Buffer PNG. Tidak ada stream,
// tidak ada pemanggilan per-piksel.
//
// CATATAN JUJUR: sandbox pengembangan tidak punya akses npm, jadi `pngjs` asli belum pernah
// dipanggil di sini. Pengujian lokal memakai stub. Validasi sebenarnya = Vercel Logs.
// ══════════════════════════════════════════════════════════════════

// Ubah framebuffer RGBA datar jadi struktur bitmap generik { width, height, getPixelRGBA(x,y) }.
// Tidak bergantung pada library eksternal (tetap diekspor demi kompatibilitas test lama).
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

// Validasi framebuffer sebelum diencode (data rusak -> error jelas, bukan PNG korup).
function assertValidFramebuffer(framebuffer) {
  const { width, height, color } = framebuffer || {};
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new TypeError(`framebuffer: width/height harus integer positif (dapat ${width}x${height})`);
  }
  if (!color || typeof color.length !== 'number') {
    throw new TypeError('framebuffer: properti color (RGBA datar) tidak ada');
  }
  const expected = width * height * 4;
  if (color.length !== expected) {
    throw new RangeError(`framebuffer: panjang color ${color.length} != ${expected} (width*height*4)`);
  }
}

// Fungsi utama: framebuffer -> Buffer PNG.
// pngjs di-import lazy di dalam fungsi, supaya modul ini tetap bisa di-import tanpa pngjs terpasang.
// pngjs adalah paket CommonJS, jadi `PNG` bisa ada di mod.PNG atau mod.default.PNG tergantung bundler/Node.
async function framebufferToPngBuffer(framebuffer) {
  assertValidFramebuffer(framebuffer);

  const mod = await import('pngjs');
  const PNG = mod.PNG ?? (mod.default && mod.default.PNG);
  if (!PNG) throw new Error('export: class PNG tidak ditemukan di modul pngjs');

  const { width, height, color } = framebuffer;
  const png = new PNG({ width, height });

  // Salin langsung seluruh buffer RGBA (urutan R,G,B,A per piksel — sama persis dengan format pngjs).
  png.data.set(color);

  // PNG.sync.write mengembalikan Buffer. Tanpa stream, tanpa file disk (filesystem Vercel read-only).
  return PNG.sync.write(png);
}

// Helper: base64 data URI siap pakai di <img src="...">
async function framebufferToPngDataUri(framebuffer) {
  const buffer = await framebufferToPngBuffer(framebuffer);
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

export { framebufferToBitmapData, framebufferToPngBuffer, framebufferToPngDataUri };
