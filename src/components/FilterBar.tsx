"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { JOB_SPECIALTIES, EMPLOYMENT_TYPES, DATE_FILTERS } from "@/lib/constants";

const selectClass =
  "rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-sm text-slate-700 outline-none hover:border-slate-400 focus-visible:ring-2 focus-visible:ring-teal-600";

export default function FilterBar() {
  const router = useRouter();
  const sp = useSearchParams();

  function set(key: string, value: string) {
    const p = new URLSearchParams(sp.toString());
    if (value) p.set(key, value);
    else p.delete(key);
    p.delete("j"); // 선택 공고 초기화
    const s = p.toString();
    router.push("/jobs" + (s ? `?${s}` : ""));
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <select aria-label="진료과" className={selectClass} value={sp.get("spec") ?? ""} onChange={(e) => set("spec", e.target.value)}>
        <option value="">진료과 전체</option>
        {JOB_SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
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
