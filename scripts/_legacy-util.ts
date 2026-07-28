/**
 * 구 널스넷 이관 스크립트 공용 유틸. 여기 모은 이유는 하나뿐이다 —
 * 페이징 루프를 스크립트마다 복제했더니 같은 버그가 3벌로 늘어났다(/review8 지적).
 *  · `order=` 가 없으면 Postgres 가 페이지 간 순서를 보장하지 않아 행이 조용히 빠진다.
 *  · `r.ok` 를 안 보면 에러 응답(객체)이 배열 자리에 들어와 루프가 터지거나 종료조건이 무너진다.
 * 나머지 중복(htmlToText 등)은 1회성이라 굳이 모으지 않는다.
 */

export const chunk = <T>(a: T[], n: number) =>
  Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** 줄바꿈 예약 자리. 원문 개행과 구분해야 해서 본문에 나올 리 없는 제어문자를 쓴다. */
const NL_MARK = "";

/**
 * 라이믹스 본문 HTML → 평문. 새 앱은 이 값을 whitespace-pre-line 으로 그대로 렌더한다.
 *
 * 🔴 핵심은 **원문의 줄바꿈을 하나도 믿지 않는 것**이다. HTML 에서 소스 개행은 화면에 줄을 바꾸지
 *    않는다(그냥 공백이다). 그런데 라이믹스 본문은 `<p>A</p>\n\n<p>B</p>` 나 `…였으며,<br />\n간호사…`
 *    처럼 태그 주변에 개행을 잔뜩 갖고 있어, 그걸 남긴 채 `<br>`·`</p>` 를 줄바꿈으로 바꾸면
 *    한 줄마다 빈 줄이 하나씩 끼어든다(실측: 자기소개 10줄 → 빈 줄 10개. 한 줄 읽고 스크롤해야 했다).
 *
 *    그래서 순서가 중요하다: ① 줄을 바꾸는 태그만 자리표시자로 빼두고 → ② 남은 공백·개행을 전부
 *    공백 하나로 뭉갠 뒤 → ③ 자리표시자를 진짜 줄바꿈으로 되돌린다.
 *    의도적인 빈 줄(`<p><br></p>`)은 자리표시자가 연달아 나오므로 이 처리 뒤에도 남는다.
 */
export function htmlToText(html: string): string {
  return html
    .replaceAll(NL_MARK, "") // 만에 하나 원문에 있으면 자리표시자와 섞인다
    .replace(/<\s*br\s*\/?\s*>/gi, NL_MARK)
    .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, NL_MARK)
    .replace(/<\s*li[^>]*>/gi, "· ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&")
    .replace(/ /g, " ") // NBSP — 눈에 안 보이는 공백이 줄 끝에 남아 지저분해진다
    .replace(/\s+/g, " ")    // 원문 개행·들여쓰기를 공백 하나로(자리표시자는 \s 가 아니라 살아남는다)
    .split(NL_MARK).map((line) => line.trim()).join("\n")
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
