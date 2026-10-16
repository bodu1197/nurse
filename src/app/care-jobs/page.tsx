import JobsListing, { listingMetadata, type JobSearchParams } from "@/app/jobs/JobsListing";

// 🧓 요양보호사·간병인 채용공고 목록 — 간호 채용공고(/jobs)와 **같은 화면 코드**다(오너 지시 2026-10-16: "기존 페이지를 그대로
// 재사용"). 다른 것은 목록 범위(요양·간병 직종)와 글자뿐이고, 카드를 누르면 같은 상세(/jobs/[id])가 열린다.
export async function generateMetadata({ searchParams }: Readonly<{ searchParams: Promise<JobSearchParams> }>) {
  return listingMetadata("care", searchParams);
}

export default function CareJobsPage({ searchParams }: Readonly<{ searchParams: Promise<JobSearchParams> }>) {
  return <JobsListing mode="care" searchParams={searchParams} />;
}
