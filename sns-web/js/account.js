/* ---------- 계정(PHP 서버) : 로그인하면 저장된 연결 코드를 불러와 확장에 자동 설정 ---------- */
let sess = "", pairBusy = false;
try { sess = localStorage.getItem("snsSess") || ""; } catch (e) {}
async function api(action, body) {
  const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ action, session: sess }, body || {})) });
  let j;
  try { j = await r.json(); } catch (e) { throw new Error("서버 응답을 읽지 못했습니다."); }
  if (!j.ok) throw new Error(j.error || "요청에 실패했습니다.");
  return j;
}
function acctSay(t, isErr) { const m = $("acctMsg"); m.textContent = t || ""; m.hidden = !t; m.className = isErr ? "error" : "hint"; }
function setSess(s) { sess = s || ""; try { if (sess) localStorage.setItem("snsSess", sess); else localStorage.removeItem("snsSess"); } catch (e) {} }
async function pairFlow(uid, tok) {
  if (pairBusy) return;
  pairBusy = true;
  try {
    $("acctForm").hidden = true; $("acctUser").hidden = false; $("acctWho").textContent = uid + " 로그인됨";
    $("connOut").hidden = false; $("connOut").textContent = uid + " 로그아웃";
    acctSay("확장에 연결하는 중…");
    token = tok;
    let st;
    try { st = await call("status", {}); }
    catch (e) {
      const m = (e && e.message) || "";
      if (/응답하지 않습니다/.test(m)) throw new Error("확장 프로그램이 응답하지 않습니다. 확장이 켜져 있는지 확인하고 이 페이지를 Ctrl+Shift+R로 새로고침하세요.");
      if (/맞지 않습니다|알 수 없는 요청/.test(m)) throw new Error("확장이 v0.11.0보다 오래된 버전입니다. 새 버전을 덮어쓰고 ⟳ 한 뒤 새로고침하세요. (확장 메시지: " + m + ")");
      throw new Error("확장 오류: " + m);
    }
    if (!st || typeof st.paired !== "boolean") throw new Error("확장이 오래된 버전입니다. v0.11.0 이상으로 업데이트한 뒤 새로고침하세요.");
    if (!st.match) {
      if (st.paired) throw new Error("이 확장은 다른 코드로 이미 연결되어 있습니다. 확장 화면에서 '연결 해제'를 누른 뒤 다시 시도하세요.");
      await call("adopt", { token: tok });
    }
    acctSay("");
    await connect(tok, true);
  } catch (e) {
    acctSay((e && e.message) || "연결하지 못했습니다.", true);
  } finally { pairBusy = false; }
}
async function initAccount() {
  $("acct").hidden = false;
  const doAuth = async (action) => {
    acctSay("");
    try {
      const j = await api(action, { id: $("acctEmail").value.trim(), password: $("acctPw").value });
      $("acctPw").value = "";
      setSess(j.session);
      pairFlow(j.id, j.token);
    } catch (e) { acctSay(e.message, true); }
  };
  $("acctForm").addEventListener("submit", (ev) => { ev.preventDefault(); doAuth("login"); });
  $("acctSignup").addEventListener("click", () => doAuth("signup"));
  const doLogout = async () => {
    try { await api("logout"); } catch (e) {}
    setSess(""); $("acctForm").hidden = false; $("acctUser").hidden = true; $("connOut").hidden = true; acctSay("");
    location.reload();
  };
  $("acctOut").addEventListener("click", doLogout);
  $("connOut").addEventListener("click", doLogout);
  if (sess) {
    try { const j = await api("me"); pairFlow(j.id, j.token); }
    catch (e) { setSess(""); }
  }
}
initAccount();

