import { getDashboard } from "@/lib/data/adminLists";
import { PageTitle, Stat, Section, Empty } from "@/components/admin/Ui";
import { won } from "@/lib/ads";

export const metadata = { title: "대시보드 — 관리자" };
// 숫자는 볼 때마다 지금 값이어야 한다. 캐시하면 "미결 주문 0" 을 보고 안심한 뒤 실제로는 3건인 상태가 된다.
export const dynamic = "force-dynamic";

/**
 * 🔴 총계만 늘어놓지 않는다. 회원 수·공고 수는 공개 화면에도 있어 관리자에게 새 정보가 아니다.
 *    이 화면이 답해야 하는 것은 둘이다 — **지금 늘고 있나(기간별 증감)**, **내가 해야 할 일이 있나**.
 */
export default async function AdminDashboard() {
  const d = await getDashboard(); // 내부에서 requireAdmin() — 관리자가 아니면 404
  if (!d) return <Empty>집계를 불러오지 못했습니다. 서버 로그(admin_dashboard)를 확인하세요.</Empty>;

  const todo = d.todo;
  const todoTotal = todo.inquiries + todo.tax + todo.stale_orders + todo.failed_orders;

  return (
    <>
      <PageTitle title="대시보드" desc="오늘 무엇이 늘었고, 무엇을 처리해야 하는지. 날짜는 한국시간 기준이고, 기간 숫자는 그 기간 누적입니다." />

      <Section title="처리할 일">
        {todoTotal === 0 ? (
          <Empty>지금 처리할 것이 없습니다.</Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="미처리 문의" value={todo.inquiries} tone="warn" href="/admin/inquiries?status=open" />
            <Stat label="세금계산서 미발행" value={todo.tax} tone="warn" href="/admin/invoices" />
            <Stat label="미결 주문(1시간 초과)" value={todo.stale_orders} tone="warn" href="/admin/orders?status=PREPARE" />
            <Stat label="결제 실패" value={todo.failed_orders} tone="warn" href="/admin/orders?status=FAILED" />
          </div>
        )}
      </Section>

      <Section title="숨김 처리한 것">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="숨긴 리뷰" value={todo.hidden_reviews} href="/admin/moderation?kind=reviews&hidden=1" />
          <Stat label="숨긴 게시글" value={todo.hidden_posts} href="/admin/moderation?kind=board_posts&hidden=1" />
        </div>
      </Section>

      <Section title="가입 · 이력서">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="오늘 가입" value={d.members.today} sub={`어제 ${d.members.yesterday.toLocaleString()} · 최근 7일 ${d.members.d7.toLocaleString()} · 최근 30일 ${d.members.d30.toLocaleString()}`} tone="good" href="/admin/users" />
          <Stat label="전체 회원" value={d.members.total} sub={`간호사 ${d.members.nurse.toLocaleString()} · 병원 ${d.members.hospital.toLocaleString()}`} href="/admin/users" />
          <Stat label="오늘 등록 이력서" value={d.resumes.today} sub={`어제 ${d.resumes.yesterday.toLocaleString()} · 최근 7일 ${d.resumes.d7.toLocaleString()} · 최근 30일 ${d.resumes.d30.toLocaleString()}`} tone="good" href="/admin/resumes" />
          <Stat label="공개 이력서" value={d.resumes.public} sub={`전체 ${d.resumes.total.toLocaleString()} · 비공개 ${(d.resumes.total - d.resumes.public).toLocaleString()}`} href="/admin/resumes" />
        </div>
      </Section>

      <Section title="공고 · 지원">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="오늘 등록 공고" value={d.jobs.today} sub={`어제 ${d.jobs.yesterday.toLocaleString()} · 최근 7일 ${d.jobs.d7.toLocaleString()}`} tone="good" />
          <Stat label="게시중 공고" value={d.jobs.open} sub={`직접 ${d.jobs.direct.toLocaleString()} · 워크넷 ${d.jobs.worknet.toLocaleString()}`} />
          <Stat label="3일 내 마감" value={d.jobs.closing3} />
          <Stat label="오늘 지원" value={d.applications.today} sub={`어제 ${d.applications.yesterday.toLocaleString()} · 최근 7일 ${d.applications.d7.toLocaleString()} · 누적 ${d.applications.total.toLocaleString()}`} />
        </div>
      </Section>

      <Section title="광고 · 매출">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="게재중 광고" value={d.ads.live} sub={`7일 내 종료 ${d.ads.ending7.toLocaleString()}건`} href="/admin/ads" />
          <Stat label="오늘 매출" value={won(d.revenue.today)} tone="good" href="/admin/orders?status=PAID" />
          <Stat label="최근 30일 매출" value={won(d.revenue.d30)} sub={`${d.revenue.count30.toLocaleString()}건`} href="/admin/orders?status=PAID" />
          {/* 링크를 걸지 않는다 — 결제 내역 목록은 관리자 테스트 주문(0원)까지 포함해서
              여기 숫자와 합이 안 맞는다. 맞지 않는 곳으로 보내면 숫자를 못 믿게 된다. */}
          <Stat label="누적 매출" value={won(d.revenue.total)} sub="관리자 테스트 제외" />
        </div>
      </Section>

      <Section title="접속자">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="오늘 조회" value={d.traffic.today} href="/admin/stats" />
          <Stat label="최근 7일 조회" value={d.traffic.d7} href="/admin/stats" />
          <Stat label="최근 30일 조회" value={d.traffic.d30} href="/admin/stats" />
        </div>
        {d.traffic.d30 === 0 && (
          <p className="mt-2 text-xs text-slate-400">아직 기록이 없습니다. 방문 기록은 배포된 뒤부터 쌓입니다.</p>
        )}
      </Section>
    </>
  );
}
