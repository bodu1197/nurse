// 📍 "내 주변" 반경 공용 유틸 — talent(C:\dev\talent\src\lib\location\radius.ts) 그대로 이식.
// 서버 파싱(jobs.ts)과 클라 슬라이더(JobNearMeButton)가 같은 함수를 써야 라벨·썸 위치·실제 조회
// 반경이 어긋나지 않는다.

export interface RadiusConfig {
  readonly min: number;
  readonly max: number;
  readonly default: number;
  readonly step: number;
}

/** 범위 클램프 + step 격자 정렬. step 에 안 맞는 딥링크(?r=7500, step=1000)는 썸과 라벨이 어긋난다. */
export function clampRadius(raw: number, cfg: RadiusConfig): number {
  if (!Number.isFinite(raw)) return cfg.default;
  const clamped = Math.min(cfg.max, Math.max(cfg.min, raw));
  return Math.round(clamped / cfg.step) * cfg.step;
}

/** URL 문자열 → 유효 반경(m). 숫자가 아니면 기본값. 딥링크로 전국 스캔을 유발할 수 없다. */
export function parseRadius(raw: string | undefined | null, cfg: RadiusConfig): number {
  return clampRadius(Number.parseInt(raw ?? "", 10), cfg);
}

/** 사람이 읽는 반경 표기 — 1km 미만은 m, 그 이상은 km(정수면 소수점 생략). aria-valuetext 겸용. */
export function radiusLabel(m: number): string {
  if (m < 1000) return `${m}m`;
  const km = m / 1000;
  return `${km.toFixed(Number.isInteger(km) ? 0 : 1)}km`;
}

// 📍 "내 주변" 반경(m) — talent(C:\dev\talent\src\lib\jobs\types.ts JOB_NEAR_RADIUS) 그대로.
// 서버 bounding-box 계산(lib/data/jobs.ts)·URL 파싱(jobs/page.tsx)·슬라이더(JobNearMeButton)가
// 이 한 곳을 공유한다(드리프트 방지). 클라이언트 안전(서버 전용 아님) — radius.ts 자체가 그렇다.
export const JOB_NEAR_RADIUS: RadiusConfig = { min: 1000, max: 30_000, default: 10_000, step: 1000 };
