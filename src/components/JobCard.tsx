import type { ReactNode } from "react";
import { acceptsPlatformApply } from "@/lib/applyGate";
import { daysAgo, listingEnd, fmtDate, nowMs } from "@/lib/date";

/**
 * '간편지원' 배지 — 홈·목록·자동매치가 **같은 모양**을 쓴다.
 *
 * 🔴 '추천'(is_featured) 배지를 걷어낸 자리다 — 전 공고 0건이라 아무 데도 안 뜨는 죽은 배지였다.
 *    대신 워크넷 수집분이 아닌 우리 공고에 이 배지를 단다. 목록 1,344건 중 1,300건이 워크넷이라
 *    우리 공고 44건이 그 안에 파묻힌다(3%). 배지는 광고 자랑이 아니라 **구직자가 얻는 것**을
 *    말한다 — 이 배지가 붙은 공고에서만 실제로 이력서 지원 폼이 뜬다.
 *    teal 을 쓰는 이유: 빨강은 카드에서 이미 '마감' 이고, amber 는 옛 추천 배지 색이다.
 * 🔒 **붙일지 말지는 부르는 쪽이 `acceptsPlatformApply`(lib/applyGate)로 판정한다** — 화면과
 *    서버 액션(applyToJob)이 같은 함수를 써야 "버튼은 보이는데 눌러도 실패"가 안 생긴다.
 */
export function ApplyBadge() {
  return (
    <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-700">
      간편지원
    </span>
  );
}

/**
 * 공고 카드 한 장 — 목록(/jobs)과 AI 자동매치(/match)가 **같은 카드**를 쓴다.
 *
 * 왜 컴포넌트로 뺐나: 두 화면에 같은 마크업이 복사돼 있었다. 배지 하나를 고치면 한쪽만 바뀌고,
 * 실제로 '간편지원' 배지는 목록에만 있어서 자동매치에서는 **지원할 수 있는 공고인지 알 수 없었다**.
 *
 * 화면마다 다른 것은 두 자리뿐이라 그것만 슬롯으로 연다:
 *   badge — 제목 오른쪽(자동매치의 "5개 중 4개 일치")
 *   note  — 병원·지역 아래 한 줄(자동매치의 "다른 조건: 진료과 미표기")
 * '간편지원' 배지는 두 화면 공통이라 여기서 직접 판정한다(lib/applyGate — 서버 액션과 같은 함수).
 */

/** 카드가 읽는 값. jobs·jobs_listed 어느 쪽에서 왔든 이 모양이면 된다. */
export type JobCardData = Readonly<{
  id: string;
  title: string;
  location: string | null;
  salary_text: string | null;
  company_name: string | null;
  posted_at: string;
  source: string;
  deadline: string | null;
  featured_until: string | null;
  apply_methods: readonly string[];
  hospital: { name: string } | null;
}>;

export default function JobCard({
  job,
  href,
  badge,
  note,
  reserveAction = false,
}: Readonly<{
  job: JobCardData;
  href: string;
  badge?: ReactNode;
  note?: ReactNode;
  /** 카드 위에 겹쳐 놓는 버튼(목록의 저장 아이콘)이 있으면 아래 줄 오른쪽을 비워 둔다. */
  reserveAction?: boolean;
}>) {
  // 🔴 '지금'을 prop 으로 받지 않는다. 받으면 호출부가 `Date.now()` 를 넘겼을 때 아래 daysAgo(내부에서
  //    nowMs() 를 쓴다)와 값이 갈려, 같은 카드에서 "0일 전"과 마감일 계산이 서로 다른 시각을 본다.
  //    nowMs() 는 요청당 고정(cache())이라 여기서 불러도 한 화면 안에서는 항상 같은 값이다.
  const now = nowMs();
  const canApply = acceptsPlatformApply({ source: job.source, apply_methods: job.apply_methods });
  const hospitalName = job.hospital?.name ?? job.company_name ?? "병원 미상";
  return (
    <a
      href={href}
      // 🔴 링크 이름을 따로 준다. 안 주면 카드 본문 전체(제목+배지+병원명+지역+어긋난 조건+급여+날짜)가
      //    한 링크의 이름으로 읽혀, 스크린리더의 링크 목록에서 어느 공고인지 가려낼 수 없다
      //    (/talent·/match 의 인재 카드가 같은 이유로 aria-label 을 단다).
      aria-label={[job.title, hospitalName, job.location].filter(Boolean).join(" · ")}
      className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
    >
      {/* 🔴 제목에 최소 폭(basis-40)을 주고 줄바꿈을 허용한다. 배지가 둘(간편지원 + 자동매치 일치)이면
          배지 칸이 150px 가까이 먹어, 300px 카드에서 제목이 4~6줄로 쪼개졌다(실측). 이제 자리가
          모자라면 **배지 줄이 통째로 아래로 내려가고** 제목은 한 줄 폭을 그대로 쓴다.
          배지가 하나뿐인 목록(/jobs)에서는 종전처럼 제목 오른쪽에 그대로 붙는다. */}
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <h3 className="min-w-0 flex-1 basis-40 font-bold leading-snug text-slate-900">{job.title}</h3>
        {/* 배지가 하나도 없으면 감싸는 칸도 그리지 않는다 — 빈 div 라도 부모의 gap 8px 를 먹어
            제목이 이유 없이 왼쪽으로 좁아진다(종전 /jobs 카드에는 이 칸이 없었다). */}
        {(canApply || badge) && (
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            {canApply && <ApplyBadge />}
            {badge}
          </div>
        )}
      </div>
      <p className="mt-1.5 text-sm text-slate-700">{hospitalName}</p>
      <p className="text-sm text-slate-500">{job.location}</p>
      {note}
      <div className={`mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-3 text-xs ${reserveAction ? "pr-12" : ""}`}>
        <span className="font-bold text-teal-700">{job.salary_text ?? "급여 협의"}</span>
        <span className="text-slate-400">{daysAgo(job.posted_at)}일 전</span>
        {/* 노출 마감일 — 우리 공고는 게시 기간(listingEnd), 수집분은 공고에 적힌 마감일. */}
        {job.source === "direct" ? (
          <span className="font-medium text-rose-600">~{fmtDate(listingEnd(job, now)).slice(5)} 마감</span>
        ) : (
          job.deadline && <span className="font-medium text-rose-600">~{job.deadline.slice(5).replace("-", ".")} 마감</span>
        )}
      </div>
    </a>
  );
}
