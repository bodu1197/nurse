import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { isBotRequest, trackPageView } from "@/lib/track";
import { cachedDetailTarget, canonicalPath, isCachedRoute } from "@/lib/url";

/**
 * 인재 상세·공고 상세를 **캐시 가능한 라우트로 흘려보낸다**(인재 2026-08-17, 공고 2026-10-25).
 *
 * 왜: 둘 다 봇이 가장 많이 여는 화면이다. 인재 상세는 7일 실측 **봇 1,244,902건 : 사람 1,008건(961:1)** 이었고,
 * 공고 상세는 ClaudeBot 하나가 **하루 약 70만 번** 열어 Vercel 비용이 치솟았다(2026-10-17~25, 방화벽으로 막음).
 * 기존 라우트는 요청마다 `getMyProfile()` 로 쿠키를 읽어 캐시가 원리상 불가능하다 — 봇이 훑는 만큼 함수가 깨어난다.
 * 방화벽은 아는 봇만 막는다. 이 캐시는 **아직 모르는 봇이 몰려도** 같은 화면을 다시 만들지 않게 한다 — 단 쿼리가 붙은 주소는
 * 봇으로 알아볼 때만(lib/track isBotRequest) 캐시본을 준다. 브라우저인 척하는 스크레이퍼가 ?page= 링크를 따라오면 지금처럼 동적이다.
 *
 * 🔒 **네 조건을 전부 만족할 때만** 보낸다(lib/url cachedDetailTarget — 테스트가 있다). 하나라도 어긋나면 기존 동적 라우트로 간다:
 *    ① GET·HEAD  ② 로그인 쿠키 없음  ③ 쿼리스트링 없음(봇은 쿼리를 무시)  ④ 경로가 /talent/<uuid> 또는 /jobs/<uuid>
 *    · ②가 핵심이다 — 로그인 사용자는 지금까지처럼 서버가 그린 화면을 받는다.
 *      캐시 화면에는 연락처가 **애초에 없다** — 인재는 canRevealContacts 판정이 항상 false, 공고는 담당자·전화·이메일·접수 안내가
 *      비로그인 화면처럼 가려진 채 그려진다.
 *    · ③은 사람의 검색 조건·보던 쪽이 '목록으로' 링크와 옆 목록을 바꾸기 때문이다. 공고의 지원 결과(?apply=·?ok=)도 쿼리라
 *      동적 라우트로 간다 — 누군가의 안내 문구가 캐시에 굳지 않는다. 봇은 쿼리를 버리고 정본 화면을 받는다(목록 링크를 따라
 *      도는 봇이 ?page=N 때문에 캐시를 못 타던 것 — cachedDetailTarget 주석).
 *    · HEAD 를 빼면 링크 검사기·일부 크롤러가 전부 동적 라우트로 흘러 함수를 깨운다(형제 프로젝트 실측).
 *
 * 🔴 **접속 기록은 그대로 남긴다**(아래 proxy 참조). 이 프록시는 캐시가 맞아도 어차피 실행되므로,
 *    기록을 빼도 아끼는 것이 없고 관리자 통계만 망가진다 — 봇 수치뿐 아니라 **비로그인 사람의
 *    조회수·순방문자·유입처까지** 통째로 빠져서, 배포한 날 그래프가 절벽이 되는데 화면은 아무 말도
 *    안 하게 된다. 아끼는 것은 **페이지 렌더와 DB 조회**지 기록이 아니다.
 */
function cacheableDetail(request: NextRequest): NextResponse | null {
  const target = cachedDetailTarget({
    method: request.method,
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    cookieNames: request.cookies.getAll().map((c) => c.name),
    bot: isBotRequest(request.headers.get("user-agent") ?? "", request.headers.get("sec-fetch-dest")),
  });
  if (!target) return null;

  const url = request.nextUrl.clone();
  url.pathname = target;
  // 봇이 단 쿼리는 버린다 — 캐시본은 쿼리를 읽지 않는다. 화면 전환용 _rsc 는 Next 가 rewrite 뒤에 다시 붙인다(server/web/adapter).
  url.search = "";
  return NextResponse.rewrite(url);
}

// Next.js 16 proxy (구 middleware) — 매 요청 Supabase 세션 갱신 + 접속 기록.
export async function proxy(request: NextRequest, event: NextFetchEvent) {
  // `/%6Aobs` 처럼 영문을 %XX 로 쓴 주소는 Next 실행기가 500 을 낸다 → 풀어 쓴 주소로 보낸다(canonicalPath 참고).
  // 🔒 맨 앞이어야 한다 — 아래 캐시본 차단을 `/%74alent-cached`·`/%6Aobs-cached` 로 비껴가지 못하게. 기록도 이동 뒤 한 번만.
  const canonical = canonicalPath(request.nextUrl.pathname);
  if (canonical !== request.nextUrl.pathname) {
    const url = request.nextUrl.clone();
    url.pathname = canonical;
    return NextResponse.redirect(url, 308);
  }

  // 🔒 `/talent-cached/…`·`/jobs-cached/…` 는 **내부 전용**이다. 프록시가 rewrite 로만 도달시키며, rewrite 는
  //    미들웨어를 다시 태우지 않으므로 여기 들어온 것은 전부 **밖에서 직접 친 요청**이다.
  //    막지 않으면 두 가지가 생긴다: ① 정본과 내용이 같은 주소가 색인될 수 있다
  //    ② 로그인한 사람이 직접 열면 그 사람 이름이 들어간 404 화면이 캐시에 굳을 여지가 생긴다.
  //    사이트 어디에서도 링크하지 않는 주소라 404 로 막는 데 잃을 것이 없다.
  if (isCachedRoute(request.nextUrl.pathname)) {
    return new NextResponse(null, { status: 404 });
  }

  // 🔴 응답을 기다리지 않되 **버리지도 않는다.** 그냥 매달아 두면 응답 반환 시 엣지 인스턴스가
  //    얼어붙어 기록이 유실된다. waitUntil 로 넘겨 응답은 즉시 나가고 기록은 끝까지 간다.
  // 🔴 **캐시로 보내는 요청도 여기서 먼저 기록한다.** 프록시는 캐시가 맞아도 어차피 도니까
  //    기록을 빼도 아끼는 게 없고, 빼면 관리자 통계에서 가장 많이 보는 화면의 숫자가 통째로 사라진다.
  const tracking = trackPageView(request);
  if (tracking) event.waitUntil(tracking);

  // 캐시본으로 보낼 요청은 여기서 갈라진다 — 세션 갱신(updateSession)은 필요 없다(쿠키가 없다).
  const cached = cacheableDetail(request);
  if (cached) return cached;

  return await updateSession(request);
}

export const config = {
  matcher: [
    // api·정적 파일·이미지·폰트·기계용 파일 제외한 모든 경로.
    //
    // 🔴 `opengraph-image`·`robots.txt`·`sitemap.xml` 을 뺀 이유(2026-08-17): 사람이 보는 화면이
    //    아니라 **기계가 가져가는 파일**인데, 여기를 타면 요청마다 세션 갱신과 접속기록 전송이 돈다.
    //    실측(7일): /opengraph-image 44,654건 — 그중 사람은 **0명**이다(공유 카드 이미지라 당연하다).
    //    셋 다 로그인 상태와 무관하고 통계로서의 값도 없다. 빼면 그만큼 함수가 아예 안 깨어난다.
    //    🔒 이 프록시는 **보안 헤더를 붙이지 않는다**(세션 갱신과 접속기록만 한다). 헤더는
    //       next.config.ts 의 headers() 가 전 경로에 붙이므로 여기서 빼도 헤더는 그대로 간다.
    //    🔒 세 토큰 모두 **$ 로 끝을 막았다.** 안 막으면 접두사 매칭이라 /robots.txt-x 같은 주소가
    //       덩달아 제외된다(있지도 않은 경로를 조용히 예외로 만드는 셈이다).
    //       반대로 `/jobs/opengraph-image` 같은 **하위 OG 라우트를 나중에 만들면** 이 예외에
    //       걸리지 않아 다시 프록시를 탄다 — 그때는 여기에 함께 적어라.
    // 폰트를 반드시 빼야 하는 이유: 여기를 타면 로그인 사용자의 폰트 요청에도 세션 갱신이
    // 돌고, 토큰이 갱신되면 그 응답에 sb-* Set-Cookie 가 붙는다. 폰트에는 next.config.ts 가
    // `public, max-age=31536000, immutable` 을 거는데 둘이 겹치면 (1) 공유 캐시가 남의
    // 세션 쿠키를 재사용할 여지가 생기고 (2) Set-Cookie 탓에 CDN 이 캐싱을 포기해
    // immutable 이 무력화된다.
    // _vercel/ 은 Web Analytics 수집 주소(/_vercel/insights/*) — 페이지뷰 전송마다 세션 갱신이 돌 이유가 없다.
    "/((?!api|_vercel/|_next/static|_next/image|favicon.ico|fonts/|opengraph-image$|robots\\.txt$|sitemap\\.xml$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?|ttf|otf)$).*)",
  ],
};
