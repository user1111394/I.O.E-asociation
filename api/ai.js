// api/ai.js — Vercel Serverless Function
// Proxy untuk Groq AI (agar API key aman di backend)
// Dilengkapi sistem kuota harian per member (deviceId) + dual API key

const QUOTA_REGULAR = 80;   // chat/hari untuk member biasa
const QUOTA_PREMIUM = 150;  // chat/hari untuk member premium

function todayKey() {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

async function callGroq(key, payload) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return response;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Kumpulkan semua GROQ_API_KEY yang tersedia (GROQ_API_KEY = key 1,
  // GROQ_API_KEY_2 s/d GROQ_API_KEY_10 = key cadangan). Key yang belum
  // diisi di environment variables otomatis di-skip — jadi aman dipakai
  // meski belum semua 10 key terisi sekaligus.
  const GROQ_KEYS = [process.env.GROQ_API_KEY];
  for (let i = 2; i <= 10; i++) {
    const k = process.env[`GROQ_API_KEY_${i}`];
    if (k) GROQ_KEYS.push(k);
  }
  const availableKeys = GROQ_KEYS.filter(Boolean);
  if (availableKeys.length === 0) {
    return res.status(500).json({ error: 'GROQ_API_KEY tidak ditemukan di environment variables' });
  }

  const DB_URL = process.env.FIREBASE_DB_URL;
  const { messages, deviceId } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages diperlukan' });
  }
  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId diperlukan' });
  }

  let isPremium = false;
  let used = 0;
  let limit = QUOTA_REGULAR;
  const day = todayKey();

  if (DB_URL) {
    try {
      const memberRes = await fetch(`${DB_URL}/members/${deviceId}.json`);
      const memberData = await memberRes.json();
      isPremium = !!(memberData && memberData.premium);
      limit = isPremium ? QUOTA_PREMIUM : QUOTA_REGULAR;

      const bonusRes = await fetch(`${DB_URL}/quota_bonus/${deviceId}/${day}.json`);
      const bonusData = await bonusRes.json();
      if (typeof bonusData === 'number') limit += bonusData;

      const usageRes = await fetch(`${DB_URL}/quota_usage/${deviceId}/${day}.json`);
      const usageData = await usageRes.json();
      used = typeof usageData === 'number' ? usageData : 0;

      if (used >= limit) {
        return res.status(429).json({
          error: 'Kuota chat harian kamu sudah habis',
          used,
          limit,
          isPremium,
          canRequestMore: isPremium,
          resetInfo: 'Kuota akan reset otomatis jam 00:00 WIB',
        });
      }
    } catch (e) {
      // Fail-open: kalau Firebase gagal diakses, chat tetap lanjut supaya AI tidak mati total
    }
  }

  const SYSTEM_PROMPT = `Kamu adalah COSMOS AI — asisten edukasi dari I.O.E (International Organization of Education).

Spesialisasimu:
1. 🔭 ASTRONOMI — bintang, galaksi, tata surya, lubang hitam, kosmologi, planet, fenomena langit
2. 📜 SEJARAH — sejarah dunia, peradaban kuno, tokoh sejarah, eksplorasi antariksa, sejarah sains
3. 🌀 KOSMOLOGI & ASTROFISIKA — teori Big Bang, materi gelap, energi gelap, relativitas
4. ♈ ASTROLOGI — zodiak, rasi bintang, horoskop (dalam konteks budaya/mitologi)
5. 🧠 PSIKOLOGI — dasar-dasar psikologi, kaitannya dengan astronomi dan eksplorasi

ATURAN:
- Jawab dalam Bahasa Indonesia yang menarik dan mudah dipahami
- Gunakan analogi yang kreatif dan relatable
- Berikan fakta-fakta menarik yang jarang diketahui
- Jika ditanya di luar spesialisasi, tetap bantu tapi arahkan kembali ke topik utama
- Gunakan emoji secara bijak untuk membuat jawaban lebih engaging
- Format jawaban dengan rapi (gunakan bold, italic, poin-poin bila perlu)
- Untuk pertanyaan kompleks, beri penjelasan bertahap
- Selalu antusias dan penuh semangat dalam berbagi ilmu!`;

  try {
    const payload = {
      model: 'llama-3.1-8b-instant',
      max_tokens: 1024,
      temperature: 0.75,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.slice(-20), // Keep last 20 messages for context
      ],
    };

    // Acak urutan key tiap request biar beban kepencar rata di semua key
    // (bukan selalu mulai dari key 1), lalu coba satu-satu sampai berhasil
    // atau semua key sudah dicoba dan gagal semua.
    const shuffledKeys = [...availableKeys].sort(() => Math.random() - 0.5);

    let response = null;
    for (const key of shuffledKeys) {
      response = await callGroq(key, payload);
      if (response.ok) break;
      // Kalau key ini kena rate limit / invalid, coba key berikutnya di
      // urutan acak tadi. Kalau errornya bukan soal key (misal 400 request
      // salah), gak ada gunanya coba key lain — langsung berhenti.
      if (response.status === 429 || response.status === 401) {
        continue;
      }
      break;
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'Groq API error' });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '';

    // Tambah pemakaian kuota harian (hanya kalau request berhasil)
    let newUsed = used + 1;
    if (DB_URL) {
      try {
        await fetch(`${DB_URL}/quota_usage/${deviceId}/${day}.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newUsed),
        });
      } catch (e) {
        // Kalau gagal update kuota, tetap balas chat-nya — jangan ganggu pengalaman user
      }
    }

    return res.status(200).json({
      reply,
      quota: DB_URL ? { used: newUsed, limit, isPremium } : undefined,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
