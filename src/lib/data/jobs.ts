import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/data/user";
import { LIST_LIMIT } from "@/lib/data/applications";

import type { JobStatus } from "@/lib/jobState";
import { DEPT_ANY } from "@/lib/resumeOptions";
import type { Database } from "@/types/database";

export type JobSource = "direct" | "worknet" | "public_data" | "partner" | "crawl";

type JobsRow = Database["public"]["Tables"]["jobs"]["Row"];

/**
 * 공고 화면이 쓰는 컬럼 — 타입과 select 문자열을 **이 배열 하나에서** 뽑는다.
 * 둘이 따로 있으면 여기서 컬럼을 빼도 컴파일은 통과하고 값만 undefined 가 된다.
 * 특히 status 는 노출 판정(isOpenToSeekers)이 쓰므로, 빠지면 전 공고가 조용히 '마감'이 된다.
 */
const JOB_FIELDS = [
  "id", "title", "status", "specialty", "facility_type", "job_category", "location", "employment_type", "salary_text", "benefits",
  "description", "source", "external_url", "is_featured", "posted_at", "deadline", "featured_until",
  "recruit_count", "shift_type", "manager_name", "manager_phone", "apply_methods", "apply_email", "apply_detail",
  // 워크넷 등 명부에 없는 광고의 회사명(구인 광고 자체가 갖는 텍스트). 명부 연결(hospital) 없을 때 표시명으로 쓴다.
  "company_name",
  // 이 공고가 내 병원 것인가 판정용(공개 상세에서 '내 공고' 안내를 띄운다). hospitals 는 공개 명부라 FK 자체는 비밀이 아니다.
  "hospital_id",
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
export function jobFilterQs(
  f: { q?: string; l?: string; sido?: string; sigungu?: string; spec?: string; fac?: string; cat?: string; et?: string; lat?: string; lng?: string; r?: string },
  page?: number,
): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.l) p.set("l", f.l);
  if (f.sido) p.set("sido", f.sido);
  if (f.sigungu) p.set("sigungu", f.sigungu);
  if (f.spec) p.set("spec", f.spec);
  if (f.fac) p.set("fac", f.fac);
  if (f.cat) p.set("cat", f.cat);
  if (f.et) p.set("et", f.et);
  // 내 주변 필터 — 켜져 있는 동안은 칩·페이지 이동에도 따라붙는다(꺼짐은 JobNearMeButton의 "해제"만).
  if (f.lat && f.lng) {
    p.set("lat", f.lat);
    p.set("lng", f.lng);
    if (f.r) p.set("r", f.r); // 반경은 좌표 있을 때만 의미가 있다
  }
  if (page && page > 1) p.set("page", String(page));
  return p.toString();
}

// 저장 목록에서 서버 권한으로 되살려도 되는 상태 — 한 번은 공개됐던 공고들.
// draft·hidden 은 한 번도 공개된 적이 없어 제목조차 보여주면 안 된다.
const REVIVABLE = ["closed", "expired"] as const satisfies readonly JobStatus[];

// PostgREST or 필터 주입 방지: %,(),쉼표 제거.
// 🔴 `*` 도 지운다. PostgREST 는 ilike 값의 `*` 를 `%` 로 바꿔주지만(실측: "%성형*%" = "%성형%"),
//    칩 집계 RPC 는 순수 SQL ilike 라 `*` 를 리터럴로 본다. 안 지우면 `?q=성형*` 에서
//    목록엔 5건이 나오는데 칩은 전부 0건이 되어 칩 줄이 통째로 사라진다.
const clean = (s: string) => s.replace(/[%,()*]/g, "").trim();

/**
 * 🗂 "미분류" 를 고르는 URL 값.
 *
 * 왜 필요한가(오너 지적 2026-07-29): 치과 결과가 9건인데 진료과 칩 합은 2, 직종은 8이었다.
 * 값이 없는 공고가 칩에서 통째로 빠져 **화면이 스스로 모순**됐다("방에 공이 10개면 선반 5 +
 * 서랍 3 + 바닥 2 로 합이 맞아야 한다"). 워크넷 공고는 진료과가 원래 없는 게 정상이라 이 몫이
 * 전체의 83%다 — 숨길 크기가 아니다.
 *
 * 값 자체가 될 수 없는 문자열을 쓴다(진료과·기관종별·직종 어느 목록에도 밑줄로 시작하는 값이 없다).
 */
export const UNSET = "_none";

export type JobFilters = {
  sido?: string; sigungu?: string; specialty?: string; facilityType?: string; jobCategory?: string; employmentType?: string;
  near?: { lat: number; lng: number; radiusM: number };
};

// 🗂 지역 계단 노드(도/시군구 + 건수) — nurse_job_sido_list / nurse_job_sigungu_list RPC 반환형.
export type JobRegionNode = { name: string; cnt: number };

// 도 목록(건수 포함). RPC 술어는 getJobs 와 동일(마감·direct 노출) → 드롭다운 건수 = 클릭 후 건수.
// cache() 는 안 쓴다 — 필터 객체를 받게 되면서 참조 비교라 히트하지 않는다(getJobFacets 와 같은 이유).
// 🔴 칩과 같은 규칙으로 **지금 걸린 필터 안에서** 센다. 안 그러면 같은 화면에서 기준이 둘로
//    갈린다 — 요양원·주간보호를 고른 상태에서 드롭다운은 "경기도 360" 인데 실제는 265건이었다.
//    지역 축은 자기 자신을 뺀다(고른 지역만 남으면 다른 지역으로 갈아탈 수 없다).
type RegionFilters = Omit<JobFilters, "sido" | "sigungu"> & { keyword?: string; location?: string };
const regionArgs = (f: RegionFilters) => ({
  p_specialty: f.specialty ?? "",
  p_facility: f.facilityType ?? "",
  p_category: f.jobCategory ?? "",
  p_employment: f.employmentType ?? "",
  p_keyword: f.keyword ? clean(f.keyword) : "",
  p_location: f.location ? clean(f.location) : "",
});

export async function getJobSidoList(f: RegionFilters = {}): Promise<JobRegionNode[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("nurse_job_sido_list", regionArgs(f));
  if (error) console.error("getJobSidoList failed:", error.message);
  return data ?? [];
}
// 선택한 도의 시군구 목록. 시도 미선택이면 즉시 [](비용 0).
export async function getJobSigunguList(sido: string, f: RegionFilters = {}): Promise<JobRegionNode[]> {
  if (!sido) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("nurse_job_sigungu_list", { p_sido: sido, ...regionArgs(f) });
  if (error) console.error("getJobSigunguList failed:", error.message);
  return data ?? [];
}

/**
 * 🗂 진료과·기관종별·직종 칩 — **공고가 있는 것만** 많은 순. 인재 칩(getTalentFacets)과 같은 사고방식이다.
 *
 * 전에는 고정 목록(JOB_SPECIALTIES 9개)을 통째로 뿌렸다. 그래서 —
 *   · 응급실·요양병원·마취과·투석실 칩은 자체 광고가 0건인데도 그려졌다(눌러도 빈 화면).
 *   · 반대로 내과·안과·정형외과 공고는 값이 있는데 칩이 없어 **73%가 검색되지 않았다**.
 * 한 번의 RPC 로 셋 다 받는다(따로 부르면 같은 행을 세 번 훑는다).
 */
// cache() 로 감싸지 않는다: React cache 는 인자를 **참조로** 비교해서, 매번 새로 만드는 객체
// 리터럴을 넘기는 이 함수에서는 절대 히트하지 않는다(실측). 게다가 한 요청에 한 번만 부른다 —
// 감싸두면 "중복 호출이 합쳐진다"고 잘못 읽히기만 한다.
export async function getJobFacets(f: JobFilters & { keyword?: string; location?: string } = {}): Promise<{
  facilities: JobRegionNode[]; categories: JobRegionNode[];
}> {
  const supabase = await createClient();
  // 🔴 지금 걸린 필터를 그대로 넘긴다. 안 넘기면 '요양원·주간보호'(652건)를 골라도 진료과 칩이
  //    26개 전부 뜨는데, 그 안에 실제로 있는 건 9개뿐이라 나머지는 눌러도 빈 화면이다(실측).
  //    RPC 는 축마다 **자기 자신을 뺀** 나머지로 세므로, 고른 축 안에서 다른 값으로 갈아탈 수 있다.
  const { data, error } = await supabase.rpc("nurse_job_facet_list", {
    p_sido: f.sido ?? "",
    p_sigungu: f.sigungu ?? "",
    // UNSET 은 RPC 에 그대로 넘긴다. RPC 의 nurse_axis_match 가 '_none' 을 "그 축이 비어 있는 행"
    // 으로 읽으므로(getJobs 의 .is(col, null) 과 같은 뜻), 미분류를 고른 채 다른 축을 봐도 숫자가 맞다.
    p_specialty: f.specialty ?? "",
    p_facility: f.facilityType ?? "",
    p_category: f.jobCategory ?? "",
    p_employment: f.employmentType ?? "",
    p_keyword: f.keyword ? clean(f.keyword) : "",
    // 홈 검색폼이 넣는 지역 텍스트(?l=성남). 이것도 getJobs 가 location ilike 로 거는데
    // 여기 안 넘기면 "의원 70" 이라 해놓고 눌렀을 때 더 적게 나온다.
    p_location: f.location ? clean(f.location) : "",
  });
  if (error) console.error("getJobFacets failed:", error.message);
  const rows = data ?? [];
  // RPC 는 "값 없음" 을 빈 이름('')으로 내려준다 → URL 에 실을 수 있는 센티넬로 바꾼다.
  const pick = (kind: string) =>
    tailLast(rows.filter((r) => r.kind === kind).map(({ name, cnt }) => ({ name: name || UNSET, cnt })));
  // 진료과는 칩으로 안 그린다(오너 결정 2026-07-29) — 검색어가 그 역할을 한다.
  // RPC 는 여전히 department 를 내려주지만 여기서 버린다: 되살릴 때 RPC 를 안 건드려도 되고,
  // 이미 materialize 된 CTE 위의 group by 하나라 비용이 없다.
  return { facilities: pick("facility"), categories: pick("category") };
}

/**
 * "기타"류는 공고 수가 많아도 **맨 뒤**로 보낸다 — 인재 칩과 같은 규칙(lib/data/talent.ts).
 * 기타가 내과·정형외과보다 앞에 오면 목록이 이상해 보인다.
 * sort 는 안정 정렬이라 같은 무리 안에서는 RPC 가 준 공고 수 내림차순이 그대로 유지된다.
 * 인재 칩(talent.ts)과 달리 "부서무관"이 하나 더 있는 이유: 그건 진료과를 안 가린다는 뜻이라
 * 진료과를 좁히러 온 사람에게 맨 앞에 있으면 방해만 된다(이력서 쪽에는 이 값이 칩으로 안 뜬다).
 */
// 미지정도 맨 뒤로 — 고르러 온 사람에게 앞자리를 내줄 이유가 없다.
const TAIL_LAST = new Set<string>(["기타", "의료기타", DEPT_ANY, UNSET]);
const tailLast = (rows: JobRegionNode[]): JobRegionNode[] =>
  [...rows].sort((a, b) => Number(TAIL_LAST.has(a.name)) - Number(TAIL_LAST.has(b.name)));

/**
 * 🗂 **"지금 구직자에게 보이는 공고인가"의 단일 정의는 DB 에 있다** — `jobs_listed.is_live`
 *    (마이그레이션 20260805100000). 앱은 `.eq("is_live", true)` 로 **읽기만** 한다.
 *
 * 왜 이렇게 바꿨나(오너 지적 2026-08-05: "매번 수동으로 맞춰주는 게 바른 방법이냐?"):
 * 같은 규칙이 관리자 대시보드 RPC · 공고관리 목록 · 여기 · isOpenToSeekers 네 곳에 손으로
 * 적혀 있었고, 그래서 **대시보드는 "게시중 44", 공고관리는 "노출중 40"** 을 동시에 보여줬다.
 * 이제 규칙을 바꿀 일이 생기면 그 마이그레이션 파일 하나만 고친다.
 *
 * 🔴 규칙을 여기 다시 적지 말 것. 복사하는 순간 다시 네 벌이 된다.
 */
const LIVE = "is_live" as const;

// 관리자 테스트 공고(hospitals.is_test)를 여기서 걸러내지 않는 것은 의도된 결정이다.
// 숨기면 등록→광고→지원까지 실제 화면에서 확인할 방법이 없어 테스트 기능이 무용지물이 된다.
// 병원명이 "[테스트] …"로 시작해 목록·상세에서 사용자도 테스트임을 알아볼 수 있고,
// 테스트가 끝나면 해당 공고를 삭제하면 된다. (공고 등록 시 병원 검색에서는 계속 제외 — /api/hospitals/search)
// withCount=false: total(전체 개수)이 필요 없는 호출(사이드바 등)은 COUNT 스캔을 생략한다.
export async function getJobs(keyword: string, location: string, filters: JobFilters = {}, page = 1, withCount = true): Promise<{ jobs: JobRow[]; total: number }> {
  const supabase = await createClient();
  const from = (Math.max(1, page) - 1) * PER_PAGE;
  // 🔴 jobs 가 아니라 jobs_listed 뷰다. 정렬 키를 두 질문으로 나누기 위한 것 —
  //    ① 광고인가(ad_live) ② 광고끼리는 무슨 순서인가(posted_at).
  //    전에는 featured_until 하나로 둘 다 하려다 보니 **종료일이 먼 쪽이 항상 1등**이었다:
  //    4주를 산 병원이 4주 내내 최상단이고, 뒤에 1주를 산 병원은 방금 결제해도 계속 2등.
  //    posted_at 은 activateAdOrder 가 광고를 켤 때 갱신하므로 곧 "광고를 켠 시각"이다.
  let query = supabase
    .from("jobs_listed")
    .select(SELECT, withCount ? { count: "exact" } : undefined)
    // 노출 판정은 뷰가 한다(is_live) — status·무료기간·광고기간·마감일을 그 안에서 함께 본다.
    .eq(LIVE, true)
    .order("ad_live", { ascending: false })
    .order("posted_at", { ascending: false })
    .range(from, from + PER_PAGE - 1);

  const kw = clean(keyword);
  // 🔴 기관 종별·직종도 함께 본다. 진료과 어휘가 바뀌면서 '요양병원'이 specialty 에서 facility_type
  //    으로 옮겨갔는데, 여기가 specialty 만 보면 홈에서 홍보 중인 인기 검색어(POPULAR_SEARCHES 의
  //    "요양병원")가 워크넷 공고 47% 를 통째로 놓친다.
  if (kw) query = query.or(
    `title.ilike.%${kw}%,specialty.ilike.%${kw}%,facility_type.ilike.%${kw}%,job_category.ilike.%${kw}%`,
  );
  const loc = clean(location);
  if (loc) query = query.ilike("location", `%${loc}%`);
  // 🗂 지역은 정규화 컬럼 eq(정확·인덱스). 🔴 시군구는 시도에 종속 — 시도 없이 걸면 시군구명이
  // 시도 간 중복이라('중구'가 여러 시도) 엉뚱한 지역을 긁는다. 시도 있을 때만 시군구를 적용한다.
  if (filters.sido) query = query.eq("sido", filters.sido);
  if (filters.sido && filters.sigungu) query = query.eq("sigungu", filters.sigungu);
  // 세 축은 서로 독립이다 — 진료과 ∧ 기관 종별 ∧ 직종. "의원의 내과 간호조무사"처럼 겹쳐 걸 수 있다.
  // UNSET 이면 "그 축이 비어 있는 공고" 를 고른 것이다(미분류 칩) → is null 로 건다.
  const axis = (col: "specialty" | "facility_type" | "job_category" | "employment_type", v: string | undefined) => {
    if (!v) return;
    query = v === UNSET ? query.is(col, null) : query.eq(col, v);
  };
  axis("specialty", filters.specialty);
  axis("facility_type", filters.facilityType);
  axis("job_category", filters.jobCategory);
  // 근무형태도 같은 헬퍼를 쓴다. 여기만 .eq() 로 두면 ?et=_none 에서 목록은 0건인데
  // 칩·지역 드롭다운은 N건이 되어(RPC 는 _none 을 is null 로 읽는다) 화면이 어긋난다.
  axis("employment_type", filters.employmentType);
  // 📍 내 주변 — talent(applyJobFilters)와 동일한 bounding-box(정사각형 근사). 원(하버사인) 대신
  // box 는 .gte/.lte 로 인덱스(jobs_geo_idx) 범위 스캔이 가능하고, region 텍스트 일치의 시(市)
  // 모호성(서울/부산 중구 혼재)도 없다. 거리순 정렬은 하지 않는다 — 반경 안이냐만 거른다.
  if (filters.near) {
    const KM_PER_DEG_LAT = 111.32; // 위도 1도 ~ 111.32km(경도는 위도에 따라 cos 보정)
    const radiusKm = filters.near.radiusM / 1000;
    const dLat = radiusKm / KM_PER_DEG_LAT;
    const cosLat = Math.max(0.01, Math.cos((filters.near.lat * Math.PI) / 180));
    const dLng = radiusKm / (KM_PER_DEG_LAT * cosLat);
    query = query
      .gte("lat", filters.near.lat - dLat).lte("lat", filters.near.lat + dLat)
      .gte("lng", filters.near.lng - dLng).lte("lng", filters.near.lng + dLng);
  }

  const { data, count, error } = await query.returns<JobRow[]>();
  if (error) {
    console.error("getJobs failed:", error.message);
    return { jobs: [], total: 0 };
  }
  return { jobs: data ?? [], total: withCount ? (count ?? 0) : (data?.length ?? 0) };
}

/**
 * 자동매치 후보가 쓰는 컬럼 — **목록용 SELECT 와 따로 둔다.**
 *
 * 🔴 `${SELECT}` 를 그대로 쓰면 description·benefits·apply_detail·manager_phone 같은 장문 컬럼까지
 *    후보 전건(최악 1,344행)을 매 요청마다 끌어온다. 이 화면의 카드가 실제로 읽는 것은 아래 12개뿐이고,
 *    나머지 4개(sido·sigungu·specialty·job_category)는 매칭 판정에만 쓴다.
 * 🔒 카드 표시에 필요한 것을 빼면 화면이 조용히 빈칸이 된다 — MatchCard(app/match/page.tsx)와 함께 볼 것.
 */
const MATCH_FIELDS = [
  // 카드 표시(components/JobCard 가 읽는 값 — apply_methods 는 '간편지원' 배지 판정에 쓴다)
  "id", "title", "location", "salary_text", "company_name", "posted_at", "source", "deadline", "featured_until", "apply_methods",
  // 매칭 판정(lib/match 의 JobFacts)
  "sido", "sigungu", "specialty", "job_category", "employment_type",
] as const satisfies readonly (keyof JobsRow)[];

const MATCH_SELECT = `${MATCH_FIELDS.join(",")},hospital:hospitals(name)`;

/** 자동매치 후보 한 건. 목록용 JobRow 와 달리 이 화면이 쓰는 것만 담는다. */
export type MatchJob = Pick<JobsRow, (typeof MATCH_FIELDS)[number]> & {
  source: JobSource;
  hospital: { name: string } | null;
};

/**
 * 🤖 AI 자동매치 후보 — **시도만 SQL 로 좁히고** 나머지 축은 앱(lib/match)이 판정한다.
 *
 * 🔴 진료과·직종까지 SQL 로 걸면 안 된다. 공고 1,344건 중 진료과가 있는 건 288건(21%)뿐이라
 *    (워크넷 공고는 진료과 개념이 원래 없다 — jobTaxonomy 참고) 후보가 통째로 사라진다.
 *    넓게 가져와 **일치 개수로 줄을 세운다**(등급으로 자르지 않는다 — 오너 확정 2026-08-05).
 * 🔴 급여는 자유 텍스트라 SQL 로 비교할 수 없다. 이것도 앱에서 판정한다.
 * 🔒 노출 판정은 목록과 **같은 뷰 컬럼(is_live)** — 어긋나면 매치를 눌렀을 때 404 가 된다.
 */
export async function getMatchCandidates(sidoIn: readonly string[]): Promise<MatchJob[]> {
  if (sidoIn.length === 0) return []; // 지역이 없으면 전국이 나온다 — "내 조건"이 거짓말이 된다
  const supabase = await createClient();
  // 🔴 PostgREST 는 max_rows(1000)에서 **조용히 자른다**(.limit() 으로 못 넘는다 — 사이트맵과 같은 함정).
  //    지금은 전국 공고가 1,344건이라 한두 쪽이면 끝나지만, 늘어나도 안 잘리도록 이어 받는다.
  const PAGE = 1000;
  const MAX = 5000; // 한 요청이 수만 행을 메모리로 끌어와 페이지가 죽는 것만 막는 상한
  const out: MatchJob[] = [];
  for (let from = 0; from < MAX; from += PAGE) {
    const { data, error } = await supabase
      .from("jobs_listed")
      .select(MATCH_SELECT)
      .eq(LIVE, true)
      .in("sido", [...sidoIn])
      .order("ad_live", { ascending: false })
      .order("posted_at", { ascending: false })
      // 🔴 유일 키를 마지막 정렬 키로 둔다. 페이지마다 별개 쿼리라 동률(워크넷 일괄수집분은
      //    posted_at 이 같은 행이 수백 건이다)이 있으면 1000행 경계에서 **행이 중복되거나 누락된다**
      //    — 중복되면 화면의 key 도 깨진다. getSitemapTalent 가 같은 이유로 2차 키를 갖고 있다.
      .order("id", { ascending: false })
      .range(from, from + PAGE - 1)
      .returns<MatchJob[]>();
    if (error) {
      console.error("getMatchCandidates failed:", error.message);
      break;
    }
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export type AdConditions = { specialties: string[]; sidos: string[]; count: number };

/**
 * 🤖 자동매치(병원 쪽) — **내 병원의 노출 중인 공고**에서 인재를 고를 조건을 뽑는다.
 *
 * 🔒 여기서 유료 여부를 다시 따지지 않는다. **볼 자격이 있는가**는 getMembership().canViewTalent
 *    (= RLS 의 is_talent_advertiser())가 이미 판정했고, 이 함수는 그 다음 질문인 **무슨 조건으로
 *    고를까**에만 답한다. 결제 판정을 여기에 한 벌 더 쓰면 둘이 갈라져, 한쪽만 고쳤을 때
 *    "화면은 열리는데 목록은 비는" 상태가 된다(membership.ts 가 같은 이유로 RPC 를 재사용한다).
 * 🔴 "노출 중" 판정은 **목록과 같은 뷰 컬럼(is_live)** 이다. 전에는 여기만 `featured_until > now` 를
 *    손으로 적었는데, 그러면 (가) 무료 기간(게시 7일) 중인 공고의 조건이 통째로 빠지고
 *    (나) 마감일이 지난 광고 공고의 조건은 남아, 화면이 말하는 "노출 중인 공고 N건" 과 어긋났다.
 * 🔴 노출 중인 공고 **전건**의 조건을 겹쳐 쓴다 — 첫 건만 보면 나머지 공고에 맞는 인재가 조용히 사라진다.
 */
export async function getMyAdConditions(): Promise<AdConditions> {
  const empty: AdConditions = { specialties: [], sidos: [], count: 0 };
  const ids = await getMyHospitalIds();
  if (ids.length === 0) return empty;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs_listed")
    .select("specialty,sido")
    .in("hospital_id", ids)
    .eq(LIVE, true)
    .returns<{ specialty: string | null; sido: string | null }[]>();
  if (error) {
    // 🔴 삼키면 돈 낸 병원이 아무 설명 없이 "조건 없음" 화면을 본다.
    console.error("getMyAdConditions failed:", error.message);
    return empty;
  }
  const rows = data ?? [];
  const uniq = (v: (string | null)[]) => [...new Set(v.filter((x): x is string => !!x))];
  return {
    specialties: uniq(rows.map((r) => r.specialty)),
    sidos: uniq(rows.map((r) => r.sido)),
    count: rows.length,
  };
}

/**
 * sitemap 에 실을 공고 목록. **getJobs 와 똑같은 노출 규칙**을 쓴다 —
 * 어긋나면 사이트맵에 올린 URL 이 404 로 응답해(상세는 노출 종료 공고를 notFound 처리한다)
 * 검색엔진에 "없는 페이지를 색인하라"고 시키는 꼴이 된다.
 * 사이트맵 파일 하나의 URL 상한은 50,000건 — 그 위로 늘면 sitemap index 로 쪼개야 한다.
 */
export async function getSitemapJobs(): Promise<{ id: string; updated_at: string }[]> {
  // 공개 데이터만 쓴다 — RLS 가 status='open' 을 anon 에 열어두므로 service_role 이 필요 없다.
  // 쿠키를 읽는 server 클라이언트를 쓰면 라우트가 동적이 되어 sitemap 의 revalidate 가 무력화되고,
  // admin 클라이언트는 빌드 시점에 SUPABASE_SERVICE_ROLE_KEY 가 없으면 빌드를 통째로 깨뜨린다.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.error("getSitemapJobs: Supabase 공개 환경변수 누락");
    return [];
  }
  const supabase = createAnonClient<Database>(url, anon, { auth: { persistSession: false } });

  // 🔴 PostgREST 는 supabase/config.toml 의 max_rows(1000)를 **하드 상한**으로 건다.
  //    .limit(50000) 을 줘도 에러 없이 1000행에서 조용히 잘린다(같은 함정이 지역 RPC 주석에도 있다).
  //    → range 로 나눠 받는다. 사이트맵 상한 50,000건 안에서만 돈다.
  const PAGE = 1000;
  const out: { id: string; updated_at: string }[] = [];
  for (let from = 0; from < 50_000; from += PAGE) {
    // 목록(getJobs)과 **같은 뷰 컬럼(is_live)** — 어긋나면 사이트맵이 없는 페이지를 광고한다.
    const { data, error } = await supabase
      .from("jobs_listed")
      .select("id, updated_at")
      .eq(LIVE, true)
      .order("posted_at", { ascending: false })
      // 🔴 유일 키 2차 정렬 — 워크넷 일괄수집분은 posted_at 동률이 수백 건이라, 없으면 1000행
      //    경계에서 URL 이 중복·누락된다(getSitemapTalent 가 같은 이유로 profile_id 를 쓴다).
      .order("id", { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) {
      console.error("getSitemapJobs failed:", error.message);
      return out; // 사이트맵은 일부만 나가도 사이트가 죽지 않는다 — 정적 경로는 그대로 실린다
    }
    // 🔒 뷰의 생성 타입은 모든 컬럼이 nullable 이다(뷰라서 그렇지 실제 컬럼은 not null).
    //    단언으로 덮지 않고 값이 실제로 있는 행만 싣는다 — 사이트맵에 빈 URL 이 들어가면 안 된다.
    for (const r of data ?? []) if (r.id && r.updated_at) out.push({ id: r.id, updated_at: r.updated_at });
    if (!data || data.length < PAGE) break;
  }
  return out;
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

// 🔴 deadline·source 도 실어야 한다. 병원 화면의 '노출 중' 판정을 구직자 쪽(isOpenToSeekers)과
//    같은 규칙으로 맞추려면 필요하다. 이게 없으면 마감일이 지난 공고를 "무료 ···까지 (N일 남음)"
//    으로 표시하고 제목을 누르면 404 가 된다.
export type MyJob = { id: string; title: string; status: JobStatus; source: string; posted_at: string; featured_until: string | null; deadline: string | null; applicant_count: number };

/** 내가 소유한 병원 id 들. 없으면 빈 배열(로그인 안 했거나 병원이 없거나 — 셋 다 결과가 같다). */
export async function getMyHospitalIds(): Promise<string[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("hospitals").select("id").eq("owner_profile_id", user.id);
  return (data ?? []).map((h) => h.id);
}

// 병원 — 내가 소유한 병원의 공고 목록 + 지원자 수.
export async function getMyJobs(): Promise<MyJob[]> {
  const supabase = await createClient();
  const ids = await getMyHospitalIds();
  if (ids.length === 0) return [];

  type Raw = { id: string; title: string; status: JobStatus; source: string; posted_at: string; featured_until: string | null; deadline: string | null; applications: { count: number }[] };
  const { data } = await supabase
    .from("jobs")
    .select("id,title,status,source,posted_at,featured_until,deadline,applications(count)")
    .in("hospital_id", ids)
    .order("posted_at", { ascending: false })
    .returns<Raw[]>();
  return (data ?? []).map((j) => ({
    id: j.id, title: j.title, status: j.status, source: j.source, posted_at: j.posted_at, featured_until: j.featured_until, deadline: j.deadline,
    applicant_count: j.applications?.[0]?.count ?? 0,
  }));
}

export type MyHospital = { id: string; name: string; region: string | null; address: string | null };

// 내 계정에 연결(claim)된 병원. 인증 시 1회 연결 → 이후 공고에 자동 사용(재입력 방지).
export async function getMyHospital(): Promise<MyHospital | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  // 🔴 예전에는 정렬 없이 limit(1) 이라, 소유 병원이 둘 이상이면(재인증으로 옛 연결이 남는 경우)
  //    **어느 병원 이름으로 공고가 나갈지 병원 스스로 통제할 수 없었다**. 두 가지로 못 박는다.
  //    (1) profiles.claimed_hospital_id 가 있으면 그게 정답이다(인증 때 고른 병원).
  //    (2) 없으면 가장 먼저 연결한 것 하나로 고정한다(호출마다 답이 바뀌지 않게).
  const { data: prof } = await supabase.from("profiles").select("claimed_hospital_id").eq("id", user.id).maybeSingle();
  const claimed = prof?.claimed_hospital_id;
  if (claimed) {
    const { data } = await supabase
      .from("hospitals").select("id,name,region,address")
      .eq("id", claimed).eq("owner_profile_id", user.id).maybeSingle();
    if (data) return data;
  }
  const { data } = await supabase
    .from("hospitals").select("id,name,region,address")
    .eq("owner_profile_id", user.id).order("created_at", { ascending: true }).order("id").limit(1);
  return data?.[0] ?? null;
}

/** 내 광고 캐시 잔액(원). 로그인 안 했으면 0. */
export async function getMyAdCash(): Promise<number> {
  const user = await getSessionUser();
  if (!user) return 0;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("ad_cash").eq("id", user.id).maybeSingle();
  return data?.ad_cash ?? 0;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MyJobDetail = {
  id: string; title: string; specialty: string | null; location: string | null;
  // 검색 축 3종은 복제·수정 폼이 그대로 다시 채워야 한다 — 빠지면 복제할 때마다 조용히 비워진다.
  facility_type: string | null; job_category: string | null;
  employment_type: string | null; salary_text: string | null; benefits: string[];
  description: string | null; status: JobStatus; posted_at: string;
  recruit_count: number | null; shift_type: string | null;
  // 마감일도 수정·복제 폼이 다시 채워야 한다 — 빠지면 수정할 때마다 조용히 '상시'가 된다.
  deadline: string | null;
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
    .select("id,title,specialty,facility_type,job_category,location,employment_type,salary_text,benefits,description,status,posted_at,recruit_count,shift_type,deadline,manager_name,manager_phone,apply_methods,apply_email,apply_detail,hospital:hospitals(id,name,owner_profile_id)")
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
    .select("id,title,specialty,facility_type,job_category,location,employment_type,salary_text,benefits,description,status,posted_at,recruit_count,shift_type,deadline,manager_name,manager_phone,apply_methods,apply_email,apply_detail,hospital:hospitals(id,name)")
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

/**
 * 이 공고가 **내 병원 것인가** — 소유 판정. 서버 키로 읽으므로 부르는 쪽이 먼저 로그인 확인을 한다.
 *
 * 🔴 공고 CRUD(actions.ts)와 광고 결제(app/mypage/ads/actions.ts) 둘 다 쓰는 판정이라 여기 둔다.
 *    한쪽에 두고 export 하면 그 파일이 "use server" 라 헬퍼까지 서버 액션 엔드포인트가 된다.
 */
// deadline 도 같이 실어 준다 — 광고 결제 경로가 마감일을 봐야 하는데, 따로 조회하면
// 결제 준비마다 왕복이 하나 더 붙는다(같은 행을 두 번 읽는 셈이다).
export async function ownedJobHospital(admin: ReturnType<typeof createAdminClient>, jobId: string, userId: string) {
  const { data: job } = await admin.from("jobs").select("hospital_id, deadline").eq("id", jobId).maybeSingle();
  if (!job?.hospital_id) return null; // 워크넷 광고 등 명부 미연결 공고는 소유 대상이 아니다.
  const { data: hosp } = await admin.from("hospitals").select("id, owner_profile_id, region").eq("id", job.hospital_id).maybeSingle();
  if (!hosp || hosp.owner_profile_id !== userId) return null;
  return { ...hosp, deadline: job.deadline };
}
