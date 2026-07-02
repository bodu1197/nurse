import { FOOTER_NAV } from "@/lib/constants";

// 공용 푸터 — 홈·급여정보 등 여러 페이지에서 재사용(SiteHeader와 대칭).
export default function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-[1280px] px-4 py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="text-lg font-bold text-teal-700">✚ 널스넷</span>
            <p className="mt-2 max-w-xs text-sm text-slate-500">간호사와 병원을 잇는 전문 채용 플랫폼.</p>
          </div>
          <nav className="grid grid-cols-2 gap-x-10 gap-y-1 text-sm sm:grid-cols-1">
            {FOOTER_NAV.map((l) => (
              <a key={l.href} href={l.href} className="inline-block py-2.5 text-slate-600 hover:text-teal-700">{l.label}</a>
            ))}
          </nav>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 pt-5 text-xs text-slate-400">
          <span>© 2026 널스넷 (NurseNet)</span>
          <a href="/privacy" className="inline-block py-2 hover:text-slate-600">개인정보처리방침</a>
          <a href="/terms" className="inline-block py-2 hover:text-slate-600">이용약관</a>
        </div>
      </div>
    </footer>
  );
}
