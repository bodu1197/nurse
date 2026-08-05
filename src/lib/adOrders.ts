import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { decidePayment } from "@/lib/paymentFlow";
import { getPayment, findPaidPayment } from "@/lib/iamport";
import { DAY_MS } from "@/lib/date";
import { type OrderStatus } from "@/lib/ads";

/**
 * 광고 결제(포트원)의 **판단과 기록**.
 *
 * 🔴 이 파일에는 `"use server"` 를 쓰지 않는다. 그걸 붙이면 Next 가 export 된 async 함수마다
 *    서버 액션 ID 를 발급해, 브라우저에서 직접 부를 수 있는 진입점이 하나씩 생긴다.
 *    특히 iamportWebhook 은 **인증 검사가 전혀 없는** 함수라(포트원 웹훅 전용) 그 표면을
 *    만들 이유가 없다 — 라우트 핸들러(app/api/iamport/webhook)만 이걸 부른다.
 *    손님 브라우저가 부르는 액션 넷은 app/mypage/ads/actions.ts 에 따로 있다.
 *
 * 🔴 옮기기만 했다. 로직은 검증(2026-08-05)을 통과한 그대로다 — 위치만 바뀌었다.
 *
 * 🔒 파일명이 lib/adOrders.ts 인 이유: lib/ads/ 디렉터리로 두면 기존 lib/ads.ts 와 이름이 겹쳐,
 *    누군가 lib/ads/index.ts 를 만드는 순간 프로젝트 전역의 `@/lib/ads` import 대상이
 *    코드 한 줄 안 고치고 조용히 바뀐다(결제 상수·OrderStatus 가 딸린 모듈이다).
 */

// ───────── 광고 결제(포트원) ─────────
// ad_orders.note 는 제약 없는 text 지만 관리자가 화면에서 훑어야 하는 칸이다.
// 취소 통보가 반복돼 무한히 길어지지 않도록 여기서 자른다(사고 한 건당 한 줄 ≈ 60자, 열 줄이면 충분).
const NOTE_MAX = 600;
/** 결제 준비 실패 사유. 넓은 string 으로 두면 오타를 화면에서야 알게 된다. */
type AdPrepareError = "unavailable" | "auth" | "product" | "not_owner" | "db" | "cash_only" | "changed" | "deadline" | "cash_locked";
export type AdPrepare = { ok: true; merchant_uid: string; amount: number; name: string } | { ok: false; error: AdPrepareError };

/**
 * 결제되지 않은 주문이 붙들고 있는 광고 캐시를 되돌린다.
 *
 * 🔴 캐시는 **주문을 만들 때 바로 잔액에서 뺀다**(claim). 그래야 결제창을 두 개 띄워
 *    같은 캐시를 두 번 쓰는 길이 막힌다. 대신 손님이 결제창을 닫고 떠나면 그 캐시가
 *    주문에 묶인 채 남으므로, 다음 결제 준비 때 오래된 것부터 풀어 준다.
 * 🔴 푼 주문은 **EXPIRED 로 못 박는다**(조건부 UPDATE 로 성공한 행만 푼다).
 *    풀어 주고도 나중에 활성화되면 캐시를 공짜로 가져간 셈이 되기 때문이다 —
 *    activateAdOrder 가 EXPIRED 를 선점 대상에서 뺀다.
 * 🔴 2시간을 기다리는 이유: 카드 결제창은 몇 분이면 끝난다. 넉넉히 지난 것만 풀어야
 *    **결제 중인 주문의 캐시를 뺏는** 사고가 안 난다.
 */
const STALE_ORDER_MS = 2 * 60 * 60 * 1000;   // 포트원에 못 물어봐도 이만큼 지났으면 푼다
const CONFIRM_UNPAID_MS = 10 * 60 * 1000;    // 포트원이 "결제 없음" 이라고 하면 이만큼만 지나도 푼다
/**
 * 캐시를 붙들고 있어 **자동 회수 대상**인 상태.
 *
 * 🔴 FAILED 는 뺐다. 금액 불일치처럼 **돈이 실제로 오간 사고**라, 자동으로 EXPIRED 로 덮으면
 *    /admin/orders 「실패」 탭과 대시보드의 '실패 주문' 카운터에서 통째로 사라진다 —
 *    돈은 받고 광고는 못 준 건이 아무도 안 보는 곳으로 숨는다. 사람이 포트원과 대조할 사건이다.
 */
const ORDER_HOLDS_CASH: readonly OrderStatus[] = ["PREPARE", "CANCELED"];
/**
 * 결제가 확인되면 **되살릴 수 있는** 상태. CANCELED 는 콜백만 실패하고 승인은 났을 수 있어 포함한다.
 *
 * 🔴 EXPIRED·FAILED 는 없다 — **둘 다 캐시를 이미 돌려준 주문**이다. 되살려 광고를 켜 주면
 *    캐시는 돌려받고 광고도 받는 이중 이득이 된다(FAILED 는 금액 불일치 전용 상태이고,
 *    recordAmountMismatch 가 그 자리에서 캐시를 반환한다). 금액이 어긋난 주문을 뒤늦게
 *    자동으로 켜 주는 것도 애초에 맞지 않다 — 사람이 포트원과 대조할 사건이다.
 */
const ORDER_REVIVABLE: readonly OrderStatus[] = ["PREPARE", "CANCELED"];

/**
 * 그 주문에 **받은 돈이 없다**가 확정됐는가 — 광고 캐시를 돌려줘도 되는가.
 *
 * 🔴 물음을 하나로 좁혔다. 포트원에 "승인된 결제가 있나"(findPaidPayment)만 묻는다.
 *    카드 거절·전액취소·결제창만 열고 이탈(ready) 은 전부 "승인된 결제 없음" 으로 같은 답이 되고,
 *    그 셋 모두 돌려주는 것이 맞다. 상태 목록을 손으로 나열하면 하나 빠뜨리는 순간
 *    손님 캐시가 영원히 잠긴다(실제로 'ready' 가 빠져 있었다).
 * 🔴 조회 실패(null)에는 단정하지 않는다 — 승인된 결제의 캐시를 뺏는 쪽이 훨씬 나쁘다.
 */
export function noPaymentHeld(p: Awaited<ReturnType<typeof findPaidPayment>>): boolean {
  return p === "notfound";
}

/**
 * 아직 EXPIRED 로 못 박으면 안 되는 시점인가.
 *
 * 🔴 EXPIRED 는 **되돌릴 수 없다**(ORDER_REVIVABLE 밖). 카드사 결제창은 거절된 뒤에도 같은
 *    주문번호로 재시도가 되고, 승인이 났는데 브라우저 콜백만 실패해서 오는 경우도 있다.
 *    그 찰나에 포트원이 아직 승인 건을 안 보여주면 "결제 없음" 으로 읽혀 캐시를 돌려주고
 *    주문을 닫는데, 뒤이어 도착한 웹훅은 광고를 켜지 못한다 — **카드는 긁혔는데 광고는 없다.**
 *    주문을 만든 지 얼마 안 됐으면 닫지 않고 회수기(2시간 안전판까지 있다)에 맡긴다.
 *    그동안 손님이 8배를 결제하는 일은 lockedAdCash 게이트가 이미 막는다.
 */
const tooSoonToClose = (createdAt: string) => Date.now() - new Date(createdAt).getTime() < CONFIRM_UNPAID_MS;

/**
 * 잡아둔 캐시를 돌려준다.
 *
 * 🔴 주문 상태 전이와 잔액 복구는 **DB 함수 하나**가 한 트랜잭션으로 한다
 *    (release_ad_order_cash — 마이그레이션 20260805230000). 앱에서 두 문장으로 나누면
 *    그 사이에 프로세스가 죽었을 때 손님 캐시가 흔적 없이 사라진다.
 * 🔴 cash_used 를 0 으로 내리는 것이 반환의 핵심이다.
 *    ① 상태만 바꾸면, 뒤늦은 금액 불일치 통보가 EXPIRED 를 FAILED 로 되살렸을 때 같은
 *       cash_used 가 **다시 반환 대상**이 되어 캐시가 몇 번이든 불어났다(100원 결제 → 캐시 7만원).
 *    ② 화면(결제 내역·영수증)이 이 값으로 "광고 캐시 얼마 사용" 을 그린다. 돌려준 뒤에도
 *       0 이 아니면 쓰지도 않은 캐시를 썼다고 말하게 된다.
 * @param status  반환 뒤 주문 상태(그대로 두려면 현재 상태를 그대로 준다)
 * @param allowed 이 상태일 때만 손댄다 — 그사이 결제가 확인됐으면 아무것도 하지 않는다
 */
export async function releaseOrderCash(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
  status: OrderStatus,
  allowed: readonly OrderStatus[] = ORDER_HOLDS_CASH,
  // 🔴 사유를 호출부가 준다. 고정 문구("결제되지 않아…")를 쓰면, **결제가 실제로 일어난** 경로
  //    (금액 불일치·공고 삭제)에서도 그 줄이 붙어 한 주문의 메모 두 줄이 서로를 부정한다 —
  //    정산 대조하는 사람이 돈이 오간 건을 "결제 안 됨" 으로 읽는다.
  why: (amount: string) => string = (a) => `결제되지 않아 광고 캐시 ${a}원을 돌려드렸습니다`,
): Promise<void> {
  const { data: returned, error } = await admin.rpc("release_ad_order_cash", {
    p_order: orderId, p_allowed: [...allowed], p_next: status,
  });
  if (error) {
    // 손님 캐시가 사라진 것이다. 로그만으로는 못 찾으니 주문에도 남긴다.
    console.error("광고 캐시 반환 실패 — 수동 확인 필요:", orderId, error.message);
    await appendOrderNote(admin, orderId, "광고 캐시 반환 실패 — 수동 확인 필요");
    return;
  }
  if (!returned) return; // 다른 요청이 먼저 돌려줬거나, 그사이 결제가 확인됐다
  await appendOrderNote(admin, orderId, why(returned.toLocaleString("ko-KR")));
}

/** 결제는 됐는데 광고를 못 켠 경우의 반환 사유 — "결제되지 않아" 라고 쓰면 거짓이다. */
const COULD_NOT_APPLY = (a: string) => `광고를 적용하지 못해 광고 캐시 ${a}원을 돌려드렸습니다`;

/**
 * 결제되지 않은 주문이 붙들고 있는 캐시를 돌려준다.
 *
 * 🔴 두 갈래다. 종전에는 "2시간 지난 것" 하나뿐이라, 결제창을 한 번 닫은 손님이 그동안
 *    캐시를 못 쓰고 **1주를 10,000원이 아니라 80,000원에** 결제하는 길이 열려 있었다.
 *    ① 포트원에 물어 "그 주문번호로 결제가 아예 없다" 가 확정되면 **10분** 만에 푼다.
 *       10분은 카드 결제창이 열려 있을 만한 시간을 넉넉히 넘긴 값이고, 승인이 났다면
 *       그 순간 포트원에 기록이 생기므로 진행 중인 결제의 캐시를 뺏지 않는다.
 *    ② 포트원 조회가 실패해도 **2시간**이 지나면 푼다(거래번호가 없는 주문만).
 *       외부 서비스가 죽었다고 손님 캐시를 무한정 잡아둘 수는 없다.
 */
export async function reclaimStaleAdCash(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<void> {
  // 🔴 note 를 덮어쓰지 않는다. 여기 있는 주문에는 사고 기록이 남아 있을 수 있는데, 덮으면
  //    그 사고가 "결제되지 않았습니다" 라는 반대 사실로 바뀐다. 사유는 releaseOrderCash 가 덧붙인다.
  const now = Date.now();
  const { data: stale } = await admin
    .from("ad_orders")
    .select("id, merchant_uid, cash_used, created_at")
    .eq("buyer_id", userId)
    .in("status", [...ORDER_HOLDS_CASH])
    // 🔴 포트원 거래번호가 남은 주문은 건드리지 않는다 — **돈이 실제로 오간 주문**이다.
    //    전에는 이런 건까지 EXPIRED 로 덮고 "결제되지 않아 돌려드렸습니다" 를 붙여서,
    //    한 주문의 메모 두 줄이 서로를 부정하고 사고가 관리자 대기열에서 사라졌다.
    .is("imp_uid", null)
    .gt("cash_used", 0)
    .lt("created_at", new Date(now - CONFIRM_UNPAID_MS).toISOString())
    // 오래 묶인 것부터 푼다 — 정렬이 없으면 LIMIT 이 어떤 5건을 줄지 보장되지 않는다.
    .order("created_at", { ascending: true })
    // 🔴 이 루프는 결제 버튼을 누른 손님을 기다리게 하면서 돈다(주문마다 포트원 왕복 1회).
    //    lockedAdCash 게이트 때문에 실제로는 계정당 1건이지만, 상한을 못 박아 두지 않으면
    //    옛 데이터가 쌓인 계정 하나가 결제창을 영영 못 열게 된다.
    .limit(5);
  // 🔴 포트원 왕복을 **병렬로** 돌린다. 이 함수는 손님이 「결제하기」를 누른 뒤 실행되므로,
  //    순차로 돌면 그 왕복이 전부 대기 시간으로 쌓인다.
  await Promise.all((stale ?? []).map(async (o) => {
    // 🔴 2시간이 지났어도 **묻기는 한다.** 전에는 단축평가로 조회를 건너뛰어, 승인은 났는데
    //    콜백·웹훅이 둘 다 실패한 주문을 2시간 뒤 그냥 EXPIRED 로 죽였다
    //    (돈은 받고 광고는 못 준 건이 된다). 2시간 규칙은 **포트원이 대답을 못 할 때**의
    //    마지막 수단이지, 대답을 무시하는 규칙이 아니다.
    const p = await findPaidPayment(o.merchant_uid);
    // 🔴 승인된 결제가 잡혔는데 우리 주문에 거래번호가 없다 = 콜백도 웹훅도 못 받은 건이다.
    //    그대로 두면 회수기는 영원히 건너뛰고(캐시 반환 없음) 게이트는 계속 잠긴 것으로 세어
    //    **그 병원은 다시는 광고를 못 산다.** 거래번호를 남겨 두 범위에서 빼고, 관리자가 볼 수 있게 한다.
    if (p !== "notfound" && p !== null) {
      // 🔴 상태를 PREPARE 로 되돌린다. CANCELED 로 두면 관리자 대시보드의 어떤 카운터에도
      //    안 잡힌다(stale_orders 는 PREPARE 1시간 초과, failed_orders 는 FAILED 만 센다) —
      //    돈은 받고 광고는 못 준 건이 CANCELED 목록에 묻혀 아무도 모르게 된다.
      await admin.from("ad_orders")
        .update({ imp_uid: p.imp_uid, status: "PREPARE" })
        .eq("id", o.id).in("status", [...ORDER_HOLDS_CASH]).is("imp_uid", null);
      await appendOrderNote(admin, o.id, "결제가 확인됐으나 광고가 켜지지 않았습니다 — 수동 확인 필요");
      return;
    }
    const old = new Date(o.created_at).getTime() < now - STALE_ORDER_MS;
    if (!noPaymentHeld(p) && !(old && p === null)) return;
    await releaseOrderCash(admin, o.id, "EXPIRED");
  }));
}

/**
 * FAILED(금액 불일치)가 캐시를 붙든 채 남는 길을 쓸어 준다.
 *
 * 🔴 reclaimStaleAdCash 와 **따로** 둔다. 그쪽은 "잠긴 캐시가 있을 때만" 도는데, 잠김 판정
 *    (lockedAdCash)은 PREPARE·CANCELED 만 세므로 FAILED 뿐인 계정은 회수기가 아예 안 돈다 —
 *    같은 함수 안에 두었더니 정확히 필요한 상황에서 도달 불가였다.
 * 🔴 포트원 왕복이 없는 인덱스 질의 하나뿐이라 **항상** 돌려도 싸다.
 *    상태는 FAILED 그대로 두고 캐시만 돌려준다 — 관리자 「실패」 탭에서 사라지지 않는다.
 */
export async function reclaimStuckFailedCash(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<void> {
  const { data: stuck } = await admin
    .from("ad_orders").select("id")
    .eq("buyer_id", userId).eq("status", "FAILED").gt("cash_used", 0).limit(5);
  // 주문끼리 독립이고 락 순서도 같다(ad_orders → profiles) — 병렬로 돌려 대기 시간을 줄인다.
  await Promise.all((stuck ?? []).map((o) => releaseOrderCash(admin, o.id, "FAILED", ["FAILED"], COULD_NOT_APPLY)));
}

/**
 * "결제가 끝내 일어나지 않았다" 가 확정된 주문을 닫는다 — 사유를 남기고 잡아둔 캐시를 돌려준다.
 * 카드 거절(포트원 status='failed')이 여기로 온다. FAILED(금액 불일치)와 달리 돈이 안 나갔으므로
 * 관리자 대기열에 쌓을 일이 아니고, 손님 캐시는 즉시 돌아가야 한다.
 */
export async function markOrderUnpaid(
  admin: ReturnType<typeof createAdminClient>,
  order: { id: string; buyer_id: string | null; cash_used: number; created_at: string },
  note: string,
): Promise<void> {
  await appendOrderNote(admin, order.id, note);
  // 🔴 갓 만든 주문은 **닫지 않는다.** 카드사 결제창은 거절된 뒤에도 같은 주문번호로 재시도가
  //    되는데, 실패 통보가 재시도 성공보다 먼저 도착하는 순서가 있다. 그때 여기서 EXPIRED 로
  //    못 박으면 뒤이은 승인이 광고를 켜지 못한다(EXPIRED 는 되살리지 않는다) —
  //    카드는 긁혔는데 광고는 없는 최악이다. 사유만 남기고, 정리는 회수기에 맡긴다
  //    (회수기는 포트원에 "승인된 결제가 있나" 를 다시 물어 없을 때만 캐시를 돌려준다).
  if (tooSoonToClose(order.created_at)) return;
  if (order.cash_used > 0 && order.buyer_id) {
    await releaseOrderCash(admin, order.id, "EXPIRED");
    return;
  }
  // 캐시를 안 쓴 주문(또는 탈퇴 회원)은 상태만 닫는다. 되살아나면 안 되므로 EXPIRED 다.
  await admin.from("ad_orders").update({ status: "EXPIRED" }).eq("id", order.id).in("status", [...ORDER_HOLDS_CASH]);
}

/**
 * 금액 불일치 — **돈이 오간 정황이 있는 사고**를 기록한다(광고는 켜지 않는다).
 *
 * 🔴 상태 전이와 기록을 분리한다. 한 번의 UPDATE 로 묶으면 두 가지가 조용히 사라진다:
 *    ① 주문이 이미 EXPIRED·PAID 면 조건에 걸려 **0행** — imp_uid 도 사유도 어디에도 안 남고
 *       재시도도 오지 않는다. 정산 대조할 실마리가 통째로 없어진다.
 *    ② note 를 덮어쓰면 앞선 기록("광고 캐시 반환 실패 — 수동 확인 필요" 같은, 손님 돈이
 *       증발한 유일한 증거)이 지워진다.
 * 🔴 잡아둔 캐시는 여기서 돌려준다. 광고는 켜지지 않았는데 캐시까지 가져가면 손님이 두 번 잃는다.
 *    상태는 FAILED 로 **남겨 둔다** — /admin/orders 「실패」 탭에서 사람이 포트원과 대조할 사건이다.
 */
export async function recordAmountMismatch(
  admin: ReturnType<typeof createAdminClient>,
  order: { id: string; buyer_id: string | null; cash_used: number },
  impUid: string,
  note: string,
): Promise<void> {
  await admin.from("ad_orders")
    .update({ status: "FAILED", imp_uid: impUid })
    .eq("id", order.id).in("status", [...ORDER_REVIVABLE]);
  // 상태를 못 바꿨더라도(EXPIRED·PAID) 거래번호는 반드시 남는다 — 없으면 그 결제를 찾지 못한다.
  await admin.from("ad_orders").update({ imp_uid: impUid }).eq("id", order.id).is("imp_uid", null);
  await appendOrderNote(admin, order.id, note);
  if (order.cash_used > 0 && order.buyer_id) {
    await releaseOrderCash(admin, order.id, "FAILED", ["FAILED"], COULD_NOT_APPLY);
  }
}

/**
 * **결제가 일어난 적 없는데** 캐시를 붙들고 있는 내 주문의 합계. 0 이 아니면 지금 사면 정가를 낸다.
 *
 * 🔴 `.is("imp_uid", null)` 이 반드시 있어야 한다 — 자동 회수(reclaimStaleAdCash)가 대상으로 삼는
 *    범위와 **정확히 같아야** 하기 때문이다. 거래번호가 붙은 주문은 회수기가 건너뛰므로, 여기에
 *    포함하면 그 병원은 "잠시 후 캐시가 돌아옵니다" 라는 안내를 받으며 **영원히 광고를 못 산다**.
 *    거래번호가 있다는 것은 그 캐시가 잠긴 게 아니라 이미 **쓰인** 것이다(웹훅이 그 주문을 켠다).
 */
export async function lockedAdCash(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<number> {
  const { data } = await admin
    .from("ad_orders").select("cash_used")
    .eq("buyer_id", userId).in("status", [...ORDER_HOLDS_CASH]).is("imp_uid", null).gt("cash_used", 0);
  return (data ?? []).reduce((n, o) => n + o.cash_used, 0);
}

// 결제 활성화(검증 통과/웹훅 공용, 멱등). 광고 노출 기간 연장.
// impUid=null은 실결제가 아닌 경우(관리자 테스트) — 포트원 거래번호 컬럼을 가짜 값으로 오염시키지 않는다.
// 성공 여부를 반환 — 호출부가 실패를 사용자/포트원에 알려 재시도되게 한다.
export async function activateAdOrder(admin: ReturnType<typeof createAdminClient>, orderId: string, jobId: string, days: number, tier: string, impUid: string | null): Promise<boolean> {
  // 선점(CAS): PREPARE→PAID 전환에 성공한 요청만 기간을 연장한다. 조건부 update는 Postgres에서 원자적이라
  // 클라 콜백과 웹훅이 동시에 들어와도 연장은 정확히 1회. (먼저 연장하고 나중에 PAID로 올리면 재시도 때 2배 연장됨)
  const { data: claimed, error: claimErr } = await admin
    .from("ad_orders")
    // 🔴 note 는 지우지 않는다. 전에 실패했던 사유(금액 불일치 등)는 나중에 복구 활성화가
    //    성공해도 그때 무슨 일이 있었는지 알아야 할 기록이다.
    .update({ status: "PAID", imp_uid: impUid, paid_at: new Date().toISOString() })
    .eq("id", orderId)
    // 🔴 EXPIRED 는 **되살리지 않는다.** 결제되지 않아 캐시를 이미 돌려준 주문이라,
    //    여기서 켜 주면 캐시를 공짜로 가져간 광고가 된다(releaseOrderCash 참고).
    //    CANCELED 는 되살린다 — 콜백만 실패하고 승인은 났을 수 있다.
    //    FAILED 도 되살리지 않는다 — recordAmountMismatch 가 그 자리에서 캐시를 돌려주므로,
    //    켜 주면 캐시는 돌려받고 광고도 받는 이중 이득이 된다.
    .in("status", [...ORDER_REVIVABLE])
    .select("id");
  if (claimErr) return false;        // DB 오류 — 0행과 구분해야 한다(성공으로 착각하면 재시도가 끊긴다)
  if (!claimed?.length) {
    const { data: cur } = await admin.from("ad_orders").select("status").eq("id", orderId).maybeSingle();
    if (cur?.status === "PAID") return true; // 이미 다른 경로가 활성화 완료
    // 만료된 주문에 결제가 들어왔다 — 돈은 나갔는데 광고는 못 켠다. 반드시 사람이 봐야 한다.
    await appendOrderNote(admin, orderId, "결제가 확인됐지만 주문이 만료되어 광고를 켜지 못했습니다 — 수동 확인 필요");
    return false;
  }

  const { data: job } = await admin.from("jobs").select("featured_until, status").eq("id", jobId).maybeSingle();
  const now = Date.now();
  const base = job?.featured_until ? Math.max(now, new Date(job.featured_until).getTime()) : now;
  const until = new Date(base + days * DAY_MS).toISOString();
  const { data: updated, error: jobErr } = await admin
    .from("jobs")
    // 🔴 posted_at 은 **첫 게시(draft→open)일 때만** 찍는다. 전에는 연장 결제마다 오늘로 덮어써서,
    //    석 달 전 공고가 「2026-08-05 등록」으로 바뀌고 관리자 대시보드의 '오늘 등록 공고'가
    //    신규 0건인 날에도 올랐다(신규 유입 지표가 연장 건에 오염됐다).
    //    목록 상단 노출은 ad_live 정렬이 이미 보장하므로 잃는 것이 없다.
    .update({
      featured_until: until, ad_tier: tier, status: "open",
      ...(job?.status === "draft" ? { posted_at: new Date().toISOString() } : {}),
    })
    .eq("id", jobId)
    .select("id"); // 0행이면 error가 null이므로 반환행으로 실제 반영을 확인
  if (jobErr || !updated?.length) {
    // 되돌려 재시도 가능하게.
    // 🔴 imp_uid 는 **지우지 않는다.** 전에는 같이 비웠는데, 그 사이 웹훅이 "이미 PAID" 를 보고
    //    200 을 돌려줘 재시도가 끊긴 경우 **승인은 났는데 거래번호도 사유도 없는 PREPARE** 만 남았다.
    //    거래번호가 있어야 관리자가 포트원에서 그 결제를 찾아 손으로 켤 수 있다.
    await admin.from("ad_orders").update({ status: "PREPARE", paid_at: null }).eq("id", orderId);
    await appendOrderNote(admin, orderId, "결제는 확인됐으나 광고 적용에 실패 — 수동 확인 필요");
    return false;
  }
  // 💰 캐시는 주문을 만들 때 이미 뺐다(prepareAdOrder 의 claim_ad_cash). 여기서 또 빼지 않는다 —
  //    그게 같은 캐시를 두 번 쓰던 원인이었다.
  return true;
}

/**
 * 🔴 넓은 string 이 아니라 리터럴 유니온이다(AdPrepareError 와 같은 이유).
 *    화면 두 곳(AdPurchase · /mypage/jobs/ad/return)이 이 값으로 문구를 고르는데, 오타 하나면
 *    조용히 일반 분기로 떨어져 **돈이 나간 금액 불일치가 "확인 중" 으로 묻힌다.**
 */
type AdVerifyError = "auth" | "order" | "verify" | "canceled" | "notpaid" | "declined" | "amount" | "activate";
export type AdVerify = { ok: true; orderId: string } | { ok: false; error: AdVerifyError };

/**
 * 주문 메모에 한 줄 **덧붙인다**(덮어쓰지 않는다).
 *
 * 🔴 취소·부분취소 기록에 쓴다. 광고는 건드리지 않는다 (오너 확정 2026-08-04: 한번 구입하면 취소 없다).
 *    취소 통보에 광고를 자동으로 내리면, 광고를 올리고 10분 만에 사람을 구한 병원이
 *    카드사에 전화해 승인취소를 걸어 **노출은 받고 돈은 안 내는** 길이 열린다.
 *    약관 제9조가 환불하지 않는다고 이미 못박았으므로, 취소 통보는 자동 처리 대상이 아니라
 *    사람이 대응할 **사건**이다. 상태도 그대로 둔다 — 광고가 나가는 중인데 CANCELED 로 내리면
 *    화면이 사실과 어긋난다.
 *
 * 🔴 상태로 거르지 않는다. 전에는 `.eq("status","PAID")` + `.is("note", null)` 이 걸려 있어서
 *    ① PAID 가 아닌 주문의 취소 ② 메모가 이미 있는 주문의 2차 취소(부분취소 뒤 전액취소)가
 *    **조용히 사라졌다.** 이 함수가 막으려던 게 정확히 그거다. 모르는 것이 제일 나쁘다.
 *
 * 같은 문구가 이미 있으면 다시 붙이지 않는다 — 중복 웹훅에 같은 줄이 쌓이지 않게.
 *
 * ponytail: 읽고-쓰기라 원자적이지 않다. 같은 취소 웹훅 둘이 정확히 동시에 오면 같은 줄이 두 번 붙는다.
 *   취소는 드물고 결과도 "메모에 중복 줄" 이라 무해해서 락을 걸지 않았다. 정확성이 필요해지면
 *   note 를 별도 표(ad_order_events)로 옮기고 append 를 insert 로 바꾼다.
 */
export async function appendOrderNote(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
  line: string,
): Promise<"ok" | "retry"> {
  const { data: cur, error: readErr } = await admin
    .from("ad_orders").select("note").eq("id", orderId).maybeSingle();
  if (readErr) return "retry";
  const prev = cur?.note ?? "";
  if (prev.includes(line)) return "ok"; // 중복 통보
  const { error } = await admin
    .from("ad_orders")
    // 🔴 slice(-NOTE_MAX) — **뒤에서** 자른다. 앞에서 자르면 길이가 한계에 닿는 순간
    //    방금 붙인 최신 사고가 잘려나가고, 그러고도 "ok" 를 돌려줘 조용히 사라진다.
    .update({ note: `${prev ? `${prev}\n` : ""}🔴 ${line}`.slice(-NOTE_MAX) })
    .eq("id", orderId);
  return error ? "retry" : "ok";
}

// 포트원 웹훅(서버-투-서버) — 클라 콜백 실패 대비. imp_uid로 재검증 후 활성화·취소.
// 반환값이 재시도 여부를 가른다: "retry"만 5xx로 응답해 포트원이 다시 보내게 하고,
// 다시 보내도 결과가 같은 경우("ok"/"ignored")는 200으로 끊는다 — 안 그러면 영원히 재시도한다.
export async function iamportWebhook(impUid: string, merchantUid: string): Promise<"ok" | "ignored" | "retry"> {
  const admin = createAdminClient();
  const { data: order } = await admin.from("ad_orders").select("id, buyer_id, job_id, days, tier, amount, status, cash_used, created_at").eq("merchant_uid", merchantUid).maybeSingle();
  if (!order) return "ignored"; // 우리 주문이 아님

  // 🔴 여기서 `order.status === 'PAID'` 로 먼저 끊으면 안 된다 — 취소 웹훅이 바로 그 경우로 온다.
  //    그 한 줄 때문에 카드사 승인취소가 나도 우리 쪽에 흔적이 하나도 안 남았다.
  //    (광고를 내리려는 게 아니다 — 광고는 유지한다. 취소가 일어났다는 **사실을 아는 것**이 목적이다.)
  const pay = await getPayment(impUid);
  if (!pay) return "retry"; // 포트원 조회 자체가 실패 — 일시 장애일 수 있으니 재시도
  if (pay === "notfound" || pay.merchant_uid !== merchantUid) return "ignored"; // 없는 거래·위조 웹훅

  const decision = decidePayment(
    { status: pay.status, amount: pay.amount, cancelAmount: pay.cancel_amount },
    order.amount,
    order.status,
  );
  if (decision.do === "done") return "ok";
  if (decision.do === "nothing") return "ignored";
  if (decision.do === "record_cancel") return appendOrderNote(admin, order.id, decision.note);
  if (decision.do === "declined") {
    // 재시도해도 결과는 같다. 캐시를 돌려주고 주문을 닫는다(카드 거절은 사람이 볼 사건이 아니다).
    await markOrderUnpaid(admin, order, decision.note);
    return "ignored";
  }
  if (decision.do === "fail") {
    // 재시도해도 결과는 같다("ignored"). 다만 조용히 버리지 않고 사람이 볼 수 있게 남긴다.
    await recordAmountMismatch(admin, order, impUid, decision.note);
    return "ignored";
  }
  // 🔴 여기까지 왔으면 activate 뿐이다. decidePayment 에 분기가 늘었는데 위에서 처리를 빠뜨리면
  //    조용히 이 아래로 흘러 **광고가 켜진다.** 그 사고를 여기서 막는다.
  if (decision.do !== "activate") {
    console.error("iamportWebhook: 처리되지 않은 결정", decision);
    return "ignored";
  }
  // 🔴 공고가 사라진 주문(job_id null — 공고 삭제 시 set null)이라도 **돈은 들어왔다.**
  //    전에는 맨 위에서 "ignored" 로 끊어 광고도 기록도 없이 결제만 남았다.
  //    기록 실패는 반드시 "retry" 로 올린다 — 200 으로 끊으면 포트원이 다시 안 보내고 결제가 영영 미기록이다.
  if (!order.job_id) {
    // 🔴 거래번호를 함께 남긴다. 없으면 이 주문은 "그냥 결제 안 된 PREPARE" 와 구분되지 않아
    //    2시간 뒤 자동 회수가 "결제되지 않아 캐시를 돌려드렸습니다" 로 덮어 버린다(돈은 들어왔는데).
    await admin.from("ad_orders").update({ imp_uid: impUid }).eq("id", order.id).is("imp_uid", null);
    const r = await appendOrderNote(admin, order.id, `결제됐으나 대상 공고가 이미 삭제됨(${pay.amount.toLocaleString("ko-KR")}원)`);
    // 🔴 광고를 켤 대상이 없어졌으니 잡아둔 캐시는 돌려준다. 상태는 PREPARE 로 **남긴다** —
    //    관리자 대시보드의 stale_orders(PREPARE 1시간 초과)에 계속 잡혀야 카드로 받은 돈을
    //    사람이 처리한다. EXPIRED 로 닫으면 그 목록에서 사라진다.
    if (order.cash_used > 0 && order.buyer_id) {
      // 🔴 allowed 를 ["PREPARE"] 로 좁히면 안 된다. 손님이 결제창을 닫아 CANCELED 가 된 뒤
      //    공고가 지워지고 뒤늦게 결제가 확인되는 순서가 있는데, 그때 0행이 되어 캐시가 남는다.
      //    바로 위에서 imp_uid 를 채웠으므로 회수기·게이트의 `is("imp_uid", null)` 에서도 빠지고,
      //    관리자 stale_orders(PREPARE 만 센다)에도 안 잡혀 **흔적 없이 잠긴다.**
      //    다음 상태는 PREPARE 로 둔다 — 카드로 받은 돈을 사람이 처리하도록 목록에 남겨야 한다.
      await releaseOrderCash(admin, order.id, "PREPARE", ORDER_HOLDS_CASH, COULD_NOT_APPLY);
    }
    return r === "retry" ? "retry" : "ignored";
  }
  return (await activateAdOrder(admin, order.id, order.job_id, order.days, order.tier, impUid)) ? "ok" : "retry";
}
