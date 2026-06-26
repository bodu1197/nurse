import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import { getMyProfile } from "@/lib/data/user";
import { getReceivedApplications, STATUS_LABEL } from "@/lib/data/applications";
import { updateApplicationStatus } from "../actions";

export const metadata = { title: "받은 지원자 — 널스넷", robots: { index: false } };

const fmt = (iso: string) => new Date(iso).toISOString().slice(0, 10).replace(/-/g, ".");
const tone: Record<string, string> = {
  submitted: "bg-slate-100 text-slate-600",
  viewed: "bg-blue-100 text-blue-700",
  accepted: "bg-teal-100 text-teal-800",
  rejected: "bg-red-100 text-red-700",
};

function StatusButton({ id, status, label, variant }: { id: string; status: string; label: string; variant: "primary" | "outline" }) {
  return (
    <form action={updateApplicationStatus} className="inline">
      <input type="hidden" name="application_id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" variant={variant} size="sm">{label}</Button>
    </form>
  );
}

export default async function ApplicantsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ ok?: string; error?: string }> }>) {
  const p = await getMyProfile();
  if (!p) redirect("/login");
  if (p.role !== "hospital") redirect("/mypage");
  const [{ ok, error }, apps] = await Promise.all([searchParams, getReceivedApplications()]);

  return (
    <>
      <SiteHeader user={{ displayName: p.displayName }} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <a href="/mypage" className="text-sm text-teal-700 hover:underline">← 마이페이지</a>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">받은 지원자</h1>

        {ok === "1" && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">처리되었습니다.</div>}
        {error === "1" && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">처리에 실패했습니다. 다시 시도해 주세요.</div>}

        {apps.length === 0 ? (
          <p className="py-20 text-center text-slate-500">아직 지원자가 없습니다.</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {apps.map((a) => (
              <li key={a.id} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">{a.job?.title ?? "공고"}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone[a.status] ?? tone.submitted}`}>{STATUS_LABEL[a.status] ?? a.status}</span>
                </div>
                <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm">
                  <div className="font-medium text-slate-800">
                    {a.resume?.name ?? "이름 미입력"}
                    {a.resume?.experience_years != null && <span className="ml-2 text-slate-500">경력 {a.resume.experience_years}년</span>}
                  </div>
                  {a.resume?.phone && <div className="text-slate-600">{a.resume.phone}</div>}
                  {a.resume?.specialties && a.resume.specialties.length > 0 && (
                    <div className="mt-1 text-xs text-slate-500">희망: {a.resume.specialties.join(", ")}</div>
                  )}
                  {a.resume?.intro && <p className="mt-1 whitespace-pre-line text-slate-600">{a.resume.intro}</p>}
                  {!a.resume && <div className="text-slate-400">이력서 정보를 불러올 수 없습니다.</div>}
                </div>
                {a.message && <p className="mt-2 text-sm text-slate-600">지원 메시지: {a.message}</p>}
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-slate-400">{fmt(a.created_at)} 지원</span>
                  <span className="ml-auto flex items-center gap-2">
                    {a.resume?.phone && <Button href={`tel:${a.resume.phone}`} variant="outline" size="sm">전화</Button>}
                    <StatusButton id={a.id} status="accepted" label="합격" variant="primary" />
                    <StatusButton id={a.id} status="rejected" label="불합격" variant="outline" />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
