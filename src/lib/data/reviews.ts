import { createClient } from "@/lib/supabase/server";

export type ReviewRow = {
  id: string;
  rating: number;
  content: string;
  work_period: string | null;
  created_at: string;
  hospital: { name: string; region: string | null } | null;
};

// 공개 리뷰 목록(숨김 제외 — RLS). 비실명.
export async function getRecentReviews(limit = 20): Promise<ReviewRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reviews")
    .select("id, rating, content, work_period, created_at, hospital:hospitals(name, region)")
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<ReviewRow[]>();
  if (error) {
    console.error("getRecentReviews:", error.message);
    return [];
  }
  return data ?? [];
}
