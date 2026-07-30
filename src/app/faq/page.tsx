import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { getCurrentUser } from "@/lib/data/user";
import { LINK_CLASS } from "@/lib/constants";
import { FAQS } from "@/lib/customerContent";

export const metadata = {
  title: "자주 묻는 질문 — 널스넷",
  description: "널스넷 이용 중 자주 들어오는 질문과 답변. 이력서 등록 · 스크랩 · 회원 안내.",
  alternates: { canonical: "/faq" },
};

/**
 * 자주 묻는 질문 — 구 널스넷 `/board_qna` 를 옮긴 것이다.
 *
 * 접었다 펴는 동작은 `<details>` 로 한다 — 브라우저가 이미 하는 일이라 JS 도, 클라이언트 컴포넌트도
 * 필요 없고, 검색엔진은 닫혀 있어도 안의 답변을 읽는다(직접 만든 아코디언은 둘 다 잃는다).
 *
 * 레거시에는 전체/회원공통/기업회원/인재회원 탭이 있었지만 여기서는 배지만 남겼다.
 * 2건짜리 목록에 거르개를 다는 건 화면만 복잡해진다 — 질문이 쌓이면 그때 탭을 붙인다.
 */
export default async function FaqPage() {
  const user = await getCurrentUser();
  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <Link href="/customer" className="text-sm text-teal-700 hover:underline">← 고객센터</Link>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">자주 묻는 질문</h1>
        <p className="mt-1 text-sm text-slate-500">전체 {FAQS.length}건</p>

        <ul className="mt-6 space-y-2">
          {FAQS.map((f) => (
            <li key={f.q}>
              <details className="group rounded-2xl border border-slate-200 bg-white px-5 py-4 open:shadow-sm">
                <summary className="flex cursor-pointer list-none items-start gap-3 font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
                  <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                    {f.category}
                  </span>
                  <span className="flex-1">{f.q}</span>
                  {/* 펼침 표시 — 열리면 회전한다. aria 는 details/summary 가 알아서 알린다. */}
                  <span aria-hidden className="shrink-0 text-slate-400 transition group-open:rotate-180">⌄</span>
                </summary>
                <p className="mt-3 border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-700">{f.a}</p>
              </details>
            </li>
          ))}
        </ul>

        <p className="mt-8 text-sm text-slate-600">
          찾는 답이 없으시면 <Link href="/contact" className={LINK_CLASS}>1:1 문의</Link>로 알려주세요.
        </p>
      </main>
    </>
  );
}
