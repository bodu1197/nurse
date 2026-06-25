"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// 간편지원 — 간호사 + 이력서 보유 시 지원 생성.
export async function applyToJob(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const jobId = String(formData.get("job_id") ?? "");
  if (!jobId) redirect("/jobs");

  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "nurse") redirect("/jobs");

  const { data: resume } = await supabase.from("resumes").select("profile_id").eq("profile_id", user.id).maybeSingle();
  if (!resume) redirect("/mypage/resume?need=1");

  const message = String(formData.get("message") ?? "").trim() || null;
  const { error } = await supabase.from("applications").insert({ job_id: jobId, applicant_id: user.id, message });
  if (error) redirect(error.code === "23505" ? "/mypage/applications?dup=1" : "/jobs");

  redirect("/mypage/applications?ok=1");
}
