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

export type JobFilters = { specialty?: string; employmentType?: string; days?: number };

const DAY_MS = 86_400_000;

export async function getJobs(keyword: string, location: string, filters: JobFilters = {}): Promise<JobRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("jobs")
    .select(SELECT)
    .eq("status", "open")
    .order("is_featured", { ascending: false })
    .order("posted_at", { ascending: false })
    .limit(50);

  // 7일 무료 만료: 병원 직접(direct) 공고는 게시 7일 후 목록에서 자동 제외(외부 수집 공고는 유지).
  // 유료 광고는 Phase 2에서 featured/expiry로 연장 예정.
  const fresh = new Date(Date.now() - 7 * DAY_MS).toISOString();
  query = query.or(`source.neq.direct,posted_at.gte.${fresh}`);

  const kw = clean(keyword);
  if (kw) query = query.or(`title.ilike.%${kw}%,specialty.ilike.%${kw}%`);
  const loc = clean(location);
  if (loc) query = query.ilike("location", `%${loc}%`);
  if (filters.specialty) query = query.eq("specialty", filters.specialty);
  if (filters.employmentType) query = query.eq("employment_type", filters.employmentType);
  if (filters.days && filters.days > 0) query = query.gte("posted_at", new Date(Date.now() - filters.days * DAY_MS).toISOString());

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MyJobDetail = {
  id: string; title: string; specialty: string | null; location: string | null;
  employment_type: string | null; salary_text: string | null; benefits: string[];
  description: string | null; status: string; posted_at: string;
  hospital: { id: string; name: string } | null;
};

// 내가 소유한 병원의 공고 1건(수정·복제 prefill용). 소유자 검증 포함.
export async function getMyJob(id: string): Promise<MyJobDetail | null> {
  if (!UUID_RE.test(id)) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  type Raw = Omit<MyJobDetail, "hospital"> & { hospital: { id: string; name: string; owner_profile_id: string | null } | null };
  const { data } = await supabase
    .from("jobs")
    .select("id,title,specialty,location,employment_type,salary_text,benefits,description,status,posted_at,hospital:hospitals(id,name,owner_profile_id)")
    .eq("id", id)
    .maybeSingle()
    .returns<Raw>();
  if (!data || data.hospital?.owner_profile_id !== user.id) return null;
  return { ...data, hospital: data.hospital ? { id: data.hospital.id, name: data.hospital.name } : null };
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
