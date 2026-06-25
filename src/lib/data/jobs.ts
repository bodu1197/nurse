import { createClient } from "@/lib/supabase/server";

export type JobSource = "direct" | "worknet" | "public_data" | "partner" | "crawl";

export type JobRow = {
  id: string;
  title: string;
  specialty: string | null;
  location: string | null;
  employment_type: string | null;
  salary_text: string | null;
  benefits: string[];
  description: string | null;
  source: JobSource;
  external_url: string | null;
  is_featured: boolean;
  posted_at: string;
  hospital: { name: string; rating_avg: number; rating_count: number } | null;
};

export const SOURCE_LABEL: Record<JobSource, string> = {
  direct: "병원 직접",
  worknet: "워크넷",
  public_data: "공공데이터",
  partner: "제휴",
  crawl: "수집",
};

const SELECT =
  "id,title,specialty,location,employment_type,salary_text,benefits,description,source,external_url,is_featured,posted_at,hospital:hospitals(name,rating_avg,rating_count)";

// PostgREST or 필터 주입 방지: %,(),쉼표 제거
const clean = (s: string) => s.replace(/[%,()]/g, "").trim();

export async function getJobs(keyword: string, location: string): Promise<JobRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("jobs")
    .select(SELECT)
    .eq("status", "open")
    .order("is_featured", { ascending: false })
    .order("posted_at", { ascending: false })
    .limit(50);

  const kw = clean(keyword);
  if (kw) query = query.or(`title.ilike.%${kw}%,specialty.ilike.%${kw}%`);
  const loc = clean(location);
  if (loc) query = query.ilike("location", `%${loc}%`);

  const { data, error } = await query.returns<JobRow[]>();
  if (error) {
    console.error("getJobs failed:", error.message);
    return [];
  }
  return data ?? [];
}

export type MyJob = { id: string; title: string; status: string; posted_at: string; applicant_count: number };

// 병원 — 내가 소유한 병원의 공고 목록 + 지원자 수.
export async function getMyJobs(): Promise<MyJob[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: hosps } = await supabase.from("hospitals").select("id").eq("owner_profile_id", user.id);
  const ids = (hosps ?? []).map((h) => h.id);
  if (ids.length === 0) return [];

  type Raw = { id: string; title: string; status: string; posted_at: string; applications: { count: number }[] };
  const { data } = await supabase
    .from("jobs")
    .select("id,title,status,posted_at,applications(count)")
    .in("hospital_id", ids)
    .order("posted_at", { ascending: false })
    .returns<Raw[]>();
  return (data ?? []).map((j) => ({
    id: j.id, title: j.title, status: j.status, posted_at: j.posted_at,
    applicant_count: j.applications?.[0]?.count ?? 0,
  }));
}

export type SavedSearch = { id: string; keyword: string | null; location: string | null; created_at: string };

export async function getMySavedSearches(): Promise<SavedSearch[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("saved_searches")
    .select("id,keyword,location,created_at")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .returns<SavedSearch[]>();
  return data ?? [];
}

export async function getJob(id: string): Promise<JobRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(SELECT)
    .eq("id", id)
    .eq("status", "open")
    .limit(1)
    .returns<JobRow[]>();
  if (error) {
    console.error("getJob failed:", error.message);
    return null;
  }
  return data?.[0] ?? null;
}
