"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type NavItem = { href: string; label: string };
export type NavGroup = { title: string; items: readonly NavItem[] };

/**
 * 관리자 좌측 메뉴.
 *
 * 클라이언트 컴포넌트인 이유는 두 가지다 — 현재 경로 표시(layout 은 자기 경로를 모른다)와
 * 좁은 화면에서 접기. 링크 목록뿐이라 번들 비용은 사실상 없다.
 */
export default function AdminSidebar({ groups }: Readonly<{ groups: readonly NavGroup[] }>) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // "/admin" 은 정확히 일치할 때만 현재로 본다 — 아니면 하위 화면에서도 계속 켜져 있다.
  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href.split("?")[0]);

  const nav = (
    <nav aria-label="관리자 메뉴" className="flex flex-col gap-6 p-4">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.title}</p>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = isActive(it.href);
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={`flex min-h-11 items-center rounded-lg px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                      active ? "bg-teal-600 font-semibold text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    {it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* 좁은 화면: 상단 막대 + 펼치기 */}
      <div className="flex items-center gap-2 bg-slate-900 px-3 py-2 text-white lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="admin-nav-mobile"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
        >
          <span className="sr-only">메뉴 {open ? "닫기" : "열기"}</span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
        <span className="font-bold">널스넷 관리자</span>
      </div>
      {open && <div id="admin-nav-mobile" className="bg-slate-900 lg:hidden">{nav}</div>}

      {/* 넓은 화면: 고정 사이드바 */}
      <aside className="hidden w-60 shrink-0 bg-slate-900 lg:block">
        <div className="sticky top-0">
          <Link
            href="/admin"
            className="flex min-h-14 items-center px-6 text-lg font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          >
            널스넷 관리자
          </Link>
          {nav}
        </div>
      </aside>
    </>
  );
}
