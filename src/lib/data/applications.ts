import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/data/user";
import { SHEET_COLS, WORK_COLS, type ResumeSheetFields, type WorkExperience } from "@/lib/data/resume";
import { isOpenToSeekers, type JobStatus } from "@/lib/jobState";
import { nowMs } from "@/lib/date";

/**
 * 지원 상태 — DB의 check 제약(20260723140000)과 같은 집합.
 * 문자열 대신 이 타입을 쓰면 상태를 추가할 때 라벨·색·화면 분기 누락을 컴파일이 잡는다.
 */
export type AppStatus = "submitted" | "viewed" | "accepted" | "rejected" | "withdrawn";

export const STATUS_LABEL: Record<AppStatus, string> = {
  submitted: "지원완료",
  viewed: "열람됨",
  accepted: "합격",
  rejected: "불합격",
  withdrawn: "지원취소",
};

/** 상태 배지 색. 병원 화면은 '미확인(submitted)'만 눈에 띄게 덮어쓴다. */
export const STATUS_TONE: Record<AppStatus, string> = {
  submitted: "bg-slate-100 text-slate-600",
  viewed: "bg-blue-100 text-blue-700",
  accepted: "bg-teal-100 text-teal-800",
  rejected: "bg-red-100 text-red-700",
  // 회색이라도 대비는 지킨다(slate-400은 배경 대비 2.4:1로 읽기 어렵다). '지원완료'와 배경을 달리해 구분.
  withdrawn: "bg-slate-200 text-slate-700",
};

/** 상태 전부 — 상태 칩·필터가 이 순서로 늘어선다(진행 순서). */
export const ALL_STATUSES = ["submitted", "viewed", "accepted", "rejected", "withdrawn"] as const satisfies readonly AppStatus[];

/** 주소창으로 들어온 문자열을 상태로 좁힌다(오타·위조 차단). */
export const isAppStatus = (s: string): s is AppStatus => ALL_STATUSES.some((v) => v === s);

/** 진행 중인 지원만 취소할 수 있다(합격·불합격 후에는 되돌릴 게 없다). 서버 액션과 화면이 같은 값을 쓴다. */
export const CANCELABLE = ["submitted", "viewed"] as const satisfies readonly AppStatus[];

/** 병원이 지정할 수 있는 상태. 'withdrawn'은 지원자만, 'submitted'로 되돌리기는 없다. */
export const HOSPITAL_SETTABLE = ["viewed", "accepted", "rejected"] as const satisfies readonly AppStatus[];

/** 폼으로 들어온 문자열을 병원이 지정 가능한 상태로 좁힌다(오타·위조 차단). */
export const isHospitalStatus = (s: string): s is (typeof HOSPITAL_SETTABLE)[number] =>
  HOSPITAL_SETTABLE.some((v) => v === s);

// ponytail: 목록은 한 번에 이만큼만. 페이지 나누기는 지원자가 실제로 쌓이면(1단계) 붙인다.
// 잘렸는지는 화면에서 알려준다 — 조용히 자르면 "전부 봤다"고 착각한다.
export const LIST_LIMIT = 200;

export type MyApplication = {
  id: string;
  status: AppStatus;
  message: string | null;
  created_at: string;
  updated_at: string;
  job: { id: string; title: string; hospital: { name: string } | null } | null;
  job_id: string;
  /** 그 공고가 지금도 구직자에게 열려 있는가 — '다시 지원'·제목 링크를 그릴지 정한다. */
  jobOpen: boolean;
};

// 간호사 — 내가 지원한 내역.
// 공고가 마감(status != open)되면 RLS 때문에 조인 결과가 null이 된다 → 제목·병원명이 통째로 사라진다.
// 그래서 **내 지원 건의 job_id에 한해서만** 서버 권한으로 이름을 채워 넣는다(다른 공고는 조회하지 않는다).
export async function getMyApplications(): Promise<MyApplication[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("applications")
    .select("id,status,message,created_at,updated_at,job_id,job:jobs(id,title,hospital:hospitals(name))")
    .eq("applicant_id", user.id)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT)
    .returns<MyApplication[]>();
  const rows = data ?? [];
  if (rows.length === 0) return rows; // 지원 0건이면 아래 두 조회를 아예 보내지 않는다

  const missing = rows.filter((r) => !r.job).map((r) => r.job_id);
  if (missing.length > 0) {
    const { data: closed } = await createAdminClient()
      .from("jobs").select("id,title,hospital:hospitals(name)").in("id", missing)
      .returns<Array<{ id: string; title: string; hospital: { name: string } | null }>>();
    const byId = new Map((closed ?? []).map((j) => [j.id, j]));
    rows.forEach((r) => { if (!r.job) r.job = byId.get(r.job_id) ?? null; });
  }

  // 🔴 공고가 지금도 열려 있는지 함께 판정한다.
  //    이게 없어서 화면은 취소한 지원에 '다시 지원' 버튼을 무조건 그렸고, 누르면
  //    404 가 났다 — 직접등록 공고는 게시 7일(또는 광고 기간)만 살아 있기 때문이다.
  //    저장한 공고 화면은 이미 같은 함수(isOpenToSeekers)로 걸러내고 있었다 — 두 화면의 규칙을 맞춘다.
  const now = nowMs();
  const { data: live, error: liveErr } = await createAdminClient()
    .from("jobs").select("id,status,source,posted_at,featured_until,deadline")
    .in("id", rows.map((r) => r.job_id))
    .returns<Array<{ id: string; status: JobStatus; source: string; posted_at: string; featured_until: string | null; deadline: string | null }>>();
  // 조회 자체가 실패하면 지원 내역 **전부**가 '마감'으로 보이고 공고 링크가 사라진다 →
  // 열린 쪽으로 기울인다(링크를 눌렀을 때 404 화면은 이유를 설명한다). 원인은 로그에 남긴다.
  if (liveErr) {
    console.error("getMyApplications(job state) failed:", liveErr.message);
    rows.forEach((r) => { r.jobOpen = true; });
    return rows;
  }
  const openIds = new Set((live ?? []).filter((j) => isOpenToSeekers(j, now)).map((j) => j.id));
  rows.forEach((r) => { r.jobOpen = openIds.has(r.job_id); });
  return rows;
}

// 마이페이지 카드 배지용 — 목록 전체를 끌어오지 않고 개수만 센다(body 0바이트, 인덱스만 탄다).
export async function countMyApplications(): Promise<number> {
  const user = await getSessionUser();
  if (!user) return 0;
  const supabase = await createClient();
  const { count } = await supabase.from("applications").select("id", { count: "exact", head: true }).eq("applicant_id", user.id);
  return count ?? 0;
}

/**
 * 간호사가 이 공고에 넣어둔 지원(공고 상세의 '지원완료' 표시 + **그 자리에서 취소**용).
 * 취소한 지원은 없는 것으로 본다 — 다시 지원할 수 있어야 한다.
 *
 * boolean 이 아니라 행을 돌려주는 이유: 전에는 "지원 완료" 옆에 지원 내역으로 가는 링크만 있어서,
 * 취소하려면 화면을 옮겨야 했다. 어차피 이 쿼리가 그 행을 읽고 있었으므로 id·상태를 버리지 않고
 * 넘겨 같은 자리에서 취소하게 한다(구 널스넷에서 취소가 숨어 있던 것이 이탈 원인 — 오너 확인).
 */
export type JobApplicationState = { id: string; status: AppStatus };

export async function myApplication(jobId: string): Promise<JobApplicationState | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications").select("id,status")
    .eq("job_id", jobId).eq("applicant_id", user.id).maybeSingle();
  // 조회가 실패하면 '지원 안 함'으로 보여 폼이 다시 뜨고, 눌러도 액션이 dup으로 되돌린다 → 원인을 남긴다.
  if (error) console.error("myApplication failed:", error.message);
  if (!data || data.status === "withdrawn") return null;
  return { id: data.id, status: data.status as AppStatus };
}

/** 병원이 보는 지원자 이력서 전문 — 본인 화면·인쇄 서식과 같은 항목(+ 어느 회원인지). */
export type ApplicantResume = ResumeSheetFields & { profile_id: string };

/**
 * 목록 카드에 실제로 그리는 항목만. 학력·희망급여·희망고용형태는 전문 보기에서만 필요하다.
 * 타입과 select 문자열을 이 배열 하나에서 뽑는다(둘이 어긋나면 화면이 런타임에 깨진다).
 */
// 병원이 지원자를 걸러낼 때 실제로 보는 것 — 근무형태가 안 맞으면 나머지는 보지도 않는다.
// 🔴 email 을 반드시 포함한다. 이게 빠져 있어서 목록은 이메일이 있는 지원자도
//    "연락처 미입력"으로 표시하고 연락 버튼을 감췄다 — 이력서 전문 보기로 들어가면
//    서식에는 이메일이 분명히 찍혀 있었다. 담당자는 연락 가능한 사람을 걸러버렸다.
const CARD_FIELDS = [
  "profile_id", "name", "phone", "email", "license_type", "career_level", "experience_years",
  "certifications", "shift_types", "night_available", "specialties", "desired_location", "intro",
] as const satisfies readonly (keyof ApplicantResume)[];

export type ApplicantCardResume = Pick<ApplicantResume, (typeof CARD_FIELDS)[number]>;

type ReceivedBase = {
  id: string;
  status: AppStatus;
  message: string | null;
  created_at: string;
  applicant_id: string;
  job: { id: string; title: string } | null;
};

/** 지원자 1건(이력서 전문 + 경력) — 인쇄·상세용 */
export type ReceivedApplication = ReceivedBase & { resume: ApplicantResume | null; work: WorkExperience[] };
/** 지원자 목록의 한 줄 — 카드에 필요한 만큼만 */
export type ApplicantListItem = ReceivedBase & {
  resume: ApplicantCardResume | null;
  /** 병원만 보는 메모(application_notes). 지원자에게는 절대 안 간다 — 테이블이 분리돼 있다. */
  memo: string;
  memoUpdatedAt: string | null;
};

const RESUME_COLS = `profile_id,${SHEET_COLS}`;
const CARD_COLS = CARD_FIELDS.join(",");
const APP_COLS = "id,status,message,created_at,applicant_id,job:jobs(id,title)";

/** 지원자 목록 한 페이지 — 500건 규모에서 스크롤로는 관리가 안 된다. */
export const APPLICANTS_PER_PAGE = 25;

export type ApplicantFilters = {
  jobId?: string;
  /** 상태 칩. 미지정이면 전부(지원취소 포함) */
  status?: AppStatus;
  /** 이름 부분일치 — 담당자가 "김간호" 로 찾는다 */
  q?: string;
};

/** 상태별 인원 — 칩에 숫자를 달아 "미확인 12" 를 보고 바로 누르게 한다. */
export type ApplicantCounts = Partial<Record<AppStatus, number>> & { all: number };

/**
 * 병원 — 내 공고에 들어온 지원자(+이력서 카드 항목 + 메모). RLS 로 소유 공고만.
 *
 * 목록을 여는 것만으로 '열람됨'으로 바꾸지 않는다 — 실제로 보지 않았는데 지원자에게 열람으로
 * 표시되고, 병원 입장에서도 "아직 안 본 지원자"를 구분할 수 없게 된다. 열람 처리는 화면의 버튼으로.
 *
 * 🔴 이름 검색은 applications 가 아니라 resumes 에 걸린다(이름이 거기 있다).
 *    RLS 가 "내 공고 지원자" 로 한정해 줄 것 같지만 **아니다** — SELECT 정책은 OR 합집합이라
 *    광고 중인 병원에게는 resumes_select_advertiser 가 공개 이력서 전부를 연다. 그대로 두면
 *    상한(1000)이 남의 이력서로 차서 **내 지원자가 검색에서 조용히 빠진다**.
 *    그래서 먼저 내 지원자 목록으로 좁힌 뒤 그 안에서만 이름을 찾는다.
 */
export async function getReceivedApplications(
  f: ApplicantFilters = {},
  page = 1,
): Promise<{ rows: ApplicantListItem[]; total: number; counts: ApplicantCounts; searchTruncated: boolean }> {
  const user = await getSessionUser();
  if (!user) return { rows: [], total: 0, counts: { all: 0 }, searchTruncated: false };
  const supabase = await createClient();

  // 상태 칩 숫자 — 목록 필터와 무관하게 "이 공고 전체" 기준으로 센다(칩을 눌러도 숫자가 안 흔들리게).
  //
  // 🔴 행을 실어와 JS 로 세면 안 된다. PostgREST 는 supabase/config.toml 의 max_rows(1000)를
  //    **하드 상한**으로 걸어, 지원자가 1000명을 넘는 순간 에러 없이 잘리고 칩 숫자가 조용히
  //    틀린다(이 저장소의 getSitemapJobs 에 같은 함정 주석이 있다). 정작 이 화면은 500건 이상을
  //    관리하려고 만든 것이라 그 지점에서 바로 깨진다.
  //    → head:true + count:"exact" 로 **개수만** 받는다(body 0바이트, 상한과 무관).
  const countOf = async (status?: AppStatus) => {
    let cq = supabase.from("applications").select("id", { count: "exact", head: true });
    if (f.jobId) cq = cq.eq("job_id", f.jobId);
    if (status) cq = cq.eq("status", status);
    const { count } = await cq;
    return count ?? 0;
  };
  const [allCount, ...perStatus] = await Promise.all([countOf(), ...ALL_STATUSES.map((st) => countOf(st))]);
  const counts: ApplicantCounts = { all: allCount };
  ALL_STATUSES.forEach((st, i) => { if (perStatus[i] > 0) counts[st] = perStatus[i]; });

  // 이름 검색 — 매칭되는 이력서가 하나도 없으면 조회를 더 하지 않는다.
  let nameIds: string[] | null = null;
  let searchTruncated = false;
  const name = (f.q ?? "").replace(/[%,()]/g, "").trim();
  if (name) {
    // 상한 1000 = PostgREST max_rows. 넘으면 잘리는데, 이름 검색은 보통 수십 명이라 실제로는
    // 닿지 않는다. 닿았다면 검색어가 너무 짧다는 뜻이라 화면에서 그렇게 알린다(truncated).
    // 먼저 내 지원자(=이 공고에 지원한 사람)만 추린다. 이게 없으면 위 주석의 사고가 난다.
    let mineQ = supabase.from("applications").select("applicant_id").limit(1000);
    if (f.jobId) mineQ = mineQ.eq("job_id", f.jobId);
    const { data: mine } = await mineQ.returns<{ applicant_id: string }[]>();
    const mineIds = [...new Set((mine ?? []).map((m) => m.applicant_id))];
    searchTruncated = (mine?.length ?? 0) >= 1000; // 지원자가 1000명을 넘으면 이름 검색이 불완전하다
    if (mineIds.length === 0) return { rows: [], total: 0, counts, searchTruncated };
    const { data: hit } = await supabase
      .from("resumes").select("profile_id").in("profile_id", mineIds).ilike("name", `%${name}%`)
      .returns<{ profile_id: string }[]>();
    nameIds = (hit ?? []).map((h) => h.profile_id);
    if (nameIds.length === 0) return { rows: [], total: 0, counts, searchTruncated };
  }

  const from = (Math.max(1, page) - 1) * APPLICANTS_PER_PAGE;
  let q = supabase
    .from("applications")
    .select(APP_COLS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + APPLICANTS_PER_PAGE - 1);
  if (f.jobId) q = q.eq("job_id", f.jobId);
  if (f.status) q = q.eq("status", f.status);
  if (nameIds) q = q.in("applicant_id", nameIds);

  const { data: apps, count } = await q.returns<ReceivedBase[]>();
  if (!apps || apps.length === 0) return { rows: [], total: count ?? 0, counts, searchTruncated };

  // 이력서 카드 항목과 메모를 한 번씩만 더 조회한다(행마다 부르면 25번 왕복한다).
  const applicantIds = [...new Set(apps.map((a) => a.applicant_id))];
  const appIds = apps.map((a) => a.id);
  const [{ data: resumes }, { data: notes }] = await Promise.all([
    supabase.from("resumes").select(CARD_COLS).in("profile_id", applicantIds).returns<ApplicantCardResume[]>(),
    supabase.from("application_notes").select("application_id,memo,updated_at").in("application_id", appIds)
      .returns<{ application_id: string; memo: string; updated_at: string }[]>(),
  ]);
  const byId = new Map((resumes ?? []).map((r) => [r.profile_id, r]));
  const noteById = new Map((notes ?? []).map((n) => [n.application_id, n]));

  return {
    rows: apps.map((a) => ({
      ...a,
      resume: byId.get(a.applicant_id) ?? null,
      memo: noteById.get(a.id)?.memo ?? "",
      memoUpdatedAt: noteById.get(a.id)?.updated_at ?? null,
    })),
    total: count ?? 0,
    counts,
    searchTruncated,
  };
}

// 병원 — 지원자 1건(이력서 인쇄·다운로드용). 소유 공고가 아니면 RLS가 막는다.
export async function getReceivedApplication(id: string): Promise<ReceivedApplication | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data: app } = await supabase
    .from("applications")
    .select(APP_COLS)
    .eq("id", id)
    .maybeSingle<ReceivedBase>();
  if (!app) return null;
  // 경력 상세가 없으면 "경력 5년"이 전부라 채용 판단이 안 된다 → 전문 조회에는 반드시 함께 싣는다.
  const [{ data: resume }, { data: work }] = await Promise.all([
    supabase.from("resumes").select(RESUME_COLS).eq("profile_id", app.applicant_id).maybeSingle<ApplicantResume>(),
    supabase.from("work_experiences").select(WORK_COLS).eq("resume_id", app.applicant_id)
      .order("sort_order").returns<WorkExperience[]>(),
  ]);
  return { ...app, resume: resume ?? null, work: work ?? [] };
}
