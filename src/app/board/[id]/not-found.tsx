import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import { getCurrentUser } from "@/lib/data/user";

export default async function PostNotFound() {
  const user = await getCurrentUser();
  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">삭제되었거나 없는 글입니다</h1>
        <p className="mt-2 text-sm text-slate-500">글이 삭제되었거나 주소가 잘못되었습니다.</p>
        <div className="mt-6 flex justify-center">
          <Button href="/board" size="md">게시판으로</Button>
        </div>
      </main>
    </>
  );
}
