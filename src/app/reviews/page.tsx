import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import MasterDetail, { ListCard, Pager } from "@/components/MasterDetail";
import HospitalSearchBox from "@/components/HospitalSearchBox";
import { getMyProfile } from "@/lib/data/user";
import { getCommunityAccess } from "@/lib/data/community";
import CommunityGate from "@/components/CommunityGate";
import {
  getReviews, getReview, getHospital, getHospitalReviews, REVIEWS_PER_PAGE, type ReviewRow,
} from "@/lib/data/reviews";
import { fmtDay } from "@/lib/date";

export const metadata = { title: "병원 리뷰 — 널스넷", robots: { index: false } };

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
}: Readonly<{ searchParams: Promise<{ ok?: string; page?: string; r?: string; hospital?: string }> }>) {
  // 리뷰는 이력서를 등록한 간호사 회원만 볼 수 있다(보기·읽기·작성 전부).
  const access = await getCommunityAccess();
  if (!access.ok) return <CommunityGate reason={access.reason} next="/reviews" />;

  const [{ ok, page, r: selectedId, hospital: hospitalId }, profile] = await Promise.all([searchParams, getMyProfile()]);
  const canWrite = !!profile;

  const renderHeader = (initialName = "") => (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">병원 리뷰</h1>
          <p className="mt-1 text-sm text-slate-500">간호사들이 직접 남긴 병원 근무 후기입니다. (비실명)</p>
        </div>
        {canWrite && <Button href={hospitalId ? `/reviews/new?hospital=${hospitalId}` : "/reviews/new"} size="md">리뷰 작성</Button>}
      </div>
      {/* 병원 이름을 치면 8만 개 병원에서 실시간으로 찾아 그 병원 리뷰로 이동한다. */}
      <div className="mt-4"><HospitalSearchBox initialName={initialName} /></div>
      {ok === "1" && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">리뷰가 등록되었습니다. 감사합니다.</div>}
    </>
  );

  // ── 모드 1: 특정 병원을 고른 경우 → 그 병원 정보 + 리뷰(없으면 첫 리뷰 유도) ──
  if (hospitalId) {
    const [hospital, reviews] = await Promise.all([getHospital(hospitalId), getHospitalReviews(hospitalId)]);
    return (
      <>
        <SiteHeader user={profile ? { displayName: profile.displayName } : null} />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
          {renderHeader(hospital?.name ?? "")}
          <Link href="/reviews" className="mt-4 inline-block text-sm text-teal-700 hover:underline">← 전체 리뷰</Link>

          {!hospital ? (
            <p className="py-20 text-center text-slate-500">병원을 찾을 수 없습니다.</p>
          ) : (
            <section className="mt-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xl font-bold text-slate-900">{hospital.name}</h2>
                  {hospital.rating_count > 0 && (
                    <span className="flex items-center gap-2 text-sm">
                      <Stars rating={Math.round(hospital.rating_avg)} />
                      <span className="font-semibold text-slate-700">{hospital.rating_avg.toFixed(1)}</span>
                      <span className="text-slate-500">· 리뷰 {hospital.rating_count}</span>
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-500">{hospital.region}{hospital.address ? ` · ${hospital.address}` : ""}</p>
              </div>

              {reviews.length === 0 ? (
                <div className="mt-6 rounded-xl border border-dashed border-slate-300 py-16 text-center">
                  <p className="text-slate-500">아직 이 병원 리뷰가 없습니다.</p>
                  {canWrite
                    ? <Button href={`/reviews/new?hospital=${hospital.id}`} size="md" className="mt-3">첫 리뷰 작성하기</Button>
                    : <p className="mt-2 text-sm text-slate-500"><Link href="/login" className="font-semibold text-teal-700 hover:underline">로그인</Link> 후 첫 리뷰를 남겨보세요.</p>}
                </div>
              ) : (
                <ul className="mt-6 space-y-3">
                  {reviews.map((v) => (
                    <li key={v.id} className="rounded-xl border border-slate-200 bg-white p-5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-500">{v.work_period ? `${v.work_period} 근무 · ` : ""}{fmtDay(v.created_at)}</span>
                        <Stars rating={v.rating} />
                      </div>
                      <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-slate-800">{v.content}</p>
                      <p className="mt-2 text-xs text-slate-400">간호사 회원</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </main>
      </>
    );
  }

  // ── 모드 2: 전체 리뷰 둘러보기(마스터-디테일) ──
  const pageNum = Math.max(1, Number(page) || 1);
  const { reviews, total } = await getReviews(pageNum);
  const totalPages = Math.max(1, Math.ceil(total / REVIEWS_PER_PAGE));
  const selected = selectedId || reviews[0]?.id;
  const detail = selected ? (reviews.find((v) => v.id === selected) ?? (await getReview(selected))) : null;

  const href = (params: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, String(v));
    const s = q.toString();
    return s ? `/reviews?${s}` : "/reviews";
  };

  return (
    <>
      <SiteHeader user={profile ? { displayName: profile.displayName } : null} />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6">
        {renderHeader()}
        {reviews.length === 0 ? (
          <p className="py-20 text-center text-slate-500">아직 리뷰가 없습니다. 병원을 검색해 첫 리뷰를 남겨보세요.</p>
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
