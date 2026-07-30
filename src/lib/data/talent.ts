import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/data/user";
import { getMembership } from "@/lib/data/membership";
import { signAvatarPaths } from "@/lib/data/avatar";
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
 * 자유서술(제목·자기소개) 안에 적힌 **본인 실명**을 가린다. "김민수" → "김○○".
 *
 * 🔴 왜 필요한가: 이름·연락처는 광고 중인 병원에만 보이게 막아뒀는데(revealContacts),
 *    정작 본인이 "안녕하세요 김민수입니다" 라고 적어두면 그 게이트가 무의미해진다.
 *    인재정보를 검색엔진에 열면서(2026-07-30) 그 이름이 검색결과에 그대로 뜬다.
 *    실측: 공개 이력서 7,257건 중 제목에 219건, 자기소개에 235건.
 *
 * 성(첫 글자)만 남기는 것은 구 널스넷 카드 표기와 같은 방식이다.
 * 2글자 미만 이름은 건드리지 않는다 — 한 글자를 치환하면 엉뚱한 단어까지 깨진다.
 */
function maskName(text: string | null, name: string | null): string | null {
  const n = (name ?? "").trim();
  if (!text || n.length < 2) return text;
  return text.split(n).join(n[0] + "○".repeat(n.length - 1));
}

/**
 * 자유서술 안에 적힌 **휴대폰·이메일**을 가린다.
 *
 * 🔴 전화·이메일은 광고 중인 병원에만 보이도록 막아뒀는데(revealContacts), 자기소개에
 *    "연락처: 010-…" 이라고 적어두면 그 게이트가 그냥 뚫린다. 실측: 공개 이력서 중 휴대폰 7건·이메일 1건.
 *    인재정보를 검색엔진에 열면서(2026-07-30) 그 번호가 검색결과에 남는다 — 되돌릴 수 없다.
 *
 * ⚠️ 여기서 못 잡는 것도 있다(생년월일 18건·집주소 6건·국적/비자 5건). 자유서술이라 규칙으로
 *    전부 걸러낼 수 없다 — 그건 작성자에게 알리고 고치게 하는 쪽이 맞다(오너 판단 대기).
 */
const PHONE_RE = /01[016-9][-. ]?\d{3,4}[-. ]?\d{4}/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
function maskContacts(text: string | null): string | null {
  if (!text) return text;
  return text.replace(PHONE_RE, "010-****-****").replace(EMAIL_RE, "***@***");
}

function flattenProfile(row: ResumePublicPick & { name?: string | null; profile?: ProfileBits | null }): PublicTalent {
  // name 은 여기서 소비하고 **버린다** — 반환 타입(PublicTalent)에 없으므로 밖으로 나가지 않는다.
  const { profile, name, ...rest } = row;
  return {
    ...rest,
    resume_title: maskContacts(maskName(rest.resume_title, name ?? null)),
    intro: maskContacts(maskName(rest.intro, name ?? null)),
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
export async function getPublicTalent(profileId: string): Promise<PublicTalentDetail | null> {
  if (!UUID_RE.test(profileId)) return null;
  const admin = createAdminClient();
  const { data: resume } = await admin
    .from("resumes").select(PUBLIC_COLS).eq("profile_id", profileId).eq("is_public", true)
    .not("name", "is", null).maybeSingle<PublicTalent & { name: string | null; profile: ProfileBits | null }>();
  if (!resume) return null;
  const { data: work } = await admin
    .from("work_experiences").select(WORK_PUBLIC_FIELDS.join(",")).eq("resume_id", profileId)
    .order("sort_order").returns<PublicWork[]>();
  return { ...flattenProfile(resume), work: work ?? [] };
}

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
    .order("updated_at", { ascending: false })
    // 🔴 2차 키 — 이관분 7,224건이 같은 배치 시각이라 updated_at 만으로는 순서가 보장되지 않는다.
    //    동률이 흔들리면 홈 10장과 목록 1페이지가 어긋나고, 페이지 경계에서 같은 사람이
    //    두 페이지에 나오거나 어느 페이지에도 안 나온다.
    .order("profile_id", { ascending: false })
    .range(from, from + perPage - 1);

  if (f.specialty) query = query.contains("specialties", [f.specialty]);
  if (f.category) query = query.contains("job_categories", [f.category]);
  // 키워드 — 이력서 제목과 자기소개에서 찾는다. 이름·연락처는 게이트 뒤라 검색 대상이 아니다
  // (검색으로 "김OO" 를 넣어 존재 여부를 떠보는 길을 열면 이름을 가린 의미가 없다).
  const kw = f.q ? clean(f.q) : "";
  if (kw) query = query.or(`resume_title.ilike.%${kw}%,intro.ilike.%${kw}%`);
  // 희망지역은 "서울 종로구, 경기 성남시" 처럼 여러 개가 한 컬럼에 있어 부분일치로 건다.
  // 시군구는 시도에 종속 — 시도 없이 걸면 '중구'처럼 여러 시도에 있는 이름이 엉뚱한 지역을 긁는다(jobs 와 같은 계약).
  const sido = f.sido ? clean(f.sido) : "";
  const sigungu = sido && f.sigungu ? clean(f.sigungu) : "";
  if (sido) query = query.ilike("desired_location", `%${sigungu ? `${sido} ${sigungu}` : sido}%`);
  if (f.minYears && f.minYears > 0) query = query.gte("experience_years", f.minYears);

  const { data, count, error } = await query.returns<(PublicTalent & { name: string | null; profile: ProfileBits | null })[]>();
  if (error) {
    console.error("searchPublicTalent failed:", error.message);
    return { rows: [], total: 0 };
  }
  return { rows: (data ?? []).map(flattenProfile), total: withCount ? (count ?? 0) : (data?.length ?? 0) };
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


/**
 * 사이트맵용 공개 이력서 목록(profile_id + updated_at 만).
 *
 * 🔴 인재정보를 색인한다(오너 확정 2026-07-30). 근거: 구 널스넷이 이미 그렇게 운영해 왔다 —
 *    robots.txt 전면 allow, `/job/person/list`·`/job/person/view/{id}` 모두 robots 메타 없음(색인 허용),
 *    사이트맵에 상세 3,544건이 실려 있다(실측, docs/legacy-urls.txt). 새 사이트만 닫으면 그 유입을 버린다.
 *    이름·휴대폰·이메일·사진은 여전히 광고 중인 병원에만 보인다(revealContacts) — 그 게이트는 그대로다.
 *
 * 🔴 anon 클라이언트로는 안 된다. resumes 는 RLS 로 잠겨 있어 anon 이 읽으면 **0건**이 나온다
 *    (사이트맵이 조용히 비는 방식으로 실패한다 — 실측으로 확인했다).
 *    그래서 여기만 admin 을 쓴다. 대신 **id 와 시각 두 컬럼만** 뽑는다 — PII 는 애초에 실리지 않는다.
 *
 * ⚠️ 빌드 시점에 service_role 키가 없으면 createAdminClient 가 던져 빌드를 깨뜨린다.
 *    사이트맵은 일부만 나가도 사이트가 죽지 않으므로, 키가 없으면 조용히 비우고 넘어간다.
 */
export async function getSitemapTalent(): Promise<{ profile_id: string; updated_at: string }[]> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error("getSitemapTalent: service_role 키 없음 — 인재 URL 을 사이트맵에서 생략한다");
    return [];
  }
  const supabase = createAdminClient();

  // 🔴 PostgREST 의 max_rows(1000)는 하드 상한이라 .limit() 으로 못 넘는다 → range 로 나눠 받는다.
  //    목록과 **같은 술어**를 쓴다(is_public + 이름 있음) — 어긋나면 사이트맵이 404 를 가리킨다.
  const PAGE = 1000;
  const out: { profile_id: string; updated_at: string }[] = [];
  for (let from = 0; from < 50_000; from += PAGE) {
    const { data, error } = await supabase
      .from("resumes")
      .select("profile_id, updated_at")
      .eq("is_public", true)
      .not("name", "is", null)
      .order("updated_at", { ascending: false })
      // 🔴 2차 키 — 이관분이 같은 배치 시각이라 1000행 경계 7곳이 전부 동률 그룹 한가운데 떨어진다.
      //    페이지마다 별개 쿼리라 순서가 흔들리면 사이트맵이 URL 을 누락·중복시킨다(목록과 같은 규칙).
      .order("profile_id", { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) {
      console.error("getSitemapTalent failed:", error.message);
      return out; // 일부만 나가도 사이트는 죽지 않는다
    }
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}
