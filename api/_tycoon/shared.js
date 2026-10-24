// api/_tycoon/shared.js — helper KV, verifikasi sesi, dan konstanta/helper yang dipakai lebih dari satu modul.
// Dipindah dari api/tycoon.js TANPA perubahan logika. Hanya named export.

// ── Upstash Redis REST helper (pola SAMA PERSIS seperti shop.js & auth.js —
//    pakai fetch ke REST API, BUKAN SDK @upstash/redis) ──
export const KV_URL = process.env.KV_REST_API_URL;

export const KV_TOKEN = process.env.KV_REST_API_TOKEN;

export async function kvGet(key) {
  const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const data = await r.json();
  if (data.result === null || data.result === undefined) return null;
  let parsed;
  try { parsed = JSON.parse(data.result); } catch (e) { return data.result; }
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch (e) { /* biarkan sebagai string */ }
  }
  return parsed;
}

export async function kvSet(key, value) {
  const r = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  return r.ok;
}

// ══════════════════════════════════════
// DATA 10 TIER MESIN — dari dokumen game asli, disederhanakan.
// oreRatePerHour & capacity dipakai buat hitung idle progress.
// unlockCost dalam gold (dipakai action unlock-machine).
// ══════════════════════════════════════
export const MACHINE_TIERS = {
  1:  { name: 'Rotten Digger',        oreType: 'coal',       oreRatePerHour: 10,  baseCapacity: 100, unlockCost: 0,        upgradeBaseCost: 500 },
  2:  { name: 'Wooden Miner',         oreType: 'copper',     oreRatePerHour: 8,   baseCapacity: 80,  unlockCost: 1500,     upgradeBaseCost: 1500 },
  3:  { name: 'Iron Excavator',       oreType: 'iron',       oreRatePerHour: 6,   baseCapacity: 60,  unlockCost: 4000,     upgradeBaseCost: 4000 },
  4:  { name: 'Silver Driller',       oreType: 'silver',     oreRatePerHour: 4,   baseCapacity: 40,  unlockCost: 10000,    upgradeBaseCost: 10000 },
  5:  { name: 'Golden Extractor',     oreType: 'gold',       oreRatePerHour: 3,   baseCapacity: 30,  unlockCost: 25000,    upgradeBaseCost: 25000 },
  6:  { name: 'Platinum Quantum Miner', oreType: 'platinum', oreRatePerHour: 2,   baseCapacity: 20,  unlockCost: 60000,    upgradeBaseCost: 60000 },
  7:  { name: 'Crystal Harvester',    oreType: 'crystal',    oreRatePerHour: 1.5, baseCapacity: 15,  unlockCost: 150000,   upgradeBaseCost: 150000 },
  8:  { name: 'Mythril Forge',        oreType: 'mythril',    oreRatePerHour: 1,   baseCapacity: 10,  unlockCost: 500000,   upgradeBaseCost: 500000 },
  9:  { name: 'Uranium Reactor Miner', oreType: 'uranium',   oreRatePerHour: 0.5, baseCapacity: 5,   unlockCost: 1000000,  upgradeBaseCost: 1000000 },
  10: { name: 'Dark Matter Extractor', oreType: 'darkmatter', oreRatePerHour: 0.2, baseCapacity: 2,  unlockCost: 5000000,  upgradeBaseCost: 5000000 },
};

export function upgradeCost(tier, currentLevel) {
  // Biaya upgrade naik 50% tiap level dari harga dasar tier itu.
  return Math.floor(MACHINE_TIERS[tier].upgradeBaseCost * Math.pow(1.5, currentLevel - 1));
}

export const BIOMES = {
  meadow:    { name: 'Sunny Meadows',    angleStart: 0,   angleEnd: 72,  color: 0x7ccd7c },
  forest:    { name: 'Whispering Woods', angleStart: 72,  angleEnd: 144, color: 0x2e6b3e },
  coast:     { name: 'Crystal Coast',    angleStart: 144, angleEnd: 216, color: 0xe8d9a0 },
  snow:      { name: 'Frostbite Valley', angleStart: 216, angleEnd: 288, color: 0xe8f0f5 },
  highlands: { name: 'Ember Highlands',  angleStart: 288, angleEnd: 360, color: 0x8b5a3a },
};

// 5 tier shovel. Durability berkurang TIAP KALI gali (berhasil atau miss).
// Shovel tier 5 (Mythril) durability Infinity = tidak pernah habis.
export const SHOVEL_TIERS = {
  1: { name: 'Rotten Shovel',  maxDurability: 10,       canDigTier: ['common'] },
  2: { name: 'Wooden Shovel',  maxDurability: 30,       canDigTier: ['common', 'uncommon'] },
  3: { name: 'Iron Shovel',    maxDurability: 60,       canDigTier: ['common', 'uncommon', 'rare'] },
  4: { name: 'Golden Shovel',  maxDurability: 120,      canDigTier: ['common', 'uncommon', 'rare', 'legendary'] },
  5: { name: 'Mythril Shovel', maxDurability: Infinity, canDigTier: ['common', 'uncommon', 'rare', 'legendary', 'mythic'] },
};

// 18 tanaman liar. `harvestSellPrice` = harga jual HASIL PANEN (bukan
// biji mentah — biji tidak bisa dijual). growDays dipakai di Garden.
export const WILD_PLANTS = {
  sunbloom:      { name: 'Sunbloom',       tier: 'common',    biome: 'meadow',    growDays: 2.5, harvestSellPrice: 5 },
  dandelily:     { name: 'Dandelily',      tier: 'common',    biome: 'meadow',    growDays: 2,   harvestSellPrice: 3 },
  cloverleaf:    { name: 'Cloverleaf',     tier: 'common',    biome: 'meadow',    growDays: 2,   harvestSellPrice: 4 },
  glowroot:      { name: 'Glowroot',       tier: 'uncommon',  biome: 'forest',    growDays: 4.5, harvestSellPrice: 25 },
  moonpetal:     { name: 'Moonpetal',      tier: 'uncommon',  biome: 'forest',    growDays: 4,   harvestSellPrice: 25 },
  coralvine:     { name: 'Coralvine',      tier: 'uncommon',  biome: 'coast',     growDays: 4.5, harvestSellPrice: 25 },
  sandspike:     { name: 'Sandspike',      tier: 'uncommon',  biome: 'coast',     growDays: 5,   harvestSellPrice: 25 },
  stargrass:     { name: 'Stargrass',      tier: 'uncommon',  biome: 'meadow',    growDays: 4,   harvestSellPrice: 30 },
  whispervine:   { name: 'Whispervine',    tier: 'uncommon',  biome: 'forest',    growDays: 5,   harvestSellPrice: 30 },
  frostberry:    { name: 'Frostberry',     tier: 'rare',      biome: 'snow',      growDays: 6.5, harvestSellPrice: 100 },
  icetalon:      { name: 'Icetalon',       tier: 'rare',      biome: 'snow',      growDays: 7,   harvestSellPrice: 100 },
  emberbloom:    { name: 'Emberbloom',     tier: 'rare',      biome: 'highlands', growDays: 6.5, harvestSellPrice: 100 },
  lavabud:       { name: 'Lavabud',        tier: 'rare',      biome: 'highlands', growDays: 7,   harvestSellPrice: 100 },
  stormbell:     { name: 'Stormbell',      tier: 'legendary', biome: 'highlands', growDays: 9,   harvestSellPrice: 500 },
  moonshard:     { name: 'Moonshard',      tier: 'legendary', biome: 'snow',      growDays: 9.5, harvestSellPrice: 500 },
  sunkissedrose: { name: 'Sunkissed Rose', tier: 'legendary', biome: 'meadow',    growDays: 8.5, harvestSellPrice: 500 },
  abyssalcoral:  { name: 'Abyssal Coral',  tier: 'legendary', biome: 'coast',     growDays: 9.5, harvestSellPrice: 500 },
  mythicbloom:   { name: 'Mythic Bloom',   tier: 'mythic',    biome: 'meadow',    growDays: 13,  harvestSellPrice: 2500 }, // bisa muncul di bioma manapun sbg dig spot langka
};

// Daftar dig spot TETAP (bukan random posisi tiap load) supaya semua
// member lihat dig spot di titik yang sama di dunia, dan frontend bisa
// hardcode posisi 3D per ID tanpa perlu sinkron dari server.
// Dibuat proporsional: makin ke tier tinggi (jauh dari pusat / biome
// langka) makin sedikit dig spot, sesuai kelangkaan.
export function buildDigSpotLayout() {
  const layout = {}; // { spotId: { biome, plantPool: [plantId,...] } }
  for (const [biomeId, biome] of Object.entries(BIOMES)) {
    const plantsInBiome = Object.entries(WILD_PLANTS)
      .filter(([, p]) => p.biome === biomeId)
      .map(([id]) => id);
    // 6 dig spot tetap per bioma (total 30 dig spot di seluruh dunia) —
    // cukup untuk terasa "jalan-jalan cari" tanpa bikin scene berat.
    for (let i = 0; i < 6; i++) {
      layout[`${biomeId}_${i}`] = { biome: biomeId, plantPool: plantsInBiome };
    }
  }
  return layout;
}

export const DIG_SPOT_LAYOUT = buildDigSpotLayout();

export function defaultWildHarvestState() {
  const digSpots = {};
  for (const spotId of Object.keys(DIG_SPOT_LAYOUT)) {
    digSpots[spotId] = { plantId: null, diggableAt: null }; // plantId di-roll saat pertama kali di-get-state
  }
  return {
    shovelTier: 1,
    shovelDurability: SHOVEL_TIERS[1].maxDurability,
    digSpots,
    seedInventory: {}, // biji hasil gali, belum ditanam
  };
}

export function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export const WILT_AFTER_MATURE_DAYS = 2; // mature + 2 hari tanpa dipanen -> wilting (tetap bisa dipanen tapi kualitas turun, TBD nanti)

// 20 spesies (14 dari dokumen 3D-model-pet.txt + 6 variasi tambahan,
// sesuai keputusan user). `livestockYield` cuma diisi untuk hewan
// TERNAK (sapi/kambing/ayam/lebah) — hasil yang dipanen di kandang
// (Pet Barn) dan dijual dapat Animal Coin. Hewan pet/fantasy TIDAK
// punya field ini (cuma koleksi + happiness, sesuai keputusan user).
export const PETS = {
  chicken:       { name: 'Ayam',            tier: 'common',    biome: 'meadow',    color: 0xa0522d, sellPrice: 8,   livestockYield: { itemName: 'Telur', minutesPerYield: 30, sellPrice: 4 } },
  cow:           { name: 'Sapi',            tier: 'uncommon',  biome: 'meadow',    color: 0xf5f5f5, sellPrice: 40,  livestockYield: { itemName: 'Susu Sapi', minutesPerYield: 60, sellPrice: 12 } },
  goat:          { name: 'Kambing',         tier: 'common',    biome: 'highlands', color: 0xd2b48c, sellPrice: 10,  livestockYield: { itemName: 'Susu Kambing', minutesPerYield: 50, sellPrice: 9 } },
  goldfish:      { name: 'Ikan Mas',        tier: 'common',    biome: 'river',     color: 0xff8c00, sellPrice: 6 },
  cat:           { name: 'Kucing',          tier: 'uncommon',  biome: 'forest',    color: 0xe8d0a8, sellPrice: 30 },
  dog:           { name: 'Anjing',          tier: 'uncommon',  biome: 'meadow',    color: 0xd4a373, sellPrice: 35 },
  rabbit:        { name: 'Kelinci',         tier: 'common',    biome: 'meadow',    color: 0xf5f5f5, sellPrice: 12 },
  hamster:       { name: 'Hamster',         tier: 'common',    biome: 'forest',    color: 0xd2a679, sellPrice: 7 },
  dragon:        { name: 'Naga Kecil',      tier: 'legendary', biome: 'highlands', color: 0xdc143c, sellPrice: 500 },
  unicorn:       { name: 'Unicorn',         tier: 'legendary', biome: 'meadow',    color: 0xf5f5f5, sellPrice: 500 },
  firefox:       { name: 'Rubah Api',       tier: 'rare',      biome: 'highlands', color: 0xff4500, sellPrice: 100 },
  beetle:        { name: 'Kumbang Raksasa', tier: 'rare',      biome: 'forest',    color: 0x2f2f2f, sellPrice: 100 },
  icecat:        { name: 'Kucing Es',       tier: 'rare',      biome: 'snow',      color: 0x1e90ff, sellPrice: 100 },
  bee:           { name: 'Lebah',           tier: 'common',    biome: 'meadow',    color: 0xffd700, sellPrice: 6,   livestockYield: { itemName: 'Madu', minutesPerYield: 45, sellPrice: 10 } },
  chicken_white: { name: 'Ayam Putih',      tier: 'common',    biome: 'meadow',    color: 0xf5f5f5, sellPrice: 8,   livestockYield: { itemName: 'Telur', minutesPerYield: 30, sellPrice: 4 } },
  cow_brown:     { name: 'Sapi Coklat',     tier: 'uncommon',  biome: 'highlands', color: 0xd2b48c, sellPrice: 40,  livestockYield: { itemName: 'Susu Sapi', minutesPerYield: 60, sellPrice: 12 } },
  cat_black:     { name: 'Kucing Hitam',    tier: 'uncommon',  biome: 'snow',      color: 0x1a1a1a, sellPrice: 30 },
  rabbit_brown:  { name: 'Kelinci Coklat',  tier: 'common',    biome: 'forest',    color: 0x8b7355, sellPrice: 12 },
  dragon_ice:    { name: 'Naga Es',         tier: 'legendary', biome: 'snow',      color: 0x1e90ff, sellPrice: 500 },
  penguin:       { name: 'Pinguin',         tier: 'uncommon',  biome: 'snow',      color: 0x1a1a1a, sellPrice: 35 },
  sheep:         { name: 'Domba',           tier: 'uncommon',  biome: 'meadow',    color: 0xf0ead6, sellPrice: 25,  livestockYield: { itemName: 'Wol', minutesPerYield: 40, sellPrice: 8 } },
  octopus:       { name: 'Gurita',          tier: 'rare',      biome: 'coast',     color: 0xb84a8c, sellPrice: 120 },
  wasp:          { name: 'Tawon',           tier: 'rare',      biome: 'forest',    color: 0xf0c020, sellPrice: 110 },
};

// Level kandang — pola SAMA PERSIS GARDEN_LEVELS (harga naik per level,
// kapasitas bertambah). `pets` = slot untuk hewan darat biasa (ternak +
// pet + fantasy). Kolam ikan (`fishPondCapacity`) TERPISAH dari slot ini
// (sesuai keputusan: ikan punya "kandang" sendiri berupa kolam, bukan
// berbagi slot dengan hewan darat).
export const BARN_LEVELS = {
  1: { pets: 6,  fishPondCapacity: 3,  upgradeCost: 0 },
  2: { pets: 10, fishPondCapacity: 5,  upgradeCost: 800 },
  3: { pets: 16, fishPondCapacity: 8,  upgradeCost: 2500 },
  4: { pets: 24, fishPondCapacity: 12, upgradeCost: 6000 },
  5: { pets: 36, fishPondCapacity: 18, upgradeCost: 12000 },
};

export function defaultPetBarnState() {
  return {
    level: 1,
    pets: [],     // hewan darat: { instanceId, petId, happiness, lastFedAt, lastCleanedAt, lastYieldCollectedAt }
    fishPond: [], // ikan: struktur sama, tapi disimpan terpisah & dibatasi fishPondCapacity sendiri
  };
}

// Ambil state Pet Barn dari Redis DAN migrasi otomatis kalau formatnya
// dari versi lama (sebelum ada upgrade kandang & kolam ikan terpisah,
// waktu itu state cuma { pets: [...] } tanpa `level`/`fishPond`).
// SEMUA action Pet Barn wajib pakai fungsi ini (bukan kvGet langsung),
// supaya tidak ada lagi celah `.map()`/`.find()` di field yang belum
// ada pada state lama.
export async function loadBarnState(memberId) {
  let state = await kvGet(`petbarn:${memberId}`);
  if (!state) return defaultPetBarnState();
  if (!Array.isArray(state.fishPond)) state.fishPond = [];
  if (!state.level) state.level = 1;
  if (!Array.isArray(state.pets)) state.pets = [];

  // Migrasi tambahan: ikan (goldfish) yang KETERLANJUR tersimpan di
  // `pets` (ditangkap sebelum kolam ikan terpisah ada) dipindah ke
  // `fishPond` di sini, supaya tampil di slot kolam yang benar alih-alih
  // nyasar di slot kandang darat.
  const fishInPets = state.pets.filter(p => p.petId === 'goldfish');
  if (fishInPets.length > 0) {
    state.pets = state.pets.filter(p => p.petId !== 'goldfish');
    state.fishPond.push(...fishInPets);
  }

  return state;
}

// Verifikasi admin login, pola SAMA PERSIS seperti shop.js — dibutuhkan
// khusus untuk action 'grant-ore-coin' (giveaway Ore Coin superadmin),
// karena semua action lain di file ini untuk member biasa saja.
export async function verifyAdminAccess(adminToken) {
  if (!adminToken) return false;
  const ADMIN_KEY = process.env.ADMIN_MASTER_KEY;
  if (ADMIN_KEY && adminToken === ADMIN_KEY) return true;
  try {
    const session = await kvGet(`superadmin:${adminToken}`);
    return !!(session && session.active);
  } catch (e) {
    return false;
  }
}

// Verifikasi member login, pola SAMA PERSIS seperti shop.js.
export async function verifyMemberSession(memberId, sessionToken) {
  if (!memberId || !sessionToken) return null;
  const account = await kvGet(`account:${memberId}`);
  if (!account || account.currentSession !== sessionToken) return null;
  return account;
}
