"use client";

import { useState } from "react";

const MENU = [
  { label: "채용 검색", href: "/jobs" },
  { label: "급여", href: "/salaries" },
  { label: "병원 리뷰", href: "/reviews" },
  { label: "회원가입", href: "/signup" },
  { label: "병원 공고등록", href: "/hospital" },
];

export default function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center px-4">
        <a href="/" className="flex items-center gap-1.5 text-2xl font-extrabold tracking-tight">
          <span aria-hidden className="text-teal-600">✚</span>
          <span>널스<span className="text-teal-600">잡</span></span>
        </a>

        <div className="ml-auto flex items-center gap-2">
          <a
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
            </svg>
            로그인
          </a>
          <button
            type="button"
            aria-label="메뉴 열기"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg p-2 text-slate-700 hover:bg-slate-100"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 top-16 z-20 bg-black/20" onClick={() => setOpen(false)} aria-hidden />
          <nav className="absolute right-2 top-[60px] z-30 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
            {MENU.map((m) => (
              <a
                key={m.href}
                href={m.href}
                className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-teal-700"
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
