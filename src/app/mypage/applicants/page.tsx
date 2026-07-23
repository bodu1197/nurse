import { redirect } from "next/navigation";
import HospitalShell from "@/components/HospitalShell";
import Button from "@/components/Button";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { getMyProfile } from "@/lib/data/user";
import { getMyJobs } from "@/lib/data/jobs";
import { getReceivedApplications, STATUS_LABEL, STATUS_TONE, CANCELABLE, LIST_LIMIT, type AppStatus, type ApplicantListItem } from "@/lib/data/applications";
import { fmtDay } from "@/lib/date";
import { updateApplicationStatus, openApplicantResume } from "../actions";

export const metadata = { title: "받은 지원자 — 널스넷", robots: { index: false } };

// 병원 화면에서는 '미확인(submitted)'만 눈에 띄어야 한다 — 나머지 색은 지원자 화면과 같은 값을 쓴다.
const TONE: Record<AppStatus, string> = { ...STATUS_TONE, submitted: "bg-amber-100 text-amber-800" };
// 터치 조작이 많은 줄이라 버튼 높이를 손가락 크기(44px)로 올린다.
const TAP = "min-h-11";
// 공고별 보기 칩 — hover만 있으면 키보드 사용자는 어디에 있는지 알 수 없다.
const CHIP = "inline-flex min-h-11 items-center rounded-full px-3 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2";
// teal-600 위의 흰 글씨는 작은 글씨(text-xs) 기준 대비가 모자란다(3.7:1) → 한 단계 진하게.
const CHIP_ON = "bg-teal-700 text-white";
const CHIP_OFF = "border border-slate-300 text-slate-600 hover:bg-slate-50";

function StatusButton({ id, jobId, status, label, variant, confirm }: Readonly<{ id: string; jobId?: string; status: AppStatus; label: string; variant: "primary" | "outline"; confirm: string }>) {
  return (
    <form action={updateApplicationStatus} className="inline">
      <input type="hidden" name="application_id" value={id} />
      <input type="hidden" name="status" value={status} />
      {/* 처리 후 보고 있던 공고 탭으로 되돌아오게 한다 */}
      {jobId && <input type="hidden" name="job_id" value={jobId} />}
      {/* 누르면 버튼이 사라져 되돌릴 수 없고 지원자에게 결과가 그대로 보인다 → 한 번 확인받는다. */}
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

function Applicant({ a, jobId }: Readonly<{ a: ApplicantListItem; jobId?: string }>) {
  const r = a.resume;
  // 아직 처리할 수 있는 상태 = 지원자가 취소할 수 있는 상태와 같다(진행 중인 건).
  const open = CANCELABLE.some((s) => s === a.status);
  return (
    <li className={`rounded-xl border bg-white p-5 ${a.status === "submitted" ? "border-amber-300" : "border-slate-200"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900">{a.job?.title ?? "공고"}</span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[a.status]}`}>{STATUS_LABEL[a.status]}</span>
      </div>

      <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm">
        {!r ? (
          <div className="text-slate-500">이력서 정보를 불러올 수 없습니다.</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-base font-bold text-slate-900">{r.name ?? "이름 미입력"}</span>
              {r.license_type && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">{r.license_type}</span>}
              {r.experience_years != null && <span className="text-slate-600">경력 {r.experience_years}년</span>}
              {r.phone ? (
                <span className="font-semibold text-slate-800">{r.phone}</span>
              ) : (
                <span className="text-xs text-red-600">연락처 미입력</span>
              )}
            </div>
            {/* 카드는 요약만. 전문은 '이력서 전문 보기'에서 — 그 행위를 열람 신호로 쓴다. */}
            <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <Field k="희망 진료과" v={r.specialties.length > 0 ? r.specialties.join(", ") : null} />
              <Field k="희망 근무지" v={r.desired_location} />
            </dl>
            {r.intro && <p className="mt-2 line-clamp-2 whitespace-pre-line text-slate-600">{r.intro}</p>}
          </>
        )}
      </div>

      {a.message && <p className="mt-2 text-sm text-slate-600">지원 메시지: {a.message}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">{fmtDay(a.created_at)} 지원</span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {r?.phone && (
            <>
              <Button href={`tel:${r.phone}`} variant="outline" size="sm" className={TAP}>전화</Button>
              <Button href={`sms:${r.phone}`} variant="outline" size="sm" className={TAP}>문자</Button>
            </>
          )}
          {/* 이력서가 없으면 열어도 되돌아오기만 한다 → 버튼 자체를 내린다 */}
          {r && (
            <form action={openApplicantResume} className="inline">
              <input type="hidden" name="application_id" value={a.id} />
              {jobId && <input type="hidden" name="job_id" value={jobId} />}
              <Button type="submit" variant="outline" size="sm" className={TAP}>이력서 전문 보기 · 인쇄</Button>
            </form>
          )}
          {open && (
            <>
              <StatusButton id={a.id} jobId={jobId} status="accepted" label="합격" variant="primary"
                confirm="이 지원자를 합격 처리할까요? 지원자 화면에 '합격'으로 표시되며 되돌릴 수 없습니다." />
              <StatusButton id={a.id} jobId={jobId} status="rejected" label="불합격" variant="outline"
                confirm="이 지원자를 불합격 처리할까요? 지원자 화면에 '불합격'으로 표시되며 되돌릴 수 없습니다." />
            </>
          )}
        </span>
      </div>
    </li>
  );
}

export default async function ApplicantsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ ok?: string; error?: string; job_id?: string }> }>) {
  const p = await getMyProfile();
  if (!p) redirect("/login");
  if (p.role !== "hospital") redirect("/mypage");
  const { ok, error, job_id } = await searchParams;
  const [jobs, apps] = await Promise.all([getMyJobs(), getReceivedApplications(job_id)]);
  const unread = apps.filter((a) => a.status === "submitted").length;

  return (
    <HospitalShell displayName={p.displayName} active="/mypage/applicants">
      <h1 className="mt-3 text-2xl font-bold text-slate-900">받은 지원자</h1>
      <p className="mt-1 text-sm text-slate-500">
        {job_id ? "이 공고" : "전체"} {apps.length}명{unread > 0 && <> · <b className="text-amber-700">아직 확인하지 않은 지원 {unread}건</b></>}
      </p>

      {jobs.length > 1 && (
        // 현재 고른 공고는 색만이 아니라 aria-current로도 알려야 화면을 못 보는 사용자가 구분할 수 있다.
        <nav aria-label="공고별 보기" className="mt-3 flex flex-wrap gap-1.5">
          <a href="/mypage/applicants" aria-current={!job_id ? "page" : undefined} className={`${CHIP} ${!job_id ? CHIP_ON : CHIP_OFF}`}>전체</a>
          {jobs.map((jb) => (
            <a key={jb.id} href={`/mypage/applicants?job_id=${jb.id}`} aria-current={job_id === jb.id ? "page" : undefined}
              className={`${CHIP} ${job_id === jb.id ? CHIP_ON : CHIP_OFF}`}>
              {/* 말줄임은 flex 컨테이너가 아니라 안쪽 텍스트에 걸어야 실제로 "…"가 붙는다 */}
              <span className="max-w-[12rem] truncate">{jb.title}</span>
            </a>
          ))}
        </nav>
      )}

      {ok === "1" && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">처리되었습니다.</div>}
      {error === "1" && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">처리에 실패했습니다. 다시 시도해 주세요.</div>}
      {error === "noresume" && <div role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">지원자가 이력서를 삭제해 열람할 수 없습니다. 연락처도 확인할 수 없습니다.</div>}

      {apps.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-slate-500">{job_id ? "이 공고에는 아직 지원자가 없습니다." : "아직 지원자가 없습니다."}</p>
          {job_id
            ? <a href="/mypage/applicants" className="mt-2 inline-block font-semibold text-teal-700 hover:underline">전체 지원자 보기 →</a>
            : <a href="/mypage/jobs" className="mt-2 inline-block font-semibold text-teal-700 hover:underline">공고 관리로 가기 →</a>}
        </div>
      ) : (
        <>
          <ul className="mt-6 space-y-3">
            {apps.map((a) => <Applicant key={a.id} a={a} jobId={job_id} />)}
          </ul>
          {apps.length === LIST_LIMIT && (
            <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              최근 {LIST_LIMIT}건만 표시했습니다.{!job_id && jobs.length > 1 && " 위의 공고별 보기로 범위를 좁혀 주세요."}
            </p>
          )}
        </>
      )}
    </HospitalShell>
  );
}
