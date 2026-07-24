"use client";

// 📍 내 주변 간호사 채용 찾기 — dolpagu(talent) NearMeControl 과 같은 CTA 모양.
// ⚠️ GPS 반경검색은 추후(소유자 확정 2026-07-24: "버튼은 만들어, 기능만 보류"). jobs 레코드에 좌표가
//    없어 지금은 반경검색이 불가하므로, 클릭 시 안내만 띄우고 지역 드롭다운으로 유도한다.
//    좌표 파이프라인이 생기면 이 컴포넌트만 talent NearMeControl 로 교체하면 된다.
import { useState } from "react";

export default function JobNearMeButton() {
  const [hint, setHint] = useState(false);
  return (
    <div className="w-full min-w-0 lg:w-auto lg:shrink-0">
      <button
        type="button"
        onClick={() => setHint(true)}
        className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-full bg-teal-700 px-5 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 lg:w-auto lg:min-w-[12rem]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 21s-7-6.3-7-11a7 7 0 1114 0c0 4.7-7 11-7 11z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
        내 주변 간호사 채용 찾기
      </button>
      <span role="status" className={`block max-w-[18rem] text-sm text-slate-500 ${hint ? "mt-2" : ""}`}>
        {hint ? "내 주변 검색은 준비 중입니다. 우선 지역을 선택해 찾아보세요." : ""}
      </span>
    </div>
  );
}
