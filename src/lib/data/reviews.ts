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
export const REVIEWS_PER_PAGE = 20;

// 전체 리뷰 둘러보기(마스터-디테일 좌측) — 최신순·페이지 나누기. 숨김 제외(RLS), 비실명.
// 특정 병원 검색은 getHospitalReviews(아래) — 병원을 골라 그 병원 리뷰를 본다.
export async function getReviews(page = 1): Promise<{ reviews: ReviewRow[]; total: number }> {
  const supabase = await createClient();
  const from = (Math.max(1, page) - 1) * REVIEWS_PER_PAGE;
  const { data, count, error } = await supabase
    .from("reviews").select(SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + REVIEWS_PER_PAGE - 1)
    .returns<ReviewRow[]>();
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

export type HospitalInfo = { id: string; name: string; region: string | null; address: string | null; rating_avg: number; rating_count: number };

// 병원 1곳 정보(리뷰가 0건이어도 필요 — "첫 리뷰 작성" 화면을 위해).
export async function getHospital(id: string): Promise<HospitalInfo | null> {
  if (!UUID_RE.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("hospitals")
    .select("id, name, region, address, rating_avg, rating_count")
    .eq("id", id).maybeSingle<HospitalInfo>();
  return data ?? null;
}

// 특정 병원의 리뷰 전체(숨김 제외 — RLS).
export async function getHospitalReviews(hospitalId: string): Promise<ReviewRow[]> {
  if (!UUID_RE.test(hospitalId)) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("reviews").select(SELECT)
    .eq("hospital_id", hospitalId).order("created_at", { ascending: false })
    .returns<ReviewRow[]>();
  return data ?? [];
}
