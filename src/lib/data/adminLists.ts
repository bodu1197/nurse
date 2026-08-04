import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data/admin";
import { nowMs, FREE_LISTING_MS } from "@/lib/date";

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
  members: { total: number; nurse: number; hospital: number; today: number; yesterday: number; d7: number; d30: number };
  resumes: { total: number; public: number; today: number; yesterday: number; d7: number; d30: number };
  /** 병원이 우리 사이트에 직접 올린 공고. **워크넷 수집분은 빠져 있다**(오너 지시). */
  jobs: { open: number; today: number; yesterday: number; d7: number; closing3: number };
  /** 워크넷(고용24)에서 자동 수집한 구인정보 — 우리 공고가 아니라 수집 상태다. */
  collected: { open: number; today: number; last_sync: string | null };
  applications: { total: number; today: number; yesterday: number; d7: number };
  ads: { live: number; granted: number; ending7: number };
  revenue: { today: number; yesterday: number; d30: number; total: number; count30: number };
  todo: { inquiries: number; tax: number; stale_orders: number; failed_orders: number; hidden_reviews: number; hidden_posts: number };
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
  updated_at: string;
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
    .select("profile_id,resume_title,is_public,career_level,experience_years,residence_region,updated_at,name,email", { count: "exact" });
  if (visibility === "public") query = query.eq("is_public", true);
  if (visibility === "private") query = query.eq("is_public", false);
  if (q.trim()) {
    // 제목·이름·지역 아무거나 — 관리자가 찾는 방식은 "그 사람" 이지 제목이 아니다.
    const safe = likeSafe(q);
    query = query.or(`resume_title.ilike.%${safe}%,name.ilike.%${safe}%,residence_region.ilike.%${safe}%`);
  }
  const { data, count, error } = await query.order("updated_at", { ascending: false }).range(from, to);
  if (error) {
    console.error("getResumeList:", error.message);
    return failed();
  }
  return { rows: (data ?? []) as unknown as ResumeRow[], total: count ?? 0 };
}

// ── 광고 관리 ──────────────────────────────────────────────

/**
 * 이 사이트의 공고 노출은 **세 종류**다. 화면이 이걸 구분하지 못하면 관리가 안 된다.
 *
 *  paid    유료 광고    — featured_until 이 살아 있고 ad_tier='standard'. ad_orders 에 실결제가 있다.
 *  granted 무료 부여    — 관리자가 결제 없이 켠 것(ad_tier='admin_test', 0원).
 *  free    무료 게시    — 광고를 안 산 공고. 등록 후 7일 동안 그냥 보인다(병원당 동시 1건).
 *                        featured_until 이 없거나 이미 지났다.
 *  ended   종료         — 광고 기간이 끝난 것.
 */
export const AD_KINDS = ["paid", "granted", "free", "ended"] as const;
export type AdKind = (typeof AD_KINDS)[number];
export const AD_KIND_LABEL: Record<AdKind, string> = {
  paid: "유료 광고",
  granted: "무료 부여",
  free: "무료 게시",
  ended: "광고 종료",
};
export const isAdKind = (v: string | undefined | null): v is AdKind => AD_KINDS.includes(v as AdKind);

export type AdRow = {
  id: string;
  title: string;
  company_name: string | null;
  ad_tier: string | null;
  featured_until: string | null;
  posted_at: string;
  status: string;
  source: string;
  hospital: { id: string; name: string } | null;
  /** 이 공고에 실제로 들어온 결제 합계(0원 관리자 부여는 제외). 무료 게시는 0. */
  paidAmount: number;
  /** 결제 건수 — 여러 번 연장했으면 2건 이상 */
  orderCount: number;
};

export async function getAdList(
  { kind = "paid", q = "", page = 1 }: { kind?: AdKind; q?: string; page?: number },
): Promise<Page<AdRow>> {
  await requireAdmin();
  const supabase = await createClient();
  const { from, to } = range(page);
  const nowIso = new Date(nowMs()).toISOString();
  const freshIso = new Date(nowMs() - FREE_LISTING_MS).toISOString();

  let query = supabase
    .from("jobs")
    .select("id,title,company_name,ad_tier,featured_until,posted_at,status,source,hospital:hospitals(id,name)", { count: "exact" })
    // 🔴 워크넷 공고는 우리가 파는 광고가 아니라 고용24에서 **수집한** 구인정보다(오너 지시 2026-08-04).
    //    1,970건이 무료 게시 탭을 가득 채우면 정작 병원이 올린 공고가 묻힌다.
    .neq("source", "worknet");

  if (kind === "paid") {
    query = query.gt("featured_until", nowIso).neq("ad_tier", "admin_test");
  } else if (kind === "granted") {
    query = query.gt("featured_until", nowIso).eq("ad_tier", "admin_test");
  } else if (kind === "ended") {
    query = query.not("featured_until", "is", null).lte("featured_until", nowIso);
  } else {
    // 무료 게시 — 광고가 없거나 끝났고, 등록 7일 이내로 아직 보이는 공고.
    // freeSlotTaken(lib/data/jobs.ts)이 쓰는 판정과 같은 조건이라 화면과 규칙이 어긋나지 않는다.
    query = query
      .or(`featured_until.is.null,featured_until.lt.${nowIso}`)
      .eq("status", "open")
      .gte("posted_at", freshIso);
  }

  if (q.trim()) {
    const safe = likeSafe(q);
    query = query.or(`title.ilike.%${safe}%,company_name.ilike.%${safe}%`);
  }

  const orderCol = kind === "free" ? "posted_at" : "featured_until";
  const { data, count, error } = await query.order(orderCol, { ascending: false }).range(from, to);
  if (error) {
    console.error("getAdList:", error.message);
    return failed();
  }

  const rows = (data ?? []) as unknown as Omit<AdRow, "paidAmount" | "orderCount">[];
  // 결제액은 따로 한 번에 받아 붙인다 — PostgREST 로는 자식 합계를 목록에 못 실는다.
  // 이 페이지의 공고 id 로만 좁히므로 30건짜리 조회 하나다.
  const money = new Map<string, { amount: number; count: number }>();
  if (rows.length) {
    const { data: orders, error: oErr } = await supabase
      .from("ad_orders").select("job_id,amount,tier")
      .in("job_id", rows.map((r) => r.id))
      .eq("status", "PAID");
    if (oErr) console.error("getAdList(orders):", oErr.message);
    for (const o of orders ?? []) {
      if (!o.job_id || o.tier === "admin_test") continue; // 관리자 부여는 매출이 아니다
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
  amount: number;
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
  "id,merchant_uid,status,amount,days,tier,paid_at,created_at,note,imp_uid,tax_issued_at,job:jobs(id,title),hospital:hospitals(name)";

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
