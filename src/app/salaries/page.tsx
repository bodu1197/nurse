import ComingSoon from "@/components/ComingSoon";

export const revalidate = 86400;

export const metadata = { title: "급여 정보 — 널스넷", robots: { index: false } };

export default function SalariesPage() {
  return <ComingSoon title="급여 정보" desc="간호사 급여 탐색 페이지는 준비 중입니다." />;
}
