"use client";

import { useEffect, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import Logo from "@/components/Logo";
import { HEADER_MENU } from "@/lib/constants";
import { signOut } from "@/app/(auth)/actions";

/**
 * 모바일 하단 탭 — 홈 · 채용공고 · 인재정보 · AI 자동매치 · 로그인(로그인 후 마이페이지).
 * 🔴 메뉴(햄버거)는 여기 넣지 않는다. 하단은 **자주 가는 곳**을 두는 자리이고,
 *    메뉴는 이미 화면 위 오른쪽에 있다. 다섯 칸을 넘기면 글자가 줄어 읽을 수 없다.
 * 🔴 네 번째 칸이 '리뷰' → 'AI 자동매치' 로 바뀌었다(오너 지시 2026-08-05). 리뷰는 햄버거
 *    메뉴(HEADER_MENU)와 푸터(FOOTER_NAV)에 그대로 있어 갈 길이 막히지 않는다.
 */
const TAB_CLASS =
  "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600";

/**
 * 누른 메뉴 글자를 깜빡여 "눌렸다"를 알린다. 이동이 끝나면 저절로 멈춘다.
 *
 * 🔴 왜 필요한가: `app/jobs/loading.tsx` 와 `app/jobs/[id]/loading.tsx` 를 지웠기 때문이다(2026-08-06).
 *    그 파일들은 **페이지 전체를 Suspense 로 감싸서**, 초기 HTML 에는 「채용공고를 불러오는 중입니다」만
 *    담기고 공고 본문·`<h1>`·JobPosting 구조화 데이터는 전부 `<div hidden>` 안으로 들어갔다.
 *    JS 를 실행하지 않는 크롤러(네이버 Yeti · GPTBot · ClaudeBot · PerplexityBot)에게는 공고 1,345건이
 *    통째로 빈 페이지였고, 없는 공고가 404 대신 200 을 돌려줬다(셸이 먼저 나가 상태코드가 굳는다).
 *    그래서 지웠는데, 그러면 loading.tsx 가 해 주던 "눌렀다"는 신호까지 함께 사라진다
 *    (원래 주석: "로딩 경계가 없으면 헤더 '채용공고'를 눌러도 보던 화면이 그대로 멈춰 있어 다시 누르게 된다").
 *
 * `useLinkStatus` 는 **Suspense 경계를 만들지 않으므로 초기 HTML 이 그대로다** — 크롤러가 보는 것은
 * 하나도 안 바뀐 채 그 신호만 되살린다. 덤으로 INP(클릭 → 다음 페인트)가 짧아진다(Core Web Vitals 항목).
 *
 * 🔴 아이콘까지 감싸지 말 것 — 하단 탭은 `flex-col` 이라 svg 와 글자가 각각 flex 아이템이어야 한다.
 *    둘을 한 span 으로 묶으면 아이콘과 글자가 가로로 붙는다.
 */
function LinkPending({ children }: Readonly<{ children: React.ReactNode }>) {
  const { pending } = useLinkStatus();
  // 🔴 motion-safe: — 느린 회선에서는 이동이 끝날 때까지 몇 초씩 깜빡인다. 전정 장애 등으로
  //    모션에 민감한 사람에게는 그게 고통이다. Tailwind 기본 variant 라 CSS 추가는 필요 없다.
  return <span className={pending ? "motion-safe:animate-pulse" : undefined}>{children}</span>;
}

const BOTTOM_TABS = [
  { href: "/", label: "홈", icon: <path d="M3 10l9-7 9 7v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1z" /> },
  { href: "/jobs", label: "채용공고", icon: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" /></> },
  { href: "/talent", label: "인재정보", icon: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" /></> },
  // 반짝임(sparkles) — 큰 별 하나 + 작은 별 하나. 리뷰의 5각 별과 헷갈리지 않게 모양을 다르게 둔다.
  {
    href: "/match",
    label: "AI 자동매치",
    icon: (
      <>
        <path d="M12 3l1.8 4.9 4.9 1.8-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8z" />
        <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
      </>
    ),
  },
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

        {/* 🔴 상단 메뉴는 **lg(1024px)부터** 그린다 — 그 아래는 하단 탭이 내비게이션을 맡는다.
            종전에는 sm(640px)부터 폈는데, 로그인 상태(마이페이지+이름+로그아웃)에서 헤더가
            **가로로 넘쳤다**(실측 2026-08-05: 768px 화면에서 문서 폭 883px). 메뉴가 4개일 때부터
            이미 넘쳤으므로 항목 하나를 숨기는 식의 땜질로는 안 되고, "자리가 확실한 폭에서만 편다"
            로 규칙을 바꾼다. 그 아래에서는 하단 탭(홈·채용공고·인재정보·리뷰·마이페이지)과
            햄버거 메뉴(HEADER_MENU, AI 자동매치 포함)가 같은 곳을 전부 담는다. */}
        <nav className="ml-7 hidden items-center gap-5 text-sm font-medium text-slate-600 lg:flex">
          {[["/jobs", "채용공고"], ["/match", "AI 자동매치"], ["/talent", "인재정보"], ["/reviews", "리뷰"], ["/board", "게시판"]].map(([href, label]) => (
            <Link key={href} href={href} className="rounded py-1 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"><LinkPending>{label}</LinkPending></Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          {/* 상단 메뉴와 같은 폭 규칙(lg~) — 그 아래에서는 햄버거 메뉴·푸터에 같은 링크가 있다. */}
          <Link href="/hospital" className="hidden items-center px-3 text-sm font-medium text-slate-600 hover:text-teal-700 lg:inline-flex">병원 회원·공고등록</Link>
          {user ? (
            <>
              {/* 🔴 전에는 "홍길동님" 만 적혀 있었다. 이 글자가 마이페이지 링크인 줄 알 방법이 없어
                  회원 정보 근처를 전부 눌러봐야 했다(오너 지적 2026-08-04).
                  갈 곳의 이름을 그대로 적는다 — 이름은 그 옆에 작게 둔다. */}
              <Link href="/mypage" className="hidden items-center gap-1.5 rounded px-2 text-sm font-semibold text-slate-800 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 lg:inline-flex">
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
                <LinkPending>{m.label}</LinkPending>
              </Link>
            ))}
          </nav>
        </>
      )}

      {/* 🔴 모바일 하단 탭(오너 지시 2026-08-04). 휴대폰에서는 화면 맨 위 구석까지 엄지가 안 닿는다 —
          가장 많이 쓰는 두 가지를 손가락이 닿는 곳에 둔다.
          로그인 전에는 「로그인」, 로그인 후에는 「마이페이지」. 같은 자리에서 뜻만 바뀐다.
          메뉴는 위 햄버거와 **같은 상태**를 쓴다 — 따로 만들면 하나를 열어둔 채 다른 하나를 열 수 있다.
          🔴 숨김 기준이 sm(640)에서 **lg(1024)로 넓어졌다** — 상단 메뉴가 lg 부터만 펴지므로,
             640~1023 구간에 하단 탭까지 없으면 그 폭에서 갈 길이 햄버거 하나만 남는다.
             body 의 pb-14 도 같은 기준이어야 한다(app/layout.tsx). */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {BOTTOM_TABS.map(({ href, label, icon }) => (
          <Link key={href} href={href} className={TAB_CLASS}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>{icon}</svg>
            <LinkPending>{label}</LinkPending>
          </Link>
        ))}
        {/* 마지막 칸만 로그인 여부에 따라 뜻이 바뀐다 — 자리는 그대로다. */}
        <Link href={user ? "/mypage" : "/login"} className={TAB_CLASS}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
          </svg>
          <LinkPending>{user ? "마이페이지" : "로그인"}</LinkPending>
        </Link>
      </nav>
    </header>
  );
}
