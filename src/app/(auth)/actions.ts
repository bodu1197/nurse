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

  redirect("/");
}

export async function signUpWithEmail(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!EMAIL_RE.test(email)) redirect("/signup?error=email_invalid");
  if (password.length < 8) redirect("/signup?error=weak");

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) redirect("/signup?error=signup_failed");

  redirect("/signup?sent=1");
}
