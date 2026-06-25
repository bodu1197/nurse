import ComingSoon from "@/components/ComingSoon";

export const revalidate = 86400;

export const metadata = { title: "병원 서비스 — 널스넷", robots: { index: false } };

export default function HospitalPage() {
  return <ComingSoon title="병원 서비스" desc="병원 공고 등록·광고 페이지는 준비 중입니다." />;
}
