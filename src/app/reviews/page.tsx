import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import MasterDetail, { ListCard, Pager } from "@/components/MasterDetail";
import HospitalSearchBox from "@/components/HospitalSearchBox";
import { getMyProfile } from "@/lib/data/user";
import { currentUserId } from "@/lib/data/board";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { deleteReview } from "./actions";
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

/**
 * 내 리뷰의 수정·삭제 버튼.
 * 🔴 전체 목록과 병원별 목록 두 곳에서 같은 것을 그린다 — 한쪽에만 붙이면 "내가 쓴 그 병원 리뷰"를
 *    가장 자연스럽게 찾는 경로(병원 검색)에서 고칠 수단이 안 보인다.
 */
function OwnerActions({ id, mine }: Readonly<{ id: string; mine: boolean }>) {
  if (!mine) return null;
  return (
    <span className="flex items-center gap-1">
      <Link href={`/reviews/${id}/edit`} className="min-h-11 rounded-[12px] px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
        수정
      </Link>
      <form action={deleteReview}>
        <input type="hidden" name="review_id" value={id} />
        <ConfirmSubmit size="sm" message="이 리뷰를 삭제할까요?&#10;병원 평점에서도 즉시 빠집니다. 내용만 고치려면 '수정'을 쓰세요.">삭제</ConfirmSubmit>
      </form>
    </span>
  );
}

function ReviewDetail({ r, uid }: Readonly<{ r: ReviewRow; uid: string | null }>) {
  // 내 리뷰일 때만 수정·삭제. 병원당 1건이라 수정이 없으면 한 번 쓴 뒤 영영 못 고친다.
  const mine = uid !== null && uid === r.author_id;
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-slate-900">{r.hospital?.name ?? "병원"}</h2>
        <Stars rating={r.rating} />
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {r.hospital?.region}{r.work_period ? ` · ${r.work_period} 근무` : ""} · {fmtDay(r.created_at)}
        {r.updated_at > r.created_at && <span className="ml-1 text-slate-400">· 수정됨 {fmtDay(r.updated_at)}</span>}
      </p>
      <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-slate-800">{r.content}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <p className="text-xs text-slate-400">간호사 회원 · 비실명 후기</p>
        <OwnerActions id={r.id} mine={mine} />
      </div>
    </article>
  );
}

export default async function ReviewsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ ok?: string; error?: string; page?: string; r?: string; hospital?: string }> }>) {
  // 리뷰는 이력서를 등록한 간호사 회원만 볼 수 있다(보기·읽기·작성 전부).
  const access = await getCommunityAccess();
  if (!access.ok) return <CommunityGate reason={access.reason} next="/reviews" />;

  const [{ ok, error, page, r: selectedId, hospital: hospitalId }, profile, uid] = await Promise.all([searchParams, getMyProfile(), currentUserId()]);
  // 관리자는 리뷰를 열람·모더레이션만 — 작성은 막히므로(평점 오염 방지) 작성 버튼을 숨긴다.
  const canWrite = !!profile && !profile.isAdmin;

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
      {ok === "edited" && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">리뷰를 수정했습니다.</div>}
      {ok === "deleted" && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">리뷰를 삭제했습니다. 병원 평점에서도 빠졌습니다.</div>}
      {error === "delete" && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">리뷰를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.</div>}
    </>
  );

  // ── 모드 1: 특정 병원을 고른 경우 → 그 병원 정보 + 리뷰(없으면 첫 리뷰 유도) ──
  if (hospitalId) {
    const [hospital, reviews] = await Promise.all([getHospital(hospitalId), getHospitalReviews(hospitalId)]);
    return (
      <>
        <SiteHeader user={profile ? { displayName: profile.displayName, role: profile.role } : null} />
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
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-slate-400">
                          간호사 회원
                          {v.updated_at > v.created_at && <span className="ml-1">· 수정됨 {fmtDay(v.updated_at)}</span>}
                        </p>
                        <OwnerActions id={v.id} mine={uid !== null && uid === v.author_id} />
                      </div>
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
      <SiteHeader user={profile ? { displayName: profile.displayName, role: profile.role } : null} />
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
            detail={detail && <ReviewDetail uid={uid} r={detail} />}
          />
        )}
      </main>
    </>
  );
}
