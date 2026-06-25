import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import { getMyProfile } from "@/lib/data/user";
import { getRecentReviews } from "@/lib/data/reviews";

// 사용자 리뷰(비실명) — 콘텐츠가 충분히 쌓이면 noindex 해제 예정.
export const metadata = { title: "병원 리뷰 — 널스넷", robots: { index: false } };

const fmt = (iso: string) => new Date(iso).toISOString().slice(0, 10).replace(/-/g, ".");

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-400" aria-label={`평점 ${rating}점`}>
      {"★".repeat(rating)}<span className="text-slate-300">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export default async function ReviewsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ ok?: string }> }>) {
  const [profile, reviews] = await Promise.all([getMyProfile(), getRecentReviews(30)]);
  const { ok } = await searchParams;
  // 로그인 사용자만 리뷰 작성 버튼 노출(로그아웃엔 숨김). 역할 제한 없음.
  const canWrite = !!profile;

  return (
    <>
      <SiteHeader user={profile ? { displayName: profile.displayName } : null} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900">병원 리뷰</h1>
          {canWrite && (
            <Button href="/reviews/new" size="md">
              리뷰 작성
            </Button>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">간호사들이 직접 남긴 병원 근무 후기입니다. (비실명)</p>

        {ok === "1" && (
          <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
            리뷰가 등록되었습니다. 감사합니다.
          </div>
        )}

        {reviews.length === 0 ? (
          <p className="py-20 text-center text-slate-500">아직 리뷰가 없습니다. 첫 리뷰를 남겨보세요.</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">{r.hospital?.name ?? "병원"}</span>
                  <Stars rating={r.rating} />
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {r.hospital?.region}{r.work_period ? ` · ${r.work_period} 근무` : ""} · {fmt(r.created_at)}
                </div>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{r.content}</p>
                <div className="mt-2 text-xs text-slate-400">간호사 회원</div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
