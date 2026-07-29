// 목록은 렌더 전에 공고·시도·시군구·패싯·프로필을 동시에 읽고 저장 공고를 한 번 더 읽는다.
// 로딩 경계가 없으면 헤더 '채용공고'를 눌러도 보던 화면이 그대로 멈춰 있어 다시 누르게 된다.
// 상세(jobs/[id]/loading.tsx)와 같은 방식.
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-5" aria-busy="true">
      <span className="sr-only">채용공고를 불러오는 중입니다.</span>
      <div className="h-12 w-full animate-pulse rounded-2xl bg-slate-100" />
      <div className="mt-3 flex gap-2">
        {[64, 80, 72, 56].map((w, i) => (
          <div key={i} className="h-8 animate-pulse rounded-full bg-slate-100" style={{ width: w }} />
        ))}
      </div>
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
