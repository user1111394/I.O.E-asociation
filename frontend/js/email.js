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

function generateTagPreview(username) {
  if (!username) return '';
  // Format: ⸢I.O.E⸥{platform}-{username}
  // Atau lebih unik: ⸢I.O.E⸥{username}#{random}
  const cleanUser = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (cleanUser.length < 2) return '';
  
  // Generate random suffix buat uniqueness
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `⸢I.O.E⸥${cleanUser}#${randomSuffix}`;
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
    
    successEl.textContent = `✓ Tag berhasil dibuat: ${data.tag}`;
    successEl.classList.add('show');
    
    // Simpan tag ke session
    session.specialTag = data.tag;
    localStorage.setItem('ioe_account_session', JSON.stringify(session));
    
    // Close modal after 2 seconds
    setTimeout(() => {
      window.close();
      // Atau redirect ke halaman sebelumnya
      // window.history.back();
    }, 2000);
    
  } catch (e) {
    errorEl.textContent = 'Terjadi kesalahan: ' + e.message;
    errorEl.classList.add('show');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Verifikasi & Dapatkan Tag';
  }
});

// Auto-focus input
document.getElementById('usernameInput').focus();
