"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeNext } from "@/lib/url";
import { SITE_URL, MIN_PASSWORD, RECOVERY_COOKIE, RECOVERY_COOKIE_OPTIONS, authErrorPath } from "@/lib/constants";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// 지울 때도 심을 때와 같은 속성을 줘야 __Host- 쿠키가 실제로 지워진다(delete()는 Secure 를 안 붙인다).
const clearRecoveryCookie = (jar: Awaited<ReturnType<typeof cookies>>) =>
  jar.set(RECOVERY_COOKIE, "", { ...RECOVERY_COOKIE_OPTIONS, maxAge: 0 });

// 레거시 기본 = 아이디 로그인. 아이디(username) 또는 이메일 모두 허용.
export async function signInWithId(formData: FormData) {
  const loginId = String(formData.get("loginId") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!loginId || !password) redirect(authErrorPath("/login", "missing"));

  // 아이디 → 이메일 해석 (service_role, 서버 전용). 미존재 시 비번오류와 동일 메시지(아이디 노출 방지).
  const email = await resolveEmail(loginId);
  if (!email) redirect(authErrorPath("/login", "invalid_credentials"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(authErrorPath("/login", "invalid_credentials"));

  // 로그인 후 원래 보던 곳으로 복귀(내부 경로만 허용 — 오픈 리다이렉트 방지)
  redirect(safeNext(String(formData.get("next") ?? "")));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const jar = await cookies();
  jar.delete("view_as"); // 관리자 보기 전환 상태가 다음 로그인까지 남지 않도록
  clearRecoveryCookie(jar); // 비밀번호 재설정 표시가 다음 사람에게 넘어가지 않도록
  redirect("/");
}

// 아이디 → 이메일. 로그인과 재설정이 같은 규칙을 쓴다(레거시 회원은 아이디만 기억한다).
async function resolveEmail(loginId: string): Promise<string | null> {
  if (loginId.includes("@")) return EMAIL_RE.test(loginId) ? loginId : null;
  const admin = createAdminClient();
  const { data, error } = await admin.from("profiles").select("email").eq("username", loginId).maybeSingle();
  // 조회 자체가 실패한 것과 아이디가 없는 것은 다르다. 화면에는 똑같이 답하되(계정 노출 방지) 원인은 남긴다.
  if (error) console.error("resolveEmail failed:", error.message);
  return data?.email ?? null;
}

// 비밀번호 재설정 메일 보내기.
// 계정이 있든 없든 **같은 화면**으로 끝낸다 — 다르게 답하면 어떤 아이디·이메일이 가입돼 있는지 알려주는 셈이다.
export async function requestPasswordReset(formData: FormData) {
  const loginId = String(formData.get("loginId") ?? "").trim();
  if (!loginId) redirect(authErrorPath("/reset-password", "id_required"));

  const email = await resolveEmail(loginId);
  if (email) {
    // 배포에서는 SITE_URL로 못 박는다. origin을 그대로 쓰면 프리뷰 배포·프록시처럼 Supabase 허용목록
    // 밖의 주소일 때 링크가 조용히 홈으로 떨어져(에러 화면조차 없이) 아무 일도 일어나지 않는다.
    // 개발에서는 localhost로 돌아와야 테스트가 되므로 그때만 origin을 쓴다.
    // ?? 가 아니라 || — 헤더가 빈 문자열이어도 SITE_URL로 넘어가게.
    const origin =
      process.env.NODE_ENV === "development" ? (await headers()).get("origin") || SITE_URL : SITE_URL;
    const supabase = await createClient();
    // 메일 템플릿이 이 주소에 token_hash·type을 붙인다(/auth/confirm 주석 참고).
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/confirm` });
    // 사용자에게는 알리지 않는다(계정 노출). 다만 메일 한도 초과·SMTP 장애가 무증상으로 지나가면 안 된다.
    if (error) console.error("resetPasswordForEmail failed:", error.message);
  }
  redirect("/reset-password?sent=1");
}

// 새 비밀번호 저장.
// 로그인 세션만으로는 부족하다 — 그러면 남의 브라우저가 열려 있을 때 기존 비밀번호를 몰라도 바꿔서
// 계정을 영구히 빼앗을 수 있다. 메일 링크를 통과했다는 표시(RECOVERY_COOKIE)를 반드시 요구한다.
export async function updatePassword(formData: FormData) {
  const jar = await cookies();
  const recoveredId = jar.get(RECOVERY_COOKIE)?.value;
  if (!recoveredId) redirect(authErrorPath("/reset-password", "link_expired"));

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("password_confirm") ?? "");
  if (password.length < MIN_PASSWORD) redirect(authErrorPath("/reset-password/new", "weak"));
  if (password !== confirm) redirect(authErrorPath("/reset-password/new", "mismatch"));

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // 표시를 받은 그 회원이어야 한다 — 중간에 다른 계정으로 로그인했다면 남의 비밀번호를 바꾸는 셈이다.
  if (!user || user.id !== recoveredId) redirect(authErrorPath("/reset-password", "link_expired"));

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("updatePassword failed:", error.message);
    redirect(authErrorPath("/reset-password/new", "save"));
  }
  clearRecoveryCookie(jar); // 한 번 쓰면 끝 — 표시가 남아 있으면 나중에 또 바꿀 수 있다
  redirect("/reset-password/new?ok=1");
}

export async function signUpWithEmail(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  // 간호사/병원 선택. 병원도 공고 등록 전 사업자 인증을 거치므로 자기선택 허용 안전.
  const role = formData.get("role") === "hospital" ? "hospital" : "nurse";
  const keep = role === "hospital" ? "&role=hospital" : "";

  if (!EMAIL_RE.test(email)) redirect(`${authErrorPath("/signup", "email_invalid")}${keep}`);
  if (password.length < MIN_PASSWORD) redirect(`${authErrorPath("/signup", "weak")}${keep}`);

  const supabase = await createClient();
  // 트리거(handle_new_user)가 raw_user_meta_data.role을 읽어 profiles.role 설정
  const { error } = await supabase.auth.signUp({ email, password, options: { data: { role } } });
  if (error) redirect(`${authErrorPath("/signup", "signup_failed")}${keep}`);

  redirect("/signup?sent=1");
}
