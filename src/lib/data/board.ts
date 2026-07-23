import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/user";

export type BoardPost = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  author_id: string;
  author: { display_name: string | null } | null;
};

export type BoardListItem = {
  id: string;
  title: string;
  created_at: string;
  author: { display_name: string | null } | null;
  comment_count: number;
};

export type BoardComment = {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  author: { display_name: string | null } | null;
};

export const BOARD_PER_PAGE = 20;

// 게시판 목록 — 최신순, 페이지 나누기. 댓글 수는 join count 로 한 번에.
export async function getBoardPosts(page = 1): Promise<{ posts: BoardListItem[]; total: number }> {
  const supabase = await createClient();
  const from = (Math.max(1, page) - 1) * BOARD_PER_PAGE;
  type Raw = {
    id: string; title: string; created_at: string;
    author: { display_name: string | null } | null;
    comments: { count: number }[];
  };
  const { data, count, error } = await supabase
    .from("board_posts")
    .select("id,title,created_at,author:profiles(display_name),comments:board_comments(count)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + BOARD_PER_PAGE - 1)
    .returns<Raw[]>();
  if (error) console.error("getBoardPosts failed:", error.message);
  const posts = (data ?? []).map((p) => ({
    id: p.id, title: p.title, created_at: p.created_at, author: p.author,
    comment_count: p.comments?.[0]?.count ?? 0,
  }));
  return { posts, total: count ?? 0 };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getBoardPost(id: string): Promise<{ post: BoardPost; comments: BoardComment[] } | null> {
  if (!UUID_RE.test(id)) return null;
  const supabase = await createClient();
  const { data: post, error } = await supabase
    .from("board_posts")
    .select("id,title,body,created_at,author_id,author:profiles(display_name)")
    .eq("id", id)
    .maybeSingle<BoardPost>();
  if (error) console.error("getBoardPost failed:", error.message);
  if (!post) return null;
  const { data: comments } = await supabase
    .from("board_comments")
    .select("id,body,created_at,author_id,author:profiles(display_name)")
    .eq("post_id", id)
    .order("created_at", { ascending: true })
    .returns<BoardComment[]>();
  return { post, comments: comments ?? [] };
}

/** 지금 로그인한 회원 id — 내 글/댓글에 삭제 버튼을 보여줄지 판단용. */
export async function currentUserId(): Promise<string | null> {
  return (await getSessionUser())?.id ?? null;
}
