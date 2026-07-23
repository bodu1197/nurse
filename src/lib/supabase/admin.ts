import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// service_role 클라이언트 — 서버 전용, RLS를 통째로 우회한다.
//
// 쓰는 곳은 둘 중 하나여야 한다.
//  1) RLS로는 불가능한 작업: 네이버 커스텀 OAuth의 사용자 생성·세션 발급, 아이디→이메일 해석, 크론 수집
//  2) **내 행에서 얻은 id 목록으로만** 범위를 좁힌 복원 조회:
//     마감돼 안 보이는 지원 공고(getMyApplications)·저장 공고(getSavedJobs)의 제목을 되살릴 때.
//     이 경우 조회 대상은 반드시 `내 행에서 뽑은 id` + `한 번은 공개됐던 상태`로 두 겹 제한한다.
//     (jobs에 RLS SELECT 정책을 더하는 대안은 applications 정책과 서로 참조해 무한재귀로 죽는다.)
//
// 사용자가 넘긴 id를 그대로 조회하는 데 쓰면 안 된다 — 그 순간 비공개 데이터가 새는 통로가 된다.
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
