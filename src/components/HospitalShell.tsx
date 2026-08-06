import SiteHeader from "@/components/SiteHeader";
import type { ReactNode } from "react";
import { getMembership, TIER_UPGRADE } from "@/lib/data/membership";

// 병원 마이페이지 공용 셸 — LNB(사이드바)로 모든 병원 페이지 레이아웃 통일.
const NAV = [
  { href: "/mypage", label: "대시보드" },
  { href: "/mypage/jobs/new", label: "공고 등록" },
  { href: "/mypage/jobs", label: "공고 관리" },
  { href: "/mypage/applicants", label: "받은 지원자" },
  // 헤더 '인재정보'와 **같은** 화면을 가리킨다 — 예전엔 필터가 3개뿐인 복제본(/mypage/talent)이었다.
  { href: "/talent", label: "인재 검색" },
  // 💾 검색 도중 담아 둔 후보. 여기만 마이페이지 안에 있다 — 내 것이라 남의 화면에 없다.
  { href: "/mypage/saved-talent", label: "찜한 간호사" },
  // 🤖 자동매치도 같은 규칙으로 **하나뿐인 화면**(/match)을 가리킨다. 그 화면이 이미 보는 사람에
  //    따라 갈린다(광고 중인 병원 → 맞는 인재 / 이력서 등록 간호사 → 맞는 공고)라 복제본이 필요 없다.
  { href: "/match", label: "AI 자동매치" },
  { href: "/mypage/jobs/ad/orders", label: "결제 내역" },
  { href: "/mypage/verify", label: "사업자 인증" },
  { href: "/mypage/account", label: "내 정보 · 계정" },
];

export default async function HospitalShell({ displayName, active, children }: Readonly<{ displayName: string; active: string; children: ReactNode }>) {
  const membership = await getMembership();
  const upgrade = TIER_UPGRADE[membership.tier];
  return (
    <>
      <SiteHeader user={{ displayName }} />
      <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-5 px-4 py-6 lg:flex-row lg:gap-6">
        <aside className="hidden lg:block lg:w-56 lg:shrink-0">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-teal-50 text-base font-bold text-teal-700" aria-hidden>{displayName.slice(0, 1)}</span>
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-slate-900">{displayName}</p>
                {/* 역할이 아니라 **등급**을 보여준다 — 회원이 자기가 왜 막혔는지 알아야 한다.
                    이력서(간호사)·광고(병원)를 올리면 여기 이름이 바뀐다. */}
                <span className={`text-xs font-semibold ${upgrade ? "text-slate-500" : "text-teal-700"}`}>{membership.label}</span>
                {upgrade && (
                  <a href={upgrade.href} className="mt-0.5 block text-xs font-semibold text-amber-700 hover:underline">
                    {upgrade.label} →
                  </a>
                )}
              </div>
            </div>
          </div>
          <nav className="mt-3 space-y-1 rounded-2xl border border-slate-200 bg-white p-2">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className={`block rounded-lg px-3 py-2 text-base ${n.href === active ? "bg-teal-50 font-semibold text-teal-700" : "text-slate-600 hover:bg-slate-50"}`}>{n.label}</a>
            ))}
          </nav>
        </aside>

        <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className={`shrink-0 rounded-full border px-3 py-1.5 text-base ${n.href === active ? "border-teal-500 bg-teal-50 font-semibold text-teal-700" : "border-slate-300 text-slate-600"}`}>{n.label}</a>
          ))}
        </nav>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </>
  );
}
