// api/tycoon.js — Ore Tycoon: sistem penambangan ore otomatis (idle/incremental).
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

// ── Upstash Redis REST helper (pola SAMA PERSIS seperti shop.js & auth.js —
//    pakai fetch ke REST API, BUKAN SDK @upstash/redis) ──
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvGet(key) {
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
async function kvSet(key, value) {
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
const MACHINE_TIERS = {
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

// Tiap level upgrade speed: +10% rate. Tiap level upgrade capacity: +20% kapasitas.
function effectiveRate(tier, speedLevel) {
  return MACHINE_TIERS[tier].oreRatePerHour * (1 + 0.10 * (speedLevel - 1));
}
function effectiveCapacity(tier, capacityLevel) {
  return Math.floor(MACHINE_TIERS[tier].baseCapacity * (1 + 0.20 * (capacityLevel - 1)));
}
function upgradeCost(tier, currentLevel) {
  // Biaya upgrade naik 50% tiap level dari harga dasar tier itu.
  return Math.floor(MACHINE_TIERS[tier].upgradeBaseCost * Math.pow(1.5, currentLevel - 1));
}

function defaultTycoonState() {
  return {
    machines: {
      1: { unlocked: true, speedLevel: 1, capacityLevel: 1, oreStored: 0, lastCollectAt: Date.now() },
    },
    oreInventory: {},
  };
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

// Verifikasi member login, pola SAMA PERSIS seperti shop.js.
async function verifyMemberSession(memberId, sessionToken) {
  if (!memberId || !sessionToken) return null;
  const account = await kvGet(`account:${memberId}`);
  if (!account || account.currentSession !== sessionToken) return null;
  return account;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, memberId, sessionToken } = req.body;

  const account = await verifyMemberSession(memberId, sessionToken);
  if (!account) return res.status(403).json({ error: 'Sesi tidak valid, silakan login ulang' });

  const stateKey = `tycoon:${memberId}`;

  // ══════════════════════════════════════
  // GET-STATE — ambil state tycoon, sekaligus proses idle progress
  // (dipanggil saat halaman tycoon.html dibuka)
  // ══════════════════════════════════════
  if (action === 'get-state') {
    try {
      let state = await kvGet(stateKey);
      if (!state) state = defaultTycoonState();
      state = applyIdleProgress(state);
      await kvSet(stateKey, state);

      return res.status(200).json({
        state,
        machineTiers: MACHINE_TIERS, // dikirim supaya frontend tahu nama, rate, kapasitas, biaya tanpa hardcode ulang
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
      let state = await kvGet(stateKey);
      if (!state) state = defaultTycoonState();
      state = applyIdleProgress(state);

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
  // UPGRADE-MACHINE — naikkan speedLevel atau capacityLevel pakai koin
  // (koin dari sistem shop yang sudah ada, key account:{memberId}.coins)
  // ══════════════════════════════════════
  if (action === 'upgrade-machine') {
    const { tier, upgradeType } = req.body; // upgradeType: "speed" | "capacity"

    if (!tier || !MACHINE_TIERS[tier]) return res.status(400).json({ error: 'Tier tidak valid' });
    if (upgradeType !== 'speed' && upgradeType !== 'capacity') {
      return res.status(400).json({ error: 'upgradeType harus "speed" atau "capacity"' });
    }

    try {
      let state = await kvGet(stateKey);
      if (!state) state = defaultTycoonState();
      state = applyIdleProgress(state);

      const m = state.machines[tier];
      if (!m || !m.unlocked) return res.status(400).json({ error: 'Mesin belum dimiliki' });

      const currentLevel = upgradeType === 'speed' ? m.speedLevel : m.capacityLevel;
      const cost = upgradeCost(tier, currentLevel);

      const coins = await kvGet(`coins:${memberId}`) || 0;
      if (coins < cost) return res.status(400).json({ error: `Koin tidak cukup. Butuh ${cost}, punya ${coins}` });

      const newCoins = coins - cost;
      await kvSet(`coins:${memberId}`, newCoins);

      if (upgradeType === 'speed') m.speedLevel += 1;
      else m.capacityLevel += 1;

      await kvSet(stateKey, state);
      return res.status(200).json({ success: true, newLevel: upgradeType === 'speed' ? m.speedLevel : m.capacityLevel, coinsLeft: newCoins, state });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // UNLOCK-MACHINE — beli mesin tier baru pakai koin
  // ══════════════════════════════════════
  if (action === 'unlock-machine') {
    const { tier } = req.body;

    if (!tier || !MACHINE_TIERS[tier]) return res.status(400).json({ error: 'Tier tidak valid' });

    try {
      let state = await kvGet(stateKey);
      if (!state) state = defaultTycoonState();
      state = applyIdleProgress(state);

      if (state.machines[tier]?.unlocked) {
        return res.status(409).json({ error: 'Mesin ini sudah dimiliki' });
      }

      // Wajib unlock berurutan: tier N butuh tier N-1 sudah unlocked.
      const prevTier = Number(tier) - 1;
      if (prevTier >= 1 && !state.machines[prevTier]?.unlocked) {
        return res.status(400).json({ error: `Unlock ${MACHINE_TIERS[prevTier].name} (Tier ${prevTier}) dulu` });
      }

      const cost = MACHINE_TIERS[tier].unlockCost;
      const coins = await kvGet(`coins:${memberId}`) || 0;
      if (coins < cost) return res.status(400).json({ error: `Koin tidak cukup. Butuh ${cost}, punya ${coins}` });

      const newCoins = coins - cost;
      await kvSet(`coins:${memberId}`, newCoins);

      state.machines[tier] = { unlocked: true, speedLevel: 1, capacityLevel: 1, oreStored: 0, lastCollectAt: Date.now() };
      await kvSet(stateKey, state);

      return res.status(200).json({ success: true, coinsLeft: newCoins, state });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Action tidak dikenali' });
}
