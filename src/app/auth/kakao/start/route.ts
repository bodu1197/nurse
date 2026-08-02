import { NextResponse } from "next/server";
import { authErrorPath } from "@/lib/constants";

// 카카오 커스텀 OAuth 시작 — Supabase 카카오 프로바이더 대신 직접 구현(네이버와 동일 패턴).
// 이 앱(REST API 키)은 클라이언트 시크릿이 꺼져있어 code→token 교환에 시크릿이 필요 없다.
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const clientId = process.env.KAKAO_REST_API_KEY;
  if (!clientId) return NextResponse.redirect(`${origin}${authErrorPath("/login", "kakao_config", searchParams.get("next"))}`);

  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: `${origin}/auth/kakao/callback`,
    // 닉네임·프로필사진도 같이 받는다 — account_email 만 받으면 표시이름이 이메일 앞부분으로 떨어진다.
    scope: "account_email,profile_nickname,profile_image",
    state,
  });

  const res = NextResponse.redirect(`https://kauth.kakao.com/oauth/authorize?${params.toString()}`);
  // 네이버와 같은 이유(src/app/auth/naver/start/route.ts 주석 참고) — 세 쿠키를 매번 함께 확정한다.
  const opts = { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" } as const;
  res.cookies.set("kakao_oauth_state", state, opts);
  if (searchParams.get("role") === "hospital") res.cookies.set("kakao_oauth_role", "hospital", opts);
  else res.cookies.delete("kakao_oauth_role");
  const next = searchParams.get("next");
  if (next) res.cookies.set("kakao_oauth_next", next, opts);
  else res.cookies.delete("kakao_oauth_next");
  return res;
}
