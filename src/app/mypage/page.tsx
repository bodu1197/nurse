import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import HospitalShell from "@/components/HospitalShell";
import { getMyProfile, type MyProfile } from "@/lib/data/user";
import { getMyJobs, type MyJob } from "@/lib/data/jobs";

const DAY = 86_400_000;

export const metadata = { title: "마이페이지 — 널스넷", robots: { index: false } };

const ROLE_LABEL: Record<MyProfile["role"], string> = {
  nurse: "간호사 회원",
  hospital: "병원 회원",
  admin: "관리자",
};

// 노출 종료 시각(ms). 광고=featured_until, 무료=게시+7일. 만료/마감/대기는 0.
function endMs(j: MyJob, now: number): number {
  if (j.status !== "open") return 0;
  const f = j.featured_until ? new Date(j.featured_until).getTime() : 0;
  const e = f > now ? f : new Date(j.posted_at).getTime() + 7 * DAY;
  return e > now ? e : 0;
}
function jobBadge(j: MyJob, now: number) {
  if (j.status === "draft") return { t: "결제 대기", c: "bg-amber-100 text-amber-800" };
  const featured = j.status === "open" && j.featured_until !== null && new Date(j.featured_until).getTime() > now;
  const freeLive = j.status === "open" && new Date(j.posted_at).getTime() >= now - 7 * DAY;
  if (featured) return { t: "광고중", c: "bg-violet-100 text-violet-800" };
  if (freeLive) return { t: "게시중", c: "bg-teal-100 text-teal-800" };
  if (j.status === "open") return { t: "만료", c: "bg-amber-100 text-amber-800" };
  return { t: "마감", c: "bg-slate-100 text-slate-500" };
}
const fmtMs = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, ".");

function Widget({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ?? "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function HospitalDashboard({ profile, jobs }: { profile: MyProfile; jobs: MyJob[] }) {
  const now = Date.now();
  const liveCount = jobs.filter((j) => endMs(j, now) > 0).length;
  const applicants = jobs.reduce((s, j) => s + j.applicant_count, 0);
  const soon = jobs.filter((j) => { const e = endMs(j, now); return e > 0 && e - now <= 3 * DAY; }).length;

  return (
    <HospitalShell displayName={profile.displayName} active="/mypage">
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
          <h2 className="font-bold text-slate-900">내 채용공고 <span className="text-sm font-normal text-slate-400">· 무료 동시 1건</span></h2>
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
              const b = jobBadge(j, now);
              const e = endMs(j, now);
              return (
                <li key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white p-4">
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.c}`}>{b.t}</span>
                  <a href={`/jobs?j=${j.id}`} className="min-w-0 flex-1 truncate font-medium text-slate-800 hover:text-teal-700">{j.title}</a>
                  {e > 0 && <span className="shrink-0 text-xs text-slate-400">~{fmtMs(e)}까지</span>}
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
  { title: "저장한 공고", desc: "관심 있는 채용공고를 모아 봅니다.", href: "/mypage/saved" },
  { title: "지원 내역", desc: "지원한 공고의 진행 상황을 확인합니다.", href: "/mypage/applications" },
  { title: "채용 알림", desc: "검색 조건을 저장하고 빠르게 다시 찾습니다.", href: "/mypage/alerts" },
];
const ADMIN_ITEMS: Item[] = [
  { title: "회원 관리", desc: "간호사·병원 회원을 관리합니다." },
  { title: "공고 관리", desc: "전체 채용공고를 관리합니다." },
  { title: "데이터 수집", desc: "워크넷·공공데이터 연동 상태를 봅니다." },
];

function Card({ item }: { item: Item }) {
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

  const items = profile.role === "admin" ? ADMIN_ITEMS : NURSE_ITEMS;
  return (
    <>
      <SiteHeader user={{ displayName: profile.displayName }} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
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
      </main>
    </>
  );
}
