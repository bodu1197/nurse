import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import { getMyProfile } from "@/lib/data/user";
import { LINK_CLASS } from "@/lib/constants";
import { AD_PRODUCTS, AD_WEEK_PRICE, SIGNUP_AD_CASH, won } from "@/lib/ads";
import { RESUME_PUBLIC_SCOPE } from "@/lib/resumeOptions";

/**
 * 광고 상품 안내.
 *
 * 🔴 이 페이지는 **이 사이트가 실제로 파는 것만** 적는다(오너 지시 2026-08-05).
 *    종전에는 구 널스넷 `/service_information` 원문(VVIP~베스트 등급제, 41,400~528,000원)을
 *    통째로 옮겨 두고 "준비 중" 딱지를 붙여 놨었다. 거기 적힌 것 중 이 앱에 있는 것이 거의 없었다 —
 *    VVIP 배너·프라임/스페셜/베스트 영역·'핫한 공고' 자리는 화면에 없고, 휴대폰 문자 알림 2종은
 *    발송 코드 자체가 없다. 지킬 수 없는 약속을 적어 두면 문의가 올 때마다 말을 바꿔야 한다.
 *
 * 🔒 숫자는 **한 곳에서만** 온다 — 요금·가입 캐시는 lib/ads(결제창이 쓰는 그 값),
 *    인재정보 공개 범위는 lib/resumeOptions. 여기에 손으로 옮겨 적으면 값을 바꿨을 때
 *    안내와 청구가 어긋난다(그게 종전 페이지가 "준비 중" 이어야 했던 이유다).
 */

const TITLE = "채용광고 안내 — 널스넷";
// 🔴 금액을 손으로 적지 않는다 — 값을 바꾸면 검색결과 설명만 옛 가격으로 남는다.
const DESC =
  `간호사 채용광고 1주 ${won(AD_WEEK_PRICE)}, 길게 하실수록 주당 단가가 내려갑니다. 병원 회원가입 시 광고 캐시 ${won(SIGNUP_AD_CASH)}을 드립니다. 광고 중에는 목록 상단에 노출되고, 이력서를 공개한 간호사의 연락처 열람과 AI 자동매치 인재 추천이 열립니다.`;

export const metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/ads" },
  openGraph: { type: "website", locale: "ko_KR", siteName: "널스넷", url: "/ads", title: TITLE, description: DESC },
};

/** 광고를 하면 실제로 달라지는 것 — 코드에 있는 기능만 적는다. */
const BENEFITS = [
  {
    icon: "↑",
    title: "채용공고 목록 맨 위",
    body: "광고 중인 공고가 목록 상단에 먼저 나옵니다. 널스넷 공고의 대부분은 워크넷에서 모아 온 것이라, 광고를 올리지 않으면 그 사이에 묻힙니다.",
  },
  {
    icon: "👤",
    title: "간호사 연락처 열람",
    body: `이력서를 공개한 간호사의 ${RESUME_PUBLIC_SCOPE.advertiser}를 봅니다. 지원을 기다리지 않고 먼저 연락할 수 있습니다.`,
  },
  {
    icon: "✦",
    title: "AI 자동매치로 인재 추천",
    body: "게재 중인 공고의 진료과·지역에 맞는 간호사를 자동으로 모아 보여 드립니다. 조건에 맞는 이력서가 새로 등록되면 그 자리에 자동으로 나타납니다.",
  },
] as const;

export default async function AdsPage() {
  const profile = await getMyProfile();
  // 병원 회원이면 바로 공고 등록으로, 아니면 병원 회원 안내로 보낸다.
  const ctaHref = profile?.role === "hospital" ? "/mypage/jobs/new" : "/hospital";
  const ctaLabel = profile?.role === "hospital" ? "공고 등록하기" : "병원 회원가입 · 공고등록";

  return (
    <>
      <SiteHeader user={profile ? { displayName: profile.displayName } : null} />
      {/* 🔴 폭은 다른 주요 화면(홈·채용공고·인재정보·자동매치·마이페이지)과 **같은 1280px** 다.
          종전에는 여기만 max-w-5xl(1024px)이라, 같은 레이아웃인데 혼자 좁아 보여 이질감이 있었다
          (오너 지적 2026-08-05). 약관·FAQ 처럼 읽기만 하는 문서는 좁게 두는 게 맞지만
          이 페이지는 카드·표가 늘어선 화면이라 그쪽이 아니다. */}
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">채용광고 안내</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
          <b className="text-slate-900">1주 {won(AD_WEEK_PRICE)}</b>, 광고 중에만 목록 상단에 노출됩니다. 병원 회원가입 시{" "}
          <b className="text-slate-900">광고 캐시 {won(SIGNUP_AD_CASH)}</b>을 드리니 첫 1주는{" "}
          <b className="text-slate-900">{won(AD_WEEK_PRICE - SIGNUP_AD_CASH)}</b>입니다.
        </p>

        {/* ── 광고 유무의 차이 ───────────────────────────── */}
        <section className="mt-8">
          <h2 className="text-lg font-bold text-slate-900">광고를 올렸을 때와 올리지 않았을 때</h2>
          {/* 표는 칸이 셋뿐이라 1280px 를 다 쓰면 값 사이가 벌어져 읽기 나빠진다 — 읽기 폭으로 묶는다. */}
          <div className="mt-3 max-w-3xl overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="py-2.5 pr-4 font-semibold text-slate-500">　</th>
                  <th className="py-2.5 pr-4 font-semibold text-slate-700">광고 없음</th>
                  <th className="py-2.5 font-semibold text-teal-700">광고 중</th>
                </tr>
              </thead>
              <tbody className="text-slate-600">
                {[
                  // 🔴 "무료 7일" 칸은 없앴다(오너 확정 2026-08-05: "완전 무료 광고는 없애라").
                  //    공고 작성·보관은 여전히 공짜지만, **노출되는 순간부터는 광고다.**
                  ["공고 작성 · 보관", "○", "○"],
                  ["목록 노출", "✕", "○ (상단 우선)"],
                  ["지원 접수 · 지원자 관리", "✕", "○"],
                  ["간호사 연락처 열람", "✕", "○"],
                  ["AI 자동매치 인재 추천", "✕", "○"],
                ].map(([label, free, paid]) => (
                  <tr key={label} className="border-b border-slate-100">
                    <th scope="row" className="py-2.5 pr-4 text-left font-medium text-slate-700">{label}</th>
                    <td className="py-2.5 pr-4">{free}</td>
                    <td className="py-2.5 font-semibold text-slate-800">{paid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* 🔴 이 한 줄이 이 페이지에서 제일 중요하다 — 열람 자격은 '공고를 냈는가'가 아니라
              '돈을 냈는가'로 갈린다(lib/data/membership 의 hasLiveAd). 여기서 얼버무리면
              캐시만 쓴 줄 알았던 병원이 인재정보를 열려다 막히고 그때 처음 알게 된다. */}
          <p className="mt-3 max-w-3xl text-sm text-slate-500">
            간호사 연락처 열람과 AI 자동매치 인재 추천은 <b className="text-slate-700">결제한 광고가 노출되는 동안</b>{" "}
            열리고, 광고 기간이 끝나면 함께 닫힙니다.
          </p>
        </section>

        {/* ── 요금 ─────────────────────────────────────── */}
        <section className="mt-10">
          <h2 className="text-lg font-bold text-slate-900">요금</h2>
          <p className="mt-1 text-sm text-slate-600">
            1주 <b className="text-slate-800">{won(AD_WEEK_PRICE)}</b>(부가세 포함)에서 시작하고,{" "}
            <b className="text-slate-800">기간이 길수록 주당 단가가 내려갑니다.</b> 병원 회원이 되면{" "}
            <b className="text-slate-800">광고 캐시 {won(SIGNUP_AD_CASH)}</b>이 한 번 지급되어 결제할 때 먼저 쓰입니다 —
            첫 1주는 <b className="text-slate-800">{won(AD_WEEK_PRICE - SIGNUP_AD_CASH)}</b>만 내시면 됩니다.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            {AD_PRODUCTS.map((p) => (
              <article
                key={p.weeks}
                className={`flex flex-col rounded-2xl border bg-white p-5 ${p.saved > 0 ? "border-teal-300 shadow-sm" : "border-slate-200"}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-lg font-bold text-slate-900">{p.days}일 노출</h3>
                  {p.saved > 0 && (
                    <span className="shrink-0 rounded-full bg-teal-600 px-2 py-0.5 text-[11px] font-bold text-white">
                      {p.offPct}% 할인
                    </span>
                  )}
                </div>
                <p className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">{won(p.amount)}</p>
                {/* 🔴 정가에 취소선을 그어 **깎인 금액이 눈에 보이게** 한다(오너 지시 2026-08-05:
                    "여러 개 많이 구매할 때 할인받아야 기분 좋아한다"). 1주는 정가라 이 줄이 없다. */}
                <p className="mt-1 text-xs text-slate-500">
                  {p.weeks}주 · 주당 {won(p.perWeek)}
                  {p.saved > 0 && <span className="font-semibold text-teal-700"> · {won(p.saved)} 절약</span>}
                </p>
                <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                  공급가 {won(p.supply)} + 부가세 {won(p.vat)}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* ── 광고로 얻는 것 ───────────────────────────── */}
        <section className="mt-10">
          <h2 className="text-lg font-bold text-slate-900">광고를 올리면 달라지는 것</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {BENEFITS.map((b) => (
              <article key={b.title} className="rounded-2xl border border-slate-200 bg-white p-5">
                <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full bg-teal-50 text-lg font-bold text-teal-700">
                  {b.icon}
                </span>
                <h3 className="mt-3 font-bold text-slate-900">{b.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{b.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── 신청 방법 ─────────────────────────────────── */}
        <section className="mt-10">
          <h2 className="text-lg font-bold text-slate-900">신청 방법</h2>
          <ol className="mt-3 grid gap-3 sm:grid-cols-4">
            {[
              ["1", "병원 회원가입", "사업자 정보로 병원을 인증합니다."],
              ["2", "공고 등록", "등록은 무료입니다. 이때는 아직 노출되지 않습니다."],
              ["3", "기간 선택 · 결제", "캐시를 먼저 쓰고 남은 금액만 카드로 냅니다."],
              ["4", "즉시 노출", "결제 직후 상단에 올라가고 인재 열람이 열립니다."],
            ].map(([n, t, d]) => (
              <li key={n} className="rounded-2xl border border-slate-200 bg-white p-5">
                <span aria-hidden className="text-sm font-bold text-teal-700">{n}</span>
                <h3 className="mt-1 font-bold text-slate-900">{t}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button href={ctaHref} size="lg">{ctaLabel} →</Button>
          <Link href="/contact" className={LINK_CLASS}>먼저 문의하기</Link>
        </div>

        {/* ── 결제·환불 고지 ─────────────────────────────
            🔴 환불 없음은 반드시 **사기 전에** 보여야 한다(오너 확정 2026-08-04: 한번 사면 취소 없음).
               결제 화면에만 적어 두면 "몰랐다" 는 분쟁이 남는다. */}
        <section className="mt-10 max-w-3xl rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5 text-sm leading-relaxed text-slate-600">
          <h2 className="font-bold text-slate-900">결제 · 환불</h2>
          <ul className="mt-2 space-y-1.5">
            <li>· 신용카드로 결제하며, 결제가 확인되는 즉시 광고가 시작됩니다.</li>
            {/* 🔴 "결제 내역에서 사업자 정보를 남겨 주세요" 라고 적혀 있었는데 그 화면에는 입력란이 없다
                (사업자 정보 폼은 관리자 화면 /admin/invoices 에만 있다). 안내대로 하려다 못 하고
                결국 문의로 오는 막힌 길이라, 실제로 되는 방법으로 고쳐 적는다. */}
            <li>· 세금계산서를 발행해 드립니다. 결제 후 <Link href="/contact" className={LINK_CLASS}>고객센터</Link>로 사업자등록번호·상호·대표자·수신 이메일을 보내 주세요.</li>
            <li>
              · <b className="text-slate-800">구매하신 광고는 환불되지 않습니다.</b> 노출이 시작되면 되돌릴 수 없으니
              기간을 정하신 뒤 결제해 주세요.
            </li>
            <li>· 공고 내용은 광고 중에도 수정할 수 있습니다. 노출 기간은 그대로 유지됩니다.</li>
          </ul>
          <p className="mt-3">
            그 밖에 궁금한 점은 <Link href="/contact" className={LINK_CLASS}>고객센터</Link>로 문의해 주세요.
          </p>
        </section>
      </main>
    </>
  );
}
