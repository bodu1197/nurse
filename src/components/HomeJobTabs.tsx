"use client";

import Link from "next/link";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

export type HomeJobTab = Readonly<{
  key: string;
  label: string;
  count: number;
  /** '전체 보기 →' 가 가는 곳 — 탭마다 다르다(/jobs · /care-jobs). */
  moreHref: string;
  panel: ReactNode;
}>;

/**
 * 홈 '최신 채용공고' 탭 — [간호사·간호조무사 | 요양보호사·간병인].
 *
 * 두 목록 다 서버가 그려서 보내고(page.tsx) 여기서는 **보이기만** 바꾼다 — 새로고침 없이 즉시 바뀌고,
 * 검색엔진 봇은 둘 다 읽는다(hidden 은 숨길 뿐 HTML 에 있다). 탭 상태는 URL 에 싣지 않는다 — 홈은 색인
 * 정본(canonical "/")이라 ?tab= 변형 URL 을 만들 이유가 없다.
 * 키보드: ←→ 로 탭 이동(WAI-ARIA tabs 패턴 — 비활성 탭은 tabIndex -1 이라 Tab 키는 탭 묶음을 한 번에 지난다).
 * 좁은 화면(360px)에서는 건수를 라벨 아래 줄로 내린다 — 한 줄이면 두 탭 합이 칸을 넘어 어절 단위로 깨진다.
 */
export default function HomeJobTabs({ tabs }: Readonly<{ tabs: readonly HomeJobTab[] }>) {
  const [active, setActive] = useState(0);
  const id = useId();

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
    setActive(next);
    const el = e.currentTarget.parentElement?.children[next];
    if (el instanceof HTMLElement) el.focus();
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="채용공고 종류" className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {tabs.map((t, i) => {
            const on = i === active;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`${id}-tab-${t.key}`}
                aria-selected={on}
                aria-controls={`${id}-panel-${t.key}`}
                tabIndex={on ? 0 : -1}
                onClick={() => setActive(i)}
                onKeyDown={(e) => onKey(e, i)}
                // 활성 탭은 흰 칩 + teal-600 테두리(ring) — 흰 칩만으로는 slate-100 바탕과 대비가 1.1:1, teal-300 테두리도
                // 1.35:1 이라 선택 표시가 3:1(WCAG 1.4.11)에 못 미친다. teal-600 은 3.4:1.
                className={`flex min-h-11 flex-col items-center justify-center rounded-lg px-3 py-1 text-sm font-semibold leading-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 sm:flex-row sm:gap-1.5 sm:px-4 ${
                  on ? "bg-white text-teal-800 shadow-sm ring-1 ring-teal-600" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>{t.label}</span>
                {/* 건수는 탭 안에 — 어느 쪽이 얼마나 있는지 누르기 전에 보인다(종전엔 제목 옆 "총 N건"). */}
                <span className={`text-xs font-normal sm:text-sm ${on ? "text-teal-700" : "text-slate-600"}`}>{t.count.toLocaleString()}건</span>
              </button>
            );
          })}
        </div>
        {/* 🔴 '전체 보기' 링크를 탭마다 하나씩 **둘 다 HTML 에** 둔다(안 보이는 쪽은 hidden). 활성 탭 것만 두면 서버 HTML 에
            /care-jobs 로 가는 링크가 없어 고아 페이지가 된다 — 크롤러는 탭을 누르지 않는다. */}
        {tabs.map((t, i) => (
          <Link
            key={t.key}
            href={t.moreHref}
            hidden={i !== active}
            aria-label={`${t.label} 채용공고 전체 보기`}
            // ml-auto — 좁은 화면에서 둘째 줄로 내려가도 오른쪽에 붙는다. 포커스는 hover(밑줄)와 구분되게 ring.
            className="ml-auto inline-flex min-h-11 items-center rounded text-sm font-semibold text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
          >
            전체 보기 →
          </Link>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.key} role="tabpanel" id={`${id}-panel-${t.key}`} aria-labelledby={`${id}-tab-${t.key}`} hidden={i !== active}>
          {t.panel}
        </div>
      ))}
    </>
  );
}
