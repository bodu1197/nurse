import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import { getMyProfile } from "@/lib/data/user";
import { getSavedJobs } from "@/lib/data/jobs";
import { isOpenToSeekers } from "@/lib/jobState";
import { nowMs } from "@/lib/date";
import { toggleSaveJob } from "@/app/jobs/actions";

export const metadata = { title: "저장한 공고 — 널스넷", robots: { index: false } };

export default async function SavedPage() {
  const p = await getMyProfile();
  if (!p) redirect("/login");
  if (p.role !== "nurse") redirect("/mypage");
  const jobs = await getSavedJobs();
  const now = nowMs();

  return (
    <>
      <SiteHeader user={{ displayName: p.displayName }} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <a href="/mypage" className="text-sm text-teal-700 hover:underline">← 마이페이지</a>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">저장한 공고</h1>
        {jobs.length === 0 ? (
          <p className="py-20 text-center text-slate-500">
            저장한 공고가 없습니다. <Link href="/jobs" className="font-semibold text-teal-700 hover:underline">공고 보러가기</Link>
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {jobs.map((j) => {
              // 마감된 공고를 그냥 링크로 두면 눌러야만 404로 알게 된다 → 목록에서 미리 알려주고 링크를 뗀다.
              const open = isOpenToSeekers(j, now);
              return (
              <li key={j.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <div className="min-w-0">
                  {open ? (
                    // 저장 목록은 길이가 정해져 있지 않다 → 전부 미리 받아오지 않는다(누르는 건 보통 한 건)
                    <Link href={`/jobs/${j.id}`} prefetch={false} className="font-semibold text-slate-900 hover:text-teal-700">{j.title}</Link>
                  ) : (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-500 line-through">{j.title}</span>
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">마감</span>
                    </span>
                  )}
                  <div className="text-sm text-slate-500">{j.hospital?.name ?? "병원 미상"} · {j.location ?? "-"}{j.salary_text ? " · " + j.salary_text : ""}</div>
                </div>
                <form action={toggleSaveJob} className="shrink-0">
                  <input type="hidden" name="job_id" value={j.id} />
                  <input type="hidden" name="next" value="/mypage/saved" />
                  <Button type="submit" variant="outline" size="sm" className="min-h-11">해제</Button>
                </form>
              </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
