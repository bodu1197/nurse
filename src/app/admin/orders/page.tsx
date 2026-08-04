import Link from "next/link";
import { Pager } from "@/components/MasterDetail";
import { fmtDay } from "@/lib/date";
import { won } from "@/lib/ads";
import { getOrders, PER_PAGE } from "@/lib/data/adminLists";
import { PageTitle, Tabs, SearchBox, TableWrap, TH, TD, EmptyOrFailed } from "@/components/admin/Ui";

export const metadata = { title: "결제 내역 — 관리자" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PAID: "결제완료", PREPARE: "미결", FAILED: "실패", CANCELED: "결제 미진행",
};
const STATUS_CLASS: Record<string, string> = {
  PAID: "bg-teal-50 text-teal-700",
  PREPARE: "bg-amber-50 text-amber-700",
  FAILED: "bg-red-50 text-red-700",
  CANCELED: "bg-slate-100 text-slate-600",
};

export default async function AdminOrdersPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ status?: string; q?: string; page?: string }> }>) {
  const sp = await searchParams;
  const status = sp.status ?? "";
  const q = sp.q ?? "";
  const page = Math.max(1, Number(sp.page) || 1);

  const { rows, total, failed } = await getOrders({ status, q, page });
  const qs = (over: Record<string, string> = {}) =>
    new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}), ...over }).toString();

  return (
    <>
      <PageTitle title="결제 내역" desc={`${total.toLocaleString()}건 — 주문번호·포트원 거래번호로 찾습니다.`} />

      <Tabs items={[
        { href: `/admin/orders?${qs({ status: "", page: "1" })}`, label: "전체", active: status === "" },
        { href: `/admin/orders?${qs({ status: "PAID", page: "1" })}`, label: "결제완료", active: status === "PAID" },
        { href: `/admin/orders?${qs({ status: "PREPARE", page: "1" })}`, label: "미결", active: status === "PREPARE" },
        { href: `/admin/orders?${qs({ status: "FAILED", page: "1" })}`, label: "실패", active: status === "FAILED" },
        { href: `/admin/orders?${qs({ status: "CANCELED", page: "1" })}`, label: "결제 미진행", active: status === "CANCELED" },
      ]} />

      <SearchBox action="/admin/orders" value={q} placeholder="주문번호(ad_...) · 포트원 거래번호(imp_...)"
        hidden={status ? { status } : {}} />

      {rows.length === 0 ? (
        <EmptyOrFailed failed={failed}>해당하는 주문이 없습니다.</EmptyOrFailed>
      ) : (
        <TableWrap>
          <thead>
            <tr><TH>주문일</TH><TH>병원</TH><TH>공고</TH><TH>상품</TH><TH className="text-right">금액</TH><TH>상태</TH><TH>결제일</TH><TH>비고</TH></tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <TD className="whitespace-nowrap">{fmtDay(o.created_at)}</TD>
                <TD className="font-medium">{o.hospital?.name ?? "-"}</TD>
                <TD>
                  {o.job ? <Link href={`/jobs/${o.job.id}`} className="text-teal-700 hover:underline">{o.job.title}</Link>
                        : <span className="text-slate-400">삭제된 공고</span>}
                </TD>
                <TD className="whitespace-nowrap">
                  {o.days}일{o.tier === "admin_test" && <span className="ml-1 rounded bg-slate-100 px-1 text-xs text-slate-500">테스트</span>}
                </TD>
                <TD className="whitespace-nowrap text-right font-semibold">{won(o.amount)}</TD>
                <TD>
                  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[o.status] ?? "bg-slate-100 text-slate-600"}`}>
                    {STATUS_LABEL[o.status] ?? o.status}
                  </span>
                </TD>
                <TD className="whitespace-nowrap">{o.paid_at ? fmtDay(o.paid_at) : "-"}</TD>
                <TD className="max-w-[22rem]">
                  {o.note ? <span className="whitespace-pre-wrap text-xs text-red-700">{o.note}</span> : <span className="text-slate-300">-</span>}
                  {o.imp_uid && <span className="mt-0.5 block break-all text-[11px] text-slate-400">{o.imp_uid}</span>}
                </TD>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <Pager page={page} totalPages={Math.max(1, Math.ceil(total / PER_PAGE))} href={(n) => `/admin/orders?${qs({ page: String(n) })}`} />
    </>
  );
}
