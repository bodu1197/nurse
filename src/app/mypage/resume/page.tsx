import Link from "next/link";
import NurseShell from "@/components/NurseShell";
import SubmitButton from "@/components/SubmitButton";
import Button, { buttonClass } from "@/components/Button";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import WorkExperienceFields from "@/components/WorkExperienceFields";
import MatchAxisNotice from "@/components/MatchAxisNotice";
import { requireProfile } from "@/lib/data/user";
import { getMyResume, completeness, type ResumeWithWork } from "@/lib/data/resume";
import { INPUT_CLASS, LINK_CLASS, messageFor } from "@/lib/constants";
import {
  SHIFT_TYPES, CERTIFICATIONS, APN_FIELDS, LICENSE_TYPES, EDUCATION_LEVELS, GRADUATION_STATUS,
  CAREER_LEVELS, HOSPITAL_TYPES, AVAILABLE_FROM, EMPLOYMENT_TYPES, DEPARTMENTS, JOB_CATEGORIES,
  RESUME_PUBLIC_SCOPE, RESUME_INTRO_MIN, RESUME_INTRO_MAX,
} from "@/lib/resumeOptions";
import { SIDO_LIST, SIDO_SIGUNGU } from "@/lib/koreaRegions";
import { safeNext } from "@/lib/url";
import { saveResume, deleteResume, setResumePublic, saveResumePhoto, deleteResumePhoto } from "../actions";
import { getMyAvatarUrl } from "@/lib/data/avatar";
import IdPhoto from "@/components/IdPhoto";
import PhotoPicker from "@/components/PhotoPicker";
import ResumeFormGuard from "@/components/ResumeFormGuard";
import FormDraft from "@/components/FormDraft";

export const metadata = { title: "내 이력서 — 널스넷", robots: { index: false } };

const label = "text-sm font-medium text-slate-700";
const req = <><span className="text-red-500" aria-hidden>*</span><span className="sr-only">(필수)</span></>;

const SAVE_ERRORS: Record<string, string> = {

  save: "저장에 실패했습니다. 다시 시도해 주세요.",
  visibility: "공개 설정을 바꾸지 못했습니다. 다시 시도해 주세요.",
  photo: "사진을 저장하지 못했습니다. 다시 시도해 주세요.",
  photo_delete: "사진을 삭제하지 못했습니다. 다시 시도해 주세요.",
  photo_empty: "사진 파일을 선택해 주세요.",
  photo_size: "사진은 2MB 이하만 올릴 수 있습니다.",
  photo_type: "사진은 JPG · PNG · WEBP 만 올릴 수 있습니다.",
  delete: "삭제에 실패했습니다. 다시 시도해 주세요.",
  shift: "가능한 근무형태를 하나 이상 선택해 주세요.",
  region: "희망 근무지를 하나 이상 선택해 주세요.",
  work: "경력을 추가하셨다면 병원명과 입사 연월을 모두 채워주세요.",
  work_required: "경력을 선택하셨다면 경력을 1건 이상 입력해 주세요.",
  work_lost: "이력서는 저장됐지만 경력 저장에 실패했습니다. 경력을 다시 확인해 저장해 주세요.",
  title: "이력서 제목을 입력해 주세요.",
  intro: `자기소개를 ${RESUME_INTRO_MIN}자 이상 적어주세요.`,
};

function Section({ title, hint, children }: Readonly<{ title: string; hint?: string; children: React.ReactNode }>) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="font-bold text-slate-900">{title}</h3>
      {hint && <p className="mt-1 text-xs text-slate-600">{hint}</p>}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** 체크박스 여러 개 — 자유 입력이면 표기가 갈려 검색이 안 잡힌다 */
function CheckGroup({ name, options, checked }: Readonly<{ name: string; options: readonly string[]; checked: readonly string[] }>) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {options.map((o) => (
        <label key={o} className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name={name} value={o} defaultChecked={checked.includes(o)}
            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus-visible:ring-2 focus-visible:ring-teal-600" />
          {o}
        </label>
      ))}
    </div>
  );
}

/**
 * 예 / 아니오 / 해당 없음 — 체크박스 하나로는 "아니오"와 "아직 답 안 함"이 구분되지 않는다.
 * 그대로 두면 필수 6개만 채운 사람의 인쇄 서식에 면허신고·차지·나이트가 전부 "아니오"로 단정 출력된다.
 */
function YesNo({ name, text, value }: Readonly<{ name: string; text: string; value: boolean | null }>) {
  const current = value === null ? "" : value ? "yes" : "no";
  return (
    <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <legend className="text-sm text-slate-700">{text}</legend>
      {[["yes", "예"], ["no", "아니오"], ["", "해당 없음"]].map(([v, t]) => (
        <label key={v} className="flex min-h-11 items-center gap-1.5 text-sm text-slate-700">
          <input type="radio" name={name} value={v} defaultChecked={current === v}
            className="h-4 w-4 border-slate-300 text-teal-600 focus-visible:ring-2 focus-visible:ring-teal-600" />
          {t}
        </label>
      ))}
    </fieldset>
  );
}

function Select({ id, defaultValue, options, placeholder = "선택 안 함" }: Readonly<{ id: string; defaultValue: string | null; options: readonly string[]; placeholder?: string }>) {
  return (
    <select id={id} name={id} defaultValue={defaultValue ?? ""} className={INPUT_CLASS}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

/**
 * 희망 근무지 — 전국 시·군·구까지 고른다. 값은 "부산 수영구"(시군구) 또는 "부산"(그 도 전체) 형태로,
 * 인재 검색 필터(desired_location 부분일치)와 정확히 같은 표기를 쓴다. 표기가 어긋나면 검색에 안 잡힌다.
 *
 * 시도 17개만 고를 수 있던 것을 바꾼 이유: 이관한 이력서 8천 건은 구까지 적혀 있는데
 * 앞으로 쓰는 이력서는 구가 없어, 병원이 "부산 수영구"로 좁히면 새 간호사들이 통째로 사라진다.
 *
 * ponytail: 팝업(RegionPicker) 대신 native `<details>` 아코디언을 쓴다. 이 폼의 다른 항목이 전부
 * 체크박스 묶음이라 같은 조작법이고, 자바스크립트 없이 서버 컴포넌트로 끝난다(다중 선택도 공짜).
 */
function DesiredLocationField({ saved }: Readonly<{ saved: readonly string[] }>) {
  const savedSet = new Set(saved);
  const known = new Set(
    SIDO_LIST.flatMap((sd) => [sd, ...SIDO_SIGUNGU[sd].map((s) => `${sd} ${s}`)]),
  );
  // 표에 없는 예전 값(레거시의 "경기 북부출장소" 등 6종)도 체크된 채로 남긴다.
  // 안 그리면 다른 항목만 고치고 저장하는 순간 이 사람의 희망지역이 조용히 사라진다.
  const leftovers = saved.filter((v) => !known.has(v));

  const box = "h-4 w-4 rounded border-slate-300 text-teal-600 focus-visible:ring-2 focus-visible:ring-teal-600";
  const item = "flex min-h-11 items-center gap-2 text-sm text-slate-700";

  return (
    <div className="mt-1 flex flex-col gap-1">
      {leftovers.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <span className="flex min-h-11 items-center text-xs font-medium text-amber-800">이전에 고른 지역</span>
          {leftovers.map((v) => (
            <label key={v} className={item}>
              <input type="checkbox" name="desired_location" value={v} defaultChecked className={box} />
              {v}
            </label>
          ))}
        </div>
      )}
      {SIDO_LIST.map((sido) => {
        const values = [sido, ...SIDO_SIGUNGU[sido].map((s) => `${sido} ${s}`)];
        const picked = values.filter((v) => savedSet.has(v)).length;
        return (
          // open — 이미 고른 게 있는 도는 펼쳐둔다. 접혀 있으면 저장된 선택이 안 보여 "안 골랐나?" 싶어진다.
          <details key={sido} open={picked > 0} className="group rounded-lg border border-slate-200 has-[input:checked]:border-teal-300">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm [&::-webkit-details-marker]:hidden">
              {/* 기본 삼각형 마커를 지웠으므로 대체 마커가 열림/닫힘을 나타내야 한다(안 그러면 접힌 도와 펼친 도가 똑같아 보인다). */}
              <span aria-hidden className="text-slate-400 transition-transform group-open:rotate-90">▸</span>
              <span className="font-medium text-slate-800">{sido}</span>
              {/* 선택 여부는 CSS(:has)로 표시한다 — 숫자 배지는 **저장된 값** 기준이라, 지금 체크박스를
                  누르는 동안 갱신되지 않는다("3곳 선택"이라 해놓고 실제로는 0곳인 상태가 생긴다). */}
              <span className="hidden rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700 group-has-[input:checked]:inline">선택함</span>
              <span className="text-xs text-slate-500 group-has-[input:checked]:hidden">시·군·구 {SIDO_SIGUNGU[sido].length}곳</span>
            </summary>
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 px-3 py-2">
              {values.map((v, i) => (
                <label key={v} className={item}>
                  <input type="checkbox" name="desired_location" value={v} defaultChecked={savedSet.has(v)} className={box} />
                  {i === 0 ? <b className="font-semibold">{sido} 전체</b> : v.slice(sido.length + 1)}
                </label>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

/** 시·도 > 시·군·구 단일 선택(거주지). optgroup 이라 270개를 넣어도 모바일 기본 선택기가 그대로 잘 뜬다. */
function RegionSelect({ id, defaultValue }: Readonly<{ id: string; defaultValue: string | null }>) {
  const v = defaultValue ?? "";
  const known = SIDO_LIST.some((sd) => v === sd || SIDO_SIGUNGU[sd].some((s) => `${sd} ${s}` === v));
  return (
    <select id={id} name={id} defaultValue={v} className={INPUT_CLASS}>
      <option value="">선택 안 함</option>
      {/* 목록에 없는 예전 값(예: "수도권")도 남겨둔다 — 없으면 저장 순간 조용히 지워진다. */}
      {v && !known && <option value={v}>{v}</option>}
      {SIDO_LIST.map((sd) => (
        <optgroup key={sd} label={sd}>
          <option value={sd}>{sd} 전체</option>
          {SIDO_SIGUNGU[sd].map((s) => <option key={s} value={`${sd} ${s}`}>{s}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

function Field({ id, text, hint, children }: Readonly<{ id: string; text: React.ReactNode; hint?: string; children: React.ReactNode }>) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={label}>{text} {hint && <span className="text-slate-500">{hint}</span>}</label>
      {children}
    </div>
  );
}

/**
 * 이력서 사진 — **선택 항목**(오너 확정 2026-07-29).
 *
 * 지금까지 사진을 넣는 길이 없어서 이관 회원과 네이버 가입자만 사진이 있었다.
 * 본인은 언제나 자기 사진을 본다. 남의 사진을 보는 곳은 두 군데뿐이고 둘 다 10분짜리 서명 URL 이다
 * (버킷이 비공개라 경로를 알아도 못 연다):
 *   · 인재 검색 — 광고 중인 병원만(revealContacts)
 *   · 내가 지원한 공고의 병원 — 그 화면은 이미 이름·연락처를 보여준다. 스스로 지원한 사람이라
 *     사진만 더 가릴 이유가 없다. **화면 고지 문구가 이 둘을 다 말해야 한다.**
 *
 * 폼을 따로 두는 이유: 이력서 본문 폼에 파일을 섞으면 사진만 바꾸려 해도 전체 검증을 통과해야 한다.
 * 공개 스위치와 같은 사고방식이다.
 */
function PhotoCard({ url }: Readonly<{ url: string | null }>) {
  return (
    <section aria-label="이력서 사진" className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-bold text-slate-900">사진 <span className="text-sm font-normal text-slate-500">(선택)</span></h2>
      <p className="mt-1 text-xs text-slate-600">
        넣지 않아도 이력서를 저장할 수 있습니다. 사진은 <b className="text-slate-800">{RESUME_PUBLIC_SCOPE.advertiserWho}</b>에게만 보입니다.
      </p>
      <div className="mt-4 flex flex-wrap items-start gap-4">
        {url ? (
          // 서명 URL 이라 next/image 최적화 대상이 아니다(도메인마다 서명이 달라 캐시가 안 먹는다) → img.
          // object-top 은 IdPhoto 와 같은 값이어야 한다 — 미리보기가 병원이 보는 것과 다르게 잘리면
          // "내 사진이 왜 저렇게 나오지" 를 확인할 방법이 없어진다.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="등록된 이력서 사진" width={96} height={128}
            className="h-32 w-24 shrink-0 rounded border border-slate-200 object-cover object-top" />
        ) : (
          <div className="grid h-32 w-24 shrink-0 place-items-center rounded border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400">
            사진 없음
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <form action={saveResumePhoto} className="flex flex-wrap items-center gap-2">
            <PhotoPicker hasPhoto={!!url} />
          </form>
          <p className="text-xs text-slate-500">JPG · PNG · WEBP. 큰 사진은 자동으로 줄여서 올립니다. 증명사진 비율(3:4)을 권장합니다.</p>
          {url && (
            <form action={deleteResumePhoto}>
              <ConfirmSubmit variant="outline" size="sm" className="min-h-11" message="등록된 사진을 지울까요?">
                사진 삭제
              </ConfirmSubmit>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * 🔴 공개/비공개 스위치 — 화면 **맨 위**에 둔다.
 *
 * 전에는 이게 아래 편집 폼 끝(자기소개 다음)의 체크박스 하나뿐이었다. 비공개로 바꾸려면
 * 끝까지 스크롤 → 체크 해제 → 폼 전체 저장이었고, 폼의 다른 항목이 검증에 걸리면 비공개조차
 * 되지 않았다. 구 널스넷에서 이게 회원 이탈의 주된 원인이었다(오너 확인 2026-07-29).
 *
 * 끄기는 확인 없이 한 번에 — 개인정보 제공 동의 철회에 확인을 요구하는 건 다크패턴이다.
 * 켜기는 무엇이 누구에게 가는지 확인을 받는다(동의 행위라서).
 */
function VisibilitySwitch({ isPublic, hasName }: Readonly<{ isPublic: boolean; hasName: boolean }>) {
  return (
    <section
      aria-label="이력서 공개 설정"
      className={`rounded-2xl border p-5 ${isPublic ? "border-teal-300 bg-teal-50" : "border-slate-300 bg-slate-50"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-bold text-slate-900">
            <span aria-hidden className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${isPublic ? "bg-teal-600" : "bg-slate-400"}`} />
            {isPublic ? "지금 이력서가 공개 중입니다" : "지금 이력서는 비공개입니다"}
          </p>
          {/* 🔴 이 문구는 **동의의 내용**이다. 전에는 "광고 중인 병원이 봅니다"라고만 적었는데,
              실제 인재정보 목록(/talent)은 로그인하지 않은 사람에게도 열려 있다(레거시 널스넷과
              같은 정책). 고지와 실제가 다르면 동의를 받은 것이 아니다 → 두 단계로 나눠 적는다.
              공개 범위를 바꾸면 여기 문구도 반드시 함께 바꾼다. */}
          <p className="mt-1 text-sm text-slate-700">
            {isPublic
              ? "누구나 볼 수 있는 상태입니다. 이 버튼으로 언제든 즉시 멈출 수 있습니다."
              : "아무도 볼 수 없습니다. 공개하면 아래 범위로 열립니다."}
          </p>
          {/* 🔴 이름이 비어 있으면 searchPublicTalent 가 목록에서 제외한다(.not("name","is",null)).
              그런데 화면은 "공개 중"이라고만 해서, 아무리 기다려도 병원 눈에 안 띄는 이유를 알 수 없었다.
              이관해온 이력서에 실제로 이름 없는 건이 있다. */}
          {isPublic && !hasName && (
            <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <b className="font-semibold">이름이 비어 있어 인재 검색에는 나오지 않습니다.</b> 아래 ① 기본 인적사항에
              이름을 채우고 저장하면 그때부터 노출됩니다.
            </p>
          )}
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            <li>
              <b className="font-semibold text-slate-800">누구나(로그인 안 해도)</b> — {RESUME_PUBLIC_SCOPE.anyone}
            </li>
            <li>
              <b className="font-semibold text-slate-800">{RESUME_PUBLIC_SCOPE.advertiserWho}만</b> — {RESUME_PUBLIC_SCOPE.advertiser}
            </li>
          </ul>
        </div>
        <form action={setResumePublic} className="shrink-0">
          <input type="hidden" name="is_public" value={isPublic ? "off" : "on"} />
          {isPublic ? (
            // 끄기: 확인 없이 즉시. 되돌리기도 이 버튼 한 번이라 실수해도 손해가 없다.
            // 같은 값을 두 번 눌러도 결과가 같아(멱등) 중복 제출 방어가 따로 필요 없다.
            <button type="submit" className={buttonClass("outline", "md", "min-h-11")}>비공개로 바꾸기</button>
          ) : (
            <ConfirmSubmit
              variant="primary" size="md" className="min-h-11"
              message={`이력서를 공개할까요?

· 누구나(로그인 안 해도) — ${RESUME_PUBLIC_SCOPE.anyone}
· ${RESUME_PUBLIC_SCOPE.advertiserWho}만 — ${RESUME_PUBLIC_SCOPE.advertiser}

같은 버튼으로 언제든 즉시 되돌릴 수 있습니다.`}
            >
              공개하기
            </ConfirmSubmit>
          )}
        </form>
      </div>
    </section>
  );
}

// 저장된 이력서를 그대로 확인하는 화면 — 수정 폼만 있으면 "저장이 된 건지" 알 수 없다.
// 사진도 여기 싣는다 — 위 업로드 상자에만 있으면 "올리긴 했는데 이력서에 붙었나?" 를 확인할 길이 없다.
function ResumeView({ r, photoUrl }: Readonly<{ r: ResumeWithWork; photoUrl: string | null }>) {
  const pct = completeness(r, r.work.length);
  const rows: Array<[string, string | null]> = [
    ["이름", r.name], ["연락처", r.phone], ["면허", r.license_type],
    ["총 경력", r.experience_years != null ? `${r.experience_years}년` : null],
    ["자격증", r.certifications.length > 0 ? r.certifications.join(", ") : null],
    ["최종학력", [r.education_level, r.graduation_status].filter(Boolean).join(" · ") || null],
    ["가능한 근무형태", r.shift_types.length > 0 ? r.shift_types.join(", ") : null],
    ["희망 근무지", r.desired_location],
    ["희망 근무부서", r.specialties.length > 0 ? r.specialties.join(", ") : null],
    ["희망 직종", r.job_categories.length > 0 ? r.job_categories.join(", ") : null],
  ];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-slate-900">저장된 이력서</h2>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${r.is_public ? "bg-teal-100 text-teal-800" : "bg-slate-200 text-slate-700"}`}>
          {r.is_public ? "공개 중" : "비공개"}
        </span>
      </div>

      {/* 무엇을 더 채우면 좋은지 눈에 보이게 — 항목이 많아 다 채우라고만 하면 아무도 안 채운다 */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>이력서 완성도</span><span className="font-semibold text-teal-700">{pct}%</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200" role="img" aria-label={`이력서 완성도 ${pct}퍼센트`}>
          <div className="h-full rounded-full bg-teal-600" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="mt-4 flex gap-4">
        {/* dt 는 모바일에서 한 칸 좁힌다 — 사진이 옆에 붙으면서 값(dd) 자리가 90px 남짓으로 눌린다. */}
        <dl className="grid min-w-0 flex-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="w-20 shrink-0 text-slate-500 sm:w-24">{k}</dt>
              <dd className="min-w-0 flex-1 text-slate-800">{v || <span className="text-slate-500">미입력</span>}</dd>
            </div>
          ))}
        </dl>
        {/* 바로 위 이름 칸과 같은 내용이라 alt 는 비운다. */}
        <IdPhoto src={photoUrl} />
      </div>

      {r.work.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-slate-100 pt-4 text-sm">
          {r.work.map((w) => (
            <li key={w.id} className="text-slate-700">
              <b className="text-slate-900">{w.hospital_name}</b>
              {w.department && ` · ${w.department}`}
              {` · ${w.start_ym} ~ ${w.is_current ? "재직중" : w.end_ym ?? ""}`}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button href="/mypage/resume/print" variant="outline" size="sm" className="min-h-11">이력서 인쇄 · PDF 저장</Button>
        <span className="text-xs text-slate-600">아래에서 고친 뒤 저장하면 이 내용이 바뀝니다.</span>
      </div>
    </section>
  );
}

export default async function ResumePage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ ok?: string; error?: string; next?: string }> }>) {
  const p = await requireProfile("/mypage/resume", "nurse");
  const [{ ok, error, next }, r, photoUrl] = await Promise.all([searchParams, getMyResume(), getMyAvatarUrl()]);
  const backTo = safeNext(next, "");
  // 예전에 저장된 값(예: "중환자", "수도권", "기타")이 지금 선택지에 없더라도 목록에 끼워 넣는다.
  // 안 그러면 체크·선택이 복원되지 않아 다시 저장하는 순간 조용히 지워진다.
  const withSaved = (options: readonly string[], saved: readonly string[]) =>
    [...saved.filter((v) => !options.includes(v)), ...options];

  const savedRegions = (r?.desired_location ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  // 🔴 근무부서는 구 널스넷 코드표(DEPARTMENTS 28개)를 쓴다. 전에는 채용용 JOB_SPECIALTIES(9개)를 썼는데
  //    이관한 이력서 7,257건이 전부 DEPARTMENTS 값이라, 인재 검색 칩 9개 중 6개가 0명이었다.
  const specialtyOptions = withSaved(DEPARTMENTS, r?.specialties ?? []);
  const categoryOptions = withSaved(JOB_CATEGORIES, r?.job_categories ?? []);
  const licenseOptions = withSaved(LICENSE_TYPES, r?.license_type ? [r.license_type] : []);
  const certOptions = withSaved(CERTIFICATIONS, r?.certifications ?? []);
  const shiftOptions = withSaved(SHIFT_TYPES, r?.shift_types ?? []);
  const hospitalTypeOptions = withSaved(HOSPITAL_TYPES, r?.desired_hospital_types ?? []);

  return (
    <NurseShell displayName={p.displayName} active="/mypage/resume">
      <h1 className="text-2xl font-bold text-slate-900">내 이력서</h1>
      <p className="mt-1 text-sm text-slate-600">
        이력서는 무료입니다. <b className="text-slate-800">저장에 꼭 필요한 것은 6개</b>(이름 · 휴대폰 · 면허 · 신규/경력 · 근무형태 · 희망 근무지)이고,
        나머지는 채울수록 병원 눈에 잘 띕니다.
      </p>

      {ok === "1" && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">이력서가 저장되었습니다.</div>}
      {ok === "deleted" && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">이력서를 삭제했습니다.</div>}
      {ok === "photo" && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">사진을 저장했습니다.</div>}
      {ok === "photo_deleted" && <div role="status" className="mt-4 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-800">사진을 삭제했습니다.</div>}
      {ok === "public" && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">이력서를 공개했습니다. 연락처를 뺀 내용은 누구나 볼 수 있고, {RESUME_PUBLIC_SCOPE.advertiser}은 {RESUME_PUBLIC_SCOPE.advertiserWho}만 봅니다.</div>}
      {ok === "private" && <div role="status" className="mt-4 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-800">이력서를 비공개로 바꿨습니다. 이제 아무도 볼 수 없습니다 — 위 버튼으로 언제든 다시 공개할 수 있습니다.</div>}
      {messageFor(SAVE_ERRORS, error) && <div role="alert" aria-live="assertive" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{messageFor(SAVE_ERRORS, error)}</div>}

      {/* 공개 스위치는 이력서보다 먼저 — 회원이 가장 급하게 찾는 것이라 스크롤 없이 보여야 한다. */}
      {r && <div className="mt-6"><VisibilitySwitch isPublic={r.is_public} hasName={!!r.name?.trim()} /></div>}
      <div className="mt-4"><PhotoCard url={photoUrl} /></div>
      {r && <div className="mt-4"><ResumeView r={r} photoUrl={photoUrl} /></div>}

      {backTo && (
        <p className="mt-6 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          이름과 휴대폰 번호를 채우고 저장하면 보던 공고로 돌아가 바로 지원할 수 있습니다.
        </p>
      )}

      <h2 className="mt-8 text-sm font-semibold text-slate-600">{r ? "이력서 수정" : "이력서 작성"}</h2>

      <form action={saveResume} className="mt-3 flex flex-col gap-4">
        {/* 필수 체크박스 그룹을 제출 전에 막는다 — 서버에서 걸리면 화면을 떠나며 입력이 전부 날아간다.
            서버 검증(saveResume)은 그대로 있다. 여기 이름은 그쪽 검증과 **같은 name** 이어야 한다. */}
        <ResumeFormGuard
          groups={[
            { name: "shift_types", message: "가능한 근무형태를 하나 이상 선택해 주세요." },
            { name: "desired_location", message: "희망 근무지를 하나 이상 선택해 주세요." },
          ]}
        />
        {/* 임시저장 — 30개 넘는 항목을 쓰다 중단해도 다음에 이어 쓴다.
            키에 계정(이메일)을 넣어 같은 PC 의 다른 사람이 못 읽게 한다.
            rowName·addRowLabel: 경력 줄이 동적이라 복원할 때 줄 수부터 맞춰야 한다. */}
        <FormDraft
          storageKey={`nursenet:draft:resume:${p.email}`}
          rowName="w_hospital_name"
          addRowLabel="+ 경력 추가"
          // 이 폼의 서버 검증 코드만 인정한다 — 같은 화면의 사진·공개 스위치 오류(?error=photo_size 등)로
          // 이미 저장에 성공한 초안이 되살아나면 최신 이력서를 옛 값으로 덮어쓴다.
          ownErrors={["title", "intro", "shift", "region", "work", "work_required", "work_lost", "save"]}
        />
        <input type="hidden" name="next" value={backTo} />

        <Section title="① 기본" hint="이름과 휴대폰이 없으면 병원이 연락할 방법이 없어 지원이 막힙니다.">
          {/* 제목·자기소개는 필수다(오너 확정 2026-07-30). 목록 카드의 머리말이 제목이고,
              자기소개가 비면 병원이 그 사람을 판단할 근거가 카드에 남지 않는다. */}
          <Field id="resume_title" text={<>이력서 제목 {req}</>}>
            <input id="resume_title" name="resume_title" required maxLength={300} defaultValue={r?.resume_title ?? ""} placeholder="예: NICU 4년, 나이트 가능 간호사" className={INPUT_CLASS} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="name" text={<>이름 {req}</>}>
              <input id="name" name="name" required defaultValue={r?.name ?? p.displayName} className={INPUT_CLASS} />
            </Field>
            <Field id="phone" text={<>휴대폰 {req}</>}>
              <input id="phone" name="phone" required inputMode="tel" defaultValue={r?.phone ?? ""} placeholder="010-0000-0000" className={INPUT_CLASS} />
            </Field>
            <Field id="email" text="이메일" hint="(전화를 못 받을 때의 예비 연락처)">
              <input id="email" name="email" type="email" defaultValue={r?.email ?? ""} className={INPUT_CLASS} />
            </Field>
            <Field id="residence_region" text="거주 지역" hint="(통근 가능 여부 판단용)">
              <RegionSelect id="residence_region" defaultValue={r?.residence_region ?? null} />
            </Field>
            {/* 🔴 성별·나이는 인재 카드에 **누구에게나** 공개되는 값인데(lib/data/talent.ts 의 카드 구성),
                정작 본인이 입력·수정·삭제할 화면이 없었다. 이관 회원은 값이 있고 새로 가입한 사람은
                영영 빈칸이었다. 저장 위치는 profiles 이고 이 폼이 함께 갱신한다(saveResume).
                '선택 안 함' 을 고르면 지워진다 — 넣는 것과 같은 무게로 뺄 수 있어야 한다. */}
            <Field id="gender" text="성별" hint="(인재 카드에 공개)">
              <select id="gender" name="gender" defaultValue={p.gender ?? ""} className={INPUT_CLASS}>
                {/* 🔴 value 는 DB 에 실제로 들어 있는 값이어야 한다 — 이관 회원 11,407명이 '여성'/'남성' 으로
                    저장돼 있다(실측). '여'/'남' 으로 두면 그분들 화면에는 '선택 안 함' 으로 보이고,
                    이력서를 한 번만 저장해도 공개 카드의 성별이 조용히 지워진다. 표기도 카드와 같아진다. */}
                <option value="">선택 안 함</option>
                <option value="여성">여성</option>
                <option value="남성">남성</option>
              </select>
            </Field>
            <Field id="birthday" text="생년월일" hint="(카드에는 나이만 표시)">
              <input id="birthday" name="birthday" type="date" defaultValue={p.birthday ?? ""} className={INPUT_CLASS} />
            </Field>
          </div>
        </Section>

        <Section title="② 면허 · 자격">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="license_type" text={<>면허 구분 {req}</>}>
              <select id="license_type" name="license_type" required defaultValue={r?.license_type ?? "간호사"} className={INPUT_CLASS}>
                {licenseOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field id="license_year" text="면허 취득연도" hint="(선택)">
              <input id="license_year" name="license_year" type="number" min="1960" max="2100" defaultValue={r?.license_year ?? ""} placeholder="예: 2019" className={INPUT_CLASS} />
            </Field>
          </div>
          {/* 3년마다 신고 의무이고, 미신고면 면허 효력이 정지돼 실제 공고 지원자격에 그대로 등장한다 */}
          <YesNo name="license_reported" text="의료인 면허신고를 마쳤습니다 (3년 주기)" value={r?.license_reported ?? null} />
          <fieldset>
            <legend className={label}>보유 자격증 <span className="text-slate-500">(복수 선택)</span></legend>
            <div className="mt-1"><CheckGroup name="certifications" options={certOptions} checked={r?.certifications ?? []} /></div>
          </fieldset>
          <Field id="apn_field" text="전문간호사(APN) 분야" hint="(해당자만)">
            <Select id="apn_field" defaultValue={r?.apn_field ?? null} options={APN_FIELDS} />
          </Field>
        </Section>

        <Section title="③ 학력">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="education_level" text="최종 학력">
              <Select id="education_level" defaultValue={r?.education_level ?? null} options={EDUCATION_LEVELS} />
            </Field>
            <Field id="graduation_status" text="졸업 여부">
              <Select id="graduation_status" defaultValue={r?.graduation_status ?? null} options={GRADUATION_STATUS} />
            </Field>
          </div>
          <Field id="education" text="학교 · 전공" hint="(선택)">
            <input id="education" name="education" defaultValue={r?.education ?? ""} placeholder="예: ○○대학교 간호학과" className={INPUT_CLASS} />
          </Field>
        </Section>

        <Section title="④ 경력" hint="총 경력은 아래 입력에서 자동으로 계산됩니다. 따로 적지 않으셔도 됩니다.">
          <Field id="career_level" text={<>신규 / 경력 {req}</>}>
            <select id="career_level" name="career_level" required defaultValue={r?.career_level ?? ""} className={INPUT_CLASS}>
              <option value="" disabled>선택하세요</option>
              {CAREER_LEVELS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <WorkExperienceFields initial={r?.work ?? []} />
          <div className="flex flex-col gap-1">
            <YesNo name="has_integrated_care" text="간호간병통합병동 경력이 있습니다" value={r?.has_integrated_care ?? null} />
            <YesNo name="can_charge" text="차지(Charge) 가능합니다" value={r?.can_charge ?? null} />
          </div>
        </Section>

        <Section title="⑤ 희망 근무조건" hint="병원이 가장 먼저 보는 항목입니다. 근무형태가 안 맞으면 다른 조건은 보지 않습니다.">
          {/* 🤖 AI 자동매치가 보는 항목이 바로 이 묶음이다 — 무엇이 비어 있는지 여기서 짚어준다
              (오너 지시 2026-08-05). 판정은 저장된 값 기준이라, 지금 고치는 중이면 저장 후에 갱신된다. */}
          <MatchAxisNotice seeker={r} />
          <fieldset>
            <legend className={label}>가능한 근무형태 {req} <span className="text-slate-500">(복수 선택)</span></legend>
            <div className="mt-1"><CheckGroup name="shift_types" options={shiftOptions} checked={r?.shift_types ?? []} /></div>
          </fieldset>
          <YesNo name="night_available" text="나이트 전담도 가능합니다" value={r?.night_available ?? null} />
          <fieldset>
            <legend className={label}>희망 근무지 {req} <span className="text-slate-500">(복수 선택 · 시·군·구까지)</span></legend>
            <p className="mt-1 text-xs text-slate-600">
              도를 눌러 펼친 뒤 원하는 시·군·구를 고르세요. 어디든 좋으면 <b>“○○ 전체”</b>만 고르면 됩니다.
            </p>
            <DesiredLocationField saved={savedRegions} />
          </fieldset>
          <fieldset>
            <legend className={label}>희망 근무부서 <span className="text-slate-500">(복수 선택)</span></legend>
            <div className="mt-1"><CheckGroup name="specialties" options={specialtyOptions} checked={r?.specialties ?? []} /></div>
          </fieldset>
          <fieldset>
            <legend className={label}>희망 직종 <span className="text-slate-500">(복수 선택)</span></legend>
            <div className="mt-1"><CheckGroup name="job_categories" options={categoryOptions} checked={r?.job_categories ?? []} /></div>
          </fieldset>
          <fieldset>
            <legend className={label}>희망 의료기관 종별 <span className="text-slate-500">(복수 선택)</span></legend>
            <div className="mt-1"><CheckGroup name="desired_hospital_types" options={hospitalTypeOptions} checked={r?.desired_hospital_types ?? []} /></div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="desired_employment_type" text="희망 고용형태">
              <Select id="desired_employment_type" defaultValue={r?.desired_employment_type ?? null} options={EMPLOYMENT_TYPES} />
            </Field>
            <Field id="available_from" text="입사 가능일">
              <Select id="available_from" defaultValue={r?.available_from ?? null} options={AVAILABLE_FROM} />
            </Field>
          </div>
          <Field id="desired_salary" text="희망 급여" hint="(선택)">
            <input id="desired_salary" name="desired_salary" defaultValue={r?.desired_salary ?? ""} placeholder="예: 연 4,000만원 / 협의" className={INPUT_CLASS} />
          </Field>
          <YesNo name="needs_dormitory" text="기숙사가 필요합니다" value={r?.needs_dormitory ?? null} />
        </Section>

        <Section title="⑥ 소개 · 공개 설정">
          <div className="flex flex-col gap-1">
            <label htmlFor="intro" className={label}>자기소개 {req} <span className="text-slate-500">({RESUME_INTRO_MIN}자 이상)</span></label>
            {/* 민감정보는 별도 동의 없이 처리할 수 없다(개인정보보호법 제23조) */}
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              건강상태 · 병력 · 임신 여부 · 종교 · 정당 가입 여부는 적지 마세요. 법으로 수집이 제한된 정보입니다.
            </p>
            <textarea id="intro" name="intro" rows={6} required minLength={RESUME_INTRO_MIN} maxLength={RESUME_INTRO_MAX} defaultValue={r?.intro ?? ""}
              placeholder={`경력에서 다루지 못한 강점, 지원 동기 등을 자유롭게 적어주세요. (${RESUME_INTRO_MIN}자 이상)`}
              className="w-full rounded-xl border border-slate-300 p-3 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40" />
          </div>
          {/* 🔴 공개 동의는 **첫 저장 때만** 여기서 받는다. 이력서가 이미 있으면 이 자리는 안내만 두고,
              바꾸는 것은 화면 맨 위 스위치 하나로 몬다(VisibilitySwitch).
              둘 다 두면: 스위치로 비공개로 바꾼 뒤, 열어둔 다른 탭이나 뒤로가기로 되살아난 낡은 폼을
              저장하는 순간 체크된 채 남아 있던 이 체크박스가 조용히 다시 공개로 돌려놓는다. */}
          {r ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              공개 여부는 <b className="text-slate-900">이 화면 맨 위</b>에서 바꿉니다 — 지금은{" "}
              <b className={r.is_public ? "text-teal-700" : "text-slate-900"}>{r.is_public ? "공개 중" : "비공개"}</b>입니다.
              여기서 저장해도 공개 여부는 바뀌지 않습니다.
            </p>
          ) : (
            <label className="flex items-start gap-2 text-sm text-slate-700">
              {/* 이 필드가 함께 올 때만 서버가 공개 여부를 받아들인다(saveResume) */}
              <input type="hidden" name="visibility_field" value="1" />
              <input type="checkbox" name="is_public" defaultChecked={false}
                className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-teal-600 focus-visible:ring-2 focus-visible:ring-teal-600" />
              <span>
                이력서 공개에 동의합니다
                <span className="mt-1 block text-xs leading-relaxed text-slate-600">
                  <b className="text-slate-700">누가 봅니까?</b> 인재정보 화면에서 <b className="text-slate-800">로그인하지 않은 방문자를 포함한 누구나</b> — {RESUME_PUBLIC_SCOPE.anyone}.
                  <b className="text-slate-700"> 연락처는?</b> {RESUME_PUBLIC_SCOPE.advertiser}는 <b className="text-slate-800">{RESUME_PUBLIC_SCOPE.advertiserWho}</b>만 봅니다.
                  <b className="text-slate-700"> 왜 봅니까?</b> 채용 제안 · 인재 검색 목적.
                  <b className="text-slate-700"> 언제까지?</b> 저장 뒤에는 이 화면 맨 위 스위치로 언제든 즉시 중단할 수 있습니다.
                </span>
              </span>
            </label>
          )}
        </Section>

        <SubmitButton pendingText="저장 중…">{r ? "이력서 수정" : "이력서 저장"}</SubmitButton>
      </form>

      {r && (
        <div className="mt-8 rounded-2xl border border-red-200 bg-red-50/50 p-5">
          <h3 className="font-bold text-slate-900">이력서 삭제</h3>
          <p className="mt-1 text-sm text-slate-600">
            이력서와 경력 내용이 모두 지워집니다. 이미 지원한 공고의 기록은 병원에 남습니다.
          </p>
          <form action={deleteResume} className="mt-3">
            <ConfirmSubmit className="min-h-11" message="이력서를 삭제할까요?&#10;&#10;· 경력과 증명사진까지 모두 지워지며 되돌릴 수 없습니다.&#10;· 이력서가 없으면 리뷰·게시판을 읽을 수도, 쓸 수도, 이미 쓴 글을 고치거나 지울 수도 없습니다(글 자체는 남습니다).&#10;· 쓴 리뷰·게시글은 남고(병원 평점에도 계속 반영됩니다), 이력서를 다시 등록해야 고치거나 지울 수 있습니다.&#10;· 지울 글이 있으면 이력서를 지우기 **전에** 먼저 정리하세요.&#10;· 공고에 지원하려면 이력서가 다시 필요합니다.">
              이력서 삭제
            </ConfirmSubmit>
          </form>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-slate-600">
        <Link href="/jobs" className={LINK_CLASS}>채용공고 보러 가기</Link>
      </p>
    </NurseShell>
  );
}
