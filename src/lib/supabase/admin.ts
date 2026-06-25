import "server-only";
import { createClient } from "@supabase/supabase-js";

// service_role 클라이언트 — 서버 전용(RLS 우회). 네이버 커스텀 OAuth 등에서 사용자 생성·세션 발급에 사용.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
