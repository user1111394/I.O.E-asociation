// api/member.js — Member Registration Proxy
// Simpan data member baru ke Firebase Realtime Database

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const DB_URL = process.env.FIREBASE_DB_URL; // e.g. https://YOUR_PROJECT-default-rtdb.firebaseio.com
  const DB_SECRET = process.env.FIREBASE_DB_SECRET; // Firebase DB secret (legacy auth)

  if (!DB_URL) return res.status(500).json({ error: 'FIREBASE_DB_URL tidak ditemukan' });

  const { id, nama, username, usia, kota, skills, joined } = req.body;
  if (!id || !nama) return res.status(400).json({ error: 'id dan nama diperlukan' });

  try {
    const endpoint = `${DB_URL}/members/${id}.json${DB_SECRET ? `?auth=${DB_SECRET}` : ''}`;
    const r = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, nama, username, usia, kota, skills, joined, createdAt: Date.now() }),
    });
    if (!r.ok) throw new Error('Firebase error ' + r.status);
    return res.status(200).json({ success: true, id });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
