import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getDatabase, ref, push, onValue, serverTimestamp, set, onDisconnect, remove }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

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
let onlineMembers = []; // { name, color } — dipakai untuk fitur tag/mention
const COLORS = ['#00c2ff','#7b5cff','#ff3c6e','#ffd166','#00e5c0','#ff9f43','#a29bfe','#fd79a8'];

function randColor() { return COLORS[Math.floor(Math.random() * COLORS.length)]; }

window.handleJoinAction = async function() {
  const session = window.getIoeSession();
  if (!session) { window.location.href = 'login.html'; return; }

  // Verifikasi session ke server + cek status ban (auto-redirect ke ban.html kalau banned)
  const verified = await window.verifyIoeSession();
  if (verified === 'BANNED' || !verified) return; // redirect sudah ditangani oleh verifyIoeSession

  myName = verified.nama;
  myColor = randColor();
  myMemberId = verified.memberId;

  // Register presence — pakai memberId sebagai identitas unik (bukan device fingerprint lagi)
  const presRef = ref(db, 'presence/' + myMemberId);
  myKey = presRef.key || myMemberId;
  set(presRef, { name: myName, color: myColor, memberId: myMemberId, joinedAt: serverTimestamp() });
  onDisconnect(presRef).remove();

  // System message
  push(ref(db, 'messages'), {
    type: 'system', text: `${myName} bergabung ke chat 🌌`,
    ts: serverTimestamp()
  });

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
  push(ref(db, 'messages'), {
    type: 'msg', name: myName, color: myColor, memberId: myMemberId,
    text: txt, ts: serverTimestamp()
  });
};

window.sendReaction = function(emoji) {
  hideReactBar();
  push(ref(db, 'messages'), {
    type: 'reaction', name: myName, color: myColor, memberId: myMemberId,
    text: emoji, ts: serverTimestamp()
  });
};

// Listen messages
const msgsRef = ref(db, 'messages');
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
  // new msg dot
  if (loaded && document.getElementById('tab-chat') && !document.getElementById('tab-chat').classList.contains('active')) {
    document.getElementById('chatDot').classList.add('show');
  }
  loaded = true;
});

// Listen presence (online count)
onValue(ref(db, 'presence'), snap => {
  const count = snap.val() ? Object.keys(snap.val()).length : 0;
  document.getElementById('onlineCount').textContent = count;
  document.getElementById('liveCount').textContent = count;

  // Update list member online untuk fitur tag/mention
  onlineMembers = snap.val() ? Object.values(snap.val()) : [];

  // Render member list
  const list = document.getElementById('memberList');
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
});

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Highlight @Nama dalam pesan (dipanggil setelah escHtml, jadi tetap aman dari XSS)
function highlightTags(escapedText) {
  return escapedText.replace(/@([A-Za-z0-9_]{2,20})/g, '<span class="chat-tag">@$1</span>');
}

window.switchTab = function(screenId, btnEl) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tt-tab').forEach(b => b.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
  btnEl?.classList.add('active');
  if (screenId === 'chatScreen') document.getElementById('chatDot').classList.remove('show');
};

window.focusInput = function() {
  switchTab('chatScreen', document.getElementById('tab-chat'));
  setTimeout(() => document.getElementById('chatInp')?.focus(), 100);
};

// Enter key
document.getElementById('chatInp')?.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.sendMsg(); }
});
document.getElementById('chatInp')?.addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 100) + 'px';
});

// Reaction bar on long press
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
function hideReactBar() { document.getElementById('reactBar').classList.remove('show'); }

// ══ BAN CHECK SEBELUM AKSES CHAT (via sistem akun, bukan device fingerprint) ══
(async function() {
  const session = window.getIoeSession();
  if (session) {
    const verified = await window.verifyIoeSession(); // auto-redirect ke ban.html kalau banned
    if (verified === 'BANNED') return;
  }
  document.getElementById('banCheckOverlay').style.display = 'none';
})();

// ══ FITUR TAG/MENTION MEMBER (@nama) ══
let mentionActiveIndex = -1;
let mentionMatches = [];
let mentionStartPos = -1;

function getMentionQuery(text, cursorPos) {
  // Cari '@' terakhir sebelum posisi kursor yang belum diikuti spasi
  const beforeCursor = text.slice(0, cursorPos);
  const atIndex = beforeCursor.lastIndexOf('@');
  if (atIndex === -1) return null;
  const afterAt = beforeCursor.slice(atIndex + 1);
  if (/\s/.test(afterAt)) return null; // sudah ada spasi setelah @, bukan sedang mengetik tag
  return { query: afterAt.toLowerCase(), start: atIndex };
}

function renderMentionDropdown(query) {
  const dropdown = document.getElementById('mentionDropdown');
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
  document.getElementById('mentionDropdown').classList.remove('show');
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
  const cleanName = member.name.replace(/\s/g, '_'); // tag tanpa spasi biar regex highlight kena
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
  if (!document.getElementById('mentionDropdown').classList.contains('show')) return;
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
    selectMention(mentionActiveIndex);
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

// ══ INIT JOIN SCREEN — dipanggil paling akhir, setelah semua fungsi di atas siap ══
(function initJoinScreen() {
  const session = window.getIoeSession();
  const subEl = document.getElementById('joinSub');
  const btnEl = document.getElementById('joinActionBtn');
  if (!subEl || !btnEl) return;

  if (!session) {
    subEl.innerHTML = 'Kamu perlu login dengan akun I.O.E resmi untuk bergabung ke chat.';
    btnEl.textContent = 'Login Dulu →';
    btnEl.onclick = () => { window.location.href = 'login.html'; };
  } else {
    subEl.innerHTML = `Masuk sebagai <strong>${escHtml(session.nama)}</strong><br>Chat real-time tentang astronomi & sejarah!`;
    btnEl.textContent = 'Masuk ke Chat →';
    btnEl.onclick = window.handleJoinAction;
  }
})();
