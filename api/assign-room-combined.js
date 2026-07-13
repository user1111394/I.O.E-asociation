// api/assign-room.js
// Gabungan: GET = assign room (pilih room terbaik), POST = update counter (join/leave/message)
// Digabung jadi 1 file supaya tidak nambah slot Serverless Function di Vercel (limit 12 di plan Hobby).

const UPSTASH_URL = process.env.KV_REST_API_URL;
const UPSTASH_TOKEN = process.env.KV_REST_API_TOKEN;
const TOTAL_ROOMS = 8;
const MAX_MEMBER_PER_ROOM = 100;

async function redisGet(key) {
  const res = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
  });
  const data = await res.json();
  return data.result ? parseInt(data.result, 10) : 0;
}

async function redisIncrBy(key, amount) {
  const res = await fetch(`${UPSTASH_URL}/incrby/${encodeURIComponent(key)}/${amount}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
  });
  const data = await res.json();
  return data.result;
}

// ── Logic: pilih room terbaik (dipakai waktu GET) ──
async function assignRoom() {
  const roomStats = await Promise.all(
    Array.from({ length: TOTAL_ROOMS }, (_, i) => i + 1).map(async (roomId) => {
      const [onlineCount, msgCount] = await Promise.all([
        redisGet(`room:${roomId}:online_count`),
        redisGet(`room:${roomId}:msg_count`)
      ]);
      return { roomId, onlineCount, msgCount };
    })
  );

  const availableRooms = roomStats.filter((r) => r.onlineCount < MAX_MEMBER_PER_ROOM);

  if (availableRooms.length === 0) {
    const fallback = [...roomStats].sort((a, b) => a.onlineCount - b.onlineCount)[0];
    return { roomId: fallback.roomId, full: true, message: "Semua room penuh, diarahkan ke room paling longgar" };
  }

  availableRooms.sort((a, b) => {
    if (a.onlineCount !== b.onlineCount) return a.onlineCount - b.onlineCount;
    return a.msgCount - b.msgCount;
  });

  const chosen = availableRooms[0];
  return { roomId: chosen.roomId, full: false, stats: roomStats };
}

// ── Logic: update counter (dipakai waktu POST) ──
async function updateCounter(roomId, action) {
  let result;
  if (action === "join") {
    result = await redisIncrBy(`room:${roomId}:online_count`, 1);
  } else if (action === "leave") {
    result = await redisIncrBy(`room:${roomId}:online_count`, -1);
    if (result < 0) {
      await fetch(`${UPSTASH_URL}/set/room:${roomId}:online_count/0`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
      });
      result = 0;
    }
  } else if (action === "message") {
    result = await redisIncrBy(`room:${roomId}:msg_count`, 1);
  }
  return result;
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const result = await assignRoom();
      return res.status(200).json(result);
    }

    if (req.method === "POST") {
      const { roomId, action } = req.body || {};
      if (!roomId || roomId < 1 || roomId > 8) {
        return res.status(400).json({ error: "roomId tidak valid (harus 1-8)" });
      }
      if (!["join", "leave", "message"].includes(action)) {
        return res.status(400).json({ error: "action tidak valid (join/leave/message)" });
      }
      const newValue = await updateCounter(roomId, action);
      return res.status(200).json({ roomId, action, newValue });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("assign-room error:", err);
    return res.status(500).json({ error: "Gagal proses request" });
  }
}
