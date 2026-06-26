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

  const j = encodeURIComponent(jobId);
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "nurse") redirect(`/jobs?j=${j}&apply=nurse_only`);

  const { data: resume } = await supabase.from("resumes").select("profile_id").eq("profile_id", user.id).maybeSingle();
  if (!resume) redirect(`/jobs?j=${j}&apply=need_resume`);

  const message = String(formData.get("message") ?? "").trim() || null;
  const { error } = await supabase.from("applications").insert({ job_id: jobId, applicant_id: user.id, message });
  if (error) redirect(error.code === "23505" ? `/jobs?j=${j}&apply=dup` : `/jobs?j=${j}&apply=error`);

  redirect("/mypage/applications?ok=1");
}

// 검색 저장(채용 알림 기반) — 로그인 사용자.
export async function saveSearch(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const keyword = String(formData.get("q") ?? "").trim() || null;
  const location = String(formData.get("l") ?? "").trim() || null;
  if (!keyword && !location) redirect("/jobs");
  await supabase.from("saved_searches").insert({ profile_id: user.id, keyword, location });
  const p = new URLSearchParams();
  if (keyword) p.set("q", keyword);
  if (location) p.set("l", location);
  p.set("saved", "1");
  redirect("/jobs?" + p.toString());
}
