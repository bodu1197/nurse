import Link from "next/link";
import LoginButtons from "@/components/LoginButtons";
import Logo from "@/components/Logo";
import DismissibleError from "@/components/DismissibleError";
import SubmitButton from "@/components/SubmitButton";
import Button from "@/components/Button";
import { AUTH_ERROR_MESSAGES } from "@/lib/constants";
import { signUpWithEmail } from "../actions";

export const metadata = {
  title: "회원가입 — 널스넷",
  robots: { index: false, follow: false },
};

const inputClass =
  "h-12 rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40";

export default async function SignupPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ error?: string; sent?: string; role?: string }> }>) {
  const { error, sent, role } = await searchParams;
  const isHospital = role === "hospital";
  const message = error
    ? (AUTH_ERROR_MESSAGES[error] ?? "회원가입에 실패했습니다.")
    : null;

  if (sent) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm text-center">
          <Link href="/" aria-label="널스넷 홈" className="flex justify-center">
            <Logo className="text-3xl" />
          </Link>
          <h1 className="mt-8 text-xl font-bold text-slate-900">확인 이메일을 보냈습니다</h1>
          <p className="mt-3 text-sm text-slate-500">
            메일의 링크를 눌러 가입을 완료한 뒤 로그인해 주세요.
          </p>
          <Button href="/login" size="md" className="mt-8">
            로그인으로 →
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <Link href="/" aria-label="널스넷 홈" className="flex justify-center">
          <Logo className="text-3xl" />
        </Link>

        <h1 className="mt-8 text-center text-xl font-bold text-slate-900">회원가입</h1>

        {message && <DismissibleError message={message} />}

        <form action={signUpWithEmail} className="mt-6 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">회원 유형</span>
            <div className="grid grid-cols-2 gap-2">
              <label>
                <input type="radio" name="role" value="nurse" defaultChecked={!isHospital} className="peer sr-only" />
                <span className="flex h-12 cursor-pointer items-center justify-center rounded-[12px] border border-slate-300 text-sm font-semibold text-slate-600 peer-checked:border-teal-500 peer-checked:bg-teal-50 peer-checked:text-teal-700">간호사·간호조무사</span>
              </label>
              <label>
                <input type="radio" name="role" value="hospital" defaultChecked={isHospital} className="peer sr-only" />
                <span className="flex h-12 cursor-pointer items-center justify-center rounded-[12px] border border-slate-300 text-sm font-semibold text-slate-600 peer-checked:border-teal-500 peer-checked:bg-teal-50 peer-checked:text-teal-700">병원 채용담당자</span>
              </label>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium text-slate-700">이메일</label>
            <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">비밀번호 (8자 이상)</label>
            <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className={inputClass} />
          </div>
          <SubmitButton pendingText="가입 중…">이메일로 가입</SubmitButton>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />또는<span className="h-px flex-1 bg-slate-200" />
        </div>

        <LoginButtons />

        <p className="mt-6 text-center text-sm text-slate-500">
          이미 계정이 있으신가요?{" "}
          <a href="/login" className="font-semibold text-teal-700 hover:underline">로그인</a>
        </p>

        <p className="mt-4 text-center text-xs leading-relaxed text-slate-400">
          가입 시{" "}
          <a href="/terms" className="underline hover:text-slate-600">이용약관</a> 및{" "}
          <a href="/privacy" className="underline hover:text-slate-600">개인정보처리방침</a>에
          동의하게 됩니다.
        </p>
      </div>
    </main>
  );
}
