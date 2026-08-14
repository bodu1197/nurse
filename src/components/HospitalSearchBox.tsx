"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useHospitalSearch, emptyMessage, type Hosp } from "./useHospitalSearch";

// 병원 실시간 검색 → 고르면 그 병원 리뷰 화면(/reviews?hospital=id)으로 이동.
// 부르는 규칙(디바운스·중단·지연안내)은 광고 등록의 HospitalPicker 와 **같은 훅**을 쓴다.

export default function HospitalSearchBox({ initialName = "" }: Readonly<{ initialName?: string }>) {
  const router = useRouter();
  const [q, setQ] = useState(initialName);
  const [open, setOpen] = useState(false);
  const { results, loading, slow, reason, search } = useHospitalSearch();
  const boxRef = useRef<HTMLDivElement>(null);

  // 바깥을 클릭하면 드롭다운을 닫는다.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function onChange(v: string) {
    setQ(v);
    setOpen(v.trim().length >= 2); // 타이핑하면 자동으로 병원이 필터링돼 뜬다(광고 등록과 동일).
    search(v);
  }

  function pick(h: Hosp) {
    setOpen(false);
    setQ(h.name);
    router.push(`/reviews?hospital=${h.id}`);
  }

  return (
    <div className="relative" ref={boxRef}>
      <label htmlFor="hospital-search" className="sr-only">병원 검색</label>
      <input
        id="hospital-search"
        value={q}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        autoComplete="off"
        placeholder="병원 이름을 입력하세요 (2자 이상)"
        className="h-12 w-full rounded-xl border border-slate-300 px-4 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40"
      />
      {/* 🔴 aria-live 가 있어야 화면을 못 보는 사용자도 결과가 바뀐 것을 안다 — 여긴 최대 12초 침묵한다. */}
      {loading && (
        <p className="mt-1 text-xs text-slate-400" role="status" aria-live="polite">
          {slow ? "명부에 없는 병원이라 심사평가원에서 찾는 중… (10초 정도 걸립니다)" : "검색 중…"}
        </p>
      )}

      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {results.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => pick(h)}
                className="block w-full px-4 py-2.5 text-left hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
              >
                <span className="font-medium text-slate-800">{h.name}</span>
                {h.region && <span className="ml-2 text-xs text-slate-500">{h.region}</span>}
                {h.address && <span className="block text-xs text-slate-500">{h.address}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* 🔴 "없습니다" 라고 **단정하지 않는다.** 못 찾아본 것을 없다고 하면 실재하는 병원을
          없다고 말하는 셈이다 — 비로그인이면 애초에 원천에 안 물어봤고, 조회 상한에 걸렸으면
          지금은 못 물어본 것이다. 서버가 헤더로 알려준 사유대로 말한다. */}
      {open && !loading && q.trim().length >= 2 && results.length === 0 && (
        <p className="mt-1 text-xs text-slate-500" role="status" aria-live="polite">
          {reason === "skipped-anonymous" ? (
            <>
              등록된 병원 중에는 없습니다.{" "}
              <Link href="/login" className="font-medium text-teal-700 underline">로그인</Link>
              하시면 새로 문을 연 병원까지 찾아 드립니다.
            </>
          ) : (
            emptyMessage(reason)
          )}
        </p>
      )}
    </div>
  );
}
