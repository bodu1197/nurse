import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SubmitButton from "@/components/SubmitButton";
import HospitalPicker from "@/components/HospitalPicker";
import { getMyProfile } from "@/lib/data/user";
import { createJob } from "../../actions";

export const metadata = { title: "공고 등록 — 널스넷", robots: { index: false } };

const ERR: Record<string, string> = {
  missing: "병원과 공고 제목은 필수입니다.",
  hospital: "선택한 병원을 찾을 수 없습니다.",
  claimed: "이미 다른 계정이 등록·관리 중인 병원입니다.",
  save: "공고 저장에 실패했습니다. 다시 시도해 주세요.",
};

const field = "h-12 w-full rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40";
const label = "text-sm font-medium text-slate-700";

export default async function NewJobPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ error?: string }> }>) {
  const p = await getMyProfile();
  if (!p) redirect("/login");
  if (p.role !== "hospital") redirect("/mypage");
  if (!p.businessVerified) redirect("/mypage/verify?from=jobs-new");
  const { error } = await searchParams;

  return (
    <>
      <SiteHeader user={{ displayName: p.displayName }} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <a href="/mypage" className="text-sm text-teal-700 hover:underline">← 마이페이지</a>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">공고 등록</h1>
        <p className="mt-1 text-sm text-slate-500">병원을 검색해 선택하면 공고에 자동 연결됩니다.</p>

        {error && (
          <div role="alert" aria-live="assertive" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {ERR[error] ?? "오류가 발생했습니다."}
          </div>
        )}

        <form action={createJob} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className={label}>병원 선택 <span className="text-red-500">*</span></span>
            <HospitalPicker />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="title" className={label}>공고 제목 <span className="text-red-500">*</span></label>
            <input id="title" name="title" required placeholder="예: 중환자실(ICU) 간호사 모집" className={field} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="specialty" className={label}>진료과/부서</label>
              <input id="specialty" name="specialty" placeholder="예: 중환자실" className={field} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="employment_type" className={label}>고용형태</label>
              <select id="employment_type" name="employment_type" className={field} defaultValue="정규직">
                <option value="정규직">정규직</option>
                <option value="계약직">계약직</option>
                <option value="파트타임">파트타임</option>
                <option value="인턴">인턴</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="location" className={label}>근무지</label>
              <input id="location" name="location" placeholder="비우면 병원 지역으로 표시" className={field} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="salary_text" className={label}>급여</label>
              <input id="salary_text" name="salary_text" placeholder="예: 연 4,000~5,000만원 / 협의" className={field} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="benefits" className={label}>복리후생 <span className="text-slate-400">(쉼표로 구분)</span></label>
            <input id="benefits" name="benefits" placeholder="예: 기숙사, 4대보험, 교육비 지원" className={field} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="description" className={label}>상세 내용</label>
            <textarea id="description" name="description" rows={6} placeholder="담당 업무, 자격요건, 근무조건 등을 적어주세요." className="rounded-xl border border-slate-300 p-3 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40" />
          </div>
          <SubmitButton pendingText="등록 중…">공고 등록</SubmitButton>
        </form>
      </main>
    </>
  );
}
