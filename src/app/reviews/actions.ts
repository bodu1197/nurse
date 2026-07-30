"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasResume, requireCommunityMember } from "@/lib/data/community";

// 병원 리뷰 작성 (간호사 회원 + 관리자). RLS로 author_id=본인 강제. 병원당 1리뷰(unique).
export async function createReview(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 병원 계정이 자기 병원에 리뷰를 달아 평점을 올리는 것을 차단(rating_avg는 공개 노출).
  // DB(reviews_insert_own 정책)에서도 같은 판정 — anon key가 공개라 앱 게이트만으론 우회된다.
  //
  // getCommunityAccess(보기전환 role)를 쓰지 않는다 — 보기 전환 중인 계정이 실제 평점을 매기면 안 되므로
  // 여기선 DB상 실제 역할만 본다. 이력서 요건만 공용 hasResume로 재사용.
  //
  // 🔴 관리자도 작성한다(오너 확정 2026-07-31). 전에는 평점 오염을 걱정해 막았는데,
  //    막힌 이유가 화면에 안 나와 오너 본인이 "버튼이 없다"고 막혔다. 관리자에겐 이력서를 묻지 않는다
  //    (관리자는 이력서를 쓰는 계정이 아니다 — 물으면 영영 통과 못 한다).
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = prof?.role;
  if (role !== "nurse" && role !== "admin") redirect("/reviews/new?error=nurse_only");
  if (role === "nurse" && !(await hasResume(user.id))) redirect("/reviews/new?error=no_resume");

  const hospitalId = String(formData.get("hospital_id") ?? "");
  const rating = Number(formData.get("rating") ?? 0);
  const content = String(formData.get("content") ?? "").trim();
  const workPeriod = String(formData.get("work_period") ?? "").trim() || null;

  if (!hospitalId || !Number.isInteger(rating) || rating < 1 || rating > 5 || content.length < 10) {
    redirect("/reviews/new?error=invalid");
  }

  const { error } = await supabase
    .from("reviews")
    .insert({ hospital_id: hospitalId, author_id: user.id, rating, content, work_period: workPeriod });

  if (error) {
    redirect(`/reviews/new?error=${error.code === "23505" ? "dup" : "save"}`);
  }
  redirect("/reviews?ok=1");
}

/**
 * 리뷰 수정.
 *
 * 🔴 왜 필요: 리뷰는 **병원당 1건**(unique 제약)이다. 수정이 없으면 오타를 고치려 해도
 *    지우고 다시 쓰는 수밖에 없는데 삭제 경로도 없었다 — 즉 한 번 쓰면 영영 못 고쳤다.
 *
 * 병원은 바꿀 수 없다(다른 병원 리뷰가 되면 그건 새 리뷰다 — unique 제약과도 충돌한다).
 * 별점·내용·근무기간만 고친다. 본인 것만 — RLS(reviews_update_own)가 최종 판정하고,
 * 그 정책은 '지금도 회원(또는 관리자)인 계정'까지 확인한다.
 */
export async function updateReview(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("review_id") ?? "");
  if (!id) redirect("/reviews");
  const rating = Number(formData.get("rating") ?? 0);
  const content = String(formData.get("content") ?? "").trim();
  const workPeriod = String(formData.get("work_period") ?? "").trim() || null;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || content.length < 10) {
    redirect(`/reviews/${id}/edit?error=invalid`);
  }

  // 반환 행으로 실제 반영을 확인한다 — RLS 에 막히면 0행인데 error 는 null 이다.
  const { data, error } = await supabase
    .from("reviews").update({ rating, content, work_period: workPeriod }).eq("id", id).select("id");
  if (error || !data?.length) {
    console.error("updateReview failed:", error?.message ?? "no row");
    redirect(`/reviews/${id}/edit?error=save`);
  }
  redirect("/reviews?ok=edited");
}

/**
 * 리뷰 삭제. 본인 것만(RLS reviews_delete_own).
 * 병원 평점(rating_avg·rating_count)은 트리거(on_review_change)가 알아서 다시 계산한다.
 */
export async function deleteReview(formData: FormData) {
  // 🔴 리뷰·게시판은 **이력서를 등록한 간호사 회원**(+관리자)만 쓰고·보고·고치고·지운다.
  //    수정(updateReview)은 RLS 의 with check 가 막지만 삭제 정책에는 그 조건이 없어 여기서 함께 건다.
  //    게시판(deletePost)은 이미 같은 게이트를 쓰고 있다 — 두 곳의 규칙을 맞춘다.
  await requireCommunityMember("/reviews");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const id = String(formData.get("review_id") ?? "");
  if (!id) redirect("/reviews");

  const { data, error } = await supabase.from("reviews").delete().eq("id", id).select("id");
  if (error || !data?.length) {
    console.error("deleteReview failed:", error?.message ?? "no row");
    redirect("/reviews?error=delete");
  }
  redirect("/reviews?ok=deleted");
}
