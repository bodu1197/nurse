import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { pickRole, type Role } from "./role";

export type { Role };

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
  const displayName =
    (typeof m.name === "string" && m.name) ||
    (typeof m.full_name === "string" && m.full_name) ||
    user.email?.split("@")[0] ||
    "회원";
  return { displayName };
}

export type MyProfile = {
  username: string | null;
  displayName: string;
  email: string;
  role: Role;          // 전환 중이면 전환된 역할
  isAdmin: boolean;    // DB상 실제 관리자 여부(전환 UI 표시용)
  businessVerified: boolean;
  businessVerifiedAt: string | null;
};

// 마이페이지용 — 본인 프로필 전체(RLS: 본인 select 허용). 비로그인=null.
// cache(): 같은 요청에서 layout+page가 함께 불러도 쿼리는 1회.
export const getMyProfile = cache(async (): Promise<MyProfile | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("username, display_name, email, role, business_verified, business_verified_at")
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
    // 관리자는 사업자 인증 통과로 취급(테스트용) — 실제 병원 회원은 인증해야 공고 등록 가능.
    businessVerified: isAdmin || (data.business_verified ?? false),
    businessVerifiedAt: data.business_verified_at ?? null,
  };
});
