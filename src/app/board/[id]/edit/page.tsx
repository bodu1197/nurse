import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SubmitButton from "@/components/SubmitButton";
import CommunityGate from "@/components/CommunityGate";
import { getMyProfile } from "@/lib/data/user";
import { getCommunityAccess } from "@/lib/data/community";
import { getBoardPost, currentUserId } from "@/lib/data/board";
import { INPUT_CLASS, LINK_CLASS, messageFor } from "@/lib/constants";
import { updatePost } from "../../actions";

export const metadata = { title: "글 수정 — 널스넷 게시판", robots: { index: false } };

const ERRORS: Record<string, string> = {
  empty: "제목과 내용을 모두 입력해 주세요.",
  save: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
};

export default async function EditPostPage({
  params,
  searchParams,
}: Readonly<{ params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }>) {
  const access = await getCommunityAccess();
  const { id } = await params;
  if (!access.ok) return <CommunityGate reason={access.reason} next={`/board/${id}/edit`} />;
  const p = await getMyProfile();
  if (!p) return <CommunityGate reason="guest" next={`/board/${id}/edit`} />;

  const [found, uid, { error }] = await Promise.all([getBoardPost(id), currentUserId(), searchParams]);
  if (!found) notFound();
  // 남의 글 주소를 직접 열면 조용히 되돌린다 — 수정 폼을 보여줄 이유가 없다(저장은 RLS 가 막는다).
  if (found.post.author_id !== uid) redirect(`/board?p=${id}`);

  return (
    <>
      <SiteHeader user={{ displayName: p.displayName }} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <Link href={`/board?p=${id}`} className="text-sm text-teal-700 hover:underline">← 글로 돌아가기</Link>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">글 수정</h1>

        {messageFor(ERRORS, error) && (
          <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {messageFor(ERRORS, error)}
          </div>
        )}

        <form action={updatePost} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="post_id" value={id} />
          <div className="flex flex-col gap-1">
            <label htmlFor="title" className="text-sm font-medium text-slate-700">제목</label>
            <input id="title" name="title" required maxLength={100} defaultValue={found.post.title} className={INPUT_CLASS} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="body" className="text-sm font-medium text-slate-700">내용</label>
            <textarea id="body" name="body" required rows={12} maxLength={5000} defaultValue={found.post.body}
              className="w-full rounded-xl border border-slate-300 p-3 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40" />
          </div>
          {/* 사진은 이 화면에서 다루지 않는다 — 이관 글의 본문에 박혀 있고 새 글에도 업로드 경로가 없다.
              글만 고쳐도 댓글이 살아남는다는 것이 이 화면의 목적이다. */}
          <div className="flex items-center gap-3">
            <SubmitButton pendingText="저장 중…">수정 저장</SubmitButton>
            <Link href={`/board?p=${id}`} className={LINK_CLASS}>취소</Link>
          </div>
        </form>
      </main>
    </>
  );
}
