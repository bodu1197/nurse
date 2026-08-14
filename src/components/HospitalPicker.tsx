"use client";

import { useEffect, useState } from "react";
import { useHospitalSearch, type Hosp } from "./useHospitalSearch";

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
  // 부르는 규칙(디바운스·요청순번·중단·지연안내)은 리뷰 검색의 HospitalSearchBox 와 **같은 훅**을 쓴다.
  const { results, loading, slow, search, clear } = useHospitalSearch();

  function onChange(v: string) {
    setQ(v);
    setSelected(null);
    search(v);
  }

  function pick(h: Hosp) {
    setSelected(h);
    setQ(h.name);
    clear(); // 목록을 닫고, 돌아오는 중인 응답도 무시한다
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

      {/* 🔴 aria-live 가 있어야 화면을 못 보는 사용자도 결과가 바뀐 것을 안다 — 여긴 최대 12초 침묵한다. */}
      {loading && !selected && (
        <p className="mt-1 text-xs text-slate-400" role="status" aria-live="polite">
          {slow ? "명부에 없는 병원이라 심사평가원에서 찾는 중… (10초 정도 걸립니다)" : "검색 중…"}
        </p>
      )}

      {/* 🔴 빈 결과 안내가 없어서, 검색이 끝났는지 아직 찾는 중인지 알 수 없었다.
          같은 API 를 쓰는 HospitalSearchBox 와 빈 상태 처리를 맞춘다. */}
      {!loading && !selected && q.trim().length >= 2 && results.length === 0 && (
        <p className="mt-1 text-xs text-slate-500" role="status" aria-live="polite">
          일치하는 병원이 없습니다. 사업자등록증의 상호와 같은지 확인해 보세요.
        </p>
      )}

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
