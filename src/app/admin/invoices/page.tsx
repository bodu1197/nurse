import { Pager } from "@/components/MasterDetail";
import { fmtDay } from "@/lib/date";
import { won } from "@/lib/ads";
import { getTaxTargets, PER_PAGE } from "@/lib/data/adminLists";
import { PageTitle, Tabs, Empty, Notice } from "@/components/admin/Ui";
import { saveTaxInfo, markTaxIssued } from "@/app/admin/actions";

export const metadata = { title: "세금계산서 — 관리자" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  "1": "저장했습니다.",
  issued: "발행 완료로 표시했습니다.",
  bizno: "사업자등록번호는 숫자 10자리로 적어주세요.",
  target: "대상 주문을 찾을 수 없습니다.",
  save: "저장에 실패했습니다.",
};

/**
 * 세금계산서.
 *
 * 🔴 여기서 실제 발행이 나가지는 않는다. 전자세금계산서는 홈택스나 팝빌 같은 발행 대행에
 *    사업자 계약과 인증서가 있어야 하고, 지금 이 프로젝트에는 그 연동이 없다.
 *    대신 **발행에 필요한 정보와 발행 여부**를 여기서 관리한다 —
 *    누구에게 얼마짜리를 아직 안 끊었는지 화면에서 알 수 있어야 세금계산서가 누락되지 않는다.
 *    실제 발행은 홈택스에서 하고, 끝나면 여기에 발행 완료로 표시한다.
 */
export default async function AdminInvoicesPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ issued?: string; page?: string; ok?: string; error?: string }> }>) {
  const sp = await searchParams;
  const issued = sp.issued === "1";
  const page = Math.max(1, Number(sp.page) || 1);

  const { rows, total } = await getTaxTargets({ issued, page });
  const qs = (over: Record<string, string> = {}) =>
    new URLSearchParams({ ...(issued ? { issued: "1" } : {}), ...over }).toString();
  const here = `/admin/invoices?${qs({ page: String(page) })}`;

  return (
    <>
      <PageTitle
        title="세금계산서"
        desc="결제된 광고의 계산서 발행 현황입니다. 발행 자체는 홈택스에서 하고, 끝나면 여기에 표시합니다."
      />
      <Notice ok={sp.ok} error={sp.error} messages={MESSAGES} />

      <Tabs items={[
        { href: `/admin/invoices?${qs({ issued: "", page: "1" })}`, label: "미발행", active: !issued },
        { href: `/admin/invoices?${qs({ issued: "1", page: "1" })}`, label: "발행완료", active: issued },
      ]} />

      {rows.length === 0 ? (
        <Empty>{issued ? "발행 완료한 건이 없습니다." : "발행할 건이 없습니다."}</Empty>
      ) : (
        <div className="space-y-3">
          {rows.map((o) => (
            <article key={o.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">{o.hospital?.name ?? "-"}</p>
                  <p className="text-xs text-slate-500">
                    {o.paid_at ? fmtDay(o.paid_at) : "-"} 결제 · {o.job?.title ?? "삭제된 공고"} · {o.days}일
                  </p>
                </div>
                <p className="text-right text-sm">
                  <span className="font-bold text-slate-900">{won(o.amount)}</span>
                  <span className="block text-xs text-slate-500">공급가 {won(o.supply_amount)} · 부가세 {won(o.vat)}</span>
                </p>
              </div>

              <form action={saveTaxInfo} className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-4">
                <input type="hidden" name="id" value={o.id} />
                <input type="hidden" name="back" value={here} />
                <Field name="biz_no" label="사업자등록번호" value={o.tax_biz_no} placeholder="숫자 10자리" />
                <Field name="biz_name" label="상호" value={o.tax_biz_name} placeholder="상호" />
                <Field name="ceo" label="대표자" value={o.tax_ceo} placeholder="대표자명" />
                <Field name="email" label="계산서 수신 이메일" value={o.tax_email} placeholder="tax@example.com" type="email" />
                <div className="sm:col-span-2 lg:col-span-4">
                  <button type="submit" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
                    발행 정보 저장
                  </button>
                </div>
              </form>

              {o.tax_issued_at ? (
                <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-teal-800">
                  <b>발행 완료</b> · {fmtDay(o.tax_issued_at)}
                  {o.tax_invoice_no && <span className="ml-2 text-slate-500">승인번호 {o.tax_invoice_no}</span>}
                </p>
              ) : (
                <form action={markTaxIssued} className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  <input type="hidden" name="id" value={o.id} />
                  <input type="hidden" name="back" value={here} />
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">국세청 승인번호</span>
                    <input name="invoice_no" maxLength={40} placeholder="국세청 승인번호(선택)"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus-visible:ring-2 focus-visible:ring-teal-600" />
                  </label>
                  <button type="submit" className="inline-flex min-h-11 items-center rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
                    발행 완료로 표시
                  </button>
                </form>
              )}
            </article>
          ))}
        </div>
      )}

      <Pager page={page} totalPages={Math.max(1, Math.ceil(total / PER_PAGE))} href={(n) => `/admin/invoices?${qs({ page: String(n) })}`} />
    </>
  );
}

function Field({ name, label, value, placeholder, type = "text" }: Readonly<{
  name: string; label: string; value: string | null; placeholder: string; type?: string;
}>) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-xs font-medium text-slate-500">{label}</span>
      <input name={name} type={type} defaultValue={value ?? ""} placeholder={placeholder} maxLength={100}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus-visible:ring-2 focus-visible:ring-teal-600" />
    </label>
  );
}
