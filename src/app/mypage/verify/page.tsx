import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SubmitButton from "@/components/SubmitButton";
import { getMyProfile } from "@/lib/data/user";
import { verifyHospitalBusiness } from "../actions";

export const metadata = { title: "병원 사업자 인증 — 널스넷", robots: { index: false } };

const ERR: Record<string, string> = {
  input: "입력값을 확인해 주세요. (사업자등록번호 10자리, 개업일 필요)",
  mismatch: "국세청 정보와 일치하지 않습니다. 사업자번호·대표자명·개업일을 확인해 주세요.",
  inactive: "휴업 또는 폐업 상태의 사업자입니다.",
  api: "인증 서버 오류입니다. 잠시 후 다시 시도해 주세요.",
  config: "인증 설정 오류입니다. 관리자에게 문의해 주세요.",
  fail: "인증에 실패했습니다. 다시 시도해 주세요.",
};

export default async function VerifyPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ ok?: string; error?: string }> }>) {
  const p = await getMyProfile();
  if (!p) redirect("/login");
  if (p.role !== "hospital") redirect("/mypage");
  const { ok, error } = await searchParams;
  const verified = p.businessVerified || ok === "1";

  const inputClass = "h-12 rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40";

  return (
    <>
      <SiteHeader user={{ displayName: p.displayName }} />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8">
        <a href="/mypage" className="text-sm text-teal-700 hover:underline">← 마이페이지</a>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">병원 사업자 인증</h1>

        {verified ? (
          <div className="mt-6 rounded-2xl border border-teal-200 bg-teal-50 p-6 text-center">
            <p className="text-lg font-bold text-teal-800">✓ 사업자 인증 완료</p>
            <p className="mt-1 text-sm text-teal-700">이제 공고를 등록할 수 있습니다.</p>
            <a href="/mypage" className="mt-4 inline-block rounded-full bg-teal-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-teal-700">마이페이지로</a>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-500">
              국세청 사업자등록 진위확인으로 병원을 인증합니다. 인증된 병원만 공고를 등록할 수 있습니다.
            </p>
            {error && (
              <div role="alert" aria-live="assertive" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {ERR[error] ?? ERR.fail}
              </div>
            )}
            <form action={verifyHospitalBusiness} className="mt-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="b_no" className="text-sm font-medium text-slate-700">사업자등록번호</label>
                <input id="b_no" name="b_no" inputMode="numeric" required placeholder="숫자 10자리 (예: 1234567890)" className={inputClass} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="p_nm" className="text-sm font-medium text-slate-700">대표자명</label>
                <input id="p_nm" name="p_nm" required placeholder="사업자등록증상 대표자명" className={inputClass} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="start_dt" className="text-sm font-medium text-slate-700">개업일자</label>
                <input id="start_dt" name="start_dt" type="date" required className={inputClass} />
              </div>
              <SubmitButton pendingText="인증 확인 중…">사업자 인증</SubmitButton>
            </form>
            <p className="mt-4 text-xs text-slate-400">입력 정보는 국세청 진위확인에만 사용되며, 사업자번호 외에는 저장하지 않습니다.</p>
          </>
        )}
      </main>
    </>
  );
}
