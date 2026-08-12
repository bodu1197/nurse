import { getCollectors, type CollectorCard, type RunRow } from "@/lib/data/collectors";
import { PageTitle, Section, TableWrap, TH, TD, Empty } from "@/components/admin/Ui";

export const metadata = { title: "데이터 수집 모니터링 — 관리자" };
export const dynamic = "force-dynamic";

/** "3시간 전" 처럼. 수집 화면은 **얼마나 오래됐나**가 핵심이라 절대시각보다 경과가 먼저 읽혀야 한다. */
function ago(iso: string | null): string {
  if (!iso) return "기록 없음";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

const fmtKst = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" }) : "—";

const STATE = {
  ok: { text: "정상", cls: "bg-teal-50 text-teal-800 border-teal-200" },
  fail: { text: "실패", cls: "bg-red-50 text-red-700 border-red-300" },
  stale: { text: "안 돌고 있음", cls: "bg-amber-50 text-amber-800 border-amber-300" },
  none: { text: "기록 없음", cls: "bg-slate-50 text-slate-600 border-slate-200" },
} as const;

/** 수집 건수 요약 — 수집기마다 항목이 달라 있는 것만 보여 준다. */
function statLine(stats: RunRow["stats"]): string {
  if (!stats) return "";
  const L: Record<string, string> = {
    fetched: "받음", fetchedAts: "ATS", fetchedSites: "자체사이트", fetchedBoards: "집계사이트", jobsUpserted: "저장",
    jobsClosed: "마감", registryMatched: "명부매칭", detailsFetched: "상세", upserted: "저장",
    total: "전체", pages: "페이지", graded: "종별있음",
  };
  return Object.entries(stats)
    .filter(([, v]) => typeof v === "number")
    .map(([k, v]) => `${L[k] ?? k} ${v.toLocaleString()}`)
    .join(" · ");
}

function Card({ c }: Readonly<{ c: CollectorCard }>) {
  const s = STATE[c.state];
  return (
    <li className={`rounded-xl border p-4 ${s.cls}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-semibold text-slate-900">{c.label}</span>
        <span className="rounded-full border border-current px-2 py-0.5 text-xs font-semibold">{s.text}</span>
        <span className="ml-auto text-sm">{ago(c.last?.ran_at ?? null)}</span>
      </div>
      <p className="mt-1 text-xs text-slate-600">
        {c.cron} · 마지막 실행 {fmtKst(c.last?.ran_at ?? null)}
        {c.last?.duration_ms ? ` · ${Math.round(c.last.duration_ms / 1000)}초` : ""}
      </p>
      {c.last?.ok && <p className="mt-2 text-sm text-slate-700">{statLine(c.last.stats)}</p>}
      {/* 🔴 실패 사유를 감추지 않는다 — 관리자가 이 화면만 보고 원인을 짐작할 수 있어야 한다. */}
      {c.last && !c.last.ok && (
        <>
          <p className="mt-2 break-words text-sm font-semibold">오류: {c.last.error ?? "사유 없음"}</p>
          <p className="mt-1 text-xs">
            마지막 성공: {c.lastOk ? `${fmtKst(c.lastOk.ran_at)} (${ago(c.lastOk.ran_at)})` : "없음"}
          </p>
        </>
      )}
      {/* 전체는 성공했는데 **일부 원천만** 죽은 경우 — 가장 놓치기 쉬운 고장이라 따로 띄운다. */}
      {c.last?.failed && c.last.failed.length > 0 && (
        <p className="mt-2 rounded-lg bg-white/70 px-2 py-1 text-sm text-red-700">
          응답 없는 사이트 {c.last.failed.length}곳: {c.last.failed.join(", ")}
        </p>
      )}
    </li>
  );
}

export default async function CollectorsPage() {
  const { cards, sources, expected, emptyBodies } = await getCollectors();
  const broken = cards.filter((c) => c.state !== "ok");

  return (
    <>
      <PageTitle
        title="데이터 수집 모니터링"
        desc="공고를 어디서 긁어오는지와, 그게 지금도 잘 돌고 있는지."
      />

      {/* 🔴 고장이 있으면 **맨 위에서 한 줄로** 말한다. 카드를 다 훑어야 알 수 있으면 모니터링이 아니다. */}
      {broken.length > 0 ? (
        <p role="alert" className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {broken.length}개 수집기에 문제가 있습니다 — {broken.map((c) => c.label).join(", ")}
        </p>
      ) : (
        <p role="status" className="mb-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          수집기 {cards.length}개 모두 정상입니다.
        </p>
      )}

      {/* 🔴 수집은 성공했는데 **본문이 비는** 고장은 위 카드에 안 잡힌다 — 실제로 24건이 제목만
          있는 채로 노출되고 있었고 오너가 화면에서 발견했다(2026-08-12). 숫자로 드러내 둔다. */}
      {emptyBodies > 0 && (
        <p role="alert" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <b>본문이 빈 공고 {emptyBodies.toLocaleString()}건</b> — 눌러도 제목·병원명만 보인다.
          해당 사이트의 상세 마크업이 바뀌었을 수 있다(아래 표에서 맨 위 기관부터 확인).
        </p>
      )}

      <Section title="수집기">
        <ul className="grid gap-3 sm:grid-cols-2">
          {cards.map((c) => <Card key={c.key} c={c} />)}
        </ul>
      </Section>

      <Section title={`수집 원천 (${sources.length}곳)`}>
        <p className="mb-3 text-sm text-slate-500">
          병원 채용사이트·잡알리오·집계 사이트에서 지금 살아 있는 공고. 우리가 이름을 지정해 두고 도는
          병원은 {expected}곳이고, 여기 없는 곳은 <b>지금 열린 간호 공고가 없거나 수집이 막힌 것</b>이다.
          {" "}집계 사이트(인재채움뱅크)는 전국에서 모아 오므로 <b>{expected}곳에 없는 병원도 뜬다</b> — 정상이다.
        </p>
        {sources.length === 0 ? (
          <Empty>수집된 공고가 없습니다 — 수집기 상태를 먼저 확인하세요.</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <TH>기관</TH>
                <TH>노출중 공고</TH>
                <TH>본문 없음</TH>
                <TH>마지막 갱신</TH>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.name}>
                  <TD>{s.name}</TD>
                  <TD>{s.live.toLocaleString()}건</TD>
                  <TD>{s.empty > 0 ? <b className="text-amber-700">{s.empty}건</b> : "—"}</TD>
                  <TD>{ago(s.updatedAt)}</TD>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Section>
    </>
  );
}
