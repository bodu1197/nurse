import { redirect } from "next/navigation";
import HospitalShell from "@/components/HospitalShell";
import AdPurchase from "@/components/AdPurchase";
import { getMyProfile } from "@/lib/data/user";
import { getMyJob } from "@/lib/data/jobs";
import { iamportReady } from "@/lib/iamport";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { AD_PRODUCTS, won } from "@/lib/ads";
import { activateAdFree } from "@/app/mypage/actions";

export const metadata = { title: "공고 광고 — 널스넷", robots: { index: false } };

export default async function AdPage({ params, searchParams }: Readonly<{ params: Promise<{ id: string }>; searchParams: Promise<{ weeks?: string }> }>) {
  const p = await getMyProfile();
  if (!p) redirect("/login");
  if (p.role !== "hospital") redirect("/mypage");
  const { id } = await params;
  const { weeks } = await searchParams;
  const initialWeeks = ["2", "3", "4"].includes(weeks ?? "") ? Number(weeks) : 2;
  const job = await getMyJob(id);
  if (!job) redirect("/mypage/jobs");
  const ready = iamportReady();

  return (
    <HospitalShell displayName={p.displayName} active="/mypage/jobs">
      <div className="max-w-xl">
        <h1 className="mt-3 text-2xl font-bold text-slate-900">공고 광고 올리기</h1>
        <p className="mt-1 text-sm text-slate-500">공고: <b className="text-slate-700">{job.title}</b> · 기간을 선택해 결제하면 상단에 노출됩니다.</p>

        {ready ? (
          <AdPurchase jobId={job.id} initialWeeks={initialWeeks} impCode={process.env.NEXT_PUBLIC_IAMPORT_CODE ?? ""} pg={process.env.NEXT_PUBLIC_IAMPORT_PG ?? "html5_inicis"} />
        ) : (
          <div className="mt-6 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
            광고 결제는 준비 중입니다(도메인 연결 후 오픈).{job.status === "draft" ? " 이 공고는 결제 시 게시됩니다 — 그전까지 '결제 대기' 상태로 보관됩니다." : ""}
          </div>
        )}

        {p.isAdmin && (
          <form action={activateAdFree} className="mt-6 rounded-[12px] border border-slate-300 bg-slate-100 p-4">
            <input type="hidden" name="job_id" value={job.id} />
            <p className="text-sm font-semibold text-slate-800">관리자 테스트 — 결제 없이 광고 적용</p>
            <p className="mt-0.5 text-xs text-slate-600">노출기간·영수증까지 실제와 동일하게 생성됩니다. 매출 오염 방지를 위해 주문 금액은 0원으로 기록됩니다.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {AD_PRODUCTS.map((pr) => (
                <ConfirmSubmit key={pr.weeks} name="weeks" value={pr.weeks} size="md" variant="outline" className="focus-visible:ring-offset-slate-100"
                  message={`결제 없이 ${pr.weeks}주(${pr.days}일) 광고를 적용합니다. 공고가 실제로 상단 노출되고 주문은 0원으로 기록되며, 되돌릴 수 없습니다. 계속할까요?`}>
                  {pr.weeks}주 적용 <span className="font-normal">(정가 {won(pr.amount)})</span>
                </ConfirmSubmit>
              ))}
            </div>
          </form>
        )}
      </div>
    </HospitalShell>
  );
}
