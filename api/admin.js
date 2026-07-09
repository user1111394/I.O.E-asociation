// api/admin.js — Logic khusus admin: generate & verify trial admin token
// Menggantikan admin-token.js lama (yang masih pakai Firebase).
// Pakai Upstash Redis, konsisten dengan auth.js.

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const ADMIN_KEY = process.env.ADMIN_MASTER_KEY;

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

async function kvDel(key) {
  const r = await fetch(`${KV_URL}/del/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  return r.ok;
}

function randomTrialToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let t = 'TRIAL-';
  for (let i = 0; i < 8; i++) t += chars[Math.floor(Math.random() * chars.length)];
  return t;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: 'Storage belum terhubung' });
  }

  const { action } = req.body;

  // ══════════════════════════════════════
  // GENERATE-TRIAL-TOKEN — Superadmin generate token 1x pakai, durasi 1 hari
  // ══════════════════════════════════════
  if (action === 'generate-trial-token') {
    const { superadminToken } = req.body;

    // Verifikasi superadmin dulu — token harus ada & valid di Upstash
    if (!superadminToken) {
      return res.status(403).json({ error: 'Superadmin token diperlukan' });
    }
    try {
      const saSession = await kvGet(`superadmin:${superadminToken}`);
      if (!saSession || !saSession.active) {
        return res.status(403).json({ error: 'Sesi superadmin tidak valid' });
      }

      const trialToken = randomTrialToken();
      const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 1 hari

      await kvSet(`trial-token:${trialToken}`, {
        createdAt: Date.now(),
        expiresAt,
        used: false,
      });

      return res.status(200).json({ success: true, token: trialToken, expiresAt });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // VERIFY-TRIAL-TOKEN — Trial admin login pakai token, ditandai "used" setelah dipakai
  // ══════════════════════════════════════
  if (action === 'verify-trial-token') {
    const { trialToken } = req.body;
    if (!trialToken) {
      return res.status(400).json({ error: 'Token diperlukan' });
    }

    try {
      const data = await kvGet(`trial-token:${trialToken}`);
      if (!data) {
        return res.status(401).json({ error: 'Token tidak ditemukan' });
      }
      if (data.used) {
        return res.status(401).json({ error: 'Token sudah pernah digunakan' });
      }
      if (Date.now() > data.expiresAt) {
        return res.status(401).json({ error: 'Token sudah kedaluwarsa' });
      }

      // Tandai token sebagai sudah dipakai (1x pakai)
      data.used = true;
      data.usedAt = Date.now();
      await kvSet(`trial-token:${trialToken}`, data);

      // Generate session token buat trial admin (berlaku sampai expiresAt yang sama)
      const sessionToken = 'trial_session_' + Math.random().toString(36).substring(2, 15);
      await kvSet(`trial-session:${sessionToken}`, {
        createdAt: Date.now(),
        expiresAt: data.expiresAt,
      });

      return res.status(200).json({
        success: true,
        sessionToken,
        expiresAt: data.expiresAt,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // VERIFY-TRIAL-SESSION — Cek apakah session trial admin masih berlaku
  // ══════════════════════════════════════
  if (action === 'verify-trial-session') {
    const { sessionToken } = req.body;
    if (!sessionToken) return res.status(200).json({ valid: false });

    try {
      const session = await kvGet(`trial-session:${sessionToken}`);
      if (!session) return res.status(200).json({ valid: false });
      if (Date.now() > session.expiresAt) {
        await kvDel(`trial-session:${sessionToken}`);
        return res.status(200).json({ valid: false, expired: true });
      }
      return res.status(200).json({ valid: true, expiresAt: session.expiresAt });
    } catch (e) {
      return res.status(200).json({ valid: false });
    }
  }

  return res.status(400).json({ error: 'Action tidak dikenali' });
}
