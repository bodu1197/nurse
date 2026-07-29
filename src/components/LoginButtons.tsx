"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * 카카오·네이버 시작 버튼.
 *
 * 🔴 회원유형(role)과 복귀 주소(next)를 반드시 실어 보낸다.
 *    전에는 이 버튼들이 가입 폼 **밖**의 독립 버튼이라 화면에서 고른 '병원 채용담당자'가 통째로
 *    버려졌고(→ 무조건 간호사 계정이 만들어지고 바꿀 화면도 없었다), 공고 상세에서 넘어온 복귀
 *    주소도 사라져 로그인 후 홈에 떨어졌다.
 *    OAuth 에는 signUp 의 `options.data` 에 해당하는 것이 없어 **쿼리로 왕복**시킨다(콜백이 처리).
 *
 * 🔴 role 은 **누를 때** 폼에서 직접 읽는다. 서버 렌더 시점의 prop 만 믿으면, 주소에 ?role= 없이
 *    들어와 화면에서 라디오를 바꾼 사용자의 선택이 반영되지 않는다(가장 흔한 경로다).
 */
export default function LoginButtons({
  role,
  next,
}: Readonly<{ role?: "nurse" | "hospital"; next?: string }>) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function carryQs(): string {
    const checked = document.querySelector<HTMLInputElement>('input[name="role"]:checked')?.value;
    const p = new URLSearchParams();
    if ((checked ?? role) === "hospital") p.set("role", "hospital");
    if (next) p.set("next", next);
    const s = p.toString();
    return s ? `?${s}` : "";
  }

  async function kakao() {
    setError(null);
    setLoading("kakao");
    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "kakao",
        options: { redirectTo: `${location.origin}/auth/callback${carryQs()}` },
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

  // 링크가 아니라 버튼인 이유: 주소를 누르는 시점에 만들어야 폼에서 고른 회원유형이 실린다.
  function naver() {
    setLoading("naver");
    location.href = `/auth/naver/start${carryQs()}`;
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
        className="flex h-12 items-center justify-center gap-2 rounded-[12px] bg-[#FEE500] font-semibold text-[#191600] transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span aria-hidden>💬</span>
        {loading === "kakao" ? "로그인 중…" : "카카오로 시작하기"}
      </button>

      <button
        type="button"
        onClick={naver}
        disabled={loading !== null}
        className="flex h-12 items-center justify-center gap-2 rounded-[12px] bg-[#03C75A] font-semibold text-white transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span aria-hidden className="font-extrabold">N</span>
        {loading === "naver" ? "이동 중…" : "네이버로 시작하기"}
      </button>
    </div>
  );
}
