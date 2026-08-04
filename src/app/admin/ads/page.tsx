import Link from "next/link";
import { Pager } from "@/components/MasterDetail";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { fmtDay, DAY_MS, nowMs } from "@/lib/date";
import { won } from "@/lib/ads";
import { getAdList, PER_PAGE, AD_SCOPES, AD_SCOPE_LABEL, isAdScope, type AdScope } from "@/lib/data/adminLists";
import { PageTitle, Tabs, SearchBox, TableWrap, TH, TD, EmptyOrFailed, Notice } from "@/components/admin/Ui";
import { extendAd, endAd } from "@/app/admin/actions";

export const metadata = { title: "광고 관리 — 관리자" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  "1": "처리했습니다. 기록이 남았습니다.",
  reason: "사유를 두 글자 이상 적어야 합니다.",
  days: "연장 일수는 1~365 사이여야 합니다.",
  target: "대상 공고를 찾을 수 없습니다.",
  save: "저장에 실패했습니다.",
};

/** 남은 기간. 끝났으면 며칠 전에 끝났는지. */
function remain(untilIso: string | null) {
  if (!untilIso) return { text: "-", urgent: false, ended: true };
  const diff = new Date(untilIso).getTime() - nowMs();
  if (diff <= 0) return { text: `${Math.ceil(-diff / DAY_MS)}일 전 마감`, urgent: false, ended: true };
  const days = Math.ceil(diff / DAY_MS);
  return { text: `${days}일 남음`, urgent: days <= 7, ended: false };
}

export default async function AdminAdsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ scope?: string; q?: string; page?: string; ok?: string; error?: string }> }>) {
  const sp = await searchParams;
  const scope: AdScope = isAdScope(sp.scope) ? sp.scope : "live";
  const q = sp.q ?? "";
  const page = Math.max(1, Number(sp.page) || 1);

  const { rows, total, failed } = await getAdList({ scope, q, page });
  const qs = (over: Record<string, string> = {}) =>
    new URLSearchParams({ scope, ...(q ? { q } : {}), ...over }).toString();
  const here = `/admin/ads?${qs({ page: String(page) })}`;

  return (
    <>
      <PageTitle
        title="광고 관리"
        desc="어느 병원이 어느 공고에 언제부터 언제까지 광고를 내는지. 워크넷에서 수집한 공고는 우리 광고가 아니라 목록에 넣지 않습니다."
      />
      <Notice ok={sp.ok} error={sp.error} messages={MESSAGES} />

      {/* 🔴 유료·무료로 나누지 않는다(오너 확정 2026-08-04) — 공고를 낸 것은 돈을 냈든 안 냈든 같은 광고다.
          다른 것은 딱 하나, **인재 열람 자격**뿐이라 그건 표에 칸으로 둔다. */}
      <Tabs items={AD_SCOPES.map((s) => ({
        href: `/admin/ads?${qs({ scope: s, page: "1" })}`, label: AD_SCOPE_LABEL[s], active: s === scope,
      }))} />

      <p className="mb-4 text-sm text-slate-500">
        <b className="text-slate-700">{total.toLocaleString()}건</b> · 결제금액이 <b className="text-slate-700">0원</b>인
        광고는 노출은 되지만 <b className="text-slate-700">인재정보를 열람할 수 없습니다.</b>
      </p>

      <SearchBox action="/admin/ads" value={q} placeholder="공고 제목 · 병원명" hidden={{ scope }} />

      {rows.length === 0 ? (
        <EmptyOrFailed failed={failed}>해당하는 광고가 없습니다.</EmptyOrFailed>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <TH>병원</TH><TH>공고</TH><TH className="text-right">결제금액</TH><TH>인재 열람</TH>
              <TH>시작</TH><TH>종료</TH><TH>남은 기간</TH><TH>조치</TH>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const r = remain(a.featured_until);
              const paid = a.paidAmount > 0;
              return (
                <tr key={a.id}>
                  <TD className="font-medium">{a.hospital?.name ?? a.company_name ?? "-"}</TD>
                  <TD>
                    <Link href={`/jobs/${a.id}`} className="text-teal-700 hover:underline">{a.title}</Link>
                    <span className="block text-xs text-slate-400">
                      {a.status === "open" ? "게시중" : a.status === "hidden" ? "숨김" : a.status}
                      {a.source !== "direct" && ` · ${a.source}`}
                    </span>
                  </TD>
                  <TD className="whitespace-nowrap text-right">
                    {paid ? (
                      <>
                        <b className="text-slate-900">{won(a.paidAmount)}</b>
                        {a.orderCount > 1 && <span className="block text-xs text-slate-400">{a.orderCount}건 결제</span>}
                      </>
                    ) : (
                      <span className="text-slate-400">0원 (무료)</span>
                    )}
                  </TD>
                  <TD>
                    {/* 돈을 안 낸 광고는 인재를 못 본다(오너 확정). 판정은 DB(is_talent_advertiser)가 한다. */}
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${
                      paid && !r.ended ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-600"
                    }`}>
                      {paid && !r.ended ? "가능" : "불가"}
                    </span>
                  </TD>
                  <TD className="whitespace-nowrap">{fmtDay(a.posted_at)}</TD>
                  <TD className="whitespace-nowrap">{a.featured_until ? fmtDay(a.featured_until) : "-"}</TD>
                  <TD className="whitespace-nowrap">
                    <span className={r.ended ? "text-slate-500" : r.urgent ? "font-semibold text-red-700" : "font-semibold text-teal-700"}>
                      {r.text}
                    </span>
                  </TD>
                  <TD>
                    <div className="flex flex-col gap-2">
                      <form action={extendAd} className="flex flex-wrap items-center gap-1.5">
                        <input type="hidden" name="job_id" value={a.id} />
                        <input type="hidden" name="back" value={here} />
                        <label>
                          <span className="sr-only">연장 일수</span>
                          <input name="days" type="number" min={1} max={365} defaultValue={7} required
                            className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-teal-500" />
                        </label>
                        <label className="min-w-0">
                          <span className="sr-only">연장 사유</span>
                          <input name="reason" required minLength={2} maxLength={200} placeholder="연장 사유"
                            className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-teal-500" />
                        </label>
                        <ConfirmSubmit variant="outline" message="광고 기간을 연장합니다. 사유가 기록됩니다.">
                          {r.ended ? "다시 켜기" : "연장"}
                        </ConfirmSubmit>
                      </form>
                      {!r.ended && (
                        <form action={endAd} className="flex flex-wrap items-center gap-1.5">
                          <input type="hidden" name="job_id" value={a.id} />
                          <input type="hidden" name="back" value={here} />
                          <label className="min-w-0">
                            <span className="sr-only">종료 사유</span>
                            <input name="reason" required minLength={2} maxLength={200} placeholder="종료 사유"
                              className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-teal-500" />
                          </label>
                          {/* 🔴 손님 요청으로 무르는 기능이 아니다 — 사고 대응용이다(오너 확정: 환불 없음). */}
                          <ConfirmSubmit variant="danger" message="이 광고를 지금 즉시 내립니다. 환불은 되지 않습니다. 계속할까요?">
                            즉시 종료
                          </ConfirmSubmit>
                        </form>
                      )}
                    </div>
                  </TD>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}

      <Pager page={page} totalPages={Math.max(1, Math.ceil(total / PER_PAGE))} href={(n) => `/admin/ads?${qs({ page: String(n) })}`} />
    </>
  );
}
