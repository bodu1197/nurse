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
