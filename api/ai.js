// api/ai.js — Vercel Serverless Function
// Proxy untuk Groq AI (agar API key aman di backend)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY tidak ditemukan di environment variables' });
  }

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages diperlukan' });
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
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: 1024,
        temperature: 0.75,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages.slice(-20), // Keep last 20 messages for context
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message || 'Groq API error' });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '';

    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
