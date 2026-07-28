"use client";

// 인재정보 지역(희망 근무지) 선택 바 — /jobs 검색바와 같은 pill + RegionPicker 디자인.
// 시도 > 시군구 2단. 이력서는 희망지역을 여러 개 적을 수 있어(desired_location 이 "서울 종로구, 경기 성남시")
// jobs 처럼 정규화 컬럼을 둘 수 없다 → 목록은 고정 표(koreaRegions)를 쓰고 매칭은 부분일치로 한다.
import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import RegionPicker from "@/components/RegionPicker";
import { SIDO_LIST, SIDO_SIGUNGU } from "@/lib/koreaRegions";

const SIDO_OPTIONS = SIDO_LIST.map((name) => ({ name })); // 건수 없음 — 이름만

export default function TalentRegionBar({
  sido,
  sigungu,
}: Readonly<{ sido: string; sigungu: string }>) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const sigunguOptions = (SIDO_SIGUNGU[sido] ?? []).map((name) => ({ name }));

  return (
    <div className="flex w-full items-center rounded-[20px] border border-slate-300 bg-white p-1.5 shadow-md transition hover:border-teal-500 focus-within:border-teal-500 focus-within:shadow-lg sm:max-w-md">
      <RegionPicker
        steps={[
          { key: "sido", label: "도·광역시", value: sido, options: SIDO_OPTIONS },
          { key: "sigungu", label: "시·군·구", value: sigungu, options: sigunguOptions },
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
