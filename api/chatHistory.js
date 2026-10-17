// api/_history/chatHistory.js — riwayat chat Cosmos AI per akun, disimpan di Firestore.
// Folder berawalan underscore = TIDAK dihitung sebagai Serverless Function (batas Vercel Hobby: 12).
// Dipanggil dari api/ai.js lewat body { action: 'chat-history', op: 'list'|'get'|'save'|'delete'|'clear', ... }.
//
// Keamanan:
//  - Browser TIDAK pernah menyentuh Firestore. Semua lewat server, yang memverifikasi memberId + sessionToken
//    ke Upstash Redis (aturan sama dengan action 'verify' di auth.js: account:{memberId}.currentSession).
//  - Server memakai service account (bypass aturan Firestore), jadi aturan Firestore harus DIKUNCI:
//    allow read, write: if false;
//  - Struktur: users/{memberId}/chats/{chatId}  -> tiap akun punya "folder" sendiri.
//
// Env yang dibutuhkan (nama baru, dipasang sendiri oleh pemilik di Vercel):
//    FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
// Env Upstash yang sudah ada: KV_REST_API_URL, KV_REST_API_TOKEN

import { createSign, randomBytes } from 'node:crypto';

// ── Batas ──
const MAX_CHATS = 40;            // percakapan tersimpan per akun; yang paling lama dihapus otomatis
const MAX_MESSAGES = 200;        // pesan per percakapan (yang paling lama dibuang)
const MAX_TEXT = 8000;           // karakter per pesan
const MAX_DOC_BYTES = 700_000;   // batas dokumen Firestore 1 MiB; sisakan ruang
const MAX_SOURCES = 6;
const MAX_IMAGES = 2;
const ID_RE = /^[A-Za-z0-9_-]{3,40}$/;

class HistoryError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ───────────────────────── Verifikasi sesi (cermin auth.js) ─────────────────────────
async function kvGetAccount(memberId) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new HistoryError(503, 'Penyimpanan akun belum dikonfigurasi');
  const r = await fetch(`${url}/get/${encodeURIComponent('account:' + memberId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await r.json();
  if (data.result === null || data.result === undefined) return null;
  let parsed;
  try { parsed = JSON.parse(data.result); } catch (e) { return null; }
  // Kompatibilitas data lama yang pernah double-stringify (sama seperti kvGet di auth.js)
  if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch (e) { return null; } }
  return parsed && typeof parsed === 'object' ? parsed : null;
}

async function verifyMember(memberId, sessionToken) {
  if (!ID_RE.test(String(memberId || '')) || !sessionToken || typeof sessionToken !== 'string') {
    throw new HistoryError(401, 'Belum login');
  }
  const account = await kvGetAccount(memberId);
  if (!account || account.currentSession !== sessionToken) throw new HistoryError(401, 'Sesi tidak valid, silakan masuk lagi');
  if (account.banned) throw new HistoryError(403, 'Akun dibatasi');
  return account;
}

// ───────────────────────── Token service account Google ─────────────────────────
let tokenCache = { token: null, exp: 0 };

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function normalizePrivateKey(raw) {
  let k = String(raw || '').trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) k = k.slice(1, -1);
  return k.replace(/\\n/g, '\n'); // Vercel sering menyimpan baris baru sebagai teks "\n"
}

// Buat JWT RS256 untuk service account (diekspor agar bisa diuji)
export function buildServiceAccountJwt(email, privateKey, nowSec) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  const sig = signer.sign(privateKey);
  return `${unsigned}.${b64url(sig)}`;
}

async function getAccessToken() {
  const email = process.env.FIREBASE_CLIENT_EMAIL;
  const keyRaw = process.env.FIREBASE_PRIVATE_KEY;
  if (!process.env.FIREBASE_PROJECT_ID || !email || !keyRaw) {
    throw new HistoryError(503, 'Riwayat chat belum dikonfigurasi di server');
  }
  const nowMs = Date.now();
  if (tokenCache.token && tokenCache.exp - 60_000 > nowMs) return tokenCache.token;

  let jwt;
  try {
    jwt = buildServiceAccountJwt(email, normalizePrivateKey(keyRaw), Math.floor(nowMs / 1000));
  } catch (e) {
    console.error('[history] FIREBASE_PRIVATE_KEY tidak bisa dipakai menandatangani:', e.message);
    throw new HistoryError(503, 'Kunci Firebase di server tidak valid');
  }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(jwt)}`,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) {
    console.error('[history] token Google gagal:', r.status, JSON.stringify(data).slice(0, 200));
    throw new HistoryError(502, 'Gagal masuk ke Firestore');
  }
  tokenCache = { token: data.access_token, exp: nowMs + (Number(data.expires_in) || 3600) * 1000 };
  return tokenCache.token;
}

// ───────────────────────── Firestore REST ─────────────────────────
function fsBase() {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(process.env.FIREBASE_PROJECT_ID)}/databases/(default)/documents`;
}

async function fsRequest(method, path, { query = '', body } = {}) {
  const token = await getAccessToken();
  const r = await fetch(`${fsBase()}/${path}${query ? '?' + query : ''}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 404) return { status: 404, json: null };
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error('[history] Firestore gagal:', method, path, r.status, JSON.stringify(json).slice(0, 300));
    // 403 PERMISSION_DENIED / API belum diaktifkan -> pesan yang bisa ditindaklanjuti pemilik
    throw new HistoryError(502, r.status === 403 ? 'Firestore menolak akses (cek API & peran service account)' : 'Firestore error');
  }
  return { status: r.status, json };
}

const docId = name => String(name || '').split('/').pop();
const strField = v => (v && typeof v.stringValue === 'string') ? v.stringValue : '';
const intField = v => (v && v.integerValue !== undefined) ? Number(v.integerValue) : 0;

// ───────────────────────── Sanitasi pesan dari browser ─────────────────────────
const isHttps = u => { try { return new URL(String(u)).protocol === 'https:'; } catch (e) { return false; } };
const clip = (v, n) => String(v == null ? '' : v).slice(0, n);

export function sanitizeMessages(input) {
  if (!Array.isArray(input)) throw new HistoryError(400, 'messages harus berupa array');
  const out = [];
  for (const m of input.slice(-MAX_MESSAGES)) {
    if (!m || (m.r !== 'u' && m.r !== 'a')) continue;
    const e = { r: m.r, t: clip(m.t, MAX_TEXT) };
    if (m.tp) e.tp = clip(m.tp, 40);                       // topik yang aktif saat pesan dikirim
    if (m.k === 'media') e.k = 'media';                    // penanda: hasil gambar/3D, isinya tidak disimpan
    if (Array.isArray(m.s)) {
      const s = m.s.filter(x => x && isHttps(x.url)).slice(0, MAX_SOURCES)
        .map(x => ({ n: Number(x.n) || 0, title: clip(x.title || x.url, 120), url: clip(x.url, 800) }));
      if (s.length) e.s = s;
    }
    if (Array.isArray(m.i)) {
      const i = m.i.filter(x => x && isHttps(x.src) && isHttps(x.url)).slice(0, MAX_IMAGES)
        .map(x => ({ src: clip(x.src, 800), url: clip(x.url, 800), caption: clip(x.caption, 80) }));
      if (i.length) e.i = i;
    }
    out.push(e);
  }
  return out;
}

function deriveTitle(messages, given) {
  let t = clip(given, 60).trim();
  if (!t) {
    const first = messages.find(m => m.r === 'u' && m.t);
    t = first ? first.t.replace(/\s+/g, ' ').trim().slice(0, 60) : 'Percakapan baru';
  }
  return t || 'Percakapan baru';
}

// ───────────────────────── Operasi ─────────────────────────
async function opList(memberId) {
  const q = `pageSize=${MAX_CHATS + 15}&orderBy=${encodeURIComponent('updatedAt desc')}` +
    '&mask.fieldPaths=title&mask.fieldPaths=updatedAt&mask.fieldPaths=createdAt';
  const { json } = await fsRequest('GET', `users/${encodeURIComponent(memberId)}/chats`, { query: q });
  const docs = (json && json.documents) || [];
  const all = docs.map(d => ({
    id: docId(d.name),
    title: strField(d.fields && d.fields.title) || 'Percakapan',
    updatedAt: intField(d.fields && d.fields.updatedAt),
  }));
  // Batas jumlah percakapan: hapus yang paling lama (daftar sudah urut terbaru -> terlama)
  const extra = all.slice(MAX_CHATS);
  if (extra.length) {
    await Promise.allSettled(extra.map(c => fsRequest('DELETE', `users/${encodeURIComponent(memberId)}/chats/${encodeURIComponent(c.id)}`)));
  }
  return { chats: all.slice(0, MAX_CHATS) };
}

async function opGet(memberId, chatId) {
  if (!ID_RE.test(String(chatId || ''))) throw new HistoryError(400, 'chatId tidak valid');
  const { status, json } = await fsRequest('GET', `users/${encodeURIComponent(memberId)}/chats/${encodeURIComponent(chatId)}`);
  if (status === 404 || !json) throw new HistoryError(404, 'Percakapan tidak ditemukan');
  let messages = [];
  try { messages = JSON.parse(strField(json.fields && json.fields.messages) || '[]'); } catch (e) { messages = []; }
  return {
    id: chatId,
    title: strField(json.fields && json.fields.title),
    updatedAt: intField(json.fields && json.fields.updatedAt),
    messages: sanitizeMessages(messages), // disaring lagi saat dibaca (defense in depth)
  };
}

async function opSave(memberId, body) {
  const messages = sanitizeMessages(body.messages);
  if (!messages.length) throw new HistoryError(400, 'Tidak ada pesan untuk disimpan');
  let chatId = body.chatId;
  const isNew = !chatId;
  if (isNew) chatId = randomBytes(9).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  if (!ID_RE.test(chatId)) throw new HistoryError(400, 'chatId tidak valid');

  const payload = JSON.stringify(messages);
  if (Buffer.byteLength(payload, 'utf8') > MAX_DOC_BYTES) throw new HistoryError(413, 'Percakapan terlalu panjang untuk disimpan, mulai chat baru');

  const now = Date.now();
  const title = deriveTitle(messages, body.title);
  const fields = {
    title: { stringValue: title },
    updatedAt: { integerValue: String(now) },
    messages: { stringValue: payload },
  };
  const mask = ['title', 'updatedAt', 'messages'];
  if (isNew) { fields.createdAt = { integerValue: String(now) }; mask.push('createdAt'); }
  const query = mask.map(f => `updateMask.fieldPaths=${f}`).join('&');
  await fsRequest('PATCH', `users/${encodeURIComponent(memberId)}/chats/${encodeURIComponent(chatId)}`, { query, body: { fields } });
  return { id: chatId, title, updatedAt: now };
}

async function opDelete(memberId, chatId) {
  if (!ID_RE.test(String(chatId || ''))) throw new HistoryError(400, 'chatId tidak valid');
  await fsRequest('DELETE', `users/${encodeURIComponent(memberId)}/chats/${encodeURIComponent(chatId)}`);
  return { deleted: true };
}

async function opClear(memberId) {
  const { json } = await fsRequest('GET', `users/${encodeURIComponent(memberId)}/chats`, { query: 'pageSize=100&mask.fieldPaths=title' });
  const ids = ((json && json.documents) || []).map(d => docId(d.name));
  await Promise.allSettled(ids.map(id => fsRequest('DELETE', `users/${encodeURIComponent(memberId)}/chats/${encodeURIComponent(id)}`)));
  return { cleared: ids.length };
}

// ───────────────────────── Pintu masuk ─────────────────────────
export async function handleChatHistory(body, res) {
  try {
    const { memberId, sessionToken, op } = body || {};
    await verifyMember(memberId, sessionToken);
    let result;
    switch (op) {
      case 'list':   result = await opList(memberId); break;
      case 'get':    result = await opGet(memberId, body.chatId); break;
      case 'save':   result = await opSave(memberId, body); break;
      case 'delete': result = await opDelete(memberId, body.chatId); break;
      case 'clear':  result = await opClear(memberId); break;
      default: throw new HistoryError(400, 'op tidak dikenal');
    }
    res.setHeader && res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof HistoryError) return res.status(e.status).json({ ok: false, error: e.message });
    console.error('[history] error tak terduga:', e);
    return res.status(500).json({ ok: false, error: 'Kesalahan server' });
  }
}
