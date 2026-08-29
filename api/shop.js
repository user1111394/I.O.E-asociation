// api/shop.js — Sistem Shop I.O.E Hub
// Menangani: daftar item, tambah/hapus item (admin), beli item (member),
// daily check-in untuk dapat koin global.
//
// Koin global TERPISAH dari koin per-event — koin di sini berlaku untuk
// semua member di seluruh Hub, bukan khusus satu event.
//
// Storage (Upstash Redis, sama seperti auth.js):
//   shop:items          -> array semua item yang dijual { id, nama, harga, icon, deskripsi, kategori }
//   coins:{memberId}    -> jumlah koin global milik member (integer)
//   checkin:{memberId}  -> tanggal terakhir check-in (format YYYY-MM-DD), cegah klaim ganda per hari
//   backpack:{memberId} -> array item yang dimiliki member { itemId, nama, icon, kategori, quantity }
//   account:{memberId}  -> data akun (auth.js), juga menyimpan equippedBorder /
//                          equippedBackground { itemId, nama, icon } kalau member
//                          sedang memakai item Func dari backpack-nya.
//
// kategori item (default 'save' kalau tidak diisi admin):
//   'save'            -> item koleksi biasa, disimpan di backpack, tidak ada efek.
//   'func-border'     -> bisa di-equip jadi border foto profil (akun.html).
//   'func-background' -> bisa di-equip jadi background foto profil (akun.html).
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

// kvSetNX — SET hanya kalau key BELUM ADA (atomik di sisi Redis, bukan
// cek-lalu-set dari kode kita yang rawan race condition). Dipakai sebagai
// lock untuk mencegah klaim ganda (redeem code, dsb) saat member spam
// klik: request pertama yang sampai ke Redis akan berhasil set, semua
// request lain yang menyusul (walau nyaris bersamaan) akan menerima false
// dari Redis sendiri, sebelum kita sempat menyentuh business logic apapun.
//
// PENTING: dipakai endpoint command generik Upstash (POST ke root URL
// dengan body array command RESP: ["SET", key, value, "NX"]), BUKAN
// endpoint path-style /set/{key}/{value}. Path-style tidak cocok untuk
// value JSON kompleks (karakter { } " : di path bisa salah diparse
// tergantung sisi Upstash) dan gagal SENYAP (fetch tetap sukses tapi
// hasilnya salah), sehingga request gagal dianggap "key sudah ada"
// walau sebenarnya belum pernah di-set — inilah yang menyebabkan member
// dapat error "sudah pernah klaim" padahal reward belum pernah cair.
async function kvSetNX(key, value) {
  try {
    const r = await fetch(KV_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['SET', key, JSON.stringify(value), 'NX']),
    });
    const data = await r.json();
    if (data.error) {
      console.error('kvSetNX Redis error:', data.error, 'key:', key);
      return false;
    }
    // Upstash mengembalikan { result: "OK" } kalau berhasil set, atau
    // { result: null } kalau key sudah ada (NX gagal karena sudah exists).
    return data.result === 'OK';
  } catch (e) {
    console.error('kvSetNX request gagal:', e.message, 'key:', key);
    return false;
  }
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

// Kode redeem format: IOE-XXXXXX (6 karakter alfanumerik huruf besar,
// menghindari karakter yang gampang tertukar seperti 0/O dan 1/I)
function generateRedeemCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[crypto.randomInt(chars.length)];
  }
  return 'IOE-' + code;
}

// Tanggal hari ini dalam format YYYY-MM-DD, dipakai untuk cek daily check-in
function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

// ══════════════════════════════════════════════════════
// Verifikasi link TikTok untuk quest 'submit-link' / 'like-video'.
//
// TikTok punya 2 bentuk URL:
//  - Link panjang: tiktok.com/@username/video/7123456789012345678
//    -> video ID ada persis di URL, bisa dicocokkan langsung.
//  - Short link: vt.tiktok.com/XXXXXXXXX/ atau vm.tiktok.com/XXXXXXXXX/
//    -> ID acak, TIDAK bisa dicocokkan tanpa resolve ke TikTok (butuh
//       network call keluar yang gampang diblokir/gagal di serverless
//       function). Kita TIDAK melakukan itu di sini.
//
// Keputusan produk: short link tidak auto-reject maupun auto-approve —
// ditandai 'pending' untuk admin cek manual. Supaya tidak menyusahkan
// member yang jujur (banyak yang cuma tahu cara share dapat short link),
// tapi tetap menutup celah orang asal tempel link acak untuk auto-lolos.
// ══════════════════════════════════════════════════════
function extractTikTokVideoId(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/);
  return match ? match[1] : null;
}

function isTikTokShortLink(url) {
  if (!url || typeof url !== 'string') return false;
  return /vt\.tiktok\.com|vm\.tiktok\.com/.test(url);
}

// Hasil: 'approved' | 'pending' | 'rejected'
function verifyTikTokSubmission(sourceLink, submittedLink) {
  if (!submittedLink) return 'rejected';
  if (isTikTokShortLink(submittedLink)) return 'pending';

  const sourceId = extractTikTokVideoId(sourceLink);
  const submittedId = extractTikTokVideoId(submittedLink);
  if (!sourceId || !submittedId) return 'pending'; // format tak dikenali, biar admin yang lihat manual
  return sourceId === submittedId ? 'approved' : 'rejected';
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

      // Terapkan reset stok harian di sini juga (bukan cuma saat beli),
      // supaya angka stok yang ditampilkan ke member selalu akurat begitu
      // tanggal berganti, tanpa harus menunggu ada yang beli duluan.
      const today = todayDateString();
      let changed = false;
      items.forEach(item => {
        if (item.stokType === 'daily' && item.stokLastReset !== today) {
          item.stokSisa = item.stokJumlah;
          item.stokLastReset = today;
          changed = true;
        }
      });
      if (changed) await kvSet('shop:items', items);

      return res.status(200).json({ items });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // ADD-ITEM — Admin tambah item baru ke shop
  // ══════════════════════════════════════
  if (action === 'add-item') {
    const { adminToken, nama, harga, icon, deskripsi, koinType, eventId, stokType, stokJumlah, kategori } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });

    if (!nama || harga === undefined || harga === null) {
      return res.status(400).json({ error: 'nama dan harga wajib diisi' });
    }
    const hargaNum = Number(harga);
    if (!Number.isFinite(hargaNum) || hargaNum < 0) {
      return res.status(400).json({ error: 'harga harus berupa angka positif' });
    }

    // kategori menentukan fungsi item ini setelah masuk backpack member:
    //  - 'save'            : item koleksi biasa, tidak punya efek apa pun,
    //                        cuma disimpan di backpack (perilaku lama/default).
    //  - 'func-border'     : bisa di-equip member sebagai border foto profil
    //                        di akun.html (pakai gambar 'icon' item ini).
    //  - 'func-background' : bisa di-equip member sebagai background foto
    //                        profil di akun.html (pakai gambar 'icon' item ini).
    const finalKategori = ['func-border', 'func-background'].includes(kategori) ? kategori : 'save';

    // koinType: 'global' (default) atau 'event'. Item bertipe 'event' wajib
    // punya eventId — item ini hanya bisa dibeli pakai koin event tersebut,
    // terpisah total dari katalog item global.
    const finalKoinType = koinType === 'event' ? 'event' : 'global';
    if (finalKoinType === 'event' && !eventId) {
      return res.status(400).json({ error: 'eventId wajib diisi untuk item bertipe koin event' });
    }

    // stokType: 'unlimited' (default), 'daily' (stok GLOBAL gabungan semua
    // member, restock otomatis tiap hari ke stokJumlah), 'onetime' (stok
    // GLOBAL gabungan, jumlah tetap, habis = habis selamanya, hanya bisa
    // ditambah manual oleh superadmin lewat restock-item), atau 'peraccount'
    // (limit PER MEMBER individual, max stokJumlah kali seumur hidup per
    // akun, tidak pernah reset, tidak terpengaruh pembelian member lain).
    const finalStokType = ['daily', 'onetime', 'peraccount'].includes(stokType) ? stokType : 'unlimited';
    let stokJumlahNum = null;
    if (finalStokType !== 'unlimited') {
      stokJumlahNum = Number(stokJumlah);
      if (!Number.isFinite(stokJumlahNum) || stokJumlahNum < 1) {
        return res.status(400).json({ error: 'stokJumlah wajib diisi angka lebih dari 0 untuk tipe stok yang dipilih' });
      }
    }

    try {
      const items = await kvGet('shop:items') || [];
      const newItem = {
        id: generateItemId(),
        nama: String(nama).slice(0, 100),
        harga: hargaNum,
        icon: icon || null,
        deskripsi: deskripsi ? String(deskripsi).slice(0, 500) : '',
        kategori: finalKategori,
        koinType: finalKoinType,
        eventId: finalKoinType === 'event' ? eventId : null,
        stokType: finalStokType,
        stokJumlah: stokJumlahNum,
        // stokSisa hanya relevan untuk stok GLOBAL (daily/onetime).
        // Untuk 'peraccount', pembelian per member dilacak terpisah di
        // key purchasecount:{itemId}:{memberId}, bukan di sini.
        stokSisa: (finalStokType === 'daily' || finalStokType === 'onetime') ? stokJumlahNum : null,
        stokLastReset: finalStokType === 'daily' ? todayDateString() : null,
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

      // Cek & (kalau perlu) reset stok harian sebelum validasi ketersediaan.
      // Tipe 'unlimited' selalu lolos. Tipe 'daily' (stok global) di-reset
      // otomatis ke stokJumlah penuh setiap kali tanggal berganti. Tipe
      // 'onetime' (stok global) tidak pernah direset otomatis — hanya
      // berkurang, dan hanya bisa ditambah manual lewat action restock-item.
      // Tipe 'peraccount' TIDAK memakai stokSisa sama sekali — validasinya
      // dicek terpisah di bawah, berdasarkan riwayat pembelian member ini saja.
      if (item.stokType === 'daily') {
        const today = todayDateString();
        if (item.stokLastReset !== today) {
          item.stokSisa = item.stokJumlah;
          item.stokLastReset = today;
        }
      }
      if ((item.stokType === 'daily' || item.stokType === 'onetime') && item.stokSisa <= 0) {
        return res.status(400).json({ error: 'Stok item ini sedang habis' });
      }

      // Untuk tipe 'peraccount': cek berapa kali member INI sudah pernah
      // membeli item ini seumur hidup — tidak pernah reset, tidak terpengaruh
      // pembelian member lain. Disimpan di key terpisah dari stok global.
      const purchaseCountKey = `purchasecount:${itemId}:${memberId}`;
      let currentPurchaseCount = 0;
      if (item.stokType === 'peraccount') {
        currentPurchaseCount = await kvGet(purchaseCountKey) || 0;
        if (currentPurchaseCount >= item.stokJumlah) {
          return res.status(400).json({ error: `Kamu sudah mencapai batas pembelian item ini (maks ${item.stokJumlah}x)` });
        }
      }

      const backpack = await kvGet(`backpack:${memberId}`) || [];
      const existing = backpack.find(it => it.itemId === itemId);
      const currentQty = existing ? existing.quantity : 0;
      if (currentQty >= MAX_STACK) {
        return res.status(400).json({ error: `Item ini sudah mencapai batas maksimal ${MAX_STACK} di backpack` });
      }

      // Tentukan dompet koin yang dipakai: item bertipe 'event' motong saldo
      // koin event tertentu (eventcoin:{eventId}:{memberId}), item 'global'
      // (default) motong saldo koin global (coins:{memberId}).
      const isEventItem = item.koinType === 'event';
      const coinKey = isEventItem ? `eventcoin:${item.eventId}:${memberId}` : `coins:${memberId}`;

      const currentCoins = await kvGet(coinKey) || 0;
      if (currentCoins < item.harga) {
        return res.status(400).json({ error: 'Koin tidak cukup', coins: currentCoins, needed: item.harga });
      }

      const newCoins = currentCoins - item.harga;
      const savedCoins = await kvSet(coinKey, newCoins);
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
          kategori: item.kategori || 'save',
          quantity: 1,
        });
      }
      const savedBackpack = await kvSet(`backpack:${memberId}`, backpack);
      if (!savedBackpack) {
        // Koin sudah terpotong tapi backpack gagal tersimpan — kembalikan koin
        // supaya member tidak rugi akibat kegagalan di tengah transaksi.
        await kvSet(coinKey, currentCoins);
        return res.status(500).json({ error: 'Gagal menyimpan item ke backpack, koin dikembalikan' });
      }

      // Kurangi stok setelah semua langkah di atas berhasil (tidak boleh
      // gagal setelah koin & backpack sudah ter-commit). Global (daily/onetime)
      // mengurangi stokSisa bersama; peraccount menaikkan hitungan khusus
      // member ini saja, tidak menyentuh data item global sama sekali.
      if (item.stokType === 'daily' || item.stokType === 'onetime') {
        item.stokSisa -= 1;
        await kvSet('shop:items', items);
      } else if (item.stokType === 'peraccount') {
        await kvSet(purchaseCountKey, currentPurchaseCount + 1);
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
      const acc = await kvGet(`account:${memberId}`) || {};
      return res.status(200).json({
        backpack,
        equippedBorder: acc.equippedBorder || null,
        equippedBackground: acc.equippedBackground || null,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // EQUIP-ITEM — Member pakai item Func (border/background) dari backpack
  // ke akun mereka. Disimpan di account:{memberId} sebagai
  // equippedBorder / equippedBackground (berisi URL gambar item, atau null).
  // ══════════════════════════════════════
  if (action === 'equip-item') {
    const { memberId, sessionToken, itemId } = req.body;

    const account = await verifyMemberSession(memberId, sessionToken);
    if (!account) return res.status(401).json({ error: 'Session tidak valid, silakan login ulang' });

    if (!itemId) return res.status(400).json({ error: 'itemId wajib diisi' });

    try {
      const backpack = await kvGet(`backpack:${memberId}`) || [];
      const owned = backpack.find(it => it.itemId === itemId);
      if (!owned) return res.status(404).json({ error: 'Item ini tidak ada di backpack kamu' });

      if (owned.kategori !== 'func-border' && owned.kategori !== 'func-background') {
        return res.status(400).json({ error: 'Item ini bukan item Func, tidak bisa dipakai (equip)' });
      }

      const slot = owned.kategori === 'func-border' ? 'equippedBorder' : 'equippedBackground';
      const acc = await kvGet(`account:${memberId}`);
      if (!acc) return res.status(404).json({ error: 'Akun tidak ditemukan' });

      acc[slot] = { itemId: owned.itemId, nama: owned.nama, icon: owned.icon };
      const saved = await kvSet(`account:${memberId}`, acc);
      if (!saved) return res.status(500).json({ error: 'Gagal menyimpan perubahan equip' });

      return res.status(200).json({ success: true, slot, equipped: acc[slot] });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // UNEQUIP-ITEM — Member lepas item Func (border/background) yang lagi dipakai
  // ══════════════════════════════════════
  if (action === 'unequip-item') {
    const { memberId, sessionToken, slot } = req.body;

    const account = await verifyMemberSession(memberId, sessionToken);
    if (!account) return res.status(401).json({ error: 'Session tidak valid, silakan login ulang' });

    if (slot !== 'equippedBorder' && slot !== 'equippedBackground') {
      return res.status(400).json({ error: 'slot harus equippedBorder atau equippedBackground' });
    }

    try {
      const acc = await kvGet(`account:${memberId}`);
      if (!acc) return res.status(404).json({ error: 'Akun tidak ditemukan' });

      acc[slot] = null;
      const saved = await kvSet(`account:${memberId}`, acc);
      if (!saved) return res.status(500).json({ error: 'Gagal menyimpan perubahan' });

      return res.status(200).json({ success: true, slot });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // GRANT-EVENT-COIN — Admin kasih koin event ke member tertentu (manual)
  // Koin event TERPISAH dari koin global — key: eventcoin:{eventId}:{memberId}
  // ══════════════════════════════════════
  if (action === 'grant-event-coin') {
    const { adminToken, eventId, memberId, amount } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });

    if (!eventId || !memberId) {
      return res.status(400).json({ error: 'eventId dan memberId wajib diisi' });
    }
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum < 1) {
      return res.status(400).json({ error: 'amount harus berupa angka lebih dari 0' });
    }

    try {
      const key = `eventcoin:${eventId}:${memberId}`;
      const current = await kvGet(key) || 0;
      const newAmount = current + amountNum;
      const saved = await kvSet(key, newAmount);
      if (!saved) return res.status(500).json({ error: 'Gagal menyimpan koin event' });

      return res.status(200).json({ success: true, coins: newAmount });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // CLAIM-QUEST — Member klaim reward quest event. Tipe quest dibedakan:
  //   - visit, make-video, invite-friend, login-streak -> auto-approve
  //     (tidak ada yang bisa diverifikasi otomatis secara ketat, sifatnya
  //     "self-report", dianggap wajar untuk tindakan yang memang tidak
  //     menghasilkan bukti terlacak)
  //   - submit-link -> dicek via verifyTikTokSubmission(); approved/
  //     pending/rejected tergantung apakah video ID bisa dicocokkan
  //   - like-video -> SELALU pending (screenshot tidak bisa diverifikasi
  //     otomatis oleh sistem ini) sampai admin approve manual
  //
  // Storage:
  //   questclaimed:{eventId}:{questId}:{memberId} -> 'approved' | 'pending'
  //     (rejected TIDAK disimpan sebagai status permanen — supaya member
  //     bisa coba klaim ulang dengan link yang benar)
  //   questreview:{eventId}:{questId}:{memberId}  -> detail submission
  //     (dilihat admin saat approve/reject manual quest yang pending)
  //   queststreak:{eventId}:{questId}:{memberId}  -> { lastDate, count }
  //     (tracking harian untuk quest tipe login-streak)
  //
  // Koin CUMA ditambahkan saat status jadi 'approved' (langsung di sini
  // untuk tipe auto-approve, atau lewat approve-pending-quest untuk yang
  // tadinya pending).
  // ══════════════════════════════════════
  if (action === 'claim-quest') {
    const { memberId, sessionToken, eventId, questId, rewardCoin, questType, submittedLink, sourceLink, proofImageUrl } = req.body;

    const account = await verifyMemberSession(memberId, sessionToken);
    if (!account) return res.status(403).json({ error: 'Sesi tidak valid, silakan login ulang' });

    if (!eventId || !questId) {
      return res.status(400).json({ error: 'eventId dan questId wajib diisi' });
    }

    // rewardCoin dikirim dari client (dibaca dari data quest di Firebase),
    // divalidasi wajar di sini (1-100000) untuk mencegah nilai aneh lolos.
    const rewardNum = Number(rewardCoin);
    if (!Number.isFinite(rewardNum) || rewardNum < 1 || rewardNum > 100000) {
      return res.status(400).json({ error: 'rewardCoin tidak valid' });
    }

    const type = questType || 'visit';

    try {
      const claimKey = `questclaimed:${eventId}:${questId}:${memberId}`;

      // Sama seperti claim-redeem-code: kunci klaim ATOMIK di awal, sebelum
      // verifikasi & pemberian reward apapun. Mencegah member yang spam
      // klik tombol klaim lolos beberapa kali sekaligus sebelum status
      // claimed sempat tersimpan (race condition / duplikasi reward).
      const lockAcquired = await kvSetNX(claimKey, 'processing');
      if (!lockAcquired) {
        const existingStatus = await kvGet(claimKey);
        return res.status(409).json({ error: existingStatus === 'pending' ? 'Klaim ini masih menunggu review admin' : 'Quest ini sudah pernah diklaim', status: existingStatus });
      }

      let status = 'approved'; // default untuk tipe auto-approve

      if (type === 'submit-link') {
        if (!submittedLink) {
          await kvSet(claimKey, false); // rollback lock
          return res.status(400).json({ error: 'Link video wajib diisi' });
        }
        status = verifyTikTokSubmission(sourceLink, submittedLink);
        if (status === 'rejected') {
          await kvSet(claimKey, false); // rollback lock, boleh coba link lain
          return res.status(400).json({ error: 'Link tidak mengarah ke video yang sama dengan video sumber' });
        }
      } else if (type === 'like-video') {
        if (!proofImageUrl) {
          await kvSet(claimKey, false); // rollback lock
          return res.status(400).json({ error: 'Screenshot bukti wajib diupload' });
        }
        status = 'pending';
      }

      // Simpan bukti submission untuk dilihat admin, kalau statusnya pending.
      // Sekaligus daftarkan memberId & questId ke index supaya
      // list-pending-quests bisa menemukannya tanpa perlu scan seluruh
      // keyspace Redis (REST API Upstash yang dipakai di sini tidak
      // menyediakan SCAN sederhana lewat helper kvGet/kvSet yang ada).
      if (status === 'pending') {
        await kvSet(`questreview:${eventId}:${questId}:${memberId}`, {
          memberId, questId, submittedLink: submittedLink || '', proofImageUrl: proofImageUrl || '', submittedAt: Date.now(),
        });

        const indexKey = `questreviewindex:${eventId}`;
        const memberIds = await kvGet(indexKey) || [];
        if (!memberIds.includes(memberId)) {
          memberIds.push(memberId);
          await kvSet(indexKey, memberIds);
        }

        const memberKeysKey = `questreviewkeys:${eventId}:${memberId}`;
        const questKeys = await kvGet(memberKeysKey) || [];
        if (!questKeys.includes(questId)) {
          questKeys.push(questId);
          await kvSet(memberKeysKey, questKeys);
        }
      }

      // Lock sudah diambil di awal ('processing') — sekarang finalisasi
      // jadi status hasil akhir yang sebenarnya.
      const marked = await kvSet(claimKey, status);
      if (!marked) return res.status(500).json({ error: 'Gagal mencatat klaim' });

      if (status === 'pending') {
        return res.status(200).json({ success: true, status: 'pending' });
      }

      // status === 'approved' -> langsung cairkan koin
      const coinKey = `eventcoin:${eventId}:${memberId}`;
      const current = await kvGet(coinKey) || 0;
      const newAmount = current + rewardNum;
      const saved = await kvSet(coinKey, newAmount);
      if (!saved) return res.status(500).json({ error: 'Gagal menambah koin event' });

      return res.status(200).json({ success: true, status: 'approved', coins: newAmount, rewardClaimed: rewardNum });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // CHECK-QUEST-CLAIMED — Member cek status quest mana saja yang sudah
  // diklaim (dipanggil saat event.html pertama kali render). Nilai per
  // questId sekarang string 'approved' | 'pending' (dulu boolean true/false)
  // supaya event.html bisa menampilkan tombol "Selesai" vs "Menunggu" beda.
  // Quest yang belum diklaim sama sekali tidak muncul di object claimed
  // (event.html menganggap absen = belum diklaim).
  // ══════════════════════════════════════
  if (action === 'check-quest-claimed') {
    const { memberId, sessionToken, eventId, questIds } = req.body;

    const account = await verifyMemberSession(memberId, sessionToken);
    if (!account) return res.status(403).json({ error: 'Sesi tidak valid, silakan login ulang' });

    if (!eventId || !Array.isArray(questIds)) {
      return res.status(400).json({ error: 'eventId dan questIds (array) wajib diisi' });
    }

    try {
      const claimed = {};
      for (const qId of questIds) {
        const key = `questclaimed:${eventId}:${qId}:${memberId}`;
        const status = await kvGet(key);
        // 'processing' adalah status transisi internal (lock sedang
        // diproses request lain saat ini juga) — jangan ditampilkan ke
        // client sebagai status quest yang valid, treat sebagai belum
        // diklaim supaya tombol tidak nyangkut di kondisi aneh.
        if (status && status !== 'processing') claimed[qId] = status;
      }
      return res.status(200).json({ claimed });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // LIST-PENDING-QUESTS — Admin ambil semua klaim quest berstatus pending
  // untuk satu event, buat ditampilkan di tab Review.
  // ══════════════════════════════════════
  if (action === 'list-pending-quests') {
    const { adminToken, eventId } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });
    if (!eventId) return res.status(400).json({ error: 'eventId wajib diisi' });

    try {
      // Redis REST API tidak expose SCAN dengan pattern secara sederhana lewat
      // helper kvGet/kvSet yang ada, jadi kita simpan daftar member yang punya
      // review pending per event di key terpisah supaya tetap bisa dicari
      // tanpa scan seluruh keyspace.
      const indexKey = `questreviewindex:${eventId}`;
      const memberIds = await kvGet(indexKey) || [];

      const pending = [];
      for (const memberId of memberIds) {
        // Cek semua quest untuk member ini di event ini
        const keys = await kvGet(`questreviewkeys:${eventId}:${memberId}`) || [];
        for (const questId of keys) {
          const status = await kvGet(`questclaimed:${eventId}:${questId}:${memberId}`);
          if (status !== 'pending') continue;
          const detail = await kvGet(`questreview:${eventId}:${questId}:${memberId}`);
          if (detail) pending.push(detail);
        }
      }

      return res.status(200).json({ pending });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // APPROVE-PENDING-QUEST — Admin setujui klaim pending: ubah status jadi
  // approved dan cairkan koinnya. rewardCoin dibaca dari Firebase di sisi
  // client (nav.js) lalu dikirim di sini karena shop.js tidak mengakses
  // Firebase (event disimpan di Firebase, koin & status disimpan di Redis).
  // ══════════════════════════════════════
  if (action === 'approve-pending-quest') {
    const { adminToken, eventId, questId, memberId, rewardCoin } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });
    if (!eventId || !questId || !memberId) {
      return res.status(400).json({ error: 'eventId, questId, dan memberId wajib diisi' });
    }

    try {
      const claimKey = `questclaimed:${eventId}:${questId}:${memberId}`;
      const status = await kvGet(claimKey);
      if (status !== 'pending') {
        return res.status(409).json({ error: 'Klaim ini tidak sedang menunggu review' });
      }

      const rewardNum = Number(rewardCoin) || 0;
      await kvSet(claimKey, 'approved');

      if (rewardNum > 0) {
        const coinKey = `eventcoin:${eventId}:${memberId}`;
        const current = await kvGet(coinKey) || 0;
        await kvSet(coinKey, current + rewardNum);
      }

      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // REJECT-PENDING-QUEST — Admin tolak klaim pending: hapus status supaya
  // member bisa coba klaim ulang (misal kirim screenshot/link yang benar).
  // ══════════════════════════════════════
  if (action === 'reject-pending-quest') {
    const { adminToken, eventId, questId, memberId } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });
    if (!eventId || !questId || !memberId) {
      return res.status(400).json({ error: 'eventId, questId, dan memberId wajib diisi' });
    }

    try {
      const claimKey = `questclaimed:${eventId}:${questId}:${memberId}`;
      const status = await kvGet(claimKey);
      if (status !== 'pending') {
        return res.status(409).json({ error: 'Klaim ini tidak sedang menunggu review' });
      }

      // Hapus status klaim (set null lewat kvSet karena tidak ada kvDelete
      // helper) — Redis REST /set dengan value null akan disimpan sebagai
      // string "null", jadi kita pakai flag false alih-alih benar-benar
      // menghapus key. check-quest-claimed sudah menganggap falsy = absen.
      await kvSet(claimKey, false);
      await kvSet(`questreview:${eventId}:${questId}:${memberId}`, null);

      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // CHECK-EVENT-COIN — Admin cek saldo koin event milik member tertentu
  // ══════════════════════════════════════
  if (action === 'check-event-coin') {
    const { adminToken, eventId, memberId } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });

    if (!eventId || !memberId) {
      return res.status(400).json({ error: 'eventId dan memberId wajib diisi' });
    }

    try {
      const coins = await kvGet(`eventcoin:${eventId}:${memberId}`) || 0;
      return res.status(200).json({ coins });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // GET-EVENT-BALANCE — Member ambil saldo koin event miliknya sendiri
  // ══════════════════════════════════════
  if (action === 'get-event-balance') {
    const { memberId, sessionToken, eventId } = req.body;

    const account = await verifyMemberSession(memberId, sessionToken);
    if (!account) return res.status(401).json({ error: 'Session tidak valid, silakan login ulang' });

    if (!eventId) return res.status(400).json({ error: 'eventId wajib diisi' });

    try {
      const coins = await kvGet(`eventcoin:${eventId}:${memberId}`) || 0;
      return res.status(200).json({ coins });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // RESTOCK-ITEM — Admin tambah stok manual (khusus item tipe 'onetime',
  // karena tipe 'daily' sudah reset otomatis dan 'unlimited' tidak butuh stok)
  // ══════════════════════════════════════
  if (action === 'restock-item') {
    const { adminToken, itemId, tambahan } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });

    if (!itemId) return res.status(400).json({ error: 'itemId wajib diisi' });
    const tambahanNum = Number(tambahan);
    if (!Number.isFinite(tambahanNum) || tambahanNum < 1) {
      return res.status(400).json({ error: 'tambahan harus berupa angka lebih dari 0' });
    }

    try {
      const items = await kvGet('shop:items') || [];
      const item = items.find(it => it.id === itemId);
      if (!item) return res.status(404).json({ error: 'Item tidak ditemukan' });
      if (item.stokType !== 'onetime') {
        return res.status(400).json({ error: 'Restock manual hanya berlaku untuk item bertipe stok Sekali (Global)' });
      }

      item.stokSisa = (item.stokSisa || 0) + tambahanNum;
      item.stokJumlah = (item.stokJumlah || 0) + tambahanNum; // kapasitas dasar ikut naik juga
      const saved = await kvSet('shop:items', items);
      if (!saved) return res.status(500).json({ error: 'Gagal restock item' });

      return res.status(200).json({ success: true, item });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // GET-PURCHASE-COUNT — Member cek berapa kali dia sudah beli item
  // bertipe 'peraccount' tertentu (untuk ditampilkan di UI shop.html)
  // ══════════════════════════════════════
  if (action === 'get-purchase-count') {
    const { memberId, sessionToken, itemId } = req.body;

    const account = await verifyMemberSession(memberId, sessionToken);
    if (!account) return res.status(401).json({ error: 'Session tidak valid, silakan login ulang' });

    if (!itemId) return res.status(400).json({ error: 'itemId wajib diisi' });

    try {
      const count = await kvGet(`purchasecount:${itemId}:${memberId}`) || 0;
      return res.status(200).json({ count });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // CREATE-REDEEM-CODE — Admin bikin kode redeem baru dengan reward fleksibel
  // (bisa koin global, koin event, dan/atau 1 item — admin pilih sesuai kebutuhan)
  // ══════════════════════════════════════
  if (action === 'create-redeem-code') {
    const { adminToken, rewardKoinGlobal, rewardKoinEvent, rewardEventId, rewardItemId } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });

    const koinGlobalNum = rewardKoinGlobal ? Number(rewardKoinGlobal) : 0;
    const koinEventNum = rewardKoinEvent ? Number(rewardKoinEvent) : 0;

    if (koinEventNum > 0 && !rewardEventId) {
      return res.status(400).json({ error: 'rewardEventId wajib diisi kalau ada reward koin event' });
    }
    if (koinGlobalNum <= 0 && koinEventNum <= 0 && !rewardItemId) {
      return res.status(400).json({ error: 'Kode redeem harus punya minimal 1 jenis reward (koin global, koin event, atau item)' });
    }

    try {
      // Pastikan kode yang di-generate belum pernah dipakai (walau sangat jarang bentrok)
      let code, existing;
      do {
        code = generateRedeemCode();
        existing = await kvGet(`redeem:${code}`);
      } while (existing);

      const redeemData = {
        code,
        rewardKoinGlobal: koinGlobalNum > 0 ? koinGlobalNum : 0,
        rewardKoinEvent: koinEventNum > 0 ? koinEventNum : 0,
        rewardEventId: koinEventNum > 0 ? rewardEventId : null,
        rewardItemId: rewardItemId || null,
        active: true,
        createdAt: Date.now(),
      };

      const saved = await kvSet(`redeem:${code}`, redeemData);
      if (!saved) return res.status(500).json({ error: 'Gagal menyimpan kode redeem' });

      // Catat juga di daftar kode (untuk ditampilkan di panel admin)
      const allCodes = await kvGet('redeem:list') || [];
      allCodes.push(code);
      await kvSet('redeem:list', allCodes);

      return res.status(200).json({ success: true, redeem: redeemData });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // LIST-REDEEM-CODES — Admin lihat semua kode redeem yang pernah dibuat
  // ══════════════════════════════════════
  if (action === 'list-redeem-codes') {
    const { adminToken } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });

    try {
      const codeList = await kvGet('redeem:list') || [];
      const codes = await Promise.all(codeList.map(code => kvGet(`redeem:${code}`)));
      return res.status(200).json({ codes: codes.filter(Boolean) });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // DELETE-REDEEM-CODE — Admin nonaktifkan kode (soft-disable, bukan hapus
  // total, supaya riwayat kode yang pernah dibuat tetap terlihat di panel)
  // ══════════════════════════════════════
  if (action === 'delete-redeem-code') {
    const { adminToken, code } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });

    if (!code) return res.status(400).json({ error: 'code wajib diisi' });

    try {
      const redeemData = await kvGet(`redeem:${code}`);
      if (!redeemData) return res.status(404).json({ error: 'Kode redeem tidak ditemukan' });

      redeemData.active = false;
      const saved = await kvSet(`redeem:${code}`, redeemData);
      if (!saved) return res.status(500).json({ error: 'Gagal menonaktifkan kode' });

      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // CLAIM-REDEEM-CODE — Member klaim kode redeem. Semua reward diberikan
  // ALL-OR-NOTHING: kalau salah satu bagian gagal (misal item stok habis),
  // seluruh transaksi dibatalkan dan kode dianggap belum terpakai.
  //
  // ── FIX RACE CONDITION (duplikasi reward saat spam klik) ──
  // Sebelumnya claimKey baru ditulis di akhir, SETELAH reward diberikan.
  // Kalau member spam klik redeem, beberapa request bisa lolos cek
  // "sudah klaim?" secara bersamaan sebelum satupun sempat menulis status
  // claimed (delay network antara device dan server memberi celah waktu
  // itu) — akibatnya reward tergandakan sebanyak klik yang nyempil.
  //
  // Perbaikan: claimKey dikunci DI AWAL, sebelum validasi & pemberian
  // reward apapun. kvSet dengan flag NX (only-if-not-exists) dipakai
  // sebagai lock atomik — kalau key SUDAH ada, permintaan lain otomatis
  // ditolak di titik ini, tidak peduli seberapa cepat mereka datang
  // beruntun. Kalau validasi gagal setelah lock diambil (misal stok item
  // ternyata habis), lock dilepas lagi (rollback) supaya member tetap
  // bisa coba klaim ulang nanti.
  // ══════════════════════════════════════
  if (action === 'claim-redeem-code') {
    const { memberId, sessionToken, code } = req.body;

    const account = await verifyMemberSession(memberId, sessionToken);
    if (!account) return res.status(401).json({ error: 'Session tidak valid, silakan login ulang' });

    if (!code) return res.status(400).json({ error: 'Kode wajib diisi' });

    try {
      const redeemData = await kvGet(`redeem:${code.trim().toUpperCase()}`);
      if (!redeemData) return res.status(404).json({ error: 'Kode redeem tidak ditemukan' });
      if (!redeemData.active) return res.status(400).json({ error: 'Kode redeem ini sudah tidak aktif' });

      const claimKey = `redeemclaim:${redeemData.code}:${memberId}`;

      // Kunci atomik: hanya BENAR-BENAR SATU request yang bisa berhasil
      // set key ini kalau key belum ada (NX = "set if not exists"). Semua
      // request lain yang datang sebelum lock ini lepas akan otomatis
      // gagal di sini, walau mereka semua sempat lolos cek redeemData di
      // atas secara bersamaan.
      const lockAcquired = await kvSetNX(claimKey, { claimedAt: Date.now(), status: 'processing' });
      if (!lockAcquired) {
        return res.status(400).json({ error: 'Kamu sudah pernah klaim kode ini' });
      }

      // Validasi dulu SEMUA syarat sebelum mengubah data apapun (all-or-nothing).
      // Kalau ada reward item, pastikan item masih ada & stoknya cukup.
      let itemToGrant = null;
      if (redeemData.rewardItemId) {
        const items = await kvGet('shop:items') || [];
        itemToGrant = items.find(it => it.id === redeemData.rewardItemId);
        if (!itemToGrant) {
          await kvSet(claimKey, false); // rollback lock, member boleh coba lagi
          return res.status(400).json({ error: 'Reward item pada kode ini sudah tidak tersedia' });
        }

        if (itemToGrant.stokType === 'daily') {
          const today = todayDateString();
          if (itemToGrant.stokLastReset !== today) {
            itemToGrant.stokSisa = itemToGrant.stokJumlah;
            itemToGrant.stokLastReset = today;
          }
        }
        if ((itemToGrant.stokType === 'daily' || itemToGrant.stokType === 'onetime') && itemToGrant.stokSisa <= 0) {
          await kvSet(claimKey, false); // rollback lock
          return res.status(400).json({ error: 'Reward item pada kode ini sedang habis stoknya' });
        }
        if (itemToGrant.stokType === 'peraccount') {
          const purchaseCount = await kvGet(`purchasecount:${itemToGrant.id}:${memberId}`) || 0;
          if (purchaseCount >= itemToGrant.stokJumlah) {
            await kvSet(claimKey, false); // rollback lock
            return res.status(400).json({ error: 'Kamu sudah mencapai batas kepemilikan item reward ini' });
          }
        }

        const backpack = await kvGet(`backpack:${memberId}`) || [];
        const existingInBackpack = backpack.find(it => it.itemId === itemToGrant.id);
        if (existingInBackpack && existingInBackpack.quantity >= 100) {
          await kvSet(claimKey, false); // rollback lock
          return res.status(400).json({ error: 'Backpack kamu sudah penuh untuk item reward ini (maks 100)' });
        }
      }

      // Semua validasi lolos — sekarang baru benar-benar memberikan reward.
      let coinsGranted = 0;
      let eventCoinsGranted = 0;

      if (redeemData.rewardKoinGlobal > 0) {
        const currentCoins = await kvGet(`coins:${memberId}`) || 0;
        coinsGranted = currentCoins + redeemData.rewardKoinGlobal;
        await kvSet(`coins:${memberId}`, coinsGranted);
      }

      if (redeemData.rewardKoinEvent > 0 && redeemData.rewardEventId) {
        const eventCoinKey = `eventcoin:${redeemData.rewardEventId}:${memberId}`;
        const currentEventCoins = await kvGet(eventCoinKey) || 0;
        eventCoinsGranted = currentEventCoins + redeemData.rewardKoinEvent;
        await kvSet(eventCoinKey, eventCoinsGranted);
      }

      if (itemToGrant) {
        const backpack = await kvGet(`backpack:${memberId}`) || [];
        const existing = backpack.find(it => it.itemId === itemToGrant.id);
        if (existing) {
          existing.quantity = Math.min(existing.quantity + 1, 100);
        } else {
          backpack.push({
            itemId: itemToGrant.id,
            nama: itemToGrant.nama,
            icon: itemToGrant.icon,
            deskripsi: itemToGrant.deskripsi,
            kategori: itemToGrant.kategori || 'save',
            quantity: 1,
          });
        }
        await kvSet(`backpack:${memberId}`, backpack);

        if (itemToGrant.stokType === 'daily' || itemToGrant.stokType === 'onetime') {
          const items = await kvGet('shop:items') || [];
          const itemInList = items.find(it => it.id === itemToGrant.id);
          if (itemInList) {
            itemInList.stokSisa -= 1;
            itemInList.stokLastReset = itemToGrant.stokLastReset;
            await kvSet('shop:items', items);
          }
        } else if (itemToGrant.stokType === 'peraccount') {
          const purchaseCountKey = `purchasecount:${itemToGrant.id}:${memberId}`;
          const currentCount = await kvGet(purchaseCountKey) || 0;
          await kvSet(purchaseCountKey, currentCount + 1);
        }
      }

      // Lock sudah diambil di awal — sekarang tinggal finalisasi statusnya
      // (menggantikan status 'processing' jadi hasil akhir yang sudah pasti).
      await kvSet(claimKey, { claimedAt: Date.now(), status: 'done' });

      return res.status(200).json({
        success: true,
        rewardKoinGlobal: redeemData.rewardKoinGlobal,
        rewardKoinEvent: redeemData.rewardKoinEvent,
        rewardItem: itemToGrant ? { nama: itemToGrant.nama, icon: itemToGrant.icon } : null,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // ADD-BROADCAST-GALLERY-ITEM — Admin simpan referensi file musik/video
  // yang sudah di-upload ke Cloudinary (lewat event-upload.js) ke daftar
  // galeri, supaya bisa dipilih ulang saat kirim broadcast tanpa upload lagi.
  // ══════════════════════════════════════
  if (action === 'add-broadcast-gallery-item') {
    const { adminToken, type, nama, url, publicId } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });

    if (!['music', 'video'].includes(type)) {
      return res.status(400).json({ error: 'type harus music atau video' });
    }
    if (!nama || !url || !publicId) {
      return res.status(400).json({ error: 'nama, url, dan publicId wajib diisi' });
    }

    try {
      const files = await kvGet('broadcastgallery:list') || [];
      const newFile = {
        id: generateItemId(),
        type,
        nama: String(nama).slice(0, 150),
        url,
        publicId,
        uploadedAt: Date.now(),
      };
      files.push(newFile);
      const saved = await kvSet('broadcastgallery:list', files);
      if (!saved) return res.status(500).json({ error: 'Gagal menyimpan ke galeri' });

      return res.status(200).json({ success: true, file: newFile });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // LIST-BROADCAST-GALLERY — Admin lihat semua file musik/video di galeri
  // ══════════════════════════════════════
  if (action === 'list-broadcast-gallery') {
    const { adminToken } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });

    try {
      const files = await kvGet('broadcastgallery:list') || [];
      return res.status(200).json({ files });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // DELETE-BROADCAST-GALLERY-ITEM — Admin hapus file dari galeri, sekaligus
  // hapus file aslinya dari Cloudinary supaya tidak menumpuk (storage bersih)
  // ══════════════════════════════════════
  if (action === 'delete-broadcast-gallery-item') {
    const { adminToken, fileId } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });

    if (!fileId) return res.status(400).json({ error: 'fileId wajib diisi' });

    try {
      const files = await kvGet('broadcastgallery:list') || [];
      const file = files.find(f => f.id === fileId);
      if (!file) return res.status(404).json({ error: 'File tidak ditemukan di galeri' });

      // Hapus dulu dari Cloudinary — memanggil event-upload.js lewat fetch
      // internal, karena file ini disimpan sebagai resource_type 'video'
      // (baik musik maupun video WebM sama-sama masuk kategori itu di Cloudinary).
      try {
        const deployUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
        await fetch(`${deployUrl}/api/event-upload`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ publicId: file.publicId, resourceType: 'video' }),
        });
        // Tidak dianggap fatal kalau gagal — tetap lanjut hapus dari daftar
        // supaya galeri tidak "nyangkut" hanya karena satu bagian gagal.
      } catch (cloudErr) {
        console.error('Gagal menghapus file dari Cloudinary:', cloudErr);
      }

      const filtered = files.filter(f => f.id !== fileId);
      const saved = await kvSet('broadcastgallery:list', filtered);
      if (!saved) return res.status(500).json({ error: 'Gagal menghapus dari galeri' });

      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Action tidak dikenali' });
}
