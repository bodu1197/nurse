import Link from "next/link";
import LoginButtons from "@/components/LoginButtons";
import DismissibleError from "@/components/DismissibleError";
import SubmitButton from "@/components/SubmitButton";
import { authErrorMessage, INPUT_CLASS, LINK_CLASS, SUBTLE_LINK_CLASS } from "@/lib/constants";
import { signInWithId } from "../actions";

export const metadata = {
  title: "로그인 — 널스넷",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ error?: string; notice?: string; next?: string }> }>) {
  const { error, notice, next } = await searchParams;
  const message = error ? (authErrorMessage(error) ?? "로그인에 실패했습니다. 다시 시도해 주세요.") : null;
  const noticeMsg = notice === "apply" ? "지원하려면 먼저 로그인하세요." : null;

  return (
    <>
      <h1 className="mt-8 text-center text-xl font-bold text-slate-900">로그인</h1>

      {noticeMsg && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">{noticeMsg}</div>}
      {message && <DismissibleError message={message} />}

      <form action={signInWithId} className="mt-6 flex flex-col gap-3">
        {next && <input type="hidden" name="next" value={next} />}
        <div className="flex flex-col gap-1">
          <label htmlFor="loginId" className="text-sm font-medium text-slate-700">아이디</label>
          <input id="loginId" name="loginId" type="text" autoComplete="username" placeholder="아이디 또는 이메일" required className={INPUT_CLASS} />
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">비밀번호</label>
            <Link href="/reset-password" className={`${LINK_CLASS} text-sm font-normal`}>비밀번호 찾기</Link>
          </div>
          <input id="password" name="password" type="password" autoComplete="current-password" required className={INPUT_CLASS} />
        </div>
        <SubmitButton pendingText="로그인 중…">로그인</SubmitButton>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-slate-500">
        <span className="h-px flex-1 bg-slate-200" />또는<span className="h-px flex-1 bg-slate-200" />
      </div>

      <LoginButtons />

      <p className="mt-6 text-center text-sm text-slate-500">
        계정이 없으신가요?{" "}
        <Link href="/signup" className={LINK_CLASS}>회원가입</Link>
      </p>

      <p className="mt-4 text-center text-xs leading-relaxed text-slate-500">
        로그인 시{" "}
        <Link href="/terms" className={SUBTLE_LINK_CLASS}>이용약관</Link> 및{" "}
        <Link href="/privacy" className={SUBTLE_LINK_CLASS}>개인정보처리방침</Link>에
        동의하게 됩니다.
      </p>
    </>
  );
}
