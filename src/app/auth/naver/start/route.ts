import { NextResponse } from "next/server";

// 네이버 커스텀 OAuth 시작 — state 발급 후 네이버 인증 페이지로.
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const clientId = process.env.NAVER_CLIENT_ID;
  if (!clientId) return NextResponse.redirect(`${origin}/login?error=naver_config`);

  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: `${origin}/auth/naver/callback`,
    state,
  });

  const res = NextResponse.redirect(
    `https://nid.naver.com/oauth2.0/authorize?${params.toString()}`,
  );
  // 🔴 네이버는 redirect_uri 를 등록값과 **정확히** 대조하므로 거기에 파라미터를 붙일 수 없다.
  //    회원유형(가입 화면 선택)과 복귀 주소는 state 와 같은 수명의 쿠키로 왕복시킨다.
  //    🔴 세 쿠키를 **매번 함께 확정**한다. "값이 있을 때만 set" 으로 두면, 동의 화면에서 뒤로 간
  //    지난 시도의 값이 10분간 살아남아 다음 로그인에 새어든다 — 병원을 골랐다가 그만두고 간호사로
  //    다시 시작한 사람이 병원 계정을 받게 된다(역할을 바꿀 화면이 없어 복구도 안 된다).
  const opts = { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" } as const;
  res.cookies.set("naver_oauth_state", state, opts);
  if (searchParams.get("role") === "hospital") res.cookies.set("naver_oauth_role", "hospital", opts);
  else res.cookies.delete("naver_oauth_role");
  const next = searchParams.get("next");
  if (next) res.cookies.set("naver_oauth_next", next, opts);
  else res.cookies.delete("naver_oauth_next");
  return res;
}
