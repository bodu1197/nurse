/**
 * 포트원 조회 결과 + 우리 주문 상태 → **무엇을 할 것인가**.
 *
 * 🔴 왜 순수 함수로 뽑았나: 검증에서 나온 결함 3건이 전부 이 분기의 **순서** 문제였다
 *    (취소 통보를 PAID 단축에 가려 버림 / 이미 PAID 인 주문을 FAILED 로 덮어씀 /
 *     PAID 가 아닌 주문의 취소를 조용히 버림). DB 호출에 섞여 있으면 이런 건 테스트가 안 된다.
 *    판단만 떼어내면 lib/paymentFlow.test.ts 가 순서를 통째로 검증한다.
 */

export type PayView = {
  /** 포트원 status — V1: ready | paid | cancelled | failed */
  status: string;
  amount: number;
  /** 부분·전액 취소된 금액. 전액취소면 status 가 cancelled 지만, **부분취소는 status 가 paid 그대로다.** */
  cancelAmount: number;
};

export type PaymentDecision =
  | { do: "activate" }                       // 정상 결제 — 광고를 켠다
  | { do: "record_cancel"; note: string }    // 취소·부분취소 — 기록만. 광고는 안 내린다(오너 확정)
  | { do: "fail"; note: string }             // 금액 불일치 — 돈이 오간 정황이 있다. FAILED 로 내려 사람이 본다
  // 🔴 "돈이 아예 안 나갔다" 가 확정된 끝(카드 거절 등). fail 과 **반드시 구분**해야 한다:
  //    FAILED 는 관리자가 포트원과 대조할 사건이라 캐시를 자동 회수하지 않는데, 카드 거절까지
  //    거기 넣으면 흔한 실패 한 번에 손님 광고 캐시 7만원이 영영 안 돌아온다.
  | { do: "declined"; note: string }         // 결제 실패로 종료 — 캐시를 돌려주고 주문을 닫는다
  | { do: "nothing" }                        // 아직 결제 전(ready) 등 — 통보가 따로 온다
  | { do: "done" };                          // 이미 처리됨 — 중복 통보

/**
 * @param pay        포트원이 말하는 실제 거래 상태(우리가 재조회한 값 — 웹훅 본문을 믿지 않는다)
 * @param orderAmount 우리가 만든 주문 금액
 * @param orderStatus 우리 DB 의 현재 주문 상태
 */
export function decidePayment(pay: PayView, orderAmount: number, orderStatus: string): PaymentDecision {
  // 1) 취소가 가장 먼저다. 이미 PAID 인 주문에 취소 통보가 오는 것이 정상 흐름이라,
  //    "PAID 면 끝" 으로 먼저 끊으면 취소를 영원히 못 본다(이게 원래 있던 버그다).
  if (pay.status === "cancelled" || pay.status === "canceled") {
    return { do: "record_cancel", note: cancelNote("포트원에서 결제가 전액 취소됨", orderStatus) };
  }
  // 2) 부분취소는 status 가 paid 그대로다. 금액으로만 알 수 있다.
  if (pay.cancelAmount > 0) {
    return { do: "record_cancel", note: cancelNote(`포트원에서 ${won(pay.cancelAmount)}원 부분취소됨`, orderStatus) };
  }
  // 3) 이미 활성화된 주문 — 중복 통보. 아래 어떤 검사로도 내려보내면 안 된다
  //    (활성화 시점에 이미 금액을 확인했으므로, 여기서 FAILED 로 덮으면 나가는 광고를 실패로 만든다).
  //    🔴 취소(1·2)보다는 **뒤**, 실패·금액 검사보다는 **앞**이다. 이 위치가 규칙 전체를 지탱한다.
  if (orderStatus === "PAID") return { do: "done" };
  // 4) 승인 거절 등으로 **끝난** 거래. 전에는 아래 "아직 결제 전" 에 같이 묻혀서
  //    주문이 PREPARE 로 남고 사유도 안 남았다 — 왜 실패했는지가 어디에도 없었고,
  //    그 주문이 손님의 광고 캐시를 계속 붙들었다.
  if (pay.status === "failed") return { do: "declined", note: "포트원에서 결제가 실패로 종료됨" };
  // 5) 아직 결제 전(ready) — 완료 통보가 따로 온다. 아무것도 하지 않는다.
  if (pay.status !== "paid") return { do: "nothing" };
  if (pay.amount !== orderAmount) {
    return { do: "fail", note: `금액 불일치 — 결제 ${won(pay.amount)}원 / 주문 ${won(orderAmount)}원` };
  }
  return { do: "activate" };
}

const won = (n: number) => n.toLocaleString("ko-KR");

/**
 * 🔴 "광고는 유지 중" 은 **광고가 실제로 켜진 주문(PAID)에만** 붙인다.
 *    결제가 안 끝난 주문(PREPARE)이나 실패한 주문에까지 붙이면, 애초에 노출된 적 없는 건을
 *    운영자가 "지금 광고가 나가고 있다" 로 읽는다 — 대응이 정반대로 간다.
 */
function cancelNote(what: string, orderStatus: string): string {
  return orderStatus === "PAID"
    ? `${what} — 광고는 약관 제9조에 따라 유지 중. 확인 필요`
    : `${what} — 이 주문은 광고가 켜진 적 없음. 확인 필요`;
}
