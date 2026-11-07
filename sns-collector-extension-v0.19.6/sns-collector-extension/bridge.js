// 웹 모아보기 페이지와 확장 사이를 잇는 다리. 페이지가 보낸 요청을 확장 백그라운드로 전달하고 답을 돌려줍니다.
// 요청에는 확장에서 복사한 "웹 연결 코드"가 있어야 하며, 코드 확인은 백그라운드에서 합니다.
window.addEventListener("message", (ev) => {
  if (ev.source !== window || !ev.data || ev.data.sns !== "call") return;
  const { id, token, op, payload } = ev.data;
  const reply = (body) => window.postMessage({ sns: "reply", id, ...body }, "*");
  try {
    chrome.runtime.sendMessage({ type: "bridge", token, op, payload }, (res) => {
      if (chrome.runtime.lastError) return reply({ ok: false, error: chrome.runtime.lastError.message });
      reply(res && res.ok ? { ok: true, result: res.result } : { ok: false, error: (res && res.error) || "요청이 거부되었습니다." });
    });
  } catch (e) {
    reply({ ok: false, error: "확장 프로그램과 통신하지 못했습니다." });
  }
});
