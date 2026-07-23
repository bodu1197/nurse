import Link from "next/link";
import Logo from "@/components/Logo";

// 로그인·회원가입·비밀번호 찾기가 같은 껍데기를 쓴다.
// 화면마다 복사해두면 로고 위치 하나 바꾸는 데 네 파일을 고쳐야 한다.
export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <Link href="/" aria-label="널스넷 홈" className="flex justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2">
          <Logo className="text-3xl" />
        </Link>
        {children}
      </div>
    </main>
  );
}
