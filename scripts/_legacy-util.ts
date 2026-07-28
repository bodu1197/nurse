/**
 * 구 널스넷 이관 스크립트 공용 유틸. 여기 모은 이유는 하나뿐이다 —
 * 페이징 루프를 스크립트마다 복제했더니 같은 버그가 3벌로 늘어났다(/review8 지적).
 *  · `order=` 가 없으면 Postgres 가 페이지 간 순서를 보장하지 않아 행이 조용히 빠진다.
 *  · `r.ok` 를 안 보면 에러 응답(객체)이 배열 자리에 들어와 루프가 터지거나 종료조건이 무너진다.
 * 나머지 중복(htmlToText 등)은 1회성이라 굳이 모으지 않는다.
 */

export const chunk = <T>(a: T[], n: number) =>
  Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/**
 * 라이믹스 본문 HTML → 평문. 새 앱은 이 값을 whitespace-pre-line 으로 그대로 렌더한다.
 *
 * 🔴 첫 줄(`>\s+<`)이 핵심이다. 원문이 `<p>A</p>\n\n<p>B</p>` 처럼 **태그 사이에 소스 개행**을 갖고 있어,
 *    그걸 지우지 않으면 `</p>` 변환분과 합쳐져 한 줄마다 빈 줄이 하나씩 끼어든다
 *    (실측: 자기소개 10줄이 빈 줄 10개와 함께 저장돼 화면에서 한 줄 읽고 스크롤해야 했다).
 *    의도적인 빈 줄(`<p><br></p>`)은 이 처리 뒤에도 남는다.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/>\s+</g, "><")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "· ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&")
    .replace(/ /g, " ") // NBSP — 눈에 안 보이는 공백이 줄 끝에 남아 지저분해진다
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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
