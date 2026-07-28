import { redirect } from "next/navigation";
import HospitalShell from "@/components/HospitalShell";
import Button from "@/components/Button";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { getMyProfile } from "@/lib/data/user";
import { getMyJobs } from "@/lib/data/jobs";
import {
  getReceivedApplications, STATUS_LABEL, STATUS_TONE, CANCELABLE, APPLICANTS_PER_PAGE,
  type AppStatus, type ApplicantListItem, type ApplicantCounts,
} from "@/lib/data/applications";
import { fmtDay } from "@/lib/date";
import { careerSummary } from "@/lib/resumeOptions";
import { updateApplicationStatus, openApplicantResume, saveApplicantNote } from "../actions";

export const metadata = { title: "받은 지원자 — 널스넷", robots: { index: false } };

// 병원 화면에서는 '미확인(submitted)'만 눈에 띄어야 한다 — 나머지 색은 지원자 화면과 같은 값을 쓴다.
const TONE: Record<AppStatus, string> = { ...STATUS_TONE, submitted: "bg-amber-100 text-amber-800" };
// 터치 조작이 많은 줄이라 버튼 높이를 손가락 크기(44px)로 올린다.
const TAP = "min-h-11";
// 공고별·상태별 칩 — hover만 있으면 키보드 사용자는 어디에 있는지 알 수 없다.
const CHIP = "inline-flex min-h-11 items-center rounded-full px-3 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2";
// teal-600 위의 흰 글씨는 작은 글씨(text-xs) 기준 대비가 모자란다(3.7:1) → 한 단계 진하게.
const CHIP_ON = "bg-teal-700 text-white";
const CHIP_OFF = "border border-slate-300 text-slate-600 hover:bg-slate-50";

/** 지금 보고 있는 화면(공고·상태·검색·페이지)을 폼과 링크가 똑같이 들고 다닌다. */
type View = { job_id?: string; status?: string; q?: string; page?: string };
const viewQs = (v: View, patch: Partial<View> = {}) => {
  const p = new URLSearchParams();
  const merged = { ...v, ...patch };
  for (const k of ["job_id", "status", "q", "page"] as const) {
    const val = (merged[k] ?? "").trim();
    if (val) p.set(k, val);
  }
  return p.toString();
};
const viewHref = (v: View, patch: Partial<View> = {}) => {
  const s = viewQs(v, patch);
  return "/mypage/applicants" + (s ? `?${s}` : "");
};
/** 서버 액션 폼이 화면 상태를 그대로 되돌려받게 하는 hidden 필드들. */
function ViewFields({ v }: Readonly<{ v: View }>) {
  return (
    <>
      {v.job_id && <input type="hidden" name="job_id" value={v.job_id} />}
      {v.status && <input type="hidden" name="status" value={v.status} />}
      {v.q && <input type="hidden" name="q" value={v.q} />}
      {v.page && <input type="hidden" name="page" value={v.page} />}
    </>
  );
}

function StatusButton({ id, view, status, label, variant, confirm }: Readonly<{
  id: string; view: View; status: AppStatus; label: string; variant: "primary" | "outline" | "danger"; confirm: string;
}>) {
  return (
    <form action={updateApplicationStatus} className="inline">
      <input type="hidden" name="application_id" value={id} />
      {/* 목록 필터(ViewFields 의 status)와 겹치지 않게 이름을 나눈다 */}
      <input type="hidden" name="to_status" value={status} />
      <ViewFields v={view} />
      <ConfirmSubmit message={confirm} variant={variant} size="sm" className={TAP}>{label}</ConfirmSubmit>
    </form>
  );
}

function Field({ k, v }: Readonly<{ k: string; v: string | null }>) {
  if (!v) return null;
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-slate-500">{k}</dt>
      <dd className="min-w-0 flex-1 text-slate-800">{v}</dd>
    </div>
  );
}

/**
 * 지원자 한 줄.
 *
 * 500건을 훑어야 하는 화면이라 **접힌 한 줄이 기본**이다(이름·경력·상태·메모 유무까지 한 눈에).
 * 전에는 카드가 세로로 길어 한 화면에 3~4명뿐이라, 담당자가 스크롤만 하다 지쳤다(오너 지적).
 * 펼치면 이력서 요약·전문 열기·판정 버튼·메모가 나온다 — 자바스크립트 없이 native `<details>`.
 */
function Applicant({ a, view }: Readonly<{ a: ApplicantListItem; view: View }>) {
  const r = a.resume;
  const decided = a.status === "accepted" || a.status === "rejected";
  // 아직 판정 전 = 지원자가 취소할 수 있는 상태와 같다(진행 중인 건).
  const open = CANCELABLE.some((s) => s === a.status);
  return (
    <li className={`overflow-hidden rounded-xl border bg-white ${a.status === "submitted" ? "border-amber-300" : "border-slate-200"}`}>
      <details className="group">
        <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm [&::-webkit-details-marker]:hidden">
          {/* 기본 마커를 지웠으므로 대체 마커가 열림/닫힘을 나타내야 한다. */}
          <span aria-hidden className="text-slate-400 transition-transform group-open:rotate-90">▸</span>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[a.status]}`}>{STATUS_LABEL[a.status]}</span>
          <span className="font-bold text-slate-900">{r?.name ?? "이름 미입력"}</span>
          {r && <span className="text-slate-600">{careerSummary(r.career_level, r.experience_years)}</span>}
          {r?.license_type && <span className="text-xs text-slate-500">{r.license_type}</span>}
          {a.memo && (
            // 메모가 있다는 사실이 접힌 줄에서 보여야 "이 사람 처리했던가?" 를 다시 안 편다.
            <span className="max-w-[16rem] truncate rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800" title={a.memo}>
              📝 {a.memo}
            </span>
          )}
          <span className="ml-auto shrink-0 text-xs text-slate-500">{fmtDay(a.created_at)}</span>
        </summary>

        <div className="border-t border-slate-100 px-4 pb-4 pt-3">
          <p className="text-xs text-slate-500">{a.job?.title ?? "공고"}</p>

          <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm">
            {!r ? (
              <div className="text-slate-500">이력서 정보를 불러올 수 없습니다.</div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {r.night_available && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">나이트 전담 가능</span>}
                  {r.phone ? (
                    <span className="font-semibold text-slate-800">{r.phone}</span>
                  ) : (
                    <span className="text-xs text-red-600">연락처 미입력</span>
                  )}
                </div>
                {/* 카드는 걸러내는 데 필요한 것까지만. 경력 상세·학력은 '이력서 전문 보기'에서 — 그 행위를 열람 신호로 쓴다. */}
                <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  <Field k="근무형태" v={r.shift_types.length > 0 ? r.shift_types.join(", ") : null} />
                  <Field k="자격증" v={r.certifications.length > 0 ? r.certifications.join(", ") : null} />
                  <Field k="희망 진료과" v={r.specialties.length > 0 ? r.specialties.join(", ") : null} />
                  <Field k="희망 근무지" v={r.desired_location} />
                </dl>
                {r.intro && <p className="mt-2 line-clamp-2 whitespace-pre-line text-slate-600">{r.intro}</p>}
              </>
            )}
          </div>

          {a.message && <p className="mt-2 text-sm text-slate-600">지원 메시지: {a.message}</p>}

          {/* 병원이 지원자를 볼 때 가장 먼저 하는 행동 = 이력서 전문 열기.
              전화·문자·합격/불합격은 이력서를 읽은 다음이므로, 이 버튼을 크게 따로 빼서 섞이지 않게 한다.
              (이력서가 없으면 열어도 되돌아오기만 하므로 버튼을 내린다.) */}
          {r && (
            <form action={openApplicantResume} className="mt-3">
              <input type="hidden" name="application_id" value={a.id} />
              <ViewFields v={view} />
              <button type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-teal-600 px-4 text-sm font-bold text-white transition hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></svg>
                이력서 전문 보기 · 인쇄
              </button>
              <p className="mt-1 text-center text-xs text-slate-500">경력 상세 · 학력 · 자격증 · 희망조건 전체와 인쇄용 서식이 여기 있습니다</p>
            </form>
          )}

          {/* 담당자 메모 — 상태 5가지로는 "어제 통화했고 다음 주에 다시 연락" 같은 걸 적을 수 없다.
              지원자에게는 안 보인다(application_notes 는 병원 전용 테이블). */}
          <form action={saveApplicantNote} className="mt-3">
            <input type="hidden" name="application_id" value={a.id} />
            <ViewFields v={view} />
            <label htmlFor={`memo-${a.id}`} className="text-xs font-medium text-slate-600">
              담당자 메모 <span className="text-slate-400">(지원자에게 보이지 않습니다)</span>
            </label>
            <div className="mt-1 flex flex-wrap gap-2">
              <textarea id={`memo-${a.id}`} name="memo" rows={2} maxLength={1000} defaultValue={a.memo}
                placeholder="예: 10/12 통화, 야간 가능 확인. 다음 주 면접 조율 예정."
                className="min-w-0 flex-1 resize-y rounded-[12px] border border-slate-300 p-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40" />
              <Button type="submit" variant="outline" size="sm" className={`${TAP} self-start`}>메모 저장</Button>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {a.memoUpdatedAt ? `${fmtDay(a.memoUpdatedAt)} 저장됨 · ` : ""}
              메모는 한 사람씩 저장됩니다 — 여러 명을 고쳤다면 각각 눌러 주세요.
            </p>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <span className="text-xs text-slate-500">{fmtDay(a.created_at)} 지원</span>
            <span className="ml-auto flex flex-wrap items-center gap-2">
              {r?.phone && (
                <>
                  <Button href={`tel:${r.phone}`} variant="outline" size="sm" className={TAP}>전화</Button>
                  <Button href={`sms:${r.phone}`} variant="outline" size="sm" className={TAP}>문자</Button>
                </>
              )}
              {open && (
                <>
                  <StatusButton id={a.id} view={view} status="accepted" label="합격" variant="primary"
                    confirm="이 지원자를 합격 처리할까요? 지원자 화면에 '합격'으로 표시됩니다. 잘못 눌렀다면 '판정 취소'로 되돌릴 수 있습니다." />
                  <StatusButton id={a.id} view={view} status="rejected" label="불합격" variant="outline"
                    confirm="이 지원자를 불합격 처리할까요? 지원자 화면에 '불합격'으로 표시됩니다. 잘못 눌렀다면 '판정 취소'로 되돌릴 수 있습니다." />
                </>
              )}
              {decided && (
                // 되돌리기 — 전에는 한 번 누르면 버튼이 사라져 영영 못 고쳤다(오너 지적).
                // 반대 판정으로 곧장 뒤집지 않고 '열람됨'으로 한 단계 되돌린 뒤 다시 정하게 한다.
                // 지원자 화면에서 합격 → 불합격으로 곧바로 뒤집히는 게 더 나쁘기 때문이다.
                // 색은 outline — 되돌리기는 복구지 파괴가 아니다(빨강이면 누르기 무섭다).
                <StatusButton id={a.id} view={view} status="viewed" label="판정 취소" variant="outline"
                  confirm={`이 지원자의 '${STATUS_LABEL[a.status]}' 판정을 취소할까요?\n지원자 화면에서 '열람됨'으로 돌아가고, 합격·불합격을 다시 고를 수 있습니다.`} />
              )}
            </span>
          </div>
        </div>
      </details>
    </li>
  );
}

/** 상태 칩 — 숫자를 달아 "미확인 12" 를 보고 바로 누르게 한다. 0명인 상태는 그리지 않는다. */
function StatusChips({ view, counts }: Readonly<{ view: View; counts: ApplicantCounts }>) {
  const order: AppStatus[] = ["submitted", "viewed", "accepted", "rejected", "withdrawn"];
  const shown = order.filter((st) => (counts[st] ?? 0) > 0);
  if (shown.length === 0) return null;
  return (
    <nav aria-label="상태별 보기" className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs font-medium text-slate-400">상태</span>
      <a href={viewHref(view, { status: "", page: "" })} aria-current={!view.status ? "page" : undefined}
        className={`${CHIP} ${!view.status ? CHIP_ON : CHIP_OFF}`}>전체 {counts.all}</a>
      {shown.map((st) => (
        <a key={st} href={viewHref(view, { status: st, page: "" })} aria-current={view.status === st ? "page" : undefined}
          className={`${CHIP} ${view.status === st ? CHIP_ON : CHIP_OFF}`}>
          {STATUS_LABEL[st]} {counts[st]}
        </a>
      ))}
    </nav>
  );
}

export default async function ApplicantsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ ok?: string; error?: string; job_id?: string; status?: string; q?: string; page?: string }> }>) {
  const p = await getMyProfile();
  if (!p) redirect("/login");
  if (p.role !== "hospital") redirect("/mypage");
  const { ok, error, job_id, status, q, page } = await searchParams;

  // 상태는 알려진 값만 받는다 — 임의 문자열이 그대로 eq 로 들어가면 빈 화면만 나온다.
  const KNOWN: AppStatus[] = ["submitted", "viewed", "accepted", "rejected", "withdrawn"];
  const st = KNOWN.find((s) => s === status);
  const kw = (q ?? "").trim();
  const pageNum = Math.max(1, Number(page) || 1);
  const view: View = { job_id, status: st, q: kw, page: pageNum > 1 ? String(pageNum) : "" };

  const [jobs, { rows, total, counts, searchTruncated }] = await Promise.all([
    getMyJobs(),
    getReceivedApplications({ jobId: job_id, status: st, q: kw }, pageNum),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / APPLICANTS_PER_PAGE));
  // 필터를 좁혀 페이지 수가 줄면 ?page=9 가 남아 빈 화면이 된다. 그 화면에는 페이지 링크도 없어
  // 1페이지로 돌아갈 길이 사라진다 → 1페이지로 되돌린다.
  if (total > 0 && pageNum > totalPages) redirect(viewHref(view, { page: "" }));
  const unread = counts.submitted ?? 0;

  return (
    <HospitalShell displayName={p.displayName} active="/mypage/applicants">
      <h1 className="mt-3 text-2xl font-bold text-slate-900">받은 지원자</h1>
      <p className="mt-1 text-sm text-slate-500">
        {job_id ? "이 공고" : "전체"} {counts.all}명
        {unread > 0 && <> · <b className="text-amber-700">아직 확인하지 않은 지원 {unread}건</b></>}
      </p>

      {jobs.length > 1 && (
        // 현재 고른 공고는 색만이 아니라 aria-current로도 알려야 화면을 못 보는 사용자가 구분할 수 있다.
        <nav aria-label="공고별 보기" className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-slate-400">공고</span>
          <a href={viewHref({}, {})} aria-current={!job_id ? "page" : undefined} className={`${CHIP} ${!job_id ? CHIP_ON : CHIP_OFF}`}>전체</a>
          {jobs.map((jb) => (
            <a key={jb.id} href={viewHref({ job_id: jb.id })} aria-current={job_id === jb.id ? "page" : undefined}
              className={`${CHIP} ${job_id === jb.id ? CHIP_ON : CHIP_OFF}`}>
              {/* 말줄임은 flex 컨테이너가 아니라 안쪽 텍스트에 걸어야 실제로 "…"가 붙는다 */}
              <span className="max-w-[12rem] truncate">{jb.title}</span>
            </a>
          ))}
        </nav>
      )}

      <StatusChips view={view} counts={counts} />

      {/* 이름 검색 — 500건에서 "김간호" 를 찾는 유일한 길. GET 폼이라 주소가 그대로 공유·북마크된다. */}
      <form method="get" className="mt-3 flex flex-wrap gap-2">
        {job_id && <input type="hidden" name="job_id" value={job_id} />}
        {st && <input type="hidden" name="status" value={st} />}
        <input type="search" name="q" defaultValue={kw} placeholder="지원자 이름으로 찾기"
          aria-label="지원자 이름 검색"
          className="min-w-0 flex-1 rounded-[12px] border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40" />
        <Button type="submit" variant="outline" size="sm" className={TAP}>검색</Button>
        {kw && <Button href={viewHref(view, { q: "", page: "" })} variant="outline" size="sm" className={TAP}>지우기</Button>}
      </form>

      {searchTruncated && (
        <div role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          이름이 너무 흔해 일부만 찾았습니다. 성까지 넣어 다시 검색해 주세요.
        </div>
      )}
      {ok === "1" && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">처리되었습니다.</div>}
      {ok === "memo" && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">메모를 저장했습니다.</div>}
      {error === "1" && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">처리에 실패했습니다. 다시 시도해 주세요.</div>}
      {error === "noresume" && <div role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">지원자가 이력서를 삭제해 열람할 수 없습니다. 연락처도 확인할 수 없습니다.</div>}

      {rows.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-slate-500">
            {kw || st ? "조건에 맞는 지원자가 없습니다." : job_id ? "이 공고에는 아직 지원자가 없습니다." : "아직 지원자가 없습니다."}
          </p>
          {kw || st
            ? <a href={viewHref({ job_id })} className="mt-2 inline-block font-semibold text-teal-700 hover:underline">조건 지우고 전체 보기 →</a>
            : job_id
              ? <a href="/mypage/applicants" className="mt-2 inline-block font-semibold text-teal-700 hover:underline">전체 지원자 보기 →</a>
              : <a href="/mypage/jobs" className="mt-2 inline-block font-semibold text-teal-700 hover:underline">공고 관리로 가기 →</a>}
        </div>
      ) : (
        <>
          <p className="mt-4 text-xs text-slate-500">
            {total.toLocaleString()}명 중 {(pageNum - 1) * APPLICANTS_PER_PAGE + 1}–{(pageNum - 1) * APPLICANTS_PER_PAGE + rows.length}번째
            {totalPages > 1 && ` · ${pageNum}/${totalPages}p`} · 줄을 누르면 펼쳐집니다
          </p>
          <ul className="mt-2 space-y-2">
            {rows.map((a) => <Applicant key={a.id} a={a} view={view} />)}
          </ul>
          {totalPages > 1 && (
            <nav aria-label="페이지" className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {pageNum > 1 && <Button href={viewHref(view, { page: String(pageNum - 1) })} variant="outline" size="sm" className={TAP}>← 이전</Button>}
              <span className="text-sm text-slate-600">{pageNum} / {totalPages}</span>
              {pageNum < totalPages && <Button href={viewHref(view, { page: String(pageNum + 1) })} variant="outline" size="sm" className={TAP}>다음 →</Button>}
            </nav>
          )}
        </>
      )}
    </HospitalShell>
  );
}
