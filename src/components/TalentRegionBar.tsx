"use client";

// 인재정보 지역(희망 근무지) 선택 바 — /jobs 검색바와 같은 pill + RegionPicker 디자인.
// 시도 > 시군구 2단. 목록은 **인재가 실제로 있는 지역만** 서버가 건수와 함께 내려준다
// (nurse_talent_sido_list / nurse_talent_sigungu_list). 고정 표를 뿌리면 0명인 구를 눌러도
// 빈 화면만 나와 사용자가 헛걸음한다(오너 확정 2026-07-28).
//
// 시군구 목록은 선택한 시도에 따라 달라지므로 서버가 다시 그린다 → 왕복 동안 RegionPicker 에
// loading 을 넘겨 **이전 시도의 구 목록이 새 시도의 것인 양 노출되지 않게** 한다.
import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import RegionPicker from "@/components/RegionPicker";
import type { TalentRegionNode } from "@/lib/data/talent";

export default function TalentRegionBar({
  sido,
  sigungu,
  sidos,
  sigungus,
}: Readonly<{ sido: string; sigungu: string; sidos: TalentRegionNode[]; sigungus: TalentRegionNode[] }>) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex w-full items-center rounded-[20px] border border-slate-300 bg-white p-1.5 shadow-md transition hover:border-teal-500 focus-within:border-teal-500 focus-within:shadow-lg sm:max-w-md">
      <RegionPicker
        steps={[
          { key: "sido", label: "도·광역시", value: sido, options: sidos },
          { key: "sigungu", label: "시·군·구", value: sigungu, options: sigungus },
        ]}
        emptyLabel="희망 근무지 전체"
        loading={pending}
        onPick={(level, value) => {
          const p = new URLSearchParams(sp.toString());
          p.delete("page"); // 조건이 바뀌었으니 1페이지부터
          if (level === "sido") {
            // 시도를 바꾸면 이전 시군구는 다른 도의 것이라 반드시 버린다(엉뚱한 지역 조합 방지).
            p.delete("sigungu");
            if (value) p.set("sido", value);
            else p.delete("sido");
          } else if (value) {
            p.set("sigungu", value);
          } else {
            p.delete("sigungu");
          }
          const s = p.toString();
          startTransition(() => router.push("/talent" + (s ? `?${s}` : "")));
        }}
      />
    </div>
  );
}
