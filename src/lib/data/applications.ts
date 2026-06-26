import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const STATUS_LABEL: Record<string, string> = {
  submitted: "지원완료",
  viewed: "열람됨",
  accepted: "합격",
  rejected: "불합격",
};

export type MyApplication = {
  id: string;
  status: string;
  created_at: string;
  job: { id: string; title: string; hospital: { name: string } | null } | null;
};

// 간호사 — 내가 지원한 내역
export async function getMyApplications(): Promise<MyApplication[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("applications")
    .select("id,status,created_at,job:jobs(id,title,hospital:hospitals(name))")
    .eq("applicant_id", user.id)
    .order("created_at", { ascending: false })
    .returns<MyApplication[]>();
  return data ?? [];
}

export type ReceivedApplication = {
  id: string;
  status: string;
  message: string | null;
  created_at: string;
  applicant_id: string;
  job: { id: string; title: string } | null;
  resume: { name: string | null; phone: string | null; experience_years: number | null; specialties: string[]; intro: string | null } | null;
};

// 병원 — 내 공고에 들어온 지원자(+이력서). RLS로 소유 공고만. jobId 지정 시 해당 공고만.
export async function getReceivedApplications(jobId?: string): Promise<ReceivedApplication[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  let q = supabase
    .from("applications")
    .select("id,status,message,created_at,applicant_id,job:jobs(id,title)")
    .order("created_at", { ascending: false });
  if (jobId) q = q.eq("job_id", jobId);
  const { data: apps } = await q.returns<Array<Omit<ReceivedApplication, "resume">>>();
  if (!apps || apps.length === 0) return [];

  // 열람 자동 처리: 병원이 목록을 열면 submitted → viewed (지원자에게 '열람됨' 반영). id는 RLS로 본인 공고 한정.
  const unseen = apps.filter((a) => a.status === "submitted").map((a) => a.id);
  if (unseen.length > 0) {
    await createAdminClient().from("applications").update({ status: "viewed" }).in("id", unseen).eq("status", "submitted");
    apps.forEach((a) => { if (a.status === "submitted") a.status = "viewed"; });
  }

  const ids = [...new Set(apps.map((a) => a.applicant_id))];
  const { data: resumes } = await supabase
    .from("resumes")
    .select("profile_id,name,phone,experience_years,specialties,intro")
    .in("profile_id", ids);
  const byId = new Map((resumes ?? []).map((r) => [r.profile_id, r]));

  return apps.map((a) => ({ ...a, resume: byId.get(a.applicant_id) ?? null }));
}
