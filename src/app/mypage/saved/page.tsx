import Link from "next/link";
import { redirect } from "next/navigation";
import NurseShell from "@/components/NurseShell";
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
    <NurseShell displayName={p.displayName} active="/mypage/saved">
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
                  <div className="text-sm text-slate-500">{j.hospital?.name ?? j.company_name ?? "병원 미상"} · {j.location ?? "-"}{j.salary_text ? " · " + j.salary_text : ""}</div>
                  {/* 마감 공고는 지우는 것 말고 할 게 없다 → 같은 조건으로 다시 찾을 길을 준다 */}
                  {!open && (
                    <Link href={`/jobs?${new URLSearchParams({ ...(j.specialty ? { q: j.specialty } : {}), ...(j.location ? { l: j.location } : {}) })}`}
                      prefetch={false} className="mt-1 inline-block text-sm font-semibold text-teal-700 hover:underline">
                      비슷한 공고 찾기 →
                    </Link>
                  )}
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
    </NurseShell>
  );
}
