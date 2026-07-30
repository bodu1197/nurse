"use client";

// 📍 내 주변 간호사 채용 찾기 — GPS 반경검색.
//
// ⚠️ 아직 동작하지 않는다. **도메인 연결 후 실제로 켠다**(오너 확정 2026-07-30).
//    지금 막혀 있는 것은 좌표다 — jobs 에는 위경도가 없고 sido/sigungu 만 있다.
//    붙이는 방법: 브라우저 위치 → 역지오코딩(좌표 → 행정구역) → 그 시군구로 검색.
//    지도 API 키 하나면 되고 스키마 변경도, 18만 건 백필도 필요 없다.
//
// 🔴 2026-07-30 한때 이 버튼을 "지역으로 채용 찾기"로 바꿔 검색창의 지역 팝업을 열게 했다가 되돌렸다.
//    지역 선택이 화면에 두 개가 되어 같은 일을 하는 버튼이 나란히 놓였다(오너 지적).
//    지역 선택은 검색창(JobSearchBar 의 RegionPicker) **한 곳**이다. 이 버튼은 '내 주변' 전용이다.
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
        {/* 눌러보기 전에 준비 중임을 알린다 — 누르고 나서야 아는 것과 다르다.
            기능이 켜지면 이 배지만 지우면 된다. */}
        <span className="rounded-full bg-teal-900/40 px-1.5 py-0.5 text-[10px] font-bold">준비 중</span>
      </button>
      <span role="status" className={`block max-w-[18rem] text-sm text-slate-500 ${hint ? "mt-2" : ""}`}>
        {hint ? "내 주변 검색은 준비 중입니다. 우선 오른쪽에서 지역을 선택해 찾아보세요." : ""}
      </span>
    </div>
  );
}
