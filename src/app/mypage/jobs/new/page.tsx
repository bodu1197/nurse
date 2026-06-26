import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SubmitButton from "@/components/SubmitButton";
import HospitalPicker from "@/components/HospitalPicker";
import JobFields from "@/components/JobFields";
import { getMyProfile } from "@/lib/data/user";
import { getMyJob, getMyHospital } from "@/lib/data/jobs";
import { AD_PRODUCTS, won } from "@/lib/ads";
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
  const myHosp = await getMyHospital(); // 인증 시 연결된 병원(있으면 자동 사용)

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
              <HospitalPicker initial={src?.hospital ? { id: src.hospital.id, name: src.hospital.name, region: null, address: null } : null} />
            </div>
          )}
          <JobFields d={src ?? undefined} />

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-slate-700">게시 기간</legend>
            <label className="flex items-center gap-3 rounded-xl border border-slate-300 p-3 has-[:checked]:border-teal-500 has-[:checked]:bg-teal-50">
              <input type="radio" name="duration" value="free" defaultChecked className="accent-teal-600" />
              <span className="text-sm text-slate-700"><b>무료 7일</b> <span className="text-slate-400">· 병원당 동시 1건</span></span>
            </label>
            {AD_PRODUCTS.map((p) => (
              <label key={p.weeks} className="flex items-center gap-3 rounded-xl border border-slate-300 p-3 has-[:checked]:border-teal-500 has-[:checked]:bg-teal-50">
                <input type="radio" name="duration" value={p.weeks} className="accent-teal-600" />
                <span className="text-sm text-slate-700"><b>{p.weeks}주 노출</b> <span className="text-teal-700">· {won(p.amount)}</span> <span className="text-teal-600">(1주 무료 포함)</span></span>
              </label>
            ))}
            <p className="text-xs text-slate-400">유료 선택 시 작성 후 결제하면 그 기간으로 게시됩니다. (결제는 도메인 연결 후 오픈 — 그전까진 &ldquo;결제 대기&rdquo;로 보관)</p>
          </fieldset>

          <SubmitButton pendingText="등록 중…">{dup ? "복제 공고 등록" : "공고 등록"}</SubmitButton>
        </form>
      </main>
    </>
  );
}
