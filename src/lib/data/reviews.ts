import { createClient } from "@/lib/supabase/server";

export type ReviewRow = {
  id: string;
  rating: number;
  content: string;
  work_period: string | null;
  created_at: string;
  hospital: { name: string; region: string | null } | null;
};

const SELECT = "id, rating, content, work_period, created_at, hospital:hospitals(name, region)";
// 병원 이름·지역으로 거를 때는 inner join(자식 조건으로 부모 리뷰를 필터).
const SELECT_INNER = "id, rating, content, work_period, created_at, hospital:hospitals!inner(name, region)";
export const REVIEWS_PER_PAGE = 20;

// PostgREST or 필터 주입 방지: %,(),쉼표 제거 (jobs.ts와 동일 규칙)
const clean = (s: string) => s.replace(/[%,()]/g, "").trim();

export type ReviewFilters = { q?: string; region?: string; rating?: number };

// 공개 리뷰 목록(숨김 제외 — RLS, 비실명). 병원명·지역·별점 필터 + 페이지 나누기(마스터-디테일 좌측).
export async function getReviews(f: ReviewFilters, page = 1): Promise<{ reviews: ReviewRow[]; total: number }> {
  const supabase = await createClient();
  const from = (Math.max(1, page) - 1) * REVIEWS_PER_PAGE;
  const q = f.q ? clean(f.q) : "";
  const region = f.region ? clean(f.region) : "";
  // 병원 조건이 있을 때만 inner join(없으면 리뷰만 필터해도 되므로 일반 조인).
  const needInner = !!q || !!region;

  let query = supabase
    .from("reviews").select(needInner ? SELECT_INNER : SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + REVIEWS_PER_PAGE - 1);

  if (q) query = query.ilike("hospitals.name", `%${q}%`);
  if (region) query = query.ilike("hospitals.region", `${region}%`); // region = "서울 송파구" → 시도 앞글자 매칭
  if (f.rating && f.rating >= 1 && f.rating <= 5) query = query.eq("rating", f.rating);

  const { data, count, error } = await query.returns<ReviewRow[]>();
  if (error) console.error("getReviews:", error.message);
  return { reviews: data ?? [], total: count ?? 0 };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 리뷰 1건(우측 상세).
export async function getReview(id: string): Promise<ReviewRow | null> {
  if (!UUID_RE.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("reviews").select(SELECT).eq("id", id).maybeSingle<ReviewRow>();
  return data ?? null;
}
