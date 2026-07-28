import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/user";

export type BoardPost = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  author_id: string | null;
  author: { display_name: string | null } | null;
  legacy_nickname: string | null;
  images: string[];
};

export type BoardListItem = {
  id: string;
  title: string;
  created_at: string;
  author: { display_name: string | null } | null;
  legacy_nickname: string | null;
  comment_count: number;
};

export type BoardComment = {
  id: string;
  body: string;
  created_at: string;
  author_id: string | null;
  author: { display_name: string | null } | null;
  legacy_nickname: string | null;
};

/**
 * 화면에 쓸 작성자 이름. 구 널스넷에서 옮겨온 글·댓글은 대부분 익명이라 author_id 가 없고
 * legacy_nickname("익명_42469")만 있다. 이걸 안 쓰면 이관분 전체가 "탈퇴한 회원"으로 보인다.
 */
export const authorName = (v: { author: { display_name: string | null } | null; legacy_nickname: string | null }): string =>
  v.author?.display_name ?? v.legacy_nickname ?? "탈퇴한 회원";

/**
 * 글에 딸린 사진 주소. 값이 http 로 시작하면 남의 서버(뉴스 기사 이미지)라 그대로 쓰고,
 * 아니면 board 버킷의 오브젝트 경로다 → **변환 URL**로 만든다.
 * 원본은 한 장에 1.8MB 짜리도 있어(실측) 그대로 내보내면 모바일에서 글 하나가 몇 MB 다.
 * 변환을 걸면 같은 사진이 300KB webp 로 온다(실측 1,864KB → 292KB).
 */
const BOARD_IMG_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/render/image/public/board/`;
export const boardImageUrl = (v: string, width = 900): string =>
  v.startsWith("http") ? v : `${BOARD_IMG_BASE}${v}?width=${width}&quality=75`;

export const BOARD_PER_PAGE = 20;

// 게시판 목록 — 최신순, 페이지 나누기. 댓글 수는 join count 로 한 번에.
export async function getBoardPosts(page = 1): Promise<{ posts: BoardListItem[]; total: number }> {
  const supabase = await createClient();
  const from = (Math.max(1, page) - 1) * BOARD_PER_PAGE;
  type Raw = {
    id: string; title: string; created_at: string;
    author: { display_name: string | null } | null;
    legacy_nickname: string | null;
    comments: { count: number }[];
  };
  const { data, count, error } = await supabase
    .from("board_posts")
    .select("id,title,created_at,legacy_nickname,author:profiles(display_name),comments:board_comments(count)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + BOARD_PER_PAGE - 1)
    .returns<Raw[]>();
  if (error) console.error("getBoardPosts failed:", error.message);
  const posts = (data ?? []).map((p) => ({
    id: p.id, title: p.title, created_at: p.created_at, author: p.author, legacy_nickname: p.legacy_nickname,
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
    .select("id,title,body,created_at,author_id,legacy_nickname,images,author:profiles(display_name)")
    .eq("id", id)
    .maybeSingle<BoardPost>();
  if (error) console.error("getBoardPost failed:", error.message);
  if (!post) return null;
  const { data: comments } = await supabase
    .from("board_comments")
    .select("id,body,created_at,author_id,legacy_nickname,author:profiles(display_name)")
    .eq("post_id", id)
    .order("created_at", { ascending: true })
    .returns<BoardComment[]>();
  return { post, comments: comments ?? [] };
}

/** 지금 로그인한 회원 id — 내 글/댓글에 삭제 버튼을 보여줄지 판단용. */
export async function currentUserId(): Promise<string | null> {
  return (await getSessionUser())?.id ?? null;
}
