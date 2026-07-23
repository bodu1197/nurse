import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/user";
import type { Database } from "@/types/database";
import { CAREER_EXPERIENCED } from "@/lib/resumeOptions";

// 경력 계산은 순수 함수라 서버 의존성 없는 @/lib/career 에 있다. 여기서 다시 내보내 소비처가 한 곳에서 쓴다.
export { totalYears, totalMonths, careerText } from "@/lib/career";

type ResumeRow = Database["public"]["Tables"]["resumes"]["Row"];
type WorkRow = Database["public"]["Tables"]["work_experiences"]["Row"];

/**
 * 이력서 한 장에 실리는 항목 — 본인 화면·인쇄 서식·병원의 지원자 조회가 모두 이 목록을 쓴다.
 * 타입과 select 문자열을 **이 배열 하나에서** 뽑아, 한쪽만 고쳐 런타임에 undefined 가 되는 일을 막는다.
 */
const SHEET_FIELDS = [
  // 기본
  "resume_title", "name", "phone", "email", "residence_region",
  // 면허·자격
  "license_type", "license_year", "license_reported", "certifications", "apn_field",
  // 학력
  "education_level", "education", "graduation_status",
  // 경력
  "career_level", "experience_years", "has_integrated_care", "can_charge",
  // 희망 근무조건
  "shift_types", "night_available", "desired_location", "specialties", "desired_hospital_types",
  "desired_employment_type", "desired_salary", "available_from", "needs_dormitory",
  // 소개
  "intro",
] as const satisfies readonly (keyof ResumeRow)[];

export type ResumeSheetFields = Pick<ResumeRow, (typeof SHEET_FIELDS)[number]>;
export type Resume = ResumeSheetFields & Pick<ResumeRow, "is_public">;

export const SHEET_COLS = SHEET_FIELDS.join(",");
const COLS = `${SHEET_COLS},is_public`;

/** 경력 한 줄 — 어느 병원에서 무엇을 했는지. 이게 없으면 '경력 5년'이 전부다. */
const WORK_FIELDS = [
  "id", "hospital_name", "hospital_type", "bed_range", "department",
  "start_ym", "end_ym", "is_current", "shift_type", "position", "duties", "sort_order",
] as const satisfies readonly (keyof WorkRow)[];

export type WorkExperience = Pick<WorkRow, (typeof WORK_FIELDS)[number]>;
export const WORK_COLS = WORK_FIELDS.join(",");

export type ResumeWithWork = Resume & { work: WorkExperience[] };

export async function getMyResume(): Promise<ResumeWithWork | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const [{ data, error }, { data: work }] = await Promise.all([
    supabase.from("resumes").select(COLS).eq("profile_id", user.id).limit(1).returns<Resume[]>(),
    supabase.from("work_experiences").select(WORK_COLS).eq("resume_id", user.id)
      .order("sort_order").returns<WorkExperience[]>(),
  ]);
  if (error) console.error("getMyResume failed:", error.message);
  const resume = data?.[0];
  return resume ? { ...resume, work: work ?? [] } : null;
}

/** 이력서 완성도 % — 무엇을 더 채우면 좋은지 사용자에게 보여주려고 쓴다. */
const SCORED: readonly (keyof ResumeSheetFields)[] = [
  "name", "phone", "license_type", "career_level", "shift_types", "desired_location",
  "email", "residence_region", "license_year", "certifications", "education_level",
  "education", "specialties", "desired_employment_type", "desired_salary", "available_from", "intro",
];

export function completeness(r: ResumeSheetFields, workCount: number): number {
  const filled = SCORED.filter((k) => {
    const v = r[k];
    if (Array.isArray(v)) return v.length > 0;
    return v !== null && v !== undefined && v !== "";
  }).length;
  // 경력 상세 1건 이상을 한 항목으로 친다(신규 간호사는 이 항목이 없어도 100%가 되도록 아래에서 보정)
  const total = SCORED.length + (r.career_level === CAREER_EXPERIENCED ? 1 : 0);
  const score = filled + (r.career_level === CAREER_EXPERIENCED && workCount > 0 ? 1 : 0);
  return Math.round((score / total) * 100);
}
