import Link from "next/link";
import { notFound } from "next/navigation";
import ResumeSheet from "@/components/ResumeSheet";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { signAvatarOf } from "@/lib/data/avatar";
import { fmtDay } from "@/lib/date";
import { getResumeForAdmin } from "@/lib/data/adminLists";
import { PageTitle, Notice } from "@/components/admin/Ui";
import { setResumeVisibility } from "@/app/admin/actions";

export const metadata = { title: "이력서 — 관리자" };
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MESSAGES: Record<string, string> = {
  "1": "처리했습니다. 기록이 남았습니다.",
  reason: "사유를 두 글자 이상 적어야 합니다.",
  target: "대상을 찾을 수 없습니다.",
  save: "저장에 실패했습니다.",
};

/**
 * 관리자용 이력서 상세.
 *
 * 🔴 공개 화면(/talent/[id])은 is_public 인 이력서만 보여준다. 그래서 **신고받은 비공개 이력서를
 *    확인할 방법이 없었다** — 내용을 못 보고 조치만 할 수는 없다. 여기서는 공개 여부와 무관하게 연다
 *    (RLS resumes_select_admin 이 통과시킨다).
 *
 * 서식은 본인 화면·인쇄·병원의 지원자 조회가 쓰는 ResumeSheet 를 그대로 쓴다 —
 * 관리자만 다른 서식을 보면 "화면에서는 멀쩡한데 왜 신고됐지" 가 된다.
 */
export default async function AdminResumeDetail({
  params, searchParams,
}: Readonly<{ params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }>) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID_RE.test(id)) notFound();

  const data = await getResumeForAdmin(id); // 내부에서 requireAdmin()
  if (!data) notFound();
  const { resume, work } = data;
  const photoUrl = await signAvatarOf(id);
  const here = `/admin/resumes/${id}`;

  return (
    <>
      <PageTitle title="이력서 상세" desc={`마지막 수정 ${fmtDay(resume.updated_at)}`} />
      <Notice ok={sp.ok} error={sp.error} messages={MESSAGES} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/admin/resumes" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
          ← 목록
        </Link>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${resume.is_public ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-600"}`}>
          {resume.is_public ? "공개 중" : "비공개"}
        </span>
        {resume.is_public && resume.name && (
          <Link href={`/talent/${id}`} className="text-sm text-teal-700 hover:underline">
            구직자에게 보이는 화면 →
          </Link>
        )}
      </div>

      {/* 공개/비공개 전환 — 목록에서도 되지만, 내용을 보고 나서 바로 조치할 수 있어야 한다 */}
      <form action={setResumeVisibility} className="mb-6 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="public" value={resume.is_public ? "0" : "1"} />
        <input type="hidden" name="back" value={here} />
        <label className="min-w-0 flex-1">
          <span className="mb-0.5 block text-xs font-medium text-slate-500">사유 (기록에 남습니다)</span>
          <input name="reason" required minLength={2} maxLength={200}
            placeholder={resume.is_public ? "비공개로 내리는 사유" : "다시 공개하는 사유"}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus-visible:ring-2 focus-visible:ring-teal-600" />
        </label>
        <ConfirmSubmit variant="outline"
          message={resume.is_public
            ? "이 이력서를 비공개로 내립니다. 병원에게 더 이상 보이지 않습니다."
            : "이 이력서를 다시 공개합니다. 광고 중인 병원에게 이름·연락처가 열립니다."}>
          {resume.is_public ? "비공개로 내리기" : "다시 공개하기"}
        </ConfirmSubmit>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <ResumeSheet resume={resume} work={work} photoUrl={photoUrl} />
      </div>
    </>
  );
}
