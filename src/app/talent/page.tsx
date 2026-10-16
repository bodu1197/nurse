import TalentListing, { talentListingMetadata, type TalentSearchParams } from "./TalentListing";

// 간호사 인재정보 목록 — 화면은 요양·간병 인재(/care-talent)와 **같은 코드**다(TalentListing). 여기서는 범위만 정한다.
export async function generateMetadata({ searchParams }: Readonly<{ searchParams: Promise<TalentSearchParams> }>) {
  return talentListingMetadata("nurse", searchParams);
}

export default function TalentPage({ searchParams }: Readonly<{ searchParams: Promise<TalentSearchParams> }>) {
  return <TalentListing mode="nurse" searchParams={searchParams} />;
}
