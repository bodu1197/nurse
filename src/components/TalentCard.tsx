import { careerSummary } from "@/lib/resumeOptions";
import type { PublicTalent } from "@/lib/data/talent";

// 인재 카드 내용(목록 그리드·상세 사이드바 공용). 이름은 광고 병원만 실명, 그 외 "간호사 회원".
export default function TalentCard({ t, contactName }: Readonly<{ t: PublicTalent; contactName?: string | null }>) {
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
