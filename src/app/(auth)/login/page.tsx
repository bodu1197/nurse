import LoginButtons from "@/components/LoginButtons";

export const metadata = { title: "로그인 · 회원가입 — 널스잡" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <a href="/" className="flex items-center justify-center gap-1.5 text-3xl font-extrabold tracking-tight">
          <span aria-hidden className="text-teal-600">✚</span>
          <span>널스<span className="text-teal-600">잡</span></span>
        </a>

        <h1 className="mt-8 text-center text-xl font-bold text-slate-900">
          간호사 채용, 3초 만에 시작
        </h1>
        <p className="mt-2 text-center text-sm text-slate-500">
          SNS 계정으로 로그인하거나 회원가입하세요.
        </p>

        <div className="mt-8">
          <LoginButtons />
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-slate-400">
          로그인 시{" "}
          <a href="/terms" className="underline hover:text-slate-600">이용약관</a> 및{" "}
          <a href="/privacy" className="underline hover:text-slate-600">개인정보처리방침</a>에
          동의하게 됩니다.
        </p>
      </div>
    </main>
  );
}
