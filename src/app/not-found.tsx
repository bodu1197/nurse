import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import { getMyProfile } from "@/lib/data/user";

export const metadata = { title: "페이지를 찾을 수 없습니다 — 널스넷", robots: { index: false } };

// 앱 전역 404. 없으면 Next 기본 화면이 떠서 헤더도 한국어도 없다.
export default async function NotFound() {
  const profile = await getMyProfile();
  return (
    <>
      <SiteHeader user={profile ? { displayName: profile.displayName } : null} />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">페이지를 찾을 수 없습니다</h1>
        <p className="mt-2 text-sm text-slate-500">주소가 바뀌었거나 삭제된 페이지입니다.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button href="/" size="md">홈으로</Button>
          <Button href="/jobs" variant="outline" size="md">채용공고</Button>
        </div>
      </main>
    </>
  );
}
