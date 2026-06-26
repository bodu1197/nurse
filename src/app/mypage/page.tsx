import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getMyProfile, type MyProfile } from "@/lib/data/user";
import { getMyJobs, getMyFreeCredits, type MyJob } from "@/lib/data/jobs";

const DAY = 86_400_000;

export const metadata = { title: "마이페이지 — 널스넷", robots: { index: false } };

const ROLE_LABEL: Record<MyProfile["role"], string> = {
  nurse: "간호사 회원",
  hospital: "병원 회원",
  admin: "관리자",
};

type Item = { title: string; desc: string; href?: string; badge?: { text: string; tone: "teal" | "amber" } };

// 역할별 메뉴 — 병원(공고 등록 측)과 구직자(지원 측)는 기능이 완전히 다름.
const NURSE_ITEMS: Item[] = [
  { title: "내 이력서", desc: "이력서를 작성하고 병원에 지원하세요. (무료)", href: "/mypage/resume" },
  { title: "저장한 공고", desc: "관심 있는 채용공고를 모아 봅니다." },
  { title: "지원 내역", desc: "지원한 공고의 진행 상황을 확인합니다.", href: "/mypage/applications" },
  { title: "채용 알림", desc: "검색 조건을 저장하고 빠르게 다시 찾습니다.", href: "/mypage/alerts" },
];
const HOSPITAL_ITEMS: Item[] = [
  { title: "공고 등록", desc: "새 채용공고를 등록합니다.", href: "/mypage/jobs/new" },
  { title: "공고 관리", desc: "등록한 공고를 수정·마감합니다.", href: "/mypage/jobs" },
  { title: "받은 지원자", desc: "공고에 지원한 간호사를 확인합니다.", href: "/mypage/applicants" },
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
        {item.badge ? (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.badge.tone === "teal" ? "bg-teal-100 text-teal-800" : "bg-amber-100 text-amber-800"}`}>{item.badge.text}</span>
        ) : !item.href ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">준비 중</span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-slate-500">{item.desc}</p>
    </>
  );
  return item.href ? (
    <a href={item.href} className="block rounded-xl border border-slate-200 bg-white p-5 hover:border-teal-400 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
      {inner}
    </a>
  ) : (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-5" aria-disabled>
      {inner}
    </div>
  );
}

function jobBadge(j: MyJob, now: number) {
  const featured = j.status === "open" && j.featured_until !== null && new Date(j.featured_until).getTime() > now;
  const freeLive = j.status === "open" && new Date(j.posted_at).getTime() >= now - 7 * DAY;
  if (featured) return { t: "광고중", c: "bg-violet-100 text-violet-800" };
  if (freeLive) return { t: "게시중", c: "bg-teal-100 text-teal-800" };
  if (j.status === "open") return { t: "만료", c: "bg-amber-100 text-amber-800" };
  return { t: "마감", c: "bg-slate-100 text-slate-500" };
}

export default async function MyPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/login");

  const isHospital = profile.role === "hospital";
  const jobs = isHospital ? await getMyJobs() : [];
  const credits = isHospital ? await getMyFreeCredits() : null;
  const now = Date.now();

  const hospitalItems: Item[] = [
    {
      title: "사업자 인증",
      desc: profile.businessVerified ? "사업자 인증이 완료되었습니다." : "공고 등록을 위해 사업자 인증이 필요합니다.",
      href: "/mypage/verify",
      badge: profile.businessVerified ? { text: "인증 완료", tone: "teal" } : { text: "인증 필요", tone: "amber" },
    },
    ...HOSPITAL_ITEMS,
  ];
  const items = profile.role === "hospital" ? hospitalItems : profile.role === "admin" ? ADMIN_ITEMS : NURSE_ITEMS;

  return (
    <>
      <SiteHeader user={{ displayName: profile.displayName }} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold text-slate-900">마이페이지</h1>

        {/* 프로필 카드 */}
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-teal-50 text-lg font-bold text-teal-700" aria-hidden>
              {profile.displayName.slice(0, 1)}
            </span>
            <div>
              <p className="text-lg font-bold text-slate-900">
                {profile.displayName}님{" "}
                <span className="ml-1 rounded-full bg-teal-100 px-2 py-0.5 align-middle text-xs font-semibold text-teal-800">
                  {ROLE_LABEL[profile.role]}
                </span>
              </p>
              <p className="mt-0.5 text-sm text-slate-500">
                아이디 {profile.username ?? "-"} · {profile.email}
              </p>
            </div>
          </div>
        </section>

        {/* 병원: 내 공고 목록 바로 표시 */}
        {isHospital && (
          <section className="mt-8">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-500">내 채용공고{credits !== null && credits > 0 && <span className="ml-2 font-normal text-teal-700">무료 게시권 {credits}장</span>}</h2>
              <a href="/mypage/jobs/new" className="text-sm font-semibold text-teal-700 hover:underline">+ 공고 등록</a>
            </div>
            {jobs.length === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-8 text-center">
                <p className="text-sm text-slate-500">아직 등록한 공고가 없습니다.</p>
                <a href="/mypage/jobs/new" className="mt-2 inline-block font-semibold text-teal-700 hover:underline">첫 공고 등록하기 →</a>
              </div>
            ) : (
              <>
                <ul className="mt-3 space-y-2">
                  {jobs.map((j) => {
                    const b = jobBadge(j, now);
                    return (
                      <li key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-slate-200 bg-white p-3">
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${b.c}`}>{b.t}</span>
                        <a href={`/jobs?j=${j.id}`} className="min-w-0 flex-1 truncate font-medium text-slate-800 hover:text-teal-700">{j.title}</a>
                        <a href="/mypage/applicants" className="shrink-0 text-xs text-slate-500 hover:text-teal-700">지원자 <b className="text-slate-700">{j.applicant_count}</b>명</a>
                        <span className="flex shrink-0 items-center gap-3 text-xs">
                          <a href={`/mypage/jobs/${j.id}/edit`} className="text-teal-700 hover:underline">수정</a>
                          <a href={`/mypage/jobs/${j.id}/ad`} className="font-semibold text-violet-700 hover:underline">광고</a>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <a href="/mypage/jobs" className="mt-2 inline-block text-sm text-slate-500 hover:underline">전체 공고 관리 →</a>
              </>
            )}
          </section>
        )}

        {/* 역할별 기능 */}
        <h2 className="mt-8 text-sm font-semibold text-slate-500">
          {profile.role === "hospital" ? "채용 관리" : profile.role === "admin" ? "관리자 도구" : "구직 활동"}
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {items.map((it) => (
            <Card key={it.title} item={it} />
          ))}
        </div>

        <p className="mt-8 text-xs text-slate-400">
          기능은 순차적으로 오픈됩니다. {profile.role === "hospital" ? "공고 등록부터 우선 제공 예정입니다." : "이력서 작성부터 우선 제공 예정입니다."}
        </p>
      </main>
    </>
  );
}
