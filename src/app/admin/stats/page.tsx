import { getTraffic } from "@/lib/data/adminLists";
import { PageTitle, Tabs, Stat, Section, TableWrap, TH, TD, Empty } from "@/components/admin/Ui";

export const metadata = { title: "접속자 통계 — 관리자" };
export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90] as const;

/** 자주 보이는 유입처만 한국어로. 나머지는 도메인을 그대로 보여준다(목록을 관리하지 않아도 된다). */
const REF_LABEL: Record<string, string> = {
  direct: "직접 방문 · 북마크 · 앱",
  "google.com": "구글", "google.co.kr": "구글(한국)",
  "naver.com": "네이버", "search.naver.com": "네이버 검색", "m.search.naver.com": "네이버 검색(모바일)",
  "m.naver.com": "네이버(모바일)", "blog.naver.com": "네이버 블로그", "cafe.naver.com": "네이버 카페",
  "daum.net": "다음", "search.daum.net": "다음 검색", "m.search.daum.net": "다음 검색(모바일)",
  "bing.com": "빙", "search.zum.com": "줌", "duckduckgo.com": "덕덕고",
  "instagram.com": "인스타그램", "l.instagram.com": "인스타그램",
  "facebook.com": "페이스북", "l.facebook.com": "페이스북", "m.facebook.com": "페이스북(모바일)",
  "t.co": "X(트위터)", "youtube.com": "유튜브", "band.us": "밴드", "open.kakao.com": "카카오톡 오픈채팅",
};

const DEVICE_LABEL: Record<string, string> = { mobile: "휴대폰 · 태블릿", desktop: "PC" };

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
/** 🔴 분모가 0이면 "0.0%" 가 아니라 "—" 다. 0% 라고 쓰면 잴 수 없는 것을 쟀다고 말하는 셈이다. */
const pct1 = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—");

/**
 * 가로 막대 한 줄 — 위에 이름·숫자·비중, 아래에 막대.
 *
 * 🔴 한 줄에 다 넣으면 안 된다. 이름 폭을 고정하면 360px 폰에서 이름 176 + 비중 56 + 여백만으로
 *    카드 안쪽 폭(약 296px)을 넘겨 막대가 화면 밖으로 삐져나간다(검증 2026-08-06).
 */
function BarRow({ label, value, max, whole }: Readonly<{ label: string; value: number; max: number; whole: number }>) {
  return (
    <li className="text-sm">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-slate-700" title={label}>{label}</span>
        <span className="shrink-0 tabular-nums text-slate-700">{value.toLocaleString()}</span>
        <span className="w-14 shrink-0 text-right tabular-nums text-slate-500">{pct1(value, whole)}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-sm bg-slate-100">
        <div className="h-2 rounded-sm bg-teal-500" style={{ width: `${pct(value, max)}%` }} aria-hidden />
      </div>
    </li>
  );
}

export default async function AdminStatsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ days?: string }> }>) {
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.days) as (typeof RANGES)[number]) ? Number(sp.days) : 30;
  const t = await getTraffic(days);

  if (!t) return <Empty>통계를 불러오지 못했습니다. 서버 로그(admin_traffic)를 확인하세요.</Empty>;

  // 오늘·어제는 days 배열의 마지막 두 칸이다 — 같은 값을 DB 에서 따로 세면 언젠가 어긋난다.
  const today = t.days.at(-1);
  const yest = t.days.at(-2);

  // 🔴 막대 기준은 조회수 최댓값 하나로 통일한다. 순 방문자는 늘 조회수 이하라, 같은 자에
  //    겹쳐 그리면 "몇 명이 몇 쪽을 봤나" 가 한 줄에서 읽힌다.
  const maxViews = Math.max(1, ...t.days.map((d) => d.views));
  // 🔴 '방문'은 사람×날짜다. 기간 순 방문자(t.uniques)와 다르다 — 사흘 온 사람은 방문 3, 사람 1.
  const visits = t.days.reduce((a, d) => a + d.uniques, 0);
  const pages = t.days.reduce((a, d) => a + d.hits, 0);

  /**
   * 🔴 평균의 분모는 "고른 기간" 이 아니라 "기록이 있는 기간" 이다.
   *    조회수는 8월 4일부터, 방문자는 그보다 늦게 쌓이기 시작한다. 그냥 90으로 나누면
   *    앞으로 석 달 동안 "하루 평균 방문자 9명" 같은 거짓말이 뜬다(검증 2026-08-06).
   */
  const spanOf = (key: "uniques" | "views") => {
    const i = t.days.findIndex((d) => d[key] > 0);
    return i < 0 ? 0 : t.days.length - i;
  };
  const uvDays = spanOf("uniques");
  const viewDays = spanOf("views");
  const avgUniques = uvDays ? Math.round(visits / uvDays) : 0;
  const avgViews = viewDays ? Math.round(t.total / viewDays) : 0;
  // 🔴 분자·분모를 둘 다 visitors 표에서 뽑는다. 조회수(page_views)로 나누면 지문을 못 만든
  //    요청까지 섞여 "방문당 337쪽" 이 된다.
  const perVisit = visits > 0 ? (pages / visits).toFixed(1) : "—";

  const maxHour = Math.max(1, ...t.hours.map((h) => h.visits));
  const maxRef = Math.max(1, ...t.refs.map((r) => r.visits));
  const maxDevice = Math.max(1, ...t.devices.map((d) => d.visits));
  const firstUniqueDay = uvDays ? t.days[t.days.length - uvDays]?.day : undefined;

  return (
    <>
      <PageTitle
        title="접속자 통계"
        desc="한국시간 기준입니다. 순 방문자는 쿠키 없이, IP·브라우저정보를 서버만 아는 비밀값과 섞은 되돌릴 수 없는 지문으로 셉니다 — 이름·이메일·IP 와는 연결되지 않아 누가 누구인지는 알 수 없습니다. 병원·회사처럼 인터넷을 함께 쓰면 여러 명이 한 명으로 뭉쳐 실제보다 조금 적게 잡힙니다."
      />

      <Tabs items={RANGES.map((n) => ({ href: `/admin/stats?days=${n}`, label: `${n}일`, active: n === days }))} />

      {t.total === 0 && t.bots === 0 ? (
        <Empty>아직 기록이 없습니다. 방문 기록은 배포된 뒤부터 쌓입니다.</Empty>
      ) : (
        <>
          {t.uniques === 0 && t.total > 0 && (
            <p role="status" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <b>순 방문자 집계가 아직 시작되지 않았습니다.</b>{" "}
              조회수는 쌓이고 있지만 방문자 지문은 새 배포가 반영된 뒤부터 기록됩니다. 배포 후 몇 분 지나 다시 보세요.
            </p>
          )}

          <Section title="오늘">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* 🔴 오늘은 아직 진행 중이라 어제보다 낮은 것이 정상이다. ▲▼ 화살표를 붙이면
                  매일 오전마다 "떨어졌다" 고 잘못 읽게 된다 — 어제 값을 숫자로만 옆에 둔다. */}
              <Stat label="오늘 순 방문자" value={today?.uniques ?? 0} tone="good"
                sub={`어제 하루 ${(yest?.uniques ?? 0).toLocaleString()}명 · 오늘은 진행 중`} />
              <Stat label="오늘 조회수" value={today?.views ?? 0}
                sub={`어제 하루 ${(yest?.views ?? 0).toLocaleString()}회`} />
              <Stat label="오늘 1인당 조회"
                value={today && today.uniques > 0 ? (today.hits / today.uniques).toFixed(1) : "—"}
                sub="한 사람이 오늘 연 페이지 수" />
              <Stat label="오늘 봇 조회" value={today?.bots ?? 0}
                sub={`어제 하루 ${(yest?.bots ?? 0).toLocaleString()}회 · 사람 조회수에는 안 들어감`} />
            </div>
          </Section>

          <Section title={`최근 ${days}일`}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* 🔴 '순 방문자' 는 일별 합이 아니다. 사흘 연속 온 사람은 3이 아니라 1이다. */}
              <Stat label={`${days}일 순 방문자`} value={t.uniques} tone="good"
                sub={`서로 다른 사람 수 · 방문 ${visits.toLocaleString()}회(사람×날짜)`} />
              <Stat label={`${days}일 조회수`} value={t.total}
                sub={`기록 있는 ${viewDays}일 · 하루 평균 ${avgViews.toLocaleString()}회`} />
              <Stat label="하루 평균 방문자" value={avgUniques}
                sub={`기록 있는 ${uvDays}일 기준 · 방문당 ${perVisit}쪽`} />
              <Stat label="다시 온 사람" value={t.returning}
                sub={`이 기간에 이틀 이상 방문 · 전체의 ${pct1(t.returning, t.uniques)}`} />
              {/* 🔴 봇은 버리지 않고 따로 센다 — 검색엔진이 우리 사이트를 도는지가 SEO 게이지다. */}
              <Stat label="봇 · 크롤러 조회" value={t.bots}
                sub={`사람 조회수 대비 ${pct1(t.bots, t.total)} · 위 숫자에는 안 들어감`} />
            </div>
            {firstUniqueDay && firstUniqueDay !== t.days[0]?.day && (
              <p className="mt-2 text-xs text-slate-500">
                방문자 집계는 {firstUniqueDay.slice(5).replace("-", "월 ")}일부터입니다. 그 전 날짜는 조회수만 있어 방문자 0으로 보입니다.
              </p>
            )}
          </Section>

          <Section title="일별 추이">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              {/* 막대 설명은 제 줄에 둔다 — 표 머리에 끼우면 좁은 화면에서 글자가 뭉갠다. */}
              <p className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-3 shrink-0 rounded-sm bg-teal-500" aria-hidden /> 순 방문자
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-3 shrink-0 rounded-sm bg-teal-100" aria-hidden /> 조회수
                </span>
              </p>
              {/* 숫자 칸에 이름을 붙인다 — 색만으로 세 숫자를 구분하게 두면 무엇이 무엇인지 모른다. */}
              <div className="mb-2 flex items-center gap-2 border-b border-slate-100 pb-2 text-[11px] font-semibold text-slate-500">
                <span className="w-12 shrink-0">날짜</span>
                <span className="min-w-0 flex-1" />
                <span className="w-12 shrink-0 text-right">방문자</span>
                <span className="w-12 shrink-0 text-right">조회</span>
                <span className="w-10 shrink-0 text-right">봇</span>
              </div>
              <ul className="space-y-1">
                {t.days.map((d) => (
                  <li key={d.day} className="flex items-center gap-2 text-xs">
                    <span className="w-12 shrink-0 text-slate-500">{d.day.slice(5).replace("-", ".")}</span>
                    {/* 조회수 막대 위에 순 방문자 막대를 겹쳐 그린다 — 항상 조회수 이하라 안에 들어간다. */}
                    <span className="relative h-4 min-w-0 flex-1 overflow-hidden rounded-sm bg-slate-50" aria-hidden>
                      <span className="absolute inset-y-0 left-0 rounded-sm bg-teal-100" style={{ width: `${pct(d.views, maxViews)}%` }} />
                      <span className="absolute inset-y-0 left-0 rounded-sm bg-teal-500" style={{ width: `${pct(d.uniques, maxViews)}%` }} />
                    </span>
                    <span className="w-12 shrink-0 text-right font-semibold tabular-nums text-teal-700">{d.uniques.toLocaleString()}</span>
                    <span className="w-12 shrink-0 text-right tabular-nums text-slate-600">{d.views.toLocaleString()}</span>
                    <span className="w-10 shrink-0 text-right tabular-nums text-slate-500">{d.bots.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Section>

          <Section title="어디서 들어왔나">
            {t.refs.length === 0 ? (
              <Empty>아직 유입 기록이 없습니다.</Empty>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <ul className="space-y-3">
                  {t.refs.map((r) => (
                    <BarRow key={r.ref} label={REF_LABEL[r.ref] ?? r.ref} value={r.visits} max={maxRef} whole={visits} />
                  ))}
                </ul>
                {/* 🔴 검색어는 안 남는다(구글·네이버가 안 넘겨준다). 도메인까지만 안다. */}
                <p className="mt-4 text-xs text-slate-500">
                  방문(사람×날짜) 기준이고, 그날 <b>첫 방문의 유입처</b>만 셉니다. 검색어는 검색엔진이 넘겨주지 않아 남지 않습니다.
                </p>
              </div>
            )}
          </Section>

          <div className="mb-8 grid gap-6 lg:grid-cols-2">
            <section>
              <h2 className="mb-3 text-sm font-semibold text-slate-500">기기</h2>
              {t.devices.length === 0 ? (
                <Empty>아직 기록이 없습니다.</Empty>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <ul className="space-y-3">
                    {t.devices.map((d) => (
                      <BarRow key={d.device} label={DEVICE_LABEL[d.device] ?? d.device} value={d.visits}
                        max={maxDevice} whole={visits} />
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold text-slate-500">몇 시에 오나 (한국시간)</h2>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <ul className="flex h-28 items-end gap-px">
                  {t.hours.map((h) => (
                    <li key={h.hour} className="min-w-0 flex-1" aria-label={`${h.hour}시 ${h.visits.toLocaleString()}회`} title={`${h.hour}시 · ${h.visits.toLocaleString()}회`}>
                      <span className="block rounded-t-sm bg-teal-500"
                        style={{ height: `${Math.max(2, pct(h.visits, maxHour))}%` }} />
                    </li>
                  ))}
                </ul>
                <div className="mt-1 flex justify-between text-[10px] text-slate-500" aria-hidden>
                  <span>0시</span><span>6시</span><span>12시</span><span>18시</span><span>23시</span>
                </div>
                <p className="mt-3 text-xs text-slate-500">그날 <b>처음 들어온 시각</b> 기준입니다. 광고를 언제 올릴지 정할 때 봅니다.</p>
              </div>
            </section>
          </div>

          <Section title={`많이 본 페이지 (상위 ${t.paths.length})`}>
            <TableWrap>
              <thead>
                <tr>
                  <TH>경로</TH>
                  <TH className="text-right">사람 조회</TH>
                  <TH className="text-right">비중</TH>
                  <TH className="text-right">봇</TH>
                </tr>
              </thead>
              <tbody>
                {t.paths.map((p) => (
                  <tr key={p.path}>
                    <TD className="break-all">{p.path}</TD>
                    <TD className="text-right tabular-nums">{p.views.toLocaleString()}</TD>
                    <TD className="text-right tabular-nums text-slate-500">{pct1(p.views, t.total)}</TD>
                    <TD className="text-right tabular-nums text-slate-500">{p.bots.toLocaleString()}</TD>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <p className="mt-2 text-xs text-slate-500">
              상위 {t.paths.length}개만 보여주므로 비중을 다 더해도 100%가 되지 않습니다.
              /jobs/:id 처럼 묶인 경로는 개별 글이 아니라 그 종류 전체입니다(개별 id 는 통계에 남기지 않습니다).
            </p>
          </Section>
        </>
      )}
    </>
  );
}
