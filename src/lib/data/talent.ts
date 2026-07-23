import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/user";
import { SHEET_COLS, type ResumeSheetFields } from "@/lib/data/resume";

// 인재 검색(병원 → 공개 이력서). 열람 자격은 DB 정책(resumes_select_advertiser)이 최종 판정하고,
// 여기서는 화면 안내를 위해 같은 조건을 한 번 더 확인한다.
export type TalentRow = ResumeSheetFields & { profile_id: string; updated_at: string };

const COLS = `profile_id,${SHEET_COLS},updated_at`;

export const TALENT_PER_PAGE = 20;

// 광고 노출 중인 공고가 하나라도 있으면 열람 가능.
export async function isAdvertiser(): Promise<boolean> {
  const user = await getSessionUser();
  if (!user) return false;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("id, hospital:hospitals!inner(owner_profile_id)")
    .eq("hospitals.owner_profile_id", user.id)
    .gt("featured_until", new Date().toISOString())
    .limit(1);
  // 열람 자격 판정이라 실패 시에는 막는 쪽(false)이 맞다 — 조회가 안 되는데 열어주면 이력서가 샌다.
  // 다만 광고 병원이 영문 모른 채 잠긴 화면을 볼 수 있으므로 원인은 반드시 남긴다.
  if (error) console.error("isAdvertiser failed:", error.message);
  return (data?.length ?? 0) > 0;
}

export type TalentFilters = { specialty?: string; location?: string; minYears?: number };

// PostgREST or 필터 주입 방지: %,(),쉼표 제거 (jobs.ts와 동일 규칙)
const clean = (s: string) => s.replace(/[%,()]/g, "").trim();

export async function searchTalent(f: TalentFilters, page = 1): Promise<{ rows: TalentRow[]; total: number }> {
  const supabase = await createClient();
  const from = (Math.max(1, page) - 1) * TALENT_PER_PAGE;
  let query = supabase
    .from("resumes")
    .select(COLS, { count: "exact" })
    .eq("is_public", true)
    .order("updated_at", { ascending: false })
    .range(from, from + TALENT_PER_PAGE - 1);

  if (f.specialty) query = query.contains("specialties", [f.specialty]);
  const loc = f.location ? clean(f.location) : "";
  if (loc) query = query.ilike("desired_location", `%${loc}%`);
  if (f.minYears && f.minYears > 0) query = query.gte("experience_years", f.minYears);

  const { data, count, error } = await query.returns<TalentRow[]>();
  if (error) {
    console.error("searchTalent failed:", error.message);
    return { rows: [], total: 0 };
  }
  return { rows: data ?? [], total: count ?? 0 };
}
