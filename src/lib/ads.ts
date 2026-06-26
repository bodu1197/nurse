// 광고 상품 — 단일 등급, 기간만 선택. 1주 77,000원(VAT 포함) 기준 + 누진 할인(0/10/20/30%).
export const AD_WEEK_PRICE = 77000; // 1주 결제금액(VAT 포함)

const RAW = [
  { weeks: 1, discount: 0.0 },
  { weeks: 2, discount: 0.1 },
  { weeks: 3, discount: 0.2 },
  { weeks: 4, discount: 0.3 },
];

export type AdProduct = {
  weeks: number;
  days: number;
  discount: number;   // 0~1
  amount: number;     // 결제금액(VAT 포함)
  supply: number;     // 공급가액
  vat: number;        // 부가세(10%)
};

export const AD_PRODUCTS: AdProduct[] = RAW.map((p) => {
  const amount = Math.round(AD_WEEK_PRICE * p.weeks * (1 - p.discount));
  const supply = Math.round(amount / 1.1);
  return { weeks: p.weeks, days: p.weeks * 7, discount: p.discount, amount, supply, vat: amount - supply };
});

export function adProduct(weeks: number): AdProduct | null {
  return AD_PRODUCTS.find((p) => p.weeks === weeks) ?? null;
}

export const won = (n: number) => n.toLocaleString("ko-KR") + "원";
