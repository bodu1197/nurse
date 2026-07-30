"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyBusiness } from "@/lib/data/nts";
import { adProduct } from "@/lib/ads";
import { getPayment, iamportReady } from "@/lib/iamport";
import { viewAsRole } from "@/lib/data/user";
import { safeNext } from "@/lib/url";
import { AVATAR_BUCKET } from "@/lib/data/avatar";
import { AVATAR_MAX_BYTES, AVATAR_MIME } from "@/lib/avatarLimits";
import { CANCELABLE, isHospitalStatus, STATUS_LABEL, type AppStatus } from "@/lib/data/applications";
import { DAY_MS, FREE_LISTING_MS, todayKst, nowMs } from "@/lib/date";
import { MIN_PASSWORD } from "@/lib/constants";
import { isSettableJobStatus } from "@/lib/jobState";
import { regionOfLocation } from "@/lib/jobRegion";
import { totalYears } from "@/lib/data/resume";
import { CAREER_EXPERIENCED, DEPARTMENTS, JOB_CATEGORIES } from "@/lib/resumeOptions";
import { JOB_DEPARTMENTS, FACILITY_TYPES } from "@/lib/jobTaxonomy";
import { SIDO_LIST, SIDO_SIGUNGU, LEGACY_REGIONS } from "@/lib/koreaRegions";

/** 병원이 이미 판정을 내린 상태 — 이걸 되돌릴 때만 메모에 흔적을 남긴다. */
const isDecided = (s: string): boolean => s === "accepted" || s === "rejected";

// 이력서에서 고를 수 있는 희망 근무지 전체("부산", "부산 수영구" 두 형태) + 구 널스넷 잔재 6종.
// 모듈 로드 때 한 번만 만든다.
const KNOWN_REGIONS: ReadonlySet<string> = new Set([
  ...SIDO_LIST.flatMap((sd) => [sd, ...SIDO_SIGUNGU[sd].map((s) => `${sd} ${s}`)]),
  ...LEGACY_REGIONS,
]);

// 관리자 보기 전환(병원/간호사로 테스트). admin 계정만 유효 — 그 외에는 쿠키를 넣어도 무시된다.
/**
 * 🔴 검색 축 3개는 **아는 값만** 받는다.
 *
 * 화면에서는 select 로만 고르지만, 조작된 POST 로 임의 문자열을 넣으면 그 값이 jobs 에 저장되고
 * 칩 목록 RPC(nurse_job_facet_list)를 통해 **모든 방문자의 검색 화면**에 필터 항목으로 걸릴 수 있다.
 * RPC 쪽 화이트리스트가 마지막 방어선이지만 그 목록은 SQL 에 손으로 복제돼 있어, 한쪽만 늘리면
 * 그대로 뚫린다. 입력에서 먼저 잘라낸다(이력서의 onlyKnown 과 같은 사고방식).
 *
 * ⚠️ 모르는 값은 조용히 null 이 된다. 목록을 줄일 때는 기존 공고가 잘리지 않는지 먼저 확인할 것.
 */
function jobAxes(s: (k: string) => string) {
  const pick = (key: string, allowed: readonly string[]) => {
    const v = s(key);
    return v && allowed.includes(v) ? v : null;
  };
  return {
    specialty: pick("specialty", JOB_DEPARTMENTS),
    facility_type: pick("facility_type", FACILITY_TYPES),
    job_category: pick("job_category", JOB_CATEGORIES),
  };
}

/**
 * 공고 마감일 — 비우면 상시모집(null).
 * date 컬럼이라 "YYYY-MM-DD" 만 받는다. 형식이 다르면 조용히 null 로 둔다(조작된 POST 로
 * 이상한 값이 들어가면 목록의 `deadline.gte.오늘` 비교가 통째로 어긋난다).
 */
const jobDeadline = (s: (k: string) => string): string | null | "past" => {
  const v = s("deadline");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  // 🔴 지난 날짜를 그대로 받으면 저장은 성공하는데 목록·상세가 전부 걸러내서
  //    **한 번도 노출되지 않는 공고**가 만들어진다(유료를 골랐다면 결제까지 하고 노출 0).
  //    연도 오타("2025-")로 쉽게 일어난다 → 되돌려 알린다.
  return v < todayKst(nowMs()) ? "past" : v;
};

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
    // 🔴 쓰던 화면으로 되돌린다. 전에는 공고 관리 화면으로 보내서, 다 채운 상세내용·복리후생·
    //    담당자 정보를 처음부터 다시 써야 했다. 같은 화면으로 돌아와야 임시저장(FormDraft)도 복원된다.
    if ((freeActive ?? 0) >= 1) redirect("/mypage/jobs/new?error=freelimit");
  }

  const num = (k: string) => { const n = parseInt(s(k), 10); return Number.isFinite(n) && n > 0 ? n : null; };
  const deadline = jobDeadline(s);
  if (deadline === "past") redirect("/mypage/jobs/new?error=deadline");
  const benefits = s("benefits").split(",").map((x) => x.trim()).filter(Boolean);
  const am = formData.getAll("apply_methods").map(String).filter((m) => ["platform", "email", "offline"].includes(m));
  const methods = am.length ? am : ["platform"];
  const location = s("location") || hosp.address || hosp.region || null;
  const region = regionOfLocation(location); // 지역 드롭다운·필터용 정규화(ingest 시점 확정)
  const { data: created, error } = await admin.from("jobs").insert({
    hospital_id: hospitalId,
    title,
    ...jobAxes(s),
    location,
    sido: region.sido,
    sigungu: region.sigungu,
    employment_type: s("employment_type") || null,
    salary_text: s("salary_text") || null,
    description: s("description") || null,
    benefits,
    recruit_count: num("recruit_count"),
    shift_type: s("shift_type") || null,
    deadline,
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
  const deadline = jobDeadline(s);
  if (deadline === "past") redirect(`/mypage/jobs/${jobId}/edit?error=deadline`);
  const benefits = s("benefits").split(",").map((x) => x.trim()).filter(Boolean);
  const am = formData.getAll("apply_methods").map(String).filter((m) => ["platform", "email", "offline"].includes(m));
  const methods = am.length ? am : ["platform"];
  const location = s("location") || hosp.region || null;
  const region = regionOfLocation(location);
  const { error } = await admin.from("jobs").update({
    title,
    ...jobAxes(s),
    location,
    sido: region.sido,
    sigungu: region.sigungu,
    employment_type: s("employment_type") || null,
    salary_text: s("salary_text") || null,
    description: s("description") || null,
    benefits,
    recruit_count: num("recruit_count"),
    shift_type: s("shift_type") || null,
    deadline,
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

  const nowIso = new Date().toISOString();

  // 🔴 결제 대기(draft) 공고는 이 버튼의 대상이 아니다.
  //    형제 액션 setJobStatus 는 draft 를 막아두는데 여기만 빠져 있어서, 유료 2~4주를 골라
  //    draft 로 만들어진 공고를 **결제 없이 open 으로 올릴 수 있었다**(조작된 POST 한 번).
  //    화면에는 pending 분기에 이 버튼이 없지만, 서버 액션은 화면을 신뢰하지 않는다.
  const { data: job } = await admin.from("jobs").select("status, featured_until").eq("id", jobId).maybeSingle();
  if (!job || !isSettableJobStatus(job.status)) redirect("/mypage/jobs?error=1");

  // 광고가 아직 살아 있는 공고는 **유료 자리**다 — 무료 동시 1건 규칙의 대상이 아니다.
  // 이 구분이 없으면 돈을 낸 공고를 다시 게시하려다 무료 제한에 막힌다.
  const paidLive = !!job.featured_until && job.featured_until > nowIso;
  if (!paidLive) {
    // 다시 게시 = 새 7일 무료 노출 → 동시 무료 1건 규칙 적용(다른 활성 무료 공고가 있으면 불가).
    const fresh = new Date(Date.now() - FREE_LISTING_MS).toISOString();
    const { count: freeActive } = await admin
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("hospital_id", hosp.id)
      .eq("status", "open")
      .gte("posted_at", fresh)
      .or(`featured_until.is.null,featured_until.lt.${nowIso}`)
      .neq("id", jobId);
    if ((freeActive ?? 0) >= 1) redirect("/mypage/jobs?error=freelimit");
  }

  // 조건을 update 에도 한 번 더 건다(읽고 쓰는 사이에 상태가 바뀌는 경우) + 반환 행으로 반영 확인.
  //
  // 🔴 무료로 다시 게시할 때는 **끝난 광고 표식을 지운다**(featured_until·ad_tier).
  //    목록 정렬이 `order(featured_until desc, nullsFirst:false)` 라, 지난 광고 날짜가 남아 있으면
  //    그 공고가 무료·워크넷 공고(featured_until = null) 전부보다 **영원히 위**에 뜬다.
  //    돈을 낸 기간은 이미 끝났는데 노출 특혜만 남는 셈이라, 다음 광고주에게 불공정하다.
  //    결제 기록은 ad_orders 에 그대로 있고, 나중에 다시 광고를 사면 그때부터 새로 계산된다.
  let q = admin
    .from("jobs")
    .update(paidLive ? { status: "open", posted_at: nowIso } : { status: "open", posted_at: nowIso, featured_until: null, ad_tier: null })
    .eq("id", jobId).in("status", ["open", "closed"]);
  // 광고 표식을 지우는 경우에만, "여전히 만료 상태인 행" 으로 한번 더 좀힌다 —
  // 읽고 쓰는 사이에 결제 웹훅이 들어와 featured_until 을 연장했다면
  // 방금 산 광고를 이 update 가 지우게 된다(돈은 나갔는데 노출은 없어진다).
  if (!paidLive) q = q.or(`featured_until.is.null,featured_until.lt.${nowIso}`);
  const { data: done, error } = await q.select("id");
  if (error || !done?.length) redirect("/mypage/jobs?error=1");
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
  // 상한(300개 × 60자)은 조작된 POST 전용이다. 화면에서 고를 수 있는 최대는 희망 근무지 281개
  // (시도 17 + 시군구 264)이고 가장 긴 값이 "경기 고양시 일산동구"(12자)라, 정상 선택이 잘릴 일은 없다.
  // 중복은 여기서 없앤다 — "부산 전체"와 "부산 수영구"를 같이 고르면 같은 값이 두 번 실려 온다.
  const many = (k: string) =>
    [...new Set(formData.getAll(k).slice(0, 300).map((x) => String(x).trim().slice(0, 60)).filter(Boolean))];

  /**
   * 🔴 목록에 있는 값만 통과시킨다.
   *    이 값들은 **모든 방문자의 인재 검색 칩·지역 팝업에 그대로 뜬다**(공용 화면에 실리는 경로다).
   *    화면에서는 체크박스로만 고르지만, 조작된 POST 로 "무료광고 010-0000-0000" 을 넣으면
   *    그게 남의 화면에 필터 항목으로 걸린다. 표시 단계(RPC)에서도 막지만 입력에서 먼저 잘라낸다.
   *    ⚠️ 모르는 값은 조용히 버려지므로, 목록을 줄일 때는 기존 데이터가 잘리지 않는지 먼저 확인할 것.
   */
  const onlyKnown = (values: readonly string[], allowed: ReadonlySet<string>) =>
    values.filter((v) => allowed.has(v));

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
  const regions = onlyKnown(many("desired_location"), KNOWN_REGIONS);
  const departments = onlyKnown(many("specialties"), new Set(DEPARTMENTS));
  const jobCategories = onlyKnown(many("job_categories"), new Set(JOB_CATEGORIES));
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
    specialties: departments,
    job_categories: jobCategories,
    desired_hospital_types: many("desired_hospital_types"),
    desired_employment_type: s("desired_employment_type"),
    desired_salary: s("desired_salary"),
    available_from: s("available_from"),
    needs_dormitory: bool("needs_dormitory"),
    intro: s("intro"),
    // 🔴 공개 여부는 **이력서가 아직 없을 때만** 이 폼이 정한다(첫 저장의 동의 체크박스).
    //    이미 있는 이력서는 화면 맨 위 스위치(setResumePublic)가 유일한 주인이다.
    //    둘 다 쓰면: 스위치로 비공개로 바꾼 뒤 열어둔 다른 탭이나 뒤로가기로 되돌아온 낡은
    //    폼을 저장하는 순간, 체크된 채로 남아 있던 체크박스가 **조용히 다시 공개로 돌려놓는다**.
    //    개인정보 공개가 사용자 의사와 무관하게 켜지는 경로는 없어야 한다.
    ...(formData.get("visibility_field") === "1"
      ? { is_public: formData.get("is_public") === "on" }
      : {}),
  });
  if (error) {
    console.error("saveResume failed:", error.message);
    redirect("/mypage/resume?error=save");
  }

  // 🔴 성별·생년월일은 resumes 가 아니라 profiles 에 있다(인재 카드가 거기서 읽는다).
  //    개인정보는 이력서 화면에서 받는다는 원칙(오너 확정)에 따라 이 폼이 함께 갱신한다.
  //    빈 값이면 null 로 지운다 — '선택 안 함' 이 실제로 지워져야 한다.
  //    아는 값만 통과시킨다(조작된 POST 로 임의 문자열이 남의 화면 카드에 뜨는 것을 막는다).
  //    값은 DB 에 실제로 있는 '여성'/'남성' 이다(이관 11,407명). 화면 option 과 같은 집합이어야 한다.
  const genderIn = String(formData.get("gender") ?? "").trim();
  // 🔴 "빈 값 = 지우기" 와 "모르는 값 = 손대지 않기" 를 구분한다. 예전 값이 목록에 없다는 이유로
  //    사용자가 건드린 적 없는 공개 항목을 null 로 덮어쓰면 안 된다.
  const knownGender = genderIn === "여성" || genderIn === "남성";
  const birthdayIn = String(formData.get("birthday") ?? "").trim();
  // 형식만 맞고 실재하지 않는 날짜(2026-02-31)는 date 컬럼이 거부해 **문장 전체**가 실패한다
  // → 성별 변경까지 함께 유실된다. 되짚어 비교해 실재 날짜만 통과시킨다.
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(birthdayIn)
    && new Date(`${birthdayIn}T00:00:00Z`).toISOString().slice(0, 10) === birthdayIn;
  const bits: { gender?: string | null; birthday?: string | null } = { birthday: validDate ? birthdayIn : null };
  if (knownGender || genderIn === "") bits.gender = knownGender ? genderIn : null;
  const { error: profErr } = await supabase.from("profiles").update(bits).eq("id", user.id);
  // 이력서 본문은 이미 저장됐다 — 여기서 되돌리지 않고 알리기만 한다(다시 저장하면 복구된다).
  if (profErr) console.error("saveResume(profile bits) failed:", profErr.message);

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
  //
  // 🔴 "비었으면 건너뛴다"로 두면 확인이 사실상 없는 것과 같다 — 이메일 가입자도 비밀번호 칸을
  //    비운 채 '탈퇴' 두 글자만 넣으면 통과했다. 소셜 계정만 면제하려던 것이었으므로,
  //    **면제 여부를 사용자 입력이 아니라 계정에 실제로 비밀번호가 있는지로 판단**한다.
  const admin = createAdminClient();
  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(user.id);
  // 🔴 identity 이름으로 판정하면 안 된다. 네이버 로그인은 우리가 직접 구현해서
  //    admin.createUser({ email }) 로 계정을 만드는데(비밀번호 없음), GoTrue 는 그 계정에도
  //    provider "email" identity 를 붙인다. 그래서 "email identity = 비밀번호 있음"으로 보면
  //    **네이버 회원 전원이 탈퇴를 못 하게 된다**(비밀번호를 만든 적이 없고, 만들 화면도 없다).
  //    → 소셜 계정인지로 면제를 판정한다: 네이버는 우리가 넣은 metadata.provider, 카카오는 identity.
  const au = authUser?.user;
  // 조회 자체가 실패하면 판정할 수 없다 → 비밀번호를 강요해 소셜 회원을 가두는 대신 재시도를 안내한다.
  if (authErr || !au) {
    console.error("deleteAccount(getUserById) failed:", authErr?.message ?? "no user");
    redirect("/mypage/account?error=save");
  }

  // 비밀번호 로그인이 붙은 계정인가 = email identity 가 있는가.
  // 🔴 단, 네이버는 우리가 admin.createUser({ email }) 로 만들기 때문에 **비밀번호가 없는데도**
  //    email identity 가 붙는다 → 그 표식으로만 예외를 둔다.
  // 🔴 표식은 app_metadata 를 본다. user_metadata 는 세션 소유자가 브라우저에서
  //    updateUser({ data: … }) 로 직접 쓸 수 있어 **서버 판정의 근거가 될 수 없다**.
  //    (이관·기존 계정을 위해 user_metadata 도 함께 보되, 새로 만드는 계정은 app_metadata 를 쓴다.)
  const isNaverAccount =
    au.app_metadata?.provider === "naver" || au.user_metadata?.provider === "naver";
  const requiresPassword = (au.identities ?? []).some((i) => i.provider === "email") && !isNaverAccount;

  // 넣어서 왔으면 provider 와 무관하게 **항상** 검증한다 — 틀린 비밀번호가 통과하는 경로를 두지 않는다.
  const password = String(formData.get("password") ?? "");
  if (requiresPassword && !password) redirect("/mypage/account?error=password_required");
  if (password) {
    const { error: wrong } = await supabase.auth.signInWithPassword({ email: user.email, password });
    if (wrong) redirect("/mypage/account?error=wrong_password");
  }

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

  // 🔴 얼굴 사진은 스토리지 오브젝트라 **cascade 로 안 지워진다**. 계정만 지우면 증명사진이
  //    버킷에 영원히 남는다 — 개인정보처리방침의 "탈퇴 시 지체 없이 파기"와 어긋난다.
  //    경로는 **지금** 읽어둔다(계정을 지우면 profiles 행이 사라져 읽을 수 없다).
  //    외부 URL(네이버 프로필)은 우리 것이 아니라 지울 게 없다.
  const { data: me } = await admin.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle();
  const avatar = (me?.avatar_url ?? "").trim();

  // profiles·resumes·applications 는 auth 사용자에 cascade 로 묶여 함께 지워진다.
  // ad_orders.buyer_id 는 set null 이라 결제 기록은 남는다(전자상거래법 5년 보존).
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("deleteAccount failed:", error.message);
    redirect("/mypage/account?error=save");
  }

  // 🔴 파일 삭제는 계정 삭제에 **성공한 뒤에** 한다. 먼저 지우면, deleteUser 가 실패해 화면으로
  //    되돌아갔을 때 계정은 그대로인데 증명사진만 사라진다(복구 불가). 경로는 위에서 이미 확보했다.
  if (avatar && !avatar.startsWith("http")) {
    const { error: rmErr } = await admin.storage.from(AVATAR_BUCKET).remove([avatar]);
    // 여기서 실패해도 되돌릴 게 없다(계정은 이미 사라졌다) — 흔적만 남겨 수동 정리를 가능하게 한다.
    if (rmErr) console.error("deleteAccount(avatar) failed:", rmErr.message, avatar);
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

  // 🔴 증명사진은 profiles.avatar_url + 스토리지 오브젝트라 이력서와 함께 지워지지 않는다.
  //    이력서를 지웠는데 사진 카드에 얼굴이 그대로 남아 있으면 "다 지운 게 맞나" 싶어진다.
  //    이력서를 지운다 = 병원에 보이던 내 정보를 거둔다 → 사진도 같이 거둔다.
  //    (네이버 프로필 같은 외부 URL 은 우리 것이 아니라 지울 게 없다.)
  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle();
  const old = (prof?.avatar_url ?? "").trim();
  if (old && !old.startsWith("http")) {
    const { error: clr } = await admin.from("profiles").update({ avatar_url: null }).eq("id", user.id);
    if (clr) console.error("deleteResume(avatar clear) failed:", clr.message);
    else {
      const { error: rm } = await admin.storage.from(AVATAR_BUCKET).remove([old]);
      if (rm) console.error("deleteResume(avatar remove) failed:", rm.message, old);
    }
  }
  redirect("/mypage/resume?ok=deleted");
}

// 지원자 화면으로 돌아가는 주소 — 보고 있던 공고·상태·검색어·페이지를 그대로 유지한다.
// 이게 없으면 한 건 처리할 때마다 '전체 1페이지'로 튕겨, 500건짜리 목록에서 보던 자리를 잃는다.
const APPLICANT_VIEW_KEYS = ["job_id", "status", "q", "page"] as const;
function applicantsHref(formData: FormData, extra?: Record<string, string>): string {
  const p = new URLSearchParams(extra);
  for (const k of APPLICANT_VIEW_KEYS) {
    const v = String(formData.get(k) ?? "").trim();
    if (v) p.set(k, v);
  }
  const s = p.toString();
  return "/mypage/applicants" + (s ? `?${s}` : "");
}

/**
 * 병원 — 지원자 메모 저장.
 *
 * 500건 규모에서는 상태 5가지만으로 관리가 안 된다(오너 지시): 두 번째 통화에서 무슨 말을
 * 했는지, 왜 보류인지 적을 곳이 필요하다.
 * 🔴 메모는 applications 가 아니라 application_notes 에 있다 — applications 는 지원자 본인에게
 *    행 전체가 열려 있어(applications_select), 거기 두면 간호사가 병원 내부 기록을 그대로 읽는다.
 *    RLS(application_notes_owner)가 공고 소유 병원만 통과시키므로 여기서 소유 검사를 또 하지 않는다.
 */
export async function saveApplicantNote(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const id = String(formData.get("application_id") ?? "");
  if (!id) redirect(applicantsHref(formData));
  // 길이 상한 — 메모는 기록이지 문서가 아니다. 넘치면 잘라서 저장한다(입력에서도 maxLength 로 막는다).
  const memo = String(formData.get("memo") ?? "").slice(0, 1000);
  const { data, error } = await supabase
    .from("application_notes")
    .upsert({ application_id: id, memo, updated_by: user.id }, { onConflict: "application_id" })
    .select("application_id");
  redirect(applicantsHref(formData, error || !data?.length ? { error: "1" } : { ok: "memo" }));
}

// 병원 — 지원자 상태 변경(열람/합격/불합격). RLS로 공고 소유 병원만.
export async function updateApplicationStatus(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const id = String(formData.get("application_id") ?? "");
  // 🔴 필드 이름이 to_status 인 이유: 이 화면의 목록 필터도 `status` 를 쓴다(APPLICANT_VIEW_KEYS).
  //    같은 이름을 쓰면 applicantsHref 가 "바꿀 상태"를 "보던 필터"로 잘못 읽어, 판정 취소 후
  //    ?status=viewed 필터가 멋대로 걸린 채 돌아온다(실측).
  const status = String(formData.get("to_status") ?? "");
  // isHospitalStatus로 좁혀야 오타·위조된 상태가 그대로 update로 들어가지 않는다.
  if (!id || !isHospitalStatus(status)) redirect(applicantsHref(formData));
  // 반환 행으로 실제 반영을 확인한다 — RLS에 막혀 0행이어도 error는 null이라 "처리되었습니다"가 뜬다.
  // 취소된 지원은 병원이 되살릴 수 없다(간호사가 거둬간 지원서다).
  // 바꾸기 전 상태를 먼저 읽는다 — 되돌리기(합격/불합격 → 열람됨)는 지원자 화면에서 예고 없이
  // 결과가 사라지는 일이라, 언제 무엇을 뒤집었는지 근거가 남아야 한다(RLS 로 병원만 읽는 메모에 적는다).
  const { data: before } = await supabase.from("applications").select("status").eq("id", id).maybeSingle();
  const { data, error } = await supabase.from("applications").update({ status }).eq("id", id).neq("status", "withdrawn").select("id");
  if (!error && data?.length && before && isDecided(before.status) && status === "viewed") {
    const stamp = `[${new Date().toISOString().slice(0, 10)}] '${STATUS_LABEL[before.status as AppStatus]}' 판정을 취소함`;
    const { data: prev } = await supabase
      .from("application_notes").select("memo").eq("application_id", id).maybeSingle();
    const memo = [prev?.memo, stamp].filter(Boolean).join("\n").slice(0, 1000);
    // 기록 실패가 판정 자체를 되돌리지는 않는다 — 상태는 이미 바뀌었고, 기록은 부가다.
    const { error: noteErr } = await supabase
      .from("application_notes").upsert({ application_id: id, memo, updated_by: user.id }, { onConflict: "application_id" });
    if (noteErr) console.error("판정 취소 기록 실패:", noteErr.message);
  }
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
  // 보던 화면(공고·상태·검색어·페이지)을 인쇄 화면까지 들고 간다 — 거기 '목록으로' 링크가
  // 이 값을 그대로 되돌려줘야, 2페이지에서 이력서를 연 사람이 1페이지 전체로 튕기지 않는다.
  const back = new URLSearchParams();
  for (const k of APPLICANT_VIEW_KEYS) {
    const v = String(formData.get(k) ?? "").trim();
    if (v) back.set(k, v);
  }
  const qs = back.toString();
  redirect(`/mypage/applicants/${encodeURIComponent(id)}/print${qs ? `?${qs}` : ""}`);
}

/** 파일 앞부분이 JPEG/PNG/WEBP 시그니처인가. 확장자·MIME 이 아니라 내용을 본다. */
async function looksLikeImage(file: File): Promise<boolean> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const webp = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  return jpeg || png || webp;
}

/**
 * 간호사 — 이력서 사진 등록·교체.
 *
 * 선택 항목이다(오너 확정 2026-07-29). 지금까지 사진을 넣는 길이 아예 없어서, 이관 회원과
 * 네이버 가입자만 사진이 있고 이메일로 새로 가입한 사람은 영영 없었다.
 *
 * 🔴 버킷(avatars)은 비공개이고 스토리지 RLS 정책이 없다 — 서버(service_role)만 읽고 쓴다는 설계다.
 *    그래서 사용자 클라이언트로 올리지 않고 여기서 admin 으로 올린다.
 * 🔴 오브젝트 키는 **난수**여야 한다. 예전에 `{profile_id}.jpg` 로 지었다가, 목록 HTML 에 실리는
 *    profile_id 로 경로를 조합해 얼굴 사진 전량을 긁어갈 수 있었다(20260728120000 참고).
 */
export async function saveResumePhoto(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) redirect("/mypage/resume?error=photo_empty");
  // 버킷 제약과 같은 값으로 먼저 거른다 — 여기서 안 막으면 스토리지가 뱉는 영문 에러만 보인다.
  if (file.size > AVATAR_MAX_BYTES) redirect("/mypage/resume?error=photo_size");
  if (!AVATAR_MIME.some((m) => m === file.type)) redirect("/mypage/resume?error=photo_type");
  // file.type 은 **브라우저가 보내는 값**이라 위조된다. 버킷의 allowed_mime_types 도 같은 값을
  // 보므로 독립 방어가 아니다 → 앞부분 바이트로 진짜 이미지인지 한 번 더 본다.
  // (실행 위험은 낮지만 — 저장 Content-Type 이 image/* 이고 다른 오리진이다 — 임의 바이너리를
  //  우리 버킷에 보관해 주는 일은 막는다.)
  if (!(await looksLikeImage(file))) redirect("/mypage/resume?error=photo_type");

  const admin = createAdminClient();
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${randomUUID()}.${ext}`;
  const { error: upErr } = await admin.storage.from(AVATAR_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) {
    console.error("saveResumePhoto upload failed:", upErr.message);
    redirect("/mypage/resume?error=photo");
  }

  // 이전 사진 경로를 먼저 읽어둔다 — 교체 후 지워야 실패해도 사진이 사라지지 않는다.
  // 🔴 이 조회가 실패하면 중단한다. 그냥 넘기면 옛 경로를 모른 채 avatar_url 만 덮어써서,
  //    지워야 할 파일이 버킷에 영원히 남는다(고아 오브젝트).
  const { data: prof, error: profErr } = await admin
    .from("profiles").select("avatar_url").eq("id", user.id).maybeSingle();
  if (profErr) {
    console.error("saveResumePhoto read prev failed:", profErr.message);
    await admin.storage.from(AVATAR_BUCKET).remove([path]);
    redirect("/mypage/resume?error=photo");
  }
  const { error: setErr } = await admin.from("profiles").update({ avatar_url: path }).eq("id", user.id);
  if (setErr) {
    console.error("saveResumePhoto update failed:", setErr.message);
    await admin.storage.from(AVATAR_BUCKET).remove([path]); // 가리키는 데 없는 파일을 남기지 않는다
    redirect("/mypage/resume?error=photo");
  }
  const old = (prof?.avatar_url ?? "").trim();
  // 외부 URL(네이버 프로필)은 우리 버킷이 아니라 지울 게 없다.
  if (old && !old.startsWith("http")) await admin.storage.from(AVATAR_BUCKET).remove([old]);
  redirect("/mypage/resume?ok=photo");
}

/** 간호사 — 이력서 사진 삭제. 넣는 것과 같은 무게로 뺄 수 있어야 한다. */
export async function deleteResumePhoto() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle();
  const { error } = await admin.from("profiles").update({ avatar_url: null }).eq("id", user.id);
  if (error) {
    console.error("deleteResumePhoto failed:", error.message);
    redirect("/mypage/resume?error=photo_delete");
  }
  const old = (prof?.avatar_url ?? "").trim();
  if (old && !old.startsWith("http")) await admin.storage.from(AVATAR_BUCKET).remove([old]);
  redirect("/mypage/resume?ok=photo_deleted");
}

/**
 * 간호사 — 이력서 공개/비공개 즉시 전환.
 *
 * 🔴 왜 이력서 저장(saveResume)과 따로 두는가:
 *    전에는 공개 여부가 447줄짜리 편집 폼의 411번째 줄 체크박스 하나뿐이었다. 비공개로 바꾸려면
 *    이력서 편집 → 끝까지 스크롤 → 체크 해제 → 폼 전체 저장 이었고, 폼의 다른 항목이 검증에
 *    걸리면 비공개조차 되지 않았다. 구 널스넷에서 이게 회원 이탈의 주된 원인이었다(오너 확인).
 *    개인정보 제공 동의 철회는 **한 번에, 마찰 없이** 되어야 한다.
 *
 * 켤 때는 화면에서 무엇이 공개되는지 확인을 받는다(동의 행위). 끌 때는 즉시 — 철회에 확인을
 * 요구하는 건 다크패턴이다.
 */
export async function setResumePublic(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const next = formData.get("is_public") === "on";
  // 이력서 PK 는 profile_id 이고 곧 user.id 다(saveResume 과 같은 계약) — 남의 이력서를 건드릴 경로가 없다.
  const { data, error } = await supabase
    .from("resumes").update({ is_public: next }).eq("profile_id", user.id).select("profile_id");
  if (error || !data?.length) {
    console.error("setResumePublic failed:", error?.message ?? "no row");
    redirect("/mypage/resume?error=visibility");
  }
  redirect(`/mypage/resume?ok=${next ? "public" : "private"}`);
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
  // 공고 상세에서 취소했으면 그 공고로 돌아온다 — 보던 화면이 튀지 않게(지원·저장 폼과 같은 규약).
  // 목록에서 취소했으면 next 가 없어 지원 내역에 남는다.
  const back = safeNext(String(formData.get("next") ?? ""), "/mypage/applications");
  const sep = back.includes("?") ? "&" : "?";
  if (error || !data?.length) redirect(`${back}${sep}error=1`);
  redirect(`${back}${sep}ok=cancel`);
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
  // 반환 행으로 실제 반영을 확인한다 — RLS 에 막히면 0행일 뿐 error 는 null 이라,
  // 병원은 "마감했다"고 믿는데 공고가 계속 노출된다(같은 파일의 다른 액션들과 같은 규약).
  const { data, error } = await supabase
    .from("jobs").update({ status }).eq("id", id).in("status", ["open", "closed"]).select("id");
  if (error || !data?.length) redirect("/mypage/jobs?error=1");
  redirect("/mypage/jobs?ok=1");
}

// 병원 — 공고 삭제 (RLS로 소유 공고만).
export async function deleteJob(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const id = String(formData.get("job_id") ?? "");
  if (id) {
    // 위와 같은 이유로 반환 행을 본다 — 남의 공고를 지우려다 RLS 에 막혀도 "삭제했습니다"가 떴다.
    const { data, error } = await supabase.from("jobs").delete().eq("id", id).select("id");
    if (error || !data?.length) redirect("/mypage/jobs?error=1");
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

/**
 * 병원 연결 해제 — 잘못 고른 병원을 스스로 되돌린다.
 *
 * 🔴 왜: 인증할 때 병원을 한 번 고르면 hospitals.owner_profile_id 가 박히고, 그 뒤로는 공고 등록
 *    화면이 그 병원을 고정 표시할 뿐 바꿀 방법이 없었다. 실수로 옆 병원을 고른 사람은
 *    영영 그 이름으로 공고를 내야 했다.
 *
 * 🔴 공고가 하나라도 있으면 막는다. 연결을 끊으면 그 공고들의 소유자 판정(ownedJobHospital)이
 *    깨져 **자기 공고를 수정·마감·삭제할 수 없게 된다**. 되돌릴 수 없는 상태를 만들지 않는다.
 *    공고가 있는 채로 옮겨야 하면 운영이 처리한다(화면에서 고객센터로 안내).
 */
export async function unlinkHospital() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!prof || (await viewAsRole(prof.role)) !== "hospital") redirect("/mypage");

  const { data: mine, error: hErr } = await admin.from("hospitals").select("id").eq("owner_profile_id", user.id);
  if (hErr) {
    console.error("unlinkHospital(read) failed:", hErr.message);
    redirect("/mypage/verify?error=unlink");
  }
  const ids = (mine ?? []).map((h) => h.id);
  if (ids.length === 0) redirect("/mypage/verify?error=nohospital");

  // 공고가 남아 있으면 해제하지 않는다(마감된 공고도 포함 — 지원자 기록이 그 공고에 달려 있다).
  const { count, error: cErr } = await admin
    .from("jobs").select("id", { count: "exact", head: true }).in("hospital_id", ids);
  if (cErr) {
    console.error("unlinkHospital(count jobs) failed:", cErr.message);
    redirect("/mypage/verify?error=unlink");
  }
  if ((count ?? 0) > 0) redirect("/mypage/verify?error=hasjobs");

  const { error } = await admin
    .from("hospitals").update({ owner_profile_id: null, is_claimed: false }).in("id", ids);
  if (error) {
    console.error("unlinkHospital failed:", error.message);
    redirect("/mypage/verify?error=unlink");
  }

  // 🔴 세는 것과 지우는 것 사이에 다른 탭이 공고를 올렸을 수 있다. 그러면 공고는 있는데 주인이
  //    없어져 **아무도 그 공고를 수정·마감·삭제할 수 없다**(ownedJobHospital 이 null 을 준다).
  //    해제 뒤 한 번 더 세고, 생겼으면 소유권을 돌려놓는다(보상).
  const { count: after } = await admin
    .from("jobs").select("id", { count: "exact", head: true }).in("hospital_id", ids);
  if ((after ?? 0) > 0) {
    await admin.from("hospitals").update({ owner_profile_id: user.id, is_claimed: true }).in("id", ids);
    redirect("/mypage/verify?error=hasjobs");
  }
  await admin.from("profiles").update({ claimed_hospital_id: null }).eq("id", user.id);
  redirect("/mypage/verify?ok=unlinked&reverify=1");
}
