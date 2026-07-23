// 사이트 전역 상수 — 하드코딩 분산 방지(추후 DB 마스터로 이관 가능).

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
  { label: "채용공고", href: "/jobs" },
  { label: "인재정보", href: "/talent" },
  { label: "리뷰", href: "/reviews" },
  { label: "게시판", href: "/board" },
  { label: "회원가입", href: "/signup" },
  { label: "병원 공고등록", href: "/hospital" },
] as const;

// 푸터 네비게이션
export const FOOTER_NAV = [
  { label: "채용공고 찾아보기", href: "/jobs" },
  { label: "인재정보", href: "/talent" },
  { label: "간호사 게시판", href: "/board" },
  { label: "병원 리뷰", href: "/reviews" },
  { label: "병원 서비스", href: "/hospital" },
] as const;

// sitemap 용 — 실제 색인(index) 대상만. noindex 페이지(jobs/reviews/board/about/terms/privacy 시드·스텁·회원전용)는
// sitemap/noindex 충돌 방지를 위해 제외. 콘텐츠/실데이터 오픈 시 noindex 해제와 함께 재등재.
// /board·/reviews는 이력서 등록한 간호사 회원 전용(noindex)이라 등재하지 않는다.
export const PUBLIC_ROUTES = ["/", "/hospital", "/talent"] as const;

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://nurse-app-nine.vercel.app";

/** 비밀번호 최소 길이 — 검증(서버)과 안내 문구·input minLength가 같은 값을 쓴다. */
export const MIN_PASSWORD = 8;

// 재설정 메일 링크로 들어왔다는 표시. 이게 있어야만 비밀번호를 바꿀 수 있다.
// 값에는 **그 링크의 회원 id**를 담는다 — 존재 여부만 보면 공용 PC에서 남이 심어둔 표시로
// 다음 사람이 자기 계정 비밀번호를 기존 비번 없이 바꿀 수 있게 된다.
// __Host- 접두사는 https(secure)에서만 쓸 수 있어 개발에서는 뗀다(서브도메인 주입 방지용).
export const RECOVERY_COOKIE = process.env.NODE_ENV === "production" ? "__Host-pw_recovery" : "pw_recovery";
// 표시는 이 값 하나에서 나온다. 실제 링크 만료는 Supabase 쪽 otp_expiry(supabase/config.toml)가 정하므로
// 그 값을 바꾸면 여기도 같이 바꿔야 한다 — 두 숫자가 어긋나면 안내가 거짓말이 된다.
export const RECOVERY_HOURS = 1;
export const RECOVERY_COOKIE_MAX_AGE = RECOVERY_HOURS * 60 * 60;

// 심을 때와 지울 때 **같은 속성**을 써야 한다. __Host- 접두사 쿠키는 Secure 가 빠진 Set-Cookie 를
// 브라우저가 통째로 무시하므로, 속성을 생략하면 배포에서 "삭제"가 아무 일도 안 한다.
export const RECOVERY_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

/** 입력칸 공용 스타일 */
export const INPUT_CLASS =
  "h-12 rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40";

// 본문 안 링크 공용 스타일(hover 와 focus 를 같이 준다).
// -my-2 py-2: 글자 크기는 그대로 두고 누를 수 있는 영역만 손가락 크기로 넓힌다.
const LINK_BASE =
  "-my-2 rounded py-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2";
export const LINK_CLASS = `${LINK_BASE} font-semibold text-teal-700`;
/** 약관·처리방침처럼 덜 강조하는 링크 */
export const SUBTLE_LINK_CLASS = `${LINK_BASE} underline hover:text-slate-600`;

// 로그인/회원가입/비밀번호 재설정 에러 코드 → 사용자 메시지.
// satisfies 로 두면 키가 그대로 남아 AuthErrorCode 가 실제 코드 목록이 된다
// (`: Record<string,string>` 로 적으면 키가 string 으로 뭉개져 오타를 못 잡는다).
export const AUTH_ERROR_MESSAGES = {
  // 아이디/비밀번호 로그인 + 이메일 회원가입
  missing: "아이디와 비밀번호를 입력해 주세요.",
  email_invalid: "올바른 이메일 형식이 아닙니다.",
  invalid_credentials: "아이디 또는 비밀번호가 올바르지 않습니다.",
  weak: `비밀번호는 ${MIN_PASSWORD}자 이상이어야 합니다.`,
  signup_failed: "회원가입에 실패했습니다. 이미 가입된 이메일일 수 있습니다.",
  // 비밀번호 재설정
  id_required: "아이디 또는 이메일을 입력해 주세요.",
  mismatch: "새 비밀번호와 확인이 서로 다릅니다.",
  link_expired: "재설정 링크가 만료되었거나 이미 사용되었습니다. 다시 받아 주세요.",
  save: "비밀번호 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  // SNS
  oauth: "카카오 로그인에 실패했습니다. 다시 시도해 주세요.",
  naver_state: "보안 검증에 실패했습니다. 다시 시도해 주세요.",
  naver_config: "네이버 로그인 설정 오류입니다. 잠시 후 다시 시도해 주세요.",
  naver_token: "네이버 인증에 실패했습니다. 다시 시도해 주세요.",
  naver_profile: "네이버 프로필을 불러오지 못했습니다.",
  naver_email: "네이버 계정의 이메일 제공에 동의해 주세요.",
  naver_session: "세션 생성에 실패했습니다. 다시 시도해 주세요.",
  naver_verify: "로그인 처리에 실패했습니다. 다시 시도해 주세요.",
} satisfies Record<string, string>;

/** 실제로 존재하는 에러 코드만. 오타를 컴파일에서 잡으려고 쓴다. */
export type AuthErrorCode = keyof typeof AUTH_ERROR_MESSAGES;

/**
 * URL의 `?error=`·`?ok=` 문자열 → 표에 정의된 문구. 모르는 코드·프로토타입 키(toString·constructor 등)는 null.
 * 이 가드가 없으면 상속된 함수가 반환돼 JSX 자식으로 렌더되며 "Functions are not valid as a React child"로 터진다.
 */
export function messageFor(table: Record<string, string>, code: string | undefined): string | null {
  return code && Object.hasOwn(table, code) ? table[code] : null;
}

/** 인증 화면 전용 단축 — messageFor(AUTH_ERROR_MESSAGES, code) */
export const authErrorMessage = (code: string | undefined) => messageFor(AUTH_ERROR_MESSAGES, code);

/** 에러를 달고 돌아갈 주소. 코드가 타입으로 묶여 있어 오타가 나면 빌드가 깨진다. */
export const authErrorPath = (path: string, code: AuthErrorCode) => `${path}?error=${code}`;
