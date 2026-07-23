import { nowMs, fmtDate, fmtDay } from "@/lib/date";
import type { ResumeSheetFields } from "@/lib/data/resume";

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

export default function ResumeSheet({
  resume,
  applied,
}: Readonly<{
  resume: ResumeSheetFields;
  /** 병원이 받은 이력서일 때만 — 어느 공고에 언제 지원했는지 */
  applied?: { jobTitle: string; at: string; message: string | null };
}>) {
  return (
    <article className="mx-auto max-w-2xl bg-white p-8 text-sm print:p-0">
      <header className="border-b-2 border-slate-800 pb-3">
        <h1 className="text-2xl font-bold text-slate-900">이력서</h1>
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
        <Row k="면허 구분" v={resume.license_type} />
        <Row k="총 경력" v={resume.experience_years != null ? `${resume.experience_years}년` : null} />
        <Row k="학력" v={resume.education} />
      </dl>

      <h2 className="mt-6 font-bold text-slate-900">희망 근무조건</h2>
      <dl className="mt-2">
        <Row k="희망 진료과" v={resume.specialties.length > 0 ? resume.specialties.join(", ") : null} />
        <Row k="희망 근무지" v={resume.desired_location} />
        <Row k="희망 고용형태" v={resume.desired_employment_type} />
        <Row k="희망 급여" v={resume.desired_salary} />
      </dl>

      <h2 className="mt-6 font-bold text-slate-900">자기소개</h2>
      <p className="mt-2 min-h-24 whitespace-pre-line leading-relaxed text-slate-800">
        {resume.intro || <span className="text-slate-500">-</span>}
      </p>
    </article>
  );
}
