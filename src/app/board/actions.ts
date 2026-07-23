"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const TITLE_MAX = 100;
const BODY_MAX = 5000;
const COMMENT_MAX = 1000;

export async function createPost(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?notice=board&next=/board/new");

  const title = String(formData.get("title") ?? "").trim().slice(0, TITLE_MAX);
  const body = String(formData.get("body") ?? "").trim().slice(0, BODY_MAX);
  if (!title || !body) redirect("/board/new?error=empty");

  const { data, error } = await supabase
    .from("board_posts").insert({ author_id: user.id, title, body }).select("id").single();
  if (error || !data) {
    console.error("createPost failed:", error?.message);
    redirect("/board/new?error=save");
  }
  redirect(`/board?p=${data.id}`);
}

export async function deletePost(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const id = String(formData.get("post_id") ?? "");
  if (!id) redirect("/board");
  // RLS(board_posts_delete)가 본인 글만 지운다. 반환 행으로 실제 삭제를 확인한다.
  const { data } = await supabase.from("board_posts").delete().eq("id", id).select("id");
  if (!data?.length) redirect(`/board?p=${id}&error=delete`);
  redirect("/board?ok=deleted");
}

export async function createComment(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const postId = String(formData.get("post_id") ?? "");
  if (!user) redirect(`/login?notice=board&next=${encodeURIComponent(`/board?p=${postId}`)}`);
  const body = String(formData.get("body") ?? "").trim().slice(0, COMMENT_MAX);
  if (!postId || !body) redirect(`/board?p=${postId}&error=empty`);

  const { error } = await supabase.from("board_comments").insert({ post_id: postId, author_id: user.id, body });
  if (error) {
    console.error("createComment failed:", error.message);
    redirect(`/board?p=${postId}&error=save`);
  }
  redirect(`/board?p=${postId}#comments`);
}

export async function deleteComment(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const id = String(formData.get("comment_id") ?? "");
  const postId = String(formData.get("post_id") ?? "");
  // RLS(board_comments_delete)가 본인 댓글만 지운다. 남의 댓글이면 0행이라 조용히 넘어간다.
  if (id) await supabase.from("board_comments").delete().eq("id", id).eq("author_id", user.id);
  redirect(`/board?p=${postId}#comments`);
}
