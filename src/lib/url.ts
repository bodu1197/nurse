// 리다이렉트로 돌아갈 내부 경로만 통과시킨다(오픈 리다이렉트 = 우리 도메인에서 시작하는 피싱).
//
// 흔히 쓰는 `startsWith("/") && !startsWith("//")` 검사는 두 가지를 놓친다.
//  1) `/\evil.com` — 브라우저 URL 파서는 백슬래시를 슬래시로 취급해 `//evil.com`(외부 사이트)으로 읽는다.
//  2) 탭·개행이 섞인 경로 — 브라우저는 URL에서 그 문자들을 **지운 뒤** 해석하므로 역시 `//evil.com`이 된다.
// 그래서 제어문자를 먼저 걷어내고, 두 번째 글자가 슬래시/백슬래시면 거부한다.
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  const s = [...(next ?? "")].filter((c) => c.charCodeAt(0) >= 0x20 && c.charCodeAt(0) !== 0x7f).join("");
  return /^\/(?![/\\])/.test(s) ? s : fallback;
}
