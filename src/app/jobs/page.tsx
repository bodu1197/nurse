import JobsListing, { listingMetadata, type JobSearchParams } from "./JobsListing";

// 간호 채용공고 목록 — 화면은 요양·간병(/care-jobs)과 **같은 코드**다(JobsListing). 여기서는 범위만 정한다.
export async function generateMetadata({ searchParams }: Readonly<{ searchParams: Promise<JobSearchParams> }>) {
  return listingMetadata("nurse", searchParams);
}

export default function JobsPage({ searchParams }: Readonly<{ searchParams: Promise<JobSearchParams> }>) {
  return <JobsListing mode="nurse" searchParams={searchParams} />;
}
