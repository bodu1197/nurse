import { nowMs, fmtDate, fmtDay } from "@/lib/date";
import type { ResumeSheetFields, WorkExperience } from "@/lib/data/resume";

// 이력서 한 장 — 간호사 본인 다운로드(/mypage/resume/print)와
// 병원의 접수 이력서 다운로드(/mypage/applicants/[id]/print)가 같은 서식을 쓴다.

function Row({ k, v }: Readonly<{ k: string; v: string | null }>) {
  return (
    <div className="flex gap-3 border-b border-slate-100 py-2">
      <dt className="w-28 shrink-0 text-slate-500">{k}</dt>
      <dd className="min-w-0 flex-1 text-slate-900">{v || <span className="text-slate-500">-</span>}</dd>
    </div>
  );
}

const yesNo = (v: boolean | null) => (v === null ? null : v ? "예" : "아니오");
const list = (v: readonly string[]) => (v.length > 0 ? v.join(", ") : null);

export default function ResumeSheet({
  resume,
  work = [],
  applied,
}: Readonly<{
  resume: ResumeSheetFields;
  work?: readonly WorkExperience[];
  /** 병원이 받은 이력서일 때만 — 어느 공고에 언제 지원했는지 */
  applied?: { jobTitle: string; at: string; message: string | null };
}>) {
  return (
    <article className="mx-auto max-w-2xl bg-white p-8 text-sm print:p-0">
      <header className="border-b-2 border-slate-800 pb-3">
        <h1 className="text-2xl font-bold text-slate-900">이력서</h1>
        {resume.resume_title && <p className="mt-1 font-semibold text-slate-700">{resume.resume_title}</p>}
        <p className="mt-1 text-xs text-slate-500">널스넷 · 출력일 {fmtDate(nowMs())}</p>
      </header>

      {applied && (
        <section className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
          <p className="font-semibold text-slate-800">지원 공고: {applied.jobTitle}</p>
          <p className="mt-0.5 text-xs text-slate-500">지원일 {fmtDay(applied.at)}</p>
          {applied.message && <p className="mt-2 whitespace-pre-line text-slate-700">지원 메시지: {applied.message}</p>}
        </section>
      )}

      <h2 className="mt-6 font-bold text-slate-900">기본 정보</h2>
      <dl className="mt-2">
        <Row k="이름" v={resume.name} />
        <Row k="연락처" v={resume.phone} />
        <Row k="이메일" v={resume.email} />
        <Row k="거주 지역" v={resume.residence_region} />
      </dl>

      <h2 className="mt-6 font-bold text-slate-900">면허 · 자격</h2>
      <dl className="mt-2">
        <Row k="면허 구분" v={resume.license_type} />
        <Row k="취득연도" v={resume.license_year != null ? `${resume.license_year}년` : null} />
        <Row k="면허신고" v={yesNo(resume.license_reported)} />
        <Row k="보유 자격증" v={list(resume.certifications)} />
        <Row k="전문간호사" v={resume.apn_field} />
      </dl>

      <h2 className="mt-6 font-bold text-slate-900">학력</h2>
      <dl className="mt-2">
        <Row k="최종 학력" v={[resume.education_level, resume.graduation_status].filter(Boolean).join(" · ") || null} />
        <Row k="학교 · 전공" v={resume.education} />
      </dl>

      <h2 className="mt-6 font-bold text-slate-900">경력</h2>
      <dl className="mt-2">
        <Row k="구분" v={resume.career_level} />
        <Row k="총 경력" v={resume.experience_years != null ? `${resume.experience_years}년` : null} />
        <Row k="간호간병통합" v={yesNo(resume.has_integrated_care)} />
        <Row k="차지 가능" v={yesNo(resume.can_charge)} />
      </dl>

      {work.length > 0 && (
        <ul className="mt-3 space-y-3">
          {work.map((w) => (
            <li key={w.id} className="border-l-2 border-slate-300 pl-3">
              <p className="font-semibold text-slate-900">
                {w.hospital_name}
                {w.hospital_type && <span className="ml-1 text-xs font-normal text-slate-600">{w.hospital_type}{w.bed_range ? ` · ${w.bed_range}` : ""}</span>}
              </p>
              <p className="text-xs text-slate-600">
                {w.start_ym} ~ {w.is_current ? "재직중" : w.end_ym ?? "-"}
                {w.department && ` · ${w.department}`}
                {w.position && ` · ${w.position}`}
                {w.shift_type && ` · ${w.shift_type}`}
              </p>
              {w.duties && <p className="mt-1 whitespace-pre-line text-slate-700">{w.duties}</p>}
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-6 font-bold text-slate-900">희망 근무조건</h2>
      <dl className="mt-2">
        <Row k="근무형태" v={list(resume.shift_types)} />
        <Row k="나이트 전담" v={yesNo(resume.night_available)} />
        <Row k="희망 근무지" v={resume.desired_location} />
        <Row k="희망 진료과" v={list(resume.specialties)} />
        <Row k="희망 기관종별" v={list(resume.desired_hospital_types)} />
        <Row k="희망 고용형태" v={resume.desired_employment_type} />
        <Row k="희망 급여" v={resume.desired_salary} />
        <Row k="입사 가능일" v={resume.available_from} />
        <Row k="기숙사 필요" v={yesNo(resume.needs_dormitory)} />
      </dl>

      <h2 className="mt-6 font-bold text-slate-900">자기소개</h2>
      <p className="mt-2 min-h-24 whitespace-pre-line leading-relaxed text-slate-800">
        {resume.intro || <span className="text-slate-500">-</span>}
      </p>
    </article>
  );
}
