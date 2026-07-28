import { cache } from "react";
import { redirect } from "next/navigation";
import { getMembership } from "@/lib/data/membership";

// 등급 판정은 lib/data/membership.ts 한 곳에서 한다 — 여기는 리뷰·게시판 화면이 쓰는 얇은 껍데기다.
// 전에는 여기와 talent.ts 의 isAdvertiser 가 같은 개념을 따로 판정해, 병원 쪽엔 사유 안내가 없었다.
export { hasResume } from "@/lib/data/membership";

// 리뷰·게시판은 "이력서를 등록한 간호사 회원"만 이용한다 — 보기·읽기·작성·수정 전부.
// 판정: (보기 전환 반영) 역할이 간호사 + resumes에 본인 이력서가 존재.
// 병원 회원·비로그인·이력서 미등록 간호사는 모두 막힌다.
export type CommunityDenied = "guest" | "not_nurse" | "no_resume";
export type CommunityAccess = { ok: true; userId: string } | { ok: false; reason: CommunityDenied };

export const getCommunityAccess = cache(async (): Promise<CommunityAccess> => {
  const m = await getMembership();
  if (m.canUseCommunity) return { ok: true, userId: m.userId! };
  if (m.tier === "guest") return { ok: false, reason: "guest" };
  // 간호 일반회원(이력서 없음)과 병원 회원을 갈라 사유를 정확히 알린다.
  return { ok: false, reason: m.tier === "nurse_basic" ? "no_resume" : "not_nurse" };
});

// 서버 액션용 — 통과하면 userId, 아니면 로그인/게이트 화면으로 보낸다.
export async function requireCommunityMember(basePath: string): Promise<string> {
  const access = await getCommunityAccess();
  if (access.ok) return access.userId;
  if (access.reason === "guest") redirect(`/login?notice=community&next=${encodeURIComponent(basePath)}`);
  redirect(basePath); // 목록 화면이 사유별 게이트를 렌더한다.
}
