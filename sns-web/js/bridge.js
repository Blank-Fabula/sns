/* ---------- 확장 연결 (window.postMessage → 확장의 연결 스크립트) ---------- */
let seq = 0;
const pending = new Map();
window.addEventListener("message", (ev) => {
  if (ev.source !== window || !ev.data || ev.data.sns !== "reply") return;
  const p = pending.get(ev.data.id);
  if (!p) return;
  pending.delete(ev.data.id);
  clearTimeout(p.timer);
  const hint = /통신하지 못했습니다|context invalidated/i.test(ev.data.error || "") ? " 확장을 다시 로드했다면 이 페이지를 새로고침(F5)한 뒤 다시 연결하세요." : "";
  ev.data.ok ? p.resolve(ev.data.result) : p.reject(new Error((ev.data.error || "확장이 응답하지 않았습니다.") + hint));
});
function call(op, payload, waitMs) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("확장 프로그램이 응답하지 않습니다. 확장이 설치되어 있고 이 페이지가 확장의 허용 목록에 있는지 확인하세요."));
    }, waitMs || 4000);
    pending.set(id, { resolve, reject, timer });
    window.postMessage({ sns: "call", id, token, op, payload: payload || {} }, "*");
  });
}

function setConn(ok) {
  connected = ok;
  if (!ok) { $("loginBar").hidden = true; }
  $("connectPanel").hidden = ok;
  $("trackPanel").hidden = !ok;
  $("platPanel").hidden = !ok;
  updateConnText();
}
function updateConnText() {
  $("dot").className = "dot" + (connected ? " on" : "");
  const note = saveNote ? " · " + saveNote : "";
  if (connected) $("connText").textContent = "확장 프로그램과 연결됨 · 글 " + items.length + "건" + note;
  else if (savedAt) $("connText").textContent = "저장본을 보는 중 · 글 " + items.length + "건 · 마지막 동기화 " + relative(savedAt) + " (확장을 연결하면 새로 갱신됩니다)";
  else $("connText").textContent = "확장 프로그램과 연결되지 않았습니다." + note;
}

/* ---------- 매체별 로그인 상태 ---------- */
const LOGIN_LINK = { youtube: "https://www.youtube.com/", x: "https://x.com/i/flow/login", instagram: "https://www.instagram.com/accounts/login/" };
let loginState = {}, modalShown = false, loginAsked = false;
const needLogin = () => Object.keys(LOGIN_LINK).filter((p) => loginState[p] && loginState[p].loggedIn === false);
function renderLogin() {
  const need = connected ? needLogin() : [];
  const bar = $("loginBar");
  bar.textContent = "";
  bar.hidden = !connected;
  if (connected) {
    if (need.length) bar.appendChild(el("span", { class: "hint", text: "로그인 필요:" }));
    need.forEach((p) => bar.appendChild(loginLink(p, PLATFORM[p] + " 로그인", "lb")));
    const re = el("button", { type: "button", text: "로그인 상태 확인" });
    re.addEventListener("click", () => { re.disabled = true; re.textContent = "확인 중…"; call("checkLogin").catch(showErr); setTimeout(() => { re.disabled = false; re.textContent = "로그인 상태 확인"; }, 12000); });
    bar.appendChild(re);
    if (!need.length && Object.keys(loginState).length) bar.appendChild(el("span", { class: "hint", text: "확인된 매체는 모두 로그인되어 있습니다." }));
  }
  const modal = $("loginModal");
  if (need.length && !modalShown) {
    modalShown = true;
    const list = $("lmList");
    list.textContent = "";
    need.forEach((p) => list.appendChild(el("div", { class: "lrow" }, [el("span", { text: PLATFORM[p] }), loginLink(p, "로그인하러 가기")])));
    modal.hidden = false;
    $("lmLater").focus();
  } else if (!need.length) modal.hidden = true;
}
// 로그인 링크는 확장이 별도의 작은 창으로 엽니다(실패하면 새 탭으로 엽니다).
function loginLink(p, text, cls) {
  // 링크(<a>)가 아니라 버튼으로 만들어, 확장이 여는 창 말고 기존 창에서 따로 열리지 않게 합니다.
  const a = el("button", { type: "button", class: "lb " + (cls || ""), text });
  a.addEventListener("click", () => { call("openLogin", { platform: p }).catch(() => window.open(LOGIN_LINK[p], "_blank", "noopener")); });
  return a;
}
function closeLoginModal() { $("loginModal").hidden = true; }
$("lmX").addEventListener("click", closeLoginModal);
$("lmLater").addEventListener("click", closeLoginModal);
$("loginModal").addEventListener("click", (e) => { if (e.target === $("loginModal")) closeLoginModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeLoginModal(); closeViewer(); } });

