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

// ── Gaya kurung/simbol untuk tag I.O.E ──
// Kategori 1: Kurung ASIMETRIS (kiri ≠ kanan, benar-benar "membuka-menutup")
// → dipakai untuk format B: [I.O.E-nama]  (nama ikut di dalam kurung)
// PENTING: array ini harus identik dengan BRACKET_STYLES_PAIR di
// frontend/js/email.js supaya preview & tag final konsisten gayanya.
const BRACKET_STYLES_PAIR = [
  ['[', ']'], ['(', ')'], ['{', '}'],
  ['⌈', '⌋'], ['⸢', '⸥'], ['⸤', '⸧'],
  ['⌜', '⌝'], ['⌞', '⌟'], ['⌐', '¬'],
  ['⟨', '⟩'], ['❮', '❯'], ['〈', '〉'],
  ['《', '》'], ['«', '»'], ['‹', '›'],
  ['【', '】'], ['〔', '〕'], ['〖', '〗'],
  ['⁅', '⁆'],
  ['❨', '❩'], ['❪', '❫'], ['❬', '❭'], ['﴾', '﴿'],
  ['「', '」'], ['『', '』'],
  ['◤', '◢'], ['◥', '◤'], ['⟪', '⟫'],
];

// Kategori 2: Simbol SIMETRIS / pembatas / hiasan (kiri = kanan, atau
// berfungsi sebagai pembatas, bukan kurung sungguhan)
// → dipakai untuk format A: [I.O.E]-nama  (nama di LUAR simbol)
const BRACKET_STYLES_DECOR = [
  ['⌗', '⌗'],
  ['│', '│'], ['┃', '┃'], ['┆', '┆'], ['┊', '┊'],
  ['➔', '➔'], ['►', '◄'],
  ['•', '•'], ['▪', '▪'], ['▫', '▫'], ['⁃', '⁃'],
  ['✦', '✦'], ['✧', '✧'], ['𖤓', '𖤓'], ['✵', '✵'],
  ['❖', '❖'], ['⚜', '⚜'],
];

// Regex untuk membersihkan nama dari semua simbol yang dipakai di kedua
// kategori bracket di atas, supaya nama member tidak kebawa ke-strip kalau
// kebetulan mengandung karakter yang sama.
const ALL_BRACKET_CHARS = [...BRACKET_STYLES_PAIR, ...BRACKET_STYLES_DECOR]
  .flat()
  .join('');
const BRACKET_CLEAN_REGEX = new RegExp(`[${ALL_BRACKET_CHARS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`, 'g');

function generateIoeTag(nama) {
  const cleanNama = nama.trim().replace(BRACKET_CLEAN_REGEX, '');

  // Random pilih kategori dulu, baru random gaya di dalam kategori itu —
  // supaya peluang format A vs format B kurang lebih seimbang.
  const useDecorFormat = Math.random() < 0.5;
  const styles = useDecorFormat ? BRACKET_STYLES_DECOR : BRACKET_STYLES_PAIR;
  const [left, right] = styles[Math.floor(Math.random() * styles.length)];

  if (useDecorFormat) {
    // Format A: [I.O.E]-nama
    return `${left}I.O.E${right}-${cleanNama}`;
  }
  // Format B: [I.O.E-nama]
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
