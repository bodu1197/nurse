import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SubmitButton from "@/components/SubmitButton";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { getCurrentUser } from "@/lib/data/user";
import { getBoardPost, currentUserId } from "@/lib/data/board";
import { fmtDay } from "@/lib/date";
import { messageFor } from "@/lib/constants";
import { createComment, deleteComment, deletePost } from "../actions";

export const metadata = { title: "게시글 — 널스넷 게시판", robots: { index: false } };

const ERRORS: Record<string, string> = {
  empty: "댓글 내용을 입력해 주세요.",
  save: "등록에 실패했습니다. 다시 시도해 주세요.",
  delete: "삭제에 실패했습니다.",
};

export default async function PostPage({
  params,
  searchParams,
}: Readonly<{ params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }>) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const [data, user, uid] = await Promise.all([getBoardPost(id), getCurrentUser(), currentUserId()]);
  if (!data) notFound();
  const { post, comments } = data;

  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Link href="/board" className="text-sm text-teal-700 hover:underline">← 게시판</Link>

        <article className="mt-3">
          <h1 className="text-2xl font-bold text-slate-900">{post.title}</h1>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <p className="text-sm text-slate-500">{post.author?.display_name ?? "탈퇴한 회원"} · {fmtDay(post.created_at)}</p>
            {uid === post.author_id && (
              <form action={deletePost}>
                <input type="hidden" name="post_id" value={post.id} />
                <ConfirmSubmit size="sm" message="이 글을 삭제할까요? 댓글도 함께 삭제되며 되돌릴 수 없습니다.">삭제</ConfirmSubmit>
              </form>
            )}
          </div>
          <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-slate-800">{post.body}</p>
        </article>

        <section id="comments" className="mt-10">
          <h2 className="font-bold text-slate-900">댓글 {comments.length}</h2>

          {messageFor(ERRORS, error) && <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{messageFor(ERRORS, error)}</div>}

          {comments.length > 0 && (
            <ul className="mt-4 divide-y divide-slate-100">
              {comments.map((c) => (
                <li key={c.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800">{c.author?.display_name ?? "탈퇴한 회원"}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{fmtDay(c.created_at)}</span>
                      {uid === c.author_id && (
                        <form action={deleteComment}>
                          <input type="hidden" name="comment_id" value={c.id} />
                          <input type="hidden" name="post_id" value={post.id} />
                          <button type="submit" className="inline-flex min-h-11 items-center rounded px-1 text-xs text-slate-500 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">삭제</button>
                        </form>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{c.body}</p>
                </li>
              ))}
            </ul>
          )}

          {user ? (
            <form action={createComment} className="mt-4 flex flex-col gap-2">
              <input type="hidden" name="post_id" value={post.id} />
              <label htmlFor="comment" className="sr-only">댓글</label>
              <textarea id="comment" name="body" required rows={3} maxLength={1000} placeholder="댓글을 입력하세요"
                className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40" />
              <SubmitButton pendingText="등록 중…">댓글 등록</SubmitButton>
            </form>
          ) : (
            <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              댓글을 쓰려면 <Link href={`/login?notice=board&next=/board/${post.id}`} className="font-semibold text-teal-700 hover:underline">로그인</Link>하세요.
            </p>
          )}
        </section>
      </main>
    </>
  );
}
