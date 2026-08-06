import { redirect } from "next/navigation";
import HospitalShell from "@/components/HospitalShell";
import SubmitButton from "@/components/SubmitButton";
import { todayKst, nowMs } from "@/lib/date";
import JobFields from "@/components/JobFields";
import FormDraft from "@/components/FormDraft";
import { requireProfile } from "@/lib/data/user";
import { getMyJob } from "@/lib/data/jobs";
import { updateJob } from "../../../actions";

export const metadata = { title: "공고 수정 — 널스넷", robots: { index: false } };

const ERR: Record<string, string> = {
  deadline: "마감일이 오늘보다 이전입니다. 그대로 두면 공고가 한 번도 노출되지 않습니다.",
  missing: "공고 제목은 필수입니다.",
  save: "저장에 실패했습니다. 다시 시도해 주세요.",
};

export default async function EditJobPage({
  params,
  searchParams,
}: Readonly<{ params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }>) {
  const p = await requireProfile(`/mypage/jobs/${(await params).id}/edit`, "hospital");
  const { id } = await params;
  const job = await getMyJob(id);
  if (!job) redirect("/mypage/jobs");
  const { error } = await searchParams;

  return (
    <HospitalShell displayName={p.displayName} active="/mypage/jobs">
      <h1 className="mt-3 text-2xl font-bold text-slate-900">공고 수정</h1>
      <p className="mt-1 text-sm text-slate-500">병원: <b className="text-slate-700">{job.hospital?.name ?? "-"}</b></p>

      {error && (
        <div role="alert" aria-live="assertive" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-base text-red-700">
          {ERR[error] ?? "오류가 발생했습니다."}
        </div>
      )}

      <form action={updateJob} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="job_id" value={job.id} />
        {/* 공고별로 따로 보관한다 — A 공고 초안이 B 공고 수정 화면에 떠오면 안 된다. */}
        <FormDraft storageKey={`nursenet:draft:job-edit:${p.email}:${job.id}`} ownErrors={["missing", "save", "deadline"]} />
        <JobFields d={job} minDeadline={todayKst(nowMs())} />
        <SubmitButton pendingText="저장 중…">수정 저장</SubmitButton>
      </form>
    </HospitalShell>
  );
}
