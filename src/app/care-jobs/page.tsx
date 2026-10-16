import SiteHeader from "@/components/SiteHeader";
import JobCard from "@/components/JobCard";
import CareRegionBar from "@/components/CareRegionBar";
import JobNearMeButton from "@/components/JobNearMeButton";
import { getMyProfile } from "@/lib/data/user";
import { getCareJobs, getCareDirectJobs, getCareRegionList, careToCard, CARE_PER_PAGE } from "@/lib/data/careJobs";
import { parseRadius, radiusLabel, JOB_NEAR_RADIUS } from "@/lib/location/radius";
import { firstParam, pageParam } from "@/lib/url";
import { CARE_JOBS_MENU, socialMeta } from "@/lib/constants";

/**
 * 🧓 요양보호사·간병인 채용공고 목록 — 헤더 「요양·간병 채용」·홈 요양 탭의 '전체 보기'.
 *
 * 두 표를 합쳐 보여 준다(lib/data/careJobs 주석):
 *   · 기관이 직접 올린 공고(jobs, 직종 요양보호사·간병인) — 광고 순서대로 **먼저**. 카드는 /jobs/[id](저장·간편지원·광고 그대로).
 *   · 워크넷 수집분(care_jobs) — 최신순, 쪽 나눔. 카드는 /care-jobs/[id](본문은 처음 열릴 때 워크넷에서 받는다).
 * 🔴 카드는 바깥(워크넷)으로 보내지 않는다 — 오너 지시 2026-10-16 "카드를 클릭하면 페이지가 나와야지 다른 곳으로 보내면 안 되지".
 * 검색은 지역과 내 주변(GPS 반경)이다(요양보호사 공고는 "어디서"가 거의 전부다 — 방문·재가가 절반).
 * 키워드는 쓰임이 생기면 더한다. 내 주변은 /jobs 와 같은 부품(JobNearMeButton + lib/location)을 그대로 쓴다.
 */

const TITLE = "요양보호사·간병인 채용공고 — 널스넷";
const DESC = "요양원·주간보호센터·방문요양·재가요양·간병 구인공고를 지역별·내 주변으로 모아 보여 드립니다. 기관 직접 등록 공고와 고용노동부 워크넷 공고를 매일 갱신합니다.";

// 같은 키가 두 번 오면 배열이다 — 값은 lib/url 의 firstParam·pageParam 으로만 읽는다(문자열로 믿고 .trim() 하면 500).
type Params = Partial<Record<"sido" | "sigungu" | "page" | "lat" | "lng" | "r", string | string[]>>;

export async function generateMetadata({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const filtered = !!(firstParam(sp.sido) || firstParam(sp.sigungu) || firstParam(sp.lat) || pageParam(sp.page) > 1);
  return {
    title: TITLE,
    description: DESC,
    ...socialMeta({ url: CARE_JOBS_MENU.href, title: TITLE, description: DESC }),
    // /jobs 와 같은 규칙 — 지역·내 주변을 고른 화면과 2쪽 이후는 noindex, 정본에는 canonical 만. 둘을 같은 페이지에서
    // 함께 내지 않는다(서로 모순된 지시라 noindex 가 정본으로 번질 수 있다 — jobs/page.tsx 주석).
    ...(filtered ? { robots: { index: false } } : { alternates: { canonical: CARE_JOBS_MENU.href } }),
  };
}

export default async function CareJobsPage({ searchParams }: Readonly<{ searchParams: Promise<Params> }>) {
  const sp = await searchParams;
  const sd = firstParam(sp.sido).trim();
  const sg = sd ? firstParam(sp.sigungu).trim() : ""; // 시군구는 시도에 종속 — 서버 필터와 같은 계약
  const pageNum = pageParam(sp.page);
  // 📍 내 주변 — JobNearMeButton 이 브라우저 GPS로 실어 보낸 좌표. 유효(지구 범위 안 유한값)할 때만 켠다
  //    — 장난 딥링크가 bounding-box 를 오염시키는 것 방지(/jobs 와 같은 계약).
  const latS = firstParam(sp.lat);
  const lngS = firstParam(sp.lng);
  const rS = firstParam(sp.r);
  const latN = Number(latS);
  const lngN = Number(lngS);
  const nearby = !!latS && !!lngS && Number.isFinite(latN) && Number.isFinite(lngN) && Math.abs(latN) <= 90 && Math.abs(lngN) <= 180;
  const radiusM = parseRadius(rS, JOB_NEAR_RADIUS);

  const filters = { sido: sd, sigungu: sg, near: nearby ? { lat: latN, lng: lngN, radiusM } : undefined };
  const [profile, { jobs, total }, direct, sidos, sigungus] = await Promise.all([
    getMyProfile(),
    getCareJobs(filters, pageNum),
    // 직접 등록분은 쪽을 나누지 않는다 — 첫 쪽에 전부, 건수는 모든 쪽의 "총 N건"에 들어간다(2쪽부터는 건수만 받는다).
    getCareDirectJobs(filters, pageNum > 1),
    getCareRegionList(),
    sd ? getCareRegionList(sd) : Promise.resolve([]), // 시도 미선택이면 즉시 [](비용 0)
  ]);
  const totalPages = Math.max(1, Math.ceil(total / CARE_PER_PAGE));
  const directJobs = pageNum === 1 ? direct.jobs : [];
  const shown = directJobs.length + jobs.length;
  // 쪽 이동 링크 — 지역·내 주변 조건을 그대로 실어 보낸다(안 그러면 2쪽에서 반경 필터가 풀린다).
  const href = (toPage: number) => {
    const p = new URLSearchParams();
    if (sd) p.set("sido", sd);
    if (sg) p.set("sigungu", sg);
    if (nearby) { p.set("lat", latS); p.set("lng", lngS); if (rS) p.set("r", rS); }
    if (toPage > 1) p.set("page", String(toPage));
    const s = p.toString();
    return CARE_JOBS_MENU.href + (s ? `?${s}` : "");
  };
  // "중구"만 쓰면 어느 시도인지 모른다 — 시도까지 붙인다.
  const where = nearby ? `내 주변 ${radiusLabel(radiusM)}` : sg ? `${sd} ${sg}` : sd;
  const navBtn = "inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600";
  // 빈 화면 문구 — 왜 비었는지에 따라 다음 행동이 다르다. 범위 밖 쪽(?page=9999, 또는 공고가 줄어든 뒤)이면 첫 쪽으로 돌려보낸다.
  const emptyText = pageNum > 1
    ? "이 쪽에는 공고가 없습니다."
    : nearby
      ? `내 주변 ${radiusLabel(radiusM)} 안에 공고가 없습니다. 반경을 넓히거나, 해제를 누른 뒤 지역을 골라 보세요.`
      : sd
        ? "이 지역에는 지금 공고가 없습니다. 다른 지역을 골라 보세요."
        : "지금 보여 줄 공고가 없습니다. 잠시 후 다시 확인해 주세요.";

  return (
    <>
      <SiteHeader user={profile ? { displayName: profile.displayName } : null} />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-8">
        {/* h1 은 값에 따라 바뀌지 않는 제목만 — 건수·지역·쪽은 아래 줄에(검색엔진이 보는 정본 제목이 매일 달라지지 않게). */}
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">요양보호사·간병인 채용공고</h1>
        {/* 범위 밖 쪽(0건)에서는 건수 줄을 감춘다 — 조회가 범위 오류로 끝나면 total 이 0 으로 와 "총 0건"이라는 거짓이 찍힌다. */}
        {!(pageNum > 1 && jobs.length === 0) && (
          <p className="mt-1 text-sm text-slate-500">
            총 <b className="font-semibold text-slate-800">{(total + direct.total).toLocaleString()}</b>건{where ? ` · ${where}` : ""}{totalPages > 1 ? ` · ${pageNum}/${totalPages}p` : ""}
          </p>
        )}
        <p className="mt-2 text-sm text-slate-500">
          기관이 직접 등록한 공고와 고용노동부 워크넷에서 제공받은 요양보호사·간병인 구인공고를 함께 보여 드립니다.
        </p>
        {/* 내 주변 → 지역, /jobs 와 같은 배치. 내 주변이 켜지면 지역 선택기는 스스로 숨는다(CareRegionBar). */}
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
          <JobNearMeButton label="요양보호사·간병인 채용" />
          <CareRegionBar sidos={sidos} sigungus={sigungus} />
        </div>

        {shown === 0 ? (
          <div className="py-20 text-center text-slate-500">
            <p>{emptyText}</p>
            {pageNum > 1 && <a href={href(1)} className={`mt-4 ${navBtn}`}>첫 쪽으로 →</a>}
          </div>
        ) : (
          <>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {/* 카드 마크업은 /jobs·/match 와 공유한다(components/JobCard). 직접 등록분이 먼저 — 간편지원 배지·광고 마감일이 카드 안에서 판정된다. */}
              {directJobs.map((job) => (
                <li key={job.id}>
                  <JobCard job={job} href={`/jobs/${job.id}`} />
                </li>
              ))}
              {jobs.map((job) => (
                <li key={job.external_id}>
                  <JobCard job={careToCard(job)} href={`${CARE_JOBS_MENU.href}/${job.external_id}`} />
                </li>
              ))}
            </ul>
            {/* nofollow — 쪽 500여 장은 noindex 인데, 크롤러가 따라가면 그 끝의 상세 1만 장(noindex)까지 전부 돌아 색인 대상보다
                많은 URL 을 긁는다(talent/[id] 의 Pager 와 같은 이유). 사람은 그대로 누른다. */}
            {totalPages > 1 && (
              <nav className="mt-6 flex items-center justify-center gap-3 text-sm" aria-label="페이지 이동">
                {pageNum > 1 ? <a href={href(pageNum - 1)} rel="nofollow" className={navBtn}>← 이전</a> : <span />}
                <span className="text-slate-500">{pageNum} / {totalPages}</span>
                {pageNum < totalPages ? <a href={href(pageNum + 1)} rel="nofollow" className={navBtn}>다음 →</a> : <span />}
              </nav>
            )}
          </>
        )}
      </main>
    </>
  );
}
