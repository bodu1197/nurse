import type { ReactNode } from "react";
import Button from "@/components/Button";
import { toggleSaveJob, applyToJob } from "@/app/jobs/actions";
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

type Props = Readonly<{
  job: JobRow;
  profile: { displayName: string; role: Role } | null;
  applied: boolean;
  saved: boolean;
  /** 저장 후 돌아올 곳 + 로그인 후 돌아올 곳 */
  selfHref: string;
  /** 모바일에서 목록으로 돌아가는 링크. 단독 상세 페이지에서는 생략 */
  backHref?: string;
  /** ?apply= 로 넘어온 지원 실패 사유 */
  applyError?: string;
  /** 단독 상세 페이지에서는 공고 제목이 그 페이지의 h1이다(목록 옆 패널일 때는 h2). */
  asH1?: boolean;
  now: number;
}>;

export default function JobDetail({ job, profile, applied, saved, selfHref, backHref, applyError, asH1, now }: Props) {
  const loginHref = `/login?notice=apply&next=${encodeURIComponent(selfHref)}`;
  const resumeHref = `/mypage/resume?next=${encodeURIComponent(selfHref)}`;
  const Title = asH1 ? "h1" : "h2";
  // 아래 지원 영역에 "간호사 회원만 가능합니다"가 이미 떠 있을 때만 위 안내를 생략한다.
  // 그 안내는 direct + 간편지원 공고에서만 그려지므로, 조건을 그대로 맞춰야
  // 외부 공고에서 nurse_only로 되돌아온 사용자가 아무 설명도 못 보는 일이 없다.
  const roleNoticeShown =
    job.source === "direct" && job.apply_methods.includes("platform") && !!profile && profile.role !== "nurse";
  const showError = applyError === "nurse_only" && roleNoticeShown ? null : applyError;
  // 외부 공고 링크는 수집 데이터라 스킴을 신뢰하지 않는다(javascript: 등 차단).
  const externalHref = job.external_url && /^https?:\/\//i.test(job.external_url) ? job.external_url : null;

  return (
    <>
      {backHref && <a href={backHref} className="mb-3 inline-block text-sm text-teal-700 hover:underline lg:hidden">← 목록으로</a>}
      <article className="relative rounded-lg border border-slate-200 bg-white p-6">
        <form action={toggleSaveJob} className="absolute right-4 top-4">
          <input type="hidden" name="job_id" value={job.id} />
          <input type="hidden" name="next" value={selfHref} />
          <button type="submit" aria-label={saved ? "저장 해제" : "저장"} className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 ${saved ? "border-teal-200 bg-teal-50 text-teal-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
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
          {job.source === "direct" ? (
            <div className="space-y-4 sm:max-w-md">
              {job.apply_methods.includes("platform") && (
                !profile ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-slate-500">간편지원하려면 로그인이 필요합니다.</p>
                    <Button href={loginHref} size="md">로그인하고 지원</Button>
                  </div>
                ) : profile.role !== "nurse" ? (
                  <p className="rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">간편지원은 간호사 회원만 가능합니다.</p>
                ) : applied ? (
                  <div className="flex flex-col gap-2 rounded-[12px] border border-teal-200 bg-teal-50 px-4 py-3">
                    <p className="text-sm font-semibold text-teal-800">✓ 지원 완료</p>
                    <a href="/mypage/applications" className="text-sm font-semibold text-teal-700 hover:underline">지원 내역에서 확인·취소 →</a>
                  </div>
                ) : (
                  <form action={applyToJob} className="flex flex-col gap-2">
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="next" value={selfHref} />
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
          ) : !profile ? (
            <div className="flex flex-col gap-2 sm:max-w-md">
              <p className="text-sm text-slate-500">지원하려면 로그인이 필요합니다.</p>
              <Button href={loginHref} size="md">로그인하고 지원</Button>
            </div>
          ) : externalHref ? (
            <Button href={externalHref} target="_blank" rel="noopener noreferrer" size="md">
              원본 사이트에서 지원
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M7 17L17 7M7 7h10v10" /></svg>
            </Button>
          ) : (
            <p className="text-sm text-slate-500 sm:max-w-md">원본 공고 링크가 없습니다. 아래 채용 문의로 연락해 주세요.</p>
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
          {job.salary_text && (<div><dt className="text-slate-500">급여</dt><dd className="mt-0.5 font-medium text-slate-800">{job.salary_text}</dd></div>)}
          {job.shift_type && (<div><dt className="text-slate-500">근무형태</dt><dd className="mt-0.5 text-slate-800">{job.shift_type}</dd></div>)}
          {job.recruit_count ? (<div><dt className="text-slate-500">모집인원</dt><dd className="mt-0.5 text-slate-800">{job.recruit_count}명</dd></div>) : null}
          {job.source === "direct"
            ? (<div><dt className="text-slate-500">마감일</dt><dd className="mt-0.5 text-lg font-bold text-red-600">{fmtDate(listingEnd(job, now))} 마감</dd></div>)
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
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{job.apply_detail}</p>
          </>
        )}
      </article>
    </>
  );
}
