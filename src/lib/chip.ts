// 필터 칩 스타일 — /jobs·/talent 가 공유(진료과·근무형태·경력 칩이 같은 모양이어야 UI 가 갈리지 않는다).
export const chipClass = (active: boolean) =>
  `inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 ${
    active
      ? "border-teal-600 bg-teal-600 text-white shadow-sm"
      : "border-slate-200 bg-white text-slate-700 hover:border-teal-400 hover:text-teal-700"
  }`;
