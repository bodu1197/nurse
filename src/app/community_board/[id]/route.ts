import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 구 널스넷 게시글 주소(/community_board/{document_srl}) → 새 글.
 *
 * 🔴 **지금 이 핸들러는 돌지 않는다**(2026-08-16~). 게시판을 사용자에게 닫으면서
 *    next.config.ts 에 `/community_board/:path*` → `/customer` 307 을 뒀고, config redirects 는
 *    파일시스템 라우트보다 먼저 돌기 때문이다. 게시판을 되살리면 그 규칙만 지우면 여기가 다시 산다.
 *    (지우지 않고 남긴 이유: legacy_srl ↔ 새 글 id 매핑은 여기 말고 어디에도 없다.)
 *
 * 🔴 next.config.ts 의 redirects 로는 이걸 못 한다 — 정적 규칙이라 DB 를 볼 수 없다.
 *    그래서 이 경로만 라우트 핸들러로 뺐다(나머지 레거시 경로는 config 규칙 그대로).
 *
 * 왜 목록으로 뭉개지 않는가: 게시글 2,856건은 **실제로 이관됐고** legacy_srl 에 원본 번호가
 *    그대로 있다(20260728160000_board_legacy_import.sql). 크롤된 레거시 상세 URL 2,245개가
 *    전부 여기에 대응한다. 옛 북마크·검색 결과를 타고 온 사람을 빈 목록으로 보내는 것과
 *    자기가 찾던 글로 보내는 것은 완전히 다른 경험이다.
 *
 * RLS: board_posts 읽기는 '이력서 등록한 간호사 회원' 으로 잠겨 있다. 여기서는 **id 하나만**
 *    찾으면 되므로 서버 권한(admin)으로 조회한다 — 내용은 넘기지 않는다. 도착한 /board 화면이
 *    비회원에게는 평소대로 게이트를 보여준다(이 핸들러가 권한을 우회해 내용을 노출하지 않는다).
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { origin } = new URL(request.url);
  const { id } = await ctx.params;

  // 라이믹스 document_srl 은 숫자다. 숫자가 아니면 조회하지 않는다(불필요한 왕복·주입 여지 제거).
  const srl = /^\d+$/.test(id) ? Number(id) : null;
  if (srl === null) return NextResponse.redirect(`${origin}/board`, 308);

  // 🔴 숨긴 글은 없는 것으로 친다. 서버 권한 조회라 RLS 를 타지 않으므로 여기서 직접 건다 —
  //    빼면 관리자가 숨긴 글로 **308(영구)** 리다이렉트가 나가 브라우저·CDN 에 죽은 링크가 굳고,
  //    "그 글이 존재한다" 는 사실까지 알려준다.
  const { data, error } = await createAdminClient()
    .from("board_posts").select("id").eq("legacy_srl", srl).eq("is_hidden", false).maybeSingle();
  // 조회 실패는 일시 장애일 수 있다 → 영구(308)로 굳히지 않고 목록으로 임시 이동시킨다.
  if (error) {
    console.error("legacy board redirect failed:", error.message, srl);
    return NextResponse.redirect(`${origin}/board`, 307);
  }
  if (!data) return NextResponse.redirect(`${origin}/board`, 308); // 이관 안 된 글 — 목록으로
  return NextResponse.redirect(`${origin}/board?p=${data.id}`, 308);
}
