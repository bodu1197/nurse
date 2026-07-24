"use client";

// 인재정보 지역(희망 근무지) 선택 바 — /jobs 검색바와 같은 pill + RegionPicker 디자인.
// talent 은 정규화 sido/sigungu 가 없고 desired_location(REGIONS 평면 목록) ilike 매칭이라 1단 평면 픽커.
import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import RegionPicker from "@/components/RegionPicker";
import { REGIONS } from "@/lib/resumeOptions";

const OPTIONS = REGIONS.map((r) => ({ name: r })); // 건수 없음 — 이름만

export default function TalentRegionBar({ loc }: Readonly<{ loc: string }>) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex w-full items-center rounded-[20px] border border-slate-300 bg-white p-1.5 shadow-md transition hover:border-teal-500 focus-within:border-teal-500 focus-within:shadow-lg sm:max-w-md">
      <RegionPicker
        steps={[{ key: "loc", label: "희망 근무지", value: loc, options: OPTIONS }]}
        emptyLabel="희망 근무지 전체"
        loading={pending}
        onPick={(_level, value) => {
          const p = new URLSearchParams(sp.toString());
          p.delete("page"); // 조건이 바뀌었으니 1페이지부터
          if (value) p.set("loc", value);
          else p.delete("loc");
          const s = p.toString();
          startTransition(() => router.push("/talent" + (s ? `?${s}` : "")));
        }}
      />
    </div>
  );
}
