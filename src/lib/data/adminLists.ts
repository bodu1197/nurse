import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data/admin";

import { SHEET_COLS, WORK_COLS, type ResumeSheetFields, type WorkExperience } from "@/lib/data/resume";

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
  traffic: { today: number; yesterday: number; d7: number; d30: number };
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

export type Traffic = {
  days: { day: string; views: number }[];
  paths: { path: string; views: number }[];
  total: number;
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
    // 🔴 워크넷 공고는 우리가 파는 광고가 아니라 고용24에서 **수집한** 구인정보다(오너 지시 2026-08-04).
    .neq("source", "worknet");

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

  if (q.trim()) {
    const safe = likeSafe(q);
    // 🔴 병원 이름으로도 찾아야 한다. 검색창 안내가 "공고 제목 · 병원명" 인데 실제로는 제목과
    //    company_name 만 뒤졌다 — 명부에 연결된 공고(hospital_id 가 있는 것)는 병원 이름이
    //    jobs 에 없어서 "우리요양병원" 을 쳐도 안 나왔다(오너 지적 2026-08-04).
    //    company_name 은 명부에 없는 수집 공고가 갖는 텍스트라 둘 다 봐야 한다.
    //    PostgREST 로는 조인한 표의 값으로 부모를 거를 수 없으니 병원 id 를 먼저 찾아 넣는다.
    const parts = [`title.ilike.%${safe}%`, `company_name.ilike.%${safe}%`];
    const { data: hs } = await supabase
      .from("hospitals").select("id").ilike("name", `%${safe}%`).limit(300);
    const ids = (hs ?? []).map((h) => h.id);
    // 300개를 넘으면 뒤쪽 병원은 못 찾는다. 조용히 자르면 "왜 안 나오지" 가 반복되므로 로그를 남긴다.
    if (ids.length === 300) console.warn("getAdList: 병원명 검색 300건 상한에 걸림 —", safe);
    if (ids.length) parts.push(`hospital_id.in.(${ids.join(",")})`);
    query = query.or(parts.join(","));
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
