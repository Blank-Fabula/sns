const LABELS = { all: "전체", "youtube-video": "유튜브 영상", "youtube-post": "유튜브 게시물", x: "X", instagram: "인스타그램", people: "사람별" };
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
  document.querySelectorAll(".card").forEach((c) => { if (c._item && c._item.id === it.id) c.classList.add("seen"); });
}
const $ = (id) => document.getElementById(id);

let winDays = 7, items = [], settings = {}, tracked = [], autoCheck = { enabled: false, hours: 3 }, checkStatus = {};
let personFocus = "", personPlat = "", groupFocus = "", activeTab = "all", token = "", connected = false, polling = null;

function el(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "text") n.textContent = v; else if (k === "class") n.className = v; else n.setAttribute(k, v);
  }
  children.forEach((c) => n.appendChild(c));
  return n;
}

