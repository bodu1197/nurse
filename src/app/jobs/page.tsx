import { redirect } from "next/navigation";
import { SaveIcon } from "@/components/JobDetail";
import Button from "@/components/Button";
import JobNearMeButton from "@/components/JobNearMeButton";
import JobSearchBar from "@/components/JobSearchBar";
import { getJobs, getSavedJobIds, getJobSidoList, getJobSigunguList, jobFilterQs, PER_PAGE } from "@/lib/data/jobs";
import { getMyProfile } from "@/lib/data/user";
import { JOB_SPECIALTIES, EMPLOYMENT_TYPES } from "@/lib/constants";
import { chipClass as chip } from "@/lib/chip";
import { saveSearch, toggleSaveJob } from "./actions";
import { daysAgo, nowMs, listingEnd, fmtDate } from "@/lib/date";

// 시드 샘플 데이터 단계 — 실제 워크넷/직접등록 데이터 전까지 noindex.
export const metadata = { title: "채용 검색 — 널스넷", robots: { index: false } };

export default async function JobsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ q?: string; l?: string; sido?: string; sigungu?: string; j?: string; saved?: string; spec?: string; et?: string; page?: string }> }>) {
  const { q, l, sido, sigungu, j, saved, spec, et, page } = await searchParams;
  // 예전 마스터-디테일의 ?j= 링크(저장·지원 내역 등)는 단독 상세로 넘긴다.
  if (j) redirect(`/jobs/${encodeURIComponent(j)}`);

  const kw = (q ?? "").trim();
  const loc = (l ?? "").trim();
  const sd = (sido ?? "").trim();
  // 시군구는 시도에 종속 — 시도 없으면 무시(서버 필터와 같은 계약).
  const sg = sd ? (sigungu ?? "").trim() : "";
  const pageNum = Math.max(1, Number(page) || 1);

  const [{ jobs, total }, sidos, sigungus, profile] = await Promise.all([
    getJobs(kw, loc, { sido: sd, sigungu: sg, specialty: spec, employmentType: et }, pageNum),
    getJobSidoList(),
    getJobSigunguList(sd), // 시도 미선택이면 즉시 [](비용 0)
    getMyProfile(),
  ]);
  const now = nowMs();
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const savedSet = profile ? await getSavedJobIds(jobs.map((x) => x.id)) : new Set<string>();

  // 검색 조건 유지 URL — 목록 이동(href)·카드→상세(detailHref)가 같은 검색결과를 따라간다. 직렬화는 jobFilterQs 한 곳.
  const href = (toPage?: number) => { const s = jobFilterQs({ q: kw, l: loc, sido: sd, sigungu: sg, spec, et }, toPage); return "/jobs" + (s ? `?${s}` : ""); };
  const detailHref = (jobId: string) => { const s = jobFilterQs({ q: kw, l: loc, sido: sd, sigungu: sg, spec, et }, pageNum); return `/jobs/${jobId}` + (s ? `?${s}` : ""); };
  // 진료과·근무형태 칩 href — 둘은 독립 필터라 서로를 유지하고 지역·키워드도 유지, 페이지만 리셋.
  const chipHref = (nextSpec?: string) => { const s = jobFilterQs({ q: kw, l: loc, sido: sd, sigungu: sg, spec: nextSpec, et }); return "/jobs" + (s ? `?${s}` : ""); };
  const etHref = (nextEt?: string) => { const s = jobFilterQs({ q: kw, l: loc, sido: sd, sigungu: sg, spec, et: nextEt }); return "/jobs" + (s ? `?${s}` : ""); };

  return (
    <>
      {/* 상단: 내 주변 → 지역 → 검색 한 줄(dolpagu 와 동일 배치) */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1280px] px-4 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <JobNearMeButton />
            <JobSearchBar sidos={sidos} sigungus={sigungus} />
          </div>
        </div>
      </div>

      {/* 진료과 칩 + 근무형태 칩 — 둘 다 펼쳐 나열(독립 필터). */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1280px] space-y-2 px-4 py-3">
          <nav aria-label="진료과" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
            <a href={chipHref()} aria-current={!spec ? "page" : undefined} className={chip(!spec)}>진료과 전체</a>
            {JOB_SPECIALTIES.map((s) => (
              <a key={s} href={chipHref(s)} aria-current={spec === s ? "page" : undefined} className={chip(spec === s)}>{s}</a>
            ))}
          </nav>
          <nav aria-label="근무형태" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
            <a href={etHref()} aria-current={!et ? "page" : undefined} className={chip(!et)}>근무형태 전체</a>
            {EMPLOYMENT_TYPES.map((t) => (
              <a key={t} href={etHref(t)} aria-current={et === t ? "page" : undefined} className={chip(et === t)}>{t}</a>
            ))}
          </nav>
        </div>
      </div>

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-5">
        <h1 className="sr-only">간호사 채용공고 검색</h1>
        <p className="text-sm text-slate-600">
          <a href={profile ? "/mypage/resume" : "/signup"} className="font-semibold text-teal-700 hover:underline">
            {profile ? "내 이력서 관리" : "이력서를 등록하세요"}
          </a> — 손쉽게 지원하세요
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-500">
            {spec || kw || "간호사"} 채용공고 <span className="font-semibold text-slate-800">{total.toLocaleString()}건</span>{sd ? `, ${sg || sd}` : ""} · 정렬: 연관성{totalPages > 1 ? ` · ${pageNum}/${totalPages}p` : ""}
          </p>
          {profile && (kw || sd) && (
            <form action={saveSearch}>
              <input type="hidden" name="q" value={kw} />
              <input type="hidden" name="sido" value={sd} />
              <input type="hidden" name="sigungu" value={sg} />
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
          <p className="py-20 text-center text-slate-500">검색 결과가 없습니다. 다른 조건으로 검색해 보세요.</p>
        ) : (
          <>
            {/* 메인처럼 카드만 2열로 — 누르면 단독 상세(/jobs/[id])로 이동. */}
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {jobs.map((job) => (
                <li key={job.id} className="relative">
                  <a href={detailHref(job.id)} className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
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
