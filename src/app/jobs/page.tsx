import SiteHeader from "@/components/SiteHeader";
import { getJobs, SOURCE_LABEL, type JobRow } from "@/lib/data/jobs";
import { getCurrentUser } from "@/lib/data/user";
import { applyToJob, saveSearch } from "./actions";
import FilterBar from "@/components/FilterBar";
import { daysAgo } from "@/lib/date";

// 시드 샘플 데이터 단계 — 실제 워크넷/직접등록 데이터 전까지 noindex.
export const metadata = { title: "채용 검색 — 널스넷", robots: { index: false } };

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-amber-500" aria-label={`평점 ${rating}`}>
      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 15l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
      </svg>
      <span className="font-semibold text-slate-700">{rating.toFixed(1)}</span>
    </span>
  );
}

function Bookmark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400" aria-hidden>
      <path d="M6 3h12a1 1 0 011 1v17l-7-4-7 4V4a1 1 0 011-1z" />
    </svg>
  );
}

export default async function JobsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ q?: string; l?: string; j?: string; saved?: string; spec?: string; et?: string; days?: string }> }>) {
  const { q, l, j, saved, spec, et, days } = await searchParams;
  const kw = (q ?? "").trim();
  const loc = (l ?? "").trim();

  const [jobs, user] = await Promise.all([
    getJobs(kw, loc, { specialty: spec, employmentType: et, days: days ? Number(days) : undefined }),
    getCurrentUser(),
  ]);
  const selected: JobRow | undefined = jobs.find((x) => x.id === j) ?? jobs[0];

  const href = (jobId?: string) => {
    const p = new URLSearchParams();
    if (kw) p.set("q", kw);
    if (loc) p.set("l", loc);
    if (spec) p.set("spec", spec);
    if (et) p.set("et", et);
    if (days) p.set("days", days);
    if (jobId) p.set("j", jobId);
    const s = p.toString();
    return "/jobs" + (s ? `?${s}` : "");
  };
  const inputClass = "h-full w-full bg-transparent text-base outline-none placeholder:text-slate-400";

  return (
    <>
      <SiteHeader user={user} />

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
            <button type="submit" className="rounded-[12px] bg-teal-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2">검색</button>
          </form>

          <FilterBar />
        </div>
      </div>

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-5">
        <p className="text-sm text-slate-600">
          <a href={user ? "/mypage/resume" : "/signup"} className="font-semibold text-teal-700 hover:underline">
            {user ? "내 이력서 관리" : "이력서를 등록하세요"}
          </a> — 손쉽게 지원하세요
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-500">
            {kw || "간호사"} 채용공고 <span className="font-semibold text-slate-800">{jobs.length}건</span>{loc ? `, ${loc}` : ""} · 정렬: 연관성
          </p>
          {user && (kw || loc) && (
            <form action={saveSearch}>
              <input type="hidden" name="q" value={kw} />
              <input type="hidden" name="l" value={loc} />
              <button type="submit" className="inline-flex items-center gap-1 rounded-[12px] border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-teal-400 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
                🔔 검색 저장
              </button>
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
            <ul className={`space-y-3 ${j ? "hidden lg:block" : ""}`}>
              {jobs.map((job) => {
                const on = selected?.id === job.id;
                return (
                  <li key={job.id}>
                    <a href={href(job.id)} className={`block rounded-lg border bg-white p-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${on ? "border-teal-600 ring-1 ring-teal-600" : "border-slate-200 hover:border-slate-300 hover:shadow-sm"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold leading-snug text-slate-900">{job.title}</h3>
                        <span className="shrink-0"><Bookmark /></span>
                      </div>
                      <div className="mt-1.5 text-sm text-slate-700">{job.hospital?.name ?? "병원 미상"}</div>
                      <div className="text-sm text-slate-500">{job.location}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{SOURCE_LABEL[job.source]}</span>
                        {job.salary_text && <span className="text-slate-500">{job.salary_text}</span>}
                        <span className="text-slate-400">{daysAgo(job.posted_at)}일 전</span>
                      </div>
                    </a>
                  </li>
                );
              })}
            </ul>

            {selected && (
              <section className={`${j ? "" : "hidden lg:block"} lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-auto`}>
                <a href={href()} className="mb-3 inline-block text-sm text-teal-700 hover:underline lg:hidden">← 목록으로</a>
                <article className="rounded-lg border border-slate-200 bg-white p-6">
                  <h2 className="text-2xl font-bold leading-snug text-slate-900">{selected.title}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <a href="/reviews" className="inline-flex items-center gap-1 font-medium text-teal-700 hover:underline">
                      {selected.hospital?.name ?? "병원 미상"}
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M7 17L17 7M7 7h10v10" /></svg>
                    </a>
                    {Number(selected.hospital?.rating_avg) > 0 && (
                      <>
                        <Stars rating={Number(selected.hospital?.rating_avg)} />
                        <span className="text-xs text-slate-500">리뷰 {selected.hospital?.rating_count}</span>
                      </>
                    )}
                  </div>
                  <div className="mt-1 text-slate-600">{selected.location}</div>
                  <div className="text-slate-600">{[selected.employment_type, selected.salary_text].filter(Boolean).join(" · ")}</div>

                  <div className="mt-4 flex items-center gap-2">
                    {selected.source === "direct" ? (
                      user ? (
                        <form action={applyToJob}>
                          <input type="hidden" name="job_id" value={selected.id} />
                          <button type="submit" className="rounded-[12px] bg-teal-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2">간편지원</button>
                        </form>
                      ) : (
                        <a href="/login" className="rounded-[12px] bg-teal-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2">간편지원</a>
                      )
                    ) : (
                      <a href={selected.external_url ?? "#"} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-[12px] bg-teal-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2">
                        원본 사이트에서 지원
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M7 17L17 7M7 7h10v10" /></svg>
                      </a>
                    )}
                    <button aria-label="공고 저장" className="rounded-md border border-slate-300 p-2.5 text-slate-500 hover:bg-slate-50"><Bookmark /></button>
                  </div>

                  <hr className="my-5 border-slate-100" />

                  <h3 className="font-bold text-slate-900">채용 상세 정보</h3>
                  <dl className="mt-3 space-y-2 text-sm">
                    {selected.employment_type && (<div><dt className="text-slate-500">채용공고 유형</dt><dd className="mt-0.5"><span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">{selected.employment_type}</span></dd></div>)}
                    {selected.specialty && (<div><dt className="text-slate-500">진료과</dt><dd className="mt-0.5 text-slate-800">{selected.specialty}</dd></div>)}
                    {selected.salary_text && (<div><dt className="text-slate-500">급여</dt><dd className="mt-0.5 font-medium text-slate-800">{selected.salary_text}</dd></div>)}
                  </dl>

                  {selected.location && (
                    <>
                      <h3 className="mt-5 font-bold text-slate-900">지역</h3>
                      <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-700">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400" aria-hidden><path d="M12 21s-7-6.3-7-11a7 7 0 1114 0c0 4.7-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
                        {selected.location}
                      </p>
                    </>
                  )}

                  {selected.description && (
                    <>
                      <h3 className="mt-5 font-bold text-slate-900">상세 직무 내용</h3>
                      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{selected.description}</p>
                    </>
                  )}

                  {selected.benefits.length > 0 && (
                    <>
                      <h3 className="mt-5 font-bold text-slate-900">복리후생</h3>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {selected.benefits.map((b) => (<span key={b} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{b}</span>))}
                      </div>
                    </>
                  )}
                </article>
              </section>
            )}
          </div>
        )}
      </main>
    </>
  );
}
