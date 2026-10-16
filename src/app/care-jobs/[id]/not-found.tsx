import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import { CARE_JOBS_MENU } from "@/lib/constants";

export const metadata = { title: "공고를 찾을 수 없습니다 — 널스넷", robots: { index: false } };

/**
 * 요양·간병 공고 404 — 워크넷에서 내려가 수집 때 지워진 공고. 루트 not-found 는 "채용공고(/jobs)" 버튼이라
 * 요양·간병을 보던 사람을 간호 목록으로 보낸다 — 여기서는 요양·간병 목록으로 돌려보낸다.
 * 🔴 세션을 읽지 않는다(app/not-found.tsx 주석 — 404 화면이 세션을 읽으면 정적 페이지가 통째로 동적이 된다).
 */
export default function CareJobNotFound() {
  return (
    <>
      <SiteHeader user={null} />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">공고를 찾을 수 없습니다</h1>
        <p className="mt-2 text-sm text-slate-500">마감되었거나 워크넷에서 내려간 공고입니다.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button href={CARE_JOBS_MENU.href} size="md">{CARE_JOBS_MENU.label} 목록</Button>
          <Button href="/" variant="outline" size="md">홈으로</Button>
        </div>
      </main>
    </>
  );
}
