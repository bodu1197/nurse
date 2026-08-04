import Link from "next/link";
import { Pager } from "@/components/MasterDetail";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { fmtDay } from "@/lib/date";
import { getModerationRows, MODERATION_PER_PAGE, HIDEABLE, isHideable, type Hideable } from "@/lib/data/admin";
import { setHidden } from "@/app/admin/actions";

export const metadata = { title: "모더레이션 — 관리자" };
export const dynamic = "force-dynamic";

const TAB_LABEL: Record<Hideable, string> = {
  reviews: "리뷰",
  board_posts: "게시글",
  board_comments: "댓글",
};

const ERRORS: Record<string, string> = {
  reason: "사유를 두 글자 이상 적어야 합니다. 왜 숨겼는지 남지 않으면 나중에 설명할 수 없습니다.",
  target: "대상을 찾을 수 없습니다.",
  save: "저장에 실패했습니다. 다시 시도해 주세요.",
};

export default async function ModerationPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ kind?: string; hidden?: string; page?: string; ok?: string; error?: string }> }>) {
  const sp = await searchParams;
  const kind: Hideable = isHideable(sp.kind) ? sp.kind : "reviews";
  const hidden = sp.hidden === "1";
  const page = Math.max(1, Number(sp.page) || 1);

  const { rows, total } = await getModerationRows(kind, { hidden, page });
  const totalPages = Math.max(1, Math.ceil(total / MODERATION_PER_PAGE));

  // 이 화면으로 되돌아올 주소 — 서버 액션이 끝나고 원래 보던 탭·페이지로 정확히 복귀한다.
  const here = (over: { kind?: Hideable; hidden?: boolean; page?: number } = {}) => {
    const q = new URLSearchParams();
    q.set("kind", over.kind ?? kind);
    if (over.hidden ?? hidden) q.set("hidden", "1");
    const p = over.page ?? page;
    if (p > 1) q.set("page", String(p));
    return `/admin/moderation?${q.toString()}`;
  };

  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900">모더레이션</h1>
      <p className="mt-1 text-sm text-slate-500">
        허위·비방 글을 <b className="text-slate-700">숨깁니다</b>. 지우지 않으므로 언제든 되돌릴 수 있습니다.
        {kind === "reviews" && " 숨긴 리뷰는 병원 평점에서도 빠집니다."}
      </p>

      {sp.error && (
        <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {ERRORS[sp.error] ?? "처리에 실패했습니다."}
        </p>
      )}
      {sp.ok && (
        <p role="status" className="mt-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          처리했습니다. 기록이 남았습니다.
        </p>
      )}

      {/* 무엇을 볼 것인가 */}
      <nav className="mt-5 flex flex-wrap gap-2" aria-label="대상">
        {HIDEABLE.map((k) => (
          <Link key={k} href={here({ kind: k, page: 1 })} aria-current={k === kind ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
              k === kind ? "border-teal-500 bg-teal-50 font-semibold text-teal-700" : "border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}>
            {TAB_LABEL[k]}
          </Link>
        ))}
      </nav>
      <nav className="mt-2 flex flex-wrap gap-2" aria-label="상태">
        {[false, true].map((h) => (
          <Link key={String(h)} href={here({ hidden: h, page: 1 })} aria-current={h === hidden ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
              h === hidden ? "border-slate-800 bg-slate-800 font-semibold text-white" : "border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}>
            {h ? "숨긴 것" : "보이는 것"}
          </Link>
        ))}
      </nav>

      <p className="mt-4 text-sm text-slate-500">{total.toLocaleString()}건</p>

      {rows.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
          {hidden ? `숨긴 ${TAB_LABEL[kind]} 항목이 없습니다.` : `${TAB_LABEL[kind]} 항목이 없습니다.`}
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-slate-500">
                <span className="font-semibold text-slate-700">{r.who}</span>
                <time dateTime={r.created_at}>{fmtDay(r.created_at)}</time>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{r.text}</p>

              <form action={setHidden} className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center">
                <input type="hidden" name="kind" value={kind} />
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="hide" value={r.is_hidden ? "0" : "1"} />
                <input type="hidden" name="back" value={here()} />
                <label className="min-w-0 flex-1">
                  <span className="sr-only">사유</span>
                  <input
                    name="reason" required minLength={2} maxLength={200}
                    placeholder={r.is_hidden ? "되돌리는 사유 (예: 오인 숨김)" : "숨기는 사유 (예: 특정인 비방)"}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus-visible:ring-2 focus-visible:ring-teal-600"
                  />
                </label>
                <ConfirmSubmit
                  variant="outline"
                  message={r.is_hidden ? "다시 공개합니다. 계속할까요?" : "이 글을 숨깁니다. 사유가 기록에 남습니다. 계속할까요?"}
                >
                  {r.is_hidden ? "다시 공개" : "숨기기"}
                </ConfirmSubmit>
              </form>
            </li>
          ))}
        </ul>
      )}

      <Pager page={page} totalPages={totalPages} href={(n) => here({ page: n })} />
    </>
  );
}
