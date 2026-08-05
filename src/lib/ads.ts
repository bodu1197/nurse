// 💰 광고 상품 — 주 단위. **완전 무료 광고는 없다**(오너 확정 2026-08-05).
//
// 병원 회원이 되면 광고 캐시 70,000원이 1회 지급되고, 광고를 살 때 먼저 쓰인다.
// 🔴 지급 캐시(70,000) < 최소 광고비(80,000) 이므로 **첫 광고부터 반드시 현금이 나간다**(1주 = 10,000원).
//    이 한 줄이 종전의 복잡한 무료 제한 장치를 전부 대신한다 — 공짜가 없으니 셀 것도 없다.
//    🔒 여기 숫자를 고칠 때 이 부등식이 깨지면 공짜 광고가 부활한다 — ads.test.ts 가 막는다.
export const AD_WEEK_PRICE = 80_000; // 1주 정가(VAT 포함). 할인 폭을 보여줄 때의 기준값이다.
/** 병원 회원 가입 시 1회 지급하는 광고 캐시(원). DB 트리거 grant_signup_ad_cash 와 같은 값이어야 한다. */
export const SIGNUP_AD_CASH = 70_000;

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

// 🔴 주당 단가를 **5,000원씩** 내린다: 80,000 → 75,000 → 70,000 → 65,000.
//    "많이 사면 깎아 준다" 가 눈에 보여야 길게 산다(오너 지시 2026-08-05).
//    금액을 계산식이 아니라 **표로 적는 이유**: 8만·15만·21만·26만처럼 딱 떨어지는 값이라
//    병원이 암산할 수 있고, 반올림 때문에 화면과 청구가 1원 어긋날 일이 없다.
const AMOUNT_BY_WEEKS = [
  [1, 80_000],
  [2, 150_000],
  [3, 210_000],
  [4, 260_000],
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

/** 캐시를 먼저 쓰고 카드로 낼 금액. 캐시가 광고비보다 많아도 광고비까지만 쓴다. */
export function splitPayment(amount: number, cash: number): { cashUsed: number; payable: number } {
  const cashUsed = Math.max(0, Math.min(cash, amount));
  return { cashUsed, payable: amount - cashUsed };
}

// ponytail: 광고 기간을 되돌리는 계산은 만들지 않는다 — 한번 구입하면 취소가 없다(오너 확정 2026-08-04).
// 관리자가 예외적으로 회수해야 할 일이 생기면 그때 화면과 함께 만든다.
