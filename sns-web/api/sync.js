// 수집한 글의 "짧은 미리보기"(링크·제목·썸네일 주소)·추적 계정·본 글 기록을 로그인 계정별로 저장해서,
// 확장이 없는 다른 기기에서도 로그인만 하면 볼 수 있게 합니다. 저장소: Upstash Redis(auth.js와 같은 것).
const crypto = require("crypto");

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEEP = 120 * 86400; // 저장 유지 기간(초)
const MAX_CHUNKS = 20;    // 100건씩 20덩어리 = 최대 2000건
const CHUNK = 100;
const SOURCES = new Set(["youtube-video", "youtube-post", "x", "instagram"]);
const PLATFORMS = new Set(["youtube", "x", "instagram"]);

async function redis(cmd) {
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + REDIS_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const str = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
const https = (v, n) => { const s = str(v, n); return /^https:\/\//.test(s) ? s : ""; };

async function userIdBySession(sess) {
  if (typeof sess !== "string" || sess.length < 20 || sess.length > 200) return null;
  const v = await redis(["GET", "sess:" + sha(sess)]);
  if (!v) return null;
  const [email, vs] = String(v).split(":");
  const raw = await redis(["GET", "user:" + email]); // 계정이 지워졌거나 비밀번호를 바꿔 세션 버전이 달라졌으면 무효
  if (!raw) return null;
  if ((Number(vs) || 0) !== (Number((JSON.parse(raw) || {}).sv) || 0)) return null;
  return email;
}

function cleanItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = str(raw.id, 120), url = https(raw.url, 500);
  if (!id || !SOURCES.has(raw.source) || !url) return null;
  const out = {
    id, source: raw.source, url,
    title: str(raw.title, 300), author: str(raw.author, 100),
    thumb: https(raw.thumb, 1000),
    publishedAt: str(raw.publishedAt, 40), publishedText: str(raw.publishedText, 40),
    via: str(raw.via, 200),
    collectedAt: Number.isFinite(raw.collectedAt) ? Math.floor(raw.collectedAt) : Date.now(),
  };
  return out;
}
function cleanTracked(list) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const t of list.slice(0, 60)) {
    if (!t || !PLATFORMS.has(t.platform) || typeof t.id !== "string" || t.id.length > 200) continue;
    const c = { id: t.id, platform: t.platform, handle: /^[^\s/?#@]{1,60}$/.test(t.handle || "") ? t.handle : "" };
    if (t.kind === "feed") c.kind = "feed";
    if (typeof t.channelId === "string" && /^UC[\w-]{22}$/.test(t.channelId)) c.channelId = t.channelId;
    if (/^https:\/\/www\.youtube\.com\/(c|user)\/[^/?#]+$/.test(t.resolveUrl || "") && t.resolveUrl.length < 200) c.resolveUrl = t.resolveUrl;
    if (typeof t.group === "string" && t.group.trim()) c.group = t.group.trim().slice(0, 30);
    out.push(c);
  }
  return out;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const send = (code, body) => res.status(code).json(body);
  const fail = (code, msg) => send(code, { ok: false, error: msg });
  try {
    if (req.method !== "POST") return fail(405, "POST 요청만 받습니다.");
    if (!REDIS_URL || !REDIS_TOKEN) return fail(500, "서버 저장소가 연결되지 않았습니다.");
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!body || typeof body.action !== "string") return fail(400, "요청 형식이 올바르지 않습니다.");
    const uid = await userIdBySession(body.session);
    if (!uid) return fail(401, "로그인이 필요합니다.");
    const k = (s) => "data:" + uid + ":" + s;
    const act = body.action;

    if (act === "meta") {
      const raw = await redis(["GET", k("meta")]);
      return send(200, { ok: true, meta: raw ? JSON.parse(raw) : null });
    }
    if (act === "chunk") {
      const i = Number(body.i);
      if (!Number.isInteger(i) || i < 0 || i >= MAX_CHUNKS) return fail(400, "잘못된 번호입니다.");
      const raw = await redis(["GET", k("c" + i)]);
      return send(200, { ok: true, items: raw ? JSON.parse(raw) : [] });
    }

    if (act === "getSeen") {
      const raw = await redis(["GET", k("seen")]);
      return send(200, { ok: true, ids: raw ? JSON.parse(raw) : [] });
    }

    // 쓰기: 계정당 시간당 호출 수 제한(저장소 한도 보호)
    const rl = "rlsync:" + sha(uid);
    const n = await redis(["INCR", rl]);
    if (n === 1) await redis(["EXPIRE", rl, "3600"]);
    if (n > 400) return fail(429, "저장 요청이 너무 많습니다. 잠시 뒤에 다시 시도합니다.");

    if (act === "putChunk") {
      const i = Number(body.i);
      if (!Number.isInteger(i) || i < 0 || i >= MAX_CHUNKS || !Array.isArray(body.items)) return fail(400, "잘못된 요청입니다.");
      const items = body.items.slice(0, CHUNK).map(cleanItem).filter(Boolean);
      await redis(["SET", k("c" + i), JSON.stringify(items), "EX", String(KEEP)]);
      return send(200, { ok: true, n: items.length });
    }
    if (act === "putSeen") {
      // 본 글 기록은 합집합으로만 늘립니다(다른 기기의 기록을 지우지 않음). 최근 5000개만 유지.
      const add = Array.isArray(body.add) ? body.add.slice(0, 500).map((x) => str(x, 120)).filter(Boolean) : [];
      const raw = await redis(["GET", k("seen")]);
      const cur = raw ? JSON.parse(raw) : [];
      const have = new Set(cur);
      for (const id of add) if (!have.has(id)) { cur.push(id); have.add(id); }
      const out = cur.slice(-5000);
      await redis(["SET", k("seen"), JSON.stringify(out), "EX", String(KEEP)]);
      return send(200, { ok: true, n: out.length });
    }
    if (act === "putMeta") {
      const chunks = Math.max(0, Math.min(MAX_CHUNKS, Number(body.chunks) || 0));
      const prevRaw = await redis(["GET", k("meta")]);
      const prevN = prevRaw ? Math.min(MAX_CHUNKS, Number((JSON.parse(prevRaw) || {}).chunks) || 0) : 0;
      const settings = {};
      if (body.settings && typeof body.settings === "object") for (const p of PLATFORMS) if (typeof body.settings[p] === "boolean") settings[p] = body.settings[p];
      const ac = body.autoCheck && typeof body.autoCheck === "object" ? { enabled: body.autoCheck.enabled === true, hours: [1, 3, 6, 12].includes(body.autoCheck.hours) ? body.autoCheck.hours : 3 } : { enabled: false, hours: 3 };
      const meta = {
        chunks, count: Math.max(0, Math.min(MAX_CHUNKS * CHUNK, Number(body.count) || 0)),
        tracked: cleanTracked(body.tracked), settings, autoCheck: ac,
        windowDays: [7, 14, 30, 60].includes(body.windowDays) ? body.windowDays : 7,
        savedAt: Date.now(),
      };
      await redis(["SET", k("meta"), JSON.stringify(meta), "EX", String(KEEP)]);
      for (let i = chunks; i < prevN; i++) await redis(["DEL", k("c" + i)]);
      return send(200, { ok: true, savedAt: meta.savedAt });
    }
    return fail(400, "알 수 없는 요청입니다.");
  } catch (e) {
    return fail(500, "서버 오류가 발생했습니다.");
  }
};
