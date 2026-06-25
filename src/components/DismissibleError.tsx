"use client";

import { useState } from "react";

export default function DismissibleError({ message }: Readonly<{ message: string }>) {
  const [show, setShow] = useState(true);
  if (!show) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="mt-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={() => setShow(false)}
        aria-label="알림 닫기"
        className="-my-1 flex h-11 w-11 shrink-0 items-center justify-center rounded leading-none hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
      >
        ✕
      </button>
    </div>
  );
}
