// api/_shop/gacha.js — Gacha Spin Wheel: konfigurasi (admin) dan spin (member).
// Dipindah dari api/shop.js tanpa perubahan logika. Hanya named export.

import { generateItemId, kvGet, kvSet, verifyAdminAccess, verifyMemberSession } from './shared.js';

export async function handleGacha(ctx, res) {
  const { req, action } = ctx;

  // ══════════════════════════════════════════════════════════════════
  // GACHA SPIN WHEEL — proyek terpisah dari Wild Harvest (dikonfirmasi
  // sebelumnya). Bayar pakai koin Shop (coins:{memberId}), hadiah diatur
  // PENUH oleh superadmin: daftar slot, nominal tiap slot, dan persentase
  // peluang tiap slot (harus total 100%). Numpang di shop.js karena
  // biaya spin & salah satu tipe hadiah (item Shop) sama-sama bagian
  // ekosistem Shop.
  //
  // Tipe reward per slot (field `type`):
  //  - 'coin_global' : tambah ke coins:{memberId} sejumlah `value`
  //  - 'coin_garden' : tambah ke seedcoins:{memberId} sejumlah `value`
  //                    (key SAMA yang dipakai tycoon.js untuk Wild
  //                    Harvest/Garden — ditulis langsung dari sini,
  //                    tanpa panggil API lain, karena cuma angka biasa
  //                    di Redis yang sama)
  //  - 'coin_ore'    : tambah ke orecoins:{memberId} sejumlah `value`
  //                    (key SAMA milik Ore Tycoon, ditulis langsung
  //                    juga, pola sama seperti coin_garden)
  //  - 'shop_item'   : tambahkan 1 item Shop (itemId merujuk ke
  //                    shop:items) ke backpack:{memberId}, TANPA
  //                    memotong stok item itu (ini hadiah gratis dari
  //                    gacha, bukan pembelian — stok Shop biasa tidak
  //                    boleh berkurang karenanya)
  //  - 'thanks'      : tidak ada efek apapun ke state member, cuma
  //                    pesan hiburan "Terima kasih sudah bermain"
  //  - 'zonk'        : tidak dapat apa-apa, pesan "Zonk!"
  // ══════════════════════════════════════════════════════════════════

  function defaultGachaConfig() {
    return {
      spinCost: 50,
      slots: [
        { id: 'slot1', type: 'coin_global', label: 'Koin Global', value: 20, percentage: 25 },
        { id: 'slot2', type: 'coin_garden', label: 'Seed Coin', value: 30, percentage: 20 },
        { id: 'slot3', type: 'coin_ore', label: 'Ore Coin', value: 30, percentage: 20 },
        { id: 'slot4', type: 'thanks', label: 'Terima Kasih', value: 0, percentage: 20 },
        { id: 'slot5', type: 'zonk', label: 'Zonk', value: 0, percentage: 15 },
      ],
    };
  }

  // GET-GACHA-CONFIG — publik, dipakai gacha.html buat gambar roda +
  // tampilkan biaya spin. Tidak butuh sesi member (biar bisa preview
  // roda sebelum login kalau perlu), tapi TIDAK mengekspos apapun
  // sensitif (cuma daftar slot + label + persentase + biaya).
  if (action === 'get-gacha-config') {
    try {
      let config = await kvGet('gacha:config');
      if (!config) config = defaultGachaConfig();
      return res.status(200).json({ config });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ADMIN-SET-GACHA-CONFIG — superadmin atur ulang seluruh config
  // (ganti total, bukan patch parsial — lebih sederhana & tidak
  // ambigu, mengikuti pola items shop yang juga diatur sebagai 1
  // objek utuh per operasi).
  if (action === 'admin-set-gacha-config') {
    const { adminToken, spinCost, slots } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });

    const spinCostNum = Number(spinCost);
    if (!Number.isFinite(spinCostNum) || spinCostNum < 0) {
      return res.status(400).json({ error: 'spinCost harus angka >= 0' });
    }
    if (!Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({ error: 'slots wajib diisi minimal 1 hadiah' });
    }

    const validTypes = ['coin_global', 'coin_garden', 'coin_ore', 'shop_item', 'thanks', 'zonk'];
    let totalPercentage = 0;
    const cleanedSlots = [];
    for (const slot of slots) {
      if (!validTypes.includes(slot.type)) {
        return res.status(400).json({ error: `Tipe hadiah tidak dikenali: ${slot.type}` });
      }
      const pct = Number(slot.percentage);
      if (!Number.isFinite(pct) || pct < 0) {
        return res.status(400).json({ error: 'Persentase tiap slot harus angka >= 0' });
      }
      totalPercentage += pct;

      const cleaned = {
        id: slot.id || generateItemId(),
        type: slot.type,
        label: String(slot.label || '').slice(0, 60),
        percentage: pct,
        value: 0, itemId: null,
      };
      if (slot.type === 'coin_global' || slot.type === 'coin_garden' || slot.type === 'coin_ore') {
        const val = Number(slot.value);
        if (!Number.isFinite(val) || val < 1) {
          return res.status(400).json({ error: `Nominal untuk slot "${cleaned.label}" harus angka lebih dari 0` });
        }
        cleaned.value = val;
      }
      if (slot.type === 'shop_item') {
        if (!slot.itemId) return res.status(400).json({ error: `Slot "${cleaned.label}" bertipe item Shop wajib pilih itemId` });
        cleaned.itemId = slot.itemId;
      }
      cleanedSlots.push(cleaned);
    }

    // Total persentase harus tepat 100 (toleransi kecil untuk floating
    // point) supaya peluang tidak bocor/lebih dari 100%.
    if (Math.abs(totalPercentage - 100) > 0.5) {
      return res.status(400).json({ error: `Total persentase semua slot harus 100% (sekarang ${totalPercentage}%)` });
    }

    try {
      const config = { spinCost: spinCostNum, slots: cleanedSlots };
      const saved = await kvSet('gacha:config', config);
      if (!saved) return res.status(500).json({ error: 'Gagal menyimpan config gacha' });
      return res.status(200).json({ success: true, config });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // SPIN-GACHA — member spin roda, potong spinCost dari koin Shop,
  // roll 1 slot berdasarkan percentage, berikan reward sesuai tipe.
  if (action === 'spin-gacha') {
    const { memberId, sessionToken } = req.body;

    const account = await verifyMemberSession(memberId, sessionToken);
    if (!account) return res.status(401).json({ error: 'Session tidak valid, silakan login ulang' });

    try {
      let config = await kvGet('gacha:config');
      if (!config) config = defaultGachaConfig();

      const currentCoins = await kvGet(`coins:${memberId}`) || 0;
      if (currentCoins < config.spinCost) {
        return res.status(400).json({ error: 'Koin tidak cukup untuk spin', coins: currentCoins, needed: config.spinCost });
      }

      // Potong biaya spin DULU sebelum roll, supaya tidak ada celah
      // klaim reward tanpa bayar kalau terjadi error di tengah proses.
      const coinsAfterSpin = currentCoins - config.spinCost;
      await kvSet(`coins:${memberId}`, coinsAfterSpin);

      // Roll 1 slot berdasarkan percentage (weighted random, pola sama
      // seperti rollDigOutcome di tycoon.js).
      const roll = Math.random() * 100;
      let acc = 0;
      let wonSlot = config.slots[config.slots.length - 1]; // fallback slot terakhir kalau floating point meleset dikit
      for (const slot of config.slots) {
        acc += slot.percentage;
        if (roll <= acc) { wonSlot = slot; break; }
      }

      // Terapkan efek reward sesuai tipe slot yang menang.
      let resultDetail = { type: wonSlot.type, label: wonSlot.label };
      if (wonSlot.type === 'coin_global') {
        const newVal = coinsAfterSpin + wonSlot.value;
        await kvSet(`coins:${memberId}`, newVal);
        resultDetail.value = wonSlot.value;
        resultDetail.newCoins = newVal;
      } else if (wonSlot.type === 'coin_garden') {
        const current = await kvGet(`seedcoins:${memberId}`) || 0;
        const newVal = current + wonSlot.value;
        await kvSet(`seedcoins:${memberId}`, newVal);
        resultDetail.value = wonSlot.value;
      } else if (wonSlot.type === 'coin_ore') {
        const current = await kvGet(`orecoins:${memberId}`) || 0;
        const newVal = current + wonSlot.value;
        await kvSet(`orecoins:${memberId}`, newVal);
        resultDetail.value = wonSlot.value;
      } else if (wonSlot.type === 'shop_item') {
        const items = await kvGet('shop:items') || [];
        const item = items.find(it => it.id === wonSlot.itemId);
        if (item) {
          const MAX_STACK = 100;
          const backpack = await kvGet(`backpack:${memberId}`) || [];
          const existing = backpack.find(it => it.itemId === item.id);
          if (existing) {
            existing.quantity = Math.min(existing.quantity + 1, MAX_STACK);
          } else {
            backpack.push({
              itemId: item.id, nama: item.nama, icon: item.icon,
              deskripsi: item.deskripsi, kategori: item.kategori || 'save', quantity: 1,
            });
          }
          await kvSet(`backpack:${memberId}`, backpack);
          resultDetail.item = item;
        } else {
          // Item sudah dihapus admin setelah slot dibuat — fallback
          // jadi 'thanks' supaya member tidak error, tapi tetap dapat
          // pesan wajar (bukan silent fail).
          resultDetail.type = 'thanks';
          resultDetail.label = 'Terima Kasih (item sudah tidak tersedia)';
        }
      }
      // 'thanks' dan 'zonk' tidak butuh efek tambahan apapun.

      const finalCoins = await kvGet(`coins:${memberId}`) || 0;
      return res.status(200).json({ success: true, result: resultDetail, coins: finalCoins, wonSlotId: wonSlot.id });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
}
