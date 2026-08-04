"use client";

import Script from "next/script";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/Button";
import { AD_PRODUCTS, won } from "@/lib/ads";
import { prepareAdOrder, verifyAdPayment, abandonAdOrder } from "@/app/mypage/actions";

type ImpResponse = { success: boolean; imp_uid: string; merchant_uid: string; error_msg?: string };
type Imp = {
  init: (code: string) => void;
  request_pay: (data: Record<string, unknown>, cb: (rsp: ImpResponse) => void) => void;
};
declare global {
  interface Window { IMP?: Imp }
}

export default function AdPurchase({ jobId, initialWeeks = 2, impCode, pg }: Readonly<{ jobId: string; initialWeeks?: number; impCode: string; pg: string }>) {
  const router = useRouter();
  const [weeks, setWeeks] = useState(initialWeeks);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // non-null 단언 대신 기본값 — initialWeeks 가 상품에 없는 값으로 들어와도 화면이 죽지 않는다.
  const product = AD_PRODUCTS.find((p) => p.weeks === weeks) ?? AD_PRODUCTS[0];

  async function pay() {
    setErr(null);
    if (!window.IMP) { setErr("결제 모듈을 불러오는 중입니다. 잠시 후 다시 시도해 주세요."); return; }
    setBusy(true);
    const prep = await prepareAdOrder(jobId, weeks);
    if (!prep.ok) {
      setBusy(false);
      setErr(prep.error === "unavailable" ? "결제가 아직 활성화되지 않았습니다." : "주문 생성에 실패했습니다. 다시 시도해 주세요.");
      return;
    }
    window.IMP.init(impCode);
    window.IMP.request_pay(
      { pg, pay_method: "card", merchant_uid: prep.merchant_uid, name: prep.name, amount: prep.amount },
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
        else setErr("결제 검증에 실패했습니다. 결제가 되었다면 고객센터로 문의해 주세요.");
      },
    );
  }

  return (
    <div className="mt-6">
      <Script src="https://cdn.iamport.kr/v1/iamport.js" strategy="afterInteractive" />

      <div className="grid grid-cols-3 gap-2">
        {AD_PRODUCTS.map((p) => (
          <label key={p.weeks}>
            <input type="radio" name="weeks" value={p.weeks} checked={weeks === p.weeks} onChange={() => setWeeks(p.weeks)} className="peer sr-only" />
            <span className="flex h-24 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[12px] border border-slate-300 text-sm text-slate-600 peer-checked:border-teal-500 peer-checked:bg-teal-50 peer-checked:text-teal-700">
              <b>{p.weeks}주 노출</b>
              <span className="text-xs">{won(p.amount)}</span>
              <span className="text-[11px] font-semibold text-teal-600">1주 무료</span>
            </span>
          </label>
        ))}
      </div>

      <dl className="mt-5 space-y-1 rounded-[12px] border border-slate-200 bg-slate-50 p-4 text-sm">
        <div className="flex justify-between"><dt className="text-slate-500">노출 기간</dt><dd className="font-medium text-slate-800">{product.days}일 <span className="text-teal-600">(1주 무료 포함)</span></dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">공급가액</dt><dd>{won(product.supply)}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">부가세(10%)</dt><dd>{won(product.vat)}</dd></div>
        <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-900"><dt>결제금액</dt><dd className="text-teal-700">{won(product.amount)}</dd></div>
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

      {err && <p role="alert" className="mt-3 rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>}

      <Button type="button" onClick={pay} disabled={busy} size="lg" className="mt-4 w-full">
        {busy ? "결제 진행 중…" : `${won(product.amount)} 결제하기`}
      </Button>
      <p className="mt-2 text-center text-xs text-slate-400">{product.weeks}주 노출 중 {product.billedWeeks}주만 청구(1주 무료). 광고 기간 동안 상단 노출. 카드 결제(이니시스).</p>
    </div>
  );
}
