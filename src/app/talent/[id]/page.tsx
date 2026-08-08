import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import TalentDetail from "@/components/TalentDetail";
import TalentCard from "@/components/TalentCard";
import { Pager } from "@/components/MasterDetail";
import { getMyProfile, viewAsRole } from "@/lib/data/user";
import { careerSummary } from "@/lib/resumeOptions";
import { socialMeta } from "@/lib/constants";
import {
  getPublicTalent, revealContacts, canRevealContacts, getSavedTalentIds,
  searchPublicTalent, talentFilterQs, TALENT_PER_PAGE, type RevealedContact,
} from "@/lib/data/talent";

/**
 * 개인 이력서 상세 — **색인한다**(오너 지시 2026-08-08, 근거는 /talent 목록 주석).
 *
 * 🔴 제목·설명에 **이름을 넣지 않는다.** 이름은 광고 중인 병원에만 보이는 값이라, 제목·OG 로
 *    새어 나가면 그 게이트가 통째로 무의미해진다 — 색인을 열든 막든 이 규칙은 그대로다.
 *    아래 title·desc 가 쓰는 값은 전부 마스킹을 거친 공개 필드다(getPublicTalent).
 */
export async function generateMetadata({ params }: Readonly<{ params: Promise<{ id: string }> }>): Promise<Metadata> {
  const { id } = await params;
  const t = await getPublicTalent(id);
  if (!t) return { title: "간호사 인재 상세 — 널스넷", robots: { index: false } };
  const title = `${t.resume_title ?? "간호사 인재"} — 널스넷 인재정보`;
  const desc = [
    careerSummary(t.career_level, t.experience_years),
    t.specialties.length > 0 ? t.specialties.join(", ") : null,
    t.desired_location,
  ].filter(Boolean).join(" · ");
  return {
    title,
    description: desc || "이력서를 공개한 간호사 인재 정보입니다.",
    alternates: { canonical: `/talent/${id}` },
    ...socialMeta({ type: "profile", url: `/talent/${id}`, title, description: desc }),
  };
}

export default async function TalentDetailPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; dept?: string; spec?: string; cat?: string; sido?: string; loc?: string; sigungu?: string; years?: string; page?: string }>;
}>) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [t, p] = await Promise.all([getPublicTalent(id), getMyProfile()]);
  if (!t) notFound(); // 비공개·없는 이력서는 404 (getPublicTalent가 is_public=true만 반환)

  const kw = (sp.q ?? "").trim();
  // 목록이 받아주는 예전 별칭(?spec=·?loc=)도 같이 받는다 — 한쪽만 알면 그 링크로 온 사람은 조건을 잃는다.
  const dept = (sp.dept ?? sp.spec ?? "").trim();
  const cat = (sp.cat ?? "").trim();
  const sd = (sp.sido ?? sp.loc ?? "").trim();
  // 시군구는 시도에 종속 — 시도 없이 오면 무시한다(목록·서버 필터와 같은 계약).
  const sgg = sd ? (sp.sigungu ?? "").trim() : "";
  const minYears = Number(sp.years) || 0;
  const pageNum = Math.max(1, Number(sp.page) || 1);

  /**
   * 🔴 왼쪽 목록은 **항상 목록(/talent)과 같은 결과**다 — 조건이 있으면 그 조건으로, 없으면 전체를,
   *    같은 페이지 크기(20)로 나눠 보여준다.
   *
   *    예전에는 조건을 받지도 않고 getRelatedTalent(…, limit 8) 만 불러서 '같은 시도 인재 8명' 이
   *    무조건 똑같이 떴다(오너 지적: "서울·종로구·산부인과로 필터링했으면 그 조건에 맞는 모든 카드가
   *    표시되어야 한다"). 조건 유무로 갈라 폴백을 두면, 필터 없이 훑다가 카드를 누른 사람에게는
   *    그 8개 화면이 그대로 남는다 — 실제로 가장 많이 지나가는 경로다. 그래서 분기를 없앴다.
   */
  const hasFilter = !!(kw || dept || cat || sd || minYears);
  const qsFor = (toPage: number) => talentFilterQs({ q: kw, dept, cat, sido: sd, sigungu: sgg, years: minYears }, toPage);
  const searchQs = qsFor(pageNum);
  const backHref = "/talent" + (searchQs ? `?${searchQs}` : "");
  // 되돌아가기와 같은 조건을 유지한다 — 한쪽만 page 를 버리면 카드를 한 번 누른 뒤 목록이 1페이지로 튄다.
  const sideHref = (pid: string) => `/talent/${pid}` + (searchQs ? `?${searchQs}` : "");
  const pageHref = (toPage: number) => { const s = qsFor(toPage); return `/talent/${id}` + (s ? `?${s}` : ""); };

  // 지금 보고 있는 주소 그대로(검색 조건 포함) — 찜한 뒤 이 자리로 되돌아온다.
  const selfHref = `/talent/${id}` + (searchQs ? `?${searchQs}` : "");
  // 💾 찜은 **병원 회원**만. 관리자가 병원 보기로 들어온 경우도 포함된다(viewAsRole 은 액션이 다시 본다).
  const canSave = (await viewAsRole(p?.role ?? "nurse")) === "hospital";

  // 서로 의존하지 않는 조회는 함께 보낸다. 열람 자격 판정과 목록은 독립.
  const [canSeeContacts, side] = await Promise.all([
    canRevealContacts(p), // 광고 병원(또는 관리자)만 이름·전화
    searchPublicTalent({ q: kw, specialty: dept, category: cat, sido: sd, sigungu: sgg, minYears }, pageNum)
      // 보고 있는 본인은 왼쪽 목록에서 뺀다(자기 카드를 자기 화면에서 또 볼 이유가 없다).
      .then((r) => ({ rows: r.rows.filter((x) => x.profile_id !== t.profile_id), total: r.total })),
  ]);
  const sidebar = side.rows;
  const totalPages = Math.max(1, Math.ceil(side.total / TALENT_PER_PAGE));

  const contactIds = [t.profile_id, ...sidebar.map((r) => r.profile_id)];
  const [contacts, savedIds] = await Promise.all([
    canSeeContacts ? revealContacts(contactIds) : Promise.resolve(new Map<string, RevealedContact>()),
    canSave ? getSavedTalentIds(contactIds) : Promise.resolve(new Set<string>()),
  ]);
  const contact = contacts.get(t.profile_id);

  // 제목: 조건이 걸려 있으면 "검색 결과", 아니면 그냥 목록이다. 건수는 항상 총계(side.total)를 쓴다.
  const sidebarTitle = hasFilter ? "검색 결과" : "인재정보";

  return (
    <>
      <SiteHeader user={p ? { displayName: p.displayName } : null} />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6">
        {/* 되돌아갈 곳도 조건을 유지한다 — 안 그러면 목록으로 돌아가는 순간 필터가 풀린다.
            🔴 닫기(X)를 오른쪽에 둔다. 공고 상세에는 있는데 여기엔 없어서, 병원이 후보를 하나
               열어 본 뒤 나가려면 뒤로가기밖에 없었고 그러면 검색 첫 화면으로 튀어 **처음부터
               다시 검색**해야 했다(오너 지적 2026-08-07). 둘 다 같은 backHref 로 간다. */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <Link href={backHref} className="inline-block text-sm text-teal-700 hover:underline">← {hasFilter ? "검색 결과로" : "인재정보 목록"}</Link>
          <Link href={backHref} aria-label="닫기" className="grid h-11 w-11 place-items-center rounded-full text-lg leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">✕</Link>
        </div>

        {/* 사이드바에 보일 게 있을 때만 2열. 없으면 상세만 읽기 좋은 폭으로. */}
        <div className="lg:grid lg:grid-cols-[minmax(0,320px)_1fr] lg:items-start lg:gap-6">
          {/* 상세 — 모바일에선 먼저, 데스크톱에선 오른쪽 */}
          <div className="lg:col-start-2 lg:row-start-1 lg:max-w-3xl">
            <TalentDetail t={t} contact={contact} contactGated={!canSeeContacts} asH1
              canSave={canSave} saved={savedIds.has(t.profile_id)} selfHref={selfHref} />
          </div>

          {/* 목록 — 모바일에선 상세 아래, 데스크톱에선 왼쪽 사이드바 */}
          {/* 🔴 결과 개수로 사이드바 전체를 가리지 않는다. 마지막 페이지에 본인 한 명만 남으면
              제목·총건수·페이저까지 통째로 사라져, 361명짜리 검색결과인데 왼쪽이 텅 비고
              이전 페이지로 돌아갈 길도 없어진다. */}
          <aside aria-label={sidebarTitle} className="mt-10 lg:col-start-1 lg:row-start-1 lg:mt-0">
              <h2 className="mb-3 text-sm font-bold text-slate-900">
                {sidebarTitle} <span className="font-normal text-slate-400">({side.total.toLocaleString()})</span>
                {totalPages > 1 && <span className="ml-1 font-normal text-slate-400">· {pageNum}/{totalPages}p</span>}
              </h2>
              {sidebar.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-500">
                  이 페이지에 표시할 다른 인재가 없습니다.
                </p>
              )}
              <ul className="space-y-2">
                {sidebar.map((r) => (
                  <li key={r.profile_id}>
                    <a href={sideHref(r.profile_id)} className="block rounded-xl border border-slate-200 bg-white p-3 transition hover:border-teal-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
                      <TalentCard t={r} contactName={contacts.get(r.profile_id)?.name} contactAvatar={contacts.get(r.profile_id)?.avatarUrl} compact />
                    </a>
                  </li>
                ))}
              </ul>
              {/* 페이지네이션 — 같은 상세에 머물며 사이드바 페이지만 넘긴다(공고 상세와 같은 방식). */}
              {/* nofollow — 상세는 이제 색인 대상이라, 이 페이저를 크롤러가 따라가면
                  이력서 7,770건 × 389쪽 ≈ 300만 주소를 긁는다(봇 요청은 이미 하루 12만 건이다).
                  사람에게는 그대로 동작한다. */}
              {totalPages > 1 && <Pager page={pageNum} totalPages={totalPages} href={pageHref} nofollow />}
          </aside>
        </div>
      </main>
    </>
  );
}
