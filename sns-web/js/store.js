/* ---------- 로그인 계정에 저장 (db) ---------- */
let db = null, uid = null, savedAt = 0, saveNote = "", lastSig = "", syncTimer = null, syncing = false;
async function initStore() {
  try {
    db = window.claude && window.claude.use ? await window.claude.use("db") : null;
    const user = window.claude && window.claude.use ? await window.claude.use("user") : null;
    uid = user ? await user.id() : null;
  } catch (e) { db = null; }
  if (!db || !uid) { saveNote = window.claude ? "저장 불가(로그인 필요)" : ""; updateConnText(); return; }
  try {
    const base = "data/users/" + uid;
    const meta = await db.doc(base + "/meta").get();
    if (!meta.exists) { saveNote = "확장을 연결하면 내 계정에 자동 저장됩니다"; updateConnText(); return; }
    const m = meta.data() || {};
    const out = [];
    for (let i = 0; i < (m.chunks || 0); i++) {
      const c = await db.doc(base + "/c" + i).get();
      if (c.exists) out.push(...((c.data() || {}).items || []));
    }
    savedAt = Number(m.savedAt) || 0;
    if (!connected) {
      items = out;
      tracked = Array.isArray(m.tracked) ? m.tracked : [];
      settings = m.settings || {};
      autoCheck = m.autoCheck || autoCheck;
      renderAll();
    }
    saveNote = "";
    updateConnText();
  } catch (e) { saveNote = "저장본을 읽지 못했습니다"; updateConnText(); }
}
function sig() {
  let mx = 0;
  for (const it of items) if (it.collectedAt > mx) mx = it.collectedAt;
  return items.length + ":" + mx + ":" + JSON.stringify(tracked) + JSON.stringify(settings);
}
function maybeSync() {
  if (!db || !uid || !connected) return;
  const s = sig();
  if (s === lastSig) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => doSync(s), 2000);
}
async function doSync(s) {
  if (syncing) { syncTimer = setTimeout(() => doSync(s), 2000); return; }
  syncing = true;
  try {
    const base = "data/users/" + uid;
    const cut = Date.now() - 60 * 86400000;
    const keep = items.filter((it) => publishedMs(it) >= cut).sort((a, b) => publishedMs(b) - publishedMs(a)).slice(0, 3000);
    const size = 60, n = Math.ceil(keep.length / size);
    const prev = await db.doc(base + "/meta").get();
    const prevN = prev.exists ? Number((prev.data() || {}).chunks) || 0 : 0;
    for (let i = 0; i < n; i++) {
      await db.doc(base + "/c" + i).set({ items: keep.slice(i * size, (i + 1) * size) });
      await new Promise((r) => setTimeout(r, 120));
    }
    await db.doc(base + "/meta").set({ chunks: n, tracked, settings, autoCheck, savedAt: Date.now(), count: keep.length });
    for (let i = n; i < prevN; i++) await db.doc(base + "/c" + i).delete();
    lastSig = s; savedAt = Date.now(); saveNote = "내 계정에 저장됨";
  } catch (e) { saveNote = "저장 실패(" + ((e && e.code) || (e && e.message) || "오류") + ")"; }
  finally { syncing = false; updateConnText(); }
}

let lastDataSig = "", lastStatusSig = "", lastLoginSig = "";
async function refresh() {
  const d = await call("get");
  items = Object.values(d.items || {});
  settings = d.settings || {};
  tracked = Array.isArray(d.tracked) ? d.tracked : [];
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

