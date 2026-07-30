import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SubmitButton from "@/components/SubmitButton";
import StarRating from "@/components/StarRating";
import CommunityGate from "@/components/CommunityGate";
import { getMyProfile } from "@/lib/data/user";
import { getCommunityAccess } from "@/lib/data/community";
import { getReview } from "@/lib/data/reviews";
import { currentUserId } from "@/lib/data/board";
import { INPUT_CLASS, LINK_CLASS, messageFor } from "@/lib/constants";
import { updateReview } from "../../actions";

export const metadata = { title: "리뷰 수정 — 널스넷", robots: { index: false } };

const ERR: Record<string, string> = {
  invalid: "별점(1~5)과 10자 이상의 내용을 입력해 주세요.",
  save: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
};

const label = "text-sm font-medium text-slate-700";

export default async function EditReviewPage({
  params,
  searchParams,
}: Readonly<{ params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }>) {
  const access = await getCommunityAccess();
  const { id } = await params;
  if (!access.ok) return <CommunityGate reason={access.reason} next={`/reviews/${id}/edit`} />;
  const p = await getMyProfile();
  if (!p) return <CommunityGate reason="guest" next={`/reviews/${id}/edit`} />;

  const [review, uid, { error }] = await Promise.all([getReview(id), currentUserId(), searchParams]);
  if (!review) notFound();
  // 남의 리뷰 주소를 직접 열면 목록으로 돌린다(저장은 RLS 가 막지만 폼을 보여줄 이유가 없다).
  if (review.author_id !== uid) redirect("/reviews");

  return (
    <>
      <SiteHeader user={{ displayName: p.displayName }} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <Link href="/reviews" className="text-sm text-teal-700 hover:underline">← 병원 리뷰</Link>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">리뷰 수정</h1>
        {/* 병원은 못 바꾼다 — 다른 병원 리뷰가 되면 그건 새 리뷰이고, 병원당 1건 제약과도 충돌한다. */}
        <p className="mt-1 text-sm text-slate-500">
          <b className="text-slate-700">{review.hospital?.name ?? "병원"}</b> 리뷰입니다. 병원은 바꿀 수 없습니다 —
          다른 병원 리뷰가 필요하면 <Link href="/reviews/new" className={LINK_CLASS}>새로 작성</Link>해 주세요.
        </p>

        {messageFor(ERR, error) && (
          <div role="alert" aria-live="assertive" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {messageFor(ERR, error)}
          </div>
        )}

        <form action={updateReview} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="review_id" value={review.id} />
          <div className="flex flex-col gap-1">
            <span className={label}>별점 <span className="text-red-500">*</span></span>
            <StarRating value={review.rating} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="work_period" className={label}>근무 기간 <span className="text-slate-400">(선택)</span></label>
            <input id="work_period" name="work_period" defaultValue={review.work_period ?? ""}
              placeholder="예: 2022~2024 / 1년 6개월" className={INPUT_CLASS} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="content" className={label}>리뷰 내용 <span className="text-red-500">*</span> <span className="text-slate-400">(10자 이상)</span></label>
            <textarea id="content" name="content" rows={7} required minLength={10} maxLength={2000} defaultValue={review.content}
              className="rounded-xl border border-slate-300 p-3 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40" />
          </div>
          <div className="flex items-center gap-3">
            <SubmitButton pendingText="저장 중…">수정 저장</SubmitButton>
            <Link href="/reviews" className={LINK_CLASS}>취소</Link>
          </div>
        </form>
      </main>
    </>
  );
}
