import Link from "next/link";
import { careerSummary } from "@/lib/resumeOptions";
import { fmtDay } from "@/lib/date";
import type { PublicTalentDetail } from "@/lib/data/talent";

// 인재 상세(우측 패널). 이름·전화는 광고 병원(contact 전달 시)만 보인다.
type Contact = { name: string | null; phone: string | null } | undefined;

function Row({ k, v }: Readonly<{ k: string; v: string | null }>) {
  if (!v) return null;
  return (
    <div className="flex gap-3 border-b border-slate-100 py-2 text-sm">
      <dt className="w-24 shrink-0 text-slate-500">{k}</dt>
      <dd className="min-w-0 flex-1 text-slate-800">{v}</dd>
    </div>
  );
}

const yesNo = (v: boolean | null) => (v ? "예" : null);
const list = (v: readonly string[]) => (v.length > 0 ? v.join(", ") : null);

export default function TalentDetail({
  t,
  contact,
  contactGated,
}: Readonly<{ t: PublicTalentDetail; contact: Contact; contactGated: boolean }>) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-2xl font-bold text-slate-900">{contact?.name ?? "간호사 회원"}</h2>
        {t.license_type && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">{t.license_type}</span>}
        <span className="text-slate-600">{careerSummary(t.career_level, t.experience_years)}</span>
        {t.night_available && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">나이트 전담 가능</span>}
      </div>
      {t.resume_title && <p className="mt-1 font-medium text-slate-700">{t.resume_title}</p>}
      <p className="mt-1 text-xs text-slate-400">{fmtDay(t.updated_at)} 갱신</p>

      {/* 연락 — 광고 병원만 이름·전화, 그 외엔 잠금 + 광고 안내 */}
      <div className="mt-4 rounded-[12px] border border-slate-200 bg-slate-50 p-3 text-sm">
        <p className="font-semibold text-slate-700">연락</p>
        {contact ? (
          contact.phone ? (
            <a href={`tel:${contact.phone}`} className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-lg font-bold text-teal-700 hover:underline">📞 {contact.phone}</a>
          ) : <p className="mt-1 text-slate-500">연락처 미입력</p>
        ) : (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <span className="text-slate-500">🔒 이름·연락처는 광고 중인 병원만 볼 수 있습니다.</span>
            {contactGated && <Link href="/hospital" className="shrink-0 rounded font-semibold text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2">광고 안내 →</Link>}
          </div>
        )}
      </div>

      <h3 className="mt-5 font-bold text-slate-900">면허 · 자격</h3>
      <dl className="mt-2">
        <Row k="면허 구분" v={t.license_type} />
        <Row k="취득연도" v={t.license_year != null ? `${t.license_year}년` : null} />
        <Row k="면허신고" v={yesNo(t.license_reported)} />
        <Row k="보유 자격증" v={list(t.certifications)} />
        <Row k="전문간호사" v={t.apn_field} />
      </dl>

      <h3 className="mt-5 font-bold text-slate-900">학력</h3>
      <dl className="mt-2">
        <Row k="최종 학력" v={[t.education_level, t.graduation_status].filter(Boolean).join(" · ") || null} />
        <Row k="학교 · 전공" v={t.education} />
      </dl>

      <h3 className="mt-5 font-bold text-slate-900">경력</h3>
      <dl className="mt-2">
        <Row k="구분" v={t.career_level} />
        <Row k="총 경력" v={t.experience_years != null ? `${t.experience_years}년` : null} />
        <Row k="간호간병통합" v={yesNo(t.has_integrated_care)} />
        <Row k="차지 가능" v={yesNo(t.can_charge)} />
      </dl>
      {t.work.length > 0 && (
        <ul className="mt-3 space-y-3">
          {t.work.map((w) => (
            <li key={w.id} className="border-l-2 border-slate-300 pl-3 text-sm">
              <p className="font-semibold text-slate-900">
                {w.hospital_name}
                {w.hospital_type && <span className="ml-1 text-xs font-normal text-slate-600">{w.hospital_type}{w.bed_range ? ` · ${w.bed_range}` : ""}</span>}
              </p>
              <p className="text-xs text-slate-600">
                {w.start_ym} ~ {w.is_current ? "재직중" : w.end_ym ?? "-"}
                {w.department && ` · ${w.department}`}{w.position && ` · ${w.position}`}{w.shift_type && ` · ${w.shift_type}`}
              </p>
              {w.duties && <p className="mt-1 whitespace-pre-line text-slate-700">{w.duties}</p>}
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-5 font-bold text-slate-900">희망 근무조건</h3>
      <dl className="mt-2">
        <Row k="근무형태" v={list(t.shift_types)} />
        <Row k="나이트 전담" v={yesNo(t.night_available)} />
        <Row k="희망 근무지" v={t.desired_location} />
        <Row k="희망 진료과" v={list(t.specialties)} />
        <Row k="희망 기관종별" v={list(t.desired_hospital_types)} />
        <Row k="희망 고용형태" v={t.desired_employment_type} />
        <Row k="희망 급여" v={t.desired_salary} />
        <Row k="입사 가능일" v={t.available_from} />
        <Row k="기숙사 필요" v={yesNo(t.needs_dormitory)} />
      </dl>

      {t.intro && (
        <>
          <h3 className="mt-5 font-bold text-slate-900">자기소개</h3>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{t.intro}</p>
        </>
      )}
    </article>
  );
}
