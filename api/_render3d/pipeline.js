// ══════════════════════════════════════════════════════════════════
// PIPELINE — Mengubah mesh (dari primitives.js, dalam local/object space) jadi titik-titik
// siap-rasterisasi di layar (screen space), lewat tahapan standar graphics pipeline:
//
//   object space --[model matrix]--> world space --[view matrix]--> camera space
//                --[projection matrix]--> clip space --[divide w]--> NDC
//                --[viewport transform]--> screen space (pixel x,y + depth untuk z-buffer)
//
// Normal permukaan juga dibawa sepanjang pipeline (sampai camera space) untuk shading nanti.
// ══════════════════════════════════════════════════════════════════

import { Vec3, Mat4 } from './vecmath.js';
import { faceNormal } from './primitives.js';

// Bangun model matrix dari transform objek: posisi, rotasi (derajat, urutan Y-X-Z / yaw-pitch-roll), skala.
function buildModelMatrix(transform = {}) {
  const pos = transform.position || { x: 0, y: 0, z: 0 };
  const rot = transform.rotation || { x: 0, y: 0, z: 0 }; // derajat
  const scl = transform.scale != null
    ? (typeof transform.scale === 'number' ? { x: transform.scale, y: transform.scale, z: transform.scale } : transform.scale)
    : { x: 1, y: 1, z: 1 };

  const toRad = Math.PI / 180;
  const rx = Mat4.rotationX(rot.x * toRad);
  const ry = Mat4.rotationY(rot.y * toRad);
  const rz = Mat4.rotationZ(rot.z * toRad);
  const T = Mat4.translation(pos.x, pos.y, pos.z);
  const S = Mat4.scaling(scl.x, scl.y, scl.z);

  // Urutan: Scale dulu, lalu Rotate (Y*X*Z — yaw lalu pitch lalu roll, konvensi umum), lalu Translate.
  // M = T * Ry * Rx * Rz * S
  let M = Mat4.multiply(ry, rx);
  M = Mat4.multiply(M, rz);
  M = Mat4.multiply(M, S);
  M = Mat4.multiply(T, M);
  return M;
}

// Transformasi satu mesh penuh dari object space ke world space (vertex & precompute face normal world-space)
function meshToWorldSpace(mesh, modelMatrix) {
  const worldVertices = mesh.vertices.map(v => Mat4.transformPoint(modelMatrix, v));
  return { vertices: worldVertices, faces: mesh.faces };
}

// Pipeline penuh satu objek: world space -> camera space -> screen space.
// Mengembalikan daftar triangle siap-rasterisasi: tiap triangle punya titik layar (x,y),
// depth (untuk z-buffer), posisi world (untuk shading), dan normal world (untuk shading).
//
// viewMatrix, projMatrix: dari Mat4.lookAt() dan Mat4.perspective()
// viewportWidth/Height: ukuran gambar output dalam piksel
function projectMeshToScreen(worldMesh, viewMatrix, projMatrix, viewportWidth, viewportHeight) {
  const triangles = [];

  for (const face of worldMesh.faces) {
    const wv0 = worldMesh.vertices[face[0]];
    const wv1 = worldMesh.vertices[face[1]];
    const wv2 = worldMesh.vertices[face[2]];

    // Normal dihitung di WORLD SPACE (bukan object space), supaya rotasi objek ikut mempengaruhi
    // arah normal dengan benar — penting untuk shading yang akurat setelah objek diputar.
    const worldNormal = faceNormal(wv0, wv1, wv2);

    // Proyeksikan tiap vertex: world -> camera (view) -> clip (projection) -> NDC (divide w sudah
    // ditangani di dalam Mat4.transformPoint) -> screen (viewport transform)
    const screenVerts = [wv0, wv1, wv2].map(wv => {
      const camSpace = Mat4.transformPoint(viewMatrix, wv);
      const clipSpace = Mat4.transformPoint(projMatrix, camSpace);
      // NDC (x,y,z masing-masing idealnya di rentang -1..1 kalau titik terlihat di frustum)
      // Viewport transform: NDC [-1,1] -> piksel [0,width]/[0,height]. Y dibalik karena NDC
      // y+ menghadap atas, tapi koordinat piksel layar y+ menghadap bawah (konvensi canvas 2D standar).
      const screenX = (clipSpace.x + 1) * 0.5 * viewportWidth;
      const screenY = (1 - clipSpace.y) * 0.5 * viewportHeight;
      return {
        x: screenX,
        y: screenY,
        depth: clipSpace.z, // dipakai z-buffer: NDC z, rentang -1 (dekat) sampai 1 (jauh)
        camZ: camSpace.z,   // jarak dari kamera (negatif = di depan kamera), dipakai untuk near-plane culling
      };
    });

    triangles.push({
      screen: screenVerts,       // [{x,y,depth,camZ}, ...] 3 titik
      worldNormal,               // untuk shading (arah permukaan menghadap ke mana)
      worldPos: {                // titik tengah segitiga di world space, untuk hitung arah ke cahaya
        x: (wv0.x + wv1.x + wv2.x) / 3,
        y: (wv0.y + wv1.y + wv2.y) / 3,
        z: (wv0.z + wv1.z + wv2.z) / 3,
      },
    });
  }

  return triangles;
}

// Back-face culling: buang triangle yang menghadap MENJAUHI kamera (tidak akan terlihat).
// Dicek di CAMERA SPACE: kalau normal menghadap searah dengan arah pandang (dot > 0 dengan
// vektor dari kamera ke titik), berarti kita melihat sisi belakangnya -> buang.
// cameraWorldPos: posisi kamera di world space (untuk hitung arah pandang ke triangle)
function backfaceCull(triangles, cameraWorldPos) {
  return triangles.filter(tri => {
    const viewDir = Vec3.normalize(Vec3.sub(tri.worldPos, cameraWorldPos));
    const facing = Vec3.dot(tri.worldNormal, viewDir);
    return facing < 0; // normal berlawanan arah dengan pandangan kamera = menghadap kita = simpan
  });
}

export { buildModelMatrix, meshToWorldSpace, projectMeshToScreen, backfaceCull };
