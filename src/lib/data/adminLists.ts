import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data/admin";

import { SHEET_COLS, WORK_COLS, type ResumeSheetFields, type WorkExperience } from "@/lib/data/resume";
import { isAppStatus, type AppStatus } from "@/lib/data/applications";
import { COLLECTED_SOURCES } from "@/lib/jobState";

export const PER_PAGE = 30;

/** 목록 화면 공통 — 페이지 범위. */
export const range = (page: number) => {
  const from = (Math.max(1, page) - 1) * PER_PAGE;
  return { from, to: from + PER_PAGE - 1 };
};

/**
 * 목록 조회 결과.
 *
 * 🔴 `failed` 가 있는 이유: 전에는 조회가 실패하면 빈 배열을 돌려줬다. 그래서 컬럼 이름을
 *    하나 잘못 적었을 때(resumes.title → 실제로는 resume_title) 화면이 **"0건"** 이라고
 *    말했다. 데이터가 없는 것과 못 읽은 것은 완전히 다른 이야기인데 화면에서 구분이 안 되면,
 *    7,270건이 있는 표를 보고 "이력서가 하나도 없네" 라고 읽게 된다.
 */
export type Page<T> = { rows: T[]; total: number; failed?: boolean };

/**
 * ilike 검색어 정리 — 한 곳에서만 한다(네 화면이 같은 규칙을 복붙하면 다섯 번째에서 어긋난다).
 *
 * `%` `_` 는 LIKE 와일드카드, `*` 는 PostgREST 가 `%` 로 바꾸는 문자,
 * `,` `(` `)` 는 or() 필터의 구분자, `\` 는 Postgres 이스케이프라 남기면 `invalid escape` 로 죽는다.
 */
export const likeSafe = (q: string) => q.trim().replace(/[%_,()*\\]/g, " ").trim();

/** 조회 실패 — 화면이 "0건" 이 아니라 "불러오지 못했습니다" 를 보여주게 한다. */
const failed = <T,>(): Page<T> => ({ rows: [], total: 0, failed: true });

/**
 * 주소창으로 들어온 id 는 uuid 일 때만 필터로 쓴다.
 *
 * 🔴 그냥 넘기면 PostgREST 가 `invalid input syntax for type uuid` 로 400 을 던지고, 화면은
 *    "목록을 불러오지 못했습니다"(=서버 고장) 를 띄운다. 오타 난 주소 하나에 화면이 고장 난
 *    것처럼 보이면 안 된다 — 잘못된 id 는 필터가 없었던 것으로 본다.
 */
export const uuidOrEmpty = (v: string | undefined | null) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v ?? "") ? (v as string) : "";

// ── 대시보드 · 통계 ────────────────────────────────────────

/** 날짜 경계는 전부 **한국시간** 이다(마이그레이션 20260804220000). 서버가 UTC 라 그대로 두면
 *  한국시간 00:00~08:59 에 일어난 일이 "어제" 로 잡힌다. */
export type Dashboard = {
  /**
   * today/yesterday/d7/d30 은 **전체 가입**이다. 이관 회원의 created_at 도 구 널스넷에 기록된
   * 진짜 가입일이라(20260804330000) 따로 뺄 필요가 없다.
   * legacy/real 은 '어디서 온 회원인가' 일 뿐 '진짜/가짜' 가 아니다 — 화면에서 그렇게 부르지 말 것.
   */
  members: { total: number; nurse: number; hospital: number; legacy: number; real: number; today: number; yesterday: number; d7: number; d30: number };
  /** real/today/... 은 실제 회원 것만. saved_* 는 이관 회원도 센다 — 저장은 사람이 한 행위다. */
  resumes: { total: number; public: number; real: number; real_public: number; today: number; yesterday: number; d7: number; d30: number; edited_today: number; edited_d7: number; saved_today: number; saved_yesterday: number };
  /**
   * 우리 공고 — 병원이 올린 것 + 구 널스넷 이관분(source='partner'). **워크넷 수집분은 빠져 있다**(오너 지시).
   * 🔴 `open` 만 노출 판정(jobs_listed.is_live)을 거친다. today/yesterday/d7 는 posted_at 기준이라
   *    **노출 여부와 무관**하다 — 그래서 화면에서 그 카드에는 목록 링크를 걸지 않는다(도착지와 숫자가 어긋난다).
   */
  jobs: { open: number; today: number; yesterday: number; d7: number; closing3: number };
  /** 워크넷(고용24)에서 자동 수집한 구인정보 — 우리 공고가 아니라 수집 상태다. */
  collected: { open: number; today: number; last_sync: string | null };
  applications: { total: number; today: number; yesterday: number; d7: number };
  /**
   * 🔴 `live` 는 **돈을 낸 광고**만(ad_tier='standard' + is_live) — 공고관리 「유료」 탭과 같은 술어라
   *    카드 숫자와 눌러서 도착한 목록의 건수가 일치한다.
   * 🔴 `granted` 는 **무료로 노출 중인 공고 수**다. 종전에는 ad_tier='admin_test' 를 세었는데 그 값은
   *    DB 에 한 건도 없어(관리자가 켜준 광고도 'free' 로 둔다) 영원히 0 인 죽은 숫자였다.
   * `ending7` 은 유료 광고 중 7일 안에 끝나는 것. 정의는 마이그레이션 20260805100000 에 있다.
   */
  ads: { live: number; granted: number; ending7: number };
  revenue: { today: number; yesterday: number; d30: number; total: number; count30: number };
  todo: { inquiries: number; tax: number; stale_orders: number; failed_orders: number; hidden_reviews: number; hidden_posts: number; nameless_resumes: number; private_resumes_7d: number };
  /** 조회수 — 사람이 연 페이지 수(봇 제외). bots30 은 최근 30일 봇 조회수. */
  traffic: { today: number; yesterday: number; d7: number; d30: number; bots30: number };
  /** 순 방문자. 🔴 d7/d30 은 일별 합이 아니라 **서로 다른 사람 수**다(사흘 온 사람은 1). */
  visitors: { today: number; yesterday: number; d7: number; d30: number };
};

export async function getDashboard(): Promise<Dashboard | null> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_dashboard");
  if (error) {
    console.error("admin_dashboard:", error.message);
    return null;
  }
  return data as unknown as Dashboard;
}

/**
 * 접속 통계.
 *
 * 🔴 `uniques`(기간 순 방문자)는 `days[].uniques` 의 합이 **아니다** — 서로 다른 사람 수라
 *    사흘 연속 온 사람은 3이 아니라 1로 센다. 화면에서 둘을 더해 보여주면 거짓말이 된다.
 * 🔴 refs/devices/hours 는 **방문(사람×날짜) 기준**이다. 같은 사람이 다른 날 오면 각각 센다.
 *    (한 사람이 월요일엔 구글, 화요일엔 네이버로 올 수 있어 순 방문자로는 나눌 수 없다.)
 */
export type Traffic = {
  /** 오늘·어제는 이 배열의 마지막 두 칸이다 — 같은 값을 DB 에서 따로 세지 않는다. */
  days: {
    day: string;
    /** 그날 순 방문자 수 */
    uniques: number;
    /** 그 방문자들이 연 쪽수. views 와 다르다 — 지문을 못 만든 요청은 views 에만 들어간다. */
    hits: number;
    views: number;
    bots: number;
  }[];
  paths: { path: string; views: number; bots: number }[];
  /** 사람 조회수 합 */
  total: number;
  /** 봇 조회수 합 */
  bots: number;
  /** 기간 순 방문자 — 서로 다른 사람 수 */
  uniques: number;
  /** 그중 기간 안에 이틀 이상 온 사람 수 */
  returning: number;
  /** 🔴 ref/device 문자열은 SQL(track_page_view 화이트리스트)과 짝이다 — 한쪽만 바꾸면 안 된다. */
  refs: { ref: string; visits: number }[];
  devices: { device: string; visits: number }[];
  hours: { hour: number; visits: number }[];
};

export async function getTraffic(days = 30): Promise<Traffic | null> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_traffic", { days });
  if (error) {
    console.error("admin_traffic:", error.message);
    return null;
  }
  return data as unknown as Traffic;
}

// ── 회원 현황 ──────────────────────────────────────────────

/**
 * 가입 경로. 카카오·네이버는 커스텀 OAuth 라 auth.users 의 app_metadata 로는 구분되지 않는다
 * (Supabase 가 'email' 로 덮어쓴다) — 가입 시점에 profiles.signup_provider 로 복사해 둔다.
 */
export const SIGNUP_PROVIDERS = ["email", "kakao", "naver", "legacy"] as const;
export type SignupProvider = (typeof SIGNUP_PROVIDERS)[number];
export const SIGNUP_LABEL: Record<string, string> = {
  email: "이메일", kakao: "카카오", naver: "네이버", legacy: "구 널스넷 이관",
};

export type UserRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  email: string | null;
  phone_number: string | null;
  role: string;
  business_verified: boolean;
  created_at: string;
  /** 가입 경로 — email · kakao · naver · legacy(구 널스넷 이관) */
  signup_provider: string | null;
};

export async function getUsers(
  { q = "", role = "", provider = "", page = 1 }: { q?: string; role?: string; provider?: string; page?: number },
): Promise<Page<UserRow>> {
  await requireAdmin();
  const supabase = await createClient();
  const { from, to } = range(page);
  let query = supabase
    .from("profiles")
    .select("id,display_name,username,email,phone_number,role,business_verified,created_at,signup_provider", { count: "exact" });
  if (role === "nurse" || role === "hospital" || role === "admin") query = query.eq("role", role);
  if (SIGNUP_PROVIDERS.includes(provider as SignupProvider)) query = query.eq("signup_provider", provider);
  if (q.trim()) {
    // 이름·아이디·이메일·전화 중 아무거나.
    const safe = likeSafe(q);
    query = query.or(
      `display_name.ilike.%${safe}%,username.ilike.%${safe}%,email.ilike.%${safe}%,phone_number.ilike.%${safe}%`,
    );
  }
  const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, to);
  if (error) {
    console.error("getUsers:", error.message);
    return failed();
  }
  return { rows: (data ?? []) as UserRow[], total: count ?? 0 };
}

// ── 이력서 목록 ────────────────────────────────────────────

export type ResumeRow = {
  profile_id: string;
  resume_title: string | null;
  is_public: boolean;
  career_level: string | null;
  experience_years: number | null;
  residence_region: string | null;
  /** 사람이 마지막으로 저장한 시각. updated_at 은 이관·보정 배치가 밀어놔서 못 쓴다. */
  last_edited_at: string | null;
  /** 이력서에 적힌 본인 정보 — profiles 조인이 아니라 resumes 자체 컬럼이다. */
  name: string | null;
  email: string | null;
};

export async function getResumeList(
  { q = "", visibility = "", page = 1 }: { q?: string; visibility?: string; page?: number },
): Promise<Page<ResumeRow>> {
  await requireAdmin();
  const supabase = await createClient();
  const { from, to } = range(page);
  let query = supabase
    .from("resumes")
    .select("profile_id,resume_title,is_public,career_level,experience_years,residence_region,last_edited_at,name,email", { count: "exact" });
  if (visibility === "public") query = query.eq("is_public", true);
  if (visibility === "private") query = query.eq("is_public", false);
  if (q.trim()) {
    // 제목·이름·지역 아무거나 — 관리자가 찾는 방식은 "그 사람" 이지 제목이 아니다.
    const safe = likeSafe(q);
    query = query.or(`resume_title.ilike.%${safe}%,name.ilike.%${safe}%,residence_region.ilike.%${safe}%`);
  }
  const { data, count, error } = await query.order("last_edited_at", { ascending: false, nullsFirst: false }).range(from, to);
  if (error) {
    console.error("getResumeList:", error.message);
    return failed();
  }
  return { rows: (data ?? []) as unknown as ResumeRow[], total: count ?? 0 };
}

// ── 지원 내역 ──────────────────────────────────────────────

/**
 * 「지원 내역」 요약.
 *
 * 🔴 숫자는 전부 **관리자 테스트 병원(hospitals.is_test) 지원을 뺀 것**이다 — RPC 안에서 거른다.
 *    대시보드의 「오늘 지원」도 같은 술어를 쓴다(20260806120000). 한쪽만 빼면 두 화면이 서로
 *    다른 누적치를 말한다.
 */
export type ApplicationsOverview = {
  /** 🔴 total 은 건수, nurses 는 사람 수다. 20건이 20명인지 한 명이 20번인지는 다른 이야기다. */
  counts: { total: number; today: number; yesterday: number; d7: number; d30: number; nurses: number; nurses_d30: number; jobs: number };
  /**
   * live = 취소를 뺀 지원. seen = 그중 병원이 열어 본 것. 열람률은 seen/live 로 화면에서 낸다.
   * median_hours 는 지원 → 열람까지 걸린 시간의 중앙값(기록이 없으면 null → 화면은 "-").
   */
  funnel: { submitted: number; viewed: number; accepted: number; rejected: number; withdrawn: number; live: number; seen: number; stale: number; median_hours: number | null };
  /** 위 숫자에서 빠진 테스트 지원 건수 — 화면에 그대로 적어 "왜 3건이 2건이 됐나"에 답한다. */
  test_total: number;
  top_jobs: { job_id: string; title: string; hospital: string | null; n: number; unseen: number; last_at: string }[];
};

export async function getApplicationsOverview(): Promise<ApplicationsOverview | null> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_applications_overview");
  if (error) {
    console.error("admin_applications_overview:", error.message);
    return null;
  }
  return data as unknown as ApplicationsOverview;
}

/** applications_admin 뷰의 한 줄 — 지원 + 그 공고·병원 + 지원자 이름이 이미 붙어 있다. */
export type AdminApplicationRow = {
  id: string;
  status: AppStatus;
  message: string | null;
  created_at: string;
  /** 병원이 처음 열어 본 시각. 20260806120000 이전에 끝난 옛 행은 비어 있을 수 있다. */
  viewed_at: string | null;
  /** 합격·불합격·취소로 끝난 시각. */
  closed_at: string | null;
  /** 3일 넘게 병원이 안 본 지원인가 — 판정은 뷰에 있다. 화면·목록 필터·요약 카드가 같은 값을 본다. */
  is_stale: boolean;
  applicant_id: string;
  job_id: string;
  job_title: string;
  job_company_name: string | null;
  /** 지금도 구직자에게 보이는 공고인가(jobs_listed.is_live). 🔴 이 판정을 화면에서 다시 계산하지 말 것. */
  job_is_live: boolean;
  hospital_id: string | null;
  hospital_name: string | null;
  /** 이력서에 적힌 본인 정보 — 이름·연락처가 없으면 지원 자체가 막히므로(jobs/actions) 보통 채워져 있다. */
  nurse_name: string | null;
  nurse_phone: string | null;
  nurse_email: string | null;
};

/** stale: 3일 넘게 병원이 안 본 지원만. 판정은 뷰의 is_stale — 요약 카드와 같은 컬럼이라 건수가 맞는다. */
export type ApplicationFilters = { status?: string; q?: string; nurse?: string; job?: string; stale?: boolean; page?: number };

const APPLICATION_COLS =
  "id,status,message,created_at,viewed_at,closed_at,is_stale,applicant_id,job_id,job_title,job_company_name,job_is_live,hospital_id,hospital_name,nurse_name,nurse_phone,nurse_email";

/**
 * 지원 목록(관리자). 최신순.
 *
 * 🔴 표가 아니라 **뷰(applications_admin)** 를 읽는다. 이름·공고 제목·병원명이 이미 한 줄에 있어
 *    검색이 SQL 한 번으로 끝난다. 종전에는 지원 행을 먼저 긁어와 JS 로 맞춰 본 뒤 맞은 id 를
 *    다시 URL 에 실었는데, 그 방식은 (1) 최근 1,000건 밖을 못 찾고 (2) uuid 수백 개짜리 주소를
 *    만들어 414 로 죽고 (3) 테스트 병원 제외 술어가 SQL·TS 두 곳에 갈라져 있었다.
 */
export async function getApplications(
  { status = "", q = "", nurse = "", job = "", stale = false, page = 1 }: ApplicationFilters,
): Promise<Page<AdminApplicationRow>> {
  await requireAdmin();
  const supabase = await createClient();
  const { from, to } = range(page);

  let query = supabase
    .from("applications_admin")
    .select(APPLICATION_COLS, { count: "exact" })
    // 관리자 테스트 병원 지원은 뺀다 — 요약 RPC 가 보는 것과 **같은 컬럼**이다.
    .eq("is_test", false);
  if (isAppStatus(status)) query = query.eq("status", status);
  if (uuidOrEmpty(nurse)) query = query.eq("applicant_id", nurse);
  if (uuidOrEmpty(job)) query = query.eq("job_id", job);
  if (stale) query = query.eq("is_stale", true);
  const safe = likeSafe(q);
  // 🔴 likeSafe 가 다 지워 빈 문자열이 되면(예: "%%") 검색을 아예 걸지 않는다.
  //    `ilike.%%` 는 전건 매치라, 검색했는데 전체가 나오는 화면이 된다.
  if (safe) {
    query = query.or(
      `nurse_name.ilike.%${safe}%,job_title.ilike.%${safe}%,job_company_name.ilike.%${safe}%,hospital_name.ilike.%${safe}%`,
    );
  }

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, to)
    .returns<AdminApplicationRow[]>();
  if (error) {
    console.error("getApplications:", error.message);
    return failed();
  }
  return { rows: data ?? [], total: count ?? 0 };
}

// ── 광고 관리 ──────────────────────────────────────────────

/**
 * 공고 목록 — 오너 확정 개념(2026-08-04): **공고 = 광고다.**
 * 돈을 결제해도 공고이고, 안 내고 무료 7일을 써도 공고다. 그래서 목록은 하나다.
 * 다른 것은 딱 하나 — **돈을 안 낸 공고는 인재를 열람할 자격이 없다**(is_talent_advertiser).
 *
 * 유료·무료는 **탭으로** 거른다. 배지만 달아 두면 8만 건 중에서 눈으로 찾아야 한다(오너 지시).
 * 탭은 배타적 분류가 아니라 보는 각도다 — 오늘 올린 무료 공고는 「노출중」과 「무료」에 둘 다 나온다.
 * 「전체 공고」 탭은 두지 않는다 — 노출중 + 노출 마감이라 같은 것을 세 번 보여주는 셈이다(오너 지시).
 */
export const AD_SCOPES = ["live", "paid", "free", "ended"] as const;
export type AdScope = (typeof AD_SCOPES)[number];
export const AD_SCOPE_LABEL: Record<AdScope, string> = {
  live: "노출중", paid: "유료", free: "무료", ended: "노출 마감",
};
export const isAdScope = (v: string | undefined | null): v is AdScope => AD_SCOPES.includes(v as AdScope);

export type AdRow = {
  id: string;
  title: string;
  company_name: string | null;
  ad_tier: string | null;
  featured_until: string | null;
  posted_at: string;
  /** 마감일 — 노출 종료 계산(listingEnd)에 필요하다. 광고보다 마감일이 이르면 그날 끝난다. */
  deadline: string | null;
  status: string;
  source: string;
  hospital: { id: string; name: string } | null;
  /** 이 공고에 실제로 들어온 결제 합계(0원 관리자 부여는 제외). 무료면 0. */
  paidAmount: number;
  /** 결제 건수 — 여러 번 연장했으면 2건 이상 */
  orderCount: number;
};

export async function getAdList(
  { scope = "live", q = "", page = 1 }: { scope?: AdScope; q?: string; page?: number },
): Promise<Page<AdRow>> {
  await requireAdmin();
  const supabase = await createClient();
  const { from, to } = range(page);

  let query = supabase
    .from("jobs_listed")
    .select("id,title,company_name,ad_tier,featured_until,posted_at,deadline,status,source,hospital:hospitals(id,name)", { count: "exact" })
    // 🔴 수집 공고(워크넷·잡알리오)는 우리가 파는 광고가 아니라 밖에서 모아 온 구인정보다(오너 지시 2026-08-04).
    //    목록은 lib/jobState 의 COLLECTED_SOURCES 한 곳에서 온다 — 수집처가 늘 때 여기가 안 따라오면
    //    돈 한 푼 안 낸 공공기관 공고가 「광고 관리」에 섞여 매출 화면을 오염시킨다.
    .not("source", "in", `(${COLLECTED_SOURCES.join(",")})`);

  // 🔴 탭은 **지금 구직자에게 보이는가**로 나눈다. featured_until 유무로 나누면 안 된다.
  //    전에는 세 탭 모두 `.not("featured_until","is",null)` 을 걸어서 광고를 안 낸 공고가
  //    어느 탭에도 없었다 — 레거시 이관 공고 1,401건이 통째로 사라졌고, 오늘 올라온 무료 게시
  //    공고도 안 보였다(오너 지적 2026-08-04: "그 병원들 다 어디 갔냐", 우리요양병원 건).
  //    실측 당시: 광고 있는 게시중 43건만 보이고, 광고 없는 게시중 2건 + 종료 1,401건은 안 보였다.
  //
  //    노출 규칙은 구직자 목록(getJobs)과 **같아야 한다** — 광고가 살아 있거나, 게시 7일 이내면 노출.
  //    그래야 오늘 올린 무료 게시 공고가 「오늘 등록」과 「노출중」에 **둘 다** 나온다
  //    (탭은 서로 배타적인 분류가 아니라 보는 각도다).
  // 🔴 status 도 본다. 전에는 기간만 보고 갈라서 **closed·draft 공고가 「노출중」에 섞였다**
  //    (오너 지적 2026-08-04, 화면 확인). 닫힌 공고는 구직자에게 안 보인다 — 노출중일 수 없다.
  // 🔴 or() 를 겹쳐 쓰지 않는다. 노출 조건 or + 등급 or + 검색어 or 가 한 요청에 세 개 붙으면서
  //    서로 덮여 엉뚱한 목록이 나왔다(오너 지적 2026-08-04: 무료 탭에 끝난 공고가 섞였다).
  //    이제 모든 공고가 등록 즉시 featured_until 을 갖는다(첫 1주 0원, createJob + 20260804350000).
  //    그래서 노출중 = 열려 있고 + 기간이 남았다 — 조건 두 개면 끝이고 인덱스도 그대로 탄다.
  // 🔴 판정은 **jobs_listed.is_live 하나**를 읽는다(마이그레이션 20260805100000).
  //    전에는 여기·구직자 목록·대시보드 RPC 가 각자 규칙을 손으로 적어서, 대시보드는 "게시중 44"
  //    인데 이 목록은 "노출중 40" 이었다(오너 지적 2026-08-05: "어떤 게 맞는 거냐").
  //    규칙을 바꿀 일이 생기면 그 마이그레이션 파일만 고친다 — 여기 다시 적지 말 것.
  if (scope !== "ended") query = query.eq("is_live", true);
  // 「노출 마감」은 그 여집합이다.
  if (scope === "ended") query = query.eq("is_live", false);
  // 🔴 유료·무료도 **탭**이다. 배지만 달아 두면 8만 건 중에서 유료를 눈으로 찾아야 한다(오너 지시).
  //    판정은 ad_tier 로 한다 — 매 페이지마다 ad_orders 를 조인하면 결제 테이블을 통째로 훑는다.
  //    그 값이 사실과 어긋나 있던 것은 20260804360000 에서 바로잡았다(결제 없으면 free).
  //    🔴 **노출중인 것 안에서만** 나눈다(오너 지시 2026-08-04): "마감된 공고의 유료·무료는
  //       볼 필요도 없다." 끝난 광고가 유료였는지는 결제 내역에서 볼 일이다.
  //       (노출 조건은 위에서 이미 걸렸다 — 여기서는 등급만 더한다.)
  //       ad_tier 는 not null 이라(20260804370000) `<> 'standard'` 만으로 무료가 정확히 걸린다.
  if (scope === "paid") query = query.eq("ad_tier", "standard");
  if (scope === "free") query = query.neq("ad_tier", "standard");

  const safe = likeSafe(q);
  if (safe) {
    // 🔴 병원 이름으로도 찾아야 한다. 검색창 안내가 "공고 제목 · 병원명" 인데 실제로는 제목과
    //    company_name 만 뒤졌다 — 명부에 연결된 공고(hospital_id 가 있는 것)는 병원 이름이
    //    jobs 에 없어서 "우리요양병원" 을 쳐도 안 나왔다(오너 지적 2026-08-04).
    //    company_name 은 명부에 없는 수집 공고가 갖는 텍스트라 둘 다 봐야 한다.
    // 🔴 종전에는 hospitals 를 먼저 뒤져 id 를 300개까지 모아 `hospital_id=in.(…)` 로 넘겼다.
    //    ① 300건에서 잘려 뒤쪽 병원의 공고가 **화면에 아무 말 없이** 빠졌고(로그만 남았다)
    //    ② uuid 300개면 주소가 11KB 라 요청 자체가 414 로 죽을 수 있었다.
    //    이제 뷰가 hospital_name 을 실어 준다(20260806130000) — 상한도 긴 주소도 없다.
    query = query.or(
      `title.ilike.%${safe}%,company_name.ilike.%${safe}%,hospital_name.ilike.%${safe}%`,
    );
  }

  // 정렬은 전부 posted_at 이다. featured_until 로 세우면 광고를 안 낸 공고(빈 값)가 앞을 덮는다
  // (Postgres 에서 DESC 는 NULLS FIRST).
  const { data, count, error } = await query.order("posted_at", { ascending: false }).range(from, to);
  if (error) {
    console.error("getAdList:", error.message);
    return failed();
  }

  const rows = (data ?? []) as unknown as Omit<AdRow, "paidAmount" | "orderCount">[];
  // 결제액은 따로 한 번에 받아 붙인다 — PostgREST 로는 자식 합계를 목록에 못 실는다.
  const money = new Map<string, { amount: number; count: number }>();
  if (rows.length) {
    const { data: orders, error: oErr } = await supabase
      .from("ad_orders").select("job_id,amount,tier")
      .in("job_id", rows.map((r) => r.id))
      .eq("status", "PAID");
    if (oErr) console.error("getAdList(orders):", oErr.message);
    for (const o of orders ?? []) {
      if (!o.job_id || o.tier === "admin_test" || o.amount <= 0) continue; // 0원은 매출이 아니다
      const cur = money.get(o.job_id) ?? { amount: 0, count: 0 };
      money.set(o.job_id, { amount: cur.amount + o.amount, count: cur.count + 1 });
    }
  }

  return {
    rows: rows.map((r) => ({
      ...r,
      paidAmount: money.get(r.id)?.amount ?? 0,
      orderCount: money.get(r.id)?.count ?? 0,
    })),
    total: count ?? 0,
  };
}

/** 한 공고의 광고 결제 이력 — "언제 어느 병원이 얼마에 며칠을 샀는가". */
export type AdOrderRow = {
  id: string;
  merchant_uid: string;
  status: string;
  /** 카드로 청구한 금액(원). 광고비 전액이 아니다 — 캐시로 낸 몫은 cash_used 에 따로 있다. */
  amount: number;
  cash_used: number;
  days: number;
  tier: string;
  paid_at: string | null;
  created_at: string;
  note: string | null;
  imp_uid: string | null;
  tax_issued_at: string | null;
  job: { id: string; title: string } | null;
  hospital: { name: string } | null;
};

const ORDER_SELECT =
  "id,merchant_uid,status,amount,cash_used,days,tier,paid_at,created_at,note,imp_uid,tax_issued_at,job:jobs(id,title),hospital:hospitals(name)";

export async function getJobAdOrders(jobId: string): Promise<AdOrderRow[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ad_orders").select(ORDER_SELECT).eq("job_id", jobId).order("created_at", { ascending: false });
  if (error) {
    console.error("getJobAdOrders:", error.message);
    return [];
  }
  return (data ?? []) as unknown as AdOrderRow[];
}

// ── 결제 내역 ──────────────────────────────────────────────

export async function getOrders(
  { status = "", q = "", page = 1 }: { status?: string; q?: string; page?: number },
): Promise<Page<AdOrderRow>> {
  await requireAdmin();
  const supabase = await createClient();
  const { from, to } = range(page);
  let query = supabase.from("ad_orders").select(ORDER_SELECT, { count: "exact" });
  if (status) query = query.eq("status", status);
  if (q.trim()) {
    const safe = likeSafe(q);
    query = query.or(`merchant_uid.ilike.%${safe}%,imp_uid.ilike.%${safe}%`);
  }
  const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, to);
  if (error) {
    console.error("getOrders:", error.message);
    return failed();
  }
  return { rows: (data ?? []) as unknown as AdOrderRow[], total: count ?? 0 };
}

// ── 세금계산서 ─────────────────────────────────────────────

export type TaxRow = AdOrderRow & {
  tax_biz_no: string | null;
  tax_biz_name: string | null;
  tax_ceo: string | null;
  tax_email: string | null;
  tax_invoice_no: string | null;
  supply_amount: number;
  vat: number;
};

/** issued: false=미발행(기본) · true=발행완료 */
export async function getTaxTargets(
  { issued = false, page = 1 }: { issued?: boolean; page?: number },
): Promise<Page<TaxRow>> {
  await requireAdmin();
  const supabase = await createClient();
  const { from, to } = range(page);
  let query = supabase
    .from("ad_orders")
    .select(`${ORDER_SELECT},tax_biz_no,tax_biz_name,tax_ceo,tax_email,tax_invoice_no,supply_amount,vat`, { count: "exact" })
    .eq("status", "PAID")
    // 관리자 테스트 주문은 0원이라 발행 대상이 아니다 — 목록에 섞이면 진짜 대상이 묻힌다.
    .neq("tier", "admin_test");
  query = issued ? query.not("tax_issued_at", "is", null) : query.is("tax_issued_at", null);
  const { data, count, error } = await query.order("paid_at", { ascending: false }).range(from, to);
  if (error) {
    console.error("getTaxTargets:", error.message);
    return failed();
  }
  return { rows: (data ?? []) as unknown as TaxRow[], total: count ?? 0 };
}

// ── 공지 · FAQ · 이벤트 ────────────────────────────────────

export const SITE_POST_KINDS = ["notice", "faq", "event"] as const;
export type SitePostKind = (typeof SITE_POST_KINDS)[number];
export const SITE_POST_LABEL: Record<SitePostKind, string> = { notice: "공지사항", faq: "자주 묻는 질문", event: "이벤트" };
export const isSitePostKind = (v: string | undefined | null): v is SitePostKind =>
  SITE_POST_KINDS.includes(v as SitePostKind);

export type SitePost = {
  id: string;
  kind: SitePostKind;
  title: string;
  body: string;
  published_at: string | null;
  sort: number;
  updated_at: string;
};

/** 관리자용 — 비공개(작성 중) 글까지 전부. */
export async function getSitePostsAdmin(kind: SitePostKind): Promise<SitePost[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_posts").select("id,kind,title,body,published_at,sort,updated_at")
    .eq("kind", kind)
    .order("sort", { ascending: false })
    .order("published_at", { ascending: false, nullsFirst: true });
  if (error) console.error("getSitePostsAdmin:", error.message);
  return (data ?? []) as SitePost[];
}

// ── 문의사항 ───────────────────────────────────────────────

export const INQUIRY_KIND_LABEL: Record<string, string> = {
  payment: "광고·결제",
  hospital: "병원 정보",
  report: "게시물 신고",
  privacy: "개인정보",
  etc: "기타",
};
export const INQUIRY_STATUS_LABEL: Record<string, string> = { open: "미처리", answered: "답변완료", closed: "종료" };

export type InquiryRow = {
  id: string;
  kind: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  body: string;
  status: string;
  admin_memo: string | null;
  answered_at: string | null;
  created_at: string;
};

export async function getInquiries(
  { status = "open", page = 1 }: { status?: string; page?: number },
): Promise<Page<InquiryRow>> {
  await requireAdmin();
  const supabase = await createClient();
  const { from, to } = range(page);
  let query = supabase.from("inquiries").select("*", { count: "exact" });
  if (status && status !== "all") query = query.eq("status", status);
  const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, to);
  if (error) {
    console.error("getInquiries:", error.message);
    return failed();
  }
  return { rows: (data ?? []) as InquiryRow[], total: count ?? 0 };
}

// ── 이력서 상세(관리자) ────────────────────────────────────

/**
 * 비공개 이력서도 본다 — 공개 화면(/talent/[id])은 is_public 인 것만 보여주므로,
 * 관리자가 신고받은 비공개 이력서를 확인할 길이 없다. RLS(resumes_select_admin)가 통과시킨다.
 */
export async function getResumeForAdmin(profileId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data, error }, { data: work }] = await Promise.all([
    supabase.from("resumes").select(`${SHEET_COLS},is_public,updated_at`).eq("profile_id", profileId).maybeSingle(),
    supabase.from("work_experiences").select(WORK_COLS).eq("resume_id", profileId).order("sort_order"),
  ]);
  if (error) console.error("getResumeForAdmin:", error.message);
  if (!data) return null;
  return { resume: data as unknown as ResumeSheetFields & { is_public: boolean; updated_at: string },
           work: (work ?? []) as unknown as WorkExperience[] };
}

// ── 🏥 병원명 확인 필요 ────────────────────────────────────
//
// 구 널스넷 이관 때 **병원 이름 자리에 회원 아이디**가 들어간 곳이 141곳 있었다
// (`eyessg2022` · `hama` · `김원장` · `행정부장` · `010-5054-1454`). 구직자 화면에
// "hama에서 간호조무사를 구합니다" 로 나간다. 주소·공고 제목으로 44곳은 자동으로 바로잡았고,
// 나머지는 사람이 봐야 한다 — 같은 건물에 병원이 여럿이거나(주소만으로는 못 고른다)
// 산후조리원처럼 심사평가원 명부에 아예 없다.

/** 병원 이름에 들어갈 법한 말. 하나도 없으면 "이름이 아닌 것" 으로 본다. */
const HOSPITAL_WORDS =
  "병원|의원|클리닉|센터|한의원|치과|약국|요양원|보건|의료|재활|정신|산부인과|안과|피부과|정형외과|" +
  "내과|외과|소아|이비인후|비뇨|성형|검진|투석|주간보호|조리원|너싱홈|실버|요양";

export type HospitalToFix = {
  id: string;
  name: string;
  address: string | null;
  region: string | null;
  /** 이 병원이 올린 공고 제목 — 대개 여기에 진짜 병원 이름이 들어 있다. */
  jobTitles: string[];
  /** 같은 주소(도로명+번호)의 심사평가원 명부 병원들. 눌러서 바로 고르게 한다. */
  candidates: string[];
  /** 관리자 테스트용 계정인가 — 고칠 대상이 아니다. */
  isTest: boolean;
};

/**
 * '경기도 고양시 덕양구 충장로 126, 6층 (행신동)' → '충장로 126' (명부와 대조할 열쇠)
 *
 * 🔴 도로명 **안에 숫자가 들어간다**(오목로205번길 · 선릉로152길 · 강남대로53길). 첫 글자만
 *    한글로 두고 그 뒤에 숫자를 허용해야 한다. `[가-힣]+` 로만 두면 '오목로205번길 22' 가
 *    '번길 22' 로 잘려 **엉뚱한 병원이 후보로 올라오고**(실측: 산후조리원에 한림대성심병원),
 *    '선릉로152길 32' 는 아예 못 읽어 후보가 사라진다.
 */
function roadOf(address: string | null): string | null {
  if (!address) return null;
  const head = address.split(",")[0].replace(/\(.*?\)/g, "").trim();
  return /([가-힣][가-힣0-9]*(?:대로|번길|로|길)\s*\d+(?:-\d+)?)\s*$/.exec(head)?.[1] ?? null;
}

export async function getHospitalsToFix(
  { q = "", page = 1 }: { q?: string; page?: number },
): Promise<Page<HospitalToFix>> {
  await requireAdmin();
  const supabase = await createClient();
  const { from, to } = range(page);

  let query = supabase
    .from("hospitals")
    .select("id,name,address,region,is_test", { count: "exact" })
    .not("owner_profile_id", "is", null)
    // 🔴 이름에 병원스러운 말이 하나도 없는 것만. not.imatch 는 PostgREST 의 정규식 부정 필터다.
    .not("name", "imatch", `(${HOSPITAL_WORDS})`);
  if (q.trim()) query = query.ilike("name", `%${likeSafe(q)}%`);
  const { data, count, error } = await query
    .order("name")
    .range(from, to)
    .returns<{ id: string; name: string; address: string | null; region: string | null; is_test: boolean }[]>();
  if (error) {
    console.error("getHospitalsToFix:", error.message);
    return failed();
  }
  const rows = data ?? [];
  if (rows.length === 0) return { rows: [], total: count ?? 0 };

  // 공고 제목과 명부 후보를 한 번씩만 더 읽는다(행마다 부르면 30번 왕복한다).
  const roads = [...new Set(rows.map((r) => roadOf(r.address)).filter((v): v is string => !!v))];
  const [{ data: jobs }, { data: reg }] = await Promise.all([
    supabase.from("jobs").select("hospital_id,title").in("hospital_id", rows.map((r) => r.id))
      .returns<{ hospital_id: string; title: string }[]>(),
    roads.length
      ? supabase.from("hospitals").select("name,address").is("owner_profile_id", null)
          .or(roads.map((rd) => `address.ilike.%${likeSafe(rd)}%`).join(","))
          .limit(500).returns<{ name: string; address: string | null }[]>()
      : Promise.resolve({ data: [] as { name: string; address: string | null }[] }),
  ]);
  const titlesBy = new Map<string, string[]>();
  for (const j of jobs ?? []) titlesBy.set(j.hospital_id, [...(titlesBy.get(j.hospital_id) ?? []), j.title]);
  const regBy = new Map<string, string[]>();
  for (const r of reg ?? []) {
    const rd = roadOf(r.address);
    if (rd) regBy.set(rd, [...(regBy.get(rd) ?? []), r.name]);
  }

  return {
    rows: rows.map((r) => ({
      id: r.id, name: r.name, address: r.address, region: r.region, isTest: r.is_test,
      jobTitles: (titlesBy.get(r.id) ?? []).slice(0, 3),
      candidates: [...new Set(regBy.get(roadOf(r.address) ?? "") ?? [])].slice(0, 6),
    })),
    total: count ?? 0,
  };
}
