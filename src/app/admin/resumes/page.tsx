import { Pager } from "@/components/MasterDetail";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { fmtDay } from "@/lib/date";
import { getResumeList, PER_PAGE } from "@/lib/data/adminLists";
import { PageTitle, Tabs, SearchBox, TableWrap, TH, TD, EmptyOrFailed, Notice } from "@/components/admin/Ui";
import { setResumeVisibility } from "@/app/admin/actions";

export const metadata = { title: "이력서 목록 — 관리자" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  "1": "처리했습니다. 기록이 남았습니다.",
  reason: "사유를 두 글자 이상 적어야 합니다.",
  target: "대상을 찾을 수 없습니다.",
  save: "저장에 실패했습니다.",
};

export default async function AdminResumesPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ q?: string; v?: string; page?: string; ok?: string; error?: string }> }>) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const visibility = sp.v ?? "";
  const page = Math.max(1, Number(sp.page) || 1);

  const { rows, total, failed } = await getResumeList({ q, visibility, page });
  const qs = (over: Record<string, string> = {}) =>
    new URLSearchParams({ ...(q ? { q } : {}), ...(visibility ? { v: visibility } : {}), ...over }).toString();
  const here = `/admin/resumes?${qs({ page: String(page) })}`;

  return (
    <>
      <PageTitle
        title="이력서 목록"
        desc={`${total.toLocaleString()}건 — 공개 이력서는 광고 중인 병원에게 이름·연락처가 열립니다. 문제가 있으면 비공개로 내립니다.`}
      />
      <Notice ok={sp.ok} error={sp.error} messages={MESSAGES} />

      <Tabs items={[
        { href: `/admin/resumes?${qs({ v: "" })}`, label: "전체", active: visibility === "" },
        { href: `/admin/resumes?${qs({ v: "public" })}`, label: "공개", active: visibility === "public" },
        { href: `/admin/resumes?${qs({ v: "private" })}`, label: "비공개", active: visibility === "private" },
      ]} />

      <SearchBox action="/admin/resumes" value={q} placeholder="이력서 제목 · 이름 · 지역" hidden={visibility ? { v: visibility } : {}} />

      {rows.length === 0 ? (
        <EmptyOrFailed failed={failed}>{q || visibility ? "해당 조건에 맞는 이력서가 없습니다." : "이력서가 없습니다."}</EmptyOrFailed>
      ) : (
        <TableWrap>
          <thead>
            <tr><TH>작성자</TH><TH>제목</TH><TH>경력</TH><TH>지역</TH><TH>상태</TH><TH>수정일</TH><TH>조치</TH></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.profile_id}>
                <TD className="font-medium">
                  {r.name ?? "-"}
                  <span className="block text-xs text-slate-400">{r.email ?? ""}</span>
                </TD>
                <TD>{r.resume_title ?? "(제목 없음)"}</TD>
                <TD className="whitespace-nowrap">{r.career_level ?? "-"}{r.experience_years != null ? ` ${r.experience_years}년` : ""}</TD>
                <TD className="whitespace-nowrap">{r.residence_region ?? "-"}</TD>
                <TD>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.is_public ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-600"}`}>
                    {r.is_public ? "공개" : "비공개"}
                  </span>
                </TD>
                <TD className="whitespace-nowrap">{fmtDay(r.updated_at)}</TD>
                <TD>
                  <form action={setResumeVisibility} className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                    <input type="hidden" name="id" value={r.profile_id} />
                    <input type="hidden" name="public" value={r.is_public ? "0" : "1"} />
                    <input type="hidden" name="back" value={here} />
                    <label className="min-w-0">
                      <span className="sr-only">사유</span>
                      <input name="reason" required minLength={2} maxLength={200}
                        placeholder={r.is_public ? "비공개 사유" : "공개 전환 사유"}
                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-teal-500 focus-visible:ring-2 focus-visible:ring-teal-600 sm:w-36" />
                    </label>
                    <ConfirmSubmit variant="outline"
                      message={r.is_public ? "이 이력서를 비공개로 내립니다. 사유가 기록됩니다." : "이 이력서를 다시 공개합니다."}>
                      {r.is_public ? "비공개" : "공개"}
                    </ConfirmSubmit>
                  </form>
                </TD>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <Pager page={page} totalPages={Math.max(1, Math.ceil(total / PER_PAGE))}
        href={(n) => `/admin/resumes?${qs({ page: String(n) })}`} />
    </>
  );
}
