import ComingSoon from "@/components/ComingSoon";

export const revalidate = 86400;

export const metadata = { title: "병원 리뷰 — 널스넷", robots: { index: false } };

export default function ReviewsPage() {
  return <ComingSoon title="병원 리뷰" desc="병원 평점·리뷰 페이지는 준비 중입니다." />;
}
