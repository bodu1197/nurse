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
