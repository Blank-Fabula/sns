// 계정(가입·로그인·비밀번호 변경·계정 삭제)·연결 코드용 Vercel 서버 함수. 글 데이터는 api/sync.js가 따로 다룹니다.
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

// 세션 값은 "아이디:세션버전". 비밀번호를 바꾸면 버전이 올라가서 예전 세션은 모두 무효가 됩니다.
async function newSession(email, ver) {
  const s = crypto.randomBytes(32).toString("hex");
  await redis(["SET", "sess:" + sha(s), email + ":" + (Number(ver) || 0), "EX", String(30 * DAY)]);
  return s;
}
async function userBySession(sess) {
  if (typeof sess !== "string" || sess.length < 20 || sess.length > 200) return null;
  const v = await redis(["GET", "sess:" + sha(sess)]);
  if (!v) return null;
  const [email, vs] = String(v).split(":");
  const raw = await redis(["GET", "user:" + email]);
  if (!raw) return null;
  const user = JSON.parse(raw);
  if ((Number(vs) || 0) !== (Number(user.sv) || 0)) return null;
  return { email, user };
}
function pwOk(pw, u) {
  const a = Buffer.from(hashPw(pw, u.salt), "hex"), b = Buffer.from(u.hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// 비밀번호를 확인하는 요청(로그인·비밀번호 변경·계정 삭제)은 IP당 15분에 10번까지만 틀릴 수 있습니다.
async function gate(req) {
  const ip = String(req.headers["x-forwarded-for"] || "?").split(",")[0].trim();
  const key = "rl:" + sha(ip);
  const tries = Number(await redis(["GET", key])) || 0;
  return { blocked: tries >= 10, bump: async () => { await redis(["INCR", key]); await redis(["EXPIRE", key, "900"]); } };
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
      const g = await gate(req);
      if (g.blocked) return fail(429, "시도가 너무 많습니다. 15분 뒤에 다시 하세요.");
      const bump = g.bump;

      if (act === "signup") {
        await bump();
        const salt = crypto.randomBytes(16).toString("hex");
        const token = crypto.randomBytes(16).toString("hex");
        const rec = JSON.stringify({ salt, hash: hashPw(pw, salt), token });
        const ok = await redis(["SET", "user:" + email, rec, "NX"]);
        if (ok !== "OK") return fail(409, "이미 사용 중인 아이디입니다.");
        return send(200, { ok: true, session: await newSession(email, 0), id: email, token });
      }
      const raw = await redis(["GET", "user:" + email]);
      let good = false, u = null;
      if (raw) {
        u = JSON.parse(raw);
        good = pwOk(pw, u);
      }
      if (!good) { await bump(); return fail(401, "아이디 또는 비밀번호가 맞지 않습니다."); }
      return send(200, { ok: true, session: await newSession(email, u.sv), id: email, token: u.token });
    }
    if (act === "me") {
      const f = await userBySession(body.session);
      if (!f) return fail(401, "로그인이 필요합니다.");
      return send(200, { ok: true, id: f.email, token: f.user.token });
    }
    if (act === "changePassword" || act === "deleteAccount") {
      const f = await userBySession(body.session);
      if (!f) return fail(401, "로그인이 필요합니다.");
      const g = await gate(req);
      if (g.blocked) return fail(429, "시도가 너무 많습니다. 15분 뒤에 다시 하세요.");
      if (!pwOk(String(body.password || ""), f.user)) { await g.bump(); return fail(401, "현재 비밀번호가 맞지 않습니다."); }
      if (act === "changePassword") {
        const np = String(body.newPassword || "");
        if (np.length < 6 || np.length > 200) return fail(400, "새 비밀번호는 6자 이상이어야 합니다.");
        const salt = crypto.randomBytes(16).toString("hex");
        const sv = (Number(f.user.sv) || 0) + 1;
        await redis(["SET", "user:" + f.email, JSON.stringify({ ...f.user, salt, hash: hashPw(np, salt), sv })]);
        return send(200, { ok: true, session: await newSession(f.email, sv) }); // 다른 기기의 로그인은 모두 풀립니다
      }
      // 계정 삭제: 계정·저장된 글/계정 목록/본 글 기록·현재 세션을 지웁니다(다른 세션은 계정이 없어져 자동 무효).
      const keys = ["user:" + f.email, "data:" + f.email + ":meta", "data:" + f.email + ":seen", "rlsync:" + sha(f.email), "sess:" + sha(body.session)];
      for (let i = 0; i < 20; i++) keys.push("data:" + f.email + ":c" + i);
      for (const k of keys) await redis(["DEL", k]);
      return send(200, { ok: true });
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
