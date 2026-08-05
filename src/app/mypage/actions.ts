"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyBusiness } from "@/lib/data/nts";
import { adProduct, AD_PRODUCTS, isOrderStatus, type OrderStatus } from "@/lib/ads";
import { decidePayment } from "@/lib/paymentFlow";
import { getPayment, findPaidPayment, iamportReady } from "@/lib/iamport";
import { viewAsRole } from "@/lib/data/user";
import { safeNext } from "@/lib/url";
import { AVATAR_BUCKET } from "@/lib/data/avatar";
import { AVATAR_MAX_BYTES, AVATAR_MIME } from "@/lib/avatarLimits";
import { CANCELABLE, isHospitalStatus, STATUS_LABEL, type AppStatus } from "@/lib/data/applications";
import { DAY_MS, todayKst, nowMs } from "@/lib/date";
import { logAdmin } from "@/lib/data/admin";
import { MIN_PASSWORD } from "@/lib/constants";
import { isSettableJobStatus } from "@/lib/jobState";
import { regionOfLocation } from "@/lib/jobRegion";
import { geocodeAddress } from "@/lib/kakao";
import { totalYears } from "@/lib/data/resume";
import { CAREER_EXPERIENCED, DEPARTMENTS, JOB_CATEGORIES, RESUME_INTRO_MIN, RESUME_INTRO_MAX as INTRO_MAX } from "@/lib/resumeOptions";
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

// ad_orders.note 는 제약 없는 text 지만 관리자가 화면에서 훑어야 하는 칸이다.
// 취소 통보가 반복돼 무한히 길어지지 않도록 여기서 자른다(사고 한 건당 한 줄 ≈ 60자, 열 줄이면 충분).
const NOTE_MAX = 600;

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

  const { data: hosp } = await admin.from("hospitals").select("id, owner_profile_id, region, address").eq("id", hospitalId).maybeSingle();
  if (!hosp) redirect("/mypage/jobs/new?error=hospital");
  if (hosp.owner_profile_id && hosp.owner_profile_id !== user.id) redirect("/mypage/jobs/new?error=claimed");
  if (!hosp.owner_profile_id) {
    await admin.from("hospitals").update({ owner_profile_id: user.id, is_claimed: true }).eq("id", hospitalId);
    await admin.from("profiles").update({ claimed_hospital_id: hospitalId }).eq("id", user.id);
  }

  // 🔴 **완전 무료 광고는 없다**(오너 확정 2026-08-05: "병원이 1주 내면 1만원 돈으로 지불하게").
  //    그래서 공고는 **저장만 되고 노출은 결제해야 시작된다**(draft). 등록 자체는 여전히 공짜다.
  //    종전에는 선택과 무관하게 status='open' + 7일 노출을 줬는데, 그 탓에 「2주」를 고르고
  //    결제만 안 하면 무료 7일을 몇 번이든 받을 수 있었다(실측 2026-08-05 15:18, 주문 0건).
  //    이제 노출의 유일한 문은 featured_until 이고, 그건 결제(activateAdOrder)만 세운다.
  //    첫 광고도 공짜가 아니다 — 가입 캐시 70,000 < 1주 80,000 이라 최소 10,000원이 나간다.
  const weeksPicked = Number(s("duration"));
  const picked = adProduct(weeksPicked)?.weeks ?? AD_PRODUCTS[0].weeks;

  const num = (k: string) => { const n = parseInt(s(k), 10); return Number.isFinite(n) && n > 0 ? n : null; };
  const deadline = jobDeadline(s);
  if (deadline === "past") redirect("/mypage/jobs/new?error=deadline");
  const benefits = s("benefits").split(",").map((x) => x.trim()).filter(Boolean);
  const am = formData.getAll("apply_methods").map(String).filter((m) => ["platform", "email", "offline"].includes(m));
  const methods = am.length ? am : ["platform"];
  const location = s("location") || hosp.address || hosp.region || null;
  const region = regionOfLocation(location); // 지역 드롭다운·필터용 정규화(ingest 시점 확정)
  const coords = location ? await geocodeAddress(location) : null; // 내 주변 필터용 좌표(실패해도 등록은 막지 않는다)
  const { data: created, error } = await admin.from("jobs").insert({
    hospital_id: hospitalId,
    title,
    ...jobAxes(s),
    location,
    sido: region.sido,
    sigungu: region.sigungu,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    geocoded_at: location ? new Date().toISOString() : null,
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
    // 🔴 결제 전에는 **아무 데도 안 보인다.** 노출을 여는 문은 featured_until 하나뿐이고,
    //    그건 결제(activateAdOrder)만 세운다 — 거기서 status·featured_until 을 함께 쓴다.
    //    ad_tier 는 NOT NULL 이라(20260804370000) 자리값이 필요하다. 'free' 는 "아직 광고 없음" 이다.
    status: "draft",
    featured_until: null,
    ad_tier: "free",
  }).select("id").single();
  if (error || !created) redirect("/mypage/jobs/new?error=save");
  // 저장했으니 결제 화면으로 — 여기서 기간을 고르고 결제하면 그때 노출이 시작된다.
  redirect(`/mypage/jobs/${created.id}/ad?weeks=${picked}`);
}

// 소유 공고인지 확인(병원 소유주 == 본인). 아니면 null.
// deadline 도 같이 실어 준다 — 광고 결제 경로가 마감일을 봐야 하는데, 따로 조회하면
// 결제 준비마다 왕복이 하나 더 붙는다(같은 행을 두 번 읽는 셈이다).
async function ownedJobHospital(admin: ReturnType<typeof createAdminClient>, jobId: string, userId: string) {
  const { data: job } = await admin.from("jobs").select("hospital_id, deadline").eq("id", jobId).maybeSingle();
  if (!job?.hospital_id) return null; // 워크넷 광고 등 명부 미연결 공고는 소유 대상이 아니다.
  const { data: hosp } = await admin.from("hospitals").select("id, owner_profile_id, region").eq("id", job.hospital_id).maybeSingle();
  if (!hosp || hosp.owner_profile_id !== userId) return null;
  return { ...hosp, deadline: job.deadline };
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
  const coords = location ? await geocodeAddress(location) : null;
  const { error } = await admin.from("jobs").update({
    title,
    ...jobAxes(s),
    location,
    sido: region.sido,
    sigungu: region.sigungu,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    geocoded_at: location ? new Date().toISOString() : null,
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

// 다시 게시 — 마감했던 공고를 다시 공개한다(광고 기간이 남아 있을 때만).
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
  const { data: job } = await admin.from("jobs").select("status, featured_until, deadline").eq("id", jobId).maybeSingle();
  if (!job || !isSettableJobStatus(job.status)) redirect("/mypage/jobs?error=1");

  // 🔴 마감일이 지난 공고는 status 를 open 으로 되돌려도 **아무 데도 안 나온다**
  //    (jobState 가 deadline 으로 expired 를 판정하고 isOpenToSeekers 도 false).
  //    그런데 화면은 이 공고에 '다시 게시' 버튼을 그리고, 여기서는 status 가 이미 open 이라
  //    update 가 행을 돌려줘 "처리되었습니다"까지 떴다 — 침묵하는 실패다.
  //    마감일부터 고치게 돌려보낸다. 여기서 deadline 을 임의로 비우지 않는 이유는,
  //    병원이 정한 마감일을 서버가 말없이 지우는 쪽이 더 나쁘기 때문이다.
  if (job.deadline && job.deadline < todayKst(nowMs())) redirect("/mypage/jobs?error=deadline");

  // 🔴 **무료로 다시 게시하는 길은 없다**(오너 확정 2026-08-05: "완전 무료 광고는 없애라").
  //    종전에는 다시 게시가 새 7일 무료 노출을 줬고, 그래서 7일마다 눌러 영원히 공짜였다.
  //    이제 광고 기간이 남아 있는 공고만 다시 게시할 수 있다(마감했다가 되살리는 경우).
  //    기간이 끝났으면 광고를 새로 사야 한다 — 화면이 결제로 안내한다.
  const paidLive = !!job.featured_until && job.featured_until > nowIso;
  if (!paidLive) redirect(`/mypage/jobs/${jobId}/ad?error=expired`);

  // 조건을 update 에도 한 번 더 건다(읽고 쓰는 사이에 상태가 바뀌는 경우) + 반환 행으로 반영 확인.
  //
  // 🔴 featured_until 은 **건드리지 않는다.** 남은 광고 기간이 그대로 이어져야 한다 —
  //    여기서 새로 쓰면 마감/재게시를 반복해 광고를 무한 연장할 수 있다.
  //    posted_at 만 갱신해 목록·홈 카드에서 최신으로 잡히게 한다(정렬은 ad_live desc, posted_at desc).
  const q = admin
    .from("jobs")
    .update({ status: "open", posted_at: nowIso })
    .eq("id", jobId).in("status", ["open", "closed"]);
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
  // 제목·자기소개는 필수다(오너 확정 2026-07-30). 화면의 required·minLength 는 편의일 뿐이라
  // 서버가 같은 규칙을 다시 건다 — 조작된 POST 는 그 속성을 그냥 무시한다.
  // 목록 카드의 머리말이 제목이고, 자기소개가 비면 병원이 판단할 근거가 카드에 남지 않는다.
  if (!s("resume_title")) redirect("/mypage/resume?error=title");
  // 공백만 채워 넘기는 것을 막으려고 trim 후 길이를 센다(s() 가 이미 trim 한다).
  if ((s("intro", INTRO_MAX) ?? "").length < RESUME_INTRO_MIN) redirect("/mypage/resume?error=intro");
  if (shiftTypes.length === 0) redirect("/mypage/resume?error=shift");
  if (regions.length === 0) redirect("/mypage/resume?error=region");
  // 병원명만 적고 입사연월을 비우면 그 줄이 조용히 버려져 경력이 사라진다 → 되돌려 알린다.
  if (work.some((w) => !w.hospital_name || !w.start_ym)) redirect("/mypage/resume?error=work");
  if (careerLevel === CAREER_EXPERIENCED && work.length === 0) redirect("/mypage/resume?error=work_required");


  const { error } = await supabase.from("resumes").upsert({
    profile_id: user.id,
    // 🔴 사람이 저장한 시각. 인재 목록 정렬이 이 값을 쓴다 — updated_at 은 이관·보정 배치가
    //    한꺼번에 밀어놓아 "누가 실제로 손댔는지" 를 더 이상 말해주지 못한다(20260804290000).
    last_edited_at: new Date().toISOString(),
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
    // 🔴 상한을 따로 준다. 기본값 300 을 쓰면 저장할 때마다 조용히 잘렸다 —
    //    이관된 회원 701명이 300자를 넘고(최장 3,627자) 그 사람들이 이력서를 한 번 저장하는
    //    순간 자기소개 뒷부분이 사라진다. 화면 textarea 의 maxLength 도 같은 값이다.
    intro: s("intro", INTRO_MAX),
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
  // 🔴 여기서 되돌려 보내지 않는다. 이름에 이모지가 있으면 DB 트리거가 조용히 다듬어 저장한다
  //    (20260804280000). 전에는 CHECK 로 거절했는데, 그게 **가입과 이력서 저장을 통째로 막았다.**
  //    사람이 쓴 이름을 이유로 그 사람의 작업을 날리지 않는다.
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
  // 🔴 단, 네이버·카카오는 우리가 admin.createUser({ email }) 로 만들기 때문에
  //    **비밀번호가 없는데도** email identity 가 붙는다 → 그 표식으로만 예외를 둔다.
  // 🔴 표식은 app_metadata 를 본다. user_metadata 는 세션 소유자가 브라우저에서
  //    updateUser({ data: … }) 로 직접 쓸 수 있어 **서버 판정의 근거가 될 수 없다**.
  //    🔴 한때 "이관 계정을 위해"라며 user_metadata 도 OR 로 함께 봤는데, 그게 바로 위 문장을
  //    스스로 어기는 것이었다. 로그인된 브라우저 앞의 제3자가 콘솔에서
  //    updateUser({ data: { provider: "naver" } }) 한 번이면 비밀번호 없이 계정을 지울 수 있었다
  //    (탈퇴 폼의 비밀번호 칸에는 required 가 없다). 이 가드의 존재 이유가 통째로 무력화된다.
  //    제거해도 잠기는 사람이 없음을 확인했다 — 네이버 계정 0건(2026-07-30 실측).
  const isSocialAccount = ["naver", "kakao"].includes(au.app_metadata?.provider ?? "");
  const requiresPassword = (au.identities ?? []).some((i) => i.provider === "email") && !isSocialAccount;

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
/** 결제 준비 실패 사유. 넓은 string 으로 두면 오타를 화면에서야 알게 된다. */
type AdPrepareError = "unavailable" | "auth" | "product" | "not_owner" | "db" | "cash_only" | "changed" | "deadline" | "cash_locked";
type AdPrepare = { ok: true; merchant_uid: string; amount: number; name: string } | { ok: false; error: AdPrepareError };

/**
 * 결제되지 않은 주문이 붙들고 있는 광고 캐시를 되돌린다.
 *
 * 🔴 캐시는 **주문을 만들 때 바로 잔액에서 뺀다**(claim). 그래야 결제창을 두 개 띄워
 *    같은 캐시를 두 번 쓰는 길이 막힌다. 대신 손님이 결제창을 닫고 떠나면 그 캐시가
 *    주문에 묶인 채 남으므로, 다음 결제 준비 때 오래된 것부터 풀어 준다.
 * 🔴 푼 주문은 **EXPIRED 로 못 박는다**(조건부 UPDATE 로 성공한 행만 푼다).
 *    풀어 주고도 나중에 활성화되면 캐시를 공짜로 가져간 셈이 되기 때문이다 —
 *    activateAdOrder 가 EXPIRED 를 선점 대상에서 뺀다.
 * 🔴 2시간을 기다리는 이유: 카드 결제창은 몇 분이면 끝난다. 넉넉히 지난 것만 풀어야
 *    **결제 중인 주문의 캐시를 뺏는** 사고가 안 난다.
 */
const STALE_ORDER_MS = 2 * 60 * 60 * 1000;   // 포트원에 못 물어봐도 이만큼 지났으면 푼다
const CONFIRM_UNPAID_MS = 10 * 60 * 1000;    // 포트원이 "결제 없음" 이라고 하면 이만큼만 지나도 푼다
/**
 * 캐시를 붙들고 있어 **자동 회수 대상**인 상태.
 *
 * 🔴 FAILED 는 뺐다. 금액 불일치처럼 **돈이 실제로 오간 사고**라, 자동으로 EXPIRED 로 덮으면
 *    /admin/orders 「실패」 탭과 대시보드의 '실패 주문' 카운터에서 통째로 사라진다 —
 *    돈은 받고 광고는 못 준 건이 아무도 안 보는 곳으로 숨는다. 사람이 포트원과 대조할 사건이다.
 */
const ORDER_HOLDS_CASH: readonly OrderStatus[] = ["PREPARE", "CANCELED"];
/**
 * 결제가 확인되면 **되살릴 수 있는** 상태. CANCELED 는 콜백만 실패하고 승인은 났을 수 있어 포함한다.
 *
 * 🔴 EXPIRED·FAILED 는 없다 — **둘 다 캐시를 이미 돌려준 주문**이다. 되살려 광고를 켜 주면
 *    캐시는 돌려받고 광고도 받는 이중 이득이 된다(FAILED 는 금액 불일치 전용 상태이고,
 *    recordAmountMismatch 가 그 자리에서 캐시를 반환한다). 금액이 어긋난 주문을 뒤늦게
 *    자동으로 켜 주는 것도 애초에 맞지 않다 — 사람이 포트원과 대조할 사건이다.
 */
const ORDER_REVIVABLE: readonly OrderStatus[] = ["PREPARE", "CANCELED"];

/**
 * 그 주문에 **받은 돈이 없다**가 확정됐는가 — 광고 캐시를 돌려줘도 되는가.
 *
 * 🔴 물음을 하나로 좁혔다. 포트원에 "승인된 결제가 있나"(findPaidPayment)만 묻는다.
 *    카드 거절·전액취소·결제창만 열고 이탈(ready) 은 전부 "승인된 결제 없음" 으로 같은 답이 되고,
 *    그 셋 모두 돌려주는 것이 맞다. 상태 목록을 손으로 나열하면 하나 빠뜨리는 순간
 *    손님 캐시가 영원히 잠긴다(실제로 'ready' 가 빠져 있었다).
 * 🔴 조회 실패(null)에는 단정하지 않는다 — 승인된 결제의 캐시를 뺏는 쪽이 훨씬 나쁘다.
 */
function noPaymentHeld(p: Awaited<ReturnType<typeof findPaidPayment>>): boolean {
  return p === "notfound";
}

/**
 * 아직 EXPIRED 로 못 박으면 안 되는 시점인가.
 *
 * 🔴 EXPIRED 는 **되돌릴 수 없다**(ORDER_REVIVABLE 밖). 카드사 결제창은 거절된 뒤에도 같은
 *    주문번호로 재시도가 되고, 승인이 났는데 브라우저 콜백만 실패해서 오는 경우도 있다.
 *    그 찰나에 포트원이 아직 승인 건을 안 보여주면 "결제 없음" 으로 읽혀 캐시를 돌려주고
 *    주문을 닫는데, 뒤이어 도착한 웹훅은 광고를 켜지 못한다 — **카드는 긁혔는데 광고는 없다.**
 *    주문을 만든 지 얼마 안 됐으면 닫지 않고 회수기(2시간 안전판까지 있다)에 맡긴다.
 *    그동안 손님이 8배를 결제하는 일은 lockedAdCash 게이트가 이미 막는다.
 */
const tooSoonToClose = (createdAt: string) => Date.now() - new Date(createdAt).getTime() < CONFIRM_UNPAID_MS;

/**
 * 잡아둔 캐시를 돌려준다.
 *
 * 🔴 주문 상태 전이와 잔액 복구는 **DB 함수 하나**가 한 트랜잭션으로 한다
 *    (release_ad_order_cash — 마이그레이션 20260805230000). 앱에서 두 문장으로 나누면
 *    그 사이에 프로세스가 죽었을 때 손님 캐시가 흔적 없이 사라진다.
 * 🔴 cash_used 를 0 으로 내리는 것이 반환의 핵심이다.
 *    ① 상태만 바꾸면, 뒤늦은 금액 불일치 통보가 EXPIRED 를 FAILED 로 되살렸을 때 같은
 *       cash_used 가 **다시 반환 대상**이 되어 캐시가 몇 번이든 불어났다(100원 결제 → 캐시 7만원).
 *    ② 화면(결제 내역·영수증)이 이 값으로 "광고 캐시 얼마 사용" 을 그린다. 돌려준 뒤에도
 *       0 이 아니면 쓰지도 않은 캐시를 썼다고 말하게 된다.
 * @param status  반환 뒤 주문 상태(그대로 두려면 현재 상태를 그대로 준다)
 * @param allowed 이 상태일 때만 손댄다 — 그사이 결제가 확인됐으면 아무것도 하지 않는다
 */
async function releaseOrderCash(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
  status: OrderStatus,
  allowed: readonly OrderStatus[] = ORDER_HOLDS_CASH,
  // 🔴 사유를 호출부가 준다. 고정 문구("결제되지 않아…")를 쓰면, **결제가 실제로 일어난** 경로
  //    (금액 불일치·공고 삭제)에서도 그 줄이 붙어 한 주문의 메모 두 줄이 서로를 부정한다 —
  //    정산 대조하는 사람이 돈이 오간 건을 "결제 안 됨" 으로 읽는다.
  why: (amount: string) => string = (a) => `결제되지 않아 광고 캐시 ${a}원을 돌려드렸습니다`,
): Promise<void> {
  const { data: returned, error } = await admin.rpc("release_ad_order_cash", {
    p_order: orderId, p_allowed: [...allowed], p_next: status,
  });
  if (error) {
    // 손님 캐시가 사라진 것이다. 로그만으로는 못 찾으니 주문에도 남긴다.
    console.error("광고 캐시 반환 실패 — 수동 확인 필요:", orderId, error.message);
    await appendOrderNote(admin, orderId, "광고 캐시 반환 실패 — 수동 확인 필요");
    return;
  }
  if (!returned) return; // 다른 요청이 먼저 돌려줬거나, 그사이 결제가 확인됐다
  await appendOrderNote(admin, orderId, why(returned.toLocaleString("ko-KR")));
}

/** 결제는 됐는데 광고를 못 켠 경우의 반환 사유 — "결제되지 않아" 라고 쓰면 거짓이다. */
const COULD_NOT_APPLY = (a: string) => `광고를 적용하지 못해 광고 캐시 ${a}원을 돌려드렸습니다`;

/**
 * 결제되지 않은 주문이 붙들고 있는 캐시를 돌려준다.
 *
 * 🔴 두 갈래다. 종전에는 "2시간 지난 것" 하나뿐이라, 결제창을 한 번 닫은 손님이 그동안
 *    캐시를 못 쓰고 **1주를 10,000원이 아니라 80,000원에** 결제하는 길이 열려 있었다.
 *    ① 포트원에 물어 "그 주문번호로 결제가 아예 없다" 가 확정되면 **10분** 만에 푼다.
 *       10분은 카드 결제창이 열려 있을 만한 시간을 넉넉히 넘긴 값이고, 승인이 났다면
 *       그 순간 포트원에 기록이 생기므로 진행 중인 결제의 캐시를 뺏지 않는다.
 *    ② 포트원 조회가 실패해도 **2시간**이 지나면 푼다(거래번호가 없는 주문만).
 *       외부 서비스가 죽었다고 손님 캐시를 무한정 잡아둘 수는 없다.
 */
async function reclaimStaleAdCash(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<void> {
  // 🔴 note 를 덮어쓰지 않는다. 여기 있는 주문에는 사고 기록이 남아 있을 수 있는데, 덮으면
  //    그 사고가 "결제되지 않았습니다" 라는 반대 사실로 바뀐다. 사유는 releaseOrderCash 가 덧붙인다.
  const now = Date.now();
  const { data: stale } = await admin
    .from("ad_orders")
    .select("id, merchant_uid, cash_used, created_at")
    .eq("buyer_id", userId)
    .in("status", [...ORDER_HOLDS_CASH])
    // 🔴 포트원 거래번호가 남은 주문은 건드리지 않는다 — **돈이 실제로 오간 주문**이다.
    //    전에는 이런 건까지 EXPIRED 로 덮고 "결제되지 않아 돌려드렸습니다" 를 붙여서,
    //    한 주문의 메모 두 줄이 서로를 부정하고 사고가 관리자 대기열에서 사라졌다.
    .is("imp_uid", null)
    .gt("cash_used", 0)
    .lt("created_at", new Date(now - CONFIRM_UNPAID_MS).toISOString())
    // 오래 묶인 것부터 푼다 — 정렬이 없으면 LIMIT 이 어떤 5건을 줄지 보장되지 않는다.
    .order("created_at", { ascending: true })
    // 🔴 이 루프는 결제 버튼을 누른 손님을 기다리게 하면서 돈다(주문마다 포트원 왕복 1회).
    //    lockedAdCash 게이트 때문에 실제로는 계정당 1건이지만, 상한을 못 박아 두지 않으면
    //    옛 데이터가 쌓인 계정 하나가 결제창을 영영 못 열게 된다.
    .limit(5);
  // 🔴 포트원 왕복을 **병렬로** 돌린다. 이 함수는 손님이 「결제하기」를 누른 뒤 실행되므로,
  //    순차로 돌면 그 왕복이 전부 대기 시간으로 쌓인다.
  await Promise.all((stale ?? []).map(async (o) => {
    // 🔴 2시간이 지났어도 **묻기는 한다.** 전에는 단축평가로 조회를 건너뛰어, 승인은 났는데
    //    콜백·웹훅이 둘 다 실패한 주문을 2시간 뒤 그냥 EXPIRED 로 죽였다
    //    (돈은 받고 광고는 못 준 건이 된다). 2시간 규칙은 **포트원이 대답을 못 할 때**의
    //    마지막 수단이지, 대답을 무시하는 규칙이 아니다.
    const p = await findPaidPayment(o.merchant_uid);
    // 🔴 승인된 결제가 잡혔는데 우리 주문에 거래번호가 없다 = 콜백도 웹훅도 못 받은 건이다.
    //    그대로 두면 회수기는 영원히 건너뛰고(캐시 반환 없음) 게이트는 계속 잠긴 것으로 세어
    //    **그 병원은 다시는 광고를 못 산다.** 거래번호를 남겨 두 범위에서 빼고, 관리자가 볼 수 있게 한다.
    if (p !== "notfound" && p !== null) {
      // 🔴 상태를 PREPARE 로 되돌린다. CANCELED 로 두면 관리자 대시보드의 어떤 카운터에도
      //    안 잡힌다(stale_orders 는 PREPARE 1시간 초과, failed_orders 는 FAILED 만 센다) —
      //    돈은 받고 광고는 못 준 건이 CANCELED 목록에 묻혀 아무도 모르게 된다.
      await admin.from("ad_orders")
        .update({ imp_uid: p.imp_uid, status: "PREPARE" })
        .eq("id", o.id).in("status", [...ORDER_HOLDS_CASH]).is("imp_uid", null);
      await appendOrderNote(admin, o.id, "결제가 확인됐으나 광고가 켜지지 않았습니다 — 수동 확인 필요");
      return;
    }
    const old = new Date(o.created_at).getTime() < now - STALE_ORDER_MS;
    if (!noPaymentHeld(p) && !(old && p === null)) return;
    await releaseOrderCash(admin, o.id, "EXPIRED");
  }));
}

/**
 * FAILED(금액 불일치)가 캐시를 붙든 채 남는 길을 쓸어 준다.
 *
 * 🔴 reclaimStaleAdCash 와 **따로** 둔다. 그쪽은 "잠긴 캐시가 있을 때만" 도는데, 잠김 판정
 *    (lockedAdCash)은 PREPARE·CANCELED 만 세므로 FAILED 뿐인 계정은 회수기가 아예 안 돈다 —
 *    같은 함수 안에 두었더니 정확히 필요한 상황에서 도달 불가였다.
 * 🔴 포트원 왕복이 없는 인덱스 질의 하나뿐이라 **항상** 돌려도 싸다.
 *    상태는 FAILED 그대로 두고 캐시만 돌려준다 — 관리자 「실패」 탭에서 사라지지 않는다.
 */
async function reclaimStuckFailedCash(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<void> {
  const { data: stuck } = await admin
    .from("ad_orders").select("id")
    .eq("buyer_id", userId).eq("status", "FAILED").gt("cash_used", 0).limit(5);
  // 주문끼리 독립이고 락 순서도 같다(ad_orders → profiles) — 병렬로 돌려 대기 시간을 줄인다.
  await Promise.all((stuck ?? []).map((o) => releaseOrderCash(admin, o.id, "FAILED", ["FAILED"], COULD_NOT_APPLY)));
}


/**
 * "결제가 끝내 일어나지 않았다" 가 확정된 주문을 닫는다 — 사유를 남기고 잡아둔 캐시를 돌려준다.
 * 카드 거절(포트원 status='failed')이 여기로 온다. FAILED(금액 불일치)와 달리 돈이 안 나갔으므로
 * 관리자 대기열에 쌓을 일이 아니고, 손님 캐시는 즉시 돌아가야 한다.
 */
async function markOrderUnpaid(
  admin: ReturnType<typeof createAdminClient>,
  order: { id: string; buyer_id: string | null; cash_used: number; created_at: string },
  note: string,
): Promise<void> {
  await appendOrderNote(admin, order.id, note);
  // 🔴 갓 만든 주문은 **닫지 않는다.** 카드사 결제창은 거절된 뒤에도 같은 주문번호로 재시도가
  //    되는데, 실패 통보가 재시도 성공보다 먼저 도착하는 순서가 있다. 그때 여기서 EXPIRED 로
  //    못 박으면 뒤이은 승인이 광고를 켜지 못한다(EXPIRED 는 되살리지 않는다) —
  //    카드는 긁혔는데 광고는 없는 최악이다. 사유만 남기고, 정리는 회수기에 맡긴다
  //    (회수기는 포트원에 "승인된 결제가 있나" 를 다시 물어 없을 때만 캐시를 돌려준다).
  if (tooSoonToClose(order.created_at)) return;
  if (order.cash_used > 0 && order.buyer_id) {
    await releaseOrderCash(admin, order.id, "EXPIRED");
    return;
  }
  // 캐시를 안 쓴 주문(또는 탈퇴 회원)은 상태만 닫는다. 되살아나면 안 되므로 EXPIRED 다.
  await admin.from("ad_orders").update({ status: "EXPIRED" }).eq("id", order.id).in("status", [...ORDER_HOLDS_CASH]);
}

/**
 * 금액 불일치 — **돈이 오간 정황이 있는 사고**를 기록한다(광고는 켜지 않는다).
 *
 * 🔴 상태 전이와 기록을 분리한다. 한 번의 UPDATE 로 묶으면 두 가지가 조용히 사라진다:
 *    ① 주문이 이미 EXPIRED·PAID 면 조건에 걸려 **0행** — imp_uid 도 사유도 어디에도 안 남고
 *       재시도도 오지 않는다. 정산 대조할 실마리가 통째로 없어진다.
 *    ② note 를 덮어쓰면 앞선 기록("광고 캐시 반환 실패 — 수동 확인 필요" 같은, 손님 돈이
 *       증발한 유일한 증거)이 지워진다.
 * 🔴 잡아둔 캐시는 여기서 돌려준다. 광고는 켜지지 않았는데 캐시까지 가져가면 손님이 두 번 잃는다.
 *    상태는 FAILED 로 **남겨 둔다** — /admin/orders 「실패」 탭에서 사람이 포트원과 대조할 사건이다.
 */
async function recordAmountMismatch(
  admin: ReturnType<typeof createAdminClient>,
  order: { id: string; buyer_id: string | null; cash_used: number },
  impUid: string,
  note: string,
): Promise<void> {
  await admin.from("ad_orders")
    .update({ status: "FAILED", imp_uid: impUid })
    .eq("id", order.id).in("status", [...ORDER_REVIVABLE]);
  // 상태를 못 바꿨더라도(EXPIRED·PAID) 거래번호는 반드시 남는다 — 없으면 그 결제를 찾지 못한다.
  await admin.from("ad_orders").update({ imp_uid: impUid }).eq("id", order.id).is("imp_uid", null);
  await appendOrderNote(admin, order.id, note);
  if (order.cash_used > 0 && order.buyer_id) {
    await releaseOrderCash(admin, order.id, "FAILED", ["FAILED"], COULD_NOT_APPLY);
  }
}

/**
 * **결제가 일어난 적 없는데** 캐시를 붙들고 있는 내 주문의 합계. 0 이 아니면 지금 사면 정가를 낸다.
 *
 * 🔴 `.is("imp_uid", null)` 이 반드시 있어야 한다 — 자동 회수(reclaimStaleAdCash)가 대상으로 삼는
 *    범위와 **정확히 같아야** 하기 때문이다. 거래번호가 붙은 주문은 회수기가 건너뛰므로, 여기에
 *    포함하면 그 병원은 "잠시 후 캐시가 돌아옵니다" 라는 안내를 받으며 **영원히 광고를 못 산다**.
 *    거래번호가 있다는 것은 그 캐시가 잠긴 게 아니라 이미 **쓰인** 것이다(웹훅이 그 주문을 켠다).
 */
async function lockedAdCash(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<number> {
  const { data } = await admin
    .from("ad_orders").select("cash_used")
    .eq("buyer_id", userId).in("status", [...ORDER_HOLDS_CASH]).is("imp_uid", null).gt("cash_used", 0);
  return (data ?? []).reduce((n, o) => n + o.cash_used, 0);
}

// 결제 전 주문 생성(서버가 금액 산정 — 클라 금액 신뢰 안 함). 클라가 받은 merchant_uid/amount로 IMP.request_pay.
// expectedPayable: 화면이 손님에게 보여 준 결제금액. 서버가 계산한 값과 다르면 결제창을 열지 않는다
//                  (캐시 잔액이 그사이 바뀐 경우 — 보여준 금액보다 많이 청구하는 일은 없어야 한다).
export async function prepareAdOrder(jobId: string, weeks: number, expectedPayable?: number): Promise<AdPrepare> {
  if (!iamportReady()) return { ok: false, error: "unavailable" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };
  const product = adProduct(weeks);
  if (!product) return { ok: false, error: "product" };
  const admin = createAdminClient();
  const hosp = await ownedJobHospital(admin, jobId, user.id);
  if (!hosp) return { ok: false, error: "not_owner" };

  // 🔴 마감일이 지난 공고에는 광고를 팔지 않는다. featured_until 을 아무리 길게 세워도
  //    노출 판정(jobs_listed.is_live · isOpenToSeekers)이 deadline 으로 먼저 걸러서
  //    **결제만 하고 한 번도 안 보이는** 광고가 된다(환불은 없다). 공고 등록(jobDeadline)은
  //    이미 지난 날짜를 막고 있었는데 구매 경로에만 그 검사가 없었다.
  if (hosp.deadline && hosp.deadline < todayKst(nowMs())) return { ok: false, error: "deadline" };

  // 🔴 회수는 **붙들린 캐시가 있을 때만** 돈다. 회수기는 주문마다 포트원 왕복이 붙는데,
  //    그 지연이 「결제하기」를 누른 손님의 대기 시간이다. 두 질의의 술어는 created_at 빼고
  //    같으므로, 잠긴 캐시가 0 이면 회수할 것도 없다 — 흔한 경우에서 외부 호출이 통째로 빠진다.
  await reclaimStuckFailedCash(admin, user.id);
  const lockedBefore = await lockedAdCash(admin, user.id);
  if (lockedBefore) await reclaimStaleAdCash(admin, user.id);

  // 🔴 직전 결제 시도가 캐시를 붙들고 있으면 **결제창을 열지 않는다.**
  //    전에는 그대로 진행돼, 화면이 「10,000원 결제하기」를 보여주고도 캐시가 0 이라
  //    새로고침 뒤엔 「80,000원 결제하기」가 됐다 — 안내 문구가 손님을 8배 결제로 데려갔다.
  //    회수는 위 reclaim 과 abandonAdOrder(포트원에 결제 유무를 직접 확인)가 한다.
  //    회수가 돌지 않았으면(잠긴 캐시 0) 같은 질의를 또 던지지 않는다.
  if (lockedBefore && (await lockedAdCash(admin, user.id))) return { ok: false, error: "cash_locked" };

  // 💰 캐시를 **여기서 실제로 뺀다.** 잔액이 모자라면 남은 만큼만 잡히고 그 값이 돌아온다.
  //    가입 캐시(70,000) < 1주 광고비(80,000) 라 첫 광고도 반드시 카드 결제가 붙는다.
  const { data: claimed, error: claimErr } = await admin.rpc("claim_ad_cash", { p_profile: user.id, p_want: product.amount });
  if (claimErr) return { ok: false, error: "db" };
  const cashUsed = claimed ?? 0;
  const payable = product.amount - cashUsed;
  // 여기서부터 실패하면 잡은 캐시를 반드시 돌려준다 — 안 그러면 손님 돈이 조용히 사라진다.
  // ⚠️ ponytail: 이 줄과 아래 insert 사이에서 프로세스가 죽으면(배포 중 종료 등) 잡은 캐시가
  //    주문 없이 사라진다 — reclaim 은 ad_orders 만 훑기 때문이다. 원장(ledger) 표를 두면
  //    막히지만 그 무게를 지금 질 이유가 없다(창이 수 ms, 최대 손실 1계정 지급액).
  //    대신 복구에 필요한 값을 전부 로그에 남긴다 — 고객센터가 이 줄로 되돌릴 수 있다.
  const giveBack = async () => {
    if (cashUsed <= 0) return;
    const { error } = await admin.rpc("release_ad_cash", { p_profile: user.id, p_amount: cashUsed });
    if (error) console.error("광고 캐시 반환 실패 — 수동 확인 필요:", user.id, cashUsed, error.message);
  };
  console.info("[ad] 광고 캐시 사용:", { profile: user.id, job: jobId, weeks, cashUsed, payable });

  // 🔴 0원은 PG 가 받지 않는다. 정상 경로에서는 생길 수 없지만, 관리자가 캐시를 얹어 주는 순간
  //    결제창이 조용히 실패한다 — 여기서 막는다.
  if (payable <= 0) { await giveBack(); return { ok: false, error: "cash_only" }; }
  // 🔴 화면이 "10,000원 결제하기" 라고 보여 줬는데 결제창에 80,000원이 뜨면 안 된다.
  if (expectedPayable !== undefined && expectedPayable !== payable) { await giveBack(); return { ok: false, error: "changed" }; }

  const merchant_uid = `ad_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const supply = Math.round(payable / 1.1);
  const { error } = await admin.from("ad_orders").insert({
    merchant_uid, job_id: jobId, hospital_id: hosp.id, buyer_id: user.id,
    // 🔴 days 는 산 기간 전체다. 무료 1주가 없어졌으니 결제한 만큼만 노출된다.
    // 🔴 amount 는 **카드로 청구하는 금액**이다(캐시 제외). 매출 집계가 캐시에 부풀지 않는다.
    tier: "standard", days: product.days, cash_used: cashUsed,
    supply_amount: supply, vat: payable - supply,
    amount: payable, status: "PREPARE",
  });
  if (error) { await giveBack(); return { ok: false, error: "db" }; }
  return { ok: true, merchant_uid, amount: payable, name: `널스넷 광고 ${weeks}주(${product.days}일)` };
}

// 결제 활성화(검증 통과/웹훅 공용, 멱등). 광고 노출 기간 연장.
// impUid=null은 실결제가 아닌 경우(관리자 테스트) — 포트원 거래번호 컬럼을 가짜 값으로 오염시키지 않는다.
// 성공 여부를 반환 — 호출부가 실패를 사용자/포트원에 알려 재시도되게 한다.
async function activateAdOrder(admin: ReturnType<typeof createAdminClient>, orderId: string, jobId: string, days: number, tier: string, impUid: string | null): Promise<boolean> {
  // 선점(CAS): PREPARE→PAID 전환에 성공한 요청만 기간을 연장한다. 조건부 update는 Postgres에서 원자적이라
  // 클라 콜백과 웹훅이 동시에 들어와도 연장은 정확히 1회. (먼저 연장하고 나중에 PAID로 올리면 재시도 때 2배 연장됨)
  const { data: claimed, error: claimErr } = await admin
    .from("ad_orders")
    // 🔴 note 는 지우지 않는다. 전에 실패했던 사유(금액 불일치 등)는 나중에 복구 활성화가
    //    성공해도 그때 무슨 일이 있었는지 알아야 할 기록이다.
    .update({ status: "PAID", imp_uid: impUid, paid_at: new Date().toISOString() })
    .eq("id", orderId)
    // 🔴 EXPIRED 는 **되살리지 않는다.** 결제되지 않아 캐시를 이미 돌려준 주문이라,
    //    여기서 켜 주면 캐시를 공짜로 가져간 광고가 된다(releaseOrderCash 참고).
    //    CANCELED 는 되살린다 — 콜백만 실패하고 승인은 났을 수 있다.
    //    FAILED 도 되살리지 않는다 — recordAmountMismatch 가 그 자리에서 캐시를 돌려주므로,
    //    켜 주면 캐시는 돌려받고 광고도 받는 이중 이득이 된다.
    .in("status", [...ORDER_REVIVABLE])
    .select("id");
  if (claimErr) return false;        // DB 오류 — 0행과 구분해야 한다(성공으로 착각하면 재시도가 끊긴다)
  if (!claimed?.length) {
    const { data: cur } = await admin.from("ad_orders").select("status").eq("id", orderId).maybeSingle();
    if (cur?.status === "PAID") return true; // 이미 다른 경로가 활성화 완료
    // 만료된 주문에 결제가 들어왔다 — 돈은 나갔는데 광고는 못 켠다. 반드시 사람이 봐야 한다.
    await appendOrderNote(admin, orderId, "결제가 확인됐지만 주문이 만료되어 광고를 켜지 못했습니다 — 수동 확인 필요");
    return false;
  }

  const { data: job } = await admin.from("jobs").select("featured_until, status").eq("id", jobId).maybeSingle();
  const now = Date.now();
  const base = job?.featured_until ? Math.max(now, new Date(job.featured_until).getTime()) : now;
  const until = new Date(base + days * DAY_MS).toISOString();
  const { data: updated, error: jobErr } = await admin
    .from("jobs")
    // 🔴 posted_at 은 **첫 게시(draft→open)일 때만** 찍는다. 전에는 연장 결제마다 오늘로 덮어써서,
    //    석 달 전 공고가 「2026-08-05 등록」으로 바뀌고 관리자 대시보드의 '오늘 등록 공고'가
    //    신규 0건인 날에도 올랐다(신규 유입 지표가 연장 건에 오염됐다).
    //    목록 상단 노출은 ad_live 정렬이 이미 보장하므로 잃는 것이 없다.
    .update({
      featured_until: until, ad_tier: tier, status: "open",
      ...(job?.status === "draft" ? { posted_at: new Date().toISOString() } : {}),
    })
    .eq("id", jobId)
    .select("id"); // 0행이면 error가 null이므로 반환행으로 실제 반영을 확인
  if (jobErr || !updated?.length) {
    // 되돌려 재시도 가능하게.
    // 🔴 imp_uid 는 **지우지 않는다.** 전에는 같이 비웠는데, 그 사이 웹훅이 "이미 PAID" 를 보고
    //    200 을 돌려줘 재시도가 끊긴 경우 **승인은 났는데 거래번호도 사유도 없는 PREPARE** 만 남았다.
    //    거래번호가 있어야 관리자가 포트원에서 그 결제를 찾아 손으로 켤 수 있다.
    await admin.from("ad_orders").update({ status: "PREPARE", paid_at: null }).eq("id", orderId);
    await appendOrderNote(admin, orderId, "결제는 확인됐으나 광고 적용에 실패 — 수동 확인 필요");
    return false;
  }
  // 💰 캐시는 주문을 만들 때 이미 뺐다(prepareAdOrder 의 claim_ad_cash). 여기서 또 빼지 않는다 —
  //    그게 같은 캐시를 두 번 쓰던 원인이었다.
  return true;
}

/**
 * 🔴 넓은 string 이 아니라 리터럴 유니온이다(AdPrepareError 와 같은 이유).
 *    화면 두 곳(AdPurchase · /mypage/jobs/ad/return)이 이 값으로 문구를 고르는데, 오타 하나면
 *    조용히 일반 분기로 떨어져 **돈이 나간 금액 불일치가 "확인 중" 으로 묻힌다.**
 */
export type AdVerifyError = "auth" | "order" | "verify" | "canceled" | "notpaid" | "declined" | "amount" | "activate";
type AdVerify = { ok: true; orderId: string } | { ok: false; error: AdVerifyError };

// 결제 후 서버 검증(금액 위변조 차단) → 활성화.
export async function verifyAdPayment(impUid: string, merchantUid: string): Promise<AdVerify> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };
  const admin = createAdminClient();
  const { data: order } = await admin.from("ad_orders").select("id, buyer_id, job_id, days, tier, amount, status, cash_used, created_at").eq("merchant_uid", merchantUid).maybeSingle();
  if (!order || order.buyer_id !== user.id || !order.job_id) return { ok: false, error: "order" };
  // 🔴 여기서 `status === 'PAID'` 로 단축하지 않는다 — 그 단축이 웹훅 쪽에서 취소 통보를 삼키던 원인이고,
  //    두 경로가 서로 다른 단축 규칙을 갖는 순간 다음 사고가 준비된다. 판정은 decidePayment 한 곳에서만.
  const pay = await getPayment(impUid);
  if (!pay || pay === "notfound" || pay.merchant_uid !== merchantUid) {
    // 🔴 이미 활성화된 주문이면 포트원 조회 실패로 "검증 실패" 를 띄우지 않는다. PAID 단축을 없앤 대가로
    //    포트원이 잠깐 죽었을 때 **이미 산 사람에게** 실패 화면을 보이게 됐다 — 여기서 그것만 되돌린다.
    if (order.status === "PAID") return { ok: true, orderId: order.id };
    return { ok: false, error: "verify" };
  }
  // 판단은 순수 함수가 한다(lib/paymentFlow.ts). 여기서는 그 결정을 DB 에 반영만 한다.
  const decision = decidePayment(
    { status: pay.status, amount: pay.amount, cancelAmount: pay.cancel_amount },
    order.amount,
    order.status,
  );
  if (decision.do === "done") return { ok: true, orderId: order.id };
  if (decision.do === "record_cancel") {
    // 여기서 실패해도 손님에게 시킬 일이 없다 — 웹훅이 같은 취소를 다시 들고 와 기록한다.
    if ((await appendOrderNote(admin, order.id, decision.note)) === "retry") {
      console.error("appendOrderNote 실패 — 웹훅 재시도에 기댄다:", order.id);
    }
    return { ok: false, error: "canceled" };
  }
  if (decision.do === "nothing") return { ok: false, error: "notpaid" };
  if (decision.do === "declined") {
    await markOrderUnpaid(admin, order, decision.note);
    return { ok: false, error: "declined" };
  }
  if (decision.do === "fail") {
    // 🔴 전에는 금액 불일치에서 그냥 반환했다 — 주문은 PREPARE 로 남고 **돈은 나갔는데 흔적이 없었다.**
    //    imp_uid 를 반드시 같이 적는다. 거래번호가 없으면 관리자가 포트원에서 그 결제를 찾지 못해
    //    대조도 이의제기도 못 한다(고객센터가 받는 문의가 정확히 이 상황이다).
    // 상태 전이·기록·캐시 반환을 한 곳에서 한다(recordAmountMismatch 주석에 이유가 있다).
    await recordAmountMismatch(admin, order, impUid, decision.note);
    return { ok: false, error: "amount" };
  }
  // 🔴 여기까지 왔으면 activate 뿐이다. 나중에 decidePayment 에 분기가 하나 늘었는데 위에서 처리를
  //    빠뜨리면, 조용히 이 아래로 흘러 **광고가 켜진다.** 그 사고를 여기서 막는다.
  if (decision.do !== "activate") {
    console.error("verifyAdPayment: 처리되지 않은 결정", decision);
    return { ok: false, error: "verify" };
  }
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
  // 화면은 이미 마감일 지난 공고에서 이 폼을 숨기지만, 폼 액션은 화면을 신뢰하지 않는다.
  // 켜 봐야 노출 판정(is_live)이 마감일로 걸러 아무 데도 안 나온다 — 테스트가 성립하지 않는다.
  if (hosp.deadline && hosp.deadline < todayKst(nowMs())) redirect("/mypage/jobs?error=deadline");

  const merchant_uid = `admintest_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const { data: order } = await admin.from("ad_orders").insert({
    merchant_uid, job_id: jobId, hospital_id: hosp.id, buyer_id: user.id,
    tier: "admin_test", days: product.days, supply_amount: 0, vat: 0, amount: 0, status: "PREPARE",
  }).select("id").single();
  // 실패는 공고 관리 화면으로 — 광고 페이지에는 에러 배너가 없어 실패가 조용히 묻힌다.
  if (!order) redirect("/mypage/jobs?error=1");
  // 관리자가 결제 없이 광고를 켜는 일이다. 남기지 않으면 매출 0원짜리 광고가 누구 손에서 나왔는지 알 수 없다.
  // 실패하면 throw 되어 활성화까지 가지 않는다 — 기록 없는 조치를 만들지 않는다(lib/data/admin.ts).
  await logAdmin({
    action: "ad.free_activate",
    targetTable: "ad_orders",
    targetId: order.id,
    reason: `관리자 테스트 광고 ${product.weeks}주 활성 (공고 ${jobId})`,
  });
  if (!(await activateAdOrder(admin, order.id, jobId, product.days, "admin_test", null))) redirect("/mypage/jobs?error=1");
  redirect(`/mypage/jobs/ad/receipt/${order.id}`);
}

/**
 * 결제창을 손님이 그냥 닫았을 때 — **결제가 일어나지 않은** 주문을 정리한다.
 *
 * 🔴 이것은 "광고 취소" 가 아니다. 돈이 나가지 않았고 광고도 켜진 적이 없다.
 *    산 광고를 무르는 기능은 없고 만들지 않는다(오너 확정 2026-08-04).
 *
 * 🔴 전에는 클라이언트가 문구만 띄우고 **서버에 아무것도 안 알렸다.** 그래서 결제창을 열었다
 *    닫은 사람마다 PREPARE 주문이 하나씩 영구히 쌓였고, 나중에 그 목록을 보는 사람은
 *    "돈이 나갔는데 광고가 안 나간 건" 과 "그냥 창을 닫은 건" 을 구분할 수 없었다.
 *
 * 🔴 status='PREPARE' 조건이 핵심이다. 웹훅이 먼저 도착해 이미 PAID 가 된 주문을
 *    뒤늦은 통보가 덮어쓰면, 돈은 받았는데 결제 안 한 것으로 기록되는 꼴이 된다.
 */
export async function abandonAdOrder(merchantUid: string): Promise<OrderStatus | "canceled" | "none"> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "none";
  const admin = createAdminClient();
  const { data: canceled } = await admin
    .from("ad_orders")
    .update({ status: "CANCELED" })
    .eq("merchant_uid", merchantUid)
    .eq("buyer_id", user.id)   // 남의 주문을 건드리지 못하게
    .eq("status", "PREPARE")
    // 🔴 거래번호가 붙은 PREPARE 는 **카드로 돈은 받은** 주문이다(웹훅의 공고 삭제 분기,
    //    활성화 롤백이 그렇게 남긴다). CANCELED 로 넘기면 관리자 stale_orders(PREPARE 만 센다)
    //    에서 빠져 사라진다 — 회수기·게이트와 같은 술어로 여기서도 건드리지 않는다.
    .is("imp_uid", null)
    .select("id, cash_used, created_at");
  const order = canceled?.[0];
  // 🔴 아무것도 안 바꿨으면 **현재 상태를 그대로** 돌려준다. 모바일 복귀 화면이 이 값으로 문구를
  //    고르는데, "PAID 냐 아니냐" 로만 뭉갰더니 ① 이미 PAID 인 주문을 그 주소로 다시 열면
  //    광고가 나가는 중인 손님에게 "요금도 청구되지 않았습니다" 를 보여줬고, ② 화면을 **새로고침**
  //    하면(첫 방문이 이미 CANCELED 로 바꿔 놨으므로) 멀쩡한 자기 주문을 "주문을 찾지 못했습니다 —
  //    고객센터로 문의해 주세요" 라고 안내했다. 새로고침은 결제 결과 화면에서 가장 흔한 조작이다.
  if (!order) {
    const { data: cur } = await admin.from("ad_orders")
      .select("status").eq("merchant_uid", merchantUid).eq("buyer_id", user.id).maybeSingle();
    // 🔴 단언(as)이 아니라 **런타임 검사**다. 모르는 상태를 그대로 통과시키면 복귀 화면이
    //    그것을 전부 "결제가 완료되지 않았습니다 / 요금도 청구되지 않았습니다" 로 떨어뜨려,
    //    돈이 나갔을 수도 있는 주문에 거짓말을 한다.
    return isOrderStatus(cur?.status) ? cur.status : "none";
  }

  // 🔴 문구는 고정이고, **덮어쓰지 않고 덧붙인다.**
  //    ① 클라이언트가 준 문자열(rsp.error_msg)을 넣으면 운영자가 읽는 칸에 시스템 문구를 위장 주입할 수 있다.
  //    ② 전에는 note 를 통째로 덮어써서, 웹훅이 먼저 남긴 취소·사고 기록이 이 한 줄에 지워졌다.
  //    ③ 단정하지 않는다 — 승인은 났는데 콜백만 실패했을 수 있다(그 경우 웹훅이 PAID 로 올린다).
  await appendOrderNote(admin, order.id, "결제창이 닫혀 결제 완료를 확인하지 못함");
  if (order.cash_used <= 0) return "canceled";

  // 💰 잡아둔 캐시를 **지금** 돌려준다 — 단, 포트원에 그 주문번호로 결제가 정말 없을 때만.
  //
  // 🔴 전에는 여기서 안 돌려주고 2시간 뒤 회수에 맡겼다. 그 2시간 동안 잔액이 0 이라
  //    화면은 「10,000원 결제하기」를 「80,000원 결제하기」로 바꿔 보여줬고, 다시 결제한 손님은
  //    **7만원을 더 냈다**(환불은 없다). 게다가 회수는 그 손님이 *또* 결제를 준비할 때만 도니,
  //    광고를 한 번만 사는 병원은 가입 캐시를 영영 못 썼다.
  // 🔴 그렇다고 무조건 돌려주면 "승인은 났는데 콜백만 실패" 한 건이 캐시를 공짜로 쓴 광고가 된다.
  //    그래서 포트원에 직접 묻고, **돈이 남아 있지 않은 것이 확정될 때만** 돌려준다
  //    (noPaymentHeld 참고). 조회 실패면 회수에 맡긴다.
  // 🔴 유예를 여기 두면 안 된다. 이 주문은 **몇 초 전에** 만들어진 것이라 나이 조건이 항상 참이고,
  //    그러면 즉시 반환이 통째로 죽어 결제창을 한 번 닫은 손님이 10분간 광고를 못 산다
  //    (그 10분이 바로 이 함수가 없애려던 잠금이다). 판정은 포트원 대답으로 한다 —
  //    "승인된 결제 없음" 이 확정이면 그 자리에서 돌려주고, 대답을 못 얻으면 회수기에 맡긴다.
  if (!noPaymentHeld(await findPaidPayment(merchantUid))) return "canceled";
  await releaseOrderCash(admin, order.id, "EXPIRED");
  return "canceled";
}

/**
 * 주문 메모에 한 줄 **덧붙인다**(덮어쓰지 않는다).
 *
 * 🔴 취소·부분취소 기록에 쓴다. 광고는 건드리지 않는다 (오너 확정 2026-08-04: 한번 구입하면 취소 없다).
 *    취소 통보에 광고를 자동으로 내리면, 광고를 올리고 10분 만에 사람을 구한 병원이
 *    카드사에 전화해 승인취소를 걸어 **노출은 받고 돈은 안 내는** 길이 열린다.
 *    약관 제9조가 환불하지 않는다고 이미 못박았으므로, 취소 통보는 자동 처리 대상이 아니라
 *    사람이 대응할 **사건**이다. 상태도 그대로 둔다 — 광고가 나가는 중인데 CANCELED 로 내리면
 *    화면이 사실과 어긋난다.
 *
 * 🔴 상태로 거르지 않는다. 전에는 `.eq("status","PAID")` + `.is("note", null)` 이 걸려 있어서
 *    ① PAID 가 아닌 주문의 취소 ② 메모가 이미 있는 주문의 2차 취소(부분취소 뒤 전액취소)가
 *    **조용히 사라졌다.** 이 함수가 막으려던 게 정확히 그거다. 모르는 것이 제일 나쁘다.
 *
 * 같은 문구가 이미 있으면 다시 붙이지 않는다 — 중복 웹훅에 같은 줄이 쌓이지 않게.
 *
 * ponytail: 읽고-쓰기라 원자적이지 않다. 같은 취소 웹훅 둘이 정확히 동시에 오면 같은 줄이 두 번 붙는다.
 *   취소는 드물고 결과도 "메모에 중복 줄" 이라 무해해서 락을 걸지 않았다. 정확성이 필요해지면
 *   note 를 별도 표(ad_order_events)로 옮기고 append 를 insert 로 바꾼다.
 */
async function appendOrderNote(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
  line: string,
): Promise<"ok" | "retry"> {
  const { data: cur, error: readErr } = await admin
    .from("ad_orders").select("note").eq("id", orderId).maybeSingle();
  if (readErr) return "retry";
  const prev = cur?.note ?? "";
  if (prev.includes(line)) return "ok"; // 중복 통보
  const { error } = await admin
    .from("ad_orders")
    // 🔴 slice(-NOTE_MAX) — **뒤에서** 자른다. 앞에서 자르면 길이가 한계에 닿는 순간
    //    방금 붙인 최신 사고가 잘려나가고, 그러고도 "ok" 를 돌려줘 조용히 사라진다.
    .update({ note: `${prev ? `${prev}\n` : ""}🔴 ${line}`.slice(-NOTE_MAX) })
    .eq("id", orderId);
  return error ? "retry" : "ok";
}

// 포트원 웹훅(서버-투-서버) — 클라 콜백 실패 대비. imp_uid로 재검증 후 활성화·취소.
// 반환값이 재시도 여부를 가른다: "retry"만 5xx로 응답해 포트원이 다시 보내게 하고,
// 다시 보내도 결과가 같은 경우("ok"/"ignored")는 200으로 끊는다 — 안 그러면 영원히 재시도한다.
export async function iamportWebhook(impUid: string, merchantUid: string): Promise<"ok" | "ignored" | "retry"> {
  const admin = createAdminClient();
  const { data: order } = await admin.from("ad_orders").select("id, buyer_id, job_id, days, tier, amount, status, cash_used, created_at").eq("merchant_uid", merchantUid).maybeSingle();
  if (!order) return "ignored"; // 우리 주문이 아님

  // 🔴 여기서 `order.status === 'PAID'` 로 먼저 끊으면 안 된다 — 취소 웹훅이 바로 그 경우로 온다.
  //    그 한 줄 때문에 카드사 승인취소가 나도 우리 쪽에 흔적이 하나도 안 남았다.
  //    (광고를 내리려는 게 아니다 — 광고는 유지한다. 취소가 일어났다는 **사실을 아는 것**이 목적이다.)
  const pay = await getPayment(impUid);
  if (!pay) return "retry"; // 포트원 조회 자체가 실패 — 일시 장애일 수 있으니 재시도
  if (pay === "notfound" || pay.merchant_uid !== merchantUid) return "ignored"; // 없는 거래·위조 웹훅

  const decision = decidePayment(
    { status: pay.status, amount: pay.amount, cancelAmount: pay.cancel_amount },
    order.amount,
    order.status,
  );
  if (decision.do === "done") return "ok";
  if (decision.do === "nothing") return "ignored";
  if (decision.do === "record_cancel") return appendOrderNote(admin, order.id, decision.note);
  if (decision.do === "declined") {
    // 재시도해도 결과는 같다. 캐시를 돌려주고 주문을 닫는다(카드 거절은 사람이 볼 사건이 아니다).
    await markOrderUnpaid(admin, order, decision.note);
    return "ignored";
  }
  if (decision.do === "fail") {
    // 재시도해도 결과는 같다("ignored"). 다만 조용히 버리지 않고 사람이 볼 수 있게 남긴다.
    await recordAmountMismatch(admin, order, impUid, decision.note);
    return "ignored";
  }
  // 🔴 여기까지 왔으면 activate 뿐이다. decidePayment 에 분기가 늘었는데 위에서 처리를 빠뜨리면
  //    조용히 이 아래로 흘러 **광고가 켜진다.** 그 사고를 여기서 막는다.
  if (decision.do !== "activate") {
    console.error("iamportWebhook: 처리되지 않은 결정", decision);
    return "ignored";
  }
  // 🔴 공고가 사라진 주문(job_id null — 공고 삭제 시 set null)이라도 **돈은 들어왔다.**
  //    전에는 맨 위에서 "ignored" 로 끊어 광고도 기록도 없이 결제만 남았다.
  //    기록 실패는 반드시 "retry" 로 올린다 — 200 으로 끊으면 포트원이 다시 안 보내고 결제가 영영 미기록이다.
  if (!order.job_id) {
    // 🔴 거래번호를 함께 남긴다. 없으면 이 주문은 "그냥 결제 안 된 PREPARE" 와 구분되지 않아
    //    2시간 뒤 자동 회수가 "결제되지 않아 캐시를 돌려드렸습니다" 로 덮어 버린다(돈은 들어왔는데).
    await admin.from("ad_orders").update({ imp_uid: impUid }).eq("id", order.id).is("imp_uid", null);
    const r = await appendOrderNote(admin, order.id, `결제됐으나 대상 공고가 이미 삭제됨(${pay.amount.toLocaleString("ko-KR")}원)`);
    // 🔴 광고를 켤 대상이 없어졌으니 잡아둔 캐시는 돌려준다. 상태는 PREPARE 로 **남긴다** —
    //    관리자 대시보드의 stale_orders(PREPARE 1시간 초과)에 계속 잡혀야 카드로 받은 돈을
    //    사람이 처리한다. EXPIRED 로 닫으면 그 목록에서 사라진다.
    if (order.cash_used > 0 && order.buyer_id) {
      // 🔴 allowed 를 ["PREPARE"] 로 좁히면 안 된다. 손님이 결제창을 닫아 CANCELED 가 된 뒤
      //    공고가 지워지고 뒤늦게 결제가 확인되는 순서가 있는데, 그때 0행이 되어 캐시가 남는다.
      //    바로 위에서 imp_uid 를 채웠으므로 회수기·게이트의 `is("imp_uid", null)` 에서도 빠지고,
      //    관리자 stale_orders(PREPARE 만 센다)에도 안 잡혀 **흔적 없이 잠긴다.**
      //    다음 상태는 PREPARE 로 둔다 — 카드로 받은 돈을 사람이 처리하도록 목록에 남겨야 한다.
      await releaseOrderCash(admin, order.id, "PREPARE", ORDER_HOLDS_CASH, COULD_NOT_APPLY);
    }
    return r === "retry" ? "retry" : "ignored";
  }
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
