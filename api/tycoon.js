// (header asli) Ore Tycoon: sistem penambangan ore otomatis (idle/incremental).
// Disederhanakan dari dokumen game 3D Unity/Unreal jadi web app biasa:
// gameplay-nya timer-based (hitung ore terkumpul dari selisih waktu),
// bukan simulasi real-time. Visual mesin di frontend pakai Three.js primitif
// sederhana, bukan model .FBX custom.
//
// Storage: Upstash Redis, key `tycoon:{memberId}`
// {
//   machines: {
//     1: { unlocked: true, speedLevel: 1, capacityLevel: 1, oreStored: 0, lastCollectAt: ts },
//     2: { unlocked: false, ... },
//     ...
//   },
//   oreInventory: { coal: 0, copper: 0, iron: 0, ... }
// }


// api/tycoon.js — ROUTER tipis untuk Ore Tycoon, Wild Harvest, Garden, Catch a Pet, dan Pet Barn.
// Logika per sistem dipindah ke api/_tycoon/ (folder awalan _ tidak dihitung sebagai Serverless Function).
// Isi file lama (storage Upstash Redis, key `tycoon:{memberId}` dll.) tidak berubah.

import { kvGet, kvSet, verifyAdminAccess, verifyMemberSession } from './_tycoon/shared.js';
import { handleOreTycoon } from './_tycoon/ore-tycoon.js';
import { handleWildHarvest } from './_tycoon/wild-harvest.js';
import { handleGarden } from './_tycoon/garden.js';
import { handleCatchPet } from './_tycoon/catch-pet.js';
import { handlePetBarn } from './_tycoon/pet-barn.js';

// action -> handler modul. Pakai Map (bukan object) supaya action seperti "constructor" tidak lolos.
const GROUPS = [
  [handleOreTycoon, ['get-state', 'collect-ore', 'upgrade-machine', 'unlock-machine', 'start-refine', 'sell-ore', 'sell-ingot', 'craft-asset', 'explore-planet']],
  [handleWildHarvest, ['get-wildharvest-state', 'dig-spot', 'upgrade-shovel', 'repair-shovel']],
  [handleGarden, ['get-garden-state', 'plant-seed', 'water-plant', 'fertilize-plant', 'treat-pest', 'harvest-plant', 'upgrade-garden']],
  [handleCatchPet, ['get-catchpet-state', 'flee-nearby-pets', 'attempt-catch', 'upgrade-catch-tool', 'repair-catch-tool']],
  [handlePetBarn, ['get-petbarn-state', 'upgrade-barn', 'feed-pet', 'clean-pet', 'pet-the-pet', 'collect-yield']],
];
const ROUTES = new Map(GROUPS.flatMap(([fn, names]) => names.map((n) => [n, fn])));

export default async function handler(req, res) {

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action } = req.body;
  // ══════════════════════════════════════
  // GRANT-ORE-COIN — superadmin kasih Ore Coin langsung ke member
  // (giveaway). Action ADMIN, bukan member — dikeluarkan dari verifikasi
  // sesi member wajib di bawah karena memberId di body ini adalah TARGET
  // penerima koin, bukan identitas pemanggil (pemanggilnya admin, pakai
  // adminToken, bukan sessionToken member).
  // ══════════════════════════════════════
  if (action === 'grant-ore-coin') {
    const { adminToken, memberId: targetMemberId, amount } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });

    if (!targetMemberId) return res.status(400).json({ error: 'Member ID wajib diisi' });

    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum < 1) {
      return res.status(400).json({ error: 'Jumlah Ore Coin harus angka lebih dari 0' });
    }

    try {
      // Pastikan member tujuan memang ada, supaya admin tidak salah ketik
      // Member ID dan koin "hilang" ke akun yang tidak pernah dibuat.
      const targetAccount = await kvGet(`account:${targetMemberId}`);
      if (!targetAccount) return res.status(404).json({ error: 'Member ID tidak ditemukan' });

      const currentOreCoins = await kvGet(`orecoins:${targetMemberId}`) || 0;
      const newOreCoins = currentOreCoins + amountNum;
      await kvSet(`orecoins:${targetMemberId}`, newOreCoins);

      return res.status(200).json({ success: true, oreCoins: newOreCoins });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
  // ══════════════════════════════════════
  // GRANT-SEED-COIN — superadmin kasih Seed Coin langsung ke member
  // (giveaway), pola SAMA PERSIS seperti grant-ore-coin di atas, cuma
  // beda mata uang target (`seedcoins:{memberId}`, milik Wild
  // Harvest + Garden, bukan Ore Coin milik Tycoon).
  // ══════════════════════════════════════
  if (action === 'grant-seed-coin') {
    const { adminToken, memberId: targetMemberId, amount } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });

    if (!targetMemberId) return res.status(400).json({ error: 'Member ID wajib diisi' });

    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum < 1) {
      return res.status(400).json({ error: 'Jumlah Seed Coin harus angka lebih dari 0' });
    }

    try {
      const targetAccount = await kvGet(`account:${targetMemberId}`);
      if (!targetAccount) return res.status(404).json({ error: 'Member ID tidak ditemukan' });

      const currentSeedCoins = await kvGet(`seedcoins:${targetMemberId}`) || 0;
      const newSeedCoins = currentSeedCoins + amountNum;
      await kvSet(`seedcoins:${targetMemberId}`, newSeedCoins);

      return res.status(200).json({ success: true, seedCoins: newSeedCoins });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
  const { memberId, sessionToken } = req.body;
  const account = await verifyMemberSession(memberId, sessionToken);
  if (!account) return res.status(403).json({ error: 'Sesi tidak valid, silakan login ulang' });
  const stateKey = `tycoon:${memberId}`;

  const handleAction = ROUTES.get(action);
  if (!handleAction) return res.status(400).json({ error: 'Action tidak dikenali' });
  return handleAction({ req, action, memberId, sessionToken, account, stateKey }, res);
}
