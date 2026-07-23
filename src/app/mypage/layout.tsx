import type { ReactNode } from "react";
import { getMyProfile } from "@/lib/data/user";
import { ROLE_LABEL } from "@/lib/data/role";
import { setViewAs } from "./actions";

// 마이페이지 전체는 개인정보 → 새 하위 페이지가 robots 지정을 빠뜨려도 색인되지 않도록 여기서 한 번 더 막는다.
export const metadata = { robots: { index: false, follow: false } };

// 관리자가 병원/간호사 보기로 전환한 동안, 모든 마이페이지 상단에 테스트 중임을 알린다.
// /mypage 안에만 두는 이유: 공개 페이지의 정적 생성을 건드리지 않기 위함.
// sticky를 쓰지 않는다 — SiteHeader가 이미 sticky top-0이라 겹치면 헤더를 가린다.
export default async function MypageLayout({ children }: Readonly<{ children: ReactNode }>) {
  const p = await getMyProfile(); // cache() — 각 페이지가 다시 불러도 쿼리 1회
  const testing = p?.isAdmin && p.role !== "admin";

  return (
    <>
      {testing && (
        <form action={setViewAs} className="flex flex-wrap items-center justify-center gap-x-3 bg-slate-800 px-4 py-1.5 text-center text-sm font-semibold text-white">
          <span>관리자 테스트: {ROLE_LABEL[p.role]} 화면</span>
          {/* 링크가 아니라 제출 버튼 — /mypage로 이동만 하면 전환이 풀리지 않는다 */}
          <button type="submit" name="role" value="admin"
            className="inline-flex min-h-11 items-center rounded px-2 underline underline-offset-2 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            관리자로 돌아가기
          </button>
        </form>
      )}
      {children}
    </>
  );
}
