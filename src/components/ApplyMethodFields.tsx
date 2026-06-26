"use client";

import { useState } from "react";

// 지원 방법 복수 선택 + 선택한 방법의 입력란만 펼침(미선택 입력란 숨김 → 담당자 압박 최소화).
// 이메일/주소 기본값은 props로 자동 주입(직전 공고·병원 주소) → 담당자는 필요 시 수정만.
const METHODS: [string, string][] = [
  ["platform", "간편지원 (이 사이트에서 바로 접수)"],
  ["email", "이메일 지원"],
  ["offline", "우편·방문·전화 접수"],
];

const field = "h-12 w-full rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40";

export default function ApplyMethodFields({ methods, email, detail }: Readonly<{ methods: string[]; email: string; detail: string }>) {
  const [sel, setSel] = useState<string[]>(methods.length ? methods : ["platform"]);
  const toggle = (m: string) => setSel((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));

  return (
    <fieldset className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <legend className="px-1 text-sm font-medium text-slate-700">지원 방법 <span className="text-slate-400">(복수 선택 가능)</span></legend>
      <div className="flex flex-col gap-2">
        {METHODS.map(([v, label]) => (
          <label key={v} className="flex items-center gap-3 rounded-xl border border-slate-300 bg-white p-3 has-[:checked]:border-teal-500 has-[:checked]:bg-teal-50">
            <input type="checkbox" name="apply_methods" value={v} checked={sel.includes(v)} onChange={() => toggle(v)} className="h-4 w-4 accent-teal-600" />
            <span className="text-sm text-slate-700">{label}</span>
          </label>
        ))}
      </div>

      {sel.includes("email") && (
        <div className="mt-3 flex flex-col gap-1">
          <label htmlFor="apply_email" className="text-sm font-medium text-slate-700">지원 이메일 <span className="text-slate-400">(자동입력 — 다르면 수정)</span></label>
          <input id="apply_email" name="apply_email" type="email" defaultValue={email} placeholder="예: hr@hospital.co.kr" className={field} />
        </div>
      )}
      {sel.includes("offline") && (
        <div className="mt-3 flex flex-col gap-1">
          <label htmlFor="apply_detail" className="text-sm font-medium text-slate-700">접수 안내 <span className="text-slate-400">(병원 주소 자동입력 — 다르면 수정)</span></label>
          <textarea id="apply_detail" name="apply_detail" rows={3} defaultValue={detail} placeholder="예: 이력서를 본원 간호부로 우편 접수 / 방문 접수 / 전화 문의 후 제출" className="rounded-xl border border-slate-300 p-3 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40" />
        </div>
      )}
      <p className="mt-2 text-xs text-slate-400">간편지원=이 사이트에서 접수(받은 지원자에서 확인). 이메일·우편은 지원자가 직접 보냄. 연락처·이메일은 로그인한 지원자에게만 보입니다.</p>
    </fieldset>
  );
}
