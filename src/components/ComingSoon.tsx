export default function ComingSoon({ title, desc }: { title: string; desc?: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <a href="/" className="flex items-center gap-1.5 text-2xl font-extrabold tracking-tight">
        <span aria-hidden className="text-teal-600">✚</span>
        <span>널스<span className="text-teal-600">잡</span></span>
      </a>
      <span className="mt-8 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">준비 중</span>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">{title}</h1>
      <p className="mt-3 max-w-sm text-slate-500">{desc ?? "이 페이지는 준비 중입니다. 곧 만나요!"}</p>
      <a href="/" className="mt-8 rounded-full bg-teal-600 px-6 py-3 text-sm font-bold text-white hover:bg-teal-700">
        홈으로 →
      </a>
    </main>
  );
}
