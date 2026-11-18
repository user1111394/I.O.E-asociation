// api/_shop/shared.js — helper bersama api/shop.js: Redis (kv*), verifikasi admin/member, ID, util TikTok.
// Dipindah dari api/shop.js tanpa perubahan logika; di akhir file ada helper BARU untuk klaim quest
// (kvDel, kvSetNXEx, normalizeClaim, EVENT_DB_URL). Hanya named export.

import crypto from 'crypto';

// ── Upstash Redis REST helper (pola sama seperti auth.js) ──
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
export async function kvSetNX(key, value) {
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

// Verifikasi member: pastikan session valid, kembalikan account-nya
export async function verifyMemberSession(memberId, sessionToken) {
  if (!memberId || !sessionToken) return null;
  const account = await kvGet(`account:${memberId}`);
  if (!account || account.currentSession !== sessionToken) return null;
  return account;
}

export function generateItemId() {
  return 'item_' + crypto.randomBytes(8).toString('hex');
}

// Kode redeem format: IOE-XXXXXX (6 karakter alfanumerik huruf besar,
// menghindari karakter yang gampang tertukar seperti 0/O dan 1/I)
export function generateRedeemCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[crypto.randomInt(chars.length)];
  }
  return 'IOE-' + code;
}

// Tanggal hari ini dalam format YYYY-MM-DD, dipakai untuk cek daily check-in
export function todayDateString() {
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
export function extractTikTokVideoId(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/);
  return match ? match[1] : null;
}

export function isTikTokShortLink(url) {
  if (!url || typeof url !== 'string') return false;
  return /vt\.tiktok\.com|vm\.tiktok\.com/.test(url);
}

// Hasil: 'approved' | 'pending' | 'rejected'
export function verifyTikTokSubmission(sourceLink, submittedLink) {
  if (!submittedLink) return 'rejected';
  if (isTikTokShortLink(submittedLink)) return 'pending';

  const sourceId = extractTikTokVideoId(sourceLink);
  const submittedId = extractTikTokVideoId(submittedLink);
  if (!sourceId || !submittedId) return 'pending'; // format tak dikenali, biar admin yang lihat manual
  return sourceId === submittedId ? 'approved' : 'rejected';
}

// ══════════════════════════════════════════════════════
// HELPER BARU (quest event: format klaim { status, claimedAt } + klaim ulang quest berulang)
// ══════════════════════════════════════════════════════

// Hapus key (DEL) lewat endpoint command generik (sama seperti kvSetNX). Dipakai melepas kunci pengambilalihan.
export async function kvDel(key) {
  try {
    const r = await fetch(KV_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['DEL', key]),
    });
    const data = await r.json();
    return !data.error;
  } catch (e) {
    console.error('kvDel gagal:', e.message, 'key:', key);
    return false;
  }
}

// SET NX EX — seperti kvSetNX tapi kuncinya kedaluwarsa sendiri (detik), jadi tidak bisa menyangkut selamanya.
export async function kvSetNXEx(key, value, seconds) {
  try {
    const r = await fetch(KV_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['SET', key, JSON.stringify(value), 'NX', 'EX', seconds]),
    });
    const data = await r.json();
    if (data.error) { console.error('kvSetNXEx Redis error:', data.error, 'key:', key); return false; }
    return data.result === 'OK';
  } catch (e) {
    console.error('kvSetNXEx request gagal:', e.message, 'key:', key);
    return false;
  }
}

// Rekaman klaim quest: LAMA = string ('approved' | 'pending' | 'processing'), BARU = { status, claimedAt }.
// false/null = tidak ada klaim (ditolak admin / dibatalkan). Semua pembaca key questclaimed:* memakai ini
// supaya klaim lama (string) tetap terbaca.
export function normalizeClaim(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') return { status: raw, claimedAt: null };
  if (typeof raw === 'object' && raw.status) return { status: raw.status, claimedAt: raw.claimedAt ?? null };
  return null;
}

// Database event (Firebase Realtime DB, dibaca lewat REST; aturan baca publik seperti halaman event).
// Dipakai server untuk membaca resetType quest dari sumber tepercaya, bukan dari request.
export const EVENT_DB_URL = process.env.EVENT_FIREBASE_DB_URL || 'https://storage-event-a5d18-default-rtdb.asia-southeast1.firebasedatabase.app';
