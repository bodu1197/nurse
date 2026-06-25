import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SubmitButton from "@/components/SubmitButton";
import HospitalPicker from "@/components/HospitalPicker";
import StarRating from "@/components/StarRating";
import { getMyProfile } from "@/lib/data/user";
import { createReview } from "../actions";

export const metadata = { title: "병원 리뷰 작성 — 널스넷", robots: { index: false } };

const ERR: Record<string, string> = {
  invalid: "병원·별점·내용(10자 이상)을 확인해 주세요.",
  nurse_only: "간호사 회원만 리뷰를 작성할 수 있습니다.",
  dup: "이미 이 병원에 리뷰를 작성하셨습니다.",
  save: "저장에 실패했습니다. 다시 시도해 주세요.",
};

const field = "h-12 w-full rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40";
const label = "text-sm font-medium text-slate-700";

export default async function NewReviewPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ error?: string }> }>) {
  const p = await getMyProfile();
  if (!p) redirect("/login");
  const { error } = await searchParams;

  return (
    <>
      <SiteHeader user={{ displayName: p.displayName }} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <a href="/reviews" className="text-sm text-teal-700 hover:underline">← 병원 리뷰</a>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">병원 리뷰 작성</h1>
        <p className="mt-1 text-sm text-slate-500">근무 경험이 있는 병원을 검색해 선택하고 솔직한 후기를 남겨주세요. 리뷰는 비실명으로 표시됩니다.</p>

        {error && (
          <div role="alert" aria-live="assertive" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {ERR[error] ?? "오류가 발생했습니다."}
          </div>
        )}

        <form action={createReview} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className={label}>병원 선택 <span className="text-red-500">*</span></span>
            <HospitalPicker />
          </div>
          <div className="flex flex-col gap-1">
            <span className={label}>별점 <span className="text-red-500">*</span></span>
            <StarRating />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="work_period" className={label}>근무 기간 <span className="text-slate-400">(선택)</span></label>
            <input id="work_period" name="work_period" placeholder="예: 2022~2024 / 1년 6개월" className={field} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="content" className={label}>리뷰 내용 <span className="text-red-500">*</span> <span className="text-slate-400">(10자 이상)</span></label>
            <textarea id="content" name="content" rows={7} required minLength={10} maxLength={2000} placeholder="근무 환경, 급여, 복지, 분위기 등 솔직한 경험을 적어주세요." className="rounded-xl border border-slate-300 p-3 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40" />
          </div>
          <SubmitButton pendingText="등록 중…">리뷰 등록</SubmitButton>
          <p className="text-xs text-slate-400">허위·비방 리뷰는 관련 법령에 따라 제한될 수 있으며, 신고 시 검토 후 비공개 처리됩니다.</p>
        </form>
      </main>
    </>
  );
}
