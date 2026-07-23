import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import MasterDetail, { ListCard, Pager } from "@/components/MasterDetail";
import { getMyProfile } from "@/lib/data/user";
import { getReviews, getReview, REVIEWS_PER_PAGE, type ReviewRow } from "@/lib/data/reviews";
import { REGIONS } from "@/lib/resumeOptions";
import { fmtDay } from "@/lib/date";

export const metadata = { title: "병원 리뷰 — 널스넷", robots: { index: false } };

const field = "h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40";

function Stars({ rating }: Readonly<{ rating: number }>) {
  return (
    <span className="text-amber-400" aria-label={`평점 ${rating}점`}>
      {"★".repeat(rating)}<span className="text-slate-300">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

function ReviewDetail({ r }: Readonly<{ r: ReviewRow }>) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-slate-900">{r.hospital?.name ?? "병원"}</h2>
        <Stars rating={r.rating} />
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {r.hospital?.region}{r.work_period ? ` · ${r.work_period} 근무` : ""} · {fmtDay(r.created_at)}
      </p>
      <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-slate-800">{r.content}</p>
      <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">간호사 회원 · 비실명 후기</p>
    </article>
  );
}

export default async function ReviewsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ ok?: string; page?: string; r?: string; q?: string; region?: string; rating?: string }> }>) {
  const [{ ok, page, r: selectedId, q, region, rating }, profile] = await Promise.all([searchParams, getMyProfile()]);
  const pageNum = Math.max(1, Number(page) || 1);
  const kw = (q ?? "").trim();
  const ratingNum = Number(rating) || 0;
  const filters = { q: kw || undefined, region: region || undefined, rating: ratingNum || undefined };
  const { reviews, total } = await getReviews(filters, pageNum);
  const totalPages = Math.max(1, Math.ceil(total / REVIEWS_PER_PAGE));
  const filtered = !!(kw || region || ratingNum);

  // 선택 리뷰가 이번 페이지에 없어도(공유 링크·2페이지 이후) 그 리뷰를 연다.
  // 목록에 있으면 재조회 없이 재사용, 없으면 id로 직접 조회.
  const selected = selectedId || reviews[0]?.id;
  const detail = selected ? (reviews.find((v) => v.id === selected) ?? (await getReview(selected))) : null;

  // 검색 조건은 링크·페이지 이동에서 유지한다.
  const href = (params: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    if (kw) p.set("q", kw);
    if (region) p.set("region", region);
    if (ratingNum) p.set("rating", String(ratingNum));
    for (const [k, v] of Object.entries(params)) if (v) p.set(k, String(v));
    const s = p.toString();
    return s ? `/reviews?${s}` : "/reviews";
  };

  return (
    <>
      <SiteHeader user={profile ? { displayName: profile.displayName } : null} />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">병원 리뷰</h1>
            <p className="mt-1 text-sm text-slate-500">간호사들이 직접 남긴 병원 근무 후기입니다. (비실명)</p>
          </div>
          {profile && <Button href="/reviews/new" size="md">리뷰 작성</Button>}
        </div>

        {/* 병원명·지역·별점으로 리뷰를 거른다. 병원 13만 개 규모라 서버에서 필터한다. */}
        <form action="/reviews" method="get" className="mt-4 flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3">
          <div className="flex flex-1 flex-col gap-1" style={{ minWidth: "12rem" }}>
            <label htmlFor="q" className="text-xs font-medium text-slate-600">병원 이름</label>
            <input id="q" name="q" defaultValue={kw} placeholder="병원 이름으로 검색" className={field} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="region" className="text-xs font-medium text-slate-600">지역</label>
            <select id="region" name="region" defaultValue={region ?? ""} className={field}>
              <option value="">전체</option>
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="rating" className="text-xs font-medium text-slate-600">별점</label>
            <select id="rating" name="rating" defaultValue={ratingNum || ""} className={field}>
              <option value="">전체</option>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}점</option>)}
            </select>
          </div>
          <Button type="submit" size="md">검색</Button>
        </form>

        {ok === "1" && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">리뷰가 등록되었습니다. 감사합니다.</div>}

        <p className="mt-3 text-sm text-slate-500">{filtered ? "검색 결과" : "전체"} <b className="text-slate-800">{total}건</b></p>

        {reviews.length === 0 ? (
          <p className="py-20 text-center text-slate-500">{filtered ? "조건에 맞는 리뷰가 없습니다. 필터를 넓혀보세요." : "아직 리뷰가 없습니다. 첫 리뷰를 남겨보세요."}</p>
        ) : (
          <MasterDetail
            selecting={!!selectedId}
            list={
              <>
                <ul className="space-y-3">
                  {reviews.map((v) => (
                    <li key={v.id}>
                      <ListCard href={href({ r: v.id, page: pageNum > 1 ? pageNum : undefined })} on={selected === v.id}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">{v.hospital?.name ?? "병원"}</span>
                          <Stars rating={v.rating} />
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400">{v.hospital?.region}{v.work_period ? ` · ${v.work_period}` : ""}</p>
                        <p className="mt-1 line-clamp-2 text-sm text-slate-600">{v.content}</p>
                      </ListCard>
                    </li>
                  ))}
                </ul>
                <Pager page={pageNum} totalPages={totalPages} href={(n) => href({ page: n })} />
              </>
            }
            detail={detail && <ReviewDetail r={detail} />}
          />
        )}
      </main>
    </>
  );
}
