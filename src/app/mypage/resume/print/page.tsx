import { redirect } from "next/navigation";
import ResumeSheet from "@/components/ResumeSheet";
import PrintSheet from "@/components/PrintSheet";
import { getMyProfile } from "@/lib/data/user";
import { getMyResume } from "@/lib/data/resume";

export const metadata = { title: "이력서 인쇄 — 널스넷", robots: { index: false } };

// 간호사 본인 이력서 다운로드. 인쇄 대화상자에서 "PDF로 저장"을 고르면 PDF 파일이 된다.
export default async function ResumePrintPage() {
  const p = await getMyProfile();
  if (!p) redirect("/login");
  if (p.role !== "nurse") redirect("/mypage");
  const resume = await getMyResume();
  if (!resume) redirect("/mypage/resume");

  return (
    <PrintSheet backHref="/mypage/resume" backLabel="내 이력서">
      <ResumeSheet resume={resume} work={resume.work} />
    </PrintSheet>
  );
}
