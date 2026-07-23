import SiteHeader from "@/components/SiteHeader";
import type { ReactNode } from "react";

// 간호사 마이페이지 공용 셸 — 병원(HospitalShell)에만 있던 네비를 간호사 화면에도 준다.
// 이게 없으면 화면에 들어갈 때마다 마이페이지로 되돌아가 카드를 다시 눌러야 해서,
// 이력서·지원 내역·저장한 공고가 있어도 "없는 기능"이 된다.
const NAV = [
  { href: "/mypage", label: "마이페이지" },
  { href: "/mypage/resume", label: "내 이력서" },
  { href: "/mypage/applications", label: "지원 내역" },
  { href: "/mypage/saved", label: "저장한 공고" },
  { href: "/mypage/alerts", label: "채용 알림" },
  { href: "/jobs", label: "채용공고 찾기" },
];

export default function NurseShell({ displayName, active, children }: Readonly<{ displayName: string; active: string; children: ReactNode }>) {
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
                <span className="text-xs font-semibold text-teal-700">간호사 회원</span>
              </div>
            </div>
          </div>
          <nav aria-label="마이페이지" className="mt-3 space-y-1 rounded-2xl border border-slate-200 bg-white p-2">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} aria-current={n.href === active ? "page" : undefined}
                className={`block rounded-lg px-3 py-2 text-sm ${n.href === active ? "bg-teal-50 font-semibold text-teal-700" : "text-slate-600 hover:bg-slate-50"}`}>{n.label}</a>
            ))}
          </nav>
        </aside>

        {/* 모바일: 가로로 넘겨 보는 칩 — 화면을 옮길 때마다 뒤로가기를 반복하지 않게 */}
        <nav aria-label="마이페이지" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} aria-current={n.href === active ? "page" : undefined}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${n.href === active ? "border-teal-500 bg-teal-50 font-semibold text-teal-700" : "border-slate-300 text-slate-600"}`}>{n.label}</a>
          ))}
        </nav>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </>
  );
}
