import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import AdPurchase from "@/components/AdPurchase";
import { getMyProfile } from "@/lib/data/user";
import { getMyJob } from "@/lib/data/jobs";
import { iamportReady } from "@/lib/iamport";

export const metadata = { title: "공고 광고 — 널스넷", robots: { index: false } };

export default async function AdPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const p = await getMyProfile();
  if (!p) redirect("/login");
  if (p.role !== "hospital") redirect("/mypage");
  const { id } = await params;
  const job = await getMyJob(id);
  if (!job) redirect("/mypage/jobs");
  const ready = iamportReady();

  return (
    <>
      <SiteHeader user={{ displayName: p.displayName }} />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
        <a href="/mypage/jobs" className="text-sm text-teal-700 hover:underline">← 공고 관리</a>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">공고 광고 올리기</h1>
        <p className="mt-1 text-sm text-slate-500">공고: <b className="text-slate-700">{job.title}</b> · 기간을 선택해 결제하면 상단에 노출됩니다.</p>

        {ready ? (
          <AdPurchase jobId={job.id} impCode={process.env.NEXT_PUBLIC_IAMPORT_CODE ?? ""} pg={process.env.NEXT_PUBLIC_IAMPORT_PG ?? "html5_inicis"} />
        ) : (
          <div className="mt-6 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
            광고 결제는 준비 중입니다. 곧 오픈됩니다.
          </div>
        )}
      </main>
    </>
  );
}
