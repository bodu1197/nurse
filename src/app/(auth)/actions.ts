"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// 레거시 기본 = 아이디 로그인. 아이디(username) 또는 이메일 모두 허용.
export async function signInWithId(formData: FormData) {
  const loginId = String(formData.get("loginId") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!loginId || !password) redirect("/login?error=missing");

  let email = loginId;
  if (!loginId.includes("@")) {
    // 아이디 → 이메일 해석 (service_role, 서버 전용). 미존재 시 비번오류와 동일 메시지(아이디 노출 방지).
    const admin = createAdminClient();
    const { data } = await admin.from("profiles").select("email").eq("username", loginId).maybeSingle();
    if (!data?.email) redirect("/login?error=invalid_credentials");
    email = data.email;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=invalid_credentials");

  // 로그인 후 원래 보던 곳으로 복귀(상대경로만 허용 — 오픈 리다이렉트 방지)
  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function signUpWithEmail(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  // 간호사/병원 선택. 병원도 공고 등록 전 사업자 인증을 거치므로 자기선택 허용 안전.
  const role = formData.get("role") === "hospital" ? "hospital" : "nurse";
  const keep = role === "hospital" ? "&role=hospital" : "";

  if (!EMAIL_RE.test(email)) redirect(`/signup?error=email_invalid${keep}`);
  if (password.length < 8) redirect(`/signup?error=weak${keep}`);

  const supabase = await createClient();
  // 트리거(handle_new_user)가 raw_user_meta_data.role을 읽어 profiles.role 설정
  const { error } = await supabase.auth.signUp({ email, password, options: { data: { role } } });
  if (error) redirect(`/signup?error=signup_failed${keep}`);

  redirect("/signup?sent=1");
}
