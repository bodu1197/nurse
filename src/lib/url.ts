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

/**
 * 쿼리 값 하나 — 같은 키가 두 번 오면(?sido=a&sido=b) Next 는 **배열**을 준다. 첫 값만 쓴다.
 * 문자열로 믿고 .trim() 하면 장난 URL 하나에 목록이 500 이 된다(/jobs·/care-jobs, /review8 2026-10-16).
 * 선언 타입이 string 인 곳(/jobs 의 JobSearchParams)에서도 받을 수 있게 넓게 받는다.
 */
export const firstParam = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? "";

/** 쪽수 상한 — 그 이상은 어차피 빈 쪽이고, 터무니없는 offset 으로 DB 를 긁을 이유가 없다. */
export const PAGE_MAX = 100_000;
/**
 * 쪽수 — 1 이상의 안전한 정수만. "1.01" 은 offset 을 소수로 만들어 조회가 깨지고, "Infinity"·"1e300" 은
 * range 를 터뜨린다. 그 밖의 값은 전부 1쪽이다.
 */
export function pageParam(v: string | string[] | undefined): number {
  const n = Number(firstParam(v));
  return Number.isSafeInteger(n) && n >= 1 ? Math.min(n, PAGE_MAX) : 1;
}
