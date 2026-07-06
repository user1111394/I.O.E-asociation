// api/email.js — Simpan username sosmed & generate tag unik I.O.E
// Storage: Upstash Redis (sama seperti auth.js)

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvGet(key) {
  const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const data = await r.json();
  if (data.result === null || data.result === undefined) return null;
  try { return JSON.parse(data.result); } catch (e) { return data.result; }
}

async function kvSet(key, value) {
  const r = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(value)),
  });
  return r.ok;
}

// Pool bracket styles — dipilih random tiap generate tag
const BRACKET_STYLES = [
  ['[', ']'],
  ['(', ')'],
  ['{', '}'],
  ['⌈', '⌋'],
  ['⸢', '⸥'],
  ['⟨', '⟩'],
  ['「', '」'],
  ['『', '』'],
];

function generateIoeTag(nama) {
  const cleanNama = nama.trim().replace(/[\[\](){}⌈⌋⸢⸥⟨⟩「」『』]/g, '');
  const [left, right] = BRACKET_STYLES[Math.floor(Math.random() * BRACKET_STYLES.length)];
  return `${left}I.O.E-${cleanNama}${right}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: 'Storage belum terhubung' });
  }

  const { action } = req.body;

  // ══════════════════════════════════════
  // REGISTER-TAG — Simpan sosmed username & generate tag unik
  // ══════════════════════════════════════
  if (action === 'register-tag') {
    const { memberId, platform, username } = req.body;

    if (!memberId || !platform || !username) {
      return res.status(400).json({ error: 'memberId, platform, username wajib diisi' });
    }

    const validPlatforms = ['tiktok', 'instagram', 'discord', 'twitter'];
    if (!validPlatforms.includes(platform)) {
      return res.status(400).json({ error: 'Platform tidak valid' });
    }

    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (cleanUsername.length < 2) {
      return res.status(400).json({ error: 'Username minimal 2 karakter' });
    }

    try {
      // Ambil data account yang ada
      const account = await kvGet(`account:${memberId}`);
      if (!account) {
        return res.status(404).json({ error: 'Akun tidak ditemukan' });
      }

      // Generate tag unik — pakai nama member + bracket style random
      // Format contoh: [I.O.E-mahiru], (I.O.E-mahiru), {I.O.E-mahiru}, dll
      const specialTag = generateIoeTag(account.nama || cleanUsername);

      // Simpan username sosmed & tag ke account
      account.socialMedia = {
        platform,
        username: cleanUsername,
      };
      account.specialTag = specialTag;
      account.tagCreatedAt = Date.now();

      const saved = await kvSet(`account:${memberId}`, account);
      if (!saved) {
        return res.status(500).json({ error: 'Gagal menyimpan tag, coba lagi' });
      }

      // Simpan juga mapping tag -> memberId buat lookup (opsional, buat cegah duplikat tag)
      await kvSet(`tag:${specialTag}`, memberId);

      return res.status(200).json({
        success: true,
        tag: specialTag,
        platform,
        username: cleanUsername,
      });

    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // GET-TAG — Ambil tag member (untuk display)
  // ══════════════════════════════════════
  if (action === 'get-tag') {
    const { memberId } = req.body;

    if (!memberId) {
      return res.status(400).json({ error: 'memberId diperlukan' });
    }

    try {
      const account = await kvGet(`account:${memberId}`);
      if (!account || !account.specialTag) {
        return res.status(200).json({ tag: null });
      }

      return res.status(200).json({
        tag: account.specialTag,
        platform: account.socialMedia?.platform || null,
        username: account.socialMedia?.username || null,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Action tidak dikenali' });
}
