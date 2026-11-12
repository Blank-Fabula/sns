
(function () {
  const hit = (r, x, y, pad) => x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
  const atTop = () => { const g = document.getElementById("grid"); return !!document.getElementById("storyBar") && (g ? g.scrollTop : 0) + window.scrollY < 6; };
  window.__sbTop = atTop;
  const setOpen = (on) => { window.__sbOpen = on; const bar = document.getElementById("storyBar"); if (bar) bar.classList.toggle("open", on); };
  document.addEventListener("mousemove", (e) => {
    const bar = document.getElementById("storyBar"); if (!bar) return;
    const br = bar.getBoundingClientRect();
    let inBar;
    if (window.__sbOpen) inBar = hit(br, e.clientX, e.clientY, 22);
    else { const cx = (br.left + br.right) / 2, hw = (parseFloat(bar.style.getPropertyValue("--isw")) || 66) / 2; inBar = hit({ left: cx - hw, right: cx + hw, top: br.top - 2, bottom: br.top + 40 }, e.clientX, e.clientY, 0); }
    const inMenu = !!modeMenuEl && hit(modeMenuEl.getBoundingClientRect(), e.clientX, e.clientY, 14);
    if (modeMenuEl && !inBar && !inMenu) closeModeMenu();     // 메뉴와 줄 밖으로 마우스가 나가면 메뉴도 닫습니다
    window.__sbHov = inBar || inMenu; setOpen(window.__sbHov || atTop());
  }, { passive: true });
  // 마우스가 화면(창) 밖으로 나가면 mousemove가 더 오지 않으므로 여기서 접습니다
  document.documentElement.addEventListener("mouseleave", () => { closeModeMenu(); window.__sbHov = false; setOpen(atTop()); });
  window.addEventListener("blur", () => { closeModeMenu(); window.__sbHov = false; setOpen(atTop()); });
  const syncTop = () => setOpen(!!window.__sbHov || atTop());
  { const g = document.getElementById("grid"); if (g) { g.addEventListener("scroll", syncTop, { passive: true }); new MutationObserver(syncTop).observe(g, { childList: true }); } }
  window.addEventListener("scroll", syncTop, { passive: true });
  setTimeout(syncTop, 0);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    const t = e.target, tag = t && t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
    const q = document.getElementById("q"); if (!q) return;
    e.preventDefault(); q.focus(); q.select();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.isComposing) return;
    const q = document.getElementById("q"); if (!q) return;
    if (document.querySelector(".modal-back:not([hidden])")) return;
    const v = document.getElementById("viewer"); if (v && !v.hidden) return;
    if (document.activeElement === q) { e.preventDefault(); if (q.value) { q.value = ""; q.dispatchEvent(new Event("input", { bubbles: true })); } q.blur(); return; }  // 검색창에서 ESC: 쓰던 글 바로 삭제하고 나오기
    if (q.value) { q.value = ""; q.dispatchEvent(new Event("input", { bubbles: true })); }  // 검색 초기화
  });
})();
