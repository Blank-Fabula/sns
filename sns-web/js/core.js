/* API 서버 주소: vercel.app에서 열면 같은 주소의 /api, GitHub Pages 등 다른 주소에서 열면 Vercel 서버를 직접 부릅니다.
   (로그인·저장본은 어느 주소에서 열어도 같은 Vercel 서버를 씁니다.) */
const API_ORIGIN = "https://sns-mix.vercel.app";
const API_BASE = /(^|\.)vercel\.app$/.test(location.hostname) ? "" : API_ORIGIN;
/* 서버(Vercel) 호출. 8초 안에 응답이 없거나 막혀 있으면 offline 오류로 알립니다(학교망 등). */
async function apiPost(path, obj) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
  try {
    return await fetch(API_BASE + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj), signal: ctl.signal });
  } catch (e) {
    const er = new Error("서버에 연결할 수 없습니다."); er.offline = true; throw er;
  } finally { clearTimeout(t); }
}
const LABELS = { people: "사람별", youtube: "유튜브", x: "X", instagram: "인스타" };
/* 오른쪽 "현재 작업" 카드 아래 표시되는 정보 — 여기서 바꾸면 됩니다 */
const WEB_VERSION = "v265";
const TEAM_NAME = "WebMonster";
const TEAM_GITHUB = "https://github.com/WM-WebMonsters";
const SRC_LABELS = { "youtube-video": "유튜브 영상", "youtube-post": "유튜브 게시물", x: "X", instagram: "인스타" };
let searchPlats = ["youtube", "x", "instagram"]; // 통합 검색에서 찾을 매체
try { const v = JSON.parse(localStorage.getItem("snsSearchPlats") || "null"); if (Array.isArray(v)) { const f = v.filter((p) => ["youtube", "x", "instagram"].includes(p)); if (f.length) searchPlats = f; } } catch (e) {}
let ytMode = "both"; // 유튜브 탭: video(영상만) / both(둘 다) / post(게시물만)
try { const m = localStorage.getItem("snsYtMode"); if (m === "video" || m === "post") ytMode = m; } catch (e) {}
const tabOf = (s) => (String(s).startsWith("youtube") ? "youtube" : s);
const PLAT_ORDER = ["instagram", "x", "youtube"]; // 표시 순서
function platOrder(a) { return a.slice().sort((p, q) => PLAT_ORDER.indexOf(p) - PLAT_ORDER.indexOf(q)); }
const PLATFORM = { youtube: "유튜브", x: "X", instagram: "인스타" };
const RESERVED = new Set(["home", "explore", "i", "search", "p", "reel", "reels", "accounts", "settings", "messages"]);
const MAX_TRACKED = 30;
/* ---------- 확인한 글 기록(이어보기) : 연 글을 이 브라우저에만 기록합니다 ---------- */
const seen = new Set();
try { JSON.parse(localStorage.getItem("snsSeen") || "[]").forEach((x) => typeof x === "string" && seen.add(x)); } catch (e) {}
let seenSaveTimer = 0;
function saveSeen() {
  clearTimeout(seenSaveTimer);
  seenSaveTimer = setTimeout(() => { try { localStorage.setItem("snsSeen", JSON.stringify([...seen].slice(-8000))); } catch (e) { /* 저장 불가 */ } }, 400);
}
function markSeen(it) {
  if (!it || !it.id || seen.has(it.id)) return;
  seen.add(it.id);
  saveSeen();
  if (typeof queueSeen === "function") queueSeen(it.id); // 로그인 상태면 다른 기기에도 반영
  document.querySelectorAll(".card").forEach((c) => { if (c._item && c._item.id === it.id) c.classList.add("seen"); });
}
const $ = (id) => document.getElementById(id);

let trackedHold = 0; // 추적 계정을 확장에 저장하는 중이면, 그 사이 도착한 옛 목록이 화면 목록을 덮어쓰지 않게 막는 시각
let searchActive = 0; // 계정 검색이 진행 중인 개수(검색이 수집보다 우선: 이 동안은 수집창을 자동으로 앞으로 내지 않습니다)
let winDays = 30, items = [], settings = {}, tracked = [], autoCheck = { enabled: true, hours: 1 }, checkStatus = {};
let selIds = []; // 계정 관리에서 고른 계정(누른 순서)
let personFocus = "", personPlat = "", groupFocus = "", activeTab = "people", token = "", connected = false, polling = null;

function el(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "text") n.textContent = v; else if (k === "class") n.className = v; else n.setAttribute(k, v);
  }
  children.forEach((c) => n.appendChild(c));
  return n;
}

