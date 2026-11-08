/* ---------- 내 계정에 저장(서버) : 다른 기기에서도 로그인하면 마지막 저장본이 보이게 합니다 ---------- */
// 확장이 연결된 PC는 글·추적 계정을 서버(/api/sync)에 올리고, 확장이 없는 기기는 그 저장본을 불러와 보여 줍니다.
let savedAt = 0, saveNote = "", lastSig = "", syncTimer = 0, syncing = false, lastPushAt = 0, importedTracked = false, forceSync = false;
let savedItems = [], savedMeta = null, baseTrackedSig = ""; // baseTrackedSig: 마지막으로 서버와 맞춘 추적 계정 목록 // 서버에서 불러온 저장본(확장 글과 합쳐서 보여줍니다)
let chunkSigs = [];
async function sapi(action, extra) {
  const r = await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ action, session: sess }, extra || {})) });
  let j;
  try { j = await r.json(); } catch (e) { throw new Error("서버 응답을 읽지 못했습니다."); }
  if (!j.ok) throw new Error(j.error || "요청에 실패했습니다.");
  return j;
}
async function pullSaved() {
  if (!sess) return;
  pullSeen();
  try {
    const { meta } = await sapi("meta");
    if (!meta) { saveNote = "확장으로 가져오면 내 계정에 자동 저장됩니다"; updateConnText(); return; }
    const out = [];
    for (let i = 0; i < (meta.chunks || 0); i++) out.push(...((await sapi("chunk", { i })).items || []));
    savedItems = out; savedMeta = meta; savedAt = Number(meta.savedAt) || 0;
    baseTrackedSig = JSON.stringify(meta.tracked || []);
    if (!connected) {
      if ([7, 14, 30, 60].includes(meta.windowDays)) { winDays = periodDays = meta.windowDays; }
      items = out;
      tracked = Array.isArray(meta.tracked) ? meta.tracked : [];
      settings = meta.settings || {};
      autoCheck = { enabled: true, hours: 1 }; // 1시간마다 고정
      renderAll();
    } else { lastDataSig = ""; }
    saveNote = ""; updateConnText();
  } catch (e) { saveNote = "저장본을 읽지 못했습니다"; updateConnText(); }
}
function initStore() { pullSaved(); }
// 확장의 글 + 서버 저장본을 합칩니다(같은 글은 확장 쪽이 우선). 추적을 끝낸 계정의 글은 뺍니다.
function mergeSaved(ext) {
  if (!savedItems.length) return ext;
  const ids = new Set(tracked.map((t) => t.id));
  const map = new Map(ext.map((it) => [it.id, it]));
  for (const it of savedItems) if (!map.has(it.id) && (!tracked.length || !it.via || ids.has(it.via))) map.set(it.id, it);
  return Array.from(map.values());
}
function sig() {
  let mx = 0;
  for (const it of items) if (it.collectedAt > mx) mx = it.collectedAt;
  return items.length + ":" + mx + ":" + JSON.stringify([tracked, settings, autoCheck, winDays]);
}
function maybeSync() {
  if (!sess || !connected) return;
  if (!forceSync && !items.length && !tracked.length) return; // 아무것도 없는 새 확장이 저장본을 덮어쓰지 않게 합니다(직접 지운 경우는 예외)
  const s = sig();
  if (!forceSync && s === lastSig) return;
  clearTimeout(syncTimer);
  const wait = forceSync ? 300 : Math.max(15000, lastPushAt + 60000 - Date.now()); // 글이 계속 들어와도 1분에 한 번만 저장
  syncTimer = setTimeout(() => doSync(s), wait);
}
async function doSync(s) {
  if (syncing) { syncTimer = setTimeout(() => doSync(s), 5000); return; }
  syncing = true;
  try {
    // 다른 기기가 그 사이에 저장했다면 그 내용을 합친 뒤에 올립니다(덮어써서 잃지 않게).
    let src = items, pushTracked = tracked;
    const forced = forceSync; forceSync = false;
    try {
      const m = forced ? null : (await sapi("meta")).meta; // 직접 지운 직후에는 서버 옛 내용을 다시 합치지 않습니다
      if (m && (Number(m.savedAt) || 0) > savedAt) {
        const fetched = [];
        for (let i = 0; i < (m.chunks || 0); i++) fetched.push(...((await sapi("chunk", { i })).items || []));
        const known = new Set(items.map((it) => it.id)), tids = new Set(tracked.map((t) => t.id));
        const extra = fetched.filter((it) => !known.has(it.id) && (!tracked.length || !it.via || tids.has(it.via)));
        src = items.concat(extra);
        savedItems = fetched; savedMeta = m;
        // 추적 계정은 이 기기에서 바꾼 게 없으면 서버(다른 기기) 목록을 따라가고, 바꿨다면 이 기기 것이 우선입니다.
        if (JSON.stringify(tracked) === baseTrackedSig && Array.isArray(m.tracked)) {
          pushTracked = m.tracked;
          if (JSON.stringify(m.tracked) !== JSON.stringify(tracked)) call("set", { tracked: m.tracked }).catch(() => {});
        }
        lastDataSig = ""; // 합쳐진 글이 다음 갱신 때 화면에 반영되게 함
      }
    } catch (e) { /* 합치지 못하면 이 기기 것만 올립니다 */ }
    const cut = Date.now() - 60 * 86400000;
    const keep = src.filter((it) => publishedMs(it) >= cut).sort((a, b) => publishedMs(b) - publishedMs(a)).slice(0, 2000);
    const size = 100, n = Math.ceil(keep.length / size);
    for (let i = 0; i < n; i++) {
      const part = keep.slice(i * size, (i + 1) * size);
      const cs = JSON.stringify(part);
      if (chunkSigs[i] === cs) continue; // 안 바뀐 덩어리는 다시 보내지 않습니다
      await sapi("putChunk", { i, items: part });
      chunkSigs[i] = cs;
    }
    chunkSigs.length = n;
    const r = await sapi("putMeta", { chunks: n, count: keep.length, tracked: pushTracked, settings, autoCheck, windowDays: winDays });
    lastSig = s; lastPushAt = Date.now(); savedAt = r.savedAt || Date.now(); saveNote = "내 계정에 저장됨";
    savedItems = keep; // 저장본 = 방금 올린 목록
    savedMeta = { tracked: pushTracked, settings, autoCheck, windowDays: winDays };
    baseTrackedSig = JSON.stringify(pushTracked);
  } catch (e) { saveNote = "저장 실패(" + ((e && e.message) || "오류") + ")"; lastPushAt = Date.now(); }
  finally { syncing = false; updateConnText(); }
}

let prevRunning = false;
const removedIds = new Set();
// 계정·글을 직접 지운 뒤: 서버 저장본도 바로 같은 내용으로 맞추고(빈 상태여도), 서버 옛 목록을 다시 가져오지 않게 합니다.
function syncNow() { importedTracked = true; forceSync = true; savedMeta = null; maybeSync(); }
let lastClosedShown = 0, pauseDismissed = false, lastAutoResume = 0;
let lastDataSig = "", lastStatusSig = "", lastLoginSig = "";
async function refresh() {
  const d = await call("get");
  const extItems = Object.values(d.items || {});
  settings = d.settings || {};
  if (Date.now() >= trackedHold) tracked = Array.isArray(d.tracked) ? d.tracked : [];
  if (Date.now() >= trackedHold && removedIds.size && tracked.some((t) => removedIds.has(t.id))) {
    tracked = tracked.filter((t) => !removedIds.has(t.id));
    call("set", { tracked }).catch(() => {}); // 지운 계정이 확장에 남아 있으면 다시 지웁니다
  }
  items = mergeSaved(extItems);
  // 새 PC의 확장은 추적 계정이 비어 있으니, 서버에 저장된 계정 목록을 한 번 가져와 채웁니다.
  if (!tracked.length && savedMeta && Array.isArray(savedMeta.tracked) && savedMeta.tracked.length && !importedTracked) {
    importedTracked = true;
    call("set", { tracked: savedMeta.tracked }).then(() => { lastDataSig = ""; }).catch(() => {});
  }
  autoCheck = { enabled: true, hours: 1 };
  winDays = [7, 14, 30, 60].includes(d.windowDays) ? d.windowDays : 30;
  periodDays = winDays;
  checkStatus = d.status || {};
  loginState = d.loginState || {};
  // 사용자가 수집창을 닫아 수집이 끝났다면: 한 번만 안내 모달을 띄웁니다.
  if (checkStatus.closed && checkStatus.lastRun && checkStatus.lastRun !== lastClosedShown && !checkStatus.running) {
    lastClosedShown = checkStatus.lastRun;
    $("closedModal").hidden = false;
    $("cmRetry").focus();
  }
  // 수집창이 가려져 수집이 일시정지됐다면 안내 모달을 띄웁니다(이어서 수집 / 닫기).
  // 이 웹 화면을 보고 있는 중이면 모달 없이 바로 수집창을 앞으로 내 이어서 수집합니다(몇 초 간격으로 한 번씩).
  // 웹 화면을 벗어나 있을 때만 모달(이어서 수집/닫기)을 준비해 둡니다.
  if (checkStatus.paused && checkStatus.running) {
    if (document.visibilityState === "visible") {
      $("pausedModal").hidden = true;
      if (!pauseDismissed && Date.now() - lastAutoResume > 6000) { lastAutoResume = Date.now(); call("resumeCheck").catch(() => {}); }
    } else if (!pauseDismissed) $("pausedModal").hidden = false;
  } else { pauseDismissed = false; $("pausedModal").hidden = true; }
  if (!connected) { setConn(true); lastDataSig = ""; lastStatusSig = ""; lastLoginSig = ""; }
  // 수집이 끝나는 순간, 프로필 사진도 함께 최신화합니다.
  { const nowRun = !!(checkStatus && checkStatus.running); if (prevRunning && !nowRun) setTimeout(() => refreshPics().catch(() => {}), 1500); prevRunning = nowRun; }
  // 웹을 처음 열 때의 로그인 확인은 3개 매체의 메인 화면을 백그라운드 탭으로 잠깐 열었다 닫습니다.
  // 30분 안에 확인한 적이 있으면 건너뛰어, 새로고침할 때마다 탭이 떴다 사라지지 않게 합니다.
  if (!loginAsked) {
    loginAsked = true;
    // 확인이 필요한(처음이거나 오래된) 매체만 확인합니다.
    const stale = Object.keys(LOGIN_LINK).filter((p) => !loginState[p] || Date.now() - (loginState[p].at || 0) > 30 * 60000);
    if (stale.length) call("checkLogin", { platforms: stale }).catch(() => {});
  }
  // 바뀐 부분만 다시 그려서 화면이 깜빡이지 않게 합니다.
  let mx = 0;
  for (const it of items) if (it.collectedAt > mx) mx = it.collectedAt;
  const dataSig = items.length + ":" + mx + ":" + JSON.stringify([tracked, settings, autoCheck, winDays]);
  const statusSig = JSON.stringify(checkStatus);
  const loginSig = JSON.stringify([loginState, settings]);
  // 확인(업데이트)이 진행되는 동안에는 글 목록을 다시 그리지 않고(상태 문구만 갱신), 끝난 뒤에 한 번만 새로 그립니다.
  const updating = !!(checkStatus && checkStatus.running) && firstDrawn;
  if (dataSig !== lastDataSig && !updating) { lastDataSig = dataSig; lastStatusSig = statusSig; firstDrawn = true; keepView(renderAll); }
  else if (statusSig !== lastStatusSig) { lastStatusSig = statusSig; renderTracked(); }
  if (loginSig !== lastLoginSig) { lastLoginSig = loginSig; renderLogin(); }
  renderWork();
  if (!updating) maybeSync(); // 저장도 업데이트가 끝난 뒤에
  autoTick();
}
let firstDrawn = false, lastAutoTry = 0;
// 자동 확인: 이 웹 화면을 보고 있을 때만 확장에 "주기가 지났으면 확인해 달라"고 요청합니다(주기 판단은 확장이 합니다).
function autoTick(force) {
  if (document.visibilityState !== "visible" || !connected || !autoCheck.enabled) return;
  if (checkStatus && checkStatus.running) return;
  if (!force && Date.now() - lastAutoTry < 30000) return;
  lastAutoTry = Date.now();
  call("checkAuto").catch(() => {});
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  // 웹 화면으로 돌아오면 일시정지 모달을 바로 치우고(3초 주기를 기다리지 않고) 곧바로 상태를 다시 읽어 이어서 수집합니다.
  $("pausedModal").hidden = true;
  if (connected) refresh().catch(() => {});
  autoTick(true);
});

async function connect(tok, fromForm) {
  token = tok;
  const err = $("acctMsg");
  err.hidden = true;
  try {
    await refresh();
    try { localStorage.setItem("snsToken", tok); } catch (e) { /* 저장 불가 */ }
    setConn(true);
    clearInterval(polling);
    polling = setInterval(() => refresh().catch(() => { if (connected) setConn(false); }), 3000);
  } catch (e) {
    setConn(false);
    if (fromForm) { err.textContent = e.message; err.hidden = false; }
  }
}


/* 새로 그린 뒤에도 보던 자리를 유지합니다: 페이지 세로 위치, 각 줄의 가로 위치(보던 첫 카드 기준), 세로 격자의 보던 카드. */
function viewKey(sec, seen) {
  const h = sec.querySelector(".sec-head h3, .sec-head h4");
  const base = h ? h.textContent.trim() : "";
  seen[base] = (seen[base] || 0) + 1;
  return base + "#" + seen[base];
}
function firstVisibleCard(box, horizontal) {
  const rb = box.getBoundingClientRect();
  for (const c of box.children) {
    if (!c._item) continue;
    const r = c.getBoundingClientRect();
    if (horizontal ? r.right > rb.left + 1 : r.bottom > 0) return { id: c._item.id, off: horizontal ? r.left - rb.left : r.top };
  }
  return null;
}
function keepView(draw) {
  const grid = document.getElementById("grid");
  const y = window.scrollY, rows = {}, cnt = {};
  let vert = null, secAnchor = null;
  try {
    grid.querySelectorAll(".sec").forEach((sec) => {
      const key = viewKey(sec, cnt);
      // 세로 기준: 지금 화면에 걸쳐 보이는 첫 줄(계정·묶음). 위에 새 줄이 끼어들어도 이 줄이 같은 자리에 오게 합니다.
      if (!secAnchor) { const r = sec.getBoundingClientRect(); if (r.bottom > 0) secAnchor = { key, top: r.top }; }
      const row = sec.querySelector(".row-cards");
      if (row) rows[key] = { left: row.scrollLeft, a: firstVisibleCard(row, true) };
    });
    const cards = grid.matches(".cards") ? grid : grid.querySelector(".cards");
    if (cards) vert = firstVisibleCard(cards, false);
  } catch (e) { /* 위치를 못 읽으면 그냥 다시 그립니다 */ }
  draw();
  try {
    const cnt2 = {};
    grid.querySelectorAll(".sec").forEach((sec) => {
      const row = sec.querySelector(".row-cards"), st = row && rows[viewKey(sec, cnt2)];
      if (!row || !st) return;
      const c = st.a && Array.from(row.children).find((n) => n._item && n._item.id === st.a.id);
      row.scrollLeft = c ? Math.max(0, c.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft - st.a.off) : st.left;
    });
    window.scrollTo(0, y);
    if (secAnchor) {
      const cnt3 = {};
      for (const sec of grid.querySelectorAll(".sec")) {
        if (viewKey(sec, cnt3) === secAnchor.key) { window.scrollBy(0, sec.getBoundingClientRect().top - secAnchor.top); break; }
      }
    }
    if (vert) {
      const cards = grid.matches(".cards") ? grid : grid.querySelector(".cards");
      const c = cards && Array.from(cards.children).find((n) => n._item && n._item.id === vert.id);
      if (c) window.scrollBy(0, c.getBoundingClientRect().top - vert.off);
    }
  } catch (e) { /* 무시 */ }
}

/* ---------- 본 글 기록(흐리게 보이는 표시)을 계정에 동기화: 합집합으로만 합칩니다 ---------- */
const seenQueue = new Set();
let seenTimer = 0, lastSeenPull = 0;
function queueSeen(id) {
  if (!sess) return;
  seenQueue.add(id);
  clearTimeout(seenTimer);
  seenTimer = setTimeout(flushSeen, 8000);
}
async function flushSeen() {
  if (!sess || !seenQueue.size) return;
  const add = Array.from(seenQueue).slice(0, 500);
  try {
    await sapi("putSeen", { add });
    add.forEach((id) => seenQueue.delete(id));
  } catch (e) { /* 다음 기회에 다시 보냅니다 */ }
  if (seenQueue.size) { clearTimeout(seenTimer); seenTimer = setTimeout(flushSeen, 8000); }
}
async function pullSeen() {
  if (!sess) return;
  lastSeenPull = Date.now();
  try {
    const ids = (await sapi("getSeen")).ids || [];
    const server = new Set(ids);
    let added = false;
    for (const id of ids) if (!seen.has(id)) { seen.add(id); added = true; }
    if (added) {
      saveSeen();
      document.querySelectorAll("#grid .card").forEach((c) => { if (c._item && seen.has(c._item.id)) c.classList.add("seen"); });
    }
    // 이 기기에만 있던 기록은 서버로 올립니다.
    Array.from(seen).slice(-2000).forEach((id) => { if (!server.has(id)) seenQueue.add(id); });
    if (seenQueue.size) { clearTimeout(seenTimer); seenTimer = setTimeout(flushSeen, 3000); }
  } catch (e) { /* 무시 */ }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && sess && Date.now() - lastSeenPull > 60000) pullSeen();
});
