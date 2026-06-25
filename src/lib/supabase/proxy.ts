import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

// Next.js 16 proxy(구 middleware)에서 호출 — Supabase 세션 토큰 갱신.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return supabaseResponse;

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // 익명 방문자(Supabase 세션 쿠키 없음)는 갱신 불필요 → getUser 스킵(공개 페이지 레이턴시 절감).
  // 로그인 사용자만 토큰 리프레시.
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  if (hasSession) {
    await supabase.auth.getUser();
  }

  return supabaseResponse;
}
