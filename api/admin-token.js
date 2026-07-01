// api/admin-token.js — Generate & validate admin token
// POST /api/admin-token { action: 'generate', masterKey } → { token }
// POST /api/admin-token { action: 'validate', token } → { valid: bool }

function randomToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let t = 'ioeadm_';
  for (let i = 0; i < 32; i++) t += chars[Math.floor(Math.random() * chars.length)];
  return t;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const DB_URL = process.env.FIREBASE_DB_URL;
  const MASTER_KEY = process.env.ADMIN_MASTER_KEY; // kunci rahasia untuk generate token baru

  if (!DB_URL) return res.status(500).json({ error: 'FIREBASE_DB_URL tidak ditemukan' });

  const { action, masterKey, token } = req.body;

  // ── GENERATE TOKEN BARU ──
  if (action === 'generate') {
    if (!MASTER_KEY || masterKey !== MASTER_KEY) {
      return res.status(403).json({ error: 'Master key salah' });
    }
    const newToken = randomToken();
    const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 hari

    try {
      await fetch(`${DB_URL}/admin_tokens/${newToken}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ createdAt: Date.now(), expiresAt }),
      });
      return res.status(200).json({ token: newToken, expiresAt });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── VALIDASI TOKEN ──
  if (action === 'validate') {
    if (!token) return res.status(400).json({ valid: false });
    try {
      const r = await fetch(`${DB_URL}/admin_tokens/${token}.json`);
      const d = await r.json();
      if (!d) return res.status(200).json({ valid: false });
      if (Date.now() > d.expiresAt) return res.status(200).json({ valid: false, expired: true });
      return res.status(200).json({ valid: true, expiresAt: d.expiresAt });
    } catch (e) {
      return res.status(500).json({ valid: false, error: e.message });
    }
  }

  return res.status(400).json({ error: 'Action tidak valid' });
}
