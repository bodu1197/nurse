import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/admin";
import { authErrorPath, type AuthErrorCode } from "@/lib/constants";

interface NaverToken {
  access_token?: string;
}
interface NaverProfile {
  id?: string;
  email?: string;
  name?: string;
  nickname?: string;
  profile_image?: string;
  mobile_e164?: string;
  mobile?: string;
}

// 네이버 커스텀 OAuth 콜백 — Supabase 미지원이라 직접 구현 후 Supabase Auth에 세션 발급.
// state 검증 → code→token(POST, secret은 바디) → 프로필 → 사용자 find-or-create(admin)
// → magiclink token_hash로 세션 발급(쿠키를 redirect 응답에 직접 병합).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  // 코드를 타입으로 묶는다 — 오타가 나면 화면에 안내 없이 빈 에러만 뜨는데 그걸 컴파일에서 잡는다.
  const fail = (r: AuthErrorCode) => {
    const res = NextResponse.redirect(`${origin}${authErrorPath("/login", r)}`);
    res.cookies.delete("naver_oauth_state"); // 실패 시에도 일회용 state 무효화
    return res;
  };

  const cookieStore = await cookies();
  const savedState = cookieStore.get("naver_oauth_state")?.value;
  if (!code || !state || !savedState || state !== savedState) return fail("naver_state");

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!clientId || !clientSecret || !supabaseUrl || !anonKey) return fail("naver_config");

  // 1) code → access token (secret은 URL이 아닌 POST 바디로)
  // 주의: state는 네이버 토큰 엔드포인트의 *필수* 파라미터(네이버 비표준 — RFC6749와 다름).
  //       제거하면 토큰 발급이 실패해 로그인이 깨진다. review8가 RFC 근거로 제거를 권해도 따르지 말 것.
  const tokenRes = await fetch("https://nid.naver.com/oauth2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      state,
    }).toString(),
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  if (!tokenRes || !tokenRes.ok) return fail("naver_token");
  const token = (await tokenRes.json()) as NaverToken;
  if (!token.access_token) return fail("naver_token");

  // 2) 프로필
  const meRes = await fetch("https://openapi.naver.com/v1/nid/me", {
    headers: { Authorization: `Bearer ${token.access_token}` },
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  if (!meRes || !meRes.ok) return fail("naver_profile");
  const me = ((await meRes.json()) as { response?: NaverProfile }).response;
  const email = me?.email;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("naver_email");

  // 3) Supabase 사용자 find-or-create (service_role)
  const admin = createAdminClient();
  await admin.auth.admin
    .createUser({
      email,
      email_confirm: true,
      user_metadata: {
        provider: "naver",
        naver_id: me?.id,
        full_name: me?.name ?? me?.nickname,
        name: me?.name ?? me?.nickname,
        avatar_url: me?.profile_image ?? null,
        phone_number: me?.mobile_e164 ?? me?.mobile ?? null,
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
  if (linkErr || !hashedToken) return fail("naver_session");

  // 5) 세션 발급: verifyOtp의 setAll이 쿠키를 res에 기록. 실패 시 아래에서 fail()로 응답을
  //    교체하므로(res 폐기) 무음 실패 없음. 성공 시에만 세션 쿠키가 담긴 res 반환.
  const res = NextResponse.redirect(`${origin}/`);
  res.cookies.delete("naver_oauth_state");
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
  if (otpErr) return fail("naver_verify");

  return res;
}
