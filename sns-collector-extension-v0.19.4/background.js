// 수집된 글을 검증해서 chrome.storage.local에 저장하고, 등록한 계정을 확인합니다.
// 외부 서버로는 아무것도 보내지 않습니다. (계정 페이지를 직접 열어 읽는 동작만 있습니다)
const WINDOW_DAYS = 7; // 기본 가져오기 기간(설정에서 7·14·30일로 바꿀 수 있음)
async function windowDays() {
  const d = await chrome.storage.local.get("windowDays");
  return [7, 14, 30, 60].includes(d.windowDays) ? d.windowDays : WINDOW_DAYS;
}
const DAY_MS = 86400000;
const MAX_ITEMS = 5000;
const MAX_TRACKED = 30;
const SOURCES = new Set(["youtube-video", "youtube-post", "x", "instagram"]);
const URL_OK = /^https:\/\/(www\.youtube\.com|x\.com|twitter\.com|www\.instagram\.com)\//;
const HANDLE_OK = /^[^\s/?#@]{1,60}$/;
const CHANNEL_OK = /^UC[\w-]{22}$/;
const ALARM = "auto-check";
const GAP_MIN_MS = 1500; // 계정 사이 간격(+ 무작위 0~5초)
const GAP_JITTER_MS = 1500;
const DEEP_WAIT_MS = 100000; // 지금 확인: 한 계정당 최대 대기
const SHALLOW_WAIT_MS = 40000; // 자동 확인: 한 계정당 최대 대기

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

/* ---------- 저장 ---------- */

function str(value, max) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function sanitize(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = str(raw.id, 120);
  const url = str(raw.url, 500);
  if (!id || !SOURCES.has(raw.source) || !URL_OK.test(url)) return null;
  const thumb = str(raw.thumb, 1000);
  return {
    id,
    source: raw.source,
    url,
    title: str(raw.title, 300),
    author: str(raw.author, 100),
    thumb: /^https:\/\//.test(thumb) ? thumb : "",
    publishedAt: str(raw.publishedAt, 40),
    publishedText: str(raw.publishedText, 40),
    via: str(raw.via, 200),
  };
}

function dropEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== "") out[k] = v;
  }
  return out;
}

// 상대 시각("3일 전")에서 추정한 날짜는 실제보다 늦게 나오므로, 두 값 중 이른 쪽이 더 정확합니다.
function earlierDate(a, b) {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta)) return b;
  if (Number.isNaN(tb)) return a;
  return ta <= tb ? a : b;
}

// 읽기-수정-쓰기가 겹치지 않도록 한 줄로 처리합니다.
let queue = Promise.resolve();

function save(items) {
  queue = queue
    .then(async () => {
      const data = await chrome.storage.local.get("items");
      const stored = data.items || {};
      const now = Date.now();
      for (const raw of items) {
        const item = sanitize(raw);
        if (!item) continue;
        const old = stored[item.id];
        if (old) {
          const merged = { ...old, ...dropEmpty(item), collectedAt: old.collectedAt };
          if (old.publishedAt && item.publishedAt) {
            merged.publishedAt = earlierDate(old.publishedAt, item.publishedAt);
          }
          stored[item.id] = merged;
        } else {
          stored[item.id] = { ...item, collectedAt: now };
        }
      }
      const ids = Object.keys(stored);
      if (ids.length > MAX_ITEMS) {
        ids
          .sort((a, b) => stored[a].collectedAt - stored[b].collectedAt)
          .slice(0, ids.length - MAX_ITEMS)
          .forEach((id) => delete stored[id]);
      }
      await chrome.storage.local.set({ items: stored });
    })
    .catch((e) => console.error("[sns-collector] 저장 실패", e));
  return queue;
}

/* ---------- 계정 페이지 방문 ---------- */

// 확장이 연 확인용 탭: { [tabId]: "deep" | "shallow" }  (서비스 워커가 재시작돼도 유지)
async function getAutoTabs() {
  const d = await chrome.storage.session.get("autoTabs");
  return d.autoTabs || {};
}

async function markTab(tabId, mode) {
  const map = await getAutoTabs();
  map[tabId] = mode;
  await chrome.storage.session.set({ autoTabs: map });
}

// 어느 추적 계정을 확인하러 연 탭인지(글에 붙여 계정별 묶음 보기에 씁니다)
async function setVia(tabId, via) {
  const d = await chrome.storage.session.get("autoVia");
  const map = d.autoVia || {};
  map[tabId] = via || "";
  await chrome.storage.session.set({ autoVia: map });
}

async function getVia(tabId) {
  const d = await chrome.storage.session.get("autoVia");
  return (d.autoVia || {})[tabId] || "";
}

async function unmarkTab(tabId) {
  const map = await getAutoTabs();
  delete map[tabId];
  await chrome.storage.session.set({ autoTabs: map });
}

// 콘텐츠 스크립트가 "수집 끝"을 알려오면 바로 다음으로 넘어갑니다.
const waiters = new Map();
// 확인용 탭/창을 사용자가 닫으면 시간 초과를 기다리지 않고 바로 알립니다.
chrome.tabs.onRemoved.addListener((tabId) => {
  const w = waiters.get(tabId);
  if (w) w({ closed: true });
});

function waitForDone(tabId, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiters.delete(tabId);
      resolve(null); // 시간 초과: 통계 없음
    }, ms);
    waiters.set(tabId, (stats) => {
      clearTimeout(timer);
      waiters.delete(tabId);
      resolve(stats || {});
    });
  });
}

// 계정 하나가 방문할 페이지 목록. 유튜브 채널은 영상 탭과 게시물 탭, 나머지는 한 곳입니다.
function pageUrls(t) {
  // 사이트 메인 주소로 추가한 "내 피드": 로그인된 계정의 구독/홈 화면을 방문합니다.
  if (t.kind === "feed") {
    if (t.platform === "youtube") return ["https://www.youtube.com/feed/subscriptions"];
    if (t.platform === "x") return ["https://x.com/home"];
    if (t.platform === "instagram") return ["https://www.instagram.com/"];
    return [];
  }
  const legacyUrl = /^https:\/\/www\.youtube\.com\/(c|user)\/[^/?#]+$/.test(t.resolveUrl || "") ? t.resolveUrl : "";
  if (!HANDLE_OK.test(t.handle || "") && !CHANNEL_OK.test(t.channelId || "") && !legacyUrl) return [];
  const h = encodeURIComponent(t.handle || "");
  if (t.platform === "youtube") {
    let base = "";
    if (t.handle) base = "https://www.youtube.com/@" + h;
    else if (CHANNEL_OK.test(t.channelId || "")) base = "https://www.youtube.com/channel/" + t.channelId;
    else if (legacyUrl) base = legacyUrl;
    else return [];
    return [base + "/videos", base + "/posts"];
  }
  if (t.platform === "x") return ["https://x.com/" + h];
  if (t.platform === "instagram") return ["https://www.instagram.com/" + h + "/"];
  return [];
}

// 자동 확인: 백그라운드 탭을 열어 첫 화면 위주로 수집하고 닫습니다. 이 확장이 연 탭만 닫습니다.
async function visitShallow(url, via) {
  const tab = await chrome.tabs.create({ url, active: false });
  await setVia(tab.id, via);
  await markTab(tab.id, "shallow");
  try {
    return await waitForDone(tab.id, SHALLOW_WAIT_MS);
  } finally {
    try {
      await chrome.tabs.remove(tab.id);
    } catch (e) {
      /* 이미 닫힘 */
    }
    await unmarkTab(tab.id);
  }
}

// 로그인 상태만 확인: 백그라운드 탭으로 메인 화면을 잠깐 열었다 닫습니다.
async function visitLogin(url) {
  const tab = await chrome.tabs.create({ url, active: false });
  await markTab(tab.id, "login");
  try {
    await waitForDone(tab.id, 15000);
  } finally {
    try { await chrome.tabs.remove(tab.id); } catch (e) { /* 이미 닫힘 */ }
    await unmarkTab(tab.id);
  }
}

// 게시물 보기: 게시물 페이지를 백그라운드 탭으로 열어 내용을 읽고 바로 닫습니다(저장하지 않음).
async function visitPost(url) {
  const tab = await chrome.tabs.create({ url, active: false });
  await markTab(tab.id, "post");
  try {
    return await waitForDone(tab.id, 30000);
  } finally {
    try { await chrome.tabs.remove(tab.id); } catch (e) { /* 이미 닫힘 */ }
    await unmarkTab(tab.id);
  }
}

// 이름 검색: 사이트의 검색 화면을 작은 창으로 열어 결과를 읽어 옵니다.
// 보이지 않는 탭에서는 인스타그램·X·유튜브가 화면을 제대로 그리지 않아 결과나 사진이 비므로, 잠깐 눈에 보이는 창을 씁니다(끝나면 자동으로 닫힘).
const searchWins = new Map(); // 이름 검색 창: 탭 번호 → 창 번호
async function visitSearch(url, q) {
  let w;
  // 처음에는 포커스를 가져오지 않는 작은 창으로 엽니다. 가려져서 화면이 안 그려지면 페이지가 요청해 그때만 앞으로 가져옵니다.
  try {
    w = await chrome.windows.create({ url, type: "popup", focused: false, width: 420, height: 600 });
  } catch (e) {
    w = await chrome.windows.create({ url, focused: false, width: 420, height: 600 });
  }
  const tabId = w.tabs[0].id;
  searchWins.set(tabId, w.id);
  await setVia(tabId, q);
  await markTab(tabId, "search");
  try {
    return await waitForDone(tabId, 30000);
  } finally {
    try { await chrome.windows.remove(w.id); } catch (e) { /* 이미 닫힘 */ }
    searchWins.delete(tabId);
    await unmarkTab(tabId);
  }
}

// 웹 화면은 외부 이미지를 막으므로, 검색 결과의 프로필 사진은 작은 데이터로 바꿔 전달합니다.
async function inlineAvatar(url, maxBytes = 60000) {
  if (!/^https:\/\//.test(url || "")) return "";
  try {
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) return "";
    const blob = await res.blob();
    if (blob.size > maxBytes || !/^image\//.test(blob.type)) return "";
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return "data:" + blob.type + ";base64," + btoa(bin);
  } catch (e) {
    return "";
  }
}

async function withAvatars(results) {
  return Promise.all((results || []).map(async (r) => ({ ...r, avatarUrl: r.avatar, avatar: await inlineAvatar(r.avatar, 150000) })));
}

function searchUrl(platform, q) {
  const e = encodeURIComponent(q);
  if (platform === "youtube") return "https://www.youtube.com/results?search_query=" + e + "&sp=EgIQAg%3D%3D";
  if (platform === "x") return "https://x.com/search?q=" + e + "&f=user";
  if (platform === "instagram") return "https://www.instagram.com/";
  return "";
}

const LOGIN_URLS = { youtube: "https://www.youtube.com/", x: "https://x.com/home", instagram: "https://www.instagram.com/" };

// 로그인 확인은 한 번에 하나만 돌립니다(이미 돌고 있으면 새 요청은 무시). platforms를 주면 그 매체만 확인합니다.
let loginChecking = false;
async function checkLogins(only) {
  if (loginChecking) return;
  loginChecking = true;
  try {
    for (const [platform, url] of Object.entries(LOGIN_URLS)) {
      if (Array.isArray(only) && !only.includes(platform)) continue;
      try { await visitLogin(url); } catch (e) { /* 다음 매체로 */ }
    }
  } finally {
    loginChecking = false;
  }
}

// 지금 확인: 보이는 창 하나를 열어 계정을 차례로 방문하며 7일 전 글이 나올 때까지 스크롤합니다.
// (숨겨진 탭에서는 브라우저가 스크롤 로딩을 멈추므로, 깊게 가져오려면 보이는 창이 필요합니다)
let deepWin = null;
let cancelRequested = false; // 웹에서 "닫기(수집 종료)"를 눌렀는지

async function visitDeep(url, via) {
  if (!deepWin) {
    // 조용히: 포커스를 가져오지 않고, 작게, 화면 밖 구석에 엽니다. (실패하면 일반 위치로 다시 시도)
    let w;
    try {
      w = await chrome.windows.create({ url, type: "normal", focused: false, width: 420, height: 420 });
    } catch (e) {
      w = await chrome.windows.create({ url, type: "normal", focused: false, width: 420, height: 420 });
    }
    deepWin = { windowId: w.id, tabId: w.tabs[0].id };
  } else {
    await chrome.tabs.update(deepWin.tabId, { url });
  }
  await setVia(deepWin.tabId, via);
  await markTab(deepWin.tabId, "deep");
  return waitForDone(deepWin.tabId, 480000 + 30000);
}

async function closeDeep() {
  if (!deepWin) return;
  const { windowId, tabId } = deepWin;
  deepWin = null;
  await unmarkTab(tabId);
  try {
    await chrome.windows.remove(windowId);
  } catch (e) {
    /* 이미 닫힘 */
  }
}

/* ---------- 확인 실행 ---------- */

async function setStatus(patch) {
  const d = await chrome.storage.local.get("status");
  await chrome.storage.local.set({ status: { ...(d.status || {}), ...patch } });
}

// 서비스 워커가 다시 시작됐다면 이전 실행은 끝난 것입니다.
chrome.storage.local.get("status", (d) => {
  if (d && d.status && d.status.running) chrome.storage.local.set({ status: { ...d.status, running: false } });
});

// 확인 요청은 한 줄로 처리합니다. mode: "deep"(지금 확인/계정 추가) | "shallow"(자동 확인), only: 특정 계정 id
const checkQueue = [];
let draining = false;

function requestCheck(mode, only) {
  if (checkQueue.some((q) => q.mode === mode && q.only === only)) return;
  checkQueue.push({ mode, only });
  if (!draining) drain();
}

async function drain() {
  draining = true;
  try {
    while (checkQueue.length) {
      await runCheck(checkQueue.shift());
    }
  } finally {
    draining = false;
  }
}

async function runCheck({ mode, only }) {
  // 긴 작업 중 서비스 워커가 종료되지 않도록 주기적으로 깨워 둡니다.
  const beat = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
  const days = await windowDays();
  const since = Date.now() - days * DAY_MS;
  try {
    cancelRequested = false;
    await setStatus({ running: true, message: "", closed: false, paused: false });
    const data = await chrome.storage.local.get(["tracked", "settings"]);
    let tracked = (data.tracked || []).slice(0, MAX_TRACKED);
    if (only) tracked = tracked.filter((t) => t.id === only);
    const settings = data.settings || {};
    const on = (platform) => settings[platform] !== false;

    const countItems = async () => {
      await queue; // 저장 대기열이 비워진 뒤 센다
      const d = await chrome.storage.local.get("items");
      return Object.keys(d.items || {}).length;
    };
    const before = await countItems();

    // 계정마다 방문할 페이지를 펼쳐서 한 줄로 만듭니다.
    const targets = [];
    for (const t of tracked) {
      if (!on(t.platform)) continue;
      const who = t.kind === "feed" ? t.platform + " 피드" : t.handle ? "@" + t.handle : t.channelId;
      const own = [7, 14, 30, 60].includes(t.days) ? t.days : days;
      for (const url of pageUrls(t)) targets.push({ who, url, via: t.kind === "feed" ? "" : t.id, days: own });
    }

    let visited = 0, closedByUser = false;
    const detail = [];
    const errors = [];
    for (let i = 0; i < targets.length; i++) {
      const { who, url, via, days: tdays } = targets[i];
      await setStatus({ running: true, message: `확인 중: ${who} (${i + 1}/${targets.length})` });
      try {
        const stats = mode === "deep" ? await visitDeep(url, via) : await visitShallow(url, via);
        if (stats && stats.closed) {
          // 사용자가 수집 창을 닫았습니다: 그때까지 모은 글은 남기고, 남은 계정은 확인하지 않고 멈춥니다.
          deepWin = null;
          if (cancelRequested) { errors.push("사용자가 수집을 종료했습니다"); break; }
          errors.push("수집 창이 닫혀 중단했습니다(" + who + ")");
          closedByUser = true;
          if (mode === "deep") break;
          continue;
        }
        visited += 1;
        const kind = url.endsWith("/videos") ? "영상" : url.endsWith("/posts") ? "게시물" : "";
        detail.push(`${who}${kind ? " " + kind : ""}: ` + (stats ? `화면 ${stats.found}개 중 ${tdays}일 이내 ${stats.sent}개` + (stats.hidden ? " (창이 가려져 더 못 불러왔을 수 있음)" : "") + (stats.why ? ` [스크롤 ${stats.scrolls}회 · ${stats.why}]` : "") : "응답 없음(시간 초과)"));
      } catch (e) {
        errors.push(String(e.message || e));
        if (mode === "deep") break; // 확인 창이 닫혔다면 중단합니다
      }
      if (i < targets.length - 1) await sleep(GAP_MIN_MS + Math.random() * GAP_JITTER_MS);
    }

    const added = Math.max(0, (await countItems()) - before);
    const parts = [`최근 ${days}일 · 페이지 ${visited}곳 확인 · 새 글 ${added}건`];
    if (detail.length) parts.push(detail.join(" / "));
    if (errors.length) parts.push(`오류 ${errors.length}건: ${errors[0]}`);
    await setStatus({ running: false, lastRun: Date.now(), message: parts.join(" · "), closed: closedByUser && mode === "deep", paused: false });
  } catch (e) {
    await setStatus({ running: false, lastRun: Date.now(), message: "실패: " + String(e.message || e) });
  } finally {
    clearInterval(beat);
    await closeDeep();
  }
}

/* ---------- 알람(자동 확인) ---------- */

async function syncAlarm() {
  const d = await chrome.storage.local.get("autoCheck");
  const cfg = d.autoCheck || {};
  // 자동 확인은 더 이상 타이머로 혼자 돌지 않습니다. 웹 화면을 보고 있을 때만(checkAuto) 주기가 지났으면 실행합니다.
  await chrome.alarms.clear(ALARM);
  void cfg;
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) requestCheck("shallow", "");
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.autoCheck) syncAlarm();
});

chrome.runtime.onInstalled.addListener(syncAlarm);
chrome.runtime.onStartup.addListener(syncAlarm);


/* ---------- 웹 화면 연결 ---------- */

const BRIDGE_PLATFORMS = new Set(["youtube", "x", "instagram"]);

function cleanTracked(list) {
  if (!Array.isArray(list)) throw new Error("계정 목록 형식이 올바르지 않습니다.");
  const out = [];
  for (const t of list.slice(0, MAX_TRACKED)) {
    if (!t || !BRIDGE_PLATFORMS.has(t.platform) || typeof t.id !== "string" || t.id.length > 200) continue;
    const c = { id: t.id, platform: t.platform, handle: "" };
    if (t.kind === "feed") c.kind = "feed";
    else if (typeof t.handle === "string" && (t.handle === "" || HANDLE_OK.test(t.handle))) c.handle = t.handle;
    else continue;
    if (CHANNEL_OK.test(t.channelId || "")) c.channelId = t.channelId;
    if (/^https:\/\/www\.youtube\.com\/(c|user)\/[^/?#]+$/.test(t.resolveUrl || "") && t.resolveUrl.length < 200) c.resolveUrl = t.resolveUrl;
    if (typeof t.group === "string" && t.group.trim()) c.group = t.group.trim().slice(0, 30);
    if ([7, 14, 30, 60].includes(t.days)) c.days = t.days; // 이 계정만의 가져올 기간(없으면 공통 기간)
    out.push(c);
  }
  return out;
}

async function bridgeOp(msg) {
  const d = await chrome.storage.local.get("bridgeToken");
  const want = d.bridgeToken;
  const hasCode = typeof want === "string" && want.length >= 16;
  // 코드 없이 허용하는 요청: 연결 여부 확인, 그리고 아직 코드가 없을 때만 웹 계정의 코드를 받아들이는 것
  if (msg.op === "status") return { paired: hasCode, match: hasCode && msg.token === want };
  if (msg.op === "adopt") {
    const nt = msg.payload && msg.payload.token;
    if (hasCode) throw new Error("이미 다른 연결 코드가 설정되어 있습니다. 확장 화면에서 연결을 해제한 뒤 다시 시도하세요.");
    if (typeof nt !== "string" || !/^[0-9a-f]{32}$/.test(nt)) throw new Error("연결 코드 형식이 올바르지 않습니다.");
    await chrome.storage.local.set({ bridgeToken: nt });
    return true;
  }
  if (typeof want !== "string" || want.length < 16 || msg.token !== want) throw new Error("웹 연결 코드가 맞지 않습니다.");
  const p = msg.payload || {};
  if (msg.op === "unpair") { // 웹 계정을 삭제했을 때: 이 확장의 웹 연결 코드를 해제합니다(수집한 글은 그대로 둡니다)
    await chrome.storage.local.remove("bridgeToken");
    return true;
  }
  if (msg.op === "get") {
    return chrome.storage.local.get(["items", "settings", "tracked", "autoCheck", "status", "loginState", "windowDays"]);
  }
  if (msg.op === "set") {
    const patch = {};
    if ("tracked" in p) patch.tracked = cleanTracked(p.tracked);
    if ("settings" in p && p.settings && typeof p.settings === "object") {
      patch.settings = {};
      for (const k of BRIDGE_PLATFORMS) if (typeof p.settings[k] === "boolean") patch.settings[k] = p.settings[k];
    }
    if ("autoCheck" in p && p.autoCheck && typeof p.autoCheck === "object") {
      patch.autoCheck = { enabled: p.autoCheck.enabled === true, hours: [1, 3, 6, 12].includes(p.autoCheck.hours) ? p.autoCheck.hours : 3 };
    }
    if ("windowDays" in p && [7, 14, 30, 60].includes(p.windowDays)) patch.windowDays = p.windowDays;
    await chrome.storage.local.set(patch);
    return true;
  }
  if (msg.op === "removeVia") {
    // 추적에서 뺀 계정으로 모은 글을 함께 지웁니다.
    const ids = Array.isArray(p.ids) ? p.ids.filter((x) => typeof x === "string" && x.length < 200).slice(0, 50) : [];
    const run = queue.then(async () => {
      const d = await chrome.storage.local.get("items");
      const st = d.items || {};
      let n = 0;
      for (const k of Object.keys(st)) if (ids.includes(st[k].via)) { delete st[k]; n++; }
      await chrome.storage.local.set({ items: st });
      return n;
    });
    queue = run.catch(() => {});
    return run;
  }
  if (msg.op === "clearItems") {
    await queue;
    await chrome.storage.local.remove("items");
    return true;
  }
  if (msg.op === "image") {
    // 웹 화면은 외부 이미지를 막으므로, 허용된 이미지 서버의 그림만 받아 데이터로 전달합니다.
    const u = typeof p.url === "string" ? p.url : "";
    if (!/^https:\/\/(i\.ytimg\.com|yt3\.ggpht\.com|yt3\.googleusercontent\.com|pbs\.twimg\.com|[\w-]+\.cdninstagram\.com|[\w-]+\.fbcdn\.net)\//.test(u)) return "";
    return inlineAvatar(u, 300000);
  }
  if (msg.op === "searchAccount") {
    const q = typeof p.q === "string" ? p.q.trim().slice(0, 60) : "";
    const url = BRIDGE_PLATFORMS.has(p.platform) ? searchUrl(p.platform, q) : "";
    if (!q || !url) throw new Error("검색어나 매체가 올바르지 않습니다.");
    const stats = await visitSearch(url, q);
    return withAvatars((stats && stats.results) || []);
  }
  if (msg.op === "fetchPost") {
    const u = typeof p.url === "string" ? p.url : "";
    if (!/^https:\/\/www\.youtube\.com\/post\/[\w-]{10,60}$/.test(u)) throw new Error("게시물 주소가 올바르지 않습니다.");
    const stats = await visitPost(u);
    const post = stats && stats.post;
    if (!post) throw new Error("게시물 내용을 읽지 못했습니다.");
    // 웹 화면은 외부 이미지를 막을 수 있어, 허용된 이미지 서버의 그림은 데이터로 바꿔 전달합니다.
    const inline = async (url) => (url ? (await inlineAvatar(url, 1500000)) || url : "");
    post.avatar = await inline(post.avatar);
    post.images = await Promise.all(post.images.map(inline));
    return post;
  }
  if (msg.op === "openWindow") {
    // 글 원본을 눈에 띄는 새 크롬 창으로 엽니다. 유튜브·X·인스타그램 주소만 허용합니다.
    const u = typeof p.url === "string" ? p.url : "";
    if (!URL_OK.test(u)) throw new Error("열 수 없는 주소입니다.");
    const w = 1100, h = 850;
    let pos = {};
    try {
      const cur = await chrome.windows.getLastFocused();
      if (cur && typeof cur.left === "number" && cur.width > 0) {
        pos = { left: Math.max(0, Math.round(cur.left + (cur.width - w) / 2)), top: Math.max(0, Math.round(cur.top + (cur.height - h) / 2)) };
      }
    } catch (e) { /* 위치 지정 없이 엽니다 */ }
    await chrome.windows.create({ url: u, type: "normal", width: w, height: h, focused: true, ...pos });
    return true;
  }
  if (msg.op === "openLogin") {
    const url = { youtube: "https://accounts.google.com/ServiceLogin?service=youtube", x: "https://x.com/i/flow/login", instagram: "https://www.instagram.com/accounts/login/" }[p.platform];
    if (!url) throw new Error("매체가 올바르지 않습니다.");
    // 로그인은 별도의 작은 창에서 직접 진행합니다(확장은 비밀번호를 다루지 않습니다).
    // 지금 쓰는 크롬 창 한가운데에 눈에 띄는 새 창으로 엽니다.
    const w = 980, h = 800;
    let pos = {};
    try {
      const cur = await chrome.windows.getLastFocused();
      if (cur && typeof cur.left === "number" && cur.width > 0) {
        pos = { left: Math.max(0, Math.round(cur.left + (cur.width - w) / 2)), top: Math.max(0, Math.round(cur.top + (cur.height - h) / 2)) };
      }
    } catch (e) { /* 위치 지정 없이 엽니다 */ }
    const win = await chrome.windows.create({ url, type: "normal", width: w, height: h, focused: true, ...pos });
    try { await chrome.windows.update(win.id, { focused: true, drawAttention: true }); } catch (e) { /* 무시 */ }
    return true;
  }
  if (msg.op === "resumeCheck") {
    // 일시정지된 수집창을 앞으로 가져와 이어서 수집합니다.
    if (deepWin) { try { await chrome.windows.update(deepWin.windowId, { focused: true }); } catch (e) { /* 이미 닫힘 */ } }
    return true;
  }
  if (msg.op === "cancelCheck") {
    // 수집을 종료하고 수집창을 닫습니다. 그때까지 모은 글은 남습니다.
    cancelRequested = true;
    checkQueue.length = 0;
    await closeDeep();
    await setStatus({ paused: false });
    return true;
  }
  if (msg.op === "checkLogin") {
    const only = Array.isArray(p.platforms) ? p.platforms.filter((x) => BRIDGE_PLATFORMS.has(x)) : null;
    checkLogins(only && only.length ? only : null); // 끝날 때까지 기다리지 않습니다. 결과는 get의 loginState로 확인합니다.
    return true;
  }
  if (msg.op === "checkAuto") {
    // 웹 화면이 보이는 동안에만 호출됩니다. 자동 확인이 켜져 있고, 마지막 확인 후 정한 주기가 지났을 때만 시작합니다.
    const d = await chrome.storage.local.get(["autoCheck", "status"]);
    const cfg = d.autoCheck || {}, st = d.status || {};
    const hours = [1, 3, 6, 12].includes(cfg.hours) ? cfg.hours : 3;
    if (!cfg.enabled || st.running || draining || checkQueue.length) return { started: false };
    if (st.lastRun && Date.now() - st.lastRun < hours * 3600000) return { started: false };
    requestCheck("shallow", "");
    return { started: true };
  }
  if (msg.op === "checkNow") {
    requestCheck("deep", typeof p.only === "string" ? p.only.slice(0, 200) : "");
    return true;
  }
  throw new Error("알 수 없는 요청입니다.");
}

/* ---------- 메시지 ---------- */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !msg) return;
  const fromExtensionPage = !!sender.url && sender.url.startsWith(chrome.runtime.getURL(""));
  const fromContent = !!sender.tab && !fromExtensionPage;

  if (msg.type === "bridge" && fromContent && typeof msg.op === "string") {
    bridgeOp(msg).then(
      (result) => sendResponse({ ok: true, result }),
      (e) => sendResponse({ ok: false, error: String((e && e.message) || e) })
    );
    return true; // 비동기 응답
  }
  if (msg.type === "paused" && fromContent) {
    // 수집창이 가려져 수집을 잠시 멈췄다/다시 시작했다는 알림(웹 화면이 안내 모달로 보여 줍니다).
    if (deepWin && deepWin.tabId === sender.tab.id) setStatus({ paused: !!msg.on });
    return;
  }
  if (msg.type === "needFocus" && fromContent) {
    // 가려진 창은 화면이 안 그려지므로, 아주 작게 만들어 화면 오른쪽 아래 구석에 앞으로 가져옵니다.
    const isDeep = !!(deepWin && deepWin.tabId === sender.tab.id);
    const wid = isDeep ? deepWin.windowId : searchWins.get(sender.tab.id);
    if (wid) {
      // 이름 검색 창은 아주 작게, 글 수집 창은 화면이 정상 배치되도록 조금 더 크게(그래도 구석에) 둡니다.
      const W = 420; // 수집 창은 가로·세로 모두 최소 크기(브라우저가 허용하는 최소보다 작게는 안 됩니다)
      let H = 420;
      if (typeof msg.sh === "number" && msg.sh > 200) H = Math.min(H, Math.round(msg.sh - 60)); // 작은 화면이면 화면 높이에 맞춥니다
      const num = (v) => (typeof v === "number" && isFinite(v) ? v : 0);
      const sw = num(msg.sw), sh = num(msg.sh);
      // 주의: windows.update에 focused:false를 주면 크롬이 '다음 창'을 앞으로 가져옵니다(다른 프로그램 창이 튀어나옴).
      // 그래서 위치만 옮길 때는 focused 값을 아예 넣지 않습니다.
      const base = msg.place ? { width: W, height: H } : { focused: true, width: W, height: H };
      const left = Math.round(num(msg.sl) + sw - W);
      const bottom = Math.round(num(msg.st) + sh);
      // 오른쪽 아래 구석. 크롬은 창의 절반 이상이 화면 안에 있어야 위치를 받아 주므로, 절반을 조금 넘게만 보이게(아래 약 45%는 화면 밖) 내립니다.
      // 거부되면 완전히 화면 안의 오른쪽 아래로, 그것도 안 되면 위치는 두고 앞으로만 가져옵니다.
      const tries = [];
      if (sw > W && sh > H) {
        tries.push({ ...base, left, top: bottom - Math.ceil(H * 0.55) });
        tries.push({ ...base, left, top: bottom - H });
      }
      if (!msg.place) tries.push({ focused: true });
      (async () => {
        for (const u of tries) {
          try { await chrome.windows.update(wid, u); return; } catch (err) { /* 다음 방법 */ }
        }
      })();
    }
    return;
  }
  if (msg.type === "login" && fromContent && typeof msg.loggedIn === "boolean") {
    let host = "";
    try { host = new URL(sender.tab.url || sender.url).hostname; } catch (e) { return; }
    const platform = /(^|\.)youtube\.com$/.test(host) ? "youtube" : /(^|\.)(x|twitter)\.com$/.test(host) ? "x" : /(^|\.)instagram\.com$/.test(host) ? "instagram" : "";
    if (!platform) return;
    chrome.storage.local.get("loginState", (d) => {
      const st = (d && d.loginState) || {};
      st[platform] = { loggedIn: msg.loggedIn, at: Date.now() };
      chrome.storage.local.set({ loginState: st });
    });
    return;
  }
  if (msg.type === "items" && fromContent && Array.isArray(msg.items)) {
    const batch = msg.items.slice(0, 200);
    getVia(sender.tab.id).then(
      (via) => save(via ? batch.map((i) => (i && typeof i === "object" ? { ...i, via } : i)) : batch),
      () => save(batch)
    );
    return;
  }
  if (msg.type === "hello" && fromContent) {
    getAutoTabs().then((map) => {
      const mode = map[sender.tab.id] || "";
      Promise.all([getVia(sender.tab.id), windowDays(), chrome.storage.local.get("tracked")]).then(([via, days, d]) => {
        const acc = ((d && d.tracked) || []).find((x) => x && x.id === via);
        if (acc && [7, 14, 30, 60].includes(acc.days)) days = acc.days; // 계정별 기간이 있으면 그것을 씁니다
        sendResponse({ auto: !!mode, mode, since: Date.now() - days * DAY_MS, q: mode === "search" ? via : "" });
      });
    });
    return true; // 비동기 응답
  }
  if (msg.type === "autoDone" && fromContent) {
    const done = waiters.get(sender.tab.id);
    if (done) {
      const results = Array.isArray(msg.results)
        ? msg.results.slice(0, 8).map((r) => {
            const avatar = str(r && r.avatar, 2000); // 인스타그램 사진 주소는 길어서 잘리면 쓸 수 없음
            return {
              handle: HANDLE_OK.test((r && r.handle) || "") ? r.handle : "",
              channelId: CHANNEL_OK.test((r && r.channelId) || "") ? r.channelId : "",
              name: str(r && r.name, 80),
              desc: str(r && r.desc, 100),
              avatar: /^https:\/\//.test(avatar) ? avatar : "",
            };
          }).filter((r) => r.handle || r.channelId)
        : [];
      let post = null;
      if (msg.post && typeof msg.post === "object") {
        const imgs = Array.isArray(msg.post.images) ? msg.post.images.filter((u) => typeof u === "string" && /^https:\/\//.test(u)).slice(0, 6) : [];
        post = {
          author: str(msg.post.author, 80),
          time: str(msg.post.time, 40),
          text: str(msg.post.text, 5000),
          likes: str(msg.post.likes, 20),
          avatar: /^https:\/\//.test(str(msg.post.avatar, 2000)) ? str(msg.post.avatar, 2000) : "",
          images: imgs,
          video: msg.post.video && /^[\w-]{11}$/.test(String(msg.post.video.id || "")) ? { id: msg.post.video.id, title: str(msg.post.video.title, 120) } : null,
        };
      }
      done({ found: Number(msg.found) || 0, sent: Number(msg.sent) || 0, results, post, hidden: msg.vis === "hidden", why: str(msg.why, 40), scrolls: Number(msg.scrolls) || 0 });
    }
    return;
  }
  if (msg.type === "searchAccount" && fromExtensionPage) {
    const q = typeof msg.q === "string" ? msg.q.trim().slice(0, 60) : "";
    const url = BRIDGE_PLATFORMS.has(msg.platform) ? searchUrl(msg.platform, q) : "";
    if (!q || !url) {
      sendResponse({ ok: false, error: "검색어나 매체가 올바르지 않습니다." });
      return;
    }
    visitSearch(url, q).then(
      (stats) => withAvatars((stats && stats.results) || []).then((results) => sendResponse({ ok: true, results })),
      (e) => sendResponse({ ok: false, error: String((e && e.message) || e) })
    );
    return true; // 비동기 응답
  }
  if (msg.type === "checkNow" && fromExtensionPage) {
    requestCheck("deep", typeof msg.only === "string" ? msg.only.slice(0, 120) : "");
    sendResponse({ ok: true });
  }
});
