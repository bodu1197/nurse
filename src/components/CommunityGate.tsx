import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import { getCurrentUser } from "@/lib/data/user";
import type { CommunityDenied } from "@/lib/data/community";

// 리뷰 접근이 막힌 사용자에게 사유별 안내를 보여주는 공용 화면.
// (게시판도 같은 게이트를 쓰지만 2026-08-16 부터 사용자에게 닫혀 있어 문구에서 뺐다 — 없는 곳을 안내하면 거짓말이 된다.)
// (이력서를 등록한 간호사 회원만 이용 가능 — 보기·읽기·작성 전부)
const MSG: Record<CommunityDenied, { head: string; body: string; href: string; label: string }> = {
  guest: {
    head: "로그인이 필요합니다",
    body: "병원 리뷰는 이력서를 등록한 간호사 회원만 이용할 수 있습니다.",
    href: "/login",
    label: "로그인",
  },
  not_nurse: {
    head: "간호사 회원 전용입니다",
    // 🔴 "간호사 회원만 볼 수 있습니다"라고만 적으면, 제목·"리뷰 작성" 버튼을 지금 보고 있는
    //    병원 회원에게는 화면과 문장이 바로 모순된다. 가려지는 것은 **글**임을 밝힌다.
    body: "병원 리뷰 글은 간호사 회원만 읽고 쓸 수 있습니다.",
    href: "/",
    label: "홈으로",
  },
  no_resume: {
    head: "이력서를 먼저 등록해 주세요",
    body: "병원 리뷰는 이력서를 등록한 간호사 회원 전용입니다. 이력서를 등록하면 바로 이용할 수 있습니다.",
    href: "/mypage/resume",
    label: "이력서 등록하기",
  },
};

/**
 * @param inline 페이지 전체가 아니라 **본문 자리에만** 안내 카드를 넣는다.
 *   inline 을 쓰는 호출자는 SiteHeader 와 <main> 을 직접 그려야 한다(카드만 돌려주므로).
 *
 * 🔴 왜 있나(오너 확정 2026-07-31): 리뷰 목록은 전체를 이 게이트로 갈아끼웠다. 그래서 비회원은
 *    "여기가 병원 리뷰를 쓰는 곳"이라는 사실 자체를 볼 수 없었고, 가입할 이유도 안 보였다.
 *    글은 그대로 가리되 제목·"리뷰 작성" 버튼·병원 검색은 남기려면 카드만 필요하다.
 *    inline 일 때 제목은 h1 → **h2**. 페이지 h1 은 이미 호출자("병원 리뷰")가 갖고 있고,
 *    p 로 내리면 "글이 왜 안 보이는지" 설명하는 블록을 스크린리더 헤딩 목록에서 못 찾는다.
 */
export default async function CommunityGate({
  reason, next, inline = false,
}: Readonly<{ reason: CommunityDenied; next?: string; inline?: boolean }>) {
  const m = MSG[reason];
  // 비로그인은 로그인 후 원래 페이지로 돌아오게 next를 넘긴다(안내 배너도 함께).
  const href = reason === "guest"
    ? `/login?notice=community${next ? `&next=${encodeURIComponent(next)}` : ""}`
    : m.href;
  const Head = inline ? "h2" : "h1";
  const card = (
    <div className={`w-full rounded-2xl border border-slate-200 bg-white p-8 text-center${inline ? " mx-auto mt-6 max-w-md" : ""}`}>
      <Head className="text-xl font-bold text-slate-900">{m.head}</Head>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{m.body}</p>
      <Button href={href} size="md" className="mt-6">{m.label}</Button>
    </div>
  );
  if (inline) return card;

  const user = await getCurrentUser();
  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-20">
        {card}
      </main>
    </>
  );
}
