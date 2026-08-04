"use client";

import { type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass, type Variant, type Size } from "@/components/Button";

// 되돌릴 수 없는 form 제출(삭제 등)에 confirm 1차 방어.
// name/value: 한 form 안에서 어느 버튼을 눌렀는지 구분해야 할 때(제출값) 사용.
// 제출 중에는 비활성화 — 되돌릴 수 없는 작업이라 더블탭 한 번이 곧 중복 실행이다.
export default function ConfirmSubmit({
  message, children, name, value, size = "sm", variant = "danger", className,
}: Readonly<{ message: string; children: ReactNode; name?: string; value?: string | number; size?: Size; variant?: Variant; className?: string }>) {
  // 라벨은 그대로 두고 비활성화만 한다 — 한 form에 버튼이 여러 개면(광고 2/3/4주) 전부 "처리 중…"으로 바뀌어
  // 무엇을 눌렀는지 알 수 없고 버튼 폭까지 흔들린다. 흐려진 비활성 상태로 진행 중임은 충분히 보인다.
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={buttonClass(variant, size, className)}
      // 🔴 브라우저 입력 검증을 **먼저** 통과시킨 뒤에 묻는다. 순서가 반대면 필수 칸을 비운 채로
      //    "정말 하시겠습니까" 가 먼저 뜨고, 확인을 누르면 그제야 "입력하세요" 가 뜬다.
      onClick={(e) => {
        if (e.currentTarget.form?.checkValidity() === false) return; // 브라우저가 안내를 띄운다
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
