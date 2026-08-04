import { Pager } from "@/components/MasterDetail";
import { fmtDay } from "@/lib/date";
import { getInquiries, PER_PAGE, INQUIRY_KIND_LABEL, INQUIRY_STATUS_LABEL } from "@/lib/data/adminLists";
import { PageTitle, Tabs, EmptyOrFailed, Notice } from "@/components/admin/Ui";
import { saveInquiry } from "@/app/admin/actions";

export const metadata = { title: "문의사항 — 관리자" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  "1": "저장했습니다.",
  target: "대상을 찾을 수 없습니다.",
  save: "저장에 실패했습니다.",
};

const STATUS_CLASS: Record<string, string> = {
  open: "bg-amber-50 text-amber-700",
  answered: "bg-teal-50 text-teal-700",
  closed: "bg-slate-100 text-slate-600",
};

export default async function AdminInquiriesPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ status?: string; page?: string; ok?: string; error?: string }> }>) {
  const sp = await searchParams;
  const status = sp.status ?? "open";
  const page = Math.max(1, Number(sp.page) || 1);

  const { rows, total, failed } = await getInquiries({ status, page });
  const qs = (over: Record<string, string> = {}) => new URLSearchParams({ status, ...over }).toString();
  const here = `/admin/inquiries?${qs({ page: String(page) })}`;

  return (
    <>
      <PageTitle title="문의사항" desc="사이트 문의 폼으로 들어온 내용입니다. 답변은 이메일로 보내고, 여기에 처리 상태를 남깁니다." />
      <Notice ok={sp.ok} error={sp.error} messages={MESSAGES} />

      <Tabs items={[
        { href: `/admin/inquiries?${qs({ status: "open", page: "1" })}`, label: "미처리", active: status === "open" },
        { href: `/admin/inquiries?${qs({ status: "answered", page: "1" })}`, label: "답변완료", active: status === "answered" },
        { href: `/admin/inquiries?${qs({ status: "closed", page: "1" })}`, label: "종료", active: status === "closed" },
        { href: `/admin/inquiries?${qs({ status: "all", page: "1" })}`, label: "전체", active: status === "all" },
      ]} />

      {rows.length === 0 ? (
        <EmptyOrFailed failed={failed}>해당하는 문의가 없습니다.</EmptyOrFailed>
      ) : (
        <ul className="space-y-3">
          {rows.map((q) => (
            <li key={q.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_CLASS[q.status] ?? "bg-slate-100"}`}>
                  {INQUIRY_STATUS_LABEL[q.status] ?? q.status}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{INQUIRY_KIND_LABEL[q.kind] ?? q.kind}</span>
                <time dateTime={q.created_at} className="text-slate-400">{fmtDay(q.created_at)}</time>
              </div>

              <h3 className="mt-2 font-semibold text-slate-900">{q.subject}</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {q.name} · <a href={`mailto:${q.email}`} className="text-teal-700 hover:underline">{q.email}</a>
                {q.phone && <> · {q.phone}</>}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{q.body}</p>

              <form action={saveInquiry} className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-end">
                <input type="hidden" name="id" value={q.id} />
                <input type="hidden" name="back" value={here} />
                <label className="min-w-0 flex-1">
                  <span className="mb-0.5 block text-xs font-medium text-slate-500">처리 메모</span>
                  <input name="memo" defaultValue={q.admin_memo ?? ""} maxLength={500} placeholder="어떻게 처리했는지"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus-visible:ring-2 focus-visible:ring-teal-600" />
                </label>
                <label>
                  <span className="mb-0.5 block text-xs font-medium text-slate-500">상태</span>
                  <select name="status" defaultValue={q.status}
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-teal-500 focus-visible:ring-2 focus-visible:ring-teal-600">
                    <option value="open">미처리</option>
                    <option value="answered">답변완료</option>
                    <option value="closed">종료</option>
                  </select>
                </label>
                <button type="submit" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
                  저장
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <Pager page={page} totalPages={Math.max(1, Math.ceil(total / PER_PAGE))} href={(n) => `/admin/inquiries?${qs({ page: String(n) })}`} />
    </>
  );
}
