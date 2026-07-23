import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import Button from "@/components/Button";
import { getMyProfile } from "@/lib/data/user";
import { getMyApplications, STATUS_LABEL, STATUS_TONE, CANCELABLE, LIST_LIMIT } from "@/lib/data/applications";
import { fmtDay } from "@/lib/date";
import { withdrawApplication } from "../actions";

export const metadata = { title: "지원 내역 — 널스넷", robots: { index: false } };

export default async function ApplicationsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ ok?: string; error?: string }> }>) {
  const p = await getMyProfile();
  if (!p) redirect("/login");
  if (p.role !== "nurse") redirect("/mypage");
  const [{ ok, error }, apps] = await Promise.all([searchParams, getMyApplications()]);

  return (
    <>
      <SiteHeader user={{ displayName: p.displayName }} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <a href="/mypage" className="text-sm text-teal-700 hover:underline">← 마이페이지</a>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">지원 내역</h1>
        <p className="mt-1 text-sm text-slate-500">병원이 이력서를 열람하거나 결과를 남기면 여기 상태가 바뀝니다.</p>

        {ok === "1" && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">지원이 완료되었습니다.</div>}
        {ok === "cancel" && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">지원을 취소했습니다. 같은 공고에 다시 지원할 수 있습니다.</div>}
        {error === "1" && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">처리에 실패했습니다. 다시 시도해 주세요.</div>}

        {apps.length === 0 ? (
          <p className="py-20 text-center text-slate-500">
            아직 지원한 공고가 없습니다. <Link href="/jobs" className="font-semibold text-teal-700 hover:underline">채용 공고 보러가기</Link>
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {apps.map((a) => (
              <li key={a.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {/* 지원 목록도 길이가 정해져 있지 않다 → 미리 받아오지 않는다 */}
                    <Link href={`/jobs/${a.job_id}`} prefetch={false} className="font-semibold text-slate-900 hover:text-teal-700">{a.job?.title ?? "공고"}</Link>
                    <div className="text-sm text-slate-500">{a.job?.hospital?.name ?? "병원 미상"} · {fmtDay(a.created_at)} 지원</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                </div>

                {a.message && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-sm text-slate-600">내가 보낸 메시지: {a.message}</p>}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {a.status !== "submitted" && (
                    <span className="text-xs text-slate-500">{fmtDay(a.updated_at)} 상태 변경</span>
                  )}
                  <span className="ml-auto flex items-center gap-2">
                    {a.status === "withdrawn" && <Button href={`/jobs/${a.job_id}`} variant="outline" size="sm" className="min-h-11">다시 지원</Button>}
                    {CANCELABLE.some((s) => s === a.status) && (
                      <form action={withdrawApplication} className="inline">
                        <input type="hidden" name="application_id" value={a.id} />
                        <ConfirmSubmit className="min-h-11" message="이 지원을 취소할까요? 병원 목록에서 '지원취소'로 표시됩니다. 취소 후 다시 지원할 수 있습니다.">
                          지원 취소
                        </ConfirmSubmit>
                      </form>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {apps.length === LIST_LIMIT && (
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            최근 {LIST_LIMIT}건만 표시했습니다.
          </p>
        )}
      </main>
    </>
  );
}
