"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// 병원 실시간 검색 → 고르면 그 병원 리뷰 화면(/reviews?hospital=id)으로 이동.
// 병원 광고 등록의 HospitalPicker와 같은 방식(/api/hospitals/search, 250ms 디바운스).
type Hosp = { id: string; name: string; region: string | null; address: string | null };

export default function HospitalSearchBox({ initialName = "" }: Readonly<{ initialName?: string }>) {
  const router = useRouter();
  const [q, setQ] = useState(initialName);
  const [results, setResults] = useState<Hosp[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const boxRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0); // 요청 순번 — 느린 이전 응답이 최신 결과를 덮어쓰지 않게

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
    clearTimeout(timer.current);
    if (v.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    setOpen(true);
    // 타이핑하면 자동으로 병원이 필터링돼 뜬다(광고 등록과 동일).
    const mine = ++seq.current;
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/hospitals/search?q=${encodeURIComponent(v.trim())}`);
        const data = r.ok ? await r.json() : [];
        if (mine === seq.current) setResults(data); // 최신 요청의 응답만 반영
      } catch {
        if (mine === seq.current) setResults([]);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 250);
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
      {loading && <p className="mt-1 text-xs text-slate-400">검색 중…</p>}

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
      {open && !loading && q.trim().length >= 2 && results.length === 0 && (
        <p className="mt-1 text-xs text-slate-500">일치하는 병원이 없습니다.</p>
      )}
    </div>
  );
}
