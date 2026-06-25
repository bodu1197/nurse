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

  const { data: hosp } = await admin.from("hospitals").select("id, owner_profile_id, region").eq("id", hospitalId).maybeSingle();
  if (!hosp) redirect("/mypage/jobs/new?error=hospital");
  if (hosp.owner_profile_id && hosp.owner_profile_id !== user.id) redirect("/mypage/jobs/new?error=claimed");
  if (!hosp.owner_profile_id) {
    await admin.from("hospitals").update({ owner_profile_id: user.id, is_claimed: true }).eq("id", hospitalId);
    await admin.from("profiles").update({ claimed_hospital_id: hospitalId }).eq("id", user.id);
  }

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

  redirect("/jobs");
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
