import SiteHeader from "@/components/SiteHeader";
import { Pager } from "@/components/MasterDetail";
import TalentCard from "@/components/TalentCard";
import TalentRegionBar from "@/components/TalentRegionBar";
import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/data/user";
import {
  searchPublicTalent, revealContacts, canRevealContacts, TALENT_PER_PAGE,
  getTalentSidoList, getTalentSigunguList, type RevealedContact,
} from "@/lib/data/talent";
import { JOB_SPECIALTIES } from "@/lib/constants";
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
  description: "이력서를 공개한 간호사 인재를 지역·진료과·경력으로 검색하세요.",
  robots: { index: false },
};

const YEARS = [1, 3, 5, 10] as const;

export default async function TalentPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ spec?: string; sido?: string; sigungu?: string; loc?: string; years?: string; page?: string; t?: string }> }>) {
  const [{ spec, sido, sigungu, loc, years, page, t: selectedId }, p] = await Promise.all([searchParams, getMyProfile()]);
  // 예전 마스터-디테일의 ?t= 링크(공유 주소)는 단독 상세로 넘긴다(/jobs의 ?j= 처리와 동일).
  if (selectedId) redirect(`/talent/${encodeURIComponent(selectedId)}`);
  const pageNum = Math.max(1, Number(page) || 1);
  const minYears = Number(years) || 0;
  const specialty = JOB_SPECIALTIES.includes(spec as (typeof JOB_SPECIALTIES)[number]) ? spec : undefined;
  // 예전 1단 링크(?loc=서울)는 시도로 받아준다 — 저장된 주소·외부 링크가 끊기지 않게.
  const sd = (sido ?? loc ?? "").trim();
  // 시군구는 시도에 종속 — 시도 없이 오면 무시한다(서버 필터와 같은 계약).
  const sgg = sd ? (sigungu ?? "").trim() : "";

  // 지역 팝업 목록은 목록 조회와 독립이라 같이 띄운다(순차로 하면 왕복이 그만큼 늘어난다).
  const [{ rows, total }, sidos, sigungus] = await Promise.all([
    searchPublicTalent({ specialty, sido: sd, sigungu: sgg, minYears }, pageNum),
    getTalentSidoList(),
    getTalentSigunguList(sd),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / TALENT_PER_PAGE));

  // 광고 중인 병원(또는 관리자)만 이름·전화를 붙인다.
  const canSeeContacts = await canRevealContacts(p);
  // 광고를 낼 수 있는(=아직 못 보는) 병원·비로그인에게만 광고 안내를 띄운다.
  const showAdCta = !canSeeContacts;

  // 카드의 이름 미리보기 — 광고 병원만. 목록 rows에 한해 조회.
  const contacts = canSeeContacts
    ? await revealContacts(rows.map((r) => r.profile_id))
    : new Map<string, RevealedContact>();

  const href = (params: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    if (specialty) q.set("spec", specialty);
    if (sd) q.set("sido", sd);
    if (sgg) q.set("sigungu", sgg);
    if (minYears) q.set("years", String(minYears));
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, String(v));
    const s = q.toString();
    return s ? `/talent?${s}` : "/talent";
  };
  // 칩 href — 나머지 필터는 유지하고 하나만 바꾼다(페이지는 리셋). undefined 로 넘긴 값은 유지, "" 은 해제.
  const build = (o: { spec?: string; years?: number }) => {
    const q = new URLSearchParams();
    const s2 = o.spec !== undefined ? o.spec : specialty;
    const y2 = o.years !== undefined ? o.years : minYears;
    if (s2) q.set("spec", s2);
    if (sd) q.set("sido", sd);
    if (sgg) q.set("sigungu", sgg);
    if (y2) q.set("years", String(y2));
    const s = q.toString();
    return s ? `/talent?${s}` : "/talent";
  };

  return (
    <>
      <SiteHeader user={p ? { displayName: p.displayName } : null} />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6">
        <h1 className="text-2xl font-bold text-slate-900">간호사 인재정보</h1>
        <p className="mt-1 text-sm text-slate-600">
          {specialty || sd || minYears ? "검색 결과" : "이력서를 공개한 간호사"} <b className="text-slate-800">{total}명</b>.
          {!canSeeContacts && " 이름·연락처·사진은 광고 중인 병원 회원만 볼 수 있습니다."}
        </p>

        {/* /jobs 검색과 동일한 UI — 지역 픽커(pill) + 진료과 칩 + 경력 칩. 고르면 즉시 조회(검색 버튼 없음). */}
        <div className="mt-4">
          <TalentRegionBar sido={sd} sigungu={sgg} sidos={sidos} sigungus={sigungus} />
        </div>
        <nav aria-label="진료과" className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-0.5 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
          <a href={build({ spec: "" })} aria-current={!specialty ? "page" : undefined} className={chip(!specialty)}>진료과 전체</a>
          {JOB_SPECIALTIES.map((s) => (
            <a key={s} href={build({ spec: s })} aria-current={specialty === s ? "page" : undefined} className={chip(specialty === s)}>{s}</a>
          ))}
        </nav>
        <nav aria-label="최소 경력" className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-0.5 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
          <a href={build({ years: 0 })} aria-current={!minYears ? "page" : undefined} className={chip(!minYears)}>경력 무관</a>
          {YEARS.map((y) => (
            <a key={y} href={build({ years: y })} aria-current={minYears === y ? "page" : undefined} className={chip(minYears === y)}>{y}년 이상</a>
          ))}
        </nav>

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
            <Pager page={pageNum} totalPages={totalPages} href={(n) => href({ page: n })} />
          </>
        )}
      </main>
    </>
  );
}
