import Link from "next/link";
import DismissibleError from "@/components/DismissibleError";
import SubmitButton from "@/components/SubmitButton";
import { authErrorMessage, INPUT_CLASS, LINK_CLASS } from "@/lib/constants";
import { requestPasswordReset } from "../actions";

export const metadata = {
  title: "비밀번호 찾기 — 널스넷",
  robots: { index: false, follow: false },
};

const socialNotice = (
  <p className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
    카카오·네이버로 가입하셨다면 로그인 화면에서 그 버튼으로 바로 들어가는 편이 빠릅니다.
  </p>
);

export default async function ResetPasswordPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ error?: string; sent?: string }> }>) {
  const { error, sent } = await searchParams;

  // 가입 여부와 무관하게 같은 화면을 보여준다(어떤 아이디가 가입돼 있는지 알려주지 않기 위해).
  if (sent === "1") {
    return (
      <>
        <h1 className="mt-8 text-center text-xl font-bold text-slate-900">비밀번호 찾기</h1>
        <div className="mt-6 rounded-xl border border-teal-200 bg-teal-50 px-4 py-5 text-sm text-teal-900">
          <p className="font-semibold">가입된 계정이라면 메일을 보냈습니다.</p>
          <p className="mt-2 leading-relaxed">
            <b>가입할 때 등록한 이메일 주소</b>로 갑니다. 메일의 링크를 눌러 새 비밀번호를 정하세요.
            링크는 <b>1시간</b> 동안만 유효하고, 한 번 열면 만료됩니다 —
            <b> 링크를 연 기기에서 끝까지 진행</b>해 주세요.
          </p>
          <p className="mt-2 leading-relaxed">
            5분이 지나도 오지 않으면 스팸함을 확인하시고, 그래도 없으면 잠시 후 다시 시도해 주세요.
          </p>
        </div>
        <div className="mt-4 flex flex-col items-center gap-2 text-sm">
          <Link href="/reset-password" className={LINK_CLASS}>다시 보내기 · 다른 아이디로 시도</Link>
          <Link href="/login" className={LINK_CLASS}>로그인으로 돌아가기 →</Link>
        </div>
        {socialNotice}
      </>
    );
  }

  return (
    <>
      <h1 className="mt-8 text-center text-xl font-bold text-slate-900">비밀번호 찾기</h1>
      <p className="mt-2 text-center text-sm text-slate-500">
        가입할 때 쓴 아이디나 이메일을 넣으면 재설정 링크를 메일로 보내드립니다.
      </p>

      {error && <DismissibleError message={authErrorMessage(error) ?? "요청에 실패했습니다. 다시 시도해 주세요."} />}

      <form action={requestPasswordReset} className="mt-6 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="loginId" className="text-sm font-medium text-slate-700">아이디 또는 이메일</label>
          <input id="loginId" name="loginId" type="text" autoComplete="username" required className={INPUT_CLASS} />
        </div>
        <SubmitButton pendingText="보내는 중…">재설정 링크 받기</SubmitButton>
      </form>

      {socialNotice}

      <p className="mt-6 text-center text-sm text-slate-500">
        <Link href="/login" className={LINK_CLASS}>로그인으로 돌아가기</Link>
      </p>
    </>
  );
}
