import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import { getMyProfile } from "@/lib/data/user";
import { getSavedJobs } from "@/lib/data/jobs";
import { toggleSaveJob } from "@/app/jobs/actions";

export const metadata = { title: "저장한 공고 — 널스넷", robots: { index: false } };

export default async function SavedPage() {
  const p = await getMyProfile();
  if (!p) redirect("/login");
  if (p.role !== "nurse") redirect("/mypage");
  const jobs = await getSavedJobs();

  return (
    <>
      <SiteHeader user={{ displayName: p.displayName }} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <a href="/mypage" className="text-sm text-teal-700 hover:underline">← 마이페이지</a>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">저장한 공고</h1>
        {jobs.length === 0 ? (
          <p className="py-20 text-center text-slate-500">
            저장한 공고가 없습니다. <a href="/jobs" className="font-semibold text-teal-700 hover:underline">공고 보러가기</a>
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {jobs.map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <div className="min-w-0">
                  <a href={`/jobs?j=${j.id}`} className="font-semibold text-slate-900 hover:text-teal-700">{j.title}</a>
                  <div className="text-sm text-slate-500">{j.hospital?.name ?? "병원 미상"} · {j.location ?? "-"}{j.salary_text ? " · " + j.salary_text : ""}</div>
                </div>
                <form action={toggleSaveJob} className="shrink-0">
                  <input type="hidden" name="job_id" value={j.id} />
                  <input type="hidden" name="next" value="/mypage/saved" />
                  <Button type="submit" variant="outline" size="sm">해제</Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
