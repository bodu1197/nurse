import Link from "next/link";
import Logo from "@/components/Logo";
import Button from "@/components/Button";

export default function ComingSoon({ title, desc }: Readonly<{ title: string; desc?: string }>) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <Link href="/" aria-label="널스넷 홈">
        <Logo />
      </Link>
      <span className="mt-8 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">준비 중</span>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">{title}</h1>
      <p className="mt-3 max-w-sm text-slate-500">{desc ?? "이 페이지는 준비 중입니다. 곧 만나요!"}</p>
      <Button href="/" size="md" className="mt-8">
        홈으로 →
      </Button>
    </main>
  );
}
