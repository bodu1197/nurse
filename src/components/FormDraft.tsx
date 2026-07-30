"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 폼 임시저장 — 쓰다가 중단해도 다음에 그 자리에서 이어 쓴다.
 *
 * 🔴 왜 필요한가(오너 지시 2026-07-30): 이력서는 항목이 30개가 넘고 공고 등록도 15개다.
 *    전화가 오거나 탭을 닫거나 서버 검증에 걸리면 **입력이 통째로 사라져** 처음부터 다시 써야 했다.
 *    이력서 작성률이 떨어지는 가장 큰 원인이다.
 *
 * 어떻게: 이 브라우저(localStorage)에만 저장한다. 서버·DB를 건드리지 않으므로 마이그레이션도,
 * 자동저장 요청도 없다. 대신 **다른 기기에서는 안 보인다** — 화면에도 그렇게 적는다.
 *
 * 🔴 개인정보: 이력서에는 이름·연락처가 들어간다. 그래서
 *    · 저장 키에 계정 식별자를 넣어 같은 PC의 다른 계정이 못 읽게 하고,
 *    · 보관 기간을 두고(TTL) 지난 것은 버리고,
 *    · 화면에 '이 브라우저에 저장됨'과 **지우기 버튼**을 항상 같이 둔다.
 *
 * 🔴 제출했다고 바로 지우지 않는다. 서버 검증에 걸려 되돌아오는 경우가 바로 이 기능이 필요한
 *    순간이기 때문이다. 제출 표시만 남겼다가, 다음에 열었을 때 주소에 error 가 없으면
 *    (= 저장에 성공한 것으로 보고) 그때 지운다.
 */

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SAVE_DEBOUNCE_MS = 700;
/** checkbox·radio 의 name/value 를 한 문자열로 묶을 때 쓰는 구분자(입력값에 나올 수 없는 문자) */
const SEP = "";

type Draft = {
  at: number;
  submitted?: boolean;
  /** 동적으로 늘어나는 줄(경력 상세) 개수 */
  rows?: number;
  fields: Array<[string, string]>;
  checks: string[];
};

/** 임시저장 대상에서 빼는 입력 — 파일은 담을 수 없고, 비밀번호·hidden 은 담아선 안 된다. */
const SKIP_TYPES = new Set(["file", "password", "hidden", "submit", "button", "image", "reset"]);

function collect(form: HTMLFormElement, rowName?: string): Draft {
  const fields: Array<[string, string]> = [];
  const checks: string[] = [];
  for (const el of form.elements) {
    const node = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (!node.name) continue;
    const type = (node as HTMLInputElement).type ?? "";
    if (SKIP_TYPES.has(type)) continue;
    if (type === "checkbox" || type === "radio") {
      if ((node as HTMLInputElement).checked) checks.push(node.name + SEP + node.value);
    } else {
      fields.push([node.name, node.value]);
    }
  }
  const rows = rowName ? form.querySelectorAll(`[name="${rowName}"]`).length : undefined;
  return { at: Date.now(), rows, fields, checks };
}

function apply(form: HTMLFormElement, draft: Draft) {
  const checked = new Set(draft.checks);
  // 같은 name 이 여러 개인 항목(경력 줄의 w_hospital_name)은 순서대로 짝지어 채운다.
  const seen = new Map<string, number>();
  for (const [name, value] of draft.fields) {
    const i = seen.get(name) ?? 0;
    seen.set(name, i + 1);
    const list = form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${CSS.escape(name)}"]`);
    const node = list[i];
    if (node) node.value = value;
  }
  for (const node of form.querySelectorAll<HTMLInputElement>('input[type="checkbox"], input[type="radio"]')) {
    if (!node.name) continue;
    // 🔴 잠긴 칸은 건드리지 않는다. 예: 무료 공고 라디오는 이미 무료 공고가 있으면 disabled 인데,
    //    초안이 그걸 다시 체크하면 화면은 선택된 것처럼 보이지만 disabled 라 값이 제출되지 않는다
    //    → 서버가 다시 "무료는 1건" 이라며 되돌려 보내는 무한 반복이 된다.
    if (node.disabled) continue;
    node.checked = checked.has(node.name + SEP + node.value);
  }
  // 접혀 있는 아코디언(희망 근무지) 안에서 복원된 선택은 보이지 않는다 → 그 칸만 펼친다.
  for (const d of form.querySelectorAll("details")) {
    if (d.querySelector("input:checked")) d.open = true;
  }
}

export default function FormDraft({
  storageKey,
  rowName,
  addRowLabel,
  ownErrors = [],
  errorParam = "error",
  note,
}: Readonly<{
  /** 계정별로 갈라야 한다 — 같은 PC 의 다른 사람이 내 이력서를 보면 안 된다. */
  storageKey: string;
  /** 줄이 늘어나는 폼에서 줄 수를 세는 input name (예: 경력의 "w_hospital_name") */
  rowName?: string;
  /** 줄을 늘리는 버튼의 글자 (예: "+ 경력 추가") — 복원 시 줄 수를 맞추는 데 쓴다 */
  addRowLabel?: string;
  /** 이 폼의 서버 검증 오류 코드들. 다른 폼의 오류로 초안을 되살리지 않기 위해 쓴다. */
  ownErrors?: readonly string[];
  /** 실패 코드가 실려 오는 쿼리 이름. 지원 폼은 ?apply= 를 쓴다(기본은 ?error=). */
  errorParam?: string;
  /** 복원 배너에 덧붙일 한 줄 (예: "병원은 다시 선택해 주세요.") */
  note?: string;
}>) {
  const ownErrorsKey = ownErrors.join(",");
  const anchor = useRef<HTMLDivElement>(null);
  const [restored, setRestored] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = (): Draft | null => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return null;
        const d = JSON.parse(raw) as Draft;
        if (!d?.at || Date.now() - d.at > TTL_MS) {
          localStorage.removeItem(storageKey);
          return null;
        }
        return d;
      } catch {
        return null;
      }
    };

    (async () => {
      const draft = read();
      if (!draft) return;

      const params = new URLSearchParams(location.search);
      // 저장에 성공했다는 신호가 있으면 초안은 역할이 끝났다 — 개인정보를 하루라도 더 두지 않는다.
      if (params.has("ok")) {
        localStorage.removeItem(storageKey);
        return;
      }
      // 🔴 error 가 **이 폼의 것**일 때만 초안을 살린다. 같은 화면에 사진 업로드·공개 스위치 폼이
      //    함께 있어(?error=photo_size, ?error=visibility …) 아무 error 나 인정하면, 이미 저장에
      //    성공해 버려야 할 초안이 최신 이력서 위에 되살아난다.
      const err = params.get(errorParam);
      const own = ownErrorsKey ? ownErrorsKey.split(",") : [];
      const mine = !!err && (own.length === 0 || own.includes(err));
      if (draft.submitted && !mine) {
        localStorage.removeItem(storageKey);
        return;
      }

      // 경력처럼 줄이 늘어나는 폼은 먼저 줄 수를 맞춘다(값을 담을 칸이 있어야 한다).
      if (rowName && addRowLabel && draft.rows) {
        const addBtn = [...form.querySelectorAll("button")].find((b) => b.textContent?.trim() === addRowLabel);
        let have = form.querySelectorAll(`[name="${rowName}"]`).length;
        // 상한 20 — 서버(saveResume)가 받는 줄 수와 같다. 손상된 draft 로 무한 클릭하지 않게.
        while (addBtn && have < draft.rows && have < 20) {
          addBtn.click();
          have += 1;
        }
        // React 가 늘어난 줄을 실제로 그릴 때까지 한 프레임 기다린다.
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }

      apply(form, draft);

      // 🔴 화면에 그려진 줄이 draft 보다 **많은** 경우 — 저장된 이력서에 경력이 3줄 있는데
      //    사용자가 2줄을 지운 상태로 중단했다면, 남은 두 줄에 DB 값이 그대로 남아 되살아난다.
      //    지운 것은 지워진 채로 돌아와야 하므로 초과분을 비운다(병원명·입사연월이 비면
      //    서버가 그 줄을 버린다 — saveResume 의 filter 와 같은 규칙).
      if (rowName && draft.rows != null) {
        const names = form.querySelectorAll<HTMLInputElement>(`[name="${rowName}"]`);
        for (let i = draft.rows; i < names.length; i += 1) {
          names[i].value = "";
          const start = form.querySelector<HTMLInputElement>(`[name="w_start_ym_${i}"]`);
          if (start) start.value = "";
        }
      }
      // 🔴 되살렸으면 '제출함' 표시를 뗀다. 안 그러면 다음에 이 화면으로 돌아왔을 때(예: 지원 폼에서
      //    이력서를 채우러 갔다가 next 로 복귀 — 그 주소에는 실패 코드가 없다) '저장 성공한 초안' 으로
      //    읽혀 삭제된다. 정작 이 기능이 필요한 경로에서만 내용을 잃게 된다.
      if (draft.submitted) {
        try {
          localStorage.setItem(storageKey, JSON.stringify({ ...draft, submitted: false }));
        } catch { /* 저장 실패는 부가 기능이라 넘어간다 */ }
      }
      setRestored(true);
      setSavedAt(draft.at);
    })();

    function save() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          const d = collect(form!, rowName);
          localStorage.setItem(storageKey, JSON.stringify(d));
          setSavedAt(d.at);
        } catch {
          // 용량 초과·시크릿 모드 등 — 임시저장은 부가 기능이라 조용히 넘어간다.
        }
      }, SAVE_DEBOUNCE_MS);
    }

    function onSubmit() {
      clearTimeout(timer);
      try {
        // 값은 남기고 '제출함' 표시만 얹는다 — 서버 검증에 걸려 되돌아오면 이걸로 복원한다.
        localStorage.setItem(storageKey, JSON.stringify({ ...collect(form!, rowName), submitted: true }));
      } catch {
        /* 위와 같음 */
      }
    }

    form.addEventListener("input", save);
    form.addEventListener("change", save);
    form.addEventListener("submit", onSubmit);
    return () => {
      clearTimeout(timer);
      form.removeEventListener("input", save);
      form.removeEventListener("change", save);
      form.removeEventListener("submit", onSubmit);
    };
    // ownErrors 는 인라인 배열로 넘어와 렌더마다 새 참조다 → 내용으로 비교해야 효과가 반복 실행되지 않는다.
  }, [storageKey, rowName, addRowLabel, ownErrorsKey, errorParam]);

  function discard() {
    localStorage.removeItem(storageKey);
    location.reload();
  }

  return (
    <div ref={anchor}>
      {restored ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>
            <b className="font-semibold">쓰던 내용을 불러왔습니다.</b> 이어서 작성하시고 저장을 눌러 주세요.
            {note && <b className="ml-1 font-semibold">{note}</b>}
          </span>
          <button type="button" onClick={discard} className="min-h-11 shrink-0 rounded-[12px] px-3 font-semibold text-amber-900 underline underline-offset-2 hover:bg-amber-100">
            지우고 새로 시작
          </button>
        </div>
      ) : savedAt ? (
        <p role="status" className="text-xs text-slate-500">
          작성 중인 내용을 이 브라우저에 임시 보관했습니다. 저장을 누르기 전까지는 병원에 보이지 않습니다.{" "}
          <button type="button" onClick={discard} className="underline underline-offset-2 hover:text-slate-700">
            임시 보관 지우기
          </button>
        </p>
      ) : null}
    </div>
  );
}

/** 초안 키 접두사 — 로그아웃·탈퇴 때 한 번에 지우기 위해 한 곳에서 만든다. */
export const DRAFT_PREFIX = "nursenet:draft:";
