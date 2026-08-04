import { getTraffic } from "@/lib/data/adminLists";
import { PageTitle, Tabs, Stat, Section, TableWrap, TH, TD, Empty } from "@/components/admin/Ui";

export const metadata = { title: "접속자 통계 — 관리자" };
export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90] as const;

export default async function AdminStatsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ days?: string }> }>) {
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.days) as (typeof RANGES)[number]) ? Number(sp.days) : 30;
  const t = await getTraffic(days);

  if (!t) return <Empty>통계를 불러오지 못했습니다. 서버 로그(admin_traffic)를 확인하세요.</Empty>;

  const max = Math.max(1, ...t.days.map((d) => d.views));
  const avg = t.days.length ? Math.round(t.total / t.days.length) : 0;
  const today = t.days.at(-1)?.views ?? 0;

  return (
    <>
      <PageTitle title="접속자 통계" desc="페이지 조회수입니다. 방문자별 구분은 하지 않습니다(쿠키·식별자를 심지 않기 위해서)." />

      <Tabs items={RANGES.map((n) => ({ href: `/admin/stats?days=${n}`, label: `${n}일`, active: n === days }))} />

      <Section title="요약">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="오늘" value={today} />
          <Stat label={`${days}일 합계`} value={t.total} />
          <Stat label="일평균" value={avg} />
        </div>
      </Section>

      {t.total === 0 ? (
        <Empty>아직 기록이 없습니다. 방문 기록은 배포된 뒤부터 쌓입니다.</Empty>
      ) : (
        <>
          <Section title="일별 추이">
            {/* 막대는 CSS 폭으로만 그린다 — 그래프 라이브러리를 넣을 만큼의 화면이 아니다. */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <ul className="space-y-1">
                {t.days.map((d) => (
                  <li key={d.day} className="flex items-center gap-2 text-xs">
                    <span className="w-20 shrink-0 text-slate-500">{d.day.slice(5).replace("-", ".")}</span>
                    <span className="h-4 min-w-px rounded-sm bg-teal-500" style={{ width: `${(d.views / max) * 100}%` }} aria-hidden />
                    <span className="shrink-0 tabular-nums text-slate-700">{d.views.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Section>

          <Section title={`많이 본 페이지 (상위 ${t.paths.length})`}>
            <TableWrap>
              <thead><tr><TH>경로</TH><TH className="text-right">조회</TH><TH className="text-right">비중</TH></tr></thead>
              <tbody>
                {t.paths.map((p) => (
                  <tr key={p.path}>
                    <TD className="break-all">{p.path}</TD>
                    <TD className="text-right tabular-nums">{p.views.toLocaleString()}</TD>
                    <TD className="text-right tabular-nums text-slate-500">{((p.views / t.total) * 100).toFixed(1)}%</TD>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </Section>
        </>
      )}
    </>
  );
}
