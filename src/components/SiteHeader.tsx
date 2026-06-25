"use client";

import { useEffect, useRef, useState } from "react";
import Logo from "@/components/Logo";
import { HEADER_MENU } from "@/lib/constants";
import { signOut } from "@/app/(auth)/actions";

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
        <a
          href="/"
          aria-label="널스넷 홈"
          className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
        >
          <Logo />
        </a>

        <nav className="ml-7 hidden items-center gap-5 text-sm font-medium text-slate-600 sm:flex">
          <a href="/" className="hover:text-teal-700">홈</a>
          <a href="/jobs" className="hover:text-teal-700">채용공고</a>
          <a href="/reviews" className="hover:text-teal-700">병원 리뷰</a>
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <a href="/hospital" className="hidden items-center px-3 text-sm font-medium text-slate-600 hover:text-teal-700 sm:inline-flex">병원 회원·공고등록</a>
          {user ? (
            <>
              <a href="/mypage" className="hidden rounded px-2 text-sm font-medium text-slate-700 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 sm:inline">{user.displayName}님</a>
              <form action={signOut}>
                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center rounded-[12px] border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
                >
                  로그아웃
                </button>
              </form>
            </>
          ) : (
            <a
              href="/login"
              className="inline-flex min-h-11 items-center rounded px-2 text-sm font-medium text-slate-700 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              로그인
            </a>
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
              <a
                key={m.href}
                href={m.href}
                onClick={() => setOpen(false)}
                autoFocus={i === 0}
                className="block px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 hover:text-teal-700 focus-visible:bg-slate-50 focus-visible:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600"
              >
                {m.label}
              </a>
            ))}
          </nav>
        </>
      )}
    </header>
  );
}
