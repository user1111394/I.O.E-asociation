// ══════════════════════════════════════════════════════════════════
// RASTERIZER — Mengisi triangle (hasil dari pipeline.js) jadi piksel berwarna di framebuffer,
// dengan z-buffer untuk urutan kedalaman yang benar dan shading Lambertian sederhana
// (brightness berdasarkan sudut antara normal permukaan dan arah ke sumber cahaya).
//
// Framebuffer direpresentasikan sebagai Float32Array/Uint8ClampedArray datar (bukan canvas
// library apapun), supaya modul ini independen dan testable tanpa dependency rendering nyata.
// ══════════════════════════════════════════════════════════════════

import { Vec3 } from './vecmath.js';

// Buat framebuffer kosong: color (RGBA per piksel) + depth buffer (1 float per piksel, diinisialisasi +Infinity)
function createFramebuffer(width, height, bgColor = { r: 10, g: 10, b: 20 }) {
  const color = new Uint8ClampedArray(width * height * 4);
  const depth = new Float32Array(width * height).fill(Infinity);
  for (let i = 0; i < width * height; i++) {
    color[i * 4 + 0] = bgColor.r;
    color[i * 4 + 1] = bgColor.g;
    color[i * 4 + 2] = bgColor.b;
    color[i * 4 + 3] = 255;
  }
  return { width, height, color, depth };
}

// Hitung barycentric coordinates titik (px,py) terhadap triangle (v0,v1,v2) di screen space.
// Mengembalikan null kalau titik di luar triangle (salah satu koordinat barycentric negatif).
function barycentric(px, py, v0, v1, v2) {
  const denom = (v1.y - v2.y) * (v0.x - v2.x) + (v2.x - v1.x) * (v0.y - v2.y);
  if (Math.abs(denom) < 1e-10) return null; // triangle degenerate (area nol, misal 3 titik segaris)
  const a = ((v1.y - v2.y) * (px - v2.x) + (v2.x - v1.x) * (py - v2.y)) / denom;
  const b = ((v2.y - v0.y) * (px - v2.x) + (v0.x - v2.x) * (py - v2.y)) / denom;
  const c = 1 - a - b;
  if (a < -1e-6 || b < -1e-6 || c < -1e-6) return null; // di luar triangle (toleransi kecil untuk tepi)
  return { a, b, c };
}

// Shading Lambertian dasar: brightness = max(0, dot(normal, arah-ke-cahaya)).
// ambient: cahaya minimum supaya sisi gelap tidak hitam total (mensimulasikan cahaya pantulan sekitar).
function lambertShade(normal, worldPos, light, baseColor) {
  const lightDir = Vec3.normalize(Vec3.sub(light.position, worldPos));
  const diffuse = Math.max(0, Vec3.dot(normal, lightDir));
  const ambient = light.ambient != null ? light.ambient : 0.15;
  const intensity = Math.min(1, ambient + diffuse * (light.intensity != null ? light.intensity : 1));
  return {
    r: baseColor.r * intensity,
    g: baseColor.g * intensity,
    b: baseColor.b * intensity,
  };
}

// Rasterisasi SATU triangle ke framebuffer, dengan depth test & shading.
// triangle: { screen: [{x,y,depth,camZ}, ...3], worldNormal, worldPos } (format dari pipeline.js)
// color: { r,g,b } 0-255, light: { position: Vec3, intensity, ambient }
function rasterizeTriangle(framebuffer, triangle, color, light) {
  const { width, height, color: colorBuf, depth: depthBuf } = framebuffer;
  const [v0, v1, v2] = triangle.screen;

  // Near-plane culling sederhana: kalau salah satu titik di BELAKANG kamera (camZ > 0 dalam
  // konvensi kita, karena kamera melihat ke -Z), triangle ini berpotensi menyebabkan artefak
  // proyeksi parah (titik di belakang kamera terproyeksi ke koordinat yang salah/terbalik).
  // Solusi sederhana untuk versi awal: skip triangle itu sepenuhnya (bukan clipping sungguhan).
  if (triangle.screen.some(v => v.camZ > -0.01)) return;

  // Bounding box triangle di layar, dibatasi ke ukuran framebuffer
  const minX = Math.max(0, Math.floor(Math.min(v0.x, v1.x, v2.x)));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(v0.x, v1.x, v2.x)));
  const minY = Math.max(0, Math.floor(Math.min(v0.y, v1.y, v2.y)));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(v0.y, v1.y, v2.y)));

  const shaded = lambertShade(triangle.worldNormal, triangle.worldPos, light, color);

  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const bc = barycentric(px + 0.5, py + 0.5, v0, v1, v2); // +0.5 = sample di tengah piksel
      if (!bc) continue;

      // Interpolasi depth pakai barycentric (depth linear di screen space cukup untuk versi awal;
      // perspective-correct interpolation adalah peningkatan akurasi untuk tahap selanjutnya)
      const pixelDepth = bc.a * v0.depth + bc.b * v1.depth + bc.c * v2.depth;

      const idx = py * width + px;
      if (pixelDepth < depthBuf[idx]) { // lebih dekat ke kamera -> menang depth test
        depthBuf[idx] = pixelDepth;
        colorBuf[idx * 4 + 0] = shaded.r;
        colorBuf[idx * 4 + 1] = shaded.g;
        colorBuf[idx * 4 + 2] = shaded.b;
        colorBuf[idx * 4 + 3] = 255;
      }
    }
  }
}

// Rasterisasi banyak triangle sekaligus (hasil dari beberapa objek/mesh)
function rasterizeScene(framebuffer, trianglesWithColor, light) {
  for (const { triangle, color } of trianglesWithColor) {
    rasterizeTriangle(framebuffer, triangle, color, light);
  }
}

export { createFramebuffer, barycentric, lambertShade, rasterizeTriangle, rasterizeScene };
