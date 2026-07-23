import { redirect } from "next/navigation";
import HospitalShell from "@/components/HospitalShell";
import Button from "@/components/Button";
import { getMyProfile } from "@/lib/data/user";
import { isAdvertiser, searchTalent, TALENT_PER_PAGE, type TalentRow } from "@/lib/data/talent";
import { JOB_SPECIALTIES } from "@/lib/constants";

export const metadata = { title: "인재 검색 — 널스넷", robots: { index: false } };

const field = "h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40";
const YEARS = [1, 3, 5, 10];

function Talent({ t }: Readonly<{ t: TalentRow }>) {
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="font-bold text-slate-900">{t.name ?? "이름 미입력"}</h3>
        {t.license_type && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">{t.license_type}</span>}
        {t.experience_years != null && <span className="text-sm text-slate-600">경력 {t.experience_years}년</span>}
        {t.desired_employment_type && <span className="text-sm text-slate-500">· {t.desired_employment_type}</span>}
      </div>

      {t.specialties.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {t.specialties.map((s) => <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{s}</span>)}
        </div>
      )}

      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {t.desired_location && <div className="flex gap-2"><dt className="w-20 shrink-0 text-slate-500">희망 근무지</dt><dd className="text-slate-800">{t.desired_location}</dd></div>}
        {t.desired_salary && <div className="flex gap-2"><dt className="w-20 shrink-0 text-slate-500">희망 급여</dt><dd className="text-slate-800">{t.desired_salary}</dd></div>}
        {t.education && <div className="flex gap-2"><dt className="w-20 shrink-0 text-slate-500">학력</dt><dd className="text-slate-800">{t.education}</dd></div>}
      </dl>

      {t.intro && <p className="mt-3 line-clamp-4 whitespace-pre-line text-sm text-slate-600">{t.intro}</p>}

      {t.phone && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">{t.phone}</span>
          <Button href={`tel:${t.phone}`} variant="outline" size="sm">전화</Button>
        </div>
      )}
    </li>
  );
}

// 광고 없는 병원이 보는 안내 — 왜 못 보는지와 다음 행동을 같이 준다.
function LockedNotice() {
  return (
    <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6">
      <h2 className="font-bold text-amber-900">인재 검색은 광고 중인 병원만 이용할 수 있습니다</h2>
      <p className="mt-2 text-sm text-amber-800">
        공고에 광고를 적용하면 광고 기간 동안 공개 이력서를 열람하고 직접 연락할 수 있습니다.
        (광고가 끝나면 열람도 함께 종료됩니다.)
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button href="/mypage/jobs" size="md">내 공고에 광고 올리기</Button>
        <Button href="/mypage/jobs/new" variant="outline" size="md">공고 먼저 등록하기</Button>
      </div>
    </div>
  );
}

export default async function TalentPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ spec?: string; loc?: string; years?: string; page?: string }> }>) {
  const p = await getMyProfile();
  if (!p) redirect("/login");
  if (p.role !== "hospital") redirect("/mypage");

  const { spec, loc, years, page } = await searchParams;
  const allowed = await isAdvertiser();
  const pageNum = Math.max(1, Number(page) || 1);
  const minYears = Number(years) || 0;
  const specialty = JOB_SPECIALTIES.includes(spec as (typeof JOB_SPECIALTIES)[number]) ? spec : undefined;

  const { rows, total } = allowed
    ? await searchTalent({ specialty, location: loc, minYears }, pageNum)
    : { rows: [], total: 0 };
  const totalPages = Math.max(1, Math.ceil(total / TALENT_PER_PAGE));

  const href = (toPage: number) => {
    const q = new URLSearchParams();
    if (specialty) q.set("spec", specialty);
    if (loc) q.set("loc", loc);
    if (minYears) q.set("years", String(minYears));
    if (toPage > 1) q.set("page", String(toPage));
    const s = q.toString();
    return s ? `/mypage/talent?${s}` : "/mypage/talent";
  };

  return (
    <HospitalShell displayName={p.displayName} active="/mypage/talent">
      <h1 className="text-2xl font-bold text-slate-900">인재 검색</h1>
      <p className="mt-1 text-sm text-slate-500">이력서를 공개한 간호사만 표시됩니다. 연락처로 직접 채용 제안을 보낼 수 있습니다.</p>

      {!allowed ? (
        <LockedNotice />
      ) : (
        <>
          <form method="get" className="mt-5 flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="spec" className="text-xs font-medium text-slate-500">진료과</label>
              <select id="spec" name="spec" defaultValue={specialty ?? ""} className={field}>
                <option value="">전체</option>
                {JOB_SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="years" className="text-xs font-medium text-slate-500">최소 경력</label>
              <select id="years" name="years" defaultValue={minYears ? String(minYears) : ""} className={field}>
                <option value="">전체</option>
                {YEARS.map((y) => <option key={y} value={y}>{y}년 이상</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="loc" className="text-xs font-medium text-slate-500">희망 근무지</label>
              <input id="loc" name="loc" defaultValue={loc ?? ""} placeholder="예: 서울" className={field} />
            </div>
            <Button type="submit" size="md">검색</Button>
          </form>

          <p className="mt-4 text-sm text-slate-500">공개 이력서 <b className="text-slate-800">{total}</b>건</p>

          {rows.length === 0 ? (
            <p className="py-20 text-center text-slate-500">조건에 맞는 이력서가 없습니다. 검색 조건을 넓혀보세요.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {rows.map((t) => <Talent key={t.profile_id} t={t} />)}
            </ul>
          )}

          {totalPages > 1 && (
            <nav className="mt-6 flex items-center justify-center gap-3" aria-label="페이지 이동">
              {pageNum > 1 && <Button href={href(pageNum - 1)} variant="outline" size="md">이전</Button>}
              <span className="text-sm text-slate-500">{pageNum} / {totalPages}</span>
              {pageNum < totalPages && <Button href={href(pageNum + 1)} variant="outline" size="md">다음</Button>}
            </nav>
          )}
        </>
      )}
    </HospitalShell>
  );
}
