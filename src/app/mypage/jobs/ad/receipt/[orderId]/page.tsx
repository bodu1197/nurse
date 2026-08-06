import { redirect } from "next/navigation";
import HospitalShell from "@/components/HospitalShell";
import { getMyProfile } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { won } from "@/lib/ads";
import { COMPANY } from "@/lib/constants";

export const metadata = { title: "결제 영수증 — 널스넷", robots: { index: false } };

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ko-KR") : "-");

export default async function ReceiptPage({ params }: Readonly<{ params: Promise<{ orderId: string }> }>) {
  const p = await getMyProfile();
  if (!p) redirect("/login");
  const { orderId } = await params;
  const supabase = await createClient();
  // RLS: 본인 주문만 조회 가능(buyer_id = auth.uid())
  type Row = { merchant_uid: string; imp_uid: string | null; tier: string; days: number; supply_amount: number; vat: number; amount: number; cash_used: number; status: string; created_at: string; paid_at: string | null; job: { title: string } | null };
  const { data: o } = await supabase
    .from("ad_orders")
    .select("merchant_uid, imp_uid, tier, days, supply_amount, vat, amount, cash_used, status, created_at, paid_at, job:jobs(title)")
    .eq("id", orderId)
    .maybeSingle()
    .returns<Row>();
  if (!o) redirect("/mypage/jobs");

  const paid = o.status === "PAID";
  // 🔴 amount 는 **카드로 받은 돈**이다(캐시 제외). 광고비 원가는 그 둘을 더해야 나온다.
  //    이 줄이 있어야 영수증이 "80,000원짜리를 캐시 70,000 깎고 10,000 받았다" 를 스스로 설명한다.
  const listAmount = o.amount + o.cash_used;

  return (
    <HospitalShell displayName={p.displayName} active="/mypage/jobs">
      {/* 🔴 영수증 **카드**만 좁힌다(페이지 래퍼로 좁히지 않는다). 라벨과 값을 양끝에 붙이는
          서식이라, 1,000px 로 늘리면 "주문번호" 와 그 번호가 화면 양끝으로 갈라져 눈으로
          이어 읽을 수 없다. 종이 영수증 폭에 맞춘다. */}
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6">
        <div className="text-center">
          <p className={`text-lg font-bold ${paid ? "text-teal-700" : "text-slate-500"}`}>{paid ? "✓ 결제 완료" : "결제 미완료"}</p>
          <p className="mt-1 text-sm text-slate-500">광고 영수증</p>
          {/* 0원·결제완료로만 보이면 실결제와 구분이 안 된다 */}
          {o.tier === "admin_test" && (
            <p className="mt-2 inline-block rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-white">관리자 테스트 — 실제 결제 아님</p>
          )}
        </div>
        <dl className="mt-6 space-y-2 text-base">
          <div className="flex justify-between"><dt className="text-slate-500">공고</dt><dd className="font-medium text-slate-800">{o.job?.title ?? "-"}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">광고 기간</dt><dd>{o.days}일</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">주문번호</dt><dd className="text-slate-600">{o.merchant_uid}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">결제일시</dt><dd>{fmt(o.paid_at)}</dd></div>
          <div className="my-2 border-t border-slate-100" />
          {/* 🔴 캐시로 깎인 금액을 영수증에 남긴다. 이게 없으면 병원은 "80,000원 광고인데 왜
              10,000원 영수증이냐" 를 묻게 되고, 우리는 공급가를 왜 그렇게 신고했는지 설명할
              근거가 장부 밖에만 있게 된다. 캐시는 널스넷이 무상 지급한 자사 적립금이다. */}
          {o.cash_used > 0 && (
            <>
              <div className="flex justify-between"><dt className="text-slate-500">광고비</dt><dd>{won(listAmount)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">광고 캐시 사용(널스넷 지급)</dt><dd className="text-teal-700">-{won(o.cash_used)}</dd></div>
            </>
          )}
          <div className="flex justify-between"><dt className="text-slate-500">공급가액</dt><dd>{won(o.supply_amount)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">부가세(10%)</dt><dd>{won(o.vat)}</dd></div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900"><dt>결제금액</dt><dd className="text-teal-700">{won(o.amount)}</dd></div>
        </dl>
        <p className="mt-6 text-center text-sm text-slate-500">{o.cash_used > 0 && "광고 캐시는 널스넷이 무상 지급한 적립금이며 공급가액에서 차감(에누리)됩니다 — 세금계산서는 실제 결제하신 금액으로 발행됩니다. "}광고는 결제 후 환불되지 않습니다(이용약관 제9조). 정식 세금계산서가 필요하시면 {COMPANY.email} 로 요청해 주세요.</p>
      </div>
    </HospitalShell>
  );
}
