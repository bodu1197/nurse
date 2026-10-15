import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type { JobCardData } from "@/components/JobCard";
import type { JobRegionNode } from "@/lib/data/jobs";
import { nearBox, type NearQuery } from "@/lib/location/bbox";

/**
 * 🧓 요양보호사·간병 공고 조회 — care_jobs 표(간호사 jobs 와 **별도**, 마이그레이션 20261016100000 주석).
 *
 * 홈 탭과 /care-jobs 목록이 같은 함수를 쓴다 — 홈에서 본 카드가 목록 첫 쪽과 어긋나지 않는다.
 * 유료·무료 광고 개념이 없어 정렬은 최신순 하나다(2차 키는 유일 키 — 쪽 경계 중복·누락 방지, jobs.ts LISTED_ORDER 와 같은 이유).
 */
export const CARE_PER_PAGE = 20;

type CareRow = Database["public"]["Tables"]["care_jobs"]["Row"];

// 카드가 읽는 컬럼만(jobs.ts JOB_FIELDS 와 같은 방식 — 타입과 select 를 한 배열에서 뽑는다).
const CARE_FIELDS = [
  "external_id", "title", "company_name", "location", "salary_text", "posted_at", "deadline", "external_url",
] as const satisfies readonly (keyof CareRow)[];

export type CareJob = Pick<CareRow, (typeof CARE_FIELDS)[number]>;

export async function getCareJobs(
  f: { sido?: string; sigungu?: string; near?: NearQuery } = {},
  page = 1,
  limit = CARE_PER_PAGE, // 홈 탭은 6장, 목록은 20장
): Promise<{ jobs: CareJob[]; total: number }> {
  const supabase = await createClient();
  const from = (Math.max(1, page) - 1) * limit;
  let query = supabase
    .from("care_jobs")
    .select(CARE_FIELDS.join(","), { count: "exact" })
    .order("posted_at", { ascending: false })
    .order("external_id", { ascending: false })
    .range(from, from + limit - 1);
  // 🗂 시군구는 시도에 종속 — 시도 없이 걸면 시도 간 중복 이름('중구')이 엉뚱한 지역을 긁는다(jobs.ts 와 같은 계약).
  if (f.sido) query = query.eq("sido", f.sido);
  if (f.sido && f.sigungu) query = query.eq("sigungu", f.sigungu);
  // 📍 내 주변 — 간호 목록(getJobs)과 같은 bounding-box(lib/location/bbox). 좌표는 크론이 채운다(care_jobs_geo_idx).
  if (f.near) {
    const b = nearBox(f.near);
    query = query.gte("lat", b.latMin).lte("lat", b.latMax).gte("lng", b.lngMin).lte("lng", b.lngMax);
  }
  const { data, count, error } = await query.returns<CareJob[]>();
  if (error) {
    console.error("getCareJobs failed:", error.message);
    return { jobs: [], total: 0 };
  }
  return { jobs: data ?? [], total: count ?? 0 };
}

/** 지역 계단 건수(시도 → 시군구). 시도를 안 주면 시도별. RPC 는 목록과 같은 표를 세므로 드롭다운 건수 = 클릭 후 건수. */
export async function getCareRegionList(sido = ""): Promise<JobRegionNode[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("care_job_region_list", { p_sido: sido });
  if (error) console.error("getCareRegionList failed:", error.message);
  return data ?? [];
}

/**
 * 목록 카드(components/JobCard)가 읽는 모양으로. 워크넷 수집분이라 간편지원 배지·광고 기간이 없다.
 * 기관명이 없으면 "기관 미상" — 카드의 기본값은 "병원 미상"인데 요양원·재가센터는 병원이 아니다(홈 카드와 같은 말).
 */
export const careToCard = (j: CareJob): JobCardData => ({
  id: j.external_id,
  title: j.title,
  location: j.location,
  salary_text: j.salary_text,
  company_name: j.company_name ?? "기관 미상",
  posted_at: j.posted_at,
  source: "worknet",
  deadline: j.deadline,
  featured_until: null,
  apply_methods: [],
  hospital: null,
});
