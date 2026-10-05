// ══════════════════════════════════════════════════════════════════
// VECMATH — Vektor 3D & Matriks 4x4 dasar untuk render engine 3D custom.
// Tidak ada dependency eksternal (tidak pakai Three.js/gl-matrix), murni JS,
// supaya seluruh pipeline render bisa jalan di Node.js serverless tanpa native binding.
// Konvensi: matriks disimpan sebagai array 16 angka, column-major (sama seperti OpenGL/Three.js),
// supaya mudah dibandingkan dengan referensi standar saat debugging.
// ══════════════════════════════════════════════════════════════════

const Vec3 = {
  create(x = 0, y = 0, z = 0) { return { x, y, z }; },
  add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; },
  sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; },
  scale(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; },
  dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; },
  cross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
  },
  length(a) { return Math.sqrt(Vec3.dot(a, a)); },
  normalize(a) {
    const len = Vec3.length(a);
    if (len < 1e-10) return { x: 0, y: 0, z: 0 }; // hindari div-by-zero untuk vektor nol
    return { x: a.x / len, y: a.y / len, z: a.z / len };
  },
  lerp(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
  },
  negate(a) { return { x: -a.x, y: -a.y, z: -a.z }; },
};

const Mat4 = {
  // Matriks identitas
  identity() {
    return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  },

  // Perkalian matriks: hasil = a * b (menerapkan b dulu, lalu a — konvensi standar column-major)
  multiply(a, b) {
    const out = new Array(16).fill(0);
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          sum += a[k * 4 + row] * b[col * 4 + k];
        }
        out[col * 4 + row] = sum;
      }
    }
    return out;
  },

  // Transformasi translasi
  translation(x, y, z) {
    return [1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1];
  },

  // Skala seragam atau per-sumbu
  scaling(x, y, z) {
    return [x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1];
  },

  // Rotasi mengelilingi sumbu X, Y, Z (radian)
  rotationX(rad) {
    const c = Math.cos(rad), s = Math.sin(rad);
    return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1];
  },
  rotationY(rad) {
    const c = Math.cos(rad), s = Math.sin(rad);
    return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1];
  },
  rotationZ(rad) {
    const c = Math.cos(rad), s = Math.sin(rad);
    return [c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1];
  },

  // Transformasi titik (x,y,z,w=1) oleh matriks 4x4, mengembalikan Vec3 (dibagi w jika perlu)
  transformPoint(m, p) {
    const x = m[0]*p.x + m[4]*p.y + m[8]*p.z  + m[12];
    const y = m[1]*p.x + m[5]*p.y + m[9]*p.z  + m[13];
    const z = m[2]*p.x + m[6]*p.y + m[10]*p.z + m[14];
    const w = m[3]*p.x + m[7]*p.y + m[11]*p.z + m[15];
    if (Math.abs(w - 1) > 1e-10 && Math.abs(w) > 1e-10) {
      return { x: x / w, y: y / w, z: z / w };
    }
    return { x, y, z };
  },

  // Transformasi arah/normal (tanpa translasi — w=0). PENTING: untuk normal vektor yang terkena
  // scaling non-seragam, harusnya pakai inverse-transpose matriks, tapi untuk versi awal ini
  // (scaling seragam per objek) transformasi langsung sudah cukup akurat.
  transformDirection(m, d) {
    return {
      x: m[0]*d.x + m[4]*d.y + m[8]*d.z,
      y: m[1]*d.x + m[5]*d.y + m[9]*d.z,
      z: m[2]*d.x + m[6]*d.y + m[10]*d.z,
    };
  },

  // View matrix: mengubah koordinat dunia -> koordinat relatif kamera (look-at standar)
  lookAt(eye, target, up) {
    const zAxis = Vec3.normalize(Vec3.sub(eye, target)); // kamera menghadap -z secara konvensi
    const xAxis = Vec3.normalize(Vec3.cross(up, zAxis));
    const yAxis = Vec3.cross(zAxis, xAxis);
    return [
      xAxis.x, yAxis.x, zAxis.x, 0,
      xAxis.y, yAxis.y, zAxis.y, 0,
      xAxis.z, yAxis.z, zAxis.z, 0,
      -Vec3.dot(xAxis, eye), -Vec3.dot(yAxis, eye), -Vec3.dot(zAxis, eye), 1,
    ];
  },

  // Proyeksi perspektif standar (mirip gluPerspective / Three.js PerspectiveCamera)
  // fovYRadian: field of view vertikal dalam radian, aspect: lebar/tinggi, near/far: clipping plane
  perspective(fovYRadian, aspect, near, far) {
    const f = 1 / Math.tan(fovYRadian / 2);
    const rangeInv = 1 / (near - far);
    return [
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (near + far) * rangeInv, -1,
      0, 0, near * far * rangeInv * 2, 0,
    ];
  },
};

export { Vec3, Mat4 };
