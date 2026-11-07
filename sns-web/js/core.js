const LABELS = { people: "사람별", youtube: "유튜브", x: "X", instagram: "인스타그램" };
const SRC_LABELS = { "youtube-video": "유튜브 영상", "youtube-post": "유튜브 게시물", x: "X", instagram: "인스타그램" };
let searchPlats = ["youtube", "x", "instagram"]; // 통합 검색에서 찾을 매체
try { const v = JSON.parse(localStorage.getItem("snsSearchPlats") || "null"); if (Array.isArray(v)) { const f = v.filter((p) => ["youtube", "x", "instagram"].includes(p)); if (f.length) searchPlats = f; } } catch (e) {}
let ytMode = "both"; // 유튜브 탭: video(영상만) / both(둘 다) / post(게시물만)
try { const m = localStorage.getItem("snsYtMode"); if (m === "video" || m === "post") ytMode = m; } catch (e) {}
const tabOf = (s) => (String(s).startsWith("youtube") ? "youtube" : s);
const PLATFORM = { youtube: "유튜브", x: "X", instagram: "인스타그램" };
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

let winDays = 7, items = [], settings = {}, tracked = [], autoCheck = { enabled: true, hours: 1 }, checkStatus = {};
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

