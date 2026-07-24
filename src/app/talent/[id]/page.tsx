import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import TalentDetail from "@/components/TalentDetail";
import TalentCard from "@/components/TalentCard";
import { getMyProfile } from "@/lib/data/user";
import { getPublicTalent, revealContacts, canRevealContacts, getRelatedTalent } from "@/lib/data/talent";

// 개인 이력서 상세 — 색인 제외. 이름은 광고 병원만 보므로 제목엔 넣지 않는다(PII 누출 방지).
export const metadata: Metadata = {
  title: "간호사 인재 상세 — 널스넷",
  robots: { index: false },
};

export default async function TalentDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  const [t, p] = await Promise.all([getPublicTalent(id), getMyProfile()]);
  if (!t) notFound(); // 비공개·없는 이력서는 404 (getPublicTalent가 is_public=true만 반환)

  // 서로 의존하지 않는 조회는 함께 보낸다. 열람 자격 판정과 관련 인재 목록은 독립.
  const [canSeeContacts, related] = await Promise.all([
    canRevealContacts(p),                              // 광고 병원(또는 관리자)만 이름·전화
    getRelatedTalent(t.profile_id, t.desired_location), // 좌측 사이드바(관련 인재)
  ]);
  const sidebar = related.rows;
  const contactIds = [t.profile_id, ...sidebar.map((r) => r.profile_id)];
  const contacts = canSeeContacts ? await revealContacts(contactIds) : new Map<string, { name: string | null; phone: string | null }>();
  const contact = contacts.get(t.profile_id);
  const sidebarTitle = related.sameRegion ? `${(t.desired_location ?? "").split(",")[0]} 인재` : "다른 인재";

  return (
    <>
      <SiteHeader user={p ? { displayName: p.displayName } : null} />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6">
        <Link href="/talent" className="mb-3 inline-block text-sm text-teal-700 hover:underline">← 인재정보 목록</Link>

        {/* 관련 인재가 있을 때만 2열(좌측 사이드바). 없으면 상세만 읽기 좋은 폭으로. */}
        <div className={sidebar.length > 0 ? "lg:grid lg:grid-cols-[minmax(0,320px)_1fr] lg:items-start lg:gap-6" : "mx-auto max-w-3xl"}>
          {/* 상세 — 모바일에선 먼저, 데스크톱에선 오른쪽 */}
          <div className="lg:col-start-2 lg:row-start-1 lg:max-w-3xl">
            <TalentDetail t={t} contact={contact} contactGated={!canSeeContacts} asH1 />
          </div>

          {/* 관련 인재 — 모바일에선 상세 아래, 데스크톱에선 왼쪽 사이드바 */}
          {sidebar.length > 0 && (
            <aside aria-label={sidebarTitle} className="mt-10 lg:col-start-1 lg:row-start-1 lg:mt-0">
              <h2 className="mb-3 text-sm font-bold text-slate-900">
                {sidebarTitle} <span className="font-normal text-slate-400">({sidebar.length})</span>
              </h2>
              <ul className="space-y-2">
                {sidebar.map((r) => (
                  <li key={r.profile_id}>
                    <a href={`/talent/${r.profile_id}`} className="block rounded-xl border border-slate-200 bg-white p-3 transition hover:border-teal-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
                      <TalentCard t={r} contactName={contacts.get(r.profile_id)?.name} />
                    </a>
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      </main>
    </>
  );
}
