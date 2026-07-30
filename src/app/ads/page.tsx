import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { getCurrentUser } from "@/lib/data/user";
import { LINK_CLASS } from "@/lib/constants";
import { AD_PLANS, AD_PLAN_BENEFITS, discountPct, type AdPlan } from "@/lib/adPlans";
import { won } from "@/lib/ads";

export const metadata = {
  title: "광고 상품 안내 — 널스넷",
  description:
    "널스넷 채용광고 상품 안내. VVIP · VIP · 프라임 · 스페셜 · 베스트 등급별 노출 위치와 기간별 요금, 인재 서칭과 알림 서비스를 확인하세요.",
  alternates: { canonical: "/ads" },
  openGraph: { type: "website", locale: "ko_KR", siteName: "널스넷", url: "/ads", title: "광고 상품 안내 — 널스넷" },
};

/**
 * 광고 상품 안내 — 구 널스넷 `/service_information` 을 옮긴 것이다.
 *
 * 🔴 결제 버튼을 두지 않고 **문의(/contact)** 로 보낸다. 레거시도 '광고등록 문의 신청' 이었고,
 *    여기 실린 등급제 요금(lib/adPlans.ts)과 앱의 셀프 결제 상품(lib/ads.ts)이 아직 다르기 때문이다.
 *    아직 정리되지 않은 두 가격표 중 하나를 결제창에 그냥 이어 붙이면 안내와 청구가 어긋난다.
 */
function PlanCard({ plan }: Readonly<{ plan: AdPlan }>) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <header className="border-b border-slate-100 bg-slate-50 px-5 py-4">
        <p className="text-xs font-semibold text-slate-500">{plan.group}</p>
        {/* h2 다. 페이지 h1 아래 첫 제목이라 h3 로 두면 단계가 하나 비어 화면읽기가 어긋난다. */}
        <h2 className="mt-0.5 text-lg font-bold text-slate-900">👑 {plan.name}</h2>
      </header>

      <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">광고 위치</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {plan.pc.map((p) => (
              <li key={p} className="flex gap-2"><span aria-hidden className="text-teal-600">·</span>{p}</li>
            ))}
          </ul>
          {/* 레거시는 PC·모바일 표를 따로 뒀지만 두 곳의 값이 늘 같았다 → 한 번만 적고 그렇다고 밝힌다 */}
          <p className="mt-2 text-xs text-slate-500">PC · 모바일 동일하게 노출됩니다.</p>
        </div>

        <div>
          <h3 className="text-sm font-bold text-slate-900">기간별 요금 <span className="font-normal text-slate-500">(VAT 포함)</span></h3>
          <ul className="mt-2 space-y-1.5">
            {plan.prices.map((p) => (
              <li key={p.days} className="flex items-baseline gap-2 text-sm">
                <span className="w-12 shrink-0 font-semibold text-slate-700">{p.days}일</span>
                <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-bold text-rose-600">{discountPct(p.list, p.sale)}%</span>
                <s className="text-xs text-slate-500">{won(p.list)}</s>
                <strong className="ml-auto text-base font-bold text-teal-700">{won(p.sale)}</strong>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-100 px-5 py-5">
        <h3 className="text-sm font-bold text-slate-900">제공 서비스</h3>
        <ol className="mt-2 space-y-3 text-sm text-slate-600">
          {AD_PLAN_BENEFITS.map((b, i) => (
            <li key={b.title}>
              <p className="font-semibold text-slate-700">{i + 1}. {b.title}</p>
              <div className="mt-1 space-y-0.5 pl-4 text-xs leading-relaxed text-slate-600">
                {b.lines.map((l) => <p key={l}>{l}</p>)}
                {/* 열람건수만 등급마다 다르다 — 공통 문구 뒤에 이 등급 값을 붙인다 */}
                {i === 0 && <p>열람건수 : 결제일 기준 1일 {plan.search.firstDay}건, 이후 일 {plan.search.perDay}건</p>}
              </div>
            </li>
          ))}
        </ol>
        <Link
          href="/contact"
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-teal-700 px-5 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
        >
          광고등록 문의 신청 ✎
        </Link>
      </div>
    </article>
  );
}

export default async function AdsPage() {
  const user = await getCurrentUser();
  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-900">광고 상품 안내</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          널스넷은 간호사 회원이 매일 찾는 채용 플랫폼입니다. 등급에 따라 노출 위치와 인재 서칭 열람 건수가 달라집니다.
          아래에서 상품을 고르신 뒤 문의를 남겨 주시면 담당자가 안내해 드립니다.
        </p>

        {/* 🔴 이 고지는 장식이 아니다. 아래 표에는 아직 **이 앱에 없는 것**이 섞여 있다 —
            VVIP 배너·프라임/스페셜/베스트 영역·'핫한 공고' 자리는 지금 홈에 없고(홈은 단일 목록에
            '추천' 배지 하나뿐), 휴대폰 문자 알림 2종은 발송 코드 자체가 없다(이메일 알림도 준비 중).
            구 널스넷 기준을 그대로 옮겨 둔 것이라(오너 지시 2026-07-30 "광고비 결정 후 내용 채우게
            일단 복사해서 가져와") 확정 스펙처럼 읽히면 지킬 수 없는 약속이 된다.
            상품이 확정되면 이 문단부터 지우면 된다. */}
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-relaxed text-amber-900">
          <strong className="font-bold">준비 중입니다.</strong> 아래 구성과 요금은 <strong>구 널스넷에서 운영하던 내용을
          그대로 옮겨둔 것</strong>으로, 새 널스넷의 광고 상품·요금·노출 위치는 아직 확정 전입니다.
          일부 항목(배너 노출 위치, 휴대폰 문자 알림)은 현재 제공되지 않습니다.
          확정되는 대로 이 페이지에 반영하며, 그때까지는 문의 주시면 가능한 범위로 안내해 드립니다.
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {AD_PLANS.map((plan) => <PlanCard key={plan.key} plan={plan} />)}
        </div>

        <p className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
          요금과 노출 위치는 사정에 따라 바뀔 수 있습니다. 정확한 견적과 집행 일정은{" "}
          <Link href="/contact" className={LINK_CLASS}>고객센터</Link>로 문의해 주세요.
        </p>
      </main>
    </>
  );
}
