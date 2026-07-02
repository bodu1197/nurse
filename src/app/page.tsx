import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import Button from "@/components/Button";
import { getMyProfile } from "@/lib/data/user";
import { getJobs, SOURCE_LABEL } from "@/lib/data/jobs";
import { daysAgo } from "@/lib/date";

export default async function Home() {
  const [profile, { jobs }] = await Promise.all([getMyProfile(), getJobs("", "")]);
  const latest = jobs.slice(0, 6);

  return (
    <>
      <SiteHeader user={profile ? { displayName: profile.displayName } : null} />

      <main className="flex-1">
        {/* ── 히어로 ───────────────────────── */}
        <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-br from-teal-50 via-white to-emerald-50/50">
          <div className="mx-auto max-w-[1280px] px-4 pb-12 pt-10 text-center sm:pt-12">
            {/* 검색창 위에는 텍스트 없음 — 검색 우선 */}
            <form action="/jobs" method="get" className="mx-auto flex w-full max-w-[840px] flex-col gap-1.5 rounded-[20px] border border-slate-300 bg-white p-2 shadow-md transition focus-within:border-teal-500 focus-within:shadow-lg sm:flex-row sm:items-center sm:gap-1 sm:p-1.5 sm:pl-2">
              <label className="flex min-w-0 flex-1 items-center gap-2 px-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-teal-600" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
                <input name="q" aria-label="직무, 진료과, 병원 검색" className="w-full bg-transparent py-2.5 text-base outline-none placeholder:text-slate-400" placeholder="진료과·병원명 (예: 중환자실)" />
              </label>
              <span className="mx-1 hidden h-6 w-px shrink-0 bg-slate-300 sm:block" />
              <span className="h-px w-full bg-slate-100 sm:hidden" />
              <label className="flex items-center gap-1.5 px-2 sm:w-44">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-teal-600" aria-hidden><path d="M12 21s-7-6.3-7-11a7 7 0 1114 0c0 4.7-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
                <input name="l" aria-label="지역 검색" className="w-full bg-transparent py-2.5 text-base outline-none placeholder:text-slate-400" placeholder="지역" />
              </label>
              <Button type="submit" size="lg" className="w-full sm:w-auto sm:shrink-0">검색</Button>
            </form>

            {/* 비로그인 전용 안내 — 로그인 후 숨김 */}
            {!profile && (
              <div className="mt-8">
                <p className="text-2xl font-semibold text-slate-800">여기서 다음 직무가 시작됩니다</p>
                <p className="mt-1 text-sm text-slate-500">
                  맞춤형 채용공고 추천을 확인하려면{" "}
                  <a href="/signup" className="font-medium text-teal-700 hover:underline">계정을 만들거나</a>{" "}
                  <a href="/login" className="font-medium text-teal-700 hover:underline">로그인</a>하세요.
                </p>
                <Button href="/signup" size="lg" className="mt-5">
                  시작하기 <span aria-hidden>→</span>
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* 신뢰 통계 띠 — 히어로 아래 전용(검색 흐름 방해 안 함) */}
        <section className="border-b border-slate-200 bg-teal-50/50">
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-center gap-x-10 gap-y-2 px-4 py-4 text-sm text-slate-600">
            <span className="inline-flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-teal-600" aria-hidden><path d="M3 21h18M6 21V7l6-4 6 4v14M10 9h4M10 13h4M10 17h4" /></svg>
              <span><b className="font-extrabold text-teal-700">79,000+</b> 병원 데이터</span>
            </span>
            <span className="inline-flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-teal-600" aria-hidden><circle cx="9" cy="7" r="3.5" /><path d="M2.5 20c0-3 3-5 6.5-5s6.5 2 6.5 5" /><path d="M16 4a3.5 3.5 0 010 6.5" /><path d="M21.5 20c0-2.2-1.4-3.9-3.5-4.6" /></svg>
              <span><b className="font-extrabold text-teal-700">16,000+</b> 간호사 회원</span>
            </span>
          </div>
        </section>

        <div className="mx-auto max-w-[1280px] px-4">
          {/* ── 최신 채용공고 ───────────────── */}
          <section className="mt-12 pb-16">
            <div className="flex items-end justify-between">
              <h2 className="text-xl font-bold text-slate-900">최신 채용공고</h2>
              <a href="/jobs" className="text-sm font-semibold text-teal-700 hover:underline">전체 보기 →</a>
            </div>
            {latest.length === 0 ? (
              <p className="mt-6 rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">등록된 공고가 곧 올라옵니다.</p>
            ) : (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {latest.map((job) => (
                  <li key={job.id}>
                    <a href={`/jobs?j=${job.id}`} className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold leading-snug text-slate-900">{job.title}</h3>
                        {job.is_featured && <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">추천</span>}
                      </div>
                      <p className="mt-1.5 text-sm text-slate-500">
                        {job.hospital?.name ?? "병원 미상"}{job.location ? ` · ${job.location}` : ""}
                      </p>
                      <div className="mt-3 flex items-end justify-between gap-2 border-t border-slate-100 pt-3">
                        <span className="font-bold text-teal-700">{job.salary_text ?? "급여 협의"}</span>
                        <span className="shrink-0 text-xs text-slate-400">{SOURCE_LABEL[job.source]} · {daysAgo(job.posted_at)}일 전</span>
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
      <SiteFooter />
    </>
  );
}
