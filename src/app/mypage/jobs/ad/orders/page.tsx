import Link from "next/link";
import HospitalShell from "@/components/HospitalShell";
import { requireProfile } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { won, orderStatusLabel } from "@/lib/ads";
import { COMPANY, LINK_CLASS } from "@/lib/constants";

export const metadata = { title: "광고 결제 내역 — 널스넷", robots: { index: false } };

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ko-KR") : "-");

/**
 * 광고 결제 내역.
 *
 * 🔴 왜 필요: 지금까지 영수증은 결제 직후 딱 한 번, 주소를 직접 들고 있어야만 볼 수 있었다
 *    (/mypage/jobs/ad/receipt/{orderId}). 지난 결제를 다시 볼 화면이 없어서 회계·세금계산서
 *    요청 때 병원이 우리에게 물어봐야 했다.
 *
 * 환불은 하지 않는다(오너 확정 2026-07-30 · 약관 제9조) — 그래서 이 화면에는 취소 버튼이 없다.
 * 대신 "무엇을 언제 얼마에 샀는지"를 스스로 확인할 수 있게 하는 것이 이 화면의 전부다.
 */
export default async function AdOrdersPage() {
  const p = await requireProfile("/mypage/jobs/ad/orders", "hospital");
  const supabase = await createClient();

  // RLS: 본인 주문만(buyer_id = auth.uid()). 결제까지 안 간 주문(PREPARE)도 보여준다 —
  // 결제창을 닫았을 뿐인데 목록에서 사라지면 "돈이 나갔나?" 를 확인할 방법이 없다.
  type Row = {
    id: string; merchant_uid: string; tier: string; days: number;
    amount: number; cash_used: number; status: string; created_at: string; paid_at: string | null;
    job: { title: string } | null;
  };
  const { data, error } = await supabase
    .from("ad_orders")
    .select("id, merchant_uid, tier, days, amount, cash_used, status, created_at, paid_at, job:jobs(title)")
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<Row[]>();
  const orders = data ?? [];

  return (
    <HospitalShell displayName={p.displayName} active="/mypage/jobs">
      <h1 className="mt-3 text-2xl font-bold text-slate-900">광고 결제 내역</h1>
      <p className="mt-1 text-sm text-slate-500">최근 100건까지 보입니다.</p>

      {error && (
        <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          내역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </div>
      )}

      {orders.length === 0 ? (
        <p className="py-20 text-center text-slate-500">
          결제한 광고가 없습니다. <Link href="/mypage/jobs" className={LINK_CLASS}>공고 관리</Link>에서 광고를 올릴 수 있습니다.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {orders.map((o) => {
            const paid = o.status === "PAID";
            return (
              <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white p-4">
                {/* 🔴 라벨은 lib/ads 한 곳에서만 온다 — 관리자 화면과 **같은 표**다.
                    전에는 EXPIRED 를 여기만 "미완료" 로 뭉개서, 캐시를 이미 돌려받은 주문을
                    손님은 계속 "돈이 묶여 있는 건" 으로 읽었다(관리자 화면은 반환됐다고 말했다). */}
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${paid ? "bg-teal-100 text-teal-800" : "bg-slate-100 text-slate-600"}`}>
                  {orderStatusLabel(o.status)}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{o.job?.title ?? "삭제된 공고"}</span>
                <span className="shrink-0 text-xs text-slate-500">{o.days}일</span>
                <span className="shrink-0 text-xs text-slate-500">{fmt(o.paid_at ?? o.created_at)}</span>
                {/* 0원 주문이 실결제처럼 보이면 매출을 잘못 읽는다 */}
                {o.tier === "admin_test" && <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-white">테스트</span>}
                <span className="shrink-0 text-right">
                  <span className="font-bold text-teal-700">{won(o.amount)}</span>
                  {o.cash_used > 0 && <span className="block text-[11px] text-slate-500">캐시 {won(o.cash_used)} 사용</span>}
                </span>
                <Link href={`/mypage/jobs/ad/receipt/${o.id}`} className="shrink-0 text-sm font-semibold text-teal-700 hover:underline">영수증</Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
        광고는 결제 즉시 노출이 시작되는 상품이라 <b className="text-slate-800">결제 후 환불되지 않습니다</b>(이용약관 제9조).
        세금계산서가 필요하시면 <a href={`mailto:${COMPANY.email}`} className={LINK_CLASS}>{COMPANY.email}</a> 로 요청해 주세요.
      </p>
    </HospitalShell>
  );
}
