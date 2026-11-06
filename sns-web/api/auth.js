// 로그인·연결 코드 저장용 Vercel 서버 함수. 수집한 글은 여기로 오지 않습니다(각자 PC의 확장에만 있음).
// 저장소: Vercel Storage의 Upstash Redis (연동하면 환경변수가 자동으로 생깁니다).
const crypto = require("crypto");

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const DAY = 86400;

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
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString("hex");

async function newSession(email) {
  const s = crypto.randomBytes(32).toString("hex");
  await redis(["SET", "sess:" + sha(s), email, "EX", String(30 * DAY)]);
  return s;
}
async function userBySession(sess) {
  if (typeof sess !== "string" || sess.length < 20 || sess.length > 200) return null;
  const email = await redis(["GET", "sess:" + sha(sess)]);
  if (!email) return null;
  const raw = await redis(["GET", "user:" + email]);
  if (!raw) return null;
  return { email, user: JSON.parse(raw) };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const send = (code, body) => res.status(code).json(body);
  const fail = (code, msg) => send(code, { ok: false, error: msg });
  try {
    if (req.method !== "POST") return fail(405, "POST 요청만 받습니다.");
    if (!REDIS_URL || !REDIS_TOKEN) return fail(500, "서버 저장소(Upstash Redis)가 아직 연결되지 않았습니다.");
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!body || typeof body.action !== "string") return fail(400, "요청 형식이 올바르지 않습니다.");
    const act = body.action;

    if (act === "signup" || act === "login") {
      const email = String(body.id || "").trim().toLowerCase();
      const pw = String(body.password || "");
      if (!/^[a-z0-9_.-]{3,30}$/.test(email)) return fail(400, "아이디는 영문·숫자·_ . - 로 3~30자여야 합니다.");
      if (pw.length < 6 || pw.length > 200) return fail(400, "비밀번호는 6자 이상이어야 합니다.");
      const ip = String(req.headers["x-forwarded-for"] || "?").split(",")[0].trim();
      const rlKey = "rl:" + sha(ip);
      const tries = Number(await redis(["GET", rlKey])) || 0;
      if (tries >= 10) return fail(429, "시도가 너무 많습니다. 15분 뒤에 다시 하세요.");
      const bump = async () => { await redis(["INCR", rlKey]); await redis(["EXPIRE", rlKey, "900"]); };

      if (act === "signup") {
        await bump();
        const salt = crypto.randomBytes(16).toString("hex");
        const token = crypto.randomBytes(16).toString("hex");
        const rec = JSON.stringify({ salt, hash: hashPw(pw, salt), token });
        const ok = await redis(["SET", "user:" + email, rec, "NX"]);
        if (ok !== "OK") return fail(409, "이미 사용 중인 아이디입니다.");
        return send(200, { ok: true, session: await newSession(email), id: email, token });
      }
      const raw = await redis(["GET", "user:" + email]);
      let good = false, u = null;
      if (raw) {
        u = JSON.parse(raw);
        const a = Buffer.from(hashPw(pw, u.salt), "hex"), b = Buffer.from(u.hash, "hex");
        good = a.length === b.length && crypto.timingSafeEqual(a, b);
      }
      if (!good) { await bump(); return fail(401, "아이디 또는 비밀번호가 맞지 않습니다."); }
      return send(200, { ok: true, session: await newSession(email), id: email, token: u.token });
    }
    if (act === "me") {
      const f = await userBySession(body.session);
      if (!f) return fail(401, "로그인이 필요합니다.");
      return send(200, { ok: true, id: f.email, token: f.user.token });
    }
    if (act === "logout") {
      if (typeof body.session === "string" && body.session.length < 200) await redis(["DEL", "sess:" + sha(body.session)]);
      return send(200, { ok: true });
    }
    return fail(400, "알 수 없는 요청입니다.");
  } catch (e) {
    return fail(500, "서버 오류가 발생했습니다.");
  }
};
