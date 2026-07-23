"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// 병원 리뷰 작성 (간호사만). RLS로 author_id=본인 강제. 병원당 1리뷰(unique).
export async function createReview(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 병원 계정이 자기 병원에 리뷰를 달아 평점을 올리는 것을 차단(rating_avg는 공개 노출).
  // DB(reviews_insert_own 정책)에서도 간호사만 허용 — anon key가 공개라 앱 게이트만으론 우회된다.
  // 여기만 보기 전환(viewAsRole)을 쓰지 않는다 — 관리자의 테스트 리뷰가 실제 병원 평점에 집계되면 안 되므로
  // DB상 실제 간호사만 통과시킨다.
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "nurse") redirect("/reviews/new?error=nurse_only");

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
