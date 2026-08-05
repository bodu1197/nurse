import HospitalShell from "@/components/HospitalShell";
import Button from "@/components/Button";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { requireProfile } from "@/lib/data/user";
import { getMyJobs } from "@/lib/data/jobs";
import JobStatusBadge from "@/components/JobStatusBadge";
import { jobState, isLive } from "@/lib/jobState";
import { FREE_WEEK_DAYS } from "@/lib/ads";
import { nowMs, fmtDate, fmtDay, listingEnd, remain } from "@/lib/date";
import { setJobStatus, deleteJob, repostJob } from "../actions";

export const metadata = { title: "공고 관리 — 널스넷", robots: { index: false } };

export default async function MyJobsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ ok?: string; error?: string }> }>) {
  const p = await requireProfile("/mypage/jobs", "hospital");
  const [{ ok, error }, jobs] = await Promise.all([searchParams, getMyJobs()]);
  const now = nowMs();

  return (
    <HospitalShell displayName={p.displayName} active="/mypage/jobs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900">공고 관리</h1>
          <Button href="/mypage/jobs/new" size="md">공고 등록</Button>
        </div>
        <p className="mt-1 text-sm text-slate-500">공고 등록은 <b className="text-teal-700">무료</b> <span className="text-slate-500">· 노출은 광고를 결제하시면 시작됩니다.</span></p>

        {ok === "1" && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">처리되었습니다.</div>}
        {/* 🔴 무료 1주는 "처리되었습니다" 로 뭉개면 안 된다 — 평생 한 번뿐인 혜택을 방금 쓴 것이라
            무엇을 받았고 무엇이 안 열리는지 그 자리에서 알려야 나중에 항의가 안 온다. */}
        {ok === "free" && (
          <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm leading-relaxed text-teal-800">
            <b>무료 {FREE_WEEK_DAYS}일 노출이 시작되었습니다.</b> 병원당 한 번만 드리는 혜택이라 다음부터는 광고를 결제하셔야 합니다.
            <span className="block text-teal-700">간호사 연락처 열람과 AI 자동매치는 유료 광고에서만 열립니다.</span>
          </div>
        )}
        {error === "1" && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">처리에 실패했습니다. 다시 시도해 주세요.</div>}
        {/* 마감일이 지난 공고는 다시 게시해도 아무 데도 안 나온다 — 예전에는 "처리되었습니다"만 뜨고
            실제로는 비노출인 채였다(침묵하는 실패). 무엇을 해야 하는지 짚어 준다. */}
        {error === "deadline" && <div role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">마감일이 이미 지난 공고입니다. 다시 게시하려면 먼저 공고를 수정해 마감일을 오늘 이후로 바꿔주세요.</div>}

        {jobs.length === 0 ? (
          <p className="py-20 text-center text-slate-500">등록한 공고가 없습니다. <a href="/mypage/jobs/new" className="font-semibold text-teal-700 hover:underline">첫 공고를 등록</a>해 보세요.</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {jobs.map((j) => {
              // 상태 판정도 종료 시각도 공용 규칙 하나로 — 배지와 안내 문구가 서로 다른 말을 하지 않게.
              const state = jobState(j, now);
              const pending = state === "pending";
              const featured = state === "featured";
              const live = isLive(state);
              const expired = state === "expired";
              const end = listingEnd(j);
              // 🔴 계산은 lib/date 의 remain() 한 곳에서만 한다 — 관리자 화면과 **같은 함수**다.
              //    각자 적어 두었을 때 여기만 올림이라 같은 광고를 "7일 남음"(병원) 과
              //    "6일 남음"(관리자) 으로 다르게 말했다. 하필 부푼 쪽이 돈 낸 사람 화면이었다.
              const leftText = remain(end, now).text;
              return (
                <li key={j.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    {/* 공개 상세는 노출 중인 공고만 연다 — 결제 대기·만료·마감을 링크로 두면 눌러서 404를 본다 */}
                    {live
                      ? <a href={`/jobs/${j.id}`} className="font-semibold text-slate-900 hover:text-teal-700">{j.title}</a>
                      : <span className="font-semibold text-slate-700">{j.title}</span>}
                    <JobStatusBadge state={state} />
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {fmtDay(j.posted_at)} 등록 · 지원자{" "}
                    <a href={`/mypage/applicants?job_id=${j.id}`} className="font-semibold text-teal-700 hover:underline">{j.applicant_count}명</a>
                    {pending && <span className="text-amber-700"> · 결제 후 게시</span>}
                    {featured && <span className="text-violet-700"> · 광고 {fmtDate(end)}까지 ({leftText})</span>}
                    {expired && <span className="text-amber-700"> · 노출 종료</span>}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button href={`/mypage/jobs/${j.id}/edit`} variant="outline" size="sm">수정</Button>
                    {pending ? (
                      <Button href={`/mypage/jobs/${j.id}/ad`} size="sm">결제하고 게시</Button>
                    ) : (
                      <>
                        <Button href={`/mypage/jobs/new?from=${j.id}`} variant="outline" size="sm">복제</Button>
                        <Button href={`/mypage/jobs/${j.id}/ad`} size="sm">{featured ? "광고 연장" : "광고 올리기"}</Button>
                        {live ? (
                          <form action={setJobStatus} className="inline">
                            <input type="hidden" name="job_id" value={j.id} />
                            <input type="hidden" name="status" value="closed" />
                            <Button type="submit" variant="outline" size="sm">마감하기</Button>
                          </form>
                        ) : expired ? (
                          // 🔴 광고가 끝난 공고에는 「다시 게시」를 걸지 않는다 — 눌러도 서버가 결제로
                          //    돌려보낼 뿐이라(repostJob) 헛걸음이다. 처음부터 결제로 보낸다.
                          <Button href={`/mypage/jobs/${j.id}/ad?error=expired`} variant="outline" size="sm">다시 게시</Button>
                        ) : (
                          <form action={repostJob} className="inline">
                            <input type="hidden" name="job_id" value={j.id} />
                            <Button type="submit" variant="outline" size="sm">다시 게시</Button>
                          </form>
                        )}
                      </>
                    )}
                    <form action={deleteJob} className="inline">
                      <input type="hidden" name="job_id" value={j.id} />
                      {/* 광고가 살아 있는 공고는 남은 기간이 그대로 사라진다 — 돈이 걸린 일이라 그 사실을 먼저 말한다.
                          대안(마감하기)이 바로 옆에 있다는 것도 같이 알린다. */}
                      <ConfirmSubmit message={featured
                        ? `이 공고는 광고가 ${leftText} 상태입니다.
삭제하면 남은 광고 기간은 환불·이전되지 않으며 지원자 정보도 함께 사라집니다.
잠시 내리기만 하려면 '마감하기'를 쓰세요.`
                        : "이 공고를 삭제할까요? 지원자 정보도 함께 사라지며 되돌릴 수 없습니다."}>삭제</ConfirmSubmit>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
    </HospitalShell>
  );
}
