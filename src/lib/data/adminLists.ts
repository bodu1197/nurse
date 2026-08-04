import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data/admin";

export const PER_PAGE = 30;

/** 목록 화면 공통 — 페이지 범위. */
export const range = (page: number) => {
  const from = (Math.max(1, page) - 1) * PER_PAGE;
  return { from, to: from + PER_PAGE - 1 };
};

export type Page<T> = { rows: T[]; total: number };

/**
 * ilike 검색어 정리 — 한 곳에서만 한다(네 화면이 같은 규칙을 복붙하면 다섯 번째에서 어긋난다).
 *
 * `%` `_` 는 LIKE 와일드카드, `*` 는 PostgREST 가 `%` 로 바꾸는 문자,
 * `,` `(` `)` 는 or() 필터의 구분자, `\` 는 Postgres 이스케이프라 남기면 `invalid escape` 로 죽는다.
 */
export const likeSafe = (q: string) => q.trim().replace(/[%_,()*\\]/g, " ").trim();

const empty = <T,>(): Page<T> => ({ rows: [], total: 0 });

// ── 대시보드 · 통계 ────────────────────────────────────────

export type Dashboard = {
  members: { total: number; nurse: number; hospital: number; today: number; d7: number; d30: number };
  resumes: { total: number; public: number; today: number; d7: number; d30: number };
  jobs: { open: number; direct: number; worknet: number; today: number; d7: number; closing3: number };
  applications: { total: number; today: number; d7: number };
  ads: { live: number; ending7: number };
  revenue: { today: number; d30: number; total: number; count30: number };
  todo: { inquiries: number; tax: number; stale_orders: number; failed_orders: number; hidden_reviews: number; hidden_posts: number };
  traffic: { today: number; d7: number; d30: number };
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

export type UserRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  email: string | null;
  phone_number: string | null;
  role: string;
  business_verified: boolean;
  created_at: string;
};

export async function getUsers(
  { q = "", role = "", page = 1 }: { q?: string; role?: string; page?: number },
): Promise<Page<UserRow>> {
  await requireAdmin();
  const supabase = await createClient();
  const { from, to } = range(page);
  let query = supabase
    .from("profiles")
    .select("id,display_name,username,email,phone_number,role,business_verified,created_at", { count: "exact" });
  if (role === "nurse" || role === "hospital" || role === "admin") query = query.eq("role", role);
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
    return empty();
  }
  return { rows: (data ?? []) as UserRow[], total: count ?? 0 };
}

// ── 이력서 목록 ────────────────────────────────────────────

export type ResumeRow = {
  profile_id: string;
  title: string | null;
  is_public: boolean;
  career_level: string | null;
  experience_years: number | null;
  sido: string | null;
  updated_at: string;
  profile: { display_name: string | null; email: string | null } | null;
};

export async function getResumeList(
  { q = "", visibility = "", page = 1 }: { q?: string; visibility?: string; page?: number },
): Promise<Page<ResumeRow>> {
  await requireAdmin();
  const supabase = await createClient();
  const { from, to } = range(page);
  let query = supabase
    .from("resumes")
    .select("profile_id,title,is_public,career_level,experience_years,sido,updated_at,profile:profiles(display_name,email)", { count: "exact" });
  if (visibility === "public") query = query.eq("is_public", true);
  if (visibility === "private") query = query.eq("is_public", false);
  if (q.trim()) {
    query = query.ilike("title", `%${likeSafe(q)}%`);
  }
  const { data, count, error } = await query.order("updated_at", { ascending: false }).range(from, to);
  if (error) {
    console.error("getResumeList:", error.message);
    return empty();
  }
  return { rows: (data ?? []) as unknown as ResumeRow[], total: count ?? 0 };
}

// ── 광고 관리 ──────────────────────────────────────────────

export type AdRow = {
  id: string;
  title: string;
  company_name: string | null;
  ad_tier: string | null;
  featured_until: string | null;
  posted_at: string;
  status: string;
  hospital: { id: string; name: string; owner_profile_id: string | null } | null;
};

/** scope: live(게재중) · ended(종료) · all */
export async function getAdList(
  { scope = "live", q = "", page = 1 }: { scope?: string; q?: string; page?: number },
): Promise<Page<AdRow>> {
  await requireAdmin();
  const supabase = await createClient();
  const { from, to } = range(page);
  const nowIso = new Date().toISOString();
  let query = supabase
    .from("jobs")
    .select("id,title,company_name,ad_tier,featured_until,posted_at,status,hospital:hospitals(id,name,owner_profile_id)", { count: "exact" })
    .not("featured_until", "is", null);
  if (scope === "live") query = query.gt("featured_until", nowIso);
  if (scope === "ended") query = query.lte("featured_until", nowIso);
  if (q.trim()) {
    const safe = likeSafe(q);
    query = query.or(`title.ilike.%${safe}%,company_name.ilike.%${safe}%`);
  }
  const { data, count, error } = await query.order("featured_until", { ascending: false }).range(from, to);
  if (error) {
    console.error("getAdList:", error.message);
    return empty();
  }
  return { rows: (data ?? []) as unknown as AdRow[], total: count ?? 0 };
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
    return empty();
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
    return empty();
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
    return empty();
  }
  return { rows: (data ?? []) as InquiryRow[], total: count ?? 0 };
}
