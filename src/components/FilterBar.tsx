"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { EMPLOYMENT_TYPES, DATE_FILTERS } from "@/lib/constants";

// 진료과는 상단 칩 nav(page.tsx)로 승격됨 — 여기선 근무형태·게시일만(dolpagu FilterBar 와 동일 역할).
const selectClass =
  "h-11 rounded-full border border-slate-300 bg-white px-4 text-sm text-slate-700 outline-none hover:border-teal-400 focus-visible:ring-2 focus-visible:ring-teal-600";

export default function FilterBar() {
  const router = useRouter();
  const sp = useSearchParams();

  function set(key: string, value: string) {
    const p = new URLSearchParams(sp.toString());
    if (value) p.set(key, value);
    else p.delete(key);
    p.delete("page"); // 필터 변경 시 1페이지로
    const s = p.toString();
    router.push("/jobs" + (s ? `?${s}` : ""));
  }

  return (
    <div className="flex flex-wrap gap-2">
      <select aria-label="근무형태" className={selectClass} value={sp.get("et") ?? ""} onChange={(e) => set("et", e.target.value)}>
        <option value="">근무형태 전체</option>
        {EMPLOYMENT_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select aria-label="게시일" className={selectClass} value={sp.get("days") ?? ""} onChange={(e) => set("days", e.target.value)}>
        <option value="">게시일 전체</option>
        {DATE_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
