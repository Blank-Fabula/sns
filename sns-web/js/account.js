/* ---------- 계정(PHP 서버) : 로그인하면 저장된 연결 코드를 불러와 확장에 자동 설정 ---------- */
let sess = "", pairBusy = false, avWho = "";
// 프로필 이미지: 이 브라우저에 저장합니다(정사각형 128px로 줄여서).
function loadAvatar() {
  let d = ""; try { d = localStorage.getItem("snsAvatar") || ""; } catch (e) {}
  const img = $("avImg");
  if (d) { img.src = d; img.hidden = false; $("avLetter").hidden = true; } else { img.removeAttribute("src"); img.hidden = true; $("avLetter").hidden = false; }
  $("avClear").hidden = !d;
  const pi = $("avPrevImg");
  if (d) { pi.src = d; pi.hidden = false; $("avPrevLetter").hidden = true; } else { pi.removeAttribute("src"); pi.hidden = true; $("avPrevLetter").hidden = false; }
  $("avPrevLetter").textContent = (avWho || "?").slice(0, 1).toUpperCase();
}
function setAvatarWho(uid) { avWho = uid; $("avLetter").textContent = (uid || "?").slice(0, 1).toUpperCase(); $("menuWho").textContent = uid; $("connAcct").title = uid; loadAvatar(); }
function pickAvatar(file) {
  if (!file || !/^image\//.test(file.type)) return;
  const url = URL.createObjectURL(file), im = new Image();
  im.onload = () => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const x = c.getContext("2d"), m = Math.min(im.naturalWidth, im.naturalHeight);
    x.drawImage(im, (im.naturalWidth - m) / 2, (im.naturalHeight - m) / 2, m, m, 0, 0, 128, 128); // 가운데를 정사각형으로 잘라 꽉 채웁니다
    URL.revokeObjectURL(url);
    try { localStorage.setItem("snsAvatar", c.toDataURL("image/jpeg", 0.9)); } catch (e) {}
    loadAvatar();
  };
  im.onerror = () => URL.revokeObjectURL(url);
  im.src = url;
}
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
    $("connAcct").hidden = false; setAvatarWho(uid); $("connOut").textContent = "로그아웃";
    acctSay("확장에 연결하는 중…");
    token = tok;
    let st;
    try { st = await call("status", {}); }
    catch (e) {
      const m = (e && e.message) || "";
      if (/응답하지 않습니다/.test(m)) throw new Error("확장 프로그램이 응답하지 않습니다. 확장이 없는 기기라면 저장된 목록만 볼 수 있습니다. 확장이 있는 PC라면 켜져 있는지 확인하고 Ctrl+Shift+R로 새로고침하세요.");
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
      pullSaved();
      pairFlow(j.id, j.token);
    } catch (e) { acctSay(e.message, true); }
  };
  $("acctForm").addEventListener("submit", (ev) => { ev.preventDefault(); doAuth("login"); });
  $("acctSignup").addEventListener("click", () => doAuth("signup"));
  const doLogout = async () => {
    try { await api("logout"); } catch (e) {}
    // 저장된 연결 코드도 지워야 새로고침 후 자동으로 다시 연결되지 않습니다.
    try { localStorage.removeItem("snsToken"); } catch (e) {}
    token = "";
    setSess(""); $("acctForm").hidden = false; $("acctUser").hidden = true; $("acctMenu").hidden = true; $("connAcct").hidden = true; acctSay("");
    location.reload();
  };
  $("acctOut").addEventListener("click", doLogout);
  $("connOut").addEventListener("click", doLogout);
  // 계정 관리(비밀번호 변경 · 계정 삭제)
  const say = (id, t, err) => { const m = $(id); m.textContent = t || ""; m.hidden = !t; m.className = err ? "error" : "hint"; };
  const openAcct = () => { $("acctModal").hidden = false; say("pwMsg", ""); say("delMsg", ""); };
  const closeAcct = () => { $("acctModal").hidden = true; };
  const setMenu = (on) => { $("acctMenu").hidden = !on; $("connAcct").setAttribute("aria-expanded", String(on)); };
  $("connAcct").addEventListener("click", (e) => { e.stopPropagation(); setMenu($("acctMenu").hidden); });
  $("avPick").addEventListener("click", () => $("avFile").click());
  $("avFile").addEventListener("change", () => { pickAvatar($("avFile").files[0]); $("avFile").value = ""; });
  $("avClear").addEventListener("click", () => { try { localStorage.removeItem("snsAvatar"); } catch (e) {} loadAvatar(); });
  $("menuSettings").addEventListener("click", () => { setMenu(false); openAcct(); });
  $("connOut").addEventListener("click", () => setMenu(false));
  document.addEventListener("click", (e) => { if (!e.target.closest(".acctwrap")) setMenu(false); });
  $("amX").addEventListener("click", closeAcct);
  $("acctModal").addEventListener("click", (e) => { if (e.target === $("acctModal")) closeAcct(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeAcct(); setMenu(false); } });
  $("pwForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if ($("pwNew").value !== $("pwNew2").value) { say("pwMsg", "새 비밀번호 두 칸이 서로 다릅니다.", true); return; }
    try {
      const j = await api("changePassword", { password: $("pwOld").value, newPassword: $("pwNew").value });
      setSess(j.session);
      $("pwOld").value = $("pwNew").value = $("pwNew2").value = "";
      say("pwMsg", "비밀번호를 변경했습니다.");
    } catch (e) { say("pwMsg", e.message, true); }
  });
  let delArmed = 0;
  $("delBtn").addEventListener("click", async () => {
    if (!$("delPw").value) { say("delMsg", "비밀번호를 입력하세요.", true); return; }
    if (!delArmed) { // 두 번 눌러야 삭제합니다
      $("delBtn").textContent = "정말 삭제하려면 한 번 더";
      delArmed = setTimeout(() => { delArmed = 0; $("delBtn").textContent = "계정 삭제"; }, 5000);
      return;
    }
    clearTimeout(delArmed); delArmed = 0; $("delBtn").textContent = "계정 삭제";
    try {
      await api("deleteAccount", { password: $("delPw").value });
      try { await call("unpair"); } catch (e) { /* 확장이 없거나 구버전이면 확장 화면에서 직접 연결 해제 */ }
      try { ["snsToken", "snsSess", "snsSeen"].forEach((k) => localStorage.removeItem(k)); } catch (e) {}
      location.reload();
    } catch (e) { say("delMsg", e.message, true); }
  });
  if (sess) {
    try { const j = await api("me"); pairFlow(j.id, j.token); }
    catch (e) { setSess(""); }
  }
}
initAccount();

