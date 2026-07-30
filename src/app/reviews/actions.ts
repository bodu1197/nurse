"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasResume } from "@/lib/data/community";

// 병원 리뷰 작성 (간호사만). RLS로 author_id=본인 강제. 병원당 1리뷰(unique).
export async function createReview(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 병원 계정이 자기 병원에 리뷰를 달아 평점을 올리는 것을 차단(rating_avg는 공개 노출).
  // DB(reviews_insert_own 정책)에서도 간호사만 허용 — anon key가 공개라 앱 게이트만으론 우회된다.
  // 여기만 보기 전환(viewAsRole)을 쓰지 않는다 — 관리자의 테스트 리뷰가 실제 병원 평점에 집계되면 안 되므로
  // DB상 실제 간호사만 통과시킨다.
  // getCommunityAccess(보기전환 role)를 쓰지 않는다 — 관리자의 view_as 리뷰가 실제 평점에 집계되면 안 되므로
  // 여기선 DB상 실제 역할만 본다(평점 오염 방지). 이력서 요건만 공용 hasResume로 재사용.
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "nurse") redirect("/reviews/new?error=nurse_only");
  if (!(await hasResume(user.id))) redirect("/reviews/new?error=no_resume");

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
 * 그 정책은 '지금도 간호사인 계정'까지 확인한다(평점 오염 방지).
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
