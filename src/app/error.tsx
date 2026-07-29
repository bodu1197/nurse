"use client";

import { useEffect } from "react";
import Link from "next/link";
import Button from "@/components/Button";
import { COMPANY } from "@/lib/constants";

/**
 * 앱 전역 서버/렌더 오류 화면.
 *
 * 🔴 없으면 Next 기본 화면("Application error: a server-side exception has occurred")이 뜬다 —
 *    영문, 흰 배경, 헤더도 되돌아갈 링크도 없다. 이 사이트는 거의 모든 페이지가 렌더 중에
 *    Supabase 를 때리므로(홈·/jobs·/mypage 전부) 404보다 이쪽이 실제로 더 자주 난다.
 *
 * 헤더를 그리지 않는다 — 헤더도 getMyProfile()로 DB를 읽어서, 방금 DB 때문에 터진 화면에서
 * 같은 조회를 또 하면 오류 화면마저 터진다. 로고만 링크로 둔다.
 */
export default function Error({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  useEffect(() => {
    console.error("page error:", error.digest ?? "", error.message);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-16 text-center">
      <Link href="/" className="text-2xl font-bold text-teal-700">✚ 널스넷</Link>
      <h1 className="mt-8 text-xl font-bold text-slate-900">화면을 불러오지 못했습니다</h1>
      <p className="mt-2 text-sm text-slate-500">
        일시적인 오류일 수 있습니다. 다시 시도해 보시고, 계속 같으면 아래로 알려주세요.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {/* reset()은 이 화면만 다시 렌더한다 — 새로고침보다 빠르고, 일시 오류면 이걸로 끝난다 */}
        <Button type="button" size="md" onClick={reset}>다시 시도</Button>
        <Button href="/" variant="outline" size="md">홈으로</Button>
        <Button href="/contact" variant="outline" size="md">고객센터</Button>
      </div>
      {/* digest는 서버 로그와 이 화면을 잇는 유일한 끈이다 — 문의할 때 이 값을 받으면 바로 찾는다 */}
      {error.digest && <p className="mt-6 text-xs text-slate-400">오류번호 {error.digest}</p>}
      <p className="mt-1 text-xs text-slate-400">{COMPANY.email}</p>
    </main>
  );
}
