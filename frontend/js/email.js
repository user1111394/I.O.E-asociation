// frontend/js/email.js — Handle I.O.E tag generation dari username sosmed

let selectedPlatform = 'tiktok';
const platformPrefixes = {
  tiktok: '@',
  instagram: '@',
  discord: '#',
  twitter: '@',
};
const platformLabels = {
  tiktok: 'Username TikTok',
  instagram: 'Username Instagram',
  discord: 'Username Discord',
  twitter: 'Username Twitter',
};

function getSession() {
  try {
    const sess = localStorage.getItem('ioe_account_session');
    return sess ? JSON.parse(sess) : null;
  } catch (e) {
    return null;
  }
}

const BRACKET_STYLES = [
  ['[', ']'], ['(', ')'], ['{', '}'],
  ['⌈', '⌋'], ['⸢', '⸥'], ['⟨', '⟩'],
  ['「', '」'], ['『', '』'],
];

function generateTagPreview(username) {
  if (!username) return '';
  const cleanUser = username.trim().replace(/[^a-zA-Z0-9_]/g, '');
  if (cleanUser.length < 2) return '';

  const session = getSession();
  const nama = session?.nama || cleanUser;
  const [left, right] = BRACKET_STYLES[Math.floor(Math.random() * BRACKET_STYLES.length)];
  return `${left}I.O.E-${nama}${right}`;
}

document.querySelectorAll('.platform-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.platform-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    selectedPlatform = btn.dataset.platform;
    document.getElementById('usernameLabel').textContent = platformLabels[selectedPlatform];
    document.getElementById('inputPrefix').textContent = platformPrefixes[selectedPlatform];
    document.getElementById('usernameInput').value = '';
    document.getElementById('tagPreview').classList.remove('show');
    document.getElementById('errorMsg').classList.remove('show');
  });
});

document.getElementById('usernameInput').addEventListener('input', (e) => {
  const username = e.target.value.trim();
  const errorEl = document.getElementById('errorMsg');
  const previewEl = document.getElementById('tagPreview');
  const tagDisplayEl = document.getElementById('tagDisplay');
  
  errorEl.classList.remove('show');
  
  if (username.length < 2) {
    previewEl.classList.remove('show');
    return;
  }
  
  const tag = generateTagPreview(username);
  if (tag) {
    tagDisplayEl.textContent = tag;
    previewEl.classList.add('show');
  }
});

document.getElementById('copyTagBtn').addEventListener('click', async () => {
  const tagText = document.getElementById('tagDisplay').textContent;
  const btn = document.getElementById('copyTagBtn');
  if (!tagText) return;

  try {
    await navigator.clipboard.writeText(tagText);
    btn.textContent = '✅';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = '📋';
      btn.classList.remove('copied');
    }, 1500);
  } catch (e) {
    // Fallback untuk browser yang tidak support clipboard API
    const textarea = document.createElement('textarea');
    textarea.value = tagText;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    btn.textContent = '✅';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = '📋';
      btn.classList.remove('copied');
    }, 1500);
  }
});

document.getElementById('emailForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const username = document.getElementById('usernameInput').value.trim();
  const submitBtn = document.getElementById('submitBtn');
  const errorEl = document.getElementById('errorMsg');
  const successEl = document.getElementById('successMsg');
  
  errorEl.classList.remove('show');
  successEl.classList.remove('show');
  
  // Validasi
  if (username.length < 2) {
    errorEl.textContent = 'Username minimal 2 karakter';
    errorEl.classList.add('show');
    return;
  }
  const cleanUser = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (cleanUser.length < 2) {
    errorEl.textContent = 'Username hanya boleh huruf, angka, underscore';
    errorEl.classList.add('show');
    return;
  }
  
  const session = getSession();
  if (!session) {
    errorEl.textContent = 'Session tidak ditemukan, silakan login ulang';
    errorEl.classList.add('show');
    return;
  }
  
  submitBtn.disabled = true;
  submitBtn.textContent = 'Memproses...';
  
  try {
    const res = await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'register-tag',
        memberId: session.memberId,
        platform: selectedPlatform,
        username: cleanUser,
      })
    });
    
    const data = await res.json();
    
    if (!data.success) {
      errorEl.textContent = data.error || 'Gagal menyimpan tag, coba lagi';
      errorEl.classList.add('show');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Verifikasi & Dapatkan Tag';
      return;
    }
    
    successEl.textContent = `✓ Tag berhasil dibuat! Silakan disalin:`;
    successEl.classList.add('show');

    // Tampilkan tag final di preview box (sama box yang ada tombol copy)
    document.getElementById('tagDisplay').textContent = data.tag;
    document.getElementById('tagPreview').classList.add('show');

    // Simpan tag ke session
    session.specialTag = data.tag;
    localStorage.setItem('ioe_account_session', JSON.stringify(session));

    submitBtn.textContent = '✓ Tag Berhasil Dibuat';
    submitBtn.disabled = true;

  } catch (e) {
    errorEl.textContent = 'Terjadi kesalahan: ' + e.message;
    errorEl.classList.add('show');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Verifikasi & Dapatkan Tag';
  }
});

// Auto-focus input
document.getElementById('usernameInput').focus();
