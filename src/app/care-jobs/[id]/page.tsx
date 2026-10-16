import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { headers } from "next/headers";
import { userAgent } from "next/server";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import { ContactBox } from "@/components/JobDetail";
import { getMyProfile } from "@/lib/data/user";
import { getCareJob, withCareDetail, type CareJobDetail } from "@/lib/data/careJobs";
import { isCrawlerUa, isWorknetUrl } from "@/lib/careSync";
import { CARE_JOBS_MENU, socialMeta } from "@/lib/constants";

/**
 * 🧓 요양·간병 공고 상세(워크넷 수집분) — 오너 지시 2026-10-16 "카드를 클릭하면 페이지가 나와야지 다른 곳으로 보내면 안 되지".
 *
 * 간호 공고 상세(/jobs/[id] + components/JobDetail)와 같은 생김새로 두되 그 부품을 통째로 쓰지는 않는다 — JobDetail 은
 * jobs 행(저장·간편지원·지원 취소 폼)을 전제한다. 수집분은 저장·간편지원이 없고(표가 달라 saved_jobs·applications 가
 * 가리킬 수 없다) 지원은 워크넷 원문에서 한다. 공용 조각(채용 문의 ContactBox)만 같이 쓴다.
 * 기관이 직접 올린 요양·간병 공고는 jobs 에 있어 /jobs/[id] 가 그대로 맡는다.
 *
 * 본문·연락처는 **열릴 때** 워크넷 상세 API 로 받아 저장한다(lib/data/careJobs withCareDetail). 그 왕복(보통 1초, 최대 5초)은
 * 제목·기관·급여를 먼저 내보낸 뒤 Suspense 로 뒤따라 온다 — 첫 바이트가 워크넷을 기다리지 않는다.
 * maxDuration — 그 왕복 + DB 두 번이 Vercel 기본 예산보다 길 수 있어 넉넉히 준다(mypage/verify 와 같은 자리).
 */
export const maxDuration = 30;

const summary = (job: CareJobDetail) =>
  [job.company_name ?? "기관 미상", job.location, job.employment_type, job.salary_text].filter(Boolean).join(" · ");

export async function generateMetadata({ params }: Readonly<{ params: Promise<{ id: string }> }>): Promise<Metadata> {
  const { id } = await params;
  const job = await getCareJob(id); // cache() — 본문과 같은 조회
  if (!job) return { title: "공고를 찾을 수 없습니다 — 널스넷", robots: { index: false } };
  const description = summary(job).slice(0, 150);
  return {
    title: `${job.title} — ${job.company_name ?? "기관 미상"} | 널스넷`,
    description,
    // 🔴 색인하지 않는다. 워크넷 원문의 사본이 1만 장이다 — 얇은·중복 페이지 1만 개를 색인시키면 사이트 평가가 깎인다
    //    (dolpagu 가 그걸로 1년간 색인 0 이었다). 색인 대상은 목록(/care-jobs) 하나. canonical 은 noindex 와 함께 내지 않는다
    //    (jobs/page.tsx 주석). 기관 직접 등록분(/jobs/[id])은 종전대로 색인·사이트맵에 실린다.
    robots: { index: false },
    // 공유 카드는 낸다 — 안 내면 루트(홈)의 og:title·og:url 을 물려받아 카카오톡에서 홈 카드가 뜬다. noindex 와 무관하다.
    ...socialMeta({ url: `${CARE_JOBS_MENU.href}/${job.external_id}`, title: job.title, description }),
  };
}

export default async function CareJobPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  const [job, profile, h] = await Promise.all([getCareJob(id), getMyProfile(), headers()]);
  // 워크넷에서 내려가 지워진 공고 — 200 안내가 아니라 404(/jobs/[id] 와 같은 규칙). 화면은 이 폴더의 not-found.tsx.
  if (!job) notFound();

  const selfHref = `${CARE_JOBS_MENU.href}/${job.external_id}`;
  const loginHref = `/login?next=${encodeURIComponent(selfHref)}`;
  // 원문 링크는 수집값이라 스킴·도메인을 믿지 않는다 — 크론이 거른 것(isWorknetUrl)을 여기서 한 번 더 거른다.
  const external = isWorknetUrl(job.external_url) ? job.external_url : null;
  // 봇에게는 워크넷 상세를 묻지 않는다(withCareDetail 주석) — 저장된 값만 그린다. Next 의 isBot 목록에 없는
  // 네이버(Yeti)·다음·카카오 미리보기·AI 크롤러는 isCrawlerUa 가 잡는다.
  const ua = userAgent({ headers: h });
  const isBot = ua.isBot || isCrawlerUa(ua.ua);

  return (
    <>
      <SiteHeader user={profile ? { displayName: profile.displayName } : null} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Link href={CARE_JOBS_MENU.href} className="rounded text-sm text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">← {CARE_JOBS_MENU.label} 목록</Link>
          {/* 닫기 — 히트영역 44px(모바일 터치 최소), /jobs/[id] 와 같은 자리. */}
          <Link href={CARE_JOBS_MENU.href} aria-label="닫기" className="grid h-11 w-11 place-items-center rounded-full text-lg leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">✕</Link>
        </div>

        <article className="rounded-lg border border-slate-200 bg-white p-6">
          <h1 className="text-2xl font-bold leading-snug text-slate-900">{job.title}</h1>
          <div className="mt-2 font-medium text-slate-700">{job.company_name ?? "기관 미상"}</div>
          {job.location && <div className="mt-1 text-slate-600">{job.location}</div>}
          <div className="text-slate-600">{[job.employment_type, job.salary_text].filter(Boolean).join(" · ")}</div>

          {/* 지원은 워크넷 원문에서 — 접수를 우리가 하지 않는 공고에 지원 버튼을 보이는 것은 거짓말이다(JobDetail 과 같은 원칙).
              간호 수집 공고의 "이력서 등록 회원만 원문으로" 게이트는 걸지 않는다 — 요양·간병 구직자에게 간호 이력서를 요구할 수 없다. */}
          <div className="mt-4">
            {external ? (
              <Button href={external} target="_blank" rel="noopener noreferrer" size="md">
                원본에서 지원하기
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M7 17L17 7M7 7h10v10" /></svg>
                <span className="sr-only">(워크넷, 새 창)</span>
              </Button>
            ) : (
              <p className="text-sm text-slate-500">원본 공고 링크가 확인되지 않았습니다. 이 공고는 지금 지원 경로를 안내할 수 없습니다.</p>
            )}
          </div>

          <Suspense fallback={<p role="status" className="mt-5 text-sm text-slate-500">상세 내용을 불러오는 중입니다…</p>}>
            <CareJobBody row={job} loggedIn={!!profile} loginHref={loginHref} allowFetch={!isBot} hasLink={!!external} />
          </Suspense>
        </article>
      </main>
    </>
  );
}

/** 느린 부분(워크넷 상세 왕복)만 따로 — 제목 등은 이미 나간 뒤 이 블록이 뒤따라 온다. */
async function CareJobBody({ row, loggedIn, loginHref, allowFetch, hasLink }: Readonly<{
  row: CareJobDetail; loggedIn: boolean; loginHref: string; allowFetch: boolean; hasLink: boolean;
}>) {
  const job = await withCareDetail(row, allowFetch);
  return (
    <>
      {/* 담당자 연락처 — 로그인한 사람에게만(간호 공고 상세와 같은 부품·같은 등급). */}
      <ContactBox name={job.manager_name} phone={job.manager_phone} revealed={loggedIn} loginHref={loginHref} />

      <hr className="my-5 border-slate-100" />

      <h2 className="font-bold text-slate-900">채용 상세 정보</h2>
      <dl className="mt-3 space-y-2 text-sm">
        {job.employment_type && (<div><dt className="text-slate-500">고용형태</dt><dd className="mt-0.5"><span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">{job.employment_type}</span></dd></div>)}
        {/* 급여는 항상 — 카드가 「급여 협의」로 보여 준 항목이 눌러 들어가면 사라지면 안 된다(JobDetail 과 같은 규칙). */}
        <div><dt className="text-slate-500">급여</dt><dd className="mt-0.5 font-medium text-slate-800">{job.salary_text ?? "급여 협의"}</dd></div>
        {job.shift_type && (<div><dt className="text-slate-500">근무시간</dt><dd className="mt-0.5 text-slate-800">{job.shift_type}</dd></div>)}
        {job.recruit_count ? (<div><dt className="text-slate-500">모집인원</dt><dd className="mt-0.5 text-slate-800">{job.recruit_count}명</dd></div>) : null}
        <div><dt className="text-slate-500">마감일</dt><dd className="mt-0.5 text-lg font-bold text-red-600">{job.deadline ? `${job.deadline.replace(/-/g, ".")} 마감` : "채용 시까지"}</dd></div>
      </dl>

      {job.location && (
        <>
          <h2 className="mt-5 font-bold text-slate-900">지역</h2>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-700">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-500" aria-hidden><path d="M12 21s-7-6.3-7-11a7 7 0 1114 0c0 4.7-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
            {job.location}
          </p>
        </>
      )}

      <h2 className="mt-5 font-bold text-slate-900">상세 직무 내용</h2>
      {job.description ? (
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{job.description}</p>
      ) : (
        /* 본문이 없으면 없다고 말한다 — 빈 화면은 "정보가 이게 다인가"로 읽힌다(JobDetail 과 같은 규칙).
           워크넷이 본문을 안 줬거나(이미지 공고) 상세 호출이 실패한 경우다 — 후자는 하루 뒤 다시 받는다(needsCareDetail). */
        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2.5 text-sm leading-relaxed text-slate-600">
          {hasLink
            ? "이 공고는 워크넷 원문에서 상세를 확인해야 합니다. 위 「원본에서 지원하기」로 이동할 수 있습니다."
            : "이 공고는 상세 내용을 제공하지 않습니다."}
        </p>
      )}

      {job.benefits.length > 0 && (
        <>
          <h2 className="mt-5 font-bold text-slate-900">복리후생</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {job.benefits.map((b) => (<span key={b} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{b}</span>))}
          </div>
        </>
      )}

      {job.apply_detail && (
        <>
          <h2 className="mt-5 font-bold text-slate-900">전형·접수</h2>
          {/* 접수 원문에 담당자 이메일·전화가 그대로 들어 있다 — 위 연락처와 같은 등급(로그인)으로 가린다. */}
          {loggedIn ? (
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{job.apply_detail}</p>
          ) : (
            <div className="mt-2 flex flex-col items-start gap-2 rounded-[12px] border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm text-slate-500">로그인한 회원만 볼 수 있습니다.</p>
              <Button href={loginHref} size="md">로그인하고 보기</Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
