// api/_tycoon/christmas.js — Pohon Natal: minigame "Siram Pohon" di halaman event.
// Aksi: 'water-xmas-tree'. Dipanggil lewat router api/tycoon.js (sesi member sudah diverifikasi
// di router). Hanya named export (tanpa export default).
//
// Data (Upstash Redis): xmastree:{memberId} -> { growth, totalWaters, lastWateredAt }
//   - cooldown 24 jam sejak siram terakhir
//   - growth naik 1 tiap siram, maksimal XMAS_TREE_MAX_GROWTH
//   - `coins` di respons hanya nilai informasi: TIDAK mengkredit saldo apa pun. Reward event
//     sebenarnya tetap diberikan lewat klaim quest (/api/shop), supaya tidak ada reward ganda.
import { kvGet, kvSet } from './shared.js';

const XMAS_TREE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const XMAS_TREE_MAX_GROWTH = 7;
const XMAS_TREE_COINS = 10;

function fmtWait(ms) {
  const m = Math.max(1, Math.ceil(ms / 60000));
  if (m >= 60) return `${Math.floor(m / 60)} jam ${m % 60} menit`;
  return `${m} menit`;
}

export async function handleChristmas(ctx, res) {
  const { action, memberId } = ctx;

  if (action === 'water-xmas-tree') {
    const key = `xmastree:${memberId}`;
    const state = (await kvGet(key)) || { growth: 0, totalWaters: 0, lastWateredAt: 0 };
    const now = Date.now();
    const wait = (state.lastWateredAt || 0) + XMAS_TREE_COOLDOWN_MS - now;

    if (state.lastWateredAt && wait > 0) {
      return res.status(429).json({
        error: `Pohon sudah disiram. Siram lagi dalam ${fmtWait(wait)}.`,
        growth: state.growth || 0,
        retryAfterMs: wait,
      });
    }

    const next = {
      growth: Math.min(XMAS_TREE_MAX_GROWTH, (state.growth || 0) + 1),
      totalWaters: (state.totalWaters || 0) + 1,
      lastWateredAt: now,
    };
    const saved = await kvSet(key, next);
    if (!saved) return res.status(500).json({ error: 'Gagal menyimpan pertumbuhan pohon. Coba lagi.' });

    return res.status(200).json({
      success: true,
      growth: next.growth,
      maxGrowth: XMAS_TREE_MAX_GROWTH,
      coins: XMAS_TREE_COINS,
    });
  }
}
