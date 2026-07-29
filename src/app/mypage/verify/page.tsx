import HospitalShell from "@/components/HospitalShell";
import SubmitButton from "@/components/SubmitButton";
import Button from "@/components/Button";
import HospitalPicker from "@/components/HospitalPicker";
import { requireProfile } from "@/lib/data/user";
import { getMyHospital } from "@/lib/data/jobs";
import { INPUT_CLASS } from "@/lib/constants";
import { verifyHospitalBusiness } from "../actions";

export const metadata = { title: "병원 사업자 인증 — 널스넷", robots: { index: false } };

// 국세청 API 가 느릴 때 재시도까지 하면 최악 12.4초가 걸린다(src/lib/data/nts.ts).
// 기본 실행시간 예산 안에서 잘리면 안내 문구 대신 504 가 뜨므로 여유를 명시한다.
export const maxDuration = 30;

const ERR: Record<string, string> = {
  input: "입력값을 확인해 주세요. (사업자등록번호 10자리, 개업일 필요)",
  mismatch: "국세청 정보와 일치하지 않습니다. 사업자번호·대표자명·개업일을 확인해 주세요.",
  inactive: "휴업 또는 폐업 상태의 사업자입니다.",
  api: "인증 서버 오류입니다. 잠시 후 다시 시도해 주세요.",
  config: "인증 설정 오류입니다. 관리자에게 문의해 주세요.",
  fail: "인증에 실패했습니다. 다시 시도해 주세요.",
  hospital: "선택한 병원을 찾을 수 없습니다.",
  claimed: "이미 다른 계정이 등록·관리 중인 병원입니다. 우리 병원이 맞다면 고객센터(/contact)로 사업자등록증과 함께 알려주세요 — 확인 후 연결을 옮겨드립니다.",
};

export default async function VerifyPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ ok?: string; error?: string; from?: string; reverify?: string }> }>) {
  const p = await requireProfile("/mypage/verify", "hospital");
  const { ok, error, from, reverify } = await searchParams;
  const verified = p.businessVerified || ok === "1";
  // 이관해온 번호가 폼에 미리 채워지는 경우에만 안내를 띄운다(재인증은 새 번호를 받으므로 제외).
  const prefilled = reverify !== "1" && !!p.businessNo;
  const myHosp = await getMyHospital();
  const verifiedAt = p.businessVerifiedAt ? new Date(p.businessVerifiedAt).toISOString().slice(0, 10).replace(/-/g, ".") : null;

  return (
    <HospitalShell displayName={p.displayName} active="/mypage/verify">
      <div className="max-w-lg">
        <h1 className="mt-3 text-2xl font-bold text-slate-900">병원 사업자 인증</h1>

        {verified && reverify !== "1" ? (
          <div className="mt-6 rounded-2xl border border-teal-200 bg-teal-50 p-6 text-center">
            <p className="text-lg font-bold text-teal-800">✓ 사업자 인증 완료</p>
            <p className="mt-1 text-sm text-teal-700">이제 공고를 등록할 수 있습니다.{verifiedAt && ` (최종 인증 ${verifiedAt})`}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button href="/mypage/jobs/new" size="md">공고 등록하기</Button>
              <Button href="/mypage" variant="outline" size="md">마이페이지로</Button>
            </div>
            <p className="mt-4 text-xs text-slate-500">사업자번호가 바뀌었나요? <a href="/mypage/verify?reverify=1" className="font-semibold text-teal-700 underline">사업자 정보 변경(재인증)</a></p>
          </div>
        ) : (
          <>
            {from === "jobs-new" && <div role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">공고를 등록하려면 먼저 사업자 인증이 필요합니다.</div>}
            {reverify === "1" && verified && <div role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">사업자 변경 재인증 — 새 사업자등록번호·대표자·개업일을 입력하면 갱신됩니다. (성공 시에만 갱신, 실패 시 기존 인증 유지)</div>}
            <p className="mt-2 text-sm text-slate-500">
              국세청 사업자등록 진위확인으로 병원을 인증합니다. 인증된 병원만 공고를 등록할 수 있습니다.
            </p>
            {error && (
              <div role="alert" aria-live="assertive" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {ERR[error] ?? ERR.fail}
              </div>
            )}
            <form action={verifyHospitalBusiness} className="mt-6 flex flex-col gap-4">
              <input type="hidden" name="from" value={from ?? ""} />
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-slate-700">병원 선택</span>
                <HospitalPicker initial={myHosp ? { id: myHosp.id, name: myHosp.name, region: myHosp.region, address: myHosp.address } : null} />
                <span className="text-xs text-slate-400">인증과 함께 병원을 연결하면, 공고 등록 시 병원 정보가 자동으로 채워집니다.</span>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="b_no" className="text-sm font-medium text-slate-700">사업자등록번호</label>
                {/* 구 널스넷에서 옮겨온 번호를 미리 채운다. 재인증(reverify)일 때는 새 번호를 받아야 하므로 비워 둔다. */}
                <input id="b_no" name="b_no" inputMode="numeric" required placeholder="숫자 10자리 (예: 1234567890)" className={INPUT_CLASS}
                  aria-describedby={prefilled ? "b_no_help" : undefined}
                  defaultValue={reverify === "1" ? "" : p.businessNo ?? ""} />
                {/* 이관해온 번호는 옛 사이트에서 자진신고로 받은 값이라 틀릴 수 있다 — 그대로 내면 '불일치'가 뜬다. */}
                {prefilled && (
                  <span id="b_no_help" className="text-xs text-slate-500">
                    이전 널스넷에 등록하셨던 번호입니다. 사업자등록증과 다르면 고쳐 주세요.
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="p_nm" className="text-sm font-medium text-slate-700">대표자명</label>
                <input id="p_nm" name="p_nm" required placeholder="사업자등록증상 대표자명" className={INPUT_CLASS} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="start_dt" className="text-sm font-medium text-slate-700">개업일자</label>
                <input id="start_dt" name="start_dt" type="date" required className={INPUT_CLASS} />
              </div>
              <SubmitButton pendingText="국세청 확인 중… (최대 30초)">사업자 인증</SubmitButton>
            </form>
            <p className="mt-4 text-xs text-slate-400">입력 정보는 국세청 진위확인에만 사용되며, 사업자번호 외에는 저장하지 않습니다. 국세청 서버 상황에 따라 확인에 시간이 걸릴 수 있습니다.</p>
          </>
        )}
      </div>
    </HospitalShell>
  );
}
