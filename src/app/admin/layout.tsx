import type { ReactNode } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/data/admin";
import AdminSidebar, { type NavGroup } from "@/app/admin/AdminSidebar";

// 관리자 화면은 색인 대상이 아니다. 하위 페이지가 robots 지정을 빠뜨려도 여기서 한 번 더 막는다.
export const metadata = { robots: { index: false, follow: false } };

/**
 * 🔴 사이트 헤더(SiteHeader)를 쓰지 않는다. 관리자 화면은 손님용 사이트와 **다른 화면**이다 —
 *    같은 헤더를 쓰면 채용공고·인재정보 메뉴가 섞여 관리 중에 손님 화면으로 새어 나간다.
 *    폭도 제한하지 않는다(max-w 없음) — 표를 봐야 하는 화면이라 좁히면 열이 잘린다.
 */
const NAV: readonly NavGroup[] = [
  { title: "현황", items: [{ href: "/admin", label: "대시보드" }, { href: "/admin/stats", label: "접속자 통계" }] },
  {
    title: "회원",
    items: [
      { href: "/admin/users", label: "회원 현황" },
      { href: "/admin/resumes", label: "이력서 목록" },
      // 지원은 간호사가 하는 행동이라 「회원」 밑에 둔다 — 공고 밑에 두면 병원 관리로 읽힌다.
      { href: "/admin/applications", label: "지원 내역" },
    ],
  },
  {
    title: "광고 · 결제",
    items: [
      // 🔴 "공고 관리" 다. 유료든 무료든 광고를 안 냈든 **공고는 공고다**(오너 확정 2026-08-04).
      //    "광고 관리" 라고 적어놨더니 광고를 안 낸 공고를 찾을 곳이 없어 보였다.
      { href: "/admin/ads", label: "공고 관리" },
      // 이관 때 이름 자리에 아이디가 들어간 병원 — 구직자 화면에 그대로 나가므로 눈에 띄는 곳에 둔다.
      { href: "/admin/hospitals", label: "병원명 확인" },
      { href: "/admin/orders", label: "결제 내역" },
      { href: "/admin/invoices", label: "세금계산서" },
    ],
  },
  {
    title: "콘텐츠",
    items: [
      { href: "/admin/content", label: "공지 · FAQ · 이벤트" },
      { href: "/admin/inquiries", label: "문의사항" },
      { href: "/admin/moderation", label: "리뷰 · 게시판 관리" },
    ],
  },
];

export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const p = await requireAdmin(); // 관리자가 아니면 404. 서버 액션은 각자 다시 확인한다.
  return (
    <div className="flex min-h-screen flex-col bg-slate-100 lg:flex-row">
      <AdminSidebar groups={NAV} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 lg:px-8">
          <span className="text-sm text-slate-500">
            <b className="text-slate-800">{p.displayName}</b>님 · 하는 일이 모두 기록됩니다
          </span>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-slate-600 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
          >
            사이트 보기 →
          </Link>
        </header>
        <main className="min-w-0 flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
