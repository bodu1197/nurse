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

/**
 * 영문·숫자·`-._~` 를 굳이 %XX 로 쓴 경로를 풀어 쓴다(`/%6Aobs` → `/jobs`). 그 밖의 %XX(한글·`/` 등)는 그대로.
 * 표준(RFC 3986 §6.2.2.2)상 같은 주소인데, Vercel 은 풀어서 /jobs 함수로 보내고 Next 실행기는 안 풀고
 * `pages/%6Aobs.js` 를 찾다가 MODULE_NOT_FOUND → **500** 이었다(운영 실측 2026-10-23). proxy 가 이 값으로 308 한다.
 * 🔒 풀어 쓴 결과는 safeNext 를 거친다 — `//%65vil.com` → `//evil.com` 이 되면 Next 가 같은 호스트로 보고 Location 을
 *    상대주소 `//evil.com` 으로 내보내, 브라우저가 **외부 사이트로 이동**한다(오픈 리다이렉트). 그런 값은 홈으로.
 */
export function canonicalPath(pathname: string): string {
  const p = pathname.replace(/%[\da-f]{2}/gi, (m) => {
    const c = String.fromCharCode(parseInt(m.slice(1), 16));
    return /[\w.~-]/.test(c) ? c : m;
  });
  return p === pathname ? p : safeNext(p);
}

/**
 * Vercel Web Analytics(미국)로 보내는 주소를 고른다 — components/VercelAnalytics 의 beforeSend.
 * - `/admin`·`/mypage` 는 **아예 안 보낸다** — 결제 영수증 번호(/mypage/jobs/ad/receipt/[orderId]),
 *   결제 복귀 쿼리(imp_uid·merchant_uid), 지원자 출력 화면이 거기 있다.
 * - 나머지는 쿼리 중 `utm_*`·`ref`(유입 캠페인)만 남긴다. 검색어·위치(lat/lng)·인증 code 는 지운다.
 * - `#` 뒤는 지운다 — 비밀번호 재설정 링크는 토큰을 # 뒤에 싣고 온다.
 * Vercel 문서는 쿼리를 "Filtered" 라고만 하고 무엇을 거르는지 밝히지 않아서 우리가 먼저 지운다
 * (형제 프로젝트 C:\dev\talent\src\lib\analytics\vercel-url.ts 와 같은 규칙).
 * 이전 페이지 주소(referrer)는 Vercel 스크립트가 **우리 사이트면 안 보낸다** — 관리자 검색 주소가 새는 길 없음(script.js 실측).
 */
export function vercelSafeUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (/^\/(admin|mypage)(\/|$)/.test(url.pathname)) return null;
  for (const key of [...url.searchParams.keys()]) {
    if (!/^(utm_[a-z_]+|ref)$/.test(key)) url.searchParams.delete(key);
  }
  url.hash = "";
  return url.toString();
}
