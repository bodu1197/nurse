import { Pager } from "@/components/MasterDetail";
import { fmtDay } from "@/lib/date";
import { getUsers, PER_PAGE, SIGNUP_PROVIDERS, SIGNUP_LABEL } from "@/lib/data/adminLists";
import { PageTitle, Tabs, SearchBox, TableWrap, TH, TD, EmptyOrFailed } from "@/components/admin/Ui";

export const metadata = { title: "회원 현황 — 관리자" };
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = { nurse: "간호사", hospital: "병원", admin: "관리자" };

export default async function AdminUsersPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ q?: string; role?: string; provider?: string; page?: string }> }>) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const role = sp.role ?? "";
  const provider = sp.provider ?? "";
  const page = Math.max(1, Number(sp.page) || 1);

  const { rows, total, failed } = await getUsers({ q, role, provider, page });
  const qs = (over: Record<string, string> = {}) => new URLSearchParams({
    ...(q ? { q } : {}), ...(role ? { role } : {}), ...(provider ? { provider } : {}), ...over,
  }).toString();
  const href = (r: string) => `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), ...(r ? { role: r } : {}), ...(provider ? { provider } : {}) })}`;

  return (
    <>
      <PageTitle title="회원 현황" desc={`${total.toLocaleString()}명 — 이름·아이디·이메일·전화로 찾습니다.`} />

      <Tabs items={[
        { href: href(""), label: "전체", active: role === "" },
        { href: href("nurse"), label: "간호사", active: role === "nurse" },
        { href: href("hospital"), label: "병원", active: role === "hospital" },
        { href: href("admin"), label: "관리자", active: role === "admin" },
      ]} />

      {/* 가입 경로 — 이메일 가입인지 카카오·네이버인지, 구 널스넷에서 옮겨온 회원인지 */}
      <Tabs items={[
        { href: `/admin/users?${qs({ provider: "", page: "1" })}`, label: "가입경로 전체", active: provider === "" },
        ...SIGNUP_PROVIDERS.map((p) => ({
          href: `/admin/users?${qs({ provider: p, page: "1" })}`, label: SIGNUP_LABEL[p], active: provider === p,
        })),
      ]} />

      <SearchBox action="/admin/users" value={q} placeholder="이름 · 아이디 · 이메일 · 전화번호"
        hidden={{ ...(role ? { role } : {}), ...(provider ? { provider } : {}) }} />

      {rows.length === 0 ? (
        <EmptyOrFailed failed={failed}>{q || role ? "해당 조건에 맞는 회원이 없습니다." : "회원이 없습니다."}</EmptyOrFailed>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <TH>이름</TH><TH>아이디</TH><TH>이메일</TH><TH>연락처</TH><TH>구분</TH><TH>가입경로</TH><TH>사업자</TH><TH>가입일</TH>
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
                <TD>
                  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${
                    u.signup_provider === "kakao" ? "bg-amber-50 text-amber-800"
                      : u.signup_provider === "naver" ? "bg-emerald-50 text-emerald-700"
                      : u.signup_provider === "legacy" ? "bg-slate-100 text-slate-500"
                      : "bg-sky-50 text-sky-700"
                  }`}>{SIGNUP_LABEL[u.signup_provider ?? "email"] ?? u.signup_provider}</span>
                </TD>
                <TD>{u.role === "hospital" ? (u.business_verified ? "인증" : "미인증") : "-"}</TD>
                <TD className="whitespace-nowrap">{fmtDay(u.created_at)}</TD>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <Pager page={page} totalPages={Math.max(1, Math.ceil(total / PER_PAGE))}
        href={(n) => `/admin/users?${qs({ page: String(n) })}`} />
    </>
  );
}
