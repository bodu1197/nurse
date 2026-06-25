import ComingSoon from "@/components/ComingSoon";

export const revalidate = 86400;

export const metadata = { title: "회사 소개 — 널스넷", robots: { index: false } };

export default function AboutPage() {
  return <ComingSoon title="회사 소개" />;
}
