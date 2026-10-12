/* ═══════════════════════════════════════════════
   I.O.E HUB — SUPERADMIN / event-coin.js
   Kirim & cek koin (event / Ore Coin / Seed Coin)
   Dimuat otomatis oleh js/nav.js (lazy-load) saat panel admin pertama kali dibuka.
   Script klasik (bukan ES module): fungsi & variabel tetap global, jadi onclick="..." di HTML tetap jalan.
═══════════════════════════════════════════════ */

// Kirim koin event ke member tertentu — disimpan di Upstash Redis (bukan Firebase),
// konsisten dengan sistem koin global di shop.js. Key: eventcoin:{eventId}:{memberId}
// Toggle tampilan field event: cuma perlu dipilih kalau jenis koinnya
// "Koin Event" — Ore Coin dan Seed Coin sama-sama tidak terikat event
// manapun (ekosistem terpisah masing-masing: Ore Coin milik Ore Tycoon,
// Seed Coin milik Wild Harvest + Garden — lihat catatan "Ore Coin
// economy" / "Seed Coin economy" di shop.js/tycoon.js).
function saToggleCoinTypeFields() {
  const type = document.getElementById('sa-coin-type-select').value;
  document.getElementById('sa-coin-event-field').style.display = type === 'event' ? 'block' : 'none';
}
window.saToggleCoinTypeFields = saToggleCoinTypeFields;

// Kirim koin ke member tertentu — bercabang jadi 3 endpoint/action
// berbeda tergantung jenis koin yang dipilih:
//   - 'event' -> /api/shop, action 'grant-event-coin' (key Redis:
//     eventcoin:{eventId}:{memberId}, terikat 1 event tertentu)
//   - 'ore'   -> /api/tycoon, action 'grant-ore-coin' (key Redis:
//     orecoins:{memberId}, ekosistem GLOBAL milik Ore Tycoon, TIDAK
//     terikat event manapun — makanya field event disembunyikan untuk
//     pilihan ini)
//   - 'seed'  -> /api/tycoon, action 'grant-seed-coin' (key Redis:
//     seedcoins:{memberId}, ekosistem GLOBAL milik Wild Harvest +
//     Garden, sama seperti Ore Coin — bukan bagian ekonomi Ore Tycoon
//     ataupun koin Shop, dan tidak terikat event manapun juga)
async function saGrantCoin() {
  const coinType = document.getElementById('sa-coin-type-select').value;
  const memberId = document.getElementById('sa-coin-member-id').value.trim();
  const amount = parseInt(document.getElementById('sa-coin-amount').value, 10);
  const statusEl = document.getElementById('sa-coin-status');
  const btn = document.getElementById('sa-coin-submit-btn');

  if (!memberId) {
    statusEl.textContent = '⚠️ Member ID wajib diisi.';
    statusEl.style.color = '#ff6b6b';
    return;
  }
  if (isNaN(amount) || amount < 1) {
    statusEl.textContent = '⚠️ Jumlah koin harus angka lebih dari 0.';
    statusEl.style.color = '#ff6b6b';
    return;
  }

  let eventId = null;
  if (coinType === 'event') {
    eventId = document.getElementById('sa-coin-event-select').value;
    if (!eventId) {
      statusEl.textContent = '⚠️ Pilih event dulu.';
      statusEl.style.color = '#ff6b6b';
      return;
    }
  }

  btn.disabled = true;
  btn.textContent = 'Mengirim...';
  statusEl.style.color = '#718096';

  try {
    const adminToken = saGetAdminToken();
    const endpoint = (coinType === 'ore' || coinType === 'seed') ? '/api/tycoon' : '/api/shop';
    const action = coinType === 'ore' ? 'grant-ore-coin' : coinType === 'seed' ? 'grant-seed-coin' : 'grant-event-coin';
    const body = (coinType === 'ore' || coinType === 'seed')
      ? { action, adminToken, memberId, amount }
      : { action, adminToken, eventId, memberId, amount };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengirim koin');

    const balanceLabel = coinType === 'ore' ? 'Ore Coin' : coinType === 'seed' ? 'Seed Coin' : 'koin event';
    const balanceValue = data.coins ?? data.oreCoins ?? data.seedCoins;
    statusEl.textContent = `✅ Berhasil kirim ${amount} ${balanceLabel}. Saldo sekarang: ${balanceValue}`;
    statusEl.style.color = '#00e5c0';
    document.getElementById('sa-coin-member-id').value = '';
    document.getElementById('sa-coin-amount').value = '';
  } catch (err) {
    console.error('Gagal kirim koin:', err);
    statusEl.textContent = `❌ Gagal: ${err.message || err}`;
    statusEl.style.color = '#ff6b6b';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Kirim Koin';
  }
}
window.saGrantCoin = saGrantCoin;

async function saCheckEventCoin() {
  const eventId = document.getElementById('sa-coin-event-select').value;
  const memberId = document.getElementById('sa-coin-check-member').value.trim();
  const resultEl = document.getElementById('sa-coin-check-result');

  if (!eventId) {
    resultEl.textContent = '⚠️ Pilih event dulu di atas.';
    resultEl.style.color = '#ff6b6b';
    return;
  }
  if (!memberId) {
    resultEl.textContent = '⚠️ Isi Member ID dulu.';
    resultEl.style.color = '#ff6b6b';
    return;
  }

  resultEl.textContent = 'Mengecek...';
  resultEl.style.color = '#718096';

  try {
    const adminToken = saGetAdminToken();
    const res = await fetch('/api/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check-event-coin', adminToken, eventId, memberId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengecek saldo');

    resultEl.textContent = `🪙 Saldo koin event: ${data.coins}`;
    resultEl.style.color = '#cbd5e0';
  } catch (err) {
    console.error('Gagal cek koin event:', err);
    resultEl.textContent = `❌ Gagal: ${err.message || err}`;
    resultEl.style.color = '#ff6b6b';
  }
}
