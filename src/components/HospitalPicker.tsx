"use client";

import { useRef, useState } from "react";

type Hosp = { id: string; name: string; region: string | null; address: string | null };

export default function HospitalPicker() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Hosp[]>([]);
  const [selected, setSelected] = useState<Hosp | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function onChange(v: string) {
    setQ(v);
    setSelected(null);
    clearTimeout(timer.current);
    if (v.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/hospitals/search?q=${encodeURIComponent(v.trim())}`);
        setResults(r.ok ? await r.json() : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
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
