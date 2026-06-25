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
