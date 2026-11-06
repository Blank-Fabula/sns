/* ---------- 목록 ---------- */
const rtf = new Intl.RelativeTimeFormat("ko", { numeric: "auto" });
function relative(ms) {
  const diff = (ms - Date.now()) / 1000;
  for (const [u, s] of [["day", 86400], ["hour", 3600], ["minute", 60]]) if (Math.abs(diff) >= s) return rtf.format(Math.round(diff / s), u);
  return "방금";
}
let periodDays = 7;
try { const s = localStorage.getItem("snsPeriod"); if (s !== null && !Number.isNaN(Number(s))) periodDays = Number(s); } catch (e) {}
$("period").value = String(periodDays);
const publishedMs = (it) => { const t = Date.parse(it.publishedAt || ""); return Number.isNaN(t) ? it.collectedAt : t; };
const inPeriod = (it) => !periodDays || publishedMs(it) >= Date.now() - periodDays * 86400000;

// 이미지: 웹 화면은 외부 이미지를 막으므로 확장에 요청해 데이터로 받아 보여줍니다(보이는 카드만, 동시에 4장).
const imgCache = new Map(), imgQueue = [];
let imgActive = 0;
function pumpImg() {
  while (imgActive < 4 && imgQueue.length) {
    const { url, img } = imgQueue.shift();
    imgActive++;
    call("image", { url }, 20000)
      .then((v) => { imgCache.set(url, v || ""); v ? (img.src = v) : img.remove(); })
      .catch(() => { img.remove(); })
      .finally(() => { imgActive--; pumpImg(); });
  }
}
function loadImg(url, img) {
  // 일반 웹 주소(Vercel 등)에서는 이미지를 바로 불러옵니다. claude.ai 안에서만 확장을 거칩니다.
  if (!window.claude) { if (/^https:\/\//.test(url || "")) { img.addEventListener("error", () => img.remove()); img.src = url; } else img.remove(); return; }
  if (!connected || !/^https:\/\//.test(url || "")) { img.remove(); return; }
  if (imgCache.has(url)) { const v = imgCache.get(url); v ? (img.src = v) : img.remove(); return; }
  imgQueue.push({ url, img });
  pumpImg();
}
const imgObserver = new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) { imgObserver.unobserve(e.target); loadImg(e.target.dataset.src, e.target); } });
}, { rootMargin: "300px" });

// 글 열기: 유튜브 영상·X·인스타그램 글은 이 페이지 안에서 바로 보고, 그 밖(유튜브 게시물 등)은 새 크롬 창으로 엽니다.
function embedFor(it) {
  if (window.claude) return null; // claude.ai 안에서는 다른 사이트를 끼워 넣을 수 없습니다
  const u = it.url || "";
  let m;
  if (it.source === "youtube-video" && (m = /[?&]v=([\w-]{11})/.exec(u))) return { src: "https://www.youtube-nocookie.com/embed/" + m[1] + "?autoplay=1&rel=0", ratio: "16 / 9" };
  if (it.source === "x" && (m = /\/status\/(\d+)/.exec(u))) return { src: "https://platform.twitter.com/embed/Tweet.html?id=" + m[1], h: 640 };
  if (it.source === "instagram" && (m = /instagram\.com\/(p|reel|tv)\/([\w-]+)/.exec(u))) return { src: "https://www.instagram.com/" + m[1] + "/" + m[2] + "/embed", h: 700 };
  return null;
}
function openWindow(url) { call("openWindow", { url }).catch(() => window.open(url, "_blank", "noopener")); }
let viewerUrl = "";
let viewCtx = [], viewIdx = -1;
// 누른 카드가 속한 줄(또는 격자)의 카드들을 이전/다음 이동 순서로 씁니다.
function setViewCtx(a, it) {
  const p = a.parentElement;
  viewCtx = p ? Array.from(p.children).filter((n) => n._item).map((n) => n._item) : [it];
  viewIdx = viewCtx.indexOf(it);
  if (viewIdx < 0) { viewCtx = [it]; viewIdx = 0; }
}
function updateNav() {
  const many = viewCtx.length > 1;
  $("vPrev").hidden = $("vNext").hidden = !many;
  $("vPrev").disabled = viewIdx <= 0;
  $("vNext").disabled = viewIdx >= viewCtx.length - 1;
}
function navView(d) {
  const n = viewIdx + d;
  if (n < 0 || n >= viewCtx.length) return;
  viewIdx = n;
  openItem(viewCtx[n]);
}
function closeViewer() { $("viewer").hidden = true; $("vBody").textContent = ""; }
const postCache = new Map();
function renderPost(p, it) {
  const wrap = el("div", { class: "post" });
  const head = el("div", { class: "ph2" });
  if (p.avatar) head.appendChild(el("img", { class: "av", src: p.avatar, alt: "", referrerpolicy: "no-referrer" }));
  head.appendChild(el("div", { class: "who" }, [el("b", { text: p.author || it.author || "" }), el("span", { text: [p.time || "", p.likes ? "좋아요 " + p.likes : ""].filter(Boolean).join(" · ") })]));
  wrap.appendChild(head);
  if (p.text) wrap.appendChild(el("div", { class: "txt", text: p.text }));
  if (p.video && /^[\w-]{11}$/.test(p.video.id || "")) {
    const box = el("div", { class: "vid" });
    if (window.claude) {
      box.appendChild(el("button", { type: "button", text: "▶ 첨부 영상 보기" + (p.video.title ? ": " + p.video.title : "") }));
      box.firstChild.addEventListener("click", () => openWindow("https://www.youtube.com/watch?v=" + p.video.id));
    } else {
      box.appendChild(el("iframe", { src: "https://www.youtube-nocookie.com/embed/" + p.video.id + "?rel=0", title: p.video.title || "첨부 영상", allow: "encrypted-media; picture-in-picture; fullscreen", allowfullscreen: "", referrerpolicy: "strict-origin-when-cross-origin" }));
    }
    wrap.appendChild(box);
  }
  if (p.images && p.images.length) {
    const g = el("div", { class: "imgs" });
    p.images.forEach((u) => g.appendChild(el("img", { src: u, alt: "", referrerpolicy: "no-referrer" })));
    wrap.appendChild(g);
  }
  return wrap;
}
async function openPost(it) {
  viewerUrl = it.url;
  updateNav();
  $("vTitle").textContent = it.author || "유튜브 게시물";
  const body = $("vBody");
  body.textContent = "";
  body.appendChild(el("p", { class: "hint", style: "padding:24px", text: "게시물을 불러오는 중… 크롬에서 탭이 잠깐 열렸다 닫힙니다." }));
  $("viewer").hidden = false;
  try {
    let p = postCache.get(it.url);
    if (!p) { p = await call("fetchPost", { url: it.url }, 45000); postCache.set(it.url, p); }
    if ($("viewer").hidden || viewerUrl !== it.url) return;
    body.textContent = "";
    body.appendChild(renderPost(p, it));
  } catch (e) {
    if (viewerUrl !== it.url) return;
    body.textContent = "";
    body.appendChild(el("p", { class: "error", style: "padding:24px", text: "게시물을 불러오지 못했습니다. " + (e && e.message ? e.message : "") + " 아래 버튼으로 원본을 열어 주세요." }));
  }
}
function openItem(it) {
  markSeen(it);
  if (it.source === "youtube-post" && /^https:\/\/www\.youtube\.com\/post\//.test(it.url || "")) { openPost(it); return; }
  const e = embedFor(it);
  if (!e) { openWindow(it.url); return; }
  viewerUrl = it.url;
  updateNav();
  $("vTitle").textContent = it.title || it.author || "";
  const f = el("iframe", { src: e.src, title: "글 보기", allow: "autoplay; encrypted-media; picture-in-picture; fullscreen", allowfullscreen: "", referrerpolicy: "strict-origin-when-cross-origin" });
  if (e.ratio) f.style.aspectRatio = e.ratio; else f.style.height = e.h + "px";
  const body = $("vBody");
  body.textContent = "";
  body.appendChild(f);
  $("viewer").hidden = false;
}
$("vClose").addEventListener("click", closeViewer);
$("vPrev").addEventListener("click", () => navView(-1));
$("vNext").addEventListener("click", () => navView(1));
// 글 보기 창 바깥의 회색 영역에서 휠을 돌리면 이전/다음 글로 이동합니다(아래로 = 다음).
let wheelNavAt = 0;
$("viewer").addEventListener("wheel", (ev) => {
  if (ev.target.closest && ev.target.closest(".viewer")) return;
  ev.preventDefault();
  const now = Date.now();
  if (now - wheelNavAt < 450 || Math.abs(ev.deltaY) < 4) return;
  wheelNavAt = now;
  navView(ev.deltaY > 0 ? 1 : -1);
}, { passive: false });
document.addEventListener("keydown", (e) => {
  if ($("viewer").hidden || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = (e.target && e.target.tagName) || "";
  if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
  if (e.key === "ArrowLeft") navView(-1); else if (e.key === "ArrowRight") navView(1);
});
$("vWin").addEventListener("click", () => { openWindow(viewerUrl); });
$("viewer").addEventListener("click", (e) => { if (e.target === $("viewer")) closeViewer(); });

function card(it) {
  const kids = [];
  if (it.thumb) {
    const img = el("img", { alt: "", referrerpolicy: "no-referrer" });
    img.dataset.src = it.thumb;
    imgObserver.observe(img);
    kids.push(img);
  }
  const pub = it.publishedAt ? relative(Date.parse(it.publishedAt)) : it.publishedText || "";
  const meta = [it.author, pub ? "게시 " + pub : "", "수집 " + relative(it.collectedAt)].filter(Boolean).join(" · ");
  kids.push(el("div", { class: "body" }, [el("span", { class: "badge", text: LABELS[it.source] || it.source }), el("div", { class: "title", text: it.title }), el("div", { class: "meta", text: meta })]));
  const safe = /^https:\/\//.test(it.url || "") ? it.url : "#";
  const a = el("a", { class: "card", href: safe, target: "_blank", rel: "noopener noreferrer" }, kids);
  a._item = it;
  if (seen.has(it.id)) a.classList.add("seen");
  // 일반 클릭은 이 페이지에서 보기/새 크롬 창으로, Ctrl·휠 클릭은 기본 동작(새 탭)을 유지합니다.
  a.addEventListener("click", (e) => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0 || safe === "#") return; e.preventDefault(); setViewCtx(a, it); openItem(it); });
  return a;
}

function renderTabs() {
  const vis = items.filter(inPeriod);
  const counts = { all: vis.length };
  vis.forEach((it) => (counts[it.source] = (counts[it.source] || 0) + 1));
  counts.people = new Set(tracked.filter((t) => t.kind !== "feed" && t.group).map((t) => t.group)).size;
  const nav = $("tabs");
  nav.textContent = "";
  Object.keys(LABELS).forEach((k) => {
    const b = el("button", { type: "button", class: k === activeTab ? "active" : "" }, [el("span", { text: LABELS[k] }), el("span", { class: "n", text: String(counts[k] || 0) })]);
    b.addEventListener("click", () => { if (k === "people") { personFocus = ""; personPlat = ""; } activeTab = k; renderList(); });
    nav.appendChild(b);
  });
}
// 마우스로 잡아 끌어 좌우로 넘기기 (터치는 기본 스와이프). 끌었을 때는 링크가 열리지 않게 합니다.
function enableDrag(box) {
  let down = false, moved = false, startX = 0, startLeft = 0;
  box.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    // 휠 애니메이션이 아직 진행 중이면 멈춥니다(안 그러면 끄는 중에 원래 위치로 되돌아갑니다).
    { const st0 = wheelAnim.get(box); if (st0 && st0.raf) { cancelAnimationFrame(st0.raf); st0.raf = 0; box.classList.remove("wheeling"); } }
    // 아래쪽 스크롤바를 잡은 경우: 끌기/휠 애니메이션이 간섭하지 않게 하고 브라우저 기본 동작에 맡깁니다.
    const r = box.getBoundingClientRect();
    if (e.clientY > r.top + box.clientHeight) {
      const st = wheelAnim.get(box);
      if (st && st.raf) { cancelAnimationFrame(st.raf); st.raf = 0; }
      box.classList.remove("wheeling"); box.classList.add("sb");
      const off = () => { box.classList.remove("sb"); window.removeEventListener("pointerup", off); window.removeEventListener("mouseup", off); };
      window.addEventListener("pointerup", off); window.addEventListener("mouseup", off);
      return;
    }
    down = true; moved = false; startX = e.clientX; startLeft = box.scrollLeft;
  });
  window.addEventListener("pointermove", (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (!moved && Math.abs(dx) > 5) { moved = true; box.classList.add("dragging"); }
    if (moved) box.scrollLeft = startLeft - dx;
  });
  window.addEventListener("pointerup", () => { down = false; box.classList.remove("dragging"); });
  box.addEventListener("click", (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
  box.addEventListener("dragstart", (e) => e.preventDefault());
}
function renderList() {
  renderTabs();
  const q = $("q").value.trim().toLowerCase();
  let list = items.filter(inPeriod).filter((it) => activeTab === "all" || activeTab === "people" || it.source === activeTab);
  if (q) list = list.filter((it) => (it.title + " " + it.author).toLowerCase().includes(q));
  const bySort = $("sort").value === "published";
  list.sort((a, b) => (bySort ? publishedMs(b) - publishedMs(a) : b.collectedAt - a.collectedAt));
  const g = $("grid");
  g.textContent = "";
  g.className = "";
  if (activeTab === "people") {
    // 사람별: 같은 묶음 이름을 가진 유튜브·X·인스타 계정의 글을 한 사람 기준으로 모아 봅니다.
    const people = new Map();
    tracked.filter((t) => t.kind !== "feed" && t.group).forEach((t) => {
      if (!people.has(t.group)) people.set(t.group, { name: t.group, ids: new Set(), plats: new Set() });
      const p = people.get(t.group);
      p.ids.add(t.id); p.plats.add(t.platform);
    });
    if (!people.size) {
      g.appendChild(el("p", { class: "hint", text: "아직 묶음이 없습니다. 왼쪽 '추적 계정'에서 같은 사람의 유튜브·X·인스타그램 계정에 같은 묶음 이름을 지정하면, 여기서 그 사람 기준으로 모아 볼 수 있습니다." }));
      $("empty").hidden = true;
      return;
    }
    const platOf = (it) => (it.source.startsWith("youtube") ? "youtube" : it.source);
    const rows = [...people.values()].map((p) => ({ ...p, list: list.filter((it) => p.ids.has(it.via)).sort((a, b) => publishedMs(b) - publishedMs(a)) }));
    rows.sort((a, b) => (b.list[0] ? publishedMs(b.list[0]) : 0) - (a.list[0] ? publishedMs(a.list[0]) : 0));
    if (personFocus && !rows.some((r) => r.name === personFocus)) personFocus = "";
    const bar = el("div", { class: "pbar" });
    const chip = (label, n, active, fn) => { const b = el("button", { type: "button", class: active ? "active" : "" }, [el("span", { text: label }), el("span", { class: "n", text: String(n) })]); b.addEventListener("click", fn); bar.appendChild(b); };
    chip("모든 사람", rows.reduce((s, r) => s + r.list.length, 0), !personFocus, () => { personFocus = ""; personPlat = ""; renderList(); });
    rows.forEach((r) => chip(r.name, r.list.length, personFocus === r.name, () => { personFocus = r.name; personPlat = ""; renderList(); }));
    g.appendChild(bar);
    const MEDIA = ["youtube-video", "youtube-post", "x", "instagram"];
    // 한 사람의 글을 매체별(유튜브 영상·유튜브 게시물·X·인스타그램) 줄로 나눠 보여줍니다.
    const mediaRows = (r, limit, onMore) => {
      const box = el("div", { class: "sections" });
      MEDIA.forEach((k) => {
        const part = r.list.filter((it) => it.source === k);
        if (!part.length) return;
        const head = el("div", { class: "sec-head" }, [el("h4", { text: LABELS[k], style: "margin:0;font-size:13px;color:var(--muted)" }), el("span", { class: "n", text: part.length + "건" })]);
        if (onMore && part.length > limit) {
          const more = el("button", { type: "button", text: "전체 보기" });
          more.addEventListener("click", () => onMore(k));
          head.appendChild(more);
        }
        const grid = el("div", { class: "row-cards" });
        part.slice(0, limit).forEach((it) => grid.appendChild(card(it)));
        enableDrag(grid);
        box.appendChild(el("div", { class: "sec" }, [head, grid]));
      });
      if (!box.children.length) box.appendChild(el("p", { class: "hint", text: "이 기간에 수집된 글이 없습니다." }));
      return box;
    };
    const body = el("div", { class: "sections" });
    if (personFocus) {
      const r = rows.find((x) => x.name === personFocus);
      if (personPlat) {
        const back = el("button", { type: "button", text: "← " + r.name });
        back.addEventListener("click", () => { personPlat = ""; renderList(); });
        const grid = el("div", { class: "cards" }, [el("div", { class: "sec-head", style: "grid-column: 1 / -1" }, [back, el("h3", { text: LABELS[personPlat] })])]);
        r.list.filter((it) => it.source === personPlat).slice(0, 300).forEach((it) => grid.appendChild(card(it)));
        body.appendChild(grid);
      } else {
        body.appendChild(el("section", { class: "sec" }, [
          el("div", { class: "sec-head" }, [el("h3", { text: r.name }), el("span", { class: "n", text: r.list.length + "건 · " + [...r.plats].map((p) => PLATFORM[p]).join("·") })]),
          mediaRows(r, 30, (k) => { personPlat = k; renderList(); }),
        ]));
      }
    } else {
      rows.forEach((r) => {
        const head = el("div", { class: "sec-head" }, [el("h3", { text: r.name }), el("span", { class: "n", text: r.list.length + "건 · " + [...r.plats].map((p) => PLATFORM[p]).join("·") })]);
        const more = el("button", { type: "button", text: "이 사람만 보기" });
        more.addEventListener("click", () => { personFocus = r.name; personPlat = ""; renderList(); });
        head.appendChild(more);
        body.appendChild(el("section", { class: "sec" }, [head, mediaRows(r, 20, null)]));
      });
    }
    g.appendChild(body);
    $("empty").hidden = true;
    return;
  }
  if (activeTab !== "people" && !q && $("view").value === "group") {
    // 묶음·계정별: 묶음 이름이 같은 계정은 한 줄로, 묶음 없는 계정은 계정마다 한 줄로 보여줍니다.
    g.className = "sections";
    const groups = new Map();
    tracked.filter((t) => t.kind !== "feed").forEach((t) => {
      const key = t.group ? "g:" + t.group : "a:" + t.id;
      if (!groups.has(key)) groups.set(key, { name: t.group || PLATFORM[t.platform] + " @" + (t.handle || t.channelId || ""), ids: new Set(), plats: [] });
      const gr = groups.get(key);
      gr.ids.add(t.id);
      gr.plats.push(PLATFORM[t.platform]);
    });
    const rows = [...groups.values()].map((gr) => ({ ...gr, list: list.filter((it) => gr.ids.has(it.via)) }));
    const known = new Set(tracked.map((t) => t.id));
    const rest = list.filter((it) => !known.has(it.via));
    if (rest.length) rows.push({ name: "기타 (둘러보기·내 피드)", plats: [], ids: new Set(), list: rest });
    rows.forEach((r) => r.list.sort((a, b) => publishedMs(b) - publishedMs(a)));
    rows.sort((a, b) => (b.list[0] ? publishedMs(b.list[0]) : 0) - (a.list[0] ? publishedMs(a.list[0]) : 0));
    const focused = groupFocus && rows.find((r) => r.name === groupFocus);
    if (groupFocus && !focused) groupFocus = "";
    if (focused) {
      // 한 묶음의 글을 전부 펼쳐서 보여줍니다.
      g.className = "cards";
      const back = el("button", { type: "button", text: "← 묶음 목록으로" });
      back.addEventListener("click", () => { groupFocus = ""; renderList(); });
      g.appendChild(el("div", { class: "sec-head", style: "grid-column: 1 / -1" }, [back, el("h3", { text: focused.name }), el("span", { class: "n", text: focused.list.length + "건" })]));
      focused.list.slice(0, 300).forEach((it) => g.appendChild(card(it)));
      $("empty").hidden = list.length > 0;
      return;
    }
    // 특정 매체 탭에서는 그 매체에 글이 없는 계정·묶음 줄은 숨깁니다.
    (activeTab === "all" ? rows : rows.filter((r) => r.list.length)).forEach((r) => {
      const head = el("div", { class: "sec-head" }, [el("h3", { text: r.name }), el("span", { class: "n", text: r.list.length + "건" + (r.plats.length ? " · " + [...new Set(r.plats)].join("·") : "") })]);
      if (r.list.length > 30) {
        const more = el("button", { type: "button", text: "전체 보기" });
        more.addEventListener("click", () => { groupFocus = r.name; renderList(); });
        head.appendChild(more);
      }
      const grid = el("div", { class: "row-cards" });
      if (r.list.length) { r.list.slice(0, 30).forEach((it) => grid.appendChild(card(it))); enableDrag(grid); }
      else grid.appendChild(el("p", { class: "hint", text: "이 기간에 수집된 글이 없습니다." }));
      g.appendChild(el("section", { class: "sec" }, [head, grid]));
    });
  } else if (activeTab === "all" && !q) {
    // 한눈에 보기: 출처별 구역으로 나눠 최신 글을 한 화면에 모아 보여줍니다.
    g.className = "sections";
    Object.keys(LABELS).filter((k) => k !== "all").forEach((k) => {
      const part = list.filter((it) => it.source === k);
      if (!part.length) return;
      const head = el("div", { class: "sec-head" }, [el("h3", { text: LABELS[k] }), el("span", { class: "n", text: part.length + "건" })]);
      if (part.length > 30) {
        const more = el("button", { type: "button", text: "전체 보기" });
        more.addEventListener("click", () => { activeTab = k; renderList(); });
        head.appendChild(more);
      }
      const grid = el("div", { class: "row-cards" });
      part.slice(0, 30).forEach((it) => grid.appendChild(card(it)));
      enableDrag(grid);
      g.appendChild(el("section", { class: "sec" }, [head, grid]));
    });
  } else {
    g.className = "cards";
    list.slice(0, 300).forEach((it) => g.appendChild(card(it)));
  }
  $("empty").hidden = list.length > 0;
  $("empty").textContent = connected ? "이 기간에 모은 글이 없습니다. 계정을 추가하고 '가져오기'를 눌러 보세요." : "아직 보여줄 글이 없습니다. 확장을 연결하고 계정을 추가하면 설정한 기간(최대 60일)의 글이 여기에 모입니다.";
}
function renderTracked() {
  const box = $("tracked");
  box.textContent = "";
  tracked.forEach((t) => {
    const name = t.kind === "feed" ? FEED[t.platform] : t.handle ? "@" + t.handle : t.channelId || t.resolveUrl;
    const rm = el("button", { type: "button", "aria-label": name + " 삭제", text: "×" });
    rm.addEventListener("click", async () => {
      tracked = tracked.filter((x) => x.id !== t.id);
      items = items.filter((it) => it.via !== t.id); // 이 계정으로 모은 글도 함께 지웁니다
      renderTracked(); renderTabs(); renderList();
      await call("set", { tracked }).catch(showErr);
      await call("removeVia", { ids: [t.id] }).catch(() => {}); // 확장이 구버전이면 글은 남습니다
    });
    box.appendChild(el("span", { class: "chip" }, [el("span", { text: PLATFORM[t.platform] + " " + name + (t.group ? " · " + t.group : "") }), rm]));
  });
  const sel = $("gAcc"), keep = sel.value;
  if (document.activeElement !== sel) {
    sel.textContent = "";
    tracked.filter((t) => t.kind !== "feed").forEach((t) => sel.appendChild(el("option", { value: t.id, text: PLATFORM[t.platform] + " @" + (t.handle || t.channelId || "") })));
    if (keep) sel.value = keep;
  }
  const wd = $("winDays");
  if (document.activeElement !== wd) wd.value = String(winDays);
  const ae = $("autoEnabled"), ah = $("autoHours");
  if (document.activeElement !== ae) ae.checked = !!autoCheck.enabled;
  if (document.activeElement !== ah) ah.value = String(autoCheck.hours || 3);
  $("checkNow").disabled = !!checkStatus.running || tracked.length === 0;
  $("status").textContent = checkStatus.running ? "확인 중… " + (checkStatus.message || "") : checkStatus.lastRun ? "마지막 확인 " + relative(checkStatus.lastRun) + " · " + (checkStatus.message || "") : tracked.length ? "아직 확인한 적 없음" : "계정을 추가하면 여기서 신규 글을 확인합니다";
}
function renderSettings() {
  document.querySelectorAll("#platPanel input[data-key]").forEach((b) => { b.checked = settings[b.dataset.key] !== false; });
}
function renderAll() {
  renderSettings(); renderTracked(); renderList();
  updateConnText();
}
function showErr(e) { const p = $("addError"); p.textContent = e.message; p.hidden = false; }

