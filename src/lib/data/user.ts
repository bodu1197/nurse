import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickRole, type Role } from "./role";

export type { Role };

/** 이 시간 안에 만들어진 계정만 "방금 가입"으로 본다. OAuth 왕복(네이버 동의화면 포함) 여유. */
const NEW_ACCOUNT_MS = 10 * 60 * 1000;

/**
 * 소셜 가입에서 고른 회원유형을 프로필에 적용한다.
 *
 * 🔴 왜 필요한가: 회원가입 화면은 '간호사 / 병원 채용담당자'를 먼저 고르게 하는데, 그 아래
 *    카카오·네이버 버튼은 그 값을 실을 방법이 없었다(supabase-js 의 signInWithOAuth 에는
 *    signUp 의 `options.data` 에 해당하는 것이 없다). 그래서 트리거 기본값대로 **무조건
 *    간호사 계정**이 만들어졌고, 병원 담당자는 공고를 등록할 수 없는 계정을 받고도
 *    화면 어디에서도 역할을 바꿀 수 없었다. 로그인 직후 한 번만 바로잡는다.
 *
 * 🔴 **방금 만들어진 계정에만** 적용한다. 이미 쓰던 간호사가 (가입 화면에서) 소셜 버튼을 누른 것뿐인데
 *    역할이 병원으로 바뀌면, 쓰던 이력서·지원 내역에 접근하지 못하게 된다.
 */
export async function applySignupRole(userId: string, requested: string | null): Promise<void> {
  if (requested !== "hospital") return; // 기본값이 nurse 라 간호사는 손댈 게 없다
  const admin = createAdminClient();
  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const createdAt = authUser?.user?.created_at;
  if (!createdAt || Date.now() - new Date(createdAt).getTime() > NEW_ACCOUNT_MS) return;
  // 기본값(nurse)일 때만 바꾼다 — 관리자 계정을 강등시키지 않는다.
  const { error } = await admin.from("profiles").update({ role: "hospital" }).eq("id", userId).eq("role", "nurse");
  if (error) console.error("applySignupRole failed:", error.message);
}

// ponytail: 관리자 테스트용 역할 전환(쿠키 view_as). 판정은 pickRole(순수·테스트 있음).
// 전환해도 보이는 데이터는 본인 것뿐 — RLS가 전부 auth.uid() 기준이라 남의 데이터는 안 열린다.
// 역할을 읽는 곳(페이지=getMyProfile, 서버액션=사업자인증·공고등록·이력서·지원)이 이 함수를 거쳐야
// 화면과 저장이 같이 동작한다. 리뷰 작성만 예외 — 거기선 DB상 실제 간호사만 허용한다(평점 오염 방지).
export async function viewAsRole(dbRole: Role): Promise<Role> {
  return pickRole(dbRole, (await cookies()).get("view_as")?.value);
}

// 세션 검증된 사용자. getUser()는 매번 Supabase 인증 서버로 나가는 네트워크 호출이라,
// 한 화면이 프로필·지원여부·저장목록을 함께 읽으면 같은 확인을 3~4번 반복하게 된다.
// cache()로 요청당 1회로 묶는다(조회 함수 전용 — 서버 액션은 각자 직접 확인한다).
export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

export type CurrentUser = { displayName: string };

// 서버에서 세션 검증(getUser) 후 헤더 표시용 최소 정보 반환. 비로그인=null.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const m = user.user_metadata ?? {};
  const fallback =
    (typeof m.name === "string" && m.name) ||
    (typeof m.full_name === "string" && m.full_name) ||
    user.email?.split("@")[0] ||
    "회원";
  // 🔴 표시 이름은 profiles.display_name 이 정본이다. auth 메타데이터만 보면, 표시 이름을 바꾼 사람이
  //    이 함수를 쓰는 화면(게시판·약관·처리방침·커뮤니티 안내)에서만 옛 이름을 계속 본다
  //    (updateDisplayName 은 profiles 만 갱신한다). getMyProfile 은 요청당 캐시라 왕복이 늘지 않는다.
  const profile = await getMyProfile();
  return { displayName: profile?.displayName ?? fallback };
}

export type MyProfile = {
  username: string | null;
  displayName: string;
  email: string;
  role: Role;          // 전환 중이면 전환된 역할
  isAdmin: boolean;    // DB상 실제 관리자 여부(전환 UI 표시용)
  businessNo: string | null; // 이관·인증으로 저장된 사업자번호(인증 폼 프리필용)
  businessVerified: boolean;
  businessVerifiedAt: string | null;
  /** 인재 카드에 공개되는 값 — 본인이 이력서 화면에서 고친다(saveResume 이 함께 갱신). */
  gender: string | null;
  birthday: string | null;
};

// 마이페이지용 — 본인 프로필 전체(RLS: 본인 select 허용). 비로그인=null.
// cache(): 같은 요청에서 layout+page가 함께 불러도 쿼리는 1회.
export const getMyProfile = cache(async (): Promise<MyProfile | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("username, display_name, email, role, business_no, business_verified, business_verified_at, gender, birthday")
    .eq("id", user.id)
    .maybeSingle();
  if (!data) return null;
  const isAdmin = data.role === "admin";
  return {
    username: data.username,
    displayName: data.display_name ?? user.email?.split("@")[0] ?? "회원",
    email: data.email ?? user.email ?? "",
    role: await viewAsRole(data.role),
    isAdmin,
    // 구 널스넷에서 옮겨온 병원은 사업자번호가 이미 있다(인증은 아직). 인증 폼을 미리 채워준다.
    businessNo: data.business_no ?? null,
    // 관리자는 사업자 인증 통과로 취급(테스트용) — 실제 병원 회원은 인증해야 공고 등록 가능.
    businessVerified: isAdmin || (data.business_verified ?? false),
    businessVerifiedAt: data.business_verified_at ?? null,
    gender: data.gender ?? null,
    birthday: data.birthday ?? null,
  };
});

/**
 * 마이페이지 계열 공통 가드 — 12개 화면이 각자 두 줄씩 적던 것을 한 곳으로 모았다.
 *
 * 🔴 로그인으로 보낼 때 **원래 가려던 곳(next)** 을 들려 보낸다. 전에는 전부 `redirect("/login")`
 *    이라, 이력서를 북마크했거나 병원이 보낸 주소로 들어온 사람이 로그인을 마치는 순간 홈으로
 *    떨어져 처음부터 다시 찾아가야 했다(공고 상세·게시판은 이미 next 를 붙이고 있었다).
 *
 * 🔴 역할이 맞지 않을 때 **사유**를 달아 보낸다. 전에는 조용히 /mypage 로 되돌아가서
 *    "클릭이 안 먹었나" 하고 두세 번 더 누르게 됐다(리뷰·게시판의 CommunityGate 는 이미
 *    "간호사 회원 전용입니다"를 보여주고 있어 같은 사이트 안에서 기준이 갈렸다).
 */
export async function requireProfile(path: string, need?: Role): Promise<MyProfile> {
  const p = await getMyProfile();
  if (!p) {
    // 세션은 있는데 profiles 행만 없는 경우와 비로그인을 구분한다.
    // 구분하지 않으면 로그인한 사람이 /mypage → /login → 로그인 성공 → 홈 → /mypage 를
    // 영원히 도는데, 화면에는 아무 이유도 안 뜬다(가입 트리거가 실패한 계정에서 실제로 난다).
    if (await getSessionUser()) {
      throw new Error("profile row missing for signed-in user");
    }
    redirect(`/login?notice=mypage&next=${encodeURIComponent(path)}`);
  }
  if (need && p.role !== need) redirect(`/mypage?denied=${need}`);
  return p;
}
