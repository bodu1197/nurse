// HTML 엔티티 디코드(순수 함수 — server-only 의존 없이 테스트 가능하게 worknet.ts에서 분리).
// ⚠️ 워크넷은 &amp; 를 **이중 인코딩**(&amp;amp;)해서 준다 — 한 번만 풀면 "신입&amp;경력"처럼
// &amp; 가 그대로 남는다(실측). 그래서 변화가 없을 때까지 반복한다(N중 인코딩 안전).
// &amp; 를 매 회 마지막에 풀어야 &amp;lt; → &lt; → < 처럼 중첩도 올바로 벗겨진다.
export const decodeEntities = (s: string): string => {
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  }
  return s;
};

/**
 * 응답 본문을 **선언된 문자셋으로** 디코드한다.
 *
 * 🔴 `res.text()` 는 무조건 UTF-8 로 읽는다. 국내 채용 사이트에는 아직 **EUC-KR** 이 흔하다
 *    (인재채움뱅크 = `Charset=EUC-KR`). 그대로 두면 한글이 전부 깨지는데, 링크·숫자는 ASCII 라
 *    멀쩡해 보인다 → **파서는 "공고 0건"만 돌려주고 실패로도 안 잡힌다**(실측: fetchedBoards 0,
 *    failedHosts 빈 배열). 그래서 헤더 → `<meta charset>` 순으로 문자셋을 읽어 맞춰 디코드한다.
 */
export function decodeHtml(buf: ArrayBuffer, contentType: string | null): string {
  const bytes = new Uint8Array(buf);
  // 앞부분만 ASCII 로 훑어 <meta charset> 을 찾는다(본문 디코드 전이라 한글은 아직 못 읽는다).
  const head = new TextDecoder("iso-8859-1").decode(bytes.subarray(0, 4096));
  const label = charsetOf(contentType ?? "") ?? charsetOf(head) ?? "utf-8";
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    // 모르는 문자셋 이름이면 UTF-8 로 읽는다 — 깨져도 수집이 멈추는 것보다는 낫다.
    return new TextDecoder("utf-8").decode(bytes);
  }
}

const charsetOf = (s: string): string | null =>
  s.match(/charset\s*=\s*["']?\s*([\w-]+)/i)?.[1]?.toLowerCase() ?? null;

/**
 * `decodeHtml` 을 쓰는 fetch 응답 읽기 — 스크레이퍼는 `res.text()` 대신 이걸 쓴다.
 * 🔴 크기 상한을 둔다. 남의 사이트가 주는 응답이라 우리가 크기를 못 정하는데, 상한이 없으면
 *    한 페이지가 커지는 것만으로 크론이 메모리로 죽는다(목록 HTML 은 실측 170KB).
 */
export async function readHtml(res: Response, maxBytes = 8 * 1024 * 1024): Promise<string> {
  const buf = await res.arrayBuffer();
  if (buf.byteLength > maxBytes) throw new Error(`응답이 너무 크다(${buf.byteLength}바이트)`);
  return decodeHtml(buf, res.headers.get("content-type"));
}
