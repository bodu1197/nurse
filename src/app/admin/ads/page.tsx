import Link from "next/link";
import { Pager } from "@/components/MasterDetail";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { fmtDay, fmtDate, listingEnd, DAY_MS, nowMs } from "@/lib/date";
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
/**
 * 노출이 언제 끝나는가.
 *
 * 🔴 featured_until 만 보면 안 된다. 광고를 안 낸 공고는 그 값이 비어 있어서 종료·남은 기간이
 *    통째로 "-" 로 나왔다 — 목록에 줄은 있는데 아무 정보가 없었다(오너 지적 2026-08-04).
 *    광고가 없어도 **무료 게시 7일** 동안은 노출된다. listingEnd 가 그 규칙(광고 > 무료 7일,
 *    마감일이 이르면 마감일)을 이미 갖고 있으니 구직자 화면과 같은 계산을 쓴다.
 */
function remain(endMs: number) {
  const diff = endMs - nowMs();
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
        title="공고 관리"
        desc="우리 공고는 돈을 냈든 안 냈든 전부 여기 있습니다. 돈을 냈는지는 「결제」 칸에서 봅니다. 워크넷에서 수집한 공고는 우리 것이 아니라 넣지 않습니다."
      />
      <Notice ok={sp.ok} error={sp.error} messages={MESSAGES} />

      {/* 🔴 개념(오너 확정 2026-08-04): **공고가 본체다.** 유료든 무료든 공고는 공고다.
          돈을 냈는지는 그 공고의 **결제 구분**일 뿐이라 목록을 나누지 않고 칸으로 보여준다.
          그 구분이 실제로 바꾸는 것은 딱 하나 — 인재 열람 자격이다. */}
      <Tabs items={AD_SCOPES.map((s) => ({
        href: `/admin/ads?${qs({ scope: s, page: "1" })}`, label: AD_SCOPE_LABEL[s], active: s === scope,
      }))} />

      <p className="mb-4 text-sm text-slate-500">
        <b className="text-slate-700">{total.toLocaleString()}건</b> · 돈을 내지 않은 공고는 노출은 되지만{" "}
        <b className="text-slate-700">인재정보를 열람할 수 없습니다.</b>
      </p>

      <SearchBox action="/admin/ads" value={q} placeholder="공고 제목 · 병원명" hidden={{ scope }} />

      {rows.length === 0 ? (
        <EmptyOrFailed failed={failed}>해당하는 광고가 없습니다.</EmptyOrFailed>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <TH>병원</TH><TH>공고</TH><TH className="text-right">결제</TH><TH>인재 열람</TH>
              <TH>시작</TH><TH>종료</TH><TH>남은 기간</TH><TH>조치</TH>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const endMs = listingEnd(a, nowMs());
              const r = remain(endMs);
              const paid = a.paidAmount > 0;
              return (
                <tr key={a.id}>
                  <TD className="font-medium">{a.hospital?.name ?? a.company_name ?? "-"}</TD>
                  <TD>
                    <Link href={`/jobs/${a.id}`} className="text-teal-700 hover:underline">{a.title}</Link>
                    {/* 🔴 status 를 그대로 적으면 안 된다. 기간이 지난 공고도 status 는 'open' 이라
                        「노출 마감」 탭에서 "게시중" 이라고 적혀 있었다(오너 지적 2026-08-04).
                        구직자에게 실제로 보이는지를 적는다. */}
                    <span className="block text-xs text-slate-400">
                      {a.status === "hidden" ? "숨김"
                        : a.status === "draft" ? "결제 전"
                        : a.status === "closed" ? "종료"
                        : r.ended ? "노출 종료" : "게시중"}
                      {a.source !== "direct" && ` · ${a.source}`}
                    </span>
                  </TD>
                  <TD className="whitespace-nowrap text-right">
                    {/* 🔴 유료·무료는 **여기 한 줄**에서만 구분한다(오너 확정 2026-08-04).
                        공고는 유료든 무료든 다 공고이자 광고다 — 목록을 나누거나 종료 칸에
                        또 적으면 같은 말을 두 번 하는 것이고 표가 읽기 어려워진다. */}
                    {paid ? (
                      <span className="whitespace-nowrap">
                        <span className="mr-1.5 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">유료</span>
                        <b className="text-slate-900">{won(a.paidAmount)}</b>
                        {a.orderCount > 1 && <span className="ml-1 text-xs text-slate-400">({a.orderCount}건)</span>}
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">무료</span>
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
                  {/* 🔴 "광고 / 무료 게시" 로 나눠 적지 않는다 — 무료나 유료나 **모두 공고이고
                      광고다**(오너 확정 2026-08-04). 종료일 한 줄이면 된다. */}
                  <TD className="whitespace-nowrap">{fmtDate(endMs)}</TD>
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
                          {!a.featured_until ? "광고 부여" : r.ended ? "다시 켜기" : "연장"}
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
