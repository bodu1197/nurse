import type { JobState } from "@/lib/jobState";

// 공고 상태 배지 — 대시보드(/mypage)와 공고 관리(/mypage/jobs)가 같은 말·같은 색을 쓴다.
// 예전에는 두 화면이 각자 계산해, 한쪽만 고치면 같은 공고가 화면마다 다르게 보였다.
const LABEL: Record<JobState, string> = {
  pending: "결제 대기",
  featured: "광고중",
  free: "게시중",
  expired: "만료",
  closed: "마감",
};

// 결제 대기(내가 결제하면 게시)와 만료(기간이 끝남)는 해야 할 일이 다르므로 색도 다르게 둔다.
const TONE: Record<JobState, string> = {
  pending: "bg-amber-100 text-amber-800",
  featured: "bg-violet-100 text-violet-800",
  free: "bg-teal-100 text-teal-800",
  expired: "bg-rose-100 text-rose-700",
  closed: "bg-slate-200 text-slate-700",
};

export default function JobStatusBadge({ state }: Readonly<{ state: JobState }>) {
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[state]}`}>{LABEL[state]}</span>
  );
}
