import type { NextRequest } from "next/server";

/**
 * 접속 기록 — (날짜, 경로) 한 칸을 올린다.
 *
 * 🔴 왜 미들웨어인가: 서버 컴포넌트에 넣으면 페이지마다 코드를 심어야 하고 하나 빠뜨리면
 *    그 페이지만 통계에서 사라진다. 미들웨어는 이미 모든 문서 요청을 지난다.
 *
 * 🔴 방문자를 구분하지 않는다. 쿠키나 지문(fingerprint)을 심으면 개인정보가 되고,
 *    개인정보를 모으면 처리방침·보관기간·파기 절차가 따라온다. 지금 필요한 것은
 *    "어느 페이지가 얼마나 열리나" 뿐이라 조회수만 센다.
 *
 * 🔴 쿼리스트링을 버린다(DB 함수에서도 한 번 더 자른다). 검색어·토큰이 통계 표에 쌓이면
 *    그 표가 개인정보 저장소가 된다. 동적 구간(/jobs/<uuid>)은 DB 함수가 `/jobs/:id` 로 묶는다 —
 *    이력서 주인 id·주문 id 가 통계 표에 남지 않고, 경로 수가 데이터 수만큼 늘어나지도 않는다.
 */
const SKIP = [/^\/admin(\/|$)/, /^\/auth(\/|$)/, /^\/api(\/|$)/, /^\/_next(\/|$)/];

export function trackPageView(request: NextRequest): Promise<unknown> | undefined {
  // 문서 요청만 센다. prefetch·데이터 요청까지 세면 사람이 안 본 페이지가 조회수로 잡힌다.
  if (request.method !== "GET") return undefined;
  if (request.headers.get("sec-fetch-dest") !== "document") return undefined;
  if (request.headers.get("next-router-prefetch")) return undefined;

  const path = request.nextUrl.pathname;
  if (SKIP.some((re) => re.test(path))) return undefined; // 관리자·인증 콜백은 통계에 넣지 않는다

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return undefined;

  // 🔴 anon 키로 부른다(service_role 은 미들웨어에 두지 않는다 — 엣지 번들에 실릴 수 있다).
  //    함수 자체가 security definer 라 익명도 조회수만 올릴 수 있고 표를 읽지는 못한다.
  // 🔴 Promise 를 돌려준다 — 호출부(proxy)가 waitUntil 로 붙잡아야 한다.
  //    응답을 반환하는 순간 엣지 인스턴스가 얼어붙어, 매달아 두기만 하면 기록이 유실된다.
  return fetch(`${url}/rest/v1/rpc/track_page_view`, {
    method: "POST",
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_path: path }),
    cache: "no-store",
    signal: AbortSignal.timeout(2000),
  }).catch((e) => console.error("trackPageView:", e?.message ?? e));
}
