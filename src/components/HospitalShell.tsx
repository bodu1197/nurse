import SiteHeader from "@/components/SiteHeader";
import type { ReactNode } from "react";

// 병원 마이페이지 공용 셸 — LNB(사이드바)로 모든 병원 페이지 레이아웃 통일.
const NAV = [
  { href: "/mypage", label: "대시보드" },
  { href: "/mypage/jobs/new", label: "공고 등록" },
  { href: "/mypage/jobs", label: "공고 관리" },
  { href: "/mypage/applicants", label: "받은 지원자" },
  { href: "/mypage/verify", label: "사업자 인증" },
];

export default function HospitalShell({ displayName, active, children }: Readonly<{ displayName: string; active: string; children: ReactNode }>) {
  return (
    <>
      <SiteHeader user={{ displayName }} />
      <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-5 px-4 py-6 lg:flex-row lg:gap-6">
        <aside className="hidden lg:block lg:w-56 lg:shrink-0">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-teal-50 text-base font-bold text-teal-700" aria-hidden>{displayName.slice(0, 1)}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{displayName}</p>
                <span className="text-xs font-semibold text-teal-700">병원 회원</span>
              </div>
            </div>
          </div>
          <nav className="mt-3 space-y-1 rounded-2xl border border-slate-200 bg-white p-2">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className={`block rounded-lg px-3 py-2 text-sm ${n.href === active ? "bg-teal-50 font-semibold text-teal-700" : "text-slate-600 hover:bg-slate-50"}`}>{n.label}</a>
            ))}
          </nav>
        </aside>

        <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${n.href === active ? "border-teal-500 bg-teal-50 font-semibold text-teal-700" : "border-slate-300 text-slate-600"}`}>{n.label}</a>
          ))}
        </nav>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </>
  );
}
