import Link from "next/link";
import { getAdminCounts } from "@/lib/data/admin";

export const metadata = { title: "관리자 — 널스넷" };
// 숫자는 볼 때마다 지금 값이어야 한다. 캐시하면 "미결 주문 0" 을 보고 안심한 뒤 실제로는 3건인 상태가 된다.
export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const c = await getAdminCounts(); // 내부에서 requireAdmin() — 관리자가 아니면 404

  // href 는 **그 화면이 실제로 있을 때만** 단다 — 없는 곳으로 가는 링크는 404 다.
  const cards: { label: string; n: number | null; sub?: string; href?: string }[] = [
    { label: "회원", n: c.members },
    { label: "병원 명부", n: c.hospitals },
    { label: "공고 게시중", n: c.openJobs },
    { label: "광고 게재중", n: c.liveAds },
    { label: "공개 이력서", n: c.publicResumes },
    {
      label: "게시글", n: c.posts, href: "/admin/moderation?kind=board_posts",
      sub: c.comments === null ? "댓글 —" : `댓글 ${c.comments.toLocaleString()}`,
    },
    { label: "리뷰", n: c.reviews, href: "/admin/moderation?kind=reviews" },
    { label: "지원", n: c.applications },
  ];

  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900">관리자</h1>

      {/* 모바일에서도 2열 — /mypage 의 숫자 위젯과 같은 규칙이다. 1열이면 카드 12장이 세로로 너무 길다. */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => {
          const body = (
            <>
              <p className="text-sm text-slate-500">{card.label}</p>
              <Num n={card.n} />
              {card.sub && <p className="mt-0.5 text-xs text-slate-400">{card.sub}</p>}
            </>
          );
          return card.href ? (
            <Link key={card.label} href={card.href}
              className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-teal-400 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
              {body}
            </Link>
          ) : (
            <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5">{body}</div>
          );
        })}
      </div>

      <h2 className="mt-8 text-sm font-semibold text-slate-500">결제</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OrderStat label="결제완료" n={c.paid} />
        {/* 아래 셋이 0 이 아니면 사람이 봐야 한다 — 돈은 움직였는데 광고가 안 나갔을 수 있다 */}
        <OrderStat label="미결(1시간 초과)" n={c.stalePrepare} warn />
        <OrderStat label="실패" n={c.failed} warn />
        {/* CANCELED + 거래번호 있음 = 결제는 승인됐는데 취소로 닫힌 건. 산 광고를 무르는 기능은 없다. */}
        <OrderStat label="승인 후 취소됨" n={c.abandoned} warn />
      </div>
      <p className="mt-3 text-xs text-slate-400">
        미결·실패·승인 후 취소 주문을 화면에서 처리하는 기능은 아직 없습니다 — 숫자가 0이 아니면
        Supabase 에서 <code className="mx-1 rounded bg-slate-100 px-1">ad_orders</code>의 note 열을 확인하세요.
      </p>

    </>
  );
}

/** 못 센 값은 "—". 왜 비었는지 화면에서 알 수 있어야 데이터가 0인 것과 구분된다. */
function Num({ n, className = "text-slate-900" }: Readonly<{ n: number | null; className?: string }>) {
  if (n === null) {
    return (
      <p className="mt-1 text-2xl font-bold text-slate-400">
        <span title="집계 실패 — 서버 로그(getAdminCounts)를 확인하세요">—</span>
        <span className="sr-only">집계 실패</span>
      </p>
    );
  }
  return <p className={`mt-1 text-2xl font-bold ${className}`}>{n.toLocaleString()}</p>;
}

function OrderStat({ label, n, warn }: Readonly<{ label: string; n: number | null; warn?: boolean }>) {
  const bad = warn && n !== null && n > 0;
  return (
    <div className={`rounded-2xl border p-5 ${bad ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`}>
      <p className={`text-sm ${bad ? "text-red-700" : "text-slate-500"}`}>{label}</p>
      <Num n={n} className={bad ? "text-red-700" : "text-slate-900"} />
      {/* 🔴 색만으로 경고하지 않는다(WCAG 1.4.1) — 배지 텍스트를 같이 낸다. */}
      {bad && (
        <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
          <span aria-hidden>⚠</span> 확인 필요
        </p>
      )}
    </div>
  );
}
