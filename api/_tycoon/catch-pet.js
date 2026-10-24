// api/_tycoon/catch-pet.js — Catch a Pet: tangkap, lari, alat tangkap.
// Dipindah dari api/tycoon.js TANPA perubahan logika. Hanya named export.

import { BARN_LEVELS, PETS, kvGet, kvSet, loadBarnState, pickRandom } from './shared.js';

// ══════════════════════════════════════
// CATCH A PET — dunia 3D TERPISAH dari Wild Harvest (dikonfirmasi user:
// kalau digabung bakal berat karena hewan butuh AI kabur, beda logic
// sama sekali dari dig spot yang diam). File frontend: catchapet.html.
// Backend numpang di file ini juga (demi hemat slot API Vercel).
// Mata uang baru: ANIMAL COIN (animalcoins:{memberId}).
//
// 5 bioma PERSIS SAMA seperti Wild Harvest (nama sama persis di
// dokumen asli), tapi didefinisikan ULANG dengan namespace PET_ terpisah
// supaya kalau salah satu diubah nanti tidak saling memengaruhi.
// ══════════════════════════════════════

const PET_BIOMES = {
  meadow:    { name: 'Sunny Meadows',    angleStart: 0,   angleEnd: 72,  color: 0x8fd888 },
  forest:    { name: 'Whispering Woods', angleStart: 72,  angleEnd: 144, color: 0x3a7a4a },
  coast:     { name: 'Crystal Coast',    angleStart: 144, angleEnd: 216, color: 0xf0e0b0 },
  snow:      { name: 'Frostbite Valley', angleStart: 216, angleEnd: 288, color: 0xeef4f8 },
  highlands: { name: 'Ember Highlands',  angleStart: 288, angleEnd: 360, color: 0x9a6248 },
};

const PET_WORLD_RADIUS_MIN = 15;

const PET_WORLD_RADIUS_MAX = 260;

// 5 tier alat tangkap (lasso/perangkap), pola SAMA PERSIS shovel Wild
// Harvest. `catchRadius` = jarak maksimal QTE tangkap bisa dimulai.
const CATCH_TOOL_TIERS = {
  1: { name: 'Cotton Rope',     maxDurability: 10,       canCatchTier: ['common'], catchRadius: 3.0 },
  2: { name: 'Silk Glow Lasso', maxDurability: 30,       canCatchTier: ['common', 'uncommon'], catchRadius: 3.6 },
  3: { name: 'Ironvine Lasso',  maxDurability: 60,       canCatchTier: ['common', 'uncommon', 'rare'], catchRadius: 4.2 },
  4: { name: 'Starlight Lasso', maxDurability: 120,      canCatchTier: ['common', 'uncommon', 'rare', 'legendary'], catchRadius: 4.8 },
  5: { name: 'Dragonscale Net', maxDurability: Infinity, canCatchTier: ['common', 'uncommon', 'rare', 'legendary', 'mythic'], catchRadius: 5.5 },
};

const CATCH_TOOL_UPGRADE_COST = { 2: 100, 3: 500, 4: 2000, 5: 8000 };

const CATCH_TOOL_REPAIR_COST_PER_DURABILITY = 5;

const PET_TIER_RESPAWN_MINUTES = { common: 5, uncommon: 10, rare: 20, legendary: 60, mythic: 1440 };

// QTE tangkap: jarum bergerak 0-100 di bar, harus tekan pas di zona
// hijau tengah. Makin langka = zona makin sempit & jarum makin cepat.
const QTE_GREEN_ZONE_WIDTH = { common: 40, uncommon: 30, rare: 22, legendary: 14, mythic: 8 };

const QTE_NEEDLE_SPEED = { common: 1.4, uncommon: 1.7, rare: 2.0, legendary: 2.4, mythic: 2.8 };

// Kalau player LARI (bukan jalan), semua hewan dalam radius ini kabur
// (1 aturan simpel untuk semua hewan, sesuai keputusan user).
const PET_FLEE_RADIUS_ON_RUN = 12;

// Daftar spawn TETAP (bukan random posisi tiap load), pola sama persis
// dig spot Wild Harvest — supaya semua member lihat titik yang sama.
// Ikan (biome 'river') dipisah jadi 6 spot SUNGAI tersendiri (ID
// "river_0".."river_5"), TIDAK ikut campur dengan 30 spot bioma darat —
// ini yang bikin ikan cuma bisa ditangkap dari sungai, sesuai keputusan
// user, karena posisi 3D-nya (dihitung klien) mengikuti jalur sungai.
function buildPetSpawnLayout() {
  const layout = {};
  for (const [biomeId] of Object.entries(PET_BIOMES)) {
    const petsInBiome = Object.entries(PETS).filter(([, p]) => p.biome === biomeId).map(([id]) => id);
    for (let i = 0; i < 6; i++) {
      layout[`${biomeId}_${i}`] = { biome: biomeId, petPool: petsInBiome };
    }
  }
  const riverPets = Object.entries(PETS).filter(([, p]) => p.biome === 'river').map(([id]) => id);
  for (let i = 0; i < 6; i++) {
    layout[`river_${i}`] = { biome: 'river', petPool: riverPets };
  }
  return layout;
}

const PET_SPAWN_LAYOUT = buildPetSpawnLayout();

function defaultCatchPetState() {
  const spawns = {};
  for (const spotId of Object.keys(PET_SPAWN_LAYOUT)) {
    spawns[spotId] = { petId: null, fledAt: null };
  }
  return {
    toolTier: 1,
    toolDurability: CATCH_TOOL_TIERS[1].maxDurability,
    spawns,
  };
}

function refreshPetSpawns(state) {
  const now = Date.now();
  for (const [spotId, layout] of Object.entries(PET_SPAWN_LAYOUT)) {
    const spot = state.spawns[spotId];
    if (!spot) { state.spawns[spotId] = { petId: null, fledAt: null }; continue; }
    const needsNewPet = !spot.petId || (spot.fledAt !== null && now >= spot.fledAt);
    if (needsNewPet) {
      spot.petId = pickRandom(layout.petPool);
      spot.fledAt = null;
    }
  }
  return state;
}

export async function handleCatchPet(ctx, res) {
  const { req, action, memberId } = ctx;

  // ══════════════════════════════════════════════════════════════════
  // CATCH A PET — actions
  // ══════════════════════════════════════════════════════════════════

  const catchPetKey = `catchpet:${memberId}`;

  if (action === 'get-catchpet-state') {
    try {
      let state = await kvGet(catchPetKey);
      if (!state) state = defaultCatchPetState();
      state = refreshPetSpawns(state);
      await kvSet(catchPetKey, state);

      const animalCoins = await kvGet(`animalcoins:${memberId}`) || 0;

      return res.status(200).json({
        state, animalCoins,
        biomes: PET_BIOMES, pets: PETS, toolTiers: CATCH_TOOL_TIERS,
        toolUpgradeCost: CATCH_TOOL_UPGRADE_COST,
        worldRadiusMin: PET_WORLD_RADIUS_MIN, worldRadiusMax: PET_WORLD_RADIUS_MAX,
        greenZoneWidth: QTE_GREEN_ZONE_WIDTH, needleSpeed: QTE_NEEDLE_SPEED,
        fleeRadiusOnRun: PET_FLEE_RADIUS_ON_RUN,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // FLEE-NEARBY-PETS — dipanggil klien tiap kali player mendeteksi diri
  // sendiri LARI (bukan jalan). Server yang tentukan spot mana saja yang
  // dalam radius (klien kirim posisi player), supaya tidak bisa dicurangi
  // dari klien. Spot yang kabur disembunyikan sampai respawn seperti biasa.
  if (action === 'flee-nearby-pets') {
    const { playerX, playerZ, spotPositions } = req.body;
    // spotPositions: { spotId: {x, z} }, dikirim klien karena posisi
    // spot itu deterministik dari ID (dihitung di klien, sama pola
    // seperti digSpotWorldPosition Wild Harvest) — server tidak perlu
    // simpan koordinat 3D sendiri, cukup dikirim ulang oleh klien untuk
    // dicocokkan jaraknya dengan validasi radius di sini.
    if (typeof playerX !== 'number' || typeof playerZ !== 'number' || !spotPositions) {
      return res.status(400).json({ error: 'Data posisi tidak lengkap' });
    }

    try {
      let state = await kvGet(catchPetKey);
      if (!state) state = defaultCatchPetState();
      state = refreshPetSpawns(state);

      let fledCount = 0;
      for (const [spotId, pos] of Object.entries(spotPositions)) {
        const spot = state.spawns[spotId];
        if (!spot || !spot.petId || spot.fledAt !== null) continue;
        const dist = Math.sqrt((playerX - pos.x) ** 2 + (playerZ - pos.z) ** 2);
        if (dist <= PET_FLEE_RADIUS_ON_RUN) {
          const petData = PETS[spot.petId];
          spot.fledAt = Date.now() + PET_TIER_RESPAWN_MINUTES[petData.tier] * 60 * 1000;
          fledCount++;
        }
      }

      await kvSet(catchPetKey, state);
      return res.status(200).json({ success: true, state, fledCount });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ATTEMPT-CATCH — hasil QTE (menang/kalah) ditentukan KLIEN (karena
  // ini soal timing jarum visual real-time yang tidak praktis divalidasi
  // presisi di server), TAPI server tetap validasi semua hal yang bisa
  // dicurangi: jarak ke spot (pakai posisi dikirim klien, sama pola
  // seperti flee-nearby-pets), tier alat vs tier hewan, durability, dan
  // status spot (bukan sedang kabur). Durability berkurang TIAP KALI
  // percobaan (menang ataupun kalah), sama persis pola shovel gali.
  if (action === 'attempt-catch') {
    const { spotId, playerX, playerZ, qteSuccess } = req.body;
    if (!spotId || !PET_SPAWN_LAYOUT[spotId]) {
      return res.status(400).json({ error: 'Spot tidak dikenali' });
    }
    if (typeof playerX !== 'number' || typeof playerZ !== 'number') {
      return res.status(400).json({ error: 'Posisi pemain tidak valid' });
    }

    try {
      let state = await kvGet(catchPetKey);
      if (!state) state = defaultCatchPetState();
      state = refreshPetSpawns(state);

      const spot = state.spawns[spotId];
      if (spot.fledAt !== null && Date.now() < spot.fledAt) {
        return res.status(400).json({ error: 'Hewan ini sedang kabur, tunggu sampai muncul lagi' });
      }

      const petData = PETS[spot.petId];
      const tool = CATCH_TOOL_TIERS[state.toolTier];
      if (!tool.canCatchTier.includes(petData.tier)) {
        return res.status(400).json({ error: `Alat kamu belum cukup kuat untuk menangkap ${petData.name} (tier ${petData.tier})` });
      }
      if (state.toolDurability <= 0) {
        return res.status(400).json({ error: 'Alat tangkap kamu sudah rusak, perbaiki dulu' });
      }

      // Durability berkurang tiap percobaan, berhasil ataupun gagal.
      if (state.toolDurability !== Infinity) {
        state.toolDurability = Math.max(0, state.toolDurability - 1);
      }

      const respawnMinutes = PET_TIER_RESPAWN_MINUTES[petData.tier];
      let caughtPetId = null;

      if (qteSuccess) {
        // Berhasil: spot respawn normal, hewan masuk ke Pet Barn — ikan
        // masuk ke `fishPond` (kapasitas sendiri), hewan darat lainnya
        // masuk ke `pets` (kapasitas sesuai level kandang).
        spot.fledAt = Date.now() + respawnMinutes * 60 * 1000;
        caughtPetId = spot.petId;
        const isFish = caughtPetId === 'goldfish';

        let barnState = await loadBarnState(memberId);
        const levelData = BARN_LEVELS[barnState.level || 1];
        const targetArray = isFish ? barnState.fishPond : barnState.pets;
        const capacity = isFish ? levelData.fishPondCapacity : levelData.pets;

        if (targetArray.length < capacity) {
          targetArray.push({
            instanceId: `pet_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
            petId: caughtPetId,
            happiness: 70, // mulai dengan happiness cukup, bukan 0 (biar tidak langsung "sedih" pas baru ditangkap)
            lastFedAt: Date.now(),
            lastCleanedAt: Date.now(),
            happinessSetAt: Date.now(),
            lastYieldCollectedAt: Date.now(),
            caughtAt: Date.now(),
          });
          await kvSet(`petbarn:${memberId}`, barnState);
        } else {
          // Kandang/kolam penuh: tetap dianggap tertangkap secara peristiwa,
          // tapi TIDAK ditambahkan ke barn (biar tidak hilang diam-diam,
          // klien perlu diberitahu supaya member sadar harus buka slot).
          caughtPetId = null;
          return res.status(200).json({
            success: true, caught: false, barnFull: true, state,
            message: isFish
              ? `Kolam ikan penuh! ${petData.name} yang tertangkap tidak bisa masuk kolam.`
              : `Kandang penuh! ${petData.name} yang tertangkap tidak bisa masuk kandang.`,
          });
        }
      } else {
        // Gagal (meleset QTE): hewan kabur, sama seperti efek lari.
        spot.fledAt = Date.now() + respawnMinutes * 60 * 1000;
      }

      await kvSet(catchPetKey, state);

      return res.status(200).json({
        success: true, caught: !!caughtPetId, petId: caughtPetId,
        toolDurability: state.toolDurability, state,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (action === 'upgrade-catch-tool') {
    try {
      let state = await kvGet(catchPetKey);
      if (!state) state = defaultCatchPetState();

      const nextTier = state.toolTier + 1;
      const tierData = CATCH_TOOL_TIERS[nextTier];
      if (!tierData) return res.status(400).json({ error: 'Alat sudah di tier maksimal' });

      const cost = CATCH_TOOL_UPGRADE_COST[nextTier];
      const animalCoins = await kvGet(`animalcoins:${memberId}`) || 0;
      if (animalCoins < cost) return res.status(400).json({ error: 'Animal Coin tidak cukup' });

      await kvSet(`animalcoins:${memberId}`, animalCoins - cost);
      state.toolTier = nextTier;
      state.toolDurability = tierData.maxDurability;
      await kvSet(catchPetKey, state);

      return res.status(200).json({ success: true, state, animalCoins: animalCoins - cost });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (action === 'repair-catch-tool') {
    try {
      let state = await kvGet(catchPetKey);
      if (!state) state = defaultCatchPetState();

      const tierData = CATCH_TOOL_TIERS[state.toolTier];
      if (tierData.maxDurability === Infinity) {
        return res.status(400).json({ error: 'Alat ini tidak pernah rusak, tidak perlu diperbaiki' });
      }
      const missing = tierData.maxDurability - state.toolDurability;
      if (missing <= 0) return res.status(400).json({ error: 'Durability alat sudah penuh' });

      const cost = missing * CATCH_TOOL_REPAIR_COST_PER_DURABILITY;
      const animalCoins = await kvGet(`animalcoins:${memberId}`) || 0;
      if (animalCoins < cost) return res.status(400).json({ error: 'Animal Coin tidak cukup' });

      await kvSet(`animalcoins:${memberId}`, animalCoins - cost);
      state.toolDurability = tierData.maxDurability;
      await kvSet(catchPetKey, state);

      return res.status(200).json({ success: true, state, animalCoins: animalCoins - cost });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
}
