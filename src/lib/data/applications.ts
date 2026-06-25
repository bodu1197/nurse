import { createClient } from "@/lib/supabase/server";

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
  job: { id: string; title: string } | null;
  resume: { name: string | null; phone: string | null; experience_years: number | null; specialties: string[]; intro: string | null } | null;
};

// 병원 — 내 공고에 들어온 지원자(+이력서). RLS로 소유 공고만.
export async function getReceivedApplications(): Promise<ReceivedApplication[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: apps } = await supabase
    .from("applications")
    .select("id,status,message,created_at,applicant_id,job:jobs(id,title)")
    .order("created_at", { ascending: false })
    .returns<Array<Omit<ReceivedApplication, "resume"> & { applicant_id: string }>>();
  if (!apps || apps.length === 0) return [];

  const ids = [...new Set(apps.map((a) => a.applicant_id))];
  const { data: resumes } = await supabase
    .from("resumes")
    .select("profile_id,name,phone,experience_years,specialties,intro")
    .in("profile_id", ids);
  const byId = new Map((resumes ?? []).map((r) => [r.profile_id, r]));

  return apps.map(({ applicant_id, ...a }) => ({ ...a, resume: byId.get(applicant_id) ?? null }));
}
