import { redirect } from "next/navigation";
import ResumeSheet from "@/components/ResumeSheet";
import PrintSheet from "@/components/PrintSheet";
import { requireProfile } from "@/lib/data/user";
import { getReceivedApplication } from "@/lib/data/applications";
import { signAvatarOf } from "@/lib/data/avatar";

export const metadata = { title: "지원자 이력서 — 널스넷", robots: { index: false } };

// 병원이 받은 이력서 다운로드(인쇄 → PDF 저장). 내 공고의 지원자가 아니면 RLS가 막아 null이 된다.
export default async function ApplicantPrintPage({
  params,
  searchParams,
}: Readonly<{ params: Promise<{ id: string }>; searchParams: Promise<{ job_id?: string; status?: string; q?: string; page?: string }> }>) {
  await requireProfile("/mypage/applicants", "hospital");
  const [{ id }, view] = await Promise.all([params, searchParams]);
  const app = await getReceivedApplication(id);
  if (!app || !app.resume) redirect("/mypage/applicants");
  // RLS 를 통과해 이 지원서를 실제로 받은 뒤에만 사진을 서명한다(위 redirect 뒤라는 게 중요하다).
  const photoUrl = await signAvatarOf(app.resume.profile_id);

  // 🔴 보던 화면을 **네 값 모두** 그대로 되돌린다. openApplicantResume 은 job_id·status·q·page 를
  //    전부 실어 보내는데 여기서 job_id 만 읽어서, '미확인' 필터 3페이지에서 이력서를 연 담당자가
  //    '받은 지원자'를 누르면 필터 없는 1페이지로 튕겼다(500건 목록에서 매번 자리를 잃는다).
  const qs = new URLSearchParams();
  for (const k of ["job_id", "status", "q", "page"] as const) {
    const v = (view[k] ?? "").trim();
    if (v) qs.set(k, v);
  }
  const back = "/mypage/applicants" + (qs.toString() ? `?${qs}` : "");

  return (
    <PrintSheet backHref={back} backLabel="받은 지원자">
      <ResumeSheet
        resume={app.resume}
        work={app.work}
        applied={{ jobTitle: app.job?.title ?? "공고", at: app.created_at, message: app.message }}
        photoUrl={photoUrl}
      />
    </PrintSheet>
  );
}
