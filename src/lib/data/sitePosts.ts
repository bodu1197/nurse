import { createClient } from "@/lib/supabase/server";

/**
 * 공개 화면(/notice · /faq · /event)이 읽는 글.
 *
 * 🔴 예전에는 src/lib/customerContent.ts 의 TypeScript 배열이었다. 공지 한 줄에 코드 수정과
 *    재배포가 필요해서 오너가 혼자 못 고쳤다. 이제 관리자 화면(/admin/content)에서 쓴다.
 *
 * 비공개(작성 중) 글은 RLS(site_posts_read)가 걸러낸다 — 여기서 다시 거르지 않아도 되지만,
 * 관리자가 이 화면을 볼 때는 관리자용 정책이 통과시키므로 **공개 조건을 여기서도 건다.**
 * (안 그러면 관리자만 작성 중인 글이 공개 페이지에 보여 "왜 올라갔지" 가 된다.)
 */
export type PublicPost = { id: string; title: string; body: string; published_at: string };

export async function getPublicPosts(kind: "notice" | "faq" | "event"): Promise<PublicPost[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_posts")
    .select("id,title,body,published_at")
    .eq("kind", kind)
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .order("sort", { ascending: false })
    .order("published_at", { ascending: false });
  if (error) console.error(`getPublicPosts(${kind}):`, error.message);
  return (data ?? []) as PublicPost[];
}
