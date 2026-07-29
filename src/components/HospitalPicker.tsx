"use client";

import { useRef, useState } from "react";

type Hosp = { id: string; name: string; region: string | null; address: string | null };

export default function HospitalPicker({ initial }: { initial?: Hosp | null }) {
  const [q, setQ] = useState(initial?.name ?? "");
  const [results, setResults] = useState<Hosp[]>([]);
  const [selected, setSelected] = useState<Hosp | null>(initial ?? null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seq = useRef(0); // 요청 순번 — 느린 이전 응답이 최신 결과를 덮어쓰지 않게

  function onChange(v: string) {
    setQ(v);
    setSelected(null);
    clearTimeout(timer.current);
    if (v.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    // 요청 순번 가드 — 먼저 보낸 느린 응답이 나중에 도착해 최신 결과를 덮어쓰면,
    // 방금 지운 검색어의 병원이 목록에 남아 **엉뚱한 병원을 고를 수 있다**.
    // 같은 API 를 쓰는 HospitalSearchBox 는 이미 이 가드를 가지고 있다.
    const mine = ++seq.current;
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/hospitals/search?q=${encodeURIComponent(v.trim())}`);
        const data = r.ok ? await r.json() : [];
        if (mine === seq.current) setResults(data);
      } catch {
        if (mine === seq.current) setResults([]);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 250);
  }

  function pick(h: Hosp) {
    setSelected(h);
    setResults([]);
    setQ(h.name);
  }

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        placeholder="병원명을 검색하세요 (2자 이상)"
        aria-label="병원 검색"
        className="h-12 w-full rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40"
      />
      <input type="hidden" name="hospital_id" value={selected?.id ?? ""} />

      {loading && !selected && <p className="mt-1 text-xs text-slate-400">검색 중…</p>}

      {results.length > 0 && !selected && (
        <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {results.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => pick(h)}
                className="block w-full px-4 py-2.5 text-left hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
              >
                <span className="font-medium text-slate-800">{h.name}</span>
                {h.region && <span className="ml-2 text-xs text-slate-400">{h.region}</span>}
                {h.address && <span className="block text-xs text-slate-400">{h.address}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="mt-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm">
          <span className="font-semibold text-teal-800">{selected.name}</span>
          {selected.address && <span className="block text-xs text-teal-700">{selected.address}</span>}
          <button type="button" aria-label="병원 선택 취소" onClick={() => { setSelected(null); setQ(""); }} className="mt-1 text-xs text-teal-700 underline">
            다시 선택
          </button>
        </div>
      )}
    </div>
  );
}
