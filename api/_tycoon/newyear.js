// api/_tycoon/newyear.js — Event Tahun Baru: Craft Kembang Api -> (malam 18:00-23:59 WIB) Nyalakan -> Hidden Gacha.
// Aksi: 'get-newyear-state', 'craft-firework', 'launch-firework'.
// Dipanggil lewat router api/tycoon.js (sesi member sudah diverifikasi di router).
// Hanya named export (tanpa export default). Memakai ulang helper gacha dari christmas.js.
//
// State (Upstash Redis): newyear:{memberId} -> { crafted, launched, eventId }
//   eventId = event tempat kembang api dibuat; hanya bisa dinyalakan di event yang sama
//   (mencegah memilih pool hadiah event lain).
// Koin event: eventcoin:{eventId}:{memberId}; koin global: coins:{memberId} (angka; dikelola bersama shop.js).
//
// KEAMANAN: daftar hadiah dibaca SERVER dari event di Firebase (eventGachaPool; xmasGachaPool/gachaPool
// untuk event lama), BUKAN dari body request. Field `gachaPool` di request diabaikan.
import { kvGet, kvSet } from './shared.js';
import { EVENT_ID_RE, kvCmd, withMemberLock, loadEvent, sanitizeGachaPool, pickGachaPool, rollReward } from './christmas.js';

const FIREWORK_COST = 50;            // koin event per kembang api
const MAX_LAUNCH_PER_ACTION = 500;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const NIGHT_START_HOUR = 18;         // jendela malam: 18:00 s/d 23:59 WIB

const DEFAULT_STATE = { crafted: 0, launched: 0, eventId: null };

// Jam WIB dihitung dari UTC+7. JANGAN pakai new Date().getHours(): di Vercel zona waktunya UTC,
// sehingga jendela malam akan bergeser 7 jam.
export function wibHour(now = Date.now()) { return new Date(now + WIB_OFFSET_MS).getUTCHours(); }
export function isWibNight(now = Date.now()) { return wibHour(now) >= NIGHT_START_HOUR; }

async function loadState(memberId) {
  const saved = await kvGet(`newyear:${memberId}`);
  return { ...DEFAULT_STATE, ...(saved && typeof saved === 'object' ? saved : {}) };
}

export async function handleNewYear(ctx, res) {
  const { action, memberId } = ctx;
  const body = (ctx.req && ctx.req.body) || {};
  const stateKey = `newyear:${memberId}`;

  // ── Baca state (tanpa kunci: hanya membaca) ──
  if (action === 'get-newyear-state') {
    const s = await loadState(memberId);
    const now = Date.now();
    return res.status(200).json({
      success: true,
      crafted: s.crafted,
      launched: s.launched,
      craftCost: FIREWORK_COST,
      isNight: isWibNight(now), // jendela nyala 18:00-23:59 WIB sedang buka?
      serverNow: now,
    });
  }

  // ── Craft kembang api: 50 koin event -> +1 ──
  if (action === 'craft-firework') {
    const eventId = String(body.eventId || '');
    if (!EVENT_ID_RE.test(eventId)) return res.status(400).json({ error: 'eventId tidak valid' });
    return withMemberLock(memberId, res, async () => {
      const state = await loadState(memberId);
      if (state.crafted > 0 && state.eventId && state.eventId !== eventId) {
        return res.status(400).json({ error: 'Kembang api event lain belum dinyalakan. Nyalakan dulu sebelum membuat di event ini.' });
      }
      const coinKey = `eventcoin:${eventId}:${memberId}`;
      const raw = await kvCmd('get', coinKey);
      const balance = raw === null || raw === undefined ? 0 : Number(raw);
      if (!Number.isFinite(balance)) return res.status(500).json({ error: 'Format saldo koin tidak dikenali. Hubungi admin.' });
      if (balance < FIREWORK_COST) return res.status(400).json({ error: 'Koin tidak cukup' });

      // DECRBY atomik; kalau saldo berubah di tempat lain dan jadi negatif -> kembalikan
      const left = Number(await kvCmd('decrby', coinKey, FIREWORK_COST));
      if (!(left >= 0)) {
        await kvCmd('incrby', coinKey, FIREWORK_COST);
        return res.status(400).json({ error: 'Koin tidak cukup' });
      }
      const next = { ...state, crafted: (state.crafted || 0) + 1, eventId };
      if (!(await kvSet(stateKey, next))) {
        await kvCmd('incrby', coinKey, FIREWORK_COST); // gagal simpan -> koin dikembalikan
        return res.status(500).json({ error: 'Gagal menyimpan kembang api. Koin dikembalikan.' });
      }
      return res.status(200).json({ success: true, crafted: next.crafted, coinsLeft: left });
    });
  }

  // ── Nyalakan semua kembang api (hanya malam 18:00-23:59 WIB) -> 1 undian per kembang api ──
  if (action === 'launch-firework') {
    const eventId = String(body.eventId || '');
    if (!EVENT_ID_RE.test(eventId)) return res.status(400).json({ error: 'eventId tidak valid' });
    return withMemberLock(memberId, res, async () => {
      const now = Date.now();
      if (!isWibNight(now)) {
        return res.status(400).json({ error: 'Hanya bisa dinyalakan di malam hari (18:00 - 23:59 WIB)' });
      }
      const state = await loadState(memberId);
      if (!(state.crafted > 0)) return res.status(400).json({ error: 'Belum ada kembang api yang dibuat' });
      if (state.eventId && state.eventId !== eventId) {
        return res.status(400).json({ error: 'Kembang api ini berasal dari event lain.' });
      }

      let ev;
      try { ev = await loadEvent(eventId); } catch (e) { return res.status(502).json({ error: 'Tidak bisa membaca data event. Coba lagi.' }); }
      if (!ev) return res.status(404).json({ error: 'Event tidak ditemukan atau sudah berakhir.' });
      const pool = sanitizeGachaPool(pickGachaPool(ev)); // sumber tepercaya; body.gachaPool diabaikan
      if (pool.length === 0) return res.status(400).json({ error: 'Event ini belum punya hadiah gacha.' });

      const n = Math.min(state.crafted, MAX_LAUNCH_PER_ACTION);
      const rewards = [];
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
      const next = { ...state, crafted: state.crafted - n, launched: (state.launched || 0) + n, eventId: state.crafted - n > 0 ? state.eventId : null };
      if (!(await kvSet(stateKey, next))) return res.status(500).json({ error: 'Gagal menyimpan. Coba lagi.' });
      const credited = [];
      try {
        const balances = {};
        if (evSum > 0) { balances.eventcoin = Number(await kvCmd('incrby', evKey, evSum)); credited.push([evKey, evSum]); }
        if (glSum > 0) { balances.globalcoin = Number(await kvCmd('incrby', glKey, glSum)); credited.push([glKey, glSum]); }
        return res.status(200).json({ success: true, rewards, crafted: next.crafted, launched: next.launched, balances });
      } catch (e) {
        for (const [k, a] of credited) { try { await kvCmd('decrby', k, a); } catch (e2) { /* best effort */ } }
        await kvSet(stateKey, state);
        return res.status(500).json({ error: 'Gagal memberikan hadiah. Coba lagi.' });
      }
    });
  }
}
