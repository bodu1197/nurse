"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { viewAsRole } from "@/lib/data/user";
import { nowMs } from "@/lib/date";
import { isOpenToSeekers } from "@/lib/jobState";
import { safeNext } from "@/lib/url";

// 간편지원 — 간호사 + 이력서(이름·연락처 포함) 보유 시 지원 생성.
// 화면에서 막는 것만으로는 부족해 공고 상태·지원 방식·노출 기간을 서버에서 다시 확인한다.
export async function applyToJob(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const jobId = String(formData.get("job_id") ?? "");
  if (!jobId) redirect("/jobs");

  // 실패하면 눌렀던 화면으로 그대로 돌려보낸다(목록 옆 패널이면 그 URL, 단독 상세면 /jobs/[id]).
  const base = safeNext(String(formData.get("next") ?? ""), `/jobs/${encodeURIComponent(jobId)}`);
  const fail = (code: string) => redirect(`${base}${base.includes("?") ? "&" : "?"}apply=${code}`);

  // 서로 의존하지 않는 세 조회를 한 번에 보낸다(순서대로 기다리면 왕복이 3번이다).
  // 판정 순서는 그대로 유지한다 — 역할 → 공고 → 이력서.
  const [{ data: prof }, { data: job }, { data: resume }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.from("jobs").select("id, source, apply_methods, posted_at, featured_until, deadline")
      .eq("id", jobId).eq("status", "open").maybeSingle(),
    supabase.from("resumes").select("name, phone").eq("profile_id", user.id).maybeSingle(),
  ]);

  if (!prof || (await viewAsRole(prof.role)) !== "nurse") return fail("nurse_only");

  // 공고 검증 — 열려 있고, 직접등록이고, 간편지원을 받는 공고인가.
  if (!job || job.source !== "direct" || !job.apply_methods.includes("platform")) return fail("closed");

  // 노출이 끝난 공고(광고·무료 기간 만료 또는 마감일 경과)는 목록에 없지만 링크로는 들어올 수 있다.
  // 목록·상세와 **같은 함수**를 써야 "안 보이는데 지원은 되는" 구멍이 안 생긴다.
  if (!isOpenToSeekers(job, nowMs())) return fail("closed");

  // 관리자가 간호사 보기로 지원하면 실제 병원에 가짜 지원자가 남는다 → 테스트 병원 공고에만 허용.
  if (prof.role === "admin") {
    const { data: testJob } = await supabase
      .from("jobs").select("id, hospital:hospitals!inner(is_test)")
      .eq("id", jobId).eq("hospitals.is_test", true).maybeSingle();
    if (!testJob) return fail("admin_test");
  }

  // 이름·연락처가 없으면 병원이 연락할 방법이 없다 → 지원 자체를 막고 이력서로 보낸다.
  if (!resume) return fail("need_resume");
  if (!resume.name?.trim() || !resume.phone?.trim()) return fail("need_contact");

  const message = String(formData.get("message") ?? "").trim() || null;

  // 취소한 지원이 남아 있으면 되살린다. unique(job_id, applicant_id) 때문에 새로 만들 수 없고,
  // 간호사 정책은 'withdrawn'으로만 바꿀 수 있어 되살리기는 서버(service_role)가 한다.
  const { data: existing } = await supabase
    .from("applications").select("id, status").eq("job_id", jobId).eq("applicant_id", user.id).maybeSingle();
  if (existing) {
    if (existing.status !== "withdrawn") return fail("dup");
    const { data: revived } = await createAdminClient()
      .from("applications").update({ status: "submitted", message })
      .eq("id", existing.id).eq("applicant_id", user.id).eq("status", "withdrawn").select("id");
    if (!revived?.length) return fail("error");
    redirect("/mypage/applications?ok=1");
  }

  const { error } = await supabase.from("applications").insert({ job_id: jobId, applicant_id: user.id, message });
  if (error) return fail(error.code === "23505" ? "dup" : "error");

  redirect("/mypage/applications?ok=1");
}

// 관심 공고 저장/해제(토글) — 로그인 사용자. 184k 공고 중 마음에 든 것만 모아두기.
export async function toggleSaveJob(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const jobId = String(formData.get("job_id") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""), "/jobs");
  if (!jobId) redirect(next);
  const { data: existing } = await supabase.from("saved_jobs").select("id").eq("profile_id", user.id).eq("job_id", jobId).maybeSingle();
  if (existing) await supabase.from("saved_jobs").delete().eq("id", existing.id);
  else await supabase.from("saved_jobs").insert({ profile_id: user.id, job_id: jobId });
  redirect(next);
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
