import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import HospitalShell from "@/components/HospitalShell";
import NurseShell from "@/components/NurseShell";
import { getMyProfile, type MyProfile } from "@/lib/data/user";
import { getMyResume, type Resume } from "@/lib/data/resume";
import { ROLE_LABEL, type Role } from "@/lib/data/role";
import { getMyJobs, type MyJob } from "@/lib/data/jobs";
import JobStatusBadge from "@/components/JobStatusBadge";
import { jobState, isLive } from "@/lib/jobState";
import { nowMs, fmtDate, listingEnd, DAY_MS } from "@/lib/date";
import { setViewAs } from "./actions";

export const metadata = { title: "마이페이지 — 널스넷", robots: { index: false } };

// 관리자 전용 — 병원/간호사 화면을 실제로 써보기 위한 보기 전환.
// 표시 순서라 ROLE_LABEL에서 파생하지 않는다. satisfies는 오타(존재하지 않는 역할)만 잡아준다.
const VIEW_OPTS = ["admin", "hospital", "nurse"] as const satisfies readonly Role[];

// 색은 slate(중립) — violet은 이미 '광고중' 상태색이라 섞으면 의미가 충돌한다.
function ViewAsSwitch({ current }: Readonly<{ current: MyProfile["role"] }>) {
  return (
    <form action={setViewAs} role="group" aria-labelledby="viewas-title" className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3">
      <span id="viewas-title" className="mr-1 text-sm font-semibold text-slate-800">관리자 테스트 — 보기 전환</span>
      {VIEW_OPTS.map((v) => (
        // disabled 대신 aria-current만 — 비활성화하면 탭 순서에서 빠져 현재 상태를 알 수 없다(재제출은 무해).
        <Button key={v} type="submit" name="role" value={v} size="md" className="focus-visible:ring-offset-slate-100"
          variant={current === v ? "primary" : "outline"} aria-current={current === v ? "true" : undefined}>
          {ROLE_LABEL[v]}{current === v && <span aria-hidden> ✓</span>}
        </Button>
      ))}
      <span className="w-full text-xs text-slate-600">전환해도 보이는 데이터는 이 계정 것뿐입니다. 전환 중에는 화면 맨 위에 안내 띠가 표시됩니다.</span>
    </form>
  );
}

// 노출 종료 시각(ms). 노출 중이 아니면 0.
// 판정은 공고 관리 화면·배지와 **같은 함수**로 — 여기서 따로 계산하면 두 화면이 다른 말을 한다.
const endMs = (j: MyJob, now: number) => (isLive(jobState(j, now)) ? listingEnd(j, now) : 0);

function Widget({ label, value, accent }: Readonly<{ label: string; value: string; accent?: string }>) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ?? "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function HospitalDashboard({ profile, jobs }: Readonly<{ profile: MyProfile; jobs: MyJob[] }>) {
  const now = nowMs();
  const liveCount = jobs.filter((j) => endMs(j, now) > 0).length;
  const applicants = jobs.reduce((s, j) => s + j.applicant_count, 0);
  const soon = jobs.filter((j) => { const e = endMs(j, now); return e > 0 && e - now <= 3 * DAY_MS; }).length;

  return (
    <HospitalShell displayName={profile.displayName} active="/mypage">
      {profile.isAdmin && <ViewAsSwitch current="hospital" />}
      <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">대시보드</h1>

      {!profile.businessVerified && (
        <a href="/mypage/verify" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <span className="text-amber-800">공고를 등록하려면 사업자 인증이 필요합니다.</span>
          <span className="font-semibold text-amber-900">인증하기 →</span>
        </a>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Widget label="게시중 공고" value={`${liveCount}`} accent="text-teal-700" />
        <Widget label="받은 지원자" value={`${applicants}`} accent="text-teal-700" />
        <Widget label="마감 임박(3일)" value={`${soon}`} accent={soon ? "text-rose-600" : "text-slate-900"} />
        <Widget label="사업자 인증" value={profile.businessVerified ? "완료" : "필요"} accent={profile.businessVerified ? "text-teal-700" : "text-amber-600"} />
      </div>

      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-slate-900">내 채용공고 <span className="text-sm font-normal text-slate-500">· 무료 동시 1건</span></h2>
          <Button href="/mypage/jobs/new" size="sm">+ 공고 등록</Button>
        </div>
        {jobs.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-10 text-center">
            <p className="text-sm text-slate-500">아직 등록한 공고가 없습니다.</p>
            <a href="/mypage/jobs/new" className="mt-2 inline-block font-semibold text-teal-700 hover:underline">첫 공고 등록하기 →</a>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {jobs.map((j) => {
              const e = endMs(j, now);
              return (
                <li key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white p-4">
                  <JobStatusBadge state={jobState(j, now)} />
                  {/* 노출 중인 공고만 공개 상세로 링크 — 결제 대기·만료·마감은 404가 된다 */}
                  {e > 0
                    ? <a href={`/jobs/${j.id}`} className="min-w-0 flex-1 truncate font-medium text-slate-800 hover:text-teal-700">{j.title}</a>
                    : <span className="min-w-0 flex-1 truncate font-medium text-slate-600">{j.title}</span>}
                  {e > 0 && <span className="shrink-0 text-xs text-slate-500">~{fmtDate(e)}까지</span>}
                  <a href={`/mypage/applicants?job_id=${j.id}`} className="shrink-0 text-sm text-slate-500 hover:text-teal-700">지원자 <b className="text-slate-700">{j.applicant_count}</b>명</a>
                  <span className="flex shrink-0 items-center gap-3 text-sm">
                    <a href={`/mypage/jobs/${j.id}/edit`} className="text-teal-700 hover:underline">수정</a>
                    <a href={`/mypage/jobs/${j.id}/ad`} className="font-semibold text-violet-700 hover:underline">광고</a>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </HospitalShell>
  );
}

// ───────── 간호사/관리자: 카드형 ─────────
type Item = { title: string; desc: string; href?: string };

const NURSE_ITEMS: Item[] = [
  { title: "내 이력서", desc: "이력서를 작성하고 병원에 지원하세요. (무료)", href: "/mypage/resume" },
  // desc는 저장 여부에 따라 아래 nurseItems()에서 교체된다.
  { title: "저장한 공고", desc: "관심 있는 채용공고를 모아 봅니다.", href: "/mypage/saved" },
  { title: "지원 내역", desc: "지원한 공고의 진행 상황을 확인합니다.", href: "/mypage/applications" },
  { title: "채용 알림", desc: "검색 조건을 저장하고 빠르게 다시 찾습니다.", href: "/mypage/alerts" },
];
const ADMIN_ITEMS: Item[] = [
  { title: "회원 관리", desc: "간호사·병원 회원을 관리합니다." },
  { title: "공고 관리", desc: "전체 채용공고를 관리합니다." },
  { title: "데이터 수집", desc: "워크넷·공공데이터 연동 상태를 봅니다." },
];

// 이력서를 저장해도 마이페이지가 그대로면 저장이 됐는지 알 수 없다 → 카드에 현재 상태를 표시.
function nurseItems(resume: Resume | null): Item[] {
  if (!resume) return NURSE_ITEMS;
  const parts = [
    resume.experience_years != null ? `경력 ${resume.experience_years}년` : null,
    resume.specialties.length > 0 ? resume.specialties.join(", ") : null,
    resume.is_public ? "공개 중" : "비공개",
  ].filter(Boolean);
  return NURSE_ITEMS.map((it) =>
    it.title === "내 이력서" ? { ...it, desc: `작성 완료 — ${parts.join(" · ")}. 눌러서 확인·수정` } : it,
  );
}

// 관리자 화면은 네비 없이 헤더만 — 도구 목록이라 오갈 곳이 없다.
function AdminShell({ displayName, children }: Readonly<{ displayName: string; active: string; children: React.ReactNode }>) {
  return (
    <>
      <SiteHeader user={{ displayName }} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}

function Card({ item }: Readonly<{ item: Item }>) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-900">{item.title}</h3>
        {!item.href && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">준비 중</span>}
      </div>
      <p className="mt-1 text-sm text-slate-500">{item.desc}</p>
    </>
  );
  return item.href ? (
    <a href={item.href} className="block rounded-xl border border-slate-200 bg-white p-5 hover:border-teal-400 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">{inner}</a>
  ) : (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-5" aria-disabled>{inner}</div>
  );
}

export default async function MyPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/login");

  if (profile.role === "hospital") {
    const jobs = await getMyJobs();
    return <HospitalDashboard profile={profile} jobs={jobs} />;
  }

  const items = profile.role === "admin" ? ADMIN_ITEMS : nurseItems(await getMyResume());
  // 관리자는 도구 목록만 보므로 간호사 네비를 씌우지 않는다.
  const Shell = profile.role === "admin" ? AdminShell : NurseShell;
  return (
    <Shell displayName={profile.displayName} active="/mypage">
      <>
        {profile.isAdmin && <ViewAsSwitch current={profile.role} />}
        <h1 className="text-2xl font-bold text-slate-900">마이페이지</h1>
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-teal-50 text-lg font-bold text-teal-700" aria-hidden>{profile.displayName.slice(0, 1)}</span>
            <div>
              <p className="text-lg font-bold text-slate-900">
                {profile.displayName}님{" "}
                <span className="ml-1 rounded-full bg-teal-100 px-2 py-0.5 align-middle text-xs font-semibold text-teal-800">{ROLE_LABEL[profile.role]}</span>
              </p>
              <p className="mt-0.5 text-sm text-slate-500">아이디 {profile.username ?? "-"} · {profile.email}</p>
            </div>
          </div>
        </section>
        <h2 className="mt-8 text-sm font-semibold text-slate-500">{profile.role === "admin" ? "관리자 도구" : "구직 활동"}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {items.map((it) => <Card key={it.title} item={it} />)}
        </div>
      </>
    </Shell>
  );
}
