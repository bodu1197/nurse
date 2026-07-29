"use client";

// 📍 내 주변 간호사 채용 찾기 — dolpagu(talent) NearMeControl 과 같은 CTA 모양.
// ⚠️ GPS 반경검색은 추후(소유자 확정 2026-07-24: "버튼은 만들어, 기능만 보류"). jobs 레코드에 좌표가
//    없어 지금은 반경검색이 불가하므로, 클릭 시 안내만 띄우고 지역 드롭다운으로 유도한다.
//    좌표 파이프라인이 생기면 이 컴포넌트만 talent NearMeControl 로 교체하면 된다.
//
// 🔴 2026-07-30: 누르면 안내문만 뜨는 버튼이 화면에서 **가장 강조된 요소**(꽉 찬 teal)였다.
//    처음 온 사람이 제일 먼저 누르고 아무 일도 안 일어나는 자리다. 버튼은 유지하되(오너 결정),
//    (1) 누르면 실제로 지역 선택 팝업을 열어 주고, (2) 강조를 낮춰(outline) 검색창에 자리를 내준다.
//    RegionPicker 의 트리거는 aria-haspopup="dialog" 로 표시돼 있어 그걸로 찾는다.
import { useState } from "react";

export default function JobNearMeButton() {
  const [hint, setHint] = useState(false);

  function openRegion() {
    const trigger = document.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]');
    if (trigger) {
      trigger.click();
      return;
    }
    setHint(true); // 팝업을 못 찾은 경우에만 안내로 갈음한다
  }

  return (
    <div className="w-full min-w-0 lg:w-auto lg:shrink-0">
      <button
        type="button"
        onClick={openRegion}
        className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-full border border-teal-700 bg-white px-5 text-sm font-semibold text-teal-700 transition hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 lg:w-auto lg:min-w-[12rem]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 21s-7-6.3-7-11a7 7 0 1114 0c0 4.7-7 11-7 11z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
        지역으로 채용 찾기
      </button>
      <span role="status" className={`block max-w-[18rem] text-sm text-slate-500 ${hint ? "mt-2" : ""}`}>
        {hint ? "오른쪽 지역 칸에서 시·도와 시·군·구를 선택해 주세요." : ""}
      </span>
    </div>
  );
}
