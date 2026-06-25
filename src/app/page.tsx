// 널스넷 랜딩 (Indeed 코리아 벤치마크) — 미니멀 검색 중심.
// ponytail: 정적. 검색 폼은 /jobs(GET)로 전송 — 결과 페이지는 다음 단계.

import SiteHeader from "@/components/SiteHeader";
import Logo from "@/components/Logo";
import { POPULAR_SEARCHES, FOOTER_NAV } from "@/lib/constants";

export default function Home() {
  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        {/* ── 검색바 ───────────────────────── */}
        <div className="mx-auto max-w-5xl px-4 pt-6 sm:pt-10">
          <form
            action="/jobs"
            method="get"
            className="flex flex-col gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-sm transition focus-within:border-teal-500 focus-within:shadow-md sm:flex-row sm:items-center sm:rounded-full"
          >
            <label className="flex flex-1 items-center gap-2 px-3 py-2.5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-slate-400" aria-hidden>
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
              </svg>
              <span className="sr-only">검색어</span>
              <input
                name="q"
                className="w-full bg-transparent text-base outline-none placeholder:text-slate-400"
                placeholder="직무, 키워드 및 병원"
              />
            </label>

            <span className="mx-1 hidden h-7 w-px bg-slate-200 sm:block" />

            <label className="flex items-center gap-2 px-3 py-2.5 sm:w-72">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-slate-400" aria-hidden>
                <path d="M12 21s-7-6.3-7-11a7 7 0 1114 0c0 4.7-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" />
              </svg>
              <span className="sr-only">지역</span>
              <input
                name="l"
                className="w-full bg-transparent text-base outline-none placeholder:text-slate-400"
                placeholder='지역 또는 "재택"'
              />
            </label>

            <button
              type="submit"
              className="rounded-full bg-teal-600 px-7 py-3 text-base font-bold text-white hover:bg-teal-700"
            >
              검색
            </button>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-sm text-slate-500">
            <span>인기 검색</span>
            {POPULAR_SEARCHES.map((k) => (
              <a key={k} href={`/jobs?q=${encodeURIComponent(k)}`} className="text-teal-700 hover:underline">
                {k}
              </a>
            ))}
          </div>
        </div>

        {/* ── 히어로 ───────────────────────── */}
        <section className="mx-auto max-w-2xl px-4 py-16 text-center sm:py-24">
          <Logo className="text-5xl sm:text-6xl" />

          <h1 className="mt-6 text-2xl font-bold text-slate-900 sm:text-3xl">
            여기서 다음 근무가 시작됩니다
          </h1>
          <p className="mx-auto mt-3 max-w-md text-slate-600">
            맞춤 간호사 공고 추천을 받으려면{" "}
            <a href="/signup" className="font-medium text-teal-700 hover:underline">계정을 만들거나</a>{" "}
            <a href="/login" className="font-medium text-teal-700 hover:underline">로그인</a>하세요.
          </p>

          <a
            href="/signup"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-teal-600 px-7 py-3 text-base font-bold text-white hover:bg-teal-700"
          >
            시작하기
            <span aria-hidden>→</span>
          </a>
        </section>

        {/* ── 미니 링크 ────────────────────── */}
        <section className="mx-auto max-w-2xl px-4 pb-20 text-center text-sm text-slate-600">
          <p>
            병원 채용담당자세요?{" "}
            <a href="/hospital" className="font-medium text-teal-700 hover:underline">
              무료로 공고 등록하기 →
            </a>
          </p>
          <p className="mt-3 text-xs text-slate-400">
            일부 공고는 고용노동부 워크넷 및 공공데이터포털에서 제공받아 표시됩니다.
          </p>
        </section>
      </main>

      {/* ── 푸터 ─────────────────────────── */}
      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm">
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-slate-600">
            {FOOTER_NAV.map((l) => (
              <a key={l.href} href={l.href} className="hover:text-teal-700">
                {l.label}
              </a>
            ))}
          </nav>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-200 pt-4 text-xs text-slate-400">
            <span>© 2026 널스넷 (NurseNet)</span>
            <a href="/privacy" className="hover:text-slate-600">개인정보처리방침</a>
            <a href="/terms" className="hover:text-slate-600">이용약관</a>
          </div>
        </div>
      </footer>
    </>
  );
}
