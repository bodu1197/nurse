import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import { getMyProfile } from "@/lib/data/user";
import { getMySavedSearches } from "@/lib/data/jobs";
import { deleteSavedSearch } from "../actions";

export const metadata = { title: "채용 알림 — 널스넷", robots: { index: false } };

export default async function AlertsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ error?: string }> }>) {
  const p = await getMyProfile();
  if (!p) redirect("/login");
  // 다른 마이페이지 화면과 같은 역할 검사 — 여기만 빠져 있어 병원 계정도 열 수 있었다.
  if (p.role !== "nurse") redirect("/mypage");
  const [{ error }, searches] = await Promise.all([searchParams, getMySavedSearches()]);

  const toHref = (kw: string | null, loc: string | null) => {
    const q = new URLSearchParams();
    if (kw) q.set("q", kw);
    if (loc) q.set("l", loc);
    const s = q.toString();
    return "/jobs" + (s ? `?${s}` : "");
  };

  return (
    <>
      <SiteHeader user={{ displayName: p.displayName }} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <a href="/mypage" className="text-sm text-teal-700 hover:underline">← 마이페이지</a>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">채용 알림</h1>
        <p className="mt-1 text-sm text-slate-500">검색 조건을 저장해두면 같은 조건으로 빠르게 다시 찾을 수 있습니다. 새 공고 이메일 알림은 곧 제공됩니다.</p>
        {error === "1" && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">삭제에 실패했습니다. 다시 시도해 주세요.</div>}

        {searches.length === 0 ? (
          <p className="py-20 text-center text-slate-500">
            저장한 검색이 없습니다. <Link href="/jobs" className="font-semibold text-teal-700 hover:underline">채용 검색</Link>에서 “검색 저장”을 눌러보세요.
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {searches.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <a href={toHref(s.keyword, s.location)} className="min-w-0 font-medium text-slate-800 hover:text-teal-700">
                  {[s.keyword, s.location].filter(Boolean).join(" · ") || "전체 공고"}
                </a>
                <form action={deleteSavedSearch} className="inline">
                  <input type="hidden" name="id" value={s.id} />
                  <Button type="submit" variant="danger" size="sm" className="shrink-0">삭제</Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
