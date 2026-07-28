/**
 * 구 널스넷 이관 스크립트 공용 유틸. 여기 모은 이유는 하나뿐이다 —
 * 페이징 루프를 스크립트마다 복제했더니 같은 버그가 3벌로 늘어났다(/review8 지적).
 *  · `order=` 가 없으면 Postgres 가 페이지 간 순서를 보장하지 않아 행이 조용히 빠진다.
 *  · `r.ok` 를 안 보면 에러 응답(객체)이 배열 자리에 들어와 루프가 터지거나 종료조건이 무너진다.
 * 나머지 중복(htmlToText 등)은 1회성이라 굳이 모으지 않는다.
 */

export const chunk = <T>(a: T[], n: number) =>
  Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** PostgREST 는 URL 이 길면 414 를 낸다. UUID 100개면 약 3.7KB — 게이트웨이 기본 버퍼(8KB) 안이다. */
export const IN_BATCH = 100;

export function restHeaders(key: string): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

/**
 * PostgREST 전체 조회. 정렬키를 반드시 받아 페이지 경계에서 행이 새지 않게 한다.
 * @param query select·필터까지 포함한 쿼리스트링(order/Range 는 여기서 붙인다)
 */
export async function fetchAllPages<T>(
  url: string,
  headers: Record<string, string>,
  table: string,
  query: string,
  orderBy: string,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const r = await fetch(`${url}/rest/v1/${table}?${query}&order=${orderBy}`, {
      headers: { ...headers, Range: `${from}-${from + pageSize - 1}` },
    });
    if (!r.ok) throw new Error(`${table} 조회 실패 ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const page = (await r.json()) as T[];
    if (!Array.isArray(page)) throw new Error(`${table} 조회 응답이 배열이 아님`);
    out.push(...page);
    if (page.length < pageSize) return out;
  }
}

/** legacy_member_srl → profiles.id */
export async function loadLegacyProfileMap(
  url: string,
  headers: Record<string, string>,
  extraFilter = "",
): Promise<Map<string, string>> {
  const rows = await fetchAllPages<{ id: string; legacy_member_srl: number }>(
    url, headers, "profiles",
    `select=id,legacy_member_srl&legacy_member_srl=not.is.null${extraFilter}`,
    "legacy_member_srl",
  );
  return new Map(rows.map((p) => [String(p.legacy_member_srl), p.id]));
}
