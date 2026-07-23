// 상세는 공고·프로필·지원여부·저장여부를 서버에서 읽는다. 그 사이 빈 화면 대신 뼈대를 보여준다.
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5" aria-busy="true">
      <span className="sr-only">공고를 불러오는 중입니다.</span>
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="h-7 w-3/4 animate-pulse rounded bg-slate-100" />
        <div className="mt-3 h-4 w-1/3 animate-pulse rounded bg-slate-100" />
        <div className="mt-2 h-4 w-1/4 animate-pulse rounded bg-slate-100" />
        <div className="mt-6 h-11 w-40 animate-pulse rounded-[12px] bg-slate-100" />
        <div className="mt-8 space-y-2">
          <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
    </main>
  );
}
