import type { ResumeSheetFields } from "./data/resume.ts";

// 이력서·공고가 함께 쓰는 선택지 목록.
// 자유 입력으로 두면 "3교대"·"쓰리교대"·"3 교대"가 다 다른 값이 되어 검색·매칭이 성립하지 않는다.
// 화면에 보이는 순서 그대로 둔다(빈도순).

/** 가능한 근무형태 — 국내 간호사 공고가 실제로 갈리는 축. 뒤의 둘은 요양보호사·간병인(방문·입주) 몫(2026-10-16). */
export const SHIFT_TYPES = ["3교대", "2교대", "D-KEEP(주간전담)", "E-KEEP(오후전담)", "N-KEEP(나이트전담)", "상근(오전~오후)", "방문·시간제 돌봄", "입주(24시간 간병)"] as const;

/** 보유 자격증 — 유효기간 관리는 이번에 하지 않는다 */
export const CERTIFICATIONS = ["BLS", "ACLS", "KALS", "PALS", "NRP", "전문간호사(APN)", "보건교육사", "기타"] as const;

/** 전문간호사 분야 (13개 법정 분야) */
export const APN_FIELDS = [
  "감염관리", "노인", "마취", "가정", "산업", "응급", "종양", "정신", "중환자", "호스피스", "아동", "임상", "보건",
] as const;

/**
 * 🧓 이력서 '찾는 일자리' — 간호 / 요양·간병, **둘 다** 고를 수 있다(오너 지시 2026-10-16: "간호원이지만 간호도 할 수 있고
 * 간병도 할 수 있는데"). DB 값은 resumes.job_tracks(마이그레이션 20261016180000)의 'nurse'·'care'.
 * 이 값이 AI 자동매치 후보(lib/match matchScope)·인재정보 목록(/talent·/care-talent)·이력서 질문(간호 전용 항목 숨김)을 가른다.
 * 🔴 값을 늘리거나 바꾸면 같이 고칠 곳: DB 제약 resumes_job_tracks_check 와 인재 RPC 의 p_track(마이그레이션 20261016180000),
 *    이력서 화면의 체크박스 id(#track-nurse·#track-care — 간호 전용 항목을 숨기는 CSS 가 그 id 를 본다).
 */
export const JOB_TRACKS = [
  { value: "nurse", label: "간호사·간호조무사", hint: "병원·의원·요양병원 등" },
  { value: "care", label: "요양보호사·간병인", hint: "요양원·주간보호·방문요양·간병" },
] as const;
export type JobTrack = (typeof JOB_TRACKS)[number]["value"];
/** 간호 일자리도 찾는가 — 아니면(요양·간병만) 간호 전용 항목(근무부서·자격증 등)은 묻지도·보이지도·맞춰 보지도 않는다.
 *  비었으면 간호로 친다(DB 가 최소 하나를 강제하지만, 이 칸이 생기기 전 이력서는 전부 간호였다). */
export const seeksNurseJobs = (tracks: readonly string[]): boolean => tracks.includes("nurse") || !tracks.includes("care");
/** 이름이 가려졌을 때 이력서 주인을 부르는 말 — 간호도 찾으면 "간호사", 요양·간병만이면 "요양·간병". 카드·상세·제목이 같은 말을 쓴다. */
export const talentNoun = (tracks: readonly string[]): string => (seeksNurseJobs(tracks) ? "간호사" : "요양·간병");
/** 화면에 보이는 이름("간호사·간호조무사 / 요양보호사·간병인"). 모르는 값은 그대로. */
export const jobTrackLabels = (tracks: readonly string[]): string =>
  tracks.map((v) => JOB_TRACKS.find((t) => t.value === v)?.label ?? v).join(" / ");

// 요양보호사(국가자격)·해당 없음(간병인 등 자격 없는 돌봄 인력)은 2026-10-16 에 더했다 — 요양·간병 공고(/care-jobs)에
// 간편지원하려면 이력서가 있어야 하는데, 면허 칸이 필수라 간호 면허 셋 중 하나를 거짓으로 골라야 했다.
export const LICENSE_TYPES = ["간호사", "조산사", "간호조무사", "요양보호사", "해당 없음"] as const;
// 🔴 라벨에 "졸업" 을 넣지 않는다. 옆 칸(GRADUATION_STATUS)이 졸업 여부를 따로 묻는데
//    "4년제 졸업" 을 고르게 하면 같은 걸 두 번 묻는 꼴이고, 실제로 모순 데이터가 생겼다
//    ("4년제 졸업" + "졸업예정" 1건). 여기는 **학위 수준**만 말한다(오너 지적 2026-08-04).
// 간호조무사도 등록하는 사이트라 고졸 이하가 실제로 있다. 없는 칸을 만들면 그 사람은
// 자기 학력을 못 적고 그냥 나간다(오너 지적 2026-08-04).
export const EDUCATION_LEVELS = ["국졸", "중졸", "고졸", "3년제", "4년제", "석사", "박사"] as const;
// 중퇴가 빠져 있었다 — 중퇴한 사람은 졸업도 재학중도 아니라서 고를 게 없었다.
export const GRADUATION_STATUS = ["졸업", "졸업예정", "재학중", "중퇴"] as const;
export const CAREER_LEVELS = ["신규(경력 없음)", "경력"] as const;
export const CAREER_NEW = CAREER_LEVELS[0];
export const CAREER_EXPERIENCED = CAREER_LEVELS[1];

/** 신규/경력 + 경력년수 → 화면 문구. "신규(경력 없음)"·"경력 N년" 리터럴이 여기저기 흩어지지 않게 한 곳에 둔다. */
export const careerSummary = (careerLevel: string | null, years: number | null): string =>
  careerLevel === CAREER_NEW ? "신규" : `경력 ${years ?? 0}년`;

/** 의료기관 종별 — 희망 조건과 경력의 병원 종류에 같이 쓴다 */
export const HOSPITAL_TYPES = [
  "상급종합병원", "종합병원", "병원", "전문병원", "한방병원", "요양병원", "의원", "검진센터", "보건소", "기타",
] as const;

/** 병상 수 구간 — 실제 공고 우대사항이 "250병상 이상 종합병원 5년 이상" 식이라 규모가 필요하다 */
export const BED_RANGES = ["100병상 미만", "100~299병상", "300~499병상", "500~999병상", "1000병상 이상"] as const;

export const POSITIONS = ["일반간호사", "책임간호사", "수간호사", "간호과장", "기타"] as const;
export const AVAILABLE_FROM = ["즉시 가능", "1개월 이내", "협의"] as const;
export const EMPLOYMENT_TYPES = ["정규직", "계약직", "파트타임", "무관"] as const;

// 희망 근무지·거주지의 시·도 목록은 여기 있었지만 lib/koreaRegions 의 SIDO_LIST 로 옮겼다.
// 이력서가 시·군·구까지 고르게 되면서 시도 목록만으로는 부족해졌고, 같은 17개를 두 곳에 두면
// 반드시 한쪽만 고쳐진다(이력서 폼이 koreaRegions 를 쓴다).

/**
 * 🗂 희망 근무부서 — 구 널스넷 근무부서 코드표(DEPA_01~28) **그대로**.
 *
 * 🔴 이 목록은 마음대로 바꾸면 안 된다. 이관한 이력서 7,257건의 specialties 가 정확히 이 28개 값이고
 *    (실측: 서로 다른 값 28개 = 이 표와 완전 일치), 인재 검색 칩·집계 RPC(nurse_talent_facet_list)가
 *    같은 문자열로 매칭한다. 한 글자만 달라도 그 부서 인재가 통째로 검색에서 사라진다.
 *
 * 전에는 채용용 JOB_SPECIALTIES(9개)를 이력서에도 썼는데, 두 목록이 겹치는 게 3개뿐이라
 * **인재 검색 칩 9개 중 6개가 0명**이었다(병동·외래·요양병원·정신과·마취과·투석실).
 * 정작 인재가 많은 내과(832)·정형외과(719)·피부과(652)는 고를 수조차 없었다.
 */
/**
 * '부서를 가리지 않겠다'는 뜻의 값. 🔴 문자열을 손으로 적지 말 것 —
 * 자동매치(lib/match)는 이 값이면 진료과 축을 아예 안 세고, 칩 정렬(lib/data/jobs)은 맨 뒤로 보낸다.
 * 한 글자만 어긋나도 그쪽 규칙이 조용히 안 걸린다.
 */
export const DEPT_ANY = "부서무관";

export const DEPARTMENTS = [
  DEPT_ANY, "내과", "외과", "산부인과", "소아청소년과", "혈액종양내과", "신경과", "신경외과",
  "정신건강의학과", "정형외과", "흉부외과", "성형외과", "이비인후과", "피부과", "안과", "비뇨기과",
  "응급실", "중환자실", "인공신장실", "수술실", "분만실", "신생아실", "혈관조영실", "내시경실",
  "마취과/회복실", "건강진단센터", "주사실", "기타",
] as const;

/**
 * 🗂 희망 직종 — 구 널스넷 직종 대분류(CATE_01~07, CATE_99) 그대로.
 * 중분류(CATE_xx_CATEC_yy, "간호사(병동)" 등)까지는 담지 않는다 — 필터가 8개로 충분하고,
 * 두 단계로 만들면 화면과 데이터 양쪽이 복잡해진다(필요해지면 그때).
 */
// 🧓 요양보호사·간병인은 2026-10-16 에 더했다(오너 지시: 기관이 직접 올린 요양·간병 공고도 /care-jobs 에, 지원까지).
//    공고가 이 둘 중 하나면 요양·간병 채용 목록에 실린다 — 판정은 lib/jobTaxonomy 의 CARE_CATEGORIES 한 곳.
// 🔴 값을 바꾸면 DB 칩 집계의 허용 목록(nurse_job_facet_list·nurse_talent_facet_list, 마이그레이션 20261016150000)도 같이 바꾼다.
export const JOB_CATEGORIES = [
  "간호직", "간호조무직", "요양보호사", "간병인", "사무·원무·코디", "피부관리직", "의료기사직", "의사직", "약무직", "의료기타",
] as const;

/**
 * 이력서를 "공개"로 뒀을 때 실제로 누가 무엇을 보는가 — **동의의 내용**이다.
 *
 * 🔴 한 곳에서만 정의한다. 전에는 같은 뜻의 문장이 이력서 화면 네 군데(사진 안내·공개 스위치·
 *    확인창·첫 동의 체크박스)에 손으로 복사돼 있었고, 그중 세 곳만 고치는 바람에 **정작 동의를
 *    받는 체크박스만 옛 문구("광고 중인 병원만 봅니다")로 남았다**. 실제로는 로그인하지 않은
 *    방문자도 /talent 에서 아래 anyone 항목을 전부 본다(talent/page.tsx 에 로그인 검사 없음).
 *
 * 이 값을 바꾸려면 src/lib/data/talent.ts 의 PUBLIC_FIELDS·canRevealContacts 를 먼저 확인할 것.
 */
export const RESUME_PUBLIC_SCOPE = {
  /** 로그인하지 않은 방문자를 포함한 누구나 */
  anyone:
    "이력서 제목 · 성별 · 나이 · 거주지역 · 학력 · 경력(근무한 병원명 · 담당업무 포함) · 자격 · 희망 근무조건 · 자기소개",
  /**
   * 이름·연락처를 보는 쪽.
   * 🔴 "광고 중인 병원만" 이라고 쓰면 안 된다 — **내가 지원한 병원**도 본다
   *    (lib/data/applications.ts 의 CARD_FIELDS 에 name·phone·email 이 있고 지원자 상세에 사진이 나온다).
   *    지원은 내가 누르는 행위라 당연해 보여도, 동의 문구가 그 사실을 빼면 고지가 아니다.
   */
  advertiser: "이름 · 휴대폰 · 이메일 · 증명사진",
  /** 위 항목을 보는 사람의 범위 — 문장에 그대로 끼워 쓴다 */
  // 🧓 요양원·재가센터도 같은 기관 회원으로 광고·인재 열람을 한다(2026-10-16) — 동의 문구가 그 사실을 빼면 고지가 아니다.
  advertiserWho: "널스넷에 광고 중인 병원·요양기관과 내가 지원한 기관",
} as const;

/** 자기소개 글자 수 — 화면(minLength·maxLength)과 서버(saveResume)가 같은 값을 쓴다. */
export const RESUME_INTRO_MIN = 30;
/** 이관된 회원 중 최장이 3,627자라 그 위로 잡는다(그 아래면 저장할 때 뒷부분이 잘린다). */
export const RESUME_INTRO_MAX = 4000;

/** 이력서 완성도 % — 무엇을 더 채우면 좋은지 사용자에게 보여주려고 쓴다(내 이력서·마이페이지). */
const SCORED = [
  "name", "phone", "license_type", "career_level", "shift_types", "desired_location",
  "email", "residence_region", "license_year", "certifications", "education_level",
  "education", "specialties", "desired_employment_type", "desired_salary", "available_from", "intro",
] as const satisfies readonly (keyof ResumeSheetFields)[];

// 🧓 요양·간병만 찾는 사람에게는 이력서 화면이 숨기는 간호 전용 항목 — 채울 수 없으니 완성도에서도 빼야 100% 가 된다.
const NURSE_ONLY_SCORED: ReadonlySet<keyof ResumeSheetFields> = new Set(["specialties", "certifications"]);

export function completeness(
  r: Pick<ResumeSheetFields, (typeof SCORED)[number] | "job_tracks" | "career_level">,
  workCount: number,
): number {
  const scored = seeksNurseJobs(r.job_tracks) ? SCORED : SCORED.filter((k) => !NURSE_ONLY_SCORED.has(k));
  const filled = scored.filter((k) => {
    const v = r[k];
    if (Array.isArray(v)) return v.length > 0;
    return v !== null && v !== undefined && v !== "";
  }).length;
  // 경력 상세 1건 이상을 한 항목으로 친다(신규 간호사는 이 항목이 없어도 100%가 되도록 아래에서 보정)
  const total = scored.length + (r.career_level === CAREER_EXPERIENCED ? 1 : 0);
  const score = filled + (r.career_level === CAREER_EXPERIENCED && workCount > 0 ? 1 : 0);
  return Math.round((score / total) * 100);
}
