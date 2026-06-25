// 사이트 전역 상수 — 하드코딩 분산 방지(추후 DB 마스터로 이관 가능).

export const POPULAR_SEARCHES = [
  "중환자실",
  "응급실",
  "수술실",
  "야간전담",
  "요양병원",
  "신규간호사",
] as const;

// 헤더 햄버거 메뉴
export const HEADER_MENU = [
  { label: "채용 검색", href: "/jobs" },
  { label: "급여", href: "/salaries" },
  { label: "병원 리뷰", href: "/reviews" },
  { label: "회원가입", href: "/signup" },
  { label: "병원 공고등록", href: "/hospital" },
] as const;

// 푸터 네비게이션
export const FOOTER_NAV = [
  { label: "채용공고 찾아보기", href: "/jobs" },
  { label: "급여", href: "/salaries" },
  { label: "병원 리뷰", href: "/reviews" },
  { label: "병원 서비스", href: "/hospital" },
  { label: "회사 소개", href: "/about" },
] as const;

// 공개(색인 대상) 경로 — sitemap 용. 로그인/가입/auth 콜백은 제외(noindex).
export const PUBLIC_ROUTES = [
  "/",
  "/jobs",
  "/salaries",
  "/reviews",
  "/hospital",
  "/about",
  "/terms",
  "/privacy",
] as const;

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
