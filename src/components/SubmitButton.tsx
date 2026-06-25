"use client";

import { useFormStatus } from "react-dom";
import { buttonClass } from "@/components/Button";

export default function SubmitButton({
  children,
  pendingText = "처리 중…",
}: Readonly<{ children: React.ReactNode; pendingText?: string }>) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass("primary", "lg")}>
      {pending ? pendingText : children}
    </button>
  );
}
