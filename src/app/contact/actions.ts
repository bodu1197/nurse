"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/user";

const KINDS = ["payment", "hospital", "report", "privacy", "etc"] as const;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const f = (d: FormData, k: string) => String(d.get(k) ?? "").trim();

/**
 * 1:1 문의 접수.
 *
 * 🔴 예전에는 /contact 가 mailto 링크뿐이었다. 메일함으로 흩어져서 무엇이 처리됐는지,
 *    빠뜨린 게 있는지 알 방법이 없었다. 이제 표에 쌓이고 /admin/inquiries 에서 처리한다.
 *
 * 🔴 비로그인도 보낼 수 있어야 한다 — 가입 전 문의가 제일 많다(RLS: inquiries_insert_any).
 *    대신 상태·메모는 넣지 못한다(컬럼 권한). 안 그러면 문의를 넣으면서 스스로
 *    '답변완료'로 만들어 목록에서 감출 수 있다.
 */
export async function submitInquiry(formData: FormData) {
  const kind = f(formData, "kind");
  const name = f(formData, "name");
  const email = f(formData, "email");
  const phone = f(formData, "phone").replace(/[^0-9-]/g, "");
  const subject = f(formData, "subject");
  const body = f(formData, "body");

  const bad = (code: string) => redirect(`/contact?error=${code}#form`);
  if (!KINDS.includes(kind as (typeof KINDS)[number])) bad("kind");
  if (name.length < 1 || name.length > 50) bad("name");
  if (!EMAIL_RE.test(email) || email.length > 200) bad("email");
  if (phone && !/^[0-9-]{9,20}$/.test(phone)) bad("phone");
  if (subject.length < 1 || subject.length > 200) bad("subject");
  if (body.length < 5 || body.length > 5000) bad("body");

  const supabase = await createClient();
  const user = await getSessionUser();
  const { error } = await supabase.from("inquiries").insert({
    kind, name, email, phone: phone || null, subject, body,
    author_id: user?.id ?? null,
  });
  if (error) {
    console.error("submitInquiry:", error.message);
    redirect("/contact?error=save#form");
  }
  redirect("/contact?ok=1#form");
}
