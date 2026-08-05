// 💰 광고 상품 — 주 단위.
//
// 🔴 모델 (오너 확정 2026-08-06):
//    · **무료 1주는 병원당 딱 한 번** 준다. 노출은 되지만 유료 아래에 깔리고,
//      인재 연락처 열람과 AI 자동매치 인재추천은 **열리지 않는다**.
//      (판정은 DB의 is_talent_advertiser() — 실결제 amount > 0 을 요구한다. 무료는 자동으로 막힌다.)
//    · **유료는 공짜돈 없이 정가 그대로 받는다.** 가입 캐시 70,000원 지급은 폐지했다.
//      혜택은 상단 노출 + 연락처 열람 + AI 자동매치다.
//
// 🔴 값을 정한 근거 — 경쟁사 실측 2026-08-06 (병원잡 m.byeongwonjob.com/payment/s01_1.php):
//      우선노출만(연락처 없음)  7일  30,000
//      최고(상단+연락처 열람)   7일 105,000 · 14일 130,000 · 30일 150,000
//      VIP                     7일 180,000
//    널스넷 1주 50,000 = 같은 혜택 묶음인 병원잡 "최고" 의 절반 이하다.
//    후발주자라 가격으로 이긴다(오너 확정: "병원 유치 우선, 매출은 나중").
export const AD_WEEK_PRICE = 50_000; // 1주 정가(VAT 포함). 할인 폭을 보여줄 때의 기준값이다.

/**
 * 무료 1주의 일수. 🔴 **정본은 DB 함수 claim_free_week 의 `interval '7 days'`** 다 —
 * 실제로 며칠 노출될지는 그쪽이 정한다. 여기 값은 화면이 같은 숫자를 말하게 하려고 둔 것이고,
 * 둘이 어긋나면 안내만 거짓이 된다(기능은 안 깨진다). DB 를 바꾸면 여기도 바꿀 것.
 */
export const FREE_WEEK_DAYS = 7;

/** claim_free_week RPC 가 돌려주는 결과 코드 — DB 함수의 return 문과 **같은 집합**이어야 한다. */
export const FREE_WEEK_RESULTS = ["ok", "already_used", "not_owner", "already_live", "deadline", "hidden"] as const;
export type FreeWeekResult = (typeof FREE_WEEK_RESULTS)[number];
/** DB 에서 온 넓은 string 을 **검사해서** 좁힌다 — `as` 단언은 쓰지 않는다(isOrderStatus 와 같은 방식). */
export const isFreeWeekResult = (s: string | null | undefined): s is FreeWeekResult =>
  !!s && (FREE_WEEK_RESULTS as readonly string[]).includes(s);

export type AdProduct = {
  weeks: number;   // 노출 주
  days: number;    // 노출 일수
  amount: number;  // 광고비(VAT 포함). 실제 청구액은 캐시를 뺀 값이다.
  perWeek: number; // 주당 단가 — 길게 살수록 내려간다
  saved: number;   // 정가(1주 단가 × 주수) 대비 아낀 금액
  offPct: number;  // 같은 것을 % 로. 배지에 쓴다
  supply: number;  // 공급가액
  vat: number;     // 부가세(10%)
};

// 🔴 주당 단가가 계단으로 내려간다: 50,000 → 45,000 → 43,000 → 40,000.
//    "많이 사면 깎아 준다" 가 눈에 보여야 길게 산다(오너 지시 2026-08-05).
//    금액을 계산식이 아니라 **표로 적는 이유**: 반올림 때문에 화면과 청구가 1원 어긋날 일이 없다.
//
// 🔴 3주가 130,000 이 아니라 **129,000** 인 이유: 130,000 ÷ 3 = 43,333.33… 이라
//    화면의 "주당 ○○원"(components/AdPurchase.tsx, app/ads/page.tsx)에 소수점이 찍히고,
//    그 값을 3배 하면 129,999원이 되어 청구액과 어긋난다. 오너가 고른 13만원에서
//    1,000원 **깎는 쪽**으로 맞췄다 — 병원이 더 내는 일은 없다. ads.test.ts 가 이 성질을 지킨다.
const AMOUNT_BY_WEEKS = [
  [1, 50_000],
  [2, 90_000],
  [3, 129_000],
  [4, 160_000],
] as const;

export const AD_PRODUCTS: AdProduct[] = AMOUNT_BY_WEEKS.map(([weeks, amount]) => {
  const list = AD_WEEK_PRICE * weeks; // 할인 없을 때의 값
  const supply = Math.round(amount / 1.1);
  return {
    weeks,
    days: weeks * 7,
    amount,
    perWeek: amount / weeks,
    saved: list - amount,
    offPct: Math.round(((list - amount) / list) * 100),
    supply,
    vat: amount - supply,
  };
});

export function adProduct(weeks: number): AdProduct | null {
  return AD_PRODUCTS.find((p) => p.weeks === weeks) ?? null;
}

export const won = (n: number) => n.toLocaleString("ko-KR") + "원";

/** ad_orders.status 의 허용값 — DB check 제약과 같은 집합(마이그레이션 20260805200000). */
export const ORDER_STATUSES = ["PREPARE", "PAID", "CANCELED", "FAILED", "EXPIRED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** DB 에서 온 넓은 string 을 **검사해서** 좁힌다 — `as OrderStatus` 단언은 쓰지 않는다. */
export const isOrderStatus = (s: string | null | undefined): s is OrderStatus =>
  !!s && (ORDER_STATUSES as readonly string[]).includes(s);

/**
 * 주문 상태를 사람 말로.
 *
 * 🔴 손님 화면(/mypage/jobs/ad/orders)과 관리자 화면(/admin/orders)이 **같은 표**를 쓴다.
 *    각자 적어 두면 어긋난다 — 실제로 같은 EXPIRED 를 한쪽은 "결제 안 됨(캐시 반환)",
 *    다른 쪽은 "기간만료(캐시 반환)" 라고 불렀다. 상태 하나에 이름 하나.
 */
const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PAID: "결제완료",
  PREPARE: "결제 미완료",
  CANCELED: "결제 미진행",
  FAILED: "결제실패",
  EXPIRED: "결제 안 됨(캐시 반환)",
};

/**
 * 상태 문자열 → 라벨. DB 에서 온 값은 넓은 string 이라 그대로 받는다.
 * 🔴 `as OrderStatus` 로 단언하면 `?? s` 가 타입상 죽은 코드가 되어, 나중에 상태가 하나 늘었을 때
 *    컴파일은 통과하고 **화면만 빈칸**이 된다. 모르는 값은 값 그대로 보여 준다.
 */
export const orderStatusLabel = (s: string): string =>
  (ORDER_STATUS_LABEL as Record<string, string | undefined>)[s] ?? s;

/** 캐시를 먼저 쓰고 카드로 낼 금액. 캐시가 광고비보다 많아도 광고비까지만 쓴다. */
export function splitPayment(amount: number, cash: number): { cashUsed: number; payable: number } {
  const cashUsed = Math.max(0, Math.min(cash, amount));
  return { cashUsed, payable: amount - cashUsed };
}

// ponytail: 광고 기간을 되돌리는 계산은 만들지 않는다 — 한번 구입하면 취소가 없다(오너 확정 2026-08-04).
// 관리자가 예외적으로 회수해야 할 일이 생기면 그때 화면과 함께 만든다.
