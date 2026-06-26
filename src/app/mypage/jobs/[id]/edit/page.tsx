import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SubmitButton from "@/components/SubmitButton";
import JobFields from "@/components/JobFields";
import { getMyProfile } from "@/lib/data/user";
import { getMyJob } from "@/lib/data/jobs";
import { updateJob } from "../../../actions";

export const metadata = { title: "공고 수정 — 널스넷", robots: { index: false } };

const ERR: Record<string, string> = {
  missing: "공고 제목은 필수입니다.",
  save: "저장에 실패했습니다. 다시 시도해 주세요.",
};

export default async function EditJobPage({
  params,
  searchParams,
}: Readonly<{ params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }>) {
  const p = await getMyProfile();
  if (!p) redirect("/login");
  if (p.role !== "hospital") redirect("/mypage");
  const { id } = await params;
  const job = await getMyJob(id);
  if (!job) redirect("/mypage/jobs");
  const { error } = await searchParams;

  return (
    <>
      <SiteHeader user={{ displayName: p.displayName }} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <a href="/mypage/jobs" className="text-sm text-teal-700 hover:underline">← 공고 관리</a>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">공고 수정</h1>
        <p className="mt-1 text-sm text-slate-500">병원: <b className="text-slate-700">{job.hospital?.name ?? "-"}</b></p>

        {error && (
          <div role="alert" aria-live="assertive" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {ERR[error] ?? "오류가 발생했습니다."}
          </div>
        )}

        <form action={updateJob} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="job_id" value={job.id} />
          <JobFields d={job} />
          <SubmitButton pendingText="저장 중…">수정 저장</SubmitButton>
        </form>
      </main>
    </>
  );
}
