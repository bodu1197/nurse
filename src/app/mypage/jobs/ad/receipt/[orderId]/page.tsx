import { redirect } from "next/navigation";
import HospitalShell from "@/components/HospitalShell";
import { getMyProfile } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { won } from "@/lib/ads";

export const metadata = { title: "결제 영수증 — 널스넷", robots: { index: false } };

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ko-KR") : "-");

export default async function ReceiptPage({ params }: Readonly<{ params: Promise<{ orderId: string }> }>) {
  const p = await getMyProfile();
  if (!p) redirect("/login");
  const { orderId } = await params;
  const supabase = await createClient();
  // RLS: 본인 주문만 조회 가능(buyer_id = auth.uid())
  type Row = { merchant_uid: string; imp_uid: string | null; days: number; supply_amount: number; vat: number; amount: number; status: string; created_at: string; paid_at: string | null; job: { title: string } | null };
  const { data: o } = await supabase
    .from("ad_orders")
    .select("merchant_uid, imp_uid, days, supply_amount, vat, amount, status, created_at, paid_at, job:jobs(title)")
    .eq("id", orderId)
    .maybeSingle()
    .returns<Row>();
  if (!o) redirect("/mypage/jobs");

  const paid = o.status === "PAID";

  return (
    <HospitalShell displayName={p.displayName} active="/mypage/jobs">
      <div className="max-w-lg">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-center">
            <p className={`text-lg font-bold ${paid ? "text-teal-700" : "text-slate-500"}`}>{paid ? "✓ 결제 완료" : "결제 미완료"}</p>
            <p className="mt-1 text-sm text-slate-500">광고 영수증</p>
          </div>
          <dl className="mt-6 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">공고</dt><dd className="font-medium text-slate-800">{o.job?.title ?? "-"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">광고 기간</dt><dd>{o.days}일 <span className="text-teal-600">(1주 무료 포함)</span></dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">주문번호</dt><dd className="text-slate-600">{o.merchant_uid}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">결제일시</dt><dd>{fmt(o.paid_at)}</dd></div>
            <div className="my-2 border-t border-slate-100" />
            <div className="flex justify-between"><dt className="text-slate-500">공급가액</dt><dd>{won(o.supply_amount)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">부가세(10%)</dt><dd>{won(o.vat)}</dd></div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900"><dt>결제금액</dt><dd className="text-teal-700">{won(o.amount)}</dd></div>
          </dl>
          <p className="mt-6 text-center text-xs text-slate-400">정식 세금계산서가 필요하시면 운영팀(howtattoo@howtattoo.co.kr)으로 요청해 주세요.</p>
        </div>
      </div>
    </HospitalShell>
  );
}
