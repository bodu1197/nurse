// 실행: pnpm test   (Node 24의 네이티브 TS 실행 — 테스트 러너 설치 불필요)
import { test } from "node:test";
import assert from "node:assert/strict";
import { AD_PRODUCTS, AD_WEEK_PRICE, SIGNUP_AD_CASH, adProduct, splitPayment } from "./ads.ts";

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
 * 🔴 이 테스트가 "완전 무료 광고는 없다"(오너 확정 2026-08-05)를 코드에 못 박는다.
 *    가입 캐시가 최소 광고비 이상이 되는 순간 1주짜리가 0원이 되어 공짜 광고가 부활한다.
 */
test("가입 캐시로는 어느 상품도 다 살 수 없다 — 최소 1원은 결제된다", () => {
  // 🔴 제일 싼 상품 하나만 보면 안 된다. 나중에 할인을 더 키워 어떤 상품이 캐시 밑으로
  //    내려가면, 그 상품이 곧 공짜 광고다. 전 상품을 본다.
  for (const p of AD_PRODUCTS) {
    const { cashUsed, payable } = splitPayment(p.amount, SIGNUP_AD_CASH);
    assert.equal(cashUsed, SIGNUP_AD_CASH, `${p.weeks}주에서 캐시는 전액 쓰인다`);
    assert.equal(payable, p.amount - SIGNUP_AD_CASH);
    assert.ok(payable > 0, `${p.weeks}주도 현금이 나가야 한다`);
  }
});

test("캐시가 광고비보다 많아도 광고비까지만 쓴다", () => {
  const { cashUsed, payable } = splitPayment(80_000, 500_000);
  assert.equal(cashUsed, 80_000);
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
