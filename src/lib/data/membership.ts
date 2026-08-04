import { cache } from "react";
import { getSessionUser, getMyProfile } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/data/role";

/**
 * 🗂 회원 등급 — 이 사이트의 권한은 "역할" 이 아니라 **역할 + 기여** 로 정해진다(오너 확정 2026-07-29).
 *
 *   간호 일반회원  역할 nurse, 이력서 없음     → 아무 권한 없음
 *   간호회원      역할 nurse, 이력서 등재     → 리뷰·게시판 이용
 *   병원 일반회원  역할 hospital, 광고 없음    → 아무 권한 없음
 *   병원회원      역할 hospital, 광고 게재 중  → 인재정보 열람
 *
 * 왜 한 파일로 모았나: 전에는 같은 개념이 두 곳에 다른 모양으로 있었다 —
 * 간호사 쪽은 `getCommunityAccess()`(사유를 돌려줌), 병원 쪽은 `isAdvertiser()`(true/false 뿐).
 * 그래서 병원 회원은 인재정보가 왜 막혔는지 화면에서 알 수 없었고, 등급을 부르는 이름도 없었다.
 * 판정·이름·사유를 여기 한 곳에서 만든다.
 */
export type MemberTier =
  | "guest"           // 비로그인
  | "nurse_basic"     // 간호 일반회원 — 이력서 없음
  | "nurse_member"    // 간호회원 — 이력서 등재
  | "hospital_basic"  // 병원 일반회원 — 광고 없음
  | "hospital_member" // 병원회원 — 광고 게재 중
  | "admin";

export const TIER_LABEL: Record<MemberTier, string> = {
  guest: "비회원",
  nurse_basic: "간호 일반회원",
  nurse_member: "간호회원",
  hospital_basic: "병원 일반회원",
  hospital_member: "병원회원",
  admin: "관리자",
};

/** 등급을 올리려면 무엇을 해야 하는가 — 화면 안내와 게이트가 같은 문장을 쓴다. */
export const TIER_UPGRADE: Partial<Record<MemberTier, { text: string; href: string; label: string }>> = {
  nurse_basic: {
    text: "이력서를 등록하면 간호회원이 되어 리뷰·게시판을 이용할 수 있습니다.",
    href: "/mypage/resume",
    label: "이력서 등록하기",
  },
  hospital_basic: {
    // 무료 등록만으로는 안 된다 — 인재정보 열람은 유료 광고의 특전이다(hasLiveAd 참고).
    text: "공고에 광고를 적용하면 광고 기간 동안 병원회원이 되어 인재정보를 열람할 수 있습니다.",
    href: "/mypage/jobs",
    label: "내 공고에 광고 올리기",
  },
};

export type Membership = {
  userId: string | null;
  role: Role | null;
  tier: MemberTier;
  label: string;
  /** 리뷰·게시판 — 이력서를 등재한 간호사(+관리자) */
  canUseCommunity: boolean;
  /** 인재정보 열람 — 광고 중인 병원(+관리자) */
  canViewTalent: boolean;
};

/**
 * 인재정보를 볼 수 있는 병원인가 = **돈을 내고 광고를 게재 중인가.**
 *
 * 🔴 공고를 낸 것은 유료든 무료든 같은 광고지만, **돈을 안 낸 쪽은 인재를 볼 수 없다**(오너 확정 2026-08-04).
 *    판정 = 노출 기간이 살아 있고 **그 공고에 실결제(0원 아님)가 있는 것**.
 *    인재정보 열람은 유료 광고의 특전이다. 무료 등록만으로 열어주면 돈을 낼 이유가 없어지고,
 *    이력서 7천 건의 이름·연락처가 광고비를 안 낸 계정에도 열린다.
 *    광고가 끝나면 열람도 함께 닫힌다 — 화면 안내(LockedNotice)와 같은 계약이다.
 *
 * 테스트 병원(hospitals.is_test)은 광고를 낸 것으로 친다 — 결제 없이 병원회원 화면을 실제와
 * 같게 확인할 수 있어야 한다. 이 병원은 병원 검색·명부에서 이미 빠져 있어 밖으로 새지 않는다.
 */
async function hasLiveAd(userId: string): Promise<boolean> {
  const supabase = await createClient();
  // 🔴 판정을 여기서 다시 쓰지 않는다. RLS(resumes_select_advertiser)가 쓰는 is_talent_advertiser()
  //    를 그대로 부른다 — 두 벌로 갈라지면 한쪽만 고쳤을 때 **화면은 열리는데 목록은 비거나**,
  //    더 나쁘게는 **화면은 막는데 데이터는 새는** 상태가 된다.
  //    (userId 는 쓰지 않는다 — 함수가 세션에서 직접 판정한다.)
  void userId;
  const { data, error } = await supabase.rpc("is_talent_advertiser");
  // 열람 자격 판정이라 실패 시에는 막는 쪽(false)이 맞다 — 조회가 안 되는데 열어주면 이력서가 샌다.
  if (error) console.error("hasLiveAd failed:", error.message);
  return data === true;
}

/** 본인 이력서를 등록했는가 — head+count 라 행을 안 실어온다(RLS: 본인 select 허용). */
export async function hasResume(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("resumes").select("profile_id", { count: "exact", head: true }).eq("profile_id", userId);
  return !!count;
}

/**
 * 지금 사용자의 등급. cache() 로 한 요청 안에서는 한 번만 판정한다
 * (헤더·본문·게이트가 각각 물어보므로 안 감싸면 같은 쿼리가 서너 번 나간다).
 */
export const getMembership = cache(async (): Promise<Membership> => {
  const [user, profile] = await Promise.all([getSessionUser(), getMyProfile()]);
  if (!user || !profile) {
    return { userId: null, role: null, tier: "guest", label: TIER_LABEL.guest, canUseCommunity: false, canViewTalent: false };
  }
  // 최고 관리자는 관리·모더레이션을 위해 커뮤니티를 통과한다(DB 실제 역할 기준, 보기 전환과 무관).
  //
  // 🔴 인재정보는 예외로 두지 않는다. RLS(resumes_select_advertiser → is_talent_advertiser())에
  //    관리자 예외가 없어서, 앱에서만 열어주면 **게이트는 통과했는데 목록이 텅 빈** 화면이 된다
  //    (예전 isAdvertiser 도 admin 을 특별대우하지 않았다 — 여기서 넓히면 앱과 DB가 어긋난다).
  //    관리자는 테스트 병원을 갖고 있어 hasLiveAd 로 통과한다.
  if (profile.isAdmin) {
    return {
      userId: user.id, role: profile.role, tier: "admin", label: TIER_LABEL.admin,
      canUseCommunity: true, canViewTalent: await hasLiveAd(user.id),
    };
  }
  if (profile.role === "nurse") {
    const tier: MemberTier = (await hasResume(user.id)) ? "nurse_member" : "nurse_basic";
    return { userId: user.id, role: profile.role, tier, label: TIER_LABEL[tier], canUseCommunity: tier === "nurse_member", canViewTalent: false };
  }
  if (profile.role === "hospital") {
    const tier: MemberTier = (await hasLiveAd(user.id)) ? "hospital_member" : "hospital_basic";
    return { userId: user.id, role: profile.role, tier, label: TIER_LABEL[tier], canUseCommunity: false, canViewTalent: tier === "hospital_member" };
  }
  return { userId: user.id, role: profile.role, tier: "guest", label: TIER_LABEL.guest, canUseCommunity: false, canViewTalent: false };
});
