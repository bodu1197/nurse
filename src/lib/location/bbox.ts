/**
 * 📍 "내 주변" bounding-box — 원(하버사인) 대신 **정사각형 근사**.
 *
 * 반경 안이냐만 거르고 거리순 정렬은 하지 않는다(오너 확정 2026-08-02, talent 의 applyJobFilters 이식).
 * box 는 .gte/.lte 범위 스캔으로 (lat, lng) 인덱스를 탄다. 채용공고 목록(getJobs — 간호·요양·간병 공용)이
 * **이 식 하나**를 쓴다 — 두 곳에 따로 적으면 한쪽만 고쳐져 같은 반경이 두 화면에서 다른 넓이가 된다.
 */
export type NearQuery = { lat: number; lng: number; radiusM: number };

const KM_PER_DEG_LAT = 111.32; // 위도 1도 ≈ 111.32km(경도는 위도에 따라 cos 보정)

export function nearBox(near: NearQuery): { latMin: number; latMax: number; lngMin: number; lngMax: number } {
  const radiusKm = near.radiusM / 1000;
  const dLat = radiusKm / KM_PER_DEG_LAT;
  // 극지방에서 cos 이 0 에 가까워져 경도 폭이 무한대로 터지는 것만 막는다(한국 위도에선 0.79 쯤).
  const cosLat = Math.max(0.01, Math.cos((near.lat * Math.PI) / 180));
  const dLng = radiusKm / (KM_PER_DEG_LAT * cosLat);
  return { latMin: near.lat - dLat, latMax: near.lat + dLat, lngMin: near.lng - dLng, lngMax: near.lng + dLng };
}
