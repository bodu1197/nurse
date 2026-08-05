"use client";

import Script from "next/script";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/Button";
import { AD_PRODUCTS, AD_WEEK_PRICE, splitPayment, won } from "@/lib/ads";
import { prepareAdOrder, verifyAdPayment, abandonAdOrder } from "@/app/mypage/actions";

type ImpResponse = { success: boolean; imp_uid: string; merchant_uid: string; error_msg?: string };
type Imp = {
  init: (code: string) => void;
  request_pay: (data: Record<string, unknown>, cb: (rsp: ImpResponse) => void) => void;
};
declare global {
  interface Window { IMP?: Imp }
}

// 🔴 마감일은 **서버가 포맷해서** 내려준다("2026.08.12"). 사이트 전역 날짜 표기는 lib/date 의
//    fmtDate/fmtDay 밖에서 만들지 않는데, 그 모듈은 react cache() 를 쓰는 서버 모듈이라
//    클라이언트 컴포넌트가 import 할 수 없다. 여기서 손으로 찍으면 같은 날짜가 화면마다
//    "2026-08-12" 와 "2026.08.12" 로 갈린다.
export default function AdPurchase({ jobId, initialWeeks = 1, adCash, deadlineText, daysToDeadline, impCode, pg }: Readonly<{ jobId: string; initialWeeks?: number; adCash: number; deadlineText: string | null; daysToDeadline: number | null; impCode: string; pg: string }>) {
  const router = useRouter();
  const [weeks, setWeeks] = useState(initialWeeks);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // non-null 단언 대신 기본값 — initialWeeks 가 상품에 없는 값으로 들어와도 화면이 죽지 않는다.
  const product = AD_PRODUCTS.find((p) => p.weeks === weeks) ?? AD_PRODUCTS[0];
  // 🔴 화면 계산도 서버와 **같은 함수**로 한다. 여기서 따로 빼면 표시액과 청구액이 어긋난다
  //    (실제 청구액은 prepareAdOrder 가 그때의 잔액으로 다시 정한다 — 여기 값은 안내다).
  const { cashUsed, payable } = splitPayment(product.amount, adCash);
  // 🔴 노출은 광고 기간과 마감일 중 **먼저 오는 쪽**에서 끝난다(jobs_listed.is_live · listingEnd).
  //    그런데 화면은 "28일 동안 노출됩니다" 라고만 말했다 — 마감이 사흘 뒤인 공고에 4주를 팔면
  //    25일치를 받고 노출하지 않는 셈이고 환불도 없다. 사기 전에 보이게 한다.
  //    (남은 일수는 서버가 KST 로 계산해 내려준다 — 렌더 중 Date.now() 는 결과가 흔들린다.)
  const cutShort = daysToDeadline !== null && daysToDeadline < product.days;

  async function pay() {
    setErr(null);
    if (!window.IMP) { setErr("결제 모듈을 불러오는 중입니다. 잠시 후 다시 시도해 주세요."); return; }
    setBusy(true);
    // 🔴 화면이 보여 준 금액을 같이 보낸다. 그사이 캐시 잔액이 바뀌었으면 서버가 거절한다 —
    //    "10,000원 결제하기" 를 눌렀는데 결제창에 80,000원이 뜨는 일은 없어야 한다.
    const prep = await prepareAdOrder(jobId, weeks, payable);
    if (!prep.ok) {
      setBusy(false);
      setErr(
        prep.error === "unavailable" ? "결제가 아직 활성화되지 않았습니다."
        : prep.error === "cash_only" ? "보유 캐시가 광고비 이상입니다. 고객센터로 문의해 주세요."
        // 🔴 "새로고침 하세요" 라고 안내하던 자리다. 그 안내를 따르면 캐시가 빠진 정가가 그대로
        //    결제됐다 — 문구가 손님을 8배 결제로 데려갔다. 이제 서버가 아예 막고 이유를 말한다.
        : prep.error === "cash_locked" ? "직전 결제 시도가 광고 캐시를 붙들고 있습니다. 잠시 후 다시 시도해 주세요(캐시가 자동으로 돌아옵니다)."
        : prep.error === "changed" ? "보유 광고 캐시가 바뀌었습니다. 새로고침 후 금액을 확인해 주세요."
        : prep.error === "deadline" ? "공고 마감일이 지났습니다. 마감일을 수정한 뒤 결제해 주세요."
        : "주문 생성에 실패했습니다. 다시 시도해 주세요.",
      );
      return;
    }
    window.IMP.init(impCode);
    window.IMP.request_pay(
      // 🔴 m_redirect_url 은 **모바일 필수**다. 모바일 이니시스는 팝업이 아니라 페이지 이동이라
      //    아래 콜백이 아예 실행되지 않는다. 지정하지 않으면 결제 후 이 화면으로 되돌아와
      //    검증도 영수증도 없이 "결제하기" 버튼만 다시 보이고, 손님은 안 된 줄 알고 또 결제한다.
      { pg, pay_method: "card", merchant_uid: prep.merchant_uid, name: prep.name, amount: prep.amount,
        m_redirect_url: `${window.location.origin}/mypage/jobs/ad/return` },
      async (rsp) => {
        if (!rsp.success) {
          setBusy(false);
          setErr("결제가 취소되었거나 실패했습니다.");
          // 🔴 결제가 **일어나지 않은** 주문을 정리하는 것이다(광고 취소가 아니다 — 그런 기능은 없다).
          //    안 알리면 이 주문이 PREPARE 로 영구히 남아, 나중에 관리자가 "그냥 창을 닫은 건" 과
          //    "돈은 나갔는데 광고가 안 나간 건" 을 구분할 수 없다.
          //    실패해도 손님 화면은 그대로 둔다 — 손님이 할 수 있는 일이 없다.
          //    .catch 는 필수다 — 없으면 unhandled rejection 이 되고, 정리에 실패한 사실조차 안 남는다.
          abandonAdOrder(prep.merchant_uid).catch((e) => console.error("abandonAdOrder failed:", e));
          return;
        }
        const v = await verifyAdPayment(rsp.imp_uid, rsp.merchant_uid);
        setBusy(false);
        if (v.ok) router.push(`/mypage/jobs/ad/receipt/${v.orderId}`);
        // 🔴 원인마다 손님이 할 일이 다르다. 전부 "검증 실패" 로 묶으면, 돈이 안 나간 카드 거절에도
        //    고객센터로 문의하게 만들고, 정말 돈이 나간 금액 불일치는 그 안에 묻힌다.
        // 🔴 "곧 자동으로 돌아옵니다" 라고 쓰면 안 된다 — 반환은 **다시 결제를 시도할 때** 도는
        //    회수기가 한다. '곧' 은 그 조건을 감추고, 바로 옆 cash_locked 문구와도 어긋나 보인다.
        else if (v.error === "declined") setErr("결제가 승인되지 않았습니다. 사용하신 광고 캐시는 확인되는 대로 자동으로 돌려드립니다.");
        // 🔴 notpaid 를 declined 와 묶으면 안 된다. 이건 포트원이 아직 'ready' 라고 답한 것이라
        //    캐시는 한 푼도 안 돌아왔고, "다시 시도" 하라고 하면 곧바로 잠긴 캐시에 막힌다.
        else if (v.error === "notpaid") setErr("결제 확인이 아직 끝나지 않았습니다. 잠시 후 결제 내역에서 확인해 주세요 — 같은 광고를 다시 결제하지 마세요.");
        else if (v.error === "canceled") setErr("결제가 취소되었습니다.");
        else setErr("결제 검증에 실패했습니다. 결제가 되었다면 고객센터로 문의해 주세요.");
      },
    );
  }

  return (
    <div className="mt-6">
      <Script src="https://cdn.iamport.kr/v1/iamport.js" strategy="afterInteractive" />

      <div className="mt-4 grid grid-cols-2 gap-x-2 gap-y-5 sm:grid-cols-4">
        {AD_PRODUCTS.map((p) => (
          <label key={p.weeks}>
            <input type="radio" name="weeks" value={p.weeks} checked={weeks === p.weeks} onChange={() => setWeeks(p.weeks)} className="peer sr-only" />
            <span className="relative flex h-28 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[12px] border border-slate-300 text-sm text-slate-600 peer-checked:border-teal-500 peer-checked:bg-teal-50 peer-checked:text-teal-700">
              {/* 🔴 할인 폭을 칸 안에 박아 둔다 — 고를 때 보이지 않으면 길게 살 이유가 안 보인다. */}
              {p.saved > 0 && (
                <span className="absolute -top-2 rounded-full bg-teal-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{p.offPct}% 할인</span>
              )}
              <b>{p.weeks}주 노출</b>
              <span className="text-xs">{won(p.amount)}</span>
              <span className="text-[11px] text-slate-400">주당 {won(p.perWeek)}</span>
              {adCash > 0 && <span className="text-[11px] font-semibold text-teal-600">캐시 후 {won(splitPayment(p.amount, adCash).payable)}</span>}
            </span>
          </label>
        ))}
      </div>

      <dl className="mt-5 space-y-1 rounded-[12px] border border-slate-200 bg-slate-50 p-4 text-sm">
        <div className="flex justify-between"><dt className="text-slate-500">노출 기간</dt><dd className="font-medium text-slate-800">{product.days}일</dd></div>
        <div className="flex justify-between">
          <dt className="text-slate-500">광고비</dt>
          <dd>
            {product.saved > 0 && <span className="mr-1.5 text-slate-400 line-through">{won(AD_WEEK_PRICE * product.weeks)}</span>}
            {won(product.amount)}
          </dd>
        </div>
        {product.saved > 0 && (
          <div className="flex justify-between"><dt className="text-slate-500">기간 할인({product.offPct}%)</dt><dd className="text-teal-700">-{won(product.saved)}</dd></div>
        )}
        {cashUsed > 0 && (
          <div className="flex justify-between"><dt className="text-slate-500">광고 캐시 사용</dt><dd className="text-teal-700">-{won(cashUsed)}</dd></div>
        )}
        <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-900"><dt>결제금액</dt><dd className="text-teal-700">{won(payable)}</dd></div>
      </dl>

      {/* 🔴 환불 규정은 **결제 버튼 위에** 있어야 한다(오너 확정 2026-07-30: 환불하지 않는다).
          어디에도 안 적어두면 "10일 만에 사람을 구했으니 남은 기간 돌려달라"는 문의가 결국 온다.
          사는 사람이 누르기 전에 알면 그 실랑이 자체가 생기지 않는다 — 이 문구가 그 역할이다. */}
      <p className="mt-5 rounded-[12px] border border-slate-300 bg-white px-4 py-3 text-xs leading-relaxed text-slate-600">
        <b className="text-slate-800">환불 안내</b> — 광고는 결제 즉시 노출이 시작되는 상품이라{" "}
        <b className="text-slate-800">결제 후 환불되지 않습니다.</b> 채용이 일찍 끝나 광고가 필요 없어진 경우에도
        남은 기간은 환불·이월되지 않습니다. 기간을 짧게 시작해 필요할 때 연장하시는 편이 좋습니다
        (광고 올리기에서 언제든 기간을 더할 수 있습니다).
      </p>

      {cutShort && (
        <p role="alert" className="mt-3 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
          이 공고는 <b>{deadlineText} 마감</b>이라 광고를 사도 <b>{daysToDeadline >= 1 ? `${daysToDeadline}일 뒤` : "24시간 안에"}</b> 노출이 멈춥니다
          (남은 기간은 환불되지 않습니다). 기간을 다 쓰시려면 <b>공고 수정</b>에서 마감일을 먼저 늘려 주세요.
        </p>
      )}

      {err && <p role="alert" className="mt-3 rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>}

      <Button type="button" onClick={pay} disabled={busy} size="lg" className="mt-4 w-full">
        {busy ? "결제 진행 중…" : `${won(payable)} 결제하기`}
      </Button>
      <p className="mt-2 text-center text-xs text-slate-400">{product.days}일 동안 목록 상단에 노출됩니다. 광고 캐시가 있으면 먼저 쓰이고 나머지만 카드로 결제합니다(이니시스).</p>
    </div>
  );
}
