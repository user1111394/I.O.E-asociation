// api/_tycoon/christmas.js — Pohon Natal (event): Siram Pohon, Craft Bola, Pasang Bola.
// Aksi: 'water-xmas-tree', 'get-xmas-tree-state', 'craft-ornament', 'install-ornament', 'open-gift'.
// Dipanggil lewat router api/tycoon.js (sesi member sudah diverifikasi di router).
// Hanya named export (tanpa export default).
//
// State (Upstash Redis): xmastree:{memberId} ->
//   { growth, totalWaters, lastWateredAt, ornamentsCrafted, ornamentsInstalled, giftsReadyAt, giftsEventId }
//   giftsEventId = event tempat bola dipasang; kado hanya bisa dibuka di event yang sama.
// Koin event: eventcoin:{eventId}:{memberId}; koin global: coins:{memberId} (angka; dikelola bersama shop.js).
//
// KEAMANAN (Hidden Gacha): daftar hadiah (event.xmasGachaPool) dibaca SERVER dari event di Firebase,
// BUKAN dari body request. Kalau pool dikirim browser, member bisa mengirim pool buatannya sendiri
// (mis. 1.000.000 koin) dan mencetak koin tanpa batas. Field `gachaPool` di request diabaikan.
//
// Aksi yang mengubah data (siram/craft/pasang) dikunci per member (SET NX EX 5) supaya klik/permintaan
// ganda tidak menimpa satu sama lain (mis. bayar 2x tapi bola bertambah 1). Kalau Redis untuk kunci
// gagal, aksi tetap jalan tanpa kunci (fail-open, sama seperti kuota Time Machine).
import { kvGet, kvSet, KV_URL, KV_TOKEN } from './shared.js';

const XMAS_TREE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const XMAS_TREE_MAX_GROWTH = 7;
const XMAS_TREE_COINS = 10;      // nilai informasi pada respons siram; TIDAK mengkredit saldo
const ORNAMENT_COST = 50;        // koin event per bola
const GIFT_DELAY_MS = 24 * 60 * 60 * 1000;
const MAX_GIFTS_PER_OPEN = 500;
const EVENT_DB_URL = process.env.EVENT_FIREBASE_DB_URL || 'https://storage-event-a5d18-default-rtdb.asia-southeast1.firebasedatabase.app';
const GACHA_TYPES = ['eventcoin', 'globalcoin', 'item'];
const GACHA_MAX_COIN = 1000000;

const DEFAULT_STATE = {
  growth: 0, totalWaters: 0, lastWateredAt: 0,
  ornamentsCrafted: 0, ornamentsInstalled: 0, giftsReadyAt: null, giftsEventId: null,
};

async function loadState(memberId) {
  const saved = await kvGet(`xmastree:${memberId}`);
  return { ...DEFAULT_STATE, ...(saved && typeof saved === 'object' ? saved : {}) };
}

// Perintah Redis lewat REST (atomik di sisi Redis): DECRBY, INCRBY, SET NX EX, DEL, GET.
async function kvCmd(...args) {
  const r = await fetch(`${KV_URL}/${args.map((a) => encodeURIComponent(String(a))).join('/')}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

async function withMemberLock(memberId, res, fn) {
  const lockKey = `xmaslock:${memberId}`;
  let locked = false;
  try {
    locked = (await kvCmd('set', lockKey, '1', 'NX', 'EX', 5)) === 'OK';
    if (!locked) return res.status(429).json({ error: 'Permintaan sebelumnya masih diproses. Coba lagi sebentar.' });
  } catch (e) { /* fail-open */ }
  try {
    return await fn();
  } finally {
    if (locked) { try { await kvCmd('del', lockKey); } catch (e) { /* kunci kedaluwarsa sendiri dalam 5 dtk */ } }
  }
}

function fmtWait(ms) {
  const m = Math.max(1, Math.ceil(ms / 60000));
  if (m >= 60) return `${Math.floor(m / 60)} jam ${m % 60} menit`;
  return `${m} menit`;
}

const EVENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// Baca event dari Firebase (REST, aturan baca publik seperti halaman event). null = tidak ada.
async function loadEvent(eventId) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    const r = await fetch(`${EVENT_DB_URL}/events/${encodeURIComponent(eventId)}.json`, { signal: ctl.signal });
    if (!r.ok) throw new Error(`Firebase ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

// Bersihkan pool dari Firebase: tipe valid, jumlah koin bilangan bulat 1..1.000.000, bobot > 0.
function sanitizeGachaPool(raw) {
  const rows = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? Object.values(raw) : []);
  const pool = [];
  for (const r of rows.slice(0, 50)) {
    if (!r || !GACHA_TYPES.includes(r.type)) continue;
    const weight = Number(r.weight);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    const w = Math.min(weight, 1e6);
    if (r.type === 'item') {
      const name = String(r.value == null ? '' : r.value).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40);
      if (name) pool.push({ type: 'item', name, amount: 1, weight: w });
    } else {
      const amount = Math.floor(Number(r.value));
      if (Number.isFinite(amount) && amount >= 1 && amount <= GACHA_MAX_COIN) pool.push({ type: r.type, amount, weight: w });
    }
  }
  return pool;
}

function rollReward(pool, eventCoinName) {
  const total = pool.reduce((a, p) => a + p.weight, 0);
  let x = Math.random() * total;
  let pick = pool[pool.length - 1];
  for (const p of pool) { x -= p.weight; if (x < 0) { pick = p; break; } }
  const name = pick.type === 'item' ? pick.name
    : pick.type === 'eventcoin' ? String(eventCoinName || 'Koin Event').slice(0, 40) : 'Koin Global';
  return { type: pick.type, amount: pick.amount, name };
}

export async function handleChristmas(ctx, res) {
  const { action, memberId } = ctx;
  const body = (ctx.req && ctx.req.body) || {};
  const stateKey = `xmastree:${memberId}`;

  // ── Baca state (tanpa kunci: hanya membaca) ──
  if (action === 'get-xmas-tree-state') {
    const s = await loadState(memberId);
    return res.status(200).json({
      success: true,
      growth: s.growth,
      ornamentsCrafted: s.ornamentsCrafted,
      ornamentsInstalled: s.ornamentsInstalled,
      giftsReadyAt: s.giftsReadyAt,
      craftCost: ORNAMENT_COST,
      maxGrowth: XMAS_TREE_MAX_GROWTH,
      serverNow: Date.now(), // untuk hitung mundur yang akurat walau jam HP salah
    });
  }

  // ── Siram pohon (cooldown 24 jam) ──
  if (action === 'water-xmas-tree') {
    return withMemberLock(memberId, res, async () => {
      const state = await loadState(memberId);
      const now = Date.now();
      const wait = (state.lastWateredAt || 0) + XMAS_TREE_COOLDOWN_MS - now;
      if (state.lastWateredAt && wait > 0) {
        return res.status(429).json({
          error: `Pohon sudah disiram. Siram lagi dalam ${fmtWait(wait)}.`,
          growth: state.growth || 0,
          retryAfterMs: wait,
        });
      }
      // ...state: bola & jadwal kado TIDAK boleh hilang saat menyiram
      const next = {
        ...state,
        growth: Math.min(XMAS_TREE_MAX_GROWTH, (state.growth || 0) + 1),
        totalWaters: (state.totalWaters || 0) + 1,
        lastWateredAt: now,
      };
      if (!(await kvSet(stateKey, next))) return res.status(500).json({ error: 'Gagal menyimpan pertumbuhan pohon. Coba lagi.' });
      return res.status(200).json({ success: true, growth: next.growth, maxGrowth: XMAS_TREE_MAX_GROWTH, coins: XMAS_TREE_COINS });
    });
  }

  // ── Craft bola: 50 koin event -> +1 bola ──
  if (action === 'craft-ornament') {
    const eventId = String(body.eventId || '');
    if (!EVENT_ID_RE.test(eventId)) return res.status(400).json({ error: 'eventId tidak valid' });
    return withMemberLock(memberId, res, async () => {
      const coinKey = `eventcoin:${eventId}:${memberId}`;
      const raw = await kvCmd('get', coinKey);
      const balance = raw === null || raw === undefined ? 0 : Number(raw);
      if (!Number.isFinite(balance)) return res.status(500).json({ error: 'Format saldo koin tidak dikenali. Hubungi admin.' });
      if (balance < ORNAMENT_COST) return res.status(400).json({ error: 'Koin tidak cukup' });

      // DECRBY atomik; kalau saldo ternyata berubah (mis. terpakai di tempat lain) dan jadi negatif -> kembalikan
      const left = Number(await kvCmd('decrby', coinKey, ORNAMENT_COST));
      if (!(left >= 0)) {
        await kvCmd('incrby', coinKey, ORNAMENT_COST);
        return res.status(400).json({ error: 'Koin tidak cukup' });
      }
      const state = await loadState(memberId);
      const next = { ...state, ornamentsCrafted: (state.ornamentsCrafted || 0) + 1 };
      if (!(await kvSet(stateKey, next))) {
        await kvCmd('incrby', coinKey, ORNAMENT_COST); // gagal simpan -> koin dikembalikan
        return res.status(500).json({ error: 'Gagal menyimpan bola. Koin dikembalikan.' });
      }
      return res.status(200).json({ success: true, ornamentsCrafted: next.ornamentsCrafted, coinsLeft: left });
    });
  }

  // ── Pasang semua bola yang sudah dibuat; kado siap 24 jam kemudian (hanya jika belum berjalan) ──
  if (action === 'install-ornament') {
    const eventId = String(body.eventId || '');
    if (!EVENT_ID_RE.test(eventId)) return res.status(400).json({ error: 'eventId tidak valid' });
    return withMemberLock(memberId, res, async () => {
      const state = await loadState(memberId);
      if (!state.ornamentsCrafted) return res.status(400).json({ error: 'Belum ada bola yang dibuat' });
      // satu kelompok kado = satu event (cegah memilih pool event lain saat membuka)
      if (state.ornamentsInstalled > 0 && state.giftsEventId && state.giftsEventId !== eventId) {
        return res.status(400).json({ error: 'Kado event lain belum dibuka. Buka dulu sebelum memasang bola di event ini.' });
      }
      const now = Date.now();
      const next = {
        ...state,
        giftsEventId: eventId,
        ornamentsInstalled: (state.ornamentsInstalled || 0) + state.ornamentsCrafted,
        ornamentsCrafted: 0,
        giftsReadyAt: !state.giftsReadyAt || state.giftsReadyAt <= now ? now + GIFT_DELAY_MS : state.giftsReadyAt,
      };
      if (!(await kvSet(stateKey, next))) return res.status(500).json({ error: 'Gagal menyimpan. Coba lagi.' });
      return res.status(200).json({
        success: true,
        ornamentsInstalled: next.ornamentsInstalled,
        ornamentsCrafted: 0,
        giftsReadyAt: next.giftsReadyAt,
      });
    });
  }

  // ── Buka kado (Hidden Gacha): 1 undian per bola terpasang, hasil langsung berupa teks ──
  if (action === 'open-gift') {
    const eventId = String(body.eventId || '');
    if (!EVENT_ID_RE.test(eventId)) return res.status(400).json({ error: 'eventId tidak valid' });
    return withMemberLock(memberId, res, async () => {
      const state = await loadState(memberId);
      const now = Date.now();
      if (!(state.ornamentsInstalled > 0)) return res.status(400).json({ error: 'Belum ada bola terpasang' });
      if (!state.giftsReadyAt || state.giftsReadyAt > now) {
        return res.status(400).json({ error: `Kado belum siap. Tunggu ${fmtWait((state.giftsReadyAt || now) - now)}.`, giftsReadyAt: state.giftsReadyAt });
      }
      if (state.giftsEventId && state.giftsEventId !== eventId) {
        return res.status(400).json({ error: 'Kado ini berasal dari event lain.' });
      }

      let ev;
      try { ev = await loadEvent(eventId); } catch (e) { return res.status(502).json({ error: 'Tidak bisa membaca data event. Coba lagi.' }); }
      if (!ev) return res.status(404).json({ error: 'Event tidak ditemukan atau sudah berakhir.' });
      const pool = sanitizeGachaPool(ev.xmasGachaPool); // sumber tepercaya; body.gachaPool diabaikan
      if (pool.length === 0) return res.status(400).json({ error: 'Event ini belum punya hadiah kado.' });

      const rewards = [];
      const n = Math.min(state.ornamentsInstalled, MAX_GIFTS_PER_OPEN);
      for (let i = 0; i < n; i++) rewards.push(rollReward(pool, ev.coinName));

      const evKey = `eventcoin:${eventId}:${memberId}`, glKey = `coins:${memberId}`;
      const evSum = rewards.filter(r => r.type === 'eventcoin').reduce((a, r) => a + r.amount, 0);
      const glSum = rewards.filter(r => r.type === 'globalcoin').reduce((a, r) => a + r.amount, 0);

      // pastikan format saldo bisa dibaca SEBELUM mengubah apa pun
      for (const [sum, key] of [[evSum, evKey], [glSum, glKey]]) {
        if (sum <= 0) continue;
        const raw = await kvCmd('get', key);
        if (raw !== null && raw !== undefined && !Number.isFinite(Number(raw))) {
          return res.status(500).json({ error: 'Format saldo koin tidak dikenali. Hubungi admin.' });
        }
      }

      // state di-reset dulu; kalau pemberian koin gagal, state dan koin dikembalikan
      const next = { ...state, ornamentsInstalled: 0, giftsReadyAt: null, giftsEventId: null };
      if (!(await kvSet(stateKey, next))) return res.status(500).json({ error: 'Gagal menyimpan. Coba lagi.' });
      const credited = [];
      try {
        const balances = {};
        if (evSum > 0) { balances.eventcoin = Number(await kvCmd('incrby', evKey, evSum)); credited.push([evKey, evSum]); }
        if (glSum > 0) { balances.globalcoin = Number(await kvCmd('incrby', glKey, glSum)); credited.push([glKey, glSum]); }
        return res.status(200).json({ success: true, rewards, balances });
      } catch (e) {
        for (const [k, a] of credited) { try { await kvCmd('decrby', k, a); } catch (e2) { /* best effort */ } }
        await kvSet(stateKey, state);
        return res.status(500).json({ error: 'Gagal memberikan hadiah. Coba lagi.' });
      }
    });
  }
}
