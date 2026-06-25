import { NextResponse } from "next/server";

// 네이버 커스텀 OAuth 시작 — state 발급 후 네이버 인증 페이지로.
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.NAVER_CLIENT_ID!,
    redirect_uri: `${origin}/auth/naver/callback`,
    state,
  });

  const res = NextResponse.redirect(
    `https://nid.naver.com/oauth2.0/authorize?${params.toString()}`,
  );
  res.cookies.set("naver_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
