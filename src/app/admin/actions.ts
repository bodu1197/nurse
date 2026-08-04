"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/url";
import { requireAdmin, isHideable } from "@/lib/data/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 돌아갈 주소에 결과를 붙인다. back 은 폼에서 오는 값이라 **내부 경로만** 통과시킨다
// (safeNext 없이 redirect 하면 우리 도메인에서 시작하는 피싱 링크를 만들 수 있다).
const backTo = (back: string, key: string, value = "1") => {
  const path = safeNext(back, "/admin/moderation");
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${value}`;
};

/**
 * 리뷰·게시글·댓글 숨기기 / 되돌리기.
 *
 * 🔴 서버 액션은 layout 을 지나지 않는다 — layout 의 requireAdmin 을 믿으면 안 되고 여기서 다시 본다.
 *
 * 🔴 감사 기록은 **여기서 남기지 않는다.** DB 함수(admin_set_hidden)가 숨김과 기록을 같은
 *    트랜잭션에서 함께 한다. 앱에서 따로 남기면, 관리자가 공개 anon 키로 PostgREST 를 직접 불러
 *    앱을 건너뛰는 순간 기록만 사라진다 — 그 구멍을 막으려고 기록을 DB 안으로 옮겼다
 *    (20260804170000). 사유 검증도 DB 가 다시 한다.
 */
export async function setHidden(formData: FormData) {
  await requireAdmin();

  const kind = String(formData.get("kind") ?? "");
  const id = String(formData.get("id") ?? "");
  const hide = String(formData.get("hide") ?? "") === "1";
  const reason = String(formData.get("reason") ?? "").trim();
  const back = String(formData.get("back") ?? "/admin/moderation");

  if (!isHideable(kind) || !UUID_RE.test(id)) redirect(backTo(back, "error", "target"));
  // DB 도 같은 검사를 하지만, 여기서 걸러야 화면에 사유를 정확히 돌려줄 수 있다.
  if (reason.length < 2) redirect(backTo(back, "error", "reason"));

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_hidden", {
    target_table: kind, target_id: id, hide, reason,
  });
  if (error) {
    console.error("admin_set_hidden failed:", error.code, error.message);
    // 02000 = 대상 없음(그 사이에 지워짐). 나머지는 저장 실패로 뭉뚱그린다.
    redirect(backTo(back, "error", error.code === "02000" ? "target" : "save"));
  }

  // 공개 화면도 같이 갱신한다 — 숨겼는데 목록에 남아 있으면 안 먹은 것으로 보인다.
  revalidatePath(kind === "reviews" ? "/reviews" : "/board");
  redirect(backTo(back, "ok"));
}
