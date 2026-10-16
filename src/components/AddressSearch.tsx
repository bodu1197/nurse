"use client";

import { useId, useRef, useState } from "react";
import { canonicalSido } from "@/lib/jobRegion";

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

/**
 * 시·도를 알아볼 수 있는 주소인가 — **서버(lib/jobRegion regionOfLocation)와 같은 함수**로 첫 토큰을 본다.
 * 🔴 예전에는 앞글자만 보는 정규식이라 "서울시 종로구"가 경고 없이 통과했는데, 서버는 그 첫 토큰을 시도로 못 알아봐
 *    지역 필터에서 조용히 빠졌다(직접 등록은 아예 거절된다). 기준이 둘이면 반드시 어긋난다(검증 지적 2026-10-16).
 */
const knownSido = (v: string) => canonicalSido(v.trim().split(/\s+/)[0]) !== null;

export default function AddressSearch({
  name,
  defaultValue,
  label = "근무지",
  placeholder = "주소 검색으로 채우세요 (비우면 병원 지역으로 표시)",
  unknownHint = "시·도로 시작하는 주소가 아니라 지역 검색(지역 필터·내 주변)에 노출되지 않습니다. 「주소 검색」으로 채우시길 권합니다.",
}: Readonly<{
  name: string;
  defaultValue?: string | null;
  /** 칸 이름 — 공고는 '근무지', 사업자 인증 화면의 기관 직접 등록은 '기관 주소'. */
  label?: string;
  placeholder?: string;
  /** 시·도를 못 알아본 주소일 때의 경고 — 공고는 '노출 안 됨', 기관 직접 등록은 '등록 안 됨'(실제 결과가 다르다). */
  unknownHint?: string;
}>) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  // 🔴 **비제어**로 둔다. 임시저장 복구(FormDraft)가 `node.value = …` 로 DOM 에 직접 써넣기 때문에,
  //    제어 컴포넌트로 만들면 근무지 칸만 복구가 안 먹는다. 값은 폼이 갖고 React 는 안내문만 갖는다.
  const [unknown, setUnknown] = useState((defaultValue ?? "").trim().length > 0 && !knownSido(defaultValue ?? ""));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const check = (v: string) => setUnknown(v.trim().length > 0 && !knownSido(v));

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
      <label htmlFor={id} className="text-base font-medium text-slate-700">{label}</label>
      <div className="flex gap-2">
        <input
          ref={ref}
          id={id}
          name={name}
          defaultValue={defaultValue ?? ""}
          onInput={(e) => check(e.currentTarget.value)}
          placeholder={placeholder}
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
            : unknownHint}
        </p>
      )}
    </div>
  );
}
