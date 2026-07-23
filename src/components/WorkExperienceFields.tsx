"use client";

import { useState } from "react";
import { INPUT_CLASS } from "@/lib/constants";
import { HOSPITAL_TYPES, BED_RANGES, POSITIONS, SHIFT_TYPES } from "@/lib/resumeOptions";
import type { WorkExperience } from "@/lib/data/resume";

// 경력 상세 — 줄을 늘렸다 줄였다 해야 해서 이 부분만 클라이언트 컴포넌트다.
// "경력 5년"이라는 숫자 하나로는 어느 병원 어느 부서에서 무엇을 했는지 알 수 없어
// 병원이 채용 판단을 못 한다. 총 경력은 여기 입력에서 자동 계산한다.

const label = "text-xs font-medium text-slate-600";
const cell = "flex flex-col gap-1";

type Row = Partial<WorkExperience> & { key: number };

export default function WorkExperienceFields({ initial }: Readonly<{ initial: readonly WorkExperience[] }>) {
  const [rows, setRows] = useState<Row[]>(
    initial.length > 0 ? initial.map((w, i) => ({ ...w, key: i })) : [{ key: 0 }],
  );

  const add = () => setRows((r) => [...r, { key: Math.max(0, ...r.map((x) => x.key)) + 1 }]);
  const remove = (key: number) => setRows((r) => (r.length === 1 ? r : r.filter((x) => x.key !== key)));

  return (
    <div className="flex flex-col gap-4">
      {rows.map((w, i) => (
        <fieldset key={w.key} className="rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-700">경력 {i + 1}</legend>

          {/* 이름(name)은 줄 순서를 세는 기준이라 모든 줄에 반드시 있어야 한다 */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className={cell}>
              <label htmlFor={`w_hospital_name_${i}`} className={label}>병원명</label>
              <input id={`w_hospital_name_${i}`} name="w_hospital_name" defaultValue={w.hospital_name ?? ""}
                placeholder="예: ○○대학교병원" className={INPUT_CLASS} />
            </div>
            <div className={cell}>
              <label htmlFor={`w_department_${i}`} className={label}>근무 부서</label>
              <input id={`w_department_${i}`} name={`w_department_${i}`} defaultValue={w.department ?? ""}
                placeholder="예: 내과중환자실(MICU)" className={INPUT_CLASS} />
            </div>
            <div className={cell}>
              <label htmlFor={`w_hospital_type_${i}`} className={label}>의료기관 종별</label>
              <select id={`w_hospital_type_${i}`} name={`w_hospital_type_${i}`} defaultValue={w.hospital_type ?? ""} className={INPUT_CLASS}>
                <option value="">선택 안 함</option>
                {HOSPITAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className={cell}>
              {/* 실제 공고 우대사항이 "250병상 이상 종합병원 5년 이상" 식이라 규모가 필요하다 */}
              <label htmlFor={`w_bed_range_${i}`} className={label}>병상 수</label>
              <select id={`w_bed_range_${i}`} name={`w_bed_range_${i}`} defaultValue={w.bed_range ?? ""} className={INPUT_CLASS}>
                <option value="">선택 안 함</option>
                {BED_RANGES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className={cell}>
              <label htmlFor={`w_start_ym_${i}`} className={label}>입사 연월</label>
              <input id={`w_start_ym_${i}`} name={`w_start_ym_${i}`} type="month" defaultValue={w.start_ym ?? ""} className={INPUT_CLASS} />
            </div>
            <div className={cell}>
              <label htmlFor={`w_end_ym_${i}`} className={label}>퇴사 연월 <span className="text-slate-500">(재직중이면 비움)</span></label>
              <input id={`w_end_ym_${i}`} name={`w_end_ym_${i}`} type="month" defaultValue={w.end_ym ?? ""} className={INPUT_CLASS} />
            </div>
            <div className={cell}>
              <label htmlFor={`w_shift_type_${i}`} className={label}>근무형태</label>
              <select id={`w_shift_type_${i}`} name={`w_shift_type_${i}`} defaultValue={w.shift_type ?? ""} className={INPUT_CLASS}>
                <option value="">선택 안 함</option>
                {SHIFT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className={cell}>
              <label htmlFor={`w_position_${i}`} className={label}>직위</label>
              <select id={`w_position_${i}`} name={`w_position_${i}`} defaultValue={w.position ?? ""} className={INPUT_CLASS}>
                <option value="">선택 안 함</option>
                {POSITIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-1">
            <label htmlFor={`w_duties_${i}`} className={label}>담당 업무 <span className="text-slate-500">(선택)</span></label>
            <textarea id={`w_duties_${i}`} name={`w_duties_${i}`} rows={2} defaultValue={w.duties ?? ""}
              placeholder="예: 인공호흡기 환자 관리, CRRT, 신규 프리셉터"
              className="rounded-xl border border-slate-300 p-3 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40" />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name={`w_is_current_${i}`} defaultChecked={w.is_current ?? false}
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus-visible:ring-2 focus-visible:ring-teal-600" />
              현재 재직중
            </label>
            <button type="button" onClick={() => remove(w.key)} disabled={rows.length === 1}
              className="min-h-11 rounded-[12px] px-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
              이 경력 삭제
            </button>
          </div>
        </fieldset>
      ))}

      <button type="button" onClick={add}
        className="min-h-11 rounded-[12px] border border-dashed border-slate-300 px-4 text-sm font-semibold text-teal-700 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
        + 경력 추가
      </button>
    </div>
  );
}
