import Link from "next/link";
import { matchAxes, type SeekerProfile } from "@/lib/match";

/**
 * 🤖 AI 자동매치가 쓰는 다섯 항목 중 **무엇이 비어 있는지** 짚어주는 안내.
 *
 * 오너 지시 2026-08-05: "이력서 작성자들에게 AI 자동매칭을 위해서 최대한 입력값을 풍부하게
 * 입력하라고 노티스해 주고." — 그래서 "다 채우세요" 같은 뜬구름이 아니라 **비어 있는 항목 이름과
 * 그걸 채우면 무엇이 좋아지는지**를 적는다. 항목 목록·판단은 lib/match 한 곳에서 온다
 * (여기에 손으로 적으면 매칭 규칙을 바꿔도 안내가 따라오지 않는다).
 *
 * 이력서 화면(/mypage/resume)과 자동매치 화면(/match) 두 곳이 같은 문장을 쓴다.
 */
export default function MatchAxisNotice({
  seeker,
  linkToResume = false,
}: Readonly<{ seeker: SeekerProfile | null; linkToResume?: boolean }>) {
  // 이력서가 아직 없으면 "무엇이 비었다" 가 아니라 "이걸 쓰면 열린다" 가 맞는 말이다.
  if (!seeker) {
    return (
      <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
        <b>AI 자동매치</b>는 이력서의 <b>희망 근무지 · 근무부서 · 직종 · 고용형태 · 급여</b>를 보고 맞는
        공고를 자동으로 찾아 드립니다. 채운 항목이 많을수록 정확해집니다.
      </div>
    );
  }

  const axes = matchAxes(seeker);
  const missing = axes.filter((a) => !a.filled);

  if (missing.length === 0) {
    return (
      <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
        <b>AI 자동매치</b>에 쓰는 {axes.length}개 항목이 모두 채워져 있습니다 — 가장 정확하게 맞춰 드립니다.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p>
        <b>AI 자동매치</b>가 보는 {axes.length}개 항목 중{" "}
        <b>{axes.length - missing.length}개</b>가 채워져 있습니다. 아래를 더 채우면 맞는 공고가 더 정확해집니다.
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {missing.map((a) => (
          <li key={a.label}>
            · <b>{a.label}</b> — {a.why}
          </li>
        ))}
      </ul>
      {linkToResume && (
        <Link href="/mypage/resume" className="mt-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-2">
          이력서에서 채우기
        </Link>
      )}
    </div>
  );
}
