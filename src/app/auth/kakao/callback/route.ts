import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeNext } from "@/lib/url";
import { authErrorPath, type AuthErrorCode } from "@/lib/constants";

interface KakaoToken {
  access_token?: string;
}
interface KakaoProfile {
  id?: number;
  kakao_account?: {
    email?: string;
    is_email_valid?: boolean;
    is_email_verified?: boolean;
    profile?: { nickname?: string; profile_image_url?: string };
  };
}

// 카카오 커스텀 OAuth 콜백 — 네이버 콜백과 같은 패턴(구조는 src/app/auth/naver/callback/route.ts 참고).
// 이 앱은 클라이언트 시크릿이 꺼져있어 code→token 요청에 시크릿을 보내지 않는다(카카오 표준 플로우,
// state 도 네이버와 달리 토큰 엔드포인트에 보낼 필요 없음).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const clearOnce = (res: NextResponse) => {
    for (const c of ["kakao_oauth_state", "kakao_oauth_role", "kakao_oauth_next"]) res.cookies.delete(c);
    return res;
  };
  const fail = (r: AuthErrorCode) => clearOnce(NextResponse.redirect(`${origin}${authErrorPath("/login", r)}`));

  // 사용자가 동의 화면에서 취소하면 code 없이 error=access_denied 로 돌아온다 —
  // state 불일치가 아니라 단순 취소이므로 "보안 검증 실패" 에러를 띄우지 않고 조용히 로그인 화면으로.
  if (searchParams.get("error")) return clearOnce(NextResponse.redirect(`${origin}/login`));

  const cookieStore = await cookies();
  const savedState = cookieStore.get("kakao_oauth_state")?.value;
  if (!code || !state || !savedState || state !== savedState) return fail("kakao_state");

  const clientId = process.env.KAKAO_REST_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!clientId || !supabaseUrl || !anonKey) return fail("kakao_config");

  // 1) code → access token
  const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: `${origin}/auth/kakao/callback`,
      code,
    }).toString(),
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  if (!tokenRes || !tokenRes.ok) return fail("kakao_token");
  const token = (await tokenRes.json()) as KakaoToken;
  if (!token.access_token) return fail("kakao_token");

  // 2) 프로필
  const meRes = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: { Authorization: `Bearer ${token.access_token}` },
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  if (!meRes || !meRes.ok) return fail("kakao_profile");
  const me = (await meRes.json()) as KakaoProfile;
  const email = me.kakao_account?.email;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("kakao_email");
  // 검증 안 된 이메일로는 세션을 발급하지 않는다 — 그 주소로 이미 만들어진 비밀번호·네이버 계정을
  // 카카오 쪽에서 가로챌 수 있게 된다(계정 탈취).
  if (!me.kakao_account?.is_email_verified || !me.kakao_account?.is_email_valid) return fail("kakao_email");

  // 3) Supabase 사용자 find-or-create (service_role) — 네이버 콜백과 동일 패턴
  const wantHospital = cookieStore.get("kakao_oauth_role")?.value === "hospital";
  const admin = createAdminClient();
  await admin.auth.admin
    .createUser({
      email,
      email_confirm: true,
      app_metadata: { provider: "kakao" },
      user_metadata: {
        provider: "kakao",
        kakao_id: me.id,
        full_name: me.kakao_account?.profile?.nickname,
        name: me.kakao_account?.profile?.nickname,
        avatar_url: me.kakao_account?.profile?.profile_image_url ?? null,
        ...(wantHospital ? { role: "hospital" } : {}),
      },
    })
    .catch(() => {
      /* 이미 가입된 이메일이면 무시하고 세션만 발급 */
    });

  // 4) magiclink token_hash 발급
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const hashedToken = link?.properties?.hashed_token;
  if (linkErr || !hashedToken) return fail("kakao_session");

  // 5) 세션 발급
  const res = clearOnce(NextResponse.redirect(`${origin}${safeNext(cookieStore.get("kakao_oauth_next")?.value)}`));
  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) =>
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
    },
  });
  const { error: otpErr } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: hashedToken,
  });
  if (otpErr) return fail("kakao_verify");

  return res;
}
