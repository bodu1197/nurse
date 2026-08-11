"use client";

import { useId, useRef, useState } from "react";

/**
 * 근무지 주소 입력 — **다음(카카오) 우편번호 검색**으로 고른다.
 *
 * 왜 만들었나(오너 지시 2026-08-12): 종전에는 자유 텍스트 한 칸이었다. 담당자가 "서울" 이나
 * "본원 3층" 이라고 쓰면 그대로 저장되고, 지역 정규화(lib/jobRegion)가 시군구를 못 뽑아
 * **지역 필터에서 조용히 빠진다.** 광고는 유료라 "돈 낸 공고가 지역 검색에 안 뜬다" 가 된다.
 *
 * 🔴 입력을 막지는 않는다. 검색으로 채우는 것이 기본이지만 직접 고칠 수 있어야 한다 —
 *    분원·별관처럼 검색 결과에 없는 근무지가 실제로 있고, 유료 등록 흐름을 막으면 안 된다.
 *    대신 시·도를 못 알아본 상태면 **저장 전에 경고를 보여 준다**(아래 hint).
 */
declare global {
  interface Window {
    daum?: { Postcode: new (opts: { oncomplete: (d: DaumResult) => void; onclose?: () => void }) => { open: () => void } };
  }
}

type DaumResult = {
  /** 도로명 주소(없으면 지번). 예: "경기 수원시 팔달구 중부대로 93" */
  roadAddress?: string;
  jibunAddress?: string;
  /** 참고항목(건물명 등) */
  buildingName?: string;
};

const SCRIPT_SRC = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

/** 스크립트는 **누를 때 한 번만** 불러온다. 공고 폼을 여는 것만으로 외부 스크립트를 받게 하지 않는다. */
function loadPostcode(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.daum?.Postcode) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("load failed")), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("load failed"));
    document.head.appendChild(s);
  });
}

/** 시·도를 알아볼 수 있는 주소인가 — lib/jobRegion 이 첫 토큰으로 시도를 잡는 것과 같은 기준. */
const SIDO_HEAD = /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/;

export default function AddressSearch({ name, defaultValue }: Readonly<{ name: string; defaultValue?: string | null }>) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  // 🔴 **비제어**로 둔다. 임시저장 복구(FormDraft)가 `node.value = …` 로 DOM 에 직접 써넣기 때문에,
  //    제어 컴포넌트로 만들면 근무지 칸만 복구가 안 먹는다. 값은 폼이 갖고 React 는 안내문만 갖는다.
  const [unknown, setUnknown] = useState(
    (defaultValue ?? "").trim().length > 0 && !SIDO_HEAD.test((defaultValue ?? "").trim()),
  );
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const check = (v: string) => setUnknown(v.trim().length > 0 && !SIDO_HEAD.test(v.trim()));

  const open = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await loadPostcode();
      new window.daum!.Postcode({
        oncomplete: (d) => {
          const base = d.roadAddress || d.jibunAddress || "";
          const next = d.buildingName ? `${base} (${d.buildingName})` : base;
          if (ref.current) ref.current.value = next;
          check(next);
          // 검색 뒤 상세주소(층·관)를 바로 이어 적을 수 있게 커서를 준다.
          requestAnimationFrame(() => ref.current?.focus());
        },
      }).open();
    } catch {
      // 🔴 스크립트를 못 받아도 **직접 입력은 계속 된다**. 유료 등록 흐름을 외부 스크립트에 걸지 않는다.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-base font-medium text-slate-700">근무지</label>
      <div className="flex gap-2">
        <input
          ref={ref}
          id={id}
          name={name}
          defaultValue={defaultValue ?? ""}
          onInput={(e) => check(e.currentTarget.value)}
          placeholder="주소 검색으로 채우세요 (비우면 병원 지역으로 표시)"
          aria-describedby={unknown || failed ? `${id}-hint` : undefined}
          aria-invalid={unknown || undefined}
          className="h-12 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40"
        />
        <button
          type="button"
          onClick={open}
          disabled={busy}
          className="h-12 shrink-0 rounded-xl border border-slate-300 bg-white px-4 text-base font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-60"
        >
          {busy ? "여는 중" : "주소 검색"}
        </button>
      </div>
      {/* 🔴 막지 않고 **알려 준다.** 지역 검색에 안 걸리는 것을 모른 채 돈을 내는 것이 최악이다. */}
      {(unknown || failed) && (
        <p id={`${id}-hint`} className="text-sm text-amber-700">
          {failed
            ? "주소 검색을 열지 못했습니다 — 주소를 직접 입력해도 됩니다."
            : "시·도로 시작하는 주소가 아니라 지역 검색(지역 필터·내 주변)에 노출되지 않습니다. 「주소 검색」으로 채우시길 권합니다."}
        </p>
      )}
    </div>
  );
}
