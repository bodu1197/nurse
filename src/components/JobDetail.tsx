import type { ReactNode } from "react";
import { acceptsPlatformApply } from "@/lib/applyGate";
import { isCollectedJob } from "@/lib/jobState";
import Button from "@/components/Button";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { toggleSaveJob, applyToJob } from "@/app/jobs/actions";
import { withdrawApplication } from "@/app/mypage/actions";
import { CANCELABLE, type JobApplicationState } from "@/lib/data/applications";
import FormDraft from "@/components/FormDraft";
import DraftCleaner from "@/components/DraftCleaner";
import { listingEnd, fmtDate } from "@/lib/date";
import type { JobRow } from "@/lib/data/jobs";
import type { Role } from "@/lib/data/role";

// 공고 상세 — 목록 옆 패널(/jobs)과 단독 상세 페이지(/jobs/[id])가 같은 화면을 쓴다.
// 두 곳이 갈라지면 한쪽만 고쳐지는 사고가 나므로 마크업은 여기 한 곳에만 둔다.

// 저장(북마크) 아이콘 — 저장 시 채움.
export function SaveIcon({ filled }: Readonly<{ filled: boolean }>) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 3h12a1 1 0 011 1v17l-7-4-7 4V4a1 1 0 011-1z" />
    </svg>
  );
}

function Stars({ rating }: Readonly<{ rating: number }>) {
  return (
    <span className="inline-flex items-center gap-1 text-amber-500" aria-label={`평점 ${rating}`}>
      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 15l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
      </svg>
      <span className="font-semibold text-slate-700">{rating.toFixed(1)}</span>
    </span>
  );
}

/**
 * 지원 폼의 실패 코드 — jobs/actions.ts 의 fail() 이 ?apply= 로 실어 보낸다(?error= 가 아니다).
 * 이력서를 채우러 갔다 오는 need_resume·need_contact 가 바로 초안이 살아 있어야 하는 경우다.
 */
const APPLY_ERROR_CODES = ["need_resume", "need_contact", "dup", "closed", "nurse_only", "admin_test", "error"] as const;

function Notice({ danger, children }: Readonly<{ danger?: boolean; children: ReactNode }>) {
  return (
    <p role="alert" className={`rounded-[12px] border px-4 py-3 text-sm ${danger ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
      {children}
    </p>
  );
}

// 지원 실패 안내 — 지원 폼 **밖에** 둔다.
// 폼 안에 두면 '이미 지원함'·'마감'처럼 폼 자체가 사라지는 사유는 화면에 아무것도 안 뜨고,
// 사용자는 버튼을 눌렀는데 아무 반응이 없는 것으로 보게 된다.
function ApplyError({ code, resumeHref }: Readonly<{ code: string; resumeHref: string }>) {
  if (code === "need_resume")
    return <Notice>지원하려면 이력서를 먼저 등록하세요. <a href={resumeHref} className="font-semibold underline">이력서 작성하기</a></Notice>;
  if (code === "need_contact")
    return <Notice>이력서에 <b>이름과 휴대폰 번호</b>가 있어야 병원이 연락할 수 있습니다. <a href={resumeHref} className="font-semibold underline">이력서에서 입력하기</a></Notice>;
  if (code === "closed")
    return <Notice>이미 마감되었거나 노출 기간이 끝난 공고입니다.</Notice>;
  if (code === "dup")
    return <Notice>이미 지원한 공고입니다. <a href="/mypage/applications" className="font-semibold underline">지원 내역 보기</a></Notice>;
  if (code === "nurse_only")
    return <Notice>간편지원은 간호사 회원만 가능합니다.</Notice>;
  if (code === "admin_test")
    return <Notice>관리자 계정은 테스트 병원 공고에만 지원할 수 있습니다(실제 병원에 가짜 지원 방지).</Notice>;
  // 모르는 코드도 조용히 넘기지 않는다 — 아무 안내 없이 버튼만 되돌아오는 상황을 만들지 않기 위해.
  return <Notice danger>지원 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.</Notice>;
}

/**
 * 워크넷 수집 공고 — 원본 공고에서 지원.
 *
 * 🔴 조건은 그대로 둔다(로그인 → 이력서 → 지원). 오너 지시 2026-08-04 는 **설명 문구를 없애고
 *    버튼 글자로 말하라**는 것이다. 긴 안내문 대신 버튼이 다음에 할 일을 그대로 적는다:
 *    로그인 전 "로그인하고 지원" · 이력서 없으면 "이력서 작성하기" · 다 되면 "원본에서 지원하기".
 */
function ExternalApply({
  href, profile, hasResume, loginHref, resumeHref, hasContact,
}: Readonly<{
  href: string | null;
  profile: { role: Role } | null;
  hasResume: boolean;
  loginHref: string;
  resumeHref: string;
  hasContact: boolean;
}>) {
  // 링크가 없으면 나갈 곳 자체가 없다. 연락처가 있을 때만 그걸 가리킨다
  // (전에는 연락처가 없어도 "아래 채용 문의로 연락하세요"라고 해서 없는 곳을 가리켰다).
  if (!href) {
    return (
      <p className="text-sm text-slate-500 sm:max-w-md">
        {hasContact
          ? "원본 공고 링크가 확인되지 않았습니다. 아래 채용 문의로 연락해 주세요."
          : "원본 공고 링크가 확인되지 않았습니다. 이 공고는 지금 지원 경로를 안내할 수 없습니다."}
      </p>
    );
  }
  if (!profile) return <Button href={loginHref} size="md" className="self-start">로그인하고 지원</Button>;
  if (profile.role !== "nurse")
    return <p className="text-sm text-slate-500 sm:max-w-md">간호사 회원 전용입니다.</p>;
  if (!hasResume) return <Button href={resumeHref} size="md" className="self-start">이력서 작성하기</Button>;
  return (
    <Button href={href} target="_blank" rel="noopener noreferrer" size="md" className="self-start">
      원본에서 지원하기
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M7 17L17 7M7 7h10v10" /></svg>
    </Button>
  );
}

type Props = Readonly<{
  job: JobRow;
  profile: { displayName: string; role: Role; email: string } | null;
  /** 이 공고에 넣어둔 내 지원(없으면 null). 취소를 여기서 바로 하려고 id·상태까지 받는다. */
  application: JobApplicationState | null;
  saved: boolean;
  /** 저장 후 돌아올 곳 + 로그인 후 돌아올 곳 */
  selfHref: string;
  /** 모바일에서 목록으로 돌아가는 링크. 단독 상세 페이지에서는 생략 */
  backHref?: string;
  /**
   * 이 사람이 이력서를 등록했는가(간호사일 때만 의미 있음).
   * 외부 수집 공고(워크넷)는 **이력서를 등록한 간호사 회원만** 원본 사이트로 나갈 수 있다(오너 확정 2026-07-30).
   */
  hasResume?: boolean;
  /** 이 공고가 지금 보는 병원 계정의 것인가. 자기 공고에는 자격 안내 대신 관리 링크를 보인다. */
  isMyJob?: boolean;
  /** 방금 이 화면에서 지원을 취소했는가(?ok=cancel) */
  cancelled?: boolean;
  /** ?apply= 로 넘어온 지원 실패 사유 */
  applyError?: string;
  /** 단독 상세 페이지에서는 공고 제목이 그 페이지의 h1이다(목록 옆 패널일 때는 h2). */
  asH1?: boolean;
}>;

export default function JobDetail({ job, profile, application, saved, selfHref, backHref, applyError, cancelled, hasResume, isMyJob, asH1 }: Props) {
  const loginHref = `/login?notice=apply&next=${encodeURIComponent(selfHref)}`;
  const resumeHref = `/mypage/resume?next=${encodeURIComponent(selfHref)}`;
  // 🔴 이 사이트에서 '간호회원' 은 **이력서를 등록한 간호사** 다(오너 정의 2026-08-04).
  //    로그인만 한 사람은 아직 간호회원이 아니다 — 리뷰·게시판도 같은 기준을 쓴다(getCommunityAccess).
  const isNurseMember = !!profile && profile.role === "nurse" && !!hasResume;
  // 전형·접수 원문에는 담당자 이메일·전화가 들어 있어 연락처와 같은 등급으로 가린다. 내 공고는 예외.
  const canSeeApplyDetail = !!isMyJob || isNurseMember;
  const Title = asH1 ? "h1" : "h2";
  // 아래 지원 영역에 "간호사 회원만 가능합니다"가 이미 떠 있을 때만 위 안내를 생략한다.
  // 그 안내는 direct + 간편지원 공고에서만 그려지므로, 조건을 그대로 맞춰야
  // 외부 공고에서 nurse_only로 되돌아온 사용자가 아무 설명도 못 보는 일이 없다.
  // 🔴 자기 공고면 그 안내가 안 뜬다 — 안 뜨는데 뜬 셈 치면 nurse_only 로 되돌아온 사람이
  //    아무 설명도 못 본다.
  const roleNoticeShown =
    acceptsPlatformApply(job) && !!profile && profile.role !== "nurse" && !isMyJob;
  const showError = applyError === "nurse_only" && roleNoticeShown ? null : applyError;
  // 외부 공고 링크는 수집 데이터라 스킴을 신뢰하지 않는다(javascript: 등 차단).
  const externalHref = job.external_url && /^https?:\/\//i.test(job.external_url) ? job.external_url : null;
  // 🔴 초안 키에 **계정**을 넣는다. 공고 id 만 쓰면 같은 PC 에서 다음 사람이 같은 공고를 열었을 때
  //    앞사람이 쓰던 지원 메시지가 그 사람 칸에 복원된다(다른 초안은 전부 이메일을 넣고 있다).
  const applyDraftKey = profile ? `nursenet:draft:apply:${profile.email}:${job.id}` : "";

  return (
    <>
      {backHref && <a href={backHref} className="mb-3 inline-block text-sm text-teal-700 hover:underline lg:hidden">← 목록으로</a>}
      <article className="relative rounded-lg border border-slate-200 bg-white p-6">
        <form action={toggleSaveJob} className="absolute right-4 top-4">
          <input type="hidden" name="job_id" value={job.id} />
          <input type="hidden" name="next" value={selfHref} />
          <button type="submit" aria-label={saved ? "저장 해제" : "저장"} className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 ${saved ? "border-teal-200 bg-teal-50 text-teal-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
            <SaveIcon filled={saved} /> {saved ? "저장됨" : "저장"}
          </button>
        </form>
        <Title className="pr-24 text-2xl font-bold leading-snug text-slate-900">{job.title}</Title>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {job.hospital ? (
            <a href="/reviews" className="inline-flex items-center gap-1 font-medium text-teal-700 hover:underline">
              {job.hospital.name}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M7 17L17 7M7 7h10v10" /></svg>
            </a>
          ) : (
            // 워크넷 등 명부에 없는 광고 — 회사명만 표시(리뷰 대상 아님).
            <span className="font-medium text-slate-700">{job.company_name ?? "병원 미상"}</span>
          )}
          {Number(job.hospital?.rating_avg) > 0 && (
            <>
              <Stars rating={Number(job.hospital?.rating_avg)} />
              <span className="text-xs text-slate-500">리뷰 {job.hospital?.rating_count}</span>
            </>
          )}
          {job.source === "direct" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">✓ 사업자 인증 병원</span>
          )}
        </div>
        <div className="mt-1 text-slate-600">{job.location}</div>
        <div className="text-slate-600">{[job.employment_type, job.salary_text].filter(Boolean).join(" · ")}</div>

        {showError && (
          <div className="mt-4 sm:max-w-md">
            <ApplyError code={showError} resumeHref={resumeHref} />
          </div>
        )}

        <div className="mt-4">
          {/* 🔴 여기 조건은 `job.source !== "worknet"` 이라고 **손으로 다시 적혀 있었다** — 바로 위
              주석이 "판정은 applyGate 한 곳"이라고 말하면서 실제로는 아니었다. 그래서 잡알리오
              수집분(public_data)을 붙이자마자 이 화면만 「간편지원하려면 로그인이 필요합니다」를
              띄웠다(실측 2026-08-11). 접수를 우리가 하지도 않는 공고에 지원 버튼을 보이는 것은
              간호사에게 거짓말이다 — 판정은 lib/jobState 의 isCollectedJob 하나만 쓴다. */}
          {!isCollectedJob(job.source) ? (
            <div className="space-y-4 sm:max-w-md">
              {job.apply_methods.includes("platform") && (
                !profile ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-slate-500">간편지원하려면 로그인이 필요합니다.</p>
                    <Button href={loginHref} size="md">로그인하고 지원</Button>
                  </div>
                ) : isMyJob ? (
                  // 🔴 내가 낸 공고다. 자격 미달을 통보할 자리가 아니라 관리로 가는 자리다(오너 지적 2026-08-04).
                  <div className="flex flex-col gap-2 rounded-[12px] border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-700">내 공고입니다. 간호사에게는 여기에 간편지원 버튼이 보입니다.</p>
                    <a href={`/mypage/jobs/${job.id}`} className="text-sm font-semibold text-teal-700 hover:underline">공고 관리 →</a>
                  </div>
                ) : profile.role !== "nurse" ? (
                  <p className="rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">간편지원은 간호사 회원만 가능합니다.</p>
                ) : application ? (
                  // 취소를 여기서 바로 하게 둔다. 전에는 지원 내역으로 가는 링크뿐이라, 마음이 바뀐
                  // 사람이 취소하려면 화면을 옮겨야 했다(구 널스넷에서 이게 이탈 원인 — 오너 확인).
                  <div className="flex flex-col gap-2 rounded-[12px] border border-teal-200 bg-teal-50 px-4 py-3">
                    {/* 지원이 접수됐으면 그 공고의 메시지 초안은 역할이 끝났다 — 개인정보를 더 두지 않는다.
                        (지원 성공은 /mypage/applications 로 나가므로 그 화면에서는 지울 기회가 없다) */}
                    {applyDraftKey && <DraftCleaner keys={[applyDraftKey]} />}
                    <p className="text-sm font-semibold text-teal-800">✓ 지원 완료</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <a href="/mypage/applications" className="text-sm font-semibold text-teal-700 hover:underline">지원 내역 보기 →</a>
                      {CANCELABLE.some((st) => st === application.status) && (
                        <form action={withdrawApplication} className="ml-auto">
                          <input type="hidden" name="application_id" value={application.id} />
                          <input type="hidden" name="next" value={selfHref} />
                          <ConfirmSubmit className="min-h-11" message="이 지원을 취소할까요? 취소 후 같은 공고에 다시 지원할 수 있습니다.">
                            지원 취소
                          </ConfirmSubmit>
                        </form>
                      )}
                    </div>
                  </div>
                ) : (
                  // 방금 취소했다면 그 사실을 지원 폼 **위에** 붙인다. 배타 분기로 두면 "다시 지원할 수
                  // 있다"고 말해놓고 정작 폼이 사라진다.
                  <form action={applyToJob} className="flex flex-col gap-2">
                    {cancelled && (
                      <p role="status" className="rounded-[12px] border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        지원을 취소했습니다. 마음이 바뀌면 여기서 다시 지원할 수 있습니다.
                      </p>
                    )}
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="next" value={selfHref} />
                    {/* 지원 메시지도 임시 보관한다 — 세션이 끊기거나 이력서를 채우러 다녀오면
                        쓰던 글이 통째로 사라졌다(공고별로 따로 담는다). */}
                    <FormDraft storageKey={applyDraftKey} ownErrors={APPLY_ERROR_CODES} errorParam="apply" />
                    <textarea name="message" rows={2} maxLength={500} placeholder="지원 메시지 (선택)" className="w-full resize-none rounded-[12px] border border-slate-300 p-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40" />
                    <Button type="submit" size="md">간편지원</Button>
                  </form>
                )
              )}
              {job.apply_methods.includes("email") && (
                <div className="rounded-[12px] border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-700">이메일로 지원</p>
                  {profile ? (
                    job.apply_email
                      ? <a href={`mailto:${job.apply_email}`} className="mt-1 inline-block font-semibold text-teal-700 hover:underline">{job.apply_email}</a>
                      : <p className="mt-1 text-sm text-slate-500">이메일 미등록 — 채용 문의로 연락하세요.</p>
                  ) : (
                    <a href={loginHref} className="mt-1 inline-block text-sm font-semibold text-teal-700 hover:underline">로그인 후 이메일 확인</a>
                  )}
                </div>
              )}
              {job.apply_methods.includes("offline") && (
                <div className="rounded-[12px] border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-700">우편·방문·전화 접수</p>
                  {profile ? (
                    job.apply_detail
                      ? <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{job.apply_detail}</p>
                      : <p className="mt-1 text-sm text-slate-500">접수 안내 미등록 — 채용 문의로 연락하세요.</p>
                  ) : (
                    <a href={loginHref} className="mt-1 inline-block text-sm font-semibold text-teal-700 hover:underline">로그인 후 접수 안내 확인</a>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ── 수집 공고(워크넷·잡알리오) ────────────────────────────
               오너 확정 2026-07-30: 접수는 우리가 하지 않는다. 원본으로 보내는 것이 전부이고,
               이력서를 등록한 간호사 회원만 나갈 수 있다.
               🔴 2026-08-04: 설명 문구는 전부 뺐다. 버튼 글자가 다음에 할 일을 그대로 말한다. */
            <ExternalApply
              href={externalHref}
              profile={profile}
              hasResume={!!hasResume}
              loginHref={loginHref}
              resumeHref={resumeHref}
              hasContact={!!(job.manager_name || job.manager_phone)}
            />
          )}
        </div>

        {(job.manager_name || job.manager_phone) && (
          <div className="mt-4 rounded-[12px] border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-700">채용 문의</p>
            {profile ? (
              <>
                {job.manager_name && <p className="mt-1 text-slate-600">{job.manager_name}</p>}
                {job.manager_phone && (
                  <a href={`tel:${job.manager_phone}`} className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-lg font-bold text-red-600 hover:underline">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M22 16.92v3a2 2 0 01-2.18 2 19.8 19.8 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z" /></svg>
                    {job.manager_phone}
                  </a>
                )}
              </>
            ) : (
              <>
                {job.manager_name && <p className="mt-1 tracking-widest text-slate-500">담당자 ******</p>}
                {job.manager_phone && <p className="mt-1 tracking-widest text-slate-500">전화 ***-****-****</p>}
                <a href={loginHref} className="mt-1 inline-block font-semibold text-teal-700 hover:underline">로그인 후 연락처 확인</a>
              </>
            )}
          </div>
        )}

        <hr className="my-5 border-slate-100" />

        <h3 className="font-bold text-slate-900">채용 상세 정보</h3>
        <dl className="mt-3 space-y-2 text-sm">
          {job.employment_type && (<div><dt className="text-slate-500">채용공고 유형</dt><dd className="mt-0.5"><span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">{job.employment_type}</span></dd></div>)}
          {job.specialty && (<div><dt className="text-slate-500">진료과</dt><dd className="mt-0.5 text-slate-800">{job.specialty}</dd></div>)}
          {/* 🔴 급여는 **항상 보여 준다.** 목록 카드는 값이 없을 때 「급여 협의」로 받는데
              상세만 행을 통째로 감추면, 카드에서 본 항목이 눌러 들어가면 사라진다. */}
          <div><dt className="text-slate-500">급여</dt><dd className="mt-0.5 font-medium text-slate-800">{job.salary_text ?? "급여 협의"}</dd></div>
          {job.shift_type && (<div><dt className="text-slate-500">근무형태</dt><dd className="mt-0.5 text-slate-800">{job.shift_type}</dd></div>)}
          {job.recruit_count ? (<div><dt className="text-slate-500">모집인원</dt><dd className="mt-0.5 text-slate-800">{job.recruit_count}명</dd></div>) : null}
          {job.source === "direct"
            ? (<div><dt className="text-slate-500">마감일</dt><dd className="mt-0.5 text-lg font-bold text-red-600">{fmtDate(listingEnd(job))} 마감</dd></div>)
            : job.deadline ? (<div><dt className="text-slate-500">마감일</dt><dd className="mt-0.5 text-lg font-bold text-red-600">{job.deadline.replace(/-/g, ".")} 마감</dd></div>) : null}
        </dl>

        {job.location && (
          <>
            <h3 className="mt-5 font-bold text-slate-900">지역</h3>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-700">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-500" aria-hidden><path d="M12 21s-7-6.3-7-11a7 7 0 1114 0c0 4.7-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
              {job.location}
            </p>
          </>
        )}

        {job.description && (
          <>
            <h3 className="mt-5 font-bold text-slate-900">상세 직무 내용</h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{job.description}</p>
          </>
        )}

        {job.benefits.length > 0 && (
          <>
            <h3 className="mt-5 font-bold text-slate-900">복리후생</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {job.benefits.map((b) => (<span key={b} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{b}</span>))}
            </div>
          </>
        )}

        {job.source !== "direct" && job.apply_detail && (
          <>
            <h3 className="mt-5 font-bold text-slate-900">전형·접수</h3>
            {/* 🔴 이 안에 담당자 이메일·전화가 그대로 들어 있다(수집 원문 그대로다):
                "접수방법: 자사채용사이트(isearching@daum.net),기타(전화필수)".
                로그인 없이 누구나 볼 수 있었다 — 연락처를 가려놓고 같은 값을 여기서 흘리고 있었다.
                간호회원(=이력서를 등록한 간호사)에게만 보인다(오너 지시 2026-08-04). 내 공고는 예외. */}
            {canSeeApplyDetail ? (
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{job.apply_detail}</p>
            ) : (
              <div className="mt-2 flex flex-col items-start gap-2 rounded-[12px] border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm text-slate-500">간호회원만 볼 수 있습니다.</p>
                {!profile
                  ? <Button href={loginHref} size="md">로그인하고 지원</Button>
                  : profile.role === "nurse" && <Button href={resumeHref} size="md">이력서 작성하기</Button>}
              </div>
            )}
          </>
        )}
      </article>
    </>
  );
}
