import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import MasterDetail, { ListCard, Pager } from "@/components/MasterDetail";
import TalentDetail from "@/components/TalentDetail";
import { getMyProfile } from "@/lib/data/user";
import {
  searchPublicTalent, getPublicTalent, revealContacts, isAdvertiser, TALENT_PER_PAGE, type PublicTalent,
} from "@/lib/data/talent";
import { careerSummary, REGIONS } from "@/lib/resumeOptions";
import { JOB_SPECIALTIES } from "@/lib/constants";

export const metadata = {
  title: "간호사 인재정보 — 널스넷",
  description: "이력서를 공개한 간호사 인재를 경력·진료과·근무형태로 검색하세요.",
  alternates: { canonical: "/talent" },
};

const field = "h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40";
const YEARS = [1, 3, 5, 10];

function Card({ t, contactName }: Readonly<{ t: PublicTalent; contactName?: string | null }>) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="font-bold text-slate-900">{contactName ?? "간호사 회원"}</h3>
        {t.license_type && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">{t.license_type}</span>}
        <span className="text-sm text-slate-600">{careerSummary(t.career_level, t.experience_years)}</span>
        {t.night_available && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">나이트</span>}
      </div>
      {t.resume_title && <p className="mt-1 truncate text-sm text-slate-700">{t.resume_title}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        {t.shift_types.slice(0, 2).map((s) => <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{s}</span>)}
        {t.specialties.slice(0, 2).map((s) => <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{s}</span>)}
        {t.desired_location && <span className="text-slate-500">· {t.desired_location.split(",")[0]}</span>}
      </div>
    </>
  );
}

export default async function TalentPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ spec?: string; loc?: string; years?: string; page?: string; t?: string }> }>) {
  const [{ spec, loc, years, page, t: selectedId }, p] = await Promise.all([searchParams, getMyProfile()]);
  const pageNum = Math.max(1, Number(page) || 1);
  const minYears = Number(years) || 0;
  const specialty = JOB_SPECIALTIES.includes(spec as (typeof JOB_SPECIALTIES)[number]) ? spec : undefined;

  const { rows, total } = await searchPublicTalent({ specialty, location: loc, minYears }, pageNum);
  const totalPages = Math.max(1, Math.ceil(total / TALENT_PER_PAGE));

  // 광고 중인 병원(또는 관리자)만 이름·전화를 붙인다.
  const canSeeContacts = !!p && (p.role === "admin" || (p.role === "hospital" && (await isAdvertiser())));
  // 광고를 낼 수 있는(=아직 못 보는) 병원·비로그인에게만 광고 안내를 띄운다.
  const showAdCta = !canSeeContacts;

  const ids = rows.map((r) => r.profile_id);
  // 선택 인재가 이번 페이지에 없어도(공유 링크) 그 인재를 연다.
  const selected = selectedId || rows[0]?.profile_id;
  const detail = selected ? await getPublicTalent(selected) : null;

  // 연락처는 목록(이름 미리보기) + 상세에 필요하므로, 상세가 목록 밖이면 그 id도 함께 조회한다.
  const contactIds = detail && !ids.includes(detail.profile_id) ? [...ids, detail.profile_id] : ids;
  const contacts = canSeeContacts ? await revealContacts(contactIds) : new Map<string, { name: string | null; phone: string | null }>();

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
          <MasterDetail
            selecting={!!selectedId}
            list={
              <>
                <ul className="space-y-3">
                  {rows.map((t) => (
                    <li key={t.profile_id}>
                      <ListCard href={href({ t: t.profile_id, page: pageNum > 1 ? pageNum : undefined })} on={ids.includes(selected ?? "") && selected === t.profile_id}>
                        <Card t={t} contactName={contacts.get(t.profile_id)?.name} />
                      </ListCard>
                    </li>
                  ))}
                </ul>
                <Pager page={pageNum} totalPages={totalPages} href={(n) => href({ page: n })} />
              </>
            }
            detail={detail && <TalentDetail t={detail} contact={canSeeContacts ? contacts.get(detail.profile_id) : undefined} contactGated={showAdCta} />}
          />
        )}
      </main>
    </>
  );
}
