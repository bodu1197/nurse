import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import { Pager } from "@/components/MasterDetail";
import TalentCard from "@/components/TalentCard";
import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/data/user";
import {
  searchPublicTalent, revealContacts, canRevealContacts, TALENT_PER_PAGE,
} from "@/lib/data/talent";
import { REGIONS } from "@/lib/resumeOptions";
import { JOB_SPECIALTIES } from "@/lib/constants";

export const metadata = {
  title: "간호사 인재정보 — 널스넷",
  description: "이력서를 공개한 간호사 인재를 경력·진료과·근무형태로 검색하세요.",
  alternates: { canonical: "/talent" },
};

const field = "h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40";
const YEARS = [1, 3, 5, 10];

export default async function TalentPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ spec?: string; loc?: string; years?: string; page?: string; t?: string }> }>) {
  const [{ spec, loc, years, page, t: selectedId }, p] = await Promise.all([searchParams, getMyProfile()]);
  // 예전 마스터-디테일의 ?t= 링크(공유 주소)는 단독 상세로 넘긴다(/jobs의 ?j= 처리와 동일).
  if (selectedId) redirect(`/talent/${encodeURIComponent(selectedId)}`);
  const pageNum = Math.max(1, Number(page) || 1);
  const minYears = Number(years) || 0;
  const specialty = JOB_SPECIALTIES.includes(spec as (typeof JOB_SPECIALTIES)[number]) ? spec : undefined;

  const { rows, total } = await searchPublicTalent({ specialty, location: loc, minYears }, pageNum);
  const totalPages = Math.max(1, Math.ceil(total / TALENT_PER_PAGE));

  // 광고 중인 병원(또는 관리자)만 이름·전화를 붙인다.
  const canSeeContacts = await canRevealContacts(p);
  // 광고를 낼 수 있는(=아직 못 보는) 병원·비로그인에게만 광고 안내를 띄운다.
  const showAdCta = !canSeeContacts;

  // 카드의 이름 미리보기 — 광고 병원만. 목록 rows에 한해 조회.
  const contacts = canSeeContacts
    ? await revealContacts(rows.map((r) => r.profile_id))
    : new Map<string, { name: string | null; phone: string | null }>();

  const href = (params: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    if (specialty) q.set("spec", specialty);
    if (loc) q.set("loc", loc);
    if (minYears) q.set("years", String(minYears));
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, String(v));
    const s = q.toString();
    return s ? `/talent?${s}` : "/talent";
  };

  return (
    <>
      <SiteHeader user={p ? { displayName: p.displayName } : null} />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6">
        <h1 className="text-2xl font-bold text-slate-900">간호사 인재정보</h1>
        <p className="mt-1 text-sm text-slate-600">
          {specialty || loc || minYears ? "검색 결과" : "이력서를 공개한 간호사"} <b className="text-slate-800">{total}명</b>.
          {!canSeeContacts && " 이름·연락처는 광고 중인 병원 회원만 볼 수 있습니다."}
        </p>

        <form action="/talent" method="get" className="mt-4 flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="spec" className="text-xs font-medium text-slate-600">진료과</label>
            <select id="spec" name="spec" defaultValue={specialty ?? ""} className={field}>
              <option value="">전체</option>
              {JOB_SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="loc" className="text-xs font-medium text-slate-600">희망 근무지</label>
            <select id="loc" name="loc" defaultValue={loc ?? ""} className={field}>
              <option value="">전체</option>
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="years" className="text-xs font-medium text-slate-600">최소 경력</label>
            <select id="years" name="years" defaultValue={minYears || ""} className={field}>
              <option value="">무관</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}년 이상</option>)}
            </select>
          </div>
          <Button type="submit" size="md">검색</Button>
        </form>

        {showAdCta && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm">
            <span className="text-teal-900">인재의 <b>이름·연락처를 보고 직접 채용 제안</b>하려면 광고를 등록하세요.</span>
            <a href={p?.role === "hospital" ? "/mypage/jobs" : "/hospital"} className="shrink-0 rounded font-semibold text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2">광고 안내 →</a>
          </div>
        )}

        {rows.length === 0 ? (
          <p className="py-20 text-center text-slate-500">조건에 맞는 인재가 없습니다. 필터를 넓혀보세요.</p>
        ) : (
          <>
            {/* 메인·채용공고처럼 카드만 2열로 나열 — 누르면 인재 상세(/talent/[id])로 이동한다. */}
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {rows.map((t) => (
                <li key={t.profile_id}>
                  <a href={`/talent/${t.profile_id}`} className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
                    <TalentCard t={t} contactName={contacts.get(t.profile_id)?.name} />
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
