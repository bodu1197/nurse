import ApplyMethodFields from "@/components/ApplyMethodFields";
import AddressSearch from "@/components/AddressSearch";
import { JOB_DEPARTMENTS, FACILITY_TYPES, JOB_CATEGORIES } from "@/lib/jobTaxonomy";

// 공고 입력 필드 — 등록/수정/복제 폼이 공유(일관성 + 유지보수).
export type JobDefaults = {
  title?: string | null;
  specialty?: string | null;
  facility_type?: string | null;
  job_category?: string | null;
  employment_type?: string | null;
  location?: string | null;
  salary_text?: string | null;
  benefits?: string[] | null;
  description?: string | null;
  recruit_count?: number | null;
  shift_type?: string | null;
  deadline?: string | null;
  manager_name?: string | null;
  manager_phone?: string | null;
  apply_methods?: string[] | null;
  apply_email?: string | null;
  apply_detail?: string | null;
};

const field = "h-12 w-full rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40";
const label = "text-base font-medium text-slate-700";
const TYPES = ["정규직", "계약직", "파트타임", "인턴"];
const SHIFTS = ["협의", "3교대", "2교대", "낮번 전담", "야간 전담", "평일 주간"];

// minDeadline: 오늘 날짜(YYYY-MM-DD). 렌더 중에 Date.now() 를 부르면 순수함이 깨진다 → 페이지가 넘긴다.
export default function JobFields({ d = {}, minDeadline }: { d?: JobDefaults; minDeadline: string }) {
  // 자유 입력이면 표기가 제각각이라 검색 필터에서 통째로 빠진다 → 목록에서 선택.
  // 기존 공고에 목록 밖 값이 있으면 그 값도 옵션으로 남긴다(수정할 때 조용히 지워지지 않게).
  const withCurrent = (list: readonly string[], cur: string | null | undefined) =>
    cur && !list.includes(cur) ? [cur, ...list] : list;
  const specialties = withCurrent(JOB_DEPARTMENTS, d.specialty);
  const facilities = withCurrent(FACILITY_TYPES, d.facility_type);
  const categories = withCurrent(JOB_CATEGORIES, d.job_category);

  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor="title" className={label}>공고 제목 <span className="text-red-500">*</span></label>
        <input id="title" name="title" required defaultValue={d.title ?? ""} placeholder="예: 중환자실(ICU) 간호사 모집" className={field} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="specialty" className={label}>진료과/부서 <span className="text-slate-400">(검색 필터에 사용)</span></label>
          <select id="specialty" name="specialty" defaultValue={d.specialty ?? ""} className={field}>
            <option value="">선택 안 함</option>
            {specialties.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {/* 기관 종별·직종은 검색 필터의 독립 축이다. 워크넷 공고는 API 가 코드로 주지만
            직접 등록 공고는 여기서 받는 수밖에 없다 — 안 받으면 그 광고만 필터에서 빠진다. */}
        <div className="flex flex-col gap-1">
          <label htmlFor="facility_type" className={label}>기관 종별 <span className="text-slate-400">(검색 필터에 사용)</span></label>
          <select id="facility_type" name="facility_type" defaultValue={d.facility_type ?? ""} className={field}>
            <option value="">선택 안 함</option>
            {facilities.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="job_category" className={label}>직종 <span className="text-slate-400">(검색 필터에 사용)</span></label>
          <select id="job_category" name="job_category" defaultValue={d.job_category ?? ""} className={field}>
            <option value="">선택 안 함</option>
            {categories.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="employment_type" className={label}>고용형태</label>
          <select id="employment_type" name="employment_type" className={field} defaultValue={d.employment_type ?? "정규직"}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {/* 🔴 자유 텍스트였다. "서울"·"본원 3층" 처럼 적으면 시군구가 안 잡혀 지역 필터에서
            조용히 빠지고, 유료 광고가 지역 검색에 안 뜬다 → 주소 검색으로 바꿨다(막지는 않는다). */}
        <AddressSearch name="location" defaultValue={d.location} />
        <div className="flex flex-col gap-1">
          <label htmlFor="salary_text" className={label}>급여</label>
          <input id="salary_text" name="salary_text" defaultValue={d.salary_text ?? ""} placeholder="예: 연 4,000~5,000만원 / 협의" className={field} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>
      {/* 🔴 마감일 입력이 없었다. jobs.deadline 컬럼도 있고 목록·상세·사이트맵이 전부 '마감일 지난
          공고 제외'를 거는데, 병원이 그 날짜를 알려줄 칸이 폼에 없어 직접 등록 공고는 항상 '상시'였다
          (수집한 워크넷 공고에는 마감일이 있어, 같은 목록에서 두 종류가 다른 규칙으로 사라졌다).
          native date 입력이라 달력·검증이 공짜다. */}
      <div className="flex flex-col gap-1 sm:max-w-[16rem]">
        <label htmlFor="deadline" className={label}>마감일 <span className="text-slate-400">(비우면 상시모집)</span></label>
        <input id="deadline" name="deadline" type="date" min={minDeadline} defaultValue={d.deadline ?? ""} className={field} />
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
      <ApplyMethodFields methods={d.apply_methods ?? ["platform"]} email={d.apply_email ?? ""} detail={d.apply_detail ?? ""} />
      <div className="flex flex-col gap-1">
        <label htmlFor="description" className={label}>상세 내용</label>
        <textarea id="description" name="description" rows={6} defaultValue={d.description ?? ""} placeholder="담당 업무, 자격요건, 근무조건 등을 적어주세요." className="rounded-xl border border-slate-300 p-3 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40" />
      </div>
    </>
  );
}
