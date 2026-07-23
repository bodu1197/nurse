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
import { MIN_PASSWORD } from "@/lib/constants";
import { isSettableJobStatus } from "@/lib/jobState";
import { totalYears } from "@/lib/data/resume";
import { CAREER_EXPERIENCED } from "@/lib/resumeOptions";

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
  if (!job?.hospital_id) return null; // 워크넷 광고 등 명부 미연결 공고는 소유 대상이 아니다.
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

  // 길이 상한 — 조작된 POST로 무제한 길이를 밀어 넣지 못하게.
  const s = (k: string, max = 300) => { const v = String(formData.get(k) ?? "").trim().slice(0, max); return v || null; };
  const num = (k: string) => { const v = Number(String(formData.get(k) ?? "").trim()); return Number.isFinite(v) && v > 0 ? v : null; };
  // 예/아니오/해당없음 3지선다(라디오). 체크박스 하나로 받으면 "아니오"와 "아직 답 안 함"이 같아져,
  // 안 물어본 항목까지 인쇄 서식에 '아니오'로 단정 출력된다.
  const bool = (k: string) => { const v = formData.get(k); return v === "yes" ? true : v === "no" ? false : null; };
  // 체크박스 다중 선택 — 자유 입력이면 "중환자"/"중환자실"처럼 표기가 갈려 검색이 안 잡힌다.
  const many = (k: string) => formData.getAll(k).map((x) => String(x).trim()).filter(Boolean);

  // 경력 상세 — 화면에서 줄 단위로 보내온다. 20줄이면 어떤 이력서든 충분하다.
  const work = formData.getAll("w_hospital_name").slice(0, 20).map((v, i) => ({
    hospital_name: String(v).trim().slice(0, 100),
    hospital_type: s(`w_hospital_type_${i}`, 40),
    bed_range: s(`w_bed_range_${i}`, 40),
    department: s(`w_department_${i}`, 80),
    start_ym: s(`w_start_ym_${i}`, 7),
    end_ym: s(`w_end_ym_${i}`, 7),
    is_current: formData.get(`w_is_current_${i}`) === "on",
    shift_type: s(`w_shift_type_${i}`, 40),
    position: s(`w_position_${i}`, 40),
    duties: s(`w_duties_${i}`, 1000),
    sort_order: i,
  })).filter((w) => w.hospital_name || w.start_ym);

  // 필수 검증 — 화면에 별표(*)를 붙여놓고 서버가 안 막으면 빈 채로 저장되고 "저장했습니다"가 뜬다.
  const shiftTypes = many("shift_types");
  const regions = many("desired_location");
  const careerLevel = s("career_level");
  if (shiftTypes.length === 0) redirect("/mypage/resume?error=shift");
  if (regions.length === 0) redirect("/mypage/resume?error=region");
  // 병원명만 적고 입사연월을 비우면 그 줄이 조용히 버려져 경력이 사라진다 → 되돌려 알린다.
  if (work.some((w) => !w.hospital_name || !w.start_ym)) redirect("/mypage/resume?error=work");
  if (careerLevel === CAREER_EXPERIENCED && work.length === 0) redirect("/mypage/resume?error=work_required");

  const { error } = await supabase.from("resumes").upsert({
    profile_id: user.id,
    resume_title: s("resume_title"),
    name: s("name"),
    phone: s("phone"),
    email: s("email"),
    residence_region: s("residence_region"),
    license_type: s("license_type"),
    license_year: num("license_year"),
    license_reported: bool("license_reported"),
    certifications: many("certifications"),
    apn_field: s("apn_field"),
    education_level: s("education_level"),
    education: s("education"),
    graduation_status: s("graduation_status"),
    career_level: careerLevel,
    // 총 경력은 경력 상세에서 계산한다 — 두 곳에 적게 하면 반드시 어긋난다.
    // 경력 줄이 없으면 null로 둔다(0년으로 덮으면 병원 카드에 "경력 0년"이 뜬다).
    experience_years: work.length > 0
      ? totalYears(work.map((w) => ({ start_ym: w.start_ym ?? "", end_ym: w.end_ym, is_current: w.is_current })), new Date())
      : null,
    has_integrated_care: bool("has_integrated_care"),
    can_charge: bool("can_charge"),
    shift_types: shiftTypes,
    night_available: bool("night_available"),
    desired_location: regions.join(", ") || null,
    specialties: many("specialties"),
    desired_hospital_types: many("desired_hospital_types"),
    desired_employment_type: s("desired_employment_type"),
    desired_salary: s("desired_salary"),
    available_from: s("available_from"),
    needs_dormitory: bool("needs_dormitory"),
    intro: s("intro"),
    is_public: formData.get("is_public") === "on",
  });
  if (error) {
    console.error("saveResume failed:", error.message);
    redirect("/mypage/resume?error=save");
  }

  // 경력은 통째로 바꿔 쓴다(줄 삭제·순서 변경을 따로 추적하지 않기 위해).
  // 삭제가 실패했는데 그냥 넣으면 같은 경력이 두 벌로 쌓인다 → 반드시 결과를 본다.
  const { error: del } = await supabase.from("work_experiences").delete().eq("resume_id", user.id);
  if (del) {
    console.error("saveResume(work delete) failed:", del.message);
    redirect("/mypage/resume?error=save");
  }
  if (work.length > 0) {
    const { error: we } = await supabase.from("work_experiences").insert(
      work.map((w) => ({ ...w, start_ym: w.start_ym ?? "", resume_id: user.id })),
    );
    if (we) {
      // ponytail: 트랜잭션이 아니라 이 지점에서 실패하면 경력만 비어 있다.
      // 한 트랜잭션으로 묶으려면 RPC가 필요한데, 지금은 사용자가 다시 저장하면 복구되므로 안내로 갈음한다.
      console.error("saveResume(work) failed:", we.message);
      redirect("/mypage/resume?error=work_lost");
    }
  }

  // 공고에서 "이력서를 먼저 채우세요"로 넘어온 경우 그 공고로 돌려보낸다(안 그러면 공고를 다시 찾아야 한다).
  redirect(safeNext(String(formData.get("next") ?? ""), "/mypage/resume?ok=1"));
}

// 표시이름 변경 — 화면과 헤더에 보이는 이름. 이력서의 실명과는 별개다.
export async function updateDisplayName(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!displayName) redirect("/mypage/account?error=name");
  const { error } = await supabase.from("profiles").update({ display_name: displayName }).eq("id", user.id);
  if (error) {
    console.error("updateDisplayName failed:", error.message);
    redirect("/mypage/account?error=save");
  }
  redirect("/mypage/account?ok=name");
}

// 로그인한 상태에서 비밀번호 바꾸기. 재설정 메일과 달리 여기서는 현재 비밀번호를 확인한다 —
// 남의 브라우저가 열려 있을 때 기존 비번을 모르고도 바꿔 계정을 빼앗는 것을 막는다.
export async function changePassword(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const current = String(formData.get("current_password") ?? "");
  const next = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("new_password_confirm") ?? "");
  if (next.length < MIN_PASSWORD) redirect("/mypage/account?error=weak");
  if (next !== confirm) redirect("/mypage/account?error=mismatch");

  const { error: wrong } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
  if (wrong) redirect("/mypage/account?error=wrong_password");

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) {
    console.error("changePassword failed:", error.message);
    redirect("/mypage/account?error=save");
  }
  // 다른 기기·탈취된 세션을 끊는다 — 비번을 바꿔도 기존 세션이 살아 있으면 바꾼 의미가 없다.
  await supabase.auth.signOut({ scope: "others" });
  redirect("/mypage/account?ok=password");
}

// 회원 탈퇴 — 개인정보처리방침이 "탈퇴 시 지체 없이 파기"라고 고지하는데 기능이 없었다.
// 확인 문구를 직접 입력받는다: 유예 없이 즉시 삭제라 실수로 누르면 되돌릴 수 없다.
export async function deleteAccount(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");
  if (String(formData.get("confirm") ?? "").trim() !== "탈퇴") redirect("/mypage/account?error=confirm");
  // 열린 브라우저 앞에서 문구만 입력해 계정을 파괴하는 것을 막는다 — 현재 비밀번호를 함께 확인한다.
  // (소셜 로그인 계정은 비밀번호가 없으므로 이 확인을 건너뛴다.)
  const password = String(formData.get("password") ?? "");
  if (password) {
    const { error: wrong } = await supabase.auth.signInWithPassword({ email: user.email, password });
    if (wrong) redirect("/mypage/account?error=wrong_password");
  }

  const admin = createAdminClient();
  // 병원 회원이면 소유 공고를 먼저 마감한다 — 계정만 지우면 연락 안 되는 공고가 목록에 남는다.
  // owner_profile_id 가 set null 이라 나중엔 아무도 못 닫으므로, 조회 실패면 삭제를 멈춘다.
  const { data: hospitals, error: hErr } = await admin.from("hospitals").select("id").eq("owner_profile_id", user.id);
  if (hErr) {
    console.error("deleteAccount(hospitals) failed:", hErr.message);
    redirect("/mypage/account?error=save");
  }
  const hospitalIds = (hospitals ?? []).map((h) => h.id);
  if (hospitalIds.length > 0) {
    // 공고 마감이 실패했는데 계정을 지우면 owner가 null이 되어 아무도 못 닫는 공고가 남는다 → 실패면 멈춘다.
    const { error: jErr } = await admin.from("jobs").update({ status: "closed" }).in("hospital_id", hospitalIds);
    if (jErr) {
      console.error("deleteAccount(close jobs) failed:", jErr.message);
      redirect("/mypage/account?error=save");
    }
  }

  // profiles·resumes·applications 는 auth 사용자에 cascade 로 묶여 함께 지워진다.
  // ad_orders.buyer_id 는 set null 이라 결제 기록은 남는다(전자상거래법 5년 보존).
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("deleteAccount failed:", error.message);
    redirect("/mypage/account?error=save");
  }
  await supabase.auth.signOut();
  redirect("/?left=1");
}

// 간호사 이력서 삭제 — 개인정보처리방침이 "삭제 요청 가능"이라 고지하는데 방법이 없었다.
export async function deleteResume() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // 경력은 on delete cascade 로 함께 지워진다.
  const { error } = await supabase.from("resumes").delete().eq("profile_id", user.id);
  if (error) {
    console.error("deleteResume failed:", error.message);
    redirect("/mypage/resume?error=delete");
  }
  redirect("/mypage/resume?ok=deleted");
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
  // 결제 전(draft) 공고는 이 버튼의 대상이 아니다. 막아두지 않으면 draft → closed 로 넘어가,
  // "closed = 한 번은 공개됐던 공고"라는 전제(저장 목록의 마감 공고 복원)가 깨진다.
  const { error } = await supabase.from("jobs").update({ status }).eq("id", id).in("status", ["open", "closed"]);
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
