"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// 병원 리뷰 작성 (간호사). RLS로 author_id=본인 강제. 병원당 1리뷰(unique).
export async function createReview(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
