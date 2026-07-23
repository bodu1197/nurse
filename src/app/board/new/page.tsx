import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SubmitButton from "@/components/SubmitButton";
import { getMyProfile } from "@/lib/data/user";
import { INPUT_CLASS, LINK_CLASS, messageFor } from "@/lib/constants";
import { createPost } from "../actions";

export const metadata = { title: "글쓰기 — 널스넷 게시판", robots: { index: false } };

const ERRORS: Record<string, string> = {
  empty: "제목과 내용을 모두 입력해 주세요.",
  save: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
};

export default async function NewPostPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ error?: string }> }>) {
  const p = await getMyProfile();
  if (!p) redirect("/login?notice=board&next=/board/new");
  const { error } = await searchParams;

  return (
    <>
      <SiteHeader user={{ displayName: p.displayName }} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <Link href="/board" className="text-sm text-teal-700 hover:underline">← 게시판</Link>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">글쓰기</h1>

        {messageFor(ERRORS, error) && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{messageFor(ERRORS, error)}</div>}

        <form action={createPost} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="title" className="text-sm font-medium text-slate-700">제목</label>
            <input id="title" name="title" required maxLength={100} className={INPUT_CLASS} placeholder="제목을 입력하세요" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="body" className="text-sm font-medium text-slate-700">내용</label>
            <textarea id="body" name="body" required rows={12} maxLength={5000}
              placeholder="자유롭게 작성하세요. 개인정보(전화번호·주소 등)는 공개되니 주의하세요."
              className="w-full rounded-xl border border-slate-300 p-3 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40" />
          </div>
          <div className="flex items-center gap-3">
            <SubmitButton pendingText="등록 중…">등록</SubmitButton>
            <Link href="/board" className={LINK_CLASS}>취소</Link>
          </div>
        </form>
      </main>
    </>
  );
}
