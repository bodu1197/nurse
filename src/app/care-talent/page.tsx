import TalentListing, { talentListingMetadata, type TalentSearchParams } from "@/app/talent/TalentListing";

// 🧓 요양보호사·간병인 인재정보 목록 — 간호사 인재정보(/talent)와 **같은 화면 코드**다. 이력서 '찾는 일자리'에서
// 요양·간병을 고른 사람(간병도 하겠다는 간호사 포함)이 실린다. 카드를 누르면 같은 상세(/talent/[id])가 열린다.
export async function generateMetadata({ searchParams }: Readonly<{ searchParams: Promise<TalentSearchParams> }>) {
  return talentListingMetadata("care", searchParams);
}

export default function CareTalentPage({ searchParams }: Readonly<{ searchParams: Promise<TalentSearchParams> }>) {
  return <TalentListing mode="care" searchParams={searchParams} />;
}
