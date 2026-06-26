"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyBusiness } from "@/lib/data/nts";
import { adProduct } from "@/lib/ads";
import { getPayment, iamportReady } from "@/lib/iamport";

// 병원 사업자 진위확인 → 통과 시에만 business_verified(서버=service_role) 설정.
export async function verifyHospitalBusiness(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("role, business_verified").eq("id", user.id).maybeSingle();
  if (!prof || prof.role !== "hospital") redirect("/mypage");
  if (prof.business_verified) redirect("/mypage/verify?ok=1");

  const b_no = String(formData.get("b_no") ?? "");
  const start_dt = String(formData.get("start_dt") ?? "");
  const p_nm = String(formData.get("p_nm") ?? "");

  const res = await verifyBusiness(b_no, start_dt, p_nm);
  if (!res.ok) redirect(`/mypage/verify?error=${res.reason ?? "fail"}`);

  // 인증 시 병원을 1회 연결 → 이후 공고에 자동 사용(병원 재선택/재입력 방지).
  const hospitalId = String(formData.get("hospital_id") ?? "");
  if (hospitalId) {
    const { data: hosp } = await admin.from("hospitals").select("owner_profile_id").eq("id", hospitalId).maybeSingle();
    if (!hosp) redirect("/mypage/verify?error=hospital");
    if (hosp.owner_profile_id && hosp.owner_profile_id !== user.id) redirect("/mypage/verify?error=claimed");
    if (!hosp.owner_profile_id) await admin.from("hospitals").update({ owner_profile_id: user.id, is_claimed: true }).eq("id", hospitalId);
  }

  await admin
    .from("profiles")
    .update({
      business_no: b_no.replace(/\D/g, ""),
      business_verified: true,
      business_verified_at: new Date().toISOString(),
      ...(hospitalId ? { claimed_hospital_id: hospitalId } : {}),
    })
    .eq("id", user.id);

  redirect("/mypage/verify?ok=1");
}

// 공고 등록 — 인증된 병원만. 미claim 병원이면 claim 후 jobs 저장(서버 검증).
export async function createJob(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("role, business_verified").eq("id", user.id).maybeSingle();
  if (!prof || prof.role !== "hospital") redirect("/mypage");
  if (!prof.business_verified) redirect("/mypage/verify");

  const s = (k: string) => String(formData.get(k) ?? "").trim();
  const hospitalId = s("hospital_id");
  const title = s("title");
  if (!hospitalId || !title) redirect("/mypage/jobs/new?error=missing");

  const { data: hosp } = await admin.from("hospitals").select("id, owner_profile_id, region, free_credits").eq("id", hospitalId).maybeSingle();
  if (!hosp) redirect("/mypage/jobs/new?error=hospital");
  if (hosp.owner_profile_id && hosp.owner_profile_id !== user.id) redirect("/mypage/jobs/new?error=claimed");
  if (!hosp.owner_profile_id) {
    await admin.from("hospitals").update({ owner_profile_id: user.id, is_claimed: true }).eq("id", hospitalId);
    await admin.from("profiles").update({ claimed_hospital_id: hospitalId }).eq("id", user.id);
  }

  // 무료권(7일×4) 확인 — 소진 시 유료 광고 필요(Phase 2 결제).
  if ((hosp.free_credits ?? 0) <= 0) redirect("/mypage/jobs?error=nocredit");

  const benefits = s("benefits").split(",").map((x) => x.trim()).filter(Boolean);
  const { error } = await admin.from("jobs").insert({
    hospital_id: hospitalId,
    title,
    specialty: s("specialty") || null,
    location: s("location") || hosp.region || null,
    employment_type: s("employment_type") || null,
    salary_text: s("salary_text") || null,
    description: s("description") || null,
    benefits,
    source: "direct",
    status: "open",
  });
  if (error) redirect("/mypage/jobs/new?error=save");

  // 무료권 1장 차감
  await admin.from("hospitals").update({ free_credits: (hosp.free_credits ?? 1) - 1 }).eq("id", hospitalId);
  redirect("/jobs");
}

// 소유 공고인지 확인(병원 소유주 == 본인). 아니면 null.
async function ownedJobHospital(admin: ReturnType<typeof createAdminClient>, jobId: string, userId: string) {
  const { data: job } = await admin.from("jobs").select("hospital_id").eq("id", jobId).maybeSingle();
  if (!job) return null;
  const { data: hosp } = await admin.from("hospitals").select("id, owner_profile_id, region, free_credits").eq("id", job.hospital_id).maybeSingle();
  if (!hosp || hosp.owner_profile_id !== userId) return null;
  return hosp;
}

// 공고 수정 — 소유 병원 공고만.
export async function updateJob(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const jobId = String(formData.get("job_id") ?? "");
  if (!jobId) redirect("/mypage/jobs");

  const admin = createAdminClient();
  const hosp = await ownedJobHospital(admin, jobId, user.id);
  if (!hosp) redirect("/mypage/jobs?error=1");

  const s = (k: string) => String(formData.get(k) ?? "").trim();
  const title = s("title");
  if (!title) redirect(`/mypage/jobs/${jobId}/edit?error=missing`);
  const benefits = s("benefits").split(",").map((x) => x.trim()).filter(Boolean);
  const { error } = await admin.from("jobs").update({
    title,
    specialty: s("specialty") || null,
    location: s("location") || hosp.region || null,
    employment_type: s("employment_type") || null,
    salary_text: s("salary_text") || null,
    description: s("description") || null,
    benefits,
  }).eq("id", jobId);
  if (error) redirect(`/mypage/jobs/${jobId}/edit?error=save`);
  redirect("/mypage/jobs?ok=1");
}

// 다시 게시 — 게시일 갱신(무료 7일 재시작) + 공개.
export async function repostJob(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const jobId = String(formData.get("job_id") ?? "");
  if (!jobId) redirect("/mypage/jobs");

  const admin = createAdminClient();
  const hosp = await ownedJobHospital(admin, jobId, user.id);
  if (!hosp) redirect("/mypage/jobs?error=1");
  // 다시 게시도 새 7일 노출 → 무료권 1장 소비
  if ((hosp.free_credits ?? 0) <= 0) redirect("/mypage/jobs?error=nocredit");

  const { error } = await admin.from("jobs").update({ status: "open", posted_at: new Date().toISOString() }).eq("id", jobId);
  if (error) redirect("/mypage/jobs?error=1");
  await admin.from("hospitals").update({ free_credits: (hosp.free_credits ?? 1) - 1 }).eq("id", hosp.id);
  redirect("/mypage/jobs?ok=1");
}

// 간호사 이력서 저장(upsert) — RLS로 본인만.
export async function saveResume(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "nurse") redirect("/mypage");

  const s = (k: string) => { const v = String(formData.get(k) ?? "").trim(); return v || null; };
  const eyRaw = String(formData.get("experience_years") ?? "").trim();
  const ey = eyRaw === "" ? null : Number(eyRaw);
  const specialties = String(formData.get("specialties") ?? "").split(",").map((x) => x.trim()).filter(Boolean);

  const { error } = await supabase.from("resumes").upsert({
    profile_id: user.id,
    name: s("name"),
    phone: s("phone"),
    license_type: s("license_type"),
    license_no: s("license_no"),
    experience_years: ey !== null && Number.isFinite(ey) ? ey : null,
    education: s("education"),
    specialties,
    desired_location: s("desired_location"),
    desired_employment_type: s("desired_employment_type"),
    desired_salary: s("desired_salary"),
    intro: s("intro"),
    is_public: formData.get("is_public") === "on",
  });
  if (error) redirect("/mypage/resume?error=save");
  redirect("/mypage/resume?ok=1");
}

// 병원 — 지원자 상태 변경(열람/합격/불합격). RLS로 공고 소유 병원만.
export async function updateApplicationStatus(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const id = String(formData.get("application_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["viewed", "accepted", "rejected"].includes(status)) redirect("/mypage/applicants");
  const { error } = await supabase.from("applications").update({ status }).eq("id", id);
  if (error) redirect("/mypage/applicants?error=1");
  redirect("/mypage/applicants?ok=1");
}

// 병원 — 공고 마감/재개 (RLS로 소유 공고만).
export async function setJobStatus(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const id = String(formData.get("job_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["open", "closed"].includes(status)) redirect("/mypage/jobs");
  const { error } = await supabase.from("jobs").update({ status }).eq("id", id);
  if (error) redirect("/mypage/jobs?error=1");
  redirect("/mypage/jobs?ok=1");
}

// 병원 — 공고 삭제 (RLS로 소유 공고만).
export async function deleteJob(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const id = String(formData.get("job_id") ?? "");
  if (id) {
    const { error } = await supabase.from("jobs").delete().eq("id", id);
    if (error) redirect("/mypage/jobs?error=1");
  }
  redirect("/mypage/jobs?ok=1");
}

// 저장한 검색 삭제 (RLS로 본인만).
export async function deleteSavedSearch(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (id) {
    const { error } = await supabase.from("saved_searches").delete().eq("id", id);
    if (error) redirect("/mypage/alerts?error=1");
  }
  redirect("/mypage/alerts");
}

// 1:1 메시지 전송. 상대 표시명 비정규화 저장.
export async function sendMessage(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const recipientId = String(formData.get("recipient_id") ?? "");
  const recipientName = String(formData.get("recipient_name") ?? "").trim() || null;
  const body = String(formData.get("body") ?? "").trim();
  if (!recipientId || !body) redirect("/mypage/messages");
  const { data: me } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const { error } = await supabase.from("messages").insert({
    sender_id: user.id, recipient_id: recipientId, sender_name: me?.display_name ?? null, recipient_name: recipientName, body,
  });
  if (error) redirect("/mypage/messages?with=" + recipientId + "&error=1");
  redirect("/mypage/messages?with=" + recipientId);
}

// ───────── 광고 결제(포트원) ─────────
type AdPrepare = { ok: true; merchant_uid: string; amount: number; name: string } | { ok: false; error: string };

// 결제 전 주문 생성(서버가 금액 산정 — 클라 금액 신뢰 안 함). 클라가 받은 merchant_uid/amount로 IMP.request_pay.
export async function prepareAdOrder(jobId: string, weeks: number): Promise<AdPrepare> {
  if (!iamportReady()) return { ok: false, error: "unavailable" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };
  const product = adProduct(weeks);
  if (!product) return { ok: false, error: "product" };
  const admin = createAdminClient();
  const hosp = await ownedJobHospital(admin, jobId, user.id);
  if (!hosp) return { ok: false, error: "not_owner" };
  const merchant_uid = `ad_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const { error } = await admin.from("ad_orders").insert({
    merchant_uid, job_id: jobId, hospital_id: hosp.id, buyer_id: user.id,
    tier: "standard", days: product.days, supply_amount: product.supply, vat: product.vat, amount: product.amount, status: "PREPARE",
  });
  if (error) return { ok: false, error: "db" };
  return { ok: true, merchant_uid, amount: product.amount, name: `널스넷 광고 ${weeks}주(${product.days}일)` };
}

// 결제 활성화(검증 통과/웹훅 공용, 멱등). 광고 노출 기간 연장.
async function activateAdOrder(admin: ReturnType<typeof createAdminClient>, orderId: string, jobId: string, days: number, tier: string, impUid: string) {
  const { data: cur } = await admin.from("ad_orders").select("status").eq("id", orderId).maybeSingle();
  if (cur?.status === "PAID") return;
  await admin.from("ad_orders").update({ status: "PAID", imp_uid: impUid, paid_at: new Date().toISOString() }).eq("id", orderId);
  const { data: job } = await admin.from("jobs").select("featured_until").eq("id", jobId).maybeSingle();
  const now = Date.now();
  const base = job?.featured_until ? Math.max(now, new Date(job.featured_until).getTime()) : now;
  const until = new Date(base + days * 86_400_000).toISOString();
  await admin.from("jobs").update({ featured_until: until, ad_tier: tier, status: "open", posted_at: new Date().toISOString() }).eq("id", jobId);
}

type AdVerify = { ok: true; orderId: string } | { ok: false; error: string };

// 결제 후 서버 검증(금액 위변조 차단) → 활성화.
export async function verifyAdPayment(impUid: string, merchantUid: string): Promise<AdVerify> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };
  const admin = createAdminClient();
  const { data: order } = await admin.from("ad_orders").select("id, buyer_id, job_id, days, tier, amount, status").eq("merchant_uid", merchantUid).maybeSingle();
  if (!order || order.buyer_id !== user.id || !order.job_id) return { ok: false, error: "order" };
  if (order.status === "PAID") return { ok: true, orderId: order.id };
  const pay = await getPayment(impUid);
  if (!pay || pay.merchant_uid !== merchantUid) return { ok: false, error: "verify" };
  if (pay.status !== "paid") { await admin.from("ad_orders").update({ status: "FAILED" }).eq("id", order.id); return { ok: false, error: "notpaid" }; }
  if (pay.amount !== order.amount) return { ok: false, error: "amount" };
  await activateAdOrder(admin, order.id, order.job_id, order.days, order.tier, impUid);
  return { ok: true, orderId: order.id };
}

// 포트원 웹훅(서버-투-서버) — 클라 콜백 실패 대비. imp_uid로 재검증 후 활성화.
export async function iamportWebhook(impUid: string, merchantUid: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: order } = await admin.from("ad_orders").select("id, job_id, days, tier, amount, status").eq("merchant_uid", merchantUid).maybeSingle();
  if (!order || order.status === "PAID") return order?.status === "PAID";
  if (!order.job_id) return false;
  const pay = await getPayment(impUid);
  if (!pay || pay.merchant_uid !== merchantUid || pay.status !== "paid" || pay.amount !== order.amount) return false;
  await activateAdOrder(admin, order.id, order.job_id, order.days, order.tier, impUid);
  return true;
}
