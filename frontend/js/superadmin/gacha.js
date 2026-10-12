/* ═══════════════════════════════════════════════
   I.O.E HUB — SUPERADMIN / gacha.js
   Config Gacha spin wheel
   Dimuat otomatis oleh js/nav.js (lazy-load) saat panel admin pertama kali dibuka.
   Script klasik (bukan ES module): fungsi & variabel tetap global, jadi onclick="..." di HTML tetap jalan.
═══════════════════════════════════════════════ */

// ═══ GACHA SPIN WHEEL — Panel Superadmin ═══
// Numpang di shop.js (action 'get-gacha-config' / 'admin-set-gacha-config'),
// karena biaya spin & salah satu tipe hadiah (item Shop) sama-sama bagian
// ekosistem Shop. Setiap slot direpresentasikan 1 baris form dinamis;
// simpan mengirim SELURUH daftar slot sekaligus (ganti total, bukan patch).
const GACHA_TYPE_LABELS = {
  coin_global: '🪙 Koin Global', coin_garden: '🌰 Koin Garden (Seed Coin)',
  coin_ore: '⛏️ Koin Ore', shop_item: '🎁 Item Shop',
  thanks: '💌 Terima Kasih', zonk: '💨 Zonk',
};
let gachaShopItemsCache = []; // cache daftar item shop, dipakai isi dropdown tiap slot bertipe shop_item

function saGachaSlotRowHtml(slot) {
  const rowId = slot.id || ('gslot_' + Math.random().toString(36).slice(2, 9));
  const needsValue = ['coin_global', 'coin_garden', 'coin_ore'].includes(slot.type);
  const needsItem = slot.type === 'shop_item';
  return `
    <div class="sa-gacha-slot-row" data-row-id="${rowId}" style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,210,63,0.2); border-radius:10px; padding:10px;">
      <div style="display:flex; gap:6px; margin-bottom:6px;">
        <select class="sa-gacha-slot-type" onchange="saOnGachaSlotTypeChange('${rowId}')" style="flex:1; padding:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,210,63,0.25); border-radius:6px; color:#fff; font-size:12px;">
          ${Object.entries(GACHA_TYPE_LABELS).map(([val, label]) => `<option value="${val}" ${slot.type === val ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        <button type="button" onclick="saRemoveGachaSlotRow('${rowId}')" style="padding:8px 10px; background:rgba(255,90,90,0.15); border:1px solid rgba(255,90,90,0.3); color:#ff6b6b; border-radius:6px; cursor:pointer; font-size:12px;">✕</button>
      </div>
      <input class="sa-gacha-slot-label" type="text" placeholder="Label (contoh: Koin Global x20)" value="${slot.label ? slot.label.replace(/"/g, '&quot;') : ''}" style="width:100%; padding:8px; margin-bottom:6px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,210,63,0.25); border-radius:6px; color:#fff; font-size:12px; box-sizing:border-box;">
      <div style="display:flex; gap:6px; margin-bottom:6px;">
        <input class="sa-gacha-slot-value" type="number" min="1" placeholder="Nominal" value="${slot.value || ''}" style="flex:1; padding:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,210,63,0.25); border-radius:6px; color:#fff; font-size:12px; box-sizing:border-box; display:${needsValue ? 'block' : 'none'};">
        <select class="sa-gacha-slot-item" style="flex:1; padding:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,210,63,0.25); border-radius:6px; color:#fff; font-size:12px; display:${needsItem ? 'block' : 'none'};">
          <option value="">Pilih item...</option>
        </select>
        <input class="sa-gacha-slot-pct" type="number" min="0" max="100" step="0.1" placeholder="Persen %" value="${slot.percentage || ''}" oninput="saUpdateGachaTotalPct()" style="width:90px; padding:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,210,63,0.25); border-radius:6px; color:#fff; font-size:12px; box-sizing:border-box;">
      </div>
    </div>
  `;
}

function saAddGachaSlotRow(slot) {
  const list = document.getElementById('sa-gacha-slot-list');
  const div = document.createElement('div');
  div.innerHTML = saGachaSlotRowHtml(slot || { type: 'coin_global' });
  list.appendChild(div.firstElementChild);
  saPopulateGachaItemDropdowns();
  saUpdateGachaTotalPct();
}
window.saAddGachaSlotRow = saAddGachaSlotRow;

function saRemoveGachaSlotRow(rowId) {
  const row = document.querySelector(`.sa-gacha-slot-row[data-row-id="${rowId}"]`);
  if (row) row.remove();
  saUpdateGachaTotalPct();
}
window.saRemoveGachaSlotRow = saRemoveGachaSlotRow;

function saOnGachaSlotTypeChange(rowId) {
  const row = document.querySelector(`.sa-gacha-slot-row[data-row-id="${rowId}"]`);
  if (!row) return;
  const type = row.querySelector('.sa-gacha-slot-type').value;
  const needsValue = ['coin_global', 'coin_garden', 'coin_ore'].includes(type);
  const needsItem = type === 'shop_item';
  row.querySelector('.sa-gacha-slot-value').style.display = needsValue ? 'block' : 'none';
  row.querySelector('.sa-gacha-slot-item').style.display = needsItem ? 'block' : 'none';
}
window.saOnGachaSlotTypeChange = saOnGachaSlotTypeChange;

function saUpdateGachaTotalPct() {
  const rows = document.querySelectorAll('.sa-gacha-slot-row');
  let total = 0;
  rows.forEach(row => {
    const val = parseFloat(row.querySelector('.sa-gacha-slot-pct').value) || 0;
    total += val;
  });
  const label = document.getElementById('sa-gacha-total-pct');
  label.textContent = `Total: ${total}%`;
  label.style.color = Math.abs(total - 100) < 0.5 ? '#00e5c0' : '#ff6b6b';
}
window.saUpdateGachaTotalPct = saUpdateGachaTotalPct;

// Isi dropdown item Shop di semua baris slot bertipe shop_item —
// dipanggil ulang tiap kali baris baru ditambah, memakai cache item
// yang sudah diambil sekali di saLoadGachaConfig.
function saPopulateGachaItemDropdowns() {
  const dropdowns = document.querySelectorAll('.sa-gacha-slot-item');
  dropdowns.forEach(dd => {
    const currentVal = dd.value;
    dd.innerHTML = '<option value="">Pilih item...</option>' +
      gachaShopItemsCache.map(it => `<option value="${it.id}">${it.nama}</option>`).join('');
    if (currentVal) dd.value = currentVal;
  });
}

async function saLoadGachaConfig() {
  const list = document.getElementById('sa-gacha-slot-list');
  list.innerHTML = '<p style="color:#718096; font-size:12px; text-align:center; padding:20px;">Memuat config gacha...</p>';

  try {
    const itemsRes = await fetch('/api/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list-items' }),
    });
    const itemsData = await itemsRes.json();
    gachaShopItemsCache = itemsData.items || [];

    const res = await fetch('/api/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get-gacha-config' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal memuat config');

    document.getElementById('sa-gacha-spincost').value = data.config.spinCost;
    list.innerHTML = '';
    for (const slot of data.config.slots) {
      const div = document.createElement('div');
      div.innerHTML = saGachaSlotRowHtml(slot);
      list.appendChild(div.firstElementChild);
      // Isi ulang value item/nominal setelah row ditambahkan (karena
      // saGachaSlotRowHtml sudah handle value awal lewat parameter slot).
    }
    saPopulateGachaItemDropdowns();
    // Set value dropdown item untuk slot bertipe shop_item (dropdown baru
    // diisi options-nya SETELAH row dibuat, jadi value itemId perlu
    // di-assign lagi di sini).
    document.querySelectorAll('.sa-gacha-slot-row').forEach((row, i) => {
      const slot = data.config.slots[i];
      if (slot && slot.type === 'shop_item' && slot.itemId) {
        row.querySelector('.sa-gacha-slot-item').value = slot.itemId;
      }
    });
    saUpdateGachaTotalPct();
  } catch (err) {
    console.error('Gagal memuat config gacha:', err);
    list.innerHTML = `<p style="color:#ff6b6b; font-size:12px; text-align:center; padding:20px;">❌ ${err.message}</p>`;
  }
}

async function saSaveGachaConfig() {
  const statusEl = document.getElementById('sa-gacha-status');
  const btn = document.getElementById('sa-gacha-save-btn');
  const spinCost = parseInt(document.getElementById('sa-gacha-spincost').value, 10);

  if (isNaN(spinCost) || spinCost < 0) {
    statusEl.textContent = '⚠️ Biaya spin harus angka >= 0.';
    statusEl.style.color = '#ff6b6b';
    return;
  }

  const rows = document.querySelectorAll('.sa-gacha-slot-row');
  if (rows.length === 0) {
    statusEl.textContent = '⚠️ Minimal harus ada 1 slot hadiah.';
    statusEl.style.color = '#ff6b6b';
    return;
  }

  const slots = [];
  for (const row of rows) {
    const type = row.querySelector('.sa-gacha-slot-type').value;
    const label = row.querySelector('.sa-gacha-slot-label').value.trim();
    const value = parseInt(row.querySelector('.sa-gacha-slot-value').value, 10);
    const itemId = row.querySelector('.sa-gacha-slot-item').value;
    const percentage = parseFloat(row.querySelector('.sa-gacha-slot-pct').value);

    if (!label) {
      statusEl.textContent = '⚠️ Semua slot wajib punya label.';
      statusEl.style.color = '#ff6b6b';
      return;
    }
    if (isNaN(percentage) || percentage < 0) {
      statusEl.textContent = '⚠️ Semua slot wajib punya persentase >= 0.';
      statusEl.style.color = '#ff6b6b';
      return;
    }
    if (['coin_global', 'coin_garden', 'coin_ore'].includes(type) && (isNaN(value) || value < 1)) {
      statusEl.textContent = `⚠️ Slot "${label}" wajib diisi nominal lebih dari 0.`;
      statusEl.style.color = '#ff6b6b';
      return;
    }
    if (type === 'shop_item' && !itemId) {
      statusEl.textContent = `⚠️ Slot "${label}" wajib pilih item Shop.`;
      statusEl.style.color = '#ff6b6b';
      return;
    }

    slots.push({ type, label, value: value || 0, itemId: itemId || null, percentage });
  }

  const totalPct = slots.reduce((a, s) => a + s.percentage, 0);
  if (Math.abs(totalPct - 100) > 0.5) {
    statusEl.textContent = `⚠️ Total persentase harus 100% (sekarang ${totalPct}%).`;
    statusEl.style.color = '#ff6b6b';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Menyimpan...';
  statusEl.style.color = '#718096';

  try {
    const adminToken = saGetAdminToken();
    const res = await fetch('/api/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'admin-set-gacha-config', adminToken, spinCost, slots }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menyimpan config');

    statusEl.textContent = '✅ Config gacha berhasil disimpan.';
    statusEl.style.color = '#00e5c0';
  } catch (err) {
    console.error('Gagal simpan config gacha:', err);
    statusEl.textContent = `❌ Gagal: ${err.message || err}`;
    statusEl.style.color = '#ff6b6b';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan Config Gacha';
  }
}
window.saSaveGachaConfig = saSaveGachaConfig;
