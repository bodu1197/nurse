// 이력서·공고가 함께 쓰는 선택지 목록.
// 자유 입력으로 두면 "3교대"·"쓰리교대"·"3 교대"가 다 다른 값이 되어 검색·매칭이 성립하지 않는다.
// 화면에 보이는 순서 그대로 둔다(빈도순).

/** 가능한 근무형태 — 국내 간호사 공고가 실제로 갈리는 축 */
export const SHIFT_TYPES = ["3교대", "2교대", "D-KEEP(주간전담)", "E-KEEP(오후전담)", "N-KEEP(나이트전담)", "상근(오전~오후)"] as const;

/** 보유 자격증 — 유효기간 관리는 이번에 하지 않는다 */
export const CERTIFICATIONS = ["BLS", "ACLS", "KALS", "PALS", "NRP", "전문간호사(APN)", "보건교육사", "기타"] as const;

/** 전문간호사 분야 (13개 법정 분야) */
export const APN_FIELDS = [
  "감염관리", "노인", "마취", "가정", "산업", "응급", "종양", "정신", "중환자", "호스피스", "아동", "임상", "보건",
] as const;

export const LICENSE_TYPES = ["간호사", "조산사", "간호조무사"] as const;
export const EDUCATION_LEVELS = ["3년제 졸업", "4년제 졸업", "석사", "박사"] as const;
export const GRADUATION_STATUS = ["졸업", "졸업예정", "재학중"] as const;
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

/** 전국 시·도 — 희망 근무지·거주지 */
export const REGIONS = [
  "서울", "경기", "인천", "부산", "대구", "광주", "대전", "울산", "세종",
  "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
] as const;
