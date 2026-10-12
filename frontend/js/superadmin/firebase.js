/* ═══════════════════════════════════════════════
   I.O.E HUB — SUPERADMIN / firebase.js
   Koneksi Firebase untuk Chat Publik & Event (dipakai modul event/broadcast)
   Dimuat otomatis oleh js/nav.js (lazy-load) saat panel admin pertama kali dibuka.
   Script klasik (bukan ES module): fungsi & variabel tetap global, jadi onclick="..." di HTML tetap jalan.
═══════════════════════════════════════════════ */

// ═══ CHAT PUBLIK (Firebase terpisah dari Event — project cosmos-68cbf) ═══
// Dipakai khusus untuk aksi maintenance admin (hapus riwayat chat publik).
const CHAT_FIREBASE_CONFIG = {
  apiKey:            "AIzaSyA6-_YMSxAWnF1u_Z6k6DCOoEmb3Z82oJM",
  authDomain:        "cosmos-68cbf.firebaseapp.com",
  databaseURL:       "https://cosmos-68cbf-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "cosmos-68cbf",
  storageBucket:     "cosmos-68cbf.firebasestorage.app",
};

let _chatApp = null, _chatDb = null;

async function saGetChatFirebase() {
  if (_chatApp) return { app: _chatApp, db: _chatDb };
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
  const { getDatabase } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');

  _chatApp = initializeApp(CHAT_FIREBASE_CONFIG, 'chatApp');
  _chatDb = getDatabase(_chatApp);
  return { app: _chatApp, db: _chatDb };
}

async function saClearPublicChat() {
  const roomId = document.getElementById('sa-chat-room-select')?.value;
  const statusEl = document.getElementById('sa-chat-clear-status');
  if (!roomId) return;

  if (!confirm(`Hapus SELURUH riwayat pesan di Room ${roomId}? Aksi ini tidak bisa dibatalkan.`)) return;

  if (statusEl) { statusEl.textContent = 'Menghapus...'; statusEl.style.color = '#ffd23f'; }

  try {
    const { db } = await saGetChatFirebase();
    const { ref, remove } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
    await remove(ref(db, `rooms/${roomId}/messages`));

    if (statusEl) { statusEl.textContent = `✅ Riwayat Room ${roomId} berhasil dihapus.`; statusEl.style.color = '#00e5c0'; }
  } catch (e) {
    if (statusEl) { statusEl.textContent = `⚠️ Gagal menghapus: ${e.message}`; statusEl.style.color = '#ff6b6b'; }
  }
}

// ═══ EVENT SYSTEM (Firebase terpisah — isi config di bawah) ═══
// GANTI config ini dengan project Firebase BARU yang khusus buat data Event,
// supaya terpisah dari Firebase chat (cosmos-68cbf).
// Catatan: cuma perlu Realtime Database di sini — file event disimpan di Vercel Blob,
// bukan Firebase Storage, jadi tidak perlu Storage aktif di project baru ini.
const EVENT_FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCvIFCwWaH7r8i-8AeqTK2jE5YjMcBhJsg",
  authDomain:        "storage-event-a5d18.firebaseapp.com",
  databaseURL:       "https://storage-event-a5d18-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "storage-event-a5d18",
  messagingSenderId: "432915436521",
  appId:             "1:432915436521:web:384ff16175eb45e46c3178"
};

let _eventApp = null, _eventDb = null;

async function saGetEventFirebase() {
  if (_eventApp) return { app: _eventApp, db: _eventDb };
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
  const { getDatabase, ref, get, set, remove } =
    await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');

  _eventApp = initializeApp(EVENT_FIREBASE_CONFIG, 'eventApp');
  _eventDb = getDatabase(_eventApp);

  window._eventDbFns = { ref, get, set, remove };

  return { app: _eventApp, db: _eventDb };
}
