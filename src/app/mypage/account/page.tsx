import Link from "next/link";
import { redirect } from "next/navigation";
import NurseShell from "@/components/NurseShell";
import HospitalShell from "@/components/HospitalShell";
import SiteHeader from "@/components/SiteHeader";
import SubmitButton from "@/components/SubmitButton";
import { getMyProfile } from "@/lib/data/user";
import { ROLE_LABEL } from "@/lib/data/role";
import { INPUT_CLASS, LINK_CLASS, MIN_PASSWORD, messageFor } from "@/lib/constants";
import { updateDisplayName, changePassword, deleteAccount } from "../actions";

export const metadata = { title: "내 정보 · 계정 — 널스넷", robots: { index: false } };

const MESSAGES = {
  name: "표시 이름을 입력해 주세요.",
  weak: `새 비밀번호는 ${MIN_PASSWORD}자 이상이어야 합니다.`,
  mismatch: "새 비밀번호와 확인이 서로 다릅니다.",
  wrong_password: "현재 비밀번호가 올바르지 않습니다.",
  confirm: "확인란에 '탈퇴'라고 정확히 입력해 주세요.",
  save: "처리에 실패했습니다. 잠시 후 다시 시도해 주세요.",
} satisfies Record<string, string>;
const OK = {
  name: "표시 이름을 바꿨습니다.",
  password: "비밀번호를 바꿨습니다.",
} satisfies Record<string, string>;


function Card({ title, hint, children }: Readonly<{ title: string; hint?: string; children: React.ReactNode }>) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-bold text-slate-900">{title}</h2>
      {hint && <p className="mt-1 text-sm text-slate-600">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function AccountPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ ok?: string; error?: string }> }>) {
  const p = await getMyProfile();
  if (!p) redirect("/login");
  const { ok, error } = await searchParams;

  const body = (
    <>
      <h1 className="text-2xl font-bold text-slate-900">내 정보 · 계정</h1>

      {messageFor(OK, ok) && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">{messageFor(OK, ok)}</div>}
      {messageFor(MESSAGES, error) && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{messageFor(MESSAGES, error)}</div>}

      <div className="mt-6 flex flex-col gap-4">
        <Card title="가입 정보">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {[["아이디", p.username ?? "-"], ["이메일", p.email], ["회원 유형", ROLE_LABEL[p.role]]].map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="w-20 shrink-0 text-slate-500">{k}</dt>
                <dd className="min-w-0 flex-1 text-slate-800">{v}</dd>
              </div>
            ))}
          </dl>
          {p.role === "nurse" && (
            // 오너 확정: 간호사의 실명·연락처는 이력서가 원본이다. 두 곳에 두면 반드시 어긋난다.
            <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              병원에 보이는 <b className="text-slate-800">이름과 연락처는 이력서</b>에 있습니다.{" "}
              <Link href="/mypage/resume" className={LINK_CLASS}>이력서에서 수정</Link>
            </p>
          )}
        </Card>

        <Card title="표시 이름" hint="화면 오른쪽 위와 마이페이지에 보이는 이름입니다.">
          <form action={updateDisplayName} className="flex flex-col gap-3 sm:max-w-md">
            <label htmlFor="display_name" className="sr-only">표시 이름</label>
            <input id="display_name" name="display_name" required defaultValue={p.displayName} className={INPUT_CLASS} />
            <SubmitButton pendingText="저장 중…">표시 이름 저장</SubmitButton>
          </form>
        </Card>

        <Card title="비밀번호 변경" hint="현재 비밀번호를 확인한 뒤 바꿉니다.">
          <form action={changePassword} className="flex flex-col gap-3 sm:max-w-md">
            <div className="flex flex-col gap-1">
              <label htmlFor="current_password" className="text-sm font-medium text-slate-700">현재 비밀번호</label>
              <input id="current_password" name="current_password" type="password" autoComplete="current-password" required className={INPUT_CLASS} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="new_password" className="text-sm font-medium text-slate-700">새 비밀번호 <span className="text-slate-500">({MIN_PASSWORD}자 이상)</span></label>
              <input id="new_password" name="new_password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} required className={INPUT_CLASS} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="new_password_confirm" className="text-sm font-medium text-slate-700">새 비밀번호 확인</label>
              <input id="new_password_confirm" name="new_password_confirm" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} required className={INPUT_CLASS} />
            </div>
            <SubmitButton pendingText="변경 중…">비밀번호 바꾸기</SubmitButton>
          </form>
          <p className="mt-3 text-sm text-slate-600">
            비밀번호가 기억나지 않으시면 <Link href="/reset-password" className={LINK_CLASS}>비밀번호 찾기</Link>를 이용하세요.
            카카오·네이버로 가입하셨다면 비밀번호가 없습니다.
          </p>
        </Card>

        <Card
          title="회원 탈퇴"
          hint="계정과 이력서가 즉시 삭제되며 되돌릴 수 없습니다. 이미 지원한 공고의 기록도 병원 화면에서 사라집니다."
        >
          <form action={deleteAccount} className="flex flex-col gap-3 sm:max-w-md">
            <div className="flex flex-col gap-1">
              <label htmlFor="confirm" className="text-sm font-medium text-slate-700">확인을 위해 <b>탈퇴</b> 두 글자를 입력해 주세요</label>
              <input id="confirm" name="confirm" required autoComplete="off" className={INPUT_CLASS} />
            </div>
            {/* 소셜 로그인 계정은 비밀번호가 없으므로 비워두면 건너뛴다 */}
            <div className="flex flex-col gap-1">
              <label htmlFor="del_password" className="text-sm font-medium text-slate-700">현재 비밀번호 <span className="text-slate-500">(이메일 가입자만)</span></label>
              <input id="del_password" name="password" type="password" autoComplete="current-password" className={INPUT_CLASS} />
            </div>
            {/* confirm 입력 자체가 1차 방어라 여기서는 별도 confirm() 창을 겹치지 않는다 */}
            <button type="submit" className="min-h-11 self-start rounded-[12px] px-4 text-sm font-semibold text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
              회원 탈퇴
            </button>
          </form>
        </Card>
      </div>
    </>
  );

  // 병원·간호사는 각자 네비로 감싼다. 관리자는 네비 대상이 없어 헤더만(대시보드와 같은 규칙).
  if (p.role === "hospital") return <HospitalShell displayName={p.displayName} active="/mypage/account">{body}</HospitalShell>;
  if (p.role === "nurse") return <NurseShell displayName={p.displayName} active="/mypage/account">{body}</NurseShell>;
  return (
    <>
      <SiteHeader user={{ displayName: p.displayName }} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{body}</main>
    </>
  );
}
