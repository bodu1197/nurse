import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getMyProfile } from "@/lib/data/user";
import { getMyJobs } from "@/lib/data/jobs";
import { setJobStatus, deleteJob } from "../actions";

export const metadata = { title: "공고 관리 — 널스넷", robots: { index: false } };

const fmt = (iso: string) => new Date(iso).toISOString().slice(0, 10).replace(/-/g, ".");

export default async function MyJobsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ ok?: string }> }>) {
  const p = await getMyProfile();
  if (!p) redirect("/login");
  if (p.role !== "hospital") redirect("/mypage");
  const [{ ok }, jobs] = await Promise.all([searchParams, getMyJobs()]);

  return (
    <>
      <SiteHeader user={{ displayName: p.displayName }} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <a href="/mypage" className="text-sm text-teal-700 hover:underline">← 마이페이지</a>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900">공고 관리</h1>
          <a href="/mypage/jobs/new" className="rounded-full bg-teal-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2">공고 등록</a>
        </div>

        {ok === "1" && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">처리되었습니다.</div>}

        {jobs.length === 0 ? (
          <p className="py-20 text-center text-slate-500">등록한 공고가 없습니다. <a href="/mypage/jobs/new" className="font-semibold text-teal-700 hover:underline">첫 공고를 등록</a>해 보세요.</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {jobs.map((j) => {
              const open = j.status === "open";
              return (
                <li key={j.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <a href={`/jobs?j=${j.id}`} className="font-semibold text-slate-900 hover:text-teal-700">{j.title}</a>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${open ? "bg-teal-100 text-teal-800" : "bg-slate-100 text-slate-500"}`}>{open ? "게시중" : "마감"}</span>
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {fmt(j.posted_at)} 등록 · 지원자{" "}
                    <a href="/mypage/applicants" className="font-semibold text-teal-700 hover:underline">{j.applicant_count}명</a>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <form action={setJobStatus} className="inline">
                      <input type="hidden" name="job_id" value={j.id} />
                      <input type="hidden" name="status" value={open ? "closed" : "open"} />
                      <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">{open ? "마감하기" : "다시 게시"}</button>
                    </form>
                    <form action={deleteJob} className="inline">
                      <input type="hidden" name="job_id" value={j.id} />
                      <button type="submit" className="rounded-md px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">삭제</button>
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
