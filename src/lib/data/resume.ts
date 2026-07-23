import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/user";
import type { Database } from "@/types/database";

type ResumeRow = Database["public"]["Tables"]["resumes"]["Row"];

/**
 * 이력서 한 장에 실리는 항목 — 본인 화면·인쇄 서식·병원의 지원자 조회가 모두 이 목록을 쓴다.
 * 타입과 select 문자열을 **이 배열 하나에서** 뽑아, 한쪽만 고쳐 런타임에 undefined가 되는 일을 막는다.
 * satisfies가 컬럼 이름 오타를, keyof가 컬럼 삭제를 컴파일에서 잡는다.
 */
const SHEET_FIELDS = [
  "name", "phone", "license_type", "experience_years", "education",
  "specialties", "desired_location", "desired_employment_type", "desired_salary", "intro",
] as const satisfies readonly (keyof ResumeRow)[];

export type ResumeSheetFields = Pick<ResumeRow, (typeof SHEET_FIELDS)[number]>;
export type Resume = ResumeSheetFields & Pick<ResumeRow, "is_public">;

export const SHEET_COLS = SHEET_FIELDS.join(",");

const COLS = `${SHEET_COLS},is_public`;

export async function getMyResume(): Promise<Resume | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("resumes").select(COLS).eq("profile_id", user.id).limit(1).returns<Resume[]>();
  if (error) console.error("getMyResume failed:", error.message);
  return data?.[0] ?? null;
}
