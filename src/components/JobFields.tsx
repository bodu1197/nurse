// 공고 입력 필드 — 등록/수정/복제 폼이 공유(일관성 + 유지보수).
export type JobDefaults = {
  title?: string | null;
  specialty?: string | null;
  employment_type?: string | null;
  location?: string | null;
  salary_text?: string | null;
  benefits?: string[] | null;
  description?: string | null;
  deadline?: string | null;
  recruit_count?: number | null;
  shift_type?: string | null;
  manager_name?: string | null;
  manager_phone?: string | null;
};

const field = "h-12 w-full rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40";
const label = "text-sm font-medium text-slate-700";
const TYPES = ["정규직", "계약직", "파트타임", "인턴"];
const SHIFTS = ["협의", "3교대", "2교대", "낮번 전담", "야간 전담", "평일 주간"];

export default function JobFields({ d = {} }: { d?: JobDefaults }) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor="title" className={label}>공고 제목 <span className="text-red-500">*</span></label>
        <input id="title" name="title" required defaultValue={d.title ?? ""} placeholder="예: 중환자실(ICU) 간호사 모집" className={field} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="specialty" className={label}>진료과/부서</label>
          <input id="specialty" name="specialty" defaultValue={d.specialty ?? ""} placeholder="예: 중환자실" className={field} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="employment_type" className={label}>고용형태</label>
          <select id="employment_type" name="employment_type" className={field} defaultValue={d.employment_type ?? "정규직"}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="location" className={label}>근무지</label>
          <input id="location" name="location" defaultValue={d.location ?? ""} placeholder="비우면 병원 지역으로 표시" className={field} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="salary_text" className={label}>급여</label>
          <input id="salary_text" name="salary_text" defaultValue={d.salary_text ?? ""} placeholder="예: 연 4,000~5,000만원 / 협의" className={field} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="shift_type" className={label}>교대형태</label>
          <select id="shift_type" name="shift_type" className={field} defaultValue={d.shift_type ?? "협의"}>
            {SHIFTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="recruit_count" className={label}>모집인원</label>
          <input id="recruit_count" name="recruit_count" type="number" min="1" defaultValue={d.recruit_count ?? ""} placeholder="명 (비우면 0명)" className={field} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="deadline" className={label}>마감일 <span className="text-slate-400">(비우면 상시)</span></label>
          <input id="deadline" name="deadline" type="date" defaultValue={d.deadline ?? ""} className={field} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="benefits" className={label}>복리후생 <span className="text-slate-400">(쉼표로 구분)</span></label>
        <input id="benefits" name="benefits" defaultValue={(d.benefits ?? []).join(", ")} placeholder="예: 기숙사, 4대보험, 교육비 지원" className={field} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="manager_name" className={label}>채용담당자</label>
          <input id="manager_name" name="manager_name" defaultValue={d.manager_name ?? ""} placeholder="예: 간호부 김OO 팀장" className={field} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="manager_phone" className={label}>담당자 연락처 <span className="text-slate-400">(지원자에게 공개)</span></label>
          <input id="manager_phone" name="manager_phone" inputMode="tel" defaultValue={d.manager_phone ?? ""} placeholder="예: 02-1234-5678" className={field} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="description" className={label}>상세 내용</label>
        <textarea id="description" name="description" rows={6} defaultValue={d.description ?? ""} placeholder="담당 업무, 자격요건, 근무조건 등을 적어주세요." className="rounded-xl border border-slate-300 p-3 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40" />
      </div>
    </>
  );
}
