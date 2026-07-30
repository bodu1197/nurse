// 사이트 전역 상수 — 하드코딩 분산 방지(추후 DB 마스터로 이관 가능).

// /jobs 필터 옵션
// 진료과 목록은 lib/jobTaxonomy.ts 로 옮겼다 — 이력서와 같은 표(DEPARTMENTS 28개)를 쓴다.
// 옛 JOB_SPECIALTIES 9개는 폐기(2026-07-29): 자체 광고 73%가 그 목록에 없는 값이라 검색되지 않았다.
export const EMPLOYMENT_TYPES = ["정규직", "계약직", "파트타임", "인턴"] as const;

export const POPULAR_SEARCHES = [
  "중환자실",
  "응급실",
  "수술실",
  "야간전담",
  "요양병원",
  "신규간호사",
] as const;

type MenuItem = { label: string; href: string };

// 헤더 햄버거 메뉴 — 준비중 스텁(급여/회사소개)은 구현 전까지 제외(새는 링크 방지)
//
// 🔴 메뉴 카테고리는 **전원에게 보인다**(오너 확정 2026-07-30). 한때 역할별로 감췄다가 되돌렸다 —
//    감추면 그런 게 있는 줄도 모른다. 누가 쓸 수 있는지는 들어간 화면에서 안내한다(CommunityGate).
export const HEADER_MENU: readonly MenuItem[] = [
  { label: "채용공고", href: "/jobs" },
  { label: "인재정보", href: "/talent" },
  { label: "리뷰", href: "/reviews" },
  { label: "게시판", href: "/board" },
  { label: "회원가입", href: "/signup" },
  { label: "병원 공고등록", href: "/hospital" },
];

// 푸터 네비게이션 — 헤더와 마찬가지로 전원에게 보인다.
export const FOOTER_NAV: readonly MenuItem[] = [
  { label: "채용공고 찾아보기", href: "/jobs" },
  { label: "인재정보", href: "/talent" },
  { label: "간호사 게시판", href: "/board" },
  { label: "병원 리뷰", href: "/reviews" },
  { label: "병원 서비스", href: "/hospital" },
  { label: "고객센터", href: "/contact" },
];

// 운영주체 — 레거시 널스넷(nursenet.co.kr) 푸터 원문과 같은 값이다(같은 사업자).
// 푸터·고객센터·영수증이 전부 여기서 읽는다. 세 곳에 복붙하면 반드시 한 곳만 낡는다.
export const COMPANY = {
  name: "(주)플랫폼몬스터",
  ceo: "배미미",
  bizNo: "363-06-01936",
  address: "서울시 마포구 월드컵로 81 3층",
  tel: "010-5684-6664",
  email: "nursenet.co.kr@gmail.com",
  mailOrderNo: "제 2022-경기광명-1283호",
  jobInfoNo: "J1513020210002",
} as const;

// sitemap 용 — 실제 색인(index) 대상만. noindex 페이지를 여기 넣으면 "색인해달라"와 "하지 마라"를
// 동시에 말하는 꼴이라 반드시 같이 관리한다.
//  · /board·/reviews — 이력서 등록한 간호사 회원 전용(noindex)
//  · /talent — 목록·상세 URL 은 noindex 다.
//    ⚠️ 단, 홈(/)의 '구직 현황' 섹션에 같은 카드가 실리고 홈은 색인된다(오너 지시 2026-07-30).
//    즉 noindex 가 막는 것은 **그 URL** 이지 카드 내용 자체가 아니다.
//    가장 강한 식별자인 자기소개만 홈 카드에서 뺀다(TalentCard hideIntro).
//  · /terms·/privacy·/contact — 색인 가치가 없어 noindex
export const PUBLIC_ROUTES = ["/", "/hospital"] as const;

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
  // 확인 메일 발송 한도(시간당)에 걸린 경우 — 가입자 잘못이 아니므로 "이미 가입됨"이라고 하면 안 된다.
  rate_limited: "지금은 가입 확인 메일을 보낼 수 없습니다. 잠시 후(1시간 이내) 다시 시도해 주세요.",
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

/**
 * 에러를 달고 돌아갈 주소. 코드가 타입으로 묶여 있어 오타가 나면 빌드가 깨진다.
 *
 * 🔴 next 를 함께 실어야 한다. 전에는 `?error=` 만 만들어서, 공고 상세에서 '로그인하고 지원'으로
 *    넘어온 사람이 비밀번호를 **한 번만 틀려도** 복귀 주소를 잃고 로그인 성공 후 홈에 떨어졌다.
 */
export const authErrorPath = (path: string, code: AuthErrorCode, next?: string | null) =>
  `${path}?error=${code}${next ? `&next=${encodeURIComponent(next)}` : ""}`;
