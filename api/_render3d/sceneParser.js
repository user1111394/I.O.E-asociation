// ══════════════════════════════════════════════════════════════════
// SCENE PARSER — Validasi & konversi JSON scene (ditulis 120B) jadi mesh siap-render.
//
// Format JSON yang diharapkan dari 120B:
// {
//   "camera": { "position": {x,y,z}, "target": {x,y,z} },       // opsional, ada default
//   "light":  { "position": {x,y,z}, "intensity": 0-2, "ambient": 0-1 },  // opsional, ada default
//   "objects": [
//     { "type": "sphere", "radius": 1, "position": {x,y,z}, "rotation": {x,y,z}, "scale": 1, "color": {r,g,b} },
//     { "type": "box", "width": 1, "height": 1, "depth": 1, ... },
//     { "type": "cylinder", "radiusTop": 1, "radiusBottom": 1, "height": 2, ... },
//     { "type": "cone", "radius": 1, "height": 2, ... },
//     { "type": "mesh", "vertices": [{x,y,z},...], "faces": [[i,i,i],...], ... }
//   ]
// }
//
// PRINSIP KEAMANAN: JSON ini berasal dari output model AI (walau "dipercaya" secara konten,
// strukturnya tetap harus divalidasi ketat sebelum dipakai) — field yang hilang/salah tipe/di luar
// rentang wajar TIDAK BOLEH membuat rasterizer crash atau menghasilkan NaN yang menyebar ke seluruh
// gambar. Setiap nilai numerik divalidasi finite, dan bentuk/field tak dikenal ditolak dengan pesan
// jelas (bukan diam-diam diabaikan) supaya mudah didiagnosis kalau 120B salah format.
// ══════════════════════════════════════════════════════════════════

import { sphere, box, cylinder, cone, customMesh } from './primitives.js';

class SceneValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SceneValidationError';
  }
}

function isFiniteNumber(v) {
  return typeof v === 'number' && isFinite(v);
}

function parseVec3(obj, fieldName, defaultValue) {
  if (obj === undefined) return defaultValue;
  if (typeof obj !== 'object' || obj === null) {
    throw new SceneValidationError(`${fieldName} harus berupa object {x,y,z}, diterima: ${JSON.stringify(obj)}`);
  }
  const { x, y, z } = obj;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) {
    throw new SceneValidationError(`${fieldName} harus punya x,y,z numerik dan finite, diterima: ${JSON.stringify(obj)}`);
  }
  return { x, y, z };
}

function parseColor(obj, fieldName, defaultValue) {
  if (obj === undefined) return defaultValue;
  if (typeof obj !== 'object' || obj === null) {
    throw new SceneValidationError(`${fieldName} harus berupa object {r,g,b}, diterima: ${JSON.stringify(obj)}`);
  }
  const { r, g, b } = obj;
  if (!isFiniteNumber(r) || !isFiniteNumber(g) || !isFiniteNumber(b)) {
    throw new SceneValidationError(`${fieldName} harus punya r,g,b numerik dan finite, diterima: ${JSON.stringify(obj)}`);
  }
  // Clamp ke 0-255 (bukan reject) — warna sedikit di luar rentang masih masuk akal untuk diclamp,
  // beda dengan koordinat/ukuran yang kalau salah harus ditolak tegas.
  return {
    r: Math.max(0, Math.min(255, r)),
    g: Math.max(0, Math.min(255, g)),
    b: Math.max(0, Math.min(255, b)),
  };
}

// Validasi angka ukuran (radius, width, height, dll): harus finite, positif, dan dalam rentang wajar.
// Rentang wajar (0.01 - 50) mencegah objek yang terlalu kecil (hilang jadi sub-piksel) atau terlalu
// besar (bisa memperlambat rasterisasi/menyebabkan overflow koordinat layar).
function parseSize(value, fieldName, defaultValue) {
  if (value === undefined) return defaultValue;
  if (!isFiniteNumber(value) || value <= 0) {
    throw new SceneValidationError(`${fieldName} harus angka positif dan finite, diterima: ${JSON.stringify(value)}`);
  }
  if (value < 0.01 || value > 50) {
    throw new SceneValidationError(`${fieldName} di luar rentang wajar (0.01-50), diterima: ${value}`);
  }
  return value;
}

const DEFAULT_CAMERA = { position: { x: 0, y: 1, z: 8 }, target: { x: 0, y: 0, z: 0 } };
const DEFAULT_LIGHT = { position: { x: 5, y: 8, z: 10 }, intensity: 1, ambient: 0.2 };
const DEFAULT_COLOR = { r: 200, g: 200, b: 200 };
const SUPPORTED_TYPES = ['sphere', 'box', 'cylinder', 'cone', 'mesh'];
const MAX_OBJECTS = 30; // batas jumlah objek per scene, mencegah payload raksasa memperlambat render

function parseObject(obj, index) {
  if (typeof obj !== 'object' || obj === null) {
    throw new SceneValidationError(`objects[${index}] harus berupa object, diterima: ${JSON.stringify(obj)}`);
  }
  if (!SUPPORTED_TYPES.includes(obj.type)) {
    throw new SceneValidationError(`objects[${index}].type harus salah satu dari [${SUPPORTED_TYPES.join(', ')}], diterima: "${obj.type}"`);
  }

  const position = parseVec3(obj.position, `objects[${index}].position`, { x: 0, y: 0, z: 0 });
  const rotation = parseVec3(obj.rotation, `objects[${index}].rotation`, { x: 0, y: 0, z: 0 });
  const color = parseColor(obj.color, `objects[${index}].color`, DEFAULT_COLOR);

  let scale;
  if (obj.scale === undefined) {
    scale = 1;
  } else if (isFiniteNumber(obj.scale)) {
    scale = parseSize(obj.scale, `objects[${index}].scale`, 1);
  } else {
    scale = parseVec3(obj.scale, `objects[${index}].scale`, { x: 1, y: 1, z: 1 });
  }

  let mesh;
  switch (obj.type) {
    case 'sphere':
      mesh = sphere(parseSize(obj.radius, `objects[${index}].radius`, 1), 16, 12);
      break;
    case 'box':
      mesh = box(
        parseSize(obj.width, `objects[${index}].width`, 1),
        parseSize(obj.height, `objects[${index}].height`, 1),
        parseSize(obj.depth, `objects[${index}].depth`, 1),
      );
      break;
    case 'cylinder':
      mesh = cylinder(
        parseSize(obj.radiusTop, `objects[${index}].radiusTop`, 1),
        parseSize(obj.radiusBottom, `objects[${index}].radiusBottom`, 1),
        parseSize(obj.height, `objects[${index}].height`, 2),
        16,
      );
      break;
    case 'cone':
      mesh = cone(
        parseSize(obj.radius, `objects[${index}].radius`, 1),
        parseSize(obj.height, `objects[${index}].height`, 2),
        16,
      );
      break;
    case 'mesh': {
      if (!Array.isArray(obj.vertices) || !Array.isArray(obj.faces)) {
        throw new SceneValidationError(`objects[${index}] bertipe "mesh" wajib punya array "vertices" dan "faces"`);
      }
      if (obj.vertices.length > 2000) {
        throw new SceneValidationError(`objects[${index}].vertices terlalu banyak (${obj.vertices.length}, maksimal 2000) — mencegah payload raksasa`);
      }
      try {
        mesh = customMesh(obj.vertices, obj.faces);
      } catch (e) {
        throw new SceneValidationError(`objects[${index}] (mesh custom): ${e.message}`);
      }
      break;
    }
  }

  return {
    mesh,
    transform: { position, rotation, scale },
    color,
  };
}

// Fungsi utama: parse & validasi string/object JSON dari 120B jadi scene siap-render.
// Melempar SceneValidationError dengan pesan spesifik kalau ada yang salah — pesan ini AMAN
// ditampilkan di log server untuk diagnosis, tapi JANGAN dikirim mentah ke member (lihat catatan
// di sisi pemanggil/ai.js: pesan generik untuk user, detail lengkap untuk log).
function parseScene(input) {
  let data;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch (e) {
      throw new SceneValidationError(`JSON tidak valid: ${e.message}`);
    }
  } else if (typeof input === 'object' && input !== null) {
    data = input;
  } else {
    throw new SceneValidationError(`Input harus string JSON atau object, diterima: ${typeof input}`);
  }

  if (!Array.isArray(data.objects) || data.objects.length === 0) {
    throw new SceneValidationError('Scene harus punya field "objects" berupa array tidak kosong');
  }
  if (data.objects.length > MAX_OBJECTS) {
    throw new SceneValidationError(`Scene punya ${data.objects.length} objek, maksimal ${MAX_OBJECTS} per scene`);
  }

  const camera = {
    position: parseVec3(data.camera?.position, 'camera.position', DEFAULT_CAMERA.position),
    target: parseVec3(data.camera?.target, 'camera.target', DEFAULT_CAMERA.target),
  };

  let lightIntensity = DEFAULT_LIGHT.intensity;
  if (data.light?.intensity !== undefined) {
    if (!isFiniteNumber(data.light.intensity) || data.light.intensity < 0 || data.light.intensity > 3) {
      throw new SceneValidationError(`light.intensity harus angka 0-3, diterima: ${JSON.stringify(data.light.intensity)}`);
    }
    lightIntensity = data.light.intensity;
  }
  let lightAmbient = DEFAULT_LIGHT.ambient;
  if (data.light?.ambient !== undefined) {
    if (!isFiniteNumber(data.light.ambient) || data.light.ambient < 0 || data.light.ambient > 1) {
      throw new SceneValidationError(`light.ambient harus angka 0-1, diterima: ${JSON.stringify(data.light.ambient)}`);
    }
    lightAmbient = data.light.ambient;
  }
  const light = {
    position: parseVec3(data.light?.position, 'light.position', DEFAULT_LIGHT.position),
    intensity: lightIntensity,
    ambient: lightAmbient,
  };

  const objects = data.objects.map((obj, i) => parseObject(obj, i));

  return { camera, light, objects };
}

export { parseScene, SceneValidationError };
