import { createClient } from "@/lib/supabase/server";

export type CurrentUser = { displayName: string };

// 서버에서 세션 검증(getUser) 후 헤더 표시용 최소 정보 반환. 비로그인=null.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
  role: "nurse" | "hospital" | "admin";
  businessVerified: boolean;
};

// 마이페이지용 — 본인 프로필 전체(RLS: 본인 select 허용). 비로그인=null.
export async function getMyProfile(): Promise<MyProfile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("username, display_name, email, role, business_verified")
    .eq("id", user.id)
    .maybeSingle();
  if (!data) return null;
  return {
    username: data.username,
    displayName: data.display_name ?? user.email?.split("@")[0] ?? "회원",
    email: data.email ?? user.email ?? "",
    role: data.role,
    businessVerified: data.business_verified ?? false,
  };
}
