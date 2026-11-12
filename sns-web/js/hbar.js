/* ---------- 가로 스크롤바: 그룹 줄·카드 줄(게시물 영역) ----------
   화면 전체가 기본 스크롤바를 숨기므로(style.css), 옆으로 넘길 만큼 내용이 많을 때만 얇은 막대를 줄 아래쪽에 띄웁니다.
   - 마우스를 줄 위에 올리거나 실제로 옆으로 넘기면 보이고, 마우스가 떠나고 넘기기를 멈추면 잠시 뒤 사라집니다.
   - 대상은 게시물 카드 줄(.row-cards)과 위쪽 그룹 줄(.storybar)뿐입니다. 매체 이름 줄(.sec-head)은 넘기는 영역이 아닙니다.
   - 손잡이를 끌거나 막대 바탕을 누르면 그 줄이 넘어가고, 막대 위에서 휠을 돌려도 그 줄이 옆으로 넘어갑니다.
   막대는 하나만 두고 지금 대상 줄의 위치에 맞춰 옮깁니다(줄마다 만들지 않음). */
(() => {
  const SEL = ".row-cards, .storybar";
  const bar = el("div", { id: "hbar", "aria-hidden": "true" }, [el("i")]);
  const thumb = bar.firstChild;
  document.body.appendChild(bar);
  let cur = null, overRow = false, overBar = false, drag = null, hideT = 0;
  const scrollable = (r) => r && r.isConnected && r.offsetParent !== null && r.scrollWidth > r.clientWidth + 1;
  const place = () => {
    if (!scrollable(cur)) { bar.classList.remove("on"); return; }
    const sbEl = document.getElementById("storyBar");
    const folded = !!sbEl && !sbEl.classList.contains("open");
    if (folded && cur.classList.contains("storybar")) { bar.classList.remove("on"); return; }   // 접힌 그룹 줄에는 막대를 띄우지 않음
    const rc = cur.getBoundingClientRect();
    // 그룹 줄은 화면 위쪽에 붙어 있어 안쪽 아래 여백에, 카드 줄은 줄 바로 아래 틈에 놓습니다(카드를 가리지 않게).
    const inside = cur.classList.contains("storybar");
    const left = rc.left + (inside ? 14 : 0), width = rc.width - (inside ? 28 : 0);
    const top = inside ? rc.bottom - 9 : rc.bottom + 1;
    // 카드 줄 막대는 글 영역 안에서 보이는 부분에만: 위에 붙은 그룹 줄 뒤나 글 영역 밖으로 가면 숨김(막대가 그룹 줄을 뚫고 보이지 않게)
    if (!inside) {
      const g = cur.closest("#grid"), gr = g ? g.getBoundingClientRect() : null;
      // 그룹 줄이 접혀 섬이면 섬 아래(위에서 약 42px)까지만 가립니다
      const sb = sbEl && sbEl.offsetParent !== null ? sbEl.getBoundingClientRect() : null;
      const clipTop = Math.max(gr ? gr.top : 0, sb ? (folded ? sb.bottom : sb.bottom) : 0);
      if (top < clipTop || (gr && top + 7 > gr.bottom)) { bar.classList.remove("on"); return; }
    }
    bar.style.left = left + "px"; bar.style.width = width + "px";
    bar.style.top = top + "px";
    const tw = Math.max(36, width * cur.clientWidth / cur.scrollWidth);
    const mx = cur.scrollWidth - cur.clientWidth;
    thumb.style.width = tw + "px";
    thumb.style.transform = "translateX(" + ((width - tw) * (mx > 0 ? cur.scrollLeft / mx : 0)) + "px)";
    bar.classList.add("on");
  };
  const update = () => place();   // 스크롤 이벤트는 화면을 그릴 때마다 한 번꼴이라 바로 맞춰도 가볍습니다
  const hideLater = (ms) => {
    clearTimeout(hideT);
    hideT = setTimeout(() => { if (!overRow && !overBar && !drag) { bar.classList.remove("on"); cur = null; } }, ms);
  };
  const show = (r) => { if (!scrollable(r)) return; cur = r; clearTimeout(hideT); update(); };
  document.addEventListener("pointerover", (e) => {
    if (e.pointerType === "touch") return;
    const r = e.target.closest ? e.target.closest(SEL) : null;
    if (e.target.closest && e.target.closest("#hbar")) return;
    if (r) { overRow = true; show(r); } else if (overRow) { overRow = false; hideLater(700); }
  });
  document.addEventListener("pointerout", (e) => {
    if (e.pointerType === "touch" || !cur) return;
    const to = e.relatedTarget;
    if (!to || !(cur.contains(to) || bar.contains(to))) { overRow = false; hideLater(700); }
  });
  // 줄을 옆으로 넘길 때(휠·끌기·트랙패드·터치) 보여 주고, 글 영역이 세로로 움직이면 막대도 따라갑니다.
  document.addEventListener("scroll", (e) => {
    const t = e.target;
    if (t && t.matches && t.matches(SEL)) { show(t); if (!overRow && !overBar) hideLater(900); }
    else if (cur) update();
  }, true);
  window.addEventListener("resize", () => { if (cur) update(); });
  bar.addEventListener("pointerenter", () => { overBar = true; clearTimeout(hideT); });
  bar.addEventListener("pointerleave", () => { overBar = false; hideLater(700); });
  // 손잡이 끌기
  thumb.addEventListener("pointerdown", (e) => {
    if (!cur) return;
    e.preventDefault(); e.stopPropagation();
    drag = { x: e.clientX, left: cur.scrollLeft, r: cur };
    bar.classList.add("drag");
    try { thumb.setPointerCapture(e.pointerId); } catch (er) { /* 무시 */ }
  });
  thumb.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const r = drag.r, w = bar.clientWidth, tw = thumb.offsetWidth;
    const mx = r.scrollWidth - r.clientWidth;
    if (w - tw > 0) r.scrollLeft = drag.left + (e.clientX - drag.x) * mx / (w - tw);
  });
  const endDrag = () => { if (!drag) return; drag = null; bar.classList.remove("drag"); if (!overBar && !overRow) hideLater(700); };
  thumb.addEventListener("pointerup", endDrag);
  thumb.addEventListener("pointercancel", endDrag);
  thumb.addEventListener("lostpointercapture", endDrag);
  // 막대 바탕을 누르면 그쪽으로 한 화면만큼
  bar.addEventListener("pointerdown", (e) => {
    if (e.target !== bar || !cur) return;
    e.preventDefault();
    const tr = thumb.getBoundingClientRect();
    cur.scrollBy({ left: (e.clientX < tr.left ? -1 : 1) * cur.clientWidth * 0.9, behavior: "smooth" });
  });
  // 막대 위에서 돌린 휠은 그 줄을 옆으로
  bar.addEventListener("wheel", (e) => {
    if (!cur) return;
    e.preventDefault(); e.stopPropagation();
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    cur.scrollBy({ left: (e.deltaMode === 1 ? d * 40 : d) * 2, behavior: "auto" });
  }, { passive: false });
})();

