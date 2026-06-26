import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { getMyProfile } from "@/lib/data/user";
import { getMyJobs } from "@/lib/data/jobs";
import { setJobStatus, deleteJob, repostJob } from "../actions";

export const metadata = { title: "공고 관리 — 널스넷", robots: { index: false } };

const fmt = (iso: string) => new Date(iso).toISOString().slice(0, 10).replace(/-/g, ".");
const DAY = 86_400_000;
const FREE_MS = 7 * DAY; // 무료 게시 7일

export default async function MyJobsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ ok?: string; error?: string }> }>) {
  const p = await getMyProfile();
  if (!p) redirect("/login");
  if (p.role !== "hospital") redirect("/mypage");
  const [{ ok, error }, jobs] = await Promise.all([searchParams, getMyJobs()]);
  const now = Date.now();

  return (
    <>
      <SiteHeader user={{ displayName: p.displayName }} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <a href="/mypage" className="text-sm text-teal-700 hover:underline">← 마이페이지</a>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900">공고 관리</h1>
          <Button href="/mypage/jobs/new" size="md">공고 등록</Button>
        </div>
        <p className="mt-1 text-sm text-slate-500">무료 공고는 <b className="text-teal-700">동시 1건</b> <span className="text-slate-400">(7일 노출). 추가·기간연장·상단 노출은 광고로.</span></p>

        {ok === "1" && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">처리되었습니다.</div>}
        {error === "1" && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">처리에 실패했습니다. 다시 시도해 주세요.</div>}
        {error === "freelimit" && <div role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">무료 공고는 동시 1건까지입니다. 기존 공고가 만료되거나 광고로 전환하면 새 공고를 올릴 수 있습니다.</div>}

        {jobs.length === 0 ? (
          <p className="py-20 text-center text-slate-500">등록한 공고가 없습니다. <a href="/mypage/jobs/new" className="font-semibold text-teal-700 hover:underline">첫 공고를 등록</a>해 보세요.</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {jobs.map((j) => {
              const posted = new Date(j.posted_at).getTime();
              const featuredMs = j.featured_until ? new Date(j.featured_until).getTime() : 0;
              const open = j.status === "open";
              const featured = open && featuredMs > now;
              const freeLive = open && posted >= now - FREE_MS;
              const live = featured || freeLive;
              const expired = open && !live;
              const freeDaysLeft = Math.max(0, Math.ceil((posted + FREE_MS - now) / DAY));
              const adDaysLeft = Math.max(0, Math.ceil((featuredMs - now) / DAY));
              return (
                <li key={j.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <a href={`/jobs?j=${j.id}`} className="font-semibold text-slate-900 hover:text-teal-700">{j.title}</a>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${featured ? "bg-violet-100 text-violet-800" : freeLive ? "bg-teal-100 text-teal-800" : expired ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`}>
                      {featured ? "광고중" : freeLive ? "게시중" : expired ? "만료" : "마감"}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {fmt(j.posted_at)} 등록 · 지원자{" "}
                    <a href={`/mypage/applicants?job_id=${j.id}`} className="font-semibold text-teal-700 hover:underline">{j.applicant_count}명</a>
                    {featured && <span className="text-violet-700"> · 광고 {adDaysLeft}일 남음</span>}
                    {!featured && freeLive && <span className="text-slate-400"> · 무료 {freeDaysLeft}일 남음</span>}
                    {expired && <span className="text-amber-700"> · 노출 종료</span>}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button href={`/mypage/jobs/${j.id}/edit`} variant="outline" size="sm">수정</Button>
                    <Button href={`/mypage/jobs/new?from=${j.id}`} variant="outline" size="sm">복제</Button>
                    <Button href={`/mypage/jobs/${j.id}/ad`} size="sm">{featured ? "광고 연장" : "광고 올리기"}</Button>
                    {live ? (
                      <form action={setJobStatus} className="inline">
                        <input type="hidden" name="job_id" value={j.id} />
                        <input type="hidden" name="status" value="closed" />
                        <Button type="submit" variant="outline" size="sm">마감하기</Button>
                      </form>
                    ) : (
                      <form action={repostJob} className="inline">
                        <input type="hidden" name="job_id" value={j.id} />
                        <Button type="submit" variant="outline" size="sm">다시 게시</Button>
                      </form>
                    )}
                    <form action={deleteJob} className="inline">
                      <input type="hidden" name="job_id" value={j.id} />
                      <ConfirmSubmit message="이 공고를 삭제할까요? 지원자 정보도 함께 사라지며 되돌릴 수 없습니다.">삭제</ConfirmSubmit>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
