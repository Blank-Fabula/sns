/* ---------- 내 계정에 저장(서버) : 다른 기기에서도 로그인하면 마지막 저장본이 보이게 합니다 ---------- */
// 확장이 연결된 PC는 글·추적 계정을 서버(/api/sync)에 올리고, 확장이 없는 기기는 그 저장본을 불러와 보여 줍니다.
let savedAt = 0, saveNote = "", lastSig = "", syncTimer = 0, syncing = false, lastPushAt = 0, importedTracked = false;
let savedItems = [], savedMeta = null; // 서버에서 불러온 저장본(확장 글과 합쳐서 보여줍니다)
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
  try {
    const { meta } = await sapi("meta");
    if (!meta) { saveNote = "확장으로 가져오면 내 계정에 자동 저장됩니다"; updateConnText(); return; }
    const out = [];
    for (let i = 0; i < (meta.chunks || 0); i++) out.push(...((await sapi("chunk", { i })).items || []));
    savedItems = out; savedMeta = meta; savedAt = Number(meta.savedAt) || 0;
    if (!connected) {
      items = out;
      tracked = Array.isArray(meta.tracked) ? meta.tracked : [];
      settings = meta.settings || {};
      autoCheck = meta.autoCheck || autoCheck;
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
  if (!items.length && !tracked.length) return; // 아무것도 없는 새 확장이 저장본을 덮어쓰지 않게 합니다
  const s = sig();
  if (s === lastSig) return;
  clearTimeout(syncTimer);
  const wait = Math.max(15000, lastPushAt + 60000 - Date.now()); // 글이 계속 들어와도 1분에 한 번만 저장
  syncTimer = setTimeout(() => doSync(s), wait);
}
async function doSync(s) {
  if (syncing) { syncTimer = setTimeout(() => doSync(s), 5000); return; }
  syncing = true;
  try {
    const cut = Date.now() - 60 * 86400000;
    const keep = items.filter((it) => publishedMs(it) >= cut).sort((a, b) => publishedMs(b) - publishedMs(a)).slice(0, 2000);
    const size = 100, n = Math.ceil(keep.length / size);
    for (let i = 0; i < n; i++) {
      const part = keep.slice(i * size, (i + 1) * size);
      const cs = JSON.stringify(part);
      if (chunkSigs[i] === cs) continue; // 안 바뀐 덩어리는 다시 보내지 않습니다
      await sapi("putChunk", { i, items: part });
      chunkSigs[i] = cs;
    }
    chunkSigs.length = n;
    const r = await sapi("putMeta", { chunks: n, count: keep.length, tracked, settings, autoCheck, windowDays: winDays });
    lastSig = s; lastPushAt = Date.now(); savedAt = r.savedAt || Date.now(); saveNote = "내 계정에 저장됨";
    savedItems = keep; // 저장본 = 방금 올린 목록
    savedMeta = { tracked, settings, autoCheck, windowDays: winDays };
  } catch (e) { saveNote = "저장 실패(" + ((e && e.message) || "오류") + ")"; lastPushAt = Date.now(); }
  finally { syncing = false; updateConnText(); }
}

let lastDataSig = "", lastStatusSig = "", lastLoginSig = "";
async function refresh() {
  const d = await call("get");
  const extItems = Object.values(d.items || {});
  settings = d.settings || {};
  tracked = Array.isArray(d.tracked) ? d.tracked : [];
  items = mergeSaved(extItems);
  // 새 PC의 확장은 추적 계정이 비어 있으니, 서버에 저장된 계정 목록을 한 번 가져와 채웁니다.
  if (!tracked.length && savedMeta && Array.isArray(savedMeta.tracked) && savedMeta.tracked.length && !importedTracked) {
    importedTracked = true;
    call("set", { tracked: savedMeta.tracked }).then(() => { lastDataSig = ""; }).catch(() => {});
  }
  autoCheck = d.autoCheck || { enabled: false, hours: 3 };
  winDays = [7, 14, 30, 60].includes(d.windowDays) ? d.windowDays : 7;
  checkStatus = d.status || {};
  loginState = d.loginState || {};
  if (!connected) { setConn(true); lastDataSig = ""; lastStatusSig = ""; lastLoginSig = ""; }
  if (!loginAsked) { loginAsked = true; call("checkLogin").catch(() => {}); }
  // 바뀐 부분만 다시 그려서 화면이 깜빡이지 않게 합니다.
  let mx = 0;
  for (const it of items) if (it.collectedAt > mx) mx = it.collectedAt;
  const dataSig = items.length + ":" + mx + ":" + JSON.stringify([tracked, settings, autoCheck, winDays]);
  const statusSig = JSON.stringify(checkStatus);
  const loginSig = JSON.stringify(loginState);
  if (dataSig !== lastDataSig) { lastDataSig = dataSig; lastStatusSig = statusSig; renderAll(); }
  else if (statusSig !== lastStatusSig) { lastStatusSig = statusSig; renderTracked(); }
  if (loginSig !== lastLoginSig) { lastLoginSig = loginSig; renderLogin(); }
  maybeSync();
}

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

