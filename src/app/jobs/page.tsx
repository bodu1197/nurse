import { redirect } from "next/navigation";
import Button from "@/components/Button";
import JobDetail, { SaveIcon } from "@/components/JobDetail";
import { getJobs, getSavedJobIds, PER_PAGE, type JobRow } from "@/lib/data/jobs";
import { getMyProfile } from "@/lib/data/user";
import { hasApplied } from "@/lib/data/applications";
import { saveSearch, toggleSaveJob } from "./actions";
import FilterBar from "@/components/FilterBar";
import { daysAgo, nowMs, listingEnd, fmtDate } from "@/lib/date";

// 시드 샘플 데이터 단계 — 실제 워크넷/직접등록 데이터 전까지 noindex.
export const metadata = { title: "채용 검색 — 널스넷", robots: { index: false } };

export default async function JobsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ q?: string; l?: string; j?: string; saved?: string; spec?: string; et?: string; days?: string; apply?: string; page?: string }> }>) {
  const { q, l, j, saved, spec, et, days, apply, page } = await searchParams;
  const kw = (q ?? "").trim();
  const loc = (l ?? "").trim();
  const pageNum = Math.max(1, Number(page) || 1);

  const [{ jobs, total }, profile] = await Promise.all([
    getJobs(kw, loc, { specialty: spec, employmentType: et, days: days ? Number(days) : undefined }, pageNum),
    getMyProfile(),
  ]);
  // ?j=가 이 페이지 목록에 없으면 단독 상세로 보낸다. 예전처럼 jobs[0]으로 떨어뜨리면
  // 저장·지원 내역에서 온 링크가 **엉뚱한 병원 공고**를 열고, 그 화면에서 그대로 지원까지 된다.
  const selected: JobRow | undefined = j ? jobs.find((x) => x.id === j) : jobs[0];
  // 실패 사유(apply)를 달고 왔다면 그대로 넘겨야 안내 문구가 상세에서도 보인다.
  // 값은 그대로 URL에 붙지 않도록 인코딩한다(사용자가 넣은 문자열이 그대로 경로가 되면 안 된다).
  if (j && !selected) redirect(`/jobs/${encodeURIComponent(j)}${apply ? `?apply=${encodeURIComponent(apply)}` : ""}`);
  const now = nowMs();
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  // 서로 의존하지 않는 조회는 함께 보낸다(직렬이면 목록 화면이 왕복 한 번만큼 늦어진다).
  const [applied, savedSet] = await Promise.all([
    selected && profile?.role === "nurse" ? hasApplied(selected.id) : Promise.resolve(false),
    profile ? getSavedJobIds(jobs.map((x) => x.id)) : Promise.resolve(new Set<string>()),
  ]);

  const href = (jobId?: string, toPage?: number) => {
    const p = new URLSearchParams();
    if (kw) p.set("q", kw);
    if (loc) p.set("l", loc);
    if (spec) p.set("spec", spec);
    if (et) p.set("et", et);
    if (days) p.set("days", days);
    if (toPage && toPage > 1) p.set("page", String(toPage));
    // 공고를 고를 때 현재 페이지를 유지한다 — 안 넣으면 2페이지 이후 공고는 1페이지 목록에 없어
    // 목록 옆 패널이 아니라 단독 상세로 튕기고 검색 조건까지 날아간다.
    else if (jobId && pageNum > 1) p.set("page", String(pageNum));
    if (jobId) p.set("j", jobId);
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
          <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,470px)_1fr] lg:gap-4">
            <div className={j ? "hidden lg:block" : ""}>
            <ul className="space-y-3">
              {jobs.map((job) => {
                const on = selected?.id === job.id;
                return (
                  <li key={job.id} className="relative">
                    <a href={href(job.id)} className={`block rounded-lg border bg-white p-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${on ? "border-teal-600 ring-1 ring-teal-600" : "border-slate-200 hover:border-slate-300 hover:shadow-sm"}`}>
                      <h3 className="font-semibold leading-snug text-slate-900">{job.title}</h3>
                      <div className="mt-1.5 text-sm text-slate-700">{job.hospital?.name ?? job.company_name ?? "병원 미상"}</div>
                      <div className="text-sm text-slate-500">{job.location}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 pr-10 text-xs">
                        {job.salary_text && <span className="text-slate-500">{job.salary_text}</span>}
                        {job.source === "direct" && job.shift_type && <span className="text-slate-500">{job.shift_type}</span>}
                        <span className="text-slate-400">{daysAgo(job.posted_at)}일 전</span>
                        {job.source === "direct"
                          ? <span className="font-medium text-rose-600">~{fmtDate(listingEnd(job, now)).slice(5)} 마감</span>
                          : job.deadline && <span className="font-medium text-rose-600">~{job.deadline.slice(5).replace("-", ".")} 마감</span>}
                      </div>
                    </a>
                    <form action={toggleSaveJob} className="absolute bottom-2 right-2">
                      <input type="hidden" name="job_id" value={job.id} />
                      <input type="hidden" name="next" value={href(job.id)} />
                      <button type="submit" aria-label={savedSet.has(job.id) ? "저장 해제" : "저장"} className={`grid h-9 w-9 place-items-center rounded-full hover:bg-slate-100 ${savedSet.has(job.id) ? "text-teal-600" : "text-slate-400"}`}>
                        <SaveIcon filled={savedSet.has(job.id)} />
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
            {totalPages > 1 && (
              <nav className="mt-4 flex items-center justify-center gap-3 text-sm">
                {pageNum > 1 ? <a href={href(undefined, pageNum - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50">← 이전</a> : <span />}
                <span className="text-slate-500">{pageNum} / {totalPages}</span>
                {pageNum < totalPages ? <a href={href(undefined, pageNum + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50">다음 →</a> : <span />}
              </nav>
            )}
            </div>

            {selected && (
              <section className={`${j ? "" : "hidden lg:block"} lg:self-start`}>
                <JobDetail
                  job={selected}
                  profile={profile}
                  applied={applied}
                  saved={savedSet.has(selected.id)}
                  selfHref={href(selected.id)}
                  backHref={href()}
                  applyError={apply}
                  now={now}
                />
              </section>
            )}
          </div>
        )}
      </main>
    </>
  );
}
