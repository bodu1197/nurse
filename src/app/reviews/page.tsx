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
        {/* 🔴 "간호사 회원"이라고 못 박지 않는다 — 관리자도 리뷰를 쓸 수 있게 된 뒤로는(2026-07-31)
            작성자 역할을 조회하지 않는 한 거짓 표기가 될 수 있다. 확실한 사실(비실명)만 적는다. */}
        <p className="text-xs text-slate-400">비실명 후기</p>
        <OwnerActions id={r.id} mine={mine} />
      </div>
    </article>
  );
}

export default async function ReviewsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ ok?: string; error?: string; page?: string; r?: string; hospital?: string }> }>) {
  // 리뷰 **글**은 이력서를 등록한 간호사 회원만 읽는다. 다만 화면 껍데기(제목·작성 버튼·병원 검색)는
  // 누구에게나 보여준다 — 아래 access 분기 참고.
  const [access, { ok, error, page, r: selectedId, hospital: hospitalId }, profile, uid] = await Promise.all([
    getCommunityAccess(), searchParams, getMyProfile(), currentUserId(),
  ]);
  // 🔴 "리뷰 작성" 버튼은 **누구에게나 그린다**(오너 확정 2026-07-31).
  //    전에는 관리자에게만 숨겼는데, 숨긴 이유를 화면에 한 글자도 안 알려줘서
  //    "버튼이 사라진 버그"로만 보였다. 자격 판정은 /reviews/new 와 RLS 가 한다 —
  //    버튼은 "여기가 리뷰 쓰는 곳"이라는 안내 역할이므로 조건을 걸지 않는다.

  const renderHeader = (initialName = "") => (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">병원 리뷰</h1>
          <p className="mt-1 text-sm text-slate-500">간호사들이 직접 남긴 병원 근무 후기입니다. (비실명)</p>
        </div>
        <Button href={hospitalId ? `/reviews/new?hospital=${hospitalId}` : "/reviews/new"} size="md">리뷰 작성</Button>
      </div>
      {/* 병원 이름을 치면 8만 개 병원에서 실시간으로 찾아 그 병원 리뷰로 이동한다. */}
      <div className="mt-4"><HospitalSearchBox initialName={initialName} /></div>
      {ok === "1" && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">리뷰가 등록되었습니다. 감사합니다.</div>}
      {ok === "edited" && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">리뷰를 수정했습니다.</div>}
      {ok === "deleted" && <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">리뷰를 삭제했습니다. 병원 평점에서도 빠졌습니다.</div>}
      {error === "delete" && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">리뷰를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.</div>}
    </>
  );

  // ── 모드 0: 회원이 아니면 **글만** 가린다 ──
  // 🔴 전에는 페이지 전체를 게이트로 갈아끼웠다. 그래서 비회원은 "여기가 병원 리뷰를 쓰는 곳"이라는
  //    사실 자체를 못 봤고, 가입할 이유도 안 보였다. 제목·"리뷰 작성" 버튼·병원 검색은 남기고
  //    리뷰 본문만 안내 카드로 대체한다(오너 확정 2026-07-31). 리뷰 데이터는 아래로 못 내려간다.
  if (!access.ok) {
    // 🔴 고른 병원 이름을 검색창에 되돌려 놓는다. 안 그러면 병원을 골라 화면이 바뀌었는데 검색창은
    //    비어 있고 내용도 그대로라, 클릭이 안 먹은 줄 알고 두세 번 더 누르게 된다.
    //    병원 명부는 원래 공개 테이블(hospitals_select_all = using(true))이라 새로 새는 정보가 없다.
    const picked = hospitalId ? await getHospital(hospitalId) : null;
    return (
      <>
        <SiteHeader user={profile ? { displayName: profile.displayName } : null} />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
          {renderHeader(picked?.name ?? "")}
          {/* 로그인 후에는 **고른 병원으로** 돌아와야 한다 — /reviews 로만 보내면 다시 검색해야 한다. */}
          <CommunityGate reason={access.reason} inline
            next={hospitalId ? `/reviews?hospital=${hospitalId}` : "/reviews"} />
        </main>
      </>
    );
  }

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
                  <Button href={`/reviews/new?hospital=${hospital.id}`} size="md" className="mt-3">첫 리뷰 작성하기</Button>
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
                          비실명 후기
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
            detail={detail && <ReviewDetail uid={uid} r={detail} />}
          />
        )}
      </main>
    </>
  );
}
