import Link from "next/link";
import { redirect } from "next/navigation";
import HospitalShell from "@/components/HospitalShell";
import { requireProfile } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { LINK_CLASS } from "@/lib/constants";
import { verifyAdPayment, abandonAdOrder } from "@/app/mypage/ads/actions";

export const metadata = { title: "결제 확인 — 널스넷", robots: { index: false } };
export const dynamic = "force-dynamic";
// 포트원 조회가 붙는 화면이라 기본 함수 타임아웃으로는 부족할 수 있다(lib/data/nts.ts 와 같은 이유).
export const maxDuration = 30;

/**
 * 모바일 결제가 돌아오는 자리(m_redirect_url).
 *
 * 🔴 왜 필요한가: 모바일 이니시스는 팝업이 아니라 **페이지 이동**이라 IMP.request_pay 의 콜백이
 *    실행되지 않는다. 그래서 지금까지 휴대폰으로 결제한 병원은 verifyAdPayment 도, 영수증도,
 *    성공 문구도 보지 못한 채 원래 화면의 「결제하기」 버튼만 다시 만났다 — 결제가 안 된 줄 알고
 *    한 번 더 결제하면 광고 기간이 두 배로 붙고 환불은 없다(약관 제9조).
 *    광고가 켜지는 것도 오직 포트원 웹훅에만 달려 있었다.
 *
 * 🔴 판정은 여기서 새로 하지 않는다. 쿼리로 오는 imp_success 는 손님이 고칠 수 있는 값이라
 *    믿을 게 못 되고, verifyAdPayment 가 포트원에 다시 물어 금액까지 대조한다(PC 와 같은 경로).
 */
export default async function AdReturnPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ imp_uid?: string; merchant_uid?: string; imp_success?: string; success?: string }> }>) {
  const sp = await searchParams;
  const impUid = sp.imp_uid ?? "";
  const merchantUid = sp.merchant_uid ?? "";
  // 포트원은 버전에 따라 imp_success 또는 success 로 준다 — 둘 다 본다.
  const failed = sp.imp_success === "false" || sp.success === "false";

  // 🔴 로그인 복귀 경로에 **결제 결과를 그대로 실어 준다.** 인앱 브라우저에서 기본 브라우저로
  //    착지하거나 세션이 만료되면 여기 쿠키가 없는데, 그때 /mypage/jobs 로 보내면 imp_uid·
  //    merchant_uid 가 통째로 버려진다 — 손님은 결제 결과를 못 보고 "안 됐나 보다" 하며
  //    한 번 더 결제한다(광고 기간이 두 배로 붙고 환불은 없다). 이 페이지를 만든 이유가 그거다.
  const back = `/mypage/jobs/ad/return?imp_uid=${encodeURIComponent(impUid)}&merchant_uid=${encodeURIComponent(merchantUid)}${failed ? "&imp_success=false" : ""}`;
  const p = await requireProfile(back, "hospital");

  if (!merchantUid) redirect("/mypage/jobs");

  // 🔴 무슨 일이 있었는지에 따라 손님이 할 일이 다르다. 전부 "확인 중" 으로 뭉개면,
  //    돈이 안 나간 카드 거절에도 기다리게 하고 정말 돈이 나간 금액 불일치는 그 안에 묻힌다.
  let outcome: "declined" | "canceled" | "amount" | "unknown" | "pending" = failed ? "declined" : "pending";
  if (!failed && impUid) {
    const v = await verifyAdPayment(impUid, merchantUid);
    if (v.ok) redirect(`/mypage/jobs/ad/receipt/${v.orderId}`);
    if (v.error === "declined") outcome = "declined";
    else if (v.error === "canceled") outcome = "canceled";
    else if (v.error === "amount") outcome = "amount";
    // 🔴 둘 다 **오지 않을 광고를 기다리게 되는** 상태라 "확인 중" 으로 말하면 안 된다.
    //    order = 내 주문이 아니다(주소를 고쳤거나 계정이 다르다),
    //    activate = 결제는 확인됐는데 광고를 못 켰다(주문에 "수동 확인 필요" 메모가 붙는다).
    //    PC 화면(AdPurchase)도 같은 오류를 고객센터 문의로 안내한다 — 두 화면이 같은 말을 해야 한다.
    else if (v.error === "order" || v.error === "activate") outcome = "unknown";
    // notpaid(포트원이 아직 'ready')·verify 만 진짜로 "확인 중" 이다 — pending 그대로 둔다.
  } else {
    // 결제가 일어나지 않은 주문을 정리한다(PC 콜백의 rsp.success=false 와 같은 처리).
    const r = await abandonAdOrder(merchantUid);
    // 🔴 주문의 **실제 상태**를 보고 말한다. 무조건 "결제가 완료되지 않았습니다 / 요금도
    //    청구되지 않았습니다" 로 단정했더니 ① 이미 PAID 인 주문을 이 주소로 다시 열면 광고가
    //    나가는 중인 손님에게 그 거짓말을 보여줬고, ② 이 화면을 **새로고침**하면(첫 방문이
    //    이미 CANCELED 로 바꿔 놨다) 멀쩡한 주문을 "찾지 못했습니다" 라고 안내했다.
    if (r === "PAID") {
      const supabase = await createClient();
      const { data } = await supabase.from("ad_orders").select("id").eq("merchant_uid", merchantUid).maybeSingle();
      if (data) redirect(`/mypage/jobs/ad/receipt/${data.id}`);
    }
    // 🔴 PAID 인데 위 재조회가 비었을 때(일시 오류) declined 로 떨어뜨리면 안 된다 —
    //    **결제가 끝난 손님**에게 "요금도 청구되지 않았습니다" 라고 말해 중복 결제로 몬다.
    outcome = r === "none" ? "unknown" : r === "FAILED" ? "amount" : r === "PAID" ? "pending" : "declined";
  }

  const TITLE: Record<typeof outcome, string> = {
    declined: "결제가 완료되지 않았습니다",
    canceled: "결제가 취소되었습니다",
    // 🔴 "확인하고 있습니다" 로 쓰면 안 된다 — 본문은 "고객센터로 문의해 주세요" 라고 지시하는데
    //    제목만 보면 기다리면 되는 일로 읽혀 서로 다른 행동을 시킨다.
    amount: "결제 금액이 맞지 않습니다",
    unknown: "주문을 찾지 못했습니다",
    pending: "결제 확인 중입니다",
  };
  const BODY: Record<typeof outcome, string> = {
    // 🔴 캐시 반환을 단정하지 않는다. 포트원 조회가 실패하면 그 자리에서 못 돌려주고
    //    회수기가 나중에 돌려준다 — "돌려드렸습니다" 는 그때 거짓말이 된다.
    declined: "결제가 승인되지 않아 광고는 적용되지 않았습니다. 사용하신 광고 캐시는 확인되는 대로 자동으로 돌려드립니다.",
    // 🔴 "광고는 적용되지 않았습니다" 라고 단정하지 않는다 — 이미 시작된 광고는 취소 통보가 와도
    //    약관 제9조에 따라 유지되므로(오너 확정), 나가는 중인 광고를 안 나간다고 말하게 된다.
    canceled: "결제 취소가 확인되었습니다. 광고가 이미 시작됐다면 이용약관 제9조에 따라 유지되고, 시작 전이라면 적용되지 않습니다. 자세한 내용은 고객센터로 문의해 주세요.",
    amount: "결제된 금액이 주문 금액과 달라 자동으로 처리하지 못했습니다. 요금이 청구되었다면 고객센터로 문의해 주세요 — 담당자가 확인해 드립니다.",
    unknown: "이 주문을 이 계정에서 찾지 못했습니다. 광고는 적용되지 않았습니다. 요금이 청구되었다면 주문번호와 함께 고객센터로 문의해 주세요.",
    pending: "결제는 접수됐지만 확인이 아직 끝나지 않았습니다. 승인이 완료되면 광고가 자동으로 적용됩니다 — 잠시 후 결제 내역에서 확인해 주세요. 같은 광고를 다시 결제하지 마세요(중복 결제는 환불되지 않습니다).",
  };

  return (
    <HospitalShell displayName={p.displayName} active="/mypage/jobs">
      <h1 className="mt-3 text-2xl font-bold text-slate-900">{TITLE[outcome]}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{BODY[outcome]}</p>
      {/* 🔴 "주문번호와 함께 문의해 주세요" 라고 시키면서 그 번호를 안 보여주면, 손님은
          시킨 대로 하려 해도 줄 수 있는 정보가 없다. */}
      <p className="mt-2 text-xs text-slate-400">주문번호: {merchantUid}</p>
      <p className="mt-4 flex flex-wrap gap-3 text-sm">
        <Link href="/mypage/jobs/ad/orders" className={LINK_CLASS}>광고 결제 내역</Link>
        <Link href="/mypage/jobs" className={LINK_CLASS}>공고 관리</Link>
      </p>
    </HospitalShell>
  );
}
