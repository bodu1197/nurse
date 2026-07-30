import { FOOTER_NAV, COMPANY } from "@/lib/constants";

/**
 * 전 화면 공용 푸터.
 *
 * 🔴 전에는 이 마크업이 홈(app/page.tsx) 안에 직접 박혀 있어서 **홈에서만** 보였다.
 *    검색으로 /jobs/[id] 에 처음 들어온 사람은 그 화면에서 운영주체·약관·처리방침·연락처를
 *    볼 방법이 하나도 없었다. 루트 레이아웃에 한 번만 두고 모든 화면이 같은 것을 쓴다.
 *
 * 사업자 정보는 레거시 널스넷(nursenet.co.kr) 푸터 원문과 같은 값이다 — 같은 사업자이므로
 * 두 사이트가 다른 정보를 말하면 안 된다. 값은 lib/constants.ts(COMPANY) 한 곳에서 온다.
 */
export default function SiteFooter() {
  return (
    // print:hidden — 이력서 인쇄(PrintSheet)가 루트 레이아웃 안에 있어서, 이게 없으면
    // 병원이 뽑는 지원자 이력서 PDF 맨 아래에 사업자 정보와 사이트 메뉴가 딸려 나온다.
    <footer className="border-t border-slate-200 bg-slate-50 print:hidden">
      <div className="mx-auto max-w-[1280px] px-4 py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="text-lg font-bold text-teal-700">✚ 널스넷</span>
            <p className="mt-2 max-w-xs text-sm text-slate-500">간호사와 병원을 잇는 전문 채용 플랫폼.</p>
          </div>
          <nav className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm sm:grid-cols-1">
            {FOOTER_NAV.map((l) => (
              <a key={l.href} href={l.href} className="text-slate-600 hover:text-teal-700">{l.label}</a>
            ))}
          </nav>
        </div>

        {/* 사업자 정보 — 유료 광고를 파는 사이트라 운영주체를 밝힐 곳이 필요하다. */}
        <address className="mt-8 border-t border-slate-200 pt-5 text-xs not-italic leading-relaxed text-slate-500">
          <span className="font-semibold text-slate-600">{COMPANY.name}</span>
          <span className="mx-1.5 text-slate-300">|</span>대표 {COMPANY.ceo}
          <span className="mx-1.5 text-slate-300">|</span>사업자등록번호 {COMPANY.bizNo}
          <br />
          {COMPANY.address}
          <span className="mx-1.5 text-slate-300">|</span>
          <a href={`tel:${COMPANY.tel.replace(/-/g, "")}`} className="hover:text-teal-700">{COMPANY.tel}</a>
          <span className="mx-1.5 text-slate-300">|</span>
          <a href={`mailto:${COMPANY.email}`} className="hover:text-teal-700">{COMPANY.email}</a>
          <br />
          통신판매신고 {COMPANY.mailOrderNo}
          <span className="mx-1.5 text-slate-300">|</span>직업정보제공사업 {COMPANY.jobInfoNo}
        </address>

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
          <span>© 2026 널스넷 (NurseNet)</span>
          <a href="/privacy" className="hover:text-slate-600">개인정보처리방침</a>
          <a href="/terms" className="hover:text-slate-600">이용약관</a>
          <a href="/contact" className="hover:text-slate-600">고객센터</a>
        </div>
      </div>
    </footer>
  );
}
