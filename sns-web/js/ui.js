/* 카드 줄 위에서 마우스 휠을 돌리면 그 줄이 부드럽게 좌우로 움직입니다(끝에 닿으면 페이지가 위아래로 움직임). */
const wheelAnim = new WeakMap();
document.addEventListener("wheel", (ev) => {
  const row = ev.target.closest && ev.target.closest(".row-cards");
  if (!row || ev.ctrlKey || Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) return;
  const max = row.scrollWidth - row.clientWidth;
  if (max <= 0) return; // 넘길 글이 없는 줄 위에서는 평소처럼 페이지가 스크롤됩니다
  const dy = ev.deltaMode === 1 ? ev.deltaY * 40 : ev.deltaY;
  let st = wheelAnim.get(row);
  const cur = st && st.raf ? st.target : row.scrollLeft;
  if ((cur <= 0 && dy < 0) || (cur >= max - 1 && dy > 0)) return;
  ev.preventDefault();
  if (!st) { st = { target: row.scrollLeft, raf: 0 }; wheelAnim.set(row, st); }
  if (!st.raf) st.target = row.scrollLeft;
  st.target = Math.max(0, Math.min(max, st.target + dy));
  row.classList.add("wheeling");
  if (st.raf) return;
  const step = () => {
    const diff = st.target - row.scrollLeft;
    if (Math.abs(diff) < 1) { row.scrollLeft = st.target; st.raf = 0; row.classList.remove("wheeling"); return; }
    row.scrollLeft += diff * 0.25;
    st.raf = requestAnimationFrame(step);
  };
  st.raf = requestAnimationFrame(step);
}, { passive: false });

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
  const save = () => { try { localStorage.setItem("snsSearchPlats", JSON.stringify(searchPlats)); } catch (e) {} };
  const render = () => {
    icons.textContent = "";
    if (searchPlats.length === ALL.length) icons.appendChild(el("span", { class: "si" }, [el("img", { src: "img/all.png", alt: "" })])); // 전체: 임시 이미지
    else ALL.filter((p) => searchPlats.includes(p)).forEach((p) => icons.appendChild(el("span", { class: "si" }, [pIcon(p)])));
    btn.title = "검색할 매체: " + (searchPlats.length === ALL.length ? "전체" : searchPlats.map((p) => PLATFORM[p]).join(", "));
    menu.textContent = "";
    // 전체 / 유튜브 / X / 인스타그램 중 하나만 고릅니다(전체 = 세 매체 모두).
    const isAll = searchPlats.length === ALL.length;
    const opts = [["all", "전체"], ...ALL.map((p) => [p, PLATFORM[p]])];
    opts.forEach(([k, label]) => {
      const on = k === "all" ? isAll : !isAll && searchPlats[0] === k;
      const glyph = k === "all" ? el("span", { class: "si lg" }, [el("img", { src: "img/all.png", alt: "" })]) : el("span", { class: "si lg" }, [pIcon(k)]);
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

/* ---------- 디자인 전환: 클래식 ↔ 벤토(계정 메뉴) ---------- */
(function () {
  const root = document.documentElement, btn = $("designBtn");
  const draw = () => { const b = root.getAttribute("data-design") === "bento"; btn.textContent = "디자인: " + (b ? "벤토 → 클래식으로" : "클래식 → 벤토로"); };
  btn.addEventListener("click", () => {
    const b = root.getAttribute("data-design") === "bento";
    if (b) root.removeAttribute("data-design"); else root.setAttribute("data-design", "bento");
    try { localStorage.setItem("snsDesign", b ? "classic" : "bento"); } catch (e) {}
    draw();
  });
  draw();
})();

/* ---------- 벤토 디자인: 계정 메뉴 항목을 '설정' 화면(별도 탭)으로 ---------- */
(function () {
  const root = document.documentElement;
  const ids = ["menuWho", "themeBtn", "designBtn", "menuSettings", "clear", "connOut"];
  const place = () => {
    const bento = root.getAttribute("data-design") === "bento";
    const dest = $(bento ? "setBody" : "acctMenu");
    ids.forEach((i) => dest.appendChild($(i)));
    if (!bento && page === "settings") { page = "home"; applyPage(); }
    $("acctMenu").hidden = true;
  };
  // 벤토에서는 프로필 버튼이 설정 화면으로 이동시킵니다(클래식은 기존 드롭다운 그대로).
  $("connAcct").addEventListener("click", (e) => {
    if (root.getAttribute("data-design") !== "bento") return;
    e.stopImmediatePropagation(); e.preventDefault();
    page = "settings"; applyPage(); window.scrollTo(0, 0);
  }, true);
  $("designBtn").addEventListener("click", () => setTimeout(() => { place(); renderList(); }, 0));
  place();
})();
