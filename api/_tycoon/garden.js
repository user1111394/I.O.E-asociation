// api/_tycoon/garden.js — Garden: tanam, siram, pupuk, hama, panen.
// Dipindah dari api/tycoon.js TANPA perubahan logika. Hanya named export.

import { WILD_PLANTS, defaultWildHarvestState, kvGet, kvSet, pickRandom, upgradeCost } from './shared.js';

// ══════════════════════════════════════
// GROW-A-PLANT — kebun rumah (garden.html, halaman terpisah dari
// wildharvest.html, tapi backend numpang di file ini juga). Biji dari
// Wild Harvest ditanam di sini; hasil panen dijual dapat Seed Coin.
// ══════════════════════════════════════

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

const SEASON_DURATION_DAYS = 7;

const PLANT_FAVORITE_SEASON = {
  sunbloom: 'spring', dandelily: 'spring', cloverleaf: 'spring', stargrass: 'spring',
  sandspike: 'summer', emberbloom: 'summer', lavabud: 'summer', sunkissedrose: 'summer',
  glowroot: 'autumn', moonpetal: 'autumn', coralvine: 'autumn', whispervine: 'autumn',
  stormbell: 'summer', abyssalcoral: 'autumn',
  frostberry: 'winter', icetalon: 'winter', moonshard: 'winter',
  mythicbloom: null, // optimal di semua musim
};

const FAVORITE_SEASON_GROWTH_BONUS = 0.20; // +20% kecepatan tumbuh kalau musim saat ini = musim favorit

const FERTILIZERS = {
  basic:    { name: 'Basic Compost',      cost: 20,  growthBonus: 0.10, yieldBonus: 0 },
  quality:  { name: 'Quality Fertilizer', cost: 60,  growthBonus: 0.25, yieldBonus: 1 },
  premium:  { name: 'Premium Fertilizer', cost: 150, growthBonus: 0.50, yieldBonus: 2 },
  magic:    { name: 'Magic Elixir',       cost: 400, growthBonus: 1.00, yieldBonus: 2, doubleYield: true },
  stardust: { name: 'Star Dust',          cost: 900, growthBonus: 1.00, yieldBonus: 3, doubleYield: true, shiny: true },
};

const GARDEN_LEVELS = {
  1: { plots: 4,  upgradeCost: 0 },
  2: { plots: 9,  upgradeCost: 1000 },
  3: { plots: 16, upgradeCost: 3000 },
  4: { plots: 25, upgradeCost: 6000 },
  5: { plots: 36, upgradeCost: 10000 },
};

const GROWTH_STAGES = [
  { stage: 'planted', minProgress: 0 },
  { stage: 'sprout',  minProgress: 0.15 },
  { stage: 'growing', minProgress: 0.4 },
  { stage: 'mature',  minProgress: 1.0 },
];

// Hama: diimplementasi penuh sejak awal. Tiap get-garden-state, plot
// yang sedang tumbuh (bukan planted/mature) punya peluang kecil kena
// hama; kalau kena, growth freeze (waktu efektif tidak nambah) sampai
// user treat-pest manual.
const PEST_CHANCE_PER_CHECK = 0.03; // 3% per plot per pengecekan

const PEST_TYPES = ['aphid', 'blight', 'mold'];

const PEST_TREATMENT_COST = 30; // Seed Coin per treat-pest

function defaultGardenState() {
  return {
    level: 1,
    plots: Array.from({ length: GARDEN_LEVELS[1].plots }, () => ({
      plantId: null, plantedAt: null, wateredAt: null, fertilizer: null,
      pest: null, pestAppliedAt: null, growthPausedMs: 0,
    })),
  };
}

// Progress pertumbuhan 0..1, dengan bonus musim favorit + fertilizer,
// dan mengurangi waktu yang "dibekukan" karena hama.
function computePlantProgress(plot, plantId, currentSeason) {
  if (!plot.plantedAt) return 0;
  const plant = WILD_PLANTS[plantId];
  if (!plant) return 0;

  let speedMultiplier = 1;
  if (PLANT_FAVORITE_SEASON[plantId] === currentSeason) speedMultiplier += FAVORITE_SEASON_GROWTH_BONUS;
  if (plot.fertilizer && FERTILIZERS[plot.fertilizer]) speedMultiplier += FERTILIZERS[plot.fertilizer].growthBonus;

  const growMs = plant.growDays * 24 * 60 * 60 * 1000;
  const elapsedMs = Math.max(0, Date.now() - plot.plantedAt - (plot.growthPausedMs || 0));
  const effectiveElapsedMs = elapsedMs * speedMultiplier;
  return Math.min(1, effectiveElapsedMs / growMs);
}

function growthStageFromProgress(progress) {
  let stage = GROWTH_STAGES[0].stage;
  for (const s of GROWTH_STAGES) {
    if (progress >= s.minProgress) stage = s.stage;
  }
  return stage;
}

// Helper terpusat: kembalikan array plots dengan `progress`/`stage`
// terhitung untuk SETIAP plot, dipakai SEMUA action Garden yang
// mengembalikan `state` ke klien (bukan cuma get-garden-state).
//
// BUG YANG DIPERBAIKI: sebelumnya cuma get-garden-state yang menyisipkan
// progress/stage; action lain (plant-seed, water-plant, fertilize-plant,
// treat-pest, harvest-plant, upgrade-garden) mengembalikan plots MENTAH
// tanpa field itu. Di klien, tanaman dengan stage undefined otomatis
// digambar sebagai scale minimum (seolah baru ditanam) — jadi begitu
// SATU plot dipanen lewat harvest-plant, SEMUA plot lain yang datang
// dalam response yang sama ikut kelihatan "reset" ke tahap awal secara
// VISUAL saja (progress asli di Redis tidak pernah berubah, cuma
// representasi yang dikirim ke klien tidak lengkap).
function plotsWithComputedProgress(plots, season) {
  return plots.map((plot) => {
    if (!plot.plantId) return { ...plot, progress: 0, stage: 'empty' };
    const progress = computePlantProgress(plot, plot.plantId, season.current);
    return { ...plot, progress, stage: growthStageFromProgress(progress) };
  });
}

// Roll hama & bekukan waktu tumbuh untuk plot yang belum mature dan
// belum kena hama. Dipanggil tiap get-garden-state (bukan tiap detik —
// cukup tiap kali halaman dibuka/refresh, supaya tidak terlalu sering
// menghukum pemain yang jarang cek).
function rollPestsForGarden(state, currentSeason) {
  const now = Date.now();
  for (const plot of state.plots) {
    if (!plot.plantId || plot.pest) continue; // kosong atau sudah kena hama, skip
    const progress = computePlantProgress(plot, plot.plantId, currentSeason);
    if (progress >= 1) continue; // sudah mature, tidak perlu kena hama lagi
    if (Math.random() < PEST_CHANCE_PER_CHECK) {
      plot.pest = pickRandom(PEST_TYPES);
      plot.pestAppliedAt = now;
    }
  }
  return state;
}

// Sebelum dipakai untuk hitung progress, tambahkan waktu beku (freeze)
// untuk plot yang SEDANG kena hama sejak pengecekan terakhir. Dipanggil
// bareng rollPestsForGarden tiap get-garden-state.
function applyPestFreeze(state, lastCheckedAt) {
  const now = Date.now();
  for (const plot of state.plots) {
    if (plot.plantId && plot.pest && plot.pestAppliedAt) {
      const frozenSince = Math.max(plot.pestAppliedAt, lastCheckedAt || plot.pestAppliedAt);
      plot.growthPausedMs = (plot.growthPausedMs || 0) + Math.max(0, now - frozenSince);
    }
  }
  return state;
}

async function getOrInitSeason() {
  let season = await kvGet('season:global');
  if (!season) {
    season = { current: SEASONS[0], startedAt: Date.now() };
    await kvSet('season:global', season);
    return season;
  }
  const daysPassed = (Date.now() - season.startedAt) / (1000 * 60 * 60 * 24);
  if (daysPassed >= SEASON_DURATION_DAYS) {
    const currentIdx = SEASONS.indexOf(season.current);
    const nextIdx = (currentIdx + 1) % SEASONS.length;
    season = { current: SEASONS[nextIdx], startedAt: Date.now() };
    await kvSet('season:global', season);
  }
  return season;
}

export async function handleGarden(ctx, res) {
  const { req, action, memberId } = ctx;

const wildHarvestKey = `wildharvest:${memberId}`;

  // ══════════════════════════════════════════════════════════════════
  // GROW-A-PLANT (Garden) — actions. Halaman terpisah (garden.html) tapi
  // backend numpang di file ini juga, sesuai keputusan proyek.
  // ══════════════════════════════════════════════════════════════════

  const gardenKey = `garden:${memberId}`;

  // GET-GARDEN-STATE — ambil state kebun, roll hama, bekukan waktu tumbuh
  // plot yang kena hama, kirim data statis biar frontend tidak hardcode.
  if (action === 'get-garden-state') {
    try {
      let state = await kvGet(gardenKey);
      if (!state) state = defaultGardenState();

      const season = await getOrInitSeason();
      const lastCheckedAt = state.lastCheckedAt || Date.now();
      state = applyPestFreeze(state, lastCheckedAt);
      state = rollPestsForGarden(state, season.current);
      state.lastCheckedAt = Date.now();
      await kvSet(gardenKey, state);

      const seedCoins = await kvGet(`seedcoins:${memberId}`) || 0;
      const wildHarvestState = await kvGet(wildHarvestKey);
      const seedInventory = wildHarvestState ? wildHarvestState.seedInventory : {};

      return res.status(200).json({
        state: { ...state, plots: plotsWithComputedProgress(state.plots, season) },
        season, seedCoins, seedInventory,
        plants: WILD_PLANTS, fertilizers: FERTILIZERS, gardenLevels: GARDEN_LEVELS,
        pestTreatmentCost: PEST_TREATMENT_COST,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // PLANT-SEED — tanam 1 biji dari seedInventory (Wild Harvest) ke 1 plot kosong.
  if (action === 'plant-seed') {
    const { plotIndex, plantId } = req.body;
    if (!WILD_PLANTS[plantId]) return res.status(400).json({ error: 'Tanaman tidak dikenali' });

    try {
      let gardenState = await kvGet(gardenKey);
      if (!gardenState) gardenState = defaultGardenState();

      const plot = gardenState.plots[plotIndex];
      if (!plot) return res.status(400).json({ error: 'Plot tidak ditemukan' });
      if (plot.plantId) return res.status(400).json({ error: 'Plot ini sudah ditanami' });

      let wildHarvestState = await kvGet(wildHarvestKey);
      if (!wildHarvestState) wildHarvestState = defaultWildHarvestState();
      const seedCount = wildHarvestState.seedInventory[plantId] || 0;
      if (seedCount < 1) return res.status(400).json({ error: 'Biji ini tidak ada di inventory, gali dulu di Wild Harvest' });

      wildHarvestState.seedInventory[plantId] = seedCount - 1;
      plot.plantId = plantId;
      plot.plantedAt = Date.now();
      plot.wateredAt = null;
      plot.fertilizer = null;
      plot.pest = null;
      plot.pestAppliedAt = null;
      plot.growthPausedMs = 0;

      await kvSet(wildHarvestKey, wildHarvestState);
      await kvSet(gardenKey, gardenState);

      const season = await getOrInitSeason();
      return res.status(200).json({
        success: true,
        state: { ...gardenState, plots: plotsWithComputedProgress(gardenState.plots, season) },
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // WATER-PLANT — siram plot (dokumen asli: siram itu wajib rutin biar
  // tidak layu; di versi web ini disederhanakan jadi penanda saja, TIDAK
  // memengaruhi growth speed langsung — cukup dicatat wateredAt untuk
  // dipakai UI/reminder, supaya tidak menambah kompleksitas idle-calc).
  if (action === 'water-plant') {
    const { plotIndex } = req.body;
    try {
      let state = await kvGet(gardenKey);
      if (!state) state = defaultGardenState();
      const plot = state.plots[plotIndex];
      if (!plot || !plot.plantId) return res.status(400).json({ error: 'Plot ini kosong' });

      plot.wateredAt = Date.now();
      await kvSet(gardenKey, state);

      const season = await getOrInitSeason();
      return res.status(200).json({
        success: true,
        state: { ...state, plots: plotsWithComputedProgress(state.plots, season) },
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // FERTILIZE-PLANT — pasang pupuk di plot (bayar Seed Coin), menambah growthBonus.
  if (action === 'fertilize-plant') {
    const { plotIndex, fertilizerId } = req.body;
    const fert = FERTILIZERS[fertilizerId];
    if (!fert) return res.status(400).json({ error: 'Pupuk tidak dikenali' });

    try {
      let state = await kvGet(gardenKey);
      if (!state) state = defaultGardenState();
      const plot = state.plots[plotIndex];
      if (!plot || !plot.plantId) return res.status(400).json({ error: 'Plot ini kosong' });
      if (plot.fertilizer) return res.status(400).json({ error: 'Plot ini sudah dipupuk' });

      const seedCoins = await kvGet(`seedcoins:${memberId}`) || 0;
      if (seedCoins < fert.cost) return res.status(400).json({ error: 'Seed Coin tidak cukup' });

      await kvSet(`seedcoins:${memberId}`, seedCoins - fert.cost);
      plot.fertilizer = fertilizerId;
      await kvSet(gardenKey, state);

      const season = await getOrInitSeason();
      return res.status(200).json({
        success: true, seedCoins: seedCoins - fert.cost,
        state: { ...state, plots: plotsWithComputedProgress(state.plots, season) },
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // TREAT-PEST — bayar Seed Coin untuk hilangkan hama dari 1 plot,
  // growth freeze berhenti (waktu mulai berjalan normal lagi).
  if (action === 'treat-pest') {
    const { plotIndex } = req.body;
    try {
      let state = await kvGet(gardenKey);
      if (!state) state = defaultGardenState();
      const plot = state.plots[plotIndex];
      if (!plot || !plot.plantId) return res.status(400).json({ error: 'Plot ini kosong' });
      if (!plot.pest) return res.status(400).json({ error: 'Plot ini tidak kena hama' });

      const seedCoins = await kvGet(`seedcoins:${memberId}`) || 0;
      if (seedCoins < PEST_TREATMENT_COST) return res.status(400).json({ error: 'Seed Coin tidak cukup' });

      await kvSet(`seedcoins:${memberId}`, seedCoins - PEST_TREATMENT_COST);
      plot.pest = null;
      plot.pestAppliedAt = null;
      await kvSet(gardenKey, state);

      const season = await getOrInitSeason();
      return res.status(200).json({
        success: true, seedCoins: seedCoins - PEST_TREATMENT_COST,
        state: { ...state, plots: plotsWithComputedProgress(state.plots, season) },
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // HARVEST-PLANT — panen plot yang sudah mature. Hasil panen LANGSUNG
  // dijual jadi Seed Coin (sesuai keputusan: yang bisa dijual adalah hasil
  // panen, bukan biji). Fertilizer memberi yieldBonus & doubleYield.
  // Plot dikosongkan lagi setelah panen (siap ditanam ulang).
  if (action === 'harvest-plant') {
    const { plotIndex } = req.body;
    try {
      let state = await kvGet(gardenKey);
      if (!state) state = defaultGardenState();
      const plot = state.plots[plotIndex];
      if (!plot || !plot.plantId) return res.status(400).json({ error: 'Plot ini kosong' });

      const season = await getOrInitSeason();
      const progress = computePlantProgress(plot, plot.plantId, season.current);
      if (progress < 1) return res.status(400).json({ error: 'Tanaman ini belum matang' });

      const plant = WILD_PLANTS[plot.plantId];
      let yieldCount = 1;
      if (plot.fertilizer && FERTILIZERS[plot.fertilizer]) {
        const fert = FERTILIZERS[plot.fertilizer];
        yieldCount += fert.yieldBonus;
        if (fert.doubleYield) yieldCount *= 2;
      }

      const earnedSeedCoins = yieldCount * plant.harvestSellPrice;
      const seedCoins = await kvGet(`seedcoins:${memberId}`) || 0;
      await kvSet(`seedcoins:${memberId}`, seedCoins + earnedSeedCoins);

      // Kosongkan plot, siap ditanam lagi.
      state.plots[plotIndex] = {
        plantId: null, plantedAt: null, wateredAt: null, fertilizer: null,
        pest: null, pestAppliedAt: null, growthPausedMs: 0,
      };
      await kvSet(gardenKey, state);

      return res.status(200).json({
        success: true, yieldCount, earnedSeedCoins,
        seedCoins: seedCoins + earnedSeedCoins,
        state: { ...state, plots: plotsWithComputedProgress(state.plots, season) },
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // UPGRADE-GARDEN — naik 1 level, tambah slot plot kosong baru di akhir array.
  if (action === 'upgrade-garden') {
    try {
      let state = await kvGet(gardenKey);
      if (!state) state = defaultGardenState();

      const nextLevel = state.level + 1;
      const levelData = GARDEN_LEVELS[nextLevel];
      if (!levelData) return res.status(400).json({ error: 'Kebun sudah di level maksimal' });

      const seedCoins = await kvGet(`seedcoins:${memberId}`) || 0;
      if (seedCoins < levelData.upgradeCost) return res.status(400).json({ error: 'Seed Coin tidak cukup' });

      await kvSet(`seedcoins:${memberId}`, seedCoins - levelData.upgradeCost);
      state.level = nextLevel;
      const additionalPlots = levelData.plots - state.plots.length;
      for (let i = 0; i < additionalPlots; i++) {
        state.plots.push({
          plantId: null, plantedAt: null, wateredAt: null, fertilizer: null,
          pest: null, pestAppliedAt: null, growthPausedMs: 0,
        });
      }
      await kvSet(gardenKey, state);

      const season = await getOrInitSeason();
      return res.status(200).json({
        success: true, seedCoins: seedCoins - levelData.upgradeCost,
        state: { ...state, plots: plotsWithComputedProgress(state.plots, season) },
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
}
