/**
 * 🧓 요양보호사 수집(크론 /api/cron/sync-care)의 **판단 로직** — server-only 가 아니라 테스트할 수 있다(careSync.test).
 *
 * 왜 크론 파일에서 뺐나: 이 셋이 틀리면 에러 없이 조용히 데이터가 상한다 — 좌표가 매 실행 null 로 덮여
 * "내 주변 0건"이 되거나, 워크넷이 잠시 일부만 돌려준 날 1만 건이 통째로 지워진다(/review8 2026-10-16).
 */

/** 워크넷 원문 링크인가. 카드가 href 로 그대로 쓰므로 https + work24.go.kr 만 받는다(javascript:·data:·타 도메인 차단). */
const WORKNET_URL = /^https:\/\/([\w-]+\.)*work24\.go\.kr\//;
export const isWorknetUrl = (url: string | null | undefined): url is string => !!url && WORKNET_URL.test(url);

/**
 * 워크넷에서 내려간 공고를 지워도 되나 — **직전 성공 실행보다 10% 넘게 줄었으면 지우지 않는다.**
 * 저장 행 수와 비교하지 않는 이유: 워크넷이 실제로 15% 줄어든 날이면 그 뒤 매 실행이 "줄었다"가 되어
 * 영영 못 지운다. 직전 실행과 비교하면 한 번의 글리치는 건너뛰고, 진짜 변화는 다음 실행이 받아들인다.
 * 첫 실행(기록 없음)은 지운다. 0건 수집은 어떤 경우에도 지우지 않는다(실측: 응답 200 인데 total 0).
 * 🔴 기준치가 0 이하면 지우지 않는다 — 0 과 비교하면 어떤 수도 "줄지 않았다"가 되어 가드가 열린다
 *    (크론은 0건 수집을 실패로 기록해 기준치가 0 이 되는 일을 막지만, 여기서도 한 번 더 막는다).
 */
export const PRUNE_MIN_RATIO = 0.9;
export function shouldPruneCare(fetched: number, lastFetched: number | null): boolean {
  if (fetched <= 0) return false;
  if (lastFetched === null) return true;
  if (lastFetched <= 0) return false;
  return fetched >= lastFetched * PRUNE_MIN_RATIO;
}

export type GeoCoords = { lat: number; lng: number } | null;

/**
 * 저장 묶음 나누기 — 이번에 좌표를 **시도한** 행에만 lat/lng/geocoded_at 키를 붙인다(실패도 null 로 기록).
 * PostgREST upsert 는 보낸 키만 갱신하므로, 시도하지 않은 행은 키를 빼고 보내야 저장된 좌표가 유지된다.
 * 묶음 안의 키는 같아야 해서 두 배열로 돌려준다.
 */
export function splitGeoRows<T extends { external_id: string }>(
  rows: readonly T[],
  coords: ReadonlyMap<string, GeoCoords>,
  attemptedAt: string,
): { withGeo: Array<T & { lat: number | null; lng: number | null; geocoded_at: string }>; withoutGeo: T[] } {
  const withGeo: Array<T & { lat: number | null; lng: number | null; geocoded_at: string }> = [];
  const withoutGeo: T[] = [];
  for (const r of rows) {
    if (!coords.has(r.external_id)) { withoutGeo.push(r); continue; }
    const c = coords.get(r.external_id);
    withGeo.push({ ...r, lat: c?.lat ?? null, lng: c?.lng ?? null, geocoded_at: attemptedAt });
  }
  return { withGeo, withoutGeo };
}
