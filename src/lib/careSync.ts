/**
 * 🧓 요양보호사 수집(크론 /api/cron/sync-care)의 **판단 로직** — server-only 가 아니라 테스트할 수 있다(careSync.test).
 *
 * 왜 크론 파일에서 뺐나: 이 셋이 틀리면 에러 없이 조용히 데이터가 상한다 — 좌표가 매 실행 null 로 덮여
 * "내 주변 0건"이 되거나, 워크넷이 잠시 일부만 돌려준 날 1만 건이 통째로 지워진다(/review8 2026-10-16).
 */

/** 워크넷 원문 링크인가. 상세(/care-jobs/[id])의 「원본에서 지원하기」가 href 로 그대로 쓰므로 https + work24.go.kr 만 받는다(javascript:·data:·타 도메인 차단). */
const WORKNET_URL = /^https:\/\/([\w-]+\.)*work24\.go\.kr\//;
export const isWorknetUrl = (url: string | null | undefined): url is string => !!url && WORKNET_URL.test(url);

/**
 * 상세 페이지의 공고 id 가 워크넷 채용공고번호 꼴인가 — 실측 16자 영숫자(KJKZ002610160005 · K180612610150017).
 * 형식이 바뀔 수 있어 6~32자로 여유를 둔다. 그 밖의 값은 조회 없이 "없는 공고"다(장난 URL 로 DB 를 안 찌른다).
 */
export const isCareJobId = (id: string): boolean => /^[A-Za-z0-9]{6,32}$/.test(id);

/** 상세 재시도 간격 — 실패(장애·마감으로 원문 없음)한 공고는 하루에 한 번만 다시 묻는다. */
export const CARE_DETAIL_RETRY_MS = 24 * 60 * 60 * 1000;

/**
 * 굴러가는 24시간 안에 워크넷 상세를 물어볼 수 있는 **전체** 상한(사용자별이 아니다 — 지키려는 것은 간호 크론과 나눠 쓰는 API 키의
 * 일일 한도다). 사람이 하루에 여는 공고는 수백 장을 넘기 어렵고, 1만 장을 긁는 스크레이퍼는 여기서 멈춘다(그 뒤는 저장된 값만 그린다).
 * 한도 실측값은 없다(UNVERIFIED) — 로그에 "[care] 상세 상한" 이 찍히기 시작하면 그때 조정한다.
 */
export const CARE_DETAIL_DAILY_CAP = 3000;

/**
 * 크롤러 UA 인가 — Next 의 userAgent().isBot 이 못 보는 것까지: 네이버(Yeti)·다음(Daumoa)·카카오 링크 미리보기(kakaotalk-scrap)·
 * ClaudeBot·Bytespider 등. 봇에게는 워크넷 상세를 묻지 않는다(저장된 값만 그린다).
 */
export const isCrawlerUa = (ua: string): boolean => /Yeti|Daum|kakaotalk-scrap|bot|crawl|spider|scrap/i.test(ua);

/**
 * 워크넷에 상세(본문·연락처)를 물어볼 차례인가.
 * detail_fetched_at 은 "마지막으로 물어본 시각"이다(실패도 찍는다 — 성공만 찍으면 장애 때 방문마다 타임아웃을 기다린다).
 * 본문이 있으면 다시 안 묻고, 비어 있으면 하루 지난 뒤 한 번 더 묻는다(이미지 공고는 영영 비어 있지만 하루 한 번은 값싸다).
 */
export function needsCareDetail(row: { description: string | null; detail_fetched_at: string | null }, nowMs: number): boolean {
  if (!row.detail_fetched_at) return true;
  if (row.description) return false;
  const last = new Date(row.detail_fetched_at).getTime();
  return !Number.isFinite(last) || nowMs - last >= CARE_DETAIL_RETRY_MS;
}

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
