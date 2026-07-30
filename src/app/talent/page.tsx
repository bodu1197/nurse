import SiteHeader from "@/components/SiteHeader";
import { Pager } from "@/components/MasterDetail";
import TalentCard from "@/components/TalentCard";
import TalentSearchBar from "@/components/TalentSearchBar";
import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/data/user";
import {
  searchPublicTalent, revealContacts, canRevealContacts, TALENT_PER_PAGE,
  getTalentSidoList, getTalentSigunguList, getTalentFacets, type RevealedContact,
} from "@/lib/data/talent";
import { chipClass as chip } from "@/lib/chip";

// 인재정보는 개인정보다 — 검색엔진에 절대 올리지 않는다(오너 확정).
// 카드가 이름을 가려도 경력·자격·희망지역이 모이면 개인 식별로 이어지고, 한 번 색인되면
// 캐시·스크래핑으로 우리 손을 떠난다. 상세(/talent/[id])는 이미 noindex 이고 목록도 같이 막는다.
// sitemap 에서도 뺀다(lib/constants.ts PUBLIC_ROUTES) — sitemap 등재 + noindex 는 서로 모순이다.
//
// 두 가지는 일부러 **안 한다**. 둘 다 noindex 를 무력화하기 때문이다:
//  · robots.txt Disallow — 크롤러가 못 들어오면 이 noindex 태그를 읽지 못해 URL만 색인된 채 남는다.
//  · follow:false — noindex 는 크롤러가 페이지를 가져와야 작동한다. 링크 통로를 막으면
//    이미 색인된 하위 페이지(/talent/[id])를 다시 방문해 빼낼 길이 없어진다.
export const metadata = {
  title: "간호사 인재정보 — 널스넷",
  description: "이력서를 공개한 간호사 인재를 지역·근무부서·직종·경력으로 검색하세요.",
  robots: { index: false },
};

const YEARS = [1, 3, 5, 10] as const;

export default async function TalentPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ q?: string; dept?: string; cat?: string; spec?: string; sido?: string; sigungu?: string; loc?: string; years?: string; page?: string; t?: string }> }>) {
  const [{ q, dept, cat, spec, sido, sigungu, loc, years, page, t: selectedId }, p] =
    await Promise.all([searchParams, getMyProfile()]);
  // 예전 마스터-디테일의 ?t= 링크(공유 주소)는 단독 상세로 넘긴다(/jobs의 ?j= 처리와 동일).
  if (selectedId) redirect(`/talent/${encodeURIComponent(selectedId)}`);
  const pageNum = Math.max(1, Number(page) || 1);
  const minYears = Number(years) || 0;
  const kw = (q ?? "").trim();
  // 예전 1단 링크(?loc=서울)는 시도로 받아준다 — 저장된 주소·외부 링크가 끊기지 않게.
  const sd = (sido ?? loc ?? "").trim();
  // 시군구는 시도에 종속 — 시도 없이 오면 무시한다(서버 필터와 같은 계약).
  const sgg = sd ? (sigungu ?? "").trim() : "";
  // 예전 링크(?spec=중환자실)는 근무부서(?dept=)로 받아준다 — 저장된 주소·외부 링크가 끊기지 않게.
  // 목록에 없는 값이면 조회 결과가 0건이 될 뿐이고, 화면에 그대로 찍히는 곳은 없다(칩 강조 비교에만 쓴다).
  const department = (dept ?? spec ?? "").trim();

  // 지역·부서·직종 목록은 목록 조회와 독립이라 같이 띄운다(순차로 하면 왕복이 그만큼 늘어난다).
  // canRevealContacts 도 여기 넣는다 — 뒤에 두면 목록을 다 받은 뒤에야 자격 조회가 시작돼 왕복이 한 번 더 붙는다.
  const [{ rows, total }, sidos, sigungus, facets, canSeeContacts] = await Promise.all([
    searchPublicTalent({ q: kw, specialty: department, category: cat, sido: sd, sigungu: sgg, minYears }, pageNum),
    getTalentSidoList(),
    getTalentSigunguList(sd),
    getTalentFacets(),
    canRevealContacts(p),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / TALENT_PER_PAGE));

  // 광고를 낼 수 있는(=아직 못 보는) 병원·비로그인에게만 광고 안내를 띄운다.
  const showAdCta = !canSeeContacts;

  // 카드의 이름 미리보기 — 광고 병원만. 목록 rows에 한해 조회.
  const contacts = canSeeContacts
    ? await revealContacts(rows.map((r) => r.profile_id))
    : new Map<string, RevealedContact>();

  // 검색 조건 유지 URL. 한 곳에서 직렬화해 목록 이동·칩 전환이 같은 조건을 따라간다.
  const qs = (o: { dept?: string; cat?: string; years?: number; page?: number }) => {
    const s = new URLSearchParams();
    if (kw) s.set("q", kw);
    if (sd) s.set("sido", sd);
    if (sgg) s.set("sigungu", sgg);
    const d = o.dept !== undefined ? o.dept : department;
    const c = o.cat !== undefined ? o.cat : cat;
    const y = o.years !== undefined ? o.years : minYears;
    if (d) s.set("dept", d);
    if (c) s.set("cat", c);
    if (y) s.set("years", String(y));
    if (o.page && o.page > 1) s.set("page", String(o.page));
    const out = s.toString();
    return out ? `/talent?${out}` : "/talent";
  };

  const filtered = !!(kw || department || cat || sd || minYears);

  return (
    <>
      <SiteHeader user={p ? { displayName: p.displayName, role: p.role } : null} />

      {/* 상단 검색: /jobs 와 같은 pill(지역 + 키워드 + 검색) — 두 화면의 조작법을 통일한다. */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1280px] px-4 py-4">
          <TalentSearchBar sidos={sidos} sigungus={sigungus} />
        </div>
      </div>

      {/* 근무부서·직종 칩 — **인재가 있는 것만** 많은 순. 0명인 칩은 눌러도 빈 화면이라 아예 안 그린다. */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1280px] space-y-2 px-4 py-3">
          <nav aria-label="근무부서" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
            <a href={qs({ dept: "" })} aria-current={!department ? "page" : undefined} className={chip(!department)}>근무부서 전체</a>
            {facets.departments.map((d) => (
              <a key={d.name} href={qs({ dept: d.name })} aria-current={department === d.name ? "page" : undefined} className={chip(department === d.name)}>{d.name}</a>
            ))}
          </nav>
          <nav aria-label="직종" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
            <a href={qs({ cat: "" })} aria-current={!cat ? "page" : undefined} className={chip(!cat)}>직종 전체</a>
            {facets.categories.map((c) => (
              <a key={c.name} href={qs({ cat: c.name })} aria-current={cat === c.name ? "page" : undefined} className={chip(cat === c.name)}>{c.name}</a>
            ))}
          </nav>
          <nav aria-label="최소 경력" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
            <a href={qs({ years: 0 })} aria-current={!minYears ? "page" : undefined} className={chip(!minYears)}>경력 무관</a>
            {YEARS.map((y) => (
              <a key={y} href={qs({ years: y })} aria-current={minYears === y ? "page" : undefined} className={chip(minYears === y)}>{y}년 이상</a>
            ))}
          </nav>
        </div>
      </div>

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6">
        <h1 className="text-2xl font-bold text-slate-900">간호사 인재정보</h1>
        <p className="mt-1 text-sm text-slate-600">
          {filtered ? "검색 결과" : "이력서를 공개한 간호사"} <b className="text-slate-800">{total}명</b>.
          {!canSeeContacts && " 이름·연락처·사진은 광고 중인 병원 회원만 볼 수 있습니다."}
        </p>

        {showAdCta && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm">
            <span className="text-teal-900">인재의 <b>이름·연락처·사진을 보고 직접 채용 제안</b>하려면 광고를 등록하세요.</span>
            <a href={p?.role === "hospital" ? "/mypage/jobs" : "/hospital"} className="shrink-0 rounded font-semibold text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2">광고 안내 →</a>
          </div>
        )}

        {rows.length === 0 ? (
          <p className="py-20 text-center text-slate-500">조건에 맞는 인재가 없습니다. 필터를 넓혀보세요.</p>
        ) : (
          <>
            {/* 구 널스넷처럼 한 줄에 하나씩 — 사진·제목·자기소개·메타를 한눈에 훑는 목록이라 2열로 쪼개면 좁아진다. */}
            <ul className="mt-4 flex flex-col gap-2">
              {rows.map((t) => (
                <li key={t.profile_id}>
                  {/* 목록 행은 훑어보는 화면이라 들어올림(translate) 없이 테두리·그림자만 바뀐다.
                      카드 전체가 링크라 aria-label 이 없으면 스크린리더가 제목·자기소개·메타를 통째로 낭독한다
                      → 링크 이름을 "이름 · 제목" 으로 줄여 목록을 링크 단위로 훑을 수 있게 한다. */}
                  <a
                    href={`/talent/${t.profile_id}`}
                    aria-label={`${contacts.get(t.profile_id)?.name ?? "간호사 회원"} · ${t.resume_title ?? "간호사 인재"}`}
                    className="block rounded-xl border border-slate-200 bg-white p-3 transition hover:border-teal-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 sm:p-4"
                  >
                    <TalentCard t={t} contactName={contacts.get(t.profile_id)?.name} contactAvatar={contacts.get(t.profile_id)?.avatarUrl} />
                  </a>
                </li>
              ))}
            </ul>
            <Pager page={pageNum} totalPages={totalPages} href={(n) => qs({ page: n })} />
          </>
        )}
      </main>
    </>
  );
}
