"use client";

import { type ReactNode } from "react";
import { buttonClass } from "@/components/Button";

// 되돌릴 수 없는 form 제출(삭제 등)에 confirm 1차 방어.
export default function ConfirmSubmit({ message, children }: Readonly<{ message: string; children: ReactNode }>) {
  return (
    <button
      type="submit"
      className={buttonClass("danger", "sm")}
      onClick={(e) => { if (!confirm(message)) e.preventDefault(); }}
    >
      {children}
    </button>
  );
}
