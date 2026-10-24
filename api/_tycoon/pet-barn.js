// api/_tycoon/pet-barn.js — Pet Barn: kandang, makan, bersih, elus, panen hasil ternak.
// Dipindah dari api/tycoon.js TANPA perubahan logika. Hanya named export.

import { BARN_LEVELS, PETS, kvGet, kvSet, loadBarnState } from './shared.js';

// ══════════════════════════════════════
// PET BARN — kandang aktif (petbarn.html, halaman terpisah lagi dari
// catchapet.html, tapi backend numpang di file ini juga). Hewan yang
// ditangkap masuk ke sini: dipiara (makan/bersih/elus utk happiness),
// dan KHUSUS hewan ternak (livestockYield) bisa dipanen hasilnya utk
// dijual dapat Animal Coin.
// ══════════════════════════════════════

const PET_FOOD_COST = 15; // Animal Coin per kali kasih makan

const PET_HAPPINESS_PER_FEED = 15;

const PET_HAPPINESS_PER_CLEAN = 10;

const PET_HAPPINESS_PER_PET = 5; // elus

const PET_HAPPINESS_DECAY_PER_HOUR = 2; // happiness berkurang perlahan seiring waktu kalau tidak diurus

const MAX_HAPPINESS = 100;

function computeCurrentHappiness(pet) {
  const lastUpdate = Math.max(pet.lastFedAt || 0, pet.lastCleanedAt || 0, pet.happinessSetAt || 0);
  const hoursPassed = (Date.now() - lastUpdate) / (1000 * 60 * 60);
  const decayed = pet.happiness - hoursPassed * PET_HAPPINESS_DECAY_PER_HOUR;
  return Math.max(0, Math.min(MAX_HAPPINESS, Math.round(decayed)));
}

// Hitung berapa banyak hasil ternak yang siap dipanen sejak terakhir
// dikumpulkan, berdasarkan minutesPerYield spesies itu (idle-progress
// style, sama seperti applyRefineryProgress).
function computePendingYield(pet) {
  const petData = PETS[pet.petId];
  if (!petData || !petData.livestockYield) return 0;
  const minutesPassed = (Date.now() - (pet.lastYieldCollectedAt || pet.caughtAt || Date.now())) / (1000 * 60);
  return Math.floor(minutesPassed / petData.livestockYield.minutesPerYield);
}

export async function handlePetBarn(ctx, res) {
  const { req, action, memberId } = ctx;

  // ══════════════════════════════════════════════════════════════════
  // PET BARN — actions (kandang aktif, halaman terpisah petbarn.html,
  // backend numpang di file ini juga)
  // ══════════════════════════════════════════════════════════════════

  const petBarnKey = `petbarn:${memberId}`;

  // Cari instance hewan di kandang, entah itu di `pets` (hewan darat)
  // atau `fishPond` (ikan) — dipakai semua action perawatan supaya tidak
  // perlu tahu dulu di array mana hewan itu berada.
  function findPetInstance(state, instanceId) {
    return state.pets.find(p => p.instanceId === instanceId)
      || state.fishPond.find(p => p.instanceId === instanceId);
  }

  if (action === 'get-petbarn-state') {
    try {
      const state = await loadBarnState(memberId);
      // Simpan hasil migrasi (kalau ada perubahan seperti ikan yang
      // dipindah dari `pets` ke `fishPond`) supaya tidak perlu migrasi
      // ulang tiap request — sekali pindah, permanen di Redis.
      await kvSet(`petbarn:${memberId}`, state);

      const animalCoins = await kvGet(`animalcoins:${memberId}`) || 0;
      const levelData = BARN_LEVELS[state.level];

      const withComputed = (pet) => ({
        ...pet,
        currentHappiness: computeCurrentHappiness(pet),
        pendingYield: computePendingYield(pet),
      });

      return res.status(200).json({
        state: {
          level: state.level,
          pets: state.pets.map(withComputed),
          fishPond: state.fishPond.map(withComputed),
        },
        animalCoins, pets: PETS,
        foodCost: PET_FOOD_COST,
        barnCapacity: levelData.pets,
        fishPondCapacity: levelData.fishPondCapacity,
        barnLevels: BARN_LEVELS,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // UPGRADE-BARN — naik 1 level, tambah kapasitas pets & fishPond
  // sekaligus (pola sama persis upgrade-garden).
  if (action === 'upgrade-barn') {
    try {
      let state = await loadBarnState(memberId);

      const nextLevel = (state.level || 1) + 1;
      const levelData = BARN_LEVELS[nextLevel];
      if (!levelData) return res.status(400).json({ error: 'Kandang sudah di level maksimal' });

      const animalCoins = await kvGet(`animalcoins:${memberId}`) || 0;
      if (animalCoins < levelData.upgradeCost) return res.status(400).json({ error: 'Animal Coin tidak cukup' });

      await kvSet(`animalcoins:${memberId}`, animalCoins - levelData.upgradeCost);
      state.level = nextLevel;
      await kvSet(petBarnKey, state);

      return res.status(200).json({
        success: true, animalCoins: animalCoins - levelData.upgradeCost,
        state: { level: state.level, pets: state.pets, fishPond: state.fishPond },
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (action === 'feed-pet') {
    const { instanceId } = req.body;
    try {
      let state = await loadBarnState(memberId);
      const pet = findPetInstance(state, instanceId);
      if (!pet) return res.status(400).json({ error: 'Hewan tidak ditemukan di kandang' });

      const animalCoins = await kvGet(`animalcoins:${memberId}`) || 0;
      if (animalCoins < PET_FOOD_COST) return res.status(400).json({ error: 'Animal Coin tidak cukup' });

      await kvSet(`animalcoins:${memberId}`, animalCoins - PET_FOOD_COST);
      const current = computeCurrentHappiness(pet);
      pet.happiness = Math.min(MAX_HAPPINESS, current + PET_HAPPINESS_PER_FEED);
      pet.lastFedAt = Date.now();
      pet.happinessSetAt = Date.now();
      await kvSet(petBarnKey, state);

      return res.status(200).json({ success: true, state, animalCoins: animalCoins - PET_FOOD_COST });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (action === 'clean-pet') {
    const { instanceId } = req.body;
    try {
      let state = await loadBarnState(memberId);
      const pet = findPetInstance(state, instanceId);
      if (!pet) return res.status(400).json({ error: 'Hewan tidak ditemukan di kandang' });

      const current = computeCurrentHappiness(pet);
      pet.happiness = Math.min(MAX_HAPPINESS, current + PET_HAPPINESS_PER_CLEAN);
      pet.lastCleanedAt = Date.now();
      pet.happinessSetAt = Date.now();
      await kvSet(petBarnKey, state);

      return res.status(200).json({ success: true, state });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (action === 'pet-the-pet') { // elus
    const { instanceId } = req.body;
    try {
      let state = await loadBarnState(memberId);
      const pet = findPetInstance(state, instanceId);
      if (!pet) return res.status(400).json({ error: 'Hewan tidak ditemukan di kandang' });

      const current = computeCurrentHappiness(pet);
      pet.happiness = Math.min(MAX_HAPPINESS, current + PET_HAPPINESS_PER_PET);
      pet.happinessSetAt = Date.now();
      await kvSet(petBarnKey, state);

      return res.status(200).json({ success: true, state });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // COLLECT-YIELD — panen hasil ternak (susu/telur/madu) yang sudah
  // terkumpul, LANGSUNG dijual jadi Animal Coin (bukan disimpan sebagai
  // item, karena tidak ada sistem inventory barang di Catch a Pet —
  // lebih simpel, sesuai pola "harvest-plant langsung jual" di Garden).
  if (action === 'collect-yield') {
    const { instanceId } = req.body;
    try {
      let state = await loadBarnState(memberId);
      const pet = findPetInstance(state, instanceId);
      if (!pet) return res.status(400).json({ error: 'Hewan tidak ditemukan di kandang' });

      const petData = PETS[pet.petId];
      if (!petData.livestockYield) return res.status(400).json({ error: 'Hewan ini bukan ternak, tidak ada hasil untuk dipanen' });

      const pendingYield = computePendingYield(pet);
      if (pendingYield <= 0) return res.status(400).json({ error: 'Belum ada hasil yang siap dipanen' });

      const earnedAnimalCoins = pendingYield * petData.livestockYield.sellPrice;
      const animalCoins = await kvGet(`animalcoins:${memberId}`) || 0;
      await kvSet(`animalcoins:${memberId}`, animalCoins + earnedAnimalCoins);

      pet.lastYieldCollectedAt = Date.now();
      await kvSet(petBarnKey, state);

      return res.status(200).json({
        success: true, yieldCount: pendingYield, yieldName: petData.livestockYield.itemName,
        earnedAnimalCoins, animalCoins: animalCoins + earnedAnimalCoins, state,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
}
