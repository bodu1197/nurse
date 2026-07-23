import { redirect } from "next/navigation";
import ResumeSheet from "@/components/ResumeSheet";
import PrintSheet from "@/components/PrintSheet";
import { getMyProfile } from "@/lib/data/user";
import { getReceivedApplication } from "@/lib/data/applications";

export const metadata = { title: "지원자 이력서 — 널스넷", robots: { index: false } };

// 병원이 받은 이력서 다운로드(인쇄 → PDF 저장). 내 공고의 지원자가 아니면 RLS가 막아 null이 된다.
export default async function ApplicantPrintPage({
  params,
  searchParams,
}: Readonly<{ params: Promise<{ id: string }>; searchParams: Promise<{ job_id?: string }> }>) {
  const p = await getMyProfile();
  if (!p) redirect("/login");
  if (p.role !== "hospital") redirect("/mypage");
  const [{ id }, { job_id }] = await Promise.all([params, searchParams]);
  const app = await getReceivedApplication(id);
  if (!app || !app.resume) redirect("/mypage/applicants");

  // 보고 있던 공고 탭으로 그대로 돌아간다.
  const back = job_id ? `/mypage/applicants?job_id=${encodeURIComponent(job_id)}` : "/mypage/applicants";

  return (
    <PrintSheet backHref={back} backLabel="받은 지원자">
      <ResumeSheet
        resume={app.resume}
        applied={{ jobTitle: app.job?.title ?? "공고", at: app.created_at, message: app.message }}
      />
    </PrintSheet>
  );
}
