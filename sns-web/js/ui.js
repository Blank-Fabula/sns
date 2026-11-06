/* 카드 줄 위에서 마우스 휠을 돌리면 그 줄이 부드럽게 좌우로 움직입니다(끝에 닿으면 페이지가 위아래로 움직임). */
const wheelAnim = new WeakMap();
document.addEventListener("wheel", (ev) => {
  const row = ev.target.closest && ev.target.closest(".row-cards");
  if (!row || ev.ctrlKey || Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) return;
  const max = row.scrollWidth - row.clientWidth;
  if (max <= 0) return;
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
const RESUME_LABEL = { new: "‹ 최신글 이어보기", old: "이전글 이어보기 ›" };
const RESUME_NONE = { new: "더 새로운 글 없음", old: "안 본 글 없음" };
const RESUME_TITLE = { new: "가장 최근에 확인한 글보다 더 새로운 안 본 글로 이동", old: "안 본 글 중 가장 최신 글로 이동" };
function resumeBtn(dir, extra, run) {
  const b = el("button", Object.assign({ type: "button", text: RESUME_LABEL[dir], title: RESUME_TITLE[dir] }, extra));
  b.addEventListener("click", () => {
    if (!run(dir)) { b.textContent = RESUME_NONE[dir]; setTimeout(() => { b.textContent = RESUME_LABEL[dir]; }, 1500); }
  });
  return b;
}
function addResumeButtons() {
  document.querySelectorAll("#grid .sec").forEach((sec) => {
    const head = sec.querySelector(".sec-head"), row = sec.querySelector(".row-cards");
    if (!head || !row || head.querySelector(".resume")) return;
    const run = (dir) => {
      const target = pickResume(Array.from(row.children).filter((n) => n._item), dir);
      if (!target) return false;
      row.scrollTo({ left: Math.max(0, target.offsetLeft - row.offsetLeft - 8), behavior: "smooth" });
      flash(target);
      return true;
    };
    head.appendChild(resumeBtn("new", { class: "resume" }, run));
    head.appendChild(resumeBtn("old", { class: "resume" }, run));
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
        flash(target);
        return true;
      };
      fab.appendChild(resumeBtn("new", { class: "primary" }, run));
      fab.appendChild(resumeBtn("old", { class: "primary" }, run));
      document.body.appendChild(fab);
    }
  } else if (fab) fab.remove();
}
new MutationObserver(() => addResumeButtons()).observe($("grid"), { childList: true, subtree: true });

renderAll();
initStore();
try { const t = localStorage.getItem("snsToken"); if (t) connect(t, false); } catch (e) {}
