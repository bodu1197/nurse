"use client";

import { useEffect, useState } from "react";

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

  // 카카오·네이버 동의 화면에서 뒤로가기를 누르면 bfcache 로 이 화면이 그대로 복원된다 —
  // loading 상태도 같이 복원돼 버튼이 영영 "이동 중…"에 눌린 채로 굳는다.
  useEffect(() => {
    const reset = () => setLoading(null);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  function carryQs(): string {
    const checked = document.querySelector<HTMLInputElement>('input[name="role"]:checked')?.value;
    const p = new URLSearchParams();
    if ((checked ?? role) === "hospital") p.set("role", "hospital");
    if (next) p.set("next", next);
    const s = p.toString();
    return s ? `?${s}` : "";
  }

  // 링크가 아니라 버튼인 이유: 주소를 누르는 시점에 만들어야 폼에서 고른 회원유형이 실린다.
  // 카카오·네이버 둘 다 Supabase 내장 프로바이더가 아니라 커스텀 라우트로 시작한다 —
  // 카카오는 이 앱(REST API 키)의 클라이언트 시크릿이 꺼져있어 Supabase 프로바이더가 요구하는
  // 시크릿을 줄 수 없다(라이믹스 때부터 시크릿 없이 돌던 앱, 도메인 이전과 무관).
  function kakao() {
    setLoading("kakao");
    location.href = `/auth/kakao/start${carryQs()}`;
  }

  function naver() {
    setLoading("naver");
    location.href = `/auth/naver/start${carryQs()}`;
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={kakao}
        disabled={loading !== null}
        className="flex h-12 items-center justify-center gap-2 rounded-[12px] bg-[#FEE500] font-semibold text-[#191600] transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span aria-hidden>💬</span>
        {loading === "kakao" ? "이동 중…" : "카카오로 시작하기"}
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
