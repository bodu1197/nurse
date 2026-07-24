import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/data/user";
import { LIST_LIMIT } from "@/lib/data/applications";
import { FREE_LISTING_MS, todayKst } from "@/lib/date";
import type { JobStatus } from "@/lib/jobState";
import type { Database } from "@/types/database";

export type JobSource = "direct" | "worknet" | "public_data" | "partner" | "crawl";

type JobsRow = Database["public"]["Tables"]["jobs"]["Row"];

/**
 * 공고 화면이 쓰는 컬럼 — 타입과 select 문자열을 **이 배열 하나에서** 뽑는다.
 * 둘이 따로 있으면 여기서 컬럼을 빼도 컴파일은 통과하고 값만 undefined 가 된다.
 * 특히 status 는 노출 판정(isOpenToSeekers)이 쓰므로, 빠지면 전 공고가 조용히 '마감'이 된다.
 */
const JOB_FIELDS = [
  "id", "title", "status", "specialty", "location", "employment_type", "salary_text", "benefits",
  "description", "source", "external_url", "is_featured", "posted_at", "deadline", "featured_until",
  "recruit_count", "shift_type", "manager_name", "manager_phone", "apply_methods", "apply_email", "apply_detail",
  // 워크넷 등 명부에 없는 광고의 회사명(구인 광고 자체가 갖는 텍스트). 명부 연결(hospital) 없을 때 표시명으로 쓴다.
  "company_name",
] as const satisfies readonly (keyof JobsRow)[];

// source·status 는 생성 타입이 string 이라 실제 허용값(유니온)으로 좁혀 쓴다.
export type JobRow = Omit<Pick<JobsRow, (typeof JOB_FIELDS)[number]>, "source" | "status"> & {
  source: JobSource;
  status: JobStatus;
  hospital: { name: string; rating_avg: number; rating_count: number } | null;
};

export const SOURCE_LABEL: Record<JobSource, string> = {
  direct: "병원 직접",
  worknet: "워크넷",
  public_data: "공공데이터",
  partner: "제휴",
  crawl: "수집",
};

const SELECT = `${JOB_FIELDS.join(",")},hospital:hospitals(name,rating_avg,rating_count)`;

export const PER_PAGE = 20;

// 검색 필터를 URL 쿼리스트링으로 — 목록(/jobs)과 상세(/jobs/[id])가 같은 규칙으로 직렬화해야
// 카드→상세→사이드바로 넘어가도 필터가 안 끊긴다. 필터 키가 늘면 여기 한 곳만 고치면 된다.
export function jobFilterQs(f: { q?: string; l?: string; sido?: string; sigungu?: string; spec?: string; et?: string }, page?: number): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.l) p.set("l", f.l);
  if (f.sido) p.set("sido", f.sido);
  if (f.sigungu) p.set("sigungu", f.sigungu);
  if (f.spec) p.set("spec", f.spec);
  if (f.et) p.set("et", f.et);
  if (page && page > 1) p.set("page", String(page));
  return p.toString();
}

// 저장 목록에서 서버 권한으로 되살려도 되는 상태 — 한 번은 공개됐던 공고들.
// draft·hidden 은 한 번도 공개된 적이 없어 제목조차 보여주면 안 된다.
const REVIVABLE = ["closed", "expired"] as const satisfies readonly JobStatus[];

// PostgREST or 필터 주입 방지: %,(),쉼표 제거
const clean = (s: string) => s.replace(/[%,()]/g, "").trim();

export type JobFilters = { sido?: string; sigungu?: string; specialty?: string; employmentType?: string };

// 🗂 지역 계단 노드(도/시군구 + 건수) — nurse_job_sido_list / nurse_job_sigungu_list RPC 반환형.
export type JobRegionNode = { name: string; cnt: number };

// 도 목록(건수 포함). RPC 술어는 getJobs 와 동일(마감·direct 노출) → 드롭다운 건수 = 클릭 후 건수.
// cache(): 한 요청 안에서 중복 호출을 dedup(반환형은 database.ts Functions 로 이미 타입 지정 → 단언 불필요).
export const getJobSidoList = cache(async (): Promise<JobRegionNode[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("nurse_job_sido_list");
  if (error) console.error("getJobSidoList failed:", error.message);
  return data ?? [];
});
// 선택한 도의 시군구 목록. 시도 미선택이면 즉시 [](비용 0).
export const getJobSigunguList = cache(async (sido: string): Promise<JobRegionNode[]> => {
  if (!sido) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("nurse_job_sigungu_list", { p_sido: sido });
  if (error) console.error("getJobSigunguList failed:", error.message);
  return data ?? [];
});

// 관리자 테스트 공고(hospitals.is_test)를 여기서 걸러내지 않는 것은 의도된 결정이다.
// 숨기면 등록→광고→지원까지 실제 화면에서 확인할 방법이 없어 테스트 기능이 무용지물이 된다.
// 병원명이 "[테스트] …"로 시작해 목록·상세에서 사용자도 테스트임을 알아볼 수 있고,
// 테스트가 끝나면 해당 공고를 삭제하면 된다. (공고 등록 시 병원 검색에서는 계속 제외 — /api/hospitals/search)
// withCount=false: total(전체 개수)이 필요 없는 호출(사이드바 등)은 COUNT 스캔을 생략한다.
export async function getJobs(keyword: string, location: string, filters: JobFilters = {}, page = 1, withCount = true): Promise<{ jobs: JobRow[]; total: number }> {
  const supabase = await createClient();
  const from = (Math.max(1, page) - 1) * PER_PAGE;
  let query = supabase
    .from("jobs")
    .select(SELECT, withCount ? { count: "exact" } : undefined)
    .eq("status", "open")
    .order("featured_until", { ascending: false, nullsFirst: false })
    .order("posted_at", { ascending: false })
    .range(from, from + PER_PAGE - 1);

  // direct(병원 직접) 공고 노출 조건: (게시 7일 이내 무료) 또는 (유료 광고 featured_until 유효). 외부 수집 공고는 항상.
  // 무료 기간은 lib/date의 상수를 그대로 쓴다 — 화면(listingEnd)과 어긋나면 "보이는데 지원은 안 되는" 공고가 생긴다.
  const now = Date.now();
  const fresh = new Date(now - FREE_LISTING_MS).toISOString();
  const nowIso = new Date(now).toISOString();
  query = query.or(`source.neq.direct,posted_at.gte.${fresh},featured_until.gte.${nowIso}`);
  // 마감일 도래 공고 비노출: 상시(null) 또는 마감일(당일 포함)이 아직 안 지난 것만. deadline은 date라 KST 오늘로 비교.
  query = query.or(`deadline.is.null,deadline.gte.${todayKst(now)}`);

  const kw = clean(keyword);
  if (kw) query = query.or(`title.ilike.%${kw}%,specialty.ilike.%${kw}%`);
  const loc = clean(location);
  if (loc) query = query.ilike("location", `%${loc}%`);
  // 🗂 지역은 정규화 컬럼 eq(정확·인덱스). 🔴 시군구는 시도에 종속 — 시도 없이 걸면 시군구명이
  // 시도 간 중복이라('중구'가 여러 시도) 엉뚱한 지역을 긁는다. 시도 있을 때만 시군구를 적용한다.
  if (filters.sido) query = query.eq("sido", filters.sido);
  if (filters.sido && filters.sigungu) query = query.eq("sigungu", filters.sigungu);
  if (filters.specialty) query = query.eq("specialty", filters.specialty);
  if (filters.employmentType) query = query.eq("employment_type", filters.employmentType);

  const { data, count, error } = await query.returns<JobRow[]>();
  if (error) {
    console.error("getJobs failed:", error.message);
    return { jobs: [], total: 0 };
  }
  return { jobs: data ?? [], total: withCount ? (count ?? 0) : (data?.length ?? 0) };
}

// 같은 지역 다른 공고(상세 페이지 좌측 사이드바). 지역 키는 앞 2토큰("경기 성남시")으로 잡아
// 시/군 단위로 묶는다. 노출 규칙(마감·유료기간 등)은 getJobs를 그대로 재사용해 목록과 어긋나지 않게 한다.
export function regionOf(location: string | null): string {
  return (location ?? "").trim().split(/\s+/).slice(0, 2).join(" ");
}
// 같은 지역 공고를 우선 보여주되, 없으면(외진 지역·그 지역 단일 공고) 최근 공고로 채워 왼쪽이 절대 비지 않게 한다.
// sameRegion=false면 제목에 지역명을 쓰지 않는다.
export async function getNearbyJobs(location: string | null, excludeId: string, limit = 8): Promise<{ jobs: JobRow[]; sameRegion: boolean }> {
  const region = regionOf(location);
  if (region) {
    const { jobs } = await getJobs("", region, {}, 1, false); // 총개수 불필요 → COUNT 생략
    const same = jobs.filter((j) => j.id !== excludeId);
    if (same.length > 0) return { jobs: same.slice(0, limit), sameRegion: true };
  }
  // 지역 매칭이 없으면 최근 공고로 폴백.
  const { jobs } = await getJobs("", "", {}, 1, false);
  return { jobs: jobs.filter((j) => j.id !== excludeId).slice(0, limit), sameRegion: false };
}

export type MyJob = { id: string; title: string; status: JobStatus; posted_at: string; featured_until: string | null; applicant_count: number };

// 병원 — 내가 소유한 병원의 공고 목록 + 지원자 수.
export async function getMyJobs(): Promise<MyJob[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data: hosps } = await supabase.from("hospitals").select("id").eq("owner_profile_id", user.id);
  const ids = (hosps ?? []).map((h) => h.id);
  if (ids.length === 0) return [];

  type Raw = { id: string; title: string; status: JobStatus; posted_at: string; featured_until: string | null; applications: { count: number }[] };
  const { data } = await supabase
    .from("jobs")
    .select("id,title,status,posted_at,featured_until,applications(count)")
    .in("hospital_id", ids)
    .order("posted_at", { ascending: false })
    .returns<Raw[]>();
  return (data ?? []).map((j) => ({
    id: j.id, title: j.title, status: j.status, posted_at: j.posted_at, featured_until: j.featured_until,
    applicant_count: j.applications?.[0]?.count ?? 0,
  }));
}

export type MyHospital = { id: string; name: string; region: string | null; address: string | null };

// 내 계정에 연결(claim)된 병원. 인증 시 1회 연결 → 이후 공고에 자동 사용(재입력 방지).
export async function getMyHospital(): Promise<MyHospital | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("hospitals").select("id,name,region,address").eq("owner_profile_id", user.id).limit(1);
  return data?.[0] ?? null;
}

// 병원 무료 게시권 잔여(병원당 7일×4). null=병원 없음.
export async function getMyFreeCredits(): Promise<number | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("hospitals").select("free_credits").eq("owner_profile_id", user.id).limit(1);
  return data?.[0]?.free_credits ?? null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MyJobDetail = {
  id: string; title: string; specialty: string | null; location: string | null;
  employment_type: string | null; salary_text: string | null; benefits: string[];
  description: string | null; status: JobStatus; posted_at: string;
  recruit_count: number | null; shift_type: string | null;
  manager_name: string | null; manager_phone: string | null;
  apply_methods: string[]; apply_email: string | null; apply_detail: string | null;
  hospital: { id: string; name: string } | null;
};

// 내가 소유한 병원의 공고 1건(수정·복제 prefill용). 소유자 검증 포함.
export async function getMyJob(id: string): Promise<MyJobDetail | null> {
  if (!UUID_RE.test(id)) return null;
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  type Raw = Omit<MyJobDetail, "hospital"> & { hospital: { id: string; name: string; owner_profile_id: string | null } | null };
  const { data } = await supabase
    .from("jobs")
    .select("id,title,specialty,location,employment_type,salary_text,benefits,description,status,posted_at,recruit_count,shift_type,manager_name,manager_phone,apply_methods,apply_email,apply_detail,hospital:hospitals(id,name,owner_profile_id)")
    .eq("id", id)
    .maybeSingle()
    .returns<Raw>();
  if (!data || data.hospital?.owner_profile_id !== user.id) return null;
  return { ...data, hospital: data.hospital ? { id: data.hospital.id, name: data.hospital.name } : null };
}

// 직전(가장 최근) 공고 — 새 공고 작성 시 템플릿 자동입력용.
export async function getMyLastJob(): Promise<MyJobDetail | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data: hosps } = await supabase.from("hospitals").select("id").eq("owner_profile_id", user.id);
  const ids = (hosps ?? []).map((h) => h.id);
  if (ids.length === 0) return null;
  type Raw = Omit<MyJobDetail, "hospital"> & { hospital: { id: string; name: string } | null };
  const { data } = await supabase
    .from("jobs")
    .select("id,title,specialty,location,employment_type,salary_text,benefits,description,status,posted_at,recruit_count,shift_type,manager_name,manager_phone,apply_methods,apply_email,apply_detail,hospital:hospitals(id,name)")
    .in("hospital_id", ids)
    .order("posted_at", { ascending: false })
    .limit(1)
    .maybeSingle()
    .returns<Raw>();
  return data ? { ...data, hospital: data.hospital } : null;
}

export type SavedSearch = { id: string; keyword: string | null; sido: string | null; sigungu: string | null; created_at: string };

// 마이페이지 카드 배지용 — 개수만.
export async function countSaved(): Promise<number> {
  const user = await getSessionUser();
  if (!user) return 0;
  const supabase = await createClient();
  const { count } = await supabase.from("saved_jobs").select("id", { count: "exact", head: true }).eq("profile_id", user.id);
  return count ?? 0;
}
export async function countSavedSearches(): Promise<number> {
  const user = await getSessionUser();
  if (!user) return 0;
  const supabase = await createClient();
  const { count } = await supabase.from("saved_searches").select("id", { count: "exact", head: true }).eq("profile_id", user.id);
  return count ?? 0;
}

export async function getMySavedSearches(): Promise<SavedSearch[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("saved_searches")
    .select("id,keyword,sido,sigungu,created_at")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .returns<SavedSearch[]>();
  return data ?? [];
}

// 저장한 공고 id 집합(목록/상세 '저장됨' 표시용).
export async function getSavedJobIds(jobIds: string[]): Promise<Set<string>> {
  if (jobIds.length === 0) return new Set();
  const user = await getSessionUser();
  if (!user) return new Set();
  const supabase = await createClient();
  const { data } = await supabase.from("saved_jobs").select("job_id").eq("profile_id", user.id).in("job_id", jobIds);
  return new Set((data ?? []).map((r) => r.job_id));
}

// 공고 단건(공개 상세 /jobs/[id]). RLS가 status='open'만 열어주므로 마감·삭제 공고는 null이다.
// 목록에 없는 공고(저장·지원 내역에서 들어온 링크)도 여기서는 정확히 그 공고를 연다.
// cache(): generateMetadata와 페이지 본문이 같은 공고를 부르므로 요청당 쿼리는 1회.
export const getPublicJob = cache(async (id: string): Promise<JobRow | null> => {
  // uuid가 아니면 Postgres가 22P02로 거절한다 — 잘못된 링크마다 에러 로그가 쌓이므로 먼저 막는다.
  if (!UUID_RE.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("jobs").select(SELECT).eq("id", id).eq("status", "open").limit(1).returns<JobRow[]>();
  if (error) {
    console.error("getPublicJob failed:", error.message);
    return null;
  }
  return data?.[0] ?? null;
});

// 저장한 공고 목록(/mypage/saved) — 저장 순서 유지.
// 병원이 공고를 마감하면 RLS(status='open')에 막혀 저장 목록에서 **통째로 사라진다**.
// 내가 저장해 둔 것이 소리 없이 없어지면 "내가 지운 건가?" 하게 되므로,
// 안 보이는 것만 서버 권한으로 한 번 더 찾아 '마감' 표시와 함께 남긴다.
// 지원 내역(getMyApplications)과 같은 방식이고, 범위도 **내가 저장한 id**로만 한정한다.
export async function getSavedJobs(): Promise<JobRow[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createClient();
  // 상한이 없으면 저장이 쌓였을 때 아래 .in("id", ids) 의 URL 이 너무 길어져 요청 자체가 거절되고,
  // 화면에는 "저장한 공고가 없습니다"가 뜬다(지금 고치려는 것과 똑같은 실패다).
  const { data: saved } = await supabase
    .from("saved_jobs").select("job_id").eq("profile_id", user.id)
    .order("created_at", { ascending: false }).limit(LIST_LIMIT);
  const ids = (saved ?? []).map((r) => r.job_id);
  if (ids.length === 0) return [];
  const { data } = await supabase.from("jobs").select(SELECT).in("id", ids).returns<JobRow[]>();
  const byId = new Map((data ?? []).map((j) => [j.id, j]));

  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    // closed·expired 만 되살린다 — draft·hidden 은 한 번도 공개된 적이 없어
    // (저장 자체가 불가능해야 하지만) 여기서 제목이 새어 나가면 안 된다.
    const { data: gone } = await createAdminClient()
      .from("jobs").select(SELECT).in("id", missing).in("status", REVIVABLE)
      .returns<JobRow[]>();
    (gone ?? []).forEach((j) => byId.set(j.id, j));
  }
  return ids.map((id) => byId.get(id)).filter((j): j is JobRow => !!j);
}
