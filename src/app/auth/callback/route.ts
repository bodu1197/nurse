import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applySignupRole } from "@/lib/data/user";
import { safeNext } from "@/lib/url";
import { authErrorPath } from "@/lib/constants";

// Supabase OAuth(PKCE) 콜백 — 카카오 등 네이티브 제공자용.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Open Redirect 방지 — 내부 경로만 허용
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // 가입 화면에서 '병원 채용담당자'를 고르고 소셜로 시작한 경우에만 역할을 바로잡는다.
      // (방금 만들어진 계정에만 적용 — applySignupRole 주석 참고)
      if (data.user) await applySignupRole(data.user.id, searchParams.get("role"));
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // 비밀번호 재설정은 /auth/confirm 이 따로 처리한다(그쪽 주석 참고). 여기는 SNS 로그인 전용.
  return NextResponse.redirect(`${origin}${authErrorPath("/login", "oauth")}`);
}
