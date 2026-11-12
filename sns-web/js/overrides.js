function paintIsl(bar) {
  const sel = [...(typeof storySel !== "undefined" ? storySel : [])];
  const txt = !sel.length ? "전체 그룹" : sel.length === 1 ? sel[0] : sel[0] + " 외 " + (sel.length - 1) + "개";
  const on = bar.querySelectorAll(".story.on");
  const dot = (on.length ? on : bar.querySelectorAll(".story")).length && [...(on.length ? on : bar.querySelectorAll(".story"))].some((e) => e.querySelector(".sdot"));
  const __c = (window.__islCtx = window.__islCtx || document.createElement("canvas").getContext("2d"));
  __c.font = '700 13px "Noto Sans KR", sans-serif';
  const w = Math.min(Math.ceil(__c.measureText(txt).width) + (dot ? 50 : 36), 420);
  bar.dataset.isl = txt; bar.dataset.new = dot ? "1" : "";
  bar.style.setProperty("--isw", w + "px");
}

/* ---- a의 첫 버튼: 전체 대신 "보기 기준" 버튼(그룹·유튜브·인스타·X 중 하나). 오른쪽 탭과 연동 ---- */
const MODES = [["people", "그룹"], ["youtube", "유튜브"], ["instagram", "인스타"], ["x", "X"]];
const MODE_LABEL = Object.fromEntries(MODES);
const isPlat = () => activeTab === "youtube" || activeTab === "x" || activeTab === "instagram";
function setMode(k) {
  if (k === "people") { personFocus = ""; personPlat = ""; }
  if (k !== activeTab) { __tabMemo[activeTab] = { sel: new Set(storySel), af: acctFocus }; const m = __tabMemo[k] || { sel: new Set(), af: "" }; storySel = new Set(m.sel); acctFocus = m.af; }
  activeTab = k; renderList();
}
function modeFace() {
  if (!isPlat()) return allFace();
  const s = el("span", { class: "sface sall mface", "aria-hidden": "true" });
  s.appendChild(pIcon(activeTab));
  return s;
}
function acctName(t) { return t.kind === "feed" ? (FEED[t.platform] || "") : t.handle ? "@" + t.handle : t.channelId || t.resolveUrl || ""; }
function storyData() {
  if (!isPlat()) return storyDataPeople() || { list: [], sel: new Set() };
  const hid = hiddenVias();
  const accs = tracked.filter((t) => t.kind !== "feed" && t.platform === activeTab && !hid.has(t.id));
  if (acctFocus && !accs.some((t) => t.id === acctFocus)) acctFocus = "";
  const byVia = new Map();
  for (const it of items) {
    if (!it.via || !inPeriod(it)) continue;
    let e = byVia.get(it.via);
    if (!e) byVia.set(it.via, (e = { unread: [], latest: 0 }));
    const t = publishedMs(it);
    if (t > e.latest) e.latest = t;
    if (!seen.has(it.id)) e.unread.push(it.id);
  }
  const list = accs.map((t) => {
    const p = { name: t.id, ids: new Set([t.id]), plats: new Set([t.platform]), accs: [t] };
    const e = byVia.get(t.id) || { unread: [], latest: 0 };
    return { p, unread: e.unread.slice(), latest: e.latest, chosen: t, on: acctFocus === t.id, acct: t };
  });
  list.sort((a, b) => __nt(b) - __nt(a) || (b.unread.length > 0) - (a.unread.length > 0) || b.latest - a.latest);
  return { list, sel: new Set(acctFocus ? [acctFocus] : []), plat: true };
}
function storySigOf(d) { return JSON.stringify([activeTab, d.sel.size, d.list.map((s) => [s.p.name, s.on, s.unread.length > 0, s.chosen ? s.chosen.id : "", s.chosen && picMap[s.chosen.id] ? picMap[s.chosen.id].length : 0])]); }
function toggleStory(name) {
  if (isPlat()) acctFocus = acctFocus === name ? "" : name;
  else storySel = storySel.has(name) ? new Set() : new Set([name]);
  afterStorySelect(name);
}
let modeMenuEl = null;
function closeModeMenu() { if (modeMenuEl) { modeMenuEl.remove(); modeMenuEl = null; } }
function openModeMenu(anchor) {
  if (modeMenuEl) { closeModeMenu(); return; }
  const m = el("div", { class: "smenu modemenu", role: "menu" });
  MODES.forEach(([k, label]) => {
    const glyph = el("span", { class: "si lg" }, [k === "people" ? allFace() : pIcon(k)]);
    const on = k === activeTab;
    const b = el("button", { type: "button", class: "sopt" + (on ? " on" : ""), role: "menuitemradio", "aria-checked": String(on), "aria-label": label, title: label }, [glyph]);
    b.addEventListener("click", (e) => { e.stopPropagation(); closeModeMenu(); setMode(k); });
    m.appendChild(b);
  });
  document.body.appendChild(m);
  const ring = anchor.querySelector(".sring") || anchor, r = ring.getBoundingClientRect();
  m.style.left = (r.right + 10) + "px";
  m.style.top = Math.max(8, r.top + r.height / 2 - m.offsetHeight / 2) + "px";
  modeMenuEl = m;
}
document.addEventListener("click", (e) => { if (modeMenuEl && !e.target.closest(".modemenu")) closeModeMenu(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModeMenu(); });
function storyBar(d) {
  d = d || storyData();
  if (!d) { storySig = ""; return null; }
  const bar = el("div", { id: "storyBar", class: "storybar", role: "toolbar", "aria-label": "볼 계정 고르기. 사진을 우클릭하면 모두 읽음" });
  const mode = storyItem({ face: modeFace(), label: MODE_LABEL[activeTab] || "그룹", on: false, aria: "보기 기준 바꾸기(현재 " + (MODE_LABEL[activeTab] || "그룹") + ")" });
  mode.classList.add("modebtn"); mode.setAttribute("aria-haspopup", "menu"); mode.removeAttribute("aria-pressed");
  mode.addEventListener("click", (e) => { e.stopPropagation(); openModeMenu(mode); });
  bar.appendChild(mode);
  d.list.forEach((s) => {
    const label = d.plat ? acctName(s.acct) : personLabel(s.p);
    const single = !d.plat && s.p.accs.length === 1 && !s.p.group;
    const n = s.unread.length;
    const b = storyItem({
      face: picFace(s.chosen, label.replace(/^@/, ""), "sface"), label, on: s.on, dot: n > 0,
      badge: isPlat() ? activeTab : (single ? s.p.accs[0].platform : "group"), name: s.p.name,
      aria: label + (single ? " (" + PLATFORM[s.p.accs[0].platform] + ")" : "") + (n ? ", 안 읽은 글 " + n + "개" : "") + (s.on ? ", 고름" : ""),
    });
    b.addEventListener("click", () => { if (b._longPressed) { b._longPressed = false; return; } storyClick(s.p); });
    b.addEventListener("contextmenu", (e) => { e.preventDefault(); askReadAll(s.p); });
    onLongPress(b, () => askReadAll(s.p));
    bar.appendChild(b);
  });
  paintIsl(bar);
  enableDrag(bar);
  if (window.__sbOpen) bar.classList.add("open");
  bar.addEventListener("scroll", () => { storyScroll = bar.scrollLeft; }, { passive: true });
  storySig = storySigOf(d);
  return bar;
}

/* ---- 유튜브 탭: 영상만/게시물만 막대 없이, 계정 옆 "유튜브 영상 · 유튜브 게시물"을 눌러 그 계정의 영상/게시물만 보기 ---- */
ytMode = "both";
function ytMeta(r) {
  const span = el("span", { class: "n" });
  span.append(document.createTextNode(r.list.length + "건 · "));
  [["youtube-video", "유튜브 영상"], ["youtube-post", "유튜브 게시물"]].forEach(([k, label], i) => {
    if (i) span.append(document.createTextNode(" · "));
    const a = el("span", { class: "platlink", role: "button", tabindex: "0", text: label, title: r.name + "의 " + label + "만 보기" });
    const go = (e) => {
      e.stopPropagation(); e.preventDefault();
      backCtx = { tab: activeTab, pf: personFocus, pp: personPlat, af: acctFocus, gf: groupFocus, pg: page, st: ($("grid") || {}).scrollTop || 0 };
      activeTab = "people"; acctFocus = ""; personFocus = r.name; personPlat = k; renderList();
    };
    a.addEventListener("click", go);
    a.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") go(e); });
    span.append(a);
  });
  return span;
}
