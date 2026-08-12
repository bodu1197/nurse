import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JobDetail from "@/components/JobDetail";
import { getPublicJob, getSavedJobIds, getNearbyJobs, getJobs, getMyHospitalIds, jobFilterQs, regionOf, PER_PAGE, type JobRow } from "@/lib/data/jobs";
import { getMyProfile } from "@/lib/data/user";
import { getCommunityAccess } from "@/lib/data/community";
import { myApplication } from "@/lib/data/applications";
import { daysAgo, nowMs, listingEnd } from "@/lib/date";
import { socialMeta } from "@/lib/constants";
import { isOpenToSeekers } from "@/lib/jobState";

// 노출이 끝난 공고(직접등록 기간 만료 · 마감일 경과)는 없는 것과 같이 다룬다.
// 목록과 같은 규칙(isOpenToSeekers)을 써야 "목록엔 없는데 링크로는 열리는" 공고가 안 생기고,
// 메타데이터와 본문이 같은 판정을 써야 한쪽만 살아 있는 상태가 안 생긴다.
async function getLiveJob(id: string, now: number): Promise<JobRow | null> {
  const job = await getPublicJob(id); // cache() — 두 번 불러도 쿼리는 1회
  if (!job) return null;
  return isOpenToSeekers(job, now) ? job : null;
}

// 공고 한 줄 요약 — meta description과 구조화 데이터가 같은 문장을 쓴다.
const jobSummary = (job: JobRow) =>
  [job.hospital?.name ?? job.company_name, job.location, job.employment_type, job.salary_text].filter(Boolean).join(" · ");

// 검색엔진이 아는 고용형태 값. 화면 라벨(정규직 등)을 그대로 내면 인식하지 못한다.
const EMPLOYMENT_TYPE: Record<string, string> = {
  정규직: "FULL_TIME",
  계약직: "CONTRACTOR",
  파트타임: "PART_TIME",
  인턴: "INTERN",
};

export async function generateMetadata({ params }: Readonly<{ params: Promise<{ id: string }> }>): Promise<Metadata> {
  const { id } = await params;
  const job = await getLiveJob(id, nowMs());
  // 없거나 노출이 끝난 공고: 본문은 404 로 응답하고 메타는 색인에서 빼둔다.
  if (!job) return { title: "공고를 찾을 수 없습니다 — 널스넷", robots: { index: false } };
  const description = jobSummary(job).slice(0, 150);
  return {
    title: `${job.title} — ${job.hospital?.name ?? job.company_name ?? "병원"} | 널스넷`,
    description,
    alternates: { canonical: `/jobs/${job.id}` },
    // 자식이 openGraph를 선언하면 루트 값이 통째로 대체된다 — siteName·locale 뿐 아니라
    // opengraph-image.tsx 가 넣어 주던 images 까지 사라진다. socialMeta 가 그 셋을 한 번에 낸다.
    ...socialMeta({ url: `/jobs/${job.id}`, title: job.title, description }),
  };
}

// 공고 단독 상세. 저장한 공고·지원 내역에서 오는 링크는 전부 이리로 온다.
// 목록(/jobs)은 한 번에 20건만 가져오므로, 그 안에 없는 공고는 목록 화면으로는 절대 열 수 없다.
export default async function JobPage({
  params,
  searchParams,
}: Readonly<{ params: Promise<{ id: string }>; searchParams: Promise<{ apply?: string; ok?: string; q?: string; l?: string; sido?: string; sigungu?: string; spec?: string; fac?: string; cat?: string; et?: string; page?: string }> }>) {
  const [{ id }, { apply, ok, q, l, sido, sigungu, spec, fac, cat, et, page }] = await Promise.all([params, searchParams]);
  // 시군구는 시도에 종속 — 시도 없으면 무시(목록과 같은 계약).
  const sg = sido ? sigungu : undefined;
  const now = nowMs();
  const [job, profile] = await Promise.all([getLiveJob(id, now), getMyProfile()]);
  // 없거나 노출이 끝난 공고는 200 안내가 아니라 404로 응답한다(안내 화면은 not-found.tsx).
  if (!job) notFound();

  // 목록에서 필터를 걸고 들어왔으면(spec·et 등) 그 검색결과를 사이드바·닫기 링크로 그대로 이어간다.
  // 🔴 fac(기관 종별)·cat(직종)도 같이 본다 — 목록은 이 두 칩을 실어 보내는데(jobFilterQs) 여기가
  // 받지 않아서, '요양병원' 칩 하나로 좁힌 사람이 공고를 열자마자 사이드바가 '최근 공고'로
  // 바뀌고 '목록으로'를 누르면 필터가 풀린 전체 목록으로 돌아갔다.
  const fromSearch = !!(q || l || sido || spec || fac || cat || et);
  const pageNum = Math.max(1, Number(page) || 1);
  // 검색 컨텍스트 쿼리스트링(페이지 지정 가능) — 사이드바 카드·페이지네이션·닫기 공용.
  // 직렬화 규칙은 목록과 같은 jobFilterQs 한 곳을 쓴다(필터 추가 시 한쪽만 고쳐 끊기는 것 방지).
  const qsFor = (toPage: number) => jobFilterQs({ q, l, sido, sigungu: sg, spec, fac, cat, et }, toPage);
  const searchQs = qsFor(pageNum);
  // 닫기(X)·목록 링크가 돌아갈 곳: 필터가 있으면 그 검색결과, 없으면 목록 첫 화면.
  const backHref = "/jobs" + (searchQs ? `?${searchQs}` : "");
  // 사이드바 카드도 같은 검색 컨텍스트(현재 페이지)를 달고 이동해야 필터가 끊기지 않는다.
  const sideHref = (nid: string) => `/jobs/${nid}` + (fromSearch && searchQs ? `?${searchQs}` : "");
  // 사이드바 페이지네이션 — 같은 상세에 머물며 검색결과 페이지만 바꾼다.
  const pageHref = (toPage: number) => { const s = qsFor(toPage); return `/jobs/${id}` + (s ? `?${s}` : ""); };

  // 서로 의존하지 않는 조회는 함께 보낸다(직렬로 두면 상세 화면이 왕복 한 번만큼 늦어진다).
  // 외부 수집 공고는 **이력서를 등록한 간호사 회원**만 원본 사이트로 나갈 수 있다(오너 확정 2026-07-30).
  // 그 판정에만 필요하므로 해당 조건에서만 조회한다(직접등록 공고에는 헛왕복을 만들지 않는다).
  const needsResumeCheck = job.source !== "direct" && profile?.role === "nurse";
  const [application, savedIds, side, resumeOwned, myHospitalIds] = await Promise.all([
    profile?.role === "nurse" ? myApplication(job.id) : Promise.resolve(null),
    profile ? getSavedJobIds([job.id]) : Promise.resolve(new Set<string>()),
    // 필터로 들어왔으면 같은 검색결과(전체 개수 포함)를, 아니면 같은 지역(없으면 최근) 공고를 좌측 사이드바로.
    fromSearch
      ? getJobs(q ?? "", l ?? "", { sido, sigungu: sg, specialty: spec, facilityType: fac, jobCategory: cat, employmentType: et }, pageNum, true)
          .then((r) => ({ jobs: r.jobs.filter((x) => x.id !== id), sameRegion: false, total: r.total }))
      : getNearbyJobs(job.location, job.id).then((r) => ({ ...r, total: 0 })),
    needsResumeCheck ? getCommunityAccess().then((a) => a.ok) : Promise.resolve(false),
    // 🔴 병원이 **자기 공고**를 열었을 때 "간편지원은 간호사 회원만 가능합니다" 를 띄우면 안 된다.
    //    자기가 낸 광고를 보러 온 사람에게 자격 미달을 통보하는 꼴이다(오너 지적 2026-08-04).
    profile?.role === "hospital" ? getMyHospitalIds() : Promise.resolve([] as string[]),
  ]);
  const isMyJob = !!job.hospital_id && myHospitalIds.includes(job.hospital_id);
  const nearby = side.jobs;
  const totalPages = Math.max(1, Math.ceil(side.total / PER_PAGE));
  // 사이드바 제목: 검색결과면 "검색 결과", 같은 지역이면 시/군명("성남시 채용공고"), 폴백이면 "최근 채용공고".
  const regionLabel = regionOf(job.location).split(" ")[1] ?? regionOf(job.location);
  const sidebarTitle = fromSearch ? "검색 결과" : side.sameRegion && regionLabel ? `${regionLabel} 채용공고` : "최근 채용공고";
  const sidebarCount = fromSearch ? side.total : nearby.length;

  // 검색엔진용 채용공고 구조화 데이터 — 목록 옆 패널이 아니라 이 단독 라우트에서만 낸다
  // (한 페이지에 JobPosting이 둘이면 어느 공고의 페이지인지 알 수 없다).
  const [region, ...rest] = (job.location ?? "").split(" ");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    // 상세 설명이 없는 수집 공고는 제목만 되풀이하지 않고 요약(병원·지역·고용형태·급여)을 쓴다.
    description: job.description ?? jobSummary(job),
    datePosted: job.posted_at,
    validThrough: job.source === "direct" ? new Date(listingEnd(job)).toISOString() : job.deadline ?? undefined,
    employmentType: job.employment_type ? EMPLOYMENT_TYPE[job.employment_type] : undefined,
    hiringOrganization: { "@type": "Organization", name: job.hospital?.name ?? job.company_name ?? "병원" },
    // 급여는 **금액이 적힌 공고만** 낸다. "회사내규에 따름" 같은 문구를 구조화 데이터에 넣으면
    // 검색엔진이 급여를 못 읽고 리치 결과에서 오히려 감점된다.
    ...(job.salary_text && /\d/.test(job.salary_text)
      ? { baseSalary: { "@type": "MonetaryAmount", currency: "KRW", value: { "@type": "QuantitativeValue", value: job.salary_text } } }
      : {}),
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressRegion: region || undefined,
        addressLocality: rest.join(" ") || undefined,
        addressCountry: "KR",
      },
    },
  };

  return (
    <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-5">
      {/* 공고 제목·상세는 병원이 입력하거나 외부에서 수집한 값이다.
          JSON 안의 "</script>"가 태그를 닫아 버리지 않도록 '<'를 이스케이프한다. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <div className="mb-3 flex items-center justify-between gap-3">
        <Link href={backHref} className="rounded text-sm text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">← {fromSearch ? "검색 결과로" : "채용공고 목록"}</Link>
        {/* 닫기 — 들어온 검색결과(필터 유지)로 되돌아간다. 히트영역 44px(모바일 터치 최소). */}
        <Link href={backHref} aria-label="닫기" className="grid h-11 w-11 place-items-center rounded-full text-lg leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">✕</Link>
      </div>

      {/* 사이드바에 보일 게 있을 때만 2열. 없으면 상세만 읽기 좋은 폭으로. */}
      <div className={fromSearch || nearby.length > 0 ? "lg:grid lg:grid-cols-[minmax(0,320px)_1fr] lg:items-start lg:gap-6" : "mx-auto max-w-3xl"}>
        {/* 상세 — 모바일에선 먼저, 데스크톱에선 오른쪽(넓은 화면서 본문폭 과대 방지) */}
        <div className="lg:col-start-2 lg:row-start-1 lg:max-w-3xl">
          <JobDetail
            job={job}
            profile={profile ? { displayName: profile.displayName, role: profile.role, email: profile.email } : null}
            application={application}
            saved={savedIds.has(job.id)}
            selfHref={`/jobs/${job.id}`}
            applyError={apply}
            cancelled={ok === "cancel"}
            hasResume={resumeOwned}
            isMyJob={isMyJob}
            asH1
          />
        </div>

        {/* 같은 지역 공고 — 모바일에선 상세 아래, 데스크톱에선 왼쪽 사이드바 */}
        {/* 결과 개수로 사이드바 전체를 가리지 않는다 — 마지막 페이지에 이 공고 하나만 남으면
            제목·건수·페이저까지 사라져 이전 페이지로 돌아갈 길이 없어진다(인재 상세와 같은 규칙). */}
        {(fromSearch || nearby.length > 0) && (
          <aside aria-label={sidebarTitle} className="mt-10 lg:col-start-1 lg:row-start-1 lg:mt-0">
            <h2 className="mb-3 text-sm font-bold text-slate-900">
              {sidebarTitle} <span className="font-normal text-slate-400">({sidebarCount})</span>
              {fromSearch && totalPages > 1 && <span className="ml-1 font-normal text-slate-400">· {pageNum}/{totalPages}p</span>}
            </h2>
            {nearby.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-500">
                이 페이지에 표시할 다른 공고가 없습니다.
              </p>
            )}
            <ul className="space-y-2">
              {nearby.map((n) => (
                <li key={n.id}>
                  <a href={sideHref(n.id)} className="block rounded-xl border border-slate-200 bg-white p-3 transition hover:border-teal-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
                    <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{n.title}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{n.hospital?.name ?? n.company_name ?? "병원 미상"}{n.location ? ` · ${n.location}` : ""}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs">
                      {n.salary_text && <span className="font-medium text-teal-700">{n.salary_text}</span>}
                      <span className="text-slate-400">{daysAgo(n.posted_at)}일 전</span>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
            {/* 검색결과 페이지네이션 — 같은 상세에 머물며 사이드바 페이지만 넘긴다. */}
            {fromSearch && totalPages > 1 && (
              <nav aria-label="검색 결과 페이지" className="mt-4 flex items-center justify-between gap-2 text-sm">
                {pageNum > 1 ? <a href={pageHref(pageNum - 1)} className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 px-3 text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">← 이전</a> : <span />}
                <span className="text-slate-500" aria-current="page">{pageNum} / {totalPages}</span>
                {pageNum < totalPages ? <a href={pageHref(pageNum + 1)} className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 px-3 text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">다음 →</a> : <span />}
              </nav>
            )}
          </aside>
        )}
      </div>
    </main>
  );
}
