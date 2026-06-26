import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SubmitButton from "@/components/SubmitButton";
import HospitalPicker from "@/components/HospitalPicker";
import JobFields from "@/components/JobFields";
import { getMyProfile } from "@/lib/data/user";
import { getMyJob } from "@/lib/data/jobs";
import { createJob } from "../../actions";

export const metadata = { title: "공고 등록 — 널스넷", robots: { index: false } };

const ERR: Record<string, string> = {
  missing: "병원과 공고 제목은 필수입니다.",
  hospital: "선택한 병원을 찾을 수 없습니다.",
  claimed: "이미 다른 계정이 등록·관리 중인 병원입니다.",
  save: "공고 저장에 실패했습니다. 다시 시도해 주세요.",
};

export default async function NewJobPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ error?: string; from?: string }> }>) {
  const p = await getMyProfile();
  if (!p) redirect("/login");
  if (p.role !== "hospital") redirect("/mypage");
  if (!p.businessVerified) redirect("/mypage/verify?from=jobs-new");
  const { error, from } = await searchParams;
  const src = from ? await getMyJob(from) : null; // 복제 원본
  const dup = !!src;

  return (
    <>
      <SiteHeader user={{ displayName: p.displayName }} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <a href="/mypage/jobs" className="text-sm text-teal-700 hover:underline">← 공고 관리</a>
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
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">병원 선택 <span className="text-red-500">*</span></span>
            <HospitalPicker initial={src?.hospital ? { id: src.hospital.id, name: src.hospital.name, region: null, address: null } : null} />
          </div>
          <JobFields d={src ?? undefined} />
          <SubmitButton pendingText="등록 중…">{dup ? "복제 공고 등록" : "공고 등록"}</SubmitButton>
        </form>
      </main>
    </>
  );
}
