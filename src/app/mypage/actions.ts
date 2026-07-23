"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyBusiness } from "@/lib/data/nts";
import { adProduct } from "@/lib/ads";
import { getPayment, iamportReady } from "@/lib/iamport";
import { viewAsRole } from "@/lib/data/user";
import { safeNext } from "@/lib/url";
import { CANCELABLE, isHospitalStatus } from "@/lib/data/applications";
import { DAY_MS, FREE_LISTING_MS } from "@/lib/date";
import { isSettableJobStatus } from "@/lib/jobState";

// 관리자 보기 전환(병원/간호사로 테스트). admin 계정만 유효 — 그 외에는 쿠키를 넣어도 무시된다.
export async function setViewAs(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "admin") redirect("/mypage");

  const role = String(formData.get("role") ?? "");
  const jar = await cookies();
  if (role === "hospital" || role === "nurse") {
    // secure는 배포에서만 — 로컬 http에서는 secure 쿠키가 조용히 버려져 전환이 안 된다.
    jar.set("view_as", role, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 43_200, path: "/" }); // 12시간 후 자동 해제
  } else jar.delete("view_as");
  redirect("/mypage");
}

// 병원 사업자 진위확인 → 통과 시에만 business_verified(서버=service_role) 설정.
export async function verifyHospitalBusiness(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("role, business_verified").eq("id", user.id).maybeSingle();
  if (!prof || (await viewAsRole(prof.role)) !== "hospital") redirect("/mypage");
  // 사업자 변경(재인증) 허용 — 이미 인증됐어도 새 사업자번호로 다시 검증/갱신 가능.

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

  // 공고 등록 도중 인증하러 왔으면(from=jobs-new) 바로 공고 등록으로 복귀.
  redirect(String(formData.get("from") ?? "") === "jobs-new" ? "/mypage/jobs/new" : "/mypage/verify?ok=1");
}

const ADMIN_TEST_HOSPITAL = "[테스트] 관리자 전용 병원";

// 관리자 전용 테스트 병원 id(없으면 생성). 실제 병원을 claim해 실회원이 못 가져가는 사태 방지.
// maybeSingle 대신 limit(1): 동시 요청으로 행이 2개 생겨도 에러 없이 항상 같은 1건을 재사용한다
// (maybeSingle이면 다중행 에러 → null → 호출마다 새로 생성되며 무한 증식).
async function adminTestHospitalId(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<string | null> {
  const { data: found } = await admin.from("hospitals").select("id")
    .eq("owner_profile_id", userId).eq("name", ADMIN_TEST_HOSPITAL)
    .order("created_at", { ascending: true }).limit(1);
  if (found?.length) return found[0].id;
  const { data: made } = await admin.from("hospitals")
    .insert({ name: ADMIN_TEST_HOSPITAL, region: "서울", address: "테스트 주소(실제 병원 아님)", source: "direct", is_claimed: true, is_test: true, owner_profile_id: userId })
    .select("id").single();
  return made?.id ?? null;
}

// 공고 등록 — 인증된 병원만. 미claim 병원이면 claim 후 jobs 저장(서버 검증).
export async function createJob(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("role, business_verified").eq("id", user.id).maybeSingle();
  if (!prof || (await viewAsRole(prof.role)) !== "hospital") redirect("/mypage");
  // 관리자 테스트 계정은 사업자 인증 없이 등록 가능(실제 병원 회원은 인증 필수).
  if (!prof.business_verified && prof.role !== "admin") redirect("/mypage/verify");

  const s = (k: string) => String(formData.get(k) ?? "").trim();
  const title = s("title");
  const isAdminTest = prof.role === "admin";
  if (!title) redirect("/mypage/jobs/new?error=missing");
  // 관리자 테스트는 실제 병원(공공데이터 18만건)을 점유하면 안 되므로 전용 테스트 병원만 사용.
  const hospitalId = isAdminTest ? await adminTestHospitalId(admin, user.id) : s("hospital_id");
  if (!hospitalId) redirect(`/mypage/jobs/new?error=${isAdminTest ? "hospital" : "missing"}`);

  const { data: hosp } = await admin.from("hospitals").select("id, owner_profile_id, region, address, free_credits").eq("id", hospitalId).maybeSingle();
  if (!hosp) redirect("/mypage/jobs/new?error=hospital");
  if (hosp.owner_profile_id && hosp.owner_profile_id !== user.id) redirect("/mypage/jobs/new?error=claimed");
  if (!hosp.owner_profile_id) {
    await admin.from("hospitals").update({ owner_profile_id: user.id, is_claimed: true }).eq("id", hospitalId);
    await admin.from("profiles").update({ claimed_hospital_id: hospitalId }).eq("id", user.id);
  }

  // 게시 기간 선택: free=무료 7일(동시 1건), 2/3/4=유료(draft로 생성 후 결제 시 게시 → 동시1건 미적용).
  const duration = s("duration");
  const paidWeeks = ["2", "3", "4"].includes(duration) ? Number(duration) : 0;

  if (!paidWeeks) {
    // 무료 동시 1건: 활성(게시 7일 이내·비광고) 무료 공고가 이미 있으면 추가 무료 불가.
    const fresh = new Date(Date.now() - FREE_LISTING_MS).toISOString();
    const nowIso = new Date().toISOString();
    const { count: freeActive } = await admin
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("hospital_id", hospitalId)
      .eq("status", "open")
      .gte("posted_at", fresh)
      .or(`featured_until.is.null,featured_until.lt.${nowIso}`);
    if ((freeActive ?? 0) >= 1) redirect("/mypage/jobs?error=freelimit");
  }

  const num = (k: string) => { const n = parseInt(s(k), 10); return Number.isFinite(n) && n > 0 ? n : null; };
  const benefits = s("benefits").split(",").map((x) => x.trim()).filter(Boolean);
  const am = formData.getAll("apply_methods").map(String).filter((m) => ["platform", "email", "offline"].includes(m));
  const methods = am.length ? am : ["platform"];
  const { data: created, error } = await admin.from("jobs").insert({
    hospital_id: hospitalId,
    title,
    specialty: s("specialty") || null,
    location: s("location") || hosp.address || hosp.region || null,
    employment_type: s("employment_type") || null,
    salary_text: s("salary_text") || null,
    description: s("description") || null,
    benefits,
    recruit_count: num("recruit_count"),
    shift_type: s("shift_type") || null,
    manager_name: s("manager_name") || null,
    manager_phone: s("manager_phone") || null,
    apply_methods: methods,
    apply_email: s("apply_email") || null,
    apply_detail: s("apply_detail") || null,
    source: "direct",
    status: paidWeeks ? "draft" : "open",
  }).select("id").single();
  if (error || !created) redirect("/mypage/jobs/new?error=save");
  // 유료면 결제 페이지로(기간 선택값 전달), 무료면 공고 관리로.
  redirect(paidWeeks ? `/mypage/jobs/${created.id}/ad?weeks=${paidWeeks}` : "/mypage/jobs?ok=1");
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
  const num = (k: string) => { const n = parseInt(s(k), 10); return Number.isFinite(n) && n > 0 ? n : null; };
  const title = s("title");
  if (!title) redirect(`/mypage/jobs/${jobId}/edit?error=missing`);
  const benefits = s("benefits").split(",").map((x) => x.trim()).filter(Boolean);
  const am = formData.getAll("apply_methods").map(String).filter((m) => ["platform", "email", "offline"].includes(m));
  const methods = am.length ? am : ["platform"];
  const { error } = await admin.from("jobs").update({
    title,
    specialty: s("specialty") || null,
    location: s("location") || hosp.region || null,
    employment_type: s("employment_type") || null,
    salary_text: s("salary_text") || null,
    description: s("description") || null,
    benefits,
    recruit_count: num("recruit_count"),
    shift_type: s("shift_type") || null,
    manager_name: s("manager_name") || null,
    manager_phone: s("manager_phone") || null,
    apply_methods: methods,
    apply_email: s("apply_email") || null,
    apply_detail: s("apply_detail") || null,
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

  // 다시 게시 = 새 7일 무료 노출 → 동시 무료 1건 규칙 적용(다른 활성 무료 공고가 있으면 불가).
  const fresh = new Date(Date.now() - FREE_LISTING_MS).toISOString();
  const nowIso = new Date().toISOString();
  const { count: freeActive } = await admin
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("hospital_id", hosp.id)
    .eq("status", "open")
    .gte("posted_at", fresh)
    .or(`featured_until.is.null,featured_until.lt.${nowIso}`)
    .neq("id", jobId);
  if ((freeActive ?? 0) >= 1) redirect("/mypage/jobs?error=freelimit");

  const { error } = await admin.from("jobs").update({ status: "open", posted_at: nowIso }).eq("id", jobId);
  if (error) redirect("/mypage/jobs?error=1");
  redirect("/mypage/jobs?ok=1");
}

// 간호사 이력서 저장(upsert) — RLS로 본인만.
export async function saveResume(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!prof || (await viewAsRole(prof.role)) !== "nurse") redirect("/mypage");

  const s = (k: string) => { const v = String(formData.get(k) ?? "").trim(); return v || null; };
  const eyRaw = String(formData.get("experience_years") ?? "").trim();
  const ey = eyRaw === "" ? null : Number(eyRaw);
  // 체크박스 다중 선택(JOB_SPECIALTIES) — 자유 입력이면 "중환자"/"중환자실"처럼 표기가 갈려 검색이 안 잡힌다.
  const specialties = formData.getAll("specialties").map((x) => String(x).trim()).filter(Boolean);

  const { error } = await supabase.from("resumes").upsert({
    profile_id: user.id,
    name: s("name"),
    phone: s("phone"),
    license_type: s("license_type"),
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
  // 공고에서 "이력서를 먼저 채우세요"로 넘어온 경우 그 공고로 돌려보낸다(안 그러면 공고를 다시 찾아야 한다).
  redirect(safeNext(String(formData.get("next") ?? ""), "/mypage/resume?ok=1"));
}

// 지원자 화면으로 돌아가는 주소 — 보고 있던 공고 탭을 유지한다.
// 이게 없으면 한 건 처리할 때마다 '전체'로 튕겨 그 공고를 다시 찾아 들어가야 한다.
function applicantsHref(formData: FormData, extra?: Record<string, string>): string {
  const p = new URLSearchParams(extra);
  const jobId = String(formData.get("job_id") ?? "");
  if (jobId) p.set("job_id", jobId);
  const s = p.toString();
  return "/mypage/applicants" + (s ? `?${s}` : "");
}

// 병원 — 지원자 상태 변경(열람/합격/불합격). RLS로 공고 소유 병원만.
export async function updateApplicationStatus(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const id = String(formData.get("application_id") ?? "");
  const status = String(formData.get("status") ?? "");
  // isHospitalStatus로 좁혀야 오타·위조된 상태가 그대로 update로 들어가지 않는다.
  if (!id || !isHospitalStatus(status)) redirect(applicantsHref(formData));
  // 반환 행으로 실제 반영을 확인한다 — RLS에 막혀 0행이어도 error는 null이라 "처리되었습니다"가 뜬다.
  // 취소된 지원은 병원이 되살릴 수 없다(간호사가 거둬간 지원서다).
  const { data, error } = await supabase.from("applications").update({ status }).eq("id", id).neq("status", "withdrawn").select("id");
  redirect(applicantsHref(formData, error || !data?.length ? { error: "1" } : { ok: "1" }));
}

// 병원 — 지원자 이력서 전문 열기. 여는 행위 자체를 '열람' 신호로 쓴다.
// 목록을 여는 것만으로 처리하면 보지도 않은 지원자가 열람으로 찍히고,
// 버튼만 따로 두면 아무도 누르지 않아 간호사 화면이 영원히 '지원완료'에 멈춘다.
export async function openApplicantResume(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const id = String(formData.get("application_id") ?? "");
  if (!id) redirect(applicantsHref(formData));

  // 소유 공고가 아니면 RLS가 막아 0행이 된다 → 존재하지 않는 것과 같게 처리한다.
  // (update의 반환 행만 보면 '이미 열람한 지원자'도 0행이라 구분이 안 된다.)
  const { data: app } = await supabase.from("applications").select("id, applicant_id").eq("id", id).maybeSingle();
  if (!app) redirect(applicantsHref(formData, { error: "1" }));

  // 볼 이력서가 있을 때만 '열람'으로 기록한다 — 먼저 찍고 나면 이력서가 없어 되돌아온 경우에도
  // 지원자 화면에는 '열람됨'이 남아 병원이 봤다고 잘못 알리게 된다.
  const { data: resume } = await supabase.from("resumes").select("profile_id").eq("profile_id", app.applicant_id).maybeSingle();
  if (!resume) redirect(applicantsHref(formData, { error: "noresume" }));

  // 0행은 정상이다(이미 열람한 지원자). 확인할 것은 '기록 자체가 실패했는가'뿐 —
  // 여기서 실패를 삼키면 병원은 계속 열어보는데 지원자 화면은 영원히 '지원완료'에 멈춘다.
  const { error } = await supabase.from("applications").update({ status: "viewed" }).eq("id", id).eq("status", "submitted");
  if (error) redirect(applicantsHref(formData, { error: "1" }));
  const jobId = String(formData.get("job_id") ?? "");
  redirect(`/mypage/applicants/${encodeURIComponent(id)}/print${jobId ? `?job_id=${encodeURIComponent(jobId)}` : ""}`);
}

// 간호사 — 지원 취소(변심). 정책상 본인 지원을 'withdrawn'으로만 바꿀 수 있다.
// 행을 지우지 않는 이유: 병원 화면에서 지원자가 흔적 없이 사라지면 면접까지 본 기록이 없어진다.
export async function withdrawApplication(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const id = String(formData.get("application_id") ?? "");
  if (!id) redirect("/mypage/applications");
  // 진행 중인 지원만 취소 가능 — 화면의 버튼 조건(CANCELABLE)과 **같은 상수**를 서버에도 건다.
  // 이게 없으면 hidden input의 id만 바꿔 병원이 내린 합격·불합격을 지우고 다시 지원할 수 있다.
  const { data, error } = await supabase
    .from("applications").update({ status: "withdrawn" })
    .eq("id", id).eq("applicant_id", user.id).in("status", [...CANCELABLE]).select("id");
  if (error || !data?.length) redirect("/mypage/applications?error=1");
  redirect("/mypage/applications?ok=cancel");
}

// 병원 — 공고 마감/재개 (RLS로 소유 공고만).
export async function setJobStatus(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const id = String(formData.get("job_id") ?? "");
  const status = String(formData.get("status") ?? "");
  // 화면에서 바꿀 수 있는 것은 게시/마감 둘뿐 — 타입가드로 좁혀서 임의 문자열이 DB로 넘어가지 않게 한다.
  if (!id || !isSettableJobStatus(status)) redirect("/mypage/jobs");
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
// impUid=null은 실결제가 아닌 경우(관리자 테스트) — 포트원 거래번호 컬럼을 가짜 값으로 오염시키지 않는다.
// 성공 여부를 반환 — 호출부가 실패를 사용자/포트원에 알려 재시도되게 한다.
async function activateAdOrder(admin: ReturnType<typeof createAdminClient>, orderId: string, jobId: string, days: number, tier: string, impUid: string | null): Promise<boolean> {
  // 선점(CAS): PREPARE→PAID 전환에 성공한 요청만 기간을 연장한다. 조건부 update는 Postgres에서 원자적이라
  // 클라 콜백과 웹훅이 동시에 들어와도 연장은 정확히 1회. (먼저 연장하고 나중에 PAID로 올리면 재시도 때 2배 연장됨)
  const { data: claimed, error: claimErr } = await admin
    .from("ad_orders")
    .update({ status: "PAID", imp_uid: impUid, paid_at: new Date().toISOString() })
    .eq("id", orderId)
    .neq("status", "PAID")
    .select("id");
  if (claimErr) return false;        // DB 오류 — 0행과 구분해야 한다(성공으로 착각하면 재시도가 끊긴다)
  if (!claimed?.length) return true; // 이미 다른 경로가 활성화 완료

  const { data: job } = await admin.from("jobs").select("featured_until").eq("id", jobId).maybeSingle();
  const now = Date.now();
  const base = job?.featured_until ? Math.max(now, new Date(job.featured_until).getTime()) : now;
  const until = new Date(base + days * DAY_MS).toISOString();
  const { data: updated, error: jobErr } = await admin
    .from("jobs")
    .update({ featured_until: until, ad_tier: tier, status: "open", posted_at: new Date().toISOString() })
    .eq("id", jobId)
    .select("id"); // 0행이면 error가 null이므로 반환행으로 실제 반영을 확인
  if (jobErr || !updated?.length) {
    // 되돌려 재시도 가능하게. imp_uid도 같이 비운다 — 안 그러면 "PREPARE인데 거래번호가 있는" 상태가 남는다.
    await admin.from("ad_orders").update({ status: "PREPARE", paid_at: null, imp_uid: null }).eq("id", orderId);
    return false;
  }
  return true;
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
  if (!pay || pay === "notfound" || pay.merchant_uid !== merchantUid) return { ok: false, error: "verify" };
  if (pay.status !== "paid") { await admin.from("ad_orders").update({ status: "FAILED" }).eq("id", order.id); return { ok: false, error: "notpaid" }; }
  if (pay.amount !== order.amount) return { ok: false, error: "amount" };
  // 활성화 실패 시 주문은 PREPARE로 남는다 → 웹훅이 재시도해 복구.
  if (!(await activateAdOrder(admin, order.id, order.job_id, order.days, order.tier, impUid))) return { ok: false, error: "activate" };
  return { ok: true, orderId: order.id };
}

// 관리자 테스트 전용 — 결제 없이 광고 활성. 주문을 PAID로 남겨 영수증까지 실제 흐름 그대로 확인.
// 금액은 0원으로 기록한다 — 실금액으로 남기면 나중에 매출 집계에 가짜 매출이 섞인다.
export async function activateAdFree(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "admin") redirect("/mypage"); // 전환 여부와 무관하게 실제 admin만

  const jobId = String(formData.get("job_id") ?? "");
  const product = adProduct(Number(formData.get("weeks")));
  if (!jobId || !product) redirect("/mypage/jobs");
  const hosp = await ownedJobHospital(admin, jobId, user.id);
  if (!hosp) redirect("/mypage/jobs?error=1");

  const merchant_uid = `admintest_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const { data: order } = await admin.from("ad_orders").insert({
    merchant_uid, job_id: jobId, hospital_id: hosp.id, buyer_id: user.id,
    tier: "admin_test", days: product.days, supply_amount: 0, vat: 0, amount: 0, status: "PREPARE",
  }).select("id").single();
  // 실패는 공고 관리 화면으로 — 광고 페이지에는 에러 배너가 없어 실패가 조용히 묻힌다.
  if (!order) redirect("/mypage/jobs?error=1");
  if (!(await activateAdOrder(admin, order.id, jobId, product.days, "admin_test", null))) redirect("/mypage/jobs?error=1");
  redirect(`/mypage/jobs/ad/receipt/${order.id}`);
}

// 포트원 웹훅(서버-투-서버) — 클라 콜백 실패 대비. imp_uid로 재검증 후 활성화.
// 반환값이 재시도 여부를 가른다: "retry"만 5xx로 응답해 포트원이 다시 보내게 하고,
// 다시 보내도 결과가 같은 경우("ok"/"ignored")는 200으로 끊는다 — 안 그러면 영원히 재시도한다.
export async function iamportWebhook(impUid: string, merchantUid: string): Promise<"ok" | "ignored" | "retry"> {
  const admin = createAdminClient();
  const { data: order } = await admin.from("ad_orders").select("id, job_id, days, tier, amount, status").eq("merchant_uid", merchantUid).maybeSingle();
  if (!order || !order.job_id) return "ignored"; // 우리 주문이 아님 / 공고 없음
  if (order.status === "PAID") return "ok";
  const pay = await getPayment(impUid);
  if (!pay) return "retry"; // 포트원 조회 자체가 실패 — 일시 장애일 수 있으니 재시도
  // 없는 거래(위조 웹훅 포함)·미결제·금액 불일치는 재시도해도 그대로다
  if (pay === "notfound" || pay.merchant_uid !== merchantUid || pay.status !== "paid" || pay.amount !== order.amount) return "ignored";
  return (await activateAdOrder(admin, order.id, order.job_id, order.days, order.tier, impUid)) ? "ok" : "retry";
}
