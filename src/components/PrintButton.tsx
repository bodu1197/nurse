"use client";

import { buttonClass } from "@/components/Button";

// 인쇄 대화상자를 연다. 여기서 "PDF로 저장"을 고르면 그대로 PDF 파일이 된다.
// 서버에서 PDF를 만들려면 한글 폰트를 통째로 넣어야 해서(수 MB) 지금은 브라우저 인쇄를 쓴다.
export default function PrintButton({ children = "인쇄 / PDF 저장" }: Readonly<{ children?: React.ReactNode }>) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("primary", "md")}>
      {children}
    </button>
  );
}
