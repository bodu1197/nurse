import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { getCurrentUser } from "@/lib/data/user";
import { COMPANY, LINK_CLASS } from "@/lib/constants";

export const metadata = {
  title: "고객센터 — 널스넷",
  description: "널스넷 고객센터. 자주 묻는 질문 · 공지사항 · 이벤트 · 1:1 문의 안내.",
  alternates: { canonical: "/customer" },
};

/**
 * 고객센터 허브 — 구 널스넷 `/customer` 를 옮긴 것이다.
 * 레거시가 이 아래 4개를 달고 있었고, 그대로 유지한다:
 *   자주묻는 질문(/board_qna → /faq) · 공지사항(/notice) · 이벤트(/event_board → /event) · 1:1 문의(/contact)
 *
 * 연락처는 COMPANY 한 곳에서 읽는다 — 푸터·영수증과 같은 값이어야 한다.
 * (레거시 페이지에는 '대표전화 010-5890-7337 / abc123@naver.com' 이 같이 적혀 있었는데,
 *  네이버 임시 주소라 실제 운영 연락처가 아니다. 사업자 정보에 등록된 값만 싣는다.)
 */
const DESKS = [
  { href: "/faq", title: "자주 묻는 질문", desc: "가입 · 이력서 · 스크랩 등 자주 들어오는 질문" },
  { href: "/notice", title: "공지사항", desc: "서비스 변경과 점검 안내" },
  { href: "/event", title: "이벤트", desc: "진행 중이거나 지난 이벤트" },
  { href: "/contact", title: "1:1 문의", desc: "전화 · 이메일로 직접 연결" },
] as const;

export default async function CustomerPage() {
  const user = await getCurrentUser();
  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-900">고객센터</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          보다 자세한 안내를 원하시면 고객센터로 전화 주시거나 1:1 문의를 이용해 주세요.
          친절한 안내로 만족을 드리도록 노력하겠습니다.
        </p>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-bold text-slate-900">문의 안내</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 text-slate-500">대표전화</dt>
              <dd><a href={`tel:${COMPANY.tel.replace(/-/g, "")}`} className={LINK_CLASS}>{COMPANY.tel}</a></dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 text-slate-500">이메일</dt>
              <dd><a href={`mailto:${COMPANY.email}`} className={LINK_CLASS}>{COMPANY.email}</a></dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 text-slate-500">운영시간</dt>
              <dd className="text-slate-700">평일 09:00 ~ 18:00 (주말·공휴일 휴무)<br />점심시간 12:00 ~ 13:00</dd>
            </div>
          </dl>
        </section>

        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {DESKS.map((d) => (
            <li key={d.href}>
              <Link
                href={d.href}
                className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
              >
                <span className="font-bold text-slate-900">{d.title}</span>
                <span className="mt-1 text-sm text-slate-500">{d.desc}</span>
              </Link>
            </li>
          ))}
        </ul>

        {/* 레거시 고객센터 하단에도 '광고 문의' 가 붙어 있었다 — 돈이 되는 길이라 빼지 않는다 */}
        <p className="mt-6 text-sm text-slate-600">
          광고를 알아보고 계신다면 <Link href="/ads" className={LINK_CLASS}>광고 상품 안내</Link>를 먼저 보세요.
        </p>
      </main>
    </>
  );
}
