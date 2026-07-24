import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser, type Role } from "@/lib/data/user";
import { SHEET_COLS, type ResumeSheetFields } from "@/lib/data/resume";
import type { Database } from "@/types/database";

// 인재 검색(병원 → 공개 이력서). 열람 자격은 DB 정책(resumes_select_advertiser)이 최종 판정하고,
// 여기서는 화면 안내를 위해 같은 조건을 한 번 더 확인한다.
export type TalentRow = ResumeSheetFields & { profile_id: string; updated_at: string };

const COLS = `profile_id,${SHEET_COLS},updated_at`;

export const TALENT_PER_PAGE = 20;

type ResumeRow = Database["public"]["Tables"]["resumes"]["Row"];

/**
 * 공개 인재 목록 카드에 실을 항목 — **이름·전화·이메일은 뺀다.**
 * RLS는 행 단위라 컬럼을 가릴 수 없으므로, 여기서 안전 컬럼만 골라 조회하고
 * 연락처는 광고 병원에게만 별도로 붙인다(revealContacts).
 */
const PUBLIC_FIELDS = [
  "profile_id", "resume_title", "residence_region", "license_type", "license_year", "license_reported",
  "certifications", "apn_field", "education_level", "education", "graduation_status",
  "career_level", "experience_years", "has_integrated_care", "can_charge",
  "shift_types", "night_available", "desired_location", "specialties", "desired_hospital_types",
  "desired_employment_type", "desired_salary", "available_from", "needs_dormitory", "intro", "updated_at",
] as const satisfies readonly (keyof ResumeRow)[];

export type PublicTalent = Pick<ResumeRow, (typeof PUBLIC_FIELDS)[number]>;
const PUBLIC_COLS = PUBLIC_FIELDS.join(",");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type WorkRow = Database["public"]["Tables"]["work_experiences"]["Row"];
const WORK_PUBLIC_FIELDS = [
  "id", "hospital_name", "hospital_type", "bed_range", "department",
  "start_ym", "end_ym", "is_current", "shift_type", "position", "duties", "sort_order",
] as const satisfies readonly (keyof WorkRow)[];
export type PublicWork = Pick<WorkRow, (typeof WORK_PUBLIC_FIELDS)[number]>;

export type PublicTalentDetail = PublicTalent & { work: PublicWork[] };

// 인재 상세(우측 패널) — 안전 컬럼만. 이름·전화는 여기서도 빼고, 광고 병원엔 revealContacts로 따로 붙인다.
// work_experiences는 RLS가 광고 병원만 열어주므로 admin으로 조회하되(직무 이력=공개 이력서 내용) 이름·전화는 없다.
export async function getPublicTalent(profileId: string): Promise<PublicTalentDetail | null> {
  if (!UUID_RE.test(profileId)) return null;
  const admin = createAdminClient();
  const { data: resume } = await admin
    .from("resumes").select(PUBLIC_COLS).eq("profile_id", profileId).eq("is_public", true)
    .not("name", "is", null).maybeSingle<PublicTalent>();
  if (!resume) return null;
  const { data: work } = await admin
    .from("work_experiences").select(WORK_PUBLIC_FIELDS.join(",")).eq("resume_id", profileId)
    .order("sort_order").returns<PublicWork[]>();
  return { ...resume, work: work ?? [] };
}

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

// 인재 이름·전화 열람 자격 — 광고 중인 병원 또는 관리자. 목록·상세가 같은 판정을 쓰게 한 곳에 둔다
// (양쪽에 복붙하면 한쪽만 바뀔 때 PII가 샌다).
export async function canRevealContacts(p: { role: Role } | null): Promise<boolean> {
  if (!p) return false;
  if (p.role === "admin") return true;
  return p.role === "hospital" && (await isAdvertiser());
}

export type TalentFilters = { specialty?: string; location?: string; minYears?: number };

// PostgREST or 필터 주입 방지: %,(),쉼표 제거 (jobs.ts와 동일 규칙)
const clean = (s: string) => s.replace(/[%,()]/g, "").trim();

// 공개 인재 목록 — 이름·전화 없이 누구나 본다.
// admin 클라이언트로 조회하되 select에서 이름·전화를 아예 빼서, 공개 화면 payload에 PII가 실리지 않는다.
// (resumes_select_advertiser RLS는 행 전체를 광고 병원에게만 여는데, 그러면 목록이 비어 마켓이 죽는다.)
export async function searchPublicTalent(f: TalentFilters, page = 1): Promise<{ rows: PublicTalent[]; total: number }> {
  const admin = createAdminClient();
  const from = (Math.max(1, page) - 1) * TALENT_PER_PAGE;
  let query = admin
    .from("resumes")
    .select(PUBLIC_COLS, { count: "exact" })
    .eq("is_public", true)
    // 이름이 없는 이력서는 카드에 보여줄 게 부실하고 연락도 안 되므로 목록에서 제외한다.
    .not("name", "is", null)
    .order("updated_at", { ascending: false })
    .range(from, from + TALENT_PER_PAGE - 1);

  if (f.specialty) query = query.contains("specialties", [f.specialty]);
  const loc = f.location ? clean(f.location) : "";
  if (loc) query = query.ilike("desired_location", `%${loc}%`);
  if (f.minYears && f.minYears > 0) query = query.gte("experience_years", f.minYears);

  const { data, count, error } = await query.returns<PublicTalent[]>();
  if (error) {
    console.error("searchPublicTalent failed:", error.message);
    return { rows: [], total: 0 };
  }
  return { rows: data ?? [], total: count ?? 0 };
}

/**
 * 광고 병원에게만 이름·전화를 붙여준다. profile_id 목록으로만 조회하므로 범위가 좁다.
 * 호출 전에 반드시 isAdvertiser()로 자격을 확인할 것.
 */
export async function revealContacts(profileIds: readonly string[]): Promise<Map<string, { name: string | null; phone: string | null }>> {
  if (profileIds.length === 0) return new Map();
  const admin = createAdminClient();
  // is_public 재확인 — 호출부가 이미 공개 rows로 좁히지만, 여기서도 막아 오용 시 비공개 연락처가 새지 않게.
  const { data, error } = await admin.from("resumes").select("profile_id,name,phone")
    .in("profile_id", [...profileIds]).eq("is_public", true)
    .returns<Array<{ profile_id: string; name: string | null; phone: string | null }>>();
  if (error) console.error("revealContacts failed:", error.message);
  return new Map((data ?? []).map((r) => [r.profile_id, { name: r.name, phone: r.phone }]));
}

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
