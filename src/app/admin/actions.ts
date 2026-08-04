"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/url";
import { DAY_MS, nowMs } from "@/lib/date";
import { requireAdmin, logAdmin, isHideable } from "@/lib/data/admin";
import { isSitePostKind } from "@/lib/data/adminLists";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 돌아갈 주소에 결과를 붙인다. back 은 폼에서 오는 값이라 **내부 경로만** 통과시킨다
// (safeNext 없이 redirect 하면 우리 도메인에서 시작하는 피싱 링크를 만들 수 있다).
const backTo = (back: string, key: string, value = "1") => {
  const path = safeNext(back, "/admin");
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${value}`;
};

const field = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// ── 리뷰 · 게시글 · 댓글 숨김 ──────────────────────────────

/**
 * 🔴 감사 기록은 여기서 남기지 않는다. DB 함수(admin_set_hidden)가 숨김과 기록을 같은
 *    트랜잭션에서 함께 한다 — 관리자가 앱을 건너뛰고 PostgREST 를 직접 불러도 기록이 남는다.
 */
export async function setHidden(formData: FormData) {
  await requireAdmin();
  const kind = field(formData, "kind");
  const id = field(formData, "id");
  const hide = field(formData, "hide") === "1";
  const reason = field(formData, "reason");
  const back = field(formData, "back") || "/admin/moderation";

  if (!isHideable(kind) || !UUID_RE.test(id)) redirect(backTo(back, "error", "target"));
  if (reason.length < 2) redirect(backTo(back, "error", "reason"));

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_hidden", { target_table: kind, target_id: id, hide, reason });
  if (error) {
    console.error("admin_set_hidden failed:", error.code, error.message);
    redirect(backTo(back, "error", error.code === "02000" ? "target" : "save"));
  }
  revalidatePath(kind === "reviews" ? "/reviews" : "/board");
  redirect(backTo(back, "ok"));
}

// ── 이력서 강제 공개/비공개 ────────────────────────────────

export async function setResumeVisibility(formData: FormData) {
  await requireAdmin();
  const id = field(formData, "id");
  const makePublic = field(formData, "public") === "1";
  const reason = field(formData, "reason");
  const back = field(formData, "back") || "/admin/resumes";

  if (!UUID_RE.test(id)) redirect(backTo(back, "error", "target"));
  if (reason.length < 2) redirect(backTo(back, "error", "reason"));

  await logAdmin({
    action: makePublic ? "resume.publish" : "resume.unpublish",
    targetTable: "resumes", targetId: id, reason,
  });

  // RLS(resumes_update_admin)가 관리자를 통과시키고, 컬럼 grant 가 쓸 수 있는 칸을 좁힌다.
  // service_role 을 쓰지 않는 이유는 20260804120000 주석 참조(방어선을 게이트 한 줄에 몰지 않는다).
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resumes").update({ is_public: makePublic }).eq("profile_id", id).select("profile_id");
  if (error) {
    console.error("setResumeVisibility:", error.message);
    redirect(backTo(back, "error", "save"));
  }
  if (!data?.length) redirect(backTo(back, "error", "target"));

  revalidatePath("/talent");
  redirect(backTo(back, "ok"));
}

// ── 광고 기간 연장 · 즉시 종료 ─────────────────────────────

export async function extendAd(formData: FormData) {
  await requireAdmin();
  const jobId = field(formData, "job_id");
  const days = Number(field(formData, "days"));
  const reason = field(formData, "reason");
  const back = field(formData, "back") || "/admin/ads";

  if (!UUID_RE.test(jobId)) redirect(backTo(back, "error", "target"));
  if (!Number.isInteger(days) || days < 1 || days > 365) redirect(backTo(back, "error", "days"));
  if (reason.length < 2) redirect(backTo(back, "error", "reason"));

  const supabase = await createClient();
  const { data: job } = await supabase.from("jobs").select("featured_until, ad_tier, status").eq("id", jobId).maybeSingle();
  if (!job) redirect(backTo(back, "error", "target"));

  // 이미 끝난 광고를 연장하면 **지금부터** 센다. 과거 종료일에 더하면 연장했는데도 여전히 끝나 있다.
  const base = job.featured_until ? Math.max(nowMs(), new Date(job.featured_until).getTime()) : nowMs();
  const until = new Date(base + days * DAY_MS).toISOString();

  await logAdmin({
    action: "ad.extend", targetTable: "jobs", targetId: jobId,
    reason: `${days}일 연장 (→ ${until.slice(0, 10)}) — ${reason}`,
  });

  // 🔴 status 를 함부로 건드리지 않는다. 전에는 status:"open" 을 같이 썼는데, 그러면 모더레이션으로
  //    숨긴(hidden) 공고나 결제 안 한(draft) 공고가 **광고 연장만으로 다시 노출**된다.
  //    딱 하나 예외 — 'closed' 는 endAd(즉시 종료)가 만든 상태다. 그걸 되돌리는 것이
  //    「다시 켜기」의 뜻이므로 그때만 연다. hidden·draft 는 그대로 둔다.
  const { data: updated, error } = await supabase
    .from("jobs")
    // 🔴 ad_tier 를 'standard'(유료)로 찍지 않는다. 관리자가 켜준 광고는 돈을 받은 것이 아니라
    //    유료로 표시하면 화면이 거짓말을 한다. 자격 판정은 실결제(ad_orders)를 보므로 이 값이
    //    권한을 주지는 않지만, 보이는 것과 사실이 어긋나면 매출을 잘못 읽는다.
    .update({ featured_until: until, ad_tier: job.ad_tier ?? "free", ...(job.status === "closed" ? { status: "open" } : {}) })
    .eq("id", jobId).select("id");
  if (error) {
    console.error("extendAd:", error.message);
    redirect(backTo(back, "error", "save"));
  }
  if (!updated?.length) redirect(backTo(back, "error", "target"));
  revalidatePath("/jobs");
  redirect(backTo(back, "ok"));
}

/**
 * 광고 즉시 종료.
 *
 * 🔴 손님이 무를 수 있는 기능이 아니다(오너 확정: 한번 사면 취소 없음). 사고 대응용 —
 *    잘못 부여했거나, 공고 내용에 문제가 있어 노출을 멈춰야 할 때만 쓴다. 환불은 하지 않는다.
 */
export async function endAd(formData: FormData) {
  await requireAdmin();
  const jobId = field(formData, "job_id");
  const reason = field(formData, "reason");
  const back = field(formData, "back") || "/admin/ads";

  if (!UUID_RE.test(jobId)) redirect(backTo(back, "error", "target"));
  if (reason.length < 2) redirect(backTo(back, "error", "reason"));

  await logAdmin({ action: "ad.end", targetTable: "jobs", targetId: jobId, reason });

  const supabase = await createClient();
  const { data: cur } = await supabase.from("jobs").select("status").eq("id", jobId).maybeSingle();
  if (!cur) redirect(backTo(back, "error", "target"));

  // 🔴 featured_until 만 지우면 **노출이 안 멈춘다.**
  //    게시 7일 이내 공고는 featured_until 이 아니라 posted_at 으로 노출된다(무료 게시 창).
  //    그래서 "즉시 종료"를 눌러도 목록에 그대로 남아 있었다(오너 지적 2026-08-04).
  //    공고 = 광고다 — 광고를 끝낸다는 것은 노출을 멈춘다는 뜻이므로 status 도 닫는다.
  //    🔴 open 일 때만 닫는다. hidden(모더레이션)·draft(결제 전)를 'closed' 로 덮으면
  //       그 상태가 왜 그랬는지가 지워진다.
  const { data, error } = await supabase
    .from("jobs")
    .update({ featured_until: null, ad_tier: null, ...(cur.status === "open" ? { status: "closed" } : {}) })
    .eq("id", jobId).select("id");
  if (error) {
    console.error("endAd:", error.message);
    redirect(backTo(back, "error", "save"));
  }
  if (!data?.length) redirect(backTo(back, "error", "target"));
  revalidatePath("/jobs");
  redirect(backTo(back, "ok"));
}

// ── 세금계산서 ─────────────────────────────────────────────

export async function saveTaxInfo(formData: FormData) {
  await requireAdmin();
  const id = field(formData, "id");
  const back = field(formData, "back") || "/admin/invoices";
  if (!UUID_RE.test(id)) redirect(backTo(back, "error", "target"));

  const bizNo = field(formData, "biz_no").replace(/\D/g, "");
  if (bizNo && bizNo.length !== 10) redirect(backTo(back, "error", "bizno"));

  // 세금계산서 정보는 돈과 상대방 사업자 정보다 — 누가 언제 바꿨는지 남아야 한다.
  await logAdmin({
    action: "tax.info", targetTable: "ad_orders", targetId: id,
    reason: `세금계산서 발행 정보 수정${bizNo ? ` (사업자 ${bizNo})` : ""}`,
  });

  const supabase = await createClient();
  const { data, error } = await supabase.from("ad_orders").update({
    tax_biz_no: bizNo || null,
    tax_biz_name: field(formData, "biz_name") || null,
    tax_ceo: field(formData, "ceo") || null,
    tax_email: field(formData, "email") || null,
  }).eq("id", id).select("id");
  if (error) {
    console.error("saveTaxInfo:", error.message);
    redirect(backTo(back, "error", "save"));
  }
  if (!data?.length) redirect(backTo(back, "error", "target"));
  redirect(backTo(back, "ok"));
}

export async function markTaxIssued(formData: FormData) {
  await requireAdmin();
  const id = field(formData, "id");
  const back = field(formData, "back") || "/admin/invoices";
  if (!UUID_RE.test(id)) redirect(backTo(back, "error", "target"));
  const invoiceNo = field(formData, "invoice_no").slice(0, 40);

  await logAdmin({
    action: "tax.issued", targetTable: "ad_orders", targetId: id,
    reason: invoiceNo ? `세금계산서 발행 완료 (승인번호 ${invoiceNo})` : "세금계산서 발행 완료",
  });

  const supabase = await createClient();
  const { data, error } = await supabase.from("ad_orders")
    .update({ tax_issued_at: new Date(nowMs()).toISOString(), tax_invoice_no: invoiceNo || null })
    .eq("id", id).is("tax_issued_at", null)  // 두 번 눌러도 발행일이 덮이지 않는다
    .select("id");
  if (error) {
    console.error("markTaxIssued:", error.message);
    redirect(backTo(back, "error", "save"));
  }
  if (!data?.length) redirect(backTo(back, "error", "target"));
  redirect(backTo(back, "ok", "issued"));
}

// ── 공지 · FAQ · 이벤트 ────────────────────────────────────

export async function saveSitePost(formData: FormData) {
  await requireAdmin();
  const id = field(formData, "id");
  const kind = field(formData, "kind");
  const title = field(formData, "title");
  const body = field(formData, "body");
  const publish = field(formData, "publish") === "1";
  const sort = Number(field(formData, "sort")) || 0;
  const back = field(formData, "back") || "/admin/content";

  if (!isSitePostKind(kind)) redirect(backTo(back, "error", "target"));
  if (id && !UUID_RE.test(id)) redirect(backTo(back, "error", "target"));
  if (!title || !body) redirect(backTo(back, "error", "empty"));

  const supabase = await createClient();
  // published_at 은 "공개로 바꾸는 순간"을 기록한다. 이미 공개였다면 그 시각을 유지해야
  // 목록 정렬(공개일 최신순)이 수정할 때마다 뒤집히지 않는다.
  let publishedAt: string | null = publish ? new Date(nowMs()).toISOString() : null;
  if (id) {
    const { data: prev } = await supabase.from("site_posts").select("published_at").eq("id", id).maybeSingle();
    if (publish && prev?.published_at) publishedAt = prev.published_at;
  }

  const row = { kind, title, body, published_at: publishedAt, sort };
  const { error } = id
    ? await supabase.from("site_posts").update(row).eq("id", id)
    : await supabase.from("site_posts").insert(row);
  if (error) {
    console.error("saveSitePost:", error.message);
    redirect(backTo(back, "error", "save"));
  }

  // 공개 화면 셋 다 이 표를 읽는다.
  for (const p of ["/notice", "/faq", "/event"]) revalidatePath(p);
  redirect(backTo(back, "ok"));
}

export async function deleteSitePost(formData: FormData) {
  await requireAdmin();
  const id = field(formData, "id");
  const back = field(formData, "back") || "/admin/content";
  if (!UUID_RE.test(id)) redirect(backTo(back, "error", "target"));

  await logAdmin({ action: "site_post.delete", targetTable: "site_posts", targetId: id, reason: "관리자 삭제" });

  const supabase = await createClient();
  const { error } = await supabase.from("site_posts").delete().eq("id", id);
  if (error) {
    console.error("deleteSitePost:", error.message);
    redirect(backTo(back, "error", "save"));
  }
  for (const p of ["/notice", "/faq", "/event"]) revalidatePath(p);
  redirect(backTo(back, "ok", "deleted"));
}

// ── 문의사항 ───────────────────────────────────────────────

const INQUIRY_STATUS = ["open", "answered", "closed"] as const;

export async function saveInquiry(formData: FormData) {
  await requireAdmin();
  const id = field(formData, "id");
  const status = field(formData, "status");
  const memo = field(formData, "memo").slice(0, 500);
  const back = field(formData, "back") || "/admin/inquiries";

  if (!UUID_RE.test(id) || !INQUIRY_STATUS.includes(status as (typeof INQUIRY_STATUS)[number])) {
    redirect(backTo(back, "error", "target"));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("inquiries").update({
    status,
    admin_memo: memo || null,
    // 답변완료로 넘어간 시각을 남긴다 — 되돌리면 지운다(거짓 기록을 남기지 않는다).
    answered_at: status === "answered" ? new Date(nowMs()).toISOString() : null,
  }).eq("id", id).select("id");
  if (error) {
    console.error("saveInquiry:", error.message);
    redirect(backTo(back, "error", "save"));
  }
  if (!data?.length) redirect(backTo(back, "error", "target"));
  redirect(backTo(back, "ok"));
}
