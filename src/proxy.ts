import { type NextRequest, type NextFetchEvent } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { trackPageView } from "@/lib/track";

// Next.js 16 proxy (구 middleware) — 매 요청 Supabase 세션 갱신 + 접속 기록.
export async function proxy(request: NextRequest, event: NextFetchEvent) {
  // 🔴 응답을 기다리지 않되 **버리지도 않는다.** 그냥 매달아 두면 응답 반환 시 엣지 인스턴스가
  //    얼어붙어 기록이 유실된다. waitUntil 로 넘겨 응답은 즉시 나가고 기록은 끝까지 간다.
  const tracking = trackPageView(request);
  if (tracking) event.waitUntil(tracking);
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
    "/((?!api|_next/static|_next/image|favicon.ico|fonts/|opengraph-image$|robots\\.txt$|sitemap\\.xml$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?|ttf|otf)$).*)",
  ],
};
