// api/_shop/redeem.js — Kode redeem: buat, daftar, hapus, klaim.
// Dipindah dari api/shop.js tanpa perubahan logika. Hanya named export.

import { generateRedeemCode, kvGet, kvSet, kvSetNX, todayDateString, verifyAdminAccess, verifyMemberSession } from './shared.js';

export async function handleRedeem(ctx, res) {
  const { req, action } = ctx;

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
}
