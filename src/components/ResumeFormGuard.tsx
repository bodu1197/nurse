"use client";

import { useEffect, useRef } from "react";

/**
 * 이력서 폼의 "하나 이상 선택" 항목을 **제출 전에** 브라우저에서 막는다.
 *
 * 🔴 왜: saveResume 은 검증에 걸리면 전부 `redirect(...?error=)` 로 끝낸다. 서버 액션이라
 *    입력값은 어디에도 보존되지 않아, 30개 항목을 다 채운 사람이 맨 아래 체크박스 하나 때문에
 *    **처음부터 다시** 쓰게 된다. 여기서 먼저 막으면 화면을 떠나지 않으므로 입력이 그대로 남는다.
 *    (서버 검증은 그대로 둔다 — 이건 편의지 방어가 아니다.)
 *
 * 🔴 왜 native `required` 가 아닌가: 체크박스 그룹에는 "하나 이상"을 뜻하는 HTML 속성이 없다.
 *    checkbox 에 required 를 달면 **전부** 체크하라는 뜻이 된다.
 *
 * 폼 안에 놓기만 하면 된다(props 없음) — 가장 가까운 form 을 스스로 찾는다.
 */
export default function ResumeFormGuard({
  groups,
}: Readonly<{ groups: ReadonlyArray<{ name: string; message: string }> }>) {
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;

    function onSubmit(e: SubmitEvent) {
      for (const g of groups) {
        const checked = form!.querySelectorAll(`input[name="${g.name}"]:checked`).length;
        if (checked > 0) continue;
        e.preventDefault();
        alert(g.message);
        // 첫 항목으로 데려간다 — 긴 폼에서 "어디가 문제인지" 스스로 찾게 두면 결국 이탈한다.
        const first = form!.querySelector<HTMLElement>(`input[name="${g.name}"]`);
        first?.scrollIntoView({ block: "center" });
        first?.focus();
        return;
      }
    }

    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [groups]);

  return <span ref={anchor} hidden />;
}
