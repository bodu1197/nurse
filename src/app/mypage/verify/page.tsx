import HospitalShell from "@/components/HospitalShell";
import SubmitButton from "@/components/SubmitButton";
import Button from "@/components/Button";
import HospitalPicker from "@/components/HospitalPicker";
import AddressSearch from "@/components/AddressSearch";
import { requireProfile } from "@/lib/data/user";
import { getMyHospital } from "@/lib/data/jobs";
import { INPUT_CLASS } from "@/lib/constants";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import DraftCleaner from "@/components/DraftCleaner";
import { LINK_CLASS } from "@/lib/constants";
import { DIRECT_FACILITY_KINDS } from "@/lib/jobTaxonomy";
import { firstParam } from "@/lib/url";
import { verifyHospitalBusiness, unlinkHospital } from "../actions";

export const metadata = { title: "병원·요양기관 사업자 인증 — 널스넷", robots: { index: false } };

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
  hospital: "선택한 기관을 찾을 수 없습니다.",
  direct: "직접 등록할 기관의 이름(2자 이상)·종류·주소를 모두 적어 주세요. 주소는 시·도로 시작해야 합니다 — 「주소 검색」으로 채우면 정확합니다.",
  direct_save: "기관 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  direct_exists: "같은 지역에 같은 이름의 기관이 이미 명부에 있습니다. 위 「기관 선택」에서 검색해 골라 주세요. 다른 계정이 관리 중이라면 고객센터(/contact)로 사업자등록증과 함께 알려주세요 — 확인 후 연결해 드립니다.",
  direct_limit: "한 계정이 직접 등록할 수 있는 기관은 3곳까지입니다. 더 필요하면 고객센터(/contact)로 알려주세요.",
  claimed: "이미 다른 계정이 등록·관리 중인 기관입니다. 우리 기관이 맞다면 고객센터(/contact)로 사업자등록증과 함께 알려주세요 — 확인 후 연결을 옮겨드립니다.",
  hasjobs: "등록한 공고가 있어 연결을 해제할 수 없습니다. 연결을 끊으면 그 공고를 수정·마감·삭제할 수 없게 됩니다. 공고를 모두 삭제한 뒤 다시 시도하시거나, 공고를 유지한 채 옮기려면 고객센터로 알려주세요.",
  nohospital: "연결된 기관이 없습니다.",
  unlink: "연결 해제에 실패했습니다. 잠시 후 다시 시도해 주세요.",
};

/** 기관 연결 해제 쪽 오류 — 인증 폼 위 배너와 자리를 나눠 쓴다 */
const UNLINK_ERRORS = new Set(["hasjobs", "nohospital", "unlink"]);

export default async function VerifyPage({
  searchParams,
}: Readonly<{
  // dn·dk·da — 직접 등록 칸에 적었던 기관명·종류·주소(오류로 되돌아왔을 때 다시 채운다, actions verifyHospitalBusiness back()).
  // 같은 키가 두 번 오면(`?error=a&error=b`) 배열이 된다 — 문자열 함수에서 500 이 나므로 firstParam 으로 하나만 읽는다.
  searchParams: Promise<Partial<Record<"ok" | "error" | "from" | "reverify" | "direct" | "dn" | "dk" | "da", string | string[]>>>;
}>) {
  const p = await requireProfile("/mypage/verify", "hospital");
  const sp = await searchParams;
  const [ok, error, from, reverify, direct, dn, dk, da] =
    (["ok", "error", "from", "reverify", "direct", "dn", "dk", "da"] as const).map((k) => firstParam(sp[k]));
  const verified = p.businessVerified || ok === "1";
  // 이관해온 번호가 폼에 미리 채워지는 경우에만 안내를 띄운다(재인증은 새 번호를 받으므로 제외).
  const prefilled = reverify !== "1" && !!p.businessNo;
  const myHosp = await getMyHospital();
  const verifiedAt = p.businessVerifiedAt ? new Date(p.businessVerifiedAt).toISOString().slice(0, 10).replace(/-/g, ".") : null;

  return (
    <HospitalShell displayName={p.displayName} active="/mypage/verify">
      <h1 className="mt-3 text-2xl font-bold text-slate-900">병원·요양기관 사업자 인증</h1>
      {ok === "unlinked" && (
        <>
          {/* 🔴 공고 등록 화면의 병원 초안(HospitalPicker)도 함께 지운다. 안 지우면 방금 해제한
              병원이 다음 등록에서 그대로 되살아나 다시 점유된다 — 해제가 무효가 된다. */}
          <DraftCleaner keys={[`nursenet:draft:job-new-hospital:${p.email}`]} />
          <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-base text-teal-800">기관 연결을 해제했습니다. 아래에서 올바른 기관을 고르고 다시 인증해 주세요.</div>
        </>
      )}
      {/* 연결 해제 관련 오류만 여기서 — 인증 실패 문구는 아래 폼 위에 이미 있다(두 번 뜨지 않게) */}
      {UNLINK_ERRORS.has(error) && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-base text-red-700">{ERR[error]}</div>}

      {/* 🔴 연결된 병원을 보여주고 **스스로 바꿀 수 있게** 한다. 전에는 인증 때 한 번 고르면
          공고 등록 화면이 그 병원을 고정 표시할 뿐, 잘못 골랐어도 되돌릴 방법이 없었다.
          공고가 있으면 해제를 막는다 — 연결을 끊으면 자기 공고를 수정·마감·삭제할 수 없게 된다. */}
      {myHosp && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-bold text-slate-900">연결된 기관</h2>
          <p className="mt-2 text-base">
            <b className="text-slate-800">{myHosp.name}</b>
            {myHosp.region && <span className="ml-2 text-xs text-slate-500">{myHosp.region}</span>}
          </p>
          <p className="mt-1 text-sm text-slate-500">공고를 등록하면 이 기관 이름으로 나갑니다.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <form action={unlinkHospital}>
              <ConfirmSubmit variant="outline" size="sm" className="min-h-11"
                message={`'${myHosp.name}' 연결을 해제할까요?
해제 후 다시 인증하면서 올바른 기관을 고르시면 됩니다.
등록한 공고가 있으면 해제되지 않습니다.`}>
                다른 기관으로 바꾸기
              </ConfirmSubmit>
            </form>
            <span className="text-sm text-slate-500">
              공고가 있는 채로 옮기려면 <a href="/contact" className={LINK_CLASS}>고객센터</a>로 알려주세요.
            </span>
          </div>
        </section>
      )}

      {verified && reverify !== "1" ? (
        <div className="mt-6 rounded-2xl border border-teal-200 bg-teal-50 p-6 text-center">
          <p className="text-lg font-bold text-teal-800">✓ 사업자 인증 완료</p>
          <p className="mt-1 text-sm text-teal-700">이제 공고를 등록할 수 있습니다.{verifiedAt && ` (최종 인증 ${verifiedAt})`}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button href="/mypage/jobs/new" size="md">공고 등록하기</Button>
            <Button href="/mypage" variant="outline" size="md">마이페이지로</Button>
          </div>
          <p className="mt-4 text-sm text-slate-500">사업자번호가 바뀌었나요? <a href="/mypage/verify?reverify=1" className="font-semibold text-teal-700 underline">사업자 정보 변경(재인증)</a></p>
        </div>
      ) : (
        <>
          {from === "jobs-new" && !verified && <div role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-800">공고를 등록하려면 먼저 사업자 인증이 필요합니다.</div>}
          {reverify === "1" && verified && direct !== "1" && <div role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-800">사업자 변경 재인증 — 새 사업자등록번호·대표자·개업일을 입력하면 갱신됩니다. (성공 시에만 갱신, 실패 시 기존 인증 유지)</div>}
          {direct === "1" && verified && <div role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-800">명부에 없는 기관을 등록하려면 사업자 정보를 한 번 더 확인합니다. 아래 「기관 직접 등록」을 채우고 인증해 주세요.</div>}
          <p className="mt-2 text-sm text-slate-500">
            국세청 사업자등록 진위확인으로 병원·요양기관을 인증합니다. 인증된 기관만 공고를 등록할 수 있습니다.
          </p>
          {error && !UNLINK_ERRORS.has(error) && (
            // id — 인증 처리가 오류로 되돌릴 때 이 자리로 스크롤한다(actions back() 의 #verify-error). 아래 칸으로 보내면 이 문구가 화면 밖이다.
            <div id="verify-error" role="alert" aria-live="assertive" className="mt-4 scroll-mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-base text-red-700">
              {ERR[error] ?? ERR.fail}
            </div>
          )}
          {/* 🔴 폼 **자체**만 좁힌다(페이지는 레이아웃 폭을 그대로 쓴다). 한 줄짜리 입력칸
              — 사업자등록번호 10자리·대표자명·개업일자 — 이 1,000px 로 늘어나면 무엇을 몇 자
              넣어야 하는지 알 수 없다. 내 정보·계정 화면이 쓰는 것과 같은 폭이다. */}
          <form action={verifyHospitalBusiness} className="mt-6 flex flex-col gap-4 sm:max-w-md">
            <input type="hidden" name="from" value={from} />
            {/* 오류로 되돌아올 때 같은 화면(재인증 폼)으로 — 없으면 이미 인증된 회원에게 '인증 완료' 패널이 떠 오류가 안 보인다 */}
            <input type="hidden" name="reverify" value={reverify === "1" ? "1" : ""} />
            <input type="hidden" name="direct" value={direct === "1" ? "1" : ""} />
            <div className="flex flex-col gap-1">
              <span className="text-base font-medium text-slate-700">기관 선택</span>
              <HospitalPicker
                initial={myHosp ? { id: myHosp.id, name: myHosp.name, region: myHosp.region, address: myHosp.address } : null}
                missingHint={<>아래 「명부에 없나요? 기관 직접 등록」에서 등록할 수 있습니다.</>}
              />
              <span className="text-sm text-slate-500">인증과 함께 기관을 연결하면, 공고 등록 시 기관 정보가 자동으로 채워집니다.</span>
            </div>
            {/* 🧓 (나) 명부에 없는 기관 — 요양원·재가센터(공단 명부에도 아직 없는 신규 개설 등). 오너 지시 2026-10-16.
                인증이 통과해야만 명부에 만들어진다(actions directFacilityInput). 위에서 기관을 골랐으면 이 칸은 무시된다.
                접는 칸(details)이라 스크립트 없이 열리고, 공고 등록 화면에서 ?direct=1 로 오면 열린 채로 뜬다. */}
            <details id="direct" open={direct === "1" || error.startsWith("direct") || !!dn || !!da} className="rounded-xl border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer rounded py-2 text-base font-semibold text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
                명부에 없나요? 기관 직접 등록
              </summary>
              <div className="mt-3 flex flex-col gap-3">
                <p className="text-sm text-slate-600">
                  요양원·재가센터처럼 위 검색에 나오지 않는 기관은 여기에 <b>세 칸 모두</b> 적어 주세요. 사업자 인증이 통과하면
                  이 이름으로 명부에 등록되고(다른 회원도 검색할 수 있습니다) 공고에 연결됩니다.
                  위에서 기관을 골라 둔 상태라면 이 칸은 쓰이지 않습니다 — 위 칸의 「다시 선택」으로 비운 뒤 적어 주세요.
                </p>
                <div className="flex flex-col gap-1">
                  <label htmlFor="direct_name" className="text-base font-medium text-slate-700">기관명</label>
                  <input id="direct_name" name="direct_name" maxLength={100} defaultValue={dn} placeholder="예: 행복요양원" className={INPUT_CLASS} />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="direct_kind" className="text-base font-medium text-slate-700">기관 종류</label>
                  {/* 빈 칸으로 시작한다 — 첫 항목을 미리 골라 두면 안 고른 사람이 엉뚱한 종류로 등록된다 */}
                  <select id="direct_kind" name="direct_kind" defaultValue={DIRECT_FACILITY_KINDS.some((k) => k === dk) ? dk : ""} className={INPUT_CLASS}>
                    <option value="">종류를 고르세요</option>
                    {DIRECT_FACILITY_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
                <AddressSearch name="direct_address" label="기관 주소" defaultValue={da} placeholder="「주소 검색」으로 채우세요"
                  unknownHint="시·도로 시작하는 주소여야 등록됩니다(예: 서울특별시 종로구 …). 「주소 검색」으로 채워 주세요." />
              </div>
            </details>
            <div className="flex flex-col gap-1">
              <label htmlFor="b_no" className="text-base font-medium text-slate-700">사업자등록번호</label>
              {/* 구 널스넷에서 옮겨온 번호를 미리 채운다. 재인증(reverify)일 때는 새 번호를 받아야 하므로 비워 둔다. */}
              <input id="b_no" name="b_no" inputMode="numeric" required placeholder="숫자 10자리 (예: 1234567890)" className={INPUT_CLASS}
                aria-describedby={prefilled ? "b_no_help" : undefined}
                // 재인증은 새 번호를 받으므로 비운다. 직접 등록(direct=1)은 같은 사업자로 기관만 더하는 것이라 인증된 번호를 채워 둔다.
                defaultValue={reverify === "1" && direct !== "1" ? "" : p.businessNo ?? ""} />
              {/* 이관해온 번호는 옛 사이트에서 자진신고로 받은 값이라 틀릴 수 있다 — 그대로 내면 '불일치'가 뜬다. */}
              {prefilled && (
                <span id="b_no_help" className="text-sm text-slate-500">
                  이전 널스넷에 등록하셨던 번호입니다. 사업자등록증과 다르면 고쳐 주세요.
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="p_nm" className="text-base font-medium text-slate-700">대표자명</label>
              <input id="p_nm" name="p_nm" required placeholder="사업자등록증상 대표자명" className={INPUT_CLASS} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="start_dt" className="text-base font-medium text-slate-700">개업일자</label>
              <input id="start_dt" name="start_dt" type="date" required className={INPUT_CLASS} />
            </div>
            <SubmitButton pendingText="국세청 확인 중… (최대 30초)">사업자 인증</SubmitButton>
          </form>
          <p className="mt-4 text-sm text-slate-500">사업자 정보(대표자명·개업일)는 국세청 진위확인에만 쓰고 사업자번호 외에는 저장하지 않습니다. 직접 등록한 기관명·종류·주소는 기관 명부에 저장되어 공개됩니다. 국세청 서버 상황에 따라 확인에 시간이 걸릴 수 있습니다.</p>
        </>
      )}
    </HospitalShell>
  );
}
