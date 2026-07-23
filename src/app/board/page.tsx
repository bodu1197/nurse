import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import { getCurrentUser } from "@/lib/data/user";
import { getBoardPosts, BOARD_PER_PAGE } from "@/lib/data/board";
import { fmtDay } from "@/lib/date";

export const metadata = {
  title: "간호사 게시판 — 널스넷",
  description: "간호사끼리 정보와 고민을 나누는 커뮤니티 게시판.",
  alternates: { canonical: "/board" },
};

export default async function BoardPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ page?: string; ok?: string }> }>) {
  const [{ page, ok }, user] = await Promise.all([searchParams, getCurrentUser()]);
  const pageNum = Math.max(1, Number(page) || 1);
  const { posts, total } = await getBoardPosts(pageNum);
  const totalPages = Math.max(1, Math.ceil(total / BOARD_PER_PAGE));
  const pageHref = (n: number) => (n > 1 ? `/board?page=${n}` : "/board");

  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
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
          <ul className="mt-6 divide-y divide-slate-100 border-y border-slate-100">
            {posts.map((p) => (
              <li key={p.id}>
                <Link href={`/board/${p.id}`} className="flex items-center gap-3 py-4 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">
                      {p.title}
                      {p.comment_count > 0 && <span className="ml-1.5 text-sm font-bold text-teal-700">[{p.comment_count}]</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">{p.author?.display_name ?? "탈퇴한 회원"} · {fmtDay(p.created_at)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <nav className="mt-6 flex items-center justify-center gap-3 text-sm" aria-label="페이지">
            {pageNum > 1 ? <Link href={pageHref(pageNum - 1)} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">← 이전</Link> : <span />}
            <span className="text-slate-500">{pageNum} / {totalPages}</span>
            {pageNum < totalPages ? <Link href={pageHref(pageNum + 1)} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">다음 →</Link> : <span />}
          </nav>
        )}
      </main>
    </>
  );
}
