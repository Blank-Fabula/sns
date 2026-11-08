/* 데스크톱: 카드 줄 위에서 휠을 돌리면 그 줄이 좌우로, 스크롤바 칸 위에서 돌리면 화면이 세로로 움직입니다(글 영역 자체의 세로 휠 스크롤은 막음) */
const wheelAnim = new WeakMap();
// 스크롤바 휠 이동을 부드럽게(목표 위치로 조금씩 따라가기)
const vAnim = { el: null, target: 0, raf: 0 };
function vScroll(el, d) {
  if (vAnim.el !== el || !vAnim.raf) { vAnim.el = el; vAnim.target = el.scrollTop; }
  vAnim.target = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, vAnim.target + d));
  if (vAnim.raf) return;
  const step = () => {
    const diff = vAnim.target - el.scrollTop;
    if (Math.abs(diff) < 0.5) { el.scrollTop = vAnim.target; vAnim.raf = 0; return; }
    el.scrollTop += Math.sign(diff) * Math.max(1, Math.abs(diff) * 0.18);
    vAnim.raf = requestAnimationFrame(step);
  };
  vAnim.raf = requestAnimationFrame(step);
}
document.addEventListener("wheel", (ev) => {
  if (ev.ctrlKey || window.innerWidth < 861 || !ev.target.closest) return;
  const dy = ev.deltaMode === 1 ? ev.deltaY * 40 : ev.deltaY;
  // 스크롤바 칸 위에서는 휠이 글 영역(또는 설정·추적 화면)을 세로로 움직입니다
  if (ev.target.closest("#vbar")) {
    const el = ["setPanel", "trackPanel", "grid"].map((i) => document.getElementById(i)).find((e) => e && !e.hidden && e.offsetParent !== null);
    if (el) {
      ev.preventDefault();
      // 휠 한 칸이 막대를 같은 거리만큼 움직이도록, 내용이 길수록 한 번에 더 많이 이동
      const vb = document.getElementById("vbar"), room = vb.clientHeight - 12 - Math.min(120, vb.clientHeight - 12), max = el.scrollHeight - el.clientHeight;
      vScroll(el, room > 0 ? dy * max / room : dy);
    }
    return;
  }
  // 글 영역에서는 세로 휠 스크롤을 막고, 카드 줄 위에서는 그 줄을 좌우로 움직입니다
  if (!ev.target.closest("#grid") || Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) return;
  ev.preventDefault();
  const row = ev.target.closest(".row-cards");
  if (!row) return;
  const max = row.scrollWidth - row.clientWidth;
  if (max <= 0) return;
  let st = wheelAnim.get(row);
  const cur = st && st.raf ? st.target : row.scrollLeft;
  if ((cur <= 0 && dy < 0) || (cur >= max - 1 && dy > 0)) return;
  if (!st) { st = { target: row.scrollLeft, raf: 0 }; wheelAnim.set(row, st); }
  if (!st.raf) st.target = row.scrollLeft;
  // 휠 한 번 = 카드 한 장(폭+간격)씩, 부드럽게 이동
  const kid = Array.from(row.children).find((c) => c.offsetWidth);
  const unit = kid ? kid.offsetWidth + 4 : 240;
  const now = Date.now();
  if (st.last && now - st.last < 60) { return; } // 트랙패드 연속 이벤트는 한 번으로 묶기
  st.last = now;
  const base = st.raf ? st.target : Math.round(row.scrollLeft / unit) * unit;
  st.target = Math.max(0, Math.min(max, base + (dy > 0 ? unit : -unit)));
  wheelRun(row, st);
}, { passive: false });

// 가장 가까운 카드의 왼쪽 끝 위치(첫 카드가 놓인 자리를 0으로 본 스크롤 값)
function snapPos(row, t) {
  const kids = Array.from(row.children).filter((c) => c.offsetWidth);
  if (!kids.length) return t;
  const base = kids[0].offsetLeft;
  let best = 0, d = Infinity;
  kids.forEach((c) => { const p = c.offsetLeft - base; const dd = Math.abs(p - t); if (dd < d) { d = dd; best = p; } });
  return best;
}
function wheelRun(row, st) {
  row.classList.add("wheeling");
  if (st.raf) return;
  const step = () => {
    const diff = st.target - row.scrollLeft;
    if (Math.abs(diff) < 1) { row.scrollLeft = st.target; st.raf = 0; row.classList.remove("wheeling"); return; }
    row.scrollLeft += Math.sign(diff) * Math.max(1, Math.abs(diff) * 0.16);
    st.raf = requestAnimationFrame(step);
  };
  st.raf = requestAnimationFrame(step);
}

/* 이어보기: 마지막으로 확인한 글 바로 다음의 안 본 글(없으면 첫 안 본 글)로 이동합니다. */
function pickResume(cards, dir) {
  // 글은 최신순(앞 = 더 최근)입니다. 본 글 기록을 기준으로 두 방향 중 하나를 고릅니다.
  const idx = [];
  cards.forEach((c, i) => { if (seen.has(c._item.id)) idx.push(i); });
  if (dir === "new") {
    // 최신글 이어보기: 가장 최근에 본 글 바로 앞의 안 본(더 새로운) 글
    if (!idx.length) return cards[cards.length - 1] || null;
    return idx[0] > 0 ? cards[idx[0] - 1] : null;
  }
  // 이전글 이어보기: 안 본 글 중 가장 최신 글
  return cards.find((c) => !seen.has(c._item.id)) || null;
}
function flash(c) { c.classList.add("flash"); setTimeout(() => c.classList.remove("flash"), 1800); }
const RESUME_LABEL = { new: "‹", old: "›" };
const RESUME_NONE = { new: "더 새로운 글 없음", old: "안 본 글 없음" };
const RESUME_TITLE = { new: "최신글 이어보기: 가장 최근에 확인한 글보다 더 새로운 안 본 글로 이동", old: "이전글 이어보기: 안 본 글 중 가장 최신 글로 이동" };
let noticeTimer = 0;
function showNotice(text) {
  let n = $("notice");
  if (!n) { n = el("div", { id: "notice", role: "status" }); document.body.appendChild(n); }
  n.textContent = text; n.classList.add("show");
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => n.classList.remove("show"), 1600);
}
// ‹ 이어보기 › : 왼쪽은 더 새로운 글, 오른쪽은 이전 글로 이어서 봅니다.
function resumeGroup(cls, run) {
  return el("span", { class: "resumegrp" }, [resumeBtn("new", { class: cls, "aria-label": "최신글 이어보기" }, run), el("span", { class: "rl", text: "이어보기" }), resumeBtn("old", { class: cls, "aria-label": "이전글 이어보기" }, run)]);
}
function resumeBtn(dir, extra, run) {
  const b = el("button", Object.assign({ type: "button", text: RESUME_LABEL[dir], title: RESUME_TITLE[dir] }, extra));
  b.addEventListener("click", () => { if (!run(dir)) showNotice(RESUME_NONE[dir]); });
  return b;
}
// 찾은 글로 이동하고, 그 글을 바로 엽니다(이전/다음 이동도 같은 줄 기준으로 됩니다).
function openResume(target) {
  flash(target);
  setViewCtx(target, target._item);
  openItem(target._item);
}
const SHOW_RESUME = false; // 이어보기 버튼은 일단 숨김(true로 바꾸면 다시 나타납니다)
function addResumeButtons() {
  if (!SHOW_RESUME) { const f0 = $("resumeFab"); if (f0) f0.remove(); return; }
  document.querySelectorAll("#grid .sec").forEach((sec) => {
    const head = sec.querySelector(".sec-head"), row = sec.querySelector(".row-cards");
    if (!head || !row || head.querySelector(".resume") || head.querySelector(".namelink")) return; // 사람별 제목 줄에는 이어보기를 두지 않습니다
    const run = (dir) => {
      const target = pickResume(Array.from(row.children).filter((n) => n._item), dir);
      if (!target) return false;
      row.scrollTo({ left: Math.max(0, target.offsetLeft - row.offsetLeft - 8), behavior: "smooth" });
      openResume(target);
      return true;
    };
    head.appendChild(resumeGroup("resume", run));
  });
  // 세로 격자 화면(출처 탭, 한 사람 전체 보기 등)은 오른쪽 아래 떠 있는 버튼으로 이동합니다.
  const grid = document.querySelector("#grid.cards, #grid .cards");
  let fab = $("resumeFab");
  if (grid && Array.from(grid.children).some((n) => n._item)) {
    if (!fab) {
      fab = el("div", { id: "resumeFab" });
      const run = (dir) => {
        const g2 = document.querySelector("#grid.cards, #grid .cards");
        const target = g2 && pickResume(Array.from(g2.children).filter((n) => n._item), dir);
        if (!target) return false;
        target.scrollIntoView({ block: "center", behavior: "smooth" });
        openResume(target);
        return true;
      };
      fab.appendChild(resumeGroup("primary", run));
      document.body.appendChild(fab);
    }
  } else if (fab) fab.remove();
}
new MutationObserver(() => addResumeButtons()).observe($("grid"), { childList: true, subtree: true });

renderAll();
initStore();
try { const t = localStorage.getItem("snsToken"); if (t) connect(t, false); } catch (e) {}

/* ---------- 화이트/다크 모드 전환 (기본은 화이트) ---------- */
(function () {
  const root = document.documentElement, btn = $("themeBtn");
  const apply = (dark) => {
    if (dark) root.setAttribute("data-theme", "dark"); else root.removeAttribute("data-theme");
    btn.textContent = dark ? "☀ 화이트 모드로 전환" : "☾ 다크 모드로 전환";
  };
  apply(root.getAttribute("data-theme") === "dark");
  btn.addEventListener("click", () => {
    const dark = root.getAttribute("data-theme") !== "dark";
    apply(dark);
    try { localStorage.setItem("snsTheme", dark ? "dark" : "light"); } catch (e) {}
  });
})();

/* ---------- 통합 검색창 왼쪽: 검색할 매체 설정 버튼 ---------- */
(function () {
  const ALL = ["youtube", "x", "instagram"], btn = $("sScope"), menu = $("sMenu"), icons = $("sScopeIcons");
  // "전체" 아이콘: 왼쪽 위 로고(겹친 세 원)와 같은 그림
  const allIcon = () => { const w = document.createElement("span"); w.className = "allico"; w.innerHTML = '<svg viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="28" fill="#2a2928"/><circle cx="21" cy="23" r="9" fill="#fff" fill-opacity=".95"/><circle cx="35" cy="23" r="9" fill="#fff" fill-opacity=".6"/><circle cx="28" cy="35" r="9" fill="#fff" fill-opacity=".35"/></svg>'; return w; };
  const save = () => { try { localStorage.setItem("snsSearchPlats", JSON.stringify(searchPlats)); } catch (e) {} };
  const render = () => {
    icons.textContent = "";
    if (searchPlats.length === ALL.length) icons.appendChild(el("span", { class: "si" }, [allIcon()]));
    else ALL.filter((p) => searchPlats.includes(p)).forEach((p) => icons.appendChild(el("span", { class: "si" }, [pIcon(p)])));
    btn.title = "검색할 매체: " + (searchPlats.length === ALL.length ? "전체" : searchPlats.map((p) => PLATFORM[p]).join(", "));
    menu.textContent = "";
    // 전체 / 유튜브 / X / 인스타그램 중 하나만 고릅니다(전체 = 세 매체 모두).
    const isAll = searchPlats.length === ALL.length;
    const opts = [["all", "전체"], ...ALL.map((p) => [p, PLATFORM[p]])];
    opts.forEach(([k, label]) => {
      const on = k === "all" ? isAll : !isAll && searchPlats[0] === k;
      const glyph = k === "all" ? el("span", { class: "si lg" }, [allIcon()]) : el("span", { class: "si lg" }, [pIcon(k)]);
      const b = el("button", { type: "button", class: "sopt" + (on ? " on" : ""), role: "menuitemradio", "aria-checked": String(on), "aria-label": label, title: label }, [glyph]);
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        searchPlats = k === "all" ? ALL.slice() : [k];
        save(); render(); renderList(); setOpen(false);
      });
      menu.appendChild(b);
    });
  };
  function setOpen(o) { menu.hidden = !o; btn.setAttribute("aria-expanded", String(o)); }
  btn.addEventListener("click", (e) => { e.stopPropagation(); setOpen(menu.hidden); });
  document.addEventListener("click", (e) => { if (!e.target.closest(".sbox")) setOpen(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
  render();
})();

/* ---------- 통합 검색: 입력 + Enter(또는 돋보기)로 선택한 매체 전부에서 계정 검색 ---------- */
(function () {
  const q = $("q"), go = $("sGo"), box = $("sResults");
  let busy = false;
  const close = () => { box.hidden = true; };
  const refreshGo = () => { go.hidden = false; };
  setInterval(refreshGo, 1000); refreshGo();
  const run = async () => {
    const name = q.value.trim();
    if (!name || busy) return;
    if (!connected) { box.hidden = false; box.textContent = ""; box.appendChild(el("p", { class: "hint", text: "확장 프로그램과 연결되어 있어야 계정을 찾을 수 있습니다." })); return; }
    if (checkStatus && checkStatus.running) { box.hidden = false; box.textContent = ""; box.appendChild(el("p", { class: "hint", text: "가져오는 중에는 계정 검색을 할 수 없습니다. 수집이 끝난 뒤 다시 눌러 주세요." })); return; }
    busy = true; go.disabled = true;
    box.hidden = false; box.textContent = "";
    const head = el("div", { class: "sr-head" }, [el("b", { text: "“" + name + "” 계정 검색" })]);
    const x = el("button", { type: "button", class: "x", text: "×", "aria-label": "닫기" });
    x.addEventListener("click", close); head.appendChild(x);
    box.appendChild(head);
    for (const p of ["instagram", "x", "youtube"].filter((p) => searchPlats.includes(p))) {
      const sec = el("div", { class: "sr-sec" });
      sec.appendChild(el("div", { class: "sr-plat" }, [el("span", { class: "si" }, [pIcon(p)]), el("span", { text: PLATFORM[p] })]));
      const body = el("div", { class: "sr-body" });
      body.appendChild(el("p", { class: "hint", text: "검색 중… 크롬에서 탭이 잠깐 열렸다 닫힙니다." }));
      sec.appendChild(body); box.appendChild(sec);
      try {
        const list = await call("searchAccount", { platform: p, q: name }, 40000);
        body.textContent = "";
        fillResults(body, p, list);
      } catch (e) { body.textContent = ""; body.appendChild(el("p", { class: "hint", text: "검색하지 못했습니다: " + ((e && e.message) || "오류") })); }
    }
    busy = false; go.disabled = false;
  };
  go.addEventListener("click", run);
  q.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); run(); } });
  document.addEventListener("click", (e) => { if (!busy && !e.target.closest(".sbox")) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !busy) close(); });
})();

/* ---------- 상단 홈 / 추적 계정 관리 버튼 ---------- */
$("navHome").addEventListener("click", () => { page = "home"; applyPage(); renderList(); window.scrollTo(0, 0); });
$("themeSwitch").addEventListener("click", () => { $("themeBtn").click(); const d = document.documentElement.getAttribute("data-theme") === "dark"; $("themeSwitch").setAttribute("aria-checked", String(d)); });
{ const d = document.documentElement.getAttribute("data-theme") === "dark"; $("themeSwitch").setAttribute("aria-checked", String(d)); }
$("brand").addEventListener("click", () => $("navHome").click());
$("navFav").addEventListener("click", () => { page = "fav"; activeTab = "people"; personFocus = ""; personPlat = ""; applyPage(); renderList(); window.scrollTo(0, 0); });
$("navManage").addEventListener("click", () => { page = "manage"; applyPage(); window.scrollTo(0, 0); });

/* ---------- 벤토 디자인: 계정 메뉴 항목을 '설정' 화면(별도 탭)으로 ---------- */
(function () {
  const root = document.documentElement;
  const ids = ["menuWho", "themeBtn", "menuSettings", "clear", "connOut"];
  const place = () => {
    const bento = root.getAttribute("data-design") === "bento";
    const dest = $(bento ? "setBody" : "acctMenu");
    ids.forEach((i) => dest.appendChild($(i)));
    if (!bento) { $("setPanel").hidden = true; $("setBack").hidden = true; }
    $("acctMenu").hidden = true;
  };
  // 벤토에서는 프로필 버튼이 설정 화면으로 이동시킵니다(클래식은 기존 드롭다운 그대로).
  $("connAcct").addEventListener("click", (e) => {
    if (root.getAttribute("data-design") !== "bento") return;
    e.stopImmediatePropagation(); e.preventDefault();
    setModal(!$("setPanel").hidden ? false : true);
  }, true);
  function setModal(open) {
    $("setPanel").hidden = !open; $("setBack").hidden = !open;
    document.body.classList.toggle("setOpen", open); $("connAcct").classList.toggle("on", open);
  }
  $("setBack").addEventListener("click", () => setModal(false));
  $("setClose").addEventListener("click", () => setModal(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("setPanel").hidden) setModal(false); });
  ["navHome", "navFav", "navManage"].forEach((i) => $(i).addEventListener("click", () => setModal(false)));
  place();
})();

// 글 영역(또는 설정·추적 화면)과 오른쪽 열 사이 빈틈에 세로 스크롤바를 그립니다.
(() => {
  const bar = document.getElementById("vbar");
  if (!bar) return;
  document.body.appendChild(bar); // 다른 화면(설정·추적)에서 부모가 숨겨져도 보이도록 body 바로 아래로 옮깁니다
  const thumb = bar.firstElementChild;
  let drag = null;
  const THUMB = 120;
  const PAD = 6; // 손잡이가 바탕 박스 끝 밖으로 튀어나오지 않게 안쪽 여백
  const target = () => ["setPanel", "trackPanel", "grid"].map((i) => document.getElementById(i)).find((e) => e && !e.hidden && e.offsetParent !== null);
  function update() {
    const el = target();
    if (!el || window.innerWidth < 861) { bar.hidden = true; return; }
    bar.classList.toggle("idle", el.scrollHeight <= el.clientHeight + 1); // 스크롤할 내용이 없어도 바탕은 어느 화면에서나 보입니다
    const r = el.getBoundingClientRect();
    const side = document.getElementById("workCard") || document.getElementById("tabs");
    const sr = side && side.getBoundingClientRect();
    const hasGap = sr && sr.width > 0 && sr.left > r.right; // 오른쪽 열이 없는 화면(설정·추적)은 박스 안쪽 오른쪽 끝에 둡니다
    const gap = hasGap ? sr.left - r.right : 0;
    bar.hidden = false;
    bar.classList.toggle("inpanel", !hasGap);
    bar.style.left = hasGap ? r.right + (gap - 36) / 2 + "px" : r.right - 36 - 8 + "px";
    bar.style.top = r.top + "px";
    bar.style.height = Math.max(40, r.height) + "px";
    const th = Math.min(THUMB, bar.clientHeight - 2 * PAD); // 내용 길이와 상관없이 고정 길이
    const room = bar.clientHeight - 2 * PAD - th;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    thumb.style.height = th + "px";
    thumb.style.transform = `translateY(${max > 0 ? PAD + room * el.scrollTop / max : PAD}px)`;
  }
  const scrollTo = (y) => { const el = target(); if (!el) return; const th = thumb.offsetHeight, room = bar.clientHeight - 2 * PAD - th, max = el.scrollHeight - el.clientHeight; el.scrollTop = room > 0 ? Math.max(0, Math.min(1, (y - PAD) / room)) * max : 0; };
  thumb.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); thumb.setPointerCapture(e.pointerId); drag = e.clientY - thumb.getBoundingClientRect().top; bar.classList.add("drag"); });
  thumb.addEventListener("pointermove", (e) => { if (drag !== null) scrollTo(e.clientY - bar.getBoundingClientRect().top - drag); });
  const end = () => { drag = null; bar.classList.remove("drag"); };
  thumb.addEventListener("pointerup", end); thumb.addEventListener("pointercancel", end);
  bar.addEventListener("pointerdown", (e) => { if (e.target === bar) scrollTo(e.clientY - bar.getBoundingClientRect().top - thumb.offsetHeight / 2); });
  ["grid", "setPanel", "trackPanel"].forEach((i) => { const e = document.getElementById(i); if (e) e.addEventListener("scroll", update, { passive: true }); });
  window.addEventListener("resize", update);
  new MutationObserver(() => requestAnimationFrame(update)).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "style", "class"] });
  setInterval(update, 800);
  update();
})();

// 카드 줄: 왼쪽으로 넘겨진 상태면 왼쪽 끝에도 약한 흐림(.sl)
(function () {
  const mark = (el) => { if (el && el.classList && el.classList.contains("row-cards")) el.classList.toggle("sl", el.scrollLeft > 2); };
  document.addEventListener("scroll", (e) => mark(e.target), true);
})();
