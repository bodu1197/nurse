import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SubmitButton from "@/components/SubmitButton";
import { getMyProfile } from "@/lib/data/user";
import { getMyResume, type Resume } from "@/lib/data/resume";
import { JOB_SPECIALTIES } from "@/lib/constants";
import { saveResume } from "../actions";

export const metadata = { title: "내 이력서 — 널스넷", robots: { index: false } };

const field = "h-12 w-full rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40";
const label = "text-sm font-medium text-slate-700";

function Row({ k, v }: Readonly<{ k: string; v: string | null }>) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-slate-500">{k}</dt>
      <dd className="min-w-0 flex-1 text-slate-800">{v || <span className="text-slate-400">미입력</span>}</dd>
    </div>
  );
}

// 저장한 이력서를 그대로 확인하는 화면 — 수정 폼만 있으면 "저장이 된 건지" 알 수 없다.
function ResumeView({ r }: Readonly<{ r: Resume }>) {
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-slate-900">저장된 이력서 <span className="text-sm font-normal text-slate-500">({r.is_public ? "병원에 보이는 내용" : "나만 보는 중"})</span></h2>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${r.is_public ? "bg-teal-100 text-teal-800" : "bg-slate-100 text-slate-500"}`}>
          {r.is_public ? "공개 중" : "비공개"}
        </span>
      </div>
      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Row k="이름" v={r.name} />
        <Row k="연락처" v={r.phone} />
        <Row k="면허" v={r.license_type} />
        <Row k="경력" v={r.experience_years != null ? `${r.experience_years}년` : null} />
        <Row k="희망 고용형태" v={r.desired_employment_type} />
        <Row k="희망 근무지" v={r.desired_location} />
        <Row k="희망 진료과" v={r.specialties.length > 0 ? r.specialties.join(", ") : null} />
        <Row k="희망 급여" v={r.desired_salary} />
        <Row k="학력" v={r.education} />
      </dl>
      {r.intro && <p className="mt-4 whitespace-pre-line border-t border-slate-100 pt-4 text-sm text-slate-700">{r.intro}</p>}
      <p className="mt-4 text-xs text-slate-400">아래에서 고친 뒤 저장하면 이 내용이 바뀝니다.</p>
    </section>
  );
}

export default async function ResumePage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ ok?: string; error?: string }> }>) {
  const p = await getMyProfile();
  if (!p) redirect("/login");
  if (p.role !== "nurse") redirect("/mypage");
  const [{ ok, error }, r] = await Promise.all([searchParams, getMyResume()]);
  const all: readonly string[] = JOB_SPECIALTIES;

  return (
    <>
      <SiteHeader user={{ displayName: p.displayName }} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <a href="/mypage" className="text-sm text-teal-700 hover:underline">← 마이페이지</a>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">내 이력서</h1>
        <p className="mt-1 text-sm text-slate-500">이력서는 무료입니다. 공개로 설정하면 광고 중인 병원이 이름·연락처를 포함해 열람할 수 있고, 언제든 비공개로 되돌릴 수 있습니다.</p>

        {ok === "1" && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">이력서가 저장되었습니다.</div>}
        {error && <div role="alert" aria-live="assertive" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">저장에 실패했습니다. 다시 시도해 주세요.</div>}

        {r && <ResumeView r={r} />}

        <h2 className="mt-8 text-sm font-semibold text-slate-500">{r ? "이력서 수정" : "이력서 작성"}</h2>
        <form action={saveResume} className="mt-3 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="name" className={label}>이름</label>
              <input id="name" name="name" defaultValue={r?.name ?? p.displayName} className={field} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="phone" className={label}>연락처</label>
              <input id="phone" name="phone" defaultValue={r?.phone ?? ""} placeholder="010-0000-0000" className={field} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="license_type" className={label}>면허 구분</label>
              <select id="license_type" name="license_type" defaultValue={r?.license_type ?? "간호사"} className={field}>
                <option value="간호사">간호사 (RN)</option>
                <option value="간호조무사">간호조무사</option>
                <option value="기타">기타</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="experience_years" className={label}>총 경력(년)</label>
              <input id="experience_years" name="experience_years" type="number" min="0" max="60" defaultValue={r?.experience_years ?? ""} placeholder="예: 3" className={field} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="desired_employment_type" className={label}>희망 고용형태</label>
              <select id="desired_employment_type" name="desired_employment_type" defaultValue={r?.desired_employment_type ?? "정규직"} className={field}>
                <option value="정규직">정규직</option>
                <option value="계약직">계약직</option>
                <option value="파트타임">파트타임</option>
                <option value="무관">무관</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="desired_location" className={label}>희망 근무지</label>
              <input id="desired_location" name="desired_location" defaultValue={r?.desired_location ?? ""} placeholder="예: 서울 / 경기" className={field} />
            </div>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className={label}>희망 진료과/부서 <span className="text-slate-400">(복수 선택 가능 · 검색에 사용)</span></legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {/* 예전에 자유 입력으로 저장된 값(예: "중환자")도 체크된 채로 남긴다 — 저장 시 조용히 지워지지 않게 */}
              {[...(r?.specialties ?? []).filter((s) => !all.includes(s)), ...JOB_SPECIALTIES].map((s) => (
                <label key={s} className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="specialties" value={s} defaultChecked={r?.specialties.includes(s) ?? false}
                    className="h-4 w-4 rounded border-slate-300 text-teal-600 focus-visible:ring-2 focus-visible:ring-teal-600" />
                  {s}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-col gap-1">
            <label htmlFor="desired_salary" className={label}>희망 급여 <span className="text-slate-400">(선택)</span></label>
            <input id="desired_salary" name="desired_salary" defaultValue={r?.desired_salary ?? ""} placeholder="예: 연 4,000만원 / 협의" className={field} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="education" className={label}>학력 <span className="text-slate-400">(선택)</span></label>
            <input id="education" name="education" defaultValue={r?.education ?? ""} placeholder="예: ○○대학교 간호학과 졸업" className={field} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="intro" className={label}>자기소개</label>
            <textarea id="intro" name="intro" rows={6} defaultValue={r?.intro ?? ""} placeholder="경력, 강점, 희망 근무조건 등을 자유롭게 작성하세요." className="rounded-xl border border-slate-300 p-3 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40" />
          </div>
          {/* 공개 = 이름·연락처가 병원에 그대로 보인다. 기본값을 켜두지 않고, 무엇이 공개되는지 명시한다. */}
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" name="is_public" defaultChecked={r?.is_public ?? false} className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-teal-600 focus-visible:ring-2 focus-visible:ring-teal-600" />
            <span>
              이력서 공개
              <span className="mt-0.5 block text-xs text-slate-500">
                광고 중인 병원이 <b className="font-semibold text-slate-700">이름·연락처를 포함한</b> 이력서를 열람하고 채용 제안을 보낼 수 있습니다. 체크를 해제하면 즉시 비공개로 바뀝니다.
              </span>
            </span>
          </label>
          <SubmitButton pendingText="저장 중…">{r ? "이력서 수정" : "이력서 저장"}</SubmitButton>
        </form>
      </main>
    </>
  );
}
