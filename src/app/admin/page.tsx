import { getDashboard } from "@/lib/data/adminLists";
import { PageTitle, Stat, Section, Empty } from "@/components/admin/Ui";
import { won } from "@/lib/ads";
import { fmtDay } from "@/lib/date";

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
  const todoTotal = todo.inquiries + todo.tax + todo.stale_orders + todo.failed_orders + todo.nameless_resumes;

  return (
    <>
      <PageTitle title="대시보드" desc="오늘 무엇이 늘었고, 무엇을 처리해야 하는지. 날짜는 한국시간 기준이고, 기간 숫자는 그 기간 누적입니다. 이관 회원의 가입일도 구 널스넷에 기록된 실제 가입일입니다." />

      <Section title="처리할 일">
        {todoTotal === 0 ? (
          <Empty>지금 처리할 것이 없습니다.</Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="미처리 문의" value={todo.inquiries} tone="warn" href="/admin/inquiries?status=open" />
            <Stat label="세금계산서 미발행" value={todo.tax} tone="warn" href="/admin/invoices" />
            <Stat label="미결 주문(1시간 초과)" value={todo.stale_orders} tone="warn" href="/admin/orders?status=PREPARE" />
            <Stat label="결제 실패" value={todo.failed_orders} tone="warn" href="/admin/orders?status=FAILED" />
            {/* 이름이 빈 이력서는 공개 인재 목록에서 아예 빠진다 — 본인은 올렸다고 생각하는데 안 보인다 */}
            <Stat label="이름 없는 이력서" value={todo.nameless_resumes} tone="warn" href="/admin/resumes" />
            {/* 🔴 비공개 이력서는 여기에 넣지 않는다. 본인이 공개 동의를 안 한 것이고 시스템은
                정확히 그대로 숨기고 있다 — 관리자가 할 일이 없다(오너 확인 2026-08-04).
                할 일이 아닌 것을 '처리할 일'에 두면 목록 전체가 무시당한다. */}
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
          {/* 이관 회원의 가입일도 구 널스넷 wp_member.regdate 를 되돌려 넣어 진짜 날짜다
              (restore-legacy-signup-dates.ts). 그래서 그냥 세면 맞는다 — 빼는 조건이 없다. */}
          <Stat label="오늘 가입" value={d.members.today} sub={`어제 ${d.members.yesterday.toLocaleString()} · 최근 7일 ${d.members.d7.toLocaleString()} · 최근 30일 ${d.members.d30.toLocaleString()}`} tone="good" href="/admin/users" />
          <Stat label="전체 회원" value={d.members.total}
            sub={`간호사 ${d.members.nurse.toLocaleString()} · 병원 ${d.members.hospital.toLocaleString()} — 구 널스넷 ${d.members.legacy.toLocaleString()} · 새 사이트 ${d.members.real.toLocaleString()}`}
            href="/admin/users" />
          {/* 🔴 '고친 것' 을 같이 보여준다. 이력서 대부분이 이관분이라 회원 활동은
              '새로 쓰기' 가 아니라 '고치기' 로 나타난다. 등록만 세면 목록에는 오늘 것이
              잔뜩 보이는데 대시보드는 0 이라 화면이 서로를 반증한다. */}
          <Stat label="오늘 이력서 저장" value={d.resumes.saved_today}
            sub={`새로 씀 ${d.resumes.today.toLocaleString()} · 고침 ${d.resumes.edited_today.toLocaleString()} · 어제 ${d.resumes.saved_yesterday.toLocaleString()}`}
            tone="good" href="/admin/resumes" />
          <Stat label="공개 이력서" value={d.resumes.public}
            sub={`전체 ${d.resumes.total.toLocaleString()} · 그중 신규 회원이 쓴 것 ${d.resumes.real.toLocaleString()}`} href="/admin/resumes" />
        </div>
      </Section>

      <Section title="우리 공고 · 지원">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* 🔴 링크를 걸지 않는다. 공고관리 목록에는 **날짜 필터가 없어서**, 이 카드를 누르면
              "오늘 등록 0" 이라 해놓고 노출중 전체(40건)가 나온다 — 카드 숫자와 도착지가 어긋나는
              것이 바로 "게시중 44 vs 노출중 40" 을 만든 그 함정이다(오너 지적 2026-08-05).
              목록은 최신순이라 오늘 것은 어차피 맨 위에 있다. */}
          {/* 🔴 '등록' 과 '보임' 을 한 카드 안에서 같이 말한다. 등록 수만 있으면 화면이 거짓말을 한다 —
              2026-08-13 실제로 3건 등록에 노출은 1건이었고(둘은 등록 직후 탈퇴, 하나는 결제 전),
              오너가 목록을 뒤지다 못 찾았다. 안 보이는 몫은 어디서 확인하는지까지 적는다. */}
          {/* 🔴 `?? 0` 은 군더더기가 아니다. RPC 응답에 타입만 씌워 쓰므로(adminLists.ts) DB 함수가
              이 필드를 안 내보내면 실제로 undefined 이고, 그대로 부르면 대시보드 **전체가 500** 이다. */}
          <Stat label="오늘 등록 공고" value={d.jobs.today}
            sub={`그중 지금 노출 ${(d.jobs.today_live ?? 0).toLocaleString()}${
              d.jobs.today > (d.jobs.today_live ?? 0)
                ? ` · 나머지 ${(d.jobs.today - (d.jobs.today_live ?? 0)).toLocaleString()}건은 결제 전·마감(공고 관리 → 노출 마감)`
                : ""
            } · 어제 ${d.jobs.yesterday.toLocaleString()} · 최근 7일 ${d.jobs.d7.toLocaleString()}`} tone="good" />
          <Stat label="노출중 공고" value={d.jobs.open} sub="지금 구직자에게 보이는 것 · 워크넷 제외" href="/admin/ads?scope=live" />
          <Stat label="3일 내 마감" value={d.jobs.closing3} />
          {/* 누르면 "누가 어디에 지원했고 병원이 봤는지"까지 나온다. 여기 숫자와 그 화면의 누적치는
              같은 술어(관리자 테스트 병원 제외, 20260806120000)를 써서 서로 어긋나지 않는다. */}
          <Stat label="오늘 지원" value={d.applications.today}
            sub={`어제 ${d.applications.yesterday.toLocaleString()} · 최근 7일 ${d.applications.d7.toLocaleString()} · 누적 ${d.applications.total.toLocaleString()} · 테스트 제외`}
            href="/admin/applications" />
        </div>
        {/* 🔴 워크넷 수집분은 위 숫자에 넣지 않는다 — 고용24에서 자동으로 긁어오는 구인정보라
            우리 매출도, 우리가 관리할 대상도 아니다. 크론이 죽었는지만 보이면 된다. */}
        <p className="mt-2 text-xs text-slate-400">
          워크넷 수집분은 위 숫자에서 제외했습니다 — 노출중 {d.collected.open.toLocaleString()}건 ·
          오늘 {d.collected.today.toLocaleString()}건 수집
          {d.collected.last_sync && ` · 마지막 수집 ${fmtDay(d.collected.last_sync)}`}
        </p>
      </Section>

      <Section title="광고 · 매출">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="유료 광고 게재중" value={d.ads.live} sub={`7일 내 종료 ${d.ads.ending7.toLocaleString()}건 · 광고 없이 노출중 ${d.ads.granted.toLocaleString()}건(=위 노출중 공고)`} href="/admin/ads?scope=paid" />
          <Stat label="오늘 매출" value={won(d.revenue.today)} tone="good" href="/admin/orders?status=PAID" />
          <Stat label="최근 30일 매출" value={won(d.revenue.d30)} sub={`${d.revenue.count30.toLocaleString()}건`} href="/admin/orders?status=PAID" />
          {/* 링크를 걸지 않는다 — 결제 내역 목록은 관리자 테스트 주문(0원)까지 포함해서
              여기 숫자와 합이 안 맞는다. 맞지 않는 곳으로 보내면 숫자를 못 믿게 된다. */}
          <Stat label="누적 매출" value={won(d.revenue.total)} sub="관리자 테스트 제외" />
        </div>
      </Section>

      {/* 🔴 조회수만 있으면 "오늘 414 조회" 가 몇 명인지 알 수 없다 — 100명이 4쪽씩 본 것과
          400명이 한 쪽씩 본 것은 완전히 다른 이야기다(오너 지적 2026-08-06). 사람 수를 앞에 둔다.
          🔴 7일·30일 순 방문자는 **일별 합이 아니라 서로 다른 사람 수**다(사흘 온 사람은 1). */}
      <Section title="접속자">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="오늘 순 방문자" value={d.visitors.today} tone="good"
            sub={`어제 ${d.visitors.yesterday.toLocaleString()}명 · 오늘 조회 ${d.traffic.today.toLocaleString()}회`} href="/admin/stats?days=7" />
          <Stat label="최근 7일 순 방문자" value={d.visitors.d7}
            sub={`서로 다른 사람 수 · 조회 ${d.traffic.d7.toLocaleString()}회`} href="/admin/stats?days=7" />
          <Stat label="최근 30일 순 방문자" value={d.visitors.d30}
            sub={`서로 다른 사람 수 · 조회 ${d.traffic.d30.toLocaleString()}회`} href="/admin/stats?days=30" />
          <Stat label="최근 30일 봇 조회" value={d.traffic.bots30}
            sub="검색엔진·크롤러 · 위 조회수에는 안 들어감" href="/admin/stats?days=30" />
        </div>
        {d.traffic.d30 === 0 && (
          <p className="mt-2 text-xs text-slate-400">아직 기록이 없습니다. 방문 기록은 배포된 뒤부터 쌓입니다.</p>
        )}
        {d.traffic.d30 > 0 && d.visitors.d30 === 0 && (
          <p className="mt-2 text-xs text-slate-400">
            순 방문자는 새 배포가 반영된 뒤부터 쌓입니다. 조회수만 있는 동안에는 0으로 보입니다.
          </p>
        )}
      </Section>
    </>
  );
}
