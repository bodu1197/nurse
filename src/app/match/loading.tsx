// 자동매치는 희망 지역의 공고를 전부 받아 앱에서 판정·정렬한 뒤에야 첫 화면이 나온다(/jobs 보다 느리다).
// 로딩 경계가 없으면 헤더 'AI 자동매치'를 눌러도 보던 화면이 그대로 멈춰 있어 다시 누르게 된다.
// 목록(jobs/loading.tsx)과 같은 방식.
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6" aria-busy="true">
      <span className="sr-only">자동매치 결과를 불러오는 중입니다.</span>
      <div className="h-8 w-40 animate-pulse rounded bg-slate-100" />
      <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-slate-100" />
      <div className="mt-6 h-20 w-full animate-pulse rounded-xl bg-slate-100" />
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="h-5 w-3/4 animate-pulse rounded bg-slate-100" />
            <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-slate-100" />
            <div className="mt-4 h-4 w-1/3 animate-pulse rounded bg-slate-100" />
          </li>
        ))}
      </ul>
    </main>
  );
}
