// api/_shop/event-quests.js — Quest event: koin event, klaim quest, review admin.
// Dipindah dari api/shop.js tanpa perubahan logika (kecuali perbaikan format klaim quest & klaim ulang; lihat komentar). Hanya named export.

import { EVENT_DB_URL, kvDel, kvGet, kvSet, kvSetNX, kvSetNXEx, normalizeClaim, verifyAdminAccess, verifyMemberSession, verifyTikTokSubmission } from './shared.js';

const RESET_MS = { daily: 24 * 60 * 60 * 1000, weekly: 7 * 24 * 60 * 60 * 1000 };

function fmtWait(ms) {
  const m = Math.max(1, Math.ceil(ms / 60000));
  if (m >= 1440) return `${Math.floor(m / 1440)} hari ${Math.floor((m % 1440) / 60)} jam`;
  if (m >= 60) return `${Math.floor(m / 60)} jam ${m % 60} menit`;
  return `${m} menit`;
}

// Interval reset quest (ms) dari data event di Firebase: 0 = sekali klaim, null = gagal membaca event.
async function getQuestResetMs(eventId, questId) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    const r = await fetch(`${EVENT_DB_URL}/events/${encodeURIComponent(eventId)}/quests.json`, { signal: ctl.signal });
    if (!r.ok) return null;
    const quests = await r.json();
    if (!quests || typeof quests !== 'object') return 0;
    const q = quests[questId] || Object.values(quests).find((x) => x && x.id === questId);
    return (q && RESET_MS[q.resetType]) || 0;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Ambil alih rekaman klaim yang sudah ada (false / quest berulang yang sudah lewat masa reset).
// Atomik: kunci pengambilalihan SET NX EX 15 -> hanya satu request yang lolos; rekaman dibaca ulang
// SETELAH memegang kunci supaya tidak ada dua request yang sama-sama menang.
async function takeOverClaim(claimKey, isTakeable) {
  const tk = `questtakeover:${claimKey}`;
  if (!(await kvSetNXEx(tk, Date.now(), 15))) return { ok: false, busy: true };
  const previous = await kvGet(claimKey);
  if (!isTakeable(previous)) { await kvDel(tk); return { ok: false }; }
  await kvSet(claimKey, 'processing');
  return { ok: true, previous: previous === null || previous === undefined ? false : previous, takeoverKey: tk };
}

export async function handleEventQuests(ctx, res) {
  const { req, action } = ctx;

  // ══════════════════════════════════════
  // GRANT-EVENT-COIN — Admin kasih koin event ke member tertentu (manual)
  // Koin event TERPISAH dari koin global — key: eventcoin:{eventId}:{memberId}
  // ══════════════════════════════════════
  if (action === 'grant-event-coin') {
    const { adminToken, eventId, memberId, amount } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });

    if (!eventId || !memberId) {
      return res.status(400).json({ error: 'eventId dan memberId wajib diisi' });
    }
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum < 1) {
      return res.status(400).json({ error: 'amount harus berupa angka lebih dari 0' });
    }

    try {
      const key = `eventcoin:${eventId}:${memberId}`;
      const current = await kvGet(key) || 0;
      const newAmount = current + amountNum;
      const saved = await kvSet(key, newAmount);
      if (!saved) return res.status(500).json({ error: 'Gagal menyimpan koin event' });

      return res.status(200).json({ success: true, coins: newAmount });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // CLAIM-QUEST — Member klaim reward quest event. Tipe quest dibedakan:
  //   - visit, make-video, invite-friend, login-streak -> auto-approve
  //     (tidak ada yang bisa diverifikasi otomatis secara ketat, sifatnya
  //     "self-report", dianggap wajar untuk tindakan yang memang tidak
  //     menghasilkan bukti terlacak)
  //   - submit-link -> dicek via verifyTikTokSubmission(); approved/
  //     pending/rejected tergantung apakah video ID bisa dicocokkan
  //   - like-video -> SELALU pending (screenshot tidak bisa diverifikasi
  //     otomatis oleh sistem ini) sampai admin approve manual
  //
  // Storage:
  //   questclaimed:{eventId}:{questId}:{memberId} -> { status: 'approved' | 'pending', claimedAt }
//     (rekaman lama berupa string 'approved'/'pending' tetap terbaca lewat normalizeClaim;
//     claimedAt dipakai event.html untuk reset harian/mingguan)
  //     (rejected TIDAK disimpan sebagai status permanen — supaya member
  //     bisa coba klaim ulang dengan link yang benar)
  //   questreview:{eventId}:{questId}:{memberId}  -> detail submission
  //     (dilihat admin saat approve/reject manual quest yang pending)
  //   queststreak:{eventId}:{questId}:{memberId}  -> { lastDate, count }
  //     (tracking harian untuk quest tipe login-streak)
  //
  // Koin CUMA ditambahkan saat status jadi 'approved' (langsung di sini
  // untuk tipe auto-approve, atau lewat approve-pending-quest untuk yang
  // tadinya pending).
  // ══════════════════════════════════════
  if (action === 'claim-quest') {
    const { memberId, sessionToken, eventId, questId, rewardCoin, questType, submittedLink, sourceLink, proofImageUrl, eventCreatedAt, unlockDay } = req.body;

    const account = await verifyMemberSession(memberId, sessionToken);
    if (!account) return res.status(403).json({ error: 'Sesi tidak valid, silakan login ulang' });

    if (!eventId || !questId) {
      return res.status(400).json({ error: 'eventId dan questId wajib diisi' });
    }

    // rewardCoin dikirim dari client (dibaca dari data quest di Firebase),
    // divalidasi wajar di sini (1-100000) untuk mencegah nilai aneh lolos.
    const rewardNum = Number(rewardCoin);
    if (!Number.isFinite(rewardNum) || rewardNum < 1 || rewardNum > 100000) {
      return res.status(400).json({ error: 'rewardCoin tidak valid' });
    }

    const type = questType || 'visit';

    // ── Validasi quest terkunci (unlockDay) ──
    // shop.js (Redis) tidak punya akses ke Firebase tempat eventCreatedAt
    // & unlockDay ASLI tersimpan, jadi client (event.html) yang mengirim
    // nilai itu. Supaya tidak bisa dipalsukan lewat devtools untuk
    // melewati quest yang masih terkunci:
    //   1. Waktu SEKARANG dihitung pakai Date.now() SERVER, bukan waktu
    //      dari client — jadi mengubah jam device sendiri tidak berguna.
    //   2. eventCreatedAt dikunci ke nilai PERTAMA yang pernah diterima
    //      server untuk eventId ini (eventfirstseen:{eventId}). Member
    //      curang tidak tahu nilai asli eventCreatedAt di Firebase, jadi
    //      kalau dia kirim nilai palsu (lebih tua dari asli, supaya
    //      kelihatan "sudah hari ke-3"), permintaan itu HANYA berhasil
    //      kalau dia orang PERTAMA yang pernah memanggil quest ini sama
    //      sekali — begitu ada satu panggilan sah (nilai asli), nilai
    //      itu terkunci permanen untuk event ini dan tidak bisa diubah lagi.
    const unlockDayNum = Number(unlockDay) || 1;
    if (unlockDayNum > 1) {
      const eventCreatedAtNum = Number(eventCreatedAt);
      if (!Number.isFinite(eventCreatedAtNum) || eventCreatedAtNum <= 0) {
        return res.status(400).json({ error: 'Data waktu event tidak valid' });
      }

      const firstSeenKey = `eventfirstseen:${eventId}`;
      const lockedCreatedAt = await kvGet(firstSeenKey);
      let effectiveCreatedAt;
      if (lockedCreatedAt) {
        effectiveCreatedAt = lockedCreatedAt;
      } else {
        // Belum pernah ada yang memanggil quest event ini sebelumnya —
        // coba kunci nilai yang dikirim SEKARANG sebagai acuan permanen.
        // kvSetNX atomik: kalau ada request lain yang bersamaan menang
        // duluan, baca ulang di sini supaya kita pakai nilai yang benar-
        // benar tersimpan, bukan nilai kiriman kita sendiri yang kalah.
        const wonLock = await kvSetNX(firstSeenKey, eventCreatedAtNum);
        effectiveCreatedAt = wonLock ? eventCreatedAtNum : (await kvGet(firstSeenKey)) || eventCreatedAtNum;
      }

      const elapsedMs = Date.now() - effectiveCreatedAt;
      const currentDay = Math.max(1, Math.floor(elapsedMs / (24 * 60 * 60 * 1000)) + 1);

      if (currentDay < unlockDayNum) {
        return res.status(403).json({ error: `Quest ini baru bisa diklaim mulai hari ke-${unlockDayNum}` });
      }
    }

    // restoreValue: nilai yang dipulihkan kalau verifikasi gagal (false untuk klaim baru; rekaman lama untuk klaim ulang)
    let restoreValue = false;
    let takeoverKey = null;
    try {
      const claimKey = `questclaimed:${eventId}:${questId}:${memberId}`;

      // Sama seperti claim-redeem-code: kunci klaim ATOMIK di awal, sebelum
      // verifikasi & pemberian reward apapun. Mencegah member yang spam
      // klik tombol klaim lolos beberapa kali sekaligus sebelum status
      // claimed sempat tersimpan (race condition / duplikasi reward).
      const lockAcquired = await kvSetNX(claimKey, 'processing');
      if (!lockAcquired) {
        // Key sudah ada. Biasanya berarti sudah diklaim/pending -> tolak. Dua pengecualian, diambil alih
        // secara ATOMIK (hanya satu request yang boleh lanjut):
        //  (a) rekaman false = klaim sebelumnya ditolak admin / dibatalkan -> boleh coba lagi
        //      (SET NX gagal selama key ada, termasuk saat nilainya false);
        //  (b) quest berulang (resetType daily/weekly di event Firebase) yang sudah lewat masa reset.
        const existingRaw = await kvGet(claimKey);
        const existing = normalizeClaim(existingRaw);
        let resetMs = 0;
        let takeable = !existing;
        if (existing && existing.status === 'approved' && existing.claimedAt) {
          resetMs = await getQuestResetMs(eventId, questId); // dibaca dari Firebase, BUKAN dari request
          if (resetMs === null) return res.status(502).json({ error: 'Tidak bisa memverifikasi data event. Coba lagi.' });
          takeable = resetMs > 0 && Date.now() - existing.claimedAt >= resetMs;
        }
        if (!takeable) {
          if (existing && existing.status === 'approved' && resetMs > 0) {
            const wait = existing.claimedAt + resetMs - Date.now();
            return res.status(409).json({ error: `Quest ini sudah diklaim. Bisa diklaim lagi dalam ${fmtWait(wait)}.`, status: 'approved', retryAfterMs: wait });
          }
          const existingStatus = existing ? existing.status : existingRaw;
          return res.status(409).json({ error: existingStatus === 'pending' ? 'Klaim ini masih menunggu review admin' : 'Quest ini sudah pernah diklaim', status: existingStatus });
        }
        const took = await takeOverClaim(claimKey, (rec) => {
          const r = normalizeClaim(rec);
          return !r || (r.status === 'approved' && r.claimedAt && resetMs > 0 && Date.now() - r.claimedAt >= resetMs);
        });
        if (!took.ok) {
          return res.status(409).json({ error: took.busy ? 'Klaim sedang diproses, coba lagi sebentar.' : 'Quest ini sudah pernah diklaim', status: 'approved' });
        }
        restoreValue = took.previous;
        takeoverKey = took.takeoverKey;
      }

      let status = 'approved'; // default untuk tipe auto-approve

      if (type === 'submit-link') {
        if (!submittedLink) {
          await kvSet(claimKey, restoreValue); // rollback lock
          return res.status(400).json({ error: 'Link video wajib diisi' });
        }
        status = verifyTikTokSubmission(sourceLink, submittedLink);
        if (status === 'rejected') {
          await kvSet(claimKey, restoreValue); // rollback lock, boleh coba link lain
          return res.status(400).json({ error: 'Link tidak mengarah ke video yang sama dengan video sumber' });
        }
      } else if (type === 'like-video') {
        if (!proofImageUrl) {
          await kvSet(claimKey, restoreValue); // rollback lock
          return res.status(400).json({ error: 'Screenshot bukti wajib diupload' });
        }
        status = 'pending';
      }

      // Simpan bukti submission untuk dilihat admin, kalau statusnya pending.
      // Sekaligus daftarkan memberId & questId ke index supaya
      // list-pending-quests bisa menemukannya tanpa perlu scan seluruh
      // keyspace Redis (REST API Upstash yang dipakai di sini tidak
      // menyediakan SCAN sederhana lewat helper kvGet/kvSet yang ada).
      if (status === 'pending') {
        await kvSet(`questreview:${eventId}:${questId}:${memberId}`, {
          memberId, questId, submittedLink: submittedLink || '', proofImageUrl: proofImageUrl || '', submittedAt: Date.now(),
        });

        const indexKey = `questreviewindex:${eventId}`;
        const memberIds = await kvGet(indexKey) || [];
        if (!memberIds.includes(memberId)) {
          memberIds.push(memberId);
          await kvSet(indexKey, memberIds);
        }

        const memberKeysKey = `questreviewkeys:${eventId}:${memberId}`;
        const questKeys = await kvGet(memberKeysKey) || [];
        if (!questKeys.includes(questId)) {
          questKeys.push(questId);
          await kvSet(memberKeysKey, questKeys);
        }
      }

      // Lock sudah diambil di awal ('processing') — sekarang finalisasi
      // jadi status hasil akhir yang sebenarnya.
      const marked = await kvSet(claimKey, { status: status, claimedAt: Date.now() });
      if (!marked) return res.status(500).json({ error: 'Gagal mencatat klaim' });

      if (status === 'pending') {
        return res.status(200).json({ success: true, status: 'pending' });
      }

      // status === 'approved' -> langsung cairkan koin
      const coinKey = `eventcoin:${eventId}:${memberId}`;
      const current = await kvGet(coinKey) || 0;
      const newAmount = current + rewardNum;
      const saved = await kvSet(coinKey, newAmount);
      if (!saved) return res.status(500).json({ error: 'Gagal menambah koin event' });

      return res.status(200).json({ success: true, status: 'approved', coins: newAmount, rewardClaimed: rewardNum });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    } finally {
      if (takeoverKey) await kvDel(takeoverKey); // lepas kunci pengambilalihan (kalau ada)
    }
  }

  // ══════════════════════════════════════
  // CHECK-QUEST-CLAIMED — Member cek status quest mana saja yang sudah
  // diklaim (dipanggil saat event.html pertama kali render). Nilai per
  // questId sekarang string 'approved' | 'pending' (dulu boolean true/false)
  // supaya event.html bisa menampilkan tombol "Selesai" vs "Menunggu" beda.
  // Quest yang belum diklaim sama sekali tidak muncul di object claimed
  // (event.html menganggap absen = belum diklaim).
  // ══════════════════════════════════════
  if (action === 'check-quest-claimed') {
    const { memberId, sessionToken, eventId, questIds } = req.body;

    const account = await verifyMemberSession(memberId, sessionToken);
    if (!account) return res.status(403).json({ error: 'Sesi tidak valid, silakan login ulang' });

    if (!eventId || !Array.isArray(questIds)) {
      return res.status(400).json({ error: 'eventId dan questIds (array) wajib diisi' });
    }

    try {
      const claimed = {};
      const claimedAt = {}; // waktu klaim (ms) per quest, dipakai event.html untuk reset harian/mingguan
      for (const qId of questIds) {
        const key = `questclaimed:${eventId}:${qId}:${memberId}`;
        const rec = normalizeClaim(await kvGet(key)); // rekaman lama (string) & baru ({status, claimedAt})
        const status = rec ? rec.status : null;
        // 'processing' adalah status transisi internal (lock sedang
        // diproses request lain saat ini juga) — jangan ditampilkan ke
        // client sebagai status quest yang valid, treat sebagai belum
        // diklaim supaya tombol tidak nyangkut di kondisi aneh.
        if (status && status !== 'processing') {
          claimed[qId] = status;
          if (rec.claimedAt) claimedAt[qId] = rec.claimedAt;
        }
      }
      return res.status(200).json({ claimed, claimedAt });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // LIST-PENDING-QUESTS — Admin ambil semua klaim quest berstatus pending
  // untuk satu event, buat ditampilkan di tab Review.
  // ══════════════════════════════════════
  if (action === 'list-pending-quests') {
    const { adminToken, eventId } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });
    if (!eventId) return res.status(400).json({ error: 'eventId wajib diisi' });

    try {
      // Redis REST API tidak expose SCAN dengan pattern secara sederhana lewat
      // helper kvGet/kvSet yang ada, jadi kita simpan daftar member yang punya
      // review pending per event di key terpisah supaya tetap bisa dicari
      // tanpa scan seluruh keyspace.
      const indexKey = `questreviewindex:${eventId}`;
      const memberIds = await kvGet(indexKey) || [];

      const pending = [];
      for (const memberId of memberIds) {
        // Cek semua quest untuk member ini di event ini
        const keys = await kvGet(`questreviewkeys:${eventId}:${memberId}`) || [];
        for (const questId of keys) {
          const rec = normalizeClaim(await kvGet(`questclaimed:${eventId}:${questId}:${memberId}`));
          if (!rec || rec.status !== 'pending') continue;
          const detail = await kvGet(`questreview:${eventId}:${questId}:${memberId}`);
          if (detail) pending.push(detail);
        }
      }

      return res.status(200).json({ pending });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // APPROVE-PENDING-QUEST — Admin setujui klaim pending: ubah status jadi
  // approved dan cairkan koinnya. rewardCoin dibaca dari Firebase di sisi
  // client (nav.js) lalu dikirim di sini karena shop.js tidak mengakses
  // Firebase (event disimpan di Firebase, koin & status disimpan di Redis).
  // ══════════════════════════════════════
  if (action === 'approve-pending-quest') {
    const { adminToken, eventId, questId, memberId, rewardCoin } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });
    if (!eventId || !questId || !memberId) {
      return res.status(400).json({ error: 'eventId, questId, dan memberId wajib diisi' });
    }

    try {
      const claimKey = `questclaimed:${eventId}:${questId}:${memberId}`;
      const status = (normalizeClaim(await kvGet(claimKey)) || {}).status;
      if (status !== 'pending') {
        return res.status(409).json({ error: 'Klaim ini tidak sedang menunggu review' });
      }

      const rewardNum = Number(rewardCoin) || 0;
      await kvSet(claimKey, { status: 'approved', claimedAt: Date.now() });

      if (rewardNum > 0) {
        const coinKey = `eventcoin:${eventId}:${memberId}`;
        const current = await kvGet(coinKey) || 0;
        await kvSet(coinKey, current + rewardNum);
      }

      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // REJECT-PENDING-QUEST — Admin tolak klaim pending: hapus status supaya
  // member bisa coba klaim ulang (misal kirim screenshot/link yang benar).
  // ══════════════════════════════════════
  if (action === 'reject-pending-quest') {
    const { adminToken, eventId, questId, memberId } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });
    if (!eventId || !questId || !memberId) {
      return res.status(400).json({ error: 'eventId, questId, dan memberId wajib diisi' });
    }

    try {
      const claimKey = `questclaimed:${eventId}:${questId}:${memberId}`;
      const status = (normalizeClaim(await kvGet(claimKey)) || {}).status;
      if (status !== 'pending') {
        return res.status(409).json({ error: 'Klaim ini tidak sedang menunggu review' });
      }

      // Hapus status klaim (set null lewat kvSet karena tidak ada kvDelete
      // helper) — Redis REST /set dengan value null akan disimpan sebagai
      // string "null", jadi kita pakai flag false alih-alih benar-benar
      // menghapus key. check-quest-claimed sudah menganggap falsy = absen.
      await kvSet(claimKey, false);
      await kvSet(`questreview:${eventId}:${questId}:${memberId}`, null);

      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // CHECK-EVENT-COIN — Admin cek saldo koin event milik member tertentu
  // ══════════════════════════════════════
  if (action === 'check-event-coin') {
    const { adminToken, eventId, memberId } = req.body;

    const isValidAdmin = await verifyAdminAccess(adminToken);
    if (!isValidAdmin) return res.status(403).json({ error: 'Akses admin tidak valid' });

    if (!eventId || !memberId) {
      return res.status(400).json({ error: 'eventId dan memberId wajib diisi' });
    }

    try {
      const coins = await kvGet(`eventcoin:${eventId}:${memberId}`) || 0;
      return res.status(200).json({ coins });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ══════════════════════════════════════
  // GET-EVENT-BALANCE — Member ambil saldo koin event miliknya sendiri
  // ══════════════════════════════════════
  if (action === 'get-event-balance') {
    const { memberId, sessionToken, eventId } = req.body;

    const account = await verifyMemberSession(memberId, sessionToken);
    if (!account) return res.status(401).json({ error: 'Session tidak valid, silakan login ulang' });

    if (!eventId) return res.status(400).json({ error: 'eventId wajib diisi' });

    try {
      const coins = await kvGet(`eventcoin:${eventId}:${memberId}`) || 0;
      return res.status(200).json({ coins });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
}
