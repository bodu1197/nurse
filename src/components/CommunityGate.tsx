import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import { getCurrentUser } from "@/lib/data/user";
import type { CommunityDenied } from "@/lib/data/community";

// 리뷰·게시판 접근이 막힌 사용자에게 사유별 안내를 보여주는 공용 화면.
// (이력서를 등록한 간호사 회원만 이용 가능 — 보기·읽기·작성 전부)
const MSG: Record<CommunityDenied, { head: string; body: string; href: string; label: string }> = {
  guest: {
    head: "로그인이 필요합니다",
    body: "리뷰와 게시판은 이력서를 등록한 간호사 회원만 이용할 수 있습니다.",
    href: "/login",
    label: "로그인",
  },
  not_nurse: {
    head: "간호사 회원 전용입니다",
    body: "병원 리뷰와 간호사 게시판은 간호사 회원만 볼 수 있습니다.",
    href: "/",
    label: "홈으로",
  },
  no_resume: {
    head: "이력서를 먼저 등록해 주세요",
    body: "리뷰와 게시판은 이력서를 등록한 간호사 회원 전용입니다. 이력서를 등록하면 바로 이용할 수 있습니다.",
    href: "/mypage/resume",
    label: "이력서 등록하기",
  },
};

export default async function CommunityGate({ reason, next }: Readonly<{ reason: CommunityDenied; next?: string }>) {
  const user = await getCurrentUser();
  const m = MSG[reason];
  // 비로그인은 로그인 후 원래 페이지로 돌아오게 next를 넘긴다(안내 배너도 함께).
  const href = reason === "guest"
    ? `/login?notice=community${next ? `&next=${encodeURIComponent(next)}` : ""}`
    : m.href;
  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-20">
        <div className="w-full rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <h1 className="text-xl font-bold text-slate-900">{m.head}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{m.body}</p>
          <Button href={href} size="md" className="mt-6">{m.label}</Button>
        </div>
      </main>
    </>
  );
}
