import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import SubmitButton from "@/components/SubmitButton";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import MasterDetail, { ListCard, Pager } from "@/components/MasterDetail";
import { getCurrentUser } from "@/lib/data/user";
import { getBoardPosts, getBoardPost, currentUserId, BOARD_PER_PAGE } from "@/lib/data/board";
import { fmtDay } from "@/lib/date";
import { messageFor } from "@/lib/constants";
import { createComment, deleteComment, deletePost } from "./actions";

export const metadata = {
  title: "간호사 게시판 — 널스넷",
  description: "간호사끼리 정보와 고민을 나누는 커뮤니티 게시판.",
  alternates: { canonical: "/board" },
};

const ERRORS: Record<string, string> = {
  empty: "댓글 내용을 입력해 주세요.",
  save: "등록에 실패했습니다. 다시 시도해 주세요.",
  delete: "삭제에 실패했습니다.",
};

// 우측 상세 — 글 본문 + 댓글 + 댓글 작성.
async function PostPanel({ id, uid, loggedIn, error }: Readonly<{ id: string; uid: string | null; loggedIn: boolean; error?: string }>) {
  const data = await getBoardPost(id);
  if (!data) return <p className="rounded-lg border border-slate-200 bg-white p-6 text-slate-500">삭제되었거나 없는 글입니다.</p>;
  const { post, comments } = data;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-xl font-bold text-slate-900">{post.title}</h2>
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

      <section id="comments" className="mt-8">
        <h3 className="font-bold text-slate-900">댓글 {comments.length}</h3>
        {messageFor(ERRORS, error) && <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{messageFor(ERRORS, error)}</div>}

        {comments.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100">
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

        {loggedIn ? (
          <form action={createComment} className="mt-4 flex flex-col gap-2">
            <input type="hidden" name="post_id" value={post.id} />
            <label htmlFor="comment" className="sr-only">댓글</label>
            <textarea id="comment" name="body" required rows={3} maxLength={1000} placeholder="댓글을 입력하세요"
              className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40" />
            <SubmitButton pendingText="등록 중…">댓글 등록</SubmitButton>
          </form>
        ) : (
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            댓글을 쓰려면 <Link href={`/login?notice=board&next=${encodeURIComponent(`/board?p=${post.id}`)}`} className="font-semibold text-teal-700 hover:underline">로그인</Link>하세요.
          </p>
        )}
      </section>
    </div>
  );
}

export default async function BoardPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ page?: string; ok?: string; p?: string; error?: string }> }>) {
  const [{ page, ok, p: selectedId, error }, user, uid] = await Promise.all([searchParams, getCurrentUser(), currentUserId()]);
  const pageNum = Math.max(1, Number(page) || 1);
  const { posts, total } = await getBoardPosts(pageNum);
  const totalPages = Math.max(1, Math.ceil(total / BOARD_PER_PAGE));

  // 선택 글이 이번 페이지 목록에 없어도(공유 링크·2페이지 이후) 그 글을 열어야 한다.
  // PostPanel이 id로 직접 조회하므로 목록에 없어도 정상 표시되고, 없는 글이면 안내가 뜬다.
  const selected = selectedId || posts[0]?.id;
  const onList = (id: string | undefined) => !!id && posts.some((v) => v.id === id);

  const href = (params: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, String(v));
    const s = q.toString();
    return s ? `/board?${s}` : "/board";
  };

  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">간호사 게시판</h1>
            <p className="mt-1 text-sm text-slate-600">현직·예비 간호사끼리 정보와 고민을 나누는 공간입니다.</p>
          </div>
          <Button href="/board/new" size="md">글쓰기</Button>
        </div>

        {ok === "deleted" && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">글을 삭제했습니다.</div>}

        {posts.length === 0 ? (
          <p className="py-20 text-center text-slate-500">
            아직 글이 없습니다. <Link href="/board/new" className="font-semibold text-teal-700 hover:underline">첫 글을 남겨보세요</Link>
          </p>
        ) : (
          <MasterDetail
            selecting={!!selectedId}
            list={
              <>
                <ul className="space-y-3">
                  {posts.map((v) => (
                    <li key={v.id}>
                      <ListCard href={href({ p: v.id, page: pageNum > 1 ? pageNum : undefined })} on={onList(selected) && selected === v.id}>
                        <p className="font-semibold text-slate-900">
                          {v.title}
                          {v.comment_count > 0 && <span className="ml-1.5 text-sm font-bold text-teal-700">[{v.comment_count}]</span>}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">{v.author?.display_name ?? "탈퇴한 회원"} · {fmtDay(v.created_at)}</p>
                      </ListCard>
                    </li>
                  ))}
                </ul>
                <Pager page={pageNum} totalPages={totalPages} href={(n) => href({ page: n })} />
              </>
            }
            detail={selected && <PostPanel id={selected} uid={uid} loggedIn={!!user} error={error} />}
          />
        )}
      </main>
    </>
  );
}
