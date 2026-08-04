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
  // 실패해도 복귀 주소를 들고 되돌아간다 — 오타 한 번에 "지원하려던 공고"를 잃지 않게.
  // safeNext 로 먼저 씻어서 되돌린다(주소창에 다시 실리는 값이라 그대로 넘기면 안 된다).
  const next = safeNext(String(formData.get("next") ?? ""), "");
  if (!loginId || !password) redirect(authErrorPath("/login", "missing", next));

  // 아이디 → 이메일 해석 (service_role, 서버 전용). 미존재 시 비번오류와 동일 메시지(아이디 노출 방지).
  const email = await resolveEmail(loginId);
  if (!email) redirect(authErrorPath("/login", "invalid_credentials", next));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(authErrorPath("/login", "invalid_credentials", next));

  // 로그인 후 원래 보던 곳으로 복귀(내부 경로만 허용 — 오픈 리다이렉트 방지).
  // 🔴 돌아갈 곳이 없으면 **마이페이지**다(오너 지시 2026-08-04). 홈은 방금 로그인한 사람에게
  //    아무 일도 시켜주지 않는다 — 이력서·공고·지원 내역이 전부 마이페이지에 있다.
  //    next 는 그대로 지킨다. 공고 상세에서 간편지원하려고 로그인한 사람을 마이페이지로 보내면
  //    그 사람은 다시 그 공고를 찾아가야 한다.
  redirect(safeNext(next, "/mypage"));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const jar = await cookies();
  jar.delete("view_as"); // 관리자 보기 전환 상태가 다음 로그인까지 남지 않도록
  clearRecoveryCookie(jar); // 비밀번호 재설정 표시가 다음 사람에게 넘어가지 않도록
  // ?left=1 — 도착한 화면이 이 브라우저에 남은 이력서·공고 초안을 지우는 신호다(DraftCleaner).
  //   공용 PC 에서 로그아웃했는데 실명·휴대폰이 localStorage 에 남아 있으면 안 된다.
  redirect("/?left=1");
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
  if (error) {
    // 🔴 전에는 모든 실패를 "이미 가입된 이메일일 수 있습니다" 하나로 뭉갰다. 이 서비스는 아직
    //    커스텀 SMTP 가 없어 확인 메일이 시간당 2통으로 제한되므로(supabase/config.toml), 세 번째
    //    가입자는 **처음 가입하는데** "이미 가입됨"이라는 말을 듣고 로그인도 재설정도 안 되는
    //    막다른 길에 놓였다. 원인이 다르면 다르게 말한다. 원인은 로그에도 남긴다.
    console.error("signUp failed:", error.status ?? "", error.message);
    const code = error.status === 429 ? "rate_limited" : "signup_failed";
    redirect(`${authErrorPath("/signup", code)}${keep}`);
  }

  // 🔴 "확인 메일을 보냈습니다" 화면으로 보내지 않는다. 가입 확인 메일을 끈 뒤로(2026-08-04)
  //    signUp 이 곧바로 세션을 준다 — 이미 로그인된 사람에게 메일함을 열라고 하는 꼴이 된다.
  //    메일 확인을 껐던 이유: 내장 메일이 시간당 2통이라 세 번째 가입자부터 아예 가입이 막혔다.
  //    가입하면 무조건 마이페이지로 보낸다(오너 지시 2026-08-04). 홈에 떨어뜨리면 그냥 나간다.
  redirect("/mypage");
}
