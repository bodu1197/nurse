import Link from "next/link";
import { redirect } from "next/navigation";
import NurseShell from "@/components/NurseShell";
import SubmitButton from "@/components/SubmitButton";
import Button from "@/components/Button";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import WorkExperienceFields from "@/components/WorkExperienceFields";
import { getMyProfile } from "@/lib/data/user";
import { getMyResume, completeness, type ResumeWithWork } from "@/lib/data/resume";
import { JOB_SPECIALTIES, INPUT_CLASS, LINK_CLASS, messageFor } from "@/lib/constants";
import {
  SHIFT_TYPES, CERTIFICATIONS, APN_FIELDS, LICENSE_TYPES, EDUCATION_LEVELS, GRADUATION_STATUS,
  CAREER_LEVELS, HOSPITAL_TYPES, AVAILABLE_FROM, EMPLOYMENT_TYPES, REGIONS,
} from "@/lib/resumeOptions";
import { safeNext } from "@/lib/url";
import { saveResume, deleteResume } from "../actions";

export const metadata = { title: "내 이력서 — 널스넷", robots: { index: false } };

const label = "text-sm font-medium text-slate-700";
const req = <><span className="text-red-500" aria-hidden>*</span><span className="sr-only">(필수)</span></>;

const SAVE_ERRORS: Record<string, string> = {
  save: "저장에 실패했습니다. 다시 시도해 주세요.",
  delete: "삭제에 실패했습니다. 다시 시도해 주세요.",
  shift: "가능한 근무형태를 하나 이상 선택해 주세요.",
  region: "희망 근무지를 하나 이상 선택해 주세요.",
  work: "경력을 추가하셨다면 병원명과 입사 연월을 모두 채워주세요.",
  work_required: "경력을 선택하셨다면 경력을 1건 이상 입력해 주세요.",
  work_lost: "이력서는 저장됐지만 경력 저장에 실패했습니다. 경력을 다시 확인해 저장해 주세요.",
};

function Section({ title, hint, children }: Readonly<{ title: string; hint?: string; children: React.ReactNode }>) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="font-bold text-slate-900">{title}</h3>
      {hint && <p className="mt-1 text-xs text-slate-600">{hint}</p>}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** 체크박스 여러 개 — 자유 입력이면 표기가 갈려 검색이 안 잡힌다 */
function CheckGroup({ name, options, checked }: Readonly<{ name: string; options: readonly string[]; checked: readonly string[] }>) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {options.map((o) => (
        <label key={o} className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name={name} value={o} defaultChecked={checked.includes(o)}
            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus-visible:ring-2 focus-visible:ring-teal-600" />
          {o}
        </label>
      ))}
    </div>
  );
}

/**
 * 예 / 아니오 / 해당 없음 — 체크박스 하나로는 "아니오"와 "아직 답 안 함"이 구분되지 않는다.
 * 그대로 두면 필수 6개만 채운 사람의 인쇄 서식에 면허신고·차지·나이트가 전부 "아니오"로 단정 출력된다.
 */
function YesNo({ name, text, value }: Readonly<{ name: string; text: string; value: boolean | null }>) {
  const current = value === null ? "" : value ? "yes" : "no";
  return (
    <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <legend className="text-sm text-slate-700">{text}</legend>
      {[["yes", "예"], ["no", "아니오"], ["", "해당 없음"]].map(([v, t]) => (
        <label key={v} className="flex min-h-11 items-center gap-1.5 text-sm text-slate-700">
          <input type="radio" name={name} value={v} defaultChecked={current === v}
            className="h-4 w-4 border-slate-300 text-teal-600 focus-visible:ring-2 focus-visible:ring-teal-600" />
          {t}
        </label>
      ))}
    </fieldset>
  );
}

function Select({ id, defaultValue, options, placeholder = "선택 안 함" }: Readonly<{ id: string; defaultValue: string | null; options: readonly string[]; placeholder?: string }>) {
  return (
    <select id={id} name={id} defaultValue={defaultValue ?? ""} className={INPUT_CLASS}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function Field({ id, text, hint, children }: Readonly<{ id: string; text: React.ReactNode; hint?: string; children: React.ReactNode }>) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={label}>{text} {hint && <span className="text-slate-500">{hint}</span>}</label>
      {children}
    </div>
  );
}

// 저장된 이력서를 그대로 확인하는 화면 — 수정 폼만 있으면 "저장이 된 건지" 알 수 없다.
function ResumeView({ r }: Readonly<{ r: ResumeWithWork }>) {
  const pct = completeness(r, r.work.length);
  const rows: Array<[string, string | null]> = [
    ["이름", r.name], ["연락처", r.phone], ["면허", r.license_type],
    ["총 경력", r.experience_years != null ? `${r.experience_years}년` : null],
    ["자격증", r.certifications.length > 0 ? r.certifications.join(", ") : null],
    ["최종학력", [r.education_level, r.graduation_status].filter(Boolean).join(" · ") || null],
    ["가능한 근무형태", r.shift_types.length > 0 ? r.shift_types.join(", ") : null],
    ["희망 근무지", r.desired_location],
    ["희망 진료과", r.specialties.length > 0 ? r.specialties.join(", ") : null],
  ];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-slate-900">저장된 이력서</h2>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${r.is_public ? "bg-teal-100 text-teal-800" : "bg-slate-200 text-slate-700"}`}>
          {r.is_public ? "공개 중" : "비공개"}
        </span>
      </div>

      {/* 무엇을 더 채우면 좋은지 눈에 보이게 — 항목이 많아 다 채우라고만 하면 아무도 안 채운다 */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>이력서 완성도</span><span className="font-semibold text-teal-700">{pct}%</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200" role="img" aria-label={`이력서 완성도 ${pct}퍼센트`}>
          <div className="h-full rounded-full bg-teal-600" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="w-24 shrink-0 text-slate-500">{k}</dt>
            <dd className="min-w-0 flex-1 text-slate-800">{v || <span className="text-slate-500">미입력</span>}</dd>
          </div>
        ))}
      </dl>

      {r.work.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-slate-100 pt-4 text-sm">
          {r.work.map((w) => (
            <li key={w.id} className="text-slate-700">
              <b className="text-slate-900">{w.hospital_name}</b>
              {w.department && ` · ${w.department}`}
              {` · ${w.start_ym} ~ ${w.is_current ? "재직중" : w.end_ym ?? ""}`}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button href="/mypage/resume/print" variant="outline" size="sm" className="min-h-11">이력서 인쇄 · PDF 저장</Button>
        <span className="text-xs text-slate-600">아래에서 고친 뒤 저장하면 이 내용이 바뀝니다.</span>
      </div>
    </section>
  );
}

export default async function ResumePage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ ok?: string; error?: string; next?: string }> }>) {
  const p = await getMyProfile();
  if (!p) redirect("/login");
  if (p.role !== "nurse") redirect("/mypage");
  const [{ ok, error, next }, r] = await Promise.all([searchParams, getMyResume()]);
  const backTo = safeNext(next, "");
  // 예전에 저장된 값(예: "중환자", "수도권", "기타")이 지금 선택지에 없더라도 목록에 끼워 넣는다.
  // 안 그러면 체크·선택이 복원되지 않아 다시 저장하는 순간 조용히 지워진다.
  const withSaved = (options: readonly string[], saved: readonly string[]) =>
    [...saved.filter((v) => !options.includes(v)), ...options];

  const savedRegions = (r?.desired_location ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const specialtyOptions = withSaved(JOB_SPECIALTIES, r?.specialties ?? []);
  const regionOptions = withSaved(REGIONS, savedRegions);
  const licenseOptions = withSaved(LICENSE_TYPES, r?.license_type ? [r.license_type] : []);
  const certOptions = withSaved(CERTIFICATIONS, r?.certifications ?? []);
  const shiftOptions = withSaved(SHIFT_TYPES, r?.shift_types ?? []);
  const hospitalTypeOptions = withSaved(HOSPITAL_TYPES, r?.desired_hospital_types ?? []);

  return (
    <NurseShell displayName={p.displayName} active="/mypage/resume">
      <h1 className="text-2xl font-bold text-slate-900">내 이력서</h1>
      <p className="mt-1 text-sm text-slate-600">
        이력서는 무료입니다. <b className="text-slate-800">저장에 꼭 필요한 것은 6개</b>(이름 · 휴대폰 · 면허 · 신규/경력 · 근무형태 · 희망 근무지)이고,
        나머지는 채울수록 병원 눈에 잘 띕니다.
      </p>

      {ok === "1" && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">이력서가 저장되었습니다.</div>}
      {ok === "deleted" && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">이력서를 삭제했습니다.</div>}
      {messageFor(SAVE_ERRORS, error) && <div role="alert" aria-live="assertive" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{messageFor(SAVE_ERRORS, error)}</div>}

      {r && <div className="mt-6"><ResumeView r={r} /></div>}

      {backTo && (
        <p className="mt-6 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          이름과 휴대폰 번호를 채우고 저장하면 보던 공고로 돌아가 바로 지원할 수 있습니다.
        </p>
      )}

      <h2 className="mt-8 text-sm font-semibold text-slate-600">{r ? "이력서 수정" : "이력서 작성"}</h2>

      <form action={saveResume} className="mt-3 flex flex-col gap-4">
        <input type="hidden" name="next" value={backTo} />

        <Section title="① 기본" hint="이름과 휴대폰이 없으면 병원이 연락할 방법이 없어 지원이 막힙니다.">
          <Field id="resume_title" text="이력서 제목" hint="(선택)">
            <input id="resume_title" name="resume_title" defaultValue={r?.resume_title ?? ""} placeholder="예: NICU 4년, 나이트 가능 간호사" className={INPUT_CLASS} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="name" text={<>이름 {req}</>}>
              <input id="name" name="name" required defaultValue={r?.name ?? p.displayName} className={INPUT_CLASS} />
            </Field>
            <Field id="phone" text={<>휴대폰 {req}</>}>
              <input id="phone" name="phone" required inputMode="tel" defaultValue={r?.phone ?? ""} placeholder="010-0000-0000" className={INPUT_CLASS} />
            </Field>
            <Field id="email" text="이메일" hint="(전화를 못 받을 때의 예비 연락처)">
              <input id="email" name="email" type="email" defaultValue={r?.email ?? ""} className={INPUT_CLASS} />
            </Field>
            <Field id="residence_region" text="거주 지역" hint="(통근 가능 여부 판단용)">
              <Select id="residence_region" defaultValue={r?.residence_region ?? null} options={REGIONS} />
            </Field>
          </div>
        </Section>

        <Section title="② 면허 · 자격">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="license_type" text={<>면허 구분 {req}</>}>
              <select id="license_type" name="license_type" required defaultValue={r?.license_type ?? "간호사"} className={INPUT_CLASS}>
                {licenseOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field id="license_year" text="면허 취득연도" hint="(선택)">
              <input id="license_year" name="license_year" type="number" min="1960" max="2100" defaultValue={r?.license_year ?? ""} placeholder="예: 2019" className={INPUT_CLASS} />
            </Field>
          </div>
          {/* 3년마다 신고 의무이고, 미신고면 면허 효력이 정지돼 실제 공고 지원자격에 그대로 등장한다 */}
          <YesNo name="license_reported" text="의료인 면허신고를 마쳤습니다 (3년 주기)" value={r?.license_reported ?? null} />
          <fieldset>
            <legend className={label}>보유 자격증 <span className="text-slate-500">(복수 선택)</span></legend>
            <div className="mt-1"><CheckGroup name="certifications" options={certOptions} checked={r?.certifications ?? []} /></div>
          </fieldset>
          <Field id="apn_field" text="전문간호사(APN) 분야" hint="(해당자만)">
            <Select id="apn_field" defaultValue={r?.apn_field ?? null} options={APN_FIELDS} />
          </Field>
        </Section>

        <Section title="③ 학력">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="education_level" text="최종 학력">
              <Select id="education_level" defaultValue={r?.education_level ?? null} options={EDUCATION_LEVELS} />
            </Field>
            <Field id="graduation_status" text="졸업 여부">
              <Select id="graduation_status" defaultValue={r?.graduation_status ?? null} options={GRADUATION_STATUS} />
            </Field>
          </div>
          <Field id="education" text="학교 · 전공" hint="(선택)">
            <input id="education" name="education" defaultValue={r?.education ?? ""} placeholder="예: ○○대학교 간호학과" className={INPUT_CLASS} />
          </Field>
        </Section>

        <Section title="④ 경력" hint="총 경력은 아래 입력에서 자동으로 계산됩니다. 따로 적지 않으셔도 됩니다.">
          <Field id="career_level" text={<>신규 / 경력 {req}</>}>
            <select id="career_level" name="career_level" required defaultValue={r?.career_level ?? ""} className={INPUT_CLASS}>
              <option value="" disabled>선택하세요</option>
              {CAREER_LEVELS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <WorkExperienceFields initial={r?.work ?? []} />
          <div className="flex flex-col gap-1">
            <YesNo name="has_integrated_care" text="간호간병통합병동 경력이 있습니다" value={r?.has_integrated_care ?? null} />
            <YesNo name="can_charge" text="차지(Charge) 가능합니다" value={r?.can_charge ?? null} />
          </div>
        </Section>

        <Section title="⑤ 희망 근무조건" hint="병원이 가장 먼저 보는 항목입니다. 근무형태가 안 맞으면 다른 조건은 보지 않습니다.">
          <fieldset>
            <legend className={label}>가능한 근무형태 {req} <span className="text-slate-500">(복수 선택)</span></legend>
            <div className="mt-1"><CheckGroup name="shift_types" options={shiftOptions} checked={r?.shift_types ?? []} /></div>
          </fieldset>
          <YesNo name="night_available" text="나이트 전담도 가능합니다" value={r?.night_available ?? null} />
          <fieldset>
            <legend className={label}>희망 근무지 {req} <span className="text-slate-500">(복수 선택)</span></legend>
            <div className="mt-1"><CheckGroup name="desired_location" options={regionOptions} checked={savedRegions} /></div>
          </fieldset>
          <fieldset>
            <legend className={label}>희망 진료과 / 부서 <span className="text-slate-500">(복수 선택)</span></legend>
            <div className="mt-1"><CheckGroup name="specialties" options={specialtyOptions} checked={r?.specialties ?? []} /></div>
          </fieldset>
          <fieldset>
            <legend className={label}>희망 의료기관 종별 <span className="text-slate-500">(복수 선택)</span></legend>
            <div className="mt-1"><CheckGroup name="desired_hospital_types" options={hospitalTypeOptions} checked={r?.desired_hospital_types ?? []} /></div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="desired_employment_type" text="희망 고용형태">
              <Select id="desired_employment_type" defaultValue={r?.desired_employment_type ?? null} options={EMPLOYMENT_TYPES} />
            </Field>
            <Field id="available_from" text="입사 가능일">
              <Select id="available_from" defaultValue={r?.available_from ?? null} options={AVAILABLE_FROM} />
            </Field>
          </div>
          <Field id="desired_salary" text="희망 급여" hint="(선택)">
            <input id="desired_salary" name="desired_salary" defaultValue={r?.desired_salary ?? ""} placeholder="예: 연 4,000만원 / 협의" className={INPUT_CLASS} />
          </Field>
          <YesNo name="needs_dormitory" text="기숙사가 필요합니다" value={r?.needs_dormitory ?? null} />
        </Section>

        <Section title="⑥ 소개 · 공개 설정">
          <div className="flex flex-col gap-1">
            <label htmlFor="intro" className={label}>자기소개</label>
            {/* 민감정보는 별도 동의 없이 처리할 수 없다(개인정보보호법 제23조) */}
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              건강상태 · 병력 · 임신 여부 · 종교 · 정당 가입 여부는 적지 마세요. 법으로 수집이 제한된 정보입니다.
            </p>
            <textarea id="intro" name="intro" rows={6} defaultValue={r?.intro ?? ""}
              placeholder="경력에서 다루지 못한 강점, 지원 동기 등을 자유롭게 적어주세요."
              className="w-full rounded-xl border border-slate-300 p-3 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40" />
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" name="is_public" defaultChecked={r?.is_public ?? false}
              className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-teal-600 focus-visible:ring-2 focus-visible:ring-teal-600" />
            <span>
              이력서 공개에 동의합니다
              <span className="mt-1 block text-xs leading-relaxed text-slate-600">
                <b className="text-slate-700">누가 봅니까?</b> 널스넷에 광고 중인 병원.
                <b className="text-slate-700"> 왜 봅니까?</b> 채용 제안 · 인재 검색 목적.
                <b className="text-slate-700"> 무엇이 갑니까?</b> 이름 · 휴대폰을 포함한 이 이력서 전체.
                <b className="text-slate-700"> 언제까지?</b> 체크를 해제하면 즉시 중단됩니다.
              </span>
            </span>
          </label>
        </Section>

        <SubmitButton pendingText="저장 중…">{r ? "이력서 수정" : "이력서 저장"}</SubmitButton>
      </form>

      {r && (
        <div className="mt-8 rounded-2xl border border-red-200 bg-red-50/50 p-5">
          <h3 className="font-bold text-slate-900">이력서 삭제</h3>
          <p className="mt-1 text-sm text-slate-600">
            이력서와 경력 내용이 모두 지워집니다. 이미 지원한 공고의 기록은 병원에 남습니다.
          </p>
          <form action={deleteResume} className="mt-3">
            <ConfirmSubmit className="min-h-11" message="이력서를 삭제할까요? 경력 내용까지 모두 지워지며 되돌릴 수 없습니다.">
              이력서 삭제
            </ConfirmSubmit>
          </form>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-slate-600">
        <Link href="/jobs" className={LINK_CLASS}>채용공고 보러 가기</Link>
      </p>
    </NurseShell>
  );
}
