/* ---------- 계정 입력 해석 ---------- */
const FEED = { youtube: "내 구독 피드", x: "홈 타임라인", instagram: "홈 피드" };
const SITE_START = /^(www\.|m\.|mobile\.)?(youtube\.com|youtu\.be|x\.com|twitter\.com|instagram\.com)(\/|$)/i;
const VIDEO_MSG = "영상 주소입니다. 채널 주소(예: https://www.youtube.com/@이름)를 넣어 주세요.";

// 입력을 해석해 { account } 또는 { error }를 돌려줍니다.
function parseAccount(platformHint, raw) {
  let s = raw.trim();
  if (!s) return { error: "계정이나 주소를 입력하세요." };
  // "youtube.com"처럼 프로토콜 없이 사이트 주소만 붙여넣은 경우도 주소로 처리합니다.
  if (!/^https?:\/\//i.test(s) && !s.startsWith("@") && SITE_START.test(s)) s = "https://" + s;

  let platform = platformHint;
  let handle = "";
  let channelId = "";
  let resolveUrl = "";
  let feed = false;

  if (/^https?:\/\//i.test(s)) {
    let u;
    try {
      u = new URL(s);
    } catch (e) {
      return { error: "주소 형식이 올바르지 않습니다." };
    }
    const host = u.hostname.replace(/^(www|m|mobile)\./, "");
    const parts = u.pathname.split("/").filter(Boolean).map((p) => {
      try {
        return decodeURIComponent(p);
      } catch (e) {
        return p;
      }
    });
    if (host === "youtube.com") {
      platform = "youtube";
      if (!parts.length || parts[0] === "feed") feed = true; // 유튜브 메인 → 내 구독 피드
      else if (parts[0].startsWith("@")) handle = parts[0].slice(1);
      else if (parts[0] === "channel" && /^UC[\w-]{22}$/.test(parts[1] || "")) channelId = parts[1];
      else if ((parts[0] === "c" || parts[0] === "user") && parts[1])
        resolveUrl = "https://www.youtube.com/" + parts[0] + "/" + encodeURIComponent(parts[1]);
      else if (parts[0] === "watch" || parts[0] === "shorts") return { error: VIDEO_MSG };
      else return { error: "인식하지 못한 유튜브 주소입니다. 채널 주소(@이름)나 유튜브 메인 주소를 넣어 주세요." };
    } else if (host === "youtu.be") {
      return { error: VIDEO_MSG };
    } else if (host === "x.com" || host === "twitter.com") {
      platform = "x";
      if (!parts.length || parts[0] === "home") feed = true; // X 메인 → 홈 타임라인
      else handle = parts[0];
    } else if (host === "instagram.com") {
      platform = "instagram";
      if (!parts.length) feed = true; // 인스타그램 메인 → 홈 피드
      else handle = parts[0];
    } else {
      return { error: "지원하지 않는 사이트입니다. 유튜브·X·인스타그램 주소만 넣을 수 있습니다." };
    }
  } else {
    handle = s.replace(/^@/, "");
  }

  if (feed) return { account: { id: platform + ":feed", platform, handle: "", kind: "feed" } };
  if (!handle && !channelId && !resolveUrl) return { error: "계정을 인식하지 못했습니다. @이름이나 프로필 주소를 입력하세요." };
  if (handle && (!/^[^\s/?#@]{1,60}$/.test(handle) || RESERVED.has(handle.toLowerCase()))) {
    return { error: "계정 이름을 인식하지 못했습니다. @이름 형태로 입력하세요." };
  }
  const key = (handle || channelId || resolveUrl).toLowerCase();
  const account = { id: platform + ":" + key, platform, handle };
  if (channelId) account.channelId = channelId;
  if (resolveUrl) account.resolveUrl = resolveUrl;
  return { account };
}



/* ---------- 이벤트 ---------- */
$("q").addEventListener("input", renderList);
function needPick() { const b = $("selBar"); b.classList.add("need"); setTimeout(() => b.classList.remove("need"), 900); }
$("selClear").addEventListener("click", () => { selIds = []; renderTracked(); });
// 고른 계정 전부에 적용합니다.
async function applyToSelected(change) {
  if (!selIds.length) { needPick(); return; }
  const ids = new Set(selIds), before = tracked;
  tracked = tracked.map((t) => (ids.has(t.id) ? change({ ...t }) : t));
  renderTracked(); renderList();
  try { await saveTracked(); } catch (e) { tracked = before; renderTracked(); renderList(); showErr(e); }
}
$("groupForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const name = $("gName").value.trim().slice(0, 30);
  await applyToSelected((c) => { if (name) c.group = name; else delete c.group; return c; });
  if (selIds.length) $("gName").value = "";
});
$("gClear").addEventListener("click", () => applyToSelected((c) => { delete c.group; return c; }));
$("daysForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const d = Number($("dDays").value);
  applyToSelected((c) => { if (d) c.days = d; else delete c.days; return c; });
});
// 제거: 선택한 계정을 추적 목록에서 지웁니다(그 계정으로 모은 글도 함께). 확인 창에서 한 번 더 확인합니다.
const closeRm = () => { $("rmModal").hidden = true; };
$("selRemove").addEventListener("click", () => {
  if (!selIds.length) { needPick(); return; }
  $("rmList").textContent = selIds.map((id) => { const t = tracked.find((x) => x.id === id); return t ? PLATFORM[t.platform] + " " + (t.kind === "feed" ? FEED[t.platform] : t.handle ? "@" + t.handle : t.channelId || "") : ""; }).filter(Boolean).join(" · ");
  $("rmModal").hidden = false;
  $("rmCancel").focus();
});
$("rmX").addEventListener("click", closeRm);
$("rmCancel").addEventListener("click", closeRm);
$("rmModal").addEventListener("click", (e) => { if (e.target === $("rmModal")) closeRm(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("rmModal").hidden) closeRm(); });
$("rmOk").addEventListener("click", async () => {
  closeRm();
  const ids = selIds.slice(), set = new Set(ids);
  if (!ids.length) return;
  tracked = tracked.filter((x) => !set.has(x.id));
  items = items.filter((it) => !set.has(it.via)); // 이 계정으로 모은 글도 함께 지웁니다
  savedItems = savedItems.filter((it) => !set.has(it.via)); // 서버 저장본에서도 뺍니다
  selIds = [];
  ids.forEach((i) => removedIds.add(i)); // 확장이 아직 옛 목록을 돌려줘도 다시 나타나지 않게 합니다
  renderTracked(); renderTabs(); renderList();
  await saveTracked().catch(showErr);
  await call("removeVia", { ids }).catch(() => {}); // 확장이 구버전이면 글은 남습니다
});
// 추적 계정 저장: 저장하는 동안(그리고 직후 몇 초)에는 주기적 새로고침이 화면 목록을 옛 목록으로 되돌리지 않게 합니다.
async function saveTracked() {
  trackedHold = Date.now() + 8000;
  try { return await call("set", { tracked }); } finally { trackedHold = Date.now() + 4000; }
}
// 새로 추가하는 계정에서 가져올 기간(마지막 선택을 기억합니다). 추가한 뒤에는 '추적 계정 관리'에서 계정별로 바꿉니다.
// 주소나 @계정이 아니면(예: 그냥 이름) 추가하지 않고 이름으로 검색합니다.
const isDirect = (v) => /^https?:\/\//i.test(v) || v.startsWith("@") || SITE_START.test(v);
$("addForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const err = $("addError"); err.hidden = true;
  const raw = $("thandle").value.trim();
  if (raw && !isDirect(raw)) { $("searchBtn").click(); return; }
  const r = parseAccount($("tplatform").value, $("thandle").value);
  if (r.error) { err.textContent = r.error; err.hidden = false; return; }
  const acc = r.account;
  const grp = $("tgroup").value.trim().slice(0, 30);
  if (grp && acc.kind !== "feed") acc.group = grp;
  if (!acc.days) acc.days = Number($("addDays").value) || 30; // 이 계정만의 가져올 기간
  if (tracked.some((t) => t.id === acc.id)) { err.textContent = "이미 추가된 계정입니다."; err.hidden = false; return; }
  if (tracked.length >= MAX_TRACKED) { err.textContent = "계정은 최대 " + MAX_TRACKED + "개까지 추가할 수 있습니다."; err.hidden = false; return; }
  const before = tracked;
  tracked = [...tracked, acc];
  $("thandle").value = "";
  renderTracked(); renderList();
  try { await saveTracked(); } catch (e) { tracked = before; renderTracked(); showErr(e); return; }
  call("checkNow", { only: acc.id }).catch(showErr);
});
/* ---------- 이름으로 검색 ---------- */
function addAccount(acc) {
  const err = $("addError"); err.hidden = true;
  if (tracked.some((t) => t.id === acc.id)) { err.textContent = "이미 추가된 계정입니다."; err.hidden = false; return Promise.resolve(false); }
  if (tracked.length >= MAX_TRACKED) { err.textContent = "계정은 최대 " + MAX_TRACKED + "개까지 추가할 수 있습니다."; err.hidden = false; return Promise.resolve(false); }
  if (!acc.days) acc.days = Number($("addDays").value) || 30; // 이 계정만의 가져올 기간
  const before = tracked;
  tracked = [...tracked, acc];
  renderTracked(); renderList();
  return saveTracked().then(() => { call("checkNow", { only: acc.id }).catch(showErr); return true; }, (e) => { tracked = before; renderTracked(); showErr(e); return false; });
}
// 추가 버튼을 누르면 이 계정에서 가져올 기간을 모달에서 고릅니다(1W·2W·1M·2M). 기본은 1M입니다.
function pickPeriod() {
  const OPTS = [["7", "1W", "1주"], ["14", "2W", "2주"], ["30", "1M", "1개월"], ["60", "2M", "2개월"]];
  return new Promise((resolve) => {
    let cur = "30"; // 기본은 1M(30일)
    const done = (v) => { back.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") done(null); };
    const row = el("div", { class: "periodrow" });
    const drawPeriods = () => {
      row.textContent = "";
      OPTS.forEach(([v, label, tip]) => {
        const b = el("button", { type: "button", class: "pbtn" + (v === cur ? " on" : ""), title: tip, text: label });
        b.addEventListener("click", () => { cur = v; drawPeriods(); });
        row.appendChild(b);
      });
    };
    drawPeriods();
    // 묶음: 직접 입력하거나, 이미 있는 묶음 이름을 검색해서 고릅니다.
    const groups = Array.from(new Set(tracked.map((t) => t.group).filter(Boolean)));
    const gin = el("input", { type: "text", maxlength: "30", placeholder: "묶음 이름 (선택) · 기존 묶음 검색", "aria-label": "묶음 이름", autocomplete: "off" });
    const gbox = el("div", { class: "gchips" });
    const drawGroups = () => {
      const q = gin.value.trim().toLowerCase();
      gbox.textContent = "";
      groups.filter((g) => !q || g.toLowerCase().includes(q)).slice(0, 12).forEach((g) => {
        const c = el("button", { type: "button", class: "gchip" + (gin.value.trim() === g ? " on" : ""), text: g });
        c.addEventListener("click", () => { gin.value = g; drawGroups(); });
        gbox.appendChild(c);
      });
      gbox.hidden = !gbox.children.length;
    };
    gin.addEventListener("input", drawGroups);
    drawGroups();
    const ok = el("button", { type: "button", class: "primary", text: "추가" });
    ok.addEventListener("click", () => done({ days: Number(cur), group: gin.value.trim().slice(0, 30) }));
    gin.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); ok.click(); } });
    const x = el("button", { type: "button", class: "x", text: "×", "aria-label": "닫기" });
    x.addEventListener("click", () => done(null));
    const box = el("div", { class: "modal" }, [x, el("h2", { text: "가져올 기간" }), row, el("h2", { text: "묶음" }), gin, gbox, el("div", { class: "row" }, [ok])]);
    const back = el("div", { class: "modal-back", role: "dialog", "aria-modal": "true" }, [box]);
    back.addEventListener("click", (e) => { if (e.target === back) done(null); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(back);
    ok.focus();
  });
}
function fillResults(box, platform, list) {
  if (!list.length) {
    const needLog = platform !== "youtube" && loginState[platform] && loginState[platform].loggedIn === false;
    const why = platform === "youtube" ? "" : needLog ? " " + PLATFORM[platform] + "에 로그인되어 있는지 확인하세요." : " " + PLATFORM[platform] + "이 이름 검색을 막았거나 결과가 없을 수 있습니다. @아이디나 주소로 직접 추가해 보세요.";
    box.appendChild(el("p", { class: "hint", text: "검색 결과가 없습니다." + why }));
    if (needLog) box.appendChild(el("div", { class: "row", style: "padding:0 10px 10px" }, [loginLink(platform, PLATFORM[platform] + " 로그인 창 열기", "lb")]));
  }
  list.forEach((r) => {
    const key = (r.handle || r.channelId).toLowerCase();
    const acc = { id: platform + ":" + key, platform, handle: r.handle || "" };
    if (r.channelId) acc.channelId = r.channelId;
    const add = el("button", { type: "button", text: "추가" });
    add.addEventListener("click", async () => { const pk = await pickPeriod(); if (!pk) return; acc.days = pk.days; if (pk.group) acc.group = pk.group; add.disabled = true; if (await addAccount(acc)) { add.textContent = "추가됨"; if (r.avatar) storePic(acc.id, r.avatar).then((ok) => { if (ok) renderList(); }); } else add.disabled = false; });
    const initial = (r.name || r.handle || "?").trim().charAt(0).toUpperCase();
    const ph = (why) => el("span", { class: "ph", text: initial, title: why || "" });
    let thumb = ph("확장이 사진 주소를 읽지 못했습니다");
    const swap = (img, kind, src) => img.addEventListener("error", () => img.replaceWith(ph("사진 불러오기 실패(" + kind + "): " + String(src).slice(0, 80))));
    if (r.avatar) { thumb = el("img", { src: r.avatar, alt: "", referrerpolicy: "no-referrer" }); swap(thumb, "확장이 전달한 데이터", r.avatar); }
    else if (r.avatarUrl) {
      if (window.claude) { thumb = el("img", { alt: "", referrerpolicy: "no-referrer" }); loadImg(r.avatarUrl, thumb); }
      else { thumb = el("img", { src: r.avatarUrl, alt: "", referrerpolicy: "no-referrer" }); swap(thumb, "주소로 직접", r.avatarUrl); }
    }
    box.appendChild(el("div", { class: "res" }, [thumb, el("div", { class: "t" }, [el("b", { text: (() => { const n = (r.name || "").replace(/\s+/g, " ").trim(), h = Math.floor(n.length / 2); return n.length > 1 && n.length % 2 === 1 && n[h] === " " && n.slice(0, h) === n.slice(h + 1) ? n.slice(0, h) : n || "@" + (r.handle || r.channelId); })() }), el("span", { text: [r.handle ? "@" + r.handle : "", r.desc && r.desc.replace(/^@/, "").toLowerCase() !== String(r.handle || "").toLowerCase() ? r.desc : ""].filter(Boolean).join(" · ") })]), add]));
  });
}
$("searchBtn").addEventListener("click", async () => {
  const q = $("thandle").value.trim();
  const box = $("searchResults"), err = $("addError");
  err.hidden = true;
  if (!q) { err.textContent = "검색할 이름을 입력하세요."; err.hidden = false; return; }
  // 수집이 진행 중이면 이름 검색 창과 수집창이 서로 가려 수집이 일시정지되므로, 끝난 뒤에 검색하게 합니다.
  if (checkStatus && checkStatus.running) { err.textContent = "가져오는 중에는 이름 검색을 할 수 없습니다. 수집이 끝난 뒤 다시 눌러 주세요."; err.hidden = false; return; }
  const platform = $("tplatform").value;
  box.hidden = false; box.textContent = "";
  box.appendChild(el("p", { class: "hint", text: "검색 중… 크롬에서 탭이 잠깐 열렸다 닫힙니다." }));
  $("searchBtn").disabled = true;
  try {
    const list = await call("searchAccount", { platform, q }, 40000);
    box.textContent = "";
    fillResults(box, platform, list);
  } catch (e) { box.textContent = ""; showErr(e); box.hidden = true; }
  finally { $("searchBtn").disabled = false; }
});

// 지금 최신화: 먼저 로그인 상태를 확인하고, 로그인이 안 된 매체가 있으면 모달(로그인 하기)을 띄웁니다. 모두 로그인되어 있으면 바로 가져옵니다.
let refreshing = false;
async function startRefresh() {
  if (refreshing || !connected) return;
  refreshing = true;
  const btn = $("checkNow");
  btn.disabled = true; btn.classList.add("busy"); btn.title = "로그인 확인 중…";
  try {
    const plats = Array.from(new Set(tracked.filter((t) => settings[t.platform] !== false).map((t) => t.platform)));
    const t0 = Date.now();
    if (plats.length) {
      await call("checkLogin", { platforms: plats }).catch(() => {});
      // 확인 결과가 올 때까지 최대 약 30초 기다립니다(못 알아낸 매체는 막지 않고 진행합니다).
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        await refresh().catch(() => {});
        if (plats.every((p) => loginState[p] && loginState[p].at >= t0 - 1000)) break;
      }
    }
    const need = plats.filter((p) => loginState[p] && loginState[p].loggedIn === false);
    if (need.length) { openLoginModal(need); return; }
    await call("checkNow", { only: "" });
  } catch (e) { showErr(e); }
  finally { refreshing = false; btn.title = "지금 최신화"; btn.classList.toggle("busy", !!(checkStatus && checkStatus.running)); btn.disabled = !!(checkStatus && checkStatus.running) || tracked.length === 0; }
}
$("checkNow").addEventListener("click", startRefresh);
let clearArmed = null;
$("clear").addEventListener("click", async (e) => {
  e.stopPropagation(); // 메뉴가 닫히지 않게 합니다(한 번 더 눌러야 삭제)
  if (!clearArmed) { $("clear").textContent = "한 번 더 누르면 삭제됩니다"; clearArmed = setTimeout(() => { clearArmed = null; $("clear").textContent = "수집한 글 모두 삭제"; }, 4000); return; }
  clearTimeout(clearArmed); clearArmed = null; $("clear").textContent = "수집한 글 모두 삭제";
  savedItems = []; // 서버 저장본도 함께 비웁니다(다음 저장 때 반영)
  await call("clearItems").catch(showErr);
  $("acctMenu").hidden = true; $("connAcct").setAttribute("aria-expanded", "false");
});



// 추적 계정 패널의 두 탭: '추적 계정'(추가·가져오기) / '추적 계정 관리'(계정 목록·묶음·계정별 기간)
(function () {
  const show = (manage) => {
    $("ptAdd").hidden = manage; $("ptManage").hidden = !manage;
  };
  show(true);
})();

// 수집창을 닫아 수집이 종료됐을 때 뜨는 안내 모달
(function () {
  const close = () => { $("closedModal").hidden = true; };
  $("cmX").addEventListener("click", close);
  $("cmClose").addEventListener("click", close);
  $("closedModal").addEventListener("click", (e) => { if (e.target === $("closedModal")) close(); });
  $("cmRetry").addEventListener("click", () => { close(); startRefresh(); });
})();

// 수집이 일시정지됐을 때의 모달: 이어서 수집(수집창을 앞으로) / 닫기(수집 종료)
(function () {
  $("pmResume").addEventListener("click", () => { pauseDismissed = true; $("pausedModal").hidden = true; call("resumeCheck").catch(showErr); });
  $("pmClose").addEventListener("click", () => { pauseDismissed = true; $("pausedModal").hidden = true; call("cancelCheck").catch(showErr); });
})();
