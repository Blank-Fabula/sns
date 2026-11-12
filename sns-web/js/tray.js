
/* ---- 매체별 트레이: 카드가 한 칸에 다 안 채워지면(카드 수 < 보이는 칸 수) 트레이를 카드 수만큼만 줄임 ---- */
(function () {
  let raf = 0, busy = false;
  function fit() {
    raf = 0; busy = true;
    const trays = document.querySelectorAll("#grid .media-grid > .sec[data-plat]");
    trays.forEach((t) => {
      const row = t.querySelector(".row-cards"); if (!row) return;
      const cards = [...row.children];
      t.style.width = ""; t.style.justifySelf = ""; cards.forEach((c) => { c.style.flexBasis = ""; });
    });
    trays.forEach((t) => {
      const row = t.querySelector(".row-cards"); if (!row) return;
      const cards = [...row.children]; if (!cards.length) return;
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const cw = cards[0].getBoundingClientRect().width; if (!cw) return;
      const vis = Math.max(1, Math.round((row.clientWidth + gap) / (cw + gap)));
      if (cards.length >= vis) return;
      const cs = getComputedStyle(t);
      const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      cards.forEach((c) => { c.style.flexBasis = cw + "px"; });
      t.style.justifySelf = "start"; t.style.width = Math.ceil(cards.length * cw + (cards.length - 1) * gap + pad) + "px";
    });
    busy = false;
  }
  const sched = () => { if (!raf && !busy) raf = requestAnimationFrame(fit); };
  function start() {
    const g = document.getElementById("grid"); if (!g) return;
    new MutationObserver(sched).observe(g, { childList: true, subtree: true });
    new ResizeObserver(sched).observe(g);
    window.addEventListener("resize", sched); sched();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();

/* ---- 계정 찾기 결과 창: 가로 폭을 [검색창 + 계정 찾기 버튼] 줄과 정확히 맞춤 ---- */
(function () {
  let raf = 0;
  function align() {
    raf = 0;
    const r = document.getElementById("sResults"), sb = document.querySelector("header .sbox, .sbox"), go = document.getElementById("sGo");
    if (!r || !sb || !go || r.hidden) return;
    const a = sb.getBoundingClientRect(), b = go.getBoundingClientRect();
    if (!a.width || !b.width) return;
    r.style.left = "0"; r.style.right = "auto"; r.style.minWidth = "0"; r.style.maxWidth = "none";
    r.style.width = Math.round(b.right - a.left) + "px";
  }
  const sched = () => { if (!raf) raf = requestAnimationFrame(align); };
  function start() {
    const r = document.getElementById("sResults"); if (!r) return;
    new MutationObserver(sched).observe(r, { attributes: true, attributeFilter: ["hidden"], childList: true });
    window.addEventListener("resize", sched); sched();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
