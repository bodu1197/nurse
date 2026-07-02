// 사이트 전역 상수 — 하드코딩 분산 방지(추후 DB 마스터로 이관 가능).

export const DAY_SECONDS = 86400; // 하루(초) — ISR/fetch revalidate 공용

// /jobs 필터 옵션
export const JOB_SPECIALTIES = ["중환자실", "응급실", "수술실", "병동", "외래", "요양병원", "정신과", "마취과", "투석실"] as const;
export const EMPLOYMENT_TYPES = ["정규직", "계약직", "파트타임", "인턴"] as const;
export const DATE_FILTERS: ReadonlyArray<readonly [string, string]> = [["1", "최근 1일"], ["3", "최근 3일"], ["7", "최근 7일"], ["14", "최근 14일"]];

export const POPULAR_SEARCHES = [
  "중환자실",
  "응급실",
  "수술실",
  "야간전담",
  "요양병원",
  "신규간호사",
] as const;

// 헤더 햄버거 메뉴 — 준비중 스텁(급여/회사소개)은 구현 전까지 제외(새는 링크 방지)
export const HEADER_MENU = [
  { label: "채용 검색", href: "/jobs" },
  { label: "급여 정보", href: "/salaries" },
  { label: "병원 리뷰", href: "/reviews" },
  { label: "회원가입", href: "/signup" },
  { label: "병원 공고등록", href: "/hospital" },
] as const;

// 푸터 네비게이션
export const FOOTER_NAV = [
  { label: "채용공고 찾아보기", href: "/jobs" },
  { label: "간호사 급여 정보", href: "/salaries" },
  { label: "병원 리뷰", href: "/reviews" },
  { label: "병원 서비스", href: "/hospital" },
] as const;

// sitemap 용 — 항상 색인하는 정적 라우트. /salaries 는 데이터 있을 때만 sitemap.ts 에서 동적 등재.
// noindex 페이지(jobs/reviews/about/terms/privacy 시드·스텁)는 충돌 방지를 위해 제외.
export const PUBLIC_ROUTES = ["/", "/hospital"] as const;

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://nurse-app-nine.vercel.app";

// 로그인/회원가입 에러 코드 → 사용자 메시지 (login·signup·OAuth 콜백 공용)
export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  // 아이디/비밀번호 로그인 + 이메일 회원가입
  missing: "아이디와 비밀번호를 입력해 주세요.",
  email_invalid: "올바른 이메일 형식이 아닙니다.",
  invalid_credentials: "아이디 또는 비밀번호가 올바르지 않습니다.",
  weak: "비밀번호는 8자 이상이어야 합니다.",
  signup_failed: "회원가입에 실패했습니다. 이미 가입된 이메일일 수 있습니다.",
  // SNS
  oauth: "카카오 로그인에 실패했습니다. 다시 시도해 주세요.",
  naver_state: "보안 검증에 실패했습니다. 다시 시도해 주세요.",
  naver_config: "네이버 로그인 설정 오류입니다. 잠시 후 다시 시도해 주세요.",
  naver_token: "네이버 인증에 실패했습니다. 다시 시도해 주세요.",
  naver_profile: "네이버 프로필을 불러오지 못했습니다.",
  naver_email: "네이버 계정의 이메일 제공에 동의해 주세요.",
  naver_session: "세션 생성에 실패했습니다. 다시 시도해 주세요.",
  naver_verify: "로그인 처리에 실패했습니다. 다시 시도해 주세요.",
};
