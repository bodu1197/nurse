import { redirect } from "next/navigation";
import HospitalShell from "@/components/HospitalShell";
import SubmitButton from "@/components/SubmitButton";
import HospitalPicker from "@/components/HospitalPicker";
import { todayKst, nowMs } from "@/lib/date";
import JobFields, { type JobDefaults } from "@/components/JobFields";
import FormDraft from "@/components/FormDraft";
import { requireProfile } from "@/lib/data/user";
import { getMyJob, getMyHospital, getMyLastJob, getMyAdCash } from "@/lib/data/jobs";
import { AD_PRODUCTS, splitPayment, won } from "@/lib/ads";
import { createJob } from "../../actions";

export const metadata = { title: "공고 등록 — 널스넷", robots: { index: false } };

const ERR: Record<string, string> = {
  deadline: "마감일이 오늘보다 이전입니다. 그대로 두면 공고가 한 번도 노출되지 않습니다.",
  missing: "병원과 공고 제목은 필수입니다.",
  hospital: "선택한 병원을 찾을 수 없습니다.",
  claimed: "이미 다른 계정이 등록·관리 중인 병원입니다.",
  save: "공고 저장에 실패했습니다. 다시 시도해 주세요.",
};

export default async function NewJobPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ error?: string; from?: string }> }>) {
  const p = await requireProfile("/mypage/jobs/new", "hospital");
  if (!p.businessVerified) redirect("/mypage/verify?from=jobs-new");
  const { error, from } = await searchParams;
  const dup = !!from;
  const myHosp = await getMyHospital();
  const adCash = await getMyAdCash(); // 결제 전에 "얼마 내야 하는지"를 보여주기 위한 잔액(판정은 서버가 한다)
  // 복제 지정(from)이면 그 공고, 아니면 직전 공고를 템플릿으로 → 전 필드 자동입력. 근무지·접수안내는 없으면 병원 데이터로.
  const template = from ? await getMyJob(from) : await getMyLastJob();
  const d: JobDefaults = template
    ? {
        title: dup ? template.title : "",
        specialty: template.specialty,
        facility_type: template.facility_type,
        job_category: template.job_category,
        employment_type: template.employment_type,
        location: template.location ?? myHosp?.address ?? myHosp?.region ?? null,
        salary_text: template.salary_text,
        benefits: template.benefits,
        description: template.description,
        recruit_count: template.recruit_count,
        shift_type: template.shift_type,
        manager_name: template.manager_name,
        manager_phone: template.manager_phone,
        apply_methods: template.apply_methods ?? ["platform"],
        apply_email: template.apply_email,
        apply_detail: template.apply_detail ?? myHosp?.address ?? null,
      }
    : { location: myHosp?.address ?? myHosp?.region ?? null, apply_detail: myHosp?.address ?? null, apply_methods: ["platform"] };

  return (
    <HospitalShell displayName={p.displayName} active="/mypage/jobs/new">
      <div className="max-w-2xl">
        <h1 className="mt-3 text-2xl font-bold text-slate-900">{dup ? "공고 복제" : "공고 등록"}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {dup ? "기존 공고를 복사했습니다. 필요한 부분(급여·직종 등)만 고쳐 등록하세요." : "병원을 검색해 선택하면 공고에 자동 연결됩니다."}
        </p>

        {error && (
          <div role="alert" aria-live="assertive" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {ERR[error] ?? "오류가 발생했습니다."}
          </div>
        )}

        <form action={createJob} className="mt-6 flex flex-col gap-4">
          {/* 임시저장 — 입력항목이 15개라 쓰다 중단하면 처음부터 다시 써야 했다.
              무료 1건 제한에 걸려 되돌아오는 경우가 바로 그 상황이다. */}
          <FormDraft
            storageKey={`nursenet:draft:job-new:${p.email}`}
            ownErrors={["missing", "hospital", "claimed", "save", "deadline"]}
          />
          {myHosp ? (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">병원</span>
              <div className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5 text-sm">
                <span className="font-semibold text-teal-800">{myHosp.name}</span>
                {myHosp.region && <span className="ml-2 text-xs text-teal-700">{myHosp.region}</span>}
              </div>
              <input type="hidden" name="hospital_id" value={myHosp.id} />
              <span className="text-xs text-slate-400">인증 시 연결된 병원이 자동 사용됩니다.</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">병원 선택 <span className="text-red-500">*</span></span>
              <HospitalPicker
                initial={template?.hospital ? { id: template.hospital.id, name: template.hospital.name, region: null, address: null } : null}
                draftKey={`nursenet:draft:job-new-hospital:${p.email}`}
              />
            </div>
          )}
          <JobFields d={d} minDeadline={todayKst(nowMs())} />

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-slate-700">게시 기간</legend>
            {/* 🔴 무료 칸은 없앴다(오너 확정 2026-08-05: "완전 무료 광고는 없애라").
                공고는 저장만 되고, 노출은 다음 화면에서 결제해야 시작된다. */}
            <p className="text-xs text-slate-500">
              보유 광고 캐시 <b className="text-teal-700">{won(adCash)}</b>
              {adCash > 0 && <span className="text-slate-400"> · 결제할 때 먼저 차감됩니다</span>}
            </p>
            {AD_PRODUCTS.map((p) => (
              <label key={p.weeks} className="flex items-center gap-3 rounded-xl border border-slate-300 p-3 has-[:checked]:border-teal-500 has-[:checked]:bg-teal-50">
                <input type="radio" name="duration" value={p.weeks} defaultChecked={p.weeks === 1} className="accent-teal-600" />
                <span className="text-sm text-slate-700">
                  <b>{p.weeks}주 노출</b> <span className="text-teal-700">· {won(p.amount)}</span>
                  {p.saved > 0 && (
                    <span className="ml-1.5 rounded-full bg-teal-600 px-1.5 py-0.5 text-[11px] font-bold text-white">{p.offPct}% 할인</span>
                  )}
                  <span className="block text-xs text-slate-500">
                    주당 {won(p.perWeek)}
                    {adCash > 0 && <span className="text-teal-600"> · 캐시 차감 후 {won(splitPayment(p.amount, adCash).payable)}</span>}
                  </span>
                </span>
              </label>
            ))}
            <p className="text-xs text-slate-400">등록하면 결제 화면으로 넘어갑니다. 결제 전까지는 공고가 저장만 되고 노출되지 않습니다.</p>
          </fieldset>

          <SubmitButton pendingText="등록 중…">{dup ? "복제 공고 등록" : "공고 등록"}</SubmitButton>
        </form>
      </div>
    </HospitalShell>
  );
}
