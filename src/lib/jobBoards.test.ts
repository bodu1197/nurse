import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMbank, fetchBoardJobs, labelOf, BOARDS, type Board } from "./jobBoards.ts";

/** 실제 인재채움뱅크 목록 마크업(2026-08-12). 회사명과 제목이 **다른 블록**에 있다. */
const HTML = `
<td><div class="tpNm"><span class="tx">의료법인춘혜의료재단(의)</span></div></td>
<td><div class="cttCntArea"><div class="txtBx"><div class="tpNm">
  <a href="/jobs/view.asp?id_num=19390197&chk_s=" class="tx">[명지춘혜재활병원] 진료협력센터 간호사(육아휴직대체)</a>
</div></div></div></td>
<td><div class="tpNm"><span class="tx">당당한방병원김해점</span></div></td>
<td><div class="cttCntArea"><div class="txtBx"><div class="tpNm">
  <a href="/jobs/view.asp?id_num=19390221&chk_s=" class="tx">[경남 김해] [원무] 당당한방병원 김해점 접수/수납 원무데스크 채용</a>
</div></div></div></td>
<td><div class="tpNm"><span class="tx">연세척병원</span></div></td>
<td><div class="cttCntArea"><div class="txtBx"><div class="tpNm">
  <a href="/jobs/view.asp?id_num=19390150" class="tx">연세척병원 병동간호사 선생님 구인 합니다(3교대) / 육아휴직대체</a>
</div></div></div></td>`;

test("회사명과 제목을 행마다 짝지어 읽는다", () => {
  const rows = parseMbank(HTML);
  assert.equal(rows.length, 2, "원무데스크 공고는 담지 않는다");
  assert.equal(rows[0].id, "mbank-19390197");
  assert.equal(rows[0].company, "의료법인춘혜의료재단(의)");
  assert.match(rows[0].title, /진료협력센터 간호사/);
  assert.equal(rows[0].url, "https://matchingbank.career.co.kr/jobs/view.asp?id_num=19390197");
});

/**
 * 🔴 사이트의 직종 필터(jc=M003 = 간호사·간호조무사)를 믿으면 안 된다.
 *    실측에서 원무·물리치료사가 섞여 왔다. 우리가 제목으로 한 번 더 거른다.
 */
test("직종 필터를 통과해 온 비간호 공고를 걸러낸다", () => {
  const titles = parseMbank(HTML).map((r) => r.title);
  assert.ok(!titles.some((t) => /원무데스크/.test(t)));
});

/**
 * 🔴 회사명과 제목 사이를 탐욕적으로 매칭하면 **앞 회사명이 뒤 공고에 붙는다** —
 *    간호사 공고에 엉뚱한 병원 이름이 찍히는 종류의 버그다. 최소 일치여야 한다.
 */
test("앞 행의 회사명이 뒤 공고에 새지 않는다", () => {
  const rows = parseMbank(HTML);
  assert.equal(rows[1].company, "연세척병원");
  assert.notEqual(rows[1].company, "당당한방병원김해점");
});

/**
 * 🔴 등기명("삼정의료재단포항여성병원")은 ① 카드에 그대로 찍히면 못 읽고 ② 명부와 이름이 안 맞아
 *    종별·지역·좌표가 통째로 빈다 = 「내 주변」에서 빠진다. 제목의 대괄호 이름을 쓴다.
 */
test("제목 앞 대괄호에서 부를 만한 병원명을 뽑는다", () => {
  const r = labelOf("[포항여성병원]신생아실 간호사 채용", "삼정의료재단포항여성병원");
  assert.equal(r.label, "포항여성병원");
  assert.equal(r.rest, "신생아실 간호사 채용");
  // 공백이 섞인 실제 표기도 잡는다.
  assert.equal(labelOf("[ 서울대학교치과병원 ] 촉탁간호직 채용", "서울대학교치과병원").label, "서울대학교치과병원");
});

/** 🔴 같은 자리에 지역 태그가 온다 — 이걸 병원명으로 쓰면 카드에 "경남 김해" 가 찍히고 명부 조회도 헛돈다. */
test("지역 태그는 병원명으로 쓰지 않고 제목에 남긴다", () => {
  const r = labelOf("[경남 김해] 병동 간호사 모집", "당당한방병원김해점");
  assert.equal(r.label, "당당한방병원김해점");
  assert.equal(r.rest, "[경남 김해] 병동 간호사 모집");
});

/** 병원류 접미가 아니어도 회사명과 사실상 같은 이름이면(띄어쓰기·괄호만 차이) 기관명으로 친다. */
test("띄어쓰기만 다른 기관명도 걷어낸다", () => {
  assert.equal(labelOf("[중증장애인요양시설송죽원] 간호사 채용", "중증장애인요양시설 송죽원").rest, "간호사 채용");
  assert.equal(labelOf("[에이스산업보건연구소 (주) ] 보건관리 간호사", "에이스산업보건연구소 주식회사").rest, "보건관리 간호사");
});

test("대괄호가 없으면 회사명을 그대로 쓴다", () => {
  assert.deepEqual(labelOf("중환자실 3교대 간호사 모집", "더필병원"), {
    label: "더필병원",
    rest: "중환자실 3교대 간호사 모집",
  });
});

test("파서가 label 로 제목의 병원명 중복을 걷어낸다", () => {
  const rows = parseMbank(HTML);
  assert.equal(rows[0].label, "명지춘혜재활병원");
  assert.equal(rows[0].title, "진료협력센터 간호사(육아휴직대체)");
  assert.equal(rows[0].company, "의료법인춘혜의료재단(의)", "명부 2순위로 쓸 등기명도 남긴다");
});

test("간호조무사 공고는 조무직으로 가른다", () => {
  const html = `<span class="tx">e포근한요양원</span>
    <a href="/jobs/view.asp?id_num=1" class="tx">[e포근한요양원] 간호조무사(휴직대체) 채용</a>`;
  assert.equal(parseMbank(html)[0].jobCategory, "간호조무직");
});

test("같은 공고번호는 한 번만 담는다", () => {
  assert.equal(parseMbank(HTML + HTML).length, 2);
});

/**
 * 🔴 부르는 쪽(sync-ats)은 목록에 없는 공고를 마감 처리한다. 사이트가 죽었을 때 그것을
 *    "공고 없음" 으로 넘기면 이 출처의 공고가 통째로 사라진다 — 반드시 실패를 돌려줘야 한다.
 */
test("사이트가 죽으면 실패로 알린다", async () => {
  const b: Board = { key: "x", label: "테스트", pageUrl: () => "http://x", maxPages: 3 };
  const { jobs, failed } = await fetchBoardJobs([b], async () => { throw new Error("마크업 변경"); });
  assert.equal(jobs.length, 0);
  assert.deepEqual(failed, ["x"]);
});

/** 마지막 쪽을 넘기면 같은 목록을 다시 준다 — 새 공고가 없으면 멈춰야 무한 반복을 안 한다. */
test("새 공고가 없는 쪽을 만나면 멈춘다", async () => {
  const b: Board = { key: "x", label: "테스트", pageUrl: () => "http://x", maxPages: 5 };
  let calls = 0;
  const { jobs } = await fetchBoardJobs([b], async () => { calls++; return parseMbank(HTML); });
  assert.equal(jobs.length, 2);
  assert.equal(calls, 2, "1쪽에서 담고 2쪽에서 새 공고 0건을 보고 멈춘다");
});

/**
 * 🔴 링크 검사만으로는 못 막는 구멍 — **회사명 쪽 마크업만 바뀌면** 링크는 그대로라 검사를 통과하고
 *    파서만 0건을 돌려준다. 그걸 빈 결과로 넘기면 부르는 쪽이 이 출처 공고를 **전부 마감**시킨다.
 */
test("1쪽에서 한 건도 못 읽으면 실패로 알린다", async () => {
  const b: Board = { key: "x", label: "테스트", pageUrl: () => "http://x", maxPages: 5 };
  const { jobs, failed } = await fetchBoardJobs([b], async () => []);
  assert.equal(jobs.length, 0);
  assert.deepEqual(failed, ["x"], "0건을 '공고 없음' 으로 넘기면 안 된다");
});

/**
 * 🔴 목록 끝(2쪽 이후 빈 목록)을 실패로 치면 **정상인데 늘 실패로 보고**되고, 부르는 쪽이
 *    마감 처리를 영영 건너뛴다. 끝난 것과 깨진 것은 다르다.
 */
test("마지막 쪽 다음의 빈 목록은 실패가 아니다", async () => {
  const b: Board = { key: "x", label: "테스트", pageUrl: () => "http://x", maxPages: 5 };
  const { jobs, failed } = await fetchBoardJobs([b], async (_b, p) => (p === 1 ? parseMbank(HTML) : []));
  assert.equal(jobs.length, 2);
  assert.deepEqual(failed, [], "2쪽이 비었다고 실패로 올리면 안 된다");
});

test("BOARDS 의 key 에 하이픈이 없다 — external_id 접두이자 마감 범위다", () => {
  for (const b of BOARDS) assert.doesNotMatch(b.key, /-/);
});
