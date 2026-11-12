/* ---- community (preview) ---- */
(function () {
  const $c = (id) => document.getElementById(id);
  const CATS = ["전체", "개념글", "공지", "질문", "팁", "건의", "잡담"];
  const KEY = "snsCommunity";
  const now = Date.now(), H = 3600e3;
  const seed = () => [
    { id: 1, acct: "*", cat: "공지", pin: true, title: "커뮤니티가 열렸어요", body: "수집 방법, 계정 묶는 요령, 건의 사항을 자유롭게 나눠 주세요. 서로 존중하는 글만 부탁드려요.", author: "운영팀", at: now - 52 * H, likes: 12, comments: [{ a: "운영팀", t: "궁금한 점은 '질문' 분류로 남겨 주세요.", at: now - 50 * H }] },
    { id: 2, acct: "youtube:@hanriver", cat: "팁", title: "같은 사람 계정은 같은 그룹 이름으로", body: "유튜브·X·인스타 계정에 같은 그룹 이름을 주면 홈에서 한 사람으로 모아 볼 수 있어요. 그룹을 누르면 그 사람 글만 보입니다.", author: "hanriver", at: now - 20 * H, likes: 8, comments: [{ a: "mood", t: "이거 몰랐네요, 감사해요!", at: now - 18 * H }] },
    { id: 3, acct: "instagram:cafe.mood", cat: "질문", title: "인스타 계정은 로그인 없이도 수집되나요?", body: "공개 계정은 로그인 없이 되는 줄 알았는데 수집이 비어 있어요. 어떻게 해야 하나요?", author: "newsfan", at: now - 9 * H, likes: 2, comments: [] },
    { id: 4, acct: "x:newsbrief_kr", cat: "건의", title: "알림이 있으면 좋겠어요", body: "새 글이 올라오면 브라우저 알림으로 알려 주는 기능이 있으면 좋겠습니다.", author: "dailyrun", at: now - 3 * H, likes: 5, comments: [{ a: "운영팀", t: "좋은 의견이에요. 검토해 볼게요.", at: now - 1 * H }] },
    { id: 5, acct: "youtube:@dailyrun", cat: "잡담", title: "다들 몇 개 계정 추적 중이세요?", body: "저는 지금 6개예요. 최대 30개까지 되던데 다들 어느 정도 쓰시는지 궁금해요.", author: "cafe.mood", at: now - 40 * 60e3, likes: 1, comments: [] },
    { id: 6, acct: "x:hanriver_tech", cat: "잡담", title: "한강테크 X 계정 오늘 글 좋네요", body: "배터리 테스트 결과 글 보셨나요? 생각보다 차이가 커서 놀랐어요.", author: "hanriver", at: now - 6 * H, likes: 3, comments: [] },
    { id: 7, acct: "instagram:hanriver.tech", cat: "질문", title: "인스타 쪽은 사진 설명이 안 보여요", body: "한강테크 인스타 글은 제목만 보이고 설명이 비어 있어요. 원래 그런가요?", author: "mood", at: now - 5 * H, likes: 1, comments: [] },
  ];
  let replyTo = null, posts, cat = "전체", open = 0, liked = new Set(), scope = "all", browse = false;
  try { posts = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { posts = null; }
  if (!Array.isArray(posts) || posts.some((p) => !p.acct && !Array.isArray(p.tags))) posts = seed();
  /* 글마다 화면에 안 보이는 고유 id(uid)와 태그 목록(tags: 계정 id들)을 가짐. 태그된 모든 계정 커뮤니티에 같은 글이 보임 */
  const HOT_MIN = 5;
  const isHot = (p) => !p.pin && p.likes >= HOT_MIN;
  const inCat = (p, c) => c === "전체" || (c === "개념글" ? isHot(p) : p.cat === c);
  const NOTICE_ID = "x:notice_official";
  const newUid = () => "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const tagsOf = (p) => (Array.isArray(p.tags) ? p.tags : p.acct ? [p.acct] : []);
  if (!posts.some((p) => p.uid === "seed-bm")) posts.push({ id: Math.max(0, ...posts.map((p) => p.id)) + 1, uid: "seed-bm", tags: ["youtube:@BABYMONSTER", "x:YGBABYMONSTER_", "instagram:babymonster_ygofficial"], cat: "잡담", title: "BABYMONSTER 공식 채널 모음", body: "공식 유튜브 영상과 X, 인스타그램 계정이에요.", author: "운영팀", at: Date.now() - 2 * 3600e3, likes: 0, comments: [], imgs: [], links: ["https://www.youtube.com/watch?v=2wA_b6YHjqQ", "https://x.com/YGBABYMONSTER_", "https://www.instagram.com/babymonster_ygofficial/"] });
  posts.forEach((p) => { if (!p.links) p.links = p.video ? [p.video] : []; if (!p.uid) p.uid = newUid(); if (!Array.isArray(p.tags)) p.tags = p.acct ? [p.acct] : []; p.tags = p.tags.map((t) => (t === "*" ? NOTICE_ID : t)); });   // 공지 글은 공지 계정 커뮤니티에만 보임
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(posts)); } catch (e) {} };
  const me = () => (typeof sess !== "undefined" && window.__uid) || (function () { try { return localStorage.getItem("snsUid"); } catch (e) { return ""; } })() || "나";
  const ago = (t) => { const m = Math.max(1, Math.round((Date.now() - t) / 60e3)); return m < 60 ? m + "분 전" : m < 1440 ? Math.round(m / 60) + "시간 전" : Math.round(m / 1440) + "일 전"; };
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  /* 영상 링크: 유튜브는 썸네일 미리보기 + 눌러서 재생, 그 밖의 링크는 링크 카드 */
  const ytId = (u) => { const m = String(u).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/); return m ? m[1] : ""; };
  const normUrl = (u) => { u = String(u || "").trim(); if (!u) return ""; if (!/^https?:\/\//i.test(u)) u = "https://" + u; try { const x = new URL(u); return x.hostname.includes(".") ? x.href : ""; } catch (e) { return ""; } };
  const normLinks = (t) => [...new Set(String(t || "").split(/[\s,]+/).map(normUrl).filter(Boolean))].slice(0, 5);
  const PLAT = [[/(^|\.)(x|twitter)\.com$/, "X"], [/(^|\.)instagram\.com$/, "Instagram"], [/(^|\.)(youtube\.com|youtu\.be)$/, "YouTube"]];
  const shrink = (file) => new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => { const im = new Image(); im.onload = () => { const k = Math.min(1, 900 / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", 0.72)); }; im.onerror = () => res(""); im.src = fr.result; };
    fr.onerror = () => res(""); fr.readAsDataURL(file);
  });
  const mediaView = (p) => {
    const w = mk("div", "cm-media");
    if (p.imgs && p.imgs.length) { const g = mk("div", "cm-imgs"); p.imgs.forEach((src) => { const i = mk("img"); i.src = src; i.alt = "첨부 이미지"; i.addEventListener("click", () => i.classList.toggle("big")); g.appendChild(i); }); w.appendChild(g); }
    (p.links || []).forEach((lk) => {
      const id = ytId(lk);
      if (id) {
        const b = mk("a", "cm-vid"); b.href = lk; b.target = "_blank"; b.rel = "noopener noreferrer"; b.setAttribute("aria-label", "유튜브에서 영상 보기");   // 미리보기 페이지는 외부 영상 삽입(iframe)이 막혀 있어 새 탭으로 엽니다
        const th = mk("img"); th.src = "https://img.youtube.com/vi/" + id + "/hqdefault.jpg"; th.alt = ""; th.addEventListener("error", () => th.remove());
        b.append(th, mk("span", "cm-play", "▶"), mk("span", "cm-ytl", "YouTube에서 보기 ↗"));
        w.appendChild(b);
      } else { let host = lk; try { host = new URL(lk).hostname.replace(/^www\./, ""); } catch (e) {} const pl = (PLAT.find((x) => x[0].test(host)) || [0, host])[1]; const a = mk("a", "cm-link"); a.href = lk; a.target = "_blank"; a.rel = "noopener noreferrer"; a.append(mk("b", "", pl + " 링크 열기 ↗"), mk("em", "", lk.replace(/^https?:\/\/(www\.)?/, ""))); w.appendChild(a); }
    });
    return w;
  };
  const accs = () => (typeof tracked !== "undefined" && Array.isArray(tracked) ? tracked : []);
  const gnames = () => { const s = new Set(); accs().forEach((t) => groupsOf(t).forEach((g) => s.add(g))); return [...s]; };
  const hd = (t) => (String(t.handle || "").startsWith("@") ? t.handle : "@" + (t.handle || t.id));
  const byId = (id) => accs().find((t) => t.id === id);
  /* 커뮤니티는 홈/즐겨찾기와 상태를 공유하지 않고 자기 보기 상태(view)만 가짐 */
  let view = { t: "list" }, pendingOpen = null;
  const inScope = (p) => {
    const tg = tagsOf(p);
    if (view.t === "all") return true;
    return view.t === "p" && tg.some((x) => view.ids.has(x));
  };
  const accChip = (t) => { const s = mk("span", "cm-acc"); try { s.appendChild(pIcon(t.platform)); } catch (e) {} s.appendChild(mk("em", "", hd(t))); return s; };

  /* 메인: 글 대신 계정(그룹 포함) 커뮤니티 카드 목록. 카드를 누르면 그 커뮤니티의 글로 들어감 */
  function renderCommunities() {
    const box = $c("cmList"); box.textContent = ""; box.classList.add("cm-grid");
    const w = $c("cmWho"); w.hidden = true; w.textContent = ""; { const th = $c("cmTitleH"); th.textContent = "커뮤니티"; th.classList.remove("cm-named"); }
    const d = typeof storyDataPeople === "function" ? storyDataPeople() : null;
    const qv = (($c("q") || {}).value || "").trim().toLowerCase();
    const accHay = (it) => { const a = (it.p.accs || []).flatMap((t) => [t.handle || "", t.id || "", t.name || "", t.platform || "", { youtube: "유튜브", x: "엑스 트위터", instagram: "인스타 인스타그램" }[t.platform] || "", ...(typeof groupsOf === "function" ? groupsOf(t) : [])]); return [it.p.name || "", it.p.group || "", personLabel(it.p), ...a].join(" ").toLowerCase(); };
    const full = d ? d.list : [];
    const list = qv ? full.filter((it) => accHay(it).includes(qv)) : full;
    const showAll = !qv || "전체 커뮤니티 공지".includes(qv);
    $c("cmCount").textContent = (qv ? "검색 결과 " : "커뮤니티 ") + (list.length + (showAll ? 1 : 0)) + "개";
    const mkCard = (o) => {
      const c = mk("button", "cm-comm"); c.type = "button";
      const face = mk("span", "cm-cface"); if (o.all || o.label === "공지") { face.innerHTML = OURO_SVG; face.classList.add("all"); } else face.textContent = (o.label || "?").slice(0, 1).toUpperCase();
      const info = mk("span", "cm-cinfo");
      const top = mk("span", "cm-ctop"); top.appendChild(mk("b", "cm-cname", o.label));
      if (o.group) top.appendChild(mk("i", "cm-gdot", "그룹"));
      info.appendChild(top);
      const meta = mk("span", "cm-cmeta");
      const ic = mk("span", "cm-cplats"); (o.plats || []).forEach((pl) => { try { ic.appendChild(pIcon(pl)); } catch (e) {} });
      if (ic.childNodes.length) meta.appendChild(ic);
      meta.appendChild(mk("span", "", "글 " + o.n + "개" + (o.last ? " · " + ago(o.last.at) : "")));
      info.appendChild(meta);
      info.appendChild(mk("span", "cm-clast", o.last ? o.last.title : "아직 글이 없어요"));
      c.append(face, info);
      c.addEventListener("click", o.go);
      return c;
    };
    const clearQ = () => { const qi = $c("q"); if (qi) qi.value = ""; };
    const latest = (arr) => arr.slice().sort((a, b) => b.at - a.at)[0];
    if (qv && !list.length && !showAll) box.appendChild(mk("p", "cm-empty", "검색 결과가 없어요."));
    const addAll = () => { if (showAll) box.appendChild(mkCard({ all: true, label: "전체 커뮤니티", plats: [], n: posts.length, last: latest(posts), go: () => { clearQ(); view = { t: "all" }; render(); } })); };
    const addItem = (it) => {
      const ids = it.p.ids || new Set();
      const isNotice = it.p.name === "공지";
      const mine = posts.filter((x) => tagsOf(x).some((g) => ids.has(g)) || (isNotice && tagsOf(x).includes("*")));
      const one = it.acct || (it.p.accs && it.p.accs.length === 1 ? it.p.accs[0] : null);
      const label = ((one && one.name) || (it.acct ? acctName(it.acct) : personLabel(it.p))).replace(/^@+/, "");
      const group = !it.acct && (it.p.group || (it.p.accs && it.p.accs.length > 1));
      box.appendChild(mkCard({ label, group: !!group, plats: [...(it.p.plats || [])], n: mine.length, last: latest(mine), go: () => { clearQ(); view = { t: "p", ids: new Set(ids), label, group: !!group }; render(); } }));
    };
    const isN = (x) => x.p.name === "공지";
    list.filter(isN).forEach(addItem); addAll(); list.filter((x) => !isN(x)).forEach(addItem);   // 공지는 맨 위
  }

  function render() {
    scope = view.t === "p" && view.ids.size === 1 ? "a:" + [...view.ids][0] : "all";
    const qv = (($c("q") || {}).value || "").trim().toLowerCase();
    const vw = view.t === "list" ? "list" : "posts";
    $c("cmBack").hidden = vw === "list"; $c("cmCats").hidden = vw === "list";
    { const top = document.querySelector("#communityPanel .cm-top"); if (top) top.style.display = vw === "list" ? "none" : ""; if (vw === "list") { $c("cmForm").hidden = true; } }
    if (vw === "list") { renderCommunities(); return; }
    { const bk = $c("cmBack"), nm = view.t === "p" ? view.label : "전체 커뮤니티";   // 글을 열어 둔 동안엔 '← 커뮤니티 이름': 누르면 그 커뮤니티 글 목록으로
      if (open) { bk.textContent = "← " + nm; bk.dataset.mode = "post"; } else { bk.textContent = "← 목록"; bk.dataset.mode = ""; } }
    const hay = (p) => { const ex = tagsOf(p).flatMap((g) => { const t = byId(g); return t ? [hd(t), t.name || "", t.handle || "", ...(typeof groupsOf === "function" ? groupsOf(t) : [])] : ["공지", "전체"]; }); return [p.title, p.body, p.author, p.cat, ...p.comments.map((c) => c.t + " " + c.a), ...ex].join(" ").toLowerCase(); };
    const pool = posts.filter(inScope).filter((p) => !qv || hay(p).includes(qv));
    const cats = $c("cmCats"); cats.textContent = "";
    CATS.forEach((c) => {
      const n = pool.filter((p) => inCat(p, c)).length;
      const b = mk("button", "cm-cat" + (cat === c ? " on" : ""), c + " " + n); b.type = "button";
      b.addEventListener("click", () => { cat = c; open = 0; render(); });
      cats.appendChild(b);
    });
    $c("cmCount").textContent = (qv ? "검색 결과 " : "글 ") + pool.length + "개";
    { const w = $c("cmWho"); w.textContent = ""; let label = "";
      if (view.t === "p") { label = view.label; if (view.group) w.appendChild(mk("i", "cm-gdot", "그룹")); }
      if (label) w.appendChild(mk("span", "", label));
      w.hidden = true;   // 이름은 제목 자리에 보여 줌(아래)
      const th = $c("cmTitleH"); th.textContent = "";
      if (label) { while (w.firstChild && w.firstChild.nodeType === 1 && w.firstChild.tagName !== "SPAN" && !(w.firstChild.classList && w.firstChild.classList.contains("cm-gdot"))) th.appendChild(w.firstChild); th.appendChild(document.createTextNode(label.replace(/^@+/, ""))); const gd = w.querySelector(".cm-gdot"); if (gd) th.appendChild(gd); th.classList.add("cm-named"); }
      else { th.textContent = view.t === "all" ? "전체 커뮤니티" : "커뮤니티"; th.classList.remove("cm-named"); } }
    const box = $c("cmList"); box.textContent = ""; box.classList.remove("cm-grid");
    const list = pool.filter((p) => inCat(p, cat)).sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.at - a.at);
    if (!list.length) box.appendChild(mk("p", "cm-empty", qv ? "검색 결과가 없어요." : "아직 글이 없어요."));
    /* 개념글: 좋아요 HOT_MIN 이상인 글(공지 제외) 중 최신 3개를 목록 맨 위에 따로 보여 줌(전체 보기, 검색 아님) */
    const hot = cat === "전체" && !qv ? list.filter(isHot).sort((a, b) => b.at - a.at).slice(0, 3) : [];
    const hotIds = new Set(hot.map((p) => p.id));
    const ordered = [...hot, ...list.filter((p) => !hotIds.has(p.id))];
    const showHot = (p) => hotIds.has(p.id) || (cat === "개념글" && isHot(p));   // 표시만 "개념글"로, 분류 값(p.cat)은 그대로
    ordered.forEach((p, oi) => {
      const card = mk("article", "cm-post" + (open === p.id ? " open" : "") + (p.pin ? " pin" : "") + (showHot(p) ? " hot" : ""));
      const head = mk("button", "cm-head"); head.type = "button"; head.setAttribute("aria-expanded", String(open === p.id));
      const tg0 = tagsOf(p), whole = view.t === "p" && view.ids.size > 1 && [...view.ids].every((id) => tg0.includes(id));   // 그룹 전체에 태그된 글은 칩이 중복이라 숨김
      const shown = (whole || view.t === "all") ? [] : tg0.map(byId).filter((t) => t && !(view.t === "p" && view.ids.has(t.id)));   // 계정/그룹 커뮤니티 안에서는 제목 줄에 그 커뮤니티 계정 태그를 숨김(본문 아래에는 전체 태그 표시)
      const tagEls = shown.slice(0, 3).map(accChip); if (shown.length > 3) tagEls.push(mk("span", "cm-acc cm-more", "+" + (shown.length - 3)));
      head.append(mk("span", "cm-tag", showHot(p) ? "개념글" : p.cat), ...tagEls, mk("span", "cm-title", p.title), mk("span", "cm-meta", ((p.imgs && p.imgs.length ? "🖼 " : "") + (p.links && p.links.length ? "▶ " : "")) + p.author + " · " + ago(p.at)), mk("span", "cm-cnt", String(p.comments.length)));
      { const hr = mk("span", "cm-hrt" + (liked.has(p.id) ? " on" : ""), "♥ " + p.likes); hr.setAttribute("role", "button"); hr.tabIndex = 0; hr.setAttribute("aria-label", "좋아요");
        const tog = (e) => { e.stopPropagation(); e.preventDefault(); if (liked.has(p.id)) { liked.delete(p.id); p.likes--; } else { liked.add(p.id); p.likes++; } save(); render(); };
        hr.addEventListener("click", tog); hr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") tog(e); });
        head.insertBefore(hr, head.lastChild); }
      head.addEventListener("click", () => { open = open === p.id ? 0 : p.id; render(); });
      card.appendChild(head);
      if (open === p.id) {
        const body = mk("div", "cm-body");
        body.appendChild(mk("p", "cm-text", p.body));
        const act = mk("div", "cm-act");
        if (p.author === me()) { const del = mk("button", "cm-del", "삭제"); del.type = "button"; del.addEventListener("click", () => { posts = posts.filter((x) => x.id !== p.id); open = 0; save(); render(); }); act.appendChild(del); }
        body.appendChild(act);
        if ((p.imgs && p.imgs.length) || (p.links && p.links.length)) body.appendChild(mediaView(p));
        { const all = tagsOf(p).map(byId).filter(Boolean); if (all.length) { const tr = mk("div", "cm-tagrow"); all.forEach((t) => tr.appendChild(accChip(t))); body.appendChild(tr); } }
        const cl = mk("div", "cm-comments");
        const replyForm = (c, to) => {
          const f = mk("form", "cm-cform cm-rform"); const inp = mk("input"); inp.type = "text"; inp.maxLength = 300; inp.placeholder = (to ? "@" + to + " 에게 " : "") + "답글 달기"; inp.setAttribute("aria-label", "답글");
          const ok = mk("button", "", "등록"); ok.type = "submit"; const no = mk("button", "cm-rcancel", "취소"); no.type = "button";
          no.addEventListener("click", () => { replyTo = null; render(); });
          f.append(inp, ok, no);
          f.addEventListener("submit", (e) => { e.preventDefault(); const t = inp.value.trim(); if (!t) return; (c.replies = c.replies || []).push({ a: me(), t: (to ? "@" + to + " " : "") + t, at: Date.now() }); replyTo = null; save(); render(); });
          setTimeout(() => inp.focus(), 0);
          return f;
        };
        p.comments.forEach((c, ci) => {
          const wrap = mk("div", "cm-cwrap");
          const r = mk("div", "cm-cmt"); r.append(mk("b", "", c.a), mk("span", "", c.t), mk("em", "", ago(c.at)));
          const rb = mk("button", "cm-rbtn", "답글"); rb.type = "button"; rb.addEventListener("click", () => { replyTo = replyTo && replyTo.p === p.id && replyTo.c === ci && !replyTo.to ? null : { p: p.id, c: ci, to: "" }; render(); });
          r.appendChild(rb); wrap.appendChild(r);
          if ((c.replies && c.replies.length) || (replyTo && replyTo.p === p.id && replyTo.c === ci)) {
            const rl = mk("div", "cm-replies");
            (c.replies || []).forEach((x) => {
              const rr = mk("div", "cm-cmt cm-reply"); rr.append(mk("b", "", x.a), mk("span", "", x.t), mk("em", "", ago(x.at)));
              const b2 = mk("button", "cm-rbtn", "답글"); b2.type = "button"; b2.addEventListener("click", () => { replyTo = { p: p.id, c: ci, to: x.a }; render(); });
              rr.appendChild(b2); rl.appendChild(rr);
            });
            if (replyTo && replyTo.p === p.id && replyTo.c === ci) rl.appendChild(replyForm(c, replyTo.to));
            wrap.appendChild(rl);
          }
          cl.appendChild(wrap);
        });
        body.appendChild(cl);
        const f = mk("form", "cm-cform"); const inp = mk("input"); inp.type = "text"; inp.maxLength = 300; inp.placeholder = "댓글 달기"; inp.setAttribute("aria-label", "댓글");
        const sb = mk("button", "", "등록"); sb.type = "submit"; f.append(inp, sb);
        f.addEventListener("submit", (e) => { e.preventDefault(); const t = inp.value.trim(); if (!t) return; p.comments.push({ a: me(), t, at: Date.now() }); save(); render(); });
        body.appendChild(f);
        card.appendChild(body);
      }
      box.appendChild(card);
      if (hot.length && oi === hot.length - 1 && ordered.length > hot.length) box.appendChild(mk("div", "cm-hotsep"));
    });
  }
  const form = $c("cmForm");
  /* 글쓰기 태그: 지금 보는 커뮤니티의 계정은 고정(해제 불가), 나머지는 추가/해제 가능 */
  let wTags = [], wLock = new Set();
  const tagBox = mk("div", "cm-tagbox"); tagBox.id = "cmTagBox";
  { const row = form.querySelector(".cm-formrow"); row.parentNode.insertBefore(tagBox, row); }
  const drawTags = () => {
    tagBox.textContent = ""; tagBox.appendChild(mk("span", "cm-tagl", "태그"));
    wTags.forEach((id) => {
      const t = byId(id); if (!t) return;
      const c = mk("span", "cm-acc cm-wtag" + (wLock.has(id) ? " lock" : "")); try { c.appendChild(pIcon(t.platform)); } catch (e) {} c.appendChild(mk("em", "", hd(t)));
      if (!wLock.has(id)) { const x = mk("button", "cm-tx", "×"); x.type = "button"; x.setAttribute("aria-label", "태그 해제"); x.addEventListener("click", () => { wTags = wTags.filter((y) => y !== id); drawTags(); fillAcct(); }); c.appendChild(x); }
      tagBox.appendChild(c);
    });
    if (!wTags.length) tagBox.appendChild(mk("span", "cm-tagn", "태그 없음 (전체 커뮤니티에만 보여요)"));
  };
  let wImgs = [];
  const mediaRow = mk("div", "cm-mrow");
  { const ta = $c("cmBody"); ta.parentNode.insertBefore(mediaRow, ta.nextSibling);
    const pick = mk("button", "cm-pick", "🖼 이미지 추가"); pick.type = "button";
    const fi = mk("input"); fi.type = "file"; fi.accept = "image/*"; fi.multiple = true; fi.hidden = true;
    const vi = mk("input"); vi.type = "text"; vi.id = "cmVideo"; vi.placeholder = "링크 (유튜브·X·인스타 등, 여러 개는 띄어쓰기로)"; vi.setAttribute("aria-label", "영상 링크"); vi.autocomplete = "off";
    const strip = mk("div", "cm-thumbs"); strip.id = "cmThumbs";
    mediaRow.append(pick, fi, vi, strip);
    pick.addEventListener("click", () => fi.click());
    fi.addEventListener("change", async () => { for (const f of [...fi.files]) { if (wImgs.length >= 4) break; const d = await shrink(f); if (d) wImgs.push(d); } fi.value = ""; drawThumbs(); });
  }
  const drawThumbs = () => { const st = $c("cmThumbs"); st.textContent = ""; wImgs.forEach((src, i) => { const t = mk("span", "cm-th"); const im = mk("img"); im.src = src; im.alt = ""; const x = mk("button", "cm-tx", "×"); x.type = "button"; x.setAttribute("aria-label", "이미지 삭제"); x.addEventListener("click", () => { wImgs.splice(i, 1); drawThumbs(); }); t.append(im, x); st.appendChild(t); }); $c("cmThumbs").hidden = !wImgs.length; };
  const resetMedia = () => { wImgs = []; $c("cmVideo").value = ""; drawThumbs(); };
  const fillAcct = () => {
    const s = $c("cmAcct"); s.textContent = "";
    const ph = document.createElement("option"); ph.value = ""; ph.textContent = "+ 태그 추가"; s.appendChild(ph);
    accs().filter((t) => !wTags.includes(t.id)).forEach((t) => { const o = document.createElement("option"); o.value = t.id; o.textContent = hd(t) + " · " + (t.name || ""); s.appendChild(o); });
    s.value = "";
  };
  $c("cmAcct").addEventListener("change", (e) => { const v = e.target.value; if (v && !wTags.includes(v)) { wTags.push(v); drawTags(); } fillAcct(); });
  const startTags = () => { resetMedia(); wLock = new Set(view.t === "p" ? [...view.ids].filter((id) => byId(id)) : []); wTags = [...wLock]; drawTags(); fillAcct(); };
  $c("cmNew").addEventListener("click", () => { form.hidden = !form.hidden; if (!form.hidden) { startTags(); $c("cmTitle").focus(); } });
  $c("cmCancel").addEventListener("click", () => { form.hidden = true; form.reset(); resetMedia(); });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = $c("cmTitle").value.trim(), body = $c("cmBody").value.trim();
    if (!title || !body) { (title ? $c("cmBody") : $c("cmTitle")).focus(); return; }
    const id = Math.max(0, ...posts.map((p) => p.id)) + 1;
    const links = normLinks($c("cmVideo").value);
    posts.unshift({ id, uid: newUid(), tags: [...wTags], cat: $c("cmCat").value, title, body, imgs: [...wImgs], links, author: me(), at: Date.now(), likes: 0, comments: [] });
    form.reset(); resetMedia(); form.hidden = true; cat = "전체"; open = id; save(); render();
  });
  $c("cmBack").addEventListener("click", () => { if ($c("cmBack").dataset.mode === "post") { open = 0; render(); return; } view = { t: "list" }; open = 0; cat = "전체"; const qi = $c("q"); if (qi && qi.value) { qi.value = ""; qi.dispatchEvent(new Event("input", { bubbles: true })); } render(); });
  window.cmRender = render;
  window.cmOpen = (r) => {
    const accsOf = r.accs || [], one = accsOf.length === 1 ? accsOf[0] : null;
    const label = String((one && one.name) || personLabel(r)).replace(/^@+/, "");
    pendingOpen = { t: "p", ids: new Set(r.ids || accsOf.map((t) => t.id)), label, group: !one };
    const qi = $c("q"); if (qi) qi.value = "";
    $c("navCommunity").click();
  };
  { const _rl = renderList; renderList = function () { const r = _rl.apply(this, arguments); if (!$c("communityPanel").hidden) render(); return r; }; }
  $c("navCommunity").addEventListener("click", () => {
    if (!$c("setPanel").hidden) $c("setClose").click();
    /* 다른 탭에 갔다 돌아오면 보던 화면 그대로, 커뮤니티 안에서 아이콘을 다시 누르면 목록으로 */
    if (pendingOpen) { view = pendingOpen; cat = "전체"; open = 0; }
    else if (page === "community" || !view || view.t === "list") { view = { t: "list" }; cat = "전체"; open = 0; }
    pendingOpen = null;
    page = "community"; applyPage(); renderList(); render(); window.scrollTo(0, 0);
  });
})();
