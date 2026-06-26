import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import { getJobs, getSavedJobIds, PER_PAGE, SOURCE_LABEL, type JobRow } from "@/lib/data/jobs";
import { getMyProfile } from "@/lib/data/user";
import { hasApplied } from "@/lib/data/applications";
import { applyToJob, saveSearch, toggleSaveJob } from "./actions";
import FilterBar from "@/components/FilterBar";
import { daysAgo } from "@/lib/date";

// 시드 샘플 데이터 단계 — 실제 워크넷/직접등록 데이터 전까지 noindex.
export const metadata = { title: "채용 검색 — 널스넷", robots: { index: false } };

// 마감일 = 노출 종료(수동 입력 아님): 광고면 featured_until, 무료면 게시+7일.
const DAY = 86_400_000;
const listingEnd = (job: { posted_at: string; featured_until: string | null }) => {
  const fu = job.featured_until ? new Date(job.featured_until).getTime() : 0;
  return fu > Date.now() ? fu : new Date(job.posted_at).getTime() + 7 * DAY;
};
const fmtDate = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, ".");

// 저장(북마크) 아이콘 — 저장 시 채움.
function SaveIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 3h12a1 1 0 011 1v17l-7-4-7 4V4a1 1 0 011-1z" />
    </svg>
  );
}

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
  const selected: JobRow | undefined = jobs.find((x) => x.id === j) ?? jobs[0];
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const applied = selected && profile?.role === "nurse" ? await hasApplied(selected.id) : false;
  const savedSet = profile ? await getSavedJobIds(jobs.map((x) => x.id)) : new Set<string>();

  const href = (jobId?: string, toPage?: number) => {
    const p = new URLSearchParams();
    if (kw) p.set("q", kw);
    if (loc) p.set("l", loc);
    if (spec) p.set("spec", spec);
    if (et) p.set("et", et);
    if (days) p.set("days", days);
    if (toPage && toPage > 1) p.set("page", String(toPage));
    if (jobId) p.set("j", jobId);
    const s = p.toString();
    return "/jobs" + (s ? `?${s}` : "");
  };
  const inputClass = "h-full w-full bg-transparent text-base outline-none placeholder:text-slate-400";

  return (
    <>
      <SiteHeader user={profile ? { displayName: profile.displayName } : null} />

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
                      <div className="mt-1.5 text-sm text-slate-700">{job.hospital?.name ?? "병원 미상"}</div>
                      <div className="text-sm text-slate-500">{job.location}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 pr-10 text-xs">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{SOURCE_LABEL[job.source]}</span>
                        {job.salary_text && <span className="text-slate-500">{job.salary_text}</span>}
                        {job.shift_type && <span className="text-slate-500">{job.shift_type}</span>}
                        <span className="text-slate-400">{daysAgo(job.posted_at)}일 전</span>
                        {job.source === "direct" && <span className="font-medium text-rose-600">~{fmtDate(listingEnd(job)).slice(5)}</span>}
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
                <a href={href()} className="mb-3 inline-block text-sm text-teal-700 hover:underline lg:hidden">← 목록으로</a>
                <article className="relative rounded-lg border border-slate-200 bg-white p-6">
                  <form action={toggleSaveJob} className="absolute right-4 top-4">
                    <input type="hidden" name="job_id" value={selected.id} />
                    <input type="hidden" name="next" value={href(selected.id)} />
                    <button type="submit" aria-label={savedSet.has(selected.id) ? "저장 해제" : "저장"} className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${savedSet.has(selected.id) ? "border-teal-200 bg-teal-50 text-teal-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
                      <SaveIcon filled={savedSet.has(selected.id)} /> {savedSet.has(selected.id) ? "저장됨" : "저장"}
                    </button>
                  </form>
                  <h2 className="pr-24 text-2xl font-bold leading-snug text-slate-900">{selected.title}</h2>
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
                    {selected.source === "direct" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">✓ 사업자 인증 병원</span>
                    )}
                  </div>
                  <div className="mt-1 text-slate-600">{selected.location}</div>
                  <div className="text-slate-600">{[selected.employment_type, selected.salary_text].filter(Boolean).join(" · ")}</div>

                  <div className="mt-4">
                    {selected.source === "direct" ? (
                      selected.apply_method === "email" ? (
                        <div className="flex flex-col gap-2 sm:max-w-md">
                          <p className="text-sm font-semibold text-slate-700">이메일로 지원</p>
                          {profile ? (
                            selected.apply_email
                              ? <Button href={`mailto:${selected.apply_email}`} size="md">{selected.apply_email}</Button>
                              : <p className="text-sm text-slate-500">지원 이메일이 등록되지 않았습니다. 채용 문의로 연락하세요.</p>
                          ) : (
                            <>
                              <p className="text-sm text-slate-500">이력서를 이메일로 보내 지원합니다. 이메일은 로그인 후 표시됩니다.</p>
                              <Button href={`/login?notice=apply&next=${encodeURIComponent(href(selected.id))}`} size="md">로그인 후 이메일 확인</Button>
                            </>
                          )}
                        </div>
                      ) : selected.apply_method === "offline" ? (
                        <div className="flex flex-col gap-2 sm:max-w-md">
                          <p className="text-sm font-semibold text-slate-700">접수 방법 (우편·방문·전화)</p>
                          {profile ? (
                            selected.apply_detail
                              ? <p className="whitespace-pre-line rounded-[12px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{selected.apply_detail}</p>
                              : <p className="text-sm text-slate-500">접수 안내가 등록되지 않았습니다. 채용 문의로 연락하세요.</p>
                          ) : (
                            <>
                              <p className="text-sm text-slate-500">우편·방문·전화로 접수합니다. 상세 안내는 로그인 후 표시됩니다.</p>
                              <Button href={`/login?notice=apply&next=${encodeURIComponent(href(selected.id))}`} size="md">로그인 후 접수 안내 확인</Button>
                            </>
                          )}
                        </div>
                      ) : !profile ? (
                        <div className="flex flex-col gap-2 sm:max-w-md">
                          <p className="text-sm text-slate-500">지원하려면 로그인이 필요합니다.</p>
                          <Button href={`/login?notice=apply&next=${encodeURIComponent(href(selected.id))}`} size="md">로그인하고 지원</Button>
                        </div>
                      ) : profile.role !== "nurse" ? (
                        <p className="rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">간호사 회원만 지원할 수 있습니다.</p>
                      ) : applied ? (
                        <div className="flex flex-col gap-2 rounded-[12px] border border-teal-200 bg-teal-50 px-4 py-3 sm:max-w-md">
                          <p className="text-sm font-semibold text-teal-800">✓ 지원 완료</p>
                          <a href="/mypage/applications" className="text-sm font-semibold text-teal-700 hover:underline">지원 내역에서 확인 →</a>
                        </div>
                      ) : (
                        <form action={applyToJob} className="flex flex-col gap-2 sm:max-w-md">
                          <input type="hidden" name="job_id" value={selected.id} />
                          {apply === "need_resume" && (
                            <p className="rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                              지원하려면 이력서를 먼저 등록하세요. <a href="/mypage/resume" className="font-semibold underline">이력서 작성하기</a>
                            </p>
                          )}
                          {apply === "error" && (
                            <p className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">지원 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.</p>
                          )}
                          <textarea name="message" rows={2} maxLength={500} placeholder="지원 메시지 (선택)" className="w-full resize-none rounded-[12px] border border-slate-300 p-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40" />
                          <Button type="submit" size="md">간편지원</Button>
                        </form>
                      )
                    ) : !profile ? (
                      // 외부(원본) 공고도 인디드처럼 로그인 후 연결 — off-site 이동 전 회원 확보
                      <div className="flex flex-col gap-2 sm:max-w-md">
                        <p className="text-sm text-slate-500">지원하려면 로그인이 필요합니다.</p>
                        <Button href={`/login?notice=apply&next=${encodeURIComponent(href(selected.id))}`} size="md">로그인하고 지원</Button>
                      </div>
                    ) : (
                      <Button href={selected.external_url ?? "#"} target="_blank" rel="noopener noreferrer" size="md">
                        원본 사이트에서 지원
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M7 17L17 7M7 7h10v10" /></svg>
                      </Button>
                    )}
                  </div>

                  {selected.source === "direct" && (selected.manager_name || selected.manager_phone) && (
                    <div className="mt-4 rounded-[12px] border border-slate-200 bg-slate-50 p-3 text-sm">
                      <p className="font-semibold text-slate-700">채용 문의</p>
                      {profile ? (
                        <>
                          {selected.manager_name && <p className="mt-1 text-slate-600">{selected.manager_name}</p>}
                          {selected.manager_phone && (
                            <a href={`tel:${selected.manager_phone}`} className="mt-1 inline-flex items-center gap-1.5 font-semibold text-teal-700 hover:underline">
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M22 16.92v3a2 2 0 01-2.18 2 19.8 19.8 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z" /></svg>
                              {selected.manager_phone}
                            </a>
                          )}
                        </>
                      ) : (
                        <>
                          {selected.manager_name && <p className="mt-1 tracking-widest text-slate-400">담당자 ******</p>}
                          {selected.manager_phone && <p className="mt-1 tracking-widest text-slate-400">전화 ***-****-****</p>}
                          <a href={`/login?notice=apply&next=${encodeURIComponent(href(selected.id))}`} className="mt-1 inline-block font-semibold text-teal-700 hover:underline">로그인 후 연락처 확인</a>
                        </>
                      )}
                    </div>
                  )}

                  <hr className="my-5 border-slate-100" />

                  <h3 className="font-bold text-slate-900">채용 상세 정보</h3>
                  <dl className="mt-3 space-y-2 text-sm">
                    {selected.employment_type && (<div><dt className="text-slate-500">채용공고 유형</dt><dd className="mt-0.5"><span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">{selected.employment_type}</span></dd></div>)}
                    {selected.specialty && (<div><dt className="text-slate-500">진료과</dt><dd className="mt-0.5 text-slate-800">{selected.specialty}</dd></div>)}
                    {selected.salary_text && (<div><dt className="text-slate-500">급여</dt><dd className="mt-0.5 font-medium text-slate-800">{selected.salary_text}</dd></div>)}
                    {selected.shift_type && (<div><dt className="text-slate-500">근무형태</dt><dd className="mt-0.5 text-slate-800">{selected.shift_type}</dd></div>)}
                    {selected.recruit_count ? (<div><dt className="text-slate-500">모집인원</dt><dd className="mt-0.5 text-slate-800">{selected.recruit_count}명</dd></div>) : null}
                    {selected.source === "direct" && (<div><dt className="text-slate-500">마감일</dt><dd className="mt-0.5 font-medium text-slate-800">{fmtDate(listingEnd(selected))} 마감</dd></div>)}
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
