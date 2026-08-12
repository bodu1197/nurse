/**
 * 공고를 저장할 때 좌표를 다시 잡을지, 있던 것을 지킬지.
 *
 * 🔴 종전에는 저장할 때마다 지오코딩하고 `coords?.lat ?? null` 로 덮어썼다. 그래서 병원이
 *    **제목만 고쳐 저장했는데** 그 순간 지오코딩이 삐끗하면(한도 초과·일시 오류) 멀쩡하던
 *    좌표가 지워지고, 그 공고가 「내 주변」에서 조용히 사라졌다.
 *
 * 규칙은 둘뿐이다:
 *   · 주소가 그대로면 → **건드리지 않는다**(외부 호출도 안 한다 = 실패할 일이 없다)
 *   · 주소가 바뀌었으면 → 새로 잡고, 실패하면 **비운다**
 *     (옛 주소의 좌표를 새 주소에 남겨두는 것이 더 나쁜 거짓말이다)
 */
export type Coords = { lat: number; lng: number } | null;

export function keepOrReplaceCoords(
  moved: boolean,
  fresh: Coords,
  prev: Readonly<{ lat: number | null; lng: number | null }>,
): { lat: number | null; lng: number | null } {
  if (!moved) return { lat: prev.lat, lng: prev.lng };
  return { lat: fresh?.lat ?? null, lng: fresh?.lng ?? null };
}

/** 주소가 실제로 바뀌었는가. 앞뒤 공백·빈 문자열 차이로 "바뀌었다" 고 오판하지 않는다. */
export const addressMoved = (before: string | null | undefined, after: string | null | undefined): boolean =>
  (before ?? "").trim() !== (after ?? "").trim();
