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
function pickResume(cards) {
  // 글은 최신순입니다. 가장 최근에 확인한 글(맨 앞쪽 본 글)의 바로 앞에 있는, 더 최근의 안 본 글로 갑니다.
  const first = cards.findIndex((c) => seen.has(c._item.id));
  if (first === -1) return cards[cards.length - 1] || null;
  return first > 0 ? cards[first - 1] : null;
}
function flash(c) { c.classList.add("flash"); setTimeout(() => c.classList.remove("flash"), 1800); }
function addResumeButtons() {
  document.querySelectorAll("#grid .sec").forEach((sec) => {
    const head = sec.querySelector(".sec-head"), row = sec.querySelector(".row-cards");
    if (!head || !row || head.querySelector(".resume")) return;
    const b = el("button", { type: "button", class: "resume", text: "이어보기 ›", title: "가장 최근에 확인한 글보다 더 새로운 안 본 글로 이동" });
    b.addEventListener("click", () => {
      const cards = Array.from(row.children).filter((n) => n._item);
      const target = pickResume(cards);
      if (!target) { b.textContent = "더 새로운 글 없음"; setTimeout(() => { b.textContent = "이어보기 ›"; }, 1500); return; }
      row.scrollTo({ left: Math.max(0, target.offsetLeft - row.offsetLeft - 8), behavior: "smooth" });
      flash(target);
    });
    head.appendChild(b);
  });
  // 세로 격자 화면(출처 탭, 한 사람 전체 보기 등)은 오른쪽 아래 떠 있는 버튼으로 이동합니다.
  const grid = document.querySelector("#grid.cards, #grid .cards");
  let fab = $("resumeFab");
  if (grid && Array.from(grid.children).some((n) => n._item)) {
    if (!fab) {
      fab = el("button", { id: "resumeFab", type: "button", class: "primary", text: "안 본 글로 ↓" });
      fab.addEventListener("click", () => {
        const g2 = document.querySelector("#grid.cards, #grid .cards");
        const target = g2 && pickResume(Array.from(g2.children).filter((n) => n._item));
        if (!target) { fab.textContent = "더 새로운 글 없음"; setTimeout(() => { fab.textContent = "안 본 글로 ↓"; }, 1500); return; }
        target.scrollIntoView({ block: "center", behavior: "smooth" });
        flash(target);
      });
      document.body.appendChild(fab);
    }
  } else if (fab) fab.remove();
}
new MutationObserver(() => addResumeButtons()).observe($("grid"), { childList: true, subtree: true });

renderAll();
initStore();
try { const t = localStorage.getItem("snsToken"); if (t) connect(t, false); } catch (e) {}
