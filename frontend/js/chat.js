// ═══════════════════════════════════════════════
// I.O.E HUB — CHAT PUBLIK
// Dibungkus DOMContentLoaded + dynamic import supaya tidak ada race condition
// dengan ioe-auth.js / nav.js, dan error tidak gagal diam-diam.
// ═══════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    const { getDatabase, ref, push, onValue, serverTimestamp, set, onDisconnect, remove } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');

    // ── CONFIG — Project: Cosmos public ──
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

    let myName = '';
    let myColor = '';
    let myKey  = '';
    let myMemberId = '';
    let myRoomId = 1; // default fallback room 1, diisi asli dari api/assign-room
    let onlineMembers = [];
    const COLORS = ['#00c2ff','#7b5cff','#ff3c6e','#ffd166','#00e5c0','#ff9f43','#a29bfe','#fd79a8'];

    function randColor() { return COLORS[Math.floor(Math.random() * COLORS.length)]; }

    function escHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function highlightTags(escapedText) {
      return escapedText.replace(/@([A-Za-z0-9_]{2,20})/g, '<span class="chat-tag">@$1</span>');
    }

    window.handleJoinAction = async function() {
      const session = window.getIoeSession();
      if (!session) { window.location.href = 'login.html'; return; }

      const verified = await window.verifyIoeSession();
      if (verified === 'BANNED' || !verified) return;

      myName = verified.nama;
      myColor = randColor();
      myMemberId = verified.memberId;

      // ── Ambil roomId dari assign-room sebelum join ──
      try {
        const assignRes = await fetch('/api/assign-room');
        const assignData = await assignRes.json();
        myRoomId = assignData.roomId || 1;
      } catch (e) {
        console.error('Gagal assign room, fallback ke room 1:', e);
        myRoomId = 1;
      }

      const presRef = ref(db, `rooms/${myRoomId}/presence/` + myMemberId);
      myKey = presRef.key || myMemberId;
      set(presRef, { name: myName, color: myColor, memberId: myMemberId, joinedAt: serverTimestamp() });
      onDisconnect(presRef).remove();

      push(ref(db, `rooms/${myRoomId}/messages`), {
        type: 'system', text: `${myName} bergabung ke chat 🌌`,
        ts: serverTimestamp()
      });

      startRoomListeners();

      document.getElementById('myBadge').textContent = myName;
      document.getElementById('joinScreen').classList.remove('active');
      document.getElementById('chatScreen').classList.add('active');
      document.getElementById('ttBar').style.display = 'flex';
      document.getElementById('tab-chat').classList.add('active');
      document.getElementById('chatDot').classList.remove('show');
    };

    window.sendMsg = function() {
      const ta = document.getElementById('chatInp');
      const txt = ta.value.trim();
      if (!txt || !myName) return;
      ta.value = ''; ta.style.height = 'auto';
      push(ref(db, `rooms/${myRoomId}/messages`), {
        type: 'msg', name: myName, color: myColor, memberId: myMemberId,
        text: txt, ts: serverTimestamp()
      });
    };

    window.sendReaction = function(emoji) {
      hideReactBar();
      push(ref(db, `rooms/${myRoomId}/messages`), {
        type: 'reaction', name: myName, color: myColor, memberId: myMemberId,
        text: emoji, ts: serverTimestamp()
      });
    };

    // Listen messages & presence — dipanggil setelah myRoomId didapat dari assign-room
    function startRoomListeners() {
      const msgsRef = ref(db, `rooms/${myRoomId}/messages`);
      let loaded = false;
      onValue(msgsRef, snap => {
        const area = document.getElementById('msgArea');
        const data = snap.val();
        if (!data) return;
        const msgs = Object.values(data);
        const toShow = msgs.slice(-150);
        area.innerHTML = '';
        toShow.forEach(m => {
          if (m.type === 'system' || m.type === 'reaction') {
            const el = document.createElement('div');
            el.className = 'sys-msg';
            el.textContent = m.type === 'reaction'
              ? `${m.name} bereaksi ${m.text}`
              : m.text;
            area.appendChild(el);
          } else if (m.type === 'msg') {
            const isMe = m.name === myName;
            const wrap = document.createElement('div');
            wrap.className = 'chat-msg ' + (isMe ? 'me' : 'other');
            const initials = m.name.charAt(0).toUpperCase();
            const ts = m.ts ? new Date(m.ts).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}) : '';
            wrap.innerHTML = `
              <div class="chat-avi" style="background:${m.color}20;border:1px solid ${m.color}40;color:${m.color}">${initials}</div>
              <div class="chat-msg-body">
                <div class="chat-sender" style="color:${m.color}">${m.name}</div>
                <div class="chat-bubble">${highlightTags(escHtml(m.text))}</div>
                <div class="chat-time">${ts}</div>
              </div>`;
            area.appendChild(wrap);
          }
        });
        area.scrollTop = area.scrollHeight;
        if (loaded && document.getElementById('tab-chat') && !document.getElementById('tab-chat').classList.contains('active')) {
          document.getElementById('chatDot').classList.add('show');
        }
        loaded = true;
      }, (error) => {
        console.error('Gagal memuat pesan chat:', error);
        const area = document.getElementById('msgArea');
        if (area) area.innerHTML = '<div class="sys-msg">Gagal memuat pesan. Coba refresh halaman.</div>';
      });

      // Listen presence (online count + member list)
      onValue(ref(db, `rooms/${myRoomId}/presence`), snap => {
        const count = snap.val() ? Object.keys(snap.val()).length : 0;
        const onlineCountEl = document.getElementById('onlineCount');
        const liveCountEl = document.getElementById('liveCount');
        if (onlineCountEl) onlineCountEl.textContent = count;
        if (liveCountEl) liveCountEl.textContent = count;

        onlineMembers = snap.val() ? Object.values(snap.val()) : [];

        const list = document.getElementById('memberList');
        if (!list) return;
        if (!snap.val()) { list.innerHTML = '<div class="sys-msg">Belum ada member online</div>'; return; }
        list.innerHTML = '';
        Object.values(snap.val()).forEach(m => {
          const item = document.createElement('div');
          item.className = 'member-item';
          item.innerHTML = `
            <div class="member-avi" style="background:${m.color}20;color:${m.color};border:1px solid ${m.color}40">
              ${m.name.charAt(0).toUpperCase()}
            </div>
            <div class="member-name">${escHtml(m.name)}</div>
            <div class="member-online"><span class="online-dot"></span>Online</div>
          `;
          list.appendChild(item);
        });
      }, (error) => {
        console.error('Gagal memuat daftar member:', error);
        const list = document.getElementById('memberList');
        if (list) list.innerHTML = '<div class="sys-msg">Gagal memuat member. Coba refresh halaman.</div>';
      });
    }

    window.switchTab = function(screenId, btnEl) {
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      document.querySelectorAll('.tt-tab').forEach(b => b.classList.remove('active'));
      document.getElementById(screenId).classList.add('active');
      btnEl?.classList.add('active');
      if (screenId === 'chatScreen') document.getElementById('chatDot').classList.remove('show');
    };

    window.focusInput = function() {
      window.switchTab('chatScreen', document.getElementById('tab-chat'));
      setTimeout(() => document.getElementById('chatInp')?.focus(), 100);
    };

    document.getElementById('chatInp')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.sendMsg(); }
    });
    document.getElementById('chatInp')?.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });

    let longPressTimer;
    document.getElementById('msgArea')?.addEventListener('touchstart', e => {
      const bubble = e.target.closest('.chat-bubble');
      if (!bubble) return;
      longPressTimer = setTimeout(() => showReactBar(e.touches[0].clientY), 600);
    }, {passive:true});
    document.getElementById('msgArea')?.addEventListener('touchend', () => clearTimeout(longPressTimer));
    document.addEventListener('click', e => {
      if (!e.target.closest('.react-bar')) hideReactBar();
    });
    function showReactBar(y) {
      const bar = document.getElementById('reactBar');
      bar.classList.add('show');
      bar.style.left = '50%'; bar.style.transform = 'translateX(-50%)';
      const top = Math.min(y - 60, window.innerHeight - 80);
      bar.style.top = top + 'px'; bar.style.bottom = 'auto';
    }
    function hideReactBar() { document.getElementById('reactBar')?.classList.remove('show'); }

    // ── Ban check ──
    (async function() {
      const session = window.getIoeSession();
      if (session) {
        const verified = await window.verifyIoeSession();
        if (verified === 'BANNED') return;
      }
      const overlay = document.getElementById('banCheckOverlay');
      if (overlay) overlay.style.display = 'none';
    })();

    // ── Fitur tag/mention member (@nama) ──
    let mentionActiveIndex = -1;
    let mentionMatches = [];
    let mentionStartPos = -1;

    function getMentionQuery(text, cursorPos) {
      const beforeCursor = text.slice(0, cursorPos);
      const atIndex = beforeCursor.lastIndexOf('@');
      if (atIndex === -1) return null;
      const afterAt = beforeCursor.slice(atIndex + 1);
      if (/\s/.test(afterAt)) return null;
      return { query: afterAt.toLowerCase(), start: atIndex };
    }

    function renderMentionDropdown(query) {
      const dropdown = document.getElementById('mentionDropdown');
      if (!dropdown) return;
      const matches = onlineMembers
        .filter(m => m.name && m.name.toLowerCase().includes(query) && m.name !== myName)
        .slice(0, 6);
      mentionMatches = matches;
      mentionActiveIndex = matches.length ? 0 : -1;

      if (!matches.length) {
        dropdown.innerHTML = '<div class="mention-empty">Tidak ada member dengan nama itu</div>';
        dropdown.classList.add('show');
        return;
      }

      dropdown.innerHTML = matches.map((m, i) => `
        <div class="mention-item ${i === 0 ? 'active' : ''}" data-idx="${i}" onclick="selectMention(${i})">
          <div class="mention-avi" style="background:${m.color}20;color:${m.color};border:1px solid ${m.color}40">
            ${m.name.charAt(0).toUpperCase()}
          </div>
          <div class="mention-name">${escHtml(m.name)}</div>
        </div>
      `).join('');
      dropdown.classList.add('show');
    }

    function hideMentionDropdown() {
      document.getElementById('mentionDropdown')?.classList.remove('show');
      mentionMatches = []; mentionActiveIndex = -1; mentionStartPos = -1;
    }

    window.selectMention = function(idx) {
      const member = mentionMatches[idx];
      if (!member) return;
      const ta = document.getElementById('chatInp');
      const text = ta.value;
      const cursorPos = ta.selectionStart;
      const info = getMentionQuery(text, cursorPos);
      if (!info) return;
      const before = text.slice(0, info.start);
      const after = text.slice(cursorPos);
      const cleanName = member.name.replace(/\s/g, '_');
      const newText = `${before}@${cleanName} ${after}`;
      ta.value = newText;
      const newCursorPos = before.length + cleanName.length + 2;
      ta.setSelectionRange(newCursorPos, newCursorPos);
      hideMentionDropdown();
      ta.focus();
    };

    document.getElementById('chatInp')?.addEventListener('input', e => {
      const ta = e.target;
      const info = getMentionQuery(ta.value, ta.selectionStart);
      if (info) {
        mentionStartPos = info.start;
        renderMentionDropdown(info.query);
      } else {
        hideMentionDropdown();
      }
    });

    document.getElementById('chatInp')?.addEventListener('keydown', e => {
      const dropdown = document.getElementById('mentionDropdown');
      if (!dropdown || !dropdown.classList.contains('show')) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        mentionActiveIndex = Math.min(mentionActiveIndex + 1, mentionMatches.length - 1);
        updateMentionActiveUI();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        mentionActiveIndex = Math.max(mentionActiveIndex - 1, 0);
        updateMentionActiveUI();
      } else if (e.key === 'Enter' && mentionMatches.length) {
        e.preventDefault();
        window.selectMention(mentionActiveIndex);
      } else if (e.key === 'Escape') {
        hideMentionDropdown();
      }
    });

    function updateMentionActiveUI() {
      document.querySelectorAll('.mention-item').forEach((el, i) => {
        el.classList.toggle('active', i === mentionActiveIndex);
      });
    }

    document.addEventListener('click', e => {
      if (!e.target.closest('.mention-dropdown') && !e.target.closest('#chatInp')) {
        hideMentionDropdown();
      }
    });

    // ── Init join screen (paling akhir, semua fungsi sudah siap) ──
    const session = window.getIoeSession();
    const subEl = document.getElementById('joinSub');
    const btnEl = document.getElementById('joinActionBtn');
    if (subEl && btnEl) {
      if (!session) {
        subEl.innerHTML = 'Kamu perlu login dengan akun I.O.E resmi untuk bergabung ke chat.';
        btnEl.textContent = 'Login Dulu →';
        btnEl.onclick = () => { window.location.href = 'login.html'; };
      } else {
        subEl.innerHTML = `Masuk sebagai <strong>${escHtml(session.nama)}</strong><br>Chat real-time tentang astronomi & sejarah!`;
        btnEl.textContent = 'Masuk ke Chat →';
        btnEl.onclick = window.handleJoinAction;
      }
    }

  } catch (err) {
    console.error('Chat gagal dimuat:', err);
    const joinSub = document.getElementById('joinSub');
    if (joinSub) joinSub.innerHTML = '⚠️ Gagal memuat chat. Silakan refresh halaman.<br><small>' + escHtmlSafe(err.message) + '</small>';
  }
}

function escHtmlSafe(s) {
  const div = document.createElement('div');
  div.textContent = String(s);
  return div.innerHTML;
}
