import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import TalentDetail from "@/components/TalentDetail";
import { getMyProfile } from "@/lib/data/user";
import { getPublicTalent, revealContacts, canRevealContacts } from "@/lib/data/talent";

// 개인 이력서 상세 — 색인 제외. 이름은 광고 병원만 보므로 제목엔 넣지 않는다(PII 누출 방지).
export const metadata: Metadata = {
  title: "간호사 인재 상세 — 널스넷",
  robots: { index: false },
};

export default async function TalentDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  const [t, p] = await Promise.all([getPublicTalent(id), getMyProfile()]);
  if (!t) notFound(); // 비공개·없는 이력서는 404 (getPublicTalent가 is_public=true만 반환)

  // 광고 중인 병원(또는 관리자)만 이름·전화를 본다.
  const canSeeContacts = await canRevealContacts(p);
  const contact = canSeeContacts ? (await revealContacts([t.profile_id])).get(t.profile_id) : undefined;

  return (
    <>
      <SiteHeader user={p ? { displayName: p.displayName } : null} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <Link href="/talent" className="mb-3 inline-block text-sm text-teal-700 hover:underline">← 인재정보 목록</Link>
        <TalentDetail t={t} contact={contact} contactGated={!canSeeContacts} asH1 />
      </main>
    </>
  );
}
