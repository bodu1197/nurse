import LoginButtons from "@/components/LoginButtons";
import Logo from "@/components/Logo";
import DismissibleError from "@/components/DismissibleError";
import SubmitButton from "@/components/SubmitButton";
import { AUTH_ERROR_MESSAGES } from "@/lib/constants";
import { signInWithEmail } from "../actions";

export const metadata = {
  title: "로그인 — 널스넷",
  robots: { index: false, follow: false },
};

const inputClass =
  "h-12 rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40";

export default async function LoginPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ error?: string }> }>) {
  const { error } = await searchParams;
  const message = error
    ? (AUTH_ERROR_MESSAGES[error] ?? "로그인에 실패했습니다. 다시 시도해 주세요.")
    : null;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <a href="/" aria-label="널스넷 홈" className="flex justify-center">
          <Logo className="text-3xl" />
        </a>

        <h1 className="mt-8 text-center text-xl font-bold text-slate-900">로그인</h1>

        {message && <DismissibleError message={message} />}

        <form action={signInWithEmail} className="mt-6 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium text-slate-700">이메일</label>
            <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">비밀번호</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass} />
          </div>
          <SubmitButton pendingText="로그인 중…">로그인</SubmitButton>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />또는<span className="h-px flex-1 bg-slate-200" />
        </div>

        <LoginButtons />

        <p className="mt-6 text-center text-sm text-slate-500">
          계정이 없으신가요?{" "}
          <a href="/signup" className="font-semibold text-teal-700 hover:underline">회원가입</a>
        </p>

        <p className="mt-4 text-center text-xs leading-relaxed text-slate-400">
          로그인 시{" "}
          <a href="/terms" className="underline hover:text-slate-600">이용약관</a> 및{" "}
          <a href="/privacy" className="underline hover:text-slate-600">개인정보처리방침</a>에
          동의하게 됩니다.
        </p>
      </div>
    </main>
  );
}
