// js/ai-auth.js — Gerbang akun untuk halaman yang memakai /api/ai (Cosmos AI).
// Pasang dengan SATU baris di <head> halaman, sebelum script lain:   <script src="js/ai-auth.js"></script>
//
// Yang dilakukan:
//  1) Menyisipkan memberId + sessionToken (dari localStorage 'ioe_account_session') ke SETIAP permintaan
//     POST ke /api/ai, jadi kode halaman tidak perlu diubah.
//  2) Belum login -> layar "Masuk / Daftar" langsung menutup halaman. Server menolak (sesi tidak berlaku,
//     akun dibatasi) -> layar yang sesuai.
// Penegakan sebenarnya ada di SERVER (api/ai.js: requireMember). Skrip ini hanya untuk pengalaman pengguna;
// menghapusnya tidak membuka akses. Permintaan action 'chat-history' tidak diubah (sudah membawa sesi sendiri).
(function () {
  if (window.__ioeAiAuth) return;
  window.__ioeAiAuth = true;

  var SESSION_KEY = 'ioe_account_session';
  var TEXT = {
    LOGIN_REQUIRED: ['Khusus Member', 'Cosmos AI hanya bisa dipakai setelah masuk. Masuk atau daftar akun I.O.E dulu ya.', true],
    SESSION_INVALID: ['Sesi Berakhir', 'Sesi loginmu sudah tidak berlaku (mungkin kamu masuk di perangkat lain). Silakan masuk lagi.', true],
    BANNED: ['Akun Dibatasi', 'Akunmu sedang dibatasi, jadi AI tidak bisa dipakai.', false],
    AUTH_UNAVAILABLE: ['Layanan Akun Gangguan', 'Server belum bisa memeriksa akunmu. Muat ulang halaman sebentar lagi.', false],
  };

  function getSession() {
    try {
      var s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      return s && s.memberId && s.sessionToken ? s : null;
    } catch (e) { return null; }
  }

  function showGate(code) {
    var t = TEXT[code] || TEXT.LOGIN_REQUIRED;
    var root = document.getElementById('ioeAiGate');
    if (!root) {
      root = document.createElement('div');
      root.id = 'ioeAiGate';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(5,8,20,.94);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;';
      var box = document.createElement('div');
      box.style.cssText = 'max-width:420px;width:100%;text-align:center;background:#101a2e;color:#e8eef5;border:1px solid #2a3a5d;border-radius:14px;padding:26px 22px;box-shadow:0 10px 40px rgba(0,0,0,.6);';
      var h = document.createElement('div'); h.id = 'ioeAiGateTitle'; h.style.cssText = 'font-size:1.2rem;font-weight:800;margin-bottom:10px;';
      var p = document.createElement('div'); p.id = 'ioeAiGateMsg'; p.style.cssText = 'line-height:1.6;margin-bottom:18px;color:#c3cfe0;';
      var a = document.createElement('a'); a.id = 'ioeAiGateBtn'; a.href = 'login.html'; a.target = '_top'; a.textContent = 'Masuk / Daftar';
      a.style.cssText = 'display:inline-block;padding:12px 24px;border-radius:999px;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;';
      box.appendChild(h); box.appendChild(p); box.appendChild(a); root.appendChild(box);
      (document.body || document.documentElement).appendChild(root);
    }
    document.getElementById('ioeAiGateTitle').textContent = t[0];
    document.getElementById('ioeAiGateMsg').textContent = t[1];
    document.getElementById('ioeAiGateBtn').style.display = t[2] ? 'inline-block' : 'none';
    root.style.display = 'flex';
  }

  function isAiRequest(input) {
    try {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      return new URL(url, location.href).pathname === '/api/ai';
    } catch (e) { return false; }
  }

  var origFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    if (!isAiRequest(input) || !init || typeof init.body !== 'string') return origFetch(input, init);
    var body;
    try { body = JSON.parse(init.body); } catch (e) { return origFetch(input, init); }
    if (!body || typeof body !== 'object' || body.action === 'chat-history') return origFetch(input, init);

    var sess = getSession();
    if (!sess) {
      showGate('LOGIN_REQUIRED');
      // Respons 401 sintetis dengan bentuk yang sama dengan server, supaya penanganan galat halaman tetap jalan
      return new Response(JSON.stringify({ error: 'Belum login. Masuk atau daftar akun dulu untuk memakai AI.', code: 'LOGIN_REQUIRED' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    if (!body.memberId) body.memberId = sess.memberId;
    if (!body.sessionToken) body.sessionToken = sess.sessionToken;
    var next = {};
    for (var k in init) next[k] = init[k];
    next.body = JSON.stringify(body);

    var res = await origFetch(input, next);
    if (!res.ok && (res.status === 401 || res.status === 403 || res.status === 503)) {
      try {
        var d = await res.clone().json();
        if (d && TEXT[d.code]) {
          if (d.code === 'SESSION_INVALID' || d.code === 'LOGIN_REQUIRED') { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }
          showGate(d.code);
        }
      } catch (e) { /* bukan JSON: biarkan halaman menanganinya */ }
    }
    return res;
  };

  function boot() { if (!getSession()) showGate('LOGIN_REQUIRED'); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
