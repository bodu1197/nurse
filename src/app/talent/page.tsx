import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import { getMyProfile } from "@/lib/data/user";
import { searchPublicTalent, revealContacts, isAdvertiser, TALENT_PER_PAGE, type PublicTalent } from "@/lib/data/talent";
import { careerSummary, REGIONS } from "@/lib/resumeOptions";
import { JOB_SPECIALTIES } from "@/lib/constants";
import { fmtDay } from "@/lib/date";

export const metadata = {
  title: "간호사 인재정보 — 널스넷",
  description: "이력서를 공개한 간호사 인재를 경력·진료과·근무형태로 검색하세요.",
  alternates: { canonical: "/talent" },
};

const field = "h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40";
const YEARS = [1, 3, 5, 10];

type Contact = { name: string | null; phone: string | null } | undefined;

function TalentCard({ t, contact }: Readonly<{ t: PublicTalent; contact: Contact }>) {
  const region = (t.desired_location ?? "").split(",")[0]?.trim();
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {/* 이름은 광고 병원에게만. 그 외에는 마스킹해서 '누군가 있다'만 보이게 한다. */}
        <h3 className="font-bold text-slate-900">{contact?.name ?? "간호사 회원"}</h3>
        {t.license_type && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">{t.license_type}</span>}
        <span className="text-sm text-slate-600">{careerSummary(t.career_level, t.experience_years)}</span>
        {t.night_available && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">나이트 전담 가능</span>}
      </div>

      {t.resume_title && <p className="mt-1 text-sm font-medium text-slate-700">{t.resume_title}</p>}

      {(t.specialties.length > 0 || t.shift_types.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {t.shift_types.map((s) => <span key={`sh-${s}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{s}</span>)}
          {t.specialties.map((s) => <span key={`sp-${s}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{s}</span>)}
        </div>
      )}

      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {t.desired_location && <div className="flex gap-2"><dt className="w-20 shrink-0 text-slate-500">희망 근무지</dt><dd className="text-slate-800">{t.desired_location}</dd></div>}
        {t.certifications.length > 0 && <div className="flex gap-2"><dt className="w-20 shrink-0 text-slate-500">자격증</dt><dd className="text-slate-800">{t.certifications.join(", ")}</dd></div>}
        {t.education_level && <div className="flex gap-2"><dt className="w-20 shrink-0 text-slate-500">학력</dt><dd className="text-slate-800">{t.education_level}</dd></div>}
        {t.desired_salary && <div className="flex gap-2"><dt className="w-20 shrink-0 text-slate-500">희망 급여</dt><dd className="text-slate-800">{t.desired_salary}</dd></div>}
      </dl>

      {t.intro && <p className="mt-3 line-clamp-3 whitespace-pre-line text-sm text-slate-600">{t.intro}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <span className="text-xs text-slate-400">{fmtDay(t.updated_at)} 갱신{region ? ` · ${region}` : ""}</span>
        <span className="ml-auto flex items-center gap-2">
          {contact ? (
            contact.phone ? (
              <>
                <span className="text-sm font-semibold text-slate-800">{contact.phone}</span>
                <Button href={`tel:${contact.phone}`} variant="outline" size="sm" className="min-h-11">전화</Button>
              </>
            ) : <span className="text-xs text-slate-500">연락처 미입력</span>
          ) : (
            <span className="text-xs text-slate-500">🔒 연락처는 광고 병원만</span>
          )}
        </span>
      </div>
    </li>
  );
}

export default async function TalentPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ spec?: string; loc?: string; years?: string; page?: string }> }>) {
  const [{ spec, loc, years, page }, p] = await Promise.all([searchParams, getMyProfile()]);
  const pageNum = Math.max(1, Number(page) || 1);
  const minYears = Number(years) || 0;
  const specialty = JOB_SPECIALTIES.includes(spec as (typeof JOB_SPECIALTIES)[number]) ? spec : undefined;

  const { rows, total } = await searchPublicTalent({ specialty, location: loc, minYears }, pageNum);
  const totalPages = Math.max(1, Math.ceil(total / TALENT_PER_PAGE));

  // 광고 중인 병원(또는 관리자)만 이름·전화를 붙인다. (admin은 운영 확인용)
  const canSeeContacts = !!p && (p.role === "admin" || (p.role === "hospital" && (await isAdvertiser())));
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
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
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

        {!canSeeContacts && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm">
            <span className="text-teal-900">인재의 <b>이름·연락처를 보고 직접 채용 제안</b>하려면 광고를 등록하세요.</span>
            <Link href={p?.role === "hospital" ? "/mypage/jobs" : "/hospital"} className="shrink-0 rounded font-semibold text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2">광고 안내 →</Link>
          </div>
        )}

        {rows.length === 0 ? (
          <p className="py-20 text-center text-slate-500">조건에 맞는 인재가 없습니다. 필터를 넓혀보세요.</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {rows.map((t) => <TalentCard key={t.profile_id} t={t} contact={canSeeContacts ? contacts.get(t.profile_id) : undefined} />)}
          </ul>
        )}

        {totalPages > 1 && (
          <nav className="mt-6 flex items-center justify-center gap-3 text-sm" aria-label="페이지">
            {pageNum > 1 ? <Link href={href({ page: pageNum - 1 })} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">← 이전</Link> : <span />}
            <span className="text-slate-500">{pageNum} / {totalPages}</span>
            {pageNum < totalPages ? <Link href={href({ page: pageNum + 1 })} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">다음 →</Link> : <span />}
          </nav>
        )}
      </main>
    </>
  );
}
