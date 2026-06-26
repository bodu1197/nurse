"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyBusiness } from "@/lib/data/nts";

// 병원 사업자 진위확인 → 통과 시에만 business_verified(서버=service_role) 설정.
export async function verifyHospitalBusiness(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("role, business_verified").eq("id", user.id).maybeSingle();
  if (!prof || prof.role !== "hospital") redirect("/mypage");
  if (prof.business_verified) redirect("/mypage/verify?ok=1");

  const b_no = String(formData.get("b_no") ?? "");
  const start_dt = String(formData.get("start_dt") ?? "");
  const p_nm = String(formData.get("p_nm") ?? "");

  const res = await verifyBusiness(b_no, start_dt, p_nm);
  if (!res.ok) redirect(`/mypage/verify?error=${res.reason ?? "fail"}`);

  await admin
    .from("profiles")
    .update({ business_no: b_no.replace(/\D/g, ""), business_verified: true, business_verified_at: new Date().toISOString() })
    .eq("id", user.id);

  redirect("/mypage/verify?ok=1");
}

// 공고 등록 — 인증된 병원만. 미claim 병원이면 claim 후 jobs 저장(서버 검증).
export async function createJob(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("role, business_verified").eq("id", user.id).maybeSingle();
  if (!prof || prof.role !== "hospital") redirect("/mypage");
  if (!prof.business_verified) redirect("/mypage/verify");

  const s = (k: string) => String(formData.get(k) ?? "").trim();
  const hospitalId = s("hospital_id");
  const title = s("title");
  if (!hospitalId || !title) redirect("/mypage/jobs/new?error=missing");

  const { data: hosp } = await admin.from("hospitals").select("id, owner_profile_id, region, free_credits").eq("id", hospitalId).maybeSingle();
  if (!hosp) redirect("/mypage/jobs/new?error=hospital");
  if (hosp.owner_profile_id && hosp.owner_profile_id !== user.id) redirect("/mypage/jobs/new?error=claimed");
  if (!hosp.owner_profile_id) {
    await admin.from("hospitals").update({ owner_profile_id: user.id, is_claimed: true }).eq("id", hospitalId);
    await admin.from("profiles").update({ claimed_hospital_id: hospitalId }).eq("id", user.id);
  }

  // 무료권(7일×4) 확인 — 소진 시 유료 광고 필요(Phase 2 결제).
  if ((hosp.free_credits ?? 0) <= 0) redirect("/mypage/jobs?error=nocredit");

  const benefits = s("benefits").split(",").map((x) => x.trim()).filter(Boolean);
  const { error } = await admin.from("jobs").insert({
    hospital_id: hospitalId,
    title,
    specialty: s("specialty") || null,
    location: s("location") || hosp.region || null,
    employment_type: s("employment_type") || null,
    salary_text: s("salary_text") || null,
    description: s("description") || null,
    benefits,
    source: "direct",
    status: "open",
  });
  if (error) redirect("/mypage/jobs/new?error=save");

  // 무료권 1장 차감
  await admin.from("hospitals").update({ free_credits: (hosp.free_credits ?? 1) - 1 }).eq("id", hospitalId);
  redirect("/jobs");
}

// 소유 공고인지 확인(병원 소유주 == 본인). 아니면 null.
async function ownedJobHospital(admin: ReturnType<typeof createAdminClient>, jobId: string, userId: string) {
  const { data: job } = await admin.from("jobs").select("hospital_id").eq("id", jobId).maybeSingle();
  if (!job) return null;
  const { data: hosp } = await admin.from("hospitals").select("id, owner_profile_id, region, free_credits").eq("id", job.hospital_id).maybeSingle();
  if (!hosp || hosp.owner_profile_id !== userId) return null;
  return hosp;
}

// 공고 수정 — 소유 병원 공고만.
export async function updateJob(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const jobId = String(formData.get("job_id") ?? "");
  if (!jobId) redirect("/mypage/jobs");

  const admin = createAdminClient();
  const hosp = await ownedJobHospital(admin, jobId, user.id);
  if (!hosp) redirect("/mypage/jobs?error=1");

  const s = (k: string) => String(formData.get(k) ?? "").trim();
  const title = s("title");
  if (!title) redirect(`/mypage/jobs/${jobId}/edit?error=missing`);
  const benefits = s("benefits").split(",").map((x) => x.trim()).filter(Boolean);
  const { error } = await admin.from("jobs").update({
    title,
    specialty: s("specialty") || null,
    location: s("location") || hosp.region || null,
    employment_type: s("employment_type") || null,
    salary_text: s("salary_text") || null,
    description: s("description") || null,
    benefits,
  }).eq("id", jobId);
  if (error) redirect(`/mypage/jobs/${jobId}/edit?error=save`);
  redirect("/mypage/jobs?ok=1");
}

// 다시 게시 — 게시일 갱신(무료 7일 재시작) + 공개.
export async function repostJob(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const jobId = String(formData.get("job_id") ?? "");
  if (!jobId) redirect("/mypage/jobs");

  const admin = createAdminClient();
  const hosp = await ownedJobHospital(admin, jobId, user.id);
  if (!hosp) redirect("/mypage/jobs?error=1");
  // 다시 게시도 새 7일 노출 → 무료권 1장 소비
  if ((hosp.free_credits ?? 0) <= 0) redirect("/mypage/jobs?error=nocredit");

  const { error } = await admin.from("jobs").update({ status: "open", posted_at: new Date().toISOString() }).eq("id", jobId);
  if (error) redirect("/mypage/jobs?error=1");
  await admin.from("hospitals").update({ free_credits: (hosp.free_credits ?? 1) - 1 }).eq("id", hosp.id);
  redirect("/mypage/jobs?ok=1");
}

// 간호사 이력서 저장(upsert) — RLS로 본인만.
export async function saveResume(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "nurse") redirect("/mypage");

  const s = (k: string) => { const v = String(formData.get(k) ?? "").trim(); return v || null; };
  const eyRaw = String(formData.get("experience_years") ?? "").trim();
  const ey = eyRaw === "" ? null : Number(eyRaw);
  const specialties = String(formData.get("specialties") ?? "").split(",").map((x) => x.trim()).filter(Boolean);

  const { error } = await supabase.from("resumes").upsert({
    profile_id: user.id,
    name: s("name"),
    phone: s("phone"),
    license_type: s("license_type"),
    license_no: s("license_no"),
    experience_years: ey !== null && Number.isFinite(ey) ? ey : null,
    education: s("education"),
    specialties,
    desired_location: s("desired_location"),
    desired_employment_type: s("desired_employment_type"),
    desired_salary: s("desired_salary"),
    intro: s("intro"),
    is_public: formData.get("is_public") === "on",
  });
  if (error) redirect("/mypage/resume?error=save");
  redirect("/mypage/resume?ok=1");
}

// 병원 — 지원자 상태 변경(열람/합격/불합격). RLS로 공고 소유 병원만.
export async function updateApplicationStatus(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const id = String(formData.get("application_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["viewed", "accepted", "rejected"].includes(status)) redirect("/mypage/applicants");
  const { error } = await supabase.from("applications").update({ status }).eq("id", id);
  if (error) redirect("/mypage/applicants?error=1");
  redirect("/mypage/applicants?ok=1");
}

// 병원 — 공고 마감/재개 (RLS로 소유 공고만).
export async function setJobStatus(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const id = String(formData.get("job_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["open", "closed"].includes(status)) redirect("/mypage/jobs");
  const { error } = await supabase.from("jobs").update({ status }).eq("id", id);
  if (error) redirect("/mypage/jobs?error=1");
  redirect("/mypage/jobs?ok=1");
}

// 병원 — 공고 삭제 (RLS로 소유 공고만).
export async function deleteJob(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const id = String(formData.get("job_id") ?? "");
  if (id) {
    const { error } = await supabase.from("jobs").delete().eq("id", id);
    if (error) redirect("/mypage/jobs?error=1");
  }
  redirect("/mypage/jobs?ok=1");
}

// 저장한 검색 삭제 (RLS로 본인만).
export async function deleteSavedSearch(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (id) {
    const { error } = await supabase.from("saved_searches").delete().eq("id", id);
    if (error) redirect("/mypage/alerts?error=1");
  }
  redirect("/mypage/alerts");
}

// 1:1 메시지 전송. 상대 표시명 비정규화 저장.
export async function sendMessage(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const recipientId = String(formData.get("recipient_id") ?? "");
  const recipientName = String(formData.get("recipient_name") ?? "").trim() || null;
  const body = String(formData.get("body") ?? "").trim();
  if (!recipientId || !body) redirect("/mypage/messages");
  const { data: me } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const { error } = await supabase.from("messages").insert({
    sender_id: user.id, recipient_id: recipientId, sender_name: me?.display_name ?? null, recipient_name: recipientName, body,
  });
  if (error) redirect("/mypage/messages?with=" + recipientId + "&error=1");
  redirect("/mypage/messages?with=" + recipientId);
}
