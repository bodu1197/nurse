import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// service_role 클라이언트 — 서버 전용(RLS 우회). 네이버 커스텀 OAuth 등에서 사용자 생성·세션 발급에 사용.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase admin 환경변수 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
