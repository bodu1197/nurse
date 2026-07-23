import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RECOVERY_COOKIE, RECOVERY_COOKIE_MAX_AGE, RECOVERY_COOKIE_OPTIONS, authErrorPath } from "@/lib/constants";

// 비밀번호 재설정 메일의 링크가 도착하는 곳.
//
// SNS 로그인이 쓰는 /auth/callback(PKCE)과 **일부러 분리**했다.
// PKCE는 링크를 요청한 그 브라우저의 쿠키(code verifier)가 있어야 교환된다 —
// 메일을 폰에서 열거나 메일앱 내장 브라우저로 열면 무조건 실패하고,
// 화면에는 "링크가 만료되었다"는 사실과 다른 안내가 뜬다.
// token_hash 방식은 브라우저와 무관하게 서버에서 검증되므로 그 문제가 없다.
//
// 메일 본문은 저장소의 supabase/templates/recovery.html 과 같아야 한다.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  // recovery 외의 토큰(가입 확인 등)은 여기서 받지 않는다 — 받아주면 그 코드가 비밀번호 변경 권한이 된다.
  if (tokenHash && type === "recovery") {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    if (!error && data.user) {
      const res = NextResponse.redirect(`${origin}/reset-password/new`);
      // "이 사람이 메일 링크로 들어왔다"는 표시. 값에 회원 id를 담아, 중간에 다른 계정으로
      // 로그인해도 그 계정의 비밀번호까지 바꾸지는 못하게 한다.
      res.cookies.set(RECOVERY_COOKIE, data.user.id, { ...RECOVERY_COOKIE_OPTIONS, maxAge: RECOVERY_COOKIE_MAX_AGE });
      return res;
    }
  }

  return NextResponse.redirect(`${origin}${authErrorPath("/reset-password", "link_expired")}`);
}
