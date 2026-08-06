"use client";

import { useEffect, useRef, useState } from "react";

type Hosp = { id: string; name: string; region: string | null; address: string | null };

export default function HospitalPicker({
  initial,
  draftKey,
}: {
  initial?: Hosp | null;
  /**
   * 있으면 고른 병원을 이 브라우저에 임시 보관했다가 다음에 되살린다.
   * 🔴 병원은 hidden 값(hospital_id)이라 FormDraft 가 담지 못한다 — 초안을 복원해도 병원 칸만
   *    비어 있어서 그대로 제출하면 "병원과 공고 제목은 필수입니다"가 뜨는데, 제목은 분명히
   *    채워져 있어 원인을 찾을 수 없었다. 선택 상태를 아는 이 컴포넌트가 자기 몫만 직접 챙긴다.
   */
  draftKey?: string;
}) {
  const [q, setQ] = useState(initial?.name ?? "");
  const [results, setResults] = useState<Hosp[]>([]);
  const [selected, setSelected] = useState<Hosp | null>(initial ?? null);

  // 복원: 서버가 준 initial 이 없을 때만(저장된 연결이 있으면 그쪽이 우선이다).
  //
  // 🔴 마운트 후 setState 를 부른다 — 규칙이 경고하는 "연쇄 렌더"가 맞지만, 여기서는 그것이 유일한
  //    올바른 방법이다. localStorage 는 서버에 없으므로 초기값으로 읽으면 서버가 그린 HTML 과
  //    클라이언트가 그린 것이 달라져 하이드레이션이 깨진다. 렌더는 마운트 시 딱 한 번 더 돈다.
  useEffect(() => {
    if (!draftKey || initial) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const h = JSON.parse(raw) as Hosp;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 위 주석 참고(하이드레이션 안전을 위해 마운트 후 1회)
      if (h?.id && h?.name) { setSelected(h); setQ(h.name); }
    } catch { /* 시크릿 모드 등 — 복원은 부가 기능이라 조용히 넘어간다 */ }
  }, [draftKey, initial]);

  // 보관: 고를 때마다 갱신, 지울 때는 함께 비운다.
  useEffect(() => {
    if (!draftKey) return;
    try {
      if (selected) localStorage.setItem(draftKey, JSON.stringify(selected));
      else localStorage.removeItem(draftKey);
    } catch { /* 위와 같음 */ }
  }, [draftKey, selected]);
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
        <div className="mt-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-base">
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
