import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser, type Role } from "@/lib/data/user";
import { SHEET_COLS, type ResumeSheetFields } from "@/lib/data/resume";
import { todayKst, nowMs } from "@/lib/date";
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

/**
 * 카드에 함께 싣는 프로필 값 — 구 널스넷 카드가 성별·나이를 보여줬고 오너가 같은 구성을 요구했다.
 * 성별·나이는 전원 공개, **사진은 아니다** — 얼굴은 이름보다 강한 식별자라
 * 이름·전화와 같은 게이트(광고 병원만, revealContacts)를 태운다(오너 확정).
 * birthday 는 그대로 내보내지 않고 서버에서 나이(정수)로 바꿔 실는다 — 생년월일은 카드에 필요 없다.
 */
type ProfileBits = { gender: string | null; birthday: string | null };

export type PublicTalent = Pick<ResumeRow, (typeof PUBLIC_FIELDS)[number]> & {
  gender: string | null;
  age: number | null;
};
const PUBLIC_COLS = `${PUBLIC_FIELDS.join(",")},profile:profiles(gender,birthday)`;

/**
 * 생년월일 → 만 나이.
 * 🔴 서버 로컬시각(UTC)으로 비교하면 KST 00:00~09:00 사이에 **생일 당일인 사람이 한 살 적게** 나온다.
 *    날짜 비교는 문자열(YYYY-MM-DD)로만 해서 시간대가 개입할 여지를 없앤다.
 *    '지금'은 프로젝트 관례대로 요청당 고정된 nowMs() 를 쓴다(같은 화면에서 값이 흔들리지 않게).
 */
function ageOf(birthday: string | null): number | null {
  if (!birthday || !/^\d{4}-\d{2}-\d{2}/.test(birthday)) return null;
  const [by, bm, bd] = birthday.slice(0, 10).split("-").map(Number);
  const [ty, tm, td] = todayKst(nowMs()).split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1; // 올해 생일이 아직 안 지났으면 한 살 뺀다
  return age >= 0 && age < 120 ? age : null;
}

/**
 * 조인 결과(profile 중첩)를 카드가 쓰는 평평한 모양으로 편다.
 * 제네릭을 쓰지 않는다 — 제네릭은 profile 필드 모양만 보장하고 나머지가 PUBLIC_FIELDS 와 맞는지는
 * 검사하지 못해 `as unknown as` 단언이 필요해진다. 구체 타입으로 받으면 컬럼이 빠졌을 때 컴파일이 깨진다.
 */
type ResumePublicPick = Pick<ResumeRow, (typeof PUBLIC_FIELDS)[number]>;
function flattenProfile(row: ResumePublicPick & { profile?: ProfileBits | null }): PublicTalent {
  const { profile, ...rest } = row;
  return {
    ...rest,
    gender: profile?.gender ?? null,
    age: ageOf(profile?.birthday ?? null),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 인재 사진 보관소 — **비공개 버킷**. 경로만 DB 에 두고 열람 자격을 통과한 요청에만 서명 URL 을 발급한다. */
const AVATAR_BUCKET = "avatars";
/** 서명 URL 수명(초). 한 화면을 보는 동안만 유효하면 충분하고, 새어나가도 곧 죽는다. */
const AVATAR_URL_TTL = 60 * 10;

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
    .not("name", "is", null).maybeSingle<PublicTalent & { profile: ProfileBits | null }>();
  if (!resume) return null;
  const { data: work } = await admin
    .from("work_experiences").select(WORK_PUBLIC_FIELDS.join(",")).eq("resume_id", profileId)
    .order("sort_order").returns<PublicWork[]>();
  return { ...flattenProfile(resume), work: work ?? [] };
}

// 광고 노출 중인 공고가 하나라도 있으면 열람 가능.
export async function isAdvertiser(): Promise<boolean> {
  const user = await getSessionUser();
  if (!user) return false;
  const supabase = await createClient();

  // 테스트 병원(hospitals.is_test)은 광고를 낸 것으로 간주한다 — 결제 없이 광고 병원 화면을
  // 실제와 같게 확인할 수 있어야 한다. 이 병원은 병원 검색·명부에서 이미 제외돼 있어(api/hospitals/search)
  // 일반 사용자에게 새어나가지 않는다.
  const { data: testHosp } = await supabase
    .from("hospitals").select("id").eq("owner_profile_id", user.id).eq("is_test", true).limit(1);
  if ((testHosp?.length ?? 0) > 0) return true;

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

// 인재 이름·전화·사진 열람 자격 — 광고 중인 병원 또는 관리자. 목록·상세가 같은 판정을 쓰게 한 곳에 둔다
// (양쪽에 복붙하면 한쪽만 바뀔 때 PII가 샌다).
//
// 🔴 role 이 아니라 isAdmin(=DB상 실제 관리자)으로 판정한다.
//    getMyProfile 의 role 은 '보기 전환'이 적용된 값이라, 관리자가 병원 보기로 바꾸는 순간
//    role='hospital' 이 되어 관리자 권한을 잃는다 → 광고를 실제로 사기 전까지 화면을 확인할 방법이 없어진다.
//    비광고 병원 화면을 확인하려면 관리자 계정 대신 병원 테스트 계정으로 보면 된다.
export async function canRevealContacts(p: { role: Role; isAdmin?: boolean } | null): Promise<boolean> {
  if (!p) return false;
  if (p.isAdmin || p.role === "admin") return true;
  return p.role === "hospital" && (await isAdvertiser());
}

export type TalentFilters = { specialty?: string; sido?: string; sigungu?: string; minYears?: number };

// PostgREST or 필터 주입 방지: %,(),쉼표 제거 (jobs.ts와 동일 규칙)
const clean = (s: string) => s.replace(/[%,()]/g, "").trim();

// 공개 인재 목록 — 이름·전화 없이 누구나 본다.
// admin 클라이언트로 조회하되 select에서 이름·전화를 아예 빼서, 공개 화면 payload에 PII가 실리지 않는다.
// (resumes_select_advertiser RLS는 행 전체를 광고 병원에게만 여는데, 그러면 목록이 비어 마켓이 죽는다.)
export async function searchPublicTalent(f: TalentFilters, page = 1, withCount = true): Promise<{ rows: PublicTalent[]; total: number }> {
  const admin = createAdminClient();
  const from = (Math.max(1, page) - 1) * TALENT_PER_PAGE;
  let query = admin
    .from("resumes")
    .select(PUBLIC_COLS, withCount ? { count: "exact" } : undefined)
    .eq("is_public", true)
    // 이름이 없는 이력서는 카드에 보여줄 게 부실하고 연락도 안 되므로 목록에서 제외한다.
    .not("name", "is", null)
    .order("updated_at", { ascending: false })
    .range(from, from + TALENT_PER_PAGE - 1);

  if (f.specialty) query = query.contains("specialties", [f.specialty]);
  // 희망지역은 "서울 종로구, 경기 성남시" 처럼 여러 개가 한 컬럼에 있어 부분일치로 건다.
  // 시군구는 시도에 종속 — 시도 없이 걸면 '중구'처럼 여러 시도에 있는 이름이 엉뚱한 지역을 긁는다(jobs 와 같은 계약).
  const sido = f.sido ? clean(f.sido) : "";
  const sigungu = sido && f.sigungu ? clean(f.sigungu) : "";
  if (sido) query = query.ilike("desired_location", `%${sigungu ? `${sido} ${sigungu}` : sido}%`);
  if (f.minYears && f.minYears > 0) query = query.gte("experience_years", f.minYears);

  const { data, count, error } = await query.returns<(PublicTalent & { profile: ProfileBits | null })[]>();
  if (error) {
    console.error("searchPublicTalent failed:", error.message);
    return { rows: [], total: 0 };
  }
  return { rows: (data ?? []).map(flattenProfile), total: withCount ? (count ?? 0) : (data?.length ?? 0) };
}

// 인재 상세 좌측 사이드바 — 관련 인재(같은 희망 근무지 우선, 없으면 최근)로 왼쪽이 절대 비지 않게 한다.
// sameRegion=false면 제목에 지역명을 쓰지 않는다. searchPublicTalent 재사용(COUNT 생략).
export async function getRelatedTalent(profileId: string, desiredLocation: string | null, limit = 8): Promise<{ rows: PublicTalent[]; sameRegion: boolean }> {
  const region = (desiredLocation ?? "").split(",")[0].trim().split(/\s+/)[0] ?? "";
  if (region) {
    const { rows } = await searchPublicTalent({ sido: region }, 1, false);
    const same = rows.filter((r) => r.profile_id !== profileId);
    if (same.length > 0) return { rows: same.slice(0, limit), sameRegion: true };
  }
  const { rows } = await searchPublicTalent({}, 1, false);
  return { rows: rows.filter((r) => r.profile_id !== profileId).slice(0, limit), sameRegion: false };
}

export type RevealedContact = { name: string | null; phone: string | null; email: string | null; avatarUrl: string | null };

/**
 * 광고 병원에게만 이름·전화·**이메일·사진**을 붙여준다. profile_id 목록으로만 조회하므로 범위가 좁다.
 * 이메일은 전화를 안 받거나 안 적은 사람에게 닿는 유일한 수단이다(실측: 전화 6,817 < 이메일 7,257).
 * 호출 전에 반드시 isAdvertiser()로 자격을 확인할 것.
 * 사진을 여기 둔 이유: 얼굴은 이름보다 강한 식별자라, 이름을 가려도 사진이 공개면 가린 의미가 없다.
 */
export async function revealContacts(profileIds: readonly string[]): Promise<Map<string, RevealedContact>> {
  if (profileIds.length === 0) return new Map();
  const admin = createAdminClient();
  // is_public 재확인 — 호출부가 이미 공개 rows로 좁히지만, 여기서도 막아 오용 시 비공개 연락처가 새지 않게.
  const { data, error } = await admin.from("resumes").select("profile_id,name,phone,email,profile:profiles(avatar_url)")
    .in("profile_id", [...profileIds]).eq("is_public", true)
    .returns<Array<{ profile_id: string; name: string | null; phone: string | null; email: string | null; profile: { avatar_url: string | null } | null }>>();
  if (error) console.error("revealContacts failed:", error.message);
  const rows = data ?? [];

  // 사진은 비공개 버킷에 있고 avatar_url 에는 **오브젝트 경로**만 저장돼 있다(전체 URL 이 아니다).
  // 공개 URL 로 두면 목록에 실리는 profile_id 로 경로를 조합해 누구나 얼굴 사진을 가져갈 수 있어
  // 게이트가 무의미해진다(/review8 지적) → 자격을 통과한 이 지점에서만 단기 서명 URL 을 만든다.
  // 네이버 가입 시 들어온 외부 프로필 URL(http…)은 우리 버킷이 아니므로 그대로 쓴다.
  const paths = rows.map((r) => r.profile?.avatar_url).filter((v): v is string => !!v && !v.startsWith("http"));
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: urls, error: signErr } = await admin.storage.from(AVATAR_BUCKET).createSignedUrls(paths, AVATAR_URL_TTL);
    if (signErr) console.error("createSignedUrls failed:", signErr.message);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }

  return new Map(rows.map((r) => {
    const raw = r.profile?.avatar_url ?? null;
    const avatarUrl = raw ? (raw.startsWith("http") ? raw : signed.get(raw) ?? null) : null;
    return [r.profile_id, { name: r.name, phone: r.phone, email: r.email, avatarUrl }];
  }));
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
  // 희망지역은 "서울 종로구, 경기 성남시" 처럼 여러 개가 한 컬럼에 있어 부분일치로 건다.
  // 시군구는 시도에 종속 — 시도 없이 걸면 '중구'처럼 여러 시도에 있는 이름이 엉뚱한 지역을 긁는다(jobs 와 같은 계약).
  const sido = f.sido ? clean(f.sido) : "";
  const sigungu = sido && f.sigungu ? clean(f.sigungu) : "";
  if (sido) query = query.ilike("desired_location", `%${sigungu ? `${sido} ${sigungu}` : sido}%`);
  if (f.minYears && f.minYears > 0) query = query.gte("experience_years", f.minYears);

  const { data, count, error } = await query.returns<TalentRow[]>();
  if (error) {
    console.error("searchTalent failed:", error.message);
    return { rows: [], total: 0 };
  }
  return { rows: data ?? [], total: count ?? 0 };
}
