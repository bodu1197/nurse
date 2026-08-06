import type { ReactNode } from "react";
import Link from "next/link";

/** 관리자 화면 공통 조각. 화면마다 같은 카드·표 마크업을 다시 쓰지 않게 한 곳에 모은다. */

export function PageTitle({ title, desc }: Readonly<{ title: string; desc?: string }>) {
  return (
    <div className="mb-6">
      {/* 🔴 화면 제목은 사이트 전체가 text-2xl 하나로 간다(마이페이지와 같다). 같은 자리의
          같은 요소가 화면마다 text-xl·text-2xl 로 갈리면 그게 곧 "글자 크기가 제각각" 이다
          (오너 지적 2026-08-06). 로그인·오류 화면의 text-xl 은 좁은 카드 안이라 일부러 작게
          둔 것 — 거기는 그대로다.
          🔴 sm: 로 크기를 또 키우지 않는다. globals.css 가 640px 부터 루트를 16→18px 로 올려
             rem 값이 이미 따라 커진다(text-2xl = 24px → 27px). 반응형을 겹치면 두 번 커진다. */}
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      {desc && <p className="mt-1 text-sm text-slate-500">{desc}</p>}
    </div>
  );
}

export function Notice({ ok, error, messages }: Readonly<{ ok?: string; error?: string; messages: Record<string, string> }>) {
  if (error) {
    return (
      <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {messages[error] ?? "처리에 실패했습니다."}
      </p>
    );
  }
  if (ok) {
    return (
      <p role="status" className="mb-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
        {messages[ok] ?? "처리했습니다."}
      </p>
    );
  }
  return null;
}

/** 숫자 카드. 못 센 값은 "—" — 0 과 구분되어야 정책이 깨진 것을 알아챈다. */
export function Stat({ label, value, sub, tone = "plain", href }: Readonly<{
  label: string; value: number | string | null; sub?: string; tone?: "plain" | "warn" | "good"; href?: string;
}>) {
  const bad = tone === "warn" && typeof value === "number" && value > 0;
  const body = (
    <>
      <p className={`text-sm ${bad ? "text-red-700" : "text-slate-500"}`}>{label}</p>
      <p className={`mt-1 text-2xl font-bold ${bad ? "text-red-700" : tone === "good" ? "text-teal-700" : "text-slate-900"}`}>
        {value === null ? <span title="집계 실패 — 서버 로그를 확인하세요">—</span> : typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
      {bad && (
        <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
          <span aria-hidden>⚠</span> 확인 필요
        </p>
      )}
    </>
  );
  const cls = `rounded-2xl border p-4 ${bad ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`;
  return href ? (
    <Link href={href} className={`${cls} block hover:border-teal-400 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600`}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Section({ title, children, action }: Readonly<{ title: string; children: ReactNode; action?: ReactNode }>) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-500">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** 표는 좁은 화면에서 가로 스크롤한다 — 열을 접으면 관리 화면에서 필요한 값이 사라진다. */
export function TableWrap({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[720px] text-left text-sm">{children}</table>
    </div>
  );
}

export const TH = ({ children, className = "" }: Readonly<{ children: ReactNode; className?: string }>) => (
  <th scope="col" className={`whitespace-nowrap border-b border-slate-200 px-3 py-2.5 font-semibold text-slate-600 ${className}`}>{children}</th>
);

export const TD = ({ children, className = "" }: Readonly<{ children: ReactNode; className?: string }>) => (
  <td className={`border-b border-slate-100 px-3 py-2.5 align-top text-slate-800 ${className}`}>{children}</td>
);

export function Empty({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-sm text-slate-500">{children}</p>
  );
}

/**
 * 목록이 비었을 때 — **데이터가 없는 것**과 **못 읽은 것**을 구분해 보여준다.
 *
 * 🔴 이 구분이 없어서 사고가 났다. 이력서 목록이 컬럼 이름 하나 때문에 조회에 실패했는데
 *    화면은 "0건" 이라고 말했고, 7,270건이 있는 표를 비어 있는 것으로 읽게 만들었다.
 */
export function EmptyOrFailed({ failed, children }: Readonly<{ failed?: boolean; children: ReactNode }>) {
  if (!failed) return <Empty>{children}</Empty>;
  return (
    <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-12 text-center text-sm text-red-700">
      <b className="block">목록을 불러오지 못했습니다.</b>
      <span className="mt-1 block text-red-600">데이터가 없는 것이 아닙니다 — 서버 로그를 확인하세요.</span>
    </p>
  );
}

/** 필터 탭 — 링크로 만든다(서버에서 그대로 렌더되고 뒤로가기가 자연스럽다). */
export function Tabs({ items }: Readonly<{ items: readonly { href: string; label: string; active: boolean }[] }>) {
  return (
    <nav className="mb-4 flex flex-wrap gap-2" aria-label="필터">
      {items.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.active ? "page" : undefined}
          className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
            t.active ? "border-teal-500 bg-teal-50 font-semibold text-teal-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** 검색 상자 — GET 폼이라 결과가 주소에 남고, 그대로 공유·새로고침된다. */
export function SearchBox({ action, name = "q", value, placeholder, hidden = {} }: Readonly<{
  action: string; name?: string; value?: string; placeholder: string; hidden?: Record<string, string>;
}>) {
  return (
    <form action={action} method="get" className="mb-4 flex flex-wrap gap-2">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label className="min-w-0 flex-1">
        <span className="sr-only">{placeholder}</span>
        {/* 🔴 key 를 준다. defaultValue 는 처음 그려질 때만 쓰이는데, 앱 라우터는 화면을 갈아끼울 때
            이 input 을 그대로 재사용한다 — 그래서 주소에는 ?q=해온마취통증의학과 가 붙어 있는데
            검색창은 비어 보였다. **결과는 걸러져 있는데 왜 걸러졌는지 화면에 없었다**
            (오너 지적 2026-08-04: "검색도 안 되고"). key 가 바뀌면 새로 그려져 값이 맞는다. */}
        <input key={value ?? ""} name={name} defaultValue={value} placeholder={placeholder}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus-visible:ring-2 focus-visible:ring-teal-600" />
      </label>
      <button type="submit" className="inline-flex min-h-11 items-center rounded-lg bg-slate-800 px-4 text-sm font-semibold text-white hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
        검색
      </button>
      {/* 검색을 건 상태에서 빠져나올 길을 준다 — 없으면 주소를 직접 고치는 수밖에 없다. */}
      {value?.trim() && (
        <a href={`${action}${Object.keys(hidden).length ? `?${new URLSearchParams(hidden)}` : ""}`}
          className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
          검색 해제
        </a>
      )}
    </form>
  );
}
