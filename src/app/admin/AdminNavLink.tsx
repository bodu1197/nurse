"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 관리자 상단 메뉴 한 칸. 지금 보고 있는 화면을 표시한다.
 *
 * 클라이언트 컴포넌트인 이유는 현재 경로가 필요해서다(layout 은 자기 경로를 모른다).
 * 링크 몇 개라 번들에 실리는 비용이 사실상 없다.
 */
export default function AdminNavLink({ href, label }: Readonly<{ href: string; label: string }>) {
  const pathname = usePathname();
  // "/admin" 은 정확히 일치할 때만 현재로 본다 — 안 그러면 하위 화면에서도 계속 켜져 있다.
  const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
        active ? "border-teal-600 text-teal-700" : "border-transparent text-slate-600 hover:text-teal-700"
      }`}
    >
      {label}
    </Link>
  );
}
