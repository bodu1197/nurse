import Link from "next/link";
import { Pager } from "@/components/MasterDetail";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { fmtDay, DAY_MS, FREE_LISTING_MS, nowMs } from "@/lib/date";
import { won } from "@/lib/ads";
import { getAdList, PER_PAGE, AD_KINDS, AD_KIND_LABEL, isAdKind, type AdKind } from "@/lib/data/adminLists";
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

const KIND_DESC: Record<AdKind, string> = {
  paid: "병원이 돈을 내고 산 광고입니다. 결제 금액과 남은 기간을 확인하세요.",
  granted: "관리자가 결제 없이 켜준 광고입니다(0원). 매출에 잡히지 않습니다.",
  free: "광고를 사지 않은 공고입니다. 등록 후 7일 동안 그냥 보입니다(병원당 동시 1건).",
  ended: "광고 기간이 끝난 공고입니다.",
};

const BADGE: Record<AdKind, string> = {
  paid: "bg-teal-50 text-teal-700",
  granted: "bg-amber-50 text-amber-700",
  free: "bg-slate-100 text-slate-600",
  ended: "bg-slate-100 text-slate-500",
};

/** 남은 기간을 사람이 읽는 말로. 끝났으면 며칠 전에 끝났는지. */
function remain(untilMs: number): { text: string; urgent: boolean; ended: boolean } {
  const diff = untilMs - nowMs();
  if (diff <= 0) return { text: `${Math.ceil(-diff / DAY_MS)}일 전 종료`, urgent: false, ended: true };
  const days = Math.ceil(diff / DAY_MS);
  return { text: `${days}일 남음`, urgent: days <= 7, ended: false };
}

export default async function AdminAdsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ kind?: string; q?: string; page?: string; ok?: string; error?: string }> }>) {
  const sp = await searchParams;
  const kind: AdKind = isAdKind(sp.kind) ? sp.kind : "paid";
  const q = sp.q ?? "";
  const page = Math.max(1, Number(sp.page) || 1);

  const { rows, total, failed } = await getAdList({ kind, q, page });
  const qs = (over: Record<string, string> = {}) =>
    new URLSearchParams({ kind, ...(q ? { q } : {}), ...over }).toString();
  const here = `/admin/ads?${qs({ page: String(page) })}`;

  return (
    <>
      <PageTitle
        title="광고 관리"
        desc="어느 병원이 어느 공고에 언제부터 언제까지 광고를 내는지. 기간 연장과 즉시 종료를 여기서 합니다. 워크넷에서 수집한 공고는 우리 광고가 아니라 목록에 넣지 않습니다."
      />
      <Notice ok={sp.ok} error={sp.error} messages={MESSAGES} />

      <Tabs items={AD_KINDS.map((k) => ({
        href: `/admin/ads?${qs({ kind: k, page: "1" })}`, label: AD_KIND_LABEL[k], active: k === kind,
      }))} />

      <p className="mb-4 text-sm text-slate-500">
        {KIND_DESC[kind]} <b className="text-slate-700">{total.toLocaleString()}건</b>
      </p>

      <SearchBox action="/admin/ads" value={q} placeholder="공고 제목 · 병원명" hidden={{ kind }} />

      {rows.length === 0 ? (
        <EmptyOrFailed failed={failed}>해당하는 공고가 없습니다.</EmptyOrFailed>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <TH>병원</TH><TH>공고</TH><TH>유형</TH><TH className="text-right">결제금액</TH>
              <TH>시작</TH><TH>종료</TH><TH>남은 기간</TH><TH>조치</TH>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              // 무료 게시는 featured_until 이 없다 — 등록일 + 7일이 노출 끝이다(freeSlotTaken 과 같은 규칙).
              const isFree = kind === "free";
              const endMs = isFree
                ? new Date(a.posted_at).getTime() + FREE_LISTING_MS
                : a.featured_until ? new Date(a.featured_until).getTime() : 0;
              const r = remain(endMs);
              const rowKind: AdKind = isFree ? "free" : a.ad_tier === "admin_test" ? "granted" : r.ended ? "ended" : "paid";
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
                  <TD>
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[rowKind]}`}>
                      {AD_KIND_LABEL[rowKind]}
                    </span>
                  </TD>
                  <TD className="whitespace-nowrap text-right">
                    {a.paidAmount > 0 ? (
                      <>
                        <b className="text-slate-900">{won(a.paidAmount)}</b>
                        {a.orderCount > 1 && <span className="block text-xs text-slate-400">{a.orderCount}건 결제</span>}
                      </>
                    ) : (
                      <span className="text-slate-400">무료</span>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap">{fmtDay(a.posted_at)}</TD>
                  <TD className="whitespace-nowrap">{endMs ? fmtDay(new Date(endMs).toISOString()) : "-"}</TD>
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
                          {isFree || r.ended ? "광고 켜기" : "연장"}
                        </ConfirmSubmit>
                      </form>
                      {!r.ended && !isFree && (
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
