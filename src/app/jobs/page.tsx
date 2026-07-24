import { redirect } from "next/navigation";
import Button from "@/components/Button";
import { SaveIcon } from "@/components/JobDetail";
import { getJobs, getSavedJobIds, PER_PAGE } from "@/lib/data/jobs";
import { getMyProfile } from "@/lib/data/user";
import { saveSearch, toggleSaveJob } from "./actions";
import FilterBar from "@/components/FilterBar";
import { daysAgo, nowMs, listingEnd, fmtDate } from "@/lib/date";

// 시드 샘플 데이터 단계 — 실제 워크넷/직접등록 데이터 전까지 noindex.
export const metadata = { title: "채용 검색 — 널스넷", robots: { index: false } };

export default async function JobsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ q?: string; l?: string; j?: string; saved?: string; spec?: string; et?: string; days?: string; page?: string }> }>) {
  const { q, l, j, saved, spec, et, days, page } = await searchParams;
  // 예전 마스터-디테일의 ?j= 링크(저장·지원 내역 등)는 단독 상세로 넘긴다.
  if (j) redirect(`/jobs/${encodeURIComponent(j)}`);

  const kw = (q ?? "").trim();
  const loc = (l ?? "").trim();
  const pageNum = Math.max(1, Number(page) || 1);

  const [{ jobs, total }, profile] = await Promise.all([
    getJobs(kw, loc, { specialty: spec, employmentType: et, days: days ? Number(days) : undefined }, pageNum),
    getMyProfile(),
  ]);
  const now = nowMs();
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const savedSet = profile ? await getSavedJobIds(jobs.map((x) => x.id)) : new Set<string>();

  // 검색 조건을 유지한 목록 URL(페이지 이동·저장 후 복귀용).
  const href = (toPage?: number) => {
    const p = new URLSearchParams();
    if (kw) p.set("q", kw);
    if (loc) p.set("l", loc);
    if (spec) p.set("spec", spec);
    if (et) p.set("et", et);
    if (days) p.set("days", days);
    if (toPage && toPage > 1) p.set("page", String(toPage));
    const s = p.toString();
    return "/jobs" + (s ? `?${s}` : "");
  };
  const inputClass = "h-full w-full bg-transparent text-base outline-none placeholder:text-slate-400";

  return (
    <>
      {/* 헤더는 상위 layout.tsx가 그린다 */}
      <div className="border-b border-slate-200">
        <div className="mx-auto max-w-[1280px] px-4 py-4">
          <form action="/jobs" method="get" className="flex flex-col gap-2 rounded-xl border border-slate-300 p-1.5 shadow-sm focus-within:border-teal-500 sm:flex-row sm:items-center sm:rounded-full">
            <label className="flex flex-1 items-center gap-2 px-3 py-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-slate-400" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
              <input name="q" defaultValue={kw} aria-label="직무·키워드·병원 검색" placeholder="직무, 키워드 및 병원" className={inputClass} />
            </label>
            <span className="mx-1 hidden h-7 w-px bg-slate-200 sm:block" />
            <label className="flex items-center gap-2 px-3 py-2 sm:w-64">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-slate-400" aria-hidden><path d="M12 21s-7-6.3-7-11a7 7 0 1114 0c0 4.7-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
              <input name="l" defaultValue={loc} aria-label="지역 검색" placeholder="지역" className={inputClass} />
            </label>
            <Button type="submit" size="md">검색</Button>
          </form>

          <FilterBar />
        </div>
      </div>

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-5">
        {/* 화면에는 검색창이 제목 역할을 하지만, 문서에는 h1이 하나 있어야 한다(스크린리더 · 검색엔진). */}
        <h1 className="sr-only">간호사 채용공고 검색</h1>
        <p className="text-sm text-slate-600">
          <a href={profile ? "/mypage/resume" : "/signup"} className="font-semibold text-teal-700 hover:underline">
            {profile ? "내 이력서 관리" : "이력서를 등록하세요"}
          </a> — 손쉽게 지원하세요
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-500">
            {kw || "간호사"} 채용공고 <span className="font-semibold text-slate-800">{total}건</span>{loc ? `, ${loc}` : ""} · 정렬: 연관성{totalPages > 1 ? ` · ${pageNum}/${totalPages}p` : ""}
          </p>
          {profile && (kw || loc) && (
            <form action={saveSearch}>
              <input type="hidden" name="q" value={kw} />
              <input type="hidden" name="l" value={loc} />
              <Button type="submit" variant="outline" size="sm" className="hover:border-teal-400 hover:text-teal-700">
                🔔 검색 저장
              </Button>
            </form>
          )}
        </div>
        {saved === "1" && (
          <div role="status" className="mt-2 rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm text-teal-800">
            검색이 저장되었습니다. <a href="/mypage/alerts" className="font-semibold underline">채용 알림</a>에서 확인하세요.
          </div>
        )}

        {jobs.length === 0 ? (
          <p className="py-20 text-center text-slate-500">검색 결과가 없습니다. 다른 키워드로 검색해 보세요.</p>
        ) : (
          <>
            {/* 메인처럼 카드만 2열로 나열 — 누르면 단독 상세(/jobs/[id])로 이동한다. */}
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {jobs.map((job) => (
                <li key={job.id} className="relative">
                  <a href={`/jobs/${job.id}`} className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold leading-snug text-slate-900">{job.title}</h3>
                      {job.is_featured && <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">추천</span>}
                    </div>
                    <p className="mt-1.5 text-sm text-slate-700">{job.hospital?.name ?? job.company_name ?? "병원 미상"}</p>
                    <p className="text-sm text-slate-500">{job.location}</p>
                    <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pr-12 pt-3 text-xs">
                      <span className="font-bold text-teal-700">{job.salary_text ?? "급여 협의"}</span>
                      <span className="text-slate-400">{daysAgo(job.posted_at)}일 전</span>
                      {job.source === "direct"
                        ? <span className="font-medium text-rose-600">~{fmtDate(listingEnd(job, now)).slice(5)} 마감</span>
                        : job.deadline && <span className="font-medium text-rose-600">~{job.deadline.slice(5).replace("-", ".")} 마감</span>}
                    </div>
                  </a>
                  <form action={toggleSaveJob} className="absolute bottom-3 right-3">
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="next" value={href(pageNum)} />
                    <button type="submit" aria-label={savedSet.has(job.id) ? "저장 해제" : "저장"} className={`grid h-11 w-11 place-items-center rounded-full hover:bg-slate-100 ${savedSet.has(job.id) ? "text-teal-600" : "text-slate-400"}`}>
                      <SaveIcon filled={savedSet.has(job.id)} />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
            {totalPages > 1 && (
              <nav className="mt-6 flex items-center justify-center gap-3 text-sm">
                {pageNum > 1 ? <a href={href(pageNum - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50">← 이전</a> : <span />}
                <span className="text-slate-500">{pageNum} / {totalPages}</span>
                {pageNum < totalPages ? <a href={href(pageNum + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50">다음 →</a> : <span />}
              </nav>
            )}
          </>
        )}
      </main>
    </>
  );
}
