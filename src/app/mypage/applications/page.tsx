import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getMyProfile } from "@/lib/data/user";
import { getMyApplications, STATUS_LABEL } from "@/lib/data/applications";

export const metadata = { title: "지원 내역 — 널스넷", robots: { index: false } };

const fmt = (iso: string) => new Date(iso).toISOString().slice(0, 10).replace(/-/g, ".");
const tone: Record<string, string> = {
  submitted: "bg-slate-100 text-slate-600",
  viewed: "bg-blue-100 text-blue-700",
  accepted: "bg-teal-100 text-teal-800",
  rejected: "bg-red-100 text-red-700",
};

export default async function ApplicationsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ ok?: string; dup?: string }> }>) {
  const p = await getMyProfile();
  if (!p) redirect("/login");
  if (p.role !== "nurse") redirect("/mypage");
  const [{ ok, dup }, apps] = await Promise.all([searchParams, getMyApplications()]);

  return (
    <>
      <SiteHeader user={{ displayName: p.displayName }} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <a href="/mypage" className="text-sm text-teal-700 hover:underline">← 마이페이지</a>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">지원 내역</h1>

        {ok === "1" && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">지원이 완료되었습니다.</div>}
        {dup === "1" && <div role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">이미 지원한 공고입니다.</div>}

        {apps.length === 0 ? (
          <p className="py-20 text-center text-slate-500">
            아직 지원한 공고가 없습니다. <a href="/jobs" className="font-semibold text-teal-700 hover:underline">채용 공고 보러가기</a>
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {apps.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <div className="min-w-0">
                  <a href={a.job ? `/jobs?j=${a.job.id}` : "/jobs"} className="font-semibold text-slate-900 hover:text-teal-700">{a.job?.title ?? "공고"}</a>
                  <div className="text-sm text-slate-500">{a.job?.hospital?.name ?? ""} · {fmt(a.created_at)}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${tone[a.status] ?? tone.submitted}`}>{STATUS_LABEL[a.status] ?? a.status}</span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
