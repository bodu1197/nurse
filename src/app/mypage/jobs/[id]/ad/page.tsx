import Link from "next/link";
import { redirect } from "next/navigation";
import HospitalShell from "@/components/HospitalShell";
import AdPurchase from "@/components/AdPurchase";
import { getMyProfile } from "@/lib/data/user";
import { getMyJob, getMyAdCash, canUseFreeWeek } from "@/lib/data/jobs";
import { iamportReady } from "@/lib/iamport";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { AD_PRODUCTS, won } from "@/lib/ads";
import { LINK_CLASS } from "@/lib/constants";
import { todayKst, nowMs, fmtDay, DAY_MS } from "@/lib/date";
import { activateAdFree } from "@/app/mypage/ads/actions";

export const metadata = { title: "공고 광고 — 널스넷", robots: { index: false } };
// 결제 준비가 포트원 조회를 탈 수 있다 — 기본 함수 타임아웃에 걸려 통째로 죽지 않게 한다.
export const maxDuration = 30;

export default async function AdPage({ params, searchParams }: Readonly<{ params: Promise<{ id: string }>; searchParams: Promise<{ weeks?: string; error?: string }> }>) {
  const p = await getMyProfile();
  if (!p) redirect("/login");
  if (p.role !== "hospital") redirect("/mypage");
  const { id } = await params;
  const { weeks, error } = await searchParams;
  const initialWeeks = AD_PRODUCTS.find((pr) => String(pr.weeks) === weeks)?.weeks ?? AD_PRODUCTS[0].weeks;
  const job = await getMyJob(id);
  if (!job) redirect("/mypage/jobs");
  const ready = iamportReady();
  const adCash = await getMyAdCash();
  // 🎁 무료 1주를 아직 안 썼는가 — 카드를 보여줄지만 정한다. 실제 지급 판정은 DB(claim_free_week)다.
  //    이미 노출 중인 공고에는 무료를 얹지 않으므로(1회뿐인 혜택을 남은 기간 위에 겹치게 된다)
  //    여기서도 같은 조건으로 카드를 감춘다 — 보이는데 눌러야 거절당하는 길을 만들지 않는다.
  const adLive = !!job.featured_until && Date.parse(job.featured_until) > nowMs();
  const freeAvailable = !adLive && (await canUseFreeWeek());
  const expiredDeadline = !!job.deadline && job.deadline < todayKst(nowMs());
  // 마감일까지 남은 일수. 광고 기간이 이 값을 넘으면 넘는 만큼은 노출되지 않는다.
  // 🔴 **내림**이다 — lib/date 의 remain() 과 같은 규칙. 올림(+1)으로 두면 오늘 23:50 마감인
  //    공고에도 "1일 뒤 멈춥니다" 라고 적혀 하루가 더 있는 것처럼 읽힌다.
  const deadlineEnd = job.deadline ? Date.parse(`${job.deadline}T23:59:59+09:00`) : Number.NaN;
  const daysToDeadline = Number.isNaN(deadlineEnd) ? null : Math.floor((deadlineEnd - nowMs()) / DAY_MS);

  return (
    <HospitalShell displayName={p.displayName} active="/mypage/jobs">
      <h1 className="mt-3 text-2xl font-bold text-slate-900">공고 광고 올리기</h1>
      <p className="mt-1 text-sm text-slate-500">공고: <b className="text-slate-700">{job.title}</b> · 기간을 선택해 결제하면 상단에 노출됩니다.</p>
      {/* 광고가 끝난 공고에서 「다시 게시」를 누르면 여기로 온다 — 무료로 되살리는 길은 없다. */}
      {error === "expired" && (
        <p role="alert" className="mt-3 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          광고 기간이 끝난 공고입니다. 기간을 선택해 결제하시면 다시 노출됩니다.
        </p>
      )}
      {adCash > 0 && (
        <p className="mt-3 text-sm text-slate-600">보유 광고 캐시 <b className="text-teal-700">{won(adCash)}</b> — 결제할 때 먼저 차감됩니다.</p>
      )}

      {/* 🔴 마감일이 지난 공고에는 광고를 팔지 않는다. 결제해도 노출 판정(is_live)이 마감일로
          먼저 걸러서 **한 번도 안 보이는** 광고가 되고, 환불은 없다(약관 제9조).
          「다시 게시」가 마감일 지난 공고도 이 화면으로 보내기 때문에 여기서 반드시 막아야 한다.
          서버(prepareAdOrder)도 같은 검사를 한다 — 조작된 POST 로 이 화면을 건너뛸 수 있다. */}
      {expiredDeadline ? (
        <div className="mt-6 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-relaxed text-amber-900">
          <b>마감일({job.deadline ? fmtDay(job.deadline) : "-"})이 이미 지났습니다.</b> 지금 결제해도 이 공고는 목록에 나오지 않습니다.
          먼저 <Link href={`/mypage/jobs/${job.id}/edit`} className={LINK_CLASS}>공고 수정</Link>에서 마감일을
          오늘 이후로 바꾸신 뒤 결제해 주세요.
        </div>
      ) : ready ? (
        <AdPurchase jobId={job.id} initialWeeks={initialWeeks} adCash={adCash} freeAvailable={freeAvailable} deadlineText={job.deadline ? fmtDay(job.deadline) : null} daysToDeadline={daysToDeadline} impCode={process.env.NEXT_PUBLIC_IAMPORT_CODE ?? ""} pg={process.env.NEXT_PUBLIC_IAMPORT_PG ?? "html5_inicis"} />
      ) : (
        <div className="mt-6 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          광고 결제는 준비 중입니다(도메인 연결 후 오픈).{job.status === "draft" ? " 이 공고는 결제 시 게시됩니다 — 그전까지 '결제 대기' 상태로 보관됩니다." : ""}
        </div>
      )}

      {/* 🔴 마감일이 지났으면 관리자 테스트도 막는다. 안 막으면 4주를 적용해 놓고도 구직자
          화면 어디에도 안 나와서, 테스트가 성공한 것처럼 보이지만 확인할 수 있는 것이 없다. */}
      {p.isAdmin && !expiredDeadline && (
        <form action={activateAdFree} className="mt-6 rounded-[12px] border border-slate-300 bg-slate-100 p-4">
          <input type="hidden" name="job_id" value={job.id} />
          <p className="text-sm font-semibold text-slate-800">관리자 테스트 — 결제 없이 광고 적용</p>
          <p className="mt-0.5 text-xs text-slate-600">노출기간·영수증까지 실제와 동일하게 생성됩니다. 매출 오염 방지를 위해 주문 금액은 0원으로 기록됩니다.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {AD_PRODUCTS.map((pr) => (
              <ConfirmSubmit key={pr.weeks} name="weeks" value={pr.weeks} size="md" variant="outline" className="focus-visible:ring-offset-slate-100"
                message={`결제 없이 ${pr.weeks}주(${pr.days}일) 광고를 적용합니다. 공고가 실제로 상단 노출되고 주문은 0원으로 기록되며, 되돌릴 수 없습니다. 계속할까요?`}>
                {pr.weeks}주 적용 <span className="font-normal">(정가 {won(pr.amount)})</span>
              </ConfirmSubmit>
            ))}
          </div>
        </form>
      )}
    </HospitalShell>
  );
}
