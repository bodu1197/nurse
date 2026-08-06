"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile, getSessionUser, viewAsRole } from "@/lib/data/user";
import { safeNext } from "@/lib/url";

/** 주소·폼으로 들어온 id 는 uuid 일 때만 쓴다 — 아니면 Postgres 가 22P02 로 죽고 로그만 남는다. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 💾 인재 찜하기/해제 — 병원이 검색 도중 후보를 담아 둔다(오너 지시 2026-08-07).
 *
 * 🔴 담아 두는 것에는 광고 자격을 걸지 않는다. 연락처를 여는 것(revealContacts)과 다른 일이다 —
 *    광고를 아직 안 낸 병원이 후보를 모아 두고 그다음에 결제하는 것이 자연스러운 순서다.
 *    대신 **병원 회원만** 쓴다. 간호사에게 "인재 찜" 은 뜻이 없다.
 * 🔴 저장은 하되 화면은 그대로 둔다 — 목록·상세 어디서 눌러도 보던 자리(next)로 되돌아간다.
 *    공고 찜(toggleSaveJob)과 같은 계약이다.
 */
export async function toggleSaveTalent(formData: FormData) {
  const talentId = String(formData.get("talent_id") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""), "/talent");
  if (!UUID_RE.test(talentId)) redirect(next);

  const [p, user] = await Promise.all([getMyProfile(), getSessionUser()]);
  // 로그인하지 않았으면 로그인 뒤 보던 자리로 돌려보낸다(누른 것이 헛되지 않게).
  if (!p || !user) redirect(`/login?next=${encodeURIComponent(next)}`);
  if ((await viewAsRole(p.role)) !== "hospital") redirect(next);
  // 자기 자신을 찜하는 경로(관리자가 병원 보기로 자기 이력서를 열었을 때)는 막는다.
  if (talentId === user.id) redirect(next);

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("saved_talents").select("id").eq("profile_id", user.id).eq("talent_id", talentId).maybeSingle();

  if (existing) {
    await supabase.from("saved_talents").delete().eq("id", existing.id);
  } else {
    // 이미 있으면 무시한다(unique 제약). 두 번 눌러 500 이 나는 것보다 조용히 유지되는 편이 맞다.
    const { error } = await supabase.from("saved_talents").insert({ profile_id: user.id, talent_id: talentId });
    if (error && error.code !== "23505") console.error("toggleSaveTalent failed:", error.message);
  }

  // 찜 개수를 배지로 그리는 화면들을 갱신한다.
  revalidatePath("/mypage");
  revalidatePath("/mypage/saved-talent");
  redirect(next);
}

/** 후보 메모 — 병원만 본다(간호사에게는 어떤 경로로도 가지 않는다). */
export async function saveTalentMemo(formData: FormData) {
  const talentId = String(formData.get("talent_id") ?? "");
  const memo = String(formData.get("memo") ?? "").trim().slice(0, 500);
  const next = safeNext(String(formData.get("next") ?? ""), "/mypage/saved-talent");
  const [p, user] = await Promise.all([getMyProfile(), getSessionUser()]);
  if (!p || !user || (await viewAsRole(p.role)) !== "hospital" || !UUID_RE.test(talentId)) redirect(next);

  const supabase = await createClient();
  // 찜하지 않은 사람에게는 메모가 붙지 않는다 — update 라 대상이 없으면 아무 일도 없다.
  const { error } = await supabase
    .from("saved_talents").update({ memo: memo || null })
    .eq("profile_id", user.id).eq("talent_id", talentId);
  if (error) console.error("saveTalentMemo failed:", error.message);
  redirect(next);
}
