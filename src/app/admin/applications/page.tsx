import Link from "next/link";
import { Pager } from "@/components/MasterDetail";
import { fmtDay, fmtTime, elapsed, daysAgo } from "@/lib/date";
import { getApplications, getApplicationsOverview, uuidOrEmpty, PER_PAGE } from "@/lib/data/adminLists";
import { ALL_STATUSES, STATUS_LABEL, STATUS_TONE, isAppStatus, type AppStatus } from "@/lib/data/applications";
import { PageTitle, Stat, Section, Tabs, SearchBox, TableWrap, TH, TD, EmptyOrFailed, Empty } from "@/components/admin/Ui";

export const metadata = { title: "지원 내역 — 관리자" };
// 지원은 지금 이 순간 들어온다. 캐시하면 "오늘 0건"을 보고 조용한 줄 안다.
export const dynamic = "force-dynamic";

/**
 * 지원 한 건이 어떻게 흘러갔는가 — 누가, 어느 병원에, 언제 넣었고, 병원이 봤고, 어떻게 끝났나.
 *
 * 🔴 이 화면이 답해야 하는 것은 "몇 건"이 아니다. 대시보드가 이미 그걸 말한다.
 *    여기서 봐야 하는 것은 둘이다 — **간호사가 어디에 지원하나**(수요가 어디 있나),
 *    **병원이 그걸 보고 있나**(안 보면 간호사가 다시 안 온다).
 * 🔴 열람 시각은 추정하지 않는다. applications.viewed_at/closed_at 에 실제로 찍힌 값만 쓴다
 *    (20260806120000). 기록이 없으면 "기록 없음"이라고 적는다 — updated_at 을 열람 시각인 척
 *    적으면 병원이 본 적 없는 지원을 "봤다"고 말하게 된다.
 */
export default async function AdminApplicationsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ status?: string; q?: string; nurse?: string; job?: string; stale?: string; page?: string }> }>) {
  const sp = await searchParams;
  const wanted = sp.status ?? "";
  const status: AppStatus | "" = isAppStatus(wanted) ? wanted : "";
  const q = sp.q ?? "";
  // 주소가 오타여도 화면이 고장 난 것처럼 보이면 안 된다 — uuid 가 아니면 필터가 없었던 것으로 본다.
  const nurse = uuidOrEmpty(sp.nurse);
  const job = uuidOrEmpty(sp.job);
  const stale = sp.stale === "1";
  const page = Math.max(1, Number(sp.page) || 1);
  // 한 사람·한 공고·방치분만 보는 중 — 이때는 상태 칩에 전체 기준 숫자를 달지 않는다.
  const focused = Boolean(nurse || job || stale);

  const [o, { rows, total, failed }] = await Promise.all([
    getApplicationsOverview(),
    getApplications({ status, q, nurse, job, stale, page }),
  ]);

  const qs = (over: Record<string, string> = {}) =>
    new URLSearchParams({
      ...(status ? { status } : {}), ...(q ? { q } : {}),
      ...(nurse ? { nurse } : {}), ...(job ? { job } : {}), ...(stale ? { stale: "1" } : {}), ...over,
    }).toString();
  // 탭은 "무엇을 볼지", 검색은 "그 안에서 좁히기" — 탭을 누르면 검색은 풀린다(공고 관리와 같은 규칙).
  const tabHref = (s: AppStatus | "") =>
    `/admin/applications?${new URLSearchParams({ ...(s ? { status: s } : {}), ...(nurse ? { nurse } : {}), ...(job ? { job } : {}) })}`;

  // 열람률의 분모는 취소를 뺀 것이다 — 간호사가 스스로 거둔 건을 병원 탓으로 세지 않는다.
  const seenRate = o && o.funnel.live > 0 ? Math.round((o.funnel.seen / o.funnel.live) * 100) : null;
  const focusName = rows[0]?.nurse_name ?? null;

  return (
    <>
      <PageTitle
        title="지원 내역"
        desc="간호사가 어느 병원 공고에 지원했고, 병원이 그것을 봤는지까지 한 줄로 봅니다. 날짜는 한국시간 기준입니다."
      />

      {!o ? (
        <Empty>요약을 불러오지 못했습니다. 서버 로그(admin_applications_overview)를 확인하세요.</Empty>
      ) : (
        <>
          <Section title="지원">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="오늘 지원" value={o.counts.today} tone="good"
                sub={`어제 ${o.counts.yesterday.toLocaleString()} · 최근 7일 ${o.counts.d7.toLocaleString()} · 최근 30일 ${o.counts.d30.toLocaleString()}`} />
              <Stat label="누적 지원" value={o.counts.total} sub={`지원받은 공고 ${o.counts.jobs.toLocaleString()}개`} />
              {/* 🔴 건수 옆에 사람 수를 둔다. 20건이 20명인지 한 명이 20번인지는 완전히 다른 이야기다. */}
              <Stat label="지원한 간호사" value={o.counts.nurses}
                sub={`최근 30일 ${o.counts.nurses_d30.toLocaleString()}명 · 서로 다른 사람 수`} />
              <Stat label="1인당 지원" value={o.counts.nurses > 0 ? `${(o.counts.total / o.counts.nurses).toFixed(1)}건` : "-"}
                sub="한 사람이 몇 군데나 넣는가" />
            </div>
            {o.test_total > 0 && (
              <p className="mt-2 text-xs text-slate-400">
                관리자 테스트 병원에 넣은 지원 {o.test_total.toLocaleString()}건은 위 숫자와 아래 목록에서 뺐습니다.
              </p>
            )}
          </Section>

          <Section title="병원이 보고 있나">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="병원 열람률" value={seenRate === null ? "-" : `${seenRate}%`}
                sub={`${o.funnel.seen.toLocaleString()}/${o.funnel.live.toLocaleString()}건 · 열람까지 ${o.funnel.median_hours === null ? "기록 없음" : `중앙값 ${o.funnel.median_hours}시간`}`} />
              <Stat label="아직 안 본 지원" value={o.funnel.submitted} sub="병원이 한 번도 열어 보지 않음" />
              {/* 3일이면 간호사는 이미 다른 곳을 알아본다 — 병원에 연락할 대상이다. */}
              <Stat label="3일 넘게 방치" value={o.funnel.stale} tone="warn" href="/admin/applications?stale=1" />
              <Stat label="합격" value={o.funnel.accepted} tone="good"
                sub={`불합격 ${o.funnel.rejected.toLocaleString()} · 간호사 취소 ${o.funnel.withdrawn.toLocaleString()}`} />
            </div>
          </Section>

          <Section title="지원이 몰린 공고">
            {o.top_jobs.length === 0 ? (
              <Empty>아직 지원이 없습니다.</Empty>
            ) : (
              <TableWrap>
                <thead>
                  <tr><TH>병원</TH><TH>공고</TH><TH className="text-right">지원</TH><TH className="text-right">안 본 것</TH><TH>마지막 지원</TH></tr>
                </thead>
                <tbody>
                  {o.top_jobs.map((t) => (
                    <tr key={t.job_id}>
                      <TD className="font-medium">{t.hospital ?? "-"}</TD>
                      <TD>
                        <Link href={`/admin/applications?job=${t.job_id}`} className="text-teal-700 hover:underline">{t.title}</Link>
                      </TD>
                      <TD className="text-right font-semibold">{t.n.toLocaleString()}</TD>
                      <TD className={`text-right ${t.unseen > 0 ? "font-semibold text-red-700" : "text-slate-400"}`}>{t.unseen.toLocaleString()}</TD>
                      <TD className="whitespace-nowrap">{fmtDay(t.last_at)}</TD>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Section>
        </>
      )}

      <Section title="지원 목록">
        {/* 한 사람·한 공고만 볼 때는 상태 칩에 숫자를 달지 않는다 — 그 숫자는 전체 기준이라
            "이 사람 지원 2건" 화면에 "합격 15" 가 붙으면 이 사람이 15번 붙은 것처럼 읽힌다. */}
        <Tabs items={[
          { href: tabHref(""), label: "전체", active: status === "" && !stale },
          ...ALL_STATUSES.map((s) => ({
            href: tabHref(s),
            label: o && !focused ? `${STATUS_LABEL[s]} ${o.funnel[s].toLocaleString()}` : STATUS_LABEL[s],
            active: !stale && status === s,
          })),
        ]} />

        {focused && (
          <p className={`mb-4 flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
            stale ? "border-red-200 bg-red-50 text-red-900" : "border-teal-200 bg-teal-50 text-teal-900"
          }`}>
            <b>{stale ? "3일 넘게 병원이 열어 보지 않은 지원"
              : nurse ? `${focusName ?? "이 간호사"}님이 지원한 내역`
              : "이 공고에 들어온 지원"}</b>
            <span>{total.toLocaleString()}건</span>
            <Link href="/admin/applications" className="ml-auto font-semibold underline">전체 보기</Link>
          </p>
        )}

        <SearchBox action="/admin/applications" value={q} placeholder="간호사 이름 · 공고 제목 · 병원명"
          hidden={{ ...(status ? { status } : {}), ...(nurse ? { nurse } : {}), ...(job ? { job } : {}), ...(stale ? { stale: "1" } : {}) }} />

        {rows.length === 0 ? (
          <EmptyOrFailed failed={failed}>
            {/* 🔴 "병원들이 제때 보고 있습니다" 는 검색어가 없을 때만 사실이다. 검색어와 함께 0건이면
                방치 건이 있는데 검색어와 안 맞은 것일 수 있어, 그 문구는 없는 안심을 준다. */}
            {stale && !q ? "3일 넘게 방치된 지원이 없습니다 — 병원들이 제때 보고 있습니다."
              : q || status || focused ? "해당 조건에 맞는 지원이 없습니다."
              : "아직 들어온 지원이 없습니다."}
          </EmptyOrFailed>
        ) : (
          <TableWrap>
            <thead>
              <tr><TH>지원</TH><TH>간호사</TH><TH>지원한 곳</TH><TH>진행</TH><TH>남긴 말</TH></tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const waiting = a.status === "submitted";
                const days = daysAgo(a.created_at);
                // 🔴 시각이 거꾸로 박힌 행에서 elapsed 는 빈 문자열이다 — 그대로 이으면 "열람 08.05 · " 로 끝난다.
                const toViewed = a.viewed_at ? elapsed(a.created_at, a.viewed_at) : "";
                const toClosed = a.viewed_at && a.closed_at ? elapsed(a.viewed_at, a.closed_at) : "";
                return (
                  <tr key={a.id}>
                    <TD className="whitespace-nowrap">
                      {fmtDay(a.created_at)}
                      <span className="block text-xs text-slate-400">{fmtTime(a.created_at)}</span>
                    </TD>
                    <TD>
                      <Link href={`/admin/applications?nurse=${a.applicant_id}`} className="font-medium text-teal-700 hover:underline">
                        {a.nurse_name ?? "(이름 없음)"}
                      </Link>
                      <span className="block text-xs text-slate-400">{a.nurse_phone ?? a.nurse_email ?? "연락처 없음"}</span>
                      <Link href={`/admin/resumes/${a.applicant_id}`} className="text-xs text-slate-500 underline">이력서</Link>
                    </TD>
                    <TD>
                      <span className="font-medium">{a.hospital_name ?? a.job_company_name ?? "-"}</span>
                      {/* 🔴 노출 판정을 여기서 다시 계산하지 않는다 — jobs_listed.is_live 하나를 읽는다
                          (20260805100000: 규칙을 여러 곳에 적어 대시보드 "게시중 44" vs 공고관리
                          "노출중 40" 이 나왔다). 노출이 끝난 공고는 공개 상세가 404 라 링크를 떼어 둔다. */}
                      <span className="block text-xs">
                        {a.job_is_live
                          ? <Link href={`/jobs/${a.job_id}`} className="text-teal-700 hover:underline">{a.job_title}</Link>
                          : <span className="text-slate-500">{a.job_title} (노출 종료)</span>}
                      </span>
                    </TD>
                    <TD className="whitespace-nowrap text-xs">
                      <span className={`inline-block rounded-full px-2 py-0.5 font-semibold ${STATUS_TONE[a.status]}`}>
                        {STATUS_LABEL[a.status]}
                      </span>
                      <span className="mt-1 block">
                        {waiting ? (
                          // 🔴 "3일" 기준은 뷰의 is_stale 이 정한다 — 여기서 다시 세면 요약 카드의
                          //    「3일 넘게 방치 N건」과 빨갛게 칠해진 줄 수가 어긋난다.
                          <span className={a.is_stale ? "font-semibold text-red-700" : "text-slate-500"}>
                            아직 안 봄{days >= 1 && ` · ${days}일째`}
                          </span>
                        ) : a.viewed_at ? (
                          <span className="text-slate-500">열람 {fmtDay(a.viewed_at)}{toViewed && ` · ${toViewed}`}</span>
                        ) : a.status === "withdrawn" ? (
                          <span className="text-slate-500">병원이 보기 전에 취소</span>
                        ) : (
                          // 20260806120000 이전에 끝난 옛 지원. 모르는 것을 아는 척하지 않는다.
                          <span className="text-slate-400">열람 시각 기록 없음</span>
                        )}
                      </span>
                      {a.closed_at && (
                        <span className="mt-0.5 block text-slate-500">
                          {/* "열람 2시간 뒤" 라고만 적으면 바로 윗줄의 열람 시각과 헷갈린다
                              — 이건 **본 뒤 결정까지** 걸린 시간이다. */}
                          {STATUS_LABEL[a.status]} {fmtDay(a.closed_at)}
                          {toClosed && ` · 열람 후 ${toClosed.replace(/ 뒤$/, "")}`}
                        </span>
                      )}
                    </TD>
                    <TD>
                      {a.message
                        ? <span className="block max-w-xs whitespace-pre-wrap text-xs text-slate-600">{a.message}</span>
                        : <span className="text-xs text-slate-400">-</span>}
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}

        <Pager page={page} totalPages={Math.max(1, Math.ceil(total / PER_PAGE))}
          href={(n) => `/admin/applications?${qs({ page: String(n) })}`} />
      </Section>
    </>
  );
}
