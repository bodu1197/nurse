// 경력 계산 — 서버 의존성이 없는 순수 함수라 따로 둔다(테스트가 직접 불러올 수 있게).
// resume.ts 는 supabase 서버 클라이언트를 import 해서 node --test 로는 못 불러온다.

type Span = { start_ym: string; end_ym?: string | null; is_current?: boolean };

/**
 * 근무한 **달 수**를 센다: 2020-01 입사 ~ 2024-12 퇴사면 60개월(=5년)이다.
 * 끝에서 시작을 빼기만 하면 마지막 달이 빠져 59개월(4년)이 되어 줄마다 1개월씩 손해 본다.
 */
export function totalMonths(work: readonly Span[], now: Date): number {
  return work.reduce((sum, w) => {
    const [sy, sm] = w.start_ym.split("-").map(Number);
    if (!sy || !sm) return sum;
    const end = w.is_current || !w.end_ym ? now : new Date(`${w.end_ym}-01T00:00:00Z`);
    const months = (end.getUTCFullYear() - sy) * 12 + (end.getUTCMonth() + 1 - sm) + 1;
    return sum + Math.max(0, months);
  }, 0);
}

/** 총 경력 년수(내림). 6개월만 일했으면 0년이 맞다. */
export const totalYears = (work: readonly Span[], now: Date) => Math.floor(totalMonths(work, now) / 12);

/** "3년 4개월"처럼 사람이 읽는 형태 — 년수만 보여주면 1년 11개월이 '1년'으로만 보인다. */
export function careerText(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0 && m === 0) return "신규";
  return [y > 0 ? `${y}년` : null, m > 0 ? `${m}개월` : null].filter(Boolean).join(" ");
}
