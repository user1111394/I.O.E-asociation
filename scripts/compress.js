// scripts/compress.js — kompres GLB static mesh (Tripo): weld -> simplify (meshopt) -> WebP -> Draco.
// Model TIDAK punya rig/animasi, jadi animations.length sengaja tidak dicek.
// Pakai: node compress.js <folder-input> <folder-output>
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup, textureCompress, draco } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';

const [IN, OUT] = [process.argv[2], process.argv[3]];
if (!IN || !OUT) { console.error('Pakai: node compress.js <input> <output>'); process.exit(2); }
const TARGET_TRIS = Number(process.env.TARGET_TRIS || 40000);
const MAX_MB = Number(process.env.MAX_MB || 2);
const TEX_MAX = Number(process.env.TEX_MAX || 1024);
const MB = (b) => (b / 1048576).toFixed(2);

function findGlbs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { recursive: true })
    .filter((f) => String(f).toLowerCase().endsWith('.glb'))
    .map((f) => path.join(dir, String(f))).sort();
}

function countTris(doc) {
  let t = 0;
  for (const m of doc.getRoot().listMeshes())
    for (const p of m.listPrimitives()) {
      const idx = p.getIndices();
      t += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
    }
  return Math.round(t);
}

// Nama output: nama zip (subfolder pertama) kalau berasal dari zip, selain itu nama file.
const used = new Set();
function outName(abs) {
  const parts = path.relative(IN, abs).split(path.sep);
  let base = parts.length > 1 ? parts[0] : path.basename(abs, path.extname(abs));
  let name = base, n = 2;
  while (used.has(name)) name = `${base}-${n++}`;
  used.add(name);
  return `${name}.glb`;
}

const files = findGlbs(IN);
if (!files.length) { console.log('Tidak ada .glb di input. Selesai.'); process.exit(0); }
fs.mkdirSync(OUT, { recursive: true });

await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions(KHRONOS_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  });

const rows = [];
let failed = 0;
for (const file of files) {
  const name = outName(file);
  const outPath = path.join(OUT, name);
  const sizeBefore = fs.statSync(file).size;
  try {
    const doc = await io.read(file);
    const trisBefore = countTris(doc);
    await doc.transform(weld());
    const ratio = Math.min(1, TARGET_TRIS / Math.max(1, countTris(doc)));
    // error tinggi supaya RATIO yang menentukan hasil (default 0.0001 akan berhenti terlalu cepat)
    await doc.transform(
      simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.05 }),
      prune(),
      dedup(),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [TEX_MAX, TEX_MAX] }),
      draco(),
    );
    await io.write(outPath, doc);

    // Verifikasi dari file hasil (dibaca ulang)
    const chk = await io.read(outPath);
    const meshes = chk.getRoot().listMeshes().length;
    const trisAfter = countTris(chk);
    const sizeAfter = fs.statSync(outPath).size;
    if (meshes < 1 || trisAfter < 1) throw new Error('output tidak punya mesh');
    if (sizeAfter > MAX_MB * 1048576) throw new Error(`ukuran ${MB(sizeAfter)} MB > ${MAX_MB} MB`);
    rows.push(`| ${name} | ${MB(sizeBefore)} | ${MB(sizeAfter)} | ${trisBefore} → ${trisAfter} | OK |`);
    console.log(`OK   ${name}: ${MB(sizeBefore)} → ${MB(sizeAfter)} MB, ${trisBefore} → ${trisAfter} tris`);
  } catch (e) {
    failed++;
    rows.push(`| ${name} | ${MB(sizeBefore)} | - | - | GAGAL: ${e.message} |`);
    console.error(`FAIL ${name}: ${e.message}`);
  }
}

const report = ['| File | Sebelum MB | Sesudah MB | Segitiga | Status |', '|---|---|---|---|---|', ...rows].join('\n');
fs.writeFileSync(path.join(OUT, 'REPORT.md'), report + '\n');
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n');
if (failed) { console.error(`${failed} file gagal.`); process.exit(1); }
