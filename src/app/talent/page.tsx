import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import { Pager } from "@/components/MasterDetail";
import TalentCard from "@/components/TalentCard";
import TalentSearchBar from "@/components/TalentSearchBar";
import { redirect } from "next/navigation";
import { getMyProfile, viewAsRole } from "@/lib/data/user";
import {
  searchPublicTalent, revealContacts, canRevealContacts, TALENT_PER_PAGE, talentFilterQs,
  getTalentSidoList, getTalentSigunguList, getTalentFacets, getSavedTalentIds, type RevealedContact,
} from "@/lib/data/talent";
import { toggleSaveTalent } from "@/app/talent/actions";
import { SaveIcon } from "@/components/JobDetail";
import { chipClass as chip } from "@/lib/chip";
import { socialMeta } from "@/lib/constants";

/**
 * 🔴 인재정보를 **색인한다**(오너 지시 2026-08-08). 2026-08-06 에 걸었던 noindex 를 되돌린다.
 *    근거: "개인정보를 닫아두고 있기 때문에 무해하다" — 이름·휴대폰·이메일·증명사진은
 *    **광고 중인 병원에만** 붙고(revealContacts), 본인이 제목·자기소개에 적어 둔 실명·전화도
 *    서버에서 가려서 내보낸다(lib/maskPii 의 maskFree).
 *    크롤러는 로그인하지 않으므로 색인되는 것은 제목·소개·경력·희망조건·성별·나이뿐이다.
 *
 * 🔴 다시 막아야 할 일이 생기면 robots.txt Disallow 가 아니라 **여기 noindex** 로 막는다
 *    (app/robots.ts 주석 참고 — 크롤러가 못 들어오면 noindex 를 못 읽어 오히려 안 빠진다).
 */
const TALENT_TITLE = "간호사 인재정보 — 널스넷";
const TALENT_DESC = "이력서를 공개한 간호사 인재를 지역·근무부서·직종·경력으로 검색하세요.";

/**
 * /talent 가 받는 쿼리 파라미터 — **이 목록 하나가 정본이다**(/jobs 의 JOB_QUERY_KEYS 와 같은 계약).
 *
 * 🔴 색인 판정(아래 filtered)과 화면(TalentPage 의 searchParams)이 **같은 목록에서 파생**된다.
 *    두 곳에 손으로 나눠 적으면 한쪽만 늘어난 날 조용히 샌다 — /jobs 에서 정확히 그 사고가 났다
 *    (lat·lng·r 이 색인 판정에서만 빠져 사용자 GPS 좌표가 박힌 주소가 색인 허용이었다, 실측 2026-08-06).
 *    파라미터를 늘릴 일이 생기면 여기에만 추가한다.
 */
const TALENT_QUERY_KEYS = ["q", "dept", "cat", "spec", "sido", "sigungu", "loc", "years", "page", "t"] as const;
type TalentSearchParams = Partial<Record<(typeof TALENT_QUERY_KEYS)[number], string>>;

export async function generateMetadata({
  searchParams,
}: Readonly<{ searchParams: Promise<TalentSearchParams> }>): Promise<Metadata> {
  const sp = await searchParams;
  // 🔴 page=1 은 조건이 아니다 — 목록 첫 쪽과 같은 화면이다. 이걸 '좁힌 화면'으로 치면
  //    `/talent?page=1` 이 noindex 이면서 canonical 도 없는 고아가 된다(레거시 링크가 정본으로 안 접힌다).
  const filtered = TALENT_QUERY_KEYS.some((k) => (k === "page" ? Number(sp.page) > 1 : !!sp[k]));
  return {
    title: TALENT_TITLE,
    description: TALENT_DESC,
    ...socialMeta({ url: "/talent", title: TALENT_TITLE, description: TALENT_DESC }),
    // 🔴 canonical 과 noindex 를 같은 head 에 함께 내지 않는다 — 서로 모순된 지시라 noindex 가
    //    정본(/talent)으로 전파돼 목록 본체가 통째로 빠질 수 있다(/jobs 주석에 실측 사례).
    ...(filtered ? { robots: { index: false } } : { alternates: { canonical: "/talent" } }),
  };
}

const YEARS = [1, 3, 5, 10] as const;

export default async function TalentPage({
  searchParams,
}: Readonly<{ searchParams: Promise<TalentSearchParams> }>) {
  const [{ q, dept, cat, spec, sido, sigungu, loc, years, page, t: selectedId }, p] =
    await Promise.all([searchParams, getMyProfile()]);
  // 예전 마스터-디테일의 ?t= 링크(공유 주소)는 단독 상세로 넘긴다(/jobs의 ?j= 처리와 동일).
  if (selectedId) {
    // 조건도 함께 넘긴다 — 안 그러면 이 경로로 들어온 사람만 상세에서 필터를 잃는다.
    const keep = talentFilterQs(
      { q: (q ?? "").trim(), dept: (dept ?? spec ?? "").trim(), cat, sido: (sido ?? loc ?? "").trim(), sigungu, years: Number(years) || 0 },
      Math.max(1, Number(page) || 1),
    );
    redirect(`/talent/${encodeURIComponent(selectedId)}${keep ? `?${keep}` : ""}`);
  }
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

  // 카드 → 상세로 들고 갈 조건(현재 페이지 포함). 상세의 왼쪽 목록이 이 조건으로 다시 검색한다.
  const detailQs = talentFilterQs({ q: kw, dept: department, cat, sido: sd, sigungu: sgg, years: minYears }, pageNum);
  // 💾 찜은 병원 회원만. 찜한 뒤에는 **보던 검색 결과 그 자리**로 되돌아온다 —
  //    한 명 담을 때마다 목록 1페이지로 튀면 후보를 모을 수가 없다.
  const listHref = "/talent" + (detailQs ? `?${detailQs}` : "");
  const canSave = (await viewAsRole(p?.role ?? "nurse")) === "hospital";
  const savedIds = canSave ? await getSavedTalentIds(rows.map((r) => r.profile_id)) : new Set<string>();

  // 검색 조건 유지 URL. 한 곳에서 직렬화해 목록 이동·칩 전환이 같은 조건을 따라간다.
  // 🔴 직렬화는 talentFilterQs 한 곳만 쓴다. 빌더가 두 벌이면 같은 조건인데 URL 문자열이 달라져
  //    '되돌아가기' 가 실제로 타고 온 주소와 어긋난다(히스토리·캐시가 둘로 갈린다).
  const qs = (o: { dept?: string; cat?: string; years?: number; page?: number }) => {
    const s = talentFilterQs(
      {
        q: kw,
        dept: o.dept !== undefined ? o.dept : department,
        cat: o.cat !== undefined ? o.cat : cat,
        sido: sd,
        sigungu: sgg,
        years: o.years !== undefined ? o.years : minYears,
      },
      o.page,
    );
    return "/talent" + (s ? `?${s}` : "");
  };

  const filtered = !!(kw || department || cat || sd || minYears);

  return (
    <>
      <SiteHeader user={p ? { displayName: p.displayName } : null} />

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
                <li key={t.profile_id} className="relative">
                  {/* 목록 행은 훑어보는 화면이라 들어올림(translate) 없이 테두리·그림자만 바뀐다.
                      카드 전체가 링크라 aria-label 이 없으면 스크린리더가 제목·자기소개·메타를 통째로 낭독한다
                      → 링크 이름을 "이름 · 제목" 으로 줄여 목록을 링크 단위로 훑을 수 있게 한다. */}
                  <a
                    // 🔴 조건을 함께 넘긴다. 이게 없어서 상세로 들어가는 순간 필터가 사라지고,
                    //    왼쪽 목록이 조건과 무관한 '같은 시도 8명' 으로 바뀌었다.
                    href={`/talent/${t.profile_id}${detailQs ? `?${detailQs}` : ""}`}
                    aria-label={`${contacts.get(t.profile_id)?.name ?? "간호사 회원"} · ${t.resume_title ?? "간호사 인재"}`}
                    className="block rounded-xl border border-slate-200 bg-white p-3 transition hover:border-teal-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 sm:p-4"
                  >
                    <TalentCard t={t} contactName={contacts.get(t.profile_id)?.name} contactAvatar={contacts.get(t.profile_id)?.avatarUrl} reserveAction={canSave} />
                  </a>
                  {/* 💾 찜 — 검색을 하다 말고 상세로 들어가지 않아도 담을 수 있어야 한다.
                      카드 전체가 링크라 폼을 **밖에** 겹쳐 둔다(링크 안에 버튼을 넣으면 눌렀을 때
                      둘 다 반응한다). 공고 목록 카드가 같은 방식으로 저장 버튼을 얹는다. */}
                  {canSave && (
                    <form action={toggleSaveTalent} className="absolute bottom-3 right-3">
                      <input type="hidden" name="talent_id" value={t.profile_id} />
                      <input type="hidden" name="next" value={listHref} />
                      <button type="submit" aria-label={savedIds.has(t.profile_id) ? "찜 해제" : "찜하기"}
                        className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 ${savedIds.has(t.profile_id) ? "border-teal-200 bg-teal-50 text-teal-700" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}>
                        <SaveIcon filled={savedIds.has(t.profile_id)} /> {savedIds.has(t.profile_id) ? "찜함" : "찜하기"}
                      </button>
                    </form>
                  )}
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
