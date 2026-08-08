import Link from "next/link";
import { acceptsPlatformApply } from "@/lib/applyGate";
import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import DraftCleaner from "@/components/DraftCleaner";
import { ApplyBadge } from "@/components/JobCard";
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
            {/* 🔴 한때 "16,000+ 간호사 회원"이 적혀 있었는데 근거를 댈 수 없는 숫자라 뺐었다.
                이제 **실제로 센 값**을 넣는다(오너 지시 2026-08-06) — 이력서를 공개한 간호사 수다.
                숫자는 위에서 이미 받아온 talent.total 을 그대로 쓴다. /talent 목록·아래 '구직 현황'과
                **같은 함수·같은 조건**(is_public=true + 이름 있음)이라 세 곳이 어긋날 수 없다.
                여기서 따로 세면 조건이 갈리는 날 홈만 다른 숫자를 말하게 된다.
                🔴 "구직중"이라고 쓰는 것이 맞다 — **널스넷에서 이력서 공개는 곧 구직 의사 표시다**
                   (오너 확정 2026-08-06). 구직할 마음이 없으면 이력서를 비공개로 내린다.
                   그래서 is_public=true 를 세는 것과 "구직중 간호사"는 같은 말이다.
                   ⚠️ 검증 때 "is_public 은 공개일 뿐 구직중이 아니다"라는 지적이 한 번 올라와 문구를
                      바꿨다가 되돌렸다. 이 도메인 규칙을 모르면 또 뒤집힌다 — 그래서 여기 적어 둔다.
                   카드의 '구직중' 리본도 같은 근거로 붙어 있다(말이 어긋나지 않는다).
                🔴 0명이면 숫자를 안 쓴다 — 신뢰를 주려고 놓은 자리에 "0명"이 뜨면 정반대가 된다.
                   searchPublicTalent 는 조회 실패도 total 0 으로 돌려주므로 이 분기가 그것도 덮는다. */}
            <span className="inline-flex items-center gap-2">
              {talent.total > 0 ? (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-teal-600" aria-hidden><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 7a4 4 0 100 8 4 4 0 000-8M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>
                  <span>구직중 간호사 <b className="font-extrabold text-teal-700">{talent.total.toLocaleString()}</b>명</span>
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-teal-600" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
                  <span>이력서 등록·지원 <b className="font-extrabold text-teal-700">무료</b></span>
                </>
              )}
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
                        {/* 판정(lib/applyGate)도 배지 모양(components/JobCard 의 ApplyBadge)도 목록·자동매치와
                            같은 것을 쓴다 — 갈라지면 같은 공고가 홈에서는 배지가 없고 목록에서는 있는 상태가 된다.
                            홈 카드는 레이아웃이 달라(병원명·지역 한 줄, 마감일 없음) 카드 자체는 공유하지 않는다. */}
                        {acceptsPlatformApply(job) && (
                          <span className="shrink-0">
                            <ApplyBadge />
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

        {/* ── 구인 ↔ 구직 사이 띠 배너 — AI 자동매치 홍보 ─────────────
            🔴 종전에는 **링크 없는 장식 이미지**였다(구 널스넷 1170×110, "구인, 구직신청은 널스넷에서!").
               홈에서 가장 눈에 띄는 가로 띠인데 눌러도 아무 데도 안 가고, 방문자가 이미 아는 말을
               반복할 뿐이었다 — 얻는 것도 다음 행동도 없었다.
            🔴 **이미지로 만들지 않는다**(오너 지시 2026-08-05). 문구를 고칠 때마다 그림을 다시
               만들어야 하고, 휴대폰에서 글자가 읽을 수 없을 만큼 줄어든다.
            🔴 **양쪽 다 부른다**(오너 지시). 이 배너가 서 있는 자리가 구인(위)과 구직(아래)의 이음매다.
               병원 버튼은 /hospital(회원가입·공고등록)로 보낸다 — 자동매치로 인재를 보려면 공고를
               게재해야 하므로, **이 배너가 곧 병원 가입을 부르는 자리**다.
            🔴 **공고 건수 같은 숫자를 쓰지 않는다.** 매일 바뀌는 값이라 줄어드는 날에는 홍보가
               스스로를 깎고("공고 320건, 다 볼 필요 없습니다"), 바로 위 섹션 제목이 이미 총 건수를
               말하고 있어 같은 말을 두 번 하게 된다. 변하지 않는 사실만 적는다. */}
        <div className="mx-auto max-w-[1280px] px-4">
          <div className="flex flex-col gap-6 rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 via-white to-teal-50 px-6 py-8 sm:px-10 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
            <div>
              {/* 🔴 배지는 **읽히는 크기**여야 한다(오너 지적 2026-08-05: "좁쌀만해서 효과가 없다").
                  종전 11px 글자 + 12px 아이콘이었는데, 그 크기에서는 별의 뾰족한 끝이 1px 미만이라
                  아이콘이 뭉개져 형체가 안 보였다. 글자 16px · 아이콘 22px 로 올리고,
                  별도 **끝이 굵은 대칭 4각별**로 다시 그려 작은 크기에서도 모양이 살아 있게 한다. */}
              <span className="inline-flex items-center gap-2 rounded-full bg-teal-600 px-4 py-2 text-base font-extrabold tracking-tight text-white shadow-sm">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="shrink-0">
                  <path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" />
                </svg>
                AI 자동매치
              </span>
              <p className="mt-4 text-2xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-3xl">
                찾지 마세요. 맞춰 드립니다.
              </p>
              <p className="mt-2 text-base text-slate-600 sm:text-lg">
                간호사에겐 조건에 맞는 <b className="text-slate-800">공고</b>를, 병원에는 조건에 맞는{" "}
                <b className="text-slate-800">인재</b>를.
              </p>
            </div>
            {/* 목적지가 서로 달라 버튼이 둘이다 — 간호사는 매치 결과로, 병원은 가입·공고등록으로. */}
            <div className="flex shrink-0 flex-col gap-2.5 sm:flex-row">
              <Button href="/match" size="lg">내게 맞는 공고 보기 →</Button>
              <Button href="/hospital" variant="outline" size="lg" className="border-teal-300 bg-white text-teal-800 hover:bg-teal-50">
                병원 회원가입 · 공고등록 →
              </Button>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-[1280px] px-4">
          {/* ── 구직 현황 ─────────────────────
              🔴 **로그인 전·후가 같은 화면이다**(오너 지시 2026-08-08). 로그인 여부로 가르지 않는다 —
                 종전에는 비로그인에게 카드 대신 안내 상자를 놓아서, 홈에 온 병원이 "구직중 7,770명"
                 이라는 숫자만 보고 사람은 한 명도 못 본 채 떠났다.
                 🔴 여기에 다시 `!profile` 분기를 넣지 말 것. 이 화면의 게이트는 로그인이 아니라
                    **광고 여부** 하나뿐이다(아래 canRevealContacts) — 로그인해도 광고를 안 낸
                    병원은 이름·연락처·사진을 못 본다. 로그인 전과 정확히 같은 것을 본다.
              홈은 색인 대상(priority 1)이라 이력서 텍스트가 검색엔진에 실린다 — 그래도 된다
              (오너 지시 2026-08-08: 인재정보는 이제 /talent 목록·상세도 색인한다). 실명·전화·이메일은
              서버에서 가려진 값이라(lib/maskPii 의 maskFree) 색인되는 것은
              제목·소개·경력·희망조건뿐이다. */}
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
                  // 🔴 min-w-0 — 격자 칸의 기본 최소폭은 **내용 크기**다(min-width:auto).
                  //    자기소개에 "요양원요양병원근무경력있어서" 처럼 띄어쓰기 없는 긴 한글이 들어오면
                  //    그 길이만큼 칸이 벌어져 카드가 화면 밖으로 나간다.
                  //    실측(2026-08-04, 폭 375px): 카드가 512px, 문서 전체가 528px 로 넘쳤다.
                  //    안쪽에 min-w-0 이 있어도 이 칸에 없으면 소용없다 — 여기서 사슬이 끊긴다.
                  <li key={r.profile_id} className="min-w-0">
                    {/* relative + overflow-hidden — 리본이 카드 모서리를 벗어나지 않게 */}
                    {/* 카드 전체가 링크라 aria-label 이 없으면 스크린리더가 제목·소개·메타를 통째로 낭독한다
                        → /talent 목록과 **같은 규칙**으로 "이름 · 제목" 만 링크 이름으로 준다.
                        비로그인 방문자가 이제 이 링크를 처음으로 만나는 자리다(종전에는 안내 상자였다). */}
                    <Link
                      href={`/talent/${r.profile_id}`}
                      prefetch={false}
                      aria-label={`${contacts.get(r.profile_id)?.name ?? "간호사 회원"} · ${r.resume_title ?? "간호사 인재"}`}
                      className="relative block h-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
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
            {/* 카드가 있을 때만 다는 주석 — 카드가 없는데 "이름·연락처는…" 이라고 하면 무엇에 대한 말인지 모른다. */}
            {seekers.length > 0 && (
              // 🔴 "사진" 도 적는다 — 카드에 실루엣이 뜨는 이유가 이것이다. 이름·연락처만 적어두면
              //    비로그인 첫 방문자는 사진이 왜 없는지 알 수 없다(/talent 목록은 이미 셋 다 적고 있다).
              <p className="mt-4 text-center text-xs text-slate-400">이력서를 공개한 간호사 회원입니다. 이름·연락처·사진은 광고 중인 병원에만 표시됩니다.</p>
            )}
          </section>
        </div>
      </main>

      {/* 푸터는 루트 레이아웃(components/SiteFooter)으로 옮겼다 — 전 화면 공용 */}
    </>
  );
}
