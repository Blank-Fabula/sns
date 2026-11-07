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
  $("checkNow").hidden = !ok; // 가져오기 버튼은 맨 위 검색창 옆에 있고, 확장이 연결됐을 때만 보입니다
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
// 로그인 창 자동 열기는 "내가 확인/가져오기를 누른 직후 30초" 안에, 매체마다 한 번만 합니다.
// (로그인 창 자체나 새로고침이 다시 창을 여는 일이 없게 합니다.)
let promptArmedAt = 0, promptedPlat = {}, loginWatch = 0;
function armLoginPrompt() { promptArmedAt = Date.now(); promptedPlat = {}; }
const needLogin = () => Object.keys(LOGIN_LINK).filter((p) => loginState[p] && loginState[p].loggedIn === false);
function renderLogin() {
  const need = connected ? needLogin() : [];
  const bar = $("loginBar");
  bar.textContent = "";
  bar.hidden = !connected;
  if (connected) {
    // 매체별 로그인 버튼: 로그인되어 있으면 눌리지 않고 연한 녹색, 아니면 눌러서 로그인 창을 엽니다.
    Object.keys(LOGIN_LINK).forEach((p) => {
      const on = !!(loginState[p] && loginState[p].loggedIn === true);
      const b = el("button", { type: "button", class: "lb" + (on ? " ok" : ""), text: PLATFORM[p] + " 로그인" + (on ? " ✓" : "") });
      if (on) { b.disabled = true; b.title = "로그인되어 있습니다"; }
      else b.addEventListener("click", () => {
        loginWatch = Date.now(); // 로그인하고 돌아오면 상태가 바로 바뀌도록 잠시 동안 자주 확인합니다
        call("openLogin", { platform: p }).catch(() => window.open(LOGIN_LINK[p], "_blank", "noopener"));
      });
      bar.appendChild(b);
    });
  }
  // 방금 확인한 결과에서 로그인이 필요한 매체가 나오면: 잠깐 안내를 띄우고, 그 매체 로그인 창을 맨 앞에 새로 엽니다.
  // (내가 확인·가져오기를 누른 직후 30초 안에, 매체마다 한 번만 띄웁니다.)
  if (connected) {
    need.forEach((p) => {
      if (!promptArmedAt || Date.now() - promptArmedAt > 30000 || promptedPlat[p]) return;
      promptedPlat[p] = true;
      showNotice(PLATFORM[p] + " 로그인이 필요합니다");
      call("openLogin", { platform: p }).catch(() => window.open(LOGIN_LINK[p], "_blank", "noopener"));
    });
  }
  $("loginModal").hidden = true;
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


// 로그인 버튼을 누른 뒤 3분 동안은 15초마다 로그인 상태를 다시 확인해, 로그인이 끝나면 버튼이 녹색으로 바뀝니다.
// 아직 로그인되지 않은 매체만 확인합니다(이미 로그인된 매체의 탭은 다시 열지 않습니다).
const recheckLogin = () => {
  if (!connected || !loginWatch || Date.now() - loginWatch > 180000) return;
  const todo = Object.keys(LOGIN_LINK).filter((p) => !(loginState[p] && loginState[p].loggedIn === true));
  if (todo.length) call("checkLogin", { platforms: todo }).catch(() => {});
};
setInterval(recheckLogin, 20000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") recheckLogin(); });
