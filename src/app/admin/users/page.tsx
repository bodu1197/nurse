import { Pager } from "@/components/MasterDetail";
import { fmtDay } from "@/lib/date";
import { getUsers, PER_PAGE } from "@/lib/data/adminLists";
import { PageTitle, Tabs, SearchBox, TableWrap, TH, TD, Empty } from "@/components/admin/Ui";

export const metadata = { title: "회원 현황 — 관리자" };
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = { nurse: "간호사", hospital: "병원", admin: "관리자" };

export default async function AdminUsersPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ q?: string; role?: string; page?: string }> }>) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const role = sp.role ?? "";
  const page = Math.max(1, Number(sp.page) || 1);

  const { rows, total } = await getUsers({ q, role, page });
  const href = (r: string) => `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), ...(r ? { role: r } : {}) })}`;

  return (
    <>
      <PageTitle title="회원 현황" desc={`${total.toLocaleString()}명 — 이름·아이디·이메일·전화로 찾습니다.`} />

      <Tabs items={[
        { href: href(""), label: "전체", active: role === "" },
        { href: href("nurse"), label: "간호사", active: role === "nurse" },
        { href: href("hospital"), label: "병원", active: role === "hospital" },
        { href: href("admin"), label: "관리자", active: role === "admin" },
      ]} />

      <SearchBox action="/admin/users" value={q} placeholder="이름 · 아이디 · 이메일 · 전화번호" hidden={role ? { role } : {}} />

      {rows.length === 0 ? (
        <Empty>{q || role ? "해당 조건에 맞는 회원이 없습니다." : "회원이 없습니다."}</Empty>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <TH>이름</TH><TH>아이디</TH><TH>이메일</TH><TH>연락처</TH><TH>구분</TH><TH>사업자</TH><TH>가입일</TH>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <TD className="font-medium">{u.display_name ?? "-"}</TD>
                <TD>{u.username ?? "-"}</TD>
                <TD className="break-all">{u.email ?? "-"}</TD>
                <TD>{u.phone_number ?? "-"}</TD>
                <TD>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    u.role === "admin" ? "bg-slate-800 text-white" : u.role === "hospital" ? "bg-sky-50 text-sky-700" : "bg-teal-50 text-teal-700"
                  }`}>{ROLE_LABEL[u.role] ?? u.role}</span>
                </TD>
                <TD>{u.role === "hospital" ? (u.business_verified ? "인증" : "미인증") : "-"}</TD>
                <TD className="whitespace-nowrap">{fmtDay(u.created_at)}</TD>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <Pager page={page} totalPages={Math.max(1, Math.ceil(total / PER_PAGE))}
        href={(n) => `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), ...(role ? { role } : {}), page: String(n) })}`} />
    </>
  );
}
