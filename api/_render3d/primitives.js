// ══════════════════════════════════════════════════════════════════
// PRIMITIVES — Generator bentuk geometri dasar jadi mesh (vertices + faces/triangles).
// Setiap fungsi mengembalikan { vertices: [{x,y,z}, ...], faces: [[i0,i1,i2], ...] }
// dengan urutan vertex per face CCW (counter-clockwise) dilihat dari luar objek —
// konvensi ini penting nanti untuk back-face culling dan perhitungan normal yang benar.
// ══════════════════════════════════════════════════════════════════

import { Vec3 } from './vecmath.js';

// Hitung normal permukaan dari 3 titik segitiga (urutan CCW dilihat dari arah normal keluar)
function faceNormal(v0, v1, v2) {
  const edge1 = Vec3.sub(v1, v0);
  const edge2 = Vec3.sub(v2, v0);
  return Vec3.normalize(Vec3.cross(edge1, edge2));
}

// ── BOLA (UV Sphere) ──
// radius: jari-jari, segments: jumlah pembagian longitude (vertikal keliling), rings: jumlah pembagian latitude
function sphere(radius = 1, segments = 16, rings = 12) {
  const vertices = [];
  const faces = [];

  for (let r = 0; r <= rings; r++) {
    const theta = (r / rings) * Math.PI; // 0 (kutub atas) sampai PI (kutub bawah)
    const sinTheta = Math.sin(theta), cosTheta = Math.cos(theta);
    for (let s = 0; s <= segments; s++) {
      const phi = (s / segments) * Math.PI * 2;
      const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
      vertices.push({
        x: radius * sinTheta * cosPhi,
        y: radius * cosTheta,
        z: radius * sinTheta * sinPhi,
      });
    }
  }

  const vertsPerRow = segments + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * vertsPerRow + s;
      const b = a + vertsPerRow;
      const c = a + 1;
      const d = b + 1;
      // Dua segitiga per "kotak" grid UV. Urutan dibalik (a,c,b bukan a,b,c) supaya CCW
      // dilihat dari luar bola — terbukti lewat tes allNormalsPointOutward.
      faces.push([a, c, b]);
      faces.push([c, d, b]);
    }
  }

  return { vertices, faces };
}

// ── KOTAK (Box) ──
// Ukuran total di tiap sumbu (bukan setengah-ukuran), berpusat di origin.
function box(width = 1, height = 1, depth = 1) {
  const w = width / 2, h = height / 2, d = depth / 2;
  const vertices = [
    // 8 sudut kotak
    {x:-w,y:-h,z:-d}, {x:w,y:-h,z:-d}, {x:w,y:h,z:-d}, {x:-w,y:h,z:-d}, // belakang (z-)
    {x:-w,y:-h,z:d},  {x:w,y:-h,z:d},  {x:w,y:h,z:d},  {x:-w,y:h,z:d},  // depan (z+)
  ];
  // Tiap sisi 2 segitiga, urutan CCW dilihat dari luar kotak
  const faces = [
    [4,5,6],[4,6,7], // depan (z+)
    [1,0,3],[1,3,2], // belakang (z-)
    [0,4,7],[0,7,3], // kiri (x-)
    [5,1,2],[5,2,6], // kanan (x+)
    [3,7,6],[3,6,2], // atas (y+)
    [0,1,5],[0,5,4], // bawah (y-)
  ];
  return { vertices, faces };
}

// ── SILINDER ──
// radiusTop/radiusBottom beda bisa bikin kerucut terpotong; radiusTop=0 jadi kerucut penuh
function cylinder(radiusTop = 1, radiusBottom = 1, height = 2, segments = 16) {
  const vertices = [];
  const faces = [];
  const halfH = height / 2;

  // Ring atas dan bawah
  const topRingStart = 0;
  for (let s = 0; s < segments; s++) {
    const phi = (s / segments) * Math.PI * 2;
    vertices.push({ x: radiusTop * Math.cos(phi), y: halfH, z: radiusTop * Math.sin(phi) });
  }
  const bottomRingStart = segments;
  for (let s = 0; s < segments; s++) {
    const phi = (s / segments) * Math.PI * 2;
    vertices.push({ x: radiusBottom * Math.cos(phi), y: -halfH, z: radiusBottom * Math.sin(phi) });
  }
  // Titik pusat atas & bawah (untuk menutup tutupnya)
  const topCenterIdx = vertices.length;
  vertices.push({ x: 0, y: halfH, z: 0 });
  const bottomCenterIdx = vertices.length;
  vertices.push({ x: 0, y: -halfH, z: 0 });

  // Sisi selimut silinder/kerucut — urutan dibalik (t0,b1,b0 & t0,t1,b1) supaya CCW dilihat dari luar,
  // terverifikasi lewat tes allNormalsPointOutward (arah radial dari sumbu Y).
  for (let s = 0; s < segments; s++) {
    const sNext = (s + 1) % segments;
    const t0 = topRingStart + s, t1 = topRingStart + sNext;
    const b0 = bottomRingStart + s, b1 = bottomRingStart + sNext;
    faces.push([t0, b1, b0]);
    faces.push([t0, t1, b1]);
  }
  // Tutup atas (fan dari titik pusat) — dibalik juga, konsisten dengan sisi selimut
  for (let s = 0; s < segments; s++) {
    const sNext = (s + 1) % segments;
    faces.push([topCenterIdx, topRingStart + sNext, topRingStart + s]);
  }
  // Tutup bawah
  for (let s = 0; s < segments; s++) {
    const sNext = (s + 1) % segments;
    faces.push([bottomCenterIdx, bottomRingStart + s, bottomRingStart + sNext]);
  }

  return { vertices, faces };
}

// ── KERUCUT ── (kasus khusus silinder dengan radiusTop = 0)
function cone(radius = 1, height = 2, segments = 16) {
  return cylinder(0, radius, height, segments);
}

// ── MESH CUSTOM ── (dari data vertex/face bebas, misal poligon arbitrary dari 120B)
// Validasi dasar: pastikan tiap face mengacu ke index vertex yang valid, supaya rasterizer
// tidak crash kalau 120B mengirim data yang salah/index out-of-range.
function customMesh(vertices, faces) {
  if (!Array.isArray(vertices) || vertices.length === 0) {
    throw new Error('customMesh: vertices harus array tidak kosong');
  }
  if (!Array.isArray(faces) || faces.length === 0) {
    throw new Error('customMesh: faces harus array tidak kosong');
  }
  const n = vertices.length;
  for (const f of faces) {
    if (!Array.isArray(f) || f.length !== 3) {
      throw new Error('customMesh: tiap face harus array 3 index (segitiga)');
    }
    for (const idx of f) {
      if (!Number.isInteger(idx) || idx < 0 || idx >= n) {
        throw new Error(`customMesh: index vertex ${idx} di luar jangkauan (ada ${n} vertex)`);
      }
    }
  }
  // Validasi tiap vertex punya x,y,z numerik
  for (const v of vertices) {
    if (typeof v.x !== 'number' || typeof v.y !== 'number' || typeof v.z !== 'number'
        || !isFinite(v.x) || !isFinite(v.y) || !isFinite(v.z)) {
      throw new Error('customMesh: tiap vertex harus punya x,y,z numerik dan finite');
    }
  }
  return { vertices, faces };
}

export { sphere, box, cylinder, cone, customMesh, faceNormal };
