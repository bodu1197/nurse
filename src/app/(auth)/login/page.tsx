import LoginButtons from "@/components/LoginButtons";
import Logo from "@/components/Logo";

export const metadata = {
  title: "로그인 — 널스넷",
  robots: { index: false, follow: false },
};

const ERROR_MESSAGES: Record<string, string> = {
  oauth: "카카오 로그인에 실패했습니다. 다시 시도해 주세요.",
  naver_state: "보안 검증에 실패했습니다. 다시 시도해 주세요.",
  naver_config: "네이버 로그인 설정 오류입니다. 잠시 후 다시 시도해 주세요.",
  naver_token: "네이버 인증에 실패했습니다. 다시 시도해 주세요.",
  naver_profile: "네이버 프로필을 불러오지 못했습니다.",
  naver_email: "네이버 계정의 이메일 제공에 동의해 주세요.",
  naver_session: "세션 생성에 실패했습니다. 다시 시도해 주세요.",
  naver_verify: "로그인 처리에 실패했습니다. 다시 시도해 주세요.",
};

export default async function LoginPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ error?: string }> }>) {
  const { error } = await searchParams;
  const message = error ? (ERROR_MESSAGES[error] ?? "로그인에 실패했습니다. 다시 시도해 주세요.") : null;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <a href="/" aria-label="널스넷 홈" className="flex justify-center">
          <Logo className="text-3xl" />
        </a>

        <h1 className="mt-8 text-center text-xl font-bold text-slate-900">로그인</h1>
        <p className="mt-2 text-center text-sm text-slate-500">
          간호사·병원 회원 모두 SNS 계정으로 로그인하세요.
        </p>

        {message && (
          <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {message}
          </div>
        )}

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
