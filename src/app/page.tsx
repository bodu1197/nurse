import SiteHeader from "@/components/SiteHeader";
import { getMyProfile } from "@/lib/data/user";
import { getJobs, SOURCE_LABEL } from "@/lib/data/jobs";
import { POPULAR_SEARCHES, FOOTER_NAV } from "@/lib/constants";
import { daysAgo } from "@/lib/date";

const NURSE_LINKS = [
  { label: "내 이력서", href: "/mypage/resume" },
  { label: "지원 내역", href: "/mypage/applications" },
  { label: "채용 알림", href: "/mypage/alerts" },
  { label: "메시지", href: "/mypage/messages" },
];
const HOSPITAL_LINKS = [
  { label: "공고 등록", href: "/mypage/jobs/new" },
  { label: "받은 지원자", href: "/mypage/applicants" },
  { label: "공고 관리", href: "/mypage/jobs" },
  { label: "메시지", href: "/mypage/messages" },
];

export default async function Home() {
  const [profile, jobs] = await Promise.all([getMyProfile(), getJobs("", "")]);
  const latest = jobs.slice(0, 6);
  const quickLinks =
    profile?.role === "hospital" ? HOSPITAL_LINKS
    : profile?.role === "nurse" ? NURSE_LINKS
    : profile?.role === "admin" ? [{ label: "관리자 도구", href: "/mypage" }]
    : null;

  return (
    <>
      <SiteHeader user={profile ? { displayName: profile.displayName } : null} />

      <main className="flex-1">
        {/* ── 히어로(검색 중심) ───────────────── */}
        <section className="border-b border-slate-200 bg-gradient-to-b from-teal-50/70 to-white">
          <div className="mx-auto max-w-3xl px-4 pb-10 pt-12 text-center sm:pt-16">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              간호사 전문 채용 플랫폼
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-slate-600">
              전국 79,000여 개 병원의 채용을 한곳에서. 검색 한 번으로 나에게 맞는 간호사 공고를 찾으세요.
            </p>

            <form action="/jobs" method="get" className="mx-auto mt-7 flex max-w-2xl flex-col gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-md transition focus-within:border-teal-500 focus-within:shadow-lg sm:flex-row sm:items-center sm:rounded-full">
              <label className="flex flex-1 items-center gap-2 px-3 py-2.5">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-teal-600" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
                <span className="sr-only">검색어</span>
                <input name="q" aria-label="직무, 진료과, 병원 검색" className="w-full bg-transparent text-base outline-none placeholder:text-slate-400" placeholder="진료과, 직무, 병원명 (예: 중환자실)" />
              </label>
              <span className="mx-1 hidden h-7 w-px bg-slate-200 sm:block" />
              <label className="flex items-center gap-2 px-3 py-2.5 sm:w-60">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-teal-600" aria-hidden><path d="M12 21s-7-6.3-7-11a7 7 0 1114 0c0 4.7-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
                <span className="sr-only">지역</span>
                <input name="l" aria-label="지역 검색" className="w-full bg-transparent text-base outline-none placeholder:text-slate-400" placeholder="지역 (예: 서울)" />
              </label>
              <button type="submit" className="rounded-full bg-teal-600 px-7 py-3 text-base font-bold text-white hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2">검색</button>
            </form>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <span className="text-sm text-slate-400">인기 검색</span>
              {POPULAR_SEARCHES.map((k) => (
                <a key={k} href={`/jobs?q=${encodeURIComponent(k)}`} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600 hover:border-teal-400 hover:text-teal-700">
                  {k}
                </a>
              ))}
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-5xl px-4">
          {/* ── 로그인: 개인화 / 비로그인: 가치 CTA ── */}
          {profile && quickLinks ? (
            <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
              <p className="font-semibold text-slate-900">안녕하세요, {profile.displayName}님 👋</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {quickLinks.map((q) => (
                  <a key={q.href} href={q.href} className="rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-medium text-slate-700 hover:border-teal-400 hover:text-teal-700">
                    {q.label}
                  </a>
                ))}
              </div>
            </section>
          ) : !profile ? (
            <section className="mt-8 grid gap-3 sm:grid-cols-2">
              <a href="/signup" className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-teal-400 hover:shadow-sm">
                <p className="font-bold text-slate-900">간호사세요?</p>
                <p className="mt-1 text-sm text-slate-500">이력서를 무료로 등록하고 간편하게 지원하세요. →</p>
              </a>
              <a href="/hospital" className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-teal-400 hover:shadow-sm">
                <p className="font-bold text-slate-900">병원 채용담당자세요?</p>
                <p className="mt-1 text-sm text-slate-500">사업자 인증 후 공고를 무료로 등록하세요. →</p>
              </a>
            </section>
          ) : null}

          {/* ── 최신 채용공고 ───────────────── */}
          <section className="mt-10 pb-16">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">최신 채용공고</h2>
              <a href="/jobs" className="text-sm font-semibold text-teal-700 hover:underline">전체 보기 →</a>
            </div>
            {latest.length === 0 ? (
              <p className="mt-6 rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">등록된 공고가 곧 올라옵니다.</p>
            ) : (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {latest.map((job) => (
                  <li key={job.id}>
                    <a href={`/jobs?j=${job.id}`} className="block h-full rounded-xl border border-slate-200 bg-white p-4 hover:border-teal-400 hover:shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold leading-snug text-slate-900">{job.title}</h3>
                        {job.is_featured && <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">추천</span>}
                      </div>
                      <div className="mt-1.5 text-sm text-slate-600">{job.hospital?.name ?? ""}</div>
                      <div className="text-sm text-slate-500">{job.location}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{SOURCE_LABEL[job.source]}</span>
                        {job.salary_text && <span className="text-slate-500">{job.salary_text}</span>}
                        <span className="text-slate-400">{daysAgo(job.posted_at)}일 전</span>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-center text-xs text-slate-400">일부 공고는 고용노동부 워크넷 및 공공데이터포털에서 제공받아 표시됩니다.</p>
          </section>
        </div>
      </main>

      {/* ── 푸터 ─────────────────────────── */}
      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <span className="text-lg font-bold text-teal-700">✚ 널스넷</span>
              <p className="mt-2 max-w-xs text-sm text-slate-500">간호사와 병원을 잇는 전문 채용 플랫폼.</p>
            </div>
            <nav className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm sm:grid-cols-1">
              {FOOTER_NAV.map((l) => (
                <a key={l.href} href={l.href} className="text-slate-600 hover:text-teal-700">{l.label}</a>
              ))}
            </nav>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-200 pt-5 text-xs text-slate-400">
            <span>© 2026 널스넷 (NurseNet)</span>
            <a href="/privacy" className="hover:text-slate-600">개인정보처리방침</a>
            <a href="/terms" className="hover:text-slate-600">이용약관</a>
          </div>
        </div>
      </footer>
    </>
  );
}
