import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser, getMyProfile } from "@/lib/data/user";

// 리뷰·게시판은 "이력서를 등록한 간호사 회원"만 이용한다 — 보기·읽기·작성·수정 전부.
// 판정: (보기 전환 반영) 역할이 간호사 + resumes에 본인 이력서가 존재.
// 병원 회원·비로그인·이력서 미등록 간호사는 모두 막힌다.
export type CommunityDenied = "guest" | "not_nurse" | "no_resume";
export type CommunityAccess = { ok: true; userId: string } | { ok: false; reason: CommunityDenied };

// 본인 이력서 등록 여부 — head+count로 행을 안 실어온다(RLS: 본인 select 허용).
export async function hasResume(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase.from("resumes").select("profile_id", { count: "exact", head: true }).eq("profile_id", userId);
  return !!count;
}

export const getCommunityAccess = cache(async (): Promise<CommunityAccess> => {
  const [user, profile] = await Promise.all([getSessionUser(), getMyProfile()]);
  if (!user || !profile) return { ok: false, reason: "guest" };
  if (profile.role !== "nurse") return { ok: false, reason: "not_nurse" };
  return (await hasResume(user.id)) ? { ok: true, userId: user.id } : { ok: false, reason: "no_resume" };
});

// 서버 액션용 — 통과하면 userId, 아니면 로그인/게이트 화면으로 보낸다.
export async function requireCommunityMember(basePath: string): Promise<string> {
  const access = await getCommunityAccess();
  if (access.ok) return access.userId;
  if (access.reason === "guest") redirect(`/login?notice=community&next=${encodeURIComponent(basePath)}`);
  redirect(basePath); // 목록 화면이 사유별 게이트를 렌더한다.
}
