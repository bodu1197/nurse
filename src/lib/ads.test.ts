// 실행: pnpm test   (Node 24의 네이티브 TS 실행 — 테스트 러너 설치 불필요)
import { test } from "node:test";
import assert from "node:assert/strict";
import { AD_PRODUCTS, AD_WEEK_PRICE, adProduct, splitPayment } from "./ads.ts";

test("상품 값이 스스로 어긋나지 않는다", () => {
  for (const p of AD_PRODUCTS) {
    assert.equal(p.days, p.weeks * 7);
    assert.equal(p.supply + p.vat, p.amount, `${p.weeks}주 공급가+부가세 = 광고비`);
    assert.equal(p.perWeek * p.weeks, p.amount, `${p.weeks}주 주당단가 × 주수 = 광고비`);
    assert.equal(p.saved, AD_WEEK_PRICE * p.weeks - p.amount, `${p.weeks}주 절약액`);
    assert.ok(Number.isInteger(p.perWeek), `${p.weeks}주 주당단가가 정수여야 화면에 1원이 안 흘린다`);
  }
});

/**
 * 🔴 "많이 살수록 싸다" 는 화면에만 있는 말이 아니라 **값의 성질**이어야 한다.
 *    주당 단가가 한 칸이라도 올라가면, 배지는 "N% 절약" 인데 실제로는 더 비싼 상품이 된다.
 */
test("길게 살수록 주당 단가가 내려간다", () => {
  for (let i = 1; i < AD_PRODUCTS.length; i += 1) {
    const prev = AD_PRODUCTS[i - 1];
    const cur = AD_PRODUCTS[i];
    assert.ok(cur.weeks > prev.weeks, "주수는 오름차순이어야 한다");
    assert.ok(cur.perWeek < prev.perWeek, `${cur.weeks}주 주당단가가 ${prev.weeks}주보다 싸야 한다`);
    assert.ok(cur.amount > prev.amount, `${cur.weeks}주 총액은 ${prev.weeks}주보다 커야 한다`);
  }
  assert.equal(AD_PRODUCTS[0].saved, 0, "1주는 정가다 — 할인 기준이 흔들리면 안 된다");
});

/**
 * 🔴 "유료는 공짜돈 없이 정가 그대로 받는다"(오너 확정 2026-08-06)를 코드에 못 박는다.
 *    가입 캐시 지급은 폐지했다 — 잔액이 0 이면 전액이 카드로 청구되어야 한다.
 *    캐시 배관(splitPayment·claim/release)은 남겨 뒀다. 결제 트랜잭션 한가운데라 걷어내는 것이
 *    더 위험하고, 관리자가 예외적으로 얹어 줄 여지도 남는다. 다만 **자동 지급은 없다.**
 */
test("캐시 잔액 0 이면 광고비 전액이 결제된다 — 공짜 광고가 없다", () => {
  for (const p of AD_PRODUCTS) {
    const { cashUsed, payable } = splitPayment(p.amount, 0);
    assert.equal(cashUsed, 0, `${p.weeks}주에서 쓸 캐시가 없다`);
    assert.equal(payable, p.amount, `${p.weeks}주는 정가 전액이 청구된다`);
    assert.ok(payable > 0, `${p.weeks}주도 현금이 나가야 한다`);
  }
});

test("캐시가 광고비보다 많아도 광고비까지만 쓴다", () => {
  const { cashUsed, payable } = splitPayment(AD_WEEK_PRICE, 500_000);
  assert.equal(cashUsed, AD_WEEK_PRICE);
  assert.equal(payable, 0);
});

test("없는 기간은 상품이 아니다 — 임의 금액 주문을 막는다", () => {
  // prepareAdOrder 가 adProduct(weeks) 로만 금액을 만든다. 여기서 null 이 나와야
  // 클라이언트가 보낸 임의의 weeks 로 0원·음수 주문이 생기지 않는다.
  assert.equal(adProduct(5), null);
  assert.equal(adProduct(0), null);
  assert.equal(adProduct(-2), null);
  assert.equal(adProduct(Number.NaN), null);
  assert.notEqual(adProduct(1), null); // 1주부터 판다 — 무료 게시가 없어졌다
});
