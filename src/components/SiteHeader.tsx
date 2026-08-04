"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { HEADER_MENU } from "@/lib/constants";
import { signOut } from "@/app/(auth)/actions";

/**
 * 모바일 하단 탭 — 홈 · 채용공고 · 인재정보 · 리뷰 · 로그인(로그인 후 마이페이지). 오너 확정 2026-08-04.
 * 🔴 메뉴(햄버거)는 여기 넣지 않는다. 하단은 **자주 가는 곳**을 두는 자리이고,
 *    메뉴는 이미 화면 위 오른쪽에 있다. 다섯 칸을 넘기면 글자가 줄어 읽을 수 없다.
 */
const TAB_CLASS =
  "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600";

const BOTTOM_TABS = [
  { href: "/", label: "홈", icon: <path d="M3 10l9-7 9 7v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1z" /> },
  { href: "/jobs", label: "채용공고", icon: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" /></> },
  { href: "/talent", label: "인재정보", icon: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" /></> },
  { href: "/reviews", label: "리뷰", icon: <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" /> },
] as const;

export default function SiteHeader({ user }: Readonly<{ user: { displayName: string } | null }>) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center px-4">
        <Link
          href="/"
          aria-label="널스넷 홈"
          className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
        >
          <Logo />
        </Link>

        {/* 🔴 다섯 번째 항목(AI 자동매치)은 lg(1024px) 부터만 그린다.
            실측 2026-08-05: 이 항목은 77px 를 먹는데, 640px 화면에서는 비로그인 상태만으로도
            문서 폭이 698px 가 되어 헤더가 가로로 넘쳤다. 로그인 상태 헤더(마이페이지+이름+로그아웃)는
            **이 항목이 없어도** 768px 에서 이미 넘치는 기존 문제가 있어(883px), 거기에 얹지 않는다.
            그 아래 폭에서는 오른쪽 햄버거 메뉴(HEADER_MENU)에 같은 항목이 있어 갈 길이 막히지 않는다. */}
        <nav className="ml-7 hidden items-center gap-5 text-sm font-medium text-slate-600 sm:flex">
          {[
            { href: "/jobs", label: "채용공고" },
            { href: "/match", label: "AI 자동매치", cls: "hidden lg:inline-block" },
            { href: "/talent", label: "인재정보" },
            { href: "/reviews", label: "리뷰" },
            { href: "/board", label: "게시판" },
          ].map(({ href, label, cls }) => (
            <Link key={href} href={href} className={`rounded py-1 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 ${cls ?? ""}`}>{label}</Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <Link href="/hospital" className="hidden items-center px-3 text-sm font-medium text-slate-600 hover:text-teal-700 sm:inline-flex">병원 회원·공고등록</Link>
          {user ? (
            <>
              {/* 🔴 전에는 "홍길동님" 만 적혀 있었다. 이 글자가 마이페이지 링크인 줄 알 방법이 없어
                  회원 정보 근처를 전부 눌러봐야 했다(오너 지적 2026-08-04).
                  갈 곳의 이름을 그대로 적는다 — 이름은 그 옆에 작게 둔다. */}
              <Link href="/mypage" className="hidden items-center gap-1.5 rounded px-2 text-sm font-semibold text-slate-800 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 sm:inline-flex">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
                </svg>
                마이페이지
                <span className="max-w-[7rem] truncate font-normal text-slate-400">{user.displayName}</span>
              </Link>
              <form action={signOut}>
                <button type="submit" className="inline-flex min-h-11 items-center gap-1.5 rounded px-2 text-sm font-medium text-slate-700 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                  </svg>
                  로그아웃
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center gap-1.5 rounded px-2 text-sm font-medium text-slate-700 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
              </svg>
              로그인
            </Link>
          )}
          <button
            ref={buttonRef}
            type="button"
            aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setOpen((v) => !v)}
            className="grid h-12 w-12 place-items-center rounded-lg text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 sm:h-11 sm:w-11"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 top-16 z-20 bg-black/20" onClick={close} aria-hidden />
          <nav
            id="site-menu"
            className="absolute right-2 top-[60px] z-30 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
          >
            {(user ? [{ label: "마이페이지", href: "/mypage" }, ...HEADER_MENU.filter((m) => m.href !== "/signup")] : HEADER_MENU).map((m, i) => (
              <Link
                key={m.href}
                href={m.href}
                onClick={() => setOpen(false)}
                autoFocus={i === 0}
                className="block px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 hover:text-teal-700 focus-visible:bg-slate-50 focus-visible:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600"
              >
                {m.label}
              </Link>
            ))}
          </nav>
        </>
      )}

      {/* 🔴 모바일 하단 탭(오너 지시 2026-08-04). 휴대폰에서는 화면 맨 위 구석까지 엄지가 안 닿는다 —
          가장 많이 쓰는 두 가지를 손가락이 닿는 곳에 둔다.
          로그인 전에는 「로그인」, 로그인 후에는 「마이페이지」. 같은 자리에서 뜻만 바뀐다.
          메뉴는 위 햄버거와 **같은 상태**를 쓴다 — 따로 만들면 하나를 열어둔 채 다른 하나를 열 수 있다. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
        {BOTTOM_TABS.map(({ href, label, icon }) => (
          <Link key={href} href={href} className={TAB_CLASS}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>{icon}</svg>
            {label}
          </Link>
        ))}
        {/* 마지막 칸만 로그인 여부에 따라 뜻이 바뀐다 — 자리는 그대로다. */}
        <Link href={user ? "/mypage" : "/login"} className={TAB_CLASS}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
          </svg>
          {user ? "마이페이지" : "로그인"}
        </Link>
      </nav>
    </header>
  );
}
