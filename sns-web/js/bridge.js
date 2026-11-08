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

// 화면 전환: 홈(글 모아보기) ↔ 추적 계정 관리(따로 분리된 화면)
let page = "home";
function applyPage() {
  if (!connected && page === "manage") page = "home";
  const manage = connected && page === "manage", sett = false;
  $("trackPanel").hidden = !manage;
  document.querySelector(".layout main").hidden = manage || sett;
  $("navManage").hidden = !connected;
  $("navHome").classList.toggle("on", !manage && !sett && page !== "fav");
  $("navFav").classList.toggle("on", page === "fav");
  $("navManage").classList.toggle("on", manage);
}
function setConn(ok) {
  connected = ok;
  if (!ok) { $("loginBar").hidden = true; }
  $("connectPanel").hidden = ok;
  applyPage();
  $("checkNow").hidden = false; $("checkNow").classList.toggle("off", !ok); // 새로고침 버튼은 항상 보이고, 가운데 점이 연결 상태(초록=연결됨)를 알려 줍니다
  updateConnText();
}
function updateConnText() {
  $("dot").className = "dot" + (connected ? " on" : "");
  const note = saveNote ? " · " + saveNote : "";
  if (connected) $("connText").textContent = "확장 프로그램과 연결됨 · 글 " + items.length + "건" + note;
  else if (savedAt) $("connText").textContent = "저장본을 보는 중 · 글 " + items.length + "건 · 마지막 동기화 " + relative(savedAt) + " (확장을 연결하면 새로 갱신됩니다)";
  else $("connText").textContent = "확장 프로그램과 연결되지 않았습니다." + note;
  $("dot").title = $("connText").textContent;
}

/* ---------- 매체별 로그인 상태 ---------- */
const LOGIN_LINK = { youtube: "https://www.youtube.com/", x: "https://x.com/i/flow/login", instagram: "https://www.instagram.com/accounts/login/" };
const PGLYPH = { youtube: "▶", x: "X", instagram: "◎" };
// 각 매체의 실제 아이콘(파비콘)을 불러옵니다. 못 불러오면 기호로 대신합니다.
const PLOCAL = { youtube: "img/youtube.png", x: "img/x.png", instagram: "img/instagram.png" };
const PDOMAIN = { youtube: "youtube.com", x: "x.com", instagram: "instagram.com" };
function pIcon(p) {
  const wrap = el("span", { class: "pg" });
  const d = PDOMAIN[p];
  // 여러 곳에서 차례로 시도합니다. 모두 실패하면 기호로 대신합니다.
  const srcs = [
    PLOCAL[p],
    "https://www.google.com/s2/favicons?domain=" + d + "&sz=128",
    "https://icons.duckduckgo.com/ip3/" + d + ".ico",
    "https://" + (p === "youtube" ? "www.youtube.com" : p === "instagram" ? "www.instagram.com" : "x.com") + "/favicon.ico",
  ];
  let i = 0;
  const img = el("img", { alt: "", referrerpolicy: "no-referrer", draggable: "false" });
  img.addEventListener("error", () => { if (++i < srcs.length) img.src = srcs[i]; else { img.remove(); wrap.textContent = PGLYPH[p]; } });
  img.src = srcs[0];
  wrap.appendChild(img);
  return wrap;
}
let loginState = {}, modalShown = false, loginAsked = false;
// 로그인 창 자동 열기는 "내가 확인/가져오기를 누른 직후 30초" 안에, 매체마다 한 번만 합니다.
// (로그인 창 자체나 새로고침이 다시 창을 여는 일이 없게 합니다.)
let promptArmedAt = 0, promptedPlat = {}, loginWatch = 0;
function armLoginPrompt() { /* 로그인 창은 이제 모달의 '로그인 하기' 버튼으로만 엽니다 */ }
const needLogin = () => Object.keys(LOGIN_LINK).filter((p) => loginState[p] && loginState[p].loggedIn === false);
function renderLogin() {
  const need = connected ? needLogin() : [];
  const bar = $("loginBar");
  bar.textContent = "";
  bar.hidden = !connected;
  if (connected) {
    // 매체 아이콘 버튼
    //  · 로그인 안 됨: 회색 테두리 + 반투명 회색이 아이콘을 덮음 (누르면 로그인 창)
    //  · 로그인 됨: 수집 켜짐 = 초록 테두리 / 수집 꺼짐 = 빨간 테두리 (누를 때마다 켜고 끔)
    Object.keys(LOGIN_LINK).forEach((p) => {
      const on = !!(loginState[p] && loginState[p].loggedIn === true);
      const collect = settings[p] !== false;
      const cls = "lb pi pi-" + p + (!on ? " nl" : collect ? " go" : " stop");
      const tip = PLATFORM[p] + (!on ? " · 로그인이 필요합니다 (눌러서 로그인)" : collect ? " · 수집 켜짐 (눌러서 끄기)" : " · 수집 꺼짐 (눌러서 켜기)");
      const b = el("button", { type: "button", class: cls, "aria-label": tip, title: tip, "aria-pressed": on ? String(collect) : "false" }, [pIcon(p)]);
      b.addEventListener("click", async () => {
        if (!on) {
          loginWatch = Date.now(); // 로그인하고 돌아오면 상태가 바로 바뀌도록 잠시 동안 자주 확인합니다
          call("openLogin", { platform: p }).catch(() => window.open(LOGIN_LINK[p], "_blank", "noopener"));
          return;
        }
        settings = { ...settings, [p]: !collect };
        renderLogin();
        try { await call("set", { settings }); } catch (e) { settings = { ...settings, [p]: collect }; renderLogin(); showErr(e); }
      });
      bar.appendChild(b);
    });
  }
  if (!$("loginModal").hidden) renderLoginModal();
}
// 로그인이 필요한 매체 목록 모달: 매체마다 '로그인 하기' 버튼, 로그인되면 목록에서 빠집니다.
let modalPlats = [];
function renderLoginModal() {
  const list = $("lmList");
  list.textContent = "";
  const need = modalPlats.filter((p) => !(loginState[p] && loginState[p].loggedIn === true));
  if (!need.length) list.appendChild(el("p", { class: "hint", text: "필요한 매체가 모두 로그인되었습니다. '다시 시도'를 눌러 주세요." }));
  need.forEach((p) => {
    const b = el("button", { type: "button", class: "lb", text: "로그인 하기" });
    b.addEventListener("click", () => {
      loginWatch = Date.now(); // 로그인 후 상태가 바로 바뀌도록 잠시 동안 자주 확인합니다
      call("openLogin", { platform: p }).catch(() => window.open(LOGIN_LINK[p], "_blank", "noopener"));
    });
    list.appendChild(el("div", { class: "row", style: "justify-content:space-between;align-items:center" }, [el("span", { text: PLATFORM[p] + " 로그인이 필요합니다" }), b]));
  });
}
function openLoginModal(plats) { modalPlats = plats; renderLoginModal(); $("loginModal").hidden = false; }
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
$("lmRetry").addEventListener("click", () => { closeLoginModal(); startRefresh(); });
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
