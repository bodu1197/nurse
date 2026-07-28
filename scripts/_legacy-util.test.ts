/**
 * htmlToText 자체 점검. `node scripts/_legacy-util.test.ts` — 실패하면 그 자리에서 멈춘다.
 *
 * 왜 이것만 테스트하는가: 이 함수 하나 때문에 본문을 두 번 다시 손봤다.
 *   ① `<p>A</p>\n\n<p>B</p>` 의 태그 사이 개행 → 자기소개마다 빈 줄이 한 줄씩(오너 신고)
 *   ② `…였으며,<br />\n간호사…` 의 br 뒤 개행 → 게시판 글마다 같은 증상
 * 눈으로 훑어서는 못 잡는 종류라, 두 경우를 못 박아 둔다.
 */
import { strict as assert } from "node:assert";
import { htmlToText } from "./_legacy-util.ts";

const cases: Array<[string, string, string]> = [
  ["br 뒤 소스 개행은 빈 줄이 아니다", "<p>가나<br />\n다라</p>", "가나\n다라"],
  ["문단 사이 소스 개행은 빈 줄이 아니다", "<p>A</p>\n\n<p>B</p>", "A\nB"],
  ["의도적 빈 줄은 남는다", "<p>A</p>\n<p><br></p>\n<p>B</p>", "A\n\nB"],
  ["문단 안의 개행은 공백", "<p>첫줄\n둘째줄</p>", "첫줄 둘째줄"],
  ["목록은 · 로", "<ul>\n<li>하나</li>\n<li>둘</li>\n</ul>", "· 하나\n· 둘"],
  ["엔티티 복원", "<p>A &amp; B &lt;C&gt; &quot;D&quot;</p>", 'A & B <C> "D"'],
  ["nbsp 만 있는 문단은 빈 줄", "<p>A<br />\n&nbsp;</p>\n\n<p>B</p>", "A\n\nB"],
  ["빈 입력", "", ""],
];

for (const [name, input, want] of cases) {
  assert.equal(htmlToText(input), want, `${name}\n  받음: ${JSON.stringify(htmlToText(input))}\n  기대: ${JSON.stringify(want)}`);
}
console.log(`✔ htmlToText ${cases.length}건 통과`);
