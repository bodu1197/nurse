"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCommunityMember } from "@/lib/data/community";

const TITLE_MAX = 100;
const BODY_MAX = 5000;
const COMMENT_MAX = 1000;

export async function createPost(formData: FormData) {
  // 게시판은 이력서를 등록한 간호사 회원만 — 폼이 게이트되지만 서버에서도 재확인.
  const userId = await requireCommunityMember("/board/new");
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
  await requireCommunityMember("/board");
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
  const userId = await requireCommunityMember(postId ? `/board?p=${postId}` : "/board");
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
  const userId = await requireCommunityMember("/board");
  const supabase = await createClient();
  const id = String(formData.get("comment_id") ?? "");
  const postId = String(formData.get("post_id") ?? "");
  // RLS(board_comments_delete)가 본인 댓글만 지운다. 남의 댓글이면 0행이라 조용히 넘어간다.
  if (id) await supabase.from("board_comments").delete().eq("id", id).eq("author_id", userId);
  redirect(`/board?p=${postId}#comments`);
}
