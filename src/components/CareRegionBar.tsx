"use client";

// /care-jobs 지역 선택 — JobSearchBar(채용공고)의 지역 부분만 떼어 온 것(키워드 없음).
// 고르면 즉시 이동하고 페이지는 1로 돌아간다. 시도를 바꾸면 하위 시군구는 무효 → 함께 비운다(캐스케이드).
import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import RegionPicker from "@/components/RegionPicker";
import type { JobRegionNode } from "@/lib/data/jobs";

export default function CareRegionBar({
  sidos,
  sigungus,
}: Readonly<{ sidos: JobRegionNode[]; sigungus: JobRegionNode[] }>) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const sido = sp.get("sido") ?? "";
  // 시군구는 시도에 종속(시도 없이 시군구만 있으면 무시) — 서버 필터(getCareJobs)와 같은 계약.
  const sigungu = sido ? (sp.get("sigungu") ?? "") : "";
  // 📍 내 주변(GPS)과 지역 선택은 "어디"를 정하는 상호배타 수단(JobSearchBar 와 같은 규칙) — 내 주변이 켜져
  //    있으면 지역 선택기를 감춘다. 해제(JobNearMeButton)하면 다시 나온다. go() 도 lat/lng 를 싣지 않는다.
  const nearActive = !!(sp.get("lat") && sp.get("lng"));

  function go(nextSido: string, nextSigungu: string) {
    const p = new URLSearchParams();
    if (nextSido) p.set("sido", nextSido);
    if (nextSido && nextSigungu) p.set("sigungu", nextSigungu);
    const s = p.toString();
    startTransition(() => router.push("/care-jobs" + (s ? `?${s}` : "")));
  }

  if (nearActive) return null;
  return (
    <div className="inline-flex rounded-[20px] border border-slate-300 bg-white p-1.5 shadow-md transition hover:border-teal-500 focus-within:border-teal-500">
      <RegionPicker
        steps={[
          { key: "sido", label: "도·광역시", value: sido, options: sidos },
          { key: "sigungu", label: "시·군·구", value: sigungu, options: sigungus },
        ]}
        loading={pending}
        onPick={(level, value) => (level === "sido" ? go(value, "") : go(sido, value))}
      />
    </div>
  );
}
