"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { adProduct, isOrderStatus, isFreeWeekResult, type OrderStatus, type FreeWeekResult } from "@/lib/ads";
import { decidePayment } from "@/lib/paymentFlow";
import { getPayment, findPaidPayment, iamportReady } from "@/lib/iamport";
import { todayKst, nowMs } from "@/lib/date";
import { logAdmin } from "@/lib/data/admin";
import { ownedJobHospital } from "@/lib/data/jobs";
import {
  type AdPrepare, type AdVerify,
  noPaymentHeld, releaseOrderCash, reclaimStaleAdCash, reclaimStuckFailedCash,
  markOrderUnpaid, recordAmountMismatch, lockedAdCash, activateAdOrder, appendOrderNote,
} from "@/lib/adOrders";

/**
 * 손님 브라우저가 부르는 **광고 결제 액션만** 여기 둔다.
 *
 * 🔴 `"use server"` 파일의 export 는 전부 호출 가능한 엔드포인트가 된다. 그래서 인증이 없는
 *    웹훅 처리와 내부 헬퍼는 lib/adOrders.ts(서버 전용 모듈)에 두고, 여기에는
 *    "로그인한 병원이 실제로 누르는 것" 넷만 남긴다.
 */

// 결제 전 주문 생성(서버가 금액 산정 — 클라 금액 신뢰 안 함). 클라가 받은 merchant_uid/amount로 IMP.request_pay.
// expectedPayable: 화면이 손님에게 보여 준 결제금액. 서버가 계산한 값과 다르면 결제창을 열지 않는다
//                  (캐시 잔액이 그사이 바뀐 경우 — 보여준 금액보다 많이 청구하는 일은 없어야 한다).

/**
 * 🎁 무료 1주 — **병원당 평생 1회**(오너 확정 2026-08-06).
 *
 * 노출은 되지만 유료 아래에 깔리고(jobs_listed.ad_paid 정렬), 간호사 연락처 열람과
 * AI 자동매치 인재추천은 열리지 않는다 — is_talent_advertiser() 가 실결제(amount > 0)를
 * 요구하므로 **여기서 따로 막을 것이 없다.** 주문(ad_orders)을 만들지 않는 것이 곧 제약이다.
 *
 * 🔴 판정·기록·적용을 전부 DB 함수(claim_free_week) 한 번에 맡긴다. 앱에서 "받은 적 있나"를
 *    먼저 세고 없으면 넣는 식으로 하면 동시 요청 둘이 같은 0 을 보고 둘 다 받는다.
 *    유니크 인덱스(ad_free_used)가 두 번째를 깨뜨려야 한다.
 * 🔴 admin 클라이언트를 쓰지 않는다 — 함수가 auth.uid() 로 본인을 판정한다.
 *    admin 으로 부르면 uid 가 없어 항상 not_owner 가 된다.
 */
export type ClaimFreeWeekError = Exclude<FreeWeekResult, "ok"> | "auth" | "server";

export async function claimFreeWeek(jobId: string): Promise<{ ok: true } | { ok: false; error: ClaimFreeWeekError }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };

  const { data, error } = await supabase.rpc("claim_free_week", { p_job: jobId });
  if (error) {
    console.error("claim_free_week failed:", user.id, jobId, error.message);
    return { ok: false, error: "server" };
  }
  // 🔴 모르는 코드는 'server' 로 떨어뜨린다. `as` 로 단언하면 DB 가 새 코드를 돌려줬을 때
  //    컴파일은 통과하고 **화면만 빈 안내**가 된다(ads.ts 의 orderStatusLabel 과 같은 이유).
  if (!isFreeWeekResult(data)) {
    console.error("claim_free_week 가 모르는 값을 돌려줬다:", data);
    return { ok: false, error: "server" };
  }
  if (data !== "ok") return { ok: false, error: data };

  // 감사 기록은 따로 남기지 않는다 — ad_free_used 가 누가·언제·어느 공고에 받았는지 이미 담는다
  // (logAdmin 은 관리자 콘솔 전용이라 여기 쓰면 감사로그가 손님 행동으로 오염된다).
  // 노출이 방금 시작됐다 — 목록·내 공고·상세가 옛 화면을 들고 있으면 "올렸는데 안 보인다"가 된다.
  for (const p of ["/jobs", "/mypage/jobs", `/jobs/${jobId}`, "/"]) revalidatePath(p);
  return { ok: true };
}

export async function prepareAdOrder(jobId: string, weeks: number, expectedPayable?: number): Promise<AdPrepare> {
  if (!iamportReady()) return { ok: false, error: "unavailable" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };
  const product = adProduct(weeks);
  if (!product) return { ok: false, error: "product" };
  const admin = createAdminClient();
  const hosp = await ownedJobHospital(admin, jobId, user.id);
  if (!hosp) return { ok: false, error: "not_owner" };

  // 🔴 마감일이 지난 공고에는 광고를 팔지 않는다. featured_until 을 아무리 길게 세워도
  //    노출 판정(jobs_listed.is_live · isOpenToSeekers)이 deadline 으로 먼저 걸러서
  //    **결제만 하고 한 번도 안 보이는** 광고가 된다(환불은 없다). 공고 등록(jobDeadline)은
  //    이미 지난 날짜를 막고 있었는데 구매 경로에만 그 검사가 없었다.
  if (hosp.deadline && hosp.deadline < todayKst(nowMs())) return { ok: false, error: "deadline" };

  // 🔴 회수는 **붙들린 캐시가 있을 때만** 돈다. 회수기는 주문마다 포트원 왕복이 붙는데,
  //    그 지연이 「결제하기」를 누른 손님의 대기 시간이다. 두 질의의 술어는 created_at 빼고
  //    같으므로, 잠긴 캐시가 0 이면 회수할 것도 없다 — 흔한 경우에서 외부 호출이 통째로 빠진다.
  await reclaimStuckFailedCash(admin, user.id);
  const lockedBefore = await lockedAdCash(admin, user.id);
  if (lockedBefore) await reclaimStaleAdCash(admin, user.id);

  // 🔴 직전 결제 시도가 캐시를 붙들고 있으면 **결제창을 열지 않는다.**
  //    전에는 그대로 진행돼, 화면이 「10,000원 결제하기」를 보여주고도 캐시가 0 이라
  //    새로고침 뒤엔 「80,000원 결제하기」가 됐다 — 안내 문구가 손님을 8배 결제로 데려갔다.
  //    회수는 위 reclaim 과 abandonAdOrder(포트원에 결제 유무를 직접 확인)가 한다.
  //    회수가 돌지 않았으면(잠긴 캐시 0) 같은 질의를 또 던지지 않는다.
  if (lockedBefore && (await lockedAdCash(admin, user.id))) return { ok: false, error: "cash_locked" };

  // 💰 캐시를 **여기서 실제로 뺀다.** 잔액이 모자라면 남은 만큼만 잡히고 그 값이 돌아온다.
  //    가입 캐시(70,000) < 1주 광고비(80,000) 라 첫 광고도 반드시 카드 결제가 붙는다.
  const { data: claimed, error: claimErr } = await admin.rpc("claim_ad_cash", { p_profile: user.id, p_want: product.amount });
  if (claimErr) return { ok: false, error: "db" };
  const cashUsed = claimed ?? 0;
  const payable = product.amount - cashUsed;
  // 여기서부터 실패하면 잡은 캐시를 반드시 돌려준다 — 안 그러면 손님 돈이 조용히 사라진다.
  // ⚠️ ponytail: 이 줄과 아래 insert 사이에서 프로세스가 죽으면(배포 중 종료 등) 잡은 캐시가
  //    주문 없이 사라진다 — reclaim 은 ad_orders 만 훑기 때문이다. 원장(ledger) 표를 두면
  //    막히지만 그 무게를 지금 질 이유가 없다(창이 수 ms, 최대 손실 1계정 지급액).
  //    대신 복구에 필요한 값을 전부 로그에 남긴다 — 고객센터가 이 줄로 되돌릴 수 있다.
  const giveBack = async () => {
    if (cashUsed <= 0) return;
    const { error } = await admin.rpc("release_ad_cash", { p_profile: user.id, p_amount: cashUsed });
    if (error) console.error("광고 캐시 반환 실패 — 수동 확인 필요:", user.id, cashUsed, error.message);
  };
  console.info("[ad] 광고 캐시 사용:", { profile: user.id, job: jobId, weeks, cashUsed, payable });

  // 🔴 0원은 PG 가 받지 않는다. 정상 경로에서는 생길 수 없지만, 관리자가 캐시를 얹어 주는 순간
  //    결제창이 조용히 실패한다 — 여기서 막는다.
  if (payable <= 0) { await giveBack(); return { ok: false, error: "cash_only" }; }
  // 🔴 화면이 "10,000원 결제하기" 라고 보여 줬는데 결제창에 80,000원이 뜨면 안 된다.
  if (expectedPayable !== undefined && expectedPayable !== payable) { await giveBack(); return { ok: false, error: "changed" }; }

  const merchant_uid = `ad_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const supply = Math.round(payable / 1.1);
  const { error } = await admin.from("ad_orders").insert({
    merchant_uid, job_id: jobId, hospital_id: hosp.id, buyer_id: user.id,
    // 🔴 days 는 산 기간 전체다. 무료 1주가 없어졌으니 결제한 만큼만 노출된다.
    // 🔴 amount 는 **카드로 청구하는 금액**이다(캐시 제외). 매출 집계가 캐시에 부풀지 않는다.
    tier: "standard", days: product.days, cash_used: cashUsed,
    supply_amount: supply, vat: payable - supply,
    amount: payable, status: "PREPARE",
  });
  if (error) { await giveBack(); return { ok: false, error: "db" }; }
  return { ok: true, merchant_uid, amount: payable, name: `널스넷 광고 ${weeks}주(${product.days}일)` };
}

// 결제 후 서버 검증(금액 위변조 차단) → 활성화.

export async function verifyAdPayment(impUid: string, merchantUid: string): Promise<AdVerify> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };
  const admin = createAdminClient();
  const { data: order } = await admin.from("ad_orders").select("id, buyer_id, job_id, days, tier, amount, status, cash_used, created_at").eq("merchant_uid", merchantUid).maybeSingle();
  if (!order || order.buyer_id !== user.id || !order.job_id) return { ok: false, error: "order" };
  // 🔴 여기서 `status === 'PAID'` 로 단축하지 않는다 — 그 단축이 웹훅 쪽에서 취소 통보를 삼키던 원인이고,
  //    두 경로가 서로 다른 단축 규칙을 갖는 순간 다음 사고가 준비된다. 판정은 decidePayment 한 곳에서만.
  const pay = await getPayment(impUid);
  if (!pay || pay === "notfound" || pay.merchant_uid !== merchantUid) {
    // 🔴 이미 활성화된 주문이면 포트원 조회 실패로 "검증 실패" 를 띄우지 않는다. PAID 단축을 없앤 대가로
    //    포트원이 잠깐 죽었을 때 **이미 산 사람에게** 실패 화면을 보이게 됐다 — 여기서 그것만 되돌린다.
    if (order.status === "PAID") return { ok: true, orderId: order.id };
    return { ok: false, error: "verify" };
  }
  // 판단은 순수 함수가 한다(lib/paymentFlow.ts). 여기서는 그 결정을 DB 에 반영만 한다.
  const decision = decidePayment(
    { status: pay.status, amount: pay.amount, cancelAmount: pay.cancel_amount },
    order.amount,
    order.status,
  );
  if (decision.do === "done") return { ok: true, orderId: order.id };
  if (decision.do === "record_cancel") {
    // 여기서 실패해도 손님에게 시킬 일이 없다 — 웹훅이 같은 취소를 다시 들고 와 기록한다.
    if ((await appendOrderNote(admin, order.id, decision.note)) === "retry") {
      console.error("appendOrderNote 실패 — 웹훅 재시도에 기댄다:", order.id);
    }
    return { ok: false, error: "canceled" };
  }
  if (decision.do === "nothing") return { ok: false, error: "notpaid" };
  if (decision.do === "declined") {
    await markOrderUnpaid(admin, order, decision.note);
    return { ok: false, error: "declined" };
  }
  if (decision.do === "fail") {
    // 🔴 전에는 금액 불일치에서 그냥 반환했다 — 주문은 PREPARE 로 남고 **돈은 나갔는데 흔적이 없었다.**
    //    imp_uid 를 반드시 같이 적는다. 거래번호가 없으면 관리자가 포트원에서 그 결제를 찾지 못해
    //    대조도 이의제기도 못 한다(고객센터가 받는 문의가 정확히 이 상황이다).
    // 상태 전이·기록·캐시 반환을 한 곳에서 한다(recordAmountMismatch 주석에 이유가 있다).
    await recordAmountMismatch(admin, order, impUid, decision.note);
    return { ok: false, error: "amount" };
  }
  // 🔴 여기까지 왔으면 activate 뿐이다. 나중에 decidePayment 에 분기가 하나 늘었는데 위에서 처리를
  //    빠뜨리면, 조용히 이 아래로 흘러 **광고가 켜진다.** 그 사고를 여기서 막는다.
  if (decision.do !== "activate") {
    console.error("verifyAdPayment: 처리되지 않은 결정", decision);
    return { ok: false, error: "verify" };
  }
  // 활성화 실패 시 주문은 PREPARE로 남는다 → 웹훅이 재시도해 복구.
  if (!(await activateAdOrder(admin, order.id, order.job_id, order.days, order.tier, impUid))) return { ok: false, error: "activate" };
  return { ok: true, orderId: order.id };
}

// 관리자 테스트 전용 — 결제 없이 광고 활성. 주문을 PAID로 남겨 영수증까지 실제 흐름 그대로 확인.
// 금액은 0원으로 기록한다 — 실금액으로 남기면 나중에 매출 집계에 가짜 매출이 섞인다.

export async function activateAdFree(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "admin") redirect("/mypage"); // 전환 여부와 무관하게 실제 admin만

  const jobId = String(formData.get("job_id") ?? "");
  const product = adProduct(Number(formData.get("weeks")));
  if (!jobId || !product) redirect("/mypage/jobs");
  const hosp = await ownedJobHospital(admin, jobId, user.id);
  if (!hosp) redirect("/mypage/jobs?error=1");
  // 화면은 이미 마감일 지난 공고에서 이 폼을 숨기지만, 폼 액션은 화면을 신뢰하지 않는다.
  // 켜 봐야 노출 판정(is_live)이 마감일로 걸러 아무 데도 안 나온다 — 테스트가 성립하지 않는다.
  if (hosp.deadline && hosp.deadline < todayKst(nowMs())) redirect("/mypage/jobs?error=deadline");

  const merchant_uid = `admintest_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const { data: order } = await admin.from("ad_orders").insert({
    merchant_uid, job_id: jobId, hospital_id: hosp.id, buyer_id: user.id,
    tier: "admin_test", days: product.days, supply_amount: 0, vat: 0, amount: 0, status: "PREPARE",
  }).select("id").single();
  // 실패는 공고 관리 화면으로 — 광고 페이지에는 에러 배너가 없어 실패가 조용히 묻힌다.
  if (!order) redirect("/mypage/jobs?error=1");
  // 관리자가 결제 없이 광고를 켜는 일이다. 남기지 않으면 매출 0원짜리 광고가 누구 손에서 나왔는지 알 수 없다.
  // 실패하면 throw 되어 활성화까지 가지 않는다 — 기록 없는 조치를 만들지 않는다(lib/data/admin.ts).
  await logAdmin({
    action: "ad.free_activate",
    targetTable: "ad_orders",
    targetId: order.id,
    reason: `관리자 테스트 광고 ${product.weeks}주 활성 (공고 ${jobId})`,
  });
  if (!(await activateAdOrder(admin, order.id, jobId, product.days, "admin_test", null))) redirect("/mypage/jobs?error=1");
  redirect(`/mypage/jobs/ad/receipt/${order.id}`);
}

/**
 * 결제창을 손님이 그냥 닫았을 때 — **결제가 일어나지 않은** 주문을 정리한다.
 *
 * 🔴 이것은 "광고 취소" 가 아니다. 돈이 나가지 않았고 광고도 켜진 적이 없다.
 *    산 광고를 무르는 기능은 없고 만들지 않는다(오너 확정 2026-08-04).
 *
 * 🔴 전에는 클라이언트가 문구만 띄우고 **서버에 아무것도 안 알렸다.** 그래서 결제창을 열었다
 *    닫은 사람마다 PREPARE 주문이 하나씩 영구히 쌓였고, 나중에 그 목록을 보는 사람은
 *    "돈이 나갔는데 광고가 안 나간 건" 과 "그냥 창을 닫은 건" 을 구분할 수 없었다.
 *
 * 🔴 status='PREPARE' 조건이 핵심이다. 웹훅이 먼저 도착해 이미 PAID 가 된 주문을
 *    뒤늦은 통보가 덮어쓰면, 돈은 받았는데 결제 안 한 것으로 기록되는 꼴이 된다.
 */
export async function abandonAdOrder(merchantUid: string): Promise<OrderStatus | "canceled" | "none"> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "none";
  const admin = createAdminClient();
  const { data: canceled } = await admin
    .from("ad_orders")
    .update({ status: "CANCELED" })
    .eq("merchant_uid", merchantUid)
    .eq("buyer_id", user.id)   // 남의 주문을 건드리지 못하게
    .eq("status", "PREPARE")
    // 🔴 거래번호가 붙은 PREPARE 는 **카드로 돈은 받은** 주문이다(웹훅의 공고 삭제 분기,
    //    활성화 롤백이 그렇게 남긴다). CANCELED 로 넘기면 관리자 stale_orders(PREPARE 만 센다)
    //    에서 빠져 사라진다 — 회수기·게이트와 같은 술어로 여기서도 건드리지 않는다.
    .is("imp_uid", null)
    .select("id, cash_used, created_at");
  const order = canceled?.[0];
  // 🔴 아무것도 안 바꿨으면 **현재 상태를 그대로** 돌려준다. 모바일 복귀 화면이 이 값으로 문구를
  //    고르는데, "PAID 냐 아니냐" 로만 뭉갰더니 ① 이미 PAID 인 주문을 그 주소로 다시 열면
  //    광고가 나가는 중인 손님에게 "요금도 청구되지 않았습니다" 를 보여줬고, ② 화면을 **새로고침**
  //    하면(첫 방문이 이미 CANCELED 로 바꿔 놨으므로) 멀쩡한 자기 주문을 "주문을 찾지 못했습니다 —
  //    고객센터로 문의해 주세요" 라고 안내했다. 새로고침은 결제 결과 화면에서 가장 흔한 조작이다.
  if (!order) {
    const { data: cur } = await admin.from("ad_orders")
      .select("status").eq("merchant_uid", merchantUid).eq("buyer_id", user.id).maybeSingle();
    // 🔴 단언(as)이 아니라 **런타임 검사**다. 모르는 상태를 그대로 통과시키면 복귀 화면이
    //    그것을 전부 "결제가 완료되지 않았습니다 / 요금도 청구되지 않았습니다" 로 떨어뜨려,
    //    돈이 나갔을 수도 있는 주문에 거짓말을 한다.
    return cur && isOrderStatus(cur.status) ? cur.status : "none";
  }

  // 🔴 문구는 고정이고, **덮어쓰지 않고 덧붙인다.**
  //    ① 클라이언트가 준 문자열(rsp.error_msg)을 넣으면 운영자가 읽는 칸에 시스템 문구를 위장 주입할 수 있다.
  //    ② 전에는 note 를 통째로 덮어써서, 웹훅이 먼저 남긴 취소·사고 기록이 이 한 줄에 지워졌다.
  //    ③ 단정하지 않는다 — 승인은 났는데 콜백만 실패했을 수 있다(그 경우 웹훅이 PAID 로 올린다).
  await appendOrderNote(admin, order.id, "결제창이 닫혀 결제 완료를 확인하지 못함");
  if (order.cash_used <= 0) return "canceled";

  // 💰 잡아둔 캐시를 **지금** 돌려준다 — 단, 포트원에 그 주문번호로 결제가 정말 없을 때만.
  //
  // 🔴 전에는 여기서 안 돌려주고 2시간 뒤 회수에 맡겼다. 그 2시간 동안 잔액이 0 이라
  //    화면은 「10,000원 결제하기」를 「80,000원 결제하기」로 바꿔 보여줬고, 다시 결제한 손님은
  //    **7만원을 더 냈다**(환불은 없다). 게다가 회수는 그 손님이 *또* 결제를 준비할 때만 도니,
  //    광고를 한 번만 사는 병원은 가입 캐시를 영영 못 썼다.
  // 🔴 그렇다고 무조건 돌려주면 "승인은 났는데 콜백만 실패" 한 건이 캐시를 공짜로 쓴 광고가 된다.
  //    그래서 포트원에 직접 묻고, **돈이 남아 있지 않은 것이 확정될 때만** 돌려준다
  //    (noPaymentHeld 참고). 조회 실패면 회수에 맡긴다.
  // 🔴 유예를 여기 두면 안 된다. 이 주문은 **몇 초 전에** 만들어진 것이라 나이 조건이 항상 참이고,
  //    그러면 즉시 반환이 통째로 죽어 결제창을 한 번 닫은 손님이 10분간 광고를 못 산다
  //    (그 10분이 바로 이 함수가 없애려던 잠금이다). 판정은 포트원 대답으로 한다 —
  //    "승인된 결제 없음" 이 확정이면 그 자리에서 돌려주고, 대답을 못 얻으면 회수기에 맡긴다.
  if (!noPaymentHeld(await findPaidPayment(merchantUid))) return "canceled";
  await releaseOrderCash(admin, order.id, "EXPIRED");
  return "canceled";
}
