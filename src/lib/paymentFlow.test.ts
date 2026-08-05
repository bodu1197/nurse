// 실행: pnpm test   (Node 24의 네이티브 TS 실행 — 테스트 러너 설치 불필요)
//
// 이 파일은 2026-08-04 검증에서 나온 CRITICAL 3건이 다시 살아나는지 지키는 자물쇠다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decidePayment } from "./paymentFlow.ts";

const AMOUNT = 77_000;
const pay = (status: string, amount = AMOUNT, cancelAmount = 0) => ({ status, amount, cancelAmount });

test("정상 결제는 광고를 켠다", () => {
  assert.deepEqual(decidePayment(pay("paid"), AMOUNT, "PREPARE"), { do: "activate" });
});

test("이미 PAID 인 주문에 같은 통보가 또 와도 두 번 켜지 않는다", () => {
  assert.deepEqual(decidePayment(pay("paid"), AMOUNT, "PAID"), { do: "done" });
});

// CRITICAL 1 — 취소 통보가 "PAID 면 끝" 단축에 가려 사라지던 것
test("PAID 인 주문의 전액취소 통보를 반드시 잡는다", () => {
  const d = decidePayment(pay("cancelled"), AMOUNT, "PAID");
  assert.equal(d.do, "record_cancel");
});

test("PAID 가 아닌 주문의 취소도 기록한다 — 상태로 걸러 버리지 않는다", () => {
  for (const s of ["PREPARE", "FAILED", "CANCELED"]) {
    assert.equal(decidePayment(pay("cancelled"), AMOUNT, s).do, "record_cancel", `주문 상태 ${s}`);
  }
});

test("취소 철자는 cancelled/canceled 둘 다 받는다", () => {
  assert.equal(decidePayment(pay("cancelled"), AMOUNT, "PAID").do, "record_cancel");
  assert.equal(decidePayment(pay("canceled"), AMOUNT, "PAID").do, "record_cancel");
});

// CRITICAL 2 — 부분취소는 status 가 paid 그대로라 금액으로만 보인다
test("부분취소는 status 가 paid 인 채로 온다 — 금액으로 잡는다", () => {
  const d = decidePayment(pay("paid", AMOUNT, 20_000), AMOUNT, "PAID");
  assert.equal(d.do, "record_cancel");
  assert.match(d.do === "record_cancel" ? d.note : "", /부분취소/);
});

// CRITICAL 3 — 나가는 중인 광고를 FAILED 로 덮어쓰던 것
test("이미 PAID 인 주문은 금액이 달라 보여도 FAILED 로 덮지 않는다", () => {
  assert.deepEqual(decidePayment(pay("paid", 1_000), AMOUNT, "PAID"), { do: "done" });
});

test("결제는 됐는데 금액이 다르면 FAILED + 사유", () => {
  const d = decidePayment(pay("paid", 1_000), AMOUNT, "PREPARE");
  assert.equal(d.do, "fail");
  assert.match(d.do === "fail" ? d.note : "", /금액 불일치/);
});

// 광고가 켜진 적 없는 주문에 "광고 유지 중" 이라고 적으면 운영자 대응이 정반대로 간다
test("취소 메모는 광고가 실제로 켜졌을 때만 '유지 중' 이라고 쓴다", () => {
  const paidOrder = decidePayment(pay("cancelled"), AMOUNT, "PAID");
  assert.match(paidOrder.do === "record_cancel" ? paidOrder.note : "", /유지 중/);

  const neverLive = decidePayment(pay("cancelled"), AMOUNT, "PREPARE");
  assert.match(neverLive.do === "record_cancel" ? neverLive.note : "", /켜진 적 없음/);
});

test("아직 결제 전(ready)이면 아무것도 하지 않는다", () => {
  assert.deepEqual(decidePayment(pay("ready"), AMOUNT, "PREPARE"), { do: "nothing" });
});

// 🔴 'failed' 는 "아직 결제 전" 이 아니라 **끝난** 거래다. 전에는 ready 와 같이 nothing 으로 묶여
//    주문이 PREPARE 로 남고 사유도 안 남았다 — 손님 캐시를 계속 붙든 채 이유가 어디에도 없었다.
test("카드 거절은 declined — 캐시를 돌려주는 쪽으로 간다", () => {
  const d = decidePayment(pay("failed"), AMOUNT, "PREPARE");
  assert.equal(d.do, "declined");
  assert.match(d.do === "declined" ? d.note : "", /실패로 종료/);
});

// 🔴 이 둘을 섞으면 **돈이 안 나간 흔한 실패**(카드 거절)가 관리자 대기열로 가고, 그 주문이
//    캐시 자동 회수 대상에서 빠져 손님 7만원이 영영 안 돌아온다. 구분을 못 박는다.
test("금액 불일치(fail)와 카드 거절(declined)은 서로 다른 결정이다", () => {
  assert.equal(decidePayment(pay("paid", 1_000), AMOUNT, "PREPARE").do, "fail");
  assert.equal(decidePayment(pay("failed"), AMOUNT, "PREPARE").do, "declined");
});

// 실패 통보가 늦게 와도 이미 켜진 광고를 끄지 않는다(취소 판정이 먼저이므로 여기 오지도 않지만,
// 순서가 바뀌는 순간 나가는 광고가 죽는다 — 그 사고를 여기서 못 박는다).
test("이미 PAID 인 주문에 'failed' 가 와도 광고를 죽이지 않는다", () => {
  assert.deepEqual(decidePayment(pay("failed"), AMOUNT, "PAID"), { do: "done" });
});

// 오너 확정 2026-08-04 — 산 광고를 무르는 기능은 없다
test("어떤 취소도 광고를 내리라고 지시하지 않는다", () => {
  const cases = [
    decidePayment(pay("cancelled"), AMOUNT, "PAID"),
    decidePayment(pay("paid", AMOUNT, AMOUNT), AMOUNT, "PAID"),
  ];
  for (const d of cases) assert.equal(d.do, "record_cancel", "기록만 — 회수 지시는 없어야 한다");
});
