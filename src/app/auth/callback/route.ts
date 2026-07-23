import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // 비밀번호 재설정은 /auth/confirm 이 따로 처리한다(그쪽 주석 참고). 여기는 SNS 로그인 전용.
  return NextResponse.redirect(`${origin}${authErrorPath("/login", "oauth")}`);
}
