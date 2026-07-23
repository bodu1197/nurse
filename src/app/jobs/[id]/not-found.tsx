import Button from "@/components/Button";
import { getMyProfile } from "@/lib/data/user";

// 마감·삭제됐거나 노출 기간이 끝난 공고. 안내는 그대로 두되 응답은 404다 —
// 200으로 "없습니다"를 돌려주면(soft 404) 검색엔진이 빈 페이지를 계속 다시 긁는다.
// 헤더는 상위 layout.tsx가 그린다.
export default async function JobNotFound() {
  const profile = await getMyProfile(); // cache() — layout이 이미 불러 쿼리는 늘지 않는다
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-16 text-center">
      <h1 className="text-xl font-bold text-slate-900">마감되었거나 노출 기간이 끝난 공고입니다</h1>
      <p className="mt-2 text-sm text-slate-500">공고가 내려가면 상세 내용을 볼 수 없습니다. 비슷한 공고를 찾아보세요.</p>
      <div className="mt-6 flex justify-center gap-2">
        <Button href="/jobs" size="md">채용공고 둘러보기</Button>
        {/* 간호사만 저장 목록이 있다 — 병원·비로그인에게는 로그인/마이페이지로 튕기는 링크가 된다 */}
        {profile?.role === "nurse" && <Button href="/mypage/saved" variant="outline" size="md">저장한 공고</Button>}
      </div>
    </main>
  );
}
