// 수집된 글을 보여주는 화면. 모든 데이터는 chrome.storage.local에서만 읽습니다.
const LABELS = {
  all: "전체",
  "youtube-video": "유튜브 영상",
  "youtube-post": "유튜브 게시물",
  x: "X",
  instagram: "인스타그램",
};

let items = [];
let settings = {};
let activeTab = "all";
let tracked = [];
let autoCheck = { enabled: false, hours: 3 };
let checkStatus = {};

const PLATFORM = { youtube: "유튜브", x: "X", instagram: "인스타그램" };
const RESERVED = new Set(["home", "explore", "i", "search", "p", "reel", "reels", "accounts", "settings", "messages"]);
const MAX_TRACKED = 30;

const $ = (id) => document.getElementById(id);

// 화면 처리 중 오류가 나면 조용히 멈추지 않고 화면 위쪽에 문구로 보여줍니다.
function showFatal(message) {
  const box = $("fatal");
  box.textContent = "화면 오류: " + message + " (이 문구를 그대로 알려 주세요)";
  box.hidden = false;
}
window.addEventListener("error", (ev) => {
  if (location.protocol !== "chrome-extension:") return; // 아래 안내가 대신 표시됩니다
  showFatal(ev.message || String(ev.error));
});
// 파일을 직접 열었거나(file://) 확장 밖에서 열면 저장소가 없어 아무것도 동작하지 않습니다.
if (location.protocol !== "chrome-extension:" || !(window.chrome && chrome.storage)) {
  const box = $("fatal");
  box.textContent =
    "이 화면이 확장 프로그램 안에서 열리지 않았습니다. dashboard.html 파일을 직접 열지 말고, 크롬 오른쪽 위 퍼즐 아이콘에서 'SNS 신규글 모아보기'를 눌러 여세요. (주소가 chrome-extension://로 시작해야 합니다)";
  box.hidden = false;
  throw new Error("not-extension-page");
}
window.addEventListener("unhandledrejection", (ev) =>
  showFatal(String((ev.reason && ev.reason.message) || ev.reason))
);

// 백그라운드(확인 작업)에 요청하고, 연결이 안 되면 이유를 보여줍니다.
function requestCheck(only) {
  try {
    chrome.runtime.sendMessage({ type: "checkNow", only: only || "" }, () => {
      if (chrome.runtime.lastError) showFatal("확인 작업에 연결하지 못했습니다: " + chrome.runtime.lastError.message);
    });
  } catch (e) {
    showFatal("확인 작업 요청 실패: " + (e && e.message));
  }
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "text") node.textContent = v;
    else if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  children.forEach((c) => node.appendChild(c));
  return node;
}

const rtf = new Intl.RelativeTimeFormat("ko", { numeric: "auto" });

function relative(ms) {
  const diff = (ms - Date.now()) / 1000;
  const units = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, sec] of units) {
    if (Math.abs(diff) >= sec) return rtf.format(Math.round(diff / sec), unit);
  }
  return "방금";
}

function publishedMs(it) {
  const t = Date.parse(it.publishedAt || "");
  return Number.isNaN(t) ? it.collectedAt : t;
}

// 보기 기간(일). 0이면 전체. 기본은 최근 7일입니다.
let periodDays = 7;
try {
  const saved = localStorage.getItem("periodDays");
  if (saved !== null && !Number.isNaN(Number(saved))) periodDays = Number(saved);
} catch (e) {
  /* 저장소를 못 쓰면 기본값 사용 */
}

function inPeriod(it) {
  return !periodDays || publishedMs(it) >= Date.now() - periodDays * 86400000;
}

function card(it) {
  const children = [];
  if (it.thumb) {
    const img = el("img", { src: it.thumb, alt: "", loading: "lazy", referrerpolicy: "no-referrer" });
    img.addEventListener("error", () => img.remove()); // 만료된 썸네일은 숨깁니다
    children.push(img);
  }
  const published = it.publishedAt ? relative(Date.parse(it.publishedAt)) : it.publishedText || "";
  const meta = [it.author, published ? "게시 " + published : "", "수집 " + relative(it.collectedAt)]
    .filter(Boolean)
    .join(" · ");
  children.push(
    el("div", { class: "body" }, [
      el("span", { class: "badge", text: LABELS[it.source] || it.source }),
      el("div", { class: "title", text: it.title }),
      el("div", { class: "meta", text: meta }),
    ])
  );
  return el("a", { class: "card", href: it.url, target: "_blank", rel: "noopener noreferrer" }, children);
}

function renderTabs() {
  const visible = items.filter(inPeriod);
  const counts = { all: visible.length };
  visible.forEach((it) => (counts[it.source] = (counts[it.source] || 0) + 1));
  const nav = $("tabs");
  nav.textContent = "";
  Object.keys(LABELS).forEach((key) => {
    const b = el("button", {
      type: "button",
      class: key === activeTab ? "active" : "",
      text: `${LABELS[key]} ${counts[key] || 0}`,
    });
    b.addEventListener("click", () => {
      activeTab = key;
      render();
    });
    nav.appendChild(b);
  });
}

function render() {
  renderTabs();
  const q = $("q").value.trim().toLowerCase();
  const sort = $("sort").value;
  let list = items.filter(inPeriod).filter((it) => activeTab === "all" || it.source === activeTab);
  if (q) list = list.filter((it) => (it.title + " " + it.author).toLowerCase().includes(q));
  list.sort((a, b) =>
    sort === "published" ? publishedMs(b) - publishedMs(a) : b.collectedAt - a.collectedAt
  );
  const grid = $("grid");
  grid.textContent = "";
  list.slice(0, 300).forEach((it) => grid.appendChild(card(it)));
  $("empty").hidden = list.length > 0;
}

function renderSettings() {
  document.querySelectorAll(".settings input[data-key]").forEach((box) => {
    box.checked = settings[box.dataset.key] !== false;
  });
}

async function load() {
  let data;
  try {
    data = await chrome.storage.local.get(["items", "settings", "tracked", "autoCheck", "status"]);
  } catch (e) {
    showFatal("저장된 데이터를 읽지 못했습니다: " + (e && e.message));
    return;
  }
  items = Object.values(data.items || {});
  settings = data.settings || {};
  tracked = Array.isArray(data.tracked) ? data.tracked : [];
  autoCheck = data.autoCheck || { enabled: false, hours: 3 };
  checkStatus = data.status || {};
  // 한 부분이 실패해도 나머지는 계속 그립니다.
  for (const [name, step] of [["설정", renderSettings], ["추적 계정", renderTracked], ["목록", render]]) {
    try {
      step();
    } catch (e) {
      showFatal(name + " 표시 중 " + (e && e.message));
    }
  }
}

document.querySelectorAll(".settings input[data-key]").forEach((box) => {
  box.addEventListener("change", async () => {
    settings[box.dataset.key] = box.checked;
    await chrome.storage.local.set({ settings });
  });
});

$("q").addEventListener("input", render);
$("sort").addEventListener("change", render);

$("period").value = String(periodDays);
$("period").addEventListener("change", () => {
  periodDays = Number($("period").value);
  try {
    localStorage.setItem("periodDays", String(periodDays));
  } catch (e) {
    /* 무시 */
  }
  render();
});

$("export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: `sns-collected-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  URL.revokeObjectURL(url);
});

$("clear").addEventListener("click", async () => {
  if (!confirm("수집한 글을 모두 삭제합니다. 되돌릴 수 없습니다. 계속할까요?")) return;
  await chrome.storage.local.remove("items");
});

/* ---------- 추적 계정 ---------- */

const FEED = { youtube: "내 구독 피드", x: "홈 타임라인", instagram: "홈 피드" };
const SITE_START = /^(www\.|m\.|mobile\.)?(youtube\.com|youtu\.be|x\.com|twitter\.com|instagram\.com)(\/|$)/i;
const VIDEO_MSG = "영상 주소입니다. 채널 주소(예: https://www.youtube.com/@이름)를 넣어 주세요.";

// 입력을 해석해 { account } 또는 { error }를 돌려줍니다.
function parseAccount(platformHint, raw) {
  let s = raw.trim();
  if (!s) return { error: "계정이나 주소를 입력하세요." };
  // "youtube.com"처럼 프로토콜 없이 사이트 주소만 붙여넣은 경우도 주소로 처리합니다.
  if (!/^https?:\/\//i.test(s) && !s.startsWith("@") && SITE_START.test(s)) s = "https://" + s;

  let platform = platformHint;
  let handle = "";
  let channelId = "";
  let resolveUrl = "";
  let feed = false;

  if (/^https?:\/\//i.test(s)) {
    let u;
    try {
      u = new URL(s);
    } catch (e) {
      return { error: "주소 형식이 올바르지 않습니다." };
    }
    const host = u.hostname.replace(/^(www|m|mobile)\./, "");
    const parts = u.pathname.split("/").filter(Boolean).map((p) => {
      try {
        return decodeURIComponent(p);
      } catch (e) {
        return p;
      }
    });
    if (host === "youtube.com") {
      platform = "youtube";
      if (!parts.length || parts[0] === "feed") feed = true; // 유튜브 메인 → 내 구독 피드
      else if (parts[0].startsWith("@")) handle = parts[0].slice(1);
      else if (parts[0] === "channel" && /^UC[\w-]{22}$/.test(parts[1] || "")) channelId = parts[1];
      else if ((parts[0] === "c" || parts[0] === "user") && parts[1])
        resolveUrl = "https://www.youtube.com/" + parts[0] + "/" + encodeURIComponent(parts[1]);
      else if (parts[0] === "watch" || parts[0] === "shorts") return { error: VIDEO_MSG };
      else return { error: "인식하지 못한 유튜브 주소입니다. 채널 주소(@이름)나 유튜브 메인 주소를 넣어 주세요." };
    } else if (host === "youtu.be") {
      return { error: VIDEO_MSG };
    } else if (host === "x.com" || host === "twitter.com") {
      platform = "x";
      if (!parts.length || parts[0] === "home") feed = true; // X 메인 → 홈 타임라인
      else handle = parts[0];
    } else if (host === "instagram.com") {
      platform = "instagram";
      if (!parts.length) feed = true; // 인스타그램 메인 → 홈 피드
      else handle = parts[0];
    } else {
      return { error: "지원하지 않는 사이트입니다. 유튜브·X·인스타그램 주소만 넣을 수 있습니다." };
    }
  } else {
    handle = s.replace(/^@/, "");
  }

  if (feed) return { account: { id: platform + ":feed", platform, handle: "", kind: "feed" } };
  if (!handle && !channelId && !resolveUrl) return { error: "계정을 인식하지 못했습니다. @이름이나 프로필 주소를 입력하세요." };
  if (handle && (!/^[^\s/?#@]{1,60}$/.test(handle) || RESERVED.has(handle.toLowerCase()))) {
    return { error: "계정 이름을 인식하지 못했습니다. @이름 형태로 입력하세요." };
  }
  const key = (handle || channelId || resolveUrl).toLowerCase();
  const account = { id: platform + ":" + key, platform, handle };
  if (channelId) account.channelId = channelId;
  if (resolveUrl) account.resolveUrl = resolveUrl;
  return { account };
}

function renderTracked() {
  const box = $("tracked");
  box.textContent = "";
  tracked.forEach((t) => {
    const name = t.kind === "feed" ? FEED[t.platform] : t.handle ? "@" + t.handle : t.channelId || t.resolveUrl;
    const remove = el("button", { type: "button", "aria-label": name + " 삭제", text: "×" });
    remove.addEventListener("click", async () => {
      tracked = tracked.filter((x) => x.id !== t.id);
      renderTracked(); // 저장 이벤트를 기다리지 않고 바로 반영
      await chrome.storage.local.set({ tracked });
    });
    box.appendChild(el("span", { class: "chip" }, [el("span", { text: `${PLATFORM[t.platform]} ${name}` }), remove]));
  });
  $("autoEnabled").checked = !!autoCheck.enabled;
  $("autoHours").value = String(autoCheck.hours || 3);
  $("checkNow").disabled = !!checkStatus.running || tracked.length === 0;
  $("status").textContent = checkStatus.running
    ? "확인 중… (탭이 잠깐 열렸다 닫힙니다)"
    : checkStatus.lastRun
      ? `마지막 확인 ${relative(checkStatus.lastRun)} · ${checkStatus.message || ""}`
      : tracked.length
        ? "아직 확인한 적 없음"
        : "계정을 추가하면 여기서 신규 글을 확인합니다";
}

$("addForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const err = $("addError");
  err.hidden = true;
  // 주소나 @계정이 아니면(예: 그냥 이름) 추가하지 않고 이름으로 검색합니다.
  const raw = $("thandle").value.trim();
  if (raw && !(/^https?:\/\//i.test(raw) || raw.startsWith("@") || SITE_START.test(raw))) {
    $("searchBtn").click();
    return;
  }
  const parsed = parseAccount($("tplatform").value, $("thandle").value);
  if (parsed.error) {
    err.textContent = parsed.error;
    err.hidden = false;
    return;
  }
  const acc = parsed.account;
  if (tracked.some((t) => t.id === acc.id)) {
    err.textContent = "이미 추가된 계정입니다.";
    err.hidden = false;
    return;
  }
  if (tracked.length >= MAX_TRACKED) {
    err.textContent = `계정은 최대 ${MAX_TRACKED}개까지 추가할 수 있습니다.`;
    err.hidden = false;
    return;
  }
  const before = tracked;
  tracked = [...tracked, acc];
  $("thandle").value = "";
  renderTracked(); // 저장 이벤트를 기다리지 않고 바로 칩을 보여줍니다
  try {
    await chrome.storage.local.set({ tracked });
  } catch (e) {
    tracked = before; // 저장에 실패하면 되돌리고 이유를 보여줍니다
    renderTracked();
    err.textContent = "저장하지 못했습니다: " + (e && e.message);
    err.hidden = false;
    return;
  }
  $("status").textContent = "추가했습니다. 곧 새 창이 열려 설정한 기간의 글을 가져옵니다.";
  // 처음 추가한 계정은 바로 설정한 기간의 글을 가져옵니다.
  requestCheck(acc.id);
});

// 이름으로 계정 검색: 사이트 검색 화면을 백그라운드 탭으로 열어 결과를 읽어 옵니다.
$("searchBtn").addEventListener("click", () => {
  const q = $("thandle").value.trim();
  const box = $("searchResults");
  const err = $("addError");
  err.hidden = true;
  if (!q) {
    err.textContent = "검색할 이름을 입력하세요.";
    err.hidden = false;
    return;
  }
  const platform = $("tplatform").value;
  box.hidden = false;
  box.textContent = "";
  box.appendChild(el("p", { class: "hint", text: "검색 중… 탭이 잠깐 열렸다 닫힙니다." }));
  $("searchBtn").disabled = true;
  chrome.runtime.sendMessage({ type: "searchAccount", platform, q }, (res) => {
    $("searchBtn").disabled = false;
    box.textContent = "";
    if (chrome.runtime.lastError || !res || !res.ok) {
      box.hidden = true;
      err.textContent = "검색하지 못했습니다: " + ((res && res.error) || (chrome.runtime.lastError && chrome.runtime.lastError.message) || "응답 없음");
      err.hidden = false;
      return;
    }
    if (!res.results.length) {
      const why = platform === "youtube" ? "" : " " + PLATFORM[platform] + "에 로그인되어 있는지 확인하세요.";
      box.appendChild(el("p", { class: "hint", text: "검색 결과가 없습니다." + why }));
    }
    res.results.forEach((r) => {
      const key = (r.handle || r.channelId).toLowerCase();
      const acc = { id: platform + ":" + key, platform, handle: r.handle || "" };
      if (r.channelId) acc.channelId = r.channelId;
      const add = el("button", { type: "button", text: "추가" });
      add.addEventListener("click", async () => {
        if (tracked.some((t) => t.id === acc.id)) {
          add.textContent = "이미 추가됨";
          return;
        }
        if (tracked.length >= MAX_TRACKED) {
          err.textContent = `계정은 최대 ${MAX_TRACKED}개까지 추가할 수 있습니다.`;
          err.hidden = false;
          return;
        }
        tracked = [...tracked, acc];
        renderTracked();
        try {
          await chrome.storage.local.set({ tracked });
          add.textContent = "추가됨";
          add.disabled = true;
          requestCheck(acc.id);
        } catch (e) {
          tracked = tracked.filter((t) => t.id !== acc.id);
          renderTracked();
          err.textContent = "저장하지 못했습니다: " + (e && e.message);
          err.hidden = false;
        }
      });
      const thumb = r.avatar || r.avatarUrl ? el("img", { src: r.avatar || r.avatarUrl, alt: "", referrerpolicy: "no-referrer" }) : el("span", { class: "ph" });
      box.appendChild(
        el("div", { class: "res" }, [
          thumb,
          el("div", { class: "t" }, [el("b", { text: r.name || "@" + (r.handle || r.channelId) }), el("span", { text: [r.handle ? "@" + r.handle : "", r.desc].filter(Boolean).join(" · ") })]),
          add,
        ])
      );
    });
  });
});

$("autoEnabled").addEventListener("change", async () => {
  autoCheck = { ...autoCheck, enabled: $("autoEnabled").checked };
  await chrome.storage.local.set({ autoCheck });
});

$("autoHours").addEventListener("change", async () => {
  autoCheck = { ...autoCheck, hours: Number($("autoHours").value) };
  await chrome.storage.local.set({ autoCheck });
});

$("checkNow").addEventListener("click", () => {
  $("checkNow").disabled = true;
  requestCheck("");
});

let refreshTimer = null;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !(changes.items || changes.tracked || changes.autoCheck || changes.status)) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(load, 300);
});

// 웹 연결 코드: 웹에서 로그인하면 자동으로 정해집니다. 직접 만들거나 해제할 수도 있습니다.
async function showToken() {
  const got = await chrome.storage.local.get("bridgeToken");
  const t = typeof got.bridgeToken === "string" ? got.bridgeToken : "";
  $("bridgeToken").value = t;
  $("copyToken").hidden = !t;
  $("makeToken").hidden = !!t;
  $("dropToken").hidden = !t;
  $("tokenState").textContent = t ? "연결 코드가 설정되어 있습니다." : "아직 연결되지 않았습니다. 웹 페이지에서 로그인하면 자동으로 연결됩니다.";
}
showToken().catch((e) => showFatal("웹 연결 코드를 읽지 못했습니다: " + (e && e.message)));
$("makeToken").addEventListener("click", async () => {
  const t = Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => x.toString(16).padStart(2, "0")).join("");
  await chrome.storage.local.set({ bridgeToken: t });
  showToken();
});
$("dropToken").addEventListener("click", async () => {
  await chrome.storage.local.remove("bridgeToken");
  showToken();
});
$("copyToken").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("bridgeToken").value);
    $("copyMsg").textContent = "복사했습니다.";
  } catch (e) {
    $("bridgeToken").select();
    $("copyMsg").textContent = "선택했습니다. Ctrl+C로 복사하세요.";
  }
});

load();
