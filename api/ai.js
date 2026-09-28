// api/ai.js — Vercel Serverless Function
// Proxy untuk Groq AI (agar API key aman di backend)
// Dilengkapi sistem kuota harian per member (deviceId) + dual API key

const QUOTA_REGULAR = 80;   // chat/hari untuk member biasa
const QUOTA_PREMIUM = 150;  // chat/hari untuk member premium

const MODEL = 'openai/gpt-oss-120b';
const MAX_TOOL_ROUNDS = 2;  // batas berapa kali model boleh memanggil tool per satu chat (jaga kuota & waktu eksekusi Vercel)

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

// Tool yang boleh dipanggil model. Model sendiri yang memutuskan kapan perlu mencari,
// jadi pertanyaan biasa (definisi, penjelasan konsep) tidak menghabiskan kuota Tavily.
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Cari informasi terkini di web. Pakai HANYA untuk hal yang bisa berubah atau baru terjadi (berita astronomi terbaru, jadwal fenomena langit, misi antariksa terkini, penemuan baru) atau kalau kamu tidak yakin dengan sebuah fakta. JANGAN pakai untuk konsep umum yang sudah kamu kuasai.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Kata kunci pencarian, singkat dan spesifik' },
        },
        required: ['query'],
      },
    },
  },
];

// Panggil Tavily. Hasil dipotong supaya tidak membengkakkan konteks model.
// Mengembalikan { text, sources } — text untuk dibaca model, sources untuk ditampilkan ke member.
async function tavilySearch(query) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return { text: 'Pencarian web tidak tersedia saat ini.', sources: [] };
  try {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ query: String(query).slice(0, 300), search_depth: 'basic', max_results: 4 }),
    });
    if (!r.ok) {
      console.error('[ai] Tavily gagal:', r.status);
      return { text: 'Pencarian web gagal. Jawab dengan pengetahuanmu dan sebutkan bahwa informasi mungkin belum terkini.', sources: [] };
    }
    const data = await r.json();
    const results = (data.results || []).slice(0, 4);
    const sources = results.map(x => ({ title: x.title, url: x.url }));
    const text = results
      .map((x, i) => `[${i + 1}] ${x.title}\n${String(x.content || '').slice(0, 500)}\nSumber: ${x.url}`)
      .join('\n\n') || 'Tidak ada hasil.';
    return { text, sources };
  } catch (e) {
    console.error('[ai] Tavily error jaringan:', e.message);
    return { text: 'Pencarian web gagal. Jawab dengan pengetahuanmu dan sebutkan bahwa informasi mungkin belum terkini.', sources: [] };
  }
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
  const { messages, deviceId, searchMode } = req.body;
  // Tavily hanya boleh dipakai kalau member SENGAJA menyalakan mode pencarian. Hanya 1 key Tavily,
  // jadi tanpa flag ini Cosmos menjawab dari pengetahuannya sendiri dan tidak menyentuh kuota Tavily.
  const useSearch = searchMode === true && !!process.env.TAVILY_API_KEY;
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

  // Aturan tambahan HANYA saat mode pencarian dinyalakan member, supaya perilaku normal tidak berubah.
  const SEARCH_RULES = `

MODE PENCARIAN AKTIF:
- Kamu punya tool web_search. Pakai untuk info terkini atau fakta yang kamu tidak yakin. Untuk konsep umum, jawab langsung tanpa mencari.
- Kalau memakai hasil pencarian, sebutkan sumbernya dengan nomor [1], [2], dst. sesuai urutan hasil yang kamu terima.
- Hanya klaim yang benar-benar ada di hasil pencarian yang boleh diberi nomor sumber. Jangan mengarang sumber. Kalau hasil tidak menjawab pertanyaan, katakan terus terang.`;
  const systemContent = useSearch ? SYSTEM_PROMPT + SEARCH_RULES : SYSTEM_PROMPT;

  try {
    // Percakapan yang dikirim ke model. Saat mode pencarian, pesan tool ditambahkan di sini.
    const convo = [
      { role: 'system', content: systemContent },
      ...messages.slice(-20), // Keep last 20 messages for context
    ];

    // Acak urutan key tiap request biar beban kepencar rata di semua key
    // (bukan selalu mulai dari key 1), lalu coba satu-satu sampai berhasil
    // atau semua key sudah dicoba dan gagal semua.
    const shuffledKeys = [...availableKeys].sort(() => Math.random() - 0.5);

    // Satu panggilan ke Groq dengan rotasi key. Kalau key kena rate limit / invalid, coba key
    // berikutnya. Error lain (misal 400 request salah) tidak ada gunanya dicoba ulang dengan key lain.
    async function askModel(withTools) {
      const payload = {
        model: MODEL,
        max_tokens: 2048, // gpt-oss memakai sebagian token untuk "berpikir", jadi 1024 sering terlalu sempit
        temperature: 0.75,
        reasoning_effort: 'medium',
        messages: convo,
      };
      if (withTools) { payload.tools = TOOLS; payload.tool_choice = 'auto'; }

      let response = null;
      for (const key of shuffledKeys) {
        response = await callGroq(key, payload);
        if (response.ok) break;
        if (response.status === 429 || response.status === 401) continue;
        break;
      }
      return response;
    }

    let sources = [];
    let searchCount = 0;
    let response = null;
    let data = null;

    // Loop tool hanya berjalan kalau mode pencarian aktif. Tanpa itu, cukup 1 panggilan biasa.
    for (let round = 0; round <= (useSearch ? MAX_TOOL_ROUNDS : 0); round++) {
      const canUseTool = useSearch && round < MAX_TOOL_ROUNDS;
      response = await askModel(canUseTool);

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error('[ai] Groq gagal:', response.status, JSON.stringify(err?.error || err).slice(0, 300));
        return res.status(response.status).json({ error: err.error?.message || 'Groq API error' });
      }

      data = await response.json();
      const msg = data.choices?.[0]?.message;
      const toolCalls = msg?.tool_calls;

      if (!canUseTool || !toolCalls || toolCalls.length === 0) break; // model sudah menjawab

      // Model minta mencari: jalankan, masukkan hasilnya ke percakapan, lalu tanya model lagi
      convo.push(msg);
      for (const call of toolCalls.slice(0, 2)) { // maksimal 2 pencarian per putaran
        let args = {};
        try { args = JSON.parse(call.function?.arguments || '{}'); } catch (e) { /* args kosong */ }
        const result = call.function?.name === 'web_search' && args.query
          ? await tavilySearch(args.query)
          : { text: 'Tool tidak dikenali atau parameter kosong.', sources: [] };
        searchCount++;
        sources = sources.concat(result.sources);
        convo.push({ role: 'tool', tool_call_id: call.id, content: result.text });
      }
    }

    const reply = data?.choices?.[0]?.message?.content || '';

    // Buang sumber ganda (URL sama) supaya daftar yang tampil ke member rapi
    const seen = new Set();
    sources = sources.filter(s => s.url && !seen.has(s.url) && seen.add(s.url));

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
      sources: sources.length ? sources : undefined,
      searched: useSearch ? searchCount > 0 : undefined,
      quota: DB_URL ? { used: newUsed, limit, isPremium } : undefined,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
