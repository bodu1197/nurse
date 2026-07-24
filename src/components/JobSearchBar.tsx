"use client";

// 채용 검색바 — dolpagu(talent) JobSearchBar 이식. 지역 RegionPicker(도>시군구, 건수) + 키워드 + 검색.
// 소유자 확정 배치(dolpagu 동일): 내 주변(pill 밖) → 지역 → 키워드 → 검색. pill = rounded-[20px]·shadow-md.
// 지역은 서버가 준 정규화 계단(건수 포함) — 클라 문자열 파싱 없음.
import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/Button";
import RegionPicker from "@/components/RegionPicker";
import type { JobRegionNode } from "@/lib/data/jobs";

export default function JobSearchBar({
  sidos,
  sigungus,
}: Readonly<{ sidos: JobRegionNode[]; sigungus: JobRegionNode[] }>) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [pending, startTransition] = useTransition();
  const sido = sp.get("sido") ?? "";
  // 시군구는 시도에 종속(시도 없이 시군구만 있으면 무시) — 서버 필터와 같은 계약.
  const sigungu = sido ? (sp.get("sigungu") ?? "") : "";

  // "무엇"(키워드)과 "어디"(지역)를 함께 실어 이동 — 지금 걸린 다른 필터(spec/et/days)는 유지한다.
  function go(keyword: string, nextSido: string, nextSigungu: string) {
    const p = new URLSearchParams(sp.toString());
    p.delete("page"); // 조건이 바뀌었으니 1페이지부터
    const kw = keyword.trim();
    if (kw) p.set("q", kw);
    else p.delete("q");
    if (nextSido) p.set("sido", nextSido);
    else p.delete("sido");
    if (nextSigungu) p.set("sigungu", nextSigungu);
    else p.delete("sigungu");
    const s = p.toString();
    startTransition(() => router.push("/jobs" + (s ? `?${s}` : "")));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    go(q, sido, sigungu);
  }

  return (
    <form
      onSubmit={submit}
      role="search"
      className="flex w-full flex-col gap-1 rounded-[20px] border border-slate-300 bg-white p-1.5 shadow-md transition hover:border-teal-500 focus-within:border-teal-500 focus-within:shadow-lg lg:min-w-0 lg:flex-1 lg:flex-row lg:items-center lg:pl-2"
    >
      {/* 지역 선택 — 고르면 즉시 조회. 타이핑 중인 키워드는 함께 실어 유실 방지. */}
      <RegionPicker
        steps={[
          { key: "sido", label: "도·광역시", value: sido, options: sidos },
          { key: "sigungu", label: "시·군·구", value: sigungu, options: sigungus },
        ]}
        loading={pending}
        onPick={(level, value) => {
          // 시도를 바꾸면 하위 시군구는 무효 → 함께 비운다(캐스케이드).
          if (level === "sido") go(q, value, "");
          else go(q, sido, value);
        }}
      />

      {/* 구분선: 좁은 화면 가로선 / ≥lg 세로선. */}
      <span className="mx-2 h-px shrink-0 bg-slate-200 lg:mx-0 lg:h-7 lg:w-px" aria-hidden="true" />

      {/* 키워드(+모바일 검색). */}
      <div className="flex items-center gap-2 lg:flex-1">
        <label className="flex min-w-0 flex-1 items-center gap-2 px-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-teal-600" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="search"
            name="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="직무·병원 검색어"
            placeholder="직무, 키워드 및 병원"
            className="w-full bg-transparent py-2.5 text-base outline-none placeholder:text-slate-500"
          />
        </label>
        <Button type="submit" size="lg" className="shrink-0 lg:hidden" disabled={pending}>검색</Button>
      </div>

      <Button type="submit" size="lg" className="shrink-0 max-lg:hidden" disabled={pending}>검색</Button>
    </form>
  );
}
