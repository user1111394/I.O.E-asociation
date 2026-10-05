// ══════════════════════════════════════════════════════════════════
// RENDER SCENE — Fungsi utama yang menggabungkan seluruh pipeline:
// JSON scene (dari 120B) -> parse & validasi -> transformasi tiap objek -> rasterisasi -> PNG.
// Ini satu-satunya fungsi yang perlu dipanggil dari ai.js.
// ══════════════════════════════════════════════════════════════════

import { Mat4 } from './vecmath.js';
import { parseScene, SceneValidationError } from './sceneParser.js';
import { buildModelMatrix, meshToWorldSpace, projectMeshToScreen, backfaceCull } from './pipeline.js';
import { createFramebuffer, rasterizeScene } from './rasterizer.js';
import { framebufferToPngDataUri } from './export.js';

const DEFAULT_WIDTH = 512;
const DEFAULT_HEIGHT = 512;
const BG_COLOR = { r: 8, g: 8, b: 16 }; // biru-hitam gelap, konsisten dengan tema I.O.E

// Render satu scene (hasil parseScene) jadi framebuffer. Dipisah dari export PNG supaya
// bagian ini bisa diuji tanpa pureimage (framebuffer adalah array piksel mentah, bukan file).
function renderSceneToFramebuffer(scene, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT) {
  const framebuffer = createFramebuffer(width, height, BG_COLOR);
  const viewMatrix = Mat4.lookAt(scene.camera.position, scene.camera.target, { x: 0, y: 1, z: 0 });
  const projMatrix = Mat4.perspective(Math.PI / 4, width / height, 0.1, 1000);

  const trianglesWithColor = [];
  for (const obj of scene.objects) {
    const modelMatrix = buildModelMatrix(obj.transform);
    const world = meshToWorldSpace(obj.mesh, modelMatrix);
    const triangles = projectMeshToScreen(world, viewMatrix, projMatrix, width, height);
    const visible = backfaceCull(triangles, scene.camera.position);
    for (const tri of visible) {
      trianglesWithColor.push({ triangle: tri, color: obj.color });
    }
  }

  rasterizeScene(framebuffer, trianglesWithColor, scene.light);
  return framebuffer;
}

// Fungsi utama end-to-end: JSON/object scene mentah -> data URI PNG siap kirim ke client.
// Melempar SceneValidationError kalau JSON tidak valid (pemanggil/ai.js bertanggung jawab
// menangkap ini dan memberi pesan generik ke member, detail lengkap ke log server).
async function renderSceneToPng(sceneInput, options = {}) {
  const scene = parseScene(sceneInput); // bisa melempar SceneValidationError
  const width = options.width || DEFAULT_WIDTH;
  const height = options.height || DEFAULT_HEIGHT;
  const framebuffer = renderSceneToFramebuffer(scene, width, height);
  const dataUri = await framebufferToPngDataUri(framebuffer);
  return { dataUri, objectCount: scene.objects.length };
}

export { renderSceneToFramebuffer, renderSceneToPng, SceneValidationError };
