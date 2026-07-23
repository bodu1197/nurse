import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/data/user";
import { SHEET_COLS, type ResumeSheetFields } from "@/lib/data/resume";

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

  const missing = rows.filter((r) => !r.job).map((r) => r.job_id);
  if (missing.length > 0) {
    const { data: closed } = await createAdminClient()
      .from("jobs").select("id,title,hospital:hospitals(name)").in("id", missing)
      .returns<Array<{ id: string; title: string; hospital: { name: string } | null }>>();
    const byId = new Map((closed ?? []).map((j) => [j.id, j]));
    rows.forEach((r) => { if (!r.job) r.job = byId.get(r.job_id) ?? null; });
  }
  return rows;
}

// 간호사가 특정 공고에 이미 지원했는지(공고 상세에서 '지원완료' 표시용).
// 취소한 지원은 제외 — 다시 지원할 수 있어야 한다.
export async function hasApplied(jobId: string): Promise<boolean> {
  const user = await getSessionUser();
  if (!user) return false;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications").select("status")
    .eq("job_id", jobId).eq("applicant_id", user.id).maybeSingle();
  // 조회가 실패하면 '지원 안 함'으로 보여 폼이 다시 뜨고, 눌러도 액션이 dup으로 되돌린다 → 원인을 남긴다.
  if (error) console.error("hasApplied failed:", error.message);
  return !!data && data.status !== "withdrawn";
}

/** 병원이 보는 지원자 이력서 전문 — 본인 화면·인쇄 서식과 같은 항목(+ 어느 회원인지). */
export type ApplicantResume = ResumeSheetFields & { profile_id: string };

/**
 * 목록 카드에 실제로 그리는 항목만. 학력·희망급여·희망고용형태는 전문 보기에서만 필요하다.
 * 타입과 select 문자열을 이 배열 하나에서 뽑는다(둘이 어긋나면 화면이 런타임에 깨진다).
 */
const CARD_FIELDS = [
  "profile_id", "name", "phone", "license_type", "experience_years", "specialties", "desired_location", "intro",
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

/** 지원자 1건(이력서 전문) — 인쇄·상세용 */
export type ReceivedApplication = ReceivedBase & { resume: ApplicantResume | null };
/** 지원자 목록의 한 줄 — 카드에 필요한 만큼만 */
export type ApplicantListItem = ReceivedBase & { resume: ApplicantCardResume | null };

const RESUME_COLS = `profile_id,${SHEET_COLS}`;
const CARD_COLS = CARD_FIELDS.join(",");
const APP_COLS = "id,status,message,created_at,applicant_id,job:jobs(id,title)";

// 병원 — 내 공고에 들어온 지원자(+이력서 전문). RLS로 소유 공고만. jobId 지정 시 해당 공고만.
// 목록을 여는 것만으로 '열람됨'으로 바꾸지 않는다 — 실제로 보지 않았는데 지원자에게 열람으로 표시되고,
// 병원 입장에서도 "아직 안 본 지원자"를 구분할 수 없게 된다. 열람 처리는 화면의 버튼으로 한다.
export async function getReceivedApplications(jobId?: string): Promise<ApplicantListItem[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createClient();
  let q = supabase
    .from("applications")
    .select(APP_COLS)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (jobId) q = q.eq("job_id", jobId);
  const { data: apps } = await q.returns<ReceivedBase[]>();
  if (!apps || apps.length === 0) return [];

  const ids = [...new Set(apps.map((a) => a.applicant_id))];
  const { data: resumes } = await supabase
    .from("resumes").select(CARD_COLS).in("profile_id", ids)
    .returns<ApplicantCardResume[]>();
  const byId = new Map((resumes ?? []).map((r) => [r.profile_id, r]));

  return apps.map((a) => ({ ...a, resume: byId.get(a.applicant_id) ?? null }));
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
  const { data: resume } = await supabase
    .from("resumes").select(RESUME_COLS).eq("profile_id", app.applicant_id)
    .maybeSingle<ApplicantResume>();
  return { ...app, resume: resume ?? null };
}
