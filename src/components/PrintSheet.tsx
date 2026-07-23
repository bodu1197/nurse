import type { ReactNode } from "react";
import Link from "next/link";
import PrintButton from "@/components/PrintButton";

// 인쇄 화면의 공통 껍데기 — 본인 이력서와 병원이 받은 이력서가 같은 틀을 쓴다.
// print: 접두사가 붙은 클래스는 인쇄할 때 테두리·그림자·안내문을 걷어낸다.
export default function PrintSheet({
  backHref,
  backLabel,
  children,
}: Readonly<{ backHref: string; backLabel: string; children: ReactNode }>) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={backHref} className="rounded text-sm text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2">← {backLabel}</Link>
        <PrintButton />
      </div>
      <div className="mt-4 rounded-2xl border border-slate-200 shadow-sm print:mt-0 print:rounded-none print:border-0 print:shadow-none">
        {children}
      </div>
      <p className="mt-3 text-xs text-slate-500 print:hidden">인쇄 대화상자에서 대상을 &quot;PDF로 저장&quot;으로 바꾸면 파일로 받을 수 있습니다.</p>
    </main>
  );
}
