// api/assign-room.js
// Tahap 1: Logic pemilihan room (1-8) buat sharding chat I.O.E Hub.
// Belum kesambung ke chat.js — murni backend, aman buat di-deploy duluan.

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const TOTAL_ROOMS = 8;
const MAX_MEMBER_PER_ROOM = 100;

// Helper: baca 1 value dari Upstash lewat REST API
async function redisGet(key) {
  const res = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
  });
  const data = await res.json();
  return data.result ? parseInt(data.result, 10) : 0;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Ambil online_count & msg_count semua 8 room secara paralel
    const roomStats = await Promise.all(
      Array.from({ length: TOTAL_ROOMS }, (_, i) => i + 1).map(async (roomId) => {
        const [onlineCount, msgCount] = await Promise.all([
          redisGet(`room:${roomId}:online_count`),
          redisGet(`room:${roomId}:msg_count`)
        ]);
        return { roomId, onlineCount, msgCount };
      })
    );

    // Filter room yang belum penuh
    const availableRooms = roomStats.filter(
      (r) => r.onlineCount < MAX_MEMBER_PER_ROOM
    );

    if (availableRooms.length === 0) {
      // Semua room penuh — fallback: pilih yang online_count paling kecil meski lewat kapasitas
      const fallback = [...roomStats].sort((a, b) => a.onlineCount - b.onlineCount)[0];
      return res.status(200).json({
        roomId: fallback.roomId,
        full: true,
        message: "Semua room penuh, diarahkan ke room paling longgar"
      });
    }

    // Urutkan: online_count paling kecil dulu, kalau seri pakai msg_count paling kecil
    availableRooms.sort((a, b) => {
      if (a.onlineCount !== b.onlineCount) return a.onlineCount - b.onlineCount;
      return a.msgCount - b.msgCount;
    });

    const chosen = availableRooms[0];

    return res.status(200).json({
      roomId: chosen.roomId,
      full: false,
      stats: roomStats // opsional, buat debugging manual pas testing
    });
  } catch (err) {
    console.error("assign-room error:", err);
    return res.status(500).json({ error: "Gagal assign room" });
  }
}
