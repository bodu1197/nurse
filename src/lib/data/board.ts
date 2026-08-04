import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/user";

export type BoardPost = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  /** 트리거(board_posts_set_updated_at)가 유지한다. created_at 과 다르면 "수정됨"을 붙인다. */
  updated_at: string;
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
// 🔴 빌드 때 값이 없으면 "undefined/storage/..." 가 그대로 박혀 **사진 전체가 조용히 깨진다**.
//    supabase/admin.ts 와 같이 그 자리에서 터뜨려 배포 전에 알아채게 한다.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL 이 없습니다 — 게시판 사진 주소를 만들 수 없습니다");
const BOARD_IMG_BASE = `${SUPABASE_URL}/storage/v1/render/image/public/board/`;

export const isExternalImage = (v: string): boolean => v.startsWith("http");
export const boardImageUrl = (v: string, width = 900): string =>
  isExternalImage(v) ? v : `${BOARD_IMG_BASE}${v}?width=${width}&quality=75`;

export const BOARD_PER_PAGE = 20;

/**
 * 게시판 목록 — 최신순, 페이지 나누기. 댓글 수는 join count 로 한 번에.
 *
 * 🔴 숨김 제외를 RLS 에만 맡기지 않고 여기서도 건다. RLS(board_posts_read)는 관리자에게 숨긴 글을
 *    보여준다 — 모더레이션 화면이 그래야 하기 때문이다. 그 예외가 공개 목록에도 걸리면
 *    관리자가 글을 숨긴 뒤 /board 에서 그대로 보고 "안 먹었나" 하게 된다. 숨긴 것은 /admin/board 에서 본다.
 */
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
    .eq("is_hidden", false)
    .eq("comments.is_hidden", false) // 숨긴 댓글은 개수에서도 빠진다 — 눌러보면 없는 댓글을 세어 보이지 않게
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
    .select("id,title,body,created_at,updated_at,author_id,legacy_nickname,images,author:profiles(display_name)")
    .eq("id", id)
    .eq("is_hidden", false) // 숨긴 글은 관리자에게도 공개 상세에서 안 보인다(getBoardPosts 주석 참조)
    .maybeSingle<BoardPost>();
  if (error) console.error("getBoardPost failed:", error.message);
  if (!post) return null;
  const { data: comments } = await supabase
    .from("board_comments")
    .select("id,body,created_at,author_id,legacy_nickname,author:profiles(display_name)")
    .eq("post_id", id)
    .eq("is_hidden", false)
    .order("created_at", { ascending: true })
    .returns<BoardComment[]>();
  return { post, comments: comments ?? [] };
}

/** 지금 로그인한 회원 id — 내 글/댓글에 삭제 버튼을 보여줄지 판단용. */
export async function currentUserId(): Promise<string | null> {
  return (await getSessionUser())?.id ?? null;
}
