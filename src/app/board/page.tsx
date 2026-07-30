import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import SubmitButton from "@/components/SubmitButton";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import MasterDetail, { ListCard, Pager } from "@/components/MasterDetail";
import { getCurrentUser } from "@/lib/data/user";
import { getCommunityAccess } from "@/lib/data/community";
import CommunityGate from "@/components/CommunityGate";
import { getBoardPosts, getBoardPost, currentUserId, authorName, boardImageUrl, isExternalImage, BOARD_PER_PAGE } from "@/lib/data/board";
import { fmtDay } from "@/lib/date";
import { messageFor } from "@/lib/constants";
import { createComment, deleteComment, deletePost } from "./actions";

// 이력서를 등록한 간호사 회원 전용(로그인 없이는 게이트만 보임) → 색인 제외.
export const metadata = {
  title: "간호사 게시판 — 널스넷",
  description: "간호사끼리 정보와 고민을 나누는 커뮤니티 게시판.",
  robots: { index: false },
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
        <p className="text-sm text-slate-500">
          {authorName(post)} · {fmtDay(post.created_at)}
          {/* 댓글이 달린 뒤 본문을 통째로 갈아치울 수 있으므로, 고쳤다는 사실은 읽는 사람에게도 보여야 한다 */}
          {post.updated_at > post.created_at && <span className="ml-1 text-slate-400">· 수정됨 {fmtDay(post.updated_at)}</span>}
        </p>
        {uid !== null && uid === post.author_id && (
          <span className="flex items-center gap-1">
            {/* 수정을 먼저 둔다 — 전에는 삭제뿐이라 오타 하나에 글을 지웠고 댓글이 함께 사라졌다 */}
            <Link href={`/board/${post.id}/edit`} className="min-h-11 rounded-[12px] px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
              수정
            </Link>
            <form action={deletePost}>
              <input type="hidden" name="post_id" value={post.id} />
              <ConfirmSubmit size="sm" message="이 글을 삭제할까요? 댓글도 함께 삭제되며 되돌릴 수 없습니다.&#10;오타만 고치려면 '수정'을 쓰세요 — 댓글이 남습니다.">삭제</ConfirmSubmit>
            </form>
          </span>
        )}
      </div>
      <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-slate-800">{post.body}</p>

      {/* 구 널스넷에서 옮겨온 글의 사진. 본문은 평문이라(HTML 을 그대로 그리면 XSS) 아래에 따로 붙인다.
          레거시 파일이라 원본 크기·비율을 모른다 → 자리(4:3)를 미리 잡고 object-contain 으로 안에 맞춘다.
          비워두면 사진이 도착하는 순간 글이 아래로 밀린다(읽던 줄을 놓친다). */}
      {post.images.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          {post.images.map((src, i) => (
            <div key={src} className="aspect-[4/3] w-full max-w-2xl overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element -- 외부 도메인 + 크기 미상이라 next/image 로 못 감싼다 */}
              <img
                src={boardImageUrl(src)}
                alt={`${post.title} 첨부 사진 ${i + 1}`}
                loading="lazy"
                // 뉴스 기사 이미지는 남의 서버에서 불러온다 → 회원 전용 페이지 주소가 그쪽 로그에 남지 않게 막는다.
                referrerPolicy={isExternalImage(src) ? "no-referrer" : undefined}
                className="h-full w-full object-contain"
              />
            </div>
          ))}
        </div>
      )}

      <section id="comments" className="mt-8">
        <h3 className="font-bold text-slate-900">댓글 {comments.length}</h3>
        {messageFor(ERRORS, error) && <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{messageFor(ERRORS, error)}</div>}

        {comments.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100">
            {comments.map((c) => (
              <li key={c.id} className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800">{authorName(c)}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{fmtDay(c.created_at)}</span>
                    {uid !== null && uid === c.author_id && (
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
  // 게시판은 이력서를 등록한 간호사 회원만 볼 수 있다(보기·읽기·작성 전부).
  const access = await getCommunityAccess();
  if (!access.ok) return <CommunityGate reason={access.reason} next="/board" />;

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
        {ok === "edited" && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">글을 수정했습니다.</div>}

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
                        <p className="mt-0.5 text-xs text-slate-500">{authorName(v)} · {fmtDay(v.created_at)}</p>
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
