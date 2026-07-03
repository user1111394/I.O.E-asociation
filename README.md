# I.O.E HUB v2.0
**International Organization of Education**

## Struktur Project
```
ioe-hub/
├── frontend/
│   ├── index.html          ← Home + loading screen
│   ├── cosmos.html         ← Cosmos AI chatbot
│   ├── education.html      ← NASA APOD, ISS, Planet, Timeline
│   ├── tools.html          ← Konverter, Space Facts, Search
│   ├── login.html          ← Login akun member resmi
│   ├── seleksi.html        ← Form pendaftaran + member card
│   ├── boardingpass.html   ← Boarding pass + character search
│   ├── chat.html           ← Chat publik (TikTok-style)
│   ├── admin-ioe-secure.html ← Panel admin (ganti nama sebelum deploy!)
│   ├── astromodels.html    ← 3D Explorer planet
│   ├── assets/
│   │   └── logo.png        ← Logo I.O.E
│   ├── css/
│   │   └── global.css      ← Shared styles
│   └── js/
│       ├── nav.js          ← Shared navigation
│       ├── device.js       ← Device fingerprint (sistem lama)
│       └── ioe-auth.js     ← Shared session/login helper
├── api/
│   ├── ai.js               ← Groq AI proxy
│   ├── nasa.js             ← NASA APOD proxy
│   ├── iss.js              ← ISS tracker proxy
│   ├── imgsearch.js        ← Google Image Search proxy
│   ├── member.js           ← Firebase member registration (lama)
│   ├── auth.js             ← Sistem akun resmi: register/login/verify session
│   ├── ban.js              ← Ban device (sistem lama)
│   ├── checkban.js         ← Cek status ban
│   ├── admin-token.js      ← Generate token admin
│   ├── findmember.js       ← Cari member
│   └── cron-cleanup.js     ← Auto-hapus chat lama (cron job)
├── vercel.json
└── package.json
```

---

## CARA DEPLOY KE VERCEL

### 1. Push ke GitHub
```bash
git init
git add .
git commit -m "I.O.E Hub v2.0"
git remote add origin https://github.com/USERNAME/ioe-hub.git
git push -u origin main
```

### 2. Import ke Vercel
1. Buka [vercel.com](https://vercel.com) → New Project
2. Import repo GitHub kamu
3. Framework Preset: **Other**
4. Root Directory: `/` (default)
5. Deploy!

### 3. Set Environment Variables di Vercel
Buka **Settings → Environment Variables** dan tambahkan:

| Key | Value | Keterangan |
|-----|-------|------------|
| `GROQ_API_KEY` | `gsk_xxx...` | Dari [console.groq.com](https://console.groq.com) |
| `NASA_API_KEY` | `YOUR_KEY` | Dari [api.nasa.gov](https://api.nasa.gov) (gratis) |
| `GOOGLE_CSE_KEY` | `AIza...` | Dari Google Cloud Console (Custom Search API) |
| `GOOGLE_CSE_ID` | `xxx:yyy` | Dari [programmablesearchengine.google.com](https://programmablesearchengine.google.com) |
| `FIREBASE_DB_URL` | `https://cosmos-68cbf-default-rtdb.asia-southeast1.firebasedatabase.app` | Sudah terisi — project "Cosmos public" |
| `FIREBASE_DB_SECRET` | `xxx` | Firebase DB secret (optional, untuk write access) |
| `ADMIN_MASTER_KEY` | `(buat sendiri, rahasia)` | Kunci rahasia untuk generate token admin baru |
| `CRON_SECRET` | `(buat sendiri, opsional)` | Mengamankan endpoint cron cleanup dari akses luar |

---

## AUTO-CLEANUP CHAT (3 HARI)

Pesan chat publik otomatis terhapus setelah **3 hari** lewat Vercel Cron Job yang jalan setiap hari jam 01:00 WIB (`18:00 UTC`).

- Jadwal diatur di `vercel.json` bagian `crons`
- Logic penghapusan ada di `api/cron-cleanup.js`
- **Catatan**: fitur Cron Jobs di Vercel butuh plan **Pro** (berbayar) untuk jadwal custom; di plan **Hobby (gratis)** cron hanya bisa jalan max 1x per hari, yang sudah sesuai dengan setup ini
- Opsional: set `CRON_SECRET` di environment variables untuk mencegah orang lain memicu endpoint ini secara manual

---

## SISTEM ADMIN & BAN

Akses panel admin lewat URL khusus (tidak ada link publik ke halaman ini):
```
https://domainmu.vercel.app/admin-ioe-secure.html
```

**Cara dapat token admin pertama kali:**
1. Set `ADMIN_MASTER_KEY` di Vercel env vars (buat password rahasia sendiri)
2. Buka halaman admin → bagian "Generate Token Baru" → masukkan master key
3. Token yang dihasilkan berlaku 7 hari, simpan baik-baik
4. Admin yang sudah punya token bisa generate token baru kapan saja untuk admin lain (asal tau master key)

**Cara kerja sistem ban:**
- Device fingerprint dibuat otomatis dari karakteristik browser (canvas, user agent, dll) — disimpan di localStorage sebagai `ioe_device_id`
- Saat admin ban seseorang, yang diblokir adalah **device ID**, bukan nama — jadi user yang di-ban tidak bisa masuk lagi walau ganti nama
- Sistem juga mencegah 2 device berbeda memakai nama yang sama di chat (anti-duplikat username)
- Ban berlaku di seluruh halaman web (dicek otomatis saat membuka chat.html)

**PENTING**: Sebaiknya ganti nama file `admin-ioe-secure.html` ke sesuatu yang lebih unik/rahasia sebelum deploy, supaya tidak mudah ditebak orang lain.

---

## SETUP FIREBASE (untuk Chat & Member)

1. Buka [console.firebase.google.com](https://console.firebase.google.com)
2. Buat project baru
3. Enable **Realtime Database** → Start in test mode
4. Copy config ke `frontend/chat.html` (bagian `firebaseConfig`)
5. Rules untuk Realtime Database:
```json
{
  "rules": {
    "messages": {
      ".read": true,
      ".write": true
    },
    "presence": {
      ".read": true,
      ".write": true
    },
    "members": {
      ".read": true,
      ".write": true
    },
    "name_devices": {
      ".read": true,
      ".write": true
    },
    "bans": {
      ".read": true,
      ".write": true
    },
    "admin_tokens": {
      ".read": true,
      ".write": true
    }
  }
}
```

---

## SETUP GOOGLE CUSTOM SEARCH (untuk Character Search)

1. Buka [console.cloud.google.com](https://console.cloud.google.com)
2. Enable **Custom Search API**
3. Buat API Key → copy ke `GOOGLE_CSE_KEY`
4. Buka [programmablesearchengine.google.com](https://programmablesearchengine.google.com)
5. Buat search engine baru:
   - ✅ Search the entire web
   - ✅ Image search ON
6. Copy **Search Engine ID** → ke `GOOGLE_CSE_ID`

> **Gratis**: 100 queries/hari. Upgrade $5/1000 queries jika butuh lebih.

---

## LOGO & ASSETS
Taruh file logo di `frontend/assets/logo.png`
Ukuran ideal: **200x200px** atau **400x400px** PNG transparan.

---

## HALAMAN-HALAMAN
| Halaman | URL | Fitur |
|---------|-----|-------|
| Home | `/` | Landing, navigasi utama |
| Cosmos AI | `/cosmos.html` | Chatbot AI astronomi & sejarah |
| Education Hub | `/education.html` | NASA APOD, ISS, Planet, Timeline |
| 3D Explorer | `/astromodels.html` | Model 3D planet interaktif + cari objek |
| Space Tools | `/tools.html` | Konverter, facts, pencarian |
| Login | `/login.html` | Login akun member resmi (username + password) |
| Pendaftaran | `/seleksi.html` | Form 6-step + member card |
| Boarding Pass | `/boardingpass.html` | Boarding pass + character search |
| Chat Publik | `/chat.html` | Real-time chat TikTok-style + ban check |
| Admin Panel | `/admin-ioe-secure.html` | Login token + manajemen ban (rahasia, ganti nama file!) |
