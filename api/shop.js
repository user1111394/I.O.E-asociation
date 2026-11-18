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

//
// ── REFAKTOR ──
// Logika dipecah ke api/_shop/ (folder berawalan _ tidak dihitung sebagai Serverless Function):
//   shared.js (helper), items.js, gacha.js, redeem.js, event-quests.js, gallery.js.
// File ini hanya router tipis.

import { KV_URL, KV_TOKEN } from './_shop/shared.js';
import { handleItems } from './_shop/items.js';
import { handleGacha } from './_shop/gacha.js';
import { handleRedeem } from './_shop/redeem.js';
import { handleEventQuests } from './_shop/event-quests.js';
import { handleGallery } from './_shop/gallery.js';

// action -> handler modul. Map (bukan object) supaya action seperti "constructor" tidak lolos.
const GROUPS = [
  [handleItems, [
    'list-items',
    'add-item',
    'remove-item',
    'get-balance',
    'daily-checkin',
    'buy-item',
    'get-backpack',
    'equip-item',
    'unequip-item',
    'restock-item',
    'get-purchase-count',
  ]],
  [handleGacha, [
    'get-gacha-config',
    'admin-set-gacha-config',
    'spin-gacha',
  ]],
  [handleRedeem, [
    'create-redeem-code',
    'list-redeem-codes',
    'delete-redeem-code',
    'claim-redeem-code',
  ]],
  [handleEventQuests, [
    'grant-event-coin',
    'claim-quest',
    'check-quest-claimed',
    'list-pending-quests',
    'approve-pending-quest',
    'reject-pending-quest',
    'check-event-coin',
    'get-event-balance',
  ]],
  [handleGallery, [
    'add-broadcast-gallery-item',
    'list-broadcast-gallery',
    'delete-broadcast-gallery-item',
  ]],
];
const ROUTES = new Map(GROUPS.flatMap(([fn, names]) => names.map((n) => [n, fn])));

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: 'Storage belum terhubung (KV_REST_API_URL/TOKEN tidak ditemukan)' });
  }

  const { action } = req.body;

  const handleAction = ROUTES.get(action);
  if (!handleAction) return res.status(400).json({ error: 'Action tidak dikenali' });
  return handleAction({ req, action }, res);
}
