"use client";

import Script from "next/script";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/Button";
import { AD_PRODUCTS, won } from "@/lib/ads";
import { prepareAdOrder, verifyAdPayment } from "@/app/mypage/actions";

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
  const product = AD_PRODUCTS.find((p) => p.weeks === weeks)!;

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
        if (!rsp.success) { setBusy(false); setErr("결제가 취소되었거나 실패했습니다."); return; }
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

      {err && <p role="alert" className="mt-3 rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>}

      <Button type="button" onClick={pay} disabled={busy} size="lg" className="mt-4 w-full">
        {busy ? "결제 진행 중…" : `${won(product.amount)} 결제하기`}
      </Button>
      <p className="mt-2 text-center text-xs text-slate-400">{product.weeks}주 노출 중 {product.billedWeeks}주만 청구(1주 무료). 광고 기간 동안 상단 노출. 카드 결제(이니시스).</p>
    </div>
  );
}
