// api/shop.js — Sistem Shop I.O.E Hub
// Menangani: daftar item, tambah/hapus item (admin), beli item (member),
// daily check-in untuk dapat koin global.
//
// Koin global TERPISAH dari koin per-event — koin di sini berlaku untuk
// semua member di seluruh Hub, bukan khusus satu event.
//
// Storage (Upstash Redis, sama seperti auth.js):
//   shop:items          -> array semua item yang dijual { id, nama, harga, icon, deskripsi }
//   coins:{memberId}    -> jumlah koin global milik member (integer)
//   checkin:{memberId}  -> tanggal terakhir check-in (format YYYY-MM-DD), cegah klaim ganda per hari
//
// File ini menggantikan imgsearch.js yang sudah lama tidak berfungsi (fitur
// custom picture search, diduga bermasalah di sisi Google API key) — supaya
// jumlah serverless function tetap 12 (limit Vercel Hobby plan).

import crypto from 'crypto';

// ── Upstash Redis REST helper (pola sama seperti auth.js) ──
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

// Verifikasi akses admin — sama seperti auth.js: terima master key mentah
// ATAU session token superadmin hasil login di super-admin.html.
async function verifyAdminAccess(adminToken) {
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

// Verifikasi member: pastikan session valid, kembalikan account-nya
async function verifyMemberSession(memberId, sessionToken) {
  if (!memberId || !sessionToken) return null;
  const account = await kvGet(`account:${memberId}`);
  if (!account || account.currentSession !== sessionToken) return null;
  return account;
}

function generateItemId() {
  return 'item_' + crypto.randomBytes(8).toString('hex');
}

// Tanggal hari ini dalam format YYYY-MM-DD, dipakai untuk cek daily check-in
function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: 'Storage belum terhubung (KV_REST_API_URL/TOKEN tidak ditemukan)' });
  }

  const { action } = req.body;

  // ══════════════════════════════════════
  // LIST-ITEMS — Ambil semua item shop (dipanggil member & admin)
  // ══════════════════════════════════════
  if (action === 'list-items') {
    try {
      const items = await kvGet('shop:items') || [];
      return res.status(200).json({ items });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // ADD-ITEM — Admin tambah item baru ke shop
  // ══════════════════════════════════════
  if (action === 'add-item') {
    const { adminToken, nama, harga, icon, deskripsi } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });

    if (!nama || harga === undefined || harga === null) {
      return res.status(400).json({ error: 'nama dan harga wajib diisi' });
    }
    const hargaNum = Number(harga);
    if (!Number.isFinite(hargaNum) || hargaNum < 0) {
      return res.status(400).json({ error: 'harga harus berupa angka positif' });
    }

    try {
      const items = await kvGet('shop:items') || [];
      const newItem = {
        id: generateItemId(),
        nama: String(nama).slice(0, 100),
        harga: hargaNum,
        icon: icon || null,
        deskripsi: deskripsi ? String(deskripsi).slice(0, 500) : '',
        createdAt: Date.now(),
      };
      items.push(newItem);
      const saved = await kvSet('shop:items', items);
      if (!saved) return res.status(500).json({ error: 'Gagal menyimpan item' });

      return res.status(200).json({ success: true, item: newItem });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // REMOVE-ITEM — Admin hapus item dari shop
  // ══════════════════════════════════════
  if (action === 'remove-item') {
    const { adminToken, itemId } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });

    if (!itemId) return res.status(400).json({ error: 'itemId wajib diisi' });

    try {
      const items = await kvGet('shop:items') || [];
      const filtered = items.filter(it => it.id !== itemId);
      const saved = await kvSet('shop:items', filtered);
      if (!saved) return res.status(500).json({ error: 'Gagal menghapus item' });

      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // GET-BALANCE — Ambil saldo koin global member
  // ══════════════════════════════════════
  if (action === 'get-balance') {
    const { memberId, sessionToken } = req.body;

    const account = await verifyMemberSession(memberId, sessionToken);
    if (!account) return res.status(401).json({ error: 'Session tidak valid, silakan login ulang' });

    try {
      const coins = await kvGet(`coins:${memberId}`);
      return res.status(200).json({ coins: coins || 0 });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // DAILY-CHECKIN — Klaim koin harian (jumlah tetap, sekali per hari)
  // ══════════════════════════════════════
  if (action === 'daily-checkin') {
    const { memberId, sessionToken } = req.body;
    const DAILY_COIN_AMOUNT = 10; // jumlah tetap per hari, tanpa bonus streak

    const account = await verifyMemberSession(memberId, sessionToken);
    if (!account) return res.status(401).json({ error: 'Session tidak valid, silakan login ulang' });

    try {
      const today = todayDateString();
      const lastCheckin = await kvGet(`checkin:${memberId}`);

      if (lastCheckin === today) {
        const coins = await kvGet(`coins:${memberId}`) || 0;
        return res.status(400).json({ error: 'Sudah check-in hari ini, coba lagi besok', coins });
      }

      const currentCoins = await kvGet(`coins:${memberId}`) || 0;
      const newCoins = currentCoins + DAILY_COIN_AMOUNT;

      const savedCoins = await kvSet(`coins:${memberId}`, newCoins);
      const savedCheckin = await kvSet(`checkin:${memberId}`, today);
      if (!savedCoins || !savedCheckin) {
        return res.status(500).json({ error: 'Gagal menyimpan check-in' });
      }

      return res.status(200).json({ success: true, coinsEarned: DAILY_COIN_AMOUNT, coins: newCoins });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // BUY-ITEM — Member beli item pakai koin global
  // ══════════════════════════════════════
  if (action === 'buy-item') {
    const { memberId, sessionToken, itemId } = req.body;
    const MAX_STACK = 100;

    const account = await verifyMemberSession(memberId, sessionToken);
    if (!account) return res.status(401).json({ error: 'Session tidak valid, silakan login ulang' });

    if (!itemId) return res.status(400).json({ error: 'itemId wajib diisi' });

    try {
      const items = await kvGet('shop:items') || [];
      const item = items.find(it => it.id === itemId);
      if (!item) return res.status(404).json({ error: 'Item tidak ditemukan' });

      const backpack = await kvGet(`backpack:${memberId}`) || [];
      const existing = backpack.find(it => it.itemId === itemId);
      const currentQty = existing ? existing.quantity : 0;
      if (currentQty >= MAX_STACK) {
        return res.status(400).json({ error: `Item ini sudah mencapai batas maksimal ${MAX_STACK} di backpack` });
      }

      const currentCoins = await kvGet(`coins:${memberId}`) || 0;
      if (currentCoins < item.harga) {
        return res.status(400).json({ error: 'Koin tidak cukup', coins: currentCoins, needed: item.harga });
      }

      const newCoins = currentCoins - item.harga;
      const savedCoins = await kvSet(`coins:${memberId}`, newCoins);
      if (!savedCoins) return res.status(500).json({ error: 'Gagal memproses pembelian' });

      // Tambahkan item ke backpack — kalau sudah punya, tumpuk quantity-nya (max 100/jenis)
      if (existing) {
        existing.quantity = Math.min(existing.quantity + 1, MAX_STACK);
      } else {
        backpack.push({
          itemId: item.id,
          nama: item.nama,
          icon: item.icon,
          deskripsi: item.deskripsi,
          quantity: 1,
        });
      }
      const savedBackpack = await kvSet(`backpack:${memberId}`, backpack);
      if (!savedBackpack) {
        // Koin sudah terpotong tapi backpack gagal tersimpan — kembalikan koin
        // supaya member tidak rugi akibat kegagalan di tengah transaksi.
        await kvSet(`coins:${memberId}`, currentCoins);
        return res.status(500).json({ error: 'Gagal menyimpan item ke backpack, koin dikembalikan' });
      }

      return res.status(200).json({ success: true, item, coins: newCoins });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // GET-BACKPACK — Ambil isi backpack member (list item + quantity)
  // ══════════════════════════════════════
  if (action === 'get-backpack') {
    const { memberId, sessionToken } = req.body;

    const account = await verifyMemberSession(memberId, sessionToken);
    if (!account) return res.status(401).json({ error: 'Session tidak valid, silakan login ulang' });

    try {
      const backpack = await kvGet(`backpack:${memberId}`) || [];
      return res.status(200).json({ backpack });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Action tidak dikenali' });
}
