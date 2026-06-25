import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// 네이버 커스텀 OAuth 콜백 — Supabase 미지원이라 직접 구현 후 Supabase Auth에 세션 발급.
// state 검증 → code→token → 프로필 → 사용자 find-or-create(admin) → magiclink token_hash로 세션.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const fail = (r: string) => NextResponse.redirect(`${origin}/login?error=${r}`);

  const savedState = (await cookies()).get("naver_oauth_state")?.value;
  if (!code || !state || !savedState || state !== savedState) return fail("naver_state");

  // 1) code → access token
  const tokenRes = await fetch(
    "https://nid.naver.com/oauth2.0/token?" +
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.NAVER_CLIENT_ID!,
        client_secret: process.env.NAVER_CLIENT_SECRET!,
        code,
        state,
      }).toString(),
  );
  const token = await tokenRes.json();
  if (!token?.access_token) return fail("naver_token");

  // 2) 프로필
  const meRes = await fetch("https://openapi.naver.com/v1/nid/me", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const me = (await meRes.json())?.response;
  if (!me?.email) return fail("naver_email");

  // 3) Supabase 사용자 find-or-create (service_role)
  const admin = createAdminClient();
  await admin.auth.admin
    .createUser({
      email: me.email,
      email_confirm: true,
      user_metadata: {
        provider: "naver",
        naver_id: me.id,
        full_name: me.name ?? me.nickname,
        name: me.name ?? me.nickname,
        avatar_url: me.profile_image ?? null,
        phone_number: me.mobile_e164 ?? me.mobile ?? null,
      },
    })
    .catch(() => {
      /* 이미 가입된 이메일이면 무시하고 세션만 발급 */
    });

  // 4) magiclink token_hash로 Supabase 세션 발급 (쿠키 설정)
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: me.email,
  });
  if (linkErr || !link?.properties?.hashed_token) return fail("naver_session");

  const supabase = await createClient();
  const { error: otpErr } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: link.properties.hashed_token,
  });
  if (otpErr) return fail("naver_verify");

  const res = NextResponse.redirect(`${origin}/`);
  res.cookies.delete("naver_oauth_state");
  return res;
}
