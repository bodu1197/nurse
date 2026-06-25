"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginButtons() {
  const [loading, setLoading] = useState<string | null>(null);

  async function kakao() {
    setLoading("kakao");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) {
      setLoading(null);
      alert("카카오 로그인을 시작할 수 없습니다: " + error.message);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={kakao}
        disabled={loading !== null}
        className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#FEE500] font-semibold text-[#191600] transition hover:brightness-95 disabled:opacity-60"
      >
        <span aria-hidden>💬</span>
        {loading === "kakao" ? "이동 중…" : "카카오로 시작하기"}
      </button>

      <a
        href="/auth/naver/start"
        className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#03C75A] font-semibold text-white transition hover:brightness-95"
      >
        <span aria-hidden className="font-extrabold">N</span>
        네이버로 시작하기
      </a>
    </div>
  );
}
