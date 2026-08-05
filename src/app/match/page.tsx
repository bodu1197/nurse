import type { Metadata } from "next";
import Link from "next/link";
import TalentCard from "@/components/TalentCard";
import JobCard from "@/components/JobCard";
import MatchAxisNotice from "@/components/MatchAxisNotice";
import Button from "@/components/Button";
import { getMyProfile } from "@/lib/data/user";
import { getMembership } from "@/lib/data/membership";
import { getMyResume, type ResumeWithWork } from "@/lib/data/resume";
import { getMatchCandidates, getMyAdConditions, type MatchJob } from "@/lib/data/jobs";
import { searchPublicTalent, revealContacts, canRevealContacts } from "@/lib/data/talent";
import { canMatch, candidateSidos, evaluateMatch, shortSidos, talentSpecialtyFilter } from "@/lib/match";

/**
 * 🤖 AI 자동매치 — dolpagu(https://dolpagu.com/match) 이식.
 *
 * 접속자에 따라 화면이 갈린다:
 *   ① 이력서를 등록한 간호사(공개·비공개 무관) → 내 조건에 맞는 공고(일치 개수 순, 어긋난 조건 표시)
 *   ② 인재정보 열람 자격이 있는 병원   → 내 공고 조건에 맞는 인재
 *   ③ 그 외(비로그인 포함)            → 기능 설명 + 이력서 등록·광고 게재 유도
 *
 * 🔴 **노출 중(지원을 받고 있는) 공고만 매칭한다**(오너 지시 2026-08-05). 판정은 목록과 같은
 *    술어 하나(lib/data/jobs 의 applyListingWindow)를 쓴다 — 마감됐거나 무료 기간이 끝난 공고를
 *    추천하면 눌렀을 때 404 가 되고, 그건 조용히 일어난다.
 * 🔴 **비공개 이력서는 「병원 → 인재」 방향에서만 빠진다**(오너 확정 2026-08-05).
 *    비공개는 "인재 목록에 날 올리지 마라"는 뜻이지 "나한테 공고를 추천하지 마라"가 아니다.
 *    · 병원이 보는 인재 목록 → searchPublicTalent 가 is_public=true 만 조회한다(그대로).
 *    · 간호사 본인이 보는 공고 추천 → **비공개여도 그대로 받는다.** 이 화면은 본인만 보고,
 *      읽는 것은 공개 데이터(공고)와 자기 이력서뿐이라 밖으로 새는 것이 없다.
 *    (종전에는 본인 화면까지 막아, 취업해서 이력서를 잠시 내려둔 사람이 공고 추천도 함께 잃었다.)
 * 🔒 등급(A/B)으로 가르지 않는다(오너 확정 2026-08-05) — 한 목록에 쌓고 카드마다
 *    "5개 중 4개 일치 · 다른 조건: 진료과 미표기" 를 적는다. 판정은 lib/match.
 * 🔒 비로그인에게 보이는 기본 화면이 기능 설명이라 색인을 막지 않는다(크롤러가 받는 것 = 비로그인 화면).
 */

const MATCH_TITLE = "AI 자동매치 — 내 조건에 맞는 간호사 채용공고 | 널스넷";
const MATCH_DESC =
  "이력서를 등록하면 희망 근무지·근무부서·직종·고용형태·급여에 맞는 간호사 채용공고를 자동으로 찾아 드립니다. 공고를 게재한 병원에는 조건에 맞는 인재를 보여 드립니다.";

/**
 * 🔴 `?page=` 가 붙은 화면은 색인하지 않는다 — /jobs·/talent 와 같은 규칙이다.
 *    canonical 은 힌트일 뿐이라 구글이 무시하고 쪽마다 따로 색인할 수 있는데, 그 쪽들은
 *    사람마다 내용이 다른 얇은 페이지라 색인되면 사이트 평가를 깎는다.
 *    색인 대상은 본체(/match) 하나 — 비로그인 방문자(=크롤러)가 받는 기능 설명 화면이다.
 */
export async function generateMetadata({
  searchParams,
}: Readonly<{ searchParams: Promise<{ page?: string }> }>): Promise<Metadata> {
  const { page } = await searchParams;
  return {
    title: MATCH_TITLE,
    description: MATCH_DESC,
    alternates: { canonical: "/match" },
    openGraph: { type: "website", locale: "ko_KR", siteName: "널스넷", url: "/match", title: MATCH_TITLE, description: MATCH_DESC },
    ...(page ? { robots: { index: false } } : {}),
  };
}

/** 한 쪽에 그리는 공고 수 — 목록(/jobs)과 같은 단위라 사용자가 규칙을 한 번만 배운다. */
const PER_PAGE = 20;

export default async function MatchPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ page?: string }> }>) {
  const [{ page }, profile] = await Promise.all([searchParams, getMyProfile()]);
  const pageNum = Math.max(1, Number(page) || 1);

  return (
    <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900">AI 자동매치</h1>
      <p className="mt-1 text-sm text-slate-600">
        조건을 매번 검색하지 마세요. 이력서를 등록하면 <b className="text-slate-800">맞는 공고</b>를, 공고를
        게재하면 <b className="text-slate-800">맞는 인재</b>를 이 화면이 알아서 모아 보여 드립니다.
      </p>
      {profile ? <Signed pageNum={pageNum} /> : <HowItWorks loggedIn={false} />}
    </main>
  );
}

/** 로그인한 사람 — 가진 권한만큼 섹션을 쌓는다(간호사이면서 병원일 수는 없지만 판정은 따로 한다). */
async function Signed({ pageNum }: Readonly<{ pageNum: number }>) {
  const [resume, membership] = await Promise.all([getMyResume(), getMembership()]);
  const isSeeker = membership.role === "nurse" || !!resume;
  if (!isSeeker && !membership.canViewTalent) {
    return <HowItWorks loggedIn hospital={membership.role === "hospital"} />;
  }
  return (
    <>
      {isSeeker && <SeekerMatches resume={resume} pageNum={pageNum} />}
      {membership.canViewTalent && <RecruiterMatches />}
    </>
  );
}

// ─────────────────────── ① 간호사 → 내 조건에 맞는 공고 ───────────────────────

async function SeekerMatches({
  resume,
  pageNum,
}: Readonly<{ resume: ResumeWithWork | null; pageNum: number }>) {
  // 이력서가 아직 없다 — "무엇이 비었다"가 아니라 "이걸 쓰면 열린다"가 맞는 말이다.
  if (!resume) {
    return (
      <Section title="내 조건에 맞는 공고">
        <MatchAxisNotice seeker={null} />
        <Button href="/mypage/resume" className="mt-3">이력서 등록하기</Button>
      </Section>
    );
  }

  // 지역이 비면 전국 공고가 나와 "내 조건에 맞는 공고"가 거짓말이 된다 → 채우라고 말한다.
  if (!canMatch(resume)) {
    return (
      <Section title="내 조건에 맞는 공고">
        {!resume.is_public && (
          <div className="mb-2">
            <PrivateResumeNotice />
          </div>
        )}
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          희망 근무지가 비어 있어 매치할 수 없습니다.{" "}
          <Link href="/mypage/resume" className="font-semibold underline underline-offset-2">이력서에서 채우기</Link>
        </p>
      </Section>
    );
  }

  // 시도까지만 SQL 로 좁히고 나머지 축은 여기서 판정한다 — 그래야 "몇 개 중 몇 개 일치"를 말할 수 있다.
  const candidates = await getMatchCandidates(candidateSidos(resume));
  const graded = candidates
    .map((job) => ({ job, ...evaluateMatch(resume, job) }))
    // 🔴 지역이 어긋난 것은 뺀다 — 후보 조회가 시도까지만 좁히기 때문에 여기까지 딸려 온다.
    //    직종·급여가 맞아도 갈 수 없는 곳은 "내 조건에 맞는 공고" 가 아니다(실측: 442건 중 293건).
    .filter((m) => m.regionOk)
    // 일치 개수가 많은 순. 동률은 쿼리 순서(광고 → 최신)가 그대로 유지된다(JS sort 는 안정 정렬).
    .sort((a, b) => b.matched - a.matched);

  const totalPages = Math.max(1, Math.ceil(graded.length / PER_PAGE));
  const current = Math.min(pageNum, totalPages); // 범위 밖 딥링크는 마지막 쪽으로 접는다
  const slice = graded.slice((current - 1) * PER_PAGE, current * PER_PAGE);

  return (
    <Section title="내 조건에 맞는 공고" count={graded.length} unit="건">
      {/* 비공개여도 공고 추천은 그대로 받는다 — 다만 그동안 무엇을 잃고 있는지는 알려준다. */}
      {!resume.is_public && (
        <div className="mb-3">
          <PrivateResumeNotice />
        </div>
      )}
      <MatchAxisNotice seeker={resume} linkToResume />
      {/* 🔴 "전부" 라고 단언하지 않는다 — 조회가 중간에 실패하면(getMatchCandidates 는 받은 만큼
          돌려준다) 그 말이 거짓이 된다. 실제로 살펴본 수만 말한다. */}
      <p className="mt-2 text-sm text-slate-600">
        지금 <b className="text-slate-800">지원을 받고 있는 공고</b>만 봅니다. 희망 지역의 공고{" "}
        {candidates.length.toLocaleString()}건을 살펴 희망 시·군·구에 맞는 것만 남기고,{" "}
        <b className="text-slate-800">조건이 많이 맞는 순서</b>로 정렬했습니다.
      </p>

      {slice.length === 0 ? (
        <p className="py-16 text-center text-slate-500">
          희망 지역에 지금 지원을 받고 있는 공고가 없습니다.{" "}
          <Link href="/mypage/resume" className="font-semibold text-teal-700 underline underline-offset-2">
            이력서에서 희망 근무지 넓히기
          </Link>
        </p>
      ) : (
        <>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {slice.map((m) => (
              <li key={m.job.id}>
                <MatchCard job={m.job} matched={m.matched} total={m.total} mismatches={m.mismatches} />
              </li>
            ))}
          </ul>
          <Pager page={current} totalPages={totalPages} />
        </>
      )}
    </Section>
  );
}

/**
 * 이력서를 본인이 내려둔 상태 — **공고 추천은 계속 받는다.** 막지 않고, 그동안 무엇을 잃는지만 알린다.
 * 🔴 "자동매치가 열리지 않는다" 라고 쓰면 안 된다. 지금 화면에 결과가 나오고 있으니 거짓말이 된다.
 */
function PrivateResumeNotice() {
  return (
    <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      이력서가 <b>비공개</b>입니다. 공고 추천은 그대로 받지만, <b>병원의 인재 검색에는 나오지 않아</b>{" "}
      병원이 먼저 연락할 수는 없습니다.{" "}
      <Link href="/mypage/resume" className="font-semibold underline underline-offset-2">공개로 바꾸기</Link>
    </p>
  );
}

/**
 * 매칭 결과 한 장 — 카드 자체는 목록(/jobs)과 **같은 컴포넌트**(components/JobCard)를 쓰고,
 * 이 화면만의 두 가지를 슬롯으로 얹는다: 일치 개수 배지와 어긋난 조건 줄.
 * 어긋난 축은 "무엇이 달라서 여기 있는지"를 말해 준다 — 이게 이 화면이 목록과 다른 유일한 점이다.
 */
function MatchCard({
  job,
  matched,
  total,
  mismatches,
}: Readonly<{ job: MatchJob; matched: number; total: number; mismatches: readonly string[] }>) {
  const perfect = mismatches.length === 0;
  return (
    <JobCard
      job={job}
      href={`/jobs/${job.id}`}
      badge={
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
            perfect ? "border border-teal-200 bg-teal-50 text-teal-700" : "border border-slate-200 bg-slate-50 text-slate-600"
          }`}
        >
          {total}개 중 {matched}개 일치
        </span>
      }
      note={
        mismatches.length > 0 ? (
          <p className="mt-1.5 text-xs text-amber-700">다른 조건: {mismatches.join(" · ")}</p>
        ) : undefined
      }
    />
  );
}

// ─────────────────────── ② 병원 → 내 공고 조건에 맞는 인재 ───────────────────────

async function RecruiterMatches() {
  const cond = await getMyAdConditions();

  // 조건이 하나도 없으면 공개 인재 전건이 나와 "내 조건에 맞는 인재"가 거짓말이 된다.
  if (cond.specialties.length === 0 && cond.sidos.length === 0) {
    return (
      <Section title="내 공고 조건에 맞는 인재">
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          지금 노출 중인 공고가 없거나 그 공고에 진료과·지역이 없어 인재를 고를 수 없습니다.{" "}
          <Link href="/mypage/jobs" className="font-semibold underline underline-offset-2">내 공고 관리</Link>
        </p>
      </Section>
    );
  }

  // 🔒 인재는 이름·연락처를 뺀 안전 컬럼으로만 읽고(searchPublicTalent), 이름·사진은 자격을 확인한
  //    뒤에만 붙인다(revealContacts) — /talent 와 **같은 경로·같은 게이트**다.
  // 🔴 sidosAny 는 이력서 표기여야 한다: 공고 "서울특별시" → 이력서 "서울"(shortSidos).
  const profile = await getMyProfile();
  const [{ rows, total }, allowed] = await Promise.all([
    // talentSpecialtyFilter: 공고 진료과 + '부서무관'. 부서를 안 가리는 간호사가 빠지면 안 된다.
    searchPublicTalent({ specialtiesAny: talentSpecialtyFilter(cond.specialties), sidosAny: shortSidos(cond.sidos) }, 1),
    canRevealContacts(profile),
  ]);
  const contacts = allowed && rows.length > 0 ? await revealContacts(rows.map((r) => r.profile_id)) : new Map();

  return (
    <Section title="내 공고 조건에 맞는 인재" count={total} unit="명">
      <p className="text-sm text-slate-600">
        노출 중인 공고 {cond.count}건의 <b className="text-slate-800">진료과·지역</b>을 기준으로 자동 선별했습니다.
        이력서를 <b className="text-slate-800">공개</b>한 간호사만 나옵니다.
      </p>
      {rows.length === 0 ? (
        <p className="py-16 text-center text-slate-500">
          아직 조건에 맞는 인재가 없습니다. 조건에 맞는 이력서가 등록되면 이 자리에 자동으로 나타납니다.
        </p>
      ) : (
        <>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {rows.map((t) => (
              <li key={t.profile_id}>
                {/* aria-label 이 없으면 카드 본문 전체가 링크 이름이 되어 스크린리더의 링크 목록이
                    읽을 수 없게 길어진다(/talent 목록과 같은 처리). */}
                <a
                  href={`/talent/${t.profile_id}`}
                  aria-label={`${contacts.get(t.profile_id)?.name ?? "간호사 회원"} — ${t.resume_title ?? "간호사 인재"}`}
                  className="block h-full rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-teal-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                >
                  <TalentCard t={t} contactName={contacts.get(t.profile_id)?.name} contactAvatar={contacts.get(t.profile_id)?.avatarUrl} />
                </a>
              </li>
            ))}
          </ul>
          {total > rows.length && (
            <Button href="/talent" variant="outline" className="mt-4">인재정보 전체 보기</Button>
          )}
        </>
      )}
    </Section>
  );
}

// ─────────────────────── ③ 권한이 없는 사람 — 기능 설명 ───────────────────────

function HowItWorks({ loggedIn, hospital = false }: Readonly<{ loggedIn: boolean; hospital?: boolean }>) {
  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card
          title="간호사 — 맞는 공고를 자동으로"
          body="이력서를 등록해 두면, 지금 지원을 받고 있는 공고 중에서 희망 근무지·근무부서·직종·고용형태·급여가 맞는 곳을 조건이 많이 맞는 순서로 모아 드립니다. 어떤 조건이 다른지도 카드마다 적어 드립니다. 이력서를 비공개로 두어도 이 추천은 그대로 받습니다."
          href={loggedIn && !hospital ? "/mypage/resume" : "/signup"}
          label={loggedIn && !hospital ? "이력서 등록하기" : "간호사 회원가입"}
        />
        <Card
          title="병원 — 맞는 인재를 자동으로"
          body="공고를 게재하면 그 공고의 진료과·지역에 맞는 간호사 인재를 자동으로 보여 드립니다. 이름·연락처는 광고 중인 병원에게만 열립니다."
          href={loggedIn && hospital ? "/mypage/jobs" : "/hospital"}
          label={loggedIn && hospital ? "내 공고 관리" : "병원 회원·공고등록"}
        />
      </div>
      <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        추천하는 공고는 <b className="text-slate-800">지금 지원을 받고 있는 것</b>뿐입니다 — 마감된 공고는 나오지 않습니다.
        병원에게 보이는 인재는 <b className="text-slate-800">공개된 이력서</b>뿐이고, 비공개로 두면 인재 검색에서만
        빠집니다(<b className="text-slate-800">공고 추천은 그대로</b> 받습니다).
      </p>
    </div>
  );
}

function Card({ title, body, href, label }: Readonly<{ title: string; body: string; href: string; label: string }>) {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-bold text-slate-900">{title}</h2>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{body}</p>
      <Button href={href} className="mt-4 self-start">{label}</Button>
    </div>
  );
}

// ─────────────────────── 공용 조각 ───────────────────────

function Section({
  title,
  count,
  unit,
  children,
}: Readonly<{ title: string; count?: number; unit?: string; children: React.ReactNode }>) {
  return (
    <section className="mt-6 border-t border-slate-100 pt-6 first:border-t-0">
      <h2 className="mb-3 text-lg font-bold text-slate-900">
        {title}
        {count !== undefined && (
          <span className="ml-2 text-sm font-semibold text-teal-700">{count.toLocaleString()}{unit}</span>
        )}
      </h2>
      {children}
    </section>
  );
}

function Pager({ page, totalPages }: Readonly<{ page: number; totalPages: number }>) {
  if (totalPages <= 1) return null;
  const href = (n: number) => (n > 1 ? `/match?page=${n}` : "/match");
  return (
    <nav aria-label="쪽 이동" className="mt-6 flex items-center justify-center gap-3 text-sm">
      {page > 1 ? (
        <a href={href(page - 1)} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">← 이전</a>
      ) : (
        <span />
      )}
      <span className="text-slate-500">{page} / {totalPages}</span>
      {page < totalPages ? (
        <a href={href(page + 1)} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">다음 →</a>
      ) : (
        <span />
      )}
    </nav>
  );
}
