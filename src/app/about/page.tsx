import ComingSoon from "@/components/ComingSoon";
import { DAY_SECONDS } from "@/lib/constants";

export const revalidate = DAY_SECONDS;

export const metadata = { title: "회사 소개 — 널스넷", robots: { index: false } };

export default function AboutPage() {
  return <ComingSoon title="회사 소개" />;
}
