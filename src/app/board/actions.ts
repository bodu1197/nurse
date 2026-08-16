"use server";

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCommunityMember } from "@/lib/data/community";

/**
 * 🔴 게시판은 사용자에게 닫혀 있다(오너 지시 2026-08-16 — 글 2,857건 중 2,856건이 레거시 가짜 글).
 *    화면은 next.config.ts 가 /board·/board/:path* 를 307 로 /customer 에 접어서 막는다.
 *    그런데 **Server Action 은 페이지를 거치지 않고 POST 로 직접 불린다** — 닫혔다는 사실을
 *    라우팅 한 겹에만 맡기면, 화면이 없는 채로 쓰기만 살아 있는 상태가 된다.
 *    되살릴 때: 아래를 false 로 바꾸고, next.config.ts 의 리다이렉트 3개(/board · /board/:path* ·
 *    /community_board/:path*)를 지운다. 게시판을 닫아 두는 곳은 그 두 파일뿐이다.
 */
const BOARD_CLOSED = true;

async function requireBoardMember(next: string) {
  if (BOARD_CLOSED) notFound();
  return requireCommunityMember(next);
}

const TITLE_MAX = 100;
const BODY_MAX = 5000;
const COMMENT_MAX = 1000;

export async function createPost(formData: FormData) {
  // 게시판은 이력서를 등록한 간호사 회원만 — 폼이 게이트되지만 서버에서도 재확인.
  const userId = await requireBoardMember("/board/new");
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim().slice(0, TITLE_MAX);
  const body = String(formData.get("body") ?? "").trim().slice(0, BODY_MAX);
  if (!title || !body) redirect("/board/new?error=empty");

  const { data, error } = await supabase
    .from("board_posts").insert({ author_id: userId, title, body }).select("id").single();
  if (error || !data) {
    console.error("createPost failed:", error?.message);
    redirect("/board/new?error=save");
  }
  redirect(`/board?p=${data.id}`);
}

export async function deletePost(formData: FormData) {
  await requireBoardMember("/board");
  const supabase = await createClient();
  const id = String(formData.get("post_id") ?? "");
  if (!id) redirect("/board");
  // RLS(board_posts_delete)가 본인 글만 지운다. 반환 행으로 실제 삭제를 확인한다.
  const { data } = await supabase.from("board_posts").delete().eq("id", id).select("id");
  if (!data?.length) redirect(`/board?p=${id}&error=delete`);
  redirect("/board?ok=deleted");
}

export async function createComment(formData: FormData) {
  const postId = String(formData.get("post_id") ?? "");
  const userId = await requireBoardMember(postId ? `/board?p=${postId}` : "/board");
  const supabase = await createClient();
  const body = String(formData.get("body") ?? "").trim().slice(0, COMMENT_MAX);
  if (!postId || !body) redirect(`/board?p=${postId}&error=empty`);

  const { error } = await supabase.from("board_comments").insert({ post_id: postId, author_id: userId, body });
  if (error) {
    console.error("createComment failed:", error.message);
    redirect(`/board?p=${postId}&error=save`);
  }
  redirect(`/board?p=${postId}#comments`);
}

export async function deleteComment(formData: FormData) {
  const userId = await requireBoardMember("/board");
  const supabase = await createClient();
  const id = String(formData.get("comment_id") ?? "");
  const postId = String(formData.get("post_id") ?? "");
  // RLS(board_comments_delete)가 본인 댓글 + 커뮤니티 회원만 통과시킨다.
  // 🔴 반환 행을 본다 — 0행인데 그냥 넘어가면 화면은 삭제된 것처럼 되돌아오는데 댓글은 그대로 남는다
  //    (이력서를 지워 회원 자격을 잃은 경우가 실제로 그렇다).
  if (id) {
    const { data } = await supabase.from("board_comments").delete().eq("id", id).eq("author_id", userId).select("id");
    if (!data?.length) redirect(`/board?p=${postId}&error=delete#comments`);
  }
  redirect(`/board?p=${postId}#comments`);
}

/**
 * 게시글 수정.
 *
 * 🔴 왜 필요: 수정이 없어서 오타 하나를 고치려면 글을 지우고 다시 써야 했고, 지우는 순간
 *    달려 있던 댓글이 함께 사라졌다(board_comments 가 post 에 cascade). 남의 댓글을 내 오타
 *    때문에 없애는 셈이라, 사실상 고치지 말라는 화면이었다.
 *
 * 본인 글만 — RLS(board_posts_update)가 최종 판정한다. 반환 행으로 실제 반영을 확인한다
 * (RLS 에 막히면 0행인데 error 는 null 이라, 안 고쳐놓고 "수정했습니다"가 뜬다).
 */
export async function updatePost(formData: FormData) {
  await requireBoardMember("/board");
  const supabase = await createClient();
  const id = String(formData.get("post_id") ?? "");
  if (!id) redirect("/board");

  const title = String(formData.get("title") ?? "").trim().slice(0, TITLE_MAX);
  const body = String(formData.get("body") ?? "").trim().slice(0, BODY_MAX);
  if (!title || !body) redirect(`/board/${id}/edit?error=empty`);

  const { data, error } = await supabase
    .from("board_posts").update({ title, body }).eq("id", id).select("id");
  if (error || !data?.length) {
    console.error("updatePost failed:", error?.message ?? "no row");
    redirect(`/board/${id}/edit?error=save`);
  }
  redirect(`/board?p=${id}&ok=edited`);
}
