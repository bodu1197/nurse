// 광고 = 노출 기간 선택. **1주(7일)는 항상 무료로 얹어줌** → 청구 = (노출−1주). 누진 할인은 청구 주에 적용.
export const AD_WEEK_PRICE = 77000; // 1주 청구액(VAT 포함)

// 청구 주 수별 누진 할인.
const BILLED_DISCOUNT: Record<number, number> = { 1: 0, 2: 0.1, 3: 0.2 };

export type AdProduct = {
  weeks: number;       // 선택한 노출 주(2~4)
  days: number;        // 노출 일수 = weeks*7
  billedWeeks: number; // 청구 주 = weeks-1 (1주 무료)
  amount: number;      // 청구액(VAT 포함)
  supply: number;      // 공급가액
  vat: number;         // 부가세(10%)
};

// 노출 2/3/4주(1주는 무료 게시로 충분 → 유료는 2주부터, 항상 1주 무료 포함).
export const AD_PRODUCTS: AdProduct[] = [2, 3, 4].map((weeks) => {
  const billedWeeks = weeks - 1;
  const amount = Math.round(AD_WEEK_PRICE * billedWeeks * (1 - (BILLED_DISCOUNT[billedWeeks] ?? 0)));
  const supply = Math.round(amount / 1.1);
  return { weeks, days: weeks * 7, billedWeeks, amount, supply, vat: amount - supply };
});

export function adProduct(weeks: number): AdProduct | null {
  return AD_PRODUCTS.find((p) => p.weeks === weeks) ?? null;
}

export const won = (n: number) => n.toLocaleString("ko-KR") + "원";
