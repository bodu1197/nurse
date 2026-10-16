import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import type { JobCardData } from "@/components/JobCard";
import { LISTED_ORDER, type JobRegionNode, type JobSource } from "@/lib/data/jobs";
import { CARE_CATEGORIES } from "@/lib/jobTaxonomy";
import { CARE_DETAIL_DAILY_CAP, CARE_DETAIL_RETRY_MS, isCareJobId, needsCareDetail } from "@/lib/careSync";
import { fetchDetails, type WorknetDetail } from "@/lib/worknet";
import { nearBox, type NearQuery } from "@/lib/location/bbox";

/**
 * 🧓 요양보호사·간병 공고 조회 — 두 표를 합친다(오너 지시 2026-10-16 "똑같은 기능, 지원도 되게").
 *   · care_jobs — 워크넷 수집분(간호사 jobs 와 **별도**, 마이그레이션 20261016100000 주석). 상세는 /care-jobs/[id].
 *   · jobs — 기관이 직접 올린 공고 중 직종이 요양보호사·간병인인 것(CARE_CATEGORIES). 상세·저장·간편지원·광고는 /jobs/[id] 그대로.
 *
 * 홈 탭과 /care-jobs 목록이 같은 함수를 쓴다 — 홈에서 본 카드가 목록 첫 쪽과 어긋나지 않는다.
 * 수집분은 유료·무료 광고 개념이 없어 정렬이 최신순 하나다(2차 키는 유일 키 — 쪽 경계 중복·누락 방지, jobs.ts LISTED_ORDER 와 같은 이유).
 */
export const CARE_PER_PAGE = 20;

type CareRow = Database["public"]["Tables"]["care_jobs"]["Row"];
type JobsRow = Database["public"]["Tables"]["jobs"]["Row"];
type ListedRow = Database["public"]["Views"]["jobs_listed"]["Row"];

// 카드가 읽는 컬럼만(jobs.ts JOB_FIELDS 와 같은 방식 — 타입과 select 를 한 배열에서 뽑는다).
const CARE_FIELDS = [
  "external_id", "title", "company_name", "location", "salary_text", "posted_at", "deadline", "external_url",
] as const satisfies readonly (keyof CareRow)[];

export type CareJob = Pick<CareRow, (typeof CARE_FIELDS)[number]>;

export type CareFilters = { sido?: string; sigungu?: string; near?: NearQuery };

export async function getCareJobs(
  f: CareFilters = {},
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

// 직접 등록분 카드가 읽는 컬럼 — components/JobCard 의 JobCardData 와 같은 모양(hospital 은 조인).
// 뷰(jobs_listed)에도 있는 컬럼만 — 표에만 있는 컬럼을 적으면 컴파일은 통과하고 값만 undefined 가 된다.
const DIRECT_FIELDS = [
  "id", "title", "location", "salary_text", "company_name", "posted_at", "source", "deadline", "featured_until", "apply_methods",
] as const satisfies readonly (keyof JobsRow & keyof ListedRow)[];

export type CareDirectJob = Omit<Pick<JobsRow, (typeof DIRECT_FIELDS)[number]>, "source"> & {
  source: JobSource;
  hospital: { name: string } | null;
};

/**
 * 직접 등록분을 첫 쪽에 얹는 상한. ponytail: 쪽을 나누지 않는다 — 직접 등록은 몇 건 안 된다.
 * 넘기면 "총 N건"에 화면에서 닿을 수 없는 공고가 섞이므로 로그로 알리고(아래 warn), 그때 /jobs 처럼 쪽을 나눈다.
 */
const CARE_DIRECT_MAX = 50;

/**
 * 기관이 직접 올린 요양·간병 공고 — jobs_listed 에서 직종이 CARE_CATEGORIES 인 노출 중(is_live) 공고.
 * 정렬은 간호 목록과 같은 LISTED_ORDER(유료 → 무료 → 상급종합 → 최신) — 돈 낸 광고가 위에 서는 규칙이 목록마다 다르면 안 된다.
 * countOnly — 2쪽 이후는 카드를 안 그리고 건수만 합산하므로 행을 받지 않는다(head).
 * 지역·내 주변 필터는 getCareJobs 와 같은 계약(시군구는 시도에 종속, bbox 는 lib/location/bbox).
 */
export async function getCareDirectJobs(f: CareFilters = {}, countOnly = false, limit = CARE_DIRECT_MAX): Promise<{ jobs: CareDirectJob[]; total: number }> {
  const supabase = await createClient();
  let query = supabase
    .from("jobs_listed")
    // 건수만 받을 때는 조인·컬럼을 붙이지 않는다(head 라 행은 안 오지만 서버가 조인을 계산하지 않게).
    .select(countOnly ? "id" : `${DIRECT_FIELDS.join(",")},hospital:hospitals(name)`, { count: "exact", head: countOnly })
    .eq("is_live", true)
    .in("job_category", [...CARE_CATEGORIES]);
  for (const key of LISTED_ORDER) query = query.order(key, { ascending: false });
  query = query.limit(limit);
  if (f.sido) query = query.eq("sido", f.sido);
  if (f.sido && f.sigungu) query = query.eq("sigungu", f.sigungu);
  if (f.near) {
    const b = nearBox(f.near);
    query = query.gte("lat", b.latMin).lte("lat", b.latMax).gte("lng", b.lngMin).lte("lng", b.lngMax);
  }
  const { data, count, error } = await query.returns<CareDirectJob[]>();
  if (error) {
    console.error("getCareDirectJobs failed:", error.message);
    return { jobs: [], total: 0 };
  }
  const total = count ?? 0;
  // 홈(limit=6)은 원래 일부만 그리는 자리라 경고 대상이 아니다 — 목록 첫 쪽(기본 상한)에서 넘칠 때만 알린다.
  if (limit === CARE_DIRECT_MAX && total > limit) console.warn(`[care] 직접 등록 요양·간병 공고 ${total}건 > 첫 쪽 상한 ${limit} — 쪽 나누기가 필요하다(getCareDirectJobs)`);
  return { jobs: data ?? [], total };
}

/** 지역 계단 건수(시도 → 시군구). 시도를 안 주면 시도별. RPC 는 목록과 같은 표를 세므로 드롭다운 건수 = 클릭 후 건수. */
export async function getCareRegionList(sido = ""): Promise<JobRegionNode[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("care_job_region_list", { p_sido: sido });
  if (error) console.error("getCareRegionList failed:", error.message);
  return data ?? [];
}

// 상세 페이지가 읽는 컬럼(좌표·수집 시각은 화면에 안 쓴다).
const DETAIL_FIELDS = [
  ...CARE_FIELDS, "employment_type", "description", "recruit_count", "shift_type", "benefits", "apply_detail",
  "manager_name", "manager_phone", "detail_fetched_at",
] as const satisfies readonly (keyof CareRow)[];

export type CareJobDetail = Pick<CareRow, (typeof DETAIL_FIELDS)[number]>;

/**
 * 요양·간병 공고 한 건(/care-jobs/[id]) — 저장된 값만. 워크넷에서 내려가 지워진 공고는 null → 404.
 * 본문·연락처 보강은 withCareDetail 이 따로 한다 — 제목·기관은 바로 그리고 느린 워크넷 왕복은 뒤따라 오게(Suspense).
 * cache(): generateMetadata 와 본문이 같은 공고를 부르므로 요청당 조회는 1회.
 */
export const getCareJob = cache(async (id: string): Promise<CareJobDetail | null> => {
  if (!isCareJobId(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("care_jobs").select(DETAIL_FIELDS.join(",")).eq("external_id", id).maybeSingle().returns<CareJobDetail | null>();
  if (error) {
    console.error("getCareJob failed:", error.message);
    return null;
  }
  return data;
});

// 사람이 기다리는 자리라 크론(15초)보다 짧게 끊는다. 워크넷 상세는 보통 1초 안팎(실측 2026-10-16: 첫 방문 3.0초 중 DB 포함).
const CARE_DETAIL_TIMEOUT_MS = 5000;

/**
 * 본문·연락처 보강 — 상세 페이지의 스트리밍 블록이 부른다.
 *
 * 🔴 워크넷 상세 API(210D01)는 **그 공고가 열릴 때** 한 번 부른다(마이그레이션 20261016140000 주석). 1만 건을 크론으로 미리
 *    받지 않는 이유 — 열리는 공고는 그중 일부고, 상세 API 는 공고당 한 번씩 부르는 비용이다. 봇(allowFetch=false)에게는 묻지 않는다 —
 *    noindex 페이지 1만 장을 긁는 크롤러 때문에 API 1만 번을 쓸 이유가 없다(저장된 값만 그린다).
 * 호출 전에 세 겹으로 막는다(이 키는 간호 크론과 나눠 쓴다 — 한도를 태우면 간호 상세 보강까지 멈춘다):
 *   ① needsCareDetail — 본문이 있으면 안 묻고, 실패한 행은 하루 뒤에만(detail_fetched_at 은 **실패해도 찍는다**).
 *   ② 하루 전체 상한(CARE_DETAIL_DAILY_CAP) — 최근 24시간에 표식이 찍힌 행 수 = 시도한 호출 수.
 *   ③ 조건부 update 로 **먼저 표식을 찍어 이 행을 잡는다** — 같은 공고를 동시에 연 요청끼리, 또 저장이 실패한 뒤 재방문이
 *      각자 또 부르지 않는다(hospitals/search 의 "먼저 적고 나서 부른다"와 같은 원칙).
 * 저장 실패·키 누락은 로그만 남기고 화면은 받은 값으로 그린다(상세 한 장 때문에 500 을 내지 않는다).
 * 마감일은 상세 값으로 덮지 않는다 — 크론(sync-care)이 매 수집마다 목록 값으로 되돌려 하루 두 번 바뀐다.
 */
export async function withCareDetail(row: CareJobDetail, allowFetch: boolean): Promise<CareJobDetail> {
  if (!allowFetch || !needsCareDetail(row, Date.now())) return row;
  const id = row.external_id;
  const fail = (what: string, e: unknown) => console.error(`withCareDetail ${what} failed:`, e instanceof Error ? e.message : e);
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient(); // 환경변수가 없으면 던진다 — 상세 한 장 때문에 500 을 내지 않는다
  } catch (e) {
    fail("admin", e);
    return row;
  }
  const nowIso = new Date().toISOString();
  const since = new Date(Date.now() - CARE_DETAIL_RETRY_MS).toISOString();

  // ② 전체 상한. 셀 수 없으면 안 부른다(열어 두면 한도를 지키려던 장치가 한도를 태우는 쪽으로 실패한다 — collectorLog 와 같은 선택).
  const { count, error: capErr } = await admin
    .from("care_jobs").select("external_id", { count: "exact", head: true }).gte("detail_fetched_at", since);
  if (capErr) { fail("cap", capErr.message); return row; }
  if ((count ?? 0) >= CARE_DETAIL_DAILY_CAP) {
    console.warn(`[care] 상세 상한 — 최근 24시간 ${count}/${CARE_DETAIL_DAILY_CAP}. 저장된 값만 그린다.`);
    return row;
  }

  // ③ 행 잡기 — 아직 아무도 안 물었거나(null), 본문이 비어 있고 마지막 시도가 하루 넘은 행만 내가 가져간다.
  //    쓰기는 service_role(care_jobs 는 쓰기 정책이 없다 — 크론과 같은 길). 범위는 이 행 하나·고정 컬럼(lib/supabase/admin 주석 4).
  const { data: claimed, error: claimErr } = await admin
    .from("care_jobs").update({ detail_fetched_at: nowIso }).eq("external_id", id)
    .or(`detail_fetched_at.is.null,and(description.is.null,detail_fetched_at.lt.${since})`)
    .select("external_id");
  if (claimErr) { fail("claim", claimErr.message); return row; }
  if (!claimed?.length) return row; // 다른 요청이 먼저 잡았다 — 그쪽이 채운다

  let d: WorknetDetail | undefined;
  try {
    // infoSvc 는 저장하지 않았다 — 원문 링크가 전부 infoTypeCd=VALIDATION 이라(크론 실측) 기본값으로 충분하다.
    d = (await fetchDetails([{ authNo: id, infoSvc: "VALIDATION" }], CARE_DETAIL_TIMEOUT_MS)).get(id);
  } catch (e) {
    fail("fetch", e); // WORKNET_RECRUIT_API_KEY 누락은 fetchDetail 의 try 밖에서 던진다
  }
  if (!d) {
    // fetchDetail 은 원인을 삼키고 null 을 준다(타임아웃·원문 없음·한도) — 여기서라도 어느 공고인지 남긴다. 표식은 이미 찍혔다.
    console.warn(`[care] 상세 없음 ${id} — 마감으로 내려갔거나 워크넷 장애. 하루 뒤 다시 묻는다.`);
    return { ...row, detail_fetched_at: nowIso };
  }
  const patch = {
    description: d.description,
    recruit_count: d.recruitCount,
    shift_type: d.shiftType,
    benefits: d.benefits,
    apply_detail: d.applyDetail,
    manager_name: d.managerName,
    manager_phone: d.managerPhone,
  };
  const { error } = await admin.from("care_jobs").update(patch).eq("external_id", id);
  if (error) fail("save", error.message); // 받은 값은 이번 화면에 그대로 쓴다
  return { ...row, ...patch, detail_fetched_at: nowIso };
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
