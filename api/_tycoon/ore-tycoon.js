// api/_tycoon/ore-tycoon.js — Ore Tycoon: mesin, refinery, jual, craft, explore planet.
// Dipindah dari api/tycoon.js TANPA perubahan logika. Hanya named export.

import { MACHINE_TIERS, kvGet, kvSet, upgradeCost } from './shared.js';

// Tiap level upgrade speed: +10% rate. Tiap level upgrade capacity: +20% kapasitas.
function effectiveRate(tier, speedLevel) {
  return MACHINE_TIERS[tier].oreRatePerHour * (1 + 0.10 * (speedLevel - 1));
}

function effectiveCapacity(tier, capacityLevel) {
  return Math.floor(MACHINE_TIERS[tier].baseCapacity * (1 + 0.20 * (capacityLevel - 1)));
}

// ══════════════════════════════════════
// REFINERY — resep olah ORE MENTAH jadi INGOT. inputPerOutput = berapa
// ore mentah dibutuhkan untuk hasilkan 1 ingot. Refinery butuh WAKTU
// (durationSeconds per 1 ingot) — bukan instan — supaya jadi keputusan
// strategis (nunggu refine vs jual ore mentah langsung untuk Ore Coin
// lebih cepat tapi lebih sedikit).
// ══════════════════════════════════════
const REFINERY_RECIPES = {
  coal:      { ingotName: 'Coal Ingot',      inputPerOutput: 3, durationSeconds: 30 },
  copper:    { ingotName: 'Copper Ingot',    inputPerOutput: 3, durationSeconds: 45 },
  iron:      { ingotName: 'Iron Ingot',      inputPerOutput: 3, durationSeconds: 60 },
  silver:    { ingotName: 'Silver Ingot',    inputPerOutput: 3, durationSeconds: 90 },
  gold:      { ingotName: 'Gold Ingot',      inputPerOutput: 3, durationSeconds: 120 },
  platinum:  { ingotName: 'Platinum Ingot',  inputPerOutput: 3, durationSeconds: 180 },
  crystal:   { ingotName: 'Crystal Shard',   inputPerOutput: 2, durationSeconds: 240 }, // crystal tidak jadi "ingot" tapi tetap diproses jadi bentuk siap-pakai (Shard)
  mythril:   { ingotName: 'Mythril Ingot',   inputPerOutput: 2, durationSeconds: 300 },
  uranium:   { ingotName: 'Uranium Rod',     inputPerOutput: 2, durationSeconds: 360 },
  darkmatter:{ ingotName: 'Dark Matter Core',inputPerOutput: 1, durationSeconds: 600 },
};

// ══════════════════════════════════════
// MARKET — harga jual ke NPC dalam Ore Coin. Ore mentah dihargai LEBIH
// RENDAH daripada ingot hasil olahan (insentif buat refine dulu sebelum
// jual, sesuai keputusan desain: "ore murah, ingot lebih mahal").
// Harga ingot kira-kira 4x harga ore mentahnya dikali inputPerOutput,
// supaya proses refine tetap lebih untung daripada jual mentah, tapi
// tidak berlipat-lipat ekstrem.
// ══════════════════════════════════════
const ORE_SELL_PRICE = {
  coal: 1, copper: 2, iron: 4, silver: 8, gold: 20,
  platinum: 40, crystal: 100, mythril: 250, uranium: 600, darkmatter: 1500,
};

const INGOT_SELL_PRICE = {
  coal: 5, copper: 10, iron: 20, silver: 40, gold: 100,
  platinum: 200, crystal: 350, mythril: 900, uranium: 2000, darkmatter: 6000,
};

// ══════════════════════════════════════
// SPACE PROGRAM — data planet Bulan (contoh lengkap pertama, planet lain
// menyusul dengan pola yang sama persis). Craft WAJIB berurutan: satelit
// dulu, baru roket, baru kendaraan — sebelum planet bisa di-explore.
// ══════════════════════════════════════
const PLANETS = {
  moon: {
    name: 'Bulan',
    order: 1,
    satellite: {
      id: 'lunar_surveyor', name: 'Lunar Surveyor',
      cost: { iron: 50, copper: 30, silver: 20, crystal: 5 },
      oreCoinCost: 10000,
    },
    rocket: {
      id: 'lunar_lander', name: 'Lunar Lander',
      cost: { iron: 100, copper: 60, silver: 40, crystal: 10, mythril: 2 },
      oreCoinCost: 25000,
      requires: 'satellite',
    },
    vehicle: {
      id: 'lunar_rover', name: 'Lunar Rover',
      cost: { iron: 70, copper: 40, silver: 20 },
      oreCoinCost: 15000,
      requires: 'rocket',
    },
    exploreRewards: { moonCrystal: { min: 3, max: 8 }, lunarDust: { min: 10, max: 25 } },
  },
  mars: {
    name: 'Mars',
    order: 2,
    satellite: {
      id: 'martian_explorer', name: 'Martian Explorer',
      cost: { iron: 80, gold: 40, platinum: 30, crystal: 10, mythril: 3 },
      oreCoinCost: 25000,
    },
    rocket: {
      id: 'martian_voyager', name: 'Martian Voyager',
      cost: { iron: 150, gold: 80, platinum: 60, crystal: 20, mythril: 8, uranium: 3 },
      oreCoinCost: 60000,
      requires: 'satellite',
    },
    vehicle: {
      id: 'martian_buggy', name: 'Martian Buggy',
      cost: { iron: 120, gold: 60, platinum: 40, crystal: 12, mythril: 4, uranium: 1 },
      oreCoinCost: 35000,
      requires: 'rocket',
    },
    // Sesuai tema Mars: "Martian Ore" (bijih merah khas Mars) dan
    // "Red Dust" (debu merah, ciri khas permukaan Mars yang terkenal).
    exploreRewards: { martianOre: { min: 3, max: 8 }, redDust: { min: 10, max: 25 } },
  },
  jupiter: {
    name: 'Jupiter',
    order: 3,
    satellite: {
      id: 'jovian_observer', name: 'Jovian Observer',
      cost: { iron: 120, gold: 60, platinum: 50, crystal: 20, mythril: 8, uranium: 3 },
      oreCoinCost: 50000,
    },
    rocket: {
      id: 'jovian_cruiser', name: 'Jovian Cruiser',
      cost: { iron: 200, gold: 120, platinum: 100, crystal: 40, mythril: 15, uranium: 5, darkmatter: 2 },
      oreCoinCost: 150000,
      requires: 'satellite',
    },
    vehicle: {
      id: 'jovian_submarine', name: 'Jovian Submarine',
      cost: { iron: 180, gold: 100, platinum: 70, crystal: 25, mythril: 10, uranium: 4, darkmatter: 2 },
      oreCoinCost: 80000,
      requires: 'rocket',
    },
    // Jupiter planet gas raksasa (tidak punya permukaan padat), sesuai
    // nama kendaraannya "Submarine" — eksplorasi di lautan awan/atmosfer,
    // bukan tanah keras seperti Bulan/Mars. Reward: "Jovian Gas" (gas
    // langka hasil ekstraksi atmosfer) dan "Storm Crystal" (kristal yang
    // terbentuk dari badai raksasa Jupiter).
    exploreRewards: { jovianGas: { min: 3, max: 8 }, stormCrystal: { min: 10, max: 25 } },
  },
  saturn: {
    name: 'Saturnus',
    order: 4,
    satellite: {
      id: 'saturn_ring_scanner', name: 'Saturn Ring Scanner',
      cost: { iron: 150, gold: 80, platinum: 60, crystal: 30, mythril: 12, uranium: 5, darkmatter: 2 },
      oreCoinCost: 100000,
    },
    rocket: {
      id: 'saturn_explorer', name: 'Saturn Explorer',
      cost: { iron: 250, gold: 150, platinum: 120, crystal: 50, mythril: 20, uranium: 8, darkmatter: 4 },
      oreCoinCost: 300000,
      requires: 'satellite',
    },
    vehicle: {
      id: 'saturn_flyer', name: 'Saturn Flyer',
      cost: { iron: 220, gold: 130, platinum: 100, crystal: 35, mythril: 15, uranium: 6, darkmatter: 3 },
      oreCoinCost: 150000,
      requires: 'rocket',
    },
    // "Saturn Flyer" (kendaraan terbang) sesuai namanya di dokumen —
    // eksplorasi cincin & atmosfer Saturnus. Reward: "Ring Fragment"
    // (pecahan es/batu dari cincin Saturnus yang ikonik) dan "Titan Gas"
    // (gas langka, merujuk Titan — bulan terbesar Saturnus).
    exploreRewards: { ringFragment: { min: 3, max: 8 }, titanGas: { min: 10, max: 25 } },
  },
  neptune: {
    name: 'Neptunus',
    order: 5,
    satellite: {
      id: 'neptunian_probe', name: 'Neptunian Probe',
      cost: { iron: 180, gold: 100, platinum: 80, crystal: 40, mythril: 16, uranium: 8, darkmatter: 4 },
      oreCoinCost: 250000,
    },
    rocket: {
      id: 'neptunian_explorer', name: 'Neptunian Explorer',
      cost: { iron: 300, gold: 200, platinum: 150, crystal: 60, mythril: 25, uranium: 12, darkmatter: 6 },
      oreCoinCost: 500000,
      requires: 'satellite',
    },
    vehicle: {
      id: 'neptunian_deep_diver', name: 'Neptunian Deep Diver',
      cost: { iron: 280, gold: 170, platinum: 130, crystal: 45, mythril: 20, uranium: 10, darkmatter: 5 },
      oreCoinCost: 300000,
      requires: 'rocket',
    },
    // "Kapal selam besar untuk lautan Neptunus" sesuai deskripsi dokumen.
    // Reward: "Deep Ice" (es dari lautan dalam Neptunus, planet ini
    // dikenal sebagai "ice giant") dan "Cobalt Shard" (biru tua khas
    // warna Neptunus di deskripsi 3D model).
    exploreRewards: { deepIce: { min: 3, max: 8 }, cobaltShard: { min: 10, max: 25 } },
  },
  planetx: {
    name: 'Planet X',
    order: 6,
    satellite: {
      id: 'xplanet_seeker', name: 'X-Planet Seeker',
      cost: { iron: 250, gold: 150, platinum: 120, crystal: 60, mythril: 25, uranium: 15, darkmatter: 10 },
      oreCoinCost: 1000000,
    },
    rocket: {
      id: 'xplanet_explorer_rocket', name: 'X-Planet Explorer',
      cost: { iron: 400, gold: 250, platinum: 200, crystal: 80, mythril: 35, uranium: 20, darkmatter: 12 },
      oreCoinCost: 2000000,
      requires: 'satellite',
    },
    vehicle: {
      id: 'xplanet_explorer_vehicle', name: 'X-Planet Explorer',
      cost: { iron: 350, gold: 220, platinum: 180, crystal: 60, mythril: 30, uranium: 18, darkmatter: 10 },
      oreCoinCost: 1000000,
      requires: 'rocket',
    },
    // Planet paling misterius (tema dark matter/ungu/emas di seluruh
    // dokumen). Reward: "Void Shard" (pecahan dari kekosongan/ruang
    // antar-dimensi) dan "Dark Matter Essence" (versi lebih murni dari
    // Dark Matter Core biasa, ganjaran tertinggi di game ini).
    exploreRewards: { voidShard: { min: 3, max: 8 }, darkMatterEssence: { min: 5, max: 15 } },
  },
};

function defaultTycoonState() {
  return {
    machines: {
      1: { unlocked: true, speedLevel: 1, capacityLevel: 1, oreStored: 0, lastCollectAt: Date.now() },
    },
    oreInventory: {},
    ingotInventory: {},
    // Refinery job aktif (1 slot dulu, bukan antrian — simple untuk versi awal).
    refineryJob: null, // { oreType, quantity, startedAt, finishAt }
    // Progress Space Program per planet: { moon: { satellite: false, rocket: false, vehicle: false, explored: 0 } }
    spaceProgram: {},
  };
}

// Member yang sudah main SEBELUM fitur Refinery/Space Program ditambahkan
// akan punya state tersimpan TANPA field ingotInventory/refineryJob/
// spaceProgram (karena defaultTycoonState() dulu tidak punya field itu).
// loadOrMigrateState() dipanggil di SEMUA action (menggantikan pola lama
// "if (!state) state = defaultTycoonState()") supaya field yang hilang
// ditambal, tanpa mengganggu progress mesin/ore yang sudah ada.
async function loadOrMigrateState(stateKey) {
  let state = await kvGet(stateKey);
  if (!state) return defaultTycoonState();
  if (!state.ingotInventory) state.ingotInventory = {};
  if (state.refineryJob === undefined) state.refineryJob = null;
  if (!state.spaceProgram) state.spaceProgram = {};
  return state;
}

// Hitung ore yang terkumpul di SEMUA mesin unlocked sejak lastCollectAt,
// di-cap di kapasitas efektif masing-masing. Dipanggil sebelum operasi apa
// pun yang butuh state terkini (get-state, collect, upgrade, unlock).
function applyIdleProgress(state) {
  const now = Date.now();
  for (const tierStr of Object.keys(state.machines)) {
    const tier = Number(tierStr);
    const m = state.machines[tierStr];
    if (!m.unlocked) continue;

    const hoursPassed = (now - m.lastCollectAt) / (1000 * 60 * 60);
    const rate = effectiveRate(tier, m.speedLevel);
    const cap = effectiveCapacity(tier, m.capacityLevel);

    const gained = hoursPassed * rate;
    m.oreStored = Math.min(cap, m.oreStored + gained);
    m.lastCollectAt = now;
  }
  return state;
}

// Kalau ada refineryJob aktif dan sudah lewat finishAt, selesaikan:
// pindahkan ore mentah yang sudah dipotong di awal (lihat action
// 'start-refine') jadi ingot jadi, lalu kosongkan slot job.
function applyRefineryProgress(state) {
  if (!state.refineryJob) return state;
  const job = state.refineryJob;
  if (Date.now() < job.finishAt) return state; // belum selesai

  if (!state.ingotInventory) state.ingotInventory = {};
  state.ingotInventory[job.oreType] = (state.ingotInventory[job.oreType] || 0) + job.quantity;
  state.refineryJob = null;
  return state;
}

export async function handleOreTycoon(ctx, res) {
  const { req, action, memberId, stateKey } = ctx;

  // ══════════════════════════════════════
  // GET-STATE — ambil state tycoon, sekaligus proses idle progress
  // (dipanggil saat halaman tycoon.html dibuka)
  // ══════════════════════════════════════
  if (action === 'get-state') {
    try {
      let state = await loadOrMigrateState(stateKey);
      state = applyIdleProgress(state);
      state = applyRefineryProgress(state);
      await kvSet(stateKey, state);

      const oreCoins = await kvGet(`orecoins:${memberId}`) || 0;

      return res.status(200).json({
        state,
        oreCoins,
        machineTiers: MACHINE_TIERS, // dikirim supaya frontend tahu nama, rate, kapasitas, biaya tanpa hardcode ulang
        refineryRecipes: REFINERY_RECIPES,
        oreSellPrice: ORE_SELL_PRICE,
        ingotSellPrice: INGOT_SELL_PRICE,
        planets: PLANETS, // dikirim supaya craft.html & astro.html tahu resep craft & reward tanpa hardcode ulang
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // COLLECT-ORE — ambil ore dari 1 mesin (atau semua, kalau tier tidak dikirim),
  // masukkan ke oreInventory, reset oreStored mesin itu ke 0.
  // ══════════════════════════════════════
  if (action === 'collect-ore') {
    const { tier } = req.body; // opsional: kalau kosong, collect semua ("Collect All")

    try {
      let state = await loadOrMigrateState(stateKey);
      state = applyIdleProgress(state);
      state = applyRefineryProgress(state);

      const tiersToCollect = tier
        ? [String(tier)]
        : Object.keys(state.machines);

      const collected = {};
      for (const tierStr of tiersToCollect) {
        const m = state.machines[tierStr];
        if (!m || !m.unlocked || m.oreStored <= 0) continue;

        const oreType = MACHINE_TIERS[tierStr].oreType;
        const amount = Math.floor(m.oreStored);
        if (amount <= 0) continue;

        state.oreInventory[oreType] = (state.oreInventory[oreType] || 0) + amount;
        collected[oreType] = (collected[oreType] || 0) + amount;
        m.oreStored -= amount; // sisa desimal kecil tetap tersimpan, tidak hilang
      }

      await kvSet(stateKey, state);
      return res.status(200).json({ success: true, collected, state });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // UPGRADE-MACHINE — naikkan speedLevel atau capacityLevel pakai Ore Coin
  //
  // ── PERUBAHAN EKONOMI PENTING ──
  // Sebelumnya pakai `coins:{memberId}` (koin Shop yang sama dengan
  // redeem code/beli item, harganya cuma ratusan). Harga upgrade/unlock
  // mesin tambang sampai JUTAAN — kalau dicampur satu ekonomi dengan Shop,
  // orang bisa grinding tambang doang jadi kaya di Shop, atau beli 1
  // redeem code langsung unlock mesin Tier 10. Sekarang pakai
  // `orecoins:{memberId}` — ekonomi TERPISAH, cuma didapat dari menjual
  // ore/ingot ke market (lihat action 'sell-ore' & 'sell-ingot' di bawah),
  // bukan dari Shop/redeem code sama sekali.
  // ══════════════════════════════════════
  if (action === 'upgrade-machine') {
    const { tier, upgradeType } = req.body; // upgradeType: "speed" | "capacity"

    if (!tier || !MACHINE_TIERS[tier]) return res.status(400).json({ error: 'Tier tidak valid' });
    if (upgradeType !== 'speed' && upgradeType !== 'capacity') {
      return res.status(400).json({ error: 'upgradeType harus "speed" atau "capacity"' });
    }

    try {
      let state = await loadOrMigrateState(stateKey);
      state = applyIdleProgress(state);
      state = applyRefineryProgress(state);

      const m = state.machines[tier];
      if (!m || !m.unlocked) return res.status(400).json({ error: 'Mesin belum dimiliki' });

      const currentLevel = upgradeType === 'speed' ? m.speedLevel : m.capacityLevel;
      const cost = upgradeCost(tier, currentLevel);

      const oreCoins = await kvGet(`orecoins:${memberId}`) || 0;
      if (oreCoins < cost) return res.status(400).json({ error: `Ore Coin tidak cukup. Butuh ${cost}, punya ${oreCoins}` });

      const newOreCoins = oreCoins - cost;
      await kvSet(`orecoins:${memberId}`, newOreCoins);

      if (upgradeType === 'speed') m.speedLevel += 1;
      else m.capacityLevel += 1;

      await kvSet(stateKey, state);
      return res.status(200).json({ success: true, newLevel: upgradeType === 'speed' ? m.speedLevel : m.capacityLevel, oreCoinsLeft: newOreCoins, state });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // UNLOCK-MACHINE — beli mesin tier baru pakai Ore Coin (lihat catatan
  // ekonomi terpisah di komentar action 'upgrade-machine' di atas)
  // ══════════════════════════════════════
  if (action === 'unlock-machine') {
    const { tier } = req.body;

    if (!tier || !MACHINE_TIERS[tier]) return res.status(400).json({ error: 'Tier tidak valid' });

    try {
      let state = await loadOrMigrateState(stateKey);
      state = applyIdleProgress(state);
      state = applyRefineryProgress(state);

      if (state.machines[tier]?.unlocked) {
        return res.status(409).json({ error: 'Mesin ini sudah dimiliki' });
      }

      // Wajib unlock berurutan: tier N butuh tier N-1 sudah unlocked.
      const prevTier = Number(tier) - 1;
      if (prevTier >= 1 && !state.machines[prevTier]?.unlocked) {
        return res.status(400).json({ error: `Unlock ${MACHINE_TIERS[prevTier].name} (Tier ${prevTier}) dulu` });
      }

      const cost = MACHINE_TIERS[tier].unlockCost;
      const oreCoins = await kvGet(`orecoins:${memberId}`) || 0;
      if (oreCoins < cost) return res.status(400).json({ error: `Ore Coin tidak cukup. Butuh ${cost}, punya ${oreCoins}` });

      const newOreCoins = oreCoins - cost;
      await kvSet(`orecoins:${memberId}`, newOreCoins);

      state.machines[tier] = { unlocked: true, speedLevel: 1, capacityLevel: 1, oreStored: 0, lastCollectAt: Date.now() };
      await kvSet(stateKey, state);

      return res.status(200).json({ success: true, oreCoinsLeft: newOreCoins, state });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // START-REFINE — mulai proses 1 job refinery (ore mentah → ingot).
  // Cuma 1 slot job aktif per member (versi awal, sederhana dulu — bisa
  // ditambah slot/antrian nanti kalau dibutuhkan). Ore mentah DIPOTONG
  // LANGSUNG saat job dimulai (bukan saat selesai), supaya tidak bisa
  // dipakai/dijual dobel selagi job berjalan.
  // ══════════════════════════════════════
  if (action === 'start-refine') {
    const { oreType, quantity } = req.body;

    const recipe = REFINERY_RECIPES[oreType];
    if (!recipe) return res.status(400).json({ error: 'Jenis ore tidak dikenali' });

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 1) return res.status(400).json({ error: 'Jumlah tidak valid' });

    try {
      let state = await loadOrMigrateState(stateKey);
      state = applyIdleProgress(state);
      state = applyRefineryProgress(state);

      if (state.refineryJob) {
        return res.status(409).json({ error: 'Refinery sedang memproses job lain, tunggu sampai selesai' });
      }

      const oreNeeded = qty * recipe.inputPerOutput;
      const available = state.oreInventory[oreType] || 0;
      if (available < oreNeeded) {
        return res.status(400).json({ error: `Ore ${oreType} tidak cukup. Butuh ${oreNeeded}, punya ${available}` });
      }

      state.oreInventory[oreType] = available - oreNeeded;

      const durationMs = recipe.durationSeconds * 1000 * qty; // durasi total = per-unit * jumlah
      const now = Date.now();
      state.refineryJob = {
        oreType, quantity: qty,
        startedAt: now,
        finishAt: now + durationMs,
      };

      await kvSet(stateKey, state);
      return res.status(200).json({ success: true, state });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // SELL-ORE — jual ore mentah langsung ke market, dapat Ore Coin.
  // Harga LEBIH RENDAH daripada jual ingot (lihat ORE_SELL_PRICE vs
  // INGOT_SELL_PRICE) — insentif desain supaya refine dulu lebih untung.
  // ══════════════════════════════════════
  if (action === 'sell-ore') {
    const { oreType, quantity } = req.body;

    const price = ORE_SELL_PRICE[oreType];
    if (price === undefined) return res.status(400).json({ error: 'Jenis ore tidak dikenali' });

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 1) return res.status(400).json({ error: 'Jumlah tidak valid' });

    try {
      let state = await loadOrMigrateState(stateKey);
      state = applyIdleProgress(state);
      state = applyRefineryProgress(state);

      const available = state.oreInventory[oreType] || 0;
      if (available < qty) return res.status(400).json({ error: `Ore ${oreType} tidak cukup. Punya ${available}` });

      state.oreInventory[oreType] = available - qty;
      await kvSet(stateKey, state);

      const earned = qty * price;
      const oreCoins = await kvGet(`orecoins:${memberId}`) || 0;
      const newOreCoins = oreCoins + earned;
      await kvSet(`orecoins:${memberId}`, newOreCoins);

      return res.status(200).json({ success: true, earned, oreCoins: newOreCoins, state });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // SELL-INGOT — jual ingot hasil refine ke market, dapat Ore Coin
  // (harga lebih tinggi dari ore mentah, lihat INGOT_SELL_PRICE).
  // ══════════════════════════════════════
  if (action === 'sell-ingot') {
    const { oreType, quantity } = req.body; // oreType dipakai sebagai key ingot juga (1:1 dengan REFINERY_RECIPES)

    const price = INGOT_SELL_PRICE[oreType];
    if (price === undefined) return res.status(400).json({ error: 'Jenis ingot tidak dikenali' });

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 1) return res.status(400).json({ error: 'Jumlah tidak valid' });

    try {
      let state = await loadOrMigrateState(stateKey);
      state = applyIdleProgress(state);
      state = applyRefineryProgress(state);

      const available = (state.ingotInventory && state.ingotInventory[oreType]) || 0;
      if (available < qty) return res.status(400).json({ error: `Ingot ${oreType} tidak cukup. Punya ${available}` });

      state.ingotInventory[oreType] = available - qty;
      await kvSet(stateKey, state);

      const earned = qty * price;
      const oreCoins = await kvGet(`orecoins:${memberId}`) || 0;
      const newOreCoins = oreCoins + earned;
      await kvSet(`orecoins:${memberId}`, newOreCoins);

      return res.status(200).json({ success: true, earned, oreCoins: newOreCoins, state });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // CRAFT-ASSET — craft satelit/roket/kendaraan untuk planet tertentu.
  // Urutan WAJIB: satellite → rocket (butuh satellite selesai) →
  // vehicle (butuh rocket selesai). Bahan dari ingotInventory, biaya
  // tambahan dalam Ore Coin.
  // ══════════════════════════════════════
  if (action === 'craft-asset') {
    const { planetId, assetType } = req.body; // assetType: 'satellite' | 'rocket' | 'vehicle'

    const planet = PLANETS[planetId];
    if (!planet) return res.status(400).json({ error: 'Planet tidak dikenali' });
    const assetDef = planet[assetType];
    if (!assetDef) return res.status(400).json({ error: 'Jenis aset tidak dikenali' });

    try {
      let state = await loadOrMigrateState(stateKey);
      state = applyIdleProgress(state);
      state = applyRefineryProgress(state);

      if (!state.spaceProgram[planetId]) {
        state.spaceProgram[planetId] = { satellite: false, rocket: false, vehicle: false, explored: 0 };
      }
      const progress = state.spaceProgram[planetId];

      if (progress[assetType]) {
        return res.status(409).json({ error: `${assetDef.name} sudah pernah di-craft` });
      }

      // Cek urutan wajib (rocket butuh satellite, vehicle butuh rocket).
      if (assetDef.requires && !progress[assetDef.requires]) {
        const requiredName = planet[assetDef.requires].name;
        return res.status(400).json({ error: `Craft ${requiredName} dulu sebelum ${assetDef.name}` });
      }

      // Cek semua bahan ingot cukup SEBELUM memotong apapun (all-or-nothing).
      for (const [ingotType, amountNeeded] of Object.entries(assetDef.cost)) {
        const available = (state.ingotInventory && state.ingotInventory[ingotType]) || 0;
        if (available < amountNeeded) {
          return res.status(400).json({ error: `${REFINERY_RECIPES[ingotType]?.ingotName || ingotType} tidak cukup. Butuh ${amountNeeded}, punya ${available}` });
        }
      }

      const oreCoins = await kvGet(`orecoins:${memberId}`) || 0;
      if (oreCoins < assetDef.oreCoinCost) {
        return res.status(400).json({ error: `Ore Coin tidak cukup. Butuh ${assetDef.oreCoinCost}, punya ${oreCoins}` });
      }

      // Semua syarat lolos — potong bahan & Ore Coin, tandai selesai.
      for (const [ingotType, amountNeeded] of Object.entries(assetDef.cost)) {
        state.ingotInventory[ingotType] -= amountNeeded;
      }
      const newOreCoins = oreCoins - assetDef.oreCoinCost;
      await kvSet(`orecoins:${memberId}`, newOreCoins);

      progress[assetType] = true;
      await kvSet(stateKey, state);

      return res.status(200).json({ success: true, oreCoinsLeft: newOreCoins, state });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // EXPLORE-PLANET — jalankan eksplorasi setelah satellite+rocket+vehicle
  // selesai di-craft. Reward acak dalam rentang exploreRewards planet itu.
  // Bisa diulang (progress.explored bertambah tiap kali, bukan cuma sekali)
  // sesuai tombol "Explore Again" di dokumen konsep.
  // ══════════════════════════════════════
  if (action === 'explore-planet') {
    const { planetId } = req.body;

    const planet = PLANETS[planetId];
    if (!planet) return res.status(400).json({ error: 'Planet tidak dikenali' });

    try {
      let state = await loadOrMigrateState(stateKey);
      state = applyIdleProgress(state);
      state = applyRefineryProgress(state);

      const progress = state.spaceProgram[planetId];
      if (!progress || !progress.satellite || !progress.rocket || !progress.vehicle) {
        return res.status(400).json({ error: 'Selesaikan satelit, roket, dan kendaraan dulu sebelum explore' });
      }

      const rewards = {};
      for (const [resName, range] of Object.entries(planet.exploreRewards)) {
        const amount = Math.floor(range.min + Math.random() * (range.max - range.min + 1));
        rewards[resName] = amount;
        if (!state.oreInventory) state.oreInventory = {};
        // Sumber daya hasil explore disimpan di oreInventory juga (namespace
        // sama, key beda) supaya tidak perlu bikin inventory ketiga.
        state.oreInventory[resName] = (state.oreInventory[resName] || 0) + amount;
      }

      progress.explored += 1;
      await kvSet(stateKey, state);

      return res.status(200).json({ success: true, rewards, state });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
}
