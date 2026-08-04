import type { ReactNode } from "react";
import SiteHeader from "@/components/SiteHeader";
import { requireAdmin } from "@/lib/data/admin";
import AdminNavLink from "@/app/admin/AdminNavLink";

// 관리자 화면은 색인 대상이 아니다. 하위 페이지가 robots 지정을 빠뜨려도 여기서 한 번 더 막는다.
export const metadata = { robots: { index: false, follow: false } };

// ponytail: 좌우 사이드바 없이 상단 링크 두 개. 화면이 늘면 그때 접는 메뉴로 바꾼다.
const NAV = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/moderation", label: "모더레이션" },
] as const;

export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const p = await requireAdmin(); // 관리자가 아니면 404. 서버 액션은 각자 다시 확인한다.
  return (
    <>
      <SiteHeader user={{ displayName: p.displayName }} />
      <div className="bg-slate-800 px-4 py-1.5 text-center text-sm font-semibold text-white">
        관리자 화면 — 하는 일이 모두 기록됩니다
      </div>
      <nav aria-label="관리자 메뉴" className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl gap-1 px-4">
          {NAV.map((n) => <AdminNavLink key={n.href} href={n.href} label={n.label} />)}
        </div>
      </nav>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
