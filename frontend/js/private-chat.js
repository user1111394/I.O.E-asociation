// ═══════════════════════════════════════════════
// I.O.E HUB — PRIVATE CHAT (1-on-1)
// Pola mengikuti chat.js (public chat): dynamic import Firebase,
// dibungkus DOMContentLoaded supaya tidak race dengan nav.js/ioe-auth.js.
// Tidak butuh API baru — kirim/baca pesan langsung ke Firebase client-side.
// Satu-satunya panggilan ke backend: api/auth.js action "check-username"
// (sudah ada sebelumnya, dipakai untuk validasi user tujuan chat).
// ═══════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    const { getDatabase, ref, push, onValue, serverTimestamp, set, update, get } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');

    // ── CONFIG — sama persis dengan chat.js (public chat), project Cosmos ──
    const firebaseConfig = {
      apiKey:            "AIzaSyA6-_YMSxAWnF1u_Z6k6DCOoEmb3Z82oJM",
      authDomain:        "cosmos-68cbf.firebaseapp.com",
      databaseURL:       "https://cosmos-68cbf-default-rtdb.asia-southeast1.firebasedatabase.app",
      projectId:         "cosmos-68cbf",
      storageBucket:     "cosmos-68cbf.firebasestorage.app",
      messagingSenderId: "749679945131",
      appId:             "1:749679945131:web:36d5355dbe68ecf8a5deee"
    };

    const app = initializeApp(firebaseConfig);
    const db  = getDatabase(app);

    let myMemberId = '';
    let myUsername = '';
    let myNama = '';
    let activeChatId = null;
    let activeOtherUserId = null;
    let msgListenerUnsub = null;

    function escHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    // chatId dibuat dari 2 memberId yang diurutkan (bukan berdasar urutan
    // siapa yang memulai) — supaya chatId antara A↔B selalu sama persis,
    // tidak peduli siapa yang buka chat duluan.
    function makeChatId(idA, idB) {
      return [idA, idB].sort().join('__');
    }

    // ── AUTH: pakai session yang sudah ada dari ioe-auth.js/nav.js ──
    async function requireSession() {
      const session = window.getIoeSession ? window.getIoeSession() : null;
      if (!session) { window.location.href = 'login.html'; return null; }
      const verified = window.verifyIoeSession ? await window.verifyIoeSession() : null;
      if (!verified || verified === 'BANNED') return null;
      return verified;
    }

    const verified = await requireSession();
    if (!verified) return;
    myMemberId = verified.memberId;
    myUsername = verified.username;
    myNama = verified.nama;

    document.getElementById('pc-loading')?.classList.remove('show');
    document.getElementById('pc-list-screen')?.classList.add('active');

    loadChatList();

    // ══════════════════════════════════════
    // LIST CHAT — baca dari userChatIndex/{memberId}
    // ══════════════════════════════════════
    function loadChatList() {
      const indexRef = ref(db, `userChatIndex/${myMemberId}`);
      onValue(indexRef, (snap) => {
        const data = snap.val() || {};
        const listEl = document.getElementById('pc-chat-list');
        const emptyEl = document.getElementById('pc-list-empty');
        if (!listEl) return;

        const chats = Object.entries(data).sort((a, b) => (b[1].lastTimestamp || 0) - (a[1].lastTimestamp || 0));

        if (chats.length === 0) {
          listEl.innerHTML = '';
          if (emptyEl) emptyEl.style.display = 'flex';
          return;
        }
        if (emptyEl) emptyEl.style.display = 'none';

        listEl.innerHTML = chats.map(([chatId, info]) => `
          <button class="pc-chat-item" onclick="window.pcOpenChat('${chatId}','${info.otherUserId}','${escHtml(info.otherUsername)}')">
            <div class="pc-avatar">${escHtml((info.otherUsername || '?')[0].toUpperCase())}</div>
            <div class="pc-chat-item-body">
              <div class="pc-chat-item-top">
                <span class="pc-chat-item-name">${escHtml(info.otherUsername || 'Unknown')}</span>
                ${info.unreadCount ? `<span class="pc-unread-badge">${info.unreadCount}</span>` : ''}
              </div>
              <div class="pc-chat-item-preview">${escHtml(info.lastMessage || '')}</div>
            </div>
          </button>
        `).join('');
      });
    }

    // ══════════════════════════════════════
    // CARI USERNAME — reuse api/auth.js action check-username
    // ══════════════════════════════════════
    window.pcSearchUsername = async function() {
      const input = document.getElementById('pc-search-input');
      const resultEl = document.getElementById('pc-search-result');
      const username = input.value.trim();
      if (!username) return;

      resultEl.innerHTML = '<div class="pc-search-loading">Mencari...</div>';

      try {
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check-username', username }),
        });
        const data = await res.json();

        if (!data.exists) {
          resultEl.innerHTML = '<div class="pc-search-empty">Username tidak ditemukan.</div>';
          return;
        }
        if (data.memberId === myMemberId) {
          resultEl.innerHTML = '<div class="pc-search-empty">Tidak bisa chat dengan diri sendiri.</div>';
          return;
        }

        resultEl.innerHTML = `
          <button class="pc-chat-item" onclick="window.pcOpenChat('${makeChatId(myMemberId, data.memberId)}','${data.memberId}','${escHtml(data.cleanUsername)}')">
            <div class="pc-avatar">${escHtml(data.cleanUsername[0].toUpperCase())}</div>
            <div class="pc-chat-item-body">
              <div class="pc-chat-item-top">
                <span class="pc-chat-item-name">${escHtml(data.nama || data.cleanUsername)}</span>
              </div>
              <div class="pc-chat-item-preview">@${escHtml(data.cleanUsername)} — mulai chat</div>
            </div>
          </button>
        `;
      } catch (e) {
        resultEl.innerHTML = '<div class="pc-search-empty">Gagal mencari, coba lagi.</div>';
        console.error('Gagal cari username:', e);
      }
    };

    // ══════════════════════════════════════
    // BUKA CHAT — dipanggil dari list atau hasil search
    // ══════════════════════════════════════
    window.pcOpenChat = function(chatId, otherUserId, otherUsername) {
      activeChatId = chatId;
      activeOtherUserId = otherUserId;

      document.getElementById('pc-list-screen')?.classList.remove('active');
      document.getElementById('pc-chat-screen')?.classList.add('active');
      document.getElementById('pc-chat-header-name').textContent = otherUsername;
      document.getElementById('pc-messages').innerHTML = '';

      // Reset unread count untuk chat ini di index milik saya
      update(ref(db, `userChatIndex/${myMemberId}/${chatId}`), { unreadCount: 0 }).catch(() => {});

      // Pastikan entry index ada di kedua sisi (kalau ini chat baru)
      get(ref(db, `userChatIndex/${myMemberId}/${chatId}`)).then((snap) => {
        if (!snap.exists()) {
          update(ref(db, `userChatIndex/${myMemberId}/${chatId}`), {
            otherUserId, otherUsername, lastMessage: '', lastTimestamp: Date.now(), unreadCount: 0,
          });
        }
      });

      if (msgListenerUnsub) msgListenerUnsub();
      const msgsRef = ref(db, `privateChats/${chatId}/messages`);
      msgListenerUnsub = onValue(msgsRef, (snap) => {
        const data = snap.val() || {};
        const msgs = Object.entries(data).sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));
        const container = document.getElementById('pc-messages');
        if (!container) return;

        container.innerHTML = msgs.map(([id, m]) => {
          const mine = m.senderId === myMemberId;
          return `<div class="pc-msg ${mine ? 'pc-msg-mine' : 'pc-msg-theirs'}">
            <div class="pc-msg-bubble">${escHtml(m.text || '')}</div>
          </div>`;
        }).join('');
        container.scrollTop = container.scrollHeight;
      });
    };

    window.pcBackToList = function() {
      if (msgListenerUnsub) { msgListenerUnsub(); msgListenerUnsub = null; }
      activeChatId = null;
      activeOtherUserId = null;
      document.getElementById('pc-chat-screen')?.classList.remove('active');
      document.getElementById('pc-list-screen')?.classList.add('active');
    };

    // ══════════════════════════════════════
    // KIRIM PESAN
    // ══════════════════════════════════════
    window.pcSendMessage = function() {
      const input = document.getElementById('pc-msg-input');
      const text = input.value.trim();
      if (!text || !activeChatId) return;
      input.value = '';

      push(ref(db, `privateChats/${activeChatId}/messages`), {
        senderId: myMemberId,
        text,
        ts: serverTimestamp(),
      });

      const now = Date.now();
      // Update index di sisi SAYA (preview + timestamp, tanpa nambah unread
      // karena ini pesan yang saya kirim sendiri)
      update(ref(db, `userChatIndex/${myMemberId}/${activeChatId}`), {
        otherUserId: activeOtherUserId,
        otherUsername: document.getElementById('pc-chat-header-name').textContent,
        lastMessage: text,
        lastTimestamp: now,
      });

      // Update index di sisi LAWAN CHAT (preview + increment unread count)
      const theirIndexRef = ref(db, `userChatIndex/${activeOtherUserId}/${activeChatId}`);
      get(theirIndexRef).then((snap) => {
        const current = snap.val() || {};
        update(theirIndexRef, {
          otherUserId: myMemberId,
          otherUsername: myUsername,
          lastMessage: text,
          lastTimestamp: now,
          unreadCount: (current.unreadCount || 0) + 1,
        });
      });
    };

    window.pcHandleInputKeydown = function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        window.pcSendMessage();
      }
    };

  } catch (err) {
    console.error('Gagal inisialisasi private chat:', err);
    const loadingEl = document.getElementById('pc-loading');
    if (loadingEl) loadingEl.innerHTML = '<div class="pc-search-empty">Gagal memuat chat. Coba refresh halaman.</div>';
  }
}
