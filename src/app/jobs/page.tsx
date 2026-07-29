import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SaveIcon } from "@/components/JobDetail";
import Button from "@/components/Button";
import JobNearMeButton from "@/components/JobNearMeButton";
import JobSearchBar from "@/components/JobSearchBar";
import { getJobs, getSavedJobIds, getJobSidoList, getJobSigunguList, getJobFacets, jobFilterQs, PER_PAGE, UNSET } from "@/lib/data/jobs";
import { getMyProfile } from "@/lib/data/user";
import { EMPLOYMENT_TYPES } from "@/lib/constants";
import { chipClass as chip } from "@/lib/chip";
import { saveSearch, toggleSaveJob } from "./actions";
import { daysAgo, nowMs, listingEnd, fmtDate } from "@/lib/date";

// 실데이터(워크넷 수집 + 병원 직접등록) 운영 중이라 색인 대상이다.
// 이 사이트에서 검색엔진에 여는 건 채용공고뿐이다 — 인재정보(/talent)·게시판(/board)·리뷰(/reviews)는 noindex.
/**
 * 필터 칩 한 줄. 네 축(진료과·기관종별·직종·근무형태)이 같은 모양이어야 사용자가 규칙을 한 번만 배운다.
 * cnt 가 있으면 건수를 함께 보여준다 — 누르기 전에 몇 건인지 알 수 있어야 헛클릭이 준다.
 * 항목이 하나도 없으면 줄 자체를 그리지 않는다(빈 "전체" 칩만 덩그러니 남는 걸 막는다).
 */
function ChipRow({ label, allHref, active, items }: Readonly<{
  label: string;
  allHref: string;
  active?: string;
  items: ReadonlyArray<{ name: string; cnt: number | null; href: string }>;
}>) {
  // 🔴 고른 값이 목록에 없어도 칩을 남긴다. 칩은 "지금 조건에서 공고가 있는 것"만 그리는데,
  //    다른 축을 좁히다 보면 이미 고른 값이 0건이 될 수 있다. 그때 칩이 사라지면 **해제할 방법이
  //    없어져** 빈 화면에 갇힌다(주소를 손으로 고치는 수밖에 없다).
  // 고른 값이 이 조건에서 0건이면 목록에 없다. 그래도 "지금 이게 걸려 있다"는 건 보여야 한다.
  const orphan = active && !items.some((i) => i.name === active) ? active : null;
  if (items.length === 0 && !orphan) return null;
  return (
    <nav aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
      <a href={allHref} aria-current={!active ? "page" : undefined} className={chip(!active)}>{label} 전체</a>
      {/* 0건이 된 선택값 — 링크로 두면 눌러도 맨 위로 튀기만 한다(href="#"). 상태 표시로만 그리고,
          해제는 왼쪽 "{label} 전체" 가 맡는다. */}
      {orphan && (
        <span aria-current="page" className={`${chip(true)} cursor-default`}>
          {/* 내부 센티넬을 그대로 그리면 "_none" 이 화면에 뜬다. */}
          {orphan === UNSET ? `${label} 미지정` : orphan}
          <span className="ml-1 text-xs text-teal-50">0</span>
        </span>
      )}
      {items.map((it) => (
        <a key={it.name} href={it.href} aria-current={active === it.name ? "page" : undefined} className={chip(active === it.name)}>
          {/* 값이 없는 몫. 이걸 숨기면 칩 합이 결과 수와 안 맞아 화면이 스스로 모순된다
              (치과 9건인데 진료과 합이 2였다 — 오너 지적 2026-07-29). */}
          {it.name === UNSET ? `${label} 미지정` : it.name}
          {/* opacity 로 흐리면 활성 칩에서 대비 2.6:1 로 떨어져 AA(4.5:1) 미달이다 → 고정 색을 쓴다. */}
          {it.cnt != null && (
            <span className={`ml-1 text-xs ${active === it.name ? "text-teal-50" : "text-slate-500"}`}>{it.cnt}</span>
          )}
        </a>
      ))}
    </nav>
  );
}

const JOBS_TITLE = "간호사 채용공고 검색 — 널스넷";
const JOBS_DESC = "간호사·간호조무사 채용공고를 지역·진료과·근무형태로 검색하세요. 전국 병원 채용정보를 한곳에서.";

/**
 * 검색결과 화면(?q=·?l=·필터)은 색인하지 않는다.
 * canonical 은 "힌트"일 뿐이라 구글이 무시하고 각 조합을 따로 색인할 수 있는데,
 * 검색결과 안의 검색결과(search-within-search)는 얇은 페이지로 취급돼 사이트 평가를 깎는다.
 * 색인 대상은 목록 본체(/jobs)와 개별 공고(/jobs/[id])뿐이다.
 */
export async function generateMetadata({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | undefined>> }>): Promise<Metadata> {
  const sp = await searchParams;
  const filtered = !!(sp.q || sp.l || sp.sido || sp.sigungu || sp.spec || sp.fac || sp.cat || sp.et || sp.page);
  return {
    title: JOBS_TITLE,
    description: JOBS_DESC,
    alternates: { canonical: "/jobs" },
    openGraph: { type: "website", locale: "ko_KR", siteName: "널스넷", url: "/jobs", title: JOBS_TITLE, description: JOBS_DESC },
    ...(filtered ? { robots: { index: false } } : {}),
  };
}

export default async function JobsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ q?: string; l?: string; sido?: string; sigungu?: string; j?: string; saved?: string; spec?: string; fac?: string; cat?: string; et?: string; page?: string }> }>) {
  const { q, l, sido, sigungu, j, saved, spec, fac, cat, et, page } = await searchParams;
  // 예전 마스터-디테일의 ?j= 링크(저장·지원 내역 등)는 단독 상세로 넘긴다.
  if (j) redirect(`/jobs/${encodeURIComponent(j)}`);

  const kw = (q ?? "").trim();
  const loc = (l ?? "").trim();
  const sd = (sido ?? "").trim();
  // 시군구는 시도에 종속 — 시도 없으면 무시(서버 필터와 같은 계약).
  const sg = sd ? (sigungu ?? "").trim() : "";
  const pageNum = Math.max(1, Number(page) || 1);

  const [{ jobs, total }, sidos, sigungus, facets, profile] = await Promise.all([
    getJobs(kw, loc, { sido: sd, sigungu: sg, specialty: spec, facilityType: fac, jobCategory: cat, employmentType: et }, pageNum),
    // 지역도 칩과 같은 조건으로 센다 — 한 화면에서 기준이 갈리면 안 된다.
    getJobSidoList({ specialty: spec, facilityType: fac, jobCategory: cat, employmentType: et, keyword: kw, location: loc }),
    getJobSigunguList(sd, { specialty: spec, facilityType: fac, jobCategory: cat, employmentType: et, keyword: kw, location: loc }), // 시도 미선택이면 즉시 [](비용 0)
    // 칩은 **지금 걸린 필터 안에서** 센다 — 안 그러면 기관 종별을 골라도 그 안에 0건인
    // 진료과 칩이 그대로 떠서 눌러도 빈 화면이 나온다.
    getJobFacets({ sido: sd, sigungu: sg, specialty: spec, facilityType: fac, jobCategory: cat, employmentType: et, keyword: kw, location: loc }),
    getMyProfile(),
  ]);
  const now = nowMs();
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const savedSet = profile ? await getSavedJobIds(jobs.map((x) => x.id)) : new Set<string>();

  // 검색 조건 유지 URL — 목록 이동(href)·카드→상세(detailHref)가 같은 검색결과를 따라간다. 직렬화는 jobFilterQs 한 곳.
  const base = { q: kw, l: loc, sido: sd, sigungu: sg, spec, fac, cat, et };
  // URL 센티넬(_none)은 내부 코드다 — 화면에는 절대 그대로 내보내지 않는다.
  const human = (label: string, v?: string) => (v === UNSET ? `${label} 미지정` : v);
  const href = (toPage?: number) => { const s = jobFilterQs(base, toPage); return "/jobs" + (s ? `?${s}` : ""); };
  const detailHref = (jobId: string) => { const s = jobFilterQs(base, pageNum); return `/jobs/${jobId}` + (s ? `?${s}` : ""); };
  // 칩 href — 네 축(진료과·기관종별·직종·근무형태)은 서로 독립이라 나머지를 유지하고 자기 값만 바꾼다.
  // 지역·키워드도 유지하고 페이지만 리셋한다(2페이지에서 칩을 누르면 없는 페이지로 가버린다).
  const axisHref = (patch: Partial<typeof base>) => {
    const s = jobFilterQs({ ...base, ...patch });
    return "/jobs" + (s ? `?${s}` : "");
  };

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

      {/* 칩 세 줄 — 서로 독립이라 겹쳐 걸 수 있다("의원의 간호조무직 정규직").
          기관종별·직종은 **공고가 있는 것만** 많은 순으로 그린다(getJobFacets).
          고정 목록을 뿌리면 0건인 칩을 누른 사용자가 빈 화면을 만난다.

          🔴 진료과 칩은 뺐다(오너 결정 2026-07-29). 워크넷 공고는 진료과가 원래 없는 게
          정상이라 전체의 83%가 '미지정' 이었고, 칩 26개 중 대부분이 한 자릿수라 줄만 길었다.
          대신 **검색어가 진료과를 덮는다** — getJobs 의 키워드가 specialty 컬럼도 보므로
          "내과" 로 검색하면 칩보다 넓게 잡힌다(실측: 칩 19건 vs 검색 24건, 수술실 20 vs 29).
          specialty 컬럼·필터·등록 폼은 그대로 둔다 — 저장된 링크(?spec=)도 계속 동작한다. */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1280px] space-y-2 px-4 py-3">
          {/* 기관 종별을 맨 위에 둔다(오너 지시 2026-07-29) — 요양원·병원·의원 중 어디서 일할지가
              진료과보다 먼저 갈리고, 이걸 고르면 아래 진료과 칩이 그 안에 있는 것만 남는다. */}
          <ChipRow label="기관 종별" allHref={axisHref({ fac: "" })} active={fac}
            items={facets.facilities.map((d) => ({ ...d, href: axisHref({ fac: d.name }) }))} />
          <ChipRow label="직종" allHref={axisHref({ cat: "" })} active={cat}
            items={facets.categories.map((d) => ({ ...d, href: axisHref({ cat: d.name }) }))} />
          {/* 근무형태는 고정 목록 그대로 — 값이 4개뿐이고 전부 실제로 쓰인다. */}
          <ChipRow label="근무형태" allHref={axisHref({ et: "" })} active={et}
            items={EMPLOYMENT_TYPES.map((t) => ({ name: t, cnt: null, href: axisHref({ et: t }) }))} />
        </div>
      </div>

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-5">
        <h1 className="sr-only">간호사 채용공고 검색</h1>
        <p className="text-sm text-slate-600">
          <a href={profile ? "/mypage/resume" : "/signup"} className="font-semibold text-teal-700 hover:underline">
            {profile ? "내 이력서 관리" : "이력서를 등록하세요"}
          </a> — 손쉽게 지원하세요
        </p>
        {/* 지금 걸린 필터를 한 줄로 모아 보여준다. 축이 넷이라 따로 풀려면 네 번 눌러야 했다. */}
        {/* 🔴 loc(홈 히어로의 지역칸 ?l=)도 반드시 센다. 이게 빠져 있어서 "성남"으로 검색해 들어온
            사람은 결과가 걸러지는데도 조건 줄이 아예 안 뜨고, 지역 드롭다운은 '전체'로 보이며,
            '전체 초기화' 버튼조차 나타나지 않았다. 게다가 JobSearchBar 가 기존 쿼리를 그대로
            복사해 옮기므로 그 보이지 않는 조건이 이후 모든 칩 클릭에 계속 따라붙었다. */}
        {(spec || fac || cat || et || sd || kw || loc) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-400">적용된 조건</span>
            {[
              kw && `"${kw}"`,
              sd && (sg ? `${sd} ${sg}` : sd),
              // 정규화 지역(sido)을 이미 고른 경우엔 같은 말을 두 번 하지 않는다.
              !sd && loc && `지역 "${loc}"`,
              human("기관 종별", fac), human("진료과", spec), human("직종", cat), et,
            ].filter(Boolean).map((v) => (
              <span key={String(v)} className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">{v}</span>
            ))}
            {/* 칩들은 쿼리가 붙어 <a> 로 두지만, 이건 페이지 자체(/jobs)로 가는 링크라 Link 를 쓴다. */}
            <Link href="/jobs" className="ml-1 min-h-11 self-center font-semibold text-teal-700 underline-offset-2 hover:underline">
              전체 초기화
            </Link>
          </div>
        )}

        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-500">
            {human("진료과", spec) || human("기관 종별", fac) || kw || "간호사"} 채용공고 <span className="font-semibold text-slate-800">{total.toLocaleString()}건</span>{sd ? `, ${sg || sd}` : ""} · 정렬: 연관성{totalPages > 1 ? ` · ${pageNum}/${totalPages}p` : ""}
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
            검색이 저장되었습니다. <a href="/mypage/alerts" className="font-semibold underline">저장한 검색</a>에서 다시 찾을 수 있습니다.
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
