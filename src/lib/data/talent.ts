import "server-only"; // 이 파일은 마스킹 전 원문·연락처를 다룬다 — 클라이언트 번들에 섞이면 안 된다
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/user";
import type { Role } from "@/lib/data/user";
import { getMembership } from "@/lib/data/membership";
import { signAvatarPaths } from "@/lib/data/avatar";
import { maskDeep } from "@/lib/maskPii";
import { todayKst, nowMs } from "@/lib/date";
import type { Database } from "@/types/database";

// 인재 검색(병원 → 공개 이력서). 열람 자격은 DB 정책(resumes_select_advertiser)이 최종 판정하고,
// 여기서는 화면 안내를 위해 같은 조건을 한 번 더 확인한다.

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
  "desired_employment_type", "desired_salary", "available_from", "needs_dormitory", "intro", "created_at", "last_edited_at",
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
// 🔴 name 을 함께 읽는다. **내보내기 위해서가 아니라 지우기 위해서**다 —
//    본인이 제목·자기소개에 자기 이름을 적어둔 경우(실측: 제목 219건, 소개 235건)를
//    가려내려면 그 이름을 알아야 한다. flattenProfile 이 마스킹한 뒤 필드를 버린다.
const PUBLIC_COLS = `${PUBLIC_FIELDS.join(",")},name,profile:profiles(gender,birthday)`;

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
/**
 * 자유서술 마스킹은 lib/maskPii 한 곳에 있다 — **server-only 인 이 파일에서는 검사를 못 붙이기 때문**이다.
 * 되돌릴 수 없는 실수가 나는 자리라 순수 함수로 떼어 테스트(lib/maskPii.test.ts)로 지킨다.
 *
 * 실측 근거: 공개 이력서 7,257건 중 제목에 219건, 자기소개에 235건의 본인 실명이 적혀 있었고
 * 휴대폰 7건·이메일 1건이 자유서술에 들어 있었다. 이름·연락처를 광고 병원에만 여는 게이트가
 * 이 마스킹 없이는 그냥 뚫린다.
 */

function flattenProfile(row: ResumePublicPick & { name?: string | null; profile?: ProfileBits | null }): PublicTalent {
  // name 은 여기서 소비하고 **버린다** — 반환 타입(PublicTalent)에 없으므로 밖으로 나가지 않는다.
  const { profile, name, ...rest } = row;
  const n = name ?? null;
  // 🔴 컬럼을 골라서 가리지 않는다. 공개로 나가는 **문자열 전부**를 관문에 통과시킨다 —
  //    골라서 가리면 컬럼이 늘어난 날 그 하나가 빠지고, 그게 실제로 일어났다(lib/maskPii 주석 참고).
  return {
    ...maskDeep(rest, n),
    gender: profile?.gender ?? null,
    age: ageOf(profile?.birthday ?? null),
  };
}

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
// 🔴 cache(): generateMetadata 와 페이지 본문이 **같은 이력서를 각각 부른다** — 감싸지 않으면
//    요청 한 건에 쿼리가 4회(이력서 2 + 경력 2) 나간다. 공고 쪽은 이미 이렇게 하고 있다
//    (jobs.ts 의 getPublicJob). /talent/:id 는 이 사이트에서 가장 많이 열리는 주소라 차이가 크다.
//    덤으로 제목과 본문이 **같은 스냅샷**을 쓴다 — 두 조회 사이에 이력서가 비공개로 바뀌면
//    제목은 뜨는데 본문만 404 가 되는 어긋남이 사라진다.
export const getPublicTalent = cache(async (profileId: string): Promise<PublicTalentDetail | null> => {
  if (!UUID_RE.test(profileId)) return null;
  const admin = createAdminClient();
  const { data: resume, error: resumeErr } = await admin
    .from("resumes").select(PUBLIC_COLS).eq("profile_id", profileId).eq("is_public", true)
    .not("name", "is", null).maybeSingle<PublicTalent & { name: string | null; profile: ProfileBits | null }>();
  // 🔴 오류를 삼키지 않는다. 삼키면 DB 장애·권한 변경이 **"그런 이력서 없음"(404)** 과 구분되지 않아,
  //    사이트맵에 올린 주소가 통째로 404 가 돼도 로그에 아무것도 안 남는다.
  if (resumeErr) console.error("getPublicTalent(resume) failed:", resumeErr.message, profileId);
  if (!resume) return null;
  const { data: work, error: workErr } = await admin
    .from("work_experiences").select(WORK_PUBLIC_FIELDS.join(",")).eq("resume_id", profileId)
    .order("sort_order").returns<PublicWork[]>();
  // 경력 조회가 실패하면 경력이 **없는 것처럼** 보인다(빈 배열). 조용히 넘어가면
  // "경력을 다 지웠나" 하는 문의로만 드러난다.
  if (workErr) console.error("getPublicTalent(work) failed:", workErr.message, profileId);
  // 경력도 같은 관문을 통과시킨다 — duties(담당업무)는 최대 1,000자 자유서술이고 상세가 통째로 찍는다.
  // 병원명·부서·직위도 사람이 타이핑하는 칸이라 "○○병원 010-…" 이 들어올 수 있다.
  // 🔴 여기서도 컬럼을 고르지 않는다(위 flattenProfile 과 같은 이유).
  const masked = (work ?? []).map((w) => maskDeep(w, resume.name));
  return { ...flattenProfile(resume), work: masked };
});

// 광고 노출 중인 공고가 하나라도 있으면 열람 가능.
/**
 * 인재정보를 볼 수 있는가 = 병원회원(광고를 낸 병원)인가.
 * 판정은 lib/data/membership.ts 한 곳 — 간호사 쪽 게이트와 같은 표를 쓴다.
 */
export async function isAdvertiser(): Promise<boolean> {
  return (await getMembership()).canViewTalent;
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

/**
 * 인재 검색 조건 → 쿼리스트링. 목록·카드→상세·사이드바 페이지네이션이 **같은 직렬화**를 쓴다.
 *
 * 🔴 이게 없어서 목록 카드가 `/talent/{id}` 로만 링크했고, 상세는 조건을 받지도 않았다.
 *    그래서 "서울 종로구 산부인과" 로 좁혀 들어가도 상세 왼쪽에는 조건과 무관한
 *    '같은 시도 인재 8명' 이 고정으로 떴다(공고 쪽은 jobFilterQs 로 이미 이어져 있었다).
 */
export function talentFilterQs(
  f: { q?: string; dept?: string; cat?: string; sido?: string; sigungu?: string; years?: number },
  page?: number,
): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.dept) p.set("dept", f.dept);
  if (f.cat) p.set("cat", f.cat);
  if (f.sido) p.set("sido", f.sido);
  if (f.sido && f.sigungu) p.set("sigungu", f.sigungu); // 시군구는 시도에 종속(검색 계약과 동일)
  if (f.years && f.years > 0) p.set("years", String(f.years));
  if (page && page > 1) p.set("page", String(page));
  return p.toString();
}

export type TalentFilters = {
  q?: string; specialty?: string; category?: string; sido?: string; sigungu?: string; minYears?: number;
  // 🤖 AI 자동매치(병원 쪽) 전용 — 게재 중인 공고가 여러 건이라 조건이 **여러 개**다.
  //    위 단수 필드는 화면 필터(한 번에 하나)라 그대로 두고, 겹치는 것을 찾는 축만 배열로 더한다.
  //    specialtiesAny 는 근무부서 배열끼리 겹치는지(overlaps), sidosAny 는 희망근무지 텍스트
  //    부분일치를 or 로 묶는다. 🔴 sidosAny 는 **이력서 표기**('서울')여야 한다 —
  //    공고 canonical('서울특별시')을 그대로 넣으면 한 건도 안 걸린다(lib/match 의 shortSidos 로 바꿔서 넘길 것).
  specialtiesAny?: readonly string[];
  sidosAny?: readonly string[];
};

// 🗂 지역 계단 노드(도/시군구 + 인재 수) — nurse_talent_sido_list / nurse_talent_sigungu_list RPC 반환형.
//    고정 표(koreaRegions)를 그대로 뿌리지 않고 **실제 인재가 있는 곳만** 내려준다(오너 확정 2026-07-28:
//    "부산 수영구에 한 명도 없으면 수영구는 안 보이게"). RPC 술어는 searchPublicTalent 와 같아 건수가 일치한다.
//    ⚠️ resumes 는 RLS 로 잠겨 있어 anon 클라이언트로는 빈 결과가 나온다 → 목록과 같은 admin 클라이언트로 부른다.
export type TalentRegionNode = { name: string; cnt: number };

export const getTalentSidoList = cache(async (): Promise<TalentRegionNode[]> => {
  const { data, error } = await createAdminClient().rpc("nurse_talent_sido_list");
  if (error) console.error("getTalentSidoList failed:", error.message);
  return data ?? [];
});

// 선택한 도의 시군구. 시도 미선택이면 즉시 [](비용 0).
export const getTalentSigunguList = cache(async (sido: string): Promise<TalentRegionNode[]> => {
  if (!sido) return [];
  const { data, error } = await createAdminClient().rpc("nurse_talent_sigungu_list", { p_sido: clean(sido) });
  if (error) console.error("getTalentSigunguList failed:", error.message);
  return data ?? [];
});

/**
 * 근무부서·직종 칩 — **인재가 있는 것만** 많은 순으로. 지역 계단과 같은 사고방식이다.
 * 전에는 고정 목록(JOB_SPECIALTIES 9개)을 뿌렸는데 그 중 6개가 0명이라, 누르면 빈 화면이 나왔다.
 * 한 번의 RPC 로 둘 다 받는다(따로 부르면 7천 행을 두 번 훑는다).
 */
export const getTalentFacets = cache(async (): Promise<{ departments: TalentRegionNode[]; categories: TalentRegionNode[] }> => {
  const { data, error } = await createAdminClient().rpc("nurse_talent_facet_list");
  if (error) console.error("getTalentFacets failed:", error.message);
  const rows = data ?? [];
  const pick = (kind: string) => tailLast(rows.filter((r) => r.kind === kind).map(({ name, cnt }) => ({ name, cnt })));
  return { departments: pick("department"), categories: pick("category") };
});

/**
 * "기타"류는 인재 수가 많아도 **맨 뒤**로 보낸다.
 * 기타(869명)가 내과·정형외과보다 앞에 오면 목록이 이상해 보인다(오너 지적 2026-07-28).
 * sort 는 안정 정렬이라 같은 무리 안에서는 RPC 가 준 인재 수 내림차순이 그대로 유지된다.
 */
const TAIL_LAST = new Set(["기타", "의료기타"]);
const tailLast = (rows: TalentRegionNode[]): TalentRegionNode[] =>
  [...rows].sort((a, b) => Number(TAIL_LAST.has(a.name)) - Number(TAIL_LAST.has(b.name)));

// PostgREST or 필터 주입 방지: %,(),쉼표 제거 (jobs.ts와 동일 규칙)
const clean = (s: string) => s.replace(/[%,()]/g, "").trim();

// 공개 인재 목록 — 이름·전화 없이 누구나 본다.
// admin 클라이언트로 조회하되 select에서 이름·전화를 아예 빼서, 공개 화면 payload에 PII가 실리지 않는다.
// (resumes_select_advertiser RLS는 행 전체를 광고 병원에게만 여는데, 그러면 목록이 비어 마켓이 죽는다.)
export async function searchPublicTalent(
  f: TalentFilters,
  page = 1,
  withCount = true,
  // 홈의 '구직 현황' 처럼 목록보다 적게 쓰는 화면용. 기본은 목록 크기(20).
  // 없으면 20건을 받아 10건만 쓰는 낭비가 생긴다.
  perPage = TALENT_PER_PAGE,
): Promise<{ rows: PublicTalent[]; total: number }> {
  const admin = createAdminClient();
  const from = (Math.max(1, page) - 1) * perPage;
  let query = admin
    .from("resumes")
    .select(PUBLIC_COLS, withCount ? { count: "exact" } : undefined)
    .eq("is_public", true)
    // 이름이 없는 이력서는 카드에 보여줄 게 부실하고 연락도 안 되므로 목록에서 제외한다.
    .not("name", "is", null)
    // 🔴 정렬 키는 last_edited_at — **사람이 마지막으로 저장한 시각**이다.
    //    updated_at 은 못 쓴다: 이관·이름정리 배치가 8,070건을 오늘로 밀어놔서, 그걸로 줄을 세우면
    //    아무도 손대지 않은 이력서가 1페이지를 덮는다.
    //    created_at 도 못 쓴다: 이 사이트에서 이력서를 새로 채우는 사람 대부분이 레거시 회원이라
    //    이미 있는 행을 UPDATE 한다 → 최초작성일은 2025년 그대로 → **오늘 쓴 사람이 8,000건 뒤로 밀린다**
    //    (실측: 남경화 2026-01-23 최초작성, 오늘 13:18 저장).
    //    last_edited_at 은 saveResume 이 저장할 때만 넣는다(20260804290000). 배치에 안 흔들린다.
    .order("last_edited_at", { ascending: false, nullsFirst: false })
    .order("profile_id", { ascending: false })
    .range(from, from + perPage - 1);

  if (f.specialty) query = query.contains("specialties", [f.specialty]);
  if (f.category) query = query.contains("job_categories", [f.category]);
  // 키워드 — **가려진 사본(search_text)** 에서만 찾는다. 제목·자기소개 원문을 그대로 뒤지면
  // 안 된다. 카드에는 '김○○' 로 나와도 `?q=김민수` 가 그 사람만 남기면(0건/1건) 그 화면의
  // 나이·성별·거주지역·학력·경력과 묶여 **실명이 확정된다**. /talent 는 로그인 게이트도 없다.
  // search_text 는 표시와 같은 규칙(이름·전화·이메일)으로 가린 값이고, DB 트리거가 유지한다
  // (마이그레이션 20260730200000). 원문은 그대로 남아 있다 — 표시 단계에서 다시 가린다.
  const kw = f.q ? clean(f.q) : "";
  if (kw) query = query.ilike("search_text", `%${kw}%`);
  // 희망지역은 "서울 종로구, 경기 성남시" 처럼 여러 개가 한 컬럼에 있어 부분일치로 건다.
  // 시군구는 시도에 종속 — 시도 없이 걸면 '중구'처럼 여러 시도에 있는 이름이 엉뚱한 지역을 긁는다(jobs 와 같은 계약).
  const sido = f.sido ? clean(f.sido) : "";
  const sigungu = sido && f.sigungu ? clean(f.sigungu) : "";
  if (sido) query = query.ilike("desired_location", `%${sigungu ? `${sido} ${sigungu}` : sido}%`);
  if (f.minYears && f.minYears > 0) query = query.gte("experience_years", f.minYears);
  // 자동매치용 다중 조건. 축끼리는 AND, 축 안에서는 OR — 공고 A 의 지역이든 공고 B 의 지역이든 맞으면 후보다.
  if (f.specialtiesAny?.length) query = query.overlaps("specialties", [...f.specialtiesAny]);
  if (f.sidosAny?.length) {
    query = query.or(f.sidosAny.map((s) => `desired_location.ilike.%${clean(s)}%`).join(","));
  }

  const { data, count, error } = await query.returns<(PublicTalent & { name: string | null; profile: ProfileBits | null })[]>();
  if (error) {
    console.error("searchPublicTalent failed:", error.message);
    return { rows: [], total: 0 };
  }
  return { rows: (data ?? []).map(flattenProfile), total: withCount ? (count ?? 0) : (data?.length ?? 0) };
}

/**
 * sitemap 에 실을 공개 이력서. **searchPublicTalent 와 같은 술어**(is_public + 이름 있음)를 쓴다 —
 * 어긋나면 사이트맵에 올린 주소가 상세에서 404 로 떨어져, 검색엔진에 "없는 페이지를 색인하라"고
 * 시키는 꼴이 된다(getSitemapJobs 와 같은 이유·같은 방식).
 *
 * 🔴 anon 으로는 못 읽는다 — resumes 는 RLS 로 광고 병원에만 열려 있어 목록이 통째로 빈다.
 *    그래서 admin 클라이언트를 쓰되 **id 와 시각만** 꺼낸다(PII 는 애초에 select 하지 않는다).
 * 🔴 키가 없으면 던지지 않고 빈 배열을 준다 — 사이트맵 전체(공고 1,300여 건)를 인재 때문에 잃지 않는다.
 *    (미리보기 배포처럼 service_role 키가 없는 환경에서 빌드가 통째로 깨지지 않게.)
 *
 * 반환 필드를 `updated_at` 이라 부르지 않는다 — 값의 출처가 `resumes.updated_at` 이 아니라
 * `last_edited_at ?? created_at` 이다(updated_at 은 이관 배치가 8,070건을 오늘로 밀어놔 못 쓴다,
 * searchPublicTalent 주석 참고). 이름을 컬럼명과 같게 두면 다음 사람이 그 컬럼이라고 믿는다.
 */
const SITEMAP_FIELDS = ["profile_id", "last_edited_at", "created_at"] as const satisfies readonly (keyof ResumeRow)[];

export async function getSitemapTalent(): Promise<{ id: string; lastModified: string }[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("getSitemapTalent: Supabase admin 환경변수 누락");
    return [];
  }
  const admin = createAdminClient();
  // PostgREST 는 max_rows(1000)를 하드 상한으로 걸어 .limit 을 줘도 조용히 잘린다 → range 로 나눠 받는다.
  // 상한 50,000 은 사이트맵 파일 하나의 URL 상한과 같은 수다(그 위로는 실어봐야 무시된다).
  const PAGE = 1000;
  const out: { id: string; lastModified: string }[] = [];
  for (let from = 0; from < 50_000; from += PAGE) {
    const { data, error } = await admin
      .from("resumes").select(SITEMAP_FIELDS.join(","))
      .eq("is_public", true).not("name", "is", null)
      // profile_id 는 resumes 의 PK 라 정렬키가 유일하다 — 쪽 경계에서 행이 겹치거나 빠지지 않는다.
      .order("profile_id", { ascending: true })
      .range(from, from + PAGE - 1)
      .returns<Pick<ResumeRow, (typeof SITEMAP_FIELDS)[number]>[]>();
    if (error) {
      console.error("getSitemapTalent failed:", error.message);
      // 🔴 **던지지 않는다.** sitemap.ts 는 이 함수를 getSitemapJobs 와 Promise.all 로 묶어 부르고,
      //    sitemap 라우트는 빌드 시점에 미리 만들어진다 — 여기서 던지면 DB 가 잠깐 흔들린 것만으로
      //    공고 1,300건까지 함께 날아가고 **배포 자체가 깨진다.** 사이트맵에서 URL 이 빠지는 것은
      //    "색인에서 빼라" 는 신호가 아니라 발견 힌트가 줄어드는 것뿐이라(구글 문서화된 동작),
      //    한 시간 뒤 다음 재검증에서 회복된다. 배포를 막을 만한 사고가 아니다.
      //    받은 데까지 내보낸다 — getSitemapJobs 도 같은 방식이다.
      break;
    }
    const rows = data ?? [];
    for (const r of rows) {
      // 목록 카드가 보여주는 시각과 같은 것을 쓴다(사람이 마지막으로 저장한 날).
      const at = r.last_edited_at ?? r.created_at;
      // 값이 없거나 파싱이 안 되는 행은 그냥 뺀다 — Invalid Date 가 사이트맵 XML 에 들어가면
      // <lastmod> 가 깨져 그 파일 전체를 크롤러가 버릴 수 있다.
      if (at && !Number.isNaN(Date.parse(at))) out.push({ id: r.profile_id, lastModified: at });
    }
    if (rows.length < PAGE) break;
  }
  return out;
}

// 인재 상세 좌측 사이드바 — 관련 인재(같은 희망 근무지 우선, 없으면 최근)로 왼쪽이 절대 비지 않게 한다.
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
  // 서명 자체는 lib/data/avatar.ts 한 곳에서 한다(버킷 이름·수명이 두 벌로 갈라지지 않게).
  const signed = await signAvatarPaths(rows.map((r) => r.profile?.avatar_url));

  return new Map(rows.map((r) => {
    const avatarUrl = signed.get((r.profile?.avatar_url ?? "").trim()) ?? null;
    return [r.profile_id, { name: r.name, phone: r.phone, email: r.email, avatarUrl }];
  }));
}

// ── 💾 찜한 간호사(병원) ────────────────────────────────────
//
// 간호사가 공고를 찜하는 것(saved_jobs)의 반대 방향이다. 오너 지시 2026-08-07:
// "검색 도중 후보군을 저장해서 마이페이지에서 검토할 수 있어야 한다."
// 🔴 자격 게이트를 여기 두지 않는다 — **담아 두는 것**은 연락처를 여는 것과 다른 일이다.
//    광고가 끝난 병원도 후보 목록은 지키고, 연락처만 다시 잠긴다(revealContacts 가 그때 판정).

/** 지금 화면에 그릴 카드 중 내가 찜한 것 — 하트를 채울지 정한다(공고의 getSavedJobIds 와 같은 역할). */
export async function getSavedTalentIds(profileIds: readonly string[]): Promise<Set<string>> {
  if (profileIds.length === 0) return new Set();
  const user = await getSessionUser();
  if (!user) return new Set();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saved_talents").select("talent_id")
    .eq("profile_id", user.id).in("talent_id", [...profileIds])
    .returns<{ talent_id: string }[]>();
  // 🔴 삼키면 찜해 둔 카드가 전부 빈 하트로 보이고, 누르면 "해제" 가 아니라 다시 찜이 된다.
  if (error) console.error("getSavedTalentIds failed:", error.message);
  return new Set((data ?? []).map((r) => r.talent_id));
}

export type SavedTalentRow = {
  talentId: string;
  savedAt: string;
  /** 병원이 쓴 메모. 상대가 이력서를 내려도 이건 병원 자신의 기록이라 남는다. */
  memo: string | null;
  /** 지금도 인재정보에 올라 있는가. false 면 talent 은 null 이다. */
  active: boolean;
  talent: PublicTalent | null;
};

/** 한 번에 읽어오는 찜 상한. 넘으면 화면이 그 사실을 말한다(조용히 자르지 않는다). */
const SAVED_TALENT_LIMIT = 500;

/**
 * 마이페이지 「찜한 간호사」 — 찜한 순서(최신순)로, 제목·지역·부서·내 메모로 좁혀서.
 *
 * 🔴 검색은 **찜한 것 안에서만** 한다. 전체 인재를 뒤진 뒤 교집합을 내면 상한이 남의 이력서로 차서
 *    정작 내가 찜한 사람이 조용히 빠진다(지원자 검색이 같은 이유로 같은 방법을 쓴다).
 * 🔴 **공개 중인 이력서만 내용을 읽는다**(is_public + 이름 있음 — 목록·상세와 같은 술어).
 *    이 술어가 없으면 비공개로 내린 사람의 제목·경력·희망근무지가 병원 화면에 그대로 남는다.
 *    이름이 빈 이력서도 뺀다 — 제목·자기소개의 실명 마스킹(maskFree)이 이름을 알아야 돌기 때문에,
 *    이름이 없으면 본인이 적어 둔 실명이 가려지지 않은 채 나간다.
 */
export async function getSavedTalents(
  q = "",
): Promise<{ rows: SavedTalentRow[]; closed: number; truncated: boolean }> {
  const empty = { rows: [], closed: 0, truncated: false };
  const user = await getSessionUser();
  if (!user) return empty;
  const supabase = await createClient();
  const { data: saved, error } = await supabase
    .from("saved_talents").select("talent_id,memo,created_at")
    .eq("profile_id", user.id).order("created_at", { ascending: false }).limit(SAVED_TALENT_LIMIT)
    .returns<{ talent_id: string; memo: string | null; created_at: string }[]>();
  if (error) {
    console.error("getSavedTalents failed:", error.message);
    return empty;
  }
  const saves = saved ?? [];
  if (saves.length === 0) return empty;
  const truncated = saves.length >= SAVED_TALENT_LIMIT;

  // 이력서 본문은 RLS 로 잠겨 있어 목록과 같은 admin 클라이언트로 읽는다(searchPublicTalent 와 같은 이유).
  // 여는 범위는 **내가 찜한 사람 + 지금 공개 중** 으로 두 번 좁혀져 있고, 이름·연락처는
  // 화면이 자격(canRevealContacts)을 본 뒤 revealContacts 로 따로 붙인다.
  const admin = createAdminClient();
  const { data: resumes, error: rErr } = await admin
    .from("resumes").select(PUBLIC_COLS)
    .in("profile_id", saves.map((r) => r.talent_id))
    .eq("is_public", true).not("name", "is", null)
    .returns<(PublicTalent & { name: string | null; profile: ProfileBits | null })[]>();
  // 🔴 삼키면 살아 있는 후보 전원이 "이력서를 내렸다" 로 보인다 — 정반대의 거짓말이다.
  if (rErr) {
    console.error("getSavedTalents(resumes) failed:", rErr.message);
    return empty;
  }
  const byId = new Map((resumes ?? []).map((r) => [r.profile_id, flattenProfile(r)]));

  const needle = q.trim().toLowerCase();
  const rows: SavedTalentRow[] = [];
  let closed = 0;
  for (const s of saves) {
    const t = byId.get(s.talent_id) ?? null;
    if (!t) closed += 1;
    if (needle) {
      // 🔴 내린 사람은 **메모로만** 찾는다. 이력서 내용으로 찾게 두면 감춰 놓고 검색으로 되짚는 셈이다.
      const hay = t
        ? [t.resume_title, t.desired_location, t.residence_region, t.license_type, t.career_level, s.memo,
           ...(t.specialties ?? []), ...(t.desired_hospital_types ?? [])]
        : [s.memo];
      if (!hay.filter(Boolean).join(" ").toLowerCase().includes(needle)) continue;
    }
    rows.push({ talentId: s.talent_id, savedAt: s.created_at, memo: s.memo, active: !!t, talent: t });
  }
  return { rows, closed, truncated };
}
