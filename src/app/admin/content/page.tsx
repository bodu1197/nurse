import ConfirmSubmit from "@/components/ConfirmSubmit";
import { fmtDay } from "@/lib/date";
import { getSitePostsAdmin, SITE_POST_KINDS, SITE_POST_LABEL, isSitePostKind, type SitePostKind } from "@/lib/data/adminLists";
import { PageTitle, Tabs, Empty, Notice } from "@/components/admin/Ui";
import { saveSitePost, deleteSitePost } from "@/app/admin/actions";

export const metadata = { title: "공지 · FAQ · 이벤트 — 관리자" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  "1": "저장했습니다.",
  deleted: "삭제했습니다.",
  empty: "제목과 내용을 모두 적어주세요.",
  target: "대상을 찾을 수 없습니다.",
  save: "저장에 실패했습니다.",
};

const PLACEHOLDER: Record<SitePostKind, { title: string; body: string }> = {
  notice: { title: "예) 시스템 점검 안내", body: "공지 내용을 적습니다. 줄바꿈은 그대로 보입니다." },
  faq: { title: "예) 이력서는 무료인가요?", body: "답변을 적습니다." },
  event: { title: "예) 신규 병원 광고 할인", body: "이벤트 내용을 적습니다." },
};

export default async function AdminContentPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ kind?: string; ok?: string; error?: string }> }>) {
  const sp = await searchParams;
  const kind: SitePostKind = isSitePostKind(sp.kind) ? sp.kind : "notice";
  const posts = await getSitePostsAdmin(kind);
  const here = `/admin/content?kind=${kind}`;

  return (
    <>
      <PageTitle
        title="공지 · FAQ · 이벤트"
        desc="여기서 쓴 글이 사이트의 공지사항·자주 묻는 질문·이벤트 페이지에 바로 반영됩니다. 배포는 필요 없습니다."
      />
      <Notice ok={sp.ok} error={sp.error} messages={MESSAGES} />

      <Tabs items={SITE_POST_KINDS.map((k) => ({
        href: `/admin/content?kind=${k}`, label: SITE_POST_LABEL[k], active: k === kind,
      }))} />

      {/* 새 글 */}
      <form action={saveSitePost} className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="back" value={here} />
        <h2 className="mb-3 text-sm font-semibold text-slate-600">새 {SITE_POST_LABEL[kind]} 작성</h2>
        <label className="block">
          <span className="sr-only">제목</span>
          <input name="title" required maxLength={200} placeholder={PLACEHOLDER[kind].title}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus-visible:ring-2 focus-visible:ring-teal-600" />
        </label>
        <label className="mt-2 block">
          <span className="sr-only">내용</span>
          <textarea name="body" required rows={5} maxLength={20000} placeholder={PLACEHOLDER[kind].body}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus-visible:ring-2 focus-visible:ring-teal-600" />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="publish" value="1" defaultChecked className="h-4 w-4 rounded border-slate-300 text-teal-600 focus-visible:ring-2 focus-visible:ring-teal-600" />
            바로 공개
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            정렬
            <input name="sort" type="number" defaultValue={0} min={-999} max={999}
              className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-teal-500" />
            <span className="text-xs text-slate-400">숫자가 클수록 위로</span>
          </label>
          <button type="submit" className="ml-auto inline-flex min-h-11 items-center rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
            등록
          </button>
        </div>
      </form>

      {posts.length === 0 ? (
        <Empty>{SITE_POST_LABEL[kind]} 글이 아직 없습니다.</Empty>
      ) : (
        <ul className="space-y-3">
          {posts.map((p) => (
            <li key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <form action={saveSitePost}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="kind" value={kind} />
                <input type="hidden" name="back" value={here} />
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${p.published_at ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700"}`}>
                    {p.published_at ? "공개" : "비공개"}
                  </span>
                  <span className="text-slate-400">
                    {p.published_at ? `${fmtDay(p.published_at)} 공개` : "작성 중"} · 수정 {fmtDay(p.updated_at)}
                  </span>
                </div>
                <label className="block">
                  <span className="sr-only">제목</span>
                  <input name="title" required maxLength={200} defaultValue={p.title}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold outline-none focus:border-teal-500 focus-visible:ring-2 focus-visible:ring-teal-600" />
                </label>
                <label className="mt-2 block">
                  <span className="sr-only">내용</span>
                  <textarea name="body" required rows={4} maxLength={20000} defaultValue={p.body}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus-visible:ring-2 focus-visible:ring-teal-600" />
                </label>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" name="publish" value="1" defaultChecked={!!p.published_at}
                      className="h-4 w-4 rounded border-slate-300 text-teal-600 focus-visible:ring-2 focus-visible:ring-teal-600" />
                    공개
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    정렬
                    <input name="sort" type="number" defaultValue={p.sort} min={-999} max={999}
                      className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-teal-500" />
                  </label>
                  <button type="submit" className="ml-auto inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
                    저장
                  </button>
                </div>
              </form>
              {/* 🔴 삭제는 별도 폼이다. 같은 폼에 두면 저장하려다 삭제를 누를 수 있고, 이건 되돌릴 수 없다. */}
              <form action={deleteSitePost} className="mt-2 flex justify-end border-t border-slate-100 pt-2">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="back" value={here} />
                <ConfirmSubmit variant="danger" message="이 글을 영구히 삭제합니다. 되돌릴 수 없습니다. 계속할까요?">삭제</ConfirmSubmit>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
