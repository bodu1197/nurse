import ComingSoon from "@/components/ComingSoon";

// Next 라우트 세그먼트 설정(revalidate/dynamic 등)은 정적 분석 대상이라 리터럴만 허용 — 상수 import 금지.
export const revalidate = 86400;

export const metadata = { title: "회사 소개 — 널스넷", robots: { index: false } };

export default function AboutPage() {
  return <ComingSoon title="회사 소개" />;
}
