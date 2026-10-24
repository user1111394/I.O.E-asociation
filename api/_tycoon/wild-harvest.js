// api/_tycoon/wild-harvest.js — Wild Harvest: gali spot, sekop.
// Dipindah dari api/tycoon.js TANPA perubahan logika. Hanya named export.

import { BIOMES, DIG_SPOT_LAYOUT, SHOVEL_TIERS, WILD_PLANTS, defaultWildHarvestState, kvGet, kvSet, pickRandom } from './shared.js';

// ══════════════════════════════════════
// WILD HARVEST — dunia 3D open-world (first-person, Three.js) tempat
// member jalan-jalan dan gali dig spot untuk dapat BIJI tanaman liar.
// Disederhanakan dari dokumen game Unity asli:
// - Dunia BUKAN 5 file/scene terpisah, tapi 1 world besar (wildharvest.html)
//   dengan 5 bioma sebagai zona/wilayah di dalamnya (mirip biome Minecraft),
//   dibagi berdasarkan SUDUT dari titik pusat (lihat angleStart/angleEnd).
// - QTE gali BUKAN timing manual (lingkaran berputar Perfect/Good/Miss
//   ala dokumen asli) — hasil digali di-ROLL SERVER murni acak berdasar
//   DIG_OUTCOME_WEIGHTS. Ini beda dari sistem gacha spin-wheel (proyek
//   terpisah yang bayar/spin), dig di sini gratis & random murni.
// - Biji hasil gali TIDAK BISA dijual langsung. Wajib dibawa ke Garden
//   (garden.html, state & action terpisah di bawah, tapi backend numpang
//   di file ini juga) untuk ditanam, baru hasil panennya yang dijual.
// ══════════════════════════════════════

const WORLD_RADIUS_MIN = 15;  // area pusat kosong, spawn point, tanpa dig spot

const WORLD_RADIUS_MAX = 260; // tepi dunia

// Biaya upgrade shovel dalam SEED COIN (mata uang baru khusus Wild
// Harvest + Garden, key `seedcoins:{memberId}`, terpisah dari Ore Coin
// milik Tycoon dan koin milik Shop).
const SHOVEL_UPGRADE_COST = { 2: 100, 3: 500, 4: 2000, 5: 8000 };

const SHOVEL_REPAIR_COST_PER_DURABILITY = 5; // Seed Coin per poin durability yang diperbaiki

const TIER_RESPAWN_MINUTES = { common: 5, uncommon: 10, rare: 20, legendary: 60, mythic: 1440 };

const TIER_DIG_QUANTITY = {
  perfect: { min: 2, max: 3 },
  good:    { min: 1, max: 2 },
  miss:    { min: 0, max: 0 },
};

// Peluang hasil gali (dari 100) — server-roll murni acak, bukan timing manual.
const DIG_OUTCOME_WEIGHTS = { perfect: 30, good: 50, miss: 20 };

function rollDigOutcome() {
  const roll = Math.random() * 100;
  let acc = 0;
  for (const [outcome, weight] of Object.entries(DIG_OUTCOME_WEIGHTS)) {
    acc += weight;
    if (roll <= acc) return outcome;
  }
  return 'miss';
}

// Isi ulang dig spot yang kosong (belum pernah di-roll plantId-nya) atau
// yang sudah lewat masa respawn-nya.
function refreshDigSpots(state) {
  const now = Date.now();
  for (const [spotId, layout] of Object.entries(DIG_SPOT_LAYOUT)) {
    const spot = state.digSpots[spotId];
    if (!spot) { state.digSpots[spotId] = { plantId: null, diggableAt: null }; continue; }
    const needsNewPlant = !spot.plantId || (spot.diggableAt !== null && now >= spot.diggableAt);
    if (needsNewPlant) {
      spot.plantId = pickRandom(layout.plantPool);
      spot.diggableAt = null; // siap digali
    }
  }
  return state;
}

export async function handleWildHarvest(ctx, res) {
  const { req, action, memberId } = ctx;

  // ══════════════════════════════════════════════════════════════════
  // WILD HARVEST — actions
  // ══════════════════════════════════════════════════════════════════

  const wildHarvestKey = `wildharvest:${memberId}`;

  // GET-WILDHARVEST-STATE — ambil state gali, isi ulang dig spot yang
  // kosong/sudah respawn, kirim data statis biar frontend tidak hardcode.
  if (action === 'get-wildharvest-state') {
    try {
      let state = await kvGet(wildHarvestKey);
      if (!state) state = defaultWildHarvestState();
      state = refreshDigSpots(state);
      await kvSet(wildHarvestKey, state);

      let weather = await kvGet('weather:global');
      if (!weather) {
        weather = { current: 'clear', expiresAt: Date.now() + 30 * 60 * 1000 };
        await kvSet('weather:global', weather);
      }

      const seedCoins = await kvGet(`seedcoins:${memberId}`) || 0;

      return res.status(200).json({
        state, weather, seedCoins,
        biomes: BIOMES, plants: WILD_PLANTS, shovelTiers: SHOVEL_TIERS,
        shovelUpgradeCost: SHOVEL_UPGRADE_COST,
        worldRadiusMin: WORLD_RADIUS_MIN, worldRadiusMax: WORLD_RADIUS_MAX,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // DIG-SPOT — gali 1 dig spot. Hasil di-roll SERVER murni acak
  // (perfect/good/miss), BUKAN dari timing QTE manual di klien — klien
  // cuma kirim spotId mana yang mau digali, server yang tentukan hasil.
  // Durability shovel berkurang TIAP KALI gali (berhasil ataupun miss).
  if (action === 'dig-spot') {
    const { spotId } = req.body;
    if (!spotId || !DIG_SPOT_LAYOUT[spotId]) {
      return res.status(400).json({ error: 'Dig spot tidak dikenali' });
    }

    try {
      let state = await kvGet(wildHarvestKey);
      if (!state) state = defaultWildHarvestState();
      state = refreshDigSpots(state);

      const spot = state.digSpots[spotId];
      if (spot.diggableAt !== null && Date.now() < spot.diggableAt) {
        return res.status(400).json({ error: 'Dig spot ini belum respawn' });
      }

      const plant = WILD_PLANTS[spot.plantId];
      const shovel = SHOVEL_TIERS[state.shovelTier];
      if (!shovel.canDigTier.includes(plant.tier)) {
        return res.status(400).json({ error: `Shovel kamu belum cukup kuat untuk menggali ${plant.name} (tier ${plant.tier})` });
      }
      if (state.shovelDurability <= 0) {
        return res.status(400).json({ error: 'Shovel kamu sudah rusak, perbaiki dulu sebelum menggali' });
      }

      const outcome = rollDigOutcome();
      const qtyRange = TIER_DIG_QUANTITY[outcome];
      const quantity = Math.floor(qtyRange.min + Math.random() * (qtyRange.max - qtyRange.min + 1));

      if (quantity > 0) {
        state.seedInventory[spot.plantId] = (state.seedInventory[spot.plantId] || 0) + quantity;
      }

      // Durability berkurang tiap gali, berhasil ataupun miss.
      if (state.shovelDurability !== Infinity) {
        state.shovelDurability = Math.max(0, state.shovelDurability - 1);
      }

      // Set jadwal respawn dig spot ini.
      const respawnMinutes = TIER_RESPAWN_MINUTES[plant.tier];
      spot.diggableAt = Date.now() + respawnMinutes * 60 * 1000;

      await kvSet(wildHarvestKey, state);

      return res.status(200).json({
        success: true, outcome, plantId: spot.plantId, quantity,
        shovelDurability: state.shovelDurability, state,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // UPGRADE-SHOVEL — naik 1 tier, bayar Seed Coin, durability full di tier baru.
  if (action === 'upgrade-shovel') {
    try {
      let state = await kvGet(wildHarvestKey);
      if (!state) state = defaultWildHarvestState();

      const nextTier = state.shovelTier + 1;
      const tierData = SHOVEL_TIERS[nextTier];
      if (!tierData) return res.status(400).json({ error: 'Shovel sudah di tier maksimal' });

      const cost = SHOVEL_UPGRADE_COST[nextTier];
      const seedCoins = await kvGet(`seedcoins:${memberId}`) || 0;
      if (seedCoins < cost) return res.status(400).json({ error: 'Seed Coin tidak cukup' });

      await kvSet(`seedcoins:${memberId}`, seedCoins - cost);
      state.shovelTier = nextTier;
      state.shovelDurability = tierData.maxDurability;
      await kvSet(wildHarvestKey, state);

      return res.status(200).json({ success: true, state, seedCoins: seedCoins - cost });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // REPAIR-SHOVEL — isi ulang durability shovel saat ini ke maksimal,
  // bayar Seed Coin proporsional dengan durability yang hilang.
  if (action === 'repair-shovel') {
    try {
      let state = await kvGet(wildHarvestKey);
      if (!state) state = defaultWildHarvestState();

      const tierData = SHOVEL_TIERS[state.shovelTier];
      if (tierData.maxDurability === Infinity) {
        return res.status(400).json({ error: 'Shovel ini tidak pernah rusak, tidak perlu diperbaiki' });
      }
      const missing = tierData.maxDurability - state.shovelDurability;
      if (missing <= 0) return res.status(400).json({ error: 'Durability shovel sudah penuh' });

      const cost = missing * SHOVEL_REPAIR_COST_PER_DURABILITY;
      const seedCoins = await kvGet(`seedcoins:${memberId}`) || 0;
      if (seedCoins < cost) return res.status(400).json({ error: 'Seed Coin tidak cukup' });

      await kvSet(`seedcoins:${memberId}`, seedCoins - cost);
      state.shovelDurability = tierData.maxDurability;
      await kvSet(wildHarvestKey, state);

      return res.status(200).json({ success: true, state, seedCoins: seedCoins - cost });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
}
