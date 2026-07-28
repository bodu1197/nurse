import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16 proxy (구 middleware) — 매 요청 Supabase 세션 갱신.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // api·정적 파일·이미지·폰트 제외한 모든 경로.
    // 폰트를 반드시 빼야 하는 이유: 여기를 타면 로그인 사용자의 폰트 요청에도 세션 갱신이
    // 돌고, 토큰이 갱신되면 그 응답에 sb-* Set-Cookie 가 붙는다. 폰트에는 next.config.ts 가
    // `public, max-age=31536000, immutable` 을 거는데 둘이 겹치면 (1) 공유 캐시가 남의
    // 세션 쿠키를 재사용할 여지가 생기고 (2) Set-Cookie 탓에 CDN 이 캐싱을 포기해
    // immutable 이 무력화된다.
    "/((?!api|_next/static|_next/image|favicon.ico|fonts/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?|ttf|otf)$).*)",
  ],
};
