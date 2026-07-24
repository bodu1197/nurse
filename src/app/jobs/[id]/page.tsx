import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JobDetail from "@/components/JobDetail";
import { getPublicJob, getSavedJobIds, getNearbyJobs, regionOf, type JobRow } from "@/lib/data/jobs";
import { getMyProfile } from "@/lib/data/user";
import { hasApplied } from "@/lib/data/applications";
import { daysAgo, nowMs, listingEnd } from "@/lib/date";
import { isOpenToSeekers } from "@/lib/jobState";

// 시드 데이터 단계 — 목록(/jobs)과 동일하게 noindex.
// 실데이터를 공개할 때 이 한 줄만 지우면 제목·설명·canonical·JobPosting이 이미 준비돼 있다.
const NOINDEX = { index: false } as const;

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
  if (!job) return { title: "공고를 찾을 수 없습니다 — 널스넷", robots: NOINDEX };
  const description = jobSummary(job).slice(0, 150);
  return {
    title: `${job.title} — ${job.hospital?.name ?? job.company_name ?? "병원"} | 널스넷`,
    description,
    alternates: { canonical: `/jobs/${job.id}` },
    // 자식이 openGraph를 선언하면 루트 값이 통째로 대체된다 → siteName·locale을 여기서 다시 준다.
    openGraph: { type: "website", siteName: "널스넷", locale: "ko_KR", title: job.title, description, url: `/jobs/${job.id}` },
    robots: NOINDEX,
  };
}

// 공고 단독 상세. 저장한 공고·지원 내역에서 오는 링크는 전부 이리로 온다.
// 목록(/jobs)은 한 번에 20건만 가져오므로, 그 안에 없는 공고는 목록 화면으로는 절대 열 수 없다.
export default async function JobPage({
  params,
  searchParams,
}: Readonly<{ params: Promise<{ id: string }>; searchParams: Promise<{ apply?: string }> }>) {
  const [{ id }, { apply }] = await Promise.all([params, searchParams]);
  const now = nowMs();
  const [job, profile] = await Promise.all([getLiveJob(id, now), getMyProfile()]);
  // 없거나 노출이 끝난 공고는 200 안내가 아니라 404로 응답한다(안내 화면은 not-found.tsx).
  if (!job) notFound();

  // 서로 의존하지 않는 조회는 함께 보낸다(직렬로 두면 상세 화면이 왕복 한 번만큼 늦어진다).
  const [applied, savedIds, near] = await Promise.all([
    profile?.role === "nurse" ? hasApplied(job.id) : Promise.resolve(false),
    profile ? getSavedJobIds([job.id]) : Promise.resolve(new Set<string>()),
    getNearbyJobs(job.location, job.id), // 좌측 사이드바(같은 지역 우선, 없으면 최근)
  ]);
  const nearby = near.jobs;
  // 사이드바 제목: 같은 지역이면 시/군명("성남시 채용공고"), 폴백이면 "최근 채용공고".
  const regionLabel = regionOf(job.location).split(" ")[1] ?? regionOf(job.location);
  const sidebarTitle = near.sameRegion && regionLabel ? `${regionLabel} 채용공고` : "최근 채용공고";

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
    validThrough: job.source === "direct" ? new Date(listingEnd(job, now)).toISOString() : job.deadline ?? undefined,
    employmentType: job.employment_type ? EMPLOYMENT_TYPE[job.employment_type] : undefined,
    hiringOrganization: { "@type": "Organization", name: job.hospital?.name ?? job.company_name ?? "병원" },
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
      <Link href="/jobs" className="mb-3 inline-block text-sm text-teal-700 hover:underline">← 채용공고 목록</Link>

      {/* 같은 지역 공고가 있을 때만 2열(좌측 사이드바). 없으면 상세만 읽기 좋은 폭으로. */}
      <div className={nearby.length > 0 ? "lg:grid lg:grid-cols-[minmax(0,320px)_1fr] lg:items-start lg:gap-6" : "mx-auto max-w-3xl"}>
        {/* 상세 — 모바일에선 먼저, 데스크톱에선 오른쪽(넓은 화면서 본문폭 과대 방지) */}
        <div className="lg:col-start-2 lg:row-start-1 lg:max-w-3xl">
          <JobDetail
            job={job}
            profile={profile}
            applied={applied}
            saved={savedIds.has(job.id)}
            selfHref={`/jobs/${job.id}`}
            applyError={apply}
            asH1
            now={now}
          />
        </div>

        {/* 같은 지역 공고 — 모바일에선 상세 아래, 데스크톱에선 왼쪽 사이드바 */}
        {nearby.length > 0 && (
          <aside aria-label={sidebarTitle} className="mt-10 lg:col-start-1 lg:row-start-1 lg:mt-0">
            <h2 className="mb-3 text-sm font-bold text-slate-900">
              {sidebarTitle} <span className="font-normal text-slate-400">({nearby.length})</span>
            </h2>
            <ul className="space-y-2">
              {nearby.map((n) => (
                <li key={n.id}>
                  <a href={`/jobs/${n.id}`} className="block rounded-xl border border-slate-200 bg-white p-3 transition hover:border-teal-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
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
          </aside>
        )}
      </div>
    </main>
  );
}
