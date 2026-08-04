import Link from "next/link";
import { acceptsPlatformApply } from "@/lib/applyGate";
import Image from "next/image";
import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import DraftCleaner from "@/components/DraftCleaner";
import { getMyProfile } from "@/lib/data/user";
import { getJobs } from "@/lib/data/jobs";
import { searchPublicTalent, revealContacts, canRevealContacts, type RevealedContact } from "@/lib/data/talent";
import TalentCard from "@/components/TalentCard";
import { daysAgo } from "@/lib/date";

// 홈에 띄우는 구직 카드 수 — 한 줄에 2개씩 5줄.
const HOME_TALENT = 10;

// 홈만 자기 자신을 정본으로 선언한다(루트 레이아웃에서 canonical을 걷어냈다).
export const metadata = { alternates: { canonical: "/" } };

export default async function Home({
  searchParams,
}: Readonly<{ searchParams: Promise<{ left?: string }> }>) {
  const [profile, { jobs, total: jobTotal }, { left }, talent] = await Promise.all([
    getMyProfile(),
    getJobs("", ""), // total 은 원래 세고 있었다(withCount 기본값 true) — 버리지 않고 제목 옆에 쓴다
    searchParams,
    // 구직 현황 — 최신 공개 이력서. 목록(/talent)과 같은 함수·같은 정렬(updated_at desc)이라
    // 홈에서 본 카드가 목록 첫 페이지와 어긋나지 않는다.
    // withCount=true — 제목 옆 건수를 여기서 받는다(오너 지시 2026-07-30). 카드는 10장만 받고
    // 개수는 전체를 센다. /talent 목록이 보여주는 총계와 같은 함수·같은 조건이라 숫자가 어긋나지 않는다.
    searchPublicTalent({}, 1, true, HOME_TALENT),
  ]);
  const latest = jobs.slice(0, 6);
  const seekers = talent.rows;
  // 이름·사진은 광고 중인 병원에게만 — /talent 와 **같은 게이트**를 쓴다(홈이라고 더 열지 않는다).
  const canSeeContacts = await canRevealContacts(profile);
  const contacts = canSeeContacts
    ? await revealContacts(seekers.map((r) => r.profile_id))
    : new Map<string, RevealedContact>();

  return (
    <>
      <SiteHeader user={profile ? { displayName: profile.displayName } : null} />
      {/* 로그아웃·탈퇴로 도착했으면 이 브라우저에 남은 임시저장 초안을 전부 지운다 */}
      {left && <DraftCleaner />}

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
            {/* 🔴 "16,000+ 간호사 회원"을 뺐다 — 근거를 댈 수 없는 숫자였다(이관한 이력서는 7,257건).
                증명할 수 없는 수치는 적지 않는다. 실제 회원 수를 세어 보여주려면 집계 쿼리를 붙이고
                그때 다시 넣는다. 병원 데이터 79,000+ 는 심평원 명부 건수라 근거가 있다. */}
            <span className="inline-flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-teal-600" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
              <span>이력서 등록·지원 <b className="font-extrabold text-teal-700">무료</b></span>
            </span>
          </div>
        </section>

        <div className="mx-auto max-w-[1280px] px-4">
          {/* ── 최신 채용공고 ───────────────── */}
          <section className="mt-12 pb-16">
            <div className="flex items-end justify-between">
              {/* 건수는 제목 옆에 붙인다 — 사람이 먼저 보는 곳이 제목이라, 얼마나 있는 사이트인지
                  스크롤 전에 알 수 있다. 숫자는 전체 건수(목록 전체 보기와 같은 수)다. */}
              <h2 className="text-xl font-bold text-slate-900">
                최신 채용공고 <span className="text-base font-normal text-slate-400">총 {jobTotal.toLocaleString()}건</span>
              </h2>
              <Link href="/jobs" className="text-sm font-semibold text-teal-700 hover:underline">전체 보기 →</Link>
            </div>
            {latest.length === 0 ? (
              <p className="mt-6 rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">등록된 공고가 곧 올라옵니다.</p>
            ) : (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {latest.map((job) => (
                  <li key={job.id}>
                    {/* 홈은 6건이지만 /jobs 세그먼트에 layout·loading이 생겨 미리 받아오는 비용이 공짜가 아니게 됐다
                        (로그인 상태면 카드마다 세션·프로필 조회) → 누른 뒤에 받는다 */}
                    <Link href={`/jobs/${job.id}`} prefetch={false} className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold leading-snug text-slate-900">{job.title}</h3>
                        {/* /jobs 목록과 같은 판정(lib/applyGate) — 두 화면이 갈라지면 같은 공고가
                            홈에서는 배지가 없고 목록에서는 있는 상태가 된다. */}
                        {acceptsPlatformApply(job) && (
                          <span className="shrink-0 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-700">
                            간편지원
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-sm text-slate-500">
                        {job.hospital?.name ?? job.company_name ?? "병원 미상"}{job.location ? ` · ${job.location}` : ""}
                      </p>
                      <div className="mt-3 flex items-end justify-between gap-2 border-t border-slate-100 pt-3">
                        <span className="font-bold text-teal-700">{job.salary_text ?? "급여 협의"}</span>
                        <span className="shrink-0 text-xs text-slate-400">{daysAgo(job.posted_at)}일 전</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-center text-xs text-slate-400">일부 공고는 고용노동부 워크넷 및 공공데이터포털에서 제공받아 표시됩니다.</p>
          </section>
        </div>

        {/* ── 구인 ↔ 구직 사이 띠 배너 ─────────────
            구 널스넷에서 쓰던 그림 그대로(1170×110). 장식이라 alt 는 문구를 그대로 옮겨 적는다.
            priority 를 주지 않는다 — 첫 화면 밖이라 미리 받을 이유가 없다. */}
        <div className="mx-auto max-w-[1280px] px-4">
          <Image
            src="/img/banner-strip.png"
            alt="구인, 구직신청은 널스넷에서!"
            width={1170}
            height={110}
            sizes="(max-width: 1280px) 100vw, 1170px"
            className="h-auto w-full rounded-2xl"
          />
        </div>

        <div className="mx-auto max-w-[1280px] px-4">
          {/* ── 구직 현황 ─────────────────────
              인재정보는 색인 대상이다(오너 확정 2026-07-30) — 홈에 카드가 실리는 것과
              /talent 가 색인되는 것이 이제 같은 방침이라 여기서 따로 가릴 것이 없다.
              이름·연락처·사진은 홈에서도 /talent 와 같은 게이트(광고 중인 병원)로 막힌다. */}
          <section className="mt-12 pb-16">
            <div className="flex items-end justify-between">
              <h2 className="text-xl font-bold text-slate-900">
                구직 현황 <span className="text-base font-normal text-slate-400">총 {talent.total.toLocaleString()}건</span>
              </h2>
              <Link href="/talent" className="text-sm font-semibold text-teal-700 hover:underline">전체 보기 →</Link>
            </div>
            {seekers.length === 0 ? (
              <p className="mt-6 rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">등록된 이력서가 곧 올라옵니다.</p>
            ) : (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {seekers.map((r) => (
                  <li key={r.profile_id}>
                    {/* relative + overflow-hidden — 리본이 카드 모서리를 벗어나지 않게 */}
                    <Link
                      href={`/talent/${r.profile_id}`}
                      prefetch={false}
                      className="relative block h-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md"
                    >
                      {/* 구직중 리본 — 오른쪽 위 모서리를 45도로 가로지른다.
                          띠를 카드 밖으로 충분히 빼야(-right-12) 글자가 모서리에 끼이지 않고
                          띠 한가운데에 온다. 부모의 overflow-hidden 이 삐져나온 부분을 잘라 준다. */}
                      <span className="pointer-events-none absolute -right-12 top-5 w-40 rotate-45 bg-teal-600 py-1 text-center text-xs font-bold tracking-wide text-white shadow-sm">
                        구직중
                      </span>
                      <div className="pr-10">
                        <TalentCard
                          t={r}
                          contactName={contacts.get(r.profile_id)?.name}
                          contactAvatar={contacts.get(r.profile_id)?.avatarUrl}
                        />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-center text-xs text-slate-400">이력서를 공개한 간호사 회원입니다. 이름·연락처는 광고 중인 병원에만 표시됩니다.</p>
          </section>
        </div>
      </main>

      {/* 푸터는 루트 레이아웃(components/SiteFooter)으로 옮겼다 — 전 화면 공용 */}
    </>
  );
}
