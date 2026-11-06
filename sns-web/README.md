# Vercel 서버 로그인 설정 (무료)

1. Vercel 프로젝트 → Storage 탭 → Create Database → Upstash (Redis) → Free 플랜으로 만들고 이 프로젝트에 Connect.
   환경변수(KV_REST_API_URL, KV_REST_API_TOKEN)가 자동으로 들어갑니다.
2. 저장소에 이 폴더(api/auth.js 포함)를 올리면 자동 재배포됩니다. 환경변수는 재배포 후 적용됩니다.
3. 사이트에서 가입하면 연결 코드가 자동으로 만들어져 확장에 설정됩니다. (확장 v0.11.0 이상)

---

# 파일 구성 (언어 · 역할)

전체가 HTML / CSS / JavaScript로만 되어 있습니다. 빌드 과정이 없고, 서버 쪽은 Vercel 서버리스 함수 1개뿐입니다.

## 웹 화면 (이 폴더, Vercel에 올림)

| 파일 | 언어 | 하는 일 |
|---|---|---|
| `index.html` | HTML | 화면 뼈대(상단 바, 왼쪽 관리 패널, 카드 목록, 뷰어). `style.css`와 `js/`를 순서대로 불러옵니다. |
| `style.css` | CSS | 모든 모양(색은 CSS 변수, 카드 줄 가로 스크롤, 뷰어, 반응형). |
| `js/core.js` | JavaScript | 상수·상태 변수, 본 글 기록(`localStorage`의 `snsSeen`). |
| `js/bridge.js` | JavaScript | 확장과의 통신(`window.postMessage` → 확장 `bridge.js`), 매체별 로그인 상태 표시. |
| `js/store.js` | JavaScript | 연결된 확장에서 글·추적 계정을 받아 오고 브라우저에 저장본을 보관. |
| `js/list.js` | JavaScript | 탭·묶음/출처 보기, 카드 그리기, 글 뷰어(유튜브·X·인스타 임베드, 유튜브 게시물 직접 표시), 이전/다음 이동, 마우스 끌기. |
| `js/tracking.js` | JavaScript | 계정 입력 해석(주소·@핸들), 추가/삭제, 묶음 이름, 이름으로 검색, 설정 이벤트. |
| `js/account.js` | JavaScript | 아이디·비밀번호 로그인/로그아웃, 로그인하면 연결 코드를 확장에 자동 설정. |
| `js/ui.js` | JavaScript | 휠 가로 스크롤, 이어보기 버튼, 시작 코드(맨 마지막에 실행). |
| `api/auth.js` | JavaScript (Node, 서버리스) | 가입·로그인·로그아웃·내 연결 코드. 비밀번호는 scrypt 해시로 Upstash Redis에 저장, 세션 30일. |
| `vercel.json` | JSON | 주소에서 `.html` 생략, 보안 헤더. |

`js/` 파일은 **전역 변수를 서로 공유**하는 일반 스크립트라서 `index.html`에 적힌 순서(core → bridge → store → list → tracking → account → ui)를 바꾸면 안 됩니다.

## 크롬 확장 (`sns-collector-extension/`, 내 PC에 설치)

| 파일 | 언어 | 하는 일 |
|---|---|---|
| `manifest.json` | JSON | 확장 설정(MV3, 권한, 고정 ID용 key, 웹 페이지 연결 대상 `*.vercel.app`). |
| `background.js` | JavaScript | 서비스 워커. 확인용 창 열기, 계정별 페이지 순회, 저장(`chrome.storage`), 웹 화면 요청 처리, 알람(자동 확인). |
| `common.js` | JavaScript | 매체 공통 수집 반복문. 스크롤하며 글을 읽어 background로 보냄, 기간보다 오래된 글이 나오면 멈춤. |
| `youtube.js` · `x.js` · `instagram.js` | JavaScript | 매체별로 **화면(HTML)에서** 글·날짜·썸네일을 읽는 코드와 이름 검색, 로그인 확인. |
| `bridge.js` | JavaScript | 웹 페이지와 background 사이 전달(토큰 확인 후에만 전달). |
| `dashboard.html` / `.css` / `.js` | HTML / CSS / JS | 확장 안의 관리 화면(수집 기간, 자동 확인, 연결 코드). |

## 데이터 흐름

1. 확장이 내 로그인된 크롬에서 작은 창을 열어 각 사이트 페이지를 스크롤하며 **화면에 보이는 내용**을 읽습니다(공식 API·유료 서비스 없음).
2. 글 링크·제목·짧은 미리보기·썸네일 주소만 `chrome.storage`에 저장합니다.
3. 웹 화면(Vercel)이 `postMessage`로 확장에 물어 글을 받아 와 한곳에 보여줍니다. 서버(`api/auth.js`)는 로그인과 연결 코드만 다루고 글 데이터는 저장하지 않습니다.
