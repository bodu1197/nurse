"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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
        <Link
          href="/"
          aria-label="널스넷 홈"
          className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
        >
          <Logo />
        </Link>

        <nav className="ml-7 hidden items-center gap-5 text-sm font-medium text-slate-600 sm:flex">
          {[["/jobs", "채용공고"], ["/talent", "인재정보"], ["/reviews", "리뷰"], ["/board", "게시판"]].map(([href, label]) => (
            <Link key={href} href={href} className="rounded py-1 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2">{label}</Link>
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
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
        <button
          type="button"
          aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
          aria-expanded={open}
          aria-controls="site-menu"
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
          </svg>
          메뉴
        </button>
        <Link
          href={user ? "/mypage" : "/login"}
          className="flex min-h-14 flex-col items-center justify-center gap-0.5 border-l border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
          </svg>
          {user ? "마이페이지" : "로그인"}
        </Link>
      </nav>
    </header>
  );
}
