"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginButtons() {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function kakao() {
    setError(null);
    setLoading("kakao");
    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "kakao",
        options: { redirectTo: `${location.origin}/auth/callback` },
      });
      if (oauthError) {
        setLoading(null);
        setError("카카오 로그인을 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.");
      }
    } catch {
      setLoading(null);
      setError("카카오 로그인을 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={kakao}
        disabled={loading !== null}
        className="flex h-12 items-center justify-center gap-2 rounded-[20px] bg-[#FEE500] font-semibold text-[#191600] transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span aria-hidden>💬</span>
        {loading === "kakao" ? "로그인 중…" : "카카오로 시작하기"}
      </button>

      <a
        href="/auth/naver/start"
        className="flex h-12 items-center justify-center gap-2 rounded-[20px] bg-[#03C75A] font-semibold text-white transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
      >
        <span aria-hidden className="font-extrabold">N</span>
        네이버로 시작하기
      </a>
    </div>
  );
}
