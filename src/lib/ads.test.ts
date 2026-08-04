// 실행: pnpm test   (Node 24의 네이티브 TS 실행 — 테스트 러너 설치 불필요)
import { test } from "node:test";
import assert from "node:assert/strict";
import { AD_PRODUCTS, adProduct } from "./ads.ts";

test("판매 상품은 1주 무료 규칙을 지킨다(노출 주 = 청구 주 + 1)", () => {
  for (const p of AD_PRODUCTS) {
    assert.equal(p.billedWeeks, p.weeks - 1, `${p.weeks}주 상품의 청구 주`);
    assert.equal(p.days, p.weeks * 7);
    assert.equal(p.supply + p.vat, p.amount, `${p.weeks}주 공급가+부가세 = 결제금액`);
  }
});

test("없는 기간은 상품이 아니다 — 임의 금액 주문을 막는다", () => {
  // prepareAdOrder 가 adProduct(weeks) 로만 금액을 만든다. 여기서 null 이 나와야
  // 클라이언트가 보낸 임의의 weeks 로 0원·음수 주문이 생기지 않는다.
  assert.equal(adProduct(1), null);   // 1주는 무료 게시라 유료 상품이 없다
  assert.equal(adProduct(5), null);
  assert.equal(adProduct(0), null);
  assert.equal(adProduct(-2), null);
  assert.equal(adProduct(Number.NaN), null);
  assert.notEqual(adProduct(2), null);
});
